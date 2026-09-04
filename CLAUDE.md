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
- `src/modules/OverlayFramer.js` — generic pop-up / modal chrome. The per-surface
  classifiers frame a panel by matching its heading against a fixed name set
  (`SECTION_FRAME_NAMES`); every dialog outside that set (the "Players Online"
  list, and every modal the game portals in) reached the page bare. Runs on
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

**Two modules must never write the same attribute on the same node.**
`.compact-panel` is the game's shared card class - skills, quests, bosses,
village and shop all use it - so every one of those nodes reaches
`SkillPanelRenderer` on `iw:skill-panel`. For a non-skill it calls
`clearPanelChrome()`, which used to `delete panel.dataset.iwUi`
unconditionally. When `UIFoundation` tagged World Boss cards
`data-iw-ui="boss-card"`, the two writers fought once per flush and the cards
VISIBLY FLASHED between the skinned and the vanilla ground - the symptom reads
like an artwork/loading problem, not an attribute problem. Two fixes, both
kept: `clearPanelChrome` now deletes `iwUi` only when it is its own
`'skill-panel'`, and the boss role lives in its own `data-iw-boss` namespace,
the way `QuestPanelRenderer` already namespaces `data-iw-quest-role`. Give a
new role on a shared node its own attribute; teardown it in the owning
module's `clear*()`.

**The page ships a hidden duplicate — but which copy is hidden SWAPS at
1280px, and a static class test gets that backwards below it.** There is an
`xl:hidden` column that mirrors the whole panel stack, paired with a
`hidden xl:grid` wide column; Tailwind's `xl` breakpoint (1280px) is what
decides which one Tailwind marks `display:none`. **1280 is a load-bearing
number in this codebase.** `document.querySelector('…')` frequently returns
the **invisible** copy. Always check rendered state, not a class name —
`getBoundingClientRect()` was the original probe-script technique (a capture
where everything is `{w:0,h:0}` is the hidden column, not the page), and
`src/modules/Viewport.js` (`isRendered`/`pickRendered`/`preferRendered`) is
now the shared, correct way to do this in the skin itself.

For a long time `UIFoundation.js` instead excluded `[class~="xl:hidden"]`
directly — correct ABOVE 1280px, exactly inverted below it, so the skin
decorated the invisible column and left the real one bare on any narrower
viewport (V1.6.0_MOBILE_LAYOUT_AUDIT.md has the full writeup and the
Playwright reproduction). **Never reintroduce a `[class~="xl:hidden"]` or
similar hardcoded-class exclusion** — always resolve which column is live via
rendered state.

**A viewport crossing a breakpoint mutates NOTHING** — same family as the
`characterData`/`data-iw-*` flush-trigger gap below. `DOMWatcher`'s single
MutationObserver has nothing to observe when Tailwind flips a `display` value
via a media query, so a resize alone can never reach a classifier through
`iw:dom-flush` without help. `Viewport.startLayoutWatch` watches the game's
own Tailwind breakpoints via `matchMedia` (fires only on an actual crossing,
not per resize pixel) and DOMWatcher wires it to re-run `discover()` on the
whole document, which is also how `getLayoutEpoch()` gets bumped — every
column-dependent cached resolution in `UIFoundation.js`
(`sectionFrameResolutions`, `bossPanelResolutions`, `activityPanelResolutions`,
`mainNavResolution`) checks `entry.epoch === getLayoutEpoch()` specifically
because `isConnected` alone does not change when an element merely goes
`display:none` — a resize with no epoch check left every one of these
permanently bound to whichever column was live at first resolve.
`tests/viewport-swap.test.mjs` pins cold boot below 1280px, resize in both
directions across it, and a repeated round-trip; it is a real-browser
(Playwright) test, not jsdom, because the bug and the fix both live in actual
CSS layout that jsdom never renders.

**Panels nest inside layout columns.** `UIFoundation`'s heading walk marks
`data-iw-ui="section-frame"` on containers as well as panels. Frame the **leaf**
only: `:is(…):not(:has(:is(…)))`, and strip anything that matched a column. See
`tests/panel-frame-nesting.test.mjs`. The walk now **prefers the game's own
`.panel` wrapper** as the frame — an async panel (Quests) that is empty at
first classify used to fail the "substantial" heuristic and the walk fell
through to the multi-panel layout column, which the `:has()` rule then stripped
bare. `sectionFrameResolutionValid` re-resolves any frame that is not a
`.panel` but contains one. `classifyActivityPanels` also matches a **non-heading
leaf label** ("Action Log" is not an `<h1–4>`), and both classifiers resolve
which mirror copy is live via `Viewport.preferRendered` — see the
hidden-duplicate trap above for why that must be rendered-state, not a class
name.

