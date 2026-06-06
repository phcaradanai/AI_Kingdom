# Project Status

## Current State

AI Kingdom Web MVP is implemented through M12. The app supports authenticated role-based access, task intake, Grand Vizier council processing, OpenAI-compatible provider integration with mock fallback, persistent memory, generated reports, editable agents/settings, staging-ready Docker deployment, Royal Treasury for cost tracking, Audit Log for operational oversight, and a Kingdom Charter + Vision constitutional layer that is injected into every council session.

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

## Current API Surface

- Public health: `GET /health`, `GET /health/db`.
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me`.
- Core resources: `/api/tasks`, `/api/council`, `/api/reports`, `/api/memory` (also aliased as `/api/memories`).
- Admin resources (KING only): `/api/agents`, `/api/settings`, `/api/users`.
- Treasury resources (KING only): `/api/treasury/overview`, `/api/treasury/usage`, `/api/treasury/agents`, `/api/treasury/providers`, `/api/treasury/reports`.
- Audit resources (KING only): `GET /api/audit`, `GET /api/audit/:id`, `GET /api/audit/search?q=`. Filters: `action`, `resourceType`, `userId`, `startDate`, `endDate`. Pagination: `page`, `limit`.
- Kingdom Charter and Vision (all authenticated for reads, KING for writes): `GET /api/charter`, `PATCH /api/charter`, `GET /api/vision`, `PATCH /api/vision`.
- Royal Secretary: `GET /api/secretary/brief` (all authenticated).
- Notices (read: all; create/delete: KING; update: KING+CROWN_PRINCE): `GET /api/notices`, `GET /api/notices/:id`, `POST /api/notices`, `PATCH /api/notices/:id`, `DELETE /api/notices/:id`.
- Matters (same RBAC as notices): `GET /api/matters`, `GET /api/matters/:id`, `POST /api/matters`, `PATCH /api/matters/:id`, `DELETE /api/matters/:id`.

RBAC is enforced server-side. `KING` has full access; `CROWN_PRINCE` can use tasks, council, reports, and memory; `MINISTER` can use tasks and reports; `SCRIBE` has read-only access to tasks, council, reports, and memory.

## Current Web Routes

Implemented pages: `/login`, `/dashboard`, `/charter`, `/vision`, `/notices`, `/matters`, `/throne-room`, `/council`, `/agents`, `/reports`, `/memory`, `/settings`, `/treasury`, `/audit`, `/profile`, `/users`, and `/security`.

Navigation is role-aware. The frontend also handles access-token refresh and clears the session when refresh fails.

## Verification

Most recent verification completed successfully:

- `npm run db:migrate`
- `npm run db:seed`
- `npm run typecheck` (both workspaces)
- `npm run test --workspace @ai-kingdom/api` (`77/77` passing)
- `npm run build` (both workspaces)

Local smoke checks confirmed King login, treasury page rendering with agent/provider/model breakdowns, UsageRecord creation on task processing, budget warning banner activation, and no console errors.

## Known Gaps

- Audit log search is full-text across `action`, `resourceType`, `resourceId`, and user email only; metadata content is not searched.
- Auth does not include SSO, OAuth, MFA, password reset, or email verification.
- AI orchestration does not include tool calling, web search, background workers, or autonomous agents.
- Memory search is keyword/tag based; no vector database is implemented.
- Staging is configured but production deployment and production observability are not yet complete.
- `estimatedCostLocal` mirrors `estimatedCostUSD` (USD only; no FX conversion).
- The Grand Vizier appears twice per session in the UsageRecord table (once as a specialist agent call, once for the final synthesis pass), so per-agent call counts reflect actual AI invocations, not council participation.
- The `Budget` model is schema-only; budget limits are stored as `Setting` keys (`DAILY_BUDGET_LIMIT_USD`, `MONTHLY_BUDGET_LIMIT_USD`). No write API for `Budget` records exists yet.
- Usage records only cover sessions processed after M10 was deployed; historical sessions have no cost data.
