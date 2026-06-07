import { env } from "../config/env.js";
import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";

type ChatCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  // DeepSeek cache fields
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  // Alternative naming used by some OpenAI-compatible providers
  input_cache_hit_tokens?: number;
  input_cache_miss_tokens?: number;
  // OpenAI-style nested details
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: ChatCompletionUsage;
};

export type OpenAICompatibleProviderOptions = {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  headers?: Record<string, string>;
};

export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.providerId;
    this.model = options.defaultModel;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = options.headers ?? {};
  }

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    if (!this.apiKey) {
      throw new Error(`${this.name.toUpperCase()} API key is required for provider '${this.name}'`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const url = this.baseUrl.endsWith("/chat/completions") ? this.baseUrl : `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...this.headers
        },
        body: JSON.stringify({
          model: input.model ?? this.model,
          max_tokens: input.maxTokens ?? env.AI_MAX_TOKENS,
          temperature: input.temperature ?? 0.35,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(input)
            },
            {
              role: "user",
              content: buildUserPrompt(input)
            }
          ]
        })
      });

      if (!response.ok) {
        const body = await response.text();
        const err = new Error(`${this.name} provider error ${response.status}: ${body}`);
        (err as any).providerId = this.name;
        (err as any).providerName = this.name;
        (err as any).model = input.model ?? this.model;
        (err as any).endpointPath = "/chat/completions";
        (err as any).statusCode = response.status;
        throw err;
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error(`${this.name} provider returned an empty response`);
      }

      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const totalTokens = payload.usage?.total_tokens ?? promptTokens + completionTokens;

      // Extract cache token breakdown defensively across naming conventions
      const u = payload.usage;
      let inputCacheHitTokens: number | null = null;
      let inputCacheMissTokens: number | null = null;

      if (u) {
        if (u.prompt_cache_hit_tokens !== undefined) {
          inputCacheHitTokens = u.prompt_cache_hit_tokens;
          inputCacheMissTokens = u.prompt_cache_miss_tokens ?? (promptTokens - inputCacheHitTokens);
        } else if (u.input_cache_hit_tokens !== undefined) {
          inputCacheHitTokens = u.input_cache_hit_tokens;
          inputCacheMissTokens = u.input_cache_miss_tokens ?? (promptTokens - inputCacheHitTokens);
        } else if (u.prompt_tokens_details?.cached_tokens !== undefined) {
          inputCacheHitTokens = u.prompt_tokens_details.cached_tokens;
          inputCacheMissTokens = promptTokens - inputCacheHitTokens;
        }
      }

      return {
        response: content,
        usage: { promptTokens, completionTokens, totalTokens, inputCacheHitTokens, inputCacheMissTokens }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildSystemPrompt(input: GenerateAgentResponseInput): string {
  return [
    input.kingdomContext ? input.kingdomContext : "",
    input.projectContext ? input.projectContext : "",
    input.systemPrompt,
    `Royal role: ${input.agentRole}`,
    `Skills: ${input.agentSkills.join(", ") || "general royal counsel"}`,
    `Response style: ${input.responseStyle || "concise, structured, practical"}`,
    "Do not browse the web, call tools, or invent external research. Respond only with counsel for the provided decree."
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildUserPrompt(input: GenerateAgentResponseInput): string {
  return [
    `Task mode: ${input.mode}`,
    `Royal command: ${input.command}`,
    input.previousCouncilContext ? `Previous council context:\n${input.previousCouncilContext}` : "",
    input.kingdomMemoryContext ? `Kingdom Memory Context:\n${input.kingdomMemoryContext}` : "",
    "Return structured council counsel with: Assessment, Recommendation, Risks, Next step."
  ]
    .filter(Boolean)
    .join("\n\n");
}
