import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sanitizeLogOutput } from "./secretRedactor.js";

export const DEPENDENCY_INSTALL_FAILURE = "Runner dependency installation failed";

const DEFAULT_INSTALL_COMMAND = "npm ci";
const DEFAULT_INSTALL_TIMEOUT_MS = 120_000;

const SHELL_META_PATTERN = /[|&;`$<>]/;

export interface DependencyInstallConfig {
  enabled: boolean;
  command: string;
  args: string[];
  displayCommand: string;
  timeoutMs: number;
}

export interface DependencyInstallResult extends DependencyInstallConfig {
  skipped: boolean;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
}

export function getDependencyInstallConfig(
  mode: string,
  env: NodeJS.ProcessEnv = process.env
): DependencyInstallConfig {
  const explicitEnabled = env.RUNNER_INSTALL_DEPS?.trim().toLowerCase();
  const enabled = explicitEnabled === undefined
    ? mode === "SANDBOX_PATCH" || mode === "VALIDATION_ONLY"
    : explicitEnabled !== "false";

  const rawCommand = (env.RUNNER_INSTALL_COMMAND?.trim() || DEFAULT_INSTALL_COMMAND).replace(/\s+/g, " ");
  const parsedTimeout = Number.parseInt(env.RUNNER_INSTALL_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
    ? parsedTimeout
    : DEFAULT_INSTALL_TIMEOUT_MS;

  if (!enabled) {
    return { enabled, command: "", args: [], displayCommand: safeDisplayCommand(rawCommand), timeoutMs };
  }

  const commandParts = parseInstallCommand(rawCommand);
  const command = commandParts[0]!;
  const args = commandParts.slice(1);
  const displayCommand = formatInstallDisplay(command, args);

  return { enabled, command, args, displayCommand, timeoutMs };
}

export async function installRunnerDependencies(opts: {
  workspaceRoot: string;
  mode: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DependencyInstallResult> {
  let config: DependencyInstallConfig;
  try {
    config = getDependencyInstallConfig(opts.mode, opts.env);
  } catch (err) {
    const output = sanitizeLogOutput(err instanceof Error ? err.message : String(err));
    return {
      enabled: true,
      command: "",
      args: [],
      displayCommand: safeDisplayCommand(opts.env?.RUNNER_INSTALL_COMMAND?.trim() || DEFAULT_INSTALL_COMMAND),
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      skipped: false,
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: output,
      output,
      durationMs: 0
    };
  }
  if (!config.enabled) {
    return {
      ...config,
      skipped: true,
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      output: "Dependency installation skipped by RUNNER_INSTALL_DEPS=false",
      durationMs: 0
    };
  }

  try {
    assertWorkspaceRoot(opts.workspaceRoot);
  } catch (err) {
    const output = sanitizeLogOutput(err instanceof Error ? err.message : String(err));
    return {
      ...config,
      skipped: false,
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: output,
      output,
      durationMs: 0
    };
  }

  const startedAt = Date.now();
  const result = await spawnInstall(config, opts.workspaceRoot, opts.env);
  return {
    ...config,
    ...result,
    skipped: false,
    success: result.exitCode === 0,
    durationMs: Date.now() - startedAt
  };
}

function parseInstallCommand(raw: string): string[] {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: install command is empty`);
  for (const part of parts) {
    if (SHELL_META_PATTERN.test(part) || part.includes("$(") || part.includes("&&") || part.includes("||")) {
      throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: install command contains unsafe shell syntax`);
    }
  }

  const command = path.basename(parts[0]!);
  const args = parts.slice(1);
  if (command !== parts[0] || command !== "npm") {
    throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: only npm install commands are supported`);
  }
  if (args[0] !== "ci" && args[0] !== "install") {
    throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: install command must be npm ci or npm install`);
  }
  if (args.slice(1).some((arg) => !arg.startsWith("-"))) {
    throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: install command arguments must be npm options`);
  }
  return [command, ...args];
}

function formatInstallDisplay(command: string, args: string[]): string {
  return [command, ...args.map((arg) => safeDisplayCommand(arg))].join(" ");
}

function safeDisplayCommand(value: string): string {
  return sanitizeLogOutput(value.replace(/=([^\s]+)/g, "=[REDACTED]"));
}

function assertWorkspaceRoot(workspaceRoot: string): void {
  const resolved = path.resolve(workspaceRoot);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: workspace root not found`);
  }
  const packageJsonPath = path.join(resolved, "package.json");
  if (!fs.existsSync(packageJsonPath) || !fs.statSync(packageJsonPath).isFile()) {
    throw new Error(`${DEPENDENCY_INSTALL_FAILURE}: package.json not found in workspace`);
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

function spawnInstall(
  config: DependencyInstallConfig,
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<Pick<DependencyInstallResult, "exitCode" | "stdout" | "stderr" | "output">> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(config.command, config.args, {
      cwd: path.resolve(workspaceRoot),
      env: sanitizeChildEnv(env),
      shell: false
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, config.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const rawOutput = timedOut
        ? `[TIMEOUT after ${config.timeoutMs}ms]\n${stdout}\n${stderr}`
        : `${stdout}\n${stderr}`;
      resolve({
        exitCode: timedOut ? -2 : (code ?? -1),
        stdout: sanitizeLogOutput(stdout),
        stderr: sanitizeLogOutput(stderr),
        output: sanitizeLogOutput(rawOutput)
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: sanitizeLogOutput(err.message),
        output: sanitizeLogOutput(err.message)
      });
    });
  });
}
