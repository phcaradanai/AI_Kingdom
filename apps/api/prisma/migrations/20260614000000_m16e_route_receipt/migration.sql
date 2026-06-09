-- M16E: Route Receipt - add durationMs to AIUsageTraceStep for per-attempt timing
ALTER TABLE "AIUsageTraceStep" ADD COLUMN "durationMs" INTEGER;
