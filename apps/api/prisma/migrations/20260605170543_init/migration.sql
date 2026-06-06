-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "responseStyle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "systemPrompt" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CouncilSession" ADD COLUMN     "fallbackNotice" TEXT,
ADD COLUMN     "modelUsed" TEXT,
ADD COLUMN     "providerName" TEXT;
