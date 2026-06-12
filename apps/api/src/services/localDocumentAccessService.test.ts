import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import {
  createLocalDocumentRoot,
  detectLocalDocsChangedSinceSnapshot,
  getLatestLocalDocumentSnapshot,
  getLocalProjectContextForAgent,
  listLocalDocumentInsights,
  markLocalSnapshotStale,
  readLocalDocumentFile,
  scanLocalDocumentRoot
} from "./localDocumentAccessService.js";

async function createProject() {
  return prisma.project.create({ data: { name: `Local Docs Test ${randomUUID()}` } });
}

async function makeTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-docs-test-"));
  await fs.writeFile(path.join(dir, "README.md"), "# Test Kingdom\n\nA test repository for local docs scanning.");
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test-kingdom", scripts: { dev: "vite", test: "vitest" }, dependencies: { express: "^4.0.0" }, devDependencies: { typescript: "^5.0.0" } })
  );
  await fs.writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=sk-secret-do-not-read");
  await fs.mkdir(path.join(dir, "node_modules", "leftpad"), { recursive: true });
  await fs.writeFile(path.join(dir, "node_modules", "leftpad", "index.js"), "module.exports = () => {};");
  await fs.mkdir(path.join(dir, "apps", "api", "src", "services"), { recursive: true });
  await fs.writeFile(path.join(dir, "apps", "api", "src", "services", "authService.ts"), "export const login = () => {};");
  return dir;
}

async function cleanup(projectId: string, ...dirs: string[]) {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("createLocalDocumentRoot rejects a rootPath that does not exist", async () => {
  const project = await createProject();
  try {
    await assert.rejects(
      createLocalDocumentRoot(project.id, { name: "missing", rootPath: path.join(os.tmpdir(), `does-not-exist-${randomUUID()}`) }),
      /not accessible/
    );
  } finally {
    await cleanup(project.id);
  }
});

test("scan indexes allowed files, skips .env and node_modules, and records full provenance", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    assert.equal(root.rootPathHash.length, 64);

    const snapshot = await scanLocalDocumentRoot(root.id);
    assert.equal(snapshot.scanStatus, "READY");
    assert.ok(snapshot.fileCount >= 2);

    const insights = await listLocalDocumentInsights(project.id, snapshot.id);
    const paths = insights.map((i) => i.relativePath);
    assert.ok(paths.includes("README.md"));
    assert.ok(paths.includes("package.json"));
    assert.ok(!paths.includes(".env"), ".env must never be indexed");
    assert.ok(!paths.some((p) => p.startsWith("node_modules/")), "node_modules must never be indexed");

    const readme = insights.find((i) => i.relativePath === "README.md")!;
    assert.equal(readme.isDoc, true);
    assert.equal(readme.contentHash.length, 64);
    const provenance = readme.provenance as Record<string, unknown>;
    assert.equal(provenance.rootId, root.id);
    assert.equal(provenance.rootPathHash, root.rootPathHash);
    assert.equal(provenance.relativePath, "README.md");
    assert.equal(typeof provenance.sizeBytes, "number");
    assert.equal(typeof provenance.modifiedAt, "string");
    assert.equal(typeof provenance.scanTime, "string");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("scan extracts package scripts, detected stack, important files, and risk zones", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    assert.deepEqual(snapshot.packageScripts, { dev: "vite", test: "vitest" });
    assert.ok(snapshot.detectedStack?.includes("Express"));
    assert.ok(snapshot.detectedStack?.includes("TypeScript"));
    assert.ok(snapshot.importantFiles.some((f) => f.relativePath === "README.md"));
    assert.ok(
      snapshot.riskZones?.some((z) => z.relativePath === "apps/api/src/services/authService.ts" && z.riskLevel === "HIGH"),
      "auth-related path should be flagged as a HIGH risk zone"
    );
    assert.equal((snapshot.provenance as Record<string, unknown>).rootId, root.id);
  } finally {
    await cleanup(project.id, dir);
  }
});

test("scan does not follow symlinks pointing outside the root", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "local-docs-outside-"));
  try {
    await fs.writeFile(path.join(outside, "SECRET.md"), "outside secret");
    await fs.symlink(path.join(outside, "SECRET.md"), path.join(dir, "LINKED.md"));

    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    const insights = await listLocalDocumentInsights(project.id, snapshot.id);
    assert.ok(!insights.some((i) => i.relativePath === "LINKED.md"), "symlinked file must not be scanned");
  } finally {
    await cleanup(project.id, dir, outside);
  }
});

test("scan records a FAILED snapshot when the root directory disappears", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    await fs.rm(dir, { recursive: true, force: true });

    const snapshot = await scanLocalDocumentRoot(root.id);
    assert.equal(snapshot.scanStatus, "FAILED");
    assert.equal(snapshot.fileCount, 0);
    assert.match(snapshot.summary, /not accessible/);

    const stored = await prisma.localDocumentRoot.findUnique({ where: { id: root.id } });
    assert.ok(stored?.lastError);
  } finally {
    await cleanup(project.id, dir);
  }
});

