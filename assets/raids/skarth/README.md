# Skarth — Drowned Leviathan

`arena.png` is an exact copy of the approved `output/skarth-leviathan/leviathan-v2.png`; no pieces of it are extracted for motion.

Fresh built-in ImageGen assets (all RGBA with genuine transparency):

- `atmosphere.png`: 2x2 atlas, two storm-cloud banks and two low mist variants.
- `ice.png`: 2x2 atlas, four distinct floes with a low water-plane perspective.
- `water.png`: 2x2 atlas, foam ring/crescent and two low spray crests.
- `prompts.json`: exact generation prompts, excluded from the release ZIP.

`src/modules/SkarthArenaRenderer.js` caches the atlas cells once, clips floes and ripples to the open-water channel, masks clouds away from the head and ruins, and adds custom Canvas snow sprites/droplets. 72-second deterministic loop with downstream drift, faded resets, ice bob and gentle turn; separate layer toggles. The approved boss itself remains fixed.

`SkarthScene.js` draws at up to 1440x720 and 30 FPS, pauses offscreen/hidden/reduced-motion, preserves native raid nodes, and releases resources on removal or encounter change. Missing optional textures retain snow and water droplets; failed painting leaves native art; failed Canvas retains the approved still.

Preview: `http://127.0.0.1:4175/skarth-arena/`. The ESM `scene.js` preview is bundled from the canonical renderer using esbuild.

Validation: `node tests/skarth-scene.test.mjs`, `node tests/skarth-loop.test.mjs`, `node output/skarth-arena/verify.mjs`, and `npm test`.
