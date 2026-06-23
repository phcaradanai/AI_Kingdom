# Work In Progress — Team Coordination

> Living "who is doing what, on which branch" board so the two builders (Claude = core/backend, Codex = UX/UI) do not collide.
> Update your own row when you start, change scope, or finish. Keep it short — detailed history lives in `PROJECT_STATUS.md`.

Division of labor: **Codex owns UX/UI**, **Claude owns the core system** (`claude/main`). Integrate via `main`.

---

## Active now

### Claude — `claude/main`
- **Next (proposed, awaiting King):** Council parallelization — run the specialist wave concurrently (Grand Vizier still synthesizes last). Carries a deliberation-model decision (today agents see each other's answers via `previousCouncilContext`; parallel = independent opinions), so it ships behind a setting **defaulting to current sequential behavior** + an A/B before any default flip. Backend/core lane (`grandVizierOrchestrator.ts`) — no overlap with Codex's External Agents UX.
- **M24 Phase B — Supervised auto-retry** (✅ **merged to `main` `dfa9201`** 2026-06-23)
  - Closed the last leg of the M24 "Competent Manager" arc (A→C→B). The reviewer emitted a verdict but `WorkOrder.autoRetryCount` / `maxAutoRetries` were recorded and **never acted on** — nothing re-dispatched a failed job. Now wired.
  - New `apps/api/src/services/supervisedRetryService.ts` (`dispatchRetry` + `maybeAutoRetry`). King-triggered route `POST /api/automation-jobs/:id/retry` + a Retry button on `AutomationJobsPage` (shown only on a `NEEDS_REVIEW` job whose review verdict is `PATCH_FAILED`/`VALIDATION_FAILED`). Auto path fires from `submitReport`, behind setting `SUPERVISED_AUTO_RETRY_ENABLED` (**default OFF**).
  - The retry threads the reviewer's specific feedback (`whatFailed` / `failedCommands` / revision prompt) into the prompt via `buildExternalAgentPrompt` (new "Prior Attempt — Fix These" section when `autoRetryCount > 0`) — so retries aren't blind. Superseded job → `CANCELLED` (not `FAILED`, which the Living Loop observes). Conservative: mechanical failures only, LOW priority (auto), capped, online-runner required (auto), result always `NEEDS_REVIEW`, never push/PR/merge/deploy. Exhausted → King notified.
  - No Prisma migration (fields already existed). Touched: `supervisedRetryService.ts` (new), `automationJobService.ts`, `externalAgentWorkOrderService.ts`, `settingsService.ts`, `routes/automationJobs.ts`, web `AutomationJobsPage.tsx` + `lib/api.ts` + `i18nMessages.ts`.
  - Validation: root typecheck green; new + affected service tests green (supervisedRetry 8, externalAgentWorkOrder 21, runnerResultReview); AutomationJobsPage web tests 21 green.

### Codex — (UX branch)
- **Premium UX Wave 4B — External Agents Registry** (`/external-agents`), per `NEXT_TASK.md`. Last commit on this line: `18c493b "Record active external agents UX work"`.

---

## Collision watch
- Phase B (Claude) and Wave 4B (Codex) touch **different pages/services** — Automation Jobs / review-core vs. External Agents page. Low risk.
- Shared touch point to watch: `apps/web/src/types/api.ts` ↔ `apps/api/src/types/api.ts` (DTOs are duplicated by design). If Phase B adds a retry DTO and Wave 4B edits external-agent DTOs, merge the two type files carefully.

_Last updated: 2026-06-23 by Claude._
