import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useTk } from "@/lib/i18n";
import { useAuthStore } from "@/stores/authStore";
import type {
  ArtifactDto,
  KingdomAssetDto,
  KingdomObjectiveDto,
  KingdomOpportunityDto,
  RevenueStreamDto,
  StrategyAssetPayload,
  StrategyObjectivePayload,
  StrategyOpportunityPayload,
  StrategyOverviewDto,
  StrategyRevenueStreamPayload,
} from "@/types/api";
import {
  normalizePayload,
  recordId,
  recordMatches,
  type StrategyEditorState,
  type StrategyPayload,
  type StrategyRecordType,
  type StrategySection,
} from "./strategyModels";

export function useStrategyController() {
  const tk = useTk();
  const user = useAuthStore((state) => state.user);
  const canEdit = user?.role === "KING" || user?.role === "CROWN_PRINCE";
  const [overview, setOverview] = useState<StrategyOverviewDto | null>(null);
  const [objectives, setObjectives] = useState<KingdomObjectiveDto[]>([]);
  const [opportunities, setOpportunities] = useState<KingdomOpportunityDto[]>([]);
  const [assets, setAssets] = useState<KingdomAssetDto[]>([]);
  const [revenueStreams, setRevenueStreams] = useState<RevenueStreamDto[]>([]);
  const [researchArtifacts, setResearchArtifacts] = useState<ArtifactDto[]>([]);
  const [activeSection, setActiveSection] = useState<StrategySection>("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editor, setEditor] = useState<StrategyEditorState>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [overviewResult, objectiveResult, opportunityResult, assetResult, revenueResult, artifactResult] =
        await Promise.all([
          api.getStrategyOverview(),
          api.strategyObjectives(),
          api.strategyOpportunities(),
          api.strategyAssets(),
          api.strategyRevenueStreams(),
          api.artifacts({ type: "MARKET_RESEARCH" }),
        ]);
      setOverview(overviewResult.overview);
      setObjectives(objectiveResult.objectives);
      setOpportunities(opportunityResult.opportunities);
      setAssets(assetResult.assets);
      setRevenueStreams(revenueResult.revenueStreams);
      setResearchArtifacts(artifactResult.artifacts.slice(0, 12));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load strategy ledger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeSection = useCallback((section: StrategySection) => {
    setActiveSection(section);
    setQuery("");
    setStatus("ALL");
  }, []);

  const filteredObjectives = useMemo(
    () =>
      objectives.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          recordMatches([item.title, item.description, item.project?.name, ...item.tags], query),
      ),
    [objectives, query, status],
  );
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          recordMatches(
            [item.title, item.problem, item.proposedValue, item.targetCustomer, item.project?.name, ...item.tags],
            query,
          ),
      ),
    [opportunities, query, status],
  );
  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          recordMatches([item.name, item.description, item.valueHypothesis, item.project?.name, ...item.tags], query),
      ),
    [assets, query, status],
  );
  const filteredRevenue = useMemo(
    () =>
      revenueStreams.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          recordMatches([item.name, item.notes, item.asset?.name, item.project?.name], query),
      ),
    [revenueStreams, query, status],
  );

  const runMutation = useCallback(
    async (key: string, action: () => Promise<void>, successMessage: string) => {
      setSubmitting(key);
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(successMessage);
        await load(true);
        return true;
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : "Unable to save strategy record");
        return false;
      } finally {
        setSubmitting(null);
      }
    },
    [load],
  );

  const saveRecord = useCallback(
    async (type: StrategyRecordType, payload: StrategyPayload, id?: string) => {
      if (!canEdit) return false;
      const normalized = normalizePayload(type, payload);
      const saved = await runMutation(
        "record",
        async () => {
          if (type === "objectives") {
            if (id) await api.updateStrategyObjective(id, normalized as StrategyObjectivePayload);
            else await api.createStrategyObjective(normalized as StrategyObjectivePayload);
          } else if (type === "opportunities") {
            if (id) await api.updateStrategyOpportunity(id, normalized as StrategyOpportunityPayload);
            else await api.createStrategyOpportunity(normalized as StrategyOpportunityPayload);
          } else if (type === "assets") {
            if (id) await api.updateStrategyAsset(id, normalized as StrategyAssetPayload);
            else await api.createStrategyAsset(normalized as StrategyAssetPayload);
          } else {
            if (id) await api.updateStrategyRevenueStream(id, normalized as StrategyRevenueStreamPayload);
            else await api.createStrategyRevenueStream(normalized as StrategyRevenueStreamPayload);
          }
        },
        tk(id ? "strategy.notice.updated" : "strategy.notice.created"),
      );
      if (saved) setEditor(null);
      return saved;
    },
    [canEdit, runMutation, tk],
  );

  const createWorkOrder = useCallback(
    async (opportunity: KingdomOpportunityDto) => {
      if (!canEdit) return;
      await runMutation(
        `work-order-${opportunity.id}`,
        async () => {
          await api.createStrategyOpportunityWorkOrder(opportunity.id);
        },
        tk("strategy.notice.workOrder"),
      );
    },
    [canEdit, runMutation, tk],
  );

  const promoteArtifact = useCallback(
    async (artifact: ArtifactDto) => {
      if (!canEdit) return;
      await runMutation(
        `artifact-${artifact.id}`,
        async () => {
          await api.createStrategyOpportunityFromArtifact(artifact.id);
        },
        tk("strategy.notice.promoted"),
      );
    },
    [canEdit, runMutation, tk],
  );

  return {
    overview,
    objectives,
    opportunities,
    assets,
    revenueStreams,
    researchArtifacts,
    filteredObjectives,
    filteredOpportunities,
    filteredAssets,
    filteredRevenue,
    activeSection,
    query,
    status,
    editor,
    loading,
    refreshing,
    error,
    notice,
    submitting,
    canEdit,
    setQuery,
    setStatus,
    setEditor,
    changeSection,
    load,
    saveRecord,
    createWorkOrder,
    promoteArtifact,
    openCreate: (type: StrategyRecordType) => setEditor({ type, record: null }),
    openEdit: (type: StrategyRecordType, record: NonNullable<StrategyEditorState>["record"]) =>
      setEditor({ type, record }),
    closeEditor: () => setEditor(null),
    editorRecordId: recordId(editor?.record ?? null),
  };
}

export type StrategyController = ReturnType<typeof useStrategyController>;
