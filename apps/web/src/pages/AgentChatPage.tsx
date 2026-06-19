import { Archive, Bot, Brain, ExternalLink, FolderKanban, MessageSquare, Plus, Search, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AgentPortrait } from "@/components/AgentPortrait";
import { MarkdownDocument } from "@/components/ui/MarkdownDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type {
  DirectAgentRequestType,
  DirectAgentSaveMode,
  DirectAgentSessionDto,
  DirectAgentSummaryDto,
  ProjectDto
} from "@/types/api";

const requestOptions: Array<{ value: DirectAgentRequestType; label: string; icon: typeof MessageSquare }> = [
  { value: "GENERAL_QUESTION", label: "General", icon: MessageSquare },
  { value: "RESEARCH_ASSIGNMENT", label: "Research", icon: Search },
  { value: "SUMMARY_ASSIGNMENT", label: "Summary", icon: Sparkles },
  { value: "PERSONAL_TASK", label: "Personal Task", icon: Bot }
];

const saveOptions: Array<{ value: DirectAgentSaveMode; label: string }> = [
  { value: "NONE", label: "Do not save" },
  { value: "ARTIFACT", label: "Save artifact" },
  { value: "KNOWLEDGE_CANDIDATE", label: "Propose knowledge" },
  { value: "BOTH", label: "Artifact + knowledge" }
];

const promptExamples: Record<DirectAgentRequestType, string> = {
  GENERAL_QUESTION: "General, explain the tradeoffs of using multi-agent orchestration for this kingdom.",
  RESEARCH_ASSIGNMENT: "Researcher, prepare a reusable research brief about AI orchestration patterns, risks, and source ideas to verify.",
  SUMMARY_ASSIGNMENT: "Grand Vizier, summarize today's kingdom work, what needs attention, and the safest next action.",
  PERSONAL_TASK: "Please turn this idea into an actionable brief with constraints, next steps, and what needs King approval."
};

