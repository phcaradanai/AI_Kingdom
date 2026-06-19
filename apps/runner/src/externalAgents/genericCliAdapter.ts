import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { captureOutput, extractFailureSummary, sanitizeLogOutput } from "../secretRedactor.js";
import type { ExternalAgentAdapter, ExternalAgentAdapterContext, ExternalAgentCommandResult, RunnerExternalAgent } from "./types.js";

const OUTPUT_MAX_LINES = 2000;
const OUTPUT_MAX_CHARS = 200_000;
const SHELL_CONTROL_TOKENS = new Set(["|", "||", "&", "&&", ";", ">", ">>", "2>", "2>>"]);

export class GenericCliAdapter implements ExternalAgentAdapter {
  supportsCapability(_capability: string): boolean {
    return true;
  }

  async execute(agent: RunnerExternalAgent, context: ExternalAgentAdapterContext): Promise<ExternalAgentCommandResult> {
    if (!agent.command?.trim()) {
      throw new Error("External agent command template is empty.");
    }

    const parsed = parseCommandTemplate(agent.command, {
      promptFile: context.promptFile,
      workspaceRoot: context.workspaceRoot
    });
    const startedAt = Date.now();

    await fs.mkdir(path.dirname(context.promptFile), { recursive: true });
    await fs.writeFile(context.promptFile, context.promptText, "utf8");

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn(parsed.command, parsed.args, {
        cwd: context.cwd ?? context.workspaceRoot,
        env: buildExternalAgentEnv({
          allowNetwork: context.allowNetwork,
          allowWrite: context.allowWrite,
          workspaceRoot: context.workspaceRoot
        }),
        shell: false
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, context.timeoutMs);

      if (parsed.stdinFile) {
        fs.readFile(parsed.stdinFile, "utf8")
          .then((text) => {
            child.stdin?.write(text);
            child.stdin?.end();
          })
          .catch((err) => {
            child.stdin?.end();
            stderr += `Failed to read prompt stdin file: ${err instanceof Error ? err.message : String(err)}\n`;
          });
      }

      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        const stdoutCapture = captureOutput(stdout, OUTPUT_MAX_LINES, OUTPUT_MAX_CHARS);
        const stderrCapture = captureOutput(stderr, OUTPUT_MAX_LINES, OUTPUT_MAX_CHARS);
        const outputCapture = captureOutput(`${stdout}\n${stderr}`, OUTPUT_MAX_LINES, OUTPUT_MAX_CHARS);
        const exitCode = timedOut ? null : (code ?? -1);
        const failureSummary = exitCode !== 0
          ? extractFailureSummary(`${stdoutCapture.text}\n${stderrCapture.text}`)
          : null;
        resolve({
          command: parsed.command,
          args: parsed.args,
          displayCommand: parsed.displayCommand,
          stdout: stdoutCapture.text,
          stderr: stderrCapture.text,
          output: outputCapture.text,
          exitCode,
          durationMs,
          timedOut,
          outputTruncated: stdoutCapture.truncated || stderrCapture.truncated || outputCapture.truncated,
          artifactPaths: [context.promptFile],
          logPath: null,
          errorMessage: timedOut
            ? `External agent timed out after ${context.timeoutMs}ms`
            : failureSummary ?? undefined
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        resolve({
          command: parsed.command,
          args: parsed.args,
          displayCommand: parsed.displayCommand,
          stdout: "",
          stderr: sanitizeLogOutput(err.message),
          output: sanitizeLogOutput(err.message),
          exitCode: -1,
          durationMs,
          timedOut: false,
          outputTruncated: false,
          artifactPaths: [context.promptFile],
          logPath: null,
          errorMessage: err.message
        });
      });
    });
  }
}

type TemplateVars = {
  promptFile: string;
  workspaceRoot: string;
};

function parseCommandTemplate(template: string, vars: TemplateVars) {
  const tokens = tokenize(template).map((token) => replaceVars(token, vars));
  if (tokens.length === 0) throw new Error("External agent command template is empty.");

  let stdinFile: string | null = null;
  const commandParts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (SHELL_CONTROL_TOKENS.has(token) && token !== "<") {
      throw new Error(`Shell control token is not allowed in external agent command template: ${token}`);
    }
    if (/[|&;`$>]/.test(token)) {
      throw new Error(`Shell control characters are not allowed in external agent command template token: ${token}`);
    }
    if (token === "<") {
      const next = tokens[i + 1];
      if (!next) throw new Error("Input redirection token requires a prompt file path.");
      stdinFile = resolveInsideWorkspace(vars.workspaceRoot, next);
      i++;
      continue;
    }
    commandParts.push(token);
  }

  const [command, ...args] = commandParts;
  if (!command) throw new Error("External agent command template did not contain a command.");

  return {
    command,
    args,
    stdinFile,
    displayCommand: sanitizeLogOutput([command, ...args].join(" "))
  };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (quote) throw new Error("Unterminated quote in external agent command template.");
  if (current) tokens.push(current);
  return tokens;
}

function replaceVars(token: string, vars: TemplateVars): string {
  return token
    .replaceAll("{promptFile}", vars.promptFile)
    .replaceAll("{workspace}", vars.workspaceRoot);
}

function resolveInsideWorkspace(workspaceRoot: string, candidate: string): string {
  const resolved = path.resolve(workspaceRoot, candidate);
  const root = path.resolve(workspaceRoot);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`External agent path escapes workspace: ${candidate}`);
  }
  return resolved;
}

function buildExternalAgentEnv(input: { allowNetwork: boolean; allowWrite: boolean; workspaceRoot: string }): NodeJS.ProcessEnv {
  const safeNames = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "TERM", "CI", "NO_COLOR"];
  const env: NodeJS.ProcessEnv = {};
  for (const name of safeNames) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  env.AI_KINGDOM_EXTERNAL_AGENT = "true";
  env.AI_KINGDOM_EXTERNAL_AGENT_NETWORK = input.allowNetwork ? "true" : "false";
  env.AI_KINGDOM_EXTERNAL_AGENT_WRITE = input.allowWrite ? "true" : "false";
  env.AI_KINGDOM_WORKSPACE = input.workspaceRoot;
  return env;
}
