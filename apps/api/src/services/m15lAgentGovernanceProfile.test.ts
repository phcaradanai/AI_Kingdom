import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { LOCAL_SANDBOX_PROVIDER_ID, OPENROUTER_FREE_PROVIDER_ID } from "./aiProviderRegistry.js";
import { selectAIProviderRoute } from "./aiProviderRouter.js";
import { proposeKnowledgeCandidate } from "./agentKnowledgeService.js";

const prisma = new PrismaClient();

async function withTestServer(fn: (baseUrl: string, token: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `m15l-king-${suffix}@aikingdom.local`,
      displayName: "M15L King",
      passwordHash: "test",
      role: "KING"
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `m15l-token-${suffix}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = (address as AddressInfo).port;
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      sessionId: session.id
    };
    await fn(`http://127.0.0.1:${port}`, signAccessToken(authUser));
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

async function createGovernanceAgent(suffix: string) {
  return prisma.agent.create({
    data: {
      slug: `m15l-agent-${suffix}`,
      name: "Marcellus Test",
      title: "Royal General",
      role: "Strategy",
      specialty: "Governance test",
      prompt: "test",
      systemPrompt: "test",
      skills: [],
      responseStyle: "concise",
      preferredProviderId: OPENROUTER_FREE_PROVIDER_ID,
      defaultModel: "openrouter/owl-alpha",
      fallbackProviderIds: ["deepseek", LOCAL_SANDBOX_PROVIDER_ID],
      config: {
        royalIdentity: {
          personalDetail: "Disciplined commander",
          personality: "Direct and sober",
          relationshipWithKing: "Loyal advisor",
          relationshipWithCouncil: "Coordinates with peers"
        },
        authority: {
          roleBoundaries: "May advise strategy only",
          allowedActions: ["Draft plans"],
          forbiddenActions: ["Execute commands"],
          approvalRequiredFor: ["Production changes"]
        },
        memoryPolicy: {
          canProposeMemoryCandidates: true,
          memoryRequiresApproval: true,
          allowedMemoryCategories: ["PROJECT_FACT"],
          retentionPolicy: "Approved durable memory only"
        }
      }
    }
  });
}

test("Agent DTO includes identity and memory policy fields with safe defaults", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createGovernanceAgent(suffix);
  try {
    await withTestServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as any;

      assert.equal(response.status, 200);
      assert.equal(body.agent.personalDetail, "Disciplined commander");
      assert.equal(body.agent.personality, "Direct and sober");
      assert.equal(body.agent.relationshipWithKing, "Loyal advisor");
      assert.deepEqual(body.agent.allowedActions, ["Draft plans"]);
      assert.equal(body.agent.canProposeMemoryCandidates, true);
      assert.equal(body.agent.canAutoSaveTrustedMemory, false);
      assert.equal(body.agent.memoryRequiresApproval, true);
      assert.deepEqual(body.agent.allowedMemoryCategories, ["PROJECT_FACT"]);
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("raw reasoning is never stored as memory candidate", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createGovernanceAgent(`raw-${suffix}`);
  try {
    const candidate = await proposeKnowledgeCandidate({
      agentId: agent.id,
      sourceType: "TRACE",
      title: "Raw chain-of-thought from provider",
      content: "Raw reasoning trace: private scratchpad should not be stored.",
      category: "PROMPT_PATTERN",
      traceId: `m15l-raw-${suffix}`
    });
    assert.equal(candidate, null);
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("sandbox mode blocks production provider fallback by default", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createGovernanceAgent(`sandbox-${suffix}`);
  try {
    const route = await selectAIProviderRoute({ agent, taskMode: "ASK" });
    assert.equal(route.provider.id, OPENROUTER_FREE_PROVIDER_ID);
    assert.deepEqual(route.fallbackProviders.map((provider) => provider.id), [LOCAL_SANDBOX_PROVIDER_ID]);
    assert.equal(route.fallbackProviders.some((provider) => provider.id === "deepseek"), false);
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("Effective Request Preview separates configuredModel and actualSentModel and exposes validation state", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createGovernanceAgent(`preview-${suffix}`);
  try {
    await withTestServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/effective-request-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as any;

      assert.equal(response.status, 200);
      assert.equal(body.preview.configuredModel, "openrouter/owl-alpha");
      assert.equal(body.preview.actualSentModel, "openrouter/owl-alpha");
      assert.ok("validationState" in body.preview);
      assert.ok(!JSON.stringify(body.preview.actualSentBodyPreview).includes("Authorization"));
      assert.ok(!JSON.stringify(body.preview.actualSentBodyPreview).includes("Bearer"));
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});

test("DeepSeek insufficient or production-blocked fallback appears skipped, not active", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await createGovernanceAgent(`deepseek-${suffix}`);
  try {
    await withTestServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/routing-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as any;
      const activeFallbackIds = body.effectiveRoute.fallbackProviders.map((provider: { id: string }) => provider.id);
      const deepseek = body.blockedFallbackProviderDetails.find((provider: { id: string }) => provider.id === "deepseek");

      assert.equal(response.status, 200);
      assert.equal(activeFallbackIds.includes("deepseek"), false);
      assert.ok(deepseek);
      assert.equal(deepseek.readiness.active, false);
      assert.ok(["INSUFFICIENT_BALANCE", "PRODUCTION_BLOCKED_IN_SANDBOX", "DISABLED"].includes(deepseek.readiness.state));
    });
  } finally {
    await prisma.agent.delete({ where: { id: agent.id } }).catch(() => undefined);
  }
});
