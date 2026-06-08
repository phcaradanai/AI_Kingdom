import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLanguage, detectPackageManager, extractPrismaModels } from "./repositoryScanService.js";

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
