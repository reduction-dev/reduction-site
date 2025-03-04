---
sidebar_position: 3
---

import CodeSnippet from '@site/src/components/CodeSnippet';
import sessionWindowHandler from '!!raw-loader!@site/examples/sessionwindow/handler.go';
import sessionWindowTest from '!!raw-loader!@site/examples/sessionwindow/handler_test.go';

# Session Windows

## Overview

This tutorial covers building a Reduction job to emit session windows. A
session window represents a period of continuous activity that ends after a
period of inactivity. If you want to capture a logical grouping of events
related to a user like a single online shopping experience you'll want to use
session windows.

<p>
  <figure class="inline-block">
    <img src="/img/session-windows.png" width="536" height="226.5"/>
    <figcaption class="italic text-center">
      Session windows split by gaps of inactivity
    </figcaption>
  </figure>
</p>

:::info[My Introduction to Stream Processing]
Session windows were my first introduction to stateful stream processing. My
team needed to capture user sessions that ended 15 minutes after the last
session event. I was surprised when a developer's implementation was more
complicated than the high-level session window API I expected. Just a couple
simple sounding requirements like "sessions can't be more than 24 hours long"
had fundamentally changed the approach. A goal of Reduction is accommodate new
requirements without making developers learn an entirely new set of concepts.
:::

For this example we'll work with view events that represent a user viewing a website:

```json
{
  "user_id": "user-a",
  "timestamp": "2025-01-30T12:45:10Z"
}
```

And we'll emit events representing the time intervals that a user was actively on the site:

```json
{
  "user_id": "user-a",
  "interval": "2025-01-30T12:45:00Z/2025-01-30T13:00:00Z"
}
```

We'll use these two structs to decode those JSON objects:

<CodeSnippet language="go" code={sessionWindowHandler} marker="json-structs" />

## Keying Events

First we'll make a function to transform our JSON page view events into
Reduction's `KeyedEvent` type.

<CodeSnippet language="go" code={sessionWindowHandler} marker="key-event" />

## Representing Session State

For session windows, we need to track the start and end time of each active
session. We'll create a `Session` type to represent this state and a codec to
handle binary encoding and decoding of the session data.

<CodeSnippet language="go" code={sessionWindowHandler} marker="session-state" />

## Processing Each Event

Our handler uses a ValueSpec to manage session state an accepts an inactivity
threshold that determines when a session should be closed.

<CodeSnippet language="go" code={sessionWindowHandler} marker="handler-struct" />

In the `OnEvent` method, we'll either:
* Start a new session if we have no existing session for the user
* Extend the current session if the event falls within its inactivity threshold
* Close the current session and start a new one

<CodeSnippet language="go" code={sessionWindowHandler} marker="on-event" />

By observing the events of a user we can tell when there's a 15m gap but what
happens if we never get another event from the user? By setting a timer to
trigger after 15m passes with `subject.SetTimer`, we can close the session in
the `OnTimerExpired` method without needing to wait for another event from the
user.

## Processing Timers

When a timer expires, we check if the session should be closed based on the
inactivity threshold. If so, we emit the session event and clean up the session
state:

<CodeSnippet language="go" code={sessionWindowHandler} marker="on-timer" />

## Testing

Let's test our session window implementation with a series of events that should
create two distinct sessions.

First we set up our job for the test:

<CodeSnippet language="go" code={sessionWindowTest} marker="job-setup" />

Then we create a test run with events to test our handler:

<CodeSnippet language="go" code={sessionWindowTest} marker="test-run" />

And finally we assert that we get the sessions we expect:

<CodeSnippet language="go" code={sessionWindowTest} marker="assert" />

## Wrapping Up

We've implemented session windows that close after 15 minutes of inactivity. Now
how would we manage that new requirement I mentioned earlier: "sessions cannot
exceed 24h"?

We can add a new condition to our `OnEvent` handler for this requirement:

<CodeSnippet language="go" code={sessionWindowHandler} marker="on-event-24h" />
