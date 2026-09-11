# Retina Skill Theme Atlases Design

## Goal

Replace the nine blurry, artifact-prone themed skill UI atlases with clean theme-matched artwork that stays sharp in the browser on high-density displays.

## Root cause

The current source previews are approximately 1710 x 920, but the rebuild tool downsamples every theme to an 860 x 463 physical image. The extension then re-encodes that already-small detailed artwork as lossy WebP. On a 2x or 3x display the browser must enlarge the atlas pixels, which causes the visible blur. The current checkerboard-removal algorithm also derives a hard connected-component mask from RGB previews; resampling that mask produces jagged transitions and retains light RGB contamination around translucent edges.

## Artwork

Each theme keeps the existing twelve logical ornament roles and approximate composition, but may redraw small details for clarity. Each sheet should read as one coherent family:

- celestial: ivory-silver filigree, sapphire crystal, restrained star motifs
- forged-metal: gunmetal, cold steel, blue energy, angular forged details
- glacial: ice-blue steel, frost crystals, sharp frozen edges
- infernal: blackened iron, ember-orange cores, restrained flame cracks
- lunar-spectral: moon-silver, indigo-violet glow, spectral curves
- runic-arcane: aged teal metal, turquoise runes, scholarly geometry
- tempest-oceanic: dark marine metal, cyan energy, wave and storm cues
- verdant: aged gold-green metal, emerald cores, thorn and leaf cues
- voidborn: dark violet metal, amethyst cores, sparse void-like curves

No text, logos, watermarks, background scene, checkerboard, or opaque backdrop may appear. Empty space must be genuinely transparent. Fine points must remain inside their assigned sprite slots.

## Pixel-density contract

The runtime keeps the existing 860 x 463 logical coordinate system and every existing logical entry in `skills_ui_index.json`. New family atlases are 1720 x 926 physical pixels with `pixelRatio: 2` recorded in `zone-theme-map.json`. This preserves all percentage-based CSS sprite windows while supplying two image pixels per CSS pixel.

The source repository owns lossless PNG and lossless WebP atlases. The fantasy-skin importer accepts an integer source pixel ratio, validates physical dimensions against logical dimensions multiplied by that ratio, copies the 2x theme atlas without reducing it, and crops the corner cell using scaled source coordinates into a 2x corner sheet. Runtime URLs and CSS remain unchanged.

## Edge handling

Generated transparent source sheets are preferred. The rebuild path must preserve continuous alpha rather than converting edges to a binary mask. If a generated sheet contains an opaque neutral background, extraction must estimate a soft foreground matte and decontaminate edge RGB before resizing. Final atlases must contain partial-alpha edge pixels, no light checkerboard blocks, and no visible halo when composited over near-black.

## Verification

- Source tests assert 1720 x 926 RGBA outputs, matching PNG/WebP visible pixels and alpha, non-empty sprites in all twelve logical slots, no pixels outside slots, and meaningful partial-alpha coverage.
- Import tests or executable checks assert the declared 2x ratio, physical atlas dimensions, and 352 x 380 physical corner sheets.
- Existing sprite-window audit must continue to validate the unchanged 860 x 463 logical coordinate system.
- Render fixtures at DPR 1, 2, and 3 and visually inspect representative pale, dark, and high-glow themes for blur, halos, clipping, and wrong sprite windows.
- Run the source rebuild test plus the fantasy-skin build and full test suite.

## Constraints

- Preserve unrelated working-tree changes in the source repository.
- Do not stage, commit, or push in either repository.
- Preserve existing runtime filenames so consumers do not need URL changes.
- Keep each deployable file below the existing 25 MiB hosting limit.
