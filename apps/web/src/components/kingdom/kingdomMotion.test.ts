import { describe, expect, it } from "vitest";
import { buildSceneMotion, resolveMotionPoint } from "@/components/kingdom/kingdomMotion";
import { SCENE_ZONES } from "@/components/kingdom/sceneConfig";
import type { AgentPresenceDto } from "@/types/api";

function agent(overrides: Partial<AgentPresenceDto> = {}): AgentPresenceDto {
  return {
    id: "agent-1",
    slug: "agent-1",
    name: "Elowen",
    title: "Royal Analyst",
    role: "Analyst",
    displayName: null,
    displayTitle: null,
    avatarUrl: null,
    avatarVersion: 1,
    state: "IDLE",
    currentTask: null,
    currentWorkOrder: null,
    progress: null,
    blockingReason: null,
    lastActivityAt: null,
    ...overrides
  };
}

describe("kingdom motion model", () => {
  it("moves deterministically between safe waypoints inside the owning room", () => {
    const resident = agent();
    const first = resolveMotionPoint(resident, 0, 1, 0);
    const next = resolveMotionPoint(resident, 0, 1, 1);
    const library = SCENE_ZONES.library;

    expect(next).not.toEqual(first);
    expect(first.left).toBeGreaterThan(library.x);
    expect(first.left).toBeLessThan(library.x + library.w);
    expect(first.top).toBeGreaterThan(library.y);
    expect(first.top).toBeLessThan(library.y + library.h);
  });

  it("brings review work toward the front without changing its real state", () => {
    const thinking = resolveMotionPoint(agent({ state: "THINKING" }), 0, 1, 2);
    const review = resolveMotionPoint(agent({ state: "WAITING_REVIEW" }), 0, 1, 2);

    expect(review.top).toBeGreaterThan(thinking.top);
  });

  it("keeps residents separated and exposes stable movement timing", () => {
    const residents = [agent({ id: "a" }), agent({ id: "b", name: "Scholar" })];
    const motion = buildSceneMotion(residents, 3);

    expect(motion).toHaveLength(2);
    expect(motion[0]?.location).toBe("library");
    expect(motion[1]?.location).toBe("library");
    expect(motion[0]?.point.left).not.toBe(motion[1]?.point.left);
    expect(motion[0]?.transitionDurationMs).toBeGreaterThanOrEqual(1050);
  });
});
