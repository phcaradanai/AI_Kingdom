# Next Task

## Premium UX Wave 3C: Strategy Ledger

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Turn `/strategy` into a focused strategic decision workspace. The King should understand current objectives, opportunities, assets, revenue evidence, ownership, and the next safe strategic action without scanning multiple always-open forms.

### Scope

- Compact strategic overview with meaningful counts, attention state, and source ownership.
- Clear Objectives, Opportunities, Assets, and Revenue views using a stable section index or tabs.
- Search/filter/list hierarchy where collections are large enough to require it.
- Explicit create/edit dialogs or drawers instead of persistent forms.
- Direct links to owning Project, Artifact, Report, Task, or other source records where current contracts provide identifiers.
- Semantic English/Thai keys for static chrome; strategic titles, descriptions, identifiers, and server-provided reasoning remain source data.

### Constraints

- No backend, Prisma, strategy intake, lifecycle, scoring, RBAC, project ownership, or source-link contract changes.
- Do not create a second strategic source of truth. Summary surfaces remain computed/read-only and link back to owning records.
- Required decisions and evidence remain in normal document flow, not a carousel.
- Avoid nested cards, simultaneous creation forms, horizontal overflow, and controls below 44px on mobile.
- Split route orchestration, controller hooks, pure models, collection views, detail views, and dialogs. Keep files below 600 lines where practical.

### Delivery Order

1. Capture `/strategy` baselines at 1440px, 1024px, and 430px in English and Thai.
2. Map current strategy APIs, mutations, ownership links, and RBAC before changing composition.
3. Add focused tests for strategic hierarchy, source ownership, explicit mutation dialogs, and mobile-safe rendering.
4. Refine the page into overview plus focused Objectives, Opportunities, Assets, and Revenue views.
5. Run web typecheck, full web tests, production build, reduced-motion checks, and responsive screenshots.

### Acceptance

- The King can identify strategic priorities and open the owning source without scanning unrelated forms.
- Objectives, opportunities, assets, and revenue evidence have distinct, predictable views.
- Mutations are explicit and role-gated; existing APIs and lifecycle behavior remain unchanged.
- English and Thai labels do not overlap, clip, or widen the page.
- Focused tests pass, followed by web typecheck, the full web suite, and production build.

### Baseline

- Premium UX Waves 1, 2, 3A, and 3B are complete.
- Current frontend: 39 routes (38 authenticated plus `/login`).
- Latest web validation: 173/173 tests, web typecheck, and production build pass; the existing >500 kB chunk warning remains.
- Wave 3B live checks pass at 1440x900, 1024x768, and 430x932 in English/Thai with no horizontal overflow or console errors.
