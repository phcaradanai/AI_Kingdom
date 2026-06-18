import { prisma } from "../db/prisma.js";

/**
 * M19 — Enable Autonomous Kingdom operation.
 *
 * Flips the runtime settings that let the Kingdom act on its own after a decree:
 *   - LIVING_LOOP_ENABLED                      → the background scheduler starts driving observe→propose→act
 *   - LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS  → read-only VALIDATION_ONLY jobs are auto-created (safe)
 *   - COUNCIL_AUTO_WORK_ORDER_MODE             → council results auto-create work orders (DRAFT or READY)
 *
 * Opt-in (only with --with-sandbox-patch):
 *   - LIVING_LOOP_AUTO_SANDBOX_PATCH           → LOW-risk sandbox patch jobs are auto-created (still NEEDS_REVIEW,
 *                                                 never pushes a branch, opens a PR, merges, or deploys)
 *
 * Usage (from repo root):
 *   npm run autonomy:enable                       # work-order mode READY, no auto sandbox patch
 *   npm run autonomy:enable -- --mode=DRAFT        # work orders land as drafts for King review
 *   npm run autonomy:enable -- --with-sandbox-patch
 *   npm run autonomy:disable                       # turn it all back off
 */

type Flags = { disable: boolean; mode: "OFF" | "DRAFT" | "READY"; withSandboxPatch: boolean };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { disable: false, mode: "READY", withSandboxPatch: false };
  for (const arg of argv) {
    if (arg === "--disable") flags.disable = true;
    else if (arg === "--with-sandbox-patch") flags.withSandboxPatch = true;
    else if (arg.startsWith("--mode=")) {
      const value = arg.split("=")[1]?.toUpperCase();
      if (value === "OFF" || value === "DRAFT" || value === "READY") flags.mode = value;
      else throw new Error(`Invalid --mode value: ${value}. Use OFF, DRAFT, or READY.`);
    }
  }
  return flags;
}

async function setSetting(key: string, value: string, description: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: "SYSTEM", description }
  });
  console.log(`  ${key} = ${value}`);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.disable) {
    console.log("=== M19: Disabling autonomous operation ===");
    await setSetting("LIVING_LOOP_ENABLED", "false", "Enable the continuous living loop.");
    await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "false", "Auto-create VALIDATION_ONLY jobs.");
    await setSetting("LIVING_LOOP_AUTO_SANDBOX_PATCH", "false", "Auto-run SANDBOX_PATCH jobs.");
    await setSetting("COUNCIL_AUTO_WORK_ORDER_MODE", "OFF", "Planner auto-creates work orders after council.");
    console.log("\nAutonomy disabled. The scheduler keeps ticking but does nothing.");
    return;
  }

  console.log("=== M19: Enabling autonomous operation ===");
  await setSetting("LIVING_LOOP_ENABLED", "true", "Enable the continuous living loop.");
  await setSetting("LIVING_LOOP_AUTO_CREATE_VALIDATION_JOBS", "true", "Auto-create read-only VALIDATION_ONLY jobs.");
  await setSetting("COUNCIL_AUTO_WORK_ORDER_MODE", flags.mode, "Planner auto-creates work orders after council.");
  await setSetting(
    "LIVING_LOOP_AUTO_SANDBOX_PATCH",
    flags.withSandboxPatch ? "true" : "false",
    "Auto-run LOW-risk SANDBOX_PATCH jobs (still NEEDS_REVIEW; no push/PR/merge/deploy)."
  );

  console.log("\nAutonomy enabled. Reminders:");
  console.log("  • The API must be running; the background scheduler drives the loop on LIVING_LOOP_INTERVAL_MS.");
  console.log("  • Auto-validation and auto-sandbox-patch jobs require an ONLINE runner (npm run runner:bootstrap + runner dev).");
  console.log("  • Auto sandbox patches always land NEEDS_REVIEW — the King still approves; nothing is pushed, merged, or deployed.");
  if (flags.mode === "READY") {
    console.log("  • COUNCIL_AUTO_WORK_ORDER_MODE=READY: council results become work orders ready for agent assignment.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
