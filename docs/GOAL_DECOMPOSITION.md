# Goal Decomposition Engine — Architecture

## Phase B1: Deterministic Goal-to-Plan Transformation

**Status:** Complete (2026-07-01)

### What this is

Phase B1 adds a deterministic, read-only, zero-AI-call service that transforms a single high-level King objective into a structured, reviewable execution plan. The plan maps:

```
Goal → Phases → Deliverables → Work Order Templates → Required Capabilities
```

**This phase does NOT add:**
- Autonomous execution of any kind
- AI provider calls or LLM decomposition
- New database tables or schema migrations
- Changes to existing V1 Task / Work Order / WorkflowRun workflows
- Agent negotiation or inter-agent routing

---

## Design Principles

1. **Deterministic:** Same `GoalInput` always produces the same `ExecutionPlan` (except `generatedAt`).
2. **Pure functions:** Every analysis step is a stateless function that takes plain objects and returns plain objects. No DB reads, no side effects.
3. **Additive, not replacement:** Goals sit above Tasks and Work Orders. They do not replace them. A Goal produces templates; the King uses those templates to create Work Orders manually.
4. **Reuse over invention:** Problem-type and domain-signal detection reuses `extractDecreeFrame()` from `decreeFrameService.ts` to stay consistent with how the council frames decrees.

---

## Execution Plan Structure

```
GoalInput
  └── analysis (GoalAnalysis)
        ├── problemType         — BUG_FIX | FEATURE_ADDITION | ARCHITECTURE_CHANGE | …
        ├── domainSignals       — ["database", "api-routes", "frontend-ui", …]
        ├── keyQuestions        — 3 targeted questions for this problem type
        ├── complexity          — LOW | MEDIUM | HIGH | CRITICAL
        └── parallelizationOpportunity — true when 2+ deliverables exist

ExecutionPlan
  └── phases[]  (ordered by dependency level)
        └── phase: { phaseNumber, phaseTitle, description }
              └── deliverables[]  (all can run in parallel within a phase)
                    ├── id              — deterministic ("d0", "d1", …)
                    ├── title           — human-readable name
                    ├── type            — DATABASE_SCHEMA | API_ENDPOINT | BACKEND_SERVICE | …
                    ├── dependsOn       — IDs of deliverables that must complete first
                    ├── canParallelize  — true when multiple deliverables share the same phase
                    ├── requiredCapabilities[]
                    └── workOrderTemplate
                          ├── title
                          ├── objective
                          ├── acceptanceCriteria[]
                          └── suggestedRole
```

---

## Phase Ordering (Dependency Model)

| Phase | Title        | Deliverable types                                    |
|-------|-------------|------------------------------------------------------|
| 1     | Foundation  | `DATABASE_SCHEMA`, `CONFIGURATION`                   |
| 2     | Backend     | `API_ENDPOINT`, `BACKEND_SERVICE`, `INTEGRATION`     |
| 3     | Frontend    | `FRONTEND_UI`                                        |
| 4     | Validation  | `TESTING`                                            |
| 5     | Knowledge   | `DOCUMENTATION`                                      |

Rules:
- Phase N deliverables depend on ALL deliverables in phases 1 through N-1.
- Deliverables within the same phase have no mutual dependency and can run in parallel.
- `TESTING` is auto-added when any implementation deliverable is present.

---

## Keyword-Based Deliverable Detection

The engine scans the combined text of `title + objective + successCriteria + constraints` for keyword signals:

| Type              | Example keywords                                   |
|-------------------|----------------------------------------------------|
| `DATABASE_SCHEMA` | schema, migration, table, prisma, model            |
| `CONFIGURATION`   | config, env, feature flag, infrastructure          |
| `API_ENDPOINT`    | api, endpoint, route, rest, http                   |
| `BACKEND_SERVICE` | service, function, module, logic, worker           |
| `INTEGRATION`     | integrate, webhook, external, third-party, sdk     |
| `FRONTEND_UI`     | page, ui, component, react, frontend, form         |
| `TESTING`         | test, spec, coverage, integration test, e2e        |
| `DOCUMENTATION`   | doc, documentation, readme, changelog, guide       |

