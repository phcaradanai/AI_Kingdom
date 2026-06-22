import { FormEvent, useEffect, useState } from "react";
import { Bot, Play, Power, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { ExternalAgentDto, ExternalAgentPayload, ExternalAgentReadinessDto, ExternalAgentTestResultDto, ExternalAgentType } from "@/types/api";

const blankAgent: ExternalAgentPayload = {
  name: "",
  type: "CUSTOM",
  roleTitle: "",
  description: "",
  capabilities: [],
  executionMode: "MANUAL_COPY_PASTE",
  command: "",
  workingDirectory: "",
  environmentProfile: "",
  isActive: true,
  bridgeEnabled: false,
  maxRuntimeSeconds: 900,
  requiresApproval: true,
  safetyLevel: "MEDIUM_RISK"
};

const types: ExternalAgentType[] = ["CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES", "OPENCODE", "CURSOR", "DEVIN", "GENERIC_CLI", "MANUAL_ONLY", "CUSTOM"];

export function ExternalAgentsPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const [externalAgents, setExternalAgents] = useState<ExternalAgentDto[]>([]);
  const [readiness, setReadiness] = useState<Record<string, ExternalAgentReadinessDto>>({});
  const [runnerOnline, setRunnerOnline] = useState<boolean>(false);
  const [selected, setSelected] = useState<ExternalAgentDto | null>(null);
  const [draft, setDraft] = useState<ExternalAgentPayload>(blankAgent);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ExternalAgentTestResultDto | null>(null);
  const [testingAgent, setTestingAgent] = useState(false);

  async function load() {
    const response = await api.externalAgents();
    setExternalAgents(response.externalAgents);
    try {
      const report = await api.externalAgentReadiness();
      setRunnerOnline(report.runnerOnline);
      setReadiness(Object.fromEntries(report.agents.map((a) => [a.agentId, a])));
    } catch {
      // readiness is advisory; never block the page if it fails
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function select(agent: ExternalAgentDto | null) {
    setSelected(agent);
    setDraft(agent ? toPayload(agent) : blankAgent);
    setError(null);
    setTestResult(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isKing) return;
    setError(null);
    try {
      if (selected) {
        const response = await api.updateExternalAgent(selected.id, draft);
        setSelected(response.externalAgent);
      } else {
        const response = await api.createExternalAgent(draft);
        setSelected(response.externalAgent);
      }
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save external agent");
    }
  }

  async function toggle(agent: ExternalAgentDto) {
    if (!isKing) return;
    await api.updateExternalAgent(agent.id, { isActive: !agent.isActive });
    await load();
  }

  async function testAgent() {
    if (!selected || !isKing) return;
    setTestingAgent(true);
    setError(null);
    setTestResult(null);
    try {
      const response = await api.testExternalAgent(selected.id);
      setTestResult(response.test);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to test external agent");
    } finally {
      setTestingAgent(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="External Agent Bridge"
        title="External app agents"
        description="Manage manual handoff targets for Claude Code, Codex, Cline, Kilo, Antigravity, Hermes, OpenCode, and custom executors."
      />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground" data-testid="runner-readiness">
            {runnerOnline
              ? "Runner online — readiness reflects which agent CLIs are installed on the runner host right now."
              : "No online runner — external agents cannot execute until a runner is online. Readiness shown as unavailable."}
          </p>
          {isKing ? <Button className="w-full" onClick={() => select(null)}>Create External Agent</Button> : null}
          {externalAgents.map((agent) => (
            <Card key={agent.id}>
              <button className="w-full text-left" onClick={() => select(agent)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{agent.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{agent.roleTitle}</p>
                  </div>
                  <Bot className={agent.isActive ? "h-5 w-5 text-primary" : "h-5 w-5 text-muted-foreground"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">{agent.type}</span>
                  <span className="rounded-full border border-border px-2 py-1">{agent.executionMode}</span>
                  <span className="rounded-full border border-border px-2 py-1">{agent.safetyLevel}</span>
                  <span className="rounded-full border border-border px-2 py-1">{agent.bridgeEnabled ? "Bridge enabled" : "Manual"}</span>
                  {renderReadinessBadge(readiness[agent.id])}
                </div>
              </button>
              {isKing ? (
                <Button className="mt-4" variant="outline" onClick={() => void toggle(agent)}>
                  <Power className="h-4 w-4" />
                  {agent.isActive ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="font-display text-2xl">{selected ? selected.name : "External Agent"}</h2>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input disabled={!isKing} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" />
              <select disabled={!isKing} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ExternalAgentType })}>
                {types.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <Input disabled={!isKing} value={draft.roleTitle} onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })} placeholder="Role title" />
              <select disabled={!isKing} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.safetyLevel} onChange={(e) => setDraft({ ...draft, safetyLevel: e.target.value as ExternalAgentPayload["safetyLevel"] })}>
                {["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"].map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
            <Textarea disabled={!isKing} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" />
              <Input disabled={!isKing} value={draft.capabilities.join(", ")} onChange={(e) => setDraft({ ...draft, capabilities: csv(e.target.value) })} placeholder="Capabilities, comma separated" />
              <select disabled={!isKing} className="h-10 rounded-md border border-border bg-input px-3 text-sm" value={draft.executionMode} onChange={(e) => setDraft({ ...draft, executionMode: e.target.value as ExternalAgentPayload["executionMode"] })}>
                {["MANUAL_COPY_PASTE", "CLI_MANUAL", "API", "FUTURE_AUTOMATED"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <Textarea disabled={!isKing} value={draft.command ?? ""} onChange={(e) => setDraft({ ...draft, command: e.target.value })} placeholder="Command template, e.g. codex exec --full-auto {promptFile}" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input disabled={!isKing} value={draft.workingDirectory ?? ""} onChange={(e) => setDraft({ ...draft, workingDirectory: e.target.value })} placeholder="Working directory override" />
                <Input disabled={!isKing} value={draft.environmentProfile ?? ""} onChange={(e) => setDraft({ ...draft, environmentProfile: e.target.value })} placeholder="Environment profile" />
                <Input disabled={!isKing} type="number" min={30} max={7200} value={draft.maxRuntimeSeconds} onChange={(e) => setDraft({ ...draft, maxRuntimeSeconds: Number(e.target.value) })} placeholder="Max runtime seconds" />
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input disabled={!isKing} type="checkbox" checked={draft.bridgeEnabled} onChange={(e) => setDraft({ ...draft, bridgeEnabled: e.target.checked })} />
                  Bridge enabled
                </label>
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm sm:col-span-2">
                  <input disabled={!isKing} type="checkbox" checked={draft.requiresApproval} onChange={(e) => setDraft({ ...draft, requiresApproval: e.target.checked })} />
                  Require King approval before runner claim
                </label>
              </div>
            <div className="flex flex-wrap items-center justify-between">
              {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
              {isKing ? (
                <div className="flex flex-wrap gap-2">
                  {selected ? (
                    <Button type="button" variant="outline" disabled={testingAgent} onClick={() => void testAgent()}>
                      <Play className="h-4 w-4" />
                      {testingAgent ? "Testing..." : "Test External Agent"}
                    </Button>
                  ) : null}
                  <Button>
                    <Save className="h-4 w-4" />
                    {selected ? "Save External Agent" : "Create External Agent"}
                  </Button>
                </div>
              ) : null}
            </div>
            {testResult ? (
              <div className={testResult.status === "READY" ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm" : "rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"}>
                <div className="font-semibold">Bridge test: {testResult.status}</div>
                {testResult.issues.length ? <div className="mt-1 text-xs">{testResult.issues.join(" · ")}</div> : null}
                <div className="mt-2 text-xs text-muted-foreground">Command: {testResult.commandTemplate ?? "Not configured"}</div>
              </div>
            ) : null}

          </form>
        </Card>
      </div>
    </>
  );
}

function toPayload(agent: ExternalAgentDto): ExternalAgentPayload {
  return {
    name: agent.name,
    type: agent.type,
    roleTitle: agent.roleTitle,
    description: agent.description,
    capabilities: agent.capabilities,
    executionMode: agent.executionMode,
    command: agent.command,
    workingDirectory: agent.workingDirectory,
    environmentProfile: agent.environmentProfile,
    isActive: agent.isActive,
    bridgeEnabled: agent.bridgeEnabled,
    maxRuntimeSeconds: agent.maxRuntimeSeconds,
    requiresApproval: agent.requiresApproval,
    safetyLevel: agent.safetyLevel
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function renderReadinessBadge(readiness: ExternalAgentReadinessDto | undefined) {
  if (!readiness) return null;
  const ready = readiness.ready;
  return (
    <span
      title={readiness.reason}
      className={
        ready
          ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-600"
          : "rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-600"
      }
    >
      {ready ? "Ready" : `Offline — ${readiness.reason}`}
    </span>
  );
}
