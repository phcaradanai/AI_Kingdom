/**
 * Shared pollution detection rules used by both inspect-pollution and cleanup-test-data.
 * Functions accept a PrismaClient instance so callers can supply the right DB connection.
 */
import { PrismaClient } from "@prisma/client";

export const PROTECTED_EMAILS = ["king@aikingdom.local"];
export const PROTECTED_AGENT_SLUGS = [
  "grand-vizier", "royal-architect", "royal-general",
  "royal-researcher", "royal-treasurer"
];

// Prefix-based patterns only — never add "@aikingdom.local" (would catch canonical king).
export const SUSPICIOUS_EMAIL_PATTERNS = [
  "test-", "report-test-", "m13-", "m14-", "m15c-", "m7-",
  "la-", "sec-", "pws-", "tx-", "settings-", "treasury-",
  "audit-", "auth-test", "provider-test", "charter-test"
];

export const SUSPICIOUS_SLUG_PATTERNS = [
  "test-agent-", "report-agent-", "m15c-agent-", "m14-agent-",
  "la-agent-", "m7-agent-", "pws-agent-", "tx-agent-"
];

export type MarkedUser = { id: string; email: string };
export type MarkedAgent = { id: string; slug: string; title: string };
export type MarkedRecord = { id: string; title: string; sourceType?: string | null; sourceId?: string | null; createdAt?: Date; reason?: string };
export type SuspiciousUser = { id: string; email: string; createdAt: Date; reason: string };
export type SuspiciousAgent = { id: string; slug: string; title: string; createdAt: Date; reason: string };
export type SuspiciousRecord = { id: string; title: string; sourceType?: string | null; sourceId?: string | null; createdAt: Date; reason: string };

export interface MarkedTestData {
  users: MarkedUser[];
  agents: MarkedAgent[];
  matters: MarkedRecord[];
  notices: MarkedRecord[];
  inboxItems: MarkedRecord[];
  artifacts: MarkedRecord[];
}

export interface SuspiciousUnmarkedData {
  users: SuspiciousUser[];
  agents: SuspiciousAgent[];
  matters: SuspiciousRecord[];
  notices: SuspiciousRecord[];
  inboxItems: SuspiciousRecord[];
  artifacts: SuspiciousRecord[];
}

export async function findMarkedTestData(prisma: PrismaClient): Promise<MarkedTestData> {
  const [users, agents, matters, notices, inboxItems, artifacts] = await Promise.all([
    prisma.user.findMany({
      where: { isTestData: true, email: { notIn: PROTECTED_EMAILS } },
      select: { id: true, email: true }
    }),
    prisma.agent.findMany({
      where: { isTestData: true, slug: { notIn: PROTECTED_AGENT_SLUGS } },
      select: { id: true, slug: true, title: true }
    }),
    prisma.matter.findMany({ where: { isTestData: true }, select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true } }),
    prisma.notice.findMany({ where: { isTestData: true }, select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true } }),
    prisma.projectInboxItem.findMany({ where: { isTestData: true }, select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true } }),
    prisma.artifact.findMany({ where: { isTestData: true }, select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true } })
  ]);
  return {
    users,
    agents,
    matters: matters.map((record) => ({ ...record, reason: "isTestData=true" })),
    notices: notices.map((record) => ({ ...record, reason: "isTestData=true" })),
    inboxItems: inboxItems.map((record) => ({ ...record, reason: "isTestData=true" })),
    artifacts: artifacts.map((record) => ({ ...record, reason: "isTestData=true" }))
  };
}

function emailReason(email: string): string {
  const pattern = SUSPICIOUS_EMAIL_PATTERNS.find((p) => email.startsWith(p));
  return pattern ? `email starts with "${pattern}"` : "unknown";
}

function slugReason(slug: string): string {
  const pattern = SUSPICIOUS_SLUG_PATTERNS.find((p) => slug.startsWith(p));
  return pattern ? `slug starts with "${pattern}"` : "unknown";
}

function titleReason(title: string, defaultPrefix: string): string {
  if (title.startsWith(defaultPrefix)) return `title starts with "${defaultPrefix}"`;
  if (title.toLowerCase().includes("test")) return `title contains "test"`;
  return "unknown";
}

