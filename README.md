# IdleWorlds Fantasy Skin

A forged dark-fantasy UI overhaul for [idleworlds.com](https://idleworlds.com), delivered as a Manifest V3 content script.

The skin is **presentation only**. React keeps ownership of every gameplay node and handler; this extension adds decoration, semantic role attributes and its own overlay elements, and never rewrites the game's own DOM.

---

## Setup

```bash
npm ci            # install locked jsdom / Playwright development dependencies
npm run vendor    # downloads pinned sprite atlases + typefaces into assets/
npm run build     # strict production build; requires vendored assets
npm test          # rebuilds, syntax-checks, and runs the registered regression suites
```

Or perform the strict fresh-clone sequence after `npm ci`:

```bash
npm run setup
```

`npm test` deliberately rebuilds `dist/content.bundle.js` before the smoke test so tests cannot accidentally validate an older committed bundle. Its rebuild allows missing binary assets because the jsdom regression suites do not render the real PNGs. `npm run setup` remains the strict path: it vendors the real assets first, performs the normal build, then runs the suites.

The production bundle is built with `esbuild` from the standard ESM source graph. CSS imports use esbuild's text loader so every stylesheet remains lifecycle-owned and removable. The output is a single unminified UTF-8 IIFE targeting Chrome 109+ with no source map.

Then load the folder in Chrome via `chrome://extensions` → **Load unpacked**.

## Select a theme

After updating, reload the extension in `chrome://extensions`. Click the extension icon or open its **Options** page, then choose **Legacy** or **Fantasy** in **Active game theme**. Refresh existing game tabs once so they load the updated extension and saved choice. Match this choice to the theme selected in the game's own settings.

Legacy keeps the current reskin and all its existing preferences. Fantasy layers independent presentation onto the game's Fantasy theme, including a bottom thumb dock on mobile and a compact desktop navigation strip. Game, Market, Village and Guild stay within easy reach; More contains Dungeon, the remaining routes and available native utilities. The Brass rail navigation and More menu follow the active theme palette. The centred zone header uses the shared Fantasy frame: edge arrows travel between zones, and clicking its centre opens the zone list. Daily information sits below the skill tiles. The selection is saved in extension-private storage and updates every open game tab automatically. Existing installs default to Legacy. The existing enable/disable switch still controls both profiles.

## Develop the Fantasy reskin

Start in `src/skins/fantasy/index.js`. Add Fantasy modules and CSS inside that compartment, reconcile them through its existing budgeted watcher, and reverse every change in `stop()`. Navigation lives in `chrome/ThumbDock.js`; its owned shadow roots preserve the game's original controls and isolate the dock from native button styling. Each skin must own its runtime guards and removable presentation; do not import Legacy modules or styles into Fantasy.

All existing presentation code is under `src/skins/legacy/`. The neutral bootstrap, settings, and controller live outside both skins. The Legacy assets remain available in `assets/`; sharing an asset does not automatically activate its rules. Theme boundaries, startup races, teardown, and settings persistence are covered by the regression suite.

`npm run vendor` is not optional on a fresh clone before loading the extension. The large sprite atlases are deliberately not stored in this repository; vendoring downloads the immutable sprite revision selected in `build-tools/vendor-assets.mjs`. The current pin includes the shared `+4` gear overlay.

## Layout

```text
manifest.json          MV3 manifest
.github/workflows/
  ci.yml                read-only rebuild/test validation for PRs + main pushes
build-tools/
  build.mjs                 esbuild production bundler + asset validation
  vendor-assets.mjs       pinned atlas + typeface downloader / verifier
  render-fixtures.mjs     responsive visual fixture renderer
  audit-items-contract.mjs live items.json schema/contract audit
assets/                vendored atlas metadata + fonts; large PNGs produced by vendor
dist/                  build output — do not edit
  content.bundle.js    production content bundle
src/
  content.js           neutral profile selection and startup
  shared/
    ExtensionSettings.js persisted selection, validation and storage events
    SkinController.js    exclusive start/stop lifecycle and pending-start cancellation
    HydrationGate.js     shared React hydration safety
  options/             settings page and toolbar popup
  page/                neutral MAIN-world hydration signal
  skins/
    legacy/
      index.js         existing reskin lifecycle
      modules/         all existing Legacy renderers, services and runtime guards
      styles/          all existing Legacy CSS, including base.css
    fantasy/
      index.js         empty start/stop lifecycle for the new reskin
      styles/custom.css empty Fantasy rule file, not yet injected
tests/
  data-services.test.mjs    ItemDatabase / AtlasService resilience
  inventory-model.test.mjs  pure owned-item parser cases
  item-display.test.mjs     enhanced/current item stat presentation contracts
  static-invariants.test.mjs architecture rules, asserted against source
  smoke.test.mjs            real built bundle against a synthetic live-like DOM
```

## Architectural rules

These exist because breaking them has broken the skin before.

1. **One MutationObserver.** `DOMWatcher` owns it. Renderers subscribe to typed events and must be safe to run repeatedly on the same element — React reuses nodes and mutates them in place.
2. **Never replace React-owned gameplay nodes.** No `replaceChild`, no reparenting, no `innerHTML` on a node the game created. React holds direct references to its own text nodes; swapping one out causes `NotFoundError` on unmount or silent stale text on update. Decoration goes in extension-owned elements, CSS highlights, semantic attributes, or controlled presentation properties.
3. **Boot order is load-bearing.** Page-lifetime consumers are registered before `startWatcher()`, so initial discovery cannot emit into a void.
4. **Consumer bindings are page-lifetime; presentation is activation-lifetime.** Disable/re-enable must not register another copy of document/window listeners. Styles, overlays, classifications and the central observer are the things that stop/start.
5. **All presentation CSS is lifecycle-owned.** `base.css` is bundled as text and injected through `StyleInjector`; it is not manifest-declared. This is what lets the kill switch remove the complete theme rather than leaving global `!important` rules active.
6. **Inline styling must be reversible at property level.** Never remove a React node's entire `style` attribute. `InlineStyleOwner` restores only properties the skin actually owns and preserves later native changes when possible.
7. **No third-party origins at runtime.** Atlases and typefaces resolve from the extension bundle. Anything fetched by the page is subject to the game's CSP, not our permissions.
8. **Extension state goes in `chrome.storage`, never `localStorage`.** A content script shares the game's origin storage/quota.
9. **Every reconciler is isolated.** Use `guard`/`guardEach` from `Runtime.js`, so one malformed element degrades to “that element stays native”.
10. **Cache keys must represent semantic content, not just geometry/length.** Equal-length changes such as `x1 → x2` and `Mine → Fish` are real state changes and are covered by the smoke test.

## Kill switch

The skin can be disabled and re-enabled on the current page without uninstalling it. This is intended for A/B debugging against the same live IdleWorlds state.

There is **no background service worker** in this extension. To change the key manually, open DevTools on the IdleWorlds page, select the **IdleWorlds Fantasy Skin content-script execution context** in the Console context selector, then run:

```js
chrome.storage.local.set({ 'iw-skin-enabled': false })   // full teardown
chrome.storage.local.set({ 'iw-skin-enabled': true })    // rebuild presentation
```

Teardown disconnects the central observer, removes Inventory overlays and semantic role attributes, clears item-name highlights/tooltips, restores skin-owned inline properties to their native underlay, and removes **all** injected stylesheets including the global base theme. Page-lifetime event listeners remain bound exactly once but are inert while the runtime is disabled; the storage listener must remain available so it can receive the re-enable command.

## Testing

`npm test` first rebuilds the production bundle with `--allow-missing-assets`, runs `node --check` on that generated bundle, then executes the registered regression suites. This ordering is intentional: the smoke test must never execute stale `dist` output.

`static-invariants.test.mjs` asserts architecture directly against the source. `smoke.test.mjs` boots the **real rebuilt bundle** in jsdom against a synthetic IdleWorlds-shaped DOM and checks, among other things:

- bundle boot succeeds without third-party runtime requests
- none of the game's original Text nodes are detached
- Inventory, skill and navigation presentation mounts
- a 122-row mutation burst drains across frames without dropping work
- equal-length Inventory (`x1 → x2`) changes reconcile
- equal-length skill action (`Mine → Fish`) changes invalidate the skill cache
- native inline skill/background styles survive teardown exactly
- all five runtime stylesheets disappear on disable
- disable → re-enable restores presentation without duplicating tooltip/storage surfaces
- a second disable is just as clean as the first

`npm run fixtures` renders the visual harness and audits responsive Inventory/Skill behavior at 320, 360, 390, 430, 600 and 768px, plus short-viewport tooltip scrolling. `npm run audit:items` fetches the current public `/items.json` and validates the live item-data contract; it is intentionally manual rather than a CI gate because it depends on a live external endpoint.

CI runs `npm test` for pull requests and pushes to `main`, then fails if rebuilding changes the committed production bundle. CI never writes back to the repository.

The synthetic smoke test is not a substitute for live IdleWorlds verification. Any change that depends on real React/Tailwind structure still needs to be checked in Chrome against the current game DOM before the draft PR is considered ready to merge.
