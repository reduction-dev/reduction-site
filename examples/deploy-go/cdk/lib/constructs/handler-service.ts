import assert from 'assert';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface HandlerServiceProps {
  /**
   * The ECS cluster to deploy to
   */
  cluster: ecs.ICluster;

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
 * A Handler ECS service.
 *
 * The handler service is the user-defined service that the Reduction engine
 * calls.
 */
export class HandlerService extends Construct implements ec2.IConnectable {
  /**
   * The endpoint for connecting to the handler
   */
  public readonly endpoint: string;

  /**
   * Implements IConnectable for security group access control
   */
  public readonly connections: ec2.Connections;

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
      portMappings: [{ containerPort: handlerPort, name: 'handler' }],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'Handler',
        logGroup: new logs.LogGroup(this, 'LogGroup', {
          logGroupName: 'Handler',
          retention: logs.RetentionDays.ONE_DAY,
        }),
      }),
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
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE_SPOT', weight: 1 }],
      enableExecuteCommand: true,
      minHealthyPercent: 0,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      serviceConnectConfiguration: {
        services: [{ portMappingName: 'handler' }],
      },
    });
    this.connections = service.connections;

    assert(props.cluster.defaultCloudMapNamespace, 'Default Cloud Map namespace not set on cluster');
    this.endpoint = `handler.${props.cluster.defaultCloudMapNamespace?.namespaceName}:${handlerPort}`;
  }
}
