# 7. Testing and verification

This chapter covers:

- what the existing automated tests prove (and do not prove);
- the results of running them for this handover;
- a manual test plan for every major feature;
- responsive, cross-browser, accessibility, performance, regression and security testing;
- recommended new tests;
- a final verification checklist.

> **Kinds of verification, stated honestly.** For this handover:
> - the test suite was **run** (§7.2);
> - the source was **read**;
> - nothing was **live-verified**: no session could load the real game with a real account.
>
> Every "expected result" below is what the source and fixtures predict. A person must confirm it on the live game [Project record: `CLAUDE.md` "Say which kind of verification you did"].

## 7.1 Test architecture

- **No framework.** Each `tests/*.test.mjs` is a standalone Node script that fails with a non-zero exit code or a thrown assertion. Run one with `node tests/<name>.test.mjs`.
- **`npm test`** rebuilds the bundle (`--allow-missing-assets`), runs `node --check dist/content.bundle.js`, then runs `npm run test:run`: the 47 suites in a fixed order, then `build-tools/audit-sprite-windows.mjs`.
- **A new suite must be appended to `test:run` by hand**, or it never runs in CI.
- **Engines**:
  - **jsdom**: DOM logic and classification, fast; no layout, so rects are zero.
  - **Playwright/Chromium**: real layout, cascade, computed styles, animations, the extension loading. Requires `npx playwright install chromium`.
  - **node**: pure logic and static invariants.
- **Fixtures** model live DOM shapes captured with the `claude/capture-*.js` snippets. A harness that boots the bundle must put `data-iw-page-hydrated="1"` on `<html>`, or boot waits out the 4 s gate [Project record: `docs/traps/test-harness.md`].
- **Loading the built bundle.** Most suites load `dist/content.bundle.js`, not `src/`, so build before running a single suite.
- **Negative controls.** Several suites prove they can fail. Examples from the log: "previous implementation wrong on 2/4 cases (control works: this test can fail)", and the sprite audit fails if it parses zero windows [Test run].
- **CI** runs `npm test` on Node 24 with Playwright Chromium, then `git diff --exit-code dist/content.bundle.js`.

### 7.1.1 Suite catalogue

