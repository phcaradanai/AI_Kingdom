/**
 * AI Kingdom Runner — Sandbox Executor
 *
 * Hard constraints:
 * - Never push/merge/deploy
 * - Never run destructive commands
 * - All work in isolated workspace
 * - All outputs redacted before reporting
 * - Branch push only to safe kingdom/job-* branches
 * - HIGH/CRITICAL patches require King approval before push
 */

import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ApiClient, type AutomationJob } from "./apiClient.js";
import { runCommand } from "./sandbox.js";
import { sanitizeLogOutput } from "./secretRedactor.js";
import { validateCommand } from "./commandValidator.js";
import { generatePatch, runValidation, pushSafeBranch, submitPatchArtifact } from "./patchGenerator.js";
import { executeValidationOnlyJob } from "./validationOnlyExecutor.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const RUNNER_TOKEN = process.env.RUNNER_TOKEN;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "15000", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const WORKSPACE_BASE = process.env.WORKSPACE_BASE ?? path.join(os.tmpdir(), "ai-kingdom-runner");

// How long to wait for King approval before giving up on branch push (ms)
const APPROVAL_WAIT_MS = parseInt(process.env.APPROVAL_WAIT_MS ?? "300000", 10); // 5 minutes

// Server-side settings (fetched at startup)
let ALLOW_BRANCH_PUSH = false;

if (!RUNNER_TOKEN) {
  console.error("[Runner] RUNNER_TOKEN is required. Set it in .env or environment.");
  process.exit(1);
}

const VERSION = "0.1.1";
const HOSTNAME = os.hostname();

const api = new ApiClient({ baseUrl: API_BASE_URL, runnerToken: RUNNER_TOKEN });

async function main() {
  console.log(`[Runner] Starting AI Kingdom Runner v${VERSION}`);
  console.log(`[Runner] API: ${API_BASE_URL}`);
  console.log(`[Runner] Workspace base: ${WORKSPACE_BASE}`);
  console.log(`[Runner] Branch push: ${ALLOW_BRANCH_PUSH ? "ENABLED" : "DISABLED"}`);

  fs.mkdirSync(WORKSPACE_BASE, { recursive: true });

  // Fetch server-side settings before starting
  try {
    const settings = await api.getRunnerSettings();
    ALLOW_BRANCH_PUSH = settings.allowBranchPush;
    console.log(`[Runner] Settings: branch push=${ALLOW_BRANCH_PUSH}, pr create=${settings.allowPrCreate}`);
  } catch (err) {
    console.warn("[Runner] Could not fetch server settings, using defaults:", err instanceof Error ? err.message : String(err));
  }

  await sendHeartbeat();
  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  console.log("[Runner] Polling for jobs...");
  while (true) {
    try {
      const { job } = await api.claimJob();
      if (job) {
        console.log(`[Runner] Claimed job ${job.id} for work order: ${job.workOrder.title}`);
        await executeJob(job);
      }
    } catch (err) {
      console.warn("[Runner] Poll error:", err instanceof Error ? err.message : String(err));
    }
    await sleep(POLL_INTERVAL_MS);
  }

  clearInterval(heartbeatTimer);
}

async function sendHeartbeat() {
  try {
    await api.heartbeat({ version: VERSION, hostname: HOSTNAME });
    console.log("[Runner] Heartbeat sent");
  } catch (err) {
    console.warn("[Runner] Heartbeat failed:", err instanceof Error ? err.message : String(err));
  }
}

