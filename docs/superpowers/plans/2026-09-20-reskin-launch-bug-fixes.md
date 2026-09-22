# Reskin Launch Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the eight launch-day reskin reports without changing gameplay behaviour or weakening the extension's reversible presentation contract.

**Architecture:** Keep each fix with the module that already owns the affected surface. Refresh the two newly available glove cells in the bundled gear atlas and list their real IDs in the boss renderer, add state contrast to its existing semantic hook, harden the compact-button/theme boundary, correct pager positioning in the skill-card layout, add anchored-popover support to `OverlayFramer`, scope stats typography through overlay content roles, and add a dedicated quest skip-note role to `QuestPanelRenderer`.

**Tech Stack:** JavaScript ES modules, CSS, jsdom, Playwright, esbuild, Chrome extension content script.

**Spec:** `docs/superpowers/specs/2026-09-20-reskin-launch-bug-triage-design.md`

## Global Constraints

- Presentation only; preserve native handlers, state, accessible text, and navigation.
- Never reparent React-owned nodes.
- Every new marker must be removed by its owning teardown.
- Keep `ui-system.css` injected last.
- Rebuild and commit `dist/content.bundle.js` with every `src/` change.
- Label fixture/browser verification accurately; final live verification is performed by the user.

## Review Focus

- Cold-loading a non-Game route must not leave compact navigation without an atlas; Task 4 adds a `/dungeon` cold-load test.
- Native child text paint can beat an ancestor `color`; Task 3 tests `-webkit-text-fill-color`, opacity, and nested wrappers.
- A positioned descendant cannot escape a sibling stacking context; Task 6 tests both host lifting and conditional overflow.
- Skill pagers can live in either the content or command branch; Task 5 exercises both with short and tall bodies.
- Optional quest/stat copy must not be selected by broad prose rules; Tasks 7 and 8 include negative controls for unrelated rows and briefs.

---

### Task 1: Add the final Ancient Treant glove listings and icons

**Files:**
- Create: `build-tools/import-launch-glove-icons.mjs`
- Modify: `assets/gear_icons_atlas.png`
- Modify: `assets/gear_icons_manifest.json`
- Modify: `src/modules/WorldBossPanels.js:9-16`
- Modify: `tests/data-services.test.mjs`
- Modify: `tests/world-boss-panels.test.mjs`
- Modify: `docs/traps/sprites-and-buttons.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: the live `ItemDatabase` records, `BOSSES[].ids`, and the local sprite source's v2 manifest plus `gear:gloves` chunk.
- Produces: two reward tiles keyed by `woodcutters_gloves` and `builders_gloves`, painted from the bundled legacy gear atlas by their catalogue names.

- [ ] **Step 1: Lock the real records and artwork contract in tests**

Extend `data-services.test.mjs` with a fixture manifest containing the two names and assert that `AtlasService.resolve({ id, name })` falls through from the item ID to the gear-name lookup. Extend `world-boss-panels.test.mjs` so the mocked item catalogue includes the current live fields and the Ancient Treant fixture requires both painted tiles.

```js
const rewards = [...card.querySelectorAll('.iw-boss-reward')]
  .map(el => ({
    id: el.dataset.iwItem,
    name: el.dataset.iwItemName,
    atlas: el.querySelector('.iw-boss-reward-icon')?.dataset.iwAtlas,
  }));
