import type { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import * as topology from "reduction-ts/topology";

// snippet-start: key-event
// The ViewEvent represents a user viewing a page
export interface ViewEvent {
  userID: string;
  timestamp: Date;
}

// KeyEvent takes the raw data from our source and returns events with timestamps and keys
export function keyEvent(eventData: Uint8Array): KeyedEvent[] {
  const event: ViewEvent = JSON.parse(eventData.toString());

  return [
    {
      key: Buffer.from(event.userID),
      timestamp: new Date(event.timestamp),
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
  private countsByMinuteSpec: topology.MapSpec<Date, number>;
  private previousWindowSumSpec: topology.ValueSpec<number>;

  constructor(
    countsByMinuteSpec: topology.MapSpec<Date, number>, 
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
    const minute = new Date(event.timestamp);
    minute.setSeconds(0, 0); // Truncate to minute
    
    const currentCount = counts.get(minute) ?? 0;
    counts.set(minute, currentCount + 1);

    // Set a timer to flush the minute's count once we reach the next minute
    const nextMinute = new Date(minute);
    nextMinute.setMinutes(minute.getMinutes() + 1);
    subject.setTimer(nextMinute);
  }
  // snippet-end: on-event

  // snippet-start: on-timer
  onTimerExpired(subject: Subject, timestamp: Date): void {
    // Load the map state for counts by minute
    const counts = this.countsByMinuteSpec.stateFor(subject);

    // Our window starts 7 days ago and ends now
    const windowStart = new Date(timestamp);
    windowStart.setDate(windowStart.getDate() - 7);
    const windowEnd = timestamp;

    // Add to the window sum, delete the minute if it's outside the window, or
    // retain the minute sum for a future window
    let windowSum = 0;
    for (const [minute, sum] of counts.entries()) {
      if (minute >= windowStart && minute < windowEnd) {
        windowSum += sum;
      } else if (minute < windowStart) {
        counts.delete(minute);
      }
    }

    // Only collect a window sum if it changed
    const prevWindowSum = this.previousWindowSumSpec.stateFor(subject);
    if (prevWindowSum.value !== windowSum) {
      this.sink.collect(subject, {
        userID: Buffer.from(subject.key).toString('utf8'),
        interval: `${windowStart.toISOString()}/${windowEnd.toISOString()}`,
        totalViews: windowSum,
      });
      prevWindowSum.setValue(windowSum);
    }

    // Set a timer to emit future windows in case the user gets no more view events
    // highlight-start
    if (counts.size > 0) {
      const watermark = new Date(subject.watermark);
      const nextMinute = new Date(watermark);
      nextMinute.setSeconds(0, 0); // Truncate to minute
      nextMinute.setMinutes(nextMinute.getMinutes() + 1);
      subject.setTimer(nextMinute);
    }
    // highlight-end
  }
  // snippet-end: on-timer
}
