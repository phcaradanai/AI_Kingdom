-- CreateIndex
CREATE INDEX "AutomationCandidate_kind_idx" ON "AutomationCandidate"("kind");

-- CreateIndex
CREATE INDEX "AutomationCandidate_sourceType_sourceId_kind_idx" ON "AutomationCandidate"("sourceType", "sourceId", "kind");

-- CreateIndex
CREATE INDEX "AutomationCandidate_status_idx" ON "AutomationCandidate"("status");

-- CreateIndex
CREATE INDEX "AutomationCandidate_confidence_idx" ON "AutomationCandidate"("confidence");

-- CreateIndex
CREATE INDEX "AutomationCandidate_priority_idx" ON "AutomationCandidate"("priority");

-- CreateIndex
CREATE INDEX "AutomationCandidate_riskLevel_idx" ON "AutomationCandidate"("riskLevel");

-- CreateIndex
CREATE INDEX "AutomationCandidate_loopRunId_idx" ON "AutomationCandidate"("loopRunId");

-- CreateIndex
CREATE INDEX "AutomationCandidate_createdAt_idx" ON "AutomationCandidate"("createdAt");

-- CreateIndex
CREATE INDEX "LivingLoopRun_status_idx" ON "LivingLoopRun"("status");

-- CreateIndex
CREATE INDEX "LivingLoopRun_triggerType_idx" ON "LivingLoopRun"("triggerType");

-- CreateIndex
CREATE INDEX "LivingLoopRun_startedAt_idx" ON "LivingLoopRun"("startedAt");

-- AddForeignKey
ALTER TABLE "AutomationCandidate" ADD CONSTRAINT "AutomationCandidate_loopRunId_fkey" FOREIGN KEY ("loopRunId") REFERENCES "LivingLoopRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
