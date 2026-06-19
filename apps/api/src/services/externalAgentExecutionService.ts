import type { Agent } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { buildAIProviderCallsFromRoute } from "../ai/providerCallPlanner.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import {
  buildTraceContext,
  completeAIUsageTrace,
  createAIUsageTrace,
  failAIUsageTrace
} from "./aiUsageTraceService.js";
import { buildUsageAttribution } from "./usageAttributionService.js";
import { getNumberSetting } from "./settingsService.js";
import { prisma } from "../db/prisma.js";
import { buildExternalAgentPrompt, createImplementationReport } from "./externalAgentWorkOrderService.js";
import { parseImplementationReportText } from "./externalAgentReportParser.js";

export { parseImplementationReportText } from "./externalAgentReportParser.js";
export type { ParsedImplementationReport } from "./externalAgentReportParser.js";

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

export type ExecuteWorkOrderResult = {
  report: Awaited<ReturnType<typeof createImplementationReport>>;
  providerName: string;
  modelUsed: string;
  costUSD: number;
  fallbackNotice: string | null;
};

/**
 * Auto-execute a work order by running its handoff prompt through the configured AI provider,
 * then storing the response as an ImplementationReport (which notifies the King and saves
 * decision memories). This is text-only reasoning/drafting — it never edits files, runs shell
 * commands, pushes, merges, or deploys. Actual repository changes remain the Local Runner's job.
 */
export async function executeWorkOrderViaProvider(
  workOrderId: string,
  externalAgentId: string,
  opts: { userId?: string | null; actorRole?: string } = {}
): Promise<ExecuteWorkOrderResult> {
  const [workOrder, externalAgent] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id: workOrderId } }),
    prisma.externalAgent.findUnique({ where: { id: externalAgentId } })
  ]);
  if (!workOrder) throw notFound("Work order not found");
  if (!externalAgent) throw notFound("External agent not found");

  const prompt = await buildExternalAgentPrompt(workOrderId, externalAgentId);

  const executor: Agent | null =
    (await prisma.agent.findUnique({ where: { slug: "grand-vizier" } })) ?? (await prisma.agent.findFirst({ where: { isActive: true } }));
  if (!executor) throw new Error("No royal agent is available to route external agent execution");

  const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);
  const route = await selectAIProviderRoute({ agent: executor, taskMode: "BUILD", requiredCapabilities: { chat: true } });
  const effectiveParams = resolveEffectiveParameters(executor, route.provider.type, defaultMaxTokens);
  const providerCalls = buildAIProviderCallsFromRoute(route);

  const trace = await createAIUsageTrace({
    actorUserId: opts.userId ?? null,
    actorRole: opts.actorRole ?? "KING",
    triggerType: "USER_ACTION",
    triggerRoute: "POST /api/work-orders/:id/dispatch/:externalAgentId",
    triggerLabel: workOrder.title,
    projectId: workOrder.projectId,
    agentId: executor.id,
    sourceType: "WORK_ORDER_EXECUTION",
    sourceId: workOrder.id,
    operation: "external_agent_execution",
    purpose: "External agent work order execution",
    providerId: route.provider.id,
    providerType: route.provider.type,
    providerName: route.provider.name,
    model: route.model,
    prompt,
    metadata: { externalAgentId, externalAgentType: externalAgent.type, externalAgentName: externalAgent.name },
    attributionStatus: "TRUSTED"
  });

  const traceContext = buildTraceContext({
    traceId: trace.traceId,
    sourceType: "WORK_ORDER_EXECUTION",
    sourceId: workOrder.id,
    operation: "external_agent_execution",
    purpose: "External agent work order execution",
    triggerType: "USER_ACTION",
    attributionStatus: "TRUSTED"
  });

  let generated: Awaited<ReturnType<typeof generateWithFallback>>;
  try {
    generated = await generateWithFallback(
      providerCalls,
      {
        command: prompt,
        mode: "BUILD",
        agentName: externalAgent.name,
        agentRole: externalAgent.roleTitle,
        agentSkills: externalAgent.capabilities,
        systemPrompt: [
          `You are ${externalAgent.roleTitle} (${externalAgent.name}), an execution agent for AI Kingdom.`,
          externalAgent.description,
          "You are an executor, not a decision owner. Do not change product vision or architecture without explicit instruction.",
          "Complete the work order described in the user message and respond ONLY using the requested final response format."
        ].filter(Boolean).join(" "),
        responseStyle: "Concise, structured, and honest about what could and could not be done.",
        maxTokens: defaultMaxTokens,
        modelParameters: effectiveParams
      },
      traceContext
    );
  } catch (error) {
    await failAIUsageTrace(trace.traceId, error).catch(() => undefined);
    throw error;
  }

  const cost = await calculateCostUSDFromRegistry(generated.providerId ?? generated.providerName, generated.modelUsed, generated.usage);

  await prisma.usageRecord.create({
    data: {
      traceId: trace.traceId,
      attributionStatus: "TRUSTED",
      agentId: executor.id,
      provider: generated.providerName,
      providerId: generated.providerId ?? generated.providerName,
      model: generated.modelUsed,
      promptTokens: generated.usage.promptTokens,
      completionTokens: generated.usage.completionTokens,
      totalTokens: generated.usage.totalTokens,
      inputCacheHitTokens: generated.usage.inputCacheHitTokens ?? null,
      inputCacheMissTokens: generated.usage.inputCacheMissTokens ?? null,
      estimatedCostUSD: cost.costUSD,
      estimatedCostLocal: cost.costUSD,
      currency: "USD",
      pricingSource: cost.source,
      pricingStatus: cost.pricingStatus,
      pricingNotes: cost.pricingNotes ?? null,
      ...buildUsageAttribution({
        projectId: workOrder.projectId,
        purpose: "External agent work order execution",
        sourceType: "WORK_ORDER_EXECUTION",
        sourceId: workOrder.id,
        operation: "external_agent_execution",
        requestLabel: `Execution of ${workOrder.title}`,
        prompt,
        response: generated.response,
        metadata: { externalAgentId, externalAgentType: externalAgent.type }
      })
    }
  }).catch(() => undefined);

  await completeAIUsageTrace(trace.traceId, generated.response, {
    attributionStatus: "TRUSTED",
    tokensUsed: generated.usage.totalTokens,
    estimatedCostUSD: cost.costUSD,
    pricingStatus: cost.pricingStatus,
    fallbackNotice: generated.fallbackNotice ?? null
  }).catch(() => undefined);

  const parsed = parseImplementationReportText(generated.response);
  const report = await createImplementationReport({
    workOrderId,
    externalAgentId,
    summary: `[Auto-executed via ${externalAgent.name} · ${generated.modelUsed}] ${parsed.summary}`,
    filesChanged: parsed.filesChanged,
    commandsRun: parsed.commandsRun,
    testsRun: parsed.testsRun,
    testResult: parsed.testResult,
    errors: parsed.errors,
    decisionsMade: parsed.decisionsMade,
    remainingWork: parsed.remainingWork,
    nextRecommendedAction: parsed.nextRecommendedAction,
    rawOutput: generated.response
  });

  return {
    report,
    providerName: generated.providerName,
    modelUsed: generated.modelUsed,
    costUSD: cost.costUSD,
    fallbackNotice: generated.fallbackNotice ?? null
  };
}
