import type { AIProviderDto } from "@/types/api";

type ProviderLike = Partial<AIProviderDto> | string | null | undefined;

const LOCAL_SANDBOX_IDS = new Set(["mock", "sandbox", "local-sandbox-baseline", "deterministic-mock-v1"]);
const OPENROUTER_FREE_IDS = new Set(["openrouter-free", "OpenRouter Free Sandbox"]);

export function getProviderDisplayName(provider: ProviderLike): string {
  const value = providerValue(provider);
  if (!value) return "Unknown provider";

  const technicalValues = [value.id, value.name, value.type, value.defaultModel].filter(Boolean);
  if (technicalValues.some((item) => item && LOCAL_SANDBOX_IDS.has(item))) return "Local Sandbox Baseline";
  if (technicalValues.some((item) => item && OPENROUTER_FREE_IDS.has(item))) return "OpenRouter Free Sandbox";
  if (value.name) return titleProviderName(value.name);
  return titleProviderName(value.id ?? value.type ?? "Unknown provider");
}

export function getModelDisplayName(model?: string | null): string {
  if (!model) return "No model";
  if (model === "deterministic-mock-v1" || model === "local-sandbox-baseline") return "Local Sandbox Baseline";
  return model;
}

export function getProviderModeBadge(provider: ProviderLike): string {
  const value = providerValue(provider);
  if (!value) return "Unknown";
  if (isLocalSandboxProvider(provider)) return "Local Sandbox";
  if (value.environmentMode === "SANDBOX" && value.isFreeTier) return "Free Sandbox";
  if (value.environmentMode === "SANDBOX") return "Sandbox";
  if (value.environmentMode === "DISABLED") return "Disabled";
  if (value.isFreeTier || value.costTier === "FREE") return "Free";
  return "Production";
}

export function isLocalSandboxProvider(provider: ProviderLike): boolean {
  const value = providerValue(provider);
  if (!value) return false;
  return [value.id, value.name, value.type, value.defaultModel].filter(Boolean).some((item) => item != null && LOCAL_SANDBOX_IDS.has(item));
}

export function getProviderModelDisplay(provider: ProviderLike, model?: string | null): string {
  const providerLabel = getProviderDisplayName(provider);
  const modelLabel = getModelDisplayName(model);
  return modelLabel === "No model" || modelLabel === providerLabel ? providerLabel : `${providerLabel} / ${modelLabel}`;
}

export function getProviderTerminologyText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/deterministic-mock-v1/g, "local-sandbox-baseline")
    .replace(/Mock Provider/g, "Local Sandbox Baseline")
    .replace(/mock provider/g, "local sandbox baseline")
    .replace(/Mock provider/g, "Local sandbox baseline")
    .replace(/mock response/g, "sandbox baseline response")
    .replace(/fallback to mock/g, "fallback to sandbox baseline")
    .replace(/fell back to mock/g, "fell back to sandbox baseline")
    .replace(/\bmock\b/g, "local sandbox baseline");
}

function providerValue(provider: ProviderLike): Partial<AIProviderDto> | null {
  if (!provider) return null;
  if (typeof provider === "string") return { id: provider, name: provider, type: provider };
  return provider;
}

function titleProviderName(value: string): string {
  if (!value) return "Unknown provider";
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
