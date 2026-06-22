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
import { fetchOpenRouterModels } from "../services/openRouterModelService.js";
import { prisma } from "../db/prisma.js";

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
  attemptedProviderId?: string;
  attemptedModel?: string;
  finalProviderId?: string;
  finalModel?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  errorCode?: string;
  errorMessage?: string;
  configuredModel?: string;
  actualSentModel?: string;
  responseModel?: string | null;
  // Completion reason of the winning provider ("length"/"max_tokens" = truncated).
  finishReason?: string | null;
  // Resolved provider type of the winner ("sandbox" when it fell to mock).
  finalProviderType?: string;
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  "openrouter": "OpenRouter",
  "openai": "OpenAI",
  "deepseek": "DeepSeek",
  "anthropic": "Anthropic",
  "gemini": "Gemini",
  "local": "Local / Ollama",
  "openai-compatible": "OpenAI-Compatible"
};

export function normalizeModelIdForProvider(providerType: string, modelId: string): string {
  if (providerType === "sandbox") return LOCAL_SANDBOX_MODEL;
  return modelId.trim();
}

function getProviderType(providerName: string): string {
  if (
    providerName === LOCAL_SANDBOX_PROVIDER_ID ||
    providerName === LEGACY_MOCK_PROVIDER_ID ||
    providerName === "sandbox"
  ) return "sandbox";
  if (providerName === OPENROUTER_FREE_PROVIDER_ID || providerName === "openrouter" || providerName.startsWith("openrouter-")) return "openrouter";
  return providerName;
}

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

  const firstCall = providers[0];
  const firstConfiguredModel = firstCall ? (firstCall.model ?? input.model ?? firstCall.provider.model) : undefined;
  const firstProviderType = firstCall ? getProviderType(firstCall.provider.name) : undefined;
  const firstActualModel = firstConfiguredModel !== undefined ? normalizeModelIdForProvider(firstProviderType ?? "", firstConfiguredModel) : undefined;
  const firstMeta = firstCall ? providerTraceMeta(firstCall.provider.name, firstActualModel) : undefined;

  const attemptedProviderId = firstMeta?.providerId;
  const attemptedModel = firstMeta?.model;

  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let fallbackReason: string | undefined;

  for (const call of providers) {
    const candidate = call.provider;
    const configuredModel = call.model ?? input.model ?? candidate.model;
    const providerType = getProviderType(candidate.name);
    const actualSentModel = normalizeModelIdForProvider(providerType, configuredModel ?? "");
    const meta = providerTraceMeta(candidate.name, actualSentModel);
    attemptedProviders.push(meta.providerId);
    const callStartedAt = Date.now();
    try {
      // Online validation (Part 2)
      if (meta.providerType === "openrouter" && actualSentModel) {
        const { models, success } = await fetchOpenRouterModels();
        if (success && !models.includes(actualSentModel)) {
          await prisma.aIProvider.updateMany({
            where: { id: meta.providerId },
            data: {
              modelValidationStatus: "INVALID_MODEL",
              lastValidationTime: new Date()
            }
          }).catch(() => undefined);

          const validationError = new Error(`Model validation failed: '${actualSentModel}' is not a valid OpenRouter model.`);
          (validationError as any).statusCode = 404;
          (validationError as any).endpointPath = "/chat/completions";
          throw validationError;
        } else if (success) {
          await prisma.aIProvider.updateMany({
            where: { id: meta.providerId },
            data: {
              modelValidationStatus: "VALID",
              lastValidationTime: new Date()
            }
          }).catch(() => undefined);
        } else {
          await prisma.aIProvider.updateMany({
            where: { id: meta.providerId },
            data: {
              modelValidationStatus: "PROVIDER_UNAVAILABLE",
              lastValidationTime: new Date()
            }
          }).catch(() => undefined);
        }
      }

      await markTraceProviderCalling(traceContext.traceId, {
        providerId: meta.providerId,
        providerType: meta.providerType,
        providerName: meta.providerName,
        model: meta.model
      });
      const result = await candidate.generateAgentResponse({
        ...input,
        model: actualSentModel
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
          detail: `Fell back to ${meta.providerName} / ${meta.model}`,
          status: "FALLBACK_USED",
          providerId: meta.providerId,
          providerType: meta.providerType,
          providerName: meta.providerName,
          model: meta.model,
          metadata: {
            fromProviders: failures.map((f) => f.split(" failed:")[0]),
            toProvider: meta.providerName,
            toModel: meta.model,
            fallbackReason: fallbackReason || failures.join(" | "),
            failures: failures.map((f) => f.slice(0, 200))
          }
        }).catch(() => undefined);
      }

      // Timeline: PROVIDER_CALL_SUCCESS step
      await addTraceStep({
        traceId: traceContext.traceId,
        stepType: "PROVIDER_CALL_SUCCESS",
        operation: "provider_call_success",
        title: "AI provider call succeeded",
        detail: `Successfully called ${meta.providerName} using model ${meta.model}`,
        status: "COMPLETED",
        providerId: meta.providerId,
        providerType: meta.providerType,
        providerName: meta.providerName,
        model: meta.model,
        tokensUsed: result.usage?.totalTokens ?? null,
        durationMs: Date.now() - callStartedAt,
        metadata: {
          providerId: meta.providerId,
          providerName: meta.providerName,
          model: meta.model,
          usage: result.usage
        }
      }).catch(() => undefined);

      const fallbackUsed = failures.length > 0;
      return {
        response: result.response,
        providerName: meta.providerName,
        providerId: meta.providerId,
        modelUsed: meta.model,
        fallbackNotice: fallbackUsed ? buildFallbackNotice(failures, attemptedProviderId, firstMeta?.providerName, attemptedModel, meta.providerName, meta.model, errorCode, errorMessage) : undefined,
        attemptedProviders,
        usage: result.usage,
        attemptedProviderId,
        attemptedModel,
        finalProviderId: meta.providerId,
        finalModel: meta.model,
        fallbackUsed,
        fallbackReason,
        errorCode,
        errorMessage,
        configuredModel,
        actualSentModel,
        responseModel: result.responseModel ?? null,
        finishReason: result.finishReason ?? null,
        finalProviderType: meta.providerType
      };
    } catch (error) {
      const errorCodeRaw = (error as any).errorCode as string | undefined;
      const statusCode = (error as any).statusCode ?? (errorCodeRaw === "PROVIDER_TIMEOUT" ? 504 : 500);
      const msg = error instanceof Error ? error.message : String(error);
      if (call === firstCall) {
        errorCode = errorCodeRaw ?? String(statusCode);
        errorMessage = msg;
        fallbackReason = msg;
      }

      // Timeline: PROVIDER_CALL_FAILED step
      await addTraceStep({
        traceId: traceContext.traceId,
        stepType: "PROVIDER_CALL_FAILED",
        operation: "provider_call_failed",
        title: `AI provider call failed`,
        detail: `${meta.providerName} call failed with status ${statusCode}: ${msg.slice(0, 150)}`,
        status: "FAILED",
        providerId: meta.providerId,
        providerType: meta.providerType,
        providerName: meta.providerName,
        model: meta.model,
        errorMessage: msg.slice(0, 240),
        durationMs: Date.now() - callStartedAt,
        metadata: {
          providerId: meta.providerId,
          providerName: meta.providerName,
          model: meta.model,
          endpointPath: (error as any).endpointPath ?? "/chat/completions",
          statusCode,
          error: msg.slice(0, 500)
        }
      }).catch(() => undefined);

      failures.push(`${meta.providerName} failed: ${msg}`);
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
  const sandboxCallStartedAt = Date.now();
  const mockResult = await mockProvider.generateAgentResponse(input);
  await markTraceFallbackUsed(traceContext.traceId, {
    attributionStatus: traceContext.attributionStatus,
    attemptedProviders,
    fallbackFailures: failures,
    fallbackProvider: sandboxMeta.providerId
  });

  // Timeline: PROVIDER_FALLBACK step
  await addTraceStep({
    traceId: traceContext.traceId,
    stepType: "PROVIDER_FALLBACK",
    operation: "provider_fallback",
    title: "Local sandbox baseline fallback used",
    detail: `All providers failed; fallback to ${sandboxMeta.providerName} / ${sandboxMeta.model}`,
    status: "FALLBACK_USED",
    providerId: sandboxMeta.providerId,
    providerType: sandboxMeta.providerType,
    providerName: sandboxMeta.providerName,
    model: sandboxMeta.model,
    metadata: {
      fromProviders: failures.map((f) => f.split(" failed:")[0]),
      toProvider: sandboxMeta.providerName,
      toModel: sandboxMeta.model,
      fallbackReason: fallbackReason || failures.join(" | "),
      failures: failures.map((f) => f.slice(0, 200))
    }
  }).catch(() => undefined);

  // Timeline: PROVIDER_CALL_SUCCESS step for local sandbox fallback
  await addTraceStep({
    traceId: traceContext.traceId,
    stepType: "PROVIDER_CALL_SUCCESS",
    operation: "provider_call_success",
    title: "AI provider call succeeded",
    detail: `Successfully called sandbox baseline`,
    status: "COMPLETED",
    providerId: sandboxMeta.providerId,
    providerType: sandboxMeta.providerType,
    providerName: sandboxMeta.providerName,
    model: sandboxMeta.model,
    tokensUsed: mockResult.usage?.totalTokens ?? null,
    durationMs: Date.now() - sandboxCallStartedAt,
    metadata: {
      providerId: sandboxMeta.providerId,
      providerName: sandboxMeta.providerName,
      model: sandboxMeta.model,
      usage: mockResult.usage
    }
  }).catch(() => undefined);

  return {
    response: mockResult.response,
    providerName: sandboxMeta.providerName,
    providerId: sandboxMeta.providerId,
    modelUsed: sandboxMeta.model,
    fallbackNotice: buildFallbackNotice(failures, attemptedProviderId, firstMeta?.providerName, attemptedModel, sandboxMeta.providerName, sandboxMeta.model, errorCode, errorMessage),
    attemptedProviders,
    usage: mockResult.usage,
    attemptedProviderId,
    attemptedModel,
    finalProviderId: sandboxMeta.providerId,
    finalModel: sandboxMeta.model,
    fallbackUsed: true,
    fallbackReason,
    errorCode,
    errorMessage,
    configuredModel: firstConfiguredModel,
    actualSentModel: firstActualModel,
    responseModel: null
  };
}

function buildFallbackNotice(
  failures: string[],
  attemptedProviderId: string | undefined,
  attemptedProviderName: string | undefined,
  attemptedModel: string | undefined,
  finalProviderName: string,
  finalModel: string,
  errorCode?: string,
  errorMessage?: string
): string {
  if (failures.length === 0) return "";
  const errorDetails = errorCode === "404" ? "404 Not Found" : (errorMessage || "error");
  const attemptedLabel = (attemptedProviderName ?? attemptedProviderId) && attemptedModel
    ? `${attemptedProviderName ?? attemptedProviderId} / ${attemptedModel}`
    : "Primary model";
  return `Primary model failed: ${attemptedLabel} returned ${errorDetails}. Final answer generated by ${finalProviderName} / ${finalModel}.`;
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

  if (providerName === "openrouter" || providerName.startsWith("openrouter-")) {
    return {
      providerId: providerName,
      providerType: "openrouter",
      providerName: PROVIDER_DISPLAY_NAMES[providerName] ?? providerName,
      model: model ?? ""
    };
  }

  return {
    providerId: providerName,
    providerType: providerName,
    providerName: PROVIDER_DISPLAY_NAMES[providerName] ?? providerName,
    model: model ?? ""
  };
}
