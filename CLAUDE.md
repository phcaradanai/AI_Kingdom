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

# Development
npm run dev          # starts both API (port 4000) and Vite (port 5173)
npm run typecheck    # TypeScript checks across all workspaces
npm run test         # API test suite (Node built-in runner + tsx)
npm run lint         # alias for typecheck in both workspaces

# Database
npm run db:migrate   # apply migrations + generate Prisma client (dev only)
npm run db:seed      # reset seeded King user and royal agents

# Single workspace targets
npm run dev --workspace @ai-kingdom/api
npm run test --workspace @ai-kingdom/api
```

Seeded login: `king@aikingdom.local` / `password123`

## Architecture

npm workspaces monorepo: `apps/api` (Express + Prisma) and `apps/web` (React + Vite). No shared packages — types are duplicated between `apps/api/src/types/api.ts` and `apps/web/src/types/api.ts`.

### Backend (`apps/api`)

Entry: `src/server.ts` → `src/app.ts` (Express setup with cors, helmet, morgan, rate limiting, routes, error handler).

**Core flow — decree processing:**
1. `POST /api/tasks` creates a Task (status `PENDING`).
2. `POST /api/tasks/:id/process` triggers `grandVizierOrchestrator.ts`, which:
   - Loads relevant Kingdom Memories via `memoryService.ts` (keyword/tag match, up to 5).
   - Selects agents by `AGENTS_BY_MODE` map (keyed on `TaskMode`: ASK/PLAN/RESEARCH/BUILD).
   - Calls each agent in order via `generateWithFallback.ts` — tries the configured `AIProvider`, falls back to mock if it fails or times out.
   - Creates one `UsageRecord` per AI call (agents + Grand Vizier synthesis) with token counts and estimated USD cost from `src/pricing/providerPricing.ts`.
   - Creates a `CouncilSession` with agent responses.
   - Creates one `TreasuryLedger` COST entry for the session total.
   - Auto-saves 1–5 memory candidates from the summary via `memoryService.ts`.
   - Generates a `RoyalReport` via `reportService.ts`.

**AI provider abstraction** (`src/ai/`):
- `AIProvider` interface in `aiProvider.ts` — `generateAgentResponse` returns `AgentResponseResult` (response text + `TokenUsage`).
- `mockAIProvider.ts` — deterministic responses, token counts estimated from string length, cost = $0.
- `openAIProvider.ts` — OpenAI-compatible; reads real token counts from API response body.
- `providerFactory.ts` — instantiates provider from env/settings.
- `generateWithFallback.ts` — wraps provider call with timeout + fallback to mock; propagates usage from whichever provider ran.

**Cost calculation** (`src/pricing/providerPricing.ts`): static table keyed `"provider:model"`, USD per 1M tokens. Unknown models default to $0 + console.warn. `calculateCostUSD(provider, model, promptTokens, completionTokens)` is the main entry point.

**RBAC** (`src/middleware/rbac.ts`): roles `KING > CROWN_PRINCE > MINISTER > SCRIBE`. Route handlers call `requireRole(role)` middleware. The Grand Vizier agent cannot be deleted or deactivated via the API.

**Settings** (`src/services/settingsService.ts`): runtime settings stored in DB, read via `getSettingValue`/`getBooleanSetting`/`getNumberSetting`. Keys: `AI_PROVIDER`, `OPENAI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`, `DEFAULT_TASK_MODE`, `AUTO_PROCESS_TASKS`, `AUTO_SAVE_MEMORY`, `AUTO_GENERATE_REPORTS`, `DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`. `OPENAI_API_KEY` is server-only and never returned by the settings API.

**Auth**: bcrypt passwords, short-lived JWT access tokens, server-stored refresh token sessions. `src/middleware/auth.ts` validates tokens; logout revokes the refresh session. Audit logs written for sensitive operations via `auditService.ts`.

### Frontend (`apps/web`)

React Router v6 SPA. All API calls go through `src/lib/api.ts` (centralized fetch wrapper). Zustand stores: `authStore.ts` (JWT + user), `kingdomStore.ts` (tasks, agents, memories, reports, council sessions).

**Route → role access** enforced by `ProtectedRoute.tsx`:
- `/throne-room`, `/council`, `/reports`, `/memory` — all authenticated roles.
- `/agents`, `/settings`, `/users` — KING only.

UI components under `src/components/ui/` are local shadcn-style primitives (button, card, input, textarea). Layout is in `src/components/layout/AppLayout.tsx`.

### Database

Prisma schema at `apps/api/prisma/schema.prisma`. `scripts/with-root-env.mjs` loads root `.env` so Prisma CLI picks up `DATABASE_URL`. Never run `prisma migrate dev` against staging — use `prisma migrate deploy`.

## Testing

Tests use Node's built-in test runner via `tsx`. Place test files next to the module as `*.test.ts`. Tests must not require a real OpenAI key — use `mockAIProvider` or stub providers. Run `npm run test` before shipping backend changes.

## AI Provider (local dev)

Default is `AI_PROVIDER=mock` — no API key required. To use OpenAI-compatible:

```env
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS=700
```

The orchestrator always falls back to mock if the provider fails or times out.
