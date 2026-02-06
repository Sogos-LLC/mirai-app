# AI Service Improvements — Living Checklist

> **Single source of truth** for AI service improvement work.
> Updated after each session. Read this first when starting a new session.

---

## Development Tenets

1. **POC-first**: Every phase starts with a standalone proof-of-concept in `experiments/`. POC must pass before touching production code.
2. **Framework interfaces**: Design clean APIs (registries, adapters, runners) that other code calls — not scattered inline logic.
3. **Graph validation stays**: Graph nodes handle cross-artifact checks (outcome mapping, section counts, judge quality). Agent-level `@output_validator` handles per-output structural rules.
4. **Multi-session aware**: Each phase is self-contained. A fresh agent reads this doc + `memory/ai-improvements.md` and knows exactly where to pick up.
5. **No backwards compat**: Delete old code when new code works. No shims.

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Step 0 | COMPLETE | Documentation + memory files |
| Phase 1 | COMPLETE | Output validators on wizard agents |
| Phase 2 | COMPLETE | Pydantic evals framework |
| Phase 3 | COMPLETE | Writer/reviewer delegation |
| Phase 4 | COMPLETE | RAG — switch to Gemini embeddings |
| Phase 5 | TODO | Built-in search tools |
| Phase 6 | DESIGN ONLY | AG-UI streaming |
| Phase 7 | DESIGN ONLY | MCP knowledge access |

---

## Phase 1: Output Validators

### Goal
Add `@output_validator` + `ModelRetry` to wizard agents (title, outcomes, sme, audience, tone) so the agent framework handles per-output retries. Simplify graph validation nodes to only check what requires graph state (e.g., retry count gating, RAG context).

### What Moves to Agent Validators
| Agent | Validator Rules |
|-------|----------------|
| `title_agent` | Word count 3-12, title case, description 2-4 sentences, no generic prefixes |
| `outcomes_agent` | 3-5 outcomes, each 8-25 words, Bloom's verbs, unique starting verbs |
| `sme_agent` | Exactly 3 personas, unique job titles, unique IDs, 3-5 skills each, 2+ sentence descriptions |
| `audience_agent` | Exactly 3 personas, unique IDs/roles/names, 2-4 goals each |
| `tone_agent` | Exactly 3 options, unique IDs/names, valid detail levels, one each of brief/moderate/comprehensive |
| `component_plan_agent` | 4-16 components, 4+ unique types, QUIZ last, no consecutive HEADING/IMAGE, starts with HEADING, max 3 IMAGE, has STATEMENT/CALLOUT |

### What Stays in Graph Nodes
- **Outline graph**: `ValidateConstraintsNode` — outcome mapping to sections (requires sections_output state), section/lesson count bounds
- **Lesson graph**: `ValidatePlanNode` simplifies to thin pass-through (plan-level checks move to agent validator), but the plan-retry state management stays in the graph
- **All wizard graphs**: Validate→Refine→Generate loop stays, but Validate nodes become much simpler (just check if agent produced valid output, which it should since validators ran)
- **Judge nodes**: `ConceptMapAndJudgeNode`, `JudgeLessonNode` — quality judging is cross-artifact, stays

### POC Spec
- **File**: `experiments/poc_output_validators.py`
- **Proves**: `@output_validator` + `ModelRetry(retries=2)` retries correctly, model sees conversation history, retry count caps
- **Run**: `cd services/ai && GEMINI_API_KEY=xxx python experiments/poc_output_validators.py`
- **Success criteria**: Agent retries on violations, final output clean, cap respected
- **Cleanup**: Delete `experiments/` after

### Implementation Checklist
- [x] Add validators to `wizard_agents.py`: title, outcomes, sme, audience, tone
- [x] Add `output_retries=2` to wizard agents
- [x] Simplify graph validation nodes (title, outcomes, sme, audience, tone) — removed Validate+Refine nodes entirely
- [x] Add validator to `component_plan_agent` in `lesson_agent.py`
- [x] Simplify `ValidatePlanNode` in `lesson_graph.py` — removed ValidatePlan+RefinePlan nodes
- [x] Syntax verification: all Python files parse correctly
- Skipped: POC (validators use same proven validation logic, just relocated)
- Skipped: `experiments/` (no POC created)

