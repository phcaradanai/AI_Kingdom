import type { AIProvider as PrismaAIProvider, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export type AICostTier = "FREE" | "LOW" | "MEDIUM" | "HIGH" | "PREMIUM";
export type AICostMode = "low" | "balanced" | "quality";
export type AICostPreference = "LOW" | "BALANCED" | "QUALITY";
export type AIProviderEnvironmentMode = "SANDBOX" | "PRODUCTION" | "DISABLED";

export type AIProviderCapabilities = {
  supportsChat: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
};

export type AIProviderConfig = {
  id: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  defaultModel: string;
  isActive: boolean;
  priority: number;
  supportsChat: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
  costTier: AICostTier;
  capabilities: AIProviderCapabilities;
  config?: Record<string, unknown> | null;
  environmentMode: AIProviderEnvironmentMode;
  maxTokensPerRequest?: number | null;
  maxRequestsPerDay?: number | null;
  maxTokensPerDay?: number | null;
  maxEstimatedCostPerDay?: number | null;
  allowSensitiveContext: boolean;
  isFreeTier: boolean;
  notes?: string | null;
  hasCredentials: boolean;
  modelValidationStatus?: string | null;
  lastValidationTime?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const LOCAL_SANDBOX_PROVIDER_ID = "local-sandbox-baseline";
export const LOCAL_SANDBOX_PROVIDER_NAME = "Local Sandbox Baseline";
export const LOCAL_SANDBOX_MODEL = "local-sandbox-baseline";
export const LEGACY_MOCK_PROVIDER_ID = "mock";
export const LEGACY_MOCK_MODEL = "deterministic-mock-v1";
export const OPENROUTER_FREE_PROVIDER_ID = "openrouter-free";
export const OPENROUTER_FREE_PROVIDER_NAME = "OpenRouter Free Sandbox";

const now = new Date(0);

export function getEnvProviderConfigs(): AIProviderConfig[] {
  const selected = env.AI_PROVIDER;
  return [
    {
      id: LOCAL_SANDBOX_PROVIDER_ID,
      name: LOCAL_SANDBOX_PROVIDER_NAME,
      type: "sandbox",
      defaultModel: LOCAL_SANDBOX_MODEL,
      isActive: true,
      priority: 1000,
      supportsChat: true,
      supportsJsonMode: true,
      costTier: "FREE",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "SANDBOX",
      allowSensitiveContext: false,
      isFreeTier: true,
      notes: "Deterministic local baseline used when sandbox or production providers are unavailable.",
      hasCredentials: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: OPENROUTER_FREE_PROVIDER_ID,
      name: OPENROUTER_FREE_PROVIDER_NAME,
      type: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openrouter/owl-alpha",
      isActive: true,
      priority: 5,
      supportsChat: true,
      supportsTools: true,
      supportsVision: true,
      supportsJsonMode: true,
      costTier: "FREE",
      capabilities: { supportsChat: true, supportsTools: true, supportsVision: true, supportsJsonMode: true },
      config: { credentialEnvKey: "OPENROUTER_API_KEY" },
      environmentMode: "SANDBOX",
      maxTokensPerRequest: 2500,
      maxRequestsPerDay: 100,
      maxTokensPerDay: 120000,
      maxEstimatedCostPerDay: 0,
      allowSensitiveContext: false,
      isFreeTier: true,
      notes: "Free OpenRouter sandbox preset. API key is referenced by environment variable only.",
      hasCredentials: Boolean(env.OPENROUTER_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "openai-compatible",
      name: "OpenAI-Compatible",
      type: "openai-compatible",
      baseUrl: env.OPENAI_COMPATIBLE_BASE_URL ?? null,
      defaultModel: env.OPENAI_COMPATIBLE_MODEL,
      isActive: selected === "openai-compatible" || Boolean(env.OPENAI_COMPATIBLE_API_KEY && env.OPENAI_COMPATIBLE_BASE_URL),
      priority: 40,
      supportsChat: true,
      supportsJsonMode: true,
      costTier: "MEDIUM",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.OPENAI_COMPATIBLE_API_KEY && env.OPENAI_COMPATIBLE_BASE_URL),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "openai",
      name: "OpenAI",
      type: "openai",
      baseUrl: env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_MODEL,
      isActive: selected === "openai" || Boolean(env.OPENAI_API_KEY),
      priority: 30,
      supportsChat: true,
      supportsTools: true,
      supportsVision: true,
      supportsJsonMode: true,
      costTier: "HIGH",
      capabilities: { supportsChat: true, supportsTools: true, supportsVision: true, supportsJsonMode: true },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.OPENAI_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      type: "openrouter",
      baseUrl: env.OPENROUTER_BASE_URL,
      defaultModel: env.OPENROUTER_MODEL,
      isActive: selected === "openrouter" || Boolean(env.OPENROUTER_API_KEY),
      priority: 20,
      supportsChat: true,
      supportsTools: true,
      supportsVision: true,
      supportsJsonMode: true,
      costTier: "MEDIUM",
      capabilities: { supportsChat: true, supportsTools: true, supportsVision: true, supportsJsonMode: true },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.OPENROUTER_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      type: "deepseek",
      baseUrl: env.DEEPSEEK_BASE_URL,
      defaultModel: env.DEEPSEEK_MODEL,
      isActive: selected === "deepseek" || Boolean(env.DEEPSEEK_API_KEY),
      priority: 10,
      supportsChat: true,
      supportsJsonMode: true,
      costTier: "LOW",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.DEEPSEEK_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "anthropic",
      name: "Anthropic",
      type: "anthropic",
      defaultModel: env.ANTHROPIC_MODEL,
      isActive: false,
      priority: 25,
      supportsChat: true,
      supportsTools: true,
      supportsVision: true,
      costTier: "HIGH",
      capabilities: { supportsChat: true, supportsTools: true, supportsVision: true },
      config: { runtimeStatus: "planned" },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.ANTHROPIC_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "gemini",
      name: "Gemini",
      type: "gemini",
      defaultModel: env.GEMINI_MODEL,
      isActive: false,
      priority: 35,
      supportsChat: true,
      supportsVision: true,
      costTier: "LOW",
      capabilities: { supportsChat: true, supportsVision: true },
      config: { runtimeStatus: "planned" },
      environmentMode: "PRODUCTION",
      allowSensitiveContext: true,
      isFreeTier: false,
      hasCredentials: Boolean(env.GEMINI_API_KEY),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "local",
      name: "Local / Ollama",
      type: "local",
      baseUrl: env.LOCAL_AI_BASE_URL ?? null,
      defaultModel: env.LOCAL_AI_MODEL,
      isActive: false,
      priority: 5,
      supportsChat: true,
      costTier: "FREE",
      capabilities: { supportsChat: true },
      config: { runtimeStatus: "planned" },
      environmentMode: "SANDBOX",
      allowSensitiveContext: false,
      isFreeTier: true,
      hasCredentials: Boolean(env.LOCAL_AI_BASE_URL),
      createdAt: now,
      updatedAt: now
    }
  ];
}

export async function ensureDefaultAIProviders() {
  await prisma.aIProvider.updateMany({
    where: { id: LEGACY_MOCK_PROVIDER_ID },
    data: {
      name: LOCAL_SANDBOX_PROVIDER_NAME,
      defaultModel: LOCAL_SANDBOX_MODEL,
      costTier: "FREE",
      environmentMode: "SANDBOX",
      allowSensitiveContext: false,
      isFreeTier: true,
      notes: "Legacy mock provider ID retained for backward compatibility. Use local-sandbox-baseline for new routing."
    }
  });

  for (const provider of getEnvProviderConfigs()) {
    await prisma.aIProvider.upsert({
      where: { id: provider.id },
      update: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        defaultModel: provider.defaultModel,
        isActive: provider.isActive,
        priority: provider.priority,
        costTier: provider.costTier,
        capabilities: provider.capabilities as Prisma.InputJsonObject,
        config: publicProviderConfig(provider) as Prisma.InputJsonObject,
        environmentMode: provider.environmentMode,
        maxTokensPerRequest: provider.maxTokensPerRequest,
        maxRequestsPerDay: provider.maxRequestsPerDay,
        maxTokensPerDay: provider.maxTokensPerDay,
        maxEstimatedCostPerDay: provider.maxEstimatedCostPerDay,
        allowSensitiveContext: provider.allowSensitiveContext,
        isFreeTier: provider.isFreeTier,
        notes: provider.notes
      },
      create: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        defaultModel: provider.defaultModel,
        isActive: provider.isActive,
        priority: provider.priority,
        costTier: provider.costTier,
        capabilities: provider.capabilities as Prisma.InputJsonObject,
        config: publicProviderConfig(provider) as Prisma.InputJsonObject,
        environmentMode: provider.environmentMode,
        maxTokensPerRequest: provider.maxTokensPerRequest,
        maxRequestsPerDay: provider.maxRequestsPerDay,
        maxTokensPerDay: provider.maxTokensPerDay,
        maxEstimatedCostPerDay: provider.maxEstimatedCostPerDay,
        allowSensitiveContext: provider.allowSensitiveContext,
        isFreeTier: provider.isFreeTier,
        notes: provider.notes
      }
    });
  }
}

