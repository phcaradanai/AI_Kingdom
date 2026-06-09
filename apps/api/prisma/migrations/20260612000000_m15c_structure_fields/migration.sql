-- M15C: Add controllers and frontendPages fields to RepositorySnapshot
ALTER TABLE "RepositorySnapshot" ADD COLUMN "controllers" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "RepositorySnapshot" ADD COLUMN "frontendPages" JSONB NOT NULL DEFAULT '[]';
