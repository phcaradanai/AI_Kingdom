import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient, type Project, type User, type UserRole, type WorkOrder } from "@prisma/client";
import { createApp } from "../app.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "../services/localDocumentAccessService.js";

const prisma = new PrismaClient();

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;

let king: User;
let minister: User;
let kingToken: string;
let ministerToken: string;
let project: Project;
let workOrder: WorkOrder;
let repoDir: string;

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `wo-context-${role.toLowerCase()}-${suffix}@aikingdom.local`,
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
  minister = await createUser("MINISTER");
  kingToken = await login(king.email);
  ministerToken = await login(minister.email);

  project = await prisma.project.create({ data: { name: `WO Context Route Test ${randomUUID()}` } });
  repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "wo-context-route-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# WO Context Route Test Repo");
  const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
  await scanLocalDocumentRoot(root.id);

  workOrder = await prisma.workOrder.create({
    data: { title: `WO Context Route ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
  });
});

after(async () => {
  server.close();
  await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { userId: { in: [king.id, minister.id] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [king.id, minister.id] } } }).catch(() => undefined);
  await fs.rm(repoDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

test("GET /work-orders/:id/context is readable by authenticated roles and does not mutate state", async () => {
  const before1 = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });

  const res = await fetch(`${baseUrl}/api/work-orders/${workOrder.id}/context`, authed(ministerToken));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { context: { contextBindingStatus: string; current: { status: string; lines: string[] } | null } };
  assert.equal(body.context.contextBindingStatus, "MISSING", "unbound work order starts MISSING");
  assert.equal(body.context.current?.status, "FRESH", "live project context is FRESH after the scan");
  assert.ok((body.context.current?.lines.length ?? 0) > 0);

  const healthRes = await fetch(`${baseUrl}/api/projects/${project.id}/context-health`, authed(ministerToken));
  assert.equal(healthRes.status, 200);
  const health = (await healthRes.json()) as { status: string; openWorkOrders: Array<{ id: string; boundToLatestSnapshot: boolean }> };
  assert.equal(health.status, "FRESH");
  const openWO = health.openWorkOrders.find((w) => w.id === workOrder.id);
  assert.ok(openWO, "open work order must be listed in context health");
  assert.equal(openWO!.boundToLatestSnapshot, false, "unbound work order is not bound to the latest snapshot");

  // GET routes must not mutate context.
  const after1 = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
  assert.equal(after1.contextBindingStatus, before1.contextBindingStatus);
  assert.equal(after1.contextBoundAt?.toISOString() ?? null, before1.contextBoundAt?.toISOString() ?? null);
  assert.equal(after1.localDocumentSnapshotId, before1.localDocumentSnapshotId);
});

test("bind-context and mark-context-stale are KING/CROWN_PRINCE only", async () => {
  const bindForbidden = await fetch(`${baseUrl}/api/work-orders/${workOrder.id}/bind-context`, authed(ministerToken, { method: "POST" }));
  assert.equal(bindForbidden.status, 403);

  const staleForbidden = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/mark-context-stale`,
    authed(ministerToken, { method: "POST", body: JSON.stringify({ reason: "nope" }) })
  );
  assert.equal(staleForbidden.status, 403);
});

test("KING can bind context (FRESH), mark it stale, and rebind to FRESH", async () => {
  const bindRes = await fetch(`${baseUrl}/api/work-orders/${workOrder.id}/bind-context`, authed(kingToken, { method: "POST" }));
  assert.equal(bindRes.status, 200);
  const bound = (await bindRes.json()) as { workOrder: { contextBindingStatus: string; localDocumentSnapshotId: string | null }; binding: { status: string } | null };
  assert.equal(bound.workOrder.contextBindingStatus, "FRESH");
  assert.ok(bound.workOrder.localDocumentSnapshotId, "binding must record the snapshot id");
  assert.equal(bound.binding?.status, "FRESH");

  const healthRes = await fetch(`${baseUrl}/api/projects/${project.id}/context-health`, authed(kingToken));
  const health = (await healthRes.json()) as { openWorkOrders: Array<{ id: string; boundToLatestSnapshot: boolean }> };
  assert.equal(health.openWorkOrders.find((w) => w.id === workOrder.id)?.boundToLatestSnapshot, true);

  const staleRes = await fetch(
    `${baseUrl}/api/work-orders/${workOrder.id}/mark-context-stale`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ reason: "Manual stale for test" }) })
  );
  assert.equal(staleRes.status, 200);
  const stale = (await staleRes.json()) as { workOrder: { contextBindingStatus: string } };
  assert.equal(stale.workOrder.contextBindingStatus, "STALE");

  const rebindRes = await fetch(`${baseUrl}/api/work-orders/${workOrder.id}/bind-context`, authed(kingToken, { method: "POST" }));
  assert.equal(rebindRes.status, 200);
  const rebound = (await rebindRes.json()) as { workOrder: { contextBindingStatus: string } };
  assert.equal(rebound.workOrder.contextBindingStatus, "FRESH");
});

test("SANDBOX_PATCH automation job is rejected over HTTP while context is missing", async () => {
  const blockedProject = await prisma.project.create({ data: { name: `Blocked Project ${randomUUID()}` } });
  const blockedWO = await prisma.workOrder.create({
    data: { title: `Blocked Route WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: blockedProject.id }
  });
  const blockedDir = await fs.mkdtemp(path.join(os.tmpdir(), "wo-context-blocked-"));
  await fs.writeFile(path.join(blockedDir, "README.md"), "# Blocked");
  await createLocalDocumentRoot(blockedProject.id, { name: "repo", rootPath: blockedDir }); // never scanned → MISSING
  try {
    const res = await fetch(
      `${baseUrl}/api/work-orders/${blockedWO.id}/automation-job`,
      authed(kingToken, { method: "POST", body: JSON.stringify({ mode: "SANDBOX_PATCH" }) })
    );
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string; code?: string };
    assert.equal(body.code, "CONTEXT_BINDING");
    assert.match(body.error, /SANDBOX_PATCH refused/);
  } finally {
    await prisma.workOrder.delete({ where: { id: blockedWO.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: blockedProject.id } }).catch(() => undefined);
    await fs.rm(blockedDir, { recursive: true, force: true });
  }
});
