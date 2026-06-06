-- CreateEnum
CREATE TYPE "TaskMode" AS ENUM ('ASK', 'PLAN', 'RESEARCH', 'BUILD');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "mode" "TaskMode" NOT NULL DEFAULT 'ASK';
