import type { KeyedEvent, OperatorHandler, Sink, Subject } from "reduction-ts";
import {
  ScalarMapCodec,
  TimestampValueCodec,
  Uint64ValueCodec
} from "reduction-ts/state";
import * as topology from "reduction-ts/topology";

// The ViewEvent represents a user viewing a channel
export interface ViewEvent {
  channelId: string;
  timestamp: Date;
}

// The SumEvent is the total number of views for a channel over a time interval
export interface SumEvent {
  channelId: string;
  timestamp: Date;
  sum: number;
}

// KeyEvent takes the raw data from our source and returns events with timestamps and keys
export function keyEvent(eventData: Uint8Array): KeyedEvent[] {
  const event: ViewEvent = JSON.parse(eventData.toString());

  return [
    {
      key: Buffer.from(event.channelId),
      timestamp: new Date(event.timestamp),
      value: Buffer.from([]),
    },
  ];
}

// Handler processes view events and maintains counts per minute for each channel.
// It emits sum events when a minute window closes.
export class Handler implements OperatorHandler {
  private sink: Sink<SumEvent>;
  private countsByMinute: topology.MapSpec<Date, number>;

  constructor(op: topology.Operator, sink: Sink<SumEvent>) {
    this.sink = sink;
    this.countsByMinute = new topology.MapSpec<Date, number>(
      op,
      "CountsByMinute",
      new ScalarMapCodec(new TimestampValueCodec(), new Uint64ValueCodec())
    );
  }

  onEvent(subject: Subject, event: KeyedEvent): void {
    // Load the map state for counts by minute
    const state = this.countsByMinute.stateFor(subject);

    // Truncate to minute (set seconds and milliseconds to 0)
    const minute = event.timestamp;
    minute.setSeconds(0, 0);

    const currentCount = state.get(minute) ?? 0;
    state.set(minute, currentCount + 1);

    // Set a timer to flush the minute's count once we reach the next minute
    const nextMinute = new Date(minute);
    nextMinute.setMinutes(minute.getMinutes() + 1);
    subject.setTimer(nextMinute);
  }

  onTimerExpired(subject: Subject, timer: Date): void {
    // Load the map state for counts by minute
    const state = this.countsByMinute.stateFor(subject);

    // Emit the sums for every earlier minute bucket
    for (const [minute, sum] of state.entries()) {
      if (minute < timer) {
        // Emit the count for the minute
        this.sink.collect(subject, {
          channelId: Buffer.from(subject.key).toString('utf8'),
          timestamp: minute,
          sum: sum,
        });

        // Clean up the emitted minute entry
        state.delete(minute);
      }
    }
  }
}
