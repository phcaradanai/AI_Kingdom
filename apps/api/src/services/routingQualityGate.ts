/**
 * M15F — Project Inbox Routing Quality Gate.
 *
 * Pure-function module for routing quality classification, generic keyword
 * filtering, and human-readable title / reason generation.
 * No database dependency — designed for unit-testability.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoutingQuality = "HIGH" | "MEDIUM" | "LOW" | "DEBUG_ONLY" | "NO_MATCH";
export type DataQualityLabel = "TRUSTED_SOURCE" | "REVIEW_REQUIRED" | "LEGACY" | "TEST" | "UNKNOWN_SOURCE";

export type MatchSignal = {
  type: "project_name" | "codename" | "alias" | "keyword" | "source_ancestry" | "repo_path";
  value: string;
  projectName: string;
  score: number;
};

export type RoutingQualityResult = {
  routingQuality: RoutingQuality;
  evidence: MatchSignal[];
  ignoredSignals: MatchSignal[];
  humanTitle: string;
  humanReason: string;
};

// ---------------------------------------------------------------------------
// Generic keyword denylist
// ---------------------------------------------------------------------------

export const GENERIC_KEYWORD_DENYLIST = new Set([
  "matter",
  "notice",
  "test",
  "desc",
  "first",
  "second",
  "critical",
  "high",
  "medium",
  "low",
  "general",
  "system",
  "implementation",
  "report",
  "work",
  "project",
  "inbox",
  "source",
  "detected"
]);

/**
 * Returns true if `keyword` (after normalisation) is on the denylist.
 * Multi-word keywords containing a denied word are NOT denied — the entire
 * normalised keyword must equal a denied word.
 */
export function isGenericKeyword(keyword: string): boolean {
  const normalised = keyword.toLowerCase().trim();
  return GENERIC_KEYWORD_DENYLIST.has(normalised);
}

// ---------------------------------------------------------------------------
// Strong-signal classification
// ---------------------------------------------------------------------------

const STRONG_SIGNAL_TYPES = new Set<MatchSignal["type"]>([
  "project_name",
  "codename",
  "alias",
  "source_ancestry",
  "repo_path"
]);

function hasStrongSignal(signals: MatchSignal[]): boolean {
  return signals.some((signal) => STRONG_SIGNAL_TYPES.has(signal.type));
}

// ---------------------------------------------------------------------------
// Quality classification
// ---------------------------------------------------------------------------

export function classifyRoutingQuality(
  confidenceScore: number,
  allSignals: MatchSignal[]
): { routingQuality: RoutingQuality; evidence: MatchSignal[]; ignoredSignals: MatchSignal[] } {
  const evidence: MatchSignal[] = [];
  const ignoredSignals: MatchSignal[] = [];

  for (const signal of allSignals) {
    if (signal.type === "keyword" && isGenericKeyword(signal.value)) {
      ignoredSignals.push(signal);
    } else {
      evidence.push(signal);
    }
  }

  // No evidence at all
  if (allSignals.length === 0) {
    return { routingQuality: "NO_MATCH", evidence, ignoredSignals };
  }

  // All evidence was generic keywords — debug/noise only
  if (evidence.length === 0 && ignoredSignals.length > 0) {
    return { routingQuality: "DEBUG_ONLY", evidence, ignoredSignals };
  }

  if (confidenceScore < 40) {
    return { routingQuality: "LOW", evidence, ignoredSignals };
  }

  if (confidenceScore >= 70) {
    return { routingQuality: "HIGH", evidence, ignoredSignals };
  }

  // 40–69: need a strong signal
  if (hasStrongSignal(evidence)) {
    return { routingQuality: "MEDIUM", evidence, ignoredSignals };
  }

  return { routingQuality: "LOW", evidence, ignoredSignals };
}

/**
 * Returns true when a routing quality should produce a normal inbox item.
 */
export function shouldCreateInboxItem(routingQuality: RoutingQuality): boolean {
  return routingQuality === "HIGH" || routingQuality === "MEDIUM";
}

// ---------------------------------------------------------------------------
// Human-readable title generation
// ---------------------------------------------------------------------------

