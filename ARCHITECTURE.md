# Architecture

## Overview

AI Kingdom is a TypeScript npm workspaces monorepo with three applications:

- `apps/api`: Express API, Prisma ORM, PostgreSQL, JWT auth, AI orchestration services.
- `apps/web`: React/Vite dashboard, TailwindCSS styling, React Router pages, Zustand state.
- `apps/runner`: token-authenticated sandbox worker for validation, external-agent CLI execution, patch capture, and structured result reporting.

The API owns persistence, authentication, RBAC, orchestration, provider routing, audit records, scheduler state, and execution policy. The frontend is a role-aware client that calls REST endpoints through `apps/web/src/lib/api.ts`. The runner executes only claimed jobs inside prepared workspaces and reports redacted evidence back to the API; it is not a second source of truth.

## Backend Layout

Process entry is `apps/api/src/server.ts`; it calls `createApp()` from `src/app.ts`, which assembles the Express app with middleware and routes. Routes live in `src/routes`, middleware in `src/middleware`, domain logic in `src/services`, AI provider code in `src/ai`, and Prisma access in `src/db/prisma.ts`.

Primary services:

- `grandVizierOrchestrator.ts`: selects active agents by task mode, loads Kingdom Charter + Vision context via `kingdomComplianceService`, injects both kingdom context and memory context into every agent call, calls the AI provider once per selected agent plus the final Grand Vizier synthesis, saves council responses, creates one `UsageRecord` per AI call (including the synthesis pass), creates a `TreasuryLedger` COST entry per completed session, and triggers memory extraction and report generation.
- `memoryService.ts`: keyword/tag relevance, context formatting, deterministic extraction, duplicate and secret checks.
- `reportService.ts`: generated Royal Report creation and duplicate prevention.
- `settingsService.ts`: default settings and runtime setting lookup.
- `aiProviderRegistry.ts`: env-first public provider registry, provider capability/cost metadata, DB-backed provider overrides, and custom provider credential handling. Credentials are securely referenced by their environment variable names (e.g., `CUSTOM_API_KEY`) and never stored as literal secrets in the database or returned in API responses.
- `aiProviderRouter.ts`: selects provider/model/fallback chain from agent override, task mode, cost mode, required capabilities, and active provider metadata.
- `treasuryService.ts`: aggregates `UsageRecord` rows into overview, per-agent, per-provider/model, and daily-bucket breakdowns; reads budget limits from settings to produce warning flags.
- `charterService.ts`: reads/writes `KingdomCharter` and `KingdomVision` records; seeds from `docs/KINGDOM_CHARTER.md` and `docs/KINGDOM_VISION.md` if no DB records exist; `formatKingdomContext` produces the injection string.
- `royalSecretaryService.ts`: `Notice` and `Matter` CRUD with dedup logic; `inspectKingdomStatus` aggregates live kingdom health counts; `generateDailyBrief` returns status, urgent notices, open matters, awaiting-decision matters, `recommendedActions` list, and charter/vision context for the dashboard.
- `kingdomComplianceService.ts`: `getKingdomContext()` loads charter + vision, auto-seeds from files if missing, never throws; returns empty string on failure so the orchestrator always proceeds.
- `auditService.ts`: audit log writes for security-sensitive actions; read functions (`listAuditLogs`, `getAuditLogEntry`, `searchAuditLogs`) with filter/pagination support; `sanitizeMetadata` strips keys containing "password", "token", "apikey", "secret", "credential", "authorization", or "bearer" recursively before any response.
- `externalAgentWorkOrderService.ts`: external work package service. Seeds manual handoff targets, generates work orders from tasks/matters, builds copy-paste prompts with charter/vision/project context, records implementation reports, creates handoff briefs, captures decision memories, and creates completion report summaries.
- `externalAgentBridgeService.ts`: creates gated runner-backed external-agent jobs and records their lifecycle/outcome without calling proprietary agent APIs directly.
- `projectService.ts`: seeds default projects, returns project overview counts, creates secret-checked artifacts, and generates Obsidian-friendly markdown export payloads.
- `projectRoutingService.ts`: Royal Secretary project classifier. Uses deterministic keyword, alias, project name/codename, and source ancestry matching. Scores are explainable; confidence >=80 auto-assigns, 50-79 creates a suggested Project Inbox item, and <50 leaves the source unassigned for review.
- `projectContextService.ts`: builds compact project context for agents: project identity, goals, status, active milestone, recent decisions/reports, open matters, active work orders, linked memories, and artifacts. Output is capped to avoid prompt bloat.
- `livingLoopService.ts`: observes Kingdom state, proposes quality-gated candidates, and runs the three opt-in auto-act stages for context repair, validation jobs, and sandbox patch jobs.
- `kingdomSchedulerService.ts`: in-process, non-overlapping scheduler that checks `LIVING_LOOP_ENABLED` each tick and drives `runLivingLoopOnce("SCHEDULED")`.
- `missionControlService.ts` and `nextActionService.ts`: command summaries that link back to WorkOrders, AutomationJobs, reviews, providers, and other owning records. Mission Control also exposes the narrowly scoped DECREE_TO_DONE actions; other summary sections remain read-only.

