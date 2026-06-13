import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCommand } from "./sandbox.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeWorkspace(): string {
  const workspace = makeTempDir("runner-sandbox-workspace-");
  writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { typecheck: "noop" } }));
  return workspace;
}

function makeFakeNpm(markerFile: string, output?: string): string {
  const binDir = makeTempDir("runner-sandbox-bin-");
  const script = [
    "#!/bin/sh",
    `printf 'TEST_DATABASE_URL=%s\\nDATABASE_URL=%s\\nRUNNER_TOKEN=%s\\n' "$TEST_DATABASE_URL" "$DATABASE_URL" "$RUNNER_TOKEN" > ${JSON.stringify(markerFile)}`,
    `echo ${JSON.stringify(output ?? "fake npm ok")}`,
    "exit 0"
  ].join("\n");
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(npmPath, script, { mode: 0o755 });
  return binDir;
}

test("validation receives TEST_DATABASE_URL when it exists in runner process env", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-sandbox-marker-"), "env.txt");
  const binDir = makeFakeNpm(markerFile);
  try {
    const result = await runCommand("npm", ["run", "typecheck"], {
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
        RUNNER_TOKEN: "plain-runner-token"
      }
    });

    assert.equal(result.exitCode, 0, result.output);
    const forwarded = fs.readFileSync(markerFile, "utf8");
    assert.match(forwarded, /TEST_DATABASE_URL=postgresql:\/\/user:pass@localhost:5432\/test/);
    assert.match(forwarded, /RUNNER_TOKEN=\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("validation receives DATABASE_URL when TEST_DATABASE_URL is missing", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-sandbox-marker-"), "env.txt");
  const binDir = makeFakeNpm(markerFile);
  try {
    const result = await runCommand("npm", ["run", "test", "--workspace", "@ai-kingdom/runner"], {
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        DATABASE_URL: "postgresql://user:pass@localhost:5432/dev"
      }
    });

    assert.equal(result.exitCode, 0, result.output);
    const forwarded = fs.readFileSync(markerFile, "utf8");
    assert.match(forwarded, /TEST_DATABASE_URL=\n/);
    assert.match(forwarded, /DATABASE_URL=postgresql:\/\/user:pass@localhost:5432\/dev/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("workspace validation commands run at the workspace root with forwarded env", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-sandbox-marker-"), "env.txt");
  const binDir = makeFakeNpm(markerFile);
  try {
    const result = await runCommand("npm", ["run", "test", "--workspace", "@ai-kingdom/api"], {
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
        NODE_ENV: "test"
      }
    });

    assert.equal(result.exitCode, 0, result.output);
    assert.equal(result.cwd, path.resolve(workspace));
    const forwarded = fs.readFileSync(markerFile, "utf8");
    assert.match(forwarded, /TEST_DATABASE_URL=postgresql:\/\/user:pass@localhost:5432\/test/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("root npm run test is no longer an allowlisted validation command", async () => {
  const workspace = makeWorkspace();
  try {
    const result = await runCommand("npm", ["run", "test"], { workspaceRoot: workspace });
    assert.equal(result.allowed, false);
    assert.match(result.output, /BLOCKED/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("validation env values are redacted from command output", async () => {
  const workspace = makeWorkspace();
  const markerFile = path.join(makeTempDir("runner-sandbox-marker-"), "env.txt");
  const dbUrl = "postgresql://user:secret@localhost:5432/test";
  const binDir = makeFakeNpm(markerFile, `DATABASE_URL=${dbUrl} RUNNER_TOKEN=plain-token`);
  try {
    const result = await runCommand("npm", ["run", "build"], {
      workspaceRoot: workspace,
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        DATABASE_URL: dbUrl,
        RUNNER_TOKEN: "plain-token"
      }
    });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.output, /user:secret/);
    assert.doesNotMatch(result.output, /plain-token/);
    assert.match(result.output, /REDACTED/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(path.dirname(markerFile), { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});
