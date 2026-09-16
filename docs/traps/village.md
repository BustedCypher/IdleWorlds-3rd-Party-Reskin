# Village panels and the Village scene

`VillagePanels.js` and `VillageScene.js`: the one `/api/player` read, teardown markers, and the scene's layout arithmetic.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

**The Village scene is the one surface that READS THE GAME'S API, and every
line of that read is a contract with someone else's server.** The dashboard
does not render the village at all — `sD.player.villageAddons` only reaches the
DOM on the `/housing` route — so a Village frame on the main page has exactly
two sources: the Village route's own markup while the player is standing on it,
and `GET /api/player`. `VillageScene` uses both, DOM first. Four things about
that read were each wrong once and each fails silently:

- **`section` is not free-form.** The app passes its own route name and ships
  exactly `dashboard`, `housing`, `market`, `leaderboards`, `dungeon`
  (`"housing"===sk?gO:null` and friends in the bundle). The first version sent
  `section=game`, which is not one of them. `sectionOf()` derives it from the
  pathname and defaults to `dashboard`, which is where the anchor lives.
  `scope=core` is what trims the payload to `{player, skills, notifications,
  inventory, recentGains}`; `player.housing.tier` and
  `player.villageAddons.{totalSlots,installed}` both live under it, and
  `installed` rows carry `slot`, `itemKey` (`construction_building_tier_<N>`)
  and `name`.
- **The league header does NOT come for free.** The game runs two leagues off
  one origin (`/ssf` prefix vs none) and picks between them by monkey-patching
  `globalThis.fetch` to stamp `x-idleworlds-league`. A content script runs in an
  ISOLATED world and never sees that patch, so a read from the skin has to set
  the header itself (`leagueOf()`: `ssf` or `standard`) or an SSF player is
  served their STANDARD village — right shape, plausible data, wrong character,
  and no error anywhere.
- **A tab swap must NOT drop the snapshot; a league swap must.** The first
  version called `clearVillageScene()` on any `location` change, which threw
  away the reading taken on the Village route at the exact moment the dashboard
  needed it — so with the API unavailable the frame sat on "Loading your
  village…" forever. Same family as the zone label `HeaderRenderer` has to
  remember. The route branch now keeps the snapshot unless `leagueOf()`
  changed, aborts in-flight reads, and pulls `nextRead` forward by at most
  `ROUTE_REFRESH_MS` so tab-drumming cannot spam the server.
- **The poll is a safety net, not the mechanism.** `readRenderedVillage()` runs
  every flush and reads VillagePanels' own `data-iw-village="housing"` /
  `"addons"` tags, so an install or a housing upgrade shows up on the very next
  flush. `REFRESH_MS` is therefore 5 minutes (with a 30s `RETRY_MS` after a
  failure, so a blip does not strand the frame on its error copy). And
  `reconcileVillageScene()` is `async`, so `guard()` — which only catches
  synchronously — cannot see its rejection: `UIFoundation` attaches a
  `.catch(warnOnce)` on the promise.

`tests/smoke.test.mjs` pins the read's URL, and its "no third-party network
requests" filter now RESOLVES each URL against the document before judging it,
because a relative same-origin path failed a raw string test.

**A module's `clear*()` must not be able to delete another module's nodes, or
the teardown check can never fail.** `VillageScene.own()` originally stamped
`data-iw-village-owned` — VillagePanels' marker — and `clearUIFoundation` calls
`clearVillagePanel(document.body)`, which sweeps `[data-iw-village-owned]`
across the whole body. So the scene was torn down by the WRONG module: delete
`clearVillageScene()` from `clearUIFoundation` entirely and the smoke test's
teardown checks still passed. The marker is `data-iw-village-scene-owned` now,
and reverting either half fails "appended village scene removed on teardown".
This is the shared-attribute trap the boss cards taught, in its teardown form.

**A box with `max-width` + `margin:auto` and only OUT-OF-FLOW children collapses
to its own border inside a flex column.** `.iw-vs-scene` had no `width`. Its
host wears `data-iw-panel`, and `ui-system.css` gives that
`display:flex; flex-direction:column !important` — and an AUTO cross-axis
margin CANCELS a flex item's stretch, so the box fell back to shrink-to-fit
over five absolutely positioned plots and an absolutely positioned house, i.e.
to 1-2px. `overflow:hidden` then clipped the entire village away while
`getComputedStyle` reported a perfectly correct background, height, position
and `background-image` the whole time — so it read as broken artwork, not as a
collapsed box, which is the same lie the `setContent`/`file://` asset failure
tells. `width:100%` is the fix and it is load-bearing.

