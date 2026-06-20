/**
 * Patch generator for the runner.
 *
 * Collects git diff output, sanitizes secrets, and prepares the patch artifact
 * payload to submit to the API.
 *
 * Hard constraints:
 * - Never uses shell: true
 * - Runs only allowlisted git commands
 * - All output is redacted before transmission
 * - Does not push to main/master/develop/release
 * - Respects ALLOW_RUNNER_BRANCH_PUSH setting from server
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./sandbox.js";
import { sanitizeLogOutput, tailLines } from "./secretRedactor.js";
import type { ApiClient } from "./apiClient.js";

export interface ValidationResult {
  command: string;
  exitCode: number | null;
  durationMs: number;
  cwd: string;
  stdout: string;
  stderr: string;
  output: string;
  success: boolean;
  timedOut: boolean;
  outputTruncated: boolean;
  message?: string;
  failureSummary?: string;
}

export interface PatchPayload {
  title: string;
  summary: string;
  diffStat: string | null;
  diffPreview: string | null;
  fullPatch: string | null;
  filesChanged: string[];
  validationResults: ValidationResult[];
  branchName: string | null;
}

export interface PatchGeneratorOptions {
  workspaceRoot: string;
  jobId: string;
  workOrderTitle: string;
  allowBranchPush: boolean;
}

const DIFF_STAT_MAX = 5000;
const DIFF_PREVIEW_MAX = 10_000;
const FULL_PATCH_MAX = 200_000;

// Validation output capture: keep enough of stdout/stderr (tail-biased, since
// failure lines and the final test summary appear near the end) to render the
// last ~300 lines in the UI without losing the actual failing test/assertion.
const VALIDATION_OUTPUT_TAIL_LINES = 300;
const VALIDATION_STDOUT_MAX = 30_000;
const VALIDATION_STDERR_MAX = 15_000;
const VALIDATION_COMBINED_OUTPUT_MAX = 40_000;

export async function generatePatch(opts: PatchGeneratorOptions): Promise<PatchPayload> {
  const { workspaceRoot, jobId, workOrderTitle, allowBranchPush } = opts;

  // 0. Stage all workspace changes against the baseline commit so that NEWLY
  // CREATED (untracked) files are captured — an external agent (Claude Code, etc.)
  // typically *creates* files, which a plain `git diff` (working tree vs index)
  // silently omits. Exclude the runner-internal `.kingdom/` prompt dir. The diff
  // is then read from the index (`--cached`) so new, modified, and deleted files
  // all appear. (`--` is intentionally avoided: the command validator rejects it.)
  await runCommand("git", ["add", "-A", ".", ":(exclude).kingdom"], { workspaceRoot });

  // 1. Get diff stat
  const statResult = await runCommand("git", ["diff", "--cached", "--stat"], { workspaceRoot });
  const diffStat = statResult.exitCode === 0
    ? sanitizeAndCap(statResult.stdout, DIFF_STAT_MAX)
    : null;

  // 2. Get full diff
  const diffResult = await runCommand("git", ["diff", "--cached"], { workspaceRoot });
  const rawDiff = diffResult.exitCode === 0 ? diffResult.stdout : "";
  const fullPatch = rawDiff ? sanitizeAndCap(rawDiff, FULL_PATCH_MAX) : null;
  const diffPreview = rawDiff ? sanitizeAndCap(rawDiff, DIFF_PREVIEW_MAX) : null;

  // 3. Extract changed files from diff stat
  const filesChanged = extractFilesFromDiffStat(diffStat ?? "");

  // 4. Determine branch name (only used if push is allowed)
  const slug = slugify(workOrderTitle);
  const branchName = allowBranchPush
    ? `kingdom/job-${jobId.slice(0, 8)}-${slug}`
    : null;

  return {
    title: `Patch: ${workOrderTitle}`,
    summary: buildSummary(filesChanged, diffStat),
    diffStat,
    diffPreview,
    fullPatch,
    filesChanged,
    validationResults: [],
    branchName
  };
}

const DEFAULT_VALIDATION_COMMANDS: Array<{ cmd: string; args: string[] }> = [
  { cmd: "npm", args: ["run", "typecheck"] },
  { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/api"] },
  { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/runner"] },
  { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/web"] },
  { cmd: "npm", args: ["run", "build"] }
];

/**
 * Post-execution validation commands. Defaults to the full suite (typecheck + all
 * workspace tests + build). Override with RUNNER_VALIDATION_COMMANDS — a
 * comma-separated list of npm scripts (e.g. "typecheck" or "typecheck,build") — so a
 * repo whose full suite is slow (or has known-failing tests) doesn't run it on every
 * sandbox/bridge job. Only `npm run <script>` invocations are allowed.
 */
