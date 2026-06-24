import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  FolderKanban,
  ScrollText,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTk } from "@/lib/i18n";
import {
  getModelDisplayName,
  getProviderDisplayName,
} from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import type { LivingAgentTimelineItemDto } from "@/types/api";
import type { LivingAgentProfileController } from "./useLivingAgentProfileController";

export function TimelineSection({
  controller,
}: {
  controller: LivingAgentProfileController;
}) {
  const tk = useTk();
  return (
    <section
      aria-label={tk("agentProfile.timeline.aria")}
      className="min-w-0 border border-border bg-card/30"
    >
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2">
        <label className="min-w-0">
          <span className="sr-only">
            {tk("agentProfile.timeline.attribution")}
          </span>
          <select
            aria-label={tk("agentProfile.timeline.attribution")}
            className="min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm"
            value={controller.timelineFilters.attributionStatus ?? ""}
            onChange={(event) =>
              controller.setTimelineFilters({
                ...controller.timelineFilters,
                attributionStatus: event.target.value || undefined,
              })
            }
          >
            <option value="">
              {tk("agentProfile.timeline.allAttribution")}
            </option>
            <option value="TRUSTED">
              {tk("agentProfile.attribution.verified")}
            </option>
            <option value="PARTIAL">
              {tk("agentProfile.attribution.partial")}
            </option>
            <option value="LEGACY_UNATTRIBUTED">
              {tk("agentProfile.attribution.legacy")}
            </option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{tk("agentProfile.timeline.limit")}</span>
          <select
            aria-label={tk("agentProfile.timeline.limit")}
            className="min-h-11 w-full rounded-md border border-border bg-input px-3 text-sm"
            value={controller.timelineFilters.limit ?? 50}
            onChange={(event) =>
              controller.setTimelineFilters({
                ...controller.timelineFilters,
                limit: Number(event.target.value),
              })
            }
          >
            {[20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {tk("agentProfile.timeline.items", { count: value })}
              </option>
            ))}
          </select>
        </label>
      </div>
      {controller.timelineError ? (
        <div
          role="alert"
          className="m-3 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {controller.timelineError}
        </div>
      ) : controller.timelineLoading ? (
        <LoadingState message={tk("agentProfile.timeline.loading")} />
      ) : controller.timelineItems.length ? (
        <div className="divide-y divide-border">
          {controller.timelineItems.map((item) => (
            <TimelineRow item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="border-0"
          icon={Activity}
          title={tk("agentProfile.timeline.empty")}
          description={tk("agentProfile.timeline.emptyDescription")}
        />
      )}
    </section>
  );
}

function TimelineRow({ item }: { item: LivingAgentTimelineItemDto }) {
  const tk = useTk();
  const legacy = item.attributionStatus === "LEGACY_UNATTRIBUTED";
  const links = [
    {
      to: item.links.trace,
      label: tk("agentProfile.timeline.openTrace"),
      icon: Zap,
    },
    {
      to: item.links.task,
      label: tk("agentProfile.timeline.openTask"),
      icon: ScrollText,
    },
    {
      to: item.links.council,
      label: tk("agentProfile.timeline.openCouncil"),
      icon: ScrollText,
    },
    {
      to: item.links.report,
      label: tk("agentProfile.timeline.openReport"),
      icon: FileText,
    },
    {
      to: item.links.project,
      label: tk("agentProfile.timeline.openProject"),
      icon: FolderKanban,
    },
  ].filter((entry) => entry.to);
  return (
    <article className={cn("min-w-0 p-4", legacy && "bg-amber-400/5")}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Attribution status={item.attributionStatus} />
            <span className="text-xs text-muted-foreground">
              {item.type.replaceAll("_", " ")}
            </span>
            {item.provider ? (
              <span className="text-xs text-muted-foreground">
                {getProviderDisplayName(item.provider)}
                {item.model ? ` · ${getModelDisplayName(item.model)}` : ""}
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 break-words text-sm font-semibold text-foreground">
            {item.title}
          </h2>
          {item.detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          ) : null}
          {legacy ? (
            <p className="mt-1 text-xs text-amber-400">
              {tk("agentProfile.timeline.legacyNote")}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {formatDate(item.timestamp)} · {item.status}
        </div>
      </div>
      {item.tokensUsed != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {item.tokensUsed.toLocaleString()} {tk("agentProfile.tokens")}
          {item.estimatedCostUSD != null
            ? ` · $${item.estimatedCostUSD.toFixed(5)}`
            : ""}
        </p>
      ) : null}
      {item.promptPreview || item.responsePreview ? (
        <details className="mt-2 border-t border-border pt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-primary">
            {tk("agentProfile.timeline.preview")}
          </summary>
          {item.promptPreview ? (
            <p className="break-words font-mono text-xs text-muted-foreground">
              {item.promptPreview}
            </p>
          ) : null}
          {item.responsePreview ? (
            <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
              {item.responsePreview}
            </p>
          ) : null}
        </details>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            aria-label={label}
            className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
            key={`${label}-${to}`}
            to={to!}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ))}
      </div>
    </article>
  );
}

function Attribution({ status }: { status: string }) {
  const tk = useTk();
  const trusted = status === "TRUSTED";
  const partial = status === "PARTIAL";
  const Icon = trusted ? CheckCircle2 : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        trusted
          ? "text-emerald-400"
          : partial
            ? "text-blue-400"
            : "text-amber-400",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {tk(
        `agentProfile.attribution.${trusted ? "verified" : partial ? "partial" : "legacy"}`,
      )}
    </span>
  );
}
