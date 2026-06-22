import type { AgentDto, AgentPayload, DisplayProfilePayload, ModelParameters, ParameterMode } from "@/types/api";

export type AgentSection = "identity" | "prompt" | "skills" | "routing" | "fallbacks" | "preview";
export type AgentEditorMode = "create" | "edit" | null;
export type FallbackValidationStatus = "VALID" | "INVALID" | "CHECKING" | "NOT_CHECKED";
export type FallbackValidationState = {
  status: FallbackValidationStatus;
  reason?: string;
  checkedAt?: string;
  modelId?: string;
};

export const FALLBACK_VALIDATION_TTL_MS = 5 * 60 * 1000;
export const FALLBACK_DEBOUNCE_MS = 800;
export const selectClass = "min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

export const routingPolicies = [
  "GLOBAL_ROUTING",
  "FIXED_PRIMARY",
  "FIXED_PRIMARY_WITH_FALLBACK",
  "SANDBOX_FREE_ONLY",
  "LOWEST_COST",
  "QUALITY_FIRST",
] as const;

export const defaultModelParameters: ModelParameters = {
  stream: false,
  temperature: null,
  max_tokens: null,
  top_p: null,
  seed: null,
  response_format: "none",
  stop: null,
  frequency_penalty: null,
  presence_penalty: null,
  repetition_penalty: null,
  top_k: null,
  min_p: null,
  openrouter_route: "none",
  openrouter_provider_preferences: null,
  plugins: null,
  reasoning: { enabled: true, effort: "medium", max_tokens: null, exclude: true },
  tools: { enabled: false, tool_choice: "auto" },
};

export const blankAgent: AgentPayload = {
  name: "",
  title: "",
  role: "",
  specialty: "",
  description: "",
  systemPrompt: "",
  skills: [],
  responseStyle: "concise, structured, practical",
  isActive: true,
  priority: 100,
  preferredProviderId: null,
  defaultModel: "",
  fallbackProviderIds: [],
  fallbackModels: [],
  routingPolicy: "GLOBAL_ROUTING",
  costPreference: null,
  temperature: null,
  maxTokens: null,
  personalDetail: "",
  personality: "",
  relationshipWithKing: "",
  relationshipWithCouncil: "",
  roleBoundaries: "",
  allowedActions: [],
  forbiddenActions: [],
  approvalRequiredFor: [],
  canProposeMemoryCandidates: true,
  canAutoSaveTrustedMemory: false,
  memoryRequiresApproval: true,
  allowedMemoryCategories: [],
  retentionPolicy: "approved durable memories only; raw reasoning must never be stored as memory",
  parameterMode: "ROLE_DEFAULT",
  modelParameters: null,
};

export function toAgentPayload(agent: AgentDto): AgentPayload {
  return {
    name: agent.name,
    title: agent.title,
    role: agent.role,
    specialty: agent.specialty,
    description: agent.description,
    systemPrompt: agent.systemPrompt || agent.prompt,
    skills: agent.skills,
    responseStyle: agent.responseStyle,
    isActive: agent.isActive,
    priority: agent.priority,
    preferredProviderId: agent.preferredProviderId,
    defaultModel: agent.defaultModel,
    fallbackProviderIds: agent.fallbackProviderIds ?? [],
    fallbackModels: agent.fallbackModels ?? [],
    routingPolicy: agent.routingPolicy ?? "GLOBAL_ROUTING",
    costPreference: agent.costPreference,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    personalDetail: agent.personalDetail ?? "",
    personality: agent.personality ?? "",
    relationshipWithKing: agent.relationshipWithKing ?? "",
    relationshipWithCouncil: agent.relationshipWithCouncil ?? "",
    roleBoundaries: agent.roleBoundaries ?? "",
    allowedActions: agent.allowedActions ?? [],
    forbiddenActions: agent.forbiddenActions ?? [],
    approvalRequiredFor: agent.approvalRequiredFor ?? [],
    canProposeMemoryCandidates: agent.canProposeMemoryCandidates ?? true,
    canAutoSaveTrustedMemory: agent.canAutoSaveTrustedMemory ?? false,
    memoryRequiresApproval: agent.memoryRequiresApproval ?? true,
    allowedMemoryCategories: agent.allowedMemoryCategories ?? [],
    retentionPolicy: agent.retentionPolicy ?? blankAgent.retentionPolicy,
    parameterMode: (agent.parameterMode as ParameterMode) ?? "ROLE_DEFAULT",
    modelParameters: agent.modelParameters ?? null,
  };
}

export function cleanAgentPayload(payload: AgentPayload): AgentPayload {
  return {
    ...payload,
    preferredProviderId: payload.preferredProviderId || null,
    defaultModel: payload.defaultModel || null,
    fallbackProviderIds: payload.fallbackProviderIds ?? [],
    fallbackModels: payload.fallbackModels ?? [],
    routingPolicy: payload.routingPolicy ?? "GLOBAL_ROUTING",
    costPreference: payload.costPreference ?? null,
    temperature: payload.temperature ?? null,
    maxTokens: payload.maxTokens ?? null,
    personalDetail: payload.personalDetail ?? "",
    personality: payload.personality ?? "",
    relationshipWithKing: payload.relationshipWithKing ?? "",
    relationshipWithCouncil: payload.relationshipWithCouncil ?? "",
    roleBoundaries: payload.roleBoundaries ?? "",
    allowedActions: payload.allowedActions ?? [],
    forbiddenActions: payload.forbiddenActions ?? [],
    approvalRequiredFor: payload.approvalRequiredFor ?? [],
    canProposeMemoryCandidates: payload.canProposeMemoryCandidates ?? true,
    canAutoSaveTrustedMemory: payload.canAutoSaveTrustedMemory ?? false,
    memoryRequiresApproval: payload.memoryRequiresApproval ?? true,
    allowedMemoryCategories: payload.allowedMemoryCategories ?? [],
    retentionPolicy: payload.retentionPolicy ?? blankAgent.retentionPolicy,
    parameterMode: payload.parameterMode ?? "ROLE_DEFAULT",
    modelParameters: payload.parameterMode === "MANUAL" ? (payload.modelParameters ?? null) : null,
  };
}

export function toDisplayPayload(agent: AgentDto | null): DisplayProfilePayload {
  return {
    displayName: agent?.displayName ?? null,
    displayTitle: agent?.displayTitle ?? null,
    avatarUrl: agent?.avatarUrl ?? null,
    avatarPrompt: agent?.avatarPrompt ?? null,
    avatarStyle: agent?.avatarStyle ?? null,
  };
}

export function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function agentName(agent: AgentDto) {
  return agent.displayName ?? agent.canonicalName ?? agent.name;
}

export function agentTitle(agent: AgentDto) {
  return agent.displayTitle ?? agent.canonicalTitle ?? agent.title;
}

export function fallbackKey(providerId: string | null | undefined, modelId: string) {
  return `${providerId || "no-provider"}::${modelId.trim()}`;
}
