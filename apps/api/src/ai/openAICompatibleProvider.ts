import { env } from "../config/env.js";
import type { AgentResponseResult, AIProvider, GenerateAgentResponseInput } from "./aiProvider.js";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
        throw new Error(`${this.name} provider error ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error(`${this.name} provider returned an empty response`);
      }

      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const totalTokens = payload.usage?.total_tokens ?? promptTokens + completionTokens;

      return {
        response: content,
        usage: { promptTokens, completionTokens, totalTokens }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildSystemPrompt(input: GenerateAgentResponseInput): string {
  return [
    input.kingdomContext ? input.kingdomContext : "",
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
