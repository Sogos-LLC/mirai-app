# Mirai Application Architecture Overview

## High-Level Architecture Diagram

```text
                                    ┌───────────────────────────────────┐
                                    │         External Services         │
                                    │                                   │
                                    │   ┌────────────┐  ┌────────────┐  │
                                    │   │   Stripe   │  │   MinIO    │  │
                                    │   │ (Payments) │  │(S3 Storage)│  │
                                    │   └─────┬──────┘  └─────┬──────┘  │
                                    └─────────┼───────────────┼─────────┘
                                              │               │
┌─────────────────────────────────────────────┼───────────────┼────────────────────────────────────────┐
│  Kubernetes Cluster                         │               │                                        │
│                                             │               │                                        │
│  ┌─[ mirai namespace ]──────────────────────┼───────────────┼─────────────────────────────────────┐  │
│  │                                          ▼               ▼                                     │  │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │  │
│  │  │   Frontend   │      │  Marketing   │      │   Backend    │      │   Mirai DB   │            │  │
│  │  │  (Next.js)   │─────▶│  (Next.js)   │      │    (Go)      │─────▶│ (PostgreSQL) │            │  │
│  │  │    :3000     │      │    :3000     │      │    :8080     │      │    :5432     │            │  │
│  │  └──────┬───────┘      └──────────────┘      └──────┬───────┘      └──────────────┘            │  │
│  │         │                                           │                                          │  │
│  │         │                                           │                                          │  │
│  │         └────────── Connect-RPC (gRPC-Web) ─────────┘                                          │  │
│  │                                 │                                                              │  │
│  └─────────────────────────────────┼──────────────────────────────────────────────────────────────┘  │
│                                    │                                                                 │
│                                    │                                                                 │
│  ┌─[ kratos namespace ]────────────▼─────┐          ┌─[ redis namespace ]─────────────────────────┐  │
│  │                                       │          │                                             │  │
│  │  ┌─────────────────────────────────┐  │          │  ┌───────────────────────────────────────┐  │  │
│  │  │           Ory Kratos            │  │          │  │                 Redis                 │  │  │
│  │  │      (Identity & Sessions)      │  │          │  │          (Cache & Sessions)           │  │  │
│  │  │     Public :80 / Admin :80      │  │          │  │                 :6379                 │  │  │
│  │  └──────────────┬──────────────────┘  │          │  └───────────────────────────────────────┘  │  │
│  │                 │                     │          │                                             │  │
│  └─────────────────┼─────────────────────┘          └─────────────────────────────────────────────┘  │
│                    │                                                                                 │
│                    ▼                                                                                 │
│  ┌─[ postgres namespace ]────────────────┐                                                           │
│  │                                       │                                                           │
│  │  ┌─────────────────────────────────┐  │                                                           │
│  │  │        Kratos PostgreSQL        │  │                                                           │
│  │  │          (Identity DB)          │  │                                                           │
│  │  └─────────────────────────────────┘  │                                                           │
│  │                                       │                                                           │
│  └───────────────────────────────────────┘                                                           │
│                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Proto Contracts (Single Source of Truth)

**Location:** `/proto/mirai/v1/` (15 proto files, ~2,351 lines)

Proto files define ALL service contracts. Code is generated for both backend and frontend:

| Proto File | Purpose | Generated Code |
|------------|---------|----------------|
| `common.proto` | Shared types (User, Company, Team, Roles, Enums) | Go + TypeScript types |
| `auth.proto` | Registration, login, onboarding | Go handlers + TS hooks |
| `course.proto` | Course CRUD, exports (SCORM, xAPI, PDF) | Go handlers + TS hooks |
| `ai_generation.proto` | AI course/lesson generation | Go handlers + TS hooks |
| `sme.proto` | Subject Matter Expert knowledge | Go handlers + TS hooks |
| `billing.proto` | Stripe subscription integration | Go handlers + TS hooks |
| `user.proto` | User profile management | Go handlers + TS hooks |
| `team.proto` | Team and member operations | Go handlers + TS hooks |
| `invitation.proto` | Team invitations and seat management | Go handlers + TS hooks |
| `tenant.proto` | Multi-tenant isolation | Go handlers + TS hooks |
| `tenant_settings.proto` | Per-tenant AI configuration | Go handlers + TS hooks |
| `target_audience.proto` | Learner profile templates | Go handlers + TS hooks |
| `notification.proto` | User notifications | Go handlers + TS hooks |
| `company.proto` | Company/organization management | Go handlers + TS hooks |
| `health.proto` | Service health checks | Go handlers + TS hooks |

**Code Generation Flow:**

```text
┌───────────────┐       ┌──────────────┐       ┌─────────────────────────────────────┐
│  Proto Files  │──────▶│ buf generate │──────▶│ Backend: /backend/gen/              │
└───────────────┘       └──────────────┘       │ (Go + Connect-RPC)                  │
                               │               └─────────────────────────────────────┘
                               │
                               │               ┌─────────────────────────────────────┐
                               └──────────────▶│ Frontend: /frontend/src/gen/        │
                                               │ (TypeScript + React Query hooks)    │
                                               └─────────────────────────────────────┘
