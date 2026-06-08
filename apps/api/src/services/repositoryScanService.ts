import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/prisma.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB guard

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
};

type ScanResult = {
  framework: string | null;
  language: string | null;
  packageManager: string | null;
  prismaModels: string[];
  modules: string[];
  services: string[];
  apiRoutes: string[];
  summary: string;
};

export type RepositorySnapshotDto = {
  id: string;
  projectId: string;
  generatedAt: string;
  repositoryUrl: string | null;
  branch: string | null;
  framework: string | null;
  language: string | null;
  packageManager: string | null;
  prismaModels: string[];
  modules: string[];
  services: string[];
  apiRoutes: string[];
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

function detectFrameworks(pkg: PackageJson): string[] {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found: string[] = [];

  const checks: [string, string][] = [
    ["next", "Next.js"],
    ["nuxt", "Nuxt"],
    ["@remix-run/node", "Remix"],
    ["astro", "Astro"],
    ["react", "React"],
    ["vue", "Vue"],
    ["@angular/core", "Angular"],
    ["svelte", "Svelte"],
    ["solid-js", "SolidJS"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["@nestjs/core", "NestJS"],
    ["koa", "Koa"],
    ["hono", "Hono"],
    ["@hapi/hapi", "Hapi"],
  ];

  for (const [key, label] of checks) {
    if (key in deps) found.push(label);
  }
  return found;
}

export function detectLanguage(pkg: PackageJson): string {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return "typescript" in deps || "@types/node" in deps ? "TypeScript" : "JavaScript";
}

export function detectPackageManager(pkg: PackageJson): string {
  const pm = pkg.packageManager;
  if (pm) {
    if (pm.startsWith("yarn")) return "yarn";
    if (pm.startsWith("pnpm")) return "pnpm";
    if (pm.startsWith("npm")) return "npm";
  }
  return "npm";
}

export function extractPrismaModels(schemaContent: string): string[] {
  const models: string[] = [];
  const re = /^model\s+(\w+)\s*\{/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(schemaContent)) !== null) {
    if (match[1]) models.push(match[1]);
  }
  return models;
}

function buildSummary(frameworks: string[], language: string, prismaModels: string[], pm: string): string {
  const parts: string[] = [];
  if (frameworks.length > 0) parts.push(frameworks.join(" + "));
  parts.push(`${language} project`);
  if (prismaModels.length > 0) parts.push(`${prismaModels.length} Prisma model${prismaModels.length !== 1 ? "s" : ""} detected`);
  parts.push(`Package manager: ${pm}`);
  return parts.join(". ") + ".";
}

async function scanLocalPath(localPath: string): Promise<ScanResult> {
  // Resolve and validate the path to prevent traversal
  const resolvedBase = await fs.realpath(localPath).catch(() => null);
  if (!resolvedBase) throw new Error(`Local path does not exist or is not accessible: ${localPath}`);

  const stat = await fs.stat(resolvedBase);
  if (!stat.isDirectory()) throw new Error("Local path is not a directory");

  const pkgPath = path.join(resolvedBase, "package.json");
  const schemaPath = path.join(resolvedBase, "prisma", "schema.prisma");

  const [pkgContent, schemaContent] = await Promise.all([
    safeReadFile(pkgPath),
    safeReadFile(schemaPath),
  ]);

  let frameworks: string[] = [];
  let language = "JavaScript";
  let packageManager = "npm";

  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent) as PackageJson;
      frameworks = detectFrameworks(pkg);
      language = detectLanguage(pkg);
      packageManager = detectPackageManager(pkg);
    } catch {
      // malformed package.json — skip
    }
  }

  const prismaModels = schemaContent ? extractPrismaModels(schemaContent) : [];

  return {
    framework: frameworks.length > 0 ? frameworks.join(", ") : null,
    language,
    packageManager,
    prismaModels,
    modules: [],
    services: [],
    apiRoutes: [],
    summary: buildSummary(frameworks, language, prismaModels, packageManager),
  };
}

export async function scanAndSaveSnapshot(projectId: string): Promise<RepositorySnapshotDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw Object.assign(new Error("Project not found"), { name: "NotFoundError" });

  if (!project.localPath) {
    throw new Error("Project has no localPath configured. Set localPath on the project before scanning.");
  }

  const result = await scanLocalPath(project.localPath);

  const snapshot = await prisma.repositorySnapshot.create({
    data: {
      projectId,
      repositoryUrl: project.repositoryUrl,
      branch: null,
      framework: result.framework,
      language: result.language,
      packageManager: result.packageManager,
      prismaModels: result.prismaModels,
      modules: result.modules,
      services: result.services,
      apiRoutes: result.apiRoutes,
      summary: result.summary,
    },
  });

  return toDto(snapshot);
}

export async function getLatestSnapshot(projectId: string): Promise<RepositorySnapshotDto | null> {
  const snapshot = await prisma.repositorySnapshot.findFirst({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });
  return snapshot ? toDto(snapshot) : null;
}

function toDto(snapshot: {
  id: string;
  projectId: string;
  generatedAt: Date;
  repositoryUrl: string | null;
  branch: string | null;
  framework: string | null;
  language: string | null;
  packageManager: string | null;
  prismaModels: unknown;
  modules: unknown;
  services: unknown;
  apiRoutes: unknown;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RepositorySnapshotDto {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    generatedAt: snapshot.generatedAt.toISOString(),
    repositoryUrl: snapshot.repositoryUrl,
    branch: snapshot.branch,
    framework: snapshot.framework,
    language: snapshot.language,
    packageManager: snapshot.packageManager,
    prismaModels: Array.isArray(snapshot.prismaModels) ? (snapshot.prismaModels as string[]) : [],
    modules: Array.isArray(snapshot.modules) ? (snapshot.modules as string[]) : [],
    services: Array.isArray(snapshot.services) ? (snapshot.services as string[]) : [],
    apiRoutes: Array.isArray(snapshot.apiRoutes) ? (snapshot.apiRoutes as string[]) : [],
    summary: snapshot.summary,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
