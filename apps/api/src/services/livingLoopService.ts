import type { AutomationCandidate, Prisma } from "@prisma/client";
import type { AutomationCandidateKind, AutomationCandidatePriority, AutomationCandidateRiskLevel, LivingLoopRun } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { auditLog, sanitizeMetadata } from "./auditService.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";

const STALE_RUNNER_HOURS = 24;
const STALE_WORK_ORDER_HOURS = 1;
const STALE_JOB_MINUTES = 15;
const STALE_INBOX_HOURS = 24;
const STALE_REPORT_DAYS = 3;

export type Observation = {
  workOrdersNeedingReview: Array<any>;
  staleWorkOrders: Array<any>;
  failedJobs: Array<any>;
  needsReviewJobs: Array<any>;
  staleJobs: Array<any>;
  patchesPendingReview: Array<any>;
  staleRunners: Array<any>;
  providerIssues: Array<any>;
  staleInboxItems: Array<any>;
  mattersAwaitingDecision: Array<any>;
  reportsWithRemainingWork: Array<any>;
};

type CandidateInput = {
  kind: AutomationCandidateKind;
  title: string;
  summary: string;
  reason: string;
  confidence: number;
  priority: AutomationCandidatePriority;
  riskLevel: AutomationCandidateRiskLevel;
  sourceType: string;
  sourceId: string;
  projectId?: string | null;
  agentId?: string | null;
  workOrderId?: string | null;
  automationJobId?: string | null;
  patchArtifactId?: string | null;
  proposedAction: Prisma.InputJsonValue;
  provenance: Prisma.InputJsonValue;
  dataQuality?: string;
};

function toMeta(o: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o));
}

export async function runLivingLoopOnce(triggerType: "MANUAL" | "SCHEDULED", userId?: string | null): Promise<{ run: LivingLoopRun; candidates: AutomationCandidate[] }> {
  const skipReasons: string[] = [];
  let run: LivingLoopRun | null = null;
  try {
    if (triggerType === "SCHEDULED") {
      const enabled = await getBooleanSetting("LIVING_LOOP_ENABLED", false);
      if (!enabled) {
        run = await prisma.livingLoopRun.create({ data: { status: "SKIPPED", triggerType, completedAt: new Date(), summary: "Living loop is disabled." } });
        await auditLog({ userId, action: "living_loop_run_skipped", resourceType: "living_loop_run", resourceId: run.id, metadata: toMeta({ triggerType }) });
        return { run, candidates: [] };
      }
    }
    run = await prisma.livingLoopRun.create({ data: { status: "STARTED", triggerType, startedAt: new Date() } });
    await auditLog({ userId, action: "living_loop_run_started", resourceType: "living_loop_run", resourceId: run.id, metadata: toMeta({ triggerType }) });
    const minConfidence = await getNumberSetting("LIVING_LOOP_MIN_CONFIDENCE", 70);
    const maxCandidatesPerRun = await getNumberSetting("LIVING_LOOP_MAX_CANDIDATES_PER_RUN", 10);
    const maxDailyCandidates = await getNumberSetting("LIVING_LOOP_MAX_DAILY_CANDIDATES", 50);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.automationCandidate.count({ where: { createdAt: { gte: today } } });
    if (todayCount >= maxDailyCandidates) {
      run = await prisma.livingLoopRun.update({ where: { id: run.id }, data: { status: "SKIPPED", completedAt: new Date(), summary: "Daily candidate limit reached", skippedReasons: ["Daily limit reached"] as Prisma.InputJsonValue } });
      return { run, candidates: [] };
    }
    const observation = await observeKingdomState();
    const observedCounts = { workOrdersNeedingReview: observation.workOrdersNeedingReview.length, staleWorkOrders: observation.staleWorkOrders.length, failedJobs: observation.failedJobs.length, needsReviewJobs: observation.needsReviewJobs.length, staleJobs: observation.staleJobs.length, patchesPendingReview: observation.patchesPendingReview.length, staleRunners: observation.staleRunners.length, providerIssues: observation.providerIssues.length, staleInboxItems: observation.staleInboxItems.length, mattersAwaitingDecision: observation.mattersAwaitingDecision.length, reportsWithRemainingWork: observation.reportsWithRemainingWork.length };
    await prisma.livingLoopRun.update({ where: { id: run.id }, data: { observedCounts: observedCounts as Prisma.InputJsonValue } });
    const candidates = await proposeAutomationCandidates(observation, { minConfidence, maxCandidatesPerRun, maxDailyCandidates, todayCount });
    const createdCandidates: AutomationCandidate[] = [];
    let skippedCount = 0;
    for (const candidate of candidates) {
      if (createdCandidates.length >= maxCandidatesPerRun) { skipReasons.push("Max per run reached"); break; }
      const result = await createCandidate(candidate, run.id, minConfidence, skipReasons);
      if (result) createdCandidates.push(result); else skippedCount++;
    }
    await summarizeLivingLoopRun(run.id);
    run = await prisma.livingLoopRun.update({ where: { id: run.id }, data: { skippedCandidates: skippedCount, skippedReasons: skipReasons as Prisma.InputJsonValue } });
    await auditLog({ userId, action: "living_loop_run_completed", resourceType: "living_loop_run", resourceId: run.id, metadata: toMeta({ triggerType, proposedCandidates: createdCandidates.length, skippedCandidates: skippedCount }) });
    return { run, candidates: createdCandidates };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    try { if (run) await prisma.livingLoopRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: msg } }); } catch { /* ignore */ }
    await auditLog({ userId, action: "living_loop_run_failed", resourceType: "living_loop_run", resourceId: run?.id, metadata: toMeta({ triggerType, error: msg }) });
    throw error;
  }
}

