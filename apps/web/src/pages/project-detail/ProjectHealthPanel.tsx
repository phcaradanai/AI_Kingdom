import { AlertTriangle, ArrowUpRight, CheckCircle2, FileText, FolderKanban, GitBranch, RefreshCw, ScanSearch, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ContextBindingStatusDto } from "@/types/api";
import { contextStatusClass, deriveProjectContextHealth, isActiveWorkOrder } from "./projectDetailModels";
import type { ProjectDetailController } from "./useProjectDetailController";

export function ProjectHealthPanel({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const workOrders = controller.data?.workOrders ?? [];
  const activeAffected = (controller.contextHealth?.openWorkOrders ?? workOrders)
    .filter((order) => isActiveWorkOrder(order.status))
    .filter((order) => "contextBindingStatus" in order ? order.contextBindingStatus !== "FRESH" : true);
  const status = controller.contextHealth?.status ?? deriveProjectContextHealth(controller.localDocSnapshot, workOrders);
  const localDocsChanged = Boolean(controller.contextHealth?.binding?.localDocsChanged || controller.localDocSnapshot?.isStale);
  const shouldScanFirst = status === "STALE" && localDocsChanged;
  const latestRootScan = controller.localDocRoots
    .map((root) => root.lastScannedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const changedEvidence = controller.contextHealth?.lines
    .filter((line) => /changed|stale|missing|partial|snapshot/i.test(line))
    .slice(0, 4) ?? [];

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-primary/30 bg-card" aria-labelledby="project-context-health">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-primary/5 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold" id="project-context-health">{tk("projectDetail.health.title")}</h2>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tk("projectDetail.health.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {controller.canEditLocalDocs ? (
            <Button className="min-h-11" onClick={() => void controller.runLocalDocsScan()} disabled={Boolean(controller.localDocsScanningRootId) || controller.localDocRoots.length === 0}>
              <ScanSearch className={cn("h-4 w-4", controller.localDocsScanningRootId && "animate-spin")} />
              {controller.localDocsScanningRootId ? tk("projectDetail.scanning") : tk("projectDetail.action.scan")}
            </Button>
          ) : null}
          <Button className="min-h-11" variant="outline" onClick={() => void controller.refreshProjectContexts()} disabled={controller.contextActionLoading || shouldScanFirst}>
            <RefreshCw className={cn("h-4 w-4", controller.contextActionLoading && "animate-spin")} />
            {tk("projectDetail.action.refresh")}
          </Button>
          <Button className="min-h-11" variant="outline" onClick={() => void controller.reconcileOldWorkOrders()} disabled={controller.contextActionLoading}>
            {tk("projectDetail.health.reconcile")}
          </Button>
        </div>
      </div>

      <div className="p-5">
        {status === "STALE" ? (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><div className="font-semibold">{tk("projectDetail.health.staleTitle")}</div><div className="mt-1">{tk("projectDetail.health.staleAction")}</div><div className="mt-1 text-amber-100/80">{tk("projectDetail.health.staleBoundary")}</div></div>
          </div>
        ) : null}
        {controller.contextActionStatus ? <p className="mb-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{controller.contextActionStatus}</p> : null}

        <div className="grid grid-cols-2 border-y border-border lg:grid-cols-4">
          <HealthFact label={tk("projectDetail.health.contextStatus")} value={status} />
          <HealthFact label={tk("projectDetail.health.lastScan")} value={controller.localDocSnapshot?.scannedAt ?? latestRootScan} />
          <HealthFact label={tk("projectDetail.health.repositorySnapshot")} value={controller.repoSnapshot?.generatedAt ?? null} />
          <HealthFact label={tk("projectDetail.health.affected")} value={String(activeAffected.length)} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <h3 className="text-sm font-semibold">{tk("projectDetail.health.cause")}</h3>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {changedEvidence.length ? changedEvidence.map((line, index) => <div className="border-l-2 border-primary/40 pl-3" key={`${line}-${index}`}>{line}</div>) : <div>{status === "FRESH" ? tk("projectDetail.health.fresh") : tk("projectDetail.health.noEvidence")}</div>}
              {localDocsChanged ? <div>{tk("projectDetail.health.changedEvidence")}</div> : null}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tk("projectDetail.sourceTruth")}</h3>
            <div className="mt-3 grid gap-2">
              <SourceLink to="/work-orders" label={tk("projectDetail.source.workOrders")} />
              <SourceLink to="/inbox" label={tk("projectDetail.source.inbox")} />
              <SourceLink to="/artifacts" label={tk("projectDetail.source.artifacts")} />
              <SourceLink to="/royal-brief" label={tk("projectDetail.source.brief")} />
            </div>
          </div>
        </div>

        {activeAffected.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{tk("projectDetail.health.affected")}</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {activeAffected.slice(0, 6).map((order) => (
                <Link className="flex min-h-11 items-start justify-between gap-3 rounded-md border border-border bg-muted/15 px-3 py-2 text-sm transition hover:border-primary/50" key={order.id} to="/work-orders">
                  <span className="min-w-0 break-words">{order.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{"contextBindingStatus" in order ? order.contextBindingStatus : "Review"}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ContextBindingStatusDto }) {
  const Icon = status === "FRESH" ? CheckCircle2 : status === "STALE" ? AlertTriangle : ShieldAlert;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", contextStatusClass(status))} title={status}><Icon className="h-3.5 w-3.5" />{status}</span>;
}

function HealthFact({ label, value }: { label: string; value: string | null }) {
  const tk = useTk();
  const displayValue = value && /^\d{4}-/.test(value) ? formatDate(value) : value ?? tk("projectDetail.notAvailable");
  return <div className="min-w-0 border-b border-r border-border px-3 py-3 last:border-r-0 lg:border-b-0"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-semibold">{displayValue}</div></div>;
}

function SourceLink({ to, label }: { to: string; label: string }) {
  const Icon = label.includes("Brief") ? FileText : label.includes("Artifacts") ? GitBranch : label.includes("Work") ? FolderKanban : ArrowUpRight;
  return <Link to={to} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition hover:border-primary/50 hover:bg-primary/5"><span>{label}</span><Icon className="h-4 w-4 text-primary" /></Link>;
}
