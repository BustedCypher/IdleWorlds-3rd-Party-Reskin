"""Normalize one restored separator PNG into a production separator sheet.

The command intentionally requires a high-resolution restoration as input. The
old atlas crops are damaged and must never silently overwrite the repaired
assets. A canonical left half is cleaned and mirrored for exact bilateral
symmetry, then fitted onto the 8x-density transparent UI canvas.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "skills-ui"
THEMES = (
    "celestial",
    "forged-metal",
    "glacial",
    "infernal",
    "lunar-spectral",
    "runic-arcane",
    "tempest-oceanic",
    "verdant",
    "voidborn",
)
# Atlas cell 219x73 at eight physical pixels per logical pixel.
OUTPUT_SIZE = (1752, 584)
SAFETY_MARGIN = 16


def shifted(array: np.ndarray, dy: int, dx: int) -> np.ndarray:
    result = np.zeros_like(array)
    src_y0 = max(0, -dy)
    src_y1 = array.shape[0] - max(0, dy)
    src_x0 = max(0, -dx)
    src_x1 = array.shape[1] - max(0, dx)
    dst_y0 = max(0, dy)
    dst_y1 = array.shape[0] - max(0, -dy)
    dst_x0 = max(0, dx)
    dst_x1 = array.shape[1] - max(0, -dx)
    result[dst_y0:dst_y1, dst_x0:dst_x1] = array[src_y0:src_y1, src_x0:src_x1]
    return result


def clean_alpha(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    alpha = rgba[..., 3].astype(np.float32)
    rgb = rgba[..., :3].astype(np.float32)

    # Generated alpha often carries a coloured, nearly invisible fringe. Drop
    # it, then expand trustworthy interior colour underneath the remaining
    # antialiasing so compositing stays clean on both light and dark surfaces.
    alpha = np.clip((alpha - 24.0) * (255.0 / 231.0), 0, 255)
    known = alpha >= 192
    bleed = rgb.copy()
    for _ in range(16):
        missing = (~known) & (alpha > 0)
        if not np.any(missing):
            break
        sums = np.zeros_like(bleed)
        counts = np.zeros(alpha.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not (dx or dy):
                    continue
                neighbour_known = shifted(known, dy, dx)
                sums += shifted(bleed, dy, dx) * neighbour_known[..., None]
                counts += neighbour_known
        fill = missing & (counts > 0)
        bleed[fill] = sums[fill] / counts[fill, None]
        known[fill] = True

    edge = (alpha > 0) & (alpha < 224)
    rgb[edge] = bleed[edge]
    rgb[alpha == 0] = 0
    rgba[..., :3] = np.clip(np.rint(rgb), 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(np.rint(alpha), 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def exact_bilateral(image: Image.Image) -> Image.Image:
    width, height = image.size
    left = image.crop((0, 0, width // 2, height))
    return Image.fromarray(
        np.concatenate(
            [np.asarray(left), np.asarray(left.transpose(Image.Transpose.FLIP_LEFT_RIGHT))],
            axis=1,
        ),
        "RGBA",
    )


def fit_to_canvas(image: Image.Image) -> Image.Image:
    alpha = np.asarray(image)[..., 3]
    ys, xs = np.where(alpha > 24)
    if not len(xs):
        raise RuntimeError("restoration contains no visible pixels")
    pad = 2
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(image.width, int(xs.max()) + pad + 1),
        min(image.height, int(ys.max()) + pad + 1),
    )
    ornament = image.crop(box)
    available = (OUTPUT_SIZE[0] - 2 * SAFETY_MARGIN, OUTPUT_SIZE[1] - 2 * SAFETY_MARGIN)
    scale = min(available[0] / ornament.width, available[1] / ornament.height)
    size = (max(1, round(ornament.width * scale)), max(1, round(ornament.height * scale)))
    ornament = ornament.resize(size, Image.Resampling.LANCZOS)

    rgba = np.asarray(ornament, dtype=np.uint8).copy()
    rgba[rgba[..., 3] < 12] = 0
    rgba[rgba[..., 3] == 0, :3] = 0
    ornament = Image.fromarray(rgba, "RGBA")

    canvas = Image.new("RGBA", OUTPUT_SIZE)
    position = ((OUTPUT_SIZE[0] - size[0]) // 2, (OUTPUT_SIZE[1] - size[1]) // 2)
    canvas.alpha_composite(ornament, position)
    return exact_bilateral(canvas)


def rebuild(theme: str, generated: Path) -> Path:
    source = clean_alpha(Image.open(generated))
    sheet = fit_to_canvas(exact_bilateral(source))
    output = ASSET_DIR / f"separator_flourish_{theme}.webp"
    sheet.save(output, "WEBP", lossless=True, quality=100, method=6, exact=True)
    alpha = np.asarray(sheet)[..., 3]
    ys, xs = np.where(alpha > 32)
    margins = (
        int(xs.min()), int(ys.min()), sheet.width - 1 - int(xs.max()), sheet.height - 1 - int(ys.max())
    )
    print(
        f"{output.relative_to(ROOT)}: {sheet.width}x{sheet.height}, "
        f"transparent={(alpha == 0).mean():.1%}, margins={margins}"
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("theme", choices=THEMES)
    parser.add_argument(
        "--generated",
        type=Path,
        required=True,
        help="high-resolution restored PNG; damaged atlas crops are never accepted",
    )
    args = parser.parse_args()
    rebuild(args.theme, args.generated)


if __name__ == "__main__":
    main()
