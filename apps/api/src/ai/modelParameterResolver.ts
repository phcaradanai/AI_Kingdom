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

export type ModelParameters = {
  stream: boolean;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  seed: number | null;
  reasoning: ReasoningConfig;
  tools: ToolsConfig;
};

export type EffectiveParameters = {
  stream: boolean;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  seed: number | null;
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
