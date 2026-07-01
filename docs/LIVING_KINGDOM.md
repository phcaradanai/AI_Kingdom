# Living Kingdom V2 — Architecture

## Phase A: Read-Only Living Agent State Foundation

**Status:** Complete (2026-07-01)

### What this is

Phase A adds a deterministic, read-only state derivation layer that maps existing Kingdom data into a 11-status taxonomy for each agent. The King can now see what every agent is doing now, why, where the evidence comes from, and what action (if any) is needed.

**This phase does NOT add:**
- Uncontrolled autonomy
- New provider calls
- Data mutation
- New database tables or schema migrations
- Decorative animation or map UI

Visual polish and an animated Kingdom map come **after** state correctness is proven.

---

## Status Taxonomy

| Status | Meaning | Source of truth | Priority |
|---|---|---|---|
| `OFFLINE` | Agent is deactivated | `Agent.isActive = false` | 1 (highest) |
| `BLOCKED` | Automation job failed recently (within 4 hours) | `AutomationJob.status = FAILED` | 2 |
| `WORKING` | Actively applying a sandbox patch | `AutomationJob SANDBOX_PATCH in RUNNING/CLAIMED` | 3 |
| `VALIDATING` | Running a validation-only job | `AutomationJob VALIDATION_ONLY/OBSERVE in RUNNING/CLAIMED` | 4 |
| `WAITING_FOR_EXTERNAL_AGENT` | External agent CLI is running | `WorkOrder.assignedAgentId + active ExternalAgentRun` | 5 |
| `REVIEWING` | Runner finished; King must accept/reject patch | `AutomationJob.status = NEEDS_REVIEW` | 6 |
| `THINKING` | Active council AI call (not yet stale) | `AgentActivity in THINKING/WAITING_PROVIDER/RESPONDING/etc., heartbeatAt < 2 min` | 7 |
| `LEARNING` | Extracting memory or summarizing | `AgentActivity in EXTRACTING_MEMORY/SUMMARIZING, heartbeatAt < 2 min` | 8 |
| `PLANNING` | WorkflowRun in planning steps | `WorkflowRun RUNNING at INTAKE_DECREE/CHECK_CONTEXT/RUN_COUNCIL/CREATE_WORK_ORDER/RESOLVE_AGENT` | 9 |
| `WAITING_FOR_KING` | King action needed (work order review or knowledge candidate) | `WorkOrder.status = NEEDS_REVIEW` or `AgentKnowledgeCandidate.status = PENDING` | 10 |
| `IDLE` | No active evidence | No active signals | 11 (lowest) |

**Priority rule:** When multiple signals exist for one agent, the highest-priority status wins. An agent with a running job AND a pending candidate returns `WORKING`, not `WAITING_FOR_KING`.

---

## Source-of-Truth Separation

Each status derives from one source only. Duplication is intentional — the taxonomy reads without mutating:

| Signal source | What it owns |
|---|---|
| `AgentActivity` | Per-AI-call lifecycle (THINKING through COMPLETED) |
| `AutomationJob` | Runner job lifecycle (QUEUED through FAILED) |
| `WorkOrder` | Assignment, context binding, and King review state |
| `WorkflowRun` | BUILD decree planning and execution state machine |
| `ExternalAgentRun` | External CLI bridge status |
| `AgentKnowledgeCandidate` | Knowledge awaiting King approval |

---

## API

```
GET /api/living-agents/state
```

Optional query params:
- `agentId` — filter to a single agent
- `projectId` — filter signals by project
- `includeInactive=true` — include deactivated agents (default: omit)

```
GET /api/living-agents/:agentId/state
```

Returns a single `LivingAgentStateDto`.

### Response shape

```typescript
type LivingAgentStateDto = {
  agentId: string;
  agentName: string;
  role: string;
  status: LivingAgentStatusCode;   // one of the 11 statuses above
  statusLabel: string;             // human-readable
  summary: string;                 // "Applying patch for 'Release validation'"
  evidenceType: string | null;     // "AutomationJob" | "WorkOrder" | "AgentActivity" | ...
  evidenceId: string | null;
  evidenceLink: string | null;     // frontend route e.g. "/work-orders?focus=wo-1"
  projectId: string | null;
  workOrderId: string | null;
  workflowRunId: string | null;
  currentAction: string | null;
  recommendedKingAction: string | null;  // e.g. "Accept or reject the patch"
  updatedAt: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  staleReason: string | null;      // set when activity heartbeat has expired
};
```

---

## Staleness and confidence

- `THINKING`/`LEARNING` activities are marked stale if `heartbeatAt` is older than 2 minutes. A stale agent returns `IDLE` with `confidence: "LOW"` and a `staleReason` explaining when the last heartbeat was.
- A failed automation job is only BLOCKED within a 4-hour window to prevent permanent blame for old failures.
- Evidence that can't link to a trace (e.g. activity with no `traceId`) still returns its status — `evidenceLink` is null, but the response does not crash.

---

## Implementation files

| File | Purpose |
|---|---|
| `apps/api/src/services/livingAgentStateService.ts` | Pure derivation service — `deriveAgentStatus()` (exported, pure), `deriveLivingAgentStates()` (async, DB-read-only) |
| `apps/api/src/services/livingAgentStateService.test.ts` | 27 unit tests for derivation priority, all signal types, evidence links, stale/partial evidence |
| `apps/api/src/routes/livingAgents.ts` | Adds `GET /state` and `GET /:agentId/state` endpoints |
| `apps/web/src/pages/living-agents/livingAgentModels.ts` | `LIVING_STATUS_COLORS`, `LIVING_STATUS_DOT`, `getLivingStatusPulse()` |
| `apps/web/src/pages/living-agents/LivingAgentEvidence.tsx` | `LivingStatePanel` component — status badge, summary, evidence link, recommended King action |
| `apps/web/src/pages/living-agents/useLivingAgentsController.ts` | Fetches `/state` in parallel with presence; stores `livingStateByAgent` |
| `apps/web/src/lib/api.ts` | `getLivingAgentStates()` API call |
| `apps/api/src/types/api.ts` | `LivingAgentStateDto`, `LivingAgentStatusCode`, `LivingAgentConfidence` |
| `apps/web/src/types/api.ts` | Mirror of the above |

---

## Phase A known seams

**Dual status display (Phase A seam):** The Living Agents roster and per-agent evidence header continue to render the V1 presence-based status (`kingdomPresenceService` → `getEffectivePresenceState`), while `LivingStatePanel` renders the 11-status taxonomy. An agent can show "RUNNING" in the roster badge and "WORKING" or "IDLE" in the panel simultaneously — this is by design. Phase B will reconcile the two sources into a single source of truth and retire the V1 presence display.

**Single job per agent:** `deriveLivingAgentStates` keeps only the most-recently-updated job per agent. If an agent has both an older RUNNING job and a newer QUEUED job, the QUEUED job wins. This is the correct behavior for Phase A (most recent signal is most relevant) and a known limitation to revisit if multi-job agents are introduced.

---

## What comes next (Phase B and beyond)

1. **Phase B — Animated Kingdom Map:** Replace the static roster/evidence layout with an interactive map showing agents as positioned nodes, animated by their live status.
2. **Phase C — Goal-to-agent trace:** King sets a goal; the Kingdom shows which agent picks it up, which step it's at, and what the King should do next.
3. **Phase D — Agent-to-agent routing (with gates):** Agents hand off subtasks to each other, with King approval at each phase gate.

None of these phases add uncontrolled autonomy. The King remains the sole approver of every permanent action.
