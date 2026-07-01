import type { AgentActivityStatus, AgentPresenceDto, AgentPresenceState, LivingAgentStateDto, LivingAgentStatusCode, LivingAgentSummaryDto } from "@/types/api";

export type LivingAgentPane = "roster" | "details";
export type LivingAgentStateFilter = "all" | "active" | "attention" | "available" | "inactive";

export type LivingAgentRecord = {
  agent: LivingAgentSummaryDto;
  presence: AgentPresenceDto | null;
  livingState: LivingAgentStateDto | null;
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

// ── Living Kingdom V2 ─────────────────────────────────────────────────────────

export const LIVING_STATUS_COLORS: Record<LivingAgentStatusCode, string> = {
  IDLE: "border-border bg-muted/20 text-muted-foreground",
  THINKING: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  PLANNING: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  WORKING: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  WAITING_FOR_KING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  WAITING_FOR_EXTERNAL_AGENT: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  VALIDATING: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  REVIEWING: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  LEARNING: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  BLOCKED: "border-destructive/30 bg-destructive/10 text-destructive",
  OFFLINE: "border-border bg-muted/30 text-muted-foreground/50",
};

export const LIVING_STATUS_DOT: Record<LivingAgentStatusCode, string> = {
  IDLE: "bg-muted-foreground/40",
  THINKING: "bg-blue-400",
  PLANNING: "bg-violet-400",
  WORKING: "bg-emerald-400",
  WAITING_FOR_KING: "bg-amber-400",
  WAITING_FOR_EXTERNAL_AGENT: "bg-cyan-400",
  VALIDATING: "bg-sky-400",
  REVIEWING: "bg-orange-400",
  LEARNING: "bg-purple-400",
  BLOCKED: "bg-destructive",
  OFFLINE: "bg-muted-foreground/20",
};

const LIVING_STATUS_PULSE: Partial<Record<LivingAgentStatusCode, boolean>> = {
  THINKING: true,
  WORKING: true,
  VALIDATING: true,
  PLANNING: true,
};

export function getLivingStatusPulse(status: LivingAgentStatusCode): boolean {
  return LIVING_STATUS_PULSE[status] ?? false;
}
