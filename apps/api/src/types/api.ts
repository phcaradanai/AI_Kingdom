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

export type AgentDto = Pick<Agent, "id" | "slug" | "name" | "title" | "role" | "specialty" | "isActive">;

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
