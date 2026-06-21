import { Archive, Boxes, Download, FileText, GitBranch, Layers3, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { PageSection } from "@/components/ui/PageSection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectDetailController } from "./useProjectDetailController";

export function ProjectSectionNavigation() {
  const tk = useTk();
  const items = [["overview", tk("projectDetail.section.overview")], ["work", tk("projectDetail.section.work")], ["local-docs", tk("projectDetail.section.localDocs")], ["repository", tk("projectDetail.section.repository")], ["artifacts", tk("projectDetail.section.artifacts")], ["export", tk("projectDetail.section.export")]] as const;
  return <nav aria-label={tk("projectDetail.sectionsAria")} className="mb-8 grid grid-cols-3 gap-1 border-b border-border pb-2 sm:flex sm:overflow-x-auto">{items.map(([id, label]) => <a className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-md px-2 text-center text-sm text-muted-foreground transition hover:bg-muted/30 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:shrink-0 sm:px-3" href={`#${id}`} key={id}>{label}</a>)}</nav>;
}

export function ProjectOverviewSection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const project = controller.project!;
  return <SectionFrame id="overview"><PageSection icon={Layers3} title={tk("projectDetail.section.overview")} description={tk("projectDetail.overview.description")}><div className="rounded-lg border border-border bg-card p-5"><div className="flex flex-wrap gap-2 text-xs"><Tag value={project.status} /><Tag value={project.priority} />{project.activeMilestone ? <Tag value={project.activeMilestone} /> : null}</div><div className="mt-5 grid gap-6 lg:grid-cols-2"><EvidenceList title={tk("projectDetail.overview.goals")} items={project.goals} empty={tk("projectDetail.noneRecorded")} /><EvidenceList title={tk("projectDetail.overview.decisions")} items={controller.decisions.map((memory) => memory.title)} empty={tk("projectDetail.noneRecorded")} /></div></div></PageSection></SectionFrame>;
}

export function ProjectWorkSection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const data = controller.data!;
  const groups = [
    [tk("projectDetail.work.tasks"), data.tasks.map((task) => `${task.title} (${task.status})`), "/throne-room"],
    [tk("projectDetail.work.matters"), data.matters.map((matter) => `${matter.title} (${matter.priority} / ${matter.status})`), "/matters"],
    [tk("projectDetail.work.workOrders"), data.workOrders.map((order) => `${order.title} (${order.status})`), "/work-orders"],
    [tk("projectDetail.work.reports"), data.reports.map((report) => `${report.title} (${formatDate(report.updatedAt)})`), "/reports"],
    [tk("projectDetail.work.memories"), data.memories.map((memory) => `${memory.title} (${memory.type})`), "/memory"]
  ] as const;
  return <SectionFrame id="work"><PageSection icon={Boxes} title={tk("projectDetail.section.work")} description={tk("projectDetail.work.description")}><div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">{groups.map(([title, items, to]) => <LinkedList key={title} title={title} items={items} to={to} />)}</div></PageSection></SectionFrame>;
}

export function ProjectRepositorySection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const snapshot = controller.repoSnapshot;
  return <SectionFrame id="repository"><PageSection icon={GitBranch} title={tk("projectDetail.section.repository")} description={snapshot ? tk("projectDetail.repository.generated", { date: formatDate(snapshot.generatedAt) }) : tk("projectDetail.repository.emptyDescription")} action={<Button className="min-h-11" variant="outline" onClick={() => void controller.scanRepository()} disabled={controller.repoScanning}><ScanSearch className={cn("h-4 w-4", controller.repoScanning && "animate-spin")} />{controller.repoScanning ? tk("projectDetail.scanning") : tk("projectDetail.repository.scan")}</Button>}><div className="min-w-0 rounded-lg border border-border bg-card p-5">{controller.repoError ? <p className="mb-4 text-sm text-red-400">{controller.repoError}</p> : null}{snapshot ? <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3"><RepoFact label={tk("projectDetail.repository.framework")} value={snapshot.framework} /><RepoFact label={tk("projectDetail.repository.runtime")} value={snapshot.language} /><RepoFact label={tk("projectDetail.repository.packageManager")} value={snapshot.packageManager} />{snapshot.summary ? <div className="min-w-0 md:col-span-3"><h3 className="text-xs font-semibold">{tk("projectDetail.repository.summary")}</h3><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{snapshot.summary}</p></div> : null}<details className="min-w-0 rounded-md border border-border bg-muted/10 p-4 md:col-span-3"><summary className="cursor-pointer text-sm font-semibold">{tk("projectDetail.repository.structure")}</summary><div className="mt-4 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3"><RepoFact label={tk("projectDetail.repository.prisma")} value={snapshot.prismaModels.join(", ") || null} /><RepoFact label={tk("projectDetail.repository.modules")} value={snapshot.modules.join(", ") || null} /><RepoFact label={tk("projectDetail.repository.services")} value={snapshot.services.join(", ") || null} /></div></details></div> : <EmptyEvidence text={tk("projectDetail.repository.empty")} />}</div></PageSection></SectionFrame>;
}

export function ProjectArtifactsSection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  return <SectionFrame id="artifacts"><PageSection icon={Archive} title={tk("projectDetail.section.artifacts")} description={tk("projectDetail.artifacts.description")} action={<Link className="inline-flex min-h-11" to="/artifacts"><Button className="min-h-11" variant="outline">{tk("projectDetail.artifacts.open")}</Button></Link>}><div className="rounded-lg border border-border bg-card p-5"><EvidenceList title={tk("projectDetail.artifacts.title")} items={controller.data!.artifacts.map((artifact) => `${artifact.title} (${artifact.type})`)} empty={tk("projectDetail.noneLinked")} /></div></PageSection></SectionFrame>;
}