## Data Model

Core Prisma model groups cover identity/audit, providers/usage, projects/context snapshots, commands/council, external work/execution, reports/knowledge, Living Loop candidates/runs, and Kingdom governance. The principal execution chain is `Task -> CouncilSession -> WorkOrder -> AutomationJob -> ImplementationReport/PatchArtifact -> AgentReviewSummary`, with source ids and trace ids preserving provenance between stages. `WorkflowRun` and `WorkflowStepRun` form a thin, idempotent graph over that chain; they never replace the owning records.

Tasks belong to users and may produce council sessions and reports. Council sessions store selected agent IDs, provider/model metadata, fallback notices, consulted memory IDs, auto-saved memory IDs, agent responses, and final summary. Reports and memories retain source task/session references when generated from council output.

Projects are long-running kingdom assets. `Task`, `Matter`, `Notice`, `CouncilSession`, `Report`, `Memory`, `WorkOrder`, `ImplementationReport`, `HandoffBrief`, and `Artifact` have optional `projectId` links so unassigned work remains valid. `ProjectRoutingCandidate` records every explainable routing decision. `ProjectInboxItem` holds low-confidence or ambiguous items for royal confirmation. `Artifact` is the project-linkable knowledge vault for prompts, specs, decisions, implementation reports, handoff briefs, architecture notes, research, code plans, decrees, and general notes.

External agents are execution workers, not internal council members. `WorkOrder` is the source-of-truth package; `WorkSession` records a manual execution attempt; `AutomationJob` records runner execution; `ImplementationReport` captures what ran and changed; `PatchArtifact` owns the reviewable diff; `HandoffBrief` packages current state for another executor. The API does not execute shell commands itself. CLI execution occurs only in `apps/runner` when explicitly enabled and represented by an approved/gated job; proprietary Claude Code/Codex/Cline APIs are not called directly.

`UsageRecord` captures one row per AI call: provider, providerId, model, token counts (prompt/completion/total), and estimated USD cost calculated from a static pricing table in `src/pricing/providerPricing.ts`. Records link to the originating task, council session, and agent. The Grand Vizier generates two records per session (specialist call + synthesis pass). `TreasuryLedger` captures one COST entry per completed session. The `Budget` model exists in the schema but budget limits are currently read from `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`).

## Auth and Authorization

Authentication uses bcrypt password hashes, 15-minute JWT access tokens, and server-stored refresh token sessions. Logout revokes the active refresh token record; protected access checks both JWT validity and session state.

