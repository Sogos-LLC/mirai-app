# Knowledge-Grounded Course Generation Implementation Plan

## Overview

Implement a knowledge-grounded course generation system with RAG orchestration, provenance tracking, and curriculum validation. The system ensures all generated content is traceable to source documents with clear grounding visualization.

**Key Architecture Decisions:**
1. **Provenance embedded in S3CourseContent** - NOT a separate database table (follows existing MinIO-first pattern)
2. **Knowledge selection via modal** - Rich modal accessible from "Add Knowledge" button in step 1 (Course Name)
3. **Curriculum map as separate artifact** - With staleness detection and whole-map approval
4. **RAG config via YAML** - With optional database overrides for A/B testing

---

## Session 1: Knowledge Selection Modal ✅ COMPLETED (REVISED)

**Goal:** Add rich modal for knowledge source selection accessible from Course Name step.

**Initial Approach (Deprecated):** Separate wizard step for knowledge selection
**Final Approach:** Modal accessible from "Add Knowledge" button in Course Name step

**Deliverables:**
- [x] Rich modal for selecting team/global knowledge sources + uploading files
- [x] Wizard remains 5 steps (courseName → titleDescription → smeSelection → audienceSelection → toneSelection)
- [x] Selected knowledge IDs persisted in WizardStepData
- [x] Backend filters RAG to only selected sources (stored in wizardData)

### 1.1 Proto Schema Updates ✅

**File:** `proto/mirai/v1/course_wizard.proto`

Added to `WizardStepData`:
```protobuf
// Knowledge selection (via modal)
repeated string selected_team_doc_ids = 15;
repeated string selected_global_doc_ids = 16;
int64 estimated_team_tokens = 17;
int64 estimated_global_tokens = 18;
```

### 1.2 Frontend: State Machine Updates ✅

**File:** `frontend/src/machines/courseWizardMachine.ts`

5-step wizard:
1. `courseName` - Enter course name + select knowledge via modal + generate outcomes
2. `titleDescription` - Review AI-generated title/description
3. `smeSelection` - Select SME personas
4. `audienceSelection` - Select audience personas
5. `toneSelection` - Select tone + additional context

Context fields:
- `availableTeamDocs`, `availableGlobalDocs`
- `selectedTeamDocIds`, `selectedGlobalDocIds`

Events (available from courseName state):
- `SET_AVAILABLE_KNOWLEDGE`, `TOGGLE_TEAM_DOC`, `TOGGLE_GLOBAL_DOC`
- `SELECT_ALL_TEAM_DOCS`, `DESELECT_ALL_TEAM_DOCS`
- `SELECT_ALL_GLOBAL_DOCS`, `DESELECT_ALL_GLOBAL_DOCS`

### 1.3 Frontend: Knowledge Sources Modal ✅

**File:** `frontend/src/components/wizard/modals/KnowledgeSourcesModal.tsx`

Rich modal with two tabs:
1. **Existing Sources** - Select from team/global knowledge
   - Search/filter functionality
   - Checkbox multi-select with "Select All" / "Deselect All"
   - Token count display
   - Source summaries
2. **Upload Files** - Upload new documents
   - Drag & drop file upload
   - Processing status indicators
   - Indexed file list

### 1.4 CourseWizard.tsx Updates ✅

- Loads global knowledge sources on mount (tenant-level)
- Fetches all teams user is member/lead of via `useListTeams`
- Fetches team-specific knowledge for each team (supports up to 3 teams)
- Deduplicates and combines team knowledge sources
- Opens KnowledgeSourcesModal when "Add Knowledge" clicked
- Passes selected knowledge IDs through generateOutlineActor to wizardData

### 1.5 WizardProgress Updates ✅

- 5 steps displayed (removed knowledgeSelection icon)

### 1.6 Verification ✅

- [x] Wizard shows 5 steps
- [x] "Add Knowledge" button opens rich modal
- [x] Can select/deselect team and global documents
- [x] Team knowledge shows sources from all teams user belongs to
- [x] Global knowledge shows tenant-level sources from settings
- [x] Can upload new files from modal
- [x] Token counts update dynamically
- [x] Selection persists in wizardData
- [x] `npm run build` passes

---

## Session 2: Provenance Infrastructure (NOT STARTED)

**Goal:** Track retrieval metadata embedded in S3CourseContent (following existing MinIO-first pattern).

