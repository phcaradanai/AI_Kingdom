/**
 * Risk scoring for patch artifacts.
 * Pure function — no I/O.
 *
 * Risk levels:
 * - LOW:      docs, tests, UI-only small changes
 * - MEDIUM:   backend service changes, schema-less logic
 * - HIGH:     auth, RBAC, provider runtime, runner, command policy, migrations
 * - CRITICAL: secrets, deployment, database destructive migrations, shell/runner permissions
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const CRITICAL_PATTERNS: RegExp[] = [
  /^\.env/i,
  /secrets\//i,
  /\.(pem|key|p12|pfx|crt)$/i,
  /deploy/i,
  /migration.*drop/i,
  /migration.*delete/i,
  /prisma\/migrations\//i,
  /commandValidator/i,
  /runnerAuth/i,
  /sandbox\.(ts|js)$/i,
  /shell.*permission/i
];

const HIGH_PATTERNS: RegExp[] = [
  /auth\.(ts|js)$/i,
  /rbac\.(ts|js)$/i,
  /middleware\/auth/i,
  /middleware\/rbac/i,
  /middleware\/runner/i,
  /providerFactory/i,
  /aiProviderRouter/i,
  /generateWithFallback/i,
  /budgetGuard/i,
  /migration/i,
  /schema\.prisma$/i,
  /runner\/src\//i,
  /commandPolicy/i,
  /allowedCommands/i
];

const LOW_PATTERNS: RegExp[] = [
  /\.(md|txt|rst|adoc)$/i,
  /README/i,
  /CHANGELOG/i,
  /\.test\.(ts|js)$/i,
  /\.spec\.(ts|js)$/i,
  /apps\/web\/src\//i,
  /\/ui\//i,
  /\.css$/i,
  /\.scss$/i,
  /docs\//i,
  /fixtures\//i,
  /mocks?\//i
];

export function scoreRisk(filesChanged: string[]): RiskLevel {
  if (filesChanged.length === 0) return "LOW";

  let highest: RiskLevel = "LOW";

  for (const file of filesChanged) {
    const level = scoreFile(file);
    if (level === "CRITICAL") return "CRITICAL";
    if (level === "HIGH") highest = "HIGH";
    else if (level === "MEDIUM" && highest === "LOW") highest = "MEDIUM";
  }

  return highest;
}

function scoreFile(filePath: string): RiskLevel {
  const normalized = filePath.replace(/\\/g, "/");

  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(normalized)) return "CRITICAL";
  }
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(normalized)) return "HIGH";
  }
  for (const pattern of LOW_PATTERNS) {
    if (pattern.test(normalized)) return "LOW";
  }
  return "MEDIUM";
}
