# Collapsible frames

`CollapsibleFrames.js`: the appended chevron, what it costs every classifier, and making nine different panels fold into one bar.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

**An element the skin APPENDS into a game node changes what every other
classifier reads there.** The collapse toggle lives inside the panel's heading
row, and four structural tests in `UIFoundation` counted it as one of the
game's own controls the moment it existed. The worst was
`classifyPanelHeader`: a split header requires the title branch to hold NO
button, so on the pass after the append the World Chat / Action Log headers
stopped reading as split and lost their two-column header treatment — a
regression whose cause is in a different module from its symptom. All four now
carry `:not([data-iw-collapse])` (`classifyPanelHeader`'s split test,
`hasPanelBodyOutsideHeading`, `panelHostMatches`'s action-log "view all" probe,
`classifyActionLog`, and the Current Action queue walk), plus
`InventoryRenderer`'s `NOT_IN_ROW` chain and `CompactButtons.kind()`. This is
the `:not()`-opt-out rule the generic control rule already documents, applied
to CLASSIFIERS rather than to CSS: when the skin adds a control to a shared
node, every sweep that counts controls there has to be told about it.

**The collapse target is the `.panel`, not the node wearing the frame mark.**
`classifyActivityPanels` resolves its host structurally, and for the Action Log
that host can be the heading ROW rather than the card: `panelHostMatches` walks
up from the label and stops at the first ancestor that satisfies it, and
`hasPanelBodyOutsideHeading` only discounts a sibling whose text is xp/hr and
NOTHING else — so a header carrying both "832,170 XP/hr" and "52% win rate"
passes. Collapsing that would hide the rate readouts and leave the feed
standing. `collapseTarget()` therefore prefers `frame.closest('.panel')` (one
of the four durable hooks), declining a `.panel` that wraps another because
that is a layout column. Two frames can then resolve to one card, so the pass
dedupes on the TARGET — without that the second visit appends a second toggle
to the same box. (The `hasPanelBodyOutsideHeading` looseness is a real latent
issue in its own right and is NOT fixed here; changing it would re-tune a
matcher CLAUDE.md says was fitted against live captures.)

**The control must centre on the heading ROW, which means living inside it.**
Pinned to a fixed offset from the panel's top-right corner it floated above the
title: measured across the nine panels, heading rows run 30px to 93px tall,
because `--iw-frame-pad-y` is 18px on an activity panel and 26px elsewhere and
the section title's own `clamp(17px,1.8vw,21px)` changes the row height again.
So the toggle is appended to the head with `position: absolute; top: 50%`, and
the head gets `position: relative` — the only element that knows where its own
middle is. Being out of flow it is NOT a flex item, so the game's
`justify-between` header still sees exactly the two children React wrote;
appending it as a third IN-FLOW item would have pushed the game's own controls
to the middle. The head also takes `padding-right: 30px` to reserve the gutter,
which is what keeps the toggle off Action Log's "View All", World Chat's three
icon tools, Zone Control's button pair, Current Action's cancel and the
Inventory tool row — all of which sit at exactly that end of exactly that row.
Centre it on the TITLE rather than the row and World Chat breaks, because that
row carries a second line under its heading and the game centres its own icon
tools on the row.

**`VillageScene.render()` had to stop calling `replaceChildren()`.** The scene's
frame is shared chrome now, so wiping every child deleted the collapse toggle
on each village change and left the scene as the one panel on the page that
could not be folded. It removes only its own `data-iw-village-scene-owned`
children. The collapse pass's stale sweep is keyed on the TARGET rather than on
whether this pass re-tagged the head, for the same reason: the rebuild drops
`data-iw-collapse-head` until the next flush restores it, and keying on the
button would have read that one-frame gap as "no longer a panel" and thrown
away the player's collapsed state.

**A collapsed panel is ONE bar, and getting there costs more than a height.**
Reported from a live capture (Curtis, 2026-09) as "very inconsistent". Three
things were making every panel fold differently, and all three had to go:

- **The heading rows are not one line.** Skill Actions carries "Daily XP Boost:
  … +20% XP" and "Resets in 03:50" under its title, World Chat carries
  "Showing the latest 100 messages", Village carries "2 installed / 4 slots",
  and the game's own header controls (Inventory's three tools, World Chat's
  four icons, Skill Actions' I/II pager, Current Action's cancel) are 30-34px
  tall. A collapsed panel therefore keeps ONLY the path to its title, marked in
  JS by `markSpine()` because the title sits at a different depth in every
  panel and hiding a WRAPPER hides the title inside it. Everything else in the
  row folds away with the panel and comes straight back on expand.
