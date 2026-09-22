# Header chrome and main nav

The glass status plates, the nav rail and its classifier, the Toolkit link, zone-bar label matching, and the merged header-chrome frame.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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

### Compact header chrome (nav rail, announcement, zone bar — 2026-09)

**The nav rail is a `.panel` too, and on the live page its tabs sit DIRECTLY
inside that `.panel` — so the nav TRACK and the section FRAME are one node, and
both classifiers write `data-iw-ui` on it.** The first compaction keyed its CSS
on `:has([data-iw-ui="main-nav"])`, every fixture wrapped the tabs in a `<nav>`
(track and frame separate), all of them passed, and the live page did not
change at all. A read-only probe (`claude/probe-header-chrome.js`) reported
`navExists: false`: nothing live carried `main-nav`. Reproduced by
`claude/probe-nav-shape.mjs`: in the flat shape `classifyMainNav` wrote
`main-nav`, `classifySectionFrames` (later in `discover()`) overwrote it,
`mainNavResolutionValid` saw its role gone and re-resolved — a whole-document
button sweep — on the next flush, and round again: **20 role flips in 1.2s**.
The boss-card two-writers trap, hiding behind a frame that looked correct.

- **The nav yields.** `mainNavResolutionValid` accepts `section-frame` on the
  track/shell (`NAV_TRACK_ROLES`), because the frame is the right paint for that
  node; `setNavRole` never writes over `section-frame`. They are separate
  guards with separate failures: the validity change is what stops the
  per-flush re-resolve, and the guard is what stops a re-resolve (a tab that
  unlocks, a breakpoint crossing) from stripping the frame for one flush and
  invalidating the frame cache.
- **Anything that finds the rail keys on `nav-tab`, not `main-nav`.** The rail
  CSS in `ui-system.css`, `PanelOrder.isReorderable` (removed with that feature, 2026-09-15), and `classifyZoneBar`'s
  host-walk stop all carry it. The tabs are the one role on that rail nobody
  else writes.
- **Padding is re-pointed through the token, and the rail has NO corner
  flourish**: the shared `::after` carries `:not(:has([data-iw-ui="nav-tab"]))`
  and nothing redraws it. A half-scale (17x16) corner was tried first and was
  too small to read (Curtis, 2026-09).
- **`HeaderRenderer.findAnnouncement` still starts from `main-nav`, so on the
  live page the announcement strip is NOT classified** and keeps the game's own
  styling (the green completion banner). Deliberately left: that slot shows
  whatever message the game sends, and classifying it paints every message
  teal — a success and a failure would look the same (rule 5). Its compact
  metrics only apply to a page where the nav is wrapped.

`tests/header-compact.test.mjs` renders BOTH shapes. Its verified negative
controls: key the CSS on `main-nav` again and the flat shape reads 86px with the
34px corner back (the reported symptom); make validity demand `main-nav` and a
settled nav sweeps the document on all 8 flushes; drop the guard and a late
tab's re-resolve flips the role twice. Note the flat fixture needs the game's
own row layout (`gap: 12px`, measured off the live screenshot) — without it the
tabs stack and the rail reads 206px, a fixture lie rather than a CSS bug.

**`ui-system.css` is injected LAST, so a property two sheets both declare
resolves there regardless of which one a later edit touches.** `header.css`'s
own `[data-iw-ui="zone-action"]` rule set `font-size`/`letter-spacing`/`color`
that `ui-system.css`'s rule for the same selector was silently winning over —
those header.css declarations were dead weight. Kept the two sheets' numbers
IN STEP instead of removing the "losing" one, with a comment at each site,
because the alternative (one sheet owns a property, forever) is one more thing
to remember while editing either file.

**A flex item's margin does not collapse the way a block's does — an
unstyled `<p>` inside a row-flex wrapper still carries its UA ~1em top/bottom
margin, and it does NOT show up in a `getComputedStyle` read of the text
itself.** The zone bar's title+target row measured 55px tall for two lines of
~20px text before this was found; `getBoundingClientRect` on the wrapper was
what caught it, not any property read on the paragraphs. `margin: 0` on both
lines is what collapses it to the true 42px. Same shape as this file's
`place-items: center` traps: the property everyone reads (font-size, line-
height, computed color) was fine the whole time; the culprit was a UA default
nobody had reason to suspect on a `<p>` that used to just sit in normal flow.

**`min-height` measures the CONTENT box unless `box-sizing: border-box` is
set, so a "34px" floor with 10px of padding and a 1px border rendered at
46px.** The announcement strip's `min-height` is `border-box` for exactly this
reason — the token is meant to mean the box a reader sees, not the box before
its own padding is added back on top.

**`build-tools/render-fixtures.mjs` never modeled these three surfaces
representatively — the nav-tab/zone-action swatches it carried were hand-
tagged demo rows, not the classified `.panel`/`zone-shell` shape the live page
actually produces**, so a change here could pass every existing fixture check
while silently doing nothing to what's on screen. It now carries a `.panel`-
wrapped nav frame (`.fx-nav-frame`) and a real `zone-shell` (`.fx-zone-bar`,
title + target + action buttons as siblings, same as `tests/smoke.test.mjs`'s
DOM), each with its own screenshot and a `getBoundingClientRect` readout
logged to the console — which is what caught both bugs above. Measured: nav
rail ~86px → 46px, zone bar 70px → 42px (announcement 50px → 32px where it is classified).

### One header-chrome frame (nav + announcement + zone bar, 2026-09)

