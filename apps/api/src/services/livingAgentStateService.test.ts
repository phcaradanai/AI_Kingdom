import assert from "node:assert/strict";
import test from "node:test";
import { deriveAgentStatus } from "./livingAgentStateService.js";
import type { ActivitySignal, CandidateSignal, JobSignal, WorkOrderSignal } from "./livingAgentStateService.js";

const NOW = Date.now();
const recent = (msAgo = 0) => new Date(NOW - msAgo);

function job(overrides: Partial<JobSignal> & Pick<JobSignal, "status" | "mode">): JobSignal {
  return {
    id: "job-1",
    workOrderId: "wo-1",
    workOrderTitle: "Test Work Order",
    projectId: null,
    updatedAt: recent(),
    ...overrides,
  };
}

function workOrder(overrides: Partial<WorkOrderSignal> & Pick<WorkOrderSignal, "status">): WorkOrderSignal {
  return {
    id: "wo-1",
    title: "Test Work Order",
    projectId: null,
    hasActiveExternalRun: false,
    activeExternalRunId: null,
    activeWorkflowRunId: null,
    activeWorkflowRunStep: null,
    ...overrides,
  };
}

function activity(overrides: Partial<ActivitySignal> & Pick<ActivitySignal, "status">): ActivitySignal {
  return {
    title: "Processing council decree",
    heartbeatAt: recent(1000), // 1 sec ago — fresh
    traceId: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateSignal> = {}): CandidateSignal {
  return { id: "cand-1", projectId: null, ...overrides };
}

// ── OFFLINE ───────────────────────────────────────────────────────────────────

test("inactive agent → OFFLINE regardless of other signals", () => {
  const result = deriveAgentStatus(false, NOW, job({ status: "RUNNING", mode: "SANDBOX_PATCH" }), null, null, null);
  assert.equal(result.status, "OFFLINE");
  assert.equal(result.confidence, "HIGH");
});

// ── BLOCKED ───────────────────────────────────────────────────────────────────

test("FAILED job within 4 hours → BLOCKED HIGH confidence", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "FAILED", mode: "SANDBOX_PATCH", updatedAt: recent(30 * 60_000) }), null, null, null);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.confidence, "HIGH");
  assert.ok(result.evidenceType === "AutomationJob");
  assert.ok(result.evidenceLink?.includes("wo-1"));
  assert.ok(typeof result.recommendedKingAction === "string");
});

test("FAILED job older than 4 hours does not produce BLOCKED", () => {
  const oldFailure = job({ status: "FAILED", mode: "SANDBOX_PATCH", updatedAt: recent(5 * 60 * 60_000) });
  const result = deriveAgentStatus(true, NOW, oldFailure, null, null, null);
  assert.notEqual(result.status, "BLOCKED");
});

// ── WORKING / VALIDATING ──────────────────────────────────────────────────────

test("SANDBOX_PATCH job RUNNING → WORKING", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "RUNNING", mode: "SANDBOX_PATCH" }), null, null, null);
  assert.equal(result.status, "WORKING");
  assert.equal(result.confidence, "HIGH");
  assert.ok(result.evidenceLink?.includes("wo-1"));
});

test("SANDBOX_PATCH job CLAIMED → WORKING", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "CLAIMED", mode: "SANDBOX_PATCH" }), null, null, null);
  assert.equal(result.status, "WORKING");
});

test("VALIDATION_ONLY job RUNNING → VALIDATING", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "RUNNING", mode: "VALIDATION_ONLY" }), null, null, null);
  assert.equal(result.status, "VALIDATING");
  assert.equal(result.confidence, "HIGH");
});

test("OBSERVE job RUNNING → VALIDATING", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "RUNNING", mode: "OBSERVE" }), null, null, null);
  assert.equal(result.status, "VALIDATING");
});

// ── WAITING_FOR_EXTERNAL_AGENT ────────────────────────────────────────────────