- **The frame's padding could not be overridden, so the TOKEN is re-pointed
  instead.** `--iw-frame-pad-y` is 18px on an activity panel and 26px
  elsewhere, which is the whole 16px height difference between the two
  families; the padding declaration itself lives in the `:is(A,B,C):not(:has(
  :is(A,B,C)))` frame rule at **(0,4,0) with `!important`**, so overriding it
  needs a specificity war while setting `--iw-frame-pad-y: 7px` on the
  collapsed frame needs none. Reach for the variable, not the property.
- **The Action Log's title is a real `<button>`**, and `base.css`'s
  `button:not(…)×4` font rule is **(0,4,1) with `!important`** — so that one
  panel heading rendered in the UI face while every other used the display
  face, in the EXPANDED state too. `ui-system.css` has always tried to correct
  it at (0,3,0) and always lost. `:not([data-iw-ui="section-title"])` on the
  base.css rule is what finally lets that intent land; the collapsed treatment
  then only needs (0,2,0).

`line-height` on the collapsed title is a fixed **px, not a ratio** — it is
what makes every bar exactly as tall as every other.
`tests/collapsible-frames.test.mjs` folds all nine panels at once and requires
the set of heights AND the set of computed title treatments each to have
exactly one member, which is the only shape of check that can see
"inconsistent".

**A collapsed bar wears ONE flourish, top left, and the filigree rule had to be
handed over rather than overridden.** Curtis asked (2026-09) for the other
three corners gone and the title moved clear of the survivor. Two things about
that:

- **`border-image` needs no second asset to drop three corners.** The sheet is
  sliced at 50%, so each corner paints where two border SIDES meet and the
  edges between them are empty by construction; `border-width: 15px 0 0 32px`
  therefore leaves the top-left quadrant as the only corner with any area. It
  also fixes the size problem on its own terms — at the full 34px slice, four
  corners of a 34px bar overlap into an unreadable band.
- **The first attempt at this was INERT and looked exactly like art that had
  not changed.** `[data-iw-collapsed="1"]::after { border-width: … }` is
  (0,1,0) against a (0,4,0) `!important` frame rule, so the collapsed bars kept
  drawing all four corners and nothing said so. The fix is the `:not()` opt-out
  the generic control rule already documents, applied to the filigree selector:
  ui-system.css's `::after` now carries `:not([data-iw-collapsed="1"])` and
  collapsible.css OWNS the collapsed ornament, redeclaring it whole. Its
  negative control is verified — remove the opt-out and the check reports
  `[34,32,34,32]` on every bar. There is a second check that an EXPANDED panel
  still gets all four, because an opt-out on someone else's selector can strip
  more than it was meant to.
- **Do NOT shrink the surviving corner to fit.** The first attempt windowed it
  at 32x15 to keep it inside a 34px bar; the source quadrant is 88x95 logical,
  so that stretches the art to more than twice its width-for-height and the
  flourish renders as a smear — reported live as "the corner filigree is
  squashed somehow". With three corners gone there is nothing left to overlap,
  and the native 32x34 fits the 40px the `::after` gets from its `inset: -3px`.
  The check is tied to the EXPANDED corner's own ratio rather than to a number,
  so it stays true if the art is ever re-cut.
- The title's clearance is `padding-left` on the HEAD, not a smaller frame
  padding, so the bar's left rule still lines up with every other panel.
  Reverting it puts the title at 21px against a 32px flourish.

**The collapse control had a SECOND owner, and only on three panels.**
`:is([data-iw-panel-part="header"], [data-iw-panel-part="header-tools"]) button`
in ui-system.css is (0,2,0) `!important` against collapsible.css's (0,1,0), so
inside the three activity panels — the only frames whose head is tagged
`header` — the toggle was resized to 30x30 and given that rule's own plate,
while every other panel drew it at 22x22. Live capture (2026-09): the same
control at two sizes down one column. It carries `:not([data-iw-collapse])`
now. The related `--iw-frame-pad-x` split (20px on an activity panel, 22px on a
section frame) is levelled on the collapsed frame through the token, the same
way the vertical pair is, because it put the toggle at two different distances
from the panel edge. `tests/collapsible-frames.test.mjs` asserts the control's
box, its computed paint and its inset each collapse to ONE value across all
nine panels — a uniformity check has to compare the set, not spot-check one.

Cost: after the first pass the module writes nothing. The append is guarded by
a `:scope >` probe, and `data-iw-*`, `aria-expanded` and `aria-label` are all
outside DOMWatcher's `attributeFilter`, so a settled page produces no mutation
records — `tests/flush-quiescence.test.mjs` mounts real toggles and asserts it.
`tests/collapsible-frames.test.mjs` is the real-browser half (all nine panels,
each with the live app's own header shape from the deployed bundle, plus the
overlap and centring geometry); `tests/smoke.test.mjs` covers the click, the
storage round trip and the kill-switch teardown. Both negative controls on the
geometry are verified: drop the head's `padding-right` and the toggle covers a
game control on two panels; drop `:not([data-iw-collapse-head])` from the fold
rule and a collapsed panel loses its own title.
