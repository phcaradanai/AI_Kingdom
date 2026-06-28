/**
 * Backfill memory embeddings (M25-B)
 *
 * Generates and stores embeddingVector for every Memory row that currently has
 * embeddingVector = NULL. Run this once after deploying the M25-B migration.
 *
 * Usage (from repo root):
 *   npm run data:backfill-embeddings
 */

import { prisma } from "../db/prisma.js";
import { generateEmbedding } from "../ai/embeddingService.js";

const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const total = await prisma.memory.count({ where: { embeddingVector: null } });
  console.log(`Backfilling embeddings for ${total} memory rows…`);
  if (total === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  let processed = 0;
  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.memory.findMany({
      where: { embeddingVector: null },
      select: { id: true, title: true, content: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    for (const row of batch) {
      const vec = await generateEmbedding(`${row.title} ${row.content}`);
      await prisma.memory.update({
        where: { id: row.id },
        data: { embeddingVector: vec }
      });
      processed++;
      if (processed % 10 === 0) {
        process.stdout.write(`\r  ${processed}/${total}`);
      }
    }
  }

  console.log(`\nDone. ${processed} memories embedded.`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
