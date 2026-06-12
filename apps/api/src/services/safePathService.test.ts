import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  resolveInsideRoot,
  assertInsideRoot,
  isBlockedPath,
  isAllowedPath,
  safeReadTextFile
} from "./safePathService.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "safe-path-test-"));
}

test("resolveInsideRoot rejects '..' traversal", () => {
  const result = resolveInsideRoot("/tmp/root", "../etc/passwd");
  assert.equal(result.ok, false);
});

test("resolveInsideRoot rejects nested '..' traversal", () => {
  const result = resolveInsideRoot("/tmp/root", "docs/../../etc/passwd");
  assert.equal(result.ok, false);
});

test("resolveInsideRoot rejects absolute requested paths", () => {
  const result = resolveInsideRoot("/tmp/root", "/etc/passwd");
  assert.equal(result.ok, false);
});

test("resolveInsideRoot accepts a normal relative path", () => {
  const result = resolveInsideRoot("/tmp/root", "docs/README.md");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.absolutePath, path.resolve("/tmp/root/docs/README.md"));
  }
});

test("assertInsideRoot rejects symlink escape", async () => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();
  try {
    await fs.writeFile(path.join(outside, "secret.txt"), "outside content");
    const linkPath = path.join(root, "escape.txt");
    await fs.symlink(path.join(outside, "secret.txt"), linkPath);

    const result = await assertInsideRoot(root, linkPath);
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("assertInsideRoot accepts a real file inside root", async () => {
  const root = await makeTempRoot();
  try {
    const filePath = path.join(root, "README.md");
    await fs.writeFile(filePath, "hello");
    const result = await assertInsideRoot(root, filePath);
    assert.equal(result.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("isBlockedPath blocks .env files", () => {
  assert.equal(isBlockedPath(".env"), true);
  assert.equal(isBlockedPath(".env.local"), true);
  assert.equal(isBlockedPath("apps/api/.env"), true);
});

test("isBlockedPath blocks private keys", () => {
  assert.equal(isBlockedPath("id_rsa"), true);
  assert.equal(isBlockedPath("certs/server.pem"), true);
  assert.equal(isBlockedPath("config/app.key"), true);
});

test("isBlockedPath blocks node_modules", () => {
  assert.equal(isBlockedPath("node_modules/foo/index.js"), true);
});

test("isAllowedPath allows known docs and config files", () => {
  assert.equal(isAllowedPath("README.md"), true);
  assert.equal(isAllowedPath("AGENTS.md"), true);
  assert.equal(isAllowedPath("docs/architecture/overview.md"), true);
  assert.equal(isAllowedPath("apps/api/package.json"), true);
});

test("isAllowedPath rejects files not on the allowlist", () => {
  assert.equal(isAllowedPath("apps/api/src/server.ts"), false);
  assert.equal(isAllowedPath("random.txt"), false);
});

test("safeReadTextFile rejects '..' traversal", async () => {
  const root = await makeTempRoot();
  try {
    const result = await safeReadTextFile(root, "../README.md");
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("safeReadTextFile rejects absolute paths", async () => {
  const root = await makeTempRoot();
  try {
    const result = await safeReadTextFile(root, "/etc/passwd");
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("safeReadTextFile rejects symlink escape", async () => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();
  try {
    await fs.writeFile(path.join(outside, "secret.md"), "secret content");
    await fs.symlink(path.join(outside, "secret.md"), path.join(root, "README.md"));

    const result = await safeReadTextFile(root, "README.md");
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("safeReadTextFile blocks .env even if requested", async () => {
  const root = await makeTempRoot();
  try {
    await fs.writeFile(path.join(root, ".env"), "SECRET=1");
    const result = await safeReadTextFile(root, ".env");
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("safeReadTextFile rejects files over the size cap", async () => {
  const root = await makeTempRoot();
  try {
    const big = "x".repeat(1000);
    await fs.writeFile(path.join(root, "README.md"), big);
    const result = await safeReadTextFile(root, "README.md", { maxFileBytes: 100 });
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("safeReadTextFile rejects binary files", async () => {
  const root = await makeTempRoot();
  try {
    await fs.writeFile(path.join(root, "README.md"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
    const result = await safeReadTextFile(root, "README.md");
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("safeReadTextFile reads an allowed text file successfully", async () => {
  const root = await makeTempRoot();
  try {
    await fs.writeFile(path.join(root, "README.md"), "# Hello");
    const result = await safeReadTextFile(root, "README.md");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.content, "# Hello");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
