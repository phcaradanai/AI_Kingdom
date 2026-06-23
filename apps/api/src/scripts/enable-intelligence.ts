import { prisma } from "../db/prisma.js";

/**
 * Enable the "make the Kingdom smarter / better" settings — the intelligence and quality
 * levers that improve outputs WITHOUT escalating operational autonomy (no background loop,
 * no auto-execute, no auto branch push/PR/merge/deploy).
 *
 *   - PLANNER_CROSS_TASK_LEARNING   → planner learns from past review outcomes (what worked / what to avoid)
 *   - COUNCIL_PARALLEL_SPECIALISTS  → council specialists run concurrently (faster; independent opinions)
 *   - SUPERVISED_AUTO_RETRY_ENABLED → mechanical job failures self-fix once before escalating (bounded, NEEDS_REVIEW)
 *   - ADAPTIVE_REASONING_ENABLED    → the responsible agent thinks harder on complex work
 *   - AI_MAX_TOKENS_AUTOGROW        → token budget grows + persists when a real provider truncates
 *
 * These are distinct from `autonomy:enable` (Living Loop / auto work orders / auto sandbox
 * patch), which makes the Kingdom ACT on its own and is a separate, deliberate opt-in.
 *
 * Usage (from repo root):
 *   npm run intelligence:enable
 *   npm run intelligence:disable   # revert the levers this script controls
 */

const INTELLIGENCE_SETTINGS = [
  "PLANNER_CROSS_TASK_LEARNING",
  "COUNCIL_PARALLEL_SPECIALISTS",
  "SUPERVISED_AUTO_RETRY_ENABLED",
  "ADAPTIVE_REASONING_ENABLED",
  "AI_MAX_TOKENS_AUTOGROW"
] as const;

async function setSetting(key: string, value: string): Promise<void> {
  const before = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: "SYSTEM", description: key }
  });
  console.log(`  ${key}: ${before?.value ?? "(unset)"} → ${value}`);
}

async function main(): Promise<void> {
  const disable = process.argv.slice(2).includes("--disable");
  const value = disable ? "false" : "true";
  console.log(`=== ${disable ? "Disabling" : "Enabling"} Kingdom intelligence settings ===`);
  for (const key of INTELLIGENCE_SETTINGS) {
    await setSetting(key, value);
  }
  console.log(`\nDone. These levers improve quality/intelligence only — they add no operational autonomy.`);
  console.log(`(Living Loop / auto work orders / auto sandbox patch are controlled separately by autonomy:enable.)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
