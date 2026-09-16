# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IdleWorlds Fantasy Skin

A Manifest V3 content script that reskins idleworlds.com. **Presentation only.**
React keeps ownership of every gameplay node, its state and its handlers; this
extension adds decoration, semantic role attributes and its own overlay
elements. It never rewrites the game's DOM.

## Commands

```bash
npm ci            # locked dev deps (jsdom, playwright, esbuild)
npm run vendor    # download pinned sprite atlases + typefaces into assets/
npm run art       # regenerate the shared panel-corner filigree
npm run build     # esbuild -> dist/content.bundle.js (strict; needs assets)
npm test          # rebuild, syntax-check, regression suites, sprite-window audit
npm run fixtures  # responsive visual fixture renders
npm run audit:items   # validates against the live /items.json (not in CI)
npm run import:village-art  # 34 building + 5 housing icons from the art-source repo
npm run import:action-icons -- "<Vector Action button Icons.eps>"  # V2 action-button icons
node claude/audit-mobile.mjs --widths 360,390,430,768  # phone/tablet audit -> tmp/mobile-audit/ (docs/traps/mobile.md)
```

`build-tools/audit-sprite-windows.mjs` (run by `npm test`) checks every pixel
`background-size`/`-position` pair in the stylesheets against
`skills_ui_index.json`: the window must land on a named cell, the scale must be
isotropic, and the box must equal `cell x scale`. It follows `:hover`-style
variants that inherit the base rule's `background-size`, and it FAILS if it
parses zero windows, because a check reporting zero is broken, not passing.

**Tests have no framework.** Each `tests/*.test.mjs` is a standalone Node
script that fails by non-zero exit or a thrown assertion, so run one with
`node tests/<name>.test.mjs`. `npm run test:run` runs every suite
WITHOUT rebuilding; a new suite must be appended to that script by hand or it
never runs in CI. Most suites load `dist/content.bundle.js` rather than `src/`,
so run `npm run build` (or `node build-tools/build.mjs --allow-missing-assets`
without vendored assets) after a `src/` change or the test exercises the old
bundle. About half the suites are real-browser Playwright tests and need
`npx playwright install chromium` once.

`dist/content.bundle.js` is **committed**, and CI fails if it is stale. Rebuild
and commit it with any `src/` change.

Load in Chrome via `chrome://extensions` → Load unpacked → this folder.

## Architecture

- `src/content.js` — activation lifecycle, boot order, teardown, kill switch
- `src/modules/Runtime.js` — `chrome.*` wrappers, `guard`/`guardEach`, `raf`
- `src/modules/DOMWatcher.js` — **the single MutationObserver** + flush budget
- `src/modules/StyleInjector.js` — lifecycle-owned CSS injection; rewrites
  `url('../assets/…')` to `chrome-extension://` at runtime. Use that exact
  form in stylesheets or the asset will 404.
- `src/modules/InlineStyleOwner.js` — reversible property-level inline styles
- `src/modules/ProgressCadence.js` — the measured-tick / completion-reset logic
  that smooths a game-stepped progress fill; shared by the Current Action bar
  and the skill card's action-button fill. Holds no DOM.
