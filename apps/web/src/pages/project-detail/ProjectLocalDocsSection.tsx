import { FileSearch, Plus, ScanSearch } from "lucide-react";
import { PageSection } from "@/components/ui/PageSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectDetailController } from "./useProjectDetailController";

export function ProjectLocalDocsSection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const snapshot = controller.localDocSnapshot;
  return (
    <div className="scroll-mt-5" id="local-docs">
      <PageSection
        icon={FileSearch}
        title={tk("projectDetail.section.localDocs")}
        description={snapshot ? tk("projectDetail.localDocs.lastScanned", { date: formatDate(snapshot.scannedAt), status: snapshot.scanStatus, stale: snapshot.isStale ? " · STALE" : "" }) : tk("projectDetail.localDocs.emptySnapshot")}
        action={controller.canEditLocalDocs ? <Button className="min-h-11" variant="outline" onClick={() => controller.setShowAddRootForm(!controller.showAddRootForm)}><Plus className="h-4 w-4" />{controller.showAddRootForm ? tk("projects.cancel") : tk("projectDetail.localDocs.addRoot")}</Button> : undefined}
      >
        <div className="rounded-lg border border-border bg-card p-5">
          {controller.localDocsError ? <p className="mb-4 text-sm text-red-400">{controller.localDocsError}</p> : null}
          {controller.showAddRootForm ? (
            <div className="mb-5 grid gap-2 border-b border-border pb-5 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder={tk("projectDetail.localDocs.rootNamePlaceholder")} value={controller.newRootName} onChange={(event) => controller.setNewRootName(event.target.value)} />
              <Input placeholder={tk("projectDetail.localDocs.rootPathPlaceholder")} value={controller.newRootPath} onChange={(event) => controller.setNewRootPath(event.target.value)} />
              <Button className="min-h-11" onClick={() => void controller.addLocalDocRoot()} disabled={controller.addingRoot || !controller.newRootName.trim() || !controller.newRootPath.trim()}>{controller.addingRoot ? tk("projectDetail.localDocs.adding") : tk("projectDetail.localDocs.add")}</Button>
            </div>
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {controller.localDocRoots.length === 0 ? <p className="text-sm text-muted-foreground">{tk("projectDetail.localDocs.noRoots")}</p> : controller.localDocRoots.map((root) => (
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-muted/15 p-3" key={root.id}>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-semibold">{root.name}</span><span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{root.isActive ? tk("projectDetail.localDocs.active") : tk("projectDetail.localDocs.inactive")}</span></div><p className="mt-1 text-xs text-muted-foreground">{tk("projectDetail.localDocs.rootLastScanned", { date: root.lastScannedAt ? formatDate(root.lastScannedAt) : tk("projectDetail.localDocs.never") })}</p>{root.lastError ? <p className="mt-1 text-xs text-red-400">{root.lastError}</p> : null}</div>
                {controller.canEditLocalDocs ? <Button className="min-h-11" aria-label={`Scan Now: ${root.name}`} variant="outline" onClick={() => void controller.scanLocalDocsRoot(root.id)} disabled={controller.localDocsScanningRootId === root.id}><ScanSearch className={cn("h-4 w-4", controller.localDocsScanningRootId === root.id && "animate-spin")} />{controller.localDocsScanningRootId === root.id ? tk("projectDetail.scanning") : tk("projectDetail.localDocs.scanNow")}</Button> : null}
              </div>
            ))}
          </div>

          {snapshot ? <SnapshotEvidence snapshot={snapshot} /> : null}

          {controller.isKing && controller.localDocRoots.length > 0 ? (
            <details className="mt-5 border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-semibold">{tk("projectDetail.localDocs.previewTitle")}</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select aria-label={tk("projectDetail.localDocs.rootSelect")} className="h-11 rounded-md border border-border bg-background px-3 text-sm" value={controller.previewRootId ?? ""} onChange={(event) => controller.setPreviewRootId(event.target.value || null)}><option value="">{tk("projectDetail.localDocs.selectRoot")}</option>{controller.localDocRoots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}</select>
                <Input placeholder={tk("projectDetail.localDocs.relativePathPlaceholder")} value={controller.previewPath} onChange={(event) => controller.setPreviewPath(event.target.value)} />
                <Button className="min-h-11" onClick={() => void controller.previewLocalDocFile()} disabled={controller.previewLoading || !controller.previewRootId || !controller.previewPath.trim()}>{controller.previewLoading ? tk("projectDetail.localDocs.loading") : tk("projectDetail.localDocs.preview")}</Button>
              </div>
              {controller.previewError ? <p className="mt-2 text-sm text-red-400">{controller.previewError}</p> : null}
              {controller.previewContent !== null ? <Textarea className="mt-3 min-h-64 font-mono text-xs" value={controller.previewContent} readOnly /> : null}
            </details>
          ) : null}
        </div>
      </PageSection>
    </div>
  );
}

function SnapshotEvidence({ snapshot }: { snapshot: NonNullable<ProjectDetailController["localDocSnapshot"]> }) {
  const tk = useTk();
  const scanSummary = `${snapshot.fileCount} files scanned (${snapshot.totalBytes} bytes).`;
  return (
    <details className="mt-5 min-w-0 rounded-md border border-border bg-muted/10 p-4">
      <summary className="cursor-pointer text-sm font-semibold">{tk("projectDetail.localDocs.scanEvidence")}</summary>
      <p className="mt-2 text-sm text-muted-foreground">{scanSummary}</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        <Evidence title={tk("projectDetail.localDocs.importantDocs")} value={snapshot.importantFiles.length ? snapshot.importantFiles.map((file) => file.relativePath).join(", ") : tk("projectDetail.localDocs.noneFound")} />
        <Evidence title={tk("projectDetail.localDocs.detectedStack")} value={snapshot.detectedStack?.length ? snapshot.detectedStack.join(", ") : tk("projectDetail.localDocs.notDetected")} />
        <Evidence title={tk("projectDetail.localDocs.riskZones")} value={snapshot.riskZones?.length ? snapshot.riskZones.map((zone) => `${zone.relativePath} (${zone.riskLevel}): ${zone.reason}`).join(" · ") : tk("projectDetail.localDocs.noneFlagged")} />
        <div className="min-w-0 md:col-span-3"><h3 className="text-xs font-semibold">{tk("projectDetail.localDocs.packageScripts")}</h3>{snapshot.packageScripts && Object.keys(snapshot.packageScripts).length ? <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto break-all pr-2 text-sm text-muted-foreground">{Object.entries(snapshot.packageScripts).map(([key, value]) => <li key={key}>- {key}: {value}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">{tk("projectDetail.localDocs.noneDetected")}</p>}</div>
        {snapshot.summary && snapshot.summary !== scanSummary ? <div className="md:col-span-3"><h3 className="text-xs font-semibold">{tk("projectDetail.localDocs.summary")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{snapshot.summary}</p></div> : null}
      </div>
    </details>
  );
}

function Evidence({ title, value }: { title: string; value: string }) { return <div className="min-w-0"><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1 max-h-64 overflow-y-auto break-all pr-2 text-sm leading-6 text-muted-foreground">{value}</p></div>; }