function resolveValidationCommands(env: NodeJS.ProcessEnv): Array<{ cmd: string; args: string[] }> {
  const raw = env.RUNNER_VALIDATION_COMMANDS?.trim();
  if (!raw) return DEFAULT_VALIDATION_COMMANDS;
  const scripts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-zA-Z0-9:_-]+$/.test(s));
  if (scripts.length === 0) return DEFAULT_VALIDATION_COMMANDS;
  return scripts.map((script) => ({ cmd: "npm", args: ["run", script] }));
}

export async function runValidation(workspaceRoot: string): Promise<ValidationResult[]> {
  const commands = resolveValidationCommands(process.env);

  const results: ValidationResult[] = [];
  for (const { cmd, args } of commands) {
    const result = await runCommand(cmd, args, { workspaceRoot });
    const stdoutTail = tailLines(result.stdout, VALIDATION_OUTPUT_TAIL_LINES);
    const stderrTail = tailLines(result.stderr, VALIDATION_OUTPUT_TAIL_LINES);
    results.push({
      command: `${cmd} ${args.join(" ")}`,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cwd: result.cwd,
      stdout: sanitizeLogOutput(stdoutTail, VALIDATION_STDOUT_MAX),
      stderr: sanitizeLogOutput(stderrTail, VALIDATION_STDERR_MAX),
      output: sanitizeLogOutput(`CWD: ${result.cwd}\nSTDOUT:\n${stdoutTail}\nSTDERR:\n${stderrTail}`, VALIDATION_COMBINED_OUTPUT_MAX),
      success: result.exitCode === 0,
      timedOut: result.timedOut,
      outputTruncated: result.outputTruncated || stdoutTail !== result.stdout || stderrTail !== result.stderr,
      message: result.message,
      failureSummary: result.failureSummary ? sanitizeLogOutput(result.failureSummary, VALIDATION_STDERR_MAX) : undefined
    });
  }
  return results;
}