RBAC is enforced by `requireRole` and `methodPermission` middleware in `src/middleware/rbac.ts`. `/api/agents`, `/api/settings`, `/api/providers`, `/api/users`, `/api/treasury`, and `/api/audit` require `KING`. External agent writes are KING-only; work order writes and handoff generation are KING/CROWN_PRINCE; implementation report submission is KING/CROWN_PRINCE/MINISTER; SCRIBE is read-only. Project create/update and Project Inbox assignment are KING/CROWN_PRINCE, project delete/archive is KING-only, and artifact creation is KING/CROWN_PRINCE/MINISTER. Core resource routes (`/api/tasks`, `/api/council`, `/api/reports`, `/api/memory`) apply per-method role checks: `KING` has full access; `CROWN_PRINCE` has tasks/council/reports/memory; `MINISTER` has tasks/reports; `SCRIBE` has read-only tasks/council/reports/memory. Frontend navigation mirrors these roles but is not the security boundary.

## AI Provider Flow

The provider abstraction is defined by `GenerateAgentResponseInput` and `AIProvider`. `mock` is the local default. `openAICompatibleProvider.ts` implements reusable Chat Completions calls for OpenAI, OpenRouter, DeepSeek, Gemini, and custom OpenAI-compatible APIs. `anthropicProvider.ts` implements the native Anthropic Messages API. `generateWithFallback` accepts a provider chain, records attempted providers, and returns usage from the provider that actually succeeded; the local sandbox baseline remains the final fallback.

`aiProviderRouter.ts` resolves provider choice by agent override, task mode policy, cost mode (`AI_COST_MODE=low|balanced|quality`), required capabilities, and fallback chain. The default fallback chain is `deepseek -> openrouter -> openai -> mock`. Fallback notices are stored on `CouncilSession.fallbackNotice`.

`AIProvider.generateAgentResponse` returns `AgentResponseResult` — both the text response and a `TokenUsage` struct (promptTokens, completionTokens, totalTokens). OpenAI-compatible providers read usage from the API response body. `MockAIProvider` estimates tokens from string length (`Math.ceil(text.length / 4)`). `generateWithFallback` propagates usage from whichever provider ran.

Pricing is calculated in `src/pricing/providerPricing.ts` using a static table keyed by `"provider:model"`. Unknown models default to $0 with a console warning (never a thrown error). `estimatedCostLocal` always equals `estimatedCostUSD`; no FX conversion is performed.

Agent records contain prompts, skills, response style, priority, and optional provider/model/fallback/cost/temperature/max-token overrides. The Grand Vizier is required and cannot be deactivated or deleted through the API.

## Frontend Layout

Routes are defined in `apps/web/src/main.tsx`. `AppLayout` renders role-aware navigation grouped by purpose. Mission Control contains Overview (`/dashboard`), Action Queue (`/inbox`), Operations (`/kingdom/operations`), Royal Brief (`/royal-brief`), and Living Loop (`/living-loop`). Summary sections link back to owning records; the Overview additionally owns the bounded DECREE_TO_DONE continue, choose-agent, retry, and accept-and-learn actions. Other lifecycle mutation remains on owning pages. `authStore` owns session state, `kingdomStore` owns shared Kingdom data, and all network calls remain centralized in `apps/web/src/lib/api.ts`.

## Project Routing Flow

When a task, matter, notice, or work order is created without an explicit `projectId`, the Royal Secretary routing service classifies the title/content against active project names, codenames, aliases, and keywords. High-confidence matches are assigned immediately and recorded as `CONFIRMED`. Medium-confidence matches create both a `ProjectRoutingCandidate` and pending `ProjectInboxItem`. Low-confidence matches create a pending inbox item and leave the source unassigned.

Before council processing, the orchestrator injects compact project context when the task has `projectId`; otherwise it adds an explicit warning that no project is assigned and project-specific assumptions should be avoided. External work-order prompts use the same project context builder.

## Living Loop Automation and Auto Sandbox Patch Safety (M17D-M21)

`livingLoopService.ts` runs an observe -> propose -> act cycle (`runLivingLoopOnce`), gated by `LIVING_LOOP_ENABLED`. `observeKingdomState()` reads work orders needing review/stale, failed/needs-review/stale automation jobs, patches pending review, stale runners, repeated provider failures, stale project inbox items, matters awaiting decision, and reports with remaining work. `proposeAutomationCandidates()` turns observations into `AutomationCandidate` rows (kinds: `WORK_ORDER_REVIEW`, `VALIDATION_JOB`, `PATCH_REVIEW`, `MEMORY_REVIEW`, `CLEANUP_REVIEW`, `PROVIDER_REVIEW`, `PROJECT_REVIEW`, `RUNNER_REVIEW`, `SANDBOX_PATCH`), each passing `dataValueGate()` (confidence threshold, summary/reason length) before being persisted.

