export type UserRole = "KING" | "CROWN_PRINCE" | "MINISTER" | "SCRIBE";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthResponse = {
  token: string;
  accessToken?: string;
  refreshToken?: string;
  user: PublicUser;
};

export type AgentDto = {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  specialty: string;
  description: string;
  prompt: string;
  systemPrompt: string;
  skills: string[];
  responseStyle: string;
  isActive: boolean;
  priority: number;
  defaultModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentPayload = {
  slug?: string;
  name: string;
  title: string;
  role: string;
  specialty: string;
  description: string;
  systemPrompt: string;
  skills: string[];
  responseStyle: string;
  isActive: boolean;
  priority: number;
  defaultModel?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
};

export type SettingCategory = "AI" | "UI" | "SECURITY" | "SYSTEM";

export type SettingDto = {
  id: string;
  key: string;
  value: string;
  category: SettingCategory;
  description: string | null;
  updatedAt: string;
};

export type CouncilResponseDto = {
  id: string;
  sessionId: string;
  agentId: string;
  role: string;
  response: string;
  createdAt: string;
  agent: AgentDto;
};

export type TaskMode = "ASK" | "PLAN" | "RESEARCH" | "BUILD";
export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type MemoryType = "DECISION" | "FACT" | "PREFERENCE" | "CONSTRAINT" | "PROJECT_NOTE" | "LESSON";
export type MemoryImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReportCategory = "STRATEGY" | "RESEARCH" | "ARCHITECTURE" | "FINANCE" | "GENERAL" | "OTHER";
export type ReportImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReportDto = {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceTaskId: string | null;
  sourceCouncilSessionId: string | null;
  category: ReportCategory;
  importance: ReportImportance;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  task?: {
    id: string;
    command: string;
    status: string;
    mode?: string;
    createdAt: string;
  } | null;
  councilSession?: CouncilSessionDto | null;
};

export type ReportPayload = {
  title: string;
  summary: string;
  content: string;
  sourceTaskId?: string | null;
  sourceCouncilSessionId?: string | null;
  category: ReportCategory;
  importance: ReportImportance;
  tags: string[];
};

export type CouncilSessionDto = {
  id: string;
  taskId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  selectedAgentIds: string[];
  finalSummary: string | null;
  providerName: string | null;
  modelUsed: string | null;
  fallbackNotice: string | null;
  consultedMemoryIds: string[];
  autoSavedMemoryIds: string[];
  createdAt: string;
  updatedAt: string;
  reports?: ReportDto[];
  task?: TaskDto;
  responses: CouncilResponseDto[];
};

export type TaskDto = {
  id: string;
  title: string;
  command: string;
  mode: TaskMode;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sessions: CouncilSessionDto[];
  reports: ReportDto[];
};

export type MemoryDto = {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  sourceTaskId: string | null;
  sourceCouncilSessionId: string | null;
  tags: string[];
  importance: MemoryImportance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryPayload = {
  type: MemoryType;
  title: string;
  content: string;
  sourceTaskId?: string | null;
  sourceCouncilSessionId?: string | null;
  tags: string[];
  importance: MemoryImportance;
};

export type UsageRecordDto = {
  id: string;
  taskId: string | null;
  councilSessionId: string | null;
  agentId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  currency: string;
  createdAt: string;
  agent?: { name: string; title: string; slug: string } | null;
  task?: { id: string; title: string; mode: string } | null;
};

export type TreasuryBudgetStatus = {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyWarning: boolean;
  monthlyWarning: boolean;
};

export type TreasuryOverviewDto = {
  costToday: number;
  costThisMonth: number;
  costAllTime: number;
  totalTokensToday: number;
  totalTokensThisMonth: number;
  totalTokensAllTime: number;
  totalCallsAllTime: number;
  totalTasksTracked: number;
  totalSessionsTracked: number;
  budgetStatus: TreasuryBudgetStatus;
};

export type TreasuryAgentDto = {
  agentId: string | null;
  agent: { id?: string; name: string; title: string; slug: string } | null;
  totalCostUSD: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
};

export type TreasuryProviderDto = {
  provider: string;
  model: string;
  totalCostUSD: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
};

export type TreasuryDailyDto = {
  date: string;
  totalCostUSD: number;
  totalTokens: number;
  callCount: number;
};
