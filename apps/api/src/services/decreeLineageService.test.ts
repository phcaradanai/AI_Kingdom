import { describe, it } from "node:test";
import assert from "node:assert";
import { getDecreeLineage } from "./decreeLineageService.js";

describe("getDecreeLineage", () => {
  it("returns a well-formed all-null lineage for an unknown anchor (never throws)", async () => {
    const l = await getDecreeLineage({ workOrderId: "does-not-exist" });
    assert.deepEqual(l.anchor, { workOrderId: "does-not-exist", taskId: null, sessionId: null });
    assert.strictEqual(l.decree, null);
    assert.strictEqual(l.council, null);
    assert.strictEqual(l.owner, null);
    assert.strictEqual(l.externalPrompt, null);
    assert.strictEqual(l.externalResult, null);
    assert.strictEqual(l.review, null);
    // No work order → no synthesized secretary summary either.
    assert.strictEqual(l.secretarySummary, null);
  });

  it("returns null owner for an unknown task anchor", async () => {
    const l = await getDecreeLineage({ taskId: "does-not-exist" });
    assert.strictEqual(l.anchor.taskId, "does-not-exist");
    assert.strictEqual(l.owner, null);
  });
});
