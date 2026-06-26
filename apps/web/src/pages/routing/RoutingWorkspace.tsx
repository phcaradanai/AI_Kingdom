import { AlertTriangle, GitBranch, Plus, RefreshCw, Route, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { RouteChainDetail } from "./RouteChainDetail";
import {
  RouteChainDeleteDialog,
  RouteChainEditorDialog,
} from "./RouteChainEditorDialog";
import { RouteChainRegistry } from "./RouteChainRegistry";
import type { RoutingController } from "./useRoutingController";

export function RoutingWorkspace({
  controller,
}: {
  controller: RoutingController;
}) {
  const tk = useTk();
  return (
    <>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={controller.loading}
              onClick={() => void controller.load({ quiet: true })}
              variant="outline"
            >
              <RefreshCw className={cn("h-4 w-4", controller.loading && "motion-safe:animate-spin")} />
              {controller.loading ? tk("routing.refreshing") : tk("routing.refresh")}
            </Button>
            <Button className="min-h-11" onClick={controller.openCreate}>
              <Plus className="h-4 w-4" />
              {tk("routing.newChain")}
            </Button>
          </div>
        }
        description={tk("routing.description")}
        eyebrow={tk("routing.eyebrow")}
        title={tk("routing.title")}
      />

      <Metrics controller={controller} />

      <div className="mt-4 border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
        <strong className="text-foreground">{tk("routing.safetyTitle")}</strong>{" "}
        {tk("routing.safetyDescription")}
      </div>

      {controller.modelCatalogError ? (
        <div className="mt-4 flex items-start gap-2 border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {tk("routing.telemetryWarning")}
        </div>
      ) : null}

      {controller.error && !controller.editorMode && !controller.deleteTarget ? (
        <div
          className="mt-4 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {controller.error}
        </div>
      ) : null}

      {controller.notice ? (
        <div className="mt-4 border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-200">
          {tk(`routing.notice.${controller.notice}`)}
        </div>
      ) : null}

      {controller.loading ? (
        <div className="mt-8 border border-border p-10 text-center text-sm text-muted-foreground">
          {tk("routing.loading")}
        </div>
      ) : !controller.error ? (
        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <RouteChainRegistry controller={controller} />
          <RouteChainDetail controller={controller} />
        </div>
      ) : null}

      {controller.editorMode ? (
        <RouteChainEditorDialog controller={controller} />
      ) : null}
      {controller.deleteTarget ? (
        <RouteChainDeleteDialog controller={controller} />
      ) : null}
    </>
  );
}

function Metrics({ controller }: { controller: RoutingController }) {
  const tk = useTk();
  const metrics = [
    [tk("routing.metric.total"), controller.counts.total, Route, "default"],
    [tk("routing.metric.active"), controller.counts.active, ShieldCheck, "ready"],
    [tk("routing.metric.disabled"), controller.counts.disabled, AlertTriangle, "attention"],
    [tk("routing.metric.routes"), controller.counts.routes, GitBranch, "default"],
  ] as const;
  return (
    <section
      aria-label={tk("routing.metrics.aria")}
      className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-y-0"
    >
      {metrics.map(([label, value, Icon, tone]) => (
        <div className="min-w-0 px-3 py-3 sm:px-4" key={label}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xl font-semibold tabular-nums">{value}</span>
            <Icon
              className={cn(
                "h-4 w-4",
                tone === "ready" && "text-emerald-400",
                tone === "attention" && "text-amber-400",
                tone === "default" && "text-primary",
              )}
            />
          </div>
          <div className="mt-1 break-words text-xs text-muted-foreground">
            {label}
          </div>
        </div>
      ))}
    </section>
  );
}
