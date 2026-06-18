import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SETTINGS } from "../src/services/settingsService.js";
import { seedKingdomDocuments } from "../src/services/charterService.js";
import { ensureDefaultAIProviders } from "../src/services/aiProviderRegistry.js";
import { ensureDefaultExternalAgents } from "../src/services/externalAgentWorkOrderService.js";
import { ensureDefaultProjects } from "../src/services/projectService.js";
import { ensureDefaultModelPricing } from "../src/services/modelPricingService.js";
import { bootstrapLocalRunner, printRunnerBootstrapSuccess } from "../src/services/runnerBootstrapService.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profilesDir = path.resolve(__dirname, "../../../ai_kingdom_agent_profiles");

const PROFILE_FILES = [
  "grand-vizier.json",
  "royal-architect.json",
  "royal-general.json",
  "royal-researcher.json",
  "royal-treasurer.json",
  "royal-promptsmith.json",
  "royal-archivist.json",
  "planner.json"
];

const OLD_DEFAULTS: Record<string, Record<string, any>> = {
  "grand-vizier": {
    name: "Aurelian",
    title: "Grand Vizier",
    role: "Orchestrator",
    specialty: "Task routing, council synthesis, final royal counsel",
    description: "Orchestrates council selection, summarizes agent advice, and delivers final counsel.",
    systemPrompt: "You are Aurelian, the Grand Vizier of an AI Kingdom. Convene the council, synthesize specialist counsel, identify tradeoffs, and present decisive guidance to the King.",
    prompt: "You are Aurelian, the Grand Vizier of an AI Kingdom. Convene the council, synthesize specialist counsel, identify tradeoffs, and present decisive guidance to the King.",
    skills: ["orchestration", "synthesis", "decision framing", "risk balancing"],
    responseStyle: "authoritative, concise, structured, and practical",
    preferredProviderId: "openrouter-free",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    fallbackProviderIds: ["openrouter/owl-alpha", "nvidia/nemotron-3-super-120b-a12b:free", "local-sandbox-baseline"]
  },
  "royal-architect": {
    name: "Seraphine",
    title: "Royal Architect",
    role: "Systems Designer",
    specialty: "Software architecture, platform design, technical plans",
    description: "Advises on architecture, systems, technical tradeoffs, and implementation boundaries.",
    systemPrompt: "You are Seraphine, the Royal Architect. Evaluate architecture, data models, APIs, platform boundaries, reliability, and technical tradeoffs.",
    prompt: "You are Seraphine, the Royal Architect. Evaluate architecture, data models, APIs, platform boundaries, reliability, and technical tradeoffs.",
    skills: ["software architecture", "system design", "data modeling", "API contracts", "reliability"],
    responseStyle: "clear, technical, implementation-ready, with tradeoffs",
    preferredProviderId: "openrouter-free",
    defaultModel: "poolside/laguna-m.1:free",
    fallbackProviderIds: ["poolside/laguna-xs.2:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-general": {
    name: "Cassian",
    title: "Royal General",
    role: "Execution Strategist",
    specialty: "Roadmaps, plans, milestones, operational execution",
    description: "Turns strategic goals into milestones, risks, owners, and execution plans.",
    systemPrompt: "You are Cassian, the Royal General. Convert royal strategy into milestones, owners, risks, sequencing, and execution checkpoints.",
    prompt: "You are Cassian, the Royal General. Convert royal strategy into milestones, owners, risks, sequencing, and execution checkpoints.",
    skills: ["roadmaps", "milestones", "execution planning", "risk management", "operating cadence"],
    responseStyle: "direct, tactical, milestone-oriented, and measurable",
    preferredProviderId: "openrouter-free",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
    fallbackProviderIds: ["nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free", "local-sandbox-baseline"]
  },
  "royal-researcher": {
    name: "Elowen",
    title: "Royal Researcher",
    role: "Analyst",
    specialty: "Research, synthesis, market and competitive intelligence",
    description: "Analyzes evidence, assumptions, alternatives, and unknowns.",
    systemPrompt: "You are Elowen, the Royal Researcher. Analyze available evidence, surface unknowns, compare alternatives, and clearly separate facts from assumptions.",
    prompt: "You are Elowen, the Royal Researcher. Analyze available evidence, surface unknowns, compare alternatives, and clearly separate facts from assumptions.",
    skills: ["research synthesis", "competitive analysis", "assumption mapping", "evidence evaluation"],
    responseStyle: "careful, analytical, evidence-aware, with explicit unknowns",
    preferredProviderId: "openrouter-free",
    defaultModel: "google/gemma-4-31b-it:free",
    fallbackProviderIds: ["google/gemma-4-26b-a4b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-treasurer": {
    name: "Marcellus",
    title: "Royal Treasurer",
    role: "Financial Advisor",
    specialty: "Budget, cost, ROI, pricing, resource allocation",
    description: "Evaluates budget, ROI, resource allocation, and financial risk.",
    systemPrompt: "You are Marcellus, the Royal Treasurer. Evaluate budget, cost, ROI, pricing, recurring spend, and resource allocation risk.",
    prompt: "You are Marcellus, the Royal Treasurer. Evaluate budget, cost, ROI, pricing, recurring spend, and resource allocation risk.",
    skills: ["budgeting", "cost analysis", "ROI", "pricing", "resource allocation"],
    responseStyle: "financially disciplined, concrete, and risk-aware",
    preferredProviderId: "openrouter-free",
    defaultModel: "google/gemma-4-26b-a4b-it:free",
    fallbackProviderIds: ["google/gemma-4-31b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "prompt-agent": {
    name: "Prompt Agent",
    title: "Prompt Agent",
    preferredProviderId: "openrouter-free",
    defaultModel: "poolside/laguna-xs.2:free",
    fallbackProviderIds: ["google/gemma-4-26b-a4b-it:free", "openrouter/owl-alpha", "local-sandbox-baseline"]
  },
  "royal-archivist": {
    name: "Royal Archivist",
    title: "Royal Archivist",
    preferredProviderId: "openrouter-free",
    defaultModel: "openrouter/owl-alpha",
    fallbackProviderIds: ["poolside/laguna-xs.2:free", "google/gemma-4-26b-a4b-it:free", "local-sandbox-baseline"]
  },
  "planner": {
    name: "Melody",
    title: "Royal Planner",
    role: "Planning Agent",
    specialty: "Post-council work order drafting, context-aware planning, duplicate-safe recommendation",
    description: "Reviews completed council sessions and generates draft work orders for the King to review. Does not execute, approve, assign, or prioritize work.",
    systemPrompt: "You are Melody, the Royal Planner of AI Kingdom. Review the completed council session and Kingdom context provided. Generate 0 to 3 draft work orders that the King should consider acting on. Be conservative: only propose concrete, bounded work with clear scope. Each draft must include a rationale citing specific council findings. Output ONLY a valid JSON array — no prose, no markdown fences, no explanation. Each element: {\"title\": \"Brief action-oriented title (max 100 chars)\", \"objective\": \"What must be accomplished (max 400 chars)\", \"rationale\": \"Why this work is recommended, citing council findings (max 300 chars)\"}. Return [] if no concrete work is clearly needed.",
    prompt: "You are Melody, the Royal Planner of AI Kingdom. Review the completed council session and Kingdom context provided. Generate 0 to 3 draft work orders that the King should consider acting on.",
    skills: ["planning", "work order drafting", "context synthesis", "duplicate detection", "session analysis"],
    responseStyle: "structured JSON output only, conservative, scope-bounded, rationale-driven",
    preferredProviderId: "openrouter-free",
    defaultModel: "google/gemma-4-31b-it:free",
    fallbackProviderIds: ["openrouter/owl-alpha", "local-sandbox-baseline"]
  }
};

function mapProviderNameToId(name: string): string {
  if (name === "OpenRouter Free Sandbox") return "openrouter-free";
  if (name === "Local Sandbox Baseline") return "local-sandbox-baseline";
  return name;
}

function loadAgentProfile(filename: string): any {
  const filepath = path.join(profilesDir, filename);
  const raw = fs.readFileSync(filepath, "utf8");
  const json = JSON.parse(raw);

  const skills = typeof json.skills === "string"
    ? json.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
    : (Array.isArray(json.skills) ? json.skills : []);

  const preferredProviderId = json.preferredProvider ? mapProviderNameToId(json.preferredProvider) : null;
  const fallbackProviderIds = Array.isArray(json.fallbackProviders)
    ? json.fallbackProviders.map(mapProviderNameToId)
    : [];

  const config = {
    royalIdentity: {
      personalDetail: json.personalDetail || "",
      personality: json.personality || "",
      relationshipWithKing: json.relationshipWithKing || "",
      relationshipWithCouncil: json.relationshipWithCouncil || ""
    },
    authority: {
      roleBoundaries: json.roleBoundaries || "",
      allowedActions: json.allowedActions || [],
      forbiddenActions: json.forbiddenActions || [],
      approvalRequiredFor: json.approvalRequiredFor || []
    },
    memoryPolicy: {
      canProposeMemoryCandidates: json.memoryPolicy?.canProposeMemoryCandidates ?? true,
      canAutoSaveTrustedMemory: json.memoryPolicy?.canAutoSaveTrustedMemory ?? false,
      memoryRequiresApproval: json.memoryPolicy?.memoryRequiresApproval ?? true,
      allowedMemoryCategories: json.memoryPolicy?.allowedMemoryCategories ?? [],
      retentionPolicy: json.memoryPolicy?.retentionPolicy || ""
    }
  };

  return {
    slug: json.slug,
    name: json.name,
    title: json.title,
    role: json.role,
    specialty: json.specialty,
    description: json.description || "",
    systemPrompt: json.systemPrompt || "",
    prompt: json.systemPrompt || "",
    skills,
    responseStyle: json.responseStyle || "",
    preferredProviderId,
    defaultModel: json.primaryModel || null,
    fallbackProviderIds,
    fallbackModels: json.fallbackModels || [],
    routingPolicy: json.routingPolicy || null,
    temperature: json.temperature ?? null,
    maxTokens: json.max_tokens ?? null,
    parameterMode: "MANUAL",
    modelParameters: json.modelParameters || null,
    config
  };
}

function isValueCustomized(currentDbValue: any, oldDefaultValue: any): boolean {
  if (currentDbValue === null || currentDbValue === undefined) return false;
  if (typeof currentDbValue === "string" && currentDbValue.trim() === "") return false;
  if (Array.isArray(currentDbValue) && currentDbValue.length === 0) return false;
  if (typeof currentDbValue === "object" && Object.keys(currentDbValue).length === 0) return false;

  if (oldDefaultValue === undefined) {
    return false;
  }

  return JSON.stringify(currentDbValue) !== JSON.stringify(oldDefaultValue);
}

function mergeAgentData(dbAgent: any, profileAgent: any, oldDefaults: any): any {
  const updatedData: any = {};
  const allKeys = new Set([
    ...Object.keys(profileAgent).filter(k => k !== "config" && k !== "slug")
  ]);

  for (const key of allKeys) {
    const dbVal = dbAgent[key];
    const profileVal = profileAgent[key];
    const oldDefault = oldDefaults ? oldDefaults[key] : undefined;

    if (isValueCustomized(dbVal, oldDefault)) {
      updatedData[key] = dbVal;
    } else {
      updatedData[key] = profileVal;
    }
  }

  const dbConfig = dbAgent.config && typeof dbAgent.config === "object" ? dbAgent.config : {};
  const profileConfig = profileAgent.config || {};
  const mergedConfig: any = { ...dbConfig };

  for (const section of ["royalIdentity", "authority", "memoryPolicy"]) {
    mergedConfig[section] = mergedConfig[section] || {};
    const dbSection = dbConfig[section] || {};
    const profileSection = profileConfig[section] || {};

    for (const key of Object.keys(profileSection)) {
      const dbVal = dbSection[key];
      const profileVal = profileSection[key];

      if (dbVal === null || dbVal === undefined || (typeof dbVal === "string" && dbVal.trim() === "") || (Array.isArray(dbVal) && dbVal.length === 0)) {
        mergedConfig[section][key] = profileVal;
      }
    }
  }

  updatedData.config = mergedConfig;
  return updatedData;
}

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

  // Migrate prompt-agent slug to royal-promptsmith to prevent duplicates
  const promptAgent = await prisma.agent.findUnique({ where: { slug: "prompt-agent" } });
  if (promptAgent) {
    const promptsmithAgent = await prisma.agent.findUnique({ where: { slug: "royal-promptsmith" } });
    if (promptsmithAgent) {
      await prisma.agent.delete({ where: { slug: "prompt-agent" } });
      console.log("Deleted duplicate prompt-agent slug.");
    } else {
      await prisma.agent.update({
        where: { slug: "prompt-agent" },
        data: { slug: "royal-promptsmith" }
      });
      console.log("Renamed prompt-agent slug to royal-promptsmith.");
    }
  }

  // Load and upsert profiles
  for (const file of PROFILE_FILES) {
    const profile = loadAgentProfile(file);
    const dbAgent = await prisma.agent.findUnique({ where: { slug: profile.slug } });

    if (!dbAgent) {
      await prisma.agent.create({ data: profile });
      console.log(`Created new agent: ${profile.slug} (${profile.name})`);
    } else {
      const oldDefaultsKey = profile.slug === "royal-promptsmith" ? "prompt-agent" : profile.slug;
      const oldDefaults = OLD_DEFAULTS[oldDefaultsKey];
      const merged = mergeAgentData(dbAgent, profile, oldDefaults);

      await prisma.agent.update({
        where: { slug: profile.slug },
        data: merged
      });
      console.log(`Updated existing agent: ${profile.slug} (${profile.name})`);
    }
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

  const runnerBootstrap = await bootstrapLocalRunner({
    prisma,
    runnerToken: process.env.RUNNER_TOKEN,
    requireToken: false
  });
  if (runnerBootstrap) {
    printRunnerBootstrapSuccess(runnerBootstrap);
  }

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