test("work order with active external run → WAITING_FOR_EXTERNAL_AGENT", () => {
  const result = deriveAgentStatus(
    true, NOW, null,
    workOrder({ status: "IN_PROGRESS", hasActiveExternalRun: true, activeExternalRunId: "run-1" }),
    null, null,
  );
  assert.equal(result.status, "WAITING_FOR_EXTERNAL_AGENT");
  assert.equal(result.confidence, "HIGH");
  assert.ok(result.evidenceLink?.includes("wo-1"));
});

// ── REVIEWING ─────────────────────────────────────────────────────────────────

test("AutomationJob NEEDS_REVIEW → REVIEWING", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" }), null, null, null);
  assert.equal(result.status, "REVIEWING");
  assert.equal(result.confidence, "HIGH");
  assert.ok(typeof result.recommendedKingAction === "string");
});

// ── THINKING ─────────────────────────────────────────────────────────────────

test("fresh THINKING activity → THINKING", () => {
  const result = deriveAgentStatus(true, NOW, null, null, activity({ status: "THINKING" }), null);
  assert.equal(result.status, "THINKING");
  assert.equal(result.confidence, "HIGH");
});

test("fresh WAITING_PROVIDER activity → THINKING", () => {
  const result = deriveAgentStatus(true, NOW, null, null, activity({ status: "WAITING_PROVIDER" }), null);
  assert.equal(result.status, "THINKING");
});

test("stale activity (>2 min) → IDLE with LOW confidence", () => {
  const staleAct = activity({ status: "THINKING", heartbeatAt: recent(3 * 60_000) });
  const result = deriveAgentStatus(true, NOW, null, null, staleAct, null);
  assert.equal(result.status, "IDLE");
  assert.equal(result.confidence, "LOW");
  assert.ok(result.staleReason);
});

// ── LEARNING ─────────────────────────────────────────────────────────────────

test("fresh EXTRACTING_MEMORY activity → LEARNING", () => {
  const result = deriveAgentStatus(true, NOW, null, null, activity({ status: "EXTRACTING_MEMORY" }), null);
  assert.equal(result.status, "LEARNING");
  assert.equal(result.confidence, "HIGH");
});

test("fresh SUMMARIZING activity → LEARNING", () => {
  const result = deriveAgentStatus(true, NOW, null, null, activity({ status: "SUMMARIZING" }), null);
  assert.equal(result.status, "LEARNING");
});

// ── PLANNING ─────────────────────────────────────────────────────────────────

test("WorkOrder with active WorkflowRun at RESOLVE_AGENT → PLANNING", () => {
  const result = deriveAgentStatus(
    true, NOW, null,
    workOrder({
      status: "IN_PROGRESS",
      activeWorkflowRunId: "wfr-1",
      activeWorkflowRunStep: "RESOLVE_AGENT",
    }),
    null, null,
  );
  assert.equal(result.status, "PLANNING");
  assert.equal(result.workflowRunId, "wfr-1");
  assert.equal(result.confidence, "MEDIUM");
});

test("WorkOrder with active WorkflowRun at RUN_COUNCIL → PLANNING", () => {
  const result = deriveAgentStatus(
    true, NOW, null,
    workOrder({ status: "IN_PROGRESS", activeWorkflowRunId: "wfr-2", activeWorkflowRunStep: "RUN_COUNCIL" }),
    null, null,
  );
  assert.equal(result.status, "PLANNING");
});

// ── WAITING_FOR_KING ──────────────────────────────────────────────────────────

test("WorkOrder NEEDS_REVIEW → WAITING_FOR_KING", () => {
  const result = deriveAgentStatus(true, NOW, null, workOrder({ status: "NEEDS_REVIEW" }), null, null);
  assert.equal(result.status, "WAITING_FOR_KING");
  assert.equal(result.confidence, "HIGH");
  assert.ok(result.recommendedKingAction?.includes("action"));
});

