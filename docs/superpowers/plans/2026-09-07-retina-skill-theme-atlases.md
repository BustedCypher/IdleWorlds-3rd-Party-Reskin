# Retina Skill Theme Atlases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nine low-resolution themed skill UI atlases with clean 2x assets and make the browser import/runtime path preserve that density.

**Architecture:** The sprites repository remains the source of truth and emits 1720 x 926 physical atlases against the existing 860 x 463 logical layout. The fantasy-skin importer reads a declared `pixelRatio`, validates and copies the high-density sheets, and produces scaled corner sheets while CSS continues using the unchanged logical index.

**Tech Stack:** Python 3, Pillow, NumPy, PNG/WebP, Node.js, Playwright, CSS sprite atlases

**Spec:** `docs/superpowers/specs/2026-09-07-retina-skill-theme-atlases-design.md`

## Global Constraints

- Preserve unrelated working-tree changes in `idleWorlds-game-sprites-BC`.
- Do not stage, commit, or push in either repository.
- Keep the logical atlas geometry exactly 860 x 463 and physical family atlases exactly 1720 x 926.
- Preserve runtime filenames and all twelve existing logical sprite entries.
- Use genuine transparency and continuous antialiased alpha; no checkerboard, halo, text, logo, or watermark.

---

### Task 1: Lock the 2x source-atlas contract with tests

**Files:**
- Modify: `../idleWorlds-game-sprites-BC/tests/test_rebuild_skill_atlases.py`
- Modify: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families/zone-theme-map.json`

**Interfaces:**
- Consumes: the existing `rebuild_all(base_path, preview_dir, output_dir)` CLI contract
- Produces: assertions for `pixelRatio: 2`, 1720 x 926 outputs, scaled slot bounds, continuous alpha, and PNG/WebP parity

- [ ] Add assertions that every output is 1720 x 926 RGBA and every logical target box is scaled by two.
- [ ] Add a partial-alpha assertion that fails when sprite edges are binary or missing.
- [ ] Add `pixelRatio: 2` and keep `canvas.width`/`canvas.height` logical at 860/463.
- [ ] Run `python -m unittest tests.test_rebuild_skill_atlases` and confirm failure because the builder still emits 860 x 463.

### Task 2: Generate and rebuild nine transparent 2x theme families

**Files:**
- Replace: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/source-previews/{theme}.png`
- Modify: `../idleWorlds-game-sprites-BC/tools/rebuild_skill_atlases.py`
- Replace: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families/skills_ui_atlas_theme_{theme}.png`
- Replace: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families/skills_ui_atlas_theme_{theme}.webp`
- Replace: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families/previews/atlas-theme-families.png`
- Modify: `../idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families/README.md`

**Interfaces:**
- Consumes: nine theme prompts, twelve source regions, twelve logical target boxes
- Produces: nine 1720 x 926 lossless RGBA atlases plus contact sheet

- [ ] Generate one transparent remastered sheet per theme using the approved palette/material brief and the existing preview as composition reference.
- [ ] Inspect each generated sheet and reject any with text, opaque background, missing ornaments, or merged neighboring sprites.
- [ ] Change the rebuild target canvas and target boxes to 2x physical pixels while preserving logical geometry metadata.
- [ ] Preserve source alpha directly when present; use soft matte extraction only as fallback for opaque inputs.
- [ ] Rebuild all PNG/WebP files and the family contact sheet.
- [ ] Run `python -m unittest tests.test_rebuild_skill_atlases` and confirm it passes.

### Task 3: Lock and implement the 2x fantasy-skin import contract

**Files:**
- Modify: `build-tools/import-skill-themes.mjs`
- Modify: `tests/zone-themes.test.mjs`
- Replace: `assets/skills-ui/theme_{theme}.webp`
- Replace: `assets/skills-ui/panel_corners_{theme}.webp`
- Replace: `assets/skills-ui/zone-theme-map.json`
- Generated without semantic change: `src/modules/zoneThemes.js`

**Interfaces:**
- Consumes: `zone-theme-map.json.canvas` as logical dimensions and `zone-theme-map.json.pixelRatio` as physical scale
- Produces: unchanged theme URLs, 1720 x 926 theme sheets, and 352 x 380 corner sheets

- [ ] Add test assertions for source pixel ratio and imported physical dimensions; run the test and confirm it fails against current 1x imports.
- [ ] Update importer validation to require `naturalWidth === canvas.width * pixelRatio` and equivalent height.
- [ ] Scale corner source coordinates and destination dimensions by `pixelRatio`, preserving smooth alpha and using lossless WebP encoding.
- [ ] Run `npm run import:skill-themes` and inspect output dimensions and file sizes.
- [ ] Run `node tests/zone-themes.test.mjs` and confirm it passes.

### Task 4: Browser-density and regression verification

**Files:**
- Modify if needed: `build-tools/render-fixtures.mjs`
- Create if needed: `output/retina-skill-theme-atlas-dpr-{1,2,3}.png`

**Interfaces:**
- Consumes: imported 2x runtime assets and current CSS sprite geometry
- Produces: DPR comparison evidence and complete automated verification

- [ ] Render representative celestial, infernal, and voidborn sprites at DPR 1, 2, and 3.
- [ ] Inspect the screenshots for crisp edges, no checkerboard halo, no clipping, and correct windows.
- [ ] Run `node build-tools/audit-sprite-windows.mjs` and confirm all logical windows pass.
- [ ] Run `npm test` and confirm build plus all regression suites pass.
- [ ] Compare git status/diffs in both repositories and confirm only scoped files plus pre-existing user changes remain.
