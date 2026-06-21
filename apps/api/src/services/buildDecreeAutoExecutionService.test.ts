import { describe, it } from "node:test";
import assert from "node:assert";
import { maybeAutoExecuteBuildWorkOrder } from "./buildDecreeAutoExecutionService.js";

// These exercise the early, dependency-free guardrails. They run against the test
// DB env (getBooleanSetting falls back to the seeded default of OFF), so the
// risk/setting gates are deterministic without mocking the bridge or runner.
describe("maybeAutoExecuteBuildWorkOrder gating", () => {
  it("skips non-BUILD decrees before any side effect", async () => {
    const r = await maybeAutoExecuteBuildWorkOrder({
      workOrderId: "wo-test",
      taskMode: "ASK",
      riskLevel: "LOW",
      projectId: "p1",
      userId: "u1"
    });
    assert.strictEqual(r.executed, false);
    assert.match(r.skipReason ?? "", /not a BUILD decree/);
  });

  it("skips BUILD decrees when COUNCIL_AUTO_EXECUTE_LOW_RISK is disabled (default)", async () => {
    const r = await maybeAutoExecuteBuildWorkOrder({
      workOrderId: "wo-test",
      taskMode: "BUILD",
      riskLevel: "LOW",
      projectId: "p1",
      userId: "u1"
    });
    assert.strictEqual(r.executed, false);
    assert.match(r.skipReason ?? "", /COUNCIL_AUTO_EXECUTE_LOW_RISK is disabled/);
  });

  it("never throws and always returns a structured result", async () => {
    const r = await maybeAutoExecuteBuildWorkOrder({
      workOrderId: "",
      taskMode: "BUILD",
      projectId: null,
      userId: "u1"
    });
    assert.strictEqual(typeof r.executed, "boolean");
    assert.strictEqual(r.executed, false);
    assert.ok(r.skipReason);
  });
});
