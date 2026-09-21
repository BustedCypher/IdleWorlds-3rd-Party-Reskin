# XP-format-agnostic skill cards

**Reported 2026-09-21 (Curtis).** With the game's XP display set to anything
other than the percent form, the V2 skill card breaks: the XP counts land in
the materials grid as fake "ingredients" (doubling and running together:
`14,096,043/20,373,23314,096,043`), the frame widens, and in the compact form
the hero shows `Lv —` while the raw readout sits in the content column as a
plate.

## What the skin does today

The game's level line is a button, `title="Click to cycle XP display"`, and the
player can cycle it through at least three forms. The skin recognises it by
TEXT alone (`LEVEL_PROGRESS_PATTERN`, `SkillPanelRenderer.js:359`):

| Game form | Example | Recognised as readout | Matches `INGR_PATTERN` |
| --- | --- | --- | --- |
| Percent | `Lv 63 - 69.2% • 6,277,190 to go` | yes | no |
| Whole numbers | `Lv 63 • 14,096,043/20,373,233 XP` | yes (whole string) | no (whole string) |
| Compact | `Lv 71+2 - 5.24M/99.90M XP` | **no** | no |
| Whole numbers, `XP` in its own node | `14,096,043/20,373,233` | **no** | **yes** |

(Measured with `node -e` against both regexes, 2026-09-21.)

Two failures follow from this.

1. **Compact form (screenshot 4).** The readout never gets
   `data-iw-skill-role="level-progress"`, so V2 does not hide it, it renders as
   a plate in the content column, and `levelReadout()` finds no `Lv N` and
   prints `Lv —`.
2. **Whole-number form (screenshots 1 and 2).** Only the percent form is safe
   from the ingredient sweep, and only because of the `(?!.*\bxp\b)` lookahead
   in `INGR_PATTERN`. Any node that holds the `N/M` counts without the word
   `XP` in its OWN text (`textContent` joins siblings with no separator — see
   CLAUDE.md) matches as an ingredient line. `updateIngredientLists` then builds
   a grid after it, the grid's text makes the parent match too, and the
   outermost source wins — which is the runaway the
   `probe-text-runaway.mjs` containment invariant describes. That is why a
   Woodcutting card with no materials at all shows three material cells, one
   of them `Needs level 65` glued to the XP numbers.

The existing fixtures cannot see (2): `probe-text-runaway.mjs --shape
xp-readout` puts the whole readout in one text node inside the button, where
the sweep already skips it. **The live node that seeds the grid has not been
captured yet** — see step 0.

## The fix

The principle: the XP readout is DATA the player has chosen a format for, not
card content. Identify it by structure, exclude it from every content
classifier, and show it in the hero column in whatever format the player
picked.

### 0. Capture first (Curtis)

Before any code, one run of `claude/capture-skill-cards.js` on the live page,
with the XP display in the whole-number form and again in the compact form.
It records the element tree per card, which tells us whether the seed is a
child of the readout button, a sibling span, or a separate node (e.g. a
progress-bar label). Steps 1–2 are written to be correct in all three cases,
but the fixture in step 5 must model the real shape or it will pass while
live stays broken (docs/traps/test-harness.md).

### 1. Identify the readout by its hook, not its wording

`SkillPanelRenderer.js`, where `levelProgressButton` is resolved (~line 1014):

- First choice: `panel.querySelector('[title*="XP display" i]')`. This is one
  of the game's few stable hooks and survives every format, including ones
  the game adds later.
- Fallback: a relaxed pattern that accepts any value after the level —
  `^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-–•·]\s*.*(?:xp|to go|%)$` — so `5.24M`,
  `1.2B`, `k` suffixes and any separator are all accepted.
- Keep the current strict `LEVEL_PROGRESS_PATTERN` only for the title-fallback
  check at ~line 1118, where it guards against mistaking the readout for the
  title.

Also expand the resolved node to its `outerSameTextShell` and, when the
counts and the `XP` word are split across siblings, to the smallest ancestor
whose text matches the relaxed pattern, so the role covers every node the
readout is painted from.

### 2. Keep the readout out of the content classifiers

In `neutraliseIngredients` (~line 754) and `markSections` in
`SkillCardDesignController.js`:

- Skip any element inside `[data-iw-skill-role="level-progress"]` (as well as
  inside a button, as now). This is the rule that was missing whenever the
  readout is not a single button.
