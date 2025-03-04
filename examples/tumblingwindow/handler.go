package tumblingwindow

import (
	"context"
	"encoding/json"
	"time"

	"reduction.dev/reduction-go/rxn"
)

// snippet-start: handler
// The SumEvent is the total number of views for a channel over a time interval
type SumEvent struct {
	ChannelID string    `json:"channel_id"`
	Timestamp time.Time `json:"timestamp"`
	Sum       int       `json:"sum"`
}

// Handler processes view events and maintains counts per minute for each channel.
// It emits sum events when a minute window closes.
type Handler struct {
	// Sink sends aggregated view counts to the configured destination
	Sink rxn.Sink[SumEvent]
	// CountsByMinute stores the running count of views per minute
	CountsByMinute rxn.MapSpec[time.Time, int]
}

// snippet-end: handler

// snippet-start: key-event
// The ViewEvent represents a user viewing a channel
type ViewEvent struct {
	ChannelID string    `json:"channel_id"`
	Timestamp time.Time `json:"timestamp"`
}

// KeyEvent takes the raw data from our source and returns events with timestamps and keys
func KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
	var event ViewEvent
	if err := json.Unmarshal(eventData, &event); err != nil {
		return nil, err
	}

	return []rxn.KeyedEvent{{
		Key:       []byte(event.ChannelID),
		Timestamp: event.Timestamp,
	}}, nil
}

// snippet-end: key-event

// snippet-start: on-event
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, event rxn.KeyedEvent) error {
	// Load the map state for counts by minute
	state := h.CountsByMinute.StateFor(subject)

	// Increment the count for the event's minute
	minute := subject.Timestamp().Truncate(time.Minute)
	sum, _ := state.Get(minute)
	state.Set(minute, sum+1)

	// Set a timer to flush the minute's count once we reach the next minute
	subject.SetTimer(minute.Add(time.Minute))
	return nil
}

// snippet-end: on-event

// snippet-start: on-timer
func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	// Load the map state for counts by minute
	state := h.CountsByMinute.StateFor(subject)

	// Emit the sums for every earlier minute bucket
	for minute, sum := range state.All() {
		if minute.Before(timestamp) {
			// Emit the count for the minute
			h.Sink.Collect(ctx, SumEvent{
				ChannelID: string(subject.Key()),
				Timestamp: minute,
				Sum:       sum,
			})
			// Clean up the emitted minute entry
			state.Delete(minute)
		}
	}
	return nil
}

// snippet-end: on-timer

var _ rxn.OperatorHandler = (*Handler)(nil)
