# 10. Village: the route panels, the dashboard scene, and the ledger

Golden markup:

- Village route panels: [`generated/golden/housing/`](generated/golden/housing/) (`village-housing`, `village-addons`);
- the dashboard scene and ledger: [`generated/golden/dashboard/village-scene.after.html`](generated/golden/dashboard/village-scene.after.html) (skin-only; it has no "before").

Sources: `src/modules/VillagePanels.js`, `VillageScene.js`, `VillageLedger.js`, `villageBuildings.js` (generated; copy verbatim). Background: [docs/traps/village.md](../../docs/traps/village.md).

**The biggest simplification in the whole port is here.** The dashboard never renders the village. To show it anyway, the extension:

- scrapes it from the Village route while the player stands there, and remembers it;
- polls `GET /api/player?section=…&scope=core` every 5 minutes;
- stamps the `x-idleworlds-league` header itself, because a content script cannot see the page's patched `fetch`;
- re-derives building identity from rendered names.

**Natively, all of that is deleted.** The village is already in the player store:

- `player.housing.tier`;
- `player.villageAddons.totalSlots`;
- `player.villageAddons.installed[{ slot, itemKey, name }]`.

## 10.1 Data model (one function, used by all three surfaces)

Port `normaliseVillage()` from `VillageScene.js` (pure). Given the player store, it returns:

```ts
type Village = {
  tier: 0|1|2|3|4|5;                    // housing tier; 0 = no house
  capacity: 0|1|2|3|4|5;                // totalSlots
  slots: Array<{                        // always 5 entries, slot 1..5
    slot: number;
    state: 'installed' | 'empty' | 'locked';        // slot > capacity → locked
    name: string;                       // installed only
    file: string | null;                // 'village/building_<tier>.webp' from VILLAGE_BUILDINGS
    itemKey: string;                    // 'construction_building_tier_<N>'
  }>;
};
```

- **Building identity:** match `itemKey === 'construction_building_tier_<N>'` against `VILLAGE_BUILDINGS[*].tier`; fall back to the normalised name (lower case, whitespace collapsed).
- **House:** `VILLAGE_HOUSES` by tier (1 Camp, 2 Cottage, 3 Villa, 4 Manor, 5 Citadel).

All 34 buildings and 5 houses, with their art files, are in `theme-constants.json` → `village`.

## 10.2 Village route: the Housing panel (`.panel` titled `Village`)

| Node | Mark |
| --- | --- |
| the panel | `data-iw-village="housing"` (plus `section-frame` and the collapse marks, ch. 5) |
| its `.compact-panel` (the house card) | `data-iw-village="house"`; `data-iw-village-tier="<0-5>"` is bookkeeping |
| the card's first direct `<p>` (`🏠 Villa` / `🏕️ No House`) | `data-iw-village-role="house-name"` |
| each later direct `<p>` | `house-tier` (`Current tier: …`), `house-salvage` (`Salvage Material owned: …`), `house-next` (`Next upgrade: …`), `house-max` (`Maximum housing tier reached…`), otherwise `house-note` |
| each button in the card | `data-iw-village-role="action"`, `data-iw-village-action="upgrade"` |
| appended to the card, after the game's children | `<div class="iw-village-art" data-iw-village-owned="1" aria-hidden="true" data-iw-village-art="house" style="--iw-village-sprite: url(&quot;<base>assets/village/house_<tier>.webp&quot;)"></div>`. For tier 0, or no matching house: `data-iw-village-art="generic"` and **no** `--iw-village-sprite` |
| appended after the art | `<div class="iw-village-tiers" data-iw-village-owned="1" aria-hidden="true">` holding **5** × `<span class="iw-village-tier-pip" data-iw-village-owned="1" data-iw-village-pip="held|open">` (`held` for the first *tier* pips) |

- The house art is a **custom property**, not `background-image`: the sheet paints the sprite on `::before` over the element's own ground ([docs/traps/village.md](../../docs/traps/village.md)).
- The tier comes from the `Current tier: N` line first, then from the house name. Natively, use `housing.tier`.

