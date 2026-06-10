-- M17C: Patch Review + Safe Git Branch Mode

-- PatchArtifact: stores sanitized diff artifacts from sandbox runner
CREATE TABLE "PatchArtifact" (
    "id" TEXT NOT NULL,
    "automationJobId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diffStat" TEXT,
    "diffPreview" TEXT,
    "fullPatch" TEXT,
    "fullPatchTruncated" BOOLEAN NOT NULL DEFAULT false,
    "filesChanged" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "validationResults" JSONB,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "blockedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchName" TEXT,
    "branchPushed" BOOLEAN NOT NULL DEFAULT false,
    "prUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatchArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatchArtifact_automationJobId_idx" ON "PatchArtifact"("automationJobId");
CREATE INDEX "PatchArtifact_workOrderId_idx" ON "PatchArtifact"("workOrderId");
CREATE INDEX "PatchArtifact_projectId_idx" ON "PatchArtifact"("projectId");
CREATE INDEX "PatchArtifact_riskLevel_idx" ON "PatchArtifact"("riskLevel");
CREATE INDEX "PatchArtifact_validationStatus_idx" ON "PatchArtifact"("validationStatus");

ALTER TABLE "PatchArtifact" ADD CONSTRAINT "PatchArtifact_automationJobId_fkey"
    FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatchArtifact" ADD CONSTRAINT "PatchArtifact_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatchArtifact" ADD CONSTRAINT "PatchArtifact_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatchArtifact" ADD CONSTRAINT "PatchArtifact_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
