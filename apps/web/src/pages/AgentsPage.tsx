import { FormEvent, useState } from "react";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useKingdomStore } from "@/stores/kingdomStore";
import type { AgentDto, AgentPayload } from "@/types/api";

const blankAgent: AgentPayload = {
  name: "",
  title: "",
  role: "",
  specialty: "",
  description: "",
  systemPrompt: "",
  skills: [],
  responseStyle: "concise, structured, practical",
  isActive: true,
  priority: 100,
  defaultModel: "",
  temperature: null,
  maxTokens: null
};

export function AgentsPage() {
  const agents = useKingdomStore((state) => state.agents);
  const createAgent = useKingdomStore((state) => state.createAgent);
  const updateAgent = useKingdomStore((state) => state.updateAgent);
  const deleteAgent = useKingdomStore((state) => state.deleteAgent);
  const [selected, setSelected] = useState<AgentDto | null>(agents[0] ?? null);
  const [draft, setDraft] = useState<AgentPayload>(selected ? toPayload(selected) : blankAgent);
  const [error, setError] = useState<string | null>(null);

  function selectAgent(agent: AgentDto | null) {
    setSelected(agent);
    setDraft(agent ? toPayload(agent) : blankAgent);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (selected) {
        const updated = await updateAgent(selected.id, cleanPayload(draft));
        setSelected(updated);
      } else {
        const created = await createAgent(cleanPayload(draft));
        setSelected(created);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save agent");
    }
  }

  async function toggleActive(agent: AgentDto) {
    setError(null);
    try {
      await updateAgent(agent.id, { isActive: !agent.isActive });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update agent");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Agent Registry"
        title="Royal AI agents"
        description="Manage council agents, prompts, priorities, skills, and model overrides without editing code."
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Button className="w-full" onClick={() => selectAgent(null)}>Create New Agent</Button>
          {agents.map((agent) => (
            <Card key={agent.id} className={cn("transition", selected?.id === agent.id && "border-primary/60 bg-primary/10")}>
              <button className="w-full text-left" onClick={() => selectAgent(agent)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{agent.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{agent.name} · priority {agent.priority}</p>
                  </div>
                  <Shield className={cn("h-5 w-5", agent.isActive ? "text-primary" : "text-muted-foreground")} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{agent.description || agent.specialty}</p>
              </button>
              <div className="mt-4 flex justify-between gap-2">
                <Button variant="outline" onClick={() => void toggleActive(agent)} disabled={agent.slug === "grand-vizier"}>
                  {agent.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="outline" onClick={() => void deleteAgent(agent.id)} disabled={agent.slug === "grand-vizier"}>Soft Delete</Button>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="font-display text-2xl">{selected ? `Edit ${selected.title}` : "Create Agent"}</h2>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" />
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
              <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Role" />
              <Input value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} placeholder="Specialty" />
            </div>
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" />
            <Textarea className="min-h-44" value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} placeholder="System prompt" />
            <Textarea value={draft.responseStyle} onChange={(e) => setDraft({ ...draft, responseStyle: e.target.value })} placeholder="Response style" />
            <Input value={draft.skills.join(", ")} onChange={(e) => setDraft({ ...draft, skills: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Skills, comma separated" />
            <div className="grid gap-3 sm:grid-cols-4">
              <Input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} placeholder="Priority" />
              <Input value={draft.defaultModel ?? ""} onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })} placeholder="Default model" />
              <Input type="number" step="0.1" value={draft.temperature ?? ""} onChange={(e) => setDraft({ ...draft, temperature: e.target.value ? Number(e.target.value) : null })} placeholder="Temperature" />
              <Input type="number" value={draft.maxTokens ?? ""} onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value ? Number(e.target.value) : null })} placeholder="Max tokens" />
            </div>
            {error ? <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
            <Button>{selected ? "Save Agent" : "Create Agent"}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function toPayload(agent: AgentDto): AgentPayload {
  return {
    name: agent.name,
    title: agent.title,
    role: agent.role,
    specialty: agent.specialty,
    description: agent.description,
    systemPrompt: agent.systemPrompt || agent.prompt,
    skills: agent.skills,
    responseStyle: agent.responseStyle,
    isActive: agent.isActive,
    priority: agent.priority,
    defaultModel: agent.defaultModel,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens
  };
}

function cleanPayload(payload: AgentPayload): AgentPayload {
  return {
    ...payload,
    defaultModel: payload.defaultModel || null,
    temperature: payload.temperature ?? null,
    maxTokens: payload.maxTokens ?? null
  };
}
