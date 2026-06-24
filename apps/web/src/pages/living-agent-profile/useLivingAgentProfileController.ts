import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type {
  KnowledgeCandidateDto,
  KnowledgeMemoryDto,
  LivingAgentProfileDto,
  LivingAgentRelationsDto,
  LivingAgentTimelineFilters,
  LivingAgentTimelineItemDto,
} from "@/types/api";
import type { ProfileSection } from "./profileModels";

export function useLivingAgentProfileController() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const [profile, setProfile] = useState<LivingAgentProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<ProfileSection>("overview");
  const [timelineItems, setTimelineItems] = useState<
    LivingAgentTimelineItemDto[]
  >([]);
  const [timelineFilters, setTimelineFilters] =
    useState<LivingAgentTimelineFilters>({ limit: 50 });
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [relations, setRelations] = useState<LivingAgentRelationsDto | null>(
    null,
  );
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationsError, setRelationsError] = useState(false);
  const [knowledgeCandidates, setKnowledgeCandidates] = useState<
    KnowledgeCandidateDto[]
  >([]);
  const [knowledgeMemories, setKnowledgeMemories] = useState<
    KnowledgeMemoryDto[]
  >([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState(false);
  const relationsRequestAgent = useRef<string | null>(null);
  const knowledgeRequestAgent = useRef<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getLivingAgentProfile(agentId)
      .then(({ profile: next }) => {
        if (!active) return;
        setProfile(next);
        setTimelineItems(next.recentTimeline);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to load agent profile",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  useEffect(() => {
    if (section !== "timeline" || !agentId) return;
    let active = true;
    setTimelineLoading(true);
    setTimelineError(null);
    api
      .getLivingAgentTimeline(agentId, timelineFilters)
      .then(({ items }) => {
        if (active) setTimelineItems(items);
      })
      .catch((reason: unknown) => {
        if (active)
          setTimelineError(
            reason instanceof Error
              ? reason.message
              : "Failed to load timeline",
          );
      })
      .finally(() => {
        if (active) setTimelineLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId, section, timelineFilters]);

  useEffect(() => {
    relationsRequestAgent.current = null;
    knowledgeRequestAgent.current = null;
    setRelations(null);
    setRelationsError(false);
    setKnowledgeCandidates([]);
    setKnowledgeMemories([]);
    setKnowledgeError(false);
  }, [agentId]);

  const loadRelations = useCallback(async () => {
    if (!agentId || relationsRequestAgent.current === agentId) return;
    relationsRequestAgent.current = agentId;
    setRelationsLoading(true);
    setRelationsError(false);
    let succeeded = false;
    try {
      const response = await api.getLivingAgentRelations(agentId);
      if (relationsRequestAgent.current === agentId) {
        setRelations(response.relations);
        succeeded = true;
      }
    } catch {
      if (relationsRequestAgent.current === agentId) setRelationsError(true);
    } finally {
      if (relationsRequestAgent.current === agentId) {
        setRelationsLoading(false);
        if (!succeeded) relationsRequestAgent.current = null;
      }
    }
  }, [agentId]);

  const loadKnowledge = useCallback(async () => {
    if (!agentId || knowledgeRequestAgent.current === agentId) return;
    knowledgeRequestAgent.current = agentId;
    setKnowledgeLoading(true);
    setKnowledgeError(false);
    let complete = false;
    try {
      const [candidateResult, memoryResult] = await Promise.allSettled([
        api.agentKnowledgeCandidates(agentId),
        api.agentKnowledgeMemories(agentId),
      ]);
      if (knowledgeRequestAgent.current !== agentId) return;
      setKnowledgeCandidates(
        candidateResult.status === "fulfilled"
          ? candidateResult.value.candidates
          : [],
      );
      setKnowledgeMemories(
        memoryResult.status === "fulfilled" ? memoryResult.value.memories : [],
      );
      complete =
        candidateResult.status === "fulfilled" &&
        memoryResult.status === "fulfilled";
      setKnowledgeError(!complete);
    } finally {
      if (knowledgeRequestAgent.current === agentId) {
        setKnowledgeLoading(false);
        if (!complete) knowledgeRequestAgent.current = null;
      }
    }
  }, [agentId]);

  const selectSection = useCallback(
    (next: ProfileSection) => {
      setSection(next);
      if (next === "work") void loadRelations();
      if (next === "knowledge") void loadKnowledge();
    },
    [loadKnowledge, loadRelations],
  );

  return {
    agentId,
    error,
    knowledgeCandidates,
    knowledgeError,
    knowledgeLoading,
    knowledgeMemories,
    loadKnowledge,
    loading,
    profile,
    relations,
    relationsError,
    relationsLoading,
    loadRelations,
    section,
    setSection: selectSection,
    timelineError,
    timelineFilters,
    timelineItems,
    timelineLoading,
    setTimelineFilters,
  };
}

export type LivingAgentProfileController = ReturnType<
  typeof useLivingAgentProfileController
>;
