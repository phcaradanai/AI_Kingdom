import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ProviderSpendWorkspace } from "./ProviderSpendWorkspace";
import { TreasuryEvidence } from "./TreasuryEvidence";
import { TreasuryOperations } from "./TreasuryOperations";
import { TreasurySummary } from "./TreasurySummary";
import type { TreasuryController } from "./useTreasuryController";

export function TreasuryWorkspace({ controller }: { controller: TreasuryController }) {
  const tk = useTk();
  const fullFailure = !controller.loading && !controller.hasAnyData && controller.failures.length > 0;
  return (
    <>
      <PageHeader
        action={
          <Button className="min-h-11" disabled={controller.loading} onClick={() => void controller.load()} variant="outline">
            <RefreshCw className={cn("h-4 w-4", controller.loading && "motion-safe:animate-spin")} />
            {controller.loading ? tk("treasury.refreshing") : tk("treasury.refresh")}
          </Button>
        }
        description={tk("treasury.description")}
        eyebrow={tk("treasury.eyebrow")}
        title={tk("treasury.title")}
      />

      {controller.loading ? (
        <div className="border border-border p-10 text-center text-sm text-muted-foreground" role="status">
          {tk("treasury.loading")}
        </div>
      ) : fullFailure ? (
        <div className="border border-red-400/30 bg-red-400/5 p-5" role="alert">
          <div className="flex items-center gap-2 font-semibold text-red-300"><AlertTriangle className="h-4 w-4" />{tk("treasury.unavailable")}</div>
          <Button className="mt-4 min-h-11" onClick={() => void controller.load()} variant="outline">{tk("treasury.retry")}</Button>
        </div>
      ) : (
        <>
          <TreasurySummary
            overview={controller.overview}
            partial={controller.failures.length > 0}
            providers={controller.providers}
            traces={controller.attentionTraces}
          />

          {controller.failures.length > 0 ? (
            <div className="mt-4 flex min-w-0 items-start gap-3 border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <div className="font-semibold">{tk("treasury.partial.title")}</div>
                <p className="mt-1 break-words text-xs leading-5 text-amber-100/75">{tk("treasury.partial.description")}</p>
              </div>
            </div>
          ) : null}

          <ProviderSpendWorkspace
            onSelect={controller.selectProvider}
            providers={controller.providers}
            records={controller.records}
            selected={controller.selectedProvider}
            traces={controller.attentionTraces}
          />
          <TreasuryEvidence
            daily={controller.daily}
            fallbackAnalytics={controller.fallbackAnalytics}
            monthly={controller.monthly}
            overview={controller.overview}
            traces={controller.attentionTraces}
          />
          <TreasuryOperations controller={controller} />
        </>
      )}
    </>
  );
}
