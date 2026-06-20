# Next Task

## Status snapshot (2026-06-20)

- Branch `main` is clean and in sync with `origin/main`.
- Codex archive branch is fully merged (Thai i18n + "Streamline king command workflow"); `I18nProvider` is wired in `main.tsx`, the language toggle is live in `AppLayout`, and the codex branch + merge scaffolding (`merge-resolved/`, `apply-codex-merge.sh`, `MERGE_NOTES.md`) have been removed.
- `feat/external-agent-bridge` is merged: the Throne Room "Execute with external agent" bridge now runs Claude Code end-to-end, routes code work to the Royal Architect as steward, and reports the outcome back to the King as a Kingdom Memory (LESSON).
- Completed milestones through **M19** (Autonomous Kingdom Loop / background scheduler). M17E-2 (Repository Snapshot + WorkOrder Context Binding) is **complete** — the previous "in progress" note here was stale.

## M20: Mission Control Consolidation — Phase 1 (next)

Goal: turn the scattered operational pages into one read-only Mission Control command center that links to owning records, without changing lifecycle semantics or creating a duplicate data store. Grounded in `docs/KINGDOM_INFORMATION_ARCHITECTURE_AUDIT.md` (2026-06-19), which was written as preparation for exactly this work.

### Scope (Phase 1 — labels, grouping, and a read-only command surface only)

1. **Top recommended action**: surface `/api/next-actions` `topAction` at the top of Mission Control with source chips (entity type, short id/title, owning route, freshness timestamp) and a single primary action route.
2. **Nav restructure (relabel + regroup, no route renames yet)**: collapse the overlapping summaries — `/dashboard`, `/inbox`, `/kingdom/operations`, plus the summary parts of `/royal-brief` and `/living-loop` — under a single **Mission Control** group with Overview / Action Queue / Operations / Health views. Keep durable-record routes (Tasks & Councils, Work Orders, Execution, Agents, Providers & Models, Reviews & Knowledge, Projects, Strategy, Administration) as their owning groups.
3. **Source-of-truth discipline**: Mission Control only *displays* live state from `/api/mission-control`, `/api/next-actions`, and `/api/kingdom/*`. It may trigger a safe aggregator action (e.g. refresh work-order context) only where the owning route already supports it. No new lifecycle semantics, no editing of durable records on the command surface.
4. **Provenance everywhere**: every summary card carries a "Why am I seeing this?" line (from next-action `why` / Royal Brief provenance / activity-stream source) and a link to the owning record.
5. **i18n hygiene as you touch each page**: replace raw enum strings with semantic label maps (e.g. `workOrders.status.ready`), keep raw enum in tooltips/details, and verify Thai-length labels do not clip in sidebar pills, status badges, and cards. Build a per-page translation-key inventory incrementally — no global i18n migration.

### Constraints

- Read-only command center: no auto-merge, auto-deploy, auto-PR; context-binding and patch-safety gates unchanged. Any card mentioning patch safety must show `FRESH`/`STALE`/`MISSING`/`PARTIAL` and link to the owning WorkOrder/Project.
- No raw root paths or secrets in any summary.
- No Prisma schema changes expected in Phase 1; if any are added, deploy them to `ai_kingdom_test` before running root tests.
- `WorkOrdersPage` is the highest-risk multi-owner page — do not move lifecycle actions into Mission Control.

### Before shipping

- Document the external-agent-bridge milestone and M20 Phase 1 in `PROJECT_STATUS.md` (the verification baseline there still reads FOUNDATION_OPERATIONS_CENTER / 2026-06-17).
- Run root `npm run typecheck`, `npm run test`, and `npm run build` (remember `npm run test:db:prepare` first if any migration was added).

## Deferred / later phases

- M20 Phase 2: actual route renames + redirects after users adjust to the new labels.
- Full i18n migration of high-traffic pages (Dashboard, Inbox, WorkOrders, AutomationJobs, Royal Brief, Agents, Providers, Routing, Treasury).
- Strategic gaps from `PROJECT_STATUS.md` "Known Gaps": vector DB for memory/routing, tool-calling / web search for agents, production deploy + observability, local/Ollama runtime client.
