import { prisma } from "../db/prisma.js";

/**
 * Cross-task learning (intelligence): turn the Kingdom's accumulated outcomes into lessons
 * the planner can apply to a NEW decree, so it reuses what worked and avoids repeating past
 * failures — instead of planning each decree from scratch.
 *
 * Source of truth is `AgentReviewSummary` — the record that already captures a clear outcome
 * per work order (verdict + whatFailed + summary). Lessons are:
 *   - relevance-ranked against the decree (keyword overlap), not recency-ranked, and
 *   - outcome-gated: only decided reviews (PASS = worked, mechanical/semantic failure with a
 *     diagnosis = avoid) — ambiguous verdicts (RISK_REVIEW/UNKNOWN) are skipped.
 *
 * Deterministic and provider-free (no extra LLM call); safe to run on every plan.
 */

const FAILURE_VERDICTS = new Set(["NEEDS_FIX", "PATCH_FAILED", "VALIDATION_FAILED", "NO_CHANGES"]);
const SUCCESS_VERDICTS = new Set(["PASS"]);

// Generic decree/work verbs and connectives carry no topical signal — excluding them keeps
// relevance scoring on the nouns that actually distinguish one piece of work from another.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "for", "on", "with", "is", "are", "be",
  "this", "that", "it", "as", "at", "by", "from", "into", "we", "our", "you", "should",
  "add", "make", "fix", "update", "create", "implement", "build", "change", "ensure", "use",
  "work", "order", "task", "decree", "kingdom", "agent", "please", "need", "want"
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9฀-๿\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
  );
}

/** Keyword overlap, with the work order's title weighted over its objective. */
function relevanceScore(decreeTokens: Set<string>, title: string, objective: string): number {
  const titleTokens = tokenize(title);
  const objectiveTokens = tokenize(objective);
  let score = 0;
  for (const token of decreeTokens) {
    if (titleTokens.has(token)) score += 2;
    else if (objectiveTokens.has(token)) score += 1;
  }
  return score;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim().length > 0) : [];
}

function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface CrossTaskLesson {
  kind: "WORKED" | "AVOID";
  title: string;
  detail: string;
  score: number;
}

/**
 * Returns the relevant outcome lessons for a decree. Exposed (alongside the formatter) so it
 * is unit-testable without the planner's provider call.
 */
export async function findCrossTaskLessons(input: {
  decreeText: string;
  projectId: string | null;
  maxLessons?: number;
  poolSize?: number;
}): Promise<CrossTaskLesson[]> {
  const maxLessons = input.maxLessons ?? 5;
  const poolSize = input.poolSize ?? 60;
  const decreeTokens = tokenize(input.decreeText);
  if (decreeTokens.size === 0) return [];

  const reviews = await prisma.agentReviewSummary.findMany({
    where: input.projectId ? { workOrder: { projectId: input.projectId } } : {},
    select: {
      workOrderId: true,
      verdict: true,
      whatFailed: true,
      summary: true,
      createdAt: true,
      workOrder: { select: { title: true, objective: true } }
    },
    orderBy: { createdAt: "desc" },
    take: poolSize
  });

  const seen = new Set<string>();
  const lessons: CrossTaskLesson[] = [];

  for (const review of reviews) {
    if (seen.has(review.workOrderId)) continue; // keep only the latest review per work order
    seen.add(review.workOrderId);

    const isFailure = FAILURE_VERDICTS.has(review.verdict);
    const isSuccess = SUCCESS_VERDICTS.has(review.verdict);
    if (!isFailure && !isSuccess) continue; // ambiguous outcome → not a lesson

    const title = review.workOrder?.title ?? "Untitled work order";
    const objective = review.workOrder?.objective ?? "";
    const score = relevanceScore(decreeTokens, title, objective);
    if (score === 0) continue; // not relevant to this decree

    if (isFailure) {
      const whatFailed = asStringList(review.whatFailed);
      const detail = whatFailed.length ? whatFailed.join("; ") : review.summary;
      if (!detail.trim()) continue; // a failure with no diagnosis teaches nothing
      lessons.push({ kind: "AVOID", title, detail: truncate(detail), score });
    } else {
      lessons.push({ kind: "WORKED", title, detail: truncate(review.summary), score });
    }
  }

  // Highest relevance first; on a tie surface failures (higher-signal) before successes.
  lessons.sort((a, b) => b.score - a.score || (a.kind === "AVOID" ? -1 : 1) - (b.kind === "AVOID" ? -1 : 1));
  return lessons.slice(0, maxLessons);
}

/** Formats lessons into a planner prompt section, or "" when there is nothing to teach. */
export function formatCrossTaskLessons(lessons: CrossTaskLesson[]): string {
  if (lessons.length === 0) return "";
  const avoid = lessons.filter((l) => l.kind === "AVOID");
  const worked = lessons.filter((l) => l.kind === "WORKED");
  const parts = [
    "[LESSONS FROM SIMILAR PAST WORK]",
    "Apply what worked before and do not repeat past failures on similar work."
  ];
  if (worked.length) {
    parts.push("What worked:", worked.map((l) => `- ${l.title}: ${l.detail}`).join("\n"));
  }
  if (avoid.length) {
    parts.push("What to avoid (failures on similar past work):", avoid.map((l) => `- ${l.title}: ${l.detail}`).join("\n"));
  }
  return parts.join("\n");
}

/** Convenience: find + format in one call for the planner. */
export async function buildCrossTaskLessons(input: {
  decreeText: string;
  projectId: string | null;
  maxLessons?: number;
}): Promise<string> {
  const lessons = await findCrossTaskLessons(input);
  return formatCrossTaskLessons(lessons);
}
