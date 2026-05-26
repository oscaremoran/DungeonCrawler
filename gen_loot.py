#!/usr/bin/env python3
"""Generate pixel-art icon sprites for the Koro store loot (weapons + armor).
Drawn at 2x then nearest-neighbour scaled so they stay crisp in-engine."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "assets")
S = 32  # base resolution; exported at 2x


def new():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def outline(d, pts, fill, ol=(20, 16, 12, 255)):
    """filled polygon with a 1px dark outline"""
    d.polygon(pts, fill=ol)
    inner = [(x, y) for (x, y) in pts]
    d.polygon(inner, fill=fill)


def save(img, name):
    img = img.resize((S * 2, S * 2), Image.NEAREST)
    img.save(os.path.join(OUT, name + ".png"))
    print(name, img.size)


def sword(name, blade, edge, guard, grip, blade_w=4, tip=4, length=18):
    img, d = new()
    cx = S // 2
    top = 3
    # blade
    d.rectangle([cx - blade_w // 2 - 1, top, cx + blade_w // 2, top + length], fill=(20, 16, 12, 255))
    d.rectangle([cx - blade_w // 2, top + 1, cx + blade_w // 2 - 1, top + length], fill=blade)
    d.line([(cx - 1, top + 2), (cx - 1, top + length)], fill=edge)  # highlight
    # tip
    d.polygon([(cx - blade_w // 2 - 1, top), (cx + blade_w // 2, top), (cx, top - tip)], fill=(20, 16, 12, 255))
    d.polygon([(cx - blade_w // 2, top + 1), (cx + blade_w // 2 - 1, top + 1), (cx, top - tip + 2)], fill=blade)
    gy = top + length
    # crossguard
    d.rectangle([cx - 8, gy, cx + 7, gy + 3], fill=(20, 16, 12, 255))
    d.rectangle([cx - 7, gy + 1, cx + 6, gy + 2], fill=guard)
    # grip
    d.rectangle([cx - 2, gy + 3, cx + 1, gy + 9], fill=(20, 16, 12, 255))
    d.rectangle([cx - 1, gy + 4, cx, gy + 8], fill=grip)
    # pommel
    d.ellipse([cx - 3, gy + 8, cx + 2, gy + 13], fill=(20, 16, 12, 255))
    d.ellipse([cx - 2, gy + 9, cx + 1, gy + 12], fill=guard)
    save(img, name)


def armor(name, plate, shade, trim, rings=False):
    img, d = new()
    cx = S // 2
    # breastplate body
    body = [(cx - 9, 8), (cx + 9, 8), (cx + 10, 22), (cx, 27), (cx - 10, 22)]
    d.polygon(body, fill=(20, 16, 12, 255))
    inner = [(cx - 8, 9), (cx + 8, 9), (cx + 9, 22), (cx, 25), (cx - 9, 22)]
    d.polygon(inner, fill=plate)
    # shoulders
    for sx in (-1, 1):
        d.ellipse([cx + sx * 9 - 4, 6, cx + sx * 9 + 4, 13], fill=(20, 16, 12, 255))
        d.ellipse([cx + sx * 9 - 3, 7, cx + sx * 9 + 3, 12], fill=plate)
    # neck collar
    d.polygon([(cx - 4, 8), (cx + 4, 8), (cx, 13)], fill=shade)
    if rings:
        for ry in range(11, 24, 3):
            for rx in range(cx - 7, cx + 7, 3):
                d.point((rx, ry), fill=shade)
                d.point((rx + 1, ry + 1), fill=shade)
    else:
        # plate: central ridge + trim
        d.line([(cx, 10), (cx, 24)], fill=shade)
        d.line([(cx - 8, 9), (cx + 8, 9)], fill=trim)
        d.line([(cx - 9, 21), (cx, 25)], fill=trim)
        d.line([(cx + 9, 21), (cx, 25)], fill=trim)
    save(img, name)


sword("iron_sword",   (170, 178, 190, 255), (215, 222, 232, 255), (150, 110, 50, 255), (90, 60, 30, 255), blade_w=5, length=18)
sword("steel_dagger", (200, 208, 220, 255), (240, 245, 252, 255), (120, 120, 130, 255), (70, 70, 80, 255), blade_w=4, length=12)
sword("knight_sword", (150, 165, 200, 255), (210, 222, 245, 255), (220, 180, 70, 255), (90, 55, 28, 255), blade_w=6, length=21)
armor("chain_mail",  (130, 138, 150, 255), (90, 98, 112, 255),  (160, 168, 180, 255), rings=True)
armor("plate_armor", (180, 190, 205, 255), (120, 130, 148, 255), (224, 190, 90, 255),  rings=False)
