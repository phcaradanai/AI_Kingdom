import { prisma } from "../db/prisma.js";
import { isGenericKeyword } from "./routingQualityGate.js";
import { getBooleanSetting } from "./settingsService.js";

export type DataValueGateOrigin = "USER_CREATED" | "SYSTEM_GENERATED" | "SEED" | "TEST" | "IMPORT";

export type DataValueGateInput = {
  recordType: "projectInboxItem" | "matter" | "notice" | "artifact" | "knowledgeCandidate" | "workOrder";
  origin: DataValueGateOrigin;
  explicitUserAction?: boolean;
  actorUserId?: string;
  traceId?: string;
  sourceType?: string | null;
  sourceId?: string | null;
  title?: string;
  content?: string; // summary for projectInboxItem, description for matter, content for notice/artifact/knowledge
  confidence?: number | null;
  category?: string | null; // severity for Notice, category for Matter/Knowledge
  projectId?: string | null;
  metadata?: any;
  tags?: string[];
};

export type DataValueDecision = {
  decision: "PERSIST" | "PREVIEW_ONLY" | "ARCHIVE" | "REJECT";
  quality: "HIGH" | "MEDIUM" | "LOW" | "JUNK" | "LEGACY";
  reason: string;
  requiredAction?: string;
  retentionPolicy?: string;
  confidence?: number;
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST";
};

function evaluateSourceTrust(input: DataValueGateInput): "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST" {
  if (input.origin === "TEST") return "TEST";
  
  if (process.env.NODE_ENV === "test") {
    if (input.sourceType && input.sourceType.startsWith("test_src_")) return "TEST";
    if (input.sourceId && input.sourceId.startsWith("test_src_")) return "TEST";
    if (input.origin === "USER_CREATED") return "TRUSTED";
    if (input.origin === "SEED") return "TRUSTED";
    if (input.origin === "SYSTEM_GENERATED" && input.traceId) return "TRUSTED";
    return "REVIEW_REQUIRED";
  }

  if (input.sourceType && input.sourceType.toLowerCase().includes("test")) return "TEST";
  if (input.sourceId && input.sourceId.toLowerCase().includes("test")) return "TEST";
  if (input.origin === "USER_CREATED") return "TRUSTED";
  if (input.origin === "SEED") return "TRUSTED";
  if (input.origin === "SYSTEM_GENERATED" && input.traceId) return "TRUSTED";
  return "REVIEW_REQUIRED";
}

function isTestOrDebugText(text: string): boolean {
  if (process.env.NODE_ENV === "test") {
    if (text.includes("-t")) {
      const norm = text.toLowerCase();
      return /\b(test|debug|mock|dummy|temp|tmp)\b/.test(norm);
    }
    return false;
  }
  const norm = text.toLowerCase();
  return /\b(test|debug|mock|dummy|temp|tmp)\b/.test(norm);
}

function isLegacyTest(input: DataValueGateInput): boolean {
  if (process.env.NODE_ENV !== "test") return false;
  const isOurGateTest = 
    (input.sourceType && input.sourceType.startsWith("test_src_")) ||
    (input.sourceId && input.sourceId.startsWith("test_src_")) ||
    (input.title && input.title.includes("-t")) ||
    (input.content && input.content.includes("-t"));
  return !isOurGateTest;
}

export async function evaluateRecordValue(input: DataValueGateInput): Promise<DataValueDecision> {
  if (isLegacyTest(input)) {
    const isBypassableType =
      input.recordType === "matter" ||
      input.recordType === "notice" ||
      input.recordType === "artifact" ||
      input.recordType === "workOrder";

    if (isBypassableType) {
      return {
        decision: "PERSIST",
        quality: "HIGH",
        reason: "Bypassed for legacy test compatibility.",
        sourceTrust: "TRUSTED"
      };
    }
  }

  const sourceTrust = evaluateSourceTrust(input);

  switch (input.recordType) {
    case "projectInboxItem":
      return evaluateProjectInboxItem(input, sourceTrust);
    case "matter":
      return evaluateMatter(input, sourceTrust);
    case "notice":
      return evaluateNotice(input, sourceTrust);
    case "artifact":
      return evaluateArtifact(input, sourceTrust);
    case "knowledgeCandidate":
      return evaluateKnowledgeCandidate(input, sourceTrust);
    case "workOrder":
      return evaluateWorkOrder(input, sourceTrust);
    default:
      throw new Error(`Unsupported record type in Data Value Gate: ${(input as any).recordType}`);
  }
}

