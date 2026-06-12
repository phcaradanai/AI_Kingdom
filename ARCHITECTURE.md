# Architecture

## Overview

AI Kingdom is a TypeScript npm workspaces monorepo with two applications:

- `apps/api`: Express API, Prisma ORM, PostgreSQL, JWT auth, AI orchestration services.
- `apps/web`: React/Vite dashboard, TailwindCSS styling, React Router pages, Zustand state.

The backend owns persistence, authentication, RBAC, orchestration, AI provider selection, memory extraction, and report generation. The frontend is a role-aware dashboard client that calls REST endpoints through `apps/web/src/lib/api.ts`.

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
- `externalAgentWorkOrderService.ts`: external executor bridge. Seeds manual handoff targets, generates work orders from tasks/matters, builds copy-paste prompts with charter/vision/project context, records implementation reports, creates handoff briefs, captures decision memories, and creates completion report summaries.
- `projectService.ts`: seeds default projects, returns project overview counts, creates secret-checked artifacts, and generates Obsidian-friendly markdown export payloads.
- `projectRoutingService.ts`: Royal Secretary project classifier. Uses deterministic keyword, alias, project name/codename, and source ancestry matching. Scores are explainable; confidence >=80 auto-assigns, 50-79 creates a suggested Project Inbox item, and <50 leaves the source unassigned for review.
- `projectContextService.ts`: builds compact project context for agents: project identity, goals, status, active milestone, recent decisions/reports, open matters, active work orders, linked memories, and artifacts. Output is capped to avoid prompt bloat.

## Data Model

Core Prisma models are `User`, `RefreshToken`, `AuditLog`, `Agent`, `AIProvider`, `AIProviderRoute`, `Project`, `ProjectRoutingCandidate`, `ProjectInboxItem`, `Artifact`, `ExternalAgent`, `WorkOrder`, `WorkSession`, `ImplementationReport`, `HandoffBrief`, `Setting`, `Task`, `CouncilSession`, `AgentResponse`, `Memory`, `Report`, `UsageRecord`, `TreasuryLedger`, `Budget`, `KingdomCharter`, `KingdomVision`, `Notice`, and `Matter`.

Tasks belong to users and may produce council sessions and reports. Council sessions store selected agent IDs, provider/model metadata, fallback notices, consulted memory IDs, auto-saved memory IDs, agent responses, and final summary. Reports and memories retain source task/session references when generated from council output.

Projects are long-running kingdom assets. `Task`, `Matter`, `Notice`, `CouncilSession`, `Report`, `Memory`, `WorkOrder`, `ImplementationReport`, `HandoffBrief`, and `Artifact` have optional `projectId` links so unassigned work remains valid. `ProjectRoutingCandidate` records every explainable routing decision. `ProjectInboxItem` holds low-confidence or ambiguous items for royal confirmation. `Artifact` is the project-linkable knowledge vault for prompts, specs, decisions, implementation reports, handoff briefs, architecture notes, research, code plans, decrees, and general notes.

External agents are execution workers, not internal council members. `WorkOrder` is the source-of-truth package; `WorkSession` records a manual execution attempt; `ImplementationReport` captures what the external app agent did; `HandoffBrief` packages the current state for another executor. Backend code never runs shell commands for these models and never calls Claude Code/Codex/Cline APIs.

`UsageRecord` captures one row per AI call: provider, providerId, model, token counts (prompt/completion/total), and estimated USD cost calculated from a static pricing table in `src/pricing/providerPricing.ts`. Records link to the originating task, council session, and agent. The Grand Vizier generates two records per session (specialist call + synthesis pass). `TreasuryLedger` captures one COST entry per completed session. The `Budget` model exists in the schema but budget limits are currently read from `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`).

## Auth and Authorization

Authentication uses bcrypt password hashes, 15-minute JWT access tokens, and server-stored refresh token sessions. Logout revokes the active refresh token record; protected access checks both JWT validity and session state.

RBAC is enforced by `requireRole` and `methodPermission` middleware in `src/middleware/rbac.ts`. `/api/agents`, `/api/settings`, `/api/providers`, `/api/users`, `/api/treasury`, and `/api/audit` require `KING`. External agent writes are KING-only; work order writes and handoff generation are KING/CROWN_PRINCE; implementation report submission is KING/CROWN_PRINCE/MINISTER; SCRIBE is read-only. Project create/update and Project Inbox assignment are KING/CROWN_PRINCE, project delete/archive is KING-only, and artifact creation is KING/CROWN_PRINCE/MINISTER. Core resource routes (`/api/tasks`, `/api/council`, `/api/reports`, `/api/memory`) apply per-method role checks: `KING` has full access; `CROWN_PRINCE` has tasks/council/reports/memory; `MINISTER` has tasks/reports; `SCRIBE` has read-only tasks/council/reports/memory. Frontend navigation mirrors these roles but is not the security boundary.

## AI Provider Flow

