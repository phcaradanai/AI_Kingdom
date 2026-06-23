# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- No active implementation reserved.
- **Premium UX Wave 4D: Living Agents Roster** - COMPLETE; merging to `main` with this status update.
- `/living-agents` now uses a compact roster and focused evidence pane, optional RBAC-safe Kingdom Presence enrichment, real state/role filters, canonical source links, and semantic English/Thai chrome.
- Next candidate: Premium UX Wave 4E `/living-agents/:agentId`; not reserved until work starts from a freshly synchronized `main`.

### Claude - `claude/main`

- **Council parallelization** (complete, merged into `main`) — `grandVizierOrchestrator.ts`. Specialists can run concurrently behind setting `COUNCIL_PARALLEL_SPECIALISTS` (**default OFF** = current sequential round-table); Grand Vizier still runs last + synthesizes. Returned/displayed responses are re-sorted by canonical council order (deterministic under concurrency). Live A/B: ~356s → ~173s (~51% faster), same role order + summary. Backend-only — no overlap with Wave 4C. King decision pending: whether to flip the default to parallel.
- M24 Phase B supervised auto-retry is merged into `main`; details + validation in `PROJECT_STATUS.md`.
- **Next:** awaiting King's pick (cross-task learning / flip parallel default / Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4E should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Wave 4E should use a scoped message module and keep central registration minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with Wave 4E's profile surface.

Last updated: 2026-06-23 by Codex after completing Wave 4D validation.
