import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Clipboard, FileText, Handshake, Plus, Play, Send, CheckSquare, Square, Trash2, Archive, CheckCircle2, AlertTriangle, Shield, CheckCircle, XCircle, GitBranch, Eye, ArrowRight, ExternalLink, Clock, Layers, ChevronDown, Filter, ListChecks, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ValidationOutput } from "@/components/ValidationOutput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AutomationJobDto, AutomationJobMode, ExternalAgentDto, ExternalAgentRecommendationDto, ImplementationReportPayload, PatchArtifactDto, ProjectDto, WorkOrderContextDto, WorkOrderDto, WorkOrderExecutionTarget, WorkOrderPayload, WorkOrderPriority, WorkOrderStatus } from "@/types/api";

const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

const blankWorkOrder: WorkOrderPayload = {
  title: "",
  objective: "",
  context: "",
  instructions: "",
  constraints: "",
  acceptanceCriteria: [],
  validationCommands: [
    "npm run typecheck",
    "npm run test --workspace @ai-kingdom/api",
    "npm run test --workspace @ai-kingdom/runner",
    "npm run test --workspace @ai-kingdom/web",
    "npm run build"
  ],
  targetProject: "",
  targetRepository: "",
  executionTarget: "AUTO",
  status: "DRAFT",
  priority: "MEDIUM"
};

const blankReport: Omit<ImplementationReportPayload, "workOrderId"> = {
  summary: "",
  filesChanged: [],
  commandsRun: [],
  testsRun: [],
  testResult: "NOT_RUN",
  errors: [],
  decisionsMade: [],
  remainingWork: [],
  nextRecommendedAction: ""
};

const statuses: WorkOrderStatus[] = ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"];
const priorities: WorkOrderPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const executionTargets: WorkOrderExecutionTarget[] = ["AUTO", "INTERNAL_AGENT", "RUNNER_VALIDATION", "RUNNER_PATCH", "EXTERNAL_AGENT"];

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    READY: "Ready",
    IN_PROGRESS: "In Progress",
    NEEDS_REVIEW: "Needs Review",
    COMPLETED: "Completed",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    ARCHIVED: "Archived"
  };
  return labels[status] ?? `Unknown (${status})`;
}

function getCreateJobLabel(target: WorkOrderExecutionTarget) {
  if (target === "RUNNER_VALIDATION") return "Validation Job";
  if (target === "EXTERNAL_AGENT") return "External Agent Job";
  return "Automation Job";
}

function getContextStatus(order: WorkOrderDto | null, context: WorkOrderContextDto | null) {
  return context?.contextBindingStatus ?? order?.contextBindingStatus ?? "MISSING";
}

function hasActiveAutomationJob(jobs: AutomationJobDto[]) {
  return jobs.some((job) => ["QUEUED", "APPROVED", "CLAIMED", "RUNNING", "NEEDS_REVIEW"].includes(job.status));
}

function getContextGuidance(order: WorkOrderDto, context: WorkOrderContextDto | null) {
  const status = getContextStatus(order, context);
  const localDocsChanged = context?.current?.binding?.localDocsChanged === true;
  const hasSnapshot = Boolean(context?.localDocumentSnapshotId || context?.current?.binding?.localDocumentSnapshotId);

  if (status === "FRESH") {
    return "Project context is fresh. SANDBOX_PATCH can be prepared when the work order is ready.";
  }
  if (!order.projectId && !context?.projectId) {
    return "Assign a project before creating runner automation.";
  }
  if (localDocsChanged) {
    return "Local docs changed since the last scan. Run a local docs scan on the linked project, then refresh context.";
  }
  if (!hasSnapshot) {
    return "Run a local docs scan on the linked project, then refresh context.";
  }
  return "Refresh context from the latest scanned local docs before creating a patch job.";
}

function getAutomationBlockedReason(order: WorkOrderDto | null, context: WorkOrderContextDto | null, jobs: AutomationJobDto[]) {
  if (!order) return null;
  if (hasActiveAutomationJob(jobs)) return "An automation job is already active or waiting for review.";
  const status = getContextStatus(order, context);
  if (status !== "FRESH") return `Blocked: context is ${status}. ${getContextGuidance(order, context)}`;
  return null;
}

function getRecommendedNextStep({
  order,
  context,
  jobs,
  patches,
  generatedPrompt
}: {
  order: WorkOrderDto;
  context: WorkOrderContextDto | null;
  jobs: AutomationJobDto[];
  patches: PatchArtifactDto[];
  generatedPrompt: string;
}) {
  const contextStatus = getContextStatus(order, context);
  const latestReport = order.implementationReports?.[0];

  if (contextStatus !== "FRESH") {
    return {
      title: "Run local docs scan before patch",
      description: getContextGuidance(order, context),
      blocked: true,
      sourceLabel: "Open project context",
      sourceTo: order.projectId ? `/projects/${order.projectId}` : "/projects"
    };
  }
  if (!order.assignedExternalAgentId) {
    return {
      title: "Assign external agent",
      description: "Choose the external agent that should execute this work order, then generate the handoff.",
      sourceLabel: "Review external agents",
      sourceTo: "/external-agents"
    };
  }
  if ((order.handoffBriefs?.length ?? 0) === 0) {
    return {
      title: "Generate handoff",
      description: "Create the handoff brief so the assigned agent gets the current instructions and constraints.",
      sourceLabel: "Review handoff section",
      sourceTo: "#work-order-handoff"
    };
  }
  if (!generatedPrompt) {
    return {
      title: "Copy handoff prompt",
      description: "Generate or copy the external prompt before moving the order into implementation.",
      sourceLabel: "Open prompt section",
      sourceTo: "#work-order-prompt"
    };
  }
  if (order.status === "IN_PROGRESS" || (order.implementationReports?.length ?? 0) === 0) {
    return {
      title: "Submit report",
      description: "Capture what changed, what passed, and what still needs a decision.",
      sourceLabel: "Open submit report",
      sourceTo: "#work-order-submit-report"
    };
  }
  if (patches.some((patch) => patch.validationStatus === "PENDING") || jobs.some((job) => job.status === "NEEDS_REVIEW") || order.status === "NEEDS_REVIEW") {
    return {
      title: "Review result",
      description: latestReport?.nextRecommendedAction || "Review the report, patch artifact, and validation result before approving or archiving.",
      sourceLabel: "Open review history",
      sourceTo: "#work-order-history"
    };
  }
  if (order.status === "COMPLETED") {
    return {
      title: "Archive completed",
      description: "This work order is complete. Archive it only after the final report and any automation review are accepted.",
      sourceLabel: "Review history",
      sourceTo: "#work-order-history",
      dangerous: true
    };
  }
  return {
    title: "Review work order",
    description: latestReport?.nextRecommendedAction || "Confirm the overview, context, assigned agent, and handoff before taking the next action.",
    sourceLabel: "Review overview",
    sourceTo: "#work-order-overview"
  };
}

