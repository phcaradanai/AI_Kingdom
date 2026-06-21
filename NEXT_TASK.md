# Next Task

## Premium UX Wave 3A: Projects Portfolio and Project Detail

Status: **planned - ready to implement**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`

### Goal

Make Projects the clear source of truth for workspace health and context. The King should be able to find the project needing attention, see whether its local context is fresh, inspect active work and evidence, and take the next safe project action without scanning unrelated panels.

### Scope

- `/projects`: compact portfolio list with status, priority, context freshness, active-work signal, filters, and one explicit create action.
- `/projects/:id`: stable project header and health strip with bounded sections for Overview, Work, Local Docs, Repository, Artifacts, and Export.
- Shared project patterns: selected state, source links, semantic status, empty/loading/error states, safe disclosures, and responsive list-to-detail composition.
- Semantic English/Thai keys for static chrome only. Project names, paths returned through approved contracts, hashes, repository metadata, and generated summaries remain source data.

### Constraints

- No backend, Prisma, routing algorithm, context-binding, safe-path, artifact ownership, export, RBAC, lifecycle, runner, or autonomy changes.
- Never expose raw local root paths or secrets. Keep all local document access behind approved `LocalDocumentRoot` records and existing safe-path services.
- Preserve project create/update/archive, local-doc scan/root management, context repair, repository snapshot, artifact, and Obsidian export behavior.
- Real-time and motion cues must reflect real scan/repair/refresh state only. Required project evidence and actions remain in normal document flow.
- Avoid oversized project cards, nested decorative cards, accidental empty columns, and horizontal page overflow. Mobile controls remain at least 44px.

### Delivery Order

1. Capture `/projects` and representative `/projects/:id` baselines at 1440px, 1024px, and 430px in English and Thai.
2. Add focused tests for portfolio hierarchy, project selection/navigation, context ownership, source links, role-gated actions, and mobile-safe rendering.
3. Refine `/projects` into a compact portfolio with stable filtering and explicit creation.
4. Refine `/projects/:id` into the project source-of-truth workspace without changing any mutation contract.
5. Verify Projects -> Work Orders -> Local Docs/Context -> Artifacts/Export navigation and ownership.
6. Run web typecheck, full web tests, production build, reduced-motion checks, and desktop/mobile screenshots.

### Acceptance

- The King can identify project health, context freshness, active work, next safe action, and source ownership from the portfolio and project detail.
- Project creation/edit/archive and local-doc/context/artifact/export actions retain current RBAC and safety gates.
- English and Thai labels do not overlap, clip, or widen the page; long names, hashes, and repository metadata remain bounded.
- No raw secret or unapproved local path is introduced in UI, logs, provenance, or tests.
- Focused page tests pass, followed by `npm run typecheck --workspace @ai-kingdom/web`, `npm run test --workspace @ai-kingdom/web`, and `npm run build --workspace @ai-kingdom/web`.

### Baseline

- Premium UX Waves 1 and 2 are complete across Mission Control and the command-to-evidence lifecycle.
- Current frontend: 39 routes (38 authenticated plus `/login`).
- Latest web validation: 161/161 tests, web typecheck, and production build pass; the existing >500 kB chunk warning remains.
- Live Wave 2D checks pass at 1440x900, 1024x768, and 430x932 in English/Thai with no page overflow or console errors.
- Current local endpoints: web `http://localhost:5173`; API health `http://localhost:4000/health`.
