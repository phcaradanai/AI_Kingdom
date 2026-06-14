import type { Agent, AgentResponse, KnowledgeCategory, KnowledgeCandidateStatus, Memory, ProviderBalanceSnapshot, Report, Task, TaskMode, TaskStatus } from "@prisma/client";

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
