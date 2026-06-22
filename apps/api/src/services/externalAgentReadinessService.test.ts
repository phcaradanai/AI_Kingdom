import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { getExternalAgentReadiness, requestKingExternalAgentChoice, resolveExternalAgentChoiceMatter, EXTERNAL_AGENT_CHOICE_SOURCE_TYPE } from "./externalAgentReadinessService.js";

const suffix = crypto.randomUUID().slice(0, 8);
let runnerId: string;
let readyAgentId: string;
let cliMissingAgentId: string;
let noBridgeAgentId: string;
let manualAgentId: string;
let workOrderId: string;

before(async () => {
  assertSafeTestDatabase();
  // Online runner reporting CLAUDE_CODE available, CODEX not.
  const runner = await prisma.agentRunner.create({
    data: {
      name: `readiness-runner-${suffix}`,
      status: "ONLINE",
      lastHeartbeatAt: new Date(),
      tokenHash: `hash-${suffix}`,
      agentCapabilities: [
        { type: "CLAUDE_CODE", command: "claude", available: true },
        { type: "CODEX", command: "codex", available: false }
      ],
      capabilitiesUpdatedAt: new Date()
    }
  });
  runnerId = runner.id;

  const mk = (name: string, type: string, bridgeEnabled: boolean, command: string | null) =>
    prisma.externalAgent.create({ data: { name, type: type as never, roleTitle: "Test", bridgeEnabled, command, isActive: true } });

  readyAgentId = (await mk(`ready-${suffix}`, "CLAUDE_CODE", true, "claude -p {PROMPT}")).id;
  cliMissingAgentId = (await mk(`climissing-${suffix}`, "CODEX", true, "codex {PROMPT}")).id;
  noBridgeAgentId = (await mk(`nobridge-${suffix}`, "CLAUDE_CODE", false, "claude")).id;
  manualAgentId = (await mk(`manual-${suffix}`, "MANUAL_ONLY", false, null)).id;

  workOrderId = (await prisma.workOrder.create({
    data: { title: `Readiness WO ${suffix}`, objective: "test", status: "READY" }
  })).id;
});

after(async () => {
  await prisma.matter.deleteMany({ where: { sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE, sourceId: workOrderId } });
  await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
  await prisma.externalAgent.deleteMany({ where: { id: { in: [readyAgentId, cliMissingAgentId, noBridgeAgentId, manualAgentId] } } });
  await prisma.agentRunner.deleteMany({ where: { id: runnerId } });
});

test("agent is ready when config is complete and the runner reports its CLI available", async () => {
  const report = await getExternalAgentReadiness();
  assert.equal(report.runnerOnline, true);
  const a = report.agents.find((x) => x.agentId === readyAgentId)!;
  assert.ok(a);
  assert.equal(a.ready, true);
  assert.equal(a.configReady, true);
  assert.equal(a.runnerAvailable, true);
  assert.equal(a.reason, "ready");
});

test("agent is NOT ready when the runner reports its CLI unavailable", async () => {
  const report = await getExternalAgentReadiness();
  const a = report.agents.find((x) => x.agentId === cliMissingAgentId)!;
  assert.equal(a.ready, false);
  assert.equal(a.configReady, true);
  assert.equal(a.runnerAvailable, false);
  assert.match(a.reason, /CLI not available/);
});

test("agent is NOT ready when bridge execution is disabled, and manual-only is never ready", async () => {
  const report = await getExternalAgentReadiness();
  const noBridge = report.agents.find((x) => x.agentId === noBridgeAgentId)!;
  assert.equal(noBridge.ready, false);
  assert.equal(noBridge.configReady, false);
  assert.match(noBridge.reason, /bridge execution not enabled/);

  const manual = report.agents.find((x) => x.agentId === manualAgentId)!;
  assert.equal(manual.ready, false);
  assert.match(manual.reason, /manual-only/);
});

test("requestKingExternalAgentChoice raises an AWAITING_ROYAL_DECISION matter once, then dedupes", async () => {
  const first = await requestKingExternalAgentChoice({ workOrderId, workOrderTitle: `Readiness WO ${suffix}`, projectId: null });
  assert.equal(first.created, true);
  assert.ok(first.readyAgentNames.includes(`ready-${suffix}`));

  const matter = await prisma.matter.findUnique({ where: { id: first.matterId } });
  assert.ok(matter);
  assert.equal(matter.status, "AWAITING_ROYAL_DECISION");
  assert.equal(matter.sourceType, EXTERNAL_AGENT_CHOICE_SOURCE_TYPE);
  assert.equal(matter.sourceId, workOrderId);

  const second = await requestKingExternalAgentChoice({ workOrderId, workOrderTitle: `Readiness WO ${suffix}`, projectId: null });
  assert.equal(second.created, false);
  assert.equal(second.matterId, first.matterId);

  const count = await prisma.matter.count({ where: { sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE, sourceId: workOrderId } });
  assert.equal(count, 1);
});

test("resolveExternalAgentChoiceMatter closes the open choice matter when the King decides", async () => {
  // ensure one open matter exists
  await requestKingExternalAgentChoice({ workOrderId, workOrderTitle: `Readiness WO ${suffix}`, projectId: null });
  const closed = await resolveExternalAgentChoiceMatter(workOrderId);
  assert.ok(closed >= 1);
  const open = await prisma.matter.count({
    where: { sourceType: EXTERNAL_AGENT_CHOICE_SOURCE_TYPE, sourceId: workOrderId, status: "AWAITING_ROYAL_DECISION" }
  });
  assert.equal(open, 0);
});
