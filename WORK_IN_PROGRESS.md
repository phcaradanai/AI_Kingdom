# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- **Premium UX Wave 4D: Living Agents Roster** - IN PROGRESS from synchronized base `5cb0cc5`.
- Scope: refine `/living-agents` into a compact operational roster with real-state and role filters, focused agent evidence, canonical profile/source links, responsive English/Thai chrome, and reduced-motion-safe feedback.
- Preserve `Agent`, `AgentActivity`, `WorkOrder`, usage/provider evidence, portrait ownership, RBAC, and all existing API contracts. Ambient presentation state must not be presented as real work.
- Expected web-only edit surface: `LivingAgentsPage.tsx`, focused modules under `pages/living-agents/`, tests, scoped messages, and completion documentation.

### Claude - `claude/main`

- **Council parallelization** (complete, merged into `main`) — `grandVizierOrchestrator.ts`. Specialists can run concurrently behind setting `COUNCIL_PARALLEL_SPECIALISTS` (**default OFF** = current sequential round-table); Grand Vizier still runs last + synthesizes. Returned/displayed responses are re-sorted by canonical council order (deterministic under concurrency). Live A/B: ~356s → ~173s (~51% faster), same role order + summary. Backend-only — no overlap with Wave 4C. King decision pending: whether to flip the default to parallel.
- M24 Phase B supervised auto-retry is merged into `main`; details + validation in `PROJECT_STATUS.md`.
- **Next:** awaiting King's pick (cross-task learning / flip parallel default / Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4D avoids backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Wave 4D will add a scoped message module and keep central registration minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with Wave 4D's web surface.

Last updated: 2026-06-23 by Codex at Wave 4D start.
