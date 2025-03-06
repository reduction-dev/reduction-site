import assert from "node:assert";
import { KeyedEvent, OperatorHandler, Subject } from "reduction-ts";
import { ValueCodec } from "reduction-ts/state";
import { Temporal } from "reduction-ts/temporal";
import * as topology from "reduction-ts/topology";

// snippet-start: json-structs
// The ViewEvent represents a user viewing a page
export interface ViewEvent {
  userID: string;
  timestamp: string;
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
  start: Temporal.Instant;
  end: Temporal.Instant;
}

// createSessionEvent creates a SessionEvent for the sink
function createSessionEvent(userID: Uint8Array, session: Session): SessionEvent {
  return {
    userID: Buffer.from(userID).toString(),
    interval: sessionInterval(session),
  };
}

// Returns a interval string like "2025-01-01T00:00Z/2025-01-01T12:50Z".
function sessionInterval(session: Session): string {
  return [
    session.start.toString({ smallestUnit: "minute" }),
    session.end.toString({ smallestUnit: "minute" }),
  ].join("/");
}

// This is a custom codec to serialize and deserialize the session state.
export const sessionCodec = new ValueCodec<Session | undefined>({
  encode(value) {
    assert(value, "will only persist defined values");
    return Buffer.from(sessionInterval(value));
  },

  decode(data) {
    const [start, end] = Buffer.from(data)
      .toString("utf8")
      .split("/")
      .map(Temporal.Instant.from);

    return { start, end };
  },
});
// snippet-end: session-state

// snippet-start: key-event
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

// snippet-start: handler-struct
/**
 * Handler processes view events and maintains session windows.
 */
export class Handler implements OperatorHandler {
  private sink: topology.Sink<SessionEvent>;
  private sessionSpec: topology.ValueSpec<Session | undefined>;
  private sessionTimeout: Temporal.Duration;

  constructor(
    sessionSpec: topology.ValueSpec<Session | undefined>,
    sink: topology.Sink<SessionEvent>,
    inactivityThreshold: Temporal.Duration
  ) {
    this.sink = sink;
    this.sessionSpec = sessionSpec;
    this.sessionTimeout = inactivityThreshold;
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
    } else if (
      Temporal.Duration.compare(session.end.until(eventTime), this.sessionTimeout) > 0
    ) {
      // Emit the session event and start a new session
      this.sink.collect(subject, createSessionEvent(subject.key, session));
      session = { start: eventTime, end: eventTime };
    } else {
      // Extend the current session
      session = { ...session, end: eventTime };
    }

    sessionState.setValue(session);
    subject.setTimer(session.end.add(this.sessionTimeout));
  }
  // snippet-end: on-event

  // snippet-start: on-timer
  onTimerExpired(subject: Subject, timestamp: Temporal.Instant): void {
    const sessionState = this.sessionSpec.stateFor(subject);
    const session = sessionState.value;
    assert(session, "session must exist");

    // Determine if this is the latest timer we set for this subject
    const isLatestTimer = timestamp.equals(session.end.add(this.sessionTimeout));
    if (isLatestTimer) {
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
    const maxLength = Temporal.Duration.from({ hours: 24 });

    if (session === undefined) {
      // Start a new session for the user
      session = { start: eventTime, end: eventTime };
    } else if (
      Temporal.Duration.compare(session.end.until(eventTime), this.sessionTimeout) > 0
    ) {
      // Emit the session event and start a new session
      this.sink.collect(subject, createSessionEvent(subject.key, session));
      session = { start: eventTime, end: eventTime };
      // highlight-start
    } else if (
      Temporal.Duration.compare(session.start.until(eventTime), maxLength) >= 0
    ) {
      // The session reached 24 hours, emit a 24h session and start a new one
      const end = session.start.add(maxLength);
      this.sink.collect(
        subject,
        createSessionEvent(subject.key, { ...session, end })
      );
      session = { start: end, end };
      // highlight-end
    } else {
      // Extend the current session
      session = { ...session, end: eventTime };
    }

    sessionState.setValue(session);
    subject.setTimer(session.end.add(this.sessionTimeout));
  }
  // snippet-end: on-event-24h
}
