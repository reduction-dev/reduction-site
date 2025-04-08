package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"reduction.dev/reduction-go/connectors/kinesis"
	"reduction.dev/reduction-go/connectors/stdio"
	"reduction.dev/reduction-go/rxn"
	"reduction.dev/reduction-go/topology"
)

// Handler tracks word counts
type Handler struct {
	// The sink collects word count results
	Sink rxn.Sink[stdio.Event]

	// MapSpec tells reduction how to store and retrieve counts for each word
	WordCountSpec rxn.ValueSpec[int]
}

// KeyEvent extracts words from the input text and creates events for each
func KeyEvent(ctx context.Context, eventData *kinesis.Record) ([]rxn.KeyedEvent, error) {
	words := strings.Fields(string(eventData.Data))
	keyedEvents := make([]rxn.KeyedEvent, 0, len(words))
	for _, word := range words {
		// Normalize word (lowercase, remove punctuation)
		word = strings.ToLower(strings.Trim(word, ",.!?;:\"'()"))
		if word == "" {
			continue
		}

		keyedEvents = append(keyedEvents, rxn.KeyedEvent{
			Key: []byte(word),
		})
	}

	return keyedEvents, nil
}

// OnEvent processes each word event and updates its count
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, keyedEvent rxn.KeyedEvent) error {
	// Get count for current word
	wordCount := h.WordCountSpec.StateFor(subject)

	// Increment count
	wordCount.Set(wordCount.Value() + 1)

	// Collect the result
	h.Sink.Collect(ctx, fmt.Appendf(nil, "%s: %d\n", string(subject.Key()), wordCount.Value()))
	return nil
}

// OnTimerExpired is not used
func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	return nil
}

func main() {
	// Configure the job
	job := &topology.Job{
		WorkingStorageLocation: topology.StringParam("STORAGE_PATH"),
		WorkerCount:            topology.IntParam("WORKER_COUNT"),
	}

	// Create a source that reads from stdin
	source := kinesis.NewSource(job, "Source", &kinesis.SourceParams{
		StreamARN: topology.StringParam("KINESIS_STREAM_ARN"),
		KeyEvent:  KeyEvent,
	})

	// Create a sink that writes to stdout
	sink := stdio.NewSink(job, "Sink")

	operator := topology.NewOperator(job, "Operator", &topology.OperatorParams{
		Handler: func(op *topology.Operator) rxn.OperatorHandler {
			wordCountSpec := topology.NewValueSpec(op, "wordcount", rxn.ScalarValueCodec[int]{})
			return &Handler{
				Sink:          sink,
				WordCountSpec: wordCountSpec,
			}
		},
	})

	source.Connect(operator)
	operator.Connect(sink)

	job.Run()
}
