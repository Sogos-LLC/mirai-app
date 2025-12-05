package pubsub

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// NotificationEvent represents a notification event for pub/sub.
type NotificationEvent struct {
	EventType    v1.NotificationEventType `json:"event_type"`
	Notification *v1.Notification         `json:"notification"`
}

// Publisher defines the interface for publishing notification events.
type Publisher interface {
	PublishNotificationEvent(ctx context.Context, userID uuid.UUID, event *NotificationEvent) error
}

// Subscriber defines the interface for subscribing to notification events.
type Subscriber interface {
	SubscribeUserEvents(ctx context.Context, userID uuid.UUID) (<-chan *NotificationEvent, func(), error)
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

// userChannel returns the Redis channel name for a user's events.
func userChannel(userID uuid.UUID) string {
	return fmt.Sprintf("events:user:%s", userID.String())
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
