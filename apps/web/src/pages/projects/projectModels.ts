import type { ContextBindingStatusDto, ProjectDto, ProjectPayload, ProjectPriority, ProjectStatus, WorkOrderDto } from "@/types/api";

export type ProjectSummary = {
  contextStatus: ContextBindingStatusDto | "UNKNOWN";
  activeWorkCount: number;
  affectedWorkCount: number;
  lastContextBoundAt: string | null;
  loadError: boolean;
};

export type ProjectFilters = {
  query: string;
  status: "" | ProjectStatus;
  priority: "" | ProjectPriority;
};

export const projectStatuses: ProjectStatus[] = ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
export const projectPriorities: ProjectPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const blankProject: ProjectPayload = {
  name: "",
  codename: "",
  description: "",
  status: "ACTIVE",
  priority: "MEDIUM",
  goals: [],
  keywords: [],
  aliases: [],
  repositoryUrl: "",
  localPath: "",
  activeMilestone: ""
};

export const selectClassName =
  "h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

export function deriveContextStatus(workOrders: WorkOrderDto[]): ContextBindingStatusDto | "UNKNOWN" {
  const active = workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
  if (active.length === 0) return "FRESH";
  if (active.some((order) => order.contextBindingStatus === "MISSING")) return "MISSING";
  if (active.some((order) => order.contextBindingStatus === "STALE")) return "STALE";
  if (active.some((order) => order.contextBindingStatus === "PARTIAL")) return "PARTIAL";
  if (active.every((order) => order.contextBindingStatus === "FRESH")) return "FRESH";
  return "UNKNOWN";
}

export function contextStatusClass(status: ContextBindingStatusDto | "UNKNOWN") {
  if (status === "FRESH") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "MISSING") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "STALE") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "PARTIAL") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
  return "border-border bg-muted/30 text-muted-foreground";
}

export function toProjectPayload(project: ProjectDto): ProjectPayload {
  return {
    name: project.name,
    codename: project.codename,
    description: project.description,
    status: project.status,
    priority: project.priority,
    goals: project.goals,
    keywords: project.keywords,
    aliases: project.aliases,
    repositoryUrl: project.repositoryUrl,
    localPath: project.localPath,
    activeMilestone: project.activeMilestone
  };
}

export function cleanProjectPayload(draft: ProjectPayload): ProjectPayload {
  return {
    ...draft,
    name: draft.name.trim(),
    codename: draft.codename?.trim() || null,
    description: draft.description?.trim() || "",
    goals: draft.goals?.filter(Boolean) ?? [],
    keywords: draft.keywords?.filter(Boolean) ?? [],
    aliases: draft.aliases?.filter(Boolean) ?? [],
    repositoryUrl: draft.repositoryUrl?.trim() || null,
    localPath: draft.localPath?.trim() || null,
    activeMilestone: draft.activeMilestone?.trim() || null
  };
}

export function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
