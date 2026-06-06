import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signAccessToken, type AuthUser } from "../middleware/auth.js";
import { processTaskWithGrandVizier } from "./grandVizierOrchestrator.js";

const prisma = new PrismaClient();

async function withTestServer(fn: (baseUrl: string, token: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `api-king-${suffix}@aikingdom.local`,
      displayName: "Test King",
      passwordHash: "test",
      role: "KING"
    }
  });
  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `test-token-${suffix}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = (address as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      sessionId: session.id
    };
    const token = signAccessToken(authUser);
    await fn(baseUrl, token);
  } finally {
    server.close();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

test("agent prompt can be updated through API", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const agent = await prisma.agent.create({
    data: {
      slug: `prompt-agent-${suffix}`,
      name: "Prompt Agent",
      title: "Prompt Agent",
      role: "Tester",
      specialty: "Prompt tests",
      prompt: "Initial prompt",
      systemPrompt: "Initial prompt",
      skills: ["testing"],
      responseStyle: "concise"
    }
  });

  await withTestServer(async (baseUrl, token) => {
    const response = await fetch(`${baseUrl}/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ systemPrompt: "Updated royal prompt" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.agent.systemPrompt, "Updated royal prompt");
  });

  await prisma.agent.delete({ where: { id: agent.id } });
});

test("settings API never returns API keys and Grand Vizier cannot be deleted", async () => {
  const grandVizier = await prisma.agent.findUniqueOrThrow({ where: { slug: "grand-vizier" } });

  await withTestServer(async (baseUrl, token) => {
    const settings = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const settingsBody = await settings.json();
    assert.equal(settings.status, 200);
    assert.equal(settingsBody.settings.some((setting: { key: string }) => setting.key.includes("API_KEY")), false);

    const deletion = await fetch(`${baseUrl}/api/agents/${grandVizier.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const deletionBody = await deletion.json();
    assert.equal(deletion.status, 400);
    assert.match(deletionBody.error, /Grand Vizier/);
  });
});

test("deactivating a required agent prevents selection", async () => {
  const user = await prisma.user.create({
    data: {
      email: `inactive-agent-${Date.now()}@aikingdom.local`,
      displayName: "Inactive Agent King",
      passwordHash: "test"
    }
  });
  const architect = await prisma.agent.findUniqueOrThrow({ where: { slug: "royal-architect" } });
  const originalActive = architect.isActive;
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Inactive agent check",
      command: "Ask for architecture advice while the architect is inactive.",
      mode: "ASK",
      status: "PENDING"
    }
  });

  try {
    await prisma.agent.update({ where: { id: architect.id }, data: { isActive: false } });
    await assert.rejects(() => processTaskWithGrandVizier(task.id, user.id), /Required royal agents/);
  } finally {
    await prisma.agent.update({ where: { id: architect.id }, data: { isActive: originalActive } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("AUTO_GENERATE_REPORTS setting affects orchestrator behavior", async () => {
  const user = await prisma.user.create({
    data: {
      email: `settings-report-${Date.now()}@aikingdom.local`,
      displayName: "Settings King",
      passwordHash: "test"
    }
  });
  const setting = await prisma.setting.findUniqueOrThrow({ where: { key: "AUTO_GENERATE_REPORTS" } });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "No report setting",
      command: "Plan a council response without generating a report.",
      mode: "PLAN",
      status: "PENDING"
    }
  });

  try {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: "false" } });
    const session = await processTaskWithGrandVizier(task.id, user.id);
    const report = await prisma.report.findFirst({ where: { sourceCouncilSessionId: session.id } });
    assert.equal(report, null);
  } finally {
    await prisma.setting.update({ where: { key: setting.key }, data: { value: setting.value } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
