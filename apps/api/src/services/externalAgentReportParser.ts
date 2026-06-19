// Pure, dependency-free parser for turning an external agent's free-text response
// into ImplementationReport fields. Kept free of Prisma/provider imports so it can be
// unit-tested in isolation without a database.

export type ParsedImplementationReport = {
  summary: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  testResult: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";
  errors: string[];
  decisionsMade: string[];
  remainingWork: string[];
  nextRecommendedAction: string | null;
};

type SectionKey =
  | "summary"
  | "filesChanged"
  | "commandsRun"
  | "testsRun"
  | "testResult"
  | "decisionsMade"
  | "errors"
  | "remainingWork"
  | "nextRecommendedAction";

// Ordered so that more specific headings ("files changed") are matched before generic ones ("files").
const HEADINGS: { key: SectionKey; words: string[] }[] = [
  { key: "summary", words: ["summary", "overview"] },
  { key: "filesChanged", words: ["files changed", "files modified", "changed files", "files"] },
  { key: "commandsRun", words: ["commands run", "commands executed", "commands"] },
  { key: "testsRun", words: ["tests run", "tests executed", "tests"] },
  { key: "testResult", words: ["test result", "test results", "result"] },
  { key: "decisionsMade", words: ["decisions made", "decisions"] },
  { key: "errors", words: ["issues found", "issues", "errors", "problems"] },
  { key: "remainingWork", words: ["remaining work", "remaining", "todo", "to do"] },
  { key: "nextRecommendedAction", words: ["recommended next step", "next step", "next steps", "recommendation", "recommended"] }
];

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
}

/** Detect whether a line is a section heading; returns the section key plus any trailing inline content. */
function matchHeading(rawLine: string): { key: SectionKey; rest: string } | null {
  // Normalize: drop leading list/number markers and markdown heading/bold markers.
  const normalized = rawLine
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
  for (const heading of HEADINGS) {
    for (const word of heading.words) {
      const re = new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-–]?\\s*(.*)$`, "i");
      const m = normalized.match(re);
      if (m) return { key: heading.key, rest: m[1]?.trim() ?? "" };
    }
  }
  return null;
}

function toItems(lines: string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const cleaned = stripListMarker(line);
    if (!cleaned) continue;
    if (/^(none|n\/?a|no [a-z ]+|not applicable)\.?$/i.test(cleaned)) continue;
    // A single comma-joined line becomes multiple items.
    if (!/^\s*(?:[-*•]|\d+[.)])/.test(line) && cleaned.includes(",") && items.length === 0 && lines.length === 1) {
      for (const part of cleaned.split(",").map((p) => p.trim()).filter(Boolean)) items.push(part);
      continue;
    }
    items.push(cleaned);
  }
  return items;
}

function detectTestResult(text: string): ParsedImplementationReport["testResult"] {
  const t = text.toLowerCase();
  if (/\b(partial|partially|some (tests )?fail|mixed)\b/.test(t)) return "PARTIAL";
  if (/\b(fail|failed|failing|error)\b/.test(t)) return "FAILED";
  if (/\b(pass|passed|passing|success|succeeded|all green|ok)\b/.test(t)) return "PASSED";
  return "NOT_RUN";
}

/**
 * Best-effort parse of an external agent's free-text response into ImplementationReport fields.
 * The dispatch prompt requests a numbered "Required Final Response Format"; this tolerates
 * markdown, numbered/bulleted lists, and missing sections. Pure function — safe to unit test.
 */
export function parseImplementationReportText(text: string): ParsedImplementationReport {
  const buffers: Record<SectionKey, string[]> = {
    summary: [],
    filesChanged: [],
    commandsRun: [],
    testsRun: [],
    testResult: [],
    decisionsMade: [],
    errors: [],
    remainingWork: [],
    nextRecommendedAction: []
  };

  let current: SectionKey = "summary";
  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const heading = matchHeading(rawLine);
    if (heading) {
      current = heading.key;
      if (heading.rest) buffers[current].push(heading.rest);
      continue;
    }
    buffers[current].push(rawLine.trim());
  }

  const summary = buffers.summary.join(" ").trim() || (text ?? "").trim().slice(0, 800);
  const nextRaw = buffers.nextRecommendedAction.map(stripListMarker).filter(Boolean).join(" ").trim();

  return {
    summary: summary.slice(0, 4000),
    filesChanged: toItems(buffers.filesChanged).slice(0, 50),
    commandsRun: toItems(buffers.commandsRun).slice(0, 50),
    testsRun: toItems(buffers.testsRun).slice(0, 50),
    testResult: detectTestResult(buffers.testResult.join(" ")),
    errors: toItems(buffers.errors).slice(0, 50),
    decisionsMade: toItems(buffers.decisionsMade).slice(0, 50),
    remainingWork: toItems(buffers.remainingWork).slice(0, 50),
    nextRecommendedAction: nextRaw ? nextRaw.slice(0, 1000) : null
  };
}
