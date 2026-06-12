import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { generateDailyRoyalBrief } from "./royalBriefService.js";

type ContextHealthSummary = {
  workOrdersBlockedByContext: Array<{ id: string; projectId: string; contextBindingStatus: string }>;
  autoJobsSkippedForContext: number;
  contextSkippedReasons: string[];
  patchesWithStaleBaseContext: Array<{ id: string }>;
  projectsNeedingContextRefresh: Array<{ projectId: string }>;
};

test("Royal Brief includes a context health summary with blocked work orders and refresh decisions", async () => {
  const project = await prisma.project.create({ data: { name: `Brief Context Test ${randomUUID()}` } });
  // A READY work order in a project — contextBindingStatus defaults to MISSING, so it is blocked.
  const workOrder = await prisma.workOrder.create({
    data: { title: `Brief Context WO ${randomUUID()}`, objective: "Test objective", status: "READY", projectId: project.id }
  });
  let briefId: string | null = null;
  try {
    const brief = await generateDailyRoyalBrief(new Date());
    briefId = brief.id;

    const contextHealth = brief.contextHealthSummary as ContextHealthSummary;
    assert.ok(contextHealth, "brief must carry a contextHealthSummary");

    const blocked = contextHealth.workOrdersBlockedByContext.find((w) => w.id === workOrder.id);
    assert.ok(blocked, "READY work order with MISSING context binding must be listed as blocked");
    assert.equal(blocked!.contextBindingStatus, "MISSING");

    const refresh = contextHealth.projectsNeedingContextRefresh.find((p) => p.projectId === project.id);
    assert.ok(refresh, "the work order's project must be listed as needing a context refresh");

    const provenance = brief.provenance as { sources?: string[] };
    assert.ok(provenance.sources?.includes("ProjectContextBinding"));

    // Decision lists are capped per category; only assert when our items made the cut.
    const decisions = (brief.decisionsNeeded as { items: Array<{ id: string; title: string }> }).items;
    if (contextHealth.workOrdersBlockedByContext.findIndex((w) => w.id === workOrder.id) < 10) {
      assert.ok(
        decisions.some((d) => d.id === `context-blocked:${workOrder.id}`),
        "expected a context-blocked decision for the work order"
      );
    }
    if (contextHealth.projectsNeedingContextRefresh.findIndex((p) => p.projectId === project.id) < 10) {
      const refreshDecision = decisions.find((d) => d.id === `context-refresh:${project.id}`);
      assert.ok(refreshDecision, "expected a context-refresh decision for the project");
      assert.match(refreshDecision!.title, /Refresh project context before patching/);
    }
  } finally {
    if (briefId) await prisma.royalBrief.delete({ where: { id: briefId } }).catch(() => undefined);
    await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined);
    await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  }
});
