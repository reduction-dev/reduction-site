package main

import (
	"reduction.dev/reduction-go/connectors/stdio"
	"reduction.dev/reduction-go/jobs"
	"reduction.dev/reduction-go/rxn"
)

func main() {
	// Configure the job
	job := &jobs.Job{WorkerCount: 1, WorkingStorageLocation: "storage"}

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
}
