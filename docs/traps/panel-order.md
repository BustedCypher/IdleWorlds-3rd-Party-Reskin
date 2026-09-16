# Panel order (rearrange mode) - RETIRED

**Removed on 2026-09-15 (Curtis: deprecated).** `PanelOrder.js`,
`panel-order.css`, `tests/panel-order.test.mjs` and the Rearrange/Reset nav
controls are gone, and `tests/smoke.test.mjs` asserts nothing the feature wrote
is on the page. What remains on purpose: the `:not([data-iw-order-handle])`
exclusions in `base.css` and `ui-system.css` selector chains, which match
nothing but carry specificity that later rules may be tuned against. A player
who had an arrangement still has an inert `iw-panel-order` key in
`chrome.storage`; nothing reads it. The notes below describe the feature as it
was and are kept for their lessons (write costs, zero-cost drag, classifier
exclusions, harness traps).

`PanelOrder.js`: CSS `order` on live-measured flex/grid columns, identity keys, the zero-cost drag, and its harness traps.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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