## 10.3 Village route: the Add-ons panel (`.panel` titled `🏗️ Village Add-ons`)

| Node | Mark |
| --- | --- |
| the panel | `data-iw-village="addons"` |
| its first direct `<p>` (`N slots available …`) | `data-iw-village-role="intro"` |
| any other `<p>` in the panel that is not inside a card (the trailing hint) | `data-iw-village-role="note"` |
| each slot card (a leaf `.compact-panel`) | `data-iw-village="slot"`, `data-iw-village-state="installed"` / `"vacant"` |
| the card's first child (head row) | `data-iw-village-role="head"` |
| head's first child (copy column) | `data-iw-village-role="copy"` |
| the copy's `<p>Slot N</p>` | `data-iw-village-role="index"` |
| installed: the next `<p>` (building name) | `data-iw-village-role="name"`, plus the tooltip hook when the building is a catalogue item (ch. 1 §1.7) |
| installed: the following `<p>` (effects) | `data-iw-village-role="effects"` |
| vacant: `<p>Empty slot</p>` | `data-iw-village-role="vacant"` |
| head's second child: a single button | that button: `data-iw-village-role="action"` |
| head's second child: a container | the container: `data-iw-village-role="actions"`, and each button inside: `action` |
| each action button | `data-iw-village-action` = `destroy` / `uninstall` / `install` / `cancel` / `other`, by its leading verb |
| the card's second child, **only while the install picker is open** | `data-iw-village-role="picker"` |
| each picker option: a `button` (installable) or a `div` (owned elsewhere) with a direct `<p>` name | `option` / `option-owned` |
| the option's name `<p>` | `data-iw-village-role="option-name"`. **Prepend** `<span class="iw-village-option-art" data-iw-village-owned="1" aria-hidden="true" style="--iw-village-sprite: url(…building_<tier>.webp)"></span>` when the building resolves. The count (`×2`) lives in the game's own `<span>` |
| appended to the slot card | `<div class="iw-village-art" data-iw-village-owned="1" aria-hidden="true" data-iw-village-art="building" style="--iw-village-sprite: url(…building_<tier>.webp)">` for an installed building; `data-iw-village-art="generic"` with no sprite for a vacant slot or an unknown building |

A card whose copy matches neither shape (no `Empty slot`, no name) gets **no** marks.

## 10.4 Other Village-route panels

- **Salvaging:** ch. 8 §8.7.
- **Housing Bank**, **Village NPCs:** frames only (ch. 5 §5.1).
- **Zone theme on this route:** `default`; button art `forged-metal` (ch. 3 §3.5).

## 10.5 Dashboard: the Village scene frame

**Position:** the **next sibling after** the Skill Actions `.panel` (the panel whose `h2` is `Skill Actions` or `Actions`), in whichever stack is rendering (ch. 3 §3.9). Nothing else may sit between them.

```html
<section class="iw-village-scene" data-iw-village-scene="1" data-iw-ui="section-frame" data-iw-panel="village-scene" aria-label="Village">
  <div class="iw-vs-heading">
    <div class="iw-vs-title" role="heading" aria-level="2">Village</div>
    <span class="iw-vs-count">1 installed / 3 slots</span>                ← only once the village is known
    <!-- collapse toggle appended here (ch. 5 §5.5; key panel:village-scene) -->
  </div>
  <div class="iw-vs-body">                                                ← only once the village is known
    <div class="iw-vs-stage">
      <div class="iw-vs-scene">
        <div class="iw-vs-house"><img class="iw-vs-sprite" src="<base>assets/village/house_3.webp" alt="" decoding="async"><strong class="">Villa</strong><span class="iw-vs-status">Housing tier 3</span></div>
        <div class="iw-vs-plot" data-slot="1" data-plot-state="installed"><img class="iw-vs-sprite" src="…building_11.webp" alt="" decoding="async"><strong class="iw-vs-name">Voidiron Archive</strong><span class="iw-vs-status">Slot 1 · Installed</span></div>
        <div class="iw-vs-plot" data-slot="2" data-plot-state="empty"><span class="iw-vs-placeholder">⌂</span><strong class="iw-vs-name">Empty plot</strong><span class="iw-vs-status">Slot 2 · Available</span></div>
        <div class="iw-vs-plot" data-slot="4" data-plot-state="locked"><span class="iw-vs-placeholder">◇</span><strong class="iw-vs-name">Locked plot</strong><span class="iw-vs-status">Slot 4 · Upgrade housing</span></div>
        … always five plots, slots 1–5 …
      </div>
    </div>
    <!-- the ledger, §10.6 -->
  </div>
  <p class="iw-vs-note">Your installed village. Manage housing and buildings in the Village tab.</p>
</section>
```

