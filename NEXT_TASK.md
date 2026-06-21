# Next Task

## Premium UX Wave 2D: Reports and Decree Lineage

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Complete the evidence-reading end of the command-to-execution lifecycle. The King should be able to find a report, read it, verify where it came from, inspect the full decree lineage, and return to each owning source without losing context.

### Scope

- `/reports`: searchable archive, compact document list, selected reading pane, provenance, explicit edit mode, and confirmation-gated delete.
- `/decree-lineage/:workOrderId`: read-only seven-stage evidence timeline from decree through council, work ownership, external execution, review/knowledge, and Royal Secretary summary.
- Shared lifecycle patterns: source links, selected state, bounded disclosures, semantic status, empty/loading/error states, and responsive master-detail composition.
- Semantic English/Thai keys for static chrome only. Server-provided prose and raw audit evidence remain unchanged source data.

### Constraints

- No route rename, backend, Prisma, lifecycle, runner, autonomy, or approval changes.
- Reports remain the final archived counsel source; Decree Lineage remains a computed read-only evidence view.
- Preserve report search/edit/delete behavior and all current Decree Lineage API parameters.
- Keep required evidence and source links in normal document flow. Do not hide reports, stages, decisions, or provenance in a carousel.
- Use real-state motion only, respect reduced motion, maintain keyboard operation, and keep mobile touch targets at least 44px.
- Avoid nested decorative cards, radius above 8px for panels, accidental empty columns, and horizontal page overflow.

### Delivery Order

1. Capture current Reports and Decree Lineage baselines at 1440px, 1024px, and 430px in English and Thai.
2. Add focused tests for existing report actions, lineage stage order, source ownership, and mobile-safe rendering.
3. Refine `/reports` into archive list plus reading pane while preserving mutations and source links.
4. Refine `/decree-lineage/:workOrderId` into a bounded evidence timeline with source navigation and semantic i18n.
5. Verify the full path: Throne Room -> Council -> Work Order -> Automation Job -> Decree Lineage -> Report.
6. Run web typecheck, full web tests, production build, reduced-motion checks, and desktop/mobile screenshots.

### Acceptance

- The King can identify report ownership, current lifecycle stage, actor, next safe action, and evidence source without scanning duplicate summaries.
- Reports and Decree Lineage use the same spacing, typography, panel, status, disclosure, and responsive system as Waves 2A-2C.
- Thai and English labels do not overlap, clip, or widen the page.
- Report edit/delete actions remain explicit and correctly gated; Decree Lineage has no mutation controls.
- Source links, raw enum evidence, search/filter state, route parameters, and API behavior remain intact.
- Focused page tests pass, followed by `npm run typecheck --workspace @ai-kingdom/web`, `npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web`.

### Baseline

- Branch baseline: `main`, `origin/main`, and `codex/main` aligned at `57bd71d` before this documentation update.
- Current frontend: 39 routes (38 authenticated plus `/login`) across six UX waves.
- Latest web validation: 156/156 tests, web typecheck, and production build pass; the existing >500 kB chunk warning remains.
- Live shell verification passes at 1440x900 and 430x932 with no Dashboard horizontal overflow.
- Current local endpoints: web `http://localhost:5173`; API health `http://localhost:4000/health`.
