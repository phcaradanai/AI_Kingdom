import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { formatKingdomContext, getCharter, getVision, seedKingdomDocuments } from "./charterService.js";


async function makeUser(suffix: string, role: "KING" | "SCRIBE" = "KING") {
  const user = await prisma.user.create({
    data: { email: `charter-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `Charter ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `charter-session-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

test("seedKingdomDocuments creates charter if none exists (idempotent)", async () => {
  // Remove any existing charter records for a clean slate test
  const countBefore = await prisma.kingdomCharter.count();
  // Run twice — should not throw or duplicate
  await seedKingdomDocuments();
  await seedKingdomDocuments();
  const countAfter = await prisma.kingdomCharter.count();
  // Either it was 0 (and now 1) or it was already >0 (unchanged)
  assert.ok(countAfter >= 1);
  if (countBefore === 0) {
    assert.equal(countAfter, 1);
  } else {
    assert.equal(countAfter, countBefore);
  }
});

test("seedKingdomDocuments creates vision if none exists (idempotent)", async () => {
  await seedKingdomDocuments();
  await seedKingdomDocuments();
  const count = await prisma.kingdomVision.count();
  assert.ok(count >= 1);
});

test("getCharter returns a charter with mission and content", async () => {
  await seedKingdomDocuments();
  const charter = await getCharter();
  assert.ok(charter !== null, "charter should exist after seed");
  assert.ok(typeof charter!.mission === "string" && charter!.mission.length > 0);
  assert.ok(typeof charter!.content === "string" && charter!.content.length > 0);
  assert.ok(charter!.content.includes("Kingdom"));
});

test("getVision returns a vision with content", async () => {
  await seedKingdomDocuments();
  const vision = await getVision();
  assert.ok(vision !== null, "vision should exist after seed");
  assert.ok(typeof vision!.content === "string" && vision!.content.length > 0);
});

test("formatKingdomContext includes both charter and vision", async () => {
  await seedKingdomDocuments();
  const charter = await getCharter();
  const vision = await getVision();
  const context = formatKingdomContext(charter, vision);
  assert.ok(context.includes("[KINGDOM CHARTER]"));
  assert.ok(context.includes("[KINGDOM VISION]"));
  assert.ok(context.includes("Kingdom"));
});

test("formatKingdomContext handles null charter gracefully", () => {
  const context = formatKingdomContext(null, { content: "Vision content" });
  assert.ok(!context.includes("[KINGDOM CHARTER]"));
  assert.ok(context.includes("[KINGDOM VISION]"));
});

test("formatKingdomContext returns empty string when both are null", () => {
  const context = formatKingdomContext(null, null);
  assert.equal(context, "");
});

test("GET /api/charter is accessible to all authenticated users", async () => {
  await seedKingdomDocuments();
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/charter`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { charter: { mission: string; content: string } };
    assert.ok(typeof body.charter.mission === "string");
    assert.ok(typeof body.charter.content === "string");
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("PATCH /api/charter requires KING role — SCRIBE gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/charter`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mission: "Unauthorized edit" })
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("PATCH /api/charter KING can update mission", async () => {
  await seedKingdomDocuments();
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "KING");
  const originalCharter = await getCharter();
  try {
    const { port } = server.address() as AddressInfo;
    const newMission = `Test mission ${suffix}`;
    const res = await fetch(`http://127.0.0.1:${port}/api/charter`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mission: newMission })
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { charter: { mission: string } };
    assert.equal(body.charter.mission, newMission);
  } finally {
    server.close();
    // restore original mission to avoid polluting other tests
    if (originalCharter) {
      await prisma.kingdomCharter.update({ where: { id: originalCharter.id }, data: { mission: originalCharter.mission } });
    }
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("GET /api/vision is accessible to all authenticated users", async () => {
  await seedKingdomDocuments();
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { vision: { content: string } };
    assert.ok(typeof body.vision.content === "string");
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("PATCH /api/vision requires KING role — SCRIBE gets 403", async () => {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { user, token } = await makeUser(suffix, "SCRIBE");
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Unauthorized edit" })
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
