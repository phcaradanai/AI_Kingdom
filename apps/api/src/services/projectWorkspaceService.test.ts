import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { createArtifact, ensureDefaultProjects, exportProjectObsidian } from "./projectService.js";
import { buildProjectContext } from "./projectContextService.js";
import { confirmInboxAssignment, routeProjectForSource } from "./projectRoutingService.js";

const prisma = new PrismaClient();

async function createUser(role: "KING" | "CROWN_PRINCE" | "MINISTER" | "SCRIBE" = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `m14-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `M14 ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `m14-token-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
  }
}

test("seed projects is idempotent", async () => {
  await ensureDefaultProjects();
  await ensureDefaultProjects();
  const aiKingdom = await prisma.project.findMany({ where: { name: "AI Kingdom" } });
  assert.equal(aiKingdom.length, 1);
  const seeded = await prisma.project.findMany({ where: { name: { in: ["AI Kingdom", "Godot Tower Defense", "Admin Dashboard Boilerplate", "E-commerce Inventory Boilerplate", "Backend Go Services"] } } });
  assert.equal(seeded.length, 5);
});

test("project routing high confidence auto-assigns a task", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Provider registry routing",
      command: "Implement AI Kingdom project routing for provider, agent, work order, artifact, and royal secretary flows.",
      mode: "BUILD",
      status: "PENDING"
    }
  });

  try {
    const result = await routeProjectForSource({ title: task.title, content: task.command, sourceType: "TASK", sourceId: task.id });
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
    assert.equal(result.candidate.status, "CONFIRMED");
    assert.equal(result.inboxItem, null);
    assert.equal(updated.project?.name, "AI Kingdom");
    assert.ok(result.classification.reason.includes("AI Kingdom"));
  } finally {
    await prisma.projectRoutingCandidate.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.projectInboxItem.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("project routing low confidence creates inbox item and leaves source unassigned", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Ambiguous note", command: "Review the next idea and decide where it belongs.", mode: "ASK", status: "PENDING" }
  });

  try {
    const result = await routeProjectForSource({ title: task.title, content: task.command, sourceType: "TASK", sourceId: task.id });
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(result.candidate.status, "NEEDS_REVIEW");
    assert.ok(result.inboxItem);
    assert.equal(result.inboxItem?.status, "PENDING");
    assert.equal(updated.projectId, null);
  } finally {
    await prisma.projectInboxItem.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.projectRoutingCandidate.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("project routing does not create duplicate pending inbox items for the same source", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Ambiguous duplicate note", command: "Review the idea without a clear project match.", mode: "ASK", status: "PENDING" }
  });

  try {
    const first = await routeProjectForSource({ title: task.title, content: task.command, sourceType: "TASK", sourceId: task.id });
    const second = await routeProjectForSource({ title: task.title, content: task.command, sourceType: "TASK", sourceId: task.id });
    assert.equal(first.inboxItem?.id, second.inboxItem?.id);
    const count = await prisma.projectInboxItem.count({ where: { sourceType: "TASK", sourceId: task.id, status: "PENDING" } });
    assert.equal(count, 1);
  } finally {
    await prisma.projectInboxItem.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.projectRoutingCandidate.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("project inbox assignment links source to selected project", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Backend Go Services" } });
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "Ambiguous backend note", command: "Investigate service deployment notes.", mode: "PLAN", status: "PENDING" }
  });
  const inbox = await prisma.projectInboxItem.create({
    data: { sourceType: "TASK", sourceId: task.id, title: task.title, summary: task.command, candidateProjectIds: [project.id], status: "PENDING" }
  });

  try {
    const assigned = await confirmInboxAssignment(inbox.id, project.id);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(assigned.status, "ASSIGNED");
    assert.equal(updated.projectId, project.id);
  } finally {
    await prisma.projectInboxItem.deleteMany({ where: { sourceType: "TASK", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("project context builder returns compact linked context", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const project = await prisma.project.findFirstOrThrow({ where: { name: "AI Kingdom" } });
  const memory = await prisma.memory.create({
    data: { projectId: project.id, type: "DECISION", title: "Keep project routing explainable", content: "Use keyword and alias matching before embeddings.", importance: "HIGH", createdBy: user.id }
  });
  const workOrder = await prisma.workOrder.create({
    data: { projectId: project.id, title: "Context test work order", objective: "Test context", status: "READY", createdByUserId: user.id }
  });

  try {
    const context = await buildProjectContext(project.id);
    assert.match(context, /AI Kingdom/);
    assert.match(context, /Keep project routing explainable/);
    assert.match(context, /Context test work order/);
    assert.ok(context.length <= 5000);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.memory.delete({ where: { id: memory.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("task matter work order and artifact can link to project", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Godot Tower Defense" } });
  const task = await prisma.task.create({ data: { projectId: project.id, createdBy: user.id, title: "Godot task", command: "Tune wave pathing.", mode: "BUILD", status: "PENDING" } });
  const matter = await prisma.matter.create({ data: { projectId: project.id, title: "Godot matter", description: "Review vfx performance.", priority: "HIGH", category: "PRODUCT" } });
  const workOrder = await prisma.workOrder.create({ data: { projectId: project.id, title: "Godot work order", objective: "Implement tower balance.", status: "READY", createdByUserId: user.id } });
  const artifact = await createArtifact({ projectId: project.id, title: "Godot architecture note", type: "ARCHITECTURE_NOTE", content: "Keep pathing state compact.", tags: ["godot"] });

  try {
    assert.equal(task.projectId, project.id);
    assert.equal(matter.projectId, project.id);
    assert.equal(workOrder.projectId, project.id);
    assert.equal(artifact.projectId, project.id);
  } finally {
    await prisma.artifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("createArtifact does not create duplicate for same normalized title type and source", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const first = await createArtifact({
    title: `Duplicate artifact ${suffix}`,
    type: "IMPLEMENTATION_REPORT",
    content: "first",
    sourceType: "WORK_ORDER",
    sourceId: suffix
  });
  const second = await createArtifact({
    title: `Duplicate   Artifact ${suffix}`,
    type: "IMPLEMENTATION_REPORT",
    content: "second",
    sourceType: "WORK_ORDER",
    sourceId: suffix
  });
  try {
    assert.equal(first.id, second.id);
  } finally {
    await prisma.artifact.deleteMany({ where: { sourceType: "WORK_ORDER", sourceId: suffix } });
  }
});

test("GET /api/artifacts returns source links where available", async () => {
  await ensureDefaultProjects();
  const { user, token } = await createUser("KING");
  const workOrder = await prisma.workOrder.create({
    data: { title: "Artifact source work order", objective: "Test source label", status: "READY", createdByUserId: user.id }
  });
  const artifact = await createArtifact({
    title: "Artifact with source link",
    type: "SPEC",
    content: "source link test",
    sourceType: "WORK_ORDER",
    sourceId: workOrder.id
  });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/artifacts`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 200);
      const body = await res.json() as { artifacts: Array<{ id: string; sourceLink?: { title: string | null; href: string | null } }> };
      const found = body.artifacts.find((item) => item.id === artifact.id);
      assert.ok(found?.sourceLink);
      assert.equal(found.sourceLink.title, workOrder.title);
      assert.equal(found.sourceLink.href, "/work-orders");
    });
  } finally {
    await prisma.artifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Obsidian export returns markdown payload and redacts secrets", async () => {
  await ensureDefaultProjects();
  const { user } = await createUser("KING");
  const project = await prisma.project.findFirstOrThrow({ where: { name: "Admin Dashboard Boilerplate" } });
  const memory = await prisma.memory.create({
    data: { projectId: project.id, type: "DECISION", title: "Secret redaction test", content: "token=dashboard-secret-value", importance: "HIGH", createdBy: user.id }
  });

  try {
    const exported = await exportProjectObsidian(project.id);
    assert.ok(exported.files["index.md"].includes("[[project-status]]"));
    assert.ok(exported.files["decisions.md"].includes("[REDACTED_SECRET]"));
    assert.equal(JSON.stringify(exported.files).includes("dashboard-secret-value"), false);
  } finally {
    await prisma.memory.delete({ where: { id: memory.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M14 RBAC protects project deletion while allowing minister artifact creation", async () => {
  const king = await createUser("KING");
  const crownPrince = await createUser("CROWN_PRINCE");
  const minister = await createUser("MINISTER");
  const scribe = await createUser("SCRIBE");
  let projectId = "";

  await withServer(async (baseUrl) => {
    const createProject = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${crownPrince.token}` },
      body: JSON.stringify({ name: `M14 RBAC ${Date.now()}`, description: "RBAC test", keywords: ["m14-rbac"] })
    });
    assert.equal(createProject.status, 201);
    const createBody = await createProject.json() as { project: { id: string } };
    projectId = createBody.project.id;

    const ministerProjectCreate = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minister.token}` },
      body: JSON.stringify({ name: "Denied project" })
    });
    assert.equal(ministerProjectCreate.status, 403);

    const scribeArtifact = await fetch(`${baseUrl}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${scribe.token}` },
      body: JSON.stringify({ title: "Denied artifact", content: "No write access" })
    });
    assert.equal(scribeArtifact.status, 403);

    const ministerArtifact = await fetch(`${baseUrl}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minister.token}` },
      body: JSON.stringify({ projectId, title: "Minister artifact", content: "Minister can create artifacts.", tags: ["rbac"] })
    });
    assert.equal(ministerArtifact.status, 201);

    const crownDelete = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${crownPrince.token}` }
    });
    assert.equal(crownDelete.status, 403);

    const kingDelete = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${king.token}` }
    });
    assert.equal(kingDelete.status, 204);
  });

  await prisma.artifact.deleteMany({ where: { projectId } });
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: king.user.id } });
  await prisma.user.delete({ where: { id: crownPrince.user.id } });
  await prisma.user.delete({ where: { id: minister.user.id } });
  await prisma.user.delete({ where: { id: scribe.user.id } });
});
