# Redis Architecture

Redis serves two purposes in Mirai: Asynq job queue and application caching.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Pods                         │
│                                                              │
│  ┌───────────────────┐        ┌───────────────────┐        │
│  │ Backend           │        │ Frontend          │        │
│  │ - Asynq Client    │        │ - Redis Cache     │        │
│  │ - Asynq Server    │        │                   │        │
│  │ - Redis Cache     │        │                   │        │
│  └─────────┬─────────┘        └─────────┬─────────┘        │
│            └──────────────┬─────────────┘                   │
│                           ▼                                  │
│                ┌──────────────────┐                         │
│                │ Redis Service    │                         │
│                │ redis.redis.svc  │                         │
│                └──────────────────┘                         │
└───────────────────────────┼─────────────────────────────────┘
                            ▼
                   ┌──────────────────┐
                   │ Redis Pod        │
                   │ redis:7-alpine   │
                   │ :6379            │
                   └──────────────────┘
```

## Kubernetes Deployment

**File**: `k8s/redis/redis-deployment.yaml`

### Configuration

| Setting | Value |
|---------|-------|
| Image | redis:7-alpine |
| Namespace | redis |
| Replicas | 1 |
| Port | 6379 |
| Storage | 5Gi NFS PVC |

### Redis Config (ConfigMap)

```conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
notify-keyspace-events Ex
databases 16
```

### Resource Limits

```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### Security Context

```yaml
securityContext:
  runAsUser: 999
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  seccompProfile:
    type: RuntimeDefault
  capabilities:
    drop: ["ALL"]
```

## Usage 1: Asynq Job Queue (Backend)

### Architecture

Redis-backed job queue for background processing with scheduled tasks.

**Files**:
- `backend/internal/infrastructure/worker/server.go` - Job server
- `backend/internal/infrastructure/worker/client.go` - Job enqueueing
- `backend/internal/domain/worker/tasks.go` - Task definitions

### Queue Configuration

| Queue | Workers | Purpose |
|-------|---------|---------|
| critical | 6 | Stripe provisioning |
| default | 3 | AI/SME generation |
| low | 1 | Cleanup tasks |

### Job Types

| Type | Queue | Max Retry | Description |
|------|-------|-----------|-------------|
| `stripe:provision` | critical | 10 | Account setup after payment |
| `stripe:reconcile` | critical | 3 | Orphaned payment detection |
| `cleanup:expired` | low | 1 | Expired registration cleanup |
| `ai:generation` | default | 3 | Course outline/lesson generation |
| `sme:ingestion` | default | 3 | SME document processing |
| `ai:generation:poll` | default | - | Poll queued generation jobs |
| `sme:ingestion:poll` | default | - | Poll queued ingestion jobs |

### Scheduled Tasks

| Schedule | Task | Purpose |
|----------|------|---------|
| Every 15m | `stripe:reconcile` | Catch orphaned payments |
| Every 1h | `cleanup:expired` | Remove expired registrations |
| Every 5s | `ai:generation:poll` | Process next AI job |
| Every 5s | `sme:ingestion:poll` | Process next SME job |

### Connection URL

```go
// Backend configuration
// Config stores: redis://redis.redis.svc.cluster.local:6379
// Asynq expects: redis.redis.svc.cluster.local:6379 (no prefix)
redisAddr := strings.TrimPrefix(cfg.RedisURL, "redis://")
workerClient := worker.NewClient(redisAddr, logger)
```

## Usage 2: Application Cache

### Backend Cache

**File**: `backend/internal/infrastructure/cache/redis.go`

**Interface Methods**:

```go
Get(ctx, key, v interface{})              // Get with entry metadata
Set(ctx, key, v, etag string, ttl)        // Store with ETag
Delete(ctx, key)                          // Remove key
InvalidatePattern(ctx, pattern)           // Wildcard deletion
AcquireLock(ctx, key, ttl)                // Distributed lock
ReleaseLock(ctx, key, lockID)             // Release via Lua script
```

### Frontend Cache

**File**: `frontend/src/lib/cache/redisCache.ts`

**Features**:
- Singleton pattern with lazy initialization
- Automatic reconnection with exponential backoff (max 3s)
- Graceful degradation to NoOpCache if Redis unavailable
- ETag-based optimistic locking

### Cache Keys

| Pattern | Purpose |
|---------|---------|
| `library:index` | Full library listing |
| `folders:hierarchy` | Folder structure |
| `course:{id}` | Individual course content |
| `folder:{folderId}:courses` | Courses in folder |
| `courses:all` | All courses listing |
| `courses:status:{status}` | Filter by status |
| `courses:tag:{tag}` | Filter by tags |

