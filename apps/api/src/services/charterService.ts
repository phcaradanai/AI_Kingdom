import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db/prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHARTER_PATH = resolve(__dirname, "../../../../docs/KINGDOM_CHARTER.md");
const VISION_PATH = resolve(__dirname, "../../../../docs/KINGDOM_VISION.md");

function readFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}

function extractMission(markdown: string): string {
  const lines = markdown.split("\n");
  let inPrimeDirective = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+prime directive/i.test(trimmed)) {
      inPrimeDirective = true;
      continue;
    }
    if (inPrimeDirective && trimmed.startsWith("#")) break;
    if (inPrimeDirective && trimmed.length > 0) return trimmed;
  }
  // fallback: first non-heading, non-empty line
  return lines.find((l) => l.trim() && !l.trim().startsWith("#"))?.trim() ?? "The Kingdom exists to serve the King.";
}

export async function getCharter() {
  return prisma.kingdomCharter.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function getVision() {
  return prisma.kingdomVision.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}

export async function updateCharter(fields: { mission?: string; content?: string }) {
  const existing = await getCharter();
  if (!existing) throw new Error("Kingdom Charter not found");
  return prisma.kingdomCharter.update({
    where: { id: existing.id },
    data: {
      ...(fields.mission !== undefined && { mission: fields.mission }),
      ...(fields.content !== undefined && { content: fields.content })
    }
  });
}

export async function updateVision(fields: { content?: string }) {
  const existing = await getVision();
  if (!existing) throw new Error("Kingdom Vision not found");
  return prisma.kingdomVision.update({
    where: { id: existing.id },
    data: {
      ...(fields.content !== undefined && { content: fields.content })
    }
  });
}

export async function seedKingdomDocuments(): Promise<void> {
  const existingCharter = await getCharter();
  if (!existingCharter) {
    const content = readFile(CHARTER_PATH);
    if (content) {
      await prisma.kingdomCharter.create({
        data: { version: "1.0.0", mission: extractMission(content), content }
      });
      console.log("[Kingdom] Charter loaded");
    } else {
      console.warn("[Kingdom] Charter file not found — skipping charter seed");
    }
  }

  const existingVision = await getVision();
  if (!existingVision) {
    const content = readFile(VISION_PATH);
    if (content) {
      await prisma.kingdomVision.create({
        data: { version: "2026", content, isActive: true }
      });
      console.log("[Kingdom] Vision loaded");
    } else {
      console.warn("[Kingdom] Vision file not found — skipping vision seed");
    }
  }
}

export function formatKingdomContext(charter: { content: string } | null, vision: { content: string } | null): string {
  if (!charter && !vision) return "";
  const parts: string[] = [];
  if (charter) parts.push(`[KINGDOM CHARTER]\n${charter.content}`);
  if (vision) parts.push(`[KINGDOM VISION]\n${vision.content}`);
  return parts.join("\n\n---\n\n");
}