export function AgentChatPage() {
  const [agents, setAgents] = useState<DirectAgentSummaryDto[]>([]);
  const [sessions, setSessions] = useState<DirectAgentSessionDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<DirectAgentSessionDto | null>(null);
  const [requestType, setRequestType] = useState<DirectAgentRequestType>("GENERAL_QUESTION");
  const [saveMode, setSaveMode] = useState<DirectAgentSaveMode>("NONE");
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getDirectAgentOptions(),
      api.getDirectAgentSessions(),
      api.projects({ status: "ACTIVE" })
    ])
      .then(([agentResult, sessionResult, projectResult]) => {
        if (cancelled) return;
        setAgents(agentResult.agents);
        setSessions(sessionResult.sessions);
        setProjects(projectResult.projects);
        setSelectedAgentId(agentResult.agents[0]?.id ?? "");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load direct agent chat"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? selectedSession?.agent ?? null,
    [agents, selectedAgentId, selectedSession]
  );

  const filteredAgents = agents.filter((agent) => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return true;
    return [agent.name, agent.title, agent.role, agent.specialty, agent.slug].some((value) => value.toLowerCase().includes(query));
  });

  async function loadSession(sessionId: string) {
    setError(null);
    const result = await api.getDirectAgentSession(sessionId);
    setSelectedSession(result.session);
    setSelectedAgentId(result.session.agentId);
    setProjectId(result.session.projectId ?? "");
    setRequestType(result.session.requestType);
  }

  function startNew(agentId?: string) {
    setSelectedSession(null);
    if (agentId) setSelectedAgentId(agentId);
    setTitle("");
    setPrompt("");
    setSaveMode("NONE");
  }

  async function submit() {
    if (!prompt.trim()) return;
    if (!selectedSession && !selectedAgentId) {
      setError("Select an agent first.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const payload = { prompt, requestType, saveMode };
      const result = selectedSession
        ? await api.sendDirectAgentMessage(selectedSession.id, payload)
        : await api.createDirectAgentSession({
            ...payload,
            agentId: selectedAgentId,
            projectId: projectId || null,
            title: title || null
          });
      setSelectedSession(result.session);
      setSelectedAgentId(result.session.agentId);
      setPrompt("");
      const sessionResult = await api.getDirectAgentSessions();
      setSessions(sessionResult.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">Agent Chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Talk to one kingdom agent at a time, assign private advisory work, and save useful outputs for review.
          </p>
        </div>
        <Button variant="outline" onClick={() => startNew()}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid min-h-[calc(100vh-190px)] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_310px]">
        <aside className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agents</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search agents"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading agents...</div>
            ) : filteredAgents.map((agent) => (
              <button
                key={agent.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                  selectedAgentId === agent.id && !selectedSession
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background/40 hover:bg-muted/40"
                )}
                onClick={() => startNew(agent.id)}
              >
                <AgentPortrait agent={agent} size="xs" showStatusRing={false} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{agent.displayTitle ?? agent.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{agent.displayName ?? agent.name}</div>
                </div>
              </button>
            ))}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Sessions</div>
            <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
              {sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No direct sessions yet.</div>
              ) : sessions.map((session) => (
                <button
                  key={session.id}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition",
                    selectedSession?.id === session.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background/40 hover:bg-muted/40"
                  )}
                  onClick={() => void loadSession(session.id)}
                >
                  <div className="line-clamp-1 text-sm font-semibold text-foreground">{session.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{session.agent?.displayTitle ?? session.agent?.title ?? "Agent"}</span>
                    <span>{formatDate(session.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-h-[680px] flex-col rounded-lg border border-border bg-card/40">
          <div className="flex items-center gap-4 border-b border-border p-4">
            <AgentPortrait agent={selectedAgent} size="sm" status={sending ? "RESPONDING" : "IDLE"} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-xl font-semibold text-foreground">
                {selectedAgent?.displayTitle ?? selectedAgent?.title ?? "Select an agent"}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {selectedSession ? selectedSession.title : selectedAgent?.specialty ?? "Start a direct kingdom conversation"}
              </div>
            </div>
            {selectedSession?.latestTraceId && (
              <Link className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" to={`/usage-traces/${selectedSession.latestTraceId}`}>
                Trace <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!selectedSession ? (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
                <div className="max-w-md">
                  <Brain className="mx-auto h-10 w-10 text-primary" />
                  <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Direct agent workspace</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose a request mode, write the assignment, and decide whether the answer should become an artifact or reviewable knowledge candidate.
                  </p>
                </div>
              </div>
            ) : (
              selectedSession.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[88%] rounded-lg border p-4",
                    message.role === "USER"
                      ? "ml-auto border-primary/25 bg-primary/10"
                      : "border-border bg-background/55"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{message.role === "USER" ? "You" : selectedSession.agent?.displayTitle ?? selectedSession.agent?.title ?? "Agent"}</span>
                    <span>{formatDate(message.createdAt)}</span>
                  </div>
                  {message.role === "AGENT" ? (
                    <MarkdownDocument content={message.content} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{message.content}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border p-4">
            <Textarea
              className="min-h-28"
              placeholder="Ask or assign this agent directly..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" type="button" onClick={() => setPrompt(promptExamples[requestType])}>
                Use example
              </Button>
              <Button onClick={() => void submit()} disabled={sending || !prompt.trim() || (!selectedSession && !selectedAgentId)}>
                <Send className="h-4 w-4" />
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </main>

        <aside className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mode</div>
            <div className="grid grid-cols-2 gap-2">
              {requestOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-md border text-xs font-semibold transition",
                      requestType === option.value
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setRequestType(option.value)}
                    type="button"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="agent-chat-title">Title</label>
            <Input
              id="agent-chat-title"
              placeholder="Optional session title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={Boolean(selectedSession)}
            />
          </section>

          <section className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="agent-chat-project">
              <FolderKanban className="h-3.5 w-3.5" />
              Project Context
            </label>
            <select
              id="agent-chat-project"
              className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={Boolean(selectedSession)}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Archive className="h-3.5 w-3.5" />
              Save Output
            </div>
            <select
              className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              value={saveMode}
              onChange={(e) => setSaveMode(e.target.value as DirectAgentSaveMode)}
            >
              {saveOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </section>

          {selectedSession && (
            <section className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created Records</div>
              <SourceLink label="Usage trace" value={selectedSession.latestTraceId} href={selectedSession.latestTraceId ? `/usage-traces/${selectedSession.latestTraceId}` : null} />
              <SourceLink label="Artifact" value={selectedSession.artifactId} href={selectedSession.artifactId ? "/artifacts" : null} />
              <SourceLink label="Knowledge candidate" value={selectedSession.knowledgeCandidateId} href={selectedSession.knowledgeCandidateId ? "/knowledge-lab/candidates" : null} />
              {selectedSession.fallbackNotice && (
                <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
                  {selectedSession.fallbackNotice}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SourceLink({ label, value, href }: { label: string; value: string | null; href: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value && href ? (
        <Link className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" to={href}>
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      )}
    </div>
  );
}
