import { Archive, BookOpen, Coins, Crown, Hammer, Swords } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentPresenceDto, AgentPresenceState } from "@/types/api";

// Shared presence primitives. STATE_COLORS / STATE_DOT / initials were previously
// duplicated in KingdomOperationsPage.tsx; they now live here so the Operations
// Center and the Living Kingdom view render from one source.

export const STATE_COLORS: Record<AgentPresenceState, string> = {
  IDLE: "border-border bg-muted/30 text-muted-foreground",
  THINKING: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  COUNCIL: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  WORKING: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  RUNNING: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  WAITING_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  BLOCKED: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  ERROR: "border-destructive/50 bg-destructive/10 text-destructive"
};

export const STATE_DOT: Record<AgentPresenceState, string> = {
  IDLE: "bg-muted-foreground/50",
  THINKING: "bg-blue-400",
  COUNCIL: "bg-violet-400",
  WORKING: "bg-indigo-400",
  RUNNING: "bg-emerald-400",
  WAITING_REVIEW: "bg-amber-400",
  BLOCKED: "bg-orange-400",
  ERROR: "bg-destructive"
};

// Human-readable state labels for the King — no internal enum jargon.
export const STATE_LABEL: Record<AgentPresenceState, string> = {
  IDLE: "Resting",
  THINKING: "Thinking",
  COUNCIL: "In council",
  WORKING: "Working",
  RUNNING: "Executing",
  WAITING_REVIEW: "Awaiting your review",
  BLOCKED: "Blocked",
  ERROR: "Error"
};

// Motion classes bound to existing styles.css keyframes (guarded by the
// prefers-reduced-motion block). IDLE is intentionally static.
export const STATE_ANIMATION: Record<AgentPresenceState, string> = {
  IDLE: "",
  THINKING: "living-pulse-breathe",
  COUNCIL: "living-pulse-breathe",
  WORKING: "living-pulse-breathe",
  RUNNING: "living-shimmer",
  WAITING_REVIEW: "living-pulse-amber",
  BLOCKED: "living-pulse-amber",
  ERROR: "living-pulse-amber"
};

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Kingdom locations (Phase 1) ────────────────────────────────────────────────

export type LocationKey = "throne" | "library" | "warRoom" | "workshop" | "archive" | "treasury";

export type KingdomLocation = {
  key: LocationKey;
  label: string;
  icon: LucideIcon;
  blurb: string;
};

// Order matters: Throne first (royal seat / catch-all), then the council halls.
export const LOCATIONS: KingdomLocation[] = [
  { key: "throne", label: "Throne", icon: Crown, blurb: "Royal seat & orchestration" },
  { key: "library", label: "Library", icon: BookOpen, blurb: "Research & analysis" },
  { key: "warRoom", label: "War Room", icon: Swords, blurb: "Architecture & planning" },
  { key: "workshop", label: "Workshop", icon: Hammer, blurb: "Execution & automation" },
  { key: "archive", label: "Archive", icon: Archive, blurb: "Records & evidence" },
  { key: "treasury", label: "Treasury", icon: Coins, blurb: "Budget & cost" }
];

// Map by the agent's seeded `role` (the reliable signal the presence DTO returns).
const ROLE_TO_LOCATION: Record<string, LocationKey> = {
  Orchestrator: "throne",
  Analyst: "library",
  "Systems Designer": "warRoom",
  "Planning Agent": "warRoom",
  "Execution Strategist": "workshop",
  "Financial Advisor": "treasury"
};

// Fallback for agents without a mapped `role` (e.g. Royal Archivist / Prompt Agent),
// matched on the name/displayName. Title is not in the DTO today — see plan limitations.
const NAME_KEYWORD_TO_LOCATION: Array<{ test: RegExp; location: LocationKey }> = [
  { test: /archivist/i, location: "archive" },
  { test: /treasurer/i, location: "treasury" },
  { test: /researcher/i, location: "library" },
  { test: /architect/i, location: "warRoom" },
  { test: /planner/i, location: "warRoom" },
  { test: /general/i, location: "workshop" },
  { test: /vizier/i, location: "throne" }
];

// Resolve an agent to a location. Nothing is ever dropped — unmatched agents
// fall back to the Throne (the royal court).
export function resolveLocation(agent: Pick<AgentPresenceDto, "role" | "name" | "displayName">): LocationKey {
  const byRole = agent.role ? ROLE_TO_LOCATION[agent.role] : undefined;
  if (byRole) return byRole;

  const haystack = `${agent.displayName ?? ""} ${agent.name ?? ""}`;
  const byName = NAME_KEYWORD_TO_LOCATION.find((entry) => entry.test.test(haystack));
  if (byName) return byName.location;

  return "throne";
}
