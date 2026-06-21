import type { AutomationCandidate } from "@prisma/client";

export type RiskPolicyContext = {
  candidate: Pick<AutomationCandidate, "id" | "confidence" | "riskLevel" | "proposedAction">;
  workOrder: {
    id: string;
    status: string;
    projectId: string | null;
  };
  runnerOnline: boolean;
  activeJobCount: number;
  recentJobCount: number;
  todayJobCount: number;
  maxDailyJobs: number;
  minConfidence: number;
};

export type RiskPolicyResult = {
  eligible: boolean;
  skippedReason?: string;
  auditAction?: string;
};

export const BLOCKED_PATHS = [
  "auth", "rbac", "provider", "runner", "policy", "secret", "migration",
  "prisma/schema.prisma", "deploy", "docker", ".github", "package.json", "package-lock.json", ".env", "config"
];

/**
 * Returns the first file hint that touches a sensitive/blocked path, or null when
 * every hint is safe. Shared by the Living Loop auto-patch gate and the M23
 * decree→execution auto-router so both refuse to auto-touch high-blast-radius areas.
 */
export function findBlockedPathHint(hints: readonly string[]): string | null {
  for (const hint of hints) {
    const lower = hint.toLowerCase();
    if (BLOCKED_PATHS.some((b) => lower.includes(b))) return hint;
  }
  return null;
}

export function isAutoPatchEligible(ctx: RiskPolicyContext): RiskPolicyResult {
  if (ctx.todayJobCount >= ctx.maxDailyJobs) {
    return { eligible: false, skippedReason: "Daily auto patch limit reached", auditAction: "auto_patch_daily_limit_blocked" };
  }
  if (ctx.candidate.confidence < ctx.minConfidence) {
    return { eligible: false, skippedReason: `Confidence ${ctx.candidate.confidence} below threshold ${ctx.minConfidence}`, auditAction: "living_loop_auto_sandbox_patch_skipped" };
  }
  if (ctx.candidate.riskLevel !== "LOW") {
    return { eligible: false, skippedReason: `Risk level ${ctx.candidate.riskLevel} is not LOW`, auditAction: "auto_patch_risk_policy_blocked" };
  }
  if (!ctx.runnerOnline) {
    return { eligible: false, skippedReason: "No online runner available", auditAction: "living_loop_auto_sandbox_patch_skipped" };
  }
  if (!ctx.workOrder.projectId) {
    return { eligible: false, skippedReason: "Work order not linked to project", auditAction: "living_loop_auto_sandbox_patch_skipped" };
  }
  if (ctx.activeJobCount > 0) {
    return { eligible: false, skippedReason: "Active automation job already exists", auditAction: "living_loop_auto_sandbox_patch_skipped" };
  }
  if (ctx.recentJobCount > 0) {
    return { eligible: false, skippedReason: "Auto patch job within cooldown", auditAction: "auto_patch_cooldown_blocked" };
  }

  // Check proposedAction hints for blocked paths
  const action = ctx.candidate.proposedAction as any;
  if (action && typeof action === "object") {
    const hints: string[] = [];
    if (Array.isArray(action.fileHints)) hints.push(...action.fileHints);
    if (Array.isArray(action.expectedFiles)) hints.push(...action.expectedFiles);

    for (const hint of hints) {
      const lowerHint = hint.toLowerCase();
      if (BLOCKED_PATHS.some(b => lowerHint.includes(b))) {
        return { eligible: false, skippedReason: `Blocked path hint detected: ${hint}`, auditAction: "auto_patch_risk_policy_blocked" };
      }
    }
  }

  return { eligible: true };
}
