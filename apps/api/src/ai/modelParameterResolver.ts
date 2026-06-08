export type ParameterMode = "MANUAL" | "ROLE_DEFAULT" | "PROVIDER_DEFAULT";

export type ReasoningConfig = {
  enabled: boolean;
  effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  max_tokens: number | null;
  exclude: boolean;
};

export type ToolsConfig = {
  enabled: boolean;
  tool_choice: "auto" | "none" | "required";
};

export type ResponseFormatConfig = "none" | "json_object" | "json_schema";
export type OpenRouterRouteConfig = "none" | "fallback";
export type PluginConfig = "web" | "file-parser" | "response-healing" | "context-compression";

export type ModelParameters = {
  stream: boolean;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  seed: number | null;
  response_format: ResponseFormatConfig | null;
  stop: string[] | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  repetition_penalty: number | null;
  top_k: number | null;
  min_p: number | null;
  openrouter_route: OpenRouterRouteConfig | null;
  openrouter_provider_preferences: string[] | null;
  plugins: PluginConfig[] | null;
  reasoning: ReasoningConfig;
  tools: ToolsConfig;
};

export type EffectiveParameters = {
  stream: boolean;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  seed: number | null;
  response_format: ResponseFormatConfig | null;
  stop: string[] | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  repetition_penalty: number | null;
  top_k: number | null;
  min_p: number | null;
  openrouter_route: OpenRouterRouteConfig | null;
  openrouter_provider_preferences: string[] | null;
  plugins: PluginConfig[] | null;
  reasoning: ReasoningConfig | null;
  tools: ToolsConfig | null;
  mode: ParameterMode;
};

type AgentForResolver = {
  slug: string;
  parameterMode?: string | null;
  modelParameters?: unknown;
  temperature?: number | null;
  maxTokens?: number | null;
};

const DEFAULT_REASONING: ReasoningConfig = {
  enabled: true,
  effort: "medium",
  max_tokens: null,
  exclude: true
};

const DEFAULT_TOOLS: ToolsConfig = {
  enabled: false,
  tool_choice: "auto"
};

type RoleDefaults = {
  temperature: number;
  reasoning: ReasoningConfig;
};

// Role-based defaults keyed by agent slug
const ROLE_DEFAULTS: Record<string, RoleDefaults> = {
  "grand-vizier": { temperature: 0.2, reasoning: { ...DEFAULT_REASONING, effort: "high" } },
  "royal-architect": { temperature: 0.15, reasoning: { ...DEFAULT_REASONING, effort: "medium" } },
  "royal-general": { temperature: 0.25, reasoning: { ...DEFAULT_REASONING, effort: "medium" } },
  "royal-researcher": { temperature: 0.35, reasoning: { ...DEFAULT_REASONING, effort: "high" } },
  "royal-treasurer": { temperature: 0.1, reasoning: { ...DEFAULT_REASONING, effort: "low" } },
  "royal-archivist": { temperature: 0.1, reasoning: { ...DEFAULT_REASONING, effort: "low" } },
  "prompt-agent": { temperature: 0.3, reasoning: { ...DEFAULT_REASONING, effort: "medium" } }
};

const FALLBACK_DEFAULTS: RoleDefaults = {
  temperature: 0.3,
  reasoning: DEFAULT_REASONING
};

// Providers that support OpenRouter-style reasoning parameter
const REASONING_SUPPORTED_PROVIDERS = new Set(["openrouter", "openrouter-free"]);

