"""Extract generated compact controls, register their states, and pack one atlas/theme.

Sources and prompts are retained. Only background removal, alignment and packing
are deterministic; the rim materials and state effects come from generated art.
"""
from pathlib import Path
import json
import runpy
import sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
VERSION = sys.argv[1] if len(sys.argv) > 1 else 'compact-v1'
OUT = ROOT / 'assets/skills-ui/buttons' / VERSION
THEMES = json.loads((ROOT / 'assets/skills-ui/buttons/revised-v5/index.json').read_text())['themes']
STATES = ['idle', 'hover', 'clicked']
W, H, SIZE, GAP, CAP = 528, 120, 120, 8, 40
SW, SH = W + SIZE + GAP * 3, H * 3 + GAP * 4
components = runpy.run_path(str(ROOT / 'build-tools/build-revised-buttons.py'))['components']


def extract(source, row, square):
    # Reference-relative windows leave generous whitespace around each sprite.
    sw, sh = source.size
    crop = source.crop((round(sw * (.76 if square else .035)), round(sh * row / 3),
                        round(sw * (.98 if square else .75)), round(sh * (row + 1) / 3)))
    p = np.asarray(crop)
    mask = Image.fromarray(((p.min(2) < 205) | (p.max(2) - p.min(2) > 35)).astype('uint8') * 255)
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    labels, sizes = components(np.asarray(mask) > 0)
    fg = labels == max(sizes, key=sizes.get)
    # Fill bright silver highlights enclosed by the dark outer contour.
    labels, sizes = components(~fg)
    edge = set(np.r_[labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    for label in sizes:
        if label not in edge:
            fg[labels == label] = True
    alpha = Image.fromarray(fg.astype('uint8') * 255)
    crop.putalpha(alpha)
    bounds = alpha.getbbox()
    return crop.crop(bounds).resize((SIZE if square else W, H), Image.Resampling.LANCZOS)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = [dict(key=f'{kind}-{state}', x=GAP if kind == 'text' else W + GAP * 2,
                    y=GAP + row * (H + GAP), width=W if kind == 'text' else SIZE, height=H)
               for row, state in enumerate(STATES) for kind in ['text', 'icon']]
    report = {}
    for theme in THEMES:
        source = Image.open(OUT / 'sources' / f'{theme}.png').convert('RGB')
        atlas = Image.new('RGBA', (SW, SH))
        report[theme] = {}
        for kind in ['text', 'icon']:
            sprites = [extract(source, row, kind == 'icon') for row in range(3)]
            idle = np.asarray(sprites[0]).copy()
            for row, sprite in enumerate(sprites):
                data = np.asarray(sprite).copy()
                # All states share idle's exact silhouette; fill any state edge
                # uncovered by its original shape with the corresponding idle pixel.
                missing = (data[:, :, 3] < 128) & (idle[:, :, 3] >= 128)
                data[missing, :3] = idle[missing, :3]
                data[:, :, 3] = idle[:, :, 3]
                sprite = Image.fromarray(data)
                entry = next(e for e in entries if e['key'] == f'{kind}-{STATES[row]}')
                atlas.paste(sprite, (entry['x'], entry['y']))
                report[theme][entry['key']] = list(sprite.getbbox())
        atlas.save(OUT / f'{theme}.png', optimize=True)
        print(f'{theme}: {SW}x{SH}, six registered states')
    metadata = {
        'compact-v1': (1, 'ornate'),
        'compact-quiet-v2': (2, 'quiet-metal'),
        'compact-ghost-v3': (3, 'ghost-metal'),
    }
    version_number, style = metadata.get(VERSION, (1, VERSION))
    index = dict(version=version_number,
                 style=style,
                 width=SW, height=SH, themes=THEMES, states=STATES,
                 textCapWidth=CAP, entries=entries)
    (OUT / 'index.json').write_text(json.dumps(index, indent=2) + '\n')
    (OUT / 'registration.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    build()
