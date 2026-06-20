import { describe, expect, it } from "vitest";
import { MESSAGES, resolveMessage } from "./i18nMessages";

describe("semantic i18n messages", () => {
  it("keeps English and Thai key sets in parity", () => {
    expect(Object.keys(MESSAGES.th).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });

  it("interpolates Mission Control values in both languages", () => {
    expect(resolveMessage("kingdomOps.activeCount", "en", { count: 3 })).toBe("3 active");
    expect(resolveMessage("kingdomOps.activeCount", "th", { count: 3 })).toBe("ทำงานอยู่ 3");
  });
});
