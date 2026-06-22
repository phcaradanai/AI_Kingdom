import { resolveLocation, type LocationKey } from "@/components/kingdom/agentPresence";
import { SCENE_ZONES } from "@/components/kingdom/sceneConfig";
import type { AgentPresenceDto, AgentPresenceState } from "@/types/api";

export type ScenePoint = { left: number; top: number };
export type MotionFacing = "left" | "right";

export type SceneMotionCharacter = {
  agent: AgentPresenceDto;
  location: LocationKey;
  point: ScenePoint;
  facing: MotionFacing;
  transitionDelayMs: number;
  transitionDurationMs: number;
};

const STATE_DEPTH: Record<AgentPresenceState, number> = {
  IDLE: 0.74,
  THINKING: 0.6,
  COUNCIL: 0.56,
  WORKING: 0.66,
  RUNNING: 0.63,
  WAITING_REVIEW: 0.82,
  BLOCKED: 0.79,
  ERROR: 0.79
};

const DRIFT_PATTERN = [-1, -0.3, 0.75, 0.2, 1, -0.55] as const;
const DEPTH_PATTERN = [0.02, -0.025, 0.01, -0.01, 0.025, -0.015] as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveMotionPoint(
  agent: AgentPresenceDto,
  residentIndex: number,
  residentCount: number,
  cycle: number
): ScenePoint {
  const location = resolveLocation(agent);
  const zone = SCENE_ZONES[location];
  const seed = hashString(agent.id);
  const phase = (cycle + seed) % DRIFT_PATTERN.length;
  const lane = (residentIndex + 1) / (residentCount + 1);
  const maxDrift = Math.min(0.09, 0.3 / Math.max(2, residentCount + 1));
  const localX = clamp(lane + (DRIFT_PATTERN[phase] ?? 0) * maxDrift, 0.14, 0.86);
  const localY = clamp(STATE_DEPTH[agent.state] + (DEPTH_PATTERN[phase] ?? 0), 0.5, 0.84);

  return {
    left: zone.x + zone.w * localX,
    top: zone.y + zone.h * localY
  };
}

export function buildSceneMotion(agents: AgentPresenceDto[], cycle: number): SceneMotionCharacter[] {
  const byLocation = new Map<LocationKey, AgentPresenceDto[]>();
  for (const agent of agents) {
    const location = resolveLocation(agent);
    const residents = byLocation.get(location) ?? [];
    residents.push(agent);
    byLocation.set(location, residents);
  }

  return agents.map((agent) => {
    const location = resolveLocation(agent);
    const residents = byLocation.get(location) ?? [agent];
    const residentIndex = residents.findIndex((resident) => resident.id === agent.id);
    const point = resolveMotionPoint(agent, residentIndex, residents.length, cycle);
    const previous = resolveMotionPoint(agent, residentIndex, residents.length, Math.max(0, cycle - 1));
    const seed = hashString(agent.id);

    return {
      agent,
      location,
      point,
      facing: point.left >= previous.left ? "right" : "left",
      transitionDelayMs: seed % 620,
      transitionDurationMs: 1050 + (seed % 420)
    };
  });
}
