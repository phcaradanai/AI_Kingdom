import type { ArtifactType, ProjectPriority, ProjectStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { classifyArtifact, normalizeTitle } from "./dataQualityService.js";
import { isSensitive } from "./memoryService.js";
import { evaluateRecordValue } from "./dataValueGateService.js";

export const DEFAULT_PROJECTS = [
  {
    name: "AI Kingdom",
    codename: "kingdom",
    description: "The AI Kingdom command center, council, secretary, provider routing, memory, treasury, and work-order system.",
    priority: "CRITICAL" as ProjectPriority,
    activeMilestone: "M14 Project Workspace",
    goals: ["Manage the King's AI command center", "Preserve project context", "Coordinate internal and external agents"],
    keywords: ["kingdom", "agent", "royal secretary", "council", "charter", "vision", "matter", "notice", "work order", "provider", "openrouter", "deepseek", "project routing", "artifact"],
    aliases: ["ai kingdom", "kingdom app", "royal command center"]
  },
  {
    name: "Godot Tower Defense",
    codename: "tower-defense",
    description: "Godot-based tower defense game initiative.",
    priority: "HIGH" as ProjectPriority,
    goals: ["Build a playable tower defense loop", "Improve performance and visual polish"],
    keywords: ["godot", "tower", "creep", "wave", "fps", "path", "vfx", "tower defense", "3d", "2.5d", "native client"],
    aliases: ["clone tower defend", "godot game", "tower game"]
  },
  {
    name: "Admin Dashboard Boilerplate",
    codename: "admin-boilerplate",
    description: "Reusable admin dashboard product foundation.",
    priority: "MEDIUM" as ProjectPriority,
    goals: ["Ship a reusable premium admin dashboard boilerplate"],
    keywords: ["admin", "dashboard", "rbac", "crud", "generator", "premium ui", "boilerplate"],
    aliases: ["admin dashboard", "dashboard boilerplate"]
  },
  {
    name: "E-commerce Inventory Boilerplate",
    codename: "inventory-boilerplate",
    description: "Reusable inventory and ecommerce operations boilerplate.",
    priority: "MEDIUM" as ProjectPriority,
    goals: ["Create a reusable ecommerce inventory operations product"],
    keywords: ["ecommerce", "inventory", "product", "stock", "order", "admin", "warehouse", "boilerplate"],
    aliases: ["inventory boilerplate", "ecommerce boilerplate"]
  },
  {
    name: "Backend Go Services",
    codename: "go-services",
    description: "Reusable Go backend service templates and infrastructure patterns.",
    priority: "MEDIUM" as ProjectPriority,
    goals: ["Build reusable Go service foundations"],
    keywords: ["go", "golang", "microservice", "grpc", "postgres", "mongo", "redis", "mqtt", "docker"],
    aliases: ["go services", "golang backend"]
  }
];

export async function ensureDefaultProjects() {
  for (const project of DEFAULT_PROJECTS) {
    await prisma.project.upsert({
      where: { name: project.name },
      update: {
        codename: project.codename,
        description: project.description,
        priority: project.priority,
        activeMilestone: project.activeMilestone,
        goals: project.goals,
        keywords: project.keywords,
        aliases: project.aliases
      },
      create: {
        ...project,
        status: "ACTIVE"
      }
    });
  }
}

export async function getProjectOverview(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project not found");
  const [tasks, matters, workOrders, reports, memories, artifacts, criticalMatters] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.matter.count({ where: { projectId } }),
    prisma.workOrder.count({ where: { projectId } }),
    prisma.report.count({ where: { projectId } }),
    prisma.memory.count({ where: { projectId } }),
    prisma.artifact.count({ where: { projectId } }),
    prisma.matter.count({ where: { projectId, priority: "CRITICAL", status: { notIn: ["REJECTED", "COMPLETED"] } } })
  ]);
  return { project, counts: { tasks, matters, workOrders, reports, memories, artifacts, criticalMatters } };
}