**The scene's responsive rules key on the SCENE, not the viewport.** It sits in
the dashboard's `minmax(320px,0.42fr)` panel column, so it is ~385px wide at a
1000px viewport and ~680px wide at 760px — a `@media` query gets that exactly
backwards, the same wrong-column-width trap as the Village route's own cards.
`.iw-vs-scene` is a `container-type: inline-size` container (safe here: its
inline size is `width:100%` capped by `max-width`, so its contents never
influenced it) and the narrow rules are `@container iw-village (max-width:470px)`.
Only the frame's own padding stays viewport-keyed.

**At half height the captions HAVE to leave the flow, and that is what pays
for the bigger icons.** Curtis asked (2026-09) for the scene half as tall with
larger building art, and those two are in direct conflict while a caption sits
below its sprite: at H=290 a plot costs `sprite + ~45px`, the top and bottom
rows then meet in the same column, and the arithmetic caps the icons at ~66px —
SMALLER than they were at twice the height. Overlaid, a plot's footprint is
exactly its art, so 130px fits (up from 100). Do not "tidy" the captions back
into flow without redoing that arithmetic. They are legible over the art
because `.iw-vs-scene strong/.iw-vs-status` already carry a double text-shadow
and the isometric buildings put their plainest pixels — the base and its ground
shadow — exactly where the caption lands. The same halving is why the HOUSE art
went 190px to a 52% share: the home is not enlarged (Curtis excluded it), but
it cannot stay at 190 in a 290px box that also holds a bottom-centre plot.

**The house and the bottom-centre plot share the centre column**, so whether
they collide depends on the scene's height at the current width, and nothing in
the cascade says they overlap. The reported symptom was "Housing tier 5" drawn
across the bottom-centre building's spire. Two things keep them apart and both
are load-bearing: the house is anchored to the TOP edge (not centred), so the
pair are measured from the same direction; and its height is a PERCENTAGE of
the scene, so they scale together — a fixed-px house clears the plot at one
height and sits on it at the next. Note also that a plot's width drives how far
its NAME wraps, which grows the footprint as the scene NARROWS — the opposite
of what `aspect-ratio` does, which is why that was tried and rejected. The
house's box is 40% wide, not 44%, purely so its caption cannot touch the top
corner plots' boxes. `tests/village-scene-layout.test.mjs` measures the real
rects at six widths in a real browser; retune the scene height and the house's
height share together, never one alone. Both of its negative controls are
verified: drop `width:100%` and the scene measures 2px; take the house's height
share to 75% and it overlaps plots 3 and 5.

`tests/flush-quiescence.test.mjs`'s fixture carries a Skill Actions panel and
stubs `/api/player` specifically so the scene MOUNTS there — it is the skin's
own subtree, rewritten from a signature, so it is the shape most able to drive
itself, and a quiescence check with nothing to be quiet about passes for the
wrong reason.

**An element's own background paints BEFORE its negative-z children, so a
`::before` ground at `z-index: -1` COVERS the element's background image.** The
Village medallion wants two layers: a lit ground plot underneath and the
building sprite on top. The obvious arrangement — sprite as the element's own
`background-image` (the AtlasService division of labour), ground on a
`::before { inset: 0; z-index: -1 }` — renders every plot EMPTY, and
`getComputedStyle` reports a perfectly correct `background-image` the whole
time, so it reads as a broken asset path rather than a paint-order bug.
`isolation: isolate` does not help: it makes the element a stacking context,
which is exactly what keeps the negative-z child above the element's own
background. The fix is to swap them — the ELEMENT is the ground, the `::before`
is the sprite — and a pseudo-element cannot be written to from JS, so
`VillagePanels.ensureArt` sets a CUSTOM PROPERTY (`--iw-village-sprite`) that
the sheet dereferences, the way `SkillsArtService` already sets
`--fs-skills-panel-texture`. JS still owns the URL. `render-fixtures.mjs` reads
`getComputedStyle(el, '::before').backgroundImage` and DECODES it, because the
raw custom property is an un-evaluated token stream that looks fine either way
(the same trap as the `--iw-th-edge-mid` `color-mix` string above).

