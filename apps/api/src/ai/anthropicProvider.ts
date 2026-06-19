import { env } from "../config/env.js";
import { getNumberSetting } from "../services/settingsService.js";
import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";
import { buildSystemPrompt, buildUserPrompt } from "./openAICompatibleProvider.js";

/**
 * Native Anthropic Messages API client (https://docs.anthropic.com/en/api/messages).
 * Anthropic is not OpenAI-compatible: it uses `x-api-key` + `anthropic-version` headers,
 * a top-level `system` string, a `messages` array, and returns `content[].text` with a
 * separate `usage.input_tokens`/`output_tokens` shape. Implements the AIProvider contract
 * so it slots into the existing provider registry / fallback chain.
 */

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

type AnthropicResponse = {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: AnthropicUsage;
};

export type AnthropicProviderOptions = {
  providerId?: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  anthropicVersion?: string;
  timeoutMs?: number;
  /** Injectable for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export class AnthropicProvider implements AIProvider {
  name: string;
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private anthropicVersion: string;
  private readonly explicitTimeoutMs?: number;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: AnthropicProviderOptions) {
    this.name = options.providerId ?? "anthropic";
    this.model = options.defaultModel;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.anthropicVersion = options.anthropicVersion ?? env.ANTHROPIC_VERSION;
    this.explicitTimeoutMs = options.timeoutMs;
    this.timeoutMs = options.timeoutMs ?? env.AI_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    if (!this.apiKey) {
      throw new Error(`ANTHROPIC API key is required for provider '${this.name}'`);
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
      (err as any).endpointPath = "/messages";
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
      const url = this.baseUrl.endsWith("/messages") ? this.baseUrl : `${this.baseUrl}/messages`;
      const model = input.model ?? this.model;
      const requestBody = {
        model,
        max_tokens: input.maxTokens ?? env.AI_MAX_TOKENS,
        temperature: input.temperature ?? 0.35,
        system: buildSystemPrompt(input),
        messages: [{ role: "user", content: buildUserPrompt(input) }]
      };

      const response = await Promise.race([
        this.fetchImpl(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": this.anthropicVersion,
            "Content-Type": "application/json"
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
        (err as any).model = model;
        (err as any).endpointPath = "/messages";
        (err as any).statusCode = response.status;
        throw err;
      }

      const payload = (await response.json()) as AnthropicResponse;
      const content = (payload.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text!.trim())
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!content) {
        throw new Error(`${this.name} provider returned an empty response`);
      }

      const promptTokens = payload.usage?.input_tokens ?? 0;
      const completionTokens = payload.usage?.output_tokens ?? 0;
      const inputCacheHitTokens = payload.usage?.cache_read_input_tokens ?? null;
      const inputCacheMissTokens = inputCacheHitTokens !== null ? Math.max(0, promptTokens - inputCacheHitTokens) : null;

      return {
        response: content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          inputCacheHitTokens,
          inputCacheMissTokens,
          reasoningTokens: null
        },
        responseModel: payload.model ?? null
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
