#!/usr/bin/env python3
"""Generates the Windows icon set (ICO + PNG) from the brand banner logo11.jpg.

The banner is a navy rectangle with the blue->purple logo tile in the middle.
The navy backdrop is detected and cropped away so the final icon is dominated
by the tile (white lettering on the blue->purple gradient) with transparency
around it — same technique as the Android adaptive icon, sized so the logo
fills most of the canvas without distortion.

Outputs:
  - assets/icon.ico   multi-resolution Windows ICO (16/24/32/48/64/128/256)
  - assets/icon.png   256x256 PNG used for the Electron window + tray icon
"""
import os
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logo11.jpg")
ASSETS = os.path.join(ROOT, "assets")

FILL = 0.88  # tile width vs icon canvas — logo dominates the icon like a modern app icon
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
BASE = 256


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


def main():
    os.makedirs(ASSETS, exist_ok=True)
    tile = extract_tile()

    base = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    paste_centered(base, scale_to(tile, round(BASE * FILL)))

    png_path = os.path.join(ASSETS, "icon.png")
    base.save(png_path, "PNG")
    print("wrote", os.path.relpath(png_path, ROOT), base.size)

    ico_path = os.path.join(ASSETS, "icon.ico")
    base.save(ico_path, "ICO", sizes=ICO_SIZES)
    print("wrote", os.path.relpath(ico_path, ROOT), "sizes:", ICO_SIZES)


if __name__ == "__main__":
    sys.exit(main())