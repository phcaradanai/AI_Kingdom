import type {
  KingdomAssetDto,
  KingdomAssetStatus,
  KingdomAssetType,
  KingdomObjectiveDto,
  KingdomObjectiveStatus,
  KingdomOpportunityDto,
  MatterPriority,
  OpportunityStatus,
  RevenueModel,
  RevenueStreamDto,
  RevenueStreamStatus,
  StrategyAssetPayload,
  StrategyObjectivePayload,
  StrategyOpportunityPayload,
  StrategyRevenueStreamPayload,
} from "@/types/api";

export type StrategySection = "overview" | "objectives" | "opportunities" | "assets" | "revenue";
export type StrategyRecordType = Exclude<StrategySection, "overview">;
export type StrategyRecord = KingdomObjectiveDto | KingdomOpportunityDto | KingdomAssetDto | RevenueStreamDto;
export type StrategyPayload =
  | StrategyObjectivePayload
  | StrategyOpportunityPayload
  | StrategyAssetPayload
  | StrategyRevenueStreamPayload;
export type StrategyEditorState = {
  type: StrategyRecordType;
  record: StrategyRecord | null;
} | null;

export const priorities: MatterPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const objectiveStatuses: KingdomObjectiveStatus[] = ["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"];
export const opportunityStatuses: OpportunityStatus[] = [
  "INBOX",
  "REVIEWING",
  "VALIDATING",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
];
export const assetTypes: KingdomAssetType[] = [
  "PRODUCT",
  "TEMPLATE",
  "SERVICE",
  "KNOWLEDGE",
  "AUTOMATION",
  "CONTENT",
  "COMMUNITY",
  "OTHER",
];
export const assetStatuses: KingdomAssetStatus[] = ["IDEA", "BUILDING", "ACTIVE", "MONETIZING", "PAUSED", "ARCHIVED"];
export const revenueModels: RevenueModel[] = [
  "SUBSCRIPTION",
  "ONE_TIME",
  "SERVICE",
  "AFFILIATE",
  "ADS",
  "LICENSING",
  "OTHER",
];
export const revenueStatuses: RevenueStreamStatus[] = ["PLANNED", "TESTING", "ACTIVE", "PAUSED", "ENDED"];

export const selectClassName =
  "min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

export function blankDraft(type: StrategyRecordType, record: StrategyRecord | null): StrategyPayload {
  if (type === "objectives") {
    const item = record as KingdomObjectiveDto | null;
    return item
      ? {
          title: item.title,
          description: item.description,
          priority: item.priority,
          status: item.status,
          projectId: item.projectId,
          targetDate: item.targetDate,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          tags: item.tags,
        }
      : {
          title: "",
          description: "",
          priority: "MEDIUM",
          status: "ACTIVE",
          tags: [],
        };
  }
  if (type === "opportunities") {
    const item = record as KingdomOpportunityDto | null;
    return item
      ? {
          title: item.title,
          problem: item.problem,
          proposedValue: item.proposedValue,
          targetCustomer: item.targetCustomer,
          priority: item.priority,
          riskLevel: item.riskLevel,
          score: item.score,
          estimatedMonthlyRevenue: item.estimatedMonthlyRevenue,
          estimatedEffort: item.estimatedEffort,
          nextAction: item.nextAction,
          status: item.status,
          confidence: item.confidence,
          projectId: item.projectId,
          objectiveId: item.objectiveId,
          assetId: item.assetId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          traceId: item.traceId,
          tags: item.tags,
        }
      : {
          title: "",
          problem: "",
          proposedValue: "",
          targetCustomer: "",
          priority: "MEDIUM",
          riskLevel: "MEDIUM",
          score: 50,
          estimatedMonthlyRevenue: 0,
          estimatedEffort: "",
          nextAction: "",
          status: "INBOX",
          tags: [],
        };
  }
  if (type === "assets") {
    const item = record as KingdomAssetDto | null;
    return item
      ? {
          name: item.name,
          type: item.type,
          status: item.status,
          description: item.description,
          valueHypothesis: item.valueHypothesis,
          targetCustomer: item.targetCustomer,
          monthlyRevenueEstimate: item.monthlyRevenueEstimate,
          monthlyCostEstimate: item.monthlyCostEstimate,
          projectId: item.projectId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          tags: item.tags,
        }
      : {
          name: "",
          type: "PRODUCT",
          status: "IDEA",
          description: "",
          valueHypothesis: "",
          targetCustomer: "",
          monthlyRevenueEstimate: 0,
          monthlyCostEstimate: 0,
          tags: [],
        };
  }
  const item = record as RevenueStreamDto | null;
  return item
    ? {
        name: item.name,
        assetId: item.assetId,
        projectId: item.projectId,
        model: item.model,
        status: item.status,
        currency: item.currency,
        monthlyRevenue: item.monthlyRevenue,
        monthlyCost: item.monthlyCost,
        confidence: item.confidence,
        notes: item.notes,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
      }
    : {
        name: "",
        assetId: null,
        model: "SUBSCRIPTION",
        status: "PLANNED",
        currency: "USD",
        monthlyRevenue: 0,
        monthlyCost: 0,
        confidence: 0.5,
        notes: "",
      };
}