export async function observeKingdomState(): Promise<Observation> {
  const now = new Date();
  const staleWODate = new Date(now.getTime() - STALE_WORK_ORDER_HOURS * 3600000);
  const staleJobDate = new Date(now.getTime() - STALE_JOB_MINUTES * 60000);
  const staleRunnerDate = new Date(now.getTime() - STALE_RUNNER_HOURS * 3600000);
  const staleInboxDate = new Date(now.getTime() - STALE_INBOX_HOURS * 3600000);
  const staleReportDate = new Date(now.getTime() - STALE_REPORT_DAYS * 86400000);
  const [workOrdersNeedingReview, staleWorkOrders, failedJobs, needsReviewJobs, staleJobs, patchesPendingReview, staleRunners, staleInboxItems, mattersAwaitingDecision, reportsWithRemainingWork] = await Promise.all([
    prisma.workOrder.findMany({ where: { status: "NEEDS_REVIEW" }, select: { id: true, title: true, status: true, priority: true, projectId: true, assignedAgentId: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.workOrder.findMany({ where: { status: "IN_PROGRESS", updatedAt: { lt: staleWODate } }, select: { id: true, title: true, status: true, priority: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 10 }),
    prisma.automationJob.findMany({ where: { status: "FAILED" }, select: { id: true, status: true, mode: true, workOrderId: true, projectId: true, agentId: true, runnerId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.automationJob.findMany({ where: { status: "NEEDS_REVIEW" }, select: { id: true, status: true, mode: true, workOrderId: true, projectId: true, agentId: true, runnerId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.automationJob.findMany({ where: { status: "RUNNING", startedAt: { lt: staleJobDate } }, select: { id: true, status: true, mode: true, workOrderId: true, projectId: true, runnerId: true, startedAt: true, createdAt: true }, orderBy: { startedAt: "asc" }, take: 10 }),
    prisma.patchArtifact.findMany({ where: { OR: [{ validationStatus: "PENDING" }, { riskLevel: { in: ["HIGH", "CRITICAL"] } }] }, select: { id: true, title: true, summary: true, riskLevel: true, validationStatus: true, workOrderId: true, projectId: true, automationJobId: true, createdAt: true }, orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }], take: 20 }),
    prisma.agentRunner.findMany({ where: { OR: [{ status: "OFFLINE" }, { status: "ERROR" }, { lastHeartbeatAt: { lt: staleRunnerDate } }] }, select: { id: true, name: true, status: true, lastHeartbeatAt: true, createdAt: true }, orderBy: { lastHeartbeatAt: "asc" }, take: 20 }),
    prisma.projectInboxItem.findMany({ where: { status: "PENDING", createdAt: { lt: staleInboxDate } }, select: { id: true, title: true, sourceType: true, sourceId: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 20 }),
    prisma.matter.findMany({ where: { status: "AWAITING_ROYAL_DECISION" }, select: { id: true, title: true, category: true, priority: true, createdAt: true }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 20 }),
    prisma.implementationReport.findMany({ where: { remainingWork: { isEmpty: false }, createdAt: { lt: staleReportDate } }, select: { id: true, summary: true, workOrderId: true, decisionsMade: true, remainingWork: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 })
  ]);
  let providerIssues: Array<{ providerName: string; providerId: string | null; errorCount: number; sampleErrors: string[] }> = [];
  try {
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const recentErrors = await prisma.aIUsageTrace.findMany({ where: { status: { in: ["ERROR", "TIMEOUT", "FAILED"] }, updatedAt: { gte: oneHourAgo } }, select: { providerName: true, providerId: true, errorMessage: true }, take: 100 });
    const m = new Map<string, { providerName: string; providerId: string | null; errorCount: number; sampleErrors: string[] }>();
    for (const e of recentErrors) {
      const k = e.providerName ?? e.providerId ?? "unknown";
      if (!m.has(k)) m.set(k, { providerName: k, providerId: e.providerId, errorCount: 0, sampleErrors: [] });
      const entry = m.get(k)!; entry.errorCount++;
      if (entry.sampleErrors.length < 3 && e.errorMessage) entry.sampleErrors.push(e.errorMessage.slice(0, 200));
    }
    providerIssues = Array.from(m.values()).filter(p => p.errorCount >= 3);
  } catch { /* best-effort */ }
  return { workOrdersNeedingReview, staleWorkOrders, failedJobs, needsReviewJobs, staleJobs, patchesPendingReview, staleRunners, providerIssues, staleInboxItems, mattersAwaitingDecision, reportsWithRemainingWork };
}

export async function proposeAutomationCandidates(obs: Observation, settings: { minConfidence: number; maxCandidatesPerRun: number; maxDailyCandidates: number; todayCount: number }): Promise<CandidateInput[]> {
  const cands: CandidateInput[] = [];
  const now = new Date();
  const push = (c: CandidateInput) => { if (cands.length < settings.maxCandidatesPerRun) cands.push(c); };
  for (const p of obs.patchesPendingReview) { push({ kind: "PATCH_REVIEW", title: `Patch Review: ${p.title}`, summary: (p.summary ?? "").slice(0, 500), reason: p.validationStatus === "PENDING" ? "Patch pending King review." : `Patch has ${p.riskLevel} risk.`, confidence: p.riskLevel === "CRITICAL" ? 95 : p.riskLevel === "HIGH" ? 85 : 75, priority: p.riskLevel === "CRITICAL" ? "CRITICAL" : p.riskLevel === "HIGH" ? "HIGH" : "MEDIUM", riskLevel: p.riskLevel === "CRITICAL" ? "CRITICAL" : p.riskLevel === "HIGH" ? "HIGH" : "MEDIUM", sourceType: "PatchArtifact", sourceId: p.id, projectId: p.projectId, workOrderId: p.workOrderId, automationJobId: p.automationJobId, proposedAction: { action: "review_patch", targetId: p.id, options: ["approve", "reject", "request_revision"] }, provenance: { source: "PatchArtifact", id: p.id, kind: "PATCH_REVIEW", observedAt: now.toISOString(), riskLevel: p.riskLevel } }); }
  for (const r of obs.staleRunners) { push({ kind: "RUNNER_REVIEW", title: `Runner Offline: ${r.name}`, summary: `Runner is ${r.status}.`, reason: r.status === "ERROR" ? "Runner in ERROR state." : "Runner not heartbeating.", confidence: r.status === "ERROR" ? 90 : 75, priority: r.status === "ERROR" ? "HIGH" : "MEDIUM", riskLevel: r.status === "ERROR" ? "HIGH" : "MEDIUM", sourceType: "AgentRunner", sourceId: r.id, proposedAction: { action: "inspect_runner", targetId: r.id, options: ["inspect", "restart_service"] }, provenance: { source: "AgentRunner", id: r.id, kind: "RUNNER_REVIEW", observedAt: now.toISOString(), status: r.status } }); }
  for (const i of obs.providerIssues) { push({ kind: "PROVIDER_REVIEW", title: `Provider Issues: ${i.providerName}`, summary: `${i.errorCount} recent errors.`, reason: `Provider reliability: ${i.errorCount} errors in last hour.`, confidence: Math.min(95, 70 + i.errorCount * 5), priority: i.errorCount >= 10 ? "HIGH" : "MEDIUM", riskLevel: i.errorCount >= 10 ? "HIGH" : "MEDIUM", sourceType: "AIProvider", sourceId: i.providerId ?? i.providerName, proposedAction: { action: "review_provider", targetId: i.providerId ?? i.providerName, options: ["review_settings", "create_work_order"] }, provenance: { source: "AIUsageTrace", kind: "PROVIDER_REVIEW", observedAt: now.toISOString(), errorCount: i.errorCount } }); }
  for (const w of obs.workOrdersNeedingReview) { push({ kind: "WORK_ORDER_REVIEW", title: `Work Order Review: ${w.title}`, summary: "Work order needs King review.", reason: "Work order is in NEEDS_REVIEW.", confidence: 80, priority: w.priority === "CRITICAL" || w.priority === "HIGH" ? w.priority : "MEDIUM", riskLevel: "MEDIUM", sourceType: "WorkOrder", sourceId: w.id, projectId: w.projectId, agentId: w.assignedAgentId, workOrderId: w.id, proposedAction: { action: "review_work_order", targetId: w.id, options: ["approve_completion", "request_revision"] }, provenance: { source: "WorkOrder", id: w.id, kind: "WORK_ORDER_REVIEW", observedAt: now.toISOString(), status: w.status } }); }
  for (const w of obs.workOrdersNeedingReview) { if (!w.projectId) push({ kind: "PROJECT_REVIEW", title: `Missing Project: ${w.title}`, summary: "Work order has no project.", reason: "Missing project context.", confidence: 65, priority: "LOW", riskLevel: "LOW", sourceType: "WorkOrder", sourceId: w.id, workOrderId: w.id, proposedAction: { action: "assign_project", targetId: w.id, options: ["assign_to_project", "archive"] }, provenance: { source: "WorkOrder", id: w.id, kind: "PROJECT_REVIEW", observedAt: now.toISOString() } }); }
  for (const r of obs.reportsWithRemainingWork) { if (r.decisionsMade.length > 0) push({ kind: "MEMORY_REVIEW", title: `Memory: ${(r.decisionsMade[0] ?? "Knowledge").slice(0, 80)}`, summary: `Report has ${r.decisionsMade.length} decisions.`, reason: "Decisions worth preserving.", confidence: 70, priority: "LOW", riskLevel: "LOW", sourceType: "ImplementationReport", sourceId: r.id, workOrderId: r.workOrderId, proposedAction: { action: "create_memory_candidate", targetId: r.id, decisionsCount: r.decisionsMade.length, options: ["review", "dismiss"] }, provenance: { source: "ImplementationReport", id: r.id, kind: "MEMORY_REVIEW", observedAt: now.toISOString(), decisionsCount: r.decisionsMade.length } }); }
  for (const i of obs.staleInboxItems) { push({ kind: "CLEANUP_REVIEW", title: `Stale Inbox: ${i.title}`, summary: `Pending since ${i.createdAt.toISOString().split("T")[0]}.`, reason: "Pending over 24h.", confidence: 60, priority: "LOW", riskLevel: "LOW", sourceType: "ProjectInboxItem", sourceId: i.id, proposedAction: { action: "archive_target", targetId: i.id, options: ["archive", "dismiss"] }, provenance: { source: "ProjectInboxItem", id: i.id, kind: "CLEANUP_REVIEW", observedAt: now.toISOString() } }); }
  return cands;
}

export async function dedupeCandidate(c: { sourceType: string; sourceId: string; kind: string }): Promise<boolean> {
  const existing = await prisma.automationCandidate.findFirst({ where: { sourceType: c.sourceType, sourceId: c.sourceId, kind: c.kind as AutomationCandidateKind, status: { in: ["PENDING", "APPROVED"] } } });
  return existing !== null;
}

export function dataValueGate(c: { title: string; summary: string; reason: string; proposedAction: unknown; confidence: number }, minConfidence: number, skipReasons: string[]): boolean {
  if (c.confidence < minConfidence) { skipReasons.push(`Low confidence: ${c.confidence}`); return false; }
  if (!c.title || c.title.trim().length < 5) { skipReasons.push("Generic title"); return false; }
  if (!c.summary || c.summary.trim().length < 10) { skipReasons.push("Generic summary"); return false; }
  if (!c.reason || c.reason.trim().length < 10) { skipReasons.push("Generic reason"); return false; }
  for (const p of [/no action needed/i, /everything is fine/i, /nothing to do/i, /all clear/i]) { if (p.test(`${c.title} ${c.summary} ${c.reason}`)) { skipReasons.push("Generic pattern"); return false; } }
  if (!c.proposedAction || typeof c.proposedAction !== "object") { skipReasons.push("Missing proposed action"); return false; }
  return true;
}

export async function createCandidate(candidate: CandidateInput, loopRunId: string, minConfidence: number, skipReasons: string[]): Promise<AutomationCandidate | null> {
  if (!dataValueGate(candidate, minConfidence, skipReasons)) {
    await auditLog({ userId: null, action: "automation_candidate_skipped", resourceType: "automation_candidate", resourceId: null, metadata: toMeta({ kind: candidate.kind, sourceType: candidate.sourceType, sourceId: candidate.sourceId, confidence: candidate.confidence, reason: skipReasons[skipReasons.length - 1], loopRunId }) });
    return null;
  }
  if (await dedupeCandidate(candidate)) {
    skipReasons.push(`Duplicate: ${candidate.sourceType}/${candidate.sourceId}/${candidate.kind}`);
    await auditLog({ userId: null, action: "automation_candidate_skipped", resourceType: "automation_candidate", resourceId: null, metadata: toMeta({ kind: candidate.kind, sourceType: candidate.sourceType, sourceId: candidate.sourceId, confidence: candidate.confidence, reason: "duplicate", loopRunId }) });
    return null;
  }
  const created = await prisma.automationCandidate.create({ data: { kind: candidate.kind, title: candidate.title, summary: candidate.summary, reason: candidate.reason, confidence: candidate.confidence, priority: candidate.priority, riskLevel: candidate.riskLevel, sourceType: candidate.sourceType, sourceId: candidate.sourceId, projectId: candidate.projectId ?? null, agentId: candidate.agentId ?? null, workOrderId: candidate.workOrderId ?? null, automationJobId: candidate.automationJobId ?? null, patchArtifactId: candidate.patchArtifactId ?? null, proposedAction: candidate.proposedAction, provenance: candidate.provenance, dataQuality: candidate.dataQuality ?? "REVIEW_REQUIRED", status: "PENDING", loopRunId } });
  await auditLog({ userId: null, action: "automation_candidate_created", resourceType: "automation_candidate", resourceId: created.id, metadata: toMeta({ kind: created.kind, sourceType: created.sourceType, sourceId: created.sourceId, confidence: created.confidence, loopRunId }) });
  return created;
}

export async function summarizeLivingLoopRun(runId: string): Promise<void> {
  const [candidates, run] = await Promise.all([prisma.automationCandidate.findMany({ where: { loopRunId: runId }, select: { id: true, kind: true, status: true } }), prisma.livingLoopRun.findUnique({ where: { id: runId } })]);
  if (!run) return;
  const proposed = candidates.filter(c => c.status === "PENDING" || c.status === "APPROVED").length;
  const kinds = new Set(candidates.map(c => c.kind)).size;
  await prisma.livingLoopRun.update({ where: { id: runId }, data: { summary: `Proposed ${proposed} candidates across ${kinds} kinds.`, completedAt: new Date(), status: "COMPLETED", proposedCandidates: proposed } });
}

export async function getLivingLoopStatus(): Promise<{ enabled: boolean; lastRun: LivingLoopRun | null; lastResult: string | null; todayCandidates: number; pendingCandidates: number; highCriticalCandidates: number; runnerIssues: number; providerIssues: number }> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [enabled, lastRun, todayCandidates, pendingCandidates, highCriticalCandidates] = await Promise.all([getBooleanSetting("LIVING_LOOP_ENABLED", false), prisma.livingLoopRun.findFirst({ orderBy: { createdAt: "desc" } }), prisma.automationCandidate.count({ where: { createdAt: { gte: today } } }), prisma.automationCandidate.count({ where: { status: "PENDING" } }), prisma.automationCandidate.count({ where: { status: "PENDING", priority: { in: ["HIGH", "CRITICAL"] } } })]);
  const [runnerIssues, providerIssues] = await Promise.all([prisma.automationCandidate.count({ where: { kind: "RUNNER_REVIEW", status: "PENDING" } }), prisma.automationCandidate.count({ where: { kind: "PROVIDER_REVIEW", status: "PENDING" } })]);
  return { enabled, lastRun, lastResult: lastRun?.status ?? null, todayCandidates, pendingCandidates, highCriticalCandidates, runnerIssues, providerIssues };
}

export async function listLivingLoopRuns(limit = 20): Promise<LivingLoopRun[]> {
  return prisma.livingLoopRun.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(limit, 100) });
}

export async function getAutomationCandidates(params: { status?: string; kind?: string; limit?: number; offset?: number }): Promise<{ candidates: AutomationCandidate[]; total: number }> {
  const where: Prisma.AutomationCandidateWhereInput = {};
  if (params.status) where.status = params.status as any;
  if (params.kind) where.kind = params.kind as any;
  const [candidates, total] = await Promise.all([prisma.automationCandidate.findMany({ where, orderBy: [{ priority: "desc" }, { confidence: "desc" }, { createdAt: "desc" }], take: Math.min(params.limit ?? 50, 100), skip: params.offset ?? 0 }), prisma.automationCandidate.count({ where })]);
  return { candidates, total };
}

export async function approveCandidate(id: string, userId: string): Promise<AutomationCandidate> {
  const c = await prisma.automationCandidate.findUniqueOrThrow({ where: { id } });
  if (c.status !== "PENDING") throw new Error(`Already ${c.status}`);
  const u = await prisma.automationCandidate.update({ where: { id }, data: { status: "APPROVED", reviewedByUserId: userId, reviewedAt: new Date() } });
  await auditLog({ userId, action: "automation_candidate_approved", resourceType: "automation_candidate", resourceId: id, metadata: toMeta({ kind: u.kind, sourceType: u.sourceType, sourceId: u.sourceId }) });
  return u;
}

export async function rejectCandidate(id: string, userId: string): Promise<AutomationCandidate> {
  const c = await prisma.automationCandidate.findUniqueOrThrow({ where: { id } });
  if (c.status !== "PENDING") throw new Error(`Already ${c.status}`);
  const u = await prisma.automationCandidate.update({ where: { id }, data: { status: "REJECTED", reviewedByUserId: userId, reviewedAt: new Date() } });
  await auditLog({ userId, action: "automation_candidate_rejected", resourceType: "automation_candidate", resourceId: id, metadata: toMeta({ kind: u.kind, sourceType: u.sourceType, sourceId: u.sourceId }) });
  return u;
}

export async function archiveCandidate(id: string, userId: string): Promise<AutomationCandidate> {
  const c = await prisma.automationCandidate.findUniqueOrThrow({ where: { id } });
  if (c.status === "ARCHIVED") throw new Error("Already archived");
  const u = await prisma.automationCandidate.update({ where: { id }, data: { status: "ARCHIVED", reviewedByUserId: userId, reviewedAt: new Date() } });
  await auditLog({ userId, action: "automation_candidate_archived", resourceType: "automation_candidate", resourceId: id, metadata: toMeta({ kind: u.kind, sourceType: u.sourceType, sourceId: u.sourceId }) });
  return u;
}

export async function applyCandidate(id: string, userId: string): Promise<AutomationCandidate> {
  const c = await prisma.automationCandidate.findUniqueOrThrow({ where: { id } });
  if (c.status !== "APPROVED") throw new Error(`Must be APPROVED. Current: ${c.status}`);
  switch (c.kind) {
    case "RUNNER_REVIEW": await prisma.notice.create({ data: { title: `Runner: ${c.title}`, content: c.reason, severity: "WARNING", sourceType: c.sourceType, sourceId: c.sourceId, createdBySystem: true, provenance: c.provenance as Prisma.InputJsonValue } }); break;
    case "PROVIDER_REVIEW": await prisma.notice.create({ data: { title: `Provider: ${c.title}`, content: c.reason, severity: "WARNING", sourceType: c.sourceType, sourceId: c.sourceId, createdBySystem: true, provenance: c.provenance as Prisma.InputJsonValue } }); break;
    case "MEMORY_REVIEW": { const r = await prisma.implementationReport.findUnique({ where: { id: c.sourceId } }); if (r && r.decisionsMade.length > 0) { await prisma.agentKnowledgeCandidate.create({ data: { agentId: "__system__", projectId: c.projectId, sourceType: "ImplementationReport", sourceId: c.sourceId, title: c.title, content: r.decisionsMade.join("\n"), summary: c.summary, category: "UNKNOWN", confidence: c.confidence, status: "PENDING", metadata: toMeta({ provenance: c.provenance, createdFrom: "living_loop" }) } }); } break; }
    case "CLEANUP_REVIEW": if (c.sourceType === "ProjectInboxItem") await prisma.projectInboxItem.update({ where: { id: c.sourceId }, data: { status: "ARCHIVED" } }); else if (c.sourceType === "WorkOrder") await prisma.workOrder.update({ where: { id: c.sourceId }, data: { status: "ARCHIVED", archiveReason: "Cleanup via living loop", archivedAt: new Date() } }); break;
    default: break;
  }
  const u = await prisma.automationCandidate.update({ where: { id }, data: { status: "APPLIED", reviewedByUserId: userId, reviewedAt: new Date() } });
  await auditLog({ userId, action: "automation_candidate_applied", resourceType: "automation_candidate", resourceId: id, metadata: toMeta({ kind: u.kind, sourceType: u.sourceType, sourceId: u.sourceId }) });
  return u;
}
