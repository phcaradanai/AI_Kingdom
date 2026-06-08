import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  buildExternalAgentPrompt,
  createHandoffBrief,
  createImplementationReport,
  ensureDefaultExternalAgents,
  generateWorkOrderFromMatter,
  generateWorkOrderFromTask
} from "./externalAgentWorkOrderService.js";

const prisma = new PrismaClient();

async function createUser(role: "KING" | "CROWN_PRINCE" | "MINISTER" | "SCRIBE" = "KING") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `m13-${role.toLowerCase()}-${suffix}@aikingdom.local`, displayName: `M13 ${role}`, passwordHash: "test", role }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `m13-token-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
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

test("seed external agents creates manual handoff targets", async () => {
  await ensureDefaultExternalAgents();
  const agents = await prisma.externalAgent.findMany({ where: { type: { in: ["CLAUDE_CODE", "CODEX", "CLINE", "KILO", "ANTIGRAVITY", "HERMES"] } } });
  assert.ok(agents.length >= 6);
  assert.equal(agents.every((agent) => agent.executionMode === "MANUAL_COPY_PASTE"), true);
});

test("create work order and build prompt includes required sections without secrets", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Implement safe prompt",
      objective: "Add prompt safety for token=super-secret-value",
      context: "Backend work order context",
      instructions: "Update the service and tests.",
      constraints: "Do not expose secrets.",
      acceptanceCriteria: ["Prompt includes objective", "Prompt includes final report format"],
      validationCommands: ["npm run typecheck", "npm run test"],
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.match(prompt, /# Work Order: Implement safe prompt/);
    assert.match(prompt, /## Objective/);
    assert.match(prompt, /## Constraints/);
    assert.match(prompt, /## Acceptance Criteria/);
    assert.match(prompt, /## Validation Commands/);
    assert.match(prompt, /Required Final Response Format/);
    assert.match(prompt, /Do not delete unrelated files/);
    assert.equal(prompt.includes("super-secret-value"), false);
    assert.match(prompt, /\[REDACTED_SECRET\]/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("generate work order from task", async () => {
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "M13 task", command: "Build a handoff page", mode: "BUILD", status: "PENDING" }
  });

  try {
    const result = await generateWorkOrderFromTask(task.id, user.id);
    assert.equal(result.status, "CREATED");
    const workOrder = result.workOrder!;
    assert.equal(workOrder.sourceType, "TASK");
    assert.equal(workOrder.sourceId, task.id);
    assert.equal(workOrder.status, "READY");
    assert.match(workOrder.objective, /Build a handoff page/);
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
  } finally {
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("generate work order from matter", async () => {
  const { user } = await createUser("KING");
  const matter = await prisma.matter.create({
    data: { title: "M13 matter", description: "Resolve external handoff workflow", priority: "HIGH", category: "PRODUCT" }
  });

  try {
    const result = await generateWorkOrderFromMatter(matter.id, user.id);
    assert.equal(result.status, "CREATED");
    const workOrder = result.workOrder!;
    assert.equal(workOrder.sourceType, "MATTER");
    assert.equal(workOrder.sourceId, matter.id);
    assert.equal(workOrder.priority, "HIGH");
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("implementation report can be submitted and handoff brief generated", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M13 report work",
      objective: "Record implementation output",
      acceptanceCriteria: ["Report is stored"],
      validationCommands: ["npm run test"],
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const report = await createImplementationReport({
      workOrderId: workOrder.id,
      externalAgentId: externalAgent.id,
      summary: "Implemented report workflow",
      filesChanged: ["apps/api/src/routes/implementationReports.ts"],
      commandsRun: ["npm run test"],
      testsRun: ["npm run test"],
      testResult: "PASSED",
      decisionsMade: ["Keep external agents manual-only"],
      remainingWork: ["Review UI copy"]
    });
    assert.equal(report.testResult, "PASSED");

    const handoff = await createHandoffBrief(workOrder.id);
    assert.equal(handoff.workOrderId, workOrder.id);
    assert.match(handoff.handoffPrompt, /Handoff Brief/);
    assert.match(handoff.handoffPrompt, /Keep external agents manual-only/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("buildExternalAgentPrompt includes repository context when snapshot exists", async () => {
  const { user } = await createUser("KING");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = await prisma.project.create({
    data: { name: `M15B Test Project ${suffix}`, status: "ACTIVE", priority: "MEDIUM" }
  });
  const snapshot = await prisma.repositorySnapshot.create({
    data: {
      projectId: project.id,
      framework: "Express",
      language: "TypeScript",
      packageManager: "npm",
      prismaModels: ["User", "WorkOrder", "Project"],
      modules: ["src/routes"],
      services: ["src/services/authService.ts"],
      apiRoutes: ["GET /api/users -> src/routes/users.ts"],
      summary: "Express + TypeScript project with 3 Prisma models."
    }
  });
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M15B repo context test",
      objective: "Verify repo context injection",
      projectId: project.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.match(prompt, /## Repository Context/);
    assert.match(prompt, /Snapshot generated at:/);
    assert.match(prompt, /Prisma models:/);
    assert.match(prompt, /- User/);
    assert.match(prompt, /- WorkOrder/);
    assert.match(prompt, /## Context Sources/);
    assert.match(prompt, /Repository snapshot: loaded/);
    assert.match(prompt, /Project metadata: loaded/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.repositorySnapshot.delete({ where: { id: snapshot.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("buildExternalAgentPrompt includes 'not available' note when no snapshot exists", async () => {
  const { user } = await createUser("KING");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = await prisma.project.create({
    data: { name: `M15B No Snapshot Project ${suffix}`, status: "ACTIVE", priority: "MEDIUM" }
  });
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M15B no snapshot test",
      objective: "Verify graceful fallback",
      projectId: project.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.match(prompt, /## Repository Context/);
    assert.match(prompt, /Repository Snapshot: not available/);
    assert.match(prompt, /## Context Sources/);
    assert.match(prompt, /Repository snapshot: missing/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("handoff brief includes repository context when snapshot exists", async () => {
  const { user } = await createUser("KING");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = await prisma.project.create({
    data: { name: `M15B Handoff Project ${suffix}`, status: "ACTIVE", priority: "MEDIUM" }
  });
  const snapshot = await prisma.repositorySnapshot.create({
    data: {
      projectId: project.id,
      framework: "React",
      language: "TypeScript",
      packageManager: "npm",
      prismaModels: ["Task", "Agent"],
      modules: [],
      services: [],
      apiRoutes: [],
      summary: "React TypeScript project."
    }
  });
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M15B handoff repo test",
      objective: "Test handoff repo context",
      projectId: project.id,
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const handoff = await createHandoffBrief(workOrder.id);
    assert.match(handoff.handoffPrompt, /## Repository Context/);
    assert.match(handoff.handoffPrompt, /Prisma models:/);
    assert.match(handoff.handoffPrompt, /- Task/);
    assert.match(handoff.handoffPrompt, /## Context Sources/);
    assert.match(handoff.handoffPrompt, /Repository snapshot: loaded/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.repositorySnapshot.delete({ where: { id: snapshot.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("work order completion creates royal report summary", async () => {
  const { user, token } = await createUser("KING");
  const workOrder = await prisma.workOrder.create({
    data: { title: "M13 completion", objective: "Complete work order", createdByUserId: user.id, status: "READY" }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/work-orders/${workOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "COMPLETED" })
    });
    assert.equal(response.status, 200);
  });

  try {
    const report = await prisma.report.findFirst({ where: { title: "Work Order Report: M13 completion" } });
    assert.ok(report);
  } finally {
    await prisma.report.deleteMany({ where: { title: "Work Order Report: M13 completion" } });
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M13 RBAC allows minister report submission but denies scribe writes and non-king external agent edits", async () => {
  const king = await createUser("KING");
  const minister = await createUser("MINISTER");
  const scribe = await createUser("SCRIBE");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: { title: "M13 RBAC", objective: "Check permissions", createdByUserId: king.user.id, status: "READY" }
  });

  await withServer(async (baseUrl) => {
    const scribeCreate = await fetch(`${baseUrl}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${scribe.token}` },
      body: JSON.stringify({ title: "Denied", objective: "Denied" })
    });
    assert.equal(scribeCreate.status, 403);

    const ministerReport = await fetch(`${baseUrl}/api/implementation-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minister.token}` },
      body: JSON.stringify({ workOrderId: workOrder.id, summary: "Minister submitted report", testResult: "NOT_RUN" })
    });
    assert.equal(ministerReport.status, 201);

    const nonKingAgentEdit = await fetch(`${baseUrl}/api/external-agents/${externalAgent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minister.token}` },
      body: JSON.stringify({ description: "Denied" })
    });
    assert.equal(nonKingAgentEdit.status, 403);
  });

  await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: king.user.id } });
  await prisma.user.delete({ where: { id: minister.user.id } });
  await prisma.user.delete({ where: { id: scribe.user.id } });
});
