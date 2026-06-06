import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  calculateCostFromRegistry,
  calculateCostUSDFromRegistry,
  ensureDefaultModelPricing,
  getModelPricing,
  invalidatePricingCache
} from "./modelPricingService.js";

const prisma = new PrismaClient();

async function createUser(role: "KING" | "SCRIBE" = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `mps-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `MPS ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `mps-token-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test("seed is idempotent — duplicate ensureDefaultModelPricing calls do not create extra rows", async () => {
  await ensureDefaultModelPricing();
  await ensureDefaultModelPricing();
  const rows = await prisma.aIModelPricing.findMany({ where: { providerType: "deepseek" } });
  const uniqueModels = new Set(rows.map((r) => r.model));
  assert.equal(rows.length, uniqueModels.size, "should have no duplicate deepseek pricing rows");
});

test("DB pricing returns KNOWN for deepseek-chat and resolves cache-aware fields", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-chat");
  assert.equal(result.source, "db");
  assert.equal(result.pricingStatus, "KNOWN");
  // deepseek-chat is now alias of v4-flash with cache-aware pricing
  assert.ok(result.inputCacheMissPerMillion != null && result.inputCacheMissPerMillion > 0, "cache miss price should be set");
  assert.ok(result.inputCacheHitPerMillion != null && result.inputCacheHitPerMillion > 0, "cache hit price should be set");
  assert.equal(result.isAlias, true);
  assert.equal(result.aliasOf, "deepseek-v4-flash");
});

test("DB pricing returns KNOWN for deepseek-v4-pro with cache-aware fields", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-v4-pro");
  assert.equal(result.pricingStatus, "KNOWN");
  assert.ok(result.inputCacheMissPerMillion != null && result.inputCacheMissPerMillion > 0, "v4-pro cache miss price > 0");
  assert.ok(result.inputCacheHitPerMillion != null && result.inputCacheHitPerMillion > 0, "v4-pro cache hit price > 0");
  // No legacy inputPerMillion for cache-aware-only models (null is acceptable)
});

test("deepseek-v4-flash seeded with correct V4 pricing", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-v4-flash");
  assert.equal(result.source, "db");
  assert.equal(result.pricingStatus, "KNOWN");
  assert.equal(result.inputCacheHitPerMillion, 0.0028);
  assert.equal(result.inputCacheMissPerMillion, 0.14);
  assert.equal(result.outputPerMillion, 0.28);
});

test("deepseek-v4-pro seeded with correct V4 pricing", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-v4-pro");
  assert.equal(result.inputCacheHitPerMillion, 0.003625);
  assert.equal(result.inputCacheMissPerMillion, 0.435);
  assert.equal(result.outputPerMillion, 0.87);
});

test("deepseek-chat is alias of deepseek-v4-flash and deprecated after 2026-07-24", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-chat");
  assert.equal(result.isAlias, true);
  assert.equal(result.aliasOf, "deepseek-v4-flash");
  assert.equal(result.isDeprecated, true);
});

test("deepseek-reasoner is alias of deepseek-v4-flash and deprecated", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-reasoner");
  assert.equal(result.isAlias, true);
  assert.equal(result.aliasOf, "deepseek-v4-flash");
  assert.equal(result.isDeprecated, true);
  // Same pricing as v4-flash
  assert.equal(result.inputCacheHitPerMillion, 0.0028);
  assert.equal(result.inputCacheMissPerMillion, 0.14);
});

test("static fallback used when model not in DB", async () => {
  invalidatePricingCache();
  const result = await getModelPricing("openai", "gpt-4o-2024-08-06");
  assert.equal(result.pricingStatus, "KNOWN");
  assert.ok(["db", "static"].includes(result.source));
  assert.ok(result.inputPerMillion != null && result.inputPerMillion > 0);
});

test("unknown model returns 0 cost and UNKNOWN status", async () => {
  invalidatePricingCache();
  const result = await getModelPricing("fictional-provider", "fictional-model-xyz");
  assert.equal(result.pricingStatus, "UNKNOWN");
  assert.ok(!result.inputPerMillion || result.inputPerMillion === 0);
  assert.equal(result.outputPerMillion, 0);
  const { costUSD, pricingStatus } = await calculateCostFromRegistry("fictional-provider", "fictional-model-xyz", 1_000_000, 1_000_000);
  assert.equal(pricingStatus, "UNKNOWN");
  assert.equal(costUSD, 0);
});

// ─── Cache-aware cost calculation ─────────────────────────────────────────────

test("calculateCostUSDFromRegistry: v4-flash with full cache breakdown yields KNOWN", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  // 500K cache hit, 500K cache miss, 1M output
  const { costUSD, pricingStatus } = await calculateCostUSDFromRegistry("deepseek", "deepseek-v4-flash", {
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
    totalTokens: 2_000_000,
    inputCacheHitTokens: 500_000,
    inputCacheMissTokens: 500_000
  });
  assert.equal(pricingStatus, "KNOWN");
  // 500K * 0.0028 + 500K * 0.14 + 1M * 0.28 = 1.4 + 70 + 280 = 351 in micro-dollars
  // cost = (500000 * 0.0028 + 500000 * 0.14 + 1000000 * 0.28) / 1_000_000
  //      = (1.4 + 70 + 280) / 1_000_000  -- no, these are $/M rates, so:
  // cost = 500000 * (0.0028/1M) + 500000 * (0.14/1M) + 1000000 * (0.28/1M)
  //      = 0.5 * 0.0028 + 0.5 * 0.14 + 1 * 0.28
  //      = 0.0014 + 0.07 + 0.28 = 0.3514
  assert.ok(Math.abs(costUSD - 0.3514) < 1e-9, `Expected ~0.3514, got ${costUSD}`);
});

test("calculateCostUSDFromRegistry: v4-pro with full cache breakdown yields KNOWN", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  // 1M cache hit, 0 cache miss, 1M output
  const { costUSD, pricingStatus } = await calculateCostUSDFromRegistry("deepseek", "deepseek-v4-pro", {
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
    totalTokens: 2_000_000,
    inputCacheHitTokens: 1_000_000,
    inputCacheMissTokens: 0
  });
  assert.equal(pricingStatus, "KNOWN");
  // 1M * 0.003625/M + 0 * 0.435/M + 1M * 0.87/M = 0.003625 + 0 + 0.87 = 0.873625
  assert.ok(Math.abs(costUSD - 0.873625) < 1e-9, `Expected ~0.873625, got ${costUSD}`);
});

test("calculateCostUSDFromRegistry: no cache detail → ESTIMATED using cache-miss rate", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  // 1M prompt (no cache detail), 1M output
  const { costUSD, pricingStatus, pricingNotes } = await calculateCostUSDFromRegistry("deepseek", "deepseek-chat", {
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
    totalTokens: 2_000_000
    // no inputCacheHitTokens / inputCacheMissTokens
  });
  assert.equal(pricingStatus, "ESTIMATED");
  assert.ok(typeof pricingNotes === "string" && pricingNotes.length > 0, "pricingNotes should describe the estimation");
  // 1M input (miss) * 0.14/M + 1M output * 0.28/M = 0.14 + 0.28 = 0.42
  assert.ok(Math.abs(costUSD - 0.42) < 1e-9, `Expected ~0.42, got ${costUSD}`);
});

test("calculateCostFromRegistry backward-compat: deepseek-chat 1M+1M = 0.42 (ESTIMATED)", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const { costUSD, pricingStatus, source } = await calculateCostFromRegistry("deepseek", "deepseek-chat", 1_000_000, 1_000_000);
  assert.equal(pricingStatus, "ESTIMATED");
  assert.equal(source, "db");
  // 1M * cacheMiss(0.14) + 1M * out(0.28) = 0.42
  assert.ok(Math.abs(costUSD - 0.42) < 1e-9, `Expected ~0.42, got ${costUSD}`);
});

test("calculateCostFromRegistry: known non-cache model uses legacy pricing → KNOWN", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const { costUSD, pricingStatus, source } = await calculateCostFromRegistry("openai", "gpt-4o-mini", 1_000_000, 1_000_000);
  assert.equal(pricingStatus, "KNOWN");
  // gpt-4o-mini: $0.15 input + $0.6 output = $0.75 for 1M+1M
  assert.ok(Math.abs(costUSD - 0.75) < 1e-9, `Expected 0.75, got ${costUSD}`);
  assert.ok(["db", "static"].includes(source));
});

// ─── API-level tests ───────────────────────────────────────────────────────────

test("model pricing API rejects negative prices", async () => {
  const king = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/model-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${king.token}` },
        body: JSON.stringify({ providerType: "test", model: "bad-model", inputPerMillion: -1, outputPerMillion: 0 })
      });
      assert.equal(res.status, 400);
    });
  } finally {
    await prisma.user.delete({ where: { id: king.user.id } });
  }
});

