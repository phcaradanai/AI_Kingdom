import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { auditLog } from "./auditService.js";
import {
  DEFAULT_ALLOWED_GLOBS,
  DEFAULT_BLOCKED_GLOBS,
  assertInsideRoot,
  isAllowedPath,
  isBlockedPath
} from "./safePathService.js";
import type { LocalDocumentRiskLevel, LocalDocumentScanStatus, Prisma } from "@prisma/client";

export const LOCAL_DOCS_STALE_HOURS = 24;

const MAX_FILES_WALKED = 5000;
const MAX_DEPTH = 14;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "secrets"
]);

const IMPORTANT_FILENAMES = ["README.md", "AGENTS.md", "PROJECT_STATUS.md", "ARCHITECTURE.md", "NEXT_TASK.md"];

export function hashPath(absolutePath: string): string {
  return crypto.createHash("sha256").update(path.resolve(absolutePath)).digest("hex");
}

function hashContent(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export type CreateLocalDocumentRootInput = {
  name: string;
  rootPath: string;
  allowedGlobs?: string[];
  blockedGlobs?: string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
  isActive?: boolean;
};

export type LocalDocumentRootDto = {
  id: string;
  projectId: string;
  name: string;
  rootPath: string;
  rootPathHash: string;
  isActive: boolean;
  allowedGlobs: string[];
  blockedGlobs: string[];
  maxFileBytes: number;
  maxTotalBytes: number;
  lastScannedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRootDto(root: {
  id: string;
  projectId: string;
  name: string;
  rootPath: string;
  rootPathHash: string;
  isActive: boolean;
  allowedGlobs: Prisma.JsonValue;
  blockedGlobs: Prisma.JsonValue;
  maxFileBytes: number;
  maxTotalBytes: number;
  lastScannedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LocalDocumentRootDto {
  return {
    id: root.id,
    projectId: root.projectId,
    name: root.name,
    rootPath: root.rootPath,
    rootPathHash: root.rootPathHash,
    isActive: root.isActive,
    allowedGlobs: Array.isArray(root.allowedGlobs) ? (root.allowedGlobs as string[]) : DEFAULT_ALLOWED_GLOBS,
    blockedGlobs: Array.isArray(root.blockedGlobs) ? (root.blockedGlobs as string[]) : DEFAULT_BLOCKED_GLOBS,
    maxFileBytes: root.maxFileBytes,
    maxTotalBytes: root.maxTotalBytes,
    lastScannedAt: root.lastScannedAt ? root.lastScannedAt.toISOString() : null,
    lastError: root.lastError,
    createdAt: root.createdAt.toISOString(),
    updatedAt: root.updatedAt.toISOString()
  };
}

export async function createLocalDocumentRoot(projectId: string, input: CreateLocalDocumentRootInput): Promise<LocalDocumentRootDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Object.assign(new Error("Project not found"), { name: "NotFoundError" });

  const resolvedPath = path.resolve(input.rootPath);
  let realPath: string;
  try {
    realPath = await fs.realpath(resolvedPath);
    const stat = await fs.stat(realPath);
    if (!stat.isDirectory()) throw new Error("rootPath is not a directory");
  } catch (err) {
    throw new Error(`rootPath is not accessible: ${err instanceof Error ? err.message : String(err)}`);
  }

  const root = await prisma.localDocumentRoot.create({
    data: {
      projectId,
      name: input.name,
      rootPath: realPath,
      rootPathHash: hashPath(realPath),
      isActive: input.isActive ?? true,
      allowedGlobs: (input.allowedGlobs ?? DEFAULT_ALLOWED_GLOBS) as Prisma.InputJsonValue,
      blockedGlobs: (input.blockedGlobs ?? DEFAULT_BLOCKED_GLOBS) as Prisma.InputJsonValue,
      maxFileBytes: input.maxFileBytes ?? 200_000,
      maxTotalBytes: input.maxTotalBytes ?? 5_000_000
    }
  });

  await auditLog({
    action: "local_document_root_created",
    resourceType: "LocalDocumentRoot",
    resourceId: root.id,
    metadata: { projectId, name: root.name, rootPathHash: root.rootPathHash }
  }).catch(() => undefined);

  return toRootDto(root);
}

export async function listLocalDocumentRoots(projectId: string): Promise<LocalDocumentRootDto[]> {
  const roots = await prisma.localDocumentRoot.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" }
  });
  return roots.map(toRootDto);
}

export type UpdateLocalDocumentRootInput = {
  name?: string;
  isActive?: boolean;
  allowedGlobs?: string[];
  blockedGlobs?: string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
};

export async function updateLocalDocumentRoot(rootId: string, input: UpdateLocalDocumentRootInput): Promise<LocalDocumentRootDto> {
  const existing = await prisma.localDocumentRoot.findUnique({ where: { id: rootId } });
  if (!existing) throw Object.assign(new Error("LocalDocumentRoot not found"), { name: "NotFoundError" });

  const root = await prisma.localDocumentRoot.update({
    where: { id: rootId },
    data: {
      name: input.name ?? undefined,
      isActive: input.isActive ?? undefined,
      allowedGlobs: input.allowedGlobs ? (input.allowedGlobs as Prisma.InputJsonValue) : undefined,
      blockedGlobs: input.blockedGlobs ? (input.blockedGlobs as Prisma.InputJsonValue) : undefined,
      maxFileBytes: input.maxFileBytes ?? undefined,
      maxTotalBytes: input.maxTotalBytes ?? undefined
    }
  });

  await auditLog({
    action: "local_document_root_updated",
    resourceType: "LocalDocumentRoot",
    resourceId: root.id,
    metadata: { projectId: root.projectId, changes: Object.keys(input) }
  }).catch(() => undefined);

  return toRootDto(root);
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

type WalkedFile = {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: Date;
};

async function walkDirectory(rootRealPath: string): Promise<WalkedFile[]> {
  const results: WalkedFile[] = [];

  async function walk(dirAbsolute: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES_WALKED) return;

    let entries;
    try {
      entries = await fs.readdir(dirAbsolute, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES_WALKED) return;

      // Never follow symlinks during scanning.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        await walk(path.join(dirAbsolute, entry.name), depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const absolutePath = path.join(dirAbsolute, entry.name);
      const relativePath = path.relative(rootRealPath, absolutePath).split(path.sep).join("/");

      let stat;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        continue;
      }

      results.push({ relativePath, absolutePath, sizeBytes: stat.size, modifiedAt: stat.mtime });
    }
  }

  await walk(rootRealPath, 0);
  return results;
}

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const FRAMEWORK_CHECKS: [string, string][] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["express", "Express"],
  ["@prisma/client", "Prisma"],
  ["fastify", "Fastify"],
  ["vite", "Vite"],
  ["typescript", "TypeScript"]
];

