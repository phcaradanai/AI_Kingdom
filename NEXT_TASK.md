# Next Task

## Real Runner / Bridge Acceptance — Complete

Status: **complete as of 2026-06-30**

The seeded V1 gate and the real external CLI bridge gate are both complete. They remain separate evidence sets: seeded evidence proved the product state machine; the 2026-06-30 run proved a real Claude Code process created and validated a patch before King acceptance.

### Verified Real Runner Gate

- Workflow `cmr0i0262001140r2y890li4p`: FRESH context → council → Work Order → Claude Code selection → real EXTERNAL_AGENT runner → validation → PASS review → Accept & Learn → `COMPLETED / DONE`.
- Job `cmr0i93hz00jj40r2cbvq9otz`: real Claude CLI command step completed with exit 0; Implementation Report recorded one changed file, no errors, and `PASSED`.
- Patch `cmr0ieg1100l140r2c9vymyw9`: one new harmless fixture file, real unified diff, LOW risk, no blocked paths, typecheck exit 0, approved only through Accept & Learn.
- Learning gate: candidate `cmr0iegk200la40r2h98y6b1c` had no durable memory before acceptance; Accept & Learn created approved memory `cmr0ij9ru00ml40r25l0k7dd4`.
- Temporary external-agent write/network settings are restored to `false`; no push, PR, merge, deploy, mock runner, or seeded patch evidence was used.
- Final checks: API 978/978, runner 103/103, web 241/241, root typecheck, production build, and `git diff --check` all pass.

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

### Next Candidate

Premium UX Wave 4H for `/treasury` may now be planned from a fresh `main` baseline. It has not started.

### V1 Local Run Prerequisites

See the **V1 Local Run Checklist** section in [README.md](README.md).

### Prior Next Task (superseded)

Premium UX Wave 4H: Treasury — planned for `/treasury`, `codex/main` branch, after Wave 4G validation. Baseline: 5/5 focused tests, 231/231 web tests, all checks pass. Wave 4H must start from a fresh `main` merge, audit `TreasuryPage.tsx` and Treasury APIs, capture baselines, and record scope before edits. See `docs/UX_UI_REFINEMENT_PLAN.md`.
