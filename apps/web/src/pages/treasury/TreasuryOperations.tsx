import { Activity, Database, RefreshCw, Scale, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { formatCost } from "./treasuryModels";
import { PricingRegistryAdmin } from "./PricingRegistryAdmin";
import type { TreasuryController, TreasuryOperation } from "./useTreasuryController";

export function TreasuryOperations({ controller }: { controller: TreasuryController }) {
  const tk = useTk();
  const actions: Array<{ key: TreasuryOperation; label: string; icon: typeof Activity }> = [
    { key: "account", label: tk("treasury.operations.account"), icon: ServerCog },
    { key: "models", label: tk("treasury.operations.models"), icon: Database },
    { key: "health", label: tk("treasury.operations.health"), icon: Activity },
    { key: "balance", label: tk("treasury.operations.balance"), icon: RefreshCw },
    { key: "reconcile", label: tk("treasury.operations.reconcile"), icon: Scale },
  ];
  return (
    <section className="mt-6 min-w-0 border border-border bg-card/20">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="font-semibold">{tk("treasury.operations.title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{tk("treasury.operations.description")}</p>
      </div>
      <div className="px-4 py-5 sm:px-5">
        {controller.operationError ? (
          <div className="mb-4 border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-300" role="alert">
            {tk("treasury.operations.error")} {controller.operationError}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {actions.map(({ key, label, icon: Icon }) => (
            <Button className="min-h-11" disabled={controller.operation !== null} key={key} onClick={() => void controller.runOperation(key)} variant="outline">
              <Icon className={cn("h-4 w-4", controller.operation === key && "motion-safe:animate-spin")} />
              {controller.operation === key ? tk("treasury.operations.running") : label}
            </Button>
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{tk("treasury.operations.reconciliation")}</h3>
          {controller.reconciliation ? (
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
              <Evidence label={tk("treasury.detail.spend")} value={formatCost(controller.reconciliation.estimatedSpendUSD)} />
              <Evidence label={tk("treasury.operations.providerSpend")} value={controller.reconciliation.providerReportedSpendUSD === null ? "—" : formatCost(controller.reconciliation.providerReportedSpendUSD)} />
              <Evidence label={tk("treasury.operations.variance")} value={controller.reconciliation.variancePercent === null ? "—" : `${controller.reconciliation.variancePercent.toFixed(1)}%`} />
              <Evidence label={tk("treasury.operations.confidence")} value={controller.reconciliation.confidenceScore === null ? "—" : `${Math.round(controller.reconciliation.confidenceScore * 100)}%`} />
              <div className="col-span-2 text-xs text-muted-foreground lg:col-span-4">{formatDate(controller.reconciliation.reconciledAt)}</div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{tk("treasury.operations.noReconciliation")}</p>
          )}
        </div>

        <details className="mt-5 border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
            {tk("treasury.operations.pricing")}
          </summary>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">{tk("treasury.operations.pricingDescription")}</p>
          <PricingRegistryAdmin />
        </details>
      </div>
    </section>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
