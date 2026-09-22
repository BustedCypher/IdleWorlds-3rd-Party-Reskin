# Skill Card V2

`SkillCardDesignController.js`, `skillcard-v2.css` and
`skillcard-v2-runtime-safe.css`: the only skill card design.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

## Status (checked against `src/` on 2026-09-15)

The original notes described five successive designs in one run of text, so
older paragraphs contradicted newer ones. They are now grouped by whether they
still describe the code:

- **One design, one state.** `enhanceSkillCardV2` always writes
  `data-iw-skill-v2-state="expanded"`. There is no tab strip, no collapse
  toggle, no collapsed material summary and no line-break node;
  `removeRetiredNodes()` deletes any of those an older build left in the page.
- The centre info frame shows `FRAME_SECTIONS` (materials, sources, details)
  in order, and unmet requirements go on the foot row (`syncRequirementNote`).
- **Guards from retired designs are still load-bearing**:
  `neutraliseIngredients` skips `[data-iw-skill-v2-summary]`,
  `[data-iw-skill-v2-body]` and `[data-iw-skill-v2-controls]`
  (`SkillPanelRenderer.js` ~702); `unexpectedFlowChild` skips
  `[data-iw-skill-v2-row]` (~1140). Section 4 explains why.
- Numbers in sections 3 and 5 (card heights, a 22x20 pager, a 78x66 button, the
  22x21 / 15x14 card corners) predate the current tokens. The card corner is now
  `17px 16px` (`skillcard-v2.css` ~79).

## 1. Current design (newest pass)

**Detail content stays in the centre rail until the phone breakpoint
(layout correction, 2026-09-21).** A short-lived responsive rule put `body`
and `tabs` on full-card rows at 680px. At raised browser zoom the otherwise
desktop-shaped card crossed that CSS-pixel breakpoint, so its resource frame
escaped beneath both the identity and command rails. The shell now preserves
the reference's centre-column containment above 480px. Only the true phone
layout at `max-width: 480px` uses full-card detail rows, where the centre rail
cannot hold the material-cell floor.

The same screenshots exposed a second blind spot: the old overflow audit
ignored text whose CSS declared `overflow: visible`. A value such as
`218,014,373/221,276,974` therefore painted 10-24px into the next material
cell while every existing check stayed green. `ensureDetailBody()` now splits
the skin-owned COUNT into owned and required spans without changing the visible
N/M text. CSS keeps each half unbroken but may wrap BETWEEN them, at the slash
boundary. The material name can wrap independently, so no number is clipped or
broken at arbitrary digits.

`tests/skill-card-responsive.test.mjs` is the regression for this entire
contract. It sweeps 27 widths from 1024px to 320px with four stress cards,
including 9-digit counts, six materials, a bonus level, long requirements,
both pager branches and paired one-vs-six-material CONTENT-branch cards. At
every width it checks painted text rectangles rather than only scrollWidth,
title/BASE versus command collisions, body/note/card containment, one-line
action labels above their button frames, a 6-10px button-to-pager gap, centre-
column detail containment above 480px, and full-width detail rows at or below
480px. A touch context at 390px and 768px also verifies the
coarse-pointer pager target stays at least 24px high. Do not replace this with
a handful of named-device breakpoints; the card responds to its own container
because browser chrome, zoom and embedding widths differ across users.

**The phone card is one top band plus full-width rows (mobile audit,
2026-09-15).** Under a 480px card (`@container iw-skill-card (max-width:
480px)`, i.e. every phone) the three columns narrow to 92px hero / name / 76px
commands and form ONE top band; the BASE chip goes under the name, and the info
frame and the requirement note become full-width rows beneath the band. The
block it replaced (`max-width: 390px`) still stacked the card for the retired
tabbed design, and `claude/audit-mobile.mjs` measured what that did at a 390px
viewport: the content-branch arrows landed on the title (y 72-94 against a
title spanning 34-89), the button floated in a 146px command row, a bare button
sat on the requirement note, and cards were 270-315px against 124-179px now.

- **Everything the command group is placed from has to be the BAND, not the
  card.** The commands zone spans only row 1 (and is already relative); a bare
  button is a grid item of the relative shell, so it is placed against its grid
  area, row 1; and the content zone becomes `position: relative` so a
  content-branch pager resolves against row 1 too, reaching one command column
  to its right. Row 1's floor is `cmd-stack + 20px` in the row template.
- **`grid-column: auto` on the content-branch pager is load-bearing.** The
  content zone is a grid, and an absolutely positioned grid CHILD that keeps
  the zone's `> * { grid-column: 1 / -1 }` is placed against those grid lines -
  the padding-inset box - so `right` was measured from one gutter inside the
  zone and the pair sat 10px left of the command column. Auto placement uses
  the padding edge. Found by listing every matching rule's insets rather than
  guessing; the computed `left` read 150px because a positioned box reports its
  USED inset.
- **The no-shell shape keeps its desktop column widths.** There the card is both
  the grid and the container, so neither a token nor a template can change from
  a container query; its children take the same band-then-rows order through
  explicit grid lines, and the title column is only ~58px at a 390px viewport.
  The live chunk ships the shell, so this is defensive; do not "fix" it with a
  viewport unit.

