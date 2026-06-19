import assert from "node:assert/strict";
import test from "node:test";
import { selectMissionControlTopAction } from "./missionControlService.js";
import type { MissionControlTopActionDto } from "../types/api.js";

type Candidate = Omit<MissionControlTopActionDto, "priority"> & { observedAt: Date };

function candidate(priorityKey: MissionControlTopActionDto["priorityKey"], observedAt = new Date("2026-06-19T00:00:00.000Z")): Candidate {
  return {
    id: priorityKey,
    priorityKey,
    severity: priorityKey === "NO_URGENT_ACTION" ? "INFO" : "WARNING",
    title: priorityKey,
    detail: "detail",
    nextAction: "act",
    routeTo: "/work-orders",
    sourceReference: { sourceType: "Test", sourceId: priorityKey, routeTo: "/work-orders" },
    observedAt
  };
}

test("selectMissionControlTopAction follows mission control priority order", () => {
  const top = selectMissionControlTopAction([
    candidate("PROVIDER_ROUTING_WARNING"),
    candidate("WORK_ORDER_NEEDS_REVIEW"),
    candidate("STALE_CONTEXT_BLOCKING_PATCH"),
    candidate("WORK_ORDER_READY_TO_DISPATCH"),
    candidate("FAILED_OR_REJECTED_REVIEW")
  ]);

  assert.equal(top.priorityKey, "FAILED_OR_REJECTED_REVIEW");
  assert.equal(top.priority, 2);
});

test("selectMissionControlTopAction always ranks blocked runner/job first", () => {
  const top = selectMissionControlTopAction([
    candidate("FAILED_OR_REJECTED_REVIEW"),
    candidate("STALE_CONTEXT_BLOCKING_PATCH"),
    candidate("CRITICAL_BLOCKED_RUNNER_JOB")
  ]);

  assert.equal(top.priorityKey, "CRITICAL_BLOCKED_RUNNER_JOB");
  assert.equal(top.priority, 1);
});

test("selectMissionControlTopAction breaks ties by latest observedAt", () => {
  const oldReady = { ...candidate("WORK_ORDER_READY_TO_DISPATCH", new Date("2026-06-18T00:00:00.000Z")), id: "old-ready" };
  const newerReady = { ...candidate("WORK_ORDER_READY_TO_DISPATCH", new Date("2026-06-19T00:00:00.000Z")), id: "newer-ready" };

  const top = selectMissionControlTopAction([oldReady, newerReady]);

  assert.equal(top.id, newerReady.id);
});

test("selectMissionControlTopAction returns no urgent action fallback", () => {
  const top = selectMissionControlTopAction([]);

  assert.equal(top.priorityKey, "NO_URGENT_ACTION");
  assert.equal(top.severity, "INFO");
  assert.equal(top.priority, 7);
});
