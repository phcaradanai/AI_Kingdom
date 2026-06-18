import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardCheck, Cpu, ExternalLink, FileText, Handshake, Hammer, Layers, ScrollText, Search, Send, Server, ShieldCheck, Sparkles, Clock3, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LivingKingdomView } from "@/components/kingdom/LivingKingdomView";
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
import type { CouncilResponseDto, CouncilSessionDto, TaskDto, TaskMode } from "@/types/api";

const modes: Array<{ value: TaskMode; label: string; description: string; useWhen: string }> = [
  { value: "ASK", label: "ASK", description: "Use for a focused answer, decision, or quick strategic read.", useWhen: "Best when the King needs counsel, not a project plan." },
  { value: "PLAN", label: "PLAN", description: "Use for roadmaps, milestones, dependencies, and sequencing.", useWhen: "Best before creating work orders or coordinating agents." },
  { value: "RESEARCH", label: "RESEARCH", description: "Use for evidence gathering, tradeoffs, market checks, and options.", useWhen: "Best when the council should investigate before recommending." },
  { value: "BUILD", label: "BUILD", description: "Use for implementation-ready scope, risks, validation, and handoff.", useWhen: "Best before a manual external-agent handoff." }
];

const councilRoles = [
  { role: "Royal Archivist", label: "Archivist Evidence Report", icon: BookOpen },
  { role: "Royal Researcher", label: "Researcher Hypotheses", icon: Search },
  { role: "Royal Architect", label: "Architect Patch Plan", icon: ShieldCheck },
  { role: "Royal General", label: "General Execution Checklist", icon: ClipboardCheck },
  { role: "Grand Vizier", label: "Grand Vizier Final Decision", icon: FileText }
] as const;

type ThroneView = "live" | "command";