async function executeJob(job: AutomationJob) {
  if (job.mode === "VALIDATION_ONLY") {
    await executeValidationJob(job);
    return;
  }
  const workspaceDir = path.join(WORKSPACE_BASE, job.id);
  const commandsRun: string[] = [];
  const testsRun: string[] = [];
  const errors: string[] = [];
  const logLines: string[] = [];
  let testResult: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL" = "NOT_RUN";
  let sequence = 0;

  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  try {
    await api.updateStatus(job.id, "RUNNING");
    log(`[Job ${job.id}] Starting execution in ${workspaceDir}`);
    log(`[Job ${job.id}] Mode: ${job.mode}`);

    fs.mkdirSync(workspaceDir, { recursive: true });

    if (job.project) {
      log(`[Job ${job.id}] Project: ${job.project.name}`);
    }

    // Execute plan steps
    const plan = job.planJson as ExecutionPlan | null;
    if (!plan || !Array.isArray(plan.steps)) {
      log(`[Job ${job.id}] No execution plan available. Running validation-only.`);
    } else {
      log(`[Job ${job.id}] Plan: ${plan.summary ?? "(no summary)"} — ${plan.steps.length} step(s)`);

      for (const step of plan.steps) {
        sequence++;
        if (step.type === "COMMAND") {
          const cmd = step.command;
          const args = step.args ?? [];
          const check = validateCommand(cmd, args, job.allowedCommands);

          if (!check.allowed) {
            log(`[Job ${job.id}] Step ${sequence}: BLOCKED — ${check.reason}`);
            await api.recordStep(job.id, {
              sequence,
              stepType: "COMMAND",
              title: step.description ?? `Run: ${cmd} ${args.join(" ")}`,
              status: "BLOCKED",
              command: cmd,
              args,
              output: `[BLOCKED] ${check.reason}`,
              exitCode: -1
            });
            errors.push(`Blocked: ${cmd} ${args.join(" ")} — ${check.reason}`);
            continue;
          }

          log(`[Job ${job.id}] Step ${sequence}: ${cmd} ${args.join(" ")}`);
          const result = await runCommand(cmd, args, {
            workspaceRoot: workspaceDir,
            jobAllowedCommands: job.allowedCommands
          });

          commandsRun.push(`${cmd} ${args.join(" ")}`);
          if (cmd === "npm" && args[0] === "run" && ["test", "typecheck", "build"].includes(args[1] ?? "")) {
            testsRun.push(`${cmd} ${args.join(" ")}`);
            if (testResult === "NOT_RUN") testResult = result.exitCode === 0 ? "PASSED" : "FAILED";
            else if (result.exitCode !== 0) testResult = "FAILED";
            else if (testResult === "FAILED") testResult = "PARTIAL";
          }

          if (result.exitCode !== 0) errors.push(`Exit ${result.exitCode}: ${cmd} ${args.join(" ")}`);

          await api.recordStep(job.id, {
            sequence,
            stepType: "COMMAND",
            title: step.description ?? `${cmd} ${args.join(" ")}`,
            status: result.exitCode === 0 ? "COMPLETED" : "FAILED",
            command: cmd,
            args,
            output: result.output,
            exitCode: result.exitCode,
            durationMs: result.durationMs
          });

        } else if (step.type === "FILE_CHANGE") {
          log(`[Job ${job.id}] Step ${sequence}: FILE_CHANGE — ${step.filePath} (${step.action})`);
          await api.recordStep(job.id, {
            sequence,
            stepType: "FILE_CHANGE",
            title: `${step.action}: ${step.filePath}`,
            detail: step.description,
            status: "COMPLETED"
          });
        }
      }
    }

    // Generate patch artifact
    log(`[Job ${job.id}] Generating patch artifact...`);
    const patchPayload = await generatePatch({
      workspaceRoot: workspaceDir,
      jobId: job.id,
      workOrderTitle: job.workOrder.title,
      allowBranchPush: ALLOW_BRANCH_PUSH
    });

    // Run validation commands
    log(`[Job ${job.id}] Running validation...`);
    const validationResults = await runValidation(workspaceDir);
    patchPayload.validationResults = validationResults;

    // Track validation in commands/tests
    for (const vr of validationResults) {
      commandsRun.push(vr.command);
      testsRun.push(vr.command);
      if (testResult === "NOT_RUN") testResult = vr.success ? "PASSED" : "FAILED";
      else if (!vr.success) testResult = testResult === "PASSED" ? "PARTIAL" : "FAILED";
    }

    // Submit patch artifact
    const artifact = await submitPatchArtifact(api, job.id, patchPayload);
    if (artifact) {
      log(`[Job ${job.id}] Patch artifact submitted: ${artifact.id} (risk: pending server score)`);
    }

    // Submit implementation report
    const logsPreview = sanitizeLogOutput(logLines.slice(-100).join("\n"));
    log(`[Job ${job.id}] Submitting report...`);

    await api.submitReport(job.id, {
      summary: plan?.summary ?? "Sandbox execution completed.",
      filesChanged: patchPayload.filesChanged,
      commandsRun,
      testsRun,
      testResult,
      errors,
      decisionsMade: [],
      remainingWork: errors.length > 0 ? ["Review and fix failed commands"] : [],
      nextRecommendedAction: errors.length > 0 ? "Review errors in implementation report" : "Review patch artifact",
      logsPreview,
      rawOutput: logsPreview,
      patchSummary: patchPayload.summary
    });

    log(`[Job ${job.id}] Report submitted. Job is NEEDS_REVIEW.`);

    // Branch push (if enabled and artifact was submitted)
    if (ALLOW_BRANCH_PUSH && artifact && patchPayload.branchName) {
      await attemptBranchPush(job, artifact.id, patchPayload, workspaceDir, log);
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Job ${job.id}] Fatal error:`, errMsg);

    try {
      await api.updateStatus(job.id, "FAILED", {
        logsPreview: sanitizeLogOutput([...logLines, `ERROR: ${errMsg}`].slice(-50).join("\n"))
      });
    } catch {
      // Best effort
    }
  } finally {
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}

/**
 * VALIDATION_ONLY (M17D-2): copy workspace, run allowlisted validation commands,
 * submit a report. Never edits files, never creates a patch artifact, never
 * runs git add/commit/push.
 */
async function executeValidationJob(job: AutomationJob) {
  const workspaceDir = path.join(WORKSPACE_BASE, job.id);
  try {
    await executeValidationOnlyJob(job, {
      api,
      runCommand: async (command, args) => {
        const result = await runCommand(command, args, { workspaceRoot: workspaceDir, jobAllowedCommands: job.allowedCommands });
        return { exitCode: result.exitCode, output: result.output, durationMs: result.durationMs };
      },
      prepareWorkspace: async () => {
        fs.mkdirSync(workspaceDir, { recursive: true });
        const repoPath = process.env.RUNNER_REPO_PATH;
        if (!repoPath) throw new Error("RUNNER_REPO_PATH is not configured; cannot copy workspace for validation.");
        fs.cpSync(repoPath, workspaceDir, { recursive: true });
      },
      hasLintScript: () => {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(workspaceDir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
          return Boolean(pkg.scripts?.lint);
        } catch {
          return false;
        }
      },
      sanitize: sanitizeLogOutput,
      log: (msg) => console.log(msg)
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Job ${job.id}] Validation job fatal error:`, errMsg);
    try {
      await api.updateStatus(job.id, "FAILED", { logsPreview: sanitizeLogOutput(`ERROR: ${errMsg}`) });
    } catch {
      // Best effort
    }
  } finally {
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}

