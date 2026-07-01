import type { AutomationJobStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { extractAgentDisplayProfile } from "./agentDisplayProfileService.js";

// ── Status taxonomy ────────────────────────────────────────────────────────────

export type LivingAgentStatusCode =
  | "IDLE"
  | "THINKING"
  | "PLANNING"
  | "WORKING"
  | "WAITING_FOR_KING"
  | "WAITING_FOR_EXTERNAL_AGENT"
  | "VALIDATING"
  | "REVIEWING"
  | "LEARNING"
  | "BLOCKED"
  | "OFFLINE";

export type LivingAgentConfidence = "HIGH" | "MEDIUM" | "LOW";

export type LivingAgentStateDto = {
  agentId: string;
  agentName: string;
  role: string;
  status: LivingAgentStatusCode;
  statusLabel: string;
  summary: string;
  evidenceType: string | null;
  evidenceId: string | null;
  evidenceLink: string | null;
  projectId: string | null;
  workOrderId: string | null;
  workflowRunId: string | null;
  currentAction: string | null;
  recommendedKingAction: string | null;
  updatedAt: string;
  confidence: LivingAgentConfidence;
  staleReason: string | null;
};

// ── Signal types (pure, DB-free, exported for tests) ──────────────────────────

export type JobSignal = {
  id: string;
  status: string;
  mode: string;
  workOrderId: string;
  workOrderTitle: string | null;
  projectId: string | null;
  updatedAt: Date;
};

export type WorkOrderSignal = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  hasActiveExternalRun: boolean;
  activeExternalRunId: string | null;
  activeWorkflowRunId: string | null;
  activeWorkflowRunStep: string | null;
};

export type ActivitySignal = {
  status: string;
  title: string;
  heartbeatAt: Date;
  traceId: string | null;
};

export type CandidateSignal = {
  id: string;
  projectId: string | null;
};

