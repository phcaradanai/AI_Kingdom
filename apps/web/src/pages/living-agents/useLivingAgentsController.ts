import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AgentPresenceDto, LivingAgentSummaryDto } from "@/types/api";
import { getAgentName, getAgentTitle, getRosterMetrics, matchesStateFilter } from "./livingAgentModels";
import type { LivingAgentPane, LivingAgentRecord, LivingAgentStateFilter } from "./livingAgentModels";

export function useLivingAgentsController() {
  const [agents, setAgents] = useState<LivingAgentSummaryDto[]>([]);
  const [presenceByAgent, setPresenceByAgent] = useState<Map<string, AgentPresenceDto> | null>(null);
  const [presenceComputedAt, setPresenceComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<LivingAgentStateFilter>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<LivingAgentPane>("roster");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [rosterResult, presenceResult] = await Promise.allSettled([
        api.getLivingAgents(),
        api.getKingdomPresence(),
      ]);
      if (!active) return;
      if (rosterResult.status === "rejected") {
        setError(rosterResult.reason instanceof Error ? rosterResult.reason.message : "Failed to load living agents");
        setLoading(false);
        return;
      }
      setAgents(rosterResult.value.agents);
      setSelectedId((current) => current ?? rosterResult.value.agents[0]?.id ?? null);
      if (presenceResult.status === "fulfilled") {
        setPresenceByAgent(new Map(presenceResult.value.agents.map((agent) => [agent.id, agent])));
        setPresenceComputedAt(presenceResult.value.computedAt);
      } else {
        setPresenceByAgent(null);
        setPresenceComputedAt(null);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const records = useMemo<LivingAgentRecord[]>(() => agents.map((agent) => ({
    agent,
    presence: presenceByAgent?.get(agent.id) ?? null,
  })), [agents, presenceByAgent]);

  const roles = useMemo(() => [...new Set(agents.map((agent) => agent.role))].sort(), [agents]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch = !query || [getAgentName(record.agent), getAgentTitle(record.agent), record.agent.role, record.agent.specialty]
        .some((value) => value.toLowerCase().includes(query));
      return matchesSearch && matchesStateFilter(record, stateFilter) && (roleFilter === "all" || record.agent.role === roleFilter);
    });
  }, [records, roleFilter, search, stateFilter]);

  const selected = filteredRecords.find((record) => record.agent.id === selectedId) ?? filteredRecords[0] ?? null;

  function selectAgent(id: string) {
    setSelectedId(id);
    setPane("details");
  }

  return {
    agents,
    error,
    filteredRecords,
    loading,
    metrics: getRosterMetrics(records),
    pane,
    presenceAvailable: presenceByAgent !== null,
    presenceComputedAt,
    roleFilter,
    roles,
    search,
    selected,
    selectedId,
    stateFilter,
    selectAgent,
    setPane,
    setRoleFilter,
    setSearch,
    setStateFilter,
  };
}

export type LivingAgentsController = ReturnType<typeof useLivingAgentsController>;
