import { ImageOff } from "lucide-react";
import { useState } from "react";
import { LOCATIONS, type LocationKey } from "@/components/kingdom/agentPresence";
import { SceneCharacter } from "@/components/kingdom/SceneCharacter";
import { SCENE_ASPECT, SCENE_BACKGROUND, SCENE_ZONES } from "@/components/kingdom/sceneConfig";
import { useKingdomMotion } from "@/components/kingdom/useKingdomMotion";
import { useTk } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentPresenceDto } from "@/types/api";

// ── Hall nameplate (also guarantees the location name is in the DOM) ─────────────

function HallPlate({ locationKey, zone, hasBackground }: { locationKey: LocationKey; zone: { x: number; y: number }; hasBackground: boolean }) {
  const tk = useTk();
  const location = LOCATIONS.find((l) => l.key === locationKey)!;
  const Icon = location.icon;
  return (
    <span
      style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
      className={cn(
        "absolute z-[5] inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold",
        hasBackground ? "bg-black/55 text-amber-100" : "bg-amber-900 text-amber-50"
      )}
    >
      <Icon className="h-3 w-3" />
      {tk(`livingKingdom.location.${location.key}`)}
    </span>
  );
}

// ── The scene ────────────────────────────────────────────────────────────────────

export function KingdomScene({
  agents,
  selectedId,
  onSelect
}: {
  agents: AgentPresenceDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tk = useTk();
  const [bgStatus, setBgStatus] = useState<"loading" | "ok" | "fail">("loading");
  const hasBackground = bgStatus === "ok";
  const { characters, isMoving } = useKingdomMotion(agents);

  return (
    <div
      data-testid="kingdom-scene"
      className="relative w-full overflow-hidden rounded-lg border-2 border-amber-900/30 bg-stone-900"
      style={{ aspectRatio: SCENE_ASPECT }}
    >
      {/* Background image (configurable). Hidden until it loads; falls back to setup. */}
      <img
        src={SCENE_BACKGROUND}
        alt={tk("livingKingdom.scene.alt")}
        onLoad={() => setBgStatus("ok")}
        onError={() => setBgStatus("fail")}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500 [image-rendering:pixelated]",
          hasBackground ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Setup state — honest "place your scene here", with labelled zone outlines */}
      {!hasBackground && (
        <div className="kingdom-floor absolute inset-0">
          {LOCATIONS.map((l) => {
            const z = SCENE_ZONES[l.key];
            return (
              <div
                key={l.key}
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
                className="absolute rounded-lg border-2 border-dashed border-amber-900/30 bg-white/20"
              />
            );
          })}
          <div className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-2 rounded-lg border border-amber-900/30 bg-white/80 px-3 py-2 text-xs text-stone-700 shadow-sm">
            <ImageOff className="h-4 w-4 shrink-0" />
            <span>{tk("livingKingdom.scene.setup", { path: SCENE_BACKGROUND })}</span>
          </div>
        </div>
      )}

      {/* Hall nameplates */}
      {LOCATIONS.map((l) => (
        <HallPlate key={l.key} locationKey={l.key} zone={SCENE_ZONES[l.key]} hasBackground={hasBackground} />
      ))}

      {/* Residents */}
      {characters.map((character) => (
        <SceneCharacter
          key={character.agent.id}
          character={character}
          isMoving={isMoving}
          selected={character.agent.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
