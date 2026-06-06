import type { AIProvider, GenerateAgentResponseInput, TokenUsage } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";

export type GenerateWithFallbackResult = {
  response: string;
  providerName: string;
  modelUsed: string;
  fallbackNotice?: string;
  usage: TokenUsage;
};

export async function generateWithFallback(
  provider: AIProvider,
  input: GenerateAgentResponseInput
): Promise<GenerateWithFallbackResult> {
  try {
    const result = await provider.generateAgentResponse(input);
    return {
      response: result.response,
      providerName: provider.name,
      modelUsed: input.model ?? provider.model,
      usage: result.usage
    };
  } catch (error) {
    const mockProvider = new MockAIProvider();
    const mockResult = await mockProvider.generateAgentResponse(input);
    return {
      response: mockResult.response,
      providerName: mockProvider.name,
      modelUsed: mockProvider.model,
      fallbackNotice: `AI provider '${provider.name}' failed; mock counsel was used. ${error instanceof Error ? error.message : ""}`.trim(),
      usage: mockResult.usage
    };
  }
}