Every node inside also carries `data-iw-village-scene-owned="1"` (bookkeeping).

| Part | Rule |
| --- | --- |
| count | `<installed count> installed / <capacity> slots` |
| house | Art = `house_<tier>.webp`, or `<span class="iw-vs-placeholder">⌂</span>` for tier 0. Name = the house name, or `No House`. Status = `Housing tier <tier>` |
| plot art | `building_<tier>.webp` when installed with art. Otherwise a placeholder: `◇` when locked, `⌂` otherwise |
| plot name | the building name; `Locked plot` / `Empty plot` otherwise |
| plot status | `Slot <n> · Installed` / `Available` / `Upgrade housing` |
| note | `Your installed village. Manage housing and buildings in the Village tab.` while the village is shown. `Loading your village…` (U+2026) before the store has it; in that state render **only** the heading and this note |

The extension's two network-error messages cannot occur natively. Do not port them.

## 10.6 The ledger (the scene's reading)

This is the last child of `.iw-vs-body`, after `.iw-vs-stage`. The full markup is in the golden file. The structure:

```text
div.iw-vs-ledger[data-iw-village-ledger="1"][data-iw-vs-open="1|0"]
├─ div.iw-vs-ledger-head
│   ├─ div.iw-vs-ledger-title  "Buildings"
│   └─ button.iw-vs-ledger-toggle[type=button][data-iw-vs-toggle="section"][aria-expanded][aria-controls=<list id>][title]
│        └─ span.iw-vs-chevron[aria-hidden]
├─ div.iw-vs-ledger-list#<list id>
│   ├─ ENTRY (home)
│   └─ for slot 1..5: installed → ENTRY (building); else div.iw-vs-ledger-vacant[data-iw-vs-slot-state="empty|locked"] > span "Slot N" + span "Empty plot" | "Locked · upgrade housing"
└─ section.iw-vs-totals[data-iw-village-totals="1"]           ← a SIBLING of the list, never inside it
    ├─ div.iw-vs-totals-title[role=heading][aria-level=3]  "Overall stats"
    ├─ dl.iw-vs-stats (only when there are totals)
    └─ p.iw-vs-totals-note

ENTRY = div.iw-vs-entry[data-iw-vs-entry=<key>][data-iw-vs-open="1|0"]
        ├─ button.iw-vs-entry-head[type=button][data-iw-vs-toggle="1"][aria-controls=<body id>][aria-expanded][title]
        │    ├─ span.iw-vs-entry-icon[aria-hidden] > img.iw-vs-entry-sprite[src][alt=""][decoding=async]   (or the fallback text "⌂")
        │    ├─ span.iw-vs-entry-label > span.iw-vs-entry-name + span.iw-vs-entry-meta
        │    └─ span.iw-vs-chevron[aria-hidden]
        └─ div.iw-vs-entry-body#<body id>
             ├─ dl.iw-vs-stats > div.iw-vs-stat[data-iw-vs-stat-kind?] > dt(label) + dd(value)   (only when rows exist)
             └─ p.iw-vs-entry-note  (one per note; or the "empty" text when there are no rows and no notes)
```

