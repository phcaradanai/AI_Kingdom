import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import type { ExternalAgent, User, UserRole, WorkOrder } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;

let king: User;
let crownPrince: User;
let minister: User;
let kingToken: string;
let crownPrinceToken: string;
let ministerToken: string;
let externalAgent: ExternalAgent;
let workOrder: WorkOrder;

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `wo-actions-${role.toLowerCase()}-${suffix}@aikingdom.local`,
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

function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  };
}

before(async () => {
  const app = createApp();
  server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  king = await createUser("KING");
  crownPrince = await createUser("CROWN_PRINCE");
  minister = await createUser("MINISTER");
  kingToken = await login(king.email);
  crownPrinceToken = await login(crownPrince.email);
  ministerToken = await login(minister.email);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  externalAgent = await prisma.externalAgent.create({
    data: { name: `WO Actions Test Agent ${suffix}`, roleTitle: "Test Agent", type: "CLAUDE_CODE", isActive: true }
  });
  workOrder = await prisma.workOrder.create({
    data: { title: `WO Actions Test ${suffix}`, objective: "Test objective", status: "READY" }
  });
});

after(async () => {
  server.close();
  await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  await prisma.externalAgent.delete({ where: { id: externalAgent.id } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { userId: { in: [king.id, crownPrince.id, minister.id] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [king.id, crownPrince.id, minister.id] } } }).catch(() => undefined);
  await prisma.$disconnect();
});

// — assign-external-agent —

test("POST /work-orders/:id/assign-external-agent — 404 for unknown work order", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/nonexistent-id/assign-external-agent`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ externalAgentId: externalAgent.id }) })
  );
  assert.equal(res.status, 404);
});

test("POST /work-orders/:id/assign-external-agent — 403 for MINISTER", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/assign-external-agent`,
    authed(ministerToken, { method: "POST", body: JSON.stringify({ externalAgentId: externalAgent.id }) })
  );
  assert.equal(res.status, 403);
});

test("POST /work-orders/:id/assign-external-agent — KING persists assignedExternalAgentId", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/assign-external-agent`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ externalAgentId: externalAgent.id }) })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { workOrder: { assignedExternalAgentId: string | null; assignedExternalAgent: { id: string } | null } };
  assert.equal(body.workOrder.assignedExternalAgentId, externalAgent.id);
  assert.equal(body.workOrder.assignedExternalAgent?.id, externalAgent.id);

  const db = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
  assert.equal(db.assignedExternalAgentId, externalAgent.id);
});

test("POST /work-orders/:id/assign-external-agent — CROWN_PRINCE can assign", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/assign-external-agent`,
    authed(crownPrinceToken, { method: "POST", body: JSON.stringify({ externalAgentId: null }) })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { workOrder: { assignedExternalAgentId: string | null } };
  assert.equal(body.workOrder.assignedExternalAgentId, null);
});

test("POST /work-orders/:id/assign-external-agent — audit log is recorded", async () => {
  await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/assign-external-agent`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ externalAgentId: externalAgent.id }) })
  );
  const log = await prisma.auditLog.findFirst({
    where: { userId: king.id, action: "assign_external_agent", resourceId: workOrder.id },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(log, "audit log must be created for assign_external_agent");
});

// — archive-completed —

test("POST /work-orders/:id/archive-completed — 404 for unknown work order", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/nonexistent-id/archive-completed`,
    authed(kingToken, { method: "POST" })
  );
  assert.equal(res.status, 404);
});

test("POST /work-orders/:id/archive-completed — 403 for MINISTER", async () => {
  const res = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/archive-completed`,
    authed(ministerToken, { method: "POST" })
  );
  assert.equal(res.status, 403);
});

test("POST /work-orders/:id/archive-completed — KING archives with correct fields", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const target = await prisma.workOrder.create({
    data: { title: `WO Archive Test ${suffix}`, objective: "Test", status: "IN_PROGRESS" }
  });
  try {
    const res = await fetch(
      `${baseUrl}/api/work-orders/${target.id}/archive-completed`,
      authed(kingToken, { method: "POST" })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workOrder: { status: string; workQuality: string | null; archiveReason: string | null; archivedAt: string | null } };
    assert.equal(body.workOrder.status, "ARCHIVED");
    assert.equal(body.workOrder.workQuality, "COMPLETED_ARCHIVE");
    assert.equal(body.workOrder.archiveReason, "Manually archived as completed by King");
    assert.ok(body.workOrder.archivedAt, "archivedAt must be set");

    const db = await prisma.workOrder.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(db.status, "ARCHIVED");
    assert.equal(db.workQuality, "COMPLETED_ARCHIVE");
    assert.equal(db.archiveReason, "Manually archived as completed by King");
    assert.ok(db.archivedAt, "archivedAt must be persisted");
  } finally {
    await prisma.workOrder.delete({ where: { id: target.id } }).catch(() => undefined);
  }
});

test("POST /work-orders/:id/archive-completed — CROWN_PRINCE can archive", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const target = await prisma.workOrder.create({
    data: { title: `WO Crown Archive Test ${suffix}`, objective: "Test", status: "READY" }
  });
  try {
    const res = await fetch(
      `${baseUrl}/api/work-orders/${target.id}/archive-completed`,
      authed(crownPrinceToken, { method: "POST" })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workOrder: { status: string } };
    assert.equal(body.workOrder.status, "ARCHIVED");
  } finally {
    await prisma.workOrder.delete({ where: { id: target.id } }).catch(() => undefined);
  }
});

test("POST /work-orders/:id/archive-completed — archived WO excluded from default GET /work-orders", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const target = await prisma.workOrder.create({
    data: { title: `WO Exclude Archive Test ${suffix}`, objective: "Test", status: "DRAFT" }
  });
  try {
    await fetch(`${baseUrl}/api/work-orders/${target.id}/archive-completed`, authed(kingToken, { method: "POST" }));

    const listRes = await fetch(`${baseUrl}/api/work-orders`, authed(kingToken));
    const listBody = (await listRes.json()) as { workOrders: { id: string }[] };
    assert.ok(!listBody.workOrders.some((o) => o.id === target.id), "archived WO must not appear in default list");
  } finally {
    await prisma.workOrder.delete({ where: { id: target.id } }).catch(() => undefined);
  }
});

test("POST /work-orders/:id/archive-completed — audit log is recorded", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const target = await prisma.workOrder.create({
    data: { title: `WO Audit Archive Test ${suffix}`, objective: "Test", status: "DRAFT" }
  });
  try {
    await fetch(`${baseUrl}/api/work-orders/${target.id}/archive-completed`, authed(kingToken, { method: "POST" }));
    const log = await prisma.auditLog.findFirst({
      where: { userId: king.id, action: "archive_completed_work_order", resourceId: target.id },
      orderBy: { createdAt: "desc" }
    });
    assert.ok(log, "audit log must be created for archive_completed_work_order");
  } finally {
    await prisma.workOrder.delete({ where: { id: target.id } }).catch(() => undefined);
  }
});
