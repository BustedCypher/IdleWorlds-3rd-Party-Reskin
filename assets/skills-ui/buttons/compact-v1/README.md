# Compact themed controls

Nine separate transparent PNG atlases, independent of both the main UI sheet and
the revised-v5 action/chevron atlas. Open `preview.html` to try every theme.

Each 672 × 392 atlas contains six sprites: a text plate and a square icon plate,
each with idle, hover and clicked artwork. All states share the idle alpha mask
pixel for pixel. The centre stays dark; glow and material changes sit in the rim.
The original generated sheets and exact prompts are retained in `sources/`.

`index.json` defines every sprite rectangle. Text sprites are 528 × 120; square
sprites are 120 × 120. Text rendering uses 40-pixel left/right source caps and a
stretchable middle, so long labels do not stretch the corners. Padding separates
all atlas cells. Runtime controls keep their original width, height, text, SVGs,
handlers and selected/disabled semantics.

Covered controls: main navigation and Toolkit; inventory filters and paging;
item actions including Equip, Equipped, Use, List, Set Bonus and lock; paired
I/II loadout switches; Send; zone navigation and Change Zone with its timer.
The existing inventory header icon tools retain their previous artwork.

`CompactButtons.js` adds three aria-hidden, pointer-transparent artwork layers.
Hover/focus blends over 180 ms; press blends over 70 ms. Only opacity animates.
Native selected-nav underlines and the Toolkit arrow remain intact. Filters,
loadouts and equipped controls retain visible selection accents. Disabled
controls show only idle art; reduced-motion preferences disable the fades.
The shared DOMWatcher handles reconciliation; no new observer or timer is used.
Teardown removes all added layers and attributes.

The activation path in `content.js` and standalone UI initialization both call
`injectUIFoundationStyles()`. This installs the combined UI/compact stylesheet
as one of the existing seven sheets. Do not inject the base UI stylesheet first:
StyleInjector ignores later calls for an already installed id. The actual-bundle
browser test covers startup, visible state artwork and disable/re-enable.

Rebuild assets with `build-tools/build-compact-buttons.py` (Pillow and numpy),
then run `node build-tools/preview-compact-buttons.mjs` to regenerate sprite
geometry in the stylesheet and the interactive preview. Run `npm test` to
rebuild the extension and verify the full project. The dedicated browser check
also validates matching silhouettes, dark centres, native control bounds,
all state images, click propagation, reduced motion and teardown.
