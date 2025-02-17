package tumblingwindow

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"reduction.dev/reduction-demos/handlers/tumblingwindow"
	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/memory"
	"reduction.dev/reduction-go/jobs"
	"reduction.dev/reduction-go/rxn"
)

func TestTumblingWindow(t *testing.T) {
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

	tr := rxn.NewTestRun(job)
	addViewEvent(tr, "channel", "2025-01-01T00:01:00Z")
	addViewEvent(tr, "channel", "2025-01-01T00:01:30Z")
	addViewEvent(tr, "channel", "2025-01-01T00:01:59Z")
	addViewEvent(tr, "channel", "2025-01-01T00:02:10Z")
	addViewEvent(tr, "channel", "2025-01-01T00:03:01Z")
	tr.AddWatermark()
	tr.Run()

	wantEvents := []tumblingwindow.SumEvent{
		{ChannelID: "channel", Timestamp: "2025-01-01T00:01:00Z", Sum: 3},
		{ChannelID: "channel", Timestamp: "2025-01-01T00:02:00Z", Sum: 1},
	}

	if len(memorySink.Records) != 2 {
		t.Fatalf("expected 2 records, got %d\nmemorySink.Records: %+v\nwantEvents: %+v", len(memorySink.Records), memorySink.Records, wantEvents)
	}

	for i, want := range wantEvents {
		got := memorySink.Records[i]
		if !reflect.DeepEqual(want, got) {
			t.Errorf("want %v, got %v", want, got)
		}
	}
}

func addViewEvent(tr *rxn.TestRunNext, channelID string, timestamp string) {
	data, _ := json.Marshal(tumblingwindow.ViewEvent{ChannelID: channelID, Timestamp: timestamp})
	tr.AddRecord(data)
}

type MapStateParams struct {
	KeyType   reflect.Type
	ValueType reflect.Type
	Codec     any
}

func newMapStateSpec[K comparable, T any](op jobs.Operator, name string, params *MapStateParams) *rxn.MapState[K, T] {
	return rxn.NewMapState[K, T](name)
}
