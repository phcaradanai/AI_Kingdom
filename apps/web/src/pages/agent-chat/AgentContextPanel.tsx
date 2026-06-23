import { Archive, Bot, ExternalLink, FolderKanban, Route, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DirectAgentSaveMode } from "@/types/api";
import { requestOptions, saveOptions } from "./agentChatModels";
import type { AgentChatController } from "./useAgentChatController";

export function AgentContextPanel({ controller }: { controller: AgentChatController }) {
  const tk = useTk();
  const activeSave = saveOptions.find((option) => option.value === controller.saveMode) ?? saveOptions[0]!;
  return <aside aria-label={tk("agentChat.context.aria")} className="h-full min-h-[560px] min-w-0 overflow-y-auto border border-border bg-card/45 xl:min-h-0">
    <div className="space-y-5 p-4">
      <section><SectionTitle icon={Route} title={tk("agentChat.context.requestMode")} /><div className="grid grid-cols-2 gap-2">
        {requestOptions.map((option) => { const Icon = option.icon; return <button aria-pressed={controller.requestType === option.value} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 border px-2 text-xs font-semibold transition-colors", controller.requestType === option.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-background/35 text-muted-foreground hover:text-foreground")} key={option.value} onClick={() => controller.setRequestType(option.value)} type="button"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{tk(option.labelKey)}</span></button>; })}
      </div></section>

      <section className="space-y-2"><label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="agent-chat-title">{tk("agentChat.context.title")}</label><Input disabled={Boolean(controller.selectedSession)} id="agent-chat-title" placeholder={tk("agentChat.context.titlePlaceholder")} value={controller.title} onChange={(event) => controller.setTitle(event.target.value)} /></section>

      <section className="space-y-2"><label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground" htmlFor="agent-chat-project"><FolderKanban className="h-3.5 w-3.5" />{tk("agentChat.context.project")}</label><select className="h-11 w-full min-w-0 border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" disabled={Boolean(controller.selectedSession)} id="agent-chat-project" value={controller.projectId} onChange={(event) => controller.setProjectId(event.target.value)}><option value="">{tk("agentChat.context.noProject")}</option>{controller.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></section>

      <section className="space-y-2"><label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground" htmlFor="agent-chat-save"><Archive className="h-3.5 w-3.5" />{tk("agentChat.context.save")}</label><select className="h-11 w-full min-w-0 border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" id="agent-chat-save" value={controller.saveMode} onChange={(event) => controller.setSaveMode(event.target.value as DirectAgentSaveMode)}>{saveOptions.map((option) => <option key={option.value} value={option.value}>{tk(option.labelKey)}</option>)}</select><p className="text-xs leading-5 text-muted-foreground">{tk(activeSave.descriptionKey)}</p></section>

      {controller.selectedSession ? <section className="border-l-2 border-primary bg-primary/5 px-3 py-3"><SectionTitle icon={Bot} title={tk("agentChat.context.sessionEvidence")} /><dl className="mt-3 space-y-2 text-xs"><Evidence label={tk("agentChat.context.status")} value={controller.selectedSession.status} /><Evidence label={tk("agentChat.context.provider")} value={controller.selectedSession.providerName ?? tk("agentChat.source.none")} /><Evidence label={tk("agentChat.context.model")} value={controller.selectedSession.modelUsed ?? tk("agentChat.source.none")} /></dl>{controller.selectedSession.fallbackNotice ? <p className="mt-3 border border-amber-400/30 bg-amber-400/10 p-2 text-xs leading-5 text-amber-200">{controller.selectedSession.fallbackNotice}</p> : null}</section> : null}

      <section aria-label={tk("agentChat.source.aria")} className="border-t border-border pt-4"><SectionTitle icon={ShieldCheck} title={tk("agentChat.source.title")} /><p className="mt-2 text-xs leading-5 text-muted-foreground">{tk("agentChat.source.description")}</p><div className="mt-3 space-y-1">
        <OwnerLink href="/agents" label={tk("agentChat.source.agentRegistry")} />
        <OwnerLink href={controller.projectId ? `/projects/${controller.projectId}` : "/projects"} label={tk("agentChat.source.projectWorkspace")} />
        <OwnerLink href="/artifacts" label={tk("agentChat.source.artifactArchive")} />
        <OwnerLink href="/knowledge-lab/candidates" label={tk("agentChat.source.knowledgeCandidates")} />
      </div>
      {controller.selectedSession ? <div className="mt-3 border-t border-border pt-3"><SourceRow href={controller.selectedSession.latestTraceId ? `/usage-traces/${controller.selectedSession.latestTraceId}` : null} label={tk("agentChat.source.trace")} openLabel={tk("agentChat.source.openTrace")} /><SourceRow href={controller.selectedSession.artifactId ? "/artifacts" : null} label={tk("agentChat.source.artifact")} openLabel={tk("agentChat.source.openArtifact")} /><SourceRow href={controller.selectedSession.knowledgeCandidateId ? "/knowledge-lab/candidates" : null} label={tk("agentChat.source.knowledge")} openLabel={tk("agentChat.source.openKnowledge")} /></div> : null}
      </section>
    </div>
  </aside>;
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Archive; title: string }) { return <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{title}</div>; }
function Evidence({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 items-start justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-foreground">{value}</dd></div>; }
function OwnerLink({ href, label }: { href: string; label: string }) { return <Link className="flex min-h-11 items-center justify-between gap-3 px-2 text-sm text-foreground transition-colors hover:bg-muted/45" to={href}><span>{label}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" /></Link>; }
function SourceRow({ href, label, openLabel }: { href: string | null; label: string; openLabel: string }) { const tk = useTk(); return <div className="flex min-h-10 items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span>{href ? <Link aria-label={openLabel} className="inline-flex min-h-10 items-center gap-1 px-2 font-semibold text-primary hover:bg-primary/10" to={href}>{tk("agentChat.source.open")}<ExternalLink className="h-3 w-3" /></Link> : <span className="text-muted-foreground">{tk("agentChat.source.none")}</span>}</div>; }