// Throne Room is now visual-first: the Living Kingdom is the default view, with the
// full decree/council terminal preserved one click away under "Command".
export function ThroneRoomPage() {
  // Plain navigation lands on the visual Live Kingdom; action-intent links that mean
  // "issue/inspect a decree" deep-link with ?view=command so that flow is unchanged.
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<ThroneView>(searchParams.get("view") === "command" ? "command" : "live");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          aria-pressed={view === "live"}
          onClick={() => setView("live")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            view === "live" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Live Kingdom
        </button>
        <button
          type="button"
          aria-pressed={view === "command"}
          onClick={() => setView("command")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            view === "command" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ScrollText className="h-4 w-4" />
          Command
        </button>
      </div>

      {view === "live" ? <LivingKingdomView /> : <ThroneRoomCommand />}
    </div>
  );
}

// The decree/council terminal — preserved verbatim as the "Command" view of the
// Throne Room. The page below makes the Living Kingdom the default visual view.
function ThroneRoomCommand() {
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<TaskMode>("ASK");
  const [error, setError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffWorkOrder, setHandoffWorkOrder] = useState<{ id?: string; contextBindingStatus?: string } | null>(null);
  const [isCreatingHandoff, setIsCreatingHandoff] = useState(false);
  const [createdWorkOrderIds, setCreatedWorkOrderIds] = useState<string[]>([]);
  const [workOrderMessage, setWorkOrderMessage] = useState<string | null>(null);
  const [workOrderError, setWorkOrderError] = useState<string | null>(null);
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false);
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

  async function createWorkOrder() {
    if (!latestSession) return;
    setWorkOrderMessage(null);
    setWorkOrderError(null);
    setIsCreatingWorkOrder(true);
    try {
      const result = await api.planCouncilWorkOrder(latestSession.id);
      setCreatedWorkOrderIds(result.draftedWorkOrderIds);
      setWorkOrderMessage(
        result.drafted > 0
          ? `${result.drafted} work order${result.drafted === 1 ? "" : "s"} drafted from the council recommendation.`
          : "No new work orders were drafted; existing items may already cover this recommendation."
      );
    } catch (workOrderError) {
      setWorkOrderError(workOrderError instanceof Error ? workOrderError.message : "Unable to create work order from council recommendation");
    } finally {
      setIsCreatingWorkOrder(false);
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
          <div className="mb-5 flex flex-col gap-2 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl">Royal Decree</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose how the council should treat this command before issuing it.</p>
            </div>
            <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Issue Decree stays the primary action
            </div>
          </div>

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
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="font-display tracking-wide text-base">{item.label}</div>
                  {mode === item.value && <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="mt-2 text-sm opacity-90 leading-relaxed">{item.description}</div>
                <div className="mt-3 rounded-md border border-current/10 bg-background/30 px-2.5 py-2 text-xs opacity-80 leading-relaxed">{item.useWhen}</div>
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
            <div className="mt-8 space-y-5">
              <CouncilProgressPanel session={latestSession} />

              {latestSession.finalSummary && (
                <FinalRecommendationPanel session={latestSession} />
              )}

              <RecommendedNextStepCard
                task={latestTask}
                session={latestSession}
                createdWorkOrderIds={createdWorkOrderIds}
                handoffWorkOrderId={handoffWorkOrder?.id}
                isCreatingWorkOrder={isCreatingWorkOrder}
                isCreatingHandoff={isCreatingHandoff}
                onCreateWorkOrder={createWorkOrder}
                onCreateHandoff={createHandoff}
              />

              <CouncilSourceLinks
                task={latestTask}
                session={latestSession}
                createdWorkOrderIds={createdWorkOrderIds}
                handoffWorkOrderId={handoffWorkOrder?.id}
              />

              {extractContextWarning(latestSession.finalSummary) && (
                <ContextWarningPanel warning={extractContextWarning(latestSession.finalSummary) ?? ""} />
              )}

              {workOrderMessage && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{workOrderMessage}</div>
              )}
              {workOrderError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{workOrderError}</div>
              )}
              {handoffMessage && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{handoffMessage}</div>
              )}
              {handoffError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{handoffError}</div>
              )}
              {handoffWorkOrder && (handoffWorkOrder.contextBindingStatus === "STALE" || handoffWorkOrder.contextBindingStatus === "MISSING") && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <span className="font-semibold">Context not fresh</span> - run a local docs scan on the linked project before creating SANDBOX_PATCH jobs.
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg text-primary">Role-Based Council</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Role identity stays visible while long reports stay collapsed until review.</p>
                  </div>
                </div>
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
          <div className="grid auto-rows-fr gap-5 xl:grid-cols-2">
            {tasks.slice(0, 6).map((task) => (
              <RecentDecreeCard key={task.id} task={task} />
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

function RecentDecreeCard({ task }: { task: TaskDto }) {
  const latestSummary = task.sessions[0]?.finalSummary ?? null;
  const contextWarning = extractContextWarning(latestSummary);
  const cleanSummary = latestSummary ? stripContextWarning(latestSummary) : null;
  const summaryPreview = cleanSummary
    ? plainPreviewText(cleanSummary)
    : contextWarning
    ? "Council completed with an automation context gate. Run local docs scan before SANDBOX_PATCH."
    : "";

  return (
    <SectionCard className="h-full transition-all hover:border-primary/30 hover:shadow-sm" contentClassName="flex h-full min-h-[300px] flex-col p-5">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words text-lg font-semibold leading-snug transition-colors group-hover:text-primary">{task.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{task.mode}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(task.createdAt)}</span>
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <div className="min-h-[76px] rounded-md border border-border/50 bg-muted/20 p-3">
        <p className="line-clamp-2 break-words text-sm leading-relaxed text-foreground/70">{task.command}</p>
      </div>

      {latestSummary ? (
        <div className="relative mt-4 flex min-h-[118px] flex-1 flex-col overflow-hidden rounded-md border border-primary/20 bg-primary/5 p-4 pl-5">
          <div className="absolute bottom-0 left-0 top-0 w-1 bg-primary/40"></div>
          {contextWarning && (
            <div className="mb-2 inline-flex w-fit items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Context warning: automation gate
            </div>
          )}
          <p className="line-clamp-3 break-words text-sm leading-relaxed text-foreground/90">{summaryPreview}</p>
        </div>
      ) : (
        <div className="mt-4 flex min-h-[84px] flex-1 items-center rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {task.status === "RUNNING" ? "Grand Vizier convening..." : "Awaiting council."}
        </div>
      )}
    </SectionCard>
  );
}

function CouncilProgressPanel({ session }: { session: CouncilSessionDto }) {
  return (
    <div className="rounded-xl border border-border bg-background/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-primary">Council Progress</h3>
          <p className="mt-1 text-sm text-muted-foreground">{getCouncilProgressMessage(session)}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {councilRoles.map((role) => {
          const Icon = role.icon;
          const status = getRoleStatus(session, role.role);
          const StatusIcon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : Clock3;
          return (
            <div key={role.role} className="rounded-lg border border-border/70 bg-muted/15 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 text-primary" />
                {role.role.replace("Royal ", "")}
              </div>
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
                status === "pending" && "border-amber-500/30 bg-amber-500/10 text-amber-300"
              )}>
                <StatusIcon className="h-3 w-3" />
                {status === "completed" ? "Role completed" : status === "failed" ? "Failed role" : "Council convening"}
              </div>
            </div>
          );
        })}
      </div>
      {session.finalSummary && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
          Final synthesis ready
        </div>
      )}
    </div>
  );
}

function FinalRecommendationPanel({ session }: { session: CouncilSessionDto }) {
  if (!session.finalSummary) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-background/60 p-6 backdrop-blur-md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <h3 className="font-display text-lg text-primary flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Final Recommendation
        </h3>
        {session.providerName && (
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3 w-3" />
            {getProviderDisplayName(session.providerName)}
            {session.modelUsed ? ` · ${getModelDisplayName(session.modelUsed)}` : ""}
          </div>
        )}
      </div>
      <MarkdownDocument content={stripContextWarning(session.finalSummary)} className="max-w-none" />
      <div className="mt-6 flex flex-wrap gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
          <span className="font-semibold text-foreground/80">{session.consultedMemoryIds.length}</span> Memories consulted
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/50"></div>
          <span className="font-semibold text-foreground/80">{session.autoSavedMemoryIds.length}</span> Memories auto-saved
        </div>
      </div>
      {session.fallbackNotice && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-medium text-amber-500/90">
          {getProviderTerminologyText(session.fallbackNotice)}
        </div>
      )}
    </div>
  );
}

