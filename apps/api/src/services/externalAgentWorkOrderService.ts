import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExternalAgent, ImplementationReport, WorkOrder, WorkSession } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getCharter, getVision } from "./charterService.js";
import { isSensitive } from "./memoryService.js";
import { buildProjectContext } from "./projectContextService.js";
import { buildContextSourceTrace, formatRepositoryContextSection, getLatestSnapshot } from "./repositoryScanService.js";
import { createArtifact } from "./projectService.js";
import { evaluateRecordValue } from "./dataValueGateService.js";
import { bindFreshContextToWorkOrder } from "./projectContextBindingService.js";
import { createNotice } from "./royalSecretaryService.js";

type WorkOrderWithRelations = WorkOrder & {
  assignedExternalAgent?: ExternalAgent | null;
  workSessions?: WorkSession[];
  implementationReports?: ImplementationReport[];
};

const DEFAULT_EXTERNAL_AGENTS = [
  {
    name: "Claude Code",
    type: "CLAUDE_CODE" as const,
    roleTitle: "Royal Senior Engineer",
    description: "Manual handoff target for codebase understanding, refactoring, architecture implementation, and test fixing.",
    capabilities: ["codebase understanding", "refactoring", "architecture implementation", "test fixing"]
  },
  {
    name: "Codex",
    type: "CODEX" as const,
    roleTitle: "Royal Implementation Engineer",
    description: "Manual handoff target for coding, implementation, test generation, and bug fixing.",
    capabilities: ["coding", "implementation", "test generation", "bug fixing"]
  },
  {
    name: "Cline",
    type: "CLINE" as const,
    roleTitle: "Royal IDE Engineer",
    description: "Manual handoff target for VS Code workflow, file editing, command execution, and local development.",
    capabilities: ["VS Code workflow", "file editing", "command execution", "local development"]
  },
  {
    name: "Kilo",
    type: "KILO" as const,
    roleTitle: "Royal Field Engineer",
    description: "Manual handoff target for multi-model coding, IDE support, and CLI support.",
    capabilities: ["multi-model coding", "IDE support", "CLI support"]
  },
  {
    name: "Antigravity",
    type: "ANTIGRAVITY" as const,
    roleTitle: "Royal Experimental Engineer",
    description: "Manual handoff target for exploratory implementation, agentic coding, and rapid prototyping.",
    capabilities: ["exploratory implementation", "agentic coding", "rapid prototyping"]
  },
  {
    name: "Hermes",
    type: "HERMES" as const,
    roleTitle: "Royal Messenger Agent",
    description: "Manual handoff target for task execution, automation support, and handoff support.",
    capabilities: ["task execution", "automation support", "handoff support"]
  }
];

const SAFETY_WARNINGS = [
  "Do not delete unrelated files.",
  "Do not rewrite architecture without approval.",
  "Do not expose secrets.",
  "Do not run destructive commands.",
  "Run validation commands if possible.",
  "Report failures honestly."
];

export async function ensureDefaultExternalAgents() {
  for (const agent of DEFAULT_EXTERNAL_AGENTS) {
    const existing = await prisma.externalAgent.findFirst({ where: { name: agent.name, type: agent.type } });
    if (existing) {
      await prisma.externalAgent.update({
        where: { id: existing.id },
        data: {
          roleTitle: agent.roleTitle,
          description: agent.description,
          capabilities: agent.capabilities,
          executionMode: "MANUAL_COPY_PASTE"
        }
      });
      continue;
    }

    await prisma.externalAgent.create({
      data: {
        ...agent,
        executionMode: "MANUAL_COPY_PASTE",
        safetyLevel: "MEDIUM_RISK",
        isActive: true
      }
    });
  }
}

