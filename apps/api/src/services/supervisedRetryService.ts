import type { AutomationJob, AutomationJobMode } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { getBooleanSetting } from "./settingsService.js";
import { approveJob, cancelJob, createAutomationJob } from "./automationJobService.js";
import { createExternalAgentBridgeJob } from "./externalAgentBridgeService.js";
import { validateContextForAutomationJob } from "./projectContextBindingService.js";
import { createNotice } from "./royalSecretaryService.js";

/**
 * M24 Phase B — Supervised auto-retry.
 *
 * The reviewer already emits a verdict for every completed job, but the
 * `WorkOrder.autoRetryCount` / `maxAutoRetries` fields were recorded and never acted on —
 * nothing re-dispatched a failed job. This service closes that gap.
 *
 * Two entry points share one core (`dispatchRetry`):
 *  - King-triggered: the King clicks "Retry" on a failed job (always available, capped).
 *  - Auto: `maybeAutoRetry` fires from `submitReport` ONLY when the opt-in setting
 *    `SUPERVISED_AUTO_RETRY_ENABLED` (default false) is on, and only for LOW-priority
 *    mechanical failures with an online runner.
 *
 * Safety boundaries (unchanged from the rest of the autonomy line): mechanical failures
 * only, capped at `maxAutoRetries`, results always land NEEDS_REVIEW, and no branch push,
 * PR, merge, or deploy ever happens automatically.
 */

/** Review verdicts that represent a mechanical (not semantic) failure — the only ones a
 *  supervised retry acts on. NEEDS_FIX / RISK_REVIEW need the King's judgement. */
export const MECHANICAL_RETRY_VERDICTS = new Set(["PATCH_FAILED", "VALIDATION_FAILED"]);

/** Job modes that produce a patch and can therefore be retried. VALIDATION_ONLY is
 *  read-only — there is nothing to re-attempt. */
const RETRYABLE_JOB_MODES = new Set<AutomationJobMode>(["SANDBOX_PATCH", "EXTERNAL_AGENT"]);

const ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS = 10 * 60000;

export type RetryTrigger = "KING" | "AUTO";

export type RetryResult =
  | { retried: true; newJobId: string; attempt: number }
  | { retried: false; reason: string; escalated?: boolean };

/** Inlined (rather than imported from livingLoopService) to avoid an import cycle through
 *  automationJobService. */
async function hasOnlineRunner(): Promise<boolean> {
  const cutoff = new Date(Date.now() - ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS);
  const runner = await prisma.agentRunner.findFirst({ where: { status: "ONLINE", lastHeartbeatAt: { gte: cutoff } } });
  return Boolean(runner);
}

/** Mirror the bridge's own preconditions (EXTERNAL_AGENT_BRIDGE_ENABLED +
 *  validateExternalAgentForBridge) so they are checked BEFORE any destructive mutation in
 *  dispatchRetry, never after. */
