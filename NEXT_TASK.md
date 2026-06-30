# Next Task

## V1 Release Candidate — Locked

Status: **locked as of 2026-06-29**

The DECREE_TO_DONE Acceptance Gate passed. AI Kingdom V1 is a working product slice: a King can issue a BUILD decree, watch Mission Control drive it through context gate → council → work order → external agent dispatch → validation → review → retry → Accept & Learn → COMPLETED, with no duplicate records and one clear primary action at each step.

### Verified Acceptance Gate

- API tests: 969/969
- Runner tests: 103/103
- Web tests: 241/241
- Typecheck and build: clean
- BUILD decree reaches WorkflowRun COMPLETED via Accept & Learn
- Mission Control shows one clear primary action at each stage
- Stale context blocks before council (unit-proven: test 2 in `decreeToDoneWorkflowService.test.ts`)
- Multiple ready agents → one choice gate (unit-proven: test 3; live UI: Antigravity dropdown)
- Retry appears only for mechanical failures (PATCH_FAILED / VALIDATION_FAILED)
- PASS review accepted and archived
- No duplicate WorkflowRun, CouncilSession, WorkOrder, or AutomationJob

### What is NOT yet V1

- Full runner + bridge connected end-to-end in dev (`EXTERNAL_AGENT_BRIDGE_ENABLED=true` with a real CLI-backed agent): the smoke test reached BLOCKED@VALIDATE_RESULT due to bridge being off in dev — which is the correct gate behavior
- Accept & Learn on real runner-generated patch evidence (acceptance gate used seeded evidence, same method as unit test 3)
- `/treasury` Premium UX Wave 4H (planned, not started)

### V1 Local Run Prerequisites

See the **V1 Local Run Checklist** section in [README.md](README.md).

### Prior Next Task (superseded)

Premium UX Wave 4H: Treasury — planned for `/treasury`, `codex/main` branch, after Wave 4G validation. Baseline: 5/5 focused tests, 231/231 web tests, all checks pass. Wave 4H must start from a fresh `main` merge, audit `TreasuryPage.tsx` and Treasury APIs, capture baselines, and record scope before edits. See `docs/UX_UI_REFINEMENT_PLAN.md`.
