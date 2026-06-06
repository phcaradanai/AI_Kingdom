# AI Kingdom Web MVP

A production-minded MVP for a fictional digital kingdom where the user acts as King and issues royal commands to a council of specialized AI agents.

## Stack

- React + Vite + TypeScript
- TailwindCSS with shadcn-style local components
- Zustand state
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- JWT email/password auth
- OpenAI-compatible provider abstraction

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`.

Seeded login:

```text
king@aikingdom.local
password123
```

## AI Provider

The app defaults to the mock provider so local development works without an API key:

```env
AI_PROVIDER=mock
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS=700
```

To enable an OpenAI-compatible provider:

```env
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS=700
```

If the OpenAI-compatible provider fails, times out, or returns an empty response, the orchestrator falls back to deterministic mock counsel and stores a fallback notice on the council session.

## Auth, Roles, and Security

Authentication uses bcrypt password hashes, short-lived JWT access tokens, and server-stored refresh token sessions. Login returns an access token and refresh token; logout revokes the active refresh session so the access token can no longer be used.

Roles:

- `KING`: full access to agents, settings, users, tasks, council, reports, and memory.
- `CROWN_PRINCE`: tasks, council, reports, and memory.
- `MINISTER`: tasks and reports.
- `SCRIBE`: read-only access to tasks, council, reports, and memory.

JWT configuration:

```env
JWT_SECRET=replace-with-at-least-32-random-characters
```

In production, the API refuses the default JWT secret. Keep `OPENAI_API_KEY`, `JWT_SECRET`, and database credentials server-side only. User management is available at `/users` for Kings only; the seeded King account can create additional users with strong passwords.

Audit logs are written for login, logout, user creation/deactivation, settings changes, agent changes, and memory deletion.

## Core Flow

1. Log in as the King.
2. Open the Throne Room.
3. Choose a command mode: Ask, Plan, Research, or Build.
4. Submit a royal command.
5. Send the decree to the Grand Vizier.
6. Review council responses, memory usage, auto-saved memories, and the final Grand Vizier summary.

M4 routes council responses through an AI provider abstraction. The mock provider remains the default; the OpenAI-compatible provider can be enabled with `.env`.

## Royal Treasury

Every AI call records a `UsageRecord` with token counts and an estimated USD cost. The `/treasury` page (KING only) shows:

- Spend today / this month / all time and token totals
- Cost and call count broken down by agent
- Cost broken down by provider and model
- Daily cost chart for the last 30 days
- Budget warning banner when a spending limit is reached

Budget limits are set in `/settings`:

- `DAILY_BUDGET_LIMIT_USD` — daily cap in USD (empty = no limit)
- `MONTHLY_BUDGET_LIMIT_USD` — monthly cap in USD (empty = no limit)

### Pricing Table

Cost is estimated from a static table in `apps/api/src/pricing/providerPricing.ts` (USD per 1M tokens):

| Provider | Model | Input | Output |
|----------|-------|------:|------:|
| mock | deterministic-mock-v1 | $0.00 | $0.00 |
| openai | gpt-4o | $2.50 | $10.00 |
| openai | gpt-4o-mini | $0.15 | $0.60 |
| openai | gpt-4-turbo | $10.00 | $30.00 |
| openai | gpt-4 | $30.00 | $60.00 |
| openai | gpt-3.5-turbo | $0.50 | $1.50 |

Unknown models default to $0.00 with a server-side warning. Token counts for the mock provider are estimated from string length (`Math.ceil(chars / 4)`). Token counts for the OpenAI provider come directly from the API response.

## Manual Verification

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Then:

1. Open `http://localhost:5173`.
2. Log in with `king@aikingdom.local` / `password123`.
3. Open `/throne-room`.
4. Select a mode.
5. Submit a non-empty royal command.
6. Confirm the new task appears in Recent decrees with a `PENDING` badge.
7. Click `Send to Grand Vizier`.
8. Confirm the status becomes `COMPLETED` and a final summary appears.
9. Open `/council`.
10. Confirm the council session lists selected agents, agent responses, provider/model metadata, and the final Grand Vizier report.
11. Confirm the council session links to a generated Royal Report.
12. Open `/reports`.
13. Search the generated report and review its detail view.
14. Open `/memory`.
15. Search, create, edit, or delete a Kingdom Memory.
16. Open `/users` as the King and create a Scribe or Minister.
17. Log out, log in as the new user, and confirm unauthorized pages are hidden.
18. Open `/profile` and `/security` to confirm the role badge and session controls.

## Kingdom Memory

Memory types:

- `DECISION`
- `FACT`
- `PREFERENCE`
- `CONSTRAINT`
- `PROJECT_NOTE`
- `LESSON`

Memory importance levels are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`.

Memories can be created manually from `/memory`. After a council session completes, the backend extracts 1-5 concise memory candidates from the final summary and agent responses, skips likely duplicates, and avoids obvious secrets such as API keys, passwords, tokens, or secrets.

Before the Grand Vizier processes a decree, the backend loads up to 5 relevant memories by keyword/tag match and injects them as Kingdom Memory Context for the council. The Throne Room and Council pages show how many memories were consulted and how many were auto-saved.

If a bad memory is saved, open `/memory`, search or filter for it, then use `Delete`.

## Royal Reports

Report categories:

- `STRATEGY`
- `RESEARCH`
- `ARCHITECTURE`
- `FINANCE`
- `GENERAL`
- `OTHER`

Report importance levels are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`.

