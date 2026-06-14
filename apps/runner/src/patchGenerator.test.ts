import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runValidation } from "./patchGenerator.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeWorkspace(): string {
  const workspace = makeTempDir("runner-patch-validation-workspace-");
  writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { typecheck: "noop", test: "noop", build: "noop" } }));
  return workspace;
}

function makeFakeNpm(markerFile: string, failWorkspace?: string): string {
  const binDir = makeTempDir("runner-patch-validation-bin-");
  const script = [
    "#!/bin/sh",
    `printf '%s|%s|%s\\n' "$PWD" "$*" "$TEST_DATABASE_URL" >> ${JSON.stringify(markerFile)}`,
    `if [ "$4" = ${JSON.stringify(failWorkspace ?? "__never__")} ]; then echo "failed workspace $4" >&2; exit 7; fi`,
    "echo ok",
    "exit 0"
  ].join("\n");
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(npmPath, script, { mode: 0o755 });
  return binDir;
}

test("patch validation runs explicit workspace test commands from workspace root", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-patch-validation-marker-"), "commands.txt");
  const binDir = makeFakeNpm(markerFile);
  const previousPath = process.env.PATH;
  const previousTestDatabaseUrl = process.env.TEST_DATABASE_URL;
  try {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/test";

    const results = await runValidation(workspace);

    assert.deepEqual(results.map((r) => r.command), [
      "npm run typecheck",
      "npm run test --workspace @ai-kingdom/api",
      "npm run test --workspace @ai-kingdom/runner",
      "npm run test --workspace @ai-kingdom/web",
      "npm run build"
    ]);
    assert.ok(results.every((r) => r.success));
    assert.ok(results.every((r) => r.cwd === path.resolve(workspace)));
    assert.ok(results.every((r) => r.timedOut === false));

    const recorded = fs.readFileSync(markerFile, "utf8");
    assert.match(recorded, new RegExp(`${path.resolve(workspace).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\|run test --workspace @ai-kingdom/api`));
    assert.match(recorded, /postgresql:\/\/user:pass@localhost:5432\/test/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = previousTestDatabaseUrl;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("patch validation surfaces a failing test line near the end of a large stdout", async () => {
  const workspace = makeWorkspace();
  const binDir = makeTempDir("runner-patch-validation-bin-");
  const lines = Array.from({ length: 1000 }, (_, i) => `# pass ${i}`);
  lines.push("not ok 1 - some assertion failed");
  lines.push("# fail 1");
  const script = [
    "#!/bin/sh",
    `if [ "$4" = "@ai-kingdom/api" ]; then`,
    ...lines.map((l) => `  echo ${JSON.stringify(l)}`),
    `  exit 1`,
    `fi`,
    "echo ok",
    "exit 0"
  ].join("\n");
  fs.writeFileSync(path.join(binDir, "npm"), script, { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;

    const results = await runValidation(workspace);
    const failed = results.find((r) => r.command === "npm run test --workspace @ai-kingdom/api");

    assert.ok(failed);
    assert.equal(failed.exitCode, 1);
    assert.match(failed.stdout, /not ok 1 - some assertion failed/);
    assert.match(failed.stdout, /# fail 1/);
    assert.match(failed.output, /not ok 1 - some assertion failed/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("patch validation marks outputTruncated when a command's output exceeds the tail line cap", async () => {
  const workspace = makeWorkspace();
  const binDir = makeTempDir("runner-patch-validation-bin-");
  const script = [
    "#!/bin/sh",
    `if [ "$4" = "@ai-kingdom/api" ]; then`,
    "  i=0",
    "  while [ $i -lt 1000 ]; do",
    '    echo "# pass $i"',
    "    i=$((i+1))",
    "  done",
    "fi",
    "echo ok",
    "exit 0"
  ].join("\n");
  fs.writeFileSync(path.join(binDir, "npm"), script, { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;

    const results = await runValidation(workspace);
    const apiResult = results.find((r) => r.command === "npm run test --workspace @ai-kingdom/api");
    const buildResult = results.find((r) => r.command === "npm run build");

    assert.ok(apiResult);
    assert.equal(apiResult.outputTruncated, true);
    assert.ok(buildResult);
    assert.equal(buildResult.outputTruncated, false);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("patch validation reports a timeout message distinct from a generic failure", async () => {
  const workspace = makeWorkspace();
  const binDir = makeTempDir("runner-patch-validation-bin-");
  const script = [
    "#!/bin/sh",
    `if [ "$4" = "@ai-kingdom/api" ]; then`,
    "  sleep 5",
    "fi",
    "echo ok",
    "exit 0"
  ].join("\n");
  fs.writeFileSync(path.join(binDir, "npm"), script, { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    process.env.RUNNER_COMMAND_TIMEOUT_MS = "50";

    const results = await runValidation(workspace);
    const apiResult = results.find((r) => r.command === "npm run test --workspace @ai-kingdom/api");

    assert.ok(apiResult);
    assert.equal(apiResult.exitCode, null);
    assert.equal(apiResult.timedOut, true);
    assert.equal(apiResult.success, false);
    assert.match(apiResult.message ?? "", /RUNNER_COMMAND_TIMEOUT_MS/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    delete process.env.RUNNER_COMMAND_TIMEOUT_MS;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("patch validation exposes the failing workspace stderr", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-patch-validation-marker-"), "commands.txt");
  const binDir = makeFakeNpm(markerFile, "@ai-kingdom/web");
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;

    const results = await runValidation(workspace);
    const failed = results.find((r) => r.command === "npm run test --workspace @ai-kingdom/web");

    assert.ok(failed);
    assert.equal(failed.exitCode, 7);
    assert.equal(failed.success, false);
    assert.match(failed.stderr, /failed workspace @ai-kingdom\/web/);
    assert.match(failed.output, /CWD:/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});
