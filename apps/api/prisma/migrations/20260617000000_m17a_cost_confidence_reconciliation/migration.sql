-- M17A Phase 3: Add costConfidence to UsageRecord
ALTER TABLE "UsageRecord" ADD COLUMN "costConfidence" DOUBLE PRECISION;

-- M17A Phase 4: Provider Reconciliation Snapshots
CREATE TABLE "ProviderReconciliationSnapshot" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL DEFAULT 'openrouter',
    "periodLabel" TEXT,
    "estimatedSpendUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerReportedSpendUSD" DOUBLE PRECISION,
    "varianceAmount" DOUBLE PRECISION,
    "variancePercent" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "knownPricingCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderReconciliationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderReconciliationSnapshot_providerType_idx" ON "ProviderReconciliationSnapshot"("providerType");
CREATE INDEX "ProviderReconciliationSnapshot_reconciledAt_idx" ON "ProviderReconciliationSnapshot"("reconciledAt");
