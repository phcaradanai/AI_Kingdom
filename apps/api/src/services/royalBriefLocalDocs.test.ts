import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { generateDailyRoyalBrief } from "./royalBriefService.js";

type LocalDocsSummary = {
  issues: Array<{ projectId: string; issue: string }>;
  projectsMissingRoot: number;
  projectsMissingSnapshot: number;
  projectsWithFailedScan: number;
  projectsWithStaleSnapshot: number;
  projectsWithChangedDocs: number;
  workOrdersBlocked: Array<{ id: string; projectId: string }>;
};

test("Royal Brief persists a local docs summary with issues and blocked work orders", async () => {
  const project = await prisma.project.create({ data: { name: `Brief Local Docs Test ${randomUUID()}` } });
  const workOrder = await prisma.workOrder.create({
    data: { title: `Brief Blocked WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
  });
  let briefId: string | null = null;
  try {
    const brief = await generateDailyRoyalBrief(new Date());
    briefId = brief.id;

    const summary = brief.localDocsSummary as LocalDocsSummary;
    assert.ok(summary, "brief must carry a localDocsSummary");

    const issue = summary.issues.find((i) => i.projectId === project.id);
    assert.equal(issue?.issue, "MISSING_ROOT", "project without roots must appear as MISSING_ROOT");
    assert.ok(summary.projectsMissingRoot >= 1);

    const blocked = summary.workOrdersBlocked.find((w) => w.id === workOrder.id);
    assert.ok(blocked, "READY work order in a project with local docs issues must be listed as blocked");

    const provenance = brief.provenance as { sources?: string[] };
    assert.ok(provenance.sources?.includes("LocalDocumentRoot"));
    assert.ok(provenance.sources?.includes("LocalDocumentSnapshot"));

    // Decision items are capped at 10 per category; only assert when our issue made the cut.
    const decisions = (brief.decisionsNeeded as { items: Array<{ id: string }> }).items;
    if (summary.issues.findIndex((i) => i.projectId === project.id) < 10) {
      assert.ok(
        decisions.some((d) => d.id === `local-docs:${project.id}:MISSING_ROOT`),
        "expected a local-docs decision for the project"
      );
    }
    if (summary.workOrdersBlocked.findIndex((w) => w.id === workOrder.id) < 10) {
      assert.ok(
        decisions.some((d) => d.id === `work-order-blocked:${workOrder.id}`),
        "expected a blocked work order decision"
      );
    }
  } finally {
    if (briefId) await prisma.royalBrief.delete({ where: { id: briefId } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  }
});
