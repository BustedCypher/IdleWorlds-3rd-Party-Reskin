# Fixture and render-harness traps

Ways a fixture or harness has passed for the wrong reason. See also "Verification discipline" in CLAUDE.md.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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

**A fixture that boots the bundle must set the hydration latch, or it is
testing a skin that has not started yet.** `HydrationGate` holds the first
boot until `src/page/hydration-signal.js` - a MAIN-world content script no
fixture runs - writes `data-iw-page-hydrated` on `<html>`, and otherwise waits
out its 4s timeout. When the gate landed (2026-09-16) every harness that boots
the bundle lost exactly that race: `smoke`, `ingredient-entries`,
`viewport-swap` and `flush-quiescence` (whose 4s settle ended before boot, so
boot's own first pass landed inside its "must be silent" window) failed, and
every suite that still passed paid ~4s per boot - the whole run dropped from
278s to 183s once the fixtures set the latch. Put `data-iw-page-hydrated="1"`
on the fixture's `<html>`, or set it before evaluating the bundle, as the live
page's signal would. `tests/hydration-gate.test.mjs` pins both halves of the
protocol, and `tests/extension-e2e.test.mjs` is the only suite that runs the
real manifest - both content scripts, in their real worlds.

**Indented fixture markup puts separators into `textContent` that React never
ships.** Whitespace between tags becomes text nodes, so a flattened
`textContent` reads "…XP Turn In Skip" in a fixture and "…XPTurn InSkip" live.
`QuestPanelRenderer.isQuestCard`'s prefilter used `\bturn\s*in\b`, which the
join defeats, and every quest fixture here was indented - so it passed
everywhere except on whitespace-free markup (found 2026-09-17 by the extension
e2e fixture, pinned by `tests/quest-card-detection.test.mjs`). When a module
parses a flattened blob, give its fixture whitespace-free markup too.

**A fixture that models the wrong DOM shape lies exactly like a missing
stylesheet.** The skills fixture placed `nav-group` inside the *content* zone;
no live panel does — live wraps the nav pair and the action control in one
command cell. The CSS therefore grew `position:absolute` + `translateY(26px)`
hacks that looked right in the fixture and skewed every real panel. The fixture
now renders both live shapes (with nav, and the bare-button cell).
