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
  at 6). `DOMWatcher.detectSkillType` returns `'unknown'` early for quest
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
  DOM — see the note below. Anchored by `findAnchor()` to the `.panel` holding
  the `<h2>Skill Actions</h2>` and inserted with `target.after(frame)`, so
  nothing is reparented (rule 2) and the panel that followed Actions still
  follows the scene. Every node inside is the extension's own and is marked
  `data-iw-village-scene-owned` — its OWN namespace, deliberately not
  VillagePanels' `data-iw-village-owned`; see the collision note below.
  `src/styles/village-scene.css` is concatenated into the `ui-system` injection
  (no new sheet — the smoke test pins the count at 7).
- `src/modules/CollapsibleFrames.js` — per-panel collapse on every parent
  frame (Skills, Inventory, Quests, Village, World Bosses, Current Action,
  Action Log, World Chat, Zone Control and the Village scene). The World Boss
  "Possible Rewards" disclosure is a `<details>` because those nodes are the
  skin's own; a route panel's contents are React's, so wrapping them would
  reparent game nodes (rule 2). Here the skin instead APPENDS a small chevron
  button into the panel's heading row and writes `data-iw-collapsed="1"` on the
  card, and `src/styles/collapsible.css` (concatenated onto the `ui-system`
  injection) hides `> *` except the heading row and the control. Choices persist
  in one `chrome.storage` key, `iw-collapsed-frames`. See the traps below.
- `src/modules/PanelOrder.js` — the player's own panel arrangement, remembered
  in `chrome.storage` under `iw-panel-order`. Nothing moves in the DOM: the
  module writes `data-iw-order="N"` on each panel and `src/styles/panel-order.css`
  (concatenated onto the `ui-system` injection — the sheet count is pinned at 7
  in three places) turns it into a flex/grid `order`. Rearranging is an explicit
  MODE, flagged on `<html>` and entered from the skin's own nav item beside the
  Toolkit link; only inside it does each panel gain an appended full-panel
  `<button>` grab surface, which takes both arrow keys and a pointer drag. See
  the traps below.
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

**A style SHORTHAND and its own LONGHAND in the same inline-style map is a
perpetual motion machine.** This is the single worst performance bug the
project has had, and it presented as "the whole skin is laggy" with no trigger.
`READOUT_STYLES` and `INGR_STYLES` each listed `'background': 'none'` together
with `'background-color': 'transparent'`. Applied in order, the CSSOM
serialises the declaration two different ways in turn:

    setProperty('background', 'none')          -> style="background: none"
    setProperty('background-color','transparent') -> style="background: none transparent"

Writing the shorthand resets the longhand to initial and the attribute
collapses back to `none`; writing the longhand expands it again. **Both are
real attribute changes**, so both produce a mutation record — and `DOMWatcher`
observes `attributeFilter` (EIGHT entries, see below), so
each one queues the owning `.compact-panel` (via `queueContext`'s
`nearest(el, SEL_SKILL_PANEL)`), which reconciles on the next frame, which
writes again. The skin drove ITSELF at animation-frame rate forever.

Measured with the page's own timers stopped — no game mutation at all — a
12-panel fixture still produced **601 flushes, 7,212 skill reconciles and
21,636 style writes per 5 seconds**, and held the main thread at 40%
(1,600 nodes) to 92% (13,000 nodes) busy. Per tick: 100ms -> 3ms after the fix
at small scale, 223ms -> 11ms at 13k nodes.

What makes this class of bug invisible to every other suite here: the END
STATE is correct. Computed `background-color`/`background-image` are identical
either way (verified before/after: `rgba(0,0,0,0) | none`, and all 1,094
skin-marked nodes classify byte-identically). Only the COST differs, so a test
has to assert cost. `tests/flush-quiescence.test.mjs` does exactly that — it
stops every mutation source and requires the skin to go silent — and its
negative control is verified: put `background-color` back and it reports 480
flushes instead of 0.

Rules that follow:

- **Never list a longhand of a shorthand you also set** in `READOUT_STYLES`,
  `INGR_STYLES`, `BUTTON_STYLES`, `FORGE`, `ACTION_ART` or any future map.
  `background` already resets `background-color`/`-image` to initial, so the
  longhands were pure redundancy. (`border` + `border-radius` is fine —
  `border-radius` is not a longhand of `border`.)
- **Chrome does NOT emit a mutation record for a same-value `setProperty`**
  (measured: 100 identical writes -> 0 records; 100 alternating -> 100). So a
  style write is only a flush trigger when the value genuinely changes. That
  cuts both ways: it is why a stable skin costs nothing, and why any oscillating
  pair costs everything.
- **`InlineStyleOwner.set()` has no no-op path.** Every call runs six CSSOM
  reads plus an unconditional `setProperty`. That is what turns one
  disagreeing declaration into a permanent loop rather than one wasted write.
  If another oscillation is ever found, the durable fix is a
  "value and priority already match" early return in `set()`; the map cleanup
  above only removes the current trigger.
- The diagnosis technique that found it, when a symptom is "generally slow":
  **stop every source of mutation and count flushes.** A quiescent page that
  keeps flushing is the skin driving itself, and the culprit is then one
  `MutationObserver` with `attributeOldValue: true` away — diff the old and new
  style attributes and print which (element, property) pairs keep changing.

**The same machine ran twice more, and the quiescence test could not see
either, because a COST test is only as good as the SHAPES on its page**
(reported 2026-09 as "scrolling stutters"; the page was in fact never idle).
Both are fixed in `SkillPanelRenderer.js`; both have verified negative controls
in `tests/flush-quiescence.test.mjs`, whose fixture now carries the shapes.

- **`renderPanel` tore down cards it had never decorated.** `.compact-panel` is
  the game's shared class, so every quest, boss, village and shop card arrives
  as a non-skill and got an unconditional `clearPanelChrome()`. That is a
  TEARDOWN: it strips the ~30 atlas custom properties, `data-iw-skills-ui-ready`
  and the appended nodes that **QuestPanelRenderer owns on the same node**,
  which Quest re-applies on the same flush, which this deletes on the next.
  Measured on a frozen page: **~400 apply/clear cycles a second from ONE quest
  card**, 44,352 style-attribute writes in 1.2s. This is the boss-card flash
  from the two-writers note below, in its expensive form — that fix narrowed a
  single `delete panel.dataset.iwUi` and left every other line of the teardown
  unconditional. The guard is now `if (ownsPanel(panel))`, which covers all of
  them at once. The fixture had no quest card at all, so the test read silence.

