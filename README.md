# AI Kingdom Web MVP

A production-minded MVP for a fictional digital kingdom where the user acts as King and issues royal commands to a council of specialized AI agents.

## Stack

- React + Vite + TypeScript
- TailwindCSS with shadcn-style local components
- Zustand state
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- JWT email/password auth
- Provider-agnostic AI registry with OpenAI-compatible routing

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

## AI Provider Registry and Routing

The app defaults to the mock provider so local development works without an API key. Provider metadata is stored in the `AIProvider` registry, while credentials stay server-side in environment variables.

```env
AI_PROVIDER=mock
AI_COST_MODE=balanced
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS=700
```

Supported runtime providers today:

- `mock`
- `openai`
- `openrouter`
- `deepseek`
- `openai-compatible`

Anthropic, Gemini, and local/Ollama provider metadata is prepared for future runtime support.

Server-side credential env vars:

```env
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
```

Routing order:

1. Agent override: `preferredProviderId`, `defaultModel`, `fallbackProviderIds`, and `costPreference`.
2. Task mode policy: ASK, PLAN, RESEARCH, and BUILD prefer different provider chains.
3. Cost mode: `AI_COST_MODE=low|balanced|quality`.
4. Fallback chain: default `deepseek -> openrouter -> openai -> mock`.

If a selected provider fails, times out, or returns an empty response, the orchestrator tries the next provider in the fallback chain. The council session stores a fallback notice such as `deepseek failed: timeout. Fallback used: openrouter.`

Use `/providers` or the provider status list in `/settings` to activate/deactivate providers, set default models, priority, and cost tier. API keys are never editable or visible in the frontend.

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

M12.5 routes council responses through the provider registry. The mock provider remains the default; OpenAI, OpenRouter, DeepSeek, and generic OpenAI-compatible endpoints can be enabled with server-side env vars.

## Royal Treasury

Every AI call records a `UsageRecord` with provider, providerId, model, token counts, and an estimated USD cost. The `/treasury` page (KING only) shows:

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
| openrouter | openai/gpt-4o-mini | $0.15 | $0.60 |
| deepseek | deepseek-chat | $0.27 | $1.10 |
| deepseek | deepseek-coder | $0.27 | $1.10 |

Unknown models default to $0.00 with a server-side warning. Token counts for the mock provider are estimated from string length (`Math.ceil(chars / 4)`). Token counts for OpenAI-compatible providers come directly from the API response when provided.

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

## External Agent Bridge

M13 adds manual handoff support for external app agents such as Claude Code, Codex, Cline, Kilo, Antigravity, Hermes, OpenCode, and custom executors. These agents are execution workers only. AI Kingdom remains the source of truth for objective, scope, constraints, acceptance criteria, and status.

Lifecycle:

1. Matter or Task
2. Work Order
3. Work Session
4. Implementation Report
5. Handoff Brief
6. Memory / Report / Next Task update

Use `/external-agents` to view seeded manual handoff targets. Kings can create, edit, activate, or deactivate records. Seeded targets include Claude Code, Codex, Cline, Kilo, Antigravity, and Hermes. All M13 execution modes are manual copy-paste; the backend does not call external agent APIs.

Use `/work-orders` to:

- Create a work order manually
- Generate a work order from a task ID or matter ID
- Assign an external agent
- Generate a copy-paste prompt
- Submit an implementation report
- Generate and copy a handoff brief

Generated prompts include Kingdom Charter, Kingdom Vision, project status, architecture summary, objective, scope, constraints, acceptance criteria, validation commands, and safety rules. They also instruct external agents:

- Do not delete unrelated files.
- Do not rewrite architecture without approval.
- Do not expose secrets.
- Run validation commands if possible.
- Report failures honestly.

Required final response format for external agents:

1. Summary
2. Files changed
3. Commands run
4. Tests run
5. Test result
6. Decisions made
7. Issues found
8. Remaining work
9. Recommended next step

Implementation reports can create concise decision memories when decisions are provided. Huge raw outputs and secrets are not saved as memories. Completing a work order creates a Royal Report summary when the work order has a user owner.

## Project Workspace

