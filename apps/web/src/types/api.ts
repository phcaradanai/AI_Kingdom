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
  preferredProviderId: string | null;
  defaultModel: string | null;
  fallbackProviderIds: string[];
  costPreference: "LOW" | "BALANCED" | "QUALITY" | null;
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
  preferredProviderId?: string | null;
  defaultModel?: string | null;
  fallbackProviderIds?: string[];
  costPreference?: "LOW" | "BALANCED" | "QUALITY" | null;
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

export type AIProviderDto = {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  defaultModel: string;
  isActive: boolean;
  priority: number;
  supportsChat: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  costTier: "FREE" | "LOW" | "MEDIUM" | "HIGH" | "PREMIUM";
  capabilities: {
    supportsChat: boolean;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsJsonMode?: boolean;
  };
  hasCredentials: boolean;
  createdAt: string;
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
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectInboxStatus = "PENDING" | "ASSIGNED" | "DISMISSED";
export type ArtifactType = "PROMPT" | "SPEC" | "DECISION" | "IMPLEMENTATION_REPORT" | "HANDOFF_BRIEF" | "ARCHITECTURE_NOTE" | "MARKET_RESEARCH" | "CODE_PLAN" | "ROYAL_DECREE" | "GENERAL_NOTE";

export type ProjectDto = {
  id: string;
  name: string;
  codename: string | null;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  goals: string[];
  keywords: string[];
  aliases: string[];
  repositoryUrl: string | null;
  localPath: string | null;
  activeMilestone: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPayload = {
  name: string;
  codename?: string | null;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  goals?: string[];
  keywords?: string[];
  aliases?: string[];
  repositoryUrl?: string | null;
  localPath?: string | null;
  activeMilestone?: string | null;
  ownerUserId?: string | null;
};

export type ProjectInboxItemDto = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  summary: string;
  candidateProjectIds: string[];
  status: ProjectInboxStatus;
  assignedProjectId: string | null;
  confidenceScore: number | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactDto = {
  id: string;
  projectId: string | null;
  title: string;
  type: ArtifactType;
  content: string;
  sourceType: string | null;
  sourceId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  project?: ProjectDto | null;
};

export type ArtifactPayload = {
  projectId?: string | null;
  title: string;
  type?: ArtifactType;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
  tags?: string[];
};

export type ProjectOverviewDto = {
  project: ProjectDto;
  counts: {
    tasks: number;
    matters: number;
    workOrders: number;
    reports: number;
    memories: number;
    artifacts: number;
    criticalMatters: number;
  };
};

export type ObsidianExportDto = {
  project: { id: string; name: string };
  files: Record<string, string>;
};

export type ReportDto = {
  id: string;
  title: string;
  summary: string;
  content: string;
  projectId: string | null;
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
  projectId?: string | null;
  sourceTaskId?: string | null;
  sourceCouncilSessionId?: string | null;
  category: ReportCategory;
  importance: ReportImportance;
  tags: string[];
};

export type CouncilSessionDto = {
  id: string;
  taskId: string;
  projectId: string | null;
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
  projectId: string | null;
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
  projectId: string | null;
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
  projectId?: string | null;
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
  providerId: string | null;
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
  providerId: string | null;
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

export type AuditLogDto = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string; role: string } | null;
};

export type AuditListResponse = {
  logs: AuditLogDto[];
  total: number;
  page: number;
  limit: number;
};

export type NoticeSeverity = "INFO" | "WARNING" | "CRITICAL";
export type NoticeStatus = "UNREAD" | "READ" | "ARCHIVED";
export type MatterStatus = "DETECTED" | "INVESTIGATING" | "COUNCIL_REVIEW" | "AWAITING_ROYAL_DECISION" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED";
export type MatterPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MatterCategory = "TREASURY" | "SECURITY" | "REVENUE" | "SYSTEM" | "RESEARCH" | "PRODUCT" | "GENERAL";

export type NoticeDto = {
  id: string;
  title: string;
  content: string;
  severity: NoticeSeverity;
  status: NoticeStatus;
  projectId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MatterDto = {
  id: string;
  title: string;
  description: string;
  status: MatterStatus;
  priority: MatterPriority;
  category: MatterCategory;
  projectId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecommendedAction = {
  action: string;
  severity: "info" | "warning" | "critical";
  href?: string;
};

export type SecretaryBriefDto = {
  kingdomStatus: {
    unreadNotices: number;
    criticalNotices: number;
    openMatters: number;
    criticalMatters: number;
    awaitingRoyalDecision: number;
    failedTasks: number;
    budgetWarning: boolean;
  };
  urgentNotices: NoticeDto[];
  openMatters: MatterDto[];
  awaitingRoyalDecision: MatterDto[];
  recommendedActions: RecommendedAction[];
  charter: { mission: string } | null;
  vision: { content: string } | null;
};

export type ExternalAgentType = "CLAUDE_CODE" | "CODEX" | "CLINE" | "KILO" | "ANTIGRAVITY" | "HERMES" | "OPENCODE" | "CUSTOM";
export type ExternalAgentExecutionMode = "MANUAL_COPY_PASTE" | "CLI_MANUAL" | "API" | "FUTURE_AUTOMATED";
export type ExternalAgentSafetyLevel = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
export type WorkOrderStatus = "DRAFT" | "READY" | "IN_PROGRESS" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED" | "CANCELLED";
export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type WorkSessionStatus = "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "INTERRUPTED";
export type ImplementationTestResult = "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";

export type ExternalAgentDto = {
  id: string;
  name: string;
  type: ExternalAgentType;
  roleTitle: string;
  description: string;
  capabilities: string[];
  executionMode: ExternalAgentExecutionMode;
  isActive: boolean;
  safetyLevel: ExternalAgentSafetyLevel;
  createdAt: string;
  updatedAt: string;
};

export type ExternalAgentPayload = Omit<ExternalAgentDto, "id" | "createdAt" | "updatedAt">;

export type WorkSessionDto = {
  id: string;
  workOrderId: string;
  externalAgentId: string | null;
  sessionLabel: string;
  status: WorkSessionStatus;
  inputPrompt: string;
  outputSummary: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  externalAgent?: ExternalAgentDto | null;
};

export type ImplementationReportDto = {
  id: string;
  workOrderId: string;
  projectId: string | null;
  workSessionId: string | null;
  externalAgentId: string | null;
  summary: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  testResult: ImplementationTestResult;
  errors: string[];
  decisionsMade: string[];
  remainingWork: string[];
  nextRecommendedAction: string | null;
  rawOutput: string | null;
  createdAt: string;
  updatedAt: string;
  externalAgent?: ExternalAgentDto | null;
};

export type HandoffBriefDto = {
  id: string;
  workOrderId: string;
  projectId: string | null;
  fromWorkSessionId: string | null;
  title: string;
  currentStatus: string;
  completedWork: string[];
  decisionsMade: string[];
  filesChanged: string[];
  knownIssues: string[];
  nextSteps: string[];
  constraints: string[];
  suggestedNextAgentType: string | null;
  handoffPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderDto = {
  id: string;
  title: string;
  objective: string;
  context: string;
  instructions: string;
  constraints: string;
  acceptanceCriteria: string[];
  validationCommands: string[];
  projectId: string | null;
  targetProject: string | null;
  targetRepository: string | null;
  sourceType: string | null;
  sourceId: string | null;
  assignedExternalAgentId: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  assignedExternalAgent?: ExternalAgentDto | null;
  workSessions?: WorkSessionDto[];
  implementationReports?: ImplementationReportDto[];
  handoffBriefs?: HandoffBriefDto[];
};

export type WorkOrderPayload = {
  title: string;
  objective: string;
  context?: string;
  instructions?: string;
  constraints?: string;
  acceptanceCriteria?: string[];
  validationCommands?: string[];
  projectId?: string | null;
  targetProject?: string | null;
  targetRepository?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  assignedExternalAgentId?: string | null;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
};

export type ImplementationReportPayload = {
  workOrderId: string;
  workSessionId?: string | null;
  externalAgentId?: string | null;
  summary: string;
  filesChanged?: string[];
  commandsRun?: string[];
  testsRun?: string[];
  testResult?: ImplementationTestResult;
  errors?: string[];
  decisionsMade?: string[];
  remainingWork?: string[];
  nextRecommendedAction?: string | null;
  rawOutput?: string | null;
};

export type KingdomCharterDto = {
  id: string;
  version: string;
  mission: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type KingdomVisionDto = {
  id: string;
  version: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
