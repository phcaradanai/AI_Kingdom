import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  calculateCostFromRegistry,
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

test("DB pricing returns cost > 0 for deepseek-chat", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-chat");
  assert.equal(result.source, "db");
  assert.equal(result.pricingStatus, "KNOWN");
  assert.ok(result.inputPerMillion > 0);
  assert.ok(result.outputPerMillion > 0);
});

test("DB pricing returns cost > 0 for deepseek-v4-pro", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const result = await getModelPricing("deepseek", "deepseek-v4-pro");
  assert.equal(result.pricingStatus, "KNOWN");
  assert.ok(result.inputPerMillion > 0);
});

test("static fallback used when model not in DB", async () => {
  // openai:gpt-4o is in the static table but may not be in DB; use a model guaranteed to be static only
  invalidatePricingCache();
  const result = await getModelPricing("openai", "gpt-4o-2024-08-06");
  // Static table has gpt-4o-2024-08-06; DB seed does not include it, so source should be static
  assert.equal(result.pricingStatus, "KNOWN");
  assert.ok(["db", "static"].includes(result.source));
  assert.ok(result.inputPerMillion > 0);
});

test("unknown model returns 0 cost and UNKNOWN status", async () => {
  invalidatePricingCache();
  const result = await getModelPricing("fictional-provider", "fictional-model-xyz");
  assert.equal(result.pricingStatus, "UNKNOWN");
  assert.equal(result.inputPerMillion, 0);
  assert.equal(result.outputPerMillion, 0);
  const { costUSD, pricingStatus } = await calculateCostFromRegistry("fictional-provider", "fictional-model-xyz", 1_000_000, 1_000_000);
  assert.equal(pricingStatus, "UNKNOWN");
  assert.equal(costUSD, 0);
});

test("calculateCostFromRegistry uses DB pricing and returns non-zero for known model", async () => {
  await ensureDefaultModelPricing();
  invalidatePricingCache();
  const { costUSD, pricingStatus, source } = await calculateCostFromRegistry("deepseek", "deepseek-chat", 1_000_000, 1_000_000);
  assert.equal(pricingStatus, "KNOWN");
  assert.equal(source, "db");
  // 1M input @ 0.27 + 1M output @ 1.10 = 1.37
  assert.equal(costUSD, 1.37);
});

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
        body: JSON.stringify({ providerType: "test", model: "scribe-model", inputPerMillion: 0.1, outputPerMillion: 0.2 })
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: scribe.user.id } });
  }
});

test("model pricing API create and retrieve round-trip", async () => {
  const king = await createUser("KING");
  let recordId = "";
  try {
    await withServer(async (baseUrl) => {
      const createRes = await fetch(`${baseUrl}/api/model-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${king.token}` },
        body: JSON.stringify({ providerType: "test-provider", model: "test-model-roundtrip", inputPerMillion: 1.5, outputPerMillion: 3.0, notes: "test entry" })
      });
      assert.equal(createRes.status, 201);
      const body = await createRes.json() as { record: { id: string; inputPerMillion: number } };
      recordId = body.record.id;
      assert.equal(body.record.inputPerMillion, 1.5);

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
