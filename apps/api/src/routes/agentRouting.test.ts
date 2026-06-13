import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
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

async function createUser(role: UserRole = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `agent-routing-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Routing Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
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

test("GET /providers/:id/models returns model list for openrouter provider", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token, "Login should succeed");

      // Mock fetch so we don't hit openrouter.ai in tests
      const originalFetch = global.fetch;
      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("openrouter.ai/api/v1/models")) {
          return {
            ok: true,
            json: async () => ({ data: [{ id: "openai/gpt-4o-mini" }, { id: "anthropic/claude-3-haiku" }, { id: "meta-llama/llama-3-8b-instruct" }] })
          } as any;
        }
        return originalFetch(url, init);
      }) as any;

      try {
        const res = await fetch(`${baseUrl}/api/providers/openrouter-free/models`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        assert.equal(res.status, 200);
        const data = await res.json() as { models: string[]; count: number; fromCache: boolean };
        assert.ok(Array.isArray(data.models), "Should return model array");
        assert.ok(typeof data.count === "number", "Should return count");
        assert.ok(data.models.length > 0, "Should have at least one model");
        assert.ok(data.models.includes("openai/gpt-4o-mini"), "Should include mocked model");
      } finally {
        global.fetch = originalFetch;
      }
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /providers/:id/models returns empty list for non-openrouter provider", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      const res = await fetch(`${baseUrl}/api/providers/local-sandbox-baseline/models`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json() as { models: string[]; message?: string };
      assert.ok(Array.isArray(data.models));
      assert.equal(data.models.length, 0);
      assert.ok(data.message?.includes("OpenRouter"), "Should explain restriction");
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("PATCH /agents/:id persists fallbackModels and routingPolicy", async () => {
  const user = await createUser("KING");
  const suffix = Date.now();
  let agentId: string | null = null;
  // Clean up any leftover from prior runs
  await prisma.agent.deleteMany({ where: { slug: { startsWith: "routing-test-" } } }).catch(() => undefined);
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      // Create a test agent with unique slug suffix
      const createRes = await fetch(`${baseUrl}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `routing-test-${suffix}`,
          title: `Routing Test ${suffix}`,
          role: "Tester",
          specialty: "routing test agent",
          systemPrompt: "Test agent for routing",
          skills: [],
          fallbackModels: ["openai/gpt-4o-mini", "anthropic/claude-3-haiku"],
          routingPolicy: "FIXED_PRIMARY_WITH_FALLBACK"
        })
      });
      if (createRes.status !== 201) {
        const body = await createRes.text();
        assert.fail(`Expected 201 but got ${createRes.status}: ${body}`);
      }
      assert.equal(createRes.status, 201);
      const createData = await createRes.json() as { agent: { id: string; fallbackModels: string[]; routingPolicy: string | null } };
      agentId = createData.agent.id;
      assert.deepEqual(createData.agent.fallbackModels, ["openai/gpt-4o-mini", "anthropic/claude-3-haiku"]);
      assert.equal(createData.agent.routingPolicy, "FIXED_PRIMARY_WITH_FALLBACK");

      // Patch the agent
      const patchRes = await fetch(`${baseUrl}/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fallbackModels: ["meta-llama/llama-3-8b-instruct"],
          routingPolicy: "LOWEST_COST"
        })
      });
      assert.equal(patchRes.status, 200);
      const patchData = await patchRes.json() as { agent: { fallbackModels: string[]; routingPolicy: string | null } };
      assert.deepEqual(patchData.agent.fallbackModels, ["meta-llama/llama-3-8b-instruct"]);
      assert.equal(patchData.agent.routingPolicy, "LOWEST_COST");
    });
  } finally {
    if (agentId) await prisma.agent.delete({ where: { id: agentId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /agents/:id/routing-preview returns effective route", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      // Find an existing seeded agent to preview (do not delete it)
      const agentsRes = await fetch(`${baseUrl}/api/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const agentsData = await agentsRes.json() as { agents: Array<{ id: string }> };
      assert.ok(agentsData.agents.length > 0, "Should have seeded agents");
      const agentId = agentsData.agents[0]!.id;

      const previewRes = await fetch(`${baseUrl}/api/agents/${agentId}/routing-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(previewRes.status, 200);
      const previewData = await previewRes.json() as {
        effectiveRoute: { provider: { id: string; name: string }; model: string; fallbackProviders: unknown[] } | null;
        fallbackProviderDetails: unknown[];
        latestUsage: unknown;
      };
      assert.ok("effectiveRoute" in previewData, "Should have effectiveRoute field");
      assert.ok("fallbackProviderDetails" in previewData, "Should have fallbackProviderDetails field");
      assert.ok("latestUsage" in previewData, "Should have latestUsage field");
      if (previewData.effectiveRoute) {
        assert.ok(previewData.effectiveRoute.provider.id, "Should have provider id");
        assert.ok(previewData.effectiveRoute.provider.name, "Should have provider name");
        assert.ok(Array.isArray(previewData.effectiveRoute.fallbackProviders), "fallbackProviders should be an array");
      }
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
