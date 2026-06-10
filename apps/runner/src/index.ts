/**
 * AI Kingdom Runner — Sandbox Executor
 *
 * Hard constraints:
 * - Never push/merge/deploy
 * - Never run destructive commands
 * - All work in isolated workspace
 * - All outputs redacted before reporting
 */

import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ApiClient, type AutomationJob } from "./apiClient.js";
import { runCommand } from "./sandbox.js";
import { sanitizeLogOutput } from "./secretRedactor.js";
import { validateCommand } from "./commandValidator.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const RUNNER_TOKEN = process.env.RUNNER_TOKEN;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "15000", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const WORKSPACE_BASE = process.env.WORKSPACE_BASE ?? path.join(os.tmpdir(), "ai-kingdom-runner");

if (!RUNNER_TOKEN) {
  console.error("[Runner] RUNNER_TOKEN is required. Set it in .env or environment.");
  process.exit(1);
}

const VERSION = "0.1.0";
const HOSTNAME = os.hostname();

const api = new ApiClient({ baseUrl: API_BASE_URL, runnerToken: RUNNER_TOKEN });

async function main() {
  console.log(`[Runner] Starting AI Kingdom Runner v${VERSION}`);
  console.log(`[Runner] API: ${API_BASE_URL}`);
  console.log(`[Runner] Workspace base: ${WORKSPACE_BASE}`);

  // Ensure workspace base exists
  fs.mkdirSync(WORKSPACE_BASE, { recursive: true });

  // Initial heartbeat to go ONLINE
  await sendHeartbeat();

  // Start heartbeat loop
  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Poll loop
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

  // Not reached but TypeScript-safe
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
    // Mark as RUNNING
    await api.updateStatus(job.id, "RUNNING");

    log(`[Job ${job.id}] Starting execution in ${workspaceDir}`);
    log(`[Job ${job.id}] Mode: ${job.mode}`);

    // Create isolated workspace
    fs.mkdirSync(workspaceDir, { recursive: true });

    // If project has a localPath, copy or use as reference context (read-only scan)
    if (job.project) {
      log(`[Job ${job.id}] Project: ${job.project.name}`);
    }

    // Parse execution plan
    const plan = job.planJson as ExecutionPlan | null;
    if (!plan || !Array.isArray(plan.steps)) {
      log(`[Job ${job.id}] No execution plan available. Running validation-only.`);
    } else {
      log(`[Job ${job.id}] Plan: ${plan.summary ?? "(no summary)"} — ${plan.steps.length} step(s)`);

      // Execute each step from plan
      for (const step of plan.steps) {
        sequence++;
        if (step.type === "COMMAND") {
          const cmd = step.command;
          const args = step.args ?? [];

          // Pre-validate
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
          if (cmd === "npm" && args[0] === "run" && (args[1] === "test" || args[1] === "typecheck" || args[1] === "build")) {
            testsRun.push(`${cmd} ${args.join(" ")}`);
            if (testResult === "NOT_RUN") testResult = result.exitCode === 0 ? "PASSED" : "FAILED";
            else if (result.exitCode !== 0) testResult = "FAILED";
            else if (testResult === "FAILED") testResult = "PARTIAL";
          }

          if (result.exitCode !== 0) {
            errors.push(`Exit ${result.exitCode}: ${cmd} ${args.join(" ")}`);
          }

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
        } else {
          log(`[Job ${job.id}] Step ${sequence}: Unknown step type: ${step.type}`);
        }
      }
    }

    // Submit report
    const logsPreview = sanitizeLogOutput(logLines.slice(-100).join("\n"));
    log(`[Job ${job.id}] Submitting report...`);

    await api.submitReport(job.id, {
      summary: plan?.summary ?? "Sandbox execution completed.",
      filesChanged: [],
      commandsRun,
      testsRun,
      testResult,
      errors,
      decisionsMade: [],
      remainingWork: errors.length > 0 ? ["Review and fix failed commands"] : [],
      nextRecommendedAction: errors.length > 0 ? "Review errors in implementation report" : "Mark work order as complete",
      logsPreview,
      rawOutput: logsPreview
    });

    log(`[Job ${job.id}] Report submitted. Job is NEEDS_REVIEW.`);

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
    // Clean up workspace
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      log(`[Job ${job.id}] Workspace cleaned up`);
    } catch {
      // Best effort
    }
  }
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
