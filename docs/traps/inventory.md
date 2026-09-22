# Inventory

The inner list frame, the tool row, row colour by super-type, and the upgrade-roll line.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

**`AtlasService` owns the item icon.** It writes `background-image`,
`-position` and `-size` **inline** on `.fs-inv-icon` and appends
`.iw-icon-badge` as a real child. Never set a background there from CSS; carry
rarity on `border-color` / `box-shadow`, and keep `overflow: visible` so the
enhancement sprite can overhang.

**The inventory has an inner list frame, like a quest card inside the Quests
panel.** The game stacks the item rows in their own wrapper (`div.space-y-1.5`)
that is a SIBLING of the header row / filter tabs / top+bottom pagers — not a
shared parent. `InventoryRenderer.classifyRowList()` tags that wrapper
`data-iw-inventory-list="1"` (only when it holds `.compact-row`s, isn't the
panel root, and doesn't also contain the title/pager/filter controls — so the
header chrome stays outside the frame, exactly like the "Quests" title sits
outside its cards). `inventory.css` then draws the recessed inner frame on it:
the same ground recipe as `.fs-quest-panel[data-iw-skills-ui-ready="1"]` and the
shared forged frame (`skills_panel_texture.webp` over the `--iw-th-ground`
gradient, soft-light blended), a `var(--iw-th-edge)` border, a themed top
hairline (`::before`) and the quest card's `inset: 3px` inner line (`::after`).
The ornate outer section frame (corner filigree + gold hairline, ui-system.css)
is untouched and now visibly encloses it. Nothing is reparented — one attribute
on a node the game already has. Teardown drops `data-iw-inventory-list` beside
`data-iw-inventory-root`. `tests/smoke.test.mjs` wraps its fixture rows in the
`space-y-1.5` div (a flat fixture would hide the classification) and pins the
tag + teardown; `render-fixtures.mjs` renders the panel in context to
`fixtures/inventory-panel.png`.

**The Inventory Filters menu is a CONTAINED popup, not a modal
(launch capture, 2026-09-21).** The deployed IdleWorlds bundle
`v0.2.0+2026-09-20.703` renders it exactly as:

```html
<div class="flex items-center gap-2">               <!-- frame direct child -->
  <div class="relative">                            <!-- popup anchor -->
    <button aria-label="Filter inventory"
            title="Filter inventory">...</button>
    <div class="absolute right-0 top-full z-30 mt-1 w-56 ...">
      <p>Tier</p> ... buttons ...
      <p>Type</p> ... buttons ...
    </div>
  </div>
  ...
</div>
<div data-iw-inventory-list="1">...</div>            <!-- later sibling -->
```

The game currently publishes **no** `role`, `aria-expanded` or
`aria-controls` for that popup. Do not make the implementation depend on
those attributes. `OverlayFramer` supports semantic ARIA popups when games do
publish them, and has one narrow structural fallback for this captured
`Filter inventory` sibling shape.

The failure was a stacking-context problem, not a too-small popup z-index.
`ui-system.css` gives every direct child of a forged frame
`position: relative; z-index: 1`. The popup's own `z-30` therefore remained
trapped inside the EARLIER tool/header child's stacking context while the later
inventory-list child painted above it. Raising the popup alone cannot cross
that boundary. The framer tags the frame's direct popup owner
`data-iw-overlay-host="1"` and the popup `data-iw-overlay="popup"`;
`overlay.css` lifts the host to local z=20 and the popup to z=21. Inventory's
normal `overflow:hidden` is relaxed only while a positively classified popup
exists. Close or teardown removes both markers and restores clipping without
reparenting or touching React handlers.

`tests/contained-popover-render.test.mjs` reproduces the real trap in Chromium
with an earlier tool child, later z=1 list child and absolute popup. Its
negative control proves `elementFromPoint()` lands on the list before
classification; after classification the popup must be topmost. The unit test
also rejects a hidden popup, an ordinary absolute child, `.iw-tip`, and the
existing viewport-scrim path remains independent.

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

**Pinned by `tests/static-invariants.test.mjs`** — do not "fix" these:
`.fs-inv-name` must keep `-webkit-line-clamp: 2` + `white-space: normal`;
`.fs-inv-icon` must keep `overflow: visible`; `.fs-inv-body` must keep
`overflow: hidden`.

