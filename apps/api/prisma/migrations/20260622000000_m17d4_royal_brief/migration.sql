-- CreateEnum
CREATE TYPE "RoyalBriefStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoyalBriefGeneratedBy" AS ENUM ('SYSTEM', 'KING');

-- CreateTable
CREATE TABLE "RoyalBrief" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "briefDate" TIMESTAMP(3) NOT NULL,
    "status" "RoyalBriefStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "decisionsNeeded" JSONB NOT NULL,
    "runnerStatus" JSONB NOT NULL,
    "livingLoopSummary" JSONB NOT NULL,
    "validationSummary" JSONB NOT NULL,
    "patchSummary" JSONB NOT NULL,
    "providerSummary" JSONB NOT NULL,
    "treasurySummary" JSONB NOT NULL,
    "memorySummary" JSONB NOT NULL,
    "riskSummary" JSONB NOT NULL,
    "livingAgentDigest" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "generatedBy" "RoyalBriefGeneratedBy" NOT NULL DEFAULT 'SYSTEM',
    "generatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoyalBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoyalBrief_briefDate_idx" ON "RoyalBrief"("briefDate");

-- CreateIndex
CREATE INDEX "RoyalBrief_status_idx" ON "RoyalBrief"("status");

-- AddForeignKey
ALTER TABLE "RoyalBrief" ADD CONSTRAINT "RoyalBrief_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
