-- External Agent Bridge runner support.

ALTER TYPE "AutomationJobMode" ADD VALUE IF NOT EXISTS 'EXTERNAL_AGENT';
ALTER TYPE "ExternalAgentType" ADD VALUE IF NOT EXISTS 'GENERIC_CLI';
ALTER TYPE "ExternalAgentType" ADD VALUE IF NOT EXISTS 'MANUAL_ONLY';

CREATE TYPE "ExternalAgentRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'WAITING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'NEEDS_REVIEW'
);

CREATE TYPE "WorkOrderExecutionTarget" AS ENUM (
  'AUTO',
  'INTERNAL_AGENT',
  'RUNNER_VALIDATION',
  'RUNNER_PATCH',
  'EXTERNAL_AGENT'
);

ALTER TABLE "ExternalAgent"
  ADD COLUMN "command" TEXT,
  ADD COLUMN "workingDirectory" TEXT,
  ADD COLUMN "environmentProfile" TEXT,
  ADD COLUMN "bridgeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxRuntimeSeconds" INTEGER NOT NULL DEFAULT 900,
  ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "WorkOrder"
  ADD COLUMN "executionTarget" "WorkOrderExecutionTarget" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "autoRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAutoRetries" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "lastExternalAgentRunId" TEXT,
  ADD COLUMN "blockedReason" TEXT;

CREATE TABLE "ExternalAgentRun" (
  "id" TEXT NOT NULL,
  "externalAgentId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "automationJobId" TEXT,
  "status" "ExternalAgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "inputPrompt" TEXT NOT NULL,
  "outputText" TEXT,
  "artifactPaths" JSONB NOT NULL DEFAULT '[]',
  "logPath" TEXT,
  "exitCode" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "retryOfRunId" TEXT,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalAgentRun_externalAgentId_idx" ON "ExternalAgentRun"("externalAgentId");
CREATE INDEX "ExternalAgentRun_workOrderId_idx" ON "ExternalAgentRun"("workOrderId");
CREATE INDEX "ExternalAgentRun_automationJobId_idx" ON "ExternalAgentRun"("automationJobId");
CREATE INDEX "ExternalAgentRun_status_idx" ON "ExternalAgentRun"("status");
CREATE INDEX "ExternalAgentRun_retryOfRunId_idx" ON "ExternalAgentRun"("retryOfRunId");

ALTER TABLE "ExternalAgentRun"
  ADD CONSTRAINT "ExternalAgentRun_externalAgentId_fkey"
  FOREIGN KEY ("externalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalAgentRun"
  ADD CONSTRAINT "ExternalAgentRun_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalAgentRun"
  ADD CONSTRAINT "ExternalAgentRun_automationJobId_fkey"
  FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExternalAgentRun"
  ADD CONSTRAINT "ExternalAgentRun_retryOfRunId_fkey"
  FOREIGN KEY ("retryOfRunId") REFERENCES "ExternalAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_lastExternalAgentRunId_fkey"
  FOREIGN KEY ("lastExternalAgentRunId") REFERENCES "ExternalAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
