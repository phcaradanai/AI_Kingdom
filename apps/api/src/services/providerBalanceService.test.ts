import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { UserRole } from "@prisma/client";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { fetchDeepSeekBalanceSnapshot } from "./providerBalanceService.js";
import { getTreasuryOverview } from "./treasuryService.js";

async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

async function createAuthToken(role: UserRole = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `provider-balance-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Balance Tester`,
      passwordHash: "test",
      role
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `provider-balance-token-${suffix}`,
      expiresAt: new Date(Date.now() + 3600_000)
    }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

test("missing DEEPSEEK_API_KEY returns safe sync error", async () => {
  const originalKey = env.DEEPSEEK_API_KEY;
  env.DEEPSEEK_API_KEY = "";
  const { user, token } = await createAuthToken("KING");

  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/provider-balances/deepseek/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json() as { error?: string };
      assert.equal(response.status, 400);
      assert.equal(body.error, "DEEPSEEK_API_KEY is not configured on the backend.");
      if (originalKey) assert.equal(JSON.stringify(body).includes(originalKey), false);
    });
  } finally {
    env.DEEPSEEK_API_KEY = originalKey;
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("DeepSeek balance response parses string amounts, stores per currency, and never stores or returns the API key", async () => {
  const originalKey = env.DEEPSEEK_API_KEY;
  const testKey = "test-deepseek-secret-key";
  env.DEEPSEEK_API_KEY = testKey;
  let createdIds: string[] = [];

  const mockFetch: typeof fetch = async (_input, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${testKey}`);
    return new Response(JSON.stringify({
      is_available: true,
      balance_infos: [
        { currency: "USD", total_balance: "12.34", granted_balance: "2.34", topped_up_balance: "10.00" },
        { currency: "CNY", total_balance: "88.50", granted_balance: "8.50", topped_up_balance: "80.00" }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const snapshots = await fetchDeepSeekBalanceSnapshot({ fetchImpl: mockFetch });
    createdIds = snapshots.map((snapshot) => snapshot.id);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots.find((snapshot) => snapshot.currency === "USD")?.totalBalance, 12.34);
    assert.equal(snapshots.find((snapshot) => snapshot.currency === "CNY")?.toppedUpBalance, 80);
    assert.equal(JSON.stringify(snapshots).includes(testKey), false);

    const rows = await prisma.providerBalanceSnapshot.findMany({
      where: { id: { in: snapshots.map((snapshot) => snapshot.id) } }
    });
    assert.equal(rows.length, 2);
    assert.equal(JSON.stringify(rows).includes(testKey), false);
  } finally {
    await prisma.providerBalanceSnapshot.deleteMany({ where: { id: { in: createdIds } } });
    env.DEEPSEEK_API_KEY = originalKey;
  }
});

test("treasury overview includes latest DeepSeek provider balance", async () => {
  const snapshot = await prisma.providerBalanceSnapshot.create({
    data: {
      providerType: "deepseek",
      providerId: "deepseek",
      isAvailable: true,
      currency: "USD",
      totalBalance: 77.25,
      grantedBalance: 7.25,
      toppedUpBalance: 70,
      fetchedAt: new Date(Date.now() + 60_000),
      raw: { is_available: true, balance_infos: [] }
    }
  });

  try {
    const overview = await getTreasuryOverview();
    assert.ok(Array.isArray(overview.latestProviderBalances));
    assert.equal(overview.latestDeepSeekBalance?.id, snapshot.id);
    assert.equal(overview.latestDeepSeekBalance?.totalBalance, 77.25);
    assert.equal(overview.reconciliationStatus, "OK");
  } finally {
    await prisma.providerBalanceSnapshot.delete({ where: { id: snapshot.id } }).catch(() => undefined);
  }
});

test("provider balance sync endpoint requires KING role", async () => {
  const { user, token } = await createAuthToken("SCRIBE");
  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/provider-balances/deepseek/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
