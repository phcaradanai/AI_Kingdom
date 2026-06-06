import { prisma } from "../db/prisma.js";
import { PRICING_TABLE } from "../pricing/providerPricing.js";

export type PricingSource = "db" | "static" | "unknown";
// KNOWN   = exact cache-aware or legacy pricing matched and all token counts present
// ESTIMATED = pricing found but cache breakdown unavailable; input cost conservatively estimated as cache miss
// UNKNOWN = no pricing found; cost recorded as $0
export type PricingStatus = "KNOWN" | "ESTIMATED" | "UNKNOWN";

export type ModelPricingResult = {
  // Legacy simple pricing (null for cache-aware-only models)
  inputPerMillion?: number | null;
  outputPerMillion: number;
  // Cache-aware pricing
  inputCacheHitPerMillion?: number | null;
  inputCacheMissPerMillion?: number | null;
  // Metadata
  source: PricingSource;
  pricingStatus: PricingStatus;
  resolvedKey?: string;
  isAlias?: boolean;
  aliasOf?: string | null;
  isDeprecated?: boolean;
  canonicalModel?: string | null;
  concurrencyLimit?: number | null;
  supportsThinking?: boolean;
  defaultThinkingEnabled?: boolean;
  supportedReasoningEfforts?: string[];
  unsupportedThinkingParams?: string[];
};

export type ModelPricingRecord = {
  id: string;
  providerType: string;
  model: string;
  displayName: string | null;
  canonicalModel: string | null;
  inputPerMillion: number | null;
  outputPerMillion: number;
  inputCacheHitPerMillion: number | null;
  inputCacheMissPerMillion: number | null;
  currency: string;
  source: string;
  notes: string | null;
  isAlias: boolean;
  aliasOf: string | null;
  isDeprecated: boolean;
  deprecationDate: Date | null;
  concurrencyLimit: number | null;
  supportsThinking: boolean;
  defaultThinkingEnabled: boolean;
  supportedReasoningEfforts: string[];
  unsupportedThinkingParams: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CacheAwareUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCacheHitTokens?: number | null;
  inputCacheMissTokens?: number | null;
};

