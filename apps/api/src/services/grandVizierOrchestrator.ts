import type { Agent, Task, TaskMode } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { createAIProviderFromConfig } from "../ai/providerFactory.js";
import { resolveEffectiveParameters } from "../ai/modelParameterResolver.js";
import { prisma } from "../db/prisma.js";
import { calculateCostUSDFromRegistry } from "./modelPricingService.js";
import type { AIProviderConfig } from "./aiProviderRegistry.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { getKingdomContext } from "./kingdomComplianceService.js";
import { autoSaveMemories, findRelevantMemories, formatMemoryContext } from "./memoryService.js";
import { buildProjectContext } from "./projectContextService.js";
import { generateRoyalReport } from "./reportService.js";
import { getBooleanSetting, getNumberSetting } from "./settingsService.js";
import { buildUsageAttribution } from "./usageAttributionService.js";
import { completeAgentActivity, failAgentActivity, startAgentActivity, updateAgentActivity } from "./agentActivityService.js";
import { runPlannerAgent } from "./plannerAgentService.js";
import {
  addTraceStep,
  attachUsageRecordStep,
  buildTraceContext,
  completeAIUsageTrace,
  completeTraceStep,
  createAIUsageTrace,
  failAIUsageTrace,
  failTraceStep,
  startTraceStep,
  updateTraceSource
} from "./aiUsageTraceService.js";

const AGENTS_BY_MODE: Record<TaskMode, string[]> = {
  ASK: ["grand-vizier", "royal-architect"],
  PLAN: ["grand-vizier", "royal-general", "royal-architect"],
  RESEARCH: ["grand-vizier", "royal-researcher", "royal-general"],
  BUILD: ["grand-vizier", "royal-architect", "royal-general"]
};

