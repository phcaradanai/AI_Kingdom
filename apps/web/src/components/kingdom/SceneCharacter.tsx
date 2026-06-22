import { AlertTriangle, BellRing, BrainCircuit, Hammer, MessageSquare, Play, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STATE_DOT } from "@/components/kingdom/agentPresence";
import type { SceneMotionCharacter } from "@/components/kingdom/kingdomMotion";
import { getAgentDisplayName, getAgentPortrait } from "@/lib/agentPortraits";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentPresenceState } from "@/types/api";

const STATE_RING: Record<AgentPresenceState, string> = {
  IDLE: "ring-stone-400/70",
  THINKING: "ring-blue-400",
  COUNCIL: "ring-violet-400",
  WORKING: "ring-indigo-400",
  RUNNING: "ring-emerald-400",
  WAITING_REVIEW: "ring-amber-400",
  BLOCKED: "ring-orange-400",
  ERROR: "ring-red-500"
};

const STATE_ICON: Partial<Record<AgentPresenceState, LucideIcon>> = {
  THINKING: BrainCircuit,
  COUNCIL: MessageSquare,
  WORKING: Hammer,
  RUNNING: Play,
  WAITING_REVIEW: BellRing,
  BLOCKED: AlertTriangle,
  ERROR: XCircle
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SceneCharacter({
  character,
  isMoving,
  selected,
  onSelect
}: {
  character: SceneMotionCharacter;
  isMoving: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const tk = useTk();
  const { agent, point, facing, transitionDelayMs, transitionDurationMs, location } = character;
  const displayName = getAgentDisplayName(agent);
  const portrait = getAgentPortrait(agent);
  const stateLabel = tk(`presence.state.${agent.state}`);
  const motionLabel = tk(`livingKingdom.motion.${agent.state}`);
  const StateIcon = STATE_ICON[agent.state];

  return (
    <button
      type="button"
      data-location={location}
      data-motion={isMoving ? "walking" : "stationed"}
      data-state={agent.state}
      aria-pressed={selected}
      aria-label={`${displayName} — ${stateLabel}`}
      title={agent.currentTask ?? motionLabel}
      onClick={() => onSelect(agent.id)}
      style={{
        left: `${point.left}%`,
        top: `${point.top}%`,
        transitionDelay: `${transitionDelayMs}ms`,
        transitionDuration: `${transitionDurationMs}ms`
      }}
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left,top] ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <span
        className={cn(
          "relative",
          isMoving && "kingdom-character-walk",
          facing === "left" && "kingdom-facing-left",
          agent.state !== "IDLE" && !isMoving && "kingdom-character-active"
        )}
      >
        {StateIcon && (
          <span
            aria-hidden="true"
            title={motionLabel}
            className={cn(
              "absolute -right-3 -top-4 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/80 text-white shadow-lg",
              agent.state === "WAITING_REVIEW" && "text-amber-300",
              (agent.state === "BLOCKED" || agent.state === "ERROR") && "text-red-300"
            )}
          >
            <StateIcon className="h-3.5 w-3.5" />
          </span>
        )}

        <span className={cn("kingdom-ground-shadow absolute -bottom-1 left-1/2 h-2 w-9 -translate-x-1/2 rounded-[50%] bg-black/40 blur-[1px]", isMoving && "kingdom-ground-shadow-moving")} />
        <span
          className={cn(
            "kingdom-character-frame flex h-[clamp(2.25rem,6.5vw,3.25rem)] w-[clamp(2.25rem,6.5vw,3.25rem)] items-center justify-center overflow-hidden rounded-[4px] bg-stone-800 text-xs font-bold text-stone-100 shadow-lg ring-2",
            STATE_RING[agent.state],
            selected && "ring-4 ring-amber-300"
          )}
        >
          {portrait ? <img src={portrait} alt="" className="h-full w-full object-cover" /> : <span>{initials(displayName)}</span>}
        </span>
        <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-[3px] border-2 border-white shadow", STATE_DOT[agent.state])} />
      </span>

      <span className="mt-1 flex max-w-[6.5rem] flex-col items-center gap-0.5">
        <span className="max-w-full truncate rounded-[3px] bg-black/75 px-1.5 py-px text-[10px] font-semibold leading-tight text-white">
          {displayName}
        </span>
        <span className="max-w-full truncate rounded-[3px] bg-black/65 px-1.5 py-px text-[8px] font-medium text-white/90">
          {stateLabel}
        </span>
      </span>
    </button>
  );
}
