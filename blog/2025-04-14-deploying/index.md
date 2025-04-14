---
slug: deploying-reduction
---

# Deploying Reduction

## Reduction 0.0.5 Changes

Reduction 0.0.5 is out and is the first release that's been deployed to AWS.
Getting to a good deployment workflow required some new features and bugfixes:
- ✨ Config parameters resolved at runtime
- ✨ Read config files from S3 URLs like `s3://my-bucket/job.config`
- ✨ Quieter logs with default log level
- 🐛 Terminate on AccessDenied and InvalidArgument Kinesis errors and retry
  network errors forever
- 🐛 Fix deadlock when there are fewer Kinesis shards than source readers
- 🐛 Reduce S3 API calls when restarting a job in an unhealthy cluster
- 🐛 Correctly store the sequence number (not the shard iterator) in Kinesis checkpoints
- 🐛 Handle expired iterators when shards are idle for more than 5m

<!-- truncate -->

## Runtime Config Parameters

Reduction jobs authored with the SDKs represent everything needed to define a job:
- The static configuration of a job's topology (sources, operators, sinks)
- Configuration values (working storage location, number of workers)
- Runtime functions called by Reduction to process events

However, configuration values may be unknown until the job is deployed. This is
especially true when following best practices with [CDK][cdk] where config
values like S3 bucket names and Kinesis stream ARNs are generated during
deployment. Now each SDK has the concept of configuration parameters that are
resolved by the Reduction Job Manager at runtime.

_Go Reduction Job Source:_
```go
source := kinesis.NewSource(job, "Source", &kinesis.SourceParams{
    StreamARN: topology.StringParam("KINESIS_STREAM_ARN"),
    KeyEvent:  KeyEvent,
})
```

_TypeScript Reduction Job Source:_
```typescript
const source = new kinesis.Source(job, "Source", {
    streamARN: topology.ConfigParam.of("KINESIS_STREAM_ARN"),
    keyEvent: keyEvent
})
```

The value of `KINESIS_STREAM_ARN` is included in the Job Manager's environment
variables prefixed with `REDUCTION_PARAM_`:

```ts
taskDefinition.addContainer('Container', {
    // ...
    environment: {
        REDUCTION_PARAM_KINESIS_STREAM_ARN: props.sourceStream.streamArn,
    },
});
```

You can checkout the full CDK example on GitHub: https://github.com/reduction-dev/reduction-site/tree/master/examples/deploy-go/cdk

Both [`reduction-go`][reduction-go] and [`reduction-ts`][reduction-ts] language SDKs were updated to include
runtime config parameters.

## Deployment Guide

The documentation now includes the first deployment guide: [Deploying to ECS
with CDK]. I started with what I know: Deploying to [ECS] With [CDK].
This guide shows you how to deploy a Reduction cluster with multiple workers
that call a job Handler service.

I know many teams are comfortable with Kubernetes deployments so I've got that
on my list. If you know how to translate something like this to EKS let me know
in a [GitHub issue][new-issue] because it would save me a lot of time 😅

[CDK]: https://aws.amazon.com/cdk/
[reduction-go]: https://github.com/reduction-dev/reduction-go
[reduction-ts]: https://github.com/reduction-dev/reduction-ts
[ECS]: https://aws.amazon.com/ecs/
[new-issue]: https://github.com/reduction-dev/reduction/issues/new
[Deploying to ECS with CDK]: http://localhost:3000/docs/guides/deploy/cdk-ecs/
