import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import {
  buildExternalAgentPrompt,
  createHandoffBrief,
  createImplementationReport,
  dispatchWorkOrder,
  ensureDefaultExternalAgents,
  generateWorkOrderFromMatter,
  generateWorkOrderFromTask
} from "./externalAgentWorkOrderService.js";
import { createLocalDocumentRoot, scanLocalDocumentRoot } from "./localDocumentAccessService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";


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

test("build prompt surfaces planner fileHints from provenance instead of keyword guess", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CLAUDE_CODE" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Add health version field",
      objective: "Return the build version from the health endpoint",
      context: "Backend work order context",
      instructions: "Update the route and tests.",
      constraints: "Do not expose secrets.",
      acceptanceCriteria: ["Endpoint returns version"],
      validationCommands: ["npm run typecheck"],
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "READY",
      provenance: {
        executionMetadata: {
          riskLevel: "LOW",
          fileHints: ["apps/api/src/routes/health.ts", "apps/api/src/services/healthService.ts"]
        }
      }
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.match(prompt, /## Files Likely Involved/);
    assert.match(prompt, /apps\/api\/src\/routes\/health\.ts/);
    assert.match(prompt, /apps\/api\/src\/services\/healthService\.ts/);
    // The naive keyword fallback would have emitted the generic "Inspect the repository"
    // line; concrete hints must replace it.
    assert.equal(prompt.includes("Inspect the repository to identify the smallest relevant file set."), false);
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

test("dispatchWorkOrder assigns agent, builds prompt, moves order to IN_PROGRESS, and notifies the King", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CLAUDE_CODE" } });

  // EXTERNAL_AGENT mode requires a project with FRESH local document context.
  const project = await prisma.project.create({ data: { name: `Dispatch Test Project ${Date.now()}` } });
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-test-"));
  await fs.writeFile(path.join(repoDir, "README.md"), "# Dispatch Fixture");

  let workOrderId: string | null = null;
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: repoDir });
    await scanLocalDocumentRoot(root.id);

    const workOrder = await prisma.workOrder.create({
      data: {
        title: "Dispatch flow work",
        objective: "Exercise one-step dispatch",
        acceptanceCriteria: ["Order is dispatched"],
        validationCommands: ["npm run test"],
        createdByUserId: user.id,
        status: "DRAFT",
        projectId: project.id
      }
    });
    workOrderId = workOrder.id;
    await bindFreshContextToWorkOrder(workOrder.id);

    const result = await dispatchWorkOrder(workOrder.id, externalAgent.id);
    assert.equal(result.workOrder.assignedExternalAgentId, externalAgent.id);
    assert.equal(result.workOrder.status, "IN_PROGRESS");
    assert.match(result.prompt, /Work Order/);

    const dispatchNotice = await prisma.notice.findFirst({
      where: { sourceType: "work-order-dispatch", sourceId: workOrder.id }
    });
    assert.ok(dispatchNotice, "a dispatch notice should be created for the King");
  } finally {
    if (workOrderId) await prisma.notice.deleteMany({ where: { sourceId: workOrderId } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("createImplementationReport notifies the King when an external agent reports back", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "Report notification work",
      objective: "Notify the King on report",
      acceptanceCriteria: ["King is notified"],
      validationCommands: ["npm run test"],
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "IN_PROGRESS"
    }
  });

  try {
    const report = await createImplementationReport({
      workOrderId: workOrder.id,
      externalAgentId: externalAgent.id,
      summary: "Completed the requested change",
      filesChanged: ["apps/api/src/routes/workOrders.ts"],
      testResult: "PASSED"
    });

    const notice = await prisma.notice.findFirst({
      where: { sourceType: "work-order-report", sourceId: report.id }
    });
    assert.ok(notice, "a completion notice should be created for the King");
    assert.match(notice!.title, /Work complete/);
  } finally {
    await prisma.notice.deleteMany({ where: { sourceType: "work-order-report" } });
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

test("M24 Phase B: retry prompt threads the prior attempt's reviewer feedback", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  // autoRetryCount > 0 marks this as a retry, which triggers the prior-attempt section.
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M24B retry feedback",
      objective: "Re-attempt after a failed run",
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "NEEDS_REVIEW",
      autoRetryCount: 1
    }
  });
  const job = await prisma.automationJob.create({
    data: { workOrderId: workOrder.id, status: "CANCELLED", mode: "EXTERNAL_AGENT" }
  });
  await prisma.agentReviewSummary.create({
    data: {
      automationJobId: job.id,
      workOrderId: workOrder.id,
      verdict: "VALIDATION_FAILED",
      confidence: "HIGH",
      kingRecommendation: "REQUEST_REVISION",
      summary: "Tests failed on the first attempt.",
      whatFailed: ["npm run test exited non-zero"],
      failedCommands: ["npm run test"],
      externalAgentPrompt: "Fix the failing assertion in foo.test.ts before re-running."
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.match(prompt, /## Prior Attempt — Fix These Before Retrying/);
    assert.match(prompt, /verdict: VALIDATION_FAILED/);
    assert.match(prompt, /npm run test exited non-zero/);
    assert.match(prompt, /Fix the failing assertion in foo\.test\.ts/);
  } finally {
    await prisma.agentReviewSummary.deleteMany({ where: { workOrderId: workOrder.id } });
    await prisma.automationJob.delete({ where: { id: job.id } });
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M24 Phase B: a first attempt (autoRetryCount=0) has no prior-attempt section", async () => {
  const { user } = await createUser("KING");
  const externalAgent = await prisma.externalAgent.findFirstOrThrow({ where: { type: "CODEX" } });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: "M24B first attempt",
      objective: "Initial run",
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "READY"
    }
  });

  try {
    const prompt = await buildExternalAgentPrompt(workOrder.id, externalAgent.id);
    assert.doesNotMatch(prompt, /Prior Attempt/);
  } finally {
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
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

// ---- M18A-3 handoff dedup tests ----

import { createWorkOrder } from "./externalAgentWorkOrderService.js";

async function makeCompletedTaskWithSession(userId: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const task = await prisma.task.create({
    data: { createdBy: userId, title: `M18A-3 Handoff Route Task ${suffix}`, command: "cmd", mode: "BUILD", status: "COMPLETED" }
  });
  const session = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", finalSummary: "Done" }
  });
  return { task, session };
}