/** Regex for timestamp / hash suffixes commonly appended to generated titles. */
const GENERATED_SUFFIX_RE = /[\s\-_]+[0-9a-f]{8,}[\s\-]*[0-9a-f]*$/i;
const TIMESTAMP_SUFFIX_RE = /[\s\-_]+\d{10,}[\s\-]*[0-9a-f]*$/i;
const FULL_CAPS_RE = /^[A-Z0-9\s\-_:]+$/;

export function generateHumanTitle(rawTitle: string): string {
  let title = rawTitle.trim();

  // Strip hash/timestamp suffixes
  title = title.replace(GENERATED_SUFFIX_RE, "");
  title = title.replace(TIMESTAMP_SUFFIX_RE, "");
  title = title.trim();

  if (!title) return "Project routing review";

  // Convert ALL-CAPS to sentence case
  if (FULL_CAPS_RE.test(title) && title.length > 3) {
    title = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
  }

  // If still looks generated (has long hex sequences), wrap it
  if (/[0-9a-f]{6,}/i.test(title)) {
    return `Project routing review: ${title}`;
  }

  return title;
}

// ---------------------------------------------------------------------------
// Human-readable reason generation
// ---------------------------------------------------------------------------

export function generateHumanReason(
  routingQuality: RoutingQuality,
  evidence: MatchSignal[],
  ignoredSignals: MatchSignal[],
  suggestedProjectName: string | null
): string {
  if (routingQuality === "NO_MATCH") {
    return "No reliable project evidence found.";
  }

  if (routingQuality === "DEBUG_ONLY") {
    const keywords = ignoredSignals.map((s) => `'${s.value}'`).join(", ");
    return `Low-confidence match: only generic wording matched (${keywords}). Manual review required.`;
  }

  if (routingQuality === "LOW") {
    if (evidence.length === 0) {
      return "Low-confidence match: no strong project signals found. Manual review required.";
    }
    const desc = evidence.map((s) => describeSignal(s)).join("; ");
    return `Low-confidence match: ${desc}. Manual review required.`;
  }

  // MEDIUM or HIGH — describe the strongest evidence
  const projectName = suggestedProjectName ?? "a project";
  const descriptions = evidence.map((s) => describeSignalForProject(s, projectName));
  return descriptions.join(". ") + ".";
}

function describeSignal(signal: MatchSignal): string {
  switch (signal.type) {
    case "project_name": return `exact project name '${signal.value}'`;
    case "codename": return `codename '${signal.value}'`;
    case "alias": return `alias '${signal.value}'`;
    case "keyword": return `keyword '${signal.value}'`;
    case "source_ancestry": return "source ancestry link";
    case "repo_path": return "repository path match";
    default: return signal.value;
  }
}

function describeSignalForProject(signal: MatchSignal, projectName: string): string {
  switch (signal.type) {
    case "project_name": return `Matched ${projectName} by exact project name`;
    case "codename": return `Matched ${projectName} by codename '${signal.value}'`;
    case "alias": return `Matched ${projectName} by project alias '${signal.value}'`;
    case "keyword": return `Matched ${projectName} by keyword '${signal.value}'`;
    case "source_ancestry": return `Matched ${projectName} by source ancestry`;
    case "repo_path": return `Matched ${projectName} by repository path`;
    default: return `Matched ${projectName}`;
  }
}

// ---------------------------------------------------------------------------
// Data quality label
// ---------------------------------------------------------------------------

export function classifyDataQualityLabel(
  sourceType: string | null,
  sourceId: string | null,
  createdBySystem: boolean
): DataQualityLabel {
  if (isTestSourceValue(sourceType) || isTestSourceValue(sourceId)) {
    return "TEST";
  }
  if (sourceType && sourceId && createdBySystem) {
    return "TRUSTED_SOURCE";
  }
  if (sourceType && sourceId) {
    return "REVIEW_REQUIRED";
  }
  return "UNKNOWN_SOURCE";
}

function isTestSourceValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === "test" || lower.startsWith("test:") || lower.includes("source test");
}
