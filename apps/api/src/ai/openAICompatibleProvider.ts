import { env } from "../config/env.js";
import { getNumberSetting } from "../services/settingsService.js";
import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";
import { buildProviderRequestBody } from "./modelParameterResolver.js";

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
  // Reasoning/thinking tokens (OpenRouter / OpenAI o-series)
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  reasoning_tokens?: number;
};

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: ChatCompletionUsage;
};

export type OpenAICompatibleProviderOptions = {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private readonly explicitTimeoutMs?: number;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.providerId;
    this.model = options.defaultModel;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = options.headers ?? {};
    this.explicitTimeoutMs = options.timeoutMs;
    this.timeoutMs = options.timeoutMs ?? env.AI_TIMEOUT_MS;
  }

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    if (!this.apiKey) {
      throw new Error(`${this.name.toUpperCase()} API key is required for provider '${this.name}'`);
    }

    const controller = new AbortController();
    const timeoutMs = this.explicitTimeoutMs ?? await getNumberSetting("AI_TIMEOUT_MS", this.timeoutMs);

    const makeTimeoutError = () => {
      const err = new Error(`PROVIDER_TIMEOUT: ${this.name} timed out after ${timeoutMs}ms`);
      (err as any).errorCode = "PROVIDER_TIMEOUT";
      (err as any).statusCode = 504;
      (err as any).providerId = this.name;
      (err as any).providerName = this.name;
      (err as any).model = input.model ?? this.model;
      (err as any).endpointPath = "/chat/completions";
      return err;
    };

    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(makeTimeoutError());
      }, timeoutMs);
    });

    try {
      const url = this.baseUrl.endsWith("/chat/completions") ? this.baseUrl : `${this.baseUrl}/chat/completions`;
      const messages = [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: buildUserPrompt(input) }
      ];
      const model = input.model ?? this.model;

      const requestBody = input.modelParameters
        ? buildProviderRequestBody({ model, messages, effective: input.modelParameters })
        : {
            model,
            messages,
            stream: false,
            max_tokens: input.maxTokens ?? env.AI_MAX_TOKENS,
            temperature: input.temperature ?? 0.35
          };

      const response = await Promise.race([
        fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...this.headers
          },
          body: JSON.stringify(requestBody)
        }),
        timedOut
      ]);

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
      const finishReason = payload.choices?.[0]?.finish_reason ?? null;

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
      let reasoningTokens: number | null = null;

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
        // Extract reasoning tokens (OpenRouter / OpenAI o-series)
        if (u.completion_tokens_details?.reasoning_tokens !== undefined) {
          reasoningTokens = u.completion_tokens_details.reasoning_tokens;
        } else if (u.reasoning_tokens !== undefined) {
          reasoningTokens = u.reasoning_tokens;
        }
      }

      return {
        response: content,
        usage: { promptTokens, completionTokens, totalTokens, inputCacheHitTokens, inputCacheMissTokens, reasoningTokens },
        responseModel: payload.model ?? null,
        finishReason
      };
    } catch (error) {
      if ((error as any).errorCode === "PROVIDER_TIMEOUT") throw error;
      if (controller.signal.aborted) throw makeTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeoutHandle!);
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
    input.decreeFrame ? input.decreeFrame : "",
    `Royal command: ${input.command}`,
    input.previousCouncilContext ? `Previous council context:\n${input.previousCouncilContext}` : "",
    input.kingdomMemoryContext ? `Kingdom Memory Context:\n${input.kingdomMemoryContext}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}
