import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  DirectAgentRequestType,
  DirectAgentSaveMode,
  DirectAgentSessionDto,
  DirectAgentSummaryDto,
  ProjectDto,
} from "@/types/api";
import type { AgentChatPane, AgentChatRailMode } from "./agentChatModels";

export function useAgentChatController() {
  const [agents, setAgents] = useState<DirectAgentSummaryDto[]>([]);
  const [sessions, setSessions] = useState<DirectAgentSessionDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSession, setSelectedSession] = useState<DirectAgentSessionDto | null>(null);
  const [requestType, setRequestType] = useState<DirectAgentRequestType>("GENERAL_QUESTION");
  const [saveMode, setSaveMode] = useState<DirectAgentSaveMode>("NONE");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [pane, setPane] = useState<AgentChatPane>("conversation");
  const [railMode, setRailMode] = useState<AgentChatRailMode>("agents");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const [agentResult, sessionResult, projectResult] = await Promise.all([
        api.getDirectAgentOptions(),
        api.getDirectAgentSessions(),
        api.projects({ status: "ACTIVE" }),
      ]);
      setAgents(agentResult.agents);
      setSessions(sessionResult.sessions);
      setProjects(projectResult.projects);
      setSelectedAgentId((current) => current || agentResult.agents[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load direct agent chat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadWorkspace(); }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? selectedSession?.agent ?? null,
    [agents, selectedAgentId, selectedSession],
  );

  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter((agent) => [agent.name, agent.title, agent.role, agent.specialty, agent.slug]
      .some((value) => value.toLowerCase().includes(query)));
  }, [agentSearch, agents]);

  async function loadSession(sessionId: string) {
    setError(null);
    try {
      const result = await api.getDirectAgentSession(sessionId);
      setSelectedSession(result.session);
      setSelectedAgentId(result.session.agentId);
      setProjectId(result.session.projectId ?? "");
      setRequestType(result.session.requestType);
      setPane("conversation");
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Failed to load direct agent session");
    }
  }

  function startNew(agentId?: string) {
    setSelectedSession(null);
    if (agentId) setSelectedAgentId(agentId);
    setTitle("");
    setPrompt("");
    setSaveMode("NONE");
    setError(null);
    setPane("conversation");
  }

  async function submit() {
    if (!prompt.trim()) return;
    if (!selectedSession && !selectedAgentId) {
      setError("Select an agent first.");
      setPane("browse");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const payload = { prompt: prompt.trim(), requestType, saveMode };
      const result = selectedSession
        ? await api.sendDirectAgentMessage(selectedSession.id, payload)
        : await api.createDirectAgentSession({
            ...payload,
            agentId: selectedAgentId,
            projectId: projectId || null,
            title: title.trim() || null,
          });
      setSelectedSession(result.session);
      setSelectedAgentId(result.session.agentId);
      setPrompt("");
      setPane("conversation");
      const sessionResult = await api.getDirectAgentSessions();
      setSessions(sessionResult.sessions);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return {
    agents, sessions, projects, selectedAgentId, selectedSession, selectedAgent, filteredAgents,
    requestType, setRequestType, saveMode, setSaveMode, projectId, setProjectId,
    title, setTitle, prompt, setPrompt, agentSearch, setAgentSearch,
    pane, setPane, railMode, setRailMode, loading, sending, error,
    loadWorkspace, loadSession, startNew, submit,
  };
}

export type AgentChatController = ReturnType<typeof useAgentChatController>;