async function precheckExternalAgentRetry(
  assignedExternalAgentId: string | null
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!assignedExternalAgentId) return { ok: false, reason: "no_external_agent_assigned" };
  if (!(await getBooleanSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", false))) return { ok: false, reason: "bridge_disabled" };
  const agent = await prisma.externalAgent.findUnique({ where: { id: assignedExternalAgentId } });
  if (!agent || !agent.isActive || !agent.bridgeEnabled || agent.type === "MANUAL_ONLY" || !agent.command?.trim()) {
    return { ok: false, reason: "external_agent_not_bridge_ready" };
  }
  return { ok: true };
}

/**
 * Re-dispatch a failed job. Shared by the King-triggered route and the auto path.
 * Throws (NotFoundError / ConflictError) for hard preconditions; returns a structured
 * `{ retried: false, reason }` for soft policy outcomes so the auto path can skip gracefully.
 */
export async function dispatchRetry(input: { jobId: string; triggeredBy: RetryTrigger; userId: string }): Promise<RetryResult> {
  const { jobId, triggeredBy, userId } = input;

  const job = await prisma.automationJob.findUnique({
    where: { id: jobId },
    include: {
      workOrder: { select: { id: true, autoRetryCount: true, maxAutoRetries: true, assignedExternalAgentId: true } }
    }
  });
  if (!job) {
    const err = new Error("AutomationJob not found");
    err.name = "NotFoundError";
    throw err;
  }
  if (job.status !== "NEEDS_REVIEW") {
    const err = new Error(`Cannot retry a job in status ${job.status}; only NEEDS_REVIEW jobs can be retried.`);
    err.name = "ConflictError";
    throw err;
  }
  if (!RETRYABLE_JOB_MODES.has(job.mode)) {
    return { retried: false, reason: `mode_not_retryable:${job.mode}` };
  }
  const workOrder = job.workOrder;
  if (!workOrder) return { retried: false, reason: "work_order_missing" };

  const review = await prisma.agentReviewSummary.findUnique({
    where: { automationJobId: jobId },
    select: { verdict: true }
  });
  if (!review || !MECHANICAL_RETRY_VERDICTS.has(review.verdict)) {
    return { retried: false, reason: `verdict_not_retryable:${review?.verdict ?? "none"}` };
  }

  if (workOrder.autoRetryCount >= workOrder.maxAutoRetries) {
    return { retried: false, reason: "retries_exhausted" };
  }

  // Pre-validate context BEFORE mutating so a stale-context retry doesn't cancel the old
  // job and bump the counter without actually re-dispatching.
  const contextOutcome = await validateContextForAutomationJob(workOrder.id, job.mode);
  if (!contextOutcome.ok) {
    return { retried: false, reason: `context_not_fresh:${contextOutcome.status}` };
  }

  // EXTERNAL_AGENT preflight: createExternalAgentBridgeJob can throw (bridge disabled,
  // no/invalid agent) AFTER the destructive cancel + increment below — corrupting state on
  // the always-on King path. Validate every fallible precondition up front instead.
  if (job.mode === "EXTERNAL_AGENT") {
    const preflight = await precheckExternalAgentRetry(workOrder.assignedExternalAgentId);
    if (!preflight.ok) return { retried: false, reason: preflight.reason };
  }

  // 1) Supersede the failed attempt. CANCELLED, not FAILED — the Living Loop observes
  //    FAILED jobs and would propose a competing candidate for the same work order. The
  //    failure record is preserved in the AgentReviewSummary + ImplementationReport.
  await cancelJob(jobId, userId);

  // 2) Increment BEFORE re-dispatch: buildExternalAgentPrompt reads autoRetryCount > 0 to
  //    inject the prior attempt's reviewer feedback and frame the prompt as a revision.
  const attempt = workOrder.autoRetryCount + 1;
  await prisma.workOrder.update({ where: { id: workOrder.id }, data: { autoRetryCount: attempt } });

  // 3) Re-create the job in the same mode.
  let newJob: AutomationJob;
  try {
    if (job.mode === "EXTERNAL_AGENT") {
      const result = await createExternalAgentBridgeJob({
        workOrderId: workOrder.id,
        externalAgentId: workOrder.assignedExternalAgentId,
        createdByUserId: userId
      });
      newJob = result.job;
    } else {
      newJob = await createAutomationJob({
        workOrderId: workOrder.id,
        mode: "SANDBOX_PATCH",
        commandPolicy: job.commandPolicy ?? "SANDBOX_PATCH_NO_PUSH",
        useAssignedAgentCli: Boolean(workOrder.assignedExternalAgentId),
        createdByUserId: userId
      });
    }
  } catch (err) {
    // Context can go stale between the pre-check and creation, the bridge can be disabled,
    // or another race can intervene. The old job is already superseded; surface the reason
    // without crashing the caller.
    const name = err instanceof Error ? err.name : "Error";
    return { retried: false, reason: `dispatch_failed:${name}` };
  }

  // 4) The retry IS the authorization — approve so a runner can claim it. Results still
  //    land NEEDS_REVIEW; nothing is pushed/merged/deployed.
  await approveJob(newJob.id, userId).catch(() => undefined);

  await auditLog({
    userId,
    action: "supervised_retry_dispatched",
    resourceType: "AutomationJob",
    resourceId: newJob.id,
    metadata: { triggeredBy, workOrderId: workOrder.id, supersededJobId: jobId, attempt, mode: job.mode, verdict: review.verdict }
  }).catch(() => undefined);

  return { retried: true, newJobId: newJob.id, attempt };
}

/**
 * Auto path, called best-effort from submitReport after the deterministic review is
 * created. No-op unless the opt-in setting is on; conservative gates on top of dispatchRetry.
 */
export async function maybeAutoRetry(input: {
  job: Pick<AutomationJob, "id" | "mode" | "createdByUserId">;
  verdict: string;
}): Promise<RetryResult> {
  const enabled = await getBooleanSetting("SUPERVISED_AUTO_RETRY_ENABLED", false);
  if (!enabled) return { retried: false, reason: "auto_retry_disabled" };

  if (!MECHANICAL_RETRY_VERDICTS.has(input.verdict)) {
    return { retried: false, reason: `verdict_not_mechanical:${input.verdict}` };
  }
  if (!RETRYABLE_JOB_MODES.has(input.job.mode)) {
    return { retried: false, reason: `mode_not_retryable:${input.job.mode}` };
  }

  // The runner-token request has no acting user — resolve it from the job's creator.
  const userId = input.job.createdByUserId;
  if (!userId) return { retried: false, reason: "no_acting_user" };

  const job = await prisma.automationJob.findUnique({
    where: { id: input.job.id },
    include: { workOrder: { select: { id: true, priority: true, autoRetryCount: true, maxAutoRetries: true, createdByUserId: true } } }
  });
  const workOrder = job?.workOrder;
  if (!workOrder) return { retried: false, reason: "work_order_missing" };

  // Conservative auto gate: LOW priority only. WorkOrder has no riskLevel column; priority
  // is the risk signal across the autonomy line.
  if (workOrder.priority !== "LOW") return { retried: false, reason: `priority_not_low:${workOrder.priority}` };

  // Exhausted → escalate to the King instead of silently stopping.
  if (workOrder.autoRetryCount >= workOrder.maxAutoRetries) {
    await escalateExhaustedRetry({ jobId: input.job.id, workOrderId: workOrder.id, attempts: workOrder.autoRetryCount, userId });
    return { retried: false, reason: "retries_exhausted", escalated: true };
  }

  if (!(await hasOnlineRunner())) return { retried: false, reason: "no_online_runner" };

  try {
    return await dispatchRetry({ jobId: input.job.id, triggeredBy: "AUTO", userId });
  } catch (err) {
    // ContextBindingError and the like are expected outcomes here, not crashes.
    const name = err instanceof Error ? err.name : "Error";
    return { retried: false, reason: `dispatch_error:${name}` };
  }
}

async function escalateExhaustedRetry(input: { jobId: string; workOrderId: string; attempts: number; userId: string }) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: input.workOrderId },
    select: { title: true }
  });
  await createNotice({
    title: `Auto-retry exhausted: ${workOrder?.title ?? "work order"}`,
    content: `Supervised auto-retry ran ${input.attempts} attempt(s) and the work still did not pass mechanical review. King review is required — inspect the latest job and decide whether to revise the work order, raise the retry limit, or close it.`,
    severity: "WARNING",
    sourceType: "AutomationJob",
    sourceId: input.jobId
  }).catch(() => undefined);
  await auditLog({
    userId: input.userId,
    action: "supervised_retry_exhausted",
    resourceType: "WorkOrder",
    resourceId: input.workOrderId,
    metadata: { jobId: input.jobId, attempts: input.attempts }
  }).catch(() => undefined);
}
