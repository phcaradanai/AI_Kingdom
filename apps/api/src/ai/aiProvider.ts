import type { TaskMode } from "@prisma/client";
import type { EffectiveParameters } from "./modelParameterResolver.js";

export type GenerateAgentResponseInput = {
  command: string;
  mode: TaskMode;
  agentName: string;
  agentRole: string;
  agentSkills: string[];
  systemPrompt: string;
  responseStyle: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  modelParameters?: EffectiveParameters;
  kingdomContext?: string;
  projectContext?: string;
  kingdomMemoryContext?: string;
  previousCouncilContext?: string;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Cache-aware fields — populated only when the provider returns cache details
  inputCacheHitTokens?: number | null;
  inputCacheMissTokens?: number | null;
  // Reasoning/thinking tokens — populated when provider returns them
  reasoningTokens?: number | null;
};

export type AgentResponseResult = {
  response: string;
  usage: TokenUsage;
  responseModel?: string | null;
};

export type KnownAIProviderType =
  | "mock"
  | "openai-compatible"
  | "openai"
  | "openrouter"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "local";

export type AIProviderName = string;

export interface AIProvider {
  name: AIProviderName;
  model: string;
  generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentResponseResult>;
}
