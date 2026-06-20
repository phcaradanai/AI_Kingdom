# Next Task

## M22: Mission Control i18n Foundation - Phase 1

Status: **next**
Scope: `DashboardPage`, `InboxPage`, and the shared status/provenance components they use.

### Goal

Replace fragile display-text translation on the two highest-traffic Mission Control pages with explicit semantic translation keys while preserving existing routes, API contracts, source links, and lifecycle behavior.

### Work

1. Introduce semantic keys for page titles, section labels, actions, empty/error states, risk/state labels, and provenance labels used by Dashboard and Inbox.
2. Keep raw enum values available in tooltips or technical detail, but never use raw enums as the primary user-facing label.
3. Verify English and Thai text fit cards, badges, buttons, filters, and the mobile layout without clipping or overlap.
4. Add a small per-page translation-key inventory so later pages can migrate incrementally without a global rewrite.
5. Keep Mission Control read-only; the existing safe WorkOrder context-refresh action remains the only mutation on Inbox.

### Constraints

- No route renames or redirects in this phase.
- No backend, Prisma, WorkOrder lifecycle, runner, or autonomy changes.
- Do not create a duplicate Mission Control data store.
- Every summary/action card must retain its owning-record link and provenance.
- Do not expose raw root paths, credentials, or secret material.

### Acceptance

- Dashboard and Inbox render equivalent English and Thai content from semantic keys.
- Risk/state badges retain raw enum tooltips and readable translated labels.
- Existing source links, `?focus=<workOrderId>` behavior, filters, and context refresh continue to work.
- Focused page tests cover English/Thai labels and source links.
- `npm run typecheck`, `npm run test --workspace @ai-kingdom/web`, and `npm run build` pass.

### Implementation Baseline

- `codex/main` and local `main`: `b6ce344`.
- `origin/main`: `9e0590a` (not pushed by Codex).
- Latest web suite: 132/132 passing; root typecheck/lint/build passing.
