# Ashmaw close-up living portrait

Eight-second seamless loop at 1915 × 821. This standalone preview animates the selected cinematic close-up with a slow head/neck inhale and longer settling exhale, one painted eye blink, mouth heat, billowing smoke and embers. The breathing rise is approximately 16 pixels, with a slight rigid head inclination. The jaw remains in its painted open pose. One fixed dragon bitmap preserves the scale, horn and tooth details throughout the loop.

Dense painted smoke banks obscure the base of the dragon's neck, with drifting curls in front and behind his shoulders. Smaller plumes drift from his mouth and nostril, and distant smoke rises among the ruins. Moving light bands descend on six lava falls, masked to the original painted lava so the rock boundaries stay fixed. Nearby lava light pulses gently. The head motion is unchanged from the approved stronger breathing version.

The lava surfaces also carry rolling molten texture: bright eddies and darker cooling patches flow through 17 river and spillway regions. Slower drift on the broad rivers and faster downward streaks on the falls use a periodic texture, with masks extracted from the painted hot lava inside channel polygons. The original stone, architecture and background composition remain fixed. Hardware rendering uses a WebGL pass; software graphics uses a lightweight Canvas texture pass.

## Assets

- `background.png`: volcanic background plate with the dragon removed.
- `dragon.png`: transparent foreground portrait.
- `blink.png`: transparent portrait with the large eye closed. The renderer uses only a feathered eye region from this image.
- `smoke.png`: transparent painted volcanic smoke used for layered drifting clouds and warm exhaust.
- `prompts.json`: exact edit prompts and source provenance. Generated with the built-in ImageGen tool.

## Preview and export

Run `node build-tools/preview-ashmaw-portrait.mjs` to build the preview. With the existing local preview server running, open `http://127.0.0.1:4175/output/ashmaw-portrait/`.

The renderer is `build-tools/ashmaw-portrait-scene.js`. All motion is periodic over eight seconds; smoke and embers fade before they reset. The preview includes pause, scrub and WebM download controls and respects reduced motion on initial load.

Run `node build-tools/verify-ashmaw-portrait.mjs` with the preview server running to check the exact start/end pixels, near-seam continuity, breathing bounds, visible blink, smoke, changing lava fall and playback controls. It also exports `output/ashmaw-portrait/ashmaw-portrait-loop.webm`, an eight-second 30 fps recording, and representative stills, and records a renderer timing sample.

This is a preview asset set. It is not yet integrated into the live raid encounter.
