# Work In Progress - Team Coordination

This is the canonical board for who is working on what and on which branch. Update your own entry before implementation, when scope changes, and after the work is merged. Detailed Codex scope lives in `docs/ACTIVE_WORK.md`; completed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate through `main`.

## Active Now

### Codex - `codex/main`

- No active implementation after completing **Premium UX Wave 4E: Living Agent Evidence Profile**.
- Wave 4E split `/living-agents/:agentId` from an 876-line, 12-tab page into five source-owned evidence sections. Focused tests pass 8/8, the full web suite passes 219/219, and root typecheck/build pass.
- Next reserved candidate: **Premium UX Wave 4F: Providers Registry** on `/providers`; discovery and ownership audit have not started.

### Claude - `claude/main`

- **Self-sustaining learning loop** (✅ merged to `main`) — `CAPTURE_LESSONS_FROM_REVIEWS`: a diagnosed failed review (`createOrUpdateAgentReviewForJob`) auto-proposes a PENDING knowledge candidate (BUG_LEARNING) → King approves → feeds back into council + planner via `AGENT_KNOWLEDGE_IN_CONTEXT`. Full cycle: decree → execute → review → lesson → approve → smarter reasoning. King-gated, best-effort, value-gated.
- **Curated knowledge in council + planner** (✅ merged to `main`) — `AGENT_KNOWLEDGE_IN_CONTEXT`: each agent's APPROVED M16 knowledge injected into its council prompt + the synthesis (`grandVizierOrchestrator`), and the planner agent's into the planning context (`[APPROVED KNOWLEDGE]`), via `buildAgentKnowledgeContext`. Closes the loop where approved knowledge was created but never used.
- **Cross-task learning** (✅ merged to `main`) — `crossTaskLearningService.ts`. Relevance-ranked, outcome-gated lessons (what worked / what to avoid) from past review outcomes, injected into both the **planner** (`PLANNER_CROSS_TASK_LEARNING`) and the **council** (`COUNCIL_CROSS_TASK_LEARNING`). Deterministic, no extra AI call. Backend-only.
- **Council parallelization** (✅ merged to `main`) — `grandVizierOrchestrator.ts`, setting `COUNCIL_PARALLEL_SPECIALISTS`. Live A/B ~356s → ~173s. Details in `PROJECT_STATUS.md`.
- M24 Phase B supervised auto-retry merged to `main`; details in `PROJECT_STATUS.md`.
- **Settings posture:** all intelligence levers ON in dev (`npm run intelligence:enable`). Autonomy mostly ON; King kept `COUNCIL_AUTO_EXECUTE_LOW_RISK` OFF (decree→execute stays manual), enabled `LIVING_LOOP_AUTO_CONTEXT_REPAIR`.
- **Next:** awaiting King — end-to-end test the full learning loop on a real decree, or pick the next slice (Prisma 7.8.0 / other).

## Collision Watch

- M24 Phase B touched `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18nMessages.ts`, and `AutomationJobsPage.tsx`; Codex has merged those changes before Wave 4C planning.
- Wave 4F should avoid backend/API/type changes unless a verified contract gap blocks the UX. Any contract change must be coordinated before implementation.
- `apps/web/src/lib/i18nMessages.ts` remains a shared integration point. Future waves should use scoped message modules and keep central registration minimal.
- Council parallelization (Claude) is backend-only (`grandVizierOrchestrator.ts`) — no expected overlap with the planned Wave 4F provider surface.

Last updated: 2026-06-24 by Codex after Wave 4E completion; Wave 4F is reserved but not started.
