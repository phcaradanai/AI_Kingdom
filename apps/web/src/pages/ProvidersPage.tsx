import { ProvidersWorkspace } from "./providers/ProvidersWorkspace";
import { useProvidersController } from "./providers/useProvidersController";

export function ProvidersPage() {
  return <ProvidersWorkspace controller={useProvidersController()} />;
}