**A card's TITLE verb and its BUTTON verb can disagree, and that costs the
whole card.** Live Smithing (2026-09) renders "🛠️ Craft Voidiron Reinforcement
Plate" under a button that says FORGE. `action-title` was resolved by two verb
tests and both missed: the `SKILL_META` one ('craft' is not 'smelt'/'forge')
and the fallback that derives the prefix from the action button's own label
('Craft …' does not start with 'forge'). This is not a cosmetic loss —
`action-title` is one of the three anchors `distinctZones` resolves the layout
shell from, so the miss dropped `data-iw-skill-layout` entirely and the card
rendered in the legacy shape: no medallion, no three-zone grid, no pager
chevrons, no diamond studs, and the pager left where React put it (two boxes
stacked at the top-right) instead of flanking the action button. The symptom
reads as "the skin didn't reach this card", not as a classifier miss. Two
fixes, both kept: smithing gained `titleActions: ['smelt','forge','craft']`
(`actions` must NOT gain 'craft' — that is the exact-match test for the command
button, and widening it would let a Crafting/Construction control answer for
Smithing), and `annotateStructure` gained a third, VERB-FREE pass: the title is
the element immediately before the "Lv N - X% • … to go" readout in the same
branch. Pinned by `tests/smoke.test.mjs` (`#smith-craft-panel`); revert either
half and the surviving half must still carry it.

**The live app ships almost no stable hooks — that is why this file is full of
text heuristics.** Read from the deployed Next.js bundle, 2026-09. The ONLY
durable attributes in the whole app are `id="current-action-panel"`, the
`.panel` primitive (already used by the section-frame walk), `data-skin` on the
root wrapper (the game has its own theming knob — worth watching, it can change
the palette under the skin), and a niche `data-roster-ignore`. There are no
test ids, no semantic data attributes, and `role` appears only as `button` and
`switch`. Everything else is anonymous Tailwind utility classes. So classifier
misses from copy changes are STRUCTURAL to this project, not carelessness — and
the leverage is in making a miss loud rather than in hunting for better hooks.
`activityPanelLabelNodes` now falls back to `#current-action-panel` when the
label text no longer matches; that is the only surface where such a hook
exists. Two harness traps this exposed, both live in `tests/smoke.test.mjs`
now: a `characterData` edit and a `data-iw-*` attribute edit BOTH fail to
trigger a flush (the watcher excludes characterData and must ignore its own
writes), so a drift test needs a real childList mutation to kick one; and the
fixture carries a second visible Current Action panel (`#current-action-no-queue`)
that the live page does not, so a drift test must relabel BOTH or the text pass
still succeeds and the check passes for the wrong reason.

**The skin's surface coverage vs the game's, from the bundle's own aria-label /
title vocabulary.** Covered: Skills, Quests, Inventory/Bag, header, main nav,
zone bar, Current Action, Action Log, World Chat, World Boss, Market, Village,
Leaderboards, Salvaging, Zone Control. NOT reached at all: **Equipment Window**
(`"Close equipment window"`, `"Open socket"`, `"Socketed"`, `"New slot — nothing
equipped"`, `"Nothing equipped in this slot"`, and critically `"Upgrade vs
equipped"` / `"Downgrade vs equipped"` — that comparison is STATE and rule 5
applies the moment the skin touches it), **Mailbox**, **Notifications**,
**Settings**, **Supporter Pack**, **Invite Friends**, **Profile**, and the
**Dungeon** route's own panels (`"Leave Dungeon"`, `"⚔️ Raid Dungeon"`,
`"⏳ Prejoined"`). `NAV_LABELS` includes `dungeon` so the tab is framed, but
`SECTION_FRAME_NAMES` does not, so nothing inside that route is. The five
header utility buttons ARE skinned generically; the panels they open are not.
**Update:** any of these that renders as a real modal (a viewport-covering
`fixed` backdrop wrapping a card) now gets the shared forged FRAME from
`OverlayFramer` — the outer chrome only. Their contents are still
un-classified, and the rule-5 state colours inside (`"Upgrade vs equipped"`,
team colour) are still untouched by design. Zone Control ships team colour (`"Blue team controls this zone"`, `"Red Team"`,
`"Zone is open for attack"`) — team identity is state, do not repaint it.

