import { prisma } from "../db/prisma.js";
import { getLatestOpenRouterAccountSnapshot } from "./providerAccountSyncService.js";

export type ProviderReconciliationSnapshotDto = {
  id: string;
  providerType: string;
  periodLabel: string | null;
  estimatedSpendUSD: number;
  providerReportedSpendUSD: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  confidenceScore: number | null;
  recordCount: number;
  knownPricingCount: number;
  notes: string | null;
  reconciledAt: Date;
  createdAt: Date;
};

function computeConfidence(
  knownPricingCount: number,
  recordCount: number,
  variancePercent: number | null,
  hasProviderData: boolean
): number {
  const pricingQuality = recordCount > 0 ? knownPricingCount / recordCount : 0;

  if (!hasProviderData) {
    // No provider comparison available — confidence is purely about pricing quality
    return Math.round(pricingQuality * 70) / 100;
  }

  if (variancePercent === null) return pricingQuality * 0.7;

  // Confidence based on variance tightness
  let varianceConfidence: number;
  if (variancePercent < 5) varianceConfidence = 0.95;
  else if (variancePercent < 10) varianceConfidence = 0.88;
  else if (variancePercent < 20) varianceConfidence = 0.75;
  else varianceConfidence = 0.55;

  return Math.round(Math.min(1, (pricingQuality * 0.3 + varianceConfidence * 0.7)) * 100) / 100;
}

export async function runOpenRouterReconciliation(): Promise<ProviderReconciliationSnapshotDto> {
  const [records, accountSnapshot] = await Promise.all([
    prisma.usageRecord.findMany({
      where: {
        OR: [
          { provider: "openrouter" },
          { provider: { startsWith: "openrouter-" } },
          { providerId: "openrouter" },
          { providerId: { startsWith: "openrouter-" } }
        ]
      },
      select: { estimatedCostUSD: true, pricingStatus: true }
    }),
    getLatestOpenRouterAccountSnapshot()
  ]);

  const estimatedSpendUSD = records.reduce((s, r) => s + r.estimatedCostUSD, 0);
  const knownPricingCount = records.filter((r) => r.pricingStatus === "KNOWN").length;
  const recordCount = records.length;

  const providerReportedSpendUSD = accountSnapshot?.creditsUsed ?? null;

  let varianceAmount: number | null = null;
  let variancePercent: number | null = null;
  if (providerReportedSpendUSD != null && providerReportedSpendUSD > 0) {
    varianceAmount = Math.abs(estimatedSpendUSD - providerReportedSpendUSD);
    variancePercent = Math.round((varianceAmount / providerReportedSpendUSD) * 10000) / 100;
  }

  const confidenceScore = computeConfidence(
    knownPricingCount,
    recordCount,
    variancePercent,
    providerReportedSpendUSD != null
  );

  const notes = !accountSnapshot
    ? "No OpenRouter account snapshot available — sync OpenRouter account to enable reconciliation."
    : accountSnapshot.isFreeTier
    ? "Account is on free tier; provider-reported spend may be $0."
    : null;

  const snapshot = await prisma.providerReconciliationSnapshot.create({
    data: {
      providerType: "openrouter",
      periodLabel: "All-time",
      estimatedSpendUSD,
      providerReportedSpendUSD,
      varianceAmount,
      variancePercent,
      confidenceScore,
      recordCount,
      knownPricingCount,
      notes
    }
  });

  return toDto(snapshot);
}

export async function getLatestReconciliationSnapshot(
  providerType = "openrouter"
): Promise<ProviderReconciliationSnapshotDto | null> {
  const row = await prisma.providerReconciliationSnapshot.findFirst({
    where: { providerType },
    orderBy: { reconciledAt: "desc" }
  });
  return row ? toDto(row) : null;
}

export async function listReconciliationHistory(
  providerType = "openrouter",
  limit = 10
): Promise<ProviderReconciliationSnapshotDto[]> {
  const rows = await prisma.providerReconciliationSnapshot.findMany({
    where: { providerType },
    orderBy: { reconciledAt: "desc" },
    take: limit
  });
  return rows.map(toDto);
}

function toDto(row: {
  id: string;
  providerType: string;
  periodLabel: string | null;
  estimatedSpendUSD: number;
  providerReportedSpendUSD: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  confidenceScore: number | null;
  recordCount: number;
  knownPricingCount: number;
  notes: string | null;
  reconciledAt: Date;
  createdAt: Date;
}): ProviderReconciliationSnapshotDto {
  return {
    id: row.id,
    providerType: row.providerType,
    periodLabel: row.periodLabel,
    estimatedSpendUSD: row.estimatedSpendUSD,
    providerReportedSpendUSD: row.providerReportedSpendUSD,
    varianceAmount: row.varianceAmount,
    variancePercent: row.variancePercent,
    confidenceScore: row.confidenceScore,
    recordCount: row.recordCount,
    knownPricingCount: row.knownPricingCount,
    notes: row.notes,
    reconciledAt: row.reconciledAt,
    createdAt: row.createdAt
  };
}
