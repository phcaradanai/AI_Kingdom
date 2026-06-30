import type { Agent, AgentRunStep, AutomationJob, ImplementationReport, PatchArtifact, Prisma, WorkOrder } from "@prisma/client";
import { generateWithFallback, type GenerateWithFallbackResult } from "../ai/generateWithFallback.js";
import { createAIProviderFromConfig } from "../ai/providerFactory.js";
import { prisma } from "../db/prisma.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { buildTraceContext, completeAIUsageTrace, createAIUsageTrace, failAIUsageTrace } from "./aiUsageTraceService.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";
import { proposeKnowledgeCandidate } from "./agentKnowledgeService.js";
import { assessExecutionComplexity, escalationFor } from "./complexityAssessor.js";
import { maybeGrowAgentMaxTokens } from "./maxTokensAutoGrowService.js";
import { sanitizeLogOutput } from "./secretRedactorService.js";

export const AGENT_REVIEW_VERDICTS = ["PASS", "NEEDS_FIX", "PATCH_FAILED", "NO_CHANGES", "RISK_REVIEW", "VALIDATION_FAILED", "UNKNOWN"] as const;
export type AgentReviewVerdict = typeof AGENT_REVIEW_VERDICTS[number];

export const AGENT_REVIEW_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type AgentReviewConfidence = typeof AGENT_REVIEW_CONFIDENCE[number];

export const KING_RECOMMENDATIONS = ["APPROVE", "REJECT", "REQUEST_REVISION", "RETRY_WITH_FIXED_PATCH", "REVIEW_MANUALLY"] as const;
export type KingRecommendation = typeof KING_RECOMMENDATIONS[number];

// PASS verdict must pair with APPROVE; pairing with a revision/rejection recommendation
// is internally inconsistent and can arise from legacy seeded data or partial DB updates.
// Normalize at the write path and at any display/serialization boundary.
export function normalizeKingRecommendation(verdict: AgentReviewVerdict, recommendation: KingRecommendation): KingRecommendation {
  if (verdict === "PASS" && (recommendation === "REQUEST_REVISION" || recommendation === "RETRY_WITH_FIXED_PATCH" || recommendation === "REJECT")) {
    return "APPROVE";
  }
  return recommendation;
}

type ReviewAutomationJob = AutomationJob & {
  workOrder?: Pick<WorkOrder, "id" | "title" | "acceptanceCriteria"> | null;
  steps?: AgentRunStep[];
};

// M24 Phase C: the AI reviewer assesses whether each decree-specific acceptance
// criterion (from M24 Phase A) is actually met by the result. This is the reviewer's
// semantic-verification authority — it can only make the verdict MORE conservative
// (downgrade a mechanically-passing result), never upgrade a failure to a pass.
export type AcceptanceCriterionAssessment = {
  criterion: string;
  met: boolean;
  note?: string;
};

type PatchValidationResultLike = {
  command?: unknown;
  exitCode?: unknown;
  durationMs?: unknown;
  cwd?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  output?: unknown;
  success?: unknown;
  timedOut?: unknown;
  outputTruncated?: unknown;
  message?: unknown;
  failureSummary?: unknown;
};

