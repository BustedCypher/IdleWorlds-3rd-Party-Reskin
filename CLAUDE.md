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
```

`build-tools/audit-sprite-windows.mjs` (run by `npm test`) checks every pixel
`background-size`/`-position` pair in the stylesheets against
`skills_ui_index.json`: the window must land on a named cell, the scale must be
isotropic, and the box must equal `cell x scale`. It follows `:hover`-style
variants that inherit the base rule's `background-size`, and it FAILS if it
parses zero windows, because a check reporting zero is broken, not passing.

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
- `src/modules/QuestPanelRenderer.js` — quest cards are also `.compact-panel`,
  so they arrive on the same `iw:skill-panel` event (as `skill: 'unknown'`).
  This module positively re-identifies them (a `^Reward:` line plus a Turn In /
  Skip control or `% complete`), tags `data-iw-quest-role/-zone/-state`, appends
  a `.fs-quest-sigil` medallion, and reuses the Skills UI atlas. Its CSS lives
  at the end of `skillpanel.css` (no new sheet — the smoke test pins the count
  at 6). `DOMWatcher.detectSkillType` returns `'unknown'` early for quest
  shapes so a `"<Discipline> Work Order"` label can't trip skill identity.
  The objective item ("💠 Night Claw 22/100" → "Night Claw") drives two things:
  its `AtlasService` sprite is painted into the medallion (`.fs-quest-sigil-icon`,
  discipline glyph is the fallback), and — when the name resolves in
  `ItemDatabase` — the objective `<p>` gets `data-iw-tooltip-trigger="1"` +
  `data-iw-item*` (attributes only, no wrapper) so `TooltipEngine` shows the
  item card on hover. `NameScanner` skips `[data-iw-tooltip-trigger]` so it
  can't stack a second prose highlight on the same line.
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

## Traps that have each cost a day

**`ui-system.css` wins.** It is injected last and its generic control rule is
specificity `(0,4,1)` with `!important`:

```css
button:not(.iw-item-ref):not(…):not(…) { … !important }
```

Anything you style on a `<button>` loses to it. Do **not** escalate specificity
— add your hook to that rule's `:not()` chain, the way `.iw-item-ref`,
`nav-tab`, `[data-iw-inventory-control]`, `[data-fs-preserved-action]` and the
skill controls already do. This trap has bitten at least four times: inventory
tool buttons, inventory filters, the active-filter ember, and skill nav arrows.

**The page ships a hidden duplicate.** There is an `xl:hidden` column that
mirrors the whole panel stack. `document.querySelector('…')` frequently returns
the **invisible** copy. Always check `getBoundingClientRect()` — a capture where
everything is `{w:0,h:0}` is the hidden column, not the page.

**Panels nest inside layout columns.** `UIFoundation`'s heading walk marks
`data-iw-ui="section-frame"` on containers as well as panels. Frame the **leaf**
only: `:is(…):not(:has(:is(…)))`, and strip anything that matched a column. See
`tests/panel-frame-nesting.test.mjs`. The walk now **prefers the game's own
`.panel` wrapper** as the frame — an async panel (Quests) that is empty at
first classify used to fail the "substantial" heuristic and the walk fell
through to the multi-panel layout column, which the `:has()` rule then stripped
bare. `sectionFrameResolutionValid` re-resolves any frame that is not a
`.panel` but contains one. `classifyActivityPanels` also matches a **non-heading
leaf label** ("Action Log" is not an `<h1–4>`), and both classifiers skip
`[class~="xl:hidden"]` mirror copies.

**`AtlasService` owns the item icon.** It writes `background-image`,
`-position` and `-size` **inline** on `.fs-inv-icon` and appends
`.iw-icon-badge` as a real child. Never set a background there from CSS; carry
rarity on `border-color` / `box-shadow`, and keep `overflow: visible` so the
enhancement sprite can overhang.

**A sprite-backed box must keep its art's aspect ratio.** The percentage
`background-size` pair stretches each sprite to *exactly fill* its element, so a
box whose ratio disagrees with the art silently distorts it. The Base-EXP plaque
was 174×40 (4.35:1) against 300×100 art (3.00:1); the squash pulled the plaque's
frame in on the label and is what made it "too close to the text". Native ratios:
`xp_plaque` 3.00, `action_frame` 3.52, `nav_frame` 0.96, `medallion_frame` 0.92.
When a touch target and the ratio conflict, keep the 44px target and widen the
box. `build-tools/render-fixtures.mjs` now measures plaque ratio per width.

**`height: 1px` does not hide a node that has a `min-height`.** The three-zone
layout visually hides the native xp-gain / reward / progress rows, but an earlier
atlas rule gave xp-gain `min-height: 32px`, which beats `height`. Every card
carried ~35px of invisible dead space. Zero `min-height`/`min-width`/padding/
margin too, or the "hidden" node keeps pushing real content around.

**One corner filigree for the whole page: `assets/inventory/panel_corners.webp`.**
Inventory, Quests, Skill Actions, the activity panels AND the header all draw it
through the same `border-image … 95 88 / 30px 28px / 0 stretch`. Its slice
consumes the whole sheet, so edges and middle are empty by construction and only
the four corners paint, at a fixed size however large the panel grows. Before
reaching for new artwork, check whether a frame already exists — the header was
the one surface not using it, which is the entire reason its frame never matched
the rest of the page.

`assets/header/header_frame.webp` cannot serve as that frame, and the reason is
in the ART: measured, its corner motif is **107x107 square**, sitting **21px**
from the sheet's top but **84px** from its bottom, with a 44px flourish mid-edge.
In a short wide bar every presentation of it fails — a mask wider than the motif
severs the connecting rule; `border-image` crushes the 140px edge slices 4.7x
vertically and flattens the flourish; anchoring the bottom to `100%` leaves the
frame short. Do not spend another round trying to make it fit.

**The sheet is not the sprite, and `border-image` stretches dead margin too.**
`assets/header/utility_frame.webp` is 208x197 but the plate only occupies
**180x176 of it, at offset 6,7** — a 22px dead column on the right and a 14px
dead row at the bottom. Any technique that maps the WHOLE SHEET onto a control
therefore draws the art off-centre and undersized, and `border-image` is not
exempt: it stretches the sheet's edge slices, blank pixels included. Rendered
and measured at 10x, `border-image … 50 fill / 11px` put a **35.5x37.1 plate in
a 42x42 button**, slack 1.5px left against 5.0px right, so the plate's centre
landed at 19.25,20.25 while the icon — centred on the BOX, as `place-items:
center` must — sat at 21,21. Every glyph was 1.75px right and 0.75px low inside
its own frame, and the rail gapped unevenly because each plate hugged the left
of its slot. The fix is a CSS crop, not new art: these buttons are a fixed 42x42
at every breakpoint, so there is nothing for border-image's stretch machinery to
buy, and a sprite window (`background-size`/`-position`, what `AtlasService` and
the inventory tool buttons already use) maps source rect 6,7 180x176 onto the
box exactly. **Measure a sheet's opaque bbox before choosing a technique** —
`utility_frame` is the only header sheet with dead margin; `zone_button_idle`,
`nav_idle`, `nav_active` and `status_frame` are all tight to their edges, and
the `nav_frame_idle`/`_active` atlas cells are concentric to within half a
source pixel. `render-fixtures.mjs` now measures painted ink against box centre
for both the utility plate and the inventory tool frame, which is the only kind
of check that can see this — no computed style exposes a margin that lives
inside the image.

**The inventory tool row is three controls and ONE ORNAMENT.** Live DOM:

```
<div class="flex items-center gap-2">              <- row, h=37
  <div class="relative"><button …/></div>          <- Filter,    y=222 h=31
  <button aria-label="Search inventory" …/>        <- Search,    y=225 h=31
  <button aria-label="Equipment Window" …/>        <- Equipment, y=225 h=31
  <svg class="lucide lucide-package … text-ember">  <- ornament, 16x16
