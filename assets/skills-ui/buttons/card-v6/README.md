# Skill card button graphics

Graphic action and navigation surfaces for the current V2 card layout, in all
nine zone themes. Each has idle, hover, and clicked artwork. The two original
generated PNG sheets are preserved unchanged; `index.json` records the 54 sprite
windows used by the stylesheet.

Open **preview.html** to compare the themes and try hover, press, keyboard focus,
and a progress demonstration. Its compact toggle approximates the current game
size. The runtime still uses the existing button dimensions and placement.

## Preserved content and behavior

- Curtis's existing action SVGs and the current arrow glyphs are separate from
  the new background artwork. No icon files, labels, or click handlers change.
- Runtime progress uses the game's own percentage-width span and the existing
  measured cadence. The fill remains below the text and icon, clipped inside
  the frame, with a bright leading edge. Completion reset and reduced-motion
  handling stay with the existing V2 controller and stylesheet.
- The preview's repeating three-second progress is a demonstration only.
- Disabled controls retain idle art. Keyboard focus has a visible outline and
  the hover treatment. The action artwork crossfades; arrow artwork switches
  directly without moving the glyph.
- The new styles apply only to themed V2 skill cards and use the existing
  lifecycle-owned stylesheet, including its disable/teardown behavior.

## Source and rebuild

Artwork generated with the built-in **image_gen** tool. The complete prompts
are in `prompts.json`; the navigation sheet used the action sheet as a material
reference. PNGs contain empty plates, with no generated icons or text. Sprite
windows and the navigation silhouette clip exclude the source-sheet gutters.

```text
node build-tools/build-card-buttons.mjs
node build-tools/preview-card-buttons.mjs
npm run build
npm test
```

`tests/card-button-art.test.mjs` covers nine themes, action and arrow states,
fixed control geometry, original native node identity/text, live percentage
preservation, disabled presentation, reduced motion, and responsive containment.
The existing card-system suite checks actual fill visibility, icon and label
placement, progress smoothing/reset, arrow ink centering, and native clicks.
