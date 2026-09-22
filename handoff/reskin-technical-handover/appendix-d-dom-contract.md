# Appendix D — DOM contract

Everything the skin writes into, or reads back from, the shared page, grouped by owning module:

- attributes and classes;
- elements and IDs;
- inline custom properties;
- events;
- storage keys;
- CSS highlight registrations.

Use this appendix to answer "who owns this mark, what does it mean, and what removes it?".

**Conventions**

- **On**:
  - **game** — a node React renders;
  - **skin** — a node the skin created;
  - **`<html>`** — the document element, which is outside the observed `<body>`.
- **Cleared by**: the teardown function that removes the item.
- **Completeness.** The 141 distinct `data-iw-*`/`data-fs-*` names found by [`tools/hook-census.mjs`](tools/hook-census.md) all appear in this appendix. A script cross-checked this at the time of writing (§D.12).

## D.1 Lifecycle, runtime and page-level marks

| Name | On | Written by | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- | --- |
| `data-iw-page-hydrated` | `<html>` | `hydration-signal.js` (MAIN world) | `1`, `unknown` | React root hydrated / shape unreadable | `HydrationGate` on release; `clearHydrationLatch` on teardown |
| `data-iw-style` | skin `<style>` in `<head>` | `StyleInjector.inject` | `base`, `tooltip-engine`, `inventory`, `skillpanel`, `header`, `overlay`, `ui-system` | Injected stylesheet identity | `StyleInjector.removeAll` |
| `data-iw-zone-theme` | `<html>` | `HeaderRenderer.applyZoneTheme` | 9 theme names or `default` | Current zone palette | `clearHeaderRenderer` |
| `data-iw-button-atlas` | `<html>` | `SkillsArtService.applyThemeVariables` | `revised-v5` | Button art set in use | `clearThemeVariables` (via `clearHeaderRenderer`) |
| `data-iw-compact-atlas` | `<html>` | `SkillsArtService.applyThemeVariables` | `compact-ghost-v3` | Compact button art set in use | same |
| `data-iw-skill-card-design` | `<html>` | `SkillCardDesignController.initSkillCardDesignController` | `new` | V2 card design active | `clearSkillCardDesignController` |
| `data-iw-skill-design-toggle` | (retired) | — | — | Legacy design toggle node; removed on sight | `initSkillCardDesignController`/`clear…` remove any |
| `data-iw-painted` | game surfaces | `BackgroundPainter.paintElement` | `1` | Surface colours repainted | `clearBackgroundPaint` |
| `data-iw-overlay` | game scrim / card | `OverlayFramer.tagScrim` | `scrim`, `panel` | Modal layer / its content card | `clearOverlayFramer` |
| `data-iw-order-handle` | (none) | — | — | **Retired** Rearrange feature. It remains only inside CSS `:not()` chains, for specificity | n/a |

**Inline custom properties on `<html>`** (all written by `HeaderRenderer.applyZoneTheme` and `SkillsArtService.applyThemeVariables`, and cleared by `clearHeaderRenderer`):

- `--iw-zone-atlas`, `--iw-corner-filigree`, `--iw-zone-separator`;
- `--iw-compact-atlas`;
- `--iw-<kind>` and `--iw-<kind>-paint` for 12 kinds: `action-idle`, `action-hover`, `action-clicked`, `action-secondary-idle`, `action-secondary-hover`, `action-secondary-clicked`, `chevron-prev-idle`, `chevron-prev-hover`, `chevron-prev-clicked`, `chevron-next-idle`, `chevron-next-hover`, `chevron-next-clicked`.

