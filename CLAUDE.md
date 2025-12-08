# Mirai - AI Course Builder Platform

## Role
You are a Principal Software Architect enforcing a **Strict Contract** architecture with zero schema drift between layers.

## Core Principles

1. **Single Source of Truth (SSOT)**
   - API & Validation: Protocol Buffers (`.proto`) define all contracts
   - Persistence: SQL migrations define all database schema
   - Never duplicate definitions across layers

2. **Schema-First Development**
   - Define the interface (Proto) and storage (SQL) before business logic
   - Generate code, don't write it manually

3. **Compile-Time Safety**
   - Prefer build failures over runtime errors
   - Use generated types everywhere

4. **Multi-Tenant Security**
   - Every query must be tenant-scoped via RLS
   - Never trust client-provided tenant IDs

---

## Project Structure

```
mirai/
├── proto/                    # SSOT: All .proto definitions
│   └── mirai/v1/            # Versioned proto files
├── backend/
│   ├── cmd/server/          # Main entry point
│   ├── internal/
│   │   ├── domain/          # Domain entities (not proto-coupled)
│   │   ├── application/     # Use cases / services
│   │   ├── presentation/    # Connect-RPC handlers
│   │   │   └── connect/     # Proto ↔ Domain mappers
│   │   ├── infrastructure/  # External integrations
│   │   │   └── persistence/sqlc/  # sqlc-based repositories
│   │   └── database/
│   │       └── gen/         # Generated sqlc code (DO NOT EDIT)
│   ├── queries/             # SQL query definitions for sqlc
│   ├── migrations/          # SQL migration files
│   └── gen/                 # Generated proto code (DO NOT EDIT)
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── (main)/      # Authenticated routes with sidebar
│   │   │   └── (public)/    # Public/auth routes
│   │   ├── components/      # React components by feature
│   │   ├── hooks/           # Custom hooks (data fetching, state)
│   │   ├── gen/             # Generated proto + Zod (DO NOT EDIT)
│   │   │   └── mirai/v1/    # *_pb.ts, *_connect.ts, *_zod.ts
│   │   ├── machines/        # XState v5 state machines
│   │   ├── store/zustand/   # Zustand UI state
│   │   └── schemas/         # Extended Zod schemas (form-specific only)
│   └── packages/
│       └── protoc-gen-zod/  # Custom Buf plugin for Zod generation
├── k8s/                     # Kubernetes manifests
└── local-dev/               # Local development (HAProxy, docker-compose)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Database | PostgreSQL 16 (CloudNativePG) | Primary store with RLS |
| Query Gen | sqlc | Type-safe Go from SQL |
| API | Connect-RPC + Buf | Proto-based RPC |
| Auth | Ory Kratos | Headless identity |
| Cache/Queue | Redis 7 + Asynq | Caching + async jobs |
| Storage | MinIO | S3-compatible files |
| AI | Google Gemini | Per-tenant API keys |
| Frontend | Next.js 14 + React | App Router, RSC |
| State | Zustand + XState v5 | UI state + workflows |
| Validation | Zod (generated) | From buf.validate |
| Styling | Tailwind CSS + Mantine | UI components |

---

## Code Generation Commands

Always run these after modifying source definitions:

```bash
# After changing .proto files
cd proto && buf generate

# After changing SQL migrations or queries/*.sql
cd backend && sqlc generate

# Full regeneration
cd proto && buf generate && cd ../backend && sqlc generate
```

---

## Development Workflow

When implementing a feature (e.g., "Add SME tagging"):

### Step 1: Database Layer
```bash
# 1. Create migration
touch backend/migrations/YYYYMMDD_add_sme_tags.sql

# 2. Add queries
edit backend/queries/sme.sql  # Add new queries

# 3. Generate
cd backend && sqlc generate
```

### Step 2: Proto Contract
```bash
# 1. Update proto with buf.validate rules
edit proto/mirai/v1/sme.proto

# 2. Generate all (Go + TS + Zod)
cd proto && buf generate
```

### Step 3: Backend Implementation
```go
// In internal/presentation/connect/sme_service.go
// Map between domain entities and proto messages
func (s *SMEService) AddTag(ctx context.Context, req *connect.Request[smepb.AddTagRequest]) (*connect.Response[smepb.AddTagResponse], error) {
    // Use generated request type, never manual structs
}
```

### Step 4: Frontend Implementation
```typescript
// In hooks/useSME.ts - use generated types
import { AddTagRequestSchema } from '@/gen/mirai/v1/sme_pb';
import { addTag } from '@/gen/mirai/v1/sme-SMEService_connectquery';

