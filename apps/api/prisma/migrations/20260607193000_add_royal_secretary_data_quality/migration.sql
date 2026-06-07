ALTER TABLE "Matter" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "Matter" ADD COLUMN "dataQuality" TEXT;
ALTER TABLE "Matter" ADD COLUMN "provenance" JSONB;
ALTER TABLE "Matter" ADD COLUMN "traceId" TEXT;
ALTER TABLE "Matter" ADD COLUMN "createdBySystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Notice" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "Notice" ADD COLUMN "dataQuality" TEXT;
ALTER TABLE "Notice" ADD COLUMN "provenance" JSONB;
ALTER TABLE "Notice" ADD COLUMN "traceId" TEXT;
ALTER TABLE "Notice" ADD COLUMN "createdBySystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProjectInboxItem" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "dataQuality" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "provenance" JSONB;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "traceId" TEXT;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "createdBySystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Artifact" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "dataQuality" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "provenance" JSONB;
ALTER TABLE "Artifact" ADD COLUMN "traceId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "createdBySystem" BOOLEAN NOT NULL DEFAULT false;
