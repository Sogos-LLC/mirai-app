# Knowledge-Grounded Course Generation Implementation Plan

## Overview

Implement a knowledge-grounded course generation system with RAG orchestration, provenance tracking, and curriculum validation. The system ensures all generated content is traceable to source documents with clear grounding visualization.

**Key Architecture Decisions:**
1. **Provenance embedded in S3CourseContent** - NOT a separate database table (follows existing MinIO-first pattern)
2. **Knowledge selection as Step 1** - Before course name, auto-skips if no sources exist
3. **Curriculum map as separate artifact** - With staleness detection and whole-map approval
4. **RAG config via YAML** - With optional database overrides for A/B testing

---

## Session 1: Knowledge Selection Wizard Step ✅ COMPLETED

**Goal:** Add dedicated first wizard step for knowledge source selection with scope locking.

**Deliverables:**
- [x] New wizard step 1 for selecting team/global knowledge
- [x] Wizard becomes 6 steps total
- [x] Selected knowledge IDs persisted in WizardStepData
- [x] Backend filters RAG to only selected sources (stored in wizardData)

### 1.1 Proto Schema Updates ✅

**File:** `proto/mirai/v1/course_wizard.proto`

Added to `WizardStepData`:
```protobuf
// Knowledge selection (Step 1)
repeated string selected_team_doc_ids = 15;
repeated string selected_global_doc_ids = 16;
int64 estimated_team_tokens = 17;
int64 estimated_global_tokens = 18;
```

### 1.2 Frontend: State Machine Updates ✅

**File:** `frontend/src/machines/courseWizardMachine.ts`

New step order:
1. `knowledgeSelection` (NEW) - Select existing team/global knowledge
2. `courseName` - Enter course name + upload additional files + generate outcomes
3. `titleDescription` - Review AI-generated title/description
4. `smeSelection` - Select SME personas
5. `audienceSelection` - Select audience personas
6. `toneSelection` - Select tone + additional context

New context fields added:
- `availableTeamDocs`, `availableGlobalDocs`
- `selectedTeamDocIds`, `selectedGlobalDocIds`

New events added:
- `SET_AVAILABLE_KNOWLEDGE`, `TOGGLE_TEAM_DOC`, `TOGGLE_GLOBAL_DOC`
- `SELECT_ALL_TEAM_DOCS`, `DESELECT_ALL_TEAM_DOCS`
- `SELECT_ALL_GLOBAL_DOCS`, `DESELECT_ALL_GLOBAL_DOCS`
- `APPROVE_KNOWLEDGE_SELECTION`, `SKIP_KNOWLEDGE_SELECTION`

Auto-skip logic implemented: If no knowledge sources exist, wizard skips to step 2.

### 1.3 Frontend: Knowledge Selection Component ✅

**File:** `frontend/src/components/wizard/steps/KnowledgeSelectionStep.tsx`

UI Features:
- Two sections: "Team Knowledge" and "Global Knowledge"
- Each source shows: name, status badge, token count, summary preview
- Checkbox multi-select with "Select All" / "Deselect All"
- Total tokens selected indicator
- "Continue without knowledge" link for explicit skip
- Warning banner if sources exist but none selected

### 1.4 CourseWizard.tsx Updates ✅

- Loads global knowledge sources on mount
- Passes available sources to state machine
- Renders KnowledgeSelectionStep for new step
- Passes selected knowledge IDs through generateOutlineActor to wizardData

### 1.5 WizardProgress Updates ✅

- Added BookOpen icon for knowledgeSelection step
- Updated to show 6 steps

### 1.6 Verification ✅

- [x] Wizard shows 6 steps when team/global knowledge exists
- [x] Wizard auto-skips to step 2 when no knowledge exists
- [x] Can select/deselect team documents via checkboxes
- [x] Can toggle global knowledge sources
- [x] Token counts update dynamically
- [x] Selection persists in wizardData
- [x] Warning shown if sources exist but none selected
- [x] "Skip" link allows proceeding with no selection
- [x] `buf lint`, `buf generate`, `go build`, `npm run build` all pass

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
| `frontend/src/machines/courseWizardMachine.ts` | Added knowledgeSelection state, new context/events |
| `frontend/src/components/wizard/CourseWizard.tsx` | Render new step, load available sources |
| `frontend/src/components/wizard/steps/KnowledgeSelectionStep.tsx` | Created new component |
| `frontend/src/components/wizard/steps/CourseNameStep.tsx` | Added onBack prop |
| `frontend/src/components/wizard/WizardProgress.tsx` | Updated to 6 steps with BookOpen icon |