</div>
```

The fourth glyph looked like a classifier miss for a long time. It is not. It
is a **bare `<svg>`** with `cursor: auto`, no role, no tabindex, no aria-label
and no title, while all three real controls carry `cursor: pointer` + label +
title. The game gives it none of the button chrome it gives them, and rule 5
says the skin must not repaint that distinction away — **framing it would invent
a click affordance the game does not offer**. `classifyInventoryChrome` tags it
`data-iw-inventory-control="glyph"` and `inventory.css` only harmonises it (15px
to match the framed controls' own glyphs, plus an ember bloom). Its `text-ember`
colour is deliberately untouched: ember is live state in this same panel — it is
what marks the active filter tab. The smoke test pins all of this, including
that the ornament is never tagged `icon` and that both attributes come off at
teardown.

**A block-level `<svg>` is NOT centred by its button.** Tailwind preflight
ships `svg { display: block }` on the live page, so every icon is a BLOCK child
of its control, and a block box with an explicit width gets no auto-centring —
it sits flush left. Measured, every inventory tool glyph sat at **dx = -7.5px,
exactly half its own 15px width**, hard against the left edge of the 30px frame.
`[data-iw-inventory-control="icon"]` therefore carries `display: grid` +
`place-items: center`; do not drop it back to default button layout. Note the
trap that hid this for three rounds: WITHOUT preflight the svg stays inline, a
button centres inline content for free, and the fixture reads dx=0 — so a
fixture that omits the host page's RESET lies exactly like one that omits a
stylesheet. `render-fixtures.mjs` now injects preflight and asserts it is there,
because reverting the fix only moves the glyph if the svg is block-level.

Also note `display: grid` blockifies its own children, so "is the svg
`display:block`?" is NOT a usable check that the fixture models preflight — the
fix itself satisfies it and the check can never fail. Assert the input (the
preflight rule is in the page) rather than the output.

**Only TWO of those three controls are flex items.** Filter is wrapped in a bare
`div.relative` (its dropdown anchor), so it is never blockified and lays out in
that wrapper's inline formatting context. Measured live, the wrapper is **37px
around a 31px button with the button flush to its top** — six pixels of line-box
depth below it — and the row's `items-center` then centres a 37px wrapper
against 31px siblings. That is the 3px the funnel sat high. The same
`display: grid` above fixes this too: making the control block-level leaves the
wrapper no inline content to build a line box from, so it collapses to the
control's own height. (An earlier attempt put `display: flex` on the WRAPPERS
via `:has(> …)`; the control-level rule reaches the same blockification, cannot
match some other container in another layout, and is the only one of the two
that also centres the glyph.) The height half of this is deliberately
**mechanism-independent**: the six pixels could NOT be reproduced locally —
Chromium uses custom baseline logic for `<button>`, and a hand-built model with
the same line-height, preflight and `overflow` settings yields a 31px wrapper
every time. So this one is verified by live measurement plus the invariant
(wrapper height == control height), NOT by a local repro. Re-check it live.

**A render harness that cannot load its assets looks exactly like broken CSS.**
`page.setContent()` gives the page an `about:blank` origin, and a `file://`
subresource is blocked from it — silently. Every sprite renders as nothing while
`getComputedStyle` still reports a perfectly correct `background-image`,
`-size` and `-position`, so the CSS audits clean and the screenshot is empty.
Ten minutes went into "why did my rule break the frame" before a hand-written
control in the same page proved it also failed to load. In a `setContent` page,
inline assets as `data:` URLs; `render-fixtures.mjs` gets away with `file://`
because of how it loads its page, so the two harnesses are not interchangeable.
This is the same family as the bug below — the sheet was there, its art was not.

