# Performance: flush loops, write cost and caching

How the skin has driven its own MutationObserver, what each kind of write costs, and how classifier work is cached.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

## Self-driving flush loops and what a write costs

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

## The scrolling stall (a deliberate decision, not a bug)

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

## Caching classifier work

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

### Performance: flush-path caching (fixed 2026-08-27)

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
