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

**A fixture that models the wrong DOM shape lies exactly like a missing
stylesheet.** The skills fixture placed `nav-group` inside the *content* zone;
no live panel does — live wraps the nav pair and the action control in one
command cell. The CSS therefore grew `position:absolute` + `translateY(26px)`
hacks that looked right in the fixture and skewed every real panel. The fixture
now renders both live shapes (with nav, and the bare-button cell).
