import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Cpu, FileText, Handshake, ScrollText, Search, Send, Server, ShieldCheck, Sparkles, Clock3, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { api } from "@/lib/api";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { CouncilResponseDto, CouncilSessionDto, TaskMode } from "@/types/api";

const modes: Array<{ value: TaskMode; label: string; description: string }> = [
  { value: "ASK", label: "Ask", description: "Clarify a question or decision." },
  { value: "PLAN", label: "Plan", description: "Shape a roadmap or execution path." },
  { value: "RESEARCH", label: "Research", description: "Investigate evidence and options." },
  { value: "BUILD", label: "Build", description: "Prepare implementation work." }
];

const councilRoles = [
  { role: "Royal Archivist", label: "Archivist Evidence Report", icon: BookOpen },
  { role: "Royal Researcher", label: "Researcher Hypotheses", icon: Search },
  { role: "Royal Architect", label: "Architect Patch Plan", icon: ShieldCheck },
  { role: "Royal General", label: "General Execution Checklist", icon: ClipboardCheck },
  { role: "Grand Vizier", label: "Grand Vizier Final Decision", icon: FileText }
] as const;

export function ThroneRoomPage() {
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<TaskMode>("ASK");
  const [error, setError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffWorkOrder, setHandoffWorkOrder] = useState<{ contextBindingStatus?: string } | null>(null);
  const [isCreatingHandoff, setIsCreatingHandoff] = useState(false);
  const submitCommand = useKingdomStore((state) => state.submitCommand);
  const isLoading = useKingdomStore((state) => state.isLoading);
  const isProcessing = useKingdomStore((state) => state.isProcessing);
  const tasks = useKingdomStore((state) => state.tasks);

  const latestTask = tasks[0];
  const latestSession = latestTask?.sessions[0];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!command.trim()) {
      setError("Enter a royal command before issuing a decree.");
      return;
    }
    try {
      await submitCommand(command, mode);
      setCommand("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The throne room could not record the decree");
    }
  }

  async function createHandoff() {
    if (!latestTask || !latestSession) return;
    setHandoffMessage(null);
    setHandoffError(null);
    setHandoffWorkOrder(null);
    setIsCreatingHandoff(true);
    try {
      const response = await api.createCouncilHandoff(latestTask.id, latestSession.id);
      setHandoffWorkOrder(response.workOrder);
      const briefTitle = response.handoffBrief?.title ?? "Existing handoff";
      setHandoffMessage(`External handoff ready: ${briefTitle}`);
    } catch (handoffError) {
      setHandoffError(handoffError instanceof Error ? handoffError.message : "Unable to create external-agent handoff");
    } finally {
      setIsCreatingHandoff(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow="Royal Command Terminal"
        title="Issue a royal decree"
        description="Capture your command and issue a decree. The Grand Vizier will automatically convene the council."
      />

      <SectionCard contentClassName="p-6">
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                  mode === item.value
                    ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(214,170,87,0.1)]"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <div className="font-display tracking-wide text-base">{item.label}</div>
                <div className="mt-1.5 text-xs opacity-80 leading-relaxed">{item.description}</div>
              </button>
            ))}
          </div>
          
          <div className="mt-6 relative">
            <label htmlFor="royal-command" className="mb-2 block text-sm font-semibold uppercase tracking-widest text-primary">Royal Decree</label>
            <Textarea
              id="royal-command"
              className="min-h-[200px] resize-y rounded-xl border-primary/20 bg-background/50 p-5 text-base shadow-inner focus:border-primary/50 focus:ring-primary/20"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="State the royal decree. Example: Plan a six-week launch roadmap for the AI Kingdom MVP..."
            />
            <p className="mt-2 text-xs text-muted-foreground">The decree will be evaluated by the Grand Vizier and the appropriate council members.</p>
            <div className="absolute right-4 bottom-10 opacity-10 pointer-events-none">
               <ScrollText className="h-20 w-20" />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium flex items-center gap-3">
              <div className="rounded-full bg-destructive/20 p-1"><Server className="h-4 w-4" /></div>
              {error}
            </div>
          )}
          
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Mode: <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">{mode}</span>
            </div>
            <Button className="w-full sm:w-auto h-12 px-8 text-sm tracking-wide" disabled={isLoading || isProcessing || !command.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {isProcessing ? "Convening Council..." : isLoading ? "Recording decree..." : "Issue Decree"}
            </Button>
          </div>
        </form>
      </SectionCard>

      {latestTask && (
        <SectionCard 
          className="border-primary/30 bg-primary/5 shadow-[0_0_30px_rgba(214,170,87,0.05)] relative overflow-hidden" 
          contentClassName="p-6 relative z-10"
        >
          <div className="absolute -right-10 -top-10 opacity-5 pointer-events-none">
            <Sparkles className="h-64 w-64 text-primary" />
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  <Sparkles className="mr-1.5 h-3 w-3" />
                  Grand Vizier Terminal
                </span>
                <StatusBadge status={latestTask.status} />
              </div>
              <h2 className="font-display text-2xl font-bold leading-tight">{latestTask.title}</h2>
              <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                {latestTask.status === "COMPLETED"
                  ? "Council has convened and delivered its counsel."
                  : latestTask.status === "RUNNING"
                  ? "Grand Vizier is convening the council..."
                  : "Decree received. Awaiting council."}
              </p>
            </div>
          </div>
          
          {latestSession && (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg text-primary">Role-Based Council</h3>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={latestSession.status !== "COMPLETED" || isCreatingHandoff}
                  onClick={createHandoff}
                >
                  <Handshake className="mr-2 h-4 w-4" />
                  {isCreatingHandoff ? "Creating Handoff..." : "Create External Agent Handoff"}
                </Button>
              </div>

              {extractContextWarning(latestSession.finalSummary) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-300">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Context Warning
                  </div>
                  <MarkdownDocument content={extractContextWarning(latestSession.finalSummary) ?? ""} className="max-w-none text-sm" />
                </div>
              )}

              {handoffMessage && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{handoffMessage}</div>
              )}
              {handoffError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{handoffError}</div>
              )}
              {handoffWorkOrder && (handoffWorkOrder.contextBindingStatus === "STALE" || handoffWorkOrder.contextBindingStatus === "MISSING") && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <span className="font-semibold">Context not fresh</span> — run a local docs scan on the linked project before creating SANDBOX_PATCH jobs.
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                {councilRoles.map((role) => (
                  <CouncilRoleSection
                    key={role.role}
                    session={latestSession}
                    role={role.role}
                    label={role.label}
                    icon={role.icon}
                  />
                ))}
              </div>
            </div>
          )}

          {latestSession?.finalSummary && (
            <div className="mt-8 rounded-xl border border-primary/20 bg-background/60 p-6 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-border/50 pb-4">
                <h3 className="font-display text-lg text-primary flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Final Recommendation
                </h3>
                {latestSession.providerName && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                    <Cpu className="h-3 w-3" />
                    {getProviderDisplayName(latestSession.providerName)}
                    {latestSession.modelUsed ? ` · ${getModelDisplayName(latestSession.modelUsed)}` : ""}
                  </div>
                )}
              </div>
              <MarkdownDocument content={stripContextWarning(latestSession.finalSummary)} className="max-w-none" />
              <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border/50 pt-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
                  <span className="font-semibold text-foreground/80">{latestSession.consultedMemoryIds.length}</span> Memories consulted
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
                  <span className="font-semibold text-foreground/80">{latestSession.autoSavedMemoryIds.length}</span> Memories auto-saved
                </div>
              </div>
              {latestSession.fallbackNotice && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-500/90 font-medium">
                  {getProviderTerminologyText(latestSession.fallbackNotice)}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between border-b border-border/50 pb-4">
          <h2 className="font-display text-2xl">Recent Decrees</h2>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Archive ({tasks.length})</span>
        </div>
        
        {tasks.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {tasks.slice(0, 6).map((task) => (
              <SectionCard key={task.id} className="transition-all hover:border-primary/30 hover:shadow-sm" contentClassName="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div className="max-w-[70%]">
                    <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">{task.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{task.mode}</span>
                      <span>·</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
                
                <p className="line-clamp-2 text-sm leading-relaxed text-foreground/70 bg-muted/20 rounded-md p-3 border border-border/50">{task.command}</p>
                
                {task.sessions[0]?.finalSummary ? (
                  <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40"></div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
                      {task.sessions[0].finalSummary}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    {task.status === "RUNNING" ? "Grand Vizier convening..." : "Awaiting council."}
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon={ScrollText}
            title="No Royal Decrees" 
            description="Your command archive is empty. Issue your first decree above." 
            className="py-12"
          />
        )}
      </section>
    </div>
  );
}

function CouncilRoleSection({
  session,
  role,
  label,
  icon: Icon
}: {
  session: CouncilSessionDto;
  role: string;
  label: string;
  icon: LucideIcon;
}) {
  const response = findRoleResponse(session.responses, role);
  const isGrandVizier = role === "Grand Vizier";
  const content = isGrandVizier
    ? stripContextWarning(session.finalSummary || response?.response || "")
    : response?.response || "";
  const status = response || (isGrandVizier && session.finalSummary)
    ? "completed"
    : session.status === "FAILED"
    ? "failed"
    : "pending";
  const references = extractReferences(content || response?.response || "");
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : Clock3;

  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-primary/20 bg-primary/10 p-1.5 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="font-semibold leading-tight">{label}</div>
            <div className="text-xs text-muted-foreground">{role}</div>
          </div>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
          status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
          status === "pending" && "border-amber-500/30 bg-amber-500/10 text-amber-300"
        )}>
          <StatusIcon className="h-3 w-3" />
          {status}
        </span>
      </div>

      {content ? (
        <MarkdownDocument content={content} className="max-w-none text-sm" />
      ) : (
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
          Awaiting role-specific counsel.
        </div>
      )}

      {references.length > 0 && (
        <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evidence / Context References</div>
          <ul className="space-y-1 text-xs text-foreground/75">
            {references.map((reference, index) => (
              <li key={`${role}-${index}`}>{reference}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function findRoleResponse(responses: CouncilResponseDto[], role: string): CouncilResponseDto | undefined {
  return responses.find((response) => response.role === role || response.agent?.title === role);
}

function extractReferences(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter((line) => /(evidence|context|artifact|log|trace|report|memory|id |observed|failing)/i.test(line))
    .slice(0, 5);
}

function extractContextWarning(summary: string | null | undefined): string | null {
  if (!summary?.includes("[CONTEXT WARNING]")) return null;
  const [, rest = ""] = summary.split("[CONTEXT WARNING]");
  const [warning = ""] = rest.split(/\n\n(?=\S)/);
  return warning.trim() ? warning.trim() : null;
}

function stripContextWarning(summary: string): string {
  if (!summary.includes("[CONTEXT WARNING]")) return summary;
  return summary.replace(/\[CONTEXT WARNING\][\s\S]*?\n\n(?=\S)/, "").trim();
}