export function normalizePayload(type: StrategyRecordType, payload: StrategyPayload): StrategyPayload {
  if (type === "objectives") {
    const value = payload as StrategyObjectivePayload;
    return {
      ...value,
      title: value.title.trim(),
      description: value.description?.trim() ?? "",
      tags: value.tags ?? [],
    };
  }
  if (type === "opportunities") {
    const value = payload as StrategyOpportunityPayload;
    return {
      ...value,
      title: value.title.trim(),
      problem: value.problem?.trim() ?? "",
      proposedValue: value.proposedValue?.trim() ?? "",
      targetCustomer: value.targetCustomer?.trim() ?? "",
      nextAction: value.nextAction?.trim() ?? "",
      estimatedEffort: value.estimatedEffort?.trim() ?? "",
      score: clamp(Number(value.score ?? 0), 0, 100),
      estimatedMonthlyRevenue: Math.max(0, Number(value.estimatedMonthlyRevenue ?? 0)),
      tags: value.tags ?? [],
    };
  }
  if (type === "assets") {
    const value = payload as StrategyAssetPayload;
    return {
      ...value,
      name: value.name.trim(),
      description: value.description?.trim() ?? "",
      valueHypothesis: value.valueHypothesis?.trim() ?? "",
      targetCustomer: value.targetCustomer?.trim() ?? "",
      monthlyRevenueEstimate: Math.max(0, Number(value.monthlyRevenueEstimate ?? 0)),
      monthlyCostEstimate: Math.max(0, Number(value.monthlyCostEstimate ?? 0)),
      tags: value.tags ?? [],
    };
  }
  const value = payload as StrategyRevenueStreamPayload;
  return {
    ...value,
    name: value.name.trim(),
    assetId: value.assetId || null,
    currency: value.currency?.trim().toUpperCase() || "USD",
    monthlyRevenue: Math.max(0, Number(value.monthlyRevenue ?? 0)),
    monthlyCost: Math.max(0, Number(value.monthlyCost ?? 0)),
    confidence: clamp(Number(value.confidence ?? 0), 0, 1),
    notes: value.notes?.trim() ?? "",
  };
}

export function recordId(record: StrategyRecord | null) {
  return record?.id;
}

export function recordMatches(values: Array<string | null | undefined>, query: string) {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((value) => value?.toLowerCase().includes(needle));
}

export function sourceRoute(sourceType: string | null, sourceId: string | null) {
  if (!sourceType || !sourceId) return null;
  const type = sourceType.toUpperCase();
  if (type.includes("ARTIFACT")) return "/artifacts";
  if (type.includes("REPORT")) return "/reports";
  if (type.includes("WORK_ORDER")) return `/work-orders?focus=${encodeURIComponent(sourceId)}`;
  if (type.includes("MATTER")) return "/matters";
  if (type.includes("TASK") || type.includes("COUNCIL")) return "/throne-room?view=command";
  return null;
}

export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
