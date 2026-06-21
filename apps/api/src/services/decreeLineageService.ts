import { prisma } from "../db/prisma.js";

/**
 * Decree Lineage — a single, ordered trace the King can read top-to-bottom to see
 * exactly what happened to one command, from decree to secretary summary:
 *
 *   1. decree            — the King's command (Task)
 *   2. council           — who thought what (CouncilSession + per-role responses)
 *   3. owner             — the kingdom agent responsible for the work (WorkOrder + assignee)
 *   4. externalPrompt    — the exact prompt handed to the external agent
 *   5. externalResult    — what the external agent returned (output + patch)
 *   6. review            — the kingdom agent who reviewed / captured knowledge / recommended
 *   7. secretarySummary  — the Royal Secretary's wrap-up of everything that happened
 *
 * Works whether the command began as a decree→council (entry by taskId) or as a
 * direct work order (entry by workOrderId). Every stage is nullable so partial
 * lineages render cleanly. Read-only — it never mutates Kingdom state.
 */

export type LineageAgentRef = { id: string; name: string; title: string | null } | null;

export interface DecreeLineageDto {
  anchor: { workOrderId: string | null; taskId: string | null; sessionId: string | null };
  decree: {
    id: string;
    title: string;
    command: string;
    mode: string;
    createdAt: string;
    createdByName: string | null;
  } | null;
  council: {
    id: string;
    finalSummary: string | null;
    fallbackNotice: string | null;
    createdAt: string;
    responses: Array<{ role: string; agent: LineageAgentRef; response: string }>;
  } | null;
  owner: {
    workOrderId: string;
    title: string;
    status: string;
    contextBindingStatus: string | null;
    executionTarget: string | null;
    assignedAgent: LineageAgentRef;
    assignedAgentReason: string | null;
    assignedExternalAgentName: string | null;
  } | null;
  externalPrompt: {
    runId: string;
    externalAgentName: string | null;
    inputPrompt: string;
  } | null;
  externalResult: {
    runId: string;
    status: string;
    exitCode: number | null;
    outputText: string | null;
    completedAt: string | null;
    patches: Array<{
      id: string;
      validationStatus: string | null;
      riskLevel: string | null;
      filesChanged: string[];
      diffStat: string | null;
    }>;
  } | null;
  review: {
    reviewerAgent: LineageAgentRef;
    verdict: string;
    confidence: string;
    kingRecommendation: string;
    summary: string;
    createdAt: string;
    knowledge: Array<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      category: string | null;
      proposedByAgent: LineageAgentRef;
    }>;
  } | null;
  secretarySummary: {
    id: string | null;
    title: string;
    summary: string;
    createdAt: string | null;
    synthesized: boolean;
  } | null;
}

function agentRef(agent: { id: string; name: string; title: string | null } | null | undefined): LineageAgentRef {
  return agent ? { id: agent.id, name: agent.name, title: agent.title ?? null } : null;
}

