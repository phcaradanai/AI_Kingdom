import type {
  AgentDto,
  AgentPayload,
  DisplayProfilePayload,
  AIProviderDto,
  ArtifactDto,
  ArtifactPayload,
  AuditListResponse,
  AuditLogDto,
  AuthResponse,
  ExternalAgentDto,
  ExternalAgentPayload,
  HandoffBriefDto,
  ImplementationReportDto,
  ImplementationReportPayload,
  KingdomCharterDto,
  KingdomVisionDto,
  KnowledgeCandidateDto,
  KnowledgeMemoryDto,
  LivingAgentProfileDto,
  LivingAgentRelationsDto,
  LivingAgentSummaryDto,
  LivingAgentTimelineFilters,
  LivingAgentTimelineItemDto,
  MatterCategory,
  MatterDto,
  MatterPriority,
  MatterStatus,
  MissionControlDto,
  ModelPricingDto,
  ModelPricingPayload,
  NoticeDto,
  NoticeSeverity,
  NoticeStatus,
  ObsidianExportDto,
  ProjectDto,
  ProjectInboxItemDto,
  ProjectOverviewDto,
  ProjectPayload,
  PricingWarningsDto,
  ProviderBalanceSnapshotDto,
  ProviderAccountSnapshotDto,
  ProviderModelSnapshotDto,
  ProviderHealthSnapshotDto,
  ProviderRegistryDto,
  RouteChainDto,
  RouteChainEntryDto,
  SecretaryBriefDto,
  CouncilSessionDto,
  CouncilExternalAgentExecutionDto,
  CurrentAgentActivityDto,
  DataQuality,
  DirectAgentMessagePayload,
  DirectAgentSessionDto,
  DirectAgentSessionPayload,
  DirectAgentSummaryDto,
  MemoryDto,
  MemoryPayload,
  ReportPayload,
  SettingDto,
  ReportDto,
  TaskDto,
  TaskMode,
  TaskStatus,
  PublicUser,
  TreasuryOverviewDto,
  TreasuryAgentDto,
  TreasuryProviderDto,
  TreasuryDailyDto,
  TreasuryMonthlyDto,
  TreasuryModelDto,
  TreasuryFallbackAnalyticsDto,
  BudgetStatusDetailDto,
  UsageRecordDto,
  UsageTraceDetailsDto,
  WorkOrderDto,
  WorkOrderPayload,
  WorkSessionDto,
  AgentRoutingPreviewDto,
  ProviderModelValidationBatchDto,
  ProviderModelsDto,
  EffectiveRequestPreviewDto,
  RepositorySnapshotDto,
  ProviderReconciliationSnapshotDto,
  AgentReviewSummaryDto,
  AutomationJobDto,
  AutomationJobPayload,
  AgentRunnerDto,
  PatchArtifactDto,
  LivingLoopStatusDto,
  LivingLoopRunDto,
  AutomationCandidateDto,
  RoyalBriefDto,
  LocalDocumentOverviewDto,
  LocalDocumentRootDto,
  LocalDocumentSnapshotDto,
  LocalDocumentInsightDto,
  ProjectContextBindingDto,
  ProjectContextHealthDto,
  WorkOrderContextDto,
  PlannerResultDto,
  NextActionQueueDto,
  KingdomPresenceDto,
  KingdomActivityStreamDto,
  KingdomAssetDto,
  KingdomHealthDto,
  DecreeLineageDto,
  KingdomObjectiveDto,
  KingdomOpportunityDto,
  OpportunityExperimentDto,
  RevenueStreamDto,
  StrategyAssetPayload,
  StrategyExperimentPayload,
  StrategyIntakeResultDto,
  StrategyMetricPayload,
  StrategyObjectivePayload,
  StrategyOpportunityPayload,
  StrategyOverviewDto,
  StrategyRevenueStreamPayload,
  SuccessMetricDto,
  KingdomDiagnosticsReportDto
} from "@/types/api";

const API_URL = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

let refreshInFlight: Promise<string | null> | null = null;

