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
