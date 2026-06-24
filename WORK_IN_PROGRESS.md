# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- **Premium UX Wave 4E: Living Agent Evidence Profile** - IN PROGRESS from synchronized base `712b4bb`.
- Scope: split `/living-agents/:agentId` from an 876-line, 12-tab page into five source-owned evidence sections with responsive English/Thai navigation and focused loading/error/empty states.
- Preserve Living Agent profile/timeline/relations APIs, lazy loading, canonical Agent/Activity/Trace/Project/Council/Report/Memory/Knowledge/Provider/Audit ownership, and all RBAC/safety boundaries.
- Expected web-only edit surface: `LivingAgentProfilePage.tsx`, focused modules under `pages/living-agent-profile/`, tests, scoped messages, and completion documentation.

### Claude - `claude/main`

- **Curated knowledge in council** (✅ merged to `main`) — `AGENT_KNOWLEDGE_IN_CONTEXT`: each agent's APPROVED M16 knowledge injected into its council prompt + the synthesis (`grandVizierOrchestrator` via `buildAgentKnowledgeContext`). Closes the loop where approved knowledge was created but never used. Follow-up: planner-side knowledge injection.
- **Cross-task learning** (✅ merged to `main`) — `crossTaskLearningService.ts`. Relevance-ranked, outcome-gated lessons (what worked / what to avoid) from past review outcomes, injected into both the **planner** (`PLANNER_CROSS_TASK_LEARNING`) and the **council** (`COUNCIL_CROSS_TASK_LEARNING`). Deterministic, no extra AI call. Backend-only.
- **Council parallelization** (✅ merged to `main`) — `grandVizierOrchestrator.ts`, setting `COUNCIL_PARALLEL_SPECIALISTS`. Live A/B ~356s → ~173s. Details in `PROJECT_STATUS.md`.
- M24 Phase B supervised auto-retry merged to `main`; details in `PROJECT_STATUS.md`.
- **Settings posture:** all intelligence levers ON in dev (`npm run intelligence:enable`). Autonomy mostly ON; King kept `COUNCIL_AUTO_EXECUTE_LOW_RISK` OFF (decree→execute stays manual), enabled `LIVING_LOOP_AUTO_CONTEXT_REPAIR`.
- **Next:** awaiting King — test the enabled intelligence in action, or pick the next slice (consume M16 curated knowledge in planner/council / Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4E should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Wave 4E should use a scoped message module and keep central registration minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with Wave 4E's profile surface.

Last updated: 2026-06-24 by Codex at Wave 4E start after latest council intelligence integration.