test("pending knowledge candidate → WAITING_FOR_KING", () => {
  const result = deriveAgentStatus(true, NOW, null, null, null, candidate());
  assert.equal(result.status, "WAITING_FOR_KING");
  assert.ok(result.evidenceLink?.includes("knowledge-lab"));
});

// ── IDLE ─────────────────────────────────────────────────────────────────────

test("no signals → IDLE HIGH confidence", () => {
  const result = deriveAgentStatus(true, NOW, null, null, null, null);
  assert.equal(result.status, "IDLE");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.staleReason, null);
});

// ── PRIORITY ORDERING ─────────────────────────────────────────────────────────

test("BLOCKED beats WORKING when job failed recently", () => {
  // Two jobs: one FAILED recently, one could be derived as WORKING
  // The service indexes only one job per agent — the most recently updated
  // If the FAILED job is most recent, it wins
  const failedJob = job({ status: "FAILED", mode: "SANDBOX_PATCH", updatedAt: recent(10 * 60_000) });
  const result = deriveAgentStatus(true, NOW, failedJob, null, null, null);
  assert.equal(result.status, "BLOCKED");
});

test("WORKING beats WAITING_FOR_KING when job is actively running", () => {
  const runningJob = job({ status: "RUNNING", mode: "SANDBOX_PATCH" });
  const woNeedsReview = workOrder({ status: "NEEDS_REVIEW" });
  const result = deriveAgentStatus(true, NOW, runningJob, woNeedsReview, null, null);
  assert.equal(result.status, "WORKING");
});

test("REVIEWING beats WAITING_FOR_KING (job NEEDS_REVIEW wins over WorkOrder NEEDS_REVIEW)", () => {
  const reviewJob = job({ status: "NEEDS_REVIEW", mode: "SANDBOX_PATCH" });
  const woNeedsReview = workOrder({ status: "NEEDS_REVIEW" });
  const result = deriveAgentStatus(true, NOW, reviewJob, woNeedsReview, null, null);
  assert.equal(result.status, "REVIEWING");
});

test("OFFLINE beats all other signals", () => {
  const runningJob = job({ status: "RUNNING", mode: "SANDBOX_PATCH" });
  const woSignal = workOrder({ status: "NEEDS_REVIEW" });
  const result = deriveAgentStatus(false, NOW, runningJob, woSignal, activity({ status: "THINKING" }), candidate());
  assert.equal(result.status, "OFFLINE");
});

// ── EVIDENCE LINK FORMAT ──────────────────────────────────────────────────────

test("WorkOrder evidence link includes work order id", () => {
  const result = deriveAgentStatus(
    true, NOW, null,
    workOrder({ status: "IN_PROGRESS", hasActiveExternalRun: true, activeExternalRunId: "run-1" }),
    null, null,
  );
  assert.ok(result.evidenceLink?.includes("wo-1"), `Expected link to include wo-1, got: ${result.evidenceLink}`);
});

test("knowledge candidate evidence link points to knowledge lab", () => {
  const result = deriveAgentStatus(true, NOW, null, null, null, candidate({ id: "cand-abc" }));
  assert.equal(result.evidenceLink, "/knowledge-lab/candidates");
  assert.equal(result.evidenceId, "cand-abc");
});

test("AutomationJob evidence link is work-order-focused", () => {
  const result = deriveAgentStatus(true, NOW, job({ status: "RUNNING", mode: "SANDBOX_PATCH", workOrderId: "wo-XYZ" }), null, null, null);
  assert.ok(result.evidenceLink?.includes("wo-XYZ"));
});

// ── MISSING / PARTIAL EVIDENCE ────────────────────────────────────────────────

test("missing evidence (null traceId on activity) returns result without crashing", () => {
  const act = activity({ status: "THINKING", traceId: null });
  const result = deriveAgentStatus(true, NOW, null, null, act, null);
  assert.equal(result.status, "THINKING");
  assert.equal(result.evidenceLink, null); // no trace to link
  assert.equal(result.confidence, "HIGH");
});
