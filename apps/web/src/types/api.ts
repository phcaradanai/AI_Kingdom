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

export type ReasoningConfig = {
  enabled: boolean;
  effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  max_tokens: number | null;
  exclude: boolean;
};

export type ToolsConfig = {
  enabled: boolean;
  tool_choice: "auto" | "none" | "required";
};

export type ModelParameters = {
  stream?: boolean;
  temperature?: number | null;
  max_tokens?: number | null;
  top_p?: number | null;
  seed?: number | null;
  response_format?: "none" | "json_object" | "json_schema" | null;
  stop?: string[] | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
  repetition_penalty?: number | null;
  top_k?: number | null;
  min_p?: number | null;
  openrouter_route?: "none" | "fallback" | null;
  openrouter_provider_preferences?: string[] | null;
  plugins?: Array<"web" | "file-parser" | "response-healing" | "context-compression"> | null;
  reasoning?: Partial<ReasoningConfig>;
  tools?: Partial<ToolsConfig>;
};

export type ParameterMode = "MANUAL" | "ROLE_DEFAULT" | "PROVIDER_DEFAULT";

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
  fallbackModels: string[];
  routingPolicy: string | null;
  costPreference: "LOW" | "BALANCED" | "QUALITY" | null;
  temperature: number | null;
  maxTokens: number | null;
  personalDetail: string;
  personality: string;
  relationshipWithKing: string;
  relationshipWithCouncil: string;
  roleBoundaries: string;
  allowedActions: string[];
  forbiddenActions: string[];
  approvalRequiredFor: string[];
  canProposeMemoryCandidates: boolean;
  canAutoSaveTrustedMemory: boolean;
  memoryRequiresApproval: boolean;
  allowedMemoryCategories: string[];
  retentionPolicy: string;
  parameterMode: ParameterMode | null;
  modelParameters: ModelParameters | null;
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarPrompt: string | null;
  avatarStyle: string | null;
  avatarVersion: number;
  avatarUpdatedAt: string | null;
  canonicalName: string | null;
  canonicalTitle: string | null;
  coreSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRoutingPolicy = "GLOBAL_ROUTING" | "FIXED_PRIMARY" | "FIXED_PRIMARY_WITH_FALLBACK" | "SANDBOX_FREE_ONLY" | "LOWEST_COST" | "QUALITY_FIRST";

export type RouteAttemptSource = "PRIMARY_MODEL" | "FALLBACK_MODEL" | "FALLBACK_PROVIDER" | "EMERGENCY_SANDBOX" | "SKIPPED";

export type RouteAttemptPlanEntry = {
  order: number;
  providerId: string;
  providerName: string;
  providerType: string;
  model: string;
  source: RouteAttemptSource;
  status: "READY" | "BLOCKED" | "UNKNOWN";
  skipReason?: string;
  settingKey?: string;
};

export type AgentRoutingPreviewDto = {
  effectiveRoute: {
    provider: { id: string; name: string; type: string; environmentMode: string; hasCredentials: boolean; costTier: string; defaultModel: string };
    model: string;
    fallbackProviders: Array<{ id: string; name: string; type: string; environmentMode: string; hasCredentials: boolean; costTier: string; defaultModel: string }>;
  } | null;
  attemptPlan?: RouteAttemptPlanEntry[];
  preferredProviderBlocked?: { providerId: string; reason: string; settingKey?: string } | null;
  sandboxBeforeApiModels?: boolean;
  fallbackProviderDetails: Array<{ id: string; name: string; type: string; environmentMode: string; hasCredentials: boolean; costTier: string; isActive: boolean; readiness?: ProviderReadinessDto } | null>;
  blockedFallbackProviderDetails?: Array<{ id: string; name: string; type: string; environmentMode: string; hasCredentials: boolean; costTier: string; isActive: boolean; readiness: ProviderReadinessDto }>;
  sandboxFallbackMode?: boolean;
  latestUsage: { provider: string; providerId: string | null; model: string; totalTokens: number; estimatedCostUSD: number; createdAt: string } | null;
};

export type ProviderReadinessDto = {
  state: "READY" | "DISABLED" | "INSUFFICIENT_BALANCE" | "PRODUCTION_BLOCKED_IN_SANDBOX";
  label: string;
  active: boolean;
};

export type ProviderModelsDto = {
  models: string[];
  count: number;
  lastSyncedAt: string | null;
  fromCache: boolean;
  validationStatus: string | null;
  message?: string;
};

export type ProviderModelValidationStatus = "VALID" | "INVALID";

export type ProviderModelValidationResultDto = {
  modelId: string;
  status: ProviderModelValidationStatus;
  reason?: string;
  checkedAt: string;
};

export type ProviderModelValidationBatchDto = {
  results: ProviderModelValidationResultDto[];
};

export type DisplayProfilePayload = {
  displayName?: string | null;
  displayTitle?: string | null;
  avatarUrl?: string | null;
  avatarPrompt?: string | null;
  avatarStyle?: string | null;
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
  fallbackModels?: string[];
  routingPolicy?: string | null;
  costPreference?: "LOW" | "BALANCED" | "QUALITY" | null;
  temperature?: number | null;
  maxTokens?: number | null;
  personalDetail?: string;
  personality?: string;
  relationshipWithKing?: string;
  relationshipWithCouncil?: string;
  roleBoundaries?: string;
  allowedActions?: string[];
  forbiddenActions?: string[];
  approvalRequiredFor?: string[];
  canProposeMemoryCandidates?: boolean;
  canAutoSaveTrustedMemory?: boolean;
  memoryRequiresApproval?: boolean;
  allowedMemoryCategories?: string[];
  retentionPolicy?: string;
  parameterMode?: ParameterMode | null;
  modelParameters?: ModelParameters | null;
};

export type DirectAgentRequestType = "GENERAL_QUESTION" | "RESEARCH_ASSIGNMENT" | "SUMMARY_ASSIGNMENT" | "PERSONAL_TASK";
export type DirectAgentSaveMode = "NONE" | "ARTIFACT" | "KNOWLEDGE_CANDIDATE" | "BOTH";
export type DirectAgentSessionStatus = "OPEN" | "COMPLETED" | "FAILED" | "ARCHIVED";
export type DirectAgentMessageRole = "USER" | "AGENT" | "SYSTEM";

export type DirectAgentSummaryDto = Pick<AgentDto, "id" | "slug" | "name" | "title" | "role" | "specialty" | "description" | "skills" | "isActive"> & {
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
};

