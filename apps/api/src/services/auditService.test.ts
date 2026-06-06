import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { listAuditLogs, sanitizeMetadata, searchAuditLogs } from "./auditService.js";

const prisma = new PrismaClient();

async function makeUser(suffix: string, role: "KING" | "SCRIBE" | "MINISTER" = "KING") {
  const user = await prisma.user.create({
    data: { email: `audit-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `Audit ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `audit-session-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, session, token: signAccessToken(authUser) };
}

async function createAuditFixture(suffix: string, userId: string, overrides: Partial<{ action: string; resourceType: string; metadata: object }> = {}) {
  return prisma.auditLog.create({
    data: {
      userId,
      action: overrides.action ?? "test_action",
      resourceType: overrides.resourceType ?? "test_resource",
      resourceId: `res-${suffix}`,
      metadata: overrides.metadata ?? { safe: "value" }
    }
  });
}

test("sanitizeMetadata removes top-level sensitive keys", () => {
  const input = { passwordHash: "bcrypt", apiKey: "sk-x", safe: "ok", email: "a@b.com" };
  const result = sanitizeMetadata(input) as Record<string, unknown>;
  assert.equal(result.passwordHash, undefined);
  assert.equal(result.apiKey, undefined);
  assert.equal(result.safe, "ok");
  assert.equal(result.email, "a@b.com");
});

test("sanitizeMetadata removes nested sensitive keys recursively", () => {
  const input = { nested: { secret: "hide", accessToken: "jwt123", keep: "value" }, top: "safe" };
  const result = sanitizeMetadata(input) as Record<string, unknown>;
  const nested = result.nested as Record<string, unknown>;
  assert.equal(nested.secret, undefined);
  assert.equal(nested.accessToken, undefined);
  assert.equal(nested.keep, "value");
  assert.equal(result.top, "safe");
});

test("sanitizeMetadata handles null and primitives", () => {
  assert.equal(sanitizeMetadata(null), null);
  assert.equal(sanitizeMetadata("string"), "string");
  assert.equal(sanitizeMetadata(42), 42);
});

test("listAuditLogs returns correct structure", async () => {
  const result = await listAuditLogs({ page: 1, limit: 10 });
  assert.ok(typeof result.total === "number");
  assert.ok(Array.isArray(result.logs));
  assert.ok(result.logs.length <= 10);
});

test("listAuditLogs filters by action", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, { action: "unique_filter_action" });
    const result = await listAuditLogs({ action: "unique_filter_action" });
    assert.ok(result.logs.every((l) => l.action === "unique_filter_action"));
    assert.ok(result.logs.length >= 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("listAuditLogs filters by resourceType", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, { resourceType: "unique_resource_type" });
    const result = await listAuditLogs({ resourceType: "unique_resource_type" });
    assert.ok(result.logs.every((l) => l.resourceType === "unique_resource_type"));
    assert.ok(result.logs.length >= 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("listAuditLogs filters by userId", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id);
    const result = await listAuditLogs({ userId: user.id });
    assert.ok(result.logs.every((l) => l.user?.id === user.id));
    assert.ok(result.logs.length >= 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("listAuditLogs pagination returns correct page", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    for (let i = 0; i < 5; i++) {
      await createAuditFixture(`${suffix}-${i}`, user.id);
    }
    const page1 = await listAuditLogs({ userId: user.id, page: 1, limit: 3 });
    const page2 = await listAuditLogs({ userId: user.id, page: 2, limit: 3 });
    assert.equal(page1.logs.length, 3);
    assert.equal(page1.total, 5);
    assert.equal(page2.logs.length, 2);
    const ids1 = new Set(page1.logs.map((l) => l.id));
    assert.ok(!page2.logs.some((l) => ids1.has(l.id)));
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("searchAuditLogs matches on action", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, { action: `searchable_audit_${suffix}` });
    const result = await searchAuditLogs(`searchable_audit_${suffix}`);
    assert.ok(result.logs.length >= 1);
    assert.ok(result.logs.some((l) => l.action.includes(`searchable_audit_${suffix}`)));
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit log entries never expose user.passwordHash", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id);
    const result = await listAuditLogs({ userId: user.id, limit: 1 });
    assert.ok(result.logs.length >= 1);
    const entry = result.logs[0]!;
    const userObj = entry.user as Record<string, unknown>;
    assert.equal(userObj.passwordHash, undefined);
    assert.ok(typeof userObj.email === "string");
    assert.ok(typeof userObj.role === "string");
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit log metadata is sanitized on read", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, {
      metadata: { passwordHash: "secret", apiKey: "sk-x", nested: { secret: "y" }, safe: "ok" }
    });
    const result = await listAuditLogs({ userId: user.id, limit: 1 });
    const meta = result.logs[0]!.metadata as Record<string, unknown>;
    assert.equal(meta.passwordHash, undefined);
    assert.equal(meta.apiKey, undefined);
    const nested = meta.nested as Record<string, unknown>;
    assert.equal(nested.secret, undefined);
    assert.equal(meta.safe, "ok");
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API requires KING role — SCRIBE gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(`scribe-${suffix}`, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API requires KING role — MINISTER gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(`minister-${suffix}`, "MINISTER");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API KING can list and filter logs", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, { action: "king_test_action" });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit?action=king_test_action`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json() as { logs: unknown[]; total: number; page: number; limit: number };
    assert.equal(res.status, 200);
    assert.ok(typeof body.total === "number");
    assert.ok(Array.isArray(body.logs));
    assert.ok(body.logs.length >= 1);
  } finally {
    server.close();
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API search endpoint works", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix);
  try {
    await createAuditFixture(suffix, user.id, { action: `searchterm_${suffix}` });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit/search?q=searchterm_${suffix}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json() as { logs: unknown[]; total: number };
    assert.equal(res.status, 200);
    assert.ok(body.logs.length >= 1);
  } finally {
    server.close();
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API single log endpoint works", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix);
  try {
    const entry = await createAuditFixture(suffix, user.id);
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit/${entry.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json() as { log: { id: string } };
    assert.equal(res.status, 200);
    assert.equal(body.log.id, entry.id);
  } finally {
    server.close();
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("audit API 404 for unknown id", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/audit/nonexistent-id-${suffix}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
