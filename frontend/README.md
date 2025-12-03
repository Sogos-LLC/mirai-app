# Mirai Frontend

Next.js 14 application with Connect-Query for server state, XState for flows, and Zustand for UI state.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict, no `any`) |
| Server State | Connect-Query (@connectrpc/connect-query) |
| Flow Logic | XState v5 |
| UI State | Zustand |
| Styling | Tailwind CSS |
| Icons | Lucide React |

## State Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     State Management                         │
├───────────────────┬───────────────────┬─────────────────────┤
│   Connect-Query   │      XState       │       Zustand       │
│   Server State    │   Complex Flows   │      UI State       │
├───────────────────┼───────────────────┼─────────────────────┤
│ - Course data     │ - Course builder  │ - Sidebar open      │
│ - User profile    │ - AI generation   │ - Active block ID   │
│ - SME lists       │ - Registration    │ - Modal visibility  │
│ - Notifications   │ - Login flow      │ - Filter selections │
└───────────────────┴───────────────────┴─────────────────────┘
```

**Redux is forbidden.** All state follows this taxonomy.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:3000

# Type check
npm run build

# Run tests
npm run test
```

## Project Structure

```
frontend/src/
├── app/
│   ├── (main)/              # Protected routes (dashboard, courses, settings)
│   ├── (public)/            # Public routes (landing, auth)
│   └── layout.tsx           # Root providers
├── components/
│   ├── ui/                  # Button, Input, Modal, BottomSheet, etc.
│   ├── layout/              # Header, Sidebar, PageLayout, BottomTabNav
│   ├── auth/                # KratosForm, AuthLayout
│   ├── course-builder/      # Wizard steps
│   ├── ai-generation/       # Generation flow modal
│   ├── sme/                 # SME management
│   └── dashboard/           # Dashboard components
├── gen/                     # Generated from proto (DO NOT EDIT)
│   └── mirai/v1/
│       ├── *_pb.ts          # Protobuf types
│       ├── *_connect.ts     # Connect service definitions
│       └── *_connectquery.ts # Connect-Query hooks
├── hooks/
│   ├── useCourses.ts        # Course CRUD
│   ├── useAIGeneration.ts   # AI generation
│   ├── useSME.ts            # SME management
│   └── useCurrentUser.ts    # Auth state
├── machines/
│   ├── courseBuilderMachine.ts   # Course creation wizard
│   ├── courseGenerationMachine.ts # AI generation flow
│   ├── loginMachine.ts           # Login flow
│   └── registrationMachine.ts    # Registration flow
├── store/zustand/
│   ├── index.ts             # Global UI store
│   └── courseEditorStore.ts # Editor-specific state
├── lib/
│   ├── connect.ts           # Connect transport setup
│   ├── auth.config.ts       # Auth configuration (SINGLE SOURCE OF TRUTH)
│   ├── kratos/              # Kratos client
│   ├── cache/               # Redis cache adapter
│   └── storage/             # S3 storage adapter
└── contexts/
    └── AuthContext.tsx      # Session management
```

## Generated Code

All types and hooks come from protobuf:

```bash
# Regenerate from proto
cd ../proto && buf generate
```

**Never create manual interfaces** that mirror proto messages. Import from `@/gen/mirai/v1/*_pb`.

## Connect-Query Usage

```tsx
import { useQuery, useMutation } from '@connectrpc/connect-query';
import { listCourses, createCourse } from '@/gen/mirai/v1/course_connect';

function CourseList() {
  const { data, isLoading } = useQuery(listCourses);
  const createMutation = useMutation(createCourse);

  return (
    <button onClick={() => createMutation.mutate({ title: 'New Course' })}>
      Create
    </button>
  );
}
```

## XState Usage

```tsx
import { useMachine } from '@xstate/react';
import { courseBuilderMachine } from '@/machines/courseBuilderMachine';

function CourseBuilder() {
  const [state, send] = useMachine(courseBuilderMachine);

  return (
    <div>
      {state.matches('selectingAudience') && (
        <AudienceSelection onSelect={(id) => send({ type: 'SELECT_AUDIENCE', audienceId: id })} />
      )}
    </div>
  );
}
```

## Zustand Usage

```tsx
import { useSidebarOpen, useToggleSidebar } from '@/store/zustand';

function Header() {
  const sidebarOpen = useSidebarOpen();
  const toggleSidebar = useToggleSidebar();

  return <button onClick={toggleSidebar}>Toggle</button>;
}
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_KRATOS_BROWSER_URL=http://localhost:4433
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3001
KRATOS_PUBLIC_URL=http://localhost:4433

# Optional
ENABLE_REDIS_CACHE=true
REDIS_URL=redis://localhost:6379
USE_S3_STORAGE=true
S3_ENDPOINT=http://localhost:9000
```

## Routes

### Protected (`(main)`)

| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | Dashboard | Course library, creation |
| `/course-builder` | CourseBuilder | AI generation wizard |
| `/content-library` | ContentLibrary | Folder-based course browser |
| `/course/[id]/preview` | CoursePreview | Course content viewer |
| `/smes` | SMEManagement | Subject matter experts |
| `/settings` | Settings | Tenant configuration |

### Public (`(public)`)

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Landing | Redirect or marketing |
| `/auth/login` | Login | Kratos login flow |
| `/auth/registration` | Registration | Kratos registration |
| `/pricing` | Pricing | Stripe checkout |

## Docker

```bash
# Build app image
docker build -t mirai-frontend:latest .

# Build marketing image
docker build -f Dockerfile.marketing -t mirai-marketing:latest .

# Run
docker run -p 3000:3000 mirai-frontend:latest
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth.config.ts` | Auth routes, cookie config |
| `src/lib/connect.ts` | Connect-RPC transport |
| `src/middleware.ts` | Route protection |
| `src/components/providers/ConnectProvider.tsx` | Query client setup |
| `src/store/zustand/index.ts` | Global UI state |
| `tailwind.config.ts` | Tailwind configuration |