Three opt-in auto-act stages run after candidate proposal, all disabled by default and independently toggled via `Setting`:

- `autoRepairContext()` (M21, `LIVING_LOOP_AUTO_CONTEXT_REPAIR`): scans approved local-doc roots once per project per tick and rebinds eligible MISSING/STALE WorkOrders. Daily and per-WorkOrder cooldown limits apply. Because this can satisfy the FRESH-context precondition for later auto-patch ticks, it is deliberately excluded from the default autonomy-enable command.
- `autoCreateValidationJobs()` (M17D-2, `LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS`): creates `AutomationJob` rows in `VALIDATION_ONLY` mode for eligible `VALIDATION_JOB`/`WORK_ORDER_REVIEW` candidates. These jobs only run allowlisted read/typecheck/test/build commands on the runner — never edit files, never create patch artifacts, never push.
- `autoCreateSandboxPatchJobs()` (M17D-3, `LIVING_LOOP_AUTO_SANDBOX_PATCH`): creates `AutomationJob` rows in `SANDBOX_PATCH` mode for eligible `SANDBOX_PATCH` candidates derived from work orders in `READY`/`IN_PROGRESS` status.

The M19 scheduler starts from `server.ts`, uses an unref'd interval (`LIVING_LOOP_INTERVAL_MS`, default 300000ms, minimum 15000ms), prevents overlapping ticks, and re-reads `LIVING_LOOP_ENABLED` before every run. It adds timing, not capability: downstream context, risk, runner, review, and no-push gates remain authoritative.

### Auto Sandbox Patch risk policy (`livingLoopRiskPolicyService.ts`)

`isAutoPatchEligible()` is a pure function consulted before any auto SANDBOX_PATCH job is created. A candidate is eligible only if **all** of the following hold, checked in order:

1. The daily auto-patch job count (`LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS`, default 3) has not been reached.
2. Candidate confidence meets `LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE` (default 85).
3. Candidate `riskLevel` is strictly `LOW`.
4. An online runner is available (`hasOnlineRunner()`).
5. The work order is linked to a project.
6. No active `AutomationJob` already exists for the work order.
7. No `SANDBOX_PATCH` job was created for the work order within `LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES` (default 120).
8. None of the candidate's proposed-action file hints touch a blocked path (auth, rbac, provider, runner, policy, secret, migrations, schema, deploy, docker, CI config, package manifests, `.env`, config).

Any failure produces a `skippedReason` and an audit log entry (`living_loop_auto_sandbox_patch_skipped`, `auto_patch_risk_policy_blocked`, `auto_patch_cooldown_blocked`, or `auto_patch_daily_limit_blocked`).

### Hard no-push guarantee

Jobs created by `autoCreateSandboxPatchJobs()` are always created with `commandPolicy: "SANDBOX_PATCH_NO_PUSH"` and `provenance.source: "LIVING_LOOP_AUTO_SANDBOX_PATCH"` (plus `loopRunId`, `candidateId`, `workOrderId`). On the runner, `evaluateBranchPushEligibility()` (`apps/runner/src/sandboxPatchPolicy.ts`) refuses to attempt a branch push whenever `commandPolicy === "SANDBOX_PATCH_NO_PUSH"`, **regardless of the server's `LIVING_LOOP_ALLOW_BRANCH_PUSH` setting**. The runner still generates a patch artifact, runs validation, and submits an `ImplementationReport` (linked to the `AutomationJob` and, via `PatchArtifact.automationJobId`, to the generated patch) — the job ends in `NEEDS_REVIEW` for King review in the Patch Review panel. Server-side `createPatchArtifact()` independently re-checks blocked paths and risk scoring (`patchRiskService.ts`), so even a MEDIUM/HIGH/CRITICAL-scored diff cannot auto-push: `shouldPushWithoutApproval()` only allows unattended push for `riskLevel: "LOW"` + `validationStatus: "PENDING"`, and `SANDBOX_PATCH_NO_PUSH` blocks push entirely for these auto-created jobs either way. No branch push, PR creation, merge, or deploy is ever performed automatically.

