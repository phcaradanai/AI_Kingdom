-- CreateEnum
CREATE TYPE "NoticeSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'COUNCIL_REVIEW', 'AWAITING_ROYAL_DECISION', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MatterPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MatterCategory" AS ENUM ('TREASURY', 'SECURITY', 'REVENUE', 'SYSTEM', 'RESEARCH', 'PRODUCT', 'GENERAL');

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "severity" "NoticeSeverity" NOT NULL DEFAULT 'INFO',
    "status" "NoticeStatus" NOT NULL DEFAULT 'UNREAD',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MatterStatus" NOT NULL DEFAULT 'DETECTED',
    "priority" "MatterPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "MatterCategory" NOT NULL DEFAULT 'GENERAL',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "assignedAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);