| # | Suite | Engine | What it pins | Features |
| ---: | --- | --- | --- | --- |
| 1 | `data-services` | node + stubs | `ItemDatabase` cache freshness, stale fallback, validators, legacy `localStorage` eviction; `AtlasService` partial loads and backoff | F-42, F-43 |
| 2 | `inventory-model` | node | Owned-item detail parsing (upgraded cloaks, rolled stats) | F-40 |
| 3 | `item-display` | node | Category and tier classes, stat chips and rows | F-40, F-44 |
| 4 | `static-invariants` | node | Architecture rules asserted against source (injection order and count, one observer, breakpoints aligned to Tailwind, bundle budget warning, …) | F-03, F-04, F-55 |
| 5 | `hydration-gate` | jsdom | Gate protocol: already hydrated, late latch, timeout, disabled, latch removal | F-01 |
| 6 | `extension-e2e` | Playwright | **The real unpacked extension**: manifest, both content-script worlds, `web_accessible_resources`, assets load, no page errors or skin console errors | F-01, F-03 |
| 7 | `smoke` | jsdom | Boots the built bundle on a synthetic IdleWorlds-shaped DOM: mounts, Mine → Fish cache invalidation, native inline styles restored, all styles removed on disable, re-enable without duplicates, repeated disable, game text nodes never detached | F-02, F-04, F-07–F-45 |
| 8 | `route-swap-reclassify` | jsdom | Surfaces re-classify when routes swap panels | F-12, F-16, F-19, F-21–F-23, F-49 |
| 9 | `overlay-framer` | jsdom | Scrim/card detection, negative controls, teardown | F-53 |
| 10 | `zone-themes` | node | Generated zone map in step with JSON; every theme asset exists | F-09 |
| 11 | `button-art-states` | Playwright | Themed button art: all themes, asset exposure, hover and clicked switching | F-09, F-27, F-32 |
| 12 | `revised-button-atlas` | Playwright | Nine revised atlases, exact alpha registration, sprite windows, stable geometry, disabled controls, with all sheets plus inline `!important` shorthands | F-09, F-32, F-36, F-38 |
| 13 | `compact-button-atlas` | Playwright | Compact ghost atlas windows and states | F-11 |
| 14 | `compact-button-reconcile` | Playwright | Native text replacement, ARIA-only selection, quiet idle, teardown | F-11 |
| 15 | `compact-button-boot` | Playwright | Real bundled startup and reactivation path for compact buttons | F-02, F-11 |
| 16 | `corner-filigree-density` | Playwright | 1× fallback and 2× themed corner sheets select the same logical corners | F-12 |
| 17 | `separator-symmetry` | Playwright | The inventory title ornament is truly bilateral | F-41 |
| 18 | `action-progress-theme` | Playwright | Current Action and Zone Control rails, zone palette, animation, mobile, reduced motion | F-21, F-48, F-54 |
| 19 | `skill-action-countdown` | Playwright | Long-action countdown lifecycle | F-34 |
| 20 | `card-button-art` | Playwright | V2 card button art: nine themes, three states, both arrows, stable geometry, native content and progress, disabled | F-32, F-33, F-36 |
| 21 | `zone-headers` | node | All zone header files present and referenced | F-15 |
| 22 | `inventory-root` | jsdom | Inventory root resolution on the live shell shape | F-41 |
| 23 | `header-hidden-duplicate` | jsdom | The header resolves the visible copy, not the hidden duplicate | F-05, F-14 |
| 24 | `skill-structure-signature` | jsdom | **Real** `structureSignature` (extracted from source): insensitive to ticks, sensitive to structure | F-26 |
| 25 | `skill-card-v2` | jsdom | V2 derivations from roles (22 checks) | F-31–F-35 |
| 26 | `skill-card-v2-wiring` | node | V2 wiring invariants | F-31–F-35 |
| 27 | `skill-card-v2-render` | Playwright | V2 layout and rendering defects (32 checks) | F-31–F-36 |
| 28 | `skill-card-system` | Playwright | Cross-checked card rules with all sheets (124 checks) | F-26–F-37 |
| 29 | `ingredient-entries` | jsdom | Material entry boundaries (textContent joining) | F-30 |
| 30 | `quest-structure-signature` | jsdom | Quest signature behaviour. **Tests a stale copy of the logic (TEST-01)** | F-38 |
| 31 | `quest-card-detection` | jsdom | Quest recognition on whitespace-free markup | F-38 |
| 32 | `world-boss-panels` | jsdom | Boss decoration, rewards, control state, idempotence, teardown | F-46–F-48 |
| 33 | `zone-control-motion` | Playwright | Ward motion, crossfades, mobile, reduced motion | F-48, F-54 |
| 34 | `tooltip-virtual-anchor` | jsdom | Leaving a card opened on a virtual anchor | F-44, F-45 |
| 35 | `boss-action-label` | Playwright | QUEUED/PREJOIN label centring | F-46 |
| 36 | `boss-participation-hit` | Playwright | Participation link hit area and status row | F-46 |
| 37 | `village-panels` | jsdom | Building art, slot roles, install picker, housing hero, teardown; generated table pinned to `buildings.json` | F-50 |
| 38 | `village-scene` | jsdom | Placement, real slots, no-house state, rendered-route read, snapshot across tabs, league reset, idempotence | F-51 |
| 39 | `village-ledger` | jsdom | Item join, per-building effects, building-only totals, disclosure, rebuild, late storage read | F-52 |
| 40 | `village-scene-layout` | Playwright | The plot composition actually lays out | F-51 |
| 41 | `collapsible-frames` | Playwright | Every parent frame folds alone; persistence; teardown (38 checks) | F-13, F-24 |
| 42 | `panel-frame-nesting` | Playwright | Leaf-versus-container frame nesting | F-12 |
| 43 | `viewport-swap` | Playwright | Decorations follow the visible copy across 1280 px | F-05 |
| 44 | `quest-command-width` | Playwright | Quest command rail frame follows the label | F-38 |
| 45 | `header-compact` | Playwright | Nav rail, announcement, zone bar, merged chrome (34 checks) | F-14, F-16–F-20 |
| 46 | `menu-rows` | Playwright | Single-row menus on phones and tablets | F-16, F-17, F-41, F-55 |
| 47 | `flush-quiescence` | Playwright | **A quiet page costs nothing**: zero role writes and flushes when idle; busy toggle does not strip roles | F-04, all renderers |
| — | `audit-sprite-windows.mjs` | node | Every pixel sprite window lands on a named atlas cell with isotropic scale and a matching box; fails on zero windows | F-41 |