function detectStackFromPackageJson(pkg: PackageJson): string[] {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found: string[] = [];
  for (const [key, label] of FRAMEWORK_CHECKS) {
    if (key in deps) found.push(label);
  }
  return found;
}

const RISK_RULES: { pattern: RegExp; riskLevel: LocalDocumentRiskLevel; reason: string }[] = [
  { pattern: /(^|\/)(auth|authentication|login|session)/i, riskLevel: "HIGH", reason: "Authentication-related path" },
  { pattern: /(^|\/)(payment|billing|treasury|budget)/i, riskLevel: "HIGH", reason: "Financial-related path" },
  { pattern: /(^|\/)(secret|credential|token|key)/i, riskLevel: "HIGH", reason: "Secret/credential-related path" },
  { pattern: /(^|\/)(migrations?|schema\.prisma)/i, riskLevel: "MEDIUM", reason: "Database schema/migration path" },
  { pattern: /\/(routes|services)\//i, riskLevel: "MEDIUM", reason: "Application routing/service logic" }
];

function classifyRisk(relativePath: string): { riskLevel: LocalDocumentRiskLevel; reason: string } | null {
  for (const rule of RISK_RULES) {
    if (rule.pattern.test(relativePath)) {
      return { riskLevel: rule.riskLevel, reason: rule.reason };
    }
  }
  return null;
}

function summarizeMarkdown(content: string): string {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, 3).join(" ").slice(0, 300);
}

