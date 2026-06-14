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
import { captureOutput, extractFailureSummary, redactSecrets, sanitizeLogOutput } from "./secretRedactor.js";
import { buildValidationChildEnv } from "./validationEnv.js";
import { formatTimeoutMessage, getCommandTimeoutMs } from "./runnerConfig.js";

// Captured stdout/stderr/output is bounded tail-biased so a command can never
// be killed for producing too much output, while keeping the failure/summary
// lines (which appear near the end of TAP-style test output) intact.
const CAPTURED_OUTPUT_MAX_LINES = 2000;
const CAPTURED_OUTPUT_MAX_CHARS = 200_000;

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  cwd: string;
  allowed: boolean;
  timedOut: boolean;
  outputTruncated: boolean;
  blockReason?: string;
  message?: string;
  /** Extracted "not ok" / AssertionError / ERR_* blocks, present only when exitCode !== 0. */
  failureSummary?: string;
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
      outputTruncated: false,
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
      const stdoutCapture = captureOutput(stdout, CAPTURED_OUTPUT_MAX_LINES, CAPTURED_OUTPUT_MAX_CHARS);
      const stderrCapture = captureOutput(stderr, CAPTURED_OUTPUT_MAX_LINES, CAPTURED_OUTPUT_MAX_CHARS);
      const outputCapture = captureOutput(rawOutput, CAPTURED_OUTPUT_MAX_LINES, CAPTURED_OUTPUT_MAX_CHARS);
      const exitCode = timedOut ? null : (code ?? -1);
      const failureSummary = (!timedOut && exitCode !== 0)
        ? extractFailureSummary(redactSecrets(`${stdout}\n${stderr}`)) ?? undefined
        : undefined;
      resolve({
        exitCode,
        stdout: stdoutCapture.text,
        stderr: stderrCapture.text,
        output: outputCapture.text,
        durationMs,
        cwd: path.resolve(effectiveCwd),
        allowed: true,
        timedOut,
        outputTruncated: stdoutCapture.truncated || stderrCapture.truncated || outputCapture.truncated,
        message: timedOut ? formatTimeoutMessage(timeout) : undefined,
        failureSummary
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
        timedOut: false,
        outputTruncated: false,
        message: err.message
      });
    });
  });
}
