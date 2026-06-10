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
  exitCode: number;
  durationMs: number;
  output: string;
  success: boolean;
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
