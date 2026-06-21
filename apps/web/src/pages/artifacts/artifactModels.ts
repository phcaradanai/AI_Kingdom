import type { ArtifactDto, ArtifactPayload, ArtifactType, DataQuality } from "@/types/api";

export const artifactTypes: ArtifactType[] = ["PROMPT", "SPEC", "DECISION", "IMPLEMENTATION_REPORT", "HANDOFF_BRIEF", "ARCHITECTURE_NOTE", "MARKET_RESEARCH", "CODE_PLAN", "ROYAL_DECREE", "GENERAL_NOTE"];
export const artifactQualities: DataQuality[] = ["TRUSTED", "REVIEW_REQUIRED", "TEST", "LEGACY", "UNKNOWN_SOURCE"];

export const blankArtifact: ArtifactPayload = {
  projectId: null,
  title: "",
  type: "GENERAL_NOTE",
  content: "",
  sourceType: "",
  sourceId: "",
  tags: []
};

export type ArtifactFilters = {
  query: string;
  projectId: string;
  type: ArtifactType | "";
  tag: string;
  dataQuality: DataQuality | "";
  includeTestData: boolean;
};

export const initialArtifactFilters: ArtifactFilters = {
  query: "",
  projectId: "",
  type: "",
  tag: "",
  dataQuality: "",
  includeTestData: false
};

export const selectClassName = "min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm";

export function toArtifactPayload(artifact: ArtifactDto): ArtifactPayload {
  return {
    projectId: artifact.projectId,
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    sourceType: artifact.sourceType,
    sourceId: artifact.sourceId,
    traceId: artifact.traceId,
    tags: artifact.tags
  };
}

export function cleanArtifactPayload(artifact: ArtifactPayload): ArtifactPayload {
  return {
    ...artifact,
    projectId: artifact.projectId || null,
    sourceType: artifact.sourceType || null,
    sourceId: artifact.sourceId || null,
    traceId: artifact.traceId || null,
    tags: artifact.tags ?? []
  };
}

export function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function matchesArtifactSearch(artifact: ArtifactDto, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [artifact.title, artifact.content, artifact.humanReadableSource, artifact.sourceType, artifact.sourceId, artifact.project?.name, ...artifact.tags]
    .some((value) => value?.toLowerCase().includes(normalized));
}

export function groupArtifacts(artifacts: ArtifactDto[]) {
  const order = ["Work Order", "Implementation Report", "Council Session", "Trace", "Project", "Other Source", "Unassigned"];
  const groups = new Map<string, ArtifactDto[]>();
  for (const artifact of artifacts) {
    const label = sourceGroup(artifact);
    groups.set(label, [...(groups.get(label) ?? []), artifact]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => order.indexOf(left) - order.indexOf(right))
    .map(([label, items]) => ({ label, items }));
}

export function sourceGroup(artifact: ArtifactDto) {
  const type = artifact.sourceType?.toUpperCase();
  if (type === "WORK_ORDER") return "Work Order";
  if (type === "IMPLEMENTATION_REPORT") return "Implementation Report";
  if (type === "COUNCIL_SESSION") return "Council Session";
  if (type === "TRACE" || type === "AI_USAGE_TRACE" || artifact.traceId) return "Trace";
  if (type === "PROJECT" || artifact.projectId) return "Project";
  if (!artifact.projectId && !artifact.sourceType && !artifact.sourceId) return "Unassigned";
  return "Other Source";
}

export function sourceSummary(artifact: ArtifactDto) {
  if (artifact.humanReadableSource && artifact.humanReadableSource !== "Unknown source") return artifact.humanReadableSource;
  if (artifact.project?.name) return artifact.project.name;
  return "";
}

export function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function qualityClass(value: DataQuality) {
  const base = "inline-flex rounded-full border px-2 py-1 text-xs font-medium";
  if (value === "TRUSTED") return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-300`;
  if (value === "REVIEW_REQUIRED") return `${base} border-amber-500/30 bg-amber-500/10 text-amber-300`;
  if (value === "TEST") return `${base} border-red-500/30 bg-red-500/10 text-red-300`;
  if (value === "LEGACY") return `${base} border-sky-500/30 bg-sky-500/10 text-sky-300`;
  return `${base} border-border bg-muted/30 text-muted-foreground`;
}