export async function generateWorkOrderFromTask(taskId: string, userId?: string | null) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      sessions: {
        include: {
          responses: { include: { agent: true }, orderBy: { createdAt: "asc" } },
          reports: true
        },
        orderBy: { createdAt: "desc" }
      },
      reports: true
    }
  });
  if (!task) throw notFound("Task not found");

  const latestSession = task.sessions[0];
  const context = [
    `Source task: ${task.title}`,
    `Mode: ${task.mode}`,
    `Status: ${task.status}`,
    `Command: ${redact(task.command)}`,
    latestSession?.finalSummary ? `Latest council summary: ${redact(latestSession.finalSummary)}` : "",
    task.reports.length ? `Related reports: ${task.reports.map((report) => report.title).join(", ")}` : ""
  ].filter(Boolean).join("\n\n");

  return createWorkOrder({
    title: `Work Order: ${task.title}`,
    objective: redact(task.command),
    context,
    instructions: "Implement the requested work in the target project. Keep changes scoped, validate them, and report results in the required format.",
    constraints: defaultConstraints(),
    acceptanceCriteria: [
      "Requested behavior is implemented.",
      "Existing Kingdom architecture and conventions are preserved.",
      "No API keys, tokens, passwords, or secrets are exposed.",
      "Validation commands are run or clearly reported as not run."
    ],
    validationCommands: [
      "npm run typecheck",
      "npm run test --workspace @ai-kingdom/api",
      "npm run test --workspace @ai-kingdom/runner",
      "npm run test --workspace @ai-kingdom/web",
      "npm run build"
    ],
    projectId: task.projectId,
    targetProject: task.projectId ? null : "AI Kingdom",
    sourceType: "TASK",
    sourceId: task.id,
    status: "READY",
    priority: task.mode === "BUILD" ? "HIGH" : "MEDIUM",
    createdByUserId: userId ?? task.createdBy
  }, false);
}

export async function generateWorkOrderFromMatter(matterId: string, userId?: string | null) {
  const matter = await prisma.matter.findUnique({ where: { id: matterId } });
  if (!matter) throw notFound("Matter not found");

  const relatedNotices = matter.sourceType && matter.sourceId
    ? await prisma.notice.findMany({ where: { sourceType: matter.sourceType, sourceId: matter.sourceId }, take: 5, orderBy: { createdAt: "desc" } })
    : [];

  return createWorkOrder({
    title: `Matter Work Order: ${matter.title}`,
    objective: redact(matter.description),
    context: [
      `Matter: ${matter.title}`,
      `Category: ${matter.category}`,
      `Priority: ${matter.priority}`,
      `Status: ${matter.status}`,
      `Description: ${redact(matter.description)}`,
      relatedNotices.length ? `Related notices: ${relatedNotices.map((notice) => notice.title).join(", ")}` : ""
    ].filter(Boolean).join("\n\n"),
    instructions: "Resolve or advance this matter with a scoped implementation or investigation. Preserve Kingdom source-of-truth decisions.",
    constraints: defaultConstraints(),
    acceptanceCriteria: [
      "Matter is addressed or clearly advanced.",
      "Risks and remaining work are documented.",
      "No secrets are exposed.",
      "Validation commands are run or clearly reported as not run."
    ],
    validationCommands: [
      "npm run typecheck",
      "npm run test --workspace @ai-kingdom/api",
      "npm run test --workspace @ai-kingdom/runner",
      "npm run test --workspace @ai-kingdom/web"
    ],
    projectId: matter.projectId,
    targetProject: matter.projectId ? null : "AI Kingdom",
    sourceType: "MATTER",
    sourceId: matter.id,
    status: "READY",
    priority: matter.priority,
    createdByUserId: userId ?? null
  }, false);
}

