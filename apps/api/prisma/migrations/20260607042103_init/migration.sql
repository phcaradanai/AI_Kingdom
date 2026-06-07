-- CreateTable
CREATE TABLE "AIUsageTraceStep" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "parentStepId" TEXT,
    "stepType" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "agentId" TEXT,
    "providerId" TEXT,
    "providerType" TEXT,
    "providerName" TEXT,
    "model" TEXT,
    "usageRecordId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "councilSessionId" TEXT,
    "reportId" TEXT,
    "tokensUsed" INTEGER,
    "estimatedCostUSD" DOUBLE PRECISION,
    "promptPreview" TEXT,
    "responsePreview" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsageTraceStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_traceId_idx" ON "AIUsageTraceStep"("traceId");

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_agentId_idx" ON "AIUsageTraceStep"("agentId");

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_usageRecordId_idx" ON "AIUsageTraceStep"("usageRecordId");

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_councilSessionId_idx" ON "AIUsageTraceStep"("councilSessionId");

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_taskId_idx" ON "AIUsageTraceStep"("taskId");

-- CreateIndex
CREATE INDEX "AIUsageTraceStep_sequence_idx" ON "AIUsageTraceStep"("sequence");

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AIUsageTrace"("traceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "UsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_councilSessionId_fkey" FOREIGN KEY ("councilSessionId") REFERENCES "CouncilSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageTraceStep" ADD CONSTRAINT "AIUsageTraceStep_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
