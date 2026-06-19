import { env } from "../config/env.js";
import { LOCAL_SANDBOX_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_ID } from "../services/aiProviderRegistry.js";
import type { AIProvider } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { OpenAIProvider } from "./openAIProvider.js";
import { AnthropicProvider } from "./anthropicProvider.js";

export type ProviderRuntimeConfig = {
  id: string;
  type: string;
  baseUrl?: string | null;
  defaultModel: string;
  headers?: Record<string, string>;
};

export function createAIProvider(providerName: string = env.AI_PROVIDER): AIProvider {
  return createAIProviderByName(providerName);
}

export function createAIProviderByName(providerName: string): AIProvider {
  if (providerName === LOCAL_SANDBOX_PROVIDER_ID || providerName === "sandbox" || providerName === "mock") {
    return new MockAIProvider();
  }

  if (providerName === "openai") {
    return new OpenAIProvider();
  }

  if (providerName === "openrouter" || providerName === OPENROUTER_FREE_PROVIDER_ID) {
    return new OpenAICompatibleProvider({
      providerId: providerName,
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL,
      defaultModel: env.OPENROUTER_MODEL,
      headers: openRouterHeaders(),
      timeoutMs: env.OPENROUTER_TIMEOUT_MS
    });
  }

  if (providerName === "deepseek") {
    return new OpenAICompatibleProvider({
      providerId: "deepseek",
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL,
      defaultModel: env.DEEPSEEK_MODEL
    });
  }

  if (providerName === "openai-compatible") {
    return new OpenAICompatibleProvider({
      providerId: "openai-compatible",
      apiKey: env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: env.OPENAI_COMPATIBLE_BASE_URL ?? env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_COMPATIBLE_MODEL
    });
  }

  if (providerName === "gemini") {
    return createGeminiProvider("gemini", env.GEMINI_MODEL);
  }

  if (providerName === "anthropic") {
    return createAnthropicProvider("anthropic", env.ANTHROPIC_MODEL);
  }

  return new MockAIProvider();
}

/** Gemini exposes an OpenAI-compatible endpoint, so we reuse the OpenAI-compatible client. */
function createGeminiProvider(providerId: string, defaultModel: string, baseUrl?: string | null): AIProvider {
  return new OpenAICompatibleProvider({
    providerId,
    apiKey: env.GEMINI_API_KEY,
    baseUrl: baseUrl ?? env.GEMINI_BASE_URL,
    defaultModel
  });
}

function createAnthropicProvider(providerId: string, defaultModel: string, baseUrl?: string | null): AIProvider {
  return new AnthropicProvider({
    providerId,
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrl: baseUrl ?? env.ANTHROPIC_BASE_URL,
    defaultModel,
    anthropicVersion: env.ANTHROPIC_VERSION
  });
}

export function createAIProviderFromConfig(config: ProviderRuntimeConfig): AIProvider {
  if (config.id === LOCAL_SANDBOX_PROVIDER_ID || config.id === "mock" || config.type === "sandbox" || config.type === "mock") return new MockAIProvider();
  if (config.id === "openai" || config.type === "openai") return new OpenAIProvider();
  if (config.id === OPENROUTER_FREE_PROVIDER_ID || config.id === "openrouter" || config.type === "openrouter") {
    return new OpenAICompatibleProvider({
      providerId: config.id,
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: config.baseUrl ?? env.OPENROUTER_BASE_URL,
      defaultModel: config.defaultModel,
      headers: openRouterHeaders(),
      timeoutMs: env.OPENROUTER_TIMEOUT_MS
    });
  }
  if (config.id === "deepseek" || config.type === "deepseek") return createAIProviderByName("deepseek");
  if (config.id === "gemini" || config.type === "gemini") {
    return createGeminiProvider(config.id, config.defaultModel, config.baseUrl);
  }
  if (config.id === "anthropic" || config.type === "anthropic") {
    return createAnthropicProvider(config.id, config.defaultModel, config.baseUrl);
  }
  if (config.type === "openai-compatible" && config.baseUrl) {
    return new OpenAICompatibleProvider({
      providerId: config.id,
      apiKey: env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      headers: config.headers
    });
  }

  throw new Error(`Provider '${config.id}' is configured but runtime support for type '${config.type}' is not implemented yet`);
}

function openRouterHeaders(): Record<string, string> {
  return {
    ...(env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER } : {}),
    ...(env.OPENROUTER_X_TITLE ? { "X-Title": env.OPENROUTER_X_TITLE } : {})
  };
}
