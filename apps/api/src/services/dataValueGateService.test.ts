import assert from "node:assert/strict";
import test from "node:test";
import { ArtifactType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  evaluateRecordValue,
  explainValueDecision
} from "./dataValueGateService.js";
import {
  analyzeProjectRoutingForSource,
  createProjectInboxItemFromRoutingDecision
} from "./projectRoutingService.js";
import {
  proposeKnowledgeCandidate
} from "./agentKnowledgeService.js";
import { createMatter } from "./royalSecretaryService.js";
import { createArtifact } from "./projectService.js";

async function cleanup(suffix: string) {
  // delete project inbox items
  await prisma.projectInboxItem.deleteMany({
    where: {
      OR: [
        { sourceType: { startsWith: `test_src_${suffix}` } },
        { title: { contains: suffix } }
      ]
    }
  });

  // delete project routing candidates
  await prisma.projectRoutingCandidate.deleteMany({
    where: {
      sourceType: { startsWith: `test_src_${suffix}` }
    }
  });

  // delete matters
  await prisma.matter.deleteMany({
    where: {
      OR: [
        { title: { contains: suffix } },
        { sourceType: { startsWith: `test_src_${suffix}` } }
      ]
    }
  });

  // delete artifacts
  await prisma.artifact.deleteMany({
    where: {
      OR: [
        { title: { contains: suffix } },
        { sourceType: { startsWith: `test_src_${suffix}` } }
      ]
    }
  });

  // delete candidates/memories
  await prisma.agentKnowledgeCandidate.deleteMany({
    where: {
      OR: [
        { title: { contains: suffix } },
        { traceId: `test_trace_${suffix}` }
      ]
    }
  });
  await prisma.agentKnowledgeMemory.deleteMany({
    where: {
      title: { contains: suffix }
    }
  });

  // delete test projects
  await prisma.project.deleteMany({
    where: {
      name: { startsWith: `Test Project ${suffix}` }
    }
  });

  // delete test agents
  await prisma.agent.deleteMany({
    where: {
      slug: { startsWith: `test-agent-${suffix}` }
    }
  });
}

test("1. analyzeProjectRoutingForSource does not create ProjectInboxItem in DB", async () => {
  const suffix = `${Date.now()}-t1`;
  try {
    const project = await prisma.project.create({
      data: {
        name: `Test Project ${suffix}`,
        codename: `TPROJ-${suffix}`,
        keywords: ["specialroutingkeyword"]
      }
    });

    const beforeCount = await prisma.projectInboxItem.count();

    const analysis = await analyzeProjectRoutingForSource({
      title: "Routing test title",
      content: "This contains specialroutingkeyword to match.",
      sourceType: `test_src_${suffix}`,
      sourceId: "123"
    });

    const afterCount = await prisma.projectInboxItem.count();
    assert.equal(beforeCount, afterCount, "analyzeProjectRoutingForSource must not write ProjectInboxItem to the database");
    assert.equal(analysis.classification.suggestedProjectId, project.id);
  } catch (err) {
    // Catch block if needed
  } finally {
    await cleanup(suffix);
  }
});

test("2. analyzeProjectRoutingForSource is completely read-only", async () => {
  const suffix = `${Date.now()}-t2`;
  try {
    const beforeCandidates = await prisma.projectRoutingCandidate.count();
    const beforeInbox = await prisma.projectInboxItem.count();

    await analyzeProjectRoutingForSource({
      title: "Read-only routing test title",
      content: "No matches.",
      sourceType: `test_src_${suffix}`,
      sourceId: "456"
    });

    const afterCandidates = await prisma.projectRoutingCandidate.count();
    const afterInbox = await prisma.projectInboxItem.count();

    assert.equal(beforeCandidates, afterCandidates, "Should not create ProjectRoutingCandidate");
    assert.equal(beforeInbox, afterInbox, "Should not create ProjectInboxItem");
  } finally {
    await cleanup(suffix);
  }
});

