import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEPENDENCY_INSTALL_FAILURE,
  getDependencyInstallConfig,
  installRunnerDependencies
} from "./dependencyInstaller.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeWorkspace(): string {
  const workspace = makeTempDir("runner-install-workspace-");
  writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "install-fixture" }));
  return workspace;
}

function makeFakeNpm(opts: { exitCode?: number; output?: string; markerFile: string; envFile?: string }): string {
  const binDir = makeTempDir("runner-install-bin-");
  const script = [
    "#!/bin/sh",
    `echo "$PWD" > ${JSON.stringify(opts.markerFile)}`,
    opts.envFile ? `printf 'TEST_DATABASE_URL=%s\\nDATABASE_URL=%s\\nRUNNER_TOKEN=%s\\n' "$TEST_DATABASE_URL" "$DATABASE_URL" "$RUNNER_TOKEN" > ${JSON.stringify(opts.envFile)}` : "",
    `echo ${JSON.stringify(opts.output ?? "fake npm ok")}`,
    `exit ${opts.exitCode ?? 0}`
  ].filter(Boolean).join("\n");
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(npmPath, script, { mode: 0o755 });
  return binDir;
}

test("dependency install defaults to npm ci for sandbox and validation jobs", () => {
  assert.deepEqual(getDependencyInstallConfig("SANDBOX_PATCH", {}).args, ["ci"]);
  assert.deepEqual(getDependencyInstallConfig("VALIDATION_ONLY", {}).args, ["ci"]);
  assert.equal(getDependencyInstallConfig("OTHER", {}).enabled, false);
});

test("install is skipped only when RUNNER_INSTALL_DEPS=false", async () => {
  const workspace = makeWorkspace();
  try {
    const skipped = await installRunnerDependencies({
      workspaceRoot: workspace,
      mode: "SANDBOX_PATCH",
      env: { RUNNER_INSTALL_DEPS: "false", RUNNER_INSTALL_COMMAND: "npm run unsafe" }
    });
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.success, true);

    const enabled = getDependencyInstallConfig("SANDBOX_PATCH", { RUNNER_INSTALL_DEPS: "true" });
    assert.equal(enabled.enabled, true);
    assert.deepEqual(enabled.args, ["ci"]);
    assert.equal(getDependencyInstallConfig("SANDBOX_PATCH", { RUNNER_INSTALL_DEPS: "0" }).enabled, true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("dependency install command runs with cwd equal to workspace root", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-install-marker-"), "cwd.txt");
  const binDir = makeFakeNpm({ markerFile });
  try {
    const result = await installRunnerDependencies({
      workspaceRoot: workspace,
      mode: "SANDBOX_PATCH",
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, true, result.output);
    assert.equal(result.displayCommand, "npm ci");
    assert.equal(
      fs.realpathSync(fs.readFileSync(markerFile, "utf8").trim()),
      fs.realpathSync(workspace)
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("dependency install receives allowlisted validation database env", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-install-env-marker-"), "cwd.txt");
  const envFile = path.join(path.dirname(markerFile), "env.txt");
  const binDir = makeFakeNpm({ markerFile, envFile });
  try {
    const result = await installRunnerDependencies({
      workspaceRoot: workspace,
      mode: "SANDBOX_PATCH",
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
        RUNNER_TOKEN: "plain-runner-token",
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, true, result.output);
    const forwarded = fs.readFileSync(envFile, "utf8");
    assert.match(forwarded, /TEST_DATABASE_URL=postgresql:\/\/user:pass@localhost:5432\/test/);
    assert.match(forwarded, /RUNNER_TOKEN=\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("install failure returns clear sanitized output", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-install-fail-marker-"), "cwd.txt");
  const binDir = makeFakeNpm({ exitCode: 42, output: "failed with RUNNER_TOKEN=secret-token", markerFile });
  try {
    process.env.RUNNER_TOKEN = "secret-token";
    const result = await installRunnerDependencies({
      workspaceRoot: workspace,
      mode: "VALIDATION_ONLY",
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, false);
    assert.equal(result.exitCode, 42);
    assert.doesNotMatch(result.output, /secret-token/);
    assert.match(result.output, /REDACTED/);
  } finally {
    delete process.env.RUNNER_TOKEN;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("invalid install command reports dependency installation failure", async () => {
  const workspace = makeWorkspace();
  try {
    const result = await installRunnerDependencies({
      workspaceRoot: workspace,
      mode: "SANDBOX_PATCH",
      env: { RUNNER_INSTALL_COMMAND: "npm run deploy" }
    });

    assert.equal(result.success, false);
    assert.match(result.output, new RegExp(DEPENDENCY_INSTALL_FAILURE));
    assert.match(result.output, /npm ci or npm install/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
