# Next Task

## Premium UX Wave 4H: Treasury

Status: **planned after Wave 4G completion**
Plan: `docs/UX_UI_REFINEMENT_PLAN.md`
Owner: Codex on `codex/main`

Last status refresh: 2026-06-26

### Goal

Refine `/treasury` into a compact financial operations workspace where the King can understand spend, budget posture, provider/model cost evidence, fallback analytics, reconciliation state, and source ownership without confusing Treasury telemetry with provider registry configuration or per-request Usage Trace evidence.

### Current Starting Point

- Premium UX Wave 4G `/routing` is complete and validated.
- `/routing` now links provider registry ownership to `/providers`, spend/health/model catalog ownership to `/treasury`, and per-request attempt ownership to Usage Trace.
- `WORK_IN_PROGRESS.md` says no Codex implementation is active; Wave 4H must reserve scope before edits.

### Discovery First

1. Merge current `main` into `codex/main` and record the synchronized base.
2. Audit `TreasuryPage.tsx`, Treasury APIs, provider-balance/model/health/reconciliation reads, RBAC, secret handling, and current test coverage.
3. Capture English/Thai baselines at 1440x900, 1024x768, and 430x932 before defining the final layout.
4. Record active ownership and collision boundaries in `WORK_IN_PROGRESS.md` and `docs/ACTIVE_WORK.md` before implementation.

### Expected Direction

- Spend/budget posture first, trend and reconciliation second, provider/model analysis third, admin sync tools last.
- Clear source separation: Treasury owns spend, balances, health snapshots, model catalog, pricing, and reconciliation; Providers owns registry/defaults/credentials; Routing owns route-chain order; Usage Trace owns per-request attempts.
- Compact provider/model evidence with direct source links and bounded technical values.
- Semantic English/Thai chrome, 44px controls, responsive composition, and clear empty/loading/error states.

### Constraints

- Do not change Treasury API contracts, provider routing semantics, provider registry contracts, usage trace attribution, RBAC, audit, or secret handling unless discovery proves a coordinated contract change is required.
- Do not expose API keys or secret values.
- Keep route/controller/component modules below 600 lines where practical.

### Baseline

- Premium UX Waves 1, 2, 3, and 4A-4G are complete.
- Wave 4G validation: 5/5 focused tests, 231/231 full web tests, web typecheck, root typecheck, web build, root build, `git diff --check`, and dev smoke checks pass.
- Wave 4G rendered browser verification remains outstanding because browser tooling was unavailable/blocked in this environment; do not inherit a visual-pass claim.
- The next slice should start from a fresh `main` merge into `codex/main`.
