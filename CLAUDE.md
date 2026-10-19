# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IdleWorlds Fantasy Skin

A Manifest V3 content script that reskins idleworlds.com. **Presentation only.**
React keeps ownership of every gameplay node, its state and its handlers; this
extension adds decoration, semantic role attributes and its own overlay
elements. It never rewrites the game's DOM.

## Commands

```bash
npm ci            # locked dev deps (jsdom, playwright, esbuild)
npm run vendor    # download pinned sprite atlases + typefaces into assets/
npm run art       # regenerate the shared panel-corner filigree
npm run build     # esbuild -> dist/content.bundle.js (strict; needs assets)
npm test          # rebuild, syntax-check, regression suites, sprite-window audit
npm run fixtures  # responsive visual fixture renders
npm run audit:items   # validates against the live /items.json (not in CI)
npm run package   # rebuild, verify the manifest, write release/idleworlds-fantasy-skin-v<version>.zip from an allowlist
npm run import:village-art  # 34 building + 5 housing icons from the art-source repo
npm run import:action-icons -- "<Vector Action button Icons.eps>"  # V2 action-button icons
node claude/audit-mobile.mjs --widths 360,390,430,768  # phone/tablet audit -> tmp/mobile-audit/ (docs/traps/mobile.md)
node claude/perf-harness.mjs --runs 3 [--noskin | --bundle <file>]  # main-thread cost on a ticking 15k-node page -> tmp/perf/ (docs/traps/performance.md)
```

`build-tools/audit-sprite-windows.mjs` (run by `npm test`) checks every pixel
`background-size`/`-position` pair in the stylesheets against
`skills_ui_index.json`: the window must land on a named cell, the scale must be
isotropic, and the box must equal `cell x scale`. It follows `:hover`-style
variants that inherit the base rule's `background-size`, and it FAILS if it
parses zero windows, because a check reporting zero is broken, not passing.

**Tests have no framework.** Each `tests/*.test.mjs` is a standalone Node
script that fails by non-zero exit or a thrown assertion, so run one with
`node tests/<name>.test.mjs`. `npm run test:run` runs every suite
WITHOUT rebuilding; a new suite must be appended to that script by hand or it
never runs in CI. Most suites load `dist/content.bundle.js` rather than `src/`,
so run `npm run build` (or `node build-tools/build.mjs --allow-missing-assets`
without vendored assets) after a `src/` change or the test exercises the old
bundle. About half the suites are real-browser Playwright tests and need
`npx playwright install chromium` once. A harness that boots the bundle must
put `data-iw-page-hydrated="1"` on `<html>` (the latch the page-world signal
sets live), or boot waits out HydrationGate's 4s timeout and races every
settle window ([test-harness](docs/traps/test-harness.md)).
`tests/extension-e2e.test.mjs` is the only suite that loads the real unpacked
extension (manifest, both content-script worlds, `web_accessible_resources`).

`dist/content.bundle.js` is **committed**, and CI fails if it is stale. Rebuild
and commit it with any `src/` change.

Load in Chrome via `chrome://extensions` → Load unpacked → this folder.

## Architecture

- `src/content.js` — neutral profile bootstrap. `iw-skin-theme` selects
  `legacy` or `fantasy`; missing means Legacy, invalid means no active skin.
  `iw-skin-enabled` remains the kill switch for both profiles.
- `src/shared/SkinController.js` — exclusive activation after hydration;
  stop the previous skin before starting another and invalidate stale starts.
- `src/shared/ExtensionSettings.js` — settings reads, validation, and changes.
  Subscribe before reading; never let stale reads override newer storage events.
- `src/options/` — extension settings and toolbar popup. Keep packaging's
  explicit settings allowlist complete when adding imports or assets here.
- `src/skins/legacy/index.js` — existing reskin boot order and teardown.
  All previous modules/styles belong to Legacy; its Runtime flag must stay
  inactive whenever any other profile is selected.
