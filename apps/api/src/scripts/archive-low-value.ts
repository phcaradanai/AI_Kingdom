import { prisma } from "../db/prisma.js";
import { evaluateRecordValue, type DataValueGateInput } from "../services/dataValueGateService.js";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const deleteJunk = args.includes("--delete-junk");

  console.log("=== M15H: Centralized Data Value Gate Maintenance ===");
  console.log(`Running in Mode: ${apply ? "APPLY (Mutating DB)" : "DRY-RUN (Read-only)"}`);
  console.log(`Target Action: ${deleteJunk ? "Delete system/test JUNK records" : "Archive low-value/junk records"}\n`);

  let archiveCount = 0;
  let deleteCount = 0;

  // 1. ProjectInboxItem
  const inboxItems = await prisma.projectInboxItem.findMany();
  for (const item of inboxItems) {
    const isTest = item.isTestData;
    const isSystem = item.createdBySystem || true; // inbox items are generally system generated
    const origin = isTest ? "TEST" : (isSystem ? "SYSTEM_GENERATED" : "USER_CREATED");

    const input: DataValueGateInput = {
      recordType: "projectInboxItem",
      origin,
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
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK";
      const canDelete = isJunk && (origin === "SYSTEM_GENERATED" || origin === "TEST");

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] ProjectInboxItem ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.projectInboxItem.delete({ where: { id: item.id } });
          }
        }
      } else {
        // Archive
        if (item.status !== "ARCHIVED") {
          console.log(`[ARCHIVE] ProjectInboxItem ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          archiveCount++;
          if (apply) {
            await prisma.projectInboxItem.update({
              where: { id: item.id },
              data: { status: "ARCHIVED" }
            });
          }
        }
      }
    }
  }

  // 2. Matter
  const matters = await prisma.matter.findMany();
  for (const item of matters) {
    const isTest = item.isTestData;
    const isSystem = item.createdBySystem;
    const origin = isTest ? "TEST" : (isSystem ? "SYSTEM_GENERATED" : "USER_CREATED");

    const input: DataValueGateInput = {
      recordType: "matter",
      origin,
      title: item.title,
      content: item.description,
      category: item.category,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };

    const decision = await evaluateRecordValue(input);
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK";
      const canDelete = isJunk && (origin === "SYSTEM_GENERATED" || origin === "TEST");

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] Matter ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.matter.delete({ where: { id: item.id } });
          }
        }
      } else {
        // Archive
        if (item.status !== "REJECTED") {
          console.log(`[ARCHIVE -> REJECTED] Matter ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          archiveCount++;
          if (apply) {
            await prisma.matter.update({
              where: { id: item.id },
              data: { status: "REJECTED" }
            });
          }
        }
      }
    }
  }

  // 3. Notice
  const notices = await prisma.notice.findMany();
  for (const item of notices) {
    const isTest = item.isTestData;
    const isSystem = item.createdBySystem;
    const origin = isTest ? "TEST" : (isSystem ? "SYSTEM_GENERATED" : "USER_CREATED");

    const input: DataValueGateInput = {
      recordType: "notice",
      origin,
      title: item.title,
      content: item.content,
      category: item.severity,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };

    const decision = await evaluateRecordValue(input);
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK";
      const canDelete = isJunk && (origin === "SYSTEM_GENERATED" || origin === "TEST");

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] Notice ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.notice.delete({ where: { id: item.id } });
          }
        }
      } else {
        // Archive
        if (item.status !== "ARCHIVED") {
          console.log(`[ARCHIVE] Notice ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          archiveCount++;
          if (apply) {
            await prisma.notice.update({
              where: { id: item.id },
              data: { status: "ARCHIVED" }
            });
          }
        }
      }
    }
  }

  // 4. Artifact
  const artifacts = await prisma.artifact.findMany();
  for (const item of artifacts) {
    const isTest = item.isTestData;
    const isSystem = item.createdBySystem;
    const origin = isTest ? "TEST" : (isSystem ? "SYSTEM_GENERATED" : "USER_CREATED");

    const input: DataValueGateInput = {
      recordType: "artifact",
      origin,
      title: item.title,
      content: item.content,
      category: item.type,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      traceId: item.traceId || undefined
    };

    const decision = await evaluateRecordValue(input);
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK";
      const canDelete = isJunk && (origin === "SYSTEM_GENERATED" || origin === "TEST");

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] Artifact ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.artifact.delete({ where: { id: item.id } });
          }
        }
      } else {
        // Artifact does not have a status field to archive, so we log it
        console.log(`[ARCHIVE - SKIP (No Status Field)] Artifact ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
      }
    }
  }

  // 5. AgentKnowledgeCandidate
  const candidates = await prisma.agentKnowledgeCandidate.findMany();
  for (const item of candidates) {
    const origin = "SYSTEM_GENERATED";

    const input: DataValueGateInput = {
      recordType: "knowledgeCandidate",
      origin,
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
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK";
      const canDelete = isJunk; // knowledge candidates are always system generated

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] AgentKnowledgeCandidate ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.agentKnowledgeCandidate.delete({ where: { id: item.id } });
          }
        }
      } else {
        // Archive
        if (item.status !== "ARCHIVED") {
          console.log(`[ARCHIVE] AgentKnowledgeCandidate ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          archiveCount++;
          if (apply) {
            await prisma.agentKnowledgeCandidate.update({
              where: { id: item.id },
              data: { status: "ARCHIVED" }
            });
          }
        }
      }
    }
  }

  console.log("\n=== Maintenance Summary ===");
  if (deleteJunk) {
    console.log(`Total records identified for deletion: ${deleteCount}`);
    if (!apply) {
      console.log("No records deleted. Run with '--apply' to delete these junk records.");
    } else {
      console.log("Deletion complete.");
    }
  } else {
    console.log(`Total records identified for archiving: ${archiveCount}`);
    if (!apply) {
      console.log("No records updated. Run with '--apply' to archive these records.");
    } else {
      console.log("Archiving complete.");
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
