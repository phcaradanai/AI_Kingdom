-- AlterTable: add data provenance fields for test isolation
ALTER TABLE "User" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "testRunId" TEXT;

ALTER TABLE "Agent" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Agent" ADD COLUMN "testRunId" TEXT;

ALTER TABLE "Matter" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Matter" ADD COLUMN "testRunId" TEXT;

ALTER TABLE "Notice" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notice" ADD COLUMN "testRunId" TEXT;

ALTER TABLE "ProjectInboxItem" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectInboxItem" ADD COLUMN "testRunId" TEXT;

ALTER TABLE "Artifact" ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Artifact" ADD COLUMN "testRunId" TEXT;
