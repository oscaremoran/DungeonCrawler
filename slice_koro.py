#!/usr/bin/env python3
"""Slice the Village of Koro tileset + shopkeeper NPC into game assets.
Source images live in the Claude image cache; re-run to regenerate."""
from PIL import Image
from collections import deque
import os

SRC = "/Users/seanmoran/.claude/image-cache/5a2a766c-7381-490e-9ab9-c9c890c60de6"
TILES = Image.open(f"{SRC}/1.jpeg").convert("RGB")
NPC = Image.open(f"{SRC}/2.png").convert("RGB")
OUT = os.path.join(os.path.dirname(__file__), "assets")


def is_bg(px):
    r, g, b = px[0], px[1], px[2]
    return max(r, g, b) - min(r, g, b) <= 24 and min(r, g, b) >= 205


def key_and_crop(img):
    """Flood-fill the light background from the borders to transparent,
    then crop to the remaining sprite's bounding box."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    bg = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]) and not bg[y][x]:
                bg[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not bg[y][x]:
                bg[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and is_bg(px[nx, ny]):
                bg[ny][nx] = True; q.append((nx, ny))
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                px[x, y] = (0, 0, 0, 0)
            else:
                minx = min(minx, x); miny = min(miny, y)
                maxx = max(maxx, x); maxy = max(maxy, y)
    return img.crop((minx, miny, maxx + 1, maxy + 1))


def save(img, name):
    img.save(os.path.join(OUT, name))
    print(name, img.size)


# --- full opaque tiles (no keying) ---
save(TILES.crop((602, 30, 676, 104)), "wood_floor.png")
save(TILES.crop((12, 386, 86, 460)), "cliff.png")

# --- decorative crate ---
save(key_and_crop(TILES.crop((1054, 33, 1112, 73))), "crate.png")

# --- five house sprites ---
houses = {
    "house_red":    (15, 730, 290, 1020),
    "house_blue":   (322, 730, 598, 1020),
    "house_green":  (628, 730, 905, 1020),
    "house_yellow": (935, 730, 1212, 1020),
    "house_purple": (1240, 730, 1520, 1020),
}
for name, box in houses.items():
    save(key_and_crop(TILES.crop(box)), name + ".png")

# --- shopkeeper NPC (front-facing idle) ---
save(key_and_crop(NPC.crop((305, 185, 373, 292))), "npc_keeper.png")

# =========================================================================
#  Dragon Den Inn additions: sign, inn floor, seated patrons, the red-haired
#  ally (idle + portrait). 3.png is already an isolated RGBA sprite; 4.png and
#  5.png are the inn tileset / ally sheet.
# =========================================================================
SIGN = Image.open(f"{SRC}/3.png").convert("RGBA")
INN = Image.open(f"{SRC}/4.png").convert("RGBA")
ALLY = Image.open(f"{SRC}/5.png").convert("RGB")


def crop_alpha(img):
    """Trim an already-transparent sprite to its alpha bounding box."""
    bb = img.getbbox()
    return img.crop(bb) if bb else img


# wooden sign (already cut out) — keep as-is
save(SIGN, "sign.png")

# inn plank floor tile (opaque)
save(INN.crop((10, 520, 78, 588)).convert("RGB"), "inn_floor.png")

# seated tavern patrons (alpha-trimmed)
patrons = [(1063, 580, 1108, 653), (1129, 580, 1171, 653),
           (1205, 580, 1244, 653), (1284, 580, 1329, 653)]
for i, box in enumerate(patrons):
    save(crop_alpha(INN.crop(box)), f"patron_{i}.png")

# the red-haired ally Elara: front idle, a 3-frame front walk cycle, a hurt
# frame (for battle), and a portrait.
save(key_and_crop(ALLY.crop((247, 43, 320, 196))), "ally_idle.png")
for i, (x0, x1) in enumerate([(144, 216), (247, 320), (351, 424)]):
    save(key_and_crop(ALLY.crop((x0, 241, x1, 396))), f"ally_walk_{i}.png")
save(key_and_crop(ALLY.crop((142, 446, 214, 590))), "ally_hurt.png")
port = ALLY.crop((1054, 138, 1513, 814))
port = port.resize((int(port.width * 240 / port.height), 240))
save(port, "ally_portrait.png")
