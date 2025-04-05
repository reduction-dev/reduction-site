#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReductionStack } from '../lib/reduction-stack';
import * as path from 'path';

// Build the Go executable for ARM
Bun.spawnSync(['go', 'build', '-o', 'deploy-go'], {
  cwd: '../',
  env: { ...process.env, GOOS: 'linux', GOARCH: 'arm64' },
  onExit: (_proc, exitCode, _signalCode, error) => {
    if (exitCode !== 0) {
      throw new Error(`Failed to build Go executable: ${error}`);
    }
  }
});

// Write the handler's job.config file
const result = Bun.spawnSync(['go', 'run', 'main.go', 'config'], { cwd: '../' });
if (!result.success) {
  throw new Error(`Failed to build job.json: ${result.stderr.toString()}`);
}
const jobConfigPath = path.resolve('../job.json');
await Bun.write(jobConfigPath, result.stdout);

const app = new cdk.App();

new ReductionStack(app, 'ReductionWordCountDemo', {
  env: { account: "619071318835", region: "us-east-2" },

  // A local file path to the job.json config
  jobConfigPath,

  // The handler Dockerfile is in this example directory
  handlerDockerDir: path.resolve('..'),

  // The reduction Dockerfile is in a go workspace sibling directory
  reductionDockerDir: path.resolve('../../../../reduction'),
});
