import { Activity, BarChart3, Eye, Network, Sparkles } from "lucide-react";
import type { AgentActivityStatus, LivingAgentSummaryDto } from "@/types/api";

export type ProfileSection =
  | "overview"
  | "timeline"
  | "work"
  | "usage"
  | "knowledge";

export const PROFILE_SECTIONS = [
  { id: "overview" as const, icon: Eye },
  { id: "timeline" as const, icon: Activity },
  { id: "work" as const, icon: Network },
  { id: "usage" as const, icon: BarChart3 },
  { id: "knowledge" as const, icon: Sparkles },
];

const PORTRAIT_STATUSES = new Set<AgentActivityStatus>([
  "IDLE",
  "QUEUED",
  "THINKING",
  "WAITING_PROVIDER",
  "RESPONDING",
  "SUMMARIZING",
  "EXTRACTING_MEMORY",
  "GENERATING_REPORT",
  "COMPLETED",
  "FAILED",
]);
export const ACTIVE_ACTIVITY_STATUSES = new Set([
  "QUEUED",
  "THINKING",
  "WAITING_PROVIDER",
  "RESPONDING",
  "SUMMARIZING",
  "EXTRACTING_MEMORY",
  "GENERATING_REPORT",
]);

export function getProfileName(agent: LivingAgentSummaryDto) {
  return agent.displayName ?? agent.canonicalName ?? agent.name;
}

export function getProfileTitle(agent: LivingAgentSummaryDto) {
  return agent.displayTitle ?? agent.canonicalTitle ?? agent.title;
}

export function getPortraitStatus(status: string): AgentActivityStatus {
  return PORTRAIT_STATUSES.has(status as AgentActivityStatus)
    ? (status as AgentActivityStatus)
    : "IDLE";
}

export function getStatusTone(status: string) {
  if (status === "FAILED")
    return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "STALE")
    return "border-amber-400/40 bg-amber-400/10 text-amber-400";
  if (ACTIVE_ACTIVITY_STATUSES.has(status))
    return "border-primary/40 bg-primary/10 text-primary";
  if (status === "COMPLETED")
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-400";
  return "border-border bg-muted/25 text-muted-foreground";
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
