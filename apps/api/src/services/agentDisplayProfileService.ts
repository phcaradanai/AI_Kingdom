export type AgentDisplayProfile = {
  displayName: string | null;
  displayTitle: string | null;
  avatarUrl: string | null;
  avatarPrompt: string | null;
  avatarStyle: string | null;
  avatarVersion: number;
  avatarUpdatedAt: string | null;
  canonicalName: string | null;
  canonicalTitle: string | null;
  coreSlug: string | null;
};

export function extractAgentDisplayProfile(config: unknown): AgentDisplayProfile {
  const raw = asRecord(config);
  const profile = asRecord(raw.displayProfile);

  return {
    displayName: stringOrNull(profile.displayName),
    displayTitle: stringOrNull(profile.displayTitle),
    avatarUrl: stringOrNull(profile.avatarUrl),
    avatarPrompt: stringOrNull(profile.avatarPrompt),
    avatarStyle: stringOrNull(profile.avatarStyle),
    avatarVersion: finiteNumber(profile.avatarVersion, 1),
    avatarUpdatedAt: stringOrNull(profile.avatarUpdatedAt),
    canonicalName: stringOrNull(profile.canonicalName),
    canonicalTitle: stringOrNull(profile.canonicalTitle),
    coreSlug: stringOrNull(profile.coreSlug)
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