export async function getDecreeLineage(anchor: { workOrderId?: string; taskId?: string }): Promise<DecreeLineageDto> {
  // ── Resolve the work order + originating council session from either anchor ──
  let workOrder = anchor.workOrderId
    ? await prisma.workOrder.findUnique({
        where: { id: anchor.workOrderId },
        include: { assignedAgent: true, assignedExternalAgent: true }
      })
    : null;

  let sessionId: string | null = null;
  if (workOrder?.sourceType === "COUNCIL_SESSION" && workOrder.sourceId) {
    sessionId = workOrder.sourceId;
  }

  let taskId = anchor.taskId ?? null;

  // Entry by taskId → find that task's latest council session, then its work order.
  if (!workOrder && taskId) {
    const session = await prisma.councilSession.findFirst({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdWorkOrderId: true }
    });
    if (session) {
      sessionId = session.id;
      if (session.createdWorkOrderId) {
        workOrder = await prisma.workOrder.findUnique({
          where: { id: session.createdWorkOrderId },
          include: { assignedAgent: true, assignedExternalAgent: true }
        });
      }
    }
  }

  const session = sessionId
    ? await prisma.councilSession.findUnique({
        where: { id: sessionId },
        include: {
          responses: { include: { agent: true }, orderBy: { createdAt: "asc" } },
          task: { include: { user: { select: { displayName: true, email: true } } } }
        }
      })
    : null;

  if (session?.taskId) taskId = session.taskId;

  // ── 1. Decree ──────────────────────────────────────────────────────────────
  const task = session?.task
    ? session.task
    : taskId
      ? await prisma.task.findUnique({ where: { id: taskId }, include: { user: { select: { displayName: true, email: true } } } })
      : null;

  const decree: DecreeLineageDto["decree"] = task
    ? {
        id: task.id,
        title: task.title,
        command: task.command,
        mode: task.mode,
        createdAt: task.createdAt.toISOString(),
        createdByName: task.user?.displayName ?? task.user?.email ?? null
      }
    : null;

  // ── 2. Council ─────────────────────────────────────────────────────────────
  const council: DecreeLineageDto["council"] = session
    ? {
        id: session.id,
        finalSummary: session.finalSummary,
        fallbackNotice: session.fallbackNotice,
        createdAt: session.createdAt.toISOString(),
        responses: session.responses.map((r) => ({
          role: r.role,
          agent: agentRef(r.agent),
          response: r.response
        }))
      }
    : null;

  // ── 3. Owner (work order + responsible agent) ───────────────────────────────
  const owner: DecreeLineageDto["owner"] = workOrder
    ? {
        workOrderId: workOrder.id,
        title: workOrder.title,
        status: workOrder.status,
        contextBindingStatus: workOrder.contextBindingStatus ?? null,
        executionTarget: workOrder.executionTarget ?? null,
        assignedAgent: agentRef(workOrder.assignedAgent),
        assignedAgentReason: workOrder.assignedAgentReason ?? null,
        assignedExternalAgentName: workOrder.assignedExternalAgent?.name ?? null
      }
    : null;

  // ── 4 & 5. External agent prompt + result (latest EXTERNAL_AGENT job) ────────
  let externalPrompt: DecreeLineageDto["externalPrompt"] = null;
  let externalResult: DecreeLineageDto["externalResult"] = null;
  let review: DecreeLineageDto["review"] = null;

  if (workOrder) {
    const job = await prisma.automationJob.findFirst({
      where: { workOrderId: workOrder.id, mode: "EXTERNAL_AGENT" },
      orderBy: { createdAt: "desc" },
      include: {
        externalAgentRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { externalAgent: { select: { name: true } } }
        },
        patchArtifacts: { orderBy: { createdAt: "desc" } },
        reviewSummary: { include: { reviewerAgent: true } }
      }
    });

    const run = job?.externalAgentRuns[0] ?? null;
    if (run) {
      externalPrompt = {
        runId: run.id,
        externalAgentName: run.externalAgent?.name ?? null,
        inputPrompt: run.inputPrompt
      };
      externalResult = {
        runId: run.id,
        status: run.status,
        exitCode: run.exitCode ?? null,
        outputText: run.outputText ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        patches: (job?.patchArtifacts ?? []).map((p) => ({
          id: p.id,
          validationStatus: p.validationStatus ?? null,
          riskLevel: p.riskLevel ?? null,
          filesChanged: p.filesChanged ?? [],
          diffStat: p.diffStat ?? null
        }))
      };
    }

    // ── 6. Review + knowledge captured to present / recommend / improve ────────
    // AgentKnowledgeCandidate is linked by council session / task (no workOrderId),
    // and exposes agents only as scalar ids — resolve their names separately.
    const knowledge = (sessionId || taskId)
      ? await prisma.agentKnowledgeCandidate.findMany({
          where: {
            OR: [
              ...(sessionId ? [{ councilSessionId: sessionId }] : []),
              ...(taskId ? [{ taskId }] : [])
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 10
        })
      : [];

    const kAgentIds = [...new Set(knowledge.map((k) => k.proposedByAgentId ?? k.agentId).filter((x): x is string => Boolean(x)))];
    const kAgents = kAgentIds.length
      ? await prisma.agent.findMany({ where: { id: { in: kAgentIds } }, select: { id: true, name: true, title: true } })
      : [];
    const kAgentMap = new Map(kAgents.map((a) => [a.id, a]));

    if (job?.reviewSummary || knowledge.length > 0) {
      const rs = job?.reviewSummary;
      review = {
        reviewerAgent: agentRef(rs?.reviewerAgent ?? null),
        verdict: rs?.verdict ?? "PENDING",
        confidence: rs?.confidence ?? "—",
        kingRecommendation: rs?.kingRecommendation ?? "—",
        summary: rs?.summary ?? "",
        createdAt: (rs?.createdAt ?? new Date()).toISOString(),
        knowledge: knowledge.map((k) => ({
          id: k.id,
          title: k.title,
          summary: k.summary ?? null,
          status: k.status,
          category: k.category ?? null,
          proposedByAgent: agentRef(kAgentMap.get(k.proposedByAgentId ?? k.agentId) ?? null)
        }))
      };
    }
  }

  // ── 7. Royal Secretary summary (persisted Report, else synthesized) ─────────
  const report = await prisma.report.findFirst({
    where: {
      OR: [
        ...(sessionId ? [{ sourceCouncilSessionId: sessionId }] : []),
        ...(taskId ? [{ sourceTaskId: taskId }] : [])
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  const secretarySummary: DecreeLineageDto["secretarySummary"] = report
    ? { id: report.id, title: report.title, summary: report.summary, createdAt: report.createdAt.toISOString(), synthesized: false }
    : owner
      ? {
          id: null,
          title: "Royal Secretary Summary",
          summary: synthesizeSecretarySummary({ decree, owner, externalResult, review }),
          createdAt: null,
          synthesized: true
        }
      : null;

  return {
    anchor: { workOrderId: workOrder?.id ?? anchor.workOrderId ?? null, taskId, sessionId },
    decree,
    council,
    owner,
    externalPrompt,
    externalResult,
    review,
    secretarySummary
  };
}

function synthesizeSecretarySummary(parts: {
  decree: DecreeLineageDto["decree"];
  owner: DecreeLineageDto["owner"];
  externalResult: DecreeLineageDto["externalResult"];
  review: DecreeLineageDto["review"];
}): string {
  const lines: string[] = [];
  if (parts.decree) lines.push(`Decree: ${parts.decree.title} (mode ${parts.decree.mode}).`);
  if (parts.owner) {
    const who = parts.owner.assignedExternalAgentName ?? parts.owner.assignedAgent?.name ?? "an agent";
    lines.push(`Work order "${parts.owner.title}" is ${parts.owner.status}, handled by ${who}.`);
  }
  if (parts.externalResult) {
    const fileCount = parts.externalResult.patches.reduce((n, p) => n + p.filesChanged.length, 0);
    lines.push(`External agent ${parts.externalResult.status.toLowerCase()} (exit ${parts.externalResult.exitCode ?? "—"}), producing ${parts.externalResult.patches.length} patch(es) across ${fileCount} file(s) — awaiting King review.`);
  }
  if (parts.review) {
    lines.push(`Review verdict: ${parts.review.verdict}; recommendation: ${parts.review.kingRecommendation}.`);
  }
  return lines.join(" ") || "No activity recorded yet.";
}
