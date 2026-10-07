# Skarth animation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Finish the approved Skarth leviathan as an animated preview and integrated raid backdrop, with custom floating ice, clouds, mist, blizzard and breach-water effects.

**Architecture:** Preserve the approved v2 painting. A deterministic 72-second Canvas renderer draws independent transparent effect atlases with a fixed seed. Follow Grimjaw's scene lifecycle and native HUD ownership; share one renderer between standalone and live views.

**Tech stack:** JavaScript, Canvas 2D, built-in ImageGen transparent atlases, esbuild, JSDOM, Playwright.

**Spec:** User's approved composition and request in this conversation: floating ice, clouds, blizzard snow like Grimjaw, splashing/flowing water around the breaches; complete all work without further check-ins.

## Constraints and review focus

- Presentation only; no gameplay data changes or native-node reparenting.
- Keep the exact approved composition and character. Never animate cropped duplicates of painted clouds or ice.
- Subtle one-direction cloud/mist travel with faded resets; natural ice bob/turn and downstream drift; snow streaks aligned with varied falling trajectories.
- Effects respect shore, sky, head and coil boundaries. No sky clouds on boss, no floes sliding over paving.
- Optional asset failure retains usable animation; painting or canvas failure uses native art or approved still respectively.
- Pause hidden/offscreen/reduced-motion; teardown releases all RAFs, observers and owned buffers. Late loads cannot revive a changed encounter.

## Task 1: Assets and renderer

- [x] Generate three transparent 2x2 atlases (atmosphere, ice, water), copy to output and assets/raids/skarth, retain exact prompts.
- [x] Add failing loop test covering exact repeat, per-layer movement, independent toggles, optional missing textures, bounded dimensions and buffer disposal.
- [x] Implement src/modules/SkarthArenaRenderer.js with cached alpha cells, masked sky/water and separate ice/cloud/mist/water/snow layers; make loop test pass.
- [x] Create output/skarth-arena preview with accessible toggles/pause, reduced motion and bundled canonical renderer. Verify atlas transparency and visual output at multiple times/mobile; measure render cost.

## Task 2: Live wiring

- [x] Add failing tests/skarth-scene.test.mjs for native nodes, transitions and cleanup.
- [x] Implement src/modules/SkarthScene.js following Grimjaw, add GuildPanels calls and guild.css scene selectors, required build assets, package test registration and native extension fixture.
- [x] Verify delayed loads, optional asset failure, native painting failure, canvas fallback, visibility, reduced-motion, native controls and responsive HUD.

## Task 3: Delivery

- [x] Run targeted tests then full npm test. Obtain one final fresh reviewer, address material findings with reproducing tests.
- [x] Build package, verify archive contains new assets and current bundle. Leave preview open and document commands/asset provenance and validation.

## Execution ledger

- Ruling: Work in the user's existing dirty checkout, preserving earlier boss work and preview server paths; do not create a separate branch or commit unrelated changes. The user explicitly authorized finishing the ongoing shared scene overnight.
- Ruling: Snow flakes and streaks are custom Canvas sprites, suited to a code-native particle effect. Clouds, ice and foam/spray use fresh raster assets; the approved artwork is never cut up for motion.
- Ruling: Integration is included in 'all the way to the end' following the established boss workflow. No browser-extension reload or authenticated battle action is attempted.

- Complete: three fresh transparent atlases and custom Canvas snow/droplets saved; approved painting SHA256 a3507d6ceefa82880af373796713ab28e797d665af01611ba188fa4107b7f975 remains unchanged.
- Tests: initial scene assertion failed before wiring; missing renderer failed before implementation. Scene and browser loop tests then passed, including optional texture failures, still/native fallback, stale load, cleanup and visibility.
- Preview: exact loop repeat; varied 34.85–63.25 degree sleet aligned with velocity (minimum alignment 0.99999993); all six effect layers visibly contribute; all three atlases have true/partial alpha; 390px reduced-motion layout has no overflow; 1440x720 measured 12.48ms/frame. Desktop, mobile and 0/12/36/60 second frames inspected.
- Final review: fresh reviewer review_skarth found no material issues. Coverage limits: authenticated gameplay was not exercised; masks were visually inspected rather than region-pixel asserted.
- Full npm test exited 0; unpacked-extension fixture includes all five bosses and switches, responsive HUD and native handler preservation. Logs output/skarth-arena/test-run.log.
- npm run package exited 0; verified 245-file 126099497-byte archive contains current bundle and all four Skarth PNGs, excludes prompts. Existing soft bundle-size/icon warnings remain.
- Deliverables: animated preview open at /skarth-arena/, 10-second preview.webm, current release ZIP. No commit/push or extension reload performed.