- **`textContent` is a REPLACE-ALL, so a same-value write is still a
  mutation.** `ensureSkillPresentation` assigned `.textContent` unconditionally
  on `.fs-skill-identity-percent` and `.fs-skill-base-exp`. Setting it removes
  the existing text node and inserts a new one, so it emits a **childList**
  record even when the string is byte-identical — measured: 2,376 writes in 3s,
  `identical=true` for every one. DOMWatcher queues the owning panel on
  childList, so the panel re-renders and writes again, forever. Use `setOwnText`
  (compare, then write). Note the asymmetry that hid this: a same-value
  `setProperty` emits NOTHING, which is why `fill.style.width` beside it is
  free, and why the module's `data-iw-*` writes are invisible too.

- **Counting `iw:dom-flush` alone cannot see this family.** A childList record
  queues through `queueContext(..., { background: false })`, so `pendingBgRoots`
  stays empty and **no `iw:dom-flush` is ever emitted**. Loop B ran at ~790
  skill reconciles a second with the flush counter reading **zero**. The test
  now also counts skill reconciles, inline-style writes and raw mutation
  records, so a loop that drives none of the first three still trips the last.

- **Why the fixture was blind, in detail** — both are the "a fixture that models
  the wrong DOM shape lies exactly like a missing stylesheet" trap: its skill
  card said `Base EXP: 1,387`, but `baseExpValue()` matches only the live
  `Base reward: +N … XP`, so the plaque was never created; and its title carried
  no VERB and its action button sat inside the content branch, so `action-title`
  never resolved, `distinctZones` saw two zones rather than three, and the card
  got no three-zone shell — so neither node under test existed. The test now
  ASSERTS that the quest cards and the plaques are present, because a quiescence
  check with nothing to be quiet about passes for the wrong reason.

- **One smoke check was passing BECAUSE of the loop.** "a disabled action keeps
  the desaturated frame" marked `#jewel-panel` and `#locked-panel` ready but
  kicked a flush only on the jewel one. DOMWatcher queues the panel nearest a
  mutation, so `#locked-panel` was never re-read — it was being re-rendered
  anyway, many times a second, by the loop. With the loop gone the test has to
  schedule the pass it depends on. Expect more of these: any check that relies
  on "something will re-render eventually" was living on this.

**The scrolling stall itself is NOT a performance bug, and the feeds keeping
it is a deliberate decision (Curtis, 2026-09).** `ui-system.css` gives
`[data-iw-panel-part="feed"]` `overflow-y: auto` with `max-height: 300px`
(Action Log) and `min(46vh, 430px)` (World Chat). Those are real nested scroll
containers in the middle of a ~28,000px document, so while the pointer is over
one the wheel scrolls the FEED and the page does not move until it bottoms out.
Measured per tick: the page advances 4 ticks, freezes for 7 while the log's
`scrollTop` climbs 0→647, advances 4, freezes for 9 while chat climbs 0→867,
then resumes — 16 of 30 ticks moved the page not at all. It is independent of
frame rate (identical at 16/32/64/120ms between ticks), so it is not lag; it is
standard nested-scroller behaviour, and it is why the report says "occasionally"
— it depends entirely on where the cursor happens to sit. **Do not "fix" this
by removing the caps**: it was offered and declined, because an uncapped
100-message World Chat dominates the panel stack. Also ruled out by measurement,
so do not re-investigate without new numbers: scroll anchoring (0px unattended
drift over 3s, and `overflow-anchor: none` changes nothing), `preventDefault`
(0 cancelled wheel events — the skin registers **no** wheel, touch or pointer
listener at all), duplicate listeners (31 total, all intended), and
`scroll-behavior: smooth` / `scroll-snap` (absent from the whole cascade).
`background-attachment: fixed` on `<body>` IS real paint cost — it cannot be
composited, so the viewport repaints every scroll frame (106 paints vs 21 over
50 ticks, verified on a bare page with no skin: 4 → 40) — but it does not
affect scroll distance, and the pinned vignette is deliberate (Curtis,
2026-09). The harness that produced all of the above is
`build-tools/.tmp-scroll/` (gitignored).

**A cache key must not contain live CONTENT the cached work does not depend
on.** Three separate classifiers here had the same defect, and it is the second
most expensive family of bug this project has had after the flush loop above.
The tell is always the same: an expensive resolution is correctly cached, and
the cache never hits.

- **`SkillPanelRenderer.structureSignature()` contained the ticking XP number.**
  The "Lv N - X% • 4,120 to go" readout is a genuine `<button>`, so it landed in
  the signature's `querySelectorAll('button')` sweep and its digits changed
  several times a second on an active skill. `annotateStructure()` therefore
  re-ran its entire structural walk every tick — `clearStructureRoles`, several
  `findBestText` passes, `textCandidates` sorted through `getComputedStyle`, and
  `findProgress` calling `getBoundingClientRect`, which forces layout. Measured
  with 12 panels ticking: 343ms of a 479ms profile, 109ms of it forced layout,
  all to re-derive roles that had not moved. Fixed by blanking digit runs
  (`structureText`) — every letter is still compared exactly, so Mine -> Fish, a
  relabel, an unlock or a new control all still invalidate. Do NOT weaken it
  further; the opposite failure (DOMWatcher's old text-LENGTH key, which could
  not see Mine -> Fish) is one line away.

- **`UIFoundation.classifyActivityPanels()` ran its whole-document label sweep
  BEFORE the cache check**, exactly like `findInventoryRoot` once did. Coverage
  here is keyed by SLUG and `ACTIVITY_PANELS` holds three, so once every slug
  has a valid entry the scan cannot produce anything the early return would not
  discard. The fast path is therefore provably equivalent, and it removed 185ms
  of a 386ms profile. While ANY slug is unresolved the full scan still runs —
  that is the route-swap case and the empty-resolution freeze lives there.