### 7.1.2 What the suites do **not** prove

- **The live game's DOM matches the fixtures.** Fixture drift is the main historical source of false passes [Project record].
- **Real server behaviour.** `items.json` on apex and `www`, CORS, and the `/api/player` statuses and payload.
- **CSP handling** on the live origin.
- **Assistive technology output.** Screen readers are not exercised.
- **Browsers other than Chromium**, and real phones (touch, GPU memory).
- **Operability of every game control** with the skin on. FUN-01 exists because no test asserts that a hidden game control stays reachable.
- **Long-session memory and performance on real hardware.** PERF-01, PERF-06 and PERF-07 are unmeasured.
- **Content accuracy** of skin-authored copy (CONT-01).

## 7.2 Current results

| Item | Result |
| --- | --- |
| Date | 2026-09-17 |
| Commit | `059081671bf3af4490a025121f25f13ada142b7e` (the source tree was clean) |
| Command | `npm test` |
| Exit status | **0** |
| Wall time | **3 min 26 s** |
| Build | `dist/content.bundle.js`: 668,309 bytes, 48 source modules (including the CSS and JSON modules) |
| Syntax check | `node --check` passed |
| Suites | All 47 printed their pass markers, and the sprite-window audit passed ("2 pixel sprite window(s) checked against 12 atlas cells") |
| Check lines | 826 lines beginning `ok`, plus the per-suite summaries (e.g. `skill-card-system (124 checks)`, `skill-card-v2-render (32 checks)`, `skill-card-v2 (22 checks)`) |
| Warnings | Bundle over the 300,000-byte soft budget (advisory, printed twice: by the build and by `static-invariants`) |
| Expected console noise | Suites that simulate offline or failing networks log `[ItemDatabase] Using stale cache after refresh failure: offline`, `[AtlasService] Partial load: … 503`, "network disabled in smoke test" and similar. These are the scenarios under test, not failures |
| `dist` after the run | Unchanged (the rebuilt bundle is byte-identical to the committed one) |
| Evidence | [`evidence/npm-test-2026-09-17.log`](evidence/npm-test-2026-09-17.log) (local path replaced by `<repo>`) |

**Known flakiness** [Project record: memory note on this machine]: `smoke` (burst timing), `skill-card-system` (timing) and `quest-command-width` can fail under heavy machine load, independent of code changes. All three passed in this run. Re-run a failing one alone before investigating.

## 7.3 Manual test plan

**Setup for every case**:

- Chrome ≥111 with the extension loaded unpacked (§6.1.2) and a logged-in test account.
- DevTools open. The kill switch is ready in the content-script console context (§6.1.4).
- Test at a desktop width (≥1280 px) unless the case says otherwise.

**Failure indicators apply to every case.** Any of these is a failure:

- a red error in the page console mentioning the extension;
- a `[IW Fantasy Skin]` warning in the content-script console;
- a game control that no longer works;
- a state (active, equipped, disabled, met/unmet, team colour) that is no longer visually distinct.