export async function findSuspiciousUnmarkedData(prisma: PrismaClient): Promise<SuspiciousUnmarkedData> {
  const [rawUsers, rawAgents, rawMatters, rawNotices, rawInboxItems, rawArtifacts] = await Promise.all([
    prisma.user.findMany({
      where: {
        isTestData: false,
        email: { notIn: PROTECTED_EMAILS },
        OR: SUSPICIOUS_EMAIL_PATTERNS.map((p) => ({ email: { startsWith: p } }))
      },
      select: { id: true, email: true, createdAt: true }
    }),
    prisma.agent.findMany({
      where: {
        isTestData: false,
        slug: { notIn: PROTECTED_AGENT_SLUGS },
        OR: SUSPICIOUS_SLUG_PATTERNS.map((p) => ({ slug: { startsWith: p } }))
      },
      select: { id: true, slug: true, title: true, createdAt: true }
    }),
    prisma.matter.findMany({
      where: {
        isTestData: false
      },
      select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true }
    }),
    prisma.notice.findMany({
      where: {
        isTestData: false
      },
      select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true }
    }),
    prisma.projectInboxItem.findMany({
      where: {
        isTestData: false,
        OR: [
          { title: { contains: "test", mode: "insensitive" as const } },
          { sourceType: { equals: "test", mode: "insensitive" as const } },
          { sourceId: { contains: "test", mode: "insensitive" as const } },
          { sourceType: "NOTICE", confidenceScore: { lte: 0 } },
          { confidenceScore: { lte: 0 } }
        ]
      },
      select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true, confidenceScore: true }
    }),
    prisma.artifact.findMany({
      where: {
        isTestData: false,
        OR: [
          { title: { contains: "Implementation Report: M13", mode: "insensitive" as const } },
          { title: { contains: "Implementation Report: M14", mode: "insensitive" as const } },
          { title: { contains: "report work test", mode: "insensitive" as const } },
          { title: { contains: "generated implementation-report", mode: "insensitive" as const } },
          { title: { contains: "generated implementation report", mode: "insensitive" as const } },
          { sourceType: { equals: "test", mode: "insensitive" as const } },
          { sourceId: { equals: "test", mode: "insensitive" as const } }
        ]
      },
      select: { id: true, title: true, sourceType: true, sourceId: true, createdAt: true }
    })
  ]);

  return {
    users: rawUsers.map((u) => ({ ...u, reason: emailReason(u.email) })),
    agents: rawAgents.map((a) => ({ ...a, reason: slugReason(a.slug) })),
    matters: rawMatters
      .filter((m) => suspiciousMatterReason(m) !== null)
      .map((m) => ({ ...m, reason: suspiciousMatterReason(m) ?? "unknown" })),
    notices: rawNotices
      .filter((n) => suspiciousNoticeReason(n) !== null)
      .map((n) => ({ ...n, reason: suspiciousNoticeReason(n) ?? "unknown" })),
    inboxItems: rawInboxItems
      .filter((i) => suspiciousInboxReason(i) !== null)
      .map((i) => ({ ...i, reason: suspiciousInboxReason(i) ?? "unknown" })),
    artifacts: rawArtifacts
      .filter((a) => suspiciousArtifactReason(a) !== null)
      .map((a) => ({ ...a, reason: suspiciousArtifactReason(a) ?? "unknown" }))
  };
}

function suspiciousMatterReason(record: { title: string; sourceType?: string | null; sourceId?: string | null }) {
  const title = record.title.toLowerCase();
  if (title.includes("test")) return titleReason(record.title, "Test Matter");
  if (title.includes("dup matter")) return `title contains "dup matter"`;
  if (title.includes("del test")) return `title contains "del test"`;
  if (title.includes("cp test")) return `title contains "cp test"`;
  if (hasGeneratedSuffix(record.title)) return "title has generated timestamp/id suffix";
  if (isSourceTest(record)) return "source is test";
  return null;
}

function suspiciousNoticeReason(record: { title: string; sourceType?: string | null; sourceId?: string | null }) {
  const title = record.title.toLowerCase();
  if (title.includes("test")) return titleReason(record.title, "Test Notice");
  if (title.includes("dup")) return `title contains "dup"`;
  if (title.includes("unread test")) return `title contains "unread test"`;
  if (title.includes("read test")) return `title contains "read test"`;
  if (hasGeneratedSuffix(record.title)) return "title has generated timestamp/id suffix";
  if (isSourceTest(record)) return "source is test";
  return null;
}

function suspiciousInboxReason(record: { title: string; sourceType?: string | null; sourceId?: string | null; confidenceScore?: number | null }) {
  if (record.title.toLowerCase().includes("test")) return `title contains "test"`;
  if (isSourceTest(record)) return "source is test";
  if (record.sourceType === "NOTICE" && (record.sourceId ?? "").toLowerCase() === "test") return "NOTICE with source test";
  if ((record.confidenceScore ?? 1) <= 0) return "confidence 0% generated review record";
  return null;
}

function suspiciousArtifactReason(record: { title: string; sourceType?: string | null; sourceId?: string | null }) {
  const title = record.title.toLowerCase();
  if (title.includes("implementation report: m13")) return `title contains "Implementation Report: M13"`;
  if (title.includes("implementation report: m14")) return `title contains "Implementation Report: M14"`;
  if (title.includes("report work test")) return `title contains "report work test"`;
  if (title.includes("generated implementation-report") || title.includes("generated implementation report")) return "generated implementation-report duplicate";
  if (isSourceTest(record)) return "source is test";
  return null;
}

function isSourceTest(record: { sourceType?: string | null; sourceId?: string | null }) {
  return [record.sourceType, record.sourceId].some((value) => value?.toLowerCase() === "test");
}

function hasGeneratedSuffix(title: string) {
  return /\b(cm[a-z0-9]{8,}|[0-9]{10,}|[0-9]{4}[0-9]{2}[0-9]{2}[t -]?[0-9]{4,})$/i.test(title.trim());
}
