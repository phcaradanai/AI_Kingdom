import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { createApp } from "../app.js";

assertSafeTestDatabase();

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = (address as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function createKing() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `direct-agent-${suffix}@aikingdom.local`,
      displayName: "Direct Agent King",
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role: "KING",
      isActive: true
    }
  });
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" })
  });
  const data = await response.json() as { token?: string };
  return data.token ?? null;
}

test("direct agent conversation records response, artifact, knowledge candidate, and usage trace", async () => {
  const user = await createKing();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `direct-researcher-${suffix}`,
      name: "Direct Researcher",
      title: "Royal Researcher",
      role: "Research",
      specialty: "Research briefs",
      prompt: "You are a test researcher.",
      systemPrompt: "You are a test researcher.",
      skills: ["research", "evidence"],
      responseStyle: "concise",
      routingPolicy: "SANDBOX_FREE_ONLY"
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token, "Login should succeed");

      const response = await fetch(`${baseUrl}/api/agent-conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentId: agent.id,
          title: "AI orchestration research",
          prompt: "Researcher, prepare reusable notes about AI orchestration.",
          requestType: "RESEARCH_ASSIGNMENT",
          saveMode: "BOTH"
        })
      });
      const body = await response.json() as { session: { id: string; messages: Array<{ role: string; traceId: string | null }>; artifactId: string | null; knowledgeCandidateId: string | null; latestTraceId: string | null } };

      assert.equal(response.status, 201);
      assert.ok(body.session.id);
      assert.equal(body.session.messages.some((message) => message.role === "USER"), true);
      assert.equal(body.session.messages.some((message) => message.role === "AGENT"), true);
      assert.ok(body.session.latestTraceId);
      assert.ok(body.session.artifactId);
      assert.ok(body.session.knowledgeCandidateId);

      const artifact = await prisma.artifact.findUnique({ where: { id: body.session.artifactId } });
      assert.equal(artifact?.sourceType, "DIRECT_AGENT_SESSION");
      assert.equal(artifact?.type, "MARKET_RESEARCH");

      const candidate = await prisma.agentKnowledgeCandidate.findUnique({ where: { id: body.session.knowledgeCandidateId } });
      assert.equal(candidate?.sourceType, "DIRECT_AGENT_MESSAGE");
      assert.equal(candidate?.status, "PENDING");

      const trace = await prisma.aIUsageTrace.findUnique({ where: { traceId: body.session.latestTraceId! } });
      assert.equal(trace?.operation, "direct_agent_response");
      assert.equal(trace?.sourceType, "DIRECT_AGENT_MESSAGE");
    });
  } finally {
    await prisma.directAgentSession.deleteMany({ where: { agentId: agent.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
