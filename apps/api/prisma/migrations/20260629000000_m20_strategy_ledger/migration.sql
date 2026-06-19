-- CreateEnum
CREATE TYPE "KingdomObjectiveStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SuccessMetricDirection" AS ENUM ('INCREASE', 'DECREASE', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "SuccessMetricStatus" AS ENUM ('UNKNOWN', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED');

-- CreateEnum
CREATE TYPE "KingdomAssetType" AS ENUM ('PRODUCT', 'TEMPLATE', 'SERVICE', 'KNOWLEDGE', 'AUTOMATION', 'CONTENT', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "KingdomAssetStatus" AS ENUM ('IDEA', 'BUILDING', 'ACTIVE', 'MONETIZING', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RevenueStreamStatus" AS ENUM ('PLANNED', 'TESTING', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "RevenueModel" AS ENUM ('SUBSCRIPTION', 'ONE_TIME', 'SERVICE', 'AFFILIATE', 'ADS', 'LICENSING', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('INBOX', 'REVIEWING', 'VALIDATING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OpportunityExperimentStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "KingdomObjective" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "KingdomObjectiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "targetDate" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingdomObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuccessMetric" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "direction" "SuccessMetricDirection" NOT NULL DEFAULT 'INCREASE',
    "baselineValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetValue" DOUBLE PRECISION,
    "status" "SuccessMetricStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "lastMeasuredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingdomAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "type" "KingdomAssetType" NOT NULL DEFAULT 'OTHER',
    "status" "KingdomAssetStatus" NOT NULL DEFAULT 'IDEA',
    "description" TEXT NOT NULL DEFAULT '',
    "valueHypothesis" TEXT NOT NULL DEFAULT '',
    "targetCustomer" TEXT NOT NULL DEFAULT '',
    "monthlyRevenueEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyCostEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingdomAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueStream" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "model" "RevenueModel" NOT NULL DEFAULT 'OTHER',
    "status" "RevenueStreamStatus" NOT NULL DEFAULT 'PLANNED',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingdomOpportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "objectiveId" TEXT,
    "assetId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL DEFAULT '',
    "proposedValue" TEXT NOT NULL DEFAULT '',
    "targetCustomer" TEXT NOT NULL DEFAULT '',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'INBOX',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "confidence" DOUBLE PRECISION,
    "score" INTEGER NOT NULL DEFAULT 0,
    "estimatedMonthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedEffort" TEXT NOT NULL DEFAULT '',
    "riskLevel" "MatterPriority" NOT NULL DEFAULT 'MEDIUM',
    "nextAction" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "traceId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "KingdomOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityExperiment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "validationMethod" TEXT NOT NULL DEFAULT '',
    "successCriteria" TEXT NOT NULL DEFAULT '',
    "status" "OpportunityExperimentStatus" NOT NULL DEFAULT 'PLANNED',
    "resultSummary" TEXT,
    "resultMetric" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KingdomObjective_projectId_idx" ON "KingdomObjective"("projectId");
CREATE INDEX "KingdomObjective_createdByUserId_idx" ON "KingdomObjective"("createdByUserId");
CREATE INDEX "KingdomObjective_status_idx" ON "KingdomObjective"("status");
CREATE INDEX "KingdomObjective_priority_idx" ON "KingdomObjective"("priority");
CREATE INDEX "KingdomObjective_targetDate_idx" ON "KingdomObjective"("targetDate");

CREATE INDEX "SuccessMetric_objectiveId_idx" ON "SuccessMetric"("objectiveId");
CREATE INDEX "SuccessMetric_projectId_idx" ON "SuccessMetric"("projectId");
CREATE INDEX "SuccessMetric_status_idx" ON "SuccessMetric"("status");
CREATE INDEX "SuccessMetric_lastMeasuredAt_idx" ON "SuccessMetric"("lastMeasuredAt");

CREATE INDEX "KingdomAsset_projectId_idx" ON "KingdomAsset"("projectId");
CREATE INDEX "KingdomAsset_type_idx" ON "KingdomAsset"("type");
CREATE INDEX "KingdomAsset_status_idx" ON "KingdomAsset"("status");
CREATE INDEX "KingdomAsset_monthlyRevenueEstimate_idx" ON "KingdomAsset"("monthlyRevenueEstimate");

CREATE INDEX "RevenueStream_projectId_idx" ON "RevenueStream"("projectId");
CREATE INDEX "RevenueStream_assetId_idx" ON "RevenueStream"("assetId");
CREATE INDEX "RevenueStream_status_idx" ON "RevenueStream"("status");
CREATE INDEX "RevenueStream_model_idx" ON "RevenueStream"("model");

CREATE INDEX "KingdomOpportunity_projectId_idx" ON "KingdomOpportunity"("projectId");
CREATE INDEX "KingdomOpportunity_objectiveId_idx" ON "KingdomOpportunity"("objectiveId");
CREATE INDEX "KingdomOpportunity_assetId_idx" ON "KingdomOpportunity"("assetId");
CREATE INDEX "KingdomOpportunity_createdByUserId_idx" ON "KingdomOpportunity"("createdByUserId");
CREATE INDEX "KingdomOpportunity_status_idx" ON "KingdomOpportunity"("status");
CREATE INDEX "KingdomOpportunity_priority_idx" ON "KingdomOpportunity"("priority");
CREATE INDEX "KingdomOpportunity_score_idx" ON "KingdomOpportunity"("score");
CREATE INDEX "KingdomOpportunity_traceId_idx" ON "KingdomOpportunity"("traceId");

CREATE INDEX "OpportunityExperiment_opportunityId_idx" ON "OpportunityExperiment"("opportunityId");
CREATE INDEX "OpportunityExperiment_createdByUserId_idx" ON "OpportunityExperiment"("createdByUserId");
CREATE INDEX "OpportunityExperiment_status_idx" ON "OpportunityExperiment"("status");
CREATE INDEX "OpportunityExperiment_completedAt_idx" ON "OpportunityExperiment"("completedAt");

-- AddForeignKey
ALTER TABLE "KingdomObjective" ADD CONSTRAINT "KingdomObjective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomObjective" ADD CONSTRAINT "KingdomObjective_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuccessMetric" ADD CONSTRAINT "SuccessMetric_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "KingdomObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuccessMetric" ADD CONSTRAINT "SuccessMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomAsset" ADD CONSTRAINT "KingdomAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueStream" ADD CONSTRAINT "RevenueStream_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueStream" ADD CONSTRAINT "RevenueStream_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "KingdomAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomOpportunity" ADD CONSTRAINT "KingdomOpportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomOpportunity" ADD CONSTRAINT "KingdomOpportunity_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "KingdomObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomOpportunity" ADD CONSTRAINT "KingdomOpportunity_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "KingdomAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KingdomOpportunity" ADD CONSTRAINT "KingdomOpportunity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunityExperiment" ADD CONSTRAINT "OpportunityExperiment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "KingdomOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityExperiment" ADD CONSTRAINT "OpportunityExperiment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
