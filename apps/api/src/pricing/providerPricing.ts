export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export type PricingResult = {
  costUSD: number;
  pricingStatus: "known" | "aliased" | "unknown";
  resolvedKey?: string;
};

// USD per 1M tokens — keyed as "provider:model"
const PRICING_TABLE: Record<string, ModelPricing> = {
  "mock:deterministic-mock-v1": { inputPerMillion: 0.0, outputPerMillion: 0.0 },
  "openai:gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "openai:gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai:gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  "openai:gpt-4": { inputPerMillion: 30.0, outputPerMillion: 60.0 },
  "openai:gpt-3.5-turbo": { inputPerMillion: 0.5, outputPerMillion: 1.5 },
  "openai:gpt-4o-2024-11-20": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "openai:gpt-4o-2024-08-06": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "openai:gpt-4o-mini-2024-07-18": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openrouter:openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  // DeepSeek — prices as of 2025-06 (cache-miss rates; cache-hit is ~10x cheaper)
  "deepseek:deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  "deepseek:deepseek-coder": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  "deepseek:deepseek-v4-pro": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  "deepseek:deepseek-reasoner": { inputPerMillion: 0.55, outputPerMillion: 2.19 }
};

// Fuzzy alias rules for deepseek — applied when exact key is not found.
// Order matters: most specific substring first.
const DEEPSEEK_ALIASES: Array<{ substring: string; canonical: string }> = [
  { substring: "v4-pro", canonical: "deepseek:deepseek-v4-pro" },
  { substring: "reasoner", canonical: "deepseek:deepseek-reasoner" },
  { substring: "coder", canonical: "deepseek:deepseek-coder" },
  { substring: "chat", canonical: "deepseek:deepseek-chat" }
];

function resolveKey(provider: string, model: string): { key: string; aliased: boolean } {
  const exact = `${provider}:${model}`;
  if (PRICING_TABLE[exact]) return { key: exact, aliased: false };

  if (provider === "deepseek") {
    const lc = model.toLowerCase();
    for (const alias of DEEPSEEK_ALIASES) {
      if (lc.includes(alias.substring)) return { key: alias.canonical, aliased: true };
    }
  }

  return { key: exact, aliased: false };
}

export function getPricing(provider: string, model: string): ModelPricing {
  const { key, aliased } = resolveKey(provider, model);
  const pricing = PRICING_TABLE[key];
  if (!pricing) {
    console.warn(`Unknown model pricing for ${provider}:${model} — cost recorded as $0.00`);
    return { inputPerMillion: 0.0, outputPerMillion: 0.0 };
  }
  if (aliased) {
    console.info(`Pricing alias: ${provider}:${model} → ${key}`);
  }
  return pricing;
}

export function calculateCostUSD(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const { inputPerMillion, outputPerMillion } = getPricing(provider, model);
  return (promptTokens * inputPerMillion + completionTokens * outputPerMillion) / 1_000_000;
}

export function calculateCostDetailed(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): PricingResult {
  const { key, aliased } = resolveKey(provider, model);
  const pricing = PRICING_TABLE[key];
  if (!pricing) {
    console.warn(`Unknown model pricing for ${provider}:${model} — cost recorded as $0.00`);
    return { costUSD: 0, pricingStatus: "unknown" };
  }
  const costUSD = (promptTokens * pricing.inputPerMillion + completionTokens * pricing.outputPerMillion) / 1_000_000;
  return { costUSD, pricingStatus: aliased ? "aliased" : "known", resolvedKey: key };
}

export { PRICING_TABLE };