`tests/skill-card-system.test.mjs` checks the band at 440px (frame is a
full-width row under it, BASE under the name, button and arrows right of the
name column), the group centred on the HERO COLUMN at every width (the hero
spans the whole card on a wide card, so that is the card's middle there), and
column shedding at 330px, the only width where a full-width frame runs out of
room for three cells. Controls verified: disable the phone block and the frame
and BASE checks fail; drop `grid-column: auto` and the arrows read 336 against a
346 column; put `repeat(3, 1fr)` back and the 330px cells read 82px.

**The card has ONE state now, and removing the collapse chevron is what let the
info frame exist (Curtis, 2026-09, from an edited reference).** Four changes
were asked for together — an info frame in the centre of each card whose
contents follow the active tab, no collapse arrow with the tabs always visible
and narrow at the foot of the card, the pager arrows drawn as clickable tabs
under the action button, and a slightly narrower action button. They are one
change, not four, because the first three all depend on there being no second
state to lay out. What each cost:

- **The shell grew a third row, and the frame is a row of the CENTRE column.**
  `grid-template-areas` is `"identity content commands" / "identity body
  commands" / "identity tabs commands"`, so the hero and command columns span
  all three rows while the frame and the strip stack inside the middle one.
  That is what puts the frame between the two dividers the reference draws
  without reparenting anything: `controlsHost()` still returns the SHELL, and
  the sheet does the placing. A row spanning all three columns — what the
  earlier expansion did — is the shape this replaced.

- **`ensureDetailBody()` builds the frame's rows from the active section's
  TEXT**, the same thing `SkillPanelRenderer` already does to turn the game's
  raw material line into `.fs-skill-ingredient-grid`. The native sections stay
  clipped in BOTH states now (never `display:none` — the renderer reads their
  real visibility); un-clipping the source as well rendered every section
  twice, once in the frame and once in its own place. A signature guard means
  `replaceChildren` runs only when the text actually changes.

- **The collapsed summary chip had to GO, not just hide.** It repeated a
  material line verbatim, matched `INGR_PATTERN`, and so became a second
  ingredient source — the flush loop that measured 213.5/156.6 alternating
  every frame. The info frame repeats the same text, so the
  `neutraliseIngredients` exclusion it needed is still load-bearing and
  `tests/skill-card-system.test.mjs` still guards it.

- **ONE gutter for the centre column, as a token.** The title, the BASE chip,
  the frame and the strip all start on the same vertical line only because
  `--iw-skill-v2-gutter` feeds the content zone's padding AND both shell rows'
  insets. Two literals that agree today drift the moment either is retuned,
  and the symptom is an 8px step that reads as a broken frame rather than as a
  padding disagreement.

- **The pager's whole box is TOKENS now, because the reference ties it to the
  button.** The two arrows are as wide as the action button and sit directly
  under it, so their width is a function of `--iw-skill-v2-btn-w` — which only
  the sheet knows. `styleButton()` writes the pager geometry inline with
  `!important` and no stylesheet can outrank that, so the literals became
  `var(--iw-skill-v2-nav-w, 39px)` / `-nav-h` / `-nav-radius` and the sheet
  steers them. Same lever as `--fs-motion-idle`: an inline `var()` still
  resolves against the cascade.

- **The command GROUP is centred on the card, and every part of it is out of
  flow** (Curtis, 2026-09, reported twice: "the arrow buttons are being hidden
  underneath the action button"). The mirrored action label, button, glyph and
  recipe arrows are placed from ONE anchor, the command column's vertical
  centre, with 4px between label and button and
  `--iw-skill-v2-cmd-buffer` (8px) between button and arrows:

      label   top: calc(50% - stack / 2)
      button  top: calc(50% - stack / 2 + label-h + label-gap)
      glyph   top: calc(button-top + (btn-h - glyph-size) / 2)
      arrows  top: calc(button-top + btn-h + buffer)

  where `--iw-skill-v2-cmd-stack` includes `label-h + label-gap + btn-h`, plus
  `buffer + nav-h` on a card that `:has()` a pager. Three earlier
  versions each broke on the live card in a way no fixture reproduced: an
  offset measured down from the button, then arrows anchored to the card's
  foot, both left the BUTTON in flex flow, and live it sat ~14px lower than in
  any fixture - some in-flow node the fixture does not model is above it. Out
  of flow, nothing in the column can move it. Things that hold this together:

  - **Both branches resolve 50% against a full-height box.** The commands zone
    spans all three shell rows and stays `position: relative` (the glyph is
    anchored to it); the content zone clears every containing-block source
    `contain`, `content-visibility`, `will-change`, and both shorthand and
    individual transforms), so a pager React ships there resolves against the
    card. Clearing only `position` / `transform` passed the fixtures but failed live on
    content-branch cards whose title zone carried a transform: their arrows
    jumped beside the title while command-branch and no-pager cards looked
    correct.
  - **A game wrapper must not become the containing block.** Any element
    inside a zone that holds the button or the pager is forced
    `position: static`, because a Tailwind `relative` wrapper would otherwise
    make `50%` resolve against a box with no height.
  - **The shell's floor is derived from the group**:
    `min-height: calc(var(--iw-skill-v2-cmd-stack) + 24px)`. The rule it
    replaced declared `min-height: 152px` and then `min-height: 0` in the SAME
    rule, so it had never done anything; cards were 152px only because the hero
    column happens to be that tall.

  `tests/skill-card-system.test.mjs` runs the group checks at 1100, the live
  width (745), 440 and 330: buffer between 6 and 10px, label 3-5px above the
  frame, group centre within 1.5px of the hero band's, and glyph centred inside
  its button. Controls verified: arrows
  back at the foot read a ~15px buffer and ~3px off centre; the button back in
  flow reads ~21px and ~6px.

- **The V2 card is the ONLY skill card design, and it has NO tabs** (Curtis,
  2026-09, in two steps). The old/new switch at the top of Skill Actions is gone
  along with the stored preference it wrote; `initSkillCardDesignController`
  just sets `html[data-iw-skill-card-design="new"]`, which every V2 rule still
  keys on for specificity, and removes any toggle an older build mounted in
  the same page session. The tabs went first to Materials / Sources / Details
  (Requirements, Queue and Rewards dropped) and then entirely: the frame now
  shows `FRAME_SECTIONS` - materials, then sources, then details - with no
  strip. Rewards repeated the BASE chip and Queue was not wanted. Every section
  is still MARKED by `markSections`, because that marking is what keeps the
  game's own lines clipped.

  - **A requirement appears only when it is NOT met**, in small type on the
    card's foot row under the frame. `syncRequirementNote` copies the lines
    whose `data-iw-req-state` is `unmet` - the game's own warm-class signal
    (rule 5: the skin never decides met or unmet itself). That state is
    re-read EVERY pass by `SkillPanelRenderer.syncRequirementState`, outside
    `annotateStructure`'s cache: read once inside it, a line the game turned
    red after the card's first pass stayed 'met', and the note only appeared
    once the player clicked or paged (Curtis, 2026-09-22). The cache key also
    flags whether a "Needs/Requires" line exists, and each walk resets the
    `textCandidates` memo, which had been serving the previous walk's nodes.
    `tests/skill-requirement-state.test.mjs` pins all of it. The foot row
    exists only while there is a note. The row is
    excluded by both `textCandidates` and `neutraliseIngredients`, so the
    copied "Requires ..." cannot become a second requirement or a second
    ingredient source.
  - **The centre column is one stack between two spacer rows**:
    `grid-template-rows: 1fr auto auto auto 1fr` around the title row, the
    frame and the foot row. With the spare height in the frame's own row
    instead, a card at its floor drew a one-material frame ~94px tall. The
    spacers also centre a title-only card, which made the separate
    `grid-row: 1 / -1` rule for that case redundant, so it was removed. The
    phone card sets its own `band auto auto` rows (see the phone card note at
    the top of this section).
  - The system fixture carries an unmet requirement (Construction's
    `text-red-400` line), a met one (Tailoring) and a source line
    (Construction), so the frame's section order is tested. Controls verified:
    drop the unmet filter and Tailoring grows a note; put the rows back to
    `auto 1fr auto` and the one-material frame measures 90px while title-only
    cards sit 48px above centre.

- **The action button's icon is Curtis's own artwork, one per discipline**
  (2026-09). `build-tools/import-action-icons.mjs` reads his Illustrator EPS
  and writes `assets/skills-ui/action-icons/<skill>.svg` plus `index.json`.
  The EPS is a DOS-binary EPS whose TIFF preview is a 2071px palette image
  that clips the last icon at the artboard edge, so the preview is NOT used:
  the PostScript page draws every icon as flat filled paths with Illustrator's
  `mo`/`li`/`cv`/`cp`/`f` operators in y-down artboard space, which map to
  SVG path data one-to-one. The ten icons sit left to right in SKILL_META's
  own order - combat, mining, smithing, gathering (Herbalism's leaf), alchemy,
  jewelcrafting, spellcrafting, tailoring, woodcutting, construction - and the
  importer hard-fails on any other cluster count or on a paint operator other
  than a flat fill. Every icon is written into the SAME square viewBox, sized
  to the largest one, so the relative sizes Curtis drew survive. Crafting and
  Fishing have no icon in the file, so their glyph is empty and the button
  shows its label.

  The glyph is still a skin-owned span in the command zone (both of the
  button's pseudo-elements belong to the atlas motion layers), but it no
  longer copies the medallion sprite inline: the sheet picks the SVG from the
  card's `data-iw-skill-v2-type`, so the controller writes no inline style at
  all. `tests/skill-card-system.test.mjs` checks each card's icon is its OWN
  discipline's and DECODES every one, because a missing file still computes a
  perfectly good `background-image` (the render-harness trap documented
  below). Controls verified: point Jewelcrafting at the leaf and "is its own
  discipline's" fails; move `tailoring.svg` away and "decodes" fails.

  The glyph box is no longer a fixed 32px. It is the smaller of the current
  button width and height after subtracting a 14px safe inset on every side
  (with a 16px floor), then centred in the button. The SVGs' own 4% viewBox
  padding adds ink clearance inside that box. The system test enlarges a real
  button from 64x66 to 80x82 and requires the glyph to grow while all four
  margins remain at least 14px; this covers the tall Combat sword that touched
  the inner frame.

- **The action button is zone-themed, its label is above its frame, and the
  chevrons are centred on their plates** (Curtis, 2026-09).
  Three things, each measured with `claude/probe-skill-cards.mjs --ink`,
  which screenshots every arrow with and without its `::before` at DPR 4 and
  diffs the two to find the chevron's real ink, because a pseudo-element has
  no rect. `--zone N` renders the fixture in any zone's theme.

  - **Icon and label.** The game-owned label remains inside the native button
    for its accessible name and handlers, but uses a 0px visual font. An
    aria-hidden skin mirror follows its text and paints 4px above the frame.
    The button is therefore icon-only, with the dynamically sized glyph centred
    in both axes. The mirror, frame and pager belong to the one command-stack
    calculation above; no React node is reparented.
  - **Zone theme.** The action button's fill (`--fs-motion-idle/-hover/-pressed`
    from `--iw-th-cta`/`-cta-hi`/`-plate`), its double border
    (`--iw-th-hairline-hi`), rings (`--iw-th-accent-dim`, `--iw-th-edge-mid`)
    and glow (`--iw-th-accent`), and the arrow plates (`--iw-th-edge-soft`,
    `-edge-mid`, `-accent` on hover) all read the same token layer every other
    framed surface does, so there is no JS. The discipline icon, the label and
    the disabled grey are deliberately NOT zone colours. The system test paints
    each token onto a probe and compares it with the colour the button itself
    resolved - a computed custom property is an un-evaluated token stream - then
    swaps `data-iw-zone-theme` and reads again in the same task, which proves
    the frames track a zone change. The card's own frames followed in the
    next pass - see below.
  - **Chevrons, two separate offsets.** The chevron is a 7px square's right and
    bottom borders (2px) turned 45deg, and turned, its ink sits
    (7 - 2) / (2 x sqrt2) = 1.77px toward its point (measured 1.75px); a
    `translateX` cancels exactly that, keyed on `data-iw-nav-direction` rather
    than `:first-child`, because DOM order is React's. Separately, every
    chevron sat ~3px HIGH, and the first fix - a grid plate with
    `place-items: center` - changed nothing: the fixture's `‹ ›` is a text
    node at font-size 0, and in a grid it becomes a SECOND grid item that
    takes half the plate, so the chevron was centred in the top half. The plate
    is a centred row flex. This is the reward plaque's "place-items: center does
    not centre a ::before that has a text-node sibling" trap, found a second
    time. (The LIVE arrows are not text at all - see "The live pager arrows
    are SVGs" below.)

  Controls verified in `tests/skill-card-system.test.mjs`: the old fixed
  padding reads -3.5px with the label overlapping the icon; a grid plate reads
  dy -2.5 to -3.5; no translate reads a 2px dx on one arrow of each pair; a
  literal `#96bddf` border fails both theme checks. The chevron check runs at
  DPR 1, so its tolerance is 1px.

- **The cards were shrunk and their frames themed** (Curtis, 2026-09: "still
  too tall"). Measured: a simple card 152px -> 126.6px, Construction 196px ->
  159-217px depending on width.

  - **The hero group is smaller and has breathing room inside its frame** -
    the first compact pass moved `--iw-skill-v2-icon` 64 -> 51,
    `-ring-gap` 11 -> 9 and `-ring-weight` 7 -> 6. A subtle 47 / 8 / 5 fit
    pass still read nearly unchanged in the live UI because the complete ring
    only lost 6px and the plaque did not change; the corrected values are
    43 / 7 / 4. The 7px token produces 6px of visible clearance after the
    portrait border, while keeping the complete ring within 56px. The level
    readout is now 12/9 (down from 17/13 originally),
    with a 44px floor, tighter padding and an 11px lower radius. The visual
    fixture includes a `Lv 54+2` value because bonus levels are the plaque's
    widest live shape. The discipline name keeps its size, and the identity
    column stays 144px wide: "SPELLCRAFTING" needs ~129px. The card height did
    not need to increase; reducing the medallion and plaque adds space where
    the crowding occurred.
  - **The action button is 30% smaller in BOTH axes (58x66, was 82x94)**, the
    command column 124 -> 96px, the arrows 27px each so the pair still equals
    the button. Width was what was asked for; height had to follow, because
    the command column needs `btn-h + buffer + nav-h + 24px`, which at 94px
    is 148px - exactly the height every card was stuck at, so shrinking the
    hero alone moved nothing. The action text now lives in a visual mirror
    above the frame. Its type is fitted through
    `--iw-skill-v2-action-label-font` (9.5px ceiling, .02em tracking), while
    the native button text remains intact at `--iw-skill-v2-btn-font: 0px` so
    it does not occupy visual space behind the glyph.
  - **The card's own frames follow the zone.** `--iw-skill-v2-edge` and
    `-edge-soft` point at `--iw-th-edge-mid`/`-soft`, so the card border and
    column dividers move with them; the card ground, its inset rings and top
    hairline, the medallion's border, the ring's unfilled track, the level
    readout, the content and command washes, the BASE chip, the info frame,
    its cells' borders and the prose rail all read `--iw-th-*`. Deliberately
    left literal: the met/unmet greens and oranges (rule 5), the skill-accent
    ring fill and hero wash (identity), and text colours. Checked the same way
    as the buttons - card border, info frame and chip each compared with the
    painted token, then again after swapping `data-iw-zone-theme`.

  Controls verified: a 94px button puts a card with a pager back at 150px;
  the full-size icon fails the badge-scale check; the old 12px/.09em label
  clips on two cards; a literal `#41596d` edge fails both card-frame checks.

- **Action labels are FITTED to one line, and the title row has no ground**
  (Curtis, 2026-09). The content zone spans only the title row, so its wash
  drew a lighter box that ended under the title; it is `background: none`.
  The button is 64px (arrows 30px each, so the pair still equals it) with a
  4px `--iw-skill-v2-label-buffer` each side and `white-space: nowrap`.

  Labels are the game's, so no stylesheet can size them. `fitActionLabel`
  measures each aria-hidden visual mirror once and writes the size that fits
  (ceiling 9.5px, a 4px technical floor) as
  `--iw-skill-v2-action-label-font` on the card; width is linear in size because
  the tracking is in em, so one measurement is exact. The mirror is capitals in
  the heading typeface, Cinzel (Curtis, 2026-09-16, chosen over capitals in
  Barlow). Cinzel is wider, so at the current 64px width the short verbs keep
  the 9.5px ceiling but "CRAFT PARTS" fits at ~7.7px; the system test asserts
  "keeps the ceiling when it fits, shrinks only as far as it must", not a
  fixed size.
  The native button's `--iw-skill-v2-btn-font` is 0px so its preserved text
  takes no visual space behind the icon.
  The renderer must select compact geometry from its own `fs-skill-panel`
  marker, not wait for `data-iw-skill-v2`: it is the first `iw:skill-panel`
  listener and the V2 controller sets that later marker only after the first
  button-style pass. The zero-font token also uses a 0px fallback, so native
  text never flashes while the V2 variables are landing. On an in-page
  extension upgrade the controller repairs the skin-owned mirror's class and
  removes stale inline typography / `--iw-skill-v2-btn-font`; otherwise an
  older inside-button build can survive as a giant wrapped mirror plus a second
  native label under the icon.
  Three things about the cache key `label | layout | inline width | layout
  epoch`, each learned by measurement:

  - **The inline WIDTH is in it** because on a card's first pass the renderer
    sizes the button before this module marks the card V2, so the label is
    first measured in the legacy 155px button and judged to fit - "CRAFT
    PARTS" then stayed at 9.5px and ran 11px past a 64px button. An inline
    style read forces no layout; `clientWidth` would, every flush.
  - **The key is written BEFORE measuring**, and the layout epoch is in it, so
    an attempt that cannot measure (the hidden mirror column, jsdom) is not
    retried every pass. Retrying - with a `getComputedStyle` per skill card per
    flush in jsdom - dropped `tests/smoke.test.mjs`'s 122-row burst to 92.
  - **Fonts reset it**: `document.fonts.ready` clears every key, because a
    label measured in the fallback face is wrong once Barlow lands.

  The system fixture's Construction is the live pairing - "Craft Sunforged
  Building Parts" under "CRAFT PARTS" - because an "Assemble ..." title under
  a "Craft Parts" button drops the card out of the layout entirely (a fixture
  mismatch, not a live bug). Controls verified: no fit call, and the width left
  out of the key, both overflow Construction's label; a restored gradient fails
  "the title row paints no ground". `claude/probe-skill-cards.mjs`
  `--live-construction`, `--labels A,B,...` and `--grounds <id>` produced
  every number above.

- **A skin node in the shell must be excluded from `unexpectedFlowChild` BY
  NAME, because its out-of-flow styling depends on the answer that check
  gives.** Reported (Curtis, 2026-09) as "the old skillcard theme is bleeding
  through" on Smithing and Alchemy only: raw titles with emoji, the old action
  frame art and ornate pager, the material line and the full ingredient grid
  unclipped, and the V2 level readout as bare text - a card with V2 marks but
  no `data-iw-skill-layout`, which every V2 rule requires.

  The chain: on a bare-button card the action icon is appended to the SHELL.
  `annotateStructure` re-runs only when `structureSignature` moves - a
  button's text or disabled state, which is exactly what changes on a crafting
  card as materials run out or an action starts - and it calls
  `clearStructureRoles` first, which deletes `data-iw-skill-layout`. With
  that gone, not one of the icon's rules applies, so while the three-zone test
  runs the icon is an unstyled block in the shell. Locally it measures 1051x0
  and passes; on the live page any host style giving it height made it "an
  unknown visible branch", the card refused the layout, and because the icon
  is never removed it refused it on every pass after. Cards with no
  button-state churn (Herbalism, Mining) never re-decided and stayed V2, which
  is why it looked card-specific.

  Reproduced with `claude/probe-skill-cards.mjs --reference --bare-command
  --host-glyph-height` (a min-height on the icon plus an `aria-disabled`
  flip): every bare card dropped to NONE. `--tick` alone, a static page, a new
  content line and a title relabel all failed to reproduce it, because none of
  them move the signature - worth knowing before chasing a layout fallback:
  check what `structureSignature` reads first. The system test ends with the
  same stress and asserts both that a re-decision HAPPENED (a mutation-record
  count - the attribute is cleared and restored in one task, so reading its
  final value in the callback sees nothing) and that every card kept its
  layout. Control verified: drop the exclusion and Construction reads NONE.

- **The live pager arrows are SVGs, and the game's activity fill is a span in
  the action button** (Curtis, 2026-09: "the chevrons are offcenter" and the
  active-skill progress bar "is very difficult to see"). Both shapes were read
  from the deployed chunk, and the fixtures had neither:

  - **Each arrow holds a Lucide `<svg class="h-4 w-4">`**, not `‹ ›`. It was
    already invisible (the inline plate makes the text transparent and the svg
    strokes `currentColor`), but it was still a 16px FLEX ITEM beside the
    `::before` chevron, so the centred row put both chevrons **7.5px left** of
    centre - on prev and next alike. The fixture's text glyph at font-size 0
    takes no width, which is why it measured 0.5px locally the whole time.
    `nav-button > *` is now `position: absolute; visibility: hidden;
    pointer-events: none`: still in the DOM, still inside the button, so the
    click lands on the game's control. Both fixtures now carry the svg
    (`claude/probe-skill-cards.mjs --text-pager` keeps the old shape).
  - **The progress is the game's own `<span class="absolute inset-0
    bg-black/15" style="width:N%">`** beside `<span class="relative z-10">`
    holding the label; while a skill starts, the same span sits at 100% with
    `animate-pulse`. Fifteen percent black on a dark themed button was a
    change of a few levels. The V2 sheet restyles the span, keyed on its
    inline `width` rather than on Tailwind class names: a zone-accent band with
    a bright leading edge and glow at `z-index: 1`, the label span lifted to 2,
    and - only while a fill exists, via `:has()` - a darker track and an accent
    frame, so a running skill reads as running even at the game's 8% minimum.
    Its width is never written (rule 5: the skin computes no progress). The
    icon is a sibling of the button at `z-index: 2`, so it stays above the
    fill without help.
  - **The fill is smoothed exactly like the Current Action bar, from the same
    code** (Curtis, 2026-09: "it jumps as it progresses"). Read from the
    chunk: the width is `max(8, ((now - startedAt) % duration) / duration)`
    and `now` is React state set by `setInterval(..., 250)`, so the band
    stepped a quarter-second at a time. A LINEAR width transition one tick
    long makes it continuous. The measurement - median tick, the 1.12 lead
    bias, the completion reset and the poisoned first tick after it - moved
    out of `UIFoundation` into `src/modules/ProgressCadence.js`
    (`sampleProgress`), which both surfaces call; neither writes a progress
    value. `SkillCardDesignController.smoothActionFill` runs on every
    reconcile (each width write mutates the span's `style`, which queues the
    card), writes the measured duration inline on the CARD as
    `--iw-skill-v2-fill-duration` (fallback .28s = 250ms x 1.12), and tags
    the card `data-iw-skill-v2-fill-reset` for one frame when the width drops,
    so the band snaps back instead of sliding across the button. A tag that
    lands after a style recalc already started the slide still works:
    switching `transition` to none cancels a running transition to its end
    value. Samples are keyed by card, so stopping and restarting a skill on
    the same card keeps its measured tick.
  - **`fitActionLabel` measures the visual mirror, not the whole button.** A
    Range over the native button also sees the game's activity-fill element;
    during startup that fill is 100% wide, so the old measurement shrank the
    text to 8.2px and cached the wrong result. `labelTextBox()` now unions only
    the mirror's text rects. The probe and system test use the same text-only
    measurement.

  `tests/skill-card-system.test.mjs` runs Woodcutting at 40% and Spellcrafting
  starting. It isolates the fill's paint by screenshotting each button with
  the span hidden and shown: the band must add a mean RGB delta of at least 90
  over its own rect, the brightest label and icon pixels must not change
  (p90 delta <= 30), and the span must still measure the game's 40% / 100%.
  The smoothing check drives Woodcutting's span the way the game does (250ms
  interval, two 2s repetitions) and samples the rendered width every frame:
  0% of moving frames stand still and the largest jump is 0.9%, with both
  completions snapping. Controls: no transition reads 94.3% still and a 12.9%
  jump; dropping the reset rule, or the controller's reset tag, reads 44-46
  frames sliding backwards.
  Controls verified, each failing only its own check: drop the `> *` rule and
  every chevron reads -7.5px; drop the fill rule and the band reads a mean of
  7 / 6.4; put the fill at `z-index: 20` and the ink p90 reads 134; force
  `width: 100%` and the running card reads 100% against its inline 40%;
  measure the native button instead of the visual mirror and Spellcrafting's
  "GATHER" drops to 8.2px.

- **Actions that start above 11 seconds replace the button glyph and label
  with the game's own remaining-time readout until completion** (Curtis,
  2026-09). `SkillCardDesignController` reads the rendered Current Action
  panel rather than starting a second clock, so condition-adjusted actions
  (including 180-second actions) stay authoritative. Crossing below 11 seconds
  does not restore the label: the card keeps `data-iw-skill-v2-long-action`
  until the native action fill disappears, while a repeated action simply
  jumps back to its new full duration. The existing skin-owned action-glyph
  span becomes the timer instead of appending another shell child; this keeps
  `SkillPanelRenderer.unexpectedFlowChild`'s glyph exclusion sufficient and
  avoids changing the button text that feeds `structureSignature`. The native
  label remains in place and keeps the game's handler/accessibility semantics;
  CSS hides the external visual mirror while the timer is active.
  `tests/skill-action-countdown.test.mjs`
  pins the 11-second boundary, 180s start, persistence through 10s, completion,
  teardown and the rendered replacement styling.
- **The timer is refreshed by Current Action ticks, not by card events.** The
  countdown ticks in ANOTHER panel, so DOMWatcher never emits `iw:skill-panel`
  for it; the first build re-read the clock only when the card itself mutated,
  and live the button's fill sat at `8%` for 12.5s of a Netherite Chest craft,
  so the timer froze at 108s for ~10s and then jumped. The controller now also
  listens to `iw:name-scan-flush` / `iw:dom-flush` and re-syncs running cards
  when a root intersects the Current Action host. Measured with
  `claude/probe-action-timer-start.js` (2026-09-17): the button follows the
  game's text within 11-41ms.
- **The ~2s hold on the first second is the game's, and is deliberately kept.**
  The same capture shows Current Action itself holding `108s` for 2179ms before
  its first tick (the same doubled first tick as
  [current-action-progress](current-action-progress.md)). A local clock would
  start counting at once but disagree with Current Action for up to ~2s;
  Curtis chose to keep mirroring the game (2026-09-17).

- **The command zone can BE the action button - and that, not a wrapper, was
  the live shape.** Reported (Curtis, 2026-09) first as every icon ~12px high,
  then, after the fix below, as every icon gone. Both are one cause: when the
  game ships the button as the shell's own third child, SkillPanelRenderer tags
  the BUTTON itself `data-iw-skill-zone="commands"` (eight skillpanel.css rules
  already guard `[data-iw-skill-zone="commands"]:not(button)` for it).

  - Appended "to the command zone", the icon went INSIDE the button, which is
    absolutely positioned and so was its containing block: `50% - stack / 2`
    of a 66px button lands ~5px above its own top edge. That was the first
    report.
  - Looked up with `zone.querySelector(action-button)`, nothing was found -
    `querySelector` never matches the element it is called on - so no icon
    was created and the old ones were removed. That was the second.
  - `ensureActionGlyph` now checks `zone.matches(...)` first. The icon's host
    is then the SHELL, and one more thing follows: an absolutely positioned
    GRID ITEM is placed against its grid AREA, so the button measured from the
    command column while an icon with no area measured from the whole card and
    landed in its middle (dx -478 on the test page). A shell-child icon takes
    `grid-area: commands` (row 1, the top band, on a phone card).
  - The bare button inherits command-zone styling that costs it ~2px of label
    room, so at the narrow 54px width "ASSEMBLE" clipped. The narrow layout
    keeps the 58px button; only the column narrows.

  `claude/probe-skill-cards.mjs --bare-command` reproduces it; the system
  fixture's Construction card carries it, with the longest label, and the
  440px pass now checks for a clipped label. Controls verified: a lookup inside
  the zone only fails "carries the discipline glyph"; no grid area puts the icon
  478px off; the 54px narrow button clips Construction's label. The icon checks
  are null-safe, because the first control used to CRASH the run rather than
  fail it - a crash reports no failures at all.

- **The action icon is appended to the BUTTON'S PARENT, and every wrapper
  round the button loses its containing-block properties** (Curtis, 2026-09:
  "the icons still aren't correctly placed"). Live, each icon sat ~12px high
  and poked over the button's top edge while the label and the arrows were
  where they belonged. The button, the icon and the arrows are all placed from
  "50% of the containing block", so they can only disagree if they resolve
  against DIFFERENT boxes - and the icon was appended to the command zone while
  the button sits wherever React nests it. Reproduced with
  `claude/probe-skill-cards.mjs --wrap-command`, which wraps the button in a
  node with its own containing block: the icon landed 7px high against the
  label and a content-branch pager's 8px buffer measured 1px.

  Two fixes, deliberately both:

  - **The icon shares the button's parent.** Siblings always share one
    containing block, so the icon is placed against exactly the button's box
    whatever the game's wrapper is. This is the only guarantee that holds for a
    containing-block source nobody listed.
  - **Every wrapper between a zone and the button or pager is reset** - not
    only `position` but `transform`, `filter`, `backdrop-filter`,
    `perspective`, `contain` and `will-change`, each of which also makes an
    element a containing block. That is what keeps the ARROWS on the button,
    because a content-branch pager is placed against the card and cannot be
    moved (it is React's). Not listed, and so not reset: the individual
    `translate`/`rotate`/`scale` properties and `transform-style:
    preserve-3d`. If the arrows ever drift live, check those first.

  Because the reset makes zone and wrapper coincide on the test page, the
  geometry checks cannot tell the icon's two placements apart, so the system
  test asserts the STRUCTURE (the icon's parent is the button's parent);
  appending to the zone again fails it. Dropping the reset to `position` only
  fails the buffer and centring checks on the wrapped card.
  `claude/capture-skill-cards.js` now records, per card, the button's and the
  icon's offset parents and every ancestor's containing-block properties, so a
  live mismatch can be named from a capture instead of guessed; the probe's
  `--capture` runs that snippet locally first, to prove it works.

- **BASE sits BESIDE the action name, centred on it, and the content zone is
  a GRID for that reason** (Curtis, 2026-09). Live, the chip painted ABOVE a
  centred title, while every fixture showed it below a left-aligned one. The
  chip is appended straight into the content zone, but the game wraps the
  live title in a branch of its own, so the old flex rule keyed on
  `> [data-iw-skill-role="action-title"]` never matched: the wrapper kept the
  default `order` and fell after the chip. The zone now places
  `> :is([action-title], :has([action-title]))` in row 1 column 1 and
  `> .fs-skill-base-exp` in row 1 column 2, with every other child spanning
  below, so both shapes land the same without moving a node. The title track
  is `minmax(0, max-content)`: a long name wraps and the chip stays beside it.
  `tests/skill-card-system.test.mjs` and `claude/probe-skill-cards.mjs
  --nest-title` both carry a wrapped title now; key the cell on the direct child
  again and only the wrapped card loses its chip.

  **The zone's ROW gap must be 0.** It also holds the game's own zero-height
  and clipped nodes, and each one that lays out as a grid item costs a row, so
  a 6px row gap measured 30px of dead space between the title and the frame.
  `claude/probe-skill-cards.mjs --rows <id>` prints the shell's resolved row
  tracks and every child of the content zone, which is how that was found.
  With the chip's row gone, simple cards sit at the shell's 152px floor, so the
  frame stretches; its rows are `align-content: center` so the spare space
  splits evenly instead of pooling under the last row. Construction is 159px at
  1100 and 203px at the live width.

- **Materials are compact CELLS, at most three columns** (Curtis, 2026-09:
  "avoid skill cards increasing in height as much as possible"). Two things
  were wrong live, and the fixture hid both:

  - **The reported screenshot was at a raised pixel ratio.** In CSS pixels the
    live card is ~700px wide and its frame ~400px, not the ~1050px it looked.
    The old `minmax(min(260px, 100%), 1fr)` track therefore fit ONE material
    per row live, while the 1100px fixture showed two columns and looked fine.
    Measure a screenshot's scale before trusting its widths.
    `tests/skill-card-system.test.mjs` now runs a pass at a 745px viewport,
    which reproduces that card.
  - **The track is `minmax(max(96px, (100% - 2 x gap) / 3), 1fr)` under
    `auto-fit`.** The min is the larger of a floor and a third of the row, so
    a fourth column can never fit, and the grid sheds to two or one on its own
    when a cell would drop under 96px — no breakpoint and no knowledge of the
    card. `auto-fit` also collapses empty tracks, so one or two materials still
    fill the frame. A plain `repeat(3, 1fr)` looks equivalent and is not: it
    crushes cells under the floor on a narrow frame (82px at a 330px
    viewport since the phone card made the frame full width) and puts a lone material in a
    third-width cell.

  `ensureDetailBody` splits a material line into a name span and a count span
  (`MATERIAL_PARTS`, the same N/M shape as `INGR_COUNT_PATTERN`) and tags the
  row `data-iw-skill-v2-body-kind="material"`; anything else, including a
  requirement line, spans the whole row. The cell is `flex-flow: row wrap`, so
  name and count share a line while the cell has room and the count wraps
  beneath only when it does not. A forced name-over-count stack cost a
  single-material card a whole line (+12px) for nothing. The frame is a size
  container (`iw-skill-body`), so the cell type is `clamp(10px, 3cqi, 12.5px)`
  of the frame itself. Construction is 187px at 1100 and 230px at the live
  width, against 253px before; a bare card is ~157px.

  Three controls are verified: restore the 260px floor and Construction reports
  two columns of three at 1100 and one column live; use `repeat(3, 1fr)` and the
  narrowest cells measure under 96px (49px at 440 before the phone card; the
  check now runs at 330px, 82px); force a column stack and a single-material card
  measures ~10px taller than a prose card. Note the system test has to SELECT
  Construction's Materials tab before auditing: Construction ships a
  requirement, so it opens on Requirements, and a grid check against a frame
  holding one prose line reports zero cells.

- **A met material earns a tick as well as its colour.** It is `\2713` on a
  `::before`, ADDED to the game's met/unmet signal — rule 5 forbids replacing
  it, and the two states still paint different colours.

Measured across the five live shapes: 180.4 / 180.4 / 180.4 / 180.4 / 253,
zero clipping and zero overlaps, against 218.2 / 186.6 / 218.2 / 186.6 / 298.5
before. Construction is legitimately taller now — there is no collapsed state
to hide six materials in — so the system test's stress check changed shape
rather than being weakened: subtract each card's own frame and every SHELL
must measure the same, which is what says the dense skill grows only the frame
it fills. The old form (equal total heights) cannot be true of this design.

Four negative controls are verified, all against
`tests/skill-card-system.test.mjs`: revert the pager width token to the old
22px literal and the pair measures 48 against an 82px button; put the second
gutter literal back and the frame reports an 8px step off the title; move the
tab row above the body row and the strip paints over its own frame; give the
frame `grid-column: 1 / -1` and it starts at the card's edge. Note the first
control only fires if BOTH `width` and `min-width` are reverted — reverting
one leaves the other as a floor, and the check passes for the wrong reason.

## 2. Cascade and pseudo-element traps that still apply

**Skill Card V2 is an ALTERNATE design of the three-zone card, so it has to
out-specify it — and the three ways that goes wrong are all silent.** Reported
live (Curtis, 2026-09) as "the new skill cards aren't quite what I expected"
against the concept art. Every finding below came from
`claude/probe-skill-card-v2.mjs` (mounts one live-shaped card on the real
bundle and prints rendered rects, skin marks and painted text) and
`claude/probe-skill-card-v2-cascade.mjs` (lists every rule in the live cascade
that declares a property, with its sheet and specificity, so the winner is
named rather than guessed).

- **The whole sheet was one class short.** `skillcard-v2.css` keyed on
  `html[data-iw-skill-card-design="new"] [data-iw-skill-v2="1"] X` — **(0,3,1)**
  — while the block it overrides keys on
  `.compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] X` at
  **(0,4,0)**, and 306 rules in `skillpanel.css` use that chain. Source order
  cannot save it: V2 is concatenated after skillpanel in the same injection and
  still lost every contest. So the duplicate level readouts stayed visible, the
  progress ring never painted and `nav-group` kept its `display: contents`,
  while `getComputedStyle` reported exactly what the V2 rule asked for on
  nothing at all. The base chain is now
  `html[data-iw-skill-card-design="new"] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"]`
  = (0,5,1), which also TIES the (0,5,1) `nav-group` rule — and a tie goes to
  V2, because it is later in the same sheet. Do not "simplify" that chain back.
  Opting the legacy block out with `:not([data-iw-skill-v2="1"])` is the wrong
  shape here: V2 builds ON the three-zone layout and only replaces parts of it,
  so standing all 306 rules down would leave the card with no layout at all.

- **Raising the chain then DOUBLED the title and the discipline name**, which
  is the mirror-image failure and the reason this pair must be changed
  together. `skillpanel.css` sets `font-size: 0` on
  `[data-iw-skill-role="action-title"]` / `="identity"` and redraws each from
  `content: attr(data-iw-clean-text)` on `::before` — that is the mechanism
  that strips the leading emoji. V2 set `font-size` on the ELEMENT, which at
  (0,5,1) now won, so the raw copy came back while the `::before` kept
  painting: "Prospect Moonsteel OreProspect Moonsteel Ore", and the discipline
  name twice, once with its 💎. **Style the `::before`; never give those two
  elements a font-size.**

- **The ring is a `::after` with TWO other owners, and neither shows up in a
  `background` check.** `.fs-skill-medallion-art::after` is set `display: none`
  by the `[data-iw-skills-ui-ready="1"]` block and pinned to `width/height:
  7px` by the three-zone block. V2 won the `background` contest with its
  conic-gradient and still drew nothing, because it declared neither property —
  and an explicit `width` beats a right offset on an absolutely positioned box,
  so `inset: -6px` alone left a 7px speck. The rule now sets `display: block`
  and `width/height: auto` by name. Symptom: a perfectly correct
  `conic-gradient` in `getComputedStyle` and no ring on screen, which reads as
  a broken asset rather than as two declarations arriving from elsewhere.

**The EXP ring's displacement was an INHERITED TRANSFORM, and the probe could
not see it because a transform is not part of a pseudo-element's computed
box.** Reported twice (Curtis, 2026-09) as "the ring is still displaced"; the
local audit reported `dx=0, dy=0` at the same column width both times.

The three-zone block draws a diamond stud on the SAME `.fs-skill-medallion-art
::after` the V2 ring repurposes, with `left: 50%; transform: translateX(-50%)
rotate(45deg)`. The ring rule overrode `display`, `inset`, `width`, `height`
and `background` — every property that appears in a geometry read — and left
the transform standing. Measured: `matrix(0.707107, 0.707107, -0.707107,
0.707107, -31, 0)` on a 62px ring, i.e. rotated 45 degrees and pushed HALF ITS
OWN WIDTH left. The rotation is also why the arc started at half past ten
instead of twelve, which read as "the percentage is wrong" rather than as a
transform.

Two rules follow:

- **When you repurpose a pseudo-element another rule already draws on, clear
  its TRANSFORM explicitly.** Overriding the properties you care about is not
  enough; a transform composes with whatever geometry you set.
- **A pseudo-element's painted position cannot be derived from
  `getComputedStyle`.** `left`/`top`/`width`/`height` exclude transforms, and
  there is no `getBoundingClientRect` for a pseudo. So a geometry check on a
  pseudo is only as good as the properties it happens to read — assert
  `transform === 'none'` as an INPUT, the way the discipline name's truncation
  chain is asserted, because the output is not observable.
  `tests/skill-card-system.test.mjs` does; its negative control reports the
  exact matrix above.

## 3. Earlier passes whose mechanisms are still in place

**Second V2 pass (polish), and the worst thing it found was a check living on
an accident.** Curtis asked for the design to be brought closer to the concept
art. Four of the five findings came from re-probing rather than from reading
the sheets.

- **A V2 card did not fold with its panel, and the collapse test could not see
  it.** `CollapsibleFrames` hides the frame's `> *`, but the V2 shell rules set
  `display` on the CARD at (0,6,1) and beat that, so a collapsed Skill Actions
  panel kept rendering every card. It measured correct only by accident: the
  collapsed controls row carried `margin-top: -35px` IN FLOW, and on a card
  with no React shell wrapper — which is exactly the shape
  `tests/collapsible-frames.test.mjs` fixtures — that negative margin shrank
  the card to nothing, so the panel reported the same 36px as every other
  collapsed bar. Taking the toggle out of flow for an unrelated reason removed
  the accident and the test immediately reported Skill Actions at **172.5px**
  against 36px everywhere else. The card now carries an explicit
  `[data-iw-collapsed="1"] > …[data-iw-skill-v2-state]` hide at (0,7,1); the
  extra attribute is what outranks the shell rules rather than tying them.
  This is the same family as the smoke check that was passing BECAUSE of the
  flush loop: when a measurement is right for a reason you did not intend,
  removing the reason is what finally shows you.

- **A skill card with no `N/M` in its text has no materials AT ALL, so the
  whole Materials tab was untested.** `ingredientEntries` builds the grid from
  `INGR_COUNT_PATTERN` (`([\d,]+)\s*/\s*([\d,]+)`), so the probe's
  `Requires: 2 Moonsteel Ore` produced nothing: no `[data-iw-ingr]` source, no
  `.fs-skill-ingredient-grid`, no `data-iw-skill-v2-section="materials"`, and
  therefore no Materials tab on the card under test. Every fixture here now
  carries a real `Moonsteel Ore 3/2 • Silver Dust 1/4` line, which also gets
  BOTH ingredient states (met and unmet) on the page so rule 5 has something to
  protect. Same trap as the fixture whose `Base EXP:` copy meant the plaque was
  never created.

- **Two more silent owners, found by enumerating edges rather than reading
  rules.** The content zone inherited a `border-bottom` from the three-zone
  block, drawing a 1px rule at y=115 that ran x=117..963 and stopped short of
  the command column, reading as a stray divider under the material row. And
  the ring at 3px in the raw discipline accent sat close enough to the
  medallion's own bezel to read as part of the frame; it is 4px now and mixed
  toward white, with the unfilled track lifted too, because the REMAINING share
  is half the information a gauge carries.

**The V2 card was rebuilt against the approved reference (Curtis, 2026-09), and
the five things that actually shaped it are all invisible in a stylesheet.**
`claude/probe-skill-cards.mjs` renders the five live shapes — Combat, Mining,
Smithing, Herbalism, Alchemy — on the real bundle and prints card heights,
column widths, ring-vs-icon concentricity, the hero stack's offsets, clipping
and overlaps. Every number below came from it.

- **The ring's clearance was 0.0px, and that is why it read as "overlapping
  awkwardly" rather than as a gauge.** The medallion carries its own
  `box-shadow: 0 0 0 3px / 0 0 0 4px` pair, so a 50px icon PAINTS a 60px
  circle — exactly the ring's own 60px diameter. Suppressing the outer halo
  makes the painted circle equal the element box, which is what makes the ring
  concentric *by construction* (dx=dy=0) instead of by tuning. Note the
  instrument trap found while measuring this: a pseudo-element's `top`/`left`
  resolve against its host's PADDING box while `getBoundingClientRect()`
  returns the BORDER box, so on a host with a 1px border a perfectly centred
  ring reports a 1px offset — an instrument error that looks exactly like the
  defect.

- **The card's height was set by the hero column, not by its content.** The
  shell carried `grid-template-rows: minmax(86px, auto)` plus
  `min-height: 86px`, and the identity column measured ~111px on every card, so
  Mining — a title and one chip — was exactly as tall as a crafting recipe.
  Both floors are gone; a simple card is 95.5px against 128.5px, and the five
  shapes now measure 95.5 / 95.5 / 106 / 106 / 119.3.

- **The pager set the height of every card that had one.** Its box is written
  inline by `styleButton` at 26x44, so the two chevrons measured 58x44 together
  — taller than the 66px command button beside them. It is 22x20 under V2, and
  `compactCommandButton()` gates both that and the command button's own 78x66,
  because neither box can be reached from a stylesheet.

- **The button's fill arrives through THREE hops and only the last one is a
  usable lever.** `styleButton` writes `background: var(--fs-button-background,
  <atlas>)` inline; the revised-v5 block sets `--fs-button-background:
  var(--fs-motion-idle) !important`; `--fs-motion-idle` is the atlas paint.
  Setting `--fs-button-background` loses to the `!important`, and setting
  `--fs-button-paint` moved nothing because that hop is bypassed. The
  `--fs-motion-{idle,hover,pressed}` trio IS the lever, and the V2 chain has to
  reach (0,7,2) — `button[data-iw-skill-role="action-button"]` under
  `[data-iw-skill-layout="three-zone"]` — to clear the themed rule.

- **BOTH of the action button's pseudo-elements are already spoken for**: they
  are the atlas motion system's hover and pressed crossfade layers. The
  discipline glyph therefore gets its own skin-owned span appended to the
  command ZONE — never inside the control — and the command zone packs from the
  top (`justify-content: flex-start`) so one offset is correct whether or not a
  pager follows. The sprite is COPIED from the medallion rather than looked up
  again; percentage background windows are resolution independent, so the same
  three values select the same cell in a 26px box as in a 46px one. In the
  stacked narrow layout the zone keeps its column direction for the same
  reason: turned into a row it put the button hard left while the glyph stayed
  at the row's centre.

- **The hero hides everything it does not own, by survivor list.** The live
  capture had the game's "LV 57" above the ring on three cards and "77.2%"
  adrift below it, while two other cards showed the skin's own block — the same
  column rendering two different ways. `[data-iw-skill-zone="identity"] > *`
  now hides everything except the medallion, the skin readout and the
  discipline name, so a native node the skin has not seen before cannot appear
  there. `levelReadout()` also falls back to the identity branch's own copy, so
  the skin's block resolves on every shape.

- **The card is a CONTAINER, not a viewport.** The old `@media (max-width:
  760px)` stacked the columns at a 700px viewport where the card is still
  ~660px wide, doubling its height to 176px. `container-type: inline-size` plus
  `@container iw-skill-card (max-width: 430px)` asks the card how wide it is —
  the same correction the Village scene already carries. Safe here: the card's
  inline size comes from its grid column, never from its contents.

- **The hero's own atlas corner flourish had to go.** A 38x41 sprite pinned to
  the identity branch's top-left read as a second, offset arc beside a 62px
  ring, which is most of what made the area look like layered unrelated parts.
  The card's frame carries the ornament now, scaled to 15x14 so it cannot reach
  the ring's left edge at 17px.

`tests/skill-card-system.test.mjs` is the system half: it renders all five
shapes and compares them to EACH OTHER — one ring size, one centre line, one
button box, one offset from icon to level block — because a per-card assertion
cannot see "the level is above the ring here and below it there". All six of
its negative controls are verified: restore the medallion halo and clearance
reports 0px on every card; put a binding row floor back and all five report one
height; drop the hero survivor list and every card shows a native level again;
restore the name's ellipsis and the truncation check fires; revert
`compactCommandButton` and the button is 155x44; move the strip back to the
panel and the body paints above its tabs.

Three smoke checks moved with the design rather than being deleted: the command
button's width assertion now accepts the design's value (compact, against the
155 legacy plaque), and the pager check asserts thin-and-smaller instead of
matching the button's height, which is a decision rather than a regression.
Both boxes are TOKENS rather than literals since the reference edit below, so
that check reads the declaration's fallbacks — jsdom resolves no cascade.

**All three zones must be `align-self: stretch`.** The content branch sizes to
its own lines and centres in the row, so it is SHORTER than the card — anything
pinned to its top edge is measured from the wrong box and lands past the bottom
border, which is exactly how the pager's gutter offset overflowed by 4px.

**The dense recipe is ONE game line, not one per material.** A fixture that
shipped six `<p>` lines produced six ingredient SOURCES and therefore six
one-item grids stacked full width, which looks like a broken grid template
while `grid-template-columns` computes perfectly correctly. `ingredientEntries`
splits a single line on its bullets; model it that way. With one source of six
entries and `minmax(300px, 1fr)`, an 832px column gives the two-column grid the
brief asks for.

## 4. Lessons from retired designs that still bind the code

The tab strip, collapsed summary and three-row tab/body shell described here
are gone. The exclusions and rules each paragraph ends with are still in the
code.

**The collapsed card shows a material SUMMARY, and building it opened a flush
loop the quiescence test cannot see.** Curtis (2026-09): Construction ships six
materials with five-digit quantities and must not expose them permanently. A
skin-owned summary line now replaces the grid while collapsed — one material IS
its own summary ("Moonsilk 0/8"), several collapse to a count ("6 materials") —
and the grid lives in the Materials tab. Construction went from **258px
collapsed to 92px**, the same shell as a card with no materials at all.

The trap: that summary repeats a material line VERBATIM, so it matches
`INGR_PATTERN` and `neutraliseIngredients` marked it as a second ingredient
SOURCE. `updateIngredientLists` then built a second grid after it, which grew
the card, which flushed, which tore the grid down again. Measured on an
expanded card, the height alternated **213.5 / 156.6 every frame, forever**.

Three things about why nothing caught it:

- **`tests/flush-quiescence.test.mjs` cannot see this class.** Its fixture has
  no expanded card with materials, and more importantly the oscillation is the
  GAME'S OWN RENDERER reacting to a skin node — not the skin writing to itself
  — so a page with no game mutation never triggers it.
- **It surfaced as a Playwright "element is not stable" click timeout**, three
  layers away from its cause. The diagnosis that found it was the one this file
  already prescribes: log every child's height per animation frame and look for
  the one that alternates. Two `materials` entries appeared and disappeared.
- The guard is `if (el.closest('[data-iw-skill-v2-summary]')) continue;` in
  `neutraliseIngredients`. A skin-owned node is never one of the game's
  ingredient lines — the same opt-out rule an appended control already needs in
  every sweep that reads the branch it was added to.
  `tests/skill-card-system.test.mjs` asserts exactly one grid per card; note
  that the control for it breaks the suite by TIMEOUT rather than by a failed
  check, because an oscillating card cannot be clicked. The fix was verified by
  measuring the card's height across frames, which is the stronger evidence.

**The V2 card is now a THREE-ROW shell, and the rows are the skin's own.**
Curtis (2026-09) rejected further cosmetic passes: expanding a card was growing
the middle column instead of adding rows. The card DOM is React's and cannot be
rebuilt (rule 2), but the shell is a grid and the skin may APPEND to it:

    grid-template-areas: "identity content commands"   <- the game's 3 branches
                         "tabs     tabs    tabs"       <- skin: tab strip
                         "body     body    body"       <- skin: tab content

Five things make that work, and four of them are traps this file already warns
about, in new clothes:

- **`unexpectedFlowChild` had to be told.** It inspects the SHELL's direct
  children and refuses the three-zone layout outright for any unknown in-flow
  child over 2x2 — so appending two rows would have cost the card its
  medallion, grid, pager and studs. Both rows carry `data-iw-skill-v2-row` and
  the guard skips them. That is why they are in flow at all rather than
  absolute.
- **The body is BUILT, not moved.** `ensureDetailBody` reads the active
  section's text and constructs its own rows — the same thing
  `updateIngredientLists` already does to turn the game's raw material line
  into `.fs-skill-ingredient-grid`. The game's sections stay put and stay
  CLIPPED in both states now; un-clipping them as well rendered every section
  twice, once in the summary column and once in the row.
- **Six stale rules in `skillcard-v2.css` out-specified the clip.** The old
  "expose one section at a time" block is (0,7,1) against the runtime-safe
  clip's (0,5,1), so the sections un-clipped themselves and the duplication
  came back. Deleting them is what made the clip authoritative.
- **The copied text is swept like any other text.** The body repeats material
  lines, so `neutraliseIngredients` marked its rows as ingredient SOURCES and
  built extra grids from them (measured: a 6-material body produced 12 rows).
  `textCandidates` would likewise have handed the skin's copy of
  "Base reward: …" the `reward` role, after which `markSections` tags it a
  section and the runtime-safe sheet clips the very row the card is trying to
  show. Both are excluded by name.
- **Expanding produces NO flush.** `data-iw-*` is outside the observer's
  `attributeFilter`, so the toggle writes nothing the watcher sees and the body
  was built only when some unrelated mutation happened to arrive — which reads
  as "the tab content is sometimes empty". `setSkillCardExpanded` now calls the
  pass itself, the same correction `PanelOrder.loadPreferences` needed.

Two smaller rules from the same pass:

- **`controlsHost` returns the shell, else the PANEL — never the content
  branch.** A fallback to the content branch puts the strip and body back
  inside the middle column on any card the game ships without a wrapper, which
  is exactly the growth the refactor exists to remove.
- **A copied row must carry the state it copied.** A requirement's met/unmet
  lives on the game node's class, read once into `data-iw-req-state`; the
  rebuilt row copies it explicitly or the tab paints every line the same
  (rule 5, the unconditional-red bug inverted).

Cost: the summary is built only while COLLAPSED and the body only while
EXPANDED. Doing both on every flush of every panel was measurable —
`tests/smoke.test.mjs`'s wall-clock burst check dropped from 122 rows to 110,
and recovered fully once each card did one or the other.

## 5. Superseded designs (history, do not restore)

Kept for the measurements and the negative-control reasoning. Where a paragraph
states a current layout (tabs, a collapsed state, pager `order: 2`, a wrapping
flex content column), section 1 replaces it.

Two smaller things from the same pass, both measured: the content zone was
`justify-content: center`, which spread three lines down the full card height;
and `.iw-skill-v2-tab` was `flex: 1 1 0`, so two tabs measured **539px each**
on a 1180px viewport where the concept has a compact segmented row.

**One structural part of the concept is NOT reachable from CSS.** The concept
puts the tab strip ABOVE its body panel. The body is one of the game's own
lines inside the content zone and the tab strip is a skin node appended to the
panel, so they are not siblings and no `order` can interleave them; the body is
placed last in the content column with `order` and the strip sits under the
card. `display: contents` on the content zone does not rescue it either — it
promotes EVERY line to a shell grid item, and title, plaque and body then land
in one grid area on top of each other. The move that would work is appending
the controls INTO the content zone, which is a classified game branch, and that
is the "an element the skin APPENDS into a game node changes what every other
classifier reads there" trap — worth doing only with a deliberate pass over
`UIFoundation`'s and `SkillPanelRenderer`'s sweeps, not as part of a visual
refinement.

- **The collapsed card is where the space is.** Measured, a collapsed card gave
  its content column 846px to hold a title and a `BASE: 677` chip. The concept's
  collapsed row keeps the material strip, so the runtime-safe sheet now un-clips
  `[data-iw-skill-v2-section="materials"]` in the collapsed state using the same
  un-clip vocabulary as the expanded rules (never `display:none`, because
  `SkillPanelRenderer` reads these nodes' real visibility). Everything else
  still waits behind the tabs.

- **The card's corner flourishes replace the three-zone inner rule; they cannot
  coexist.** An element has two pseudo-elements, `::before` is the top hairline,
  and the three-zone block already spends `::after` on a second 1px frame at
  `inset: 4px` — which the concept does not have anyway. `::after` now carries
  `border-image: var(--iw-corner-filigree)`, the same per-zone sheet every other
  panel uses, so the corners recolour with the zone and no new art is added. The
  slice is scaled to `22px 21px`, down from the shared `34px 32px`: four 34px
  corners on a ~110px card nearly meet down each side, and the ratio is held
  near the source quadrant's 88x95 because stretching it off-ratio renders the
  flourish as a smear — the mistake the collapsed panel bars already made.

**One concept element is deliberately NOT built: the per-tab icons.** The
concept gives each tab a list / box / gift glyph. The repo ships no such art for
this surface and CSS-drawn approximations at 8px read as dots, so the tabs stay
text-only. This needs artwork, not CSS.

`tests/skill-card-v2-render.test.mjs` is the real-browser half: it COUNTS
painted occurrences of the title and the discipline name (a computed-style
check cannot see the doubling) and measures the ring's real box against its
host. All five of its negative controls are verified — restore the element
font-size and it reports `count=2`, drop `display: block` and the ring reads
`none`, drop `width/height: auto` and it reads `7x7`, unhide `identity-level`
and it reports `block`, restore `flex: 1 1 0` and the tabs report `539,539`.

- **Tabs above their body needed the strip to MOVE, not to be restyled.** The
  body is one of the game's own lines inside the content branch and the strip
  was a panel child, so they were in different containers and no `order` could
  interleave them — the body always painted above its own tabs. The strip is
  appended into the content branch now, which makes them flex siblings, and
  `SkillPanelRenderer.textCandidates` excludes `[data-iw-skill-v2-controls]`
  because tab labels are spans carrying words like "Materials" and "Rewards" —
  exactly the shape that sweep resolves roles from. This is the
  appended-control opt-out rule, applied to the role sweep.

**Still not built, and it needs artwork rather than CSS:** the reference gives
each tab a list / box / gift glyph. The repo ships none for this surface and
CSS approximations at that size read as dots, so the tabs are text-only.
SOURCES and QUEUE tabs are likewise absent because nothing in the DOM supplies
their content, and the brief says not to insert empty tabs for consistency.

**The recipe pager ships in EITHER branch, and `order` means different things
in the two — which is why it floated mid-card.** Reported (Curtis, 2026-09) as
"the arrows aren't where they should be". The V2 rule demoted the pager with
`order: 2`, correct for the command column where the fixture put it. The live
cards ship it in the CONTENT branch, where order 2 lands it between the BASE
chip and the material strip. A fixture that always used one branch is why it
read as correct locally; `claude/probe-skill-cards.mjs` and
`tests/skill-card-system.test.mjs` now model BOTH, and the system test asserts
both are present so neither rule can go untested.

Three things about the fix:

- **Reset the WHOLE box when you re-place something another sheet already
  places.** skillpanel.css positions the content-branch pager absolutely with
  its own `left: calc(50% + identity-w / 2)`, `bottom: 0`, `height:
  var(--fs-skill-command-h, 64px)` and — for the SECOND time on this card — a
  `translateX(-50%)`. Overriding only `position`, `top`, `right` and `width`
  produced a 96x64 box at x=577 on a 1100px card: my width, their left, their
  transform, their height. This is the same failure as the EXP ring above, and
  both were a transform surviving an override that looked complete.
- **The containing block is the ZONE, not the card.** Both zones are
  `position: relative`, so the content-branch pager anchors inside the content
  column, whose right edge is the command column's LEFT edge — `right: 0`
  parked it on the material strip. It reaches one command column further right
  (`right: calc(-1 * var(--iw-skill-v2-command-w))`); the command-branch copy
  uses `right: 0` because it is already there.
- **BOTH branches are pinned, and the gutter is reserved with `:has()`.** Left
  in flow the command-branch pager added 14px to its card and only to its card
  (herbalism 98 against 84.5 for the same content without one) — the per-shape
  inconsistency the redesign exists to remove. Out of flow it costs no row, but
  it still needs somewhere to be, so the command column takes
  `padding-bottom: 25px` only on a card that carries one.

**The content column WRAPS; it does not stack.** Measured on a real card that
column is ~860px wide and every line owned a row, so a ~210px title and a 65px
"BASE: 154" chip cost two rows and ~640px of empty space each. It is
`flex-flow: row wrap` now: the title and chip share row one, an un-roled
summary line joins them when it fits (`flex: 1 1 auto; min-width: 190px`) and
drops to its own row when it does not, and anything that owns a row by meaning
— a material strip, the tab strip, the expanded body — asks with
`flex: 0 0 100%`. No breakpoint, and no knowledge of which lines a skill ships.

**A flex item sizes from `width`, so `flex: 0 1 auto` alone does nothing to an
item the base sheet gives an explicit width.** The title measured 832px on a
1100px card and filled its row however the container was set to wrap;
`width: auto` is what actually makes the base size content-based. The check
that catches this is "the title and the BASE chip share one row" — the height
checks pass on a stacked column too, so without it the wrap is unpinned.

Net: a simple card is **84.5px** against the 128.5px it started at, a pager
card 92px, and the tallest 92.5px — with no card-specific rule anywhere.

**A flex item cannot break its own line with a pseudo-element.** The summary
stack wants the BASE chip on its own row under the title, and a chip given
`flex-basis: 100%` draws its border across the whole column. `::after` on the
chip is an inline child OF the chip, not a sibling flex item, so it cannot
break the line at all. One real zero-height item can, and the controller
appends one (`data-iw-skill-v2-break`).

## Where a material line is CUT (the repeated-copy card)

**`textContent` never inserts a separator between elements, and the live
material line is not bullet-separated.** Curtis reported (2026-09-16) a card
that rendered its own copy run together — `Needs level 73Base: 220Gather…` —
repeated down three columns and wrapped mid-number. Three columns and a
mid-number wrap are `.iw-skill-v2-body`'s `repeat(auto-fit, …)` grid and
`.iw-skill-v2-body-row`'s `overflow-wrap: anywhere`, which places the defect in
the text those cells are BUILT from, not in the sheet that lays them out.

`ingredientEntries` (and `completedIngredientRanges`, which anchors the met
highlight identically) sliced each cell from the last `•` or `\n` before its
own count:

    const bulletStart = text.lastIndexOf('•', match.index - 1) + 1;
    const lineStart   = text.lastIndexOf('\n', match.index - 1) + 1;
    const start       = Math.max(bulletStart, lineStart);

Every fixture in this repo carried the one shape those anchors work on: all the
materials on one line, inside ONE text node, bullet-separated. Neither anchor
is reliable live.

- The lines this very file quotes from the live game use an **emoji per
  material** — `📦 Bloodstone Building Parts 298/2600`, `💠 Night Claw 22/100`
  — not `•`.
- `textContent` concatenates descendants with **no separator of any kind**, so
  a card whose materials are separate `<p>`/`<span>` nodes has no `\n` anywhere
  in the string either.

With neither present both `lastIndexOf` calls return -1, `start` is 0, and
every cell holds the whole run-up to its own count — the last one holding the
source's entire copy. Measured on the emoji line: cell 3 was 89 characters
against the material's own 28.

The fix adds two anchors that are ALWAYS there — the end of the PREVIOUS count,
so cells can never overlap, and the offset at which the enclosing element's own
text begins (`elementTextStarts`). Both are floors in the same `Math.max`, so a
bullet or a newline still wins wherever the game does provide one.

**The negative control is the whole lesson**: revert `entryStart` to
`Math.max(bulletStart, lineStart)` and `tests/ingredient-entries.test.mjs`
fails on the emoji, split-`<p>` and split-`<span>` shapes while the bullet
shape keeps passing. A fixture that models one separator style cannot see a
separator bug, which is why this survived every suite here for as long as it
did — the same family as "a fixture that omits a stylesheet will lie to you".

**The invariant worth keeping past this instance.** The skin writes text it read
from a game node in three places, and each is safe only while its SOURCE is not
an ancestor of its TARGET:

| writer | reads | writes into |
| --- | --- | --- |
| `SkillPanelRenderer.updateIngredientLists` | `[data-iw-ingr]` | `[data-iw-skill-ingredient-list]`, placed with `source.after()` |
| `SkillCardDesignController.ensureDetailBody` | `[data-iw-skill-v2-section]` | `[data-iw-skill-v2-body]` on the shell |
| `SkillCardDesignController.syncRequirementNote` | the requirement section | `[data-iw-skill-v2-req-note]` in the foot row |

Nothing in the code enforces containment; it holds today only because each
target lands as a SIBLING of its source. Violate it and the target's own text
is fed back into its input on every flush, which concatenates the previous pass
forever — the unbounded version of the same symptom. The last block of
`tests/ingredient-entries.test.mjs` asserts it directly, and
`claude/probe-text-runaway.mjs` checks it in a real browser across sixteen card
shapes (`--churn` re-renders the card from React's side mid-run).

## The XP readout is player-formatted (2026-09-21)

The game's level line (`title="Click to cycle XP display"`) cycles through at
least three forms: `Lv 63 - 69.2% • 6,277,190 to go`, `Lv 63 •
14,096,043/20,373,233 XP` and `Lv 71+2 - 5.24M/99.90M XP`. The skin used to
recognise it by wording alone, and only knew the first two. Reported live
(Curtis): with any non-percent form the V2 card broke. The compact form went
unrecognised (`Lv —` in the hero, the raw line as a plate in the content
column). In the whole-number form the counts are a have/need pair to
`INGR_PATTERN`, and the only thing that kept them out was the `\bxp\b`
lookahead, which fails as soon as the counts and "XP" are separate nodes
(textContent: `…867XP`, no boundary). The readout then became a material
source, the grid built after it made its ancestors match too, and a card with
no materials filled with doubled numbers.

- Resolve the readout by the `title` hook first (`findHookedReadout`), then
  by `isLevelReadoutText`, which accepts any value after the level.
- `neutraliseIngredients` never takes the readout, anything inside it or
  anything containing it as a source, whatever its text.
- The hero shows the readout verbatim under the discipline name
  (`[data-iw-skill-v2-xp]`, `SkillCardDesignController.xpLine`), minus the
  level and percent the medallion already shows. It is never recomputed, and
  a click or Enter forwards to the hidden game control, so the player can
  still cycle the format.
- `tests/skill-xp-formats.test.mjs` pins seven shapes. `node
  claude/probe-skill-cards.mjs --xp whole|compact|split` renders them. The
  live DOM shape of the whole-number readout has NOT been captured yet: the
  fixture's split shapes are the plausible candidates, not a measurement.
