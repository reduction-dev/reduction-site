import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as crs from 'aws-cdk-lib/custom-resources';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { EngineService } from './constructs/engine-service';
import { HandlerService } from './constructs/handler-service';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';

interface ReductionStackProps extends cdk.StackProps {
  jobConfigPath: string;
  handlerDockerDir: string;
  reductionDockerDir: string;
}

export class ReductionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReductionStackProps) {
    super(scope, id, props);

    // An s3 asset for the job.json config
    const jobConfigAsset = new s3_assets.Asset(this, 'JobConfig', {
      path: props.jobConfigPath,
    });

    // A bucket to use for Reduction's working storage
    const bucket = new s3.Bucket(this, 'Storage', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // A Kinesis stream to use for demo input
    const sourceStream = new kinesis.Stream(this, 'WordCountStream', {
      streamName: 'WordCountStream',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Put some demo data in the kinesis stream when deploying
    const cr = new crs.AwsCustomResource(this, 'SendKinesisMessageResource', {
      onUpdate: {
        service: 'Kinesis',
        action: 'putRecord',
        parameters: {
          Data: stoppingByWoods,
          PartitionKey: '1',
          StreamARN: sourceStream.streamArn,
        },
        physicalResourceId: crs.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: crs.AwsCustomResourcePolicy.fromSdkCalls({
        resources: crs.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    sourceStream.grantReadWrite(cr);

    // The ECS cluster for the Reduction engine and the handler
    const cluster = new ecs.Cluster(this, 'JobCluster', {
      vpc: ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true }),
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // A CloudMap namespace to let the engine call handler instances
    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'ReductionNamespace', {
      name: 'reduction.local',
      vpc: cluster.vpc,
    });

    // The user-defined handler service
    const handlerService = new HandlerService(this, 'Handler', {
      cluster,
      namespace,
      handlerImage: new ecr_assets.DockerImageAsset(this, 'HandlerImage', {
        directory: props.handlerDockerDir,
        buildArgs: { TARGET_ARCH: 'arm64' },
      }),
      desiredCount: 1,
    });

    // The Reduction engine service that calls the handler
    const engineService = new EngineService(this, 'Engine', {
      cluster,
      bucket,
      sourceStream,
      jobConfigAsset,
      handlerEndpoint: handlerService.endpoint,
      reductionImage: new ecr_assets.DockerImageAsset(this, 'ReductionImage', {
        directory: props.reductionDockerDir,
        buildArgs: { TARGET_ARCH: 'arm64' },
      }),
      workerCount: 1,
    });
    handlerService.connections.allowFrom(engineService, ec2.Port.allTcp());
  }
}

// Some demo data for word counting
const stoppingByWoods = `
Whose woods these are I think I know.
His house is in the village though;
He will not see me stopping here
To watch his woods fill up with snow.
My little horse must think it queer
To stop without a farmhouse near
Between the woods and frozen lake
The darkest evening of the year.
He gives his harness bells a shake
To ask if there is some mistake.
The only other sound's the sweep
Of easy wind and downy flake.
The woods are lovely, dark and deep,
But I have promises to keep,
And miles to go before I sleep,
And miles to go before I sleep.
`;