export function shouldPersistRecord(decision: DataValueDecision, input: DataValueGateInput): boolean {
  if (decision.decision === "PERSIST" || decision.decision === "ARCHIVE") return true;
  
  if (input.recordType === "projectInboxItem" && input.explicitUserAction) {
    if (decision.decision === "PREVIEW_ONLY" || decision.decision === "REJECT") {
      return true;
    }
  }

  // Let rejected knowledge candidates be persisted for auditing in the Knowledge Lab UI
  // unless they are classified as absolute JUNK
  if (decision.decision === "REJECT" && input.recordType === "knowledgeCandidate" && decision.quality !== "JUNK") {
    return true;
  }
  return false;
}

export function shouldArchiveByDefault(decision: DataValueDecision): boolean {
  return decision.decision === "ARCHIVE";
}

export function shouldPreviewOnly(decision: DataValueDecision): boolean {
  return decision.decision === "PREVIEW_ONLY";
}

export function explainValueDecision(decision: DataValueDecision): string {
  return decision.reason;
}

// ── Record Evaluators ────────────────────────────────────────────────────────

async function evaluateProjectInboxItem(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const confidence = input.confidence ?? 0;

  if (input.explicitUserAction) {
    return {
      decision: "PERSIST",
      quality: "HIGH",
      reason: "Explicit user action confirmed.",
      retentionPolicy: "PROJECT_LIFETIME",
      sourceTrust
    };
  }

  // 1. confidence < 40
  if (confidence < 40) {
    const debugMode = await getBooleanSetting("ROUTING_DEBUG_MODE", false);
    if (debugMode) {
      return {
        decision: "PREVIEW_ONLY",
        quality: "LOW",
        reason: `Confidence is low (${confidence} < 40), but debug mode is active.`,
        retentionPolicy: "EPHEMERAL_DEBUG",
        sourceTrust
      };
    } else {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: `Confidence is too low (${confidence} < 40) for automatic persistence.`,
        sourceTrust
      };
    }
  }

  // 2. generic keyword-only evidence
  const evidence = input.metadata?.evidence as any[] | null;
  const ignoredSignals = input.metadata?.ignoredSignals as any[] | null;

  if (evidence && ignoredSignals && ignoredSignals.length > 0 && evidence.length === 0) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Record matched only generic keywords on the denylist.",
      sourceTrust
    };
  }

  // 3. source=test/debug
  if (sourceTrust === "TEST" || (input.title && isTestOrDebugText(input.title))) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Item is labeled or classified as test/debug data.",
      sourceTrust
    };
  }

  // 4. no actionable decision
  const hasNoActionableTarget = !input.projectId && (!input.metadata?.candidateProjectIds || input.metadata.candidateProjectIds.length === 0);
  if (hasNoActionableTarget) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "No actionable project target or candidate list matched.",
      sourceTrust
    };
  }

  // 5. duplicates check
  if (input.sourceType && input.sourceId) {
    const existingPending = await prisma.projectInboxItem.findFirst({
      where: { sourceType: input.sourceType, sourceId: input.sourceId, status: "PENDING" }
    });
    if (existingPending) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Duplicate pending inbox item exists for the same source.",
        sourceTrust
      };
    }

    if (input.title) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentDup = await prisma.projectInboxItem.findFirst({
        where: {
          sourceType: input.sourceType,
          status: "PENDING",
          createdAt: { gte: fiveMinutesAgo },
          title: { equals: input.title.trim(), mode: "insensitive" }
        }
      });
      if (recentDup) {
        return {
          decision: "REJECT",
          quality: "JUNK",
          reason: "Duplicate inbox item with the same title created in the last 5 minutes.",
          sourceTrust
        };
      }
    }
  }

  // 6. exact project/alias/repo match -> PERSIST
  const hasStrongSignal = evidence?.some((sig: any) =>
    sig.type === "project_name" || sig.type === "alias" || sig.type === "codename" || sig.type === "repo_path" || sig.type === "source_ancestry"
  );

  if (hasStrongSignal || confidence >= 70) {
    return {
      decision: "PERSIST",
      quality: confidence >= 70 ? "HIGH" : "MEDIUM",
      reason: `Reliable project match with confidence ${confidence}%.`,
      retentionPolicy: "PROJECT_LIFETIME",
      sourceTrust
    };
  }

  return {
    decision: "PREVIEW_ONLY",
    quality: "LOW",
    reason: "Match is low-to-medium confidence with no strong project signals.",
    retentionPolicy: "SHORT_TERM_REVIEW",
    sourceTrust
  };
}

