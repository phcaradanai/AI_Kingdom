-- CreateTable
CREATE TABLE "AIModelPricing" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT,
    "inputPerMillion" DOUBLE PRECISION NOT NULL,
    "outputPerMillion" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIModelPricing_providerType_idx" ON "AIModelPricing"("providerType");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelPricing_providerType_model_key" ON "AIModelPricing"("providerType", "model");