function RecommendedNextStepCard({
  task,
  session,
  createdWorkOrderIds,
  handoffWorkOrderId,
  isCreatingWorkOrder,
  isCreatingHandoff,
  onCreateWorkOrder,
  onCreateHandoff
}: {
  task: TaskDto;
  session: CouncilSessionDto;
  createdWorkOrderIds: string[];
  handoffWorkOrderId?: string;
  isCreatingWorkOrder: boolean;
  isCreatingHandoff: boolean;
  onCreateWorkOrder: () => void;
  onCreateHandoff: () => void;
}) {
  const nextStep = getRecommendedNextStep(task, session, createdWorkOrderIds.length > 0 || Boolean(handoffWorkOrderId));
  const hasReport = (session.reports?.length ?? 0) > 0 || task.reports.length > 0;
  const canAct = session.status === "COMPLETED";

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] xl:items-start">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/40 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <ArrowRight className="h-3 w-3" />
            Recommended Next Step
          </div>
          <h3 className="break-words font-display text-xl leading-snug">{nextStep.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">{nextStep.description}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <Button type="button" className="h-auto min-h-14 w-full px-4 py-3 text-center leading-snug" disabled={!canAct || isCreatingWorkOrder} onClick={onCreateWorkOrder}>
            <Hammer className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{isCreatingWorkOrder ? "Creating Work Order..." : "Create Work Order"}</span>
          </Button>
          <Button type="button" variant="secondary" className="h-auto min-h-14 w-full px-4 py-3 text-center leading-snug" disabled={!canAct || isCreatingHandoff} onClick={onCreateHandoff}>
            <Handshake className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{isCreatingHandoff ? "Creating Handoff..." : "Create External Agent Handoff"}</span>
          </Button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-primary/20 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        {(createdWorkOrderIds.length > 0 || handoffWorkOrderId) && (
          <Link to="/work-orders" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-2 text-center text-sm font-semibold leading-snug text-primary hover:border-primary/50">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Open Created Work Order</span>
          </Link>
        )}
        <Link to={hasReport ? "/reports" : "/royal-brief"} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-2 text-center text-sm font-semibold leading-snug text-primary hover:border-primary/50">
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{hasReport ? "Open Source Brief / Report" : "Open Royal Brief"}</span>
        </Link>
        {task.projectId && (
          <Link to={`/projects/${task.projectId}`} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-2 text-center text-sm font-semibold leading-snug text-primary hover:border-primary/50">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Open Project Context</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function CouncilSourceLinks({
  task,
  session,
  createdWorkOrderIds,
  handoffWorkOrderId
}: {
  task: TaskDto;
  session: CouncilSessionDto;
  createdWorkOrderIds: string[];
  handoffWorkOrderId?: string;
}) {
  const reportCount = new Set([...(session.reports ?? []), ...task.reports].map((report) => report.id)).size;
  const links = [
    { label: "Council Record", description: "Full council archive and source session.", to: "/council", show: true },
    { label: "Royal Brief", description: "Daily summary remains the generated brief source.", to: "/royal-brief", show: true },
    { label: "Project Context", description: task.projectId ? "Project docs, artifacts, and context binding." : "No project is linked to this decree yet.", to: task.projectId ? `/projects/${task.projectId}` : "/projects", show: true },
    { label: "Work Order", description: createdWorkOrderIds.length > 0 || handoffWorkOrderId ? "Open the implementation queue for the created item." : "Implementation queue for council follow-up.", to: "/work-orders", show: true },
    { label: "Generated Report", description: `${reportCount} report${reportCount === 1 ? "" : "s"} linked to this council.`, to: "/reports", show: reportCount > 0 },
    { label: "Usage Trace", description: "Provider trace for final synthesis.", to: session.finalTraceId ? `/usage-traces/${session.finalTraceId}` : "", show: Boolean(session.finalTraceId) }
  ];

  return (
    <div className="rounded-xl border border-border bg-background/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg text-primary">Source of Truth</h3>
      </div>
      <div className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
        {links.filter((link) => link.show).map((link) => (
          <Link key={link.label} to={link.to} className="group flex min-h-[96px] flex-col justify-between rounded-lg border border-border bg-muted/15 p-3 transition-colors hover:border-primary/45 hover:bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 break-words text-sm font-semibold leading-snug">{link.label}</div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary opacity-70 group-hover:opacity-100" />
            </div>
            <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ContextWarningPanel({ warning }: { warning: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        Context Warning - Automation Gate
      </div>
      <p className="mb-3 text-amber-200/90">
        Council counsel is still available. This warning blocks automation only until project context is fresh.
      </p>
      <div className="mb-3 rounded-md border border-amber-500/20 bg-background/30 px-3 py-2 font-semibold">
        Run local docs scan before SANDBOX_PATCH.
      </div>
      <MarkdownDocument content={warning} className="max-w-none text-sm" />
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
  const [isExpanded, setIsExpanded] = useState(false);
  const response = findRoleResponse(session.responses, role);
  const isGrandVizier = role === "Grand Vizier";
  const content = isGrandVizier
    ? stripContextWarning(session.finalSummary || response?.response || "")
    : response?.response || "";
  const status = getRoleStatus(session, role);
  const references = extractReferences(content || response?.response || "");
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : Clock3;
  const summary = summarizeCouncilContent(content);

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
          {status === "completed" ? "completed" : status === "failed" ? "failed" : "pending"}
        </span>
      </div>

      {content ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed text-foreground/80">
            {summary}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
            {isExpanded ? `Hide ${role} details` : `Show ${role} details`}
          </Button>
          {isExpanded && (
            <div className="rounded-lg border border-border/70 bg-background/60 p-4">
              <MarkdownDocument content={content} className="max-w-none text-sm" />
            </div>
          )}
        </div>
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

type RoleProgressStatus = "completed" | "failed" | "pending";

function getRoleStatus(session: CouncilSessionDto, role: string): RoleProgressStatus {
  const response = findRoleResponse(session.responses, role);
  const isGrandVizier = role === "Grand Vizier";
  if (response || (isGrandVizier && session.finalSummary)) return "completed";
  if (session.status === "FAILED") return "failed";
  return "pending";
}

function getCouncilProgressMessage(session: CouncilSessionDto): string {
  if (session.finalSummary) return "Final synthesis ready. Review the recommendation, then choose a manual follow-up path.";
  if (session.status === "FAILED") return "A council role failed. Review the failed role before creating follow-up work.";
  if (session.status === "RUNNING") return "Council convening. Role updates appear here as they complete.";
  return "Council is queued. The final synthesis will appear here when ready.";
}

function getRecommendedNextStep(task: TaskDto, session: CouncilSessionDto, hasCreatedWorkOrder: boolean) {
  const warning = extractContextWarning(session.finalSummary);
  if (session.status === "FAILED") {
    return {
      title: "Review failed role output",
      description: "Council did not complete cleanly. Use the role reports and council record as the source before creating follow-up work."
    };
  }
  if (session.status !== "COMPLETED") {
    return {
      title: "Wait for final synthesis",
      description: "The council is still convening. Create work orders or handoffs only after the Grand Vizier produces a final recommendation."
    };
  }
  if (warning) {
    return {
      title: "Run local docs scan before SANDBOX_PATCH",
      description: "The council completed, but automation needs fresh project context. Manual review and handoff remain available; patch execution should wait for fresh local docs."
    };
  }
  if (hasCreatedWorkOrder) {
    return {
      title: "Open the created work order",
      description: "A follow-up item now exists in the implementation queue. Use Work Orders as the source of truth for assignment, context, automation, and reports."
    };
  }
  if (task.mode === "BUILD") {
    return {
      title: "Create an implementation handoff",
      description: "This decree was issued in BUILD mode. Create a Work Order or External Agent Handoff so execution stays in the implementation queue."
    };
  }
  return {
    title: "Choose the follow-up path",
    description: "Use Create Work Order for implementation tracking, or create an External Agent Handoff when another coding agent should receive the council brief."
  };
}

function summarizeCouncilContent(content: string): string {
  const cleaned = stripContextWarning(content)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .find((line) => line.length > 20);
  if (!cleaned) return "Role report is ready for review.";
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trim()}...` : cleaned;
}

function plainPreviewText(content: string): string {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .join(" ");
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
