#!/usr/bin/env python3
"""Slice the skeleton sheet (Warrior / Mage / Archer) into per-frame PNGs.

The sheet has three character blocks side by side on a white background, each a
stack of labelled animation rows. We crop each block by its sprite x-range
(dropping the label margin), key the white background to transparent, split rows
into frames, and bottom-anchor every frame onto a uniform per-block canvas so all
of a skeleton's animations share one baseline (matching the goblin/troll slices).
The Necromancer boss at the bottom is intentionally skipped for now.
Pass --montage to also dump contact sheets to /tmp."""
import os, sys
from PIL import Image, ImageDraw

SRC = "/Users/seanmoran/.claude/image-cache/df1dacd4-cc0f-4756-9824-68bbe512382f/2.png"
OUT = os.path.join(os.path.dirname(__file__), "assets")
SHEET = Image.open(SRC).convert("RGB")
# these source frames are small (~66px); the battle blows them up ~3.7x, which
# reads as blocky/low-res. Pre-upscale each frame 3x with Scale3x (an
# edge-preserving pixel-art scaler) so it lands near its on-screen size with
# clean, sharp edges instead of the mush a plain resample would give.
UPSCALE = 3


def scale3x(img):
    """Scale3x / AdvMAME3x: triples resolution, smoothing diagonals while keeping
    hard edges crisp — far better for low-res sprites than bilinear/Lanczos."""
    img = img.convert("RGBA")
    w, h = img.size
    src = img.load()
    out = Image.new("RGBA", (w * 3, h * 3))
    dst = out.load()
    def px(x, y):                       # clamp to edge
        return src[min(max(x, 0), w - 1), min(max(y, 0), h - 1)]
    for y in range(h):
        for x in range(w):
            E = px(x, y)
            B, D, F, H = px(x, y - 1), px(x - 1, y), px(x + 1, y), px(x, y + 1)
            A, C, G, I = px(x - 1, y - 1), px(x + 1, y - 1), px(x - 1, y + 1), px(x + 1, y + 1)
            if B != H and D != F:
                e0 = D if D == B else E
                e1 = B if (D == B and E != C) or (B == F and E != A) else E
                e2 = F if B == F else E
                e3 = D if (D == B and E != G) or (D == H and E != A) else E
                e4 = E
                e5 = F if (B == F and E != I) or (H == F and E != C) else E
                e6 = D if D == H else E
                e7 = H if (D == H and E != I) or (H == F and E != G) else E
                e8 = F if H == F else E
            else:
                e0 = e1 = e2 = e3 = e4 = e5 = e6 = e7 = e8 = E
            bx, by = x * 3, y * 3
            dst[bx, by] = e0;   dst[bx + 1, by] = e1;   dst[bx + 2, by] = e2
            dst[bx, by + 1] = e3; dst[bx + 1, by + 1] = e4; dst[bx + 2, by + 1] = e5
            dst[bx, by + 2] = e6; dst[bx + 1, by + 2] = e7; dst[bx + 2, by + 2] = e8
    return out


def isbg(p):
    r, g, b = p[0], p[1], p[2]
    return min(r, g, b) >= 205 and max(r, g, b) - min(r, g, b) <= 24


def keyed(x0, x1):
    """RGBA crop of a block with the white background made transparent."""
    img = SHEET.crop((x0, 0, x1, 475)).convert("RGBA")
    w, h = img.size; px = img.load()
    for y in range(h):
        for x in range(w):
            if isbg(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    return img


def find_bands(img):
    w, h = img.size; px = img.load()
    out, s = [], None
    for y in range(h):
        ink = sum(1 for x in range(0, w, 2) if px[x, y][3] > 24) > 2
        if ink and s is None: s = y
        elif not ink and s is not None:
            if y - s >= 20: out.append((s, y))
            s = None
    if s is not None: out.append((s, h))
    return out


def find_frames(img, y0, y1, min_w=22):
    w = img.size[0]; px = img.load()
    out, s = [], None
    for x in range(w):
        ink = any(px[x, y][3] > 24 for y in range(y0, y1))
        if ink and s is None: s = x
        elif not ink and s is not None:
            if x - s >= min_w: out.append((s, x))
            s = None
    if s is not None and w - s >= min_w: out.append((s, w))
    return out


def tight(img, x0, y0, x1, y1):
    sub = img.crop((x0, y0, x1, y1)); bb = sub.getbbox()
    return sub.crop(bb) if bb else sub


# block sprite x-ranges (label margins excluded); rows top->bottom.
# `keep` maps engine group -> band index; `fx` groups drop trailing short FX
# frames (orbs/bolts) by height.
BLOCKS = {
    "skw": dict(x=(100, 444), keep={"idle": 0, "walk": 1, "attack": 2, "hurt": 4, "death": 5}, fx=set()),
    "skm": dict(x=(608, 996), keep={"idle": 0, "walk": 1, "cast": 2, "hurt": 3, "death": 4}, fx={"cast"}),
    "ska": dict(x=(1115, 1426), keep={"idle": 0, "walk": 1, "shoot": 2, "hurt": 3, "death": 4}, fx={"shoot"}),
}


def main():
    montage = "--montage" in sys.argv
    counts = {}
    for prefix, cfg in BLOCKS.items():
        img = keyed(*cfg["x"])
        bands = find_bands(img)
        # collect crops per kept group
        groups = {}
        for grp, bi in cfg["keep"].items():
            y0, y1 = bands[bi]
            crops = [tight(img, fx0, y0, fx1, y1) for fx0, fx1 in find_frames(img, y0, y1)]
            if grp in cfg["fx"] and crops:        # keep only skeleton-width poses,
                wmax = max(c.size[0] for c in crops)   # dropping narrow FX (orbs, bolts,
                crops = [c for c in crops if c.size[0] >= 0.62 * wmax]  # crystal columns)
            groups[grp] = crops
        # uniform canvas across this block
        allc = [c for cs in groups.values() for c in cs]
        fw = max(c.size[0] for c in allc) + 6
        fh = max(c.size[1] for c in allc) + 6
        for grp, crops in groups.items():
            for i, c in enumerate(crops):
                canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
                canvas.paste(c, ((fw - c.size[0]) // 2, fh - c.size[1]), c)
                if UPSCALE == 3:
                    # Scale3x cleans the edges; a further smooth 2x gives the engine a
                    # large, clean source to *down*-sample from at draw time, which
                    # anti-aliases the coarse pixel grid (supersampling) without the
                    # mush a straight upscale produces.
                    canvas = scale3x(canvas).resize((fw * 6, fh * 6), Image.LANCZOS)
                elif UPSCALE != 1:
                    canvas = canvas.resize((fw * UPSCALE, fh * UPSCALE), Image.LANCZOS)
                canvas.save(os.path.join(OUT, f"{prefix}_{grp}_{i}.png"))
            counts[f"{prefix}_{grp}"] = len(crops)
        print(prefix, "frame", f"{fw}x{fh}", {g: len(c) for g, c in groups.items()})
        if montage:
            cols = max(len(c) for c in groups.values())
            sheet = Image.new("RGB", (cols * fw, len(groups) * fh), (200, 0, 200))
            d = ImageDraw.Draw(sheet)
            for ri, (grp, crops) in enumerate(groups.items()):
                for i, c in enumerate(crops):
                    sheet.paste(c, (i * fw, ri * fh), c)
                d.text((2, ri * fh + 2), grp, fill=(255, 255, 0))
            sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(f"/tmp/sk_{prefix}.png")
    print("\nANIM counts:")
    print(counts)

if __name__ == "__main__":
    main()