// In components - use generated Zod schemas
import { AddTagRequestSchema } from '@/gen/mirai/v1/sme_zod';
```

---

## Critical Patterns

### DO: Use Generated Types Everywhere

```typescript
// CORRECT: Import from generated files
import { SubjectMatterExpert } from '@/gen/mirai/v1/sme_pb';
import { CreateSMERequestSchema } from '@/gen/mirai/v1/sme_zod';

// CORRECT: Use proto enums
import { BlockType } from '@/gen/mirai/v1/course_pb';
if (block.type === BlockType.TEXT) { ... }
```

### DON'T: Write Manual Types

```typescript
// WRONG: Manual interface duplicating proto
interface User {
  id: string;
  email: string;
}

// WRONG: String comparison for enums
if (block.type === 'text') { ... }
```

### DO: Pass All Required Proto Fields

```typescript
// CORRECT: All fields from proto schema
const request = create(SetAPIKeyRequestSchema, {
  provider: AIProvider.AI_PROVIDER_GEMINI,
  apiKey: key
});

// WRONG: Missing required field (will fail at runtime)
const request = create(SetAPIKeyRequestSchema, { apiKey: key });
```

### DO: Extend Generated Schemas for Forms

```typescript
// CORRECT: Extend for frontend-only fields
export const registrationFormSchema = RegisterRequestSchema.extend({
  confirmPassword: z.string().min(8),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
```

### DO: Use RLS Wrappers in Repositories

```go
// CORRECT: All queries through RLS adapter
func (r *SMERepository) List(ctx context.Context) ([]domain.SME, error) {
    return database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Sme, error) {
        return q.ListSMEs(ctx, gen.ListSMEsParams{...})
    }, r.toDomain)
}
```

---

## Frontend Styling: Semantic Design Tokens

The frontend uses a **semantic design token system** for theming. Colors are defined as CSS variables in `globals.css` and mapped to Tailwind classes. This means dark mode works automatically - **never use `dark:` prefixes for colors**.

### Available Tokens

| Tailwind Class | CSS Variable | Purpose |
|---------------|--------------|---------|
| `bg-page` | `--bg-page` | Page background |
| `bg-surface` | `--bg-surface` | Cards, panels |
| `bg-surface-elevated` | `--bg-surface-elevated` | Modals, dropdowns |
| `bg-hover` | `--bg-hover` | Hover states |
| `bg-active` | `--bg-active` | Active/selected states |
| `text-primary` | `--text-primary` | Main headings, body text |
| `text-secondary` | `--text-secondary` | Subtitles, descriptions |
| `text-muted` | `--text-muted` | Placeholders, disabled text |
| `border` | `--border-default` | Default borders (use `border` class) |
| `border-subtle` | `--border-subtle` | Subtle dividers |

### DO: Use Semantic Tokens

```tsx
// CORRECT: Automatically adapts to light/dark mode
<div className="bg-surface border rounded-lg">
  <h1 className="text-primary">Title</h1>
  <p className="text-secondary">Description</p>
</div>
```

### DON'T: Hardcode Dark Mode Classes

```tsx
// WRONG: Brittle, must maintain two color schemes
<div className="bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border">
  <h1 className="text-gray-900 dark:text-white">Title</h1>
</div>
```

### UI Components

Use the pre-built components that already implement semantic tokens:

```tsx
// Card component - auto-themed surface with border
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';

<Card>
  <CardHeader>
    <CardTitle>Team Settings</CardTitle>
    <CardDescription>Manage your team configuration</CardDescription>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>

// Button component - multiple variants
import Button from '@/components/ui/Button';

<Button variant="primary">Save</Button>      // Purple filled
<Button variant="secondary">Cancel</Button>  // Surface bg, bordered
<Button variant="ghost">Skip</Button>        // Transparent, text only
<Button variant="danger">Delete</Button>     // Red filled
```

### When Dark Mode IS Needed

Use `dark:` prefix only for:
- **Brand colors** that need different shades: `text-indigo-600 dark:text-indigo-400`
- **Status colors** with transparency: `bg-green-50 dark:bg-green-900/20`
- **Gradients** on accent sections (purple banners work in both modes)

### Customizing the Theme

All theme values are in `frontend/src/app/globals.css`:

```css
:root {
  --bg-page: #f9fafb;      /* Light mode page bg */
  --bg-surface: #ffffff;    /* Light mode card bg */
  /* ... */
}

