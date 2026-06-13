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
import { buildValidationChildEnv } from "./validationEnv.js";
import { formatTimeoutMessage, getCommandTimeoutMs } from "./runnerConfig.js";

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  cwd: string;
  allowed: boolean;
  timedOut: boolean;
  blockReason?: string;
}

export interface RunCommandOptions {
  workspaceRoot: string;
  cwd?: string;
  jobAllowedCommands?: string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

function assertCwdInWorkspace(workspaceRoot: string, cwd: string): void {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(cwd);
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootSep)) {
    throw new Error(`CWD escapes workspace: ${resolved} is outside ${root}`);
  }
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
      cwd: path.resolve(opts.cwd ?? opts.workspaceRoot),
      allowed: false,
      timedOut: false,
      blockReason: validation.reason
    };
  }

  // 2. Assert cwd is inside workspace
  const effectiveCwd = opts.cwd ?? opts.workspaceRoot;
  assertCwdInWorkspace(opts.workspaceRoot, effectiveCwd);

  const startedAt = Date.now();
  const timeout = opts.timeoutMs ?? getCommandTimeoutMs(opts.env);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: path.resolve(effectiveCwd),
      env: buildValidationChildEnv(opts.env).env,
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
        ? `[${formatTimeoutMessage(timeout)}]\n${stdout}\n${stderr}`
        : `${stdout}\n${stderr}`;
      resolve({
        exitCode: timedOut ? null : (code ?? -1),
        stdout: sanitizeLogOutput(stdout),
        stderr: sanitizeLogOutput(stderr),
        output: sanitizeLogOutput(rawOutput),
        durationMs,
        cwd: path.resolve(effectiveCwd),
        allowed: true,
        timedOut
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
        cwd: path.resolve(effectiveCwd),
        allowed: true,
        timedOut: false
      });
    });
  });
}
