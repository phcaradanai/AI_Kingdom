import type { TaskMode } from "@prisma/client";

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
  kingdomContext?: string;
  kingdomMemoryContext?: string;
  previousCouncilContext?: string;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AgentResponseResult = {
  response: string;
  usage: TokenUsage;
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
