---
sidebar_position: 1
---

# Tumbling Windows

## Overview

This tutorial covers creating tumbling windows of data. Tumbling windows capture
a window of time in fixed increments across all subjects. For instance you
may want to aggregate statistics over each minute and emit an event when a
minute passes.

<p>
  <figure class="inline-block">
    <img src="/img/tumbling-windows.png" width="536.5" height="115.5"/>
    <figcaption class="italic text-center">Three tumbling windows as events arrive</figcaption>
  </figure>
</p>

As a motivating use case let's say we have several video channels on our website
that viewers watch. We'd like to know how many viewers are watching each channel
so that we can show a view count on the channel. Our job will aggregate events
by minute and emit a sum of view events for every channel on every minute.

The data we'll be working with is an event stream of JSON objects that look like
this:

```json
{
  "channel_id": "channel-a",
  "timestamp": "2025-01-30T12:45:10Z"
}
```

And our goal is to emit a new event with a sum each minute:

```json
{
  "channel_id": "channel-a",
  "timestamp": "2025-01-30T12:45:00Z",
  "sum": 5
}
```

## Keying Events

We'll begin by making a handler object that Reduction will call to process the
event stream. The first thing a handler does is extract the timestamp and
subject key from an event and return a `KeyedEvent` type. Reduction uses the
`KeyedEvent` timestamp to derive the relative time in a stream of events and it
uses the key to partition events between the operators that it manages
internally.

```go
type Handler struct {
	Sink connectors.SinkRuntime[SumEvent]
}

// A struct for unmarshalling the JSON events
type ViewEvent struct {
	ChannelID string `json:"channel_id"`
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
		Key:       []byte(event.ChannelID),
		Timestamp: timestamp,
	}}, nil
}
```

## Processing Each Event

As Reduction processes the view events, it will call the handler's `OnEvent`
method for each event to give us an opportunity to store state and trigger
timers. In this case we'll want to store the sum of events by minute in a map
and set a timer to trigger when a minute over.

:::tip[Why do we need a map?]
You may wonder why we need to store events by minute rather than just storing a
single value representing a sum of events for the current minute. In Reduction,
timers are asynchronous and setting a timer represents the _earliest_ a timer
may fire. This is similar to timers in programming languages like Go
(`time.After`) or JavaScript (`setTimeout`). Events for the next minute will
arrive before the timer fires for the previous minute.
:::

Each supported language has its own "map state" construct to handle loading and
persisting maps. Reduction is agnostic about how values are serialized for
network transport and storage so we'll provide a codec (coder/decoder) to
convert the keys and values from their types to binary and back.

```go
type SumByTimeCodec struct{}

func (m SumByTimeCodec) EncodeKey(key time.Time) ([]byte, error) {
	unix := key.Unix()
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(unix))
	return b, nil
}

func (m SumByTimeCodec) DecodeKey(data []byte) (time.Time, error) {
	unix := int64(binary.BigEndian.Uint64(data))
	return time.Unix(unix, 0).UTC(), nil
}

func (m SumByTimeCodec) EncodeValue(sum int) ([]byte, error) {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(sum))
	return b, nil
}

func (m SumByTimeCodec) DecodeValue(data []byte) (int, error) {
	return int(binary.BigEndian.Uint64(data)), nil
}

// Make sure our code matches the MapStateCodec interface
var codec rxn.MapStateCodec[time.Time, int] = SumByTimeCodec{}
```

In our handler's `OnEvent` method we'll load the state, increment
the sum for the event's minute (rounding down), and set a timer
to fire on the next minute.

```go
func (h *Handler) OnEvent(ctx context.Context, subject *rxn.Subject, eventData []byte) error {
	// Load the state into our map object
	state := rxn.NewMapState("state", codec)
	if err := subject.LoadState(state); err != nil {
		return err
	}

	// Increment the count for the event's minute
	minute := subject.Timestamp().Truncate(time.Minute)
	sum, _ := state.Get(minute)
	state.Set(minute, sum+1)

	// Update the subject's state when done mutating the map
	subject.UpdateState(state)

	// Set a timer to flush the minute's count once we reach the next minute
	subject.SetTimer(minute.Add(time.Minute))
	return nil
}
```