test("scan respects maxFileBytes (oversize files skipped) and maxTotalBytes (PARTIAL status)", async () => {
  const project = await createProject();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-docs-limits-"));
  try {
    await fs.writeFile(path.join(dir, "A.md"), "a".repeat(100));
    await fs.writeFile(path.join(dir, "B.md"), "b".repeat(100));
    await fs.writeFile(path.join(dir, "HUGE.md"), "h".repeat(10_000));

    const root = await createLocalDocumentRoot(project.id, {
      name: "limits",
      rootPath: dir,
      maxFileBytes: 1000,
      maxTotalBytes: 150
    });
    const snapshot = await scanLocalDocumentRoot(root.id);

    assert.equal(snapshot.scanStatus, "PARTIAL", "exceeding maxTotalBytes should yield a PARTIAL scan");
    assert.equal(snapshot.fileCount, 1, "only one 100-byte file fits under the 150-byte total cap");

    const insights = await listLocalDocumentInsights(project.id, snapshot.id);
    assert.ok(!insights.some((i) => i.relativePath === "HUGE.md"), "files over maxFileBytes must be skipped");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("readLocalDocumentFile reads allowed files and refuses blocked or traversal paths", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });

    const ok = await readLocalDocumentFile(root.id, "README.md");
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.match(ok.content, /Test Kingdom/);
      assert.equal(ok.rootId, root.id);
    }

    const env = await readLocalDocumentFile(root.id, ".env");
    assert.equal(env.ok, false);

    const traversal = await readLocalDocumentFile(root.id, "../../../etc/passwd");
    assert.equal(traversal.ok, false);

    const absolute = await readLocalDocumentFile(root.id, "/etc/passwd");
    assert.equal(absolute.ok, false);
  } finally {
    await cleanup(project.id, dir);
  }
});

test("getLocalProjectContextForAgent without a snapshot asks for configuration or a scan", async () => {
  const project = await createProject();
  try {
    const noRoots = await getLocalProjectContextForAgent(project.id);
    assert.equal(noRoots.hasSnapshot, false);
    assert.equal(noRoots.isStale, true);
    assert.match(noRoots.contextText, /No local document snapshot available/);
    assert.match(noRoots.contextText, /none configured/);
    assert.match(noRoots.contextText, /configure a Local Document Root/);
  } finally {
    await cleanup(project.id);
  }
});

test("getLocalProjectContextForAgent includes snapshot id, root names, docs, scripts, stack, and risk zones", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "main-repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    const context = await getLocalProjectContextForAgent(project.id);
    assert.equal(context.hasSnapshot, true);
    assert.equal(context.isStale, false);
    assert.ok(context.contextText.includes(`Snapshot id: ${snapshot.id}`));
    assert.ok(context.contextText.includes("Local document roots: main-repo"));
    assert.ok(context.contextText.includes("README.md"));
    assert.ok(context.contextText.includes("dev: vite"));
    assert.ok(context.contextText.includes("Express"));
    assert.ok(context.contextText.includes("authService.ts"));
    assert.ok(context.contextText.includes("Snapshot is current."));
  } finally {
    await cleanup(project.id, dir);
  }
});

test("markLocalSnapshotStale flags snapshots STALE and the agent context warns about it", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    await scanLocalDocumentRoot(root.id);

    const count = await markLocalSnapshotStale(project.id, "test reason");
    assert.equal(count, 1);

    const snapshot = await getLatestLocalDocumentSnapshot(project.id);
    assert.equal(snapshot?.scanStatus, "STALE");
    assert.equal(snapshot?.isStale, true);

    const context = await getLocalProjectContextForAgent(project.id);
    assert.equal(context.isStale, true);
    assert.match(context.contextText, /WARNING: local document snapshot is STALE/);
  } finally {
    await cleanup(project.id, dir);
  }
});

test("detectLocalDocsChangedSinceSnapshot is false right after a scan and true after README.md changes", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    await scanLocalDocumentRoot(root.id);

    const before = await detectLocalDocsChangedSinceSnapshot(project.id);
    assert.equal(before.changed, false);

    const future = new Date(Date.now() + 60_000);
    await fs.utimes(path.join(dir, "README.md"), future, future);

    const after = await detectLocalDocsChangedSinceSnapshot(project.id);
    assert.equal(after.changed, true);
    assert.equal(after.relativePath, "README.md");
    assert.equal(after.rootName, "repo");
  } finally {
    await cleanup(project.id, dir);
  }
});

test("scan writes started and completed audit events with path hashes (no raw secrets)", async () => {
  const project = await createProject();
  const dir = await makeTempRepo();
  try {
    const root = await createLocalDocumentRoot(project.id, { name: "repo", rootPath: dir });
    const snapshot = await scanLocalDocumentRoot(root.id);

    const events = await prisma.auditLog.findMany({
      where: { resourceType: "LocalDocumentRoot", resourceId: root.id },
      orderBy: { createdAt: "asc" }
    });
    const actions = events.map((e) => e.action);
    assert.ok(actions.includes("local_document_root_created"));
    assert.ok(actions.includes("local_document_scan_started"));
    assert.ok(actions.includes("local_document_scan_completed"));

    const completed = events.find((e) => e.action === "local_document_scan_completed")!;
    const metadata = completed.metadata as Record<string, unknown>;
    assert.equal(metadata.snapshotId, snapshot.id);
    assert.equal(metadata.rootPathHash, root.rootPathHash);
    assert.ok(!JSON.stringify(metadata).includes("sk-secret"), "audit metadata must not leak file contents");
  } finally {
    await cleanup(project.id, dir);
  }
});
