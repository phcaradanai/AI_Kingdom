ALTER TABLE "Agent" ADD COLUMN "preferredProviderId" TEXT;
ALTER TABLE "Agent" ADD COLUMN "fallbackProviderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Agent" ADD COLUMN "costPreference" TEXT;

ALTER TABLE "UsageRecord" ADD COLUMN "providerId" TEXT;

CREATE TABLE "AIProvider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "baseUrl" TEXT,
  "defaultModel" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "costTier" TEXT NOT NULL DEFAULT 'MEDIUM',
  "capabilities" JSONB NOT NULL,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIProviderRoute" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taskMode" "TaskMode",
  "agentId" TEXT,
  "preferredProviderId" TEXT,
  "preferredModel" TEXT,
  "fallbackProviderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "costMode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIProviderRoute_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AIProviderRoute" ADD CONSTRAINT "AIProviderRoute_preferredProviderId_fkey"
  FOREIGN KEY ("preferredProviderId") REFERENCES "AIProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