### 2.1 Extend S3 Content Types

**File:** `backend/internal/application/service/course_service.go`

Add provenance structs:
- `ProvenanceChunk` - Individual chunk with sourceId, excerpt, similarity score, scope
- `ComponentProvenance` - Source chunks, queries, token counts by scope
- `LessonProvenance` - Aggregate grounding score, token breakdown

### 2.2 Add Scope to RAG Chunks

**File:** `backend/internal/domain/service/interfaces.go`

Extend `RAGChunkInput` with `Scope` field ("course", "team", "global")

### 2.3 Track Scope During Retrieval

Tag chunks with correct scope in `ai_generation_service.go`

### 2.4 Deduplicate with Scope Priority

New helper function to dedupe chunks prioritizing course > team > global

### 2.5 Calculate and Store Provenance

Build provenance after generation completes, store in S3 JSON

---

## Session 3: RAG Config + Grounding Visualization (NOT STARTED)

**Goal:** Configurable Top-K per stage + visual grounding indicator.

### 3.1 RAG Stage Configuration

**File:** `backend/internal/config/rag_config.yaml`

Per-stage Top-K and min similarity settings

### 3.2 Grounding Score Calculation

**File:** `backend/internal/application/service/grounding_service.go`

### 3.3 Frontend: Grounding Indicator Component

**File:** `frontend/src/components/ui/GroundingIndicator.tsx`

Compact and detailed variants with donut chart

### 3.4 Outcomes Step Integration

Display grounding indicator next to each outcome

---

## Session 4: Outline Enhancements (NOT STARTED)

**Goal:** Rich metadata per section for curriculum planning.

### 4.1 Proto: Section Metadata

Add outcome mappings, level, intent, emphasis to OutlineSection

### 4.2 Generate Section Metadata

Extend outline generation prompt

### 4.3 Frontend: Enhanced Outline Review

Per section cards with outcome chips, level/intent badges, grounding indicator

### 4.4 Structured Feedback Controls

Multi-select outcomes, level dropdown, intent toggle, emphasis slider

### 4.5 Regeneration with Diff

Store previous version, show diff view

---

## Session 5: Curriculum Map & Approval Gate (NOT STARTED)

**Goal:** Validate coverage and sequencing with approval workflow.

### 5.1 Proto: Curriculum Map

New proto file with CurriculumMap, CoverageRow, CoverageCell, validation issues

### 5.2 Curriculum Service

Generate, validate, approve curriculum map

### 5.3 Staleness Detection

Hash outline to detect changes requiring re-approval

### 5.4 Frontend: Curriculum Map Page

Matrix grid with rows=sections, columns=outcomes

### 5.5 Approval Gate

Block lesson generation until curriculum map approved

---

## Session 6: Lesson Provenance + Admin Controls (NOT STARTED)

**Goal:** Complete the system with lesson-level provenance display and admin settings.

### 6.1 Precondition Enforcement

Validate knowledge locked, outline approved, curriculum map approved

### 6.2 Per-Lesson Grounding Display

Grounding indicator badge on lesson cards

### 6.3 Admin Settings Proto

KnowledgeSettings in tenant_settings.proto

### 6.4 Admin Settings UI

Settings page for knowledge configuration

### 6.5 Audit Trail

course_audit_log table for tracking approvals

---

## Files Modified (Session 1)

| File | Action |
|------|--------|
| `proto/mirai/v1/course_wizard.proto` | Added selected doc IDs to WizardStepData |
| `frontend/src/machines/courseWizardMachine.ts` | 5-step wizard with knowledge selection events in courseName state |
| `frontend/src/components/wizard/CourseWizard.tsx` | Load team + global knowledge, open modal, pass IDs to outline generation |
| `frontend/src/components/wizard/modals/KnowledgeSourcesModal.tsx` | Created - Rich modal with Existing Sources + Upload tabs |
| `frontend/src/components/wizard/modals/index.ts` | Export KnowledgeSourcesModal |
| `frontend/src/components/wizard/WizardProgress.tsx` | 5 steps displayed |

---

## Next Steps

**Ready for Session 2: Provenance Infrastructure**
- Extend S3 content types with provenance structs
- Add scope to RAG chunks (course/team/global)
- Track scope during retrieval
- Deduplicate with scope priority
- Calculate and store provenance in S3 JSON
