import type { Prisma, RoyalBrief } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { getNumberSetting, getBooleanSetting, getSettingValue } from "./settingsService.js";
import {
  AUTO_SANDBOX_PATCH_PROVENANCE_SOURCE,
  countAutoValidationJobsToday,
  countAutoSandboxPatchJobsToday,
  checkProjectLocalDocsHealth
} from "./livingLoopService.js";
import { getCurrentAgentActivities, type AgentActivityStatus } from "./agentActivityService.js";
import { getLatestLocalDocumentSnapshot } from "./localDocumentAccessService.js";

const BRIEF_WINDOW_HOURS = 24;
const STALE_RUNNER_HOURS = 24;

function toMeta(o: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o));
}

type DecisionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DecisionNeeded = {
  id: string;
  title: string;
  why: string;
  sourceLink: string;
  riskLevel: DecisionRiskLevel;
  recommendedAction: string;
  availableActions: string[];
  provenance: { source: string; id: string | null; observedAt: string };
};

export type LivingAgentDigestEntry = {
  agentId: string;
  slug: string;
  displayName: string;
  displayTitle: string;
  role: string;
  avatarUrl: string | null;
  actionsProposed: number;
  jobsExecuted: number;
  reportsProduced: number;
  candidatesCreated: number;
  failures: number;
  status: "IDLE" | "THINKING" | "EXECUTING" | "WAITING_REVIEW" | "BLOCKED";
};

function mapDigestStatus(status: AgentActivityStatus | string, hasNeedsReviewJob: boolean): LivingAgentDigestEntry["status"] {
  if (hasNeedsReviewJob) return "WAITING_REVIEW";
  switch (status) {
    case "IDLE":
    case "COMPLETED":
      return "IDLE";
    case "QUEUED":
    case "THINKING":
    case "WAITING_PROVIDER":
      return "THINKING";
    case "RESPONDING":
    case "SUMMARIZING":
    case "EXTRACTING_MEMORY":
    case "GENERATING_REPORT":
      return "EXECUTING";
    case "FAILED":
      return "BLOCKED";
    default:
      return "IDLE";
  }
}

async function buildLivingLoopSummary(since: Date) {
  const [runsInWindow, lastRun, candidateCounts] = await Promise.all([
    prisma.livingLoopRun.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.livingLoopRun.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.automationCandidate.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } })
  ]);

  const byStatus: Record<string, number> = {};
  for (const c of candidateCounts) byStatus[c.status] = c._count._all;

  return {
    runsInWindow: runsInWindow.length,
    completedRuns: runsInWindow.filter((r) => r.status === "COMPLETED").length,
    failedRuns: runsInWindow.filter((r) => r.status === "FAILED").length,
    skippedRuns: runsInWindow.filter((r) => r.status === "SKIPPED").length,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          triggerType: lastRun.triggerType,
          startedAt: lastRun.startedAt.toISOString(),
          completedAt: lastRun.completedAt ? lastRun.completedAt.toISOString() : null,
          summary: lastRun.summary,
          proposedCandidates: lastRun.proposedCandidates,
          skippedCandidates: lastRun.skippedCandidates,
          createdJobs: lastRun.createdJobs
        }
      : null,
    candidatesCreated: Object.values(byStatus).reduce((a, b) => a + b, 0),
    candidatesApplied: byStatus.APPLIED ?? 0,
    candidatesPending: byStatus.PENDING ?? 0,
    candidatesRejected: byStatus.REJECTED ?? 0,
    candidatesArchived: byStatus.ARCHIVED ?? 0
  };
}

async function buildValidationSummary(since: Date) {
  const [createdInWindow, completedInWindow, failedInWindow, needsReviewInWindow, autoEnabled, dailyLimit, cooldownMinutes, dailyCount] = await Promise.all([
    prisma.automationJob.count({ where: { mode: "VALIDATION_ONLY", createdAt: { gte: since } } }),
    prisma.automationJob.count({ where: { mode: "VALIDATION_ONLY", status: "COMPLETED", updatedAt: { gte: since } } }),
    prisma.automationJob.count({ where: { mode: "VALIDATION_ONLY", status: "FAILED", updatedAt: { gte: since } } }),
    prisma.automationJob.count({ where: { mode: "VALIDATION_ONLY", status: "NEEDS_REVIEW" } }),
    getBooleanSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", false),
    getNumberSetting("LIVING_LOOP_MAX_DAILY_VALIDATION_JOBS", 10),
    getNumberSetting("LIVING_LOOP_VALIDATION_JOB_COOLDOWN_MINUTES", 60),
    countAutoValidationJobsToday()
  ]);

  return {
    jobsCreated: createdInWindow,
    jobsCompleted: completedInWindow,
    jobsFailed: failedInWindow,
    jobsNeedingReview: needsReviewInWindow,
    autoValidation: { enabled: autoEnabled, dailyCount, dailyLimit, cooldownMinutes }
  };
}

