import { LivingAgentProfileWorkspace } from "./living-agent-profile/LivingAgentProfileWorkspace";
import { useLivingAgentProfileController } from "./living-agent-profile/useLivingAgentProfileController";

export function LivingAgentProfilePage() {
  return (
    <LivingAgentProfileWorkspace
      controller={useLivingAgentProfileController()}
    />
  );
}