- `src/modules/OverlayFramer.js` — generic pop-up / modal chrome. A portalled
  dialog is not a route panel, so `classifySectionFrames` deliberately excludes
  it (`inOverlay`) and this module owns it instead; before it existed, the
  "Players Online" list and every modal the game portals in reached the page
  bare. Runs on
  `iw:dom-flush`, detects from **rendered state** (a `position: fixed` layer that
  covers the viewport, carries a numeric z-index and reads as a backdrop — a
  blur or a translucent dark fill), and its content card (largest visible box,
  preferring the game's `.panel`). Tags `data-iw-overlay="scrim"` / `"panel"` —
  its own namespace, never `data-iw-ui`. `overlay.css` (injected just before
  `ui-system.css`) draws the shared forged frame on the card using ONLY the
  border box — `background` (pinned, not `local`), `box-shadow`, real
  `border-image` — because these cards are their own scroll container and a
  `::before`/`::after` ornament would scroll away with the content. Presentation
  only: nothing inside the card is touched, so `"Upgrade vs equipped"` and the
  like stay the game's (rule 5). Candidate prefilter is `[class*="fixed"]` +
  inline `position:fixed`, confirmed by `getComputedStyle` — a cheap probe, not
  a class-name classifier. `tests/overlay-framer.test.mjs` pins detection, the
  negative controls and teardown.
- `src/modules/QuestPanelRenderer.js` — quest cards are also `.compact-panel`,
  so they arrive on the same `iw:skill-panel` event (as `skill: 'unknown'`).
  This module positively re-identifies them (a `^Reward:` line plus a Turn In /
  Skip control or `% complete`), tags `data-iw-quest-role/-zone/-state`, appends
  a `.fs-quest-sigil` medallion, and reuses the Skills UI atlas. Its CSS lives
  at the end of `skillpanel.css` (no new sheet — the smoke test pins the count
  at 7). `DOMWatcher.detectSkillType` returns `'unknown'` early for quest
  shapes so a `"<Discipline> Work Order"` label can't trip skill identity.
  The objective item ("💠 Night Claw 22/100" → "Night Claw") drives two things:
  its `AtlasService` sprite is painted into the medallion (`.fs-quest-sigil-icon`,
  discipline glyph is the fallback), and — when the name resolves in
  `ItemDatabase` — the objective `<p>` gets `data-iw-tooltip-trigger="1"` +
  `data-iw-item*` (attributes only, no wrapper) so `TooltipEngine` shows the
  item card on hover. `NameScanner` skips `[data-iw-tooltip-trigger]` so it
  can't stack a second prose highlight on the same line.
- `src/modules/VillagePanels.js` — the Village route's two illustrated panels.
  `UIFoundation.classifyVillagePanels` resolves them from their headings
  ("Village" for the Housing hero, "Village Add-ons" for the slot stack, both
  with the leading icon run stripped) and hands each to `decorateVillagePanel`
  every `iw:dom-flush`; roles live in their own `data-iw-village*` namespace
  because every card here is the game's shared `.compact-panel` and so also
  reaches `SkillPanelRenderer` as `skill: 'unknown'`. The art is the game's own
  hand-painted isometric Construction/housing icons, imported by
  `build-tools/import-village-art.mjs` into `assets/village/building_<tier>.webp`
  / `house_<tier>.webp` plus the generated `src/modules/villageBuildings.js`
  (DO NOT hand-edit; `tests/village-panels.test.mjs` pins it against
  `assets/village/buildings.json` and checks every file exists). CSS lives at
  the end of `ui-system.css`, and the controls opt out of the generic control
  rule through its `:not([data-iw-village-role])` link.
- `src/modules/VillageScene.js` — the skin's own **Village** frame on the
  dashboard, below Skill Actions: the Construction planner's five-plot
  composition (a house in the middle, four corner plots and one bottom-centre)
  drawn from the game's own building art. It is the only surface here that
  reads the game's API, because the village simply is not in the dashboard's
  DOM — see [docs/traps/village.md](docs/traps/village.md). Anchored by `findAnchor()` to the `.panel` holding
  the `<h2>Skill Actions</h2>` and inserted with `target.after(frame)`, so
  nothing is reparented (rule 2) and the panel that followed Actions still
  follows the scene. Every node inside is the extension's own and is marked
  `data-iw-village-scene-owned` — its OWN namespace, deliberately not
  VillagePanels' `data-iw-village-owned`; see the collision note in
  [docs/traps/village.md](docs/traps/village.md).
  `src/styles/village-scene.css` is concatenated into the `ui-system` injection
  (no new sheet — the smoke test pins the count at 7).
- `src/modules/VillageLedger.js` — the **ledger** beside that scene: the home
  and every installed building as a collapsible heading over its benefits, then
  an **Overall stats** block that sums the INSTALLED BUILDINGS ONLY. The scene
  knows identity (tier, slot, `itemKey`, name); the numbers come from
  items.json, because every add-on is an item
  (`construction_building_tier_<N>`) — so the join is
  `ItemDatabase.find({ id })` on the key the snapshot already carries and the
  derivation is the shared `deriveDisplayStats()`. Housing is NOT an item, so
  the home shows its slot count plus whatever the Village route printed on its
  tier line ("Base actions take 6s"), captured verbatim by
  `VillageScene.readHousingPerks` — and nothing else, rather than a guess.
  It builds no DOM of its own name: `own()` is passed in by VillageScene, so
  every node is `data-iw-village-scene-owned` and that module's teardown
  reaches it. Two levels of disclosure share one mechanism (`wire()`): each
  entry, and the whole **Buildings** list, which folds to leave the heading,
  Overall stats and the plot scene standing — so `.iw-vs-totals` is a sibling
  of `.iw-vs-ledger-list`, not a child of it. Both use the module's own
  `data-iw-vs-toggle` / `data-iw-vs-open` namespace so CollapsibleFrames'
  document-wide `[data-iw-collapse]` sweep can never adopt them, and choices
  persist in `iw-village-ledger`. Scene and ledger wrap rather than squeeze —
  see [docs/traps/village.md](docs/traps/village.md).
- `src/modules/CollapsibleFrames.js` — per-panel collapse on every parent
  frame (Skills, Inventory, Quests, Village, World Bosses, Current Action,
  Action Log, World Chat, Zone Control and the Village scene). The World Boss
  "Possible Rewards" disclosure is a `<details>` because those nodes are the
  skin's own; a route panel's contents are React's, so wrapping them would
  reparent game nodes (rule 2). Here the skin instead APPENDS a small chevron
  button into the panel's heading row and writes `data-iw-collapsed="1"` on the
  card, and `src/styles/collapsible.css` (concatenated onto the `ui-system`
  injection) hides `> *` except the heading row and the control. Choices persist
  in one `chrome.storage` key, `iw-collapsed-frames`. See
  [docs/traps/collapsible-frames.md](docs/traps/collapsible-frames.md).
- `src/modules/HeaderChrome.js` — merges the nav rail, the announcement and
  the zone bar into ONE framed box (see [docs/traps/header-chrome.md](docs/traps/header-chrome.md)).
  Its own `data-iw-chrome` namespace; runs in `queueClassify` right after
  section frames.
- The **Toolkit link** is the skin's own `<a>` (`UIFoundation.ensureToolkitLink`),
  appended to the nav rail and hidden by CSS below 768px (Curtis, 2026-09-16:
  the phone bar read as too crowded); see [docs/traps/mobile.md](docs/traps/mobile.md).
- The **Rearrange feature (PanelOrder) was removed on 2026-09-15.** Its
  `:not([data-iw-order-handle])` exclusions are deliberately LEFT in the
  `base.css` and `ui-system.css` selector chains: each `:not()` carries
  specificity other rules may be tuned against. They match nothing now.
  [docs/traps/panel-order.md](docs/traps/panel-order.md) is kept for its lessons.
- `src/styles/*.css` — injected in the order `content.js` boots them.
  **`ui-system.css` is injected LAST.**

## Non-negotiable rules

1. **Presentation only.** Never change what a control does.
2. **No reparenting.** Decorative elements may be *appended* (see
   `HeaderRenderer.ensureCrest`, `InventoryRenderer.ensureInventoryRule`), never
   moved. Never `removeAttribute('style')` on a game node — strip only the
   properties the skin wrote.
3. **Reversible.** Every attribute and element the skin adds must be removed by
   its `clear*()` teardown. Kill-switch round-trip is covered by the smoke test.
4. **One MutationObserver**, in `DOMWatcher`, budgeted.
5. **Never destroy state information.** If the game paints something to mean
   something — an active tab, an equipped item, a red/green stat — repainting it
   uniformly deletes that meaning. That is a functionality regression in effect,
   even though it is "only CSS".

## Rules the traps taught

Each rule below has been broken at least once. The linked file has the
measurement, the failure it caused and the negative control. **Read the
matching file before changing that surface**, and add new write-ups there, not
here. Add a line to this list only when a lesson applies across surfaces.

**Cascade**

- `ui-system.css` is injected LAST, and its generic `button:not(…)` rule is
  (0,4,1) `!important`. Do not escalate specificity: add your hook to that
  rule's `:not()` chain (and to the matching `base.css` chains).
  [classification](docs/traps/classification.md)
- Inline `!important` written by `SkillPanelRenderer.styleButton()` or
  `AtlasService` beats every stylesheet. To make such a value steerable, write
  it inline as `var(--token, fallback)`.
  [sprites-and-buttons](docs/traps/sprites-and-buttons.md)
- When you repurpose a pseudo-element another rule already draws on, reset its
  whole box, **including `transform`**. A pseudo-element's painted position
  is not observable from `getComputedStyle`.
  [skill-card-v2](docs/traps/skill-card-v2.md)
- Atlas sprites use percentage `background-size`/`-position`. Never override
  them with px, and keep the box at the art's aspect ratio.
  [sprites-and-buttons](docs/traps/sprites-and-buttons.md)
- Two items the skin places in ONE grid cell paint in DOM order, so the later
  one swallows the earlier one's clicks even across padding that looks empty —
  and a breakpoint that unstacks them turns that into "works on mobile, dead on
  desktop". Make the passive one `pointer-events: none` (children `auto`) and
  lift the interactive one. A grid item honours `z-index` while still
  `position: static`. [classification](docs/traps/classification.md)

**Mutation cost** ([performance](docs/traps/performance.md))

- DOMWatcher's `attributeFilter` has eight entries: `class`, `style`,
  `disabled`, `aria-disabled`, `aria-pressed`, `aria-selected`,
  `aria-current`, `data-state`. A `data-iw-*` write is invisible to it, and so
  is a same-value `style.setProperty`. A same-value `classList`,
  `setAttribute` on a watched attribute, or `textContent` write still emits a
  record, so compare before writing.
- Never put a shorthand and its own longhand in one inline-style map. The page
  flushes itself forever, and the end state still looks correct.
- A change carried only by `data-iw-*` or by `<html>` (outside the observer's
  root) triggers no flush, so the code that makes it must run the pass itself.
- A cached classifier with an EMPTY resolution never re-runs, because
  `[].every()` is true; validate coverage too. A cache key must not include
  live content, such as ticking digits, that the cached work does not depend on.
- Nor button `disabled` state: the game disables every button during any
  request, and a strip-then-rederive pass that reads layout makes Chrome's
  scroll anchoring jump the window.

**Ownership**

- Two modules must never write the same attribute on one node.
  `.compact-panel` is shared by skill, quest, boss, village and shop cards, so
  each role gets its own `data-iw-<module>` namespace, and a `clear*()`
  touches only its own marker. [classification](docs/traps/classification.md),
  [village](docs/traps/village.md)
- An element the skin APPENDS into a game node must be excluded from every
  classifier sweep that reads that node (`:not([data-iw-…])` or a `closest()`
  guard), and so must skin-owned text that repeats game copy.
  [collapsible-frames](docs/traps/collapsible-frames.md),
  [panel-order](docs/traps/panel-order.md) (retired feature),
  [skill-card-v2](docs/traps/skill-card-v2.md)

**Detecting the live page** ([classification](docs/traps/classification.md))

- The page ships a hidden duplicate column, and which copy is hidden swaps at
  1280px. Resolve the live copy with `Viewport.js` rendered-state helpers,
  never with a class name. A breakpoint crossing mutates nothing, so
  column-dependent caches must check `getLayoutEpoch()`.
- The live app has almost no stable hooks (`#current-action-panel`, `.panel`,
  `data-skin`), so misses are structural. Frames key on `.panel`, not on
  heading copy ([panel-frames](docs/traps/panel-frames.md)). Strip a leading
  emoji run before any anchored label regex
  ([header-chrome](docs/traps/header-chrome.md)).
- Met/unmet, equipped, team colour and the active tab are game STATE (rule 5).
  Read them from the game's own classes; never repaint them uniformly.
- `textContent` joins descendants with NO separator — no newline, no space — so
  sibling elements read as one unbroken string. Never slice a flattened blob on
  `\n`, and never assume the game's own separator (its material lines use an
  emoji per item, not `•`). Anchor on the previous match and on the element
  boundary, which are always there
  ([skill-card-v2](docs/traps/skill-card-v2.md)).