- For an element that CONTAINS the readout, test `INGR_PATTERN` against its
  text with the readout's text nodes removed (a TreeWalker that rejects nodes
  inside the readout), not against `textContent`. This replaces reliance on
  the `\bxp\b` lookahead, which only ever protected the one format.

The lookahead stays as a second line of defence. Nothing here writes to a game
node; it only narrows what the skin reads (rule 1).

### 3. Show the XP in the hero, under the skill name

`SkillCardDesignController.levelReadout()` already builds the hero's
`Lv N` / `%` block from the readout. Add one skin-owned line to that block,
under the discipline label (`WOODCUTTING`):

```
      [medallion]
       Lv 64
       26.9%
    WOODCUTTING
  6,676,891 / 24,850,867 XP     <- new, .iw-skill-v2-xp
```

- Text: the readout with the `Lv N` prefix removed and the percent removed
  (both are already shown above it). That is format-agnostic by construction:
  - percent form → `6,277,190 to go`
  - whole numbers → `14,096,043 / 20,373,233 XP`
  - compact → `5.24M / 99.90M XP`
  The skin never converts or recomputes the number — the player's chosen
  format is shown as the game printed it (rule 5).
- Written with the existing `setText` guard so a ticking value is one text
  write per real change and no childList loop.
- Marked `data-iw-skill-v2-xp`, appended inside the existing
  `[data-iw-skill-v2-level-readout]` node, so it is excluded by the same
  `[class*="iw-skill-v2"]` guard every classifier already applies to skin
  nodes, and removed by the existing teardown with its parent.
- CSS (skillcard-v2.css): small tabular-nums, muted, `white-space: nowrap`,
  `text-overflow: ellipsis` with a max-width equal to the hero column so a
  long whole-number string shrinks instead of widening the card. Below the
  mobile breakpoint, allow a break only at ` / `.
- **Optional:** make the line clickable and forward the click to the hidden
  game button (`readout.click()`), so players can still cycle the format with
  the readout hidden. Forwarding keeps what the control does unchanged; worth
  confirming you want it before adding.

The game's readout stays hidden in V2 exactly as today
(`skillcard-v2.css:164`), so the content column holds only the title, BASE
chip, materials/sources and an unmet requirement, whatever the XP setting.

### 4. Percent in the medallion for every format

`levelReadout()` takes the percent from `.fs-skill-identity-percent` first,
which `progressPercent()` derives from the progress bar's fill width or
`aria-valuenow`, not from the readout text. That already works in all three
forms (screenshots show 69.2%, 96.1%, 5.2%). The level parse needs the step-1
role to exist; with it, `Lv 71+2` resolves in the compact form.

### 5. Tests

- `tests/skill-xp-formats.test.mjs` (new, Playwright, appended to
  `test:run`): one card per format — percent, whole numbers in one node,
  whole numbers with `XP` split out, compact — using the shape from step 0.
  Asserts, per card:
  - no `[data-iw-ingr]` and no `.fs-skill-ingredient-grid` on a card without
    materials;
  - a crafting card's grid has exactly its real materials and no cell
    contains `XP`-sourced digits;
  - hero shows `Lv N` (never `Lv —`) and the `.iw-skill-v2-xp` line equals
    the expected format-stripped text;
  - card width identical across the four formats (the frame no longer
    depends on the setting);
  - after 3s of ticking the readout, panel text length is stable (the
    runaway check).
- Negative control: revert step 2 and confirm the split-`XP` card fails the
  grid assertion; revert step 1 and confirm the compact card fails on `Lv —`.
- Add `xp-split` and `xp-compact` shapes to `claude/probe-text-runaway.mjs`.
- Smoke test: kill-switch round-trip still leaves no `data-iw-skill-v2-xp`.

### 6. Verification level

Built and fixture-rendered only, until Curtis checks live with the XP display
cycled through every form. The capture in step 0 is what makes the fixture
trustworthy.

## Files touched

- `src/modules/SkillPanelRenderer.js` — readout resolution, ingredient sweep
  exclusion
- `src/modules/SkillCardDesignController.js` — hero XP line, section-marking
  exclusion
- `src/styles/skillcard-v2.css` — hero XP line
- `tests/skill-xp-formats.test.mjs`, `package.json` (`test:run`),
  `claude/probe-text-runaway.mjs`
- `docs/traps/skill-card-v2.md` — a short entry: the readout is player-
  formatted, detect it by `title`, never by its wording
- `dist/content.bundle.js` — rebuilt
