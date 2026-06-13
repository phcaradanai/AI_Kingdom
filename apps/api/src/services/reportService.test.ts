import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db/prisma.js";
import { generateRoyalReport } from "./reportService.js";


async function createReportFixture() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `report-test-${suffix}@aikingdom.local`,
      displayName: "Report Test King",
      passwordHash: "test"
    }
  });
  const agent = await prisma.agent.create({
    data: {
      slug: `report-agent-${suffix}`,
      name: "Archivist",
      title: "Royal Archivist",
      role: "Archive Tester",
      specialty: "Report verification",
      prompt: "Archive reports.",
      systemPrompt: "Archive reports.",
      skills: ["archive"],
      responseStyle: "concise"
    }
  });
  const task = await prisma.task.create({
    data: {
      createdBy: user.id,
      title: "Archive polish",
      command: "Polish the council archive and generate a royal report.",
      mode: "PLAN",
      status: "COMPLETED"
    }
  });
  const session = await prisma.councilSession.create({
    data: {
      taskId: task.id,
      status: "COMPLETED",
      selectedAgentIds: [agent.id],
      finalSummary: "Council recommends a polished Royal Archive with searchable reports.",
      consultedMemoryIds: [],
      autoSavedMemoryIds: []
    }
  });
  await prisma.agentResponse.create({
    data: {
      sessionId: session.id,
      agentId: agent.id,
      role: agent.title,
      response: "Create readable archive records with clear source decrees and final counsel."
    }
  });
  const fullSession = await prisma.councilSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { task: true, responses: true }
  });

  return { user, agent, task, session: fullSession };
}

test("auto report is generated after completed session and not duplicated", async () => {
  const fixture = await createReportFixture();

  const first = await generateRoyalReport({
    userId: fixture.user.id,
    session: fixture.session,
    consultedMemories: []
  });
  const second = await generateRoyalReport({
    userId: fixture.user.id,
    session: fixture.session,
    consultedMemories: []
  });

  assert.equal(first.id, second.id);
  assert.equal(first.sourceCouncilSessionId, fixture.session.id);

  await prisma.user.delete({ where: { id: fixture.user.id } });
  await prisma.agent.delete({ where: { id: fixture.agent.id } });
});

test("report search works and report delete removes archive record", async () => {
  const fixture = await createReportFixture();
  const report = await generateRoyalReport({
    userId: fixture.user.id,
    session: fixture.session,
    consultedMemories: []
  });

  const searchResults = await prisma.report.findMany({
    where: {
      createdBy: fixture.user.id,
      OR: [
        { title: { contains: "Archive", mode: "insensitive" } },
        { content: { contains: "source decree", mode: "insensitive" } }
      ]
    }
  });
  assert.ok(searchResults.some((item) => item.id === report.id));

  await prisma.report.delete({ where: { id: report.id } });
  const deleted = await prisma.report.findUnique({ where: { id: report.id } });
  assert.equal(deleted, null);

  await prisma.user.delete({ where: { id: fixture.user.id } });
  await prisma.agent.delete({ where: { id: fixture.agent.id } });
});

test("council detail query includes generated report link", async () => {
  const fixture = await createReportFixture();
  const report = await generateRoyalReport({
    userId: fixture.user.id,
    session: fixture.session,
    consultedMemories: []
  });

  const session = await prisma.councilSession.findFirstOrThrow({
    where: { id: fixture.session.id },
    include: { reports: true }
  });

  assert.equal(session.reports[0]?.id, report.id);

  await prisma.user.delete({ where: { id: fixture.user.id } });
  await prisma.agent.delete({ where: { id: fixture.agent.id } });
});
