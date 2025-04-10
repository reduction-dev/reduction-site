#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReductionStack } from '../lib/reduction-stack';
import * as path from 'path';
import { CustomResourceConfig } from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { IAspect } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';

// snippet-start: build-handler
// Build the Go executable for ARM
const buildProc = Bun.spawnSync(['go', 'build', '-o', 'deploy-go'], {
  cwd: '../',
  env: { ...process.env, GOOS: 'linux', GOARCH: 'arm64' },
});
if (!buildProc.success) {
  throw new Error(`Failed to build handler: ${buildProc.stderr}`);
}
// snippet-end: build-handler

// snippet-start: write-config
// Write the handler's job.config file
const configProc = Bun.spawnSync(['go', 'run', 'main.go', 'config'], { cwd: '../' });
if (!configProc.success) {
  throw new Error(`Failed to build job.json: ${configProc.stderr}`);
}
const jobConfigPath = path.resolve('../job.json');
await Bun.write(jobConfigPath, configProc.stdout);
// snippet-end: write-config

const app = new cdk.App();

new ReductionStack(app, 'ReductionWordCountDemo', {
  env: { account: "619071318835", region: "us-east-2" },

  // The number of reduction worker instances to run
  workerCount: 2,

  // A local file path to the job.json config
  jobConfigPath,

  // The handler Dockerfile is in this example directory
  handlerDockerDir: path.resolve('..'),

  // The reduction Dockerfile is in a go workspace sibling directory
  reductionDockerDir: path.resolve('../../../../reduction'),
});

// Set all retain policies to destroy
class DestroyPolicyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}
cdk.Aspects.of(app).add(new DestroyPolicyAspect());

// Set low retention on CDK's built-in customer resources (default INFINITE)
CustomResourceConfig.of(app).addLogRetentionLifetime(logs.RetentionDays.ONE_DAY);