```

**buf.gen.yaml Configuration:**
- Go protobuf types (`buf.build/protocolbuffers/go`)
- Go Connect-RPC stubs (`buf.build/connectrpc/go`)
- TypeScript ES types (`buf.build/bufbuild/es`)
- TypeScript Connect-ES clients (`buf.build/connectrpc/es`)
- TypeScript Connect-Query hooks (`buf.build/connectrpc/query-es`)

---

## 2. Backend (Go + Connect-RPC)

**Stack:** Go 1.24, Connect-RPC, PostgreSQL, Redis

**Architecture Pattern:** Clean Architecture

```text
cmd/server/main.go                    # Entry point
internal/
├── presentation/connect/             # HTTP handlers (generated from proto)
├── application/service/              # Business logic (15 services)
├── domain/                           # Domain models & repository interfaces
└── infrastructure/                   # External integrations
    ├── persistence/postgres/         # 19 PostgreSQL repositories
    ├── external/
    │   ├── kratos/                   # Ory Kratos client
    │   ├── stripe/                   # Stripe payments
    │   └── gemini/                   # AI generation
    ├── storage/                      # S3/MinIO storage
    └── cache/                        # Redis caching
```

### Key Services

| Service | Responsibility |
|---------|----------------|
| **AuthService** | Registration with Stripe checkout, invitation acceptance, onboarding |
| **UserService** | Profile management, plan upgrades |
| **CompanyService** | Organization management, seat tracking |
| **TeamService** | Team creation, member management, folder organization |
| **InvitationService** | Email invitations, role assignment, seat reservation |
| **BillingService** | Subscription queries, usage reporting |
| **CourseService** | Course CRUD, versioning, exports (SCORM, xAPI, PDF) |
| **AIGenerationService** | Gemini-powered course outline and lesson generation |
| **SMEService** | Subject matter expert knowledge ingestion and management |
| **SMEIngestionService** | Background processing of SME content uploads |
| **TargetAudienceService** | Persona creation and management |
| **NotificationService** | Email and in-app notifications |
| **TenantSettingsService** | Encrypted API key storage (Gemini, etc.) |
| **ProvisioningService** | Deferred account creation after payment |
| **CleanupService** | Expired registration cleanup |

### Background Workers

| Worker | Interval | Purpose |
|--------|----------|---------|
| Provisioning Service | 10 seconds | Creates accounts after Stripe payment confirms |
| AI Generation Worker | 5 seconds | Processes queued generation jobs |
| SME Ingestion Worker | 5 seconds | Processes knowledge uploads |
| Cleanup Service | 1 hour | Removes expired pending registrations |

### Interceptors

- **AuthInterceptor**: Validates Kratos session, extracts tenant context for RLS
- **LoggingInterceptor**: Structured request/response logging

---

## 3. Frontend (Next.js 14 + React)

**Stack:** Next.js 14 (App Router), Redux Toolkit, XState v5, Connect-Query, Tailwind CSS

### State Management Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                 React 18 + Next.js 14                    │
│               (App Router, Route Groups)                 │
└────────────────────────────┬─────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼──────┐     ┌─────▼──────┐     ┌─────▼──────┐
    │   Redux    │     │   XState   │     │   Custom   │
    │   Toolkit  │     │     v5     │     │   Hooks    │
    └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                 ┌───────────▼────────────┐
                 │     React Query +      │
                 │     Connect-Query      │
                 │     (proto hooks)      │
                 └───────────┬────────────┘
                             │
            ┌────────────────▼─────────────────┐
            │     Proto-Generated Clients      │
            │     (*_pb.ts, *_connect.ts)      │
            └────────────────┬─────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │  Connect Transport  │
                  │ (gRPC-Web backend)  │
                  └─────────────────────┘
```

