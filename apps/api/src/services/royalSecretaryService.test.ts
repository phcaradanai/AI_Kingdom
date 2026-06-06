import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  createMatter,
  createNotice,
  generateDailyBrief,
  inspectKingdomStatus,
  listMatters,
  listNotices,
  updateMatter,
  updateNotice
} from "./royalSecretaryService.js";

const prisma = new PrismaClient();

async function makeUser(suffix: string, role: "KING" | "CROWN_PRINCE" | "MINISTER" | "SCRIBE" = "KING") {
  const user = await prisma.user.create({
    data: { email: `sec-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `Sec ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `sec-session-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

async function cleanup(suffix: string) {
  await prisma.notice.deleteMany({ where: { sourceId: { contains: suffix } } });
  await prisma.matter.deleteMany({ where: { sourceId: { contains: suffix } } });
}

test("createNotice creates a notice with default status UNREAD", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const notice = await createNotice({ title: `Test notice ${suffix}`, content: "Content", severity: "INFO", sourceType: "test", sourceId: suffix });
    assert.equal(notice.status, "UNREAD");
    assert.equal(notice.severity, "INFO");
    assert.ok(typeof notice.id === "string");
  } finally {
    await cleanup(suffix);
  }
});

test("createNotice prevents duplicate (same title + severity in last 24h)", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const n1 = await createNotice({ title: `Dup ${suffix}`, content: "First", severity: "WARNING", sourceType: "test", sourceId: suffix });
    const n2 = await createNotice({ title: `Dup ${suffix}`, content: "Second", severity: "WARNING", sourceType: "test", sourceId: suffix });
    assert.equal(n1.id, n2.id);
  } finally {
    await cleanup(suffix);
  }
});

test("listNotices filters by status", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await createNotice({ title: `Unread ${suffix}`, content: "x", severity: "INFO", sourceType: "test", sourceId: suffix });
    const result = await listNotices({ status: "UNREAD" });
    assert.ok(result.notices.some((n) => n.title === `Unread ${suffix}`));
  } finally {
    await cleanup(suffix);
  }
});

test("updateNotice marks notice as READ", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const notice = await createNotice({ title: `Read test ${suffix}`, content: "y", sourceType: "test", sourceId: suffix });
    const updated = await updateNotice(notice.id, { status: "READ" });
    assert.equal(updated.status, "READ");
  } finally {
    await cleanup(suffix);
  }
});

test("createMatter creates a matter with default status DETECTED", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const matter = await createMatter({ title: `Test matter ${suffix}`, description: "Desc", priority: "HIGH", category: "SYSTEM", sourceType: "test", sourceId: suffix });
    assert.equal(matter.status, "DETECTED");
    assert.equal(matter.priority, "HIGH");
    assert.equal(matter.category, "SYSTEM");
  } finally {
    await cleanup(suffix);
  }
});

test("createMatter prevents duplicate for same sourceType+sourceId in non-terminal status", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const m1 = await createMatter({ title: `Dup matter ${suffix}`, description: "First", sourceType: "test", sourceId: suffix });
    const m2 = await createMatter({ title: `Dup matter 2 ${suffix}`, description: "Second", sourceType: "test", sourceId: suffix });
    assert.equal(m1.id, m2.id);
  } finally {
    await cleanup(suffix);
  }
});

test("createMatter allows second matter after first is COMPLETED", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const m1 = await createMatter({ title: `Done matter ${suffix}`, description: "First", sourceType: "test", sourceId: suffix });
    await updateMatter(m1.id, { status: "COMPLETED" });
    const m2 = await createMatter({ title: `New matter ${suffix}`, description: "Second", sourceType: "test", sourceId: suffix });
    assert.notEqual(m1.id, m2.id);
  } finally {
    await prisma.matter.deleteMany({ where: { sourceType: "test", sourceId: { contains: suffix } } });
  }
});

test("updateMatter changes status", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const matter = await createMatter({ title: `Status test ${suffix}`, description: "x", sourceType: "test", sourceId: suffix });
    const updated = await updateMatter(matter.id, { status: "AWAITING_ROYAL_DECISION" });
    assert.equal(updated.status, "AWAITING_ROYAL_DECISION");
  } finally {
    await cleanup(suffix);
  }
});

test("listMatters filters by priority", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await createMatter({ title: `Critical matter ${suffix}`, description: "y", priority: "CRITICAL", sourceType: "test", sourceId: suffix });
    const result = await listMatters({ priority: "CRITICAL" });
    assert.ok(result.matters.some((m) => m.title === `Critical matter ${suffix}`));
  } finally {
    await cleanup(suffix);
  }
});

test("inspectKingdomStatus returns numeric counts", async () => {
  const status = await inspectKingdomStatus();
  assert.ok(typeof status.unreadNotices === "number");
  assert.ok(typeof status.criticalNotices === "number");
  assert.ok(typeof status.openMatters === "number");
  assert.ok(typeof status.criticalMatters === "number");
  assert.ok(typeof status.awaitingRoyalDecision === "number");
  assert.ok(typeof status.failedTasks === "number");
  assert.ok(typeof status.budgetWarning === "boolean");
});

test("generateDailyBrief returns full structure", async () => {
  const brief = await generateDailyBrief();
  assert.ok(typeof brief.kingdomStatus === "object");
  assert.ok(Array.isArray(brief.urgentNotices));
  assert.ok(Array.isArray(brief.openMatters));
  assert.ok(Array.isArray(brief.awaitingRoyalDecision));
  assert.ok(Array.isArray(brief.recommendedActions));
  assert.ok(brief.recommendedActions.length >= 1);
  assert.ok(brief.recommendedActions.every((a) => ["info", "warning", "critical"].includes(a.severity)));
});

test("GET /api/secretary/brief accessible to SCRIBE", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/secretary/brief`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { kingdomStatus: object; recommendedActions: unknown[] };
    assert.ok(typeof body.kingdomStatus === "object");
    assert.ok(Array.isArray(body.recommendedActions));
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("POST /api/notices requires KING — MINISTER gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "MINISTER");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/notices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "test", content: "test" })
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("PATCH /api/notices/:id CROWN_PRINCE can mark READ", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "CROWN_PRINCE");
  const notice = await createNotice({ title: `CP test ${suffix}`, content: "z", sourceType: "test", sourceId: suffix });
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/notices/${notice.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "READ" })
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { notice: { status: string } };
    assert.equal(body.notice.status, "READ");
  } finally {
    server.close();
    await cleanup(suffix);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("DELETE /api/notices/:id requires KING — CROWN_PRINCE gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "CROWN_PRINCE");
  const notice = await createNotice({ title: `Del test ${suffix}`, content: "z", sourceType: "test", sourceId: suffix });
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/notices/${notice.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await cleanup(suffix);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/matters accessible to SCRIBE", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/matters`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { matters: unknown[] };
    assert.ok(Array.isArray(body.matters));
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("POST /api/matters requires KING — SCRIBE gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/matters`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "test", description: "test" })
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
