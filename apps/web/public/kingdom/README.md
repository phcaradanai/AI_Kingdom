# Living Kingdom — scene art

The Throne Room → **Live Kingdom** view draws the royal agents on top of **one
pixel-art background image** (the whole kingdom map, in the spirit of
[Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)). Agents are placed
and animated by their **real** state — you only supply the backdrop.

## To make it look like the reference: add ONE image

Drop your pixel-art map here:

```
apps/web/public/kingdom/scene.png
```

- One image of the whole kingdom (a top-down room/office map).
- Aspect ratio ≈ **16:10** (e.g. 1600×1000). Other ratios work — update
  `SCENE_ASPECT` in `apps/web/src/components/kingdom/sceneConfig.ts` to match.
- `.png`, `.webp`, or `.jpg` are all fine — if you use a different name/format,
  change `SCENE_BACKGROUND` in `sceneConfig.ts`.

The moment the file loads, the "place your scene here" setup overlay disappears and
your art becomes the floor. No code change is required for the default path.

## Line up the halls with your rooms

Each hall has a rectangle (percent of the image) where its residents stand. Tune
them in `sceneConfig.ts → SCENE_ZONES` so figures land in the right room of your art:

```ts
throne:   { x: 4,  y: 8,  w: 28, h: 40 },  // top-left
library:  { x: 36, y: 8,  w: 28, h: 40 },  // top-centre
warRoom:  { x: 68, y: 8,  w: 28, h: 40 },  // top-right
workshop: { x: 4,  y: 52, w: 28, h: 40 },  // bottom-left
archive:  { x: 36, y: 52, w: 28, h: 40 },  // bottom-centre
treasury: { x: 68, y: 52, w: 28, h: 40 },  // bottom-right
```

`x,y` = top-left corner, `w,h` = size, all `0–100`. `ZONE_FLOOR_Y` controls how low
in the box the figures stand.

## Characters

Each agent stands in the scene as a **pixel-art sprite** in `sprites/<name>.png` —
a palette-reduced, cropped version of its portrait (`/agents/<name>.png`) rendered with
`image-rendering: pixelated` so it matches the pixel map. A state ring + name plate sit
on top; active agents bob, idle agents are static.

Regenerate the sprites after adding or replacing a portrait:

```bash
python3 scripts/generate-agent-sprites.py   # requires Pillow
```

Tune `SPRITE` (pixel resolution) / `COLORS` (palette size) in that script for a chunkier
or finer look. Agents without a bundled `/agents/` portrait fall back to the raw avatar
or initials.

## Licensing note

If you reuse art from Star-Office-UI, its **art assets are non-commercial only** and
guest characters require **LimeZu attribution** — replace them with your own art for
any commercial use. The code there is MIT.
