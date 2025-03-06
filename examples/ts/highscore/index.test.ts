import { expect, test } from "bun:test";
import * as embedded from "reduction-ts/connectors/embedded";
import * as memory from "reduction-ts/connectors/memory";
import * as topology from "reduction-ts/topology";
import { Handler, keyEvent, ScoreEvent } from "./index";
import { uint64ValueCodec } from "reduction-ts/state";
import { TestRun } from "reduction-ts";
import { Temporal } from "reduction-ts/temporal";

test("tracks high scores and emits events for new records", async () => {
  // Configure the job
  const job = new topology.Job({
    workerCount: 1,
    workingStorageLocation: "storage",
  });

  // Create a source
  const source = new embedded.Source(job, "Source", { keyEvent });

  // Create a memory sink to collect results
  const memorySink = new memory.Sink<Uint8Array>(job, "Sink");

  // Create the operator with our handler
  const operator = new topology.Operator(job, "Operator", {
    parallelism: 1,
    handler: (op) => {
      const highScoreSpec = new topology.ValueSpec<number>(op, "highscore", uint64ValueCodec, 0);
      return new Handler(highScoreSpec, memorySink);
    },
  });

  source.connect(operator);
  operator.connect(memorySink);

  // Set up test run
  const testRun = job.createTestRun();

  // Add some score events for user-1
  addScoreEvent(testRun, "user-1", 100, "2024-01-01T00:01:00Z"); // First score - high score
  addScoreEvent(testRun, "user-1", 50, "2024-01-01T00:02:00Z"); // Lower score - no event
  addScoreEvent(testRun, "user-1", 150, "2024-01-01T00:03:00Z"); // New high score

  // Different user scores
  addScoreEvent(testRun, "user-2", 75, "2024-01-01T00:04:00Z"); // First score - high score
  addScoreEvent(testRun, "user-2", 80, "2024-01-01T00:05:00Z"); // New high score

  // Back to first user
  addScoreEvent(testRun, "user-1", 200, "2024-01-01T00:06:00Z"); // Another new high score

  // Run the test
  await testRun.run();

  // Check results
  const expectedMessages = [
    "🏆 New high score for user-1: 100 (previous: 0)\n",
    "🏆 New high score for user-1: 150 (previous: 100)\n",
    "🏆 New high score for user-2: 75 (previous: 0)\n",
    "🏆 New high score for user-2: 80 (previous: 75)\n",
    "🏆 New high score for user-1: 200 (previous: 150)\n",
  ];

  expect(memorySink.records).toHaveLength(expectedMessages.length);

  for (let i = 0; i < expectedMessages.length; i++) {
    const message = Buffer.from(memorySink.records[i]).toString();
    expect(message).toEqual(expectedMessages[i]);
  }
});

// Helper function to add score events to the test run
function addScoreEvent(
  testRun: TestRun,
  userID: string,
  score: number,
  timestamp: string
): void {
  const event: ScoreEvent = {
    userID: userID,
    score: score,
    timestamp,
  };

  const data = Buffer.from(JSON.stringify(event));
  testRun.addRecord(data);
}
