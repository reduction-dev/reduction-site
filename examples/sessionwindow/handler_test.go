package sessionwindow_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"reduction.dev/reduction-demos/handlers/sessionwindow"
	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/memory"
	"reduction.dev/reduction-go/jobs"
	"reduction.dev/reduction-go/rxn"
)

func TestSessionWindow(t *testing.T) {
	// snippet-start: job-setup
	job := &jobs.Job{}
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		KeyEvent: sessionwindow.KeyEvent,
	})
	memorySink := memory.NewSink[sessionwindow.SessionEvent](job, "Sink")
	operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
		Handler: func(op *jobs.Operator) rxn.OperatorHandler {
			return &sessionwindow.Handler{
				Sink:                memorySink,
				SessionSpec:         rxn.NewValueSpec(op, "Session", sessionwindow.SessionCodec{}),
				InactivityThreshold: 15 * time.Minute,
			}
		},
	})
	source.Connect(operator)
	operator.Connect(memorySink)
	// snippet-end: job-setup

	// snippet-start: test-run
	tr := rxn.NewTestRun(job)

	// First session with events close together
	addViewEvent(tr, "user", "2025-01-01T00:01:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:05:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:10:00Z")
	tr.AddWatermark()

	// Gap in activity (>15 minutes)

	// Second session
	addViewEvent(tr, "user", "2025-01-01T00:30:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:35:00Z")
	tr.AddWatermark()

	// Events from another user advances event time
	addViewEvent(tr, "other-user", "2025-01-01T01:00:00Z")
	tr.AddWatermark()

	require.NoError(t, tr.Run())
	// snippet-end: test-run

	// snippet-start: assert
	// Filter events to just focus on "user"
	userEvents := []sessionwindow.SessionEvent{}
	for _, event := range memorySink.Records {
		if event.UserID == "user" {
			userEvents = append(userEvents, event)
		}
	}

	assert.Equal(t, []sessionwindow.SessionEvent{
		{UserID: "user", Interval: "2025-01-01T00:01:00Z/2025-01-01T00:10:00Z"},
		{UserID: "user", Interval: "2025-01-01T00:30:00Z/2025-01-01T00:35:00Z"},
	}, userEvents)
	// snippet-end: assert
}

func addViewEvent(tr *rxn.TestRunNext, userID string, timestamp string) {
	data, _ := json.Marshal(sessionwindow.ViewEvent{UserID: userID, Timestamp: timestamp})
	tr.AddRecord(data)
}
