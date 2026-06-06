-- CreateTable
CREATE TABLE "KingdomCharter" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "mission" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingdomCharter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingdomVision" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '2026',
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingdomVision_pkey" PRIMARY KEY ("id")
);