M14 makes the Kingdom project-aware. A project is a long-running asset or initiative such as AI Kingdom, Godot Tower Defense, Admin Dashboard Boilerplate, E-commerce Inventory Boilerplate, or Backend Go Services. Tasks, matters, notices, council sessions, reports, memories, work orders, implementation reports, handoff briefs, and artifacts can all link to a project, but the link is optional so unassigned work remains valid.

Seeded projects are idempotent and created by `npm run db:seed` or the `/projects` API when needed.

Use `/projects` to:

- Search projects by name, alias, or keyword
- Create or edit project metadata
- Set status, priority, goals, keywords, aliases, repository URL, local path, and active milestone
- Open a project workspace at `/projects/:id`

Use `/projects/:id` to review linked tasks, matters, work orders, reports, memories, artifacts, recent decisions, active milestone, and project counts.

### Royal Secretary Project Routing

When a task, matter, notice, or work order is created without a project, the Royal Secretary classifies it using deterministic matching:

- Project name and codename
- Aliases
- Keywords
- Existing source ancestry, such as a work order generated from a project-linked task

Confidence behavior:

- `>= 80`: auto-assign to the project and record a confirmed routing candidate.
- `50-79`: create a suggested routing candidate and place the item in Project Inbox.
- `< 50`: place the item in Project Inbox and leave the source unassigned.

Every decision includes a reason, for example: `Matched AI Kingdom because keyword 'provider', keyword 'agent', keyword 'work order'.`

Use `/project-inbox` to review low-confidence items, assign them to a project, or dismiss them. The router does not use embeddings or a vector database yet, and it does not run autonomous background workers.

### Artifact Vault and Obsidian Export

Artifacts are reusable project knowledge objects. Supported types:

- `PROMPT`
- `SPEC`
- `DECISION`
- `IMPLEMENTATION_REPORT`
- `HANDOFF_BRIEF`
- `ARCHITECTURE_NOTE`
- `MARKET_RESEARCH`
- `CODE_PLAN`
- `ROYAL_DECREE`
- `GENERAL_NOTE`

Use `/artifacts` to create, filter, edit, and read markdown content linked to a project. Artifact creation rejects obvious secrets, and exports redact token/API-key-like values.

Project export v1 returns an Obsidian-friendly JSON payload rather than writing files automatically. The payload contains `index.md`, `project-status.md`, `architecture.md`, `decisions.md`, `reports.md`, `work-orders.md`, `memories.md`, and `artifacts.md`, with wikilinks such as `[[project-status]]`.

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
- `AI_PROVIDER`, `AI_COST_MODE`, `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`
- `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` only when those providers are used

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
- optional `preferredProviderId`, `defaultModel`, `fallbackProviderIds`, `costPreference`, `temperature`, and `maxTokens`

If an agent has no provider override, the routing policy selects a provider from task mode and cost mode. To add a new OpenAI-compatible provider, add its public registry metadata in `apps/api/src/services/aiProviderRegistry.ts`, create a runtime config in `apps/api/src/ai/providerFactory.ts`, keep its credentials in env, and add pricing in `apps/api/src/pricing/providerPricing.ts` if known.

The Grand Vizier is required for orchestration and cannot be deleted or deactivated from the API. Other agents are soft-deleted by setting `isActive=false`.

## System Settings

Use `/settings` to edit safe runtime settings:

- `AI_PROVIDER`: legacy default provider hint (`mock`, `openai-compatible`, `openai`, `openrouter`, or `deepseek`)
- `AI_COST_MODE`: `low`, `balanced`, or `quality`
- `OPENAI_MODEL`
- `AI_TIMEOUT_MS`
- `AI_MAX_TOKENS`
- `DEFAULT_TASK_MODE`
- `AUTO_PROCESS_TASKS`
- `AUTO_SAVE_MEMORY`
- `AUTO_GENERATE_REPORTS`

Settings affect orchestration immediately. `AUTO_SAVE_MEMORY=false` skips auto memory extraction. `AUTO_GENERATE_REPORTS=false` skips Royal Report generation. `AUTO_PROCESS_TASKS=true` processes newly submitted decrees immediately.

Do not configure API keys in the UI. Provider API keys remain server-only in `.env` and are never returned by the settings or providers APIs.

To reset seeded agents and default settings:

```bash
npm run db:seed
```
# AI_Kingdom
