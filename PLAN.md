# SCORM Export Feature Implementation Plan

## Overview

Implement a SCORM 2004 3rd Edition export service that packages generated course content into a downloadable ZIP file. The flow mirrors the existing course generation pattern: user initiates export, job is queued, progress is tracked via polling, and a download URL is provided upon completion.

## Architecture Summary

```
Frontend                    Backend                     Storage
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ CoursePreview   │        │ CourseService   │        │ MinIO           │
│ ExportModal     │───────>│ ExportCourse()  │        │ exports/        │
└────────┬────────┘        └────────┬────────┘        └────────┬────────┘
         │                          │                          │
         │ poll                     │ create job               │
         ▼                          ▼                          │
┌─────────────────┐        ┌─────────────────┐                │
│ useExportCourse │        │ Asynq Worker    │                │
│ useGetExport    │<───────│ ExportHandler   │────────────────┘
└─────────────────┘        └────────┬────────┘        upload zip
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ SCORMPackager   │
                           │ (domain svc)    │
                           └─────────────────┘
```

## Phase 1: Database Layer

### Migration 026: Create course_exports table

```sql
-- course_exports table for tracking export jobs
CREATE TYPE export_format AS ENUM ('scorm_12', 'scorm_2004', 'xapi', 'pdf');
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE course_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    format export_format NOT NULL,
    status export_status NOT NULL DEFAULT 'pending',
    version INT NOT NULL DEFAULT 1,
    file_path VARCHAR(500),           -- S3/MinIO path to ZIP
    file_size_bytes BIGINT,
    error_message TEXT,
    progress_percent INT DEFAULT 0,
    progress_message TEXT,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- RLS policy
ALTER TABLE course_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_exports FORCE ROW LEVEL SECURITY;

CREATE POLICY course_exports_tenant_isolation ON course_exports
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_course_exports_tenant ON course_exports(tenant_id);
CREATE INDEX idx_course_exports_course ON course_exports(course_id);
CREATE INDEX idx_course_exports_status ON course_exports(status);
```

### SQLC Queries: `backend/queries/course_export.sql`

```sql
-- name: CreateCourseExport :one
INSERT INTO course_exports (tenant_id, course_id, format, created_by_user_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetCourseExportByID :one
SELECT * FROM course_exports WHERE id = $1;

-- name: ListCourseExportsByCourseID :many
SELECT * FROM course_exports
WHERE course_id = $1
ORDER BY created_at DESC;

-- name: UpdateCourseExportStatus :exec
UPDATE course_exports
SET status = $1, progress_percent = $2, progress_message = $3,
    started_at = COALESCE(started_at, CASE WHEN $1 = 'processing' THEN NOW() END),
    completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() END
WHERE id = $4;

-- name: UpdateCourseExportComplete :exec
UPDATE course_exports
SET status = 'completed', file_path = $1, file_size_bytes = $2,
    progress_percent = 100, completed_at = NOW()
WHERE id = $3;

-- name: UpdateCourseExportFailed :exec
UPDATE course_exports
SET status = 'failed', error_message = $1, completed_at = NOW()
WHERE id = $2;

-- name: ClaimPendingExport :one
UPDATE course_exports
SET status = 'processing', started_at = NOW()
WHERE id = (
    SELECT id FROM course_exports
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

## Phase 2: Domain Layer - SCORM Packager

### New file: `backend/internal/domain/scorm/packager.go`

The SCORM packager is a **pure domain service** with no external dependencies. It takes course data and returns the ZIP bytes.

**Responsibilities:**
1. Generate `imsmanifest.xml` with proper SCORM 2004 3rd Edition structure
2. Create HTML pages for each lesson with embedded content
3. Include the SCORM JavaScript API wrapper
4. Package everything into a ZIP archive

**Key interfaces:**

```go
// CourseData represents the input to the packager
type CourseData struct {
    ID              string
    Title           string
    DesiredOutcome  string
    Sections        []SectionData
}

type SectionData struct {
    ID      string
    Title   string
    Lessons []LessonData
}

type LessonData struct {
    ID         string
    Title      string
    Components []ComponentData
}