export async function processTaskWithGrandVizier(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, createdBy: userId },
    include: {
      sessions: true,
      user: { select: { role: true } }
    }
  });

  if (!task) {
    const error = new Error("Task not found");
    error.name = "NotFoundError";
    throw error;
  }

  if (task.status === "COMPLETED" || task.sessions.some((session) => session.status === "COMPLETED")) {
    const error = new Error("This decree has already received council counsel");
    error.name = "ConflictError";
    throw error;
  }

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      slug: { in: AGENTS_BY_MODE[task.mode] }
    }
  });
  const selectedAgents = orderSelectedAgents(task.mode, agents);

  if (selectedAgents.length !== AGENTS_BY_MODE[task.mode].length) {
    const error = new Error("Required royal agents are not available");
    error.name = "ConflictError";
    throw error;
  }

  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      projectId: task.projectId,
      status: "RUNNING",
      selectedAgentIds: selectedAgents.map((agent) => agent.id)
    }
  });

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "RUNNING" }
  });

  try {
    const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);
    const autoSaveMemory = await getBooleanSetting("AUTO_SAVE_MEMORY", true);
    const autoGenerateReports = await getBooleanSetting("AUTO_GENERATE_REPORTS", true);
    const kingdomContext = await getKingdomContext();
    const projectContext = task.projectId
      ? await buildProjectContext(task.projectId)
      : "[PROJECT CONTEXT]\nNo project assigned. Avoid project-specific assumptions.";
    const relevantMemories = await findRelevantMemories(userId, task.command, 5);
    const kingdomMemoryContext = formatMemoryContext(relevantMemories);
    const fallbackNotices: string[] = [];
    const generatedResponses: Array<{ agent: Agent; response: string }> = [];
    const usedProviders: string[] = [];
    const usedModels: string[] = [];

    for (const agent of selectedAgents) {
      let activityId: string | null = null;
      let traceId: string | null = null;
      try {
        const route = await selectAIProviderRoute({ agent, taskMode: task.mode, requiredCapabilities: { chat: true } });
        const effectiveParams = resolveEffectiveParameters(agent, route.provider.type, defaultMaxTokens);
        const providerCalls = buildProviderCalls(route.provider, route.model, route.fallbackProviders);
        const trace = await createAIUsageTrace({
          actorUserId: userId,
          actorRole: task.user.role,
          triggerType: "USER_ACTION",
          triggerRoute: "POST /api/tasks/:id/process",
          triggerLabel: task.title,
          projectId: task.projectId,
          taskId: task.id,
          councilSessionId: session.id,
          agentId: agent.id,
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          operation: "council_agent_response",
          purpose: "Council agent response",
          providerId: route.provider.id,
          providerType: route.provider.type,
          providerName: route.provider.name,
          model: route.model,
          prompt: task.command,
          metadata: {
            taskMode: task.mode,
            agentSlug: agent.slug,
            modelParametersUsed: effectiveParams,
            reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
            reasoningEffort: effectiveParams.reasoning?.effort ?? null,
            reasoningExcluded: effectiveParams.reasoning?.exclude ?? true,
            streamEnabled: effectiveParams.stream,
            parameterMode: effectiveParams.mode
          },
          attributionStatus: "TRUSTED"
        });
        traceId = trace.traceId;
        const traceContext = buildTraceContext({
          traceId,
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          operation: "council_agent_response",
          purpose: "Council agent response",
          triggerType: "USER_ACTION",
          attributionStatus: "TRUSTED"
        });
        const activity = await startAgentActivity({
          traceId,
          attributionStatus: "TRUSTED",
          agentId: agent.id,
          projectId: task.projectId,
          taskId: task.id,
          councilSessionId: session.id,
          status: "THINKING",
          activityType: "AGENT_RESPONSE",
          title: `${agent.title} counsel`,
          detail: task.title,
          providerId: route.provider.id,
          providerName: route.provider.name,
          model: route.model,
          operation: "council_agent_response",
          sourceType: "AGENT_RESPONSE",
          sourceId: session.id,
          requestLabel: `${agent.title} response for ${task.title}`,
          metadata: { taskMode: task.mode }
        });
        activityId = activity.id;

        // ── Timeline: PROVIDER_CALL step ──
        const providerStep = await startTraceStep({
          traceId,
          stepType: "PROVIDER_CALL",
          operation: "council_agent_response",
          title: `${agent.title} provider call`,
          detail: `${route.provider.name} · ${route.model}`,
          agentId: agent.id,
          providerId: route.provider.id,
          providerType: route.provider.type,
          providerName: route.provider.name,
          model: route.model,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          promptPreview: task.command
        });

        const generated = await generateWithFallback(providerCalls, {
          command: task.command,
          mode: task.mode,
          agentName: agent.name,
          agentRole: agent.title,
          agentSkills: agent.skills,
          systemPrompt: agent.systemPrompt || agent.prompt,
          responseStyle: agent.responseStyle,
          temperature: agent.temperature ?? undefined,
          maxTokens: agent.maxTokens ?? defaultMaxTokens,
          modelParameters: effectiveParams,
          kingdomContext: kingdomContext || undefined,
          projectContext,
          kingdomMemoryContext,
          previousCouncilContext: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n")
        }, traceContext);

        // ── Timeline: Complete PROVIDER_CALL step ──
        await completeTraceStep(providerStep.id, {
          responsePreview: generated.response,
          tokensUsed: generated.usage.totalTokens,
          metadata: { providerUsed: generated.providerName, modelUsed: generated.modelUsed }
        });

        await updateAgentActivity(activityId, {
          status: "RESPONDING",
          providerId: generated.providerId ?? generated.providerName,
          providerName: generated.providerName,
          model: generated.modelUsed
        });

        if (generated.fallbackNotice) {
          fallbackNotices.push(generated.fallbackNotice);
        }
        usedProviders.push(generated.providerName);
        usedModels.push(generated.modelUsed);

        const agentResponse = await prisma.agentResponse.create({
          data: {
            sessionId: session.id,
            agentId: agent.id,
            role: agent.title,
            response: generated.response
          }
        });
        await updateTraceSource(traceId, { sourceId: agentResponse.id });

        const agentCost = await calculateCostUSDFromRegistry(
          generated.providerName,
          generated.modelUsed,
          generated.usage
        );
        const usageRecord = await prisma.usageRecord.create({
          data: {
            traceId,
            attributionStatus: "TRUSTED",
            taskId: task.id,
            councilSessionId: session.id,
            agentId: agent.id,
            provider: generated.providerName,
            providerId: generated.providerId ?? generated.providerName,
            model: generated.modelUsed,
            promptTokens: generated.usage.promptTokens,
            completionTokens: generated.usage.completionTokens,
            totalTokens: generated.usage.totalTokens,
            inputCacheHitTokens: generated.usage.inputCacheHitTokens ?? null,
            inputCacheMissTokens: generated.usage.inputCacheMissTokens ?? null,
            estimatedCostUSD: agentCost.costUSD,
            estimatedCostLocal: agentCost.costUSD,
            currency: "USD",
            pricingSource: agentCost.source,
            pricingStatus: agentCost.pricingStatus,
            pricingNotes: agentCost.pricingNotes ?? null,
            ...buildUsageAttribution({
              projectId: task.projectId,
              purpose: "Council agent response",
              sourceType: "AGENT_RESPONSE",
              sourceId: agentResponse.id,
              operation: "council_agent_response",
              requestLabel: `${agent.title} response for ${task.title}`,
              prompt: task.command,
              response: generated.response,
              metadata: {
                taskMode: task.mode,
                agentSlug: agent.slug,
                pricingStatus: agentCost.pricingStatus,
                reasoningTokens: generated.usage.reasoningTokens ?? null,
                actualSentModel: generated.actualSentModel ?? generated.modelUsed,
                responseModel: generated.responseModel ?? null,
                modelParametersUsed: effectiveParams,
                reasoningEnabled: effectiveParams.reasoning?.enabled ?? false,
                reasoningEffort: effectiveParams.reasoning?.effort ?? null,
                reasoningExcluded: effectiveParams.reasoning?.exclude ?? true,
                streamEnabled: effectiveParams.stream,
                parameterMode: effectiveParams.mode
              }
            })
          }
        });

        // ── Timeline: USAGE_RECORDED step ──
        await attachUsageRecordStep(traceId, {
          id: usageRecord.id,
          provider: generated.providerName,
          providerId: generated.providerId ?? generated.providerName,
          model: generated.modelUsed,
          totalTokens: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          pricingStatus: agentCost.pricingStatus,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          agentId: agent.id
        });

        // ── Timeline: AGENT_RESPONSE step ──
        await addTraceStep({
          traceId,
          stepType: "AGENT_RESPONSE",
          operation: "council_agent_response",
          title: `${agent.title} counsel recorded`,
          detail: task.title,
          agentId: agent.id,
          taskId: task.id,
          projectId: task.projectId,
          councilSessionId: session.id,
          responsePreview: generated.response
        });

        await completeAgentActivity(activityId, {
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          providerId: generated.providerId ?? generated.providerName,
          providerName: generated.providerName,
          model: generated.modelUsed,
          sourceId: agentResponse.id,
          usageRecordId: usageRecord.id
        });

        // ── Timeline: TRACE_COMPLETED step for agent trace ──
        await addTraceStep({
          traceId,
          stepType: "TRACE_COMPLETED",
          operation: "trace_completed",
          title: `${agent.title} trace completed`,
          taskId: task.id,
          councilSessionId: session.id,
          agentId: agent.id,
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD
        });

        await completeAIUsageTrace(traceId, generated.response, {
          attributionStatus: "TRUSTED",
          usageRecordId: usageRecord.id,
          tokensUsed: generated.usage.totalTokens,
          estimatedCostUSD: agentCost.costUSD,
          pricingStatus: agentCost.pricingStatus,
          fallbackNotice: generated.fallbackNotice ?? null
        });

        generatedResponses.push({ agent, response: generated.response });
      } catch (error) {
        if (activityId) await failAgentActivity(activityId, error).catch(() => undefined);
        if (traceId) await failAIUsageTrace(traceId, error).catch(() => undefined);
        throw error;
      }
    }

    const grandVizier = selectedAgents.find((agent) => agent.slug === "grand-vizier") ?? selectedAgents[0];
    if (!grandVizier) {
      throw new Error("Grand Vizier is not available");
    }
    const summaryRoute = await selectAIProviderRoute({ agent: grandVizier, taskMode: task.mode, requiredCapabilities: { chat: true } });
    const summaryEffectiveParams = resolveEffectiveParameters(grandVizier, summaryRoute.provider.type, defaultMaxTokens);
    const summaryProviderCalls = buildProviderCalls(summaryRoute.provider, summaryRoute.model, summaryRoute.fallbackProviders);
    const summaryTrace = await createAIUsageTrace({
      actorUserId: userId,
      actorRole: task.user.role,
      triggerType: "USER_ACTION",
      triggerRoute: "POST /api/tasks/:id/process",
      triggerLabel: task.title,
      projectId: task.projectId,
      taskId: task.id,
      councilSessionId: session.id,
      agentId: grandVizier.id,
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      operation: "final_counsel",
      purpose: "Final council synthesis",
      providerId: summaryRoute.provider.id,
      providerType: summaryRoute.provider.type,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      prompt: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n"),
      metadata: {
        taskMode: task.mode,
        agentSlug: grandVizier.slug,
        modelParametersUsed: summaryEffectiveParams,
        reasoningEnabled: summaryEffectiveParams.reasoning?.enabled ?? false,
        reasoningEffort: summaryEffectiveParams.reasoning?.effort ?? null,
        reasoningExcluded: summaryEffectiveParams.reasoning?.exclude ?? true,
        streamEnabled: summaryEffectiveParams.stream,
        parameterMode: summaryEffectiveParams.mode
      },
      attributionStatus: "TRUSTED"
    });
    const summaryTraceContext = buildTraceContext({
      traceId: summaryTrace.traceId,
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      operation: "final_counsel",
      purpose: "Final council synthesis",
      triggerType: "USER_ACTION",
      attributionStatus: "TRUSTED"
    });
    const summaryActivity = await startAgentActivity({
      traceId: summaryTrace.traceId,
      attributionStatus: "TRUSTED",
      agentId: grandVizier.id,
      projectId: task.projectId,
      taskId: task.id,
      councilSessionId: session.id,
      status: "SUMMARIZING",
      activityType: "FINAL_COUNSEL",
      title: "Grand Vizier synthesis",
      detail: task.title,
      providerId: summaryRoute.provider.id,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      operation: "final_counsel",
      sourceType: "FINAL_COUNSEL",
      sourceId: session.id,
      requestLabel: `Grand Vizier synthesis for ${task.title}`,
      metadata: { taskMode: task.mode }
    });

    // ── Timeline: FINAL_COUNSEL provider call step ──
    const summaryProviderStep = await startTraceStep({
      traceId: summaryTrace.traceId,
      stepType: "FINAL_COUNSEL",
      operation: "final_counsel",
      title: "Grand Vizier final counsel",
      detail: `${summaryRoute.provider.name} · ${summaryRoute.model}`,
      agentId: grandVizier.id,
      providerId: summaryRoute.provider.id,
      providerType: summaryRoute.provider.type,
      providerName: summaryRoute.provider.name,
      model: summaryRoute.model,
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id
    });

    let generatedSummary: Awaited<ReturnType<typeof generateWithFallback>>;
    try {
      generatedSummary = await generateWithFallback(summaryProviderCalls, {
        command: task.command,
        mode: task.mode,
        agentName: grandVizier.name,
        agentRole: grandVizier.title,
        agentSkills: grandVizier.skills,
        systemPrompt: `${grandVizier.systemPrompt || grandVizier.prompt}\nSynthesize the council transcript into the final royal summary. Do not add new specialist analysis beyond the transcript.`,
        responseStyle: grandVizier.responseStyle,
        temperature: grandVizier.temperature ?? undefined,
        maxTokens: grandVizier.maxTokens ?? defaultMaxTokens,
        modelParameters: summaryEffectiveParams,
        kingdomContext: kingdomContext || undefined,
        projectContext,
        kingdomMemoryContext,
        previousCouncilContext: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n")
      }, summaryTraceContext);
    } catch (error) {
      await failTraceStep(summaryProviderStep.id, error).catch(() => undefined);
      await failAgentActivity(summaryActivity.id, error).catch(() => undefined);
      await failAIUsageTrace(summaryTrace.traceId, error).catch(() => undefined);
      throw error;
    }

    // ── Timeline: Complete FINAL_COUNSEL step ──
    await completeTraceStep(summaryProviderStep.id, {
      responsePreview: generatedSummary.response,
      tokensUsed: generatedSummary.usage.totalTokens,
      metadata: { providerUsed: generatedSummary.providerName, modelUsed: generatedSummary.modelUsed }
    });

    if (generatedSummary.fallbackNotice) {
      fallbackNotices.push(generatedSummary.fallbackNotice);
    }
    usedProviders.push(generatedSummary.providerName);
    usedModels.push(generatedSummary.modelUsed);

    const summaryCost = await calculateCostUSDFromRegistry(
      generatedSummary.providerName,
      generatedSummary.modelUsed,
      generatedSummary.usage
    );
    const summaryUsageRecord = await prisma.usageRecord.create({
      data: {
        traceId: summaryTrace.traceId,
        attributionStatus: "TRUSTED",
        taskId: task.id,
        councilSessionId: session.id,
        agentId: grandVizier.id,
        provider: generatedSummary.providerName,
        providerId: generatedSummary.providerId ?? generatedSummary.providerName,
        model: generatedSummary.modelUsed,
        promptTokens: generatedSummary.usage.promptTokens,
        completionTokens: generatedSummary.usage.completionTokens,
        totalTokens: generatedSummary.usage.totalTokens,
        inputCacheHitTokens: generatedSummary.usage.inputCacheHitTokens ?? null,
        inputCacheMissTokens: generatedSummary.usage.inputCacheMissTokens ?? null,
        estimatedCostUSD: summaryCost.costUSD,
        estimatedCostLocal: summaryCost.costUSD,
        currency: "USD",
        pricingSource: summaryCost.source,
        pricingStatus: summaryCost.pricingStatus,
        pricingNotes: summaryCost.pricingNotes ?? null,
        ...buildUsageAttribution({
          projectId: task.projectId,
          purpose: "Final council synthesis",
          sourceType: "FINAL_COUNSEL",
          sourceId: session.id,
          operation: "final_counsel",
          requestLabel: `Grand Vizier synthesis for ${task.title}`,
          prompt: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n"),
          response: generatedSummary.response,
          metadata: {
            taskMode: task.mode,
            agentSlug: grandVizier.slug,
            pricingStatus: summaryCost.pricingStatus,
            reasoningTokens: generatedSummary.usage.reasoningTokens ?? null,
            actualSentModel: generatedSummary.actualSentModel ?? generatedSummary.modelUsed,
            responseModel: generatedSummary.responseModel ?? null,
            modelParametersUsed: summaryEffectiveParams,
            reasoningEnabled: summaryEffectiveParams.reasoning?.enabled ?? false,
            reasoningEffort: summaryEffectiveParams.reasoning?.effort ?? null,
            reasoningExcluded: summaryEffectiveParams.reasoning?.exclude ?? true,
            streamEnabled: summaryEffectiveParams.stream,
            parameterMode: summaryEffectiveParams.mode
          }
        })
      }
    });

    // ── Timeline: USAGE_RECORDED step for final counsel ──
    await attachUsageRecordStep(summaryTrace.traceId, {
      id: summaryUsageRecord.id,
      provider: generatedSummary.providerName,
      providerId: generatedSummary.providerId ?? generatedSummary.providerName,
      model: generatedSummary.modelUsed,
      totalTokens: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      pricingStatus: summaryCost.pricingStatus,
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id,
      agentId: grandVizier.id
    });

    await completeAgentActivity(summaryActivity.id, {
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      providerId: generatedSummary.providerId ?? generatedSummary.providerName,
      providerName: generatedSummary.providerName,
      model: generatedSummary.modelUsed,
      usageRecordId: summaryUsageRecord.id
    });
    await completeAIUsageTrace(summaryTrace.traceId, generatedSummary.response, {
      attributionStatus: "TRUSTED",
      usageRecordId: summaryUsageRecord.id,
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD,
      pricingStatus: summaryCost.pricingStatus,
      fallbackNotice: generatedSummary.fallbackNotice ?? null
    });

    const finalSummary = generatedSummary.response;

    const completedSession = await prisma.councilSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        finalSummary,
        providerName: [...new Set(usedProviders)].join(", "),
        modelUsed: [...new Set(usedModels)].join(", "),
        fallbackNotice: fallbackNotices.length > 0 ? [...new Set(fallbackNotices)].join("\n") : null,
        consultedMemoryIds: relevantMemories.map((memory) => memory.id)
      },
      include: {
        task: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED" }
    });

    const sessionUsage = await prisma.usageRecord.aggregate({
      _sum: { estimatedCostUSD: true },
      where: { councilSessionId: session.id }
    });
    const sessionTotalCost = sessionUsage._sum.estimatedCostUSD ?? 0;
    if (sessionTotalCost > 0) {
      await prisma.treasuryLedger.create({
        data: {
          type: "COST",
          source: `council:${session.id}`,
          description: `Council session for task: ${task.title}`,
          amount: sessionTotalCost,
          currency: "USD"
        }
      });
    }

    const savedMemories = autoSaveMemory
      ? await autoSaveMemories({
          userId,
          task,
          session: completedSession,
          responses: completedSession.responses
        })
      : [];

    // ── Timeline: MEMORY_EXTRACTION step ──
    if (savedMemories.length > 0) {
      await addTraceStep({
        traceId: summaryTrace.traceId,
        stepType: "MEMORY_EXTRACTION",
        operation: "memory_extraction",
        title: `${savedMemories.length} memories saved`,
        detail: savedMemories.map((m) => m.title).join(", "),
        taskId: task.id,
        projectId: task.projectId,
        councilSessionId: session.id,
        metadata: { memoryCount: savedMemories.length, memoryIds: savedMemories.map((m) => m.id) }
      });
    }

    const sessionWithMemories = await prisma.councilSession.update({
      where: { id: completedSession.id },
      data: {
        autoSavedMemoryIds: savedMemories.map((memory) => memory.id)
      },
      include: {
        task: true,
        responses: {
          include: { agent: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (autoGenerateReports) {
      const report = await generateRoyalReport({
        userId,
        session: sessionWithMemories,
        consultedMemories: relevantMemories
      });
      await updateAgentActivity(summaryActivity.id, { reportId: report.id }).catch(() => undefined);

      // ── Timeline: REPORT_GENERATION step ──
      await addTraceStep({
        traceId: summaryTrace.traceId,
        stepType: "REPORT_GENERATION",
        operation: "report_generation",
        title: "Royal report generated",
        detail: report.title,
        reportId: report.id,
        taskId: task.id,
        projectId: task.projectId,
        councilSessionId: session.id
      });
    }

    // ── Timeline: TRACE_COMPLETED step for final counsel ──
    await addTraceStep({
      traceId: summaryTrace.traceId,
      stepType: "TRACE_COMPLETED",
      operation: "trace_completed",
      title: "Final counsel trace completed",
      taskId: task.id,
      projectId: task.projectId,
      councilSessionId: session.id,
      agentId: grandVizier.id,
      tokensUsed: generatedSummary.usage.totalTokens,
      estimatedCostUSD: summaryCost.costUSD
    });

    // ── Planner Agent: best-effort draft work order generation ──
    await runPlannerAgent(sessionWithMemories, task, userId).catch((err) =>
      console.warn("[PlannerAgent] Skipped:", err instanceof Error ? err.message : String(err))
    );

    return sessionWithMemories;
  } catch (error) {
    await prisma.councilSession.update({
      where: { id: session.id },
      data: { status: "FAILED" }
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "FAILED" }
    });
    throw error;
  }
}

function buildProviderCalls(primary: AIProviderConfig, primaryModel: string, fallbackProviders: AIProviderConfig[]) {
  const configs = [primary, ...fallbackProviders];
  return configs
    .map((provider, index) => {
      try {
        return {
          provider: createAIProviderFromConfig(provider),
          model: index === 0 ? primaryModel : provider.defaultModel
        };
      } catch {
        return null;
      }
    })
    .filter((call): call is NonNullable<typeof call> => Boolean(call));
}

function orderSelectedAgents(mode: TaskMode, agents: Agent[]): Agent[] {
  const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
  const selected = AGENTS_BY_MODE[mode].map((slug) => bySlug.get(slug)).filter((agent): agent is Agent => Boolean(agent));
  const grandVizier = selected.find((agent) => agent.slug === "grand-vizier");
  const specialists = selected.filter((agent) => agent.slug !== "grand-vizier").sort((a, b) => a.priority - b.priority);
  return grandVizier ? [grandVizier, ...specialists] : specialists;
}
