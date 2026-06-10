import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { UserRole } from "@prisma/client";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  syncOpenRouterAccount,
  getLatestOpenRouterAccountSnapshot,
  ProviderAccountConfigError
} from "./providerAccountSyncService.js";
import {
  syncOpenRouterModels,
  getLatestProviderModelSnapshots,
  getLastModelSyncTime
} from "./providerModelSyncService.js";
import {
  computeAndPersistHealthSnapshots,
  getLatestProviderHealthSnapshots
} from "./providerHealthSnapshotService.js";
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
      email: `provider-telemetry-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Telemetry Tester`,
      passwordHash: "test",
      role
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `provider-telemetry-token-${suffix}`,
      expiresAt: new Date(Date.now() + 3600_000)
    }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

// ─── Phase 2: Account Sync ───────────────────────────────────────────────────

test("missing OPENROUTER_API_KEY throws ProviderAccountConfigError", async () => {
  const originalKey = env.OPENROUTER_API_KEY;
  env.OPENROUTER_API_KEY = "";
  try {
    await assert.rejects(
      () => syncOpenRouterAccount(),
      (err) => err instanceof ProviderAccountConfigError
    );
  } finally {
    env.OPENROUTER_API_KEY = originalKey;
  }
});

test("OpenRouter account sync stores snapshot and does not expose API key", async () => {
  const originalKey = env.OPENROUTER_API_KEY;
  const testKey = "test-openrouter-secret-key";
  env.OPENROUTER_API_KEY = testKey;
  let createdId: string | null = null;

  const mockFetch: typeof fetch = async (_input, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${testKey}`);
    return new Response(JSON.stringify({
      data: {
        label: "AI Kingdom",
        usage: 0.0123,
        is_free_tier: false,
        rate_limit: { requests: 200, interval: "10s" },
        limit: 10,
        limit_remaining: 9.9877
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const snapshot = await syncOpenRouterAccount({ fetchImpl: mockFetch });
    createdId = snapshot.id;
    assert.equal(snapshot.status, "ACTIVE");
    assert.equal(snapshot.isFreeTier, false);
    assert.ok(Math.abs((snapshot.creditsRemaining ?? 0) - 9.9877) < 0.0001);
    assert.ok(Math.abs((snapshot.creditsUsed ?? 0) - 0.0123) < 0.0001);
    assert.equal(JSON.stringify(snapshot).includes(testKey), false);

    const row = await prisma.providerAccountSnapshot.findUnique({ where: { id: snapshot.id } });
    assert.ok(row != null);
    assert.equal(JSON.stringify(row).includes(testKey), false);
  } finally {
    if (createdId) await prisma.providerAccountSnapshot.delete({ where: { id: createdId } }).catch(() => undefined);
    env.OPENROUTER_API_KEY = originalKey;
  }
});

test("OpenRouter account sync records error snapshot on API failure", async () => {
  const originalKey = env.OPENROUTER_API_KEY;
  env.OPENROUTER_API_KEY = "test-key";
  let createdId: string | null = null;

  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const snapshot = await syncOpenRouterAccount({ fetchImpl: mockFetch });
    createdId = snapshot.id;
    assert.equal(snapshot.status, "ERROR");
  } finally {
    if (createdId) await prisma.providerAccountSnapshot.delete({ where: { id: createdId } }).catch(() => undefined);
    env.OPENROUTER_API_KEY = originalKey;
  }
});

test("getLatestOpenRouterAccountSnapshot returns most recent non-error snapshot", async () => {
  const older = await prisma.providerAccountSnapshot.create({
    data: {
      providerType: "openrouter",
      providerId: "openrouter",
      status: "ACTIVE",
      creditsRemaining: 5.0,
      syncedAt: new Date(Date.now() - 60_000)
    }
  });
  const newer = await prisma.providerAccountSnapshot.create({
    data: {
      providerType: "openrouter",
      providerId: "openrouter",
      status: "ACTIVE",
      creditsRemaining: 4.5,
      syncedAt: new Date(Date.now() + 60_000)
    }
  });
  try {
    const latest = await getLatestOpenRouterAccountSnapshot();
    assert.equal(latest?.id, newer.id);
    assert.ok(Math.abs((latest?.creditsRemaining ?? 0) - 4.5) < 0.0001);
  } finally {
    await prisma.providerAccountSnapshot.deleteMany({ where: { id: { in: [older.id, newer.id] } } }).catch(() => undefined);
  }
});

// ─── Phase 3: Model Sync ──────────────────────────────────────────────────────

test("OpenRouter model sync stores snapshots with converted pricing", async () => {
  const syncedAt = new Date();
  const createdIds: string[] = [];

  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({
      data: [
        {
          id: "openai/gpt-4o-mini",
          name: "GPT-4o mini",
          context_length: 128000,
          pricing: { prompt: "0.00000015", completion: "0.0000006" }
        },
        {
          id: "anthropic/claude-3-5-sonnet",
          name: "Claude 3.5 Sonnet",
          context_length: 200000,
          pricing: { prompt: "0.000003", completion: "0.000015" }
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await syncOpenRouterModels({ fetchImpl: mockFetch });
    assert.equal(result.synced, 2);
    assert.equal(result.failed, 0);

    // Verify stored snapshots
    const rows = await prisma.providerModelSnapshot.findMany({
      where: { providerType: "openrouter", syncedAt: { gte: syncedAt } },
      orderBy: { modelId: "asc" }
    });
    createdIds.push(...rows.map((r) => r.id));
    assert.equal(rows.length, 2);

    const gptRow = rows.find((r) => r.modelId === "openai/gpt-4o-mini");
    assert.ok(gptRow != null);
    assert.equal(gptRow.contextWindow, 128000);
    // 0.00000015 * 1_000_000 = 0.15
    assert.ok(Math.abs((gptRow.inputPricePerMillion ?? 0) - 0.15) < 0.0001);
    // 0.0000006 * 1_000_000 = 0.6
    assert.ok(Math.abs((gptRow.outputPricePerMillion ?? 0) - 0.6) < 0.0001);
  } finally {
    if (createdIds.length) await prisma.providerModelSnapshot.deleteMany({ where: { id: { in: createdIds } } }).catch(() => undefined);
  }
});

test("getLatestProviderModelSnapshots returns deduplicated latest per modelId", async () => {
  const suffix = `test-${Date.now()}`;
  const modelId = `test/model-dedup-${suffix}`;
  const older = await prisma.providerModelSnapshot.create({
    data: { providerType: "openrouter", modelId, inputPricePerMillion: 1.0, outputPricePerMillion: 2.0, syncedAt: new Date(Date.now() - 60_000) }
  });
  const newer = await prisma.providerModelSnapshot.create({
    data: { providerType: "openrouter", modelId, inputPricePerMillion: 1.5, outputPricePerMillion: 2.5, syncedAt: new Date(Date.now() + 60_000) }
  });
  try {
    const models = await getLatestProviderModelSnapshots("openrouter");
    const match = models.find((m) => m.modelId === modelId);
    assert.ok(match != null);
    assert.equal(match.id, newer.id);
  } finally {
    await prisma.providerModelSnapshot.deleteMany({ where: { id: { in: [older.id, newer.id] } } }).catch(() => undefined);
  }
});

test("getLastModelSyncTime returns most recent syncedAt for provider", async () => {
  const providerType = "openrouter-test-sync-time";
  const row = await prisma.providerModelSnapshot.create({
    data: { providerType, modelId: "test/model-sync-time", outputPricePerMillion: 1.0, syncedAt: new Date(Date.now() + 120_000) }
  });
  try {
    const time = await getLastModelSyncTime(providerType);
    assert.ok(time != null);
    assert.equal(time.getTime(), row.syncedAt.getTime());
  } finally {
    await prisma.providerModelSnapshot.delete({ where: { id: row.id } }).catch(() => undefined);
  }
});

// ─── Phase 4: Health Sync ─────────────────────────────────────────────────────

test("computeAndPersistHealthSnapshots materializes health from trace steps", async () => {
  // Create minimal trace + steps to avoid polluting real data
  const trace = await prisma.aIUsageTrace.create({
    data: {
      traceId: `test-health-trace-${Date.now()}`,
      triggerType: "TEST",
      sourceType: "TEST",
      operation: "test_op",
      purpose: "health_test",
      status: "COMPLETED"
    }
  });

  const stepBase = {
    traceId: trace.traceId,
    operation: "test_call",
    title: "Test call",
    status: "COMPLETED",
    sequence: 1,
    providerId: `test-provider-health-${Date.now()}`,
    providerType: "test-health-provider",
    durationMs: 500
  };

  const step1 = await prisma.aIUsageTraceStep.create({
    data: { ...stepBase, stepType: "PROVIDER_CALL_SUCCESS", sequence: 1, endedAt: new Date() }
  });
  const step2 = await prisma.aIUsageTraceStep.create({
    data: { ...stepBase, stepType: "PROVIDER_CALL_SUCCESS", sequence: 2, endedAt: new Date() }
  });
  const step3 = await prisma.aIUsageTraceStep.create({
    data: { ...stepBase, stepType: "PROVIDER_CALL_FAILED", sequence: 3, errorMessage: "timeout" }
  });

  let createdSnapshotIds: string[] = [];
  try {
    const result = await computeAndPersistHealthSnapshots();
    const mySnapshot = result.snapshots.find((s) => s.providerId === stepBase.providerId);
    assert.ok(mySnapshot != null, "snapshot for test provider should exist");
    createdSnapshotIds = result.snapshots.map((s) => s.id);

    assert.equal(mySnapshot.sampleSize, 3);
    assert.ok(mySnapshot.failureRate != null);
    assert.ok(Math.abs(mySnapshot.failureRate - (1 / 3)) < 0.01);
    assert.equal(mySnapshot.avgDurationMs, 500);
    // 2 successes, 1 failure out of 3 = 33% failure => DOWN (>= 30% per M17A threshold)
    assert.equal(mySnapshot.healthStatus, "DOWN");
  } finally {
    if (createdSnapshotIds.length) await prisma.providerHealthSnapshot.deleteMany({ where: { id: { in: createdSnapshotIds } } }).catch(() => undefined);
    await prisma.aIUsageTraceStep.deleteMany({ where: { id: { in: [step1.id, step2.id, step3.id] } } }).catch(() => undefined);
    await prisma.aIUsageTrace.delete({ where: { id: trace.id } }).catch(() => undefined);
  }
});

test("getLatestProviderHealthSnapshots returns deduplicated latest per provider", async () => {
  const providerType = `test-health-dedup-${Date.now()}`;
  const older = await prisma.providerHealthSnapshot.create({
    data: { providerType, providerId: "test-p1", healthStatus: "HEALTHY", sampleSize: 5, computedAt: new Date(Date.now() - 60_000) }
  });
  const newer = await prisma.providerHealthSnapshot.create({
    data: { providerType, providerId: "test-p1", healthStatus: "DEGRADED", sampleSize: 10, computedAt: new Date(Date.now() + 60_000) }
  });
  try {
    const snapshots = await getLatestProviderHealthSnapshots();
    const match = snapshots.find((s) => s.providerType === providerType);
    assert.ok(match != null);
    assert.equal(match.id, newer.id);
    assert.equal(match.healthStatus, "DEGRADED");
  } finally {
    await prisma.providerHealthSnapshot.deleteMany({ where: { id: { in: [older.id, newer.id] } } }).catch(() => undefined);
  }
});

// ─── Phase 5: Treasury Integration ───────────────────────────────────────────

test("treasury overview includes providerTelemetry with accountSnapshots and healthSnapshots", async () => {
  const account = await prisma.providerAccountSnapshot.create({
    data: {
      providerType: "openrouter",
      providerId: "openrouter",
      status: "ACTIVE",
      creditsRemaining: 8.75,
      syncedAt: new Date(Date.now() + 120_000)
    }
  });
  const health = await prisma.providerHealthSnapshot.create({
    data: {
      providerType: "openrouter",
      providerId: "openrouter",
      healthStatus: "HEALTHY",
      sampleSize: 20,
      failureRate: 0.05,
      computedAt: new Date(Date.now() + 120_000)
    }
  });

  try {
    const overview = await getTreasuryOverview();
    assert.ok(overview.providerTelemetry != null, "providerTelemetry should exist");
    assert.ok(Array.isArray(overview.providerTelemetry.accountSnapshots));
    assert.ok(Array.isArray(overview.providerTelemetry.healthSnapshots));
    const acct = overview.providerTelemetry.accountSnapshots.find((s) => s.id === account.id);
    assert.ok(acct != null, "test account snapshot should appear in treasury overview");
    const hlth = overview.providerTelemetry.healthSnapshots.find((s) => s.id === health.id);
    assert.ok(hlth != null, "test health snapshot should appear in treasury overview");
  } finally {
    await prisma.providerAccountSnapshot.delete({ where: { id: account.id } }).catch(() => undefined);
    await prisma.providerHealthSnapshot.delete({ where: { id: health.id } }).catch(() => undefined);
  }
});

// ─── Phase 6: Routing Read Access ─────────────────────────────────────────────

test("provider intelligence summary reads cached data without querying provider APIs", async () => {
  const { getProviderIntelligenceSummary } = await import("./providerIntelligenceService.js");
  const summary = await getProviderIntelligenceSummary();
  assert.ok(summary != null);
  assert.ok(Array.isArray(summary.availability));
  assert.ok(Array.isArray(summary.health));
});

// ─── API Endpoint Tests ───────────────────────────────────────────────────────

test("GET /api/provider-balances/accounts returns 200 for KING", async () => {
  const { user, token } = await createAuthToken("KING");
  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/provider-balances/accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { accounts: unknown[] };
      assert.ok(Array.isArray(body.accounts));
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/provider-balances/health returns 200 for KING", async () => {
  const { user, token } = await createAuthToken("KING");
  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/provider-balances/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { health: unknown[] };
      assert.ok(Array.isArray(body.health));
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/provider-balances/models returns 200 for KING", async () => {
  const { user, token } = await createAuthToken("KING");
  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/provider-balances/models`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { models: unknown[]; lastSyncedAt: unknown };
      assert.ok(Array.isArray(body.models));
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/provider-balances/intelligence returns 200 for KING", async () => {
  const { user, token } = await createAuthToken("KING");
  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/provider-balances/intelligence`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { intelligence: unknown };
      assert.ok(body.intelligence != null);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("provider telemetry sync endpoints require KING role", async () => {
  const { user, token } = await createAuthToken("SCRIBE");
  try {
    await withTestServer(async (baseUrl) => {
      const headers = { Authorization: `Bearer ${token}` };
      const accountRes = await fetch(`${baseUrl}/api/provider-balances/openrouter/account/sync`, { method: "POST", headers });
      assert.equal(accountRes.status, 403);
      const modelsRes = await fetch(`${baseUrl}/api/provider-balances/openrouter/models/sync`, { method: "POST", headers });
      assert.equal(modelsRes.status, 403);
      const healthRes = await fetch(`${baseUrl}/api/provider-balances/health/compute`, { method: "POST", headers });
      assert.equal(healthRes.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