export type DirectAgentMessageDto = {
  id: string;
  sessionId: string;
  agentId: string | null;
  role: DirectAgentMessageRole;
  content: string;
  traceId: string | null;
  usageRecordId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type DirectAgentSessionDto = {
  id: string;
  agentId: string;
  projectId: string | null;
  createdByUserId: string;
  title: string;
  requestType: DirectAgentRequestType;
  status: DirectAgentSessionStatus;
  summary: string | null;
  latestTraceId: string | null;
  latestUsageRecordId: string | null;
  artifactId: string | null;
  knowledgeCandidateId: string | null;
  providerName: string | null;
  modelUsed: string | null;
  fallbackNotice: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  agent: DirectAgentSummaryDto | null;
  project: { id: string; name: string; codename: string | null } | null;
  messages: DirectAgentMessageDto[];
};

export type DirectAgentMessagePayload = {
  prompt: string;
  requestType: DirectAgentRequestType;
  saveMode: DirectAgentSaveMode;
};

export type DirectAgentSessionPayload = DirectAgentMessagePayload & {
  agentId: string;
  projectId?: string | null;
  title?: string | null;
};

export type EffectiveRequestPreviewDto = {
  preview: {
    configuredProvider: string;
    configuredModel: string | null;
    actualSentModel: string;
    finalResponseModel: string | null;
    streamEnabled: boolean;
    reasoningEnabled: boolean;
    reasoningEffort: string | null;
    reasoningExcluded: boolean;
    response_format: "none" | "json_object" | "json_schema" | null;
    validationState: Record<string, unknown>;
    actualSentBodyPreview: Record<string, unknown>;
  };
  parameterMode: string;
};

export type AgentActivityStatus =
  | "IDLE"
  | "QUEUED"
  | "THINKING"
  | "WAITING_PROVIDER"
  | "RESPONDING"
  | "SUMMARIZING"
  | "EXTRACTING_MEMORY"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED";

export type CurrentAgentActivityDto = {
  id: string;
  agent: Pick<AgentDto, "id" | "slug" | "name" | "title" | "role" | "specialty" | "isActive"> & {
    displayName: string | null;
    displayTitle: string | null;
    avatarUrl: string | null;
    avatarVersion: number;
  };
  status: AgentActivityStatus | string;
  activityType: string;
  title: string;
  detail: string | null;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  operation: string | null;
  traceId: string | null;
  attributionStatus: AttributionStatus;
  sourceType: string | null;
  sourceId: string | null;
  requestLabel: string | null;
  usageRecordId: string | null;
  reportId: string | null;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  tokensUsed: number;
  estimatedCostUSD: number;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  errorMessage: string | null;
  isStale: boolean;
  displayTime: string | null;
  displayTimeType: "started" | "heartbeat" | "ended" | "none";
  attributionWarning: string | null;
  links: {
    trace: string | null;
    project: string | null;
    task: string | null;
    council: string | null;
    report: string | null;
  };
};

export type SettingCategory = "AI" | "UI" | "SECURITY" | "SYSTEM";

export type SettingDto = {
  id: string;
  key: string;
  value: string;
  defaultValue: string | null;
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
  environmentMode?: "SANDBOX" | "PRODUCTION" | "DISABLED";
  maxTokensPerRequest?: number | null;
  maxRequestsPerDay?: number | null;
  maxTokensPerDay?: number | null;
  maxEstimatedCostPerDay?: number | null;
  allowSensitiveContext?: boolean;
  isFreeTier?: boolean;
  notes?: string | null;
  modelValidationStatus?: string | null;
  lastValidationTime?: string | null;
  config?: Record<string, any> | null;
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
  traceId?: string | null;
};

export type AttributionStatus = "TRUSTED" | "PARTIAL" | "LEGACY_UNATTRIBUTED" | "UNKNOWN_SOURCE";

export type TaskMode = "ASK" | "PLAN" | "RESEARCH" | "BUILD";
export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type MemoryType = "DECISION" | "FACT" | "PREFERENCE" | "CONSTRAINT" | "PROJECT_NOTE" | "LESSON";
export type MemoryImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReportCategory = "STRATEGY" | "RESEARCH" | "ARCHITECTURE" | "FINANCE" | "GENERAL" | "OTHER";
export type ReportImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectInboxStatus = "PENDING" | "ASSIGNED" | "DISMISSED" | "ARCHIVED";
export type ArtifactType = "PROMPT" | "SPEC" | "DECISION" | "IMPLEMENTATION_REPORT" | "HANDOFF_BRIEF" | "ARCHITECTURE_NOTE" | "MARKET_RESEARCH" | "CODE_PLAN" | "ROYAL_DECREE" | "GENERAL_NOTE";
export type DataQuality = "TRUSTED" | "REVIEW_REQUIRED" | "TEST" | "LEGACY" | "UNKNOWN_SOURCE";

export type DataQualityBadgeDto = {
  quality: DataQuality;
  label: string;
  tone: "trusted" | "review" | "test" | "legacy" | "unknown";
};

export type SourceLinkDto = {
  label: string;
  title: string | null;
  href: string | null;
  type: string | null;
  id: string | null;
};

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

export type RoutingQuality = "HIGH" | "MEDIUM" | "LOW" | "DEBUG_ONLY" | "NO_MATCH";

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
  dataSource: string | null;
  dataQuality: DataQuality;
  dataQualityBadge?: DataQualityBadgeDto;
  provenance: Record<string, unknown> | null;
  traceId: string | null;
  createdBySystem: boolean;
  humanReadableSource?: string;
  sourceLink?: SourceLinkDto;
  // M15F routing quality gate fields
  routingConfidence: number | null;
  routingQuality: RoutingQuality | null;
  dataQualityLabel: string | null;
  humanTitle: string | null;
  humanReason: string | null;
  evidence: Record<string, unknown>[] | null;
  ignoredSignals: Record<string, unknown>[] | null;
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
  dataSource: string | null;
  dataQuality: DataQuality;
  dataQualityBadge?: DataQualityBadgeDto;
  provenance: Record<string, unknown> | null;
  traceId: string | null;
  createdBySystem: boolean;
  humanReadableSource?: string;
  sourceLink?: SourceLinkDto;
  duplicateKey?: string;
  isDuplicate?: boolean;
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
  traceId?: string | null;
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

export type RepositorySnapshotDto = {
  id: string;
  projectId: string;
  generatedAt: string;
  repositoryUrl: string | null;
  branch: string | null;
  framework: string | null;
  language: string | null;
  packageManager: string | null;
  prismaModels: string[];
  modules: string[];
  services: string[];
  controllers: string[];
  apiRoutes: string[];
  frontendPages: string[];
  summary: string | null;
  createdAt: string;
  updatedAt: string;
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

export type PlannerResultDto = {
  drafted: number;
  skipped: number;
  sessionId: string;
  draftedWorkOrderIds: string[];
  createdWorkOrder?: WorkOrderDto | null;
  skipReason?: string;
  traceId?: string;
};

export type CouncilExternalAgentExecutionDto = {
  workOrder: WorkOrderDto;
  job: AutomationJobDto;
  externalAgentRun: ExternalAgentRunDto | null;
  externalAgent: ExternalAgentDto | null;
  plannerResult: PlannerResultDto | null;
  alreadyScheduled: boolean;
  message: string;
};

export type CouncilNextExecutableAction =
  | "NONE"
  | "CREATE_WORK_ORDER"
  | "CREATE_EXTERNAL_HANDOFF"
  | "RUN_VALIDATION"
  | "SCAN_LOCAL_DOCS"
  | "BIND_CONTEXT"
  | "REVIEW_PATCH";

export type CouncilSessionDto = {
  id: string;
  taskId: string;
  projectId: string | null;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  selectedAgentIds: string[];
  finalSummary: string | null;
  finalTraceId?: string | null;
  providerName: string | null;
  modelUsed: string | null;
  fallbackNotice: string | null;
  consultedMemoryIds: string[];
  autoSavedMemoryIds: string[];
  nextExecutableAction?: CouncilNextExecutableAction | null;
  nextExecutableActionReason?: string | null;
  nextExecutableActionComputedAt?: string | null;
  createdWorkOrderId?: string | null;
  createdWorkOrderAt?: string | null;
  createdWorkOrderBy?: string | null;
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

export type CostSource = "FREE" | "ESTIMATED" | "PROVIDER_REPORTED";

export type UsageRecordDto = {
  id: string;
  traceId: string | null;
  attributionStatus: AttributionStatus;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  agentId: string | null;
  purpose: string | null;
  operation: string | null;
  sourceType: string | null;
  sourceId: string | null;
  requestLabel: string | null;
  promptPreview: string | null;
  responsePreview: string | null;
  triggerType?: string | null;
  triggerLabel?: string | null;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  links?: {
    trace: string | null;
    project: string | null;
    task: string | null;
    council: string | null;
  };
  provider: string;
  providerId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCacheHitTokens?: number | null;
  inputCacheMissTokens?: number | null;
  estimatedCostUSD: number;
  currency: string;
  pricingSource?: string | null;
  pricingStatus?: string | null;
  pricingNotes?: string | null;
  costSource?: CostSource | null;
  costConfidence?: number | null;
  createdAt: string;
  agent?: { name: string; title: string; slug: string; displayName: string | null; displayTitle: string | null; avatarUrl: string | null } | null;
  task?: { id: string; title: string; mode: string } | null;
};

export type UsageTraceDetailsDto = {
  trace: {
    id: string;
    traceId: string;
    actorUserId: string | null;
    actorRole: string | null;
    actorDisplayName: string | null;
    triggerType: string;
    triggerRoute: string | null;
    triggerLabel: string | null;
    projectId: string | null;
    taskId: string | null;
    councilSessionId: string | null;
    agentId: string | null;
    sourceType: string;
    sourceId: string | null;
    operation: string;
    purpose: string;
    providerId: string | null;
    providerType: string | null;
    providerName: string | null;
    model: string | null;
    status: string;
    startedAt: string;
    completedAt: string | null;
    failedAt: string | null;
    promptPreview: string | null;
    responsePreview: string | null;
    errorMessage: string | null;
    metadata: unknown;
    createdAt: string;
    updatedAt: string;
  };
  usageRecords: Array<Pick<UsageRecordDto, "id" | "provider" | "providerId" | "model" | "promptTokens" | "completionTokens" | "totalTokens" | "estimatedCostUSD" | "attributionStatus" | "createdAt"> & { pricingStatus?: string | null }>;
  agentActivities: Array<{
    id: string;
    status: string;
    activityType: string;
    title: string;
    detail: string | null;
    attributionStatus: AttributionStatus;
    usageRecordId: string | null;
    reportId: string | null;
    startedAt: string;
    endedAt: string | null;
    heartbeatAt: string;
  }>;
  steps: AIUsageTraceStepDto[];
  hasTimelineSteps: boolean;
  totals: {
    totalTokens: number;
    totalEstimatedCostUSD: number;
    providerCallCount: number;
    fallbackCount: number;
    agentCount: number;
    usageRecordCount: number;
  };
  links: {
    project: { id: string; name: string } | null;
    task: { id: string; title: string; mode: string; status: string } | null;
    councilSession: { id: string; status: string; taskId: string; projectId: string | null } | null;
    agent: { id: string; slug: string; name: string; title: string; role: string } | null;
    reports: Array<{ id: string | null }>;
  };
};

export type AIUsageTraceStepDto = {
  id: string;
  traceId: string;
  parentStepId: string | null;
  stepType: string;
  operation: string;
  title: string;
  detail: string | null;
  status: string;
  sequence: number;
  agentId: string | null;
  providerId: string | null;
  providerType: string | null;
  providerName: string | null;
  model: string | null;
  usageRecordId: string | null;
  taskId: string | null;
  projectId: string | null;
  councilSessionId: string | null;
  reportId: string | null;
  tokensUsed: number | null;
  estimatedCostUSD: number | null;
  durationMs: number | null;
  promptPreview: string | null;
  responsePreview: string | null;
  errorMessage: string | null;
  metadata: unknown;
  startedAt: string;
  endedAt: string | null;
  agent: { id: string; slug: string; name: string; title: string } | null;
};

export type TreasuryBudgetStatus = {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyWarning: boolean;
  monthlyWarning: boolean;
};

export type ProviderBalanceSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  isAvailable: boolean;
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  fetchedAt: string;
  createdAt: string;
  status?: "OK" | "PROVIDER_API_ERROR";
};

export type ProviderAccountSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  creditsRemaining: number | null;
  creditsUsed: number | null;
  isFreeTier: boolean;
  rateLimit: Record<string, unknown> | null;
  status: string;
  syncedAt: string;
  createdAt: string;
};

export type ProviderModelSnapshotDto = {
  id: string;
  providerType: string;
  modelId: string;
  modelName: string | null;
  contextWindow: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  isAvailable: boolean;
  syncedAt: string;
  createdAt: string;
};

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export type ProviderHealthSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  lastSuccessAt: string | null;
  failureRate: number | null;
  timeoutRate: number | null;
  avgDurationMs: number | null;
  sampleSize: number;
  healthStatus: ProviderHealthStatus;
  windowKind?: string | null;
  computedAt: string;
  createdAt: string;
};

