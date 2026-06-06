import type { AIProvider, GenerateAgentResponseInput, TokenUsage } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";

export type AIProviderCall = {
  provider: AIProvider;
  model?: string;
};

export type GenerateWithFallbackResult = {
  response: string;
  providerName: string;
  providerId?: string;
  modelUsed: string;
  fallbackNotice?: string;
  attemptedProviders: string[];
  usage: TokenUsage;
};

export async function generateWithFallback(
  provider: AIProvider | AIProvider[] | AIProviderCall[],
  input: GenerateAgentResponseInput
): Promise<GenerateWithFallbackResult> {
  const providers = normalizeProviderCalls(provider);
  const attemptedProviders: string[] = [];
  const failures: string[] = [];

  for (const call of providers) {
    const candidate = call.provider;
    const model = call.model ?? input.model ?? candidate.model;
    attemptedProviders.push(candidate.name);
    try {
      const result = await candidate.generateAgentResponse({
        ...input,
        model
      });
      return {
        response: result.response,
        providerName: candidate.name,
        providerId: candidate.name,
        modelUsed: model,
        fallbackNotice: failures.length > 0 ? buildFallbackNotice(failures, candidate.name) : undefined,
        attemptedProviders,
        usage: result.usage
      };
    } catch (error) {
      failures.push(`${candidate.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const mockProvider = new MockAIProvider();
  if (!attemptedProviders.includes(mockProvider.name)) attemptedProviders.push(mockProvider.name);
  const mockResult = await mockProvider.generateAgentResponse(input);
  return {
    response: mockResult.response,
    providerName: mockProvider.name,
    providerId: mockProvider.name,
    modelUsed: mockProvider.model,
    fallbackNotice: buildFallbackNotice(failures, mockProvider.name),
    attemptedProviders,
    usage: mockResult.usage
  };
}

function buildFallbackNotice(failures: string[], winner: string): string {
  if (failures.length === 0) return "";
  return `${failures.join(" | ")}. Fallback used: ${winner}.`;
}

function normalizeProviderCalls(provider: AIProvider | AIProvider[] | AIProviderCall[]): AIProviderCall[] {
  if (!Array.isArray(provider)) return [{ provider }];
  return provider.map((item) => ("generateAgentResponse" in item ? { provider: item } : item));
}