**Verified against the app's real palette:** the requirement met/unmet test
(`/\btext-(?:red|rose|orange|amber|yellow)-\d/`) is correct. The app's full
`text-*` colour set is amber, blue, cyan, emerald, fuchsia, green, orange,
purple, red, rose, sky, slate, violet, yellow, zinc — the warm/danger family the
regex matches, and no others, is what marks an unmet requirement.

**A readout must not lose a real affordance.** The "Lv N - X% • … to go" node is
a genuine `<button>`: the app gives it `title="Click to cycle XP display"` and a
`hover:text-white/70` class, and clicking it cycles the XP display format.
`READOUT_STYLES` used to write a flat `cursor: default` across the whole readout
branch, which told the player that control does nothing — rule 5 in its
affordance form (the click still worked; nothing on screen said so). `cursor` is
now per-node via `readoutCursor()`: `pointer` for a real control in the branch,
`default` for the inert wrappers. Do not fold it back into `READOUT_STYLES`.

**Adding a skill IdleWorlds ships later touches five places, and the icon
atlas is full.** Woodcutting (`Wood` / CHOP) and Construction (`Build` /
`Craft Parts`) both arrived unskinned because CHOP was an unknown verb and
"Craft Parts" is not the bare CRAFT the crafting branch matches on. A new
discipline needs: `SKILL_IDENTITY_ALIASES` + the verb and anchored-label
branches in `DOMWatcher.detectSkillType`; a `SKILL_META` row in
`SkillPanelRenderer` (`actions` is matched EXACTLY against the button text,
`titleActions` is a `^verb\b` prefix test against the card title — Construction
needs `craft parts` in the first and `craft` in the second); an accent in
`skillpanel.css`; a `DISCIPLINE_STYLE` row in `QuestPanelRenderer` so its work
orders match; and the fixture's `SKILL_GLYPHS`/`SKILL_ART`/`SKILL_LEVELS` maps.
`assets/skills_icons_atlas.webp` is a fixed 6x2 sheet with **all twelve cells
spoken for**, so there is no cell to add art to — `SkillsArtService.ICON_ALIASES`
points a new skill at the nearest existing sprite (woodcutting -> gathering,
construction -> crafting) instead of letting `paintIcon` fall through to the
featureless `generic` slot. Accent, glyph and label still separate them. If the
atlas is ever redrawn wider, drop the alias and add real cells.

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

**The header background is per-zone AND per-viewport.** `HeaderRenderer.
applyZoneSurface()` sets TWO inline vars on the header root for the current
zone (read from the `data-iw-ui="zone-title"` label, "🧭 Zone 19: …", strip the
leading icon run first): `--iw-header-surface` → the wide 4:1 strip
`assets/header/zones/zone_<N>.webp`, and `--iw-header-surface-mobile` → the 7:8
portrait crop `zone_<N>_mobile.webp`. Both fall back to
`assets/header/header_surface.webp` for a zone past `ZONE_SURFACE_MAX` or before
the label classifies. `header.css` paints `--iw-header-surface` on
`[data-iw-header="root"]` normally and swaps to
`var(--iw-header-surface-mobile, var(--iw-header-surface))` inside
`@media (max-width: 768px)` — the wide strip `cover`s into the tall stacked
phone header as an unrecognisable sliver, the portrait crop is composed for it.
The desktop/mobile choice is PURE CSS: a viewport change needs no JS, and a
non-matching `@media` block's background image is not fetched, so desktop never
downloads the mobile set. `applyZoneSurface` runs every `iw:dom-flush` but only
rewrites when `root.dataset.iwZone` changed; teardown clears `data-iw-zone` and
(via `ASSET_VARS`, which lists both vars) the inline styles. `ZONE_SURFACE_MAX`
is 34 — bump it when art past 34 lands. `tests/zone-headers.test.mjs` pins that
every zone 1..34 has BOTH files; `tests/smoke.test.mjs` pins both vars set +
torn down; `render-fixtures.mjs` verifies the media-query swap by filename at
390px vs 1400px.