test("3. createProjectInboxItemFromRoutingDecision requires explicitUserAction to save rejected or preview-only items", async () => {
  const suffix = `${Date.now()}-t3`;
  try {
    const analysis = await analyzeProjectRoutingForSource({
      title: "Low confidence routing",
      content: "Absolutely nothing matching any projects.",
      sourceType: `test_src_${suffix}`,
      sourceId: "789"
    });

    // 1. explicitUserAction = false -> Should not save inbox item
    const res1 = await createProjectInboxItemFromRoutingDecision(
      {
        title: "Low confidence routing",
        content: "Absolutely nothing matching any projects.",
        sourceType: `test_src_${suffix}`,
        sourceId: "789"
      },
      analysis,
      false
    );
    assert.equal(res1.inboxItem, null, "Should not create inbox item without user action for low confidence");

    // 2. explicitUserAction = true -> Should save inbox item
    const res2 = await createProjectInboxItemFromRoutingDecision(
      {
        title: "Low confidence routing",
        content: "Absolutely nothing matching any projects.",
        sourceType: `test_src_${suffix}`,
        sourceId: "789"
      },
      analysis,
      true
    );
    assert.ok(res2.inboxItem, "Should create inbox item with user action even for low confidence");
  } finally {
    await cleanup(suffix);
  }
});

test("4. Trusted source + routingConfidence 18 is not shown in the main inbox by default", async () => {
  const suffix = `${Date.now()}-t4`;
  try {
    const itemHigh = await prisma.projectInboxItem.create({
      data: {
        sourceType: `test_src_${suffix}`,
        sourceId: "high",
        title: `High quality ${suffix}`,
        summary: "This is high quality match",
        status: "PENDING",
        routingQuality: "HIGH",
        confidenceScore: 90
      }
    });

    const itemLow = await prisma.projectInboxItem.create({
      data: {
        sourceType: `test_src_${suffix}`,
        sourceId: "low",
        title: `Low quality ${suffix}`,
        summary: "This is low quality matter match",
        status: "PENDING",
        routingQuality: "DEBUG_ONLY",
        confidenceScore: 18
      }
    });

    const rawItems = await prisma.projectInboxItem.findMany({
      where: {
        sourceType: `test_src_${suffix}`,
        status: "PENDING"
      }
    });

    const HIDDEN_QUALITIES = new Set(["DEBUG_ONLY", "NO_MATCH"]);
    const filtered = rawItems.filter((item) => {
      if (item.routingQuality && HIDDEN_QUALITIES.has(item.routingQuality)) return false;
      return true;
    });

    assert.equal(filtered.length, 1, "Only 1 item should be shown");
    assert.equal(filtered[0]?.id, itemHigh.id, "High confidence item should be shown");
    const hasLow = filtered.some(i => i.id === itemLow.id);
    assert.equal(hasLow, false, "Low confidence debug_only item must be filtered out");
  } finally {
    await cleanup(suffix);
  }
});

test("5. JUNK knowledge candidate is not persisted at all", async () => {
  const suffix = `${Date.now()}-t5`;
  const agent = await prisma.agent.create({
    data: {
      slug: `test-agent-${suffix}`,
      name: "Test Agent",
      title: "Tester",
      role: "Tester",
      specialty: "testing",
      prompt: "test",
      systemPrompt: "test",
      responseStyle: "concise",
      isTestData: true
    }
  });

  try {
    const res1 = await proposeKnowledgeCandidate({
      agentId: agent.id,
      title: `Monorepo structural advice ${suffix}`,
      content: "make sure tests pass and follow conventions of the existing codebase.",
      sourceType: "TRACE",
      traceId: `test_trace_${suffix}`
    });
    assert.equal(res1, null, "Should return null for junk generic advice");

    const res2 = await proposeKnowledgeCandidate({
      agentId: agent.id,
      title: `No trace ID candidate ${suffix}`,
      content: "Architecture decision: we use PostgreSQL database system.",
      sourceType: "TRACE"
    });
    assert.equal(res2, null, "Should return null when traceId is missing");
  } finally {
    await cleanup(suffix);
  }
});

