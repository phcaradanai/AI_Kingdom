import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildContextSourceTrace,
  detectLanguage,
  detectPackageManager,
  extractApiRoutesFromAppTs,
  extractControllers,
  extractFrontendPages,
  extractModules,
  extractPrismaModels,
  extractServices,
  formatRepositoryContextSection,
  resolveApiBase,
  resolveWebPagesDir,
  type RepositorySnapshotDto,
} from "./repositoryScanService.js";

const SNAPSHOT_BASE: RepositorySnapshotDto = {
  id: "snap-1",
  projectId: "proj-1",
  generatedAt: "2026-06-08T10:00:00.000Z",
  repositoryUrl: "https://github.com/example/repo",
  branch: "main",
  framework: "Express",
  language: "TypeScript",
  packageManager: "npm",
  prismaModels: ["User", "Project", "WorkOrder"],
  modules: ["routes", "services"],
  services: ["authService", "memoryService"],
  controllers: ["tasks", "workOrders"],
  apiRoutes: ["/api/tasks -> routes/tasks.ts", "/api/work-orders -> routes/workOrders.ts"],
  frontendPages: ["ProjectsPage", "WorkOrdersPage"],
  summary: "Express + TypeScript project. 3 Prisma models detected. Package manager: npm.",
  createdAt: "2026-06-08T10:00:00.000Z",
  updatedAt: "2026-06-08T10:00:00.000Z"
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "repo-scan-test-"));
}

async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ── extractPrismaModels ────────────────────────────────────────────────────────

describe("extractPrismaModels", () => {
  it("extracts model names from a schema", () => {
    const schema = `
model User {
  id String @id
}

model Post {
  id String @id
}

enum Status {
  ACTIVE
}
    `;
    assert.deepEqual(extractPrismaModels(schema), ["User", "Post"]);
  });

  it("returns empty array for schema with no models", () => {
    assert.deepEqual(extractPrismaModels('datasource db { provider = "postgresql" }'), []);
  });

  it("handles single model", () => {
    const schema = `
model Project {
  id   String @id
  name String
}
    `;
    assert.deepEqual(extractPrismaModels(schema), ["Project"]);
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────────

describe("detectLanguage", () => {
  it("returns TypeScript when typescript in devDependencies", () => {
    assert.equal(detectLanguage({ devDependencies: { typescript: "^5.0.0" } }), "TypeScript");
  });

  it("returns TypeScript when @types/node present", () => {
    assert.equal(detectLanguage({ devDependencies: { "@types/node": "^20.0.0" } }), "TypeScript");
  });

  it("returns JavaScript when no TS markers", () => {
    assert.equal(detectLanguage({ dependencies: { express: "^4.0.0" } }), "JavaScript");
  });
});

// ── detectPackageManager ──────────────────────────────────────────────────────

describe("detectPackageManager", () => {
  it("reads yarn from packageManager field", () => {
    assert.equal(detectPackageManager({ packageManager: "yarn@4.0.0" }), "yarn");
  });

  it("reads pnpm from packageManager field", () => {
    assert.equal(detectPackageManager({ packageManager: "pnpm@9.0.0" }), "pnpm");
  });

  it("defaults to npm when no packageManager field", () => {
    assert.equal(detectPackageManager({}), "npm");
  });
});

// ── extractModules ────────────────────────────────────────────────────────────

describe("extractModules", () => {
  it("returns sorted list of subdirectories", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.mkdir(path.join(tmp, "routes"));
      await fs.mkdir(path.join(tmp, "services"));
      await fs.mkdir(path.join(tmp, "middleware"));
      await fs.writeFile(path.join(tmp, "app.ts"), ""); // file — should be ignored
      const modules = await extractModules(tmp);
      assert.deepEqual(modules, ["middleware", "routes", "services"]);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns empty array when directory does not exist", async () => {
    const modules = await extractModules("/nonexistent/path/src");
    assert.deepEqual(modules, []);
  });
});

// ── extractServices ───────────────────────────────────────────────────────────

describe("extractServices", () => {
  it("returns service file names without .ts extension", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.writeFile(path.join(tmp, "memoryService.ts"), "");
      await fs.writeFile(path.join(tmp, "reportService.ts"), "");
      await fs.writeFile(path.join(tmp, "memoryService.test.ts"), ""); // excluded
      await fs.writeFile(path.join(tmp, "orchestrator.ts"), ""); // excluded — not a Service
      const services = await extractServices(tmp);
      assert.deepEqual(services, ["memoryService", "reportService"]);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns empty array when directory does not exist", async () => {
    const services = await extractServices("/nonexistent/services");
    assert.deepEqual(services, []);
  });
});

// ── extractControllers ────────────────────────────────────────────────────────

describe("extractControllers", () => {
  it("returns route file names excluding test files", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.writeFile(path.join(tmp, "tasks.ts"), "");
      await fs.writeFile(path.join(tmp, "agents.ts"), "");
      await fs.writeFile(path.join(tmp, "agents.test.ts"), ""); // excluded
      const controllers = await extractControllers(tmp);
      assert.deepEqual(controllers, ["agents", "tasks"]);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns empty array when directory does not exist", async () => {
    const controllers = await extractControllers("/nonexistent/routes");
    assert.deepEqual(controllers, []);
  });
});

// ── extractApiRoutesFromAppTs ─────────────────────────────────────────────────

describe("extractApiRoutesFromAppTs", () => {
  it("extracts mount points from app.ts content", () => {
    const content = `
import tasksRouter from "./routes/tasks.js";
import workOrdersRouter from "./routes/workOrders.js";
import authRouter from "./routes/auth.js";

app.use("/api/auth", authRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/work-orders", requireAuth, requireRole("KING"), workOrdersRouter);
    `;
    const routes = extractApiRoutesFromAppTs(content);
    assert.ok(routes.includes("/api/auth -> routes/auth.ts"), `auth missing: ${routes.join(", ")}`);
    assert.ok(routes.includes("/api/tasks -> routes/tasks.ts"), `tasks missing: ${routes.join(", ")}`);
    assert.ok(routes.includes("/api/work-orders -> routes/workOrders.ts"), `work-orders missing: ${routes.join(", ")}`);
  });

  it("returns empty array for content with no app.use api routes", () => {
    assert.deepEqual(extractApiRoutesFromAppTs("const x = 1;"), []);
  });

  it("does not include non-api app.use calls", () => {
    const content = `
import healthRouter from "./routes/health.js";
app.use("/health", healthRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
    `;
    const routes = extractApiRoutesFromAppTs(content);
    assert.ok(!routes.some((r) => r.startsWith("/health")), "non-api route leaked");
  });
});

// ── extractFrontendPages ──────────────────────────────────────────────────────

describe("extractFrontendPages", () => {
  it("returns page file names without extension", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.writeFile(path.join(tmp, "ProjectsPage.tsx"), "");
      await fs.writeFile(path.join(tmp, "WorkOrdersPage.tsx"), "");
      await fs.writeFile(path.join(tmp, "AppLayout.tsx"), ""); // excluded — not a Page
      const pages = await extractFrontendPages(tmp);
      assert.deepEqual(pages, ["ProjectsPage", "WorkOrdersPage"]);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns empty array when directory does not exist", async () => {
    const pages = await extractFrontendPages("/nonexistent/pages");
    assert.deepEqual(pages, []);
  });
});

