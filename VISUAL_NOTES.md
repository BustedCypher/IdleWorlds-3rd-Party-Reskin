# IdleWorlds Fantasy Skin v1.4.2 — Ashen Iron visual pass

This pass keeps the v1.4.1 lifecycle/reconciliation fixes and addresses the structural styling problems observed in live IdleWorlds screenshots.

## Visual correctness fixes

- `.compact-panel` is no longer assumed to be a skill panel. Skill detection now requires a positive skill action/heading signal; Quests, World Bosses, Village and other compact panels remain ordinary panels.
- Removed the 54px artificial skill header spacer and duplicate pseudo-header/flavour text. Skill panels use the game's own title with a slim skill-colour edge and brass rule.
- Inline item tooltip references are focusable `<span role="button">` elements instead of native buttons, preventing IdleWorlds' global button styles from turning item names into large boxed controls.
- Inventory rendering is gated to actual Inventory context. Generic market/bank/salvage item rows are no longer rebuilt as inventory rows.
- Mixed inventory wrappers containing real React controls are visually flattened while preserving the original Equip/List/Lock nodes and handlers. Display-only duplicate branches are suppressed.
- BackgroundPainter now repaints structural surfaces only instead of treating arbitrary nested text wrappers as independent surfaces.

## Design-system changes

- New "Ashen Iron" surface palette: near-black forged surfaces, tarnished brass borders, restrained ember action accent.
- Large Tailwind card radii and padded pills are normalised to compact game-panel/control radii.
- Inputs use recessed trough styling rather than rounded blue dashboard fields.
- Native controls keep their game state colours but receive consistent geometry/focus treatment.
- Inventory item metadata is rendered as a compact data rail instead of a cloud of bordered chips.
- Inventory rows use a rarity edge, 48px art slot, aligned metadata and a right-side command rail.
- Tooltip metadata badges are now an inline context rail; tooltip framing uses a compact brass/iron treatment.

## Validation

- JavaScript syntax checks pass for all runtime modules.
- Data-service resilience tests pass.
- Static lifecycle + visual invariant tests pass.
- Production bundle rebuilt without an inline source map.

## Live-test focus

1. Verify non-skill compact panels have no blank header band.
2. Verify Royal Thyme/Kingssteel Ore/quest item names are inline text, not giant buttons.
3. Verify Inventory presents one item view per row and all Equip/List/Lock actions remain functional.
4. Verify Market, Housing Bank and Salvage no longer show a second fantasy item block beside the native row.
5. Verify top HUD, tabs, leaderboard filters and search inputs have reduced radii and consistent forged geometry.
6. Check for any remaining original navy surfaces; BackgroundPainter is deliberately less aggressive in this build.
