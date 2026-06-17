import { prisma } from "../db/prisma.js";

export type HealthStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export type KingdomHealthItemDto = {
  key: string;
  label: string;
  status: HealthStatus;
  reason: string;
  recommendedAction: string | null;
  sourceReference: string | null;
};

export type KingdomHealthDto = {
  computedAt: string;
  overallStatus: HealthStatus;
  items: KingdomHealthItemDto[];
};

function worstStatus(...statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("CRITICAL")) return "CRITICAL";
  if (statuses.includes("WARNING")) return "WARNING";
  return "HEALTHY";
}

export async function getKingdomHealth(): Promise<KingdomHealthDto> {
  const computedAt = new Date().toISOString();

  const [
    staleContextCount,
    needsReviewJobCount,
    queuedJobCount,
    runners,
    activeProviders,
    externalAgentBacklog,
    pendingKnowledgeCount
  ] = await Promise.all([
    // Context health: work orders with stale/missing/partial context that are actionable
    prisma.workOrder.count({
      where: {
        isTestData: false,
        contextBindingStatus: { in: ["STALE", "MISSING", "PARTIAL"] },
        status: { in: ["READY", "IN_PROGRESS"] }
      }
    }),
    // Review queue: jobs awaiting King review
    prisma.automationJob.count({ where: { status: "NEEDS_REVIEW" } }),
    // Runner queue: queued jobs waiting for a runner
    prisma.automationJob.count({ where: { status: "QUEUED" } }),
    // Runner status
    prisma.agentRunner.findMany({
      select: { id: true, status: true, lastHeartbeatAt: true }
    }),
    // Active providers
    prisma.aIProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    }),
    // External agent backlog: READY work orders with external agent but no recent work session
    prisma.workOrder.findMany({
      where: {
        isTestData: false,
        status: "READY",
        assignedExternalAgentId: { not: null }
      },
      select: {
        id: true,
        workSessions: { select: { id: true }, take: 1 }
      }
    }),
    // Pending knowledge candidates
    prisma.agentKnowledgeCandidate.count({ where: { status: "PENDING" } })
  ]);

  const items: KingdomHealthItemDto[] = [];

  // 1. Context Health
  {
    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;
    if (staleContextCount === 0) {
      status = "HEALTHY";
      reason = "All active work orders have fresh context bindings.";
    } else if (staleContextCount <= 3) {
      status = "WARNING";
      reason = `${staleContextCount} active work order(s) have stale or missing context.`;
      recommendedAction = "Refresh context via the Work Orders page before running automation jobs.";
    } else {
      status = "CRITICAL";
      reason = `${staleContextCount} active work orders have stale or missing context — automation may be blocked.`;
      recommendedAction = "Bulk-refresh context bindings or reassign affected work orders.";
    }
    items.push({ key: "context_health", label: "Context Health", status, reason, recommendedAction, sourceReference: "/work-orders" });
  }

  // 2. Review Queue
  {
    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;
    if (needsReviewJobCount === 0) {
      status = "HEALTHY";
      reason = "No automation jobs awaiting review.";
    } else if (needsReviewJobCount <= 2) {
      status = "WARNING";
      reason = `${needsReviewJobCount} automation job(s) are awaiting King review.`;
      recommendedAction = "Review and accept or reject pending automation jobs.";
    } else {
      status = "CRITICAL";
      reason = `${needsReviewJobCount} automation jobs are in NEEDS_REVIEW — review backlog building up.`;
      recommendedAction = "Clear the review queue to unblock automation pipeline.";
    }
    items.push({ key: "review_queue", label: "Review Queue", status, reason, recommendedAction, sourceReference: "/automation-jobs" });
  }

  // 3. Runner Queue Status
  {
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    const onlineRunners = runners.filter(r => {
      if (r.status !== "ONLINE") return false;
      if (!r.lastHeartbeatAt) return false;
      return Date.now() - r.lastHeartbeatAt.getTime() < STALE_THRESHOLD_MS;
    });
    const offlineRunners = runners.filter(r => !onlineRunners.find(o => o.id === r.id));

    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;

    if (runners.length === 0) {
      status = "CRITICAL";
      reason = "No runners registered. Automation jobs cannot execute.";
      recommendedAction = "Run `npm run runner:bootstrap` and start the runner process.";
    } else if (onlineRunners.length === 0) {
      status = "CRITICAL";
      reason = `All ${runners.length} runner(s) are offline. Queued jobs are blocked.`;
      recommendedAction = "Restart the runner process. Check runner heartbeat.";
    } else if (offlineRunners.length > 0 || queuedJobCount > 5) {
      status = "WARNING";
      const parts: string[] = [];
      if (offlineRunners.length > 0) parts.push(`${offlineRunners.length} runner(s) offline`);
      if (queuedJobCount > 5) parts.push(`${queuedJobCount} jobs queued`);
      reason = parts.join("; ") + ".";
      recommendedAction = "Check runner health or clear the automation job queue.";
    } else {
      status = "HEALTHY";
      reason = `${onlineRunners.length} runner(s) online. ${queuedJobCount} job(s) queued.`;
    }
    items.push({ key: "runner_queue", label: "Runner Queue", status, reason, recommendedAction, sourceReference: "/automation-jobs" });
  }

  // 4. Provider Availability
  {
    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;

    if (activeProviders.length === 0) {
      status = "CRITICAL";
      reason = "No AI providers are active. All AI operations will fall back to mock.";
      recommendedAction = "Activate at least one provider in the Providers settings.";
    } else if (activeProviders.length === 1) {
      status = "WARNING";
      reason = `Only 1 provider active (${activeProviders[0]!.name}). No fallback available.`;
      recommendedAction = "Add a fallback provider to ensure availability.";
    } else {
      status = "HEALTHY";
      reason = `${activeProviders.length} provider(s) active.`;
    }
    items.push({ key: "provider_availability", label: "Provider Availability", status, reason, recommendedAction, sourceReference: "/providers" });
  }

  // 5. External Agent Backlog
  {
    const backlogCount = externalAgentBacklog.filter(wo => wo.workSessions.length === 0).length;
    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;

    if (backlogCount === 0) {
      status = "HEALTHY";
      reason = "All assigned work orders have active sessions.";
    } else if (backlogCount <= 3) {
      status = "WARNING";
      reason = `${backlogCount} work order(s) assigned to external agents but not yet started.`;
      recommendedAction = "Create handoff briefs and send to assigned agents.";
    } else {
      status = "CRITICAL";
      reason = `${backlogCount} work orders are stuck — assigned but no session started.`;
      recommendedAction = "Review and start or reassign stalled work orders.";
    }
    items.push({ key: "external_agent_backlog", label: "External Agent Backlog", status, reason, recommendedAction, sourceReference: "/work-orders" });
  }

  // 6. Knowledge Processing
  {
    let status: HealthStatus;
    let reason: string;
    let recommendedAction: string | null = null;

    if (pendingKnowledgeCount === 0) {
      status = "HEALTHY";
      reason = "No pending knowledge candidates.";
    } else if (pendingKnowledgeCount < 10) {
      status = "WARNING";
      reason = `${pendingKnowledgeCount} knowledge candidate(s) awaiting review.`;
      recommendedAction = "Review pending knowledge candidates in the Knowledge Lab.";
    } else {
      status = "CRITICAL";
      reason = `${pendingKnowledgeCount} knowledge candidates unreviewed — knowledge backlog growing.`;
      recommendedAction = "Batch-review or auto-approve high-confidence candidates.";
    }
    items.push({ key: "knowledge_processing", label: "Knowledge Processing", status, reason, recommendedAction, sourceReference: "/knowledge-lab/candidates" });
  }

  const overallStatus = worstStatus(...items.map(i => i.status));
  return { computedAt, overallStatus, items };
}
