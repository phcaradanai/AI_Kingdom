import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCommand } from "./sandbox.js";
import {
  WORKSPACE_PREPARATION_FAILURE,
  getRunnerJobWorkspaceDir,
  prepareRunnerWorkspace
} from "./workspacePreparation.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content = "x"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writePackageJson(repoPath: string, scripts: Record<string, string> = {}): void {
  writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "runner-workspace-fixture", scripts }, null, 2));
}

test("workspace preparation fails clearly when RUNNER_REPO_PATH is missing", () => {
  const workspaceBase = makeTempDir("runner-workspace-missing-env-");
  try {
    assert.throws(
      () => prepareRunnerWorkspace({
        jobId: "job-missing-env",
        env: { RUNNER_WORKSPACE_BASE: workspaceBase },
        initializeGitBaseline: false
      }),
      { message: WORKSPACE_PREPARATION_FAILURE }
    );
  } finally {
    fs.rmSync(workspaceBase, { recursive: true, force: true });
  }
});

test("workspace preparation fails clearly when package.json is missing", () => {
  const sourceRepo = makeTempDir("runner-workspace-no-package-src-");
  const workspaceBase = makeTempDir("runner-workspace-no-package-base-");
  try {
    writeFile(path.join(sourceRepo, "apps", "api", "src", "index.ts"));
    assert.throws(
      () => prepareRunnerWorkspace({
        jobId: "job-no-package",
        env: { RUNNER_REPO_PATH: sourceRepo, RUNNER_WORKSPACE_BASE: workspaceBase },
        initializeGitBaseline: false
      }),
      { message: WORKSPACE_PREPARATION_FAILURE }
    );
  } finally {
    fs.rmSync(sourceRepo, { recursive: true, force: true });
    fs.rmSync(workspaceBase, { recursive: true, force: true });
  }
});

test("workspace preparation copies package.json into a per-job workspace", () => {
  const sourceRepo = makeTempDir("runner-workspace-copy-src-");
  const workspaceBase = makeTempDir("runner-workspace-copy-base-");
  try {
    writePackageJson(sourceRepo);
    writeFile(path.join(sourceRepo, "apps", "api", "src", "app.ts"), "export const ok = true;\n");

    const prepared = prepareRunnerWorkspace({
      jobId: "job-copy-1",
      env: { RUNNER_REPO_PATH: sourceRepo, RUNNER_WORKSPACE_BASE: workspaceBase },
      initializeGitBaseline: false
    });

    assert.equal(prepared.workspaceDir, getRunnerJobWorkspaceDir("job-copy-1", workspaceBase));
    assert.ok(fs.existsSync(path.join(prepared.workspaceDir, "package.json")));
    assert.ok(fs.existsSync(path.join(prepared.workspaceDir, "apps", "api", "src", "app.ts")));
  } finally {
    fs.rmSync(sourceRepo, { recursive: true, force: true });
    fs.rmSync(workspaceBase, { recursive: true, force: true });
  }
});

test("workspace preparation does not copy excluded paths", () => {
  const sourceRepo = makeTempDir("runner-workspace-exclude-src-");
  const workspaceBase = makeTempDir("runner-workspace-exclude-base-");
  try {
    writePackageJson(sourceRepo);
    for (const excluded of ["node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo", ".cache", "tmp"]) {
      writeFile(path.join(sourceRepo, excluded, "marker.txt"));
    }
    writeFile(path.join(sourceRepo, ".env"), "RUNNER_TOKEN=plain-token");
    writeFile(path.join(sourceRepo, ".env.local"), "OPENAI_API_KEY=secret");
    writeFile(path.join(sourceRepo, "apps", "api", ".env"), "DATABASE_URL=postgresql://user:pass@localhost/db");
    writeFile(path.join(sourceRepo, "apps", "web", ".env.test"), "VITE_SECRET=secret");
    writeFile(path.join(sourceRepo, "src", "index.ts"), "export {};\n");

    const prepared = prepareRunnerWorkspace({
      jobId: "job-exclude-1",
      env: { RUNNER_REPO_PATH: sourceRepo, RUNNER_WORKSPACE_BASE: workspaceBase },
      initializeGitBaseline: false
    });

    for (const excluded of ["node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo", ".cache", "tmp"]) {
      assert.equal(fs.existsSync(path.join(prepared.workspaceDir, excluded)), false, `${excluded} must not be copied`);
    }
    assert.equal(fs.existsSync(path.join(prepared.workspaceDir, ".env")), false);
    assert.equal(fs.existsSync(path.join(prepared.workspaceDir, ".env.local")), false);
    assert.equal(fs.existsSync(path.join(prepared.workspaceDir, "apps", "api", ".env")), false);
    assert.equal(fs.existsSync(path.join(prepared.workspaceDir, "apps", "web", ".env.test")), false);
    assert.ok(fs.existsSync(path.join(prepared.workspaceDir, "src", "index.ts")));
  } finally {
    fs.rmSync(sourceRepo, { recursive: true, force: true });
    fs.rmSync(workspaceBase, { recursive: true, force: true });
  }
});

test("validation commands run with cwd equal to the per-job workspace root", async () => {
  const sourceRepo = makeTempDir("runner-workspace-cwd-src-");
  const workspaceBase = makeTempDir("runner-workspace-cwd-base-");
  try {
    writePackageJson(sourceRepo, {
      typecheck: "node -e \"console.log(process.cwd())\""
    });

    const prepared = prepareRunnerWorkspace({
      jobId: "job-cwd-1",
      env: { RUNNER_REPO_PATH: sourceRepo, RUNNER_WORKSPACE_BASE: workspaceBase },
      initializeGitBaseline: false
    });

    const result = await runCommand("npm", ["run", "typecheck"], {
      workspaceRoot: prepared.workspaceDir
    });

    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.output, new RegExp(prepared.workspaceDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    fs.rmSync(sourceRepo, { recursive: true, force: true });
    fs.rmSync(workspaceBase, { recursive: true, force: true });
  }
});
