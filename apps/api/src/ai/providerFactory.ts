import { env } from "../config/env.js";
import type { AIProvider } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { OpenAIProvider } from "./openAIProvider.js";

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
  if (providerName === "openai") {
    return new OpenAIProvider();
  }

  if (providerName === "openrouter") {
    return new OpenAICompatibleProvider({
      providerId: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL,
      defaultModel: env.OPENROUTER_MODEL,
      headers: openRouterHeaders()
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

  return new MockAIProvider();
}

export function createAIProviderFromConfig(config: ProviderRuntimeConfig): AIProvider {
  if (config.id === "mock" || config.type === "mock") return new MockAIProvider();
  if (config.id === "openai" || config.type === "openai") return new OpenAIProvider();
  if (config.id === "openrouter" || config.type === "openrouter") return createAIProviderByName("openrouter");
  if (config.id === "deepseek" || config.type === "deepseek") return createAIProviderByName("deepseek");
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
