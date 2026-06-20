import { prisma } from "../db/prisma.js";
import { getBooleanSetting } from "./settingsService.js";

// Slugs that draft/orchestrate but do not execute work orders
const NON_EXECUTOR_SLUGS = new Set(["planner", "grand-vizier"]);

// Signals that a work order is code/engineering work — routed to the Royal Architect.
const CODE_INTENT = /\b(code|coding|refactor|refactoring|typescript|javascript|tsx?|api|endpoint|route|router|bug|debug|fix|patch|compile|typecheck|lint|function|class|module|component|frontend|backend|database|migration|schema|prisma|test|build|deploy|runtime|server|repository|codebase|architecture)\b/i;

export interface AssignmentResult {
  agentId: string;
  agentName: string;
  reason: string;
  confidence: number;
}

/**
 * Attempts to find the best-matching internal agent for a draft work order.
 * Returns null when no agent scores above the threshold or the feature is disabled.
 * Assignment is purely keyword-based — no LLM call, no cost.
 */
export async function assignWorkOrderAgent(workOrderId: string): Promise<AssignmentResult | null> {
  const enabled = await getBooleanSetting("AUTO_ASSIGN_WORK_ORDERS", true);
  if (!enabled) return null;

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { title: true, objective: true, context: true, instructions: true }
  });
  if (!workOrder) return null;

  const result = await selectAgent(workOrder);
  if (!result) return null;

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      assignedAgentId: result.agentId,
      assignedAgentReason: result.reason,
      assignedAgentConfidence: result.confidence
    }
  });

  return result;
}

/**
 * Pure matching logic — selects an agent from the active pool.
 * Exported for unit testing without DB I/O.
 */
export async function selectAgent(workOrder: {
  title: string;
  objective: string;
  context: string;
  instructions: string;
}): Promise<AssignmentResult | null> {
  const candidates = await prisma.agent.findMany({
    where: { isActive: true, isTestData: false },
    select: { id: true, slug: true, name: true, title: true, specialty: true, skills: true, description: true }
  });

  const pool = candidates.filter((a) => !NON_EXECUTOR_SLUGS.has(a.slug));
  if (pool.length === 0) return null;

  const rawText = `${workOrder.title} ${workOrder.objective} ${workOrder.context} ${workOrder.instructions}`;

  // Domain routing: code/engineering work is supervised by the Royal Architect.
  // The generic keyword matcher below treats "code"/"build"/"implement" as stopwords,
  // so without this a code work order can be mis-assigned (e.g. to the Treasurer).
  if (CODE_INTENT.test(rawText)) {
    const architect = pool.find((a) => a.slug === "royal-architect");
    if (architect) {
      return {
        agentId: architect.id,
        agentName: architect.name,
        reason: `Routed to ${architect.name} (${architect.title}) — the work order involves code/engineering, which the Royal Architect supervises.`,
        confidence: 0.9
      };
    }
  }

  const keywords = extractKeywords(rawText);

  let bestScore = 0;
  let bestAgent: (typeof pool)[number] | null = null;
  let bestMatchedTerms: string[] = [];

  for (const agent of pool) {
    const agentText = [agent.specialty, ...agent.skills, agent.description, agent.title].join(" ").toLowerCase();
    const { score, matched } = scoreKeywordOverlap(keywords, agentText);
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
      bestMatchedTerms = matched;
    }
  }

  // Require at least one meaningful keyword match
  if (!bestAgent || bestScore === 0) {
    return null;
  }

  const confidence = Math.min(1, bestScore / 5);
  const reason = buildReason(bestAgent.name, bestAgent.title, bestMatchedTerms, confidence);

  return { agentId: bestAgent.id, agentName: bestAgent.name, reason, confidence };
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function scoreKeywordOverlap(keywords: string[], agentText: string): { score: number; matched: string[] } {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (agentText.includes(kw)) matched.push(kw);
  }
  // Deduplicate, weight longer matches higher
  const unique = [...new Set(matched)];
  const score = unique.reduce((sum, kw) => sum + Math.log2(kw.length + 1), 0);
  return { score, matched: unique.slice(0, 5) };
}

function buildReason(name: string, title: string, matched: string[], confidence: number): string {
  const pct = Math.round(confidence * 100);
  if (matched.length === 0) return `Assigned to ${name} (${title}) — no keyword overlap detected (${pct}% confidence).`;
  return `Assigned to ${name} (${title}) based on skill overlap with keywords: ${matched.join(", ")}. Confidence: ${pct}%.`;
}

const STOPWORDS = new Set([
  "this", "that", "with", "from", "have", "will", "been", "they", "their",
  "there", "about", "which", "when", "where", "what", "more", "also", "into",
  "each", "some", "such", "then", "than", "them", "these", "other", "after",
  "should", "would", "could", "under", "over", "make", "made", "must", "work",
  "order", "orders", "task", "tasks", "your", "need", "needs", "like", "does",
  "using", "used", "user", "implement", "implementation", "service", "services",
  "create", "update", "build", "adds", "data", "model", "field", "fields",
  "test", "tests", "type", "types", "class", "function", "method", "module",
  "file", "files", "code", "ensure", "support", "provide", "return", "returns"
]);