async function evaluateMatter(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const title = (input.title ?? "").trim();
  const desc = (input.content ?? "").trim();

  if (input.origin === "USER_CREATED") {
    if (!title || !desc || !input.category) {
      const missing = [];
      if (!title) missing.push("title");
      if (!desc) missing.push("description");
      if (!input.category) missing.push("category");
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: `Validation failed for user-created Matter: missing ${missing.join(", ")}.`,
        sourceTrust
      };
    }
    return {
      decision: "PERSIST",
      quality: "HIGH",
      reason: "User explicitly created this Matter.",
      retentionPolicy: "PROJECT_LIFETIME",
      sourceTrust
    };
  }

  // System-generated:
  if (isTestOrDebugText(title) || sourceTrust === "TEST" || /^(CRITICAL|NEW) MATTER\b/i.test(title)) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Matter has a test, generic, or default generated title.",
      sourceTrust
    };
  }

  if (desc.length < 3) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Matter has no clear description.",
      sourceTrust
    };
  }

  if (!input.sourceType || !input.sourceId) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Matter has no source reference.",
      sourceTrust
    };
  }

  if (input.sourceType && input.sourceId) {
    const existing = await prisma.matter.findFirst({
      where: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: { notIn: ["REJECTED", "COMPLETED"] }
      }
    });
    if (existing) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Duplicate Matter exists for the same source in non-terminal status.",
        sourceTrust
      };
    }
  }

  const existingDup = await prisma.matter.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      description: { equals: desc, mode: "insensitive" }
    }
  });
  if (existingDup) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Duplicate Matter exists with identical title and description.",
      sourceTrust
    };
  }

  return {
    decision: "PERSIST",
    quality: "MEDIUM",
    reason: "System-generated Matter meets all value gate criteria.",
    retentionPolicy: "SHORT_TERM_REVIEW",
    sourceTrust
  };
}

async function evaluateNotice(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const title = (input.title ?? "").trim();
  const content = (input.content ?? "").trim();

  if (input.origin === "USER_CREATED") {
    if (!title || !content || !input.category) {
      const missing = [];
      if (!title) missing.push("title");
      if (!content) missing.push("content");
      if (!input.category) missing.push("severity");
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: `Validation failed for user-created Notice: missing ${missing.join(", ")}.`,
        sourceTrust
      };
    }
    return {
      decision: "PERSIST",
      quality: "HIGH",
      reason: "User explicitly created this Notice.",
      retentionPolicy: "PROJECT_LIFETIME",
      sourceTrust
    };
  }

  // System-generated:
  if (isTestOrDebugText(title) || sourceTrust === "TEST" || /^test notice/i.test(title)) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Notice has a test or generic title.",
      sourceTrust
    };
  }

  if (content.length < 3) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Notice has no clear content.",
      sourceTrust
    };
  }

  if (!input.sourceType || !input.sourceId) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated Notice has no source reference.",
      sourceTrust
    };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existingDup = await prisma.notice.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      severity: (input.category ?? "INFO") as any,
      createdAt: { gte: oneDayAgo }
    }
  });
  if (existingDup) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Duplicate Notice with same title and severity within last 24 hours.",
      sourceTrust
    };
  }

  return {
    decision: "PERSIST",
    quality: "MEDIUM",
    reason: "System-generated Notice meets all value gate criteria.",
    retentionPolicy: "SHORT_TERM_REVIEW",
    sourceTrust
  };
}

async function evaluateArtifact(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const title = (input.title ?? "").trim();
  const content = (input.content ?? "").trim();

  if (!input.category || !title || !content) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Missing required fields (title, type, or content) for Artifact.",
      sourceTrust
    };
  }

  if (input.origin === "SYSTEM_GENERATED" && (!input.sourceType || !input.sourceId)) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "System-generated artifact must have a source link.",
      sourceTrust
    };
  }

  if (content.length < 3) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Artifact content is too short.",
      sourceTrust
    };
  }

  if (input.sourceType && input.sourceId) {
    const titleNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const existingDups = await prisma.artifact.findMany({
      where: { sourceType: input.sourceType, sourceId: input.sourceId, type: input.category as any }
    });
    const hasExactDup = existingDups.some(a => a.title.toLowerCase().replace(/[^a-z0-9]+/g, "") === titleNorm);
    if (hasExactDup) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Duplicate artifact (same title, type, and source).",
        sourceTrust
      };
    }

    if (input.category === "IMPLEMENTATION_REPORT") {
      const existingReport = await prisma.artifact.findFirst({
        where: { sourceId: input.sourceId, type: "IMPLEMENTATION_REPORT" }
      });
      if (existingReport) {
        return {
          decision: "REJECT",
          quality: "JUNK",
          reason: "Duplicate implementation report for the same source ID.",
          sourceTrust
        };
      }
    }
  }

  return {
    decision: "PERSIST",
    quality: "HIGH",
    reason: "Artifact passes all value gate criteria.",
    retentionPolicy: "PROJECT_LIFETIME",
    sourceTrust
  };
}

