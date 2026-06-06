-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('DECISION', 'FACT', 'PREFERENCE', 'CONSTRAINT', 'PROJECT_NOTE', 'LESSON');

-- CreateEnum
CREATE TYPE "MemoryImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "CouncilSession" ADD COLUMN     "autoSavedMemoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "consultedMemoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "importance" "MemoryImportance" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sourceCouncilSessionId" TEXT,
ADD COLUMN     "sourceTaskId" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" "MemoryType" NOT NULL DEFAULT 'PROJECT_NOTE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "source" SET DEFAULT 'manual';
