-- AlterTable: Add parameterMode and modelParameters to Agent
ALTER TABLE "Agent" ADD COLUMN "parameterMode" TEXT DEFAULT 'ROLE_DEFAULT';
ALTER TABLE "Agent" ADD COLUMN "modelParameters" JSONB;
