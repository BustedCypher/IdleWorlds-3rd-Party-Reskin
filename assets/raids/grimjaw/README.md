# Grimjaw — approved frozen courtyard

The live scene uses the approved left-facing helmet/skull painting and the final
blizzard, including streaks aligned to their actual trajectory and varied fall
angles. `arena.png` is the approved `output/grimjaw-arena/arena-helmet-v2.png`.
The cloud and mist atlases are independent generated assets with transparency.

`src/modules/GrimjawArenaRenderer.js` is the shared 72-second renderer; the portable
preview's `scene.js` is bundled from it. Live drawing is capped at 30fps and
1440 × 720. Artwork stays fixed; snow, squalls, cloud banks, hand energy, breath
and foreground mist animate separately.

`GrimjawScene.js` owns only the decorative layer. Painting failures restore native
art, unavailable Canvas keeps the approved still, and missing atmosphere atlases
leave procedural snow and hand energy. Offscreen, hidden-tab and reduced-motion
pauses and teardown follow the other raid scene managers.

Generation prompts are recorded in `prompts.json`; design documentation and
prompts are excluded from release packaging.
