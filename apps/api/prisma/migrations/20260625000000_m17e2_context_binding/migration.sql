-- M17E-2: Repository Snapshot + WorkOrder Context Binding

-- CreateEnum
CREATE TYPE "ContextBindingStatus" AS ENUM ('FRESH', 'STALE', 'MISSING', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ContextValidationStatus" AS ENUM ('FRESH', 'STALE', 'MISSING', 'PARTIAL', 'NOT_REQUIRED');

-- AlterTable
ALTER TABLE "WorkOrder"
  ADD COLUMN "localDocumentSnapshotId" TEXT,
  ADD COLUMN "repositorySnapshotId" TEXT,
  ADD COLUMN "contextBoundAt" TIMESTAMP(3),
  ADD COLUMN "contextBindingStatus" "ContextBindingStatus" NOT NULL DEFAULT 'MISSING',
  ADD COLUMN "contextBindingSummary" JSONB,
  ADD COLUMN "contextBindingProvenance" JSONB;

-- AlterTable
ALTER TABLE "AutomationJob"
  ADD COLUMN "localDocumentSnapshotId" TEXT,
  ADD COLUMN "repositorySnapshotId" TEXT,
  ADD COLUMN "contextRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contextValidationStatus" "ContextValidationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "contextValidationSummary" JSONB;

-- AlterTable
ALTER TABLE "PatchArtifact"
  ADD COLUMN "localDocumentSnapshotId" TEXT,
  ADD COLUMN "repositorySnapshotId" TEXT,
  ADD COLUMN "baseContextStatus" "ContextBindingStatus" NOT NULL DEFAULT 'MISSING',
  ADD COLUMN "baseContextProvenance" JSONB;

-- AlterTable
ALTER TABLE "ImplementationReport"
  ADD COLUMN "localDocumentSnapshotId" TEXT,
  ADD COLUMN "repositorySnapshotId" TEXT,
  ADD COLUMN "contextUsed" JSONB;

-- AlterTable
ALTER TABLE "RoyalBrief"
  ADD COLUMN "contextHealthSummary" JSONB NOT NULL DEFAULT '{}';
