import type { AIProvider, GenerateAgentResponseInput, TokenUsage } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";
import { addTraceStep, markTraceFallbackUsed, markTraceProviderCalling, type TraceContext } from "../services/aiUsageTraceService.js";

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
  input: GenerateAgentResponseInput,
  traceContext: TraceContext
): Promise<GenerateWithFallbackResult> {
  if (!traceContext?.traceId) {
    throw new Error("AI provider call requires trace context. Refusing unattributed provider call.");
  }

  const providers = normalizeProviderCalls(provider);
  const attemptedProviders: string[] = [];
  const failures: string[] = [];

  for (const call of providers) {
    const candidate = call.provider;
    const model = call.model ?? input.model ?? candidate.model;
    attemptedProviders.push(candidate.name);
    try {
      await markTraceProviderCalling(traceContext.traceId, {
        providerId: candidate.name,
        providerType: candidate.name,
        providerName: candidate.name,
        model
      });
      const result = await candidate.generateAgentResponse({
        ...input,
        model
      });
      if (failures.length > 0) {
        await markTraceFallbackUsed(traceContext.traceId, {
          attributionStatus: traceContext.attributionStatus,
          attemptedProviders,
          fallbackFailures: failures,
          fallbackProvider: candidate.name
        });
        // Timeline: PROVIDER_FALLBACK step
        await addTraceStep({
          traceId: traceContext.traceId,
          stepType: "PROVIDER_FALLBACK",
          operation: "provider_fallback",
          title: "Provider fallback used",
          detail: `Fell back to ${candidate.name}`,
          status: "FALLBACK_USED",
          providerName: candidate.name,
          model,
          metadata: {
            fromProviders: failures.map((f) => f.split(" failed:")[0]),
            toProvider: candidate.name,
            failures: failures.map((f) => f.slice(0, 200))
          }
        }).catch(() => undefined);
      }
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
  await markTraceProviderCalling(traceContext.traceId, {
    providerId: mockProvider.name,
    providerType: mockProvider.name,
    providerName: mockProvider.name,
    model: mockProvider.model
  });
  const mockResult = await mockProvider.generateAgentResponse(input);
  await markTraceFallbackUsed(traceContext.traceId, {
    attributionStatus: traceContext.attributionStatus,
    attemptedProviders,
    fallbackFailures: failures,
    fallbackProvider: mockProvider.name
  });
  // Timeline: PROVIDER_FALLBACK step for mock fallback
  await addTraceStep({
    traceId: traceContext.traceId,
    stepType: "PROVIDER_FALLBACK",
    operation: "provider_fallback",
    title: "Mock provider fallback used",
    detail: `All providers failed, fell back to ${mockProvider.name}`,
    status: "FALLBACK_USED",
    providerName: mockProvider.name,
    model: mockProvider.model,
    metadata: {
      fromProviders: failures.map((f) => f.split(" failed:")[0]),
      toProvider: mockProvider.name,
      failures: failures.map((f) => f.slice(0, 200))
    }
  }).catch(() => undefined);
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