export async function createArtifact(input: {
  projectId?: string | null;
  title: string;
  type?: ArtifactType;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
  tags?: string[];
  traceId?: string | null;
}) {
  if (isSensitive(input.content) || isSensitive(input.title)) {
    throw new Error("Artifact appears to contain sensitive content");
  }
  const sourceType = input.sourceType ?? null;
  const sourceId = input.sourceId ?? null;
  const type = input.type ?? "GENERAL_NOTE";

  const createdBySystem = Boolean(sourceType || sourceId || input.traceId);

  // Apply M15H: Kingdom Data Value Gate
  const gateDecision = await evaluateRecordValue({
    recordType: "artifact",
    origin: createdBySystem ? "SYSTEM_GENERATED" : "USER_CREATED",
    title: input.title,
    content: input.content,
    sourceType,
    sourceId,
    category: type,
    projectId: input.projectId,
    traceId: input.traceId || undefined
  });

  if (gateDecision.decision === "REJECT" || gateDecision.decision === "ARCHIVE") {
    if (!createdBySystem) {
      throw new Error(gateDecision.reason);
    }
    return null;
  }

  const sameSource = await prisma.artifact.findMany({
    where: { sourceType, sourceId, type }
  });
  const existing = sameSource.find((artifact) => normalizeTitle(artifact.title) === normalizeTitle(input.title));
  if (existing) return existing;

  const dataQuality = classifyArtifact({
    title: input.title,
    sourceType,
    sourceId,
    traceId: input.traceId,
    createdBySystem,
    dataSource: sourceType ?? undefined
  });
  return prisma.artifact.create({
    data: {
      projectId: input.projectId ?? null,
      title: input.title,
      type,
      content: redact(input.content),
      sourceType,
      sourceId,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.toLowerCase()))],
      dataSource: sourceType,
      dataQuality,
      traceId: input.traceId ?? null,
      createdBySystem,
      provenance: sourceType || sourceId || input.traceId ? { sourceType, sourceId, traceId: input.traceId ?? null } : undefined
    }
  });
}

export async function exportProjectObsidian(projectId: string) {
  const [overview, tasks, matters, reports, memories, workOrders, artifacts] = await Promise.all([
    getProjectOverview(projectId),
    prisma.task.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.matter.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.report.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.memory.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.workOrder.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.artifact.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 50 })
  ]);
  const project = overview.project;
  const files = {
    "index.md": [
      `# ${project.name}`,
      project.description,
      "",
      "- [[project-status]]",
      "- [[architecture]]",
      "- [[decisions]]",
      "- [[reports]]",
      "- [[work-orders]]",
      "- [[memories]]",
      "- [[artifacts]]"
    ].join("\n"),
    "project-status.md": [
      `# Project Status`,
      `Status: ${project.status}`,
      `Priority: ${project.priority}`,
      `Active milestone: ${project.activeMilestone ?? "None"}`,
      "",
      "## Goals",
      formatList(project.goals),
      "",
      "## Tasks",
      formatList(tasks.map((task) => `${task.title} (${task.status})`)),
      "",
      "## Matters",
      formatList(matters.map((matter) => `${matter.title} (${matter.status}/${matter.priority})`))
    ].join("\n"),
    "architecture.md": `# Architecture\n\n${project.description}\n\nSee [[artifacts]] for architecture notes.`,
    "decisions.md": ["# Decisions", formatList(memories.filter((memory) => memory.type === "DECISION").map((memory) => `${memory.title}: ${memory.content}`))].join("\n\n"),
    "reports.md": ["# Reports", formatList(reports.map((report) => `[[${slug(report.title)}]] ${report.summary}`))].join("\n\n"),
    "work-orders.md": ["# Work Orders", formatList(workOrders.map((order) => `${order.title} (${order.status})`))].join("\n\n"),
    "memories.md": ["# Memories", formatList(memories.map((memory) => `[${memory.type}/${memory.importance}] ${memory.title}: ${memory.content}`))].join("\n\n"),
    "artifacts.md": ["# Artifacts", formatList(artifacts.map((artifact) => `[${artifact.type}] ${artifact.title}\n${artifact.content}`))].join("\n\n")
  };
  return { project, files };
}

function formatList(values: string[]): string {
  return values.length ? values.map((value) => `- ${redact(value)}`).join("\n") : "- None recorded.";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function redact(value: string): string {
  return value
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/(api[_-]?key|password|secret|token|authorization|bearer)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED_SECRET]");
}

function notFound(message: string) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}