- `src/skins/fantasy/` — the Fantasy profile. Never import Legacy here
  (`tests/skin-boundaries`); infrastructure is FORKED into `core/` (Runtime,
  Viewport, StyleInjector with its own `data-iw-fantasy-style`, and one
  budgeted `Watcher` calling its passes directly, not via `iw:*` events).
  **The game's own `data-skin="fantasy"` theme IS this skin, ported natively**
  (it loads `/reskin-bc/theme/fantasy.css` and runs the skin's Legacy code as
  delivered on 2026-10-07, reskin `37c608b`), so Fantasy layers on top of the
  port: it READS the port's `data-iw-*` tags and must never write one the
  port writes. `raid/` ports the raid UI Legacy gained after that delivery
  (Victory/Wipe banner, lobby grid + records + ready-check pop-up, boss card,
  raid leaderboard; `styles/raid.css` is Legacy's guild.css delta verbatim).
  Each feature stands down once a port stylesheet styles it
  (`core/NativeFeatures.js`), and teardown removes an attribute only where it
  still holds the value Fantasy wrote (`core/dom.js`), never by a
  document-wide sweep. Every owned node carries `data-iw-fantasy-owned`.
  `tests/fantasy-raid.test.mjs` emulates the port with Legacy's own
  GuildPanels minus the post-delivery changes.
  `skills/` reskins the game's OWN Skills sheet (`.iw-skill-tabs`,
  `.iw-ss-*`) and Work Orders board (`.iw-wo-*`), live since 2026-10-16 and
  unknown to the port (the `iw-` prefix there is the game dev's). It preserves
  gameplay nodes: it writes `data-iw-fantasy-skill` / `-icon` / `-lead` and
  `styles/skills.css` + `styles/quests.css` draw action-icon and atlas
  sprites (`core/ItemAtlas.js`, item by id, gear by name). `reserved.js` adds
  two disabled owned slots on phones (four columns); desktop keeps five
  columns and hides those slots. The selected card art/layout lives in
  `styles/skill-cards.css`, independently of native sheet handover; slots
  are removed on stop and yield to real skills as the game grows past ten.
  The reversible `data-iw-fantasy-cards="soft-iron"` strip marker scopes the
  card rules above old native styles, including the old generated hyphenated
  labels. Keep running-card fill selectors in the same scope. Medallion URL
  variables also need their consumer classes in the selectors: older native
  variables can otherwise replace extension URLs with game-origin 404s.
  Entry-point tests keep extension assets separate from the game's `/assets/`.
  The selected-skill sheet's `styles/skill-frame.css` is also an independent
  art layer: its reversible `data-iw-fantasy-skill-frame="guild-iron"` marker
  draws the shared panel texture and compact button art. Subframes have no
  corner ornaments; reserve those for major section frames.
  The full `.iw-ss-zonebar` shares the skill-info surface and has 28px atlas
  buttons on mobile (up to 768px). Above 768px those buttons hide. Header
  travel stays available on both mobile and desktop. It reuses `.iw-ss-zone-go` from the quiet
  recommendation shortcut, so button-art exclusions must explicitly opt the
  full zone bar back in.
  Header medallions stay decorated through native sheet handover; recipe/item
  decoration, running fills and queue behavior still yield to native features.
  Keep the frame overflow visible for the game's XP tooltip. Its browser
  regression is `tests/fantasy-skill-frame.test.mjs`.
  It also marks the
  tiles the port's `[data-iw-skill-boost]` line names (`-boost="daily"`,
  a pulsing halo) and copies the Current Action bar's inline width onto the
  Skill Actions panel (`-run`, half-percent steps, `-run-reset` for one
  frame at a completion), so the running row fills behind its text, and
  when the sheet does not render that row (another skill open, its group
  folded) the `.iw-skill-tab-live` tile takes the fill, by `:has()` alone.
  The fill's transition is the measured gap between readings, written to a
  generated sheet (`run-tick`), never inline. `skills/materials.js` paints
  each `.iw-ss-detail` material entry green (owned >= required) or red
  (`::highlight(iwf-material-met / -short)`, CSS Custom Highlight API), so
  React's text is never wrapped; Legacy's ingredient highlight, forked, and
  it yields with the sheet reskin. `skills/queue.js` is the one
  part that DOES create nodes: a copy of the Current Action panel's QUEUE
  (`.iwf-queue`, `data-iw-fantasy-queue-owned`) right after the sheet; the
  running action is not copied (the row/tile fill carries it), only its
  cancel. The copy's
  controls press the game's own buttons (cancel, remove by index + label,
  the "+N more" toggle; reorder replays HTML5 drag events on the game's
  rows, unverified live). `#current-action-panel` is hidden by
  `styles/queue.css` only while it is tagged `data-iw-fantasy-queue=
  "mirrored"` AND a copy sits in a panel that is not `data-iw-collapsed`.
  Written against the 2026-10-08 markup (`tests/fixtures/current-action-
  2026-10-08/`); a live capture should replace it. Every item sprite
  paints at least inventory size (the port's `.fs-inv-icon` sprite: 50 / 44 /
  40px at >1024 / ≤1024 / ≤768px; `--iwf-item`, `--iwq-item`), bare, no
  ring (Curtis, 2026-10-17). Leading emoji are
  collapsed with `::first-letter { font-size: 0; letter-spacing: 0 }` ONLY
  where `-lead="icon"` says one was seen and replaced; flex/grid containers
  have no first letter. Rules are prefixed `:is(:root,#iwf)` to outrank the
  port's (0,40,1) `!important` button slate, so every game state is restated.
  Stand-down tokens are counted only in `/reskin-bc/` sheets, because the
  game's stock CSS names the same classes. `tests/fantasy-skills.test.mjs`
  runs on `tests/fixtures/live-2026-10-16/` (markup regenerated from a live
  capture by `claude/fixture-from-capture.mjs`, plus that day's game CSS and
  port `fantasy.css`).