| ID | Feature(s) | Steps | Expected result | Failure indicators |
| --- | --- | --- | --- | --- |
| MT-01 | F-01 | Hard-reload the game 3 times. Watch the content-script console | `boot after page hydration: 1 (<ms>)` each time, typically well under 4000 ms; skin appears; no React #418 error in the page console attributable to the skin | `timeout (4000ms)` or `unknown`; #418 errors that disappear with the skin disabled |
| MT-02 | F-02 | Set `iw-skin-enabled` to `false`. Inspect the DOM. Set it to `true` | Off: no `style[data-iw-style]`, no `[data-iw-ui]`, no `.fs-inv-row`; page looks stock; game works. On: skin returns and nothing is duplicated (one `#iw-tip`, one Toolkit link, 7 styles) | Leftover marks or styles; duplicated nodes; collapsed panels missing titles after re-enable (FUN-04) |
| MT-03 | F-03, F-07 | Page context: list `style[data-iw-style]`. Check fonts in DevTools → Rendering → font list | 7 styles in order; Cinzel, Barlow and Crimson Text served from `chrome-extension://` | Missing or out-of-order styles; fonts 404 |
| MT-04 | F-04 | Leave the game idle with an action running for 60 s. Performance panel recording for 10 s | Smooth progress; no long tasks from the skin; `flushPending` only when the game mutates | Flush every frame while idle; growing memory |
| MT-05 | F-05 | Resize across 1279 ↔ 1281 px, then 1023 ↔ 1025 px | Skins follow the visible layout immediately; no unskinned copy appears | Stock panels after crossing; decorations on the hidden copy |
| MT-06 | F-08 | Compare surface colours with the skin on and off; open a menu or dialog | Dark warm surfaces; no navy panels left; translucent overlays still translucent [Verify: FUN-11] | Navy remnants; opaque overlays hiding content |
| MT-07 | F-09, F-15 | Travel to zones in at least 3 different themes (e.g. zones 1, 4, 22). Then open Market | Palette, corners, separators, button art and header painting change per zone; Market keeps the last zone's theme | `data-iw-zone-theme="default"` on the Game route; stale header art |
| MT-08 | F-10, F-11 | Hover, press and tab through: nav tabs, inventory filters and pager, loadout I/II, Change Zone, chat Send, a modal's buttons | Themed plates; hover and pressed art; focus ring visible; selected loadout and active filter remain distinct; disabled look distinct | A control with no focus ring; selection indistinguishable; misaligned layers |
| MT-09 | F-12, F-13 | For each panel: check the frame. Collapse, reload, expand. Collapse two panels | Frames on every panel; collapse leaves a single bar with the title; state persists across reload; panels fold independently | Title missing on the collapsed bar; wrong panel folds; toggle overlaps content |
| MT-10 | F-14, F-18 | Inspect the header at 1440, 1024, 860, 768 and 390 px. Click "Players online" and each utility button | Crest, glass identity, utility plates and status grid; announcement bar; all buttons work | Overlapping tiles; player name recoloured; dead buttons |
| MT-11 | F-16, F-17 | Visit each route. Check the active tab. Click Toolkit. Narrow to <768 px | Active tab highlighted on each route; Toolkit opens a **new tab** without navigating the game; hidden below 768 px | Wrong tab active; the game tab navigates away |
| MT-12 | F-19, F-20 | On the Game route, check the zone bar and merged chrome. Use Zones and Next zone | One merged box (zone title and notice; nav and actions); buttons work; tones distinct (teal Zones, ember Next) | Stacked boxes (the structure changed); tone swapped |
| MT-13 | F-21 | Start a skill action; watch Current Action for 3 cycles. Queue an action | Bar glides continuously and snaps back at completion; queue row styled; queue button works | Bar steps or slides backwards; jitter |
| MT-14 | F-22, F-23 | Open Action Log, click View All; send a chat message with Enter and with Send | Log rows styled with timestamps; chat scrolls; composer works with keyboard and button | Messages not sent; feed height broken |
| MT-15 | F-24 | With a Daily XP Boost active, look at the Skill Actions heading | Green boost chip | Missing chip (copy changed) |
| MT-16 | F-25–F-30 | For each discipline card (Combat, Mining, Smithing, Herbalism, Alchemy, Jewelcrafting, Spellcrafting, Tailoring, Woodcutting, Construction, Crafting, Fishing, locked): check identity, title, materials and buttons; page recipes | Correct accent and medallion per discipline; title without emoji; met materials green, unmet amber; pager works | Wrong discipline art; unmet shown as met; pager dead |
| MT-17 | F-29 (FUN-01) | On a card, try to click the level line "Lv N …" or its V2 equivalent | **Current code**: the game's cycle-XP control cannot be reached (FUN-01). Record whether the game offers another way to cycle | Confirms FUN-01; decide B-01 |
| MT-18 | F-31–F-35 | Run an action; watch the V2 button fill; run a >11 s action; view a card with an unmet requirement; narrow the card column | XP ring matches the percentage; fill glides; countdown mirrors Current Action; ⚠ requirement note; label fits (not below readable size, A11Y-03) | Countdown differs from Current Action; label overflow or 4 px text |
| MT-19 | F-38, F-39 | On quests: check the sigil, reward chip and command rail with Turn In All (n). Hover and focus the objective; press Enter, then Escape | Sigil shows the objective item art and %; the rail frame fits the label; hovercard opens and closes, focus returns | Stretched frame ends; hovercard won't close; Turn In not clickable |
| MT-20 | F-40, F-41 | Inventory: each filter; pages; equip and unequip; set actions; upgraded gear; items with sockets; phone width | Rich rows with correct icon, "+N" badge, chips and details; native actions work; equipped marked; active filter lit; single-row filter bar | Raw text visible next to the overlay; ❓ icons for known items; action clicks miss |
| MT-21 | F-42–F-44 | Hover icons and names; keyboard-open a card; click Wiki ↗; check the footer source label; test near viewport edges and on a short window | Card within the viewport; Wiki opens in a new tab; "live data" or "cached data" label; Escape closes | Card off-screen; stale label persists; clicks swallowed |
| MT-22 | F-45 | In Action Log or chat, rest the pointer on an item name mentioned in text; on a phone, tap it | Hovercard opens for the exact word. **No visual underline** (FUN-02) | Card for the wrong item; game click cancelled on tap |
| MT-23 | F-46, F-47 | World Bosses: art, labels, notice; toggle Possible Rewards; reload; focus a reward tile, press Enter | Portrait per boss; QUEUED or PREJOIN label matches the game state; disclosure persists; tile opens its card | Label contradicts the game state; notice text wrong (CONT-01) |
| MT-24 | F-48 | Zone Control during red, blue and contested states (or fixtures) | Crest, meter and factions match the game's numbers; impact plays on change (not under reduced motion) | Team colours swapped (FUN-12); meter disagrees with numbers |
| MT-25 | F-49 | Market: listings, empty slots, name buttons, steppers | Glass rows; empty slots dim; stepper colours unchanged | Red/green steppers recoloured |
| MT-26 | F-50 | Village route: housing hero; each slot; open the install picker; hover and focus building names; Install, Uninstall, Upgrade, Destroy (on a test account) | Art per building and house; tier pips; picker option art stays visible across updates (FUN-06); actions work | Option art flickers or disappears; wrong art |
| MT-27 | F-51, F-52 | Dashboard: Village scene after visiting the Village route; after 5 min; on an SSF character; with network blocked (DevTools offline) | Correct plots and house; ledger totals equal the sum of installed buildings; SSF shows the SSF village; offline shows the "last loaded" or "could not be loaded" copy | Wrong league's village; totals include vacant or house |
| MT-28 | F-53 | Open Players Online and any confirmation modal; scroll inside | Dim blurred scrim; forged frame on the card; frame does not scroll away; modal controls work | Frame on an inner sub-panel (FUN-07); scrim opaque |
| MT-29 | F-54 | Enable OS "reduce motion"; reload | No skin animations or transitions; ward loops stop; **note whether game spinners also stop** (FUN-03) | Animations still running |
| MT-30 | F-55 | Run MT-09, MT-10, MT-11, MT-16, MT-19, MT-20 and MT-27 at 360, 390, 430, 768 and 1024 px, and on a real phone | No horizontal overflow; tap targets usable (collapse and pager); menus in one row; Toolkit hidden on phones | Overflow; overlapping controls; unreachable buttons |

