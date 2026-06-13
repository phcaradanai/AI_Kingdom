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
import fs from "node:fs";
import os from "node:os";
import { ApiClient, type AutomationJob } from "./apiClient.js";
import { runCommand } from "./sandbox.js";
import { sanitizeLogOutput } from "./secretRedactor.js";
import { validateCommand } from "./commandValidator.js";
import { generatePatch, runValidation, pushSafeBranch, submitPatchArtifact } from "./patchGenerator.js";
import { executeValidationOnlyJob } from "./validationOnlyExecutor.js";
import { buildContextUsed, evaluateBranchPushEligibility, evaluateJobContextBinding, shouldPushWithoutApproval } from "./sandboxPatchPolicy.js";
import { getRunnerJobWorkspaceDir, getRunnerWorkspaceBase, prepareRunnerWorkspace } from "./workspacePreparation.js";
import { DEPENDENCY_INSTALL_FAILURE, getDependencyInstallConfig, installRunnerDependencies } from "./dependencyInstaller.js";
import { PREVALIDATION_FAILURE_PREFIX, getPreValidationConfig, runPreValidationCommands } from "./preValidationRunner.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const RUNNER_TOKEN = process.env.RUNNER_TOKEN;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "15000", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const WORKSPACE_BASE = getRunnerWorkspaceBase();

// How long to wait for King approval before giving up on branch push (ms)
const APPROVAL_WAIT_MS = parseInt(process.env.APPROVAL_WAIT_MS ?? "300000", 10); // 5 minutes

