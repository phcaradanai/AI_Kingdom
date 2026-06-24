# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- **Premium UX Wave 4F: Providers Registry** - IN PROGRESS from synchronized base `bbfe585`.
- Scope: replace the repeated provider-card grid with a compact registry and focused provider evidence/configuration workspace, semantic English/Thai chrome, 44px controls, and explicit Routing/Treasury source links.
- Preserve Provider registry/config ownership, model validation, health/account/model telemetry, secret-reference safety, KING RBAC, routing, cost, and audit contracts. No API, DTO, Prisma, or secret-handling changes are planned.
- Expected web-only edit surface: `ProvidersPage.tsx`, focused modules under `pages/providers/`, focused tests, scoped messages, minimal central i18n registration, and completion documentation.

### Claude - `claude/main`

- **Curated knowledge in council** (✅ merged to `main`) — `AGENT_KNOWLEDGE_IN_CONTEXT`: each agent's APPROVED M16 knowledge injected into its council prompt + the synthesis (`grandVizierOrchestrator` via `buildAgentKnowledgeContext`). Closes the loop where approved knowledge was created but never used. Follow-up: planner-side knowledge injection.
- **Cross-task learning** (✅ merged to `main`) — `crossTaskLearningService.ts`. Relevance-ranked, outcome-gated lessons (what worked / what to avoid) from past review outcomes, injected into both the **planner** (`PLANNER_CROSS_TASK_LEARNING`) and the **council** (`COUNCIL_CROSS_TASK_LEARNING`). Deterministic, no extra AI call. Backend-only.
- **Council parallelization** (✅ merged to `main`) — `grandVizierOrchestrator.ts`, setting `COUNCIL_PARALLEL_SPECIALISTS`. Live A/B ~356s → ~173s. Details in `PROJECT_STATUS.md`.
- M24 Phase B supervised auto-retry merged to `main`; details in `PROJECT_STATUS.md`.
- **Settings posture:** all intelligence levers ON in dev (`npm run intelligence:enable`). Autonomy mostly ON; King kept `COUNCIL_AUTO_EXECUTE_LOW_RISK` OFF (decree→execute stays manual), enabled `LIVING_LOOP_AUTO_CONTEXT_REPAIR`.
- **Next:** awaiting King — test the enabled intelligence in action, or pick the next slice (consume M16 curated knowledge in planner/council / Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4F should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Future waves should use scoped message modules and keep central registration minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with the planned Wave 4F provider surface.

Last updated: 2026-06-24 by Codex at Wave 4F start from synchronized base `bbfe585`.
