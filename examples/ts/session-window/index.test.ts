import { expect, test } from "bun:test";
import * as embedded from "reduction-ts/connectors/embedded";
import * as memory from "reduction-ts/connectors/memory";
import * as topology from "reduction-ts/topology";
import { TestRun } from "reduction-ts";
import { Handler, keyEvent, sessionCodec, SessionEvent, ViewEvent } from "./index";

test("groups events into sessions with inactivity threshold", async () => {
  // snippet-start: job-setup
  // Setup job
  const job = new topology.Job({
    workerCount: 1,
    workingStorageLocation: "storage",
  });
  const source = new embedded.Source(job, "Source", {
    keyEvent,
  });
  const memorySink = new memory.Sink<SessionEvent>(job, "Sink");
  const operator = new topology.Operator(job, "Operator", {
    parallelism: 1,
    handler: (op) => {
      // Setup our session spec with our custom codec. When there is no data for
      // a user, the session will be undefined.
      const sessionSpec = new topology.ValueSpec(op, "Session", sessionCodec, undefined);

      // 15 minutes in milliseconds
      const inactivityThreshold = 15 * 60 * 1000;

      return new Handler(sessionSpec, memorySink, inactivityThreshold);
    },
  });
  source.connect(operator);
  operator.connect(memorySink);
  // snippet-end: job-setup

  // snippet-start: test-run
  // Setup test run
  const testRun = job.createTestRun();

  // First session with events close together
  addViewEvent(testRun, "user", "2025-01-01T00:01:00Z");
  addViewEvent(testRun, "user", "2025-01-01T00:05:00Z");
  addViewEvent(testRun, "user", "2025-01-01T00:10:00Z");
  testRun.addWatermark();

  // Gap in activity (>15 minutes)

  // Second session
  addViewEvent(testRun, "user", "2025-01-01T00:30:00Z");
  addViewEvent(testRun, "user", "2025-01-01T00:35:00Z");
  testRun.addWatermark();

  // Events from another user advances event time
  addViewEvent(testRun, "other-user", "2025-01-01T01:00:00Z");
  testRun.addWatermark();

  // Run the test
  await testRun.run();
  // snippet-end: test-run

  // snippet-start: assert
  // Filter events to just focus on "user"
  const userEvents = memorySink.records.filter((event) => event.userID === "user");

  expect(userEvents).toEqual([
    {
      userID: "user",
      interval: "2025-01-01T00:01:00.000Z/2025-01-01T00:10:00.000Z",
    },
    {
      userID: "user",
      interval: "2025-01-01T00:30:00.000Z/2025-01-01T00:35:00.000Z",
    },
  ]);
  // snippet-end: assert
});

// Helper function to add view events to the test run
function addViewEvent(testRun: TestRun, userID: string, timestamp: string): void {
  const event: ViewEvent = {
    userID,
    timestamp: new Date(timestamp),
  };

  const data = Buffer.from(JSON.stringify(event));
  testRun.addRecord(data);
}
