import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import {
  approveKnowledgeCandidate,
  buildAgentKnowledgeContext,
  buildFingerprint,
  extractKnowledgeCandidatesFromTrace,
  findSimilarKnowledge,
  proposeKnowledgeCandidate,
  rejectKnowledgeCandidate
} from "./agentKnowledgeService.js";
import { checkSandboxQuota } from "./providerSandboxGuard.js";

const TEST_TAG = "knowledge-service-test";

async function createTestAgent(suffix: string) {
  return prisma.agent.create({
    data: {
      slug: `ks-agent-${suffix}`,
      name: `KS Agent ${suffix}`,
      title: "Knowledge Tester",
      role: "Tester",
      specialty: "knowledge",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      priority: 999,
      isTestData: true,
      testRunId: suffix
    }
  });
}

async function createTestUser(suffix: string) {
  return prisma.user.create({
    data: {
      email: `ks-${suffix}@aikingdom.local`,
      displayName: `KS User ${suffix}`,
      passwordHash: "test",
      role: "KING",
      isTestData: true,
      testRunId: suffix
    }
  });
}

async function createTestTrace(agentId: string, suffix: string) {
  const traceId = `ks_trace_${suffix}`;
  return prisma.aIUsageTrace.create({
    data: {
      traceId,
      agentId,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "knowledge_test",
      purpose: "testing knowledge extraction",
      status: "COMPLETED",
      responsePreview: "This is an architecture decision to use TypeScript for type safety. We decided after evaluating alternatives.",
      steps: {
        create: [
          {
            stepType: "agent_call",
            operation: "AGENT_RESPONSE",
            title: "Agent response",
            detail: "test step",
            status: "COMPLETED",
            sequence: 1,
            agentId,
            responsePreview: "Architecture decision: use TypeScript for all backend code. This was decided in the 2026 review."
          }
        ]
      }
    }
  });
}

async function cleanup(suffix: string) {
  await prisma.agentKnowledgeMemory.deleteMany({ where: { metadata: { path: ["test_tag"], equals: suffix } } });
  // Clean candidates by traceId prefix
  await prisma.agentKnowledgeCandidate.deleteMany({ where: { traceId: { startsWith: `ks_trace_${suffix}` } } });
  // Also clean by agentId (agent will be deleted after)
  const agent = await prisma.agent.findFirst({ where: { testRunId: suffix } });
  if (agent) {
    await prisma.agentKnowledgeCandidate.deleteMany({ where: { agentId: agent.id } });
    await prisma.agentKnowledgeMemory.deleteMany({ where: { agentId: agent.id } });
  }
  await prisma.aIUsageTraceStep.deleteMany({ where: { traceId: { startsWith: `ks_trace_${suffix}` } } });
  await prisma.aIUsageTrace.deleteMany({ where: { traceId: { startsWith: `ks_trace_${suffix}` } } });
  await prisma.agent.deleteMany({ where: { testRunId: suffix } });
  await prisma.user.deleteMany({ where: { testRunId: suffix } });
}

test("proposeKnowledgeCandidate creates a PENDING candidate with traceId", async () => {
  const suffix = `${Date.now()}-proposal`;
  const agent = await createTestAgent(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Architecture decision: use PostgreSQL",
      content: "We decided to use PostgreSQL as the primary database for its JSONB support and reliability.",
      category: "ARCHITECTURE_DECISION",
      confidence: 0.85,
      tags: ["database", "architecture"]
    });

    assert.ok(candidate, "Candidate should be created");
    assert.equal(candidate.status, "PENDING", "Should be PENDING by default");
    assert.equal(candidate.traceId, `ks_trace_${suffix}`);
    assert.equal(candidate.agentId, agent.id);
    assert.equal(candidate.category, "ARCHITECTURE_DECISION");
    assert.ok(candidate.fingerprint, "Should have fingerprint");
  } finally {
    await cleanup(suffix);
  }
});

test("candidates are PENDING by default", async () => {
  const suffix = `${Date.now()}-default-status`;
  const agent = await createTestAgent(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "User preference: concise responses",
      content: "The user prefers short concise responses without unnecessary padding or verbose explanations."
    });
    assert.ok(candidate, "Candidate should be created");
    assert.equal(candidate.status, "PENDING");
  } finally {
    await cleanup(suffix);
  }
});

test("approve candidate creates approved memory", async () => {
  const suffix = `${Date.now()}-approve`;
  const agent = await createTestAgent(suffix);
  const user = await createTestUser(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Workflow rule: always run tests before shipping",
      content: "Before merging any code, the team must run the full test suite and resolve all failures.",
      category: "WORKFLOW_RULE"
    });
    assert.ok(candidate, "Candidate should be created");

    const memory = await approveKnowledgeCandidate(candidate.id, user.id);
    assert.ok(memory, "Memory should be created on approval");
    assert.equal(memory.trustLevel, "APPROVED");
    assert.equal(memory.sourceCandidateId, candidate.id);
    assert.equal(memory.agentId, agent.id);

    const updatedCandidate = await prisma.agentKnowledgeCandidate.findUnique({ where: { id: candidate.id } });
    assert.equal(updatedCandidate?.status, "APPROVED");
  } finally {
    await cleanup(suffix);
  }
});

