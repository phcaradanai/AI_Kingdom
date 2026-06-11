import { describe, it } from "node:test";
import assert from "node:assert";
import { isAutoPatchEligible, RiskPolicyContext } from "./livingLoopRiskPolicyService.js";

describe("M17D-3: Living Loop Risk Policy Service", () => {
  const baseCtx: RiskPolicyContext = {
    candidate: { id: "c1", confidence: 90, riskLevel: "LOW", proposedAction: {} },
    workOrder: { id: "w1", status: "NEEDS_REVIEW", projectId: "p1" },
    runnerOnline: true,
    activeJobCount: 0,
    recentJobCount: 0,
    todayJobCount: 0,
    maxDailyJobs: 3,
    minConfidence: 85
  };

  it("returns eligible for safe candidate", () => {
    const result = isAutoPatchEligible(baseCtx);
    assert.strictEqual(result.eligible, true);
  });

  it("blocks if confidence is below threshold", () => {
    const ctx = { ...baseCtx, candidate: { ...baseCtx.candidate, confidence: 80 } };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.skippedReason?.includes("Confidence"), true);
  });

  it("blocks if risk level is not LOW", () => {
    const ctx = { ...baseCtx, candidate: { ...baseCtx.candidate, riskLevel: "MEDIUM" as any } };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.auditAction, "auto_patch_risk_policy_blocked");
  });

  it("blocks if active job exists", () => {
    const ctx = { ...baseCtx, activeJobCount: 1 };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.skippedReason?.includes("Active automation job"), true);
  });

  it("blocks if cooldown prevents execution", () => {
    const ctx = { ...baseCtx, recentJobCount: 1 };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.auditAction, "auto_patch_cooldown_blocked");
  });

  it("blocks if daily limit reached", () => {
    const ctx = { ...baseCtx, todayJobCount: 3 };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.auditAction, "auto_patch_daily_limit_blocked");
  });

  it("blocks if no online runner", () => {
    const ctx = { ...baseCtx, runnerOnline: false };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.skippedReason?.includes("No online runner"), true);
  });

  it("blocks blocked path hints", () => {
    const ctx = {
      ...baseCtx,
      candidate: {
        ...baseCtx.candidate,
        proposedAction: { fileHints: ["src/auth/login.ts"] }
      }
    };
    const result = isAutoPatchEligible(ctx);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.auditAction, "auto_patch_risk_policy_blocked");
  });
});
