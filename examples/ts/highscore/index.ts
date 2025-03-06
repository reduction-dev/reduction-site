import type { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import * as stdio from "reduction-ts/connectors/stdio";
import { uint64ValueCodec } from "reduction-ts/state";
import { Temporal } from "reduction-ts/temporal";
import * as topology from "reduction-ts/topology";

// snippet-start: score-event
// ScoreEvent represents a user scoring points in a game
export interface ScoreEvent {
  user_id: string;
  score: number;
  timestamp: string;
}
// snippet-end: score-event

// snippet-start: handler-struct
// Handler tracks high scores for each user
export class Handler implements OperatorHandler {
  // The sink collects the high score messages
  private sink: topology.Sink<Uint8Array>;

  // ValueSpec tells reduction how to store and retrieve high scores for each user
  private highScoreSpec: topology.ValueSpec<number>;

  constructor(
    highScoreSpec: topology.ValueSpec<number>,
    sink: topology.Sink<Uint8Array>
  ) {
    this.highScoreSpec = highScoreSpec;
    this.sink = sink;
  }
  // snippet-end: handler-struct

  // snippet-start: on-event
  // onEvent processes each score event and emits when there's a new high score
  onEvent(subject: Subject, keyedEvent: KeyedEvent): void {
    const event: ScoreEvent = JSON.parse(Buffer.from(keyedEvent.value).toString());

    // Get current high score state for this user
    const highScore = this.highScoreSpec.stateFor(subject);

    // Check if this is a new high score
    if (event.score > highScore.value) {
      // Format and send the high score message
      const message = `🏆 New high score for ${event.user_id}: ${event.score} (previous: ${highScore.value})\n`;
      this.sink.collect(subject, Buffer.from(message));

      // Update the stored high score
      highScore.setValue(event.score);
    }
  }
  // snippet-end: on-event

  // Timers are not used in this example
  onTimerExpired(subject: Subject, timestamp: Temporal.Instant) {}
}

// snippet-start: key-event
// KeyEvent extracts the user ID as the key for event routing and a timestamp
export function keyEvent(eventData: Uint8Array): KeyedEvent[] {
  const event: ScoreEvent = JSON.parse(Buffer.from(eventData).toString());
  return [
    {
      key: Buffer.from(event.user_id),
      timestamp: Temporal.Instant.from(event.timestamp),
      value: eventData,
    },
  ];
}
// snippet-end: key-event

// snippet-start: main
// Main function to run the job
if (require.main === module) {
  // Configure the job
  const job = new topology.Job({
    workerCount: 1,
    workingStorageLocation: "storage",
  });

  // Create a source that reads from stdin
  const source = new stdio.Source(job, "Source", {
    keyEvent,
    framing: stdio.Framing.delimited({ delimiter: Buffer.from("\n") }),
  });

  // Create a sink that writes to stdout
  const sink = new stdio.Sink(job, "Sink");

  // Create the operator with our handler
  const operator = new topology.Operator(job, "Operator", {
    parallelism: 1,

    // This is where we configure the operator handler. We define the value spec
    // in the context of the operator, making the state spec available as static
    // configuration.
    handler: (op) => {
      const highScoreSpec = new topology.ValueSpec<number>(
        op,
        "highscore",
        uint64ValueCodec,
        0
      );
      return new Handler(highScoreSpec, sink);
    },
  });

  source.connect(operator);
  operator.connect(sink);

  job.run();
}
// snippet-end: main
