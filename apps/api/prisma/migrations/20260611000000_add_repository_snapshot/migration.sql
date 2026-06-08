-- CreateTable: Repository snapshot for project workspace intelligence.
CREATE TABLE "RepositorySnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repositoryUrl" TEXT,
    "branch" TEXT,
    "framework" TEXT,
    "language" TEXT,
    "packageManager" TEXT,
    "prismaModels" JSONB NOT NULL DEFAULT '[]',
    "modules" JSONB NOT NULL DEFAULT '[]',
    "services" JSONB NOT NULL DEFAULT '[]',
    "apiRoutes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepositorySnapshot_projectId_idx" ON "RepositorySnapshot"("projectId");

-- AddForeignKey
ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
