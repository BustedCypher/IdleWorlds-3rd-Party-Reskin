# Button artwork

Generated with built-in image_gen using `assets/skills_ui_atlas.webp` as the reference. Full prompts are saved in `prompts.json`.

- `action-hover.png`: illuminated amber rim and bronze action frame.
- `action-pressed.png`: darker recessed action frame.
- `chevron-idle.png`: bronze and stone right-facing chevron.
- `chevron-hover.png`: illuminated chevron.
- `chevron-pressed.png`: recessed chevron.

Open `preview.html` to compare all artwork, including left-facing chevrons displayed with CSS `transform: scaleX(-1)`.

These are additive source artwork assets. Existing live styles and theme atlases are unchanged. Generated states have variations in ornament and outline, so they are not pixel-registered drop-in sprite replacements. Align silhouettes and margins before atlas integration if zero movement between states is required. These assets use the original bronze theme; the nine alternate zone palettes are not included.
