import type { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import * as topology from "reduction-ts/topology";
import { Temporal } from "reduction-ts/temporal";

// snippet-start: view-event
// The ViewEvent represents a user viewing a channel
export interface ViewEvent {
  channelId: string;
  timestamp: string;
}
// snippet-end: view-event

// snippet-start: key-event
// KeyEvent takes the raw data from our source and returns events with timestamps and keys
export function keyEvent(eventData: Uint8Array): KeyedEvent[] {
  const event: ViewEvent = JSON.parse(Buffer.from(eventData).toString());

  return [
    {
      key: Buffer.from(event.channelId),
      timestamp: Temporal.Instant.from(event.timestamp),
      value: Buffer.from([]),
    },
  ];
}
// snippet-end: key-event

// snippet-start: handler
// The SumEvent is the total number of views for a channel over a time interval
export interface SumEvent {
  channelId: string;
  timestamp: Temporal.Instant;
  sum: number;
}

/**
 * Handler processes view events and maintains counts per minute for each channel.
 */
export class Handler implements OperatorHandler {
  private sink: topology.Sink<SumEvent>;
  private countsByMinuteSpec: topology.MapSpec<Temporal.Instant, number>;

  constructor(
    countSpec: topology.MapSpec<Temporal.Instant, number>,
    sink: topology.Sink<SumEvent>
  ) {
    this.sink = sink;
    this.countsByMinuteSpec = countSpec;
  }
  // cut-start: handler

  // snippet-start: on-event
  onEvent(subject: Subject, event: KeyedEvent): void {
    // Load the map state for counts by minute
    const state = this.countsByMinuteSpec.stateFor(subject);

    // Truncate to minute (set seconds and milliseconds to 0)
    const minute = event.timestamp.round({
      smallestUnit: "minute",
      roundingMode: "trunc",
    });

    // Increment the count
    state.set(minute, (state.get(minute) ?? 0) + 1);

    // Set a timer to flush the minute's count once we reach the next minute
    subject.setTimer(minute.add({ minutes: 1 }));
  }
  // snippet-end: on-event

  // snippet-start: on-timer
  onTimerExpired(subject: Subject, timer: Temporal.Instant): void {
    // Load the map state for counts by minute
    const state = this.countsByMinuteSpec.stateFor(subject);

    // Emit the sums for every earlier minute bucket
    for (const [minute, sum] of state.entries()) {
      if (Temporal.Instant.compare(minute, timer) < 0) {
        // Emit the count for the minute
        this.sink.collect(subject, {
          channelId: Buffer.from(subject.key).toString("utf8"),
          timestamp: minute,
          sum: sum,
        });

        // Clean up the emitted minute entry
        state.delete(minute);
      }
    }
  }
  // snippet-end: on-timer
  // cut-end: handler
}
// snippet-end: handler
