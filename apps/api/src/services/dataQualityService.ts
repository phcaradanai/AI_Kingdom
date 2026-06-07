import { prisma } from "../db/prisma.js";

export type DataQuality = "TRUSTED" | "REVIEW_REQUIRED" | "TEST" | "LEGACY" | "UNKNOWN_SOURCE";

type QualityRecord = {
  id?: string;
  title?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  dataSource?: string | null;
  dataQuality?: string | null;
  provenance?: unknown;
  traceId?: string | null;
  isTestData?: boolean;
  createdBySystem?: boolean;
  createdAt?: Date | string;
  confidenceScore?: number | null;
};

export type DataQualityBadge = {
  quality: DataQuality;
  label: string;
  tone: "trusted" | "review" | "test" | "legacy" | "unknown";
};

export type SourceLink = {
  label: string;
  title: string | null;
  href: string | null;
  type: string | null;
  id: string | null;
};

const LEGACY_CUTOFF = new Date("2026-06-07T18:00:00.000Z");

export function classifyMatter(record: QualityRecord): DataQuality {
  return classifyRecord(record, "matter");
}

export function classifyNotice(record: QualityRecord): DataQuality {
  return classifyRecord(record, "notice");
}

export function classifyProjectInboxItem(record: QualityRecord): DataQuality {
  return classifyRecord(record, "projectInboxItem");
}

export function classifyArtifact(record: QualityRecord): DataQuality {
  return classifyRecord(record, "artifact");
}

export function getDataQualityBadge(record: QualityRecord): DataQualityBadge {
  const quality = normalizeQuality(record.dataQuality) ?? classifyRecord(record);
  switch (quality) {
    case "TRUSTED":
      return { quality, label: "Trusted", tone: "trusted" };
    case "REVIEW_REQUIRED":
      return { quality, label: "Review required", tone: "review" };
    case "TEST":
      return { quality, label: "Test data", tone: "test" };
    case "LEGACY":
      return { quality, label: "Legacy", tone: "legacy" };
    case "UNKNOWN_SOURCE":
      return { quality, label: "Unknown source", tone: "unknown" };
  }
}

export async function getHumanReadableSource(record: QualityRecord): Promise<SourceLink> {
  const sourceType = normalizeSourceType(record.sourceType);
  const sourceId = record.sourceId ?? null;
  if (!sourceType || !sourceId) {
    return { label: "Unknown source", title: null, href: null, type: sourceType, id: sourceId };
  }

  const fallback = humanizeSourceType(sourceType);
  try {
    switch (sourceType) {
      case "NOTICE": {
        const notice = await prisma.notice.findUnique({ where: { id: sourceId }, select: { title: true } });
        return sourceLink(fallback, notice?.title ?? null, `/notices`, sourceType, sourceId);
      }
      case "MATTER": {
        const matter = await prisma.matter.findUnique({ where: { id: sourceId }, select: { title: true } });
        return sourceLink(fallback, matter?.title ?? null, `/matters`, sourceType, sourceId);
      }
      case "WORK_ORDER": {
        const workOrder = await prisma.workOrder.findUnique({ where: { id: sourceId }, select: { title: true } });
        return sourceLink(fallback, workOrder?.title ?? null, `/work-orders`, sourceType, sourceId);
      }
      case "IMPLEMENTATION_REPORT": {
        const report = await prisma.implementationReport.findUnique({
          where: { id: sourceId },
          select: { summary: true, workOrder: { select: { title: true } } }
        });
        const title = report ? `Implementation Report: ${report.workOrder.title || trim(report.summary, 80)}` : null;
        return sourceLink(fallback, title, `/work-orders`, sourceType, sourceId);
      }
      case "COUNCIL_SESSION": {
        const session = await prisma.councilSession.findUnique({
          where: { id: sourceId },
          select: { task: { select: { title: true } } }
        });
        return sourceLink(fallback, session?.task.title ?? null, `/council`, sourceType, sourceId);
      }
      case "TRACE":
      case "AI_USAGE_TRACE": {
        const trace = await prisma.aIUsageTrace.findUnique({ where: { traceId: sourceId }, select: { operation: true, traceId: true } });
        return sourceLink("Trace", trace ? `${trace.operation} (${trace.traceId})` : null, `/usage-traces/${encodeURIComponent(sourceId)}`, sourceType, sourceId);
      }
      case "PROJECT": {
        const project = await prisma.project.findUnique({ where: { id: sourceId }, select: { id: true, name: true } });
        return sourceLink(fallback, project?.name ?? null, project ? `/projects/${project.id}` : null, sourceType, sourceId);
      }
      case "TASK": {
        const task = await prisma.task.findUnique({ where: { id: sourceId }, select: { title: true } });
        return sourceLink(fallback, task?.title ?? null, `/throne-room`, sourceType, sourceId);
      }
      case "ARTIFACT": {
        const artifact = await prisma.artifact.findUnique({ where: { id: sourceId }, select: { title: true } });
        return sourceLink(fallback, artifact?.title ?? null, `/artifacts`, sourceType, sourceId);
      }
      default:
        return { label: fallback, title: null, href: null, type: sourceType, id: sourceId };
    }
  } catch {
    return { label: fallback, title: null, href: null, type: sourceType, id: sourceId };
  }
}

