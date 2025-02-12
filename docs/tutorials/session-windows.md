---
sidebar_position: 3
---

# Session Windows

## Overview

This tutorial covers building a Reduction job to emit session windows.  A
session window represents a period of continuous activity that ends after a
period of inactivity. If you want to capture a logical grouping of events
related to a user like a single online shopping experience you'll want to use
session windows.

<p>
  <figure class="inline-block">
    <img src="/img/session-windows.png" width="536" height="226.5"/>
    <figcaption class="italic text-center">
      Session windows split by gaps of inactivity
    </figcaption>
  </figure>
</p>

:::info[My Introduction to Stream Processing]
Session windows were my first introduction to stateful stream processing. My
team needed capture user sessions that ended 15 minutes after the last session
event. I was surprised when a developer's implementation was more complicated
than the high-level session window API I expected. Just a couple simple sounding
requirements like "sessions can't be more than 24 hours long" had fundamentally
changed the approach. A goal of Reduction is accommodate new requirements
without making developers learn an entirely new set of concepts.
:::

For this example we'll work with view events that represent a user viewing a website:

```json
{
  "user_id": "user-a",
  "timestamp": "2025-01-30T12:45:10Z"
}
```

And we'll emit events representing the time intervals that a user was actively on the site:

```json
{
  "user_id": "user-a",
  "interval": "2025-01-30T12:45:00Z/2025-01-30T13:00:00Z"
}
```

We'll use these two structs to decode those JSON objects:

```go
// ViewEvent represents a user viewing a page
type ViewEvent struct {
	UserID    string `json:"user_id"`
	Timestamp string `json:"timestamp"`
}

// SessionEvent represents a user's continuous session on the site
type SessionEvent struct {
	UserID   string `json:"user_id"`
	Interval string `json:"interval"`
}
```

## Keying Events

First we'll make a function to transform our JSON page view events into
Reduction's `KeyedEvent` type.

```go
type ViewEvent struct {
	UserID    string `json:"user_id"`
	Timestamp string `json:"timestamp"`
}

func KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
	var event ViewEvent
	if err := json.Unmarshal(eventData, &event); err != nil {
		return nil, err
	}

	timestamp, err := time.Parse(time.RFC3339, event.Timestamp)
	if err != nil {
		return nil, err
	}

	return []rxn.KeyedEvent{{
		Key:       []byte(event.UserID),
		Timestamp: timestamp,
	}}, nil
}
```

## Representing Session State

For session windows, we need to track the start and end time of each active
session. We'll create a `Session` type to represent this state and a codec to
handle binary encoding and decoding of the session data.

```go
type Session struct {
	Start time.Time
	End   time.Time
}

// SessionEvent returns an event to send to the sink
func (s Session) SessionEvent(userID []byte) SessionEvent {
	return SessionEvent{
		UserID:   string(userID),
		Interval: fmt.Sprintf("%s/%s", s.Start.Format(time.RFC3339), s.End.Format(time.RFC3339)),
	}
}

func (s Session) IsZero() bool {
	return s.Start.IsZero() && s.End.IsZero()
}

type SessionCodec struct{}

func (s SessionCodec) EncodeValue(value Session) ([]byte, error) {
	b := make([]byte, 16)
	binary.BigEndian.PutUint64(b[:8], uint64(value.Start.UTC().UnixNano()))
	binary.BigEndian.PutUint64(b[8:], uint64(value.End.UTC().UnixNano()))
	return b, nil
}

func (s SessionCodec) DecodeValue(b []byte) (Session, error) {
	if len(b) != 16 {
		return Session{}, fmt.Errorf("invalid session data length: %d", len(b))
	}
	return Session{
		Start: time.Unix(0, int64(binary.BigEndian.Uint64(b[:8]))).UTC(),
		End:   time.Unix(0, int64(binary.BigEndian.Uint64(b[8:]))).UTC(),
	}, nil
}
```

## Processing Each Event

Our handler uses a ValueSpec to manage session state an accepts an inactivity
threshold that determines when a session should be closed.

```go
type Handler struct {
	Sink                connectors.SinkRuntime[SessionEvent]
	SessionSpec         rxn.ValueSpec[Session]
	InactivityThreshold time.Duration
}
```

In the `OnEvent` method, we'll either:
* Start a new session if we have no existing session for the user
* Extend the current session if the event falls within its inactivity threshold
* Close the current session and start a new one

