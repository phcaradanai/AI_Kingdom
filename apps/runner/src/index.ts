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
import { applyImportedPatch, generatePatch, isEmptyPatch, runValidation, pushSafeBranch, submitPatchArtifact } from "./patchGenerator.js";
import { executeValidationOnlyJob } from "./validationOnlyExecutor.js";
import { buildContextUsed, evaluateBranchPushEligibility, evaluateJobContextBinding, isPreApprovedPushPolicy, shouldPushWithoutApproval } from "./sandboxPatchPolicy.js";
import { decideImportedPatchStatus } from "./importedPatchStatus.js";
import { getRunnerJobWorkspaceDir, getRunnerWorkspaceBase, prepareRunnerWorkspace } from "./workspacePreparation.js";
import { DEPENDENCY_INSTALL_FAILURE, getDependencyInstallConfig, installRunnerDependencies } from "./dependencyInstaller.js";
import { PREVALIDATION_FAILURE_PREFIX, getPreValidationConfig, runPreValidationCommands } from "./preValidationRunner.js";
import { buildValidationChildEnv, formatForwardedValidationEnvNames, validateValidationDatabaseEnv } from "./validationEnv.js";
import { formatTimeoutMessage, getCommandTimeoutMs } from "./runnerConfig.js";
import { resolveAgentCliConfig, runAgentCli } from "./agentCliRunner.js";
import { probeAgentCapabilities } from "./agentCapabilityProbe.js";
import { runCliProbe, type CliProbeResult } from "./cliProbeRunner.js";
import { getExternalAgentAdapter } from "./externalAgents/index.js";

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
let SERVER_EXTERNAL_AGENT_BRIDGE_ENABLED = false;
let ALLOW_EXTERNAL_AGENT_WRITE = false;
let ALLOW_EXTERNAL_AGENT_NETWORK = false;
let MAX_EXTERNAL_AGENT_RUNTIME_SECONDS = 900;
const RUNNER_EXTERNAL_AGENT_BRIDGE_ENABLED = ["true", "1", "yes", "on"].includes((process.env.EXTERNAL_AGENT_BRIDGE_ENABLED ?? "false").toLowerCase());

if (!RUNNER_TOKEN) {
  console.error("[Runner] RUNNER_TOKEN is required. Set it in .env or environment.");
  process.exit(1);
}

const VERSION = "0.1.1";
const HOSTNAME = os.hostname();

const api = new ApiClient({ baseUrl: API_BASE_URL, runnerToken: RUNNER_TOKEN });

// Probe result accumulated between heartbeats (set after probe completes, cleared once sent)
let pendingProbeResult: CliProbeResult | null = null;
let probeRunning = false;

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
    SERVER_EXTERNAL_AGENT_BRIDGE_ENABLED = settings.externalAgentBridgeEnabled;
    ALLOW_EXTERNAL_AGENT_WRITE = settings.allowExternalAgentWrite;
    ALLOW_EXTERNAL_AGENT_NETWORK = settings.allowExternalAgentNetwork;
    MAX_EXTERNAL_AGENT_RUNTIME_SECONDS = settings.maxExternalAgentRuntimeSeconds;
    console.log(`[Runner] Settings: branch push=${ALLOW_BRANCH_PUSH}, pr create=${settings.allowPrCreate}, require fresh local context=${REQUIRE_FRESH_LOCAL_CONTEXT}, external bridge=${SERVER_EXTERNAL_AGENT_BRIDGE_ENABLED && RUNNER_EXTERNAL_AGENT_BRIDGE_ENABLED}`);
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
    // Probe which external-agent CLIs are actually runnable on this host so the
    // Kingdom only ever offers the King agents it can really execute right now.
    const agentCapabilities = probeAgentCapabilities();

    // Include any completed live probe result in this heartbeat, then clear it.
    const cliProbeResult = pendingProbeResult ?? undefined;
    pendingProbeResult = null;

    const response = await api.heartbeat({ version: VERSION, hostname: HOSTNAME, agentCapabilities, cliProbeResult });
    console.log("[Runner] Heartbeat sent");

    // If the API has requested a live probe, run it asynchronously so the next
    // heartbeat can carry the result.  Guard against overlapping probes.
    const probe = response?.pendingCliProbe;
    if (probe && !probeRunning) {
      probeRunning = true;
      console.log(`[Runner] Live CLI probe requested for ${probe.type} (agent ${probe.agentId})`);
      setImmediate(() => {
        try {
          pendingProbeResult = runCliProbe(probe.agentId, probe.type);
          console.log(`[Runner] Live CLI probe complete: ${pendingProbeResult.status}`);
        } catch (probeErr) {
          console.warn("[Runner] CLI probe error:", probeErr instanceof Error ? probeErr.message : String(probeErr));
        } finally {
          probeRunning = false;
        }
      });
    }
  } catch (err) {
    console.warn("[Runner] Heartbeat failed:", err instanceof Error ? err.message : String(err));
  }
}

