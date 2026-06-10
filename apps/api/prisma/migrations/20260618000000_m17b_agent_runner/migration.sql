-- M17B: Kingdom Living Agent Runner — Sandbox Act

-- New enums
CREATE TYPE "AutomationJobStatus" AS ENUM ('QUEUED', 'APPROVED', 'CLAIMED', 'RUNNING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AutomationJobMode" AS ENUM ('OBSERVE', 'PLAN_ONLY', 'SANDBOX_PATCH', 'VALIDATION_ONLY');
CREATE TYPE "AgentRunnerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');

-- AgentRunner: tracks registered runner instances
CREATE TABLE "AgentRunner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "AgentRunnerStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeatAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "version" TEXT,
    "hostname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRunner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRunner_tokenHash_key" ON "AgentRunner"("tokenHash");

-- AutomationJob: sandboxed execution job linked to a WorkOrder
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "runnerId" TEXT,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "AutomationJobMode" NOT NULL DEFAULT 'SANDBOX_PATCH',
    "commandPolicy" TEXT,
    "allowedCommands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provenance" JSONB,
    "planJson" JSONB,
    "patchSummary" TEXT,
    "logsPreview" TEXT,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationJob_workOrderId_idx" ON "AutomationJob"("workOrderId");
CREATE INDEX "AutomationJob_projectId_idx" ON "AutomationJob"("projectId");
CREATE INDEX "AutomationJob_agentId_idx" ON "AutomationJob"("agentId");
CREATE INDEX "AutomationJob_runnerId_idx" ON "AutomationJob"("runnerId");
CREATE INDEX "AutomationJob_status_idx" ON "AutomationJob"("status");
CREATE INDEX "AutomationJob_createdByUserId_idx" ON "AutomationJob"("createdByUserId");

-- AgentRunStep: individual steps within an automation job
CREATE TABLE "AgentRunStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "command" TEXT,
    "args" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "output" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRunStep_jobId_idx" ON "AgentRunStep"("jobId");
CREATE INDEX "AgentRunStep_sequence_idx" ON "AgentRunStep"("sequence");

-- Add automationJobId to ImplementationReport
ALTER TABLE "ImplementationReport" ADD COLUMN "automationJobId" TEXT;

-- Foreign key constraints
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_runnerId_fkey"
    FOREIGN KEY ("runnerId") REFERENCES "AgentRunner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImplementationReport" ADD CONSTRAINT "ImplementationReport_automationJobId_fkey"
    FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