export async function buildExternalAgentPrompt(workOrderId: string, externalAgentId: string): Promise<string> {
  const [workOrder, externalAgent] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { implementationReports: { orderBy: { createdAt: "desc" }, take: 3 } } }),
    prisma.externalAgent.findUnique({ where: { id: externalAgentId } })
  ]);
  if (!workOrder) throw notFound("Work order not found");
  if (!externalAgent) throw notFound("External agent not found");

  const [driftContext, snapshot] = await Promise.all([
    preventContextDrift(workOrderId),
    workOrder.projectId ? getLatestSnapshot(workOrder.projectId) : Promise.resolve(null)
  ]);
  const decisions = workOrder.implementationReports.flatMap((report) => report.decisionsMade).filter(Boolean);

  return redact([
    `# Work Order: ${workOrder.title}`,
    "## Role",
    `You are acting as ${externalAgent.roleTitle} for AI Kingdom.`,
    "You are an execution agent.",
    "Do not redefine the product vision.",
    "Do not change architecture unless explicitly instructed.",
    "Follow the Work Order exactly.",
    "## Kingdom Context",
    driftContext.kingdomContext,
    "## Project Context",
    driftContext.projectContext,
    formatRepositoryContextSection(snapshot),
    buildContextSourceTrace({ hasProjectMetadata: !!workOrder.projectId, hasKingdomMemory: true, snapshot }),
    "## Objective",
    workOrder.objective,
    "## Scope",
    workOrder.instructions || "Complete the work described in the objective and context.",
    "## Out of Scope",
    "Decision ownership, product vision changes, architecture rewrites without explicit approval, secret handling changes, unrelated refactors, and automatic execution outside the user's local environment.",
    "## Existing Decisions",
    formatList(decisions.length ? decisions : ["No prior implementation decisions are recorded for this work order."]),
    "## Files Likely Involved",
    inferLikelyFiles(workOrder),
    "## Constraints",
    formatList(splitLines(workOrder.constraints).concat(SAFETY_WARNINGS)),
    "## Instructions",
    formatList(splitLines(workOrder.instructions).length ? splitLines(workOrder.instructions) : ["Inspect the codebase.", "Make scoped changes.", "Validate the result.", "Report outcomes."]),
    "## Acceptance Criteria",
    formatList(workOrder.acceptanceCriteria),
    "## Validation Commands",
    formatList(workOrder.validationCommands),
    "## Required Final Response Format",
    "When done, report:",
    "1. Summary",
    "2. Files changed",
    "3. Commands run",
    "4. Tests run",
    "5. Test result",
    "6. Decisions made",
    "7. Issues found",
    "8. Remaining work",
    "9. Recommended next step"
  ].join("\n\n"));
}

/**
 * One-step dispatch: assign the chosen external agent to a work order, build the
 * ready-to-paste prompt, and move the order into IN_PROGRESS — all in a single call.
 * Returns the prompt so the King can hand it to Claude Code / Codex / Cline / etc.
 */
export async function dispatchWorkOrder(workOrderId: string, externalAgentId: string) {
  const [workOrder, externalAgent] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id: workOrderId } }),
    prisma.externalAgent.findUnique({ where: { id: externalAgentId } })
  ]);
  if (!workOrder) throw notFound("Work order not found");
  if (!externalAgent) throw notFound("External agent not found");
  if (!externalAgent.isActive) throw notFound("External agent is inactive");

  // Build the prompt first so a failure here never leaves a half-dispatched order.
  const prompt = await buildExternalAgentPrompt(workOrderId, externalAgentId);

  const nextStatus = workOrder.status === "DRAFT" || workOrder.status === "READY" ? "IN_PROGRESS" : workOrder.status;
  const updated = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { assignedExternalAgentId: externalAgentId, status: nextStatus }
  });

  await createNotice({
    title: `Dispatched: ${workOrder.title}`,
    content: `"${workOrder.title}" was dispatched to ${externalAgent.name} (${externalAgent.roleTitle}). Awaiting the implementation report.`,
    severity: "INFO",
    sourceType: "work-order-dispatch",
    sourceId: workOrder.id,
    projectId: workOrder.projectId ?? undefined
  }).catch(() => undefined);

  return { workOrder: updated, externalAgent, prompt };
}