**The fixture rewrote `../assets/` for only half its sheets.** `base.css`,
`ui-system.css` and `header.css` went through `.replaceAll('../assets/', …)`;
`inventory.css`, `skillpanel.css` and `tooltip-engine.css` were inlined RAW, so
every sprite they declare 404'd and every fixture render of those surfaces was
missing its frames. This is the "a fixture that omits a stylesheet will lie to
you" trap wearing a different hat — the sheet was there, its art was not. One
`sheet()` loader now rewrites all six.

Note the plate sets `overflow: hidden`, which clips to the padding box — a
pseudo-element at `inset: -1px` loses its 1px rules entirely.

**Anchored label regexes break on the game's leading icons.** IdleWorlds
prefixes many labels with an emoji — `🧭 Zone 19: …`, `🌐 Zones`, `⚔️ Combat
Lv 62`. `/^zone \d+:/` and `/^zones$/` therefore matched nothing, so the whole
zone bar stayed unclassified and rendered vanilla. Strip a leading
non-alphanumeric run (`replace(/^[^a-z0-9]+/i, '')`) before any anchored test.

**A container whose text starts with its own label is also a label match.**
The zone bar's wrapper text begins "Zone 19: …" just like the label inside it,
and the host walk starts at the label's PARENT — so matching the wrapper
branded the whole page wrapper as the zone bar. Filter candidates to the
innermost match per branch, and stop the walk at anything containing the
`<header>` or main nav.

