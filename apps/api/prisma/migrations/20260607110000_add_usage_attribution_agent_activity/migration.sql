ALTER TABLE "UsageRecord"
ADD COLUMN "projectId" TEXT,
ADD COLUMN "purpose" TEXT,
ADD COLUMN "sourceType" TEXT,
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "operation" TEXT,
ADD COLUMN "requestLabel" TEXT,
ADD COLUMN "promptPreview" TEXT,
ADD COLUMN "responsePreview" TEXT,
ADD COLUMN "metadata" JSONB;

CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "councilSessionId" TEXT,
    "status" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "providerId" TEXT,
    "providerName" TEXT,
    "model" TEXT,
    "operation" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageRecord_projectId_idx" ON "UsageRecord"("projectId");
CREATE INDEX "UsageRecord_sourceType_idx" ON "UsageRecord"("sourceType");
CREATE INDEX "UsageRecord_sourceId_idx" ON "UsageRecord"("sourceId");
CREATE INDEX "UsageRecord_purpose_idx" ON "UsageRecord"("purpose");

CREATE INDEX "AgentActivity_agentId_idx" ON "AgentActivity"("agentId");
CREATE INDEX "AgentActivity_projectId_idx" ON "AgentActivity"("projectId");
CREATE INDEX "AgentActivity_taskId_idx" ON "AgentActivity"("taskId");
CREATE INDEX "AgentActivity_councilSessionId_idx" ON "AgentActivity"("councilSessionId");
CREATE INDEX "AgentActivity_status_idx" ON "AgentActivity"("status");
CREATE INDEX "AgentActivity_heartbeatAt_idx" ON "AgentActivity"("heartbeatAt");
CREATE INDEX "AgentActivity_endedAt_idx" ON "AgentActivity"("endedAt");

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_councilSessionId_fkey" FOREIGN KEY ("councilSessionId") REFERENCES "CouncilSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