**Inventory row colour is by SUPER-TYPE, not tier.** IdleWorlds' "tier" is
material progression, not RPG rarity, so a rare/epic tint on it misled. Per
Curtis (2026-09) `itemDisplay.categoryClass()` maps the item's game `category`
to one `.fs-cat-*` class on `.fs-inv-row` — gear `#6E9BC4`, consumable
`#68B96A`, processed `#A6AEB2`, resource `#9E7B54`, trade `#D4AD63`, unknown /
no-DB-match `#8C8578`. Consumables split further by `subcategory`: potion
`#CE5C6E`, enchant scroll `#8E7BDB`, xp scroll + xp shard `#3FB2AC`, supply
cache `#B366C4`; Usable item / Cosmetic Token keep the parent green. That class
sets `--fs-tier` (name text) and, via
`--fs-frame`, the left rail + icon border/glow + hover tint. Two sub-overrides
still layer on top: `.fs-inv-orb` (`subcategory ~ /upgrade orb/i`) sets
`--fs-tier: #E0913E` for the whole orb identity (name + frame); and
`.fs-inv-row.is-equipped .fs-inv-icon` → brass `#8A6A2C` on the icon only. `tierClass()` / the `.tier-*` utilities stay —
`TooltipEngine` still tints its title by tier; only the inventory row moved.
Tier is not lost from the row: it is still shown as the "Tier N · Slot" chip.

**The "🎲 upgrade-roll" line: drop the count, keep the rolled stats.**
Upgradeable gear (cloaks and any later orb-upgraded item) shows a native row
line like `🎲 +3 · +12 DEF · +3% 2x Gather Chance`. Per Curtis (2026-09) the
leading `🎲 +N` is only the roll COUNT — identical to the item's upgrade level,
already surfaced as the `.fs-inv-plus` name pip + the `AtlasService` icon badge
— so it is stripped **globally**. Everything after that prefix is the
accumulated rolled stat bonus (`+12 DEF · +3% 2x Gather Chance`): per-instance
values `items.json` cannot know, so they ARE kept, as one dynamic detail line.
`InventoryModel.buildInventoryDetails` does both: `UPGRADE_ROLL_STATS` captures
the stat remainder into `rolledStats` (empty for a fresh roll ⇒ nothing shown),
then `UPGRADE_ROLL_LINE` removes the whole line from the normal `source` pass so
the mangled `"3 · …"` form can't come back through. `detailTexts`'s
`interesting` gate matches `🎲` so the raw line survives collection. Tooltips
are `ItemDatabase`-sourced and never carried it. If the bare roll COUNT ever
becomes meaningful, re-surface it from `UPGRADE_ROLL_LINE` — don't reinvent the
parse. Identity resolution depends on the SEPARATE bare `+N` token / nested
`Name<span>+N</span>` span (see `resolveInventoryItemName` + `leafTexts`); that
is not the roll line and must keep working.

Same feature, second rule: a cloak's native **"Not upgradable"** line refers to
the OLD tier-upgrade path, not the orb system it *does* use, so per Curtis
(2026-09) it is dropped for any orb-upgrade item below `ORB_MAX` (4). An item
counts as orb-upgradeable if it has a `🎲` roll line (`rollLevel !== null`) or
its `item.subcategory` is a Cloak slot (covers a +0 cloak that shows no roll
line yet). At exactly +4 the line is genuine and kept; items with no orb system
(rings, amulets, trinkets that really can't be upgraded) keep it too, because
`suppressNotUpgradable` is false for them. `NOT_UPGRADABLE` matches only the
negative phrasings, so a hypothetical positive "Upgradable" line is untouched.

**Salvaging rows reuse the inventory row, and they are BUTTONS (2026-09-21).**
The Village route's Salvaging panel lists owned items as whole-row
`<button class="compact-row">`s (click = select for salvage) in
`div.grid.gap-2 < div.compact-panel < div.panel` under `<h2>Salvaging</h2>`.
`resolveInventoryContext` accepts a BUTTON row whose nearest `.panel` carries
that heading (`findSalvageRoot`); the last page's `div.compact-row` "Empty
salvage slot" fillers are not buttons and stay unrendered. The overlay is
appended inside the button, so every click still reaches React. Salvage
passes `root: null`, so no inventory chrome roles are written in that panel;
its list wrapper gets its own `data-iw-salvage-list` (recessed frame, gap 0).
The only per-instance state is the purple `· enchanted · socketed` span, which
`salvageDetails()` carries as detail chips (rule 5: salvaging destroys them).
Because the row is a `<button>`, the generic control plate in ui-system.css
and the base.css radius/shadow/hover chains beat the `.compact-row:has(>
.fs-inv-row)` shell; they now carry `:not([data-fs-inv])` (the rendered-row
marker, never set on a real control). The focus-visible outline is deliberately
NOT excluded. `tests/salvage-rows.test.mjs` pins it, with negative controls.
