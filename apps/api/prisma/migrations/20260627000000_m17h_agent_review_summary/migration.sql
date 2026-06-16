-- M17H: Runner Result Agent Review

CREATE TABLE "AgentReviewSummary" (
  "id" TEXT NOT NULL,
  "automationJobId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "projectId" TEXT,
  "reviewerAgentId" TEXT,
  "verdict" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "kingRecommendation" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "whatPassed" JSONB NOT NULL DEFAULT '[]',
  "whatFailed" JSONB NOT NULL DEFAULT '[]',
  "failedCommands" JSONB NOT NULL DEFAULT '[]',
  "riskNotes" JSONB NOT NULL DEFAULT '[]',
  "nextActions" JSONB NOT NULL DEFAULT '[]',
  "externalAgentPrompt" TEXT,
  "sourceReportId" TEXT,
  "patchArtifactId" TEXT,
  "rawModelOutput" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentReviewSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentReviewSummary_automationJobId_key" ON "AgentReviewSummary"("automationJobId");
CREATE INDEX "AgentReviewSummary_workOrderId_idx" ON "AgentReviewSummary"("workOrderId");
CREATE INDEX "AgentReviewSummary_projectId_idx" ON "AgentReviewSummary"("projectId");
CREATE INDEX "AgentReviewSummary_reviewerAgentId_idx" ON "AgentReviewSummary"("reviewerAgentId");
CREATE INDEX "AgentReviewSummary_verdict_idx" ON "AgentReviewSummary"("verdict");
CREATE INDEX "AgentReviewSummary_kingRecommendation_idx" ON "AgentReviewSummary"("kingRecommendation");

ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_reviewerAgentId_fkey" FOREIGN KEY ("reviewerAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "ImplementationReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewSummary" ADD CONSTRAINT "AgentReviewSummary_patchArtifactId_fkey" FOREIGN KEY ("patchArtifactId") REFERENCES "PatchArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
