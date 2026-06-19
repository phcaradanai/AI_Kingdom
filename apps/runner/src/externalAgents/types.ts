export type RunnerExternalAgent = {
  id: string;
  name: string;
  type: "CLAUDE_CODE" | "CODEX" | "CLINE" | "KILO" | "ANTIGRAVITY" | "HERMES" | "OPENCODE" | "GENERIC_CLI" | "MANUAL_ONLY" | "CUSTOM";
  command: string | null;
  workingDirectory: string | null;
  environmentProfile: string | null;
  bridgeEnabled: boolean;
  maxRuntimeSeconds: number;
  requiresApproval: boolean;
  capabilities: string[];
  safetyLevel: string;
};

export type RunnerExternalAgentRun = {
  id: string;
  externalAgentId: string;
  workOrderId: string;
  automationJobId: string | null;
  status: string;
  inputPrompt: string;
  attemptNumber: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ExternalAgentAdapterContext = {
  jobId: string;
  workspaceRoot: string;
  cwd?: string;
  promptFile: string;
  promptText: string;
  timeoutMs: number;
  allowNetwork: boolean;
  allowWrite: boolean;
};

export type ExternalAgentCommandResult = {
  command: string;
  args: string[];
  displayCommand: string;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
  artifactPaths: string[];
  logPath: string | null;
  errorMessage?: string;
};

export interface ExternalAgentAdapter {
  supportsCapability(capability: string): boolean;
  execute(agent: RunnerExternalAgent, context: ExternalAgentAdapterContext): Promise<ExternalAgentCommandResult>;
}
