# Sprites, plaques and button art

Atlas windows, aspect ratios, three-slice labels, inline `!important` plates and optical centring.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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
through the same `border-image … 95 88 / 34px 32px / 0 stretch`. Its slice
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

**A `gap` is applied on BOTH sides of an invisible flex item, so flattening a
label's native text does not make it free.** The World Boss action button keeps
the game's own copy ("Prejoin", "⏳ Prejoined") inside the control at
`font-size: 0` for accessibility and draws the compact word with `::after` from
`data-iw-boss-action-label`. That flattened text node is still a zero-width
FLEX ITEM sitting between `::before` and `::after`, so the label's `gap: 5px`
was spent twice on one side of nothing and moved the word 2.5px right of centre
in every state. On top of that the "active" state drew a `⌛` `::before`,
whose 16px advance pushed QUEUED a measured **12.9px** right: its ink ended at
x=107.0 of the 132px control, which is exactly where the sprite's right
flourish starts (the flat interior of `action_frame_idle` is only x 25..107 of
the box), while the space to the left of the glyph sat empty. Reported as
"the QUEUED text is off centre", which is precisely what it was. Fix: `gap: 0`,
no in-flow ornament, and `margin-right: -.07em` on the `::after` to cancel the
step `letter-spacing` adds after the LAST letter. The word still carries the
compact copy (QUEUED vs PREJOIN), but queued participation also needs a
persistent NON-MOTION state cue: `data-iw-boss-action-state="active"` paints
a static inset ring plus an encounter-colour drop-shadow bloom. Do not put the
old hourglass back into flow and do not pulse/animate the active state — both
would reintroduce the original centring/idle-paint problems. The active paint
must leave the 132x38 control geometry unchanged and remain static under
`prefers-reduced-motion: reduce`.

`tests/boss-action-label.test.mjs` pins both concerns in a real browser. It
diffs the button against itself with only the `::after` colour cleared to
isolate the WORD's ink from the frame art (restore the gap and it reports
+2.5px, restore the glyph +8.25px, both +12.9px), then separately compares
idle/active computed paint and bounds so the queued cue cannot disappear or
move the control. Note the word-diff is what makes the centring check
independent of atlas loading — see the next trap.

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

**The SKILL command button now wears that same quest artwork** (Curtis,
2026-09): one action-button skin across the site. It is the identical
`action_frame_idle` / `_disabled` cell, and every consequence above applies to
it unchanged — the plate goes, the shadow moves into `filter`, the geometry
holds 3.52 (155x44, 148x44 narrow). Three things are specific to this surface:

- **The sprite is written INLINE, in `SkillPanelRenderer.ACTION_ART`**, not in
  `skillpanel.css`, because `styleButton()`'s inline `!important` plate
  outranks every rule in that sheet — which is exactly why the atlas cells
  the sheet USED to declare here had quietly stopped painting years before
  anyone noticed (the note that block carries). It overrides the same keys the
  state map writes, and keeps `background` as the SHORTHAND so no plate
  longhand survives underneath and teardown's single `background` restore
  still clears everything. `skillpanel.css` owns only what nothing inline
  contends for: the drop shadow, the hover bloom, the disabled dim.
- **It is gated on `data-iw-skills-ui-ready`, which resolves ASYNCHRONOUSLY**,
  so state, role and the style attribute can all be unchanged at the moment it
  flips. Readiness is therefore part of `styleButton()`'s snapshot key; drop it
  and the sprite never reaches a button that was already styled as a plate.
  Without the gate the shorthand's `var()`s are invalid at computed-value time,
  every longhand falls back to its initial value, and the button renders as a
  bare label rather than falling back to the plate.
- **The plate's diamond studs are suppressed** when the art is on (they are the
  plate's ornament; the frame carries its own end flourishes). The stud rules
  themselves are LEFT in place — `tests/static-invariants.test.mjs` pins their
  presence, and a panel whose atlas never resolves still gets the studded
  plate.

Pinned in three places, and each has a verified negative control:
`tests/smoke.test.mjs` (sprite present, plate gone, disabled takes the
desaturated cell, readiness in the snapshot key) and `render-fixtures.mjs`
(the skill button's computed sprite window must EQUAL the quest turn-in's —
comparing the two is what makes the check about consistency rather than about
one hard-coded cell; plus no plate, no studs, and the 3.52 ratio at every
responsive width). Compare same-state buttons or the check is meaningless: a
disabled quest turn-in draws the grey cell at x=57.4%, not the gold one at
x=12.1%.

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

**A control whose LABEL LENGTH is the GAME's can be sliced FROM THE ATLAS,
with pseudo-elements — `border-image` is not the only three-slice.** The quest
turn-in reads "Turn In" on one card and "Turn In All (38)" on the next, and the
count is live. Its box was `aspect-ratio: 264/75` over `min-width: 148px` with a
FIXED `padding: 0 20px`, while the frame's end flourishes are a FRACTION of the
box (12.9% each side, measured: the interior runs x 34..228 of the 264px cell) —
so past ~155px the horns walked inward over the label and the text ran out of
the frame. Reported as "the turn in text doesn't fit because the number in
brackets is dynamically scaled".

`border-image` — the reward plaque's old fix — is unavailable here: a slice is
measured from a standalone image's own four edges and cannot address a cell
inside a sheet, and the frame is per-zone (nine themed atlases), so the
standalone route would mean 20 new files. Multiple `background` LAYERS cannot
do it either: `background-clip` only reaches border/padding/content box, so a
layer cannot be confined to one end of the box. **Pseudo-elements can** — they
are real boxes with their own clipping:

    ::before   left end band, `--fs-action-cap` wide, at native scale
    element    the flat middle band, stretched across the CONTENT box
    ::after    right end band, same width, same scale

