import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sanitizeLogOutput } from "./secretRedactor.js";

export const PREVALIDATION_FAILURE_PREFIX = "Runner pre-validation failed";

const DEFAULT_PREVALIDATION_COMMANDS = ["npm run db:generate"];
const DEFAULT_PREVALIDATION_TIMEOUT_MS = 120_000;
const SHELL_META_PATTERN = /[|&;`$<>]/;
const ALLOWED_PREVALIDATION_SCRIPTS = new Set(["db:generate"]);

export interface PreValidationCommand {
  command: string;
  args: string[];
  displayCommand: string;
}

export interface PreValidationConfig {
  commands: PreValidationCommand[];
  timeoutMs: number;
}

export interface PreValidationStepResult extends PreValidationCommand {
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  success: boolean;
}

export interface PreValidationResult {
  success: boolean;
  failureMessage: string | null;
  steps: PreValidationStepResult[];
}

export function getPreValidationConfig(env: NodeJS.ProcessEnv = process.env): PreValidationConfig {
  const rawCommands = env.RUNNER_PREVALIDATION_COMMANDS?.trim();
  const commandLines = rawCommands
    ? rawCommands.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : DEFAULT_PREVALIDATION_COMMANDS;
  const parsedTimeout = Number.parseInt(env.RUNNER_PREVALIDATION_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
    ? parsedTimeout
    : DEFAULT_PREVALIDATION_TIMEOUT_MS;

  return {
    commands: commandLines.map(parsePreValidationCommand),
    timeoutMs
  };
}

export async function runPreValidationCommands(opts: {
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<PreValidationResult> {
  let config: PreValidationConfig;
  try {
    config = getPreValidationConfig(opts.env);
  } catch (err) {
    const output = sanitizeLogOutput(err instanceof Error ? err.message : String(err));
    return {
      success: false,
      failureMessage: output,
      steps: [{
        command: "",
        args: [],
        displayCommand: safeDisplayCommand(opts.env?.RUNNER_PREVALIDATION_COMMANDS?.trim() || DEFAULT_PREVALIDATION_COMMANDS[0]!),
        cwd: path.resolve(opts.workspaceRoot),
        exitCode: -1,
        stdout: "",
        stderr: output,
        output,
        durationMs: 0,
        success: false
      }]
    };
  }

  try {
    assertWorkspaceRoot(opts.workspaceRoot);
  } catch (err) {
    const output = sanitizeLogOutput(err instanceof Error ? err.message : String(err));
    return {
      success: false,
      failureMessage: output,
      steps: [{
        command: "",
        args: [],
        displayCommand: DEFAULT_PREVALIDATION_COMMANDS[0]!,
        cwd: path.resolve(opts.workspaceRoot),
        exitCode: -1,
        stdout: "",
        stderr: output,
        output,
        durationMs: 0,
        success: false
      }]
    };
  }

  const steps: PreValidationStepResult[] = [];
  for (const command of config.commands) {
    const step = await spawnPreValidationCommand(command, opts.workspaceRoot, config.timeoutMs, opts.env);
    steps.push(step);
    if (!step.success) {
      return {
        success: false,
        failureMessage: `${PREVALIDATION_FAILURE_PREFIX}: ${step.displayCommand}`,
        steps
      };
    }
  }

  return { success: true, failureMessage: null, steps };
}

function parsePreValidationCommand(raw: string): PreValidationCommand {
  const normalized = raw.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: pre-validation command is empty`);
  }
  for (const part of parts) {
    if (SHELL_META_PATTERN.test(part) || part.includes("$(") || part.includes("&&") || part.includes("||")) {
      throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: pre-validation command contains unsafe shell syntax`);
    }
  }

  const command = path.basename(parts[0]!);
  const args = parts.slice(1);
  if (command !== parts[0] || command !== "npm") {
    throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: only npm run commands are supported`);
  }
  if (args.length !== 2 || args[0] !== "run" || !ALLOWED_PREVALIDATION_SCRIPTS.has(args[1] ?? "")) {
    throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: only npm run db:generate is supported`);
  }

  return { command, args, displayCommand: formatDisplayCommand(command, args) };
}

function formatDisplayCommand(command: string, args: string[]): string {
  return [command, ...args.map((arg) => safeDisplayCommand(arg))].join(" ");
}

function safeDisplayCommand(value: string): string {
  return sanitizeLogOutput(value.replace(/=([^\s]+)/g, "=[REDACTED]"));
}

function assertWorkspaceRoot(workspaceRoot: string): void {
  const resolved = path.resolve(workspaceRoot);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: workspace root not found`);
  }
  const packageJsonPath = path.join(resolved, "package.json");
  if (!fs.existsSync(packageJsonPath) || !fs.statSync(packageJsonPath).isFile()) {
    throw new Error(`${PREVALIDATION_FAILURE_PREFIX}: package.json not found in workspace`);
  }
}

function sanitizeChildEnv(sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
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
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (!blocked.has(key) && value !== undefined) safe[key] = value;
  }
  return safe;
}

function spawnPreValidationCommand(
  command: PreValidationCommand,
  workspaceRoot: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<PreValidationStepResult> {
  return new Promise((resolve) => {
    const cwd = path.resolve(workspaceRoot);
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command.command, command.args, {
      cwd,
      env: sanitizeChildEnv(env),
      shell: false
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const rawOutput = timedOut
        ? `[TIMEOUT after ${timeoutMs}ms]\n${stdout}\n${stderr}`
        : `${stdout}\n${stderr}`;
      const exitCode = timedOut ? -2 : (code ?? -1);
      resolve({
        ...command,
        cwd,
        exitCode,
        stdout: sanitizeLogOutput(stdout),
        stderr: sanitizeLogOutput(stderr),
        output: sanitizeLogOutput(rawOutput),
        durationMs: Date.now() - startedAt,
        success: exitCode === 0
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ...command,
        cwd,
        exitCode: -1,
        stdout: "",
        stderr: sanitizeLogOutput(err.message),
        output: sanitizeLogOutput(err.message),
        durationMs: Date.now() - startedAt,
        success: false
      });
    });
  });
}
