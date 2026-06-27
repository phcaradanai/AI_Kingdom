import { prisma } from "../db/prisma.js";
import type { ExternalAgent } from "@prisma/client";

export interface ExternalAgentRecommendation {
  externalAgentId: string;
  name: string;
  type: string;
  roleTitle: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  risks: string[];
}

type AgentSignal = { phrase: string; weight: number; label: string };
type TypeProfile = { signals: AgentSignal[]; riskPhrases: string[] };

// Verdicts that carry a clear quality signal; UNKNOWN and NO_CHANGES are neutral
// and excluded from both numerator and denominator.
const OUTCOME_PASS_VERDICTS = new Set(["PASS"]);
const OUTCOME_SCORED_VERDICTS = new Set(["PASS", "NEEDS_FIX", "PATCH_FAILED", "VALIDATION_FAILED", "RISK_REVIEW"]);

type AgentOutcomeStats = { passCount: number; totalCount: number };

async function getAgentOutcomeStats(agentIds: string[]): Promise<Map<string, AgentOutcomeStats>> {
  if (agentIds.length === 0) return new Map();

  // Step 1: recent completed runs that have an associated automation job
  const runs = await prisma.externalAgentRun.findMany({
    where: {
      externalAgentId: { in: agentIds },
      automationJobId: { not: null }
    },
    select: { externalAgentId: true, automationJobId: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const jobIds = [...new Set(runs.map((r) => r.automationJobId!))];
  if (jobIds.length === 0) return new Map();

  // Step 2: reviews for those jobs — only actionable verdicts count
  const reviews = await prisma.agentReviewSummary.findMany({
    where: { automationJobId: { in: jobIds } },
    select: { automationJobId: true, verdict: true }
  });

  const verdictByJobId = new Map(reviews.map((r) => [r.automationJobId, r.verdict]));

  const stats = new Map<string, AgentOutcomeStats>();
  for (const run of runs) {
    if (!run.automationJobId) continue;
    const verdict = verdictByJobId.get(run.automationJobId);
    if (!verdict || !OUTCOME_SCORED_VERDICTS.has(verdict)) continue;

    const s = stats.get(run.externalAgentId) ?? { passCount: 0, totalCount: 0 };
    s.totalCount++;
    if (OUTCOME_PASS_VERDICTS.has(verdict)) s.passCount++;
    stats.set(run.externalAgentId, s);
  }

  return stats;
}

const TYPE_SIGNALS: Record<string, TypeProfile> = {
  CLAUDE_CODE: {
    signals: [
      { phrase: "architecture", weight: 10, label: "architectural work" },
      { phrase: "refactor", weight: 10, label: "refactoring" },
      { phrase: "system design", weight: 10, label: "system design" },
      { phrase: "codebase", weight: 7, label: "codebase-wide scope" },
      { phrase: "migration", weight: 7, label: "migration" },
      { phrase: "redesign", weight: 8, label: "redesign" },
      { phrase: "complex backend", weight: 8, label: "complex backend changes" },
      { phrase: "complex frontend", weight: 8, label: "complex frontend changes" },
      { phrase: "test fixing", weight: 6, label: "test fixing" },
      { phrase: "large context", weight: 6, label: "large context requirement" },
      { phrase: "database schema", weight: 6, label: "database schema changes" },
      { phrase: "service layer", weight: 5, label: "service layer implementation" },
      { phrase: "backend service", weight: 5, label: "backend service" }
    ],
    riskPhrases: ["quick fix", "trivial", "minor change"]
  },
  CODEX: {
    signals: [
      { phrase: "bugfix", weight: 10, label: "bug fixing" },
      { phrase: "bug fix", weight: 10, label: "bug fixing" },
      { phrase: "unit test", weight: 10, label: "unit test generation" },
      { phrase: "test generation", weight: 10, label: "test generation" },
      { phrase: "regression", weight: 8, label: "regression fix" },
      { phrase: "focused code", weight: 8, label: "focused code change" },
      { phrase: "test coverage", weight: 7, label: "test coverage improvement" },
      { phrase: "fix failing", weight: 8, label: "fix failing tests" },
      { phrase: "endpoint", weight: 5, label: "API endpoint implementation" }
    ],
    riskPhrases: ["architecture", "system design", "large scale refactor"]
  },
  CLINE: {
    signals: [
      { phrase: "vs code", weight: 10, label: "VS Code workflow" },
      { phrase: "vscode", weight: 10, label: "VS Code extension" },
      { phrase: "local file", weight: 8, label: "local file editing" },
      { phrase: "command execution", weight: 8, label: "command execution" },
      { phrase: "iterative debug", weight: 8, label: "iterative debugging" },
      { phrase: "local debug", weight: 8, label: "local debugging" },
      { phrase: "local development", weight: 7, label: "local development" },
      { phrase: "terminal", weight: 6, label: "terminal interaction" },
      { phrase: "workspace", weight: 5, label: "workspace management" }
    ],
    riskPhrases: ["browser", "automated deployment"]
  },
  ANTIGRAVITY: {
    signals: [
      { phrase: "exploratory", weight: 10, label: "exploratory implementation" },
      { phrase: "browser", weight: 10, label: "browser verification" },
      { phrase: "visual", weight: 9, label: "visual verification" },
      { phrase: "ui component", weight: 9, label: "UI component work" },
      { phrase: "prototype", weight: 9, label: "rapid prototyping" },
      { phrase: "screenshot", weight: 8, label: "screenshot review" },
      { phrase: "interactive", weight: 6, label: "interactive feature" },
      { phrase: "layout", weight: 6, label: "layout work" },
      { phrase: "rapid", weight: 5, label: "rapid implementation" },
      { phrase: "frontend component", weight: 8, label: "frontend component" }
    ],
    riskPhrases: ["backend only", "server-side only", "no ui"]
  },
  HERMES: {
    signals: [
      { phrase: "handoff", weight: 10, label: "handoff coordination" },
      { phrase: "coordination", weight: 10, label: "task coordination" },
      { phrase: "reporting", weight: 8, label: "status reporting" },
      { phrase: "relay", weight: 8, label: "information relay" },
      { phrase: "delegate", weight: 7, label: "work delegation" },
      { phrase: "communicate", weight: 7, label: "communication" },
      { phrase: "status report", weight: 8, label: "status report" },
      { phrase: "automation support", weight: 7, label: "automation support" }
    ],
    riskPhrases: []
  },
  KILO: {
    signals: [
      { phrase: "multi-model", weight: 10, label: "multi-model workflow" },
      { phrase: "multi model", weight: 9, label: "multi-model workflow" },
      { phrase: "ide support", weight: 8, label: "IDE support" },
      { phrase: "cli support", weight: 8, label: "CLI support" },
      { phrase: "engineering support", weight: 7, label: "engineering support" }
    ],
    riskPhrases: []
  }
};

export async function getWorkOrderRecommendations(workOrderId: string): Promise<ExternalAgentRecommendation[]> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      title: true,
      objective: true,
      context: true,
      instructions: true,
      acceptanceCriteria: true,
      validationCommands: true,
      priority: true
    }
  });
  if (!workOrder) {
    const err = new Error("Work order not found");
    err.name = "NotFoundError";
    throw err;
  }

  const activeAgents = await prisma.externalAgent.findMany({ where: { isActive: true } });
  if (activeAgents.length === 0) return [];

  const outcomeStats = await getAgentOutcomeStats(activeAgents.map((a) => a.id)).catch(() => new Map<string, AgentOutcomeStats>());

  return scoreAgentsForWorkOrder(activeAgents, workOrder, outcomeStats);
}

