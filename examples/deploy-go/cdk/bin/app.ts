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
    });
  }
}

const app = new cdk.App();
new DemoEnvironment(app, 'Demo');
