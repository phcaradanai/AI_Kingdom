-- M16C: Add internal agent assignment fields to WorkOrder
ALTER TABLE "WorkOrder" ADD COLUMN "assignedAgentId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "assignedAgentReason" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "assignedAgentConfidence" DOUBLE PRECISION;

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
