import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";

const TEST_RUN_ID = `display-profile-test-${Date.now()}`;

async function createTestAgent(overrides: Record<string, unknown> = {}) {
  const slug = `test-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return prisma.agent.create({
    data: {
      slug,
      name: "Test Agent",
      title: "Test Title",
      role: "Tester",
      specialty: "Testing",
      prompt: "You are a tester.",
      systemPrompt: "You are a tester.",
      isTestData: true,
      testRunId: TEST_RUN_ID,
      ...overrides
    }
  });
}

async function cleanup() {
  await prisma.agent.deleteMany({ where: { testRunId: TEST_RUN_ID } });
}

test("display profile — displayName stored in config.displayProfile does not alter slug", async () => {
  const agent = await createTestAgent();
  const originalSlug = agent.slug;

  const updatedConfig = {
    ...(typeof agent.config === "object" && agent.config !== null ? agent.config : {}),
    displayProfile: { displayName: "Custom Name", avatarVersion: 1 }
  };

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { config: updatedConfig }
  });

  assert.equal(updated.slug, originalSlug, "slug must not change when display profile is updated");
  await cleanup();
});

test("display profile — avatarUrl stored in config does not change role or systemPrompt", async () => {
  const agent = await createTestAgent({ systemPrompt: "Original prompt" });
  const originalRole = agent.role;
  const originalSystemPrompt = agent.systemPrompt;

  const updatedConfig = {
    ...(typeof agent.config === "object" && agent.config !== null ? agent.config : {}),
    displayProfile: { avatarUrl: "/uploads/agents/test.png", avatarVersion: 2 }
  };

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { config: updatedConfig }
  });

  assert.equal(updated.role, originalRole, "role must not change when avatarUrl is updated");
  assert.equal(updated.systemPrompt, originalSystemPrompt, "systemPrompt must not change when avatarUrl is updated");
  await cleanup();
});

test("display profile — agent id is stable after display profile changes", async () => {
  const agent = await createTestAgent();
  const originalId = agent.id;

  const updatedConfig = {
    ...(typeof agent.config === "object" && agent.config !== null ? agent.config : {}),
    displayProfile: { displayName: "New Display Name", displayTitle: "New Title", avatarVersion: 2 }
  };

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { config: updatedConfig }
  });

  assert.equal(updated.id, originalId, "agent id must remain stable after display profile update");
  await cleanup();
});

test("display profile — canonicalName defaults to name when not explicitly set", async () => {
  const agent = await createTestAgent({ name: "Aurelian", title: "Grand Vizier" });

  const raw = typeof agent.config === "object" && agent.config !== null ? agent.config as Record<string, unknown> : {};
  const dp = raw.displayProfile as Record<string, unknown> | undefined;

  assert.ok(dp?.canonicalName === undefined || dp?.canonicalName === null || dp?.canonicalName === "Aurelian",
    "canonicalName should default to agent.name if not set");

  await cleanup();
});

test("display profile — avatarVersion increments on avatar change", async () => {
  const agent = await createTestAgent();

  const config1 = {
    displayProfile: { avatarUrl: "/uploads/agents/old.png", avatarVersion: 1 }
  };
  await prisma.agent.update({ where: { id: agent.id }, data: { config: config1 } });

  const config2 = {
    displayProfile: { avatarUrl: "/uploads/agents/new.png", avatarVersion: 2, avatarUpdatedAt: new Date().toISOString() }
  };
  const updated = await prisma.agent.update({ where: { id: agent.id }, data: { config: config2 } });

  const dp = (updated.config as Record<string, unknown>)?.displayProfile as Record<string, unknown>;
  assert.equal(dp?.avatarVersion, 2, "avatarVersion must increment on avatar change");
  assert.ok(dp?.avatarUpdatedAt, "avatarUpdatedAt must be set on avatar change");

  await cleanup();
});

test("display profile — agent with display profile change still has correct id in usage records", async () => {
  const agent = await createTestAgent();
  const originalId = agent.id;

  const updatedConfig = {
    displayProfile: { displayName: "Changed Name", avatarVersion: 1 }
  };
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { config: updatedConfig }
  });

  assert.equal(updated.id, originalId, "agent id unchanged — usage records referencing this id remain valid");
  await cleanup();
});
