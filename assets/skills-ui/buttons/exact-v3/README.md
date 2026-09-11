# Exact button states

This set supersedes the independently generated states in `themes-v2`.

Nine themes, 12 PNGs per theme (108 total): primary action, secondary action, previous chevron, next chevron; each has idle, hover and clicked states.

Action buttons come from the 264 × 75 atlas cells in the user-provided `families-fixed-v2` folder. Four primary cells overlap a neighboring rail tip (glacial, infernal, runic-arcane and verdant); that foreign fragment is masked away. The visible frame is then normalized into the full 264 × 75 output canvas so every theme is centered and renders at the same apparent width and height.

Hover increases RGB brightness by 35% plus fourteen levels; clicked shades RGB to 42–68% from top to bottom. Alpha is identical across all three states. There is no state-dependent displacement, zoom, stretch or frame change.

Chevrons use one genuinely transparent approved angular artwork per theme; all three states are derived from that base. Celestial uses its prior pressed image and Tempest uses its prior hover image because their idle exports had baked backgrounds. Voidborn uses the transparent Lunar silhouette with blue accents shifted to violet. Previous is an exact horizontal mirror of next. No opaque checkerboards are used.

`preview.html` shows all states with interactive hover/hold comparisons. The extension loads these assets through `SkillsArtService`: primary and secondary action buttons and both chevron directions swap among their exact idle, hover and clicked PNGs for the active zone theme.

Reproduce with `powershell -NoProfile -ExecutionPolicy Bypass -File build-tools/make-exact-button-states.ps1` from the project root. The source path may be overridden with `-SourceFolder`.

The generation script reopens every output PNG and checks equal dimensions and exact alpha equality against its base, exact idle pixel equality, and visible RGB changes for hover/clicked. Results are in `verification.json`.
