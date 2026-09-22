# Reskin Launch Bug Triage Design

**Date:** 2026-09-20

**Purpose:** Record the first production reports from the fantasy reskin launch, distinguish confirmed causes from live-DOM hypotheses, and define observable acceptance criteria before implementation.

## Constraints

- Presentation only: preserve the game's controls, handlers, state, text, and navigation.
- Do not reparent React-owned nodes.
- Every added attribute, inline property, or node must be removed by the owning teardown.
- Preserve state signals such as active tabs, queued bosses, met materials, and disabled controls.
- Keep `ui-system.css` last in injection order and rebuild `dist/content.bundle.js` after source changes.
- Fixture verification is not live verification. Reports whose exact DOM is not represented below require a live computed-style/DOM capture before the final selector is committed.

## Investigation Summary

| # | Report | Confidence | Evidence and likely cause |
|---|---|---|---|
| 1 | Ancient Treant omits Woodcutters Gloves and Builders Gloves | Confirmed | `WorldBossPanels.BOSSES` explicitly lists seven glove IDs and omits `woodcutters_gloves` / `builders_gloves`. The live item catalogue now contains both records. The local sprite source also contains their final 128x128 cells: `Woodcutter's Gloves` at `(896, 1024)` and `Builder's Gloves` at `(1024, 1024)` in `gear:gloves`; the same cells occupy the two unused slots `(896, 19456)` and `(1024, 19456)` in the refreshed legacy gear atlas. The extension's bundled atlas predates those cells. |
| 2 | Prejoin does not read clearly as queued | Confirmed design gap | The renderer correctly maps native `Prejoined` to `data-iw-boss-action-state="active"` and the visible word `Queued`. Existing CSS centres the word, but there is no persistent active-state glow/ring. Current tests prove centring, not state contrast. |
| 3 | Active main-menu labels can become unreadable | Partially confirmed | Active state is derived and written as `data-iw-state="active"`. Two sheets set `color`, including descendants, but neither neutralises `-webkit-text-fill-color`, opacity, or an inline/native descendant paint. The existing atlas test uses a benign nested span, so it cannot reproduce the live hostile label style shown in the report. A live capture must identify which property wins. |
| 4 | Dungeon uses the legacy top menu | Partially confirmed | Compact menu art is gated by `<html data-iw-compact-atlas="compact-ghost-v3">`, which is installed only when `HeaderRenderer` resolves a zone theme. A cold load on a route without the Game-only zone bar can clear those variables. Existing no-zone-bar tests check row geometry only, not visual atlas activation, and do not exercise a cold `/dungeon` load followed by a route remount. |
| 5 | Skill pager moves to the top on material-heavy recipes | High confidence | `skillcard-v2.css` says a content-branch pager should resolve against the full card, but the shared `[data-iw-skill-zone] { position: relative }` makes the short content zone its containing block. The existing reset selector clears intermediary wrappers but explicitly excludes the zone itself. Taller material bodies expose the mismatch. |
| 6 | Inventory Filters pop-up is behind frames and unthemed | High confidence boundary gap; exact hook needs capture | `OverlayFramer` only recognises full-viewport fixed scrims. Anchored popovers are therefore never tagged. Inventory also forces `overflow: hidden`, while shared frame children become equal `z-index: 1` stacking contexts; an anchored menu inside an earlier child cannot rise over a later inventory-list sibling. |
| 7 | Wood Chopped is uniquely bold in Player Stats | Live-DOM capture required | No current module classifies Player Stats rows or sets `Wood Chopped` by text. The generic overlay intentionally leaves inner content untouched. The screenshot proves a one-row weight difference, but not whether it comes from a native class, inline style, or wrapper element. |
| 8 | Out-of-skips copy is trapped in the quest's left column | High confidence | Quest CSS defines a two-column body grid with named areas for sigil, row, track, and label. `QuestPanelRenderer` has no role for the `Out of skips` helper. An unclassified direct child is auto-placed into the first grid column, matching the screenshot. |

## Accepted Behaviour

### 1. Complete Treant rewards

- Ancient Treant lists `Woodcutter's Gloves` and `Builder's Gloves` in Possible Rewards, keyed by `woodcutters_gloves` and `builders_gloves`.
- Tooltips come from the live `ItemDatabase` records: DEF +1 and the corresponding Woodcutting or Construction level +4 bonus.
- Both tiles render the final local glove artwork through `AtlasService`; neither falls back to the diamond glyph.
- The imported cells retain the source audit hashes so stale or substituted artwork fails verification instead of silently shipping.

### 2. Queued world-boss state

- `Prejoin` remains the idle label and native click target.
- Native `Prejoined` remains the accessible text and is presented as `Queued`.
- The active state has a persistent luminous border/glow that remains obvious without hover.
- Any pulse stops under `prefers-reduced-motion: reduce`; the static active ring remains.
- Disabled/fighting/defeated states keep their native meaning.

### 3. Active main-menu readability

- Exactly one active route remains visually distinct.
- Its label and any native child wrappers remain readable in every zone theme, including a hostile native `color`, `-webkit-text-fill-color`, and reduced opacity.
- Compact artwork layers are not recoloured as text.
- Inactive labels retain their normal muted colour.

### 4. Dungeon menu parity

- Game, Market, Leaderboards, Village, and Dungeon use the same compact menu component and state treatment.
- A cold load on `/dungeon` receives compact art even before a Game-route zone bar has been observed.
- Navigating Game -> Dungeon -> Game does not lose the atlas or duplicate Toolkit.
- The fallback compact theme is forged-metal when no zone is known; it does not claim that the player's gameplay zone is forged-metal.

### 5. Stable skill pager

- Previous/next controls remain a fixed gap below the action button for both pager DOM shapes.
- Adding one through six material cells may grow the card but must not change the button-to-pager gap or separate the pager from the command stack.
- Desktop and phone layouts remain inside the card and retain minimum touch targets.

### 6. Top-level contained pop-ups

- A visible anchored menu/dialog/listbox inside a framed surface paints above every ordinary child of that frame.
- The closest direct child hosting the pop-up is lifted as a unit so descendant `z-index` is not trapped by sibling stacking contexts.
- Overflow is relaxed only while an owned pop-up is open; the closed frame returns to its current clipping.
- Anchored pop-ups receive the forged panel ground, border, type, and control treatment.
- Full-screen dialogs continue through the existing scrim path; tooltips and skin-owned surfaces remain excluded.

### 7. Player Stats typography

- All Lifetime Stats labels use the same normal weight.
- Numeric values keep their existing emphasized weight.
- The correction is scoped to the Player Stats/Lifetime Stats surface, not every occurrence of the words `Wood Chopped`.

### 8. Quest skip note

- Copy beginning `Out of skips` spans the full inner width at the bottom of its quest card.
- It no longer inherits title/brief/command padding intended for the main content column.
- Quest cards without that helper are unchanged.
- The helper remains React-owned text; only semantic attributes and layout are added.

## Verification Baseline

On 2026-09-20 the relevant existing tests passed when run with browser permissions:

- `world-boss-panels.test.mjs`
- `boss-action-label.test.mjs`
- `compact-button-atlas.test.mjs`
- `compact-button-reconcile.test.mjs`
- `menu-rows.test.mjs`
- `skill-card-v2-render.test.mjs`
- `overlay-framer.test.mjs`
- `quest-card-detection.test.mjs`
- `quest-command-width.test.mjs`

Their passing status is a baseline, not coverage of these reports. Each implementation task must first add the missing negative control described in the implementation plan.
