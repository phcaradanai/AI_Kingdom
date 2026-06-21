# Next Task

## Premium UX Wave 3B: Project Inbox and Artifacts

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Make uncertain project routing and project-owned evidence easy to triage. The King should be able to compare confidence, reasoning, suggested ownership, and source evidence in Project Inbox, then inspect the resulting artifact without losing its project or execution provenance.

### Scope

- `/project-inbox`: compact triage queue with confidence, routing reason, suggested project, source evidence, stable filters, and safe single/bulk assignment actions.
- `/artifacts`: searchable/filterable archive with type/source/project context, compact rows, focused detail/preview, and direct links back to owning Project, Work Order, Task, Report, or execution evidence where contracts provide identifiers.
- Shared patterns: queue/list hierarchy, explicit selected state, bounded evidence, source links, semantic status, empty/loading/error states, and responsive list-to-detail composition.
- Semantic English/Thai keys for static chrome only. Titles, summaries, identifiers, confidence evidence, artifact content, and server-provided reasons remain source data.

### Constraints

- No backend, Prisma, routing algorithm, confidence threshold, artifact ownership, safe-path, RBAC, lifecycle, runner, or autonomy changes.
- Project routing remains deterministic and explainable. Low-confidence records stay in Project Inbox until a permitted user assigns them.
- Preserve current single/bulk assignment, archive/filter, artifact creation/update/delete, source-link, and duplicate/provenance behavior.
- Never expose secrets, unapproved filesystem paths, or raw local-root paths. Required routing and artifact evidence remains visible in normal document flow, not a carousel.
- Avoid oversized cards, repeated forms, accidental empty columns, and horizontal page overflow. Mobile controls remain at least 44px.

### Delivery Order

1. Capture `/project-inbox` and `/artifacts` baselines at 1440px, 1024px, and 430px in English and Thai.
2. Add focused tests for triage hierarchy, confidence/reason evidence, assignment boundaries, artifact provenance, source links, and mobile-safe rendering.
3. Refine `/project-inbox` into a compact queue-and-evidence workspace without changing routing behavior.
4. Refine `/artifacts` into an archive-and-detail workspace without changing mutation or ownership contracts.
5. Verify Project Inbox -> Project -> Work Order/Task and Artifacts -> owning source navigation.
6. Run web typecheck, full web tests, production build, reduced-motion checks, and desktop/mobile screenshots.

### Acceptance

- The King can identify why routing is uncertain, compare candidates, assign safely, and open the owning source without scanning unrelated panels.
- Artifacts clearly expose type, project, source ownership, provenance, and the next safe navigation action.
- Existing routing confidence rules, assignment APIs, artifact mutations, RBAC, and safety boundaries remain unchanged.
- English and Thai labels do not overlap, clip, or widen the page; long titles, reasons, identifiers, and evidence remain bounded.
- Focused page tests pass, followed by `npm run typecheck --workspace @ai-kingdom/web`, `NODE_OPTIONS=--no-experimental-webstorage npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web`.

### Baseline

- Premium UX Waves 1, 2, and 3A are complete.
- Current frontend: 39 routes (38 authenticated plus `/login`).
- Latest web validation: 165/165 tests, web typecheck, and production build pass; the existing >500 kB chunk warning remains.
- Live Wave 3A checks pass at 1440x900, 1024x768, and 430x932 in English/Thai with no page overflow or console errors.
- Current local endpoints: Wave 3A worktree web `http://localhost:5174`; API health `http://localhost:4000/health`.
