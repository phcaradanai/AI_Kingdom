/**
 * External Agent Context Pack Service
 *
 * Builds a structured context pack for Claude Code, Codex, Cline, and other
 * external agents. The pack aggregates everything an agent needs to continue
 * work on a WorkOrder without re-deriving or guessing context:
 *   - task mode (NEW_TASK / CONTINUATION / REVISION / RETRY_AFTER_FAILURE)
 *   - prior attempts, failures, and decisions
 *   - do-not-repeat list
 *   - context freshness status
 *   - exact next action
 *   - acceptance criteria and validation commands
 *
 * AI Kingdom remains the source of truth. External agents receive context;
 * they do not own it.
 */

import { getCharter, getVision } from "./charterService.js";
import { buildProjectContext } from "./projectContextService.js";
import { getWorkContinuity, type TaskMode, type WorkContinuityView } from "./workContinuityService.js";
import { prisma } from "../db/prisma.js";

export type ExternalAgentContextPack = {
  workOrderId: string;
  externalAgentId: string;
  taskMode: TaskMode;
  goal: string;
  projectSourceOfTruth: string;
  contextFreshness: {
    status: string;
    requiredAction: string;
    warnings: string[];
  };
  previousAttemptsSummary: string;
  failedCommandsAndErrors: string[];
  decisionsMade: string[];
  filesChanged: string[];
  knownBlockers: string[];
  doNotRepeat: string[];
  exactNextAction: string;
  acceptanceCriteria: string[];
  validationCommands: string[];
  requiredReportBackFormat: string;
  continuity: WorkContinuityView;
};

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter((item) => item.trim().length > 0)
    : [];
}

function summarize(value: string, maxLength = 600): string {
  const normalized = value.replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function buildPreviousAttemptsSummary(continuity: WorkContinuityView): string {
  const latestReport = continuity.implementationReports[0] ?? null;

  if (continuity.failedAttempts.length === 0 && !latestReport) {
    return "No prior attempts.";
  }

  const parts: string[] = [];

  if (latestReport) {
    parts.push(
      `Latest report (test result: ${latestReport.testResult}): ${summarize(latestReport.summary, 300)}`
    );
  }

  if (continuity.failedAttempts.length > 0) {
    parts.push(`\n${continuity.failedAttempts.length} failed attempt(s):`);
    for (const attempt of continuity.failedAttempts.slice(0, 3)) {
      const lines: string[] = [`  Attempt ${attempt.attemptNumber}`];
      if (attempt.verdict) lines.push(`verdict: ${attempt.verdict}`);
      if (attempt.errorMessage) lines.push(`error: ${summarize(attempt.errorMessage, 200)}`);
      if (attempt.whatFailed.length > 0) {
        lines.push(`what failed: ${attempt.whatFailed.slice(0, 3).join("; ")}`);
      }
      if (attempt.failedCommands.length > 0) {
        lines.push(`failed commands: ${attempt.failedCommands.slice(0, 3).join("; ")}`);
      }
      parts.push(lines.join(", "));
    }
  }

  return parts.join("\n");
}

export async function buildExternalAgentContextPack(
  workOrderId: string,
  externalAgentId: string
): Promise<ExternalAgentContextPack> {
  const [continuity, externalAgent] = await Promise.all([
    getWorkContinuity(workOrderId),
    prisma.externalAgent.findUnique({ where: { id: externalAgentId } })
  ]);

  if (!externalAgent) {
    const err = new Error("External agent not found");
    err.name = "NotFoundError";
    throw err;
  }

  const workOrder = continuity.workOrder;

  // Kingdom and project context
  const [charter, vision] = await Promise.all([getCharter(), getVision()]);
  const linkedProjectContext = workOrder.projectId
    ? await buildProjectContext(workOrder.projectId).catch(() => null)
    : null;

  const projectSourceOfTruth = [
    `Charter: ${summarize(charter?.mission ?? charter?.content ?? "AI Kingdom serves the King.")}`,
    `Vision: ${summarize(vision?.content ?? "Build a durable AI Kingdom command center.")}`,
    linkedProjectContext ? `Project: ${summarize(linkedProjectContext)}` : "No linked project assigned."
  ].join("\n");

  // Known blockers from work order + latest review risk notes
  const knownBlockers: string[] = [];
  if (workOrder.blockedReason) knownBlockers.push(workOrder.blockedReason);
  const latestReview = continuity.reviewSummaries[0] ?? null;
  if (latestReview) {
    for (const note of asStringList(latestReview.riskNotes)) {
      knownBlockers.push(note);
    }
  }

  const previousAttemptsSummary = buildPreviousAttemptsSummary(continuity);

  return {
    workOrderId,
    externalAgentId,
    taskMode: continuity.taskMode,
    goal: workOrder.objective,
    projectSourceOfTruth,
    contextFreshness: {
      status: continuity.contextFreshness.workOrderStatus,
      requiredAction: continuity.contextFreshness.requiredAction,
      warnings: continuity.contextFreshness.warnings
    },
    previousAttemptsSummary,
    failedCommandsAndErrors: continuity.failedCommands,
    decisionsMade: continuity.decisionsMade,
    filesChanged: continuity.filesChanged,
    knownBlockers,
    doNotRepeat: continuity.doNotRepeat,
    exactNextAction: continuity.nextRecommendedAction,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    validationCommands: workOrder.validationCommands,
    requiredReportBackFormat:
      "Summary | Files changed | Commands run | Tests run | Test result | Decisions made | Issues found | Remaining work | Recommended next step",
    continuity
  };
}
