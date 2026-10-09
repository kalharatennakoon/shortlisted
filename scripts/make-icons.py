#!/usr/bin/env python3
"""Draws every icon that is a picture file, from one set of settings:

    desktop/build/icon.png, icon.icns    the Mac app (tile and shadow on a 1024 canvas)
    desktop/build/icon.ico               the Windows app (the tile fills the square)
    public/icon-192.png, icon-512.png    the site as an installed web app
    public/apple-touch-icon.png          the site on an iPhone or iPad home screen

    python3 scripts/make-icons.py        (needs Pillow: pip install pillow)

The artwork is the Shortlisted logo, three stacked cards with a tick on the front one, drawn here from the same
measurements as the logo on the site (`Logo` in src/components/Icons.tsx, a 512-unit square). The logo is also
written out by hand in three places that this script does not touch; keep their colours in step with the settings
below: `Logo` in src/components/Icons.tsx, public/favicon.svg and desktop/offline.html.

After changing the desktop icons, bump "version" in desktop/package.json: an installed copy only gets a new icon
from a new installer.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# ---------- settings ----------

BACKGROUND_TOP = (30, 30, 32)     # top-left of the tile: a touch lighter, so the black has some depth
BACKGROUND_BOTTOM = (0, 0, 0)     # bottom-right of the tile
SHINE = 0.07                      # soft light in the top-left corner, 0 for none
CARD = (255, 255, 255)            # the cards. The two behind are the same white, seen through (see CARD_FADE)
CARD_FADE = (0.42, 0.68, 1.0)     # how solid each card is, back to front
TICK = (0, 0, 0)                  # the tick on the front card

# Mac: how much of the 1024 canvas the tile fills. Apple's template is 824; Kalhara found that a bit large in the
# Dock, so it is 10% smaller. Windows icons fill their square.
MAC_TILE = 742

# ---------- drawing ----------

UNIT = 512   # the logo's own square
SS = 4       # draw at four times the size, then scale down, for smooth edges
ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / 'desktop' / 'build'
SITE = ROOT / 'public'


def tile(size: int, rounded: bool = True) -> Image.Image:
    """The logo tile, `size` pixels square: with rounded corners on a clear background, or as a plain filled square."""
    n = size * SS
    k = n / UNIT

    # Background: a diagonal fade with a soft light top-left, made small and scaled up (it has no edges to blur)
    small = 64
    fade = Image.new('RGB', (small, small))
    pixels = []
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            base = [BACKGROUND_TOP[i] + (BACKGROUND_BOTTOM[i] - BACKGROUND_TOP[i]) * t for i in range(3)]
            # light centred at (0.2, 0.1), gone by 0.6 of a radius of 0.8
            d = (((x / (small - 1)) - 0.2) ** 2 + ((y / (small - 1)) - 0.1) ** 2) ** 0.5 / 0.8
            glow = SHINE * max(0.0, 1 - d / 0.6)
            pixels.append(tuple(round(c + (255 - c) * glow) for c in base))
    fade.putdata(pixels)
    art = fade.resize((n, n), Image.Resampling.BICUBIC).convert('RGBA')

    def card(x, y, w, h, r, opacity, angle, centre):
        layer = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle(
            [x * k, y * k, (x + w) * k, (y + h) * k], radius=r * k, fill=CARD + (round(255 * opacity),))
        if angle:
            layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, center=(centre[0] * k, centre[1] * k))
        art.alpha_composite(layer)

    # The logo shifts its cards up and left by 14 units; the numbers below already include that
    card(90, 136, 210, 150, 34, CARD_FADE[0], 8, (195, 211))
    card(136, 182, 210, 150, 34, CARD_FADE[1], 3, (241, 257))
    card(184, 230, 210, 150, 34, CARD_FADE[2], 0, None)

    # The tick: two strokes with round ends
    points = [(244 * k, 308 * k), (270 * k, 334 * k), (326 * k, 276 * k)]
    width = 24 * k
    draw = ImageDraw.Draw(art)
    draw.line(points, fill=TICK + (255,), width=round(width), joint='curve')
    for px, py in points:
        draw.ellipse([px - width / 2, py - width / 2, px + width / 2, py + width / 2], fill=TICK + (255,))

    if not rounded:
        return art.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=116 * k, fill=255)
    art.putalpha(mask)
    return art.resize((size, size), Image.Resampling.LANCZOS)


def mac_icon() -> Image.Image:
    """The tile on a 1024 canvas with a soft shadow under it, the way macOS icons sit."""
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    art = tile(MAC_TILE)
    at = (1024 - MAC_TILE) // 2
    shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shape = Image.new('RGBA', art.size, (0, 0, 0, 0))
    shape.putalpha(art.getchannel('A').point(lambda a: round(a * 0.32)))
    shadow.alpha_composite(shape, (at, at + 10))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(11)))
    canvas.alpha_composite(art, (at, at))
    return canvas


def main() -> None:
    mac = mac_icon()
    mac.save(DESKTOP / 'icon.png', optimize=True)
    mac.save(DESKTOP / 'icon.icns', format='ICNS')
    # Windows: each size drawn at its own size, so the small ones stay crisp
    sizes = [256, 128, 64, 48, 32, 24, 16]
    images = [tile(s) for s in sizes]
    images[0].save(DESKTOP / 'icon.ico', format='ICO', sizes=[(s, s) for s in sizes], append_images=images[1:])
    # The site: plain squares with no rounding of their own (phones round the corners themselves)
    for name, size in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
        tile(size, rounded=False).save(SITE / name, optimize=True)
    print('wrote the desktop icons to', DESKTOP, 'and the site icons to', SITE)


if __name__ == '__main__':
    main()