type ComponentData struct {
    Type        string // "text", "heading", "quiz", "image", "callout", "code"
    ContentJSON string
}

// Packager creates SCORM packages
type Packager struct{}

func NewPackager() *Packager

// Package creates a SCORM 2004 3rd Edition package
func (p *Packager) Package(data CourseData) ([]byte, error)
```

### Static assets to embed

Create `backend/internal/domain/scorm/assets/` directory with:
- `scorm-api.js` - SCORM 2004 API wrapper (from the reference doc)
- `styles.css` - Course styling
- `base.html` - HTML template for lessons

These will be embedded using Go's `embed` directive.

## Phase 3: Application Layer - Export Service

### New file: `backend/internal/application/service/course_export_service.go`

**Responsibilities:**
1. Orchestrate the export workflow
2. Load course data and generated lessons
3. Call the SCORM packager
4. Upload to MinIO
5. Update export status

```go
type CourseExportService struct {
    exportRepo       repository.CourseExportRepository
    courseRepo       repository.CourseRepository
    generatedRepo    repository.GeneratedLessonRepository
    componentRepo    repository.LessonComponentRepository
    scormPackager    *scorm.Packager
    storage          storage.Storage
    taskEnqueuer     TaskEnqueuer // optional push-based
    logger           domainservice.Logger
}

// ExportCourse initiates an export job
func (s *CourseExportService) ExportCourse(ctx context.Context, userID uuid.UUID, courseID string, format ExportFormat) (*CourseExport, error)

// ProcessExport runs the actual export (called by worker)
func (s *CourseExportService) ProcessExport(ctx context.Context, exportID uuid.UUID) error

// GetExportStatus returns current export status
func (s *CourseExportService) GetExportStatus(ctx context.Context, exportID string) (*CourseExport, error)

// GetDownloadURL generates a presigned URL for the export
func (s *CourseExportService) GetDownloadURL(ctx context.Context, exportID string) (string, time.Time, error)
```

## Phase 4: Worker Handler

### Update: `backend/internal/domain/worker/tasks.go`

```go
const TypeCourseExport = "course:export"

type CourseExportPayload struct {
    ExportID string `json:"export_id"`
}

func NewCourseExportTask(exportID string) (*asynq.Task, error)
```

### Update: `backend/internal/infrastructure/worker/handlers.go`

Add `HandleCourseExport` method and wire it up in the server.

## Phase 5: Connect-RPC Handlers

### Update: `backend/internal/presentation/connect/course_service.go`

Implement the already-defined proto methods:

```go
// ExportCourse initiates a course export job
func (s *CourseServiceServer) ExportCourse(ctx context.Context, req *connect.Request[v1.ExportCourseRequest]) (*connect.Response[v1.ExportCourseResponse], error)

// GetExportStatus returns the status of an export job
func (s *CourseServiceServer) GetExportStatus(ctx context.Context, req *connect.Request[v1.GetExportStatusRequest]) (*connect.Response[v1.GetExportStatusResponse], error)

// DownloadExport returns a presigned URL for downloading
func (s *CourseServiceServer) DownloadExport(ctx context.Context, req *connect.Request[v1.DownloadExportRequest]) (*connect.Response[v1.DownloadExportResponse], error)

// ListExports returns all exports for a course
func (s *CourseServiceServer) ListExports(ctx context.Context, req *connect.Request[v1.ListExportsRequest]) (*connect.Response[v1.ListExportsResponse], error)
```

## Phase 6: Frontend Implementation

### New hook: `frontend/src/hooks/useExport.ts`

```typescript
// Initiate export
export function useExportCourse() {
    const mutation = useMutation(exportCourse);
    // Returns export ID for polling
}

// Poll export status
export function useGetExportStatus(exportId: string | undefined, options?: { enabled?: boolean }) {
    // Auto-poll every 2 seconds while pending/processing
}

// Get download URL
export function useDownloadExport() {
    const mutation = useMutation(downloadExport);
    // Returns presigned URL
}

