# Ashmaw, the Cinder Tyrant

The live Guild raid uses `arena.png`, the approved painterly arena generated
with the built-in ImageGen tool using the user's composition references.
Its uneven basalt ground
is empty of painted raiders; the game supplies its own party sprites and state.
The painting's generation/edit prompts are in `arena-source/prompts.json`.
`smoke.png` is the existing transparent texture reused from the earlier
portrait study; its provenance is in `smoke-source/prompts.json`. Both assets
are bundled for offline use. Earlier sprite and portrait experiments remain
local and are excluded from the release package.

`src/modules/AshmawArenaRenderer.js` provides the shared 16-second Canvas 2D
loop: billowing painted clouds, smoke, furnace light, eye wisps, flowing lava,
steam and embers. The boss silhouette and ground stay anchored. Battle effects
are disabled. `AshmawScene.js` mounts the decorative layer beneath native raid
controls, caps rendering at 1440px, suspends it offscreen or when the document
is hidden, and shows a still frame for reduced motion. Cleanup releases its
canvases and listeners. A missing optional smoke texture still allows motion;
a missing painting leaves the native game scene intact.

Verification: `node tests/ashmaw-scene.test.mjs` checks ownership and encounter
isolation. `node tests/ashmaw-loop.test.mjs` checks rendered frame identity at
0/16 and 3/19 seconds, real motion, seam continuity, cross-origin textures,
reduced motion, suspension, and active cleanup in Chromium. Both run in npm test.

Run `node build-tools/preview-ashmaw-arena.mjs` to generate the arena study from
these bundled assets. Run `node build-tools/export-ashmaw.mjs --video` to generate
`output/ashmaw/index.html`, `scene.js`, and `ashmaw-loop.webm`.
The HTML loops automatically and offers Pause/Play. `--serve` opens a local
preview server at `http://127.0.0.1:4175/output/ashmaw/`. The WebM contains one
cycle; enable looping in its player. Outputs are intentionally gitignored.