export function classifyWorkOrder(record: QualityRecord): DataQuality {
  return classifyRecord(record, "workOrder");
}

export async function enrichDataQuality<T extends QualityRecord>(
  kind: "matter" | "notice" | "projectInboxItem" | "artifact" | "workOrder",
  records: T[]
): Promise<Array<T & { dataQuality: DataQuality; dataQualityBadge: DataQualityBadge; humanReadableSource: string; sourceLink: SourceLink }>> {
  return Promise.all(records.map(async (record) => {
    const dataQuality = classifyByKind(kind, record);
    const qualityRecord = { ...record, dataQuality };
    const sourceLink = await getHumanReadableSource(record);
    return {
      ...record,
      dataQuality,
      dataQualityBadge: getDataQualityBadge(qualityRecord),
      humanReadableSource: formatSourceLabel(sourceLink),
      sourceLink
    };
  }));
}

export function shouldIncludeByQuality(record: QualityRecord, quality: DataQuality, params: { includeTestData?: boolean; dataQuality?: DataQuality }) {
  if (params.dataQuality && quality !== params.dataQuality) return false;
  if (!params.includeTestData && quality === "TEST") return false;
  return true;
}

export function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function classifyByKind(kind: "matter" | "notice" | "projectInboxItem" | "artifact" | "workOrder", record: QualityRecord): DataQuality {
  switch (kind) {
    case "matter":
      return classifyMatter(record);
    case "notice":
      return classifyNotice(record);
    case "projectInboxItem":
      return classifyProjectInboxItem(record);
    case "artifact":
      return classifyArtifact(record);
    case "workOrder":
      return classifyWorkOrder(record);
  }
}

function classifyRecord(record: QualityRecord, kind?: "matter" | "notice" | "projectInboxItem" | "artifact" | "workOrder"): DataQuality {
  const explicit = normalizeQuality(record.dataQuality);
  if (explicit === "TEST" || explicit === "TRUSTED") return explicit;
  if (record.isTestData) return "TEST";
  if (isTestSource(record)) return "TEST";
  if (isGeneratedTestTitle(record.title, kind)) return "TEST";
  if ((record.confidenceScore ?? 1) <= 0) return "REVIEW_REQUIRED";
  if (explicit) return explicit;
  if (record.traceId || (record.sourceType && record.sourceId)) return "TRUSTED";
  if (isLegacy(record)) return "LEGACY";
  return "UNKNOWN_SOURCE";
}

function normalizeQuality(value?: string | null): DataQuality | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (["TRUSTED", "REVIEW_REQUIRED", "TEST", "LEGACY", "UNKNOWN_SOURCE"].includes(upper)) return upper as DataQuality;
  return null;
}

function isTestSource(record: QualityRecord): boolean {
  const values = [record.sourceType, record.sourceId, record.dataSource]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value === "test" || value.startsWith("test:") || value.includes("source test"));
}

function isGeneratedTestTitle(title?: string | null, kind?: string): boolean {
  const value = normalizeTitle(title ?? "");
  if (!value) return false;
  if (/\btest\b/.test(value)) return true;
  if (kind === "matter" && /\b(dup matter|del test|cp test)\b/.test(value)) return true;
  if (kind === "notice" && /\b(dup|unread test|read test)\b/.test(value)) return true;
  if (kind === "artifact" && /\b(implementation report m13|implementation report m14|report work test)\b/.test(value)) return true;
  if (kind === "artifact" && /\bgenerated implementation report\b/.test(value)) return true;
  return /\b(cm[a-z0-9]{8,}|[0-9]{10,}|[0-9]{4}[0-9]{2}[0-9]{2}[t -]?[0-9]{4,})$/.test(value);
}

function isLegacy(record: QualityRecord): boolean {
  if (record.provenance || record.traceId || record.dataSource || record.createdBySystem) return false;
  if (!record.createdAt) return true;
  const createdAt = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);
  return Number.isNaN(createdAt.getTime()) || createdAt < LEGACY_CUTOFF;
}

function normalizeSourceType(value?: string | null): string | null {
  return value ? value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") : null;
}

function humanizeSourceType(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sourceLink(label: string, title: string | null, href: string | null, type: string, id: string): SourceLink {
  return { label, title, href, type, id };
}

function formatSourceLabel(source: SourceLink): string {
  if (!source.type || !source.id) return "Unknown source";
  return source.title ? `${source.label}: ${source.title}` : `${source.label}: ${source.id}`;
}

function trim(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
