import { env } from "../config/env.js";
import type { AIProvider } from "./aiProvider.js";
import { MockAIProvider } from "./mockAIProvider.js";
import { OpenAIProvider } from "./openAIProvider.js";

export function createAIProvider(providerName: "mock" | "openai" = env.AI_PROVIDER): AIProvider {
  return createAIProviderByName(providerName);
}

export function createAIProviderByName(providerName: "mock" | "openai"): AIProvider {
  if (providerName === "openai") {
    return new OpenAIProvider();
  }

  return new MockAIProvider();
}
