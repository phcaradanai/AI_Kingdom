import type { MatterCategory, MatterPriority, MatterStatus, NoticeSeverity, NoticeStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getCharter, getVision } from "./charterService.js";
import { routeProjectForSource } from "./projectRoutingService.js";
import { getTreasuryOverview } from "./treasuryService.js";

const TERMINAL_MATTER_STATUSES: MatterStatus[] = ["REJECTED", "COMPLETED"];

// ── Notice CRUD ────────────────────────────────────────────────────────────────

export type NoticeInput = {
  title: string;
  content: string;
  severity?: NoticeSeverity;
  sourceType?: string;
  sourceId?: string;
  createdByAgentId?: string;
  projectId?: string;
};

export async function createNotice(input: NoticeInput) {
  // Dedup: same title + severity in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.notice.findFirst({
    where: {
      title: input.title,
      severity: input.severity ?? "INFO",
      createdAt: { gte: since }
    }
  });
  if (existing) return existing;

  const notice = await prisma.notice.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      content: input.content,
      severity: input.severity ?? "INFO",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdByAgentId: input.createdByAgentId
    }
  });
  if (!input.projectId) {
    await routeProjectForSource({ title: notice.title, content: notice.content, sourceType: "NOTICE", sourceId: notice.id }).catch(() => undefined);
  }
  return notice;
}

export type NoticeListParams = {
  severity?: NoticeSeverity;
  status?: NoticeStatus;
  page?: number;
  limit?: number;
};

export async function listNotices(params: NoticeListParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const where = {
    ...(params.severity && { severity: params.severity }),
    ...(params.status && { status: params.status })
  };
  const [total, notices] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);
  return { notices, total, page, limit };
}

export async function getNotice(id: string) {
  return prisma.notice.findUnique({ where: { id } });
}

export async function updateNotice(id: string, fields: Partial<{ status: NoticeStatus; title: string; content: string; severity: NoticeSeverity }>) {
  return prisma.notice.update({
    where: { id },
    data: {
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.content !== undefined && { content: fields.content }),
      ...(fields.severity !== undefined && { severity: fields.severity })
    }
  });
}

export async function deleteNotice(id: string) {
  return prisma.notice.delete({ where: { id } });
}

// ── Matter CRUD ────────────────────────────────────────────────────────────────

export type MatterInput = {
  title: string;
  description: string;
  priority?: MatterPriority;
  category?: MatterCategory;
  sourceType?: string;
  sourceId?: string;
  assignedAgentId?: string;
  projectId?: string;
};

export async function createMatter(input: MatterInput) {
  // Dedup: same sourceType + sourceId in non-terminal status
  if (input.sourceType && input.sourceId) {
    const existing = await prisma.matter.findFirst({
      where: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: { notIn: TERMINAL_MATTER_STATUSES }
      }
    });
    if (existing) return existing;
  }

  const matter = await prisma.matter.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "MEDIUM",
      category: input.category ?? "GENERAL",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      assignedAgentId: input.assignedAgentId
    }
  });
  if (!input.projectId) {
    await routeProjectForSource({ title: matter.title, content: matter.description, sourceType: "MATTER", sourceId: matter.id }).catch(() => undefined);
  }
  return matter;
}

export type MatterListParams = {
  status?: MatterStatus;
  priority?: MatterPriority;
  category?: MatterCategory;
  page?: number;
  limit?: number;
};

export async function listMatters(params: MatterListParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const where = {
    ...(params.status && { status: params.status }),
    ...(params.priority && { priority: params.priority }),
    ...(params.category && { category: params.category })
  };
  const [total, matters] = await Promise.all([
    prisma.matter.count({ where }),
    prisma.matter.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);
  return { matters, total, page, limit };
}

export async function getMatter(id: string) {
  return prisma.matter.findUnique({ where: { id } });
}

export async function updateMatter(id: string, fields: Partial<{ status: MatterStatus; priority: MatterPriority; category: MatterCategory; title: string; description: string; assignedAgentId: string | null }>) {
  return prisma.matter.update({
    where: { id },
    data: {
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.category !== undefined && { category: fields.category }),
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.assignedAgentId !== undefined && { assignedAgentId: fields.assignedAgentId })
    }
  });
}