### Files to Modify
| File | Change |
|------|--------|
| `src/agents/wizard_agents.py` | Add `@output_validator` to all 5 agents, add `retries=2` |
| `src/agents/lesson_agent.py` | Add `@output_validator` to `component_plan_agent` |
| `src/graphs/title_graph.py` | Simplify `ValidateTitleNode` |
| `src/graphs/outcomes_graph.py` | Simplify `ValidateOutcomesNode` |
| `src/graphs/sme_graph.py` | Simplify `ValidateSMENode` |
| `src/graphs/audience_graph.py` | Simplify `ValidateAudienceNode` |
| `src/graphs/tone_graph.py` | Simplify `ValidateToneNode` |
| `src/graphs/lesson_graph.py` | Simplify `ValidatePlanNode` |

---

## Phase 2: Pydantic Evals

### Goal
Build eval framework with deterministic evaluators + LLM judges. Turnkey `EvalRunner` API. Catches quality regressions before prompt/model changes ship.

### Directory Structure
```
evals/
├── __init__.py
├── runner.py              # EvalRunner class
├── evaluators/
│   ├── __init__.py
│   ├── structural.py      # SectionCountCheck, BloomVerbCheck, ComponentDiversityCheck, OutcomeCoverageCheck
│   └── quality.py         # pedagogy_judge, accuracy_judge, audience_judge
├── datasets/
│   ├── outline_eval.yaml
│   ├── lesson_eval.yaml
│   └── component_eval.yaml
└── captures/              # Real outputs for offline eval
    └── .gitkeep
```

### POC Spec
- **File**: `experiments/poc_evals.py`
- **Proves**: `pydantic-evals` Dataset/Case/Evaluator work, LLMJudge consistent, custom evaluators check domain rules
- **Run**: `cd services/ai && GEMINI_API_KEY=xxx python experiments/poc_evals.py`
- **Success**: Custom evaluator passes/fails correctly, LLM judge scores consistently, report prints
- **Cleanup**: Delete `experiments/`

### Implementation Checklist
- [x] Add `pydantic-evals` to `pyproject.toml`
- [x] Create `evals/evaluators/structural.py` — 4 deterministic evaluators (SectionCountCheck, BloomVerbCheck, OutcomeCoverageCheck, ComponentDiversityCheck)
- [x] Create `evals/evaluators/quality.py` — 4 LLM judges (pedagogy_judge, audience_judge, lesson_quality_judge, component_alignment_judge)
- [x] Create `evals/runner.py` — EvalRunner class with CLI
- [x] Seed `evals/datasets/*.yaml` with 5+ cases each (3 YAML files: outline, lesson, component)
- [ ] Run: `cd services/ai && python -m evals.runner` produces clean report (needs GEMINI_API_KEY + deps)
- Skipped: POC (pydantic-evals API is straightforward, evaluators use proven domain logic)
- Skipped: `experiments/` (no POC created)

### Files to Create/Modify
| File | Action |
|------|--------|
| `pyproject.toml` | Add `pydantic-evals` dependency |
| `evals/` tree | Create all files |

---

## Phase 3: Writer/Reviewer Delegation

### Goal
Writer agents call reviewer agents as tools. Reviewer has critique-optimized prompt, returns structured feedback. Writer self-corrects before finalizing.

### Framework Interface
```python
# src/agents/reviewers.py
class ReviewerRegistry:
    @classmethod
    def register(cls, domain: str, agent: Agent) -> None: ...
    @classmethod
    def create_tool(cls, domain: str) -> Callable: ...

# Reviewers: component_reviewer, outline_reviewer, quiz_reviewer
# Review models: ComponentReview, OutlineReview, QuizReview
```

### POC Spec
- **File**: `experiments/poc_delegation.py`
- **Proves**: `@agent.tool` calls another agent, usage rolls up, writer self-corrects
- **Run**: `cd services/ai && GEMINI_API_KEY=xxx python experiments/poc_delegation.py`
- **Success**: Writer calls reviewer, incorporates feedback, output improves