async function attemptBranchPush(
  job: AutomationJob,
  artifactId: string,
  patchPayload: { filesChanged: string[]; branchName: string | null; summary: string },
  workspaceDir: string,
  log: (msg: string) => void
) {
  const branchName = patchPayload.branchName;
  if (!branchName) return;

  log(`[Job ${job.id}] Branch push enabled. Checking patch approval...`);

  // Poll for King approval (HIGH/CRITICAL require explicit approval)
  const approved = await waitForApproval(artifactId, log);
  if (!approved) {
    log(`[Job ${job.id}] Branch push skipped: patch not approved within timeout`);
    return;
  }

  log(`[Job ${job.id}] Patch approved. Pushing branch: ${branchName}`);
  const commitMsg = `runner: ${job.workOrder.title.slice(0, 80)} [job-${job.id.slice(0, 8)}]`;
  const pushResult = await pushSafeBranch(workspaceDir, branchName, commitMsg);

  if (pushResult.pushed) {
    log(`[Job ${job.id}] Branch pushed: ${branchName}`);
    await api.markBranchPushed(job.id, artifactId, branchName).catch((err) => {
      console.warn("[Runner] Failed to record branch push:", err instanceof Error ? err.message : String(err));
    });
  } else {
    log(`[Job ${job.id}] Branch push failed: ${pushResult.error}`);
  }
}

async function waitForApproval(artifactId: string, log: (msg: string) => void): Promise<boolean> {
  const deadline = Date.now() + APPROVAL_WAIT_MS;
  const pollMs = 15_000;

  while (Date.now() < deadline) {
    try {
      const artifact = await api.getPatchArtifact(artifactId);
      if (artifact.validationStatus === "APPROVED") return true;
      if (artifact.validationStatus === "REJECTED") {
        log(`[Runner] Patch rejected — branch push cancelled`);
        return false;
      }
      // LOW/MEDIUM risk: push without waiting for explicit approval
      if (["LOW", "MEDIUM"].includes(artifact.riskLevel) && artifact.validationStatus === "PENDING") {
        return true;
      }
    } catch (err) {
      console.warn("[Runner] Approval poll error:", err instanceof Error ? err.message : String(err));
    }
    await sleep(pollMs);
  }

  log("[Runner] Approval wait timed out");
  return false;
}

interface ExecutionPlan {
  summary?: string;
  estimatedComplexity?: string;
  steps: PlanStep[];
}

interface PlanStep {
  type: "FILE_CHANGE" | "COMMAND";
  description?: string;
  filePath?: string;
  action?: string;
  command: string;
  args?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[Runner] Fatal startup error:", err);
  process.exit(1);
});
