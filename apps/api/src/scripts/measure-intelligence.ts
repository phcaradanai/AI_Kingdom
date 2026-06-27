import { pathToFileURL } from "node:url";
import { prisma } from "../db/prisma.js";

/**
 * Measure the Kingdom's real efficiency from data it ALREADY records — no AI calls, no
 * mutations, zero cost. The 8 intelligence levers are proven wired but unproven on outcome
 * and cost; this report is the instrument that turns "we think it's smarter" into numbers the
 * King can act on (keep / prune a lever). It answers three questions:
 *
 *   1. Cost & tokens per decree — where the money and tokens actually go (council vs synthesis).
 *   2. Is the learning loop producing and being USED — candidate backlog, approved-knowledge
 *      reuse (useCount). Approved knowledge with useCount 0 is injected-but-never-helping;
 *      a large PENDING backlog means the King's approval queue is the bottleneck.
 *   3. Outcome signal — review verdict distribution (the closest thing to a quality score).
 *
 * Usage (from repo root):
 *   npm run intelligence:measure                 # all-time
 *   npm run intelligence:measure -- --days=14    # only the last 14 days
 *
 * The pure aggregation (computeReport) is separated from the queries so it is unit-testable
 * without a populated database.
 */

const INTELLIGENCE_SETTINGS = [
  "PLANNER_CROSS_TASK_LEARNING",
  "COUNCIL_CROSS_TASK_LEARNING",
  "AGENT_KNOWLEDGE_IN_CONTEXT",
  "CAPTURE_LESSONS_FROM_REVIEWS",
  "COUNCIL_PARALLEL_SPECIALISTS",
  "SUPERVISED_AUTO_RETRY_ENABLED",
  "ADAPTIVE_REASONING_ENABLED",
  "AI_MAX_TOKENS_AUTOGROW"
] as const;

export interface UsageRow {
  councilSessionId: string | null;
  operation: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  costSource: string | null;
}

export interface ReportInput {
  usage: UsageRow[];
  sessionCount: number;
  fallbackSessionCount: number;
  candidatesByStatus: Record<string, number>;
  approvedKnowledge: { count: number; totalUseCount: number; neverUsed: number };
  verdictCounts: Record<string, number>;
  qualityStats: { scored: number; avgScore: number; highQuality: number; lowQuality: number };
}

export interface IntelligenceReport {
  decrees: number;
  totalCostUSD: number;
  avgCostPerDecreeUSD: number;
  avgTokensPerDecree: number;
  qualityStats: { scored: number; avgScore: number; highQuality: number; lowQuality: number };
  avgCallsPerDecree: number;
  fallbackRate: number;
  byOperation: Array<{ operation: string; calls: number; totalTokens: number; costUSD: number; costShare: number }>;
  byCostSource: Record<string, number>;
  providers: Array<{ key: string; calls: number; costUSD: number }>;
  candidatesByStatus: Record<string, number>;
  approvedKnowledge: { count: number; totalUseCount: number; neverUsed: number };
  verdictCounts: Record<string, number>;
}

