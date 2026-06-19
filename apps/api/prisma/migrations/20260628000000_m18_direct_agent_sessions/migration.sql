-- CreateEnum
CREATE TYPE "DirectAgentSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DirectAgentMessageRole" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DirectAgentRequestType" AS ENUM ('GENERAL_QUESTION', 'RESEARCH_ASSIGNMENT', 'SUMMARY_ASSIGNMENT', 'PERSONAL_TASK');

-- CreateTable
CREATE TABLE "DirectAgentSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestType" "DirectAgentRequestType" NOT NULL DEFAULT 'GENERAL_QUESTION',
    "status" "DirectAgentSessionStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT,
    "latestTraceId" TEXT,
    "latestUsageRecordId" TEXT,
    "artifactId" TEXT,
    "knowledgeCandidateId" TEXT,
    "providerName" TEXT,
    "modelUsed" TEXT,
    "fallbackNotice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DirectAgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectAgentMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT,
    "role" "DirectAgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "traceId" TEXT,
    "usageRecordId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectAgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectAgentSession_agentId_idx" ON "DirectAgentSession"("agentId");

-- CreateIndex
CREATE INDEX "DirectAgentSession_projectId_idx" ON "DirectAgentSession"("projectId");

-- CreateIndex
CREATE INDEX "DirectAgentSession_createdByUserId_idx" ON "DirectAgentSession"("createdByUserId");

-- CreateIndex
CREATE INDEX "DirectAgentSession_requestType_idx" ON "DirectAgentSession"("requestType");

-- CreateIndex
CREATE INDEX "DirectAgentSession_status_idx" ON "DirectAgentSession"("status");

-- CreateIndex
CREATE INDEX "DirectAgentSession_createdAt_idx" ON "DirectAgentSession"("createdAt");

-- CreateIndex
CREATE INDEX "DirectAgentMessage_sessionId_idx" ON "DirectAgentMessage"("sessionId");

-- CreateIndex
CREATE INDEX "DirectAgentMessage_agentId_idx" ON "DirectAgentMessage"("agentId");

-- CreateIndex
CREATE INDEX "DirectAgentMessage_role_idx" ON "DirectAgentMessage"("role");

-- CreateIndex
CREATE INDEX "DirectAgentMessage_traceId_idx" ON "DirectAgentMessage"("traceId");

-- CreateIndex
CREATE INDEX "DirectAgentMessage_createdAt_idx" ON "DirectAgentMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "DirectAgentSession" ADD CONSTRAINT "DirectAgentSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectAgentSession" ADD CONSTRAINT "DirectAgentSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectAgentSession" ADD CONSTRAINT "DirectAgentSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectAgentMessage" ADD CONSTRAINT "DirectAgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DirectAgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectAgentMessage" ADD CONSTRAINT "DirectAgentMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
