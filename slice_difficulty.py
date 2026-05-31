"""Slice the 4 difficulty-badge sprites (casual/normal/hard/hardcore) from
~/.claude/image-cache/65abedc8-04b9-42a3-801b-833f4494d2e2/1.png into
assets/diff_*.png with the white background keyed out and trimmed."""
import os
from PIL import Image

SRC = os.path.expanduser(
    "~/.claude/image-cache/65abedc8-04b9-42a3-801b-833f4494d2e2/1.png"
)
OUT = os.path.join(os.path.dirname(__file__), "assets")
NAMES = ["diff_casual", "diff_normal", "diff_hard", "diff_hardcore"]


def key_white(img, thresh=238):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (0, 0, 0, 0)
    return img


def main():
    im = Image.open(SRC).convert("RGB")
    W, H = im.size
    cw = W // 4
    for i, name in enumerate(NAMES):
        tile = im.crop((i * cw, 0, (i + 1) * cw, H))
        tile = key_white(tile)
        bbox = tile.getbbox()
        if bbox:
            tile = tile.crop(bbox)
        tile.save(os.path.join(OUT, name + ".png"))
        print("wrote", name, tile.size)


if __name__ == "__main__":
    main()
