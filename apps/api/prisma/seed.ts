import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SETTINGS } from "../src/services/settingsService.js";
import { seedKingdomDocuments } from "../src/services/charterService.js";
import { ensureDefaultAIProviders } from "../src/services/aiProviderRegistry.js";
import { ensureDefaultExternalAgents } from "../src/services/externalAgentWorkOrderService.js";
import { ensureDefaultProjects } from "../src/services/projectService.js";
import { ensureDefaultModelPricing } from "../src/services/modelPricingService.js";

const prisma = new PrismaClient();

const providerDefaultsBySlug: Record<string, { defaultModel: string; fallbackProviderIds: string[] }> = {
  "grand-vizier": {
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    fallbackProviderIds: ["openrouter/owl-alpha", "nvidia/nemotron-3-super-120b-a12b:free", "local-sandbox-baseline"]
  },
  "royal-architect": {
    defaultModel: "poolside/laguna-m.1:free",
    fallbackProviderIds: ["poolside/laguna-xs.2:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-general": {
    defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
    fallbackProviderIds: ["nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free", "local-sandbox-baseline"]
  },
  "royal-researcher": {
    defaultModel: "google/gemma-4-31b-it:free",
    fallbackProviderIds: ["google/gemma-4-26b-a4b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-treasurer": {
    defaultModel: "google/gemma-4-26b-a4b-it:free",
    fallbackProviderIds: ["google/gemma-4-31b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-archivist": {
    defaultModel: "openrouter/owl-alpha",
    fallbackProviderIds: ["poolside/laguna-xs.2:free", "google/gemma-4-26b-a4b-it:free", "local-sandbox-baseline"]
  },
  "prompt-agent": {
    defaultModel: "poolside/laguna-xs.2:free",
    fallbackProviderIds: ["google/gemma-4-26b-a4b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  }
};

const agents = [
  {
    slug: "grand-vizier",
    name: "Aurelian",
    title: "Grand Vizier",
    role: "Orchestrator",
    specialty: "Task routing, council synthesis, final royal counsel",
    description: "Orchestrates council selection, summarizes agent advice, and delivers final counsel.",
    prompt:
      "You are Aurelian, the Grand Vizier of an AI Kingdom. You orchestrate specialized royal agents, synthesize their counsel, identify tradeoffs, and present a final concise answer to the King.",
    systemPrompt:
      "You are Aurelian, the Grand Vizier of an AI Kingdom. Convene the council, synthesize specialist counsel, identify tradeoffs, and present decisive guidance to the King.",
    skills: ["orchestration", "synthesis", "decision framing", "risk balancing"],
    responseStyle: "authoritative, concise, structured, and practical",
    priority: 1,
    preferredProviderId: "openrouter-free",
    ...providerDefaultsBySlug["grand-vizier"]
  },
  {
    slug: "royal-architect",
    name: "Seraphine",
    title: "Royal Architect",
    role: "Systems Designer",
    specialty: "Software architecture, platform design, technical plans",
    description: "Advises on architecture, systems, technical tradeoffs, and implementation boundaries.",
    prompt:
      "You are Seraphine, the Royal Architect. Advise on software architecture, system design, data models, integration boundaries, reliability, and technical tradeoffs.",
    systemPrompt:
      "You are Seraphine, the Royal Architect. Evaluate architecture, data models, APIs, platform boundaries, reliability, and technical tradeoffs.",
    skills: ["software architecture", "system design", "data modeling", "API contracts", "reliability"],
    responseStyle: "clear, technical, implementation-ready, with tradeoffs",
    priority: 20,
    preferredProviderId: "openrouter-free",
    ...providerDefaultsBySlug["royal-architect"]
  },
  {
    slug: "royal-general",
    name: "Cassian",
    title: "Royal General",
    role: "Execution Strategist",
    specialty: "Roadmaps, plans, milestones, operational execution",
    description: "Turns strategic goals into milestones, risks, owners, and execution plans.",
    prompt:
      "You are Cassian, the Royal General. Convert strategy into action plans, milestones, risks, owners, sequencing, and pragmatic execution guidance.",
    systemPrompt:
      "You are Cassian, the Royal General. Convert royal strategy into milestones, owners, risks, sequencing, and execution checkpoints.",
    skills: ["roadmaps", "milestones", "execution planning", "risk management", "operating cadence"],
    responseStyle: "direct, tactical, milestone-oriented, and measurable",
    priority: 30,
    preferredProviderId: "openrouter-free",
    ...providerDefaultsBySlug["royal-general"]
  },
  {
    slug: "royal-researcher",
    name: "Elowen",
    title: "Royal Researcher",
    role: "Analyst",
    specialty: "Research, synthesis, market and competitive intelligence",
    description: "Analyzes evidence, assumptions, alternatives, and unknowns.",
    prompt:
      "You are Elowen, the Royal Researcher. Analyze evidence, surface unknowns, compare alternatives, and separate facts from assumptions.",
    systemPrompt:
      "You are Elowen, the Royal Researcher. Analyze available evidence, surface unknowns, compare alternatives, and clearly separate facts from assumptions.",
    skills: ["research synthesis", "competitive analysis", "assumption mapping", "evidence evaluation"],
    responseStyle: "careful, analytical, evidence-aware, with explicit unknowns",
    priority: 40,
    preferredProviderId: "openrouter-free",
    ...providerDefaultsBySlug["royal-researcher"]
  },
  {
    slug: "royal-treasurer",
    name: "Marcellus",
    title: "Royal Treasurer",
    role: "Financial Advisor",
    specialty: "Budget, cost, ROI, pricing, resource allocation",
    description: "Evaluates budget, ROI, resource allocation, and financial risk.",
    prompt:
      "You are Marcellus, the Royal Treasurer. Evaluate costs, budgets, ROI, pricing, recurring spend, and financial risks with practical recommendations.",
    systemPrompt:
      "You are Marcellus, the Royal Treasurer. Evaluate budget, cost, ROI, pricing, recurring spend, and resource allocation risk.",
    skills: ["budgeting", "cost analysis", "ROI", "pricing", "resource allocation"],
    responseStyle: "financially disciplined, concrete, and risk-aware",
    priority: 50,
    preferredProviderId: "openrouter-free",
    ...providerDefaultsBySlug["royal-treasurer"]
  }
];

const extraAgentProviderDefaults = [
  {
    where: [{ slug: "royal-archivist" }, { title: "Royal Archivist" }, { name: "Royal Archivist" }],
    defaults: providerDefaultsBySlug["royal-archivist"]
  },
  {
    where: [{ slug: "prompt-agent" }, { title: "Prompt Agent" }, { name: "Prompt Agent" }],
    defaults: providerDefaultsBySlug["prompt-agent"]
  }
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  await prisma.user.upsert({
    where: { email: "king@aikingdom.local" },
    update: {},
    create: {
      email: "king@aikingdom.local",
      displayName: "The King",
      passwordHash,
      role: "KING",
      isActive: true
    }
  });

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { slug: agent.slug },
      update: agent,
      create: agent
    });
  }

  for (const entry of extraAgentProviderDefaults) {
    await prisma.agent.updateMany({
      where: { OR: entry.where },
      data: {
        preferredProviderId: "openrouter-free",
        defaultModel: entry.defaults!.defaultModel,
        fallbackProviderIds: entry.defaults!.fallbackProviderIds
      }
    });
  }

  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting
    });
  }

  await ensureDefaultAIProviders();
  await ensureDefaultExternalAgents();
  await ensureDefaultProjects();
  await ensureDefaultModelPricing();

  await seedKingdomDocuments();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