export function ProjectExportSection({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const payload = controller.exportPayload;
  return <SectionFrame id="export"><PageSection icon={Download} title={tk("projectDetail.section.export")} description={tk("projectDetail.export.description")} action={<Button className="min-h-11" variant="outline" onClick={() => void controller.exportObsidian()} disabled={controller.exportLoading}><Download className="h-4 w-4" />{controller.exportLoading ? tk("projectDetail.export.exporting") : tk("projectDetail.export.action")}</Button>}><div className="rounded-lg border border-border bg-card p-5">{payload ? <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]"><div className="space-y-2">{Object.keys(payload.files).map((name) => <div className="break-words rounded-md border border-border bg-muted/20 px-3 py-2 text-xs" key={name}>{name}</div>)}</div><Textarea className="min-h-80 font-mono text-xs" value={Object.entries(payload.files).map(([name, content]) => `# ${name}\n\n${content}`).join("\n\n---\n\n")} readOnly /></div> : <EmptyEvidence text={tk("projectDetail.export.empty")} />}</div></PageSection></SectionFrame>;
}

export function ProjectMetricStrip({ controller }: { controller: ProjectDetailController }) {
  const tk = useTk();
  const counts = controller.data!.overview.counts;
  const metrics = [[tk("projectDetail.metric.tasks"), counts.tasks], [tk("projectDetail.metric.matters"), counts.matters], [tk("projectDetail.metric.workOrders"), counts.workOrders], [tk("projectDetail.metric.artifacts"), counts.artifacts]] as const;
  return <div className="mb-5 grid grid-cols-2 border-y border-border lg:grid-cols-4">{metrics.map(([label, value], index) => <div className={cn("px-4 py-3", index % 2 === 0 && "border-r border-border", index > 1 && "border-t border-border lg:border-t-0", index > 0 && "lg:border-l lg:border-border lg:border-r-0")} key={label}><div className="text-xl font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{label}</div></div>)}</div>;
}

function SectionFrame({ id, children }: { id: string; children: React.ReactNode }) { return <div className="scroll-mt-5" id={id}>{children}</div>; }
function Tag({ value }: { value: string }) { return <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground" title={value}>{value}</span>; }
function EvidenceList({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <div className="min-w-0"><h3 className="text-xs font-semibold">{title}</h3><div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">{items.length ? items.map((item, index) => <div className="break-words border-l-2 border-primary/30 pl-3 text-sm leading-6 text-muted-foreground" key={`${title}-${index}`}>{item}</div>) : <p className="text-sm text-muted-foreground">{empty}</p>}</div></div>; }
function LinkedList({ title, items, to }: { title: string; items: readonly string[]; to: string }) { const tk = useTk(); return <div className="min-w-0 rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{title}</h3><Link className="inline-flex min-h-11 items-center text-xs text-primary hover:underline" to={to}>{tk("projectDetail.openSource")}</Link></div><div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{items.length ? items.map((item, index) => <div className="break-words rounded-md bg-muted/20 px-3 py-2 text-sm text-muted-foreground" key={`${title}-${index}`}>{item}</div>) : <p className="text-sm text-muted-foreground">{tk("projectDetail.noneLinked")}</p>}</div></div>; }
function RepoFact({ label, value }: { label: string; value: string | null }) { const tk = useTk(); return <div className="min-w-0"><h3 className="text-xs font-semibold">{label}</h3><p className="mt-1 max-h-64 overflow-y-auto break-all pr-2 text-sm leading-6 text-muted-foreground">{value ?? tk("projectDetail.notAvailable")}</p></div>; }
function EmptyEvidence({ text }: { text: string }) { return <div className="flex items-center gap-3 text-sm text-muted-foreground"><FileText className="h-5 w-5 text-primary" />{text}</div>; }
