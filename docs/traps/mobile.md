# Mobile layout

Phone and tablet widths. The first full pass is the mobile audit of
2026-09-15; the skill card's phone layout has its own note at the top of
[skill-card-v2.md](skill-card-v2.md).

## The audit harness

`node claude/audit-mobile.mjs [--widths 360,390,430,768] [--probe "<js>" | --probe-file <path>]`
renders ONE live-shaped dashboard with the shipped bundle and the game's own
deployed stylesheet (fetched from idleworlds.com once, cached in gitignored
`tmp/iw-app.css`, never committed), then writes `tmp/mobile-audit/report.md`,
`report.json`, a full-page PNG per width, a PNG per panel, the merged header
chrome band and the first skill card. It reports overflow, clipped text, text
escaping its panel, control/text overlap, WCAG 2.5.8 hit areas under 24px,
text under 10.5px, and panel gutters, plus per-card zone geometry. `--probe`
evaluates any expression on the rendered page at each width, which is how every
number below was taken.

It is a FIXTURE, and it lied three times in its first hour - the same trap the
rest of `docs/traps/` keeps recording:

- **Header.** The first header was the smoke test's loose shape; it rendered
  the crest centred over the name and measured 416px. The live shape (from
  `build-tools/render-fixtures.mjs`, with its `data-iw-header` marks removed so
  the skin must classify it) measures 334px with the crest beside the profile.
- **World Boss cards.** One div holding every line left the action button
  without `data-iw-boss-role`, so the card showed a 60px empty band that does
  not exist live. The live shape (from `tests/world-boss-panels.test.mjs`)
  has no band - and exposed the badge overflow below instead.
- **Inventory rows** are still the smoke test's shape (no space in
  "Iron SwordLv 3"); do not tune row layout against them.

Its own instrument traps, now handled: text inside an ellipsis line reports
its full unclipped Range width; the merged zone bar is `display: contents`
and has no box to escape; a pseudo-element hit extension counts as part of its
button only if the button neither clips overflow nor has a `clip-path`.

## Single-row menus, and no Toolkit on a phone (2026-09-15/16)

Curtis asked for every menu row to stay ONE row on phones and tablets (the nav
rail and the inventory filter tabs first) and for the Rearrange feature to go.
The Toolkit link first MOVED to the left end of the zone action row on phones;
a day later that row read as too crowded, so on a phone the link is simply
hidden (`@media (max-width: 767px)`) and the three zone controls have the row
to themselves. The rail is therefore always five route tabs on a phone, which
is also why its formula needs no route-dependent branch.
`tests/menu-rows.test.mjs` sweeps 320-1100px on a Game-route page and 360/390
on a page with no zone bar; its three negative controls are listed in its
header.

- **The type is FITTED, not the tabs squeezed.** Below 1280px each row is a size
  container, and its tabs' font is `(100cqi - fixed) / k` clamped to a floor
  and the desktop size. `k` is each label set's width per pixel of font,
  MEASURED in the real face (render at 100px, divide by 100); `fixed` is
  paddings, gaps and anything else of fixed width. Leaving flex-shrink to do it
  instead clips labels, and not evenly: shrink is proportional to size, so the
  WIDEST label absorbs the whole shortfall.
- **Count every fixed pixel.** The filter formula first left out the tabs'
  1px plate borders (ten pixels across five tabs) and "Consumables" clipped at
  320px while every other width passed. The nav tabs have no border.
- **Smallest sizes:** at 320px the nav is 7.6px and the filters 7.9px; at 360px
  9.3px and 9.9px; full size from ~414px (nav) and ~375px (filters). A label
  the game renames or adds changes `k` - re-measure rather than widening the
  clamp.
- **The link is HIDDEN on a phone, not un-built.** It stays one guarded append
  in the rail (`ensureToolkitLink`), because a page can cross back over 768px
  without a reload. Hiding it also keeps the rail's five-tab formula true on
  every route - the zone bar is Game-route only, so anything keyed on the zone
  row would have differed on Market, Village and the rest.
- **What the retired zone-row copy taught, in case it ever returns:** it must
  not wear `data-iw-ui="nav-tab"`, because `classifyZoneBar` stops its host
  walk at any candidate containing a nav tab and the bar would never resolve
  again; and the rail copy could only be hidden while the zone copy existed,
  since the zone bar is Game-route only.
- **The zone row needs no rule of its own.** Its three controls are header.css's
  `flex: 1 1 0` with `min-width: 0` and a 6px gap, so they cannot overflow and
  already share the whole row: a `flex-wrap: nowrap` here measured
  byte-identical with and without (88/88/88 at 320px, 101/101/101 at 360px) and
  was removed rather than left as a declaration no test can show doing anything.
- **Count rows by vertical OVERLAP, not by distinct `top`.** At 320-360px
  "Previous Zone" wraps to two lines, so that button is taller and a centred
  row gives it a different top while it is still on the same line - which read
  as "two rows" and failed a check the layout had not broken.
