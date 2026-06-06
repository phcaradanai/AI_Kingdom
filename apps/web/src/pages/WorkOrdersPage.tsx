import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clipboard, FileText, Handshake, Plus, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { ExternalAgentDto, ImplementationReportPayload, WorkOrderDto, WorkOrderPayload, WorkOrderPriority, WorkOrderStatus } from "@/types/api";

const blankWorkOrder: WorkOrderPayload = {
  title: "",
  objective: "",
  context: "",
  instructions: "",
  constraints: "",
  acceptanceCriteria: [],
  validationCommands: ["npm run typecheck", "npm run test"],
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

const statuses: WorkOrderStatus[] = ["DRAFT", "READY", "IN_PROGRESS", "NEEDS_REVIEW", "COMPLETED", "FAILED", "CANCELLED"];
const priorities: WorkOrderPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function WorkOrdersPage() {
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const canReport = user?.role === "KING" || user?.role === "CROWN_PRINCE" || user?.role === "MINISTER";
  const [workOrders, setWorkOrders] = useState<WorkOrderDto[]>([]);
  const [externalAgents, setExternalAgents] = useState<ExternalAgentDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkOrderPayload>(blankWorkOrder);
  const [reportDraft, setReportDraft] = useState(blankReport);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [taskId, setTaskId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => workOrders.find((order) => order.id === selectedId) ?? workOrders[0] ?? null, [selectedId, workOrders]);

  async function load() {
    const [orders, agents] = await Promise.all([
      api.workOrders({ status: statusFilter || undefined, priority: priorityFilter || undefined, externalAgentId: agentFilter || undefined }),
      api.externalAgents()
    ]);
    setWorkOrders(orders.workOrders);
    setExternalAgents(agents.externalAgents);
  }

  useEffect(() => {
    void load();
  }, [statusFilter, priorityFilter, agentFilter]);

  function select(order: WorkOrderDto | null) {
    setSelectedId(order?.id ?? null);
    setDraft(order ? toPayload(order) : blankWorkOrder);
    setGeneratedPrompt("");
    setError(null);
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
        setSelectedId(response.workOrder.id);
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save work order");
    }
  }

  async function generateFromTask() {
    if (!taskId.trim()) return;
    const response = await api.workOrderFromTask(taskId.trim());
    setSelectedId(response.workOrder.id);
    await load();
  }

  async function generateFromMatter() {
    if (!matterId.trim()) return;
    const response = await api.workOrderFromMatter(matterId.trim());
    setSelectedId(response.workOrder.id);
    await load();
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
              <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="">All priorities</option>
                {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
              <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                <option value="">All external agents</option>
                {externalAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </div>
          </Card>

          {canCreate ? (
            <Card>
              <h2 className="font-display text-lg">Generate from source</h2>
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="Task ID" />
                  <Button variant="outline" onClick={() => void generateFromTask()}>Task</Button>
                </div>
                <div className="flex gap-2">
                  <Input value={matterId} onChange={(e) => setMatterId(e.target.value)} placeholder="Matter ID" />
                  <Button variant="outline" onClick={() => void generateFromMatter()}>Matter</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {canCreate ? <Button className="w-full" onClick={() => select(null)}><Plus className="h-4 w-4" />Create Work Order</Button> : null}
          {workOrders.map((order) => (
            <Card key={order.id} className={cn("transition", selected?.id === order.id && "border-primary/60 bg-primary/10")}>
              <button className="w-full text-left" onClick={() => select(order)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg">{order.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.updatedAt)}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 text-xs">{order.priority}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{order.status}</span>
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
              <Input disabled={!canCreate} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
              <Textarea disabled={!canCreate} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} placeholder="Objective" />
              <Textarea disabled={!canCreate} value={draft.context ?? ""} onChange={(e) => setDraft({ ...draft, context: e.target.value })} placeholder="Context" />
              <Textarea disabled={!canCreate} value={draft.instructions ?? ""} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Instructions" />
              <Textarea disabled={!canCreate} value={draft.constraints ?? ""} onChange={(e) => setDraft({ ...draft, constraints: e.target.value })} placeholder="Constraints" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select disabled={!canCreate} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as WorkOrderStatus })}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select disabled={!canCreate} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkOrderPriority })}>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
                <select disabled={!canCreate} className="h-10 rounded-md border border-border bg-input px-3 text-sm sm:col-span-2" value={draft.assignedExternalAgentId ?? ""} onChange={(e) => setDraft({ ...draft, assignedExternalAgentId: e.target.value || null })}>
                  <option value="">Assign external agent</option>
                  {externalAgents.filter((agent) => agent.isActive).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </div>
              <Input disabled={!canCreate} value={draft.acceptanceCriteria?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, acceptanceCriteria: lines(e.target.value) })} placeholder="Acceptance criteria, one per line" />
              <Input disabled={!canCreate} value={draft.validationCommands?.join("\n") ?? ""} onChange={(e) => setDraft({ ...draft, validationCommands: lines(e.target.value) })} placeholder="Validation commands, one per line" />
              {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
              {canCreate ? <Button><Send className="h-4 w-4" />Save Work Order</Button> : null}
            </form>
          </Card>

          {selected ? (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg">External Prompt</h2>
                  <div className="flex gap-2">
                    {canCreate ? <Button variant="outline" onClick={() => void buildPrompt()}><FileText className="h-4 w-4" />Generate</Button> : null}
                    {generatedPrompt ? <Button variant="outline" onClick={() => void copy(generatedPrompt)}><Clipboard className="h-4 w-4" />Copy</Button> : null}
                  </div>
                </div>
                <Textarea className="mt-4 min-h-72 font-mono text-xs" value={generatedPrompt} onChange={(e) => setGeneratedPrompt(e.target.value)} placeholder="Generated copy-paste prompt appears here." />
              </Card>

              {canReport ? (
                <Card>
                  <h2 className="font-display text-lg">Implementation Report</h2>
                  <form className="mt-4 space-y-3" onSubmit={submitReport}>
                    <Textarea value={reportDraft.summary} onChange={(e) => setReportDraft({ ...reportDraft, summary: e.target.value })} placeholder="Summary" />
                    <Input value={reportDraft.filesChanged?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, filesChanged: lines(e.target.value) })} placeholder="Files changed, one per line" />
                    <Input value={reportDraft.commandsRun?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, commandsRun: lines(e.target.value) })} placeholder="Commands run, one per line" />
                    <Input value={reportDraft.testsRun?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, testsRun: lines(e.target.value) })} placeholder="Tests run, one per line" />
                    <select className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={reportDraft.testResult} onChange={(e) => setReportDraft({ ...reportDraft, testResult: e.target.value as ImplementationReportPayload["testResult"] })}>
                      {["NOT_RUN", "PASSED", "FAILED", "PARTIAL"].map((result) => <option key={result} value={result}>{result}</option>)}
                    </select>
                    <Input value={reportDraft.decisionsMade?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, decisionsMade: lines(e.target.value) })} placeholder="Decisions made, one per line" />
                    <Input value={reportDraft.errors?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, errors: lines(e.target.value) })} placeholder="Issues found, one per line" />
                    <Input value={reportDraft.remainingWork?.join("\n") ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, remainingWork: lines(e.target.value) })} placeholder="Remaining work, one per line" />
                    <Input value={reportDraft.nextRecommendedAction ?? ""} onChange={(e) => setReportDraft({ ...reportDraft, nextRecommendedAction: e.target.value })} placeholder="Recommended next step" />
                    <Button>Submit Report</Button>
                  </form>
                </Card>
              ) : null}

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
    assignedExternalAgentId: order.assignedExternalAgentId || null
  };
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value);
}