**A fixture that models the wrong COLUMN WIDTH lies like one that models the
wrong DOM shape.** Village's first render put its two panels side by side at
~900px each and the three-column slot card (art / copy / controls) looked
right. Live, the route is
`grid gap-3 xl:grid-cols-[minmax(320px,0.42fr)_minmax(0,0.58fr)]` and BOTH
panels are stacked in the left column, so a slot card is ~340-900px depending
on viewport — at the narrow end the fixed control column forced the building
name to wrap and the effect list to three lines. Two lessons kept: the fixture
now reproduces the 0.42fr column, and the card leaves the game's own head row
as the flex box React wrote (`justify-between`) instead of flattening it with
`display: contents`, so copy-vs-controls reflows the way the game intends.
`display: contents` survives ONLY in the ≤760px block, where it is doing real
work — promoting the head row's two children to grid items of the card so the
controls take their own full-width row and the copy column keeps ~65% of the
card instead of ~110px. `render-fixtures.mjs` measures that ratio at 390px;
revert the rule and it throws.

## The ledger (2026-09-16)

`VillageLedger.js`, the reading beside the picture: the home and every
installed building as a collapsible heading over its benefits, and an
**Overall stats** block under them.

**The scene knows WHAT is in the village; only items.json knows what it is
WORTH.** `/api/player?scope=core` gives a tier, a slot number, an `itemKey` and
a name — no effects anywhere. Every add-on building is an ITEM though
(`construction_building_tier_<N>`, category "Trade Good", 34 of them, audited
against the live table on 2026-09-16), carrying the same
`atk`/`def`/`xp_per_task`/`*_pct`/`skill_bonus_*` fields the inventory rows and
the hover card already read. So the join is `ItemDatabase.find({ id })` on the
key the snapshot already carries, and the derivation is the shared
`deriveDisplayStats()` — the same one the building's own tooltip uses, so one
building cannot be labelled two ways on one page. `normaliseVillage()` had to
start carrying that key: the RENDERED Village route never prints one, so for
that path it is reconstructed from the tier the name resolved to.

**Housing is not an item.** Nothing in items.json matches Camp / Cottage /
Villa / Manor / Citadel, so the home's benefits cannot be looked up, and the
honest answer is to print only what is actually known: the slot count (which is
arithmetic on `totalSlots`, a number the API does give) and the tail of the
Village route's own tier line, "Current tier: 4 • Base actions take 6s",
captured VERBATIM by `readHousingPerks()`. It is held beside the snapshot and
not in it, because the API refresh that replaces the snapshot five minutes
later carries no such line and would otherwise silently drop it — the same
family as the tab-swap bug above. A tier change invalidates it, because at that
point the printed interval belongs to the old house.

**Overall stats counts installed buildings only**, which is what was asked for
and also the only total this code can stand behind: it is the sum of the
per-item fields listed directly above it, so a reader can check it. Housing
contributes an action interval and slots, which are not the same currency as an
ATK. Skill levels sum PER SKILL ("Smithing +4" and "Mining +2", never a pooled
"+6"), because the pooled number is a stat the game does not have.

**The scene and the ledger WRAP rather than squeeze, and the wrap is the whole
responsive mechanism.** They are two flex items on one wrapping line inside
`.iw-vs-body`: 330 + 250 + 12 = 592, so a body content box at least that wide
holds both and anything narrower drops the ledger to its own full-width line.
There is no breakpoint to keep in step — the single `@container iw-village-frame
(min-width: 592px)` rule only caps the ledger's width, and it repeats the same
sum, so the cap can never apply to a wrapped ledger. Remove `flex-wrap` and at
390px the scene measures 198px with a 150px ledger jammed beside it; that is
the negative control, and it is verified. The query keys on the BODY and not on
the viewport for the reason everything else here does: measured live
(`claude/captures`), the frame is **1150px** wide at a 1188px root — the app is
single-column below its own 1280 breakpoint — and **681px** at a 1683px root,
where the dashboard's 0.42fr column finally splits. Wider viewport, narrower
frame.