export type ProviderReconciliationSnapshotDto = {
  id: string;
  providerType: string;
  periodLabel: string | null;
  estimatedSpendUSD: number;
  providerReportedSpendUSD: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  confidenceScore: number | null;
  recordCount: number;
  knownPricingCount: number;
  notes: string | null;
  reconciledAt: string;
  createdAt: string;
};

export type ProviderRegistryDto = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isFreeTier: boolean;
  environmentMode: string;
  costTier: string;
  hasCredentials: boolean;
  status: "ACTIVE" | "NO_CREDENTIALS" | "DISABLED" | "SANDBOX";
  healthStatus: ProviderHealthStatus;
  balance: number | null;
  spend: number;
  lastSyncAt: string | null;
  modelCount: number;
  defaultModel: string;
};

export type RouteChainEntryDto = {
  id: string;
  chainId: string;
  sequence: number;
  providerId: string;
  model: string;
  isEnabled: boolean;
  notes: string | null;
};

export type RouteChainDto = {
  id: string;
  name: string;
  taskMode: string | null;
  agentId: string | null;
  scope: string;
  isActive: boolean;
  description: string | null;
  entries: RouteChainEntryDto[];
  createdAt: string;
  updatedAt: string;
};

export type TreasuryReconciliationStatus = "NO_BALANCE_SNAPSHOT" | "OK" | "ESTIMATE_ONLY" | "PROVIDER_API_ERROR";

export type ProviderBalanceDeltaDto = {
  currency: string;
  previousTotalBalance: number;
  latestTotalBalance: number;
  balanceDelta: number;
  previousFetchedAt: string;
  latestFetchedAt: string;
};

export type TreasuryProviderTelemetryDto = {
  accountSnapshots: ProviderAccountSnapshotDto[];
  healthSnapshots: ProviderHealthSnapshotDto[];
  lastModelSyncedAt: string | null;
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
  latestProviderBalances: ProviderBalanceSnapshotDto[];
  deepseekEstimatedSpendToday: number;
  deepseekEstimatedSpendThisMonth: number;
  latestDeepSeekBalance: ProviderBalanceSnapshotDto | null;
  balanceLastFetchedAt: string | null;
  reconciliationStatus: TreasuryReconciliationStatus;
  balanceDelta: ProviderBalanceDeltaDto | null;
  budgetStatus: TreasuryBudgetStatus;
  providerTelemetry: TreasuryProviderTelemetryDto;
};

export type TreasuryAgentDto = {
  agentId: string | null;
  agent: { id?: string; name: string; title: string; slug: string; displayName: string | null; displayTitle: string | null; avatarUrl: string | null; avatarVersion: number } | null;
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

export type TreasuryMonthlyDto = {
  month: string;
  totalCostUSD: number;
  totalTokens: number;
  callCount: number;
};

export type TreasuryModelDto = {
  model: string;
  provider: string;
  providerId: string | null;
  totalCostUSD: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
};

export type TreasuryFallbackAnalyticsDto = {
  providerId: string;
  providerName: string | null;
  model: string | null;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  avgDurationMs: number | null;
  totalCalls: number;
};

export type BudgetStatusDetailDto = {
  dailyExceeded: boolean;
  monthlyExceeded: boolean;
  dailySpent: number;
  monthlySpent: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
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
  dataSource: string | null;
  dataQuality: DataQuality;
  dataQualityBadge?: DataQualityBadgeDto;
  provenance: Record<string, unknown> | null;
  traceId: string | null;
  createdBySystem: boolean;
  humanReadableSource?: string;
  sourceLink?: SourceLinkDto;
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
  dataSource: string | null;
  dataQuality: DataQuality;
  dataQualityBadge?: DataQualityBadgeDto;
  provenance: Record<string, unknown> | null;
  traceId: string | null;
  createdBySystem: boolean;
  humanReadableSource?: string;
  sourceLink?: SourceLinkDto;
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
    workOrdersAwaitingReview: number;
    budgetWarning: boolean;
  };
  urgentNotices: NoticeDto[];
  openMatters: MatterDto[];
  awaitingRoyalDecision: MatterDto[];
  recentAgentReports: NoticeDto[];
  recommendedActions: RecommendedAction[];
  charter: { mission: string } | null;
  vision: { content: string } | null;
};

export type ExternalAgentType = "CLAUDE_CODE" | "CODEX" | "CLINE" | "KILO" | "ANTIGRAVITY" | "HERMES" | "OPENCODE" | "CURSOR" | "DEVIN" | "GENERIC_CLI" | "MANUAL_ONLY" | "CUSTOM";

export type ExternalAgentReadinessDto = {
  agentId: string;
  name: string;
  type: ExternalAgentType;
  ready: boolean;
  configReady: boolean;
  runnerAvailable: boolean;
  lastRunStatus: string | null;
  reason: string;
};