The Living Loop dashboard card and `/living-loop` page surface `autoContextRepair`, `autoValidation`, and `autoSandboxPatch` state plus pending-review counts. The Automation Jobs page tags auto-created jobs with provenance and no-push notices, while Mission Control metrics link back to `/living-loop` as the owning status page.

## Project Context Binding (M17E-2)

Context binding makes "know the current project state before acting" an enforceable policy. Local document intelligence (M17E-1: `LocalDocumentRoot` → scanner → `LocalDocumentSnapshot` + `LocalDocumentInsight`, all access through the safe path resolver) and `RepositorySnapshot` provide the project state; M17E-2 binds that state to every actor that plans, validates, patches, or reports.

### Data model

- **WorkOrder** carries `localDocumentSnapshotId`, `repositorySnapshotId`, `contextBoundAt`, `contextBindingStatus` (`FRESH | STALE | MISSING | PARTIAL`), `contextBindingSummary` (project id, snapshot ids, scan time, detected stack, package scripts, risk zones, important docs), and `contextBindingProvenance` (`source: PROJECT_CONTEXT_BINDING`, boundAt, root ids/names, root path **hashes** — never raw paths or secrets).
- **AutomationJob** carries `localDocumentSnapshotId`, `repositorySnapshotId`, `contextRequired`, `contextValidationStatus` (`FRESH | STALE | MISSING | PARTIAL | NOT_REQUIRED`), and `contextValidationSummary`.
- **PatchArtifact** carries `localDocumentSnapshotId`, `repositorySnapshotId`, `baseContextStatus`, and `baseContextProvenance` — the exact base context the patch was generated from.
- **ImplementationReport** carries `localDocumentSnapshotId`, `repositorySnapshotId`, and `contextUsed` (status + warnings reported by the runner).

### Binding flow (`projectContextBindingService.ts`)

`getProjectContextBinding(projectId)` computes the live status (read-only, safe for GET routes): no local root → `PARTIAL`; no/failed snapshot → `MISSING`; aged-out snapshot or docs changed since scan → `STALE`; partial scan → `PARTIAL`; otherwise `FRESH`. `bindFreshContextToWorkOrder()` stores the binding on the work order (auto-invoked on work order creation and on project reassignment; explicitly via `POST /api/work-orders/:id/bind-context`, KING/CROWN_PRINCE). `markWorkOrderContextStale()` lets the King invalidate a binding.

### Enforcement

`validateContextForAutomationJob(workOrderId, mode)` runs before every job creation (manual route and Living Loop auto-create):

- **SANDBOX_PATCH requires project linkage and FRESH context.** STALE/MISSING/PARTIAL context rejects the job (`ContextBindingError` → HTTP 409) and auto sandbox patch skips with `ContextBinding:missing|stale|partial|project_missing|local_docs_changed` skip reasons.
- **VALIDATION_ONLY proceeds with degraded context** but carries warnings in `contextValidationSummary` and in the runner's report.
- The runner re-checks (`evaluateJobContextBinding()` in `sandboxPatchPolicy.ts`): when fresh local context is required, SANDBOX_PATCH jobs with STALE/MISSING/PARTIAL `contextValidationStatus` are refused with a FAILED status; legacy jobs without the field fall back to the M17E-1 provenance check. The runner reports `contextUsed` on every ImplementationReport.
- `createPatchArtifact()` attaches the job's binding as the artifact's base context, so patch review always shows which snapshots the diff was generated from.

### Why this prevents stale-context patching

