import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardCheck, Cpu, ExternalLink, FileText, Handshake, Hammer, Layers, ScrollText, Search, Send, Server, ShieldCheck, Sparkles, Clock3, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LivingKingdomView } from "@/components/kingdom/LivingKingdomView";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { getModelDisplayName, getProviderDisplayName, getProviderTerminologyText } from "@/lib/providerDisplay";
import { cn, formatDate } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { CouncilResponseDto, CouncilSessionDto, ProjectDto, TaskDto, TaskMode } from "@/types/api";

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
  const tk = useTk();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          aria-pressed={view === "live"}
          onClick={() => setView("live")}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            view === "live" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="h-4 w-4" />
          {tk("throne.liveKingdom")}
        </button>
        <button
          type="button"
          aria-pressed={view === "command"}
          onClick={() => setView("command")}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            view === "command" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ScrollText className="h-4 w-4" />
          {tk("throne.command")}
        </button>
      </div>

      {view === "live" ? <LivingKingdomView /> : <ThroneRoomCommand />}
    </div>
  );
}

// The decree/council terminal — preserved verbatim as the "Command" view of the
// Throne Room. The page below makes the Living Kingdom the default visual view.
function ThroneRoomCommand() {
  const navigate = useNavigate();
  const tk = useTk();
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<TaskMode>("BUILD");
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffWorkOrder, setHandoffWorkOrder] = useState<{ id?: string; contextBindingStatus?: string } | null>(null);
  const [isCreatingHandoff, setIsCreatingHandoff] = useState(false);
  const [createdWorkOrderIds, setCreatedWorkOrderIds] = useState<string[]>([]);
  const [workOrderMessage, setWorkOrderMessage] = useState<string | null>(null);
  const [workOrderError, setWorkOrderError] = useState<string | null>(null);
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false);
  const [isExecutingExternalAgent, setIsExecutingExternalAgent] = useState(false);
  const submitCommand = useKingdomStore((state) => state.submitCommand);
  const isLoading = useKingdomStore((state) => state.isLoading);
  const isProcessing = useKingdomStore((state) => state.isProcessing);
  const tasks = useKingdomStore((state) => state.tasks);
  const settings = useKingdomStore((state) => state.settings);

  const latestTask = tasks[0];
  const latestSession = latestTask?.sessions[0];

  useEffect(() => {
    let cancelled = false;
    api.projects({ status: "ACTIVE" }).then(({ projects: available }) => {
      if (cancelled) return;
      setProjects(available);
      setProjectId((current) => current || available.find((project) => project.name === "AI Kingdom")?.id || available[0]?.id || "");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!command.trim()) {
      setError("Enter a royal command before issuing a decree.");
      return;
    }
    if (mode === "BUILD" && !projectId) {
      setError("Choose a project before issuing a BUILD decree so context can be checked and repaired.");
      return;
    }
    try {
      await submitCommand(command, mode, projectId || null);
      setCommand("");
      if (mode === "BUILD") navigate("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The throne room could not record the decree");
    }
  }

  async function createHandoff() {
    if (!latestTask || !latestSession) return;
    console.info("[CouncilWorkOrderTrace] Button Click", { action: "CREATE_EXTERNAL_HANDOFF", taskId: latestTask.id, sessionId: latestSession.id });
    setHandoffMessage(null);
    setHandoffError(null);
    setHandoffWorkOrder(null);
    setIsCreatingHandoff(true);
    try {
      console.info("[CouncilWorkOrderTrace] API Request", { route: `/api/tasks/${latestTask.id}/council/${latestSession.id}/handoff` });
      const response = await api.createCouncilHandoff(latestTask.id, latestSession.id);
      console.info("[CouncilWorkOrderTrace] API Response", { workOrderId: response.workOrder.id, handoffBriefId: response.handoffBrief?.id ?? null });
      setHandoffWorkOrder(response.workOrder);
      const briefTitle = response.handoffBrief?.title ?? "Existing handoff";
      setHandoffMessage(`External handoff ready: ${briefTitle}`);
      if (response.workOrder?.id) {
        navigate(`/work-orders?focus=${encodeURIComponent(response.workOrder.id)}`);
      }
    } catch (handoffError) {
      setHandoffError(handoffError instanceof Error ? handoffError.message : "Unable to create external-agent handoff");
    } finally {
      setIsCreatingHandoff(false);
    }
  }

  async function createWorkOrder() {
    if (!latestSession) return;
    console.info("[CouncilWorkOrderTrace] Button Click", { action: "CREATE_WORK_ORDER", sessionId: latestSession.id });
    setWorkOrderMessage(null);
    setWorkOrderError(null);
    setIsCreatingWorkOrder(true);
    try {
      console.info("[CouncilWorkOrderTrace] API Request", { route: `/api/council/${latestSession.id}/work-order` });
      const result = await api.planCouncilWorkOrder(latestSession.id);
      console.info("[CouncilWorkOrderTrace] API Response", {
        traceId: result.traceId ?? null,
        drafted: result.drafted,
        skipped: result.skipped,
        createdWorkOrderId: result.createdWorkOrder?.id ?? result.draftedWorkOrderIds[0] ?? null
      });
      setCreatedWorkOrderIds(result.draftedWorkOrderIds);
      const createdId = result.createdWorkOrder?.id ?? result.draftedWorkOrderIds[0];
      if (!createdId) {
        throw new Error(result.skipReason ?? "no Work Order was created");
      }
      setWorkOrderMessage(
        result.drafted > 0
          ? `${result.drafted} work order${result.drafted === 1 ? "" : "s"} created from the council recommendation.`
          : "No new work orders were drafted; existing items may already cover this recommendation."
      );
      navigate(`/work-orders?focus=${encodeURIComponent(createdId)}`);
    } catch (workOrderError) {
      const reason = workOrderError instanceof Error ? workOrderError.message : "Unable to create work order from council recommendation";
      setWorkOrderError(reason.startsWith("Work Order creation failed:") ? reason : `Work Order creation failed: ${reason}`);
    } finally {
      setIsCreatingWorkOrder(false);
    }
  }

  async function executeWithExternalAgent() {
    if (!latestSession) return;
    console.info("[CouncilExternalAgentTrace] Button Click", { action: "CREATE_WORK_ORDER_AND_RUN_EXTERNAL_AGENT", sessionId: latestSession.id });
    setWorkOrderMessage(null);
    setWorkOrderError(null);
    setIsExecutingExternalAgent(true);
    try {
      console.info("[CouncilExternalAgentTrace] API Request", { route: `/api/council/${latestSession.id}/execute-external-agent` });
      const result = await api.executeCouncilWithExternalAgent(latestSession.id);
      console.info("[CouncilExternalAgentTrace] API Response", {
        workOrderId: result.workOrder.id,
        automationJobId: result.job.id,
        automationJobStatus: result.job.status,
        externalAgentRunId: result.externalAgentRun?.id ?? null,
        externalAgentId: result.externalAgent?.id ?? null,
        alreadyScheduled: result.alreadyScheduled
      });
      const ids = result.plannerResult?.draftedWorkOrderIds?.length
        ? result.plannerResult.draftedWorkOrderIds
        : [result.workOrder.id];
      setCreatedWorkOrderIds(ids);
      setWorkOrderMessage(result.message || "External agent execution approved. The Kingdom runner will report back for King review.");
      navigate(`/work-orders?focus=${encodeURIComponent(result.workOrder.id)}`);
    } catch (executionError) {
      const reason = executionError instanceof Error ? executionError.message : "Unable to execute council work with an external agent";
      setWorkOrderError(reason.startsWith("External Agent execution failed:") ? reason : `External Agent execution failed: ${reason}`);
    } finally {
      setIsExecutingExternalAgent(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <PageHeader
        eyebrow={tk("throne.eyebrow")}
        title={tk("throne.title")}
        description={tk("throne.description")}
      />

      <SectionCard className="border-primary/25 bg-card" contentClassName="p-0">
        <form onSubmit={onSubmit} data-testid="royal-decree-composer">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <ScrollText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{tk("throne.composer.title")}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{tk("throne.composer.subtitle")}</p>
                </div>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
                {tk("throne.composer.mode", { mode })}
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 lg:row-span-2">
              <label htmlFor="royal-command" className="mb-2 block text-sm font-semibold text-foreground">{tk("throne.composer.outcome")}</label>
              <Textarea
                id="royal-command"
                className="min-h-[120px] resize-y rounded-lg border-border bg-background/60 p-4 text-base leading-7 shadow-inner transition-colors duration-200 focus:border-primary/60 focus:ring-primary/20 sm:min-h-[176px]"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={tk("throne.composer.placeholder")}
              />

              <label htmlFor="decree-project" className="mt-4 block text-sm font-semibold text-foreground">Project context</label>
              <select
                id="decree-project"
                className="mt-2 h-11 w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required={mode === "BUILD"}
              >
                <option value="">Choose project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">BUILD uses this project’s approved local-doc roots for the context gate.</p>

              {error && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  <div className="rounded-full bg-destructive/20 p-1"><Server className="h-4 w-4" /></div>
                  {error}
                </div>
              )}
            </div>

            <div className="order-2 flex flex-col gap-3 border-t border-border pt-4 lg:col-start-2 lg:row-start-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="break-words">{tk("throne.safety")}</span>
              </div>
              <Button className="h-12 w-full px-8 text-sm" disabled={isLoading || isProcessing || !command.trim()}>
                <Send className="mr-2 h-4 w-4" />
                {isProcessing ? tk("throne.convening") : isLoading ? tk("throne.recording") : tk("throne.issue")}
              </Button>
            </div>

            <div className="order-3 flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-muted/15" aria-label={tk("throne.workflow.label")}>
                {[tk("throne.workflow.decree"), tk("throne.workflow.council"), tk("throne.workflow.gatedWork"), tk("throne.workflow.report")].map((stage, index) => (
                  <div
                    key={stage}
                    className={cn(
                      "flex min-h-11 items-center gap-2 border-border px-3 py-2 text-xs font-medium text-muted-foreground",
                      index % 2 === 0 && "border-r",
                      index < 2 && "border-b"
                    )}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] tabular-nums text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 break-words">{stage}</span>
                  </div>
                ))}
              </div>

              <details className="group rounded-lg border border-border bg-background/35">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">{tk("throne.advancedMode")}</span>
                    <span className="font-mono text-xs text-muted-foreground">{mode}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1" role="group" aria-label={tk("throne.mode.group")}>
                    {modes.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-label={tk("throne.mode.use", { mode: item.label })}
                        aria-pressed={mode === item.value}
                        onClick={() => setMode(item.value)}
                        className={cn(
                          "min-h-11 rounded-md border px-3 py-2 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:translate-y-px",
                          mode === item.value
                            ? "border-primary/60 bg-primary/[0.12] text-primary shadow-sm"
                            : "border-border bg-muted/10 text-muted-foreground hover:border-primary/35 hover:bg-muted/25 hover:text-foreground"
                        )}
                      >
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 block text-xs leading-5">{tk(`throne.mode.${item.value}.description`)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">{tk(`throne.mode.${mode}.useWhen`)}</p>
                </div>
              </details>
            </div>
          </div>
        </form>
      </SectionCard>

      {latestTask && (
        <SectionCard
          className="relative overflow-hidden border-primary/30 bg-card shadow-sm"
          contentClassName="relative p-5 sm:p-6"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  <Sparkles className="mr-1.5 h-3 w-3" />
                  {tk("throne.latestResult")}
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
                plannerMode={settings.find((setting) => setting.key === "COUNCIL_AUTO_WORK_ORDER_MODE")?.value ?? null}
                isCreatingWorkOrder={isCreatingWorkOrder}
                isCreatingHandoff={isCreatingHandoff}
                isExecutingExternalAgent={isExecutingExternalAgent}
                onCreateWorkOrder={createWorkOrder}
                onCreateHandoff={createHandoff}
                onExecuteExternalAgent={executeWithExternalAgent}
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
          <h2 className="text-lg font-semibold text-foreground">{tk("throne.recent")}</h2>
          <span className="text-xs font-semibold text-muted-foreground">{tk("throne.archiveCount", { count: tasks.length })}</span>
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
            title={tk("throne.empty.title")}
            description={tk("throne.empty.description")}
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
  plannerMode,
  isCreatingWorkOrder,
  isCreatingHandoff,
  isExecutingExternalAgent,
  onCreateWorkOrder,
  onCreateHandoff,
  onExecuteExternalAgent
}: {
  task: TaskDto;
  session: CouncilSessionDto;
  createdWorkOrderIds: string[];
  handoffWorkOrderId?: string;
  plannerMode: string | null;
  isCreatingWorkOrder: boolean;
  isCreatingHandoff: boolean;
  isExecutingExternalAgent: boolean;
  onCreateWorkOrder: () => void;
  onCreateHandoff: () => void;
  onExecuteExternalAgent: () => void;
}) {
  const createdWorkOrderId = session.createdWorkOrderId ?? createdWorkOrderIds[0] ?? handoffWorkOrderId;
  const nextStep = getPrimaryNextAction(task, session, {
    plannerMode,
    createdWorkOrderId,
    isCreatingWorkOrder,
    isCreatingHandoff,
    isExecutingExternalAgent
  });
  const PrimaryIcon = nextStep.icon;
  const hasReport = (session.reports?.length ?? 0) > 0 || task.reports.length > 0;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] xl:items-start">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/40 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <ArrowRight className="h-3 w-3" />
            Next Action
          </div>
          <h3 className="break-words font-display text-xl leading-snug">{nextStep.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">{nextStep.description}</p>
          {nextStep.disabledReason && (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300">
              {nextStep.disabledReason}
            </p>
          )}
        </div>
        <div className="w-full">
          {nextStep.to ? (
            <Link to={nextStep.to} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary px-4 py-3 text-center text-sm font-semibold leading-snug text-primary-foreground hover:bg-primary/90">
              <PrimaryIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{nextStep.buttonLabel}</span>
            </Link>
          ) : (
            <Button type="button" className="h-auto min-h-14 w-full px-4 py-3 text-center leading-snug" disabled={nextStep.disabled} onClick={nextStep.onClick === "handoff" ? onCreateHandoff : nextStep.onClick === "externalExecution" ? onExecuteExternalAgent : onCreateWorkOrder}>
              <PrimaryIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{nextStep.buttonLabel}</span>
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-primary/20 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        {(createdWorkOrderIds.length > 0 || handoffWorkOrderId) && (
          <Link to={createdWorkOrderId ? `/work-orders?focus=${encodeURIComponent(createdWorkOrderId)}` : "/work-orders"} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-2 text-center text-sm font-semibold leading-snug text-primary hover:border-primary/50">
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
  const workOrderId = session.createdWorkOrderId ?? createdWorkOrderIds[0] ?? handoffWorkOrderId;
  const links = [
    { label: "Council Record", description: "Full council archive and source session.", to: "/council", show: true },
    { label: "Royal Brief", description: "Daily summary remains the generated brief source.", to: "/royal-brief", show: true },
    { label: "Project Context", description: task.projectId ? "Project docs, artifacts, and context binding." : "No project is linked to this decree yet.", to: task.projectId ? `/projects/${task.projectId}` : "/projects", show: true },
    { label: "Work Order", description: workOrderId ? "Open the implementation queue for the created item." : "Implementation queue for council follow-up.", to: workOrderId ? `/work-orders?focus=${encodeURIComponent(workOrderId)}` : "/work-orders", show: true },
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

function getPrimaryNextAction(
  task: TaskDto,
  session: CouncilSessionDto,
  opts: {
    plannerMode: string | null;
    createdWorkOrderId?: string;
    isCreatingWorkOrder: boolean;
    isCreatingHandoff: boolean;
    isExecutingExternalAgent: boolean;
  }
): {
  title: string;
  description: string;
  buttonLabel: string;
  icon: LucideIcon;
  disabled: boolean;
  disabledReason?: string;
  onClick: "workOrder" | "handoff" | "externalExecution";
  to?: string;
} {
  const warning = extractContextWarning(session.finalSummary);
  if (session.status === "FAILED") {
    return {
      title: "Review failed role output",
      description: "Council did not complete cleanly. Use the role reports and council record as the source before creating follow-up work.",
      buttonLabel: "Open Council Record",
      icon: FileText,
      disabled: false,
      onClick: "workOrder",
      to: "/council"
    };
  }
  if (session.status !== "COMPLETED") {
    return {
      title: "Wait for final synthesis",
      description: "The council is still convening. Create work orders or handoffs only after the Grand Vizier produces a final recommendation.",
      buttonLabel: "Council Convening",
      icon: Clock3,
      disabled: true,
      onClick: "workOrder"
    };
  }
  const action = session.nextExecutableAction ?? (warning ? "SCAN_LOCAL_DOCS" : "CREATE_WORK_ORDER");
  const reason = session.nextExecutableActionReason ?? "";
  const workOrderTo = opts.createdWorkOrderId ? `/work-orders?focus=${encodeURIComponent(opts.createdWorkOrderId)}` : "/work-orders";

  if (action === "RUN_VALIDATION" || opts.createdWorkOrderId) {
    return {
      title: "Run Validation",
      description: "A Work Order exists. Open it to run the validation gate or continue the implementation route.",
      buttonLabel: "Open Created Work Order",
      icon: ClipboardCheck,
      disabled: false,
      onClick: "workOrder",
      to: workOrderTo
    };
  }
  if (action === "SCAN_LOCAL_DOCS") {
    return {
      title: "Run local docs scan before SANDBOX_PATCH",
      description: reason || "The council completed, but automation needs fresh project context before executable work is created.",
      buttonLabel: "Open Project Local Docs",
      icon: Search,
      disabled: false,
      onClick: "workOrder",
      to: task.projectId ? `/projects/${task.projectId}` : "/projects"
    };
  }
  if (action === "BIND_CONTEXT") {
    return {
      title: "Bind Project Context",
      description: reason || "Project context must be linked before executable work is created.",
      buttonLabel: "Open Project Context",
      icon: Layers,
      disabled: false,
      onClick: "workOrder",
      to: task.projectId ? `/projects/${task.projectId}` : "/projects"
    };
  }
  if (action === "CREATE_EXTERNAL_HANDOFF") {
    return {
      title: "Create External Agent Handoff",
      description: reason || "Package the council recommendation as a manual external-agent handoff.",
      buttonLabel: opts.isCreatingHandoff ? "Creating Handoff..." : "Create External Agent Handoff",
      icon: Handshake,
      disabled: opts.isCreatingHandoff,
      onClick: "handoff"
    };
  }

  const disabledByPlanner = action === "CREATE_WORK_ORDER" && (opts.plannerMode === "OFF" || opts.plannerMode === "DRAFT" || reason === "This council recommendation does not generate executable work orders.");
  if (!disabledByPlanner && opts.plannerMode === "READY") {
    return {
      title: "Create Work Order and Run External Agent",
      description: reason || "Create one executable Work Order, approve the External Agent Bridge job, and wait for the runner report.",
      buttonLabel: opts.isExecutingExternalAgent ? "Starting External Agent..." : "Create Work Order and Run External Agent",
      icon: Cpu,
      disabled: opts.isExecutingExternalAgent,
      onClick: "externalExecution"
    };
  }
  return {
    title: "Create Work Order",
    description: reason || "Create one executable Work Order from the council recommendation.",
    buttonLabel: opts.isCreatingWorkOrder ? "Creating Work Order..." : "Create Work Order",
    icon: Hammer,
    disabled: opts.isCreatingWorkOrder || disabledByPlanner,
    disabledReason: disabledByPlanner ? "This council recommendation does not generate executable work orders." : undefined,
    onClick: "workOrder"
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
