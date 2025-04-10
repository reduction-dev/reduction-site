import assert from 'assert';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

export interface JobManagerServiceProps {
  /**
   * The ECS cluster to deploy to
   */
  cluster: ecs.ICluster;

  /**
   * The Docker image asset for the Reduction
   */
  reductionImage: ecr_assets.DockerImageAsset;

  /**
   * S3 bucket for checkpoints
   */
  bucket: s3.IBucket;

  /**
   * The job configuation S3 asset
   */
  jobConfigAsset: s3_assets.Asset;

  /**
   * Kinesis stream for job source data
   */
  sourceStream: kinesis.IStream;

  /**
   * The number of workers to run
   */
  workerCount: number;

  /**
   * The shared Reduction cluster security group
   */
  securityGroup: ec2.ISecurityGroup;
}

// The port the job manager listens on for worker communication
const jobRpcPort = 8081;

/**
 * An ECS Job Manager service
 */
export class JobManagerService extends Construct implements ec2.IConnectable {
  public readonly connections: ec2.Connections;
  public readonly endpoint: string;

  constructor(scope: Construct, id: string, props: JobManagerServiceProps) {
    super(scope, id);

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task', {
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    props.bucket.grantReadWrite(taskDefinition.taskRole);
    props.jobConfigAsset.grantRead(taskDefinition.taskRole);
    props.sourceStream.grantRead(taskDefinition.taskRole);

    taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromDockerImageAsset(props.reductionImage),
      portMappings: [{ containerPort: jobRpcPort, name: 'job-rpc' }],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'JobManager',
        logGroup: new logs.LogGroup(this, 'LogGroup', {
          logGroupName: 'JobManager',
          retention: logs.RetentionDays.ONE_DAY,
        }),
      }),
      command: ['job', props.jobConfigAsset.s3ObjectUrl],
      environment: {
        REDUCTION_PARAM_STORAGE_PATH: props.bucket.s3UrlForObject("/working-storage"),
        REDUCTION_PARAM_WORKER_COUNT: props.workerCount.toString(),
        REDUCTION_PARAM_KINESIS_STREAM_ARN: props.sourceStream.streamArn,
      },
    });

    const service = new ecs.FargateService(this, 'Default', {
      cluster: props.cluster,
      securityGroups: [props.securityGroup],
      taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      enableExecuteCommand: true,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      }],
      serviceConnectConfiguration: {
        services: [{ portMappingName: 'job-rpc' }],
      },
    });
    this.connections = service.connections;

    // Store the endpoint for other services to use
    assert(props.cluster.defaultCloudMapNamespace, "Cluster must have a default Cloud Map namespace");
    this.endpoint = `job-rpc.${props.cluster.defaultCloudMapNamespace?.namespaceName}:${jobRpcPort}`;
  }
}
