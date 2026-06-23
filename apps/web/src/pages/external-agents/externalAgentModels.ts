import type { ExternalAgentDto, ExternalAgentPayload, ExternalAgentReadinessDto, ExternalAgentType } from "@/types/api";

export type ExternalAgentFilter = "all" | "ready" | "manual" | "attention" | "inactive";
export type ExternalAgentSection = "identity" | "capabilities" | "handoff" | "validation" | "source";
export type ExternalAgentEditorMode = "create" | "edit" | null;

export const EXTERNAL_AGENT_TYPES: ExternalAgentType[] = [
  "CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES",
  "OPENCODE", "CURSOR", "DEVIN", "GENERIC_CLI", "MANUAL_ONLY", "CUSTOM",
];

export const EXECUTION_MODES: ExternalAgentPayload["executionMode"][] = [
  "MANUAL_COPY_PASTE", "CLI_MANUAL", "API", "FUTURE_AUTOMATED",
];

export const SAFETY_LEVELS: ExternalAgentPayload["safetyLevel"][] = [
  "LOW_RISK", "MEDIUM_RISK", "HIGH_RISK",
];

export const blankExternalAgent: ExternalAgentPayload = {
  name: "",
  type: "CUSTOM",
  roleTitle: "",
  description: "",
  capabilities: [],
  executionMode: "MANUAL_COPY_PASTE",
  command: "",
  workingDirectory: "",
  environmentProfile: "",
  isActive: true,
  bridgeEnabled: false,
  maxRuntimeSeconds: 900,
  requiresApproval: true,
  safetyLevel: "MEDIUM_RISK",
};

export function toExternalAgentPayload(agent: ExternalAgentDto): ExternalAgentPayload {
  return {
    name: agent.name,
    type: agent.type,
    roleTitle: agent.roleTitle,
    description: agent.description,
    capabilities: agent.capabilities,
    executionMode: agent.executionMode,
    command: agent.command,
    workingDirectory: agent.workingDirectory,
    environmentProfile: agent.environmentProfile,
    isActive: agent.isActive,
    bridgeEnabled: agent.bridgeEnabled,
    maxRuntimeSeconds: agent.maxRuntimeSeconds,
    requiresApproval: agent.requiresApproval,
    safetyLevel: agent.safetyLevel,
  };
}

export function isManualAgent(agent: ExternalAgentDto): boolean {
  return agent.executionMode === "MANUAL_COPY_PASTE" || agent.type === "MANUAL_ONLY" || !agent.bridgeEnabled;
}

export function needsAttention(agent: ExternalAgentDto, readiness?: ExternalAgentReadinessDto): boolean {
  if (!agent.isActive) return false;
  return !readiness?.ready && !isManualAgent(agent);
}

export function filterExternalAgents(
  agents: ExternalAgentDto[],
  readiness: Record<string, ExternalAgentReadinessDto>,
  query: string,
  filter: ExternalAgentFilter,
): ExternalAgentDto[] {
  const normalized = query.trim().toLowerCase();
  return agents.filter((agent) => {
    const matchesQuery = !normalized || [agent.name, agent.roleTitle, agent.type, agent.description, ...agent.capabilities]
      .some((value) => value.toLowerCase().includes(normalized));
    const evidence = readiness[agent.id];
    const matchesFilter = filter === "all" ||
      (filter === "ready" && Boolean(evidence?.ready)) ||
      (filter === "manual" && isManualAgent(agent)) ||
      (filter === "attention" && needsAttention(agent, evidence)) ||
      (filter === "inactive" && !agent.isActive);
    return matchesQuery && matchesFilter;
  });
}

export function externalAgentCounts(
  agents: ExternalAgentDto[],
  readiness: Record<string, ExternalAgentReadinessDto>,
) {
  return {
    total: agents.length,
    ready: agents.filter((agent) => readiness[agent.id]?.ready).length,
    manual: agents.filter(isManualAgent).length,
    attention: agents.filter((agent) => needsAttention(agent, readiness[agent.id])).length,
  };
}