`zone_1..34.webp` (wide) and `zone_1..34_mobile.webp` (portrait) are the real
hand-painted headers, imported from the sibling sprites repo
(`../idleWorlds-game-sprites-BC/assets/zone-headers/environment-focused/` and
`.../mobile/`, `NN-<slug>.png`) by `npm run import:zone-headers` /
`npm run import:zone-headers:mobile` (`build-tools/import-zone-headers.mjs
[--mobile]` — desktop cover-fits to 1792x440 @ q0.80, mobile keeps the native
768x880 @ q0.74; a `NN-slug-vN.png` iteration is used only when it is the sole
file for its zone). Its `previews/` contact sheets show the whole set.

`npm run art:zones` (`build-tools/make-zone-surfaces.mjs`) is now
a PLACEHOLDER-only generator — a procedural canvas matte (mood-driven sky,
celestial body, ridge layers, a name-themed focal structure, particles, grade,
vignette) that writes ONLY zones with no file yet (`--force` to overwrite). Use
it to fill a gap when a new zone ships before its painting does. Replacement
art just needs the same `zone_<N>.webp` name and a wide (~3–4:1) aspect.
`web_accessible_resources` already exposes `assets/*`, so nested
`assets/header/zones/…` needs no manifest change. The zone bar's own
`::before` scene still uses the static `header_surface.webp` — point its
`--iw-zone-scene` at the same per-zone file if that should track too.

**The FRAME chrome is per-zone too, on the same trigger.** The 34 zones group
into nine environment palettes (`glacial`, `infernal`, `verdant`, `celestial`,
`voidborn`, `runic-arcane`, `lunar-spectral`, `tempest-oceanic`, `forged-metal`)
by `assets/skills-ui/zone-theme-map.json` (imported from the sibling repo).
`npm run import:skill-themes` (`build-tools/import-skill-themes.mjs`) writes, per
theme: `assets/skills-ui/theme_<name>.webp` (a straight recolour of
`skills_ui_atlas.webp` — SAME 860x463 canvas and cell positions, so
`skills_ui_index.json` and the sprite-window audit still describe it) and
`assets/skills-ui/panel_corners_<name>.webp` (the corner_filigree cell baked
into the same 176x190 crop-and-mirror sheet `make-panel-corners.mjs` produces,
because `border-image` slices a standalone image and cannot address an atlas
cell). It also regenerates `src/modules/zoneThemes.js` — DO NOT hand-edit that
file; `tests/zone-themes.test.mjs` pins it against the JSON and checks every
referenced asset exists.

`HeaderRenderer.applyZoneTheme()` runs on every `iw:dom-flush` beside
`applyZoneSurface`, maps the current zone via `zoneTheme()`, and sets two
variables **inline on `<html>`** (in its own `data-iw-zone-theme` namespace):
`--iw-zone-atlas` (read by `SkillsArtService`'s `--fs-skills-ui-atlas` and the
three inventory sprite windows in `inventory.css`) and `--iw-corner-filigree`
(the `border-image` source in `ui-system.css`, `header.css` and
`tooltip-engine.css`). Traps:

- **`<html>` is outside `document.body`**, which is the single observer's root,
  so writing the attribute + vars there can never feed a flush — no
  changed-only guard needed beyond the `dataset.iwZoneTheme === key` early
  return. `applyZoneSurface` writes to the header (inside body) and DOES need
  its guard; do not copy that reasoning backwards.
- **`base.css` `:root` MUST keep defining both variables.** `border-image:
  var(--iw-corner-filigree) …` is a shorthand — if the var ever resolves empty
  the WHOLE declaration (slice, width, repeat) is dropped and the panel loses
  its corners, not just its colour. The `:root` block is the un-themed fallback
  and the only thing standing between "zone not classified yet" and no frame.
