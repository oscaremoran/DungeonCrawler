#!/usr/bin/env python3
"""Slice the Xal'Korr (City of Bone) tileset into game assets.

The sheet has two halves: the LEFT half is a 5-col grid of opaque ground/wall
tiles (light seams between cells); the RIGHT half is decoration sprites sitting
on a near-black background, which we key out via border flood-fill.
Re-run to regenerate. Pass --montage to also dump a contact sheet to /tmp."""
import os, sys
from collections import deque
from PIL import Image

SRC = "/Users/seanmoran/.claude/image-cache/df1dacd4-cc0f-4756-9824-68bbe512382f/1.png"
OUT = os.path.join(os.path.dirname(__file__), "assets")
SHEET = Image.open(SRC).convert("RGB")

# ---- left-half ground tiles: regular grid (origin 8, pitch 150, cell 142) ----
def cell(col, row):
    # inset 5px to drop the light seams between cells (keeps the tile seamless)
    x0 = 8 + col * 150 + 6; y0 = 8 + row * 150 + 11
    return SHEET.crop((x0, y0, x0 + 130, y0 + 124))

GROUND = {
    "xk_ground": (1, 1),   # bone-strewn dark earth — the main ground
    "xk_floor":  (3, 1),   # grey stone blocks — plaza / avenue
}

# ---- right-half decorations: key the black background, crop to sprite ----
def is_bg(px):
    return max(px) <= 34

def key_crop(box):
    img = SHEET.crop(box).convert("RGBA")
    w, h = img.size; px = img.load()
    bg = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y][:3]) and not bg[y][x]:
                bg[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y][:3]) and not bg[y][x]:
                bg[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and is_bg(px[nx, ny][:3]):
                bg[ny][nx] = True; q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                px[x, y] = (0, 0, 0, 0)
    bb = img.getbbox()
    return img.crop(bb) if bb else img

# boxes in ORIGINAL sheet coords (right half starts at x=768)
OBJ = {
    "xk_skull_totem": (1090, 30, 1150, 170),   # skull on a pole — landmark
    "xk_bone_bundle": (1300, 35, 1410, 140),   # lashed bone bundle
    "xk_barrel":      (1420, 60, 1530, 140),   # paired barrels
    "xk_statue":      (800, 200, 905, 350),    # twin-skull standing statue
    "xk_gravestone":  (1010, 215, 1090, 335),  # rounded gravestone
    "xk_tomb":        (1235, 222, 1405, 292),  # stone sarcophagus
    "xk_skull_pile":  (905, 360, 1060, 480),   # heaped skulls
    "xk_deadtree":    (1110, 345, 1210, 480),  # bare dead tree
    "xk_boulder":     (1305, 565, 1470, 718),  # grey boulder
    "xk_reaper":      (1300, 480, 1430, 650),  # skeletal reaper statue
    "xk_skull_big":   (1240, 430, 1345, 520),  # big grinning skull
    "xk_skull_sign":  (1360, 425, 1510, 515),  # skull tavern sign
    "xk_candles":     (1358, 318, 1452, 415),  # lit candle cluster
    "xk_gate":        (1010, 835, 1200, 1015), # city wall + arched gate
}

def main():
    montage = "--montage" in sys.argv
    tiles = {}
    for name, (c, r) in GROUND.items():
        img = cell(c, r); tiles[name] = img.convert("RGBA")
        img.save(os.path.join(OUT, name + ".png")); print(name, img.size)
    for name, box in OBJ.items():
        img = key_crop(box); tiles[name] = img
        img.save(os.path.join(OUT, name + ".png")); print(name, img.size)
    if montage:
        cols = 6; cw = 170; rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * cw), (200, 0, 200))
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        for i, (name, img) in enumerate(tiles.items()):
            cx, cy = (i % cols) * cw, (i // cols) * cw
            im = img.copy(); im.thumbnail((cw - 8, cw - 24))
            sheet.paste(im, (cx + 4, cy + 20), im if im.mode == "RGBA" else None)
            d.text((cx + 4, cy + 4), name[3:], fill=(255, 255, 255))
        sheet.save("/tmp/xk_montage.png"); print("montage -> /tmp/xk_montage.png")

if __name__ == "__main__":
    main()
