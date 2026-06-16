-- M17G: Safe Patch Import and Apply Flow

-- AlterTable: add importedPatch (raw patch text) and importedPatchStatus tracking
ALTER TABLE "AutomationJob"
  ADD COLUMN "importedPatch" TEXT,
  ADD COLUMN "importedPatchStatus" TEXT;