**Tests** ([test-harness](docs/traps/test-harness.md))

- A fixture lies when it models the wrong DOM shape or column width, omits the
  host's Tailwind preflight, omits a stylesheet, or cannot load its assets
  (`setContent` blocks `file://`). A cost bug has a correct end state, so only
  a cost check can see it, and only if the fixture carries the shape.

## Where the detail lives

| File | Covers |
| --- | --- |
| [performance.md](docs/traps/performance.md) | self-driving flush loops, measured write costs, the scroll stall decision, classifier caching |
| [classification.md](docs/traps/classification.md) | `ui-system.css` precedence, two writers on one node, hidden duplicate column, stable hooks, coverage map, adding a new skill |
| [panel-frames.md](docs/traps/panel-frames.md) | `.panel` section frames, nesting, heading size token, Daily XP Boost |
| [collapsible-frames.md](docs/traps/collapsible-frames.md) | collapse toggle placement, one-bar collapsed state, filigree hand-over |
| [panel-order.md](docs/traps/panel-order.md) | RETIRED Rearrange feature, kept for its lessons (write costs, drag, exclusions) |
| [skill-card-v2.md](docs/traps/skill-card-v2.md) | the skill card: current design first, retired designs last |
| [village.md](docs/traps/village.md) | `/api/player` read, scene layout, sprite paint order |
| [current-action-progress.md](docs/traps/current-action-progress.md) | progress-bar transition and tick measurement |
| [sprites-and-buttons.md](docs/traps/sprites-and-buttons.md) | atlas windows, aspect ratio, three-slice labels, plates, optical centring |
| [zone-theming.md](docs/traps/zone-theming.md) | per-zone header art, palettes, `--iw-th-*` tokens |
| [header-chrome.md](docs/traps/header-chrome.md) | glass plates, nav rail, Toolkit link, merged header frame |
| [inventory.md](docs/traps/inventory.md) | list frame, tool row, row colour, upgrade-roll line |
| [test-harness.md](docs/traps/test-harness.md) | fixture and render-harness traps |
| [mobile.md](docs/traps/mobile.md) | the mobile audit harness, single-row menus, the phone Toolkit slot, phone-width fixes |

