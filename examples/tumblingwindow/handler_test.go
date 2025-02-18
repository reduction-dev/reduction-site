package tumblingwindow_test

import (
	"encoding/json"
	"testing"
	"time"

	"tumblingwindow"

	"github.com/stretchr/testify/assert"
	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/memory"
	"reduction.dev/reduction-go/jobs"
	"reduction.dev/reduction-go/rxn"
)

func TestTumblingWindow(t *testing.T) {
	// snippet-start: job-setup
	job := &jobs.Job{}
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		KeyEvent: tumblingwindow.KeyEvent,
	})
	memorySink := memory.NewSink[tumblingwindow.SumEvent](job, "Sink")
	operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
		Handler: func(op *jobs.Operator) rxn.OperatorHandler {
			return &tumblingwindow.Handler{
				Sink:           memorySink,
				CountsByMinute: rxn.NewMapSpec(op, "CountsByMinute", rxn.ScalarMapStateCodec[time.Time, int]{}),
			}
		},
	})
	source.Connect(operator)
	operator.Connect(memorySink)
	// snippet-end: job-setup

	// snippet-start: test-run
	tr := rxn.NewTestRun(job)
	addViewEvent(tr, "channel", "2025-01-01T00:01:00Z")
	addViewEvent(tr, "channel", "2025-01-01T00:01:30Z")
	addViewEvent(tr, "channel", "2025-01-01T00:01:59Z")
	addViewEvent(tr, "channel", "2025-01-01T00:02:10Z")
	addViewEvent(tr, "channel", "2025-01-01T00:03:01Z")
	tr.AddWatermark()
	tr.Run()
	// snippet-end: test-run

	// snippet-start: assert
	assert.Equal(t, []tumblingwindow.SumEvent{
		{ChannelID: "channel", Timestamp: mustParseTime("2025-01-01T00:01:00Z"), Sum: 3},
		{ChannelID: "channel", Timestamp: mustParseTime("2025-01-01T00:02:00Z"), Sum: 1},
	}, memorySink.Records)
	// snippet-end: assert
}

func addViewEvent(tr *rxn.TestRunNext, channelID string, timestamp string) {
	ts := mustParseTime(timestamp)
	data, _ := json.Marshal(tumblingwindow.ViewEvent{ChannelID: channelID, Timestamp: ts})
	tr.AddRecord(data)
}

func mustParseTime(timestamp string) time.Time {
	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		panic(err)
	}
	return ts
}
