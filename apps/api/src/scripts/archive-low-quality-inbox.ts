/**
 * M15F — Archive low-quality inbox items.
 *
 * Finds ProjectInboxItems where:
 *   - status = PENDING
 *   - confidenceScore < 40
 *   - evidence contains only generic/denied keywords (or none at all)
 *
 * Dry run (default): prints a table of items that would be archived.
 * Apply (--apply):   sets status to ARCHIVED for matching items.
 *
 * Usage:
 *   npm run data:archive-low-quality-inbox              # dry run
 *   npm run data:archive-low-quality-inbox -- --apply    # apply
 */
import { PrismaClient } from "@prisma/client";
import { GENERIC_KEYWORD_DENYLIST } from "../services/routingQualityGate.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log("=== M15F — Archive Low-Quality Inbox Items ===\n");
  console.log(`Mode: ${apply ? "APPLY (will archive)" : "DRY RUN (preview only)"}\n`);

  const candidates = await prisma.projectInboxItem.findMany({
    where: {
      status: "PENDING",
      confidenceScore: { lt: 40 }
    },
    orderBy: { createdAt: "desc" }
  });

  const toArchive = candidates.filter((item) => {
    // If the item has explicit evidence, check if ALL of it is generic
    const evidence = item.evidence as Array<{ type?: string; value?: string }> | null;
    if (evidence && evidence.length > 0) {
      const hasNonGeneric = evidence.some((signal) => {
        if (signal.type !== "keyword") return true; // non-keyword evidence is strong
        return !GENERIC_KEYWORD_DENYLIST.has((signal.value ?? "").toLowerCase().trim());
      });
      if (hasNonGeneric) return false; // has real evidence, don't archive
    }

    // If the item has no evidence field, fall back to heuristics
    if (!evidence) {
      const reason = (item.reason ?? "").toLowerCase();
      const hasGenericOnly = [...GENERIC_KEYWORD_DENYLIST].some((word) =>
        reason.includes(`keyword '${word}'`)
      );
      const hasStrongSignal = reason.includes("project name") ||
        reason.includes("alias") ||
        reason.includes("codename") ||
        reason.includes("ancestry");
      if (hasStrongSignal) return false;
      if (!hasGenericOnly && item.confidenceScore !== 0 && item.confidenceScore !== null) return false;
    }

    return true;
  });

  if (toArchive.length === 0) {
    console.log("No items matched the archive criteria. Inbox is clean.\n");
    return;
  }

  console.log(`Found ${toArchive.length} item(s) to archive:\n`);
  console.log("─".repeat(120));
  console.log(
    pad("ID", 28) +
    pad("Title", 40) +
    pad("Conf", 6) +
    pad("Source", 16) +
    pad("Why", 30)
  );
  console.log("─".repeat(120));

  for (const item of toArchive) {
    const whyArchived = determineArchiveReason(item);
    console.log(
      pad(item.id, 28) +
      pad(truncate(item.title, 38), 40) +
      pad(String(item.confidenceScore ?? 0), 6) +
      pad(item.sourceType, 16) +
      pad(whyArchived, 30)
    );
  }
  console.log("─".repeat(120));

  if (apply) {
    const result = await prisma.projectInboxItem.updateMany({
      where: { id: { in: toArchive.map((item) => item.id) }, status: "PENDING" },
      data: { status: "ARCHIVED" }
    });
    console.log(`\n✅ Archived ${result.count} item(s).\n`);
  } else {
    console.log(`\nDry run complete. Run with --apply to archive these items.`);
    console.log(`  npm run data:archive-low-quality-inbox -- --apply\n`);
  }
}

function determineArchiveReason(item: { confidenceScore: number | null; reason: string | null; evidence: unknown }): string {
  const conf = item.confidenceScore ?? 0;
  if (conf === 0) return "zero confidence";
  const evidence = item.evidence as Array<{ type?: string; value?: string }> | null;
  if (evidence && evidence.length === 0) return "no evidence";
  if (!evidence) return `conf ${conf}% + no evidence`;
  return `conf ${conf}% + generic-only`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
