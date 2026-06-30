import { prisma } from "../db/prisma.js";
import type {
  MissionControlAgentActivityDto,
  MissionControlDisplayState,
  MissionControlDto,
  MissionControlJobDto,
  MissionControlLifecycleState,
  MissionControlReviewItemDto,
  MissionControlSeverity,
  MissionControlSourceReferenceDto,
  MissionControlTopActionDto,
  MissionControlWarningDto,
  MissionControlWorkOrderDto
} from "../types/api.js";
import { listMissionControlWorkflows, serializeWorkflowView } from "./decreeToDoneWorkflowService.js";
import { normalizeKingRecommendation } from "./runnerResultReviewService.js";

const MILESTONE_CODENAME = "KINGDOM_MISSION_CONTROL_FOUNDATION" as const;

const TOP_ACTION_PRIORITY: Record<MissionControlTopActionDto["priorityKey"], number> = {
  CRITICAL_BLOCKED_RUNNER_JOB: 1,
  FAILED_OR_REJECTED_REVIEW: 2,
  STALE_CONTEXT_BLOCKING_PATCH: 3,
  WORK_ORDER_NEEDS_REVIEW: 4,
  WORK_ORDER_READY_TO_DISPATCH: 5,
  PROVIDER_ROUTING_WARNING: 6,
  NO_URGENT_ACTION: 7
};

type TopActionCandidate = Omit<MissionControlTopActionDto, "priority"> & {
  observedAt: Date;
};

function toIso(date: Date | null | undefined): string {
  return (date ?? new Date(0)).toISOString();
}

function sourceReference(input: Omit<MissionControlSourceReferenceDto, "routeTo" | "sourceRoute"> & { routeTo?: string; sourceRoute?: string }): MissionControlSourceReferenceDto {
  const routeTo = input.routeTo ?? routeForSource(input.sourceType);
  return {
    routeTo,
    sourceRoute: input.sourceRoute ?? routeTo,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceTitle: input.sourceTitle ?? null,
    updatedAt: input.updatedAt ?? null,
    recommendedAction: input.recommendedAction ?? null,
    why: input.why ?? null,
    workOrderId: input.workOrderId ?? null,
    taskId: input.taskId ?? null,
    councilSessionId: input.councilSessionId ?? null,
    automationJobId: input.automationJobId ?? null,
    agentId: input.agentId ?? null,
    reviewSummaryId: input.reviewSummaryId ?? null
  };
}

function routeForSource(sourceType: string): string {
  if (sourceType === "AutomationJob" || sourceType === "AgentRunner" || sourceType === "AgentReviewSummary") return "/automation-jobs";
  if (sourceType === "Agent" || sourceType === "ProviderRouting") return "/agents";
  if (sourceType === "AIProvider" || sourceType === "AIRouteChain" || sourceType === "AIProviderRoute") return "/providers";
  if (sourceType === "CouncilSession" || sourceType === "Task") return "/throne-room?view=command";
  return "/work-orders";
}

function sortTopActionCandidates(candidates: TopActionCandidate[]): TopActionCandidate[] {
  return [...candidates].sort((a, b) => {
    const priorityDelta = TOP_ACTION_PRIORITY[a.priorityKey] - TOP_ACTION_PRIORITY[b.priorityKey];
    if (priorityDelta !== 0) return priorityDelta;
    return b.observedAt.getTime() - a.observedAt.getTime();
  });
}

function topActionFromCandidate(candidate: TopActionCandidate): MissionControlTopActionDto {
  const { observedAt: _observedAt, ...action } = candidate;
  return {
    ...action,
    priority: TOP_ACTION_PRIORITY[action.priorityKey]
  };
}

export function selectMissionControlTopAction(candidates: TopActionCandidate[], computedAt = new Date()): MissionControlTopActionDto {
  const sorted = sortTopActionCandidates(candidates);
  const selected = sorted[0];
  if (selected) {
    return topActionFromCandidate(selected);
  }

  return {
    id: "mission-control:no-urgent-action",
    priority: TOP_ACTION_PRIORITY.NO_URGENT_ACTION,
    priorityKey: "NO_URGENT_ACTION",
    severity: "INFO",
    title: "No urgent action",
    detail: "No blocked runners, review failures, stale context blockers, dispatch-ready work orders, or provider routing warnings were found.",
    nextAction: "Review the dashboard or issue a new royal decree when ready.",
    routeTo: "/dashboard",
    sourceReference: sourceReference({
      sourceType: "MissionControl",
      sourceId: null,
      sourceTitle: "Mission Control",
      routeTo: "/dashboard",
      updatedAt: computedAt.toISOString(),
      recommendedAction: "Review the dashboard or issue a new royal decree when ready.",
      why: "No urgent source-of-truth records currently need a King decision."
    })
  };
}