export async function deleteMatter(id: string) {
  return prisma.matter.delete({ where: { id } });
}

// ── Kingdom Inspection ──────────────────────────────────────────────────────────

export async function inspectKingdomStatus() {
  const [unreadCount, criticalCount, openMattersCount, criticalMattersCount, awaitingDecisionCount, failedTasksCount, budgetStatus] = await Promise.all([
    prisma.notice.count({ where: { status: "UNREAD" } }),
    prisma.notice.count({ where: { status: "UNREAD", severity: "CRITICAL" } }),
    prisma.matter.count({ where: { status: { notIn: TERMINAL_MATTER_STATUSES } } }),
    prisma.matter.count({ where: { priority: "CRITICAL", status: { notIn: TERMINAL_MATTER_STATUSES } } }),
    prisma.matter.count({ where: { status: "AWAITING_ROYAL_DECISION" } }),
    prisma.task.count({ where: { status: "FAILED" } }),
    getTreasuryOverview().then((o) => o.budgetStatus).catch(() => null)
  ]);

  return {
    unreadNotices: unreadCount,
    criticalNotices: criticalCount,
    openMatters: openMattersCount,
    criticalMatters: criticalMattersCount,
    awaitingRoyalDecision: awaitingDecisionCount,
    failedTasks: failedTasksCount,
    budgetWarning: budgetStatus ? (budgetStatus.dailyWarning || budgetStatus.monthlyWarning) : false
  };
}

type RecommendedAction = { action: string; severity: "info" | "warning" | "critical"; href?: string };

function buildRecommendedActions(status: Awaited<ReturnType<typeof inspectKingdomStatus>>): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  if (status.awaitingRoyalDecision > 0) {
    actions.push({ action: `${status.awaitingRoyalDecision} matter${status.awaitingRoyalDecision !== 1 ? "s" : ""} await royal decision`, severity: "critical", href: "/matters" });
  }
  if (status.criticalMatters > 0) {
    actions.push({ action: `Review ${status.criticalMatters} critical matter${status.criticalMatters !== 1 ? "s" : ""}`, severity: "critical", href: "/matters" });
  }
  if (status.criticalNotices > 0) {
    actions.push({ action: `Acknowledge ${status.criticalNotices} critical notice${status.criticalNotices !== 1 ? "s" : ""}`, severity: "critical", href: "/notices" });
  }
  if (status.budgetWarning) {
    actions.push({ action: "Budget limit reached — review treasury", severity: "warning", href: "/treasury" });
  }
  if (status.failedTasks > 0) {
    actions.push({ action: `Investigate ${status.failedTasks} failed decree${status.failedTasks !== 1 ? "s" : ""}`, severity: "warning", href: "/throne-room" });
  }
  if (status.unreadNotices > 0 && status.criticalNotices === 0) {
    actions.push({ action: `${status.unreadNotices} unread notice${status.unreadNotices !== 1 ? "s" : ""}`, severity: "info", href: "/notices" });
  }
  if (actions.length === 0) {
    actions.push({ action: "Kingdom is stable — no immediate action required", severity: "info" });
  }
  return actions;
}

export async function generateDailyBrief() {
  const [kingdomStatus, charter, vision] = await Promise.all([
    inspectKingdomStatus(),
    getCharter().catch(() => null),
    getVision().catch(() => null)
  ]);

  const [urgentNotices, mattersList, awaitingList] = await Promise.all([
    prisma.notice.findMany({
      where: { status: "UNREAD", severity: { in: ["CRITICAL", "WARNING"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5
    }),
    prisma.matter.findMany({
      where: { status: { notIn: TERMINAL_MATTER_STATUSES } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    prisma.matter.findMany({
      where: { status: "AWAITING_ROYAL_DECISION" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10
    })
  ]);

  return {
    kingdomStatus,
    urgentNotices,
    openMatters: mattersList,
    awaitingRoyalDecision: awaitingList,
    recommendedActions: buildRecommendedActions(kingdomStatus),
    charter: charter ? { mission: charter.mission } : null,
    vision: vision ? { content: vision.content } : null
  };
}
