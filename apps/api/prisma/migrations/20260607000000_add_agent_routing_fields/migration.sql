-- Add fallbackModels and routingPolicy to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "fallbackModels" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "routingPolicy" TEXT DEFAULT 'GLOBAL_ROUTING';
