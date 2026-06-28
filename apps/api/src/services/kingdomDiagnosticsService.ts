/**
 * Kingdom Self-Diagnostics Service (M25-A)
 *
 * Aggregates intelligence and health metrics that the Kingdom cannot derive from code alone:
 *   1. Council output quality trends (weekly averages, flag distribution)
 *   2. Decree mode auto-correction rates (how often ASK→BUILD/PLAN/RESEARCH)
 *   3. Continuity engine decisions (BLOCKED/STALE_CONTEXT event counts)
 *   4. Learning loop effectiveness (candidates, approved knowledge reuse)
 *   5. Cost/token trends per week
 *
 * All data is read-only — zero mutations, zero AI calls.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { computeReport, gather, type IntelligenceReport } from "../scripts/measure-intelligence.js";

export interface WeekBucket {
  week: string;
  sessionCount: number;
  avgQualityScore: number | null;
  highQuality: number;
  lowQuality: number;
  totalCostUSD: number;
  modeCorrectionCount: number;
}

export interface ModeCorrectionStats {
  total: number;
  rate: number;
  byCorrectedMode: Record<string, number>;
}

export interface ContinuityStats {
  total: number;
  byState: Record<string, number>;
  byTriggeredBy: Record<string, number>;
  recentEvents: Array<{
    id: string;
    workOrderId: string | null;
    triggeredBy: string;
    readinessState: string;
    reason: string;
    createdAt: Date;
  }>;
}

export interface CollaborationStats {
  total: number;
  rate: number;
  enabled: boolean;
}

export interface KingdomDiagnosticsReport {
  generatedAt: Date;
  windowDays: number | null;
  intelligence: IntelligenceReport;
  modeCorrection: ModeCorrectionStats;
  continuity: ContinuityStats;
  collaboration: CollaborationStats;
  weeklyTrend: WeekBucket[];
  settingsSnapshot: Record<string, string>;
}

// Returns collaboration protocol stats (M25-C). `collaboratingSessionCount` is the
// count of sessions where the sub-query fired (collaborationNotes not null).
export function buildCollaborationStats(
  collaboratingSessionCount: number,
  totalSessions: number,
  enabled: boolean
): CollaborationStats {
  return {
    total: collaboratingSessionCount,
    rate: totalSessions > 0 ? collaboratingSessionCount / totalSessions : 0,
    enabled,
  };
}

const INTELLIGENCE_SETTINGS = [
  "PLANNER_CROSS_TASK_LEARNING",
  "COUNCIL_CROSS_TASK_LEARNING",
  "AGENT_KNOWLEDGE_IN_CONTEXT",
  "CAPTURE_LESSONS_FROM_REVIEWS",
  "COUNCIL_PARALLEL_SPECIALISTS",
  "SUPERVISED_AUTO_RETRY_ENABLED",
  "ADAPTIVE_REASONING_ENABLED",
  "AI_MAX_TOKENS_AUTOGROW",
  "LIVING_LOOP_ENABLED",
] as const;

export function buildModeCorrectionStats(
  rows: Array<{ task: { mode: string } }>,
  totalDecrees: number
): ModeCorrectionStats {
  const byCorrectedMode: Record<string, number> = {};
  for (const row of rows) {
    byCorrectedMode[row.task.mode] = (byCorrectedMode[row.task.mode] ?? 0) + 1;
  }
  return {
    total: rows.length,
    rate: totalDecrees > 0 ? rows.length / totalDecrees : 0,
    byCorrectedMode
  };
}

export function buildContinuityStats(
  events: Array<{ id: string; workOrderId: string | null; triggeredBy: string; readinessState: string; reason: string; createdAt: Date }>
): ContinuityStats {
  const byState: Record<string, number> = {};
  const byTriggeredBy: Record<string, number> = {};
  for (const ev of events) {
    byState[ev.readinessState] = (byState[ev.readinessState] ?? 0) + 1;
    byTriggeredBy[ev.triggeredBy] = (byTriggeredBy[ev.triggeredBy] ?? 0) + 1;
  }
  return { total: events.length, byState, byTriggeredBy, recentEvents: events.slice(0, 10) };
}

export function getISOWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function computeDiagnosticsReport(
  sinceDays?: number
): Promise<KingdomDiagnosticsReport> {
  const since = sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : undefined;
  const where = since ? { createdAt: { gte: since } } : {};

  const [intelligenceInput, modeCorrectionRows, continuityRows, settingRows, collaborationRow] = await Promise.all([
    gather(sinceDays),
    prisma.councilSession.findMany({
      where: { ...where, originalMode: { not: null } },
      select: { originalMode: true, modeCorrectionReason: true, task: { select: { mode: true } } }
    }),
    prisma.continuityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, workOrderId: true, triggeredBy: true, readinessState: true, reason: true, createdAt: true }
    }),
    prisma.setting.findMany({
      where: { key: { in: [...INTELLIGENCE_SETTINGS, "COUNCIL_COLLABORATION_ENABLED"] } },
      select: { key: true, value: true }
    }),
    // Prisma 5: IS NOT NULL for a JSON column requires NOT + DbNull
    prisma.councilSession.count({
      where: { ...where, NOT: { collaborationNotes: { equals: Prisma.DbNull } } }
    })
  ]);

  const intelligence = computeReport(intelligenceInput);

  // Mode correction stats
  const modeCorrection = buildModeCorrectionStats(modeCorrectionRows, intelligence.decrees);

  // Continuity stats
  const continuity = buildContinuityStats(continuityRows);

  // Collaboration stats (M25-C)
  const collaborationEnabledStr = settingRows.find((s) => s.key === "COUNCIL_COLLABORATION_ENABLED")?.value ?? "false";
  const collaboration = buildCollaborationStats(
    collaborationRow,
    intelligence.decrees,
    collaborationEnabledStr === "true"
  );

  // Weekly trend: last 4 weeks of council sessions
  const weeklyTrend = await buildWeeklyTrend(since);

  // Settings snapshot
  const settingsSnapshot: Record<string, string> = {};
  for (const s of settingRows) settingsSnapshot[s.key] = s.value;
  for (const key of INTELLIGENCE_SETTINGS) {
    if (!(key in settingsSnapshot)) settingsSnapshot[key] = "false";
  }

  return {
    generatedAt: new Date(),
    windowDays: sinceDays ?? null,
    intelligence,
    modeCorrection,
    continuity,
    collaboration,
    weeklyTrend,
    settingsSnapshot
  };
}

async function buildWeeklyTrend(since?: Date): Promise<WeekBucket[]> {
  // Always cover at least 4 weeks regardless of the since filter
  const cutoff = since ?? new Date(Date.now() - 28 * 86_400_000);

  const sessions = await prisma.councilSession.findMany({
    where: { createdAt: { gte: cutoff } },
    select: {
      createdAt: true,
      qualityScore: true,
      originalMode: true,
      usageRecords: { select: { estimatedCostUSD: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const buckets = new Map<string, {
    sessionCount: number;
    scores: number[];
    highQuality: number;
    lowQuality: number;
    totalCostUSD: number;
    modeCorrectionCount: number;
  }>();

  for (const s of sessions) {
    const weekKey = getISOWeekLabel(s.createdAt);
    const b = buckets.get(weekKey) ?? {
      sessionCount: 0, scores: [], highQuality: 0, lowQuality: 0,
      totalCostUSD: 0, modeCorrectionCount: 0
    };
    b.sessionCount += 1;
    if (s.qualityScore !== null && s.qualityScore !== undefined) {
      b.scores.push(s.qualityScore);
      if (s.qualityScore >= 0.8) b.highQuality += 1;
      if (s.qualityScore < 0.5) b.lowQuality += 1;
    }
    b.totalCostUSD += s.usageRecords.reduce((sum, r) => sum + r.estimatedCostUSD, 0);
    if (s.originalMode !== null) b.modeCorrectionCount += 1;
    buckets.set(weekKey, b);
  }

  return [...buckets.entries()].map(([week, b]) => ({
    week,
    sessionCount: b.sessionCount,
    avgQualityScore: b.scores.length > 0
      ? Math.round((b.scores.reduce((s, v) => s + v, 0) / b.scores.length) * 100) / 100
      : null,
    highQuality: b.highQuality,
    lowQuality: b.lowQuality,
    totalCostUSD: Math.round(b.totalCostUSD * 1_000_000) / 1_000_000,
    modeCorrectionCount: b.modeCorrectionCount
  }));
}