export function scoreAgentsForWorkOrder(
  agents: Pick<ExternalAgent, "id" | "name" | "type" | "roleTitle" | "capabilities">[],
  workOrder: {
    title: string;
    objective: string;
    context: string;
    instructions: string;
    priority: string;
    acceptanceCriteria?: string[];
    validationCommands?: string[];
  },
  outcomeStats?: Map<string, AgentOutcomeStats>
): ExternalAgentRecommendation[] {
  // title and objective are most discriminating (2x); context/instructions are secondary (1x);
  // acceptanceCriteria and validationCommands included at 0.5x via join (not doubled)
  const corpus = [
    workOrder.title, workOrder.title,
    workOrder.objective, workOrder.objective,
    workOrder.context,
    workOrder.instructions,
    ...(workOrder.acceptanceCriteria ?? []),
    ...(workOrder.validationCommands ?? [])
  ].join(" ").toLowerCase();

  const results = agents.map((agent) => scoreAgent(agent, corpus, workOrder.priority, outcomeStats?.get(agent.id)));
  results.sort((a, b) => b.score - a.score);
  return results;
}

function scoreAgent(
  agent: Pick<ExternalAgent, "id" | "name" | "type" | "roleTitle" | "capabilities">,
  corpus: string,
  priority: string,
  outcomeStats?: AgentOutcomeStats
): ExternalAgentRecommendation {
  const profile = TYPE_SIGNALS[agent.type];
  const reasons: string[] = [];
  const risks: string[] = [];
  let raw = 0;

  if (profile) {
    for (const signal of profile.signals) {
      if (corpus.includes(signal.phrase)) {
        raw += signal.weight;
        reasons.push(signal.label);
      }
    }
    for (const riskPhrase of profile.riskPhrases) {
      if (corpus.includes(riskPhrase)) {
        risks.push(`Work order mentions "${riskPhrase}" which may not suit ${agent.name}`);
      }
    }
  } else {
    for (const cap of agent.capabilities) {
      if (corpus.includes(cap.toLowerCase())) {
        raw += 4;
        reasons.push(cap);
      }
    }
  }

  if ((priority === "HIGH" || priority === "CRITICAL") && (agent.type === "CLAUDE_CODE" || agent.type === "CODEX")) {
    raw += 3;
    reasons.push("high priority task");
  }

  // Outcome-based modifier: blend in real pass-rate history when ≥3 reviewed runs exist.
  // Scale: -10 (0% pass) → 0 (50% pass) → +10 (100% pass).
  // Applied after raw * 2 scaling so keyword signal is still the dominant factor.
  let performanceMod = 0;
  if (outcomeStats && outcomeStats.totalCount >= 3) {
    const { passCount, totalCount } = outcomeStats;
    const passRate = passCount / totalCount;
    performanceMod = Math.round((passRate - 0.5) * 20);
    if (passRate >= 0.80) {
      reasons.push(`strong track record (${passCount}/${totalCount} recent runs passed)`);
    } else if (passRate < 0.40) {
      risks.push(`low recent pass rate (${passCount}/${totalCount} recent runs passed)`);
    }
  }

  const score = Math.min(100, Math.max(0, raw * 2 + performanceMod));
  const confidence: "HIGH" | "MEDIUM" | "LOW" = score >= 65 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";

  if (reasons.length === 0) {
    reasons.push(`${agent.name} is available as a general option`);
  }

  return {
    externalAgentId: agent.id,
    name: agent.name,
    type: agent.type,
    roleTitle: agent.roleTitle,
    score,
    confidence,
    reasons: reasons.slice(0, 5),
    risks: risks.slice(0, 3)
  };
}
