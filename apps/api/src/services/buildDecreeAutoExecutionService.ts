import type { TaskMode } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { approveJob } from "./automationJobService.js";
import { assertExternalAgentBridgeEnabled, createExternalAgentBridgeJob } from "./externalAgentBridgeService.js";
import { findBlockedPathHint } from "./livingLoopRiskPolicyService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";
import { requestKingExternalAgentChoice } from "./externalAgentReadinessService.js";
import { getBooleanSetting } from "./settingsService.js";

/**
 * M23 Phase C-2 — decree → execution auto-router.
 *
 * After a BUILD decree's planner creates a work order, this optionally routes it
 * straight to the external-agent (Claude Code) bridge so the King's single decree
 * runs end-to-end without a manual dispatch/approve. It is the automated form of
 * what the King can already trigger by hand, and it reuses the proven bridge path
 * (createExternalAgentBridgeJob → approveJob → runner → NEEDS_REVIEW).
 *
 * Per the King's directive it auto-executes ONLY when risk is LOW and project
 * context is FRESH; anything riskier or with stale context pauses for King
 * approval. Every hard guardrail is preserved:
 *   - opt-in via COUNCIL_AUTO_EXECUTE_LOW_RISK (default OFF) + EXTERNAL_AGENT_BRIDGE_ENABLED
 *   - LOW risk only; sensitive/blocked file hints refuse
 *   - requires an online runner and a linked project with FRESH bound context
 *   - never auto push / merge / deploy / PR — the patch always lands in NEEDS_REVIEW
 * The function never throws; failures degrade to a skip reason so planning is
 * never blocked by auto-execution.
 */

const ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS = 90_000;
const ACTIVE_JOB_STATUSES = ["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW"] as const;

export type AutoExecuteResult = { executed: boolean; jobId?: string; skipReason?: string };

export async function maybeAutoExecuteBuildWorkOrder(input: {
  workOrderId: string;
  taskMode: TaskMode;
  riskLevel?: string;
  fileHints?: string[];
  projectId: string | null;
  userId: string;
}): Promise<AutoExecuteResult> {
  try {
    if (input.taskMode !== "BUILD") return skip("not a BUILD decree");
    if (!(await getBooleanSetting("COUNCIL_AUTO_EXECUTE_LOW_RISK", false))) {
      return skip("COUNCIL_AUTO_EXECUTE_LOW_RISK is disabled");
    }
    if (!(await getBooleanSetting("EXTERNAL_AGENT_BRIDGE_ENABLED", false))) {
      return skip("External Agent Bridge is disabled");
    }
    if ((input.riskLevel ?? "").toUpperCase() !== "LOW") {
      return skip(`risk level ${input.riskLevel ?? "UNKNOWN"} is not LOW — awaiting King approval`);
    }
    if (!input.projectId) return skip("work order has no linked project");

    const blocked = findBlockedPathHint(input.fileHints ?? []);
    if (blocked) return skip(`blocked path hint detected: ${blocked} — awaiting King approval`);

    if (!(await hasOnlineRunner())) return skip("no online runner available");

    const activeJob = await prisma.automationJob.findFirst({
      where: { workOrderId: input.workOrderId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      select: { id: true }
    });
    if (activeJob) return skip("an active automation job already exists");

    // Bind to the freshest snapshot. We do NOT auto-scan local docs here — if the
    // snapshot is stale (docs changed since the last scan), the King or the Living
    // Loop's auto context repair refreshes it. Auto-exec proceeds only when FRESH.
    const { workOrder: bound } = await bindFreshContextToWorkOrder(input.workOrderId, { userId: input.userId });
    if (bound.contextBindingStatus !== "FRESH") {
      return skip(`context is ${bound.contextBindingStatus} after binding — awaiting King review`);
    }

    // King's external-agent choice gate: when enabled and the work order has no
    // explicit agent assignment, do NOT auto-select an agent. Raise a King-decision
    // Matter listing the agents that are ready right now and pause. Auto-exec fires
    // once (after the planner creates the WO) and is not re-invoked, so the King then
    // picks an agent and dispatches manually — the manual execute path finds the
    // assignment and proceeds; assigning resolves this choice Matter.
    if (await getBooleanSetting("REQUIRE_KING_EXTERNAL_AGENT_CHOICE", true)) {
      if (!bound.assignedExternalAgentId) {
        const choice = await requestKingExternalAgentChoice({
          workOrderId: input.workOrderId,
          workOrderTitle: bound.title,
          projectId: input.projectId
        });
        await auditLog({
          userId: input.userId,
          action: "external_agent_choice_requested",
          resourceType: "WorkOrder",
          resourceId: input.workOrderId,
          metadata: { matterId: choice.matterId, created: choice.created, readyAgents: choice.readyAgentNames }
        }).catch(() => undefined);
        return skip("awaiting King external-agent choice");
      }
    }

    await assertExternalAgentBridgeEnabled();
    const bridge = await createExternalAgentBridgeJob({
      workOrderId: input.workOrderId,
      createdByUserId: input.userId
    });
    const approved = await approveJob(bridge.job.id, input.userId);

    await auditLog({
      userId: input.userId,
      action: "council_auto_execute_low_risk_build",
      resourceType: "AutomationJob",
      resourceId: approved.id,
      metadata: {
        workOrderId: input.workOrderId,
        projectId: input.projectId,
        externalAgentId: bridge.externalAgent.id,
        externalAgentRunId: bridge.externalAgentRun.id,
        riskLevel: "LOW",
        autoExecuted: true
      }
    }).catch(() => undefined);

    return { executed: true, jobId: approved.id };
  } catch (err) {
    return skip(err instanceof Error ? err.message : String(err));
  }
}

function skip(reason: string): AutoExecuteResult {
  return { executed: false, skipReason: reason };
}

async function hasOnlineRunner(): Promise<boolean> {
  const cutoff = new Date(Date.now() - ONLINE_RUNNER_MAX_HEARTBEAT_AGE_MS);
  const runner = await prisma.agentRunner.findFirst({
    where: { status: "ONLINE", lastHeartbeatAt: { gte: cutoff } },
    select: { id: true }
  });
  return runner !== null;
}
