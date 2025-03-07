import { expect, test } from "bun:test";
import { TestRun } from "reduction-ts";
import * as embedded from "reduction-ts/connectors/embedded";
import * as memory from "reduction-ts/connectors/memory";
import {
  MapCodec,
  timestampValueCodec,
  uint64ValueCodec,
} from "reduction-ts/state";
import { Temporal } from "reduction-ts/temporal";
import * as topology from "reduction-ts/topology";
import { Handler, keyEvent, SumEvent, ViewEvent } from "./index";

test("sliding window counts events over 7 days", async () => {
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
      const countsByMinute = new topology.MapSpec<Temporal.Instant, number>(
        op,
        "CountsByMinute",
        new MapCodec({
          keyCodec: timestampValueCodec,
          valueCodec: uint64ValueCodec,
        })
      );

      const previousWindowSum = new topology.ValueSpec<number>(
        op,
        "PreviousWindowSum",
        uint64ValueCodec,
        0,
      );

      return new Handler(countsByMinute, previousWindowSum, memorySink);
    },
  });
  source.connect(operator);
  operator.connect(memorySink);
  // snippet-end: job-setup

  // snippet-start: test-run
  // Setup test run
  const testRun = job.createTestRun();

  /* Events for user accumulate */

  // Two events in one minute
  addViewEvent(testRun, "user", "2025-01-08T00:01:00Z");
  addViewEvent(testRun, "user", "2025-01-08T00:01:10Z");

  // Two events in next minute
  addViewEvent(testRun, "user", "2025-01-08T00:02:10Z");
  addViewEvent(testRun, "user", "2025-01-08T00:02:59Z");

  // One event and then no more
  addViewEvent(testRun, "user", "2025-01-08T00:03:00Z");

  /* Events from other users advance event time */

  // Advance the watermark near the middle of user's window
  addViewEvent(testRun, "other-user", "2025-01-11T00:00:00Z");
  testRun.addWatermark();

  // Advance the watermark near the end of user's window
  addViewEvent(testRun, "other-user", "2025-01-15T00:01:00Z");
  testRun.addWatermark();
  addViewEvent(testRun, "other-user", "2025-01-15T00:02:00Z");
  testRun.addWatermark();
  addViewEvent(testRun, "other-user", "2025-01-15T00:03:00Z");
  testRun.addWatermark();
  addViewEvent(testRun, "other-user", "2025-01-15T00:04:00Z");
  testRun.addWatermark();
  addViewEvent(testRun, "other-user", "2025-01-15T00:05:00Z");
  testRun.addWatermark();

  // Run the test
  await testRun.run();
  // snippet-end: test-run

  // snippet-start: assert
  // Filter events to just focus on "user"
  const userEvents = memorySink.records.filter(event => event.userID === "user");

  expect(userEvents).toEqual([
    // TotalViews accumulate for the first 3 minutes
    {
      userID: "user",
      interval: "2025-01-01T00:02Z/2025-01-08T00:02Z",
      totalViews: 2
    },
    {
      userID: "user",
      interval: "2025-01-01T00:03Z/2025-01-08T00:03Z",
      totalViews: 4
    },
    {
      userID: "user",
      interval: "2025-01-01T00:04Z/2025-01-08T00:04Z",
      totalViews: 5
    },

    // TotalViews decrease as windows at the end of the week close
    {
      userID: "user",
      interval: "2025-01-08T00:02Z/2025-01-15T00:02Z",
      totalViews: 3
    },
    {
      userID: "user",
      interval: "2025-01-08T00:03Z/2025-01-15T00:03Z",
      totalViews: 1
    },
    {
      userID: "user",
      interval: "2025-01-08T00:04Z/2025-01-15T00:04Z",
      totalViews: 0
    }
  ]);
  // snippet-end: assert
});

// Helper function to add view events to the test run
function addViewEvent(
  testRun: TestRun,
  userID: string,
  timestamp: string
): void {
  const event: ViewEvent = { userID, timestamp };
  const data = Buffer.from(JSON.stringify(event));
  testRun.addRecord(data);
}