Bundle size is a **soft budget of 300,000 bytes**, not a hard gate: both
`build-tools/build.mjs` and `static-invariants` only `console.warn` past it —
builds and CI never fail on size. The committed bundle is deliberately
un-minified for readability. `build-tools/build.mjs` still strips CSS comments
when inlining sheets, so comments stay free in source; keep watching the warning
so growth stays deliberate.

## Verification discipline

This project has repeatedly shipped confidently wrong CSS. The rules that
stopped it:

- **A fixture that omits a stylesheet will lie to you.** Load *all* sheets, in
  injection order, with `ui-system.css` last. Most false "it works" results came
  from a fixture that did not include it.
- **A check reporting zero is broken, not passing.** A plain `CSSStyleRule`
  exposes a truthy-but-*empty* `.cssRules`, so recursing on truthiness silently
  discards every non-`@font-face` rule and the harness reports "0 → 0,
  identical". Recurse only on real grouping rules.
- **Every check needs a negative control.** Break it on purpose and confirm it
  fails. Several "passing" checks here were incapable of failing:
  a `prefers-reduced-motion` test that compared two screenshots of a resting
  page; a webfont check that passed for a font with no Latin glyphs.
- **`performance.now()` clamps at 0.1 ms.** Batch and divide, or the number is
  noise. A ratio computed against ~0 is meaningless.
- **Say which kind of verification you did.** "Built and fixture-rendered" is
  not "live-verified". No session can verify live; only the user can.

`claude/capture-inventory.js` is a read-only DevTools snippet that dumps the
live DOM's computed styles to a JSON file. When a CSS change does not behave as
expected live, ask for a capture rather than guessing — three separate
"mysteries" here turned out to be the live DOM, not the CSS.
