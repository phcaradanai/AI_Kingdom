# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run runner:bootstrap

# Development
npm run dev          # starts API (port 4000), Vite (port 5173), and runner — all three concurrently
npm run runner:bootstrap # create/update Local Runner from RUNNER_TOKEN
npm run typecheck    # TypeScript checks across all workspaces
npm run test         # full test suite: API + runner + web
npm run test:api     # API tests only (faster for backend-only changes)
npm run lint         # alias for typecheck in all workspaces

# Database
npm run db:migrate   # apply migrations + generate Prisma client (dev only)
npm run db:seed      # reset seeded King user, royal agents, providers, projects, settings
npm run runner:bootstrap # create/update local AgentRunner runtime data

# Autonomy (M19) — let the Kingdom act on its own after a decree
npm run autonomy:enable                      # LIVING_LOOP_ENABLED + auto-validation + COUNCIL_AUTO_WORK_ORDER_MODE=READY
npm run autonomy:enable -- --mode=DRAFT       # work orders land as drafts for King review instead
npm run autonomy:enable -- --with-sandbox-patch  # also auto-create LOW-risk sandbox patches (still NEEDS_REVIEW)
npm run autonomy:disable                     # turn all autonomy settings back off

# Single workspace targets
npm run dev --workspace @ai-kingdom/api
npm run test --workspace @ai-kingdom/api
npm run test --workspace @ai-kingdom/runner

# Run a single test file (from repo root)
node scripts/with-test-env.mjs node --import tsx --test apps/api/src/services/memoryService.test.ts