### Redux Toolkit Slices

| Slice | Purpose |
|-------|---------|
| `authSlice` | Kratos session state |
| `courseSlice` | Course data and folder hierarchy |
| `aiGenerationSlice` | AI generation status |
| `smeSlice` | Subject matter expert data |
| `targetAudienceSlice` | Target audience configuration |
| `tenantSettingsSlice` | Tenant/company settings |
| `teamSlice` | Team member data |
| `notificationSlice` | Notification state |
| `uiSlice` | UI state (sidebar visibility, etc.) |

### XState State Machines

| Machine | Purpose | Lines |
|---------|---------|-------|
| `registrationMachine` | Multi-step registration with email validation, org info, plan selection, checkout | 447 |
| `loginMachine` | Kratos flow initialization, expiration handling | 279 |
| `logoutMachine` | Session cleanup | 253 |
| `invitationAcceptMachine` | Invitation validation and acceptance | 469 |
| `invitedUserMachine` | Invited user registration flow | 377 |
| `courseGenerationMachine` | AI course generation with status tracking | 820 |
| `courseBuilderMachine` | Course editing state | 347 |
| `componentEditingMachine` | Component-level editing | 480 |
| `smeMachine` | SME interaction flow | 484 |

### Page Structure (Next.js App Router)

```text
app/
├── layout.tsx                    # Root provider setup (Redux + Connect)
├── (public)/                     # Public routes
│   ├── auth/
│   │   ├── login/
│   │   ├── registration/
│   │   ├── accept-invite/
│   │   └── recovery/
│   └── pricing/
├── (main)/                       # Protected routes with sidebar
│   ├── dashboard/
│   ├── course-builder/
│   ├── content-library/
│   ├── course/[courseId]/
│   ├── settings/
│   ├── teams/
│   ├── target-audiences/
│   ├── smes/
│   └── ...
└── api/health/
```

---

## 4. Authentication (Ory Kratos)

**Deployed in:** `kratos` namespace with dedicated PostgreSQL in `postgres` namespace

### Identity Schema

```json
{
  "traits": {
    "email": "user@example.com",
    "name": {
      "first": "John",
      "last": "Doe"
    }
  }
}
```

### Session Configuration

| Setting | Value |
|---------|-------|
| Lifespan | 24 hours |
| Cookie (API flow) | `ory_session_token` |
| Cookie (Browser flow) | `ory_kratos_session` |
| Domain | `.sogos.io` (production) |
| SameSite | `Lax` |

### Self-Service Flows

| Flow | Lifespan | UI URL |
|------|----------|--------|
| Login | 10 minutes | `/auth/login` |
| Registration | 10 minutes | `/auth/registration` |
| Recovery | Code-based | `/auth/recovery` |
| Verification | Code-based | `/auth/verification` |
| Settings | 15 min privileged | `/auth/settings` |

### Integration Points

- **Frontend Middleware:** Validates sessions via `/sessions/whoami`
- **Backend Interceptor:** Extracts Kratos ID → User → Tenant ID for RLS
- **Registration:** Deferred account creation (Kratos identity created after Stripe payment)

### Authentication Flows

#### Registration Flow (Paid Plans)

1. Frontend submits registration form via `AuthService.Register()`
2. Backend validates email, hashes password, creates Stripe checkout session
3. Creates `PendingRegistration` record (expires in 24h)
4. Returns `checkoutUrl` - user redirects to Stripe
5. User completes payment on Stripe
6. Stripe webhook (`checkout.session.completed`) marks registration as paid
7. Background job creates Kratos identity, Company, User records
8. Welcome email sent with login instructions

#### Invitation Registration Flow

1. User clicks invite link with token
2. Backend validates invitation, creates Kratos identity
3. Creates User record with company/tenant/role from invitation
4. Marks invitation as accepted, performs login
5. Returns `sessionToken`, user redirected to `/dashboard`

---

## 5. Databases

### Mirai Application Database (PostgreSQL 15)

**Location:** `mirai` namespace, NFS-backed 10Gi storage

#### Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant isolation root |
| `companies` | Organizations with Stripe billing |
| `users` | Users linked to Kratos identities via `kratos_id` |
| `teams` | Team groupings within companies |
| `team_members` | Team membership with roles |
| `invitations` | Pending invitations with token-based acceptance |
| `pending_registrations` | Deferred account creation for Stripe flow |

