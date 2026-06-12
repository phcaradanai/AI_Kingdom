import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient, type User, type UserRole } from "@prisma/client";
import { createApp } from "../app.js";

const prisma = new PrismaClient();

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;

let king: User;
let minister: User;
let scribe: User;
let kingToken: string;
let ministerToken: string;
let scribeToken: string;

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `royal-brief-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
      isActive: true
    }
  });
}

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" })
  });
  const body = (await response.json().catch(() => null)) as { token?: string };
  if (!body?.token) throw new Error(`login failed for ${email}: ${response.status}`);
  return body.token;
}

before(async () => {
  const app = createApp();
  server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = (address as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;

  king = await createUser("KING");
  minister = await createUser("MINISTER");
  scribe = await createUser("SCRIBE");

  kingToken = await login(king.email);
  ministerToken = await login(minister.email);
  scribeToken = await login(scribe.email);
});

after(async () => {
  server.close();
  await prisma.royalBrief.deleteMany({ where: { generatedByUserId: { in: [king.id, minister.id, scribe.id] } } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { userId: { in: [king.id, minister.id, scribe.id] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [king.id, minister.id, scribe.id] } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("GET /api/royal-brief/latest returns null when none exist", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/latest`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { brief: unknown };
  assert.equal(body.brief, null);
});

test("non-KING roles cannot generate a Royal Brief", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ministerToken}` }
  });
  assert.equal(res.status, 403);
});

let firstBriefId: string;

test("POST /api/royal-brief/generate (KING) creates a READY brief with provenance", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    brief: {
      id: string;
      status: string;
      generatedBy: string;
      generatedByUserId: string | null;
      summary: string;
      highlights: { items: unknown[] };
      decisionsNeeded: { items: unknown[] };
      provenance: { sources: string[]; windowHours: number; generatedAt: string };
    };
  };
  firstBriefId = body.brief.id;

  assert.equal(body.brief.status, "READY");
  assert.equal(body.brief.generatedBy, "KING");
  assert.equal(body.brief.generatedByUserId, king.id);
  assert.ok(typeof body.brief.summary === "string" && body.brief.summary.length > 0);
  assert.ok(Array.isArray(body.brief.highlights.items));
  assert.ok(Array.isArray(body.brief.decisionsNeeded.items));
  assert.ok(Array.isArray(body.brief.provenance.sources) && body.brief.provenance.sources.length > 0);
  assert.ok(typeof body.brief.provenance.windowHours === "number");

  const audit = await prisma.auditLog.findFirst({
    where: { action: "royal_brief_generated", resourceId: firstBriefId },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "expected royal_brief_generated audit log entry");
});

test("every decision item includes risk level, recommended action, and provenance", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/latest`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    brief: {
      decisionsNeeded: {
        items: Array<{
          title: string;
          why: string;
          sourceLink: string;
          riskLevel: string;
          recommendedAction: string;
          availableActions: string[];
          provenance: { source: string; observedAt: string };
        }>;
      };
    } | null;
  };

  for (const decision of body.brief?.decisionsNeeded.items ?? []) {
    assert.ok(decision.title);
    assert.ok(decision.why);
    assert.ok(decision.sourceLink);
    assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(decision.riskLevel));
    assert.ok(decision.recommendedAction);
    assert.ok(Array.isArray(decision.availableActions) && decision.availableActions.length > 0);
    assert.ok(decision.provenance.source);
    assert.ok(decision.provenance.observedAt);
  }
});

test("GET /api/royal-brief/latest returns the most recently generated brief", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/latest`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { brief: { id: string } | null };
  assert.equal(body.brief?.id, firstBriefId);
});

let secondBriefId: string;

test("GET /api/royal-brief lists briefs ordered by most recent first", async () => {
  const genRes = await fetch(`${baseUrl}/api/royal-brief/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(genRes.status, 200);
  const genBody = (await genRes.json()) as { brief: { id: string } };
  secondBriefId = genBody.brief.id;

  const res = await fetch(`${baseUrl}/api/royal-brief?limit=10`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { briefs: Array<{ id: string }> };
  assert.ok(body.briefs.length >= 2);
  const ids = body.briefs.map((b) => b.id);
  assert.ok(ids.indexOf(secondBriefId) < ids.indexOf(firstBriefId), "newest brief should appear first");
});

test("GET /api/royal-brief/:id returns full detail and logs royal_brief_viewed", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/${firstBriefId}`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { brief: { id: string; livingAgentDigest: { items: unknown[] } } };
  assert.equal(body.brief.id, firstBriefId);
  assert.ok(Array.isArray(body.brief.livingAgentDigest.items));

  const audit = await prisma.auditLog.findFirst({
    where: { action: "royal_brief_viewed", resourceId: firstBriefId },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "expected royal_brief_viewed audit log entry");
});

test("GET /api/royal-brief/:id returns 404 for an unknown id", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/does-not-exist`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 404);
});

test("POST /api/royal-brief/:id/archive (KING) archives and logs audit event", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/${secondBriefId}/archive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { brief: { id: string; status: string } };
  assert.equal(body.brief.status, "ARCHIVED");

  const audit = await prisma.auditLog.findFirst({
    where: { action: "royal_brief_archived", resourceId: secondBriefId },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "expected royal_brief_archived audit log entry");
});

test("non-KING roles cannot archive a Royal Brief", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/${firstBriefId}/archive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${scribeToken}` }
  });
  assert.equal(res.status, 403);
});

test("Royal Brief JSON contains no secrets, API keys, or raw provider tokens", async () => {
  const res = await fetch(`${baseUrl}/api/royal-brief/${firstBriefId}`, {
    headers: { Authorization: `Bearer ${kingToken}` }
  });
  const body = (await res.json()) as { brief: unknown };
  const serialized = JSON.stringify(body.brief).toLowerCase();

  assert.ok(!serialized.includes("sk-"), "must not expose API key-like strings");
  assert.ok(!serialized.includes("apikey"));
  assert.ok(!serialized.includes("api_key"));
  assert.ok(!serialized.includes("password"));
  assert.ok(!serialized.includes("refreshtoken"));
  assert.ok(!serialized.includes("runnertoken"));
});
