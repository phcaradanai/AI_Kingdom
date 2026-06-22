import { AgentsWorkspace } from "./agents/AgentsWorkspace";
import { useAgentsController } from "./agents/useAgentsController";

export function AgentsPage() {
  const controller = useAgentsController();
  return <AgentsWorkspace controller={controller} />;
}