# Data quality scripts
npm run data:inspect-pollution          # inspect low-quality / polluted kingdom data
npm run data:cleanup-test-data          # remove test-generated noise records
npm run data:archive-low-value          # archive low-value memories/matters
npm run data:archive-low-value-work-orders  # archive low-value work orders
npm run data:inspect-low-value          # preview low-value records before archiving
```

Seeded login: `king@aikingdom.local` / `password123`

Local runner startup:

```bash
# root .env must contain RUNNER_TOKEN
npm run runner:bootstrap
npm run dev --workspace @ai-kingdom/api
npm run dev --workspace @ai-kingdom/runner
```

Use the same `RUNNER_TOKEN` for bootstrap and the runner process. The bootstrap stores only the sha256 token hash.

## Architecture

npm workspaces monorepo: `apps/api` (Express + Prisma), `apps/web` (React + Vite), and `apps/runner` (sandbox execution agent). No shared packages — types are duplicated between `apps/api/src/types/api.ts` and `apps/web/src/types/api.ts`.

### Backend (`apps/api`)

Entry: `src/server.ts` → `src/app.ts` (Express setup with cors, helmet, morgan, rate limiting, routes, error handler).

**Core flow — decree processing:**
1. `POST /api/tasks` creates a Task (status `PENDING`).
2. `POST /api/tasks/:id/process` triggers `grandVizierOrchestrator.ts`, which:
   - Loads Kingdom Charter + Vision context via `kingdomComplianceService.ts`.
   - Loads relevant Kingdom Memories via `memoryService.ts` (keyword/tag match, up to 5).
   - Injects compact project context when task has a `projectId` (via `projectContextService.ts`).
   - Selects agents by `AGENTS_BY_MODE` map (keyed on `TaskMode`: ASK/PLAN/RESEARCH/BUILD).
   - Calls each agent in order via `generateWithFallback.ts` — tries the resolved `AIProvider` chain, falls back to mock on failure/timeout.
   - Creates one `UsageRecord` per AI call (agents + Grand Vizier synthesis) with token counts and estimated USD cost from `src/pricing/providerPricing.ts`.
   - Creates a `CouncilSession` with agent responses.
   - Creates one `TreasuryLedger` COST entry for the session total.
   - Auto-saves 1–5 memory candidates from the summary via `memoryService.ts`.
   - Generates a `RoyalReport` via `reportService.ts`.

**AI provider abstraction** (`src/ai/`):
- `AIProvider` interface in `aiProvider.ts` — `generateAgentResponse` returns `AgentResponseResult` (response text + `TokenUsage`).
- `mockAIProvider.ts` — deterministic responses, tokens estimated from string length, cost = $0.
- `openAICompatibleProvider.ts` — reusable Chat Completions implementation for OpenAI, OpenRouter, DeepSeek, and any OpenAI-compatible API.
- `providerFactory.ts` / `aiProviderRegistry.ts` — env-first public registry, DB-backed provider overrides, capability/cost metadata. Credentials are referenced by env var name, never stored as literal secrets.
- `aiProviderRouter.ts` — resolves provider/model/fallback chain from agent override, task mode, `AI_COST_MODE` (low|balanced|quality), required capabilities. Default fallback chain: `deepseek → openrouter → openai → mock`.
- `generateWithFallback.ts` — wraps provider call with timeout + fallback; propagates usage from whichever provider ran. Fallback notices stored on `CouncilSession.fallbackNotice`.

**Cost calculation** (`src/pricing/providerPricing.ts`): static table keyed `"provider:model"`, USD per 1M tokens. Unknown models default to $0 + console.warn. `calculateCostUSD(provider, model, promptTokens, completionTokens)` is the main entry point.

**RBAC** (`src/middleware/rbac.ts`): roles `KING > CROWN_PRINCE > MINISTER > SCRIBE`. Route handlers call `requireRole(role)` or `methodPermission` middleware. The Grand Vizier agent cannot be deleted or deactivated via the API. `/api/agents`, `/api/settings`, `/api/providers`, `/api/users`, `/api/treasury`, and `/api/audit` require KING.

**Settings** (`src/services/settingsService.ts`): runtime settings stored in DB. Keys: `AI_PROVIDER`, `OPENAI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`, `AI_COST_MODE`, `DEFAULT_TASK_MODE`, `AUTO_PROCESS_TASKS`, `AUTO_SAVE_MEMORY`, `AUTO_GENERATE_REPORTS`, `DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`, `LIVING_LOOP_ENABLED`, `LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS`, `LIVING_LOOP_AUTO_SANDBOX_PATCH`. API keys are server-side only and never returned by the settings API.

**Auth**: bcrypt passwords, 15-minute JWT access tokens, server-stored refresh token sessions. `src/middleware/auth.ts` validates tokens; logout revokes the refresh session. Audit logs written for sensitive operations via `auditService.ts`.

**Royal Secretary** (`royalSecretaryService.ts`): manages `Notice` and `Matter` records, `inspectKingdomStatus`, and `generateDailyBrief` (status, urgent notices, open/awaiting-decision matters, `recommendedActions`, `contextHealthSummary`).

**Living Loop** (`livingLoopService.ts`): observe → propose → act automation cycle, gated by `LIVING_LOOP_ENABLED`. Observes work orders, failed automation jobs, stale runners, provider failures, project inbox items, and matters awaiting decision. Proposes `AutomationCandidate` rows (kinds: `VALIDATION_JOB`, `SANDBOX_PATCH`, `WORK_ORDER_REVIEW`, etc.), each filtered by `dataValueGate()`. Two opt-in auto-act stages:
- `autoCreateValidationJobs()` (`LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS`): creates `VALIDATION_ONLY` automation jobs — read-only, never patches.
- `autoCreateSandboxPatchJobs()` (`LIVING_LOOP_AUTO_SANDBOX_PATCH`): creates `SANDBOX_PATCH` jobs with `commandPolicy: "SANDBOX_PATCH_NO_PUSH"`. Eight-condition risk policy (`livingLoopRiskPolicyService.ts`) gates every auto-patch: confidence ≥85, riskLevel LOW, online runner present, project linked, no active job, cooldown not violated, no blocked-path file hints. Auto-created jobs end in `NEEDS_REVIEW` — no branch push, PR creation, merge, or deploy ever runs automatically.

**Autonomy Scheduler** (`kingdomSchedulerService.ts`, M19): the in-process background worker that makes the Living Loop run on its own — without it, the loop only fires on a manual `POST /api/living-loop/run`. `startKingdomScheduler()` is called from `server.ts` on listen (never from `app.ts`, so tests stay timer-free) and sets a `setInterval` (unref'd) at `LIVING_LOOP_INTERVAL_MS` (env, default 300000, floored at 15000). Each tick re-reads `LIVING_LOOP_ENABLED` from settings; only when enabled does it call `runLivingLoopOnce("SCHEDULED")`. A single in-process flag guards against overlapping ticks, and a tick never throws (errors are captured into status). The scheduler adds **no new capability** — every downstream gate is unchanged. Status via `getSchedulerStatus()` / `GET /api/living-loop/scheduler` (KING/CROWN_PRINCE). `server.ts` clears the timer on SIGTERM/SIGINT. Enable the full autonomous chain with `npm run autonomy:enable` (see Commands).

### Runner (`apps/runner`)

Standalone worker process that polls the API for queued `AutomationJob` rows and executes them in the local workspace. Entry: `src/index.ts` → `src/sandbox.ts`.

Key modules:
- `sandboxPatchPolicy.ts`: `evaluateBranchPushEligibility()` refuses push when `commandPolicy === "SANDBOX_PATCH_NO_PUSH"` regardless of server settings. `evaluateJobContextBinding()` refuses SANDBOX_PATCH execution when context is STALE/MISSING/PARTIAL.
- `patchGenerator.ts`: generates unified diff patch artifacts from workspace changes.
- `validationOnlyExecutor.ts`: runs allowlisted read/typecheck/test/build commands only — never edits files.
- `commandValidator.ts`: validates commands against the allowlist before execution.
- `workspacePreparation.ts`: prepares the workspace (git state, dependency install) before job execution.
- `preValidationRunner.ts`: pre-patch validation runs before applying any changes.
- `importedPatchStatus.ts`: tracks and reports imported patch application status.
- `secretRedactor.ts`: redacts secrets from runner output before sending to API.

The runner must be bootstrapped (`npm run runner:bootstrap`) and started with the same `RUNNER_TOKEN` as the API. Confirm `/automation-jobs` shows `Online Runners = 1` before manual SANDBOX_PATCH acceptance.

### Frontend (`apps/web`)

React Router v6 SPA. All API calls go through `src/lib/api.ts` (centralized fetch wrapper). Zustand stores: `authStore.ts` (JWT + user), `kingdomStore.ts` (tasks, agents, memories, reports, council sessions, providers, settings).

**Route → role access** enforced by `ProtectedRoute.tsx`:
- `/throne-room`, `/council`, `/reports`, `/memory` — all authenticated roles.
- `/agents`, `/settings`, `/users` — KING only.
- `/external-agents`, `/work-orders`, `/projects`, `/project-inbox`, `/artifacts`, `/living-loop` — KING/CROWN_PRINCE.

UI components under `src/components/ui/` are local shadcn-style primitives. Layout is in `src/components/layout/AppLayout.tsx`.

### Database

Prisma schema at `apps/api/prisma/schema.prisma`. `scripts/with-root-env.mjs` loads root `.env` so Prisma CLI picks up `DATABASE_URL`. Never run `prisma migrate dev` against staging — use `prisma migrate deploy`.

## Testing

Tests use Node's built-in test runner via `tsx`. Place test files next to the module as `*.test.ts`. Tests must not require a real OpenAI key — use `mockAIProvider` or stub providers. Run `npm run typecheck` and `npm run test` before shipping backend or contract changes.

**Test DB migrations:** the test suite runs against the `ai_kingdom_test` database. Every new Prisma migration must be deployed there before root tests pass: run `npm run test:db:prepare` (or `prisma migrate deploy` with the test `DATABASE_URL`) after creating a migration, then `npm run test`.

For auth/RBAC changes, cover login, denied access, and session invalidation. For route shape changes, update DTO types in both `apps/api/src/types/api.ts` and `apps/web/src/types/api.ts`.

## Coding Style

Keep route handlers thin — orchestration, memory, reports, settings, and audit logic belong in services. Frontend network calls stay in `apps/web/src/lib/api.ts`; shared state in Zustand stores. Use `PascalCase` for React components, `camelCase` for services/utilities. Generated data must pass a value/quality gate before becoming Kingdom state (`dataValueGateService.ts`). Low-confidence signals are preview-only or ephemeral — a smaller trusted Kingdom is better than a large polluted one.

## Agent Workflow (Claude/Codex-style agents)

Before doing project work in this repository or via Kingdom work orders:

1. Read `AGENTS.md` (mandatory rules, including context binding and local docs safety).
2. Confirm the project's local docs snapshot is READY and not stale (Project detail → Local Docs, or `GET /api/projects/:id/local-docs`).
3. Bind the WorkOrder context (`POST /api/work-orders/:id/bind-context`) so the work order carries the exact snapshot ids it plans against.
4. Run validation (VALIDATION_ONLY job or root `npm run test` / `typecheck` / `build`).
5. Patch only in sandbox — SANDBOX_PATCH jobs through the runner; never push, merge, or deploy automatically.
6. Report snapshot ids and provenance in the ImplementationReport (`contextUsed`, `localDocumentSnapshotId`, `repositorySnapshotId`).

**Do not proceed to SANDBOX_PATCH if context is stale or missing.** The API rejects job creation, the Living Loop skips auto-patch (`ContextBinding:*` skip reasons), and the runner refuses execution — do not work around these gates.

## AI Provider (local dev)

Default is `AI_PROVIDER=mock` — no API key required. To use OpenAI-compatible:

```env
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS=700
AI_COST_MODE=balanced   # low | balanced | quality
```

Other supported provider env keys (all server-side only, never returned via API): `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`. Custom providers reference their key by env var name — never store literal secrets in the DB.

The orchestrator always falls back to mock if the provider fails or times out.
