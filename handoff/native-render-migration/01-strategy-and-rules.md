# 1. Strategy and rules

This chapter says **what** to build and **what is forbidden**. Every later chapter is the detail for one surface.

## 1.1 What changes, in one paragraph

Today the game renders its stock UI. Then the Fantasy Skin extension:

1. waits for React to hydrate;
2. watches every DOM mutation with one `MutationObserver`;
3. guesses what each node is from its structure and English copy;
4. writes role attributes, inline styles and extra nodes onto it;
5. keeps re-checking those guesses on every tick, forever.

The native render makes the **game's own components output the finished, skinned markup in the same render pass**. A component already knows what it is:

- the Mining card receives `skill="mining"` as a prop;
- the nav knows which route is active;
- the Village scene already has the village in the store.

Nothing is classified, observed or re-derived.

## 1.2 Why this is the right target (measured, not estimated)

The skin's own performance record ([docs/traps/performance.md](../../docs/traps/performance.md)) comes from a ~15,000-node page shaped like the live game, with a simulated game ticking it:

| Window | Skin before optimisation | Skin after every optimisation | Same page, no skin |
| --- | --- | --- | --- |
| boot, 6 s | 12,858 ms main thread | 3,480 ms | — |
| ticking, 10 s | 8,810 ms | 4,300 ms | **~105 ms** |
| pointer moving, 5 s | 5,072 ms | 2,975 ms | — |

The gap between "optimised overlay" and "no skin" is structural. It is the cost of being a second pass that cannot see the source:

- Most of the remaining skin JavaScript answers "did anything I care about change?" and "which node is which?":
  - classifier caches;
  - `isConnected` / layout-epoch checks;
  - structure signatures with the digits blanked out;
  - hidden-duplicate-column resolution.
- A component answers both questions for free.
- What remains after the port is:
  - CSS selector matching (~146 ms per 4 s, measured);
  - the design's own continuous motion (shimmer loops and `width` transitions).

  Both are identical with or without the overlay, so they are out of scope here.

## 1.3 The plan: two stages, and Stage A is not optional

### Stage A — parity by construction (do this first, for every surface)

1. Ship the theme's CSS **byte-identical**:
   - use the seven files in [`generated/theme-css/`](generated/theme-css/);
   - keep the order;
   - load them after every stylesheet the game ships.
2. Make each component emit the exact **DOM contract** the extension produces on that surface today:
   - the same attributes with the same values;
   - the same classes;
   - the same inline style properties, with `!important` where the extension uses it;
   - the same appended elements, in the same positions.

   The contract comes from three places:
   - the chapters (the rules);
   - [`generated/golden/`](generated/golden/) (exact before/after markup);
   - [`tools/capture-skin-contract.js`](tools/capture-skin-contract.js) (the contract for **your** live DOM, node by node).
3. Keep the game's own markup exactly as it is. The CSS also keys on the game's own classes and structure:
   - `.panel`, `.compact-panel`, `.compact-row`;
   - `[class*="hover:underline"]`;
   - child combinators (see [`generated/css-structure-contract.md`](generated/css-structure-contract.md)).
4. Prove parity with [`tools/capture-parity.js`](tools/capture-parity.js) + [`tools/diff-parity.mjs`](tools/diff-parity.mjs):
   - the reference is the live game with the extension on;
   - the candidate is your native build with the extension off;
   - it must report **no differences**.

**This works, and it has been checked.** [`tools/selftest.mjs`](tools/selftest.mjs) does four things:

1. runs the real extension over a live-shaped page;
2. freezes the result as static HTML (marks, inline styles and appended nodes included);
3. reloads that HTML with **no extension** and only the seven exported stylesheets;
4. compares the computed style of every skinned element, including its `::before`/`::after`.

Result on 145 elements: **no differences.**

The same test then deletes only the `data-iw-chrome` marks, which is the phase-1 regression. That produces **123 differences**, among them:

- the nav rail becomes a standalone 1364×46 box instead of a 1025×32 row inside the merged frame;
- the header loses its `grid-row: 1` placement and 12 px bottom margin.

Stage A is therefore mechanical, and it is verifiable.

### Stage B — optional clean-up, only behind a zero diff

Once a surface renders natively and diffs clean, you may refactor it:

- replace attribute selectors with component classes or CSS modules;
- drop `!important` using cascade layers;
- replace `display: contents` with real nesting (see chapter 4 §4.9);
- split sprite atlases.

**Every Stage B change must keep `diff-parity.mjs` at zero on the same captures.** A Stage B change that makes the diff non-empty is a regression, however much cleaner the code is.

Stage B is not required for the performance win. Stage A already removes every observer, classifier and cache.

## 1.4 Where each piece of the extension goes