export async function preventContextDrift(workOrderId: string) {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!workOrder) throw notFound("Work order not found");
  const [charter, vision] = await Promise.all([getCharter(), getVision()]);
  const projectStatus = readProjectDoc("PROJECT_STATUS.md");
  const architecture = readProjectDoc("ARCHITECTURE.md");
  const nextTask = readProjectDoc("NEXT_TASK.md");
  const linkedProjectContext = workOrder.projectId ? await buildProjectContext(workOrder.projectId) : null;

  return {
    kingdomContext: [
      `Kingdom Charter: ${summarize(charter?.mission ?? charter?.content ?? "The Kingdom exists to serve the King.")}`,
      `Kingdom Vision: ${summarize(vision?.content ?? "Build a durable AI Kingdom command center.")}`,
      `Current strategic goal: ${summarize(nextTask)}`
    ].join("\n"),
    projectContext: linkedProjectContext
      ? [
        linkedProjectContext,
        `Architecture summary: ${summarize(architecture)}`,
        `Decision constraints: ${defaultConstraints()}`,
        `Remaining work: ${workOrder.context ? summarize(workOrder.context) : "Complete this work order and report outcomes."}`
      ].join("\n")
      : [
        "No project assigned. Avoid project-specific assumptions.",
        `Current milestone/status: ${summarize(projectStatus)}`,
        `Architecture summary: ${summarize(architecture)}`,
        `Decision constraints: ${defaultConstraints()}`,
        `Remaining work: ${workOrder.context ? summarize(workOrder.context) : "Complete this work order and report outcomes."}`
      ].join("\n")
  };
}

export async function createHandoffBrief(workOrderId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      workSessions: { orderBy: { updatedAt: "desc" }, take: 1 },
      implementationReports: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  if (!workOrder) throw notFound("Work order not found");

  const latestSession = workOrder.workSessions[0] ?? null;
  const latestReport = workOrder.implementationReports[0] ?? null;
  const snapshot = workOrder.projectId ? await getLatestSnapshot(workOrder.projectId) : null;
  const completedWork = latestReport ? [latestReport.summary] : [];
  const knownIssues = latestReport?.errors ?? [];
  const nextSteps = latestReport?.remainingWork.length ? latestReport.remainingWork : [latestReport?.nextRecommendedAction ?? "Review the work order and continue from the current status."];
  const handoffPrompt = redact([
    `# Handoff Brief: ${workOrder.title}`,
    `Current status: ${workOrder.status}`,
    formatRepositoryContextSection(snapshot),
    buildContextSourceTrace({ hasProjectMetadata: !!workOrder.projectId, hasKingdomMemory: true, snapshot }),
    "## Completed Work",
    formatList(completedWork.length ? completedWork : ["No implementation report has been submitted yet."]),
    "## Decisions Made",
    formatList(latestReport?.decisionsMade.length ? latestReport.decisionsMade : ["No implementation decisions are recorded yet."]),
    "## Files Changed",
    formatList(latestReport?.filesChanged.length ? latestReport.filesChanged : ["No changed files are recorded yet."]),
    "## Known Issues",
    formatList(knownIssues.length ? knownIssues : ["No known issues recorded."]),
    "## Next Steps",
    formatList(nextSteps),
    "## Constraints",
    formatList(splitLines(workOrder.constraints).concat(SAFETY_WARNINGS)),
    "Continue only within this handoff. Preserve AI Kingdom as the source of truth and report back in the required final response format."
  ].join("\n\n"));

  const handoffBrief = await prisma.handoffBrief.create({
    data: {
      workOrderId: workOrder.id,
      projectId: workOrder.projectId,
      fromWorkSessionId: latestSession?.id,
      title: `Handoff: ${workOrder.title}`,
      currentStatus: String(workOrder.status),
      completedWork,
      decisionsMade: latestReport?.decisionsMade ?? [],
      filesChanged: latestReport?.filesChanged ?? [],
      knownIssues,
      nextSteps,
      constraints: splitLines(workOrder.constraints).concat(SAFETY_WARNINGS),
      suggestedNextAgentType: latestReport?.remainingWork.length ? "CODEX" : null,
      handoffPrompt
    }
  });

  await createArtifact({
    projectId: workOrder.projectId,
    title: handoffBrief.title,
    type: "HANDOFF_BRIEF",
    content: handoffBrief.handoffPrompt,
    sourceType: "HANDOFF_BRIEF",
    sourceId: handoffBrief.id,
    tags: ["handoff", "work-order"]
  }).catch(() => undefined);

  return handoffBrief;
}

