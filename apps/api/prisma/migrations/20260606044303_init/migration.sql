-- CreateEnum
CREATE TYPE "SettingsCategory" AS ENUM ('AI', 'UI', 'SECURITY', 'SYSTEM');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "defaultModel" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "maxTokens" INTEGER,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "temperature" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" "SettingsCategory" NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