function summarizeCode(relativePath: string, content: string): string {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return `${relativePath} (${content.length} bytes). ${firstLine.trim().slice(0, 150)}`;
}

export type LocalDocumentSnapshotDto = {
  id: string;
  projectId: string;
  localDocumentRootId: string;
  scanStatus: LocalDocumentScanStatus;
  scannedAt: string;
  fileCount: number;
  totalBytes: number;
  summary: string;
  importantFiles: { relativePath: string; fileType: string }[];
  detectedStack: string[] | null;
  packageScripts: Record<string, string> | null;
  riskZones: { relativePath: string; riskLevel: string; reason: string }[] | null;
  provenance: Record<string, unknown>;
  isStale: boolean;
  createdAt: string;
};

export type LocalDocumentInsightDto = {
  id: string;
  snapshotId: string;
  projectId: string;
  relativePath: string;
  fileType: string;
  sizeBytes: number;
  modifiedAt: string;
  contentHash: string;
  summary: string | null;
  tags: string[];
  riskLevel: LocalDocumentRiskLevel;
  isDoc: boolean;
  isCode: boolean;
  isConfig: boolean;
  isBlocked: boolean;
  provenance: Record<string, unknown>;
  createdAt: string;
};

function isStaleSnapshot(scannedAt: Date): boolean {
  const ageMs = Date.now() - scannedAt.getTime();
  return ageMs > LOCAL_DOCS_STALE_HOURS * 60 * 60 * 1000;
}

function toSnapshotDto(snapshot: {
  id: string;
  projectId: string;
  localDocumentRootId: string;
  scanStatus: LocalDocumentScanStatus;
  scannedAt: Date;
  fileCount: number;
  totalBytes: number;
  summary: string;
  importantFiles: Prisma.JsonValue;
  detectedStack: Prisma.JsonValue;
  packageScripts: Prisma.JsonValue;
  riskZones: Prisma.JsonValue;
  provenance: Prisma.JsonValue;
  createdAt: Date;
}): LocalDocumentSnapshotDto {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    localDocumentRootId: snapshot.localDocumentRootId,
    scanStatus: snapshot.scanStatus,
    scannedAt: snapshot.scannedAt.toISOString(),
    fileCount: snapshot.fileCount,
    totalBytes: snapshot.totalBytes,
    summary: snapshot.summary,
    importantFiles: Array.isArray(snapshot.importantFiles) ? (snapshot.importantFiles as never) : [],
    detectedStack: Array.isArray(snapshot.detectedStack) ? (snapshot.detectedStack as string[]) : null,
    packageScripts: snapshot.packageScripts && typeof snapshot.packageScripts === "object" && !Array.isArray(snapshot.packageScripts)
      ? (snapshot.packageScripts as Record<string, string>)
      : null,
    riskZones: Array.isArray(snapshot.riskZones) ? (snapshot.riskZones as never) : null,
    provenance: (snapshot.provenance ?? {}) as Record<string, unknown>,
    isStale: snapshot.scanStatus === "STALE" || isStaleSnapshot(snapshot.scannedAt),
    createdAt: snapshot.createdAt.toISOString()
  };
}

