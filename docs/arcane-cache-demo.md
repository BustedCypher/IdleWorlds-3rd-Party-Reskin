# Arcane Cache demo

Approved direction, 2026-09-28: a temporary **Arcane Cache** toolbar button
immediately after Toolkit. Presentation only; no gameplay requests or inventory
changes. The trigger follows Toolkit's existing desktop visibility.

The initial reference was for inspiration only. The user clarified that the
chest should match the game's own detailed painted isometric art: dark walnut,
blackened iron, restrained aged brass and fine cyan rune/seam illumination.
The screen darkens; a chest drops and
falls quickly and eases into its landing over 440 ms, then waits indefinitely for the player to open it. Click,
tap, Enter or Space begins a three-second squash, swell, burst and **Loot Fan**
reveal. The burst uses light rays, runic sparks, two expanding shockwaves and
64 particles. The chest first pulls back and lowers slightly, swells into the
pop, then eases into a smaller, lower resting position as the loot rises. The
card row clears the entire open-lid sprite, including during its gentle float;
responsive spacing keeps the heading and loot controls separate too.
Sample rewards settle into gently floating portrait trading cards: name across
the top, large 128px item artwork in a framed art well, a quieter stat breakdown
with one effect per line, and requirements in the footer. Stack counts remain
in a corner badge. Rarity is conveyed
by the frame accent and accessible text. Replay resets everything. Close and
Escape work in every phase.

Implementation uses `ArcaneCacheDemo.js`, `ArcaneCacheLootView.js`, a pure reward
model/table and scoped animation CSS. A native modal dialog handles page inertness and focus;
the animation's contents live in a shadow root so page classifiers, global
button styles and the central MutationObserver cannot adopt them. Only the
toolbar button and dialog host are in the game's light DOM. Every asset ships
with the extension. All timers, modal state and owned elements are cleared on
teardown. Reduced motion uses quick state transitions without drop, shake or particle motion.
It also disables card floating. The loot view releases its viewport and data
listeners when the modal closes. Atlas and item-data updates refresh existing
cards without rerolling rewards.

## Bulk opening

The second toolbar button, **Caches ×20**, launches the same cinematic with a
20/50/100 selector. Each cache generates a gold roll, a monster-resource roll,
and a bonus roll from a small sample pool. Duplicate identities sum their
quantities. These are deliberately illustrative demo rolls, not the game's odds.

Only Rare-and-above **items** appear on cards in bulk mode. Currency and all
resources (even rare gems), plus lower-rarity items, appear under **Resources &
Supplies** in the **Loot list** beneath the chest. Featured items also appear
under a plain **Rare Loot** subheading, including stacks on other card pages.
Empty groups are hidden; neither section is collapsible. This list is a second
view of the same quantities, not additional rewards or repeated announcements.
Single-cache results use the same list grouping while retaining all three cards.
Cards show three per page on desktop and one per page at
640px and below; every distinct featured item remains reachable. Pagination
and viewport changes never reroll or lose loot. A batch with no featured items
shows a list-only result. Replay retains the chosen batch size but rolls anew.

Descriptions and requirements read the same fields as TooltipEngine:
`effects_raw`, `req_text`, with `req_level`/`req_skill` fallback. The bundled
sample text comes from the repository's 2026-09-16 items.json snapshot; a
matching loaded ItemDatabase record takes precedence. Requirements are stated
neutrally: the preview does not claim to know whether the player meets them.
Stat splitting preserves thousands separators (for example, `ATK +1,250`).

Verification: browser tests exercise waiting, timing, reward contents, keyboard
activation, Escape during opening, replay, duplicate launches, disable/re-enable,
focus restoration, reduced motion, missing art, eased descent, anticipation and
lowered zoom-out, open-lid clearance, card floating, portrait artwork hierarchy,
separate stat lines and matching Rare Loot stacks,
20/50/100 batches, all-common results, pagination, and phone-size overlay layout.
Pure model tests pin conservation of quantities, resource routing regardless of
rarity, no input mutation, and the 1–100 count boundary.
Existing toolbar, smoke and quiescence suites protect integration. Screenshots
inspect the actual built bundle and bundled assets. This is fixture verification;
the user tests the installed extension in their live game.

## Trying the demo

Rebuild with `npm run build`, reload the unpacked extension, refresh IdleWorlds,
and select **Arcane Cache** or **Caches ×20** immediately after Toolkit (768px and wider).
For a local fixture without a game session, run
`node build-tools/preview-arcane-cache.mjs` and visit `http://localhost:64421/`.

`src/modules/arcaneCacheRewards.js` is the editable reward table. Rarities and
quantities are demo choices, not claims about actual game drop rates.

| Sample reward | Quantity | Demo rarity |
| --- | ---: | --- |
| Revenant Essence | 120 | Common |
| Cut Moonstone | 3 | Rare |
| Arcane Effigy | 1 | Epic |

These names use their matching bundled item/gear sprites. Chest artwork and
the final built-in Image Generation prompt live in `assets/arcane-cache/`.
