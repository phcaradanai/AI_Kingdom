import { formatKingdomContext, getCharter, getVision, seedKingdomDocuments } from "./charterService.js";

export async function getKingdomContext(): Promise<string> {
  try {
    let charter = await getCharter();
    let vision = await getVision();

    if (!charter || !vision) {
      // Auto-create from files — idempotent, never overwrites existing
      await seedKingdomDocuments();
      if (!charter) charter = await getCharter();
      if (!vision) vision = await getVision();
    }

    if (!charter) console.warn("[Kingdom] Charter missing — agent context will omit charter");
    if (!vision) console.warn("[Kingdom] Vision missing — agent context will omit vision");

    return formatKingdomContext(charter, vision);
  } catch (error) {
    console.warn("[Kingdom] Failed to load kingdom context:", error instanceof Error ? error.message : error);
    return "";
  }
}
