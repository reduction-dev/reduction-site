import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

export interface EngineServiceProps {
  /**
   * The ECS cluster to deploy to
   */
  cluster: ecs.ICluster;

  /**
   * S3 bucket for checkpoint and DKV storage
   */
  bucket: s3.IBucket;

  /**
   * The Docker image asset for the Reduction
   */
  reductionImage: ecr_assets.DockerImageAsset;

  /**
   * The job configuation S3 asset
   */
  jobConfigAsset: s3_assets.Asset;

  /**
   * The handler service endpoint including the port
   */
  handlerEndpoint: string;

  /**
   * Kinesis stream for job source data
   */
  sourceStream: kinesis.IStream;

  /**
   * The number of workers to run
   */
  workerCount: number;
}

// The port the job manager listens on for worker communication
const jobRpcPort = 8081;

/**
 * An ECS Reduction Engine service
 *
 * This deploys cheaply with spot instances, ARM architecture, and the lowest
 * CPU and memory settings for Fargate.
 */
export class EngineService extends Construct implements ec2.IConnectable {
  public readonly connections: ec2.Connections;

  constructor(scope: Construct, id: string, props: EngineServiceProps) {
    super(scope, id);

    // Create engine task definition to run the job manager and worker
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'EngineTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    props.bucket.grantReadWrite(taskDefinition.taskRole);
    props.jobConfigAsset.grantRead(taskDefinition.taskRole);
    props.sourceStream.grantRead(taskDefinition.taskRole);

    taskDefinition.addContainer('JobManagerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(props.reductionImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'job-manager' }),
      portMappings: [{ containerPort: jobRpcPort }],
      command: ['job', props.jobConfigAsset.s3ObjectUrl],
      environment: {
        REDUCTION_PARAM_STORAGE_PATH: props.bucket.s3UrlForObject("/working-storage"),
        REDUCTION_PARAM_WORKER_COUNT: props.workerCount.toString(),
        REDUCTION_PARAM_KINESIS_STREAM_ARN: props.sourceStream.streamArn,
      },
    });

    taskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(props.reductionImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker' }),
      command: ['worker',
        '--job-addr', `localhost:${jobRpcPort}`,
        '--handler-addr', props.handlerEndpoint],
    });

    const service = new ecs.FargateService(this, 'Default', {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: props.workerCount,
      minHealthyPercent: 0,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      }],
    });
    this.connections = service.connections;
  }
}