export type ExternalAgentReadinessReportDto = {
  runnerOnline: boolean;
  capabilitiesUpdatedAt: string | null;
  agents: ExternalAgentReadinessDto[];
};
export type ExternalAgentExecutionMode = "MANUAL_COPY_PASTE" | "CLI_MANUAL" | "API" | "FUTURE_AUTOMATED";
export type ExternalAgentSafetyLevel = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
export type WorkOrderExecutionTarget = "AUTO" | "INTERNAL_AGENT" | "RUNNER_VALIDATION" | "RUNNER_PATCH" | "EXTERNAL_AGENT";
export type ExternalAgentRunStatus = "QUEUED" | "RUNNING" | "WAITING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "NEEDS_REVIEW";
export type WorkOrderStatus = "DRAFT" | "READY" | "IN_PROGRESS" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED" | "CANCELLED" | "ARCHIVED";
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
  command: string | null;
  workingDirectory: string | null;
  environmentProfile: string | null;
  isActive: boolean;
  bridgeEnabled: boolean;
  maxRuntimeSeconds: number;
  requiresApproval: boolean;
  safetyLevel: ExternalAgentSafetyLevel;
  createdAt: string;
  updatedAt: string;
};

export type ExternalAgentPayload = Omit<ExternalAgentDto, "id" | "createdAt" | "updatedAt">;

export type ExternalAgentTestResultDto = {
  status: "READY" | "BLOCKED";
  issues: string[];
  prompt: string;
  commandTemplate: string | null;
  maxRuntimeSeconds: number;
  captures: string[];
};

export type ExternalAgentRunDto = {
  id: string;
  externalAgentId: string;
  workOrderId: string;
  automationJobId: string | null;
  status: ExternalAgentRunStatus;
  inputPrompt: string;
  outputText?: string | null;
  artifactPaths?: unknown;
  logPath?: string | null;
  exitCode?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  retryOfRunId?: string | null;
  attemptNumber: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

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
  assignedAgentId: string | null;
  assignedAgentReason: string | null;
  assignedAgentConfidence: number | null;
  executionTarget?: WorkOrderExecutionTarget;
  autoRetryCount?: number;
  maxAutoRetries?: number;
  lastExternalAgentRunId?: string | null;
  blockedReason?: string | null;
  assignedAgent?: { id: string; slug: string; name: string; title: string } | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  isTestData: boolean;
  createdBySystem: boolean;
  dataQuality?: DataQuality | null;
  workQuality?: string | null;
  archiveReason?: string | null;
  archivedAt?: string | null;
  traceId?: string | null;
  provenance?: Record<string, unknown> | null;
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  contextBoundAt?: string | null;
  contextBindingStatus?: "FRESH" | "STALE" | "MISSING" | "PARTIAL";
  contextBindingSummary?: Record<string, unknown> | null;
  contextBindingProvenance?: Record<string, unknown> | null;
  dataQualityBadge?: DataQualityBadgeDto;
  humanReadableSource?: string;
  sourceLink?: SourceLinkDto;
  createdAt: string;
  updatedAt: string;
  assignedExternalAgent?: ExternalAgentDto | null;
  workSessions?: WorkSessionDto[];
  implementationReports?: ImplementationReportDto[];
  handoffBriefs?: HandoffBriefDto[];
  externalAgentRuns?: ExternalAgentRunDto[];
};

