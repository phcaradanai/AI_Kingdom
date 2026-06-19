import { ClaudeCodeAdapter } from "./claudeCodeAdapter.js";
import { CodexAdapter } from "./codexAdapter.js";
import { GenericCliAdapter } from "./genericCliAdapter.js";
import type { ExternalAgentAdapter, RunnerExternalAgent } from "./types.js";

export function getExternalAgentAdapter(agent: RunnerExternalAgent): ExternalAgentAdapter {
  if (agent.type === "CLAUDE_CODE") return new ClaudeCodeAdapter();
  if (agent.type === "CODEX") return new CodexAdapter();
  return new GenericCliAdapter();
}
