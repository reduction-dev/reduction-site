---
sidebar_position: 2
---

# Sliding Windows

## Overview

This tutorial covers sliding windows of data. Sliding, like tumbling windows,
are uniform across subjects but overlap with each other. If you want a user's
total page views during the last seven days but want that data updated every
minute you want a sliding window.

<p>
  <figure class="inline-block">
    <img src="/img/sliding-windows.png" width="536.5" height="115.5"/>
    <figcaption class="italic text-center">
      Three sliding windows closing for a stream of events
    </figcaption>
  </figure>
</p>

If you've used other stream processing engines you may have been burned by
sliding windows. If you plan to process about 100 MB of data in each window for
a week and want to slide it by a minute, a naive implementation would result in
1 TB of data in state. The trick is to do some aggregation by bucket as events
arrive and progressively drop data from the tail of a sliding window while
adding it to the head.

<p>
  <figure class="inline-block">
    <img src="/img/sliding-window-algorithm.png" width="609" height="423"/>
    <figcaption class="italic text-center">
      Closing a sliding window
    </figcaption>
  </figure>
</p>

More than tumbling windows, there's some nuance to sliding windows. For instance
if just one event arrives for a user is it critical to emit all 10,080 windows
for a minute-sliding week or do we just care when the value changes?

As we implement this "total page views count by user in the last seven days"
feature, we'll focus on the common use case of keeping a database fresh. This
means that we only need to emit data for a window when the value changes.

For this job, the incoming events represent page view events by a user:

```json
{
  "user_id": "user-a",
  "timestamp": "2025-01-30T12:45:10Z"
}
```

And our goal is to emit a new event with the weekly sum every minute:

```json
{
  "user_id": "user-a",
  "total_views": 5
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

## Processing Each Event

In the `OnEvent` method of our operator we'll store state in a map where the
keys are timestamps truncated to the minute and the values are the sums for each
minute. We'll also track the previous window sum to only emit when it changes.

```go
// Handler is the sliding window operator handler
type Handler struct {
	Sink                  connectors.SinkRuntime[SumEvent]
	CountsByMinuteSpec    rxn.MapSpec[time.Time, int]
	PreviousWindowSumSpec rxn.ValueSpec[int]
}
```

Then in `OnEvent` we'll load the map state, increment the sum for the event's
minute, and set a timer to fire on the next minute.

```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
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
```

So whenever an event comes in, we'll set a timer for the next minute. But we
also need to consider what happens when the events stop for this user. We still
need to collect new data as the windows continue to slide and the total number
of events decreases. We could set a timer for every future sliding window this
event will be part of but for our use case we can minimize the number of timers
using the `OnTimerExpired` method.

## Processing Timers

When a timer fires, we'll sum all buckets relevant for the current window,
remove any obsolete minute buckets from our map, and only emit when the total
changes.

First let's create an object for the new JSON event we want to send to our sink.

```go
type SumEvent struct {
	UserID     string `json:"user_id"`
	Interval   string `json:"interval"`
	TotalViews int    `json:"total_views"`
}
```

Next, let's write the `OnTimerExpired` method to send these events.

```go
func (h *Handler) OnTimerExpired(ctx context.Context, subject *rxn.Subject, timestamp time.Time) error {
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
		subject.UpdateState(prevWindowSum)
	}

	// Set a timer to emit future windows in case the user gets no more view events
	if counts.Size() > 0 {
		subject.SetTimer(rxn.CurrentWatermark(ctx).Truncate(time.Minute).Add(time.Minute))
	}
	return nil
}
```

One optimization here is that we only set another timer when there is some value
in the window. When the window value is zero, we can rely on any new event
setting another timer.

Also notice that when we set the next timer, we set it based on the current
watermark and not just the expired timer value. Remember that to be completely
correct we should assume that timers can fire arbitrarily late. If a timer fires
more than a minute late and we set a timer for the following minute based on
that value, that next timer will be dropped if it's past the watermark.

:::note[Watermarks]
Watermark is short for "low watermark" and is a common concept in stream
processing. Incoming events don't have to be in strict order, but at some point
the job has to decide when it can safely fire a timer and expect to have seen
all the earlier events. That moving threshold is the watermark.
:::

## Testing

For our testing we can use the `TestRun` utility to get the results of running
our handler against a set of ViewEvents.

First we set up our job with a source, sink, and operator with our handler:

```go
job := &jobs.Job{}
source := embedded.NewSource(job, "Source", &embedded.SourceParams{
	KeyEvent: slidingwindow.KeyEvent,
})
memorySink := memory.NewSink[slidingwindow.SumEvent](job, "Sink")
operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
	Handler: func(op *jobs.Operator) rxn.OperatorHandler {
		return &slidingwindow.Handler{
			Sink:                  memorySink,
			CountsByMinuteSpec:    rxn.NewMapSpec(op, "CountsByMinute", rxn.ScalarMapStateCodec[time.Time, int]{}),
			PreviousWindowSumSpec: rxn.NewValueSpec(op, "PreviousWindowSum", rxn.ScalarCodec[int]{}),
		}
	},
})
source.Connect(operator)
operator.Connect(memorySink)
```

Then we setup our test run with a series of ViewEvents to process.

```go
// Create a Reduction test run with a helper for adding ViewEvents.
tr := rxn.NewTestRun(job)

