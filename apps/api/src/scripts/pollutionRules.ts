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
export type MarkedRecord = { id: string; title: string };
export type SuspiciousUser = { id: string; email: string; createdAt: Date; reason: string };
export type SuspiciousAgent = { id: string; slug: string; title: string; createdAt: Date; reason: string };
export type SuspiciousRecord = { id: string; title: string; createdAt: Date; reason: string };

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
    prisma.matter.findMany({ where: { isTestData: true }, select: { id: true, title: true } }),
    prisma.notice.findMany({ where: { isTestData: true }, select: { id: true, title: true } }),
    prisma.projectInboxItem.findMany({ where: { isTestData: true }, select: { id: true, title: true } }),
    prisma.artifact.findMany({ where: { isTestData: true }, select: { id: true, title: true } })
  ]);
  return { users, agents, matters, notices, inboxItems, artifacts };
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
  const [rawUsers, rawAgents, rawMatters, rawNotices] = await Promise.all([
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
        isTestData: false,
        OR: [
          { title: { startsWith: "Test Matter" } },
          { title: { contains: "test", mode: "insensitive" as const } }
        ]
      },
      select: { id: true, title: true, createdAt: true }
    }),
    prisma.notice.findMany({
      where: {
        isTestData: false,
        OR: [
          { title: { startsWith: "Test Notice" } },
          { title: { contains: "test", mode: "insensitive" as const } }
        ]
      },
      select: { id: true, title: true, createdAt: true }
    })
  ]);

  return {
    users: rawUsers.map((u) => ({ ...u, reason: emailReason(u.email) })),
    agents: rawAgents.map((a) => ({ ...a, reason: slugReason(a.slug) })),
    matters: rawMatters.map((m) => ({ ...m, reason: titleReason(m.title, "Test Matter") })),
    notices: rawNotices.map((n) => ({ ...n, reason: titleReason(n.title, "Test Notice") }))
  };
}