export function resolveEffectiveParameters(
  agent: AgentForResolver,
  providerType: string,
  defaultMaxTokens?: number
): EffectiveParameters {
  const raw = agent.parameterMode ?? "ROLE_DEFAULT";
  const mode: ParameterMode = raw === "MANUAL" || raw === "PROVIDER_DEFAULT" ? raw : "ROLE_DEFAULT";

  if (mode === "PROVIDER_DEFAULT") {
    return {
      stream: false,
      temperature: null,
      max_tokens: defaultMaxTokens ?? null,
      top_p: null,
      seed: null,
      response_format: null,
      stop: null,
      frequency_penalty: null,
      presence_penalty: null,
      repetition_penalty: null,
      top_k: null,
      min_p: null,
      openrouter_route: null,
      openrouter_provider_preferences: null,
      plugins: null,
      reasoning: null,
      tools: null,
      mode
    };
  }

  const supportsReasoning = REASONING_SUPPORTED_PROVIDERS.has(providerType);

  if (mode === "MANUAL") {
    const stored = parseModelParameters(agent.modelParameters);
    return {
      stream: stored?.stream ?? false,
      temperature: stored?.temperature ?? agent.temperature ?? null,
      max_tokens: stored?.max_tokens ?? agent.maxTokens ?? defaultMaxTokens ?? null,
      top_p: stored?.top_p ?? null,
      seed: stored?.seed ?? null,
      response_format: stored?.response_format ?? null,
      stop: stored?.stop ?? null,
      frequency_penalty: stored?.frequency_penalty ?? null,
      presence_penalty: stored?.presence_penalty ?? null,
      repetition_penalty: stored?.repetition_penalty ?? null,
      top_k: stored?.top_k ?? null,
      min_p: stored?.min_p ?? null,
      openrouter_route: stored?.openrouter_route ?? null,
      openrouter_provider_preferences: stored?.openrouter_provider_preferences ?? null,
      plugins: stored?.plugins ?? null,
      reasoning: supportsReasoning ? (stored?.reasoning ?? DEFAULT_REASONING) : null,
      tools: stored?.tools ?? DEFAULT_TOOLS,
      mode
    };
  }

  // ROLE_DEFAULT
  const roleDefaults = ROLE_DEFAULTS[agent.slug] ?? FALLBACK_DEFAULTS;
  const stored = parseModelParameters(agent.modelParameters);

  return {
    stream: stored?.stream ?? false,
    temperature: agent.temperature ?? stored?.temperature ?? roleDefaults.temperature,
    max_tokens: agent.maxTokens ?? stored?.max_tokens ?? defaultMaxTokens ?? null,
    top_p: stored?.top_p ?? null,
    seed: null,
    response_format: stored?.response_format ?? null,
    stop: stored?.stop ?? null,
    frequency_penalty: stored?.frequency_penalty ?? null,
    presence_penalty: stored?.presence_penalty ?? null,
    repetition_penalty: stored?.repetition_penalty ?? null,
    top_k: stored?.top_k ?? null,
    min_p: stored?.min_p ?? null,
    openrouter_route: stored?.openrouter_route ?? null,
    openrouter_provider_preferences: stored?.openrouter_provider_preferences ?? null,
    plugins: stored?.plugins ?? null,
    reasoning: supportsReasoning ? (stored?.reasoning ?? roleDefaults.reasoning) : null,
    tools: DEFAULT_TOOLS,
    mode
  };
}

// Builds the sanitized request body for the provider (omits nulls and unsupported params)
export function buildProviderRequestBody(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  effective: EffectiveParameters;
}): Record<string, unknown> {
  const { model, messages, effective } = params;
  const body: Record<string, unknown> = { model, messages };

  body.stream = effective.stream;

  if (effective.max_tokens !== null) body.max_tokens = effective.max_tokens;
  if (effective.temperature !== null) body.temperature = effective.temperature;
  if (effective.top_p !== null) body.top_p = effective.top_p;
  if (effective.seed !== null) body.seed = effective.seed;
  if (effective.stop !== null && effective.stop.length > 0) body.stop = effective.stop;
  if (effective.frequency_penalty !== null) body.frequency_penalty = effective.frequency_penalty;
  if (effective.presence_penalty !== null) body.presence_penalty = effective.presence_penalty;
  if (effective.repetition_penalty !== null) body.repetition_penalty = effective.repetition_penalty;
  if (effective.top_k !== null) body.top_k = effective.top_k;
  if (effective.min_p !== null) body.min_p = effective.min_p;
  if (effective.response_format && effective.response_format !== "none") {
    body.response_format = effective.response_format === "json_object"
      ? { type: "json_object" }
      : { type: "json_schema", json_schema: { name: "agent_response", schema: { type: "object", additionalProperties: true } } };
  }
  if (effective.openrouter_route && effective.openrouter_route !== "none") body.route = effective.openrouter_route;
  if (effective.openrouter_provider_preferences && effective.openrouter_provider_preferences.length > 0) {
    body.provider = { order: effective.openrouter_provider_preferences };
  }
  if (effective.plugins && effective.plugins.length > 0) body.plugins = effective.plugins.map((id) => ({ id }));

  if (effective.reasoning) {
    const r = effective.reasoning;
    const reasoning: Record<string, unknown> = { exclude: r.exclude };
    if (r.enabled) {
      reasoning.effort = r.effort === "none" ? undefined : r.effort;
    } else {
      reasoning.effort = "none";
    }
    if (r.max_tokens !== null) reasoning.max_tokens = r.max_tokens;
    // Remove undefined values
    for (const k of Object.keys(reasoning)) {
      if (reasoning[k] === undefined) delete reasoning[k];
    }
    body.reasoning = reasoning;
  }

  return body;
}