- **Geometry is frozen at 860x463.** A theme atlas that isn't pixel-identical
  in layout to `skills_ui_atlas.webp` silently repaints every sprite window
  onto the wrong region (CLAUDE.md, "Atlas sprites are sized in percentages").
  The import tool hard-fails if a source atlas isn't `index.width x
  index.height`.
- **The sprite-window audit keys on the atlas.** `audit-sprite-windows.mjs`'s
  `declaresAtlas` regex was widened to also match `skills-ui/theme_<name>.webp`
  and `var(--iw-zone-atlas`; without that, switching `inventory.css` to the var
  would have SILENTLY dropped three windows from the check (still >0, so no
  hard fail — exactly the "a check reporting fewer is broken" failure mode).
- Teardown: `clearHeaderRenderer` deletes `data-iw-zone-theme` off `<html>`
  and the `querySelectorAll('*')` + `ASSET_VARS` loop (now listing the two
  vars) clears the inline props. Smoke test pins both the set (zone 19 →
  `voidborn`) and the teardown.

**The CSS chrome recolours with the zone too — via a token layer, no JS.**
`base.css` `:root` defines `--iw-th-*` (accent, accent-dim, edge, hairline +
hairline-hi, bracket + bracket-dim, brass, rule, rule-soft, plate, cta +
cta-hi, ground-a/-b, ground-wash, glow) with defaults that reproduce the stock
"Ashen Iron" brass/ember EXACTLY, then aliases the old names onto them
(`--iw-gold: var(--iw-th-accent)`, `--iw-ember: var(--iw-th-cta)`,
`--iw-line-hot: var(--iw-th-rule)`). Nine `:root[data-iw-zone-theme="…"]` blocks
(also in `base.css`, right after the atlas/filigree `:root` block) re-point the
layer per environment. They key on the SAME `data-iw-zone-theme` attribute
`HeaderRenderer.applyZoneTheme()` already sets on `<html>` — pure cascade,
zero extra JS. `:root[data-…]` is `(0,1,1)` so it beats the `(0,0,1)` default;
HeaderRenderer's inline `<html>` vars are only `--iw-zone-atlas` /
`--iw-corner-filigree` and never collide.

The six sheets had ~30 literal brass/gold/ember hexes (frame borders `#6B4F28`
/ `#4B3D26` / `#6B5527`, hairline stops `#9B7437` / `#D09A4B`, header brackets,
the `#171713→#0D0E0C` panel ground, the ember nav-tab / send-button / zone-Next
/ active-filter CTAs) — all now `var(--iw-th-*)`. What was deliberately LEFT
literal: every state / identity colour — requirement-unmet red `#D58282`,
`--fs-quest-accent` and its `color-mix` expressions, `--fs-skill-accent` mixes,
tier `--iw-t-*`, `--iw-good/bad/info`, the `.fs-cat-*` inventory category hues,
`.fs-inv-row.is-equipped` brass (rule 5 — it's the equipped signal, and a
themed blue would collide with the gear-category rail), `.iw-xp__fill--ready`
green, `--hd-teal*` zone-control team colour, and the near-neutral structural
darks (`#2A241A`, `#3A3225`, …) which read fine untinted. The ground gets a
faint additive `--iw-th-ground-wash` layer (prepended to the `background:`
shorthand; `transparent` un-themed = no-op).

Verification: `render-fixtures.mjs` now cycles all nine palettes on `<html>`,
asserts each one actually re-points the tokens (not a silent fall-through) and
that accent text keeps ≥3:1 on the ground, and writes `fixtures/themes.png`.
`tests/zone-themes.test.mjs` pins that every theme has a `:root[data-…]` block
defining the core tokens. `tests/smoke.test.mjs` still pins the `<html>`
attribute + teardown from phase 1.

Not themed: the standalone `skills_xp_plaque_wide.webp` (a `border-image`
source — would need nine sliced sheets like the corner filigree) and
`.iw-btn--primary` reads weak for the darker CTAs (it may be a dead skin
class — check before tuning).

`assets/header/header_frame.webp` cannot serve as that frame, and the reason is
in the ART: measured, its corner motif is **107x107 square**, sitting **21px**
from the sheet's top but **84px** from its bottom, with a 44px flourish mid-edge.
In a short wide bar every presentation of it fails — a mask wider than the motif
severs the connecting rule; `border-image` crushes the 140px edge slices 4.7x
vertically and flattens the flourish; anchoring the bottom to `100%` leaves the
frame short. Do not spend another round trying to make it fit.