function round(value: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Pure aggregation — deterministic, no IO. */
export function computeReport(input: ReportInput): IntelligenceReport {
  const decrees = input.sessionCount;
  const totalCostUSD = input.usage.reduce((sum, r) => sum + r.estimatedCostUSD, 0);
  const totalTokens = input.usage.reduce((sum, r) => sum + r.totalTokens, 0);
  const calls = input.usage.length;

  const opMap = new Map<string, { calls: number; totalTokens: number; costUSD: number }>();
  for (const r of input.usage) {
    const op = r.operation ?? "unknown";
    const e = opMap.get(op) ?? { calls: 0, totalTokens: 0, costUSD: 0 };
    e.calls += 1;
    e.totalTokens += r.totalTokens;
    e.costUSD += r.estimatedCostUSD;
    opMap.set(op, e);
  }
  const byOperation = [...opMap.entries()]
    .map(([operation, v]) => ({
      operation,
      calls: v.calls,
      totalTokens: v.totalTokens,
      costUSD: round(v.costUSD, 6),
      costShare: totalCostUSD > 0 ? round(v.costUSD / totalCostUSD, 4) : 0
    }))
    .sort((a, b) => b.costUSD - a.costUSD);

  const byCostSource: Record<string, number> = {};
  for (const r of input.usage) {
    const key = r.costSource ?? "UNKNOWN";
    byCostSource[key] = (byCostSource[key] ?? 0) + 1;
  }

  const provMap = new Map<string, { calls: number; costUSD: number }>();
  for (const r of input.usage) {
    const key = `${r.provider}:${r.model}`;
    const e = provMap.get(key) ?? { calls: 0, costUSD: 0 };
    e.calls += 1;
    e.costUSD += r.estimatedCostUSD;
    provMap.set(key, e);
  }
  const providers = [...provMap.entries()]
    .map(([key, v]) => ({ key, calls: v.calls, costUSD: round(v.costUSD, 6) }))
    .sort((a, b) => b.calls - a.calls);

  return {
    decrees,
    totalCostUSD: round(totalCostUSD, 6),
    avgCostPerDecreeUSD: decrees > 0 ? round(totalCostUSD / decrees, 6) : 0,
    avgTokensPerDecree: decrees > 0 ? Math.round(totalTokens / decrees) : 0,
    avgCallsPerDecree: decrees > 0 ? round(calls / decrees, 2) : 0,
    fallbackRate: decrees > 0 ? round(input.fallbackSessionCount / decrees, 4) : 0,
    byOperation,
    byCostSource,
    providers,
    candidatesByStatus: input.candidatesByStatus,
    approvedKnowledge: input.approvedKnowledge,
    verdictCounts: input.verdictCounts,
    qualityStats: input.qualityStats
  };
}

async function gather(sinceDays?: number): Promise<ReportInput> {
  const where = sinceDays ? { createdAt: { gte: new Date(Date.now() - sinceDays * 86_400_000) } } : {};

  // Only usage tied to a council session counts as "decree" cost (excludes ad-hoc traces).
  const usageRows = await prisma.usageRecord.findMany({
    where: { ...where, councilSessionId: { not: null } },
    select: {
      councilSessionId: true, operation: true, provider: true, model: true,
      promptTokens: true, completionTokens: true, totalTokens: true,
      estimatedCostUSD: true, costSource: true
    }
  });
  const usage: UsageRow[] = usageRows.map((r) => ({
    councilSessionId: r.councilSessionId,
    operation: r.operation,
    provider: r.provider,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    estimatedCostUSD: r.estimatedCostUSD,
    costSource: r.costSource
  }));

  const sessions = await prisma.councilSession.findMany({
    where,
    select: { id: true, fallbackNotice: true, qualityScore: true }
  });
  const fallbackSessionCount = sessions.filter((s) => s.fallbackNotice && s.fallbackNotice.trim()).length;
  const scoredSessions = sessions.filter((s) => s.qualityScore !== null && s.qualityScore !== undefined);
  const qualityStats = {
    scored: scoredSessions.length,
    avgScore: scoredSessions.length > 0
      ? Math.round((scoredSessions.reduce((sum, s) => sum + (s.qualityScore ?? 0), 0) / scoredSessions.length) * 100) / 100
      : 0,
    highQuality: scoredSessions.filter((s) => (s.qualityScore ?? 0) >= 0.8).length,
    lowQuality: scoredSessions.filter((s) => (s.qualityScore ?? 0) < 0.5).length,
  };

  const candidates = await prisma.agentKnowledgeCandidate.groupBy({
    by: ["status"],
    where,
    _count: { _all: true }
  });
  const candidatesByStatus: Record<string, number> = {};
  for (const c of candidates) candidatesByStatus[c.status] = c._count._all;

  const approved = await prisma.agentKnowledgeMemory.findMany({
    where: { trustLevel: "APPROVED" },
    select: { useCount: true }
  });
  const approvedKnowledge = {
    count: approved.length,
    totalUseCount: approved.reduce((s, m) => s + m.useCount, 0),
    neverUsed: approved.filter((m) => m.useCount === 0).length
  };

  const reviews = await prisma.agentReviewSummary.groupBy({
    by: ["verdict"],
    where,
    _count: { _all: true }
  });
  const verdictCounts: Record<string, number> = {};
  for (const r of reviews) verdictCounts[r.verdict] = r._count._all;

  return { usage, sessionCount: sessions.length, fallbackSessionCount, candidatesByStatus, approvedKnowledge, verdictCounts, qualityStats };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function render(report: IntelligenceReport, settings: Array<{ key: string; value: string }>): string {
  const lines: string[] = [];
  lines.push("=== Kingdom Intelligence — Efficiency Report ===\n");

  lines.push("Levers:");
  for (const s of settings) lines.push(`  ${s.value === "true" ? "ON " : "off"}  ${s.key}`);
  lines.push("");

  lines.push(`Decrees (council sessions): ${report.decrees}`);
  if (report.decrees === 0) {
    lines.push("\nNo council sessions in range — run some decrees first, then re-measure.");
    return lines.join("\n");
  }
  lines.push(`Total cost: $${report.totalCostUSD.toFixed(6)}`);
  lines.push(`Avg per decree: $${report.avgCostPerDecreeUSD.toFixed(6)} · ${report.avgTokensPerDecree} tokens · ${report.avgCallsPerDecree} AI calls`);
  lines.push(`Fallback rate: ${pct(report.fallbackRate)} of decrees`);
  lines.push("");

  lines.push("Cost by operation:");
  for (const o of report.byOperation) {
    lines.push(`  ${o.operation.padEnd(26)} ${String(o.calls).padStart(4)} calls  ${String(o.totalTokens).padStart(8)} tok  $${o.costUSD.toFixed(6)}  (${pct(o.costShare)})`);
  }
  lines.push("");

  lines.push("Cost source: " + Object.entries(report.byCostSource).map(([k, v]) => `${k}=${v}`).join(", "));
  lines.push("Providers: " + report.providers.map((p) => `${p.key}(${p.calls})`).join(", "));
  lines.push("");

  lines.push("Learning loop:");
  const cand = Object.entries(report.candidatesByStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
  lines.push(`  Knowledge candidates: ${cand}`);
  lines.push(`  Approved knowledge: ${report.approvedKnowledge.count} (used ${report.approvedKnowledge.totalUseCount}× total, ${report.approvedKnowledge.neverUsed} never used)`);
  const verd = Object.entries(report.verdictCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
  lines.push(`  Review verdicts: ${verd}`);
  lines.push("");

  const qs = report.qualityStats;
  lines.push("Council output quality:");
  if (qs.scored === 0) {
    lines.push("  No scored sessions yet — quality scoring activates on the next decree.");
  } else {
    lines.push(`  Scored sessions: ${qs.scored} of ${report.decrees}`);
    lines.push(`  Avg quality score: ${qs.avgScore.toFixed(2)} / 1.00`);
    lines.push(`  High-quality (≥0.80): ${qs.highQuality}  Low-quality (<0.50, memory gated): ${qs.lowQuality}`);
  }
  lines.push("");

  // Actionable hints — surface the efficiency/operability red flags the King should weigh.
  const hints: string[] = [];
  if (report.approvedKnowledge.count > 0 && report.approvedKnowledge.neverUsed === report.approvedKnowledge.count) {
    hints.push("All approved knowledge has useCount 0 — it has not yet been consumed by any decree. Either no decree has run since it was approved + AGENT_KNOWLEDGE_IN_CONTEXT was enabled (expected — run a fresh decree to confirm), or its agent/project scope never matches the decrees being run (a real gap). Run one decree on a project with approved knowledge to tell which.");
  }
  const pending = report.candidatesByStatus.PENDING ?? 0;
  const approvedCands = report.candidatesByStatus.APPROVED ?? 0;
  if (pending > 0 && pending >= approvedCands * 3) {
    hints.push(`PENDING candidate backlog (${pending}) far exceeds approved (${approvedCands}) — the King's approval queue is the learning-loop bottleneck.`);
  }
  if (report.fallbackRate >= 0.5) {
    hints.push(`Fallback rate ${pct(report.fallbackRate)} — the primary provider is failing/timing out on most decrees; cost & latency suffer.`);
  }
  if (report.qualityStats.scored > 0 && report.qualityStats.avgScore < 0.5) {
    hints.push(`Avg council quality score ${report.qualityStats.avgScore.toFixed(2)} is below the memory gate threshold (0.50) — most sessions are failing the precision contracts. Check that the Grand Vizier prompt contracts are active (sharpened council contracts commit).`);
  }
  if (report.qualityStats.scored > 0 && report.qualityStats.lowQuality > report.qualityStats.scored / 2) {
    hints.push(`More than half of scored sessions (${report.qualityStats.lowQuality}/${report.qualityStats.scored}) are low-quality (<0.50) and had memory auto-save blocked. The Grand Vizier may not be following the 'My recommendation:' / specific-paths contracts.`);
  }
  if (hints.length) {
    lines.push("Flags:");
    for (const h of hints) lines.push(`  ⚠ ${h}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const daysArg = process.argv.slice(2).find((a) => a.startsWith("--days="));
  const sinceDays = daysArg ? Number(daysArg.split("=")[1]) : undefined;
  if (daysArg && (!Number.isFinite(sinceDays) || (sinceDays as number) <= 0)) {
    console.error(`Invalid --days value: ${daysArg}`);
    process.exit(1);
  }

  const settings = await prisma.setting.findMany({
    where: { key: { in: [...INTELLIGENCE_SETTINGS] } },
    select: { key: true, value: true }
  });
  const settingsView = INTELLIGENCE_SETTINGS.map((key) => ({
    key,
    value: settings.find((s) => s.key === key)?.value ?? "false"
  }));

  const input = await gather(sinceDays);
  const report = computeReport(input);
  console.log(render(report, settingsView));
}

// Run only when invoked directly (not when imported by a test for computeReport).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