- `src/skins/fantasy/inventory/` — the approved raid equipment art layer over
  the native inventory rows: exact equipment ids/names from `core/RaidGear.js`,
  a passive boss banner and shifting outline on the shell, animated name and
  owned RAID badge. `styles/raid-gear.css` preserves equipped icon state and
  native controls. See [inventory](docs/traps/inventory.md) for the native link
  background reset and `tests/fantasy-raid-gear.test.mjs` for regression coverage.
- `src/shared/HydrationGate.js` + `src/page/hydration-signal.js` — hold the
  FIRST boot until React has hydrated (appending skin nodes mid-hydration made
  React throw #418 and re-render the tree). The signal is a separate
  MAIN-world content script at `document_start`, outside the bundle, because
  only page JS can see React's root; it writes one latch attribute on `<html>`,
  which the gate reads and removes. Bounded by a 4s timeout.
  `tests/hydration-gate.test.mjs` pins the protocol.
- `src/skins/legacy/modules/Runtime.js` — `chrome.*` wrappers, `guard`/`guardEach`, `raf`
- `src/skins/legacy/modules/DOMWatcher.js` — **the single MutationObserver** + flush budget
- `src/skins/legacy/modules/StyleInjector.js` — lifecycle-owned CSS injection; rewrites
  `url('../assets/…')` to `chrome-extension://` at runtime. Use that exact
  form in stylesheets or the asset will 404.
- `src/skins/legacy/modules/InlineStyleOwner.js` — reversible property-level inline styles
- `src/skins/legacy/modules/ProgressCadence.js` — the measured-tick / completion-reset logic
  that smooths a game-stepped progress fill; shared by the Current Action bar
  and the skill card's action-button fill. Holds no DOM.
- `src/skins/legacy/modules/OverlayFramer.js` — generic pop-up / modal chrome. A portalled
  dialog is not a route panel, so `classifySectionFrames` deliberately excludes
  it (`inOverlay`) and this module owns it instead; before it existed, the
  "Players Online" list and every modal the game portals in reached the page
  bare. Runs on
  `iw:dom-flush`, detects from **rendered state** (a `position: fixed` layer that
  covers the viewport, carries a numeric z-index and reads as a backdrop — a
  blur or a translucent dark fill), and its content card (largest visible box,
  preferring the game's `.panel`). Tags `data-iw-overlay="scrim"` / `"panel"` —
  its own namespace, never `data-iw-ui`. `overlay.css` (injected just before
  `ui-system.css`) draws the shared forged frame on the card using ONLY the
  border box — `background` (pinned, not `local`), `box-shadow`, real
  `border-image` — because these cards are their own scroll container and a
  `::before`/`::after` ornament would scroll away with the content. Presentation
  only: nothing inside the card is touched, so `"Upgrade vs equipped"` and the
  like stay the game's (rule 5). Candidate prefilter is `[class*="fixed"]` +
  inline `position:fixed`, confirmed by `getComputedStyle` — a cheap probe, not
  a class-name classifier. `tests/overlay-framer.test.mjs` pins detection, the
  negative controls and teardown.
- `src/skins/legacy/modules/QuestPanelRenderer.js` — quest cards are also `.compact-panel`,
  so they arrive on the same `iw:skill-panel` event (as `skill: 'unknown'`).
  This module positively re-identifies them (a `^Reward:` line plus a Turn In /
  Skip control or `% complete`), tags `data-iw-quest-role/-zone/-state`, appends
  a `.fs-quest-sigil` medallion, and reuses the Skills UI atlas. Its CSS lives
  at the end of `skillpanel.css` (no new sheet — the smoke test pins the count
  at 7). `DOMWatcher.detectSkillType` returns `'unknown'` early for quest
  shapes so a `"<Discipline> Work Order"` label can't trip skill identity.
  The objective item ("💠 Night Claw 22/100" → "Night Claw") drives two things:
  its `AtlasService` sprite is painted into the medallion (`.fs-quest-sigil-icon`,
  discipline glyph is the fallback), and — when the name resolves in
  `ItemDatabase` — the objective `<p>` gets `data-iw-tooltip-trigger="1"` +
  `data-iw-item*` (attributes only, no wrapper) so `TooltipEngine` shows the
  item card on hover. `NameScanner` skips `[data-iw-tooltip-trigger]` so it
  can't stack a second prose highlight on the same line.
- `src/skins/legacy/modules/VillagePanels.js` — the Village route's two illustrated panels.
  `UIFoundation.classifyVillagePanels` resolves them from their headings
  ("Village" for the Housing hero, "Village Add-ons" for the slot stack, both
  with the leading icon run stripped) and hands each to `decorateVillagePanel`
  every `iw:dom-flush`; roles live in their own `data-iw-village*` namespace
  because every card here is the game's shared `.compact-panel` and so also
  reaches `SkillPanelRenderer` as `skill: 'unknown'`. The art is the game's own
  hand-painted isometric Construction/housing icons, imported by
  `build-tools/import-village-art.mjs` into `assets/village/building_<tier>.webp`
  / `house_<tier>.webp` plus the generated `src/skins/legacy/modules/villageBuildings.js`
  (DO NOT hand-edit; `tests/village-panels.test.mjs` pins it against
  `assets/village/buildings.json` and checks every file exists). CSS lives at
  the end of `ui-system.css`, and the controls opt out of the generic control
  rule through its `:not([data-iw-village-role])` link.
- `src/skins/legacy/modules/VillageScene.js` — the skin's own **Village** frame on the
  dashboard, below Skill Actions: the Construction planner's five-plot
  composition (a house in the middle, four corner plots and one bottom-centre)
  drawn from the game's own building art. It is the only surface here that
  reads the game's API, because the village simply is not in the dashboard's
  DOM — see [docs/traps/village.md](docs/traps/village.md). Anchored by `findAnchor()` to the `.panel` holding
  the `<h2>Skill Actions</h2>` and inserted with `target.after(frame)`, so
  nothing is reparented (rule 2) and the panel that followed Actions still
  follows the scene. Every node inside is the extension's own and is marked
  `data-iw-village-scene-owned` — its OWN namespace, deliberately not
  VillagePanels' `data-iw-village-owned`; see the collision note in
  [docs/traps/village.md](docs/traps/village.md).
  `src/skins/legacy/styles/village-scene.css` is concatenated into the `ui-system` injection
  (no new sheet — the smoke test pins the count at 7).
- `src/skins/legacy/modules/VillageLedger.js` — the **ledger** beside that scene: the home
  and every installed building as a collapsible heading over its benefits, then
  an **Overall stats** block that sums the INSTALLED BUILDINGS ONLY. The scene
  knows identity (tier, slot, `itemKey`, name); the numbers come from
  items.json, because every add-on is an item
  (`construction_building_tier_<N>`) — so the join is
  `ItemDatabase.find({ id })` on the key the snapshot already carries and the
  derivation is the shared `deriveDisplayStats()`. Housing is NOT an item, so
  the home shows its slot count plus whatever the Village route printed on its
  tier line ("Base actions take 6s"), captured verbatim by
  `VillageScene.readHousingPerks` — and nothing else, rather than a guess.
  It builds no DOM of its own name: `own()` is passed in by VillageScene, so
  every node is `data-iw-village-scene-owned` and that module's teardown
  reaches it. Two levels of disclosure share one mechanism (`wire()`): each
  entry, and the whole **Buildings** list, which folds to leave the heading,
  Overall stats and the plot scene standing — so `.iw-vs-totals` is a sibling
  of `.iw-vs-ledger-list`, not a child of it. Both use the module's own
  `data-iw-vs-toggle` / `data-iw-vs-open` namespace so CollapsibleFrames'
  document-wide `[data-iw-collapse]` sweep can never adopt them, and choices
  persist in `iw-village-ledger`. Scene and ledger wrap rather than squeeze —
  see [docs/traps/village.md](docs/traps/village.md).
- `src/skins/legacy/modules/GuildPanels.js` — the **Guild** route (`/guild`) and its raid:
  lobby cards (ready check, boss picker, leaderboard, members, lend, potions,
  loadout, ready toggle, chat) and the fight (`.raid-battle-backdrop`).
  `UIFoundation.classifyGuildPanels` picks every leaf frame on `/guild` (or a
  "Raid Dungeon" panel elsewhere) from `sectionFrameResolutions`. Roles live in
  `data-iw-guild*`; colours the game uses as state are read into
  `data-iw-guild-tone/-state`, never repainted uniformly. `DOMWatcher` answers
  'unknown' for these cards (the Members card's "Combat 66" chips used to make
  it a Combat skill card). `src/skins/legacy/styles/guild.css` rides the `ui-system`
  injection. See [docs/traps/guild.md](docs/traps/guild.md).
- `src/skins/legacy/modules/RaidHud.js` — the live raid fight as a raid HUD (Ashen Iron
  raid UI kit v1, `assets/raids/ui-kit-v1/sprites/`): boss shell + cast bar,
  effect timer bars (buffs blue, debuffs red) above the party frames carrying
  every buff/debuff; the game's log and skills panels are hidden and shown
  instead in a folded dock after Raid Chat whose controls press the game's
  own buttons. Called last from
  `GuildPanels.decorateArena`; reads the game's own nodes, places them by grid
  area, owns only the effect strips, the timer row and the dock
  (`data-iw-raid-owned`).
  No personal HUD: it was removed 2026-10-07 because your party frame never
  hides. See the Raid HUD section of
  [docs/traps/guild.md](docs/traps/guild.md).
- `src/skins/legacy/modules/GuildLobby.js` — the raid LOBBY's layout (2026-10-08): the
  game's wrapper divs go `display: contents` and each card gets a
  `data-iw-guild-slot`, so guild.css grids the Raid Dungeon panel into two
  columns with merged frames (invite + Members, Prep + Loadout), chat where
  the leaderboard was, history at the foot, the Leaderboard card hidden;
  record times under the difficulty pills; and the skin's own ready-check
  pop-up (never for the leader). See the lobby section of
  [docs/traps/guild.md](docs/traps/guild.md).
- `src/skins/legacy/modules/RaidBossCard.js` — the lobby's boss card as a scan, not a
  read: an arena-art hero with the boss's medallion behind the game's name
  and lore, stat chips, a requirement + recommended-resist tile pair, a per-boss team loadout + tip and a loot bar, each
  parsed from the game's one template and shown only when it parsed (the
  game line is hidden then, never otherwise). Art from
  `build-tools/build-raid-lobby-art.py`. See the boss-card section of
  [docs/traps/guild.md](docs/traps/guild.md).
- `src/skins/legacy/modules/RaidLeaderboards.js` — the raid leaderboard, read from
  `/api/guild/raid/leaderboard` and shown as the skin's own frame after the
  Leaderboards route's panel; also the data behind the lobby's record times.
- `src/skins/legacy/modules/CollapsibleFrames.js` — per-panel collapse on every parent
  frame (Skills, Inventory, Quests, Village, World Bosses, Current Action,
  Action Log, World Chat, Zone Control and the Village scene). The World Boss
  "Possible Rewards" disclosure is a `<details>` because those nodes are the
  skin's own; a route panel's contents are React's, so wrapping them would
  reparent game nodes (rule 2). Here the skin instead APPENDS a small chevron
  button into the panel's heading row and writes `data-iw-collapsed="1"` on the
  card, and `src/skins/legacy/styles/collapsible.css` (concatenated onto the `ui-system`
  injection) hides `> *` except the heading row and the control. Choices persist
  in one `chrome.storage` key, `iw-collapsed-frames`. See
  [docs/traps/collapsible-frames.md](docs/traps/collapsible-frames.md).
- `src/skins/legacy/modules/HeaderChrome.js` — merges the nav rail, the announcement and
  the zone bar into ONE framed box (see [docs/traps/header-chrome.md](docs/traps/header-chrome.md)).
  Its own `data-iw-chrome` namespace; runs in `queueClassify` right after
  section frames.
- `src/skins/legacy/modules/ZoneThemeSetting.js` — the player's **Zone themes** switch, a
  `<label>` + checkbox appended to the zone bar's action row. Off renders
  the stock Ashen Iron theme on every route through the same
  `presentationZoneNumber() → null` path Village uses. Stored as
  `iw-zone-themes`. See [docs/traps/zone-theming.md](docs/traps/zone-theming.md).
- The **Toolkit link** is the skin's own `<a>` (`UIFoundation.ensureToolkitLink`),
  appended to the nav rail and hidden by CSS below 768px (Curtis, 2026-09-16:
  the phone bar read as too crowded); see [docs/traps/mobile.md](docs/traps/mobile.md).
- The **Rearrange feature (PanelOrder) was removed on 2026-09-15.** Its
  `:not([data-iw-order-handle])` exclusions are deliberately LEFT in the
  `base.css` and `ui-system.css` selector chains: each `:not()` carries
  specificity other rules may be tuned against. They match nothing now.
  [docs/traps/panel-order.md](docs/traps/panel-order.md) is kept for its lessons.
- `src/skins/legacy/styles/*.css` — injected in the order `content.js` boots them.
  **`ui-system.css` is injected LAST.**

## Non-negotiable rules

1. **Presentation only.** Never change what a control does.
2. **No reparenting.** Decorative elements may be *appended* (see
   `HeaderRenderer.ensureCrest`, `InventoryRenderer.ensureInventoryRule`), never
   moved. Never `removeAttribute('style')` on a game node — strip only the
   properties the skin wrote.
3. **Reversible.** Every attribute and element the skin adds must be removed by
   its `clear*()` teardown. Kill-switch round-trip is covered by the smoke test.
4. **One MutationObserver**, in `DOMWatcher`, budgeted.
5. **Never destroy state information.** If the game paints something to mean
   something — an active tab, an equipped item, a red/green stat — repainting it
   uniformly deletes that meaning. That is a functionality regression in effect,
   even though it is "only CSS".

## Rules the traps taught

Each rule below has been broken at least once. The linked file has the
measurement, the failure it caused and the negative control. **Read the
matching file before changing that surface**, and add new write-ups there, not
here. Add a line to this list only when a lesson applies across surfaces.

**Cascade**

- `ui-system.css` is injected LAST, and its generic `button:not(…)` rule is
  (0,4,1) `!important`. Do not escalate specificity: add your hook to that
  rule's `:not()` chain (and to the matching `base.css` chains).
  [classification](docs/traps/classification.md)
- Inline `!important` written by `SkillPanelRenderer.styleButton()` or
  `AtlasService` beats every stylesheet. To make such a value steerable, write
  it inline as `var(--token, fallback)`.
  [sprites-and-buttons](docs/traps/sprites-and-buttons.md)
- When you repurpose a pseudo-element another rule already draws on, reset its
  whole box, **including `transform`**. A pseudo-element's painted position
  is not observable from `getComputedStyle`.
  [skill-card-v2](docs/traps/skill-card-v2.md)
- Atlas sprites use percentage `background-size`/`-position`. Never override
  them with px, and keep the box at the art's aspect ratio.
  [sprites-and-buttons](docs/traps/sprites-and-buttons.md)
- Two items the skin places in ONE grid cell paint in DOM order, so the later
  one swallows the earlier one's clicks even across padding that looks empty —
  and a breakpoint that unstacks them turns that into "works on mobile, dead on
  desktop". Make the passive one `pointer-events: none` (children `auto`) and
  lift the interactive one. A grid item honours `z-index` while still
  `position: static`. [classification](docs/traps/classification.md)

**Mutation cost** ([performance](docs/traps/performance.md))

- DOMWatcher's `attributeFilter` has eight entries: `class`, `style`,
  `disabled`, `aria-disabled`, `aria-pressed`, `aria-selected`,
  `aria-current`, `data-state`. A `data-iw-*` write is invisible to it, and so
  is a same-value `style.setProperty`. A same-value `classList` (including
  `add` of a class already present), `setAttribute` on a watched attribute, or
  `textContent` write still emits a record, so compare before writing. Compare
  same-value `data-iw-*` writes too: invisible to the observer, they still
  re-match every attribute selector keyed on them.
- Never read computed style or layout between writes in a per-row or per-card
  loop - including inside a sort comparator. Each read after a write is a
  whole-page recalc; one per inventory row once cost ~10s of boot. Batch the
  reads, then write.
- Never put a shorthand and its own longhand in one inline-style map. The page
  flushes itself forever, and the end state still looks correct.
- A change carried only by `data-iw-*` or by `<html>` (outside the observer's
  root) triggers no flush, so the code that makes it must run the pass itself.
- Text ticks never emit `iw:dom-flush`. Anything that COPIES game text into
  its own attributes must also listen to `iw:text-flush` (filtered to its
  region), or the copy freezes between unrelated flushes ([guild](docs/traps/guild.md)).
- A cached classifier with an EMPTY resolution never re-runs, because
  `[].every()` is true; validate coverage too. A cache key must not include
  live content, such as ticking digits, that the cached work does not depend on.
  It MUST include every input that can change without a DOM change: key on
  `AtlasService.revision()`, never `isReady()` (true once EITHER atlas loads),
  and re-run on `iw:atlas-updated` ([sprites-and-buttons](docs/traps/sprites-and-buttons.md)).
- Nor button `disabled` state: the game disables every button during any
  request, and a strip-then-rederive pass that reads layout makes Chrome's
  scroll anchoring jump the window.

**Ownership**

- Two modules must never write the same attribute on one node.
  `.compact-panel` is shared by skill, quest, boss, village and shop cards, so
  each role gets its own `data-iw-<module>` namespace, and a `clear*()`
  touches only its own marker. [classification](docs/traps/classification.md),
  [village](docs/traps/village.md)
- An element the skin APPENDS into a game node must be excluded from every
  classifier sweep that reads that node (`:not([data-iw-…])` or a `closest()`
  guard), and so must skin-owned text that repeats game copy.
  [collapsible-frames](docs/traps/collapsible-frames.md),
  [panel-order](docs/traps/panel-order.md) (retired feature),
  [skill-card-v2](docs/traps/skill-card-v2.md)

**Detecting the live page** ([classification](docs/traps/classification.md))

- The page ships a hidden duplicate column, and which copy is hidden swaps at
  1280px. Resolve the live copy with `Viewport.js` rendered-state helpers,
  never with a class name. A breakpoint crossing mutates nothing, so
  column-dependent caches must check `getLayoutEpoch()`.
- The live app has almost no stable hooks (`#current-action-panel`, `.panel`,
  `data-skin`), so misses are structural. Frames key on `.panel`, not on
  heading copy ([panel-frames](docs/traps/panel-frames.md)). Strip a leading
  emoji run before any anchored label regex
  ([header-chrome](docs/traps/header-chrome.md)).
- Met/unmet, equipped, team colour and the active tab are game STATE (rule 5).
  Read them from the game's own classes; never repaint them uniformly.
- `textContent` joins descendants with NO separator — no newline, no space — so
  sibling elements read as one unbroken string. Never slice a flattened blob on
  `\n`, never put a `\b` where two elements may join ("XPTurn In" has no
  boundary before "Turn"), and never assume the game's own separator (its
  material lines use an emoji per item, not `•`). Anchor on the previous match
  and on the element boundary, which are always there
  ([skill-card-v2](docs/traps/skill-card-v2.md),
  [test-harness](docs/traps/test-harness.md)).

