import { prisma } from "../db/prisma.js";
import { PRICING_TABLE, type ModelPricing } from "../pricing/providerPricing.js";

export type PricingSource = "db" | "static" | "unknown";
export type PricingStatus = "KNOWN" | "UNKNOWN";

export type ModelPricingResult = ModelPricing & {
  source: PricingSource;
  pricingStatus: PricingStatus;
  resolvedKey?: string;
};

export type ModelPricingRecord = {
  id: string;
  providerType: string;
  model: string;
  displayName: string | null;
  inputPerMillion: number;
  outputPerMillion: number;
  currency: string;
  source: string;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// In-process cache: populated on first use, invalidated after writes.
let cache: Map<string, ModelPricingRecord> | null = null;

async function loadCache(): Promise<Map<string, ModelPricingRecord>> {
  if (cache) return cache;
  const rows = await prisma.aIModelPricing.findMany({ where: { isActive: true } });
  cache = new Map(rows.map((row) => [`${row.providerType}:${row.model}`, row]));
  return cache;
}

export function invalidatePricingCache() {
  cache = null;
}

export async function getModelPricing(providerType: string, model: string): Promise<ModelPricingResult> {
  const pricingCache = await loadCache();
  const key = `${providerType}:${model}`;

  // 1. Exact match in DB
  const dbRow = pricingCache.get(key);
  if (dbRow) {
    return {
      inputPerMillion: dbRow.inputPerMillion,
      outputPerMillion: dbRow.outputPerMillion,
      source: "db",
      pricingStatus: "KNOWN",
      resolvedKey: key
    };
  }

  // 2. Static table exact match
  const staticExact = PRICING_TABLE[key];
  if (staticExact) {
    return { ...staticExact, source: "static", pricingStatus: "KNOWN", resolvedKey: key };
  }

  // 3. Static table fuzzy alias (deepseek only)
  if (providerType === "deepseek") {
    const lc = model.toLowerCase();
    for (const [tableKey, pricing] of Object.entries(PRICING_TABLE)) {
      if (!tableKey.startsWith("deepseek:")) continue;
      const suffix = tableKey.slice("deepseek:".length);
      if (lc.includes(suffix)) {
        return { ...pricing, source: "static", pricingStatus: "KNOWN", resolvedKey: tableKey };
      }
    }
  }

  // 4. Unknown
  console.warn(`No pricing found for ${key} — cost recorded as $0.00`);
  return { inputPerMillion: 0, outputPerMillion: 0, source: "unknown", pricingStatus: "UNKNOWN" };
}

export async function calculateCostFromRegistry(
  providerType: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<{ costUSD: number; pricingStatus: PricingStatus; source: PricingSource }> {
  const pricing = await getModelPricing(providerType, model);
  const costUSD = (promptTokens * pricing.inputPerMillion + completionTokens * pricing.outputPerMillion) / 1_000_000;
  return { costUSD, pricingStatus: pricing.pricingStatus, source: pricing.source };
}

export const DEFAULT_MODEL_PRICING: Array<{
  providerType: string;
  model: string;
  displayName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  notes?: string;
}> = [
  { providerType: "mock", model: "deterministic-mock-v1", displayName: "Mock (deterministic)", inputPerMillion: 0, outputPerMillion: 0 },
  { providerType: "openai", model: "gpt-4o", displayName: "GPT-4o", inputPerMillion: 2.5, outputPerMillion: 10.0 },
  { providerType: "openai", model: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { providerType: "openai", model: "gpt-4-turbo", displayName: "GPT-4 Turbo", inputPerMillion: 10.0, outputPerMillion: 30.0 },
  { providerType: "openai", model: "gpt-4", displayName: "GPT-4", inputPerMillion: 30.0, outputPerMillion: 60.0 },
  { providerType: "openai", model: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", inputPerMillion: 0.5, outputPerMillion: 1.5 },
  { providerType: "openrouter", model: "openai/gpt-4o-mini", displayName: "OpenRouter GPT-4o Mini", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { providerType: "deepseek", model: "deepseek-chat", displayName: "DeepSeek Chat", inputPerMillion: 0.27, outputPerMillion: 1.1 },
  { providerType: "deepseek", model: "deepseek-coder", displayName: "DeepSeek Coder", inputPerMillion: 0.27, outputPerMillion: 1.1 },
  {
    providerType: "deepseek", model: "deepseek-reasoner", displayName: "DeepSeek Reasoner",
    inputPerMillion: 0.55, outputPerMillion: 2.19,
    notes: "Verify current provider pricing"
  },
  {
    providerType: "deepseek", model: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro",
    inputPerMillion: 0.27, outputPerMillion: 1.1,
    notes: "Verify current provider pricing"
  }
];

export async function ensureDefaultModelPricing() {
  for (const entry of DEFAULT_MODEL_PRICING) {
    await prisma.aIModelPricing.upsert({
      where: { providerType_model: { providerType: entry.providerType, model: entry.model } },
      update: {
        displayName: entry.displayName,
        inputPerMillion: entry.inputPerMillion,
        outputPerMillion: entry.outputPerMillion,
        ...(entry.notes ? { notes: entry.notes } : {})
      },
      create: {
        providerType: entry.providerType,
        model: entry.model,
        displayName: entry.displayName,
        inputPerMillion: entry.inputPerMillion,
        outputPerMillion: entry.outputPerMillion,
        notes: entry.notes ?? null,
        source: "seed",
        isActive: true
      }
    });
  }
  invalidatePricingCache();
}
