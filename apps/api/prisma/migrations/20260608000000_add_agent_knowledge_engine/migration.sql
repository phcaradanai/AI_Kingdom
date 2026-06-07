-- CreateEnum
CREATE TYPE "ProviderEnvironmentMode" AS ENUM ('SANDBOX', 'PRODUCTION', 'DISABLED');

-- CreateEnum
CREATE TYPE "KnowledgeCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('PROJECT_FACT', 'ARCHITECTURE_DECISION', 'USER_PREFERENCE', 'PROVIDER_BEHAVIOR', 'WORKFLOW_RULE', 'BUG_LEARNING', 'PROMPT_PATTERN', 'COST_LEARNING', 'RISK', 'UNKNOWN');

-- AlterTable: add sandbox/production mode fields to AIProvider
ALTER TABLE "AIProvider" ADD COLUMN "environmentMode" "ProviderEnvironmentMode" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "AIProvider" ADD COLUMN "maxTokensPerRequest" INTEGER;
ALTER TABLE "AIProvider" ADD COLUMN "maxRequestsPerDay" INTEGER;
ALTER TABLE "AIProvider" ADD COLUMN "maxTokensPerDay" INTEGER;
ALTER TABLE "AIProvider" ADD COLUMN "maxEstimatedCostPerDay" DOUBLE PRECISION;
ALTER TABLE "AIProvider" ADD COLUMN "allowSensitiveContext" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AIProvider" ADD COLUMN "isFreeTier" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AIProvider" ADD COLUMN "notes" TEXT;

-- Mark mock provider as free tier sandbox
UPDATE "AIProvider" SET "isFreeTier" = true, "environmentMode" = 'SANDBOX', "allowSensitiveContext" = false WHERE "id" = 'mock';

-- CreateTable: AgentKnowledgeCandidate
CREATE TABLE "AgentKnowledgeCandidate" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "councilSessionId" TEXT,
    "traceId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "category" "KnowledgeCategory" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION,
    "status" "KnowledgeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByAgentId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentKnowledgeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AgentKnowledgeMemory
CREATE TABLE "AgentKnowledgeMemory" (
    "id" TEXT NOT NULL,
    "sourceCandidateId" TEXT,
    "agentId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "category" "KnowledgeCategory" NOT NULL DEFAULT 'UNKNOWN',
    "trustLevel" TEXT NOT NULL DEFAULT 'APPROVED',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT,
    "createdFromTraceId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentKnowledgeMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentKnowledgeCandidate_agentId_idx" ON "AgentKnowledgeCandidate"("agentId");
CREATE INDEX "AgentKnowledgeCandidate_projectId_idx" ON "AgentKnowledgeCandidate"("projectId");
CREATE INDEX "AgentKnowledgeCandidate_taskId_idx" ON "AgentKnowledgeCandidate"("taskId");
CREATE INDEX "AgentKnowledgeCandidate_traceId_idx" ON "AgentKnowledgeCandidate"("traceId");
CREATE INDEX "AgentKnowledgeCandidate_status_idx" ON "AgentKnowledgeCandidate"("status");
CREATE INDEX "AgentKnowledgeCandidate_fingerprint_idx" ON "AgentKnowledgeCandidate"("fingerprint");

CREATE INDEX "AgentKnowledgeMemory_agentId_idx" ON "AgentKnowledgeMemory"("agentId");
CREATE INDEX "AgentKnowledgeMemory_projectId_idx" ON "AgentKnowledgeMemory"("projectId");
CREATE INDEX "AgentKnowledgeMemory_category_idx" ON "AgentKnowledgeMemory"("category");
CREATE INDEX "AgentKnowledgeMemory_fingerprint_idx" ON "AgentKnowledgeMemory"("fingerprint");
