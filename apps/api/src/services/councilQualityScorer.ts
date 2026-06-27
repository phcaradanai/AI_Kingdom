/**
 * Deterministic quality scorer for Grand Vizier synthesis output.
 *
 * Scores the GV's final synthesis against the sharpened role contracts
 * (precision / anti-drift). Zero AI calls — pure text pattern analysis.
 *
 * Six criteria; score = passedWeight / totalWeight.
 * hasRecommendation carries double weight — it is the single most
 * important anti-drift signal ("My recommendation: [one action]").
 *
 * Memory auto-save is gated at score >= QUALITY_GATE_THRESHOLD.
 */

export interface QualityFlags {
  hasRecommendation: boolean;
  hasVerdict: boolean;
  citesRoles: boolean;
  noUnresolvedHedge: boolean;
  noVagueFileRefs: boolean;
  hasSpecificPaths: boolean;
}

export interface QualityResult {
  score: number;
  flags: QualityFlags;
  passed: string[];
  failed: string[];
}

export const QUALITY_GATE_THRESHOLD = 0.5;

const ROLE_NAMES = [
  "archivist", "researcher", "architect", "general", "scribe",
  "royal-archivist", "royal-researcher", "royal-architect",
];

const VAGUE_FILE_PATTERNS = [
  /update\s+(?:the\s+)?relevant\s+files/i,
  /modify\s+(?:the\s+)?relevant\s+files/i,
  /update\s+(?:the\s+)?appropriate\s+files/i,
  /modify\s+(?:the\s+)?appropriate\s+files/i,
  /update\s+the\s+files/i,
  /in\s+the\s+relevant\s+(?:file|module|service|component)/i,
];

const FILE_PATH_PATTERN =
  /\b(?:apps|src|lib|packages?|scripts?|prisma|test|tests|__tests__|components?|services?|routes?|pages?|hooks?|utils?|types?|config|middleware|db)\/[\w./-]+\.(?:tsx?|jsx?|py|json|prisma|sql|css|scss|md|yaml|yml|sh|mjs|cjs)\b/;

const VERDICT_SECTION_PATTERN =
  /Grand Vizier (?:Final Decision|Counsel|Strategic Recommendation|Execution Decision)/i;

const VERDICT_CONTENT_PATTERN =
  /(?:root cause\s+(?:is|:)|most likely\s+(?:cause|root)|recommended approach\s*:|the fix\s+is|exact fix\s*:|single objective\s*:|safe to auto-execute|requires King (?:review|approval)|BLOCKED\s*:|one (?:preferred|specific|recommended) (?:answer|action|approach))/i;

function checkNoUnresolvedHedge(text: string): boolean {
  const lower = text.toLowerCase();
  const idx = lower.indexOf("it depends");
  if (idx === -1) return true;
  // "it depends" is acceptable only when followed by a named variable within 150 chars
  const window = lower.slice(idx, idx + 150);
  return /it depends\s+(?:on|whether)\s+\w/.test(window) && window.includes(":");
}

function countRolesReferenced(text: string): number {
  const lower = text.toLowerCase();
  return ROLE_NAMES.filter((name) => lower.includes(name)).length;
}

export function scoreCouncilSynthesis(
  synthesis: string,
  mode?: string | null,
): QualityResult {
  const isCodeMode = mode === "BUILD" || mode === "RESEARCH";
  const flags: QualityFlags = {
    hasRecommendation: /my recommendation\s*:/i.test(synthesis),
    hasVerdict:
      VERDICT_SECTION_PATTERN.test(synthesis) ||
      VERDICT_CONTENT_PATTERN.test(synthesis),
    citesRoles: countRolesReferenced(synthesis) >= 2,
    noUnresolvedHedge: checkNoUnresolvedHedge(synthesis),
    noVagueFileRefs: !VAGUE_FILE_PATTERNS.some((p) => p.test(synthesis)),
    hasSpecificPaths: FILE_PATH_PATTERN.test(synthesis),
  };

  // Weight: hasRecommendation = 2, others = 1; hasSpecificPaths = 0 for ASK/PLAN
  const WEIGHTS: Record<keyof QualityFlags, number> = {
    hasRecommendation: 2,
    hasVerdict: 1,
    citesRoles: 1,
    noUnresolvedHedge: 1,
    noVagueFileRefs: 1,
    hasSpecificPaths: isCodeMode ? 1 : 0,
  };

  let earned = 0;
  let total = 0;
  const passed: string[] = [];
  const failed: string[] = [];

  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof QualityFlags, number][]) {
    if (weight === 0) continue;
    total += weight;
    if (flags[key]) {
      earned += weight;
      passed.push(key);
    } else {
      failed.push(key);
    }
  }

  const score = total > 0 ? Math.round((earned / total) * 100) / 100 : 0;
  return { score, flags, passed, failed };
}
