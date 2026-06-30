import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { submitReport } from "./automationJobService.js";

/**
 * Part 4 of the Throne Room execution loop: when an EXTERNAL_AGENT job reports
 * back, the steward's verdict must be folded into the King-facing notice and the
 * outcome must remain review evidence until the King explicitly accepts it.
 */
test("submitReport on an EXTERNAL_AGENT job surfaces the steward verdict without creating pre-approval memory", async () => {
  const king = await prisma.user.create({
    data: { email: `king-${randomUUID()}@aikingdom.local`, passwordHash: "x", role: "KING", displayName: "Sovereign" }
  });
  const steward = await prisma.agent.create({
    data: {
      slug: `architect-${randomUUID()}`,
      name: "Royal Architect",
      title: "Royal Architect",
      role: "architect",
      specialty: "code",
      prompt: "Supervise code work."
    }
  });
  const externalAgent = await prisma.externalAgent.create({
    data: { name: "Claude Code", type: "CLAUDE_CODE", roleTitle: "Royal Senior Engineer", bridgeEnabled: true }
  });
  const project = await prisma.project.create({ data: { name: `Outcome Project ${randomUUID()}` } });
  const runner = await prisma.agentRunner.create({
    data: { name: `Outcome Runner ${randomUUID()}`, status: "ONLINE", tokenHash: randomUUID(), lastHeartbeatAt: new Date() }
  });
  const workOrder = await prisma.workOrder.create({
    data: {
      title: `Refine onboarding banner copy ${randomUUID()}`,
      objective: "Improve the onboarding banner wording",
      status: "IN_PROGRESS",
      projectId: project.id,
      createdByUserId: king.id,
      assignedAgentId: steward.id,
      assignedExternalAgentId: externalAgent.id
    }
  });
  const job = await prisma.automationJob.create({
    data: {
      workOrderId: workOrder.id,
      projectId: project.id,
      mode: "EXTERNAL_AGENT",
      status: "RUNNING",
      runnerId: runner.id
    }
  });
  await prisma.externalAgentRun.create({
    data: {
      externalAgentId: externalAgent.id,
      workOrderId: workOrder.id,
      automationJobId: job.id,
      status: "RUNNING",
      inputPrompt: "Improve the onboarding banner wording."
    }
  });

  try {
    await submitReport(job.id, runner.id, {
      summary: "Updated the onboarding banner copy and verified the build.",
      filesChanged: ["apps/web/src/components/Banner.tsx"],
      commandsRun: ["npm run build"],
      testsRun: [],
      testResult: "PASSED",
      errors: [],
      decisionsMade: [],
      remainingWork: []
    });

    // The steward verdict must be recorded, owned by the assigned steward agent.
    const review = await prisma.agentReviewSummary.findUnique({ where: { automationJobId: job.id } });
    assert.ok(review, "expected an agent review summary to be generated");
    assert.equal(review!.reviewerAgentId, steward.id, "the assigned steward should own the review verdict");

    // The King notice must surface the steward + verdict + recommendation.
    const notice = await prisma.notice.findFirst({
      where: { sourceType: "AutomationJob", sourceId: job.id }
    });
    assert.ok(notice, "expected a King notice for the external agent job");
    assert.match(notice!.content, /Steward: Royal Architect/);
    assert.match(notice!.content, new RegExp(`Verdict: ${review!.verdict}`));
    assert.match(notice!.content, new RegExp(`Recommendation for King: ${review!.kingRecommendation}`));

    // Accept & Learn is the only path allowed to materialize durable learning.
    const memory = await prisma.memory.findFirst({
      where: { createdBy: king.id, source: "external-agent-review", projectId: project.id }
    });
    assert.equal(memory, null, "runner report submission must not create learning before King approval");
  } finally {
    await prisma.memory.deleteMany({ where: { createdBy: king.id } }).catch(() => undefined);
    await prisma.agentReviewSummary.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.implementationReport.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.externalAgentRun.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.notice.deleteMany({ where: { sourceType: "AutomationJob", sourceId: job.id } }).catch(() => undefined);
    await prisma.automationJob.deleteMany({ where: { workOrderId: workOrder.id } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.agentRunner.delete({ where: { id: runner.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
    await prisma.externalAgent.delete({ where: { id: externalAgent.id } }).catch(() => undefined);
    await prisma.agent.delete({ where: { id: steward.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.id } }).catch(() => undefined);
  }
});
