import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { PrismaClient, type Project, type User, type UserRole } from "@prisma/client";
import { createApp } from "../app.js";

const prisma = new PrismaClient();

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl: string;

let king: User;
let minister: User;
let kingToken: string;
let ministerToken: string;
let project: Project;
let repoDir: string;

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `local-docs-${role.toLowerCase()}-${suffix}@aikingdom.local`,
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

  project = await prisma.project.create({ data: { name: `Local Docs Route Test ${randomUUID()}` } });

  repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-docs-route-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# Route Test Repo");
  await fs.writeFile(path.join(repoDir, ".env"), "SECRET=do-not-read");
});

after(async () => {
  server.close();
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { userId: { in: [king.id, minister.id] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [king.id, minister.id] } } }).catch(() => undefined);
  await fs.rm(repoDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

let rootId: string;

test("GET /local-docs returns empty roots and no snapshot before configuration", async () => {
  const res = await fetch(`${baseUrl}/api/projects/${project.id}/local-docs`, authed(ministerToken));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { roots: unknown[]; snapshot: unknown };
  assert.deepEqual(body.roots, []);
  assert.equal(body.snapshot, null);
});

test("POST /local-docs/roots is forbidden for MINISTER and allowed for KING", async () => {
  const forbidden = await fetch(
    `${baseUrl}/api/projects/${project.id}/local-docs/roots`,
    authed(ministerToken, { method: "POST", body: JSON.stringify({ name: "repo", rootPath: repoDir }) })
  );
  assert.equal(forbidden.status, 403);

  const created = await fetch(
    `${baseUrl}/api/projects/${project.id}/local-docs/roots`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ name: "repo", rootPath: repoDir }) })
  );
  assert.equal(created.status, 201);
  const root = (await created.json()) as { id: string; rootPathHash: string; isActive: boolean };
  assert.ok(root.id);
  assert.equal(root.rootPathHash.length, 64);
  assert.equal(root.isActive, true);
  rootId = root.id;
});

test("POST /local-docs/roots/:rootId/scan produces a READY snapshot with insights", async () => {
  const scanned = await fetch(
    `${baseUrl}/api/projects/${project.id}/local-docs/roots/${rootId}/scan`,
    authed(kingToken, { method: "POST" })
  );
  assert.equal(scanned.status, 201);
  const snapshot = (await scanned.json()) as { id: string; scanStatus: string; fileCount: number };
  assert.equal(snapshot.scanStatus, "READY");
  assert.ok(snapshot.fileCount >= 1);

  const latest = await fetch(`${baseUrl}/api/projects/${project.id}/local-docs/snapshots/latest`, authed(ministerToken));
  assert.equal(latest.status, 200);
  const latestBody = (await latest.json()) as { snapshot: { id: string } | null };
  assert.equal(latestBody.snapshot?.id, snapshot.id);

  const insightsRes = await fetch(`${baseUrl}/api/projects/${project.id}/local-docs/insights`, authed(ministerToken));
  assert.equal(insightsRes.status, 200);
  const insightsBody = (await insightsRes.json()) as { insights: Array<{ relativePath: string }> };
  assert.ok(insightsBody.insights.some((i) => i.relativePath === "README.md"));
  assert.ok(!insightsBody.insights.some((i) => i.relativePath === ".env"));
});

test("POST /local-docs/read-file is KING only", async () => {
  const res = await fetch(
    `${baseUrl}/api/projects/${project.id}/local-docs/read-file`,
    authed(ministerToken, { method: "POST", body: JSON.stringify({ rootId, relativePath: "README.md" }) })
  );
  assert.equal(res.status, 403);
});

test("KING can read an allowed file and the read is audited", async () => {
  const res = await fetch(
    `${baseUrl}/api/projects/${project.id}/local-docs/read-file`,
    authed(kingToken, { method: "POST", body: JSON.stringify({ rootId, relativePath: "README.md" }) })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { content: string; relativePath: string };
  assert.match(body.content, /Route Test Repo/);

  const audit = await prisma.auditLog.findFirst({
    where: { action: "local_document_file_read", resourceId: rootId, userId: king.id },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "expected a local_document_file_read audit event");
});

test("blocked and traversal reads return 403 and log local_document_file_read_blocked", async () => {
  for (const relativePath of [".env", "../outside.md"]) {
    const res = await fetch(
      `${baseUrl}/api/projects/${project.id}/local-docs/read-file`,
      authed(kingToken, { method: "POST", body: JSON.stringify({ rootId, relativePath }) })
    );
    assert.equal(res.status, 403, `expected 403 for ${relativePath}`);
    const body = (await res.json()) as { content?: string; error?: string };
    assert.equal(body.content, undefined, "blocked read must not return content");
  }

  const blockedAudits = await prisma.auditLog.findMany({
    where: { action: "local_document_file_read_blocked", resourceId: rootId, userId: king.id }
  });
  assert.ok(blockedAudits.length >= 2, "expected blocked-read audit events");
  assert.ok(!JSON.stringify(blockedAudits).includes("do-not-read"), "audit must not leak blocked file contents");
});

test("read-file with a root from another project returns 404", async () => {
  const otherProject = await prisma.project.create({ data: { name: `Other Project ${randomUUID()}` } });
  try {
    const res = await fetch(
      `${baseUrl}/api/projects/${otherProject.id}/local-docs/read-file`,
      authed(kingToken, { method: "POST", body: JSON.stringify({ rootId, relativePath: "README.md" }) })
    );
    assert.equal(res.status, 404);
  } finally {
    await prisma.project.delete({ where: { id: otherProject.id } }).catch(() => undefined);
  }
});