#### Course Content Tables

| Table | Purpose |
|-------|---------|
| `courses` | Course metadata (content bodies in MinIO) |
| `folders` | Library folder hierarchy |
| `course_modules` | Sections/chapters within courses |
| `lessons` | Legacy lesson structure |
| `scorm_packages` | Export formats (SCORM, xAPI, PDF) |

#### SME Knowledge Tables

| Table | Purpose |
|-------|---------|
| `subject_matter_experts` | Knowledge sources (global or team-scoped) |
| `sme_team_access` | Access control for team-scoped SMEs |
| `sme_tasks` | Delegated content gathering |
| `sme_task_submissions` | Uploaded files with AI summaries |
| `sme_knowledge_chunks` | Distilled knowledge units |

#### AI Generation Tables

| Table | Purpose |
|-------|---------|
| `tenant_ai_settings` | Encrypted API keys (AES-256-GCM) |
| `generation_jobs` | Tracks all AI operations |
| `course_outlines` | AI-generated structure with approval workflow |
| `outline_sections` | Sections within course outlines |
| `outline_lessons` | Lessons with learning objectives |
| `generated_lessons` | Full AI-generated lesson content |
| `lesson_components` | Content blocks (text, heading, image, quiz) |
| `course_generation_inputs` | Captures SME IDs, target audience, context |

#### Notifications Table

| Table | Purpose |
|-------|---------|
| `notifications` | In-app and email notifications with read status |

### Row-Level Security (RLS)

All tables enforce tenant isolation via PostgreSQL RLS policies:

```sql
-- Session variables set per request
SET app.tenant_id = '<tenant_uuid>';
SET app.user_id = '<user_uuid>';
SET app.is_superadmin = 'false';

-- Policy example
CREATE POLICY tenant_isolation ON courses
  USING (tenant_id = current_tenant_id() OR is_superadmin());
```

### Migrations

**Tool:** golang-migrate (19 migration files)

| Migration | Purpose |
|-----------|---------|
| 001 | Initial schema (companies, users, teams, invitations) |
| 002 | Seat count for billing |
| 003 | Pending registrations for Stripe flow |
| 004-005 | Multi-tenant isolation with RLS |
| 006 | Course tables |
| 007 | Enable RLS policies |
| 008 | Folders table |
| 009 | SME tables |
| 010 | Target audience tables |
| 011 | AI generation tables |
| 012 | Notification tables |
| 013-019 | Various fixes and enhancements |

### Kratos Database (PostgreSQL 15)

**Location:** `postgres` namespace, dedicated for identity data

- Auto-migration managed by Kratos
- Stores identities, sessions, recovery tokens, verification tokens

---

## 6. Redis (Caching Layer)

**Location:** `redis` namespace

### Configuration

| Setting | Value |
|---------|-------|
| Max Memory | 256MB |
| Eviction Policy | `allkeys-lru` |
| Persistence | AOF with `everysec` fsync |
| Keyspace Notifications | Enabled (`Ex`) |

### Cache Interface

```go
type Cache interface {
    Get(ctx, key string, v interface{}) (*CacheEntry, error)
    Set(ctx, key string, v interface{}, etag string, ttl time.Duration) (string, error)
    Delete(ctx, key string) error
    InvalidatePattern(ctx, pattern string) error
    AcquireLock(ctx, key string, ttl time.Duration) (string, error)
    ReleaseLock(ctx, key string, lockID string) error
}
```

### Cache Keys

```text
CacheKeys.Library()             → "library:index"
CacheKeys.Folders()             → "folders:hierarchy"
CacheKeys.Course(id)            → "course:{id}"
CacheKeys.FolderCourses(id)     → "folder:{id}:courses"
CacheKeys.AllCourses()          → "courses:all"
CacheKeys.CoursesByStatus(s)    → "courses:status:{status}"
CacheKeys.CoursesByTag(tag)     → "courses:tag:{tag}"
```

### Features

- ETag-based optimistic locking for concurrent updates
- Distributed locks using Redis SetNX with Lua scripts
- Pattern-based cache invalidation
- Default TTL: 5 minutes
- Automatic stale data cleanup (>24 hours)

---

## 7. Object Storage (MinIO/S3)

**Endpoint:** `http://192.168.1.226:9768` (self-hosted MinIO)
**Bucket:** `mirai`
**Base Path:** `data`

### Storage Pattern

