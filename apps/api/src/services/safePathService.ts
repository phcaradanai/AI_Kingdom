/**
 * Safe local file access utilities for LocalDocumentRoot scanning/reading.
 * Pure-ish: resolveInsideRoot/assertInsideRoot/isBlockedPath/isAllowedPath are pure.
 * safeReadTextFile performs guarded filesystem I/O.
 *
 * Defense in depth against path traversal, symlink escape, secret exposure,
 * and oversized/binary reads. Every path that reaches the filesystem MUST
 * go through resolveInsideRoot + assertInsideRoot first.
 */

import fs from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";

export const DEFAULT_ALLOWED_GLOBS: string[] = [
  "README.md",
  "AGENTS.md",
  "PROJECT_STATUS.md",
  "ARCHITECTURE.md",
  "NEXT_TASK.md",
  "docs/**/*.md",
  "*.md",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig*.json",
  "vite.config.*",
  "vitest.config.*",
  "prisma/schema.prisma",
  "apps/*/package.json",
  "apps/*/src/main.*",
  "apps/*/src/app.*",
  "apps/*/src/routes/**",
  "apps/*/src/services/**",
  "apps/*/src/pages/**"
];

export const DEFAULT_BLOCKED_GLOBS: string[] = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "secrets/**",
  "**/secrets/**",
  "*.pem",
  "*.key",
  "id_rsa",
  "id_ed25519",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".git/**",
  "*.sqlite",
  "*.db",
  "*.dump",
  "*.bak",
  "*.zip",
  "*.tar",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.webp",
  "*.pdf"
];

export type ResolveResult =
  | { ok: true; absolutePath: string }
  | { ok: false; reason: string };

/**
 * Resolves `requestedRelativePath` against `rootPath`, rejecting absolute
 * paths and `..` traversal. Does not touch the filesystem.
 */
export function resolveInsideRoot(rootPath: string, requestedRelativePath: string): ResolveResult {
  if (!rootPath || !requestedRelativePath) {
    return { ok: false, reason: "rootPath and requestedRelativePath are required" };
  }

  // Reject absolute requested paths and Windows drive-letter paths
  if (path.isAbsolute(requestedRelativePath) || /^[a-zA-Z]:/.test(requestedRelativePath)) {
    return { ok: false, reason: "Absolute paths are not allowed" };
  }

  const normalizedRequested = requestedRelativePath.replace(/\\/g, "/");
  const segments = normalizedRequested.split("/");
  if (segments.some((segment) => segment === "..")) {
    return { ok: false, reason: "Path traversal ('..') is not allowed" };
  }

  const normalizedRoot = path.resolve(rootPath);
  const absolutePath = path.resolve(normalizedRoot, normalizedRequested);

  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(rootWithSep)) {
    return { ok: false, reason: "Resolved path escapes root" };
  }

  return { ok: true, absolutePath };
}

export type AssertResult =
  | { ok: true; realPath: string }
  | { ok: false; reason: string };

/**
 * Confirms (via fs.realpath on both root and target) that `absolutePath`
 * stays inside `rootPath` even after symlink resolution.
 */
export async function assertInsideRoot(rootPath: string, absolutePath: string): Promise<AssertResult> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(rootPath);
  } catch {
    return { ok: false, reason: "Root path does not exist or is not accessible" };
  }

  let realTarget: string;
  try {
    realTarget = await fs.realpath(absolutePath);
  } catch {
    return { ok: false, reason: "Target path does not exist or is not accessible" };
  }

  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (realTarget !== realRoot && !realTarget.startsWith(rootWithSep)) {
    return { ok: false, reason: "Target escapes root (symlink escape)" };
  }

  return { ok: true, realPath: realTarget };
}

function normalizeRelative(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Matches `normalized` against `glob`. Patterns without a "/" are matched
 * against the path's basename (so `*.pem` matches `certs/server.pem`);
 * patterns containing "/" are matched against the full normalized path.
 */
function matchesGlob(normalized: string, glob: string): boolean {
  if (glob.includes("/")) {
    return picomatch.isMatch(normalized, glob, { dot: true });
  }
  return picomatch.isMatch(path.basename(normalized), glob, { dot: true });
}

/** Returns true if `relativePath` matches any of `blockedGlobs` (or the defaults). */
export function isBlockedPath(relativePath: string, blockedGlobs: string[] = DEFAULT_BLOCKED_GLOBS): boolean {
  const normalized = normalizeRelative(relativePath);
  return blockedGlobs.some((glob) => matchesGlob(normalized, glob));
}

/** Returns true if `relativePath` matches any of `allowedGlobs` (or the defaults). */
export function isAllowedPath(relativePath: string, allowedGlobs: string[] = DEFAULT_ALLOWED_GLOBS): boolean {
  const normalized = normalizeRelative(relativePath);
  return allowedGlobs.some((glob) => matchesGlob(normalized, glob));
}

export type SafePathPolicy = {
  allowedGlobs?: string[];
  blockedGlobs?: string[];
  maxFileBytes?: number;
};

export type SafeReadResult =
  | { ok: true; content: string; sizeBytes: number; modifiedAt: Date }
  | { ok: false; reason: string };

const BINARY_SNIFF_BYTES = 8000;

function looksBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Safely reads a text file at `relativePath` under `rootPath`, applying
 * blocked/allowed glob checks, size caps, and binary detection.
 * Blocked-glob check runs before allowed-glob check.
 */
export async function safeReadTextFile(rootPath: string, relativePath: string, policy: SafePathPolicy = {}): Promise<SafeReadResult> {
  const allowedGlobs = policy.allowedGlobs ?? DEFAULT_ALLOWED_GLOBS;
  const blockedGlobs = policy.blockedGlobs ?? DEFAULT_BLOCKED_GLOBS;
  const maxFileBytes = policy.maxFileBytes ?? 200_000;

  if (isBlockedPath(relativePath, blockedGlobs)) {
    return { ok: false, reason: "Path matches a blocked pattern" };
  }
  if (!isAllowedPath(relativePath, allowedGlobs)) {
    return { ok: false, reason: "Path does not match an allowed pattern" };
  }

  const resolved = resolveInsideRoot(rootPath, relativePath);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const assertion = await assertInsideRoot(rootPath, resolved.absolutePath);
  if (!assertion.ok) return { ok: false, reason: assertion.reason };

  let stat;
  try {
    stat = await fs.stat(assertion.realPath);
  } catch {
    return { ok: false, reason: "File does not exist or is not accessible" };
  }

  if (!stat.isFile()) {
    return { ok: false, reason: "Not a regular file" };
  }
  if (stat.size > maxFileBytes) {
    return { ok: false, reason: `File exceeds size cap (${stat.size} > ${maxFileBytes} bytes)` };
  }

  const buffer = await fs.readFile(assertion.realPath);
  if (looksBinary(buffer)) {
    return { ok: false, reason: "File appears to be binary" };
  }

  return { ok: true, content: buffer.toString("utf-8"), sizeBytes: stat.size, modifiedAt: stat.mtime };
}