type FailedCommandSummary = {
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

export type ReviewDraft = {
  verdict: AgentReviewVerdict;
  confidence: AgentReviewConfidence;
  kingRecommendation: KingRecommendation;
  summary: string;
  whatPassed: string[];
  whatFailed: string[];
  failedCommands: FailedCommandSummary[];
  riskNotes: string[];
  nextActions: string[];
  externalAgentPrompt: string | null;
  // M24 Phase C: per-criterion semantic assessment from the AI reviewer (in-memory only;
  // not persisted as a column — unmet criteria are folded into whatFailed/nextActions and
  // can downgrade the verdict). Absent on the deterministic-only path.
  acceptanceCriteriaAssessment?: AcceptanceCriterionAssessment[];
  acceptanceCriteriaDowngraded?: boolean;
  rawModelOutput?: string | null;
};

export type ReviewInput = {
  automationJob: ReviewAutomationJob;
  report: ImplementationReport | null;
  patchArtifact: PatchArtifact | null;
};

type GenerateReviewOptions = {
  useAi?: boolean;
  aiGenerate?: (payload: { prompt: string; deterministicReview: ReviewDraft }) => Promise<string>;
};

const REVIEW_INCLUDE = {
  automationJob: { select: { id: true, status: true, importedPatchStatus: true } },
  workOrder: { select: { id: true, title: true } },
  project: { select: { id: true, name: true } },
  reviewerAgent: { select: { id: true, slug: true, name: true, title: true } },
  sourceReport: { select: { id: true, testResult: true } },
  patchArtifact: { select: { id: true, riskLevel: true, validationStatus: true } }
} as const;

export async function getAgentReviewForJob(jobId: string) {
  return prisma.agentReviewSummary.findUnique({
    where: { automationJobId: jobId },
    include: REVIEW_INCLUDE
  });
}

export async function regenerateAgentReviewForJob(jobId: string, options: GenerateReviewOptions = {}) {
  const job = await prisma.automationJob.findUnique({
    where: { id: jobId },
    include: {
      workOrder: { select: { id: true, title: true } },
      steps: { orderBy: { sequence: "asc" } }
    }
  });
  if (!job) {
    const err = new Error("AutomationJob not found");
    err.name = "NotFoundError";
    throw err;
  }
  if (job.status !== "NEEDS_REVIEW") {
    const err = new Error(`Cannot regenerate agent review for job in status ${job.status}`);
    err.name = "ConflictError";
    throw err;
  }

  return createOrUpdateAgentReviewForJob(jobId, { ...options, useAi: options.useAi ?? true });
}

export async function createOrUpdateAgentReviewForJob(jobId: string, options: GenerateReviewOptions = {}) {
  const job = await prisma.automationJob.findUnique({
    where: { id: jobId },
    include: {
      workOrder: { select: { id: true, title: true, acceptanceCriteria: true, assignedAgent: { select: { id: true, isActive: true } } } },
      steps: { orderBy: { sequence: "asc" } }
    }
  });
  if (!job) {
    const err = new Error("AutomationJob not found");
    err.name = "NotFoundError";
    throw err;
  }

  const [report, patchArtifact] = await Promise.all([
    prisma.implementationReport.findFirst({ where: { automationJobId: jobId }, orderBy: { createdAt: "desc" } }),
    prisma.patchArtifact.findFirst({ where: { automationJobId: jobId }, orderBy: { createdAt: "desc" } })
  ]);

  // The work order's assigned steward (e.g. royal-architect for code) is the
  // responsible agent and owns the verdict; fall back to a default reviewer only
  // when no steward is assigned.
  const steward = job.workOrder?.assignedAgent;
  const reviewerAgent = steward?.isActive ? steward : await findReviewerAgent();

  const draft = await generateAgentReviewDraft({ automationJob: job, report, patchArtifact }, options);
  const data = {
    workOrderId: job.workOrderId,
    projectId: job.projectId,
    reviewerAgentId: reviewerAgent?.id ?? null,
    verdict: draft.verdict,
    confidence: draft.confidence,
    kingRecommendation: normalizeKingRecommendation(draft.verdict, draft.kingRecommendation),
    summary: draft.summary,
    whatPassed: draft.whatPassed as Prisma.InputJsonValue,
    whatFailed: draft.whatFailed as Prisma.InputJsonValue,
    failedCommands: draft.failedCommands as Prisma.InputJsonValue,
    riskNotes: draft.riskNotes as Prisma.InputJsonValue,
    nextActions: draft.nextActions as Prisma.InputJsonValue,
    externalAgentPrompt: draft.externalAgentPrompt,
    sourceReportId: report?.id ?? null,
    patchArtifactId: patchArtifact?.id ?? null,
    rawModelOutput: draft.rawModelOutput ?? null
  };

  const review = await prisma.agentReviewSummary.upsert({
    where: { automationJobId: jobId },
    create: { automationJobId: jobId, ...data },
    update: data,
    include: REVIEW_INCLUDE
  });

  // Capture-new-lessons loop (opt-in): a failed review with a diagnosis becomes a PENDING
  // knowledge candidate so, once the King approves it, it feeds back into council + planner
  // (AGENT_KNOWLEDGE_IN_CONTEXT). Best-effort; dedup is handled by proposeKnowledgeCandidate.
  await maybeCaptureReviewLesson({
    verdict: draft.verdict,
    whatFailed: draft.whatFailed,
    whatPassed: draft.whatPassed,
    summary: draft.summary,
    workOrderId: job.workOrderId,
    workOrderTitle: job.workOrder?.title ?? "work order",
    projectId: job.projectId,
    reviewerAgentId: reviewerAgent?.id ?? null,
    jobId
  }).catch(() => undefined);

  return review;
}

/** Verdicts that carry a learnable failure (a diagnosis exists). */
const REVIEW_LESSON_VERDICTS = new Set<AgentReviewVerdict>(["NEEDS_FIX", "PATCH_FAILED", "VALIDATION_FAILED"]);

async function maybeCaptureReviewLesson(input: {
  verdict: AgentReviewVerdict;
  whatFailed: string[];
  whatPassed: string[];
  summary: string;
  workOrderId: string;
  workOrderTitle: string;
  projectId: string | null;
  reviewerAgentId: string | null;
  jobId: string;
}): Promise<void> {
  if (!input.reviewerAgentId) return;

  if (REVIEW_LESSON_VERDICTS.has(input.verdict) && await getBooleanSetting("CAPTURE_LESSONS_FROM_REVIEWS", false)) {
    const whatFailed = input.whatFailed.filter((item) => item && item.trim());
    if (whatFailed.length > 0) {
      const content = [
        `Failure on work order: ${input.workOrderTitle}`,
        `What failed: ${whatFailed.join("; ")}`,
        "Lesson: address the above before reporting this kind of work done; do not repeat it on similar work."
      ].join("\n\n");
      await proposeKnowledgeCandidate({
        agentId: input.reviewerAgentId,
        projectId: input.projectId,
        traceId: `review:${input.jobId}`,
        sourceType: "AGENT_REVIEW",
        sourceId: input.jobId,
        title: `Review lesson: ${input.workOrderTitle}`,
        content,
        summary: whatFailed.join("; ").slice(0, 280),
        category: "BUG_LEARNING",
        confidence: 0.7,
        proposedByAgentId: input.reviewerAgentId,
        tags: ["review-lesson", input.verdict.toLowerCase()],
        metadata: { verdict: input.verdict, requiresReview: true }
      });
    }
  }

  if (input.verdict === "PASS" && await getBooleanSetting("CAPTURE_SUCCESSES_FROM_REVIEWS", false)) {
    const whatPassed = input.whatPassed.filter((item) => item && item.trim());
    const summary = input.summary.trim();
    // Only capture when there is real execution evidence (not trivial pass with no content)
    if (whatPassed.length === 0 || summary.length < 30) return;
    const content = [
      `Successful implementation: ${input.workOrderTitle}`,
      whatPassed.length ? `What worked: ${whatPassed.join("; ")}` : "",
      summary ? `Result summary: ${summary}` : "",
      "Lesson: this approach succeeded — apply it to similar work."
    ].filter(Boolean).join("\n\n");
    await proposeKnowledgeCandidate({
      agentId: input.reviewerAgentId,
      projectId: input.projectId,
      traceId: `review-success:${input.jobId}`,
      sourceType: "AGENT_REVIEW",
      sourceId: input.jobId,
      title: `Success lesson: ${input.workOrderTitle}`,
      content,
      summary: summary.slice(0, 280),
      category: "WORKFLOW_RULE",
      confidence: 0.75,
      proposedByAgentId: input.reviewerAgentId,
      tags: ["review-lesson", "pass", "implementation-success"],
      metadata: { verdict: input.verdict, requiresReview: true }
    });
  }
}

export async function generateAgentReviewDraft(input: ReviewInput, options: GenerateReviewOptions = {}): Promise<ReviewDraft> {
  const deterministic = buildDeterministicReview(input);
  if (!options.useAi) return deterministic;

  try {
    const prompt = buildAiReviewPrompt(input, deterministic);
    const raw = options.aiGenerate
      ? await options.aiGenerate({ prompt, deterministicReview: deterministic })
      : await generateAiReviewText(input, prompt, deterministic.verdict);
    const parsed = parseAiReviewJson(raw);
    if (!parsed) return { ...deterministic, rawModelOutput: raw.slice(0, 10_000) };
    return mergeAiReview(deterministic, parsed, raw);
  } catch (err) {
    return {
      ...deterministic,
      rawModelOutput: `AI review unavailable; deterministic fallback used: ${err instanceof Error ? err.message : String(err)}`.slice(0, 10_000)
    };
  }
}

export function buildDeterministicReview(input: ReviewInput): ReviewDraft {
  const job = input.automationJob;
  const report = input.report;
  const patch = input.patchArtifact;
  const failedCommands = collectFailedCommands(input);
  const whatPassed = collectPassedItems(input);
  const whatFailed = collectFailedItems(input, failedCommands);
  const riskNotes = collectRiskNotes(input);
  const workOrderTitle = job.workOrder?.title ?? job.workOrderId;
  const patchStatus = job.importedPatchStatus;
  const hasUsefulReport = Boolean(report && (
    report.summary.trim()
    || report.filesChanged.length > 0
    || report.errors.length > 0
    || report.remainingWork.length > 0
    || report.testResult !== "NOT_RUN"
  ));

  let verdict: AgentReviewVerdict = "UNKNOWN";
  let confidence: AgentReviewConfidence = "LOW";
  let kingRecommendation: KingRecommendation = "REVIEW_MANUALLY";

  if (patchStatus === "CHECK_FAILED") {
    verdict = "PATCH_FAILED";
    confidence = "HIGH";
    kingRecommendation = "RETRY_WITH_FIXED_PATCH";
  } else if (patchStatus === "NO_CHANGES") {
    verdict = "NO_CHANGES";
    confidence = "HIGH";
    kingRecommendation = "REQUEST_REVISION";
  } else if (patchStatus === "VALIDATION_FAILED") {
    verdict = "VALIDATION_FAILED";
    confidence = "HIGH";
    kingRecommendation = "REQUEST_REVISION";
  } else if (report && report.errors.length > 0) {
    verdict = "NEEDS_FIX";
    confidence = "HIGH";
    kingRecommendation = "REQUEST_REVISION";
  } else if (patchStatus === "VALIDATED" && patch && (patch.riskLevel === "HIGH" || patch.riskLevel === "CRITICAL")) {
    verdict = "RISK_REVIEW";
    confidence = "HIGH";
    kingRecommendation = "REVIEW_MANUALLY";
  } else if (patchStatus === "VALIDATED" && (!patch || patch.riskLevel === "LOW" || patch.riskLevel === "MEDIUM")) {
    verdict = "PASS";
    confidence = patch ? "HIGH" : "MEDIUM";
    kingRecommendation = "APPROVE";
  } else if (!patch && !hasUsefulReport) {
    verdict = "UNKNOWN";
    confidence = "LOW";
    kingRecommendation = "REVIEW_MANUALLY";
  } else if (report?.testResult === "PASSED" && failedCommands.length === 0) {
    verdict = patch && (patch.riskLevel === "HIGH" || patch.riskLevel === "CRITICAL") ? "RISK_REVIEW" : "PASS";
    confidence = "MEDIUM";
    kingRecommendation = verdict === "PASS" ? "APPROVE" : "REVIEW_MANUALLY";
  } else if (report?.testResult === "FAILED" || report?.testResult === "PARTIAL" || failedCommands.length > 0) {
    verdict = "NEEDS_FIX";
    confidence = "MEDIUM";
    kingRecommendation = "REQUEST_REVISION";
  }

  const nextActions = buildNextActions({ verdict, kingRecommendation, input });
  const summary = buildSummary({ verdict, kingRecommendation, workOrderTitle, patchStatus, report, patch, failedCommands });
  const draft: ReviewDraft = {
    verdict,
    confidence,
    kingRecommendation,
    summary,
    whatPassed,
    whatFailed,
    failedCommands,
    riskNotes,
    nextActions,
    externalAgentPrompt: null
  };
  draft.externalAgentPrompt = shouldGenerateExternalPrompt(draft)
    ? buildExternalAgentPrompt(input, draft)
    : null;
  return draft;
}

export function parseAiReviewJson(raw: string): Partial<ReviewDraft> | null {
  const cleaned = raw
    .replace(/^```(?:json)?/m, "")
    .replace(/```$/m, "")
    .trim();
  const candidates = [cleaned];
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match && match[0] !== cleaned) candidates.push(match[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") continue;
      return {
        summary: stringOrUndefined(parsed.summary),
        whatPassed: stringArrayOrUndefined(parsed.whatPassed),
        whatFailed: stringArrayOrUndefined(parsed.whatFailed),
        riskNotes: stringArrayOrUndefined(parsed.riskNotes),
        nextActions: stringArrayOrUndefined(parsed.nextActions),
        externalAgentPrompt: stringOrNullOrUndefined(parsed.externalAgentPrompt),
        acceptanceCriteriaAssessment: assessmentArrayOrUndefined(parsed.acceptanceCriteriaAssessment)
      };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function mergeAiReview(deterministic: ReviewDraft, ai: Partial<ReviewDraft>, raw: string): ReviewDraft {
  const merged: ReviewDraft = {
    ...deterministic,
    summary: sanitizeReviewText(ai.summary, 2000) ?? deterministic.summary,
    whatPassed: sanitizeReviewArray(ai.whatPassed, deterministic.whatPassed),
    whatFailed: sanitizeReviewArray(ai.whatFailed, deterministic.whatFailed),
    riskNotes: sanitizeReviewArray(ai.riskNotes, deterministic.riskNotes),
    nextActions: sanitizeReviewArray(ai.nextActions, deterministic.nextActions),
    acceptanceCriteriaAssessment: ai.acceptanceCriteriaAssessment,
    rawModelOutput: raw.slice(0, 10_000)
  };

  // M24 Phase C: semantic downgrade. When the result mechanically PASSED but the reviewer
  // found acceptance criteria the work does not actually satisfy, the result does not meet
  // the King's decree — flip it to NEEDS_FIX / REQUEST_REVISION. This only ever makes the
  // verdict MORE conservative: it fires solely from a deterministic PASS and never upgrades.
  const unmet = (ai.acceptanceCriteriaAssessment ?? []).filter((item) => item.met === false);
  if (deterministic.verdict === "PASS" && unmet.length > 0) {
    merged.verdict = "NEEDS_FIX";
    merged.kingRecommendation = "REQUEST_REVISION";
    merged.acceptanceCriteriaDowngraded = true;
    const unmetNotes = unmet.map((item) =>
      `Acceptance criterion not met: ${item.criterion}${item.note ? ` (${item.note})` : ""}`
    );
    merged.whatFailed = sanitizeReviewArray([...unmetNotes, ...merged.whatFailed], merged.whatFailed);
    merged.nextActions = sanitizeReviewArray(
      ["Request a revision that satisfies the unmet acceptance criteria above.", ...merged.nextActions],
      merged.nextActions
    );
  }

  merged.externalAgentPrompt = shouldGenerateExternalPrompt(merged)
    // Prefer the model's prompt; else the deterministic one (built with full input context);
    // else synthesize from the merged draft — the last covers the PASS→NEEDS_FIX downgrade
    // case where the deterministic prompt was null.
    ? sanitizeReviewText(ai.externalAgentPrompt ?? undefined, 8000)
      ?? deterministic.externalAgentPrompt
      ?? buildExternalAgentPromptFromDraft(merged, null)
    : null;
  return merged;
}

async function generateAiReviewText(input: ReviewInput, prompt: string, deterministicVerdict?: string): Promise<string> {
  const agent = await findReviewerAgent();
  if (!agent) throw new Error("No active Grand Vizier or Royal Architect reviewer agent is available");

  const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 900);
  const route = await selectAIProviderRoute({
    agent: agent as Parameters<typeof selectAIProviderRoute>[0]["agent"],
    taskMode: "PLAN",
    requiredCapabilities: { chat: true, jsonMode: true }
  });
  // Adaptive reasoning: bug analysis of a failed or high-risk patch needs deeper
  // thought. Use the structured signals (patch risk + deterministic verdict), not
  // text heuristics. No-op when the kill-switch is off or the provider can't reason.
  const adaptiveReasoning = await getBooleanSetting("ADAPTIVE_REASONING_ENABLED", true);
  const complexity = assessExecutionComplexity({
    riskLevel: input.patchArtifact?.riskLevel,
    verdict: deterministicVerdict
  });
  const escalation = adaptiveReasoning ? escalationFor(complexity.level) : undefined;
  const effectiveParams = resolveEffectiveParameters(
    agent as Parameters<typeof resolveEffectiveParameters>[0],
    route.provider.type,
    defaultMaxTokens,
    escalation
  );
  const providerCalls = [{ provider: route.provider, model: route.model }, ...route.fallbackAttempts]
    .map(({ provider, model }) => {
      try {
        return { provider: createAIProviderFromConfig(provider), model };
      } catch {
        return null;
      }
    })
    .filter((call): call is NonNullable<typeof call> => Boolean(call));
  if (providerCalls.length === 0) throw new Error("No callable AI provider is available for agent review");

  const trace = await createAIUsageTrace({
    actorRole: "SYSTEM",
    triggerType: "SYSTEM_ACTION",
    triggerRoute: "POST /api/automation-jobs/:id/agent-review/regenerate",
    triggerLabel: input.automationJob.workOrder?.title ?? input.automationJob.id,
    projectId: input.automationJob.projectId,
    agentId: agent.id,
    sourceType: "AUTOMATION_JOB",
    sourceId: input.automationJob.id,
    operation: "runner_result_agent_review",
    purpose: "King-facing review of a completed runner result",
    providerId: route.provider.id,
    providerType: route.provider.type,
    providerName: route.provider.name,
    model: route.model,
    prompt,
    metadata: {
      agentSlug: agent.slug,
      complexityLevel: complexity.level,
      complexitySignals: complexity.signals,
      reasoningEscalated: !!escalation?.reasoning,
      reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
      reasoningEffort: effectiveParams.reasoning?.effort ?? null
    },
    attributionStatus: "TRUSTED"
  });
  const traceContext = buildTraceContext({
    traceId: trace.traceId,
    sourceType: "AUTOMATION_JOB",
    sourceId: input.automationJob.id,
    operation: "runner_result_agent_review",
    purpose: "King-facing review of a completed runner result",
    triggerType: "SYSTEM_ACTION",
    attributionStatus: "TRUSTED"
  });

  let generated: GenerateWithFallbackResult;
  try {
    generated = await generateWithFallback(
      providerCalls,
      {
        command: prompt,
        mode: "PLAN",
        agentName: agent.name,
        agentRole: agent.title,
        agentSkills: agent.skills,
        systemPrompt: agent.systemPrompt ?? agent.prompt ?? "",
        responseStyle: "Return only constrained JSON. Do not propose running commands or applying patches.",
        temperature: 0.1,
        maxTokens: Math.min(agent.maxTokens ?? defaultMaxTokens, 1200),
        modelParameters: { ...effectiveParams, response_format: "json_object" }
      },
      traceContext
    );
  } catch (err) {
    await failAIUsageTrace(trace.traceId, err).catch(() => undefined);
    throw err;
  }

  const cost = await calculateCostUSDFromRegistry(generated.providerId ?? generated.providerName, generated.modelUsed, generated.usage);
  await prisma.usageRecord.create({
    data: {
      traceId: trace.traceId,
      attributionStatus: "TRUSTED",
      agentId: agent.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      promptTokens: generated.usage.promptTokens,
      completionTokens: generated.usage.completionTokens,
      totalTokens: generated.usage.totalTokens,
      estimatedCostUSD: cost.costUSD,
      estimatedCostLocal: cost.costUSD,
      currency: "USD",
      costSource: cost.costSource,
      costConfidence: cost.costConfidence,
      pricingSource: cost.source,
      purpose: "runner_result_agent_review",
      sourceType: "AUTOMATION_JOB",
      sourceId: input.automationJob.id
    }
  });
  await completeAIUsageTrace(trace.traceId, generated.response, {
    model: generated.modelUsed,
    providerId: generated.providerId ?? generated.providerName
  });

  // Self-growing budget: grow the reviewer's max_tokens if a real provider truncated.
  await maybeGrowAgentMaxTokens({
    agentId: agent.id,
    agentSlug: agent.slug,
    contentBudgetUsed: effectiveParams.max_tokens,
    finishReason: generated.finishReason,
    providerType: generated.finalProviderType,
    model: generated.modelUsed
  }).catch(() => undefined);

  return generated.response;
}

async function findReviewerAgent(): Promise<Agent | null> {
  return prisma.agent.findFirst({
    where: {
      isActive: true,
      slug: { in: ["grand-vizier", "royal-architect"] }
    },
    orderBy: [{ slug: "asc" }]
  });
}

function buildAiReviewPrompt(input: ReviewInput, deterministic: ReviewDraft): string {
  const report = input.report;
  const patch = input.patchArtifact;
  const acceptanceCriteria = input.automationJob.workOrder?.acceptanceCriteria ?? [];
  const payload = {
    workOrderTitle: input.automationJob.workOrder?.title ?? input.automationJob.workOrderId,
    acceptanceCriteria,
    importedPatchStatus: input.automationJob.importedPatchStatus,
    testResult: report?.testResult ?? null,
    failedCommands: deterministic.failedCommands.map((cmd) => ({
      command: cmd.command,
      exitCode: cmd.exitCode,
      cwd: cmd.cwd,
      failureSummary: cmd.failureSummary ?? cmd.message ?? null
    })),
    failureSummary: deterministic.whatFailed,
    filesChanged: patch?.filesChanged ?? report?.filesChanged ?? [],
    riskLevel: patch?.riskLevel ?? null,
    blockedPaths: patch?.blockedPaths ?? [],
    diffPreview: capText(patch?.diffPreview ?? "", 4000),
    reportSummary: report?.summary ?? null,
    remainingWork: report?.remainingWork ?? [],
    nextRecommendedAction: report?.nextRecommendedAction ?? null,
    deterministicVerdict: deterministic.verdict,
    deterministicKingRecommendation: deterministic.kingRecommendation
  };

  return `Review this completed runner result for the King.

Rules:
- The runner already executed the job.
- Do not run shell commands.
- Do not apply patches.
- Do not approve patches automatically.
- Do not push branches, create PRs, merge, or deploy.
- Return only JSON with keys: summary, whatPassed, whatFailed, riskNotes, nextActions, externalAgentPrompt, acceptanceCriteriaAssessment.
- Do not include secrets. Do not include raw local root paths.
- The deterministic verdict and King recommendation are the controlling decision and you cannot make a result look BETTER than it is. You can only flag it as worse.
- Semantic check: for EACH acceptance criterion, judge from the diff, files changed, and report whether it is actually satisfied. Return acceptanceCriteriaAssessment as an array of { "criterion": <verbatim criterion>, "met": true|false, "note": <short evidence> }. Mark met:false only when the result clearly does not satisfy it; if you genuinely cannot tell from the evidence, mark met:true (do not penalize on uncertainty). When a criterion is unmet, also state it plainly in whatFailed.

Structured runner result:
${JSON.stringify(payload, null, 2)}`;
}

function collectPassedItems(input: ReviewInput): string[] {
  const passed: string[] = [];
  const report = input.report;
  const patch = input.patchArtifact;
  if (input.automationJob.importedPatchStatus === "VALIDATED") passed.push("Imported patch applied in the sandbox and validation commands passed.");
  if (report?.testResult === "PASSED") passed.push("Implementation report marked tests as PASSED.");
  if (patch && patch.filesChanged.length > 0) passed.push(`Patch artifact includes ${patch.filesChanged.length} changed file${patch.filesChanged.length === 1 ? "" : "s"}.`);
  const successfulValidations = collectValidationResults(patch).filter((result) => result.success === true);
  for (const result of successfulValidations.slice(0, 8)) {
    const command = safeString(result.command);
    if (command) passed.push(`Validation command passed: ${command}`);
  }
  return uniq(passed);
}

function collectFailedItems(input: ReviewInput, failedCommands: FailedCommandSummary[]): string[] {
  const failed: string[] = [];
  const report = input.report;
  const status = input.automationJob.importedPatchStatus;
  if (status === "CHECK_FAILED") failed.push("Imported patch failed git apply --check or git apply.");
  if (status === "NO_CHANGES") failed.push("Runner produced no real workspace diff.");
  if (status === "VALIDATION_FAILED") failed.push("Patch applied, but one or more validation commands failed.");
  if (report?.errors.length) failed.push(...report.errors);
  if (failedCommands.length) failed.push(`${failedCommands.length} command${failedCommands.length === 1 ? "" : "s"} failed during validation.`);
  if (report?.testResult === "FAILED") failed.push("Implementation report marked tests as FAILED.");
  if (report?.testResult === "PARTIAL") failed.push("Implementation report marked tests as PARTIAL.");
  return uniq(failed.map((item) => capText(item, 1000)));
}

function collectRiskNotes(input: ReviewInput): string[] {
  const notes: string[] = [];
  const patch = input.patchArtifact;
  if (patch?.riskLevel === "HIGH" || patch?.riskLevel === "CRITICAL") {
    notes.push(`Patch risk is ${patch.riskLevel}; King should review manually before approval.`);
  }
  if (patch?.blockedPaths.length) {
    notes.push(`Blocked paths were reported: ${patch.blockedPaths.join(", ")}`);
  }
  if (input.automationJob.contextValidationStatus && !["FRESH", "NOT_REQUIRED"].includes(input.automationJob.contextValidationStatus)) {
    notes.push(`Job context validation status was ${input.automationJob.contextValidationStatus}.`);
  }
  if (patch?.baseContextStatus && patch.baseContextStatus !== "FRESH") {
    notes.push(`Patch base context status was ${patch.baseContextStatus}.`);
  }
  if (!patch && input.automationJob.mode === "SANDBOX_PATCH") {
    notes.push("No PatchArtifact was submitted for this sandbox patch job.");
  }
  return uniq(notes);
}

function collectFailedCommands(input: ReviewInput): FailedCommandSummary[] {
  const failedFromPatch = collectValidationResults(input.patchArtifact)
    .filter((result) => result.success === false)
    .map((result) => ({
      command: safeString(result.command) ?? "unknown command",
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      durationMs: typeof result.durationMs === "number" ? result.durationMs : null,
      cwd: safeString(result.cwd) ?? undefined,
      failureSummary: safeString(result.failureSummary) ?? undefined,
      stdout: safeString(result.stdout) ? capText(safeString(result.stdout)!, 2000) : undefined,
      stderr: safeString(result.stderr) ? capText(safeString(result.stderr)!, 2000) : undefined,
      message: safeString(result.message) ?? undefined,
      timedOut: result.timedOut === true
    }));
  const failedFromSteps = (input.automationJob.steps ?? [])
    .filter((step) => step.status === "FAILED")
    .map((step) => {
      const metadata = isPlainObject(step.metadata) ? step.metadata : {};
      return {
        command: step.command ? [step.command, ...step.args].join(" ") : step.title,
        exitCode: step.exitCode,
        durationMs: step.durationMs,
        cwd: safeString(metadata.cwd) ?? undefined,
        failureSummary: safeString(metadata.failureSummary) ?? undefined,
        output: step.output ? capText(step.output, 2000) : undefined,
        message: safeString(metadata.message) ?? undefined,
        timedOut: metadata.timedOut === true
      };
    });
  const seen = new Set<string>();
  return [...failedFromPatch, ...failedFromSteps].filter((command) => {
    const key = `${command.command}:${command.exitCode}:${command.failureSummary ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectValidationResults(patch: PatchArtifact | null): PatchValidationResultLike[] {
  if (!patch?.validationResults || !Array.isArray(patch.validationResults)) return [];
  return (patch.validationResults as unknown[]).filter((item): item is PatchValidationResultLike => isPlainObject(item));
}

function buildNextActions(input: { verdict: AgentReviewVerdict; kingRecommendation: KingRecommendation; input: ReviewInput }): string[] {
  const { verdict, kingRecommendation } = input;
  if (kingRecommendation === "APPROVE") return ["King may approve the pending PatchArtifact after reviewing the diff."];
  if (kingRecommendation === "RETRY_WITH_FIXED_PATCH") return ["Request a corrected unified diff and import it into a new queued SANDBOX_PATCH job."];
  if (verdict === "NO_CHANGES") return ["Request a revision that produces a real workspace diff."];
  if (verdict === "VALIDATION_FAILED" || verdict === "NEEDS_FIX") return ["Request revision from the implementer with the failed command output and validation summaries."];
  if (verdict === "RISK_REVIEW") return ["Review the changed files, risk notes, and diff manually before deciding whether to approve."];
  return ["Review the runner report and patch artifacts manually before taking action."];
}

function buildSummary(input: {
  verdict: AgentReviewVerdict;
  kingRecommendation: KingRecommendation;
  workOrderTitle: string;
  patchStatus?: string | null;
  report: ImplementationReport | null;
  patch: PatchArtifact | null;
  failedCommands: FailedCommandSummary[];
}): string {
  const status = input.patchStatus ? ` Imported patch status: ${input.patchStatus}.` : "";
  const tests = input.report ? ` Test result: ${input.report.testResult}.` : "";
  const risk = input.patch ? ` Patch risk: ${input.patch.riskLevel}.` : "";
  const failed = input.failedCommands.length ? ` Failed commands: ${input.failedCommands.length}.` : "";
  return `${input.verdict}: ${input.workOrderTitle}. Recommendation for King: ${input.kingRecommendation}.${status}${tests}${risk}${failed}`.trim();
}

function shouldGenerateExternalPrompt(draft: ReviewDraft): boolean {
  return draft.kingRecommendation !== "APPROVE";
}

function buildExternalAgentPrompt(input: ReviewInput, draft: ReviewDraft): string {
  return buildExternalAgentPromptFromDraft(draft, input);
}

function buildExternalAgentPromptFromDraft(draft: ReviewDraft, input: ReviewInput | null): string {
  const report = input?.report;
  const patch = input?.patchArtifact;
  const job = input?.automationJob;
  const workOrderTitle = job?.workOrder?.title ?? job?.workOrderId ?? "Runner result";
  const filesChanged = patch?.filesChanged?.length ? patch.filesChanged : report?.filesChanged ?? [];
  const blockedPaths = patch?.blockedPaths ?? [];
  const prompt = [
    "You are an external coding agent helping revise a failed AI Kingdom runner result.",
    "",
    `WorkOrder title: ${workOrderTitle}`,
    `Current result verdict: ${draft.verdict}`,
    `Required next action: ${draft.kingRecommendation}`,
    "",
    "What failed:",
    formatBullets(draft.whatFailed),
    "",
    "Failed commands:",
    draft.failedCommands.length
      ? draft.failedCommands.map((cmd) => `- ${cmd.command} (exit ${cmd.exitCode ?? "unknown"}${cmd.cwd ? `, cwd ${cmd.cwd}` : ""})${cmd.failureSummary ? `: ${cmd.failureSummary}` : ""}`).join("\n")
      : "- None recorded",
    "",
    "Failure summaries:",
    formatBullets(draft.failedCommands.map((cmd) => cmd.failureSummary ?? cmd.message).filter((item): item is string => Boolean(item))),
    "",
    "Files changed:",
    formatBullets(filesChanged),
    "",
    "Risk notes:",
    formatBullets(draft.riskNotes),
    "",
    "Instructions:",
    "- Return a unified diff only.",
    "- Do not include secrets.",
    "- Do not touch blocked paths.",
    "- Do not modify generated, build, dependency, or vendor folders.",
    blockedPaths.length ? `- Blocked paths: ${blockedPaths.join(", ")}` : "- Blocked paths: none reported, but still avoid secrets and protected files."
  ].join("\n");
  return sanitizeLogOutput(prompt).slice(0, 12_000);
}

function formatBullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded";
}

function sanitizeReviewText(value: string | undefined | null, max: number): string | undefined {
  if (!value) return undefined;
  const sanitized = sanitizeLogOutput(value).trim();
  if (!sanitized) return undefined;
  return sanitized.slice(0, max);
}

function sanitizeReviewArray(value: string[] | undefined, fallback: string[]): string[] {
  if (!value || value.length === 0) return fallback;
  return uniq(value.map((item) => sanitizeLogOutput(item).trim()).filter(Boolean).map((item) => capText(item, 1000))).slice(0, 20);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringOrNullOrUndefined(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function assessmentArrayOrUndefined(value: unknown): AcceptanceCriterionAssessment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assessments: AcceptanceCriterionAssessment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const criterion = typeof obj.criterion === "string" ? obj.criterion.trim() : "";
    if (!criterion) continue;
    // Only an explicit boolean false counts as unmet; anything else is treated as met
    // so the reviewer never penalizes a result on ambiguity (safe, conservative downgrade).
    const met = obj.met === false ? false : true;
    const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim().slice(0, 500) : undefined;
    assessments.push({ criterion: criterion.slice(0, 500), met, ...(note ? { note } : {}) });
  }
  return assessments;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? sanitizeLogOutput(value.trim()) : null;
}

function capText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
