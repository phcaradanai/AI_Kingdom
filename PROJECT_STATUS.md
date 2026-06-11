# Project Status

## Current State

AI Kingdom Web MVP is implemented through M14. The app supports authenticated role-based access, task intake, Grand Vizier council processing, provider-agnostic AI routing with fallback, external agent work orders and handoffs, project-aware workspaces with Royal Secretary routing, persistent memory, generated reports, editable agents/settings/providers, staging-ready Docker deployment, Royal Treasury for cost tracking, Audit Log for operational oversight, and a Kingdom Charter + Vision constitutional layer that is injected into every council session.

Local source of truth is PostgreSQL through Prisma. The default seeded login is `king@aikingdom.local` / `password123`.

## Implemented Milestones

- M1: Initial React/Vite web foundation and Express/Prisma API foundation.
- M2: Throne Room task intake and task persistence.
- M3: Grand Vizier orchestrator with deterministic council sessions and agent responses.
- M4: AI provider abstraction with mock and OpenAI-compatible providers, fallback handling, model/token settings, and provider metadata.
- M5: Kingdom Memory v1 with CRUD, search, deterministic auto-extraction, duplicate checks, and memory context injection.
- M6: Royal Reports and Council Archive polish with generated reports, search/filtering, source links, and council detail views.
- M7: Agent configuration and system settings with editable prompts, skills, priority, active state, and orchestration settings.
- M8: Staging deployment preparation with `docker-compose.staging.yml`, Dockerfiles, safe Prisma deploy flow, health checks, and backup/restore scripts.
- M9: Auth hardening with bcrypt login, JWT access tokens, refresh token sessions, logout revocation, RBAC, King-only user management, profile/security pages, and audit logging.
- M10: Royal Treasury with per-call token usage tracking, configurable pricing table, cost aggregation by agent/provider/model, daily spend chart, budget limit settings with warning banner, and a `/treasury` dashboard page (KING-only).
- M11: Audit Log UI + Operational Oversight. Read API for `AuditLog` records with filters (action, resourceType, userId, date range), pagination, and full-text search. Sanitization layer scrubs sensitive metadata keys (password, token, apiKey, secret, credential) recursively before any response. `/audit` KING-only dashboard with search, filters, paginated table, and detail panel. `/security` page enhanced with Kingdom Operational Status (live API and DB health checks, token expiry display, session status).
- M11.5: Kingdom Charter Foundation. `KingdomCharter` + `KingdomVision` Prisma models + migration. Seed loads `docs/KINGDOM_CHARTER.md` and `docs/KINGDOM_VISION.md` idempotently. `charterService.ts` provides get/update/seed/format functions. `kingdomComplianceService.ts` loads kingdom context before every council session, auto-seeds from files if DB records are missing, and never throws. Context injected into every agent call (both specialist loop and Grand Vizier synthesis pass) via `GenerateAgentResponseInput.kingdomContext`. API: `GET /api/charter`, `GET /api/vision` (all authenticated); `PATCH /api/charter`, `PATCH /api/vision` (KING only). Frontend: `/charter` and `/vision` pages with section rendering and KING edit mode, visible to all authenticated roles.
- M12: Royal Secretary Core. `Notice` (INFO/WARNING/CRITICAL severity, UNREAD/READ/ARCHIVED status) and `Matter` (8-state status, 4-priority, 7-category) Prisma models + migration. `royalSecretaryService.ts` with `createNotice` (24h title+severity dedup), `createMatter` (sourceType+sourceId dedup in non-terminal states), `inspectKingdomStatus`, `generateDailyBrief`. `GET /api/secretary/brief` (all authenticated). Full CRUD for `/api/notices` and `/api/matters` (read: all roles; create/delete: KING; update: KING+CROWN_PRINCE). Dashboard updated with Kingdom Status pills, Recommended Actions list, Urgent Notices panel, Awaiting Decision panel, and Prime Directive reminder. `/notices` and `/matters` frontend pages with filters, pagination, inline mark-read/archive, create form (KING), and detail panel. `KingdomCharter` and `KingdomVision` Prisma models migrated. Seed service loads `docs/KINGDOM_CHARTER.md` and `docs/KINGDOM_VISION.md` idempotently (never overwrites existing records). `charterService.ts` provides get/update/seed/format functions. `kingdomComplianceService.ts` loads kingdom context before every council session, auto-seeds from files if DB records are missing, and never throws. Context injected into every agent call (both specialist loop and Grand Vizier synthesis pass) via `GenerateAgentResponseInput.kingdomContext`. API: `GET /api/charter`, `GET /api/vision` (all authenticated); `PATCH /api/charter`, `PATCH /api/vision` (KING only). Frontend: `/charter` and `/vision` pages with section rendering and KING edit mode, visible to all authenticated roles.
- M12.5: AI Provider Registry + Routing Policy. Added `AIProvider` and `AIProviderRoute` Prisma models, env-first provider registry, reusable OpenAI-compatible provider client, runtime support for mock/OpenAI/OpenRouter/DeepSeek/generic compatible providers, future metadata stubs for Anthropic/Gemini/local, agent-level provider/model/fallback/cost overrides, `AI_COST_MODE`, chained provider fallback, providerId usage tracking, `/api/providers` KING-only admin API, `/providers` admin page, and provider status in `/settings`. API keys remain server-only and are not returned by settings/providers APIs.
- A1: Provider Registry UI Polish + Add Provider Flow. Overhauled the `/providers` UI to feature labeled fields, dynamic readiness badges, inline edit mode, and an "Add Provider" modal. Extended the backend to support `POST` and `DELETE` on `/api/providers`. Protected custom providers by strictly requiring that their secret keys be referenced only via environment variable names (e.g. `CUSTOM_API_KEY`) to prevent literal secrets from being transmitted or displayed.
- M13: External Agent Work Order + Handoff System. Added `ExternalAgent`, `WorkOrder`, `WorkSession`, `ImplementationReport`, and `HandoffBrief` Prisma models with manual copy-paste execution mode. Seeded Claude Code, Codex, Cline, Kilo, Antigravity, and Hermes as external executor targets. Added `externalAgentWorkOrderService.ts` for task/matter work-order generation, context-drift-resistant prompts, implementation reports, handoff briefs, decision memory capture, and completion report summaries. API: `/api/external-agents`, `/api/work-orders`, `/api/work-sessions`, `/api/implementation-reports`, `/api/handoff-briefs`. Frontend: `/external-agents`, `/work-orders`, dashboard External Work summary. M13 does not call external agent APIs or execute shell commands from the backend.
- M14: Project Workspace + Royal Secretary Project Routing. Added `Project`, `ProjectRoutingCandidate`, `ProjectInboxItem`, and `Artifact` Prisma models plus optional `projectId` links on tasks, matters, notices, council sessions, reports, memories, work orders, implementation reports, and handoff briefs. Seeded AI Kingdom, Godot Tower Defense, Admin Dashboard Boilerplate, E-commerce Inventory Boilerplate, and Backend Go Services idempotently. Added `projectRoutingService.ts` for explainable keyword/alias/name/source-ancestry routing: confidence >=80 auto-assigns, 50-79 creates a suggested inbox item, and <50 creates a pending inbox item without assignment. Added compact project context injection for council processing and external-agent prompts. Added `/projects`, `/project-inbox`, and `/artifacts` pages plus Obsidian markdown export payloads.
- M17D: Living Loop Automated Kingdom Maintenance (M17D-1 through M17D-3, complete). `livingLoopService.ts` runs an observe -> propose -> act cycle (`runLivingLoopOnce`) gated by `LIVING_LOOP_ENABLED`, producing `AutomationCandidate` rows for work-order, validation, patch-review, memory, cleanup, provider, project, runner, and sandbox-patch observations, each passing `dataValueGate()` before persistence. `apps/runner` is a sandbox executor (`AgentRunner`/`AutomationJob`/`AutomationJobStep` models) that claims jobs over a token-authenticated API, runs allowlisted commands (`commandValidator.ts`), redacts secrets (`secretRedactor.ts`), and reports back via `ImplementationReport`. M17D-2 added opt-in `autoCreateValidationJobs()` (`LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS`) creating `VALIDATION_ONLY` jobs that only run read/typecheck/test/build commands — never edit files, never push. M17D-3 added `PatchArtifact` (risk-scored, blocked-path-checked, secret-redacted diffs with PENDING/APPROVED/REJECTED/REVISION_REQUESTED review states) and opt-in `autoCreateSandboxPatchJobs()` (`LIVING_LOOP_AUTO_SANDBOX_PATCH`), gated by `livingLoopRiskPolicyService.isAutoPatchEligible()` (daily limit, min confidence, riskLevel===LOW, online runner required, project-linked work order, no active/cooldown job, no blocked-path file hints). Auto-created sandbox patch jobs always carry `commandPolicy: "SANDBOX_PATCH_NO_PUSH"` and `provenance.source: "LIVING_LOOP_AUTO_SANDBOX_PATCH"` (with `loopRunId`/`candidateId`/`workOrderId`); the runner's `evaluateBranchPushEligibility()` blocks branch push for this policy regardless of `LIVING_LOOP_ALLOW_BRANCH_PUSH`, and `shouldPushWithoutApproval()` only allows unattended push for LOW-risk PENDING patches. No auto branch push, PR creation, merge, or deploy occurs — every auto sandbox patch lands as a `NEEDS_REVIEW` job with a pending `PatchArtifact` for King review. Dashboard and `/living-loop` page surface `autoValidation`/`autoSandboxPatch` status and `patchesPendingReview`; `/automation-jobs` tags auto-created jobs with provenance badges and a no-push notice; the Patch Review panel warns that auto-generated patches require King review.