`SkillsArtService` derives all of it from `skills_ui_index.json`
(`bandGeometry()`, `ACTION_CAP_PX = 60` source px) and publishes
`--fs-ui-action-{idle,disabled}-{cap-size,cap-l-position,cap-r-position,
mid-size,mid-position}` plus `--fs-ui-action-cap-ratio` (60/75 = .8). The
percentages are resolution independent, so the 2x themed recolours read them
unchanged, and `audit-sprite-windows.mjs` skips percentage pairs by design, so
this adds nothing for it to check. Four things are load-bearing and each is
invisible when wrong:

- **`background-origin/clip: content-box` AND `padding: 0 var(--fs-action-cap)`
  are one mechanism, not two.** The padding IS the cap width, so the middle
  band paints exactly between the two end boxes. Draw it across the whole
  border box instead and it shows THROUGH the horns' transparent taper as a
  dark rectangle sticking out past the frame — which reads as a stray box, not
  as a clipping bug. Give the label extra breathing room by widening the
  padding beyond the cap and you get the same artefact inverted: a transparent
  notch where the band stops short of the cap. Extra room comes from a LARGER
  slice, never from extra padding.
- **`z-index: -1` on the caps, with the button a stacking context.** A
  positioned pseudo-element paints ABOVE its host's inline content, so without
  it the two end bands cover the ends of the label. At negative z they paint
  above the host's own background and below its text — the mirror image of the
  Village medallion trap below, where that same paint order is what breaks it.
- **The cap BOX is `height x --fs-ui-action-cap-ratio`**, the same scale the
  band's own window uses, so cap scale == middle scale == vertical scale at
  every breakpoint. A fixed px cap distorts the ends on the next one.
- **Every state re-aims BOTH ends with the middle.** A `:disabled` turn-in that
  only swaps its own `background-position` renders grey in the centre with gold
  horns still on it.

Consequences for the geometry: **the height is the fixed axis and the width
follows the label** (`aspect-ratio` is gone; 148x42 is still the resting size
and still the art's undistorted 3.52). Two cards side by side therefore keep
matching button heights, which growing on the ratio did not.

And the narrow layout needs one more thing, in JS: below 640px `skillpanel.css`
takes the command block OUT OF FLOW (it is the last child in the DOM, so a
float cannot lift it beside the earlier text the way the live card does) and
the text lines reserve room for it by hand. A hard-coded 124px reserve was
right only while the block's width was fixed. `QuestPanelRenderer.
measureCommandBlock()` now publishes the measured width as `--fs-quest-cmd-w`
on the card and the reserve is `calc(var(--fs-quest-cmd-w, 116px) + 8px)`;
without it a long label runs UNDER the title instead of pushing it. A width of
0 is the hidden mirror column, not a measurement, so the last real value is
kept. The inline write queues an `attr:style` context on the card — the same
bounded re-entry `commitProgressDuration` accepts: the induced flush
re-measures, reads the same width, and returns without writing.

The **skill** command button and the **World Boss** action button draw the same
two cells and are deliberately NOT sliced: their labels are fixed short verbs
and their boxes are pinned (155x44 inline from `SkillPanelRenderer`, 132x38 in
`ui-system.css`), so the whole-cell window is correct for them and slicing the
skill one would mean repurposing the `::before`/`::after` its plate studs
already own. If either ever gains a dynamic label, move it to this recipe.
`build-tools/render-fixtures.mjs` no longer string-compares the two surfaces'
computed windows (they are different techniques now); it reverses each
percentage back into the source rect it addresses and checks THAT against
`skills_ui_index.json` — which also catches a pair that agrees with itself on
the wrong cell. `tests/quest-command-width.test.mjs` is the real-browser half
(growth, fixed height, the reserve tracking); it serves the page over a routed
http origin because `assetUrl()` falls back to a relative path outside the
extension and a `file://` page cannot fetch it — without the atlas index the
panel never gains `data-iw-skills-ui-ready`, the cap padding never applies, and
the test would pass or fail for the wrong reason.

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
styles or it renders a control the game never shows. Same reason `ACTION_ART`
(the command button's quest-rail sprite, above) lives in `styleButton()` rather
than in the sheet, and the fixture's `ACTION_INLINE` carries a third copy.

**Atlas sprites are sized in percentages.** `SkillsArtService` computes
`background-size` as a percentage pair. Overriding it with a pixel value moves
the sprite window onto the wrong region of the sheet — the art does not just
resize, it becomes a different image.


**Newly live gear can precede the extension's offline atlas pin.** A live
`items.json` record proves the item ID, catalogue name and effects; it does
**not** prove that the extension has matching local artwork. World-boss rewards
therefore use the live `ItemDatabase` record for metadata and let
`AtlasService.resolve({ id, name })` fall through from an item-atlas ID miss
to the gear atlas by catalogue name. When the offline atlas is behind, import
the exact audited source cell rather than substituting a visually similar
sprite. The launch Woodcutting/Construction glove hotfix is intentionally
guarded by `build-tools/import-launch-glove-icons.mjs`: it verifies the
source v2 manifest coordinates and the source audit's RGBA SHA-256 before
copying into the two unused legacy cells, and `--check` verifies the committed
destination still carries those same pixels. If the source manifest/audit does
not contain the documented cells, stop the import instead of guessing.