Without binding, an agent could plan against docs scanned days ago, patch a repository whose files changed since, and the King could not verify which project state was used. With binding, every WorkOrder, AutomationJob, PatchArtifact, and ImplementationReport names its exact snapshots; freshness is validated at job creation *and* at runner execution; stale or missing context blocks patching outright; and the Living Loop + Royal Brief surface every blocked work order, skipped auto job, and stale-context patch as decisions (`GET /api/projects/:id/context-health`, brief `contextHealthSummary`, "Refresh project context before patching" decisions).

## Deployment

Local development uses `docker-compose.yml` for PostgreSQL and npm scripts for API/web dev servers. Staging uses `docker-compose.staging.yml` with internal PostgreSQL, backend, frontend Nginx static serving, persistent database volume, health checks, and no public database port.

The staging backend entrypoint runs Prisma generate, `prisma migrate deploy`, and safe seed-if-empty. Backups and restores use `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` with `DATABASE_URL` supplied from the environment.

## DECREE_TO_DONE Workflow (V1)

The DECREE_TO_DONE persisted workflow (`decreeToDoneWorkflowService.ts`) makes Mission Control the single interaction surface for BUILD decrees. A `WorkflowRun` record with idempotent `WorkflowStepRun` children tracks progress; the owning records (Task, CouncilSession, WorkOrder, AutomationJob, AgentReviewSummary) remain the source of truth.

Steps and their gates:

1. **INTAKE_DECREE** — accepts the BUILD task; guards against non-BUILD modes.
2. **CHECK_CONTEXT** — scans approved local document roots for the task's project; blocks with "Fix Context" if context is missing or stale.
3. **RUN_COUNCIL** — calls the Grand Vizier orchestrator; stores the resulting `CouncilSession`.
4. **CREATE_WORK_ORDER** — runs the planner agent; creates a `WorkOrder` with decree-specific acceptance criteria and file hints.
5. **RESOLVE_AGENT** — checks live runner-reported agent capability; when `REQUIRE_KING_EXTERNAL_AGENT_CHOICE` is on and multiple agents are ready, raises an `AWAITING_ROYAL_DECISION` matter and blocks with "Choose Agent".
6. **DISPATCH_RUNNER** — calls the external-agent bridge to create and approve a `SANDBOX_PATCH` `AutomationJob`; requires `EXTERNAL_AGENT_BRIDGE_ENABLED=true` and an online runner.
7. **VALIDATE_RESULT** — waits for the runner to submit an `ImplementationReport` (and optionally a `PatchArtifact`).
8. **REVIEW_RESULT** — reads the `AgentReviewSummary` verdict: `PATCH_FAILED`/`VALIDATION_FAILED` → "Retry"; `NEEDS_FIX`/`RISK_REVIEW`/`UNKNOWN` → "Review Result" (King decision); `PASS` → "Accept & Learn".
9. **RETRY_OR_ESCALATE** — dispatches a new job via `supervisedRetryService` after a mechanical retry; loops back toward VALIDATE_RESULT.
10. **ARCHIVE_LEARNING** — "Accept & Learn": approves `PatchArtifact`, approves `AgentKnowledgeCandidate` records, completes `WorkOrder` and `AutomationJob`, closes `WorkflowRun` as COMPLETED.
11. **DONE** — terminal.

Review metadata consistency: `normalizeKingRecommendation(verdict, recommendation)` in `runnerResultReviewService.ts` guarantees `PASS` always pairs with `APPROVE`, never `REQUEST_REVISION`/`RETRY_WITH_FIXED_PATCH`/`REJECT`. Applied at the write path, at `serializeWorkflowView`, and at the Mission Control display layer.

In-process dedup: `inProcessRuns = new Map<string, Promise<WorkflowView>>()` prevents concurrent re-entry for the same task. `WorkflowRun.sourceTaskId @unique` prevents duplicate runs at the schema level.

## AI Kingdom is quality-first, not data-first.

The system must not persist weak, duplicate, unclear, or non-actionable records.
Generated data must pass a value gate before becoming Kingdom state.
Low-confidence signals are preview-only or ephemeral.
Agent learning requires provenance, deduplication, and approval.
A smaller trusted Kingdom is better than a large polluted Kingdom.
