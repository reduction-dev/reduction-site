import { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import { Temporal } from "reduction-ts/temporal";
import * as topology from "reduction-ts/topology";

// snippet-start: key-event
// The ViewEvent represents a user viewing a page
export interface ViewEvent {
  userID: string;
  timestamp: string;
}

// KeyEvent takes the raw data from our source and returns events with timestamps and keys
export function keyEvent(eventData: Uint8Array): KeyedEvent[] {
  const event: ViewEvent = JSON.parse(eventData.toString());

  return [
    {
      key: Buffer.from(event.userID),
      timestamp: Temporal.Instant.from(event.timestamp),
      value: Buffer.from([]),
    },
  ];
}
// snippet-end: key-event

// snippet-start: handler
// SumEvent represents the sum of views for a user over a time interval
export interface SumEvent {
  userID: string;
  interval: string;
  totalViews: number;
}

/**
 * Handler processes view events and maintains a sliding window of view counts.
 */
export class Handler implements OperatorHandler {
  private sink: topology.Sink<SumEvent>;
  private countsByMinuteSpec: topology.MapSpec<Temporal.Instant, number>;
  private previousWindowSumSpec: topology.ValueSpec<number>;

  constructor(
    countsByMinuteSpec: topology.MapSpec<Temporal.Instant, number>,
    previousWindowSumSpec: topology.ValueSpec<number>,
    sink: topology.Sink<SumEvent>
  ) {
    this.countsByMinuteSpec = countsByMinuteSpec;
    this.previousWindowSumSpec = previousWindowSumSpec;
    this.sink = sink;
  }
  // snippet-end: handler

  // snippet-start: on-event
  onEvent(subject: Subject, event: KeyedEvent): void {
    // Load the map state for counts by minute
    const counts = this.countsByMinuteSpec.stateFor(subject);

    // Increment the count for the event's minute
    const minute = event.timestamp.round({
      smallestUnit: "minute",
      roundingMode: "trunc",
    });
    counts.set(minute, (counts.get(minute) ?? 0) + 1);

    // Set a timer to flush the minute's count once we reach the next minute
    subject.setTimer(minute.add({ minutes: 1 }));
  }
  // snippet-end: on-event

  // snippet-start: on-timer
  onTimerExpired(subject: Subject, windowEnd: Temporal.Instant): void {
    // Load the map state for counts by minute
    const counts = this.countsByMinuteSpec.stateFor(subject);

    // Our window starts 7 days ago and ends now
    const windowStart = windowEnd.subtract({ hours: 7 * 24 });

    let windowSum = 0;
    for (const [minute, sum] of counts.entries()) {
      if (
        Temporal.Instant.compare(minute, windowStart) >= 0 &&
        Temporal.Instant.compare(minute, windowEnd) < 0
      ) {
        // Add to window sum when the minute is within the window
        windowSum += sum;
      } else if (Temporal.Instant.compare(minute, windowStart) < 0) {
        // Delete the minute if the window has passed
        counts.delete(minute);
      } else {
        // Retain the minute sum for a future window
      }
    }

    // Only collect a window sum if it changed
    const prevWindowSum = this.previousWindowSumSpec.stateFor(subject);
    if (prevWindowSum.value !== windowSum) {
      this.sink.collect(subject, {
        userID: Buffer.from(subject.key).toString("utf8"),
        interval: [
          windowStart.toString({ smallestUnit: "minute" }),
          windowEnd.toString({ smallestUnit: "minute" }),
        ].join("/"),
        totalViews: windowSum,
      });
      prevWindowSum.setValue(windowSum);
    }

    // Set a timer to emit future windows in case the user gets no more view events
    // highlight-start
    if (counts.size > 0) {
      const nextMinute = subject.watermark
        .round({ smallestUnit: "minute", roundingMode: "trunc" })
        .add({ minutes: 1 });
      subject.setTimer(nextMinute);
    }
    // highlight-end
  }
  // snippet-end: on-timer
}
