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

export class OpenAIProvider implements AIProvider {
  name = "openai" as const;
  model = env.OPENAI_MODEL;

  async generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model ?? env.OPENAI_MODEL,
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
        throw new Error(`OpenAI-compatible provider error ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("OpenAI-compatible provider returned an empty response");
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

function buildSystemPrompt(input: GenerateAgentResponseInput): string {
  return [
    input.systemPrompt,
    `Royal role: ${input.agentRole}`,
    `Skills: ${input.agentSkills.join(", ") || "general royal counsel"}`,
    `Response style: ${input.responseStyle || "concise, structured, practical"}`,
    "Do not browse the web, call tools, or invent external research. Respond only with counsel for the provided decree."
  ].join("\n");
}

function buildUserPrompt(input: GenerateAgentResponseInput): string {
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