`<dt>`, `<dd>`, the vacant-line `<span>`s and the house `<strong>` carry an **empty** `class=""` in the extension. That has no effect; omit it or keep it.

| Entry | Key | Name | Meta | Rows | Notes / empty text |
| --- | --- | --- | --- | --- | --- |
| home | `home` | house name or `No House` | `Home · tier <tier>` | tier > 0: `Village slots` = capacity | tier > 0: the housing perk lines (below). Tier 0: `Build a home on the Village tab to open your first plot.` |
| building | `building:<name lower-cased>` | building name | `Slot <n> · tier <item tier>` (the tier part only when known) | `buildingBenefits(item)` | catalogue loaded: `This building records no effects.`; not yet: `Effects arrive with the item database.` |

**Benefits** (`buildingBenefits` / `totalBenefits` in `VillageLedger.js`; port them verbatim with `deriveDisplayStats` from `itemDisplay.js`):

- **Rows, in this order when non-zero:** `ATK`, `DEF`, `HP`, `Warfare`, `XP / task` (flat), `2× gather`, `Gold find`, `Item find` (%), `All resists`, `Fire resist`, `Frost resist`, `Lightning resist` (flat), `Bonus brew`, `Bonus enhance`, `Bonus enchant` (%).
- **Value** = `+` when positive, then `Number(value.toFixed(2))`, then `%` for percentage kinds: `+4`, `+8%`.
- **Skill bonus:** a row labelled `<Skill> level`, with the first letter of each word capitalised (`Smithing level`), value `+N`, plus `data-iw-vs-stat-kind="skill-level"` on its `.iw-vs-stat` (drawn in amber).
- **Totals** sum **installed buildings only**. Skill levels are summed per skill (never pooled) and sorted by skill name.
- **Totals note:**
  - catalogue not loaded → `Waiting on the item database before totalling your buildings.`;
  - none installed → `No installed buildings yet, so nothing is counted here.`;
  - otherwise → `Summed from <N> installed building<s>. Housing is not counted.`

**Housing perks.** These are the lines after `Current tier: N •` on the Village route's tier line, split on `•` / `·` / `|`. For example, `Current tier: 4 • Base actions take 6s` gives `Base actions take 6s`.

- The extension knows them only after the player has visited `/housing` this session.
- **Natively you always know the tier's perks: show them always.** That is the extension's intent ("print only what is actually known"). Confirm with Curtis; it is the one place the native ledger shows *more* than the extension did on a fresh session.
- The strings must be the route's own wording.

**Disclosure state:**

- Entries are open by default. Only closed entries are persisted (the extension's `iw-village-ledger` key maps entry key → `false`; the section toggle's key is `ledger`).
- `data-iw-vs-open`, `aria-expanded` and `title` (`Collapse <name>` / `Expand <name>`) follow the state. The section toggle's name is `the building list`.
- On SSR, render open and apply the stored state after mount.

`aria-controls` / `id` pairs just need to be unique: use `useId()`.

## 10.7 Layout facts (so nothing "cleaner" gets substituted)

The scene and ledger **wrap rather than squeeze**. They are two flex items on one wrapping line, and the only query is `@container iw-village-frame (min-width: 592px)`.

- Do not add a breakpoint.
- Do not wrap `.iw-vs-scene` in anything other than `.iw-vs-stage`.
- `.iw-vs-scene` needs its `width: 100%` inside the stage's column flex, or it collapses to 2 px.
- The house is anchored to the top at a percentage height so it never collides with plot 5.

[`tests/village-scene-layout.test.mjs`](../../tests/village-scene-layout.test.mjs) measures this at six widths.

## 10.8 States to diff

| Surface | States |
| --- | --- |
| housing | tier 0, 3, 5 (max) |
| add-ons | installed, vacant, picker open |
| scene | 0, 3 and 5 slots; locked plots |
| ledger | open, section folded, one entry folded |
| catalogue | not yet loaded (totals note) |
