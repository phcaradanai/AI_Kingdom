import { prisma } from "../db/prisma.js";

export type AgentPresenceState =
  | "IDLE"
  | "THINKING"
  | "COUNCIL"
  | "WORKING"
  | "RUNNING"
  | "WAITING_REVIEW"
  | "BLOCKED"
  | "ERROR";

export type AgentPresenceDto = {
  id: string;
  name: string;
  role: string;
  displayName: string | null;
  state: AgentPresenceState;
  currentTask: string | null;
  currentWorkOrder: { id: string; title: string } | null;
  progress: string | null;
  blockingReason: string | null;
  lastActivityAt: string | null;
};

export type KingdomPresenceDto = {
  computedAt: string;
  agents: AgentPresenceDto[];
};

const ACTIVE_ACTIVITY_STATUSES = new Set([
  "QUEUED", "THINKING", "WAITING_PROVIDER",
  "RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"
]);

const THINKING_STATUSES = new Set(["QUEUED", "THINKING", "WAITING_PROVIDER"]);
const WORKING_STATUSES = new Set(["RESPONDING", "SUMMARIZING", "EXTRACTING_MEMORY", "GENERATING_REPORT"]);

// Stale window: an activity that ended > 15 min ago is no longer ERROR
const ERROR_WINDOW_MS = 15 * 60 * 1000;

function extractDisplayName(config: unknown): string | null {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
  const dp = raw.displayProfile && typeof raw.displayProfile === "object" && !Array.isArray(raw.displayProfile)
    ? (raw.displayProfile as Record<string, unknown>)
    : {};
  const v = dp.displayName;
  return typeof v === "string" && v ? v : null;
}

