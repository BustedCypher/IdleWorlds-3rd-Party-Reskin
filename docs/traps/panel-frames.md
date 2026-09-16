# Section frames and frame headings

Why the section frame keys on `.panel`, how nested columns are told from leaf panels, and the shared heading size.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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

### Frame headings and the Daily XP Boost (2026-09)

**Every expanded frame heading reads one token, `--iw-frame-title-size`
(18px, the Inventory title's size), set on `:root` in `ui-system.css`.**
Measured before: Inventory 18px, the activity panels' `clamp(17px, 1.8vw,
21px)`, the Village scene's own 16px, and 24px on every panel whose `<h2>` had
no size from the skin at all (the UA default; live, the game's Tailwind size).
`[data-iw-ui="section-title"]`, the activity-panel title, `inventory.css`'s
title and `.iw-vs-title` all read the token. The COLLAPSED bar keeps its own
fixed 14px title — that size is what makes every folded bar the same thin bar.
`tests/collapsible-frames.test.mjs` compares every heading with the Inventory
heading's computed size (not a literal); drop the token from the section-title
rule and it reports four panels at 24px.

**The Skill Actions "Daily XP Boost … +20% XP" line is framed like a MET
requirement cell** (the `.iw-skill-v2-body-row` recipe: faint edge, 2px
`#67ab83` rail, `#91cba4` ink). `UIFoundation.classifyDailyBoost` tags it
`data-iw-skill-boost="1"` — its own namespace — after section frames resolve,
scanning only the Skill Actions frame's HEADING ROW (the frame's direct child
holding the title), never the cards. It tags only while the copy names a real
bonus (`+N% XP`), so a "no boost today" wording is never painted as satisfied,
and it frames the boost line alone, not the "Resets in" timer beside it. Note
for the test: a block whose text wraps fills its available width, so "the
frame hugs its text" is only measurable on one line.
