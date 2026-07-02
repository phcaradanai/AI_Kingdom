# Next Task

## Kingdom V2 Phase B1 — Goal Decomposition Engine — Complete

Status: **complete as of 2026-07-01**

Deterministic Goal-to-Plan transformation layer is now in place. King enters a goal (title, objective, success criteria, constraints, priority); the engine returns a fully-structured `ExecutionPlan` with phases, parallel deliverables, dependency ordering, required capabilities, and Work Order templates — zero AI calls, zero DB mutations.

Verification: 29/29 unit tests (6 pure functions + 4 capability-matching tests), 260/260 web tests, root typecheck clean. `POST /api/goals/analyze` returns a deterministic plan with real agent slugs. Goal Planner panel live on Kingdom Operations page (`/kingdom`).

Step 4 (capability matching) hardened: `buildExecutionPlanFromInput()` async wrapper reads the live Kingdom agent roster and validates each deliverable's `suggestedRole` slug against active agents. `suggestedRole` values now use real slugs (`royal-architect`, `royal-general`, `royal-archivist`). Fallback to `royal-architect` when slug not in active roster.

See `docs/GOAL_DECOMPOSITION.md` for full architecture.

---

## Kingdom V2 Phase A — Living Kingdom Foundation — Complete

Status: **complete as of 2026-07-01**

Read-only deterministic living state layer is now in place. Each agent has one derived status from the 11-status taxonomy (`IDLE / THINKING / PLANNING / WORKING / WAITING_FOR_KING / WAITING_FOR_EXTERNAL_AGENT / VALIDATING / REVIEWING / LEARNING / BLOCKED / OFFLINE`) with evidence links, confidence scoring, and recommended King action. See `docs/LIVING_KINGDOM.md`.

Verification: 27/27 unit tests (pure derivation), 11/11 integration tests covering both `/state` endpoints against real test DB (`livingAgents.test.ts`), 260/260 web tests, full API test suite, root typecheck, production build, and `git diff --check` pass.

---

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

**Kingdom V2 Phase B — Animated Kingdom Map.** Now that state correctness is established (Phase A complete), Phase B can add visual polish: agent nodes positioned on an interactive map, animated dot or ring by live status color, and a "what's happening now" panel that updates in real time. No new backend capability is needed — the `/api/living-agents/state` endpoint is the data source.

Alternatively: **Kingdom V2 Phase C — Goal-to-Agent Trace.** King sets a goal; the Kingdom shows which agent picks it up, what step the workflow is at, and what action the King should take next.

### V1 Local Run Prerequisites

See the **V1 Local Run Checklist** section in [README.md](README.md).

### Completed Prior Tasks

Premium UX Wave 4I: Usage Trace Detail — complete 2026-07-01. `/usage-traces/:traceId` is now an evidence-first audit page: compact attribution summary (trace ID, purpose, attribution badge, actor, provider, model, timing), token/cost evidence strip, Final Resolution card with fallback/sandbox explanations, ordered operation timeline with colored step type badges and expandable safe previews, Related Records panel, Source Ownership panel linking Provider Config/Route Chain/Treasury/Audit, and sanitized prompt/response previews with recovery message when null. Scoped English/Thai chrome via `usageTraceMessages.ts`; 44px controls on expand toggle and back button. Focused web tests: 11 scenarios covering normal, fallback, failed, legacy, sanitized preview boundary, source links, and EN/TH. Verification: 260/260 web tests, root typecheck, production build, and `git diff --check` pass. Rendered EN/TH verified at 1440x900 and 390x844; no horizontal overflow; all source ownership links present.

Premium UX Wave 4H: Treasury — complete 2026-07-01. `/treasury` is now a focused financial control room with spend/budget/risk summary, provider registry and selected evidence, failed/high-cost usage traces, budget guardrails, trend, ownership links, partial telemetry handling, retained evidence operations, and semantic English/Thai chrome. Verification: Treasury web 7/7, Treasury API 20/20, API 979/979, runner 103/103, web 248/248, root typecheck/build, and diff checks pass. Local headless Chrome also passes English and Thai at 1440x900, 1024x768, 768x1024, 430x932, and 390x844 with 0px horizontal overflow, 44px minimum visible Treasury controls, complete source links, and no page exceptions; the unrelated existing `/favicon.ico` 404 remains.
