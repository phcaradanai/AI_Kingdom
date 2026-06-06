import { FormEvent, useEffect, useState } from "react";
import { Bot, Power, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { ExternalAgentDto, ExternalAgentPayload, ExternalAgentType } from "@/types/api";

const blankAgent: ExternalAgentPayload = {
  name: "",
  type: "CUSTOM",
  roleTitle: "",
  description: "",
  capabilities: [],
  executionMode: "MANUAL_COPY_PASTE",
  isActive: true,
  safetyLevel: "MEDIUM_RISK"
};

const types: ExternalAgentType[] = ["CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES", "OPENCODE", "CUSTOM"];

export function ExternalAgentsPage() {
  const user = useAuthStore((state) => state.user);
  const isKing = user?.role === "KING";
  const [externalAgents, setExternalAgents] = useState<ExternalAgentDto[]>([]);
  const [selected, setSelected] = useState<ExternalAgentDto | null>(null);
  const [draft, setDraft] = useState<ExternalAgentPayload>(blankAgent);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await api.externalAgents();
    setExternalAgents(response.externalAgents);
  }

  useEffect(() => {
    void load();
  }, []);

  function select(agent: ExternalAgentDto | null) {
    setSelected(agent);
    setDraft(agent ? toPayload(agent) : blankAgent);
    setError(null);
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

  return (
    <>
      <PageHeader
        eyebrow="External Agent Bridge"
        title="External app agents"
        description="Manage manual handoff targets for Claude Code, Codex, Cline, Kilo, Antigravity, Hermes, OpenCode, and custom executors."
      />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
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
            <div className="flex flex-wrap items-center justify-between">
              {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
              {isKing ? (
                <Button>
                  <Save className="h-4 w-4" />
                  {selected ? "Save External Agent" : "Create External Agent"}
                </Button>
              ) : null}
            </div>

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
    isActive: agent.isActive,
    safetyLevel: agent.safetyLevel
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
