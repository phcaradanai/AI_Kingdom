import { prisma } from "../db/prisma.js";
import { evaluateRecordValue, type DataValueGateInput } from "../services/dataValueGateService.js";

async function main() {
  console.log("=== M15I: Work Order Quality Gate Inspector ===");
  console.log("Scanning work orders to identify legacy, test, duplicate, and stale records...");

  const workOrders = await prisma.workOrder.findMany({
    include: {
      assignedExternalAgent: true,
      project: true,
      implementationReports: true
    }
  });

  console.log(`Found ${workOrders.length} WorkOrders in database.\n`);

  let count = 0;
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
      count++;
      const ageInDays = ((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1);
      console.log(`[CANDIDATE] ID: ${item.id} | Status: ${item.status} | Title: "${item.title}"`);
      console.log(`            Age: ${ageInDays} days | Priority: ${item.priority} | Agent: ${item.assignedExternalAgent?.name || "Unassigned"}`);
      console.log(`            Project: ${item.project?.name || "None"} | Source: ${item.sourceType || "None"}/${item.sourceId || "None"}`);
      console.log(`            Decision: ${decision.decision} | Quality: ${decision.quality} | Reason: ${decision.reason}\n`);
    }
  }

  console.log("=== Scan Complete ===");
  console.log(`Total low-value/archive/junk WorkOrders identified: ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
