package sessionwindow

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"reduction.dev/reduction-go/rxn"
)

// snippet-start: json-structs
// ViewEvent represents a user viewing a page
type ViewEvent struct {
	UserID    string    `json:"user_id"`
	Timestamp time.Time `json:"timestamp"`
}

// SessionEvent represents a user's continuous session on the site
type SessionEvent struct {
	UserID   string `json:"user_id"`
	Interval string `json:"interval"`
}

// snippet-end: json-structs

// snippet-start: session-state
// Session represents the internal state of an active session
type Session struct {
	Start time.Time
	End   time.Time
}

func (s Session) IsZero() bool {
	return s.Start.IsZero() && s.End.IsZero()
}

func (s Session) Interval() string {
	return fmt.Sprintf("%s/%s", s.Start.Format(time.RFC3339), s.End.Format(time.RFC3339))
}

// SessionCodec encodes and decodes Session values
type SessionCodec struct{}

// DecodeValue returns a Session from a string representation with ISO timestamps
func (c SessionCodec) Decode(b []byte) (Session, error) {
	parts := strings.Split(string(b), "/")
	if len(parts) != 2 {
		return Session{}, fmt.Errorf("invalid session format: %s", b)
	}

	start, err := time.Parse(time.RFC3339, parts[0])
	if err != nil {
		return Session{}, fmt.Errorf("invalid start time format: %w", err)
	}

	end, err := time.Parse(time.RFC3339, parts[1])
	if err != nil {
		return Session{}, fmt.Errorf("invalid end time format: %w", err)
	}

	return Session{start, end}, nil
}

// EncodeValue returns the string representation of a Session as ISO timestamps
func (c SessionCodec) Encode(value Session) ([]byte, error) {
	return []byte(value.Interval()), nil
}

// snippet-end: session-state

// Make sure SessionCodec implements the rxn.ValueCodec interface
var _ rxn.ValueCodec[Session] = SessionCodec{}

// snippet-start: handler-struct
// Handler is the session window operator handler
type Handler struct {
	Sink                rxn.Sink[SessionEvent]
	SessionSpec         rxn.ValueSpec[Session]
	InactivityThreshold time.Duration
}

// snippet-end: handler-struct

// snippet-start: key-event
func KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
	var event ViewEvent
	if err := json.Unmarshal(eventData, &event); err != nil {
		return nil, err
	}

	return []rxn.KeyedEvent{{
		Key:       []byte(event.UserID),
		Timestamp: event.Timestamp,
	}}, nil
}

// snippet-end: key-event

// snippet-start: on-event
// snippet-start: on-event-24h
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, event rxn.KeyedEvent) error {
	// cut-start: on-event-24h
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	eventTime := subject.Timestamp()

	if session.IsZero() {
		// Start a new session for the user
		session = Session{Start: eventTime, End: eventTime}
	} else if eventTime.After(session.End.Add(h.InactivityThreshold)) {
		// Emit the session event and start a new session
		h.Sink.Collect(ctx, SessionEvent{string(subject.Key()), session.Interval()})
		session = Session{Start: eventTime, End: eventTime}
	} else {
		// Extend the current session
		session = Session{Start: session.Start, End: eventTime}
	}

	sessionState.Set(session)
	subject.SetTimer(session.End.Add(h.InactivityThreshold))
	return nil
}

// snippet-end: on-event
func (h *Handler) OnEvent24h(ctx context.Context, subject rxn.Subject, event rxn.KeyedEvent) error {
	// cut-end: on-event-24h
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	eventTime := subject.Timestamp()

	if session.IsZero() {
		// Start a new session for the user
		session = Session{Start: eventTime, End: eventTime}
	} else if eventTime.After(session.End.Add(h.InactivityThreshold)) {
		// If inactive, emit the session event and start a new session
		h.Sink.Collect(ctx, SessionEvent{string(subject.Key()), session.Interval()})
		session = Session{Start: eventTime, End: eventTime}
		// highlight-start
	} else if eventTime.Sub(session.Start) >= 24*time.Hour {
		// If session reaches 24 hours, emit it and start a new one
		session.End = session.Start.Add(24 * time.Hour)
		h.Sink.Collect(ctx, SessionEvent{string(subject.Key()), session.Interval()})
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

// snippet-end: on-event-24h

// snippet-start: on-timer
func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()

	// Check whether this is the latest timer we set for this subject
	if timestamp.Equal(session.End.Add(h.InactivityThreshold)) {
		h.Sink.Collect(ctx, SessionEvent{string(subject.Key()), session.Interval()})
		sessionState.Drop()
	}
	return nil
}

// snippet-end: on-timer