## 7.4 Responsive testing

| Width / device | Why | Focus |
| --- | --- | --- |
| 360, 390, 430 px (phones) | Skin-specific ≤430/420/400/384/380 rules | Skill and quest cards, inventory rows, tooltip full width, composer stacking, Village scene |
| 640/641 px | Tailwind `sm`; skill and quest phone layouts | Card rails, activity panel gaps |
| 760/761, 767/768 px | Boss and village phone rules; mobile header art; Toolkit hidden | Boss grid, header art swap, nav |
| 860/861 px | Header stacking; merged chrome stacking | Header grid, chrome rows |
| 1023/1024/1025 px | Frame padding and corners; inventory density | Frames, inventory chips |
| 1279/1280/1281 px | Hidden duplicate column swap; nav and filter font fitting | Viewport correctness (MT-05) |
| ≥1536 px | Largest breakpoint | Wide layouts |
| Touch device (Android Chrome) | `(pointer: coarse)` and `(hover: none)` | Tap-to-toggle hovercards, collapse hit area, pager height |
| Browser zoom 200% | Reflow | Text readable; no clipped controls |

**Tools**:
- `npm run fixtures` (320–768 px renders, short-viewport tooltip scroll);
- `node claude/audit-mobile.mjs --widths 360,390,430,768` (live-site audit, see `docs/traps/mobile.md`; use a test account);
- DevTools device toolbar.

