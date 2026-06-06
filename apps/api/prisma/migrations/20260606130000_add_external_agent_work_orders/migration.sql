CREATE TYPE "ExternalAgentType" AS ENUM ('CLAUDE_CODE', 'CODEX', 'CLINE', 'KILO', 'ANTIGRAVITY', 'HERMES', 'OPENCODE', 'CUSTOM');
CREATE TYPE "ExternalAgentExecutionMode" AS ENUM ('MANUAL_COPY_PASTE', 'CLI_MANUAL', 'API', 'FUTURE_AUTOMATED');
CREATE TYPE "ExternalAgentSafetyLevel" AS ENUM ('LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK');
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "WorkSessionStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'INTERRUPTED');
CREATE TYPE "ImplementationTestResult" AS ENUM ('NOT_RUN', 'PASSED', 'FAILED', 'PARTIAL');

CREATE TABLE "ExternalAgent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ExternalAgentType" NOT NULL,
  "roleTitle" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "executionMode" "ExternalAgentExecutionMode" NOT NULL DEFAULT 'MANUAL_COPY_PASTE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "safetyLevel" "ExternalAgentSafetyLevel" NOT NULL DEFAULT 'MEDIUM_RISK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrder" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "context" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "constraints" TEXT NOT NULL DEFAULT '',
  "acceptanceCriteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "validationCommands" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetProject" TEXT,
  "targetRepository" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "assignedExternalAgentId" TEXT,
  "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
  "createdByUserId" TEXT,
  "createdByAgentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkSession" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "externalAgentId" TEXT,
  "sessionLabel" TEXT NOT NULL,
  "status" "WorkSessionStatus" NOT NULL DEFAULT 'STARTED',
  "inputPrompt" TEXT NOT NULL,
  "outputSummary" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImplementationReport" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "workSessionId" TEXT,
  "externalAgentId" TEXT,
  "summary" TEXT NOT NULL,
  "filesChanged" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "commandsRun" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "testsRun" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "testResult" "ImplementationTestResult" NOT NULL DEFAULT 'NOT_RUN',
  "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "decisionsMade" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "remainingWork" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "nextRecommendedAction" TEXT,
  "rawOutput" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImplementationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HandoffBrief" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "fromWorkSessionId" TEXT,
  "title" TEXT NOT NULL,
  "currentStatus" TEXT NOT NULL,
  "completedWork" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "decisionsMade" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "filesChanged" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "knownIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "nextSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "suggestedNextAgentType" TEXT,
  "handoffPrompt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HandoffBrief_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedExternalAgentId_fkey" FOREIGN KEY ("assignedExternalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_externalAgentId_fkey" FOREIGN KEY ("externalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImplementationReport" ADD CONSTRAINT "ImplementationReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImplementationReport" ADD CONSTRAINT "ImplementationReport_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImplementationReport" ADD CONSTRAINT "ImplementationReport_externalAgentId_fkey" FOREIGN KEY ("externalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoffBrief" ADD CONSTRAINT "HandoffBrief_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandoffBrief" ADD CONSTRAINT "HandoffBrief_fromWorkSessionId_fkey" FOREIGN KEY ("fromWorkSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