After a council session completes, the backend generates one Royal Report from the source decree, selected agents, agent responses, final Grand Vizier summary, and any Kingdom Memories consulted. Duplicate reports for the same council session are skipped.

Use `/reports` to search, filter by category or importance, inspect source task/session links, edit report metadata/content, or delete an incorrect report. Use `/council` to review Council Records and confirm each completed session links back to its generated report.

## Useful Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test
npm run db:migrate
npm run db:seed
```

## Staging Deployment

M8 adds a Coolify-friendly staging deployment using `docker-compose.staging.yml`.

Local staging smoke test:

```bash
cp .env.staging.example .env.staging
# Fill POSTGRES_PASSWORD, DATABASE_URL, JWT_SECRET, CORS_ALLOWED_ORIGINS, APP_PUBLIC_URL, VITE_API_BASE_URL
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
```

Staging services:

- `postgres`: internal-only PostgreSQL, persistent `postgres-data` volume, healthcheck enabled.
- `backend`: Express API on internal port `4000`; runs `prisma generate`, `prisma migrate deploy`, and safe seed-if-empty at startup.
- `frontend`: Nginx static Vite build on internal port `80`.
- `redis`: placeholder only, commented out.

Required Coolify env vars:

- `POSTGRES_DB=ai_kingdom`
- `POSTGRES_USER=ai_kingdom`
- `POSTGRES_PASSWORD`
- `DATABASE_URL=postgresql://ai_kingdom:<password>@postgres:5432/ai_kingdom?schema=public`
- `JWT_SECRET`
- `APP_PUBLIC_URL`
- `CORS_ALLOWED_ORIGINS`
- `VITE_API_BASE_URL`
- `AI_PROVIDER`, `OPENAI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`
- `OPENAI_API_KEY` only when `AI_PROVIDER=openai`

Do not expose the PostgreSQL port publicly. In Coolify, attach a persistent volume to the `postgres-data` volume. Configure frontend and backend domains separately, enable HTTPS in Coolify, and set `CORS_ALLOWED_ORIGINS` to the exact frontend HTTPS origin.

Prisma staging migration command:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec backend npx prisma migrate deploy
```

The backend startup already runs `migrate deploy`; never use `prisma migrate dev` against staging.

Health checks:

```bash
curl https://api.example.com/health
curl https://api.example.com/health/db
```

Logs to check in Coolify:

- `postgres`: healthcheck and startup logs.
- `backend`: Prisma generate, migrate deploy, seed-if-empty, API startup.
- `frontend`: Nginx startup and static serving logs.

## Backup / Restore

Backups use `pg_dump` and require `DATABASE_URL`; passwords must come from the environment.

```bash
DATABASE_URL="postgresql://..." scripts/backup-postgres.sh
```

Restore from a timestamped dump:

```bash
DATABASE_URL="postgresql://..." scripts/restore-postgres.sh backups/ai-kingdom-YYYYMMDD-HHMMSS.dump
```

Restores are destructive to matching objects. Take a fresh backup before restoring.

## Staging Verification Checklist

1. `docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build`
2. Confirm `postgres` is healthy.
3. Open `/health` and `/health/db` on the backend domain.
4. Confirm Prisma migrations are applied with `npx prisma migrate status`.
5. Open the frontend domain.
6. Log in.
7. Create a task.
8. Process council.
9. Confirm memory saves.
10. Confirm report generates.
11. Edit an agent, restart services, and confirm the agent config persists.

## Agent Configuration

Use `/agents` to create, edit, activate, deactivate, or soft-delete royal agents. Safe fields to edit:

- `name`, `title`, `role`, `specialty`, and `description`
- `systemPrompt`, `skills`, and `responseStyle`
- `priority`
- optional `defaultModel`, `temperature`, and `maxTokens`

The Grand Vizier is required for orchestration and cannot be deleted or deactivated from the API. Other agents are soft-deleted by setting `isActive=false`.

## System Settings

Use `/settings` to edit safe runtime settings:

- `AI_PROVIDER`: `mock` or `openai`
- `OPENAI_MODEL`
- `AI_TIMEOUT_MS`
- `AI_MAX_TOKENS`
- `DEFAULT_TASK_MODE`
- `AUTO_PROCESS_TASKS`
- `AUTO_SAVE_MEMORY`
- `AUTO_GENERATE_REPORTS`

Settings affect orchestration immediately. `AUTO_SAVE_MEMORY=false` skips auto memory extraction. `AUTO_GENERATE_REPORTS=false` skips Royal Report generation. `AUTO_PROCESS_TASKS=true` processes newly submitted decrees immediately.

Do not configure API keys in the UI. `OPENAI_API_KEY` remains server-only in `.env` and is never returned by the settings API.

To reset seeded agents and default settings:

```bash
npm run db:seed
```
# AI_Kingdom