**Inline `!important` from a renderer outranks every stylesheet rule.**
`SkillPanelRenderer.styleButton()` and `AtlasService` write declarations inline
with `important` priority, so no selector — however specific — can override
them. The recipe pager's whole appearance therefore lives in `styleButton()`:
the framed `skills_nav_*.svg` is the control, and the button's own
border/box-shadow and its native `‹ ›` glyph must be cleared **there**, not in
CSS, or they draw a second outline around the art's frame and a vector arrow on
top of the drawn one. Corollary: any geometry duplicated
between `BUTTON_STYLES`/role blocks and `skillpanel.css` must be kept in step,
because a disagreement silently resolves in the inline copy's favour (the action
button was pinned to 132×48 inline while the CSS asked for 155×44). The fixture
must carry the same inline styles or it renders a control the game never shows.

**A fixture that models the wrong DOM shape lies exactly like a missing
stylesheet.** The skills fixture placed `nav-group` inside the *content* zone;
no live panel does — live wraps the nav pair and the action control in one
command cell. The CSS therefore grew `position:absolute` + `translateY(26px)`
hacks that looked right in the fixture and skewed every real panel. The fixture
now renders both live shapes (with nav, and the bare-button cell).

**Atlas sprites are sized in percentages.** `SkillsArtService` computes
`background-size` as a percentage pair. Overriding it with a pixel value moves
the sprite window onto the wrong region of the sheet — the art does not just
resize, it becomes a different image.

**Pinned by `tests/static-invariants.test.mjs`** — do not "fix" these:
`.fs-inv-name` must keep `-webkit-line-clamp: 2` + `white-space: normal`;
`.fs-inv-icon` must keep `overflow: visible`; `.fs-inv-body` must keep
`overflow: hidden`.

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

## Performance: flush-path caching (fixed 2026-08-27)

The skin used to cost **2.4 ms per flush at ~1,500 nodes and 6.5 ms at
~4,500** because `DOMWatcher` observes `characterData: true` subtree-wide (an
idle game with ticking counters flushes roughly every animation frame — an
inline `style="width:X%"` progress-bar tick is what actually fires
`iw:dom-flush`, since pure `characterData` text is explicitly excluded from
that queue) and every consumer of that event ran a full, uncached
document-or-subtree scan in response, every single time:

- `UIFoundation`'s four classifiers (`classifyMainNav`, `classifyZoneBar`,
  `classifySectionFrames`, `classifyActivityPanels`) each re-ran a
  `document.querySelectorAll(...)` + regex sweep unconditionally.
- `InventoryRenderer.findInventoryRoot` — a whole-document heading scan — ran
  *before* the `cheapSignature` guard meant to skip it, and ran **twice** per
  row on the slow path.
- `HeaderRenderer` had no caching at all, and `findLiveHeader`/`classifyAdjacent`
  trusted the first DOM match with no visibility check — the same
  hidden-`xl:hidden`-duplicate risk `findInventoryRoot` was hardened against.
- `DOMWatcher.skillSignature`/`detectSkillType` computed the same
  button/identity/locked-copy subtree scan twice per skill panel.
- `SkillPanelRenderer.annotateStructure` re-ran the same full-panel
  `textCandidates()` sweep (sorted through `getComputedStyle`) 8+ times per
  panel per render, with no before-guard of any kind.

All of the above now cache their **resolution** (which element plays which
role) and revalidate cheaply (`isConnected` + role-attribute + containment
checks) instead of rescanning — while every classifier's **live** per-tick
content (active tab, chat feed rows, XP/progress values, disabled-state-driven
role reassignment) still recomputes on every flush, by design; see each
module's cache-validity function for exactly what it does and does not
freeze. `DOMWatcher`'s `FLUSH_BUDGET`/rAF/round-robin coalescing was already
correct and was not touched.

**Verification actually performed this session** (jsdom, not the live page —
see the discipline below): `tests/smoke.test.mjs`'s mutation-burst check
(120 inventory rows injected in one burst, waited up to 8s) went from
rendering **40 of 122 rows** before any of this work, to **122 of 122** after
all of it landed — the single starkest before/after signal available without
live instrumentation, since it's wall-clock-bounded and was previously
failing outright. A live re-measurement of ms-per-flush at ~1,500/~4,500
nodes, using the same batched-`performance.now()` methodology as the numbers
above, has **not** been done — only the user can verify live (per this file's
own verification-discipline rule below); do that before removing this section
entirely.

Measured previously — `:has()` is **not** the problem (0.075 ms vs 0.087 ms
with it removed). Do not spend effort there.