// ── formatRepositoryContextSection ───────────────────────────────────────────

describe("formatRepositoryContextSection", () => {
  it("returns action-required note when snapshot is null", () => {
    const section = formatRepositoryContextSection(null);
    assert.match(section, /## Repository Context/);
    assert.match(section, /Repository Snapshot: not available/);
    assert.match(section, /Action required/);
    assert.match(section, /Scan Repository/);
  });

  it("renders all fields from a full snapshot", () => {
    const section = formatRepositoryContextSection(SNAPSHOT_BASE);
    assert.match(section, /## Repository Context/);
    assert.match(section, /Snapshot generated at: 2026-06-08T10:00:00.000Z/);
    assert.match(section, /Repository URL: https:\/\/github.com\/example\/repo/);
    assert.match(section, /Branch: main/);
    assert.match(section, /Framework:\nExpress/);
    assert.match(section, /Language:\nTypeScript/);
    assert.match(section, /Package manager:\nnpm/);
    assert.match(section, /Prisma models:/);
    assert.match(section, /- User/);
    assert.match(section, /- Project/);
    assert.match(section, /- WorkOrder/);
    assert.match(section, /Modules:/);
    assert.match(section, /- routes/);
    assert.match(section, /Services:/);
    assert.match(section, /- authService/);
    assert.match(section, /Controllers:/);
    assert.match(section, /- workOrders/);
    assert.match(section, /API routes:/);
    assert.match(section, /\/api\/work-orders/);
    assert.match(section, /Frontend pages:/);
    assert.match(section, /- ProjectsPage/);
    assert.match(section, /Repository summary:/);
    assert.match(section, /Express \+ TypeScript/);
  });

  it("renders 'None detected.' for empty arrays", () => {
    const empty = { ...SNAPSHOT_BASE, prismaModels: [], modules: [], services: [], controllers: [], apiRoutes: [], frontendPages: [] };
    const section = formatRepositoryContextSection(empty);
    assert.equal((section.match(/- None detected\./g) ?? []).length, 6);
  });

  it("renders 'Not detected' for null fields", () => {
    const nullFields = { ...SNAPSHOT_BASE, framework: null, language: null, packageManager: null, repositoryUrl: null, branch: null };
    const section = formatRepositoryContextSection(nullFields);
    assert.match(section, /Repository URL: Not configured/);
    assert.match(section, /Branch: Not detected/);
    assert.match(section, /Framework:\nNot detected/);
  });

  it("missing structure fallback — snapshot with empty controllers and frontendPages", () => {
    const sparse = { ...SNAPSHOT_BASE, controllers: [], frontendPages: [] };
    const section = formatRepositoryContextSection(sparse);
    assert.match(section, /Controllers:\n- None detected\./);
    assert.match(section, /Frontend pages:\n- None detected\./);
  });
});

// ── buildContextSourceTrace ───────────────────────────────────────────────────

describe("buildContextSourceTrace", () => {
  it("shows loaded when snapshot present", () => {
    const trace = buildContextSourceTrace({ hasProjectMetadata: true, hasKingdomMemory: true, snapshot: SNAPSHOT_BASE });
    assert.match(trace, /## Context Sources/);
    assert.match(trace, /Project metadata: loaded/);
    assert.match(trace, /Kingdom memory: loaded/);
    assert.match(trace, /Repository snapshot: loaded/);
    assert.match(trace, /Repository snapshot generated at: 2026-06-08T10:00:00.000Z/);
  });

  it("shows missing when snapshot is null", () => {
    const trace = buildContextSourceTrace({ hasProjectMetadata: false, hasKingdomMemory: true, snapshot: null });
    assert.match(trace, /Project metadata: missing/);
    assert.match(trace, /Repository snapshot: missing/);
    assert.ok(!trace.includes("generated at"));
  });
});

// ── resolveApiBase ────────────────────────────────────────────────────────────

describe("resolveApiBase", () => {
  it("returns base when src/routes exists directly", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.mkdir(path.join(tmp, "src", "routes"), { recursive: true });
      const result = await resolveApiBase(tmp);
      assert.equal(result, tmp);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns apps/api when monorepo structure detected", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.mkdir(path.join(tmp, "apps", "api", "src", "routes"), { recursive: true });
      const result = await resolveApiBase(tmp);
      assert.equal(result, path.join(tmp, "apps", "api"));
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns null when no api structure found", async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await resolveApiBase(tmp);
      assert.equal(result, null);
    } finally {
      await cleanup(tmp);
    }
  });
});

// ── resolveWebPagesDir (sibling path) ─────────────────────────────────────────

describe("resolveWebPagesDir", () => {
  it("finds pages in monorepo apps/web when base is monorepo root", async () => {
    const tmp = await makeTmpDir();
    try {
      await fs.mkdir(path.join(tmp, "apps", "web", "src", "pages"), { recursive: true });
      const result = await resolveWebPagesDir(tmp, null);
      assert.equal(result, path.join(tmp, "apps", "web", "src", "pages"));
    } finally {
      await cleanup(tmp);
    }
  });

  it("finds sibling web pages when localPath is apps/api", async () => {
    const tmp = await makeTmpDir();
    try {
      // Simulate: localPath = tmp/apps/api, web lives at tmp/apps/web
      const apiBase = path.join(tmp, "apps", "api");
      await fs.mkdir(path.join(tmp, "apps", "web", "src", "pages"), { recursive: true });
      await fs.writeFile(path.join(tmp, "apps", "web", "src", "pages", "FooPage.tsx"), "");
      await fs.mkdir(apiBase, { recursive: true });
      // resolvedBase = apiBase (localPath IS the api directory)
      const result = await resolveWebPagesDir(apiBase, apiBase);
      assert.equal(result, path.join(tmp, "apps", "web", "src", "pages"));
      // Also verify the page is found
      const pages = result ? await extractFrontendPages(result) : [];
      assert.ok(pages.includes("FooPage"), `FooPage missing from ${JSON.stringify(pages)}`);
    } finally {
      await cleanup(tmp);
    }
  });

  it("returns null when no pages directory found", async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await resolveWebPagesDir(tmp, null);
      assert.equal(result, null);
    } finally {
      await cleanup(tmp);
    }
  });
});

