import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Plus,
  RefreshCw,
  ShieldOff,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ProviderDeleteDialog } from "./ProviderDeleteDialog";
import { ProviderDetail } from "./ProviderDetail";
import { ProviderEditorDialog } from "./ProviderEditorDialog";
import { ProviderRegistry } from "./ProviderRegistry";
import type { ProvidersController } from "./useProvidersController";

export function ProvidersWorkspace({
  controller,
}: {
  controller: ProvidersController;
}) {
  const tk = useTk();
  return (
    <>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              aria-label={tk("providers.sync")}
              className="min-h-11"
              disabled={controller.syncing}
              onClick={() => void controller.syncModels()}
              variant="outline"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  controller.syncing && "motion-safe:animate-spin",
                )}
              />
              {controller.syncing
                ? tk("providers.syncing")
                : tk("providers.sync")}
            </Button>
            <Button className="min-h-11" onClick={controller.openCreate}>
              <Plus className="h-4 w-4" />
              {tk("providers.add")}
            </Button>
          </div>
        }
        description={tk("providers.description")}
        eyebrow={tk("providers.eyebrow")}
        title={tk("providers.title")}
      />

      <Metrics controller={controller} />

      <div className="mt-4 border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
        <strong className="text-foreground">{tk("providers.safetyTitle")}</strong>{" "}
        {tk("providers.safetyDescription")}
      </div>

      {controller.telemetryError ? (
        <div
          className="mt-4 flex min-w-0 flex-col gap-3 border border-amber-400/30 bg-amber-400/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span className="flex items-start gap-2 text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {tk("providers.telemetryError")}
          </span>
          <Button
            className="min-h-11"
            onClick={() => void controller.loadTelemetry()}
            variant="outline"
          >
            {tk("providers.retry")}
          </Button>
        </div>
      ) : null}

      {controller.error && !controller.editorMode ? (
        <div
          className="mt-4 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {controller.error}
        </div>
      ) : null}
      {controller.notice ? (
        <div className="mt-4 border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-200">
          {tk(`providers.notice.${controller.notice}`)}
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <ProviderRegistry controller={controller} />
        <ProviderDetail controller={controller} />
      </div>

      {controller.editorMode ? (
        <ProviderEditorDialog controller={controller} />
      ) : null}
      {controller.deleteTarget ? (
        <ProviderDeleteDialog controller={controller} />
      ) : null}
    </>
  );
}

function Metrics({ controller }: { controller: ProvidersController }) {
  const tk = useTk();
  const metrics = [
    [tk("providers.metric.total"), controller.counts.total, Cpu, "default"],
    [tk("providers.metric.ready"), controller.counts.ready, CheckCircle2, "ready"],
    [
      tk("providers.metric.attention"),
      controller.counts.attention,
      AlertTriangle,
      "attention",
    ],
    [
      tk("providers.metric.inactive"),
      controller.counts.inactive,
      ShieldOff,
      "default",
    ],
  ] as const;
  return (
    <section
      aria-label={tk("providers.metrics.aria")}
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
