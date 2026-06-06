-- AlterTable
ALTER TABLE "AIModelPricing" ADD COLUMN     "aliasOf" TEXT,
ADD COLUMN     "canonicalModel" TEXT,
ADD COLUMN     "concurrencyLimit" INTEGER,
ADD COLUMN     "defaultThinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deprecationDate" TIMESTAMP(3),
ADD COLUMN     "inputCacheHitPerMillion" DOUBLE PRECISION,
ADD COLUMN     "inputCacheMissPerMillion" DOUBLE PRECISION,
ADD COLUMN     "isAlias" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportedReasoningEfforts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "supportsThinking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unsupportedThinkingParams" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "inputPerMillion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN     "inputCacheHitTokens" INTEGER,
ADD COLUMN     "inputCacheMissTokens" INTEGER,
ADD COLUMN     "pricingNotes" TEXT,
ADD COLUMN     "pricingSource" TEXT,
ADD COLUMN     "pricingStatus" TEXT;

-- CreateIndex
CREATE INDEX "AIModelPricing_canonicalModel_idx" ON "AIModelPricing"("canonicalModel");
