import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient, type UserRole } from "@prisma/client";
import { createApp } from "../app.js";

const prisma = new PrismaClient();

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

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `living-loop-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Tester`,
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
  const body = (await response.json().catch(() => null)) as { token?: string };
  return body?.token;
}

test("GET /api/living-loop/status creates no candidates", async () => {
  const user = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, user.email);
      assert.ok(token);

      const before = await prisma.automationCandidate.count();

      const res = await fetch(`${baseUrl}/api/living-loop/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: { enabled: boolean; pendingCandidates: number } };
      assert.ok(typeof body.status.enabled === "boolean");

      const after = await prisma.automationCandidate.count();
      assert.equal(after, before);
    });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("POST /api/living-loop/run creates a LivingLoopRun (KING only)", async () => {
  const king = await createUser("KING");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, king.email);
      assert.ok(token);

      const res = await fetch(`${baseUrl}/api/living-loop/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { run: { id: string; triggerType: string } };
      assert.equal(body.run.triggerType, "MANUAL");

      const stored = await prisma.livingLoopRun.findUnique({ where: { id: body.run.id } });
      assert.ok(stored);
    });
  } finally {
    await prisma.user.delete({ where: { id: king.id } }).catch(() => undefined);
  }
});

test("non-KING roles cannot trigger a living loop run or apply candidates", async () => {
  const minister = await createUser("MINISTER");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, minister.email);
      assert.ok(token);

      const runRes = await fetch(`${baseUrl}/api/living-loop/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(runRes.status, 403);

      const applyRes = await fetch(`${baseUrl}/api/automation-candidates/nonexistent-id/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(applyRes.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: minister.id } }).catch(() => undefined);
  }
});

test("CROWN_PRINCE can view candidates and runs but SCRIBE cannot", async () => {
  const prince = await createUser("CROWN_PRINCE");
  const scribe = await createUser("SCRIBE");
  try {
    await withServer(async (baseUrl) => {
      const princeToken = await login(baseUrl, prince.email);
      const scribeToken = await login(baseUrl, scribe.email);
      assert.ok(princeToken);
      assert.ok(scribeToken);

      const princeRes = await fetch(`${baseUrl}/api/automation-candidates`, {
        headers: { Authorization: `Bearer ${princeToken}` }
      });
      assert.equal(princeRes.status, 200);

      const scribeRes = await fetch(`${baseUrl}/api/automation-candidates`, {
        headers: { Authorization: `Bearer ${scribeToken}` }
      });
      assert.equal(scribeRes.status, 403);
    });
  } finally {
    await prisma.user.delete({ where: { id: prince.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: scribe.id } }).catch(() => undefined);
  }
});