.dark {
  --bg-page: #1a1625;       /* Dark mode page bg */
  --bg-surface: #151320;    /* Dark mode card bg */
  /* ... */
}
```

Change these CSS variables to update the entire app's color scheme.

---

## Frontend Layout: Mobile-First Responsive Components

The frontend uses **mobile-first responsive primitives** for consistent layouts across breakpoints. Always design for mobile first, then add breakpoint modifiers.

### Available Layout Components

#### PageShell

Page wrapper with header section (title, description, actions, back button):

```tsx
import { PageShell } from '@/components/layout/PageShell';

<PageShell
  title="Team Settings"
  description="Manage your team configuration"
  actions={<Button>Save</Button>}
  backButton={{ label: "Back to Teams", onClick: () => router.push('/teams') }}
  maxWidth="4xl"
>
  {/* Page content */}
</PageShell>
```

Props:
- `title` / `description` - Header text
- `actions` - Buttons rendered on right (wraps on mobile)
- `backButton` - Optional back navigation
- `maxWidth` - Container width preset (`sm` to `7xl`, default `4xl`)

#### AdaptiveGrid

Responsive CSS grid that adapts columns per breakpoint:

```tsx
import { AdaptiveGrid } from '@/components/ui/AdaptiveGrid';

// Default: 1 col → 2 col (md) → 3 col (lg)
<AdaptiveGrid>
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</AdaptiveGrid>

// Custom breakpoints
<AdaptiveGrid cols={{ default: 1, sm: 2, md: 3, xl: 4 }} gap="lg">
  {items.map(item => <Card key={item.id}>{item.name}</Card>)}
</AdaptiveGrid>
```

Props:
- `cols` - Column count per breakpoint (`default`, `sm`, `md`, `lg`, `xl`)
- `gap` - Gap size (`none`, `sm`, `md`, `lg`)

#### ResponsiveContainer

Max-width container with responsive padding:

```tsx
import { ResponsiveContainer } from '@/components/ui/ResponsiveContainer';

<ResponsiveContainer size="4xl">
  <h1>Page Content</h1>
</ResponsiveContainer>

// No padding for full-bleed sections
<ResponsiveContainer size="full" padded={false}>
  <FullWidthBanner />
</ResponsiveContainer>
```

Props:
- `size` - Max-width preset (`sm` to `7xl`, `full`)
- `centered` - Horizontal centering (default: `true`)
- `padded` - Horizontal padding (default: `true`)
- `as` - HTML element (`div`, `section`, `article`, `main`)

### Mobile-First Patterns

#### DO: Base styles for mobile, then scale up

```tsx
// CORRECT: Mobile-first with breakpoint modifiers
<div className="p-4 md:p-6 lg:p-8">
  <h1 className="text-xl md:text-2xl lg:text-3xl">Title</h1>
</div>

// CORRECT: Stack on mobile, row on desktop
<div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
  <div>Title</div>
  <div>Actions</div>
</div>
```

#### DON'T: Desktop-first or hardcoded pixel widths

```tsx
// WRONG: Desktop-first (hiding on mobile)
<div className="hidden md:block">Desktop only</div>

// WRONG: Hardcoded pixel widths (except 44px touch targets)
<div className="w-[350px]">Fixed width card</div>

// WRONG: Percentage widths that break on mobile
<div className="w-1/3">Always 33% width</div>
```

### Touch Targets

All interactive elements must meet 44x44px minimum (Apple HIG):

```tsx
// CORRECT: Touch-friendly button
<button className="min-h-[44px] min-w-[44px] p-3">
  <Icon />
</button>

// Or use the utility class
<button className="touch-target">
  <Icon />
</button>
```

### Safe Area Support

For mobile devices with notches/home indicators:

```tsx
// Bottom navigation with safe area
<nav className="fixed bottom-0 pb-[var(--safe-area-bottom)]">
  {/* nav items */}
</nav>

// Or use utility classes
<div className="safe-area-bottom">Content</div>
<div className="safe-area-inset">Full safe area padding</div>
```

---

## Hook Patterns

All data fetching hooks follow this pattern:

```typescript
// hooks/useFeature.ts
import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { create } from '@bufbuild/protobuf';