test("model pricing API requires KING role", async () => {
  const scribe = await createUser("SCRIBE");
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/model-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${scribe.token}` },
        body: JSON.stringify({ providerType: "test", model: "scribe-model", outputPerMillion: 0.2 })
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: scribe.user.id } });
  }
});

test("model pricing API does not accept or expose API keys", async () => {
  const king = await createUser("KING");
  let recordId = "";
  try {
    await withServer(async (baseUrl) => {
      const createRes = await fetch(`${baseUrl}/api/model-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${king.token}` },
        body: JSON.stringify({
          providerType: "test-nk-provider",
          model: "test-nk-model",
          outputPerMillion: 1.0,
          inputCacheMissPerMillion: 0.5,
          // API keys must not be sent or stored; this field doesn't exist on the schema
        })
      });
      assert.equal(createRes.status, 201);
      const body = await createRes.json() as { record: { id: string; [key: string]: unknown } };
      recordId = body.record.id;
      // Ensure no key-like field leaked into the response
      const bodyStr = JSON.stringify(body);
      assert.ok(!bodyStr.includes("apiKey") && !bodyStr.includes("secret") && !bodyStr.includes("password"),
        "Response must not contain secret fields");
    });
  } finally {
    if (recordId) await prisma.aIModelPricing.delete({ where: { id: recordId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } });
  }
});

test("model pricing API create and retrieve round-trip with cache-aware fields", async () => {
  const king = await createUser("KING");
  let recordId = "";
  try {
    await withServer(async (baseUrl) => {
      const createRes = await fetch(`${baseUrl}/api/model-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${king.token}` },
        body: JSON.stringify({
          providerType: "test-cache",
          model: "test-cache-model",
          outputPerMillion: 3.0,
          inputCacheHitPerMillion: 0.01,
          inputCacheMissPerMillion: 1.5,
          notes: "cache-aware test entry"
        })
      });
      assert.equal(createRes.status, 201);
      const body = await createRes.json() as { record: { id: string; inputCacheHitPerMillion: number } };
      recordId = body.record.id;
      assert.equal(body.record.inputCacheHitPerMillion, 0.01);

      const listRes = await fetch(`${baseUrl}/api/model-pricing`, { headers: { Authorization: `Bearer ${king.token}` } });
      assert.equal(listRes.status, 200);
      const list = await listRes.json() as { modelPricing: Array<{ id: string }> };
      assert.ok(list.modelPricing.some((r) => r.id === recordId));
    });
  } finally {
    if (recordId) await prisma.aIModelPricing.delete({ where: { id: recordId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.user.id } });
  }
});
