import type { Agent, Task, TaskMode } from "@prisma/client";
import { generateWithFallback } from "../ai/generateWithFallback.js";
import { createAIProvider } from "../ai/providerFactory.js";
import { calculateCostUSD } from "../pricing/providerPricing.js";
import { prisma } from "../db/prisma.js";
import { getKingdomContext } from "./kingdomComplianceService.js";
import { autoSaveMemories, findRelevantMemories, formatMemoryContext } from "./memoryService.js";
import { generateRoyalReport } from "./reportService.js";
import { getBooleanSetting, getNumberSetting, getSettingValue } from "./settingsService.js";

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
      sessions: true
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
      status: "RUNNING",
      selectedAgentIds: selectedAgents.map((agent) => agent.id)
    }
  });

  await prisma.task.update({
    where: { id: task.id },
    data: { status: "RUNNING" }
  });

  try {
    const providerName = await getSettingValue("AI_PROVIDER", "mock");
    const provider = createAIProvider(providerName === "openai" ? "openai" : "mock");
    const defaultModel = await getSettingValue("OPENAI_MODEL", provider.model);
    const defaultMaxTokens = await getNumberSetting("AI_MAX_TOKENS", 700);
    const autoSaveMemory = await getBooleanSetting("AUTO_SAVE_MEMORY", true);
    const autoGenerateReports = await getBooleanSetting("AUTO_GENERATE_REPORTS", true);
    const kingdomContext = await getKingdomContext();
    const relevantMemories = await findRelevantMemories(userId, task.command, 5);
    const kingdomMemoryContext = formatMemoryContext(relevantMemories);
    const fallbackNotices: string[] = [];
    const generatedResponses: Array<{ agent: Agent; response: string }> = [];

    for (const agent of selectedAgents) {
      const generated = await generateWithFallback(provider, {
        command: task.command,
        mode: task.mode,
        agentName: agent.name,
        agentRole: agent.title,
        agentSkills: agent.skills,
        systemPrompt: agent.systemPrompt || agent.prompt,
        responseStyle: agent.responseStyle,
        model: agent.defaultModel ?? defaultModel,
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? defaultMaxTokens,
        kingdomContext: kingdomContext || undefined,
        kingdomMemoryContext,
        previousCouncilContext: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n")
      });

      if (generated.fallbackNotice) {
        fallbackNotices.push(generated.fallbackNotice);
      }

      await prisma.agentResponse.create({
        data: {
          sessionId: session.id,
          agentId: agent.id,
          role: agent.title,
          response: generated.response
        }
      });

      const agentCostUSD = calculateCostUSD(
        generated.providerName,
        generated.modelUsed,
        generated.usage.promptTokens,
        generated.usage.completionTokens
      );
      await prisma.usageRecord.create({
        data: {
          taskId: task.id,
          councilSessionId: session.id,
          agentId: agent.id,
          provider: generated.providerName,
          model: generated.modelUsed,
          promptTokens: generated.usage.promptTokens,
          completionTokens: generated.usage.completionTokens,
          totalTokens: generated.usage.totalTokens,
          estimatedCostUSD: agentCostUSD,
          estimatedCostLocal: agentCostUSD,
          currency: "USD"
        }
      });

      generatedResponses.push({ agent, response: generated.response });
    }

    const grandVizier = selectedAgents.find((agent) => agent.slug === "grand-vizier") ?? selectedAgents[0];
    if (!grandVizier) {
      throw new Error("Grand Vizier is not available");
    }
    const generatedSummary = await generateWithFallback(provider, {
      command: task.command,
      mode: task.mode,
      agentName: grandVizier.name,
      agentRole: grandVizier.title,
      agentSkills: grandVizier.skills,
      systemPrompt: `${grandVizier.systemPrompt || grandVizier.prompt}\nSynthesize the council transcript into the final royal summary. Do not add new specialist analysis beyond the transcript.`,
      responseStyle: grandVizier.responseStyle,
      model: grandVizier.defaultModel ?? defaultModel,
      temperature: grandVizier.temperature ?? undefined,
      maxTokens: grandVizier.maxTokens ?? defaultMaxTokens,
      kingdomContext: kingdomContext || undefined,
      kingdomMemoryContext,
      previousCouncilContext: generatedResponses.map((item) => `${item.agent.title}: ${item.response}`).join("\n\n")
    });

    if (generatedSummary.fallbackNotice) {
      fallbackNotices.push(generatedSummary.fallbackNotice);
    }

    const summaryCostUSD = calculateCostUSD(
      generatedSummary.providerName,
      generatedSummary.modelUsed,
      generatedSummary.usage.promptTokens,
      generatedSummary.usage.completionTokens
    );
    await prisma.usageRecord.create({
      data: {
        taskId: task.id,
        councilSessionId: session.id,
        agentId: grandVizier.id,
        provider: generatedSummary.providerName,
        model: generatedSummary.modelUsed,
        promptTokens: generatedSummary.usage.promptTokens,
        completionTokens: generatedSummary.usage.completionTokens,
        totalTokens: generatedSummary.usage.totalTokens,
        estimatedCostUSD: summaryCostUSD,
        estimatedCostLocal: summaryCostUSD,
        currency: "USD"
      }
    });

    const finalSummary = generatedSummary.response;

    const completedSession = await prisma.councilSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        finalSummary,
        providerName: provider.name,
        modelUsed: [...new Set(selectedAgents.map((agent) => agent.defaultModel ?? defaultModel))].join(", "),
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
      await generateRoyalReport({
        userId,
        session: sessionWithMemories,
        consultedMemories: relevantMemories
      });
    }

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

function orderSelectedAgents(mode: TaskMode, agents: Agent[]): Agent[] {
  const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
  const selected = AGENTS_BY_MODE[mode].map((slug) => bySlug.get(slug)).filter((agent): agent is Agent => Boolean(agent));
  const grandVizier = selected.find((agent) => agent.slug === "grand-vizier");
  const specialists = selected.filter((agent) => agent.slug !== "grand-vizier").sort((a, b) => a.priority - b.priority);
  return grandVizier ? [grandVizier, ...specialists] : specialists;
}
