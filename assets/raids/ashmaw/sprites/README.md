# Ashmaw sprite sheets

Two standalone RGBA PNG sheets generated with the built-in ImageGen tool:

- `idle.png`: 8 authored poses, breathing and wing/neck/tail movement.
- `fire-breath.png`: 8 authored poses, inhale → ignition → flame → recovery.

Both use a 4-column × 2-row grid, read left to right, then top to bottom.
The actual sheet and cell sizes, playback sequences, timings, and foot-baseline
offsets are recorded in `sprites.json`. `displayScale` is constant per animation
to match the dragon's apparent size between the two independently generated sheets.
Frames are painted sprites; playback does not deform or interpolate the dragon.

Idle uses forward/reverse playback for a continuous resting cycle. Fire breath
plays in order and returns to its resting pose. Playback registration keeps the
feet on a shared baseline without changing the original generated PNG pixels.
`prompts.json` records generation and targeted cleanup prompts.

Run `node build-tools/preview-ashmaw-sprites.mjs` to check transparency and crop
clearance, refresh `sprites.json`, and generate the side-by-side playback preview
at `output/ashmaw-sprites/index.html`. With the existing local preview server it
opens at `http://127.0.0.1:4175/output/ashmaw-sprites/`.
