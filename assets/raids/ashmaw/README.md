# Ashmaw custom atmosphere

`arena.png` remains the approved fixed composition. The live scene uses the Subtle (0.75) preset from `output/ashmaw-custom-atmosphere/`.

The approved painterly arena was generated with built-in ImageGen from the user's composition references. Its generation/edit prompts remain in `arena-source/prompts.json`. The game supplies its own party sprites and state over the empty basalt ground. Original smoke provenance remains in `smoke-source/prompts.json`.

Fresh transparent built-in ImageGen atlases, copied without modification:

- `clouds.png`: four dark cloud banks.
- `furnace-smoke.png`: four curled furnace smoke plumes.
- `steam.png`: two low haze and two rising geothermal steam shapes.
- `prompts-custom-atmosphere.json`: exact generation prompts; excluded from release ZIP.

The canonical `AshmawArenaRenderer.js` caches feathered atlas cells, masks clouds to the sky, preserves the original lava flow/furnace pulse/eye light and emitter timing, and draws four irregular Canvas cinder sprites. No pieces of the painting are sampled for moving clouds. Deterministic 16-second loop.

`AshmawScene.js` loads the three optional textures with CORS, renders at up to 1440×720 and 30 FPS, pauses offscreen/hidden/reduced-motion, and releases resources on removal or encounter change. Missing textures keep lava/light/cinders; missing painting restores native art; failed Canvas keeps the approved still. Native controls and state remain owned by the game.

The original `smoke.png` and earlier sprite/portrait studies are retained for historical previews. Live raids no longer request the original smoke image.

Validation: `node tests/ashmaw-scene.test.mjs`, `node tests/ashmaw-loop.test.mjs`, and `npm test`.
