# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- No active implementation reserved.
- **Premium UX Wave 4C: Agent Chat Workspace** - COMPLETE; merging to `main` with this status update.
- `/agent-chat` now uses a focused agent/session browser, conversation pane, and context/source pane on desktop, with one pane at a time below `xl`.
- Direct-agent APIs, project binding, save modes, provider routing, Artifact/Knowledge Candidate ownership, RBAC, secrets, and advisory-only boundaries remain unchanged.
- Next candidate: Premium UX Wave 4D `/living-agents`; not reserved until work starts from a freshly synchronized `main`.

### Claude - `claude/main`

- **Cross-task learning** (✅ merged to `main`) — `crossTaskLearningService.ts` + planner. Relevance-ranked, outcome-gated lessons from past review outcomes (what worked / what to avoid) injected into the planner's context, behind setting `PLANNER_CROSS_TASK_LEARNING` (**default OFF**). Deterministic, no extra AI call, reuses `AgentReviewSummary`. Backend-only.
- **Council parallelization** (✅ merged to `main`) — `grandVizierOrchestrator.ts`, setting `COUNCIL_PARALLEL_SPECIALISTS` (**default OFF**). Live A/B ~356s → ~173s. Details in `PROJECT_STATUS.md`.
- M24 Phase B supervised auto-retry merged to `main`; details in `PROJECT_STATUS.md`.
- **Next:** awaiting King — flip any of the new default-OFF intelligence settings on, or pick the next slice (cross-task lessons into the council too / Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4C should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Wave 4C should add a scoped message module and keep the central edit minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with Wave 4C's web surface.

Last updated: 2026-06-23 by Claude (cross-task learning) — Codex completed Wave 4C.
