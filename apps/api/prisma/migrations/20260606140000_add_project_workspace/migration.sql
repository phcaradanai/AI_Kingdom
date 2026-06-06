CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ProjectRoutingStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED', 'NEEDS_REVIEW');
CREATE TYPE "ProjectInboxStatus" AS ENUM ('PENDING', 'ASSIGNED', 'DISMISSED');
CREATE TYPE "ArtifactType" AS ENUM ('PROMPT', 'SPEC', 'DECISION', 'IMPLEMENTATION_REPORT', 'HANDOFF_BRIEF', 'ARCHITECTURE_NOTE', 'MARKET_RESEARCH', 'CODE_PLAN', 'ROYAL_DECREE', 'GENERAL_NOTE');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "codename" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
  "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "repositoryUrl" TEXT,
  "localPath" TEXT,
  "activeMilestone" TEXT,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

CREATE TABLE "ProjectRoutingCandidate" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "suggestedProjectId" TEXT,
  "confidenceScore" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ProjectRoutingStatus" NOT NULL DEFAULT 'SUGGESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRoutingCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInboxItem" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "candidateProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "ProjectInboxStatus" NOT NULL DEFAULT 'PENDING',
  "assignedProjectId" TEXT,
  "confidenceScore" INTEGER,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "type" "ArtifactType" NOT NULL DEFAULT 'GENERAL_NOTE',
  "content" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notice" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Matter" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "CouncilSession" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Report" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Memory" ADD COLUMN "projectId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ImplementationReport" ADD COLUMN "projectId" TEXT;
ALTER TABLE "HandoffBrief" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRoutingCandidate" ADD CONSTRAINT "ProjectRoutingCandidate_suggestedProjectId_fkey" FOREIGN KEY ("suggestedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CouncilSession" ADD CONSTRAINT "CouncilSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImplementationReport" ADD CONSTRAINT "ImplementationReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoffBrief" ADD CONSTRAINT "HandoffBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
