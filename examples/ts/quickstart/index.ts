import * as topology from "reduction-ts/topology";
import * as embedded from "reduction-ts/connectors/embedded";
import * as stdio from "reduction-ts/connectors/stdio";
import { uint64ValueCodec } from "reduction-ts/state";
import type { KeyedEvent, Subject } from "reduction-ts";

function createHandler(op: topology.Operator, sink: stdio.Sink) {
  const countSpec = new topology.ValueSpec<number>(op, "count", uint64ValueCodec, 0);

  function onEvent(subject: Subject, event: KeyedEvent) {
    const count = countSpec.stateFor(subject);
    count.setValue(count.value + 1);
    if (count.value % 100_000 === 0) {
      sink.collect(subject, Buffer.from(`Count: ${count.value}`));
    }
  }

  return {
    onEvent,
    onTimerExpired(subject: Subject, timer: Date) {
      throw new Error("timers not used");
    },
  };
}

const job = new topology.Job({
  workerCount: 1,
  workingStorageLocation: "dkv-storage",
});
const source = new embedded.Source(job, "source", {
  keyEvent: () => [
    {
      key: new Uint8Array(),
      value: new Uint8Array(),
      timestamp: new Date(),
    },
  ],
  generator: "sequence",
});
const sink = new stdio.Sink(job, "sink");
const operator = new topology.Operator(job, "operator", {
  parallelism: 1,
  handler: (op) => createHandler(op, sink),
});
source.connect(operator);
operator.connect(sink);

job.run();