function toInsightDto(insight: {
  id: string;
  snapshotId: string;
  projectId: string;
  relativePath: string;
  fileType: string;
  sizeBytes: number;
  modifiedAt: Date;
  contentHash: string;
  summary: string | null;
  tags: string[];
  riskLevel: LocalDocumentRiskLevel;
  isDoc: boolean;
  isCode: boolean;
  isConfig: boolean;
  isBlocked: boolean;
  provenance: Prisma.JsonValue;
  createdAt: Date;
}): LocalDocumentInsightDto {
  return {
    id: insight.id,
    snapshotId: insight.snapshotId,
    projectId: insight.projectId,
    relativePath: insight.relativePath,
    fileType: insight.fileType,
    sizeBytes: insight.sizeBytes,
    modifiedAt: insight.modifiedAt.toISOString(),
    contentHash: insight.contentHash,
    summary: insight.summary,
    tags: insight.tags,
    riskLevel: insight.riskLevel,
    isDoc: insight.isDoc,
    isCode: insight.isCode,
    isConfig: insight.isConfig,
    isBlocked: insight.isBlocked,
    provenance: (insight.provenance ?? {}) as Record<string, unknown>,
    createdAt: insight.createdAt.toISOString()
  };
}

function fileTypeFor(relativePath: string): { fileType: string; isDoc: boolean; isCode: boolean; isConfig: boolean } {
  const ext = path.extname(relativePath).toLowerCase();
  const base = path.basename(relativePath);
  if (ext === ".md") return { fileType: "markdown", isDoc: true, isCode: false, isConfig: false };
  if (base === "package.json" || base.startsWith("tsconfig") || /\.(json|yaml|yml)$/.test(ext) || base === "schema.prisma") {
    return { fileType: "config", isDoc: false, isCode: false, isConfig: true };
  }
  if (/\.(ts|tsx|js|jsx)$/.test(ext)) return { fileType: "code", isDoc: false, isCode: true, isConfig: false };
  return { fileType: ext.replace(".", "") || "file", isDoc: false, isCode: false, isConfig: false };
}

