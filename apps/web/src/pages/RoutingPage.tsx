import { RoutingWorkspace } from "./routing/RoutingWorkspace";
import { useRoutingController } from "./routing/useRoutingController";

export function RoutingPage() {
  return <RoutingWorkspace controller={useRoutingController()} />;
}
