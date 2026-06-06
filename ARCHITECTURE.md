# Architecture

## Overview

AI Kingdom is a TypeScript npm workspaces monorepo with two applications:

- `apps/api`: Express API, Prisma ORM, PostgreSQL, JWT auth, AI orchestration services.
- `apps/web`: React/Vite dashboard, TailwindCSS styling, React Router pages, Zustand state.

The backend owns persistence, authentication, RBAC, orchestration, AI provider selection, memory extraction, and report generation. The frontend is a role-aware dashboard client that calls REST endpoints through `apps/web/src/lib/api.ts`.

## Backend Layout

Process entry is `apps/api/src/server.ts`; it calls `createApp()` from `src/app.ts`, which assembles the Express app with middleware and routes. Routes live in `src/routes`, middleware in `src/middleware`, domain logic in `src/services`, AI provider code in `src/ai`, and Prisma access in `src/db/prisma.ts`.

Primary services:

- `grandVizierOrchestrator.ts`: selects active agents by task mode, injects memory context, calls the AI provider once per selected agent plus the final Grand Vizier synthesis, saves council responses, creates one `UsageRecord` per AI call (including the synthesis pass), creates a `TreasuryLedger` COST entry per completed session, and triggers memory extraction and report generation.
- `memoryService.ts`: keyword/tag relevance, context formatting, deterministic extraction, duplicate and secret checks.
- `reportService.ts`: generated Royal Report creation and duplicate prevention.
- `settingsService.ts`: default settings and runtime setting lookup.
- `treasuryService.ts`: aggregates `UsageRecord` rows into overview, per-agent, per-provider/model, and daily-bucket breakdowns; reads budget limits from settings to produce warning flags.
- `auditService.ts`: audit log writes for security-sensitive actions.

## Data Model

Core Prisma models are `User`, `RefreshToken`, `AuditLog`, `Agent`, `Setting`, `Task`, `CouncilSession`, `AgentResponse`, `Memory`, `Report`, `UsageRecord`, `TreasuryLedger`, and `Budget`.

Tasks belong to users and may produce council sessions and reports. Council sessions store selected agent IDs, provider/model metadata, fallback notices, consulted memory IDs, auto-saved memory IDs, agent responses, and final summary. Reports and memories retain source task/session references when generated from council output.

`UsageRecord` captures one row per AI call: provider, model, token counts (prompt/completion/total), and estimated USD cost calculated from a static pricing table in `src/pricing/providerPricing.ts`. Records link to the originating task, council session, and agent. The Grand Vizier generates two records per session (specialist call + synthesis pass). `TreasuryLedger` captures one COST entry per completed session. The `Budget` model exists in the schema but budget limits are currently read from `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`).

## Auth and Authorization

Authentication uses bcrypt password hashes, 15-minute JWT access tokens, and server-stored refresh token sessions. Logout revokes the active refresh token record; protected access checks both JWT validity and session state.

RBAC is enforced by `requireRole` and `methodPermission` middleware in `src/middleware/rbac.ts`. `/api/agents`, `/api/settings`, and `/api/users` require `KING`. Core resource routes (`/api/tasks`, `/api/council`, `/api/reports`, `/api/memory`) apply per-method role checks: `KING` has full access; `CROWN_PRINCE` has tasks/council/reports/memory; `MINISTER` has tasks/reports; `SCRIBE` has read-only tasks/council/reports/memory. Frontend navigation mirrors these roles but is not the security boundary.

## AI Provider Flow

The provider abstraction is defined by `GenerateAgentResponseInput` and `AIProvider`. `mock` is the local default. `openai` uses an OpenAI-compatible chat completions endpoint configured by environment and settings. `generateWithFallback` handles provider failures by returning deterministic mock counsel and recording fallback notices on sessions.

`AIProvider.generateAgentResponse` returns `AgentResponseResult` — both the text response and a `TokenUsage` struct (promptTokens, completionTokens, totalTokens). `OpenAIProvider` reads usage from the API response body. `MockAIProvider` estimates tokens from string length (`Math.ceil(text.length / 4)`). `generateWithFallback` propagates usage from whichever provider ran (primary or mock fallback).

Pricing is calculated in `src/pricing/providerPricing.ts` using a static table keyed by `"provider:model"`. Unknown models default to $0 with a console warning (never a thrown error). `estimatedCostLocal` always equals `estimatedCostUSD`; no FX conversion is performed.

Agent records contain prompts, skills, response style, priority, and optional model/temperature/max-token overrides. The Grand Vizier is required and cannot be deactivated or deleted through the API.

## Frontend Layout

Routes are defined in `apps/web/src/main.tsx`. `AppLayout` renders the dark kingdom dashboard shell, role-aware navigation, role badge, and sign-out. `authStore` stores the current user, access token, and refresh token. `kingdomStore` loads permitted kingdom data and provides actions for tasks, council processing, reports, memories, agents, and settings.

## Deployment

Local development uses `docker-compose.yml` for PostgreSQL and npm scripts for API/web dev servers. Staging uses `docker-compose.staging.yml` with internal PostgreSQL, backend, frontend Nginx static serving, persistent database volume, health checks, and no public database port.

The staging backend entrypoint runs Prisma generate, `prisma migrate deploy`, and safe seed-if-empty. Backups and restores use `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` with `DATABASE_URL` supplied from the environment.
