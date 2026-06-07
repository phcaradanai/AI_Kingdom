import { prisma } from "../db/prisma.js";
import { evaluateRecordValue, type DataValueGateInput } from "../services/dataValueGateService.js";

async function main() {
  console.log("=== M15H: Centralized Data Value Gate Scanner ===");
  console.log("Scanning database records to identify low-value or junk data...");

  // 1. Scan ProjectInboxItems
  const inboxItems = await prisma.projectInboxItem.findMany();
  console.log(`\nFound ${inboxItems.length} ProjectInboxItems in database.`);
  let inboxLowValueCount = 0;
  for (const item of inboxItems) {
    const input: DataValueGateInput = {
      recordType: "projectInboxItem",
      origin: item.isTestData ? "TEST" : (item.createdBySystem ? "SYSTEM_GENERATED" : "SYSTEM_GENERATED"),
      title: item.title,
      content: item.summary,
      confidence: item.confidenceScore,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined,
      metadata: {
        evidence: item.evidence,
        ignoredSignals: item.ignoredSignals,
        candidateProjectIds: item.candidateProjectIds
      }
    };
    const decision = await evaluateRecordValue(input);
    if (decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW") {
      inboxLowValueCount++;
      console.log(`  [InboxItem] ID: ${item.id} | Status: ${item.status} | Title: "${item.title}"`);
      console.log(`              Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}`);
    }
  }

  // 2. Scan Matters
  const matters = await prisma.matter.findMany();
  console.log(`\nFound ${matters.length} Matters in database.`);
  let mattersLowValueCount = 0;
  for (const item of matters) {
    const input: DataValueGateInput = {
      recordType: "matter",
      origin: item.isTestData ? "TEST" : (item.createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED"),
      title: item.title,
      content: item.description,
      category: item.category,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };
    const decision = await evaluateRecordValue(input);
    if (decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW") {
      mattersLowValueCount++;
      console.log(`  [Matter] ID: ${item.id} | Status: ${item.status} | Title: "${item.title}"`);
      console.log(`           Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}`);
    }
  }

  // 3. Scan Notices
  const notices = await prisma.notice.findMany();
  console.log(`\nFound ${notices.length} Notices in database.`);
  let noticesLowValueCount = 0;
  for (const item of notices) {
    const input: DataValueGateInput = {
      recordType: "notice",
      origin: item.isTestData ? "TEST" : (item.createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED"),
      title: item.title,
      content: item.content,
      category: item.severity,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };
    const decision = await evaluateRecordValue(input);
    if (decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW") {
      noticesLowValueCount++;
      console.log(`  [Notice] ID: ${item.id} | Status: ${item.status} | Title: "${item.title}"`);
      console.log(`           Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}`);
    }
  }

  // 4. Scan Artifacts
  const artifacts = await prisma.artifact.findMany();
  console.log(`\nFound ${artifacts.length} Artifacts in database.`);
  let artifactsLowValueCount = 0;
  for (const item of artifacts) {
    const input: DataValueGateInput = {
      recordType: "artifact",
      origin: item.isTestData ? "TEST" : (item.createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED"),
      title: item.title,
      content: item.content,
      category: item.type,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };
    const decision = await evaluateRecordValue(input);
    if (decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW") {
      artifactsLowValueCount++;
      console.log(`  [Artifact] ID: ${item.id} | Title: "${item.title}"`);
      console.log(`             Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}`);
    }
  }

  // 5. Scan AgentKnowledgeCandidates
  const candidates = await prisma.agentKnowledgeCandidate.findMany();
  console.log(`\nFound ${candidates.length} AgentKnowledgeCandidates in database.`);
  let candidatesLowValueCount = 0;
  for (const item of candidates) {
    const input: DataValueGateInput = {
      recordType: "knowledgeCandidate",
      origin: "SYSTEM_GENERATED",
      title: item.title,
      content: item.content,
      category: item.category,
      confidence: item.confidence,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined,
      metadata: (item.metadata && typeof item.metadata === "object") ? (item.metadata as any) : {}
    };
    const decision = await evaluateRecordValue(input);
    if (decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW") {
      candidatesLowValueCount++;
      console.log(`  [KnowledgeCandidate] ID: ${item.id} | Status: ${item.status} | Title: "${item.title}"`);
      console.log(`                       Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}`);
    }
  }

  console.log("\n=== Scan Complete ===");
  console.log(`Total low-value ProjectInboxItems: ${inboxLowValueCount}`);
  console.log(`Total low-value Matters: ${mattersLowValueCount}`);
  console.log(`Total low-value Notices: ${noticesLowValueCount}`);
  console.log(`Total low-value Artifacts: ${artifactsLowValueCount}`);
  console.log(`Total low-value KnowledgeCandidates: ${candidatesLowValueCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
