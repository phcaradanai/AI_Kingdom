-- AlterTable: add mode-correction fields to CouncilSession
ALTER TABLE "CouncilSession" ADD COLUMN "originalMode" "TaskMode";
ALTER TABLE "CouncilSession" ADD COLUMN "modeCorrectionReason" TEXT;

-- CreateTable: ContinuityEvent — records each resolveExecutionReadiness() decision
CREATE TABLE "ContinuityEvent" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT,
    "taskId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "readinessState" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContinuityEvent_workOrderId_idx" ON "ContinuityEvent"("workOrderId");
CREATE INDEX "ContinuityEvent_readinessState_idx" ON "ContinuityEvent"("readinessState");
CREATE INDEX "ContinuityEvent_createdAt_idx" ON "ContinuityEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ContinuityEvent" ADD CONSTRAINT "ContinuityEvent_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
