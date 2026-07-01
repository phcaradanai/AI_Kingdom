import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";

async function createTestAgent(suffix: string) {
  return prisma.agent.create({
    data: {
      slug: `la-agent-${suffix}`,
      name: `LA Agent ${suffix}`,
      title: "Living Agents Test Agent",
      role: "Tester",
      specialty: "living agent tests",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      priority: 999
    }
  });
}

async function createKingToken(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `la-${suffix}@aikingdom.local`,
      displayName: "LA Tester",
      passwordHash: "test",
      role: "KING"
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `la-token-${suffix}`,
      expiresAt: new Date(Date.now() + 3600_000)
    }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.close();
  }
}

test("GET /api/living-agents returns all agents with summary metrics", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { agents: Array<{ id: string; totalCalls: number; trustedTraceCount: number }> };
      assert.ok(Array.isArray(body.agents));
      const row = body.agents.find((a) => a.id === agent.id);
      assert.ok(row, "created agent must appear in list");
      assert.equal(typeof row.totalCalls, "number");
      assert.equal(typeof row.trustedTraceCount, "number");
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/:agentId returns profile and usage summary", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { profile: { agent: { id: string }; usageSummary: { totalCalls: number } } };
      assert.equal(body.profile.agent.id, agent.id);
      assert.equal(typeof body.profile.usageSummary.totalCalls, "number");
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/:agentId/timeline returns items array", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { items: unknown[]; total: number; nextCursor: string | null };
      assert.ok(Array.isArray(body.items));
      assert.equal(typeof body.total, "number");
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("timeline falls back to usage records when trace is missing", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  // Create a usage record with no traceId (legacy)
  const usageRecord = await prisma.usageRecord.create({
    data: {
      agentId: agent.id,
      provider: "mock",
      model: "test-model",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimatedCostUSD: 0,
      estimatedCostLocal: 0,
      currency: "USD",
      attributionStatus: "LEGACY_UNATTRIBUTED",
      requestLabel: "legacy test record"
    }
  });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json() as { items: Array<{ type: string; attributionStatus: string }> };
      assert.equal(res.status, 200);
      const legacyItem = body.items.find((item) => item.type === "USAGE_RECORD");
      assert.ok(legacyItem, "legacy usage record must appear in timeline");
      assert.equal(legacyItem.attributionStatus, "LEGACY_UNATTRIBUTED");
    });
  } finally {
    await prisma.usageRecord.delete({ where: { id: usageRecord.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("legacy records are labeled LEGACY_UNATTRIBUTED in timeline", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  const usageRecord = await prisma.usageRecord.create({
    data: {
      agentId: agent.id,
      provider: "mock",
      model: "legacy-model",
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
      estimatedCostUSD: 0,
      estimatedCostLocal: 0,
      currency: "USD",
      attributionStatus: "LEGACY_UNATTRIBUTED"
    }
  });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json() as { items: Array<{ type: string; attributionStatus: string }> };
      const legacyItems = body.items.filter((item) => item.attributionStatus === "LEGACY_UNATTRIBUTED");
      assert.ok(legacyItems.length > 0, "must have at least one LEGACY_UNATTRIBUTED item");
    });
  } finally {
    await prisma.usageRecord.delete({ where: { id: usageRecord.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/:agentId/relations returns node/edge structure", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/relations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as {
        relations: {
          nodes: { agent: { id: string }; projects: unknown[]; councilSessions: unknown[] };
          edges: unknown[];
        };
      };
      assert.equal(body.relations.nodes.agent.id, agent.id);
      assert.ok(Array.isArray(body.relations.nodes.projects));
      assert.ok(Array.isArray(body.relations.edges));
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("living agents list response does not include API key fields", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const bodyText = await res.text();
      // Must not contain API key related field names
      assert.equal(bodyText.includes("apiKey"), false);
      assert.equal(bodyText.includes("passwordHash"), false);
      assert.equal(bodyText.includes("tokenHash"), false);
      assert.equal(bodyText.includes("OPENAI_API_KEY"), false);
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/:agentId returns 404 for unknown agent", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/nonexistent-agent-id-xyz`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 404);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/state returns state array including created agent", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  const VALID_STATUSES = new Set([
    "IDLE", "THINKING", "PLANNING", "WORKING",
    "WAITING_FOR_KING", "WAITING_FOR_EXTERNAL_AGENT",
    "VALIDATING", "REVIEWING", "LEARNING", "BLOCKED", "OFFLINE"
  ]);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/state`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { states: Array<{ agentId: string; status: string; confidence: string; summary: string }> };
      assert.ok(Array.isArray(body.states));
      const row = body.states.find((s) => s.agentId === agent.id);
      assert.ok(row, "created agent must appear in /state response");
      assert.ok(VALID_STATUSES.has(row.status), `status "${row.status}" must be a valid LivingAgentStatusCode`);
      assert.ok(["HIGH", "MEDIUM", "LOW"].includes(row.confidence), "confidence must be HIGH/MEDIUM/LOW");
      assert.equal(typeof row.summary, "string");
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/living-agents/:agentId/state returns IDLE for agent with no active signals", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/state`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { state: { agentId: string; status: string; confidence: string } };
      assert.equal(body.state.agentId, agent.id);
      assert.equal(body.state.status, "IDLE");
      assert.equal(body.state.confidence, "HIGH");
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("timeline includes trace step for agent", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createTestAgent(suffix);
  const { user, token } = await createKingToken(suffix);

  // Create an AIUsageTrace + step for this agent
  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `la-trace-${suffix}`,
      agentId: agent.id,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "test_operation",
      purpose: "test trace for living agents",
      status: "COMPLETED"
    }
  });

  const step = await prisma.aIUsageTraceStep.create({
    data: {
      traceId: trace.traceId,
      stepType: "AGENT_RESPONSE",
      operation: "agent_response",
      title: "Test trace step",
      detail: "Testing living agents timeline",
      status: "COMPLETED",
      sequence: 1,
      agentId: agent.id,
      providerName: "mock",
      model: "test-model",
      tokensUsed: 42,
      estimatedCostUSD: 0.0001
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/living-agents/${agent.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { items: Array<{ type: string; traceId: string; tokensUsed: number }> };
      const traceStepItem = body.items.find((item) => item.type === "TRACE_STEP" && item.traceId === trace.traceId);
      assert.ok(traceStepItem, "trace step must appear in timeline");
      assert.equal(traceStepItem.tokensUsed, 42);
    });
  } finally {
    await prisma.aIUsageTraceStep.delete({ where: { id: step.id } }).catch(() => undefined);
    await prisma.aIUsageTrace.delete({ where: { id: trace.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
