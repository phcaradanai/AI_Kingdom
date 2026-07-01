import { TreasuryWorkspace } from "./treasury/TreasuryWorkspace";
import { useTreasuryController } from "./treasury/useTreasuryController";

export function TreasuryPage() {
  return <TreasuryWorkspace controller={useTreasuryController()} />;
}
