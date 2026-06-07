import type { AIProvider, GenerateAgentResponseInput, TokenUsage } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";
import { addTraceStep, markTraceFallbackUsed, markTraceProviderCalling, type TraceContext } from "../services/aiUsageTraceService.js";
import {
  LEGACY_MOCK_MODEL,
  LEGACY_MOCK_PROVIDER_ID,
  LOCAL_SANDBOX_MODEL,
  LOCAL_SANDBOX_PROVIDER_ID,
  LOCAL_SANDBOX_PROVIDER_NAME,
  OPENROUTER_FREE_PROVIDER_ID,
  OPENROUTER_FREE_PROVIDER_NAME
} from "../services/aiProviderRegistry.js";

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
    const meta = providerTraceMeta(candidate.name, model);
    attemptedProviders.push(meta.providerId);
    try {
      await markTraceProviderCalling(traceContext.traceId, {
        providerId: meta.providerId,
        providerType: meta.providerType,
        providerName: meta.providerName,
        model: meta.model
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
          fallbackProvider: meta.providerId
        });
        // Timeline: PROVIDER_FALLBACK step
        await addTraceStep({
          traceId: traceContext.traceId,
          stepType: "PROVIDER_FALLBACK",
          operation: "provider_fallback",
          title: "Provider fallback used",
          detail: `Fell back to ${meta.providerName}`,
          status: "FALLBACK_USED",
          providerId: meta.providerId,
          providerType: meta.providerType,
          providerName: meta.providerName,
          model: meta.model,
          metadata: {
            fromProviders: failures.map((f) => f.split(" failed:")[0]),
            toProvider: meta.providerName,
            fallbackReason: failures.join(" | "),
            failures: failures.map((f) => f.slice(0, 200))
          }
        }).catch(() => undefined);
      }
      return {
        response: result.response,
        providerName: meta.providerName,
        providerId: meta.providerId,
        modelUsed: meta.model,
        fallbackNotice: failures.length > 0 ? buildFallbackNotice(failures, meta.providerName) : undefined,
        attemptedProviders,
        usage: result.usage
      };
    } catch (error) {
      failures.push(`${meta.providerName} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const mockProvider = new MockAIProvider();
  const sandboxMeta = providerTraceMeta(mockProvider.name, mockProvider.model);
  if (!attemptedProviders.includes(sandboxMeta.providerId)) attemptedProviders.push(sandboxMeta.providerId);
  await markTraceProviderCalling(traceContext.traceId, {
    providerId: sandboxMeta.providerId,
    providerType: sandboxMeta.providerType,
    providerName: sandboxMeta.providerName,
    model: sandboxMeta.model
  });
  const mockResult = await mockProvider.generateAgentResponse(input);
  await markTraceFallbackUsed(traceContext.traceId, {
    attributionStatus: traceContext.attributionStatus,
    attemptedProviders,
    fallbackFailures: failures,
    fallbackProvider: sandboxMeta.providerId
  });
  // Timeline: PROVIDER_FALLBACK step for local sandbox fallback
  await addTraceStep({
    traceId: traceContext.traceId,
    stepType: "PROVIDER_FALLBACK",
    operation: "provider_fallback",
    title: "Local sandbox baseline fallback used",
    detail: `All providers failed; fallback to ${sandboxMeta.providerName}`,
    status: "FALLBACK_USED",
    providerId: sandboxMeta.providerId,
    providerType: sandboxMeta.providerType,
    providerName: sandboxMeta.providerName,
    model: sandboxMeta.model,
    metadata: {
      fromProviders: failures.map((f) => f.split(" failed:")[0]),
      toProvider: sandboxMeta.providerName,
      fallbackReason: failures.join(" | "),
      failures: failures.map((f) => f.slice(0, 200))
    }
  }).catch(() => undefined);
  return {
    response: mockResult.response,
    providerName: sandboxMeta.providerName,
    providerId: sandboxMeta.providerId,
    modelUsed: sandboxMeta.model,
    fallbackNotice: buildFallbackNotice(failures, sandboxMeta.providerName),
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

function providerTraceMeta(providerName: string, model?: string) {
  if (
    providerName === LEGACY_MOCK_PROVIDER_ID ||
    providerName === LOCAL_SANDBOX_PROVIDER_ID ||
    providerName === "sandbox" ||
    model === LEGACY_MOCK_MODEL ||
    model === LOCAL_SANDBOX_MODEL
  ) {
    return {
      providerId: LOCAL_SANDBOX_PROVIDER_ID,
      providerType: "sandbox",
      providerName: LOCAL_SANDBOX_PROVIDER_NAME,
      model: LOCAL_SANDBOX_MODEL
    };
  }

  if (providerName === OPENROUTER_FREE_PROVIDER_ID) {
    return {
      providerId: OPENROUTER_FREE_PROVIDER_ID,
      providerType: "openrouter",
      providerName: OPENROUTER_FREE_PROVIDER_NAME,
      model: model ?? ""
    };
  }

  return {
    providerId: providerName,
    providerType: providerName,
    providerName,
    model: model ?? ""
  };
}
