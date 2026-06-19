/**
 * Agent CLI execution — lets the runner drive an external agent CLI (Claude Code,
 * Codex, etc.) headlessly inside the isolated job workspace so it can make REAL edits.
 *
 * Hard constraints (consistent with the rest of the runner):
 * - Disabled unless the operator explicitly sets AGENT_CLI_ENABLED=true on the runner.
 * - Each agent type must be explicitly configured (AGENT_CLI_<TYPE>_COMMAND); nothing
 *   is invoked implicitly.
 * - Always spawned with shell:false and a working directory pinned inside the workspace.
 * - Always bounded by a timeout.
 * - The runner never pushes/merges/deploys — the resulting diff is captured as a
 *   SANDBOX_PATCH artifact and reviewed by the King exactly like any other patch.
 *
 * Configuration (environment, on the runner process):
 *   AGENT_CLI_ENABLED=true
 *   AGENT_CLI_CLAUDE_CODE_COMMAND=claude
 *   AGENT_CLI_CLAUDE_CODE_ARGS=["-p","{PROMPT}"]      # JSON array or space-separated
 *   AGENT_CLI_CODEX_COMMAND=codex
 *   AGENT_CLI_CODEX_TIMEOUT_MS=900000                 # optional per-type override
 * If the args contain the token {PROMPT} it is replaced with the work order prompt;
 * otherwise the prompt is written to the process stdin.
 */

import { spawn, type SpawnOptions } from "node:child_process";
import path from "node:path";
import { getCommandTimeoutMs } from "./runnerConfig.js";

export const PROMPT_TOKEN = "{PROMPT}";

export interface AgentCliConfig {
  command: string;
  args: string[];
  promptViaStdin: boolean;
  timeoutMs: number;
}

export type ResolveAgentCliResult =
  | { enabled: true; config: AgentCliConfig }
  | { enabled: false; reason: string };

function normalizeTypeKey(agentType: string): string {
  return agentType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseArgs(raw: string | undefined): string[] {
  const value = (raw ?? "").trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  } catch {
    // not JSON — fall through to whitespace split
  }
  return value.split(/\s+/).filter(Boolean);
}

/**
 * Resolve the CLI configuration for a given external agent type from the runner's environment.
 * Returns a disabled result (with a human-readable reason) when the feature is off or the
 * agent type has not been configured — callers should surface that reason and skip execution.
 */
export function resolveAgentCliConfig(
  agentType: string,
  env: NodeJS.ProcessEnv = process.env
): ResolveAgentCliResult {
  if ((env.AGENT_CLI_ENABLED ?? "").trim().toLowerCase() !== "true") {
    return { enabled: false, reason: "Agent CLI execution is disabled. Set AGENT_CLI_ENABLED=true on the runner to allow it." };
  }
  const key = normalizeTypeKey(agentType);
  if (!key) {
    return { enabled: false, reason: "Missing or invalid agent type for CLI execution." };
  }
  const command = (env[`AGENT_CLI_${key}_COMMAND`] ?? "").trim();
  if (!command) {
    return { enabled: false, reason: `No CLI configured for agent type "${agentType}". Set AGENT_CLI_${key}_COMMAND on the runner.` };
  }
  const args = parseArgs(env[`AGENT_CLI_${key}_ARGS`]);
  const promptViaStdin = !args.includes(PROMPT_TOKEN);
  const perType = Number.parseInt(env[`AGENT_CLI_${key}_TIMEOUT_MS`] ?? "", 10);
  const timeoutMs = Number.isFinite(perType) && perType > 0 ? perType : getCommandTimeoutMs(env);
  return { enabled: true, config: { command, args, promptViaStdin, timeoutMs } };
}

export interface AgentCliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  output: string;
  timedOut: boolean;
  durationMs: number;
}

type SpawnLike = typeof spawn;

function resolveWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot);
}

/**
 * Run the configured agent CLI in the workspace with the given prompt. Output is returned raw;
 * the caller is responsible for redaction before persisting/reporting (consistent with how
 * the runner handles other command output).
 */
export async function runAgentCli(opts: {
  config: AgentCliConfig;
  prompt: string;
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: SpawnLike;
}): Promise<AgentCliRunResult> {
  const cwd = resolveWorkspaceRoot(opts.workspaceRoot);
  const args = opts.config.args.map((arg) => (arg === PROMPT_TOKEN ? opts.prompt : arg));
  const spawnImpl = opts.spawnImpl ?? spawn;
  const startedAt = Date.now();

  const spawnOptions: SpawnOptions = {
    cwd,
    env: opts.env ?? process.env,
    shell: false, // NEVER shell: true
    stdio: ["pipe", "pipe", "pipe"],
    timeout: opts.config.timeoutMs
  };

  return new Promise<AgentCliRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    let child: ReturnType<SpawnLike>;
    try {
      child = spawnImpl(opts.config.command, args, spawnOptions);
    } catch (err) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        output: `Failed to launch agent CLI: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opts.config.timeoutMs);

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        output: `${stdout}\n${stderr}`.trim(),
        timedOut,
        durationMs: Date.now() - startedAt
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (err: Error) => {
      stderr += `\n${err.message}`;
      finish(-1);
    });
    child.on("close", (code: number | null) => finish(timedOut ? null : code));

    if (opts.config.promptViaStdin && child.stdin) {
      child.stdin.write(opts.prompt);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}
