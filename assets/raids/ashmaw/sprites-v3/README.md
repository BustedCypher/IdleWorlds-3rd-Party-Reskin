# Ashmaw drawn animation sheets

Two transparent 24-frame PNG sheets, drawn frame by frame with the built-in
ImageGen tool. No rig, mesh warp, image morph, or generated interpolation is used.
Idle follows an inhale/exhale cycle. Fire breath follows inhale, ignition,
sustained flame, taper, and return to rest. Both play at 24 fps and wrap in order.

Each of the 48 drawings was generated as part of a two-frame native contact sheet.
The native drawing cells are approximately 1086 × 724 pixels (small output-size
variations are recorded in the manifest), about twice the original 543 × 362.
They are copied without resampling into 1200 × 800 cells with transparent padding.
The final sheets are 7200 × 3200 pixels, six columns by four rows, read left to
right and then top to bottom. Whole-frame integer translation aligns feet and
reduces camera jitter without changing any drawing's anatomy.

- `idle-24.png`: 24 individually painted idle drawings.
- `fire-breath-24.png`: 24 individually painted fire-breath drawings.
- `sprites.json`: cell crops, source drawing provenance, registration, playback
  timing, and measurements comparing neighboring frames and the loop seam.
- `source/`: original generated two-frame contact sheets.
- `prompts.json`: complete prompts and ImageGen output paths.

Image generation follows a fixed character reference to retain scale plates,
horns, wing veins and lava cracks. These are generated drawings; fine painted
details are not guaranteed to be pixel-identical between poses. The loop seam
check measures its difference relative to normal neighboring frames rather than
claiming that two distinct drawings are identical.

Rebuild with `node build-tools/assemble-ashmaw-drawn-sprites.mjs` and
`node build-tools/preview-ashmaw-sprites-v3.mjs`. The preview has pause, frame
scrubbing, speed, and large-view controls. It is also written to the earlier
sprite preview URLs so the already-open page can be refreshed.