export type AgentStatusDerivation = {
  status: LivingAgentStatusCode;
  statusLabel: string;
  summary: string;
  evidenceType: string | null;
  evidenceId: string | null;
  evidenceLink: string | null;
  projectId: string | null;
  workOrderId: string | null;
  workflowRunId: string | null;
  currentAction: string | null;
  recommendedKingAction: string | null;
  confidence: LivingAgentConfidence;
  staleReason: string | null;
  updatedAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Keep in sync with kingdomPresenceService.ts — Phase B can share these via a constants module
const STALE_AFTER_MS = 2 * 60 * 1000;
const BLOCKED_WINDOW_MS = 4 * 60 * 60 * 1000; // failed job ≤4h ago counts as BLOCKED

const ACTIVE_JOB_STATUSES: AutomationJobStatus[] = ["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW", "FAILED"];

const THINKING_ACTIVITY_STATUSES = new Set([
  "QUEUED", "THINKING", "WAITING_PROVIDER", "RESPONDING", "GENERATING_REPORT",
]);
const LEARNING_ACTIVITY_STATUSES = new Set(["EXTRACTING_MEMORY", "SUMMARIZING"]);

const PLANNING_STEPS = new Set([
  "INTAKE_DECREE", "CHECK_CONTEXT", "RUN_COUNCIL", "CREATE_WORK_ORDER", "RESOLVE_AGENT",
]);

const STATUS_LABELS: Record<LivingAgentStatusCode, string> = {
  IDLE: "Idle",
  THINKING: "Thinking",
  PLANNING: "Planning",
  WORKING: "Working",
  WAITING_FOR_KING: "Waiting for King",
  WAITING_FOR_EXTERNAL_AGENT: "Waiting for External Agent",
  VALIDATING: "Validating",
  REVIEWING: "Under Review",
  LEARNING: "Learning",
  BLOCKED: "Blocked",
  OFFLINE: "Offline",
};

const RECOMMENDED_ACTIONS: Partial<Record<LivingAgentStatusCode, string>> = {
  WAITING_FOR_KING: "Review and take action",
  REVIEWING: "Accept or reject the patch",
  BLOCKED: "Investigate failure and retry",
  OFFLINE: "Reactivate agent if needed",
  WAITING_FOR_EXTERNAL_AGENT: "Monitor or retry external agent",
};

// ── Pure derivation (exported for unit tests) ─────────────────────────────────

export function deriveAgentStatus(
  isActive: boolean,
  now: number,
  job: JobSignal | null,
  workOrder: WorkOrderSignal | null,
  activity: ActivitySignal | null,
  candidate: CandidateSignal | null,
): AgentStatusDerivation {
  const make = (
    status: LivingAgentStatusCode,
    opts: Partial<Omit<AgentStatusDerivation, "status" | "statusLabel">> = {},
  ): AgentStatusDerivation => ({
    status,
    statusLabel: STATUS_LABELS[status],
    summary: opts.summary ?? STATUS_LABELS[status],
    evidenceType: opts.evidenceType ?? null,
    evidenceId: opts.evidenceId ?? null,
    evidenceLink: opts.evidenceLink ?? null,
    projectId: opts.projectId ?? null,
    workOrderId: opts.workOrderId ?? null,
    workflowRunId: opts.workflowRunId ?? null,
    currentAction: opts.currentAction ?? null,
    recommendedKingAction: opts.recommendedKingAction ?? RECOMMENDED_ACTIONS[status] ?? null,
    confidence: opts.confidence ?? "MEDIUM",
    staleReason: opts.staleReason ?? null,
    updatedAt: opts.updatedAt ?? new Date(now).toISOString(),
  });

  // 1 — OFFLINE: agent deactivated in registry
  if (!isActive) {
    return make("OFFLINE", {
      summary: "Agent is deactivated and will not receive work.",
      confidence: "HIGH",
    });
  }

  // 2 — BLOCKED: failed job within the staleness window
  if (job?.status === "FAILED" && now - job.updatedAt.getTime() < BLOCKED_WINDOW_MS) {
    return make("BLOCKED", {
      summary: `Automation job failed${job.workOrderTitle ? ` on "${job.workOrderTitle}"` : ""}.`,
      evidenceType: "AutomationJob",
      evidenceId: job.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(job.workOrderId)}`,
      projectId: job.projectId,
      workOrderId: job.workOrderId,
      confidence: "HIGH",
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // 3 — WORKING: SANDBOX_PATCH job running
  if ((job?.status === "RUNNING" || job?.status === "CLAIMED") && job.mode === "SANDBOX_PATCH") {
    return make("WORKING", {
      summary: `Applying patch${job.workOrderTitle ? ` for "${job.workOrderTitle}"` : ""}.`,
      evidenceType: "AutomationJob",
      evidenceId: job.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(job.workOrderId)}`,
      projectId: job.projectId,
      workOrderId: job.workOrderId,
      confidence: "HIGH",
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // 4 — VALIDATING: VALIDATION_ONLY job running
  if (
    (job?.status === "RUNNING" || job?.status === "CLAIMED") &&
    (job.mode === "VALIDATION_ONLY" || job.mode === "OBSERVE")
  ) {
    return make("VALIDATING", {
      summary: `Running validation${job.workOrderTitle ? ` for "${job.workOrderTitle}"` : ""}.`,
      evidenceType: "AutomationJob",
      evidenceId: job.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(job.workOrderId)}`,
      projectId: job.projectId,
      workOrderId: job.workOrderId,
      confidence: "HIGH",
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // 5 — WAITING_FOR_EXTERNAL_AGENT: work order has an active external agent run
  if (workOrder?.hasActiveExternalRun) {
    return make("WAITING_FOR_EXTERNAL_AGENT", {
      summary: `Waiting for external agent on "${workOrder.title}".`,
      evidenceType: "WorkOrder",
      evidenceId: workOrder.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(workOrder.id)}`,
      projectId: workOrder.projectId,
      workOrderId: workOrder.id,
      confidence: "HIGH",
    });
  }

  // 6 — REVIEWING: job is NEEDS_REVIEW (runner finished; King must accept/reject)
  if (job?.status === "NEEDS_REVIEW") {
    return make("REVIEWING", {
      summary: `Patch ready for review${job.workOrderTitle ? ` on "${job.workOrderTitle}"` : ""}.`,
      evidenceType: "AutomationJob",
      evidenceId: job.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(job.workOrderId)}`,
      projectId: job.projectId,
      workOrderId: job.workOrderId,
      confidence: "HIGH",
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // 7 — THINKING: active council AgentActivity
  if (activity && THINKING_ACTIVITY_STATUSES.has(activity.status)) {
    const isStale = now - activity.heartbeatAt.getTime() > STALE_AFTER_MS;
    if (!isStale) {
      return make("THINKING", {
        summary: activity.title,
        evidenceType: "AgentActivity",
        evidenceId: null,
        evidenceLink: activity.traceId ? `/usage-traces/${activity.traceId}` : null,
        confidence: "HIGH",
        currentAction: activity.title,
        updatedAt: activity.heartbeatAt.toISOString(),
      });
    }
    return make("IDLE", {
      staleReason: `Last council activity (${activity.status}) has not reported since ${activity.heartbeatAt.toISOString()}.`,
      confidence: "LOW",
      updatedAt: activity.heartbeatAt.toISOString(),
    });
  }

  // 8 — LEARNING: active memory-extraction AgentActivity
  if (activity && LEARNING_ACTIVITY_STATUSES.has(activity.status)) {
    const isStale = now - activity.heartbeatAt.getTime() > STALE_AFTER_MS;
    if (!isStale) {
      return make("LEARNING", {
        summary: activity.title,
        evidenceType: "AgentActivity",
        evidenceId: null,
        evidenceLink: activity.traceId ? `/usage-traces/${activity.traceId}` : null,
        confidence: "HIGH",
        currentAction: activity.title,
        updatedAt: activity.heartbeatAt.toISOString(),
      });
    }
  }

  // 9 — PLANNING: active WorkflowRun at a planning step
  if (workOrder?.activeWorkflowRunStep && PLANNING_STEPS.has(workOrder.activeWorkflowRunStep)) {
    return make("PLANNING", {
      summary: `Planning work on "${workOrder.title}" (step: ${workOrder.activeWorkflowRunStep}).`,
      evidenceType: "WorkOrder",
      evidenceId: workOrder.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(workOrder.id)}`,
      projectId: workOrder.projectId,
      workOrderId: workOrder.id,
      workflowRunId: workOrder.activeWorkflowRunId,
      confidence: "MEDIUM",
    });
  }

  // 10 — WAITING_FOR_KING: work order NEEDS_REVIEW or pending knowledge candidate
  if (workOrder?.status === "NEEDS_REVIEW") {
    return make("WAITING_FOR_KING", {
      summary: `Work order "${workOrder.title}" is awaiting King decision.`,
      evidenceType: "WorkOrder",
      evidenceId: workOrder.id,
      evidenceLink: `/work-orders?focus=${encodeURIComponent(workOrder.id)}`,
      projectId: workOrder.projectId,
      workOrderId: workOrder.id,
      confidence: "HIGH",
    });
  }
  if (candidate) {
    return make("WAITING_FOR_KING", {
      summary: "A knowledge candidate is pending King approval.",
      evidenceType: "AgentKnowledgeCandidate",
      evidenceId: candidate.id,
      evidenceLink: "/knowledge-lab/candidates",
      projectId: candidate.projectId,
      confidence: "MEDIUM",
    });
  }

  // 11 — IDLE: no active evidence
  return make("IDLE", {
    summary: "No active assignments or open items.",
    confidence: "HIGH",
  });
}

// ── DB query helpers ───────────────────────────────────────────────────────────

type RawJob = {
  id: string;
  agentId: string | null;
  status: string;
  mode: string;
  workOrderId: string;
  projectId: string | null;
  updatedAt: Date;
  workOrder: { title: string } | null;
};

type RawWorkOrder = {
  id: string;
  title: string;
  status: string;
  assignedAgentId: string | null;
  projectId: string | null;
  externalAgentRuns: { id: string; status: string }[];
  workflowRuns: { id: string; currentStep: string }[];
};

type RawActivity = {
  agentId: string;
  status: string;
  title: string;
  heartbeatAt: Date;
  traceId: string | null;
};

type RawCandidate = {
  id: string;
  agentId: string;
  projectId: string | null;
};

function toJobSignal(job: RawJob): JobSignal {
  return {
    id: job.id,
    status: job.status,
    mode: job.mode,
    workOrderId: job.workOrderId,
    workOrderTitle: job.workOrder?.title ?? null,
    projectId: job.projectId,
    updatedAt: job.updatedAt,
  };
}

function toWorkOrderSignal(wo: RawWorkOrder): WorkOrderSignal {
  const activeRun = wo.externalAgentRuns[0] ?? null;
  const activeWorkflow = wo.workflowRuns[0] ?? null;
  return {
    id: wo.id,
    title: wo.title,
    status: wo.status,
    projectId: wo.projectId,
    hasActiveExternalRun: !!activeRun,
    activeExternalRunId: activeRun?.id ?? null,
    activeWorkflowRunId: activeWorkflow?.id ?? null,
    activeWorkflowRunStep: activeWorkflow?.currentStep ?? null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function deriveLivingAgentStates(options: {
  agentId?: string;
  projectId?: string;
  includeInactive?: boolean;
} = {}): Promise<LivingAgentStateDto[]> {
  const { agentId, projectId, includeInactive = false } = options;
  const now = Date.now();

  const agentWhere: Record<string, unknown> = {};
  if (agentId) agentWhere.id = agentId;
  if (!includeInactive) agentWhere.isActive = true;

  const agents = await prisma.agent.findMany({
    where: agentWhere,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    select: { id: true, name: true, role: true, isActive: true, config: true },
  });

  if (!agents.length) return [];
  const agentIds = agents.map((a) => a.id);

  const projectFilter = projectId ? { projectId } : {};

  const [rawJobs, rawWorkOrders, rawActivities, rawCandidates] = await Promise.all([
    // Active / recent jobs linked to an internal agent
    prisma.automationJob.findMany({
      where: {
        agentId: { in: agentIds },
        status: { in: ACTIVE_JOB_STATUSES },
        ...projectFilter,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        agentId: true,
        status: true,
        mode: true,
        workOrderId: true,
        projectId: true,
        updatedAt: true,
        workOrder: { select: { title: true } },
      },
    }) as unknown as Promise<RawJob[]>,

    // WorkOrders assigned to these agents in active states
    prisma.workOrder.findMany({
      where: {
        assignedAgentId: { in: agentIds },
        status: { in: ["READY", "IN_PROGRESS", "NEEDS_REVIEW"] },
        ...(projectId ? { projectId } : {}),
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        assignedAgentId: true,
        projectId: true,
        externalAgentRuns: {
          where: { status: { in: ["QUEUED", "RUNNING", "WAITING"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true },
        },
        workflowRuns: {
          where: { status: "RUNNING" },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { id: true, currentStep: true },
        },
      },
    }) as unknown as Promise<RawWorkOrder[]>,

    // Active AgentActivities (not ended)
    prisma.agentActivity.findMany({
      where: {
        agentId: { in: agentIds },
        endedAt: null,
        status: { in: [...THINKING_ACTIVITY_STATUSES, ...LEARNING_ACTIVITY_STATUSES] },
        ...projectFilter,
      },
      orderBy: { heartbeatAt: "desc" },
      select: {
        agentId: true,
        status: true,
        title: true,
        heartbeatAt: true,
        traceId: true,
      },
    }) as unknown as Promise<RawActivity[]>,

    // Pending knowledge candidates for these agents
    prisma.agentKnowledgeCandidate.findMany({
      where: {
        agentId: { in: agentIds },
        status: "PENDING",
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, agentId: true, projectId: true },
    }) as unknown as Promise<RawCandidate[]>,
  ]);

  // Index by agentId (first entry = highest priority / most recent)
  const jobByAgent = new Map<string, RawJob>();
  for (const job of rawJobs) {
    if (job.agentId && !jobByAgent.has(job.agentId)) jobByAgent.set(job.agentId, job);
  }

  const workOrderByAgent = new Map<string, RawWorkOrder>();
  for (const wo of rawWorkOrders) {
    if (wo.assignedAgentId && !workOrderByAgent.has(wo.assignedAgentId))
      workOrderByAgent.set(wo.assignedAgentId, wo);
  }

  const activityByAgent = new Map<string, RawActivity>();
  for (const act of rawActivities) {
    if (!activityByAgent.has(act.agentId)) activityByAgent.set(act.agentId, act);
  }

  const candidateByAgent = new Map<string, RawCandidate>();
  for (const c of rawCandidates) {
    if (!candidateByAgent.has(c.agentId)) candidateByAgent.set(c.agentId, c);
  }

  return agents.map((agent): LivingAgentStateDto => {
    const rawJob = jobByAgent.get(agent.id) ?? null;
    const rawWo = workOrderByAgent.get(agent.id) ?? null;
    const rawAct = activityByAgent.get(agent.id) ?? null;
    const rawCand = candidateByAgent.get(agent.id) ?? null;

    const derivation = deriveAgentStatus(
      agent.isActive,
      now,
      rawJob ? toJobSignal(rawJob) : null,
      rawWo ? toWorkOrderSignal(rawWo) : null,
      rawAct
        ? { status: rawAct.status, title: rawAct.title, heartbeatAt: rawAct.heartbeatAt, traceId: rawAct.traceId }
        : null,
      rawCand ? { id: rawCand.id, projectId: rawCand.projectId } : null,
    );

    const displayProfile = extractAgentDisplayProfile(agent.config);

    return {
      agentId: agent.id,
      agentName: displayProfile.displayName ?? displayProfile.canonicalName ?? agent.name,
      role: agent.role,
      ...derivation,
    };
  });
}

export async function deriveSingleAgentState(agentId: string): Promise<LivingAgentStateDto | null> {
  const results = await deriveLivingAgentStates({ agentId, includeInactive: true });
  return results[0] ?? null;
}
