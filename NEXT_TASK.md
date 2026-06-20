# Next Task

## M22: Premium UX Foundation + Mission Control - Phase 2

Status: **in progress**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Establish the shared visual foundation and apply it to the five Mission Control surfaces before refining the remaining pages. The result should be balanced, restrained, responsive, and consistent in English and Thai while preserving all source-of-truth links and lifecycle behavior.

### Scope

- App shell: desktop navigation hierarchy, mobile drawer, content-width variants, and stable page spacing.
- Shared primitives: responsive `PageHeader`, restrained panel/section hierarchy, metric strip, toolbar, status display maps, and common states.
- Mission Control pages: `/dashboard`, `/inbox`, `/kingdom/operations`, `/royal-brief`, and `/living-loop`.
- Shared Mission Control components: `KingdomHealthStrip`, `KingdomActivityFeed`, provenance, and status badges.
- Complete the semantic i18n work previously planned for Operations, Royal Brief, Living Loop, health, and activity labels.

### Constraints

- No route rename, redirect, backend, Prisma, WorkOrder lifecycle, runner, or autonomy changes.
- Mission Control remains read-only and links to owning records.
- Preserve the Inbox WorkOrder context-refresh action and all existing `?focus=` behavior.
- Do not modify server-provided prose or remove raw enum audit evidence.
- Avoid nested cards, radius above 8px for panels, decorative gradient/orb effects, and mobile all-route pill navigation.
- Add shared abstractions only when the first migrated page proves the need.

### Delivery Order

1. Completed: capture current desktop/mobile baselines and establish the Wave 1 layout contract.
2. Completed: refine the app shell and shared page primitives.
3. Completed: refine Dashboard and Inbox using the new foundation without regressing M22 Phase 1 i18n.
4. Completed: refine Operations, Royal Brief, and Living Loop visual hierarchy without changing their behavior or source ownership.
5. Complete the remaining semantic keys, then verify all five pages in English and Thai at desktop, tablet, and mobile sizes.

### Acceptance

- Mission Control pages share one spacing, typography, panel, toolbar, metric, and responsive system.
- Desktop alignment is symmetric and mobile navigation uses a proper drawer.
- Thai and English labels do not overlap, clip, or resize fixed controls.
- Source links, provenance, filters, `?focus=` behavior, status tooltips, and lifecycle actions remain intact.
- Focused page tests cover both languages and critical source links.
- `npm run typecheck`, `npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web` pass.

### Baseline

- Runtime baseline: `7d566c9` (M22 Phase 1 merged to `main`).
- Web app responds at `http://127.0.0.1:5174`; API health responds at `http://127.0.0.1:4000/health` in the current local session.
- Latest recorded web suite: 136/136 passing; web typecheck/build passing.
- Full route plan: 38 routes across six implementation waves in `docs/UX_UI_REFINEMENT_PLAN.md`.
- Wave 1A validation: root typecheck passed; web suite 138/138 passed; web production build passed with the existing >500 kB chunk warning.
- Wave 1B visual validation: root typecheck, 138/138 web tests, and web production build pass; rendered checks cover all three pages in Thai at desktop/mobile and English at desktop. The existing >500 kB bundle warning remains.
