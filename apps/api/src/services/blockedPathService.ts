/**
 * Blocked path detection for patch artifacts.
 * Pure function — no I/O.
 *
 * Rejects patches that touch secrets, credentials, build outputs, or large binaries.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  // Env files
  /^\.env$/i,
  /^\.env\./i,
  /\/\.env$/i,
  /\/\.env\./i,
  // Secrets directory
  /^secrets\//i,
  /\/secrets\//i,
  // Private keys / certificates
  /\.(pem|key|p12|pfx|crt|cer|der|jks|keystore)$/i,
  // Node modules and build artifacts
  /^node_modules\//,
  /\/node_modules\//,
  /^dist\//,
  /\/dist\//,
  /^build\//,
  /\/build\//,
  /^\.next\//,
  /\/\.next\//,
  /^out\//,
  // Database dumps
  /\.(sql\.gz|dump|pgdump|mysqldump|sqlite|sqlite3|db)$/i,
  /backup.*\.(sql|dump)$/i,
  // Large binary files
  /\.(zip|tar|gz|bz2|7z|rar|whl|jar|war|ear|iso|dmg|exe|dll|so|dylib)$/i,
  // Docker / CI secrets
  /^\.docker\//,
  /dockercredentials/i,
  // SSH config
  /^\.ssh\//,
  /\/\.ssh\//,
  // AWS / cloud credentials
  /^\.aws\//,
  /\/\.aws\//
];

export type BlockedPathResult =
  | { blocked: false }
  | { blocked: true; reason: string };

export function isBlockedPath(filePath: string): BlockedPathResult {
  if (!filePath) return { blocked: false };
  const normalized = filePath.replace(/\\/g, "/").trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason: `Path matches blocked pattern: ${pattern.source}` };
    }
  }
  return { blocked: false };
}

export function detectBlockedPaths(filePaths: string[]): string[] {
  return filePaths.filter((p) => isBlockedPath(p).blocked);
}