| Extension module | Native fate | Why |
| --- | --- | --- |
| `DOMWatcher.js` (the MutationObserver, flush budget, events) | **Delete** | React re-renders what changed |
| `HydrationGate.js`, `page/hydration-signal.js` | **Delete** | Components render inside React's lifecycle |
| `Viewport.js` (hidden duplicate column, layout epoch) | **Delete** | Each copy of a panel is its own component instance. Render the marks on both copies (chapter 3 §3.9) |
| `UIFoundation.js` classifiers (nav, zone bar, section frames, activity panels, boss, market, village, daily boost) | **Replace with props** | The component knows its own role |
| `HeaderRenderer.js` classification | **Replace with props** | Same |
| `HeaderRenderer.js` zone art / zone theme | **Port the rule** (chapter 3 §3.5, chapter 4) | Reads the zone number from game state instead of the `Zone N:` label |
| `HeaderChrome.js` | **Replace with props** (chapter 4) | The shell component knows its children |
| `SkillPanelRenderer.js` + `SkillCardDesignController.js` | **Replace with props + port the output** (chapter 6) | Skill type, roles and values are props; appended nodes become JSX |
| `QuestPanelRenderer.js` | **Replace with props + port the output** (chapter 7) | Same |
| `InventoryRenderer.js` | **Replace with props + port the output** (chapter 8) | Same |
| `InventoryModel.js`, `itemDisplay.js`, `ProgressCadence.js`, `zoneThemes.js`, `villageBuildings.js`, `aliases.js`, `normaliseItemName.js`, `AtlasService.resolve()` / `_applySprite()` / `_paintBadge()` | **Copy verbatim** | Pure functions; the output must be identical, so the code should be too |
| `WorldBossPanels.js` | **Replace with props + port the output** (chapter 9) | Same |
| `VillagePanels.js`, `VillageScene.js`, `VillageLedger.js` | **Replace with props + port the output** (chapter 10) | The village is already in the store; the `/api/player` poll and its league-header workaround disappear |
| `OverlayFramer.js` | **Replace with props** (chapter 5) | Your modal component knows it is a modal |
| `CollapsibleFrames.js` | **Port as component state** (chapter 5) | Same markup; state in your settings store |
| `CompactButtons.js` | **Port the output** (chapter 12) | Three `<span>` layers inside specific controls |
| `BackgroundPainter.js` | **Port the rule** (chapter 3 §3.7) | A fixed colour map on specific surfaces |
| `SkillsArtService.js` | **Use the precomputed values** ([`generated/theme-constants.json`](generated/theme-constants.json)) | The values never change at runtime |
| `StyleInjector.js`, `InlineStyleOwner.js`, `Runtime.js` | **Delete** (replaced by chapter 3 §3.2 and §3.8) | They exist to inject and undo at runtime |
| `ItemDatabase.js` | **Replace with your item data** | The game owns the catalogue |
| `TooltipEngine.js`, `NameScanner.js` | **Out of scope here**: the tooltip engine is a separate workstream | See §1.6 |

## 1.5 The non-negotiable rules

Each of these has already been broken once, either by the extension's own history or by phase 1.

1. **The CSS is the export, unmodified.**
   - Do not edit, re-minify, merge in a different order, split, or "tidy" [`generated/theme-css/*.css`](generated/theme-css/).
   - Link the seven files in order, **after** every game stylesheet (chapter 3 §3.2).
   - To change the look, change `src/styles/` in the skin repository and re-export. That is the only path that keeps the extension, the fixtures and the game in step.
2. **Every mark is emitted exactly.** For every attribute and class, emit:
   - the same name;
   - the same value, including case (`data-iw-state="active"`, not `"Active"`);
   - on the same element.

   Rename nothing. Merge no namespaces. Two namespaces on one node are deliberate: the zone bar carries `data-iw-ui="zone-bar"`, `data-iw-header="zone-shell"` **and** `data-iw-chrome="zone-bar"`, because three different rule sets key on them.
3. **Structure is part of the contract.** Every child/sibling/positional relationship in [`generated/css-structure-contract.md`](generated/css-structure-contract.md) must hold:
   - no new wrapper element between a node and the parent the CSS names;
   - no reordering of siblings the CSS indexes;
   - no extra element among children the CSS counts.

   The merged header broke exactly this way (chapter 4 §4.2).
4. **Inline styles stay inline, with the same priority.** Where the extension writes a property inline with `!important`, the native render must do the same:
   - an inline `!important` declaration outranks every stylesheet rule;
   - a stylesheet cannot reproduce that precedence against the theme's own `!important` rules.

   React's `style` prop cannot express `!important`, so use the helper in chapter 3 §3.8. Custom properties (`--iw-*`, `--fs-*`) are written without priority and work through the normal `style` prop.
5. **Appended nodes are rendered by the component, in the same place.** Every node the extension appends becomes JSX in the same position, with the same tag, classes, attributes and `aria-hidden`. Positions include:
   - the header crest is the **first** child of the identity region;
   - the collapse toggle is the **last** child of the heading row.
