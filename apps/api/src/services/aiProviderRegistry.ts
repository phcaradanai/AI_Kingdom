import type { AIProvider as PrismaAIProvider, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export type AICostTier = "FREE" | "LOW" | "MEDIUM" | "HIGH" | "PREMIUM";
export type AICostMode = "low" | "balanced" | "quality";
export type AICostPreference = "LOW" | "BALANCED" | "QUALITY";

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
  hasCredentials: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const now = new Date(0);

export function getEnvProviderConfigs(): AIProviderConfig[] {
  const selected = env.AI_PROVIDER;
  return [
    {
      id: "mock",
      name: "Mock",
      type: "mock",
      defaultModel: "deterministic-mock-v1",
      isActive: true,
      priority: 1000,
      supportsChat: true,
      supportsJsonMode: true,
      costTier: "FREE",
      capabilities: { supportsChat: true, supportsJsonMode: true },
      hasCredentials: true,
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
      hasCredentials: Boolean(env.LOCAL_AI_BASE_URL),
      createdAt: now,
      updatedAt: now
    }
  ];
}

export async function ensureDefaultAIProviders() {
  for (const provider of getEnvProviderConfigs()) {
    await prisma.aIProvider.upsert({
      where: { id: provider.id },
      update: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        capabilities: provider.capabilities as Prisma.InputJsonObject,
        config: publicProviderConfig(provider) as Prisma.InputJsonObject
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
        config: publicProviderConfig(provider) as Prisma.InputJsonObject
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

  const filtered = options.activeOnly ? merged.filter((provider) => provider.isActive && provider.supportsChat) : merged;
  return filtered.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function getAIProvider(providerId: string): Promise<AIProviderConfig | null> {
  const providers = await listAIProviders();
  return providers.find((provider) => provider.id === providerId) ?? null;
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
    credentialSource: provider.hasCredentials ? "env" : "none"
  };
}

function mergeProvider(dbProvider: PrismaAIProvider, envProvider?: AIProviderConfig): AIProviderConfig {
  const capabilities = normalizeCapabilities(dbProvider.capabilities);
  const config = typeof dbProvider.config === "object" && dbProvider.config !== null ? (dbProvider.config as Record<string, unknown>) : null;
  const credentialEnvKey = config?.credentialEnvKey as string | undefined;
  const hasCredentials = envProvider?.hasCredentials ?? (dbProvider.type === "mock" || (credentialEnvKey ? Boolean(process.env[credentialEnvKey]) : false));
  
  return {
    id: dbProvider.id,
    name: dbProvider.name,
    type: dbProvider.type,
    baseUrl: dbProvider.baseUrl ?? envProvider?.baseUrl ?? null,
    defaultModel: dbProvider.defaultModel || envProvider?.defaultModel || "",
    isActive: dbProvider.type === "mock" ? true : (dbProvider.isActive && (hasCredentials || ["anthropic", "gemini", "local"].includes(dbProvider.type) === false)),
    priority: dbProvider.priority,
    supportsChat: capabilities.supportsChat,
    supportsTools: capabilities.supportsTools,
    supportsVision: capabilities.supportsVision,
    supportsJsonMode: capabilities.supportsJsonMode,
    costTier: normalizeCostTier(dbProvider.costTier),
    capabilities,
    config,
    hasCredentials,
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