**Curtis's concept art puts all three in one frame**: the zone title, target
and the game's announcement on top, then a divider, then the nav tabs with
ZONES / PREVIOUS / NEXT at the right. They are three DOM SIBLINGS of the page
shell (`header`, nav `.panel`, announcement, zone bar `.panel`, then the panel
columns — live capture 2026-09-11), and the zone actions live INSIDE the zone
bar, so no amount of styling the three boxes can put those buttons on the nav
row. Rule 2 rules out moving them. The merge is therefore done on the SHELL:

- `HeaderChrome.js` tags `shell`, `nav` (the shell child holding a
  `nav-tab`, which covers the flat, wrapped and bare-`<nav>` shapes),
  `notice` (the one element between nav and zone bar, if any), `zone-bar`,
  and the bar's two branches `zone-text` / `zone-actions`.
- `ui-system.css` makes the shell a grid and the zone bar `display: contents`,
  so its branches become grid items of the SHELL and are placed independently
  (row 2: text | notice, row 3: nav | actions). The frame is the shell's own
  `::before` spanning rows 2-3 and the divider its `::after` — a grid
  container's pseudo-elements are real grid items, so the frame needs no
  appended node. Below 860px it stacks into one column.
- The 12px rhythm outside the frame comes back as margins
  (`> header` and `[data-iw-chrome="zone-bar"] ~ *`), because `row-gap`
  cannot differ per track. The sibling combinator still works on a
  `display: contents` node: it reads DOM order, not boxes.

**It REFUSES any shape it cannot place** — a third zone-bar child, two nodes
between nav and zone bar, a `.panel` or 260+ characters as the notice, a shell
without a `:scope > header` — and clears every mark, leaving the three compact
boxes this replaced. An unknown child in a merged grid would be auto-placed on
top of something. If the live page stops merging, the refusal is the first
suspect: ask for a `claude/probe-header-chrome.js` capture of the zone bar's
children rather than loosening it.

**The nav rail had to be opted out of the shared frame, and that alone was
not enough.** It keeps `data-iw-ui="section-frame"` (so
`mainNavResolutionValid` is untouched), and the shared frame rule and its
hairline now carry `:not([data-iw-chrome="nav"])`. But that removes only the
SKIN's paint — the game's own `.panel` ground and padding then drew a second
plate inside the frame, which no computed check on the skin rule shows. The
chrome block resets both on the nav. The notice keeps the game's own
styling, deliberately: it shows whatever message the game sends (rule 5).

**The title's emoji starts on the first tab's left edge** (Curtis, 2026-09),
through one `--iw-chrome-inset` token on both rows. The zone-text margin had to
be `!important` at (0,2,0): header.css's
`[data-iw-header="zone-shell"] > :has([data-iw-ui="zone-title"])` pins that
branch's margin to `0 !important` at (0,2,0), so a plain attribute rule lost
and the title sat 14px left of the tabs with the margin declared correctly.
The shared frame's `@media (max-width: 1024px)` padding rule needed the same
`:not([data-iw-chrome="nav"])` opt-out as the base rule, or the nav got 12px of
padding back on narrow screens only.

**"who's here?" is a text link, not a control.** `classifyZoneBar` tags any
bar button that does not sit with the zone actions `data-iw-zone-link` (its own
namespace; the "left alone" smoke check still holds). It opts out of
ui-system.css's generic plate chains and base.css's hairline, and header.css's
dim `zone-title ~ *` target rule opts it out by name — that rule is
`color: … !important`, so as the title's SIBLING the link would otherwise lose
the game's own colour (rule 5).

`tests/header-compact.test.mjs` checks both nav shapes, 800px stacking,
refusal, and a notice leaving and returning. Its negative controls are
verified: drop `display: contents` and rows A/B split by 50-100px; drop the
refusal and a third child merges with 6 marks and a 0px zone bar; drop the nav
opt-out and the nav reads a 1px border of its own. `flush-quiescence` asserts
the chrome is merged in its fixture — it was NOT at first, because that
fixture's `<nav>` had three tabs and nav classification needs four, so the
module correctly refused and the silence was about nothing.

### Unread alert on the utility column (2026-09-22)

Players missed new mail and game events. The game's only signal is an 8px
count pill on a dim icon, rendered as a `span.absolute.rounded-full`
(`bg-ember`) DIRECTLY inside the button and **only while the count is above
0** — read from the game's bundle, the same markup on Mailbox, the bell and the
bell's menu variant. Its presence is therefore the unread state, and
`header.css` §4d keys on it with `:has(> span.absolute.rounded-full)`: a lit
ember plate, a breathing inner glow and a rippling ring, with no JS, no
attribute and nothing to tear down. The pill keeps the game's count
(rule 5) — but not its COLOUR: `bg-ember` follows the zone theme, and Curtis
wants the alert identical everywhere, so it is pinned to a red fill with a
white number (a white 2px outline was tried and read as too much). It grows to 10px type and becomes a forced 16px circle centred
on the button's top-right corner (Curtis: inside the corner it covered the
icon, and live it rendered square). The -6px offset fits only because the
column bleeds 8px into the header's 16px top padding — the header root is
`overflow: hidden`, so a bigger offset gets clipped; the test checks both. The pulse animates only `transform`/`opacity` on the two
pseudo-elements; reduced motion keeps the lit state without movement. If the
game ever changes the pill's classes, this goes silent rather than wrong —
`tests/header-compact.test.mjs` carries the real classes and checks that only
the pill-bearing button pulses and that removing the pill stops it.
