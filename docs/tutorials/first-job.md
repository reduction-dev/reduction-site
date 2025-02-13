---
sidebar_position: 0
title: First Reduction Job
---

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
  Sink          rxn.Sink[stdio.Event]  // For emitting output
  HighScoreSpec rxn.ValueSpec[int]     // State specification
}

// KeyEvent extracts the user ID as the key for event routing and a timestamp
func KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
  var event ScoreEvent
  if err := json.Unmarshal(eventData, &event); err != nil {
    return nil, err
  }
  
  return []rxn.KeyedEvent{{
    Key:       []byte(event.UserID),
    Timestamp: event.Timestamp,
    Value:     eventData,
  }}, nil
}

// OnEvent processes each score event and emits when there's a new high score
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
  var event ScoreEvent
  if err := json.Unmarshal(eventData, &event); err != nil {
    return err
  }

  // Get current high score state for this user
  highScore := h.HighScoreSpec.StateFor(subject)

  // Check if this is a new high score
  if event.Score > highScore.Value() {
    // Format and emit the high score message
    message := fmt.Sprintf(
      "🏆 New high score for %s: %d (previous: %d)\n",
      event.UserID, event.Score, highScore.Value())
    h.Sink.Collect(ctx, []byte(message))

    // Update the stored high score
    highScore.Set(event.Score)
  }

  return nil
}

func main() {
  // Create a new job with a single worker
  job := &jobs.Job{WorkerCount: 1}

  // Create source that reads JSON from stdin
  source := stdio.NewSource(job, "Source", &stdio.SourceParams{
    KeyEvent: KeyEvent,
    Framing:  stdio.Framing{Delimiter: []byte{'\n'}},
  })

  // Create sink that writes to stdout
  sink := stdio.NewSink(job, "Sink")

  // Create our stateful handler
  operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
    Handler: func(op *jobs.Operator) rxn.OperatorHandler {
      return &Handler{
        Sink:          sink,
        HighScoreSpec: rxn.NewValueSpec(op, "highscore", rxn.ScalarCodec[int]{}),
      }
    },
  })

  // Connect source -> operator -> sink
  source.Connect(operator)
  operator.Connect(sink)

  // Run the job
  rxn.Run(job)
}
```

## Code Walkthrough 

Let's step through the key parts of our job.

### Event Type

We define a single type for parsing the input score events:

```go
type ScoreEvent struct {
  UserID    string    `json:"user_id"`
  Score     int       `json:"score"`
  Timestamp time.Time `json:"timestamp"`
}
```

### State Management

Our handler maintains a single piece of state per user: their current high score.

```go
type Handler struct {
  Sink          rxn.Sink[stdio.Event]
  HighScoreSpec rxn.ValueSpec[int]  // State specification
}
```

The `ValueSpec[int]` tells Reduction how to store integers (the high scores) and
lets us retrieve a state value on each `OnEvent` call.

### Event Processing

`KeyEvent` is a stateless function that accepts the raw JSON input and specifies
a key and a timestamp with its return value. The key allows Reduction to
partition our data stream and the timestamp allows it track the time relative to
the events ("event time").

```go
func KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
  var event ScoreEvent
  if err := json.Unmarshal(eventData, &event); err != nil {
    return nil, err
  }
  
  return []rxn.KeyedEvent{{
    Key:       []byte(event.UserID),  // Partition by user ID
    Timestamp: event.Timestamp,
    Value:     eventData,
  }}, nil
}
```

Once events are keyed and distributed in our Reduction cluster, they'll be
handled by `OnEvent`. In this method we:
* Decode the value of our KeyedEvent
* Load the current high score from state
* Update the current high score and send a new high score event if the user
  beat their previous high score.

```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
  var event ScoreEvent
  if err := json.Unmarshal(eventData, &event); err != nil {
    return err
  }

  // Get current high score state for this user
  highScore := h.HighScoreSpec.StateFor(subject)

  // Check if this is a new high score
  if event.Score > highScore.Value() {
    // Format and emit the message and update the high score
    h.Sink.Collect(ctx, []byte(fmt.Sprintf("🏆 New high score for %s: %d (previous: %d)\n",
      event.UserID, event.Score, highScore.Value())))

    highScore.Set(event.Score)
  }

  return nil
}
```

### Job Configuration 

Finally, we configure and run our job.

```go
job := &jobs.Job{WorkerCount: 1}

// Create a source that reads from stdin
source := stdio.NewSource(job, "Source", &stdio.SourceParams{
  KeyEvent: KeyEvent,
  Framing:  stdio.Framing{Delimiter: []byte{'\n'}},
})

// Create a sink that writes to stdout
sink := stdio.NewSink(job, "Sink")

operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
  Handler: func(op *jobs.Operator) rxn.OperatorHandler {
    return &Handler{
      Sink:          sink,
      HighScoreSpec: rxn.NewValueSpec(op, "highscore", rxn.ScalarCodec[int]{}),
    }
  },
})

source.Connect(operator)
operator.Connect(sink)

rxn.Run(job)
```

## Running the Job

To run the job locally with our `stdin` source and sink, we'll first create a
named pipe that we can write to.

```bash
mkfifo events
```

Build your Reduction handler:

```bash
go build ./cmd/highscore
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
you're done testing, press Ctrl+C to stop the job and remove the named pipe:

```
rm events
```

## Next Steps

This high scores example demonstrates the basics of building a stateful
streaming application with Reduction. From here, you can start learning
about windowing the [Tumbling Windows](./tumbling-windows.md) tutorial
