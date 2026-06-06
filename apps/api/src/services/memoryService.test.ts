import assert from "node:assert/strict";
import test from "node:test";
import type { CouncilSession, Task } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { MockAIProvider } from "../ai/mockAIProvider.js";
import { extractMemoryCandidates, findRelevantMemories, isDuplicate } from "./memoryService.js";

const prisma = new PrismaClient();

test("create, search, and delete memory", async () => {
  const user = await prisma.user.create({
    data: {
      email: `memory-test-${Date.now()}@aikingdom.local`,
      displayName: "Memory Test King",
      passwordHash: "test"
    }
  });

  const memory = await prisma.memory.create({
    data: {
      createdBy: user.id,
      type: "FACT",
      title: "Throne Room uses Zustand",
      content: "The frontend state pattern uses Zustand stores for kingdom data.",
      tags: ["throne", "zustand"],
      importance: "HIGH"
    }
  });

  const results = await findRelevantMemories(user.id, "How should the throne room Zustand store evolve?");
  assert.equal(results[0]?.id, memory.id);

  await prisma.memory.delete({ where: { id: memory.id } });
  const afterDelete = await findRelevantMemories(user.id, "zustand throne room");
  assert.equal(afterDelete.length, 0);

  await prisma.user.delete({ where: { id: user.id } });
});

test("auto extraction duplicate check prevents repeated memory candidates", () => {
  const candidate = {
    type: "DECISION" as const,
    title: "Decision from M5",
    content: "The council recommends keeping memory concise and searchable.",
    tags: ["memory"],
    importance: "HIGH" as const
  };

  assert.equal(isDuplicate(candidate, [{ title: candidate.title, content: candidate.content }]), true);
});

test("extract memory candidates limits concise meaningful memories", () => {
  const now = new Date();
  const task: Task = {
    id: "task-1",
    projectId: null,
    createdBy: "user-1",
    title: "Memory milestone",
    command: "Build memory search and keep council context concise.",
    mode: "BUILD",
    status: "COMPLETED",
    createdAt: now,
    updatedAt: now
  };
  const session: CouncilSession = {
    id: "session-1",
    taskId: "task-1",
    projectId: null,
    status: "COMPLETED",
    selectedAgentIds: [],
    finalSummary: "Council recommends a concise memory layer. The main constraint is avoiding secrets and huge raw outputs.",
    providerName: "mock",
    modelUsed: "deterministic-mock-v1",
    fallbackNotice: null,
    consultedMemoryIds: [],
    autoSavedMemoryIds: [],
    createdAt: now,
    updatedAt: now
  };

  const candidates = extractMemoryCandidates(task, session, []);
  assert.ok(candidates.length >= 1);
  assert.ok(candidates.length <= 5);
  assert.ok(candidates.some((candidate) => candidate.type === "DECISION"));
});

test("orchestrator provider input can include relevant Kingdom Memory Context", async () => {
  const provider = new MockAIProvider();
  const result = await provider.generateAgentResponse({
    command: "Plan the next memory milestone",
    mode: "PLAN",
    agentName: "Aurelian",
    agentRole: "Grand Vizier",
    agentSkills: ["orchestration"],
    systemPrompt: "You are the Grand Vizier.",
    responseStyle: "concise",
    kingdomMemoryContext: "1. [DECISION/HIGH] Keep memory concise: Store only short useful facts."
  });

  assert.match(result.response, /Kingdom Memory Context was consulted/);
});
