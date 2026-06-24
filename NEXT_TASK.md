# Next Task

## Premium UX Wave 4F: Providers Registry

Status: **in progress from synchronized base `bbfe585`**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex on `codex/main`

### Goal

Refine `/providers` into a compact provider and model readiness workspace where the King can compare operational state, credential-reference readiness, health, defaults, and source ownership without exposing secrets or scanning repeated panels.

### Discovery First

1. Merge current `main` into `codex/main` and record the synchronized base.
2. Audit the existing provider page, APIs, DTOs, RBAC, settings ownership, routing links, secret-reference handling, and current test coverage.
3. Capture English/Thai baselines at 1440x900, 1024x768, and 430x932 before defining the final layout.
4. Record active ownership and collision boundaries in `WORK_IN_PROGRESS.md` and `docs/ACTIVE_WORK.md` before implementation.

### Expected Direction

- Compact provider registry with readiness, environment mode, health, cost tier, and default-model evidence.
- Focused provider detail and explicit create/edit controls instead of showing every configuration surface at once.
- Direct links to Routing, Treasury, and usage evidence while those routes remain their own source of truth.
- Semantic English/Thai chrome, bounded technical values, 44px controls, responsive composition, and clear loading/error/empty states.

### Constraints

- Never expose API keys or secret values; custom providers continue to store environment-variable names only.
- Preserve provider/model routing, fallback, health, settings, RBAC, audit, and cost contracts unless discovery proves a coordinated contract change is required.
- Do not infer provider readiness from display state when the API already owns the readiness signal.
- Split large route/controller/component modules below 600 lines where practical.

### Baseline

- Premium UX Waves 1, 2, 3, and 4A-4E are complete.
- Wave 4E validation: 8/8 focused tests, 219/219 full web tests, web lint, root typecheck, and root build pass.
- Wave 4F baseline: 9 providers; page height is 2,921px at 1440x900, 4,591px at 1024x768, and 5,719px at 430x932 with no horizontal overflow.
- Current provider cards repeat all details, produce asymmetric empty space, expose 20-40px content controls, and leave most page chrome in English under the Thai locale.
