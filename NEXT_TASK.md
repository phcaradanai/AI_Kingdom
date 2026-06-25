# Next Task

## Premium UX Wave 4G: Routing Workspace

Status: **planned after Wave 4F completion**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex on `codex/main`

### Goal

Refine `/routing` into a compact provider/model fallback workspace where the King can understand each route chain, effective provider order, health/readiness evidence, and source ownership without confusing routing policy with provider registry or Treasury telemetry.

### Discovery First

1. Merge current `main` into `codex/main` and record the synchronized base.
2. Audit `RoutingPage.tsx`, route-chain APIs, provider/model telemetry reads, validation behavior, RBAC, and current test coverage.
3. Capture English/Thai baselines at 1440x900, 1024x768, and 430x932 before defining the final layout.
4. Record active ownership and collision boundaries in `WORK_IN_PROGRESS.md` and `docs/ACTIVE_WORK.md` before implementation.

### Expected Direction

- Compact route-chain list with selected chain detail and ordered fallback sequence.
- Clear source separation: routing policy owns order/weights; Providers owns registry/defaults; Treasury owns usage/spend; Usage Trace owns per-request evidence.
- Provider/model health and validation evidence visible beside each fallback step without editing provider secrets.
- Semantic English/Thai chrome, bounded technical values, 44px controls, responsive composition, and clear empty/loading/error states.

### Constraints

- Do not change route-chain API contracts, provider selection semantics, fallback behavior, usage trace attribution, RBAC, audit, or secret handling unless discovery proves a coordinated contract change is required.
- Do not expose API keys or secret values.
- Keep route/controller/component modules below 600 lines where practical.

### Baseline

- Premium UX Waves 1, 2, 3, and 4A-4F are complete.
- Wave 4F validation: 7/7 focused tests, 226/226 full web tests, web typecheck, root typecheck, web build, root build, `git diff --check`, and live `/providers` browser checks at 1440x900, 1024x768, and 430x932 pass.
- The next slice should start from a fresh `main` merge into `codex/main`.
