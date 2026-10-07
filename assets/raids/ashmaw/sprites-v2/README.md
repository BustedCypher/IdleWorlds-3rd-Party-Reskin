# Ashmaw sprite sheets, version 2

Two transparent PNG sheets: `idle-24.png` and `fire-breath-24.png`.
Each is 9216 × 4096: six columns, four rows, 24 unique frames read row-major.
Each cell is **1536 × 1024**, versus 543 × 362 previously: 2.83× the linear
resolution and 8× the pixels per frame. Default playback is 24 fps, one second
per complete loop. The preview also offers 12 fps and 30 fps playback.

The entire character is painted once in `source/dragon-master.png` using
built-in ImageGen. Its same UV texture is used for every frame in both sheets,
so individual scales, cracks, horns, belly plates, and wing veins do not get
redrawn between frames. A fixed texture rig poses wings, chest, head/neck,
jaw, and tail, with the feet pinned. The fire plume is a separate ImageGen
source layer. The rig is baked into the sheets; playback uses only PNG crops.
These are high-resolution source assets for review; the previous assets remain
available in `../sprites/`.

Reproduce the bake with `node build-tools/bake-ashmaw-sprites.mjs`.
Refresh the preview with `node build-tools/preview-ashmaw-sprites-v2.mjs`.
`sprites.json` includes crop rectangles, timing, source references, and bake
verification: 24 distinct frames, pixel-identical cycle endpoints, continuity
immediately before wrapping, fixed foot alpha, and transparent cell edges.
The complete ImageGen prompts are saved in `prompts.json`.
