package main

import (
	"context"
	"fmt"
	"time"

	"reduction.dev/reduction-go/connectors/embedded"
	"reduction.dev/reduction-go/connectors/stdio"
	"reduction.dev/reduction-go/rxn"
	"reduction.dev/reduction-go/topology"
)

type Handler struct {
	sink      rxn.Sink[stdio.Event]
	countSpec rxn.ValueSpec[int]
}

// Count each event that arrives and send a message to the sink every 100,000 events.
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, event rxn.KeyedEvent) error {
	count := h.countSpec.StateFor(subject)
	count.Set(count.Value() + 1)
	if count.Value()%100_000 == 0 {
		h.sink.Collect(ctx, []byte(fmt.Sprintf("Count: %d", count.Value())))
	}
	return nil
}

func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	panic("timers not used")
}

func main() {
	// Configure the job
	job := &topology.Job{
		WorkerCount:            1,
		WorkingStorageLocation: "storage",
	}
	sink := stdio.NewSink(job, "Sink")
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		Generator: "inc_nums",
		KeyEvent: func(ctx context.Context, record []byte) ([]rxn.KeyedEvent, error) {
			return []rxn.KeyedEvent{{}}, nil
		},
	})
	operator := topology.NewOperator(job, "Operator", &topology.OperatorParams{
		Handler: func(op *topology.Operator) rxn.OperatorHandler {
			count := topology.NewValueSpec(op, "Count", rxn.ScalarValueCodec[int]{})
			return &Handler{sink: sink, countSpec: count}
		},
	})
	source.Connect(operator)
	operator.Connect(sink)

	job.Run()
}