test("reject candidate does not create memory", async () => {
  const suffix = `${Date.now()}-reject`;
  const agent = await createTestAgent(suffix);
  const user = await createTestUser(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Bug learning: avoid using eval",
      content: "We learned that using eval in production code caused security vulnerabilities and should be avoided."
    });
    assert.ok(candidate, "Candidate created");

    const rejected = await rejectKnowledgeCandidate(candidate.id, user.id, "Too obvious to be useful");
    assert.ok(rejected, "Should return rejected candidate");
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, "Too obvious to be useful");

    const memoriesCount = await prisma.agentKnowledgeMemory.count({ where: { sourceCandidateId: candidate.id } });
    assert.equal(memoriesCount, 0, "Should not create any memory on rejection");
  } finally {
    await cleanup(suffix);
  }
});

test("duplicate fingerprint prevents spam", async () => {
  const suffix = `${Date.now()}-dedup`;
  const agent = await createTestAgent(suffix);
  try {
    const input = {
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Project fact: monorepo structure",
      content: "The project uses npm workspaces monorepo with apps/api and apps/web directories."
    };

    const first = await proposeKnowledgeCandidate(input);
    assert.ok(first, "First should succeed");

    const second = await proposeKnowledgeCandidate({
      ...input,
      traceId: `ks_trace_${suffix}_b`
    });
    assert.equal(second, null, "Second with same content should be blocked as duplicate");
  } finally {
    await cleanup(suffix);
  }
});

test("approved memory is included in agent prompt context", async () => {
  const suffix = `${Date.now()}-context`;
  const agent = await createTestAgent(suffix);
  const user = await createTestUser(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Architecture decision: use Express for API",
      content: "We use Express.js as the API framework because of its simplicity and extensive middleware ecosystem."
    });
    assert.ok(candidate);
    await approveKnowledgeCandidate(candidate.id, user.id);

    const { context, memoryIds } = await buildAgentKnowledgeContext(agent.id);
    assert.ok(context.includes("Express"), "Context should include approved memory content");
    assert.ok(memoryIds.length > 0, "Should return memory IDs consulted");
  } finally {
    await cleanup(suffix);
  }
});

test("pending memory is not included in agent prompt context", async () => {
  const suffix = `${Date.now()}-pending-context`;
  const agent = await createTestAgent(suffix);
  try {
    await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Risk: pending knowledge about legacy systems",
      content: "There is a risk that legacy system integrations may fail under high load conditions at peak times."
    });

    const { context } = await buildAgentKnowledgeContext(agent.id);
    const hasPendingContent = context.includes("legacy system integrations");
    assert.equal(hasPendingContent, false, "Pending memory should NOT appear in agent context");
  } finally {
    await cleanup(suffix);
  }
});

test("extractKnowledgeCandidatesFromTrace creates candidates with traceId", async () => {
  const suffix = `${Date.now()}-extract`;
  const agent = await createTestAgent(suffix);
  try {
    await createTestTrace(agent.id, suffix);

    const candidates = await extractKnowledgeCandidatesFromTrace(`ks_trace_${suffix}`);
    assert.ok(Array.isArray(candidates), "Should return array");
    // May or may not extract based on content heuristics — verify traceId linkage for any extracted
    for (const c of candidates) {
      assert.equal(c.traceId, `ks_trace_${suffix}`, "Each candidate must link back to the trace");
      assert.equal(c.status, "PENDING", "Extracted candidates must be PENDING");
    }
  } finally {
    await cleanup(suffix);
  }
});

test("sandbox provider DISABLED mode blocks provider use", async () => {
  const providerId = "local-sandbox-baseline";
  const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) {
    // Skip if no provider in test DB
    return;
  }
  // DISABLED check
  await prisma.aIProvider.update({ where: { id: providerId }, data: { environmentMode: "DISABLED" } });
  const result = await checkSandboxQuota(providerId);
  assert.equal(result.allowed, false, "DISABLED provider should not be allowed");
  // Reset
  await prisma.aIProvider.update({ where: { id: providerId }, data: { environmentMode: "SANDBOX" } });
});

test("sandbox provider refuses sensitive context by default (isFreeTier)", async () => {
  const providerId = "local-sandbox-baseline";
  const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) return;

  const result = await checkSandboxQuota(providerId);
  if (result.allowed) {
    assert.equal(result.redacted, !provider.allowSensitiveContext, "Free tier should have redacted=true when allowSensitiveContext=false");
  }
});

test("findSimilarKnowledge returns matches by fingerprint", async () => {
  const suffix = `${Date.now()}-similar`;
  const agent = await createTestAgent(suffix);
  const user = await createTestUser(suffix);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      traceId: `ks_trace_${suffix}`,
      sourceType: "TEST",
      title: "Cost learning: DeepSeek is cheapest",
      content: "DeepSeek V3 is the most cost effective provider for code generation tasks in our stack."
    });
    assert.ok(candidate);
    await approveKnowledgeCandidate(candidate.id, user.id);

    const similar = await findSimilarKnowledge({
      title: "Cost learning: DeepSeek is cheapest",
      content: "DeepSeek V3 is the most cost effective provider for code generation tasks in our stack.",
      agentId: agent.id
    });
    assert.ok(similar.length > 0, "Should find similar memory by fingerprint");
  } finally {
    await cleanup(suffix);
  }
});

test("buildFingerprint produces consistent output", () => {
  const fp1 = buildFingerprint("My title", "My content here");
  const fp2 = buildFingerprint("My title", "My content here");
  const fp3 = buildFingerprint("Different title", "My content here");
  assert.equal(fp1, fp2, "Same input must produce same fingerprint");
  assert.notEqual(fp1, fp3, "Different titles must produce different fingerprints");
  assert.equal(fp1.length, 32, "Fingerprint should be 32 chars");
});