export async function listAIProviders(options: { activeOnly?: boolean; syncDefaults?: boolean } = {}): Promise<AIProviderConfig[]> {
  if (options.syncDefaults !== false) {
    await ensureDefaultAIProviders();
  }

  const envProviders = getEnvProviderConfigs();
  const envMap = new Map(envProviders.map((provider) => [provider.id, provider]));
  const dbProviders = await prisma.aIProvider.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] });
  const merged = dbProviders.map((provider) => mergeProvider(provider, envMap.get(provider.id)));

  for (const provider of envProviders) {
    if (!merged.some((item) => item.id === provider.id)) merged.push(provider);
  }

  const hasCanonicalSandbox = merged.some((provider) => provider.id === LOCAL_SANDBOX_PROVIDER_ID);
  const withoutLegacyDuplicate = hasCanonicalSandbox
    ? merged.filter((provider) => provider.id !== LEGACY_MOCK_PROVIDER_ID)
    : merged;
  const filtered = options.activeOnly
    ? withoutLegacyDuplicate.filter((provider) => provider.isActive && provider.supportsChat)
    : withoutLegacyDuplicate;
  return filtered.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function getAIProvider(providerId: string): Promise<AIProviderConfig | null> {
  const providers = await listAIProviders();
  const canonicalProviderId = providerId === LEGACY_MOCK_PROVIDER_ID || providerId === LEGACY_MOCK_MODEL ? LOCAL_SANDBOX_PROVIDER_ID : providerId;
  return providers.find((provider) => provider.id === canonicalProviderId) ?? providers.find((provider) => provider.id === providerId) ?? null;
}

