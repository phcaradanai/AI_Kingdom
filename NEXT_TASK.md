# Next Task

## M22: Mission Control i18n Foundation - Phase 2

Status: **next**
Scope: the remaining Mission Control surfaces — `KingdomOperationsPage` (`/kingdom/operations`), `RoyalBriefPage` (`/royal-brief`), `LivingLoopPage` (`/living-loop`) — plus the shared `KingdomHealthStrip` and `KingdomActivityFeed` components they render.

### Goal

Continue migrating fragile display-text translation to explicit semantic keys, reusing the `tk()` / `i18nMessages.ts` foundation and the per-page inventory established in Phase 1 (`docs/MISSION_CONTROL_I18N_KEYS.md`). No global rewrite — migrate page by page.

### Work

1. Add `kingdomOps.*`, `royalBrief.*`, and `livingLoop.*` key namespaces to `apps/web/src/lib/i18nMessages.ts` (en value === current literal), and key the shared `KingdomHealthStrip` / `KingdomActivityFeed` labels.
2. Replace static chrome with `tk()`; keep raw enum values in tooltips, never as the primary label.
3. Verify English and Thai fit cards, badges, health pills, and the mobile layout without clipping.
4. Extend the per-page inventory in `docs/MISSION_CONTROL_I18N_KEYS.md` (covered vs deferred).
5. Keep Mission Control read-only; no new mutations.

### Constraints

- No route renames or redirects.
- No backend, Prisma, WorkOrder lifecycle, runner, or autonomy changes.
- Additive only — do not modify `translateText` or the MutationObserver in `i18n.tsx`.
- Do not key server-provided prose (titles, details, summaries, agent names, display states).
- Every summary/action card must retain its owning-record link and provenance.

### Acceptance

- The three pages + shared health/activity components render equivalent English and Thai from semantic keys.
- Risk/state/severity/health badges retain raw enum tooltips and readable translated labels.
- Existing source links, `?focus=<workOrderId>` behavior, filters, and lifecycle actions continue to work.
- Focused page tests cover English/Thai labels and source links (reset `localStorage` per test).
- `npm run typecheck`, `npm run test --workspace @ai-kingdom/web`, and `npm run build` pass.

### Implementation Baseline

- M22 Phase 1 complete: `tk()` + `useTk()` in `apps/web/src/lib/i18n.tsx`, keys in `apps/web/src/lib/i18nMessages.ts`, Dashboard + Inbox migrated, inventory in `docs/MISSION_CONTROL_I18N_KEYS.md`.
- Latest web suite: 136/136 passing; web typecheck/build passing.
