import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, Clipboard, FileText, Handshake, Plus, Play, Send, CheckSquare, Square, Trash2, Archive, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AutomationJobDto, ExternalAgentDto, ImplementationReportPayload, ProjectDto, WorkOrderDto, WorkOrderPayload, WorkOrderPriority, WorkOrderStatus } from "@/types/api";

const selectCls = "h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary";

const blankWorkOrder: WorkOrderPayload = {
  title: "",
  objective: "",
  context: "",
  instructions: "",
  constraints: "",
  acceptanceCriteria: [],
  validationCommands: ["npm run typecheck", "npm run test"],
  targetProject: "",
  targetRepository: "",
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

export function WorkOrdersPage() {
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const canReport = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [externalAgents, setExternalAgents] = useState<ExternalAgentDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkOrderPayload>(blankWorkOrder);
  const [reportDraft, setReportDraft] = useState(blankReport);
  
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

  const selected = useMemo(() => workOrders.find((order) => order.id === selectedId) ?? workOrders[0] ?? null, [selectedId, workOrders]);

  async function load() {
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
  }

  useEffect(() => {
    void load();
  }, [statusFilter, priorityFilter, agentFilter, includeArchived, includeLegacy, includeTestData]);

  function select(order: WorkOrderDto | null) {
    setSelectedId(order?.id ?? null);
    setDraft(order ? toPayload(order) : blankWorkOrder);
    setGeneratedPrompt("");
    setError(null);
    if (order) {
      api.automationJobs({ workOrderId: order.id })
        .then(setAutomationJobs)
        .catch(() => setAutomationJobs([]));
    } else {
      setAutomationJobs([]);
    }
  }

  async function createJob() {
    if (!selected || !canCreate) return;
    setCreatingJob(true);
    setError(null);
    try {
      await api.createAutomationJobForWorkOrder(selected.id, { mode: "SANDBOX_PATCH" });
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
      } else {
        setError("Work order generation skipped by central gate.");
      }
      await load();
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : "Unable to generate work order");
    }
  }

  async function buildPrompt() {
    if (!selected?.assignedExternalAgentId) {
      setError("Select an external agent before generating a prompt.");
      return;
    }
    const response = await api.buildWorkOrderPrompt(selected.id, selected.assignedExternalAgentId);
    setGeneratedPrompt(response.prompt);
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
        eyebrow="External Work"
        title="Work orders and handoffs"
        description="Create structured execution packages, copy prompts to external app agents, capture implementation reports, and generate handoff briefs."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-lg">Filters</h2>
            <div className="mt-4 grid gap-3">
              <FormField id="filter-status" label="Status">
                <select id="filter-status" className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                </select>
              </FormField>
              <FormField id="filter-priority" label="Priority">
                <select id="filter-priority" className={selectCls} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option value="">All priorities</option>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </FormField>
              <FormField id="filter-agent" label="External Agent">
                <select id="filter-agent" className={selectCls} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                  <option value="">All external agents</option>
                  {externalAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </FormField>
              <div className="mt-2 space-y-2 border-t border-border pt-3">
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                  <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded border-border" />
                  Show archived
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                  <input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} className="rounded border-border" />
                  Show legacy
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                  <input type="checkbox" checked={includeTestData} onChange={(e) => setIncludeTestData(e.target.checked)} className="rounded border-border" />
                  Show test/debug
                </label>
              </div>
            </div>
          </Card>

          {canCreate ? (
            <Card>
              <h2 className="font-display text-lg">Generate from source</h2>
              <div className="mt-4 space-y-3">
                <FormField id="gen-task-id" label="Task ID" description="Generate a work order from an existing royal decree/task.">
                  <div className="flex gap-2">
                    <Input id="gen-task-id" value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="Paste task ID" />
                    <Button type="button" variant="outline" onClick={() => void generateFromTask()}>Task</Button>
                  </div>
                </FormField>
                <FormField id="gen-matter-id" label="Matter ID" description="Generate a work order from a Secretary matter.">
                  <div className="flex gap-2">
                    <Input id="gen-matter-id" value={matterId} onChange={(e) => setMatterId(e.target.value)} placeholder="Paste matter ID" />
                    <Button type="button" variant="outline" onClick={() => void generateFromMatter()}>Matter</Button>
                  </div>
                </FormField>
              </div>
            </Card>
          ) : null}

          {canCreate ? <Button className="w-full" onClick={() => select(null)}><Plus className="h-4 w-4" />Create Work Order</Button> : null}

          {/* Bulk Actions */}
          {workOrders.length > 0 && canCreate && (
            <Card className="p-3 bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{selectedIds.length} selected</span>
                <Button variant="outline" className="h-7 text-xs px-2" onClick={toggleSelectAll}>
                  {selectedIds.length === workOrders.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              {selectedIds.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-7 text-xs px-2 flex items-center gap-1" onClick={handleBulkArchive}>
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                  <Button variant="outline" className="h-7 text-xs px-2 flex items-center gap-1" onClick={handleBulkComplete}>
                    <CheckCircle2 className="h-3 w-3" /> Complete
                  </Button>
                  <Button variant="outline" className="h-7 text-xs px-2 flex items-center gap-1" onClick={handleBulkLegacy}>
                    Mark Legacy
                  </Button>
                  <Button variant="outline" className="h-7 text-xs px-2 text-destructive flex items-center gap-1 hover:bg-destructive/10" onClick={handleBulkDelete}>
                    <Trash2 className="h-3 w-3" /> Delete Junk
                  </Button>
                </div>
              )}
            </Card>
          )}

          {workOrders.map((order) => (
            <Card key={order.id} className={cn("transition relative", selected?.id === order.id && "border-primary/60 bg-primary/10")}>
              {canCreate && (
                <button
                  type="button"
                  className="absolute top-4 left-4 z-10 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleSelect(order.id)}
                >
                  {selectedIds.includes(order.id) ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
              )}
              <button className={cn("w-full text-left", canCreate ? "pl-11" : "")} onClick={() => select(order)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg leading-tight">{order.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.updatedAt)}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{order.priority}</span>
                </div>
                {renderWorkOrderBadges(order)}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground border-t border-border/50 pt-2">
                  <span>{getStatusLabel(order.status)}</span>
                  {order.assignedExternalAgent ? <span>{order.assignedExternalAgent.name}</span> : <span>Unassigned</span>}
                </div>
              </button>
            </Card>
          ))}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="font-display text-2xl">{selectedId ? "Work Order Detail" : "Create Work Order"}</h2>
            <form className="mt-5 space-y-4" onSubmit={save}>
              <FormField id="wo-title" label="Title" required>
                <Input id="wo-title" disabled={!canCreate} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Short, descriptive title for this work order" />
              </FormField>

              <FormField id="wo-objective" label="Objective" description="Describe the result the external agent must achieve.">
                <Textarea id="wo-objective" disabled={!canCreate} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} placeholder="The external agent must…" />
              </FormField>

              <FormField id="wo-context" label="Context" description="Give project background and current state.">
                <Textarea id="wo-context" disabled={!canCreate} value={draft.context ?? ""} onChange={(e) => setDraft({ ...draft, context: e.target.value })} placeholder="Background, current state, relevant history…" />
              </FormField>

              <FormField id="wo-instructions" label="Instructions" description="Step-by-step execution guidance.">
                <Textarea id="wo-instructions" disabled={!canCreate} value={draft.instructions ?? ""} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="1. First step…" />
              </FormField>

              <FormField id="wo-constraints" label="Constraints" description="Rules the external agent must not violate.">
                <Textarea id="wo-constraints" disabled={!canCreate} value={draft.constraints ?? ""} onChange={(e) => setDraft({ ...draft, constraints: e.target.value })} placeholder="Do not modify… Do not expose…" />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="wo-status" label="Status">
                  <select id="wo-status" disabled={!canCreate} className={selectCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as WorkOrderStatus })}>
                    {statuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-priority" label="Priority">
                  <select id="wo-priority" disabled={!canCreate} className={selectCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkOrderPriority })}>
                    {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-agent" label="Assigned External Agent" className="sm:col-span-2">
                  <select id="wo-agent" disabled={!canCreate} className={selectCls} value={draft.assignedExternalAgentId ?? ""} onChange={(e) => setDraft({ ...draft, assignedExternalAgentId: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {externalAgents.filter((agent) => agent.isActive).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </FormField>
                <FormField id="wo-project" label="Target Project" className="sm:col-span-2">
                  <select id="wo-project" disabled={!canCreate} className={selectCls} value={draft.projectId ?? ""} onChange={(e) => setDraft({ ...draft, projectId: e.target.value || null })}>
                    <option value="">Auto-route (no override)</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </FormField>
              </div>

              <FormField id="wo-target-project" label="Target Project Name" description="Free-text name or description of the project this work targets.">
                <Input id="wo-target-project" disabled={!canCreate} value={draft.targetProject ?? ""} onChange={(e) => setDraft({ ...draft, targetProject: e.target.value })} placeholder="e.g. AI Kingdom web dashboard" />
              </FormField>

              <FormField id="wo-target-repo" label="Target Repository" description="Repository URL or path for the external agent to work in.">
                <Input id="wo-target-repo" disabled={!canCreate} value={draft.targetRepository ?? ""} onChange={(e) => setDraft({ ...draft, targetRepository: e.target.value })} placeholder="e.g. https://github.com/org/repo" />
              </FormField>

              <FormField id="wo-acceptance" label="Acceptance Criteria" description="One item per line.">
                <Textarea id="wo-acceptance" disabled={!canCreate} value={draft.acceptanceCriteria?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, acceptanceCriteria: lines(e.target.value) })} placeholder="All tests pass&#10;No console errors&#10;Feature works end-to-end" />
              </FormField>

              <FormField id="wo-validation" label="Validation Commands" description="One command per line.">
                <Textarea id="wo-validation" disabled={!canCreate} value={draft.validationCommands?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, validationCommands: lines(e.target.value) })} placeholder="npm run typecheck&#10;npm run test&#10;npm run build" />
              </FormField>

              {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
              {canCreate ? <Button><Send className="h-4 w-4" />Save Work Order</Button> : null}
            </form>

            {selected && (
              <details className="text-xs text-muted-foreground mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer hover:underline font-semibold">Technical Details</summary>
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

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg">External Prompt</h2>
                  <div className="flex gap-2">
                    {canCreate ? <Button variant="outline" onClick={() => void buildPrompt()}><FileText className="h-4 w-4" />Generate</Button> : null}
                    {generatedPrompt ? <Button variant="outline" onClick={() => void copy(generatedPrompt)}><Clipboard className="h-4 w-4" />Copy</Button> : null}
                  </div>
                </div>
                <FormField id="wo-prompt" label="Generated Prompt" className="mt-4">
                  <Textarea id="wo-prompt" className="min-h-72 font-mono text-xs" value={generatedPrompt} onChange={(e) => setGeneratedPrompt(e.target.value)} placeholder="Generated copy-paste prompt appears here." />
                </FormField>
              </Card>

              {canReport ? (
                <Card>
                  <h2 className="font-display text-lg">Implementation Report</h2>
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
                </Card>
              ) : null}

              {/* Automation Jobs panel */}
              {user?.role === "KING" && (
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-lg flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      Runner Automation
                    </h2>
                    <Button
                      variant="outline"
                      onClick={() => void createJob()}
                      disabled={creatingJob || automationJobs.some((j) => ["QUEUED","APPROVED","CLAIMED","RUNNING","NEEDS_REVIEW"].includes(j.status))}
                    >
                      <Play className="h-4 w-4" />
                      {creatingJob ? "Creating…" : "Create Automation Job"}
                    </Button>
                  </div>
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
                </Card>
              )}

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg">Handoff Briefs</h2>
                  {canCreate ? <Button variant="outline" onClick={() => void handoff()}><Handshake className="h-4 w-4" />Generate Handoff</Button> : null}
                </div>
                <div className="mt-4 space-y-3">
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
              </Card>
            </>
          ) : null}
        </div>
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
