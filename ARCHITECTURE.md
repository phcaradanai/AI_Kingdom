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

## Deployment

Local development uses `docker-compose.yml` for PostgreSQL and npm scripts for API/web dev servers. Staging uses `docker-compose.staging.yml` with internal PostgreSQL, backend, frontend Nginx static serving, persistent database volume, health checks, and no public database port.

The staging backend entrypoint runs Prisma generate, `prisma migrate deploy`, and safe seed-if-empty. Backups and restores use `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` with `DATABASE_URL` supplied from the environment.
