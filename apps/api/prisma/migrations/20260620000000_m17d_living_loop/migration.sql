-- CreateEnum
CREATE TYPE "LivingLoopStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LivingLoopTriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "AutomationCandidateKind" AS ENUM ('WORK_ORDER_REVIEW', 'VALIDATION_JOB', 'PATCH_REVIEW', 'MEMORY_REVIEW', 'CLEANUP_REVIEW', 'PROVIDER_REVIEW', 'PROJECT_REVIEW', 'RUNNER_REVIEW');

-- CreateEnum
CREATE TYPE "AutomationCandidatePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AutomationCandidateRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AutomationCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "LivingLoopRun" (
    "id" TEXT NOT NULL,
    "status" "LivingLoopStatus" NOT NULL DEFAULT 'STARTED',
    "triggerType" "LivingLoopTriggerType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" TEXT,
    "observedCounts" JSONB,
    "proposedCandidates" INTEGER NOT NULL DEFAULT 0,
    "skippedCandidates" INTEGER NOT NULL DEFAULT 0,
    "createdJobs" INTEGER NOT NULL DEFAULT 0,
    "skippedReasons" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LivingLoopRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationCandidate" (
    "id" TEXT NOT NULL,
    "kind" "AutomationCandidateKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "priority" "AutomationCandidatePriority" NOT NULL DEFAULT 'MEDIUM',
    "riskLevel" "AutomationCandidateRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "workOrderId" TEXT,
    "automationJobId" TEXT,
    "patchArtifactId" TEXT,
    "proposedAction" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "dataQuality" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "status" "AutomationCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "loopRunId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationCandidate_pkey" PRIMARY KEY ("id")
);