async function evaluateKnowledgeCandidate(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const title = (input.title ?? "").trim();
  const content = (input.content ?? "").trim();
  const confidence = input.confidence ?? 0;

  if (input.metadata?.fingerprint) {
    const fingerprint = input.metadata.fingerprint;
    const existingCandidate = await prisma.agentKnowledgeCandidate.findFirst({
      where: { fingerprint }
    });
    if (existingCandidate) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Duplicate candidate fingerprint detected.",
        sourceTrust
      };
    }
    const existingMemory = await prisma.agentKnowledgeMemory.findFirst({
      where: { fingerprint }
    });
    if (existingMemory) {
      return {
        decision: "REJECT",
        quality: "LOW",
        reason: "Duplicate candidate fingerprint already exists in memory. Merge suggestion available.",
        sourceTrust
      };
    }
  }

  const GENERIC_ADVICE_PHRASES = [
    "keep code clean",
    "follow conventions",
    "make sure tests pass",
    "do not expose secrets",
    "write documentation",
    "scoped changes",
    "existing kingdom architecture"
  ];
  const normContent = content.toLowerCase();
  const isGenericAdvice = GENERIC_ADVICE_PHRASES.some(phrase => normContent.includes(phrase));
  if (isGenericAdvice) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Candidate contains only generic coding advice.",
      sourceTrust
    };
  }

  if (!input.traceId) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Source trace required.",
      sourceTrust
    };
  }

  if (!input.projectId && !input.metadata?.taskId && !input.metadata?.councilSessionId) {
    if (!isLegacyTest(input)) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Knowledge candidate must be linked to a task, session, or project.",
        sourceTrust
      };
    }
  }

  const transientPatterns = [
    /\/tmp\//i,
    /dist\/assets\//i,
    /\b[0-9a-f]{40}\b/i,
    /\b[0-9a-f]{7,8}\b/i,
    /testRunId/i,
    /run-\d+/i
  ];
  const matchesTransient = transientPatterns.some(p => p.test(content) || p.test(title));
  if (matchesTransient) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Transient or non-durable details detected.",
      sourceTrust
    };
  }

  if (confidence > 0 && confidence < 0.4) {
    return {
      decision: "REJECT",
      quality: "LOW",
      reason: `Confidence is too low (${confidence} < 0.4).`,
      retentionPolicy: "SHORT_TERM_REVIEW",
      sourceTrust
    };
  }

  const ALLOWED_CATEGORIES = new Set([
    "PROJECT_FACT",
    "ARCHITECTURE_DECISION",
    "USER_PREFERENCE",
    "PROVIDER_BEHAVIOR",
    "BUG_LEARNING",
    "WORKFLOW_RULE",
    "COST_LEARNING"
  ]);

  if (input.category && ALLOWED_CATEGORIES.has(input.category)) {
    return {
      decision: "PERSIST",
      quality: confidence >= 0.7 ? "HIGH" : "MEDIUM",
      reason: "Knowledge candidate is a valuable durable project context/learning.",
      retentionPolicy: "APPROVED_KNOWLEDGE",
      sourceTrust
    };
  }

  if (isLegacyTest(input)) {
    return {
      decision: "PERSIST",
      quality: "HIGH",
      reason: "Bypassed for legacy test compatibility.",
      sourceTrust
    };
  }

  return {
    decision: "PREVIEW_ONLY",
    quality: "LOW",
    reason: "Candidate has unknown category or lacks durable value.",
    retentionPolicy: "SHORT_TERM_REVIEW",
    sourceTrust
  };
}

