-- AlterTable
ALTER TABLE "AIProvider" ADD COLUMN     "modelValidationStatus" TEXT DEFAULT 'NOT_CHECKED',
ADD COLUMN     "lastValidationTime" TIMESTAMP(3);
