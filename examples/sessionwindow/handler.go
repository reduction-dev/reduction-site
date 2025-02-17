package sessionwindow

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"

	"reduction.dev/reduction-go/connectors"
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

// SessionCodec encodes and decodes Session values
type SessionCodec struct{}

// DecodeValue returns a Session, interpreting the binary data as two uint64 timestamps
func (c SessionCodec) DecodeValue(b []byte) (Session, error) {
	if len(b) != 16 { // 8 bytes for each uint64
		return Session{}, fmt.Errorf("invalid session data length: %d", len(b))
	}
	return Session{
		Start: time.Unix(0, int64(binary.BigEndian.Uint64(b[:8]))).UTC(),
		End:   time.Unix(0, int64(binary.BigEndian.Uint64(b[8:]))).UTC(),
	}, nil
}

// EncodeValue returns the binary representation of a Session as two uint64 timestamps
func (c SessionCodec) EncodeValue(value Session) ([]byte, error) {
	b := make([]byte, 16)
	binary.BigEndian.PutUint64(b[:8], uint64(value.Start.UTC().UnixNano()))
	binary.BigEndian.PutUint64(b[8:], uint64(value.End.UTC().UnixNano()))
	return b, nil
}

// snippet-end: session-state

// Make sure SessionCodec implements the rxn.ValueStateCodec interface
var _ rxn.ValueStateCodec[Session] = SessionCodec{}

// snippet-start: handler-struct
// Handler is the session window operator handler
type Handler struct {
	Sink                connectors.SinkRuntime[SessionEvent]
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
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, event rxn.KeyedEvent) error {
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
	subject.SetTimer(session.End.Add(h.InactivityThreshold))
	return nil
}

// snippet-end: on-event

// snippet-start: on-timer
func (h *Handler) OnTimerExpired(ctx context.Context, subject *rxn.Subject, timestamp time.Time) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()

	// Check whether this is the latest timer we set for this subject
	if timestamp.Equal(session.End.Add(h.InactivityThreshold)) {
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		sessionState.Drop()
	}
	return nil
}

// snippet-end: on-timer

func (h *Handler) OnEvent24h(ctx context.Context, subject *rxn.Subject, event rxn.KeyedEvent) error {
	sessionState := h.SessionSpec.StateFor(subject)
	session := sessionState.Value()
	eventTime := subject.Timestamp()

	// snippet-start: on-event-24h
	if session.IsZero() {
		// Start a new session for the user
		session = Session{Start: eventTime, End: eventTime}
	} else if eventTime.After(session.End.Add(h.InactivityThreshold)) {
		// If inactive, emit the session event and start a new session
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		session = Session{Start: eventTime, End: eventTime}
		// highlight-start
	} else if eventTime.Sub(session.Start) >= 24*time.Hour {
		// If session reaches 24 hours, emit it and start a new one
		session.End = session.Start.Add(24 * time.Hour)
		h.Sink.Collect(ctx, session.SessionEvent(subject.Key()))
		session = Session{Start: eventTime, End: eventTime}
		// highlight-end
	} else {
		// Just extend the current session
		session = Session{Start: session.Start, End: eventTime}
	}
	// snippet-end: on-event-24h

	sessionState.Set(session)
	subject.SetTimer(session.End.Add(h.InactivityThreshold))
	return nil
}
