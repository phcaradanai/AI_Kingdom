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
  controllers: string[];
  apiRoutes: string[];
  frontendPages: string[];
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
  controllers: string[];
  apiRoutes: string[];
  frontendPages: string[];
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

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
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

export async function extractModules(srcDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function extractServices(servicesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(servicesDir);
    return entries
      .filter((f) => f.endsWith("Service.ts") && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function extractControllers(routesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(routesDir);
    return entries
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export function extractApiRoutesFromAppTs(content: string): string[] {
  // Build a map: importedVarName -> routeFileName
  const importMap = new Map<string, string>();
  const importRe = /import\s+(\w+)\s+from\s+["']\.\/routes\/(\w+)\.js["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    if (m[1] && m[2]) importMap.set(m[1], m[2]);
  }

  // Extract mount points: app.use("/api/...", ..., routerVar)
  const routes: string[] = [];
  for (const line of content.split("\n")) {
    const pathMatch = line.match(/app\.use\(\s*["'](\/api\/[^"']+)["']/);
    if (!pathMatch) continue;
    const mountPath = pathMatch[1];
    const routerMatch = line.match(/(\w+Router)\s*\)/);
    const routerVar = routerMatch?.[1];
    if (routerVar && importMap.has(routerVar)) {
      routes.push(`${mountPath} -> routes/${importMap.get(routerVar)}.ts`);
    }
  }
  return routes;
}

export async function extractFrontendPages(pagesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(pagesDir);
    return entries
      .filter((f) => f.endsWith("Page.tsx") || f.endsWith("Page.ts"))
      .map((f) => f.replace(/\.(tsx|ts)$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function resolveApiBase(resolvedBase: string): Promise<string | null> {
  if (await dirExists(path.join(resolvedBase, "src", "routes"))) return resolvedBase;
  const monoApiBase = path.join(resolvedBase, "apps", "api");
  if (await dirExists(path.join(monoApiBase, "src", "routes"))) return monoApiBase;
  return null;
}

export async function resolveWebPagesDir(resolvedBase: string, apiBase: string | null): Promise<string | null> {
  // Direct web app rooted at resolvedBase
  const directPages = path.join(resolvedBase, "src", "pages");
  if (await dirExists(directPages)) return directPages;

  // Monorepo: apps/web within resolvedBase
  const monoPages = path.join(resolvedBase, "apps", "web", "src", "pages");
  if (await dirExists(monoPages)) return monoPages;

  // Sibling web app when apiBase IS the resolvedBase (e.g. localPath = apps/api)
  if (apiBase && apiBase === resolvedBase) {
    const parentDir = path.dirname(apiBase);
    const siblingPages = path.join(parentDir, "web", "src", "pages");
    // Only follow if sibling is within one level of apiBase's parent
    if (siblingPages.startsWith(parentDir + path.sep) && await dirExists(siblingPages)) {
      return siblingPages;
    }
  }

  return null;
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

  const apiBase = await resolveApiBase(resolvedBase);

  // Resolve pkg and schema paths from apiBase when available, falling back to root
  const pkgPath = apiBase
    ? path.join(apiBase, "package.json")
    : path.join(resolvedBase, "package.json");
  const schemaPath = apiBase
    ? path.join(apiBase, "prisma", "schema.prisma")
    : path.join(resolvedBase, "prisma", "schema.prisma");

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

  // Structure extraction
  const srcDir = apiBase ? path.join(apiBase, "src") : null;
  const [modules, services, controllers] = await Promise.all([
    srcDir ? extractModules(srcDir) : Promise.resolve([]),
    srcDir ? extractServices(path.join(srcDir, "services")) : Promise.resolve([]),
    srcDir ? extractControllers(path.join(srcDir, "routes")) : Promise.resolve([]),
  ]);

  const appTsPath = srcDir ? path.join(srcDir, "app.ts") : null;
  const appTsContent = appTsPath ? await safeReadFile(appTsPath) : null;
  const apiRoutes = appTsContent ? extractApiRoutesFromAppTs(appTsContent) : [];

  const webPagesDir = await resolveWebPagesDir(resolvedBase, apiBase);
  const frontendPages = webPagesDir ? await extractFrontendPages(webPagesDir) : [];

  return {
    framework: frameworks.length > 0 ? frameworks.join(", ") : null,
    language,
    packageManager,
    prismaModels,
    modules,
    services,
    controllers,
    apiRoutes,
    frontendPages,
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
      controllers: result.controllers,
      apiRoutes: result.apiRoutes,
      frontendPages: result.frontendPages,
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

function formatSnapshotList(items: string[]): string {
  return items.length ? items.map((s) => `- ${s}`).join("\n") : "- None detected.";
}

export function formatRepositoryContextSection(snapshot: RepositorySnapshotDto | null): string {
  if (!snapshot) {
    return [
      "## Repository Context",
      "",
      "Repository Snapshot: not available.",
      "",
      "Action required:",
      "Run Scan Repository from the Project Workspace before assigning repository-aware implementation work."
    ].join("\n");
  }
  return [
    "## Repository Context",
    `Snapshot generated at: ${snapshot.generatedAt}`,
    `Repository URL: ${snapshot.repositoryUrl ?? "Not configured"}`,
    `Branch: ${snapshot.branch ?? "Not detected"}`,
    "",
    "Framework:",
    snapshot.framework ?? "Not detected",
    "",
    "Language:",
    snapshot.language ?? "Not detected",
    "",
    "Package manager:",
    snapshot.packageManager ?? "Not detected",
    "",
    "Prisma models:",
    formatSnapshotList(snapshot.prismaModels),
    "",
    "Modules:",
    formatSnapshotList(snapshot.modules),
    "",
    "Services:",
    formatSnapshotList(snapshot.services),
    "",
    "Controllers:",
    formatSnapshotList(snapshot.controllers),
    "",
    "API routes:",
    formatSnapshotList(snapshot.apiRoutes),
    "",
    "Frontend pages:",
    formatSnapshotList(snapshot.frontendPages),
    "",
    "Repository summary:",
    snapshot.summary ?? "Not available"
  ].join("\n");
}

export function buildContextSourceTrace(opts: {
  hasProjectMetadata: boolean;
  hasKingdomMemory: boolean;
  snapshot: RepositorySnapshotDto | null;
}): string {
  const lines = [
    "## Context Sources",
    `- Project metadata: ${opts.hasProjectMetadata ? "loaded" : "missing"}`,
    `- Kingdom memory: ${opts.hasKingdomMemory ? "loaded" : "missing"}`,
    `- Repository snapshot: ${opts.snapshot ? "loaded" : "missing"}`
  ];
  if (opts.snapshot) {
    lines.push(`- Repository snapshot generated at: ${opts.snapshot.generatedAt}`);
  }
  return lines.join("\n");
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
  controllers: unknown;
  apiRoutes: unknown;
  frontendPages: unknown;
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
    controllers: Array.isArray(snapshot.controllers) ? (snapshot.controllers as string[]) : [],
    apiRoutes: Array.isArray(snapshot.apiRoutes) ? (snapshot.apiRoutes as string[]) : [],
    frontendPages: Array.isArray(snapshot.frontendPages) ? (snapshot.frontendPages as string[]) : [],
    summary: snapshot.summary,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
