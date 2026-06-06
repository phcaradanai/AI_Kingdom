export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
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
  "deepseek:deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  "deepseek:deepseek-coder": { inputPerMillion: 0.27, outputPerMillion: 1.1 }
};

export function getPricing(provider: string, model: string): ModelPricing {
  const key = `${provider}:${model}`;
  const pricing = PRICING_TABLE[key];
  if (!pricing) {
    console.warn(`Unknown model pricing for ${key} — cost recorded as $0.00`);
    return { inputPerMillion: 0.0, outputPerMillion: 0.0 };
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

export { PRICING_TABLE };
