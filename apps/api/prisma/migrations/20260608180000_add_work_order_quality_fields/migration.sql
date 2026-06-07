-- Add ARCHIVED to WorkOrderStatus enum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'ARCHIVED';

-- Add quality, provenance, and tracking fields to WorkOrder
ALTER TABLE "WorkOrder" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ADD COLUMN "createdBySystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ADD COLUMN "dataQuality" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "workQuality" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "archiveReason" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "traceId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "provenance" JSONB;