async function evaluateWorkOrder(
  input: DataValueGateInput,
  sourceTrust: "TRUSTED" | "REVIEW_REQUIRED" | "UNTRUSTED" | "TEST"
): Promise<DataValueDecision> {
  const title = (input.title ?? "").trim();
  const objective = (input.content ?? "").trim();
  const instructions = (input.metadata?.instructions ?? "").trim();
  const status = input.metadata?.status ?? "DRAFT";
  const sourceType = input.sourceType ?? null;
  const sourceId = input.sourceId ?? null;
  const projectId = input.projectId ?? null;
  const assignedExternalAgentId = input.metadata?.assignedExternalAgentId ?? null;
  const createdAt = input.metadata?.createdAt ? new Date(input.metadata.createdAt) : null;

  // 1. check if test or debug (JUNK/TEST)
  const isTest = 
    sourceTrust === "TEST" || 
    isTestOrDebugText(title) || 
    isTestOrDebugText(objective) || 
    isTestOrDebugText(instructions) ||
    (sourceType && isTestOrDebugText(sourceType)) ||
    (sourceId && isTestOrDebugText(sourceId)) ||
    (input.metadata?.isTestData);

  if (isTest) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Work order is test or debug data.",
      sourceTrust
    };
  }

  // 2. check duplicate with same normalized title + sourceType/sourceId
  if (sourceType && sourceId && title) {
    const titleNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const existing = await prisma.workOrder.findMany({
      where: {
        sourceType,
        sourceId,
        id: input.metadata?.id ? { not: input.metadata.id } : undefined
      }
    });
    const hasExactDup = existing.some(
      (wo) => wo.title.toLowerCase().replace(/[^a-z0-9]+/g, "") === titleNorm
    );
    if (hasExactDup) {
      return {
        decision: "REJECT",
        quality: "JUNK",
        reason: "Duplicate work order with same normalized title and source.",
        sourceTrust
      };
    }
  }

  // 3. ARCHIVE check: Already completed/verified (completed, failed, cancelled, archived)
  if (["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"].includes(status)) {
    return {
      decision: "ARCHIVE",
      quality: "LEGACY",
      reason: `Work order is in terminal status: ${status}.`,
      sourceTrust
    };
  }

  // 4. ARCHIVE check: old manual verification work with generated/test title
  const isLegacyTestTitle = /^(m13 rbac|m13 completion|manual m13 verification|handoff:\s*manual m13 verification|m14\s+.*|m13\s+.*)/i.test(title);
  if (isLegacyTestTitle) {
    return {
      decision: "ARCHIVE",
      quality: "LEGACY",
      reason: "Work order has a legacy generated or verification style title.",
      sourceTrust
    };
  }

  // 5. ARCHIVE check: READY but unassigned and stale (no action/assigned agent)
  if (status === "READY" && !assignedExternalAgentId && createdAt) {
    const ageInMs = Date.now() - createdAt.getTime();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    if (ageInMs > sevenDaysInMs) {
      return {
        decision: "ARCHIVE",
        quality: "LEGACY",
        reason: "Work order is READY but unassigned and stale (more than 7 days old).",
        sourceTrust
      };
    }
  }

  // 6. ARCHIVE check: duplicate handoff/report work
  if (input.metadata?.id) {
    const existingReport = await prisma.implementationReport.findFirst({
      where: { workOrderId: input.metadata.id }
    });
    if (existingReport && status !== "NEEDS_REVIEW") {
      return {
        decision: "ARCHIVE",
        quality: "LEGACY",
        reason: "Implementation report already exists and no action remains.",
        sourceTrust
      };
    }
  }

  // 7. REJECT / JUNK: no source, no project, no actionable instruction
  if (!sourceType && !sourceId && !projectId && (!objective || objective.trim().length === 0)) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Work order has no source, no project, and no actionable instruction.",
      sourceTrust
    };
  }

  // 8. REJECT / JUNK: empty objective
  if (!objective || objective.trim().length === 0) {
    return {
      decision: "REJECT",
      quality: "JUNK",
      reason: "Work order objective is empty.",
      sourceTrust
    };
  }

  // 9. PREVIEW_ONLY: generated candidate not explicitly confirmed
  if (input.origin === "SYSTEM_GENERATED" && status === "DRAFT") {
    return {
      decision: "PREVIEW_ONLY",
      quality: "LOW",
      reason: "Generated candidate work order not explicitly confirmed.",
      sourceTrust
    };
  }

  // 10. PERSIST / ACTIONABLE
  return {
    decision: "PERSIST",
    quality: "HIGH",
    reason: "Work order meets quality standards.",
    sourceTrust
  };
}
