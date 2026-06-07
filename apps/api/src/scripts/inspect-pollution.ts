/**
 * Inspect dev database for test/demo pollution.
 * Shows counts of suspicious records but does NOT delete anything.
 *
 * Usage: npm run data:inspect-pollution
 */
import { PrismaClient } from "@prisma/client";
import {
  PROTECTED_EMAILS,
  findMarkedTestData,
  findSuspiciousUnmarkedData
} from "./pollutionRules.js";

const prisma = new PrismaClient();

async function main() {
  console.log("=== AI Kingdom — Dev Database Pollution Inspection ===\n");

  const [marked, suspicious] = await Promise.all([
    findMarkedTestData(prisma),
    findSuspiciousUnmarkedData(prisma)
  ]);

  const agentsByTitle = await prisma.agent.groupBy({
    by: ["title"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } }
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log(`Users marked isTestData=true:   ${marked.users.length}`);
  console.log(`Users suspicious (unmarked):    ${suspicious.users.length}`);
  if (suspicious.users.length > 0) {
    suspicious.users.slice(0, 10).forEach((u) =>
      console.log(`  - ${u.email} (${u.createdAt.toISOString()}) reason=${u.reason}`)
    );
    if (suspicious.users.length > 10) console.log(`  ... and ${suspicious.users.length - 10} more`);
  }
  console.log(`Protected (never suspicious):   ${PROTECTED_EMAILS.join(", ")}`);

  // ── Agents ─────────────────────────────────────────────────────────────────
  console.log(`\nAgents marked isTestData=true:  ${marked.agents.length}`);
  console.log(`Agents suspicious (unmarked):   ${suspicious.agents.length}`);
  if (suspicious.agents.length > 0) {
    suspicious.agents.slice(0, 10).forEach((a) =>
      console.log(`  - ${a.slug} "${a.title}" (${a.createdAt.toISOString()}) reason=${a.reason}`)
    );
    if (suspicious.agents.length > 10) console.log(`  ... and ${suspicious.agents.length - 10} more`);
  }
  console.log(`Duplicate agent titles:         ${agentsByTitle.length}`);
  if (agentsByTitle.length > 0) {
    agentsByTitle.forEach((row) =>
      console.log(`  - "${row.title}" × ${row._count.id}`)
    );
  }

  // ── Matters ────────────────────────────────────────────────────────────────
  console.log(`\nMatters marked isTestData=true: ${marked.matters.length}`);
  console.log(`Matters suspicious (unmarked):  ${suspicious.matters.length}`);
  if (suspicious.matters.length > 0) {
    suspicious.matters.slice(0, 10).forEach((m) =>
      console.log(`  - ${m.id} "${m.title}" (${m.createdAt.toISOString()}) reason=${m.reason}`)
    );
    if (suspicious.matters.length > 10) console.log(`  ... and ${suspicious.matters.length - 10} more`);
  }

  // ── Notices ────────────────────────────────────────────────────────────────
  console.log(`\nNotices marked isTestData=true: ${marked.notices.length}`);
  console.log(`Notices suspicious (unmarked):  ${suspicious.notices.length}`);
  if (suspicious.notices.length > 0) {
    suspicious.notices.slice(0, 10).forEach((n) =>
      console.log(`  - ${n.id} "${n.title}" (${n.createdAt.toISOString()}) reason=${n.reason}`)
    );
    if (suspicious.notices.length > 10) console.log(`  ... and ${suspicious.notices.length - 10} more`);
  }

  // ── ProjectInboxItems + Artifacts ──────────────────────────────────────────
  console.log(`\nInbox items isTestData=true:    ${marked.inboxItems.length}`);
  console.log(`Artifacts isTestData=true:      ${marked.artifacts.length}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalTagged = marked.users.length + marked.agents.length + marked.matters.length +
    marked.notices.length + marked.inboxItems.length + marked.artifacts.length;
  const totalSuspicious = suspicious.users.length + suspicious.agents.length +
    suspicious.matters.length + suspicious.notices.length;

  console.log("\n=== Summary ===");
  console.log(`Confirmed test records (isTestData=true):   ${totalTagged}`);
  console.log(`Suspicious unmarked records (heuristic):    ${totalSuspicious}`);
  console.log(`\nRun "npm run data:cleanup-test-data" to see deletion preview.`);
  console.log(`Run "npm run data:cleanup-test-data -- --apply" to delete tagged records.`);
  console.log(`Add --include-suspicious-unmarked to also delete heuristic matches (review first).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
