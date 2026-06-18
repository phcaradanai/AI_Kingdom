import type { MatterCategory, MatterPriority, MatterStatus, NoticeSeverity, NoticeStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getCharter, getVision } from "./charterService.js";
import {
  type DataQuality,
  classifyMatter,
  classifyNotice,
  enrichDataQuality,
  normalizeTitle,
  shouldIncludeByQuality
} from "./dataQualityService.js";
import { routeProjectForSource } from "./projectRoutingService.js";
import { getTreasuryOverview } from "./treasuryService.js";
import { evaluateRecordValue } from "./dataValueGateService.js";

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
  traceId?: string;
};

export async function createNotice(input: NoticeInput) {
  const sourceType = input.sourceType ?? null;
  const sourceId = input.sourceId ?? null;
  const sameSource = await prisma.notice.findMany({
    where: {
      sourceType,
      sourceId,
      severity: input.severity ?? "INFO"
    }
  });
  const existing = sameSource.find((notice) => normalizeTitle(notice.title) === normalizeTitle(input.title));
  if (existing) return existing;

  const createdBySystem = Boolean(input.sourceType || input.sourceId || input.createdByAgentId || input.traceId);

  // Apply M15H: Kingdom Data Value Gate
  const gateDecision = await evaluateRecordValue({
    recordType: "notice",
    origin: createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED",
    title: input.title,
    content: input.content,
    sourceType,
    sourceId,
    category: input.severity ?? "INFO",
    traceId: input.traceId
  });

  if (gateDecision.decision === "REJECT") {
    if (!createdBySystem) {
      throw new Error(gateDecision.reason);
    }
    return null;
  }

  const status = gateDecision.decision === "ARCHIVE" ? ("ARCHIVED" as NoticeStatus) : ("UNREAD" as NoticeStatus);

  const draft = { ...input, sourceType, sourceId, createdBySystem, dataSource: sourceType ?? undefined };
  const dataQuality = classifyNotice(draft);
  const notice = await prisma.notice.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      content: input.content,
      severity: input.severity ?? "INFO",
      status,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdByAgentId: input.createdByAgentId,
      dataSource: sourceType,
      dataQuality,
      traceId: input.traceId,
      createdBySystem,
      provenance: buildProvenance(input)
    }
  });
  if (notice && !input.projectId) {
    await routeProjectForSource({ title: notice.title, content: notice.content, sourceType: "NOTICE", sourceId: notice.id }).catch(() => undefined);
  }
  return notice;
}

export type NoticeListParams = {
  severity?: NoticeSeverity;
  status?: NoticeStatus;
  includeTestData?: boolean;
  dataQuality?: DataQuality;
  page?: number;
  limit?: number;
};

export async function listNotices(params: NoticeListParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const where: Prisma.NoticeWhereInput = {
    ...(params.severity && { severity: params.severity }),
    ...(params.status && { status: params.status })
  };
  const rawNotices = await prisma.notice.findMany({
    where,
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }]
  });
  const filtered = rawNotices.filter((notice) => shouldIncludeByQuality(notice, classifyNotice(notice), params));
  const notices = await enrichDataQuality("notice", filtered.slice((page - 1) * limit, page * limit));
  return { notices, total: filtered.length, page, limit };
}

export async function getNotice(id: string) {
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) return null;
  return (await enrichDataQuality("notice", [notice]))[0];
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
  traceId?: string;
};

export async function createMatter(input: MatterInput) {
  const sourceType = input.sourceType ?? null;
  const sourceId = input.sourceId ?? null;
  const sameSource = await prisma.matter.findMany({
    where: {
      sourceType,
      sourceId,
      status: { notIn: TERMINAL_MATTER_STATUSES }
    }
  });
  const existing = sameSource.find((matter) => normalizeTitle(matter.title) === normalizeTitle(input.title));
  if (existing) return existing;

  const createdBySystem = Boolean(input.sourceType || input.sourceId || input.assignedAgentId || input.traceId);

  // Apply M15H: Kingdom Data Value Gate
  const gateDecision = await evaluateRecordValue({
    recordType: "matter",
    origin: createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED",
    title: input.title,
    content: input.description,
    sourceType,
    sourceId,
    category: input.category ?? "GENERAL",
    traceId: input.traceId
  });

  if (gateDecision.decision === "REJECT") {
    if (!createdBySystem) {
      throw new Error(gateDecision.reason);
    }
    return null;
  }

  const status = gateDecision.decision === "ARCHIVE" ? ("REJECTED" as MatterStatus) : ("DETECTED" as MatterStatus);

  const draft = { ...input, sourceType, sourceId, createdBySystem, dataSource: sourceType ?? undefined };
  const dataQuality = classifyMatter(draft);
  const matter = await prisma.matter.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status,
      priority: input.priority ?? "MEDIUM",
      category: input.category ?? "GENERAL",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      assignedAgentId: input.assignedAgentId,
      dataSource: sourceType,
      dataQuality,
      traceId: input.traceId,
      createdBySystem,
      provenance: buildProvenance(input)
    }
  });
  if (matter && !input.projectId) {
    await routeProjectForSource({ title: matter.title, content: matter.description, sourceType: "MATTER", sourceId: matter.id }).catch(() => undefined);
  }
  return matter;
}

