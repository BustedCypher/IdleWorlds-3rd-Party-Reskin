# 7. Quest cards (bounties and work orders)

Golden markup:

- before: [`generated/golden/dashboard/quests.before.html`](generated/golden/dashboard/quests.before.html)
- after: [`generated/golden/dashboard/quests.after.html`](generated/golden/dashboard/quests.after.html)

That example is a work order with a disabled Turn In and Skip (8). Source: `src/modules/QuestPanelRenderer.js`. Background: [docs/traps/classification.md](../../docs/traps/classification.md) (the skip-note section).

## 7.1 The game's card, as the theme expects it

```html
<div class="compact-panel p-2.5">
  <div class="space-y-2">                                          ← BODY (the card's single child)
    <div class="flex items-start justify-between gap-3">           ← ROW
      <div class="min-w-0 flex-1">                                 ← CONTENT column
        <p class="text-[10px] uppercase …">Crafting Work Order</p> ← kicker (work orders only)
        <p class="text-xs font-semibold text-white">Craft and turn in 38 Ironwood Planks.</p>  ← title
        <p class="mt-1 text-[11px] text-white/45">💠 Night Claw 22/100</p>                    ← objective
        <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +12,480g • +9720 crafting XP</p> ← reward
      </div>
      <div class="flex shrink-0 flex-col gap-2">                   ← COMMANDS
        <button disabled>Turn In</button>                          ← "Turn In" / "Turn In All (38)"
        <button>Skip (8)</button>
      </div>
    </div>
    <p>Out of skips - they reset daily at …</p>                     ← optional skip note (own row)
    <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="… rounded-full …" style="width: 22%"></div></div>
    <div class="text-[11px] text-white/45">22% complete</div>
  </div>
</div>
```

## 7.2 Card root

| Mark | Value |
| --- | --- |
| class | add `fs-quest-panel` |
| `data-iw-quest-state` | `ready` when Turn In exists and is enabled; else `work-order` when a Skip exists; else `active` |
| inline `--fs-quest-accent` | the discipline accent (§7.5) |
| inline `--fs-quest-cmd-w` | the COMMANDS block's rendered width, rounded to whole px (`148px`); see §7.6 |
| `data-iw-skills-ui-ready` | `1` |
| inline custom properties | the 33 `skillsUi.inlineStyle` entries (same as a skill card, ch. 6 §6.3) |
| `data-fs-quest` | `1` (bookkeeping, optional) |

- The state follows `disabled` on every render. The game disables all buttons during any request.
- The Turn In and Skip buttons draw the quest rail's atlas art. That is why the card needs the atlas variables.

## 7.3 Roles and zones

