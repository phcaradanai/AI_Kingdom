import type { LocationKey } from "@/components/kingdom/agentPresence";

// ── Pixel-art scene configuration ───────────────────────────────────────────────
// The Living Kingdom renders agents on top of ONE pixel-art background image (the
// whole kingdom map, like the Star-Office-UI reference). Drop your image at the path
// below and tune the zone boxes so each hall lands on the matching room in your art.
//
// Only this file changes when you swap art — nothing in the component needs editing.
// See apps/web/public/kingdom/README.md for the asset guide.

// Background image served from apps/web/public (Vite serves /public at the web root).
// Until this file exists the view shows a "place your scene here" setup state.
export const SCENE_BACKGROUND = "/kingdom/scene.png";

// Aspect ratio of the background image (width / height). The reference covers are ~16:10.
export const SCENE_ASPECT = "16 / 10";

// A rectangular region (percent of the stage) that contains each hall's safe
// movement waypoints. x/y = top-left corner, w/h = size, all 0–100.
export type SceneZone = { x: number; y: number; w: number; h: number };

export const SCENE_ZONES: Record<LocationKey, SceneZone> = {
  throne: { x: 4, y: 8, w: 28, h: 40 },
  library: { x: 36, y: 8, w: 28, h: 40 },
  warRoom: { x: 68, y: 8, w: 28, h: 40 },
  workshop: { x: 4, y: 52, w: 28, h: 40 },
  archive: { x: 36, y: 52, w: 28, h: 40 },
  treasury: { x: 68, y: 52, w: 28, h: 40 }
};