export async function createImplementationReport(input: {
  workOrderId: string;
  workSessionId?: string | null;
  externalAgentId?: string | null;
  summary: string;
  filesChanged?: string[];
  commandsRun?: string[];
  testsRun?: string[];
  testResult?: "NOT_RUN" | "PASSED" | "FAILED" | "PARTIAL";
  errors?: string[];
  decisionsMade?: string[];
  remainingWork?: string[];
  nextRecommendedAction?: string | null;
  rawOutput?: string | null;
}) {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: input.workOrderId } });
  if (!workOrder) throw notFound("Work order not found");

  const report = await prisma.implementationReport.create({
    data: {
      ...input,
      projectId: workOrder.projectId,
      summary: redact(input.summary),
      filesChanged: input.filesChanged ?? [],
      commandsRun: input.commandsRun ?? [],
      testsRun: input.testsRun ?? [],
      testResult: input.testResult ?? "NOT_RUN",
      errors: (input.errors ?? []).map(redact),
      decisionsMade: (input.decisionsMade ?? []).map(redact),
      remainingWork: (input.remainingWork ?? []).map(redact),
      nextRecommendedAction: input.nextRecommendedAction ? redact(input.nextRecommendedAction) : null,
      rawOutput: input.rawOutput ? redact(trim(input.rawOutput, 5000)) : null
    }
  });

  await prisma.workOrder.update({
    where: { id: input.workOrderId },
    data: { status: "NEEDS_REVIEW" }
  });
  await createDecisionMemories(report);
  await createArtifact({
    projectId: workOrder.projectId,
    title: `Implementation Report: ${workOrder.title}`,
    type: "IMPLEMENTATION_REPORT",
    content: report.summary,
    sourceType: "IMPLEMENTATION_REPORT",
    sourceId: report.id,
    tags: ["implementation-report", "work-order"]
  }).catch(() => undefined);
  await notifyKingOfReport(workOrder, report).catch(() => undefined);
  return report;
}

/**
 * Alert the King when an external agent reports back. Closes the loop:
 * decree -> dispatch -> execution -> stored in the Kingdom -> the King is notified.
 * The result is summarized into a single Notice (deduped by source via createNotice).
 */
async function notifyKingOfReport(workOrder: WorkOrder, report: ImplementationReport) {
  const failed = report.testResult === "FAILED" || report.errors.length > 0;
  const severity = failed ? "WARNING" : "INFO";
  const filesLabel = report.filesChanged.length
    ? `${report.filesChanged.length} file(s) changed`
    : "no files changed";
  const headline = failed
    ? `Work needs attention: ${workOrder.title}`
    : `Work complete: ${workOrder.title}`;
  const content = [
    `An external agent reported back on "${workOrder.title}".`,
    `Result: ${report.testResult} · ${filesLabel}.`,
    `Summary: ${trim(report.summary, 400)}`,
    report.remainingWork.length ? `Remaining: ${report.remainingWork.slice(0, 3).map((item) => trim(item, 120)).join("; ")}` : "",
    report.nextRecommendedAction ? `Recommended next step: ${trim(report.nextRecommendedAction, 200)}` : "",
    "Open the Work Order to review the report and approve or archive it."
  ].filter(Boolean).join("\n");

  await createNotice({
    title: headline,
    content,
    severity,
    sourceType: "work-order-report",
    sourceId: report.id,
    projectId: workOrder.projectId ?? undefined
  });
}

