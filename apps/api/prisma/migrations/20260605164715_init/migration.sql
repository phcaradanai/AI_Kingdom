/*
  Warnings:

  - You are about to drop the column `content` on the `AgentResponse` table. All the data in the column will be lost.
  - You are about to drop the column `taskId` on the `AgentResponse` table. All the data in the column will be lost.
  - Added the required column `response` to the `AgentResponse` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `AgentResponse` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sessionId` to the `AgentResponse` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CouncilSessionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "AgentResponse" DROP CONSTRAINT "AgentResponse_taskId_fkey";

-- AlterTable
ALTER TABLE "AgentResponse" DROP COLUMN "content",
DROP COLUMN "taskId",
ADD COLUMN     "response" TEXT NOT NULL,
ADD COLUMN     "role" TEXT NOT NULL,
ADD COLUMN     "sessionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CouncilSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "CouncilSessionStatus" NOT NULL DEFAULT 'PENDING',
    "selectedAgentIds" TEXT[],
    "finalSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CouncilSession" ADD CONSTRAINT "CouncilSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResponse" ADD CONSTRAINT "AgentResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CouncilSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