**Tests** ([test-harness](docs/traps/test-harness.md))

- A fixture lies when it models the wrong DOM shape or column width, omits the
  host's Tailwind preflight, omits a stylesheet, or cannot load its assets
  (`setContent` blocks `file://`). A cost bug has a correct end state, so only
  a cost check can see it, and only if the fixture carries the shape.

## Where the detail lives

| File | Covers |
| --- | --- |
| [performance.md](docs/traps/performance.md) | self-driving flush loops, measured write costs, the scroll stall decision, classifier caching |
| [classification.md](docs/traps/classification.md) | `ui-system.css` precedence, two writers on one node, hidden duplicate column, stable hooks, coverage map, adding a new skill |
| [panel-frames.md](docs/traps/panel-frames.md) | `.panel` section frames, nesting, heading size token, Daily XP Boost |
| [collapsible-frames.md](docs/traps/collapsible-frames.md) | collapse toggle placement, one-bar collapsed state, filigree hand-over |
| [panel-order.md](docs/traps/panel-order.md) | RETIRED Rearrange feature, kept for its lessons (write costs, drag, exclusions) |
| [skill-card-v2.md](docs/traps/skill-card-v2.md) | the skill card: current design first, retired designs last |
| [village.md](docs/traps/village.md) | `/api/player` read, scene layout, sprite paint order |
| [current-action-progress.md](docs/traps/current-action-progress.md) | progress-bar transition and tick measurement |
| [sprites-and-buttons.md](docs/traps/sprites-and-buttons.md) | atlas windows, aspect ratio, three-slice labels, plates, optical centring |
| [zone-theming.md](docs/traps/zone-theming.md) | per-zone header art, palettes, `--iw-th-*` tokens |
| [header-chrome.md](docs/traps/header-chrome.md) | glass plates, nav rail, Toolkit link, merged header frame |
| [inventory.md](docs/traps/inventory.md) | list frame, tool row, row colour, upgrade-roll line |
| [test-harness.md](docs/traps/test-harness.md) | fixture and render-harness traps |
| [mobile.md](docs/traps/mobile.md) | the mobile audit harness, single-row menus, the phone Toolkit slot, phone-width fixes |
| [guild.md](docs/traps/guild.md) | Guild route + raid: skill-detection guard, state tones, the game's sans-skin rules, six-tab rail |

