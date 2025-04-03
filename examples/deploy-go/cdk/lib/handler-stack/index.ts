import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import path = require('path');

export interface RxnHandler {
  connect(connectable: ec2.IConnectable): void;
  hostname: string;
}

export class HandlerStack extends cdk.Stack {
  public jobConfigPath: string;
  public service: RxnHandler;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Use default VPC
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'HandlerCluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // Create CloudMap namespace for service discovery
    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'HandlerNamespace', {
      name: 'reduction.local',
      vpc,
      description: 'Namespace for handler services',
    });

    // Build the Go executable for ARM
    // TODOD: Probably should build in the Dockerfile
    Bun.spawnSync(['go', 'build', '-o', path.join(__dirname, 'deploy-go')], {
      cwd: '../',
      env: { ...process.env, GOOS: 'linux', GOARCH: 'arm64' },
      onExit: (_proc, exitCode, _signalCode, error) => {
        if (exitCode !== 0) {
          throw new Error(`Failed to build Go executable: ${error}`);
        }
      }
    });

    // Create a Docker image with the deploy-go binary
    const handlerImage = new ecr_assets.DockerImageAsset(this, 'HandlerImage', {
      directory: __dirname,
      file: 'Dockerfile',
    });

    // Create the job config file
    this.jobConfigPath = `${__dirname}/job.json`;
    const jobConfigFile = Bun.file(this.jobConfigPath);
    Bun.spawnSync(['go', 'run', 'main.go', 'config'], {
      cwd: '../',
      stdout: jobConfigFile,
      onExit: (_proc, exitCode, _signalCode, error) => {
        if (exitCode !== 0) {
          throw new Error(`Failed to build job.json: ${error}`);
        }
      },
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'HandlerTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    taskDefinition.addContainer('HandlerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(handlerImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'handler' }),
      portMappings: [{ containerPort: 8080 }],
      command: ['start'],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://[::]:8080/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(3),
        retries: 3,
        startPeriod: cdk.Duration.seconds(3),
      },
    });

    // Create handler service with service discovery
    const service = new ecs.FargateService(this, 'HandlerService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      cloudMapOptions: {
        name: 'handler',
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
      },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      }],
      minHealthyPercent: 0,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    this.service = {
      connect: (connectable: ec2.IConnectable) => {
        connectable.connections.allowTo(service, ec2.Port.tcp(8080));
      },
      hostname: `handler.${namespace.namespaceName}:8080`,
    }
  }
}
