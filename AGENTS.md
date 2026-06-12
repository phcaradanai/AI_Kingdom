# Repository Guidelines

See `CLAUDE.md` for full architecture and command reference.

## Project Structure

npm workspaces monorepo: `apps/api` (Express + Prisma) and `apps/web` (React + Vite). Schema, migrations, and seeds in `apps/api/prisma`. No shared packages — API types are duplicated in `apps/api/src/types/api.ts` and `apps/web/src/types/api.ts`.

## Key Commands

- `npm run dev`: start API and Vite dev servers.
- `npm run typecheck`: TypeScript checks for all workspaces.
- `npm run test`: API test suite (Node built-in runner + `tsx`).
- `npm run db:migrate`: apply migrations and generate Prisma Client (dev only).
- `npm run db:seed`: reset seeded King account, internal agents, external agent registry metadata, provider registry metadata, default projects, and settings.
- `npm run runner:bootstrap`: create/update the local AgentRunner from `RUNNER_TOKEN` for manual runner acceptance.

Migrations create schema only. Seeds and bootstrap scripts create runtime data such as users, agents, settings, providers, projects, and the local runner row.

## Coding Style

TypeScript ES modules throughout. Keep route handlers thin — put orchestration, memory, reports, settings, and audit logic in services. Keep frontend network calls in `apps/web/src/lib/api.ts` and shared state in Zustand stores. Use `PascalCase` for React components, `camelCase` for services/utilities, `*.test.ts` for tests. Update DTO types on both sides when response shapes change.

## Testing

Tests use Node's built-in runner through `tsx`. Tests must not require a real OpenAI key — use the mock provider or stubs. For auth/RBAC changes, cover login, denied access, and session invalidation. Run `npm run typecheck` and `npm run test` before shipping backend or contract changes.

## Security & Configuration

Keep `JWT_SECRET`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and database credentials server-side only. Do not expose API keys through settings/providers APIs or frontend code. Custom AI providers must reference their API keys by environment variable name (e.g. `MY_CUSTOM_API_KEY`), rather than storing the literal secret. Use `prisma migrate deploy` for staging/production; never use `prisma migrate dev` on deployed databases.

External agent work orders are manual handoff artifacts only. Do not add backend command execution, filesystem access, or proprietary external-agent API calls without a future milestone and explicit approval.

Project routing must stay explainable. Use deterministic project name/codename/alias/keyword/source-ancestry matching until a future milestone explicitly adds embeddings. Low-confidence routing belongs in Project Inbox; do not auto-assign when confidence is weak. Artifacts and Obsidian export payloads must not store or emit secrets.

## Project Context Binding + Local Docs (M17E)

- Before manual SANDBOX_PATCH acceptance, put `RUNNER_TOKEN` in root `.env`, run `npm run runner:bootstrap`, start the API and runner with the same token, and confirm `/automation-jobs` shows `Online Runners = 1`.
- **Mandatory**: agents must check the project's context binding before planning or patching. A WorkOrder's `contextBindingStatus` must be `FRESH` before any `SANDBOX_PATCH` job is created or executed; `STALE`, `MISSING`, or `PARTIAL` context blocks patching. Use `POST /api/work-orders/:id/bind-context` (KING/CROWN_PRINCE) after a local docs scan to refresh the binding.
- **Migration rule**: every new Prisma migration must be applied to the `ai_kingdom_test` database (`npm run test:db:prepare`, or `prisma migrate deploy` with the test `DATABASE_URL`) *before* running root `npm run test`. Otherwise route tests fail with 500s from schema drift.
- **Local docs safety**: never request arbitrary filesystem paths. All local file access goes through approved `LocalDocumentRoot` records and the safe path resolver (`safePathService.ts`) — no path traversal, no symlinks outside roots, no `.env`/keys/node_modules/build output.
- **No raw secrets / no raw root paths**: binding summaries, provenance, reports, and logs must carry snapshot ids, root names, and content/path hashes only. Never store or print raw secret material or raw local root paths in public report output.

## Commits and PRs

Use clear imperative commits (e.g. `Add audit log API`). PRs should list affected areas (`api`, `web`, `prisma`, docs), verification commands, and screenshots for visible UI changes.