type PatchNeedingReview = {
  id: string;
  title: string;
  riskLevel: string;
  validationStatus: string;
  workOrderId: string;
  projectId: string | null;
  automationJobId: string;
  createdAt: Date;
};

async function buildPatchSummary(since: Date, patchesNeedingReview: PatchNeedingReview[]) {
  const [createdInWindow, autoEnabled, dailyLimit, cooldownMinutes, minConfidence, dailyCount] = await Promise.all([
    prisma.automationJob.count({ where: { mode: "SANDBOX_PATCH", createdAt: { gte: since } } }),
    getBooleanSetting("LIVING_LOOP_AUTO_SANDBOX_PATCH", false),
    getNumberSetting("LIVING_LOOP_MAX_DAILY_SANDBOX_PATCH_JOBS", 3),
    getNumberSetting("LIVING_LOOP_SANDBOX_PATCH_COOLDOWN_MINUTES", 120),
    getNumberSetting("LIVING_LOOP_AUTO_PATCH_MIN_CONFIDENCE", 85),
    countAutoSandboxPatchJobsToday()
  ]);

  return {
    jobsCreated: createdInWindow,
    patchesNeedingReview: patchesNeedingReview.map((p) => ({
      id: p.id,
      title: p.title,
      riskLevel: p.riskLevel,
      validationStatus: p.validationStatus,
      workOrderId: p.workOrderId,
      projectId: p.projectId,
      automationJobId: p.automationJobId
    })),
    autoSandboxPatch: { enabled: autoEnabled, dailyCount, dailyLimit, cooldownMinutes, minConfidence }
  };
}

type ProviderHealth = {
  providerType: string;
  providerId: string | null;
  healthStatus: string;
  failureRate: number | null;
  timeoutRate: number | null;
  sampleSize: number;
  windowKind: string;
  computedAt: Date;
};

