import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPathsFromPatch, validateImportedPatch, IMPORTED_PATCH_STATUSES } from "./importedPatchService.js";

describe("extractPathsFromPatch", () => {
  it("extracts paths from diff --git headers", () => {
    const patch = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 line
+new line`;
    const paths = extractPathsFromPatch(patch);
    assert.ok(paths.includes("src/foo.ts"));
  });

  it("extracts paths from rename from/to", () => {
    const patch = `diff --git a/old.ts b/new.ts
rename from old.ts
rename to new.ts`;
    const paths = extractPathsFromPatch(patch);
    assert.ok(paths.includes("old.ts"));
    assert.ok(paths.includes("new.ts"));
  });

  it("excludes /dev/null", () => {
    const patch = `diff --git a/newfile.ts b/newfile.ts
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1 @@
+hello`;
    const paths = extractPathsFromPatch(patch);
    assert.ok(!paths.includes("/dev/null"));
    assert.ok(paths.includes("newfile.ts"));
  });

  it("deduplicates paths appearing in multiple diff headers", () => {
    const patch = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
 x`;
    const paths = extractPathsFromPatch(patch);
    const srcFoo = paths.filter((p) => p === "src/foo.ts");
    assert.equal(srcFoo.length, 1);
  });
});

describe("validateImportedPatch", () => {
  const VALID_PATCH = `diff --git a/src/hello.ts b/src/hello.ts
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
`;

  it("accepts a valid patch", () => {
    const result = validateImportedPatch(VALID_PATCH);
    assert.equal(result.valid, true);
  });

  it("rejects empty patch", () => {
    assert.equal(validateImportedPatch("").valid, false);
    assert.equal(validateImportedPatch("   ").valid, false);
  });

  it("rejects patch exceeding max size", () => {
    const oversized = "+" + "x".repeat(260_000);
    const result = validateImportedPatch(oversized);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("maximum size"));
  });

  it("rejects patches touching .env", () => {
    const patch = `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1,2 +1,3 @@
 DATABASE_URL=postgres://...
+EVIL=1
`;
    const result = validateImportedPatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("blocked paths"));
  });

  it("rejects patches touching node_modules", () => {
    const patch = `diff --git a/node_modules/lib/index.js b/node_modules/lib/index.js
--- a/node_modules/lib/index.js
+++ b/node_modules/lib/index.js
@@ -1 +1,2 @@
+evil();
`;
    const result = validateImportedPatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("blocked paths"));
  });

  it("rejects patches with path traversal", () => {
    const patch = `diff --git a/../../../etc/passwd b/../../../etc/passwd
--- a/../../../etc/passwd
+++ b/../../../etc/passwd
@@ -1 +1 @@
-root:x:0:0
+root:x:0:0`;
    const result = validateImportedPatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("unsafe path"));
  });

  it("rejects patches with symlink hunks", () => {
    const patch = `diff --git a/link b/link
new mode 120000
--- a/link
+++ b/link`;
    const result = validateImportedPatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("symlink"));
  });

  it("rejects patches containing API key patterns", () => {
    const patch = `diff --git a/config.ts b/config.ts
--- a/config.ts
+++ b/config.ts
@@ -1 +1,2 @@
 const x = 1;
+const key = "sk-proj-abc1234567890ABCDEF";
`;
    const result = validateImportedPatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("secrets"));
  });

  it("sets reason=INVALID_PATCH for format errors", () => {
    assert.equal(validateImportedPatch("").reason, "INVALID_PATCH");
    assert.equal(validateImportedPatch("+" + "x".repeat(260_000)).reason, "INVALID_PATCH");
  });

  it("sets reason=UNSAFE_PATCH for security violations", () => {
    const symlink = `diff --git a/link b/link\nnew mode 120000`;
    assert.equal(validateImportedPatch(symlink).reason, "UNSAFE_PATCH");

    const traversal = `diff --git a/../etc/passwd b/../etc/passwd\n--- a/../etc/passwd\n+++ b/../etc/passwd\n@@ -1 +1 @@\n-x\n+y`;
    assert.equal(validateImportedPatch(traversal).reason, "UNSAFE_PATCH");

    const env = `diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -1 +1,2 @@\n DB=x\n+EVIL=1\n`;
    assert.equal(validateImportedPatch(env).reason, "UNSAFE_PATCH");

    const secret = `diff --git a/c.ts b/c.ts\n--- a/c.ts\n+++ b/c.ts\n@@ -1 +1,2 @@\n x\n+const k = "sk-proj-abc1234567890ABCDEF";\n`;
    assert.equal(validateImportedPatch(secret).reason, "UNSAFE_PATCH");
  });
});

describe("IMPORTED_PATCH_STATUSES", () => {
  it("exports all required status values", () => {
    const required = ["PENDING", "CHECK_FAILED", "APPLIED_IN_SANDBOX", "VALIDATED", "VALIDATION_FAILED", "NO_CHANGES"];
    for (const s of required) {
      assert.ok(IMPORTED_PATCH_STATUSES.includes(s as typeof IMPORTED_PATCH_STATUSES[number]), `Missing status: ${s}`);
    }
  });
});
