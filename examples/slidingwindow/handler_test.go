package slidingwindow_test

import (
	"encoding/json"
	"testing"
	"time"

	"slidingwindow"

	"github.com/stretchr/testify/assert"
	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/memory"
	"reduction.dev/reduction-go/rxn"
	"reduction.dev/reduction-go/topology"
)

func TestSlidingWindow(t *testing.T) {
	// snippet-start: job-setup
	job := &topology.Job{}
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		KeyEvent: slidingwindow.KeyEvent,
	})
	memorySink := memory.NewSink[slidingwindow.SumEvent](job, "Sink")
	operator := topology.NewOperator(job, "Operator", &topology.OperatorParams{
		Handler: func(op *topology.Operator) rxn.OperatorHandler {
			return &slidingwindow.Handler{
				Sink:                  memorySink,
				CountsByMinuteSpec:    topology.NewMapSpec(op, "CountsByMinute", rxn.ScalarMapCodec[time.Time, int]{}),
				PreviousWindowSumSpec: topology.NewValueSpec(op, "PreviousWindowSum", rxn.ScalarValueCodec[int]{}),
			}
		},
	})
	source.Connect(operator)
	operator.Connect(memorySink)
	// snippet-end: job-setup

	// snippet-start: test-run
	tr := job.NewTestRun()

	/* Events for user accumulate */

	// Two events in one minute
	addViewEvent(tr, "user", "2025-01-08T00:01:00Z")
	addViewEvent(tr, "user", "2025-01-08T00:01:10Z")

	// Two events in next minute
	addViewEvent(tr, "user", "2025-01-08T00:02:10Z")
	addViewEvent(tr, "user", "2025-01-08T00:02:59Z")

	// One event and then no more
	addViewEvent(tr, "user", "2025-01-08T00:03:00Z")

	/* Events from other users advance event time */

	// Advance the watermark near the middle of user's window
	addViewEvent(tr, "other-user", "2025-01-11T00:00:00Z")
	tr.AddWatermark()

	// Advance the watermark near the end of user's window
	addViewEvent(tr, "other-user", "2025-01-15T00:01:00Z")
	tr.AddWatermark()
	addViewEvent(tr, "other-user", "2025-01-15T00:02:00Z")
	tr.AddWatermark()
	addViewEvent(tr, "other-user", "2025-01-15T00:03:00Z")
	tr.AddWatermark()
	addViewEvent(tr, "other-user", "2025-01-15T00:04:00Z")
	tr.AddWatermark()
	addViewEvent(tr, "other-user", "2025-01-15T00:05:00Z")
	tr.AddWatermark()

	if err := tr.Run(); err != nil {
		t.Fatalf("failed to run handler: %v", err)
	}
	// snippet-end: test-run

	// snippet-start: assert
	// Filter events to just focus on "user"
	userEvents := []slidingwindow.SumEvent{}
	for _, event := range memorySink.Records {
		if event.UserID == "user" {
			userEvents = append(userEvents, event)
		}
	}

	assert.Equal(t, []slidingwindow.SumEvent{
		// TotalViews accumulate for the first 3 minutes
		{UserID: "user", Interval: "2025-01-01T00:02:00Z/2025-01-08T00:02:00Z", TotalViews: 2},
		{UserID: "user", Interval: "2025-01-01T00:03:00Z/2025-01-08T00:03:00Z", TotalViews: 4},
		{UserID: "user", Interval: "2025-01-01T00:04:00Z/2025-01-08T00:04:00Z", TotalViews: 5},

		// TotalViews decrease as windows at the end of the week close
		{UserID: "user", Interval: "2025-01-08T00:02:00Z/2025-01-15T00:02:00Z", TotalViews: 3},
		{UserID: "user", Interval: "2025-01-08T00:03:00Z/2025-01-15T00:03:00Z", TotalViews: 1},
		{UserID: "user", Interval: "2025-01-08T00:04:00Z/2025-01-15T00:04:00Z", TotalViews: 0},
	}, userEvents, "events should match expected sequence")
	// snippet-end: assert
}

func addViewEvent(tr *topology.TestRun, userID string, timestamp string) {
	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		panic(err)
	}
	data, _ := json.Marshal(slidingwindow.ViewEvent{UserID: userID, Timestamp: ts})
	tr.AddRecord(data)
}
