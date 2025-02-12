---
sidebar_position: 0
---

# Hello World

Let's create a simple Reduction job that tracks high scores for players in a
game. When a player achieves a new personal best score, our job will emit an
event to celebrate their achievement!

## Overview

In this example, we'll:
1. Process a stream of score events containing user IDs and scores
2. Track the high score for each user
3. Emit events whenever a user beats their previous best score

The input events will look like:

```json
{
  "user_id": "player123",
  "score": 100,
  "timestamp": "2024-01-30T12:45:10Z"
}
```

And we'll emit events when users achieve new high scores:

```json
{
  "user_id": "player123",
  "score": 100,
  "previous_high": 0
}
```

This example demonstrates core Reduction concepts like:
* Processing an unbounded stream of events
* Maintaining state (high scores) per key (user)
* Emitting events conditionally based on state changes

## Complete Code

Here's the complete code for our hello world job:

```go
package main

import (
  "context"
  "encoding/json"
  "fmt"
  "time"

  "reduction.dev/reduction-go/connectors/stdio"
  "reduction.dev/reduction-go/jobs"
  "reduction.dev/reduction-go/rxn"
)

// ScoreEvent represents a user scoring points in a game
type ScoreEvent struct {
  UserID    string    `json:"user_id"`
  Score     int       `json:"score"`
  Timestamp time.Time `json:"timestamp"`
}

// Handler tracks high scores for each user
type Handler struct {
  sink          *stdio.Sink
  highScoreSpec rxn.ValueSpec[int]
}

// Transform input events into keyed events
func (h *Handler) KeyEvent(ctx context.Context, data []byte) ([]rxn.KeyedEvent, error) {
  var event ScoreEvent
  if err := json.Unmarshal(data, &event); err != nil {
    return nil, err
  }
  
  return []rxn.KeyedEvent{{
    Key:       []byte(event.UserID),
    Timestamp: event.Timestamp,
    Value:     data,
  }}, nil
}

// Process each score and emit if it's a new high score
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, data []byte) error {
  var event ScoreEvent
  if err := json.Unmarshal(data, &event); err != nil {
    return err
  }

  // Get current high score state for this user
  highScore := h.highScoreSpec.StateFor(subject)

  // Check if this is a new high score
  if event.Score > highScore.Value() {
    // Format and emit the high score message
    h.sink.Collect(ctx, []byte(fmt.Sprintf("🏆 New high score for %s: %d (previous: %d)\n",
      event.UserID, event.Score, highScore.Value())))

    // Update the stored high score
    highScore.Set(event.Score)
  }

  return nil
}

func main() {
  // Create a new job
  job := &jobs.Job{
    WorkerCount: 1,
    WorkingStorageLocation: "storage",
  }

  // Create source that reads JSON from stdin
  source := stdio.NewSource(job, "Source", &stdio.SourceParams{})

  // Create sink that writes to stdout
  sink := stdio.NewSink(job, "Sink")

  // Create our stateful handler
  operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
    Handler: func(op *jobs.Operator) rxn.OperatorHandler {
      return &Handler{
        sink:          sink,
        highScoreSpec: rxn.NewValueSpec(op, "highscore", rxn.ScalarCodec[int]{}),
      }
    },
  })

  // Connect components
  source.Connect(operator)
  operator.Connect(sink)

  // Run the job
  rxn.Run(job)
}
```

## Code Walkthrough 

Let's break down the key parts of our hello world job:

### Event Types

We define a single type for parsing the input score events:

```go
type ScoreEvent struct {
  UserID    string    `json:"user_id"`
  Score     int       `json:"score"`
  Timestamp time.Time `json:"timestamp"`
}
```

### State Management

Our handler maintains a single piece of state per user - their current high score:

```go
type Handler struct {
  sink          *stdio.Sink
  highScoreSpec rxn.ValueSpec[int]  // State specification
}
```

The `ValueSpec[int]` tells Reduction how to store integers (the high scores) and
provides methods to access and update them per user.

### Event Processing

The handler implements two key methods:

1. `KeyEvent` - Takes raw input and extracts the user ID as the key:
```go
func (h *Handler) KeyEvent(ctx context.Context, data []byte) ([]rxn.KeyedEvent, error) {
  var event ScoreEvent
  if err := json.Unmarshal(data, &event); err != nil {
    return nil, err
  }
  
  return []rxn.KeyedEvent{{
    Key:       []byte(event.UserID),  // Partition by user ID
    Timestamp: event.Timestamp,
    Value:     data,
  }}, nil
}
```

2. `OnEvent` - Processes each score and emits an event if it's a new high score:
```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, data []byte) error {
  var event ScoreEvent
  if err := json.Unmarshal(data, &event); err != nil {
    return err
  }

  // Get current high score state for this user
  highScore := h.highScoreSpec.StateFor(subject)

  // Check if this is a new high score
  if event.Score > highScore.Value() {
    // Format and emit the message and update the high score
    h.sink.Collect(ctx, []byte(fmt.Sprintf("🏆 New high score for %s: %d (previous: %d)\n",
      event.UserID, event.Score, highScore.Value())))

    highScore.Set(event.Score)
  }

  return nil
}
```

### Job Configuration 

Finally, we wire everything together:

```go
job := &jobs.Job{
  WorkerCount: 1,
  WorkingStorageLocation: "storage",
}

source := stdio.NewSource(job, "Source", &stdio.SourceParams{})
sink := stdio.NewSink(job, "Sink")

operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
  Handler: func(op *jobs.Operator) rxn.OperatorHandler {
    return &Handler{
      sink:          sink,
      highScoreSpec: rxn.NewValueSpec(op, "highscore", rxn.ScalarCodec[int]{}),
    }
  },
})

source.Connect(operator)
operator.Connect(sink)

rxn.Run(job)
```

## Running the Job

First, create a named pipe that we'll use to send events to our job:

```bash
mkfifo events
```

In one terminal, start the job reading from the pipe:

```bash
reduction dev . < events
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
you're done testing, press Ctrl+C to stop the job.

:::note
The named pipe (`events`) will persist in your filesystem until you delete it.
You can remove it with `rm events` when you're done.
:::

## Next Steps

This hello world example demonstrates the basics of building a stateful
streaming application with Reduction. From here, you can:

1. Try the [Tumbling Windows](./tumbling-windows.md) tutorial to learn about
windowing strategies
2. Check out the [Sliding Windows](./sliding-windows.md) tutorial for more
complex windowing
3. See the [Session Windows](./session-windows.md) tutorial for handling user
sessions

Each tutorial builds on these concepts and introduces new features of the
Reduction framework.

