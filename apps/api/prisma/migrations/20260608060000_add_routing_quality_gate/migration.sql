-- M15F: Project Inbox Routing Quality Gate
-- Adds routing quality metadata, human-readable fields, and ARCHIVED status

-- Add ARCHIVED to ProjectInboxStatus enum
ALTER TYPE "ProjectInboxStatus" ADD VALUE 'ARCHIVED';

-- Add routing quality gate columns to ProjectInboxItem
ALTER TABLE "ProjectInboxItem" ADD COLUMN "routingConfidence" INTEGER;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "routingQuality" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "dataQualityLabel" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "humanTitle" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "humanReason" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "evidence" JSONB;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "ignoredSignals" JSONB;
