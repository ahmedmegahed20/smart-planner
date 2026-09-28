#!/usr/bin/env python3
"""Regenerates every Android launcher icon from the brand banner logo11.jpg.

Root cause of the old icons: the adaptive "foreground" PNG was an opaque navy
square (logo tile + navy background) filling only ~61% of the 108dp canvas.
Stacked on the navy adaptive background that rendered as a small box inside a
bigger box. This script instead emits the logo tile alone on transparency so
the final icon is dominated by the blue->purple brand tile with its white
lettering, at ~86% of the canvas (adaptive foreground) or ~86% / ~70% for the
legacy square and round icons. The white lettering runs close to the tile edges
by design, so 86% keeps the glyphs inside the launcher mask circles while still
filling the icon like a professional app icon.

Densities (dpi) -> px per 108dp foreground / 48dp legacy icon:
  mdpi   108 /  48
  hdpi   162 /  72
  xhdpi  216 /  96
  xxhdpi 324 / 144
  xxxhdpi 432 / 192
"""
import os
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logo11.jpg")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

FOREGROUND = {108: "mdpi", 162: "hdpi", 216: "xhdpi", 324: "xxhdpi", 432: "xxxhdpi"}
LEGACY = {48: "mdpi", 72: "hdpi", 96: "xhdpi", 144: "xxhdpi", 192: "xxxhdpi"}

NAVY = (11, 18, 34)            # banner navy background around the tile
FOREGROUND_FILL = 0.86         # tile width vs 108dp canvas
SQUARE_FILL = 0.86             # tile width vs legacy square
ROUND_FILL = 0.70              # tile width vs legacy round (inscribed in circle)


def is_banner_bg(r, g, b):
    return r < 40 and g < 46 and b < 72 and (max(r, g, b) - min(r, g, b)) < 40


def extract_tile():
    im = Image.open(SRC).convert("RGB")
    px = im.load()
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not is_banner_bg(r, g, b):
                mpx[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))  # keep anti-aliased edges
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("no logo content found in " + SRC)
    x0, y0, x1, y1 = bbox
    print(f"tile bbox in banner: {bbox} ({x1 - x0 + 1}x{y1 - y0 + 1})")
    tile = im.crop(bbox).convert("RGBA")
    tmask = mask.crop(bbox)
    tile.putalpha(tmask)
    return tile


def scale_to(tile, width):
    t = tile.copy()
    scale = width / t.width
    return t.resize((width, max(1, round(t.height * scale))), Image.LANCZOS)


def paste_centered(canvas, img):
    x = (canvas.width - img.width) // 2
    y = (canvas.height - img.height) // 2
    canvas.alpha_composite(img, (x, y))
    return canvas


def save(path, img):
    img.save(path, "PNG")
    print("wrote", os.path.relpath(path, ROOT), img.size)


def main():
    tile = extract_tile()
    for size, name in FOREGROUND.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fg = scale_to(tile, round(size * FOREGROUND_FILL))
        save(os.path.join(RES, f"mipmap-{name}", "ic_launcher_foreground.png"),
             paste_centered(canvas, fg))
    for size, name in LEGACY.items():
        square_bg = Image.new("RGBA", (size, size), NAVY + (255,))
        sq = scale_to(tile, round(size * SQUARE_FILL))
        save(os.path.join(RES, f"mipmap-{name}", "ic_launcher.png"),
             paste_centered(square_bg, sq))
        from PIL import ImageDraw
        circle_bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(circle_bg).ellipse([0, 0, size - 1, size - 1], fill=NAVY + (255,))
        rnd = scale_to(tile, round(size * ROUND_FILL))
        save(os.path.join(RES, f"mipmap-{name}", "ic_launcher_round.png"),
             paste_centered(circle_bg, rnd))


if __name__ == "__main__":
    sys.exit(main())