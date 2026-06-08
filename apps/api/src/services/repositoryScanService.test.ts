import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContextSourceTrace, detectLanguage, detectPackageManager, extractPrismaModels, formatRepositoryContextSection, type RepositorySnapshotDto } from "./repositoryScanService.js";

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
  modules: ["src/routes", "src/services"],
  services: ["src/services/authService.ts"],
  apiRoutes: ["GET /api/users -> src/routes/users.ts"],
  summary: "Express + TypeScript project. 3 Prisma models detected. Package manager: npm.",
  createdAt: "2026-06-08T10:00:00.000Z",
  updatedAt: "2026-06-08T10:00:00.000Z"
};

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
    assert.match(section, /- src\/routes/);
    assert.match(section, /Services:/);
    assert.match(section, /- src\/services\/authService.ts/);
    assert.match(section, /API routes:/);
    assert.match(section, /- GET \/api\/users/);
    assert.match(section, /Repository summary:/);
    assert.match(section, /Express \+ TypeScript/);
  });

  it("renders 'None detected.' for empty arrays", () => {
    const empty = { ...SNAPSHOT_BASE, prismaModels: [], modules: [], services: [], apiRoutes: [] };
    const section = formatRepositoryContextSection(empty);
    assert.equal((section.match(/- None detected\./g) ?? []).length, 4);
  });

  it("renders 'Not detected' for null fields", () => {
    const nullFields = { ...SNAPSHOT_BASE, framework: null, language: null, packageManager: null, repositoryUrl: null, branch: null };
    const section = formatRepositoryContextSection(nullFields);
    assert.match(section, /Repository URL: Not configured/);
    assert.match(section, /Branch: Not detected/);
    assert.match(section, /Framework:\nNot detected/);
  });

});

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
