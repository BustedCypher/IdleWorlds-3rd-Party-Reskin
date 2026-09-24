# 8. Inventory (and the Salvaging list on the Village route)

Golden markup:

- before: [`generated/golden/dashboard/inventory.before.html`](generated/golden/dashboard/inventory.before.html)
- after: [`generated/golden/dashboard/inventory.after.html`](generated/golden/dashboard/inventory.after.html)

Sources: `src/modules/InventoryRenderer.js`, `InventoryModel.js`, `itemDisplay.js`, `AtlasService.js`. Background: [docs/traps/inventory.md](../../docs/traps/inventory.md).

The inventory is the one surface where the skin **replaces the visible row**:

- every native text branch of a row is hidden with inline `display: none`;
- a skin-built overlay is appended with the icon, the name, a stat rail, per-instance details and the quantity;
- the game's own controls (Equip, List, Lock …) are kept live and visible, and they are skinned.

## 8.1 The game's panel, as the theme expects it

```html
<div class="panel p-3.5">
  <div class="flex items-center justify-between">                           ← header row
    <div><h2>Inventory</h2></div>
    <div class="flex items-center gap-2">                                   ← tool row
      <div class="relative"><button aria-label="Filter inventory" title="Filter inventory"><svg/></button>
        <!-- open Filters menu mounts here, a positioned sibling of the button -->
      </div>
      <button aria-label="Search inventory" title="Search inventory"><svg/></button>
      <button aria-label="Equipment Window" title="Equipment Window"><svg/></button>
      <svg class="lucide lucide-package h-4 w-4 text-ember"/>              ← ornament, NOT a control
    </div>
  </div>
  <div class="flex gap-2"><button class="bg-orange-500">All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
  <div class="space-y-1.5">                                                 ← list: rows only
    <div class="compact-row py-2">
      <div><span>Iron Sword</span></div>                                    ← name (may nest "+3" in a span)
      <div><span>Tier 4 · Weapon</span><span>In loadout I</span></div>      ← meta / per-instance lines
      <div><span>x1</span></div>                                            ← quantity
      <button>Equip</button><button>List</button>                           ← controls (direct children or nested)
    </div>
  </div>
  <div class="flex items-center justify-between"><button>Prev</button><span>1 / 3</span><button>Next</button></div>
</div>
```

## 8.2 Panel marks