Fallback: if no keywords match, a single `BACKEND_SERVICE` deliverable is produced.

---

## API

```
POST /api/goals/analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Build audit log feature",
  "objective": "Add a database schema, API endpoint, and frontend page for audit logs",
  "successCriteria": ["Audit log page displays the last 100 events"],
  "constraints": ["Must not break existing routes"],
  "priority": "HIGH"
}
```

Response:
```json
{
  "plan": {
    "goalTitle": "Build audit log feature",
    "analysis": { "problemType": "FEATURE_ADDITION", "complexity": "MEDIUM", ... },
    "phases": [
      {
        "phaseNumber": 1,
        "phaseTitle": "Foundation",
        "deliverables": [{ "id": "d0", "type": "DATABASE_SCHEMA", ... }]
      },
      ...
    ],
    "totalDeliverables": 4,
    "estimatedComplexity": "MEDIUM",
    "generatedAt": "2026-07-01T00:00:00.000Z"
  }
}
```

No provider is called. Response time is synchronous (<10ms).

---

## Mission Control Integration

The **Goal Decomposition** panel on the Kingdom Operations page (`/kingdom`) lets the King:

1. Enter a goal title, objective, success criteria, constraints, and priority.
2. Submit the form — the engine runs synchronously and returns the plan.
3. Review the phased execution plan with expandable deliverable rows showing acceptance criteria, required capabilities, and Work Order templates.
4. Use those templates to manually create Work Orders via the existing work-order flow (no automatic creation).

---

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/goalDecompositionService.ts` | Pure service — all 6 analysis functions exported |
| `apps/api/src/services/goalDecompositionService.test.ts` | 25 unit tests (5 per function group) |
| `apps/api/src/routes/goals.ts` | `POST /api/goals/analyze` endpoint |
| `apps/web/src/components/kingdom/GoalPlannerPanel.tsx` | Kingdom Operations panel (form + plan view) |
| `apps/api/src/types/api.ts` | `GoalExecutionPlanDto`, `GoalDeliverableDto`, etc. |
| `apps/web/src/types/api.ts` | Mirror of API types |
| `apps/web/src/lib/api.ts` | `api.analyzeGoal()` call |

---

## Tests (25/25)

| Group | Count | What's covered |
|-------|-------|----------------|
| `analyzeGoal` | 5 | problem type detection, complexity, parallelization flag |
| `identifyDeliverables` | 6 | signal detection, auto-add TESTING, fallback, determinism, WO template shape |
| `identifyDependencies` | 4 | phase-0 no deps, UI depends on backend, TESTING depends on all, blocked dep |
| `identifyParallelWork` | 3 | phase order, canParallelize flag, single-phase goal |
| `identifyRequiredCapabilities` | 2 | deduplication, non-empty capabilities |
| `buildExecutionPlan` | 5 | determinism, shape, no provider calls, complexity scoring, phase uniqueness |

All tests run with Node's built-in test runner, no DB, no AI provider, no mocking required.

---

## What comes next (Phase B2 and beyond)

1. **Phase B2 — Goal persistence:** King can save goals to the DB, query them, and link Work Orders to a goal via `sourceType: "GOAL_PLAN"` / `sourceId: goalId`. Mission Control can then show completion progress across a goal's Work Orders.
2. **Phase B3 — Goal-to-agent trace:** King sets a goal; the Kingdom shows which agent is executing which deliverable, which step the workflow is at, and what action is needed next.
3. **Phase B4 — Multi-goal orchestration:** Prioritize and sequence goals, detect conflicts between concurrent goals, and surface blocking dependencies across goals.

None of these phases add uncontrolled autonomy. The King remains the sole approver of every permanent action.
