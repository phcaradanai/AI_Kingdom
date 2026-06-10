-- M17: Cost source classification, rolling health windows, Route Chain Architecture

-- Phase 2: Add costSource to UsageRecord
ALTER TABLE "UsageRecord" ADD COLUMN "costSource" TEXT;

-- Phase 3: Add windowKind to ProviderHealthSnapshot
ALTER TABLE "ProviderHealthSnapshot" ADD COLUMN "windowKind" TEXT NOT NULL DEFAULT 'LIFETIME';

CREATE INDEX "ProviderHealthSnapshot_windowKind_idx" ON "ProviderHealthSnapshot"("windowKind");

-- Phase 4: Route Chain Architecture
CREATE TABLE "AIRouteChain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taskMode" TEXT,
    "agentId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIRouteChain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIRouteChainEntry" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIRouteChainEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIRouteChain_taskMode_idx" ON "AIRouteChain"("taskMode");
CREATE INDEX "AIRouteChain_agentId_idx" ON "AIRouteChain"("agentId");
CREATE INDEX "AIRouteChain_isActive_idx" ON "AIRouteChain"("isActive");
CREATE INDEX "AIRouteChainEntry_chainId_idx" ON "AIRouteChainEntry"("chainId");
CREATE INDEX "AIRouteChainEntry_sequence_idx" ON "AIRouteChainEntry"("sequence");

ALTER TABLE "AIRouteChainEntry" ADD CONSTRAINT "AIRouteChainEntry_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "AIRouteChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