- **A crash is not a failure.** The test first waited for the (then) zone copy
  with a hard timeout, so a control that removed it crashed the suite instead
  of failing a named check; every wait for an element that a control may delete
  is best-effort now.

## Findings that were real, and why

- **Skill material overflow was invisible to the old audit (2026-09-21).**
  `overflow: visible` is not evidence that text fits. A 9-digit have/need pair
  such as `218,014,373/221,276,974` painted up to ~24px outside its material
  cell at ordinary 375-768px viewports while scroll/clipping checks stayed
  green. The dedicated `skill-card-responsive.test.mjs` measures Range paint
  rectangles against every cell across 27 widths. Counts now split at the slash
  so they can wrap only between owned and required values, never through a
  number. A follow-up corrected the initial 680px full-width switch: it made
  zoomed desktop cards spill their detail frame beneath the identity and command
  rails. Detail frames now stay in the centre rail above 480px and use the
  full-width row only in the true phone layout.
- **Wrapped nav rows (<=560px) - SUPERSEDED the next day by the single-row
  rail above.** The Toolkit link kept `flex: 0 0 auto` and a 7px detaching
  margin, so in a wrapped rail it started 7px right of the row edge and its row
  justified differently (Rearrange took 298px of row two at 430px).
- **Stacked chrome rows (<=860px).** The notice and the zone action row were
  `justify-self: start`, and the action row ALSO lost to header.css's
  `[data-iw-header="zone-shell"] > :not(:has([data-iw-ui="zone-title"]))`
  `margin-left: auto !important` at (0,2,0). An auto margin disables stretch,
  so the row stayed right-aligned at content width however `justify-self` was
  set - the same (0,2,0) fight the zone title's margin already documents. The
  fix matches it: `[data-iw-chrome="shell"] [data-iw-chrome="zone-actions"]`
  with an `!important` margin. At 390px "Previous Zone" then fits one line.
- **Boss difficulty badge.** The title block was `max-content max-content`,
  which cannot shrink; on a phone the badge overflowed its block and the card.
  BOTH tracks need `minmax(0, max-content)`: the buff line spans both, and a
  spanning item's extra size goes to tracks with an INTRINSIC minimum first, so
  with only the title at 0 the badge's track absorbed it and SOLO drew 146px
  wide on desktop. `tests/boss-action-label.test.mjs` checks the badge against
  its title BLOCK (on that page the card is wider than live, so a card-edge
  check passed the broken CSS).
- **Inventory ornament.** Centred on the rule, it reaches 31px above its
  anchor; once the panel is under ~506px the title-left/tools-right header puts
  the Filter and Search buttons on top of it. Below 560px it is scaled in
  proportion and anchored lower, clearing the tools by ~2.5px and the list by
  ~4.5px at the same panel height.
- **Activity panel headings.** A `@media (max-width: 640px)` rule set the
  header row to `align-items: flex-start`, so on phones Current Action's title
  sat 4.7px above its controls and the collapse toggle. It is gone; all three
  headings share one centre line at every width.
- **Text floors.** Phone blocks shrank labels below their desktop size: Zone
  Control factions 9 -> 7px and meter labels 10 -> 8px, quest percentage and
  kicker to 8.5px, skill material names to 9px. Raised to 8.5/9/9.5/10px; a
  faction name that no longer fits wraps inside its own cell. Village scene
  captions were left at 9px because that scene's arithmetic is tested at six
  widths.
- **Touch targets (`pointer: coarse` only).** The collapse toggle keeps its 22px
  look and gains a 5px invisible `::before` hit extension (the head's 8px gap
  to the game's controls leaves 3px). The recipe arrows could NOT do that - each
  arrow clips its paint with `overflow: hidden` and a polygon `clip-path`, and
  clipping clips hit testing - so `--iw-skill-v2-nav-h` goes 22 -> 26px, which
  the command stack's buffer, centring and band floor all follow.

## Known and not fixed

- **World Boss "Respawns" line under the participation button, tablet and
  desktop.** Both are placed in grid row 3, column 2; the respawn text starts
  at x 286 of the card while the button ends at x 300 (768px and 1100px, live
  card shape from the world-boss test). Not phone-specific, and the button's
  label length decides it, so confirm on the live page before changing it.
- **No-shell skill card on a phone.** Its title column is ~58px at 390px; see
  skill-card-v2.md.
- **Two panel paddings.** Activity panels use 16/14px and section frames
  20/16px on phones - the same deliberate family split as desktop.

## Negative-control hygiene on this repo (Windows)

`sed -i` in Git Bash rewrote a CRLF stylesheet to LF, and a `cp` restore once
failed with "Permission denied" (a transient lock), leaving a control applied
to the source. `tmp/control.mjs` (gitignored scratch) does the replace in
memory, writes with Node so line endings survive, runs the command, restores
the original bytes and verifies them. Recreate it before running controls
rather than reaching for `sed -i`.