// Sanitized preview for UI (same as request body but never includes API keys/headers)
export function buildRequestPreview(params: {
  provider: string;
  model: string;
  effective: EffectiveParameters;
}): Record<string, unknown> {
  const { provider, model, effective } = params;
  const preview: Record<string, unknown> = {
    provider,
    model,
    stream: effective.stream
  };
  if (effective.max_tokens !== null) preview.max_tokens = effective.max_tokens;
  if (effective.temperature !== null) preview.temperature = effective.temperature;
  if (effective.top_p !== null) preview.top_p = effective.top_p;
  if (effective.seed !== null) preview.seed = effective.seed;
  if (effective.stop !== null && effective.stop.length > 0) preview.stop = effective.stop;
  if (effective.frequency_penalty !== null) preview.frequency_penalty = effective.frequency_penalty;
  if (effective.presence_penalty !== null) preview.presence_penalty = effective.presence_penalty;
  if (effective.repetition_penalty !== null) preview.repetition_penalty = effective.repetition_penalty;
  if (effective.top_k !== null) preview.top_k = effective.top_k;
  if (effective.min_p !== null) preview.min_p = effective.min_p;
  if (effective.response_format && effective.response_format !== "none") {
    preview.response_format = effective.response_format === "json_object"
      ? { type: "json_object" }
      : { type: "json_schema", json_schema: { name: "agent_response", schema: { type: "object", additionalProperties: true } } };
  }
  if (effective.openrouter_route && effective.openrouter_route !== "none") preview.route = effective.openrouter_route;
  if (effective.openrouter_provider_preferences && effective.openrouter_provider_preferences.length > 0) {
    preview.provider = { order: effective.openrouter_provider_preferences };
  }
  if (effective.plugins && effective.plugins.length > 0) preview.plugins = effective.plugins.map((id) => ({ id }));
  if (effective.reasoning) {
    preview.reasoning = {
      enabled: effective.reasoning.enabled,
      effort: effective.reasoning.effort,
      max_tokens: effective.reasoning.max_tokens,
      exclude: effective.reasoning.exclude
    };
  }
  if (effective.tools) {
    preview.tools = {
      enabled: effective.tools.enabled,
      tool_choice: effective.tools.tool_choice
    };
  }
  return preview;
}

function parseModelParameters(raw: unknown): ModelParameters | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    stream: typeof p.stream === "boolean" ? p.stream : false,
    temperature: typeof p.temperature === "number" ? p.temperature : null,
    max_tokens: typeof p.max_tokens === "number" ? p.max_tokens : null,
    top_p: typeof p.top_p === "number" ? p.top_p : null,
    seed: typeof p.seed === "number" ? p.seed : null,
    response_format: isValidResponseFormat(p.response_format) ? p.response_format : null,
    stop: parseStringArray(p.stop),
    frequency_penalty: typeof p.frequency_penalty === "number" ? p.frequency_penalty : null,
    presence_penalty: typeof p.presence_penalty === "number" ? p.presence_penalty : null,
    repetition_penalty: typeof p.repetition_penalty === "number" ? p.repetition_penalty : null,
    top_k: typeof p.top_k === "number" ? p.top_k : null,
    min_p: typeof p.min_p === "number" ? p.min_p : null,
    openrouter_route: isValidOpenRouterRoute(p.openrouter_route) ? p.openrouter_route : null,
    openrouter_provider_preferences: parseStringArray(p.openrouter_provider_preferences),
    plugins: parsePlugins(p.plugins),
    reasoning: parseReasoningConfig(p.reasoning),
    tools: parseToolsConfig(p.tools)
  };
}

function parseReasoningConfig(raw: unknown): ReasoningConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_REASONING;
  const r = raw as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    effort: isValidEffort(r.effort) ? r.effort : "medium",
    max_tokens: typeof r.max_tokens === "number" ? r.max_tokens : null,
    exclude: typeof r.exclude === "boolean" ? r.exclude : true
  };
}

function parseToolsConfig(raw: unknown): ToolsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_TOOLS;
  const t = raw as Record<string, unknown>;
  return {
    enabled: typeof t.enabled === "boolean" ? t.enabled : false,
    tool_choice: isValidToolChoice(t.tool_choice) ? t.tool_choice : "auto"
  };
}

const VALID_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
function isValidEffort(v: unknown): v is ReasoningConfig["effort"] {
  return typeof v === "string" && VALID_EFFORTS.has(v);
}

const VALID_TOOL_CHOICES = new Set(["auto", "none", "required"]);
function isValidToolChoice(v: unknown): v is ToolsConfig["tool_choice"] {
  return typeof v === "string" && VALID_TOOL_CHOICES.has(v);
}

const VALID_RESPONSE_FORMATS = new Set(["none", "json_object", "json_schema"]);
function isValidResponseFormat(v: unknown): v is ResponseFormatConfig {
  return typeof v === "string" && VALID_RESPONSE_FORMATS.has(v);
}

const VALID_OPENROUTER_ROUTES = new Set(["none", "fallback"]);
function isValidOpenRouterRoute(v: unknown): v is OpenRouterRouteConfig {
  return typeof v === "string" && VALID_OPENROUTER_ROUTES.has(v);
}

const VALID_PLUGINS = new Set(["web", "file-parser", "response-healing", "context-compression"]);
function parsePlugins(value: unknown): PluginConfig[] | null {
  if (!Array.isArray(value)) return null;
  const plugins = value.filter((item): item is PluginConfig => typeof item === "string" && VALID_PLUGINS.has(item));
  return plugins.length > 0 ? [...new Set(plugins)] : null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return list.length > 0 ? [...new Set(list)] : null;
}
