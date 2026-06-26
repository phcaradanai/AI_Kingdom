import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CliProbeResultDto, ExternalAgentDto, ExternalAgentPayload, ExternalAgentReadinessDto, ExternalAgentTestResultDto } from "@/types/api";
import {
  blankExternalAgent,
  externalAgentCounts,
  filterExternalAgents,
  toExternalAgentPayload,
  type ExternalAgentEditorMode,
  type ExternalAgentFilter,
  type ExternalAgentSection,
} from "./externalAgentModels";

export function useExternalAgentsController(isKing: boolean) {
  const [agents, setAgents] = useState<ExternalAgentDto[]>([]);
  const [readiness, setReadiness] = useState<Record<string, ExternalAgentReadinessDto>>({});
  const [runnerOnline, setRunnerOnline] = useState(false);
  const [capabilitiesUpdatedAt, setCapabilitiesUpdatedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExternalAgentDto | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExternalAgentFilter>("all");
  const [section, setSection] = useState<ExternalAgentSection>("identity");
  const [editorMode, setEditorMode] = useState<ExternalAgentEditorMode>(null);
  const [draft, setDraft] = useState<ExternalAgentPayload>({ ...blankExternalAgent });
  const [deleteTarget, setDeleteTarget] = useState<ExternalAgentDto | null>(null);
  const [testResult, setTestResult] = useState<ExternalAgentTestResultDto | null>(null);
  const [liveProbeResult, setLiveProbeResult] = useState<CliProbeResultDto | null>(null);
  const [liveProbeLoading, setLiveProbeLoading] = useState(false);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.externalAgents();
      setAgents(response.externalAgents);
      setSelected((current) => response.externalAgents.find((agent) => agent.id === current?.id) ?? response.externalAgents[0] ?? null);
      try {
        const report = await api.externalAgentReadiness();
        setRunnerOnline(report.runnerOnline);
        setCapabilitiesUpdatedAt(report.capabilitiesUpdatedAt);
        setReadiness(Object.fromEntries(report.agents.map((agent) => [agent.agentId, agent])));
      } catch {
        setRunnerOnline(false);
        setCapabilitiesUpdatedAt(null);
        setReadiness({});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load external agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visibleAgents = useMemo(
    () => filterExternalAgents(agents, readiness, query, filter),
    [agents, readiness, query, filter],
  );
  const counts = useMemo(() => externalAgentCounts(agents, readiness), [agents, readiness]);

  const stopProbePolling = useCallback(() => {
    if (probeTimerRef.current !== null) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopProbePolling, [stopProbePolling]);

  function selectAgent(agent: ExternalAgentDto) {
    setSelected(agent);
    setSection("identity");
    setTestResult(null);
    setLiveProbeResult(null);
    stopProbePolling();
    setError(null);
  }

  function openCreate() {
    if (!isKing) return;
    setDraft({ ...blankExternalAgent, capabilities: [] });
    setEditorMode("create");
    setError(null);
  }

  function openEdit() {
    if (!isKing || !selected) return;
    setDraft(toExternalAgentPayload(selected));
    setEditorMode("edit");
    setError(null);
  }

  function closeEditor() {
    setEditorMode(null);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isKing || !editorMode) return;
    setSaving(true);
    setError(null);
    try {
      const response = editorMode === "edit" && selected
        ? await api.updateExternalAgent(selected.id, draft)
        : await api.createExternalAgent(draft);
      setSelected(response.externalAgent);
      setEditorMode(null);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save external agent");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!isKing || !selected) return;
    setError(null);
    try {
      const response = await api.updateExternalAgent(selected.id, { isActive: !selected.isActive });
      setSelected(response.externalAgent);
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update external agent");
    }
  }

  async function confirmDelete() {
    if (!isKing || !deleteTarget) return;
    setError(null);
    try {
      const response = await api.deleteExternalAgent(deleteTarget.id);
      setSelected(response.externalAgent);
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to deactivate external agent");
    }
  }

  async function testAgent() {
    if (!isKing || !selected) return;
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const response = await api.testExternalAgent(selected.id);
      setTestResult(response.test);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to test external agent");
    } finally {
      setTesting(false);
    }
  }

  async function runLiveProbe() {
    if (!isKing || !selected) return;
    setLiveProbeLoading(true);
    setLiveProbeResult(null);
    stopProbePolling();
    setError(null);
    const agentId = selected.id;
    try {
      await api.requestExternalAgentProbe(agentId);
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : "Unable to request live probe");
      setLiveProbeLoading(false);
      return;
    }

    // Poll for result every 3 s, give up after 90 s
    const deadline = Date.now() + 90_000;
    const poll = async () => {
      if (Date.now() > deadline) {
        setLiveProbeLoading(false);
        setError("Live probe timed out — the runner may not be responding");
        return;
      }
      try {
        const { result } = await api.getExternalAgentProbeResult(agentId);
        if (result) {
          setLiveProbeResult(result);
          setLiveProbeLoading(false);
          return;
        }
      } catch {
        // keep polling
      }
      probeTimerRef.current = setTimeout(() => { void poll(); }, 3_000);
    };
    probeTimerRef.current = setTimeout(() => { void poll(); }, 3_000);
  }

  return {
    agents, readiness, runnerOnline, capabilitiesUpdatedAt, selected, visibleAgents, counts,
    query, setQuery, filter, setFilter, section, setSection, editorMode, draft, setDraft,
    deleteTarget, setDeleteTarget, testResult, liveProbeResult, liveProbeLoading, loading, saving, testing, error,
    load, selectAgent, openCreate, openEdit, closeEditor, submit, toggleActive, confirmDelete, testAgent, runLiveProbe,
  };
}

export type ExternalAgentsController = ReturnType<typeof useExternalAgentsController>;