// Server-side settings (fetched at startup)
let ALLOW_BRANCH_PUSH = false;
let REQUIRE_FRESH_LOCAL_CONTEXT = false;

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
    REQUIRE_FRESH_LOCAL_CONTEXT = settings.requireFreshLocalContext;
    console.log(`[Runner] Settings: branch push=${ALLOW_BRANCH_PUSH}, pr create=${settings.allowPrCreate}, require fresh local context=${REQUIRE_FRESH_LOCAL_CONTEXT}`);
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

  if (job.mode === "SANDBOX_PATCH") {
    const provenance = job.provenance ?? {};
    const contextCheck = evaluateJobContextBinding({
      mode: job.mode,
      requireFreshLocalContext: REQUIRE_FRESH_LOCAL_CONTEXT,
      contextValidationStatus: job.contextValidationStatus,
      localDocumentSnapshotId: (job.localDocumentSnapshotId ?? provenance.localDocumentSnapshotId) as string | null | undefined,
      localDocumentSnapshotStale: provenance.localDocumentSnapshotStale as boolean | undefined
    });
    if (!contextCheck.proceed) {
      console.warn(`[Job ${job.id}] Refusing SANDBOX_PATCH: ${contextCheck.reason}`);
      try {
        await api.updateStatus(job.id, "FAILED", {
          logsPreview: sanitizeLogOutput(`Refused: ${contextCheck.reason} Run a local docs scan and rebind the work order context before retrying this SANDBOX_PATCH job.`)
        });
      } catch {
        // Best effort
      }
      return;
    }
  }

  const workspaceDir = getRunnerJobWorkspaceDir(job.id, WORKSPACE_BASE);
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

    try {
      const prepared = prepareRunnerWorkspace({ jobId: job.id, workspaceBase: WORKSPACE_BASE });
      log(`[Job ${job.id}] Workspace prepared: ${prepared.workspaceDir}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`[Job ${job.id}] ${errMsg}`);
      const logsPreview = sanitizeLogOutput(logLines.slice(-50).join("\n"));
      await api.submitReport(job.id, {
        summary: `Sandbox run for "${job.workOrder.title}" could not start: workspace preparation failed.`,
        filesChanged: [],
        commandsRun: [],
        testsRun: [],
        testResult: "NOT_RUN",
        errors: [errMsg],
        decisionsMade: [],
        remainingWork: ["Configure RUNNER_REPO_PATH to a repository root with package.json and retry the job."],
        nextRecommendedAction: "Fix runner workspace configuration",
        logsPreview,
        rawOutput: logsPreview,
        contextUsed: buildContextUsed(job)
      });
      await api.updateStatus(job.id, "FAILED", { logsPreview }).catch(() => undefined);
      return;
    }

    const installResult = await installDependenciesForJob(job, workspaceDir, log);
    if (installResult.skipped) {
      log(`[Job ${job.id}] Dependency installation skipped.`);
    } else {
      commandsRun.push(installResult.displayCommand);
      if (!installResult.success) {
        errors.push(DEPENDENCY_INSTALL_FAILURE);
        const logsPreview = sanitizeLogOutput(
          [...logLines, `${DEPENDENCY_INSTALL_FAILURE}\n${installResult.output}`].slice(-50).join("\n")
        );
        await api.submitReport(job.id, {
          summary: `Sandbox run for "${job.workOrder.title}" could not continue: ${DEPENDENCY_INSTALL_FAILURE}.`,
          filesChanged: [],
          commandsRun,
          testsRun,
          testResult: "NOT_RUN",
          errors: [DEPENDENCY_INSTALL_FAILURE, `Exit ${installResult.exitCode}: ${installResult.displayCommand}`],
          decisionsMade: [],
          remainingWork: ["Review dependency installation output and retry the job after the sandbox can install dependencies."],
          nextRecommendedAction: "Fix runner dependency installation",
          logsPreview,
          rawOutput: logsPreview,
          contextUsed: buildContextUsed(job)
        });
        log(`[Job ${job.id}] ${DEPENDENCY_INSTALL_FAILURE}`);
        return;
      }
    }

    const preValidationResult = await runPreValidationForJob(job.id, workspaceDir, log);
    for (const step of preValidationResult.steps) {
      sequence++;
      commandsRun.push(step.displayCommand);
      await api.recordStep(job.id, {
        sequence,
        stepType: "COMMAND",
        title: `Pre-validation: ${step.displayCommand}`,
        status: step.success ? "COMPLETED" : "FAILED",
        command: "npm",
        args: ["run", "db:generate"],
        output: step.output.slice(0, 4000),
        exitCode: step.exitCode,
        durationMs: step.durationMs
      });
      log(`[Job ${job.id}] Pre-validation ${step.success ? "completed" : "failed"}: ${step.displayCommand} (${step.durationMs}ms)`);
      logLines.push(`$ ${step.displayCommand}\nCWD: ${step.cwd}\nSTDOUT:\n${step.stdout}\nSTDERR:\n${step.stderr}`);
    }
    if (!preValidationResult.success) {
      const failureMessage = preValidationResult.failureMessage ?? PREVALIDATION_FAILURE_PREFIX;
      errors.push(failureMessage);
      const logsPreview = sanitizeLogOutput(logLines.slice(-80).join("\n"));
      await api.submitReport(job.id, {
        summary: `Sandbox run for "${job.workOrder.title}" could not continue: ${failureMessage}.`,
        filesChanged: [],
        commandsRun,
        testsRun,
        testResult: "NOT_RUN",
        errors,
        decisionsMade: [],
        remainingWork: ["Review pre-validation output and retry the job after Prisma Client generation can complete."],
        nextRecommendedAction: "Fix runner pre-validation",
        logsPreview,
        rawOutput: logsPreview,
        contextUsed: buildContextUsed(job)
      });
      return;
    }

    if (job.project) {
      log(`[Job ${job.id}] Project: ${job.project.name}`);
    }

    const localDocumentSnapshotId = job.localDocumentSnapshotId ?? (job.provenance?.localDocumentSnapshotId as string | null | undefined) ?? null;
    if (localDocumentSnapshotId) {
      log(`[Job ${job.id}] Local document snapshot: ${localDocumentSnapshotId}`);
    }
    if (job.contextValidationStatus) {
      log(`[Job ${job.id}] Context binding: ${job.contextValidationStatus}`);
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
      patchSummary: patchPayload.summary,
      contextUsed: buildContextUsed(job)
    });

    log(`[Job ${job.id}] Report submitted. Job is NEEDS_REVIEW.`);

    // Branch push (if enabled and artifact was submitted)
    const pushEligibility = evaluateBranchPushEligibility({
      allowBranchPush: ALLOW_BRANCH_PUSH,
      commandPolicy: job.commandPolicy,
      branchName: patchPayload.branchName,
      hasArtifact: Boolean(artifact)
    });
    if (pushEligibility.attemptPush) {
      await attemptBranchPush(job, artifact!.id, patchPayload, workspaceDir, log);
    } else if (ALLOW_BRANCH_PUSH && artifact && patchPayload.branchName) {
      log(`[Job ${job.id}] Branch push skipped: ${pushEligibility.reason}`);
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
    if (fs.existsSync(workspaceDir)) {
      console.log(`[Job ${job.id}] Workspace retained: ${workspaceDir}`);
    }
  }
}

/**
 * VALIDATION_ONLY (M17D-2): copy workspace, run allowlisted validation commands,
 * submit a report. Never edits files, never creates a patch artifact, never
 * runs git add/commit/push.
 */
async function executeValidationJob(job: AutomationJob) {
  const workspaceDir = getRunnerJobWorkspaceDir(job.id, WORKSPACE_BASE);
  try {
    await executeValidationOnlyJob(job, {
      api,
      runCommand: async (command, args) => {
        const result = await runCommand(command, args, { workspaceRoot: workspaceDir, jobAllowedCommands: job.allowedCommands });
        return { exitCode: result.exitCode, output: result.output, durationMs: result.durationMs };
      },
      prepareWorkspace: async () => {
        const prepared = prepareRunnerWorkspace({ jobId: job.id, workspaceBase: WORKSPACE_BASE });
        console.log(`[Job ${job.id}] Workspace prepared: ${prepared.workspaceDir}`);
      },
      installDependencies: async () => {
        return installDependenciesForJob(job, workspaceDir, (msg) => console.log(msg));
      },
      runPreValidation: async () => {
        return runPreValidationForJob(job.id, workspaceDir, (msg) => console.log(msg));
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
    if (fs.existsSync(workspaceDir)) {
      console.log(`[Job ${job.id}] Workspace retained: ${workspaceDir}`);
    }
  }
}

async function installDependenciesForJob(
  job: AutomationJob,
  workspaceDir: string,
  log: (msg: string) => void
) {
  try {
    const config = getDependencyInstallConfig(job.mode);
    if (config.enabled) {
      log(`[Job ${job.id}] Installing dependencies with ${config.displayCommand}`);
    }
  } catch {
    // installRunnerDependencies converts invalid config into a reportable failure.
  }
  const result = await installRunnerDependencies({ workspaceRoot: workspaceDir, mode: job.mode });
  if (!result.skipped && !result.success) {
    log(`[Job ${job.id}] ${DEPENDENCY_INSTALL_FAILURE}: exit ${result.exitCode}`);
  }
  return result;
}

async function runPreValidationForJob(
  jobId: string,
  workspaceDir: string,
  log: (msg: string) => void
) {
  try {
    const config = getPreValidationConfig();
    for (const command of config.commands) {
      log(`[Job ${jobId}] Running pre-validation: ${command.displayCommand}`);
    }
  } catch {
    // runPreValidationCommands converts invalid config into a reportable failure.
  }
  const result = await runPreValidationCommands({ workspaceRoot: workspaceDir });
  if (!result.success) {
    log(`[Job ${jobId}] ${result.failureMessage ?? PREVALIDATION_FAILURE_PREFIX}`);
  }
  return result;
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
      // LOW risk: push without waiting for explicit approval (if enabled)
      if (shouldPushWithoutApproval(artifact)) {
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
