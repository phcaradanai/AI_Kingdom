import { prisma } from "../db/prisma.js";
import type { NextActionItem, NextActionQueueDto } from "../types/api.js";

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function computeEscalationBonus(ageHours: number): number {
  return Math.min(25, Math.floor(ageHours / 12) * 4);
}

export function riskFromPriority(priority: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (priority >= 85) return "CRITICAL";
  if (priority >= 65) return "HIGH";
  if (priority >= 40) return "MEDIUM";
  return "LOW";
}

function ageHoursFrom(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

// ── WorkOrder row shape (exported for unit tests) ─────────────────────────────

export interface WorkOrderRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  contextBindingStatus: string;
  assignedExternalAgentId: string | null;
  updatedAt: Date;
  handoffBriefs: Array<{ id: string; createdAt: Date }>;
  workSessions: Array<{ id: string; createdAt: Date }>;
}

// ── WorkOrder mapper (exported for unit tests) ────────────────────────────────

export function mapWorkOrderToActions(wo: WorkOrderRow, now: string): NextActionItem[] {
  const items: NextActionItem[] = [];
  const age = ageHoursFrom(wo.updatedAt);
  const escalation = computeEscalationBonus(age);
  const isEscalated = escalation >= 16;

  if (wo.status === "NEEDS_REVIEW") {
    const baseScore =
      wo.priority === "CRITICAL" ? 90
      : wo.priority === "HIGH" ? 82
      : wo.priority === "LOW" ? 58
      : 65;
    const priority = Math.min(100, baseScore + escalation);
    items.push({
      id: `WorkOrder:${wo.id}`,
      entityType: "WorkOrder",
      entityId: wo.id,
      title: `Work order awaiting review: ${wo.title}`,
      actionLabel: "Review & Decide",
      why: `Work order is in NEEDS_REVIEW with priority ${wo.priority}.`,
      priority,
      riskLevel: riskFromPriority(priority),
      abstractState: "AWAITING_DECISION",
      isEscalated,
      isBlocking: 0,
      routeTo: "/work-orders",
      ageHours: age,
      provenance: { source: "WorkOrder", id: wo.id, observedAt: now }
    });
  }

  if (wo.status === "FAILED") {
    const priority = Math.min(100, 62 + escalation);
    items.push({
      id: `WorkOrder:${wo.id}`,
      entityType: "WorkOrder",
      entityId: wo.id,
      title: `Work order failed: ${wo.title}`,
      actionLabel: "Investigate Failure",
      why: "Work order failed. Review the failure reason and reassign or cancel.",
      priority,
      riskLevel: riskFromPriority(priority),
      abstractState: "BLOCKED",
      isEscalated,
      isBlocking: 0,
      routeTo: "/work-orders",
      ageHours: age,
      provenance: { source: "WorkOrder", id: wo.id, observedAt: now }
    });
  }

  if (wo.status === "READY") {
    if (!wo.assignedExternalAgentId) {
      const priority = Math.min(100, 50 + escalation);
      items.push({
        id: `WorkOrder:${wo.id}`,
        entityType: "WorkOrder",
        entityId: wo.id,
        title: `Work order ready — no agent assigned: ${wo.title}`,
        actionLabel: "Assign Agent",
        why: "Work order is READY but has no external agent assigned.",
        priority,
        riskLevel: riskFromPriority(priority),
        abstractState: "AWAITING_ACTION",
        isEscalated,
        isBlocking: 0,
        routeTo: "/work-orders",
        ageHours: age,
        provenance: { source: "WorkOrder", id: wo.id, observedAt: now }
      });
    } else if (wo.handoffBriefs.length === 0) {
      const priority = Math.min(100, 55 + escalation);
      items.push({
        id: `WorkOrder:${wo.id}`,
        entityType: "WorkOrder",
        entityId: wo.id,
        title: `Work order ready — create handoff: ${wo.title}`,
        actionLabel: "Create Handoff",
        why: "Work order has an agent assigned but no handoff brief.",
        priority,
        riskLevel: riskFromPriority(priority),
        abstractState: "AWAITING_ACTION",
        isEscalated,
        isBlocking: 0,
        routeTo: "/work-orders",
        ageHours: age,
        provenance: { source: "WorkOrder", id: wo.id, observedAt: now }
      });
    }
  }

  if (
    ["READY", "IN_PROGRESS"].includes(wo.status) &&
    ["STALE", "MISSING", "PARTIAL"].includes(wo.contextBindingStatus)
  ) {
    const priority = Math.min(100, 45 + escalation);
    items.push({
      id: `WorkOrder:ctx:${wo.id}`,
      entityType: "WorkOrder",
      entityId: wo.id,
      title: `Work order blocked by ${wo.contextBindingStatus} context: ${wo.title}`,
      actionLabel: "Bind Context",
      why: `Work order has ${wo.contextBindingStatus} context binding. Bind or refresh before patching.`,
      priority,
      riskLevel: riskFromPriority(priority),
      abstractState: "BLOCKED",
      isEscalated,
      isBlocking: 0,
      routeTo: "/work-orders",
      ageHours: age,
      provenance: { source: "WorkOrder", id: wo.id, observedAt: now }
    });
  }

  if (["READY", "IN_PROGRESS"].includes(wo.status) && wo.handoffBriefs.length > 0) {
    const latestHandoff = wo.handoffBriefs.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    const hasResponse = wo.workSessions.some(s => s.createdAt > latestHandoff.createdAt);
    if (!hasResponse) {
      const handoffAge = ageHoursFrom(latestHandoff.createdAt);
      const handoffEscalation = computeEscalationBonus(handoffAge);
      const priority = Math.min(100, 36 + handoffEscalation);
      items.push({
        id: `HandoffBrief:${latestHandoff.id}`,
        entityType: "HandoffBrief",
        entityId: latestHandoff.id,
        title: `Handoff awaiting agent response: ${wo.title}`,
        actionLabel: "Send Handoff",
        why: "A handoff brief was created but no response session exists yet.",
        priority,
        riskLevel: riskFromPriority(priority),
        abstractState: "AWAITING_ACTION",
        isEscalated: handoffEscalation >= 16,
        isBlocking: 0,
        routeTo: "/work-orders",
        ageHours: handoffAge,
        provenance: { source: "HandoffBrief", id: latestHandoff.id, observedAt: now }
      });
    }
  }

  return items;
}