## D.2 `UIFoundation` (classifier hub)

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-ui` | game | `main-nav`, `main-nav-shell`, `nav-tab`, `zone-bar`, `zone-title`, `zone-action`, `section-frame`, `section-title` (also `skill-panel`, written by SkillPanelRenderer; also on the skin Toolkit link and Village scene) | Surface role | `clearUIFoundation` (document-wide) |
| `data-iw-tab` | game nav tab | tab label (`game`, `market`, …) | Which route tab | `clearUIFoundation` |
| `data-iw-state` | game nav tab | `active` | Active route (from game semantics, then route, then colour) | `clearUIFoundation` |
| `data-iw-zone-action` | game zone buttons | `zones`, `prev`, `next` | Zone control tone | `clearUIFoundation` |
| `data-iw-zone-link` | game zone buttons | `1` | Secondary zone buttons rendered as text links | `clearUIFoundation` |
| `data-iw-panel` | game activity panel host; skin Village scene | `current-action`, `action-log`, `world-chat`, `village-scene` | Activity panel identity | `clearUIFoundation`; scene removal |
| `data-iw-panel-part` | game | `header`, `header-title`, `header-tools`, `panel-control`, `progress`, `queue`, `feed`, `feed-row`, `chat-input`, `composer`, `send` | Parts of activity panels | `clearUIFoundation` |
| `data-iw-panel-header` | game | `split` | Header layout variant | `clearUIFoundation` |
| `data-iw-progress-reset` | game progress track | `1` (one frame) | Suppress the transition on completion | rAF; `clearUIFoundation` |
| `data-iw-skill-boost` | game | `1` | Daily XP Boost line | `clearDailyBoost` |
| `data-iw-boss` | game `.compact-panel` | `card` | World Boss card | `untagBossCards` |
| `data-iw-market` | game | `root`, `row`, `namebtn` | Market frame, listing row, name button | `untagMarket` |
| `data-iw-nav-link` | **skin** `<a>` | `toolkit` | Toolkit link | `clearUIFoundation` removes the element |

**Inline**: `--iw-progress-duration` on the game Current Action track (removed by `clearUIFoundation`).

**Element**: `a[data-iw-nav-link="toolkit"]` appended into the game nav track.

## D.3 `HeaderRenderer` and `HeaderChrome`

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-header` | game | `root`, `layout`, `identity-region`, `profile`, `profile-name`, `profile-meta`, `profile-online`, `brand`, `profile-title`, `utilities`, `utility-button`, `status-grid`, `status-card`, `announcement`, `zone-shell` | Header parts | `clearHeaderRenderer` |
| `data-iw-header-card` | game status card | 1-based index | Tile position | `clearHeaderRenderer` |
| `data-iw-header-stat` | game status card | `combat`, `boost`, `timer`, `gold`, `other` | Tile kind | `clearHeaderRenderer` |
| `data-iw-zone` | game header root | zone number or `fallback` | Header painting key | `clearHeaderRenderer` |
| `data-iw-chrome` | game | `shell`, `nav`, `notice`, `zone-bar`, `zone-text`, `zone-actions` | Merged header chrome placement | `clearHeaderChrome` |

- **Inline** (game nodes), removed by `clearHeaderRenderer`, which sweeps every element:
  - header root: `--iw-header-surface`, `--iw-header-surface-mobile`, `--iw-header-frame`, `--iw-header-frame-bar` (dead: no asset), `--iw-header-crest`, `--iw-header-divider`, `--iw-utility-frame`, `--iw-status-frame`;
  - nav: `--iw-nav-rail`, `--iw-nav-active`, `--iw-nav-idle`;
  - announcement: `--iw-announcement-frame`;
  - zone bar: `--iw-zone-frame`, `--iw-zone-scene`, `--iw-zone-button-active`, `--iw-zone-button-idle`, `--iw-zone-button-teal`.
- **Element**: `span.fs-header-crest[aria-hidden]` **prepended** into the game identity region.

