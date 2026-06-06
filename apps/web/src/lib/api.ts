import type {
  AgentDto,
  AgentPayload,
  AuthResponse,
  CouncilSessionDto,
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
  UsageRecordDto
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
  settings: () => apiRequest<{ settings: SettingDto[] }>("/settings"),
  updateSetting: (key: string, value: string) =>
    apiRequest<{ setting: SettingDto }>(`/settings/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ value })
    }),
  tasks: () => apiRequest<{ tasks: TaskDto[] }>("/tasks"),
  createTask: (payload: { command: string; mode: TaskMode; title?: string }) =>
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
  treasuryReports: (days = 30) => apiRequest<{ daily: TreasuryDailyDto[] }>(`/treasury/reports?days=${days}`)
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
