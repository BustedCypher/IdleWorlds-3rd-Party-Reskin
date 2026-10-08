"""Derive the raid lobby boss card's art from the approved raid art.

    python build-tools/build-raid-lobby-art.py

For each boss, two small WebPs in assets/raids/lobby/:

  <boss>-banner.webp    the upper band of the boss's arena painting (where
                        every boss stands), 1280 px wide. The arena PNGs are
                        ~2 MB each; the card needs a fraction of that.
  <boss>-portrait.webp  the headshot medallion of the raid HUD's health frame
                        (ui-kit-v1/sprites/boss-health-<boss>.png), cut on a
                        feathered circle, 192 px square.

Pixels are only cropped, masked and resized; no art is painted here.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/raids/lobby'

# Thessaly's live scene paints arena-storm.png; arena.png is a retired study.
ARENAS = {
    'ashmaw': 'ashmaw/arena.png',
    'thessaly': 'thessaly/arena-storm.png',
    'morwenna': 'morwenna/arena.png',
    'grimjaw': 'grimjaw/arena.png',
    'skarth': 'skarth/arena.png',
}
# The medallion's centre and outer radius in the 1216x406 health frame.
MEDALLION = (166, 198, 132)
BANNER_TOP, BANNER_BOTTOM = 0.0, 0.62
BANNER_W, PORTRAIT = 1280, 192


def banner(boss, rel):
    src = Image.open(ROOT / 'assets/raids' / rel).convert('RGB')
    w, h = src.size
    band = src.crop((0, round(h * BANNER_TOP), w, round(h * BANNER_BOTTOM)))
    band = band.resize((BANNER_W, round(band.height * BANNER_W / w)), Image.LANCZOS)
    band.save(OUT / f'{boss}-banner.webp', 'WEBP', quality=80, method=6)


def portrait(boss):
    src = Image.open(ROOT / f'assets/raids/ui-kit-v1/sprites/boss-health-{boss}.png').convert('RGBA')
    cx, cy, r = MEDALLION
    tile = src.crop((cx - r, cy - r, cx + r, cy + r))
    size = tile.width
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((3, 3, size - 4, size - 4), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.5))
    alpha = Image.fromarray(np.minimum(np.asarray(tile.getchannel('A')), np.asarray(mask)))
    tile.putalpha(alpha)
    tile.resize((PORTRAIT, PORTRAIT), Image.LANCZOS).save(OUT / f'{boss}-portrait.webp', 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for boss, rel in ARENAS.items():
        banner(boss, rel)
        portrait(boss)
        print(boss, (OUT / f'{boss}-banner.webp').stat().st_size, (OUT / f'{boss}-portrait.webp').stat().st_size)
