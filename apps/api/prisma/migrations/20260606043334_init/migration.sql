-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('STRATEGY', 'RESEARCH', 'ARCHITECTURE', 'FINANCE', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_taskId_fkey";

-- DropIndex
DROP INDEX "Report_taskId_key";

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "category" "ReportCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "content" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "importance" "ReportImportance" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sourceCouncilSessionId" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "taskId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_sourceCouncilSessionId_fkey" FOREIGN KEY ("sourceCouncilSessionId") REFERENCES "CouncilSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