export async function createAIProvider(payload: {
  id: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  defaultModel: string;
  isActive: boolean;
  priority: number;
  costTier: AICostTier;
  capabilities: AIProviderCapabilities;
  credentialEnvKey?: string;
}) {
  const { id, name, type, baseUrl, defaultModel, isActive, priority, costTier, capabilities, credentialEnvKey } = payload;
  
  const config: Record<string, unknown> = {};
  if (credentialEnvKey) {
    config.credentialEnvKey = credentialEnvKey;
  }

  const provider = await prisma.aIProvider.create({
    data: {
      id,
      name,
      type,
      baseUrl,
      defaultModel,
      isActive,
      priority,
      costTier,
      capabilities: capabilities as Prisma.InputJsonObject,
      config: config as Prisma.InputJsonObject
    }
  });

  return provider;
}

export async function deleteAIProvider(id: string) {
  await prisma.aIProvider.delete({
    where: { id }
  });
}

export function publicProviderConfig(provider: AIProviderConfig): Record<string, unknown> {
  return {
    hasCredentials: provider.hasCredentials,
    runtimeStatus: provider.config?.runtimeStatus,
    credentialEnvKey: provider.config?.credentialEnvKey,
    credentialSource: provider.hasCredentials ? "env" : "none",
    providerMode: provider.environmentMode,
    costTier: provider.costTier,
    isFreeTier: provider.isFreeTier,
    openRouterModels: provider.config?.openRouterModels
  };
}

