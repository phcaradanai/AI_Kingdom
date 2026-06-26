/**
 * External-agent CLI capability probe.
 *
 * The Kingdom must not auto-pick an external agent (Claude Code, Codex, Cline, ...)
 * that isn't actually runnable on the runner host at this moment — some are simply
 * not installed/available. The runner is where every external-agent job executes
 * (bridge jobs and SANDBOX_PATCH agentCli alike run here), so it is the only place
 * that can honestly answer "is this CLI present right now?". This probe resolves a
 * candidate command per agent type and checks whether the binary is on PATH (or is
 * an existing executable file), then the runner reports the result in its heartbeat.
 *
 * It NEVER runs the agent — it only checks the binary exists. Cheap and side-effect free.
 */

import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// Agent types the King uses, with the default CLI binary name to look for when the
// operator hasn't set an explicit AGENT_CLI_<TYPE>_COMMAND. Types with no sensible
// default CLI (manual / generic) are intentionally omitted from default probing.
const DEFAULT_COMMANDS: Record<string, string> = {
  CLAUDE_CODE: "claude",
  CODEX: "codex",
  CLINE: "cline",
  KILO: "kilo",
  ANTIGRAVITY: "agy",      // Google Antigravity CLI — binary is 'agy', not 'antigravity'
  HERMES: "hermes",
  OPENCODE: "opencode",
  CURSOR: "agent",          // Cursor CLI — binary is 'agent', not 'cursor' or 'cursor-agent'
  DEVIN: "devin"
};

export interface AgentCapability {
  type: string;
  command: string | null; // first token of the resolved command, null if none configured/known
  source: "env" | "default" | "none";
  available: boolean;
  detail?: string;
}

function typeKey(agentType: string): string {
  return agentType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Extract the executable token from a command template (handles absolute paths,
// "cmd -p {PROMPT}", "cmd < {promptFile}"). Returns the first whitespace-delimited token.
export function extractExecutable(commandTemplate: string): string | null {
  const trimmed = (commandTemplate ?? "").trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

/** Default resolver: is `executable` an existing executable file or resolvable on PATH? */
export function defaultIsExecutableAvailable(executable: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!executable) return false;
  const isExec = (p: string): boolean => {
    try {
      if (!statSync(p).isFile()) return false;
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  // Absolute or explicitly-relative path → check directly.
  if (executable.includes("/")) return isExec(path.resolve(executable));
  // Bare name → search PATH.
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    if (isExec(path.join(dir, executable))) return true;
  }
  return false;
}

/**
 * Probe every known agent type. For each, resolve the candidate command (explicit
 * AGENT_CLI_<TYPE>_COMMAND env wins, else the default binary name) and check whether
 * its executable is available. `isAvailable` is injectable for testing.
 */
export function probeAgentCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  isAvailable: (executable: string, env: NodeJS.ProcessEnv) => boolean = defaultIsExecutableAvailable
): AgentCapability[] {
  const results: AgentCapability[] = [];
  for (const type of Object.keys(DEFAULT_COMMANDS)) {
    const key = typeKey(type);
    const envCommand = (env[`AGENT_CLI_${key}_COMMAND`] ?? "").trim();
    const source: AgentCapability["source"] = envCommand ? "env" : "default";
    const template = envCommand || DEFAULT_COMMANDS[type] || "";
    const executable = extractExecutable(template);
    if (!executable) {
      results.push({ type, command: null, source: "none", available: false, detail: "no command configured" });
      continue;
    }
    const available = isAvailable(executable, env);
    results.push({
      type,
      command: executable,
      source,
      available,
      detail: available ? undefined : `'${executable}' not found on runner host`
    });
  }
  return results;
}