export async function pushSafeBranch(
  workspaceRoot: string,
  branchName: string,
  commitMessage: string
): Promise<{ pushed: boolean; error?: string }> {
  // Validate branch name matches safe pattern before attempting anything
  const SAFE_PATTERN = /^kingdom\/job-[0-9a-f]{1,16}-[a-z0-9-]{1,50}$/;
  if (!SAFE_PATTERN.test(branchName)) {
    return { pushed: false, error: `Unsafe branch name: ${branchName}` };
  }

  // Create branch
  const checkoutResult = await runCommand("git", ["checkout", "-b", branchName], { workspaceRoot });
  if (checkoutResult.exitCode !== 0) {
    return { pushed: false, error: `git checkout -b failed: ${checkoutResult.stderr}` };
  }

  // Stage all modified tracked files
  const addResult = await runCommand("git", ["add", "."], { workspaceRoot });
  if (addResult.exitCode !== 0) {
    return { pushed: false, error: `git add failed: ${addResult.stderr}` };
  }

  // Commit
  const safeMessage = sanitizeCommitMessage(commitMessage);
  const commitResult = await runCommand("git", ["commit", "-m", safeMessage], { workspaceRoot });
  if (commitResult.exitCode !== 0) {
    return { pushed: false, error: `git commit failed: ${commitResult.stderr}` };
  }

  // Push only safe branch
  const pushResult = await runCommand("git", ["push", "origin", branchName], { workspaceRoot });
  if (pushResult.exitCode !== 0) {
    return { pushed: false, error: `git push failed: ${pushResult.stderr}` };
  }

  return { pushed: true };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function sanitizeCommitMessage(msg: string): string {
  return msg
    .replace(/[`$<>|;&]/g, "")
    .slice(0, 100)
    .trim() || "runner: automated change";
}

function sanitizeAndCap(text: string, max: number): string {
  const redacted = sanitizeLogOutput(text);
  if (redacted.length <= max) return redacted;
  return redacted.slice(0, max) + "\n...[truncated]";
}

function extractFilesFromDiffStat(diffStat: string): string[] {
  const files: string[] = [];
  for (const line of diffStat.split("\n")) {
    // Lines like: " src/foo.ts | 5 ++"
    const match = line.match(/^\s+(.+?)\s+\|/);
    if (match?.[1]) files.push(match[1].trim());
  }
  return files;
}

function buildSummary(filesChanged: string[], diffStat: string | null): string {
  if (filesChanged.length === 0) return "No files changed.";
  const count = filesChanged.length;
  return `${count} file${count !== 1 ? "s" : ""} changed. ${diffStat?.split("\n").pop()?.trim() ?? ""}`.trim();
}

/**
 * Returns true when the workspace diff is empty — no files changed and no
 * unified diff output. SANDBOX_PATCH jobs must not submit a PatchArtifact
 * in this case; the ImplementationReport should surface NO_CHANGES instead.
 */
export function isEmptyPatch(payload: PatchPayload): boolean {
  return payload.filesChanged.length === 0 && !payload.fullPatch;
}

export interface ApplyPatchResult {
  success: boolean;
  error?: string;
  stderr?: string;
}

/**
 * Applies an imported unified diff to the workspace.
 *
 * Uses a temp file outside the workspace so the patch file itself never
 * shows up in the subsequent git diff. Runs git apply --check first (dry-run);
 * only if that passes does it run git apply.
 *
 * Does NOT go through runCommand/validateCommand — this is an internal
 * operation with fully-controlled args, not a user-specified plan step.
 */
export async function applyImportedPatch(
  workspaceRoot: string,
  patchText: string
): Promise<ApplyPatchResult> {
  const tmpFile = path.join(os.tmpdir(), `kingdom-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);

  try {
    await fs.writeFile(tmpFile, patchText, "utf8");

    // Dry-run first
    const checkResult = await spawnGitApply(workspaceRoot, ["--check", tmpFile]);
    if (!checkResult.success) {
      return {
        success: false,
        error: "git apply --check failed: patch does not apply cleanly",
        stderr: sanitizeLogOutput(checkResult.stderr)
      };
    }

    // Apply for real
    const applyResult = await spawnGitApply(workspaceRoot, [tmpFile]);
    if (!applyResult.success) {
      return {
        success: false,
        error: "git apply failed after passing --check",
        stderr: sanitizeLogOutput(applyResult.stderr)
      };
    }

    return { success: true };
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }
}

function spawnGitApply(
  cwd: string,
  args: string[]
): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = "";
    const child = spawn("git", ["apply", ...args], {
      cwd: path.resolve(cwd),
      shell: false,
      timeout: 30_000
    });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ success: code === 0, stderr }));
    child.on("error", (err) => resolve({ success: false, stderr: err.message }));
  });
}

export async function submitPatchArtifact(
  client: ApiClient,
  jobId: string,
  payload: PatchPayload
): Promise<{ id: string } | null> {
  try {
    return await client.submitPatchArtifact(jobId, payload);
  } catch (err) {
    console.error("[PatchGenerator] Failed to submit patch artifact:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
