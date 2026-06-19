import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { ensureDefaultExternalAgents } from "./externalAgentWorkOrderService.js";
import { executeWorkOrderViaProvider } from "./externalAgentExecutionService.js";

async function createKing() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `exec-king-${suffix}@aikingdom.local`, displayName: "Exec King", passwordHash: "test", role: "KING" }
  });
  const session = await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: `exec-token-${suffix}`, expiresAt: new Date(Date.now() + 3600_000) }
  });
  const authUser: AuthUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, sessionId: session.id };
  return { user, token: signAccessToken(authUser) };
}

test("executeWorkOrderViaProvider runs the prompt, stores a report, and moves the order to NEEDS_REVIEW", async () => {
  await ensureDefaultExternalAgents();
  const { user } = await createKing();
  // Use an API-mode agent so this mirrors the auto-execution path.
  const externalAgent = await prisma.externalAgent.create({
    data: {
      name: `Exec Agent ${Date.now()}`,
      type: "CUSTOM",
      roleTitle: "Royal Execution Engineer",
      description: "API execution test agent.",
      capabilities: ["implementation"],
      executionMode: "API",
      isActive: true,
      safetyLevel: "MEDIUM_RISK"
    }
  });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `Exec work ${Date.now()}`,
      objective: "Summarize the dispatch flow and report back.",
      acceptanceCriteria: ["A report is produced"],
      validationCommands: ["npm run test"],
      assignedExternalAgentId: externalAgent.id,
      createdByUserId: user.id,
      status: "IN_PROGRESS"
    }
  });

  try {
    const result = await executeWorkOrderViaProvider(workOrder.id, externalAgent.id, { userId: user.id, actorRole: "KING" });
    assert.ok(result.report, "an implementation report should be created");
    assert.match(result.report.summary, /Auto-executed via/);
    assert.ok(typeof result.modelUsed === "string" && result.modelUsed.length > 0);

    const refreshed = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    assert.equal(refreshed.status, "NEEDS_REVIEW", "submitting a report moves the order to NEEDS_REVIEW");

    const notice = await prisma.notice.findFirst({ where: { sourceType: "work-order-report", sourceId: result.report.id } });
    assert.ok(notice, "the King should be notified of the stored report");
  } finally {
    const reports = await prisma.implementationReport.findMany({ where: { workOrderId: workOrder.id }, select: { id: true } }).catch(() => []);
    const noticeSourceIds = [workOrder.id, ...reports.map((r) => r.id)];
    await prisma.notice.deleteMany({ where: { sourceType: { in: ["work-order-report", "work-order-dispatch"] }, sourceId: { in: noticeSourceIds } } }).catch(() => undefined);
    await prisma.usageRecord.deleteMany({ where: { sourceId: workOrder.id } }).catch(() => undefined);
    await prisma.implementationReport.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.memory.deleteMany({ where: { source: "implementation-report", createdBy: user.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: externalAgent.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
