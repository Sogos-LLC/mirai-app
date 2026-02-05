package pubsub

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"google.golang.org/protobuf/encoding/protojson"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// NotificationEvent represents a notification event for pub/sub.
type NotificationEvent struct {
	EventType    v1.NotificationEventType `json:"event_type"`
	Notification *v1.Notification         `json:"notification"`
}

// JobEvent represents a job event for pub/sub.
type JobEvent struct {
	EventType    v1.JobEventType    `json:"event_type"`
	Job          *v1.GenerationJob  `json:"job"`
	PendingStep  *v1.WorkflowStepType `json:"pending_step,omitempty"`
	StepDataJSON *string              `json:"step_data_json,omitempty"`
}

// notificationEventWire is the wire format for NotificationEvent using protojson for Notification.
type notificationEventWire struct {
	EventType    v1.NotificationEventType `json:"event_type"`
	Notification json.RawMessage          `json:"notification"`
}

// MarshalJSON implements custom JSON marshaling using protojson for Notification.
func (e *NotificationEvent) MarshalJSON() ([]byte, error) {
	var notifBytes []byte
	var err error
	if e.Notification != nil {
		notifBytes, err = protojson.Marshal(e.Notification)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal notification: %w", err)
		}
	}
	wire := notificationEventWire{
		EventType:    e.EventType,
		Notification: notifBytes,
	}
	return json.Marshal(wire)
}

// UnmarshalJSON implements custom JSON unmarshaling using protojson for Notification.
func (e *NotificationEvent) UnmarshalJSON(data []byte) error {
	var wire notificationEventWire
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	e.EventType = wire.EventType
	if len(wire.Notification) > 0 {
		e.Notification = &v1.Notification{}
		if err := protojson.Unmarshal(wire.Notification, e.Notification); err != nil {
			return fmt.Errorf("failed to unmarshal notification: %w", err)
		}
	}
	return nil
}

// jobEventWire is the wire format for JobEvent using protojson for Job.
type jobEventWire struct {
	EventType v1.JobEventType `json:"event_type"`
	Job       json.RawMessage `json:"job"`
}

// MarshalJSON implements custom JSON marshaling using protojson for Job.
func (e *JobEvent) MarshalJSON() ([]byte, error) {
	var jobBytes []byte
	var err error
	if e.Job != nil {
		jobBytes, err = protojson.Marshal(e.Job)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal job: %w", err)
		}
	}
	wire := jobEventWire{
		EventType: e.EventType,
		Job:       jobBytes,
	}
	return json.Marshal(wire)
}

// UnmarshalJSON implements custom JSON unmarshaling using protojson for Job.
func (e *JobEvent) UnmarshalJSON(data []byte) error {
	var wire jobEventWire
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	e.EventType = wire.EventType
	if len(wire.Job) > 0 {
		e.Job = &v1.GenerationJob{}
		if err := protojson.Unmarshal(wire.Job, e.Job); err != nil {
			return fmt.Errorf("failed to unmarshal job: %w", err)
		}
	}
	return nil
}

// Publisher defines the interface for publishing events.
type Publisher interface {
	PublishNotificationEvent(ctx context.Context, userID uuid.UUID, event *NotificationEvent) error
	PublishJobEvent(ctx context.Context, userID uuid.UUID, event *JobEvent) error
}

// Subscriber defines the interface for subscribing to events.
type Subscriber interface {
	SubscribeUserEvents(ctx context.Context, userID uuid.UUID) (<-chan *NotificationEvent, func(), error)
	SubscribeJobEvents(ctx context.Context, userID uuid.UUID) (<-chan *JobEvent, func(), error)
}

// RedisPubSub implements Publisher and Subscriber using Redis pub/sub.
type RedisPubSub struct {
	client *redis.Client
	logger service.Logger
}

// RedisConfig holds Redis pub/sub configuration.
type RedisConfig struct {
	URL string
}

// NewRedisPubSub creates a new Redis pub/sub client.
func NewRedisPubSub(cfg RedisConfig, logger service.Logger) (*RedisPubSub, error) {
	opts, err := redis.ParseURL(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis for pubsub: %w", err)
	}

	return &RedisPubSub{
		client: client,
		logger: logger,
	}, nil
}

// NewRedisPubSubFromClient creates a RedisPubSub using an existing Redis client.
func NewRedisPubSubFromClient(client *redis.Client, logger service.Logger) *RedisPubSub {
	return &RedisPubSub{
		client: client,
		logger: logger,
	}
}

// userChannel returns the Redis channel name for a user's notification events.
func userChannel(userID uuid.UUID) string {
	return fmt.Sprintf("events:user:%s", userID.String())
}

// jobChannel returns the Redis channel name for a user's job events.
func jobChannel(userID uuid.UUID) string {
	return fmt.Sprintf("events:jobs:%s", userID.String())
}