// ── Main service ──────────────────────────────────────────────────────────────

export interface ComputeNextActionsOpts {
  limit?: number;
  entityTypes?: string[];
  minRisk?: string;
}

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export async function computeNextActions(opts: ComputeNextActionsOpts = {}): Promise<NextActionQueueDto> {
  const { limit = 20, entityTypes, minRisk } = opts;
  const now = new Date().toISOString();
  const items: NextActionItem[] = [];
  const wantEntity = (t: string) => !entityTypes || entityTypes.includes(t);

  const [workOrders, automationJobs, patchArtifacts, runners, pendingCandidateCount] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        status: { in: ["NEEDS_REVIEW", "FAILED", "READY", "IN_PROGRESS"] },
        isTestData: false
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        contextBindingStatus: true,
        assignedExternalAgentId: true,
        updatedAt: true,
        handoffBriefs: { select: { id: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        workSessions: { select: { id: true, createdAt: true }, orderBy: { createdAt: "desc" } }
      },
      take: 50
    }),
    prisma.automationJob.findMany({
      where: { status: { in: ["QUEUED", "NEEDS_REVIEW", "FAILED"] } },
      select: {
        id: true,
        status: true,
        mode: true,
        updatedAt: true,
        workOrder: { select: { title: true, isTestData: true } }
      },
      take: 50
    }),
    prisma.patchArtifact.findMany({
      where: {
        OR: [
          { validationStatus: "PENDING" },
          { riskLevel: { in: ["HIGH", "CRITICAL"] }, validationStatus: { not: "APPROVED" } }
        ]
      },
      select: {
        id: true,
        riskLevel: true,
        validationStatus: true,
        updatedAt: true,
        workOrder: { select: { title: true, isTestData: true } }
      },
      take: 30
    }),
    prisma.agentRunner.findMany({
      select: { id: true, name: true, status: true, lastHeartbeatAt: true, updatedAt: true }
    }),
    prisma.agentKnowledgeCandidate.count({ where: { status: "PENDING" } })
  ]);

  // WorkOrders (HandoffBrief items are derived from WO queries)
  if (wantEntity("WorkOrder") || wantEntity("HandoffBrief")) {
    for (const wo of workOrders) {
      for (const item of mapWorkOrderToActions(wo as WorkOrderRow, now)) {
        if (wantEntity(item.entityType)) items.push(item);
      }
    }
  }

  // AutomationJobs
  if (wantEntity("AutomationJob")) {
    for (const job of automationJobs) {
      if (job.workOrder.isTestData) continue;
      const age = ageHoursFrom(job.updatedAt);
      const escalation = computeEscalationBonus(age);
      const isEscalated = escalation >= 16;

      if (job.status === "QUEUED" && job.mode === "SANDBOX_PATCH") {
        const priority = Math.min(100, 78 + escalation);
        items.push({
          id: `AutomationJob:${job.id}`,
          entityType: "AutomationJob",
          entityId: job.id,
          title: `Sandbox patch job awaiting approval: ${job.workOrder.title}`,
          actionLabel: "Approve Job",
          why: "A SANDBOX_PATCH automation job is queued and requires King approval.",
          priority,
          riskLevel: riskFromPriority(priority),
          abstractState: "AWAITING_DECISION",
          isEscalated,
          isBlocking: 0,
          routeTo: "/automation-jobs",
          ageHours: age,
          provenance: { source: "AutomationJob", id: job.id, observedAt: now }
        });
      } else if (job.status === "NEEDS_REVIEW") {
        const priority = Math.min(100, 80 + escalation);
        items.push({
          id: `AutomationJob:${job.id}`,
          entityType: "AutomationJob",
          entityId: job.id,
          title: `Automation job needs review: ${job.workOrder.title}`,
          actionLabel: "Review Results",
          why: "Automation job completed with NEEDS_REVIEW status. Accept or reject.",
          priority,
          riskLevel: riskFromPriority(priority),
          abstractState: "AWAITING_DECISION",
          isEscalated,
          isBlocking: 0,
          routeTo: "/automation-jobs",
          ageHours: age,
          provenance: { source: "AutomationJob", id: job.id, observedAt: now }
        });
      } else if (job.status === "FAILED") {
        const baseScore = job.mode === "SANDBOX_PATCH" ? 95 : 70;
        const priority = Math.min(100, baseScore + escalation);
        items.push({
          id: `AutomationJob:${job.id}`,
          entityType: "AutomationJob",
          entityId: job.id,
          title: `Automation job failed: ${job.workOrder.title}`,
          actionLabel: "Investigate",
          why: `Automation job in ${job.mode} mode failed. Review the error and retry or cancel.`,
          priority,
          riskLevel: riskFromPriority(priority),
          abstractState: "BLOCKED",
          isEscalated,
          isBlocking: 0,
          routeTo: "/automation-jobs",
          ageHours: age,
          provenance: { source: "AutomationJob", id: job.id, observedAt: now }
        });
      }
    }
  }

  // PatchArtifacts
  if (wantEntity("PatchArtifact")) {
    for (const patch of patchArtifacts) {
      if (patch.workOrder?.isTestData) continue;
      const age = ageHoursFrom(patch.updatedAt);
      const escalation = computeEscalationBonus(age);
      const baseScore = ["HIGH", "CRITICAL"].includes(patch.riskLevel) ? 88 : 72;
      const priority = Math.min(100, baseScore + escalation);
      items.push({
        id: `PatchArtifact:${patch.id}`,
        entityType: "PatchArtifact",
        entityId: patch.id,
        title: `Patch needs review: ${patch.workOrder?.title ?? "Unknown"}`,
        actionLabel: "Review Patch",
        why: `Patch has ${patch.riskLevel} risk and validation status ${patch.validationStatus}.`,
        priority,
        riskLevel: riskFromPriority(priority),
        abstractState: "AWAITING_DECISION",
        isEscalated: escalation >= 16,
        isBlocking: 0,
        routeTo: "/automation-jobs",
        ageHours: age,
        provenance: { source: "PatchArtifact", id: patch.id, observedAt: now }
      });
    }
  }

  // AgentRunners
  if (wantEntity("AgentRunner")) {
    const STALE_THRESHOLD_HOURS = 1;
    for (const runner of runners) {
      const heartbeatAge = runner.lastHeartbeatAt ? ageHoursFrom(runner.lastHeartbeatAt) : Infinity;
      const isStale = heartbeatAge > STALE_THRESHOLD_HOURS;
      if (runner.status === "OFFLINE" || runner.status === "ERROR" || isStale) {
        const age = runner.lastHeartbeatAt
          ? ageHoursFrom(runner.lastHeartbeatAt)
          : ageHoursFrom(runner.updatedAt);
        const escalation = computeEscalationBonus(age);
        const priority = Math.min(100, 75 + escalation);
        const why =
          runner.status === "ERROR"
            ? "Runner reported an error state. Inspect the host and restart the runner service."
            : `Runner has not sent a heartbeat in ${Math.round(age)}h. Inspect and restart.`;
        items.push({
          id: `AgentRunner:${runner.id}`,
          entityType: "AgentRunner",
          entityId: runner.id,
          title: `Runner offline: ${runner.name}`,
          actionLabel: "Fix Runner",
          why,
          priority,
          riskLevel: riskFromPriority(priority),
          abstractState: "BLOCKED",
          isEscalated: escalation >= 16,
          isBlocking: 0,
          routeTo: "/automation-jobs",
          ageHours: age,
          provenance: { source: "AgentRunner", id: runner.id, observedAt: now }
        });
      }
    }
  }

  // AgentKnowledgeCandidates (batch item)
  if (wantEntity("AgentKnowledgeCandidate") && pendingCandidateCount > 0) {
    const baseScore = pendingCandidateCount >= 5 ? 45 : 38;
    items.push({
      id: "AgentKnowledgeCandidate:pending",
      entityType: "AgentKnowledgeCandidate",
      entityId: "pending",
      title: `${pendingCandidateCount} knowledge candidate(s) awaiting review`,
      actionLabel: "Review Knowledge",
      why: `Agents proposed ${pendingCandidateCount} knowledge candidate(s) requiring King review.`,
      priority: baseScore,
      riskLevel: "LOW",
      abstractState: "AWAITING_DECISION",
      isEscalated: false,
      isBlocking: 0,
      routeTo: "/knowledge-lab/candidates",
      ageHours: 0,
      provenance: { source: "AgentKnowledgeCandidate", id: "pending", observedAt: now }
    });
  }

  // Deduplicate by id, sort descending by priority
  const seen = new Set<string>();
  const unique: NextActionItem[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  unique.sort((a, b) => b.priority - a.priority);

  // Apply minRisk filter
  const minRiskOrder = minRisk ? (RISK_ORDER[minRisk.toUpperCase()] ?? 0) : 0;
  const filtered = minRiskOrder > 0 ? unique.filter(i => (RISK_ORDER[i.riskLevel] ?? 0) >= minRiskOrder) : unique;

  const queue = filtered.slice(0, Math.min(limit, 100));

  return {
    computedAt: now,
    topAction: queue[0] ?? null,
    queue,
    summary: {
      totalPending: filtered.length,
      criticalCount: filtered.filter(i => i.riskLevel === "CRITICAL").length,
      highCount: filtered.filter(i => i.riskLevel === "HIGH").length,
      blockedCount: filtered.filter(i => i.abstractState === "BLOCKED").length,
      escalatedCount: filtered.filter(i => i.isEscalated).length
    }
  };
}