export async function createWorkOrderCompletionReport(workOrderId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: { implementationReports: { orderBy: { createdAt: "desc" }, take: 5 } }
  });
  if (!workOrder?.createdByUserId) return null;

  const existing = await prisma.report.findFirst({
    where: { sourceTaskId: null, title: `Work Order Report: ${workOrder.title}` }
  });
  if (existing) return existing;

  const reportSummary = workOrder.implementationReports[0]?.summary ?? workOrder.objective;
  return prisma.report.create({
    data: {
      title: `Work Order Report: ${workOrder.title}`,
      summary: redact(reportSummary),
      content: redact([
        `## Objective\n${workOrder.objective}`,
        `## Status\n${workOrder.status}`,
        `## Implementation Reports\n${workOrder.implementationReports.map((report) => `- ${report.summary}`).join("\n") || "- No implementation reports submitted."}`,
        `## Remaining Work\n${workOrder.implementationReports.flatMap((report) => report.remainingWork).map((item) => `- ${item}`).join("\n") || "- None recorded."}`
      ].join("\n\n")),
      category: "GENERAL",
      importance: workOrder.priority === "CRITICAL" || workOrder.priority === "HIGH" ? "HIGH" : "MEDIUM",
      tags: ["work-order", workOrder.status.toLowerCase()],
      projectId: workOrder.projectId,
      createdBy: workOrder.createdByUserId
    }
  });
}

function defaultConstraints(): string {
  return [
    "AI Kingdom remains the source of truth.",
    "External agents are executors, not decision owners.",
    "Keep changes scoped to the work order.",
    "Do not expose secrets or store raw secret material.",
    "Do not run backend-initiated shell commands or call external agent APIs."
  ].join("\n");
}

async function createDecisionMemories(report: ImplementationReport) {
  if (report.decisionsMade.length === 0) return;
  const workOrder = await prisma.workOrder.findUnique({ where: { id: report.workOrderId } });
  if (!workOrder?.createdByUserId) return;

  for (const decision of report.decisionsMade.slice(0, 5)) {
    if (isSensitive(decision)) continue;
    await prisma.memory.create({
      data: {
        type: "DECISION",
        title: trim(`Decision from ${workOrder.title}`, 140),
        content: trim(redact(decision), 700),
        source: "implementation-report",
        tags: ["work-order", "external-agent"],
        importance: workOrder.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
        projectId: workOrder.projectId,
        createdBy: workOrder.createdByUserId
      }
    });
  }
}

function inferLikelyFiles(workOrder: WorkOrderWithRelations): string {
  const text = `${workOrder.objective} ${workOrder.context} ${workOrder.instructions}`.toLowerCase();
  const files: string[] = [];
  if (text.includes("api") || text.includes("backend") || text.includes("prisma")) files.push("apps/api/src", "apps/api/prisma/schema.prisma");
  if (text.includes("ui") || text.includes("frontend") || text.includes("page")) files.push("apps/web/src");
  if (text.includes("docs") || text.includes("documentation")) files.push("README.md", "ARCHITECTURE.md", "PROJECT_STATUS.md", "NEXT_TASK.md");
  return formatList(files.length ? files : ["Inspect the repository to identify the smallest relevant file set."]);
}

function readProjectDoc(path: string): string {
  try {
    return readFileSync(resolve(process.cwd(), "../../", path), "utf-8");
  } catch {
    try {
      return readFileSync(resolve(process.cwd(), path), "utf-8");
    } catch {
      return "";
    }
  }
}

