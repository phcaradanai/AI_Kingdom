# Next Task

## Premium UX Wave 2: Command-to-Execution Lifecycle

Status: **planned**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Apply the premium visual and interaction system to the command-to-execution lifecycle so the King can issue intent, inspect council evidence, track executable work, review runner results, and read reports without losing source ownership or approval boundaries.

Wave 1 Mission Control foundation and semantic English/Thai migration are complete. Wave 2 must apply purposeful motion, controlled depth, richer color/shape hierarchy, micro-interactions, consistent overlays, Lucide iconography, disciplined typography/spacing, and breakpoint-specific responsive composition.

### Scope

- `/throne-room`: decree-first command surface with advanced controls secondary.
- `/council`: master-detail archive for sessions, role responses, evidence, and reports.
- `/work-orders`: queue, focused detail, context/safety, handoff, and execution summary hierarchy.
- `/automation-jobs`: execution queue plus runner, validation, patch, and review detail.
- `/reports`: searchable archive with document list, reading pane, and provenance.
- Shared lifecycle patterns: status timeline, source links, detail rail, action boundary, responsive filter drawer, and accessible feedback states.

### Constraints

- No route rename, redirect, backend, Prisma, WorkOrder lifecycle, runner, or autonomy changes.
- Preserve Task, CouncilSession, WorkOrder, AutomationJob, AgentReviewSummary, and Report source ownership.
- Preserve all existing `?focus=` behavior, APIs, RBAC, context binding, runner policies, and lifecycle transitions.
- Do not modify server-provided prose or remove raw enum audit evidence.
- Avoid nested cards, radius above 8px for panels, decorative gradient/orb effects, and mobile all-route pill navigation.
- Do not put required decisions, queues, reports, audit evidence, or source links inside carousels. Carousels remain optional and bounded.
- Respect reduced motion, keyboard interaction, accessible overlay focus, 44px mobile touch targets, and the shared z-index scale.
- Add shared abstractions only when the first migrated page proves the need.

### Delivery Order

1. Capture desktop/tablet/mobile baselines for all five routes and write the Wave 2 layout contract.
2. Refine `/throne-room` and `/council` as command and evidence surfaces without duplicating ownership.
3. Refine `/work-orders` while preserving context gates and safe/blocked action semantics.
4. Refine `/automation-jobs` with a persistent King approval boundary.
5. Refine `/reports`, then verify the full command-to-execution path in English and Thai.

### Acceptance

- The five pages share one lifecycle hierarchy, spacing, typography, panel, toolbar, status, and responsive system.
- The King can identify the owning record, current state, next safe action, actor, and report trail without scanning duplicate summaries.
- Thai and English labels do not overlap, clip, or resize fixed controls.
- Motion and micro-interactions provide state feedback without replaying during routine refreshes, and reduced-motion mode remains fully usable.
- Drawers, dialogs, tooltips, sticky regions, and responsive view changes preserve focus, provenance, and source navigation.
- Source links, provenance, filters, `?focus=` behavior, status tooltips, context gates, and lifecycle actions remain intact.
- Focused page tests cover both languages and critical source links.
- `npm run typecheck`, `npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web` pass.

### Baseline

- Runtime baseline: Wave 1 completion commit on `codex/main`/local `main`.
- Web app responds at `http://127.0.0.1:5174`; API health responds at `http://127.0.0.1:4000/health` in the current local session.
- Latest recorded web suite: 143/143 passing; root typecheck and web build passing.
- Full route plan: 38 routes across six implementation waves in `docs/UX_UI_REFINEMENT_PLAN.md`.
- Wave 1 validation covers all five Mission Control pages in English/Thai and Operations, Royal Brief, and Living Loop at desktop, tablet, and mobile widths. The existing >500 kB bundle warning remains.
