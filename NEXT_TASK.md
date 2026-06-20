# Next Task

## Status snapshot (2026-06-20)

- Local branches `codex/main` and `main` point to the same reviewed commit; `origin/main` remains behind until an explicit push.
- Codex archive branch is fully merged (Thai i18n + "Streamline king command workflow"); `I18nProvider` is wired in `main.tsx`, the language toggle is live in `AppLayout`, and the codex branch + merge scaffolding (`merge-resolved/`, `apply-codex-merge.sh`, `MERGE_NOTES.md`) have been removed.
- `feat/external-agent-bridge` is merged: the Throne Room "Execute with external agent" bridge now runs Claude Code end-to-end, routes code work to the Royal Architect as steward, and reports the outcome back to the King as a Kingdom Memory (LESSON).
- Completed milestones through **M19** (Autonomous Kingdom Loop / background scheduler). M17E-2 (Repository Snapshot + WorkOrder Context Binding) is **complete** — the previous "in progress" note here was stale.
- **M20 Phase 1 Mission Control consolidation is done** (2026-06-20): the five overlapping summary surfaces (`/dashboard`, `/inbox`, `/kingdom/operations`, `/royal-brief`, `/living-loop`) now live in one **Mission Control** nav group; the previously orphaned `/royal-brief` is reachable again; remaining routes regrouped into Command / Work / Knowledge / Agents & Models / System. Inbox and Kingdom Operations cards now show explicit "Why am I seeing this?" explanations, reusable provenance rows, semantic state labels, and links back to owning records. See PROJECT_STATUS.md "M20 Phase 1".
- **M21 Auto Context Repair is complete** (2026-06-20, Priority 6): new opt-in Living Loop stage `autoRepairContext` auto-rebinds MISSING/STALE WorkOrder context (read-only scan + rebind, scan deduped per project per tick) so the King no longer has to click "Refresh Context". Gated by `LIVING_LOOP_AUTO_CONTEXT_REPAIR` (default off), throttled by daily cap + per-WO cooldown (keyed on the repair audit entry, not `contextBoundAt`). Opt-in via `npm run autonomy:enable -- --with-context-repair`; deliberately **not** in the default chain because it removes the FRESH-context gate before auto-patch. The Living Loop and Dashboard now surface enabled state, daily usage, limits, cooldown, and repairs from the latest run with links back to the owning Living Loop page. See PROJECT_STATUS.md "M21".

## M20: Mission Control Consolidation — what was done vs. what remains

Goal: turn the scattered operational pages into one read-only Mission Control command center that links to owning records, without changing lifecycle semantics or creating a duplicate data store. Grounded in `docs/KINGDOM_INFORMATION_ARCHITECTURE_AUDIT.md` (2026-06-19).

### Phase 1 status

1. ✅ **Top recommended action** — already shipped: `DashboardPage` ("Mission Control") renders `/api/mission-control` `topAction` with source chips and `ProvenanceLinks`.
2. ✅ **Nav restructure (relabel + regroup, no route renames)** — done in `AppLayout.tsx`: Mission Control group (Overview / Action Queue / Operations / Royal Brief / Living Loop) + owning groups. No route renames.
3. ✅ **Source-of-truth discipline** — Mission Control surface remains read-only; it only displays `/api/mission-control`, `/api/next-actions`, `/api/kingdom/*` and triggers only the already-supported safe context-refresh action.
4. ✅ **Provenance everywhere** — Dashboard, Inbox, agent presence, current operations, and activity cards now show explicit reasons plus source/actor/time provenance. WorkOrder links focus the owning record with `?focus=<id>`; other entities link to their owning page without inventing unsupported detail routes.
5. ✅ **i18n hygiene on touched pages** — Inbox risk/state badges and Operations presence/activity badges use semantic labels while retaining raw enums in tooltips. Long state labels can wrap inside bounded pills. Full translation-key migration remains deferred.

### Constraints

- Read-only command center: no auto-merge, auto-deploy, auto-PR; context-binding and patch-safety gates unchanged. Any card mentioning patch safety must show `FRESH`/`STALE`/`MISSING`/`PARTIAL` and link to the owning WorkOrder/Project.
- No raw root paths or secrets in any summary.
- No Prisma schema changes expected in Phase 1; if any are added, deploy them to `ai_kingdom_test` before running root tests.
- `WorkOrdersPage` is the highest-risk multi-owner page — do not move lifecycle actions into Mission Control.

### Next recommended work

- Start the high-traffic-page i18n inventory with Dashboard, Inbox, Work Orders, Automation Jobs, and Royal Brief; migrate exact semantic keys page by page rather than expanding the DOM text-patching dictionary globally.
- Keep M20 Phase 2 route renames and redirects deferred until the new Mission Control labels have had an adoption period.

## Deferred / later phases

- M20 Phase 2: actual route renames + redirects after users adjust to the new labels.
- Full i18n migration of high-traffic pages (Dashboard, Inbox, WorkOrders, AutomationJobs, Royal Brief, Agents, Providers, Routing, Treasury).
- Strategic gaps from `PROJECT_STATUS.md` "Known Gaps": vector DB for memory/routing, tool-calling / web search for agents, production deploy + observability, local/Ollama runtime client.
