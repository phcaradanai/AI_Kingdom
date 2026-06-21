import type {
  DataQuality,
  ProjectDto,
  ProjectInboxItemDto,
  ProjectInboxStatus,
  RoutingQuality
} from "@/types/api";

export const projectInboxStatuses: ProjectInboxStatus[] = ["PENDING", "ASSIGNED", "DISMISSED", "ARCHIVED"];
export const projectInboxQualities: DataQuality[] = ["TRUSTED", "REVIEW_REQUIRED", "TEST", "LEGACY", "UNKNOWN_SOURCE"];
export const projectInboxRoutingQualities: RoutingQuality[] = ["HIGH", "MEDIUM", "LOW", "DEBUG_ONLY", "NO_MATCH"];

export type ConfidenceFilter = "" | "none" | "low" | "medium" | "high";

export type ProjectInboxFilters = {
  query: string;
  status: ProjectInboxStatus | "";
  dataQuality: DataQuality | "";
  routingQuality: RoutingQuality | "";
  confidence: ConfidenceFilter;
  sourceType: string;
  suggestedProjectId: string;
  includeTestData: boolean;
  includeDebug: boolean;
};

export type RoutingEvidence = {
  type: string;
  value: string;
  projectName?: string;
};

export const initialProjectInboxFilters: ProjectInboxFilters = {
  query: "",
  status: "PENDING",
  dataQuality: "",
  routingQuality: "",
  confidence: "",
  sourceType: "",
  suggestedProjectId: "",
  includeTestData: false,
  includeDebug: false
};

export const selectClassName = "min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm";

export function displayTitle(item: ProjectInboxItemDto) {
  return item.humanTitle || item.title;
}

export function displayReason(item: ProjectInboxItemDto) {
  return item.humanReason || item.reason || "";
}

export function matchesProjectInboxSearch(item: ProjectInboxItemDto, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [displayTitle(item), item.summary, displayReason(item), item.sourceType, item.sourceId]
    .some((value) => value?.toLowerCase().includes(normalized));
}

export function candidateProjects(item: ProjectInboxItemDto, projectById: Map<string, ProjectDto>) {
  return item.candidateProjectIds.map((id) => projectById.get(id)).filter(Boolean) as ProjectDto[];
}

export function routingEvidence(item: ProjectInboxItemDto): RoutingEvidence[] {
  return (item.evidence ?? []).flatMap((entry) => {
    const type = typeof entry.type === "string" ? entry.type : "evidence";
    const value = typeof entry.value === "string" ? entry.value : "";
    const projectName = typeof entry.projectName === "string" ? entry.projectName : undefined;
    return value || type === "source_ancestry" ? [{ type, value, projectName }] : [];
  });
}

export function ignoredSignals(item: ProjectInboxItemDto) {
  return (item.ignoredSignals ?? []).flatMap((entry) => typeof entry.value === "string" ? [entry.value] : []);
}

export function confidenceBand(score: number | null): "none" | "low" | "medium" | "high" {
  const value = score ?? 0;
  if (value <= 0) return "none";
  if (value < 40) return "low";
  if (value < 70) return "medium";
  return "high";
}

export function confidenceClass(score: number | null) {
  const base = "inline-flex rounded-full border px-2 py-1 text-xs font-semibold tabular-nums";
  const band = confidenceBand(score);
  if (band === "high") return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-300`;
  if (band === "medium") return `${base} border-amber-500/30 bg-amber-500/10 text-amber-300`;
  if (band === "low") return `${base} border-red-500/30 bg-red-500/10 text-red-300`;
  return `${base} border-border bg-muted/30 text-muted-foreground`;
}

export function qualityClass(value: string | null | undefined) {
  const base = "inline-flex rounded-full border px-2 py-1 text-xs font-medium";
  if (value === "TRUSTED" || value === "TRUSTED_SOURCE") return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-300`;
  if (value === "REVIEW_REQUIRED") return `${base} border-amber-500/30 bg-amber-500/10 text-amber-300`;
  if (value === "TEST") return `${base} border-red-500/30 bg-red-500/10 text-red-300`;
  if (value === "LEGACY") return `${base} border-sky-500/30 bg-sky-500/10 text-sky-300`;
  return `${base} border-border bg-muted/30 text-muted-foreground`;
}

export function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function evidenceLabel(evidence: RoutingEvidence) {
  if (evidence.type === "source_ancestry") return "Source ancestry";
  if (evidence.type === "repo_path") return "Repository path match";
  return `${humanize(evidence.type)}${evidence.value ? `: ${evidence.value}` : ""}`;
}