| Node | Mark |
| --- | --- |
| the inventory `.panel` | `data-iw-inventory-root="1"`, plus `data-iw-ui="section-frame"` (ch. 5 §5.1) |
| the `Inventory` heading | `data-iw-inventory-title="1"`, plus `section-title` and the collapse marks (ch. 5) |
| **directly after the header row** (the root's direct child that contains the title) | appended `<div class="fs-inv-rule" aria-hidden="true"></div>`, the title flourish |
| filter buttons (`All`, `Gear`, `Materials`, `Consumables`, `Drops`) | `data-iw-inventory-control="filter"`, `data-iw-compact-button="text"` + 3 compact layers (ch. 4 §4.5) |
| the **active** filter | also `data-iw-inventory-filter-state="active"`. Only that one. It follows the game's own active state (rule 5) |
| their shared parent (only when all filters share one) | `data-iw-inventory-filters="1"` |
| `Prev` / `Previous` / `Next` | `data-iw-inventory-control="page"`, `data-iw-compact-button="text"` + 3 layers |
| tool buttons (label empty or ≤ 2 chars, containing an `<svg>`) | `data-iw-inventory-control="icon"` |
| the tool row's bare `<svg>` ornament (a direct child of the row holding two or more icon controls) | `data-iw-inventory-control="glyph"`. It is deliberately styled as an ornament, not framed (rule 5: the game made it a non-control) |
| the page counter (`1 / 3`) | `data-iw-inventory-control="page-count"` |
| the list wrapper (the rows' shared parent, holding no title or controls) | `data-iw-inventory-list="1"` |
| the open Filters menu | `data-iw-overlay="popup"`, and its wrapper under the frame gets `data-iw-overlay-host="1"` (ch. 5 §5.6) |

Controls inside rows are never tool controls; the tool-control rules skip them.

## 8.3 Row marks: what happens to the game's own row children

For each **direct child** of a row (other than the skin's overlay), recursively:

| The child is… | Marks |
| --- | --- |
| an interactive element (`button`, `a`, `input`, `select`, `textarea`, `[role=button]`, `[tabindex]`) | `data-fs-preserved-action="control"`, `data-fs-action-kind="<kind>"`, `data-iw-compact-button="text"` (or `"icon"` when kind is `icon`), plus 3 compact layers. It stays visible, in place |
| a non-interactive element that **contains** interactive descendants | `data-fs-preserved-action="host"`, `data-fs-action-host="1"`, then the same rule applied to each of its children |
| anything else (pure text branches) | `data-fs-suppressed="1"` and inline **`display: none`** (normal priority) |

**Action kind**, from the control's text:

| Text | `data-fs-action-kind` |
| --- | --- |
| `Equipped`, `Unequip` | `equipped` |
| `Equip` | `equip` |
| contains `set bonus` | `set` |
| `List`, `Sell`, `Use`, `Deposit`, `Withdraw` | `secondary` |
| `Lock`, `Unlock`, or empty text with an `<svg>` | `icon` |
| anything else | `secondary` |

The row itself gets `data-fs-inv="<any non-empty value>"`. The CSS only tests presence: it keeps salvage rows, which are `<button>`s, out of the generic button plate. The extension's value is a rebuild signature; `diff-parity.mjs` compares presence only.

## 8.4 The overlay (appended as the row's LAST child)

```html
<div class="fs-inv-row fs-cat-gear has-details">
  <div class="fs-inv-icon" data-iw-item="iron_sword" data-iw-tooltip-trigger="1" tabindex="0"
       aria-haspopup="true" aria-expanded="false" aria-label="Iron Sword, item details"
       style="background-image: url(&quot;<base>assets/gear_icons_atlas.png&quot;); background-size: …; background-position: …; background-repeat: no-repeat;">
    <!-- enhancement badge, when "+N" (§8.6) -->
  </div>
  <div class="fs-inv-body">
    <div class="fs-inv-name"><span class="iw-item-ref" role="button" tabindex="0" data-iw-item="iron_sword" aria-haspopup="dialog" aria-controls="iw-tip" aria-expanded="false" aria-label="Iron Sword, item details"><span class="iw-item-name">Iron Sword</span><span class="iw-item-info" aria-hidden="true">i</span></span> <span class="fs-inv-plus">+3</span> <span class="fs-inv-sub">Lv 40</span></div>
    <div class="fs-inv-stats"><span class="fs-stat fs-stat--tier">Tier 4 · Weapon</span><span class="fs-stat fs-stat--pos">ATK +12</span></div>
    <div class="fs-inv-details"><span class="fs-inv-detail fs-inv-detail--loadout">In loadout I</span></div>
    <div class="fs-inv-requirements"><span class="fs-inv-requirement">Requires Combat Lv 30</span></div>
  </div>
  <span class="fs-inv-qty">×1</span>
</div>
```

### Classes on the overlay

| Class | When |
| --- | --- |
| `fs-cat-<category>` | From the item's catalogue `category` (§8.5) |
| `fs-inv-orb` | The item's `subcategory` contains "upgrade orb" |
| `has-details` / `has-requirements` | The details / requirements block is present |
| `is-equipped` | One of the row's preserved controls has kind `equipped`. **Toggles live** with that control (rule 5) |
| `has-set-action` | One of the row's preserved controls has kind `set` |

### Parts

| Part | Rule |
| --- | --- |
| **name** | A known item renders the `.iw-item-ref` span shown above (the tooltip workstream owns its behaviour; its markup is styled regardless). An unknown item renders `<span class="fs-inv-name-plain">Name</span>` |
| name split | A name ending ` Lv N` / ` Lv. N` is split into base + ` <span class="fs-inv-sub">Lv N</span>` |
| **`+N`** | ` <span class="fs-inv-plus">+N</span>`, only when the row shows a separate `+N` enhancement (N 1–9) that the resolved item name does not already end with |
| spacing | A **space** precedes `.fs-inv-plus` and `.fs-inv-sub`. They are real text spaces; keep them |
| **stats** | `statChips(item, { max: 8 })` from `itemDisplay.js` (copy verbatim). Each chip renders as `<span class="fs-stat">…</span>` plus `fs-stat--pos` for kind `pos`, `fs-stat--tier` for kind `tier`, nothing for `plain`. The block is omitted when there are no chips |
| **details** | `buildInventoryDetails(texts, item, name)` from `InventoryModel.js` (copy verbatim). Each detail renders as `<span class="fs-inv-detail fs-inv-detail--<kind>">text</span>`, with `<span class="fs-inv-detail-count">×N</span>` appended when `count > 1` |
| **requirements** | Same model; `<span class="fs-inv-requirement">text</span>` each |
| **quantity** | `<span class="fs-inv-qty">×<qty></span>` (U+00D7). Omitted when there is no quantity |

**Details are per-instance state.** The static catalogue cannot know it, so it comes from the row:

| Detail | Examples |
| --- | --- |
| loadout membership | "In loadout I" |
| socketed gems | "Cut Sunstone: +3% …", counted when repeated: two identical gems give `×2` |
| the rolled bonus of an orb-upgraded item | from "🎲 +3 · +12 DEF · +3% 2x Gather Chance": the "🎲 +N" roll count is dropped, the stats remainder kept |
| upgrade state | "Not upgradable" is **dropped** for orb-upgradeable items below +4 |
| set-bonus state | |

**Natively, feed `buildInventoryDetails` the same strings your stock row prints for that item.** That is exactly what the extension does, and it guarantees identical output. Alternatively build the same `{ details: [{text, kind, count}], requirements: [text] }` from data. The strings must then match character for character, including order: details sort by kind (loadout, socket, effect, set, status, detail), then alphabetically.

## 8.5 Category classes

`categoryClass(item)` from `itemDisplay.js`:

| `category` | `subcategory` | Class |
| --- | --- | --- |
| Equipment | — | `fs-cat-gear` |
| Consumable | Potion | `fs-cat-potion` |
| Consumable | Enchant Scroll | `fs-cat-enchant` |
| Consumable | XP Scroll, XP Shard | `fs-cat-xpscroll` |
| Consumable | Supply Cache | `fs-cat-cache` |
| Consumable | anything else | `fs-cat-consumable` |
| Processed | — | `fs-cat-processed` |
| Resource | — | `fs-cat-resource` |
| Trade Good | — | `fs-cat-trade` |
| unknown | — | `fs-cat-unknown` |

## 8.6 Item icons (shared with quests, boss rewards and tooltips)

The icon host gets an inline sprite window at **normal priority** from one of two atlases:

| Atlas | Size | Layout | Keyed by |
| --- | --- | --- | --- |
| **Item atlas** `assets/item_icons_atlas.png` | 1269 icons | 10 × 48 cells of 128 px | `item_id` (authoritative), and name |
| **Gear atlas** `assets/gear_icons_atlas.png` | 1148 icons | 10 × 153 cells of 128 px | normalised name |

The atlas dimensions are in `theme-constants.json` → `itemAtlases`.

**Resolution order** (`AtlasService.resolve()`; port it verbatim with `aliases.js` and `normaliseItemName.js`):

1. item atlas by `item_id`;
2. item atlas by name;
3. gear atlas by name;
4. gear atlas with a trailing `+N` stripped (and remember N for the badge);
5. then the cloak alias table;
6. then a trailing ` Lv N` stripped;
7. then a trailing ` of X` stripped;
8. then a leading affix word stripped (`Gilded`, `Fortunate`, `Enchanted`, … see the source).

**Window:**

```text
atlasW = cols × cell,  atlasH = rows × cell
background-image    = url("<base>assets/<atlas file>")
background-size     = (atlasW / w × 100)% (atlasH / h × 100)%
background-position = (x / (atlasW − w) × 100).toFixed(6)% (y / (atlasH − h) × 100).toFixed(6)%
background-repeat   = no-repeat
```

**No match:** the icon host's text is `❓`.

**Enhancement badge** (the gear resolved with `+N`), appended inside the icon host:

- When the gear atlas has a `+N` sprite:

  ```html
  <span class="iw-icon-badge iw-icon-badge--sprite" aria-hidden="true" data-iw-badge="N" style="(the +N sprite window)"></span>
  ```

- Otherwise a text badge:

  ```html
  <span class="iw-icon-badge" data-iw-badge="N">+N</span>
  ```

## 8.7 Salvaging (Village route)

The Village route's `Salvaging` panel lists items as whole-row `button.compact-row`s: click selects the item. They get the **same overlay**, appended **inside the button**, so a click anywhere still reaches the game.

| Node | Mark |
| --- | --- |
| the rows' wrapper (`div.grid.gap-2`) | `data-iw-salvage-list="1"` |
| each `button.compact-row` | the row rules (§8.3–§8.4). Its only child branch is text, so it is suppressed. `data-fs-inv` keeps the button out of the generic plate |
| details | From the tier line's purple variant span (`· enchanted · socketed`): each word becomes a detail, kind `status` (`Enchanted`) or `socket` (`Socketed`). Salvaging destroys these, so they must show |

The empty-slot filler (`div.compact-row`, not a button) is left alone.

## 8.8 States to diff

- each filter active in turn;
- a row with Equip, then Equipped (`is-equipped` appears);
- an upgraded (+N) gear row, with badge;
- an orb row (`fs-inv-orb`);
- a row with two identical gems (`×2`);
- a row with a requirement;
- an unknown item (plain name, `❓` icon);
- the Filters menu open;
- pages 1 and 2.
