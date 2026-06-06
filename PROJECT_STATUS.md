# Project Status

## Current State

AI Kingdom Web MVP is implemented through M10. The app supports authenticated role-based access, task intake, Grand Vizier council processing, OpenAI-compatible provider integration with mock fallback, persistent memory, generated reports, editable agents/settings, staging-ready Docker deployment, and a Royal Treasury system for tracking AI token usage and estimated costs.

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

## Current API Surface

- Public health: `GET /health`, `GET /health/db`.
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me`.
- Core resources: `/api/tasks`, `/api/council`, `/api/reports`, `/api/memory` (also aliased as `/api/memories`).
- Admin resources (KING only): `/api/agents`, `/api/settings`, `/api/users`.
- Treasury resources (KING only): `/api/treasury/overview`, `/api/treasury/usage`, `/api/treasury/agents`, `/api/treasury/providers`, `/api/treasury/reports`.

RBAC is enforced server-side. `KING` has full access; `CROWN_PRINCE` can use tasks, council, reports, and memory; `MINISTER` can use tasks and reports; `SCRIBE` has read-only access to tasks, council, reports, and memory.

## Current Web Routes

Implemented pages: `/login`, `/dashboard`, `/throne-room`, `/council`, `/agents`, `/reports`, `/memory`, `/settings`, `/treasury`, `/profile`, `/users`, and `/security`.

Navigation is role-aware. The frontend also handles access-token refresh and clears the session when refresh fails.

## Verification

Most recent verification completed successfully:

- `npm run db:migrate`
- `npm run db:seed`
- `npm run typecheck` (both workspaces)
- `npm run test --workspace @ai-kingdom/api` (`31/31` passing)
- `npm run build` (both workspaces)

Local smoke checks confirmed King login, treasury page rendering with agent/provider/model breakdowns, UsageRecord creation on task processing, budget warning banner activation, and no console errors.

## Known Gaps

- Audit logs are stored but do not yet have read APIs or an admin UI.
- Auth does not include SSO, OAuth, MFA, password reset, or email verification.
- AI orchestration does not include tool calling, web search, background workers, or autonomous agents.
- Memory search is keyword/tag based; no vector database is implemented.
- Staging is configured but production deployment and production observability are not yet complete.
- `estimatedCostLocal` mirrors `estimatedCostUSD` (USD only; no FX conversion).
- The Grand Vizier appears twice per session in the UsageRecord table (once as a specialist agent call, once for the final synthesis pass), so per-agent call counts reflect actual AI invocations, not council participation.
- The `Budget` model is schema-only; budget limits are stored as `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`). No write API for `Budget` records exists yet.
- Usage records only cover sessions processed after M10 was deployed; historical sessions have no cost data.