## Processing Timers

When a timer fires, we'll send the sum value to our sink and remove the obsolete
minute bucket from our map.

Let's create an object to handle the JSON serialization.

```go
type SumEvent struct {
	ChannelID string `json:"channel_id"`
	Timestamp string `json:"timestamp"`
	Sum       int    `json:"sum"`
}
```

And then write the `OnTimerExpired` method to send these events to the sink.

```go
func (h *Handler) OnTimerExpired(ctx context.Context, subject *rxn.Subject, timestamp time.Time) error {
	// Load the state into our map object
	state := rxn.NewMapState("state", codec)
	if err := subject.LoadState(state); err != nil {
		return err
	}

	// Emit the sums for every earlier minute bucket
	for minute, sum := range state.All() {
		if minute.Before(timestamp) {
			// Emit the count for the minute
			h.Sink.Collect(ctx, SumEvent{
				ChannelID: string(subject.Key()),
				Timestamp: minute.Format(time.RFC3339),
				Sum:       sum,
			})
			// Clean up the emitted minute entry
			state.Delete(minute)
		}
	}

	// Update the subject's state
	subject.UpdateState(state)
	return nil
}
```

## Testing

You may have spotted opportunities for unit test in our handler implementation
but the most interesting parts of a Reduction job are how the callbacks and
state mutations work together to produce our final output. We can test how the
handler will work with a production Reduction cluster by using the `rxn.TestRun`
utility. This utility invokes the `reduction test` command with a list of test
events to process with the handler. When all the events have been processed, we
can inspect an in-memory sink to see what events we would have sent.

Our Handle's `Sink` member is an interface that allows us to collect our
`SumEvent` events (`connectors.SinkRuntime[SumEvent]`). When testing we can use
Reduction's memory sink type to record sink events rather than having the
cluster handle them. Let's start the test by setting up our job.

```go
func TestTumblingWindow(t *testing.T) {
	job := &jobs.Job{}
	source := connectors.NewEmbeddedSource(job, "Source", &connectors.EmbeddedSourceParams{
		KeyEvent: tumblingwindow.KeyEvent,
	})
	memorySink := connectors.NewMemorySink[tumblingwindow.SumEvent](job, "Sink")
	operator := jobs.NewOperator(job, "Operator", &jobs.OperatorParams{
		Handler: &tumblingwindow.Handler{Sink: memorySink},
	})
	source.Connect(operator)
	operator.Connect(memorySink)

	// ...
}
```

In our "test run" we'll add a few view events for a channel and advance the
watermark.

```go
tr := rxn.NewTestRun(job)
addViewEvent(tr, "channel", "2025-01-01T00:01:00Z")
addViewEvent(tr, "channel", "2025-01-01T00:01:30Z")
addViewEvent(tr, "channel", "2025-01-01T00:01:59Z")
addViewEvent(tr, "channel", "2025-01-01T00:02:10Z")
addViewEvent(tr, "channel", "2025-01-01T00:03:01Z")
tr.AddWatermark()
tr.Run()
```

And then we check the memory sink for the events we expect to have been emitted.

```go
wantEvents := []tumblingwindow.SumEvent{
	{ChannelID: "channel", Timestamp: "2025-01-01T00:01:00Z", Sum: 3},
	{ChannelID: "channel", Timestamp: "2025-01-01T00:02:00Z", Sum: 1},
}

if len(memorySink.Records) != 2 {
	t.Fatalf("expected 2 records, got %d\nmemorySink.Records: %+v\nwantEvents: %+v", len(memorySink.Records), memorySink.Records, wantEvents)
}

for i, want := range wantEvents {
	got := memorySink.Records[i]
	if !reflect.DeepEqual(want, got) {
		t.Errorf("want %v, got %v", want, got)
	}
}
```

You might wonder why we get a closed window for minute 2 but not minute 3 in
this test. The window for minute three is still open because, according to event
time, more events may arrive to fill that window.

## Wrapping Up

Tumbling windows are a good introduction to stateful processing with timers.
They're pretty simple and can be thought of as batching aggregations by key.
However they can also accommodate complex aggregation and filtering logic within
the windows.
