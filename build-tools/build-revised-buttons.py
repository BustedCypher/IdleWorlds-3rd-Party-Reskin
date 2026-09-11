"""Pack the approved reference artwork; never regenerate the main-button pixels.

Run with Python + Pillow + numpy. Source originals live beside the exported atlas.
State registration uses the gem axis and horizontal frame rails, then locks every
state to the idle alpha silhouette. This prevents hover/pressed art changing size.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/skills-ui/buttons/revised-v5'
SOURCE = OUT / 'sources'
STATES = ['idle', 'hover', 'clicked']
GENERATED_THEMES = ['lunar-spectral', 'runic-arcane', 'tempest-oceanic', 'verdant', 'voidborn']
AW, AH, NW, GAP = 792, 225, 135, 12
SHEET_W, SHEET_H = AW + 2 * NW + 4 * GAP, 3 * AH + 4 * GAP


def components(mask):
    """4-connected run-length labelling, avoiding an optional scipy dependency."""
    parents, counts, runs = [], [], []
    previous = []
    def find(a):
        while parents[a] != a:
            parents[a] = parents[parents[a]]
            a = parents[a]
        return a
    for y, row in enumerate(mask):
        edges = np.flatnonzero(np.diff(np.r_[False, row, False].astype(np.int8)))
        current, cursor = [], 0
        for start, end in zip(edges[::2], edges[1::2]):
            label = len(parents)
            parents.append(label)
            counts.append(int(end - start))
            while cursor < len(previous) and previous[cursor][1] <= start:
                cursor += 1
            for a, b, other in previous[cursor:]:
                if a >= end:
                    break
                r = find(other)
                if r != label:
                    parents[r] = label
                    counts[label] += counts[r]
            current.append((start, end, label))
            runs.append((y, start, end, label))
        previous = current
    result = np.zeros(mask.shape, dtype=np.int32)
    sizes = {}
    for y, a, b, label in runs:
        r = find(label)
        result[y, a:b] = r + 1
        sizes[r + 1] = counts[r]
    return result, sizes


def silhouette(image, checker=False, body_bottom=None, body_top=None):
    p = np.asarray(image.convert('RGB')).astype(np.int16)
    lo, hi = p.min(2), p.max(2)
    background = ((lo > 170) & ((hi - lo) < 35)) if checker else (lo > 215)
    if body_bottom is not None:
        # The reference's next-row hover aura bleeds behind the idle icicles.
        # Keep the solid ornament, not that light-coloured presentation matte.
        background[body_bottom:, :] |= p[body_bottom:, :].mean(2) > 190
    preliminary = Image.fromarray((~background).astype(np.uint8) * 255)
    preliminary = preliminary.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    labels, sizes = components(np.asarray(preliminary) > 0)
    mask = labels == max(sizes, key=sizes.get)
    # Preserve enclosed specular highlights, regardless of their length. Only
    # the pierced filigree below the main face contains genuine enclosed holes.
    holes, hole_sizes = components(~mask)
    for label, size in hole_sizes.items():
        region = holes == label
        touches_edge = (region[0].any() or region[-1].any() or
                        region[:, 0].any() or region[:, -1].any())
        ry = np.where(region)[0]
        outside_body = body_bottom is not None and (ry.min() > body_bottom or ry.max() < body_top)
        if not touches_edge and not (outside_body and size > 30):
            mask[holes == label] = True
    result = Image.fromarray(mask.astype(np.uint8) * 255)
    return result.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))


def main_states(theme):
    original = Image.open(SOURCE / f'{theme}-main.jpg').convert('RGB')
    # Coordinates are measured in the 2048px reference view, scaled once to native.
    f = original.width / 2048
    axis = [304, 611, 929]
    rails = [(181, 421), (492, 727), (815, 1050)]
    if theme == 'forged-metal':
        rails = [(181, 422), (492, 728), (814, 1050)]
    reference = []
    for state, cy, (top, bottom) in zip(STATES, axis, rails):
        # Stop at the halfway point to the adjacent row: no neighbouring fragments.
        bounds = {'idle': (470, 115, 1585, 477),
                  'hover': (470, 461, 1585, 786),
                  'clicked': (470, 786, 1585, 1135)}[state]
        x0, y0, x1, y1 = [round(v * f) for v in bounds]
        crop = original.crop((x0, y0, x1, y1))
        alpha = silhouette(crop, body_bottom=round(bottom * f - y0), body_top=round(top * f - y0))
        if state == 'idle':
            # Hover's upper corner tips overlap the lower idle ornament band in
            # the reference presentation. They are not part of the idle sprite.
            a = np.asarray(alpha).copy()
            yy, xx = np.indices(a.shape)
            a[(yy > 460 * f - y0) & ((xx < 700 * f - x0) | (xx > 1380 * f - x0))] = 0
            p = np.asarray(crop)
            a[(yy > 460 * f - y0) & (p.mean(2) > 120)] = 0
            labels, sizes = components(a > 0)
            a[labels != max(sizes, key=sizes.get)] = 0
            alpha = Image.fromarray(a)
        crop.putalpha(alpha)
        # Stable gem-tip span and rail interval (equal for each state).
        left, right = (487, 1568) if state != 'clicked' else (477, 1579)
        sx = (right - left) * f / 752
        sy = (bottom - top) * f / 150
        # The gem axis stays at y=112, with room for the frozen tips below it.
        tx = left * f - x0 - 20 * sx
        ty = cy * f - y0 - 112 * sy
        frame = crop.transform((AW, AH), Image.Transform.AFFINE,
                               (sx, 0, tx, 0, sy, ty), Image.Resampling.BICUBIC)
        reference.append(frame)
    idle = reference[0]
    # Lock contour to idle, including its corner ornaments and pierced filigree.
    # Reuse the original structure where a reference state changes the silhouette.
    locked = [idle]
    idle_p = np.asarray(idle).copy()
    for i, state in enumerate(reference[1:], 1):
        p = np.asarray(state).copy()
        fallback = idle_p[:, :, :3].astype(float) * (1.12 if i == 1 else .53)
        missing = p[:, :, 3] < 200
        # Keep pierced ornaments structurally identical; the presentation's
        # state-specific glow must not turn those metal strands into white fill.
        missing[:35, :] = True
        missing[185:, :] = True
        p[missing, :3] = np.clip(fallback[missing], 0, 255).astype(np.uint8)
        p[:, :, 3] = idle_p[:, :, 3]
        locked.append(Image.fromarray(p))
    return locked


def chevron_states(theme):
    image = Image.open(SOURCE / f'{theme}-chevrons.png').convert('RGB')
    rendered = []
    for i in range(3):
        crop = image.crop((i * 512, 100, (i + 1) * 512, 850))
        alpha = silhouette(crop, checker=True)
        box = alpha.getbbox()
        crop.putalpha(alpha)
        crop = crop.crop(box).resize((NW - 8, AH - 8), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (NW, AH))
        frame.alpha_composite(crop, (4, 4))
        rendered.append(frame)
    idle = np.asarray(rendered[0])
    for i in (1, 2):
        p = np.asarray(rendered[i]).copy()
        missing = p[:, :, 3] < 200
        fallback = idle[:, :, :3].astype(float) * (1.15 if i == 1 else .55)
        p[missing, :3] = np.clip(fallback[missing], 0, 255).astype(np.uint8)
        p[:, :, 3] = idle[:, :, 3]
        rendered[i] = Image.fromarray(p)
    return rendered


def generated_states(theme):
    """Extract themed AI sheets using the same fixed cells and idle-alpha lock."""
    image = Image.open(SOURCE / f'{theme}-atlas.png').convert('RGB')
    sets = []
    for kind, bounds, size, inset in [
            ('action', (.155, .845), (AW, AH), (20, 12)),
            ('chevron', (.845, 1), (NW, AH), (4, 4))]:
        frames = []
        for row in range(3):
            crop = image.crop((round(image.width * bounds[0]), round(image.height * row / 3),
                               round(image.width * bounds[1]), round(image.height * (row + 1) / 3)))
            alpha = silhouette(crop, checker=True,
                               body_top=int(crop.height * .22) if kind == 'action' else None,
                               body_bottom=int(crop.height * .79) if kind == 'action' else None)
            # Remove the generated matte's one-pixel fringes and the small
            # checker fragments attached by antialiased shadow pixels.
            alpha = alpha.filter(ImageFilter.MinFilter(3))
            labels, sizes = components(np.asarray(alpha) > 0)
            a = np.asarray(alpha).copy()
            a[labels != max(sizes, key=sizes.get)] = 0
            alpha = Image.fromarray(a)
            crop.putalpha(alpha)
            crop = crop.crop(alpha.getbbox())
            crop = crop.resize((size[0] - 2 * inset[0], size[1] - 2 * inset[1]), Image.Resampling.LANCZOS)
            frame = Image.new('RGBA', size)
            frame.alpha_composite(crop, inset)
            frames.append(frame)
        idle = np.asarray(frames[0])
        for row in (1, 2):
            p = np.asarray(frames[row]).copy()
            missing = p[:, :, 3] < 200
            fallback = idle[:, :, :3].astype(float) * (1.15 if row == 1 else .55)
            p[missing, :3] = np.clip(fallback[missing], 0, 255).astype(np.uint8)
            p[:, :, 3] = idle[:, :, 3]
            frames[row] = Image.fromarray(p)
        sets.append(frames)
    return sets


def shade_hover_text_panel(image):
    """A soft inset shade behind labels; leave the frame, gems and alpha intact."""
    pixels = np.asarray(image).copy()
    y, x = np.indices((image.height, image.width), dtype=float)
    x /= image.width
    y /= image.height

    def smoothstep(start, end, value):
        t = np.clip((value - start) / (end - start), 0, 1)
        return t * t * (3 - 2 * t)

    horizontal = smoothstep(.13, .27, x) * (1 - smoothstep(.73, .87, x))
    vertical = smoothstep(.24, .38, y) * (1 - smoothstep(.64, .79, y))
    shade = 1 - .64 * horizontal * vertical
    pixels[:, :, :3] = np.rint(pixels[:, :, :3] * shade[:, :, None]).astype(np.uint8)
    return Image.fromarray(pixels)


def build():
    themes = ['forged-metal', 'infernal', 'glacial', 'celestial'] + GENERATED_THEMES
    index = {'version': 5, 'width': SHEET_W, 'height': SHEET_H,
             'themes': themes, 'states': STATES, 'entries': []}
    for row, state in enumerate(STATES):
        for kind, x, w in [('chevron-prev', GAP, NW), ('action', 2 * GAP + NW, AW),
                           ('chevron-next', 3 * GAP + NW + AW, NW)]:
            index['entries'].append({'key': f'{kind}-{state}', 'x': x,
                                     'y': GAP + row * (AH + GAP), 'width': w,
                                     'height': AH, 'anchor': [w / 2, AH / 2]})
    metrics = {}
    for theme in themes:
        actions, arrows = generated_states(theme) if theme in GENERATED_THEMES else (main_states(theme), chevron_states(theme))
        actions[1] = shade_hover_text_panel(actions[1])
        sprites = {}
        for i, state in enumerate(STATES):
            sprites[f'action-{state}'] = actions[i]
            sprites[f'chevron-next-{state}'] = arrows[i]
            sprites[f'chevron-prev-{state}'] = ImageOps.mirror(arrows[i])
        atlas = Image.new('RGBA', (SHEET_W, SHEET_H))
        metrics[theme] = {}
        for entry in index['entries']:
            sprite = sprites[entry['key']]
            atlas.alpha_composite(sprite, (entry['x'], entry['y']))
            metrics[theme][entry['key']] = {'bounds': sprite.getbbox()}
        atlas.save(OUT / f'{theme}.png', optimize=True)
        print(f'{theme}: {atlas.size}, {len(sprites)} registered sprites')
    (OUT / 'index.json').write_text(json.dumps(index, indent=2) + '\n')
    (OUT / 'registration.json').write_text(json.dumps(metrics, indent=2) + '\n')


if __name__ == '__main__':
    build()
