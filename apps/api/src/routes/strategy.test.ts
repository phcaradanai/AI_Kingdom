import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";

assertSafeTestDatabase();

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = (address as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function createUser(role: UserRole) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.user.create({
    data: {
      email: `strategy-${role.toLowerCase()}-${suffix}@aikingdom.local`,
      displayName: `${role} Strategy Tester`,
      passwordHash: await bcrypt.hash("StrongPass123", 12),
      role,
      isActive: true
    }
  });
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" })
  });
  const body = (await response.json().catch(() => null)) as { token?: string } | null;
  return body?.token;
}

test("KING can manage strategy ledger records and create a manual opportunity work order", async () => {
  const king = await createUser("KING");
  const sourceId = `strategy-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, king.email);
      assert.ok(token);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const objectiveRes = await fetch(`${baseUrl}/api/strategy/objectives`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Build reusable AI orchestration research",
          description: "Create a reusable source of truth for orchestration strategy.",
          priority: "HIGH",
          sourceType: "TEST",
          sourceId,
          tags: ["strategy", "orchestration"]
        })
      });
      assert.equal(objectiveRes.status, 201);
      const objectiveBody = (await objectiveRes.json()) as { objective: { id: string; status: string } };
      assert.ok(objectiveBody.objective.id);
      assert.equal(objectiveBody.objective.status, "ACTIVE");

      const assetRes = await fetch(`${baseUrl}/api/strategy/assets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "AI Orchestration Research Pack",
          type: "KNOWLEDGE",
          status: "ACTIVE",
          valueHypothesis: "Reusable research shortens future planning work.",
          monthlyRevenueEstimate: 500,
          monthlyCostEstimate: 50,
          sourceType: "TEST",
          sourceId
        })
      });
      assert.equal(assetRes.status, 201);
      const assetBody = (await assetRes.json()) as { asset: { id: string } };

      const revenueRes = await fetch(`${baseUrl}/api/strategy/revenue-streams`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Research Pack Subscription",
          assetId: assetBody.asset.id,
          model: "SUBSCRIPTION",
          status: "TESTING",
          monthlyRevenue: 300,
          monthlyCost: 25,
          sourceType: "TEST",
          sourceId
        })
      });
      assert.equal(revenueRes.status, 201);

      const opportunityRes = await fetch(`${baseUrl}/api/strategy/opportunities`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          objectiveId: objectiveBody.objective.id,
          assetId: assetBody.asset.id,
          title: "Validate orchestration research offer",
          problem: "Kingdom needs repeatable research and strategic evidence.",
          proposedValue: "Package repeatable AI orchestration research into a validated offer.",
          targetCustomer: "AI builders",
          priority: "HIGH",
          riskLevel: "MEDIUM",
          score: 82,
          estimatedMonthlyRevenue: 1200,
          nextAction: "Interview three target users and define success criteria.",
          sourceType: "TEST",
          sourceId
        })
      });
      assert.equal(opportunityRes.status, 201);
      const opportunityBody = (await opportunityRes.json()) as { opportunity: { id: string; score: number } };
      assert.equal(opportunityBody.opportunity.score, 82);

      const artifact = await prisma.artifact.create({
        data: {
          title: "AI orchestration market research",
          type: "MARKET_RESEARCH",
          content: "Builders need a repeatable way to evaluate orchestration platforms, agent routing, and handoff governance.",
          sourceType: "TEST",
          sourceId,
          tags: ["orchestration", "research"]
        }
      });

      const intakeRes = await fetch(`${baseUrl}/api/strategy/intake/artifacts/${artifact.id}/opportunity`, {
        method: "POST",
        headers
      });
      assert.equal(intakeRes.status, 201);
      const intakeBody = (await intakeRes.json()) as { status: string; opportunity: { id: string; sourceType: string; sourceId: string } };
      assert.equal(intakeBody.status, "CREATED");
      assert.equal(intakeBody.opportunity.sourceType, "ARTIFACT");
      assert.equal(intakeBody.opportunity.sourceId, artifact.id);

      const duplicateIntakeRes = await fetch(`${baseUrl}/api/strategy/intake/artifacts/${artifact.id}/opportunity`, {
        method: "POST",
        headers
      });
      assert.equal(duplicateIntakeRes.status, 200);
      const duplicateIntakeBody = (await duplicateIntakeRes.json()) as { status: string; opportunity: { id: string } };
      assert.equal(duplicateIntakeBody.status, "EXISTING");
      assert.equal(duplicateIntakeBody.opportunity.id, intakeBody.opportunity.id);

      const overviewRes = await fetch(`${baseUrl}/api/strategy/overview`, { headers });
      assert.equal(overviewRes.status, 200);
      const overviewBody = (await overviewRes.json()) as { overview: { revenue: { monthlyNet: number }; opportunities: { top: Array<{ id: string }> } } };
      assert.ok(overviewBody.overview.revenue.monthlyNet >= 275);
      assert.equal(overviewBody.overview.opportunities.top.some((item) => item.id === opportunityBody.opportunity.id), true);

      const workOrderRes = await fetch(`${baseUrl}/api/strategy/opportunities/${opportunityBody.opportunity.id}/work-order`, {
        method: "POST",
        headers
      });
      assert.equal(workOrderRes.status, 201);
      const workOrderBody = (await workOrderRes.json()) as { workOrder: { id: string; sourceType: string; sourceId: string; status: string } };
      assert.equal(workOrderBody.workOrder.sourceType, "KINGDOM_OPPORTUNITY");
      assert.equal(workOrderBody.workOrder.sourceId, opportunityBody.opportunity.id);
      assert.equal(["DRAFT", "READY"].includes(workOrderBody.workOrder.status), true);
    });
  } finally {
    await prisma.workOrder.deleteMany({ where: { sourceType: "KINGDOM_OPPORTUNITY", title: { contains: "Validate orchestration research offer" } } }).catch(() => undefined);
    await prisma.opportunityExperiment.deleteMany({ where: { opportunity: { sourceId } } }).catch(() => undefined);
    await prisma.kingdomOpportunity.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.revenueStream.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.kingdomAsset.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.successMetric.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.kingdomObjective.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.artifact.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { userId: king.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: king.id } }).catch(() => undefined);
  }
});

test("SCRIBE can read the strategy ledger but cannot mutate it", async () => {
  const scribe = await createUser("SCRIBE");
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, scribe.email);
      assert.ok(token);
      const readRes = await fetch(`${baseUrl}/api/strategy/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(readRes.status, 200);

      const writeRes = await fetch(`${baseUrl}/api/strategy/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Blocked strategy write" })
      });
      assert.equal(writeRes.status, 403);
    });
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: scribe.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: scribe.id } }).catch(() => undefined);
  }
});