assert.deepEqual(
  rewards.filter(x => ['woodcutters_gloves', 'builders_gloves'].includes(x.id)),
  [
    { id: 'woodcutters_gloves', name: "Woodcutter's Gloves", atlas: 'gear' },
    { id: 'builders_gloves', name: "Builder's Gloves", atlas: 'gear' },
  ],
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
node tests/data-services.test.mjs
node tests/world-boss-panels.test.mjs
```

Expected: FAIL because neither ID is in the Treant reward list and the bundled manifest has no matching gear entries.

- [ ] **Step 3: Add a reproducible, guarded atlas import**

Create `build-tools/import-launch-glove-icons.mjs`. It must:

- accept the sibling sprite repository path as an optional CLI argument, defaulting to `../idleWorlds-game-sprites-BC`;
- discover the single hashed v2 manifest, resolve the `gear:gloves` chunk, and verify 128px cells;
- require `woodcutters gloves -> [gear:gloves, 896, 1024]` and `builders gloves -> [gear:gloves, 1024, 1024]`;
- verify the source RGBA hashes `c144f2b6bc0dafbb0db85ef5a97c22c2532959f02d998a1ca25c6c0b9f0ed435` and `542242e3c86ee9c8d1a104cc0c8fd121a7e471a96583041171dfe6918402b155` from the source audit;
- copy those cells into the currently unused legacy cells `(896, 19456)` and `(1024, 19456)` without resizing or changing atlas dimensions;
- append manifest entries named `Woodcutter's Gloves` and `Builder's Gloves`, then fail on duplicate names or occupied destination cells.

Run the importer and review both destination cells at native size. This scoped import avoids migrating `AtlasService` to the source application's chunk loader during a launch hotfix.

- [ ] **Step 4: List the live IDs and use the real catalogue records**

Append `woodcutters_gloves` and `builders_gloves` after `tailors_gloves` in the Ancient Treant entry. Do not add module-local fallback records: `ItemDatabase` now supplies the real names and effects, while `AtlasService` resolves the imported gear art by name after the item-index ID lookup misses.

- [ ] **Step 5: Document and verify the data-to-art boundary**

Record in `docs/traps/sprites-and-buttons.md` that newly live gear can exist in `items.json` before the extension's offline atlas pin, and that a scoped import must be hash-guarded rather than substituting another sprite. Run:

```powershell
node build-tools/import-launch-glove-icons.mjs --check
node tests/data-services.test.mjs
node tests/world-boss-panels.test.mjs
npm run build -- --allow-missing-assets
```

Expected: PASS; both names resolve to `data-iw-atlas="gear"`, neither icon contains the `◆` fallback, the importer reports the exact source hashes, and the committed bundle contains both final IDs.

- [ ] **Step 6: Commit**

```bash
git add build-tools/import-launch-glove-icons.mjs assets/gear_icons_atlas.png assets/gear_icons_manifest.json src/modules/WorldBossPanels.js tests/data-services.test.mjs tests/world-boss-panels.test.mjs docs/traps/sprites-and-buttons.md dist/content.bundle.js
git commit -m "fix: add Treant glove rewards and icons"
```

### Task 2: Make queued world-boss participation unmistakable

**Files:**
- Modify: `src/styles/ui-system.css:1420-1437`
- Modify: `tests/boss-action-label.test.mjs`
- Modify: `tests/world-boss-panels.test.mjs`
- Modify: `docs/traps/sprites-and-buttons.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: `data-iw-boss-action-state="active"` written by `WorldBossPanels.decorateWorldBossPanel()`.
- Produces: a persistent active ring and optional reduced-motion-safe glow without changing the native button state.

- [ ] **Step 1: Add a browser assertion for active-state contrast**

Extend `boss-action-label.test.mjs` to compare the idle and active computed `filter`, `boxShadow`, and outline/ring paint. Require active to differ while preserving identical bounds.

```js
const statePaint = id => page.locator(id).evaluate(el => {
  const cs = getComputedStyle(el);
  return { filter: cs.filter, shadow: cs.boxShadow, outline: cs.outlineStyle };
});
assert.notDeepEqual(await statePaint('[data-probe="active"]'), await statePaint('[data-probe="idle"]'));
```

Add a reduced-motion context and assert that the active button has `animation-name: none` but still differs from idle.

- [ ] **Step 2: Run the test and confirm the design gap**

Run: `node tests/boss-action-label.test.mjs`

Expected: FAIL because current active and idle buttons differ primarily by word, not a persistent glow/ring.

- [ ] **Step 3: Style the semantic active state**

Add a selector scoped to boss action buttons, using a static inset ring plus an outer zone-accent glow. If animation is used, animate only opacity/filter and disable it under reduced motion.

```css
[data-iw-encounter] [data-iw-boss-role="action"][data-iw-boss-action-state="active"] {
  filter: brightness(1.12) drop-shadow(0 0 7px color-mix(in srgb, var(--iw-th-accent) 72%, transparent)) !important;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--iw-th-accent) 78%, #fff),
              0 0 0 1px var(--iw-th-edge),
              0 0 14px color-mix(in srgb, var(--iw-th-accent) 48%, transparent) !important;
}
```

- [ ] **Step 4: Verify state transitions and accessibility**

Run:

```powershell
node tests/world-boss-panels.test.mjs
node tests/boss-action-label.test.mjs
```

Expected: PASS; native `Prejoined` remains in `textContent`, visible copy is `Queued`, and active geometry matches idle geometry.

- [ ] **Step 5: Document and commit**

Update `docs/traps/sprites-and-buttons.md` with the rule that persistent game state must not rely on hover or label copy alone. Rebuild, then commit the source, tests, documentation, and bundle.

### Task 3: Harden active navigation text against zone/native paint

**Files:**
- Modify: `src/styles/compact-buttons.css:101-114`
- Modify: `tests/compact-button-atlas.test.mjs`
- Modify: `tests/compact-button-reconcile.test.mjs`
- Modify: `docs/traps/sprites-and-buttons.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: `data-iw-state="active"` from `UIFoundation.applyMainNavState()`.
- Produces: readable active text on the tab and native text wrappers while excluding atlas layers.

- [ ] **Step 1: Capture the live winning property before finalising the selector**

On the affected tab, record the active button and label child values for `color`, `-webkit-text-fill-color`, `opacity`, `visibility`, and matching selectors. Use the repository's read-only capture pattern; do not edit the live DOM. Save the finding in `docs/traps/sprites-and-buttons.md`.

- [ ] **Step 2: Add a hostile-label negative control**

Change the active fixture to include a nested span with native black paint and reduced opacity:

```html
<button id="nav" data-iw-ui="nav-tab" data-iw-state="active">
  <span class="native-active-label" style="color:#050505;-webkit-text-fill-color:#050505;opacity:.35">Village</span>
</button>
```

Assert the span's computed text fill resolves to the active foreground and opacity is `1`, while each `[data-iw-compact-layer]` retains its own opacity state.

- [ ] **Step 3: Run the atlas test and confirm failure**

Run: `node tests/compact-button-atlas.test.mjs`

Expected: FAIL on the nested label's text fill or opacity.

- [ ] **Step 4: Neutralise only text descendants**

Extend the active rule to restore both paint channels and opacity on non-layer descendants.

```css
html[data-iw-compact-atlas="compact-ghost-v3"] [data-iw-compact-button][data-iw-ui="nav-tab"][data-iw-state="active"],
html[data-iw-compact-atlas="compact-ghost-v3"] [data-iw-compact-button][data-iw-ui="nav-tab"][data-iw-state="active"] :not([data-iw-compact-layer]) {
  color: var(--iw-text-hi, #fff0dc) !important;
  -webkit-text-fill-color: currentColor !important;
  opacity: 1 !important;
}
```

- [ ] **Step 5: Verify active-state changes and teardown**

Run:

```powershell
node tests/compact-button-atlas.test.mjs
node tests/compact-button-reconcile.test.mjs
node tests/menu-rows.test.mjs
```

Expected: PASS; changing the route moves the readable active state, and teardown removes only skin layers/attributes.

- [ ] **Step 6: Rebuild, document, and commit**

Record the live winning property and negative control in `docs/traps/sprites-and-buttons.md`, rebuild the bundle, and commit.

### Task 4: Give Dungeon the same compact navigation on cold load and route swap

**Files:**
- Modify: `src/modules/HeaderRenderer.js:118-136`
- Modify: `tests/menu-rows.test.mjs`
- Modify: `tests/route-swap-reclassify.test.mjs`
- Modify: `docs/traps/header-chrome.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: `SkillsArtService.applyThemeVariables(html, theme)` and the last-known zone theme when available.
- Produces: `data-iw-compact-atlas="compact-ghost-v3"` on non-Game routes even when no zone has yet been observed.

- [ ] **Step 1: Add a true `/dungeon` cold-load fixture**

Serve the no-zone-bar page at `/dungeon`, wait for the Dungeon tab to become active, and assert:

```js
assert.equal(await page.locator('html').getAttribute('data-iw-compact-atlas'), 'compact-ghost-v3');
assert.match(await page.locator('[data-iw-tab="dungeon"] [data-iw-compact-layer="idle"]')
  .evaluate(el => getComputedStyle(el).backgroundImage), /compact-ghost-v3/);
```

Also navigate a Game fixture to Dungeon and back, asserting one Toolkit link and unchanged layer counts.

- [ ] **Step 2: Run the new route tests and confirm failure**

Run:

```powershell
node tests/menu-rows.test.mjs
node tests/route-swap-reclassify.test.mjs
```

Expected: the cold-load visual-atlas assertion fails even though the existing geometry assertions pass.

- [ ] **Step 3: Install a compact-art fallback without falsifying gameplay state**

In `applyZoneTheme()`, keep `data-iw-zone-theme="default"` and generic zone surfaces when `theme` is null, but install only the forged-metal button variables:

```js
} else {
  html.style.removeProperty('--iw-zone-atlas');
  html.style.removeProperty('--iw-corner-filigree');
  html.style.removeProperty('--iw-zone-separator');
  SkillsArtService.applyThemeVariables(html, 'forged-metal');
}
```

When a real zone is later observed, the normal theme application replaces the fallback.

- [ ] **Step 4: Verify cold load, route swap, and kill switch**

Run the two route tests plus `node tests/smoke.test.mjs`. Expected: all pass, and `clearHeaderRenderer()` still removes button theme variables on deactivation.

- [ ] **Step 5: Document, rebuild, and commit**

Document the distinction between visual fallback and gameplay zone state in `docs/traps/header-chrome.md`, rebuild, and commit.

### Task 5: Keep skill pager controls attached to the command stack

**Files:**
- Modify: `src/styles/skillcard-v2.css:235-407`
- Modify: `tests/skill-card-v2-render.test.mjs`
- Modify: `tests/skill-card-system.test.mjs`
- Modify: `docs/traps/skill-card-v2.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: `data-iw-skill-role="nav-group"`, `data-iw-skill-zone="content|commands"`, and existing command-stack tokens.
- Produces: one containing-block rule for both live pager DOM shapes.

- [ ] **Step 1: Add the missing tall content-branch fixture**

Create paired cards with the pager under the content branch: one material cell and six material cells. Measure action and pager boxes and assert the vertical gap differs by no more than one pixel between cards and remains at `--iw-skill-v2-cmd-buffer`.

```js
const gap = card => {
  const action = card.querySelector('[data-iw-skill-role="action-button"]').getBoundingClientRect();
  const pager = card.querySelector('[data-iw-skill-role="nav-group"]').getBoundingClientRect();
  return Math.round(pager.top - action.bottom);
};
assert.ok(Math.abs(gap(shortCard) - gap(tallCard)) <= 1);
```

- [ ] **Step 2: Run the render test and confirm the containing-block failure**

Run: `node tests/skill-card-v2-render.test.mjs`

Expected: FAIL because the content-branch pager resolves its `50%` against the content zone.

- [ ] **Step 3: Make the content pager resolve against the card on desktop**

Add the content zone itself to the containing-block reset when it owns a pager. Preserve the later phone rule that intentionally restores `position: relative`.

```css
html[data-iw-skill-card-design="new"]
.compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]
[data-iw-skill-zone="content"]:has([data-iw-skill-role="nav-group"]) {
  position: static !important;
}
```

Place the rule before the `@container iw-skill-card (max-width: 480px)` override so the phone band remains the containing block.

- [ ] **Step 4: Exercise both DOM shapes and breakpoints**

Run:

```powershell
node tests/skill-card-v2-render.test.mjs
node tests/skill-card-system.test.mjs
node tests/card-button-art.test.mjs
```

Expected: PASS for command-branch and content-branch pagers at desktop and phone widths; controls remain inside card bounds.

- [ ] **Step 5: Document, rebuild, and commit**

Correct the contradictory containing-block explanation in `skillcard-v2.css` and `docs/traps/skill-card-v2.md`, rebuild, and commit.

### Task 6: Add generic contained-popover ownership, layering, and theming

**Files:**
- Modify: `src/modules/OverlayFramer.js`
- Modify: `src/styles/overlay.css`
- Modify: `src/styles/inventory.css:31-34`
- Modify: `tests/overlay-framer.test.mjs`
- Create: `tests/contained-popover-render.test.mjs`
- Modify: `package.json`
- Modify: `docs/traps/inventory.md`
- Modify: `docs/traps/classification.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: visible rendered state, ARIA popup semantics when present, and the closest framed ancestor.
- Produces: `data-iw-overlay="popup"` on the pop-up and `data-iw-overlay-host="1"` on the frame's direct child that owns it.

- [ ] **Step 1: Capture the live Filters pop-up structure**

Record the trigger's `aria-expanded`/`aria-controls`, the pop-up's role/classes/position/z-index, its closest framed ancestor, its direct child under that frame, and every ancestor with non-visible overflow or a stacking context. Add the exact structure to `docs/traps/inventory.md`.

- [ ] **Step 2: Build a regression fixture from that capture**

The fixture must include an Inventory frame, an earlier header/tool child containing the open menu, and a later list child with `position: relative; z-index: 1`. Add negative controls for a closed menu, an ordinary positioned child, `.iw-tip`, and a full-screen scrim.

- [ ] **Step 3: Add pure classifier tests**

Extend `overlay-framer.test.mjs` to assert:

```js
assert.equal(menu.dataset.iwOverlay, 'popup');
assert.equal(menuHost.dataset.iwOverlayHost, '1');
assert.equal(closedMenu.dataset.iwOverlay, undefined);
assert.equal(ordinaryAbsolute.dataset.iwOverlay, undefined);
```

After close/teardown, both attributes must be absent.

- [ ] **Step 4: Implement contained-popover classification**

Add a second path beside `isScrim()` that accepts a visible positioned element only when it has popup semantics (`role=menu|listbox|dialog`, a matching expanded controller, or the captured structural signature), contains interactive content, and sits inside an existing framed surface. Resolve and tag the closest direct child under that frame as its host. Exclude `SKIN_OWNED`, tooltips, and already framed surfaces.

- [ ] **Step 5: Lift the host and theme the pop-up**

Add rules that establish a clear local order:

```css
[data-iw-overlay-host="1"] { z-index: 20 !important; }
[data-iw-overlay="popup"] {
  z-index: 21 !important;
  color: var(--iw-text) !important;
  border: 1px solid var(--iw-th-edge) !important;
  background: url('../assets/skills_panel_texture.webp'),
              linear-gradient(180deg, var(--iw-th-ground-a), var(--iw-th-ground-b)) !important;
  box-shadow: inset 0 0 0 1px #000, 0 8px 24px #000b !important;
}
[data-iw-inventory-root="1"]:has([data-iw-overlay="popup"]) { overflow: visible !important; }
```

Style controls inside through the existing button primitives; do not reparent the menu.

- [ ] **Step 6: Prove paint order in a real browser**

In `contained-popover-render.test.mjs`, use `document.elementFromPoint()` at an overlap point and assert the menu is topmost. Compare themed border/background values, then close the popup and assert overflow and markers restore. Add the test to `test:run`.

- [ ] **Step 7: Verify overlay and inventory regressions**

Run:

```powershell
node tests/overlay-framer.test.mjs
node tests/contained-popover-render.test.mjs
node tests/inventory-root.test.mjs
node tests/menu-rows.test.mjs
node tests/flush-quiescence.test.mjs
```

Expected: PASS, including zero steady-state writes after the popup settles.

- [ ] **Step 8: Document, rebuild, and commit**

Document the contained-popover boundary and stacking-context rule, rebuild, and commit.

### Task 7: Normalise Player Stats label weight

**Files:**
- Modify: `src/modules/OverlayFramer.js`
- Modify: `src/styles/overlay.css`
- Modify: `tests/overlay-framer.test.mjs`
- Modify: `tests/contained-popover-render.test.mjs`
- Modify: `docs/traps/classification.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: an overlay card positively identified by its `Lifetime Stats` heading and repeated label/value rows.
- Produces: `data-iw-overlay-content="player-stats"`, `data-iw-overlay-role="stat-label"`, and `data-iw-overlay-role="stat-value"`.

- [ ] **Step 1: Capture the actual Wood Chopped row**

Record the row HTML and computed `font-weight` for the label, value, sibling labels, and ancestors. Confirm whether the bold weight is on the label itself or inherited. Add the capture to `docs/traps/classification.md`.

- [ ] **Step 2: Add a scoped modal fixture and negative control**

Model at least three stat rows, with only Wood Chopped carrying the captured native bold class/style. Include unrelated `Wood Chopped` prose outside the stats modal and assert it is not tagged.

- [ ] **Step 3: Classify the stats surface structurally**

Inside an owned overlay panel, identify `Lifetime Stats`, then recognise its repeated two-cell rows. Tag labels and values without rewriting text or classes. Teardown removes all three new attributes.

- [ ] **Step 4: Apply typography by semantic role**

```css
[data-iw-overlay-content="player-stats"] [data-iw-overlay-role="stat-label"] {
  font-weight: 400 !important;
}
[data-iw-overlay-content="player-stats"] [data-iw-overlay-role="stat-value"] {
  font-weight: 700 !important;
}
```

- [ ] **Step 5: Verify scope and teardown**

Run the overlay and contained-popover tests. Expected: every stat label computes to 400, every value remains 700, outside prose is unchanged, and teardown removes the roles.

- [ ] **Step 6: Rebuild and commit**

Rebuild the bundle and commit source, tests, capture note, and generated output.

### Task 8: Give the quest skip note a full-width bottom row

**Files:**
- Modify: `src/modules/QuestPanelRenderer.js:220-277`
- Modify: `src/styles/skillpanel.css:2658-2700,2838-2844`
- Modify: `tests/quest-card-detection.test.mjs`
- Create: `tests/quest-skip-note-layout.test.mjs`
- Modify: `package.json`
- Modify: `docs/traps/classification.md`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: a text leaf beginning `Out of skips` inside a positively identified quest card.
- Produces: `data-iw-quest-role="skip-note"` on the leaf and `data-iw-quest-zone="skip-note"` on its direct host under the quest body.

- [ ] **Step 1: Add a quest fixture containing the exact helper copy**

Use the reported sentence and place it as the live DOM does. Assert it is not classified as `brief`, and its direct host receives `skip-note` zone ownership.

- [ ] **Step 2: Run the detection test and confirm failure**

Run: `node tests/quest-card-detection.test.mjs`

Expected: FAIL because the renderer currently has no skip-note role.

- [ ] **Step 3: Classify the helper before assigning briefs**

In `annotateStructure()`, find the helper with `/^out of skips\b/i`, exclude it from `columnLeaves`/`briefs`, set its role, and tag the direct child under the resolved body so the grid can place the host without moving it.

```js
const skipNote = leaves.find(el => /^out of skips\b/i.test(normText(el.textContent))) || null;
// Exclude skipNote when building columnLeaves.
if (skipNote) setRole(skipNote, 'skip-note');
const skipHost = body && skipNote ? directChildUnder(skipNote, body) : null;
if (skipHost) setZone(skipHost, 'skip-note');
```

- [ ] **Step 4: Place and style the bottom row**

```css
.compact-panel.fs-quest-panel > [data-iw-quest-zone="body"] > [data-iw-quest-zone="skip-note"] {
  grid-column: 1 / -1 !important;
  min-width: 0 !important;
}
.compact-panel.fs-quest-panel [data-iw-quest-role="skip-note"] {
  display: block !important;
  width: 100% !important;
  color: var(--iw-faint) !important;
  font: 400 10.5px/1.4 var(--iw-font-ui) !important;
  font-style: normal !important;
}
```

- [ ] **Step 5: Add browser geometry assertions**

In `quest-skip-note-layout.test.mjs`, assert the note host starts no farther left than the body content edge, extends across both grid columns, sits below the progress label, and does not overlap the sigil or command rail at 360px and 1100px. Add the test to `test:run`.

- [ ] **Step 6: Verify quest variants and quiescence**

Run:

```powershell
node tests/quest-card-detection.test.mjs
node tests/quest-structure-signature.test.mjs
node tests/quest-command-width.test.mjs
node tests/quest-skip-note-layout.test.mjs
node tests/flush-quiescence.test.mjs
```

Expected: PASS for bounties, work orders with/without Skip, and cards with no helper text.

- [ ] **Step 7: Document, rebuild, and commit**

Record the rule that optional direct children need named grid placement, rebuild, and commit.

### Task 9: Whole-batch verification and live acceptance

**Files:**
- Verify: all changed source, tests, docs, and `dist/content.bundle.js`
- Package: extension release artifact if the repository's normal release workflow requires it

**Interfaces:**
- Consumes: the eight independently passing fixes.
- Produces: one release candidate plus a live verification checklist.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: build succeeds; every jsdom, Playwright, static-invariant, quiescence, and sprite audit test passes.

- [ ] **Step 2: Check generated and working-tree state**

Run:

```powershell
git status --short
git diff --check
```

Expected: only intentional batch changes are present; no whitespace errors; `dist/content.bundle.js` is updated.

- [ ] **Step 3: Perform live verification in the unpacked extension**

Verify, in order:

1. Ancient Treant shows `Woodcutter's Gloves` and `Builder's Gloves` with their final artwork and live item details; neither tile shows the fallback glyph.
2. Clicking Prejoin produces a clearly glowing Queued state; refresh preserves the game's queued state presentation.
3. Game, Market, Leaderboards, Village, and Dungeon active labels remain readable across at least two zone themes.
4. Cold-load Dungeon and navigate Game -> Dungeon -> Game; the menu remains compact.
5. Open a one-material and a material-heavy subskill; pager-to-action spacing is unchanged.
6. Open Inventory Filters; it is themed, unclipped, and above the item list; close it and confirm normal clipping returns.
7. Open Player Stats; all Lifetime Stats labels have equal weight and values stay bold.
8. Open a work-order quest with no skips; the note spans the card bottom without overlap.

- [ ] **Step 4: Commit any fixture-only corrections, then prepare the release**

Do not change selectors from live findings without first updating the corresponding captured DOM fixture and proving the old selector fails. Run `npm test` again after any correction.

- [ ] **Step 5: Final commit**

```bash
git add src tests docs package.json dist/content.bundle.js
git commit -m "fix: harden launch-day reskin surfaces"
```
