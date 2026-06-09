-- M16F: Provider Telemetry - add ProviderAccountSnapshot, ProviderModelSnapshot, ProviderHealthSnapshot

CREATE TABLE "ProviderAccountSnapshot" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerId" TEXT,
    "creditsRemaining" DOUBLE PRECISION,
    "creditsUsed" DOUBLE PRECISION,
    "isFreeTier" BOOLEAN NOT NULL DEFAULT false,
    "rateLimit" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderAccountSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderModelSnapshot" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT,
    "contextWindow" INTEGER,
    "inputPricePerMillion" DOUBLE PRECISION,
    "outputPricePerMillion" DOUBLE PRECISION,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderModelSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderHealthSnapshot" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerId" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "failureRate" DOUBLE PRECISION,
    "timeoutRate" DOUBLE PRECISION,
    "avgDurationMs" INTEGER,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderAccountSnapshot_providerType_idx" ON "ProviderAccountSnapshot"("providerType");
CREATE INDEX "ProviderAccountSnapshot_providerId_idx" ON "ProviderAccountSnapshot"("providerId");
CREATE INDEX "ProviderAccountSnapshot_syncedAt_idx" ON "ProviderAccountSnapshot"("syncedAt");

CREATE INDEX "ProviderModelSnapshot_providerType_idx" ON "ProviderModelSnapshot"("providerType");
CREATE INDEX "ProviderModelSnapshot_modelId_idx" ON "ProviderModelSnapshot"("modelId");
CREATE INDEX "ProviderModelSnapshot_syncedAt_idx" ON "ProviderModelSnapshot"("syncedAt");

CREATE INDEX "ProviderHealthSnapshot_providerType_idx" ON "ProviderHealthSnapshot"("providerType");
CREATE INDEX "ProviderHealthSnapshot_providerId_idx" ON "ProviderHealthSnapshot"("providerId");
CREATE INDEX "ProviderHealthSnapshot_computedAt_idx" ON "ProviderHealthSnapshot"("computedAt");
