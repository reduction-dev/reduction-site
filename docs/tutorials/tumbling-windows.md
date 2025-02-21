---
sidebar_position: 1
---

import CodeSnippet from '@site/src/components/CodeSnippet';
import tumblingWindowHandler from '!!raw-loader!@site/examples/tumblingwindow/handler.go';
import tumblingWindowTest from '!!raw-loader!@site/examples/tumblingwindow/handler_test.go';

# Tumbling Windows

## Overview

This tutorial covers creating tumbling windows of data. Tumbling windows capture
a window of time in fixed increments across all subjects. For instance you
may want to aggregate statistics over each minute and emit an event when a
minute passes.

<p>
  <figure class="inline-block">
    <img src="/img/tumbling-windows.png" width="536.5" height="115.5"/>
    <figcaption class="italic text-center">Three tumbling windows as events arrive</figcaption>
  </figure>
</p>

As a motivating use case let's say we have several video channels on our website
that viewers watch. We'd like to know how many viewers are watching each channel
so that we can show a view count on the channel. Our job will aggregate events
by minute and emit a sum of view events for every channel on every minute.

The data we'll be working with is an event stream of JSON objects that look like
this:

```json
{
  "channel_id": "channel-a",
  "timestamp": "2025-01-30T12:45:10Z"
}
```

And our goal is to emit a new event with a sum each minute:

```json
{
  "channel_id": "channel-a",
  "timestamp": "2025-01-30T12:45:00Z",
  "sum": 5
}
```

## Keying Events

We'll begin by making a handler object that Reduction will call to process the
event stream. The first thing a handler does is extract the timestamp and
subject key from an event and return a `KeyedEvent` type. Reduction uses the
`KeyedEvent` timestamp to derive the relative time in a stream of events and it
uses the key to partition events between the operators that it manages
internally.

<CodeSnippet language="go" code={tumblingWindowHandler} marker="key-event" />

## Processing Each Event

As Reduction processes the view events, it will call the handler's `OnEvent`
method for each event to give us an opportunity to store state and trigger
timers. In this case we'll want to store the sum of events by minute in a map
and set a timer to trigger when a minute is over.

:::tip[Why do we need a map?]
You may wonder why we need to store events by minute rather than just storing a
single value representing a sum of events for the current minute. In Reduction,
timers are asynchronous and setting a timer represents the _earliest_ a timer
may fire. This is similar to timers in programming languages like Go
(`time.After`) or JavaScript (`setTimeout`). Events for the next minute will
arrive before the timer fires for the previous minute.
:::

Each supported language has state specs to handle converting our types to a
binary format and back according to a provided codec (coder/decoder). For a map
of timestamps to integers, we can use the `MapSpec` type.

<CodeSnippet language="go" code={tumblingWindowHandler} marker="handler" />

In our handler's `OnEvent` method we'll load the state, increment
the sum for the event's minute (rounding down), and set a timer
to fire on the next minute.

<CodeSnippet language="go" code={tumblingWindowHandler} marker="on-event" />

## Processing Timers

When a timer fires, we'll send the sum value to our sink and remove the obsolete
minute bucket from our map.

Let's create an object to handle the JSON serialization.

<CodeSnippet language="go" code={tumblingWindowHandler} marker="sum-event" />

And then write the `OnTimerExpired` method to send these events to the sink.

<CodeSnippet language="go" code={tumblingWindowHandler} marker="on-timer" />

## Testing

You may have spotted opportunities for unit test in our handler implementation
but the most interesting parts of a Reduction job are how the callbacks and
state mutations work together to produce our final output. We can test how the
handler will work with a production Reduction cluster by using the
`topology.TestRun` utility. This utility invokes the `reduction test` command
with a list of test events to process with the handler. When all the events have
been processed, we can inspect an in-memory sink to see what events we would
have sent.

Our Handler's `Sink` member is an interface that allows us to collect our
`SumEvent` events (`connectors.SinkRuntime[SumEvent]`). When testing we can use
Reduction's memory sink type to record sink events rather than having the
cluster handle them. Let's start the test by setting up our job.

<CodeSnippet language="go" code={tumblingWindowTest} marker="job-setup" />

In our "test run" we'll add a some view events for a channel and advance the
watermark.

<CodeSnippet language="go" code={tumblingWindowTest} marker="test-run" />

:::tip[Advancing the Watermark]
In stream processing, a watermark indicates that all events up to a certain
timestamp have been processed. When we advance the watermark in testing, we're
simulating the passage of time and allowing timers to fire.
:::

And then we check the memory sink for the events we expect to have been emitted.

<CodeSnippet language="go" code={tumblingWindowTest} marker="assert" />

You might wonder why we get a closed window for minute 2 but not minute 3 in
this test. The window for minute three is still open because, according to event
time, more events may arrive to fill that window.

## Wrapping Up

Tumbling windows are a good introduction to stateful processing with timers.
They're pretty simple and can be thought of as batching aggregations by key.
However they can also accommodate complex aggregation and filtering logic within
the windows.
