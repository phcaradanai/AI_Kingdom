# Living Kingdom — scene art

The Throne Room -> **Live Kingdom** view draws the royal agents on top of **one
pixel-art background image**. Its lightweight movement loop is inspired by the
observable character-state approach in
[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents), while the map setup
follows the spirit of [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI).
AI Kingdom uses its own implementation and assets.

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

`x,y` = top-left corner, `w,h` = size, all `0–100`. The motion model keeps every
waypoint inside these safe room bounds.

## Characters

Each agent uses the portrait returned by Kingdom Presence from the owning
`Agent.config.displayProfile`. Uploaded portraits and their `avatarVersion` therefore
match `/agents`, Living Agents, Operations, Council, Royal Brief, and the Throne Room.
Legacy core agents without a saved portrait use the shared bundled `/agents/<name>.png`
fallback; custom agents without a portrait use initials. A state ring, activity icon,
and name plate remain attached to the moving character.

Characters move between deterministic safe waypoints every few seconds. Their vertical
position and activity icon reflect the real `AgentPresenceState`; idle walking is ambient
only and never changes or implies operational state. State changes move the character to
the corresponding working, council, review, or attention depth. Reduced-motion mode
freezes ambient travel while preserving status, selection, and source links.

The old `sprites/` assets remain for historical reference but are not derived at runtime.
Do not infer a sprite path from an agent name because a matching file may not exist and it
would bypass the saved display profile.

## Licensing note

If you reuse art from Star-Office-UI, its **art assets are non-commercial only** and
guest characters require **LimeZu attribution** — replace them with your own art for
any commercial use. The code there is MIT.

Pixel Agents is MIT licensed. This implementation uses the architectural concept only;
no Pixel Agents character, furniture, or office assets are bundled here.
