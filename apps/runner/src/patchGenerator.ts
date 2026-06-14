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

  // 1. Get diff stat
  const statResult = await runCommand("git", ["diff", "--stat"], { workspaceRoot });
  const diffStat = statResult.exitCode === 0
    ? sanitizeAndCap(statResult.stdout, DIFF_STAT_MAX)
    : null;

  // 2. Get full diff
  const diffResult = await runCommand("git", ["diff"], { workspaceRoot });
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

export async function runValidation(workspaceRoot: string): Promise<ValidationResult[]> {
  const commands: Array<{ cmd: string; args: string[] }> = [
    { cmd: "npm", args: ["run", "typecheck"] },
    { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/api"] },
    { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/runner"] },
    { cmd: "npm", args: ["run", "test", "--workspace", "@ai-kingdom/web"] },
    { cmd: "npm", args: ["run", "build"] }
  ];

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
      timedOut: result.timedOut
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
