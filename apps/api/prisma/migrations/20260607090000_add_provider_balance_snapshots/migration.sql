CREATE TABLE "ProviderBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerId" TEXT,
    "isAvailable" BOOLEAN NOT NULL,
    "currency" TEXT NOT NULL,
    "totalBalance" DOUBLE PRECISION NOT NULL,
    "grantedBalance" DOUBLE PRECISION NOT NULL,
    "toppedUpBalance" DOUBLE PRECISION NOT NULL,
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderBalanceSnapshot_providerType_idx" ON "ProviderBalanceSnapshot"("providerType");
CREATE INDEX "ProviderBalanceSnapshot_providerId_idx" ON "ProviderBalanceSnapshot"("providerId");
CREATE INDEX "ProviderBalanceSnapshot_fetchedAt_idx" ON "ProviderBalanceSnapshot"("fetchedAt");