Bundle size is a **soft budget of 300,000 bytes**, not a hard gate: both
`build-tools/build.mjs` and `static-invariants` only `console.warn` past it —
builds and CI never fail on size. The committed bundle is deliberately
un-minified for readability. `build-tools/build.mjs` still strips CSS comments
when inlining sheets, so comments stay free in source; keep watching the warning
so growth stays deliberate.

## Verification discipline

This project has repeatedly shipped confidently wrong CSS. The rules that
stopped it:

- **A fixture that omits a stylesheet will lie to you.** Load *all* sheets, in
  injection order, with `ui-system.css` last. Most false "it works" results came
  from a fixture that did not include it.
- **A check reporting zero is broken, not passing.** A plain `CSSStyleRule`
  exposes a truthy-but-*empty* `.cssRules`, so recursing on truthiness silently
  discards every non-`@font-face` rule and the harness reports "0 → 0,
  identical". Recurse only on real grouping rules.
- **Every check needs a negative control.** Break it on purpose and confirm it
  fails. Several "passing" checks here were incapable of failing:
  a `prefers-reduced-motion` test that compared two screenshots of a resting
  page; a webfont check that passed for a font with no Latin glyphs.
- **`performance.now()` clamps at 0.1 ms.** Batch and divide, or the number is
  noise. A ratio computed against ~0 is meaningless.
- **Say which kind of verification you did.** "Built and fixture-rendered" is
  not "live-verified". No session can verify live; only the user can.

`claude/capture-inventory.js` is a read-only DevTools snippet that dumps the
live DOM's computed styles to a JSON file. When a CSS change does not behave as
expected live, ask for a capture rather than guessing — three separate
"mysteries" here turned out to be the live DOM, not the CSS.
