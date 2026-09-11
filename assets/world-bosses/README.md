# World encounter artwork and reward sources

Generated with the built-in ImageGen tool on 2026-09-07. `encounters.png` is a 2×2 atlas: Ancient Treant, Abyssal Behemoth, World Eater, Zone Control (reading order). CSS selects quadrants without modifying the generated image.

The active Zone Control art uses three transparent square assets: `zone-control-red-v3.png`, `zone-control-blue-v3.png`, and `zone-control-contested-v3.png`. Each was generated and checked separately so both weapon axes remain continuous at UI scale. The earlier combined atlases are retained as unused drafts.

## Generation prompt

Use case: stylized-concept. Create a production game UI artwork atlas, a precise 2 by 2 grid of four square paintings with no gutters, no text, no borders. Dark detailed painterly fantasy RPG art, dramatic readable silhouettes, aged gold highlights, near black backgrounds at edges. Top left: Ancient Treant, mighty gnarled living tree guardian with emerald eyes, moss and branching crown in misty forest. Top right: Abyssal Behemoth, colossal blue sea monster with armored scales, luminous cyan eyes and horns in stormy ocean. Bottom left: World Eater, terrifying obsidian dragon-like cosmic titan with molten violet mouth devouring a shattered world, purple embers. Bottom right: a heraldic PVP emblem of two beautifully forged crossed steel swords over a round dark iron shield, crimson cloth banner left and royal blue cloth banner right, a small tattered gold pennant above shield. Each subject centered within its own quadrant with safe margins, no elements crossing quadrant edges. High quality finished game art, square overall image.

### Zone Control crest prompts

Use case: stylized-concept. Generate one square transparent fantasy UI crest per state with a central crystal and aged-bronze reliquary. Exactly two straight swords form a symmetric X behind the crystal. The mandatory corner map for every state is: upper-left red hilt, upper-right blue hilt, lower-left blue tip, lower-right red tip. The red sword remains collinear on the backslash axis and the blue sword remains collinear on the forward-slash axis. Red control emphasizes ruby light, blue control emphasizes sapphire light, and contested control gives both equal strength around a cracked pale-gold crystal and broken crown. No extra weapons, bent axes, detached halves, flags, banners, text, checkerboard pixels, or watermark.

## Reward provenance

- https://idleworlds.com/items.json — names, icons resolved through the bundled atlases, and live item metadata. `rewards.json` retains a small fallback snapshot for unavailable item data.
- https://idleworlds.com/patch-notes — July 16 confirms Tailor's Gloves in the Treant pool; July 19 confirms Trader's Tokens for all bosses; August 28 confirms world-boss orb rewards and equipped trinket inclusion in tier determination.
- Upgrade Orb is deliberately a family entry with a representative icon, not a claim that the player receives a Copper orb. Its tooltip explains the equipped-tier rule.

The live item database supplies additional boss-specific items as its acquisition metadata changes. No gameplay API requests, join actions, or state writes are added by this decoration.

## Verification

`tests/world-boss-panels.test.mjs` covers rewards, original control identity, duplicate prevention, ownership states, ward HP mirroring, crest state, and teardown. `output/render-world-bosses.mjs` renders desktop/mobile previews and checks keyboard tooltip opening, text-only ownership updates through the actual shared watcher, ward integrity, and button-art survival through skill reconciliation.
