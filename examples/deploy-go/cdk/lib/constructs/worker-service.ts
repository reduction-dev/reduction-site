import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface WorkerServiceProps {
  /**
   * The ECS cluster to deploy to
   */
  cluster: ecs.ICluster;

  /**
   * The Docker image asset for the Reduction
   */
  reductionImage: ecr_assets.DockerImageAsset;

  /**
   * The handler service endpoint including the port
   */
  handlerEndpoint: string;

  /**
   * The job manager service endpoint (hostname or IP)
   */
  jobManagerEndpoint: string;

  /**
   * The number of workers to run
   */
  workerCount: number;

  /**
   * The shared Reduction cluster security group
   */
  securityGroup: ec2.ISecurityGroup;
}

/**
 * An ECS Worker Service
 */
export class WorkerService extends Construct implements ec2.IConnectable, iam.IGrantable {
  public readonly connections: ec2.Connections;
  public readonly service: ecs.FargateService;
  public readonly grantPrincipal: iam.IPrincipal;

  constructor(scope: Construct, id: string, props: WorkerServiceProps) {
    super(scope, id);

    // Create worker task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    taskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(props.reductionImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker' }),
      portMappings: [{ containerPort: 80, name: 'worker' }],
      command: ['worker',
        '--job-addr', props.jobManagerEndpoint,
        '--handler-addr', props.handlerEndpoint,
        '--port',  '80'],
    });

    this.service = new ecs.FargateService(this, 'Default', {
      cluster: props.cluster,
      securityGroups: [props.securityGroup],
      taskDefinition,
      desiredCount: props.workerCount,
      minHealthyPercent: 0,
      enableExecuteCommand: true,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      }],
      serviceConnectConfiguration: {},
    });
    this.connections = this.service.connections;
    this.grantPrincipal = taskDefinition.taskRole;
  }
}
