import { expect, test } from "bun:test";
import * as embedded from "reduction-ts/connectors/embedded";
import * as memory from "reduction-ts/connectors/memory";
import * as topology from "reduction-ts/topology";
import { TestRun } from "reduction-ts";
import { Handler, keyEvent, SumEvent, ViewEvent } from "./index";
import {
  MapCodec,
  TimestampValueCodec,
  Uint64ValueCodec,
} from "reduction-ts/state";

test("group events by minute and emit counts", async () => {
  // snippet-start: job-setup
  // Setup job
  const job = new topology.Job({
    workerCount: 1,
    workingStorageLocation: "storage",
  });
  const source = new embedded.Source(job, "Source", {
    keyEvent,
  });
  const memorySink = new memory.Sink<SumEvent>(job, "Sink");
  const operator = new topology.Operator(job, "Operator", {
    parallelism: 1,
    handler: (op) => {
      const state = new topology.MapSpec<Date, number>(
        op,
        "countsByMinute",
        new MapCodec({
          keyCodec: new TimestampValueCodec(),
          valueCodec: new Uint64ValueCodec(),
        })
      );

      return new Handler(state, memorySink);
    },
  });
  source.connect(operator);
  operator.connect(memorySink);
  // snippet-end: job-setup

  // snippet-start: test-run
  // Setup test run
  const testRun = job.createTestRun();

  // Add view events
  addViewEvent(testRun, "channel", "2025-01-01T00:01:00Z");
  addViewEvent(testRun, "channel", "2025-01-01T00:01:30Z");
  addViewEvent(testRun, "channel", "2025-01-01T00:01:59Z");
  addViewEvent(testRun, "channel", "2025-01-01T00:02:10Z");
  addViewEvent(testRun, "channel", "2025-01-01T00:03:01Z");

  // Add watermark to let time advance
  testRun.addWatermark();

  // Run the test
  await testRun.run();
  // snippet-end: test-run

  // snippet-start: assert
  // Assert the results
  expect(memorySink.records).toEqual([
    {
      channelId: "channel",
      timestamp: new Date("2025-01-01T00:01:00Z"),
      sum: 3,
    },
    {
      channelId: "channel",
      timestamp: new Date("2025-01-01T00:02:00Z"),
      sum: 1,
    },
  ]);
  // snippet-end: assert
});

// Helper function to add view events to the test run
function addViewEvent(
  testRun: TestRun,
  channelId: string,
  timestamp: string
): void {
  const event: ViewEvent = {
    channelId,
    timestamp: new Date(timestamp),
  };

  const data = Buffer.from(JSON.stringify(event));
  testRun.addRecord(data);
}
