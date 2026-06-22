-- M24 external-agent readiness: runner-reported CLI capabilities + new agent types

-- AgentRunner: store the runner-probed external-agent CLI capabilities
ALTER TABLE "AgentRunner" ADD COLUMN "agentCapabilities" JSONB;
ALTER TABLE "AgentRunner" ADD COLUMN "capabilitiesUpdatedAt" TIMESTAMP(3);

-- New external agent types the King uses
ALTER TYPE "ExternalAgentType" ADD VALUE IF NOT EXISTS 'CURSOR';
ALTER TYPE "ExternalAgentType" ADD VALUE IF NOT EXISTS 'DEVIN';
