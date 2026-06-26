import type { ExternalAgentDto, ExternalAgentPayload, ExternalAgentReadinessDto, ExternalAgentType } from "@/types/api";

export type ExternalAgentFilter = "all" | "ready" | "manual" | "attention" | "inactive";

export type AgentInstallHint = {
  /** Binary name only — for auto-fill into the command field */
  commandTemplate: string;
  /** Runner env vars to set (AGENT_CLI_<TYPE>_COMMAND and _ARGS) */
  runnerEnv: string;
  installCommand: string;
  checkCommand: string;
  docsUrl?: string;
  note?: string;
};

export const AGENT_INSTALL_HINTS: Partial<Record<ExternalAgentType, AgentInstallHint>> = {
  CLAUDE_CODE: {
    commandTemplate: "claude -p {PROMPT} --dangerously-skip-permissions",
    runnerEnv: 'AGENT_CLI_CLAUDE_CODE_COMMAND=claude\nAGENT_CLI_CLAUDE_CODE_ARGS=["-p","{PROMPT}","--dangerously-skip-permissions"]',
    installCommand: "npm install -g @anthropic-ai/claude-code",
    checkCommand: "claude --version",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  CODEX: {
    commandTemplate: "codex exec {promptFile}",
    runnerEnv: "AGENT_CLI_CODEX_COMMAND=codex\nAGENT_CLI_CODEX_ARGS=exec",
    installCommand: "npm install -g @openai/codex",
    checkCommand: "codex --version",
    docsUrl: "https://github.com/openai/codex",
  },
  CLINE: {
    commandTemplate: "cline",
    runnerEnv: "AGENT_CLI_CLINE_COMMAND=cline",
    installCommand: "VS Code extension: Cline (saoudrizwan.claude-dev)",
    checkCommand: "which cline",
    docsUrl: "https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev",
    note: "Primarily a VS Code extension; CLI availability depends on extension and system PATH.",
  },
  KILO: {
    commandTemplate: "kilo",
    runnerEnv: "AGENT_CLI_KILO_COMMAND=kilo",
    installCommand: "npm install -g kilo-code",
    checkCommand: "kilo --version",
    docsUrl: "https://kilocode.ai",
  },
  OPENCODE: {
    commandTemplate: "opencode",
    runnerEnv: "AGENT_CLI_OPENCODE_COMMAND=opencode",
    installCommand: "npm install -g opencode-ai",
    checkCommand: "opencode --version",
    docsUrl: "https://opencode.ai",
  },
  CURSOR: {
    commandTemplate: "cursor-agent",
    runnerEnv: "AGENT_CLI_CURSOR_COMMAND=cursor-agent",
    installCommand: "Download from cursor.com, then enable agent CLI in Cursor settings",
    checkCommand: "which cursor-agent",
    docsUrl: "https://cursor.com",
  },
  DEVIN: {
    commandTemplate: "devin",
    runnerEnv: "AGENT_CLI_DEVIN_COMMAND=devin",
    installCommand: "Refer to Devin API documentation for CLI setup",
    checkCommand: "which devin",
    docsUrl: "https://devin.ai",
  },
  ANTIGRAVITY: {
    commandTemplate: "antigravity",
    runnerEnv: "AGENT_CLI_ANTIGRAVITY_COMMAND=antigravity",
    installCommand: "Refer to Antigravity documentation",
    checkCommand: "which antigravity",
  },
  HERMES: {
    commandTemplate: "hermes",
    runnerEnv: "AGENT_CLI_HERMES_COMMAND=hermes",
    installCommand: "Refer to Hermes documentation",
    checkCommand: "which hermes",
  },
};
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
