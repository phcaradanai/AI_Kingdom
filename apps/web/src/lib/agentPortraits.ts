type AgentPortraitInput = {
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  avatarVersion?: number | null;
};

export const agentPortraitFallback: string | null = null;

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

const portraitByKey = new Map<string, string>([
  ["aurelian", "/agents/aurelian.png"],
  ["grand-vizier", "/agents/aurelian.png"],
  ["grandvizier", "/agents/aurelian.png"],
  ["seraphine", "/agents/seraphine.png"],
  ["royal-architect", "/agents/seraphine.png"],
  ["royalarchitect", "/agents/seraphine.png"],
  ["cassian", "/agents/cassian.png"],
  ["royal-general", "/agents/cassian.png"],
  ["royalgeneral", "/agents/cassian.png"],
  ["elowen", "/agents/elowen.png"],
  ["royal-researcher", "/agents/elowen.png"],
  ["royalresearcher", "/agents/elowen.png"],
  ["marcellus", "/agents/marcellus.png"],
  ["royal-treasurer", "/agents/marcellus.png"],
  ["royaltreasurer", "/agents/marcellus.png"],
  ["vaelion", "/agents/vaelion.png"],
  ["royal-promptsmith", "/agents/vaelion.png"],
  ["royalpromptsmith", "/agents/vaelion.png"],
  ["seohyun", "/agents/seohyun.png"],
  ["royal-archivist", "/agents/seohyun.png"],
  ["royalarchivist", "/agents/seohyun.png"],
]);

export function resolveAvatarUrl(avatarUrl: string | null | undefined, avatarVersion?: number | null): string | null {
  if (!avatarUrl) return null;
  const version = avatarVersion ?? 1;
  if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
  if (avatarUrl.startsWith("/uploads/")) return `${API_BASE}${avatarUrl}?v=${version}`;
  return avatarUrl;
}

export function getAgentPortrait(agent?: AgentPortraitInput | null): string | null {
  if (!agent) return agentPortraitFallback;

  const resolved = resolveAvatarUrl(agent.avatarUrl, agent.avatarVersion);
  if (resolved) return resolved;

  const keys = [agent.slug, agent.name, agent.title].flatMap((value) => {
    const normalized = normalizeKey(value);
    if (!normalized) return [];
    return [normalized, normalized.replaceAll("-", "")];
  });

  for (const key of keys) {
    const portrait = portraitByKey.get(key);
    if (portrait) return portrait;
  }

  return agentPortraitFallback;
}

export function getAgentInitials(agent?: AgentPortraitInput | null): string {
  const source = agent?.name || agent?.title || agent?.slug || "Agent";
  const words = source
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) return "AI";
  if (words.length === 1) return words[0]?.slice(0, 2).toUpperCase() ?? "AI";
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

function normalizeKey(value?: string | null): string | null {
  if (!value) return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