6. **Game state stays game state** (the skin's rule 5). Drive these from the same data that drives the stock UI today:
   - met/unmet requirement colour;
   - the active tab;
   - an equipped item;
   - a disabled control;
   - team colour;
   - the announcement's own colour.

   Never hardcode them into the themed markup. Each chapter names the exact state source for every such mark.
7. **Controls do exactly what they did.** The theme changes presentation only. The same element keeps the same handler; the extension never wrapped or replaced a game control, and the native render must not either.
8. **"It looks right" is not acceptance.** Acceptance is `diff-parity.mjs` exiting 0 on paired captures (chapter 13), at the widths in chapter 13 §13.4.
9. **The extension must not run on a natively skinned page.** It would re-classify and re-decorate nodes React now owns, and its kill switch would delete React-rendered nodes such as the crest and the Toolkit link. Two steps:
   - render `<html data-iw-native-skin="1">` whenever the native theme is on;
   - coordinate with Curtis so the extension stands down when it sees that attribute.

   Until that extension update ships, test the native build with the extension disabled.
10. **When the native render and the extension disagree, the extension is right** until Curtis says otherwise. The shipped extension is the approved look. A difference is a bug in the port, even when the port's version looks "better".

## 1.6 Forbidden "improvements" during Stage A

These all look harmless, and each one breaks parity.

| Tempting change | Why it is forbidden in Stage A |
| --- | --- |
| Remove `!important` from the exported CSS | Specificity was tuned against these; about 3,900 declarations interact |
| Replace `display: contents` / grid placement with a real wrapper | Changes the structure the CSS keys on (`[data-iw-chrome="shell"] > header`). This is Stage B only, behind a zero diff |
| Render the nav, notice and zone bar inside a new `<HeaderChrome>` wrapper element | Exactly the phase-1 failure class: the shell's direct-child relationships stop holding |
| "Fix" a colour, spacing or size that looks off | Values were measured (for example, optical centring by gap-symmetry sweeps). Report it to Curtis instead |
| Drop CSS that looks dead | Some of it is a guarded fallback. The `:not([data-iw-order-handle])` chains match nothing yet carry specificity other rules are tuned against |
| Mark only the visible copy of a duplicated panel | The CSS is harmless on the hidden copy, and marking both removes a whole class of breakpoint bugs (chapter 3 §3.9) |
| Resize sprite boxes with pixel `background-size` | Atlas windows are percentage pairs; a pixel size shows a different sprite |
| Derive a mark from rendered text when you have the data | Use the prop. Text heuristics are what the port removes |
| Change the tooltip behaviour while porting a surface | Separate workstream. Emit tooltip-trigger attributes exactly as the extension does today unless that workstream changes them (§1.7) |

## 1.7 Scope boundary: the tooltip engine

Curtis has asked for the tooltip engine to be separated, with its own on/off setting, as a **separate piece of work**. This package does not specify that work. Where a surface carries a tooltip hook, the chapter says so, and the rule is: **emit the hook exactly as today when tooltips are enabled.**

The hooks are:

- `data-iw-tooltip-trigger`;
- `data-iw-item` / `data-iw-item-name`;
- the trigger `tabindex` / `aria-*`;
- the `.iw-item-ref` span inside inventory names.

Two places where the hook also changes the paint:

- a quest objective that carries `data-iw-tooltip-trigger` is styled as a link (`skillpanel.css:2884`);
- `.iw-item-ref` has its own styling in `tooltip-engine.css`, `inventory.css` and `skillpanel.css`.

What the paint should be when tooltips are **off** is the tooltip workstream's decision, not this one's. `tooltip-engine.css` still ships as sheet 2, because it styles `.iw-item-ref` wherever it appears.

`NameScanner.js` registers a CSS highlight that **no stylesheet paints** (finding FUN-02 in the technical handover). It has no visual output, so dropping it changes nothing on screen.

## 1.8 Definition of done, per surface

A surface is done when all of the following hold:

1. It renders the contract from its chapter, confirmed against:
   - `generated/golden/…after.html`;
   - a live `capture-skin-contract.js` run for the route.
2. `diff-parity.mjs reference.json candidate.json` exits 0 at 1440, 1100, 768 and 390 px wide (chapter 13 §13.4), on the same route and game state.
3. Every state in the chapter's state table has been diffed. For example, a skill card:
   - idle;
   - running;
   - disabled;
   - requirement unmet;
   - locked.
4. Every control on the surface still works with mouse, keyboard and touch.
5. With the native theme **off**, the surface renders the stock UI with **no** skin marks. Check with `document.querySelectorAll('[data-iw-ui],[data-fs-skill],[data-iw-chrome]').length === 0`.
