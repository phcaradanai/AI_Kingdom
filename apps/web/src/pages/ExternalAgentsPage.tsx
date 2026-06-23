import { useAuthStore } from "@/stores/authStore";
import { ExternalAgentsWorkspace } from "./external-agents/ExternalAgentsWorkspace";
import { useExternalAgentsController } from "./external-agents/useExternalAgentsController";

export function ExternalAgentsPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const controller = useExternalAgentsController(Boolean(isKing));
  return <ExternalAgentsWorkspace controller={controller} isKing={Boolean(isKing)} />;
}