```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	eventTime := subject.Timestamp()

	if session.IsZero() {
		// Start a new session for the user
		session = Session{Start: eventTime, End: eventTime}
	} else if eventTime.After(session.End.Add(h.InactivityThreshold)) {
		// Emit the session event and start a new session
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		session = Session{Start: eventTime, End: eventTime}
	} else {
		// Extend the current session
		session = Session{Start: session.Start, End: eventTime}
	}

	sessionState.Set(session)
	// highlight-next-line
	subject.SetTimer(session.End.Add(h.InactivityThreshold))
	return nil
}
```

By observing the events of a user we can tell when there's a 15m gap but what
happens if we never get another event from the user? By setting a timer to
trigger after 15m passes with `subject.SetTimer`, we can close the session in
the `OnTimerExpired` method without needing to wait for another event from the
user.

## Processing Timers

When a timer expires, we check if the session should be closed based on the
inactivity threshold. If so, we emit the session event and clean up the session
state:

```go
func (h *Handler) OnTimerExpired(ctx context.Context, subject *rxn.Subject, timestamp time.Time) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	if timestamp.Equal(session.End.Add(h.InactivityThreshold)) {
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		sessionState.Drop()
	}
	return nil
}
```

## Testing

Let's test our session window implementation with a series of events that should
create two distinct sessions:

```go
func TestSessionWindow(t *testing.T) {
	job := &jobs.Job{}
	source := embedded.NewSource(job, "Source", &embedded.SourceParams{
		KeyEvent: sessionwindow.KeyEvent,
	})
	memorySink := memory.NewSink[sessionwindow.SessionEvent](job, "Sink")
	operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
		Handler: func(op *jobs.Operator) rxn.OperatorHandler {
			return &sessionwindow.Handler{
				Sink:                memorySink,
				SessionSpec:         rxn.NewValueSpec(op, "Session", sessionwindow.SessionCodec{}),
				InactivityThreshold: 15 * time.Minute,
			}
		},
	})
	source.Connect(operator)
	operator.Connect(memorySink)

	tr := rxn.NewTestRun(job)

	// First session with events close together
	addViewEvent(tr, "user", "2025-01-01T00:01:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:05:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:10:00Z")
	tr.AddWatermark()

	// Gap in activity (>15 minutes)

	// Second session
	addViewEvent(tr, "user", "2025-01-01T00:30:00Z")
	addViewEvent(tr, "user", "2025-01-01T00:35:00Z")
	tr.AddWatermark()

	// Events from another user advances event time
	addViewEvent(tr, "other-user", "2025-01-01T01:00:00Z")
	tr.AddWatermark()

	require.NoError(t, tr.Run())

	// Filter events to just focus on "user"
	userEvents := []sessionwindow.SessionEvent{}
	for _, event := range memorySink.Records {
		if event.UserID == "user" {
			userEvents = append(userEvents, event)
		}
	}

	assert.Equal(t, []sessionwindow.SessionEvent{
		{UserID: "user", Interval: "2025-01-01T00:01:00Z/2025-01-01T00:10:00Z"},
		{UserID: "user", Interval: "2025-01-01T00:30:00Z/2025-01-01T00:35:00Z"},
	}, userEvents)
}
```

## Wrapping Up

We've implented session windows that close after 15 minutes of inactivity. Now
how would we manage that new requirement I mentioned earlier: "sessions cannot
exceed 24h"?

We can add a new condition to our `OnEvent` handler for this requirement:

```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	eventTime := subject.Timestamp()

	if session.IsZero() {
		// Start a new session for the user
		session = Session{Start: eventTime, End: eventTime}
	} else if eventTime.After(session.End.Add(h.InactivityThreshold)) {
		// If inactive, emit the session event and start a new session
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		session = Session{Start: eventTime, End: eventTime}
	// highlight-start
	} else if eventTime.Sub(session.Start) >= 24 * time.Hour {
		// If session reaches 24 hours, emit it and start a new one
        session.End = session.Start.Add(24 * time.Hour)
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		session = Session{Start: eventTime, End: eventTime}
	// highlight-end
	} else {
		// Just extend the current session
		session = Session{Start: session.Start, End: eventTime}
	}

  sessionState.Set(session)
  subject.SetTimer(session.End.Add(h.InactivityThreshold))
  return nil
}
```
