package slidingwindow

import (
	"context"
	"encoding/json"
	"time"

	"reduction.dev/reduction-go/rxn"
)

// snippet-start: key-event
// ViewEvent represents a user viewing a page
type ViewEvent struct {
	UserID    string    `json:"user_id"`
	Timestamp time.Time `json:"timestamp"`
}

// KeyEvent takes the raw data from our source and returned events with timestamps and keys
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

// snippet-start: handler
// SumEvent represents the sum of views for a user over a time interval
type SumEvent struct {
	UserID     string `json:"user_id"`
	Interval   string `json:"interval"`
	TotalViews int    `json:"total_views"`
}

type Handler struct {
	Sink                  rxn.Sink[SumEvent]
	CountsByMinuteSpec    rxn.MapSpec[time.Time, int]
	PreviousWindowSumSpec rxn.ValueSpec[int]
}

// snippet-end: handler

// snippet-start: on-event
func (h *Handler) OnEvent(ctx context.Context, subject rxn.Subject, event rxn.KeyedEvent) error {
	// Load the map state for counts by minute
	counts := h.CountsByMinuteSpec.StateFor(subject)

	// Increment the count for the event's minute
	minute := subject.Timestamp().Truncate(time.Minute)
	sum, _ := counts.Get(minute)
	counts.Set(minute, sum+1)

	// Set a timer to flush the minute's count once we reach the next minute
	subject.SetTimer(minute.Add(time.Minute))
	return nil
}

// snippet-end: on-event

// snippet-start: on-timer
func (h *Handler) OnTimerExpired(ctx context.Context, subject rxn.Subject, timestamp time.Time) error {
	// Load the map state for counts by minute
	counts := h.CountsByMinuteSpec.StateFor(subject)

	// Our window starts 7 days ago and ends now
	windowStart := timestamp.Add(-7 * 24 * time.Hour)
	windowEnd := timestamp

	// Add to the window sum, delete the minute if it's outside the window, or
	// retain the minute sum for a future window
	windowSum := 0
	for minute, sum := range counts.All() {
		if !minute.Before(windowStart) && minute.Before(windowEnd) {
			windowSum += sum
		} else if minute.Before(windowStart) {
			counts.Delete(minute)
		}
	}

	// Only collect a window sum if it changed
	prevWindowSum := h.PreviousWindowSumSpec.StateFor(subject)
	if prevWindowSum.Value() != windowSum {
		h.Sink.Collect(ctx, SumEvent{
			UserID:     string(subject.Key()),
			Interval:   windowStart.Format(time.RFC3339) + "/" + windowEnd.Format(time.RFC3339),
			TotalViews: windowSum,
		})
		prevWindowSum.Set(windowSum)
	}

	// Set a timer to emit future windows in case the user gets no more view events
	// highlight-start
	if counts.Size() > 0 {
		subject.SetTimer(subject.Watermark().Truncate(time.Minute).Add(time.Minute))
	}
	// highlight-end
	return nil
}

// snippet-end: on-timer