// PublishNotificationEvent publishes a notification event to the user's channel.
func (p *RedisPubSub) PublishNotificationEvent(ctx context.Context, userID uuid.UUID, event *NotificationEvent) error {
	channel := userChannel(userID)

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal notification event: %w", err)
	}

	if err := p.client.Publish(ctx, channel, data).Err(); err != nil {
		return fmt.Errorf("failed to publish notification event: %w", err)
	}

	p.logger.Debug("published notification event",
		"channel", channel,
		"event_type", event.EventType.String(),
		"notification_id", event.Notification.GetId(),
	)

	return nil
}

// SubscribeUserEvents subscribes to a user's notification events.
// Returns a channel that receives events, a cleanup function, and an error.
func (p *RedisPubSub) SubscribeUserEvents(ctx context.Context, userID uuid.UUID) (<-chan *NotificationEvent, func(), error) {
	channel := userChannel(userID)

	pubsub := p.client.Subscribe(ctx, channel)

	// Verify subscription is active
	_, err := pubsub.Receive(ctx)
	if err != nil {
		pubsub.Close()
		return nil, nil, fmt.Errorf("failed to subscribe to channel %s: %w", channel, err)
	}

	eventCh := make(chan *NotificationEvent, 10)

	// Goroutine to forward messages to the event channel
	go func() {
		defer close(eventCh)

		msgCh := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-msgCh:
				if !ok {
					return
				}

				var event NotificationEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					p.logger.Error("failed to unmarshal notification event",
						"error", err,
						"payload", msg.Payload,
					)
					continue
				}

				select {
				case eventCh <- &event:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	cleanup := func() {
		pubsub.Close()
	}

	p.logger.Debug("subscribed to user events", "channel", channel)

	return eventCh, cleanup, nil
}

// PublishJobEvent publishes a job event to the user's job channel.
func (p *RedisPubSub) PublishJobEvent(ctx context.Context, userID uuid.UUID, event *JobEvent) error {
	channel := jobChannel(userID)

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal job event: %w", err)
	}

	if err := p.client.Publish(ctx, channel, data).Err(); err != nil {
		return fmt.Errorf("failed to publish job event: %w", err)
	}

	p.logger.Debug("published job event",
		"channel", channel,
		"event_type", event.EventType.String(),
		"job_id", event.Job.GetId(),
	)

	return nil
}

// SubscribeJobEvents subscribes to a user's job events.
// Returns a channel that receives events, a cleanup function, and an error.
func (p *RedisPubSub) SubscribeJobEvents(ctx context.Context, userID uuid.UUID) (<-chan *JobEvent, func(), error) {
	channel := jobChannel(userID)

	pubsub := p.client.Subscribe(ctx, channel)

	// Verify subscription is active
	_, err := pubsub.Receive(ctx)
	if err != nil {
		pubsub.Close()
		return nil, nil, fmt.Errorf("failed to subscribe to job channel %s: %w", channel, err)
	}

	eventCh := make(chan *JobEvent, 10)

	// Goroutine to forward messages to the event channel
	go func() {
		defer close(eventCh)

		msgCh := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-msgCh:
				if !ok {
					return
				}

				var event JobEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					p.logger.Error("failed to unmarshal job event",
						"error", err,
						"payload", msg.Payload,
					)
					continue
				}

				select {
				case eventCh <- &event:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	cleanup := func() {
		pubsub.Close()
	}

	p.logger.Debug("subscribed to job events", "channel", channel)

	return eventCh, cleanup, nil
}

// Close closes the Redis connection.
func (p *RedisPubSub) Close() error {
	return p.client.Close()
}

// NoOpPubSub is a no-op implementation for when pub/sub is disabled.
type NoOpPubSub struct{}

// NewNoOpPubSub creates a new no-op pub/sub.
func NewNoOpPubSub() *NoOpPubSub {
	return &NoOpPubSub{}
}

// PublishNotificationEvent does nothing.
func (p *NoOpPubSub) PublishNotificationEvent(ctx context.Context, userID uuid.UUID, event *NotificationEvent) error {
	return nil
}

// SubscribeUserEvents returns a closed channel (no events will be received).
func (p *NoOpPubSub) SubscribeUserEvents(ctx context.Context, userID uuid.UUID) (<-chan *NotificationEvent, func(), error) {
	ch := make(chan *NotificationEvent)
	close(ch)
	return ch, func() {}, nil
}

// PublishJobEvent does nothing.
func (p *NoOpPubSub) PublishJobEvent(ctx context.Context, userID uuid.UUID, event *JobEvent) error {
	return nil
}

// SubscribeJobEvents returns a closed channel (no events will be received).
func (p *NoOpPubSub) SubscribeJobEvents(ctx context.Context, userID uuid.UUID) (<-chan *JobEvent, func(), error) {
	ch := make(chan *JobEvent)
	close(ch)
	return ch, func() {}, nil
}
