"""Normalize a restored corner PNG into the extension's panel-corner sheet.

The command intentionally requires a high-resolution restoration as input. The
old atlas crops are damaged and must never silently overwrite the repaired
assets. One canonical quadrant is cleaned and mirrored into the exact 2x2
border-image layout used by the extension.
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
# The old derived sheets are 2x logical density (352x380). Eight physical
# pixels per logical pixel makes the repaired sheets exactly 4x larger on each
# axis: 1408x1520.
OUTPUT_SCALE = 8


def rebuild(theme: str, generated: Path) -> Path:
    target_width = 176 * OUTPUT_SCALE
    target_height = 190 * OUTPUT_SCALE
    restored = Image.open(generated).convert("RGBA")
    # Canonicalising from one quadrant prevents tiny generative differences
    # between copies from becoming visible when border-image slices meet.
    source = restored.crop((0, 0, restored.width // 2, restored.height // 2))
    rgba = np.asarray(source, dtype=np.uint8).copy()
    rgba[rgba[..., 3] < 16] = 0
    rgba[rgba[..., 3] == 0, :3] = 0
    source = Image.fromarray(rgba, "RGBA")
    # Leave a clean transparent safety margin on the two canvas-facing sides.
    # The inner sides retain their full reach.
    margin = OUTPUT_SCALE // 2
    content = source.resize(
        (target_width - margin, target_height - margin),
        Image.Resampling.LANCZOS,
    )
    target_corner = Image.new("RGBA", (target_width, target_height))
    target_corner.alpha_composite(content, (margin, margin))

    sheet = Image.new("RGBA", (target_corner.width * 2, target_corner.height * 2))
    transpose = Image.Transpose
    sheet.alpha_composite(target_corner, (0, 0))
    sheet.alpha_composite(target_corner.transpose(transpose.FLIP_LEFT_RIGHT), (target_corner.width, 0))
    sheet.alpha_composite(target_corner.transpose(transpose.FLIP_TOP_BOTTOM), (0, target_corner.height))
    sheet.alpha_composite(target_corner.transpose(transpose.ROTATE_180), (target_corner.width, target_corner.height))

    # Preserve the original one-logical-pixel transparent safety margin.
    pixels = np.asarray(sheet, dtype=np.uint8).copy()
    margin = OUTPUT_SCALE
    pixels[:margin] = 0
    pixels[-margin:] = 0
    pixels[:, :margin] = 0
    pixels[:, -margin:] = 0
    sheet = Image.fromarray(pixels, "RGBA")

    output = ASSET_DIR / f"panel_corners_{theme}.webp"
    sheet.save(output, "WEBP", lossless=True, quality=100, method=6, exact=True)
    alpha = np.asarray(sheet)[..., 3]
    print(
        f"{output.relative_to(ROOT)}: {sheet.width}x{sheet.height}, "
        f"transparent={(alpha == 0).mean():.1%}, semi={((alpha > 0) & (alpha < 255)).mean():.1%}"
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