async function cleanupHandoffRouteFixture(opts: { taskId?: string; userId?: string }) {
  if (opts.taskId) {
    await prisma.handoffBrief.deleteMany({ where: { workOrder: { sourceId: opts.taskId } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_HANDOFF", sourceId: opts.taskId } }).catch(() => undefined);
    await prisma.councilSession.deleteMany({ where: { taskId: opts.taskId } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: opts.taskId } }).catch(() => undefined);
  }
  if (opts.userId) await prisma.user.delete({ where: { id: opts.userId } }).catch(() => undefined);
}

test("M18A-3: first council handoff creates WO with sourceType=COUNCIL_HANDOFF and sourceId=task.id", async () => {
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "M18A-3 Handoff Dedup Task", command: "Implement dedup", mode: "BUILD", status: "COMPLETED" }
  });
  try {
    const result = await createWorkOrder({
      title: `External Handoff: ${task.title}`,
      objective: "Implement dedup",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task.id,
      status: "READY",
      createdByUserId: user.id,
      provenance: { source: "ROYAL_COMMAND_COUNCIL_HANDOFF", taskId: task.id, councilSessionId: "session-1" }
    }, true);
    assert.equal(result.status, "CREATED");
    assert.ok(result.workOrder);
    assert.equal(result.workOrder.sourceType, "COUNCIL_HANDOFF");
    assert.equal(result.workOrder.sourceId, task.id);
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_HANDOFF", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M18A-3: repeated handoff for same task returns EXISTING work order", async () => {
  const { user } = await createUser("KING");
  const task = await prisma.task.create({
    data: { createdBy: user.id, title: "M18A-3 Repeated Handoff Task", command: "Implement repeated dedup", mode: "BUILD", status: "COMPLETED" }
  });
  try {
    const first = await createWorkOrder({
      title: `External Handoff: ${task.title}`,
      objective: "Implement repeated dedup",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task.id,
      status: "READY",
      createdByUserId: user.id
    }, true);
    assert.equal(first.status, "CREATED");

    // Simulate second session for same task — different councilSessionId, same task.id
    const second = await createWorkOrder({
      title: `External Handoff: ${task.title}`,
      objective: "Implement repeated dedup",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task.id,
      status: "READY",
      createdByUserId: user.id
    }, true);
    assert.equal(second.status, "EXISTING");
    assert.equal(second.workOrder?.id, first.workOrder?.id, "must return same work order");
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_HANDOFF", sourceId: task.id } });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M18A-3: different task with same title creates a separate work order", async () => {
  const { user } = await createUser("KING");
  const titleSuffix = `${Date.now()}`;
  const task1 = await prisma.task.create({
    data: { createdBy: user.id, title: `M18A-3 Shared Title ${titleSuffix}`, command: "cmd", mode: "BUILD", status: "COMPLETED" }
  });
  const task2 = await prisma.task.create({
    data: { createdBy: user.id, title: `M18A-3 Shared Title ${titleSuffix}`, command: "cmd", mode: "BUILD", status: "COMPLETED" }
  });
  try {
    const r1 = await createWorkOrder({
      title: `External Handoff: M18A-3 Shared Title ${titleSuffix}`,
      objective: "cmd",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task1.id,
      status: "READY",
      createdByUserId: user.id
    }, true);
    const r2 = await createWorkOrder({
      title: `External Handoff: M18A-3 Shared Title ${titleSuffix}`,
      objective: "cmd",
      sourceType: "COUNCIL_HANDOFF",
      sourceId: task2.id,
      status: "READY",
      createdByUserId: user.id
    }, true);
    assert.equal(r1.status, "CREATED");
    assert.equal(r2.status, "CREATED");
    assert.notEqual(r1.workOrder?.id, r2.workOrder?.id, "different tasks must produce different work orders");
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "COUNCIL_HANDOFF", sourceId: { in: [task1.id, task2.id] } } });
    await prisma.task.delete({ where: { id: task1.id } }).catch(() => undefined);
    await prisma.task.delete({ where: { id: task2.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("M18A-3 route: first handoff returns 201 with new WO and HandoffBrief", async () => {
  const { user, token } = await createUser("KING");
  const { task, session } = await makeCompletedTaskWithSession(user.id);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/tasks/${task.id}/council/${session.id}/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 201);
      const body = await res.json() as { workOrder: { id: string; sourceType: string; sourceId: string }; handoffBrief: { id: string } };
      assert.equal(body.workOrder.sourceType, "COUNCIL_HANDOFF");
      assert.equal(body.workOrder.sourceId, task.id);
      assert.ok(body.handoffBrief?.id, "should include a handoff brief");
    });
  } finally {
    await cleanupHandoffRouteFixture({ taskId: task.id, userId: user.id });
  }
});

test("M18A-3 route: repeated handoff for same task returns 200 and does not create extra HandoffBrief", async () => {
  const { user, token } = await createUser("KING");
  const { task, session } = await makeCompletedTaskWithSession(user.id);
  try {
    await withServer(async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/tasks/${task.id}/council/${session.id}/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(first.status, 201);
      const firstBody = await first.json() as { workOrder: { id: string } };
      const workOrderId = firstBody.workOrder.id;

      const second = await fetch(`${baseUrl}/api/tasks/${task.id}/council/${session.id}/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(second.status, 200, "repeated handoff should return 200");
      const secondBody = await second.json() as { workOrder: { id: string } };
      assert.equal(secondBody.workOrder.id, workOrderId, "must return the same WO id");

      const briefCount = await prisma.handoffBrief.count({ where: { workOrderId } });
      assert.equal(briefCount, 1, "only one HandoffBrief should exist");
    });
  } finally {
    await cleanupHandoffRouteFixture({ taskId: task.id, userId: user.id });
  }
});

test("M18A-3 route: new session for same task still returns 200 EXISTING WO", async () => {
  const { user, token } = await createUser("KING");
  const { task, session: session1 } = await makeCompletedTaskWithSession(user.id);
  const session2 = await prisma.councilSession.create({
    data: { taskId: task.id, status: "COMPLETED", finalSummary: "Second run" }
  });
  try {
    await withServer(async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/tasks/${task.id}/council/${session1.id}/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(first.status, 201);
      const { workOrder: wo1 } = await first.json() as { workOrder: { id: string } };

      // Different session, same task → should return same WO
      const second = await fetch(`${baseUrl}/api/tasks/${task.id}/council/${session2.id}/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(second.status, 200, "new session for same task should return 200 EXISTING");
      const { workOrder: wo2 } = await second.json() as { workOrder: { id: string } };
      assert.equal(wo2.id, wo1.id, "new session for same task must reuse same WO");

      const briefCount = await prisma.handoffBrief.count({ where: { workOrderId: wo1.id } });
      assert.equal(briefCount, 1, "only one HandoffBrief across both sessions");
    });
  } finally {
    await cleanupHandoffRouteFixture({ taskId: task.id, userId: user.id });
  }
});