function workOrderLifecycle(status: string, hasHandoff: boolean, hasRunningJob: boolean, hasBlockedReason: boolean): MissionControlLifecycleState {
  if (hasBlockedReason) return "BLOCKED";
  if (status === "DRAFT") return "DRAFTED";
  if (status === "READY") return hasHandoff ? "DISPATCHED" : "DISPATCH_READY";
  if (status === "IN_PROGRESS") return hasRunningJob ? "RUNNING" : "DISPATCHED";
  if (status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (status === "COMPLETED") return "ACCEPTED";
  if (status === "FAILED") return "REJECTED";
  if (status === "ARCHIVED") return "LEARNED";
  return "BLOCKED";
}

function jobLifecycle(status: string): MissionControlLifecycleState {
  if (status === "QUEUED") return "DISPATCH_READY";
  if (status === "APPROVED") return "DISPATCHED";
  if (status === "CLAIMED" || status === "RUNNING") return "RUNNING";
  if (status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (status === "COMPLETED") return "ACCEPTED";
  if (status === "FAILED") return "REJECTED";
  return "BLOCKED";
}

function displayStateFromLifecycle(lifecycle: MissionControlLifecycleState): MissionControlDisplayState {
  if (lifecycle === "DRAFTED") return "Drafting";
  if (lifecycle === "APPROVED" || lifecycle === "DISPATCH_READY" || lifecycle === "DISPATCHED") return "Ready";
  if (lifecycle === "RUNNING") return "Running";
  if (lifecycle === "NEEDS_REVIEW") return "Waiting for Review";
  if (lifecycle === "ACCEPTED" || lifecycle === "LEARNED") return "Completed";
  if (lifecycle === "REJECTED") return "Failed";
  return "Blocked";
}

function activityDisplayState(status: string): MissionControlDisplayState {
  const normalized = status.toUpperCase();
  if (normalized.includes("RUN") || normalized.includes("START") || normalized.includes("CLAIM")) return "Running";
  if (normalized.includes("REVIEW")) return "Waiting for Review";
  if (normalized.includes("FAIL") || normalized.includes("ERROR")) return "Failed";
  if (normalized.includes("COMPLETE") || normalized.includes("SUCCESS")) return "Completed";
  if (normalized.includes("DRAFT") || normalized.includes("PLAN")) return "Drafting";
  if (normalized.includes("BLOCK")) return "Blocked";
  if (normalized.includes("PENDING") || normalized.includes("QUEUE")) return "Ready";
  return "Thinking";
}

function nextActionForWorkOrder(status: string, contextStatus: string | null, hasAgent: boolean, hasHandoff: boolean, hasBlockedReason: boolean): string {
  if (hasBlockedReason) return "Resolve the blocker recorded on the Work Order.";
  if ((status === "READY" || status === "IN_PROGRESS") && contextStatus && contextStatus !== "FRESH") {
    return "Refresh or bind project context before creating sandbox patch automation.";
  }
  if (status === "DRAFT") return "Review and approve this draft Work Order.";
  if (status === "READY" && !hasAgent) return "Assign an internal or external agent.";
  if (status === "READY" && !hasHandoff) return "Create or send the handoff brief.";
  if (status === "NEEDS_REVIEW") return "Review the result and accept, reject, or request revision.";
  if (status === "FAILED") return "Investigate the failure and decide whether to retry or cancel.";
  if (status === "IN_PROGRESS") return "Monitor job and agent progress.";
  return "Open the source record.";
}

function nextActionForJob(status: string): string {
  if (status === "QUEUED") return "Approve or wait for runner dispatch, depending on job policy.";
  if (status === "APPROVED") return "Confirm an online runner can claim this job.";
  if (status === "CLAIMED" || status === "RUNNING") return "Monitor runner progress.";
  if (status === "NEEDS_REVIEW") return "Review runner output and agent review summary.";
  if (status === "FAILED") return "Inspect logs, patch output, and decide whether to retry.";
  return "Open the automation job.";
}

function reviewSeverity(verdict: string, recommendation: string): MissionControlSeverity {
  if (["PATCH_FAILED", "VALIDATION_FAILED", "NEEDS_FIX"].includes(verdict) || ["REJECT", "RETRY_WITH_FIXED_PATCH"].includes(recommendation)) {
    return "CRITICAL";
  }
  if (["RISK_REVIEW", "UNKNOWN"].includes(verdict) || ["REQUEST_REVISION", "REVIEW_MANUALLY"].includes(recommendation)) {
    return "WARNING";
  }
  return "INFO";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelParametersWarning(modelParameters: unknown): string | null {
  if (!isPlainRecord(modelParameters)) return "Manual parameter mode requires a modelParameters object.";
  const numericKeys = ["temperature", "max_tokens", "top_p", "seed", "frequency_penalty", "presence_penalty", "repetition_penalty", "top_k", "min_p"];
  for (const key of numericKeys) {
    const value = modelParameters[key];
    if (value !== undefined && value !== null && typeof value !== "number") {
      return `modelParameters.${key} must be a number or null.`;
    }
  }
  const stop = modelParameters.stop;
  if (stop !== undefined && stop !== null && (!Array.isArray(stop) || stop.some((entry) => typeof entry !== "string"))) {
    return "modelParameters.stop must be an array of strings or null.";
  }
  const providerPreferences = modelParameters.openrouter_provider_preferences;
  if (providerPreferences !== undefined && providerPreferences !== null && (!Array.isArray(providerPreferences) || providerPreferences.some((entry) => typeof entry !== "string"))) {
    return "modelParameters.openrouter_provider_preferences must be an array of strings or null.";
  }
  return null;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

export async function getMissionControl(): Promise<MissionControlDto> {
  const computedAt = new Date();
  const [
    workOrders,
    automationJobs,
    reviewSummaries,
    agentActivities,
    runners,
    providers,
    agents,
    providerRoutes,
    routeChains,
    activeWorkflows
  ] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        isTestData: false,
        OR: [
          { status: { in: ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW", "FAILED"] } },
          { blockedReason: { not: null } },
          { contextBindingStatus: { in: ["STALE", "MISSING", "PARTIAL"] } }
        ]
      },
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        contextBindingStatus: true,
        blockedReason: true,
        updatedAt: true,
        sourceType: true,
        sourceId: true,
        assignedAgent: { select: { id: true, name: true, title: true } },
        assignedExternalAgent: { select: { id: true, name: true, roleTitle: true, type: true } },
        handoffBriefs: { select: { id: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        automationJobs: {
          select: { id: true, status: true, mode: true, updatedAt: true, reviewSummary: { select: { id: true } } },
          orderBy: { updatedAt: "desc" },
          take: 3
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 80
    }),
    prisma.automationJob.findMany({
      where: { status: { in: ["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW", "FAILED"] } },
      select: {
        id: true,
        workOrderId: true,
        status: true,
        mode: true,
        updatedAt: true,
        workOrder: { select: { id: true, title: true, isTestData: true } },
        runner: { select: { id: true, name: true, status: true } },
        agent: { select: { id: true, name: true, title: true } },
        reviewSummary: { select: { id: true } }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 80
    }),
    prisma.agentReviewSummary.findMany({
      where: {
        OR: [
          { automationJob: { status: "NEEDS_REVIEW" } },
          { verdict: { in: ["NEEDS_FIX", "PATCH_FAILED", "RISK_REVIEW", "VALIDATION_FAILED", "UNKNOWN"] } },
          { kingRecommendation: { in: ["REJECT", "REQUEST_REVISION", "RETRY_WITH_FIXED_PATCH", "REVIEW_MANUALLY"] } }
        ]
      },
      select: {
        id: true,
        automationJobId: true,
        workOrderId: true,
        verdict: true,
        kingRecommendation: true,
        summary: true,
        updatedAt: true,
        workOrder: { select: { id: true, title: true, isTestData: true } }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 50
    }),
    prisma.agentActivity.findMany({
      select: {
        id: true,
        agentId: true,
        status: true,
        activityType: true,
        title: true,
        detail: true,
        sourceType: true,
        sourceId: true,
        taskId: true,
        councilSessionId: true,
        endedAt: true,
        heartbeatAt: true,
        updatedAt: true,
        agent: { select: { id: true, name: true, title: true, role: true } }
      },
      orderBy: [{ heartbeatAt: "desc" }],
      take: 12
    }),
    prisma.agentRunner.findMany({
      select: { id: true, name: true, status: true, lastHeartbeatAt: true, updatedAt: true }
    }),
    prisma.aIProvider.findMany({
      select: { id: true, name: true, isActive: true, defaultModel: true, modelValidationStatus: true, updatedAt: true }
    }),
    prisma.agent.findMany({
      where: { isActive: true, isTestData: false },
      select: {
        id: true,
        name: true,
        title: true,
        parameterMode: true,
        modelParameters: true,
        preferredProviderId: true,
        fallbackProviderIds: true,
        fallbackModels: true,
        updatedAt: true
      }
    }),
    prisma.aIProviderRoute.findMany({
      where: { isActive: true },
      select: { id: true, name: true, preferredProviderId: true, fallbackProviderIds: true, updatedAt: true }
    }),
    prisma.aIRouteChain.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        entries: { select: { id: true, providerId: true, model: true, sequence: true, isEnabled: true }, orderBy: { sequence: "asc" } }
      }
    }),
    listMissionControlWorkflows()
  ]);

  const onlineRunnerIds = new Set(
    runners
      .filter((runner) => runner.status === "ONLINE" && runner.lastHeartbeatAt && computedAt.getTime() - runner.lastHeartbeatAt.getTime() < 60 * 60 * 1000)
      .map((runner) => runner.id)
  );
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  const missionWorkOrders: MissionControlWorkOrderDto[] = workOrders
    .slice(0, 30)
    .map((workOrder) => {
      const latestJob = workOrder.automationJobs[0] ?? null;
      const hasRunningJob = Boolean(latestJob && ["CLAIMED", "RUNNING"].includes(latestJob.status));
      const lifecycleState = workOrderLifecycle(workOrder.status, workOrder.handoffBriefs.length > 0, hasRunningJob, Boolean(workOrder.blockedReason));
      return {
        id: workOrder.id,
        title: workOrder.title,
        priority: workOrder.priority,
        status: workOrder.status,
        lifecycleState,
        displayState: displayStateFromLifecycle(lifecycleState),
        assignedAgent: workOrder.assignedAgent,
        assignedExternalAgent: workOrder.assignedExternalAgent ? { ...workOrder.assignedExternalAgent, type: String(workOrder.assignedExternalAgent.type) } : null,
        relatedAutomationJobId: latestJob?.id ?? null,
        relatedReviewSummaryId: latestJob?.reviewSummary?.id ?? null,
        blockedReason: workOrder.blockedReason,
        contextBindingStatus: workOrder.contextBindingStatus,
        lastUpdated: workOrder.updatedAt.toISOString(),
        nextAction: nextActionForWorkOrder(workOrder.status, workOrder.contextBindingStatus, Boolean(workOrder.assignedAgent || workOrder.assignedExternalAgent), workOrder.handoffBriefs.length > 0, Boolean(workOrder.blockedReason)),
        sourceReference: sourceReference({
          sourceType: "WorkOrder",
          sourceId: workOrder.id,
          sourceTitle: workOrder.title,
          workOrderId: workOrder.id,
          updatedAt: workOrder.updatedAt.toISOString(),
          recommendedAction: nextActionForWorkOrder(workOrder.status, workOrder.contextBindingStatus, Boolean(workOrder.assignedAgent || workOrder.assignedExternalAgent), workOrder.handoffBriefs.length > 0, Boolean(workOrder.blockedReason)),
          why: workOrder.blockedReason ?? `Work Order is ${workOrder.status}${workOrder.contextBindingStatus ? ` with context ${workOrder.contextBindingStatus}` : ""}.`
        })
      };
    });

  const activeWorkOrders = missionWorkOrders.filter((workOrder) => ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW"].includes(workOrder.status));

  const blockedWorkOrders = missionWorkOrders.filter((workOrder) =>
    workOrder.blockedReason ||
    workOrder.status === "FAILED" ||
    workOrder.lifecycleState === "BLOCKED" ||
    (["READY", "IN_PROGRESS"].includes(workOrder.status) && workOrder.contextBindingStatus !== "FRESH")
  );

  const runningJobs: MissionControlJobDto[] = automationJobs
    .filter((job) => !job.workOrder.isTestData)
    .slice(0, 30)
    .map((job) => {
      const lifecycleState = jobLifecycle(job.status);
      return {
        id: job.id,
        workOrderId: job.workOrderId,
        title: job.workOrder.title,
        mode: job.mode,
        status: job.status,
        lifecycleState,
        displayState: displayStateFromLifecycle(lifecycleState),
        runner: job.runner,
        agent: job.agent,
        reviewSummaryId: job.reviewSummary?.id ?? null,
        lastUpdated: job.updatedAt.toISOString(),
        nextAction: nextActionForJob(job.status),
        sourceReference: sourceReference({
          sourceType: "AutomationJob",
          sourceId: job.id,
          sourceTitle: job.workOrder.title,
          automationJobId: job.id,
          workOrderId: job.workOrderId,
          updatedAt: job.updatedAt.toISOString(),
          recommendedAction: nextActionForJob(job.status),
          why: `Automation job is ${job.status} for Work Order "${job.workOrder.title}".`
        })
      };
    });

  const needsReviewItems: MissionControlReviewItemDto[] = reviewSummaries
    .filter((review) => !review.workOrder.isTestData)
    .map((review) => {
      const rec = normalizeKingRecommendation(
        review.verdict as Parameters<typeof normalizeKingRecommendation>[0],
        review.kingRecommendation as Parameters<typeof normalizeKingRecommendation>[1]
      );
      const severity = reviewSeverity(review.verdict, rec);
      return {
        id: review.id,
        automationJobId: review.automationJobId,
        workOrderId: review.workOrderId,
        title: review.workOrder.title,
        verdict: review.verdict,
        kingRecommendation: rec,
        summary: review.summary,
        severity,
        lastUpdated: review.updatedAt.toISOString(),
        nextAction: severity === "INFO" ? "Approve or archive after review." : "King decision required before this work can be accepted.",
        sourceReference: sourceReference({
          sourceType: "AgentReviewSummary",
          sourceId: review.id,
          sourceTitle: review.workOrder.title,
          automationJobId: review.automationJobId,
          workOrderId: review.workOrderId,
          reviewSummaryId: review.id,
          updatedAt: review.updatedAt.toISOString(),
          recommendedAction: severity === "INFO" ? "Approve or archive after review." : "King decision required before this work can be accepted.",
          why: `${review.verdict} / ${rec}: ${review.summary}`
        })
      };
    });

  const recentAgentActivity: MissionControlAgentActivityDto[] = agentActivities.map((activity) => {
    const sourceType = activity.sourceType ?? "AgentActivity";
    const sourceId = activity.sourceId ?? activity.id;
    return {
      id: activity.id,
      agentId: activity.agentId,
      agentName: activity.agent?.name ?? "Unknown agent",
      role: activity.agent?.role ?? activity.agent?.title ?? null,
      currentState: activityDisplayState(activity.status),
      relatedWorkOrderId: sourceType === "WorkOrder" ? sourceId : null,
      relatedAutomationJobId: sourceType === "AutomationJob" ? sourceId : null,
      relatedReviewSummaryId: sourceType === "AgentReviewSummary" ? sourceId : null,
      title: activity.title,
      detail: activity.detail,
      lastUpdated: (activity.heartbeatAt ?? activity.updatedAt).toISOString(),
      nextAction: activity.endedAt ? "Review completed activity if needed." : "Monitor activity from its source page.",
      sourceReference: sourceReference({
        sourceType,
        sourceId,
        sourceTitle: activity.title,
        taskId: activity.taskId,
        councilSessionId: activity.councilSessionId,
        agentId: activity.agentId,
        updatedAt: (activity.heartbeatAt ?? activity.updatedAt).toISOString(),
        recommendedAction: activity.endedAt ? "Review completed activity if needed." : "Monitor activity from its source page.",
        why: activity.detail ?? `Agent activity status is ${activity.status}.`
      })
    };
  });

  const staleContextWarnings: MissionControlWarningDto[] = activeWorkOrders
    .filter((workOrder) => ["READY", "IN_PROGRESS"].includes(workOrder.status) && workOrder.contextBindingStatus !== "FRESH")
    .map((workOrder) => ({
      id: `context:${workOrder.id}`,
      severity: "WARNING" as const,
      title: `Context ${workOrder.contextBindingStatus}: ${workOrder.title}`,
      detail: "Sandbox patch automation requires fresh project context before dispatch.",
      nextAction: "Open Work Orders and bind or refresh context.",
      lastUpdated: workOrder.lastUpdated,
      sourceReference: sourceReference({
        sourceType: "WorkOrder",
        sourceId: workOrder.id,
        sourceTitle: workOrder.title,
        workOrderId: workOrder.id,
        updatedAt: workOrder.lastUpdated,
        recommendedAction: "Open Work Orders and bind or refresh context.",
        why: "Sandbox patch automation requires fresh project context before dispatch."
      })
    }));

  const providerRoutingWarnings: MissionControlWarningDto[] = [];
  for (const agent of agents) {
    if (agent.parameterMode === "MANUAL") {
      const warning = modelParametersWarning(agent.modelParameters);
      if (warning) {
        providerRoutingWarnings.push({
          id: `agent-model-parameters:${agent.id}`,
          severity: "WARNING",
          title: `Invalid model parameters: ${agent.name}`,
          detail: warning,
          nextAction: "Open Agents and fix the manual model parameter configuration.",
          lastUpdated: agent.updatedAt.toISOString(),
          sourceReference: sourceReference({
            sourceType: "Agent",
            sourceId: agent.id,
            sourceTitle: agent.name,
            agentId: agent.id,
            routeTo: "/agents",
            updatedAt: agent.updatedAt.toISOString(),
            recommendedAction: "Open Agents and fix the manual model parameter configuration.",
            why: warning
          })
        });
      }
    }

    const duplicatedFallbackProviders = duplicateValues(agent.fallbackProviderIds);
    if (duplicatedFallbackProviders.length > 0) {
      providerRoutingWarnings.push({
        id: `agent-fallback-provider-duplicates:${agent.id}`,
        severity: "WARNING",
        title: `Duplicate fallback providers: ${agent.name}`,
        detail: `Duplicate provider ids: ${duplicatedFallbackProviders.join(", ")}.`,
        nextAction: "Open Agents and remove duplicate fallback providers.",
        lastUpdated: agent.updatedAt.toISOString(),
        sourceReference: sourceReference({
          sourceType: "Agent",
          sourceId: agent.id,
          sourceTitle: agent.name,
          agentId: agent.id,
          routeTo: "/agents",
          updatedAt: agent.updatedAt.toISOString(),
          recommendedAction: "Open Agents and remove duplicate fallback providers.",
          why: `Duplicate provider ids: ${duplicatedFallbackProviders.join(", ")}.`
        })
      });
    }

    const missingFallbackProviders = agent.fallbackProviderIds.filter((id) => !providerById.get(id)?.isActive);
    if (missingFallbackProviders.length > 0) {
      providerRoutingWarnings.push({
        id: `agent-fallback-provider-missing:${agent.id}`,
        severity: "CRITICAL",
        title: `Fallback provider risk: ${agent.name}`,
        detail: `Fallback providers are missing or inactive: ${missingFallbackProviders.join(", ")}.`,
        nextAction: "Open Agents and replace missing or inactive fallback providers.",
        lastUpdated: agent.updatedAt.toISOString(),
        sourceReference: sourceReference({
          sourceType: "Agent",
          sourceId: agent.id,
          sourceTitle: agent.name,
          agentId: agent.id,
          routeTo: "/agents",
          updatedAt: agent.updatedAt.toISOString(),
          recommendedAction: "Open Agents and replace missing or inactive fallback providers.",
          why: `Fallback providers are missing or inactive: ${missingFallbackProviders.join(", ")}.`
        })
      });
    }

    const duplicatedFallbackModels = duplicateValues(agent.fallbackModels);
    if (duplicatedFallbackModels.length > 0) {
      providerRoutingWarnings.push({
        id: `agent-fallback-model-duplicates:${agent.id}`,
        severity: "WARNING",
        title: `Duplicate fallback models: ${agent.name}`,
        detail: `Duplicate model ids: ${duplicatedFallbackModels.join(", ")}.`,
        nextAction: "Open Agents and remove duplicate fallback models.",
        lastUpdated: agent.updatedAt.toISOString(),
        sourceReference: sourceReference({
          sourceType: "Agent",
          sourceId: agent.id,
          sourceTitle: agent.name,
          agentId: agent.id,
          routeTo: "/agents",
          updatedAt: agent.updatedAt.toISOString(),
          recommendedAction: "Open Agents and remove duplicate fallback models.",
          why: `Duplicate model ids: ${duplicatedFallbackModels.join(", ")}.`
        })
      });
    }
  }

  for (const route of providerRoutes) {
    const ids = [route.preferredProviderId, ...route.fallbackProviderIds].filter((id): id is string => Boolean(id));
    const duplicates = duplicateValues(ids);
    const missing = ids.filter((id) => !providerById.get(id)?.isActive);
    if (duplicates.length > 0 || missing.length > 0) {
      providerRoutingWarnings.push({
        id: `legacy-provider-route:${route.id}`,
        severity: missing.length > 0 ? "CRITICAL" : "WARNING",
        title: `Provider route warning: ${route.name}`,
        detail: [
          duplicates.length > 0 ? `duplicate providers: ${duplicates.join(", ")}` : null,
          missing.length > 0 ? `missing or inactive providers: ${missing.join(", ")}` : null
        ].filter(Boolean).join("; "),
        nextAction: "Review provider route fallback order.",
        lastUpdated: route.updatedAt.toISOString(),
        sourceReference: sourceReference({
          sourceType: "AIProviderRoute",
          sourceId: route.id,
          sourceTitle: route.name,
          routeTo: "/providers",
          updatedAt: route.updatedAt.toISOString(),
          recommendedAction: "Review provider route fallback order.",
          why: [
            duplicates.length > 0 ? `duplicate providers: ${duplicates.join(", ")}` : null,
            missing.length > 0 ? `missing or inactive providers: ${missing.join(", ")}` : null
          ].filter(Boolean).join("; ")
        })
      });
    }
  }

  for (const chain of routeChains) {
    const enabledEntries = chain.entries.filter((entry) => entry.isEnabled);
    const missing = enabledEntries.filter((entry) => !providerById.get(entry.providerId)?.isActive).map((entry) => entry.providerId);
    const duplicateKeys = duplicateValues(enabledEntries.map((entry) => `${entry.providerId}:${entry.model}`));
    if (enabledEntries.length === 0 || missing.length > 0 || duplicateKeys.length > 0) {
      providerRoutingWarnings.push({
        id: `route-chain:${chain.id}`,
        severity: missing.length > 0 || enabledEntries.length === 0 ? "CRITICAL" : "WARNING",
        title: `Route chain warning: ${chain.name}`,
        detail: [
          enabledEntries.length === 0 ? "no enabled fallback entries" : null,
          missing.length > 0 ? `missing or inactive providers: ${[...new Set(missing)].join(", ")}` : null,
          duplicateKeys.length > 0 ? `duplicate provider/model entries: ${duplicateKeys.join(", ")}` : null
        ].filter(Boolean).join("; "),
        nextAction: "Open Provider Routing and repair the chain entries.",
        lastUpdated: chain.updatedAt.toISOString(),
        sourceReference: sourceReference({
          sourceType: "AIRouteChain",
          sourceId: chain.id,
          sourceTitle: chain.name,
          routeTo: "/routing",
          updatedAt: chain.updatedAt.toISOString(),
          recommendedAction: "Open Provider Routing and repair the chain entries.",
          why: [
            enabledEntries.length === 0 ? "no enabled fallback entries" : null,
            missing.length > 0 ? `missing or inactive providers: ${[...new Set(missing)].join(", ")}` : null,
            duplicateKeys.length > 0 ? `duplicate provider/model entries: ${duplicateKeys.join(", ")}` : null
          ].filter(Boolean).join("; ")
        })
      });
    }
  }

  const topCandidates: TopActionCandidate[] = [];
  const actionableWorkflows = activeWorkflows.filter((workflow) => workflow.status !== "COMPLETED");
  for (const workflow of actionableWorkflows) {
    const blocked = workflow.status === "BLOCKED";
    const needsReview = workflow.status === "NEEDS_REVIEW";
    const priorityKey: MissionControlTopActionDto["priorityKey"] = blocked
      ? (workflow.currentStep === "CHECK_CONTEXT" ? "STALE_CONTEXT_BLOCKING_PATCH" : "CRITICAL_BLOCKED_RUNNER_JOB")
      : needsReview
        ? (workflow.primaryAction === "Accept & Learn" ? "WORK_ORDER_NEEDS_REVIEW" : "FAILED_OR_REJECTED_REVIEW")
        : "WORK_ORDER_READY_TO_DISPATCH";
    topCandidates.push({
      id: `workflow:${workflow.id}`,
      priorityKey,
      severity: blocked ? "CRITICAL" : needsReview ? "WARNING" : "INFO",
      title: `${workflow.sourceTask.title}: ${workflow.currentStep.replaceAll("_", " ")}`,
      detail: workflow.lastError ?? workflow.automationJob?.reviewSummary?.summary ?? `DECREE_TO_DONE workflow is ${workflow.status}.`,
      nextAction: workflow.primaryAction ?? "Continue Workflow",
      routeTo: "/",
      sourceReference: sourceReference({
        sourceType: "WorkflowRun",
        sourceId: workflow.id,
        sourceTitle: workflow.sourceTask.title,
        taskId: workflow.sourceTaskId,
        workOrderId: workflow.workOrderId,
        automationJobId: workflow.automationJobId,
        routeTo: "/",
        updatedAt: workflow.updatedAt.toISOString(),
        recommendedAction: workflow.primaryAction,
        why: workflow.lastError ?? `Workflow is ${workflow.status} at ${workflow.currentStep}.`
      }),
      observedAt: workflow.updatedAt
    });
  }
  for (const job of runningJobs) {
    const original = automationJobs.find((candidate) => candidate.id === job.id);
    const runnerBlocked = ["QUEUED", "APPROVED"].includes(job.status) && onlineRunnerIds.size === 0;
    if (job.status === "FAILED" || runnerBlocked) {
      topCandidates.push({
        id: `blocked-job:${job.id}`,
        priorityKey: "CRITICAL_BLOCKED_RUNNER_JOB",
        severity: "CRITICAL",
        title: job.status === "FAILED" ? `Automation job failed: ${job.title}` : "Automation is blocked: no online runner",
        detail: job.status === "FAILED" ? "A runner job failed and needs King review before this Work Order can move forward." : "Queued or approved automation jobs cannot execute until a runner is online.",
        nextAction: job.status === "FAILED" ? "Open Automation Jobs and inspect the failed job." : "Start or repair the Agent Runner, then revisit Automation Jobs.",
        routeTo: "/automation-jobs",
        sourceReference: job.sourceReference,
        observedAt: original?.updatedAt ?? computedAt
      });
    }
  }
  for (const review of needsReviewItems) {
    if (review.severity !== "INFO") {
      topCandidates.push({
        id: `review-decision:${review.id}`,
        priorityKey: "FAILED_OR_REJECTED_REVIEW",
        severity: review.severity,
        title: `Review decision needed: ${review.title}`,
        detail: `${review.verdict} / ${review.kingRecommendation}: ${review.summary}`,
        nextAction: review.nextAction,
        routeTo: "/automation-jobs",
        sourceReference: review.sourceReference,
        observedAt: new Date(review.lastUpdated)
      });
    }
  }
  for (const warning of staleContextWarnings) {
    topCandidates.push({
      id: warning.id,
      priorityKey: "STALE_CONTEXT_BLOCKING_PATCH",
      severity: warning.severity,
      title: warning.title,
      detail: warning.detail,
      nextAction: warning.nextAction,
      routeTo: "/work-orders",
      sourceReference: warning.sourceReference,
      observedAt: warning.lastUpdated ? new Date(warning.lastUpdated) : computedAt
    });
  }
  for (const workOrder of activeWorkOrders.filter((item) => item.status === "READY")) {
    topCandidates.push({
      id: `ready-work-order:${workOrder.id}`,
      priorityKey: "WORK_ORDER_READY_TO_DISPATCH",
      severity: workOrder.priority === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `Work Order ready to dispatch: ${workOrder.title}`,
      detail: workOrder.nextAction,
      nextAction: workOrder.nextAction,
      routeTo: "/work-orders",
      sourceReference: workOrder.sourceReference,
      observedAt: new Date(workOrder.lastUpdated)
    });
  }
  for (const workOrder of activeWorkOrders.filter((item) => item.status === "NEEDS_REVIEW")) {
    topCandidates.push({
      id: `work-order-review:${workOrder.id}`,
      priorityKey: "WORK_ORDER_NEEDS_REVIEW",
      severity: workOrder.priority === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `Work Order needs review: ${workOrder.title}`,
      detail: workOrder.nextAction,
      nextAction: workOrder.nextAction,
      routeTo: "/work-orders",
      sourceReference: workOrder.sourceReference,
      observedAt: new Date(workOrder.lastUpdated)
    });
  }
  for (const warning of providerRoutingWarnings) {
    topCandidates.push({
      id: warning.id,
      priorityKey: "PROVIDER_ROUTING_WARNING",
      severity: warning.severity,
      title: warning.title,
      detail: warning.detail,
      nextAction: warning.nextAction,
      routeTo: warning.sourceReference.routeTo,
      sourceReference: warning.sourceReference,
      observedAt: warning.lastUpdated ? new Date(warning.lastUpdated) : computedAt
    });
  }

  const topAction = selectMissionControlTopAction(topCandidates, computedAt);
  const actionQueue = sortTopActionCandidates(topCandidates).slice(0, 20).map(topActionFromCandidate);
  const providerWarnings = providerRoutingWarnings.slice(0, 30);
  const workflowDtos = actionableWorkflows.map(serializeWorkflowView);
  const latestCompletedWorkflow = activeWorkflows.find((workflow) => workflow.status === "COMPLETED");

  return {
    computedAt: computedAt.toISOString(),
    milestoneCodename: MILESTONE_CODENAME,
    topAction,
    actionQueue,
    currentWorkflow: workflowDtos[0] ?? (latestCompletedWorkflow ? serializeWorkflowView(latestCompletedWorkflow) : null),
    activeWorkflows: workflowDtos,
    activeWorkOrders,
    activeWork: activeWorkOrders,
    blockedWorkOrders,
    blockedItems: blockedWorkOrders,
    needsReviewItems,
    runningJobs,
    recentAgentActivity,
    recentActivity: recentAgentActivity,
    staleContextWarnings,
    contextWarnings: staleContextWarnings,
    providerRoutingWarnings: providerWarnings,
    providerWarnings,
    nextRecommendedAction: topAction.nextAction,
    migration: {
      required: false,
      reason: "Mission Control reads the persisted DECREE_TO_DONE workflow graph and its source records."
    }
  };
}