// Two events in one minute
addViewEvent(tr, "user", "2025-01-08T00:01:00Z")
addViewEvent(tr, "user", "2025-01-08T00:01:10Z")

// Two events in next minute
addViewEvent(tr, "user", "2025-01-08T00:02:10Z")
addViewEvent(tr, "user", "2025-01-08T00:02:59Z")

// One event and then no more
addViewEvent(tr, "user", "2025-01-08T00:03:00Z")

// Events from other users advance event time and close the windows near the end of the week.
addViewEvent(tr, "other-user", "2025-01-15T00:01:00Z")
tr.AddWatermark()
addViewEvent(tr, "other-user", "2025-01-15T00:02:00Z")
tr.AddWatermark()
addViewEvent(tr, "other-user", "2025-01-15T00:03:00Z")
tr.AddWatermark()
addViewEvent(tr, "other-user", "2025-01-15T00:04:00Z")
tr.AddWatermark()
addViewEvent(tr, "other-user", "2025-01-15T00:05:00Z")
tr.AddWatermark()

if err := tr.Run(); err != nil {
	t.Fatalf("failed to run handler: %v", err)
}
```

The use of events with another key ("other-user") and the watermarks demonstrate
how event time and watermarks progress in the absence of events for "user". Other
timestamped events and periodic watermarks continue to mark the passage of time and
allow relevant timers to fire.

Finally we can assert on the events in the `memorySink`.

```go
// Filter events to just focus on "user"
userEvents := []slidingwindow.SumEvent{}
for _, event := range memorySink.Records {
	if event.UserID == "user" {
		userEvents = append(userEvents, event)
	}
}

wantEvents := []slidingwindow.SumEvent{
	// TotalViews accumulate for the first 3 minutes
	{UserID: "user", Interval: "2025-01-01T00:02:00Z/2025-01-08T00:02:00Z", TotalViews: 2},
	{UserID: "user", Interval: "2025-01-01T00:03:00Z/2025-01-08T00:03:00Z", TotalViews: 4},
	{UserID: "user", Interval: "2025-01-01T00:04:00Z/2025-01-08T00:04:00Z", TotalViews: 5},

	// TotalViews decrease as windows at the end of the week close
	{UserID: "user", Interval: "2025-01-08T00:02:00Z/2025-01-15T00:02:00Z", TotalViews: 3},
	{UserID: "user", Interval: "2025-01-08T00:03:00Z/2025-01-15T00:03:00Z", TotalViews: 1},
	{UserID: "user", Interval: "2025-01-08T00:04:00Z/2025-01-15T00:04:00Z", TotalViews: 0},
}

assertEventsEqual(t, wantEvents, userEvents)
```

## Wrapping Up

Often teams start with a daily batch SQL job and find that running it more
frequently would be valuable. Maybe twice a day? Every hour? Stream processing
with sliding windows can dramatically increase the freshness of data.

Although a high-level API for sliding windows could be built on top of the
`OnEvent` and `OnTimerExpired` methods, I hope you can see how the specifics of
a use case lead to optimizations or custom business rules that would be
difficult to express in a format like SQL.