## Current API Surface

- Public health: `GET /health`, `GET /health/db`.
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me`.
- Core resources: `/api/tasks`, `/api/council`, `/api/reports`, `/api/memory` (also aliased as `/api/memories`).
- Admin resources (KING only): `/api/agents`, `/api/settings`, `/api/providers`, `/api/users`; external agent create/update/delete is KING-only.
- External work resources: `/api/external-agents`, `/api/work-orders`, `/api/work-sessions`, `/api/implementation-reports`, `/api/handoff-briefs`. Reads are authenticated. Work-order create/update and handoff generation are KING/CROWN_PRINCE. Implementation reports can be submitted by KING/CROWN_PRINCE/MINISTER. SCRIBE is read-only.
- Project workspace resources: `/api/projects`, `/api/project-routing`, `/api/project-inbox`, `/api/artifacts`, and `/api/projects/:id/export/obsidian`. Project reads are authenticated; create/update is KING/CROWN_PRINCE; delete/archive is KING-only. Project Inbox assignment is KING/CROWN_PRINCE. Artifacts can be created by KING/CROWN_PRINCE/MINISTER; SCRIBE is read-only.
- Treasury resources (KING only): `/api/treasury/overview`, `/api/treasury/usage`, `/api/treasury/agents`, `/api/treasury/providers`, `/api/treasury/reports`.
- Audit resources (KING only): `GET /api/audit`, `GET /api/audit/:id`, `GET /api/audit/search?q=`. Filters: `action`, `resourceType`, `userId`, `startDate`, `endDate`. Pagination: `page`, `limit`.
- Kingdom Charter and Vision (all authenticated for reads, KING for writes): `GET /api/charter`, `PATCH /api/charter`, `GET /api/vision`, `PATCH /api/vision`.
- Royal Secretary: `GET /api/secretary/brief` (all authenticated).
- Notices (read: all; create/delete: KING; update: KING+CROWN_PRINCE): `GET /api/notices`, `GET /api/notices/:id`, `POST /api/notices`, `PATCH /api/notices/:id`, `DELETE /api/notices/:id`.
- Matters (same RBAC as notices): `GET /api/matters`, `GET /api/matters/:id`, `POST /api/matters`, `PATCH /api/matters/:id`, `DELETE /api/matters/:id`.
- Living Loop (KING/CROWN_PRINCE read, KING write): `GET /api/living-loop/status`, `GET /api/living-loop/runs`, `POST /api/living-loop/run`.
- Automation Candidates (KING/CROWN_PRINCE read, KING write): `GET /api/automation-candidates`, `POST /api/automation-candidates/:id/approve`, `/reject`, `/archive`, `/apply`.
- Automation Jobs (KING only): `GET /api/automation-jobs`, `GET /api/automation-jobs/:id`, `POST /api/automation-jobs`, `POST /api/automation-jobs/:id/approve`, `POST /api/automation-jobs/:id/cancel`.
- Patch Artifacts (read: authenticated; approve/reject/request-revision/create-pr: KING only): `GET /api/patch-artifacts`, `GET /api/patch-artifacts/:id`, `POST /api/patch-artifacts/:id/approve`, `/reject`, `/request-revision`, `/create-pr`.
- Runner: token-authenticated endpoints for heartbeat, job claim, step recording, status updates, patch artifact submission, and report submission (not part of the user-facing RBAC surface).

RBAC is enforced server-side. `KING` has full access; `CROWN_PRINCE` can use tasks, council, reports, and memory; `MINISTER` can use tasks and reports; `SCRIBE` has read-only access to tasks, council, reports, and memory.

## Current Web Routes

Implemented pages: `/login`, `/dashboard`, `/charter`, `/vision`, `/notices`, `/matters`, `/projects`, `/projects/:id`, `/project-inbox`, `/artifacts`, `/throne-room`, `/council`, `/agents`, `/external-agents`, `/work-orders`, `/providers`, `/reports`, `/memory`, `/settings`, `/treasury`, `/audit`, `/profile`, `/users`, `/security`, `/living-loop`, and `/automation-jobs`.

Navigation is role-aware. The frontend also handles access-token refresh and clears the session when refresh fails.

## Verification

Most recent verification completed successfully:

- `npm run typecheck` (api, runner, web workspaces)
- `npm run test --workspace @ai-kingdom/api` (518/518 passing)
- `npm run test --workspace @ai-kingdom/runner` (11/11 passing)
- `npm run test --workspace @ai-kingdom/web` (15/15 passing)
- `npm run build` (api, runner, web workspaces)

Local smoke checks confirmed King login, treasury page rendering with agent/provider/model breakdowns, UsageRecord creation on task processing, budget warning banner activation, and no console errors.

## Known Gaps

- Audit log search is full-text across `action`, `resourceType`, `resourceId`, and user email only; metadata content is not searched.
- Auth does not include SSO, OAuth, MFA, password reset, or email verification.
- AI orchestration does not include tool calling, web search, background workers, or autonomous agents.
- Anthropic, Gemini, and local/Ollama are registry stubs only; runtime clients are not implemented yet.
- Memory search is keyword/tag based; no vector database is implemented.
- Project routing is deterministic keyword/alias/name/source-ancestry matching only; no vector database or autonomous background router is implemented.
- Staging is configured but production deployment and production observability are not yet complete.
- `estimatedCostLocal` mirrors `estimatedCostUSD` (USD only; no FX conversion).
- The Grand Vizier appears twice per session in the UsageRecord table (once as a specialist agent call, once for the final synthesis pass), so per-agent call counts reflect actual AI invocations, not council participation.
- The `Budget` model is schema-only; budget limits are stored as `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`). No write API for `Budget` records exists yet.
- Usage records only cover sessions processed after M10 was deployed; historical sessions have no cost data.
- `LIVING_LOOP_AUTO_SANDBOX_PATCH` and `LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS` default to disabled; auto-created `SANDBOX_PATCH` jobs always require an online runner and a project-linked work order, and never push branches, open PRs, merge, or deploy — every patch lands `NEEDS_REVIEW` for King review.

## Known non-blocking:
- Vitest 4.x with Vite 5.x emits deprecation warnings. Tests pass; consider pinning Vitest to a Vite 5-compatible version or upgrading Vite later.
- One pre-existing backend test expects LivingLoopRun status COMPLETED; if shared test DB candidate counts hit daily cap, it may become SKIPPED. Consider isolating test data or resetting candidate counts in a follow-up.