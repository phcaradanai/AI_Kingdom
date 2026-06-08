import { createHash } from "node:crypto";
import type { KnowledgeCategory, KnowledgeCandidateStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { redactSecrets } from "./usageAttributionService.js";
import { evaluateRecordValue, shouldPersistRecord } from "./dataValueGateService.js";
import { isForbiddenMemoryContent } from "./memorySafety.js";

// ---------- Types ----------

export type ProposeKnowledgeCandidateInput = {
  agentId: string;
  projectId?: string | null;
  taskId?: string | null;
  councilSessionId?: string | null;
  traceId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  title: string;
  content: string;
  summary?: string | null;
  category?: KnowledgeCategory;
  confidence?: number | null;
  proposedByAgentId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

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

// ---------- Helpers ----------

const SENSITIVE_PATTERNS = [/api[_-]?key/i, /password/i, /secret/i, /token/i, /sk-[a-z0-9]/i];

function buildFingerprint(title: string, content: string): string {
  const normalized = `${title.toLowerCase().trim()}::${content.toLowerCase().trim()}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function isSensitive(value: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(value));
}

function trimContent(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function categorizeText(text: string): KnowledgeCategory {
  if (/(decision|decided|chosen|selected|architecture|design)/i.test(text)) return "ARCHITECTURE_DECISION";
  if (/(prefer|preference|style|tone|default|always|never use)/i.test(text)) return "USER_PREFERENCE";
  if (/(bug|error|failure|crash|fix|workaround)/i.test(text)) return "BUG_LEARNING";
  if (/(cost|expensive|cheap|token|billing|rate limit)/i.test(text)) return "COST_LEARNING";
  if (/(risk|danger|avoid|must not|cannot|critical)/i.test(text)) return "RISK";
  if (/(prompt|template|format|instruction pattern)/i.test(text)) return "PROMPT_PATTERN";
  if (/(rule|workflow|process|procedure|step)/i.test(text)) return "WORKFLOW_RULE";
  if (/(provider|model|timeout|fallback|api behavior)/i.test(text)) return "PROVIDER_BEHAVIOR";
  if (/(project|feature|milestone|requirement)/i.test(text)) return "PROJECT_FACT";
  return "UNKNOWN";
}

// ---------- Extraction ----------

export async function extractKnowledgeCandidatesFromTrace(traceId: string): Promise<KnowledgeCandidateDto[]> {
  const trace = await prisma.aIUsageTrace.findUnique({
    where: { traceId },
    include: { steps: true }
  });
  if (!trace) return [];

  const agentId = trace.agentId;
  if (!agentId) return [];

  const candidates: ProposeKnowledgeCandidateInput[] = [];

  // Extract from response previews in steps
  for (const step of trace.steps) {
    const preview = step.responsePreview ?? "";
    if (!preview || preview.split(/\s+/).length < 5) continue;
    if (isSensitive(preview)) continue;

    const category = categorizeText(preview);
    if (category === "UNKNOWN" && step.operation !== "FINAL_COUNSEL") continue;

    candidates.push({
      agentId,
      projectId: trace.projectId,
      taskId: trace.taskId,
      councilSessionId: trace.councilSessionId,
      traceId,
      sourceType: "TRACE_STEP",
      sourceId: step.id,
      title: `Knowledge from ${step.operation ?? "operation"} (${step.title})`,
      content: trimContent(preview, 800),
      summary: trimContent(preview, 200),
      category,
      confidence: 0.6,
      proposedByAgentId: agentId,
      tags: [step.operation ?? "unknown", category.toLowerCase()]
    });
  }

  // Extract from the trace-level response preview
  if (trace.responsePreview && !isSensitive(trace.responsePreview)) {
    const text = trace.responsePreview;
    const category = categorizeText(text);
    candidates.push({
      agentId,
      projectId: trace.projectId,
      taskId: trace.taskId,
      councilSessionId: trace.councilSessionId,
      traceId,
      sourceType: "TRACE",
      sourceId: trace.id,
      title: `Trace-level knowledge: ${trace.operation}`,
      content: trimContent(text, 800),
      summary: trimContent(text, 200),
      category,
      confidence: 0.5,
      proposedByAgentId: agentId,
      tags: [trace.operation, category.toLowerCase()].filter(Boolean) as string[]
    });
  }

  const created: KnowledgeCandidateDto[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      const result = await proposeKnowledgeCandidate(candidate);
      if (result) created.push(result);
    } catch {
      // skip duplicates or constraint errors
    }
  }
  return created;
}

// ---------- CRUD ----------

export async function proposeKnowledgeCandidate(
  input: ProposeKnowledgeCandidateInput
): Promise<KnowledgeCandidateDto | null> {
  if (isSensitive(input.title) || isSensitive(input.content) || isForbiddenMemoryContent(input.title, input.content)) return null;

  const fingerprint = buildFingerprint(input.title, input.content);

  // Apply M15H: Kingdom Data Value Gate
  const gateDecision = await evaluateRecordValue({
    recordType: "knowledgeCandidate",
    origin: "SYSTEM_GENERATED",
    title: input.title,
    content: input.content,
    traceId: input.traceId ?? undefined,
    projectId: input.projectId ?? undefined,
    category: input.category ?? "UNKNOWN",
    confidence: input.confidence ?? undefined,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? undefined,
    metadata: {
      fingerprint,
      taskId: input.taskId,
      councilSessionId: input.councilSessionId,
      ...input.metadata
    }
  });

  const persist = shouldPersistRecord(gateDecision, {
    recordType: "knowledgeCandidate",
    origin: "SYSTEM_GENERATED"
  });

  if (!persist) {
    return null;
  }

  const status = gateDecision.decision === "REJECT" ? ("REJECTED" as const) : ("PENDING" as const);
  const rejectionReason = gateDecision.decision === "REJECT" ? gateDecision.reason : null;

  let targetMemoryId: string | null = null;
  if (gateDecision.reason.includes("Merge suggestion available")) {
    const mem = await prisma.agentKnowledgeMemory.findFirst({ where: { fingerprint } });
    targetMemoryId = mem?.id ?? null;
  }

  const meta = {
    ...(input.metadata as object),
    retentionPolicy: gateDecision.retentionPolicy,
    sourceTrust: gateDecision.sourceTrust,
    ...(targetMemoryId ? { targetMemoryId } : {})
  };

  const candidate = await prisma.agentKnowledgeCandidate.create({
    data: {
      agentId: input.agentId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      councilSessionId: input.councilSessionId ?? null,
      traceId: input.traceId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      title: trimContent(input.title, 200),
      content: trimContent(input.content, 2000),
      summary: input.summary ? trimContent(input.summary, 300) : null,
      category: input.category ?? "UNKNOWN",
      confidence: input.confidence ?? null,
      status,
      rejectionReason,
      proposedByAgentId: input.proposedByAgentId ?? null,
      tags: input.tags ?? [],
      fingerprint,
      metadata: meta
    }
  });

  return toCandidateDto(candidate);
}

export async function approveKnowledgeCandidate(
  candidateId: string,
  userId: string
): Promise<KnowledgeMemoryDto | null> {
  const candidate = await prisma.agentKnowledgeCandidate.findUnique({
    where: { id: candidateId }
  });
  if (!candidate || candidate.status !== "PENDING") return null;

  await prisma.agentKnowledgeCandidate.update({
    where: { id: candidateId },
    data: {
      status: "APPROVED",
      reviewedByUserId: userId,
      reviewedAt: new Date()
    }
  });

  // Check for duplicate in memory store
  const existingMemory = candidate.fingerprint
    ? await prisma.agentKnowledgeMemory.findFirst({ where: { fingerprint: candidate.fingerprint } })
    : null;
  if (existingMemory) return toMemoryDto(existingMemory);

  const memory = await prisma.agentKnowledgeMemory.create({
    data: {
      sourceCandidateId: candidate.id,
      agentId: candidate.agentId,
      projectId: candidate.projectId,
      title: candidate.title,
      content: candidate.content,
      summary: candidate.summary,
      category: candidate.category,
      trustLevel: "APPROVED",
      tags: candidate.tags,
      fingerprint: candidate.fingerprint,
      createdFromTraceId: candidate.traceId,
      approvedByUserId: userId,
      approvedAt: new Date(),
      metadata: candidate.metadata ?? undefined
    }
  });

  return toMemoryDto(memory);
}

export async function rejectKnowledgeCandidate(
  candidateId: string,
  userId: string,
  reason: string
): Promise<KnowledgeCandidateDto | null> {
  const candidate = await prisma.agentKnowledgeCandidate.findUnique({
    where: { id: candidateId }
  });
  if (!candidate || candidate.status !== "PENDING") return null;

  const updated = await prisma.agentKnowledgeCandidate.update({
    where: { id: candidateId },
    data: {
      status: "REJECTED",
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      rejectionReason: reason
    }
  });

  return toCandidateDto(updated);
}

export async function mergeKnowledgeCandidate(
  candidateId: string,
  targetMemoryId: string,
  userId: string
): Promise<KnowledgeMemoryDto | null> {
  const candidate = await prisma.agentKnowledgeCandidate.findUnique({
    where: { id: candidateId }
  });
  const target = await prisma.agentKnowledgeMemory.findUnique({
    where: { id: targetMemoryId }
  });
  if (!candidate || !target) return null;

  // Append content if meaningfully different
  const combined = target.content.includes(candidate.content)
    ? target.content
    : `${target.content}\n\n[Merged from candidate ${candidate.id}]: ${candidate.content}`;

  const updated = await prisma.agentKnowledgeMemory.update({
    where: { id: targetMemoryId },
    data: {
      content: trimContent(combined, 3000),
      tags: [...new Set([...target.tags, ...candidate.tags])],
      updatedAt: new Date()
    }
  });

  await prisma.agentKnowledgeCandidate.update({
    where: { id: candidateId },
    data: {
      status: "MERGED",
      reviewedByUserId: userId,
      reviewedAt: new Date()
    }
  });

  return toMemoryDto(updated);
}

export async function findSimilarKnowledge(candidate: {
  title: string;
  content: string;
  agentId?: string | null;
  projectId?: string | null;
}): Promise<KnowledgeMemoryDto[]> {
  const fingerprint = buildFingerprint(candidate.title, candidate.content);

  const exact = await prisma.agentKnowledgeMemory.findMany({
    where: { fingerprint }
  });
  if (exact.length > 0) return exact.map(toMemoryDto);

  // Fuzzy: title word overlap
  const titleWords = candidate.title
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  if (titleWords.length === 0) return [];

  const memories = await prisma.agentKnowledgeMemory.findMany({
    where: {
      OR: [
        { agentId: candidate.agentId ?? undefined },
        { projectId: candidate.projectId ?? undefined }
      ]
    },
    take: 50
  });

  return memories
    .filter((m) => {
      const hay = m.title.toLowerCase();
      return titleWords.some((w) => hay.includes(w));
    })
    .slice(0, 5)
    .map(toMemoryDto);
}

// ---------- Context building ----------

export async function buildAgentKnowledgeContext(
  agentId: string,
  projectId?: string | null,
  taskId?: string | null,
  maxTokens = 1500
): Promise<{ context: string; memoryIds: string[] }> {
  const memories = await prisma.agentKnowledgeMemory.findMany({
    where: {
      trustLevel: "APPROVED",
      OR: [
        { agentId, projectId: projectId ?? undefined },
        { agentId },
        { projectId: projectId ?? undefined },
        { agentId: null, projectId: null }
      ]
    },
    orderBy: [{ useCount: "desc" }, { approvedAt: "desc" }],
    take: 20
  });

  const lines: string[] = [];
  const usedIds: string[] = [];
  let approxTokens = 0;
  const TOKEN_ESTIMATE = 4;

  for (const m of memories) {
    const line = `[${m.category}] ${m.title}: ${m.content}`;
    const lineTokens = Math.ceil(line.length / TOKEN_ESTIMATE);
    if (approxTokens + lineTokens > maxTokens) break;
    lines.push(line);
    usedIds.push(m.id);
    approxTokens += lineTokens;
  }

  if (usedIds.length > 0) {
    await prisma.agentKnowledgeMemory.updateMany({
      where: { id: { in: usedIds } },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } }
    });
  }

  return {
    context: lines.join("\n"),
    memoryIds: usedIds
  };
}

// ---------- DTO mappers ----------

function toCandidateDto(c: {
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
  reviewedAt: Date | null;
  rejectionReason: string | null;
  tags: string[];
  fingerprint: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeCandidateDto {
  return {
    id: c.id,
    agentId: c.agentId,
    projectId: c.projectId,
    taskId: c.taskId,
    councilSessionId: c.councilSessionId,
    traceId: c.traceId,
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    title: c.title,
    content: c.content,
    summary: c.summary,
    category: c.category,
    confidence: c.confidence,
    status: c.status,
    proposedByAgentId: c.proposedByAgentId,
    reviewedByUserId: c.reviewedByUserId,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    rejectionReason: c.rejectionReason,
    tags: c.tags,
    fingerprint: c.fingerprint,
    metadata: c.metadata,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  };
}

function toMemoryDto(m: {
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
  approvedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeMemoryDto {
  return {
    id: m.id,
    sourceCandidateId: m.sourceCandidateId,
    agentId: m.agentId,
    projectId: m.projectId,
    title: m.title,
    content: m.content,
    summary: m.summary,
    category: m.category,
    trustLevel: m.trustLevel,
    tags: m.tags,
    fingerprint: m.fingerprint,
    createdFromTraceId: m.createdFromTraceId,
    approvedByUserId: m.approvedByUserId,
    approvedAt: m.approvedAt?.toISOString() ?? null,
    lastUsedAt: m.lastUsedAt?.toISOString() ?? null,
    useCount: m.useCount,
    metadata: m.metadata,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString()
  };
}

export { redactSecrets };
export { buildFingerprint };