export function useListItems() {
  const query = useQuery(listItems, {});
  return {
    data: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createItem);

  return {
    mutate: async (data: CreateItemParams) => {
      const request = create(CreateItemRequestSchema, data);
      const result = await mutation.mutateAsync(request);
      // Invalidate related queries
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listItems, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
```

---

## Real-Time Streaming: SSE over Polling

For data that changes frequently or needs immediate updates (jobs, notifications), use **Server-Sent Events (SSE)** via Connect-RPC streaming instead of polling. This reduces network overhead and provides instant updates.

### When to Use Streaming

| Use Streaming (SSE) | Use Polling |
|---------------------|-------------|
| Job status updates | Rarely-changing data |
| Notifications | Initial page load |
| Live progress indicators | One-time fetches |
| Any frequently-polled endpoint | Data with natural refresh points |

### Architecture Pattern

```
┌─────────────┐     Redis Pub/Sub     ┌─────────────┐
│   Backend   │ ──────────────────────▸│   Backend   │
│  (Worker)   │   Publish event       │  (Handler)  │
└─────────────┘                       └──────┬──────┘
                                             │ SSE Stream
                                             ▼
                                      ┌─────────────┐
                                      │  Frontend   │
                                      │  (Browser)  │
                                      └─────────────┘
```

### Backend Implementation

#### Step 1: Define Streaming RPC in Proto

```protobuf
// In proto/mirai/v1/feature.proto
enum FeatureEventType {
  FEATURE_EVENT_TYPE_UNSPECIFIED = 0;
  FEATURE_EVENT_TYPE_CREATED = 1;
  FEATURE_EVENT_TYPE_UPDATED = 2;
  FEATURE_EVENT_TYPE_COMPLETED = 3;
  FEATURE_EVENT_TYPE_KEEPALIVE = 4;  // Required for proxy timeout prevention
}

service FeatureService {
  // Server-streaming RPC (note: returns stream)
  rpc SubscribeFeatures(SubscribeFeaturesRequest) returns (stream SubscribeFeaturesResponse);
}

message SubscribeFeaturesRequest {}
message SubscribeFeaturesResponse {
  FeatureEventType event_type = 1;
  Feature feature = 2;
}
```

#### Step 2: Add Pub/Sub Methods

```go
// In internal/infrastructure/pubsub/redis_pubsub.go
type FeatureEvent struct {
    EventType v1.FeatureEventType `json:"event_type"`
    Feature   *v1.Feature         `json:"feature"`
}

func (p *RedisPubSub) PublishFeatureEvent(ctx context.Context, userID uuid.UUID, event *FeatureEvent) error
func (p *RedisPubSub) SubscribeFeatureEvents(ctx context.Context, userID uuid.UUID) (<-chan *FeatureEvent, func(), error)
```

#### Step 3: Implement Handler with Heartbeat

```go
// In internal/presentation/connect/feature_service.go
func (s *FeatureServiceServer) SubscribeFeatures(
    ctx context.Context,
    req *connect.Request[v1.SubscribeFeaturesRequest],
    stream *connect.ServerStream[v1.SubscribeFeaturesResponse],
) error {
    // Get user from context (auth interceptor)
    userID := getUserIDFromContext(ctx)

    // Subscribe to Redis channel
    events, cleanup, err := s.subscriber.SubscribeFeatureEvents(ctx, userID)
    if err != nil {
        return err
    }
    defer cleanup()

    // Heartbeat every 15 seconds (prevents proxy timeouts)
    ticker := time.NewTicker(15 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case event, ok := <-events:
            if !ok {
                return nil
            }
            if err := stream.Send(&v1.SubscribeFeaturesResponse{
                EventType: event.EventType,
                Feature:   event.Feature,
            }); err != nil {
                return err
            }
        case <-ticker.C:
            // Send keepalive to prevent connection timeout
            if err := stream.Send(&v1.SubscribeFeaturesResponse{
                EventType: v1.FeatureEventType_FEATURE_EVENT_TYPE_KEEPALIVE,
            }); err != nil {
                return err
            }
        }
    }
}
```

#### Step 4: Publish Events from Service Layer

```go
// In internal/application/service/feature_service.go
type FeatureEventPublisher interface {
    PublishFeatureEvent(ctx context.Context, userID uuid.UUID, eventType string, feature *entity.Feature) error
}

// Call at key state transitions
func (s *FeatureService) Complete(ctx context.Context, id uuid.UUID) error {
    // ... business logic ...
    s.publishEvent(ctx, "completed", feature)
    return nil
}
```

### Frontend Implementation

#### Step 1: Create Streaming Hook

```typescript
// hooks/useFeatureStream.ts
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import {
  FeatureService,
  FeatureEventType,
  SubscribeFeaturesRequestSchema,
} from '@/gen/mirai/v1/feature_pb';
import { listFeatures } from '@/gen/mirai/v1/feature-FeatureService_connectquery';
import { create } from '@bufbuild/protobuf';

export function useFeatureStream() {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectAttemptRef = useRef(0);

  const handleEvent = useCallback((eventType: FeatureEventType) => {
    // Ignore keepalive
    if (eventType === FeatureEventType.KEEPALIVE) return;

    // Invalidate queries to trigger re-fetch
    queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({ schema: listFeatures, cardinality: undefined }),
    });
  }, [queryClient]);

  const subscribe = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const client = createClient(FeatureService, transport);
    abortControllerRef.current = new AbortController();

    try {
      reconnectAttemptRef.current = 0;
      const request = create(SubscribeFeaturesRequestSchema, {});

      for await (const event of client.subscribeFeatures(request, {
        signal: abortControllerRef.current.signal,
      })) {
        handleEvent(event.eventType);
      }

      // Stream ended, reconnect
      scheduleReconnect();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      scheduleReconnect();
    }
  }, [handleEvent]);

  const scheduleReconnect = useCallback(() => {
    // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
    reconnectAttemptRef.current++;
    setTimeout(subscribe, delay);
  }, [subscribe]);

  useEffect(() => {
    subscribe();
    return () => abortControllerRef.current?.abort();
  }, [subscribe]);
}
```

#### Step 2: Remove Polling from Data Hooks

```typescript
// BEFORE: Polling every 3 seconds
export function useActiveFeatures() {
  return useQuery(listFeatures, {}, {
    refetchInterval: 3000,  // ❌ Remove this
  });
}