The provider abstraction is defined by `GenerateAgentResponseInput` and `AIProvider`. `mock` is the local default. `openAICompatibleProvider.ts` implements reusable Chat Completions calls for OpenAI, OpenRouter, DeepSeek, and future OpenAI-compatible APIs. `generateWithFallback` accepts a provider chain, records attempted providers, and returns usage from the provider that actually succeeded.

`aiProviderRouter.ts` resolves provider choice by agent override, task mode policy, cost mode (`AI_COST_MODE=low|balanced|quality`), required capabilities, and fallback chain. The default fallback chain is `deepseek -> openrouter -> openai -> mock`. Fallback notices are stored on `CouncilSession.fallbackNotice`.

`AIProvider.generateAgentResponse` returns `AgentResponseResult` — both the text response and a `TokenUsage` struct (promptTokens, completionTokens, totalTokens). OpenAI-compatible providers read usage from the API response body. `MockAIProvider` estimates tokens from string length (`Math.ceil(text.length / 4)`). `generateWithFallback` propagates usage from whichever provider ran.

Pricing is calculated in `src/pricing/providerPricing.ts` using a static table keyed by `"provider:model"`. Unknown models default to $0 with a console warning (never a thrown error). `estimatedCostLocal` always equals `estimatedCostUSD`; no FX conversion is performed.

Agent records contain prompts, skills, response style, priority, and optional provider/model/fallback/cost/temperature/max-token overrides. The Grand Vizier is required and cannot be deactivated or deleted through the API.

## Frontend Layout

Routes are defined in `apps/web/src/main.tsx`. `AppLayout` renders the dark kingdom dashboard shell, role-aware navigation, role badge, and sign-out. `authStore` stores the current user, access token, and refresh token. `kingdomStore` loads permitted kingdom data and provides actions for tasks, council processing, reports, memories, agents, providers, and settings. `/external-agents` manages manual executor targets; `/work-orders` handles prompt generation, implementation report submission, and handoff copying. `/projects` manages project records, `/projects/:id` shows linked project workspace context and Obsidian export payloads, `/project-inbox` handles low-confidence routing review, and `/artifacts` manages the project knowledge vault.

## Project Routing Flow

When a task, matter, notice, or work order is created without an explicit `projectId`, the Royal Secretary routing service classifies the title/content against active project names, codenames, aliases, and keywords. High-confidence matches are assigned immediately and recorded as `CONFIRMED`. Medium-confidence matches create both a `ProjectRoutingCandidate` and pending `ProjectInboxItem`. Low-confidence matches create a pending inbox item and leave the source unassigned.

Before council processing, the orchestrator injects compact project context when the task has `projectId`; otherwise it adds an explicit warning that no project is assigned and project-specific assumptions should be avoided. External work-order prompts use the same project context builder.

## Living Loop Automation and Auto Sandbox Patch Safety (M17D)

`livingLoopService.ts` runs an observe -> propose -> act cycle (`runLivingLoopOnce`), gated by `LIVING_LOOP_ENABLED`. `observeKingdomState()` reads work orders needing review/stale, failed/needs-review/stale automation jobs, patches pending review, stale runners, repeated provider failures, stale project inbox items, matters awaiting decision, and reports with remaining work. `proposeAutomationCandidates()` turns observations into `AutomationCandidate` rows (kinds: `WORK_ORDER_REVIEW`, `VALIDATION_JOB`, `PATCH_REVIEW`, `MEMORY_REVIEW`, `CLEANUP_REVIEW`, `PROVIDER_REVIEW`, `PROJECT_REVIEW`, `RUNNER_REVIEW`, `SANDBOX_PATCH`), each passing `dataValueGate()` (confidence threshold, summary/reason length) before being persisted.

Two opt-in auto-act stages run after candidate proposal, both disabled by default and independently toggled via `Setting`:

- `autoCreateValidationJobs()` (M17D-2, `LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS`): creates `AutomationJob` rows in `VALIDATION_ONLY` mode for eligible `VALIDATION_JOB`/`WORK_ORDER_REVIEW` candidates. These jobs only run allowlisted read/typecheck/test/build commands on the runner — never edit files, never create patch artifacts, never push.
- `autoCreateSandboxPatchJobs()` (M17D-3, `LIVING_LOOP_AUTO_SANDBOX_PATCH`): creates `AutomationJob` rows in `SANDBOX_PATCH` mode for eligible `SANDBOX_PATCH` candidates derived from work orders in `READY`/`IN_PROGRESS` status.

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

The Living Loop dashboard card and `/living-loop` page surface `autoSandboxPatch` status (enabled, daily count/limit, cooldown, min confidence, jobs created last run) and `patchesPendingReview` (count of `PatchArtifact` rows with `validationStatus: "PENDING"`), and the Automation Jobs page tags auto-created jobs with a "Living Loop Auto Sandbox Patch" provenance badge plus a "No branch push / no PR auto-create" notice.

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

## AI Kingdom is quality-first, not data-first.

The system must not persist weak, duplicate, unclear, or non-actionable records.
Generated data must pass a value gate before becoming Kingdom state.
Low-confidence signals are preview-only or ephemeral.
Agent learning requires provenance, deduplication, and approval.
A smaller trusted Kingdom is better than a large polluted Kingdom.