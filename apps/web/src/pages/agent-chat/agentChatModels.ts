import { Bot, MessageSquare, Search, Sparkles } from "lucide-react";
import type { DirectAgentRequestType, DirectAgentSaveMode, DirectAgentSummaryDto } from "@/types/api";

export type AgentChatPane = "browse" | "conversation" | "context";
export type AgentChatRailMode = "agents" | "sessions";

export const requestOptions: Array<{
  value: DirectAgentRequestType;
  labelKey: string;
  icon: typeof MessageSquare;
}> = [
  { value: "GENERAL_QUESTION", labelKey: "agentChat.request.general", icon: MessageSquare },
  { value: "RESEARCH_ASSIGNMENT", labelKey: "agentChat.request.research", icon: Search },
  { value: "SUMMARY_ASSIGNMENT", labelKey: "agentChat.request.summary", icon: Sparkles },
  { value: "PERSONAL_TASK", labelKey: "agentChat.request.personal", icon: Bot },
];

export const saveOptions: Array<{ value: DirectAgentSaveMode; labelKey: string; descriptionKey: string }> = [
  { value: "NONE", labelKey: "agentChat.save.none", descriptionKey: "agentChat.save.noneDescription" },
  { value: "ARTIFACT", labelKey: "agentChat.save.artifact", descriptionKey: "agentChat.save.artifactDescription" },
  { value: "KNOWLEDGE_CANDIDATE", labelKey: "agentChat.save.knowledge", descriptionKey: "agentChat.save.knowledgeDescription" },
  { value: "BOTH", labelKey: "agentChat.save.both", descriptionKey: "agentChat.save.bothDescription" },
];

export const promptExampleKeys: Record<DirectAgentRequestType, string> = {
  GENERAL_QUESTION: "agentChat.example.general",
  RESEARCH_ASSIGNMENT: "agentChat.example.research",
  SUMMARY_ASSIGNMENT: "agentChat.example.summary",
  PERSONAL_TASK: "agentChat.example.personal",
};

export function agentTitle(agent: DirectAgentSummaryDto | null | undefined) {
  return agent?.displayTitle ?? agent?.title ?? "";
}

export function agentName(agent: DirectAgentSummaryDto | null | undefined) {
  return agent?.displayName ?? agent?.name ?? "";
}