export type ExternalAgentRecommendationDto = {
  externalAgentId: string;
  name: string;
  type: string;
  roleTitle: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  risks: string[];
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
  assignedAgentId?: string | null;
  assignedAgentReason?: string | null;
  assignedAgentConfidence?: number | null;
  executionTarget?: WorkOrderExecutionTarget;
  maxAutoRetries?: number;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  dataQuality?: string | null;
  workQuality?: string | null;
  archiveReason?: string | null;
  archivedAt?: string | null;
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

export type ModelPricingDto = {
  id: string;
  providerType: string;
  model: string;
  displayName: string | null;
  canonicalModel: string | null;
  inputPerMillion: number | null;
  outputPerMillion: number;
  inputCacheHitPerMillion: number | null;
  inputCacheMissPerMillion: number | null;
  currency: string;
  source: string;
  notes: string | null;
  isAlias: boolean;
  aliasOf: string | null;
  isDeprecated: boolean;
  deprecationDate: string | null;
  concurrencyLimit: number | null;
  supportsThinking: boolean;
  defaultThinkingEnabled: boolean;
  supportedReasoningEfforts: string[];
  unsupportedThinkingParams: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ModelPricingPayload = {
  providerType: string;
  model: string;
  displayName?: string | null;
  canonicalModel?: string | null;
  inputPerMillion?: number | null;
  outputPerMillion: number;
  inputCacheHitPerMillion?: number | null;
  inputCacheMissPerMillion?: number | null;
  currency?: string;
  notes?: string | null;
  isAlias?: boolean;
  aliasOf?: string | null;
  isDeprecated?: boolean;
  concurrencyLimit?: number | null;
  supportsThinking?: boolean;
  isActive?: boolean;
};

export type PricingWarningsDto = {
  unknownPricingUsageCount: number;
  unknownModels: Array<{ provider: string; model: string; count: number }>;
  estimatedPricingUsageCount: number;
  estimatedModels: Array<{ provider: string; model: string; count: number; note?: string }>;
};

export type LivingAgentSummaryDto = {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  specialty: string;
  description: string;
  isActive: boolean;
  priority: number;
  preferredProviderId: string | null;
  defaultModel: string | null;
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  canonicalName: string | null;
  canonicalTitle: string | null;
  coreSlug: string | null;
  createdAt: string;
  updatedAt: string;
  currentStatus: string;
  lastActivityAt: string | null;
  lastActivityTitle: string | null;
  totalCalls: number;
  totalTokens: number;
  totalEstimatedCostUSD: number;
  tokensToday: number;
  costToday: number;
  trustedTraceCount: number;
  partialTraceCount: number;
  legacyUnattributedCount: number;
  linkedProjectCount: number;
  providerSummary: Array<{ provider: string; callCount: number; totalCostUSD: number }>;
  modelSummary: Array<{ model: string; callCount: number }>;
  topOperations: Array<{ operation: string; count: number }>;
};

export type LivingAgentTimelineItemDto = {
  id: string;
  type: "TRACE_STEP" | "TRACE" | "USAGE_RECORD" | "AGENT_ACTIVITY" | "COUNCIL_RESPONSE";
  title: string;
  detail: string | null;
  timestamp: string;
  status: string;
  attributionStatus: string;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  reportId: string | null;
  usageRecordId: string | null;
  traceId: string | null;
  tokensUsed: number | null;
  estimatedCostUSD: number | null;
  provider: string | null;
  model: string | null;
  promptPreview: string | null;
  responsePreview: string | null;
  links: {
    trace: string | null;
    task: string | null;
    council: string | null;
    report: string | null;
    project: string | null;
    usageRecord: string | null;
  };
};

export type LivingAgentProfileDto = {
  agent: LivingAgentSummaryDto;
  currentActivity: {
    status: string;
    activityType: string;
    title: string;
    detail: string | null;
    providerName: string | null;
    model: string | null;
    startedAt: string | null;
    isStale: boolean;
  } | null;
  usageSummary: {
    totalCalls: number;
    totalTokens: number;
    totalEstimatedCostUSD: number;
    tokensToday: number;
    costToday: number;
    callsToday: number;
    byProvider: Array<{ provider: string; model: string; callCount: number; totalTokens: number; totalCostUSD: number }>;
  };
  traceSummary: {
    trustedCount: number;
    partialCount: number;
    legacyUnattributedCount: number;
    totalCount: number;
  };
  relatedProjects: Array<{ id: string; name: string }>;
  relatedCouncilSessions: Array<{ id: string; taskId: string; status: string; createdAt: string }>;
  relatedReports: Array<{ id: string; title: string; category: string; createdAt: string }>;
  relatedMemories: Array<{ id: string; title: string; type: string; createdAt: string }>;
  providerModelSummary: Array<{ provider: string; model: string; callCount: number; totalCostUSD: number }>;
  auditSummary: Array<{ action: string; createdAt: string; metadata: unknown }>;
  recentTimeline: LivingAgentTimelineItemDto[];
};

export type LivingAgentRelationsDto = {
  nodes: {
    agent: { id: string; slug: string; name: string; title: string; role: string };
    projects: Array<{ id: string; name: string; status: string }>;
    tasks: Array<{ id: string; title: string; mode: string; status: string }>;
    councilSessions: Array<{ id: string; taskId: string; status: string; createdAt: string }>;
    usageTraces: Array<{ id: string; traceId: string; operation: string; status: string; startedAt: string }>;
    reports: Array<{ id: string; title: string; category: string; createdAt: string }>;
    memories: Array<{ id: string; title: string; type: string; createdAt: string }>;
    providers: Array<{ provider: string; model: string; callCount: number }>;
  };
  edges: Array<{ source: string; target: string; type: string; label: string }>;
};

export type LivingAgentTimelineFilters = {
  sourceType?: string;
  operation?: string;
  projectId?: string;
  attributionStatus?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
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

export type KnowledgeCategory =
  | "PROJECT_FACT"
  | "ARCHITECTURE_DECISION"
  | "USER_PREFERENCE"
  | "PROVIDER_BEHAVIOR"
  | "WORKFLOW_RULE"
  | "BUG_LEARNING"
  | "PROMPT_PATTERN"
  | "COST_LEARNING"
  | "RISK"
  | "UNKNOWN";

export type KnowledgeCandidateStatus = "PENDING" | "APPROVED" | "REJECTED" | "MERGED" | "ARCHIVED";

export type KnowledgeCandidateDto = {
  id: string;
  agentId: string;
  projectId: string | null;
  taskId: string | null;
  councilSessionId: string | null;
  traceId: string | null;
  sourceType: string;
  sourceId: string | null;
  title: string;
  content: string;
  summary: string | null;
  category: KnowledgeCategory;
  confidence: number | null;
  status: KnowledgeCandidateStatus;
  proposedByAgentId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  tags: string[];
  fingerprint: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeMemoryDto = {
  id: string;
  sourceCandidateId: string | null;
  agentId: string | null;
  projectId: string | null;
  title: string;
  content: string;
  summary: string | null;
  category: KnowledgeCategory;
  trustLevel: string;
  tags: string[];
  fingerprint: string | null;
  createdFromTraceId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

// ── M17B: Automation Jobs ──────────────────────────────────────────────────────

export type AutomationJobStatus = "QUEUED" | "APPROVED" | "CLAIMED" | "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED" | "CANCELLED";
export type AutomationJobMode = "OBSERVE" | "PLAN_ONLY" | "SANDBOX_PATCH" | "VALIDATION_ONLY" | "EXTERNAL_AGENT";
export type AgentRunnerStatus = "ONLINE" | "OFFLINE" | "ERROR";

export const IMPORTED_PATCH_STATUSES = [
  "PENDING",
  "CHECK_FAILED",
  "APPLIED_IN_SANDBOX",
  "VALIDATED",
  "VALIDATION_FAILED",
  "NO_CHANGES"
] as const;
export type ImportedPatchStatus = typeof IMPORTED_PATCH_STATUSES[number];

export type AgentRunnerDto = {
  id: string;
  name: string;
  description: string;
  status: AgentRunnerStatus;
  lastHeartbeatAt: string | null;
  version: string | null;
  hostname: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunStepDto = {
  id: string;
  jobId: string;
  sequence: number;
  stepType: string;
  title: string;
  detail: string | null;
  status: string;
  command: string | null;
  args: string[];
  output: string | null;
  exitCode: number | null;
  durationMs: number | null;
  metadata: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AutomationJobDto = {
  id: string;
  workOrderId: string;
  projectId: string | null;
  agentId: string | null;
  runnerId: string | null;
  status: AutomationJobStatus;
  mode: AutomationJobMode;
  commandPolicy: string | null;
  allowedCommands: string[];
  provenance: unknown;
  planJson: unknown;
  patchSummary: string | null;
  logsPreview: string | null;
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  contextRequired?: boolean;
  contextValidationStatus?: "FRESH" | "STALE" | "MISSING" | "PARTIAL" | "NOT_REQUIRED";
  contextValidationSummary?: Record<string, unknown> | null;
  importedPatch?: string | null;
  importedPatchStatus?: ImportedPatchStatus | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workOrder: {
    id: string;
    title: string;
    status: string;
    projectId: string | null;
    assignedExternalAgentId?: string | null;
    assignedExternalAgent?: ExternalAgentDto | null;
  };
  project: { id: string; name: string } | null;
  agent: { id: string; slug: string; name: string; title: string } | null;
  runner: { id: string; name: string; status: AgentRunnerStatus } | null;
  createdByUser: { id: string; displayName: string } | null;
  approvedByUser: { id: string; displayName: string } | null;
  steps?: AgentRunStepDto[];
  implementationReports?: ImplementationReportDto[];
  externalAgentRuns?: ExternalAgentRunDto[];
};

export type AutomationJobPayload = {
  workOrderId?: string;
  agentId?: string | null;
  externalAgentId?: string | null;
  mode?: AutomationJobMode;
  commandPolicy?: string | null;
  allowedCommands?: string[];
  useAssignedAgentCli?: boolean;
};

export type PatchValidationResult = {
  command: string;
  exitCode: number | null;
  durationMs: number;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  output: string;
  success: boolean;
  timedOut?: boolean;
  outputTruncated?: boolean;
  message?: string;
  failureSummary?: string;
};

export type PatchArtifactValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
export type PatchRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PatchArtifactDto = {
  id: string;
  automationJobId: string;
  workOrderId: string;
  projectId: string | null;
  title: string;
  summary: string;
  diffStat: string | null;
  diffPreview: string | null;
  fullPatch: string | null;
  fullPatchTruncated: boolean;
  filesChanged: string[];
  riskLevel: PatchRiskLevel;
  validationStatus: PatchArtifactValidationStatus;
  validationResults: PatchValidationResult[] | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  blockedPaths: string[];
  branchName: string | null;
  branchPushed: boolean;
  prUrl: string | null;
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  baseContextStatus?: "FRESH" | "STALE" | "MISSING" | "PARTIAL";
  baseContextProvenance?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  automationJob: { id: string; status: string; workOrderId: string };
  workOrder: { id: string; title: string };
  reviewedByUser: { id: string; displayName: string } | null;
};

export type AgentReviewVerdict =
  | "PASS"
  | "NEEDS_FIX"
  | "PATCH_FAILED"
  | "NO_CHANGES"
  | "RISK_REVIEW"
  | "VALIDATION_FAILED"
  | "UNKNOWN";

export type AgentReviewConfidence = "HIGH" | "MEDIUM" | "LOW";

export type AgentReviewKingRecommendation =
  | "APPROVE"
  | "REJECT"
  | "REQUEST_REVISION"
  | "RETRY_WITH_FIXED_PATCH"
  | "REVIEW_MANUALLY";

export type AgentReviewFailedCommandDto = {
  command: string;
  exitCode: number | null;
  durationMs: number | null;
  cwd?: string;
  failureSummary?: string;
  stdout?: string;
  stderr?: string;
  message?: string;
  timedOut?: boolean;
};

export type AgentReviewSummaryDto = {
  id: string;
  automationJobId: string;
  workOrderId: string;
  projectId: string | null;
  reviewerAgentId: string | null;
  verdict: AgentReviewVerdict;
  confidence: AgentReviewConfidence;
  kingRecommendation: AgentReviewKingRecommendation;
  summary: string;
  whatPassed: string[];
  whatFailed: string[];
  failedCommands: AgentReviewFailedCommandDto[];
  riskNotes: string[];
  nextActions: string[];
  externalAgentPrompt: string | null;
  sourceReportId: string | null;
  patchArtifactId: string | null;
  rawModelOutput: string | null;
  createdAt: string;
  updatedAt: string;
  reviewerAgent?: { id: string; slug: string; name: string; title: string } | null;
};

// ── M17D-1: Living Loop ─────────────────────────────────────────────────────────

export type LivingLoopStatus = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
export type LivingLoopTriggerType = "MANUAL" | "SCHEDULED";
export type AutomationCandidateKind =
  | "WORK_ORDER_REVIEW" | "VALIDATION_JOB" | "PATCH_REVIEW"
  | "MEMORY_REVIEW"  | "CLEANUP_REVIEW"
  | "PROVIDER_REVIEW"
  | "PROJECT_REVIEW"
  | "RUNNER_REVIEW"
  | "SANDBOX_PATCH";
export type AutomationCandidatePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AutomationCandidateRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AutomationCandidateStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "ARCHIVED";

export type LivingLoopRunDto = {
  id: string;
  status: LivingLoopStatus;
  triggerType: LivingLoopTriggerType;
  startedAt: string;
  completedAt: string | null;
  summary: string | null;
  observedCounts: Record<string, number> | null;
  proposedCandidates: number;
  skippedCandidates: number;
  createdJobs: number;
  skippedReasons: string[] | null;
  error: string | null;
  createdAt: string;
};

export type AutomationCandidateDto = {
  id: string;
  kind: AutomationCandidateKind;
  title: string;
  summary: string;
  reason: string;
  confidence: number;
  priority: AutomationCandidatePriority;
  riskLevel: AutomationCandidateRiskLevel;
  sourceType: string;
  sourceId: string;
  projectId: string | null;
  agentId: string | null;
  workOrderId: string | null;
  automationJobId: string | null;
  patchArtifactId: string | null;
  proposedAction: Record<string, unknown>;
  provenance: Record<string, unknown>;
  dataQuality: string;
  status: AutomationCandidateStatus;
  loopRunId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── M17D-2: Auto Validation ─────────────────────────────────────────────────────

export type AutoValidationStatusDto = {
  enabled: boolean;
  dailyCount: number;
  dailyLimit: number;
  cooldownMinutes: number;
  jobsCreatedLastRun: number;
  validationFailuresNeedingReview: number;
};

export type AutoContextRepairStatusDto = {
  enabled: boolean;
  dailyCount: number;
  dailyLimit: number;
  cooldownMinutes: number;
  repairedLastRun: number;
};

export type AutoSandboxPatchStatusDto = {
  enabled: boolean;
  dailyCount: number;
  dailyLimit: number;
  cooldownMinutes: number;
  minConfidence: number;
  jobsCreatedLastRun: number;
};

export type LivingLoopStatusDto = {
  enabled: boolean;
  lastRun: LivingLoopRunDto | null;
  lastResult: string | null;
  todayCandidates: number;
  pendingCandidates: number;
  highCriticalCandidates: number;
  runnerIssues: number;
  providerIssues: number;
  patchesPendingReview: number;
  autoContextRepair: AutoContextRepairStatusDto;
  autoValidation: AutoValidationStatusDto;
  autoSandboxPatch: AutoSandboxPatchStatusDto;
};

// ── M17D-4: Royal Brief ──────────────────────────────────────────────────────────

export type RoyalBriefStatus = "DRAFT" | "READY" | "ARCHIVED";
export type RoyalBriefGeneratedBy = "SYSTEM" | "KING";
export type RoyalBriefRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RoyalBriefDecision = {
  id: string;
  title: string;
  why: string;
  sourceLink: string;
  riskLevel: RoyalBriefRiskLevel;
  recommendedAction: string;
  availableActions: string[];
  provenance: { source: string; id: string | null; observedAt: string };
};

export type RoyalBriefHighlight = {
  title: string;
  detail: string;
  provenance: { source: string; observedAt: string };
};

export type LivingAgentDigestEntryDto = {
  agentId: string;
  slug: string;
  displayName: string;
  displayTitle: string;
  role: string;
  avatarUrl: string | null;
  avatarVersion: number;
  actionsProposed: number;
  jobsExecuted: number;
  reportsProduced: number;
  candidatesCreated: number;
  failures: number;
  status: "IDLE" | "THINKING" | "EXECUTING" | "WAITING_REVIEW" | "BLOCKED";
};

export type RoyalBriefRunnerStatus = {
  runners: Array<{ id: string; name: string; status: string; lastHeartbeatAt: string | null; isStale: boolean }>;
  onlineCount: number;
  offlineCount: number;
  errorCount: number;
  staleCount: number;
};

export type RoyalBriefDto = {
  id: string;
  title: string;
  briefDate: string;
  status: RoyalBriefStatus;
  summary: string;
  highlights: { items: RoyalBriefHighlight[] };
  decisionsNeeded: { items: RoyalBriefDecision[] };
  runnerStatus: RoyalBriefRunnerStatus;
  livingLoopSummary: Record<string, unknown>;
  validationSummary: Record<string, unknown>;
  patchSummary: Record<string, unknown>;
  providerSummary: Record<string, unknown>;
  treasurySummary: Record<string, unknown>;
  memorySummary: Record<string, unknown>;
  riskSummary: Record<string, unknown>;
  localDocsSummary: Record<string, unknown>;
  contextHealthSummary?: Record<string, unknown>;
  livingAgentDigest: { items: LivingAgentDigestEntryDto[] };
  provenance: Record<string, unknown>;
  generatedBy: RoyalBriefGeneratedBy;
  generatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── M17E-1: Local Project Documents + Repository Intelligence ────────────────────

export type LocalDocumentScanStatusDto = "READY" | "FAILED" | "PARTIAL" | "STALE";
export type LocalDocumentRiskLevelDto = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type LocalDocumentRootDto = {
  id: string;
  projectId: string;
  name: string;
  rootPath: string;
  rootPathHash: string;
  isActive: boolean;
  allowedGlobs: string[];
  blockedGlobs: string[];
  maxFileBytes: number;
  maxTotalBytes: number;
  lastScannedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalDocumentSnapshotDto = {
  id: string;
  projectId: string;
  localDocumentRootId: string;
  scanStatus: LocalDocumentScanStatusDto;
  scannedAt: string;
  fileCount: number;
  totalBytes: number;
  summary: string;
  importantFiles: { relativePath: string; fileType: string }[];
  detectedStack: string[] | null;
  packageScripts: Record<string, string> | null;
  riskZones: { relativePath: string; riskLevel: string; reason: string }[] | null;
  provenance: Record<string, unknown>;
  isStale: boolean;
  createdAt: string;
};

export type LocalDocumentInsightDto = {
  id: string;
  snapshotId: string;
  projectId: string;
  relativePath: string;
  fileType: string;
  sizeBytes: number;
  modifiedAt: string;
  contentHash: string;
  summary: string | null;
  tags: string[];
  riskLevel: LocalDocumentRiskLevelDto;
  isDoc: boolean;
  isCode: boolean;
  isConfig: boolean;
  isBlocked: boolean;
  provenance: Record<string, unknown>;
  createdAt: string;
};

export type LocalDocumentOverviewDto = {
  roots: LocalDocumentRootDto[];
  snapshot: LocalDocumentSnapshotDto | null;
};

// ── M17E-2: Project Context Binding ─────────────────────────────────────────────

export type ContextBindingStatusDto = "FRESH" | "STALE" | "MISSING" | "PARTIAL";
export type ContextValidationStatusDto = ContextBindingStatusDto | "NOT_REQUIRED";

export type ProjectContextBindingDto = {
  status: ContextBindingStatusDto;
  projectId: string;
  localDocumentSnapshotId: string | null;
  repositorySnapshotId: string | null;
  localSnapshotScannedAt: string | null;
  repositoryCommitSha: string | null;
  repositoryBranch: string | null;
  detectedStack: string[];
  packageScripts: Record<string, string>;
  riskZones: { relativePath: string; riskLevel: string; reason: string }[];
  importantDocs: string[];
  rootIds: string[];
  rootNames: string[];
  rootPathHashes: string[];
  localDocsChanged: boolean;
  warnings: string[];
};

export type WorkOrderContextDto = {
  id: string;
  projectId: string | null;
  contextBindingStatus: ContextBindingStatusDto;
  contextBoundAt: string | null;
  localDocumentSnapshotId: string | null;
  repositorySnapshotId: string | null;
  contextBindingSummary: Record<string, unknown> | null;
  contextBindingProvenance: Record<string, unknown> | null;
  current: { status: ContextBindingStatusDto; lines: string[]; binding: ProjectContextBindingDto } | null;
};

export type ProjectContextHealthDto = {
  status: ContextBindingStatusDto;
  lines: string[];
  binding: ProjectContextBindingDto;
  openWorkOrders: Array<{
    id: string;
    title: string;
    status: string;
    contextBindingStatus: ContextBindingStatusDto;
    contextBoundAt: string | null;
    localDocumentSnapshotId: string | null;
    boundToLatestSnapshot: boolean;
  }>;
};

export type RepairWorkOrderContextResultDto = {
  workOrderId: string;
  status: "BOUND" | "SKIPPED";
  previousStatus: string;
  newStatus: string | null;
  skipReason?: string;
};

export type BulkRepairResultDto = {
  projectId: string;
  repaired: number;
  attempted: number;
  skipped: number;
  results: RepairWorkOrderContextResultDto[];
};

export type ReconcileWorkOrderResultDto = {
  workOrderId: string;
  title: string;
  action: "ARCHIVED" | "CONTEXT_REPAIRED" | "SKIPPED";
  reason: string;
  evidenceFound: string[];
  previousStatus: string;
  newStatus: string | null;
};

export type ReconcileContextWarningsResultDto = {
  totalInspected: number;
  archived: number;
  contextRepaired: number;
  skipped: number;
  results: ReconcileWorkOrderResultDto[];
};

// ── M18C: Kingdom Next Action Engine ─────────────────────────────────────────

export type NextActionAbstractState =
  | "AWAITING_INPUT"
  | "AWAITING_DECISION"
  | "AWAITING_ACTION"
  | "BLOCKED";

export type NextActionEntityType =
  | "WorkOrder"
  | "AutomationJob"
  | "PatchArtifact"
  | "AgentRunner"
  | "HandoffBrief"
  | "AgentKnowledgeCandidate";

export type NextActionItem = {
  id: string;
  entityType: NextActionEntityType;
  entityId: string;
  title: string;
  actionLabel: string;
  why: string;
  priority: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  abstractState: NextActionAbstractState;
  isEscalated: boolean;
  isBlocking: number;
  routeTo: string;
  ageHours: number;
  provenance: { source: string; id: string; observedAt: string };
};

export type NextActionQueueDto = {
  computedAt: string;
  topAction: NextActionItem | null;
  queue: NextActionItem[];
  summary: {
    totalPending: number;
    criticalCount: number;
    highCount: number;
    blockedCount: number;
    escalatedCount: number;
  };
};

export type RefreshWorkOrderContextResultDto = {
  workOrderId: string;
  status: "REFRESHED" | "SKIPPED";
  oldStatus: string;
  newStatus: string | null;
  scanRan: boolean;
  scanFailures: string[];
  warnings: string[];
  skipReason?: string;
};

// ── STAR_OFFICE_UI: Kingdom Operations Center ─────────────────────────────────

export type AgentPresenceState =
  | "IDLE"
  | "THINKING"
  | "COUNCIL"
  | "WORKING"
  | "RUNNING"
  | "WAITING_REVIEW"
  | "BLOCKED"
  | "ERROR";

export type AgentPresenceDto = {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  state: AgentPresenceState;
  currentTask: string | null;
  currentWorkOrder: { id: string; title: string } | null;
  progress: string | null;
  blockingReason: string | null;
  lastActivityAt: string | null;
};

export type KingdomPresenceDto = {
  computedAt: string;
  agents: AgentPresenceDto[];
};

export type KingdomActivityType =
  | "COUNCIL"
  | "WORK_ORDER"
  | "AUTOMATION_JOB"
  | "RUNNER_EVENT"
  | "REVIEW"
  | "KNOWLEDGE";

export type KingdomActivityItemDto = {
  id: string;
  timestamp: string;
  actor: string;
  type: KingdomActivityType;
  summary: string;
  sourceReference: {
    entityType: string;
    entityId: string;
    routeTo: string;
  };
};

export type KingdomActivityStreamDto = {
  computedAt: string;
  activities: KingdomActivityItemDto[];
};

export type KingdomHealthStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export type KingdomHealthItemDto = {
  key: string;
  label: string;
  status: KingdomHealthStatus;
  reason: string;
  recommendedAction: string | null;
  sourceReference: string | null;
};

export type KingdomHealthDto = {
  computedAt: string;
  overallStatus: KingdomHealthStatus;
  items: KingdomHealthItemDto[];
};

export type MissionControlLifecycleState =
  | "DRAFTED"
  | "APPROVED"
  | "DISPATCH_READY"
  | "DISPATCHED"
  | "RUNNING"
  | "NEEDS_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "BLOCKED"
  | "LEARNED";

export type MissionControlDisplayState =
  | "Idle"
  | "Thinking"
  | "Drafting"
  | "Ready"
  | "Running"
  | "Waiting for Review"
  | "Blocked"
  | "Failed"
  | "Completed";

export type MissionControlSeverity = "INFO" | "WARNING" | "CRITICAL";

export type MissionControlSourceReferenceDto = {
  sourceType: string;
  sourceId: string | null;
  sourceTitle?: string | null;
  sourceRoute?: string;
  routeTo: string;
  updatedAt?: string | null;
  recommendedAction?: string | null;
  why?: string | null;
  workOrderId?: string | null;
  taskId?: string | null;
  councilSessionId?: string | null;
  automationJobId?: string | null;
  agentId?: string | null;
  reviewSummaryId?: string | null;
};

export type MissionControlTopActionDto = {
  id: string;
  priority: number;
  priorityKey:
    | "CRITICAL_BLOCKED_RUNNER_JOB"
    | "FAILED_OR_REJECTED_REVIEW"
    | "STALE_CONTEXT_BLOCKING_PATCH"
    | "WORK_ORDER_READY_TO_DISPATCH"
    | "WORK_ORDER_NEEDS_REVIEW"
    | "PROVIDER_ROUTING_WARNING"
    | "NO_URGENT_ACTION";
  severity: MissionControlSeverity;
  title: string;
  detail: string;
  nextAction: string;
  routeTo: string;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlWorkOrderDto = {
  id: string;
  title: string;
  priority: string;
  status: string;
  lifecycleState: MissionControlLifecycleState;
  displayState: MissionControlDisplayState;
  assignedAgent: { id: string; name: string; title: string } | null;
  assignedExternalAgent: { id: string; name: string; roleTitle: string; type: string } | null;
  relatedAutomationJobId: string | null;
  relatedReviewSummaryId: string | null;
  blockedReason: string | null;
  contextBindingStatus: string | null;
  lastUpdated: string;
  nextAction: string;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlJobDto = {
  id: string;
  workOrderId: string;
  title: string;
  mode: string;
  status: string;
  lifecycleState: MissionControlLifecycleState;
  displayState: MissionControlDisplayState;
  runner: { id: string; name: string; status: string } | null;
  agent: { id: string; name: string; title: string } | null;
  reviewSummaryId: string | null;
  lastUpdated: string;
  nextAction: string;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlReviewItemDto = {
  id: string;
  automationJobId: string;
  workOrderId: string;
  title: string;
  verdict: string;
  kingRecommendation: string;
  summary: string;
  severity: MissionControlSeverity;
  lastUpdated: string;
  nextAction: string;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlAgentActivityDto = {
  id: string;
  agentId: string | null;
  agentName: string;
  role: string | null;
  currentState: MissionControlDisplayState;
  relatedWorkOrderId: string | null;
  relatedAutomationJobId: string | null;
  relatedReviewSummaryId: string | null;
  title: string;
  detail: string | null;
  lastUpdated: string;
  nextAction: string;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlWarningDto = {
  id: string;
  severity: MissionControlSeverity;
  title: string;
  detail: string;
  nextAction: string;
  lastUpdated: string | null;
  sourceReference: MissionControlSourceReferenceDto;
};

export type MissionControlDto = {
  computedAt: string;
  milestoneCodename: "KINGDOM_MISSION_CONTROL_FOUNDATION";
  topAction: MissionControlTopActionDto;
  actionQueue: MissionControlTopActionDto[];
  activeWorkOrders: MissionControlWorkOrderDto[];
  activeWork: MissionControlWorkOrderDto[];
  blockedWorkOrders: MissionControlWorkOrderDto[];
  blockedItems: MissionControlWorkOrderDto[];
  needsReviewItems: MissionControlReviewItemDto[];
  runningJobs: MissionControlJobDto[];
  recentAgentActivity: MissionControlAgentActivityDto[];
  recentActivity: MissionControlAgentActivityDto[];
  staleContextWarnings: MissionControlWarningDto[];
  contextWarnings: MissionControlWarningDto[];
  providerRoutingWarnings: MissionControlWarningDto[];
  providerWarnings: MissionControlWarningDto[];
  nextRecommendedAction: string;
  migration: {
    required: false;
    reason: string;
  };
};

// ── M20: Kingdom Strategy Ledger ──────────────────────────────────────────────

export type KingdomObjectiveStatus = "ACTIVE" | "PAUSED" | "ACHIEVED" | "ARCHIVED";
export type SuccessMetricDirection = "INCREASE" | "DECREASE" | "MAINTAIN";
export type SuccessMetricStatus = "UNKNOWN" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "ACHIEVED";
export type KingdomAssetType = "PRODUCT" | "TEMPLATE" | "SERVICE" | "KNOWLEDGE" | "AUTOMATION" | "CONTENT" | "COMMUNITY" | "OTHER";
export type KingdomAssetStatus = "IDEA" | "BUILDING" | "ACTIVE" | "MONETIZING" | "PAUSED" | "ARCHIVED";
export type RevenueModel = "SUBSCRIPTION" | "ONE_TIME" | "SERVICE" | "AFFILIATE" | "ADS" | "LICENSING" | "OTHER";
export type RevenueStreamStatus = "PLANNED" | "TESTING" | "ACTIVE" | "PAUSED" | "ENDED";
export type OpportunityStatus = "INBOX" | "REVIEWING" | "VALIDATING" | "APPROVED" | "REJECTED" | "ARCHIVED";
export type OpportunityExperimentStatus = "PLANNED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type StrategyProjectRefDto = { id: string; name: string; codename: string | null };
export type StrategyUserRefDto = { id: string; displayName: string; email: string };

export type KingdomObjectiveDto = {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  status: KingdomObjectiveStatus;
  priority: MatterPriority;
  targetDate: string | null;
  sourceType: string | null;
  sourceId: string | null;
  tags: string[];
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: StrategyProjectRefDto | null;
  createdBy?: StrategyUserRefDto | null;
  successMetrics?: SuccessMetricDto[];
};

export type SuccessMetricDto = {
  id: string;
  objectiveId: string | null;
  projectId: string | null;
  name: string;
  description: string;
  unit: string;
  direction: SuccessMetricDirection;
  baselineValue: number | null;
  currentValue: number;
  targetValue: number | null;
  status: SuccessMetricStatus;
  sourceType: string | null;
  sourceId: string | null;
  lastMeasuredAt: string | null;
  createdAt: string;
  updatedAt: string;
  objective?: Pick<KingdomObjectiveDto, "id" | "title" | "status"> | null;
  project?: StrategyProjectRefDto | null;
};

export type KingdomAssetDto = {
  id: string;
  projectId: string | null;
  name: string;
  type: KingdomAssetType;
  status: KingdomAssetStatus;
  description: string;
  valueHypothesis: string;
  targetCustomer: string;
  monthlyRevenueEstimate: number;
  monthlyCostEstimate: number;
  sourceType: string | null;
  sourceId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  project?: StrategyProjectRefDto | null;
  revenueStreams?: RevenueStreamDto[];
};

export type RevenueStreamDto = {
  id: string;
  projectId: string | null;
  assetId: string | null;
  name: string;
  model: RevenueModel;
  status: RevenueStreamStatus;
  currency: string;
  monthlyRevenue: number;
  monthlyCost: number;
  confidence: number | null;
  notes: string;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: StrategyProjectRefDto | null;
  asset?: Pick<KingdomAssetDto, "id" | "name" | "status" | "type"> | null;
};

export type KingdomOpportunityDto = {
  id: string;
  projectId: string | null;
  objectiveId: string | null;
  assetId: string | null;
  title: string;
  problem: string;
  proposedValue: string;
  targetCustomer: string;
  status: OpportunityStatus;
  priority: MatterPriority;
  confidence: number | null;
  score: number;
  estimatedMonthlyRevenue: number;
  estimatedEffort: string;
  riskLevel: MatterPriority;
  nextAction: string;
  sourceType: string | null;
  sourceId: string | null;
  traceId: string | null;
  tags: string[];
  createdByUserId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: StrategyProjectRefDto | null;
  objective?: Pick<KingdomObjectiveDto, "id" | "title" | "status"> | null;
  asset?: Pick<KingdomAssetDto, "id" | "name" | "status" | "type"> | null;
  createdBy?: StrategyUserRefDto | null;
  experiments?: OpportunityExperimentDto[];
};

export type OpportunityExperimentDto = {
  id: string;
  opportunityId: string;
  title: string;
  hypothesis: string;
  validationMethod: string;
  successCriteria: string;
  status: OpportunityExperimentStatus;
  resultSummary: string | null;
  resultMetric: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  opportunity?: Pick<KingdomOpportunityDto, "id" | "title" | "status" | "score"> | null;
  createdBy?: StrategyUserRefDto | null;
};

export type StrategyOverviewDto = {
  computedAt: string;
  objectives: { active: number; atRiskMetrics: number; achieved: number; archived: number };
  assets: { active: number; monetizing: number; ideas: number; totalEstimatedMonthlyRevenue: number; totalEstimatedMonthlyCost: number };
  revenue: { activeStreams: number; testingStreams: number; monthlyRevenue: number; monthlyCost: number; monthlyNet: number };
  opportunities: { inbox: number; reviewing: number; validating: number; approved: number; rejected: number; top: KingdomOpportunityDto[] };
  activeObjectives: KingdomObjectiveDto[];
  atRiskMetrics: SuccessMetricDto[];
  activeRevenueStreams: RevenueStreamDto[];
};

export type StrategyIntakeResultDto = {
  status: "CREATED" | "EXISTING";
  opportunity: KingdomOpportunityDto;
};

export type StrategyObjectivePayload = Partial<Pick<KingdomObjectiveDto, "projectId" | "description" | "status" | "priority" | "targetDate" | "sourceType" | "sourceId" | "tags">> & {
  title: string;
};

export type StrategyMetricPayload = Partial<Omit<SuccessMetricDto, "id" | "createdAt" | "updatedAt" | "objective" | "project">> & {
  name: string;
};

export type StrategyAssetPayload = Partial<Omit<KingdomAssetDto, "id" | "createdAt" | "updatedAt" | "project" | "revenueStreams">> & {
  name: string;
};

export type StrategyRevenueStreamPayload = Partial<Omit<RevenueStreamDto, "id" | "createdAt" | "updatedAt" | "project" | "asset">> & {
  name: string;
};

export type StrategyOpportunityPayload = Partial<Omit<KingdomOpportunityDto, "id" | "createdAt" | "updatedAt" | "createdBy" | "reviewedAt" | "reviewedByUserId" | "createdByUserId" | "project" | "objective" | "asset" | "experiments">> & {
  title: string;
};

export type StrategyExperimentPayload = Partial<Omit<OpportunityExperimentDto, "id" | "createdAt" | "updatedAt" | "createdBy" | "opportunity" | "createdByUserId">> & {
  opportunityId: string;
  title: string;
};

// ── M23: Decree Lineage (ordered King-facing trace) ──────────────────────────
export type LineageAgentRef = { id: string; name: string; title: string | null } | null;

export interface DecreeLineageDto {
  anchor: { workOrderId: string | null; taskId: string | null; sessionId: string | null };
  decree: {
    id: string;
    title: string;
    command: string;
    mode: string;
    createdAt: string;
    createdByName: string | null;
  } | null;
  council: {
    id: string;
    finalSummary: string | null;
    fallbackNotice: string | null;
    createdAt: string;
    responses: Array<{ role: string; agent: LineageAgentRef; response: string }>;
  } | null;
  owner: {
    workOrderId: string;
    title: string;
    status: string;
    contextBindingStatus: string | null;
    executionTarget: string | null;
    assignedAgent: LineageAgentRef;
    assignedAgentReason: string | null;
    assignedExternalAgentName: string | null;
  } | null;
  externalPrompt: {
    runId: string;
    externalAgentName: string | null;
    inputPrompt: string;
  } | null;
  externalResult: {
    runId: string;
    status: string;
    exitCode: number | null;
    outputText: string | null;
    completedAt: string | null;
    patches: Array<{
      id: string;
      validationStatus: string | null;
      riskLevel: string | null;
      filesChanged: string[];
      diffStat: string | null;
    }>;
  } | null;
  review: {
    reviewerAgent: LineageAgentRef;
    verdict: string;
    confidence: string;
    kingRecommendation: string;
    summary: string;
    createdAt: string;
    knowledge: Array<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      category: string | null;
      proposedByAgent: LineageAgentRef;
    }>;
  } | null;
  secretarySummary: {
    id: string | null;
    title: string;
    summary: string;
    createdAt: string | null;
    synthesized: boolean;
  } | null;
}