**The header chrome is smoked glass now, not gold plates** (Curtis, 2026-09).
Per-zone artwork moved behind the header, and the ornate `zone_button_idle`
marble status plaques + octagonal `utility_frame` icon plates covered most of
it and read as gaudy. `[data-iw-header="status-card"]` and
`[data-iw-header="utility-button"]` drop their `border-image` / plate art for a
translucent dark fill (`rgba(9,8,13,~.42)`) + `backdrop-filter: blur(2px)`,
framed against the artwork by just a gold outline (`rgba(201,162,77,~.45)`) +
a faint gold glow. The `background` shorthand deliberately clears §1's
corner-bracket gradients — Curtis did not want the flourishes on these
controls. The two notes below (utility-plate sprite crop, sheet
dead-margin) are kept as history in case the plates are ever wanted back;
`render-fixtures.mjs`'s utility-plate ink-centre check no longer has a plate to
measure and is moot until then.

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

**A sprite frame on a button means the button's own plate must go.** The
quest rail drew `action_frame_idle` on top of its own `border` + gradient +
`box-shadow`. The frame art tapers to transparent over the outer ~28px of its
264px cell (measured column alpha: 1% at x=0, 94% by x=28), so the plate showed
through as a second, squarer rectangle around the art — "the game's old button
underneath the graphic". Once the sprite is on: `border: 0`,
`background-color: transparent`, `box-shadow: none`, and the drop shadow moves
into `filter: drop-shadow(...)` so it follows the art's alpha instead of the
box. Keep the plate only as the pre-atlas fallback. (The recipe pager used to
be the other example of "the artwork is the control"; it has since dropped its
sprite for a plain CSS plate — see the inline-`!important` note below.)

Second time this bit the quest rail (2026-09): the strip rule
`.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role="turn-in"]`
is `(0,4,0) !important`, but `base.css`'s generic
`button:not(…) { box-shadow: inset 0 1px 0 …, 0 1px 0 … !important }` is
`(0,4,1)` (the `button` type tips it), so its hairline OUTLIVED the strip's
`box-shadow: none` — a full-width 1px top/bottom line just outside the sprite,
read as a faint second frame. `border`/`border-radius` from the same strip
block still won because `base.css` sets no `border` there. Fix was the
`:not([data-iw-quest-role])` opt-out on that `base.css` block (NOT escalating
the strip rule) — the skill nav/action buttons dodge the same hairline only
because `styleButton()` writes their plate inline. Pinned in
`render-fixtures.mjs` (ready quest button computed `box-shadow` must be
`none`).

**A plaque whose LABEL length is not yours to control needs 3 slices, not a
sprite window.** Quest reward text ranges from "+1,875g • +810 combat XP" to
"+1,284,500g • +212,480 spellcrafting XP". A percentage `background-size`
window stretches the cell to exactly fill its box, so a content-width box
distorts the art — the plaque shipped ~200x30 (6.7:1) against 3.00:1 art, and
since the horns occupy the outer 19% of the sprite, stretching them 2.2x
horizontally dragged them inward over the text. Restoring 3:1 is not available
either: at that label width it demands a ~90px-tall plaque. `border-image` on
the standalone `assets/skills_xp_plaque_wide.webp` (an atlas cannot be a
`border-image-source` — the slice applies to the whole image) fixes the horns
and stretches only the flat centre. Measured from the art: opaque bbox
`0,7 300x71`, horn/flat boundary at x=58 and x=242. The centre is **not**
featureless — there is a small diamond stud at x 137..165 that rises to source
row 7 and drops to row 77 — so the stretched middle does smear it, by the
ratio of the plaque's inner width to 184px (about +20% at a 292px plaque).
It is small and symmetric, so this is accepted; do not read the flat 52%
column-alpha plateau as proof there is nothing there, which is the mistake
that missed it (the stud reads as only 53->71 opaque rows over 28 columns,
and looks just like the two horn diamonds in a strided printout). Setting
`border-image-width: 0 <cap> 0 <cap>` draws no top/bottom band, so the middle
row alone fills the box and source rows 7..77 (71px) map to the full height —
which is why undistorted horns need `cap = 58 x height / 71`, not `58 x
height / 100`. That ratio is the whole trick; a future "tidy-up" that rounds
`--fs-plaque-cap` to a plain px value re-breaks it at the next height change.

