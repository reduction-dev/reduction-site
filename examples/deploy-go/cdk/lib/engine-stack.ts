import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

interface EngineStackProps extends cdk.StackProps {
  jobConfigPath: string;
}

export class EngineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EngineStackProps) {
    super(scope, id, props);

    // Use default VPC
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

    // Create an S3 bucket that can be deleted
    const bucket = new s3.Bucket(this, 'Storage', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'JobCluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // Use the local reduction Dockerfile
    const reductionImage = new ecr_assets.DockerImageAsset(this, 'ReductionImage', {
      directory: '../../../../reduction',
      file: 'Dockerfile',

      buildArgs: {
        TARGET_ARCH: 'arm64',
      },
    });

    // Create engine task definition which will run the job manager and worker
    const engineTask = new ecs.FargateTaskDefinition(this, 'EngineTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    bucket.grantReadWrite(engineTask.taskRole);

    // Upload the job config to S3 as a CDK asset
    const jobConfigAsset = new Asset(this, "JobConfig", {
      path: props.jobConfigPath,
    });
    jobConfigAsset.grantRead(engineTask.taskRole);

    engineTask.addContainer('JobManagerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(reductionImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'job-manager' }),
      portMappings: [{ containerPort: 8080 }, { containerPort: 8081 }],
      command: ['job', jobConfigAsset.s3ObjectUrl],
      environment: {
        REDUCTION_PARAM_STORAGE_PATH: bucket.s3UrlForObject("/working-storage"),
        REDUCTION_PARAM_KINESIS_STREAM_ARN: "",
      }
    });

    engineTask.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(reductionImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker' }),
      command: ['worker',
        '--job-addr', 'localhost:8081',
        '--handler-addr', 'handler.reduction.local:8080',
      ],
    });

    // Create engine service with service discovery
    new ecs.FargateService(this, 'EngineService', {
      cluster,
      taskDefinition: engineTask,
      desiredCount: 1,
      minHealthyPercent: 0,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      }],
    });
  }
}