### Cache Entry Structure

```json
{
  "data": "<json.RawMessage>",
  "etag": "W/\"hash-timestamp\"",
  "timestamp": 1234567890123,
  "version": 1
}
```

### TTL Configuration

- Default TTL: 300 seconds (5 minutes)
- Stale data cleanup: 24 hours

## Environment Variables

### Backend

```yaml
# Set in config defaults (config.go)
ENABLE_REDIS_CACHE: "true"  # Optional
REDIS_URL: "redis://redis.redis.svc.cluster.local:6379"
```

### Frontend

```yaml
# k8s/frontend/deployment.yaml
- name: ENABLE_REDIS_CACHE
  value: "true"
- name: REDIS_URL
  value: "redis://redis.redis.svc.cluster.local:6379"
```

## Network Policy

**File**: `k8s/backend/networkpolicy-allow-redis.yaml`

Allows egress from `mirai` namespace to `redis` namespace on TCP 6379.

## Local Development

Redis runs via Docker Compose:

```yaml
# local-dev/docker-compose.yml
redis:
  image: redis:7-alpine
  container_name: mirai-redis
  ports:
    - "6379:6379"
```

Local connection: `localhost:6379`

## Monitoring Commands

### Check Status

```bash
# Port forward
kubectl port-forward -n redis svc/redis 6379:6379

# Ping
redis-cli ping
# PONG

# Info
redis-cli info stats
redis-cli info memory
```

### View Data

```bash
# List all keys
redis-cli KEYS "*"

# Check key TTL
redis-cli TTL "library:index"

# View key type
redis-cli TYPE "course:123"

# Memory usage
redis-cli MEMORY USAGE "library:index"
```

### Asynq Inspection

```bash
# Pending tasks
redis-cli KEYS "asynq:*"

# Queue sizes
redis-cli LLEN "asynq:queues:critical"
redis-cli LLEN "asynq:queues:default"
redis-cli LLEN "asynq:queues:low"
```

## Distributed Locking

Both backend and frontend use Redis for distributed locks:

```go
// Backend (redis.go)
func (r *RedisCache) AcquireLock(ctx, key string, ttl time.Duration) (bool, string) {
    lockID := fmt.Sprintf("%d-%s", time.Now().UnixNano(), uuid.New().String()[:8])
    ok := r.client.SetNX(ctx, "lock:"+key, lockID, ttl).Val()
    return ok, lockID
}

func (r *RedisCache) ReleaseLock(ctx, key, lockID string) bool {
    // Lua script ensures only owner can release
    script := redis.NewScript(`
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `)
    return script.Run(ctx, r.client, []string{"lock:" + key}, lockID).Val() == int64(1)
}
```

**Lock Prefix**: `lock:`
**Default TTL**: 10 seconds

## Graceful Degradation

Both applications handle Redis unavailability:

```typescript
// Frontend (redisCache.ts)
if (process.env.ENABLE_REDIS_CACHE === 'false') {
    return new NoOpCache();  // Always cache miss
}

// On connection failure
client.on('error', () => {
    // Silently degrades, operations return cache miss
});
```

```go
// Backend (main.go)
if cfg.EnableRedisCache && cfg.RedisURL != "" {
    cache = NewRedisCache(cfg.RedisURL)
} else {
    cache = NewNoOpCache()  // Pass-through
}
```

## Persistence

Redis is configured for durability:

- **RDB Snapshots**: `save 900 1`, `save 300 10`, `save 60 10000`
- **AOF**: Enabled with `appendfsync everysec`
- **Storage**: 5Gi NFS PVC at `/data`

Data survives pod restarts.

## Key Files

| File | Purpose |
|------|---------|
| `k8s/redis/redis-deployment.yaml` | K8s deployment + ConfigMap |
| `k8s/backend/networkpolicy-allow-redis.yaml` | Network egress policy |
| `backend/internal/infrastructure/cache/redis.go` | Backend cache implementation |
| `backend/internal/infrastructure/worker/server.go` | Asynq server + scheduler |
| `backend/internal/infrastructure/worker/client.go` | Asynq client |
| `backend/internal/domain/worker/tasks.go` | Task type definitions |
| `frontend/src/lib/cache/redisCache.ts` | Frontend cache adapter |
| `local-dev/docker-compose.yml` | Local Redis container |