## D.4 `SkillPanelRenderer`

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| class `fs-skill-panel`, `fs-skill--<type>` | game `.compact-panel` | discipline | Skill card and accent | `clearPanelChrome` |
| class `fs-skills-section-frame` | game Skill Actions frame | — | Framed Skill Actions panel | `clearSkillPanels` |
| `data-fs-skill` | game card | discipline | Detected skill | `clearPanelChrome` |
| `data-fs-skill-label` | game card | display label | Discipline label | `clearPanelChrome` |
| `data-fs-skill-flavour`, `data-fs-skill-rune` | (retired) | — | Legacy marks, only deleted | `clearPanelChrome` |
| `data-iw-skill` | game card | discipline | Skill identity for CSS | `clearPanelChrome` |
| `data-iw-skill-glyph` | game card | glyph character | Discipline glyph | `clearPanelChrome` |
| `data-iw-skill-role` | game | `identity`, `identity-level`, `identity-icon`, `action-title`, `level-progress`, `action-button`, `nav-button`, `nav-group`, `xp-gain`, `requirement`, `reward`, `action-detail`, `progress-track`, `progress-fill`, `ingredient` | Semantic parts | `clearStructureRoles` |
| `data-iw-skill-zone` | game | `identity`, `content`, `commands` | Three-zone grouping | `clearStructureRoles` |
| `data-iw-skill-layout-shell` | game | `1` | Common shell of the zones | `clearStructureRoles` |
| `data-iw-skill-layout` | game card | `three-zone` | Layout applied | `clearStructureRoles` |
| `data-iw-nav-direction` | game pager button | `prev`, `next` | Pager direction | `clearStructureRoles` |
| `data-iw-req-state` | game requirement | `met`, `unmet` | From the game's text colour classes (rule 5) | `clearStructureRoles` |
| `data-iw-btn-state` | game button | `primary`, `secondary`, `disabled`, `icon` | Plate variant | `clearPanelInlineTreatment` |
| `data-iw-readout` | game readout branch | `1` | Neutralised readout node | `neutraliseReadouts` / clear |
| `data-iw-progress-display` | game level-progress | display text | Clean readout for CSS `content` | clear |
| `data-iw-clean-text` | game identity or title | clean label | Text for CSS `::before` (A11Y-01) | clear |
| `data-iw-ingr` | game material text | `1` | Neutralised material node | `neutraliseIngredients` / clear |
| `data-iw-ingredient-list-source` | game material line | `1` | Native line hidden by CSS; mirrored by the grid | `clearIngredientLists` |
| `data-iw-skill-ingredient-list` | skin grid | `1` | Material grid | `clearIngredientLists` |
| `data-iw-ingredient-signature` | skin grid | signature | Rebuild guard | removed with the grid |
| `data-iw-ingredient-state` | skin grid item | `met`, `unmet` | Material state | removed with the grid |
| `data-iw-base-exp` | skin chip | value | Base XP chip | removed with the chip |
| `data-iw-skill-art` | skin medallion span | discipline | Medallion art key | removed |
| `data-iw-skill-art-ready`, `data-iw-skill-art-pending` | skin medallion span | `1` | Art painted / waiting for the index | removed |

- **Inline** (game nodes; `!important`, owned by 3 `InlineStyleOwner`s and restored exactly): button plate properties, readout neutralisation, material neutralisation.
- **Skin elements**: `span.fs-skill-medallion-art`, `span.fs-skill-identity-percent`, `span.fs-skill-identity-progress > span.fs-skill-identity-progress-fill`, `span.fs-skill-base-exp`, `div.fs-skill-ingredient-grid[role=list] > span.fs-skill-ingredient-item[role=listitem]` (inserted **after** the native material line).
- **Highlight**: `CSS.highlights['iw-skill-ingredient-met']`.

## D.5 `SkillsArtService` (on cards, frames and boss buttons)

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-skills-ui-ready` | game card, frame, boss action button | `1` | UI atlas variables present | `clearPanel` |
| `data-iw-skills-atlas`, `data-iw-skills-atlas-index` | skin medallion span | atlas file, cell index | Painted sprite | removed with the span |

**Inline** (game nodes), removed by `clearUiVariables`:
- `--fs-skills-panel-texture`, `--fs-skills-ui-atlas`, `--fs-skills-nav-prev`, `--fs-skills-nav-next`;
- `--fs-ui-<token>-size`/`-position` for `medallion-frame`, `nav-idle`, `nav-active`, `action-idle`, `action-disabled`, `corner`, `xp-plaque`, `separator`, `flourish`;
- `--fs-ui-<action-idle|action-disabled>-cap-size|cap-l-position|cap-r-position|mid-size|mid-position`;
- `--fs-ui-action-cap-ratio`.

## D.6 `SkillCardDesignController` (V2 card)

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-skill-v2` | game card | `1` | V2 applied | `clearSkillCardV2` |
| `data-iw-skill-v2-type` | game card | discipline | Glyph selection | `clearSkillCardV2` |
| `data-iw-skill-v2-state` | game card | `expanded` | Card state (collapsed variants retired) | `clearSkillCardV2` |
| `data-iw-skill-v2-section` | game content nodes | `requirements`, `materials`, `details`, `rewards`, `queue`, `sources` | Section classification (clip-hidden) | `clearSkillCardV2` |
| `data-iw-skill-v2-label-fit` | game card | fit key | Label measurement cache key | `clearSkillCardV2` |
| `data-iw-skill-v2-fill-reset` | game card | `1` (one frame) | Fill snap-back | rAF; clear |
| `data-iw-skill-v2-long-action` | game card | `1` | Countdown mode | `clearLongActionTimer` |
| `data-iw-skill-v2-level-readout` | skin span | `1` | Level badge | removed |
| `data-iw-skill-v2-action-glyph` | skin span | `1` | Discipline glyph (sibling of the button) | removed |
| `data-iw-skill-v2-action-timer` | skin glyph | `1` | Glyph shows the countdown | `clearLongActionTimer` |
| `data-iw-skill-v2-action-label` | skin span | `1` | `aria-hidden` label mirror | removed |
| `data-iw-skill-v2-body` | skin div | `1` | Detail body | removed |
| `data-iw-skill-v2-row` | skin div | `body`, `tabs` | Grid row of body or foot | removed |
| `data-iw-skill-v2-body-signature` | skin body | signature | Rebuild guard | removed |
| `data-iw-skill-v2-body-state` | skin body row | `met`, `unmet`, neutral | Row state | removed |
| `data-iw-skill-v2-body-kind` | skin body row | `material` | Row kind | removed |
| `data-iw-skill-v2-controls` | skin div | `1` | Foot row | removed |
| `data-iw-skill-v2-req-note` | skin span | `1` | Unmet requirement note (`role=note`) | removed |
| `data-iw-skill-v2-summary`, `data-iw-skill-v2-break`, `data-iw-skill-v2-expand`, `data-iw-skill-v2-tabs`, `data-iw-skill-v2-tab` | (retired) | — | Earlier designs' nodes, removed on sight | `removeRetiredNodes` |
| `data-iw-skill-v2-summary-state` | (none) | — | **Dead** CSS selector only (`skillcard-v2.css:216`) | n/a |