| Node | Mark |
| --- | --- |
| body (the card's direct child holding the row) | `data-iw-quest-zone="body"` |
| row (the common ancestor of the content column and the commands) | `data-iw-quest-zone="row"` |
| content column | `data-iw-quest-zone="content"` |
| commands block (the Turn In / Skip parent) | `data-iw-quest-zone="commands"` |
| the skip note's host: the body's **direct child** that contains the skip note | `data-iw-quest-zone="skip-note"` |
| kicker: the first content line, when there are two or more lines and it contains "work order" | `data-iw-quest-role="kicker"` |
| title: the next content line | `data-iw-quest-role="title"` |
| any further content lines (not objective / reward) | `data-iw-quest-role="brief"` |
| objective: the line with `N/M`, not the reward and not the percent | `data-iw-quest-role="objective"` |
| reward (`Reward: …`) | `data-iw-quest-role="reward"`, `data-iw-quest-reward="<text after 'Reward:'>"` (**read by the CSS** as the chip text) |
| `N% complete` | `data-iw-quest-role="progress-label"` (`data-iw-quest-percent` is bookkeeping) |
| the `Out of skips …` line | `data-iw-quest-role="skip-note"` |
| progress track / fill | `data-iw-quest-role="progress-track"` / `"progress-fill"` (keep the game's `width`) |
| Turn In button (label contains "turn in") | `data-iw-quest-role="turn-in"` |
| Skip button (label starts with "skip") | `data-iw-quest-role="skip"` |

- The Turn In label is live ("Turn In All (38)"). The button **grows with its label**, and the art is sliced so the ends stay undistorted ([docs/traps/sprites-and-buttons.md](../../docs/traps/sprites-and-buttons.md)). Keep the label as the game renders it.
- The skip-note host sits in grid row 4, spanning the full width, only while it exists. Do not render an empty host when there is no note.

## 7.4 The sigil (inserted as the body's FIRST child)

```html
<span class="fs-quest-sigil" aria-hidden="true" data-iw-quest-glyph="✦" data-iw-quest-icon="1">
  <span class="fs-quest-sigil-icon" aria-hidden="true" style="background-image: url(&quot;<base>assets/item_icons_atlas.png&quot;); background-size: 1000% 4800%; background-position: 66.6667% 59.5745%; background-repeat: no-repeat;"></span>
  <span class="fs-quest-sigil-pct">22%</span>
</span>
```

| Part | Rule |
| --- | --- |
| `data-iw-quest-glyph` | The discipline glyph (§7.5). **Read by the CSS** (drawn with `content: attr()`) as the fallback when there is no icon |
| `.fs-quest-sigil-icon` + `data-iw-quest-icon="1"` on the sigil | Only when the objective's item has a sprite (§7.7). Otherwise both are absent and the glyph shows. The sprite window is computed like every item icon (ch. 8 §8.6). The resolver sets the position with `toFixed(6)` (`66.666667% 59.574468%`); the browser serialises it to 6 significant digits, as shown above. Both are the same computed value |
| `.fs-quest-sigil-pct` | `<pct>%` from the `N% complete` line, or else the fill's `width`. Absent when neither exists |

## 7.5 Discipline accent and glyph

Match the **reward text** against these patterns in order. The first match wins; no match falls through to the generic style. The table is in `theme-constants.json` → `questDiscipline`.

| Pattern (case-insensitive, whole word) | `--fs-quest-accent` | Glyph |
| --- | --- | --- |
| combat | `#B84A20` | ⚔ |
| mining | `#84919B` | ⛏ |
| smithing | `#B28A2A` | ⚒ |
| gathering / herbalism | `#579A5D` | ❧ |
| alchemy | `#9271B2` | ⚗ |
| jewel / jewelcrafting | `#4E9FB8` | ◆ |
| spell / spellcrafting | `#8B6FC3` | ✧ |
| tailoring | `#A56E86` | ⋈ |
| wood / woodcutting | `#8B6A3A` | ⋔ |
| construction | `#5F7F72` | ⌂ |
| crafting | `#5E8FB7` | ✦ |
| fishing | `#478FA8` | ⌁ |
| *(no match: a gold-only bounty)* | `#C9A66A` | ❖ |

Natively, use the quest's reward-XP discipline. It must produce the same row as the extension's text match. For example "+810 **combat** XP" gives `combat`.

## 7.6 `--fs-quest-cmd-w`

Below 640 px the CSS takes the commands block out of flow, and the text lines reserve its width by hand: `calc(var(--fs-quest-cmd-w, 116px) + 8px)`. So the card needs the block's real width.

- Measure the commands block's rendered width, round it to whole px, and write it inline on the card.
- Re-measure when the Turn In label changes, or when the layout changes.
- A width of 0 means a hidden copy: keep the last real value.

Natively, use `useLayoutEffect` plus a `ResizeObserver` on the commands block.

## 7.7 The objective item

The objective's item name is the objective text with the leading non-letter run removed and the trailing ` N/M…` removed:

- `💠 Night Claw 22/100` → `Night Claw`;
- `Iron Gloves+3 0/1` → `Iron Gloves+3`.

Natively, use the objective's item id directly.

- **Icon.** Resolve it with the same resolver the inventory uses (ch. 8 §8.6): item atlas by id, then by name, then the gear atlas with its fallbacks. An upgraded gear name (`+3`) also gets the enhancement badge inside the icon (ch. 8 §8.6).
- **Tooltip hook** (tooltip workstream, ch. 1 §1.7). When the item is known, the objective `<p>` gets:
  - `data-iw-item="<id>"`, or `data-iw-item-name="<name>"` when there is no id;
  - `data-iw-tooltip-trigger="1"`, `tabindex="0"`, `aria-haspopup="dialog"`, `aria-controls="iw-tip"`, `aria-expanded="false"`.

  `skillpanel.css:2884` styles an objective **with** the trigger as a hoverable link, so the paint depends on that workstream's toggle.

## 7.8 States to diff

| State | Marks that change |
| --- | --- |
| bounty, in progress | `data-iw-quest-state="active"` (no Skip) |
| work order, in progress | `work-order` |
| turn-in ready | `ready` (Turn In enabled) |
| out of skips | the skip-note role and zone appear |
| busy (all buttons disabled) | `ready` becomes `work-order` / `active` for that moment, exactly as the extension does |
| "Turn In All (N)" | the button widens; `--fs-quest-cmd-w` follows |
| objective item with no sprite | no icon; glyph fallback |
| gold-only reward | generic accent `#C9A66A` and glyph ❖ |