async function executeJob(job: AutomationJob) {
  if (job.mode === "VALIDATION_ONLY") {
    await executeValidationJob(job);
    return;
  }

  if (job.mode === "EXTERNAL_AGENT") {
    await executeExternalAgentJob(job);
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

    const envCheck = validateValidationDatabaseEnv();
    if (!envCheck.ok) {
      log(`[Job ${job.id}] ${envCheck.message}`);
      const logsPreview = sanitizeLogOutput(logLines.slice(-50).join("\n"));
      await api.submitReport(job.id, {
        summary: `Sandbox run for "${job.workOrder.title}" could not start: ${envCheck.message}.`,
        filesChanged: [],
        commandsRun: [],
        testsRun: [],
        testResult: "NOT_RUN",
        errors: [envCheck.message],
        decisionsMade: [],
        remainingWork: ["Start the runner with TEST_DATABASE_URL or DATABASE_URL available in its process environment."],
        nextRecommendedAction: "Fix runner validation environment",
        logsPreview,
        rawOutput: logsPreview,
        contextUsed: buildContextUsed(job)
      });
      await api.updateStatus(job.id, "FAILED", { logsPreview }).catch(() => undefined);
      return;
    }
    log(`[Job ${job.id}] ${formatForwardedValidationEnvNames()}`);

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

    // Apply imported patch (if one was stored via the import-patch API endpoint)
    if (job.importedPatch) {
      sequence++;
      log(`[Job ${job.id}] Imported patch detected — running git apply --check then git apply...`);
      const applyResult = await applyImportedPatch(workspaceDir, job.importedPatch);

      await api.recordStep(job.id, {
        sequence,
        stepType: "COMMAND",
        title: applyResult.success ? "git apply (imported patch)" : "git apply --check (imported patch)",
        detail: applyResult.success ? "Imported unified diff applied to workspace" : applyResult.error,
        status: applyResult.success ? "COMPLETED" : "FAILED",
        command: "git",
        args: applyResult.success ? ["apply"] : ["apply", "--check"],
        output: applyResult.stderr ? `STDERR:\n${applyResult.stderr}` : undefined,
        exitCode: applyResult.success ? 0 : 1
      });

      if (!applyResult.success) {
        const applyError = applyResult.error ?? "Patch did not apply cleanly";
        errors.push(applyError);
        const logsPreview = sanitizeLogOutput([...logLines, `PATCH_APPLY_FAILED: ${applyError}`, applyResult.stderr ?? ""].slice(-80).join("\n"));

        // Record CHECK_FAILED status while job is still RUNNING (submitReport will move it to NEEDS_REVIEW)
        await api.updateStatus(job.id, "RUNNING", { importedPatchStatus: "CHECK_FAILED" });

        await api.submitReport(job.id, {
          summary: `PATCH_APPLY_FAILED: Imported patch for "${job.workOrder.title}" did not apply cleanly. ${applyError}${applyResult.stderr ? `\nDetails: ${applyResult.stderr}` : ""}`,
          filesChanged: [],
          commandsRun,
          testsRun,
          testResult: "NOT_RUN",
          errors: [applyError],
          decisionsMade: [],
          remainingWork: ["Review the patch diff for conflicts with the current workspace state and re-import a corrected patch."],
          nextRecommendedAction: "Fix patch conflicts and re-import via Import Patch",
          logsPreview,
          rawOutput: logsPreview,
          patchSummary: "Patch did not apply cleanly.",
          contextUsed: buildContextUsed(job)
        });
        return;
      }

      log(`[Job ${job.id}] Imported patch applied successfully.`);
      // Mark as applied — will be updated to VALIDATED after validation completes
      await api.updateStatus(job.id, "RUNNING", { importedPatchStatus: "APPLIED_IN_SANDBOX" });
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
            output: sanitizeLogOutput(result.output, 30000),
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            metadata: { cwd: result.cwd, timedOut: result.timedOut, outputTruncated: result.outputTruncated, message: result.message, failureSummary: result.failureSummary }
          });

        } else if (step.type === "FILE_CHANGE") {
          log(`[Job ${job.id}] Step ${sequence}: FILE_CHANGE (PLANNED) — ${step.filePath} (${step.action})`);
          await api.recordStep(job.id, {
            sequence,
            stepType: "FILE_CHANGE",
            title: `${step.action}: ${step.filePath}`,
            detail: step.description,
            status: "PLANNED"
          });
        }
      }
    }

    // Agent CLI execution — let a configured external agent CLI (Claude Code/Codex/etc.)
    // make REAL edits in the sandbox. The resulting diff is captured as a patch below;
    // the runner still never pushes/merges/deploys.
    const agentCli = (job.provenance?.agentCli ?? null) as { type?: string; prompt?: string } | null;
    if (job.mode === "SANDBOX_PATCH" && agentCli?.type && agentCli?.prompt) {
      sequence++;
      const resolved = resolveAgentCliConfig(agentCli.type, process.env);
      if (!resolved.enabled) {
        log(`[Job ${job.id}] Agent CLI step skipped: ${resolved.reason}`);
        await api.recordStep(job.id, {
          sequence,
          stepType: "COMMAND",
          title: `Agent CLI (${agentCli.type})`,
          detail: resolved.reason,
          status: "BLOCKED",
          output: `[BLOCKED] ${resolved.reason}`,
          exitCode: -1
        });
        errors.push(`Agent CLI not run: ${resolved.reason}`);
      } else {
        log(`[Job ${job.id}] Running agent CLI '${resolved.config.command}' for ${agentCli.type}...`);
        const cliResult = await runAgentCli({ config: resolved.config, prompt: agentCli.prompt, workspaceRoot: workspaceDir });
        commandsRun.push(`agent-cli:${agentCli.type}`);
        if (cliResult.timedOut) {
          errors.push(`Agent CLI timed out (${agentCli.type}) after ${resolved.config.timeoutMs}ms`);
        } else if (cliResult.exitCode !== 0) {
          errors.push(`Agent CLI exited ${cliResult.exitCode} (${agentCli.type})`);
        }
        await api.recordStep(job.id, {
          sequence,
          stepType: "COMMAND",
          title: `Agent CLI (${agentCli.type}): ${resolved.config.command}`,
          status: cliResult.exitCode === 0 ? "COMPLETED" : "FAILED",
          command: resolved.config.command,
          output: sanitizeLogOutput(cliResult.output, 30000),
          exitCode: cliResult.exitCode ?? -1,
          durationMs: cliResult.durationMs,
          metadata: { timedOut: cliResult.timedOut, agentCliType: agentCli.type }
        });
        logLines.push(`$ agent-cli:${agentCli.type}\n${sanitizeLogOutput(cliResult.output, 8000)}`);
        log(`[Job ${job.id}] Agent CLI finished (exit ${cliResult.exitCode ?? "timeout"}, ${cliResult.durationMs}ms).`);
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
      if (!vr.success) {
        if (vr.timedOut) {
          errors.push(`Timed out: ${vr.command}\n${vr.message ?? formatTimeoutMessage(getCommandTimeoutMs())}`);
        } else {
          errors.push(vr.stderr.trim()
            ? `Exit ${vr.exitCode}: ${vr.command}\nSTDERR:\n${vr.stderr.trim()}`
            : `Exit ${vr.exitCode}: ${vr.command}`);
        }
      }
      logLines.push(`$ ${vr.command}\nCWD: ${vr.cwd}\nTIMED_OUT: ${vr.timedOut}\nSTDOUT:\n${vr.stdout}\nSTDERR:\n${vr.stderr}`);
    }

    // Empty patch guard: if no files changed and no diff, do not submit a PatchArtifact.
    // Record a NO_CHANGES report instead so the job is clearly review-only.
    const emptyPatch = isEmptyPatch(patchPayload);

    // Submit patch artifact (only when actual file changes are present)
    let artifact: { id: string } | null = null;
    if (!emptyPatch) {
      artifact = await submitPatchArtifact(api, job.id, patchPayload);
      if (artifact) {
        log(`[Job ${job.id}] Patch artifact submitted: ${artifact.id} (risk: pending server score)`);
      }
    } else {
      log(`[Job ${job.id}] No files changed — skipping patch artifact submission (NO_CHANGES).`);
    }

    // Submit implementation report
    const logsPreview = sanitizeLogOutput(logLines.slice(-100).join("\n"));
    log(`[Job ${job.id}] Submitting report...`);

    // Update imported patch terminal status based on apply result and validation outcome
    if (job.importedPatch) {
      const allValidationPassed = validationResults.every(vr => vr.success);
      const finalStatus = decideImportedPatchStatus({ applied: true, emptyPatch, allValidationPassed });
      await api.updateStatus(job.id, "RUNNING", { importedPatchStatus: finalStatus });
    }

    await api.submitReport(job.id, {
      summary: emptyPatch
        ? `NO_CHANGES: Sandbox run for "${job.workOrder.title}" produced no file modifications. This job did not apply any edits. Review the work order and provide an actual patch or diff.`
        : (plan?.summary ?? "Sandbox execution completed."),
      filesChanged: patchPayload.filesChanged,
      commandsRun,
      testsRun,
      testResult,
      errors,
      decisionsMade: [],
      remainingWork: emptyPatch
        ? ["Review the work order and provide a model-generated patch or diff. No files were changed during this sandbox run."]
        : (errors.length > 0 ? ["Review and fix failed commands"] : []),
      nextRecommendedAction: emptyPatch
        ? "Review the work order — no files were modified. Provide an actual patch/diff and retry SANDBOX_PATCH."
        : (errors.length > 0 ? "Review errors in implementation report" : "Review patch artifact"),
      logsPreview,
      rawOutput: logsPreview,
      patchSummary: emptyPatch ? "No files changed." : patchPayload.summary,
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

async function executeExternalAgentJob(job: AutomationJob) {
  const workspaceDir = getRunnerJobWorkspaceDir(job.id, WORKSPACE_BASE);
  const commandsRun: string[] = [];
  const testsRun: string[] = [];
  const errors: string[] = [];
  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  try {
    await api.updateStatus(job.id, "RUNNING");

    const agent = job.workOrder.assignedExternalAgent ?? null;
    const run = job.externalAgentRuns?.[0] ?? null;
    if (!SERVER_EXTERNAL_AGENT_BRIDGE_ENABLED || !RUNNER_EXTERNAL_AGENT_BRIDGE_ENABLED) {
      const reason = "External Agent Bridge is disabled on the server or runner. Set EXTERNAL_AGENT_BRIDGE_ENABLED=true in both places before execution.";
      await submitBlockedExternalAgentReport(job, reason, workspaceDir, logLines);
      return;
    }
    if (!ALLOW_EXTERNAL_AGENT_WRITE) {
      const reason = "ALLOW_EXTERNAL_AGENT_WRITE=false. External agent bridge execution is blocked until write access is explicitly enabled.";
      await submitBlockedExternalAgentReport(job, reason, workspaceDir, logLines);
      return;
    }
    if (!agent) {
      await submitBlockedExternalAgentReport(job, "No assigned external agent was included in the job payload.", workspaceDir, logLines);
      return;
    }
    if (!agent.bridgeEnabled || !agent.command?.trim() || agent.type === "MANUAL_ONLY") {
      await submitBlockedExternalAgentReport(job, "Assigned external agent is not bridge-enabled or has no runnable command template.", workspaceDir, logLines);
      return;
    }
    if (!run?.inputPrompt) {
      await submitBlockedExternalAgentReport(job, "No queued ExternalAgentRun prompt was included in the job payload.", workspaceDir, logLines);
      return;
    }

    const provenance = job.provenance ?? {};
    const contextCheck = evaluateJobContextBinding({
      mode: job.mode,
      requireFreshLocalContext: true,
      contextValidationStatus: job.contextValidationStatus,
      localDocumentSnapshotId: (job.localDocumentSnapshotId ?? provenance.localDocumentSnapshotId) as string | null | undefined,
      localDocumentSnapshotStale: provenance.localDocumentSnapshotStale as boolean | undefined
    });
    if (!contextCheck.proceed) {
      await submitBlockedExternalAgentReport(job, `Refused EXTERNAL_AGENT job: ${contextCheck.reason}`, workspaceDir, logLines);
      return;
    }

    log(`[Job ${job.id}] Starting external agent bridge in ${workspaceDir}`);
    log(`[Job ${job.id}] External agent: ${agent.name} (${agent.type})`);

    try {
      const prepared = prepareRunnerWorkspace({ jobId: job.id, workspaceBase: WORKSPACE_BASE });
      log(`[Job ${job.id}] Workspace prepared: ${prepared.workspaceDir}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await submitBlockedExternalAgentReport(job, `Workspace preparation failed: ${errMsg}`, workspaceDir, logLines);
      return;
    }

    const envCheck = validateValidationDatabaseEnv();
    if (!envCheck.ok) {
      await submitBlockedExternalAgentReport(job, envCheck.message, workspaceDir, logLines);
      return;
    }
    log(`[Job ${job.id}] ${formatForwardedValidationEnvNames()}`);

    const installResult = await installDependenciesForJob(job, workspaceDir, log);
    if (!installResult.skipped) {
      commandsRun.push(installResult.displayCommand);
      if (!installResult.success) {
        errors.push(DEPENDENCY_INSTALL_FAILURE);
        await submitBlockedExternalAgentReport(job, `${DEPENDENCY_INSTALL_FAILURE}: ${installResult.output}`, workspaceDir, logLines);
        return;
      }
    }

    const preValidationResult = await runPreValidationForJob(job.id, workspaceDir, log);
    for (const step of preValidationResult.steps) {
      commandsRun.push(step.displayCommand);
      logLines.push(`$ ${step.displayCommand}\nCWD: ${step.cwd}\nSTDOUT:\n${step.stdout}\nSTDERR:\n${step.stderr}`);
    }
    if (!preValidationResult.success) {
      const failureMessage = preValidationResult.failureMessage ?? PREVALIDATION_FAILURE_PREFIX;
      errors.push(failureMessage);
      await submitBlockedExternalAgentReport(job, failureMessage, workspaceDir, logLines);
      return;
    }

    const promptFile = path.join(workspaceDir, ".kingdom", "external-agent-prompt.md");
    const agentCwd = resolveExternalAgentCwd(workspaceDir, agent.workingDirectory);
    const timeoutMs = Math.min(agent.maxRuntimeSeconds || MAX_EXTERNAL_AGENT_RUNTIME_SECONDS, MAX_EXTERNAL_AGENT_RUNTIME_SECONDS) * 1000;
    await api.markExternalAgentRunRunning(job.id, {
      workspacePath: agentCwd,
      commandTemplate: agent.command
    });

    const adapter = getExternalAgentAdapter(agent);
    log(`[Job ${job.id}] Sending prompt to ${agent.name}.`);
    const result = await adapter.execute(agent, {
      jobId: job.id,
      workspaceRoot: workspaceDir,
      cwd: agentCwd,
      promptFile,
      promptText: run.inputPrompt,
      timeoutMs,
      allowNetwork: ALLOW_EXTERNAL_AGENT_NETWORK,
      allowWrite: ALLOW_EXTERNAL_AGENT_WRITE
    });

    commandsRun.push(result.displayCommand);
    logLines.push(`$ ${result.displayCommand}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    await api.recordStep(job.id, {
      sequence: 1,
      stepType: "EXTERNAL_AGENT",
      title: `External agent: ${agent.name}`,
      status: result.exitCode === 0 ? "COMPLETED" : "FAILED",
      command: result.command,
      args: result.args,
      output: sanitizeLogOutput(result.output, 30000),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      metadata: {
        externalAgentId: agent.id,
        externalAgentRunId: run.id,
        timedOut: result.timedOut,
        outputTruncated: result.outputTruncated,
        allowNetwork: ALLOW_EXTERNAL_AGENT_NETWORK,
        allowWrite: ALLOW_EXTERNAL_AGENT_WRITE,
        commandTemplate: agent.command
      }
    });

    if (result.exitCode !== 0) {
      errors.push(result.errorMessage ?? `External agent exited with ${result.exitCode ?? "unknown"}`);
    }

    const patchPayload = await generatePatch({
      workspaceRoot: workspaceDir,
      jobId: job.id,
      workOrderTitle: job.workOrder.title,
      allowBranchPush: false
    });

    log(`[Job ${job.id}] Running validation after external agent output...`);
    const validationResults = await runValidation(workspaceDir);
    patchPayload.validationResults = validationResults;
    let testResult: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL" = "NOT_RUN";
    for (const vr of validationResults) {
      commandsRun.push(vr.command);
      testsRun.push(vr.command);
      if (testResult === "NOT_RUN") testResult = vr.success ? "PASSED" : "FAILED";
      else if (!vr.success) testResult = testResult === "PASSED" ? "PARTIAL" : "FAILED";
      if (!vr.success) errors.push(vr.failureSummary ?? (vr.stderr.trim() ? `Exit ${vr.exitCode}: ${vr.command}\n${vr.stderr.trim()}` : `Exit ${vr.exitCode}: ${vr.command}`));
      logLines.push(`$ ${vr.command}\nCWD: ${vr.cwd}\nTIMED_OUT: ${vr.timedOut}\nSTDOUT:\n${vr.stdout}\nSTDERR:\n${vr.stderr}`);
    }

    const emptyPatch = isEmptyPatch(patchPayload);
    let artifact: { id: string } | null = null;
    if (!emptyPatch) {
      artifact = await submitPatchArtifact(api, job.id, patchPayload);
      if (artifact) log(`[Job ${job.id}] Patch artifact submitted: ${artifact.id}`);
    }

    const externalRunStatus = result.timedOut
      ? "TIMED_OUT"
      : errors.length > 0
        ? "FAILED"
        : "SUCCEEDED";
    await api.completeExternalAgentRun(job.id, {
      status: externalRunStatus,
      outputText: result.output,
      artifactPaths: [...result.artifactPaths, ...(artifact ? [`patchArtifact:${artifact.id}`] : [])],
      logPath: result.logPath,
      exitCode: result.exitCode,
      errorMessage: errors[0] ?? null,
      metadata: {
        filesChanged: patchPayload.filesChanged,
        validationPassed: validationResults.every((vr) => vr.success),
        retryCount: run.attemptNumber - 1,
        commandTemplate: agent.command,
        workspacePath: workspaceDir
      }
    });

    const logsPreview = sanitizeLogOutput(logLines.slice(-100).join("\n"));
    await api.submitReport(job.id, {
      summary: emptyPatch
        ? `External agent "${agent.name}" completed but produced no file modifications for "${job.workOrder.title}".`
        : `External agent "${agent.name}" completed bridge execution for "${job.workOrder.title}".`,
      filesChanged: patchPayload.filesChanged,
      commandsRun,
      testsRun,
      testResult,
      errors,
      decisionsMade: [`External agent selected: ${agent.name}`, "Branch push, PR creation, and deploy were not attempted."],
      remainingWork: errors.length ? ["Review failed external agent output and validation results."] : [],
      nextRecommendedAction: errors.length ? "Review bridge run and retry with a revision prompt if safe." : "Review patch artifact and agent review summary.",
      logsPreview,
      rawOutput: logsPreview,
      patchSummary: emptyPatch ? "No files changed." : patchPayload.summary,
      contextUsed: buildContextUsed(job)
    });

    log(`[Job ${job.id}] External agent report submitted. Job is NEEDS_REVIEW.`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Job ${job.id}] External agent fatal error:`, errMsg);
    try {
      await api.completeExternalAgentRun(job.id, {
        status: "FAILED",
        errorMessage: errMsg,
        metadata: { workspacePath: workspaceDir }
      }).catch(() => undefined);
      await api.updateStatus(job.id, "FAILED", {
        logsPreview: sanitizeLogOutput([...logLines, `ERROR: ${errMsg}`].slice(-50).join("\n"))
      });
    } catch {
      // Best effort.
    }
  } finally {
    if (fs.existsSync(workspaceDir)) {
      console.log(`[Job ${job.id}] Workspace retained: ${workspaceDir}`);
    }
  }
}

function resolveExternalAgentCwd(workspaceRoot: string, workingDirectory: string | null | undefined): string {
  if (!workingDirectory?.trim()) return workspaceRoot;
  if (path.isAbsolute(workingDirectory)) {
    throw new Error("External agent workingDirectory must be relative to the isolated workspace.");
  }
  const resolved = path.resolve(workspaceRoot, workingDirectory);
  const root = path.resolve(workspaceRoot);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("External agent workingDirectory escapes the isolated workspace.");
  }
  return resolved;
}

async function submitBlockedExternalAgentReport(
  job: AutomationJob,
  reason: string,
  workspaceDir: string,
  logLines: string[]
) {
  const logsPreview = sanitizeLogOutput([...logLines, reason].slice(-50).join("\n"));
  await api.completeExternalAgentRun(job.id, {
    status: "FAILED",
    errorMessage: reason,
    metadata: { workspacePath: workspaceDir }
  }).catch(() => undefined);
  await api.submitReport(job.id, {
    summary: `External agent bridge run for "${job.workOrder.title}" was blocked: ${reason}`,
    filesChanged: [],
    commandsRun: [],
    testsRun: [],
    testResult: "NOT_RUN",
    errors: [reason],
    decisionsMade: [],
    remainingWork: ["Fix bridge configuration and retry the work order."],
    nextRecommendedAction: "Review External Agent Bridge settings",
    logsPreview,
    rawOutput: logsPreview,
    contextUsed: buildContextUsed(job)
  }).catch(async () => {
    await api.updateStatus(job.id, "FAILED", { logsPreview }).catch(() => undefined);
  });
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
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          output: result.output,
          durationMs: result.durationMs,
          cwd: result.cwd,
          timedOut: result.timedOut,
          outputTruncated: result.outputTruncated,
          message: result.message,
          failureSummary: result.failureSummary
        };
      },
      prepareWorkspace: async () => {
        const prepared = prepareRunnerWorkspace({ jobId: job.id, workspaceBase: WORKSPACE_BASE });
        console.log(`[Job ${job.id}] Workspace prepared: ${prepared.workspaceDir}`);
      },
      validateEnvironment: () => validateValidationDatabaseEnv(),
      getForwardedEnvNames: () => buildValidationChildEnv().forwardedNames,
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

  // Pre-approved patches (King already approved the source PatchArtifact, then
  // explicitly requested this apply-and-push job) skip the second approval wait.
  if (isPreApprovedPushPolicy(job.commandPolicy)) {
    log(`[Job ${job.id}] Pre-approved patch policy — pushing without a second approval.`);
  } else {
    // Poll for King approval (HIGH/CRITICAL require explicit approval)
    const approved = await waitForApproval(artifactId, log);
    if (!approved) {
      log(`[Job ${job.id}] Branch push skipped: patch not approved within timeout`);
      return;
    }
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
