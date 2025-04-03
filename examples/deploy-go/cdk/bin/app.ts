#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EngineStack } from '../lib/engine-stack';
import { HandlerStack } from '../lib/handler-stack';
import { Construct } from 'constructs';

class DemoEnvironment extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const env = { account: "619071318835", region: "us-east-2" };

    const handler = new HandlerStack(this, 'Handler', { env });
    new EngineStack(this, 'Engine', {
      env,
      jobConfigPath: handler.jobConfigPath,
      handlerService: handler.service,
    });
  }
}

const app = new cdk.App();
new DemoEnvironment(app, 'Demo');

cdk.Annotations.of(app).acknowledgeWarning(
  "@aws-cdk/aws-ec2:ipv4IgnoreEgressRule",
  [
    "long-standing CDK issue: ",
    "- https://github.com/aws/aws-cdk/issues/9565",
    "- https://github.com/aws/aws-cdk/issues/9740",
    "- https://github.com/aws/aws-cdk/issues/24109",
    "- "
  ].join("\n"))