export type CostCalculationResult = {
  costUSD: number;
  pricingStatus: PricingStatus;
  source: PricingSource;
  pricingNotes?: string;
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
      inputCacheHitPerMillion: dbRow.inputCacheHitPerMillion,
      inputCacheMissPerMillion: dbRow.inputCacheMissPerMillion,
      source: "db",
      pricingStatus: "KNOWN",
      resolvedKey: key,
      isAlias: dbRow.isAlias,
      aliasOf: dbRow.aliasOf,
      isDeprecated: dbRow.isDeprecated,
      canonicalModel: dbRow.canonicalModel,
      concurrencyLimit: dbRow.concurrencyLimit,
      supportsThinking: dbRow.supportsThinking,
      defaultThinkingEnabled: dbRow.defaultThinkingEnabled,
      supportedReasoningEfforts: dbRow.supportedReasoningEfforts,
      unsupportedThinkingParams: dbRow.unsupportedThinkingParams
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

export async function calculateCostUSDFromRegistry(
  providerType: string,
  model: string,
  usage: CacheAwareUsage
): Promise<CostCalculationResult> {
  const pricing = await getModelPricing(providerType, model);

  if (pricing.pricingStatus === "UNKNOWN") {
    return { costUSD: 0, pricingStatus: "UNKNOWN", source: pricing.source };
  }

  const { promptTokens, completionTokens, inputCacheHitTokens, inputCacheMissTokens } = usage;
  const hasCacheAwarePricing = pricing.inputCacheHitPerMillion != null && pricing.inputCacheMissPerMillion != null;

  if (hasCacheAwarePricing) {
    const hitPrice = pricing.inputCacheHitPerMillion!;
    const missPrice = pricing.inputCacheMissPerMillion!;
    const outPrice = pricing.outputPerMillion;

    if (inputCacheHitTokens != null && inputCacheMissTokens != null) {
      // Full cache-aware calculation
      const costUSD =
        (inputCacheHitTokens * hitPrice +
          inputCacheMissTokens * missPrice +
          completionTokens * outPrice) /
        1_000_000;
      return { costUSD, pricingStatus: "KNOWN", source: pricing.source };
    } else {
      // Cache pricing exists but provider did not return cache breakdown — use miss rate conservatively
      const costUSD = (promptTokens * missPrice + completionTokens * outPrice) / 1_000_000;
      return {
        costUSD,
        pricingStatus: "ESTIMATED",
        source: pricing.source,
        pricingNotes: "Cache details unavailable; input estimated as cache miss."
      };
    }
  }

  // Legacy simple pricing path (inputPerMillion always present in static table or older DB rows)
  const inputRate = pricing.inputPerMillion ?? 0;
  const costUSD = (promptTokens * inputRate + completionTokens * pricing.outputPerMillion) / 1_000_000;
  return { costUSD, pricingStatus: "KNOWN", source: pricing.source };
}

// Backward-compatible wrapper — callers that don't supply cache detail get ESTIMATED when applicable.
export async function calculateCostFromRegistry(
  providerType: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<{ costUSD: number; pricingStatus: PricingStatus; source: PricingSource }> {
  return calculateCostUSDFromRegistry(providerType, model, {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  });
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const DEPRECATION_DATE = new Date("2026-07-24T15:59:00Z");

export const DEFAULT_MODEL_PRICING: Array<{
  providerType: string;
  model: string;
  displayName: string;
  canonicalModel?: string;
  inputPerMillion?: number;
  outputPerMillion: number;
  inputCacheHitPerMillion?: number;
  inputCacheMissPerMillion?: number;
  isAlias?: boolean;
  aliasOf?: string;
  isDeprecated?: boolean;
  deprecationDate?: Date;
  concurrencyLimit?: number;
  supportsThinking?: boolean;
  defaultThinkingEnabled?: boolean;
  supportedReasoningEfforts?: string[];
  unsupportedThinkingParams?: string[];
  notes?: string;
}> = [
  { providerType: "mock", model: "deterministic-mock-v1", displayName: "Mock (deterministic)", inputPerMillion: 0, outputPerMillion: 0 },
  { providerType: "openai", model: "gpt-4o", displayName: "GPT-4o", inputPerMillion: 2.5, outputPerMillion: 10.0 },
  { providerType: "openai", model: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { providerType: "openai", model: "gpt-4-turbo", displayName: "GPT-4 Turbo", inputPerMillion: 10.0, outputPerMillion: 30.0 },
  { providerType: "openai", model: "gpt-4", displayName: "GPT-4", inputPerMillion: 30.0, outputPerMillion: 60.0 },
  { providerType: "openai", model: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", inputPerMillion: 0.5, outputPerMillion: 1.5 },
  { providerType: "openrouter", model: "openai/gpt-4o-mini", displayName: "OpenRouter GPT-4o Mini", inputPerMillion: 0.15, outputPerMillion: 0.6 },

  // DeepSeek V4 — official pricing from api-docs.deepseek.com (as of 2026-06)
  {
    providerType: "deepseek",
    model: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    inputCacheHitPerMillion: 0.0028,
    inputCacheMissPerMillion: 0.14,
    outputPerMillion: 0.28,
    concurrencyLimit: 2500,
    supportsThinking: true,
    defaultThinkingEnabled: true,
    supportedReasoningEfforts: ["high", "max"],
    unsupportedThinkingParams: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
    notes: "deepseek-chat and deepseek-reasoner are compatibility aliases for this model."
  },
  {
    providerType: "deepseek",
    model: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    inputCacheHitPerMillion: 0.003625,
    inputCacheMissPerMillion: 0.435,
    outputPerMillion: 0.87,
    concurrencyLimit: 500,
    supportsThinking: true,
    defaultThinkingEnabled: true,
    supportedReasoningEfforts: ["high", "max"],
    unsupportedThinkingParams: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
    notes: "Official DeepSeek V4 Pro pricing."
  },
  // Deprecated aliases — same pricing as deepseek-v4-flash
  {
    providerType: "deepseek",
    model: "deepseek-chat",
    displayName: "DeepSeek Chat (alias → V4 Flash)",
    canonicalModel: "deepseek-v4-flash",
    inputCacheHitPerMillion: 0.0028,
    inputCacheMissPerMillion: 0.14,
    outputPerMillion: 0.28,
    concurrencyLimit: 2500,
    supportsThinking: true,
    defaultThinkingEnabled: true,
    supportedReasoningEfforts: ["high", "max"],
    unsupportedThinkingParams: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
    isAlias: true,
    aliasOf: "deepseek-v4-flash",
    isDeprecated: true,
    deprecationDate: DEPRECATION_DATE,
    notes: "Deprecated compatibility alias for deepseek-v4-flash (non-thinking mode). Deprecated after 2026-07-24."
  },
  {
    providerType: "deepseek",
    model: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner (alias → V4 Flash)",
    canonicalModel: "deepseek-v4-flash",
    inputCacheHitPerMillion: 0.0028,
    inputCacheMissPerMillion: 0.14,
    outputPerMillion: 0.28,
    concurrencyLimit: 2500,
    supportsThinking: true,
    defaultThinkingEnabled: true,
    supportedReasoningEfforts: ["high", "max"],
    unsupportedThinkingParams: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
    isAlias: true,
    aliasOf: "deepseek-v4-flash",
    isDeprecated: true,
    deprecationDate: DEPRECATION_DATE,
    notes: "Deprecated compatibility alias for deepseek-v4-flash (thinking mode). Deprecated after 2026-07-24."
  }
];

export async function ensureDefaultModelPricing() {
  for (const entry of DEFAULT_MODEL_PRICING) {
    await prisma.aIModelPricing.upsert({
      where: { providerType_model: { providerType: entry.providerType, model: entry.model } },
      update: {
        displayName: entry.displayName,
        canonicalModel: entry.canonicalModel ?? null,
        inputPerMillion: entry.inputPerMillion ?? null,
        outputPerMillion: entry.outputPerMillion,
        inputCacheHitPerMillion: entry.inputCacheHitPerMillion ?? null,
        inputCacheMissPerMillion: entry.inputCacheMissPerMillion ?? null,
        isAlias: entry.isAlias ?? false,
        aliasOf: entry.aliasOf ?? null,
        isDeprecated: entry.isDeprecated ?? false,
        deprecationDate: entry.deprecationDate ?? null,
        concurrencyLimit: entry.concurrencyLimit ?? null,
        supportsThinking: entry.supportsThinking ?? false,
        defaultThinkingEnabled: entry.defaultThinkingEnabled ?? false,
        supportedReasoningEfforts: entry.supportedReasoningEfforts ?? [],
        unsupportedThinkingParams: entry.unsupportedThinkingParams ?? [],
        notes: entry.notes ?? null
      },
      create: {
        providerType: entry.providerType,
        model: entry.model,
        displayName: entry.displayName,
        canonicalModel: entry.canonicalModel ?? null,
        inputPerMillion: entry.inputPerMillion ?? null,
        outputPerMillion: entry.outputPerMillion,
        inputCacheHitPerMillion: entry.inputCacheHitPerMillion ?? null,
        inputCacheMissPerMillion: entry.inputCacheMissPerMillion ?? null,
        isAlias: entry.isAlias ?? false,
        aliasOf: entry.aliasOf ?? null,
        isDeprecated: entry.isDeprecated ?? false,
        deprecationDate: entry.deprecationDate ?? null,
        concurrencyLimit: entry.concurrencyLimit ?? null,
        supportsThinking: entry.supportsThinking ?? false,
        defaultThinkingEnabled: entry.defaultThinkingEnabled ?? false,
        supportedReasoningEfforts: entry.supportedReasoningEfforts ?? [],
        unsupportedThinkingParams: entry.unsupportedThinkingParams ?? [],
        notes: entry.notes ?? null,
        source: "seed",
        isActive: true
      }
    });
  }
  invalidatePricingCache();
}