- **Four places each ran their own `h1,h2,h3,h4` sweep per classify pass**
  (`sectionFrameOrphanHeadings`, `bossHeadings`, `villageHeadings`, plus
  `panelHeading` re-querying per `.panel`, which walked the whole inventory
  subtree once per panel). `queueClassify()` runs every classifier inside ONE
  rAF callback and nothing any of them appends is a heading, so a single
  per-pass `headingIndex()` is exactly equivalent. If a classifier ever starts
  creating an `h1`-`h4`, this memo is where it breaks.

**Two perf changes were tried, MEASURED, and rejected — do not re-add them
without new numbers:**

- **An `InlineStyleOwner.set()` no-op fast path** (skip the write when the same
  request is already applied). It looks obviously right — `set()` costs six
  CSSOM round-trips plus a `setProperty` — but measured across a quiescent
  page, a 40-row re-render burst and 12 ticking skill panels it changed nothing
  (`set` is ~3ms of a ~480ms profile once the flush loop is gone). It also does
  NOT protect against the shorthand/longhand loop above: there each write
  genuinely changes the serialisation, so the guard correctly declines to skip.
  The protection for that is `tests/flush-quiescence.test.mjs`.
- **Gating `OverlayFramer.frameOverlays()`'s candidate sweep on a DOMWatcher
  "structure changed" epoch.** Its three attribute-SUBSTRING selectors cannot
  use Chrome's indexes so each walks the whole document (48ms of a 225ms
  profile at 13k nodes), but the gate bought only ~4% — an idle game streams
  chat and log rows, so the epoch moves on most flushes anyway — in exchange
  for making the module silently dependent on the observer having seen the
  change that opened the overlay, and for breaking direct invocation (which
  `tests/overlay-framer.test.mjs` caught immediately). A missed overlay is an
  unframed modal. Make the SELECTOR cheaper instead, if it is ever worth it.

**Panel-level chrome must not be classified once per ROW.**
`InventoryRenderer.renderRow()` called `classifyInventoryChrome(root)` on its
slow path, and that function sweeps the WHOLE panel — `button, a, [role=button]`,
`h1..h4`, and `span, div, p` — then discarded every match inside an item row with
a `closest()` walk. At a 600-row inventory that is ~1,200 buttons and ~4,800
text nodes swept per row, i.e. **O(rows^2)**: measured at 1.15s of a 2.9s
profile, the largest cost remaining after the loop above was fixed. Two fixes,
both kept:

