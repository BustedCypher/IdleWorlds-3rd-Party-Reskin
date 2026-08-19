# IdleWorlds Fantasy Skin

A forged dark-fantasy UI overhaul for [idleworlds.com](https://idleworlds.com), delivered as a Manifest V3 content script.

The skin is **presentation only**. React keeps ownership of every gameplay node and handler; this extension adds decoration, semantic role attributes and its own overlay elements, and never rewrites the game's own DOM.

---

## Setup

```bash
npm install       # jsdom, for the smoke test
npm run vendor    # downloads sprite atlases + typefaces into assets/
npm run build     # python3 build-tools/build_recovered.py
npm test          # four suites: data services, model, static invariants, smoke
```

Or everything after `npm install`:

```bash
npm run setup
```

The build is the project's own deterministic Python bundler, not esbuild. It is
regex-based, which constrains the source: **only single-line relative imports,
and only `export function` / `export const` / `export let`.** In particular
`export async function` is neither rewritten nor rejected — it passes straight
through into a CommonJS wrapper and throws at load. Use
`export const name = async function name() {}` instead.

Then load the folder in Chrome via `chrome://extensions` → **Load unpacked**.

`npm run vendor` is not optional on a fresh clone — `assets/` is where the sprite
atlases and fonts live now, and the build will warn if they are missing.

## Layout

```
manifest.json          MV3 manifest
build-tools/
  build_recovered.py   deterministic bundler (.css -> text module)
  vendor-assets.mjs    one-shot asset downloader
assets/                sprite atlases + self-hosted woff2  (produced by vendor)
dist/                  build output — do not edit
  content.bundle.js    the bundle
  base.css             copied verbatim; referenced by the manifest
src/
  content.js           entry point: boot order, teardown, kill switch
  modules/
    Runtime.js         chrome.* wrappers, error isolation, scheduling
    DOMWatcher.js      the single MutationObserver + flush budget
    AtlasService.js    dual sprite atlas -> background-position
    ItemDatabase.js    items.json + extension-private cache
    TooltipEngine.js   delegated item cards (element + virtual anchors)
    NameScanner.js     non-destructive item-name annotation
    InventoryRenderer.js
    SkillPanelRenderer.js
    UIFoundation.js    nav / zone bar / section frames
    BackgroundPainter.js
    InventoryModel.js  pure parser for owned-item detail lines
    itemDisplay.js     shared stat/tier presentation
    aliases.js         cloak material alias table (temporary)
    normaliseItemName.js
  styles/
    base.css           theme + @font-face — shipped declaratively, not injected
    inventory.css  skillpanel.css  tooltip-engine.css  ui-system.css
tests/
  data-services.test.mjs    ItemDatabase / AtlasService resilience
  inventory-model.test.mjs  pure parser cases
  static-invariants.test.mjs architecture rules, asserted against source
  smoke.test.mjs            boots the built bundle against a synthetic DOM
```

## Architectural rules

These exist because breaking them has broken the skin before.

1. **One MutationObserver.** `DOMWatcher` owns it. Renderers subscribe to typed
   events and must be safe to run repeatedly on the same element — React reuses
   nodes and mutates them in place.
2. **Never mutate React-owned nodes.** No `replaceChild`, no reparenting, no
   `innerHTML` on a node the game created. React holds direct references to its
   own text nodes; swapping one out causes `NotFoundError` on unmount or silent
   stale text on update. Decoration goes in extension-owned elements, CSS
   highlights, or inline style on nodes we can safely own.
3. **Boot order is load-bearing.** Register every consumer *before*
   `startWatcher()`, so initial discovery cannot emit into a void.
4. **No third-party origins at runtime.** Assets ship in the bundle. Anything
   fetched by the page is subject to the game's CSP, not our permissions.
5. **Extension state goes in `chrome.storage`,** never `localStorage` — a
   content script shares the game's origin storage and its 5 MB quota.
6. **Every consumer is isolated.** Use `guard`/`guardEach` from `Runtime.js`, so
   one malformed element degrades to "that element stays native".

## Kill switch

The whole skin can be disabled at runtime without uninstalling, which is the
only practical way to A/B a suspected skin/game interaction without losing the
page state you are investigating. From the extension's service worker console:

```js
chrome.storage.local.set({ 'iw-skin-enabled': false })   // tear down
chrome.storage.local.set({ 'iw-skin-enabled': true })    // rebuild
```

Teardown removes every overlay, role attribute, injected stylesheet and inline
repaint, and disconnects the observer.

## Testing

`npm test` runs four suites. `static-invariants.test.mjs` asserts the
architectural rules above directly against the source — it is what stops rule 2
from quietly eroding. `smoke.test.mjs` boots the real built bundle in jsdom
against a synthetic IdleWorlds-shaped DOM and asserts:

- boots without throwing
- makes no third-party network requests
- **detaches none of the game's own text nodes**
- renders an inventory row, classifies a skill panel and the main nav
- drains a 121-element mutation burst across frames without dropping work
- restores the native DOM exactly on teardown

It is not a visual test. Visual verification still has to happen against the
live game.