**`.iw-vs-stage` is a COLUMN FLEX box on purpose, and that is not tidiness
either.** `.iw-vs-scene`'s `width:100%` only does anything in a flex column,
where its own `margin:auto` cancels the stretch — that is the collapse recorded
above. Wrapping the scene in a plain block to make it a flex item's child would
have left it filling the stage by ordinary block layout, `width:100%` inert,
and the layout test's oldest negative control passing no matter what. Made a
column flex box, the control still reproduces exactly: drop `width:100%` and
the scene measures 2px at every one of the six widths. Verified both ways.

**A second writer of `data-plot-state` broke a count, not a paint.** The
ledger's vacant rows first carried the scene's own `data-plot-state`, and
`tests/village-scene.test.mjs` counts `[data-plot-state="empty"]` inside the
frame: 2 became 4 and the test failed on a number, with nothing visibly wrong.
Same shared-attribute family as the teardown bug above, in its cheapest form.
The ledger's is `data-iw-vs-slot-state`.

**The collapse state is applied by a callback nothing else would drive.** The
open/closed choice is read from `chrome.storage` AFTER the ledger has rendered,
and it is carried by `data-iw-vs-open`, which is outside DOMWatcher's
`attributeFilter` — so it schedules no flush and no later pass will apply it.
`loadPreferences()` therefore re-applies to the entries it built. Delete that
one line and `tests/village-ledger.test.mjs` fails on "the late storage read
re-folds it"; live, every entry would silently reopen on each page load and the
panel would just look forgetful. The same reasoning puts an
`iw:item-db-updated` listener in `VillageScene.bindOnce()`: items.json lands on
its own clock, a settled dashboard mutates nothing, and without it the ledger
would sit on "Effects arrive with the item database" until the village itself
changed.

**Two levels of disclosure, one mechanism, and the thing the fold must LEAVE is
structural.** Curtis asked (2026-09-16) for the BUILDINGS list itself to fold,
down to the plot scene and Overall stats. What survives a fold is therefore not
a CSS nicety — `.iw-vs-totals` is a SIBLING of `.iw-vs-ledger-list`, never a
child, so no rule that hides the list can take the totals with it, and
`tests/village-ledger.test.mjs` asserts that relationship rather than a
rendered height. The heading survives too, for CollapsibleFrames' reason (rule
5): a list folded to nothing erases what it even was. Both levels go through
one `wire()`, so a click cannot mean two different things or be remembered two
different ways.

The section control is a 22px SQUARE, not a full-width plate like the entry
heads. `ui-system.css` paints every unclaimed `button` as a forged plate at
(0,4,1) `!important`, and the way to live with that rule is to design around it
rather than to out-specify it or to grow its `:not()` chain for a cosmetic
preference — a plate the width of the header row would give the section exactly
the weight of the entries inside it. A small square wearing the same plate reads
as a control, and matches what CollapsibleFrames' own panel toggle looks like.

The chevron rotation is scoped through `> .iw-vs-ledger-head` / `>
.iw-vs-entry-head`, not through the open state alone: a bare
`[data-iw-vs-open="0"] .iw-vs-chevron` also turns every entry chevron inside a
folded list, and those entries are not folded — they are hidden, and they come
back pointing the way the player left them. Negative control verified: delete
`[data-iw-village-ledger][data-iw-vs-open="0"] > .iw-vs-ledger-list
{ display:none }` and the layout test fails with "438.5px of list, display
flex" at every width.

**A rare stat needs a semantic hook, not a label-shaped selector.** Skill-level
gains are the ledger's mythic rows in both a building and Overall stats, but
styling `[text$="level"]` is not a CSS capability and re-parsing visible copy in
the DOM would make presentation depend on wording. `buildingBenefits()` and
`totalBenefits()` already know which rows come from `skill_bonus_*`, so they
carry `kind: "skill-level"` into `statList()`, which writes
`data-iw-vs-stat-kind="skill-level"`. The amber treatment keys only on that
marker; changing a label or adding another ordinary stat cannot accidentally
promote it.

**The collapsed ledger aligns by stretching the existing flex item, not by
guessing a height.** When BUILDINGS is folded beside the 290px scene, the
natural-height ledger used to end well above the scene. In the existing
`min-width:592px` container query — the same arithmetic that proves both items
are on one line — the closed ledger gets `align-self:stretch` and its Overall
stats card gets `flex:1`. That makes the card's bottom inherit the scene's
actual bottom at every side-by-side width. Wrapped ledgers stay natural-height;
a fixed `min-height` would leave dead space on those narrow layouts and drift
as soon as the scene height changes.
