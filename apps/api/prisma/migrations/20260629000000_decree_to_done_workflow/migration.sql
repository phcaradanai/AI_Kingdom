CREATE TYPE "WorkflowRunType" AS ENUM ('DECREE_TO_DONE');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'BLOCKED', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED');
CREATE TYPE "WorkflowStepKey" AS ENUM ('INTAKE_DECREE', 'CHECK_CONTEXT', 'RUN_COUNCIL', 'CREATE_WORK_ORDER', 'RESOLVE_AGENT', 'DISPATCH_RUNNER', 'VALIDATE_RESULT', 'REVIEW_RESULT', 'RETRY_OR_ESCALATE', 'ARCHIVE_LEARNING', 'DONE');
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'BLOCKED', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED');

CREATE TABLE "WorkflowRun" (
  "id" TEXT NOT NULL,
  "type" "WorkflowRunType" NOT NULL DEFAULT 'DECREE_TO_DONE',
  "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
  "currentStep" "WorkflowStepKey" NOT NULL DEFAULT 'INTAKE_DECREE',
  "sourceTaskId" TEXT NOT NULL,
  "projectId" TEXT,
  "workOrderId" TEXT,
  "automationJobId" TEXT,
  "lastError" TEXT,
  "nextAction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowStepRun" (
  "id" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "stepKey" "WorkflowStepKey" NOT NULL,
  "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "summary" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowRun_sourceTaskId_key" ON "WorkflowRun"("sourceTaskId");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");
CREATE INDEX "WorkflowRun_currentStep_idx" ON "WorkflowRun"("currentStep");
CREATE INDEX "WorkflowRun_projectId_idx" ON "WorkflowRun"("projectId");
CREATE INDEX "WorkflowRun_workOrderId_idx" ON "WorkflowRun"("workOrderId");
CREATE INDEX "WorkflowRun_automationJobId_idx" ON "WorkflowRun"("automationJobId");
CREATE INDEX "WorkflowRun_updatedAt_idx" ON "WorkflowRun"("updatedAt");
CREATE UNIQUE INDEX "WorkflowStepRun_workflowRunId_stepKey_key" ON "WorkflowStepRun"("workflowRunId", "stepKey");
CREATE INDEX "WorkflowStepRun_workflowRunId_idx" ON "WorkflowStepRun"("workflowRunId");
CREATE INDEX "WorkflowStepRun_status_idx" ON "WorkflowStepRun"("status");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