**Expected**: no horizontal scroll; no overlapping interactive elements; single-row menus below 1280 px.

## 7.5 Accessibility testing

| Test | How | Expected | Known issues |
| --- | --- | --- | --- |
| Keyboard only | Tab through the header, nav, a skill card, a quest, inventory, the World Bosses rewards, the Village ledger and collapse toggles; operate with Enter/Space; Escape closes hovercards | Every native control reachable in a sensible order; focus visible; hovercards return focus | FUN-01 (XP-cycle control unreachable); prose item names not reachable (by design) |
| Focus visibility | Check the ring contrast on dark plates | Visible ring on all controls | The 1 px `base.css` ring may be faint on some plates [Verify] |
| Screen reader (NVDA + Chrome on Windows; TalkBack on Android) | Read skill cards, quest cards, boss action buttons, the Village ledger | Each control's name matches its visible purpose; content read once | A11Y-01 (duplicates; "QUEUED" shown but "Prejoined" read); A11Y-02 (focusable `<p>` without a role) |
| Automated scan | axe DevTools or Lighthouse on Game, Inventory, Village and World Bosses with the skin on and off | No new critical violations with the skin on | Expect findings for small text (A11Y-03) and possibly contrast [Verify] |
| Contrast | Measure dim and faint text tokens on grounds (`--iw-dim`, `--iw-faint` over `--iw-ink-*`) | WCAG AA 4.5:1 for body text | [Verify]: not measured for this handover |
| Target size | Measure collapse toggles, pager arrows and reward tiles on touch | ≥24×24 px (WCAG 2.2 AA 2.5.8) | Covered by `(pointer: coarse)` rules; verify on devices |
| Reduced motion | MT-29 | No skin motion | FUN-03 affects the game's motion |
| Zoom and reflow | 200% and 400% zoom, 320 px CSS width | Content usable | — |

## 7.6 Recommended new automated tests