```text
s3://mirai/
└── data/
    └── <tenant_id>/
        ├── courses/
        │   └── <course_id>/
        │       └── content.json
        ├── sme/
        │   └── <sme_id>/
        │       └── knowledge.json
        ├── exports/
        │   └── <export_id>.zip
        └── submissions/
            └── <submission_id>/
                └── files/
```

### Stored Content Types

| Content | Storage Location |
|---------|------------------|
| Course content bodies | `/<tenant>/courses/<id>/content.json` |
| SME knowledge documents | `/<tenant>/sme/<id>/` |
| AI-generated lessons | `/<tenant>/lessons/<id>/` |
| SCORM/xAPI exports | `/<tenant>/exports/` |
| Task submission files | `/<tenant>/submissions/` |

### Storage Adapter Interface

```go
type StorageAdapter interface {
    PutJSON(ctx, key string, v interface{}) error
    GetJSON(ctx, key string, v interface{}) error
    Put(ctx, key string, content []byte, contentType string) error
    Get(ctx, key string) ([]byte, error)
    Delete(ctx, key string) error
    ListKeys(ctx, prefix string) ([]string, error)
    GetPresignedUploadURL(ctx, key string, duration time.Duration) (string, error)
    GetPresignedDownloadURL(ctx, key string, duration time.Duration) (string, error)
}
```

---

## 8. Kubernetes Deployment

### Namespaces

| Namespace | Components |
|-----------|------------|
| `mirai` | Frontend (3 replicas), Marketing (3 replicas), Backend (3 replicas), PostgreSQL |
| `kratos` | Ory Kratos (public + admin APIs) |
| `postgres` | Kratos PostgreSQL |
| `redis` | Redis cache |
| `default` | Mailpit (SMTP for dev) |

### Service Discovery (DNS)

| Service | FQDN | Port |
|---------|------|------|
| Mirai Backend | `mirai-backend.mirai.svc.cluster.local` | 8080 |
| Mirai Frontend | `mirai-frontend.mirai.svc.cluster.local` | 80 |
| Mirai Marketing | `mirai-marketing.mirai.svc.cluster.local` | 80 |
| Mirai Database | `mirai-db.mirai.svc.cluster.local` | 5432 |
| Kratos Public | `kratos-public.kratos.svc.cluster.local` | 80 |
| Kratos Admin | `kratos-admin.kratos.svc.cluster.local` | 80 |
| Kratos Database | `postgres.postgres.svc.cluster.local` | 5432 |
| Redis | `redis.redis.svc.cluster.local` | 6379 |
| Mailpit SMTP | `mailpit.default.svc.cluster.local` | 1025 |

### Network Policies

| Policy | Source | Destination | Ports |
|--------|--------|-------------|-------|
| `allow-egress-to-kratos` | mirai namespace | kratos namespace | TCP 80, 4433, 4434 |
| `allow-egress-to-redis` | mirai namespace | redis namespace | TCP 6379 |
| `allow-egress-smtp` | mirai-backend | default namespace | TCP 1025 |

### Secrets

| Secret | Namespace | Keys |
|--------|-----------|------|
| `mirai-db-secret` | mirai | dsn, password |
| `postgres-secret` | postgres | password |
| `kratos-secret` | kratos | dsn, secretsDefault |
| `mirai-stripe-secret` | mirai | secret-key, webhook-secret, starter-price-id, pro-price-id |
| `minio-secret` | mirai | endpoint, region, accesskey, secretkey |
| `mirai-encryption-secret` | mirai | encryption-key |

### Deployment Configuration

| Workload | Replicas | Resources (Request/Limit) |
|----------|----------|---------------------------|
| mirai-backend | 3 | 100m/500m CPU, 128Mi/256Mi memory |
| mirai-frontend | 3 | 100m/500m CPU, 256Mi/512Mi memory |
| mirai-marketing | 3 | 50m/200m CPU, 128Mi/256Mi memory |
| mirai-db | 1 | 100m/500m CPU, 256Mi/512Mi memory |
| redis | 1 | 100m/500m CPU, 256Mi/512Mi memory |

### Health Checks

| Service | Endpoint | Probes |
|---------|----------|--------|
| Backend | `/health` | Startup (60s), Liveness (10s), Readiness (5s) |
| Frontend | `/api/health` | Startup (60s), Liveness (10s), Readiness (5s) |
| PostgreSQL | `pg_isready` | Liveness (30s), Readiness (5s) |
| Redis | `redis-cli PING` | Liveness (30s), Readiness (5s) |