export async function getKingdomPresence(): Promise<KingdomPresenceDto> {
  const computedAt = new Date().toISOString();

  const [agents, recentActivities, activeJobs] = await Promise.all([
    prisma.agent.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
      select: { id: true, name: true, title: true, role: true, config: true }
    }),
    prisma.agentActivity.findMany({
      orderBy: [{ heartbeatAt: "desc" }, { startedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        agentId: true,
        status: true,
        title: true,
        detail: true,
        councilSessionId: true,
        taskId: true,
        startedAt: true,
        endedAt: true,
        heartbeatAt: true,
        errorMessage: true
      }
    }),
    prisma.automationJob.findMany({
      where: { status: { in: ["CLAIMED", "RUNNING", "NEEDS_REVIEW", "FAILED"] } },
      select: {
        id: true,
        agentId: true,
        status: true,
        workOrderId: true,
        workOrder: { select: { id: true, title: true } },
        steps: {
          orderBy: { sequence: "desc" },
          take: 1,
          select: { sequence: true, status: true }
        }
      }
    })
  ]);

  // Get total step counts for running jobs
  const runningJobIds = activeJobs
    .filter(j => j.status === "RUNNING" || j.status === "CLAIMED")
    .map(j => j.id);

  const stepCounts = runningJobIds.length > 0
    ? await prisma.agentRunStep.groupBy({
        by: ["jobId"],
        where: { jobId: { in: runningJobIds } },
        _count: { _all: true }
      })
    : [];

  const stepCountMap = new Map(stepCounts.map(s => [s.jobId, s._count._all]));

  // Index activities per agent (most recent first already)
  const activityByAgent = new Map<string, typeof recentActivities>();
  for (const act of recentActivities) {
    if (!activityByAgent.has(act.agentId)) activityByAgent.set(act.agentId, []);
    activityByAgent.get(act.agentId)!.push(act);
  }

  // Index jobs per agent
  const jobsByAgent = new Map<string, typeof activeJobs>();
  for (const job of activeJobs) {
    if (!job.agentId) continue;
    if (!jobsByAgent.has(job.agentId)) jobsByAgent.set(job.agentId, []);
    jobsByAgent.get(job.agentId)!.push(job);
  }

  const agentDtos: AgentPresenceDto[] = agents.map(agent => {
    const displayName = extractDisplayName(agent.config);
    const acts = activityByAgent.get(agent.id) ?? [];
    const jobs = jobsByAgent.get(agent.id) ?? [];

    // Active activity: not ended yet and in an active status
    const activeAct = acts.find(a => !a.endedAt && ACTIVE_ACTIVITY_STATUSES.has(a.status));
    // Latest activity of any kind
    const latestAct = acts[0] ?? null;

    // Derive state by precedence: ERROR > BLOCKED > RUNNING > WAITING_REVIEW > COUNCIL > WORKING > THINKING > IDLE
    let state: AgentPresenceState = "IDLE";
    let currentTask: string | null = null;
    let currentWorkOrder: { id: string; title: string } | null = null;
    let progress: string | null = null;
    let blockingReason: string | null = null;
    let lastActivityAt: string | null = null;

    // Last activity timestamp
    if (latestAct) {
      const ts = latestAct.endedAt ?? latestAct.heartbeatAt ?? latestAct.startedAt;
      lastActivityAt = ts ? ts.toISOString() : null;
    }

    // Check ERROR: most recent activity failed within ERROR_WINDOW_MS
    const freshFailedAct = acts.find(a => {
      if (a.status !== "FAILED") return false;
      const endedAt = a.endedAt;
      if (!endedAt) return false;
      return Date.now() - endedAt.getTime() < ERROR_WINDOW_MS;
    });
    if (freshFailedAct) {
      state = "ERROR";
      currentTask = freshFailedAct.title;
      blockingReason = freshFailedAct.errorMessage ?? "Activity failed";
      return { id: agent.id, name: agent.name, role: agent.role, displayName, state, currentTask, currentWorkOrder, progress, blockingReason, lastActivityAt };
    }

    // Check BLOCKED: a job for this agent failed
    const failedJob = jobs.find(j => j.status === "FAILED");
    if (failedJob) {
      state = "BLOCKED";
      currentWorkOrder = failedJob.workOrder ? { id: failedJob.workOrder.id, title: failedJob.workOrder.title } : null;
      blockingReason = "Automation job failed";
      return { id: agent.id, name: agent.name, role: agent.role, displayName, state, currentTask, currentWorkOrder, progress, blockingReason, lastActivityAt };
    }

    // Check RUNNING: job is CLAIMED or RUNNING
    const runningJob = jobs.find(j => j.status === "RUNNING" || j.status === "CLAIMED");
    if (runningJob) {
      state = "RUNNING";
      currentWorkOrder = runningJob.workOrder ? { id: runningJob.workOrder.id, title: runningJob.workOrder.title } : null;
      const lastStep = runningJob.steps[0];
      if (lastStep) {
        const totalSteps = stepCountMap.get(runningJob.id) ?? lastStep.sequence;
        progress = `step ${lastStep.sequence}/${totalSteps}`;
      }
      return { id: agent.id, name: agent.name, role: agent.role, displayName, state, currentTask, currentWorkOrder, progress, blockingReason, lastActivityAt };
    }

    // Check WAITING_REVIEW: job is in NEEDS_REVIEW
    const reviewJob = jobs.find(j => j.status === "NEEDS_REVIEW");
    if (reviewJob) {
      state = "WAITING_REVIEW";
      currentWorkOrder = reviewJob.workOrder ? { id: reviewJob.workOrder.id, title: reviewJob.workOrder.title } : null;
      return { id: agent.id, name: agent.name, role: agent.role, displayName, state, currentTask, currentWorkOrder, progress, blockingReason, lastActivityAt };
    }

    // Check activity-derived states
    if (activeAct) {
      currentTask = activeAct.title;
      if (WORKING_STATUSES.has(activeAct.status)) {
        state = activeAct.councilSessionId ? "COUNCIL" : "WORKING";
      } else if (THINKING_STATUSES.has(activeAct.status)) {
        state = "THINKING";
      }
    }

    return { id: agent.id, name: agent.name, role: agent.role, displayName, state, currentTask, currentWorkOrder, progress, blockingReason, lastActivityAt };
  });

  return { computedAt, agents: agentDtos };
}
