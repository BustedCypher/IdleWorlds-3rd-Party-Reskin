# Boss headshot overlays

Five individually generated magical frames: Ashmaw (embers), Thessaly (storm),
Morwenna (shadow), Grimjaw (spectral frost), and Skarth (glacier ice).
The portrait stays opaque. The health channel and outside are transparent.
No health, names, percentages or countdowns are baked into the artwork.

Final deliverables are one directory up:

- `boss-health-atlas.png`: transparent 1280×2222 atlas, five separate cells.
- `boss-health-index.json`: source rectangles and local health-channel coordinates.
- `boss-health-atlas.css`: CSS atlas windows for `data-encounter` values.
- `sprites/boss-health-{boss}.png`: five independent transparent 1216×406 overlays.
- `boss-portraits/preview.html`: checkerboard and filled examples using the atlas.

Every cell has a 32px transparent gutter. Coordinates are physical pixels;
`pixelRatio: 2` means the suggested display size is 608×203 CSS pixels. Scale
uniformly to another width. Render the live HP track FIRST, then the artwork
above it, then the live text. The safe fill rectangle is `(280,168,804,68)`
within each sprite. Pointer events on the overlay should be disabled.

The live extension reads the native encounter name in `RaidHud.js` and applies
the corresponding overlay in `guild.css`. Unknown names clear the previous
portrait. Native fill nodes, percentages and event handlers remain owned by
the game. Release packaging ships all five independent sprites.

`*-final.png` are untouched built-in ImageGen outputs; `prompts.json` records
the prompts. Earlier source studies are kept for reference and are not shipped.
The packer normalizes source canvases and clears any residual alpha matte in
the safe fill rectangle to guarantee every pixel there is fully transparent.

Rebuild: `node build-tools/build-raid-boss-portraits.mjs`.
Verify: `node build-tools/verify-raid-boss-portraits.mjs`.
Set `PLAYWRIGHT_BROWSERS_PATH` if required by the installed browser cache.
Verification checks atlas bounds, gutters, pixel transparency, opaque portraits,
and atlas/sprite agreement. `tests/raid-hud.test.mjs` checks all five encounter
transitions, asset loading, native fill preservation, cleanup and phone layout.
These are browser fixture checks; they do not establish live-game verification.
