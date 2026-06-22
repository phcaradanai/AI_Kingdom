/**
 * Complexity assessment for adaptive reasoning.
 *
 * The King's directive: when a decree may be complex (e.g. a hard code fix or
 * bug analysis in a large system), the *responsible* agent should think harder
 * (reasoning ON) and is allowed more output budget. This module is the single,
 * deterministic place that decides "is this work complex?". It NEVER calls an
 * LLM — the assessment is a cheap heuristic so it adds no latency or cost.
 *
 * Two entry points, by stage:
 *  - assessDecreeComplexity: pre-work-order (planner, council synthesis). The
 *    only signal available is the decree text + task mode, so we keyword-score it.
 *  - assessExecutionComplexity: post-work-order (reviewer, external coder). Here
 *    a *structured* signal exists — the work order/patch riskLevel, the
 *    deterministic review verdict, and the number of acceptance criteria — which
 *    is far more reliable than re-deriving complexity from prose.
 */

export type ComplexityLevel = "STANDARD" | "COMPLEX";

export type ComplexityAssessment = {
  level: ComplexityLevel;
  score: number;
  signals: string[];
};

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ParameterEscalation = {
  reasoning: boolean;
  reasoningEffort?: ReasoningEffort;
};

// Keyword signals (Thai + English). Each match contributes to the score. Kept
// lowercase; matching is case-insensitive and substring-based so inflections and
// Thai (no word boundaries) both work.
const COMPLEX_KEYWORDS: string[] = [
  // English — code/debug
  "refactor", "rewrite", "migrate", "migration", "architecture", "redesign",
  "debug", "race condition", "deadlock", "memory leak", "concurrency",
  "root cause", "root-cause", "regression", "performance", "optimi", "bottleneck",
  "security", "vulnerab", "data loss", "corruption", "schema change",
  "multiple files", "across the codebase", "end-to-end", "complex", "intricate",
  "large system", "legacy", "tech debt", "technical debt", "investigate",
  // Thai — code/debug
  "ซับซ้อน", "แก้บัค", "แก้บั๊ก", "บั๊ก", "ดีบัก", "หาสาเหตุ", "ต้นเหตุ",
  "ระบบใหญ่", "ทั้งระบบ", "รื้อ", "ปรับโครงสร้าง", "สถาปัตยกรรม", "หลายไฟล์",
  "ประสิทธิภาพ", "ความปลอดภัย", "ช่องโหว่", "วิเคราะห์", "เชื่อมโยงกัน",
  "หลายส่วน", "ยุ่งยาก", "ผิดพลาดสะสม"
];

// Modes that lean complex by nature (real implementation / deep research).
const COMPLEX_LEANING_MODES = new Set(["BUILD", "RESEARCH"]);

const DECREE_LENGTH_SIGNAL = 600; // chars — long, detailed decrees tend to be complex
const COMPLEX_SCORE_THRESHOLD = 2;

/**
 * Pre-work-order complexity from the decree text + task mode. Deterministic.
 */
export function assessDecreeComplexity(input: { text: string; mode?: string | null }): ComplexityAssessment {
  const signals: string[] = [];
  let score = 0;

  const text = (input.text ?? "").toLowerCase();
  const matched = new Set<string>();
  for (const kw of COMPLEX_KEYWORDS) {
    if (text.includes(kw)) matched.add(kw);
  }
  if (matched.size > 0) {
    // Each distinct keyword adds 1, capped so a keyword-stuffed decree can't dominate.
    const kwScore = Math.min(matched.size, 4);
    score += kwScore;
    signals.push(`keywords:${[...matched].slice(0, 6).join(",")}`);
  }

  if ((input.text ?? "").length >= DECREE_LENGTH_SIGNAL) {
    score += 1;
    signals.push("long-decree");
  }

  const mode = (input.mode ?? "").toUpperCase();
  if (COMPLEX_LEANING_MODES.has(mode)) {
    score += 1;
    signals.push(`mode:${mode}`);
  }

  const level: ComplexityLevel = score >= COMPLEX_SCORE_THRESHOLD ? "COMPLEX" : "STANDARD";
  return { level, score, signals };
}

const HIGH_RISK_LEVELS = new Set(["HIGH", "CRITICAL"]);
// Deterministic review verdicts that indicate a failure needing real analysis.
const FAILURE_VERDICTS = new Set(["PATCH_FAILED", "VALIDATION_FAILED", "NEEDS_FIX", "RISK_REVIEW"]);
const MANY_CRITERIA = 5;

/**
 * Post-work-order complexity from structured signals (risk, verdict, criteria).
 * Used by the reviewer (bug analysis of a failure / high-risk patch) and to
 * decide whether the external coder gets an extended-thinking directive.
 */
export function assessExecutionComplexity(input: {
  riskLevel?: string | null;
  verdict?: string | null;
  acceptanceCriteriaCount?: number;
}): ComplexityAssessment {
  const signals: string[] = [];
  let score = 0;

  const risk = (input.riskLevel ?? "").toUpperCase();
  if (HIGH_RISK_LEVELS.has(risk)) {
    score += 2;
    signals.push(`risk:${risk}`);
  }

  const verdict = (input.verdict ?? "").toUpperCase();
  if (FAILURE_VERDICTS.has(verdict)) {
    score += 2;
    signals.push(`verdict:${verdict}`);
  }

  if ((input.acceptanceCriteriaCount ?? 0) >= MANY_CRITERIA) {
    score += 1;
    signals.push(`criteria:${input.acceptanceCriteriaCount}`);
  }

  const level: ComplexityLevel = score >= COMPLEX_SCORE_THRESHOLD ? "COMPLEX" : "STANDARD";
  return { level, score, signals };
}

/**
 * Maps a complexity level to the parameter escalation the responsible agent
 * should receive. COMPLEX → reasoning ON at high effort; STANDARD → no change.
 * The resolver applies this only when the provider supports reasoning, so this
 * is always safe to pass through.
 */
export function escalationFor(level: ComplexityLevel): ParameterEscalation {
  if (level === "COMPLEX") {
    return { reasoning: true, reasoningEffort: "high" };
  }
  return { reasoning: false };
}