**Inline** (game card), removed by `clearSkillCardV2`: `--iw-skill-v2-progress`, `--iw-skill-v2-fill-duration`, `--iw-skill-v2-action-label-font`.

## D.7 `QuestPanelRenderer`

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| class `fs-quest-panel` | game `.compact-panel` | — | Quest card | `clearCard` |
| `data-fs-quest` | game card | `1` | Decorated quest | `clearCard` |
| `data-iw-quest-role` | game | `kicker`, `title`, `brief`, `objective`, `reward`, `progress-label`, `progress-track`, `progress-fill`, `turn-in`, `skip` | Parts | `clearRoles` |
| `data-iw-quest-zone` | game | `commands`, `content`, `row`, `body` | Zones | `clearRoles` |
| `data-iw-quest-state` | game card | `ready`, `work-order`, `active` | Quest state (from Turn In `disabled` / Skip presence) | `clearCard` |
| `data-iw-quest-reward` | game reward line | reward text | Chip text for CSS `content` | `clearCard` |
| `data-iw-quest-percent` | game card | number | Completion % for the sigil | `clearCard` |
| `data-iw-quest-glyph` | skin sigil | glyph | Discipline glyph (`::before` content) | removed |
| `data-iw-quest-icon` | skin sigil | `1` | Objective sprite painted | removed |
| `data-iw-quest-icon-pending`, `data-iw-quest-art-pending` | game card | `1` | Waiting for the atlas or art index | `clearCard` |

- **Objective trigger** (on the game objective `<p>`): see D.9. Removed by `clearObjectiveTrigger` (FUN-09).
- **Inline** (game card): `--fs-quest-accent`, `--fs-quest-cmd-w`, plus the D.5 variables.
- **Skin elements**: `span.fs-quest-sigil[aria-hidden] > span.fs-quest-sigil-icon + span.fs-quest-sigil-pct` (inserted as the **first child** of the game body zone).