**`place-items: center` does not centre a `::before` that has a text-node
sibling.** The reward plaque keeps the game's own "Reward: ..." text as the
accessible copy at `font-size: 0` and draws the trimmed value with `::before`.
In a GRID that leftover text node becomes a second, anonymous grid item on its
own row; both rows then stretch to share the height, and the label is pushed
into the top half. Measured with a debug tint (paint the `::before` green and
screenshot), its line box sat at **7.0..20.8 in a 42px plaque** — 7px high, and
exactly the "text is not in the centre of the frame" report. Row-flex fixes it:
the same text node becomes a zero-width sibling. `.fs-skill-base-exp` is built
the same way (`display: grid` + `place-items: center` + `::before`) and its
`padding: 0 34px 4px` bottom bias is probably compensating for the same thing —
measure before touching it.

**To centre a label in a sprite frame, measure GAP SYMMETRY — do not compute
two centres and match them.** Optically centring the reward label took three
wrong values (.07, .16, .10 of the plaque height) before the method changed,
and every one came from a model that looked sound:

- "Walk inward from the bright rails to find the interior." The top ornate band
  is source rows 17..24 but dips to 42/76/65/44 mid-band, so any single
  threshold ends the walk at row 19 and the interior reads ~6 rows too tall on
  top — computed centre 46.5% instead of 49.3%.
- "Centre the ink centroid." The intensity-weighted centroid is dragged low by
  the single `g` descender and by `text-shadow`, so centring it leaves the
  cap band — what the eye reads — sitting high.

Both were self-consistent and both were visibly wrong to the user. What works
is measuring what a person actually compares: `gapTop` = label cap-top minus
the inner edge of the top rail, `gapBot` = inner edge of the bottom rail minus
the baseline. Render a sweep of candidate values at `deviceScaleFactor: 8`,
diff each against a blank frame to isolate ink, and read off where the two gaps
are equal. Pick from the MIDDLE of the flat band, not its edge — the answer
quantises to device pixels, so a value on the boundary flips at another height
(`.045` is 0.00px at h=38 and −0.63px at h=42; `.06` is fine at 42 and 2px off
at 38). Keep the sweep viewport wider than 600px or the mobile block shrinks
`--fs-plaque-h` and the sweep answers the wrong question.

**One unclassified tab in a rail looks like "the rim skips that button".**
The main nav is matched tab-by-tab against a fixed label set
(`NAV_LABELS`), and anything that misses the set keeps its vanilla surfacing
INSIDE a rail the skin has already reframed -- which reads as a missing rim
on that one control, not as a classifier miss. Two ways a single tab drops
out, both now covered by `tests/smoke.test.mjs` (revert either half and the
"decorated tab" check fails):

- The label was matched with `nearestButtonLabel` (raw text, exact compare),
  so any decoration at all -- a leading emoji, a trailing lock/NEW badge --
  fails the compare. `navLabelText` strips a non-alphanumeric run from BOTH
  ends. Same family as the zone bar's leading-glyph trap below.
- `mainNavResolutionValid` validated only the tabs it already knew, so a rail
  that GAINS a tab after the first classification (Dungeon unlocks, or the
  route mounts it late) stayed cached forever and the new sibling was never
  visited. It now re-counts the rail's own labelled controls and re-resolves
  on a change. Count distinct LABELS, not elements: counting elements makes a
  duplicate control permanently mismatch the deduped tab list and re-resolution (a
  whole-document scan) then runs on every flush.

`claude/probe-nav.js` is the read-only capture for this surface -- it reports
whether every labelled tab is inside the element that draws the rim, the rim
box against the union of the tab boxes, and each tab's computed paint.

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
them. The recipe pager's plate therefore lives in `styleButton()`: the thin
steel geometry (`NAV_BUTTON_W` = 26px wide × 44px tall), the cool-toned
gradient + its 1px border, and the suppression of the native `‹ ›` glyph
(`color: transparent`, `font-size: 0`) are all set **there**, because CSS
cannot override them. The chevron itself is a rotated border-corner drawn by
`skillpanel.css` `::before` (a pseudo-element cannot be set inline). As of
2026-09 the ornate `skills_nav_*.svg` framed-arrow asset is **no longer used**
— Curtis asked for thin arrows flanking the action button in a contrasting
colour — so `--fs-skills-nav-prev/next` and those two SVGs are dead (left in
place; `web_accessible_resources` still exposes them). Layout: `nav-group`
becomes `display: contents` inside the command cell so its two arrows join the
command flex row and flow-order lays them prev / action / next; the
content-branch shape keeps the group in the content zone and lays it across
the whole command column (`width: var(--fs-skill-command-w)`, `space-between`)
so the arrows land at the column edges, flanking the centred button — insets
derived, never magic. Corollary: any geometry duplicated between
`BUTTON_STYLES`/role blocks and `skillpanel.css` must be kept in step (the
nav width `26px`, the action button `155×44`), because a disagreement silently
resolves in the inline copy's favour. The fixture must carry the same inline
styles or it renders a control the game never shows.

