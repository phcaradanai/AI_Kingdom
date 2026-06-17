import { prisma } from "../db/prisma.js";

export type KingdomActivityType =
  | "COUNCIL"
  | "WORK_ORDER"
  | "AUTOMATION_JOB"
  | "RUNNER_EVENT"
  | "REVIEW"
  | "KNOWLEDGE";

export type KingdomActivityItemDto = {
  id: string;
  timestamp: string;
  actor: string;
  type: KingdomActivityType;
  summary: string;
  sourceReference: {
    entityType: string;
    entityId: string;
    routeTo: string;
  };
};

export type KingdomActivityStreamDto = {
  computedAt: string;
  activities: KingdomActivityItemDto[];
};

const ACTIVITY_WINDOW_HOURS = 48;
const SHORT_WINDOW_HOURS = 4;
const MAX_ACTIVITIES = 50;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

export async function getKingdomActivity(limit = MAX_ACTIVITIES): Promise<KingdomActivityStreamDto> {
  const computedAt = new Date().toISOString();
  const since48h = hoursAgo(ACTIVITY_WINDOW_HOURS);
  const since4h = hoursAgo(SHORT_WINDOW_HOURS);

  const [sessions, workOrders, jobs, runnerSteps, reviews, knowledgeCandidates] = await Promise.all([
    // Council sessions in last 48h
    prisma.councilSession.findMany({
      where: { createdAt: { gte: since48h } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        createdAt: true,
        task: { select: { title: true } },
        project: { select: { name: true } },
        responses: {
          take: 3,
          select: { agent: { select: { name: true } } }
        }
      }
    }),
    // Work order status changes in last 48h
    prisma.workOrder.findMany({
      where: {
        updatedAt: { gte: since48h },
        isTestData: false,
        status: { in: ["IN_PROGRESS", "NEEDS_REVIEW", "COMPLETED", "FAILED"] }
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        assignedAgent: { select: { name: true } },
        assignedExternalAgent: { select: { name: true } }
      }
    }),
    // Automation jobs in last 48h
    prisma.automationJob.findMany({
      where: { updatedAt: { gte: since48h } },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        mode: true,
        updatedAt: true,
        agent: { select: { name: true } },
        runner: { select: { name: true } },
        workOrder: { select: { title: true, isTestData: true } }
      }
    }),
    // Runner steps in last 4h
    prisma.agentRunStep.findMany({
      where: {
        createdAt: { gte: since4h },
        status: { in: ["COMPLETED", "FAILED"] }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        job: {
          select: {
            id: true,
            runner: { select: { name: true } },
            workOrder: { select: { id: true, title: true, isTestData: true } }
          }
        }
      }
    }),
    // Agent reviews in last 48h
    prisma.agentReviewSummary.findMany({
      where: { createdAt: { gte: since48h } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        verdict: true,
        kingRecommendation: true,
        createdAt: true,
        reviewerAgent: { select: { name: true } },
        workOrder: { select: { id: true, title: true } }
      }
    }),
    // Knowledge candidates generated in last 48h
    prisma.agentKnowledgeCandidate.findMany({
      where: { createdAt: { gte: since48h }, status: { not: "REJECTED" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        agentId: true
      }
    })
  ]);

  const activities: KingdomActivityItemDto[] = [];

  // Council sessions
  for (const session of sessions) {
    const actors = [...new Set(session.responses.map(r => r.agent.name))];
    const actor = actors.length > 0 ? actors.join(", ") : "Council";
    const project = session.project ? ` [${session.project.name}]` : "";
    const taskTitle = session.task?.title ?? "Unknown task";
    activities.push({
      id: `council:${session.id}`,
      timestamp: session.createdAt.toISOString(),
      actor,
      type: "COUNCIL",
      summary: `Council session ${session.status.toLowerCase()} for: ${taskTitle}${project}`,
      sourceReference: { entityType: "CouncilSession", entityId: session.id, routeTo: "/council" }
    });
  }

  // Work order status changes
  for (const wo of workOrders) {
    const actor = wo.assignedAgent?.name ?? wo.assignedExternalAgent?.name ?? "System";
    const statusLabel: Record<string, string> = {
      IN_PROGRESS: "started",
      NEEDS_REVIEW: "flagged for review",
      COMPLETED: "completed",
      FAILED: "failed"
    };
    activities.push({
      id: `workorder:${wo.id}`,
      timestamp: wo.updatedAt.toISOString(),
      actor,
      type: "WORK_ORDER",
      summary: `Work order ${statusLabel[wo.status] ?? wo.status.toLowerCase()}: ${wo.title}`,
      sourceReference: { entityType: "WorkOrder", entityId: wo.id, routeTo: "/work-orders" }
    });
  }

  // Automation jobs
  for (const job of jobs) {
    if (job.workOrder?.isTestData) continue;
    const actor = job.agent?.name ?? job.runner?.name ?? "Runner";
    const modeLabel = job.mode === "SANDBOX_PATCH" ? "patch" : job.mode.toLowerCase().replace("_", " ");
    const statusLabel: Record<string, string> = {
      QUEUED: "queued",
      APPROVED: "approved",
      CLAIMED: "claimed",
      RUNNING: "running",
      NEEDS_REVIEW: "completed — needs review",
      COMPLETED: "completed",
      FAILED: "failed",
      CANCELLED: "cancelled"
    };
    activities.push({
      id: `job:${job.id}`,
      timestamp: job.updatedAt.toISOString(),
      actor,
      type: "AUTOMATION_JOB",
      summary: `${modeLabel} job ${statusLabel[job.status] ?? job.status.toLowerCase()}: ${job.workOrder?.title ?? "Unknown"}`,
      sourceReference: { entityType: "AutomationJob", entityId: job.id, routeTo: "/automation-jobs" }
    });
  }

  // Runner steps
  for (const step of runnerSteps) {
    if (step.job.workOrder?.isTestData) continue;
    const actor = step.job.runner?.name ?? "Runner";
    activities.push({
      id: `step:${step.id}`,
      timestamp: step.createdAt.toISOString(),
      actor,
      type: "RUNNER_EVENT",
      summary: `${step.title} — ${step.status.toLowerCase()} (${step.job.workOrder?.title ?? "Unknown"})`,
      sourceReference: { entityType: "AutomationJob", entityId: step.job.id, routeTo: "/automation-jobs" }
    });
  }

  // Reviews
  for (const review of reviews) {
    const actor = review.reviewerAgent?.name ?? "Reviewer";
    activities.push({
      id: `review:${review.id}`,
      timestamp: review.createdAt.toISOString(),
      actor,
      type: "REVIEW",
      summary: `Review ${review.verdict.toLowerCase()}: ${review.workOrder?.title ?? "Unknown"} — recommend ${review.kingRecommendation.toLowerCase()}`,
      sourceReference: { entityType: "AgentReviewSummary", entityId: review.id, routeTo: "/automation-jobs" }
    });
  }

  // Knowledge candidates
  for (const candidate of knowledgeCandidates) {
    activities.push({
      id: `knowledge:${candidate.id}`,
      timestamp: candidate.createdAt.toISOString(),
      actor: "Knowledge Agent",
      type: "KNOWLEDGE",
      summary: `Knowledge candidate generated: ${candidate.title} [${candidate.category}] — ${candidate.status.toLowerCase()}`,
      sourceReference: { entityType: "AgentKnowledgeCandidate", entityId: candidate.id, routeTo: "/knowledge-lab/candidates" }
    });
  }

  // Sort by timestamp descending, deduplicate by id, slice
  const seen = new Set<string>();
  const unique: KingdomActivityItemDto[] = [];
  for (const a of activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      unique.push(a);
    }
  }

  return { computedAt, activities: unique.slice(0, limit) };
}
