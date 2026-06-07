import { prisma } from "../db/prisma.js";
import { evaluateRecordValue, type DataValueGateInput } from "../services/dataValueGateService.js";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const deleteJunk = args.includes("--delete-junk");

  console.log("=== M15I: Work Order Centralized Maintenance ===");
  console.log(`Running in Mode: ${apply ? "APPLY (Mutating DB)" : "DRY-RUN (Read-only)"}`);
  console.log(`Target Action: ${deleteJunk ? "Delete JUNK/TEST work orders (extremely conservative)" : "Archive low-value/stale/legacy work orders"}\n`);

  const workOrders = await prisma.workOrder.findMany({
    include: {
      assignedExternalAgent: true,
      project: true,
      implementationReports: true,
      handoffBriefs: true
    }
  });

  let archiveCount = 0;
  let deleteCount = 0;

  for (const item of workOrders) {
    const isTest = item.isTestData;
    const isSystem = item.createdBySystem || false;
    const origin = isTest ? "TEST" : (isSystem ? "SYSTEM_GENERATED" : "USER_CREATED");

    const input: DataValueGateInput = {
      recordType: "workOrder",
      origin,
      title: item.title,
      content: item.objective,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      projectId: item.projectId,
      metadata: {
        instructions: item.instructions,
        status: item.status,
        assignedExternalAgentId: item.assignedExternalAgentId,
        id: item.id,
        createdAt: item.createdAt,
        isTestData: item.isTestData
      }
    };

    const decision = await evaluateRecordValue(input);
    const isLowValue = decision.decision === "REJECT" || decision.decision === "PREVIEW_ONLY" || decision.decision === "ARCHIVE" || decision.quality === "JUNK" || decision.quality === "LOW";

    if (isLowValue) {
      const isJunk = decision.quality === "JUNK" || item.isTestData || item.dataQuality === "JUNK" || item.workQuality === "JUNK";
      const hasReports = item.implementationReports.length > 0;
      const hasHandoffBriefs = item.handoffBriefs.length > 0;
      const hasTrace = Boolean(item.traceId);

      // Check if there are artifacts referencing this workOrder
      const referencingArtifacts = await prisma.artifact.count({
        where: { sourceType: "WORK_ORDER", sourceId: item.id }
      });
      const hasArtifacts = referencingArtifacts > 0;

      const sourceForbidden = ["TASK", "COUNCIL_SESSION", "REPORT", "MATTER", "ARTIFACT"].includes(item.sourceType ?? "");
      const userCreated = origin === "USER_CREATED";

      // Extremely conservative deletion checks:
      const canDelete = isJunk && !hasReports && !hasHandoffBriefs && !hasTrace && !hasArtifacts && !sourceForbidden && !userCreated;

      if (deleteJunk) {
        if (canDelete) {
          console.log(`[DELETE] ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          deleteCount++;
          if (apply) {
            await prisma.workOrder.delete({ where: { id: item.id } });
          }
        } else {
          // If it is junk/test but has reports/artifacts/provenance, we archive instead
          if (item.status !== "ARCHIVED") {
            console.log(`[ARCHIVE INSTEAD OF DELETE] ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason} (Contains trace, reports, or artifacts)`);
            archiveCount++;
            if (apply) {
              await prisma.workOrder.update({
                where: { id: item.id },
                data: {
                  status: "ARCHIVED",
                  archivedAt: new Date(),
                  archiveReason: `${decision.reason} (Retained due to linked records)`
                }
              });
            }
          }
        }
      } else {
        // Archive
        if (item.status !== "ARCHIVED") {
          console.log(`[ARCHIVE] ID: ${item.id} | Title: "${item.title}" | Reason: ${decision.reason}`);
          archiveCount++;
          if (apply) {
            await prisma.workOrder.update({
              where: { id: item.id },
              data: {
                status: "ARCHIVED",
                archivedAt: new Date(),
                archiveReason: decision.reason
              }
            });
          }
        }
      }
    }
  }

  console.log("\n=== Maintenance Summary ===");
  if (deleteJunk) {
    console.log(`Total records identified for deletion: ${deleteCount}`);
    console.log(`Total records converted to archive (to protect details): ${archiveCount}`);
    if (!apply) {
      console.log("No records modified. Run with '--apply' to apply these changes.");
    } else {
      console.log("Deletion and protection archiving complete.");
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