function summarize(value: string, maxLength = 700): string {
  return trim(redact(value.replace(/[#*_`>]/g, " ").replace(/\s+/g, " ")), maxLength);
}

function formatList(values: string[]): string {
  return values.filter(Boolean).map((value) => `- ${redact(value)}`).join("\n") || "- None recorded.";
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean);
}

function redact(value: string): string {
  return value
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/(api[_-]?key|password|secret|token|authorization|bearer)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED_SECRET]");
}

function trim(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

export type CreateWorkOrderResult = {
  status: "CREATED" | "EXISTING" | "PREVIEW_ONLY" | "REJECTED";
  workOrder?: WorkOrder;
  reason?: string;
};

export async function createWorkOrder(
  data: any,
  explicitUserAction = false
): Promise<CreateWorkOrderResult> {
  const title = (data.title ?? "").trim();
  const objective = (data.objective ?? "").trim();
  const instructions = (data.instructions ?? "").trim();
  const status = data.status ?? "DRAFT";
  const sourceType = data.sourceType ?? null;
  const sourceId = data.sourceId ?? null;
  const projectId = data.projectId ?? null;
  const isTestData = data.isTestData ?? false;

  const createdBySystem = Boolean(sourceType || sourceId || data.traceId || data.createdByAgentId);

  if (sourceType && sourceId && title) {
    const titleNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const existing = await prisma.workOrder.findFirst({
      where: {
        sourceType,
        sourceId,
        status: { notIn: ["ARCHIVED", "CANCELLED", "FAILED"] }
      }
    });
    if (existing && existing.title.toLowerCase().replace(/[^a-z0-9]+/g, "") === titleNorm) {
      return { status: "EXISTING", workOrder: existing };
    }
  }

  const gateDecision = await evaluateRecordValue({
    recordType: "workOrder",
    origin: isTestData ? "TEST" : (createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED"),
    title,
    content: objective,
    sourceType,
    sourceId,
    projectId,
    metadata: {
      instructions,
      status,
      assignedExternalAgentId: data.assignedExternalAgentId,
      id: data.id,
      isTestData
    }
  });

  if (gateDecision.decision === "REJECT") {
    if (explicitUserAction) {
      throw new Error("Validation failed for user-created WorkOrder: " + gateDecision.reason);
    }
    return { status: "REJECTED", reason: gateDecision.reason };
  }

  if (gateDecision.decision === "PREVIEW_ONLY") {
    if (explicitUserAction) {
      const workOrder = await prisma.workOrder.create({
        data: {
          ...data,
          status: "DRAFT",
          dataQuality: "REVIEW_REQUIRED",
          workQuality: "DEBUG_ONLY",
          createdBySystem
        }
      });
      return { status: "CREATED", workOrder: await bindWorkOrderContextBestEffort(workOrder) };
    }
    return { status: "PREVIEW_ONLY", reason: gateDecision.reason };
  }

  const dataQuality = gateDecision.sourceTrust === "TEST" ? "TEST" : (gateDecision.sourceTrust === "TRUSTED" ? "TRUSTED" : "REVIEW_REQUIRED");
  const workQuality = gateDecision.quality === "JUNK" ? "JUNK" : (gateDecision.decision === "ARCHIVE" ? "COMPLETED_ARCHIVE" : "ACTIONABLE");

  const finalStatus = gateDecision.decision === "ARCHIVE" ? "ARCHIVED" : status;
  const archivedAt = finalStatus === "ARCHIVED" ? new Date() : null;
  const archiveReason = finalStatus === "ARCHIVED" ? gateDecision.reason : null;

  const workOrder = await prisma.workOrder.create({
    data: {
      ...data,
      status: finalStatus,
      dataQuality,
      workQuality,
      archiveReason,
      archivedAt,
      createdBySystem
    }
  });

  return { status: "CREATED", workOrder: await bindWorkOrderContextBestEffort(workOrder) };
}

/** Binds latest project snapshots to a freshly created work order; never fails creation. */
async function bindWorkOrderContextBestEffort(workOrder: WorkOrder): Promise<WorkOrder> {
  if (!workOrder.projectId) return workOrder;
  try {
    const { workOrder: bound } = await bindFreshContextToWorkOrder(workOrder.id, { userId: workOrder.createdByUserId });
    return bound;
  } catch {
    return workOrder;
  }
}
