#!/usr/bin/env python3
"""Slice the goblin & troll style sheets into per-frame transparent PNGs.

The sheets are RGB with a near-white checkerboard background (channels ~247/254)
and dark text labels down the left margin. We key out the background, drop the
label column, find row bands, split each band into frames by transparent gaps,
then bottom-center each frame onto a uniform transparent canvas (so they share a
baseline in battle, matching how the lizard/hero frames were sliced)."""
import os
from PIL import Image

SRC = "/Users/seanmoran/.claude/image-cache/7400127a-cc9c-4f78-8595-fe657a50864f"
OUT = os.path.join(os.path.dirname(__file__), "assets")
LEFT_MARGIN = 215          # sprites start right of the text labels
BG = 232                   # >= this on all channels == background
MIN_BAND_H = 30            # ignore the thin divider line
MIN_FRAME_W = 70           # drop floating daggers / sparkles


def alpha_mask(im):
    """RGBA copy with the near-white background made transparent."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= BG and g >= BG and b >= BG:
                px[x, y] = (r, g, b, 0)
            elif x < LEFT_MARGIN:           # kill label text
                px[x, y] = (0, 0, 0, 0)
    return im


def col_has_ink(im, x, y0, y1):
    px = im.load()
    for y in range(y0, y1):
        if px[x, y][3] > 16:
            return True
    return False


def row_ink(im, y):
    px = im.load()
    w = im.size[0]
    return sum(1 for x in range(w) if px[x, y][3] > 16)


def find_bands(im):
    h = im.size[1]
    bands, start = [], None
    for y in range(h):
        ink = row_ink(im, y) > 3
        if ink and start is None:
            start = y
        elif not ink and start is not None:
            if y - start >= MIN_BAND_H:
                bands.append((start, y))
            start = None
    if start is not None and h - start >= MIN_BAND_H:
        bands.append((start, h))
    return bands


def find_frames(im, y0, y1):
    w = im.size[0]
    frames, start = [], None
    for x in range(w):
        ink = col_has_ink(im, x, y0, y1)
        if ink and start is None:
            start = x
        elif not ink and start is not None:
            if x - start >= MIN_FRAME_W:
                frames.append((start, x))
            start = None
    if start is not None and w - start >= MIN_FRAME_W:
        frames.append((start, w))
    return frames


def tight_crop(im, x0, y0, x1, y1):
    sub = im.crop((x0, y0, x1, y1))
    bbox = sub.getbbox()
    return sub.crop(bbox) if bbox else sub


def slice_sheet(src, prefix, row_names):
    im = alpha_mask(Image.open(src))
    bands = find_bands(im)
    print(f"\n{prefix}: {len(bands)} bands found")
    rows = []
    for (y0, y1) in bands:
        frames = find_frames(im, y0, y1)
        crops = [tight_crop(im, fx0, y0, fx1, y1) for (fx0, fx1) in frames]
        rows.append(crops)
        print(f"  band y[{y0}:{y1}] -> {len(crops)} frames: {[c.size for c in crops]}")

    if len(rows) != len(row_names):
        print(f"  !! expected {len(row_names)} rows {row_names}, got {len(rows)} — check thresholds")

    # uniform frame per sheet so every animation shares one baseline.
    # Cap by ~1.7x median so a mis-merged frame (e.g. troll attack swings that
    # touch) doesn't inflate the canvas for every other frame.
    allc = [c for r in rows for c in r]
    ws = sorted(c.size[0] for c in allc)
    med = ws[len(ws) // 2]
    cap = med * 1.7
    fw = max(w for w in ws if w <= cap) + 6
    fh = max(c.size[1] for c in allc) + 6
    for name, crops in zip(row_names, rows):
        for i, c in enumerate(crops):
            canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
            cx = (fw - c.size[0]) // 2
            cy = fh - c.size[1]                  # bottom-anchored
            canvas.paste(c, (cx, cy), c)
            canvas.save(os.path.join(OUT, f"{prefix}_{name}_{i}.png"))
        print(f"  saved {len(crops)} x {prefix}_{name}_*  (frame {fw}x{fh})")


slice_sheet(os.path.join(SRC, "1.png"), "gob",
            ["idle", "walk", "attack", "hurt", "die", "victory"])
slice_sheet(os.path.join(SRC, "2.png"), "troll",
            ["idle", "walk", "attack", "hurt", "death"])
print("\ndone")
