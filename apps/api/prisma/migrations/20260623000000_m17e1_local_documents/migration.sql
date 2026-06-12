-- CreateEnum
CREATE TYPE "LocalDocumentScanStatus" AS ENUM ('READY', 'FAILED', 'PARTIAL', 'STALE');

-- CreateEnum
CREATE TYPE "LocalDocumentRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "LocalDocumentRoot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "rootPathHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedGlobs" JSONB NOT NULL,
    "blockedGlobs" JSONB NOT NULL,
    "maxFileBytes" INTEGER NOT NULL DEFAULT 200000,
    "maxTotalBytes" INTEGER NOT NULL DEFAULT 5000000,
    "lastScannedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalDocumentRoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalDocumentSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "localDocumentRootId" TEXT NOT NULL,
    "scanStatus" "LocalDocumentScanStatus" NOT NULL DEFAULT 'READY',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileCount" INTEGER NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "importantFiles" JSONB NOT NULL,
    "detectedStack" JSONB,
    "packageScripts" JSONB,
    "riskZones" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalDocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalDocumentInsight" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "modifiedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskLevel" "LocalDocumentRiskLevel" NOT NULL DEFAULT 'LOW',
    "isDoc" BOOLEAN NOT NULL DEFAULT false,
    "isCode" BOOLEAN NOT NULL DEFAULT false,
    "isConfig" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalDocumentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocalDocumentRoot_projectId_idx" ON "LocalDocumentRoot"("projectId");

-- CreateIndex
CREATE INDEX "LocalDocumentRoot_isActive_idx" ON "LocalDocumentRoot"("isActive");

-- CreateIndex
CREATE INDEX "LocalDocumentSnapshot_projectId_idx" ON "LocalDocumentSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "LocalDocumentSnapshot_localDocumentRootId_idx" ON "LocalDocumentSnapshot"("localDocumentRootId");

-- CreateIndex
CREATE INDEX "LocalDocumentSnapshot_scannedAt_idx" ON "LocalDocumentSnapshot"("scannedAt");

-- CreateIndex
CREATE INDEX "LocalDocumentInsight_snapshotId_idx" ON "LocalDocumentInsight"("snapshotId");

-- CreateIndex
CREATE INDEX "LocalDocumentInsight_projectId_idx" ON "LocalDocumentInsight"("projectId");

-- CreateIndex
CREATE INDEX "LocalDocumentInsight_relativePath_idx" ON "LocalDocumentInsight"("relativePath");

-- CreateIndex
CREATE INDEX "LocalDocumentInsight_riskLevel_idx" ON "LocalDocumentInsight"("riskLevel");

-- AddForeignKey
ALTER TABLE "LocalDocumentRoot" ADD CONSTRAINT "LocalDocumentRoot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalDocumentSnapshot" ADD CONSTRAINT "LocalDocumentSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalDocumentSnapshot" ADD CONSTRAINT "LocalDocumentSnapshot_localDocumentRootId_fkey" FOREIGN KEY ("localDocumentRootId") REFERENCES "LocalDocumentRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalDocumentInsight" ADD CONSTRAINT "LocalDocumentInsight_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LocalDocumentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalDocumentInsight" ADD CONSTRAINT "LocalDocumentInsight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
