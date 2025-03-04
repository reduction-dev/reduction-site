import type { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import { ValueCodec } from "reduction-ts/state";
import * as topology from "reduction-ts/topology";

// snippet-start: json-structs
// The ViewEvent represents a user viewing a page
export interface ViewEvent {
  userID: string;
  timestamp: Date;
}

// SessionEvent represents a user's continuous session on the site
export interface SessionEvent {
  userID: string;
  interval: string;
}
// snippet-end: json-structs

// snippet-start: session-state
// Session represents the internal state of an active session
export interface Session {
  start: Date;
  end: Date;
}

export function createSessionEvent(userID: Uint8Array, session: Session): SessionEvent {
  return {
    userID: Buffer.from(userID).toString('utf8'),
    interval: `${session.start.toISOString()}/${session.end.toISOString()}`,
  };
}

export const sessionCodec = new ValueCodec<Session | undefined>({
  encode(value) {
    if (!value) {
      return Buffer.alloc(0);
    }

    return Buffer.from(`${value.start.getTime()}/${value.end.getTime()}`);
  },

  decode(data) {
    if (data.length === 0) {
      return undefined;
    }

    const [startTime, endTime] = Buffer.from(data)
      .toString('utf8')
      .split('/')
      .map(Number);

    return { start: new Date(startTime), end: new Date(endTime) };
  }
});
// snippet-end: session-state

// snippet-start: key-event
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

// snippet-start: handler-struct
/**
 * Handler processes view events and maintains session windows.
 */
export class Handler implements OperatorHandler {
  private sink: topology.Sink<SessionEvent>;
  private sessionSpec: topology.ValueSpec<Session | undefined>;
  private inactivityThreshold: number;

  constructor(
    sessionSpec: topology.ValueSpec<Session | undefined>,
    sink: topology.Sink<SessionEvent>,
    inactivityThreshold: number
  ) {
    this.sink = sink;
    this.sessionSpec = sessionSpec;
    this.inactivityThreshold = inactivityThreshold;
  }
// snippet-end: handler-struct

  // snippet-start: on-event
  onEvent(subject: Subject, event: KeyedEvent): void {
    const sessionState = this.sessionSpec.stateFor(subject);
    let session = sessionState.value;
    const eventTime = event.timestamp;

    if (session === undefined) {
      // Start a new session for the user
      session = { start: eventTime, end: eventTime };
    } else if (eventTime > new Date(session!.end.getTime() + this.inactivityThreshold)) {
      // Emit the session event and start a new session
      this.sink.collect(subject, createSessionEvent(subject.key, session!));
      session = { start: eventTime, end: eventTime };
    } else {
      // Extend the current session
      session = { start: session!.start, end: eventTime };
    }

    sessionState.setValue(session);
    subject.setTimer(new Date(session.end.getTime() + this.inactivityThreshold));
  }
  // snippet-end: on-event

  // snippet-start: on-timer
  onTimerExpired(subject: Subject, timestamp: Date): void {
    const sessionState = this.sessionSpec.stateFor(subject);
    const session = sessionState.value;

    // Check whether this is the latest timer we set for this subject
    if (session && timestamp.getTime() === session.end.getTime() + this.inactivityThreshold) {
      this.sink.collect(subject, createSessionEvent(subject.key, session));
      sessionState.drop();
    }
  }
  // snippet-end: on-timer

  // snippet-start: on-event-24h
  onEvent24h(subject: Subject, event: KeyedEvent): void {
    const sessionState = this.sessionSpec.stateFor(subject);
    let session = sessionState.value;
    const eventTime = event.timestamp;

    if (session === undefined) {
      // Start a new session for the user
      session = { start: eventTime, end: eventTime };
    } else if (eventTime > new Date(session!.end.getTime() + this.inactivityThreshold)) {
      // If inactive, emit the session event and start a new session
      this.sink.collect(subject, createSessionEvent(subject.key, session!));
      session = { start: eventTime, end: eventTime };
    } else if (eventTime.getTime() - session!.start.getTime() >= 24 * 60 * 60 * 1000) {
      // If session reaches 24 hours, emit it and start a new one
      const endTime = new Date(session!.start.getTime() + 24 * 60 * 60 * 1000);
      this.sink.collect(subject, createSessionEvent(subject.key, { ...session!, end: endTime }));
      session = { start: eventTime, end: eventTime };
    } else {
      // Just extend the current session
      session = { start: session!.start, end: eventTime };
    }

    sessionState.setValue(session);
    subject.setTimer(new Date(session.end.getTime() + this.inactivityThreshold));
  }
  // snippet-end: on-event-24h
}
