import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAgentDisplayProfile } from "./agentDisplayProfileService.js";

describe("extractAgentDisplayProfile", () => {
  it("normalizes the saved display profile from Agent.config", () => {
    assert.deepEqual(
      extractAgentDisplayProfile({
        displayProfile: {
          displayName: "Melody Prime",
          displayTitle: "Planning Steward",
          avatarUrl: "/uploads/agents/melody.png",
          avatarVersion: 4,
          canonicalName: "Melody",
          canonicalTitle: "Royal Planner",
          coreSlug: "planner"
        }
      }),
      {
        displayName: "Melody Prime",
        displayTitle: "Planning Steward",
        avatarUrl: "/uploads/agents/melody.png",
        avatarPrompt: null,
        avatarStyle: null,
        avatarVersion: 4,
        avatarUpdatedAt: null,
        canonicalName: "Melody",
        canonicalTitle: "Royal Planner",
        coreSlug: "planner"
      }
    );
  });

  it("returns stable empty defaults for malformed config", () => {
    const profile = extractAgentDisplayProfile({ displayProfile: "invalid" });
    assert.equal(profile.displayName, null);
    assert.equal(profile.avatarUrl, null);
    assert.equal(profile.avatarVersion, 1);
  });
});
