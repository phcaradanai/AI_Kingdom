#!/usr/bin/env python3
"""Generate pixel-art sprites for the Living Kingdom scene from the agent portraits.

Each realistic portrait in apps/web/public/agents/*.png is cropped to the head and
shoulders, downscaled to a small pixel grid and palette-reduced, producing a pixel-art
token in apps/web/public/kingdom/sprites/. The Living Kingdom scene (KingdomScene.tsx)
renders these with `image-rendering: pixelated` so the figures match the pixel map.

Run from the repo root after adding/replacing a portrait:

    python3 scripts/generate-agent-sprites.py

Requires Pillow (`pip install pillow`).
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "apps/web/public/agents")
OUT = os.path.join(ROOT, "apps/web/public/kingdom/sprites")

SPRITE = 44  # pixel-grid resolution (the scene upscales it with image-rendering: pixelated)
COLORS = 40  # palette size — low enough to read as pixel art, high enough to keep the face

def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for fn in sorted(os.listdir(SRC)):
        if not fn.lower().endswith(".png"):
            continue
        img = Image.open(os.path.join(SRC, fn)).convert("RGB")
        w, h = img.size
        side = int(w * 0.66)               # zoom onto head + shoulders
        cx = w // 2
        top = int(h * 0.06)
        crop = img.crop((cx - side // 2, top, cx + side // 2, top + side))
        small = crop.resize((SPRITE, SPRITE), Image.LANCZOS)
        small = small.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        small.save(os.path.join(OUT, fn))
        print("wrote", fn)

if __name__ == "__main__":
    main()
