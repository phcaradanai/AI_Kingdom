import type {
  AgentDto,
  AgentPayload,
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
  MatterCategory,
  MatterDto,
  MatterPriority,
  MatterStatus,
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
  SecretaryBriefDto,
  CouncilSessionDto,
  CurrentAgentActivityDto,
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
  UsageRecordDto,
  WorkOrderDto,
  WorkOrderPayload,
  WorkSessionDto
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
  externalAgents: () => apiRequest<{ externalAgents: ExternalAgentDto[] }>("/external-agents"),
  createExternalAgent: (payload: ExternalAgentPayload) =>
    apiRequest<{ externalAgent: ExternalAgentDto }>("/external-agents", { method: "POST", body: JSON.stringify(payload) }),
  updateExternalAgent: (id: string, payload: Partial<ExternalAgentPayload>) =>
    apiRequest<{ externalAgent: ExternalAgentDto }>(`/external-agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
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
  projectInbox: (params?: { status?: string }) => {
    const suffix = params?.status ? `?status=${encodeURIComponent(params.status)}` : "";
    return apiRequest<{ inboxItems: ProjectInboxItemDto[] }>(`/project-inbox${suffix}`);
  },
  assignProjectInboxItem: (id: string, projectId: string) =>
    apiRequest<{ inboxItem: ProjectInboxItemDto }>(`/project-inbox/${id}/assign`, { method: "PATCH", body: JSON.stringify({ projectId }) }),
  dismissProjectInboxItem: (id: string) =>
    apiRequest<{ inboxItem: ProjectInboxItemDto }>(`/project-inbox/${id}/dismiss`, { method: "PATCH" }),
  classifyProject: (payload: { title: string; content: string; sourceType: string; sourceId: string; persist?: boolean }) =>
    apiRequest<unknown>("/project-routing/classify", { method: "POST", body: JSON.stringify(payload) }),
  assignProjectRoute: (payload: { sourceType: string; sourceId: string; projectId: string }) =>
    apiRequest<{ assigned: boolean }>("/project-routing/assign", { method: "POST", body: JSON.stringify(payload) }),
  artifacts: (params?: { projectId?: string; type?: string; tag?: string }) => {
    const search = new URLSearchParams();
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.type) search.set("type", params.type);
    if (params?.tag) search.set("tag", params.tag);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ artifacts: ArtifactDto[] }>(`/artifacts${suffix}`);
  },
  artifact: (id: string) => apiRequest<{ artifact: ArtifactDto }>(`/artifacts/${id}`),
  createArtifact: (payload: ArtifactPayload) =>
    apiRequest<{ artifact: ArtifactDto }>("/artifacts", { method: "POST", body: JSON.stringify(payload) }),
  updateArtifact: (id: string, payload: Partial<ArtifactPayload>) =>
    apiRequest<{ artifact: ArtifactDto }>(`/artifacts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteArtifact: (id: string) => apiRequest<void>(`/artifacts/${id}`, { method: "DELETE" }),
  workOrders: (params?: { status?: string; priority?: string; externalAgentId?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    if (params?.externalAgentId) search.set("externalAgentId", params.externalAgentId);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ workOrders: WorkOrderDto[] }>(`/work-orders${suffix}`);
  },
  workOrder: (id: string) => apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}`),
  createWorkOrder: (payload: WorkOrderPayload) =>
    apiRequest<{ workOrder: WorkOrderDto }>("/work-orders", { method: "POST", body: JSON.stringify(payload) }),
  updateWorkOrder: (id: string, payload: Partial<WorkOrderPayload>) =>
    apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteWorkOrder: (id: string) => apiRequest<void>(`/work-orders/${id}`, { method: "DELETE" }),
  workOrderFromTask: (taskId: string) => apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/from-task/${taskId}`, { method: "POST" }),
  workOrderFromMatter: (matterId: string) => apiRequest<{ workOrder: WorkOrderDto }>(`/work-orders/from-matter/${matterId}`, { method: "POST" }),
  buildWorkOrderPrompt: (id: string, externalAgentId: string) =>
    apiRequest<{ prompt: string }>(`/work-orders/${id}/build-prompt/${externalAgentId}`, { method: "POST" }),
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
    apiRequest<{ task: TaskDto }>("/tasks", {
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
  councilSessions: () => apiRequest<{ sessions: CouncilSessionDto[] }>("/council"),
  councilSession: (id: string) => apiRequest<{ session: CouncilSessionDto }>(`/council/${id}`),
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
  treasuryReports: (days = 30) => apiRequest<{ daily: TreasuryDailyDto[] }>(`/treasury/reports?days=${days}`),
  treasuryPricingWarnings: () => apiRequest<PricingWarningsDto>("/treasury/pricing-warnings"),
  providerBalances: () => apiRequest<{ balances: ProviderBalanceSnapshotDto[] }>("/provider-balances"),
  syncDeepSeekBalance: () => apiRequest<{ balances: ProviderBalanceSnapshotDto[] }>("/provider-balances/deepseek/sync", { method: "POST" }),
  getCurrentAgentActivities: () => apiRequest<{ activities: CurrentAgentActivityDto[] }>("/agent-activities/current"),
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
  notices: (params?: { severity?: NoticeSeverity; status?: NoticeStatus; page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.severity) search.set("severity", params.severity);
    if (params?.status) search.set("status", params.status);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ notices: NoticeDto[]; total: number; page: number; limit: number }>(`/notices${suffix}`);
  },
  notice: (id: string) => apiRequest<{ notice: NoticeDto }>(`/notices/${id}`),
  createNotice: (payload: { title: string; content: string; severity?: NoticeSeverity; projectId?: string | null; sourceType?: string; sourceId?: string }) =>
    apiRequest<{ notice: NoticeDto }>("/notices", { method: "POST", body: JSON.stringify(payload) }),
  updateNotice: (id: string, payload: Partial<{ status: NoticeStatus; title: string; content: string; severity: NoticeSeverity }>) =>
    apiRequest<{ notice: NoticeDto }>(`/notices/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNotice: (id: string) => apiRequest<void>(`/notices/${id}`, { method: "DELETE" }),
  matters: (params?: { status?: MatterStatus; priority?: MatterPriority; category?: MatterCategory; page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    if (params?.category) search.set("category", params.category);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ matters: MatterDto[]; total: number; page: number; limit: number }>(`/matters${suffix}`);
  },
  matter: (id: string) => apiRequest<{ matter: MatterDto }>(`/matters/${id}`),
  createMatter: (payload: { title: string; description: string; priority?: MatterPriority; category?: MatterCategory; projectId?: string | null; sourceType?: string; sourceId?: string }) =>
    apiRequest<{ matter: MatterDto }>("/matters", { method: "POST", body: JSON.stringify(payload) }),
  updateMatter: (id: string, payload: Partial<{ status: MatterStatus; priority: MatterPriority; category: MatterCategory; title: string; description: string; assignedAgentId: string | null }>) =>
    apiRequest<{ matter: MatterDto }>(`/matters/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteMatter: (id: string) => apiRequest<void>(`/matters/${id}`, { method: "DELETE" }),
  charter: () => apiRequest<{ charter: KingdomCharterDto }>("/charter"),
  updateCharter: (payload: { mission?: string; content?: string }) =>
    apiRequest<{ charter: KingdomCharterDto }>("/charter", { method: "PATCH", body: JSON.stringify(payload) }),
  vision: () => apiRequest<{ vision: KingdomVisionDto }>("/vision"),
  updateVision: (payload: { content?: string }) =>
    apiRequest<{ vision: KingdomVisionDto }>("/vision", { method: "PATCH", body: JSON.stringify(payload) })
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
