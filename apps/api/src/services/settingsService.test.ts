import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "./settingsService.js";

describe("settingsService defaults", () => {
  it("keeps internal milestone identifiers out of user-facing descriptions", () => {
    const milestonePattern = /\bM\d{1,3}[A-Z]?(?:-\d+)?\b/;
    const violations = DEFAULT_SETTINGS
      .filter((setting) => milestonePattern.test(setting.description))
      .map((setting) => setting.key);

    assert.deepEqual(violations, []);
  });
});
