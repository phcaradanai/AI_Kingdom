/**
 * Workspace path safety utilities for the sandbox runner.
 * Pure functions — no I/O except path resolution.
 *
 * Prevents path traversal: all resolved paths must start with workspaceRoot.
 */

import path from "node:path";
import fs from "node:fs";

export type PathCheckResult =
  | { safe: true; resolved: string }
  | { safe: false; reason: string };

/**
 * Resolves `target` relative to `workspaceRoot` and asserts the result
 * stays inside the workspace. Does NOT follow symlinks.
 */
export function checkPathSafety(workspaceRoot: string, target: string): PathCheckResult {
  if (!workspaceRoot || !target) {
    return { safe: false, reason: "workspaceRoot and target are required" };
  }

  const normalizedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(workspaceRoot, target);

  // Must start with root + separator to prevent /workspace-evil style escapes
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  if (resolved !== normalizedRoot && !resolved.startsWith(rootWithSep)) {
    return { safe: false, reason: `Path escapes workspace: ${resolved} is outside ${normalizedRoot}` };
  }

  return { safe: true, resolved };
}

/**
 * Checks if the resolved path target contains a symlink component that points
 * outside workspaceRoot. Requires fs access.
 */
export function checkNoSymlinkEscape(workspaceRoot: string, resolvedPath: string): PathCheckResult {
  try {
    const real = fs.realpathSync(resolvedPath);
    const normalizedRoot = path.resolve(workspaceRoot);
    const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
    if (real !== normalizedRoot && !real.startsWith(rootWithSep)) {
      return { safe: false, reason: `Symlink escapes workspace: ${real} is outside ${normalizedRoot}` };
    }
    return { safe: true, resolved: real };
  } catch {
    // Path doesn't exist yet — that's fine (we're writing it)
    return { safe: true, resolved: resolvedPath };
  }
}

/** Returns true if cwd is safely inside workspaceRoot */
export function isCwdSafe(workspaceRoot: string, cwd: string): boolean {
  const result = checkPathSafety(workspaceRoot, cwd);
  return result.safe;
}
