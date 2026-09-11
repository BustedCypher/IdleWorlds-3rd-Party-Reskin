# Revised button atlases

Nine independent transparent button atlases: **Forged Iron**, **Infernal**,
**Glacial**, **Celestial**, **Lunar Spectral**, **Runic Arcane**,
**Tempest Oceanic**, **Verdant**, and **Voidborn**. Each contains nine sprites: main action,
previous chevron, and next chevron, each in idle, hover, and pressed states.
They are separate from the main Skills UI sprite sheets.

Open `preview.html` for all three states and interactive controls at in-game size.

## Artwork and registration

The first four main buttons use the revised reference images supplied by Curtis.
They were extracted at native source resolution, registered using the frame
rails and jewel axis, and resampled once into their atlas cells. Hover and
pressed surfaces come from the corresponding supplied states, including their
cracks, central symbols, and energized colours.

All states use their idle sprite's exact alpha channel. Outlying state-specific
ornaments are constrained to that silhouette, with the idle metal structure
retained where necessary. This keeps width, height, anchor, and outer contour
constant through interaction. The original JPEG references remain in `sources`.

Main-button hover states have a soft shaded inset behind the text. It reduces
the central glow by 64% and feathers smoothly into the surrounding artwork,
preserving the bright rims, side gems, texture and state effects. This is baked
into the atlas by `shade_hover_text_panel` during rebuilding. Alpha channels,
idle/pressed states and chevron artwork are unaffected.

The matching angled chevrons were generated using the built-in image-generation
tool. The generated checkerboard presentation backgrounds were removed locally;
the atlas files themselves have real RGBA transparency. The left chevrons are
mirrors of the right ones, and all three states share the idle alpha channel.
The generation instructions are recorded in `sources/prompts.md`.

The remaining five complete theme sheets were generated with the built-in image
tool using the approved Celestial button atlas as the layout/quality reference
and each theme's existing UI sheet as material and colour inspiration. Exact
prompts are saved in `sources/remaining-theme-prompts.json`, and the original
generated sheets are retained as `sources/*-atlas.png`. They use the same cell
sizes and exact idle-alpha registration as the original four. Their pressed
effects include a lunar eclipse, residual rune sparks, an ocean vortex, dormant
root veins, and a violet void. The original four approved atlas PNGs were
verified byte-for-byte unchanged when the five additional themes were added.

## Layout

- Atlas: **1110 × 723** pixels, RGBA PNG.
- Rows: idle, hover, clicked (pressed), in that order.
- Columns: previous chevron, main action, next chevron.
- Action cells: **792 × 225** pixels, displayed at 155 × 44 in skill cards.
- Chevron cells: **135 × 225** pixels, displayed at 26 × 44.
- Twelve transparent pixels separate cells and surround the sheet.
- `index.json` contains the source rectangles and cell anchors.
- `registration.json` records each sprite's visible bounds.

`SkillsArtService` supplies complete background definitions for each sprite
window. Idle, hover and pressed artwork occupy fixed layers: hover crossfades
over 180 ms and pressed over 70 ms, keeping the native text above the artwork.
No atlas coordinates animate. Keyboard focus receives the hover treatment,
disabled controls stay idle, and reduced-motion preferences disable the fade. The CSS
retains the native button and its event handlers, suppresses the old arrow
plate/glyph, centers action text, and leaves disabled controls idle.

All nine game themes now use these dedicated atlases. Secondary quest controls share the revised main-button state set;
disabled presentation is still controlled by the existing disabled styles.

## Rebuild and verify

With Python, Pillow and numpy available:

```text
python build-tools/build-revised-buttons.py
node build-tools/preview-revised-buttons.mjs
npm test
```

`tests/revised-button-atlas.test.mjs` checks actual packed alpha channels,
visible state differences, sprite positions in the browser, stable control
geometry, disabled behaviour, and clearing theme styles for the default UI. It loads
all runtime stylesheets and includes renderer-owned inline style declarations.