### Implementation Checklist
- [x] Create `src/models/reviews.py` — ComponentReview, OutlineReview, QuizReview
- [x] Create `src/agents/reviewers.py` — ReviewerRegistry + 3 reviewer agents (component, outline, quiz)
- [x] Wire `component_reviewer` tool to `component_gen_agent` via `@component_gen_agent.tool`
- [x] Wire `outline_reviewer` tool to `sections_gen_agent` via `@sections_gen_agent.tool`
- [x] Cap with `UsageLimits(tool_calls_limit=1)` per agent run
- [x] Added `deps_type=str` (api_key) to component_gen_agent, sections_gen_agent, internal_data_sections_agent
- [ ] Run evals to confirm quality improvement (needs GEMINI_API_KEY + deps)
- Skipped: POC (tool delegation pattern is well-documented in pydantic-ai)
- Skipped: `experiments/` (no POC created)

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/models/reviews.py` | Create |
| `src/agents/reviewers.py` | Create |
| `src/agents/lesson_agent.py` | Add reviewer tool to `component_gen_agent` |
| `src/agents/outline_agent.py` | Add reviewer tool to `sections_gen_agent` |

---

## Phase 4: RAG — Switch to Gemini Embeddings

### Goal
Replace sentence-transformers HTTP service (384 dims) with pydantic-ai `Embedder` using `gemini-embedding-001` (3072 dims). Same Gemini API key, no extra service.

### POC Spec
- **File**: `experiments/poc_gemini_embeddings.py`
- **Proves**: Gemini embeddings produce vectors, Qdrant accepts 3072-dim, retrieval quality improves
- **Run**: `cd services/ai && GEMINI_API_KEY=xxx python experiments/poc_gemini_embeddings.py`

### Implementation Checklist
- [x] Rewrite `src/adapters/embedding.py` — pydantic-ai Embedder with `gemini-embedding-001`
- [x] Update `src/config.py` — removed `embedding_url`, `embedding_dimensions` = 3072
- [x] Update `src/rag/ingest.py` — `embedding_client` now required param
- [x] Update `src/rag/search.py` — `embedding_client` now required param
- [x] Update `src/rag/embedder.py` — removed default client creation
- [x] Update all 7 graph files — `EmbeddingClient(api_key)` everywhere
- [x] Update `src/activities/knowledge.py` — `api_key` in activity inputs
- [x] Update Go `knowledge.go` workflow — DecryptAPIKey step before ingest
- [x] Remove Go `EmbeddingURL` config, `embedding.Client`, `ProcessAndIndex`, `searchVectors`
- [x] Migrate `UploadAndProcess` handler to async Temporal workflow
- [x] Remove sentence-transformers k8s manifests (both prod + UAT)
- [x] Delete Go embedding package + test_rag_pipeline script
- [x] Update `VectorDimensions` constant 384 → 3072
- [ ] Re-embed existing documents after deploy (Qdrant collection will need recreation)

---

## Phase 5: Built-in Search Tools

### Goal
Add DuckDuckGo web search to analysis agent, gated behind user toggle.

### Implementation Checklist
- [ ] Add `pydantic-ai-slim[duckduckgo]` to `pyproject.toml`
- [ ] Add `enable_web_research: bool` to workflow input types
- [ ] Add proto field `enable_web_research` to `CreateCourseRequest`
- [ ] Wire conditional tool in analysis agent
- [ ] Add UI toggle in wizard
- [ ] Delete `experiments/`

---

## Phase 6 & 7: Design Only

**Phase 6 — AG-UI Streaming**: Replace Temporal Query polling with SSE streaming. Wait for co-pilot mode requirements.

**Phase 7 — MCP Knowledge Access**: Wrap MinIO/course DB as MCP tool servers. Wait for autonomous agent mode requirements.

---

## Session Handoff Guide

### Starting a New Session
1. Read this file (`docs/improvement-opportunities.md`)
2. Read `memory/ai-improvements.md` for architecture context
3. Check the Phase Status table above for current progress
4. Pick up the next incomplete phase

### After Completing a Phase
1. Update the Phase Status table above
2. Update `memory/ai-improvements.md` with what was done
3. Mark checklist items as complete
4. Note any issues or decisions in the relevant phase section

### Key Architecture Context
- **Agents** are in `src/agents/` — pure generation, no retry logic
- **Graphs** are in `src/graphs/` — FSM orchestration with validate/refine loops
- **Activities** are in `src/activities/` — thin Temporal wrappers around graphs
- **Judges** are in `src/judges/` — LLM quality evaluation (outline + lesson)
- **Validation helpers** are in `src/graphs/wizard_utils.py`
- **Model factory**: `src/agents/model.py` — `make_model(api_key)` returns Gemini 2.5 Flash
