import type { AgentActivityStatus, AgentPresenceDto, AgentPresenceState, LivingAgentSummaryDto } from "@/types/api";

export type LivingAgentPane = "roster" | "details";
export type LivingAgentStateFilter = "all" | "active" | "attention" | "available" | "inactive";

export type LivingAgentRecord = {
  agent: LivingAgentSummaryDto;
  presence: AgentPresenceDto | null;
};

const ACTIVE_ACTIVITY_STATUSES = new Set([
  "QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT",
]);
const ACTIVE_PRESENCE_STATES = new Set<AgentPresenceState>(["THINKING", "COUNCIL", "WORKING", "RUNNING"]);
const ATTENTION_PRESENCE_STATES = new Set<AgentPresenceState>(["WAITING_REVIEW", "BLOCKED", "ERROR"]);
const PORTRAIT_STATUSES = new Set<AgentActivityStatus>([
  "IDLE", "QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT", "COMPLETED", "FAILED",
]);

export function getAgentName(agent: LivingAgentSummaryDto) {
  return agent.displayName ?? agent.canonicalName ?? agent.name;
}

export function getAgentTitle(agent: LivingAgentSummaryDto) {
  return agent.displayTitle ?? agent.canonicalTitle ?? agent.title;
}

export function getEffectivePresenceState(record: LivingAgentRecord): AgentPresenceState {
  if (record.presence) return record.presence.state;
  if (record.agent.currentStatus === "FAILED") return "ERROR";
  if (record.agent.currentStatus === "STALE") return "BLOCKED";
  if (ACTIVE_ACTIVITY_STATUSES.has(record.agent.currentStatus)) return "WORKING";
  return "IDLE";
}

export function getPortraitStatus(status: string): AgentActivityStatus {
  return PORTRAIT_STATUSES.has(status as AgentActivityStatus) ? status as AgentActivityStatus : "IDLE";
}

export function matchesStateFilter(record: LivingAgentRecord, filter: LivingAgentStateFilter) {
  if (filter === "all") return true;
  if (filter === "inactive") return !record.agent.isActive;
  if (!record.agent.isActive) return false;
  const state = getEffectivePresenceState(record);
  if (filter === "active") return ACTIVE_PRESENCE_STATES.has(state);
  if (filter === "attention") return ATTENTION_PRESENCE_STATES.has(state);
  return state === "IDLE";
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function getRosterMetrics(records: LivingAgentRecord[]) {
  return {
    total: records.length,
    active: records.filter((record) => matchesStateFilter(record, "active")).length,
    attention: records.filter((record) => matchesStateFilter(record, "attention")).length,
    available: records.filter((record) => matchesStateFilter(record, "available")).length,
  };
}
