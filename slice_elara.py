"""Slice Elara's sprite sheet from
~/.claude/image-cache/65abedc8-04b9-42a3-801b-833f4494d2e2/3.png into
assets/ally_*.png.

The source uses a light-grey checker pattern as the "transparent" background;
we key it out and then bounding-box each individual sprite via connected-
component analysis (4-neighbour flood fill).
"""
import os
from collections import deque
from PIL import Image

SRC = os.path.expanduser(
    "~/.claude/image-cache/65abedc8-04b9-42a3-801b-833f4494d2e2/3.png"
)
OUT = os.path.join(os.path.dirname(__file__), "assets")


def key_checker(img):
    """The sheet's background is a two-tone grey checker. Treat any nearly-
    grey pixel above a luminance threshold as transparent."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            if mx >= 190 and mx - mn <= 14:
                px[x, y] = (0, 0, 0, 0)
    return img


def components(mask, min_pixels=200):
    """Return list of bounding boxes (x0,y0,x1,y1) of connected non-empty
    regions in a binary 2D array. 4-neighbour flood fill."""
    h = len(mask); w = len(mask[0])
    seen = [[False] * w for _ in range(h)]
    boxes = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            q = deque([(sx, sy)])
            seen[sy][sx] = True
            x0 = x1 = sx; y0 = y1 = sy; n = 0
            while q:
                x, y = q.popleft()
                n += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if n >= min_pixels:
                boxes.append((x0, y0, x1 + 1, y1 + 1))
    return boxes


def merge_close_by_row(boxes, y_tol=40):
    """Merge boxes whose vertical centres are close (same character split into
    head/body components by a missed grey pixel band)."""
    # group by y-band
    boxes = sorted(boxes, key=lambda b: ((b[1] + b[3]) // 2, b[0]))
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) // 2
        placed = False
        for row in rows:
            rcy = sum((r[1] + r[3]) for r in row) / (2 * len(row))
            if abs(rcy - cy) <= y_tol:
                row.append(b); placed = True; break
        if not placed:
            rows.append([b])
    # within each row, merge boxes that overlap horizontally
    merged_rows = []
    for row in rows:
        row.sort(key=lambda b: b[0])
        merged = []
        for b in row:
            if merged and b[0] <= merged[-1][2] + 6:
                a = merged[-1]
                merged[-1] = (min(a[0], b[0]), min(a[1], b[1]),
                              max(a[2], b[2]), max(a[3], b[3]))
            else:
                merged.append(b)
        merged_rows.append(merged)
    return merged_rows


def save_crop(img, box, path):
    crop = img.crop(box)
    bbox = crop.getbbox()
    if bbox: crop = crop.crop(bbox)
    crop.save(path)
    return crop.size


def main():
    src = key_checker(Image.open(SRC))
    w, h = src.size

    # build alpha mask
    a = src.split()[-1]
    mask = [[a.getpixel((x, y)) > 8 for x in range(w)] for y in range(h)]
    boxes = components(mask)
    rows = merge_close_by_row(boxes)

    # Identify the character grid rows by Y order, ignoring tiny header palette
    # The five animation rows have the most boxes (3-4 sprites × 4 directions = 12-16 each).
    big_rows = [r for r in rows if len(r) >= 10]
    big_rows.sort(key=lambda row: min(b[1] for b in row))
    names = ["idle", "walk", "talk", "hurt", "victory"]

    for name, row in zip(names, big_rows):
        for i, b in enumerate(row):
            print(name, i, b, b[2] - b[0], b[3] - b[1])

    if len(big_rows) < 5:
        raise SystemExit(f"Expected 5 character rows, found {len(big_rows)}")

    # Each row has columns: DOWN (3 or 4), LEFT (3 or 4), RIGHT (3 or 4), UP (3 or 4).
    # We pick: idle[0] (down), walk[0..2] (down walk frames), hurt[0] (down)
    out = {}
    out["ally_idle"]   = big_rows[0][0]                  # idle, down, first frame
    walk_row = big_rows[1]
    # take first three of the down direction
    out["ally_walk_0"] = walk_row[0]
    out["ally_walk_1"] = walk_row[1]
    out["ally_walk_2"] = walk_row[2]
    out["ally_hurt"]   = big_rows[3][0]                  # hurt, down, first frame
    out["ally_victory"] = big_rows[4][0]                 # victory, down, first frame

    # portrait: pick from FACIAL EXPRESSIONS row (smaller, head-only, large frames)
    # facial row is the bottom-right cluster — find boxes with high y and roughly square aspect ratio
    portrait_box = None
    for row in rows:
        for b in row:
            bx, by, x1, y1 = b
            bw, bh = x1 - bx, y1 - by
            if by > h * 0.72 and bx > w * 0.55 and 60 <= bw <= 140 and 60 <= bh <= 160:
                portrait_box = b; break
        if portrait_box: break
    if portrait_box is None:
        # fallback: scale up the idle frame
        portrait_box = big_rows[0][0]
    out["ally_portrait"] = portrait_box

    for name, box in out.items():
        size = save_crop(src, box, os.path.join(OUT, name + ".png"))
        print("wrote", name, size)


if __name__ == "__main__":
    main()
