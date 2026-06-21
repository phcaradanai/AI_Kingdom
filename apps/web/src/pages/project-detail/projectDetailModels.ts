import type {
  ArtifactDto,
  ContextBindingStatusDto,
  LocalDocumentSnapshotDto,
  MatterDto,
  MemoryDto,
  ProjectOverviewDto,
  ReportDto,
  TaskDto,
  WorkOrderDto
} from "@/types/api";

export type ProjectWorkspaceData = {
  overview: ProjectOverviewDto;
  tasks: TaskDto[];
  matters: MatterDto[];
  workOrders: WorkOrderDto[];
  reports: ReportDto[];
  memories: MemoryDto[];
  artifacts: ArtifactDto[];
};

export function deriveProjectContextHealth(
  snapshot: LocalDocumentSnapshotDto | null,
  workOrders: WorkOrderDto[]
): ContextBindingStatusDto {
  if (snapshot?.isStale || snapshot?.scanStatus === "STALE") return "STALE";
  const active = workOrders.filter((order) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(order.status));
  if (active.some((order) => order.contextBindingStatus === "MISSING")) return "MISSING";
  if (active.some((order) => order.contextBindingStatus === "STALE")) return "STALE";
  if (active.some((order) => order.contextBindingStatus === "PARTIAL")) return "PARTIAL";
  return snapshot ? "FRESH" : "MISSING";
}

export function contextStatusClass(status: ContextBindingStatusDto) {
  if (status === "FRESH") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "MISSING") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "STALE") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

export function isActiveWorkOrder(status: string) {
  return !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(status);
}