// List exports for a course
export function useListExports(courseId: string | undefined)
```

### Update: `frontend/src/components/course/CoursePreview.tsx`

Replace simulated export with real implementation:

1. Modal states: `idle` -> `starting` -> `processing` -> `completed` | `failed`
2. Show progress bar during processing
3. Show download button on completion
4. Handle errors gracefully

**Modal flow:**
1. User clicks "Export Course"
2. Modal shows format selection (initially just SCORM 2004)
3. User clicks "Export SCORM"
4. Shows "Starting export..." with spinner
5. Polls for status, shows progress (0-100%)
6. On complete: Shows success checkmark + "Download" button
7. On failure: Shows error message + "Try Again" button

## File Changes Summary

### New Files (Backend)
1. `backend/migrations/026_create_course_exports.up.sql`
2. `backend/migrations/026_create_course_exports.down.sql`
3. `backend/queries/course_export.sql`
4. `backend/internal/domain/scorm/packager.go`
5. `backend/internal/domain/scorm/manifest.go` (imsmanifest.xml generation)
6. `backend/internal/domain/scorm/lesson_html.go` (HTML generation)
7. `backend/internal/domain/scorm/assets/scorm-api.js`
8. `backend/internal/domain/scorm/assets/styles.css`
9. `backend/internal/domain/scorm/assets/base.html`
10. `backend/internal/application/service/course_export_service.go`
11. `backend/internal/infrastructure/persistence/sqlc/course_export_repository.go`

### Modified Files (Backend)
1. `backend/internal/domain/worker/tasks.go` - Add export task type
2. `backend/internal/infrastructure/worker/handlers.go` - Add export handler
3. `backend/internal/infrastructure/worker/client.go` - Add EnqueueCourseExport
4. `backend/internal/presentation/connect/course_service.go` - Implement export RPCs
5. `backend/cmd/server/main.go` - Wire up new service

### New Files (Frontend)
1. `frontend/src/hooks/useExport.ts`
2. `frontend/src/components/course/ExportModal.tsx` (extracted from CoursePreview)

### Modified Files (Frontend)
1. `frontend/src/components/course/CoursePreview.tsx` - Use new ExportModal

## SCORM Package Structure

The generated ZIP will have this structure:

```
course-{id}.zip
├── imsmanifest.xml
├── js/
│   └── scorm-api.js
├── css/
│   └── styles.css
├── content/
│   ├── section-1/
│   │   ├── lesson-1.html
│   │   ├── lesson-2.html
│   │   └── ...
│   └── section-2/
│       └── ...
└── assets/
    └── images/
        └── ... (referenced images)
```

## Design Decisions

1. **Image handling**: Embed images in ZIP with optimization
   - Download all referenced images from MinIO
   - Resize large images (max 1920px width)
   - Compress using appropriate quality settings
   - This ensures offline LMS compatibility

2. **Quiz handling**: Use SCORM interactions API
   - Each knowledge check recorded as a SCORM interaction
   - Track correct/incorrect responses
   - Include in score calculation

3. **Progress tracking**: Per-lesson objectives
   - Each lesson gets its own SCORM objective
   - Enables granular progress reporting in LMS
   - Rollup rules aggregate to course completion

4. **Format support**: SCORM 2004 3rd Edition only (MVP)
   - Docebo compatible
   - Can add SCORM 1.2 support later if needed

5. **File size limits**:
   - Warn at 100MB during packaging
   - Hard fail at 500MB
   - Return descriptive error if limit exceeded

## Testing Strategy

1. **Unit tests**: SCORM packager with various course structures
2. **Integration tests**: Full export flow with test course
3. **E2E tests**: Export from CoursePreview, verify download works
4. **SCORM validation**: Test in SCORM Cloud before LMS upload

## Estimated Implementation Scope

- **Database/Queries**: ~100 lines
- **SCORM Packager**: ~500-700 lines (most complex part)
- **Export Service**: ~200 lines
- **Worker Handler**: ~50 lines
- **Connect Handlers**: ~150 lines
- **Frontend Hooks**: ~80 lines
- **Export Modal**: ~150 lines

**Total: ~1,200-1,400 lines of new code**