export async function scanLocalDocumentRoot(rootId: string, _options: Record<string, never> = {}): Promise<LocalDocumentSnapshotDto> {
  const root = await prisma.localDocumentRoot.findUnique({ where: { id: rootId } });
  if (!root) throw Object.assign(new Error("LocalDocumentRoot not found"), { name: "NotFoundError" });

  await auditLog({
    action: "local_document_scan_started",
    resourceType: "LocalDocumentRoot",
    resourceId: root.id,
    metadata: { projectId: root.projectId, rootPathHash: root.rootPathHash }
  }).catch(() => undefined);

  const allowedGlobs = Array.isArray(root.allowedGlobs) ? (root.allowedGlobs as string[]) : DEFAULT_ALLOWED_GLOBS;
  const blockedGlobs = Array.isArray(root.blockedGlobs) ? (root.blockedGlobs as string[]) : DEFAULT_BLOCKED_GLOBS;
  const scanTime = new Date();

  let realRootPath: string;
  try {
    realRootPath = await fs.realpath(root.rootPath);
  } catch (err) {
    const message = `Root path is not accessible: ${err instanceof Error ? err.message : String(err)}`;
    const snapshot = await prisma.localDocumentSnapshot.create({
      data: {
        projectId: root.projectId,
        localDocumentRootId: root.id,
        scanStatus: "FAILED",
        scannedAt: scanTime,
        fileCount: 0,
        totalBytes: 0,
        summary: message,
        importantFiles: [] as Prisma.InputJsonValue,
        provenance: { rootId: root.id, rootPathHash: root.rootPathHash, scanTime: scanTime.toISOString() } as Prisma.InputJsonValue
      }
    });
    await prisma.localDocumentRoot.update({ where: { id: root.id }, data: { lastScannedAt: scanTime, lastError: message } });
    await auditLog({
      action: "local_document_scan_failed",
      resourceType: "LocalDocumentRoot",
      resourceId: root.id,
      metadata: { projectId: root.projectId, rootPathHash: root.rootPathHash, error: message }
    }).catch(() => undefined);
    return toSnapshotDto(snapshot);
  }

  const walked = await walkDirectory(realRootPath);

  let totalBytes = 0;

  type InsightRow = {
    projectId: string;
    relativePath: string;
    fileType: string;
    sizeBytes: number;
    modifiedAt: Date;
    contentHash: string;
    summary: string | null;
    tags: string[];
    riskLevel: LocalDocumentRiskLevel;
    isDoc: boolean;
    isCode: boolean;
    isConfig: boolean;
    isBlocked: boolean;
    provenance: Prisma.InputJsonValue;
  };

  const rows: InsightRow[] = [];
  const importantFiles: { relativePath: string; fileType: string }[] = [];
  let detectedStack: string[] | null = null;
  let packageScripts: Record<string, string> | null = null;
  const riskZones: { relativePath: string; riskLevel: string; reason: string }[] = [];
  let scanStatus: LocalDocumentScanStatus = "READY";

  for (const file of walked) {
    if (isBlockedPath(file.relativePath, blockedGlobs)) continue;
    if (!isAllowedPath(file.relativePath, allowedGlobs)) continue;
    if (file.sizeBytes > root.maxFileBytes) continue;
    if (totalBytes + file.sizeBytes > root.maxTotalBytes) {
      scanStatus = "PARTIAL";
      break;
    }

    let content: Buffer;
    try {
      content = await fs.readFile(file.absolutePath);
    } catch {
      continue;
    }

    const { fileType, isDoc, isCode, isConfig } = fileTypeFor(file.relativePath);
    const text = content.toString("utf-8");
    const risk = classifyRisk(file.relativePath);
    const tags: string[] = [];
    if (isDoc) tags.push("doc");
    if (isCode) tags.push("code");
    if (isConfig) tags.push("config");

    let summary: string | null = null;
    if (isDoc) summary = summarizeMarkdown(text);
    else if (isConfig || isCode) summary = summarizeCode(file.relativePath, text);

    if (path.basename(file.relativePath) === "package.json") {
      try {
        const pkg = JSON.parse(text) as PackageJson;
        if (pkg.scripts) packageScripts = pkg.scripts;
        const stack = detectStackFromPackageJson(pkg);
        if (stack.length > 0) detectedStack = [...new Set([...(detectedStack ?? []), ...stack])];
      } catch {
        // malformed package.json — skip stack/script extraction
      }
    }

    if (IMPORTANT_FILENAMES.includes(path.basename(file.relativePath))) {
      importantFiles.push({ relativePath: file.relativePath, fileType });
    }

    if (risk) {
      riskZones.push({ relativePath: file.relativePath, riskLevel: risk.riskLevel, reason: risk.reason });
    }

    rows.push({
      projectId: root.projectId,
      relativePath: file.relativePath,
      fileType,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      contentHash: hashContent(content),
      summary,
      tags,
      riskLevel: risk?.riskLevel ?? "LOW",
      isDoc,
      isCode,
      isConfig,
      isBlocked: false,
      provenance: {
        rootId: root.id,
        rootPathHash: root.rootPathHash,
        relativePath: file.relativePath,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt.toISOString(),
        scanTime: scanTime.toISOString()
      } as Prisma.InputJsonValue
    });

    totalBytes += file.sizeBytes;
  }

  const summary = buildSnapshotSummary(rows.length, totalBytes, importantFiles, detectedStack, riskZones);

  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.localDocumentSnapshot.create({
      data: {
        projectId: root.projectId,
        localDocumentRootId: root.id,
        scanStatus,
        scannedAt: scanTime,
        fileCount: rows.length,
        totalBytes,
        summary,
        importantFiles: importantFiles as unknown as Prisma.InputJsonValue,
        detectedStack: (detectedStack ?? []) as unknown as Prisma.InputJsonValue,
        packageScripts: (packageScripts ?? {}) as unknown as Prisma.InputJsonValue,
        riskZones: riskZones as unknown as Prisma.InputJsonValue,
        provenance: {
          rootId: root.id,
          rootPathHash: root.rootPathHash,
          rootNames: [root.name],
          scanTime: scanTime.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    if (rows.length > 0) {
      await tx.localDocumentInsight.createMany({
        data: rows.map((row) => ({ ...row, snapshotId: created.id }))
      });
    }

    return created;
  });

  await prisma.localDocumentRoot.update({ where: { id: root.id }, data: { lastScannedAt: scanTime, lastError: null } });

  await auditLog({
    action: "local_document_scan_completed",
    resourceType: "LocalDocumentRoot",
    resourceId: root.id,
    metadata: {
      projectId: root.projectId,
      rootPathHash: root.rootPathHash,
      snapshotId: snapshot.id,
      fileCount: rows.length,
      totalBytes,
      scanStatus
    }
  }).catch(() => undefined);

  return toSnapshotDto(snapshot);
}

function buildSnapshotSummary(
  fileCount: number,
  totalBytes: number,
  importantFiles: { relativePath: string }[],
  detectedStack: string[] | null,
  riskZones: { relativePath: string }[]
): string {
  const parts: string[] = [];
  parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"} scanned (${totalBytes} bytes).`);
  parts.push(importantFiles.length > 0
    ? `Found: ${importantFiles.map((f) => f.relativePath).join(", ")}.`
    : "No important docs (README/AGENTS/PROJECT_STATUS/ARCHITECTURE/NEXT_TASK) found.");
  if (detectedStack && detectedStack.length > 0) parts.push(`Stack: ${detectedStack.join(", ")}.`);
  if (riskZones.length > 0) parts.push(`${riskZones.length} risk zone${riskZones.length === 1 ? "" : "s"} flagged.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Read access
// ---------------------------------------------------------------------------

export async function getLatestLocalDocumentSnapshot(projectId: string): Promise<LocalDocumentSnapshotDto | null> {
  const snapshot = await prisma.localDocumentSnapshot.findFirst({
    where: { projectId },
    orderBy: { scannedAt: "desc" }
  });
  return snapshot ? toSnapshotDto(snapshot) : null;
}

export async function listLocalDocumentInsights(projectId: string, snapshotId?: string): Promise<LocalDocumentInsightDto[]> {
  let resolvedSnapshotId = snapshotId;
  if (!resolvedSnapshotId) {
    const latest = await prisma.localDocumentSnapshot.findFirst({
      where: { projectId },
      orderBy: { scannedAt: "desc" }
    });
    if (!latest) return [];
    resolvedSnapshotId = latest.id;
  }

  const insights = await prisma.localDocumentInsight.findMany({
    where: { projectId, snapshotId: resolvedSnapshotId },
    orderBy: { relativePath: "asc" }
  });
  return insights.map(toInsightDto);
}

export type LocalProjectContext = {
  hasSnapshot: boolean;
  snapshot: LocalDocumentSnapshotDto | null;
  roots: LocalDocumentRootDto[];
  isStale: boolean;
  contextText: string;
};

export async function getLocalProjectContextForAgent(projectId: string): Promise<LocalProjectContext> {
  const [snapshot, roots] = await Promise.all([
    getLatestLocalDocumentSnapshot(projectId),
    listLocalDocumentRoots(projectId)
  ]);

  if (!snapshot) {
    return {
      hasSnapshot: false,
      snapshot: null,
      roots,
      isStale: true,
      contextText: [
        "## Local Document Context",
        "",
        "No local document snapshot available.",
        `Local document roots: ${roots.length > 0 ? roots.map((r) => r.name).join(", ") : "none configured"}`,
        roots.length === 0
          ? "Action required: configure a Local Document Root for this project."
          : "Action required: run a local docs scan before relying on local context."
      ].join("\n")
    };
  }

  const lines = [
    "## Local Document Context",
    `Snapshot id: ${snapshot.id}`,
    `Snapshot scanned at: ${snapshot.scannedAt}`,
    `Local document roots: ${roots.length > 0 ? roots.map((r) => r.name).join(", ") : "none configured"}`,
    snapshot.isStale ? "WARNING: local document snapshot is STALE (older than 24h or marked stale)." : "Snapshot is current.",
    "",
    "Important docs found:",
    snapshot.importantFiles.length > 0
      ? snapshot.importantFiles.map((f) => `- ${f.relativePath}`).join("\n")
      : "- None found.",
    "",
    "Package scripts:",
    snapshot.packageScripts && Object.keys(snapshot.packageScripts).length > 0
      ? Object.entries(snapshot.packageScripts).map(([k, v]) => `- ${k}: ${v}`).join("\n")
      : "- None detected.",
    "",
    "Detected stack:",
    snapshot.detectedStack && snapshot.detectedStack.length > 0 ? snapshot.detectedStack.join(", ") : "Not detected.",
    "",
    "Risk zones:",
    snapshot.riskZones && snapshot.riskZones.length > 0
      ? snapshot.riskZones.map((z) => `- ${z.relativePath} (${z.riskLevel}): ${z.reason}`).join("\n")
      : "- None flagged.",
    "",
    "Summary:",
    snapshot.summary
  ];

  return {
    hasSnapshot: true,
    snapshot,
    roots,
    isStale: snapshot.isStale,
    contextText: lines.join("\n")
  };
}

export async function markLocalSnapshotStale(projectId: string, reason: string): Promise<number> {
  const result = await prisma.localDocumentSnapshot.updateMany({
    where: { projectId, scanStatus: { not: "STALE" } },
    data: { scanStatus: "STALE" }
  });

  if (result.count > 0) {
    await auditLog({
      action: "local_document_snapshot_marked_stale",
      resourceType: "Project",
      resourceId: projectId,
      metadata: { reason, snapshotsAffected: result.count }
    }).catch(() => undefined);
  }

  return result.count;
}

/**
 * Cheap mtime-only check (no full scan) for whether any important doc under
 * an active root has changed since the latest snapshot was taken.
 */
export async function detectLocalDocsChangedSinceSnapshot(projectId: string): Promise<{ changed: boolean; relativePath?: string; rootName?: string }> {
  const [roots, snapshot] = await Promise.all([
    listLocalDocumentRoots(projectId),
    getLatestLocalDocumentSnapshot(projectId)
  ]);
  if (!snapshot) return { changed: false };
  const scannedAt = new Date(snapshot.scannedAt);

  for (const root of roots) {
    if (!root.isActive) continue;
    let realRoot: string;
    try {
      realRoot = await fs.realpath(root.rootPath);
    } catch {
      continue;
    }
    for (const filename of IMPORTANT_FILENAMES) {
      try {
        const filePath = path.join(realRoot, filename);
        const assertion = await assertInsideRoot(realRoot, filePath);
        if (!assertion.ok) continue;
        const stat = await fs.stat(assertion.realPath);
        if (stat.isFile() && stat.mtime > scannedAt) {
          return { changed: true, relativePath: filename, rootName: root.name };
        }
      } catch {
        // file does not exist, skip
      }
    }
  }

  return { changed: false };
}

// ---------------------------------------------------------------------------
// Guarded file read
// ---------------------------------------------------------------------------

export type ReadLocalFileResult =
  | { ok: true; content: string; relativePath: string; rootId: string; sizeBytes: number }
  | { ok: false; reason: string };

export async function readLocalDocumentFile(rootId: string, relativePath: string): Promise<ReadLocalFileResult> {
  const root = await prisma.localDocumentRoot.findUnique({ where: { id: rootId } });
  if (!root) return { ok: false, reason: "LocalDocumentRoot not found" };

  const allowedGlobs = Array.isArray(root.allowedGlobs) ? (root.allowedGlobs as string[]) : DEFAULT_ALLOWED_GLOBS;
  const blockedGlobs = Array.isArray(root.blockedGlobs) ? (root.blockedGlobs as string[]) : DEFAULT_BLOCKED_GLOBS;

  const { safeReadTextFile } = await import("./safePathService.js");
  const result = await safeReadTextFile(root.rootPath, relativePath, {
    allowedGlobs,
    blockedGlobs,
    maxFileBytes: root.maxFileBytes
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, content: result.content, relativePath, rootId, sizeBytes: result.sizeBytes };
}