async function buildProviderSummary(since: Date): Promise<{ summary: { providerType: string; providerId: string | null; healthStatus: string; failureRate: number | null; timeoutRate: number | null; sampleSize: number }[]; recentErrorCounts: { providerName: string; status: string; count: number }[] }> {
  const [snapshots, recentErrors] = await Promise.all([
    prisma.providerHealthSnapshot.findMany({
      where: { windowKind: { in: ["LAST_24H", "LIFETIME"] } },
      select: { providerType: true, providerId: true, healthStatus: true, failureRate: true, timeoutRate: true, sampleSize: true, windowKind: true, computedAt: true },
      orderBy: { computedAt: "desc" },
      take: 100
    }),
    prisma.aIUsageTrace.groupBy({
      by: ["providerName", "status"],
      where: { status: { in: ["ERROR", "TIMEOUT", "FAILED"] }, updatedAt: { gte: since } },
      _count: { _all: true }
    })
  ]);

  const seen = new Set<string>();
  const summary: ProviderHealth[] = [];
  for (const s of snapshots) {
    const key = `${s.providerType}:${s.providerId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summary.push(s as ProviderHealth);
  }

  return {
    summary: summary.map((s) => ({
      providerType: s.providerType,
      providerId: s.providerId,
      healthStatus: s.healthStatus,
      failureRate: s.failureRate,
      timeoutRate: s.timeoutRate,
      sampleSize: s.sampleSize
    })),
    recentErrorCounts: recentErrors.map((e) => ({
      providerName: e.providerName ?? "unknown",
      status: e.status,
      count: e._count._all
    }))
  };
}

async function buildTreasurySummary(since: Date) {
  const [costAgg, dailyLimitRaw, monthlyLimitRaw] = await Promise.all([
    prisma.treasuryLedger.aggregate({ where: { type: "COST", createdAt: { gte: since } }, _sum: { amount: true } }),
    getSettingValue("DAILY_BUDGET_LIMIT_USD", ""),
    getSettingValue("MONTHLY_BUDGET_LIMIT_USD", "")
  ]);

  const dailyBudgetLimitUSD = dailyLimitRaw.trim() ? Number(dailyLimitRaw) : null;
  const monthlyBudgetLimitUSD = monthlyLimitRaw.trim() ? Number(monthlyLimitRaw) : null;
  const totalCostUSD = costAgg._sum.amount ?? 0;

  return {
    totalCostUSD,
    dailyBudgetLimitUSD,
    monthlyBudgetLimitUSD,
    overDailyBudget: dailyBudgetLimitUSD !== null && totalCostUSD > dailyBudgetLimitUSD
  };
}

async function buildMemorySummary(since: Date) {
  const [pending, approvedInWindow, rejectedInWindow] = await Promise.all([
    prisma.agentKnowledgeCandidate.count({ where: { status: "PENDING" } }),
    prisma.agentKnowledgeCandidate.count({ where: { status: "APPROVED", reviewedAt: { gte: since } } }),
    prisma.agentKnowledgeCandidate.count({ where: { status: "REJECTED", reviewedAt: { gte: since } } })
  ]);

  return { pendingCandidates: pending, approvedInWindow, rejectedInWindow };
}

async function buildRiskSummary() {
  const pendingByRisk = await prisma.automationCandidate.groupBy({ by: ["riskLevel"], where: { status: "PENDING" }, _count: { _all: true } });
  const byRisk: Record<string, number> = {};
  for (const r of pendingByRisk) byRisk[r.riskLevel] = r._count._all;

  return {
    pendingByRiskLevel: byRisk,
    highCriticalPending: (byRisk.HIGH ?? 0) + (byRisk.CRITICAL ?? 0)
  };
}

type LocalDocsIssue = { projectId: string; projectName: string; issue: "MISSING_ROOT" | "MISSING_SNAPSHOT" | "SCAN_FAILED" | "STALE_SNAPSHOT" | "DOCS_CHANGED"; detail: string };

async function buildLocalDocsSummary(): Promise<{
  issues: LocalDocsIssue[];
  projectsMissingRoot: number;
  projectsMissingSnapshot: number;
  projectsWithFailedScan: number;
  projectsWithStaleSnapshot: number;
  projectsWithChangedDocs: number;
  workOrdersBlocked: Array<{ id: string; title: string; priority: string; projectId: string; projectName: string }>;
}> {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] } },
    select: { id: true, name: true }
  });

  const issues: LocalDocsIssue[] = [];
  const issuesByProject = new Map<string, LocalDocsIssue>();

  for (const project of projects) {
    const issue = await checkProjectLocalDocsHealth(project.id, project.name);
    if (issue) {
      issues.push(issue);
      issuesByProject.set(project.id, issue);
    }
  }

  const workOrdersBlocked: Array<{ id: string; title: string; priority: string; projectId: string; projectName: string }> = [];
  if (issuesByProject.size > 0) {
    const workOrders = await prisma.workOrder.findMany({
      where: { status: { in: ["READY", "IN_PROGRESS"] }, projectId: { in: Array.from(issuesByProject.keys()) } },
      select: { id: true, title: true, priority: true, projectId: true },
      take: 50
    });
    for (const w of workOrders) {
      const issue = w.projectId ? issuesByProject.get(w.projectId) : undefined;
      if (issue && w.projectId) {
        workOrdersBlocked.push({ id: w.id, title: w.title, priority: w.priority, projectId: w.projectId, projectName: issue.projectName });
      }
    }
  }

  return {
    issues,
    projectsMissingRoot: issues.filter((i) => i.issue === "MISSING_ROOT").length,
    projectsMissingSnapshot: issues.filter((i) => i.issue === "MISSING_SNAPSHOT").length,
    projectsWithFailedScan: issues.filter((i) => i.issue === "SCAN_FAILED").length,
    projectsWithStaleSnapshot: issues.filter((i) => i.issue === "STALE_SNAPSHOT").length,
    projectsWithChangedDocs: issues.filter((i) => i.issue === "DOCS_CHANGED").length,
    workOrdersBlocked
  };
}

type ContextBlockedWorkOrder = { id: string; title: string; priority: string; projectId: string; projectName: string; contextBindingStatus: string };

async function buildContextHealthSummary(since: Date): Promise<{
  workOrdersBlockedByContext: ContextBlockedWorkOrder[];
  autoJobsSkippedForContext: number;
  contextSkippedReasons: string[];
  patchesWithStaleBaseContext: Array<{ id: string; title: string; riskLevel: string; baseContextStatus: string; workOrderId: string; projectId: string | null }>;
  projectsNeedingContextRefresh: Array<{ projectId: string; projectName: string; reason: string }>;
}> {
  const [blockedWOs, stalePatches, recentRuns, boundWOs] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: { in: ["READY", "IN_PROGRESS"] }, projectId: { not: null }, contextBindingStatus: { in: ["MISSING", "STALE"] } },
      select: { id: true, title: true, priority: true, projectId: true, contextBindingStatus: true, project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.patchArtifact.findMany({
      where: { validationStatus: "PENDING", baseContextStatus: { in: ["MISSING", "STALE"] } },
      select: { id: true, title: true, riskLevel: true, baseContextStatus: true, workOrderId: true, projectId: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.livingLoopRun.findMany({
      where: { startedAt: { gte: since } },
      select: { skippedReasons: true },
      take: 50
    }),
    prisma.workOrder.findMany({
      where: { status: { in: ["READY", "IN_PROGRESS"] }, projectId: { not: null }, localDocumentSnapshotId: { not: null }, contextBindingStatus: "FRESH" },
      select: { id: true, projectId: true, localDocumentSnapshotId: true, project: { select: { name: true } } },
      take: 50
    })
  ]);

  const contextSkippedReasons: string[] = [];
  for (const run of recentRuns) {
    if (Array.isArray(run.skippedReasons)) {
      for (const reason of run.skippedReasons) {
        if (typeof reason === "string" && reason.includes("ContextBinding:")) contextSkippedReasons.push(reason);
      }
    }
  }

  const projectsNeedingContextRefresh: Array<{ projectId: string; projectName: string; reason: string }> = [];
  const seenProjects = new Set<string>();
  const latestByProject = new Map<string, string | null>();
  for (const w of boundWOs) {
    if (!w.projectId || seenProjects.has(w.projectId)) continue;
    if (!latestByProject.has(w.projectId)) {
      const latest = await getLatestLocalDocumentSnapshot(w.projectId).catch(() => null);
      latestByProject.set(w.projectId, latest?.id ?? null);
    }
    const latestId = latestByProject.get(w.projectId);
    if (latestId && w.localDocumentSnapshotId !== latestId) {
      seenProjects.add(w.projectId);
      projectsNeedingContextRefresh.push({
        projectId: w.projectId,
        projectName: w.project?.name ?? "?",
        reason: "Local docs changed since open work orders were bound; rebind context before patching."
      });
    }
  }
  for (const w of blockedWOs) {
    if (w.projectId && !seenProjects.has(w.projectId)) {
      seenProjects.add(w.projectId);
      projectsNeedingContextRefresh.push({
        projectId: w.projectId,
        projectName: w.project?.name ?? "?",
        reason: `Open work order(s) have ${w.contextBindingStatus} context binding.`
      });
    }
  }

  return {
    workOrdersBlockedByContext: blockedWOs.map((w) => ({
      id: w.id,
      title: w.title,
      priority: w.priority,
      projectId: w.projectId!,
      projectName: w.project?.name ?? "?",
      contextBindingStatus: w.contextBindingStatus
    })),
    autoJobsSkippedForContext: contextSkippedReasons.length,
    contextSkippedReasons: contextSkippedReasons.slice(0, 20),
    patchesWithStaleBaseContext: stalePatches,
    projectsNeedingContextRefresh
  };
}

type RunnerInfo = { id: string; name: string; status: string; lastHeartbeatAt: Date | null };

async function buildRunnerStatus(): Promise<{ runners: { id: string; name: string; status: string; lastHeartbeatAt: string | null; isStale: boolean }[]; onlineCount: number; offlineCount: number; errorCount: number; staleCount: number }> {
  const staleCutoff = new Date(Date.now() - STALE_RUNNER_HOURS * 3600000);
  const runners = await prisma.agentRunner.findMany({
    select: { id: true, name: true, status: true, lastHeartbeatAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  const mapped = runners.map((r: RunnerInfo) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    lastHeartbeatAt: r.lastHeartbeatAt ? r.lastHeartbeatAt.toISOString() : null,
    isStale: !!r.lastHeartbeatAt && r.lastHeartbeatAt < staleCutoff
  }));

  return {
    runners: mapped,
    onlineCount: mapped.filter((r) => r.status === "ONLINE" && !r.isStale).length,
    offlineCount: mapped.filter((r) => r.status === "OFFLINE").length,
    errorCount: mapped.filter((r) => r.status === "ERROR").length,
    staleCount: mapped.filter((r) => r.isStale).length
  };
}

async function buildLivingAgentActivityDigest(since: Date): Promise<LivingAgentDigestEntry[]> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true, isTestData: false },
    select: { id: true, slug: true, name: true, title: true, role: true }
  });
  const agentIds = agents.map((a) => a.id);
  if (agentIds.length === 0) return [];

  const [candidateCounts, jobCounts, reportCounts, failureCounts, needsReviewJobs, currentActivities] = await Promise.all([
    prisma.automationCandidate.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.automationJob.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.agentActivity.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, reportId: { not: null }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.agentActivity.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, status: "FAILED", createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.automationJob.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, status: "NEEDS_REVIEW" }, _count: { _all: true } }),
    getCurrentAgentActivities()
  ]);

  const toMap = (rows: Array<{ agentId: string | null; _count: { _all: number } }>) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.agentId) m.set(r.agentId, r._count._all);
    return m;
  };

  const candidateMap = toMap(candidateCounts);
  const jobMap = toMap(jobCounts);
  const reportMap = toMap(reportCounts);
  const failureMap = toMap(failureCounts);
  const needsReviewMap = toMap(needsReviewJobs);
  const activityByAgent = new Map(currentActivities.map((a) => [a.agent.id, a]));

  return agents.map((agent) => {
    const activity = activityByAgent.get(agent.id);
    return {
      agentId: agent.id,
      slug: agent.slug,
      displayName: activity?.agent.displayName ?? agent.name,
      displayTitle: activity?.agent.displayTitle ?? agent.title,
      role: agent.role,
      avatarUrl: activity?.agent.avatarUrl ?? null,
      actionsProposed: candidateMap.get(agent.id) ?? 0,
      jobsExecuted: jobMap.get(agent.id) ?? 0,
      reportsProduced: reportMap.get(agent.id) ?? 0,
      candidatesCreated: candidateMap.get(agent.id) ?? 0,
      failures: failureMap.get(agent.id) ?? 0,
      status: mapDigestStatus(activity?.status ?? "IDLE", (needsReviewMap.get(agent.id) ?? 0) > 0)
    };
  });
}

function buildDecisionsNeeded(input: {
  patchesNeedingReview: PatchNeedingReview[];
  runnerStatus: Awaited<ReturnType<typeof buildRunnerStatus>>;
  providerSummary: Awaited<ReturnType<typeof buildProviderSummary>>;
  workOrdersNeedingReview: { id: string; title: string; priority: string }[];
  pendingMemoryCandidates: number;
  validationSummary: Awaited<ReturnType<typeof buildValidationSummary>>;
  patchSummary: Awaited<ReturnType<typeof buildPatchSummary>>;
  localDocsSummary: Awaited<ReturnType<typeof buildLocalDocsSummary>>;
  contextHealthSummary: Awaited<ReturnType<typeof buildContextHealthSummary>>;
  observedAt: string;
}): DecisionNeeded[] {
  const decisions: DecisionNeeded[] = [];

  for (const p of input.patchesNeedingReview.slice(0, 10)) {
    decisions.push({
      id: `patch:${p.id}`,
      title: `Patch needs review: ${p.title}`,
      why: `Patch artifact has ${p.riskLevel} risk and validation status ${p.validationStatus}.`,
      sourceLink: "/automation-jobs",
      riskLevel: (p.riskLevel as DecisionRiskLevel) ?? "MEDIUM",
      recommendedAction: "Review the patch diff and validation results, then approve, reject, or request revision.",
      availableActions: ["approve", "reject", "request_revision"],
      provenance: { source: "PatchArtifact", id: p.id, observedAt: input.observedAt }
    });
  }

  for (const r of input.runnerStatus.runners) {
    if (r.status === "OFFLINE" || r.status === "ERROR" || r.isStale) {
      decisions.push({
        id: `runner:${r.id}`,
        title: `Runner offline: ${r.name}`,
        why: r.status === "ERROR" ? "Runner reported an error state." : "Runner has not sent a heartbeat recently.",
        sourceLink: "/automation-jobs",
        riskLevel: r.status === "ERROR" ? "HIGH" : "MEDIUM",
        recommendedAction: "Inspect the runner host and restart the runner service if needed.",
        availableActions: ["inspect", "restart_service"],
        provenance: { source: "AgentRunner", id: r.id, observedAt: input.observedAt }
      });
    }
  }

  for (const p of input.providerSummary.summary) {
    if (p.healthStatus !== "HEALTHY" || (p.timeoutRate ?? 0) > 0.2 || (p.failureRate ?? 0) > 0.2) {
      decisions.push({
        id: `provider:${p.providerType}:${p.providerId ?? "default"}`,
        title: `Provider issue: ${p.providerType}`,
        why: `Provider health is ${p.healthStatus} (failure rate ${(p.failureRate ?? 0) * 100}%, timeout rate ${(p.timeoutRate ?? 0) * 100}%, sample ${p.sampleSize}).`,
        sourceLink: "/providers",
        riskLevel: p.healthStatus === "UNHEALTHY" ? "HIGH" : "MEDIUM",
        recommendedAction: "Review provider settings, fallback configuration, or model availability.",
        availableActions: ["review_settings", "create_work_order"],
        provenance: { source: "ProviderHealthSnapshot", id: `${p.providerType}:${p.providerId ?? ""}`, observedAt: input.observedAt }
      });
    }
  }

  for (const w of input.workOrdersNeedingReview.slice(0, 10)) {
    decisions.push({
      id: `work-order:${w.id}`,
      title: `Work order awaiting review: ${w.title}`,
      why: `Work order is in NEEDS_REVIEW with priority ${w.priority}.`,
      sourceLink: "/work-orders",
      riskLevel: w.priority === "CRITICAL" || w.priority === "HIGH" ? "HIGH" : "MEDIUM",
      recommendedAction: "Review the implementation report and approve completion or request revisions.",
      availableActions: ["approve_completion", "request_revision"],
      provenance: { source: "WorkOrder", id: w.id, observedAt: input.observedAt }
    });
  }

  if (input.pendingMemoryCandidates > 0) {
    decisions.push({
      id: "memory-candidates:pending",
      title: `${input.pendingMemoryCandidates} memory candidate(s) awaiting approval`,
      why: "Agents proposed knowledge candidates that require King review before becoming trusted memory.",
      sourceLink: "/knowledge-lab/candidates",
      riskLevel: "LOW",
      recommendedAction: "Review pending knowledge candidates and approve or reject each one.",
      availableActions: ["review"],
      provenance: { source: "AgentKnowledgeCandidate", id: null, observedAt: input.observedAt }
    });
  }

  if (input.validationSummary.jobsNeedingReview > 0) {
    decisions.push({
      id: "validation:needs-review",
      title: `${input.validationSummary.jobsNeedingReview} validation job(s) need review`,
      why: "Auto-created validation-only jobs are waiting for King review.",
      sourceLink: "/automation-jobs",
      riskLevel: "MEDIUM",
      recommendedAction: "Review validation job results and resolve or dismiss.",
      availableActions: ["review"],
      provenance: { source: "AutomationJob", id: null, observedAt: input.observedAt }
    });
  }

  if (input.patchSummary.autoSandboxPatch.enabled && input.patchSummary.autoSandboxPatch.dailyCount >= input.patchSummary.autoSandboxPatch.dailyLimit) {
    decisions.push({
      id: "auto-patch:daily-limit",
      title: "Daily auto sandbox patch limit reached",
      why: `Auto sandbox patch has created ${input.patchSummary.autoSandboxPatch.dailyCount} of ${input.patchSummary.autoSandboxPatch.dailyLimit} allowed jobs today.`,
      sourceLink: "/living-loop",
      riskLevel: "LOW",
      recommendedAction: "No action required unless additional patches are urgently needed; limit resets daily.",
      availableActions: ["adjust_limit_in_settings"],
      provenance: { source: "LivingLoop", id: AUTO_SANDBOX_PATCH_PROVENANCE_SOURCE, observedAt: input.observedAt }
    });
  }

  const localDocsIssueTitles: Record<LocalDocsIssue["issue"], string> = {
    MISSING_ROOT: "Local Docs Root Missing",
    MISSING_SNAPSHOT: "Local Docs Not Scanned",
    SCAN_FAILED: "Local Docs Scan Failed",
    STALE_SNAPSHOT: "Local Docs Stale",
    DOCS_CHANGED: "Local Docs Changed"
  };

  for (const issue of input.localDocsSummary.issues.slice(0, 10)) {
    decisions.push({
      id: `local-docs:${issue.projectId}:${issue.issue}`,
      title: `${localDocsIssueTitles[issue.issue]}: ${issue.projectName}`,
      why: issue.detail,
      sourceLink: `/projects/${issue.projectId}`,
      riskLevel: issue.issue === "SCAN_FAILED" ? "MEDIUM" : "LOW",
      recommendedAction: "Review the project's Local Docs section and run a fresh scan.",
      availableActions: ["scan_now", "review"],
      provenance: { source: "Project", id: issue.projectId, observedAt: input.observedAt }
    });
  }

  for (const w of input.localDocsSummary.workOrdersBlocked.slice(0, 10)) {
    decisions.push({
      id: `work-order-blocked:${w.id}`,
      title: `Work Order Blocked by Local Docs: ${w.title}`,
      why: `Project "${w.projectName}" has no fresh local document context, blocking SANDBOX_PATCH for this work order.`,
      sourceLink: "/work-orders",
      riskLevel: w.priority === "CRITICAL" || w.priority === "HIGH" ? "HIGH" : "MEDIUM",
      recommendedAction: "Run a local docs scan for the project before this work order proceeds to patch.",
      availableActions: ["scan_local_docs", "proceed_anyway"],
      provenance: { source: "WorkOrder", id: w.id, observedAt: input.observedAt }
    });
  }

  // M17E-2: context binding decisions.
  for (const project of input.contextHealthSummary.projectsNeedingContextRefresh.slice(0, 10)) {
    decisions.push({
      id: `context-refresh:${project.projectId}`,
      title: `Refresh project context before patching: ${project.projectName}`,
      why: project.reason,
      sourceLink: `/projects/${project.projectId}`,
      riskLevel: "MEDIUM",
      recommendedAction: "Run a fresh local docs scan, then bind/refresh context on the project's open work orders.",
      availableActions: ["scan_local_docs", "bind_context"],
      provenance: { source: "ProjectContextBinding", id: project.projectId, observedAt: input.observedAt }
    });
  }

  for (const w of input.contextHealthSummary.workOrdersBlockedByContext.slice(0, 10)) {
    decisions.push({
      id: `context-blocked:${w.id}`,
      title: `Work order blocked by ${w.contextBindingStatus} context: ${w.title}`,
      why: `Work order in project "${w.projectName}" has ${w.contextBindingStatus} context binding; SANDBOX_PATCH cannot run until it is FRESH.`,
      sourceLink: "/work-orders",
      riskLevel: w.priority === "CRITICAL" || w.priority === "HIGH" ? "HIGH" : "MEDIUM",
      recommendedAction: "Bind or refresh the work order's project context after scanning local docs.",
      availableActions: ["bind_context", "scan_local_docs"],
      provenance: { source: "WorkOrder", id: w.id, observedAt: input.observedAt }
    });
  }

  for (const p of input.contextHealthSummary.patchesWithStaleBaseContext.slice(0, 10)) {
    decisions.push({
      id: `patch-context:${p.id}`,
      title: `Patch built from ${p.baseContextStatus} context: ${p.title}`,
      why: `Patch artifact was created from ${p.baseContextStatus} base context and may not reflect the current repository state.`,
      sourceLink: "/automation-jobs",
      riskLevel: p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH" ? "HIGH" : "MEDIUM",
      recommendedAction: "Review the patch carefully against the current project state, or request a revision after a fresh scan.",
      availableActions: ["review_patch", "request_revision"],
      provenance: { source: "PatchArtifact", id: p.id, observedAt: input.observedAt }
    });
  }

  const order: Record<DecisionRiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  decisions.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);
  return decisions;
}

function buildHighlights(input: {
  livingLoopSummary: Awaited<ReturnType<typeof buildLivingLoopSummary>>;
  validationSummary: Awaited<ReturnType<typeof buildValidationSummary>>;
  patchSummary: Awaited<ReturnType<typeof buildPatchSummary>>;
  treasurySummary: Awaited<ReturnType<typeof buildTreasurySummary>>;
  localDocsSummary: Awaited<ReturnType<typeof buildLocalDocsSummary>>;
  contextHealthSummary: Awaited<ReturnType<typeof buildContextHealthSummary>>;
  observedAt: string;
}): { title: string; detail: string; provenance: { source: string; observedAt: string } }[] {
  const highlights: { title: string; detail: string; provenance: { source: string; observedAt: string } }[] = [];

  highlights.push({
    title: "Living Loop activity",
    detail: `${input.livingLoopSummary.runsInWindow} run(s) in the last ${BRIEF_WINDOW_HOURS}h, proposing ${input.livingLoopSummary.candidatesCreated} candidate(s) (${input.livingLoopSummary.candidatesApplied} applied, ${input.livingLoopSummary.candidatesPending} pending).`,
    provenance: { source: "LivingLoopRun", observedAt: input.observedAt }
  });

  if (input.validationSummary.jobsCreated > 0) {
    highlights.push({
      title: "Validation jobs",
      detail: `${input.validationSummary.jobsCreated} validation job(s) created, ${input.validationSummary.jobsCompleted} completed, ${input.validationSummary.jobsFailed} failed.`,
      provenance: { source: "AutomationJob", observedAt: input.observedAt }
    });
  }

  if (input.patchSummary.jobsCreated > 0 || input.patchSummary.patchesNeedingReview.length > 0) {
    highlights.push({
      title: "Sandbox patches",
      detail: `${input.patchSummary.jobsCreated} sandbox patch job(s) created; ${input.patchSummary.patchesNeedingReview.length} patch(es) awaiting review.`,
      provenance: { source: "PatchArtifact", observedAt: input.observedAt }
    });
  }

  highlights.push({
    title: "Treasury",
    detail: `Spent $${input.treasurySummary.totalCostUSD.toFixed(4)} in the last ${BRIEF_WINDOW_HOURS}h.${input.treasurySummary.overDailyBudget ? " This exceeds the daily budget limit." : ""}`,
    provenance: { source: "TreasuryLedger", observedAt: input.observedAt }
  });

  if (input.localDocsSummary.issues.length > 0) {
    highlights.push({
      title: "Local Docs Context",
      detail: `${input.localDocsSummary.issues.length} project(s) need local docs attention: ${input.localDocsSummary.projectsMissingRoot} missing root, ${input.localDocsSummary.projectsMissingSnapshot} not scanned, ${input.localDocsSummary.projectsWithFailedScan} failed scan, ${input.localDocsSummary.projectsWithStaleSnapshot} stale, ${input.localDocsSummary.projectsWithChangedDocs} changed since scan.${input.localDocsSummary.workOrdersBlocked.length > 0 ? ` ${input.localDocsSummary.workOrdersBlocked.length} work order(s) blocked.` : ""}`,
      provenance: { source: "LocalDocumentSnapshot", observedAt: input.observedAt }
    });
  }

  const ch = input.contextHealthSummary;
  if (ch.workOrdersBlockedByContext.length > 0 || ch.autoJobsSkippedForContext > 0 || ch.patchesWithStaleBaseContext.length > 0 || ch.projectsNeedingContextRefresh.length > 0) {
    highlights.push({
      title: "Context Binding Health",
      detail: `${ch.workOrdersBlockedByContext.length} work order(s) blocked by missing/stale context, ${ch.autoJobsSkippedForContext} auto job(s) skipped for context, ${ch.patchesWithStaleBaseContext.length} pending patch(es) built from stale/missing context, ${ch.projectsNeedingContextRefresh.length} project(s) need a context refresh.`,
      provenance: { source: "ProjectContextBinding", observedAt: input.observedAt }
    });
  }

  return highlights;
}

export async function generateDailyRoyalBrief(date: Date = new Date(), userId?: string | null): Promise<RoyalBrief> {
  const since = new Date(date.getTime() - BRIEF_WINDOW_HOURS * 3600000);
  const observedAt = date.toISOString();

  try {
    const [patchesNeedingReview, workOrdersNeedingReview, livingLoopSummary, validationSummary, treasurySummary, memorySummary, riskSummary, runnerStatus, providerSummary, livingAgentDigest, localDocsSummary, contextHealthSummary] = await Promise.all([
      prisma.patchArtifact.findMany({
        where: { OR: [{ validationStatus: "PENDING" }, { riskLevel: { in: ["HIGH", "CRITICAL"] } }] },
        select: { id: true, title: true, riskLevel: true, validationStatus: true, workOrderId: true, projectId: true, automationJobId: true, createdAt: true },
        orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
        take: 20
      }),
      prisma.workOrder.findMany({
        where: { status: "NEEDS_REVIEW" },
        select: { id: true, title: true, priority: true },
        orderBy: { updatedAt: "desc" },
        take: 20
      }),
      buildLivingLoopSummary(since),
      buildValidationSummary(since),
      buildTreasurySummary(since),
      buildMemorySummary(since),
      buildRiskSummary(),
      buildRunnerStatus(),
      buildProviderSummary(since),
      buildLivingAgentActivityDigest(since),
      buildLocalDocsSummary(),
      buildContextHealthSummary(since)
    ]);

    const patchSummary = await buildPatchSummary(since, patchesNeedingReview);

    const decisionsNeeded = buildDecisionsNeeded({
      patchesNeedingReview,
      runnerStatus,
      providerSummary,
      workOrdersNeedingReview,
      pendingMemoryCandidates: memorySummary.pendingCandidates,
      validationSummary,
      patchSummary,
      localDocsSummary,
      contextHealthSummary,
      observedAt
    });

    const highlights = buildHighlights({ livingLoopSummary, validationSummary, patchSummary, treasurySummary, localDocsSummary, contextHealthSummary, observedAt });

    const summary = `In the last ${BRIEF_WINDOW_HOURS}h: ${livingLoopSummary.runsInWindow} Living Loop run(s), ${livingLoopSummary.candidatesCreated} candidate(s) proposed, ${patchSummary.patchesNeedingReview.length} patch(es) awaiting review, ${decisionsNeeded.length} decision(s) needed, ${runnerStatus.onlineCount}/${runnerStatus.runners.length} runner(s) online.`;

    const provenance = {
      generatedAt: observedAt,
      windowHours: BRIEF_WINDOW_HOURS,
      since: since.toISOString(),
      sources: ["LivingLoopRun", "AutomationCandidate", "AutomationJob", "PatchArtifact", "AgentRunner", "ProviderHealthSnapshot", "AIUsageTrace", "TreasuryLedger", "WorkOrder", "AgentKnowledgeCandidate", "AgentActivity", "Project", "LocalDocumentRoot", "LocalDocumentSnapshot", "ProjectContextBinding"]
    };

    const generatedBy = userId ? "KING" : "SYSTEM";

    const brief = await prisma.royalBrief.create({
      data: {
        title: `Daily Royal Brief — ${date.toISOString().slice(0, 10)}`,
        briefDate: date,
        status: "READY",
        summary,
        highlights: toMeta({ items: highlights }),
        decisionsNeeded: toMeta({ items: decisionsNeeded }),
        runnerStatus: toMeta(runnerStatus),
        livingLoopSummary: toMeta(livingLoopSummary),
        validationSummary: toMeta(validationSummary),
        patchSummary: toMeta(patchSummary),
        providerSummary: toMeta(providerSummary),
        treasurySummary: toMeta(treasurySummary),
        memorySummary: toMeta(memorySummary),
        riskSummary: toMeta(riskSummary),
        localDocsSummary: toMeta(localDocsSummary),
        contextHealthSummary: toMeta(contextHealthSummary),
        livingAgentDigest: toMeta({ items: livingAgentDigest }),
        provenance: toMeta(provenance),
        generatedBy,
        generatedByUserId: userId ?? null
      }
    });

    await auditLog({
      userId: userId ?? null,
      action: "royal_brief_generated",
      resourceType: "royal_brief",
      resourceId: brief.id,
      metadata: toMeta({ briefDate: brief.briefDate.toISOString(), decisionsNeeded: decisionsNeeded.length, patchesNeedingReview: patchSummary.patchesNeedingReview.length })
    });

    return brief;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await auditLog({ userId: userId ?? null, action: "royal_brief_generation_failed", resourceType: "royal_brief", resourceId: null, metadata: toMeta({ error: msg }) });
    throw error;
  }
}

export async function getLatestRoyalBrief(): Promise<RoyalBrief | null> {
  return prisma.royalBrief.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function listRoyalBriefs(limit = 20): Promise<RoyalBrief[]> {
  return prisma.royalBrief.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(limit, 100) });
}

export async function getRoyalBrief(id: string): Promise<RoyalBrief | null> {
  return prisma.royalBrief.findUnique({ where: { id } });
}

export async function archiveRoyalBrief(id: string, userId: string): Promise<RoyalBrief> {
  const brief = await prisma.royalBrief.findUniqueOrThrow({ where: { id } });
  if (brief.status === "ARCHIVED") throw new Error("Already archived");
  const updated = await prisma.royalBrief.update({ where: { id }, data: { status: "ARCHIVED" } });
  await auditLog({ userId, action: "royal_brief_archived", resourceType: "royal_brief", resourceId: id, metadata: toMeta({ briefDate: brief.briefDate.toISOString() }) });
  return updated;
}

export { buildLivingAgentActivityDigest };