function WorkOrderSection({
  id,
  title,
  description,
  source,
  children
}: {
  id?: string;
  title: string;
  description?: string;
  source?: { label: string; to: string };
  children: ReactNode;
}) {
  return (
    <Card id={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {source ? (
          source.to.startsWith("#") ? (
            <a href={source.to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              {source.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <Link to={source.to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              {source.label}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function WorkOrderStatusSummary({
  order,
  contextStatus,
  nextStep
}: {
  order: WorkOrderDto;
  contextStatus: string;
  nextStep: ReturnType<typeof getRecommendedNextStep>;
}) {
  const tk = useTk();
  const assignedAgent = order.assignedExternalAgent?.name ?? "Unassigned";
  return (
    <Card className="border-primary/30 bg-primary/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{tk("workOrders.detailEyebrow")}</p>
          <h2 className="mt-2 break-words text-xl font-semibold leading-7 text-foreground sm:text-2xl">{order.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{order.objective || tk("workOrders.noObjective")}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <span className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs font-semibold">{getStatusLabel(order.status)}</span>
          <span className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs font-semibold">{order.priority}</span>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", contextStatusColor(contextStatus))}>
            {tk("workOrders.contextStatus", { status: contextStatus })}
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border/70 bg-background/30 p-3">
          <div className="text-xs text-muted-foreground">{tk("workOrders.assignedAgent")}</div>
          <div className="mt-1 text-sm font-semibold">{assignedAgent === "Unassigned" ? tk("workOrders.unassigned") : assignedAgent}</div>
        </div>
        <div className="rounded-md border border-border/70 bg-background/30 p-3">
          <div className="text-xs text-muted-foreground">{tk("workOrders.state")}</div>
          <div className="mt-1 text-sm font-semibold">{getStatusLabel(order.status)}</div>
        </div>
        <div className="rounded-md border border-border/70 bg-background/30 p-3">
          <div className="text-xs text-muted-foreground">{tk("workOrders.nextAction")}</div>
          <div className="mt-1 text-sm font-semibold">{nextStep.title}</div>
        </div>
      </div>
    </Card>
  );
}

function WorkOrderNextStepCard({
  nextStep,
  blockedReason
}: {
  nextStep: ReturnType<typeof getRecommendedNextStep>;
  blockedReason: string | null;
}) {
  const tk = useTk();
  const tone = nextStep.dangerous
    ? "border-red-500/30 bg-red-500/10"
    : nextStep.blocked || blockedReason
      ? "border-amber-500/30 bg-amber-500/10"
      : "border-emerald-500/30 bg-emerald-500/10";

  return (
    <Card className={cn("border", tone)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {nextStep.blocked || blockedReason ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <ArrowRight className="h-4 w-4 text-primary" />}
            {tk("workOrders.nextStep")}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{nextStep.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blockedReason ?? nextStep.description}</p>
        </div>
        {nextStep.sourceTo.startsWith("#") ? (
          <a href={nextStep.sourceTo} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {nextStep.sourceLabel}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <Link to={nextStep.sourceTo} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {nextStep.sourceLabel}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </Card>
  );
}

function WorkOrderSourceLinks({ order }: { order: WorkOrderDto }) {
  const tk = useTk();
  const projectTo = order.projectId ? `/projects/${order.projectId}` : "/projects";
  const links = [
    { label: tk("workOrders.source.project"), to: projectTo, description: tk("workOrders.source.projectDescription") },
    { label: tk("workOrders.source.reports"), to: "#work-order-history", description: tk("workOrders.source.reportsDescription") },
    { label: tk("workOrders.source.automation"), to: "/automation-jobs", description: tk("workOrders.source.automationDescription") },
    { label: tk("workOrders.source.agent"), to: "/external-agents", description: tk("workOrders.source.agentDescription") },
    { label: tk("workOrders.source.lineage"), to: `/decree-lineage/${order.id}`, description: tk("workOrders.source.lineageDescription") }
  ];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{tk("workOrders.sourceTruth")}</h2>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => {
          const className = "rounded-md border border-border/70 bg-muted/20 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5";
          const content = (
            <>
              <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                {link.label}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
            </>
          );
          return link.to.startsWith("#") ? (
            <a key={link.label} href={link.to} className={className}>{content}</a>
          ) : (
            <Link key={link.label} to={link.to} className={className}>{content}</Link>
          );
        })}
      </div>
    </Card>
  );
}

function WorkOrderDetailIndex() {
  const tk = useTk();
  const links = [
    { label: tk("workOrders.index.summary"), to: "#work-order-overview" },
    { label: tk("workOrders.index.context"), to: "#work-order-project-context" },
    { label: tk("workOrders.index.agent"), to: "#work-order-agent" },
    { label: tk("workOrders.index.execution"), to: "#work-order-automation" },
    { label: tk("workOrders.index.history"), to: "#work-order-history" }
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2" aria-label={tk("workOrders.indexAria")}>
      {links.map((link) => (
        <a key={link.to} href={link.to} className="inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function StatusQuickFilters({
  statusFilter,
  includeArchived,
  workOrders,
  onStatus,
  onArchived
}: {
  statusFilter: string;
  includeArchived: boolean;
  workOrders: WorkOrderDto[];
  onStatus: (status: string) => void;
  onArchived: () => void;
}) {
  const tk = useTk();
  const counts = {
    NEEDS_REVIEW: workOrders.filter((order) => order.status === "NEEDS_REVIEW").length,
    READY: workOrders.filter((order) => order.status === "READY").length,
    IN_PROGRESS: workOrders.filter((order) => order.status === "IN_PROGRESS").length,
    ARCHIVED: workOrders.filter((order) => order.status === "ARCHIVED").length
  };
  const items = [
    { label: tk("workOrders.quick.needsReview"), status: "NEEDS_REVIEW", count: counts.NEEDS_REVIEW },
    { label: tk("workOrders.quick.ready"), status: "READY", count: counts.READY },
    { label: tk("workOrders.quick.inProgress"), status: "IN_PROGRESS", count: counts.IN_PROGRESS }
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onStatus("")}
        aria-pressed={!statusFilter && !includeArchived}
        className={cn("min-h-12 rounded-md border px-3 py-2 text-left text-xs transition", !statusFilter && !includeArchived ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-muted/20 text-muted-foreground hover:text-foreground")}
      >
        <span className="block font-semibold">{tk("workOrders.quick.active")}</span>
        <span>{workOrders.length}</span>
      </button>
      {items.map((item) => (
        <button
          key={item.status}
          type="button"
          onClick={() => onStatus(item.status)}
          aria-pressed={statusFilter === item.status}
          className={cn("min-h-12 rounded-md border px-3 py-2 text-left text-xs transition", statusFilter === item.status ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-muted/20 text-muted-foreground hover:text-foreground")}
        >
          <span className="block font-semibold">{item.label}</span>
          <span>{item.count}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onArchived}
        aria-pressed={statusFilter === "ARCHIVED" && includeArchived}
        className={cn("min-h-12 rounded-md border px-3 py-2 text-left text-xs transition", statusFilter === "ARCHIVED" && includeArchived ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-muted/20 text-muted-foreground hover:text-foreground")}
      >
        <span className="block font-semibold">{tk("workOrders.quick.archived")}</span>
        <span>{counts.ARCHIVED}</span>
      </button>
    </div>
  );
}

export function WorkOrdersPage() {
  const tk = useTk();
  const [searchParams] = useSearchParams();
  const focusedWorkOrderId = searchParams.get("focus");
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const canReport = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [externalAgents, setExternalAgents] = useState<ExternalAgentDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<WorkOrderPayload>(blankWorkOrder);
  const [reportDraft, setReportDraft] = useState(blankReport);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [includeTestData, setIncludeTestData] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [taskId, setTaskId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [automationJobs, setAutomationJobs] = useState<AutomationJobDto[]>([]);
  const [creatingJob, setCreatingJob] = useState(false);
  const [approvingJob, setApprovingJob] = useState<string | null>(null);
  const [patchArtifacts, setPatchArtifacts] = useState<PatchArtifactDto[]>([]);
  const [patchActionId, setPatchActionId] = useState<string | null>(null);
  const [workOrderContext, setWorkOrderContext] = useState<WorkOrderContextDto | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [agentRecommendations, setAgentRecommendations] = useState<ExternalAgentRecommendationDto[]>([]);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [archivingCompleted, setArchivingCompleted] = useState(false);

  const selected = useMemo(() => selectedId ? workOrders.find((order) => order.id === selectedId) ?? null : null, [selectedId, workOrders]);

  async function load() {
    setLoadingWorkOrders(true);
    setLoadError(null);
    try {
      const [orders, agents, projectResponse] = await Promise.all([
        api.workOrders({
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          externalAgentId: agentFilter || undefined,
          includeArchived,
          includeLegacy,
          includeTestData
        }),
        api.externalAgents(),
        api.projects()
      ]);
      setWorkOrders(orders.workOrders);
      setExternalAgents(agents.externalAgents);
      setProjects(projectResponse.projects);
      const focused = focusedWorkOrderId ? orders.workOrders.find((order) => order.id === focusedWorkOrderId) : null;
      if (focused) {
        setSelectedId(focused.id);
        setDraft(toPayload(focused));
        setIsCreating(false);
        setIsEditorOpen(false);
      } else if (selectedId && !orders.workOrders.some((order) => order.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load work orders.");
      setWorkOrders([]);
      setExternalAgents([]);
      setProjects([]);
    } finally {
      setLoadingWorkOrders(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, priorityFilter, agentFilter, includeArchived, includeLegacy, includeTestData, focusedWorkOrderId]);

  function select(order: WorkOrderDto | null) {
    setSelectedId(order?.id ?? null);
    setIsCreating(false);
    setIsEditorOpen(false);
    setDraft(order ? toPayload(order) : blankWorkOrder);
    setGeneratedPrompt("");
    setError(null);
    setReconcileMessage(null);
    if (order) {
      Promise.all([
        api.automationJobs({ workOrderId: order.id }),
        api.patchArtifacts({ workOrderId: order.id })
      ]).then(([jobs, patches]) => {
        setAutomationJobs(jobs);
        setPatchArtifacts(patches);
      }).catch(() => {
        setAutomationJobs([]);
        setPatchArtifacts([]);
      });
      api.getWorkOrderContext(order.id)
        .then((response) => setWorkOrderContext(response.context))
        .catch(() => setWorkOrderContext(null));
      api.getWorkOrderRecommendations(order.id)
        .then((response) => setAgentRecommendations(response.recommendations))
        .catch(() => setAgentRecommendations([]));
    } else {
      setAutomationJobs([]);
      setPatchArtifacts([]);
      setWorkOrderContext(null);
      setAgentRecommendations([]);
    }
  }

  function startCreating() {
    setSelectedId(null);
    setIsCreating(true);
    setIsEditorOpen(true);
    setDraft(blankWorkOrder);
    setGeneratedPrompt("");
    setWorkOrderContext(null);
    setAutomationJobs([]);
    setPatchArtifacts([]);
    setAgentRecommendations([]);
    setError(null);
  }

  async function refreshContext(workOrderId: string) {
    try {
      const response = await api.getWorkOrderContext(workOrderId);
      setWorkOrderContext(response.context);
    } catch {
      setWorkOrderContext(null);
    }
  }

  async function markContextStale() {
    if (!selected || !canCreate) return;
    setContextBusy(true);
    setError(null);
    try {
      await api.markWorkOrderContextStale(selected.id, "Manually marked stale from work order detail");
      await refreshContext(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark context stale");
    } finally {
      setContextBusy(false);
    }
  }

  async function runRefreshContext() {
    if (!selected || !canCreate) return;
    setContextBusy(true);
    setError(null);
    try {
      const { result } = await api.refreshWorkOrderContext(selected.id);
      if (result.newStatus !== "FRESH") {
        const msgs = result.scanFailures.length > 0 ? result.scanFailures : result.warnings;
        setError(msgs.length > 0 ? msgs[0]! : `Context is ${result.newStatus ?? "unchanged"} after refresh — check project local docs.`);
      }
      await refreshContext(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh context");
    } finally {
      setContextBusy(false);
    }
  }

  async function assignExternalAgent(agentId: string, agentName: string) {
    if (!selected || !canCreate) return;
    setAssigningAgent(true);
    setAssignMessage(null);
    setAssignError(null);
    try {
      const response = await api.assignWorkOrderExternalAgent(selected.id, agentId);
      setDraft((d) => ({ ...d, assignedExternalAgentId: agentId }));
      setWorkOrders((prev) => prev.map((o) => o.id === selected.id ? response.workOrder : o));
      setAssignMessage(`Assigned to ${agentName}`);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign external agent");
    } finally {
      setAssigningAgent(false);
    }
  }

  async function archiveAsCompleted() {
    if (!selected || !canCreate) return;
    if (!window.confirm(`Archive "${selected.title}" as completed? This cannot be undone.`)) return;
    setArchivingCompleted(true);
    setError(null);
    try {
      await api.archiveWorkOrderAsCompleted(selected.id);
      setSelectedId(null);
      setIsCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive work order");
    } finally {
      setArchivingCompleted(false);
    }
  }

  async function reconcileContext() {
    if (!canCreate) return;
    setContextBusy(true);
    setError(null);
    setReconcileMessage(null);
    try {
      const res = await api.reconcileContextWarnings();
      const r = res.result;
      const parts: string[] = [];
      if (r.archived > 0) parts.push(`${r.archived} archived`);
      if (r.contextRepaired > 0) parts.push(`${r.contextRepaired} context repaired`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
      setReconcileMessage(
        r.totalInspected === 0
          ? "No stale work orders found."
          : `Reconciled ${r.totalInspected}: ${parts.join(", ") || "no changes"}.`
      );
      await load();
      if (selected) await refreshContext(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setContextBusy(false);
    }
  }

  async function createJob(useAssignedAgentCli = false) {
    if (!selected || !canCreate) return;
    const target = draft.executionTarget ?? selected.executionTarget ?? "RUNNER_PATCH";
    if (target === "INTERNAL_AGENT") {
      setError("Internal Agent is a planning target, not a runner job. Select Runner Validation, Runner Patch, or External Agent.");
      return;
    }
    const mode: AutomationJobMode = target === "RUNNER_VALIDATION"
      ? "VALIDATION_ONLY"
      : target === "EXTERNAL_AGENT"
        ? "EXTERNAL_AGENT"
        : "SANDBOX_PATCH";
    setCreatingJob(true);
    setError(null);
    try {
      await api.createAutomationJobForWorkOrder(selected.id, {
        mode,
        externalAgentId: mode === "EXTERNAL_AGENT" ? (draft.assignedExternalAgentId ?? selected.assignedExternalAgentId ?? null) : null,
        useAssignedAgentCli: mode === "SANDBOX_PATCH" ? useAssignedAgentCli : false
      });
      const jobs = await api.automationJobs({ workOrderId: selected.id });
      setAutomationJobs(jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation job");
    } finally {
      setCreatingJob(false);
    }
  }

  async function approveJob(jobId: string) {
    setApprovingJob(jobId);
    setError(null);
    try {
      await api.approveAutomationJob(jobId);
      if (selected) {
        const jobs = await api.automationJobs({ workOrderId: selected.id });
        setAutomationJobs(jobs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve job");
    } finally {
      setApprovingJob(null);
    }
  }

  async function approvePatch(artifactId: string) {
    setPatchActionId(artifactId);
    try {
      await api.approvePatchArtifact(artifactId);
      if (selected) setPatchArtifacts(await api.patchArtifacts({ workOrderId: selected.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve patch");
    } finally {
      setPatchActionId(null);
    }
  }

  async function rejectPatch(artifactId: string) {
    setPatchActionId(artifactId);
    try {
      await api.rejectPatchArtifact(artifactId);
      if (selected) setPatchArtifacts(await api.patchArtifacts({ workOrderId: selected.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject patch");
    } finally {
      setPatchActionId(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setError(null);
    try {
      if (selectedId) {
        const response = await api.updateWorkOrder(selectedId, cleanWorkOrder(draft));
        setSelectedId(response.workOrder.id);
      } else {
        const response = await api.createWorkOrder(cleanWorkOrder(draft));
        if (response.status === "REJECTED" || response.status === "PREVIEW_ONLY") {
          setError(response.reason || `Create failed: work order ${response.status.toLowerCase()}.`);
          return;
        }
        if (response.workOrder) {
          setSelectedId(response.workOrder.id);
          setIsCreating(false);
          setIsEditorOpen(false);
        } else {
          setError("Create failed: no work order returned.");
        }
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save work order");
    }
  }

  async function generateFromTask() {
    if (!taskId.trim()) return;
    setError(null);
    try {
      const response = await api.workOrderFromTask(taskId.trim());
      if (response.workOrder) {
        setSelectedId(response.workOrder.id);
        setIsCreating(false);
        setIsEditorOpen(false);
      } else {
        setError("Work order generation skipped by central gate.");
      }
      await load();
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : "Unable to generate work order");
    }
  }

  async function generateFromMatter() {
    if (!matterId.trim()) return;
    setError(null);
    try {
      const response = await api.workOrderFromMatter(matterId.trim());
      if (response.workOrder) {
        setSelectedId(response.workOrder.id);
        setIsCreating(false);
        setIsEditorOpen(false);
      } else {
        setError("Work order generation skipped by central gate.");
      }
      await load();
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : "Unable to generate work order");
    }
  }

  async function buildPrompt() {
    const agentId = draft.assignedExternalAgentId ?? selected?.assignedExternalAgentId;
    if (!agentId || !selected) {
      setError("Select an external agent before generating a prompt.");
      return;
    }
    const response = await api.buildWorkOrderPrompt(selected.id, agentId);
    setGeneratedPrompt(response.prompt);
  }

  async function dispatch() {
    const agentId = draft.assignedExternalAgentId ?? selected?.assignedExternalAgentId;
    if (!agentId || !selected) {
      setError("Select an external agent before dispatching.");
      return;
    }
    setDispatching(true);
    setDispatchMessage(null);
    setDispatchError(null);
    try {
      const response = await api.dispatchWorkOrder(selected.id, agentId);
      setGeneratedPrompt(response.prompt);
      await copy(response.prompt);
      if (response.autoExecuted) {
        setDispatchMessage("Agent ran automatically via API — report stored and the King was notified. Review it below.");
      } else if (response.executionError) {
        setDispatchMessage(`Dispatched (prompt copied). Auto-execution failed: ${response.executionError}. Run it manually or check provider settings.`);
      } else {
        setDispatchMessage("Dispatched. Prompt copied — paste it into the external agent, then submit its report.");
      }
      await load();
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : "Failed to dispatch work order");
    } finally {
      setDispatching(false);
    }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canReport) return;
    const response = await api.createImplementationReport({
      ...reportDraft,
      workOrderId: selected.id,
      externalAgentId: selected.assignedExternalAgentId
    });
    setReportDraft(blankReport);
    setSelectedId(response.implementationReport.workOrderId);
    await load();
  }

  async function handoff() {
    if (!selected) return;
    const response = await api.createHandoffBrief(selected.id);
    await copy(response.handoffBrief.handoffPrompt);
    await load();
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === workOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(workOrders.map(o => o.id));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => api.updateWorkOrder(id, { status: "ARCHIVED" })));
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError("Bulk archive failed");
    }
  };

  const handleBulkComplete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => api.updateWorkOrder(id, { status: "COMPLETED" })));
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError("Bulk completion failed");
    }
  };

  const handleBulkLegacy = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => api.updateWorkOrder(id, { workQuality: "LEGACY" })));
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError("Bulk mark legacy failed");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} items? This will only succeed for safe test/junk items.`)) return;
    try {
      await Promise.all(selectedIds.map(id => api.deleteWorkOrder(id).catch(() => undefined)));
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError("Bulk delete failed");
    }
  };

  const selectedContextStatus = getContextStatus(selected, workOrderContext);
  const selectedNextStep = selected ? getRecommendedNextStep({
    order: selected,
    context: workOrderContext,
    jobs: automationJobs,
    patches: patchArtifacts,
    generatedPrompt
  }) : null;
  const automationBlockedReason = getAutomationBlockedReason(selected, workOrderContext, automationJobs);

  function applyQuickStatus(status: string) {
    setIncludeArchived(false);
    setStatusFilter(status);
  }

  function applyArchivedFilter() {
    setIncludeArchived(true);
    setStatusFilter("ARCHIVED");
  }

  function renderWorkOrderBadges(order: WorkOrderDto) {
    const badges = [];
    if (order.status === "ARCHIVED") {
      badges.push(<span key="archived" className="rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Archived</span>);
    }
    if (order.isTestData || order.dataQuality === "TEST" || order.workQuality === "TEST" || order.workQuality === "DEBUG_ONLY") {
      badges.push(<span key="test" className="rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Test/Debug</span>);
    }
    if (order.workQuality === "DUPLICATE") {
      badges.push(<span key="duplicate" className="rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Duplicate</span>);
    }
    if (order.dataQuality === "LEGACY" || order.workQuality === "LEGACY" || order.workQuality === "COMPLETED_ARCHIVE") {
      badges.push(<span key="legacy" className="rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Legacy</span>);
    }
    if (order.dataQuality === "UNKNOWN_SOURCE") {
      badges.push(<span key="unknown" className="rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Unknown source</span>);
    }
    if (badges.length === 0 || (order.workQuality === "ACTIONABLE" && order.status !== "ARCHIVED")) {
      badges.push(<span key="actionable" className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">Actionable</span>);
    }
    return <div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>;
  }

  return (
    <>
      <PageHeader
        eyebrow={tk("workOrders.eyebrow")}
        title={tk("workOrders.title")}
        description={tk("workOrders.description")}
        action={canCreate ? (
          <Button type="button" variant={isCreating ? "outline" : "primary"} className="h-11" onClick={isCreating ? () => select(null) : startCreating}>
            {isCreating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isCreating ? tk("workOrders.closeCreation") : tk("workOrders.create")}
          </Button>
        ) : undefined}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]" data-testid="work-orders-workspace">
        <aside className="min-w-0 self-start overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-4" aria-label={tk("workOrders.queueAria")}>
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">{tk("workOrders.queueTitle")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{tk("workOrders.queueDescription")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-border bg-muted/20 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">{workOrders.length}</span>
              {loadingWorkOrders ? <Clock className="h-4 w-4 animate-pulse text-muted-foreground" /> : null}
            </div>
          </div>

          <div className="border-b border-border p-4">
            <div>
              <StatusQuickFilters
                statusFilter={statusFilter}
                includeArchived={includeArchived}
                workOrders={workOrders}
                onStatus={applyQuickStatus}
                onArchived={applyArchivedFilter}
              />
            </div>

            <details className="group mt-3 rounded-lg border border-border bg-background/25">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" />{tk("workOrders.advancedFilters")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-border p-3">
                <FormField id="filter-status" label={tk("workOrders.filter.status")}>
                  <select id="filter-status" className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">{tk("workOrders.filter.allStatuses")}</option>
                    {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                  </select>
                </FormField>
                <FormField id="filter-priority" label={tk("workOrders.filter.priority")}>
                  <select id="filter-priority" className={selectCls} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                    <option value="">{tk("workOrders.filter.allPriorities")}</option>
                    {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </FormField>
                <FormField id="filter-agent" label={tk("workOrders.filter.agent")}>
                  <select id="filter-agent" className={selectCls} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                    <option value="">{tk("workOrders.filter.allAgents")}</option>
                    {externalAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </FormField>
                <div className="space-y-2 border-t border-border pt-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground/80">
                    <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded border-border" />
                    {tk("workOrders.filter.showArchived")}
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground/80">
                    <input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} className="rounded border-border" />
                    {tk("workOrders.filter.showLegacy")}
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground/80">
                    <input type="checkbox" checked={includeTestData} onChange={(e) => setIncludeTestData(e.target.checked)} className="rounded border-border" />
                    {tk("workOrders.filter.showTest")}
                  </label>
                </div>
              </div>
            </details>

            {canCreate ? (
              <details className="group mt-3 rounded-lg border border-border bg-background/25">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />{tk("workOrders.generateSource")}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t border-border p-3">
                  <FormField id="gen-task-id" label={tk("workOrders.generate.taskId")} description={tk("workOrders.generate.taskDescription")}>
                    <div className="flex gap-2">
                      <Input id="gen-task-id" value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder={tk("workOrders.generate.pasteTask")} />
                      <Button type="button" variant="outline" onClick={() => void generateFromTask()}>{tk("workOrders.generate.task")}</Button>
                    </div>
                  </FormField>
                  <FormField id="gen-matter-id" label={tk("workOrders.generate.matterId")} description={tk("workOrders.generate.matterDescription")}>
                    <div className="flex gap-2">
                      <Input id="gen-matter-id" value={matterId} onChange={(e) => setMatterId(e.target.value)} placeholder={tk("workOrders.generate.pasteMatter")} />
                      <Button type="button" variant="outline" onClick={() => void generateFromMatter()}>{tk("workOrders.generate.matter")}</Button>
                    </div>
                  </FormField>
                </div>
              </details>
            ) : null}
          </div>

          {/* Bulk Actions */}
          {workOrders.length > 0 && canCreate && (
            <div className="border-b border-border bg-muted/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{tk("workOrders.selectedCount", { count: selectedIds.length })}</span>
                <Button variant="outline" className="h-9 px-2 text-xs" onClick={toggleSelectAll}>
                  {selectedIds.length === workOrders.length ? tk("workOrders.deselectAll") : tk("workOrders.selectAll")}
                </Button>
              </div>
              {selectedIds.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-10 px-2 text-xs" onClick={handleBulkArchive}>
                    <Archive className="h-3 w-3" /> {tk("workOrders.bulk.archive")}
                  </Button>
                  <Button variant="outline" className="h-10 px-2 text-xs" onClick={handleBulkComplete}>
                    <CheckCircle2 className="h-3 w-3" /> {tk("workOrders.bulk.complete")}
                  </Button>
                  <Button variant="outline" className="h-10 px-2 text-xs" onClick={handleBulkLegacy}>
                    {tk("workOrders.bulk.legacy")}
                  </Button>
                  <Button variant="outline" className="h-10 px-2 text-xs text-destructive hover:bg-destructive/10" onClick={handleBulkDelete}>
                    <Trash2 className="h-3 w-3" /> {tk("workOrders.bulk.delete")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {loadError ? (
            <div className="border-b border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-100">{tk("workOrders.loadError")}</p>
              <p className="mt-1 text-xs text-red-100/80">{loadError}</p>
              <Button type="button" variant="outline" className="mt-3 h-11" onClick={() => void load()}>{tk("workOrders.retry")}</Button>
            </div>
          ) : null}

          {loadingWorkOrders && workOrders.length === 0 ? (
            <div className="border-b border-border p-4 text-sm text-muted-foreground">{tk("workOrders.loading")}</div>
          ) : null}

          {!loadingWorkOrders && !loadError && workOrders.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold">{tk("workOrders.emptyFilters")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tk("workOrders.emptyFiltersDescription")}</p>
            </div>
          ) : null}

          <div className="max-h-[640px] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-18rem)]">
            {workOrders.map((order) => (
              <div key={order.id} className={cn("relative border-t border-border first:border-t-0", focusedWorkOrderId === order.id && "ring-2 ring-inset ring-primary/60")}>
                <span className={cn("absolute inset-y-0 left-0 w-0.5 bg-primary transition-opacity duration-200", selected?.id === order.id ? "opacity-100" : "opacity-0")} />
                {canCreate && (
                  <button
                    type="button"
                    aria-label={selectedIds.includes(order.id) ? `Deselect ${order.title}` : `Select ${order.title}`}
                    className="absolute left-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => toggleSelect(order.id)}
                  >
                    {selectedIds.includes(order.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={selected?.id === order.id}
                  className={cn("group min-h-[124px] w-full p-4 text-left transition-colors duration-200 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", canCreate ? "pl-12" : "", selected?.id === order.id && "bg-primary/10")}
                  onClick={() => select(order)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{order.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{tk("workOrders.updated", { date: formatDate(order.updatedAt) })}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 font-mono text-[11px] font-semibold" title={order.priority}>{order.priority}</span>
                  </div>
                  {renderWorkOrderBadges(order)}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{getStatusLabel(order.status)}</span>
                    {order.assignedExternalAgent ? <span>{order.assignedExternalAgent.name}</span> : <span>{tk("workOrders.unassigned")}</span>}
                    <span>{tk("workOrders.contextStatus", { status: order.contextBindingStatus ?? "Unknown" })}</span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-5" data-testid="work-order-detail-pane">
          {selected && selectedNextStep ? (
            <>
              <WorkOrderStatusSummary order={selected} contextStatus={selectedContextStatus} nextStep={selectedNextStep} />
              <WorkOrderNextStepCard nextStep={selectedNextStep} blockedReason={automationBlockedReason && selectedNextStep.blocked ? automationBlockedReason : null} />
              <WorkOrderSourceLinks order={selected} />
              <WorkOrderDetailIndex />
            </>
          ) : null}

          {!selected && !isCreating ? (
            <Card className="flex min-h-[420px] items-center justify-center border-dashed bg-muted/5 text-center">
              <div className="max-w-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/20 text-primary">
                  <Clipboard className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{tk("workOrders.selectTitle")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{tk("workOrders.selectDescription")}</p>
                {canCreate ? (
                  <Button type="button" className="mt-5 h-11" onClick={startCreating}>
                    <Plus className="h-4 w-4" />
                    {tk("workOrders.create")}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {selected || isCreating ? (
          <Card id="work-order-overview">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{selectedId ? tk("workOrders.overview") : tk("workOrders.create")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedId ? tk("workOrders.overviewDescription") : tk("workOrders.createDescription")}
                </p>
              </div>
              {selectedId && canCreate && selected?.status !== "ARCHIVED" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 border-red-500/40 bg-red-500/10 text-xs text-red-100 hover:bg-red-500/20"
                  disabled={archivingCompleted}
                  onClick={() => void archiveAsCompleted()}
                >
                  <Archive className="h-3.5 w-3.5" />
                  {archivingCompleted ? tk("workOrders.archiving") : tk("workOrders.archiveCompleted")}
                </Button>
              )}
            </div>
            <details
              className="group mt-5 rounded-lg border border-border bg-background/25"
              open={isEditorOpen}
              onToggle={(event) => setIsEditorOpen(event.currentTarget.open)}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span>{selectedId ? tk("workOrders.editFields") : tk("workOrders.fields")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <form className="space-y-4 border-t border-border p-4" onSubmit={save}>
              <FormField id="wo-title" label={tk("workOrders.field.title")} required>
                <Input id="wo-title" disabled={!canCreate} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={tk("workOrders.field.titlePlaceholder")} />
              </FormField>

              <FormField id="wo-objective" label={tk("workOrders.field.objective")} description={tk("workOrders.field.objectiveDescription")}>
                <Textarea id="wo-objective" disabled={!canCreate} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} placeholder={tk("workOrders.field.objectivePlaceholder")} />
              </FormField>

              <FormField id="wo-context" label={tk("workOrders.field.context")} description={tk("workOrders.field.contextDescription")}>
                <Textarea id="wo-context" disabled={!canCreate} value={draft.context ?? ""} onChange={(e) => setDraft({ ...draft, context: e.target.value })} placeholder={tk("workOrders.field.contextPlaceholder")} />
              </FormField>

              <FormField id="wo-instructions" label={tk("workOrders.field.instructions")} description={tk("workOrders.field.instructionsDescription")}>
                <Textarea id="wo-instructions" disabled={!canCreate} value={draft.instructions ?? ""} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder={tk("workOrders.field.instructionsPlaceholder")} />
              </FormField>

              <FormField id="wo-constraints" label={tk("workOrders.field.constraints")} description={tk("workOrders.field.constraintsDescription")}>
                <Textarea id="wo-constraints" disabled={!canCreate} value={draft.constraints ?? ""} onChange={(e) => setDraft({ ...draft, constraints: e.target.value })} placeholder={tk("workOrders.field.constraintsPlaceholder")} />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="wo-status" label={tk("workOrders.field.status")}>
                  <select id="wo-status" disabled={!canCreate} className={selectCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as WorkOrderStatus })}>
                    {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-priority" label={tk("workOrders.field.priority")}>
                  <select id="wo-priority" disabled={!canCreate} className={selectCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkOrderPriority })}>
                    {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-agent" label={tk("workOrders.field.assignedAgent")} className="sm:col-span-2">
                  <select id="wo-agent" disabled={!canCreate} className={selectCls} value={draft.assignedExternalAgentId ?? ""} onChange={(e) => setDraft({ ...draft, assignedExternalAgentId: e.target.value || null })}>
                    <option value="">{tk("workOrders.unassigned")}</option>
                    {externalAgents.filter((agent) => agent.isActive).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-execution-target" label={tk("workOrders.field.executionTarget")} className="sm:col-span-2">
                  <select id="wo-execution-target" disabled={!canCreate} className={selectCls} value={draft.executionTarget ?? "AUTO"} onChange={(e) => setDraft({ ...draft, executionTarget: e.target.value as WorkOrderExecutionTarget })}>
                    {executionTargets.map((target) => <option key={target} value={target}>{target.replaceAll("_", " ")}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-project" label={tk("workOrders.field.targetProject")} className="sm:col-span-2">
                  <select id="wo-project" disabled={!canCreate} className={selectCls} value={draft.projectId ?? ""} onChange={(e) => setDraft({ ...draft, projectId: e.target.value || null })}>
                    <option value="">{tk("workOrders.field.autoRoute")}</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </FormField>
              </div>

              <FormField id="wo-target-project" label={tk("workOrders.field.targetProjectName")} description={tk("workOrders.field.targetProjectDescription")}>
                <Input id="wo-target-project" disabled={!canCreate} value={draft.targetProject ?? ""} onChange={(e) => setDraft({ ...draft, targetProject: e.target.value })} placeholder={tk("workOrders.field.targetProjectPlaceholder")} />
              </FormField>

              <FormField id="wo-target-repo" label={tk("workOrders.field.targetRepository")} description={tk("workOrders.field.targetRepositoryDescription")}>
                <Input id="wo-target-repo" disabled={!canCreate} value={draft.targetRepository ?? ""} onChange={(e) => setDraft({ ...draft, targetRepository: e.target.value })} placeholder={tk("workOrders.field.targetRepositoryPlaceholder")} />
              </FormField>

              <FormField id="wo-acceptance" label={tk("workOrders.field.acceptance")} description={tk("workOrders.field.onePerLine")}>
                <Textarea id="wo-acceptance" disabled={!canCreate} value={draft.acceptanceCriteria?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, acceptanceCriteria: lines(e.target.value) })} placeholder={tk("workOrders.field.acceptancePlaceholder")} />
              </FormField>

              <FormField id="wo-validation" label={tk("workOrders.field.validation")} description={tk("workOrders.field.validationDescription")}>
                <Textarea id="wo-validation" disabled={!canCreate} value={draft.validationCommands?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, validationCommands: lines(e.target.value) })} placeholder="npm run typecheck&#10;npm run test --workspace @ai-kingdom/api&#10;npm run test --workspace @ai-kingdom/runner&#10;npm run test --workspace @ai-kingdom/web&#10;npm run build" />
              </FormField>

              {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
              {canCreate ? <Button className="h-11"><Send className="h-4 w-4" />{tk("workOrders.save")}</Button> : null}
              </form>
            </details>

            {selected && (
              <details className="text-xs text-muted-foreground mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer hover:underline font-semibold">{tk("workOrders.technicalDetails")}</summary>
                <div className="mt-2 space-y-1 bg-muted/20 p-3 rounded-md font-mono">
                  <div>ID: {selected.id}</div>
                  {selected.sourceType && <div>Source Type: {selected.sourceType}</div>}
                  {selected.sourceId && <div>Source ID: {selected.sourceId}</div>}
                  {selected.traceId && <div>Trace ID: {selected.traceId}</div>}
                  {selected.dataQuality && <div>Data Quality: {selected.dataQuality}</div>}
                  {selected.workQuality && <div>Work Quality: {selected.workQuality}</div>}
                  {selected.archiveReason && <div className="text-amber-300">Archive Reason: {selected.archiveReason}</div>}
                </div>
              </details>
            )}
          </Card>
          ) : null}

          {selected ? (
            <>
              {selected.sourceLink && selected.sourceLink.href && (
                <Card className="bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-primary">{selected.sourceLink.label}:</span>
                    <a href={selected.sourceLink.href} className="text-foreground hover:text-primary hover:underline font-medium">
                      {selected.sourceLink.title || selected.sourceLink.id}
                    </a>
                  </div>
                </Card>
              )}

              {/* M17E-2: Project Context binding panel */}
              <WorkOrderSection
                id="work-order-project-context"
                title="Project Context"
                description="Context binding is the source of truth for whether local patch automation is safe."
                source={{ label: "Open Projects", to: selected.projectId ? `/projects/${selected.projectId}` : "/projects" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Binding Status
                  </h3>
                  {canCreate ? (
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={contextBusy || !selected.projectId} onClick={() => void runRefreshContext()}>
                        {contextBusy ? "Working…" : "Refresh Context"}
                      </Button>
                      <Button variant="outline" disabled={contextBusy} onClick={() => void markContextStale()}>
                        Mark Context Stale
                      </Button>
                    </div>
                  ) : null}
                </div>
                {workOrderContext ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", contextStatusColor(workOrderContext.contextBindingStatus))}>
                        Context: {workOrderContext.contextBindingStatus}
                      </span>
                      {workOrderContext.contextBoundAt ? (
                        <span className="text-xs text-muted-foreground">bound {formatDate(workOrderContext.contextBoundAt)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">never bound</span>
                      )}
                    </div>
                    {reconcileMessage && (
                      <div className="rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-700">{reconcileMessage}</div>
                    )}
                    {workOrderContext.contextBindingStatus !== "FRESH" ? (
                      <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Context is {workOrderContext.contextBindingStatus} — SANDBOX_PATCH jobs are blocked until context is FRESH.
                        </div>
                        <div>{getContextGuidance(selected, workOrderContext)}</div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {selected.projectId && canCreate && (
                            <button
                              type="button"
                              disabled={contextBusy}
                              onClick={() => void runRefreshContext()}
                              className="font-semibold text-orange-700 underline hover:text-orange-900 disabled:opacity-50"
                            >
                              {contextBusy ? "Refreshing…" : "Refresh Context"}
                            </button>
                          )}
                          {!selected.projectId && (
                            <span className="text-orange-600">No linked project — assign a project first.</span>
                          )}
                          {canCreate && (
                            <button
                              type="button"
                              disabled={contextBusy}
                              onClick={() => void reconcileContext()}
                              className="font-semibold text-orange-500 underline hover:text-orange-700 disabled:opacity-50"
                            >
                              {contextBusy ? "Working…" : "Reconcile Old Work Orders"}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-1 text-xs text-muted-foreground font-mono">
                      <div>Local snapshot: {workOrderContext.localDocumentSnapshotId ?? "—"}</div>
                      <div>Repository snapshot: {workOrderContext.repositorySnapshotId ?? "—"}</div>
                      {renderContextSummary(workOrderContext.contextBindingSummary)}
                    </div>
                    {workOrderContext.current && workOrderContext.current.lines.length > 0 ? (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:underline">Current project context</summary>
                        <ul className="mt-1 space-y-0.5 list-disc pl-4">
                          {workOrderContext.current.lines.map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No context binding information available for this work order.</p>
                )}
              </WorkOrderSection>

              <WorkOrderSection
                id="work-order-agent"
                title="Suggested External Agent"
                description="Assignment stays on the Work Order, with registry details on the External Agents page."
                source={{ label: "Open External Agents", to: "/external-agents" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-foreground">Best Match</h3>
                </div>
                {assignMessage && (
                  <div className="mb-3 rounded-md border border-green-400/30 bg-green-400/10 p-2 text-xs text-green-700">{assignMessage}</div>
                )}
                {assignError && (
                  <div className="mb-3 rounded-md border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-300">{assignError}</div>
                )}
                {agentRecommendations.length === 0 || !agentRecommendations[0] ? (
                  <p className="text-xs text-muted-foreground">No active external agents available.</p>
                ) : (
                  <div className="space-y-3">
                    <AgentRecommendationCard
                      rec={agentRecommendations[0]}
                      busy={assigningAgent}
                      onUse={canCreate ? (id, name) => void assignExternalAgent(id, name) : undefined}
                    />
                    {agentRecommendations.length > 1 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:underline font-medium">
                          Alternatives ({agentRecommendations.length - 1})
                        </summary>
                        <ul className="mt-2 space-y-1.5 pl-1">
                          {agentRecommendations.slice(1).map((rec) => (
                            <li key={rec.externalAgentId} className="flex items-center justify-between gap-2">
                              <span>
                                {rec.name}
                                <span className={cn("ml-2 text-xs px-1 py-0 rounded", confidenceCls(rec.confidence))}>
                                  {rec.confidence}
                                </span>
                                <span className="ml-1 text-muted-foreground">({rec.score}/100)</span>
                              </span>
                              {canCreate && (
                                <button
                                  type="button"
                                  disabled={assigningAgent}
                                  className="text-primary hover:underline text-xs disabled:opacity-50"
                                  onClick={() => void assignExternalAgent(rec.externalAgentId, rec.name)}
                                >
                                  Use
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </WorkOrderSection>

              <WorkOrderSection
                id="work-order-prompt"
                title="External Prompt / Handoff"
                description="Generate or copy the prompt for the assigned external agent."
                source={{ label: "Review handoffs", to: "#work-order-handoff" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">Prompt Builder</h3>
                  <div className="flex gap-2">
                    {canCreate ? <Button onClick={() => void dispatch()} disabled={dispatching}><Send className="h-4 w-4" />{dispatching ? "Dispatching…" : "Dispatch to agent"}</Button> : null}
                    {canCreate ? <Button variant="outline" onClick={() => void buildPrompt()}><FileText className="h-4 w-4" />Generate</Button> : null}
                    {generatedPrompt ? <Button variant="outline" onClick={() => void copy(generatedPrompt)}><Clipboard className="h-4 w-4" />Copy</Button> : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Dispatch assigns the agent, builds the prompt, copies it, and moves the order to In Progress. Agents in API execution mode run automatically and file their report; manual agents are handed off for copy-paste.</p>
                {dispatchMessage ? <p className="mt-2 text-xs text-emerald-600">{dispatchMessage}</p> : null}
                {dispatchError ? <p className="mt-2 text-xs text-destructive">{dispatchError}</p> : null}
                <FormField id="wo-prompt" label="Generated Prompt" className="mt-4">
                  <Textarea id="wo-prompt" className="min-h-72 font-mono text-xs" value={generatedPrompt} onChange={(e) => setGeneratedPrompt(e.target.value)} placeholder="Generated copy-paste prompt appears here." />
                </FormField>
              </WorkOrderSection>

              {canReport ? (
                <WorkOrderSection
                  id="work-order-submit-report"
                  title="Submit Report"
                  description="Capture implementation evidence without changing the work-order lifecycle rules."
                  source={{ label: "Review reports", to: "#work-order-history" }}
                >
                  <form className="mt-4 space-y-3" onSubmit={submitReport}>
                    <FormField id="ir-summary" label="Summary">
                      <Textarea id="ir-summary" value={reportDraft.summary} onChange={(e) => setReportDraft({ ...reportDraft, summary: e.target.value })} placeholder="Brief description of what was implemented." />
                    </FormField>
                    <FormField id="ir-files" label="Files Changed" description="One file path per line.">
                      <Textarea id="ir-files" value={reportDraft.filesChanged?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, filesChanged: lines(e.target.value) })} placeholder="apps/web/src/pages/Example.tsx" />
                    </FormField>
                    <FormField id="ir-commands" label="Commands Run" description="One command per line.">
                      <Textarea id="ir-commands" value={reportDraft.commandsRun?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, commandsRun: lines(e.target.value) })} placeholder="npm run typecheck" />
                    </FormField>
                    <FormField id="ir-tests" label="Tests Run" description="One test name or file per line.">
                      <Textarea id="ir-tests" value={reportDraft.testsRun?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, testsRun: lines(e.target.value) })} placeholder="src/services/example.test.ts" />
                    </FormField>
                    <FormField id="ir-result" label="Test Result">
                      <select id="ir-result" className={selectCls} value={reportDraft.testResult} onChange={(e) => setReportDraft({ ...reportDraft, testResult: e.target.value as ImplementationReportPayload["testResult"] })}>
                        {["NOT_RUN", "PASSED", "FAILED", "PARTIAL"].map((result) => <option key={result} value={result}>{result}</option>)}
                      </select>
                    </FormField>
                    <FormField id="ir-decisions" label="Decisions Made" description="One decision per line.">
                      <Textarea id="ir-decisions" value={reportDraft.decisionsMade?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, decisionsMade: lines(e.target.value) })} placeholder="Chose approach X because…" />
                    </FormField>
                    <FormField id="ir-errors" label="Issues Found" description="One issue per line.">
                      <Textarea id="ir-errors" value={reportDraft.errors?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, errors: lines(e.target.value) })} placeholder="Error message or issue description" />
                    </FormField>
                    <FormField id="ir-remaining" label="Remaining Work" description="One item per line.">
                      <Textarea id="ir-remaining" value={reportDraft.remainingWork?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, remainingWork: lines(e.target.value) })} placeholder="Still needs…" />
                    </FormField>
                    <FormField id="ir-next" label="Recommended Next Step">
                      <Input id="ir-next" value={reportDraft.nextRecommendedAction ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, nextRecommendedAction: e.target.value })} placeholder="The next recommended action is…" />
                    </FormField>
                    <Button>Submit Report</Button>
                  </form>
                </WorkOrderSection>
              ) : null}

              {/* Automation Jobs panel */}
              {user?.role === "KING" && (
                <WorkOrderSection
                  id="work-order-automation"
                  title="Runner Automation"
                  description="Automation jobs are the source of runner and patch execution status."
                  source={{ label: "Open Automation Jobs", to: "/automation-jobs" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      Sandbox Patch Job
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void createJob(false)}
                        disabled={creatingJob || Boolean(automationBlockedReason)}
                      >
                        <Play className="h-4 w-4" />
                        {creatingJob ? "Creating…" : `Create ${getCreateJobLabel(draft.executionTarget ?? selected.executionTarget ?? "RUNNER_PATCH")}`}
                      </Button>
                      {selected?.assignedExternalAgentId ? (
                        <Button
                          onClick={() => void createJob(true)}
                          disabled={creatingJob || Boolean(automationBlockedReason)}
                          title="Runner drives the assigned agent's CLI to make real edits, then captures the diff as a patch for your review (no push)."
                        >
                          <Bot className="h-4 w-4" />
                          {creatingJob ? "Creating…" : "Run with Agent CLI"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {automationBlockedReason ? (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {automationBlockedReason}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                      Context is FRESH and no active automation job is blocking a runner request.
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {automationJobs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No automation jobs for this work order.</p>
                    ) : (
                      automationJobs.map((job) => (
                        <div key={job.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
                          <div>
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border mr-2",
                              job.status === "QUEUED" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              job.status === "APPROVED" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              job.status === "RUNNING" || job.status === "CLAIMED" ? "bg-orange-50 text-orange-700 border-orange-200" :
                              job.status === "NEEDS_REVIEW" ? "bg-purple-50 text-purple-700 border-purple-200" :
                              job.status === "COMPLETED" ? "bg-green-50 text-green-700 border-green-200" :
                              "bg-muted text-muted-foreground border-border"
                            )}>{job.status}</span>
                            <span className="text-xs text-muted-foreground">{job.mode} · {formatDate(job.createdAt)}</span>
                            {job.externalAgentRuns?.[0] ? <span className="ml-2 text-xs text-muted-foreground">run {job.externalAgentRuns[0].status}</span> : null}
                            {job.agent && <span className="ml-2 text-xs text-muted-foreground">via {job.agent.name}</span>}
                          </div>
                          {job.status === "QUEUED" && (
                            <Button
                              variant="outline"
                              className="h-8 text-xs px-3"
                              disabled={approvingJob === job.id}
                              onClick={() => void approveJob(job.id)}
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </WorkOrderSection>
              )}

              {/* Patch Artifacts panel */}
              {user?.role === "KING" && patchArtifacts.length > 0 && (
                <WorkOrderSection
                  id="work-order-patch-review"
                  title="Patch Review"
                  description="Review imported or runner-generated patch artifacts before approving."
                  source={{ label: "Open Automation Jobs", to: "/automation-jobs" }}
                >
                  <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    Patches Needing Review
                  </h3>
                  <div className="space-y-3">
                    {patchArtifacts.map((artifact) => (
                      <PatchArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        isActing={patchActionId === artifact.id}
                        onApprove={() => void approvePatch(artifact.id)}
                        onReject={() => void rejectPatch(artifact.id)}
                      />
                    ))}
                  </div>
                </WorkOrderSection>
              )}

              <WorkOrderSection
                id="work-order-history"
                title="History / Reports"
                description="Handoff briefs and implementation reports are review evidence for this work order."
                source={{ label: "Open Work Orders", to: "/work-orders" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="work-order-handoff" className="text-base font-semibold text-foreground">Handoff Briefs</h3>
                  {canCreate ? <Button variant="outline" onClick={() => void handoff()}><Handshake className="h-4 w-4" />Generate Handoff</Button> : null}
                </div>
                <div className="mt-4 space-y-3">
                  {(selected.handoffBriefs?.length ?? 0) === 0 && (selected.implementationReports?.length ?? 0) === 0 ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      No handoff briefs or reports have been recorded yet.
                    </div>
                  ) : null}
                  {(selected.handoffBriefs ?? []).map((brief) => (
                    <div key={brief.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{brief.title}</div>
                        <Button variant="outline" onClick={() => void copy(brief.handoffPrompt)}>Copy</Button>
                      </div>
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{brief.handoffPrompt}</pre>
                    </div>
                  ))}
                  {(selected.implementationReports ?? []).map((report) => (
                    <div key={report.id} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                      <div className="font-medium">{report.summary}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{report.testResult} · {formatDate(report.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </WorkOrderSection>
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}

function toPayload(order: WorkOrderDto): WorkOrderPayload {
  return {
    title: order.title,
    objective: order.objective,
    context: order.context,
    instructions: order.instructions,
    constraints: order.constraints,
    acceptanceCriteria: order.acceptanceCriteria,
    validationCommands: order.validationCommands,
    projectId: order.projectId,
    targetProject: order.targetProject,
    targetRepository: order.targetRepository,
    sourceType: order.sourceType,
    sourceId: order.sourceId,
    assignedExternalAgentId: order.assignedExternalAgentId,
    status: order.status,
    priority: order.priority
  };
}

function cleanWorkOrder(order: WorkOrderPayload): WorkOrderPayload {
  return {
    ...order,
    acceptanceCriteria: order.acceptanceCriteria ?? [],
    validationCommands: order.validationCommands ?? [],
    projectId: order.projectId || null,
    assignedExternalAgentId: order.assignedExternalAgentId || null,
    targetProject: order.targetProject || null,
    targetRepository: order.targetRepository || null
  };
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value);
}

function riskColor(risk: string) {
  switch (risk) {
    case "LOW": return "text-green-700 bg-green-50 border-green-200";
    case "MEDIUM": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "HIGH": return "text-orange-700 bg-orange-50 border-orange-200";
    case "CRITICAL": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

export function contextStatusColor(status: string) {
  switch (status) {
    case "FRESH": return "text-green-700 bg-green-50 border-green-200";
    case "PARTIAL": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "STALE": return "text-orange-700 bg-orange-50 border-orange-200";
    case "MISSING": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function renderContextSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary) return null;
  const scannedAt = typeof summary.localSnapshotScannedAt === "string" ? summary.localSnapshotScannedAt : null;
  const branch = typeof summary.repositoryBranch === "string" ? summary.repositoryBranch : null;
  const commit = typeof summary.repositoryCommitSha === "string" ? summary.repositoryCommitSha : null;
  const stack = Array.isArray(summary.detectedStack) ? (summary.detectedStack as string[]) : [];
  const docs = Array.isArray(summary.importantDocs) ? (summary.importantDocs as string[]) : [];
  const scripts = summary.packageScripts && typeof summary.packageScripts === "object" ? Object.keys(summary.packageScripts as Record<string, string>) : [];
  const riskZones = Array.isArray(summary.riskZones) ? (summary.riskZones as { relativePath: string; riskLevel: string }[]) : [];
  return (
    <>
      {scannedAt ? <div>Scanned at: {formatDate(scannedAt)}</div> : null}
      {commit ? <div>Repository commit: {commit}</div> : null}
      {branch ? <div>Repository branch: {branch}</div> : null}
      {stack.length > 0 ? <div>Stack: {stack.join(", ")}</div> : null}
      {docs.length > 0 ? <div>Important docs: {docs.slice(0, 8).join(", ")}{docs.length > 8 ? ` +${docs.length - 8} more` : ""}</div> : null}
      {scripts.length > 0 ? <div>Package scripts: {scripts.join(", ")}</div> : null}
      {riskZones.length > 0 ? <div>Risk zones: {riskZones.slice(0, 5).map((z) => `${z.relativePath} (${z.riskLevel})`).join(", ")}</div> : null}
    </>
  );
}

function validationStatusColor(status: string) {
  switch (status) {
    case "APPROVED": return "text-green-700 bg-green-50 border-green-200";
    case "REJECTED": return "text-red-700 bg-red-50 border-red-200";
    case "REVISION_REQUESTED": return "text-orange-700 bg-orange-50 border-orange-200";
    default: return "text-purple-700 bg-purple-50 border-purple-200";
  }
}

function renderRiskZonesTouched(artifact: PatchArtifactDto) {
  const provenance = artifact.baseContextProvenance;
  const summary = provenance && typeof provenance === "object" ? (provenance as Record<string, unknown>).contextValidationSummary : null;
  const riskZones = summary && typeof summary === "object" && Array.isArray((summary as Record<string, unknown>).riskZones)
    ? ((summary as Record<string, unknown>).riskZones as { relativePath: string; riskLevel: string; reason?: string }[])
    : [];
  const touched = riskZones.filter((zone) => artifact.filesChanged.some((file) => file === zone.relativePath || file.endsWith(zone.relativePath) || zone.relativePath.endsWith(file)));
  if (touched.length === 0) return null;
  return (
    <div className="text-xs text-orange-700">
      Risk zones touched: {touched.map((z) => `${z.relativePath} (${z.riskLevel})`).join(", ")}
    </div>
  );
}

function PatchArtifactCard({
  artifact,
  isActing,
  onApprove,
  onReject
}: {
  artifact: PatchArtifactDto;
  isActing: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const isHighRisk = artifact.riskLevel === "HIGH" || artifact.riskLevel === "CRITICAL";

  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", riskColor(artifact.riskLevel))}>
            {isHighRisk && <AlertTriangle className="h-3 w-3 inline mr-1" />}
            {artifact.riskLevel} risk
          </span>
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", validationStatusColor(artifact.validationStatus))}>
            {artifact.validationStatus}
          </span>
          {artifact.branchPushed && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium border text-blue-700 bg-blue-50 border-blue-200 flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {artifact.branchName}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(artifact.createdAt)}</span>
      </div>

      <p className="font-medium">{artifact.title}</p>
      <p className="text-xs text-muted-foreground">{artifact.summary}</p>

      {artifact.filesChanged.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Files: {artifact.filesChanged.slice(0, 5).join(", ")}
          {artifact.filesChanged.length > 5 && ` +${artifact.filesChanged.length - 5} more`}
        </div>
      )}

      {artifact.diffStat && (
        <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-24 font-mono">{artifact.diffStat}</pre>
      )}

      {isHighRisk && artifact.validationStatus === "PENDING" && (
        <div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
          <Shield className="h-3.5 w-3.5" />
          HIGH/CRITICAL risk — King approval required before branch push
        </div>
      )}

      {/* M17E-2: Base Context Used */}
      <div className="rounded border border-border bg-muted/20 p-2 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Base Context Used</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", contextStatusColor(artifact.baseContextStatus ?? "MISSING"))}>
            {artifact.baseContextStatus ?? "MISSING"}
          </span>
        </div>
        {(artifact.baseContextStatus === "STALE" || artifact.baseContextStatus === "MISSING" || !artifact.baseContextStatus) && (
          <div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Patch was created from {artifact.baseContextStatus ?? "MISSING"} project context — verify against the current repository state before approving.
          </div>
        )}
        <div className="grid gap-0.5 text-xs text-muted-foreground font-mono">
          <div>Local docs snapshot: {artifact.localDocumentSnapshotId ?? "—"}</div>
          <div>Repository snapshot: {artifact.repositorySnapshotId ?? "—"}</div>
        </div>
        {renderRiskZonesTouched(artifact)}
      </div>

      {artifact.diffPreview && (
        <div>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setShowDiff(!showDiff)}
          >
            {showDiff ? "Hide diff preview" : "Show diff preview"}
          </button>
          {showDiff && (
            <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
              {artifact.diffPreview}
              {artifact.fullPatchTruncated && "\n...[diff truncated]"}
            </pre>
          )}
        </div>
      )}

      {artifact.validationResults && artifact.validationResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Validation</p>
          {artifact.validationResults.map((vr, i) => (
            <div key={i} className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                {vr.success
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  : <XCircle className="h-3.5 w-3.5 text-red-600" />
                }
                <span className="font-mono">{vr.command}</span>
                <span className="text-muted-foreground">
                  {vr.timedOut ? "timed out" : `exit ${vr.exitCode ?? "?"}`} · {vr.durationMs}ms
                </span>
                {vr.outputTruncated && <span className="text-yellow-700">output truncated</span>}
              </div>
              {vr.cwd && <div className="text-[11px] text-muted-foreground">cwd: {vr.cwd}</div>}
              {vr.timedOut && vr.message && <div className="text-[11px] text-red-600">{vr.message}</div>}
              {!vr.success && vr.failureSummary && (
                <div>
                  <div className="text-[11px] font-medium text-red-700">Failure summary</div>
                  <ValidationOutput text={vr.failureSummary} />
                </div>
              )}
              {!vr.success && (
                <ValidationOutput
                  text={`CWD: ${vr.cwd ?? "unknown"}\n${vr.timedOut ? `TIMED OUT: ${vr.message ?? ""}\n` : ""}STDOUT:\n${vr.stdout?.trim() || "(no stdout)"}\nSTDERR:\n${vr.stderr?.trim() || "(no stderr)"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {artifact.validationStatus === "PENDING" && (
        <div className="flex gap-2 pt-1 border-t">
          <Button className="h-7 text-xs px-3" onClick={onApprove} disabled={isActing}>
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
          <Button className="h-7 text-xs px-3 text-destructive border-destructive/30" variant="outline" onClick={onReject} disabled={isActing}>
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
        </div>
      )}

      {artifact.reviewedByUser && (
        <p className="text-xs text-muted-foreground">
          Reviewed by {artifact.reviewedByUser.displayName}
          {artifact.reviewNote && ` — "${artifact.reviewNote}"`}
        </p>
      )}
    </div>
  );
}

function confidenceCls(confidence: "HIGH" | "MEDIUM" | "LOW"): string {
  if (confidence === "HIGH") return "bg-green-500/15 text-green-700 border border-green-500/30";
  if (confidence === "MEDIUM") return "bg-amber-500/15 text-amber-700 border border-amber-500/30";
  return "bg-muted text-muted-foreground border border-border";
}

function AgentRecommendationCard({
  rec,
  busy,
  onUse
}: {
  rec: ExternalAgentRecommendationDto;
  busy?: boolean;
  onUse?: (id: string, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{rec.name}</span>
          <span className={cn("text-xs px-1.5 py-0.5 rounded", confidenceCls(rec.confidence))}>
            {rec.confidence}
          </span>
          <span className="text-xs text-muted-foreground">{rec.score}/100</span>
        </div>
        <div className="text-xs text-muted-foreground">{rec.roleTitle}</div>
        {rec.reasons.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            {rec.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {rec.risks.length > 0 && (
          <ul className="text-xs text-amber-700 list-none space-y-0.5">
            {rec.risks.map((r, i) => <li key={i}>⚠ {r}</li>)}
          </ul>
        )}
      </div>
      {onUse && (
        <Button variant="outline" disabled={busy} onClick={() => onUse(rec.externalAgentId, rec.name)}>
          {busy ? "Assigning…" : "Use This Agent"}
        </Button>
      )}
    </div>
  );
}
