import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import { StrategyWorkspace } from "./strategy/StrategyWorkspace";
import { useStrategyController } from "./strategy/useStrategyController";

export function StrategyPage() {
  const tk = useTk();
  const controller = useStrategyController();
  if (controller.loading) return <LoadingState message={tk("strategy.loading")} />;
  if (controller.error && !controller.overview)
    return <ErrorState message={controller.error} onRetry={() => void controller.load()} />;
  if (!controller.overview)
    return <ErrorState message={tk("strategy.error.load")} onRetry={() => void controller.load()} />;
  return <StrategyWorkspace controller={controller} />;
}
