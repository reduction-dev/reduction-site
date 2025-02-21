package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"reduction.dev/reduction-go/connectors/stdio"
	"reduction.dev/reduction-go/rxn"
	"reduction.dev/reduction-go/topology"
)

// snippet-start: score-event
// ScoreEvent represents a user scoring points in a game
type ScoreEvent struct {
	UserID    string    `json:"user_id"`
	Score     int       `json:"score"`
	Timestamp time.Time `json:"timestamp"`
}

// snippet-end: score-event

// snippet-start: handler-struct
// Handler tracks high scores for each user
type Handler struct {
	Sink          rxn.Sink[stdio.Event]
	HighScoreSpec rxn.ValueSpec[int]
}

// snippet-end: handler-struct

// snippet-start: key-event
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

// snippet-end: key-event

// snippet-start: on-event
// OnEvent processes each score event and emits when there's a new high score
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, keyedEvent rxn.KeyedEvent) error {
	var event ScoreEvent
	if err := json.Unmarshal(keyedEvent.Value, &event); err != nil {
		return err
	}

	// Get current high score state for this user
	highScore := h.HighScoreSpec.StateFor(subject)

	// Check if this is a new high score
	if event.Score > highScore.Value() {
		// Format and emit the high score message
		message := fmt.Sprintf("🏆 New high score for %s: %d (previous: %d)\n",
			event.UserID, event.Score, highScore.Value())
		h.Sink.Collect(ctx, []byte(message))

		// Update the stored high score
		highScore.Set(event.Score)
	}

	return nil
}

// snippet-end: on-event

// OnTimerExpired is not used in this handler
func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	return nil
}

// snippet-start: main
func main() {
	// Configure the job
	job := &topology.Job{WorkerCount: 1, WorkingStorageLocation: "storage"}

	// Create a source that reads from stdin
	source := stdio.NewSource(job, "Source", &stdio.SourceParams{
		KeyEvent: KeyEvent,
		Framing:  stdio.Framing{Delimiter: []byte{'\n'}},
	})

	// Create a sink that writes to stdout
	sink := stdio.NewSink(job, "Sink")

	operator := topology.NewOperator(job, "Operator", &topology.OperatorParams{
		Handler: func(op *topology.Operator) rxn.OperatorHandler {
			return &Handler{
				Sink:          sink,
				HighScoreSpec: topology.NewValueSpec(op, "highscore", rxn.ScalarValueCodec[int]{}),
			}
		},
	})

	source.Connect(operator)
	operator.Connect(sink)

	job.Run()
}

// snippet-end: main
