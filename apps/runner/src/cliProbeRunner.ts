/**
 * On-demand CLI capability probe.
 *
 * Triggered by the API via the heartbeat response (pendingCliProbe).
 * For most agent types this runs `--version` to confirm the binary actually
 * executes.  For types that support a single-line model invocation (CLAUDE_CODE),
 * when AGENT_CLI_ENABLED=true this also hits the model API so auth errors,
 * credit exhaustion, and rate limits can be detected.
 *
 * Results are sent back in the next heartbeat body as `cliProbeResult`.
 */

import { spawnSync } from "node:child_process";
import { extractExecutable } from "./agentCapabilityProbe.js";

export type CliProbeStatus =
  | "READY"
  | "NOT_INSTALLED"
  | "AGENT_CLI_DISABLED"
  | "AUTH_ERROR"
  | "CREDIT_EXHAUSTED"
  | "RATE_LIMITED"
  | "EXEC_FAILED"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export interface CliProbeResult {
  agentId: string;
  type: string;
  status: CliProbeStatus;
  output: string;
  isDeepProbe: boolean;
  checkedAt: string;
}

// Default CLI binary names per agent type (must mirror agentCapabilityProbe DEFAULT_COMMANDS)
const DEFAULT_COMMANDS: Record<string, string> = {
  CLAUDE_CODE: "claude",
  CODEX: "codex",
  CLINE: "cline",
  KILO: "kilo",
  ANTIGRAVITY: "agy",      // Google Antigravity — binary is 'agy', not 'antigravity'
  HERMES: "hermes",
  OPENCODE: "opencode",
  CURSOR: "agent",          // Cursor CLI — binary is 'agent', not 'cursor-agent'
  DEVIN: "devin",
};

// Types that support a minimal one-shot model-API invocation for deep auth/credit checking.
// All others fall back to --version only.
const DEEP_PROBE_ARGS: Record<string, string[]> = {
  CLAUDE_CODE: ["-p", "Reply with exactly: KINGDOM_PROBE_OK", "--dangerously-skip-permissions"],
  CODEX:       ["exec", "Reply with exactly: KINGDOM_PROBE_OK"],
  CLINE:       ["Reply with exactly: KINGDOM_PROBE_OK"],
  KILO:        ["run", "Reply with exactly: KINGDOM_PROBE_OK"],
  OPENCODE:    ["run", "Reply with exactly: KINGDOM_PROBE_OK"],
  ANTIGRAVITY: ["-p", "Reply with exactly: KINGDOM_PROBE_OK"],
  HERMES:      ["-z", "Reply with exactly: KINGDOM_PROBE_OK"],
  CURSOR:      ["-p", "Reply with exactly: KINGDOM_PROBE_OK"],
  DEVIN:       ["--", "Reply with exactly: KINGDOM_PROBE_OK"],
};

const AUTH_PATTERN = /unauthorized|invalid.*api.*key|authentication.*fail|please.*log.*in|run.*login|auth.*required|invalid.*token|api key not|401/i;
const CREDIT_PATTERN = /insufficient.*credit|quota.*exceed|payment.*required|upgrade.*plan|credit.*exhaust|out of credits|billing|no credits|overloaded/i;
const RATE_PATTERN = /rate.*limit|too many.*request|429|slow.*down|retry.*after/i;
const READY_PATTERN = /KINGDOM_PROBE_OK|\d+\.\d+/;

function typeKey(agentType: string): string {
  return agentType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function classifyOutput(output: string, exitCode: number | null): CliProbeStatus {
  if (AUTH_PATTERN.test(output)) return "AUTH_ERROR";
  if (CREDIT_PATTERN.test(output)) return "CREDIT_EXHAUSTED";
  if (RATE_PATTERN.test(output)) return "RATE_LIMITED";
  if (READY_PATTERN.test(output)) return "READY";
  if (exitCode === 0) return "READY";
  return "UNKNOWN_ERROR";
}

export function runCliProbe(
  agentId: string,
  type: string,
  env: NodeJS.ProcessEnv = process.env,
): CliProbeResult {
  const checkedAt = new Date().toISOString();
  const key = typeKey(type);
  const envCommand = (env[`AGENT_CLI_${key}_COMMAND`] ?? "").trim();
  const template = envCommand || DEFAULT_COMMANDS[type] || "";
  const executable = extractExecutable(template);

  if (!executable) {
    return { agentId, type, status: "NOT_INSTALLED", output: "No command configured for this agent type", isDeepProbe: false, checkedAt };
  }

  const agentCliEnabled = (env.AGENT_CLI_ENABLED ?? "").trim().toLowerCase() === "true";
  const deepArgs = DEEP_PROBE_ARGS[type];
  const isDeepProbe = agentCliEnabled && !!deepArgs;
  const probeArgs = isDeepProbe ? deepArgs : ["--version"];

  const spawnResult = spawnSync(executable, probeArgs, {
    timeout: 15_000,
    encoding: "utf8",
    env: { ...env },
    shell: false,
  });

  if (spawnResult.error) {
    const msg = spawnResult.error.message ?? "";
    if (msg.includes("ENOENT")) return { agentId, type, status: "NOT_INSTALLED", output: `Binary '${executable}' not found on PATH`, isDeepProbe, checkedAt };
    if (msg.includes("ETIMEDOUT")) return { agentId, type, status: "TIMEOUT", output: "Probe timed out after 15 s", isDeepProbe, checkedAt };
    return { agentId, type, status: "EXEC_FAILED", output: msg.slice(0, 300), isDeepProbe, checkedAt };
  }

  if (spawnResult.signal === "SIGTERM") {
    return { agentId, type, status: "TIMEOUT", output: "Probe timed out after 15 s", isDeepProbe, checkedAt };
  }

  const stdout = (spawnResult.stdout ?? "").trim();
  const stderr = (spawnResult.stderr ?? "").trim();
  const output = (stdout || stderr).slice(0, 500);
  const status = classifyOutput(output, spawnResult.status);

  // If not deep probe but AGENT_CLI_DISABLED, annotate so UI can distinguish "binary executes"
  // from "API was also tested"
  if (!isDeepProbe && deepArgs && status === "READY") {
    return { agentId, type, status: "AGENT_CLI_DISABLED", output, isDeepProbe: false, checkedAt };
  }

  return { agentId, type, status, output, isDeepProbe, checkedAt };
}