export async function apiRequest<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = localStorage.getItem("ai-kingdom-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 && retry && path !== "/auth/login" && path !== "/auth/refresh") {
    const nextToken = await refreshAccessToken();
    if (nextToken) return apiRequest<T>(path, options, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: async () => {
    await apiRequest<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
  },
  me: () => apiRequest<{ user: PublicUser }>("/auth/me"),
  users: () => apiRequest<{ users: PublicUser[] }>("/users"),
  createUser: (payload: { email: string; password: string; displayName: string; role: PublicUser["role"]; isActive: boolean }) =>
    apiRequest<{ user: PublicUser }>("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateUser: (id: string, payload: Partial<{ email: string; password: string; displayName: string; role: PublicUser["role"]; isActive: boolean }>) =>
    apiRequest<{ user: PublicUser }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteUser: async (id: string) => {
    await apiRequest<{ user: PublicUser }>(`/users/${id}`, { method: "DELETE" });
  },
  agents: () => apiRequest<{ agents: AgentDto[] }>("/agents"),
  createAgent: (payload: AgentPayload) =>
    apiRequest<{ agent: AgentDto }>("/agents", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateAgent: (id: string, payload: Partial<AgentPayload>) =>
    apiRequest<{ agent: AgentDto }>(`/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteAgent: async (id: string) => {
    await apiRequest<{ agent: AgentDto }>(`/agents/${id}`, { method: "DELETE" });
  },
  getAgentDisplayProfile: (id: string) =>
    apiRequest<{ displayProfile: DisplayProfilePayload & { agentId: string; slug: string; avatarVersion: number; avatarUpdatedAt: string | null; canonicalName: string | null; canonicalTitle: string | null; coreSlug: string | null } }>(`/agents/${id}/display-profile`),
  updateAgentDisplayProfile: (id: string, payload: DisplayProfilePayload) =>
    apiRequest<{ displayProfile: DisplayProfilePayload & { agentId: string; slug: string } }>(`/agents/${id}/display-profile`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  uploadAgentAvatar: async (id: string, file: File) => {
    const token = localStorage.getItem("ai-kingdom-token");
    const form = new FormData();
    form.append("avatar", file);
    const API_URL = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
    const response = await fetch(`${API_URL}/agents/${id}/avatar`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Upload failed with ${response.status}`);
    }
    return response.json() as Promise<{ avatarUrl: string; displayProfile: DisplayProfilePayload & { agentId: string; slug: string } }>;
  },
  providers: () => apiRequest<{ providers: AIProviderDto[] }>("/providers"),
  updateProvider: (id: string, payload: Partial<Pick<AIProviderDto, "isActive" | "defaultModel" | "priority" | "costTier">>) =>
    apiRequest<{ provider: AIProviderDto }>(`/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createProvider: (payload: { name: string; type: string; baseUrl?: string; defaultModel?: string; priority: number; costTier: string; capabilities: { supportsChat: boolean; supportsTools?: boolean; supportsVision?: boolean; supportsJsonMode?: boolean }; credentialEnvKey?: string }) =>
    apiRequest<{ provider: AIProviderDto }>("/providers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteProvider: async (id: string) => {
    await apiRequest<void>(`/providers/${id}`, { method: "DELETE" });
  },
  validateModels: () => apiRequest<{ success: boolean }>("/providers/validate-models", { method: "POST" }),
  getProviderModels: (id: string) => apiRequest<ProviderModelsDto>(`/providers/${id}/models`),
  validateProviderModels: (id: string, modelIds: string[]) =>
    apiRequest<ProviderModelValidationBatchDto>(`/providers/${id}/models/validate-batch`, {
      method: "POST",
      body: JSON.stringify({ modelIds })
    }),
  getAgentRoutingPreview: (id: string) => apiRequest<AgentRoutingPreviewDto>(`/agents/${id}/routing-preview`),
  getAgentEffectiveRequestPreview: (id: string) => apiRequest<EffectiveRequestPreviewDto>(`/agents/${id}/effective-request-preview`),
  getDirectAgentOptions: () => apiRequest<{ agents: DirectAgentSummaryDto[] }>("/agent-conversations/agents"),
  getDirectAgentSessions: () => apiRequest<{ sessions: DirectAgentSessionDto[] }>("/agent-conversations"),
  getDirectAgentSession: (id: string) => apiRequest<{ session: DirectAgentSessionDto }>(`/agent-conversations/${id}`),
  createDirectAgentSession: (payload: DirectAgentSessionPayload) =>
    apiRequest<{ session: DirectAgentSessionDto }>("/agent-conversations", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  sendDirectAgentMessage: (id: string, payload: DirectAgentMessagePayload) =>
    apiRequest<{ session: DirectAgentSessionDto }>(`/agent-conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  externalAgents: () => apiRequest<{ externalAgents: ExternalAgentDto[] }>("/external-agents"),
  externalAgentReadiness: () =>
    apiRequest<import("@/types/api").ExternalAgentReadinessReportDto>("/external-agents/readiness"),
  createExternalAgent: (payload: ExternalAgentPayload) =>
    apiRequest<{ externalAgent: ExternalAgentDto }>("/external-agents", { method: "POST", body: JSON.stringify(payload) }),
  updateExternalAgent: (id: string, payload: Partial<ExternalAgentPayload>) =>
    apiRequest<{ externalAgent: ExternalAgentDto }>(`/external-agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  testExternalAgent: (id: string) =>
    apiRequest<{ test: import("@/types/api").ExternalAgentTestResultDto }>(`/external-agents/${id}/test`, { method: "POST" }),
  requestExternalAgentProbe: (id: string) =>
    apiRequest<{ requested: boolean; agentId: string; runnerId: string }>(`/external-agents/${id}/request-probe`, { method: "POST" }),
  getExternalAgentProbeResult: (id: string) =>
    apiRequest<{ result: import("@/types/api").CliProbeResultDto | null; inFlight: boolean }>(`/external-agents/${id}/probe-result`),
  deleteExternalAgent: (id: string) => apiRequest<{ externalAgent: ExternalAgentDto }>(`/external-agents/${id}`, { method: "DELETE" }),
  projects: (params?: { q?: string; status?: string; priority?: string }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ projects: ProjectDto[] }>(`/projects${suffix}`);
  },
  project: (id: string) => apiRequest<{ project: ProjectDto }>(`/projects/${id}`),
  createProject: (payload: ProjectPayload) =>
    apiRequest<{ project: ProjectDto }>("/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (id: string, payload: Partial<ProjectPayload>) =>
    apiRequest<{ project: ProjectDto }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteProject: (id: string) => apiRequest<void>(`/projects/${id}`, { method: "DELETE" }),
  projectOverview: (id: string) => apiRequest<ProjectOverviewDto>(`/projects/${id}/overview`),
  projectTasks: (id: string) => apiRequest<{ tasks: TaskDto[] }>(`/projects/${id}/tasks`),
  projectMatters: (id: string) => apiRequest<{ matters: MatterDto[] }>(`/projects/${id}/matters`),
  projectWorkOrders: (id: string) => apiRequest<{ workOrders: WorkOrderDto[] }>(`/projects/${id}/work-orders`),
  projectReports: (id: string) => apiRequest<{ reports: ReportDto[] }>(`/projects/${id}/reports`),
  projectMemories: (id: string) => apiRequest<{ memories: MemoryDto[] }>(`/projects/${id}/memories`),
  projectArtifacts: (id: string) => apiRequest<{ artifacts: ArtifactDto[] }>(`/projects/${id}/artifacts`),
  exportProjectObsidian: (id: string) => apiRequest<ObsidianExportDto>(`/projects/${id}/export/obsidian`, { method: "POST" }),
  getProjectRepositorySnapshot: (id: string) => apiRequest<{ snapshot: RepositorySnapshotDto | null }>(`/projects/${id}/repository`),
  scanProjectRepository: (id: string) => apiRequest<{ snapshot: RepositorySnapshotDto }>(`/projects/${id}/repository/scan`, { method: "POST" }),
  getProjectLocalDocs: (id: string) => apiRequest<LocalDocumentOverviewDto>(`/projects/${id}/local-docs`),
  addProjectLocalDocumentRoot: (id: string, payload: {
    name: string;
    rootPath: string;
    allowedGlobs?: string[];
    blockedGlobs?: string[];
    maxFileBytes?: number;
    maxTotalBytes?: number;
    isActive?: boolean;
  }) => apiRequest<LocalDocumentRootDto>(`/projects/${id}/local-docs/roots`, { method: "POST", body: JSON.stringify(payload) }),
  updateProjectLocalDocumentRoot: (id: string, rootId: string, payload: {
    name?: string;
    isActive?: boolean;
    allowedGlobs?: string[];
    blockedGlobs?: string[];
    maxFileBytes?: number;
    maxTotalBytes?: number;
  }) => apiRequest<LocalDocumentRootDto>(`/projects/${id}/local-docs/roots/${rootId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  scanProjectLocalDocumentRoot: (id: string, rootId: string) =>
    apiRequest<LocalDocumentSnapshotDto>(`/projects/${id}/local-docs/roots/${rootId}/scan`, { method: "POST" }),
  getProjectLocalDocumentSnapshot: (id: string) =>
    apiRequest<{ snapshot: LocalDocumentSnapshotDto | null }>(`/projects/${id}/local-docs/snapshots/latest`),
  getProjectLocalDocumentInsights: (id: string, snapshotId?: string) =>
    apiRequest<{ insights: LocalDocumentInsightDto[] }>(`/projects/${id}/local-docs/insights${snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : ""}`),
  readProjectLocalDocumentFile: (id: string, payload: { rootId: string; relativePath: string }) =>
    apiRequest<{ relativePath: string; content: string; sizeBytes: number }>(`/projects/${id}/local-docs/read-file`, { method: "POST", body: JSON.stringify(payload) }),
  projectInbox: (params?: { status?: string; dataQuality?: DataQuality; includeTestData?: boolean; includeDebug?: boolean; routingQuality?: string; confidenceMin?: number; confidenceMax?: number; sourceType?: string; suggestedProjectId?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.dataQuality) search.set("dataQuality", params.dataQuality);
    if (params?.includeTestData) search.set("includeTestData", "true");
    if (params?.includeDebug) search.set("includeDebug", "true");
    if (params?.routingQuality) search.set("routingQuality", params.routingQuality);
    if (params?.confidenceMin !== undefined) search.set("confidenceMin", String(params.confidenceMin));
    if (params?.confidenceMax !== undefined) search.set("confidenceMax", String(params.confidenceMax));
    if (params?.sourceType) search.set("sourceType", params.sourceType);
    if (params?.suggestedProjectId) search.set("suggestedProjectId", params.suggestedProjectId);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ inboxItems: ProjectInboxItemDto[] }>(`/project-inbox${suffix}`);
  },
  assignProjectInboxItem: (id: string, projectId: string) =>
    apiRequest<{ inboxItem: ProjectInboxItemDto }>(`/project-inbox/${id}/assign`, { method: "PATCH", body: JSON.stringify({ projectId }) }),
  dismissProjectInboxItem: (id: string) =>
    apiRequest<{ inboxItem: ProjectInboxItemDto }>(`/project-inbox/${id}/dismiss`, { method: "PATCH" }),
  archiveProjectInboxItem: (id: string) =>
    apiRequest<{ inboxItem: ProjectInboxItemDto }>(`/project-inbox/${id}/archive`, { method: "PATCH" }),
  bulkDismissProjectInboxItems: (ids: string[]) =>
    apiRequest<{ inboxItems: ProjectInboxItemDto[] }>("/project-inbox/bulk/dismiss", { method: "PATCH", body: JSON.stringify({ ids }) }),
  bulkAssignProjectInboxItems: (ids: string[], projectId: string) =>
    apiRequest<{ inboxItems: ProjectInboxItemDto[] }>("/project-inbox/bulk/assign", { method: "PATCH", body: JSON.stringify({ ids, projectId }) }),
  bulkArchiveProjectInboxItems: (ids: string[]) =>
    apiRequest<{ inboxItems: ProjectInboxItemDto[] }>("/project-inbox/bulk/archive", { method: "PATCH", body: JSON.stringify({ ids }) }),
  archiveLowConfidenceProjectInboxItems: (threshold = 0) =>
    apiRequest<{ archived: number }>("/project-inbox/archive-low-confidence", { method: "PATCH", body: JSON.stringify({ threshold }) }),
  classifyProject: (payload: { title: string; content: string; sourceType: string; sourceId: string; persist?: boolean }) =>
    apiRequest<unknown>("/project-routing/classify", { method: "POST", body: JSON.stringify(payload) }),
  assignProjectRoute: (payload: { sourceType: string; sourceId: string; projectId: string }) =>
    apiRequest<{ assigned: boolean }>("/project-routing/assign", { method: "POST", body: JSON.stringify(payload) }),
  artifacts: (params?: { projectId?: string; type?: string; tag?: string; dataQuality?: DataQuality; includeTestData?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.type) search.set("type", params.type);
    if (params?.tag) search.set("tag", params.tag);
    if (params?.dataQuality) search.set("dataQuality", params.dataQuality);
    if (params?.includeTestData) search.set("includeTestData", "true");
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ artifacts: ArtifactDto[] }>(`/artifacts${suffix}`);
  },
  artifact: (id: string) => apiRequest<{ artifact: ArtifactDto }>(`/artifacts/${id}`),
  createArtifact: (payload: ArtifactPayload) =>
    apiRequest<{ artifact: ArtifactDto }>("/artifacts", { method: "POST", body: JSON.stringify(payload) }),
  updateArtifact: (id: string, payload: Partial<ArtifactPayload>) =>
    apiRequest<{ artifact: ArtifactDto }>(`/artifacts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  archiveDuplicateArtifact: (id: string) =>
    apiRequest<{ artifact: ArtifactDto }>(`/artifacts/${id}/archive-duplicate`, { method: "PATCH" }),
  deleteArtifact: (id: string) => apiRequest<void>(`/artifacts/${id}`, { method: "DELETE" }),
  workOrders: (params?: {
    status?: string;
    priority?: string;
    externalAgentId?: string;
    includeArchived?: boolean;
    includeLegacy?: boolean;
    includeTestData?: boolean;
    quality?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    if (params?.externalAgentId) search.set("externalAgentId", params.externalAgentId);
    if (params?.includeArchived) search.set("includeArchived", "true");
    if (params?.includeLegacy) search.set("includeLegacy", "true");
    if (params?.includeTestData) search.set("includeTestData", "true");
    if (params?.quality) search.set("quality", params.quality);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ workOrders: WorkOrderDto[]; hiddenCount: number }>(`/work-orders${suffix}`);
  },
  workOrder: (id: string) => apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}`),
  createWorkOrder: (payload: WorkOrderPayload) =>
    apiRequest<{ workOrder?: WorkOrderDto; status?: "PREVIEW_ONLY" | "REJECTED"; reason?: string }>("/work-orders", { method: "POST", body: JSON.stringify(payload) }),
  updateWorkOrder: (id: string, payload: Partial<WorkOrderPayload>) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteWorkOrder: (id: string) => apiRequest<void>(`/work-orders/${id}`, { method: "DELETE" }),
  assignWorkOrderExternalAgent: (id: string, externalAgentId: string | null) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}/assign-external-agent`, { method: "POST", body: JSON.stringify({ externalAgentId }) }),
  archiveWorkOrderAsCompleted: (id: string) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}/archive-completed`, { method: "POST" }),
  workOrderFromTask: (taskId: string) =>
    apiRequest<{ workOrder?: WorkOrderDto; status?: "PREVIEW_ONLY" | "REJECTED"; reason?: string }>(`/work-orders/from-task/${taskId}`, { method: "POST" }),
  workOrderFromMatter: (matterId: string) =>
    apiRequest<{ workOrder?: WorkOrderDto; status?: "PREVIEW_ONLY" | "REJECTED"; reason?: string }>(`/work-orders/from-matter/${matterId}`, { method: "POST" }),
  getWorkOrderContext: (id: string) => apiRequest<{ context: WorkOrderContextDto }>(`/work-orders/${id}/context`),
  bindWorkOrderContext: (id: string) =>
    apiRequest<{ workOrder: WorkOrderDto; binding: ProjectContextBindingDto | null }>(`/work-orders/${id}/bind-context`, { method: "POST" }),
  markWorkOrderContextStale: (id: string, reason?: string) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}/mark-context-stale`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }),
  getProjectContextHealth: (id: string) => apiRequest<ProjectContextHealthDto>(`/projects/${id}/context-health`),
  rebindWorkOrderContext: (id: string) =>
    apiRequest<{ result: import("@/types/api").RepairWorkOrderContextResultDto }>(`/work-orders/${id}/rebind-context`, { method: "POST" }),
  refreshWorkOrderContext: (id: string) =>
    apiRequest<{ result: import("@/types/api").RefreshWorkOrderContextResultDto }>(`/work-orders/${id}/refresh-context`, { method: "POST" }),
  rebindProjectContexts: (projectId: string) =>
    apiRequest<{ result: import("@/types/api").BulkRepairResultDto }>(`/projects/${projectId}/rebind-contexts`, { method: "POST" }),
  reconcileContextWarnings: () =>
    apiRequest<{ result: import("@/types/api").ReconcileContextWarningsResultDto }>("/work-orders/reconcile-context-warnings", { method: "POST" }),
  getWorkOrderRecommendations: (id: string) =>
    apiRequest<{ recommendations: import("@/types/api").ExternalAgentRecommendationDto[] }>(`/work-orders/${id}/external-agent-recommendations`),
  getWorkOrderContinuity: (id: string) =>
    apiRequest<{ continuity: import("@/types/api").WorkContinuityDto }>(`/work-orders/${id}/continuity`),
  buildWorkOrderPrompt: (id: string, externalAgentId: string) =>
    apiRequest<{ prompt: string }>(`/work-orders/${id}/build-prompt/${externalAgentId}`, { method: "POST" }),
  dispatchWorkOrder: (id: string, externalAgentId: string) =>
    apiRequest<{ workOrder: WorkOrderDto; prompt: string; autoExecuted: boolean; executionError: string | null }>(`/work-orders/${id}/dispatch/${externalAgentId}`, { method: "POST" }),
  createHandoffBrief: (id: string) => apiRequest<{ handoffBrief: HandoffBriefDto }>(`/work-orders/${id}/handoff`, { method: "POST" }),
  workSessions: () => apiRequest<{ workSessions: WorkSessionDto[] }>("/work-sessions"),
  createWorkSession: (payload: { workOrderId: string; externalAgentId?: string | null; sessionLabel: string; inputPrompt: string }) =>
    apiRequest<{ workSession: WorkSessionDto }>("/work-sessions", { method: "POST", body: JSON.stringify(payload) }),
  implementationReports: () => apiRequest<{ implementationReports: ImplementationReportDto[] }>("/implementation-reports"),
  createImplementationReport: (payload: ImplementationReportPayload) =>
    apiRequest<{ implementationReport: ImplementationReportDto }>("/implementation-reports", { method: "POST", body: JSON.stringify(payload) }),
  handoffBriefs: () => apiRequest<{ handoffBriefs: HandoffBriefDto[] }>("/handoff-briefs"),
  handoffBrief: (id: string) => apiRequest<{ handoffBrief: HandoffBriefDto }>(`/handoff-briefs/${id}`),
  settings: () => apiRequest<{ settings: SettingDto[] }>("/settings"),
  updateSetting: (key: string, value: string) =>
    apiRequest<{ setting: SettingDto }>(`/settings/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ value })
    }),
  tasks: () => apiRequest<{ tasks: TaskDto[] }>("/tasks"),
  createTask: (payload: { command: string; mode: TaskMode; title?: string; projectId?: string | null }) =>
    apiRequest<{ task: TaskDto; session?: CouncilSessionDto }>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateTaskStatus: (id: string, status: TaskStatus) =>
    apiRequest<{ task: TaskDto }>(`/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  processTask: (id: string) =>
    apiRequest<{ task: TaskDto; session: CouncilSessionDto }>(`/tasks/${id}/process`, {
      method: "POST"
    }),
  taskCouncil: (id: string) => apiRequest<{ sessions: CouncilSessionDto[] }>(`/tasks/${id}/council`),
  createCouncilHandoff: (taskId: string, sessionId: string) =>
    apiRequest<{ workOrder: WorkOrderDto; handoffBrief: HandoffBriefDto }>(`/tasks/${taskId}/council/${sessionId}/handoff`, { method: "POST" }),
  councilSessions: () => apiRequest<{ sessions: CouncilSessionDto[] }>("/council"),
  councilSession: (id: string) => apiRequest<{ session: CouncilSessionDto }>(`/council/${id}`),
  planCouncilWorkOrder: (sessionId: string) =>
    apiRequest<PlannerResultDto>(`/council/${sessionId}/work-order`, { method: "POST" }),
  executeCouncilWithExternalAgent: (sessionId: string, externalAgentId?: string | null) =>
    apiRequest<CouncilExternalAgentExecutionDto>(`/council/${sessionId}/execute-external-agent`, {
      method: "POST",
      body: JSON.stringify(externalAgentId ? { externalAgentId } : {})
    }),
  reports: (params?: { category?: string; importance?: string }) => {
    const search = new URLSearchParams();
    if (params?.category) search.set("category", params.category);
    if (params?.importance) search.set("importance", params.importance);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ reports: ReportDto[] }>(`/reports${suffix}`);
  },
  searchReports: (q: string) => apiRequest<{ reports: ReportDto[] }>(`/reports/search?q=${encodeURIComponent(q)}`),
  createReport: (payload: ReportPayload) =>
    apiRequest<{ report: ReportDto }>("/reports", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateReport: (id: string, payload: Partial<ReportPayload>) =>
    apiRequest<{ report: ReportDto }>(`/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteReport: async (id: string) => {
    await apiRequest<void>(`/reports/${id}`, { method: "DELETE" });
  },
  memories: (params?: { type?: string }) => {
    const search = params?.type ? `?type=${encodeURIComponent(params.type)}` : "";
    return apiRequest<{ memories: MemoryDto[] }>(`/memory${search}`);
  },
  searchMemories: (q: string) => apiRequest<{ memories: MemoryDto[] }>(`/memory/search?q=${encodeURIComponent(q)}`),
  createMemory: (payload: MemoryPayload) =>
    apiRequest<{ memory: MemoryDto }>("/memory", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateMemory: (id: string, payload: Partial<MemoryPayload>) =>
    apiRequest<{ memory: MemoryDto }>(`/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteMemory: async (id: string) => {
    await apiRequest<void>(`/memory/${id}`, { method: "DELETE" });
  },
  treasuryOverview: () => apiRequest<TreasuryOverviewDto>("/treasury/overview"),
  treasuryUsage: (limit = 100) => apiRequest<{ records: UsageRecordDto[] }>(`/treasury/usage?limit=${limit}`),
  treasuryByAgent: () => apiRequest<{ agents: TreasuryAgentDto[] }>("/treasury/agents"),
  treasuryByProvider: () => apiRequest<{ providers: TreasuryProviderDto[] }>("/treasury/providers"),
  treasuryByModel: () => apiRequest<{ models: TreasuryModelDto[] }>("/treasury/models"),
  treasuryReports: (days = 30) => apiRequest<{ daily: TreasuryDailyDto[] }>(`/treasury/reports?days=${days}`),
  treasuryMonthly: (months = 12) => apiRequest<{ monthly: TreasuryMonthlyDto[] }>(`/treasury/monthly?months=${months}`),
  treasuryFallbackAnalytics: () => apiRequest<{ analytics: TreasuryFallbackAnalyticsDto[] }>("/treasury/fallback-analytics"),
  treasuryBudgetStatus: () => apiRequest<BudgetStatusDetailDto>("/treasury/budget-status"),
  treasuryPricingWarnings: () => apiRequest<PricingWarningsDto>("/treasury/pricing-warnings"),
  treasuryProviderRegistry: () => apiRequest<{ providers: ProviderRegistryDto[] }>("/treasury/provider-registry"),
  providerBalances: () => apiRequest<{ balances: ProviderBalanceSnapshotDto[] }>("/provider-balances"),
  syncDeepSeekBalance: () => apiRequest<{ balances: ProviderBalanceSnapshotDto[] }>("/provider-balances/deepseek/sync", { method: "POST" }),
  providerAccounts: () => apiRequest<{ accounts: ProviderAccountSnapshotDto[] }>("/provider-balances/accounts"),
  syncOpenRouterAccount: () => apiRequest<{ account: ProviderAccountSnapshotDto }>("/provider-balances/openrouter/account/sync", { method: "POST" }),
  providerModels: (providerType = "openrouter") => apiRequest<{ models: ProviderModelSnapshotDto[]; lastSyncedAt: string | null }>(`/provider-balances/models?providerType=${encodeURIComponent(providerType)}`),
  syncOpenRouterModels: () => apiRequest<{ result: { synced: number; failed: number; syncedAt: string } }>("/provider-balances/openrouter/models/sync", { method: "POST" }),
  providerHealth: () => apiRequest<{ health: ProviderHealthSnapshotDto[] }>("/provider-balances/health"),
  computeProviderHealth: () => apiRequest<{ result: { snapshots: ProviderHealthSnapshotDto[]; computedAt: string } }>("/provider-balances/health/compute", { method: "POST" }),
  providerIntelligence: () => apiRequest<{ intelligence: { availability: ProviderAccountSnapshotDto[]; health: ProviderHealthSnapshotDto[]; lastHealthComputedAt: string | null; lastModelSyncedAt: string | null } }>("/provider-balances/intelligence"),
  getMissionControl: () => apiRequest<MissionControlDto>("/mission-control"),
  latestReconciliation: () => apiRequest<{ snapshot: ProviderReconciliationSnapshotDto | null }>("/provider-balances/reconciliation"),
  reconciliationHistory: () => apiRequest<{ history: ProviderReconciliationSnapshotDto[] }>("/provider-balances/reconciliation/history"),
  runReconciliation: () => apiRequest<{ snapshot: ProviderReconciliationSnapshotDto }>("/provider-balances/reconciliation/run", { method: "POST" }),
  getCurrentAgentActivities: () => apiRequest<{ activities: CurrentAgentActivityDto[] }>("/agent-activities/current"),
  getLivingAgents: () => apiRequest<{ agents: LivingAgentSummaryDto[] }>("/living-agents"),
  getLivingAgentProfile: (agentId: string) => apiRequest<{ profile: LivingAgentProfileDto }>(`/living-agents/${encodeURIComponent(agentId)}`),
  getLivingAgentTimeline: (agentId: string, filters: LivingAgentTimelineFilters = {}) => {
    const search = new URLSearchParams();
    if (filters.sourceType) search.set("sourceType", filters.sourceType);
    if (filters.operation) search.set("operation", filters.operation);
    if (filters.projectId) search.set("projectId", filters.projectId);
    if (filters.attributionStatus) search.set("attributionStatus", filters.attributionStatus);
    if (filters.from) search.set("from", filters.from);
    if (filters.to) search.set("to", filters.to);
    if (filters.limit) search.set("limit", String(filters.limit));
    if (filters.cursor) search.set("cursor", filters.cursor);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ items: LivingAgentTimelineItemDto[]; nextCursor: string | null; total: number }>(
      `/living-agents/${encodeURIComponent(agentId)}/timeline${suffix}`
    );
  },
  getLivingAgentRelations: (agentId: string) =>
    apiRequest<{ relations: LivingAgentRelationsDto }>(`/living-agents/${encodeURIComponent(agentId)}/relations`),
  usageTrace: (traceId: string) => apiRequest<UsageTraceDetailsDto>(`/usage-traces/${encodeURIComponent(traceId)}`),
  routeChains: () => apiRequest<{ routeChains: RouteChainDto[] }>("/route-chains"),
  getRouteChain: (id: string) => apiRequest<{ routeChain: RouteChainDto }>(`/route-chains/${id}`),
  createRouteChain: (payload: { name: string; taskMode?: string | null; agentId?: string | null; scope?: string; description?: string | null; entries: { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[] }) =>
    apiRequest<{ routeChain: RouteChainDto }>("/route-chains", { method: "POST", body: JSON.stringify(payload) }),
  updateRouteChain: (id: string, payload: { name?: string; isActive?: boolean; description?: string | null; entries?: { providerId: string; model: string; isEnabled?: boolean; notes?: string | null }[] }) =>
    apiRequest<{ routeChain: RouteChainDto }>(`/route-chains/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRouteChain: (id: string) => apiRequest<{ ok: boolean }>(`/route-chains/${id}`, { method: "DELETE" }),
  duplicateRouteChain: (id: string) => apiRequest<{ routeChain: RouteChainDto }>(`/route-chains/${id}/duplicate`, { method: "POST" }),
  modelPricing: () => apiRequest<{ modelPricing: ModelPricingDto[] }>("/model-pricing"),
  createModelPricing: (payload: ModelPricingPayload) =>
    apiRequest<{ record: ModelPricingDto }>("/model-pricing", { method: "POST", body: JSON.stringify(payload) }),
  updateModelPricing: (id: string, payload: Partial<ModelPricingPayload>) =>
    apiRequest<{ record: ModelPricingDto }>(`/model-pricing/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteModelPricing: (id: string) => apiRequest<void>(`/model-pricing/${id}`, { method: "DELETE" }),
  auditLogs: (params?: { page?: number; limit?: number; action?: string; resourceType?: string; userId?: string; startDate?: string; endDate?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.action) search.set("action", params.action);
    if (params?.resourceType) search.set("resourceType", params.resourceType);
    if (params?.userId) search.set("userId", params.userId);
    if (params?.startDate) search.set("startDate", params.startDate);
    if (params?.endDate) search.set("endDate", params.endDate);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<AuditListResponse>(`/audit${suffix}`);
  },
  auditLog: (id: string) => apiRequest<{ log: AuditLogDto }>(`/audit/${id}`),
  auditSearch: (q: string, params?: { page?: number; limit?: number }) => {
    const search = new URLSearchParams({ q });
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    return apiRequest<AuditListResponse>(`/audit/search?${search.toString()}`);
  },
  secretaryBrief: () => apiRequest<SecretaryBriefDto>("/secretary/brief"),
  notices: (params?: { severity?: NoticeSeverity; status?: NoticeStatus; dataQuality?: DataQuality; includeTestData?: boolean; page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.severity) search.set("severity", params.severity);
    if (params?.status) search.set("status", params.status);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.dataQuality) search.set("dataQuality", params.dataQuality);
    if (params?.includeTestData) search.set("includeTestData", "true");
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ notices: NoticeDto[]; total: number; page: number; limit: number }>(`/notices${suffix}`);
  },
  notice: (id: string) => apiRequest<{ notice: NoticeDto }>(`/notices/${id}`),
  createNotice: (payload: { title: string; content: string; severity?: NoticeSeverity; projectId?: string | null; sourceType?: string; sourceId?: string }) =>
    apiRequest<{ notice: NoticeDto }>("/notices", { method: "POST", body: JSON.stringify(payload) }),
  updateNotice: (id: string, payload: Partial<{ status: NoticeStatus; title: string; content: string; severity: NoticeSeverity }>) =>
    apiRequest<{ notice: NoticeDto }>(`/notices/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNotice: (id: string) => apiRequest<void>(`/notices/${id}`, { method: "DELETE" }),
  matters: (params?: { status?: MatterStatus; priority?: MatterPriority; category?: MatterCategory; dataQuality?: DataQuality; includeTestData?: boolean; page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    if (params?.category) search.set("category", params.category);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.dataQuality) search.set("dataQuality", params.dataQuality);
    if (params?.includeTestData) search.set("includeTestData", "true");
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ matters: MatterDto[]; total: number; page: number; limit: number }>(`/matters${suffix}`);
  },
  matter: (id: string) => apiRequest<{ matter: MatterDto }>(`/matters/${id}`),
  createMatter: (payload: { title: string; description: string; priority?: MatterPriority; category?: MatterCategory; projectId?: string | null; sourceType?: string; sourceId?: string }) =>
    apiRequest<{ matter: MatterDto }>("/matters", { method: "POST", body: JSON.stringify(payload) }),
  updateMatter: (id: string, payload: Partial<{ status: MatterStatus; priority: MatterPriority; category: MatterCategory; title: string; description: string; assignedAgentId: string | null; projectId: string | null }>) =>
    apiRequest<{ matter: MatterDto }>(`/matters/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteMatter: (id: string) => apiRequest<void>(`/matters/${id}`, { method: "DELETE" }),
  charter: () => apiRequest<{ charter: KingdomCharterDto }>("/charter"),
  updateCharter: (payload: { mission?: string; content?: string }) =>
    apiRequest<{ charter: KingdomCharterDto }>("/charter", { method: "PATCH", body: JSON.stringify(payload) }),
  vision: () => apiRequest<{ vision: KingdomVisionDto }>("/vision"),
  updateVision: (payload: { content?: string }) =>
    apiRequest<{ vision: KingdomVisionDto }>("/vision", { method: "PATCH", body: JSON.stringify(payload) }),

  // Knowledge Lab
  knowledgeCandidates: (params?: { status?: string; agentId?: string; projectId?: string; category?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.agentId) search.set("agentId", params.agentId);
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.category) search.set("category", params.category);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ candidates: KnowledgeCandidateDto[] }>(`/knowledge-candidates${suffix}`);
  },
  approveCandidate: (id: string) =>
    apiRequest<{ memory: KnowledgeMemoryDto }>(`/knowledge-candidates/${id}/approve`, { method: "POST" }),
  rejectCandidate: (id: string, reason: string) =>
    apiRequest<{ candidate: KnowledgeCandidateDto }>(`/knowledge-candidates/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),
  mergeCandidate: (id: string, targetMemoryId: string) =>
    apiRequest<{ memory: KnowledgeMemoryDto }>(`/knowledge-candidates/${id}/merge`, {
      method: "POST",
      body: JSON.stringify({ targetMemoryId })
    }),
  knowledgeMemories: (params?: { agentId?: string; projectId?: string; category?: string; tag?: string; trustLevel?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.agentId) search.set("agentId", params.agentId);
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.category) search.set("category", params.category);
    if (params?.tag) search.set("tag", params.tag);
    if (params?.trustLevel) search.set("trustLevel", params.trustLevel);
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ memories: KnowledgeMemoryDto[] }>(`/knowledge-memories${suffix}`);
  },
  archiveKnowledgeMemory: (id: string) =>
    apiRequest<{ memory: KnowledgeMemoryDto }>(`/knowledge-memories/${id}/archive`, { method: "POST" }),
  agentKnowledgeMemories: (agentId: string) =>
    apiRequest<{ memories: KnowledgeMemoryDto[] }>(`/knowledge-memories/agent/${agentId}`),
  agentKnowledgeCandidates: (agentId: string) =>
    apiRequest<{ candidates: KnowledgeCandidateDto[] }>(`/knowledge-candidates?agentId=${encodeURIComponent(agentId)}`),

  // ── M17B: Automation Jobs & Runners ──────────────────────────────────────────
  runners: () => apiRequest<AgentRunnerDto[]>("/runners"),
  registerRunner: (name: string, description: string, token: string) =>
    apiRequest<AgentRunnerDto>("/runners", {
      method: "POST",
      body: JSON.stringify({ name, description, token })
    }),
  automationJobs: (params?: { status?: string; workOrderId?: string; projectId?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.workOrderId) search.set("workOrderId", params.workOrderId);
    if (params?.projectId) search.set("projectId", params.projectId);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<AutomationJobDto[]>(`/automation-jobs${suffix}`);
  },
  automationJob: (id: string) => apiRequest<AutomationJobDto>(`/automation-jobs/${id}`),
  createAutomationJob: (payload: AutomationJobPayload) =>
    apiRequest<AutomationJobDto>("/automation-jobs", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createAutomationJobForWorkOrder: (workOrderId: string, payload: Omit<AutomationJobPayload, "workOrderId">) =>
    apiRequest<{ job: AutomationJobDto }>(`/work-orders/${workOrderId}/automation-job`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  approveAutomationJob: (id: string) =>
    apiRequest<AutomationJobDto>(`/automation-jobs/${id}/approve`, { method: "POST" }),
  cancelAutomationJob: (id: string) =>
    apiRequest<AutomationJobDto>(`/automation-jobs/${id}/cancel`, { method: "POST" }),
  automationJobAgentReview: (id: string) =>
    apiRequest<{ agentReview: AgentReviewSummaryDto | null }>(`/automation-jobs/${id}/agent-review`),
  regenerateAutomationJobAgentReview: (id: string) =>
    apiRequest<{ agentReview: AgentReviewSummaryDto }>(`/automation-jobs/${id}/agent-review/regenerate`, { method: "POST" }),
  retryAutomationJob: (id: string) =>
    apiRequest<{ retried: boolean; attempt: number; job: AutomationJobDto }>(`/automation-jobs/${id}/retry`, { method: "POST" }),
  importPatch: (id: string, patchText: string) =>
    apiRequest<AutomationJobDto>(`/automation-jobs/${id}/import-patch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patchText })
    }),

  // Patch artifacts
  patchArtifacts: (params?: { automationJobId?: string; workOrderId?: string; projectId?: string; validationStatus?: string }) => {
    const search = new URLSearchParams();
    if (params?.automationJobId) search.set("automationJobId", params.automationJobId);
    if (params?.workOrderId) search.set("workOrderId", params.workOrderId);
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.validationStatus) search.set("validationStatus", params.validationStatus);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<PatchArtifactDto[]>(`/patch-artifacts${suffix}`);
  },
  patchArtifact: (id: string) => apiRequest<PatchArtifactDto>(`/patch-artifacts/${id}`),
  approvePatchArtifact: (id: string, reviewNote?: string) =>
    apiRequest<PatchArtifactDto>(`/patch-artifacts/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ reviewNote })
    }),
  rejectPatchArtifact: (id: string, reviewNote?: string) =>
    apiRequest<PatchArtifactDto>(`/patch-artifacts/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewNote })
    }),
  requestPatchRevision: (id: string, reviewNote: string) =>
    apiRequest<PatchArtifactDto>(`/patch-artifacts/${id}/request-revision`, {
      method: "POST",
      body: JSON.stringify({ reviewNote })
    }),
  createPatchPr: (id: string) =>
    apiRequest<PatchArtifactDto>(`/patch-artifacts/${id}/create-pr`, { method: "POST" }),
  pushPatchBranch: (id: string) =>
    apiRequest<{ job: AutomationJobDto }>(`/patch-artifacts/${id}/push-branch`, { method: "POST" }),

  // ── M17D-1: Living Loop ──────────────────────────────────────────────────────
  livingLoopStatus: () => apiRequest<{ status: LivingLoopStatusDto }>("/living-loop/status"),
  livingLoopRuns: (limit = 20) => apiRequest<{ runs: LivingLoopRunDto[] }>(`/living-loop/runs?limit=${limit}`),
  runLivingLoopOnce: () => apiRequest<{ run: LivingLoopRunDto; candidates: AutomationCandidateDto[] }>("/living-loop/run", { method: "POST" }),
  automationCandidates: (params?: { status?: string; kind?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.kind) search.set("kind", params.kind);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ candidates: AutomationCandidateDto[]; total: number }>(`/automation-candidates${suffix}`);
  },
  approveAutomationCandidate: (id: string) =>
    apiRequest<{ candidate: AutomationCandidateDto }>(`/automation-candidates/${id}/approve`, { method: "POST" }),
  rejectAutomationCandidate: (id: string) =>
    apiRequest<{ candidate: AutomationCandidateDto }>(`/automation-candidates/${id}/reject`, { method: "POST" }),
  archiveAutomationCandidate: (id: string) =>
    apiRequest<{ candidate: AutomationCandidateDto }>(`/automation-candidates/${id}/archive`, { method: "POST" }),
  applyAutomationCandidate: (id: string) =>
    apiRequest<{ candidate: AutomationCandidateDto }>(`/automation-candidates/${id}/apply`, { method: "POST" }),

  // ── M17D-4: Royal Brief ──────────────────────────────────────────────────────
  latestRoyalBrief: () => apiRequest<{ brief: RoyalBriefDto | null }>("/royal-brief/latest"),
  royalBriefs: (limit = 20) => apiRequest<{ briefs: RoyalBriefDto[] }>(`/royal-brief?limit=${limit}`),
  royalBrief: (id: string) => apiRequest<{ brief: RoyalBriefDto }>(`/royal-brief/${id}`),
  generateRoyalBrief: () => apiRequest<{ brief: RoyalBriefDto }>("/royal-brief/generate", { method: "POST" }),
  archiveRoyalBrief: (id: string) => apiRequest<{ brief: RoyalBriefDto }>(`/royal-brief/${id}/archive`, { method: "POST" }),

  // ── M18C: Kingdom Next Action Engine ─────────────────────────────────────────
  getNextActions: (params?: { limit?: number; entityTypes?: string[]; minRisk?: string }) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.entityTypes?.length) search.set("entityTypes", params.entityTypes.join(","));
    if (params?.minRisk) search.set("minRisk", params.minRisk);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<NextActionQueueDto>(`/next-actions${suffix}`);
  },

  // ── STAR_OFFICE_UI: Kingdom Operations Center ─────────────────────────────────
  getKingdomPresence: () => apiRequest<KingdomPresenceDto>("/kingdom/presence"),
  getKingdomActivity: (limit = 50) => apiRequest<KingdomActivityStreamDto>(`/kingdom/activity?limit=${limit}`),
  getKingdomHealth: () => apiRequest<KingdomHealthDto>("/kingdom/health"),

  // ── M23: Decree Lineage (ordered King-facing trace) ──────────────────────────
  getDecreeLineage: (params: { workOrderId?: string; taskId?: string }) => {
    const q = new URLSearchParams();
    if (params.workOrderId) q.set("workOrderId", params.workOrderId);
    if (params.taskId) q.set("taskId", params.taskId);
    return apiRequest<{ lineage: DecreeLineageDto }>(`/decree-lineage?${q.toString()}`);
  },

  // ── M20: Kingdom Strategy Ledger ─────────────────────────────────────────────
  getStrategyOverview: () => apiRequest<{ overview: StrategyOverviewDto }>("/strategy/overview"),
  strategyObjectives: () => apiRequest<{ objectives: KingdomObjectiveDto[] }>("/strategy/objectives"),
  createStrategyObjective: (payload: StrategyObjectivePayload) =>
    apiRequest<{ objective: KingdomObjectiveDto }>("/strategy/objectives", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyObjective: (id: string, payload: Partial<StrategyObjectivePayload>) =>
    apiRequest<{ objective: KingdomObjectiveDto }>(`/strategy/objectives/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  strategyMetrics: () => apiRequest<{ metrics: SuccessMetricDto[] }>("/strategy/metrics"),
  createStrategyMetric: (payload: StrategyMetricPayload) =>
    apiRequest<{ metric: SuccessMetricDto }>("/strategy/metrics", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyMetric: (id: string, payload: Partial<StrategyMetricPayload>) =>
    apiRequest<{ metric: SuccessMetricDto }>(`/strategy/metrics/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  strategyAssets: () => apiRequest<{ assets: KingdomAssetDto[] }>("/strategy/assets"),
  createStrategyAsset: (payload: StrategyAssetPayload) =>
    apiRequest<{ asset: KingdomAssetDto }>("/strategy/assets", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyAsset: (id: string, payload: Partial<StrategyAssetPayload>) =>
    apiRequest<{ asset: KingdomAssetDto }>(`/strategy/assets/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  strategyRevenueStreams: () => apiRequest<{ revenueStreams: RevenueStreamDto[] }>("/strategy/revenue-streams"),
  createStrategyRevenueStream: (payload: StrategyRevenueStreamPayload) =>
    apiRequest<{ revenueStream: RevenueStreamDto }>("/strategy/revenue-streams", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyRevenueStream: (id: string, payload: Partial<StrategyRevenueStreamPayload>) =>
    apiRequest<{ revenueStream: RevenueStreamDto }>(`/strategy/revenue-streams/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  strategyOpportunities: () => apiRequest<{ opportunities: KingdomOpportunityDto[] }>("/strategy/opportunities"),
  createStrategyOpportunity: (payload: StrategyOpportunityPayload) =>
    apiRequest<{ opportunity: KingdomOpportunityDto }>("/strategy/opportunities", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyOpportunity: (id: string, payload: Partial<StrategyOpportunityPayload>) =>
    apiRequest<{ opportunity: KingdomOpportunityDto }>(`/strategy/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  createStrategyOpportunityFromArtifact: (id: string) =>
    apiRequest<StrategyIntakeResultDto>(`/strategy/intake/artifacts/${id}/opportunity`, { method: "POST" }),
  createStrategyOpportunityWorkOrder: (id: string) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/strategy/opportunities/${id}/work-order`, { method: "POST" }),
  strategyExperiments: () => apiRequest<{ experiments: OpportunityExperimentDto[] }>("/strategy/experiments"),
  createStrategyExperiment: (payload: StrategyExperimentPayload) =>
    apiRequest<{ experiment: OpportunityExperimentDto }>("/strategy/experiments", { method: "POST", body: JSON.stringify(payload) }),
  updateStrategyExperiment: (id: string, payload: Partial<StrategyExperimentPayload>) =>
    apiRequest<{ experiment: OpportunityExperimentDto }>(`/strategy/experiments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  // ── M25-A: Kingdom Self-Diagnostics ─────────────────────────────────────────
  diagnosticsIntelligence: (days?: number) => {
    const suffix = days ? `?days=${days}` : "";
    return apiRequest<KingdomDiagnosticsReportDto>(`/diagnostics/intelligence${suffix}`);
  }
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("ai-kingdom-refresh-token");
  if (!refreshToken) return null;
  refreshInFlight ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Refresh failed");
      const payload = (await response.json()) as AuthResponse;
      localStorage.setItem("ai-kingdom-token", payload.token);
      localStorage.setItem("ai-kingdom-user", JSON.stringify(payload.user));
      return payload.token;
    })
    .catch(() => {
      localStorage.removeItem("ai-kingdom-token");
      localStorage.removeItem("ai-kingdom-refresh-token");
      localStorage.removeItem("ai-kingdom-user");
      window.dispatchEvent(new Event("ai-kingdom-session-expired"));
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}
