import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";

/**
 * Self-growing max_tokens (King's directive 2026-06-22): when a real provider
 * truncates a response because it needed more than the agent's current budget,
 * grow that agent's stored max_tokens one step and persist it, so the next call
 * uses the larger budget. It climbs to a configurable ceiling (the cost guardrail)
 * and never shrinks.
 *
 * Honest mechanism note: a truncated response only tells us the need was
 * >= the budget we sent — never the exact number — so we grow in steps and
 * converge, rather than reading an exact desired value.
 *
 * Three traps this avoids (see the King's prior max_tokens incidents):
 *  - Persist the CONTENT budget (effective.max_tokens), NOT the reserve-inflated
 *    value sent to the provider — buildProviderRequestBody re-adds the reasoning
 *    reserve next call, so storing the inflated number would drift upward.
 *  - Write BOTH knobs in sync: the agent.maxTokens column and the effective
 *    modelParameters.max_tokens (which wins in MANUAL mode).
 *  - Never ratchet on a sandbox/mock "truncation" — only a real provider counts.
 */

// finish_reason values that mean the output hit the max_tokens cap.
const TRUNCATION_REASONS = new Set(["length", "max_tokens"]);
const GROWTH_FACTOR = 1.5;
const MIN_STEP = 1000;

function roundUpToThousand(n: number): number {
  return Math.ceil(n / 1000) * 1000;
}

export type GrowResult =
  | { grown: false; reason: string }
  | { grown: true; from: number; to: number };

export async function maybeGrowAgentMaxTokens(input: {
  agentId: string;
  agentSlug?: string;
  contentBudgetUsed: number | null; // effective.max_tokens that was in force for this call
  finishReason: string | null | undefined;
  providerType: string | null | undefined; // resolved winner type; "sandbox" is ignored
  model?: string | null;
  userId?: string;
}): Promise<GrowResult> {
  if (!TRUNCATION_REASONS.has((input.finishReason ?? "").toLowerCase())) {
    return { grown: false, reason: "not truncated" };
  }
  // A mock/sandbox "truncation" must never ratchet the real ceiling.
  if ((input.providerType ?? "").toLowerCase() === "sandbox") {
    return { grown: false, reason: "sandbox winner" };
  }
  if (!input.contentBudgetUsed || input.contentBudgetUsed <= 0) {
    return { grown: false, reason: "no content budget known" };
  }
  if (!(await getBooleanSetting("AI_MAX_TOKENS_AUTOGROW", true))) {
    return { grown: false, reason: "autogrow disabled" };
  }

  const ceiling = await getNumberSetting("AI_MAX_TOKENS_CEILING", 16000);
  const current = input.contentBudgetUsed;
  if (current >= ceiling) {
    return { grown: false, reason: "already at ceiling" };
  }

  const proposed = roundUpToThousand(Math.max(current + MIN_STEP, Math.ceil(current * GROWTH_FACTOR)));
  const next = Math.min(ceiling, proposed);
  if (next <= current) {
    return { grown: false, reason: "no increase" };
  }

  // Persist BOTH knobs in sync so MANUAL mode (modelParameters.max_tokens wins)
  // and the column agree — avoids the silent-override trap.
  const agent = await prisma.agent.findUnique({ where: { id: input.agentId }, select: { modelParameters: true } });
  const modelParameters = {
    ...((agent?.modelParameters && typeof agent.modelParameters === "object" ? agent.modelParameters : {}) as Record<string, unknown>),
    max_tokens: next
  };
  await prisma.agent.update({
    where: { id: input.agentId },
    data: { maxTokens: next, modelParameters: modelParameters as object }
  });

  await auditLog({
    userId: input.userId,
    action: "ai_max_tokens_autogrow",
    resourceType: "Agent",
    resourceId: input.agentId,
    metadata: { agentSlug: input.agentSlug ?? null, from: current, to: next, ceiling, finishReason: input.finishReason, model: input.model ?? null }
  }).catch(() => undefined);

  return { grown: true, from: current, to: next };
}
