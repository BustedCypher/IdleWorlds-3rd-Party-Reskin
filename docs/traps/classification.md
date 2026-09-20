# Classification and ownership

Cascade order, shared nodes, the hidden duplicate column, the live app's lack of hooks, and rule-5 state signals.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

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

**Contained popups need OWNER classification, not merely popup z-index
(2026-09-21).** A child `z-index: 999` cannot outrank a later sibling when its
ancestor has already created a lower stacking context. The Inventory Filters
menu is the concrete case: every direct child of the forged Inventory frame is
z=1, so the menu's native z-30 is trapped inside the earlier tool/header child
while the later z=1 list paints over it. `OverlayFramer` therefore owns two
markers as one reversible unit: `data-iw-overlay="popup"` on the positively
classified positioned popup and `data-iw-overlay-host="1"` on the closest
DIRECT child under its framed ancestor. CSS lifts the host first, then the
popup. Never reparent a React-owned popup to `body` to escape a stacking
context; that changes ownership, event relationships and positioning.

Classification prefers actual popup semantics (`role=menu|listbox|dialog` or
a matching expanded `aria-controls`). The deployed Inventory popup currently
publishes none of those, so one captured structural fallback is allowed:
`button[aria-label/title="Filter inventory"]` and a visible positioned sibling
with multiple interactive controls inside the same anchor. An ordinary
absolute child, a hidden copy and `.iw-tip` are explicit negative controls.
The owner marker must be removed as soon as the popup closes, otherwise a
settled page retains a bogus high stacking context.

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

**Two items the skin puts in ONE grid cell paint in DOM order, and the later
one swallows the earlier one's clicks — including across padding that looks
empty.** Reported 2026-09-16 as "World Boss Participation works on mobile, on
desktop it does nothing". Nothing was wrong with the control or its handler.
The boss card's grid deliberately shares cell (2, 3) between the game's
participation link and its `status` row (the respawn / protection timer), with
`status` stretched across the cell and `padding-left: 155px` so the timer
prints to the right of the link. `status` is the LATER child, and
`[data-iw-boss="card"] > *` gives both the same `z-index: 1`, so the stretched
wrapper painted over the link end to end; `elementFromPoint` on the link's own
box returned the wrapper at every width from 761px up. The `@media (max-width:
760px)` block moves `status` onto its own row, which is the whole of "but it
works on my phone" — a viewport-shaped symptom with no viewport-shaped cause.

Two declarations fix it and BOTH are needed: `status` takes
`pointer-events: none` with `> * { pointer-events: auto }` so its gutter stops
intercepting while its own content stays live, and the link is lifted to
`z-index: 2` because the 155px gutter is a fixed number while the widest label
the game puts in that slot ("… players currently fighting world boss") is wider
than it, which would leave the link's tail dead under the timer paragraph.
Painted output is byte-identical before and after (screenshot hashes at 1440,
800 and 390px) — only hit testing changed.

**Superseded the same day: the shared cell was the bug, not its stacking.**
The line above about the link being "wider than" the gutter was the tell. With
the live fighting label ("28 players currently fighting world boss", ~300px)
the HP readout started at 155px and PAINTED over the link's tail — reported as
"the Boss HP overlaps the participants text on desktop". The card grid is now
`104px auto minmax(0, 1fr)`: the link owns the `auto` column, `status` the
`1fr` column, header and progress span `2 / -1`. Separate cells cannot overlap,
so the `pointer-events` / `z-index` workaround is gone. The `auto` track is
sized by the link alone because an item spanning a flexible (`fr`) track does
not contribute to sizing the non-flexible tracks it crosses. The phone block
(≤ 760px) is untouched and measured identical: every card descendant's box at
760, 430, 390 and 360px matches the old CSS. The general lesson: a fixed
gutter sized for one label is a latent overlap for every longer label the game
can put there — give each item its own track instead.

Lessons that generalise past this card:

- A control the skin never touched can still be broken BY the skin's layout.
  Rule 1 is about effect, not about which node you wrote to.
- A grid/flex ITEM honours a numeric `z-index` while still `position: static`.
  That is what makes the lift work here, and it is also what made the first
  attempt at a negative control useless: reverting the fix with `z-index: 1`
  instead of `z-index: auto` still floated the link and reproduced nothing.
- When a bug is reported as "works on mobile, not on desktop", suspect a
  breakpoint that *removes* an overlap rather than one that creates a bug.
- Measure it with `elementFromPoint` on the control's own box at three points
  (both ends and the middle): a link whose tail alone is buried is still
  broken, and a centre-only probe would have called the gutter fix done.
  `tests/boss-participation-hit.test.mjs` pins all of this and runs its own
  negative control.
