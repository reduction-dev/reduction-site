package main

import (
	"encoding/json"
	"testing"
	"time"

	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/memory"
	"reduction.dev/reduction-go/connectors/stdio"
	"reduction.dev/reduction-go/jobs"
	"reduction.dev/reduction-go/rxn"
)

func TestHighScore(t *testing.T) {
	job := &jobs.Job{}
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		KeyEvent: KeyEvent,
	})
	memorySink := memory.NewSink[stdio.Event](job, "Sink")
	operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
		Handler: func(op *jobs.Operator) rxn.OperatorHandler {
			return &Handler{
				Sink:          memorySink,
				HighScoreSpec: rxn.NewValueSpec(op, "HighScore", rxn.ScalarCodec[int]{}),
			}
		},
	})
	source.Connect(operator)
	operator.Connect(memorySink)

	tr := rxn.NewTestRun(job)

	// Add some score events for user-1
	addScoreEvent(tr, "user-1", 100, "2024-01-01T00:01:00Z") // First score - high score
	addScoreEvent(tr, "user-1", 50, "2024-01-01T00:02:00Z")  // Lower score - no event
	addScoreEvent(tr, "user-1", 150, "2024-01-01T00:03:00Z") // New high score

	// Different user scores
	addScoreEvent(tr, "user-2", 75, "2024-01-01T00:04:00Z") // First score - high score
	addScoreEvent(tr, "user-2", 80, "2024-01-01T00:05:00Z") // New high score

	// Back to first user
	addScoreEvent(tr, "user-1", 200, "2024-01-01T00:06:00Z") // Another new high score

	if err := tr.Run(); err != nil {
		t.Fatalf("failed to run handler: %v", err)
	}

	want := []string{
		"🏆 New high score for user-1: 100 (previous: 0)\n",
		"🏆 New high score for user-1: 150 (previous: 100)\n",
		"🏆 New high score for user-2: 75 (previous: 0)\n",
		"🏆 New high score for user-2: 80 (previous: 75)\n",
		"🏆 New high score for user-1: 200 (previous: 150)\n",
	}

	if len(memorySink.Records) != len(want) {
		t.Fatalf("expected %d records, got %d", len(want), len(memorySink.Records))
	}

	for i, wantMsg := range want {
		gotMsg := string(memorySink.Records[i])
		if gotMsg != wantMsg {
			t.Errorf("\nwant: %q\ngot:  %q", wantMsg, gotMsg)
		}
	}
}

func addScoreEvent(tr *rxn.TestRunNext, userID string, score int, timestamp string) {
	ts, _ := time.Parse(time.RFC3339, timestamp)
	data, _ := json.Marshal(ScoreEvent{
		UserID:    userID,
		Score:     score,
		Timestamp: ts,
	})
	tr.AddRecord(data)
}
