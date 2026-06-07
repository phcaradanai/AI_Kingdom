/**
 * Safely deletes test/pollution records from the database.
 *
 * Behavior:
 *   Dry run by default — prints what would be deleted.
 *   --apply          actually deletes isTestData=true records
 *   --include-suspicious-unmarked  also targets heuristic matches
 *
 * Safety rules:
 *   - Never deletes king@aikingdom.local
 *   - Never deletes seeded canonical agents
 *   - Never deletes records without isTestData=true unless --include-suspicious-unmarked
 *
 * Usage:
 *   npm run data:cleanup-test-data
 *   npm run data:cleanup-test-data -- --apply
 *   npm run data:cleanup-test-data -- --apply --include-suspicious-unmarked
 *   npm run data:cleanup-test-data -- --include-suspicious-unmarked   (dry run preview)
 */
import { PrismaClient } from "@prisma/client";
import {
  PROTECTED_EMAILS,
  PROTECTED_AGENT_SLUGS,
  findMarkedTestData,
  findSuspiciousUnmarkedData
} from "./pollutionRules.js";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const INCLUDE_SUSPICIOUS = process.argv.includes("--include-suspicious-unmarked");

async function main() {
  const mode = APPLY ? "APPLY" : "DRY RUN";
  const suspiciousLabel = INCLUDE_SUSPICIOUS ? " + suspicious unmarked" : "";
  console.log(`=== AI Kingdom — Test Data Cleanup [${mode}${suspiciousLabel}] ===\n`);

  const marked = await findMarkedTestData(prisma);
  const suspicious = INCLUDE_SUSPICIOUS ? await findSuspiciousUnmarkedData(prisma) : null;

  // ── Report marked ──────────────────────────────────────────────────────────
  console.log("Records marked isTestData=true:");
  console.log(`  Users:              ${marked.users.length}`);
  marked.users.forEach((u) => console.log(`    - ${u.email}`));
  console.log(`  Agents:             ${marked.agents.length}`);
  marked.agents.forEach((a) => console.log(`    - ${a.slug} "${a.title}"`));
  console.log(`  Matters:            ${marked.matters.length}`);
  marked.matters.forEach((m) => console.log(`    - ${m.id} "${m.title}"`));
  console.log(`  Notices:            ${marked.notices.length}`);
  marked.notices.forEach((n) => console.log(`    - ${n.id} "${n.title}"`));
  console.log(`  Inbox items:        ${marked.inboxItems.length}`);
  console.log(`  Artifacts:          ${marked.artifacts.length}`);

  // ── Report suspicious ──────────────────────────────────────────────────────
  if (suspicious) {
    console.log("\nSuspicious unmarked records (heuristic, would be deleted):");
    console.log(`  Users:              ${suspicious.users.length}`);
    suspicious.users.forEach((u) =>
      console.log(`    - ${u.email} reason=${u.reason} createdAt=${u.createdAt.toISOString()}`)
    );
    console.log(`  Agents:             ${suspicious.agents.length}`);
    suspicious.agents.forEach((a) =>
      console.log(`    - ${a.slug} "${a.title}" reason=${a.reason} createdAt=${a.createdAt.toISOString()}`)
    );
    console.log(`  Matters:            ${suspicious.matters.length}`);
    suspicious.matters.forEach((m) =>
      console.log(`    - ${m.id} "${m.title}" reason=${m.reason} createdAt=${m.createdAt.toISOString()}`)
    );
    console.log(`  Notices:            ${suspicious.notices.length}`);
    suspicious.notices.forEach((n) =>
      console.log(`    - ${n.id} "${n.title}" reason=${n.reason} createdAt=${n.createdAt.toISOString()}`)
    );

    console.log(`\nProtected canonical records (never deleted):`);
    PROTECTED_EMAILS.forEach((e) => console.log(`    - ${e}`));
    PROTECTED_AGENT_SLUGS.forEach((s) => console.log(`    - agent: ${s}`));
  }

  // ── Build delete sets ──────────────────────────────────────────────────────
  const allUserIds = [...marked.users.map((u) => u.id), ...(suspicious?.users.map((u) => u.id) ?? [])];
  const allAgentIds = [...marked.agents.map((a) => a.id), ...(suspicious?.agents.map((a) => a.id) ?? [])];
  const matterIds = [...marked.matters.map((m) => m.id), ...(suspicious?.matters.map((m) => m.id) ?? [])];
  const noticeIds = [...marked.notices.map((n) => n.id), ...(suspicious?.notices.map((n) => n.id) ?? [])];
  const inboxIds = marked.inboxItems.map((i) => i.id);
  const artifactIds = marked.artifacts.map((a) => a.id);

  const totalRecords = allUserIds.length + allAgentIds.length + matterIds.length +
    noticeIds.length + inboxIds.length + artifactIds.length;

  if (!APPLY) {
    if (totalRecords === 0) {
      console.log("\n✓ Nothing to clean up.");
    } else {
      console.log(`\n[DRY RUN] Would delete ${totalRecords} records total.`);
      console.log("Re-run with --apply to actually delete.");
    }
    return;
  }

  if (totalRecords === 0) {
    console.log("\n✓ Nothing to clean up.");
    return;
  }

  // ── Delete (FK-safe order) ─────────────────────────────────────────────────
  console.log(`\nDeleting ${totalRecords} records...`);

  if (matterIds.length > 0) await prisma.matter.deleteMany({ where: { id: { in: matterIds } } });
  if (noticeIds.length > 0) await prisma.notice.deleteMany({ where: { id: { in: noticeIds } } });
  if (inboxIds.length > 0) await prisma.projectInboxItem.deleteMany({ where: { id: { in: inboxIds } } });
  if (artifactIds.length > 0) await prisma.artifact.deleteMany({ where: { id: { in: artifactIds } } });
  if (allAgentIds.length > 0) await prisma.agent.deleteMany({ where: { id: { in: allAgentIds } } });
  if (allUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });

  console.log("✓ Cleanup complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
