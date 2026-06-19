import type { Agent, AgentResponse, AutomationJob, ExternalAgent, ExternalAgentRun, KingdomNextExecutableAction, KnowledgeCategory, KnowledgeCandidateStatus, Memory, ProviderBalanceSnapshot, Report, Task, TaskMode, TaskStatus, WorkOrder } from "@prisma/client";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

export type AgentDto = Pick<Agent, "id" | "slug" | "name" | "title" | "role" | "specialty" | "isActive"> & {
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
  displayName?: string | null;
  displayTitle?: string | null;
  avatarUrl?: string | null;
  avatarPrompt?: string | null;
  avatarStyle?: string | null;
  avatarVersion?: number;
  avatarUpdatedAt?: string | null;
  canonicalName?: string | null;
  canonicalTitle?: string | null;
  coreSlug?: string | null;
};

export type CouncilResponseDto = AgentResponse & {
  agent: AgentDto;
};

export type CouncilNextExecutableActionDto = KingdomNextExecutableAction;

export type PlannerResultDto = {
  drafted: number;
  skipped: number;
  sessionId: string;
  draftedWorkOrderIds: string[];
  createdWorkOrder?: WorkOrder | null;
  skipReason?: string;
  traceId?: string;
};

export type CouncilExternalAgentExecutionDto = {
  workOrder: WorkOrder;
  job: AutomationJob;
  externalAgentRun: ExternalAgentRun | null;
  externalAgent: ExternalAgent | null;
  plannerResult: PlannerResultDto | null;
  alreadyScheduled: boolean;
  message: string;
};

export type TaskDto = Pick<Task, "id" | "title" | "command" | "mode" | "status" | "createdBy" | "createdAt" | "updatedAt"> & {
  reports: Report[];
};

export type CreateTaskResponse = {
  task: TaskDto;
};

export type ListTasksResponse = {
  tasks: TaskDto[];
};

export type ListAgentsResponse = {
  agents: AgentDto[];
};

export type DirectAgentRequestTypeDto = "GENERAL_QUESTION" | "RESEARCH_ASSIGNMENT" | "SUMMARY_ASSIGNMENT" | "PERSONAL_TASK";
export type DirectAgentSaveModeDto = "NONE" | "ARTIFACT" | "KNOWLEDGE_CANDIDATE" | "BOTH";
export type DirectAgentSessionStatusDto = "OPEN" | "COMPLETED" | "FAILED" | "ARCHIVED";
export type DirectAgentMessageRoleDto = "USER" | "AGENT" | "SYSTEM";

export type DirectAgentSummaryDto = Pick<AgentDto, "id" | "slug" | "name" | "title" | "role" | "specialty" | "isActive"> & {
  description: string;
  skills: string[];
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
};

export type DirectAgentMessageDto = {
  id: string;
  sessionId: string;
  agentId: string | null;
  role: DirectAgentMessageRoleDto;
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
  requestType: DirectAgentRequestTypeDto;
  status: DirectAgentSessionStatusDto;
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

export type ListReportsResponse = {
  reports: Array<Report & { task: Pick<Task, "id" | "command" | "status" | "createdAt"> | null }>;
};

export type ListMemoriesResponse = {
  memories: Memory[];
};

export type ProviderBalanceSnapshotDto = Omit<ProviderBalanceSnapshot, "raw"> & {
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
  syncedAt: Date;
  createdAt: Date;
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
  syncedAt: Date;
  createdAt: Date;
};

export type ProviderHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export type ProviderHealthSnapshotDto = {
  id: string;
  providerType: string;
  providerId: string | null;
  lastSuccessAt: Date | null;
  failureRate: number | null;
  timeoutRate: number | null;
  avgDurationMs: number | null;
  sampleSize: number;
  healthStatus: ProviderHealthStatus;
  computedAt: Date;
  createdAt: Date;
};

export type TreasuryReconciliationStatus = "NO_BALANCE_SNAPSHOT" | "OK" | "ESTIMATE_ONLY" | "PROVIDER_API_ERROR";

export type TaskStatusDto = TaskStatus;
export type TaskModeDto = TaskMode;

export type KnowledgeCategoryDto = KnowledgeCategory;
export type KnowledgeCandidateStatusDto = KnowledgeCandidateStatus;

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

export type RefreshWorkOrderContextResult = {
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
  name: string;
  role: string;
  displayName: string | null;
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

// ── M20: Kingdom Strategy Ledger ──────────────────────────────────────────────

export type StrategyPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type KingdomObjectiveStatusDto = "ACTIVE" | "PAUSED" | "ACHIEVED" | "ARCHIVED";
export type SuccessMetricDirectionDto = "INCREASE" | "DECREASE" | "MAINTAIN";
export type SuccessMetricStatusDto = "UNKNOWN" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "ACHIEVED";
export type KingdomAssetTypeDto = "PRODUCT" | "TEMPLATE" | "SERVICE" | "KNOWLEDGE" | "AUTOMATION" | "CONTENT" | "COMMUNITY" | "OTHER";
export type KingdomAssetStatusDto = "IDEA" | "BUILDING" | "ACTIVE" | "MONETIZING" | "PAUSED" | "ARCHIVED";
export type RevenueModelDto = "SUBSCRIPTION" | "ONE_TIME" | "SERVICE" | "AFFILIATE" | "ADS" | "LICENSING" | "OTHER";
export type RevenueStreamStatusDto = "PLANNED" | "TESTING" | "ACTIVE" | "PAUSED" | "ENDED";
export type OpportunityStatusDto = "INBOX" | "REVIEWING" | "VALIDATING" | "APPROVED" | "REJECTED" | "ARCHIVED";
export type OpportunityExperimentStatusDto = "PLANNED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type StrategyProjectRefDto = { id: string; name: string; codename: string | null };
export type StrategyUserRefDto = { id: string; displayName: string; email: string };

export type KingdomObjectiveDto = {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  status: KingdomObjectiveStatusDto;
  priority: StrategyPriority;
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
  direction: SuccessMetricDirectionDto;
  baselineValue: number | null;
  currentValue: number;
  targetValue: number | null;
  status: SuccessMetricStatusDto;
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
  type: KingdomAssetTypeDto;
  status: KingdomAssetStatusDto;
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
  model: RevenueModelDto;
  status: RevenueStreamStatusDto;
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
  status: OpportunityStatusDto;
  priority: StrategyPriority;
  confidence: number | null;
  score: number;
  estimatedMonthlyRevenue: number;
  estimatedEffort: string;
  riskLevel: StrategyPriority;
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
  status: OpportunityExperimentStatusDto;
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