// ── Prompt injection: controllers and frontendPages appear in formatted section ──

describe("prompt injection — new fields in context section", () => {
  it("controllers appear in formatted repository context", () => {
    const snap = { ...SNAPSHOT_BASE, controllers: ["tasks", "workOrders", "agents"] };
    const section = formatRepositoryContextSection(snap);
    assert.match(section, /Controllers:/);
    assert.match(section, /- tasks/);
    assert.match(section, /- workOrders/);
    assert.match(section, /- agents/);
  });

  it("frontendPages appear in formatted repository context", () => {
    const snap = { ...SNAPSHOT_BASE, frontendPages: ["ProjectsPage", "WorkOrdersPage", "AgentsPage"] };
    const section = formatRepositoryContextSection(snap);
    assert.match(section, /Frontend pages:/);
    assert.match(section, /- ProjectsPage/);
    assert.match(section, /- WorkOrdersPage/);
    assert.match(section, /- AgentsPage/);
  });

  it("api routes include work-orders mount point", () => {
    const snap = { ...SNAPSHOT_BASE, apiRoutes: ["/api/work-orders -> routes/workOrders.ts"] };
    const section = formatRepositoryContextSection(snap);
    assert.match(section, /\/api\/work-orders -> routes\/workOrders\.ts/);
  });
});