## D.8 `InventoryRenderer` and `AtlasService`

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-fs-inv` | game row | row signature | Rendered-overlay guard | `clearInventoryRenderer` |
| `data-fs-hidden` | (legacy) | — | Pre-1.6 mark; only removed | `clearInventoryRenderer` |
| `data-fs-preserved-action` | game | `control`, `host` | Native action kept live / its host | `restoreOriginalChildren` |
| `data-fs-action-host` | game | `1` | Host branch of a preserved action (`display: contents`) | same |
| `data-fs-action-kind` | game control | `equipped`, `equip`, `set`, `secondary`, `icon` | Action plate variant (rule 5) | same |
| `data-fs-suppressed` | game | `1` | Native text branch hidden (plus inline `display: none`) | same; the inline style owner restores `display` |
| `data-iw-inventory-root` | game panel | `1` | Inventory frame | `clearInventoryRenderer` |
| `data-iw-inventory-title` | game heading | `1` | Title | same |
| `data-iw-inventory-list` | game list | `1` | Recessed list frame | same |
| `data-iw-inventory-control` | game | `filter`, `page`, `icon`, `glyph`, `page-count` | Tool row parts | same |
| `data-iw-inventory-filter-state` | game filter | `active` | Active filter (from game semantics) | same |
| `data-iw-inventory-filters` | game filter row | `1` | Single-row container | same |
| `data-iw-atlas` | skin icon host | `gear`, `item` | Which atlas painted | removed with the overlay |
| `data-iw-badge` | skin badge span | level | "+N" badge | removed |

- **Skin elements**: `div.fs-inv-row` (overlay, **appended** into the game row); `div.fs-inv-rule[aria-hidden]` (after the header row); `span.iw-icon-badge`; `span.iw-item-ref[role=button][tabindex=0]` (inside the overlay).
- **Classes on skin nodes**: `fs-cat-*`, `fs-inv-orb`, `has-details`, `has-requirements`, `is-equipped`, `has-set-action`.

## D.9 Item hovercard triggers and `TooltipEngine`

| Name | On | Written by | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- | --- |
| `data-iw-item` | skin `.iw-item-ref`, skin inventory icon, skin boss reward tile, **game** quest objective `<p>` | InventoryRenderer, QuestPanelRenderer, WorldBossPanels, TooltipEngine `itemRef` | item id | Catalogue lookup key | owner's clear |
| `data-iw-item-name` | same, plus the **game** village building name `<p>` | same + VillagePanels | item name | Lookup key when there is no id | owner's clear |
| `data-iw-tooltip-trigger` | skin icon or tile; game objective and building `<p>` | same | `1` | Delegated hovercard trigger | owner's clear |
| `tabindex`, `aria-haspopup`, `aria-controls`, `aria-expanded` | game objective and building `<p>` (and skin triggers) | QuestPanelRenderer, VillagePanels (write); TooltipEngine (`aria-controls`/`aria-haspopup`/`aria-expanded` on show and hide) | `0`, `dialog`, `iw-tip`, `true`/`false` | Keyboard access and popup semantics | `clearObjectiveTrigger`, `clearTrigger` (**unconditional**, FUN-09) |
| `aria-describedby` | any anchor | TooltipEngine `cleanupAnchor` (**removal only**) | — | Residue from pre-hovercard builds | — (FUN-09) |
| `#iw-tip.iw-tip` | skin `div` in `<body>` | `initTooltipEngine` | `role=dialog`, `aria-modal=false`, `tabindex=-1`, `aria-label`, class `is-open` | The shared hovercard | **Not removed** on teardown (FUN-10) |

