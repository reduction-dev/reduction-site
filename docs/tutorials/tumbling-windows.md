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
	rxn.UnimplementedHandler
	Sink rxn.Sink[SumEvent]
}

// A struct for unmarshalling the JSON events
type ViewEvent struct {
	ChannelID string `json:"channel_id"`
	Timestamp string `json:"timestamp"`
	Country   string `json:"country"`
}

func (h *Handler) KeyEvent(ctx context.Context, eventData []byte) ([]rxn.KeyedEvent, error) {
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
var codec rxn.MapStateCodec[time.Time, int] = SumByTime{}
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

And then write the `OnTimer` method to send these events to the sink.

```go
func (h *Handler) OnTimer(ctx context.Context, subject *rxn.Subject, timestamp time.Time) error {
	// Load the state into our map object
	state := rxn.NewMapState("state", codec)
	if err := subject.LoadState(state); err != nil {
		return err
	}

	// Get the count for the minute then clear that minute
	minute := timestamp.Truncate(time.Minute)
	count, _ := state.Get(minute)
	state.Delete(minute)

	// Update the subject's state
	subject.UpdateState(state)

	// Emit the count for the minute
	h.Sink.Collect(ctx, SumEvent{
		ChannelID: string(subject.Key()),
		Timestamp: timestamp.Format(time.RFC3339),
		Sum:       count,
	})

	return nil
}
```

## Testing

:::danger[This section is all make-believe at this point]
:::

You may have spotted opportunities for unit test in our handler implementation
but the most interesting parts of a Reduction job are how the callbacks and
state mutations work together to produce our final output. We can test how the
handler will work with a production Reduction cluster by using the `rxn.TestRun`
utility. This utility invokes the `reduction test` command with a list of test
events to process with the handler. When all the events have been processed, we
can inspect a fake sink to see what events we would have sent.

Our Handle's `Sink` member is an interface that allows us to collect our `SumEvent` 
events (`rxn.Sink[SumEvent]`). When testing we can use Reduction's memory sink
type to record sink events rather than having the cluster handle them. Let's
start the test by setting up our handler.

```go
func TestTumblingWindow(t *testing.T) {
	memorySink := connectors.MemorySink[SumEvent]{}
	handler := tumblingwindow.Handler{Sink: memorySink}
}
```

The `rxn.TestRun` function needs a list of serialized events to send to our handler.
We'll create a list of serialized `ViewEvents` to process.

```go
events := []tumblingwindow.ViewEvent{
  {ChannelID: "channel", Timestamp: "2025-01-01T00:01:00Z"},
  {ChannelID: "channel", Timestamp: "2025-01-01T00:01:30Z"},
  {ChannelID: "channel", Timestamp: "2025-01-01T00:01:59Z"},
  {ChannelID: "channel", Timestamp: "2025-01-01T00:02:10Z"},
}
eventData := make([][]byte, len(events))
for i, event := range events {
  data, err := json.Marshal(event)
  if err != nil {
    t.Fatalf("failed to marshal event: %v", err)
  }
  eventData[i] = data
}
```

Then we invoke the `rxn.TestRun` utility which blocks until all the events
have been processed.

```go
rxn.TestRun(handler, eventData)
```

And then we can assert on the events in the `memorySink`.

```go
if len(memorySink.Records) != 2 {
  t.Fatalf("expected 2 records, got %d", len(memorySink.Records))
}

wantEvents := []tumblingwindow.SumEvent{
  {ChannelID: "channel", Timestamp: "2025-01-01T00:01:00Z", Sum: 3},
  {ChannelID: "channel", Timestamp: "2025-01-01T00:02:00Z", Sum: 1},
}
for i, want := range wantEvents {
  got := memorySink.Records[i]
  if !reflect.DeepEqual(want, got) {
    t.Fatalf("want %v, got %v", want, got)
  }
}
```
