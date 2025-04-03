import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

export interface HandlerServiceProps {
  /**
   * The ECS cluster to deploy to
   */
  cluster: ecs.ICluster;

  /**
   * The ECS namespace to register with
   */
  namespace: servicediscovery.IPrivateDnsNamespace;

  /**
   * The Docker image asset for the Handler
   */
  handlerImage: ecr_assets.DockerImageAsset;

  /**
   * The number of handler instances to run
   */
  desiredCount: number;
}

// The port the handler listens on for HTTP requests
const handlerPort = 8080;

/**
 * A Handler ECS service
 */
export class HandlerService extends Construct implements ec2.IConnectable {
  /**
   * The endpoint for connecting to the handler
   */
  public readonly endpoint: string;

  /**
   * Implements IConnectable for security group access control
   */
  public connections: ec2.Connections;

  constructor(scope: Construct, id: string, props: HandlerServiceProps) {
    super(scope, id);

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task', {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromDockerImageAsset(props.handlerImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'handler' }),
      portMappings: [{ containerPort: handlerPort }],
      command: ['start'],
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://[::]:${handlerPort}/health || exit 1`],
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(3),
        retries: 3,
        startPeriod: cdk.Duration.seconds(3),
      },
    });

    const service = new ecs.FargateService(this, 'Default', {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      cloudMapOptions: {
        name: 'handler',
        dnsRecordType: servicediscovery.DnsRecordType.A,
        cloudMapNamespace: props.namespace,
      },
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE_SPOT', weight: 1 }],
      minHealthyPercent: 0,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    this.connections = service.connections;

    this.endpoint = `handler.${props.namespace.namespaceName}:${handlerPort}`;
  }
}
