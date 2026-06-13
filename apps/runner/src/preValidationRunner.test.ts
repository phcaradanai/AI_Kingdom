import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PREVALIDATION_FAILURE_PREFIX,
  getPreValidationConfig,
  runPreValidationCommands
} from "./preValidationRunner.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeWorkspace(): string {
  const workspace = makeTempDir("runner-prevalidation-workspace-");
  writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "prevalidation-fixture" }));
  return workspace;
}

function makeFakeNpm(opts: { exitCode?: number; output?: string; markerFile: string; argsFile?: string; envFile?: string }): string {
  const binDir = makeTempDir("runner-prevalidation-bin-");
  const script = [
    "#!/bin/sh",
    `echo "$PWD" > ${JSON.stringify(opts.markerFile)}`,
    opts.argsFile ? `printf '%s\\n' "$@" > ${JSON.stringify(opts.argsFile)}` : "",
    opts.envFile ? `printf 'TEST_DATABASE_URL=%s\\nDATABASE_URL=%s\\nRUNNER_TOKEN=%s\\n' "$TEST_DATABASE_URL" "$DATABASE_URL" "$RUNNER_TOKEN" > ${JSON.stringify(opts.envFile)}` : "",
    `echo ${JSON.stringify(opts.output ?? "generated")}`,
    `exit ${opts.exitCode ?? 0}`
  ].filter(Boolean).join("\n");
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(npmPath, script, { mode: 0o755 });
  return binDir;
}

test("pre-validation defaults to npm run db:generate", () => {
  const config = getPreValidationConfig({});
  assert.equal(config.commands.length, 1);
  assert.equal(config.commands[0]?.displayCommand, "npm run db:generate");
});

test("pre-validation command runs with cwd equal to workspace root", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-prevalidation-marker-"), "cwd.txt");
  const argsFile = path.join(path.dirname(markerFile), "args.txt");
  const binDir = makeFakeNpm({ markerFile, argsFile });
  try {
    const result = await runPreValidationCommands({
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, true, result.steps[0]?.output);
    assert.equal(result.steps[0]?.displayCommand, "npm run db:generate");
    assert.equal(result.steps[0]?.cwd, path.resolve(workspace));
    assert.equal(
      fs.realpathSync(fs.readFileSync(markerFile, "utf8").trim()),
      fs.realpathSync(workspace)
    );
    assert.equal(fs.readFileSync(argsFile, "utf8").trim(), "run\ndb:generate");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("pre-validation failure returns clear sanitized output", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-prevalidation-fail-marker-"), "cwd.txt");
  const binDir = makeFakeNpm({ exitCode: 42, output: "failed with RUNNER_TOKEN=secret-token", markerFile });
  try {
    process.env.RUNNER_TOKEN = "secret-token";
    const result = await runPreValidationCommands({
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, false);
    assert.equal(result.steps[0]?.exitCode, 42);
    assert.match(result.failureMessage ?? "", new RegExp(`${PREVALIDATION_FAILURE_PREFIX}: npm run db:generate`));
    assert.doesNotMatch(result.steps[0]?.output ?? "", /secret-token/);
    assert.match(result.steps[0]?.output ?? "", /REDACTED/);
  } finally {
    delete process.env.RUNNER_TOKEN;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("pre-validation receives allowlisted validation database env", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-prevalidation-env-marker-"), "cwd.txt");
  const envFile = path.join(path.dirname(markerFile), "env.txt");
  const binDir = makeFakeNpm({ markerFile, envFile });
  try {
    const result = await runPreValidationCommands({
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        DATABASE_URL: "postgresql://user:pass@localhost:5432/dev",
        RUNNER_TOKEN: "plain-runner-token",
        RUNNER_COMMAND_TIMEOUT_MS: "5000"
      }
    });

    assert.equal(result.success, true, result.steps[0]?.output);
    const forwarded = fs.readFileSync(envFile, "utf8");
    assert.match(forwarded, /TEST_DATABASE_URL=\n/);
    assert.match(forwarded, /DATABASE_URL=postgresql:\/\/user:pass@localhost:5432\/dev/);
    assert.match(forwarded, /RUNNER_TOKEN=\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("unsafe pre-validation command is rejected before spawn", async () => {
  const workspace = makeWorkspace();
  try {
    const result = await runPreValidationCommands({
      workspaceRoot: workspace,
      env: { RUNNER_PREVALIDATION_COMMANDS: "npm run deploy" }
    });

    assert.equal(result.success, false);
    assert.match(result.failureMessage ?? "", new RegExp(PREVALIDATION_FAILURE_PREFIX));
    assert.match(result.steps[0]?.output ?? "", /only npm run db:generate/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
