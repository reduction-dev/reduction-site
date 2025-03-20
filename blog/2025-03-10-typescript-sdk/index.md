---
slug: typescript-sdk
---

# The TypeScript SDK

Making good on the promise of multi-language support, Reduction now has a
TypeScript SDK ([github repository](https://github.com/reduction-dev/reduction-ts)).

Getting back into the Node ecosystem, I am _loving_ [Bun][bun] and think you
should use it with Reduction if you can. You can get started by by initializing
a new project and installing `reduction-ts`:

```bash
bun init
bun add reduction-ts
```

<!-- truncate -->

Then checkout the [Getting Started guide][getting-started] to run your first
streaming job locally.

To get a sense of the TypeScript APIs, here's an `onEvent` handler to collect
new high scores from a stream of game score events:

```ts
onEvent(subject: Subject, keyedEvent: KeyedEvent) {
  // Parse the score event
  const event: ScoreEvent = JSON.parse(Buffer.from(keyedEvent.value).toString());

  // Get current high score state for this user
  const highScore = this.highScoreSpec.stateFor(subject);

  // Check if this is a new high score
  if (event.score > highScore.value) {
    // Format and send the high score message
    const message = `🏆 New high score for ${event.user_id}: ${event.score} (previous: ${highScore.value})\n`;
    this.sink.collect(subject, Buffer.from(message));

    // Update the stored high score
    highScore.setValue(event.score);
  }
}
```

## Major Changes

With this release, the job configuration schema is [defined in
protobuf][jobconfig-proto] although the config file is still written as JSON.
This makes maintaining the "config" parts of the SDKs easier than coding to the
previously implicit contract between the engine and the Go SDK for config.

The config needs to manage polymorphic types (there are many types of sinks and
sources) and the previous JSON format was somewhat like CloudFormation with a
`Type` and `Params` key:

```json
"Sources": [
  "SourceID": {
    "Type": "Source:Embedded",
    "Params": {
      "BatchSize": 1000,
      "Generator": "inc_nums",
      "SplitCount": 2
    }
  }
]
```

The new format embraces the `oneof` Protocol Buffers patten where the object key
(`embedded` below) determines the type:

```json
"sources": [
  {
    "id": "SourceID",
    "embedded": {
      "batchSize": 1000,
      "generator": "inc_nums",
      "splitCount": 2
    }
  }
]
```

When working on the TypeScript SDK I discovered that Node's server is more picky
than the Go server about its URLs. The Go server was happy to handle local urls
with no host like http://:8080/path.

The config and local url changes required the [release of 0.0.2 of the Reduction
core engine][reduction-engine-release].

A new v0.0.4 version of the Go SDK includes changes to the config format and a
culling of the public API: 55 public types, functions, and methods down to 21.

## Performance

I'm not chasing performance right now but on a local benchmark (average in
tumbling window, single partition) I saw:

- Go SDK: 95,000 events/sec
- TypeScript SDK with Bun: 49,000 events/sec

I'm sure there's some easy performance wins with the new SDK waiting but for now
I'm happy to see that both SDKs should be able to support 1M events/sec jobs in
production.

[bun]: http://bun.sh/
[getting-started]: https://reduction.dev/docs/getting-started/
[jobconfig-proto]:
  https://github.com/reduction-dev/reduction-protocol/blob/b6b4e339b552183e7fc4cf6badd5cf32ef05a657/jobconfigpb/jobconfig.proto
[reduction-engine-release]:
  https://github.com/reduction-dev/reduction/releases/tag/v0.0.2
