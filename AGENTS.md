# Repository Guidelines

See `CLAUDE.md` for full architecture and command reference.

## Project Structure

npm workspaces monorepo: `apps/api` (Express + Prisma) and `apps/web` (React + Vite). Schema, migrations, and seeds in `apps/api/prisma`. No shared packages — API types are duplicated in `apps/api/src/types/api.ts` and `apps/web/src/types/api.ts`.

## Key Commands

- `npm run dev`: start API and Vite dev servers.
- `npm run typecheck`: TypeScript checks for all workspaces.
- `npm run test`: API test suite (Node built-in runner + `tsx`).
- `npm run db:migrate`: apply migrations and generate Prisma Client (dev only).
- `npm run db:seed`: reset seeded King account, internal agents, external agent registry metadata, provider registry metadata, and settings.

## Coding Style

TypeScript ES modules throughout. Keep route handlers thin — put orchestration, memory, reports, settings, and audit logic in services. Keep frontend network calls in `apps/web/src/lib/api.ts` and shared state in Zustand stores. Use `PascalCase` for React components, `camelCase` for services/utilities, `*.test.ts` for tests. Update DTO types on both sides when response shapes change.

## Testing

Tests use Node's built-in runner through `tsx`. Tests must not require a real OpenAI key — use the mock provider or stubs. For auth/RBAC changes, cover login, denied access, and session invalidation. Run `npm run typecheck` and `npm run test` before shipping backend or contract changes.

## Security & Configuration

Keep `JWT_SECRET`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and database credentials server-side only. Do not expose API keys through settings/providers APIs or frontend code. Use `prisma migrate deploy` for staging/production; never use `prisma migrate dev` on deployed databases.

External agent work orders are manual handoff artifacts only. Do not add backend command execution, filesystem access, or proprietary external-agent API calls without a future milestone and explicit approval.

## Commits and PRs

Use clear imperative commits (e.g. `Add audit log API`). PRs should list affected areas (`api`, `web`, `prisma`, docs), verification commands, and screenshots for visible UI changes.