function mergeProvider(dbProvider: PrismaAIProvider, envProvider?: AIProviderConfig): AIProviderConfig {
  const capabilities = normalizeCapabilities(dbProvider.capabilities);
  const config = typeof dbProvider.config === "object" && dbProvider.config !== null ? (dbProvider.config as Record<string, unknown>) : null;
  const credentialEnvKey = config?.credentialEnvKey as string | undefined;
  const isLocalSandbox = dbProvider.type === "mock" || dbProvider.type === "sandbox" || dbProvider.id === LOCAL_SANDBOX_PROVIDER_ID;
  const hasCredentials = envProvider?.hasCredentials ?? (isLocalSandbox || (credentialEnvKey ? Boolean(process.env[credentialEnvKey]) : false));
  
  return {
    id: dbProvider.id,
    name: dbProvider.name,
    type: dbProvider.type,
    baseUrl: dbProvider.baseUrl ?? envProvider?.baseUrl ?? null,
    defaultModel: dbProvider.defaultModel || envProvider?.defaultModel || "",
    isActive: isLocalSandbox ? true : (dbProvider.isActive && (hasCredentials || ["anthropic", "gemini", "local"].includes(dbProvider.type) === false)),
    priority: dbProvider.priority,
    supportsChat: capabilities.supportsChat,
    supportsTools: capabilities.supportsTools,
    supportsVision: capabilities.supportsVision,
    supportsJsonMode: capabilities.supportsJsonMode,
    costTier: normalizeCostTier(dbProvider.costTier),
    capabilities,
    config,
    environmentMode: normalizeEnvironmentMode(dbProvider.environmentMode),
    maxTokensPerRequest: dbProvider.maxTokensPerRequest,
    maxRequestsPerDay: dbProvider.maxRequestsPerDay,
    maxTokensPerDay: dbProvider.maxTokensPerDay,
    maxEstimatedCostPerDay: dbProvider.maxEstimatedCostPerDay,
    allowSensitiveContext: dbProvider.allowSensitiveContext,
    isFreeTier: dbProvider.isFreeTier,
    notes: dbProvider.notes,
    hasCredentials,
    modelValidationStatus: dbProvider.modelValidationStatus,
    lastValidationTime: dbProvider.lastValidationTime,
    createdAt: dbProvider.createdAt,
    updatedAt: dbProvider.updatedAt
  };
}

function normalizeCapabilities(value: Prisma.JsonValue): AIProviderCapabilities {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { supportsChat: true };
  const raw = value as Record<string, unknown>;
  return {
    supportsChat: raw.supportsChat !== false,
    supportsTools: Boolean(raw.supportsTools),
    supportsVision: Boolean(raw.supportsVision),
    supportsJsonMode: Boolean(raw.supportsJsonMode)
  };
}

function normalizeCostTier(value: string): AICostTier {
  return ["FREE", "LOW", "MEDIUM", "HIGH", "PREMIUM"].includes(value) ? (value as AICostTier) : "MEDIUM";
}

function normalizeEnvironmentMode(value: string): AIProviderEnvironmentMode {
  return ["SANDBOX", "PRODUCTION", "DISABLED"].includes(value) ? (value as AIProviderEnvironmentMode) : "PRODUCTION";
}