- `classifyInventoryChromeOnce()` collapses the burst to one sweep per flush.
  DOMWatcher emits every queued `iw:inventory-row` for a flush synchronously
  from one task, so a `Set` drained on a `queueMicrotask` is exactly the right
  scope — it still re-runs next flush, which the LIVE filter-active derivation
  needs (rule 5: which tab is lit is the game's own state).
- `notInRow()` appends `:not(.compact-row *):not([class*="item-row"] *)` so
  Chrome's selector engine rejects row descendants itself, instead of matching
  them and then running one `closest()` per node in JS.

Do not move that call back inside the per-row path, and do not "simplify" the
sweeps back to unscoped selectors plus a `closest()` filter.


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

**The dashboard's panel containers all honour CSS `order`, and this was
MEASURED, not assumed.** Curtis ran `claude/probe-panel-layout.js` on the live
page (2026-09-11, captures kept in `claude/captures/`). The probe's self-test
moves a real panel and puts it back, at 1683px and at 1188px, and reported
`order` working with no `display` shim in both. What the capture pins:

- Every container that holds panels already computes to flex or grid. That was
  the one thing that could have killed the feature — the app stacks things with
  Tailwind `space-y-*` elsewhere, and `space-y-*` is MARGIN spacing on a BLOCK
  container where `order` is silently inert, which reads exactly like a broken
  CSS rule. `PanelOrder.honoursOrder()` still checks, because a future route
  may not be flex.
- The `.panel` IS the flex item in all 17 cases, so the attribute goes on the
  panel, not on a wrapper. `itemFor()` still resolves it rather than assuming.
- Wide (>=1280px) is TWO independent flex columns: left holds Skill Actions,
  Current Action, Action Log, World Chat and the skin's own Village scene;
  right holds Inventory, Quests, World Bosses. Narrow is ONE grid holding all
  of them.

**Cross-column drags are OUT, and the number is why.** `order` cannot reach
across two sibling subtrees, and the usual fix — `display: contents` on both
columns so the panels become items of the parent grid — makes them share that
grid's ROW tracks. Computed against Curtis's own measured panel heights, the
rows become `[1031, 202, 1039, 553]`: the page grows from 1,821px to 2,825px
and gains **1,004px of dead whitespace**, because a 1,031px Skill Actions sits
beside a 35px collapsed Inventory and the row stretches to the taller one. Two
independent columns is what the game's layout is FOR. If cross-column is ever
wanted, the cheap version is swapping the two columns wholesale — one `order`
value on each column wrapper, which are themselves grid items.

**A panel's identity key FLIPS as the skin classifies it, so `frameKey()` could
not be reused.** Measured in the same capture: Current Action reports
`panel:current-action` in the rendered copy and `title:current action` in the
hidden mirror, and Action Log — which ships no heading at all, its label being
a `<button>` — keys to `null` until `data-iw-panel` lands. For COLLAPSE that
costs nothing (an unknown panel just stays expanded); for ORDER it means one
panel owning two storage slots depending on timing. `PanelOrder.itemKey()`
therefore prefers the GAME's own durable hooks in a fixed order: the element id
(`#current-action-panel`), then a real `h1`-`h4`/`[role="heading"]` — pointedly
NOT `[data-iw-ui="section-title"]`, which is the skin's mark, appears late, and
on Action Log lands on a button — then `data-iw-panel`. A panel matching none
returns null, and `arrange()` redistributes only the KEYED items across the
slots THEY occupied, so an unkeyed panel keeps its place instead of being given
a position it cannot hold.

**Two failure modes here are both "the write landed and nothing applied it",
and both are consequences of `data-iw-*` being invisible to the observer.**
Neither produces an error, and the second silently discards the player's layout
on every page load:

- `moveItem()` persisted the preference and then threw in `describe()`, because
  the keyboard handler passes an ELEMENT where the pass passes a `{el, key}`
  row. Storage held the right arrangement and the page never repainted.
- `loadPreferences()` resolves AFTER the first pass has run with an empty map,
  and a resolved promise mutates nothing, so there may be no flush left to
  apply on. The load now re-runs the pass itself. Same reason `setRearrangeMode`
  calls it directly: the mode flag lives on `<html>`, outside `document.body`
  and so outside the observer's only root.

**MEASURED write costs under the LIVE `attributeFilter`** (real Chromium, 100
writes each, counted with `takeRecords()`):

    data-iw-*, changed or same value ........  0
    aria-grabbed ...........................   0
    a style write on <html> ................   0
    inline style, changed value ............ 100
    aria-pressed / data-state, SAME value .. 100
    class add, even an existing class ...... 100
    textContent, same value ................ 101

Note the asymmetry: a same-value `setProperty` emits nothing, but a same-value
`setAttribute` emits a record. The live filter is EIGHT entries, not the four
this file used to claim in three places:
`['class','style','disabled','aria-disabled','aria-pressed','aria-selected','aria-current','data-state']`
(`DOMWatcher.js:404`). So `aria-pressed`, `aria-selected`, `aria-current` and
`data-state` are flush triggers now — do not reach for any of them on a
skin-owned control, and never toggle a class during a drag.

**The drag moves the LAYOUT, not a ghost, and that is what makes it free.**
There is deliberately no element following the cursor. A ghost repositioned at
60fps is 60 changed inline-style writes a second, and each one emits a mutation
record that queues a classify pass AND a whole-document `OverlayFramer` sweep —
the sweep whose gating was already tried, measured and rejected. A drag here
rewrites the same `data-iw-order` attributes the keyboard path writes, which
cost nothing, so the panels reflow live under the pointer for free. Measured
end to end in `tests/panel-order.test.mjs`: a complete press-move-drop writes
**0 inline styles and 0 watched attributes**. The instrument's own sensitivity
is asserted beside it, because a counter reporting zero because it is broken
looks exactly like one reporting zero because there is nothing to see.

Four things about that drag are load-bearing:

- **The insertion index comes from geometry captured at drag START, never from
  live rects.** Re-measuring per frame is a feedback loop in the literal sense:
  the reflow this move causes changes the rects the next move reads, and the
  panel oscillates between two slots. Item heights do not change when their
  order does, so one `getBoundingClientRect` per item per drag stays true for
  the whole drag and replaces one per frame.
- **`setPointerCapture` removes the need for any document-level listener.**
  While capture is held the events retarget to the handle, so the drag follows
  the pointer off the panel and off the window without the skin adding a
  `pointermove` listener to the document. The skin still registers no wheel,
  touch or pointer listener anywhere outside rearrange mode.
- **`touch-action: none` on the handle is required**, or the browser claims the
  gesture for scrolling and a drag never starts on a phone — which is the
  single-column narrow layout, where dragging is most useful. The drag's own
  autoscroll (`EDGE_BAND`/`EDGE_SPEED`) replaces the browser's, and it is
  needed: the dashboard column measures ~1,800px on a real account, so a drag
  from bottom to top cannot be completed inside one viewport. That autoscroll
  is `window.scrollBy`, which is unaffected by the nested-scroller stall this
  file documents — that stall is WHEEL routing.
- **`decoratePanelOrder` must skip the dragging container.** A drag holds a
  PREVIEW that is not in preferences yet, so re-deriving that container's slots
  on any flush the game happens to emit snaps the panel back to where it
  started. `Escape` is the only way out of a captured-pointer drag and restores
  the starting order; `clearPanelOrder` ends an in-flight drag before removing
  the handle it is bound to.

The lifted treatment on the dragged panel is `filter` + `opacity`, NOT a
transform: a transform creates a containing block for fixed-position
descendants, which would move anything the game positions that way inside the
card. There is no FLIP animation for the reflow, and adding one would mean a
per-frame inline transform on every sibling — the exact cost the whole design
avoids.

**EVERY direct child of a claimed container must get a slot, or the ones that
do not will JUMP TO THE FRONT.** Reported live (Curtis, 2026-09) as "the new
village tab seems to be excluded from the moveable frames" — and it was worse
than exclusion. `discoverContainers` collected leaf `.panel`s only, but the
skin's own Village scene is a bare `<section class="iw-village-scene">` with no
`.panel` class (`VillageScene.js:211-215`), so it was never slotted and kept
`order: 0`. Slot 0 is a REAL slot, so it tied with whichever panel the player
put first and DOM order broke the tie — the scene was hoisted above Current
Action in a column the player never touched. The pass now slots every direct
child; only children that are or contain a frame get a grab surface.

Two rules follow, and both are about not inventing a second answer to a
question this codebase has already answered:

- **Movable is the same set CollapsibleFrames folds** (`FRAME` — the
  `section-frame` / `inventory-root` / `skills-section-frame` trio), plus the
  `.panel` primitive. A player who can collapse a frame expects to move it, and
  two different definitions of "a panel" is exactly how the Village scene fell
  out. `.panel` is tested FIRST and on its own, because `data-iw-ui` arrives
  only after the classifiers run and gating movability on it is the same
  late-state trap that made the identity key flip.
- **The page SHELL is told from a panel column by its own `<header>` child**,
  not by the `data-iw-ui` marks on the nav rail and zone bar. The shell holds
  `.panel`s too — the header, the nav rail and the zone bar all carry the class
  — so it looks exactly like a column until those marks land, and a container
  claimed in that window puts an order slot on the header. `:scope > header` is
  there from the first paint. Both `tests/smoke.test.mjs` and
  `tests/flush-quiescence.test.mjs` now model the live shape — chrome in the
  shell, panels in a column of their own — because a fixture that puts its
  panels directly in the shell makes the module correctly claim nothing, and
  every check about it then passes for the wrong reason.

**The drag preview and the committed result are the SAME function, or they
disagree whenever an unkeyed sibling sits between two keyed ones.** `arrange()`
puts unkeyed rows back at their own index, so applying a raw drag sequence
showed one thing and settled to another on the next pass. Both paths now derive
the key list and re-run `arrange()` over it (`applyArrangement`), so the preview
IS the settled answer by construction. Worked example of the divergence:
`[A, X, B]` with X unkeyed, drag B to the front — the raw sequence is
`[B, A, X]`, but re-deriving gives `[B, X, A]`, because X holds index 1.

**A panel the skin cannot NAME gets no grab surface at all.** Dragging one
looked like it worked and then silently reverted: the preview writes the slot
attributes directly, but `arrange()` redistributes only the KEYED items, so the
next pass put it back. An affordance that appears to work and then undoes
itself is worse than none, so an unkeyed panel is marked `data-iw-order-fixed`
and drawn as pinned instead. Live, three panels per capture came back unkeyed,
so this is not a hypothetical branch.

**Container discovery keys on `parentElement`, so `display: contents` on a
wrapper would break it** — the layout container and the DOM parent stop being
the same element. The live page does NOT do this (both mirror copies hold their
panels as direct children of the box that lays them out), so nothing here
handles it, and a fixture that models it is modelling a page that does not
exist. Worth knowing because `display: contents` IS used elsewhere in the skin,
on the Village slot head row.

**A same-value CLASS write is not free, the way a same-value style write is.**
Found by the drag cost test, in `TooltipEngine.hide()`, which is shipped code
unrelated to this feature: it called `classList.remove('is-open')`
unconditionally, and a same-value `classList` write emits a mutation record
(measured: 100 identical writes -> 100 records) where 100 identical
`style.setProperty` calls emit none. `class` is in the observer's
`attributeFilter`, so every time the pointer left a tooltip trigger with no
tooltip open — most of them — that queued a flush. It is guarded now. The two
`style` writes beside it were already no-ops by that same asymmetry, which is
why only the class one showed up.

**The appended grab handle needed TEN classifier exclusions, not the collapse
toggle's one.** This is the "an element the skin APPENDS into a game node
changes what every other classifier reads there" rule, and the list is longer
because the handle is a direct child of the PANEL rather than of the heading
row. `UIFoundation` now carries two constants — `SKIN_OWNED_CONTROL` and
`GAME_CONTROL` — used by `hasPanelBodyOutsideHeading`, `panelHostMatches`'s
action-log probe, `classifyPanelHeader`'s split test AND its `companion` walk,
`classifyCurrentAction`'s queue walk, `classifyActionLog`, and — the one that
would have bitten hardest — `classifyFeed`'s fallback, which takes the first
direct child with no input and no heading and would have handed the handle the
feed's `overflow-y:auto; max-height`. Plus `CompactButtons.kind()`,
`InventoryRenderer.NOT_IN_ROW`, and `:not([data-iw-order-handle])` on five
`base.css` chains and three `ui-system.css` ones. The handle is also
`position: absolute`, which is what keeps it invisible to
`SkillPanelRenderer.unexpectedFlowChild` — an in-flow child over 2x2 makes that
refuse the three-zone skill layout outright.

**A redundant opt-out is a declaration no test can show doing anything.** The
first version added `:not([data-iw-order-handle])` to `collapsible.css`'s fold
rule so a collapsed panel would keep its handle. The negative control then
reported that removing it changed nothing — `panel-order.css`'s own
`display: grid !important` at (0,4,1) already outranks the fold rule's (0,4,0).
The opt-out was reverted and `panel-order.css` OWNS the handle's visibility
outright, with the negative control breaking the thing that is actually
load-bearing (that rule's `!important`). This is the same shape as the three
DEAD declarations in `collapsible.css` found while measuring this: the collapse
toggle's `border-radius: 3px` and its single inset `box-shadow` are both
overridden by `base.css` generic button rules and have never painted, and
`tests/collapsible-frames.test.mjs` cannot see it because it only asserts the
nine toggles match EACH OTHER — and `base.css` wins uniformly on all nine.

**Two harness traps this feature exposed, both of the "passes for the wrong
reason" family:**

- **`browser.newPage()` is `browser.newContext().newPage()`**, so every page
  gets its own origin storage. A reload test built on it finds `localStorage`
  empty and reports the MODULE as broken. `tests/panel-order.test.mjs` holds one
  `context` for the whole run — and therefore has to clear storage through
  `page.addInitScript`, BEFORE the bundle runs. Clearing it after `goto` is too
  late: the module has already read the previous page's arrangement and applied
  it, so the next test starts from a layout it did not set.
- **A fixture whose columns are not really flex claims nothing**, and then every
  teardown and quiescence check about this module passes vacuously. The
  fixtures in `tests/smoke.test.mjs` and `tests/flush-quiescence.test.mjs` now
  carry an explicit `display:flex` on the panel column AND assert the module
  claimed it — verified: revert the style and "panels carry an arrangement slot"
  reports `n=0`. `flush-quiescence` then shows 0 flushes, 0 reconciles, 0 style
  writes and 0 mutation records with the order pass running on real panels.

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

**The section frame is triggered by `.panel`, NOT by heading copy.** This was
an allow-list of names for a long time, and coverage was therefore a per-route
chase: Village's three sub-panels ("Village Add-ons", "Housing Bank", "Village
NPCs") rendered completely bare, and so did everything on Market, Leaderboards
and Dungeon below the top-level card. **A name list cannot be completed from a
session** — the live app is anonymous Tailwind, nobody here can read its copy,
and each miss looks like a CSS bug rather than a classifier miss. `.panel` is
one of the four durable hooks the whole app ships (see the no-stable-hooks note
below), it wraps every real panel and nothing else, so `sectionFramePanels()`
now frames it directly. `SECTION_FRAME_NAMES` survives only as the fallback for
a named heading with **no `.panel` ancestor at all**; do not add names to it to
fix a missing frame — if a panel is bare, find out why its `.panel` was not
matched.

Consequences worth knowing:

- **A panel needs no heading.** `panelHeading()` returns null and the frame is
  still applied; only `data-iw-ui="section-title"` is skipped. A panel that
  gains its heading later (async route) re-resolves, because
  `sectionFrameResolutionValid` re-checks `!panelHeading(frame)` for exactly
  the null case.
- **Framing every `.panel` swept up surfaces other owners already dress**, and
  the section-frame `background` is `!important` in the LAST-injected sheet, so
  it does not layer over their art — it replaces it. `ownedElsewhere()` excludes
  three, all found the hard way: `<header>` (framing anything in there paints
  the forged ground over `HeaderRenderer`'s per-zone artwork — reported live as
  "removed the header graphics"), `[data-iw-ui="zone-bar"]` (its own `::before`
  scene), and `[data-iw-panel]` — **`classifyActivityPanels` also writes
  `section-frame`**, on hosts that ARE `.panel`s, so Current Action / Action Log
  / World Chat suddenly had two writers on one attribute. That is the boss-card
  flash again, in a nastier form: the two stale-clear loops delete each other's
  mark. Fixed three ways, all needed — activity panels now run BEFORE section
  frames in `discover()` so the marker exists to test; the exclusion is in the
  validity guard so a late-resolving activity host is released; and the
  stale-clear `continue`s on an owned node instead of stripping someone else's
  mark.
- **Modal cards must be excluded, and the tag alone is not enough.**
  OverlayFramer owns those (it draws on the border box only because they are
  their own scroll container). `inOverlay()` checks its
  `data-iw-overlay` tags *and* falls back to "inside a `position: fixed`
  layer", because OverlayFramer runs on the SAME `iw:dom-flush` — keying only
  on the tag leaves a one-flush window where a card takes both treatments, the
  two-writers-on-one-node flash the boss cards already taught us. The exclusion
  is in the validity guard too, or a card framed during that window would stay
  framed forever.
- Nesting is unchanged and still CSS's job (below).

**Panels nest inside layout columns.** The classifier marks
`data-iw-ui="section-frame"` on containers as well as panels — a `.panel` that
wraps other `.panel`s is a layout column. Frame the **leaf** only:
`:is(…):not(:has(:is(…)))`, and strip anything that matched a column. See
`tests/panel-frame-nesting.test.mjs`. Telling them apart is purely structural
now, which is what let the heading walk's "substantial" size heuristic go: an
async panel (Quests) that was empty at first classify used to fail it, and the
walk fell through to the multi-panel column, which the `:has()` rule then
stripped bare. `sectionFrameResolutionValid` still re-resolves any frame that
is not a `.panel` but contains one, for the orphan-heading fallback path.
`classifyActivityPanels` also matches a **non-heading leaf label** ("Action Log"
is not an `<h1–4>`), and both classifiers resolve which mirror copy is live via
`Viewport.preferRendered` — see the hidden-duplicate trap above for why that
must be rendered-state, not a class name.

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
zone bar, Current Action, Action Log, World Chat, World Boss, Market, Village
(Housing hero + Add-on slots + the install picker, illustrated with the game's
own building art — `VillagePanels`; plus the read-only Village scene the skin
ADDS to the dashboard — `VillageScene`), Leaderboards, Salvaging, Zone Control. NOT reached at all: **Equipment Window**
(`"Close equipment window"`, `"Open socket"`, `"Socketed"`, `"New slot — nothing
equipped"`, `"Nothing equipped in this slot"`, and critically `"Upgrade vs
equipped"` / `"Downgrade vs equipped"` — that comparison is STATE and rule 5
applies the moment the skin touches it), **Mailbox**, **Notifications**,
**Settings**, **Supporter Pack**, **Invite Friends**, **Profile**. The five
header utility buttons ARE skinned generically; the panels they open are not.
**Update (frames):** every route's panels — Village's sub-panels, Market's,
Leaderboards', and the **Dungeon** route (`"Leave Dungeon"`, `"⚔️ Raid
Dungeon"`, `"⏳ Prejoined"`), which nothing inside used to reach — now get the
forged frame, because the trigger moved from `SECTION_FRAME_NAMES` to the
`.panel` primitive (see the section-frame note above). That is the outer chrome
only: the CONTENTS of these panels are still un-classified, so anything above
that wants row/control treatment still needs its own classifier — except
Village's Housing and Add-ons panels, whose contents `VillagePanels` now owns.
Village's "Housing Bank" and "Village NPCs" panels are still frame-only.
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

**The Current Action bar's one-tick head start is fixed by a TRANSITION, not by
recomputing progress.** The game writes the fill's `width: N%` once per tick and
the value it writes is the progress at the END of the tick that just started, so
the bar renders a staircase whose first step is already a whole tick in ("it
starts at 1s elapsed, not 0s"). A LINEAR transition on
`[data-iw-panel-part="progress"] > *` whose duration EQUALS the tick does not
merely soften that staircase, it cancels the offset exactly: at tick k the game
sets `(k+1)/T`, the transition runs from the previous target `k/T` to `(k+1)/T`
over one tick, so the width shown at time t is `k/T + (t-k)/T = t/T` — the true
elapsed fraction at every instant. The skin therefore never computes or writes a
progress value; the action's duration (housing tier and the rest) stays entirely
the game's, which is also rule 5. Three things this depends on:

- **The duration must be the real update interval.** Guess it long and the bar
  lags every step; guess it short and it completes early and stalls. So
  `UIFoundation.smoothActionProgress()` measures the interval between actual
  width WRITES (median of five, ignoring flushes where the width did not
  change) and writes it CONTINUOUSLY — as an inline `--iw-progress-duration`
  custom property on the track, not a snap to one of a few fixed buckets — with
  a `PROGRESS_LEAD_BIAS` (1.12x) baked in. The bias exists because a duration
  that matches the measured tick EXACTLY still visibly stutters: real per-tick
  timing jitters around its nominal value (live capture: a "250ms" tick
  actually landed anywhere from 208-335ms), so an exact-match transition
  finishes early roughly half the time and the bar sits dead-still for the
  remainder before the next real update arrives. Overshooting slightly means
  the transition is almost always still in flight when that update lands, so
  the browser smoothly RETARGETS it — continuous velocity change, no
  positional jump or pause — and it never compounds, because every real update
  still snaps the target to the server's own value; any instant the bar is
  fractionally behind self-corrects at the very next tick. `--iw-action-tick`
  in `base.css` is only the pre-measurement fallback, used before a panel has
  the 3 samples `commitProgressDuration()` needs. `claude/probe-action-progress.js`
  is the read-only capture that reports the live tick, the step size, the
  derived action duration and whether the head start is really one whole step.
- **The completion reset is not a tick.** Once per action the width drops back
  to the start of the next repetition; interpolating THAT slides the bar
  backwards across a whole tick over an action already running.
  `smoothActionProgress` tags the drop `data-iw-progress-reset` (released on the
  next frame, not the next flush — a whole tick of suppression would un-smooth
  the new action's first step) and the CSS snaps instead.
- **The reset tag rides on `data-iw-*`; the duration deliberately does NOT.**
  DOMWatcher observes with the eight-entry `attributeFilter` below, so a
  `data-iw-*` write is
  invisible to it (that's why `data-iw-progress-reset` is one) but a `style`
  write is not: `commitProgressDuration()` writing `--iw-progress-duration`
  inline DOES queue an `attr:style` context on that node every time the
  duration actually moves. That was a real reason the earlier bucketed design
  avoided any inline write at all, and it is still true here — the difference
  is what the induced re-entrant `smoothActionProgress()` call does: it reads
  the SAME `pct` as before and returns immediately via the epsilon guard, so
  the extra flush is bounded to one harmless pass through classifiers that are
  already on their cached fast path (the flush-path caching work elsewhere in
  this file), not a new category of cost or a loop. `PROGRESS_DURATION_EPSILON_MS`
  (15ms) additionally skips the write on ordinary jitter around a stable rate,
  so most ticks of a settled action cause no extra flush at all.

`base.css` already carries a blanket `* { transition: none !important }` under
`prefers-reduced-motion`, but `ui-system.css` is injected LAST and its selector
is more specific, so the opt-out has to be restated there.

**A completion's OWN first tick is a second anomaly the measurement must not
learn from either.** `claude/probe-action-progress.js` against a real session
(2026-09) confirmed the design above — steady tick and step size agreed with
the derived action duration to within measurement noise, and the value written
right after a reset really did sit ~one step above a linear back-extrapolation
of the surrounding ticks. But it also turned up something the design didn't
anticipate: the gap between the reset write and the FIRST write of the new
action was consistently ~2x the steady tick (~500ms against a steady 250ms),
across every single completion in the capture. `smoothActionProgress` used to
compute that delta the same as any other and push it straight into the
5-sample window feeding the bucket median — on a long action (many ticks per
cycle) enough clean samples buried it, but on a SHORT action (a fast, low
housing-tier action, few ticks per cycle) that one polluted sample can be half
the window, and the median swings to the wrong bucket right as the action
resumes — exactly the moment getting it right matters most. Worked out by hand
(a 5-entry median seeded with the poisoned delta) and reproduced in
`tests/smoke.test.mjs`: three cycles of [reset, poison tick, steady tick]
flips the unfixed algorithm to the wrong bucket right after the third cycle's
poison tick, before that cycle's own steady tick can correct it. The fix is
`state.afterReset`: set on a reset, it excludes exactly the ONE delta that
spans the reset (the delta AFTER that one is a real interval again, so
`state.at` still advances through it). Note for anyone re-measuring this test:
the fixture's OTHER Current Action panel (`current-action-no-queue-progress`)
had to be used, not the first one, because the drift/relabel test earlier in
this file deletes that first panel's `dataset.iwPanel` to simulate a React
remount and — a known, separate limitation of `classifyActivityPanels`'s
coverage tracking, which is keyed by panel SLUG rather than by host — never
gets it back, since some OTHER host already satisfies the 'current-action'
slug. Real wall-clock intervals in that test are scaled to ~1s/2s rather than
the true 250ms/500ms, specifically so this harness's own flush/rAF latency
(tens to low hundreds of ms, confirmed by a failed first attempt at this test)
cannot be mistaken for the signal under test.

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
through the same `border-image … 95 88 / 34px 32px / 0 stretch`. Its slice
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

**The zone label is GAME-ROUTE ONLY, so the zone has to be REMEMBERED.** Both
consumers — `applyZoneSurface` (header artwork) and `applyZoneTheme` (the whole
`--iw-th-*` palette on `<html>`) — read it from the `data-iw-ui="zone-title"`
label, which lives in the zone bar, which only the Game route mounts. Reading it
fresh every flush therefore returned null the moment the player opened Market,
Village, Leaderboards or Dungeon: the header fell back to the generic
`header_surface.webp` and `<html>` was reset to `data-iw-zone-theme="default"`,
so **every tab except Game rendered un-themed** while Game looked right — which
reports as "the theme doesn't work on the other pages", not as a zone-resolution
bug, and it hid behind the fact that the Game route always looked correct.
`currentZoneNumber()` now keeps the last value it actually read
(`lastZoneNumber`): the player's zone is game state and does not change because
they opened a tab. `clearHeaderRenderer()` resets it, so the kill switch leaves
nothing behind. Pinned across all four routes in
`tests/route-swap-reclassify.test.mjs` — drop the cache and eight checks fail
with `theme=default` plus the fallback surface.

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
theme: `assets/skills-ui/theme_<name>.webp` (a high-density remaster with the
SAME logical 860x463 canvas and cell positions as `skills_ui_atlas.webp`, so
`skills_ui_index.json` and the sprite-window audit still describe it) and
`assets/skills-ui/panel_corners_<name>.webp` (the corner_filigree cell baked
into the same logical 176x190 crop-and-mirror sheet `make-panel-corners.mjs` produces,
because `border-image` slices a standalone image and cannot address an atlas
cell). Physical dimensions are multiplied by the map's `pixelRatio` (currently
2), while CSS continues to use the logical dimensions. It also regenerates
`src/modules/zoneThemes.js` — DO NOT hand-edit that
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
- **Logical geometry is frozen at 860x463.** A theme atlas that isn't pixel-identical
  in layout to `skills_ui_atlas.webp` silently repaints every sprite window
  onto the wrong region (CLAUDE.md, "Atlas sprites are sized in percentages").
  The import tool hard-fails unless the source's physical dimensions equal
  `index.width * pixelRatio` by `index.height * pixelRatio`.
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
green, and `--hd-teal*` zone-control team colour. The ground gets a
faint additive `--iw-th-ground-wash` layer (prepended to the `background:`
shorthand; `transparent` un-themed = no-op).

**The INNER frames are a derived scale, not nine more hand-picked rows.** The
"near-neutral structural darks read fine untinted" call above was wrong at page
scale: `--iw-th-edge` themed the panel's OUTER 1px frame while every box inside
it — the feed, the queue, the progress track, tooltip section rules, the nav
rail, the skill/inventory control plates — stayed brass-brown, so a glacial or
voidborn zone rendered a blue panel full of brown boxes. `base.css` now carries
a three-step scale under the accent layer, `--iw-th-edge-mid` (inner box frame)
/ `-soft` (recessed plate, rail, column rule) / `-faint` (hairline divider,
control plate edge), and ~45 literal hexes across the five injected sheets read
it. Details that matter:

- The nine palettes declare **only** `--iw-th-edge`; ONE
  `:root[data-iw-zone-theme]` block (bare attribute, no name) derives the whole
  scale from it with `color-mix(… , var(--iw-ink-850))`, so a palette added
  later inherits the frames for free. Custom properties resolve lazily, so
  source order against the palette blocks is irrelevant — both are `(0,1,1)`
  and they never declare the same token.
- The `:root` defaults are the exact stock hexes, so a zone that has not
  classified yet still draws the brass frame it always did.
- `--iw-line` / `--iw-line-hi` are re-pointed in that same block **on purpose**:
  `base.css` feeds them to the game's own Tailwind tokens (`--border`,
  `--panel-border`, `--surface-border`, `--sidebar-border`), so this is what
  carries the zone colour into every edge the skin never classified.
- `SkillPanelRenderer.FORGE` writes the skill control plate INLINE with
  `!important`, which no stylesheet can override — its `border` / `liveBorder`
  are therefore `var(--iw-th-edge-faint, …)` / `var(--iw-th-brass, …)` strings.
  An inline `var()` still resolves against the cascade, so the `<html>` attribute
  reaches it. The CSS mirror (`--fs-forge-line`) and the `render-fixtures.mjs`
  copy must move with it — all three, as ever.

Verification: `render-fixtures.mjs` now cycles all nine palettes on `<html>`,
asserts each one actually re-points the tokens (not a silent fall-through) and
that accent text keeps ≥3:1 on the ground, and writes `fixtures/themes.png`.
`tests/zone-themes.test.mjs` pins that every theme has a `:root[data-…]` block
defining the core tokens, plus the derived frame block. `tests/smoke.test.mjs`
still pins the `<html>` attribute + teardown from phase 1.

**Two check-shaped traps this layer produced, both the "a check that cannot
fail" family:**

- **A computed custom property is the un-evaluated token stream.** Reading
  `getComputedStyle(html).getPropertyValue('--iw-th-edge-mid')` returns the
  literal `color-mix(in srgb, #123C48 66%, #10100D)` TEXT, not a colour — an
  unregistered custom property is not resolved at computed-value time. That
  string differs per theme, so a distinctness check on it passes even when the
  expression is malformed and paints nothing. `render-fixtures.mjs` therefore
  paints the tokens onto a probe's four `border-*-color`s and reads those back,
  which always resolve to a real colour.
- **`/--iw-th-edge\b/` also matches `--iw-th-edge-soft`** — `-` is a word
  boundary — so the "every derived token is a function of `--iw-th-edge`" count
  stayed above its floor with a token pinned back to a literal, and the negative
  control passed when it should have failed. The test matches
  `/var\(--iw-th-edge\)/` exactly.

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
step `letter-spacing` adds after the LAST letter. State is not lost — the word
itself is the cue (QUEUED vs PREJOIN), and `data-iw-boss-action-state` still
tags the control. `tests/boss-action-label.test.mjs` pins it in a real browser
by diffing the button against itself with only the `::after` colour cleared,
which isolates the WORD's ink from the frame art (and so still measures the
reported symptom if a future ornament returns out of flow); restore the gap and
it reports +2.5px, restore the glyph +8.25px, both +12.9px. Note the diff is
what makes the test independent of the atlas loading — see the next trap.

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

**The Toolkit link and the per-panel collapse toggle are the only controls the
skin ADDS rather than decorates**, and
it is deliberately not an exception to rule 1: rule 1 forbids changing what a
GAME control does, and this is the skin's own element, appended (rule 2) as the
nav track's last child by `UIFoundation.ensureToolkitLink`. Four things keep it
out of the classifier's way, and each is load-bearing:

- **It wears `data-iw-ui="nav-tab"`**, so the rail's plate, height and type come
  from whichever nav rule is winning (`header.css`'s block and `ui-system.css`'s
  disagree on padding and font-size; only injection order settles it). Copying
  measurements into a private rule instead would drift the moment either block
  moves. Only the SEPARATION is its own: `[data-iw-nav-link="toolkit"]`, placed
  after the nav block in the last-injected sheet.
- **`data-iw-nav-link` is its own namespace** and only this module writes it --
  the give-a-new-role-on-a-shared-node-its-own-attribute rule.
- **"toolkit" is deliberately absent from `NAV_LABELS`.** If it were in the set,
  `countNavTabsIn` would count it, `mainNavResolutionValid` would see the rail
  gain a tab from the skin's OWN append, and the cache would invalidate into a
  whole-document re-resolve on every flush. It is also why `applyMainNavState`
  never iterates it, so it can never be painted active.
- **Every attribute is set before insertion**, so the append costs exactly one
  mutation record on the flush that creates it and nothing after -- the
  `querySelector(':scope > …')` guard is what keeps `tests/flush-quiescence`
  at 0.

`box-sizing: border-box` is not decoration: `nav-tab` sets an explicit `height`
with `border: 0`, so this box's own 1px border made it 2px taller than its
neighbours (measured in the fixture, `heightMatch` 2 -> 0). It opens in a new
tab because the game is an idle game and navigating away in place costs the
player the session they are watching. Pinned in `tests/smoke.test.mjs`
(presence, exactly-once, never a route tab, href/target/rel, removal at
teardown); all three checks have verified negative controls.

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
styles or it renders a control the game never shows. Same reason `ACTION_ART`
(the command button's quest-rail sprite, above) lives in `styleButton()` rather
than in the sheet, and the fixture's `ACTION_INLINE` carries a third copy.

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