## D.10 Frames, controls, overlays: `CollapsibleFrames`, `CompactButtons`

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-collapse` | skin `<button type=button>` appended into the game head | `1` | Collapse toggle (`aria-expanded`, `aria-label`, `title`) | `clearCollapsibleFrames` |
| `data-iw-collapse-head` | game head row | `1` | Toggle container and gutter | same |
| `data-iw-collapse-title` | game title | `1` | Title kept in a collapsed bar | same |
| `data-iw-collapse-spine` | game ancestors of the title | `1` | Path kept visible when collapsed | same (the cache is not reset: FUN-04) |
| `data-iw-collapsed` | game panel or frame | `1` | Folded | same |
| `data-iw-compact-button` | game control | `text`, `icon` | Compact art shape | `clearCompactButtons` |
| `data-iw-compact-selected` | game control | `true` | Selected loadout (from game semantics) | same |
| `data-iw-compact-layer` | skin spans appended **into** game controls | `idle`, `hover`, `clicked` | Crossfade art layers (`aria-hidden`) | same |

## D.11 World Bosses, Village, Village scene and ledger

| Name | On | Values | Meaning | Cleared by |
| --- | --- | --- | --- | --- |
| `data-iw-encounter` | game boss card | boss key or `zone` | Encounter identity | `clearWorldBossPanel` |
| `data-iw-boss-role` | game | `header`, `title`, `action`, `participation`, `difficulty`, `buff`, `timer`, `status`, `progress`, `details`, `control-strength`, `control-hp`, `control-progress` | Card parts | same |
| `data-iw-boss-action-state` | game action button | `active`, `idle` | Join state | same |
| `data-iw-boss-action-label` | game action button | `Queued`, `Prejoin` | **Visual relabel** via CSS `content` (CONT-02) | same |
| `data-iw-boss-art-ready` | game action button | `1` | Atlas variables applied | same (`clearPanel`) |
| `data-iw-boss-owned` | skin nodes | `1` | Notice, art, rewards, Dominion | removed |
| `data-iw-control` | game zone card | `red`, `blue`, `contested` | Controlling team | same |
| `data-iw-control-crest` | skin crest | state | Crest art state | removed |
| `data-iw-control-source` | skin meter | `factions` | Meter derived from faction numbers | removed |
| `data-iw-village` | game | `housing`, `house`, `addons`, `slot` | Village panel kind | `clearVillagePanel` |
| `data-iw-village-state` | game slot | `vacant`, `installed` | Slot state | same |
| `data-iw-village-role` | game | `head`, `copy`, `index`, `name`, `effects`, `vacant`, `actions`, `action`, `picker`, `option`, `option-owned`, `option-name`, `house-name`, `house-tier`, `house-salvage`, `house-next`, `house-max`, `house-note`, `intro`, `note` | Parts | same |
| `data-iw-village-action` | game button | `install`, `upgrade`, `uninstall`, `destroy`, `cancel`, `other` | Action tone | same |
| `data-iw-village-art` | skin art | `building`, `house`, `generic` | Art kind | same |
| `data-iw-village-tier` | game housing card | 0–5 | House tier | same |
| `data-iw-village-pip` | skin pip | `held`, `open` | Tier pips | same |
| `data-iw-village-owned` | skin nodes | `1` | VillagePanels' own nodes | removed |
| `data-iw-village-scene` | skin `section` | `1` | Dashboard Village frame | `clearVillageScene` |
| `data-iw-village-scene-owned` | skin nodes | `1` | Scene and ledger nodes (distinct namespace, to avoid the VillagePanels sweep) | same |
| `data-slot`, `data-plot-state` | skin plot elements | 1–5; `empty`, `installed`, `locked` | Plot placement and state | same |
| `data-iw-village-ledger` | skin | `1` | Ledger root | `clearVillageLedger` (with the scene) |
| `data-iw-vs-toggle` | skin buttons | `1`, `section` | Ledger disclosure buttons | same |
| `data-iw-vs-open` | skin entries | `1`, `0` | Open state | same |
| `data-iw-vs-entry` | skin entries | entry key | Building or home entry | same |
| `data-iw-vs-slot-state` | skin vacant lines | state | Vacant slot line | same |
| `data-iw-vs-stat-kind` | skin stat lines | `skill-level`, … | Stat styling | same |
| `data-iw-village-totals` | skin totals block | `1` | Overall stats | same |

**Inline**:
- `--iw-village-sprite` on skin art elements;
- `width` and `--iw-control-split` on the skin Dominion meter;
- the D.5 variables on game boss action buttons.

## D.12 Events, storage, highlights and IDs

| Kind | Name | Direction | Details |
| --- | --- | --- | --- |
| Event | `iw:inventory-row`, `iw:skill-panel`, `iw:dom-flush`, `iw:name-scan-flush` | DOMWatcher → consumers | §1.5.5 |
| Event | `iw:atlas-updated` | AtlasService → consumers | `{revision, gearReady, itemReady}` |
| Event | `iw:item-db-updated` | ItemDatabase → consumers | `{revision, generatedAt, source, count}` |
| Storage (`chrome.storage.local`) | `iw-skin-enabled`, `iw-item-db-cache`, `iw-item-db-cache-checked`, `iw-collapsed-frames`, `iw-village-ledger`, `iw-boss-rewards-collapsed:<bossKey>` | — | §5.2.3 |
| Storage (page `localStorage`) | `iw-item-db-cache` | removed once if present | Legacy |
| CSS highlight | `iw-item-name` | NameScanner | No stylesheet renders it (FUN-02) |
| CSS highlight | `iw-skill-ingredient-met` | SkillPanelRenderer | `skillpanel.css:458` |
| Element ID | `iw-tip` | TooltipEngine | Shared hovercard |
| Element IDs | `iw-vs-entry-<n>` | VillageLedger | `aria-controls` targets |

**Completeness check** (run at the time of writing): every name in `tools/hook-census.json` appears in this appendix. To repeat it:

```bash
node -e "const n=require('./handoff/reskin-technical-handover/tools/hook-census.json').map(e=>e.name);const t=require('fs').readFileSync('./handoff/reskin-technical-handover/appendix-d-dom-contract.md','utf8');const m=n.filter(x=>!new RegExp('(^|[^a-z0-9-])'+x+'([^a-z0-9-]|$)').test(t));console.log(m.length?'MISSING: '+m.join(', '):'all '+n.length+' names documented')"
```

## D.13 Generated census

For each attribute name, the JavaScript files that mention it and the stylesheets that select on it: [`tools/hook-census.md`](tools/hook-census.md) (141 names). Regenerate it with `node handoff/reskin-technical-handover/tools/hook-census.mjs`.
