# JavaScript visual features: source-level handover

This document describes the current source of the visual renderers, classifiers, disclosures, and village mirror, inspected on 2026-09-17 and checked on 2026-09-18. It is a source audit, not a claim of live-site verification. Line references identify the inspected revision; function names remain useful when lines move. All source links are relative to this document. Shared data services, tooltip internals, the watcher, and build tooling have separate responsibilities; their relevant contracts are described here only where these visual features depend on them.

The implementation keeps the game's nodes and handlers in place. That does **not** mean it only adds inert decoration: it also suppresses native display branches, mirrors text, adds focusable tooltip targets, collapses panels, maintains extension preferences, and makes an authenticated player-data request for the village scene. Those behaviors and their boundaries are explicit below.

## 1. Wiring, ownership, and execution order

Source: [content.js](../../src/content.js#L54), [UIFoundation.queueClassify](../../src/modules/UIFoundation.js#L1362).

1. The entry point reads `iw-skin-enabled`, waits for the first hydration gate, then activates the runtime. Styles are injected as seven removable sheets: base, tooltip-engine, inventory, skillpanel (including V2/runtime-safe/card-button layers), header, overlay, and ui-system (including compact buttons, village scene, and collapsible frames).
2. `bindConsumersOnce()` initializes the renderers once per page. The DOMWatcher `on()` helper is a `document.addEventListener` wrapper, not a private event bus. These consumers remain registered when the skin is disabled; normal execution is suppressed by runtime guards and stopping the watcher.
3. `initSkillCardDesignController()` runs each activation. In current source it selects the one supported design, `new`; it does **not** read a design preference or create a Current/New switch. The entry-point comment describing a persisted choice is historical.
4. Atlas and item data load asynchronously. The initial background pass precedes `startWatcher()`, which performs discovery only after consumers exist.
5. Inventory and compact-panel events reconcile their individual surfaces. A DOM flush schedules one UIFoundation rAF and one HeaderRenderer rAF. UIFoundation executes main nav → zone bar → activity panels → section frames → merged header chrome → Daily XP Boost → bosses → market → Village route → Village scene → compact buttons → collapse toggles. The scene starts async work but is not awaited by this sequence. The entry-point DOM-flush consumer also paints background roots and scans overlays immediately.
6. Teardown stops the watcher and item auto-refresh first, then removes tooltip/name/inventory/design/skill/quest/UI/header/background/overlay presentation and all sheets. Runtime stays active through cleanup so guarded cleanup can run, then becomes inactive.

**State-preservation mechanisms.** No scoped module changes a game's button callback, moves a gameplay node to a new parent, sets a game's input value, submits a gameplay form, or sends a gameplay mutation request. Native controls are reused. `InlineStyleOwner` restores only properties it owns; owned DOM is removed separately. Prefix namespaces separate the skill, quest, boss, Village route, and Village scene surfaces even though all can involve `.compact-panel`. Native disabled/selection/team/requirement state is read rather than assigned. Source-level exceptions and incomplete guarantees are recorded in §15 rather than concealed behind the presentation-only intention.

### 1.1 Observer, listener, timer, storage, and network inventory

**Observer count:** these 17 scoped modules instantiate **zero** MutationObservers, ResizeObservers, or IntersectionObservers. Across current `src`, the sole `new MutationObserver` is [DOMWatcher.startWatcher](../../src/modules/DOMWatcher.js#L354): one active observer per activation, watching `document.body` for subtree child lists, character data, and the eight attributes `class`, `style`, `disabled`, `aria-disabled`, `aria-pressed`, `aria-selected`, `aria-current`, `data-state`. It disconnects on teardown. Hydration uses bounded timeout polling, not another observer. `data-iw-*` writes and `<html>` changes do not themselves notify that body observer. Media-query listeners in Viewport are events, not DOM observers.

| Owner / source | API and exact trigger | Lifetime / cleanup / consequence |
| --- | --- | --- |
| [InventoryRenderer](../../src/modules/InventoryRenderer.js#L753) | `on('iw:inventory-row')`; document `iw:item-db-updated`, `iw:atlas-updated` | Three page-lifetime listeners, registered once. Events render the row or reconcile all row candidates through guards. |
| [SkillPanelRenderer](../../src/modules/SkillPanelRenderer.js#L1572) | `on('iw:skill-panel')` | One page-lifetime listener; guarded render, no separate observer. |
| [QuestPanelRenderer](../../src/modules/QuestPanelRenderer.js#L461) | `on('iw:skill-panel')` | One page-lifetime listener; independent positive quest detection. |
| [UIFoundation](../../src/modules/UIFoundation.js#L1455) | `on('iw:dom-flush')`, `on('iw:skill-panel')` | Two page-lifetime listeners. Second refreshes only an already resolved enclosing boss panel for text/button ticks. |
| [HeaderRenderer](../../src/modules/HeaderRenderer.js#L462) | `on('iw:dom-flush')` | One page-lifetime listener through entry-point once-only initialization; no internal `listenerBound` flag. |
| [SkillCardDesignController](../../src/modules/SkillCardDesignController.js#L517) | `on('iw:skill-panel')`, `on('iw:name-scan-flush')`, `on('iw:dom-flush')` | Three page-lifetime listeners; both controller `active` and runtime state checked. |
| [VillageScene.bindOnce](../../src/modules/VillageScene.js#L248) | document `iw:item-db-updated` | One lazy page-lifetime listener; calls active-checked async reconciliation with rejection handling. Total scoped global document event registrations above: **12**, not 12 observers. |
| [content.js consumers](../../src/content.js#L101) | DOM flush, name-scan flush, document item-db-updated; `onStorageChanged('iw-skin-enabled')` | Three additional document consumers and one extension storage-change subscription; kill-switch subscription intentionally remains active. |
| [CollapsibleFrames.ensureToggle](../../src/modules/CollapsibleFrames.js#L205) | One owned button `click` per eligible frame | `preventDefault` + `stopPropagation`; changes presentation preference only. Removed with the button. |
| [VillageLedger.wire](../../src/modules/VillageLedger.js#L187) | One owned button `click` per disclosure | Home + each installed building + Buildings-list disclosure, at most seven for five slots. `preventDefault`, no propagation stop. Rebuilt nodes get new listeners; old nodes are removed. |
| [WorldBossPanels.bindRewardDisclosure](../../src/modules/WorldBossPanels.js#L20) | Owned `<details>` `toggle`, one per reward section | Saves open/closed preference; ignores detached and same-state events. Native summary keyboard behavior is retained. |
| [WorldBossPanels.playStrengthImpact](../../src/modules/WorldBossPanels.js#L124) | `matchMedia('(prefers-reduced-motion: reduce)')` `change`; `matchMedia('(max-width: 760px)')` read; `Element.animate()` | A reduced-motion listener during each impact sequence; removed by `stopStrengthImpact` on finish, replacement, preference change, or teardown. No timer/animation loop. |
| [UIFoundation](../../src/modules/UIFoundation.js#L962), [HeaderRenderer](../../src/modules/HeaderRenderer.js#L436) | Runtime `raf`: coalesced classify/header pass; another rAF removes a progress-reset tag | Queued flags clear before guards run; no explicit cancellation handle. Runtime's fallback is `setTimeout(fn,16)` if rAF is unavailable. |
| [InventoryRenderer](../../src/modules/InventoryRenderer.js#L317) | `queueMicrotask` clears per-root chrome sweep dedup; rAF retries empty row once | Microtask owns no DOM; pending retry is a WeakSet marker. See late-callback caveat in §15. |
| [SkillCardDesignController](../../src/modules/SkillCardDesignController.js#L223) | rAF removes fill-reset tag; `document.fonts.ready.then(...)` refits labels | No countdown timer: displayed countdown is copied from game DOM. A comment's 250 ms `setInterval` describes the **game**, not a skin interval. |
| [VillageScene](../../src/modules/VillageScene.js#L310) | One `setTimeout(controller.abort,10000)` per request; `clearTimeout` in `finally`; `Date.now()` eligibility gates | Five-minute success eligibility, 30-second failure eligibility, route-change eligibility shortening to at most 10 seconds. **No scheduled poll/retry interval**; another reconcile must occur. No visibilitychange listener. |
| [CollapsibleFrames](../../src/modules/CollapsibleFrames.js#L162) | Runtime `storageGet` / `storageSet`, key `iw-collapsed-frames` | Object stores only `true` collapsed keys. Cache discarded on clear; persisted choices survive. No live subscription to other tabs' changes. |
| [VillageLedger](../../src/modules/VillageLedger.js#L104) | Runtime storage, key `iw-village-ledger` | Object stores only `false` closed keys (`ledger`, `home`, `building:<lowercase name>`). Async load applies to live rows; session touches win. |
| [WorldBossPanels](../../src/modules/WorldBossPanels.js#L20) | Runtime storage, `iw-boss-rewards-collapsed:<boss key>` | Boolean for each of ancient_treant, abyssal_behemoth, world_eater. Memory preference map remains through clear. |
| [VillageScene](../../src/modules/VillageScene.js#L312) | `fetch('/api/player?section=…&scope=core', {method:'GET', credentials:'same-origin', cache:'no-store', signal, headers:{'x-idleworlds-league':…}})`; `response.json()` | Only direct network fetch in this scoped renderer set. Authenticated same-origin player read; abort/generation guards and narrow normalized snapshot. See §12. |
| [UIFoundation.ensureToolkitLink](../../src/modules/UIFoundation.js#L291) | Native outbound `<a href="https://idleworldstoolkit.com" target="_blank" rel="noopener noreferrer">` | No JS fetch. User activation navigates to an external site; no query carrying player data, no opener or referrer. Link removed on clear. |
| Art consumers | Runtime `assetUrl()` into CSS variables / `<img src>`; `AtlasService.ready/paint`, `SkillsArtService.ready/decoratePanel/paintIcon` | Browser loads packaged extension-local media in extension use. Data-service requests are indirect dependencies, not hidden fetches in these modules. Test fallback URLs are relative. |
| [SkillPanelRenderer](../../src/modules/SkillPanelRenderer.js#L652) | `globalThis.CSS.highlights`, `new globalThis.Highlight`, DOM `Range`, TreeWalker | Global named highlight `iw-skill-ingredient-met`, removed on clear; unsupported API is a nonfatal fallback. |

Storage wrappers use `chrome.storage.local`, not game `localStorage`/`sessionStorage`; when Chrome is unavailable they use an in-memory `Map`. Read failure returns null and write failure returns false with a once-only warning. None of these visual modules calls `storageRemove`, reads cookies/token stores, patches `fetch`/history, emits `postMessage`, evaluates strings as JavaScript, or installs a remote script. Common ambient reads include document text, class/style/ARIA, `location`, viewport dimensions, computed style and geometry. These are detailed per feature below.

## 2. Background recoloring

### 2.1 Conservative navy-to-forged-ground repaint

Source: [BackgroundPainter.js](../../src/modules/BackgroundPainter.js#L19), functions `normHex`, `ourColour`, `ownedTree`, `shouldSkip`, `isSurfaceCandidate`, `paintElement`, `paintBackground`.

Purpose: replace known stock navy ground and navy border colors with warm dark ground/brass edges without flattening every colored status element. The source contains an explicit 20-color `GAME_NAVIES` whitelist. `ourColour()` computes weighted RGB luminance and selects `#0B0C0A`, `#14130F`, `#191711`, or `#1E1B15`; matched border sides become `#342D20` individually. `normHex()` accepts computed `rgb()/rgba()` comma syntax; fully transparent standard spelling is rejected, but other partially transparent colors are compared by RGB without retaining their alpha.

`paintBackground(root=document.body)` visits the root and every element in its TreeWalker. Only body, recognized surface selectors (`.compact-panel`, `.compact-row`, item-row classes, dialog/menu/listbox roles, main/section/article/aside/header/nav), direct body children, or multi-child second-level shells qualify. Script/style/link/meta/head/html, `.fs-skill-wrapper`, and nodes inside inventory overlays, skill headers, or tooltips are skipped. This is a bounded **classification** depth for anonymous divs, not a bounded tree traversal: the walker still traverses descendants.

Effects: property-owned `background-color` and four border-color longhands at `!important`, plus `data-iw-painted="1"`. No injected nodes/listeners/storage/network. Reused React elements are rechecked; there is no permanent processed flag. `clearBackgroundPaint()` restores every owned property and removes markers. A failure is caught once per pass and logged through `warnOnce`, so one exception can stop the remaining nodes in that particular walk. Unknown palette colors/deeper anonymous surfaces retain native paint. Exact RGB matching avoids intentional status colors in general but cannot distinguish a semantic use of the very same navy; transparent-alpha handling is a hardening opportunity.

## 3. Section collapse and compact controls

### 3.1 Persistent per-frame collapse with a surviving title

Source: [CollapsibleFrames.js](../../src/modules/CollapsibleFrames.js#L28), `decorateCollapsibleFrames`, `frameLandmarks`, `frameTitle`, `headOf`, `collapseTarget`, `frameKey`, `markSpine`, `ensureToggle`, `applyState`.

Targets are `[data-iw-ui="section-frame"]`, inventory roots, and art-ready Skills section frames. A document-ordered next-frame containment test selects leaf frames; `collapseTarget()` uses a leaf native `.panel` ancestor when an activity frame mark is on a smaller inner host. Targets are deduplicated. One landmark query resolves the classified title, role heading, native h1–h4 and an inner panel slug. The key is `panel:<slug>` where available, otherwise `title:<normalized heading>` after stripping leading icons. Missing heading/key means no collapse control. Same-title frames share a preference; reworded titles reset to open.

An owned empty `button[type=button][data-iw-collapse]` is appended to the existing direct heading branch, not wrapped around game contents. `data-iw-collapse-head`, `-spine`, `-title` describe the path CSS must retain. Click toggles `data-iw-collapsed="1"` on the target and updates `aria-expanded`, `aria-label`, and `title` to Expand/Collapse + panel name. CSS hides all other branches, including ancillary header readouts/controls, while retaining the title/toggle. React state continues existing while hidden. Button events prevent default and stop propagation to an enclosing native action.

`loadPreferences()` lazily reads all collapsed keys once into a Map; `touched` prevents a late load from replacing this session's clicks. `persist()` stores only collapsed keys. There is no storage listener or `aria-controls` on this toggle. Unlike the ledger, the load completion does not immediately reapply frame state; it waits for another decorate pass. Stale controls are removed when their frame loses eligibility. `clearCollapsibleFrames()` removes controls and five owned attribute families, resets preference caches, and leaves stored choices intact. The `spines` WeakMap is not reset globally; see §15 for same-node reactivation implications.

### 3.2 Compact text/icon plate layers and loadout selection

Source: [CompactButtons.js](../../src/modules/CompactButtons.js#L1), `kind`, `loadoutPair`, `decorateCompactButtons`, `clear`.

Adds three empty, `aria-hidden` spans (`data-iw-compact-layer=idle|hover|clicked`) inside selected existing controls; the CSS layer chooses artwork for hover/pressed states. It never installs a click handler. `data-iw-compact-button=text|icon` is assigned to preserved inventory actions, inventory filters/pages, nav tabs, zone actions, chat Send, exact Change Zone, its adjacent empty/clock icon control, and the exact I/II two-button loadout pair. Arbitrary header icon tools are not classified by this rule. Collapse toggles explicitly opt out.

For I/II only, `data-iw-compact-selected=true` comes from `aria-pressed` before `aria-selected`, otherwise `data-state=active` or orange/amber/primary/accent/ember color classes. The native selection attribute is never changed. One lazily read label and one children scan avoid repeated text/query costs. A Set retains decorated controls; a subsequent sweep clears layers/attributes on no-longer-eligible controls, including detached ones. `clearCompactButtons()` does the same for the full set. Whole-document call is the normal contract; supplying a partial root would cause controls outside that root to be cleared from the prior set.

## 4. Header features

### 4.1 Profile, identity crest, utility buttons, and status tiles

Source: [HeaderRenderer.js](../../src/modules/HeaderRenderer.js#L194), `findLiveHeader`, `classifyHeader`, `classifyProfile`, `classifyUtilities`, `classifyStatus`, `tagStatusCards`, `ensureCrest`.

Resolves a `<header>` whose copy contains Combat Lv, Players Online, and ATK/DEF/HP; among candidates it prefers nonzero geometry, then first candidate for layoutless fixtures. One child implies a layout wrapper; otherwise the header itself is layout. It identifies profile/name/meta/online/title/brand from h1 and short text branches, utility clusters from `.header-icon-btn` or at least three direct short-label buttons, and status grids from native grid/stat-chip structure with a bounded fallback ancestor walk.

Writes `data-iw-header` roles `root`, `layout`, `profile`, `profile-name`, `profile-meta`, `profile-online`, `brand`, `profile-title`, `identity-region`, `utilities`, `utility-button`, `status-grid`, `status-card`. Prepends one `.fs-header-crest[aria-hidden=true]`; native identity and buttons remain in place. Stat cards receive a 1-based `data-iw-header-card` and content-derived `data-iw-header-stat=combat|boost|timer|gold|other`. Boost is tested before generic time-left so a server booster name/charge/countdown gets the correct plaque. Gold accepts a bare comma-formatted integer with optional leading nonword glyph. Card kind is reread every cached pass; no countdown is synthesized.

Cache validation checks root/layout roles and connection of resolved region/utilities/grid, but does not comprehensively revalidate every descendant or optional cluster added later. Subtree replacement inside still-connected containers can therefore need stronger invalidation. No header control's meaning or original text is replaced. Role and asset presentation is responsive via header.css; this module's visible helper only checks rect size, unlike Viewport's full rendered-state helpers.

### 4.2 Header/nav/notice/zone asset binding

Source: [HeaderRenderer asset functions](../../src/modules/HeaderRenderer.js#L17), `applyHeaderVars`, `applyNavVars`, `applyAnnouncementVars`, `applyZoneVars`, `findAnnouncement`, `classifyAdjacent`.

Known asset paths under `assets/header/` become inline CSS custom properties: `--iw-header-frame`, `--iw-header-crest`, `--iw-header-divider`, `--iw-utility-frame`, `--iw-status-frame`, `--iw-nav-rail`, `--iw-nav-active`, `--iw-nav-idle`, `--iw-announcement-frame`, `--iw-zone-frame`, `--iw-zone-scene`, and three zone-button active/idle/teal variables. `headerFrameBar` has no entry in `HEADER_ASSETS`, so its setter returns without writing. The zone scene intentionally uses static `header_surface.webp`; the header's own surface is per-zone.

Adjacent lookup prefers the visible classified nav/zone, then finds a nonempty ≤260-character next sibling after the nav's panel/nav/parent (skipping script/style), excluding Zone-number copy. It marks an announcement and zone-shell in the header namespace. These variables use fixed extension-local files; no user data enters an asset path.

### 4.3 Zone paintings, mobile crops, and nine environment palettes

Source: [HeaderRenderer zone functions](../../src/modules/HeaderRenderer.js#L70), [zoneThemes.js](../../src/modules/zoneThemes.js#L11).

`currentZoneNumber()` reads the first `zone-title`, otherwise a text scan for icon-prefixed `Zone N:`. It retains `lastZoneNumber` when route navigation removes the zone bar; ordinary non-Game tabs keep the last zone's appearance. `applyZoneSurface()` writes `data-iw-zone` plus desktop/mobile `--iw-header-surface` variants for zones 1–34. Unknown/out-of-range zone uses generic `header_surface.webp`; there is no image-error fallback after choosing a known filename. CSS swaps mobile art at its breakpoint without another JS listener.

`applyZoneTheme()` writes `<html data-iw-zone-theme>` and `--iw-zone-atlas`, `--iw-corner-filigree`, `--iw-zone-separator`, then calls `SkillsArtService.applyThemeVariables(html, theme)` for palette/button tokens. Unknown theme removes these overrides and uses defaults. `<html>` is outside the body observer, so these writes do not drive another flush. It checks `--iw-action-idle` to retry a partially applied theme.

Generated immutable mapping (rebuild through its generator, not hand edit): verdant zones 1,3,34; forged-metal 2,5,24; infernal 4,9,13,15,16,26,29,32; celestial 6,10,12,25; voidborn 7,11,19,20,30; runic-arcane 8,18,21,28; lunar-spectral 14,23,27; tempest-oceanic 17,31; glacial 22,33. `zoneTheme()` accepts integers only. `THEME_NAMES` enumerates all nine. There is no fetch, storage, or listener in this map.

### 4.4 One apparent frame around separate nav/announcement/zone siblings

Source: [HeaderChrome.js](../../src/modules/HeaderChrome.js#L65), `resolve`, `resolutionValid`, `classifyHeaderChrome`.

Reads UIFoundation roles after nav/zone classification. The visible zone bar's parent must have a direct header. Searches preceding siblings back to the header for the nearest nav-tab-containing sibling. Zero or one intervening notice is allowed; a notice must not be `.panel` and must contain 1–260 normalized characters. Zone bar must have exactly two branches, one holding zone-title and the other a zone-action descendant.

Writes only `data-iw-chrome=shell|nav|notice|zone-bar|zone-text|zone-actions`. CSS turns the shared parent into grid and the zone bar into `display:contents`, yielding one apparent frame without moving DOM nodes. Unknown shape clears marks and declines. Cached validation checks connected nodes and the nav/zone marks, with a cheap intervening-notice identity check on every pass. It does not validate arbitrary changes to notice text or zone branch structure while identities remain. `clearHeaderChrome()` drops all marks and resolution. No own DOM, events, timers, network, storage, or control callbacks.

### 4.5 Header cleanup contract

Source: [clearHeaderRenderer](../../src/modules/HeaderRenderer.js#L445).

Clears header resolution, remembered zone, `<html>` theme and SkillsArtService theme variables; removes header roles, card/stat/zone data, and crests; sweeps every element to remove all listed header/theme asset variables. This is broad O(document elements × listed variables) cleanup. These namespaced variables are deleted, not restored to pre-extension values. There is no observer or live resize listener here; scheduled header work clears its queue bit and then calls guarded reconcilers. Cached last zone is not separately keyed to SSF or account, so a league/account change without a readable new zone can transiently retain old appearance.

## 5. Inventory features

### 5.1 Inventory context, frame, separator, filters, tools, and paging

Source: [InventoryRenderer context](../../src/modules/InventoryRenderer.js#L208), [chrome classification](../../src/modules/InventoryRenderer.js#L279).

`resolveInventoryContext()` accepts a row with Equip/Equipped/Unequip/List controls or one under a found Inventory root. `findInventoryRoot()` first checks up to ten ancestors for `aria-label=inventory`; otherwise it scans headings/data-title outside rows and climbs up to six ancestors to the first container with candidate rows containing this row. This guards market/feed `.compact-row` reuse, although the List shortcut is intentionally broad.

`classifyInventoryChromeOnce()` sweeps each root only once per synchronous batch, resetting its Set with `queueMicrotask`. It marks `data-iw-inventory-root/title/list/filters`, adds an owned `.fs-inv-rule[aria-hidden]` immediately after the title's direct branch, and classifies non-row controls as filter (All/Gear/Materials/Consumables/Drops), page (Prev/Previous/Next), icon (empty or ≤2 chars with SVG), glyph (loose direct SVG in a shared two-icon tool row), or page-count (N/M). Collapse toggles are excluded. Filter state comes from ARIA/current/data-state or warm classes and is mirrored in `data-iw-inventory-filter-state=active`, never assigned to the game's selection attributes.

Only filters with one shared parent receive the filter-row hook. A list wrapper is tagged only when all rows share it, it is below the root, and it contains neither title nor toolbar controls; unknown layout retains generic frame. The inserted separator may be moved within its native parent because it is an extension-owned node. No inventory sorting/filtering/paging is performed by JavaScript here; native controls retain those jobs. Empty inventory with no row event cannot trigger this renderer's root discovery on its own; general section framing still applies.

### 5.2 Native row parsing and an additive visual summary

Source: [InventoryRenderer parsing](../../src/modules/InventoryRenderer.js#L94), [renderRow](../../src/modules/InventoryRenderer.js#L611).

`leafTexts()` gathers span/div/p leaves and small near-leaves, excluding extension overlays and interactive branches. `detailTexts()` finds short loadout/requirement/upgrade/set/gem/socket/stat/dice lines, deduplicates nested copies, excludes the full item-name summary, and retains atomic details. `extractRowData()` joins display names through `resolveInventoryItemName`/ItemDatabase, finds a separate +1…+9 enhancement token if the name has no enhancement suffix, and guesses quantity from ×N/xN or the last purely numeric leaf.

`buildInventoryDetails()` and `inventoryDetailSignature()` are the shared detail-model dependency; this renderer does not invent extra upgrades. It generates an owned `.fs-inv-row` with icon, body/name, optional Lv suffix, optional separate enhancement, up to eight shared stat chips, dynamic detail/requirement rows, and quantity. Category class and `fs-inv-orb` (Upgrade Orb subcategory), `has-details`, `has-requirements` drive CSS. Repeated detail text can show `×count`. `data-fs-inv` holds the rendered signature including database and atlas revisions.

Only the new overlay receives `innerHTML`. All its local text/class interpolations use `esc()` for ampersand, less/greater-than and double quote; recognized item links are returned by shared `itemRef()`, which is a separate escaping boundary. No response HTML or script is inserted. Unknown items keep escaped names and a fallback icon instead of inventing stats.

### 5.3 Preserve actions while suppressing replaced native display

Source: [InventoryRenderer.preserveInteractiveTree](../../src/modules/InventoryRenderer.js#L444).

`hideOriginalChildren()` walks each native direct branch. A button/link/input/select/textarea/role-button/tabindex node is an interactive control; an ancestor containing one is a host. `preserveInteractiveTree()` restores interactive branches' owned display properties and marks `data-fs-preserved-action=control|host`, `data-fs-action-host`, and control kind. Noninteractive sibling branches get `data-fs-suppressed=1` and property-owned `display:none`. Controls are not cloned or reparented, and descendants of an interactive node remain owned by it.

Kinds: Equipped/Unequip → equipped; Equip → equip; Set Bonus → set; List/Sell/Use/Deposit/Withdraw → secondary; Lock/Unlock or empty SVG → icon; otherwise secondary. `syncRowState()` mirrors equipped and set action presence to `.is-equipped` / `.has-set-action` on the overlay. CompactButtons later adds art to the same native action controls. A `tabindex` presentation element is conservatively treated as interactive.

This is a real change to which native text is displayed. Correct parsing is therefore essential: a missed semantic line hidden by this process can disappear from the visible row even though its DOM and app state survive. Text inside controls is intentionally not parsed as noninteractive item prose. `restoreOriginalChildren()` restores owned display values and removes action/suppression markers, rather than removing an entire game `style` attribute.

### 5.4 Item icon, keyboard tooltip target, and async art fallback

Source: [InventoryRenderer.configureIconTooltip](../../src/modules/InventoryRenderer.js#L541), `paintIcon`.

The owned icon gets ID or name item reference, tooltip trigger, `tabindex=0`, `aria-haspopup=true`, `aria-expanded=false`, and `<name>, item details` label. It is not assigned button role. Existing tooltip engine delegation supplies interaction. Enhancement is included in the atlas name if it was rendered as a separate native token. `AtlasService.paint()` uses local art; unresolvable art becomes `❓`. If atlas is partially ready, paint now and repaint once readiness completes; complete atlas paints synchronously. Callback checks overlay/icon connection before mutating, so removed overlays do not paint after teardown.

### 5.5 Row cache, empty-update retry, and inventory cleanup

Source: [InventoryRenderer signatures](../../src/modules/InventoryRenderer.js#L63), [retry](../../src/modules/InventoryRenderer.js#L529), [clear](../../src/modules/InventoryRenderer.js#L725).

WeakMaps cache context and cheap signatures (child count, flattened text, DB revision, atlas revision); full signature adds resolved item ID/name, enhancement, quantity and details. A cheap cache hit still runs action preservation/state synchronization, but skips chrome and parsing. A full-signature hit similarly retains the overlay. A transient empty React row gets one rAF extraction retry, removing an obsolete overlay only if still empty. Updates from both data services reconcile every candidate row. All control state is sourced from native DOM; no game inventory API call occurs.

Clear removes overlays, restores display on all held nodes, deletes row caches for live candidates and inventory root/title/list/filter/control state, and removes separator nodes. The pending retry WeakSet is not reset; a disabled runtime can suppress its guarded callback before the marker is deleted. Chrome refresh depends on a row progressing beyond the cheap cache path, so an isolated filter-class update with completely unchanged row signatures warrants targeted coverage. Class toggles in `syncRowState` are unconditional and can emit mutation records; watcher behavior, not the presence of a cache alone, determines quiescence.

## 6. Generic overlay chrome

### 6.1 Detect and frame visible modal backdrops without taking over their contents

Source: [OverlayFramer.js](../../src/modules/OverlayFramer.js#L53), `visible`, `isScrim`, `pickCard`, `tagScrim`, `frameOverlays`, `clearOverlayFramer`.

Each DOM flush performs a whole-document candidate sweep for class strings containing `fixed` or inline `position: fixed` spellings. Computed style confirms fixed positioning, numeric z-index ≥20, visible box >8×8, coverage ≥85% of viewport in both dimensions with top/left within 15%, a descendant, and either backdrop blur or dark fill (alpha ≥0.15, luminance <90). Transparent positioning layers are rejected. Candidate query is a probe, not a claim that every `.fixed` is modal; CSS-fixed elements with none of those candidate spellings remain outside detection.

`pickCard()` prefers visible native `.panel` candidates. **Actual predicate:** it picks a panel that contains no other candidate panel (a leaf); its comment says “Outermost,” which does not match the code. Without a panel it chooses the largest visible child and descends through up to three almost-fullscreen (97%) wrappers. Tags are `data-iw-overlay=scrim|panel`. Cards already claimed by other skin roles or compact/section/inventory/skill frames are left to that owner. No child text/control is restyled by JS, no node is injected, no focus trap or close handler is added. Overlay CSS draws the frame on border/background/shadow so scroll-container ornaments do not move with content.

Connected tagged scrims are revalidated. In current source, tagged cards are not independently revalidated or untagged when their scrim stops qualifying, and an already tagged scrim is skipped in the candidate pass, so replacing its inner card while keeping the scrim can require further reconciliation work. `clearOverlayFramer()` reliably drops every overlay attribute and resets the Set. The substring sweep can be expensive on large pages; it deliberately runs every flush. Code comments record past measurements, not a benchmark performed for this handover. Errors warn once; unsupported shape is left native.

## 7. Quest card features

### 7.1 Positive quest identification and independent structure roles

Source: [QuestPanelRenderer.js](../../src/modules/QuestPanelRenderer.js#L57), `isQuestCard`, `textLeaves`, `questButtons`, `structureSignature`, `annotateStructure`, `findProgress`.

Quest and skill cards share `.compact-panel`, so the listener receives all skill-panel events and positively re-identifies a quest. It rejects existing `.fs-skill-panel`, requires a fast bulk Turn In or integer `% complete` signal, a leaf `Reward:` line, then a Turn In / Skip control or percent line. Despite broad comments, **Skip + Reward alone with neither bulk Turn In nor percent does not pass the early gate**.

Roles use their own `data-iw-quest-role`: optional work-order kicker, title, brief, objective N/M, reward, progress-label/track/fill, turn-in, skip. `data-iw-quest-zone=commands|content|row|body` describes existing branches and common ancestors; nothing is reparented. Progress detection requires a single-child div with percentage width and known progress/rounded/height/background clues, outside controls. `data-iw-quest-reward` contains reward copy without prefix, and `data-iw-quest-percent` contains the displayed integer percentage. Structure signature is text-leaf count + Turn In/Skip labels with `(N)` suffix removed + presence of progress track. It intentionally excludes live counts and disabled state; see stale derived-value caveat in §15.

### 7.2 Discipline accents, item medallion, and percent ring

Source: [QuestPanelRenderer.disciplineStyle](../../src/modules/QuestPanelRenderer.js#L37), [ensureDecoration](../../src/modules/QuestPanelRenderer.js#L291).

Reward text chooses accent/glyph in order: combat, mining, smithing, gathering/herbalism, alchemy, jewelcrafting, spellcrafting, tailoring, woodcutting, construction, crafting, fishing; unknown uses `#C9A66A` / `❖`. `renderCard` applies `.fs-quest-panel`, `data-fs-quest=1`, `--fs-quest-accent`, and state.

An owned `.fs-quest-sigil[aria-hidden=true]` is inserted before the body's first child. It carries `data-iw-quest-glyph`; objective name strips leading non-Latin-letter glyph run and trailing N/M. A resolved atlas sprite becomes `.fs-quest-sigil-icon` and `data-iw-quest-icon=1`; absence/removal falls back to discipline glyph. `.fs-quest-sigil-pct` mirrors percent data, else fill width. Atlas readiness uses a pending attribute to avoid duplicate promises. `SkillsArtService.decoratePanel()` adds the shared atlas frame under its own readiness guard. Unknown art/database does not block the quest's original controls.

### 7.3 Objective tooltip, readiness signal, and responsive command width

Source: [objectiveItemRef/ensureObjectiveTrigger](../../src/modules/QuestPanelRenderer.js#L168), [questState/renderCard](../../src/modules/QuestPanelRenderer.js#L386).

When ItemDatabase recognizes the objective name, the original objective paragraph gets item ID or name, tooltip trigger, `tabindex=0`, `aria-haspopup=dialog`, `aria-controls=iw-tip`, and initial `aria-expanded=false`. No wrapper is inserted; NameScanner's contract is to skip this explicit trigger. On a miss those attributes are removed. Turn In enabled (neither disabled nor aria-disabled) → ready; otherwise a Skip control → work-order; otherwise active. Native enabled state is never changed.

`measureCommandBlock()` measures the existing commands width, rounds it, and writes `--fs-quest-cmd-w` only when nonzero and changed. CSS can reserve sufficient space for real labels instead of guessing fixed width. No ResizeObserver is added; repeat card events/shared layout rediscovery drive updates. The icon fallback preserves a meaningful discipline reading if objective sprite lookup fails. Objective text/parser and original accessibility attributes are assumptions: clear removes injected attributes rather than snapshot/restoring preexisting same-name attributes.

### 7.4 Quest cleanup and async boundary

Source: [clearCard/clearQuestPanels](../../src/modules/QuestPanelRenderer.js#L436).

Clear removes objective trigger attributes, roles/zones, sigil nodes, copied reward/percent data, class, accent/command width, rendered/state/pending attributes and SkillsArtService panel decorations. Signature is invalidated. Page-lifetime event listener remains. This module has no direct item-db-updated/atlas-updated listener; refresh normally follows watcher/card events and its own readiness promises. The pending art callbacks check connection, not runtime/generation, and one callback calls `renderCard()` directly. A connected quest can therefore be redecorated after a kill-switch race unless the caller/service boundary is strengthened; normal guarded event listeners alone do not prove all async work inert.

## 8. Skill renderer features

### 8.1 Discipline identity, action controls, and safe three-branch layout detection

Source: [SkillPanelRenderer metadata](../../src/modules/SkillPanelRenderer.js#L35), [annotateStructure](../../src/modules/SkillPanelRenderer.js#L959), [renderPanel](../../src/modules/SkillPanelRenderer.js#L1524).

Recognized types and UI labels: Combat; Mining (Mine/Mining); Smithing (Smith/Smithing); Herbalism (Herbalism/Herb/Gathering); Alchemy; Jewelcrafting (Jewel/Jewelcrafting); Spellcrafting (Spellcraft/Spellcrafting); Tailoring (Tailor/Tailoring); Woodcutting (Wood/Woodcutting); Construction (Build/Construction); Crafting; Fishing; locked Coming Soon. Known verbs include Fight, Mine, Smelt/Forge, Gather/Harvest, Brew, Prospect/Cut, Enchant/Craft, Tailor/Sew/Weave, Chop, Craft Parts/Build/Craft, and Fish. Spellcraft/Tailoring/locked provide specific detail patterns. Smithing title matching additionally accepts Craft.

`applyPanelChrome()` adds `.fs-skill-panel`, one `.fs-skill--<type>`, `data-fs-skill=<type>`, `data-iw-ui=skill-panel`, `data-iw-skill`, glyph, and label. Unknown types clear only previously owned skill cards; they do not erase other modules' `data-iw-ui` roles on generic compact cards.

`annotateStructure()` resolves identity and action title using normalized text, strips leading glyphs, prefers direct leaves/rendered candidates, and promotes same-text wrappers. Native level-progress buttons are recognized before command buttons. Exact action verbs win; locked cards favor a disabled non-navigation control; other cards fall back to a short visible non-navigation control. Action title can fall back to a title beginning with the chosen verb, then the safe previous sibling of the level readout. Small-text or Prev/Previous/Next ARIA controls become nav buttons; first of a pair provides direction fallback. Shared parent gets nav-group.

Roles in `data-iw-skill-role`: identity, action-title, level-progress, action-button, nav-button, nav-group, xp-gain, requirement, reward, action-detail, progress-track/fill, ingredient, identity-level/icon. Requirement met/unmet reads native red/rose/orange/amber/yellow/danger/warning classes into `data-iw-req-state`; absence defaults met. Base Reward and XP lines remain the game's data.

Only if identity/title/action occupy three distinct direct branches under the card or its one-level inner shell does it mark identity/content/commands zones and `data-iw-skill-layout-shell=1`. Any unexpected in-flow branch >2 px prevents `data-iw-skill-layout=three-zone`; known progress tracks and owned V2 rows/glyphs/labels are excluded. This preserves unsupported native layouts instead of force-fitting them. It uses computed styles/rects but batches candidate visibility before sorting, avoiding style reads inside sort comparators.

### 8.2 Native button state, atlas command plates, and compact dimensions

Source: [SkillPanelRenderer.styleButton](../../src/modules/SkillPanelRenderer.js#L68).

Classification priority: disabled/aria-disabled, then ≤2-char icon, then native warm primary classes, otherwise secondary; a recognized action button becomes primary unless disabled. `data-iw-btn-state` mirrors this. Buttons retain native text, handlers, disabled state, and ARIA. The level-progress button has prior button styling restored rather than being painted as a command.

Property-owned inline `!important` styles cover font family/size/weight/tracking/case, radius, transition, alignment, height/min-height, flex-shrink, background, border, text color/shadow, padding, min-width, cursor, box-shadow and role-specific width. Four state maps deliberately use matching keys to prevent stale state-specific properties. Ready action art uses atlas idle/disabled backgrounds and `--fs-button-*` hooks; hover/pressed crossfades are CSS-driven.

Legacy nav dimensions are 26×44 px, V2 uses `--iw-skill-v2-nav-w/h` (fallback 39×22); text becomes transparent/0-size while native accessible name remains. Legacy action is 155×44; V2 uses `--iw-skill-v2-btn-w/h` (fallback 90×94), padding/font/tracking tokens, rounded border and shadow tokens. Token indirection permits CSS media/container rules to override appearance despite inline importance. Snapshot key includes state, role, art readiness, compact mode, and current style serialization; native style changes invalidate it. No synthetic clicks or gameplay logic.

### 8.3 Flatten level readout presentation while retaining clickability

Source: [neutraliseReadouts](../../src/modules/SkillPanelRenderer.js#L357).

Matches `Lv N[+bonus] – P% • X XP to go` or `Lv N • current/max XP`, using an assigned level role first and text fallback second. Walks same-text/containing wrappers until another control/role or panel boundary. Writes `data-iw-readout=1`; property owner removes background/border/radius/outline/shadow/padding/margin/fixed dimensions, transform/filter and alignment constraints. Cursor is pointer for an actually interactive readout, default otherwise. Previously marked branches no longer applicable are restored. The native level button still handles its original action; the visual surface changes, not its state.

### 8.4 Material sufficiency highlight without rewriting game text nodes

Source: [ingredient parser/highlights](../../src/modules/SkillPanelRenderer.js#L509).

`neutraliseIngredients()` finds non-control div/span/p material N/M text excluding XP, owned grids, and V2 mirrors. Same-text wrappers get `data-iw-ingr` plus owned background/border/radius/padding/shadow neutralization. `ingredientEntries()` and `completedIngredientRanges()` parse comma-formatted owned/required quantities. Start boundaries use bullets, newline, text-node parent changes, and previous match end, so concatenated emoji item rows need not contain spaces between sibling elements.

Met means numeric owned ≥ required. Custom Highlight API paints met original text ranges under the name `iw-skill-ingredient-met`, without splitting/replacing React text. Range construction catches stale node errors; unavailable API simply skips this decorative layer. A Map of per-panel ranges is pruned for disconnected panels and rebuilt globally; highlight changes are not a second observer.

### 8.5 Material grid mirror and per-material state

Source: [updateIngredientLists](../../src/modules/SkillPanelRenderer.js#L684).

Each outer ingredient source gets an adjacent owned `.fs-skill-ingredient-grid[data-iw-skill-ingredient-list=1][role=list][aria-label="Required materials"]` and source marker `data-iw-ingredient-list-source=1`. Items are `span.fs-skill-ingredient-item[role=listitem]`, carry `data-iw-ingredient-state=met|unmet`, and copy source text via textContent. Signature joins state+text, so only changed lists rebuild. Original source remains for game reconciliation and CSS controls which presentation is visible. Owned nodes are excluded from source matching to prevent self-replicating material grids. Cleanup removes list nodes/markers, range entries and property-owned neutralization; stored app quantities are never modified.

### 8.6 Skill medallion, section artwork, clean labels, XP plaque, and progress mirrors

Source: [ensureSkillArtwork](../../src/modules/SkillPanelRenderer.js#L1250), [ensureSkillPresentation](../../src/modules/SkillPanelRenderer.js#L1381).

Appends `.fs-skill-medallion-art[aria-hidden]` to identity with type/readiness/pending attributes, paints discipline art via SkillsArtService, and replaces only this node if type changes. An ancestor containing exact Skill Actions heading gains `.fs-skills-section-frame` and shared panel atlas variables. No gameplay branch moves.

Native identity/title get `data-iw-clean-text` (canonical discipline label / leading-glyph-stripped title); readout gets `data-iw-progress-display`, removing duplicate percentage but preserving level and remaining/total XP. Owned identity percent text rounds a numeric percent to one decimal, and an aria-hidden tiny progress track/fill mirrors native fill-width first, semantic aria values second, level-readout percent third. It never changes the native width. Content receives aria-hidden `.fs-skill-base-exp` / `data-iw-base-exp` with `Base: N`, read from Base Reward XP or XP-gain line. No XP value → no plaque; no percent → remove percent and use zero for the decorative fill.

### 8.7 Skill caches and teardown

Source: [structureSignature](../../src/modules/SkillPanelRenderer.js#L939), [clearPanelChrome](../../src/modules/SkillPanelRenderer.js#L1459).

Structure key is skill type, direct child count, and normalized native button text/ARIA with digits replaced by `#`; disabled contributes only for locked cards. This avoids expensive role strip/layout discovery for ticking numbers or request-wide disabled toggles. Readout/material/button presentation still reconciles. It does not encode non-button subtree identity or requirement class changes, so current derived requirement state/roles can remain cached beyond such a change. `textCandidates` has a one-last-panel memo with no explicit reset at render start or teardown; consecutive reclassification of the same card can reuse disconnected/stale candidates.

`clearPanelChrome()` removes role/zone/layout/navigation/requirement hooks, owned art/percent/progress/XP and clean text, all skill classes/data, shared panel art, ingredients/highlights and inline treatment. It deletes `data-iw-ui` only if it equals skill-panel. Global clear visits compact panels, removes section frame class/art, restores all held inline-style nodes including detached ones, and removes global highlight/lists. Regular listeners stay registered. Async artwork callbacks mostly check node connection; section-frame decoration has no connection/runtime check in its closure. A kill-switch race needs separate coverage, not an assumption that outer event guards cover promises.

## 9. Current skill-card V2 features

### 9.1 Fixed expanded design and native-section categorization

Source: [SkillCardDesignController.js](../../src/modules/SkillCardDesignController.js#L12), `initSkillCardDesignController`, `markSections`, `removeRetiredNodes`, `enhanceSkillCardV2`.

Current design is always V2 expanded: `<html data-iw-skill-card-design=new>` plus card `data-iw-skill-v2=1`, `-type`, `-state=expanded`. No player design storage, old/new switch, tab strip, per-card collapse, or summaries are created. Old marked summary/break/expand/tabs and design-toggle nodes are removed when encountered; CSS selectors retain legacy state names for cascade compatibility.

Marks native/renderer sections as requirements, materials, details, rewards, queue, sources. A detail containing queue/missing-material text becomes queue. Source phrases require Gather/Harvest/Obtain/Found/Source plus from/in/at and exclude action-title. Only materials, sources, details appear in the V2 center mirror. Queue/reward source lines are marked for clipping, and requirements appear in the footer only when unmet. This intentionally changes visible information density; it does not cancel or change a queued action. The authoring comment says reward repeats Base, but other reward/queue information must not be assumed equivalent if upstream copy changes.

### 9.2 Consistent level/percentage readout

Source: [levelReadout](../../src/modules/SkillCardDesignController.js#L66).

An owned `.iw-skill-v2-level-readout` with separate level and percentage spans is appended in the identity branch. Reads assigned level-progress first, identity copy fallback, and existing identity percent for percent. Accepts a level bonus (`Lv 57 + 2`); clamps progress to 0–100 for `--iw-skill-v2-progress`; absent values show `Lv —` / `—`. Text writes compare first. It is a mirror, not a new skill level calculation. The new readout itself is not assigned aria-hidden here; accessible duplicate handling must be assessed with the clipping CSS.

### 9.3 Decorative action glyph and visual label mirror

Source: [ensureActionGlyph / ensureActionLabel](../../src/modules/SkillCardDesignController.js#L117).

Finds the assigned action button, including when the commands zone is itself the button. Appends aria-hidden `.iw-skill-v2-action-glyph` and `.iw-skill-v2-action-label` to the button's **parent**, not inside the game button. Removes old mirrors under another parent. Matching containing blocks keep CSS placement aligned even when the game adds wrappers. The label copies normalized native button text. CSS selects imported action glyph by card type; unsupported disciplines keep label-only treatment. The original native button's semantic label remains unchanged.

### 9.4 Fit command label after layout and font readiness

Source: [fitActionLabel](../../src/modules/SkillCardDesignController.js#L317), `labelTextBox`, init fonts callback.

TreeWalker + Range measure only nonempty visual-label text. Available room is label/button clientWidth minus computed left/right padding; computed font/tracking scale linearly to a floored tenth of a pixel. `--iw-skill-v2-action-label-font` is clamped to 4–9.5 px. Cache key in `data-iw-skill-v2-label-fit` includes text, layout, inline button width and Viewport epoch; key is written before measurement, so zero-width hidden columns/layoutless fixtures are not repeatedly measured until an invalidation. `document.fonts.ready` clears existing fit keys and retries once per activation. There is no continuous ResizeObserver; same-breakpoint size changes without key change can retain an old fit. The 4 px floor is an explicit readability tradeoff, not an accessibility guarantee.

### 9.5 Smooth native activity fill and reset without a second progress model

Source: [smoothActionFill](../../src/modules/SkillCardDesignController.js#L220).

Reads a direct native action-button span with percentage inline width. Shared `sampleProgress()` returns measured CSS duration and completion-reset flag; writes `--iw-skill-v2-fill-duration` only when cadence changes and a one-frame `data-iw-skill-v2-fill-reset` on wrap/reset. Samples are keyed by card; stop/restart on same card retains measured cadence until cleanup. CSS supplies the transition. No width is written to the native fill and no action completion or interval is synthesized.

### 9.6 Long-action countdown sourced from Current Action

Source: [durationSeconds / syncLongActionTimer](../../src/modules/SkillCardDesignController.js#L244), [syncTimersOnTick](../../src/modules/SkillCardDesignController.js#L298).

Reads the rendered Current Action host by assigned panel or duplicated `id=current-action-panel`; accepts leaf `time/span/p/strong/div` clock notation H:MM:SS / MM:SS or h/m/s unit copy, excluding progress. A skill with a fill is considered running. If remaining seconds exceed 11, the card latches `data-iw-skill-v2-long-action=1` and the aria-hidden glyph becomes `data-iw-skill-v2-action-timer` with exact native countdown text. Latch keeps the countdown as it crosses 11 seconds; removal of running fill clears it. Missing remaining text leaves a prior long state unchanged rather than fabricating time.

Both flush event types first test whether roots touch a Current Action host, then pay for rendered resolution and one shared remaining-time read for all eligible skill cards. This updates long crafts whose own fill ticks slowly. No timer or extra observer is created. The module does not match the Current Action name back to a specific skill; if several cards expose running fills they can all mirror the same timer. Native countdown remains the accessible source because glyph is aria-hidden.

### 9.7 Expanded materials/source/detail body and unmet-requirement footer

Source: [ensureDetailBody](../../src/modules/SkillCardDesignController.js#L372), [syncRequirementNote](../../src/modules/SkillCardDesignController.js#L459).

Appends `.iw-skill-v2-body` as an owned row under the assigned layout shell/card. Selects one ingredient grid in preference to raw material text, otherwise outermost matching sections, and copies rows. Material rows retain `met|unmet` as `data-iw-skill-v2-body-state`; trailing N/M is split into `.iw-skill-v2-body-name` and `-count` so counts survive tight layouts. All strings use textContent. Signature includes kind/state/text; only changes rebuild owned children.

For unmet requirement sections only, deduplicates exact text and adds an owned `.iw-skill-v2-controls[data-iw-skill-v2-row=tabs]` footer with `.iw-skill-v2-req-note[role=note]`, joining copies with a middle dot. The row name `tabs` is retained styling vocabulary, not a live tab feature. Met/no requirements remove the footer. Nothing recomputes requirements from levels; it relies on SkillPanelRenderer's native-class-derived state.

### 9.8 V2 cleanup

Source: [clearSkillCardV2 / clearSkillCardDesignController](../../src/modules/SkillCardDesignController.js#L497).

Clear removes own readout/glyph/label/body/footer/legacy nodes, section marks, progress/font/fill-duration variables, fill reset/long-action/cache attributes and sample entry, and V2 identity/state/tab attributes. Controller clear flips `active=false`, removes root design marker/toggles and clears live V2 compact panels. Registered listeners remain but check active and runtime. Fonts callback checks active and guard. Reset-rAF only deletes its own attribute. No persistent preference is written or deleted.

## 10. UIFoundation route and activity features

### 10.1 Main nav classification and state preservation

Source: [UIFoundation.resolveMainNav/applyMainNavState](../../src/modules/UIFoundation.js#L145).

Collects button/link/role-tab candidates for Game, Market, Leaderboards, Village, Dungeon after stripping leading/trailing icon badges. Requires at least four distinct labels, selects rendered candidates per label, and finds common track plus up to three same-content wrappers ≤110 px tall. Marks main-nav/main-nav-shell unless a node is already a section-frame; tabs get `data-iw-ui=nav-tab`, `data-iw-tab` and optional `data-iw-state=active`.

State precedence is semantic/class active signals, then pathname/hash label matching, then warm computed background on first classification, then preserved previous state. Native classes, selected/current attributes, route and handlers are not changed. Semantic/class detection can mark several tabs active if supplied by the game; it does not force a single active index. Cache checks layout epoch, connected marks, and count of distinct supported labels, catching a newly unlocked Dungeon. SSF root or housing-route names may not match label fallback directly, so native signals remain important.

### 10.2 Companion Toolkit link

Source: [ensureToolkitLink](../../src/modules/UIFoundation.js#L289).

Appends one owned native anchor `data-iw-nav-link=toolkit`, styled as nav-tab, label Toolkit and title explaining a new tab. Target is exactly `https://idleworldstoolkit.com`, `_blank`, `rel=noopener noreferrer`; no credential or app data is appended. Toolkit is excluded from the Game-route label set and is never marked active by nav classification. CSS hides it below 768 px to keep phone navigation usable. It is a deliberate new outbound control; normal browser navigation/network disclosure happens only if followed. Clear removes the link completely.

### 10.3 Zone title, previous/next/selector buttons, and auxiliary text link

Source: [classifyZoneBar](../../src/modules/UIFoundation.js#L326).

Finds innermost icon-prefixed Zone N: labels among short div/span/p/strong branches, climbs up to five ancestors until Zones and Next Zone controls coexist, and stops before reaching a wrapper containing header/nav. Tags zone-bar, zone-title and exact Zones/Previous Zone/Next Zone controls. `data-iw-zone-action=zones|prev|next` lets CSS assign art by meaning instead of position. Other buttons not sharing an action parent get `data-iw-zone-link=1` so “who's here?” reads as a text link. Native action and disabled states remain untouched.

Nonempty resolutions validate connections and marks; empty resolution is reused only while a cheap button scan finds no Zones+Next Zone candidate. This prevents the empty-cache freeze on returning from routes with no zone bar. Existing cached control sets do not count newly inserted action siblings the way nav does; shape changes need invalidation. No route/history interception is involved.

### 10.4 Generic route frames, native panels, and overlay exclusion

Source: [classifySectionFrames](../../src/modules/UIFoundation.js#L439).

Every rendered `.panel` is the primary frame target except header/zone/activity-owned surfaces or overlays. A per-pass heading index supplies each native panel's first own h1–h4. Attributes are section-frame and section-title. Nested panel columns are left for CSS's leaf frame rule. `inOverlay()` honors overlay attributes and confirms a nearest class-containing-fixed layer through computed position; this avoids applying scrolling pseudo-element section ornaments to dialogs.

Only headings with **no** `.panel` ancestor use the name fallback: Inventory, Market, Leaderboards, Quests, World Bosses, Village, Salvaging, Skill Actions, Zone Selector. Leading icon run is stripped. A bounded ancestor walk demands substantial content (≥12 descendants and ≥45 text chars), roomy rect (>320×110), and no multiple unrelated panels; compact cards stop the walk. Unknown names inside proper `.panel` still frame, so new routes need not be hand-added to that regex.

Cache includes layout epoch, connection, roles, heading coverage and nodes examined, including misses. Async headings arriving after an empty frame and routes arriving after an empty resolution can reclassify. Stale marks are removed unless another owner has claimed the panel. `headingIndex()` is memoized only for one queued pass, reducing repeated whole-document/per-inventory subtree queries.

### 10.5 Boss section discovery

Source: [classifyBossCards](../../src/modules/UIFoundation.js#L688).

Exact World Bosses h1–h4 (this matcher does not strip leading glyphs) resolves a native `.panel` or section-frame fallback. Rendered selection/layout epoch and examined-heading coverage handle duplicate columns and route return. Every leaf `.compact-panel` in that root gets `data-iw-boss=card`; `decorateWorldBossPanel()` handles specific encounters and Zone Control. Cached hosts still sweep cards every pass so newly mounted cards decorate. Old host decorations are cleared before a new resolution. Skill-panel text/button events can call the boss decorator directly even when no broad DOM flush is emitted.

### 10.6 Market listing cards and flat item-name control

Source: [classifyMarket](../../src/modules/UIFoundation.js#L772).

Exact Market section-title identifies its nearest section-frame; marks `data-iw-market=root`. Leaf `.compact-row` children, excluding inventory overlays and feed rows, become `row`. Native `button.text-left` / flex-1 name control becomes `namebtn` so it opts out of generic forged-button plate styling while retaining its original click. No market value, listing, purchase, or sale action is issued. Title coverage prevents empty-route freeze; all current cards are swept even on a cache hit. Stale root/row marks are removed on re-resolve and clear.

### 10.7 Village route discovery

Source: [classifyVillagePanels](../../src/modules/UIFoundation.js#L858).

Rendered headings, stripped of leading icons, distinguish exact Village (housing) and Village Add-ons/Addons. Nearest native `.panel` is required; no guessed outer wrapper. Layout epoch, connection and heading coverage invalidate the cache. Decorator receives `{root, heading, kind, epoch}` each pass; VillagePanels owns the `data-iw-village*` attributes. On root/column switch previous decorations clear. Reconciliation of VillageScene follows this pass so the scene can read these native-route hooks immediately.

### 10.8 Current Action frame, queue, and measured progress transition

Source: [activity resolution](../../src/modules/UIFoundation.js#L985), [current action](../../src/modules/UIFoundation.js#L902).

Activity labels can be semantic headings, exact leaf text, direct text alongside a control, or stable Current Action ID fallback. Duplicate IDs are queried as a set and rendered preference is used. Hosts resolve through bounded ancestor structure (progress, View All/XP rate + body, or World Chat placeholder), with native `.panel` fallback. Host receives section-frame, `data-iw-panel=current-action|action-log|world-chat`; title gets section-title. Header classification distinguishes one combined row from separate title/tools branches; owned collapse controls are excluded from the shape.

Current Action identifies semantic progressbar/aria-valuenow-max first, otherwise percentage-width fill. Tags `data-iw-panel-part=progress`. `sampleProgress()` reads native percentage and writes measured `--iw-progress-duration`; wrap/reset adds `data-iw-progress-reset` for one rAF. **Native progress is not recomputed or written.** Inline duration can cause one additional observed style flush; same percentage exits cadence work. Exact Queued leaf plus nearby native button identifies queue branch. No scheduler/crafting queue is modified.

### 10.9 Action Log feed and View All treatment

Source: [classifyFeed/classifyActionLog](../../src/modules/UIFoundation.js#L1059).

Exact View All button/link gets panel-control. Feed markers are leaf HH:MM:SS timestamps, otherwise System leaves; their common ancestor or direct branch determines feed, and direct rows become feed-row. Fallback selects a non-header/non-owned/non-form/non-input/non-heading direct branch. These hooks style height/scroll/rows; no log item is removed or fetched. Structural heuristics can misidentify an unfamiliar empty feed, so preserving raw native nodes is important. Text reads may include user-visible log data but are never transmitted by this classifier.

### 10.10 World Chat input, composer, Send and feed treatment

Source: [classifyWorldChat](../../src/modules/UIFoundation.js#L1105).

Matches input/textarea by placeholder “message world chat”, tags chat-input, climbs up to three ancestors for exact Send button, then marks composer and send; shared feed classification tags existing messages. It reads placeholder/DOM text, not `.value`; it does not intercept typing, collect drafts, add submit handlers, or send chat. Native message/color information must remain preserved by corresponding CSS. The Send button later receives compact artwork, not a new command.

### 10.11 Daily XP Boost state line

Source: [classifyDailyBoost](../../src/modules/UIFoundation.js#L1325).

Searches only the Skill Actions/Actions heading branch within resolved section frames for innermost `Daily XP Boost … +N% XP` copy, after leading icon stripping. Marks `data-iw-skill-boost=1` only while a real bonus-shaped string remains; “no boost” copy is not painted as satisfied. Cache checks connected marked node, containing frame and current copy. Removes stale mark on change/clear. This is a native bonus visualization, not an inferred bonus or timer.

### 10.12 Foundation cleanup, error isolation and responsiveness

Source: [clearUIFoundation](../../src/modules/UIFoundation.js#L1404), [inject/init](../../src/modules/UIFoundation.js#L1451).

Each classifier is separately guarded so a nav failure does not block other surfaces. Scene async rejection gets a `.catch` because synchronous `guard` cannot catch it. Queue flag resets before work. Cleanup explicitly delegates header chrome, collapses, scene/ledger, compact buttons, daily boost, boss and Village route; clears all resolution sets/memo, Toolkit nodes and progress samples/duration/reset; sweeps UI/tab/state/panel/parts/header/zone/boss/market attributes. It is intentionally whole-document cleanup of reserved namespaces; another extension using these exact markers would conflict.

Responsiveness is mainly CSS. Viewport layout epochs from the shared watcher invalidate duplicate-column-dependent caches on breakpoints without another observer. Section/market/boss/village/activity resolution has explicit coverage checks for empty-route returns. HeaderChrome/HeaderRenderer use different narrower cache checks. UI initialization does not itself have a once-only boolean; `content.js.bindConsumersOnce` is its normal lifetime guarantee.

## 11. Village route decoration

### 11.1 Installed/vacant slots and native action state

Source: [VillagePanels.decorateSlot](../../src/modules/VillagePanels.js#L169).

Native children exclude only `data-iw-village-owned` decorations. The first child is head; first head branch is copy paragraphs. Slot N identifies index, Empty slot indicates vacant, otherwise first/second remaining paragraphs are name/effects. Unknown shape is undecorated. Slot gets `data-iw-village=slot`, state `vacant|installed`, and roles head/copy/index/name/effects/vacant. Action branch gets actions or action, buttons get action plus verb `destroy|uninstall|install|cancel|other`. The second native child is an open install picker.

These attributes preserve the native install/cancel/destroy/uninstall controls, cost copy, disabled state and callbacks. No operation is issued. Installed name resolves against normalized `VILLAGE_BUILDINGS`; it supplies `assets/village/building_<tier>.webp` through `--iw-village-sprite` on an appended `.iw-village-art[aria-hidden]`. Missing entry uses `data-iw-village-art=generic` rather than empty artwork. Known art uses building/house marker; CSS paints sprite and ground on separate layers.

### 11.2 Install picker art and installed-building tooltip

Source: [ensureTrigger](../../src/modules/VillagePanels.js#L143), [picker loop/ensureOptionArt](../../src/modules/VillagePanels.js#L209).

Picker button or div with a direct `<p>` is tagged option/option-owned; name paragraph gets option-name. The first child text strips the separate quantity span before building lookup. Known entry gets a prepended `.iw-village-option-art[aria-hidden]` with local sprite variable; unknown removes it. Native option box/hit area and “already installed elsewhere” state remain owned by game.

Installed **name paragraph only** gets shared tooltip reference by database name, `tabindex=0`, `aria-haspopup=dialog`, `aria-controls=iw-tip`, and initial expanded=false. Controls are not falsely described as opening item dialogs. A missing database/item removes trigger attributes. NameScanner contract excludes explicit triggers. The option art is prepended into the name paragraph; current first-child lookup can subsequently encounter that empty owned span after another signature-changing update, a source-derived edge case worth fixing by excluding owned children when extracting text.

### 11.3 Housing hero and five-tier track

Source: [houseTier / decorateHousing](../../src/modules/VillagePanels.js#L281).

First compact card/direct paragraph is the native house name. Current tier: N wins over mapped name; 0 maps to no-house generic plot. Tags root housing, card house, numeric tier, and name/tier/salvage/next/max/note paragraphs. Every native button in this card is classified upgrade; its action still belongs to game. Appended house art uses tier-specific local file. Owned `.iw-village-tiers[aria-hidden]` contains five pips with `data-iw-village-pip=held|open`, a redundant reading of current native tier, not an unlock action.

### 11.4 Route caching, intro/note treatment and cleanup

Source: [decorateVillagePanel / clearVillagePanel](../../src/modules/VillagePanels.js#L350).

Add-ons root gets addons; first direct `<p>` gets intro and trailing non-card paragraphs become note. Slot signature is head copy + all button labels + native-child count + ItemDatabase revision, so installs/picker changes/data readiness can repaint; disabled-only request toggles do not invalidate it. Housing signature is flattened card copy + native-child count. These are WeakMaps; no listeners/timers/storage/fetch are defined here.

`undecorateSlot` removes owned art and tooltip hooks, Village role/state/action/art and slot cache. `clearVillagePanel(root)` clears leaf cards, all route-owned nodes/triggers and village/tier/pip namespaces, including root. It never removes scene-owned nodes: `data-iw-village-scene-owned` is deliberately different. Housing WeakMap entries are not explicitly deleted, so clearing and reactivating the same unchanged housing node can hit its old signature after only root/card markers are reapplied; tier/name/art/pips need a targeted same-node lifecycle check. Trigger cleanup removes attributes rather than restoring original tabindex/ARIA values.

## 12. Dashboard Village scene and authenticated data boundary

### 12.1 Anchoring and all-owned village composition

Source: [VillageScene.findAnchor](../../src/modules/VillageScene.js#L121), [render](../../src/modules/VillageScene.js#L181).

The dashboard does not contain village data, so this module owns a new Village frame below Skill Actions/Actions. `findAnchor()` uses exact h2 text, excludes existing scene/dialog/overlay, resolves native `.panel` or Skills frame, and picks rendered candidate. Cache keys on connection, heading, Viewport epoch. Leading icons are **not** stripped in this exact matcher. It inserts its new section with `target.after(frame)`; no game node changes parent. If no anchor exists, its frame is removed but same-league snapshot survives.

Every created scene/ledger node receives `data-iw-village-scene-owned=1`. Outer section is `.iw-village-scene`, `data-iw-village-scene=1`, section-frame, `data-iw-panel=village-scene`, `aria-label=Village`. Owned heading uses role heading/level 2 and installed/capacity count. Body contains stage/scene + ledger. Center home shows tier/name; five plots have `data-slot=1…5`, `data-plot-state=installed|empty|locked`, art or placeholder, name, and textual slot/status. Images use extension-local src, `alt=''`, asynchronous decoding; adjacent text carries meaning. Unknown art shows `⌂` / `◇`; tier 0 says No House.

The figure is read-only: no plot installs/upgrades/navigation handlers. A note points the user to the game's Village tab. CSS container-driven wrapping responds to actual column width, not just viewport; scene stays together while ledger wraps below when needed. Render signature includes normalized snapshot, status, house perks and **ItemDatabase revision**, so data arriving later can fill ledger effects on an otherwise quiet page.

### 12.2 Narrow validated snapshot and unknown-building fallback

Source: [normaliseVillage](../../src/modules/VillageScene.js#L68).

Reads only `data.player.housing.tier` and `data.player.villageAddons.totalSlots/installed`. Requires integer housing tier 0–5, integer capacity 0–5 and installed array. Constructs exactly five slots, capacity slots empty and the rest locked. Each installed row needs an integer slot within capacity; duplicate slots reject the entire snapshot. Identity lookup uses `construction_building_tier_<tier>` itemKey first, normalized display name second. Unknown named building survives with `file:null`; unknown entry with no name rejects. Route-only data reconstructs itemKey from mapped tier.

Output retained in module memory is `{tier, capacity, slots:[{slot,state,name,file,itemKey}]}`; no full player response is stored or sent onward. Shape validation is partial: arbitrary non-string truthy names, unexpected extra properties, a null row or oversized installed array are not all explicitly rejected before processing; exceptions are caught by request handling or caller guard. Names are inserted via textContent, not HTML. Housing tier/capacity consistency is not enforced beyond bounds; API remains the authority for both.

### 12.3 Native Village route as immediate source and verbatim housing perks

Source: [readHousingPerks/readRenderedVillage](../../src/modules/VillageScene.js#L146).

On every reconciliation, before seeking dashboard anchor, it looks for rendered route housing/add-ons hooks created by VillagePanels. Tier comes from Current tier text, capacity from intro “N slots available,” and card count must exactly equal capacity to avoid React mid-update. Installed slot indices/names are read from classified paragraphs and normalized through the same snapshot validator. This means visiting Village can update the cached dashboard picture even when API is unavailable, and a later tab return retains it.

Housing is not an item. Perks are captured from each `<p>`'s Current tier tail, split at the game's bullet/middle-dot/pipe separators, and stored verbatim beside snapshot with the tier they describe. No action interval formula or unknown perk is guessed. Same-tier empty reading preserves already captured perks; tier change makes old perks inapplicable. API refresh carries no perk line but does not discard matching-tier native copy. A player who has not opened Village this activation gets slots plus no invented housing-speed text.

### 12.4 Exact request, authentication, league, and section contract

Source: [leagueOf/sectionOf](../../src/modules/VillageScene.js#L41), [reconcile request](../../src/modules/VillageScene.js#L310).

The request is `GET /api/player?section=<encoded section>&scope=core`, `credentials:'same-origin'`, `cache:'no-store'`, an AbortSignal, and explicit `x-idleworlds-league` set to `ssf` if pathname begins `/ssf` as a segment, otherwise `standard`. Section strips that prefix and surrounding slashes; recognized route paths are empty→dashboard, housing→housing, market→market, leaderboards→leaderboards, dungeon→dungeon; everything else falls back dashboard. It is normally made only with a dashboard anchor present.

This is a sensitive **authenticated player-data read**: the browser sends applicable same-origin cookies automatically, although this code never reads cookie contents, token storage, password, authentication header values, or browser profiles. The page's fetch monkey patch is not visible in the isolated content-script world, hence the explicit league header. The response JSON may contain more player fields than retained; the full JSON is still parsed transiently before the normalizer projects the narrow snapshot. No POST/PUT/PATCH/DELETE, gameplay state change, analytics upload, or third-party transmission is issued by this function. A server may still log/request-account for the GET; client source alone cannot prove undocumented server behavior.

### 12.5 Refresh eligibility, cancellation, hidden tabs, and stale fallback

Source: [reconcileVillageScene](../../src/modules/VillageScene.js#L256).

Active runtime is required. Route context is pathname+search, not hash. Any context change increments generation, aborts in-flight work, and shortens next eligibility with `Math.min(nextRead, now+10000)`. League change additionally drops snapshot/perks/status signature; ordinary route change preserves them. Thus the 10-second constant is an eligibility upper bound after a route change, **not a strict inter-request rate floor** when `nextRead` is already past or zero.

After DOM read/anchor mounting/render, a request starts only if none is active, deadline elapsed, and visibilityState is not hidden. It sets nextRead to five minutes ahead immediately and a ten-second abort timeout. Non-OK HTTP, JSON failure, invalid snapshot, network error or timeout render a failure note and set 30-second retry eligibility, retaining a prior snapshot. Successful normalized data is committed only if not aborted, same generation, and active. Stale completion on old route/league or after teardown is discarded. `finally` clears timeout and clears request only if it still owns that controller.

There is **no periodic timer for those five-minute/30-second deadlines and no visibilitychange listener**. Another UIFoundation DOM flush or item-db update must call reconcile to retry/refresh. Source/docs calling this a “poll” should be understood as opportunistic refresh. Route absence aborts current request and removes frame. A DOM update while an API read is in flight does not itself advance generation, so an older server response on the same route can replace a more recent DOM snapshot; server freshness is assumed. After abort due solely to anchor absence, the rejection can still set retry messaging because generation only changes on route/clear; it cannot reinsert an absent frame.

### 12.6 Render ownership, collapse coordination, memory, and teardown

Source: [render child cleanup](../../src/modules/VillageScene.js#L194), [clearVillageScene](../../src/modules/VillageScene.js#L334).

Changed scene render removes only direct children carrying scene ownership rather than `replaceChildren()` on the frame; unrelated direct children are preserved. However the scene-owned heading can contain a CollapsibleFrames toggle, so deleting that owned heading also deletes its nested toggle. Normal next classification recreates it from preferences. On normal UI pass the synchronous render precedes collapse decoration; a later network/DB render can produce a short interval until another flush. Collapsed preference is on the frame and remains unless frame itself is recreated.

Clear increments generation, aborts request, removes frame, clears ledger memory, discards perks/anchor/snapshot/signatures/context/league/status/deadline/epoch. The item-db listener remains but active check stops it. Snapshot is not persisted in extension storage, so disabling/re-enabling reloads it; league swap always purges old character's village. There is no account identifier in cache: same-league account changes without page teardown can retain prior snapshot until next read. Strongly separate identity-sensitive state from presentation preferences in a future integration.

## 13. Village ledger and generated identity maps

### 13.1 Building effects and home reading

Source: [VillageLedger.buildingItem/buildingBenefits](../../src/modules/VillageLedger.js#L238), [buildVillageLedger](../../src/modules/VillageLedger.js#L316).

Each installed slot joins ItemDatabase by itemKey/name and runs shared `deriveDisplayStats()`. Lists finite nonzero ATK, DEF, HP, Warfare, XP/task, 2× gather %, Gold find %, Item find %, All/Fire/Frost/Lightning resists, Bonus brew/enhance/enchant %, plus item skill_bonus_skill/value as a named skill level. Values round to two decimals with + sign for positives and % only on percent fields. Missing record shows no invented effects; waiting DB says effects arrive with database. Existing database + unknown item currently says “This building records no effects,” which conflates missing lookup with a known no-effects record.

The home entry is separate: name/file from housing map, Home · tier N, slots from capacity, and verbatim captured perk lines. Tier zero invites building a home. It contributes no item-derived stats. Five slot positions appear in the list; uninstalled ones show Empty plot or Locked · upgrade housing without a disclosure.

### 13.2 Overall stats from installed building records only

Source: [totalBenefits](../../src/modules/VillageLedger.js#L274).

Sums the listed numeric display fields directly; percentage points are added, not compounded, and skill levels are accumulated per skill then sorted by skill name. Housing is never added. Overall stats uses owned section, level-3 role heading, a `<dl>` term/value reading, and source note. It is a presentation sum of item fields, **not a server-authoritative final character-stat calculation**. Missing records are excluded from totals; “Summed from N installed buildings” N is actually matched records. If none resolve despite known installed slots, the current “No installed buildings yet” note can be misleading. This is a data completeness concern, not evidence of app-data mutation.

### 13.3 Home/building disclosure and whole Buildings-list disclosure

Source: [entry/wire/applyEntry](../../src/modules/VillageLedger.js#L125).

All nodes are created through VillageScene's `own()` factory, not a separate ownership prefix. Each entry has icon/label/meta/chevron button and ID-addressed body; button `aria-controls`, `aria-expanded`, and title reflect state. Body lists effects with dl/dt/dd and prose notes; decorative icons/chevrons are aria-hidden and image alt is empty. Whole Buildings heading has its own small toggle addressing list ID. Overall stats is a **sibling** of list, so hiding Buildings retains totals and the figure.

Uses only `data-iw-vs-toggle` and `data-iw-vs-open=1|0`, avoiding CollapsibleFrames' global namespace. Open is default. Keys are `home`, `ledger`, and `building:<slot name lowercased>`, so moving a building between slots preserves choice; renamed building resets, duplicate same-name entries share choice. Storage only records false closed entries. `touched` protects session clicks from async load; completion calls `applyEntry` on `live` rows directly because data-iw-only writes cause no watcher flush. `clearVillageLedger` resets prefs/loading/live/touched but keeps persisted choices and monotonic ID counter. The section toggle has title and ARIA state/control reference but no explicit `aria-label`; assess its accessible name with actual browser assistive output.

### 13.4 Generated building and housing catalog

Source: [villageBuildings.js](../../src/modules/villageBuildings.js#L1).

Both outer objects and individual entries are frozen. Keys normalize display names; values have tier, canonical name, and fixed `village/building_N.webp` / `house_N.webp`. Housing tiers 1–5 are Camp, Cottage, Villa, Manor, Citadel; tier 0 deliberately has no asset entry. Building tiers 1–34 are Training Yard; Ironfang Palisade; Silverroot Infirmary; Goldfire Scriptorium; Mythril Countinghouse; Starsteel Trophy Hall; Obsidian Greenhouse; Runite War College; Dragonfall Rampart; Aether Sanatorium; Voidiron Archive; Celestial Exchange; Bloodstone Reliquary; Moonsteel Arboretum; Sunforge Arena; Nethergate Bastion; Stormglass Chapel of Healing; Kingsfall Grand Library; Eternium Treasury; Astral Museum; Gravite Botanical Dome; Frostiron Warfront Hall; Dusksteel Citadel Wall; Titanium Grand Infirmary; Skysteel Observatory; Emberium Mint; Soulsteel Vault of Relics; Chronite Greenhouse Spire; Worldforge Coliseum; Voidglass Bulwark; Thalassic Sanctum of Tides; Ashspire Hall of Records; Glacirite Royal Treasury; Primordial Wonder.

Source comment points to generated `assets/village/buildings.json`/import tool contract. Update through generator and asset validation. No runtime events/storage/network; unknown names fall back safely as described above, but display-name changes can lose art until the mapping is refreshed. API itemKey provides stronger scene identity than route text.

## 14. World bosses and Zone Control

### 14.1 Encounter art, participation, difficulty, timing, and native command label

Source: [WorldBossPanels.decorateWorldBossPanel](../../src/modules/WorldBossPanels.js#L284).

Scoped to already resolved World Bosses root. Adds an owned paragraph saying there are no minimum requirements/no risk in joining/contributing. This sentence is **static extension copy**, not dynamically verified against server rules; do not treat source existence as current game-policy evidence. Identifies Ancient Treant, Abyssal Behemoth, World Eater by native title includes; identifies Zone Control by controls Zone N / Race to capture / contested wording. Unknown encounters keep generic boss-card framing.

Recognized cards get `data-iw-encounter=<boss key>|zone`, header/title roles and owned `.iw-boss-art[aria-hidden]`. Native Join/Prejoin/Fight/Defeated action gets action role; Prejoined/Fighting yields `data-iw-boss-action-state=active`, otherwise idle. Visual label override `data-iw-boss-action-label=Queued|Prejoin` is supplied for prejoin states; other text remains native. Participation copy/control, Solo/Raid/Mythic difficulty, Buff on kill, respawn/buff/protected/HP timing, shared status branch, thin percentage progress, and Top Fighters/Last Kill Participants detail branches are classified independently. Native participation hit area and command handlers stay in place. Ready SkillsArtService decorates the action once with an art-ready marker.

### 14.2 Possible Rewards disclosure and tooltip tiles

Source: [rewards](../../src/modules/WorldBossPanels.js#L250), [BOSSES/fallback map](../../src/modules/WorldBossPanels.js#L9).

Owned `<details class=iw-boss-rewards>` / `<summary>Possible Rewards</summary>` is appended. IDs combine fixed known drops, database BossDrop records whose acquisition summary/detail includes exact boss name, trader_token, and boss_upgrade_orb, deduplicated. Treant fixed set is miners/herbalists/blacksmiths/alchemists/jewelcrafters/spellcrafters/tailors gloves; Behemoth invisibility_ring; World Eater worldbreaker. Imported fallback records fill unavailable database entries; Tailor's Gloves and generic Upgrade Orb are locally synthesized descriptions. Orb copy explicitly says award tier follows equipped tier including trinket and icon is family-representative; it is not a predicted reward.

Each owned button tile is `type=button`, tooltip trigger with ID/name and item-details aria-label, registered with TooltipEngine's item override. Icon uses AtlasService, generic orb paints Copper Upgrade Orb family sprite, miss uses ◆. TextContent carries item names; it does not simulate a reward claim. Signature is boss key + DB revision + atlas ready boolean; rebuild replaces only details children, retaining section open state/listener. Atlas revision beyond first readiness is not in this key. There is no direct service-update listener here; enclosing reconciliation must occur.

### 14.3 Persistent native rewards disclosure

Source: [bindRewardDisclosure](../../src/modules/WorldBossPanels.js#L20).

Per-boss boolean `iw-boss-rewards-collapsed:<key>` defaults open. Preference object has collapsed/changed/ready; async read applies only if no session change. Native details toggle saves only connected genuinely changed state. Later attached sections apply the shared memory choice. Removing reward nodes removes associated DOM listeners; `rewardPreferences` itself is deliberately retained across clear, so kill-switch does not re-read that key as Collapse/Ledger do. No gameplay storage or route navigation occurs.

### 14.4 Zone dominion crest, HP/ward meter, and faction strength balance

Source: [controlProgress/controlStrengths](../../src/modules/WorldBossPanels.js#L57), [ensureDominion/updateDominion](../../src/modules/WorldBossPanels.js#L155).

Team comes from native title: red controls→red, blue controls→blue, otherwise contested. Original percent is read only from native direct single-child percentage-fill branches and clamped 0–100. HP paragraph and numeric strength leaves are read excluding owned nodes. Strength teams come from red/rose/pink/crimson or blue/sky/cyan/azure class/style words on ancestors; exactly two numeric candidates provide red/blue order fallback when explicit signals are incomplete.

Owned `.iw-control-dominion[aria-label="Zone dominion status"]` adds hidden layered crest (red/blue/contested), sword-energy/impact layers and core, Dominion Ward/state text, Ward Integrity/Strength meter, and faction names Crimson Oath/Azure Covenant. These fantasy names are presentation copy for native red/blue teams, not new teams or game state. Native HP/progress/strength branches receive roles so CSS can hide the replaced reading. While contested with both strengths, source is factions, fill occupies 100%, split variable is red/(red+blue) ×100 (50% if zero total); displays original raw strengths. Otherwise displays native HP or Under siege/Fortified and original percent (100 visual fallback if unknown).

Owned meter has progressbar semantics with min/max/now when quantified, aria-valuetext with raw faction strengths, and removes numeric ARIA if percent is unknown. Original game progress is not modified. Controlled states hide explicitly team-labeled strength rows too, per presentation design; missing/ambiguous native state can therefore affect which mirror is visible. Positional two-number fallback is an assumption to test whenever native markup changes.

### 14.5 Contribution-change impact animation and reduced motion

Source: [playStrengthImpact](../../src/modules/WorldBossPanels.js#L117).

Strength history per card triggers a short owned visual impact when red or blue numeric value changes, not on first render. Any change (including decrease) counts. Reduced-motion preference immediately cancels existing animations; preference changes during play also cancel. Changed teams animate opacity/translateX/scaleX via WAAPI; mobile ≤760 px uses 1000 ms / lower opacity, otherwise 1250 ms; blue delay 170 ms, cubic-bezier easing. Finishing promises clean animations and media listener, with identity guard so an old finish cannot cancel a newer sequence. No action/timer value is changed. Missing `Element.animate` skips motion; a media listener can remain until next stop/teardown when no animation supplies a finished promise.

### 14.6 Boss cleanup

Source: [clearWorldBossPanel](../../src/modules/WorldBossPanels.js#L356).

Deletes zone strength history, stops impacts/removes their listeners, clears SkillsArtService action decoration, removes every `data-iw-boss-owned` node and encounter/control/role/action-state/action-label/art-ready attributes within root. UIFoundation separately removes its `data-iw-boss=card`. Generated reward signatures and preference objects are not globally reset; absent section forces rebuild and weak caches do not retain detached cards. Native buttons, original copy and app state survive. There is no module-owned network call.

## 15. Source caveats, meaningful risks, and preservation hardening

These are current-source observations or explicit integration recommendations, not claimed live incidents and not changes made for this handover.

### 15.1 What existing safeguards accomplish

Fixed asset maps and extension-local URL resolution avoid remote code/media substitution in these renderers. New data text generally uses textContent, and inventory HTML interpolation escapes text. Module namespaces reduce competing attribute writers. Native gameplay nodes remain in their original parentage; property-level style owners make inventory/button/background restoration possible. Render signatures reduce repetitive mutations; shared observer and per-surface guards isolate many failures. Village API is read-only at the request-method level, narrow-scoped, same-origin, cancelable, validation-gated, league-aware, and never persisted as a player profile. Toolkit outbound link uses no opener/referrer and no player parameters.

### 15.2 Sensitive reads and genuine exposure

The village GET uses the logged-in session and transiently parses potentially broader core player JSON. DOM classification reads displayed player/name/status, inventory, quest, log/chat and village copy; World Chat classification does not read draft value. Rendered state is visible to page scripts through shared DOM, even though extension module variables are isolated. No renderer telemetry/export endpoint appears in scope. The outbound Toolkit link is a user-triggered external destination, not an automatic upload. Authentication in an official integration should remain in the app's approved data layer; duplicating undocumented session-backed requests is the meaningful coupling here.

### 15.3 State freshness and preservation limits to prioritize

| Observation and source | Practical risk | Behavior-preserving hardening |
| --- | --- | --- |
| [Quest structure cache](../../src/modules/QuestPanelRenderer.js#L149) ignores percentage/reward values; copied data written only in annotateStructure | Sigil percent / CSS reward copy can stale on a same-shape quest tick; ready state itself is reread | Split cached node discovery from live percent/reward synchronization; compare writes. |
| [Skill requirement state](../../src/modules/SkillPanelRenderer.js#L1134) assigned inside structure cache | A native warning-class change without structural key change can leave met/unmet footer stale | Retain resolved requirement node and re-read native state every relevant event. |
| [Last-candidate memo](../../src/modules/SkillPanelRenderer.js#L852) only keys on panel object | Same panel with replaced internals may retain stale candidate nodes; last panel also remains strongly referenced | Reset memo per render pass or tie to subtree/version and clear on teardown. |
| [Quest art continuation](../../src/modules/QuestPanelRenderer.js#L327), [skill art continuations](../../src/modules/SkillPanelRenderer.js#L1250) check connection incompletely or not runtime | Late async ready result can repaint connected native cards after disable | Capture activation generation and check active + generation at every promise continuation. |
| [Inventory empty retry](../../src/modules/InventoryRenderer.js#L529) clears WeakSet inside guard | Disabled callback may leave a permanent pending marker on reused row | Always clear bookkeeping before active guard, or recreate retry state on clear. |
| [Village housing cache](../../src/modules/VillagePanels.js#L308) not explicitly deleted by clear; [collapse spines](../../src/modules/CollapsibleFrames.js#L106) not globally reset | Same-node off/on can skip restored annotations/art | Invalidate ownership caches when clearing actual presentation, then test same-node round trip. |
| [Village option firstChild read](../../src/modules/VillagePanels.js#L224) with prepended owned art | Later option name extraction can read empty art instead of native name | Traverse native text/children while excluding owned nodes. |
| [Village scene refresh](../../src/modules/VillageScene.js#L256) is event-gated; route 10 s is not a strict floor | Stale data on a fully quiet page; route changes may permit earlier request than comment suggests | Explicit lifecycle-owned refresh wakeup or server/app update event, strict last-request timestamp if rate floor is required. |
| [Village scene normalized state](../../src/modules/VillageScene.js#L68) lacks full type/identity validation | Same-league account swap, malformed name or late stale response can show wrong/missing mirror | Validate string lengths/types, slot bounds/array size and account identity; version DOM/API snapshots. |
| [Ledger totals](../../src/modules/VillageLedger.js#L356) sum only records found | Missing catalog entries undercount and can be described as no installed buildings | Track installed vs matched counts and clearly label incomplete totals while preserving all entries. |
| [Overlay revalidation](../../src/modules/OverlayFramer.js#L146) tracks scrim lifecycle more strongly than card lifecycle | Replaced inner modal misses frame, old live card can keep overlay mark | Re-resolve card per connected scrim and remove stale card ownership; fix leaf/outermost ambiguity. |
| [Header caches](../../src/modules/HeaderRenderer.js#L357), [HeaderChrome cache](../../src/modules/HeaderChrome.js#L46) validate limited shape | Newly added optional utility/notice/zone branches may remain unclassified | Version structural membership/coverage separately from ticking data and validate all owned roles. |
| [Quest/Village tooltip cleanup](../../src/modules/QuestPanelRenderer.js#L180), [VillagePanels](../../src/modules/VillagePanels.js#L155) deletes ARIA/tabindex attributes | Could erase native accessibility values if the upstream paragraph gained them | Property/attribute ownership snapshots with current-owner checks, as for inline styles. |
| [Collapse keys](../../src/modules/CollapsibleFrames.js#L152), [ledger keys](../../src/modules/VillageLedger.js#L370) use copy | Renames/localization or repeated same-title panels share/lose preferences | Prefer stable app panel/building IDs, retain title only for accessible labels. |
| [Background color parser](../../src/modules/BackgroundPainter.js#L53) ignores most alpha | A partially transparent navy may become opaque; exact palette can still encode meaning | Preserve alpha and prefer semantic surface hooks, with explicit negative controls for status colors. |
| [Inventory display suppression](../../src/modules/InventoryRenderer.js#L493), V2 queue/reward clipping | Upstream new native information can disappear from visual mirror | Explicit field completeness checks and keep unrecognized native prose visible; do not merely hide failures. |

No generic assertion of “zero impact” follows from presentation-only request methods. Visibility, focus, active-state colors, clipping and hover surfaces can affect usability even when game state is untouched. Shrinking a label to 4 px, inserting focusable objective paragraphs, adding nested heading-row controls, and emitting repeated mirrored readouts require real keyboard/screen-reader/zoom checks in addition to screenshots.

### 15.4 Clean official integration alternatives

These alternatives preserve useful behavior rather than disabling it:

- Render stable semantic IDs/attributes for nav, panels, skills, slots, statuses and controls from the game's own components. Replace text/utility-class/geometry guesses with those contracts, while allowing CSS to own layout and mobile variants.
- Have the official app provide an authorized narrow `{accountId, league, villageRevision, housing, slots, housingPerks}` view model through its existing state/data layer. Render the scene from that model or a documented read endpoint; avoid duplicate cookie-backed core-player reads and stale joins. Keep credentials in the app and minimize the payload rather than moving tokens into extension storage.
- Express exact equipped/active/met/team/readiness state and progress cadence in component props or stable DOM attributes. Theme those states; keep Native/React controls as the source of focus and activation. Use a native application component for the mirrored inventory/skill reading if it is meant to replace information, so omitted fields are explicit in one renderer.
- Host skin-owned disclosure state in stable keyed app/extension preferences, with account/league scoping where appropriate, and an optional storage-change synchronization contract. Preserve user decisions on UI redesign; do not clear them to fix a rendering cache.
- Use lifecycle-owned subscriptions and explicit generation/version tokens for all async work; perform feature cleanup and signature invalidation together. Keep CSS reduced-motion/focus treatment alongside semantic controls and verify it with assistive technology.

## 16. Evidence and maintenance boundaries

This handover did not use a private browser profile, access a live player session, call the live API, change production source, or assert tests passed. Source/tests/docs must not be treated as interchangeable evidence. Existing named test files cover many features, but tests that copy algorithms can diverge: `tests/quest-structure-signature.test.mjs` currently includes disabled state in its copied signature while [current source](../../src/modules/QuestPanelRenderer.js#L149) does not. Its result alone cannot establish the current renderer's exact invalidation behavior.

Documentation verification checked all 135 relative source links: every target exists and every line anchor is within the target file. The links cover all 17 assigned visual/data-map modules plus the entry point and shared watcher. An API search over the assigned source confirmed the event/timer/storage/network inventory above. No runtime test was run as part of this documentation-only subtask; integration/build/test evidence belongs to the main handover.

Comments claiming a stored skill design toggle, a polling village timer, an “outermost” overlay panel, or entirely inert late callbacks are superseded by the executable paths described here. Older performance numbers in comments are historical measurements, not measurements of this handover. New integration work should inspect executable code and relevant fixtures, then verify data freshness, kill-switch races, same-node reactivation, duplicates at breakpoint crossings, fallback assets/data, keyboard focus, reduced motion, scroll containment, and preservation of native state information using tests that exercise actual current source/bundle.