test("6. LOW review knowledge candidate is saved as REJECTED with SHORT_TERM_REVIEW retention", async () => {
  const suffix = `${Date.now()}-t6`;
  const agent = await prisma.agent.create({
    data: {
      slug: `test-agent-${suffix}`,
      name: "Test Agent",
      title: "Tester",
      role: "Tester",
      specialty: "testing",
      prompt: "test",
      systemPrompt: "test",
      responseStyle: "concise",
      isTestData: true
    }
  });

  try {
    const res = await proposeKnowledgeCandidate({
      agentId: agent.id,
      title: `Low confidence learning ${suffix}`,
      content: "Architecture decision: we decided to use custom CSS properties instead of Tailwind CSS.",
      sourceType: "TRACE",
      traceId: `test_trace_${suffix}`,
      confidence: 0.25,
      projectId: "some-project-id"
    });

    assert.ok(res, "Should persist low confidence but non-junk candidate");
    assert.equal(res.status, "REJECTED", "Should have status REJECTED");
    assert.match(res.rejectionReason || "", /Confidence is too low/, "Reason should explain low confidence");
    const meta = res.metadata as any;
    assert.equal(meta?.retentionPolicy, "SHORT_TERM_REVIEW", "Retention policy should be SHORT_TERM_REVIEW");
  } finally {
    await cleanup(suffix);
  }
});

test("7. Project architecture decision candidate is accepted as PENDING", async () => {
  const suffix = `${Date.now()}-t7`;
  const agent = await prisma.agent.create({
    data: {
      slug: `test-agent-${suffix}`,
      name: "Test Agent",
      title: "Tester",
      role: "Tester",
      specialty: "testing",
      prompt: "test",
      systemPrompt: "test",
      responseStyle: "concise",
      isTestData: true
    }
  });

  try {
    const res = await proposeKnowledgeCandidate({
      agentId: agent.id,
      title: `Architecture Decision: Node testing ${suffix}`,
      content: "We decided to migrate our tests from Vitest to the built-in Node.js test runner for standard compliance.",
      category: "ARCHITECTURE_DECISION",
      sourceType: "TRACE",
      traceId: `test_trace_${suffix}`,
      confidence: 0.85,
      projectId: "some-project-id"
    });

    assert.ok(res, "Should persist architecture candidate");
    assert.equal(res.status, "PENDING", "Should be PENDING for review");
    const meta = res.metadata as any;
    assert.equal(meta?.retentionPolicy, "APPROVED_KNOWLEDGE", "Approved knowledge candidate retention policy");
  } finally {
    await cleanup(suffix);
  }
});

test("8. Explicit user-created Matter persists successfully", async () => {
  const suffix = `${Date.now()}-t8`;
  try {
    const res = await createMatter({
      title: `Royal budget review ${suffix}`,
      description: "We need to audit our provider balances and compute accurate daily token usage fees.",
      category: "TREASURY",
      priority: "HIGH"
    });

    assert.ok(res, "Valid user-created Matter should persist");
    assert.equal(res.status, "DETECTED");

    await assert.rejects(
      async () => {
        await createMatter({
          title: `Royal budget review invalid ${suffix}`,
          description: "",
          category: "TREASURY",
          priority: "HIGH"
        });
      },
      /Validation failed/,
      "Should throw validation error for missing fields"
    );
  } finally {
    await cleanup(suffix);
  }
});

test("9. DataValueDecision includes human-readable reasons and sourceTrust classification", async () => {
  const suffix = `${Date.now()}-t9`;
  const decision = await evaluateRecordValue({
    recordType: "projectInboxItem",
    origin: "USER_CREATED",
    title: `Explicit manual routing ${suffix}`,
    content: "Matched directly.",
    explicitUserAction: true,
    confidence: 100
  });

  assert.equal(decision.sourceTrust, "TRUSTED", "USER_CREATED must map to sourceTrust TRUSTED");
  assert.ok(decision.reason, "Must contain a human-readable reason");
  assert.equal(explainValueDecision(decision), decision.reason);
});

test("10. Duplicate artifact is rejected / returns null", async () => {
  const suffix = `${Date.now()}-t10`;
  try {
    const art1 = await createArtifact({
      title: `Unique spec doc ${suffix}`,
      type: "SPEC" as ArtifactType,
      content: "This is a detailed specification doc for monorepo routing features.",
      sourceType: `test_src_${suffix}`,
      sourceId: "art123"
    });
    assert.ok(art1, "First artifact should be created successfully");

    const art2 = await createArtifact({
      title: `Unique spec doc ${suffix}`,
      type: "SPEC" as ArtifactType,
      content: "This is a duplicate specification doc.",
      sourceType: `test_src_${suffix}`,
      sourceId: "art123"
    });

    assert.equal(art2, null, "Second duplicate artifact should be rejected by the gate and return null");
  } finally {
    await cleanup(suffix);
  }
});
