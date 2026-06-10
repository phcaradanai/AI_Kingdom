/**
 * Sandbox executor for the runner.
 *
 * Key invariants:
 * - Never uses shell: true
 * - Validates command before spawn
 * - cwd must stay inside workspaceRoot
 * - All output is redacted before returning
 * - Each command has a timeout
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { validateCommand } from "./commandValidator.js";
import { sanitizeLogOutput } from "./secretRedactor.js";

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000; // 2 minutes

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  allowed: boolean;
  blockReason?: string;
}

export interface RunCommandOptions {
  workspaceRoot: string;
  cwd?: string;
  jobAllowedCommands?: string[];
  timeoutMs?: number;
}

function assertCwdInWorkspace(workspaceRoot: string, cwd: string): void {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(cwd);
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootSep)) {
    throw new Error(`CWD escapes workspace: ${resolved} is outside ${root}`);
  }
}

/** Strip secrets from process environment before passing to child */
function sanitizeEnv(): NodeJS.ProcessEnv {
  const blocked = new Set([
    "RUNNER_TOKEN",
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "JWT_SECRET",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "DEEPSEEK_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_COMPATIBLE_API_KEY",
    "OPENAI_COMPATIBLE_BASE_URL"
  ]);

  const safe: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!blocked.has(key) && value !== undefined) {
      safe[key] = value;
    }
  }
  return safe;
}

export async function runCommand(
  command: string,
  args: string[],
  opts: RunCommandOptions
): Promise<ExecutionResult> {
  // 1. Validate against allowlist
  const validation = validateCommand(command, args, opts.jobAllowedCommands);
  if (!validation.allowed) {
    return {
      exitCode: -1,
      stdout: "",
      stderr: "",
      output: `[BLOCKED] ${validation.reason}`,
      durationMs: 0,
      allowed: false,
      blockReason: validation.reason
    };
  }

  // 2. Assert cwd is inside workspace
  const effectiveCwd = opts.cwd ?? opts.workspaceRoot;
  assertCwdInWorkspace(opts.workspaceRoot, effectiveCwd);

  const startedAt = Date.now();
  const timeout = opts.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: path.resolve(effectiveCwd),
      env: sanitizeEnv(),
      shell: false,           // NEVER shell: true
      timeout
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const rawOutput = timedOut
        ? `[TIMEOUT after ${timeout}ms]\n${stdout}\n${stderr}`
        : `${stdout}\n${stderr}`;
      resolve({
        exitCode: timedOut ? -2 : (code ?? -1),
        stdout: sanitizeLogOutput(stdout),
        stderr: sanitizeLogOutput(stderr),
        output: sanitizeLogOutput(rawOutput),
        durationMs,
        allowed: true
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: sanitizeLogOutput(err.message),
        output: sanitizeLogOutput(err.message),
        durationMs,
        allowed: true
      });
    });
  });
}