| ID | Test | Type | Pins | Negative control |
| --- | --- | --- | --- | --- |
| T-01 | **Game-control operability**: with all sheets loaded on the skill card fixture, every native `button` in a card is visible (`checkVisibility`), has `pointer-events: auto`, and receives a synthetic click via `elementFromPoint` at its centre | Playwright | FUN-01; future rule-1 regressions | Fails today on the `level-progress` button (confirm it fails, then decide B-01) |
| T-02 | **Tooltip escaping**: a record with markup in every text field (including `craft_level`, `tier`, `wiki_slug`) opens a card; assert no element children beyond the template and the literal text is present | jsdom | SEC-01, SEC-08 | Revert H-01 and confirm failure |
| T-03 | **Catalogue validation**: malformed records (null, numbers as names, objects as tiers) are skipped with one warning; valid records are indexed | node | SEC-02 | — |
| T-04 | **Kill-switch round trip with a collapsed panel**: collapse → disable → enable → assert the title is visible and `data-iw-collapse-spine` exists | Playwright | FUN-04 | Fails before H-08 |
| T-05 | **Village picker art stability**: decorate a slot with the picker open, bump the DB revision twice, and assert option art is present after each pass | jsdom | FUN-06 | Fails before H-10 |
| T-06 | **Same-panel re-annotation**: annotate a card, replace its title element (new node), re-render the same card, and assert the role is on the new node | jsdom | FUN-08 | Fails before H-09 |
| T-07 | **Kill switch during the hydration wait**: set `false` 1 s into a 4 s wait, and assert the skin does not boot | jsdom | H-07 | Fails today |
| T-08 | **Forged events ignored**: dispatch `iw:skill-panel` and `iw:dom-flush` from page-world script with junk `detail`, and assert no warnings and no work (flush counter unchanged) | Playwright | SEC-05, H-23 | — |
| T-09 | **Quest signature on the real module**: extract `textLeaves`/`structureSignature` from `QuestPanelRenderer.js` (like `skill-structure-signature`) and update the expectations to the current contract (`disabled` excluded, `(n)` stripped) | jsdom | TEST-01 | Mutate the source function and confirm failure |
| T-10 | **`web_accessible_resources` completeness**: every `url(../assets/…)` in the CSS and every `assetUrl()` constant path is covered by a manifest pattern and exists in the package | node | H-18, H-19 | Remove a pattern and confirm failure |
| T-11 | **Pointer-move cost**: synthetic mouse moves over a large text container on the perf fixture; assert the per-frame cost of `handlePointer` stays below a budget | Playwright + perf harness | PERF-06 | Disable H-15 |
| T-12 | **Zone scan cost on non-Game routes**: a Market-shaped page with no zone bar; count `querySelectorAll('div,span,p,strong')` calls per flush | Playwright | PERF-02 | — |
| T-13 | **Dead-CSS gate**: `tools/css-superseded.mjs` reports 0 rows (after clean-up) | node | MAINT-01 | Add a duplicate declaration |
| T-14 | **Trigger attribute ownership**: a game `<p>` with pre-existing `tabindex="-1"` and `aria-describedby="x"` becomes a trigger, opens and closes, is torn down; the native values are restored | jsdom | FUN-09, H-11 | Fails today |
| T-15 | **Village API statuses**: mock 401, 429 with `Retry-After`, 500 and malformed JSON; assert backoff, messages and no tight retry | jsdom | SEC-04, H-14 | — |
| T-16 | **Reduced-motion scope**: with reduced motion, a game element with `animation: spin 1s infinite` keeps animating while skin animations stop | Playwright | FUN-03 after B-03 | Fails today by design |
| T-17 | **Font tokens resolved**: computed `font-family` of the quest brief and boss reward name equals the intended token | Playwright | FUN-05 after B-04 | Fails today |
| T-18 | **Atlas memory smoke**: load the inventory fixture and record `performance.measureUserAgentSpecificMemory()` (cross-origin-isolated harness) or Chrome's task-manager value manually | Manual or Playwright | PERF-07 | — |

## 7.7 Cross-browser, performance, regression and security testing

### 7.7.1 Cross-browser

| Browser | Status | What to check |
| --- | --- | --- |
| Chrome stable (Windows, macOS, Linux) | Target | Full manual plan |
| Chrome 111 (minimum) | Effective floor | Smoke: MT-01, MT-03, MT-07, MT-16, MT-20 (`color-mix`, `world: "MAIN"`) |
| Chrome for Android | Target (touch) | MT-21, MT-22, MT-30 |
| Edge, Brave, Opera (Chromium) | **Untested** [Verify] | MT-01–MT-03 smoke; extension install path differs |
| Firefox, Safari | **Unsupported** (MV3 `world: "MAIN"`, `chrome.*`) | Not applicable |

### 7.7.2 Performance

| Test | Command / method | Expected | Failure indicator |
| --- | --- | --- | --- |
| Main-thread cost on a ticking page | `node claude/perf-harness.mjs --runs 3` vs `--noskin` | Skin overhead within the budget recorded in `docs/traps/performance.md` [Project record] | Regression versus the previous run's numbers (keep them in `tmp/perf/`) |
| Quiescence | `node tests/flush-quiescence.test.mjs` | 0 flushes and 0 role writes on an idle page | Any non-zero |
| Boot cost | DevTools Performance: reload with a 200-row inventory | No long task > 200 ms attributable to the skin [Assumption: target] | Style recalc storms (per-row `getComputedStyle`) |
| Scroll smoothness | Scroll inventory and chat on a phone | No jank; no scroll-anchoring jumps on busy toggles | Jumps when the game disables buttons |
| Memory | Chrome Task Manager after 30 min on inventory and Village | Stable; atlas decode ≈ one-time (PERF-07) | Continuous growth |
| Animations | Performance monitor with Zone Control visible vs collapsed | Paint count stops when collapsed or hidden (after H-17) | Constant paints off-screen (PERF-01, today) |

### 7.7.3 Regression

