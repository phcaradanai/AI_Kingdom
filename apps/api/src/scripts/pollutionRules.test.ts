import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { assertSafeTestDatabase } from "../test/testDb.js";
import { findMarkedTestData, findSuspiciousUnmarkedData, PROTECTED_EMAILS } from "./pollutionRules.js";

assertSafeTestDatabase();

// ── Helpers ────────────────────────────────────────────────────────────────

async function createPollutionMatter(suffix: string) {
  return prisma.matter.create({
    data: {
      title: `Test Matter Pollution ${suffix}`,
      description: "Simulated pollution for test",
      isTestData: false
    }
  });
}

async function createPollutionNotice(suffix: string) {
  return prisma.notice.create({
    data: {
      title: `Test Notice Pollution ${suffix}`,
      content: "Simulated pollution for test",
      isTestData: false
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("findSuspiciousUnmarkedData detects unmarked matters with test titles", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await createPollutionMatter(suffix);
  try {
    const { matters } = await findSuspiciousUnmarkedData(prisma);
    const found = matters.find((m) => m.id === matter.id);
    assert.ok(found, "pollution matter must appear in suspicious matters");
    assert.ok(found!.reason.length > 0, "reason must be non-empty");
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
  }
});

test("findSuspiciousUnmarkedData detects unmarked notices with test titles", async () => {
  const suffix = `prtest-${Date.now()}`;
  const notice = await createPollutionNotice(suffix);
  try {
    const { notices } = await findSuspiciousUnmarkedData(prisma);
    const found = notices.find((n) => n.id === notice.id);
    assert.ok(found, "pollution notice must appear in suspicious notices");
    assert.ok(found!.reason.length > 0, "reason must be non-empty");
  } finally {
    await prisma.notice.delete({ where: { id: notice.id } }).catch(() => undefined);
  }
});

test("findSuspiciousUnmarkedData detects suspicious inbox items and artifacts", async () => {
  const suffix = `prtest-${Date.now()}`;
  const inbox = await prisma.projectInboxItem.create({
    data: {
      sourceType: "NOTICE",
      sourceId: `cmq-${suffix}`,
      title: `Project inbox test ${suffix}`,
      summary: "test inbox pollution",
      confidenceScore: 0,
      isTestData: false
    }
  });
  const artifact = await prisma.artifact.create({
    data: {
      title: `Implementation Report: M13 RBAC ${suffix}`,
      content: "test artifact pollution",
      type: "IMPLEMENTATION_REPORT",
      isTestData: false
    }
  });
  try {
    const { inboxItems, artifacts } = await findSuspiciousUnmarkedData(prisma);
    assert.ok(inboxItems.some((item) => item.id === inbox.id), "pollution inbox item must appear in suspicious inbox items");
    assert.ok(artifacts.some((item) => item.id === artifact.id), "pollution artifact must appear in suspicious artifacts");
  } finally {
    await prisma.projectInboxItem.delete({ where: { id: inbox.id } }).catch(() => undefined);
    await prisma.artifact.delete({ where: { id: artifact.id } }).catch(() => undefined);
  }
});

test("findSuspiciousUnmarkedData does not return isTestData=true matters", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await prisma.matter.create({
    data: {
      title: `Test Matter Tagged ${suffix}`,
      description: "Tagged test matter",
      isTestData: true
    }
  });
  try {
    const { matters } = await findSuspiciousUnmarkedData(prisma);
    const found = matters.find((m) => m.id === matter.id);
    assert.equal(found, undefined, "tagged matter must NOT appear in suspicious list");
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
  }
});

test("findSuspiciousUnmarkedData does not classify protected emails as suspicious", async () => {
  const { users } = await findSuspiciousUnmarkedData(prisma);
  for (const email of PROTECTED_EMAILS) {
    const found = users.find((u) => u.email === email);
    assert.equal(found, undefined, `${email} must never appear in suspicious users`);
  }
});

test("findMarkedTestData returns tagged matters and notices", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await prisma.matter.create({
    data: { title: `Tagged Matter ${suffix}`, description: "tagged", isTestData: true }
  });
  const notice = await prisma.notice.create({
    data: { title: `Tagged Notice ${suffix}`, content: "tagged", isTestData: true }
  });
  try {
    const marked = await findMarkedTestData(prisma);
    assert.ok(marked.matters.some((m) => m.id === matter.id), "tagged matter must appear in marked list");
    assert.ok(marked.notices.some((n) => n.id === notice.id), "tagged notice must appear in marked list");
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
    await prisma.notice.delete({ where: { id: notice.id } }).catch(() => undefined);
  }
});

test("findMarkedTestData does not return isTestData=false records", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await prisma.matter.create({
    data: { title: `Unmarked Matter ${suffix}`, description: "not tagged", isTestData: false }
  });
  try {
    const marked = await findMarkedTestData(prisma);
    const found = marked.matters.find((m) => m.id === matter.id);
    assert.equal(found, undefined, "unmarked matter must NOT appear in marked list");
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
  }
});

test("inspect and cleanup detect the same suspicious matter counts", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await createPollutionMatter(suffix);
  try {
    const suspicious1 = await findSuspiciousUnmarkedData(prisma);
    const suspicious2 = await findSuspiciousUnmarkedData(prisma);
    assert.equal(
      suspicious1.matters.length,
      suspicious2.matters.length,
      "consecutive calls must return the same count"
    );
    assert.ok(suspicious1.matters.some((m) => m.id === matter.id));
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
  }
});

test("suspicious matter includes reason field matching the detection rule", async () => {
  const suffix = `prtest-${Date.now()}`;
  const matter = await createPollutionMatter(suffix);
  try {
    const { matters } = await findSuspiciousUnmarkedData(prisma);
    const found = matters.find((m) => m.id === matter.id);
    assert.ok(found, "matter must be found");
    assert.match(found!.reason, /title starts with|title contains/, "reason must describe the matched rule");
  } finally {
    await prisma.matter.delete({ where: { id: matter.id } }).catch(() => undefined);
  }
});