export type MatterListParams = {
  status?: MatterStatus;
  priority?: MatterPriority;
  category?: MatterCategory;
  includeTestData?: boolean;
  dataQuality?: DataQuality;
  page?: number;
  limit?: number;
};

export async function listMatters(params: MatterListParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const where: Prisma.MatterWhereInput = {
    ...(params.status && { status: params.status }),
    ...(params.priority && { priority: params.priority }),
    ...(params.category && { category: params.category })
  };
  const rawMatters = await prisma.matter.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
  });
  const filtered = rawMatters.filter((matter) => shouldIncludeByQuality(matter, classifyMatter(matter), params));
  const matters = await enrichDataQuality("matter", filtered.slice((page - 1) * limit, page * limit));
  return { matters, total: filtered.length, page, limit };
}

export async function getMatter(id: string) {
  const matter = await prisma.matter.findUnique({ where: { id } });
  if (!matter) return null;
  return (await enrichDataQuality("matter", [matter]))[0];
}

export async function updateMatter(id: string, fields: Partial<{ status: MatterStatus; priority: MatterPriority; category: MatterCategory; title: string; description: string; assignedAgentId: string | null; projectId: string | null }>) {
  return prisma.matter.update({
    where: { id },
    data: {
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.category !== undefined && { category: fields.category }),
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.assignedAgentId !== undefined && { assignedAgentId: fields.assignedAgentId }),
      ...(fields.projectId !== undefined && { projectId: fields.projectId })
    }
  });
}

export async function deleteMatter(id: string) {
  return prisma.matter.delete({ where: { id } });
}

// ── Kingdom Inspection ──────────────────────────────────────────────────────────

export async function inspectKingdomStatus() {
  const [unreadCount, criticalCount, openMattersCount, criticalMattersCount, awaitingDecisionCount, failedTasksCount, workOrdersAwaitingReviewCount, budgetStatus] = await Promise.all([
    prisma.notice.count({ where: { isTestData: false, status: "UNREAD" } }),
    prisma.notice.count({ where: { isTestData: false, status: "UNREAD", severity: "CRITICAL" } }),
    prisma.matter.count({ where: { isTestData: false, status: { notIn: TERMINAL_MATTER_STATUSES } } }),
    prisma.matter.count({ where: { isTestData: false, priority: "CRITICAL", status: { notIn: TERMINAL_MATTER_STATUSES } } }),
    prisma.matter.count({ where: { isTestData: false, status: "AWAITING_ROYAL_DECISION" } }),
    prisma.task.count({ where: { status: "FAILED" } }),
    prisma.workOrder.count({ where: { isTestData: false, status: "NEEDS_REVIEW" } }),
    getTreasuryOverview().then((o) => o.budgetStatus).catch(() => null)
  ]);

  return {
    unreadNotices: unreadCount,
    criticalNotices: criticalCount,
    openMatters: openMattersCount,
    criticalMatters: criticalMattersCount,
    awaitingRoyalDecision: awaitingDecisionCount,
    failedTasks: failedTasksCount,
    workOrdersAwaitingReview: workOrdersAwaitingReviewCount,
    budgetWarning: budgetStatus ? (budgetStatus.dailyWarning || budgetStatus.monthlyWarning) : false
  };
}

function buildProvenance(input: {
  sourceType?: string | null;
  sourceId?: string | null;
  createdByAgentId?: string | null;
  assignedAgentId?: string | null;
  traceId?: string | null;
}) {
  const provenance = {
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    createdByAgentId: input.createdByAgentId ?? null,
    assignedAgentId: input.assignedAgentId ?? null,
    traceId: input.traceId ?? null
  };
  return Object.values(provenance).some(Boolean) ? provenance : undefined;
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
  if (status.workOrdersAwaitingReview > 0) {
    actions.push({ action: `${status.workOrdersAwaitingReview} work order${status.workOrdersAwaitingReview !== 1 ? "s" : ""} reported back — review and approve`, severity: "warning", href: "/work-orders" });
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

  const [urgentNotices, mattersList, awaitingList, recentAgentReports] = await Promise.all([
    prisma.notice.findMany({
      where: { isTestData: false, status: "UNREAD", severity: { in: ["CRITICAL", "WARNING"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5
    }),
    prisma.matter.findMany({
      where: { isTestData: false, status: { notIn: TERMINAL_MATTER_STATUSES } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    prisma.matter.findMany({
      where: { isTestData: false, status: "AWAITING_ROYAL_DECISION" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    // What external agents just delivered back into the Kingdom (dispatch + completion notices).
    prisma.notice.findMany({
      where: { isTestData: false, sourceType: { in: ["work-order-report", "work-order-dispatch"] } },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ]);

  return {
    kingdomStatus,
    urgentNotices,
    openMatters: mattersList,
    awaitingRoyalDecision: awaitingList,
    recentAgentReports,
    recommendedActions: buildRecommendedActions(kingdomStatus),
    charter: charter ? { mission: charter.mission } : null,
    vision: vision ? { content: vision.content } : null
  };
}