1. **Before a change**: run `npm test` and `npm run fixtures`; keep the fixture screenshots and `tmp/perf/` numbers.
2. **After a change**: repeat, compare the screenshots, and review the diffs of `tools/css-inventory.json`, Appendix B and `tools/css-superseded.md`.
3. **Live A/B**: use the kill switch on the same game state; run the MT cases for the affected features.
4. **After each IdleWorlds update**: run the §6.6.1 symptom scan (a 10-minute smoke over MT-01, MT-07, MT-09, MT-16, MT-19, MT-20, MT-23, MT-27).

### 7.7.4 Security

| Test | How | Expected |
| --- | --- | --- |
| API census gate | `node handoff/reskin-technical-handover/tools/js-api-census.mjs`, then diff `tools/js-api-census.md` in review | No new network, storage, HTML-sink, dynamic-code or navigation call sites without review |
| Escaping | T-02 | Literal text only |
| Network destinations | DevTools Network panel over a 10-minute session (Game, Inventory, Village, dashboard) | Only `chrome-extension://…`, `items.json` and `/api/player` from the skin |
| Storage contents | Content-script console: `chrome.storage.local.get(null).then(o => Object.keys(o))` | Only the keys in §5.2.3 |
| Page storage | Page context: `Object.keys(localStorage)` before and after enabling the skin | No new keys; the legacy `iw-item-db-cache` removed if present |
| Forged events | T-08 | No effect beyond work |
| CSP | If IdleWorlds tightens its CSP, run MT-01, MT-03 and MT-20 with the new header (§5.2.9 [Verify]) | Styles, images and fonts still load |
| Packaging | `npm run package`; unzip and list files | No secrets, no `.md`/`.html`, no profile data, no source maps |
| Dependency audit (dev tooling) | `npm audit --omit=optional` | No critical vulnerabilities in build or test dependencies (none ship) |

## 7.8 Final verification checklist

Use before a release or a handover acceptance. Each item records **how** it was verified (built, fixture, live).

**Build and automated**

- [ ] `npm ci` completes; `npm run build` produces `dist/content.bundle.js`, and `git diff dist` is empty after committing.
- [ ] `npm test` exits 0; there are no unexpected warnings beyond the bundle-size advisory.
- [ ] `npm run fixtures` renders; screenshots reviewed against the previous release.
- [ ] `tools/css-inventory.mjs`, `tools/css-superseded.mjs` and `tools/js-api-census.mjs` regenerated; diffs reviewed.
- [ ] `npm run package` succeeds. The zip contains no unreachable art (after H-18), no secrets and no source maps. Icons are present if distributing.

**Live: activation and safety**

- [ ] MT-01: boot after hydration without React errors attributable to the skin.
- [ ] MT-02: kill switch round trip clean (no residue except the documented `#iw-tip`, and no missing collapsed titles).
- [ ] Network: only the expected destinations (§7.7.4).
- [ ] Storage: only the expected keys.
- [ ] No game control lost (T-01 or a manual sweep); FUN-01 resolved or accepted.

**Live: features**

- [ ] Themes across at least 3 zones (MT-07); header art per zone.
- [ ] Frames and collapse on every panel (MT-09).
- [ ] Header, nav, Toolkit and zone bar (MT-10–MT-12).
- [ ] Activity panels (MT-13–MT-15).
- [ ] All skill disciplines and V2 behaviours (MT-16–MT-18).
- [ ] Quests (MT-19); inventory (MT-20); hovercards (MT-21–MT-22).
- [ ] World Bosses and Zone Control (MT-23–MT-24); Market (MT-25).
- [ ] Village route, scene and ledger, including an SSF character (MT-26–MT-27).
- [ ] Modals (MT-28); reduced motion (MT-29).

**Live: responsive and accessibility**

- [ ] MT-30 at 360/390/430/768/1024 px and one real phone.
- [ ] Keyboard-only pass (§7.5); screen-reader spot check on skill, quest and boss cards.
- [ ] Contrast and target-size checks recorded.

**Decisions and documentation**

- [ ] Owner decisions recorded for §6.9 items 1–5.
- [ ] Documentation drift D-01…D-10 fixed or accepted.
- [ ] `SEC-07`: no browser profile or business documents inside any shared copy of the repository.
