---
sidebar_position: 0
slug: /
---

# Introduction

Reduction brings stateful stream processing to small teams through a familiar
client-server architecture. With first-class support for multiple programming
languages, software engineers can implement high-volume, real-time data
processing jobs using their existing skills and infrastructure.

Your service integrates with the Reduction engine by implementing three
functions (`keyEvent`, `onEvent`, and `onTimerExpired`) that manage state with
values, lists, and hash maps. The Reduction engine handles watermarks,
checkpoints, distributed storage, and workload parallelization, allowing you to
focus on your specific job requirements.

## What is Reduction?

Reduction is a stream processing engine that addresses use cases often handled
by Apache Flink, Apache Spark, and Kafka Streams with some key differences:

* Separation of the stream engine and processing logic through a client-server architecture
* Multi-language support built into the core design
* An emphasis on familiar primitives and a programming model that scales with
  more complex requirements
* Deployment of a job manager and workers with a pre-built engine binary
* Cloud-first storage using S3 and similar object stores

Reduction's architecture has three main components:
1. A streaming engine that orchestrates job execution and manages data flow
2. A distributed key-value store optimized for streaming workloads
3. Language-specific SDKs that connect your processing logic to the engine

## When should I use Reduction?

Consider Reduction when you think, "I can't just write all of this to the
database." It's designed for high-volume, low-latency, stateful workloads.

Let's break that down:

**High Volume:** Use Reduction when you need to derive additional events or
records from continuous data streams like user interactions or sensor readings.
If your workload can be handled by conventional databases, you can stick with
that solution.

**Low Latency:** Choose Reduction when you need answers in milliseconds to
minutes. If you can tolerate delays of 24 hours or more, a batch process may be
a better fit.

**Stateful:** Reduction is ideal when your processing requires historical
context of previous events, typically for performing aggregations. If your task
is stateless, like triggering an alert when an anomalous event
occurs, common compute platforms like AWS Lambda could be sufficient.

## Project Status

Reduction is a project that I personally wanted to use for years. It is in a
proof-of-concept phase, ready for early adopters to try but not yet vetted with
production deployments. This is an Apache 2, open source project in need of
contributors! The [core engine][reduction-repo] is written in Go and there's a [Go
SDK][reduction-go-repo] and a [TypeScript SDK][reduction-ts-repo].

Contributions needed:
* Documentation and examples
* Code cleanup
* Specific connectors (sources and sinks)
* Project infrastructure (CI, release process, binary distribution)

If you'd like to contribute, start an issue on GitHub. If you'd like to use
Reduction, you can contact me from the [reduction.dev] landing page.

[reduction-repo]: https://github.com/reduction-dev/reduction
[reduction-go-repo]: https://github.com/reduction-dev/reduction-go
[reduction-ts-repo]: https://github.com/reduction-dev/reduction-ts
[reduction.dev]: https://reduction.dev
