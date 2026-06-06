import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export async function auditLog(input: {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? undefined
    }
  });
}

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "tokenhash",
  "refreshtoken",
  "accesstoken",
  "apikey",
  "secret",
  "credential",
  "authorization",
  "bearer"
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

export function sanitizeMetadata(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!isSensitiveKey(k)) {
      result[k] = sanitizeMetadata(v);
    }
  }
  return result;
}

export type AuditLogEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: Date;
  user: { id: string; email: string; displayName: string; role: string } | null;
};

type ListParams = {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
};

const USER_SELECT = { id: true, email: true, displayName: true, role: true } as const;

function buildWhere(params: ListParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (params.action) where.action = params.action;
  if (params.resourceType) where.resourceType = params.resourceType;
  if (params.userId) where.userId = params.userId;
  if (params.startDate || params.endDate) {
    where.createdAt = {};
    if (params.startDate) where.createdAt.gte = new Date(params.startDate);
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  return where;
}

function mapEntry(raw: {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  user: { id: string; email: string; displayName: string; role: string } | null;
}): AuditLogEntry {
  return {
    id: raw.id,
    action: raw.action,
    resourceType: raw.resourceType,
    resourceId: raw.resourceId,
    metadata: sanitizeMetadata(raw.metadata),
    createdAt: raw.createdAt,
    user: raw.user
  };
}

export async function listAuditLogs(params: ListParams = {}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const where = buildWhere(params);

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: USER_SELECT } }
    })
  ]);

  return { logs: rows.map(mapEntry), total };
}

export async function getAuditLogEntry(id: string): Promise<AuditLogEntry | null> {
  const row = await prisma.auditLog.findUnique({
    where: { id },
    include: { user: { select: USER_SELECT } }
  });
  return row ? mapEntry(row) : null;
}

export async function searchAuditLogs(q: string, params: Pick<ListParams, "page" | "limit"> = {}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
  const term = q.trim();
  if (!term) return listAuditLogs(params);

  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { action: { contains: term, mode: "insensitive" } },
      { resourceType: { contains: term, mode: "insensitive" } },
      { resourceId: { contains: term, mode: "insensitive" } },
      { user: { email: { contains: term, mode: "insensitive" } } }
    ]
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: USER_SELECT } }
    })
  ]);

  return { logs: rows.map(mapEntry), total };
}