// AFTER: No polling, rely on stream invalidation
export function useActiveFeatures() {
  return useQuery(listFeatures, {});  // ✅ Stream handles updates
}
```

#### Step 3: Initialize Stream in Layout

```typescript
// components/layout/Header.tsx (or MainLayout)
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { useJobStream } from '@/hooks/useJobStream';

export default function Header() {
  // Establish streaming connections (one per feature domain)
  useNotificationStream();
  useJobStream();

  // ... rest of component
}
```

### Existing Streaming Implementations

| Feature | Stream Hook | Backend Handler | Pub/Sub Channel |
|---------|-------------|-----------------|-----------------|
| Notifications | `useNotificationStream` | `SubscribeNotifications` | `events:notifications:{userID}` |
| Generation Jobs | `useJobStream` | `SubscribeJobs` | `events:jobs:{userID}` |

### DON'T: Use Polling for Frequently-Updated Data

```typescript
// WRONG: Polling creates unnecessary load
const { data } = useQuery(listJobs, {}, {
  refetchInterval: (data) => hasActive ? 3000 : 30000,  // ❌
});
```

### DO: Use Streaming + Query Invalidation

```typescript
// CORRECT: Stream invalidates queries on events
useJobStream();  // Establishes SSE connection once
const { data } = useQuery(listJobs, {});  // No polling needed ✅
```

---

## Testing

```bash
# Backend tests
cd backend && go test ./...

# Frontend tests
cd frontend && npm test

# Type checking
cd frontend && npm run typecheck

# Full build verification
cd frontend && npm run build
```

---

## Deployment

- **GitOps**: ArgoCD syncs from this repo
- **Never** modify pods directly - ArgoCD will revert
- **Always** commit and push for changes to take effect
- Check `.github/workflows/` for CI pipeline

---

## Common Issues

### "Property X is missing" at runtime
Proto schema requires a field the code doesn't pass. Check the generated `*_pb.ts` for required fields.

### Type mismatch after proto changes
Run `buf generate` and restart the dev server. Generated files may be stale.

### Query returns wrong tenant's data
Missing RLS wrapper. All repository methods must use `database.WithRLS*` functions.

### Zod validation fails unexpectedly
Check `buf.validate` annotations in proto. Generated Zod includes these rules.

---

## File Naming Conventions

| Generated File | Purpose |
|---------------|---------|
| `*_pb.ts` | Protobuf message types and enums |
| `*_connect.ts` | Connect-RPC service definitions |
| `*_connectquery.ts` | TanStack Query hooks for Connect |
| `*_zod.ts` | Zod schemas from buf.validate |

---

## Quick Reference

```bash
# Start local dev
cd local-dev && docker-compose up

# Generate all code
cd proto && buf generate && cd ../backend && sqlc generate

# Run frontend
cd frontend && npm run dev

# Run backend
cd backend && go run ./cmd/server

# Lint protos
cd proto && buf lint

# Check for breaking changes
cd proto && buf breaking --against '.git#branch=main'
```
- remember always run playwright tests headless with reporting on list, and store screenshots that you will review yourself so the UI looks the way you expect and you can prove it. Also make sure you can see the console logs. mock anything external, or for example if we need to get an api response back, capture that on a successful test run and re use it as a mock so we don't hit the real api over and over.