import { AgentChatWorkspace } from "./agent-chat/AgentChatWorkspace";
import { useAgentChatController } from "./agent-chat/useAgentChatController";

export function AgentChatPage() {
  const controller = useAgentChatController();
  return <AgentChatWorkspace controller={controller} />;
}