### Security Hardening

- All containers run as non-root users
- Read-only root filesystems where applicable
- Capabilities dropped: ALL
- seccompProfile: RuntimeDefault
- No privilege escalation allowed

---

## 9. External Integrations

### Stripe

- Checkout sessions for paid plan registration
- Customer subscription management
- Webhook handling (`checkout.session.completed`, `customer.subscription.*`)
- Two pricing tiers: Starter and Pro

### Gemini (AI)

- Per-tenant API key management via TenantSettings
- Course outline generation
- Lesson content generation
- SME knowledge ingestion and summarization
- Component regeneration

### Email (SMTP)

- Mailpit for development (port 1025)
- Welcome emails after registration
- Invitation emails
- Recovery/verification emails via Kratos

### Cloudflare Tunnels

External traffic routed via Cloudflare (no ingress in cluster):
- `mirai.sogos.io` - Frontend
- `mirai-api.sogos.io` - Backend
- `mirai-auth.sogos.io` - Kratos public
- `get-mirai.sogos.io` - Marketing

---

## 10. Request Flow Example: Creating a Course

```text
1. USER ACTION (Frontend)
   └─ "Create Course" clicked
      └─▶ Call: useCourses().createCourse()

2. FRONTEND REQUEST (Connect-RPC)
   └─▶ POST /mirai.v1.CourseService/CreateCourse
       Headers: { Authorization: Bearer <session_token> }

3. BACKEND AUTH (AuthInterceptor)
   └─▶ GET kratos-public/sessions/whoami
       └─▶ Returns: kratosID, email, tenantID

4. BACKEND EXECUTION (CourseService)
   ├─▶ Set RLS: SET app.tenant_id = '<tenant_id>'
   ├─▶ DB: INSERT INTO courses (...)
   ├─▶ MinIO: PutJSON s3://mirai/<tenant>/courses/<id>/content.json
   └─▶ Redis: DEL courses:all, folder:<id>:courses

5. RESPONSE UPDATE
   ├─▶ Response flows back via Connect-RPC
   ├─▶ React Query cache invalidates/updates
   └─▶ UI re-renders with new course
```

---

## 11. Key Architectural Principles

1. **Proto-First Design:** All contracts defined in proto, generated code for Go and TypeScript
2. **Multi-Tenant Isolation:** PostgreSQL RLS with tenant context set per request
3. **Metadata + Object Storage:** PostgreSQL for metadata, MinIO for content bodies
4. **Deferred Provisioning:** Accounts created asynchronously after Stripe payment
5. **State Machine Flows:** XState manages complex auth and generation flows
6. **Contract Testing:** Auth config locked in unit/integration tests
7. **Centralized Auth Config:** Single source of truth for all authentication constants
8. **Event-Driven Architecture:** Telemetry events emitted at key state transitions
9. **Error States Explicit:** Every failure path lands in a distinct state with recovery options
10. **Background Workers:** Async processing for long-running operations

---

## 12. Environment Variables Reference

### Backend

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (8080) |
| `DATABASE_URL` | PostgreSQL connection string |
| `KRATOS_URL` | Kratos public API |
| `KRATOS_ADMIN_URL` | Kratos admin API |
| `ALLOWED_ORIGIN` | CORS origin |
| `FRONTEND_URL` | Frontend URL for redirects |
| `MARKETING_URL` | Marketing site URL |
| `BACKEND_URL` | Backend public URL |
| `STRIPE_*` | Stripe API keys and price IDs |
| `S3_*` | MinIO/S3 configuration |
| `SMTP_*` | Email configuration |
| `ENCRYPTION_KEY` | AES key for API key encryption |
| `REDIS_URL` | Redis connection string |
| `ENABLE_REDIS_CACHE` | Enable/disable Redis caching |

### Frontend

| Variable | Purpose |
|----------|---------|
| `KRATOS_PUBLIC_URL` | Kratos public API (server-side) |
| `NEXT_PUBLIC_KRATOS_BROWSER_URL` | Kratos public API (client-side) |
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_APP_URL` | Frontend URL |
| `NEXT_PUBLIC_LANDING_URL` | Marketing site URL |
| `S3_*` | MinIO/S3 configuration |
| `REDIS_URL` | Redis connection string |
| `ENABLE_REDIS_CACHE` | Enable/disable Redis caching |
