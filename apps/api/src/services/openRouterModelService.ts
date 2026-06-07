import { prisma } from "../db/prisma.js";

let openRouterModelCache: string[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function _fetchOpenRouterModelsImpl(): Promise<{ models: string[]; success: boolean }> {
  const now = Date.now();
  if (openRouterModelCache && (now - lastCacheTime < CACHE_TTL_MS)) {
    return { models: openRouterModelCache, success: true };
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch models from OpenRouter: status ${res.status}`);
    }
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = data.data?.map((m) => m.id) ?? [];
    if (models.length > 0) {
      openRouterModelCache = models;
      lastCacheTime = now;
    }
    return { models: openRouterModelCache ?? [], success: true };
  } catch (err) {
    console.error("Error fetching OpenRouter models:", err);
    return { models: openRouterModelCache ?? [], success: false };
  }
}

// Mutable service handle — allows test injection without ESM namespace restrictions
export const _service = {
  fetchOpenRouterModels: _fetchOpenRouterModelsImpl
};

export async function fetchOpenRouterModels(): Promise<{ models: string[]; success: boolean }> {
  return _service.fetchOpenRouterModels();
}

export async function validateOpenRouterModels(providerIds: string[]): Promise<void> {
  const { models, success } = await fetchOpenRouterModels();
  
  for (const providerId of providerIds) {
    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } });
    if (!provider || provider.type !== "openrouter") continue;

    let status = "NOT_CHECKED";
    if (success) {
      status = models.includes(provider.defaultModel) ? "VALID" : "INVALID_MODEL";
    } else {
      status = "PROVIDER_UNAVAILABLE";
    }

    const currentConfig = typeof provider.config === "object" && provider.config !== null ? (provider.config as Record<string, unknown>) : {};
    const updatedConfig = {
      ...currentConfig,
      openRouterModels: success ? models : (currentConfig.openRouterModels ?? [])
    };

    await prisma.aIProvider.update({
      where: { id: providerId },
      data: {
        modelValidationStatus: status,
        lastValidationTime: new Date(),
        config: updatedConfig
      }
    });
  }
}
