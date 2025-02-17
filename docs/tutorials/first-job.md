---
sidebar_position: 0
title: First Reduction Job
---

import CodeSnippet from '@site/src/components/CodeSnippet';
import highScoreMain from '!!raw-loader!@site/examples/highscore/main.go';

# First Reduction Job: High Scores

Let's create a simple Reduction job that tracks high scores for players in a
game. When a player achieves a new personal best score, our job will emit an
event to celebrate their achievement.

## Overview

This job will:
1. Process a stream of score events containing user IDs and numeric scores
2. Remember the high score for each user
3. Emit events whenever a user beats their previous best score

The input events will look like:

```json
{
  "user_id": "player123",
  "score": 100,
  "timestamp": "2024-01-30T12:45:10Z"
}
```

And we'll print messages when users achieve new high scores:

```
🏆 New high score for player123: 100 (previous: 0)
```

## Complete Code

Here's the complete code for our high scores job:

<CodeSnippet language="go" code={highScoreMain} title="main.go" />

## Code Walkthrough 

Let's step through the key parts of our job.

### Create Go Project

First you'll need to create a Go project for your handler. We'll call it "highscores". 

```bash
mkdir highscores && cd highscores # create a directory for your module
go mod init highscores # initialize the module
go get reduction.dev/reduction-go # install the Go SDK
```

For ths small example you can put all the code in a `main.go` in the root
of your module directory.

### Event Type

We define a single type for parsing the input score events:

<CodeSnippet language="go" marker="score-event" code={highScoreMain} />

### State Management

Our handler maintains a single piece of state per user: their current high score.

<CodeSnippet language="go" marker="handler-struct" code={highScoreMain} />

The `ValueSpec[int]` is a type that tells Reduction how to store integers (the
high scores) and lets us retrieve a state value on each `OnEvent` call.

### Event Processing

`KeyEvent` is a stateless function that accepts the raw JSON input and specifies
a key and a timestamp with its return value. The key allows Reduction to
partition our data stream and the timestamp allows it track the time relative to
the events ("event time").

<CodeSnippet language="go" marker="key-event" code={highScoreMain} />

Once events are keyed and distributed in our Reduction cluster, they'll be
handled by `OnEvent`. In this method we:
* Decode the value of our KeyedEvent
* Load the current high score from state
* Update the current high score and send a new high score event if the user
  beat their previous high score.

<CodeSnippet language="go" marker="on-event" code={highScoreMain} />

### Job Configuration 

Finally, we configure and run our job.

<CodeSnippet language="go" marker="main" code={highScoreMain} />

## Running the Job

To run the job locally with our `stdin` source and sink, we'll first create a
named pipe that we can write to.

```bash
mkfifo events
```

Build your Reduction handler:

```bash
go build # creates highscore file
```

In one terminal, start the job reading from the pipe:

```bash
reduction dev ./highscore < events
```

Then in another terminal, you can send events by echoing JSON to the pipe:

```bash
# First score for alice - new high score!
echo '{"user_id":"alice","score":100,"timestamp":"2024-01-30T12:00:00Z"}' > events

# Lower score for alice - no event emitted
echo '{"user_id":"alice","score":50,"timestamp":"2024-01-30T12:01:00Z"}' > events

# Bob's first score
echo '{"user_id":"bob","score":75,"timestamp":"2024-01-30T12:02:00Z"}' > events

# Alice beats her high score!
echo '{"user_id":"alice","score":150,"timestamp":"2024-01-30T12:03:00Z"}' > events
```

You should see output like:

```
🏆 New high score for alice: 100 (previous: 0)
🏆 New high score for bob: 75 (previous: 0)
🏆 New high score for alice: 150 (previous: 100)
```

The job will keep running and processing new events as you send them. When
you're done testing, press Ctrl+C to stop the job and remove the named pipe:

```
rm events
```

## Next Steps

This high scores example demonstrates the basics of building a stateful
streaming application with Reduction. From here, you can start learning about
windows in the [Tumbling Windows](./tumbling-windows.md) tutorial.
