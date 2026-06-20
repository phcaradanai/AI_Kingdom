# Next Task

## Status snapshot (2026-06-20)

- Branch `main` is clean and in sync with `origin/main`.
- Codex archive branch is fully merged (Thai i18n + "Streamline king command workflow"); `I18nProvider` is wired in `main.tsx`, the language toggle is live in `AppLayout`, and the codex branch + merge scaffolding (`merge-resolved/`, `apply-codex-merge.sh`, `MERGE_NOTES.md`) have been removed.
- `feat/external-agent-bridge` is merged: the Throne Room "Execute with external agent" bridge now runs Claude Code end-to-end, routes code work to the Royal Architect as steward, and reports the outcome back to the King as a Kingdom Memory (LESSON).
- Completed milestones through **M19** (Autonomous Kingdom Loop / background scheduler). M17E-2 (Repository Snapshot + WorkOrder Context Binding) is **complete** — the previous "in progress" note here was stale.
- **M20 Phase 1 nav consolidation is done** (2026-06-20): the five overlapping summary surfaces (`/dashboard`, `/inbox`, `/kingdom/operations`, `/royal-brief`, `/living-loop`) now live in one **Mission Control** nav group; the previously orphaned `/royal-brief` is reachable again; remaining routes regrouped into Command / Work / Knowledge / Agents & Models / System. Verified green (web typecheck + 129 tests + build). See PROJECT_STATUS.md "M20 Phase 1".
- **M21 Auto Context Repair is complete** (2026-06-20, Priority 6): new opt-in Living Loop stage `autoRepairContext` auto-rebinds MISSING/STALE WorkOrder context (read-only scan + rebind, scan deduped per project per tick) so the King no longer has to click "Refresh Context". Gated by `LIVING_LOOP_AUTO_CONTEXT_REPAIR` (default off), throttled by daily cap + per-WO cooldown (keyed on the repair audit entry, not `contextBoundAt`). Opt-in via `npm run autonomy:enable -- --with-context-repair`; deliberately **not** in the default chain because it removes the FRESH-context gate before auto-patch. The Living Loop and Dashboard now surface enabled state, daily usage, limits, cooldown, and repairs from the latest run with links back to the owning Living Loop page. See PROJECT_STATUS.md "M21".

## M20: Mission Control Consolidation — what was done vs. what remains

Goal: turn the scattered operational pages into one read-only Mission Control command center that links to owning records, without changing lifecycle semantics or creating a duplicate data store. Grounded in `docs/KINGDOM_INFORMATION_ARCHITECTURE_AUDIT.md` (2026-06-19).

### Phase 1 status

1. ✅ **Top recommended action** — already shipped: `DashboardPage` ("Mission Control") renders `/api/mission-control` `topAction` with source chips and `ProvenanceLinks`.
2. ✅ **Nav restructure (relabel + regroup, no route renames)** — done in `AppLayout.tsx`: Mission Control group (Overview / Action Queue / Operations / Royal Brief / Living Loop) + owning groups. No route renames.
3. ✅ **Source-of-truth discipline** — Mission Control surface remains read-only; it only displays `/api/mission-control`, `/api/next-actions`, `/api/kingdom/*` and triggers only the already-supported safe context-refresh action.
4. ◻️ **Provenance everywhere (next)** — Dashboard cards already carry provenance; add the same "Why am I seeing this?" line + owning-record link discipline to the standalone `InboxPage` and `KingdomOperationsPage` cards where it is not yet uniform.
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
