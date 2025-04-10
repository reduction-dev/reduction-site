import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { JobManagerService } from './constructs/job-manager-service';
import { WorkerService } from './constructs/worker-service';
import { HandlerService } from './constructs/handler-service';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';

interface ReductionStackProps extends cdk.StackProps {
  jobConfigPath: string;
  handlerDockerDir: string;
  reductionDockerDir: string;
  workerCount: number;
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
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // A Kinesis stream to use for demo input
    const sourceStream = new kinesis.Stream(this, 'WordCountStream', {
      streamName: 'WordCountStream',
    });

    // The ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true }),
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      defaultCloudMapNamespace: {
        name: 'reduction.local',
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
        useForServiceConnect: true,
      }
    });

    // A shared security group for Reduction services
    const rxnSecurityGroup = new ec2.SecurityGroup(this, 'ReductionSecurityGroup', {
      vpc: cluster.vpc,
      description: 'Security group for Reduction services',
    });
    rxnSecurityGroup.addIngressRule(rxnSecurityGroup, ec2.Port.allTraffic(), 'Allow all communication between Reduction services');

    // The user-defined handler service
    const handlerService = new HandlerService(this, 'Handler', {
      cluster,
      handlerImage: new ecr_assets.DockerImageAsset(this, 'HandlerImage', {
        directory: props.handlerDockerDir,
        buildArgs: { TARGET_ARCH: 'arm64' },
      }),
      desiredCount: 1,
    });

    // Create Reduction image asset to be used by both services
    const reductionImage = new ecr_assets.DockerImageAsset(this, 'ReductionImage', {
      directory: props.reductionDockerDir,
      buildArgs: { TARGET_ARCH: 'arm64' },
    });

    // The Reduction job manager service
    const jobManagerService = new JobManagerService(this, 'JobManager', {
      cluster,
      bucket,
      sourceStream,
      jobConfigAsset,
      reductionImage,
      workerCount: props.workerCount,
      securityGroup: rxnSecurityGroup,
    });

    // The Reduction worker service that calls the handler
    const workerService = new WorkerService(this, 'Worker', {
      cluster,
      securityGroup: rxnSecurityGroup,
      reductionImage,
      handlerEndpoint: handlerService.endpoint,
      jobManagerEndpoint: jobManagerService.endpoint,
      workerCount: props.workerCount,
    });
    sourceStream.grantRead(workerService);

    // ServiceConnect requires dependency ordering between services
    workerService.node.addDependency(jobManagerService);

    // Allow the workers to call the handler service
    handlerService.connections.allowFrom(workerService, ec2.Port.allTcp());

    // Export the stream name to use in the record sending script
    new cdk.CfnOutput(this, 'SourceStreamName', {
      value: sourceStream.streamName,
      description: 'Name of the Kinesis stream for word count demo',
    });
  }
}