**The skill "Requires …" line is coloured by state — grey when met, red when
not.** The game already does this: its native line carries `text-white/45`
(muted) when the player meets the requirement and a warm/danger `text-<hue>-N`
class when they don't. The skin used to force `color: #D58282 !important` on
every `[data-iw-skill-role="requirement"]`, repainting met lines red and
deleting the game's own signal (rule 5). `SkillPanelRenderer` now reads the
native line's class and sets `data-iw-req-state="met" | "unmet"`;
`skillpanel.css` defaults the role to muted `#AAA291` and only the
`[data-iw-req-state="unmet"]` override is red. Both the base rule and the
higher-specificity `[data-iw-skill-layout="three-zone"]` rule set the grey, so
the unmet override is listed at both specificities. Per Curtis (2026-09). If a
future capture shows the game using some non-`text-*-N` unmet marker, widen the
detection in `SkillPanelRenderer` — do not go back to unconditional red.

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

**`[].every()` is TRUE, so a classifier that resolves to NOTHING freezes
forever.** Every `UIFoundation` classifier caches its resolution and revalidates
with `resolutions.every(valid)`. That guard is correct while the array has
entries — a route swap disconnects them, `isConnected` goes false, and the
classifier re-resolves. It is WRONG when the array is empty, because
`[].every(...)` is vacuously true: the classifier takes its cached early return
on every subsequent flush and never scans again. IdleWorlds is an SPA, and
Market / World Bosses / the zone bar are each route-specific, so the empty
resolution is the normal case — boot on Game and `classifyMarket` resolves to
`[]`, then clicking Market never tags a single row.

What made this read as a CSS bug rather than a classifier bug: the panel still
looked framed. `classifySectionFrames` DID re-resolve, because its entries had
gone disconnected — invalidation the empty case never gets. So the forged frame
came back and only the contents inside it reverted, which reports as "it forgot
the CSS rule we just added". The same freeze silently stranded
`HeaderRenderer.applyZoneSurface`, which reads the zone number off
`data-iw-ui="zone-title"` to choose the per-zone header art.

The fix is coverage, not just validity — the shape `classifyActivityPanels`
already had: the cache is valid only if every target currently in the DOM is
represented. Two details matter. Track the headings/titles the last pass
**EXAMINED** (`sectionFrameSeen` / `bossPanelSeen` / `marketSeen`), not the ones
it successfully framed — keying on resolved entries makes a heading the walk can
never pair with a frame re-run the whole expensive resolve on every flush. And
`classifyZoneBar` cannot afford a coverage scan at all (its `div,span,p,strong`
sweep is this file's own named ~65%-of-flush cost), so an empty resolution there
is gated on `zoneBarCandidatePresent()` — a `button`-only probe using the same
two label regexes the host walk keys on. `tests/route-swap-reclassify.test.mjs`
pins all of it; revert any one of the three guards to the bare `.every(valid)`
form and its checks fail.

**A header status card's `data-iw-header-stat` is live content, not frozen
resolution.** The game reuses the same six status-card nodes and only swaps
their text as buffs start and expire — a `timer` node becomes the server-boost
tile, an `other` becomes a `timer` — while `headerResolutionValid` stays true
(the grid is still connected), so `classifyHeader` takes its cached early
return. `HeaderRenderer.tagStatusCards` therefore runs on **both** paths,
every flush, re-deriving each card's `statKind` from its current text. The
first attempt at the boost-tile swap (moving it into the lower-left plaque via
`:has([data-iw-header-stat="boost"])`) did nothing live for exactly this
reason: the card that gained the "boosted" text kept its stale `timer` kind.
`tests/smoke.test.mjs` mutates a card's text node in place and asserts the kind
follows.

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
