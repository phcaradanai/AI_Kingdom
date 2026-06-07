CREATE TABLE "AIUsageTrace" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerRoute" TEXT,
    "triggerLabel" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "councilSessionId" TEXT,
    "agentId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "operation" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "providerId" TEXT,
    "providerType" TEXT,
    "providerName" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "promptPreview" TEXT,
    "responsePreview" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsageTrace_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UsageRecord"
ADD COLUMN "traceId" TEXT,
ADD COLUMN "attributionStatus" TEXT NOT NULL DEFAULT 'LEGACY_UNATTRIBUTED';

ALTER TABLE "AgentActivity"
ADD COLUMN "traceId" TEXT,
ADD COLUMN "attributionStatus" TEXT NOT NULL DEFAULT 'LEGACY_UNATTRIBUTED',
ADD COLUMN "sourceType" TEXT,
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "requestLabel" TEXT,
ADD COLUMN "usageRecordId" TEXT,
ADD COLUMN "reportId" TEXT;

CREATE UNIQUE INDEX "AIUsageTrace_traceId_key" ON "AIUsageTrace"("traceId");
CREATE INDEX "AIUsageTrace_actorUserId_idx" ON "AIUsageTrace"("actorUserId");
CREATE INDEX "AIUsageTrace_projectId_idx" ON "AIUsageTrace"("projectId");
CREATE INDEX "AIUsageTrace_taskId_idx" ON "AIUsageTrace"("taskId");
CREATE INDEX "AIUsageTrace_councilSessionId_idx" ON "AIUsageTrace"("councilSessionId");
CREATE INDEX "AIUsageTrace_agentId_idx" ON "AIUsageTrace"("agentId");
CREATE INDEX "AIUsageTrace_sourceType_idx" ON "AIUsageTrace"("sourceType");
CREATE INDEX "AIUsageTrace_operation_idx" ON "AIUsageTrace"("operation");
CREATE INDEX "AIUsageTrace_startedAt_idx" ON "AIUsageTrace"("startedAt");

CREATE INDEX "UsageRecord_traceId_idx" ON "UsageRecord"("traceId");
CREATE INDEX "UsageRecord_attributionStatus_idx" ON "UsageRecord"("attributionStatus");

CREATE INDEX "AgentActivity_traceId_idx" ON "AgentActivity"("traceId");
CREATE INDEX "AgentActivity_attributionStatus_idx" ON "AgentActivity"("attributionStatus");

ALTER TABLE "AIUsageTrace" ADD CONSTRAINT "AIUsageTrace_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIUsageTrace" ADD CONSTRAINT "AIUsageTrace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIUsageTrace" ADD CONSTRAINT "AIUsageTrace_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIUsageTrace" ADD CONSTRAINT "AIUsageTrace_councilSessionId_fkey" FOREIGN KEY ("councilSessionId") REFERENCES "CouncilSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIUsageTrace" ADD CONSTRAINT "AIUsageTrace_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AIUsageTrace"("traceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AIUsageTrace"("traceId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "UsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (deferred from 20260607042103_init — AIUsageTrace must exist first)
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AIUsageTrace"("traceId") ON DELETE CASCADE ON UPDATE CASCADE;
