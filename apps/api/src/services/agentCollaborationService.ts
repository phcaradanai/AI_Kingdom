// M25-C: Agent Collaboration Protocol
// Pure functions for detecting when the Researcher's output signals a gap
// that the Archivist can resolve with a targeted follow-up sub-query.
// All functions here are side-effect-free for testability.

export type CollaborationGapResult =
  | { needed: false }
  | { needed: true; question: string; researcherSnippet: string };

const UNCERTAINTY_MARKERS = [
  "inconclusive",
  "insufficient evidence",
  "cannot determine",
  "unclear",
  "additional evidence needed",
  "requires clarification",
  "not enough information",
  "needs investigation",
];

// Returns true when the Researcher response contains a recognised uncertainty
// signal that would benefit from Archivist clarification.
export function hasUncertaintySignal(researcherResponse: string): boolean {
  const lower = researcherResponse.toLowerCase();
  return UNCERTAINTY_MARKERS.some((m) => lower.includes(m));
}

// Extracts the body of the Researcher's section header (first 400 chars)
// to use as the collaboration context snippet.
export function extractResearcherUncertainty(researcherResponse: string): string {
  const sectionMatch = researcherResponse.match(
    /Researcher (?:Hypothes(?:is|es)|Options Analysis|Requirements Analysis|Implementation Validation)[^\n]*\n([\s\S]{1,400})/i
  );
  const body = sectionMatch?.[1]?.trim() ?? researcherResponse.slice(0, 300).trim();
  return body.slice(0, 400);
}

// Composes the targeted sub-query that gets sent to the Archivist as
// `previousCouncilContext` in the collaboration pass.
export function buildCollaborationQuestion(researcherSnippet: string): string {
  return [
    "COLLABORATION REQUEST — from Royal Researcher",
    "",
    "The Researcher expressed uncertainty during their analysis. The specific passage:",
    "",
    researcherSnippet,
    "",
    "Please review your earlier evidence and provide:",
    "1. Any specific evidence (exact file paths, log entries, or documented patterns) that bears on this uncertainty.",
    "2. Whether your findings confirm, refute, or leave unresolved the Researcher's concern.",
    "",
    "Keep your response focused: 3–5 concrete evidence items only. Do not re-summarise your full earlier report."
  ].join("\n");
}

// Top-level detector called after the specialist wave to decide whether a
// Researcher→Archivist collaboration sub-query should fire.
// Returns { needed: false } when no actionable gap is found.
export function detectCollaborationGap(
  archivistResponse: string,
  researcherResponse: string
): CollaborationGapResult {
  if (!researcherResponse || !archivistResponse) return { needed: false };
  if (!hasUncertaintySignal(researcherResponse)) return { needed: false };

  const researcherSnippet = extractResearcherUncertainty(researcherResponse);
  if (!researcherSnippet) return { needed: false };

  return {
    needed: true,
    question: buildCollaborationQuestion(researcherSnippet),
    researcherSnippet,
  };
}
