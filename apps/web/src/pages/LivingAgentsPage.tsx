import { LivingAgentsWorkspace } from "./living-agents/LivingAgentsWorkspace";
import { useLivingAgentsController } from "./living-agents/useLivingAgentsController";

export function LivingAgentsPage() {
  return <LivingAgentsWorkspace controller={useLivingAgentsController()} />;
}
