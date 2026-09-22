# 4. Development constraints and limitations

The reskin was built as a **third-party browser extension, without access to the IdleWorlds source code, build, backend or art pipeline** [Source: `CLAUDE.md`, module headers]. Almost every unusual technique in the codebase traces back to one of the constraints below.

For each constraint this chapter records:

- the **evidence** for it;
- **how it shaped** the implementation;
- whether the resulting code is **deliberate design** (it would still be right with full access) or a **workaround** (it exists only because access was missing);
- how a developer **with full access** would replace it;
- whether and **how the constraint can be removed**.

## 4.1 Summary

| ID | Constraint | Classification | Removable with full access? | Replacement in one line |
| --- | --- | --- | --- | --- |
| C1 | No access to the game's source or build | Workaround driver | **Yes** | Implement the theme inside the IdleWorlds codebase |
| C2 | React owns and continuously rewrites the DOM | Design, given C1 | **Yes** (obsolete in-app) | Render the design in React components |
| C3 | Appending during hydration breaks React (#418) | Workaround | **Yes** | Nothing to gate: components render in React's lifecycle |
| C4 | The isolated content-script world cannot see page JavaScript | Workaround | **Yes** | Read state from app stores; use the app's own fetch client |
| C5 | Almost no stable hooks; English copy is the only identifier | Workaround | **Yes** | Components expose roles and variants; i18n keys |
| C6 | The game renders its panel stack twice (hidden duplicate column) | Workaround | **Yes** | Components know which layout is active |
| C7 | Tailwind utilities and inline styles win the cascade | Workaround | **Yes** | Theme tokens, cascade layers, component variants |
| C8 | Unknown CSS load order (late chunks) | Workaround | **Yes** | One controlled CSS pipeline |
| C9 | One observer on a constantly mutating 15k-node page | Design, given C1/C2 | **Yes** (obsolete in-app) | React renders; no observer |
| C10 | Page CSP and third-party origins can blank assets | Design | Partly | Serve art from the game's own CDN and origin |
| C11 | Everything must be reversible at runtime (kill switch) | Design | Replace | A feature flag or theme setting |
| C12 | Presentation only: never change behaviour or destroy state | Design (keep) | Keep as a principle | Code review rule in the app |
| C13 | Needed data is not in the DOM (item stats, village on dashboard) | Workaround | **Yes** | Props and stores already hold the data |
| C14 | Data contracts (`items.json`, `/api/player`) are undocumented | Workaround | **Yes** | Typed internal APIs |
| C15 | MV3 extension model: no UI, `chrome.storage` only | Design (minimal permissions) | Replace | Game settings UI |
| C16 | Modern CSS/JS platform features, Chrome only | Design | Partly | Follow the game's browser support policy |
| C17 | No access to the art pipeline; atlases generated or imported externally | Workaround | **Yes** | Game asset pipeline, per-item assets, CDN |
| C18 | Committed, unminified bundle for auditability | Design | Replace | Normal app build with source maps |
| C19 | Tests cannot use the real app | Workaround | **Yes** | Component, integration and visual tests in the app repo |
| C20 | Performance budget on an idle game that ticks constantly | Design | Changes shape | Profiling inside React (memoisation, virtualisation) |
| C21 | Responsive behaviour must fit the game's existing breakpoints | Workaround | **Yes** | Shared breakpoint tokens; container queries in components |
| C22 | Accessibility is limited to what can be layered on | Workaround | **Yes** | Real semantics and markup in components |
| C23 | Legal and ownership boundaries (game art, outbound link, authored copy) | Policy | Decision needed | Owner approval, or content from the game |
| C24 | Tooling depends on Windows/Python/sibling repositories not in the repo | Workaround | **Yes** | Reproducible asset pipeline in CI |

## 4.2 Constraints in detail

### C1. No access to the IdleWorlds source code or build

| | |
| --- | --- |
| **Evidence** | `CLAUDE.md`: "React keeps ownership of every gameplay node … this extension adds decoration, semantic role attributes and its own overlay elements. It never rewrites the game's DOM." The project ships as an MV3 extension ([manifest.json](../../manifest.json)). |
| **Shaped** | The entire architecture: classifiers that recognise surfaces from rendered DOM (`UIFoundation`, `DOMWatcher.detectSkillType`, `QuestPanelRenderer.isQuestCard`, …); role attributes as the contract between JavaScript and CSS; a runtime style injector; a kill switch. |
| **Classification** | **Workaround driver.** This is the root constraint; C2–C9, C13, C14, C17, C19, C21 and C22 follow from it. |
| **With full access** | Implement the theme as part of the IdleWorlds front end: <ul><li>design tokens in the theme configuration;</li><li>component variants for panels, cards and controls;</li><li>data already in props.</li></ul> The CSS in `src/styles` can be ported selector by selector, because it keys on semantic roles that components can render directly (Chapter 6 §6.7). |
| **Removal** | Follow the migration plan in §6.7. The extension then becomes unnecessary. |

### C2. React owns and continuously rewrites the DOM

| | |
| --- | --- |
| **Evidence** | Rule 2 ("No reparenting"), rule 3 (reversible), the `docs/traps/performance.md` measurements, and module comments on node replacement (e.g. `TooltipEngine` "React can replace the trigger without a conventional mouseleave"). |
| **Shaped** | <ul><li>**Append-only decoration**: overlays, medallions and toggles are appended; `display: contents` and grid placement are used instead of moving nodes.</li><li>**Idempotent renderers**: signatures such as `data-fs-inv` and `structureSignature`, and compare-before-write helpers such as `setOwnText` and `setData`.</li><li>**Caches revalidated** by `isConnected`, `contains` and the layout epoch.</li><li>**Skin-owned nodes excluded** from classifier sweeps (`:not([data-iw-…])`, `closest()` guards).</li><li>**Game text never rewritten**; clean labels come from CSS `content: attr()` (A11Y trade-off).</li></ul> |
| **Classification** | **Design, given C1.** In an extension these are exactly the right rules. They are unnecessary inside React. |
| **With full access** | Render the decorations as part of the components. React's reconciliation handles updates; no signatures or observers are needed. |
| **Removal** | Obsolete once components own the markup. **Keep the rule-5 discipline** (never repaint state uniformly) as a design-review rule. |

### C3. Appending during hydration breaks React

| | |
| --- | --- |
| **Evidence** | `CLAUDE.md` and the `HydrationGate.js` header: appending skin nodes mid-hydration made React throw #418 and re-render the tree. |
| **Shaped** | <ul><li>A second content script in the **MAIN world** (`src/page/hydration-signal.js`) reads React's private root fields and writes `html[data-iw-page-hydrated]`.</li><li>`HydrationGate.waitForPageHydration` polls for it, with a 4 s cap.</li><li>`start()` awaits the gate before the first boot.</li></ul> |
| **Classification** | **Workaround.** It reads undocumented React internals (`__reactContainer$…`, `memoizedState.isDehydrated`). |
| **With full access** | Not needed: code inside the app runs after hydration by construction (`useEffect`, or rendering during hydration with matching server output). |
| **Removal** | <ol><li>Delete `src/page/hydration-signal.js`, `src/modules/HydrationGate.js` and `tests/hydration-gate.test.mjs`.</li><li>Remove the second `content_scripts` entry from the manifest.</li><li>Remove the `waitForPageHydration` call in `content.js`.</li></ol> **While still an extension**, the safer alternative would be for the game to dispatch a documented, public event or attribute when hydration completes, replacing the private-field probe. |

### C4. The isolated content-script world cannot see page JavaScript

| | |
| --- | --- |
| **Evidence** | <ul><li>The hydration signal must run in the MAIN world (C3).</li><li>`VillageScene` replicates the `x-idleworlds-league` header because "the page monkey-patches `fetch` to add it; the isolated world does not see the patch" [Source: `VillageScene.js` comments L43–66; Project record: `docs/traps/village.md`].</li></ul> |
| **Shaped** | <ul><li>The league is derived from `location.pathname` (a `/ssf` prefix → `ssf`), and the header is added manually.</li><li>No access to React state, so everything is read from DOM text (C5).</li></ul> |
| **Classification** | **Workaround.** |
| **With full access** | Read the league and the player's village from the app's state and API client, which already carries auth and league context. |
| **Removal** | Replace `VillageScene`'s fetch with a store selector. Delete `leagueOf` and `sectionOf`. |

### C5. Almost no stable hooks; English copy is the identifier

| | |
| --- | --- |
| **Evidence** | `CLAUDE.md`: "The live app has almost no stable hooks (`#current-action-panel`, `.panel`, `data-skin`)". Classifier regexes throughout, listed in Chapter 6 §6.5. |
| **Shaped** | <ul><li>Heading and label regexes: "Inventory", "Skill Actions", "World Bosses", "Village Add-ons", "Zone N:", "Turn In", "Reward:", "Message World Chat", …</li><li>Verb tables for skills; leading emoji runs stripped before anchored regexes.</li><li>Element-boundary anchoring, because `textContent` joins elements without separators.</li><li>**Positive** identification rules so shared `.compact-panel` cards are not misclassified.</li><li>Separate attribute namespaces per module.</li></ul> |
| **Classification** | **Workaround.** It is also the main maintenance risk: any copy change, localisation, or emoji change in the game can silently disable a surface (it falls back to native). |
| **With full access** | Components render explicit roles (`data-role="skill-card"`, `data-skill="mining"`) or variant props. Localisation uses message keys, not rendered strings. |
| **Removal** | Add stable `data-*` hooks to the game components first (even before a full migration). Then switch each classifier to the hook, keeping the text fallback until the hook ships everywhere. This alone removes most fragility (§6.7 phase 1). |

### C6. The panel stack is rendered twice

| | |
| --- | --- |
| **Evidence** | `Viewport.js` header: a `hidden xl:grid` copy and an `xl:hidden` copy, swapping visibility at 1280 px; a breakpoint crossing mutates nothing. |
| **Shaped** | `isRendered`/`pickRendered`/`preferRendered` (`checkVisibility`), the `matchMedia` layout epoch, and every classifier cache keyed on the epoch. Inventory root resolution checks that the root contains **this** row. `QuestPanelRenderer.measureCommandBlock` skips 0-width measurements. |
| **Classification** | **Workaround.** |
| **With full access** | Render one responsive layout, or let the components know which layout is active, so the theme never has to choose. |
| **Removal** | Delete `Viewport.js` and the epoch checks once classifiers are gone. |

### C7. Tailwind utilities and inline styles win the cascade

| | |
| --- | --- |
| **Evidence** | 3,879 `!important` declarations (66%); substring selectors on utility classes; inline `!important` from renderers (Chapter 3 §3.2). |
| **Shaped** | <ul><li>`!important` as the default.</li><li>Long `:not()` opt-out chains, (0,30,3) specificity.</li><li>The `var(--token, fallback)` inline pattern.</li><li>Radius and colour flattening through `[class*="rounded-…"]`.</li><li>Overriding the game's own design tokens on `:root`.</li></ul> |
| **Classification** | **Workaround.** |
| **With full access** | <ul><li>Put the palette into the game's theme tokens.</li><li>Use cascade layers or the Tailwind theme so component styles win without `!important`.</li><li>Stop components from writing inline colours that the theme must override.</li></ul> |
| **Removal** | Chapter 3 §3.13, steps 1–7. |

### C8. Unknown CSS load order

| | |
| --- | --- |
| **Evidence** | The skin's `<style>` elements are appended at `document_idle`. Whether the game inserts CSS later (client-side navigation chunks) is not observable from the repository **[Assumption]**. |
| **Shaped** | `!important` on declarations that must win regardless of order. `ui-system` is injected last so that ties among the skin's own sheets resolve predictably. |
| **Classification** | **Workaround.** |
| **With full access** | A single CSS pipeline with a defined order (or layers). |
| **Removal** | Part of C7. |

### C9. One observer on a constantly mutating page

| | |
| --- | --- |
| **Evidence** | Rule 4 (one `MutationObserver`); `DOMWatcher` flush budget of 60; `docs/traps/performance.md` (for example: annotateStructure took 72% of cost before the structure signature; ~10 s boot from per-row style reads; self-driving flush loops); `tests/flush-quiescence.test.mjs`. |
| **Shaped** | <ul><li>A central queue with round-robin budgeting.</li><li>Event fan-out to renderers.</li><li>An attribute filter limited to eight attributes.</li><li>Compare-before-write everywhere.</li><li>Batching reads before writes.</li><li>No shorthand plus longhand in inline maps.</li><li>Caches with coverage checks (the `[].every()` trap).</li></ul> |
| **Classification** | **Design, given C1/C2.** It is excellent engineering for an extension, and unnecessary in-app. |
| **With full access** | Components re-render only when their props change. There is no observer. |
| **Removal** | Obsolete in-app. While the extension exists, **keep** all these disciplines: they are pinned by tests. |

### C10. Page CSP and third-party origins

| | |
| --- | --- |
| **Evidence** | `vendor-assets.mjs` header: a previous build loaded atlases from `raw.githubusercontent.com` and fonts from Google, so a CSP change on the game "could blank every icon". |
| **Shaped** | <ul><li>All art and fonts are vendored into `assets/`, pinned to a sprite repository commit, and served from `chrome-extension://` through `web_accessible_resources`.</li><li>`StyleInjector` rewrites URLs.</li><li>The build refuses to run without the required assets (unless `--allow-missing-assets`).</li></ul> |
| **Classification** | **Deliberate design** for an extension: no runtime third-party dependencies. |
| **With full access** | Serve assets from the game's own origin or CDN under the game's CSP, with cache headers and per-asset URLs. |
| **Removal** | Move `assets/` into the game's static pipeline. Delete `vendor-assets.mjs` and the URL rewrite. Keep "no third-party runtime origins" as policy. |

### C11. Everything must be reversible at runtime

| | |
| --- | --- |
| **Evidence** | Rule 3; README "Kill switch"; `StyleInjector`, `InlineStyleOwner`, every `clear*()`; smoke-test round trips. |
| **Shaped** | <ul><li>CSS injected as removable elements.</li><li>Inline styles owned property by property, with native values restored.</li><li>Each module removes exactly what it added (own namespaces).</li><li>Page-lifetime listeners inert while disabled.</li><li>The storage listener kept alive.</li></ul> |
| **Classification** | **Deliberate design.** Reversibility is also how the skin guarantees it can never strand a player with broken UI. |
| **With full access** | A theme setting or feature flag chooses between the stock and fantasy themes at render time. There is no runtime teardown. |
| **Removal** | Replace with a flag. Keep the principle for any remaining runtime enhancement. |

### C12. Presentation only; never destroy state information

| | |
| --- | --- |
| **Evidence** | Rules 1 and 5; examples throughout (active tab, equipped item, met/unmet, disabled, team colour, player-name colour left to the game). |
| **Shaped** | <ul><li>Restyling native controls instead of replacing them.</li><li>Mirrors are `aria-hidden` while the native label stays the accessible name.</li><li>State is read from the game's classes and attributes.</li><li>Colour rules avoid changing text colour on controls whose colour is state.</li></ul> |
| **Classification** | **Deliberate design (keep).** |
| **Known exceptions** | FUN-01 (a game control hidden); FUN-03 (game animations frozen for reduced-motion users); CONT-01/CONT-02 (skin-authored copy and relabelled "Prejoined" → "Queued"). |
| **With full access** | The same principle becomes a UI review checklist item. |
| **Removal** | Not applicable: retain. |

### C13. Needed data is not in the DOM

| | |
| --- | --- |
| **Evidence** | <ul><li>`ItemDatabase` exists because stats are not rendered.</li><li>`VillageScene` exists because the village "simply is not in the dashboard's DOM" [Source: `CLAUDE.md`].</li><li>`VillageLedger` joins building items from `items.json`.</li><li>World Boss rewards are derived from item acquisition text plus a bundled fallback.</li></ul> |
| **Shaped** | <ul><li>Network reads (`items.json`, `/api/player`), with a storage cache and a refresh chain.</li><li>Name normalisation and alias tables to join DOM text to records.</li><li>Fallback data (`rewards.json`, inline records) and skin-authored explanatory copy.</li></ul> |
| **Classification** | **Workaround.** |
| **With full access** | Components already hold item and player objects. Rewards, benefits and acquisition come from the same server data the game uses. |
| **Removal** | Delete `ItemDatabase`'s fetch and cache, `aliases.js`, name joins, and `VillageScene`'s API read. The tooltip renders from props. |

### C14. Undocumented data contracts

| | |
| --- | --- |
| **Evidence** | `build-tools/audit-items-contract.mjs` (manual, not in CI); `normaliseVillage` strict validation; D-07 size ambiguity; the `items.json` field names assumed in `itemDisplay.js`/`TooltipEngine.js`. |
| **Shaped** | <ul><li>Defensive parsing (e.g. tier and slots must be integers 0–5; duplicate slots rejected).</li><li>Graceful degradation when data is missing.</li><li>Validation of CSV columns and bounds for atlases.</li><li>Conditional requests (ETag/Last-Modified).</li></ul> **But**: item fields are trusted per field (SEC-01, SEC-02). |
| **Classification** | **Workaround.** |
| **With full access** | Typed API clients shared with the game. Contract tests run in the game's CI. |
| **Removal** | Replace with typed selectors. Until then, add field-type validation (Chapter 5 hardening H-01/H-02). |

### C15. MV3 extension model with minimal permissions

| | |
| --- | --- |
| **Evidence** | Manifest: `permissions: ["storage"]`, two host permissions, no service worker, popup, options or icons. |
| **Shaped** | <ul><li>The kill switch is only reachable through DevTools (F-02).</li><li>Preferences (collapse, ledger, boss rewards) live in `chrome.storage.local`.</li><li>No background fetching or messaging.</li><li>No extension UI.</li></ul> |
| **Classification** | **Deliberate design**: the smallest reasonable permission surface. |
| **With full access** | A settings toggle in the game ("Theme: Classic / Fantasy") and per-account preferences stored server-side or in the app's local storage. |
| **Removal** | Replace storage keys with app settings. Migrate `iw-collapsed-frames`, `iw-village-ledger` and `iw-boss-rewards-collapsed:*` only if continuity matters. |

### C16. Modern platform features, Chrome only

| | |
| --- | --- |
| **Evidence** | Chapter 1 §1.10: `color-mix` (111), `world: "MAIN"` (111), `:has`, container queries, CSS Highlights, `checkVisibility`; `chrome.*` APIs. |
| **Shaped** | Terse CSS (derived colour scales, `:has()` keyed composition, container-query layouts), with no fallback styles for older engines. |
| **Classification** | **Deliberate design** for a Chrome extension audience. **Gap:** the manifest does not declare `minimum_chrome_version`, and the build target says 109 (PKG-01). |
| **With full access** | Follow the game's supported-browser matrix. Most features used are Baseline in current Chrome, Edge, Firefox and Safari [Assumption: verify against current compatibility data]. `::highlight()` and `caretPositionFromPoint` are the ones to check. |
| **Removal** | Not a removal, but align targets: set `minimum_chrome_version: "111"` and the esbuild target to `chrome111` (non-behavioural). |

### C17. No access to the art pipeline

| | |
| --- | --- |
| **Evidence** | §1.8 provenance: <ul><li>atlases vendored from a personal sprite repository;</li><li>village and zone art imported from sibling repositories;</li><li>many families AI-generated;</li><li>generator inputs not tracked (`sources/`, `themes-v2/`, `source-v4/`);</li><li>generated CSS (`card-button-atlas.css`, `COMPACT_GEOMETRY`);</li><li>the `audit-sprite-windows.mjs` gate.</li></ul> |
| **Shaped** | <ul><li>Giant sprite atlases with percentage windows.</li><li>Three-slice bands to keep frame ends undistorted.</li><li>Exact-alpha registration for state art.</li><li>A 142.8 MB release with 60.8 MB unreachable (SIZE-01).</li><li>95.6 MiB decoded gear atlas (PERF-07).</li></ul> |
| **Classification** | **Workaround.** |
| **With full access** | Use the game's own asset pipeline: per-item icons (or smaller atlases) from the CDN, SVG/CSS for frames where possible, and art generated and reviewed under the game's content policy. |
| **Removal** | <ol><li>Drop `exact-v3` from packaging (§6.8).</li><li>Replace the atlases with game assets.</li><li>Retire the import scripts and generated CSS.</li></ol> |

### C18. Committed, unminified bundle

| | |
| --- | --- |
| **Evidence** | `CLAUDE.md` ("`dist/content.bundle.js` is committed, and CI fails if it is stale"; "deliberately un-minified for readability"); the build's soft budget warning. |
| **Shaped** | Every `src/` change requires a rebuild and a commit of `dist/`. Reviewers can audit exactly what ships. The bundle is 668 KB (48.6% CSS). |
| **Classification** | **Deliberate design** for auditability of an extension (store reviewers and users can read the code). |
| **With full access** | A normal app build: minified, code-split, with source maps. |
| **Removal** | Obsolete in-app. For the extension, keep it; optionally add a minified release build alongside the readable one. |

### C19. Tests cannot use the real app

| | |
| --- | --- |
| **Evidence** | `CLAUDE.md` "Verification discipline": fixtures model the DOM; "No session can verify live; only the user can"; DevTools capture snippets in `claude/`. |
| **Shaped** | <ul><li>47 standalone suites: jsdom for logic, Playwright for layout and cascade.</li><li>Synthetic DOM shapes copied from live captures.</li><li>Negative controls ("a check reporting zero is broken").</li><li>A mobile audit harness and a perf harness against synthetic pages.</li></ul> |
| **Classification** | **Workaround.** It is also a disciplined test strategy given the constraint. |
| **With full access** | Component tests against real components; visual regression (Playwright screenshots) on the real app in CI; contract tests for APIs. |
| **Removal** | Port the assertions that describe **behaviour** (flush quiescence becomes render counts; teardown becomes flag switching; rule-5 state checks). Drop fixture-specific DOM modelling. |

### C20. Performance budget on an always-ticking idle game

| | |
| --- | --- |
| **Evidence** | Perf harness on a "ticking 15k-node page"; measured costs in `docs/traps/performance.md` [Project record]; PERF-01…07. |
| **Shaped** | <ul><li>**Flush and DOM work**: flush budget; caches; no layout reads in loops; rAF coalescing; one sweep per flush; the rendered-host check deferred behind a containment test (V2 timer).</li><li>**Progress smoothing**: CSS transitions instead of JavaScript animation.</li><li>**Open cost**: infinite decorative loops remain (PERF-01).</li></ul> |
| **Classification** | **Design.** |
| **With full access** | The budget stays, but the tools change: React profiling, memoisation, list virtualisation (inventory), and pausing animations when panels are hidden. |
| **Removal** | Not removable; re-baseline in-app. |

### C21. Responsive behaviour within the game's layout

| | |
| --- | --- |
| **Evidence** | `V1.6.0_MOBILE_LAYOUT_AUDIT.md`; `docs/traps/mobile.md`; Tailwind-aligned breakpoints plus component breakpoints; `cqi` font fitting with measured constants (`k = 28.1`, `23.25`, `22.5`, `20.9`). |
| **Shaped** | Container queries where panel width is independent of viewport width. Measured font-fitting constants for single-row menus. The Toolkit link hidden below 768 px. |
| **Classification** | **Workaround** (the game's grid could not be changed). |
| **With full access** | Adjust the game's grid and menus directly, share breakpoint tokens between theme and layout, and avoid measured magic constants. |
| **Removal** | Replace `cqi` formulas with layout changes (e.g. overflow menus). |

### C22. Accessibility can only be layered on

| | |
| --- | --- |
| **Evidence** | `font-size: 0` + `content: attr()` label replacement; clip-hidden native sections plus visible mirrors; `aria-hidden` mirrors; focusable `<p>` triggers (A11Y-01/02/03). |
| **Shaped** | Native semantics were preserved wherever possible: controls, labels, ARIA state untouched. Where visual copy had to differ, mirrors or generated content were used, with trade-offs. |
| **Classification** | **Workaround.** |
| **With full access** | Render the cleaned text as real text, use proper roles (`button` for triggers), and use a single source for each piece of content. |
| **Removal** | Part of the component migration (§6.7 phase 3). |

### C23. Legal and ownership boundaries

| | |
| --- | --- |
| **Evidence** | <ul><li>Game art re-hosted (§1.8).</li><li>An outbound Toolkit link in the game's navigation (SEC-09).</li><li>Skin-authored gameplay statements (CONT-01) and invented terminology (CONT-02).</li><li>Fonts without bundled licence text.</li><li>AI-generated art.</li></ul> |
| **Shaped** | The content choices listed above. |
| **Classification** | **Policy constraint.** It needs owner decisions, not code. |
| **With full access** | IdleWorlds decides which art, copy, links and terminology are official. |
| **Removal** | Decision checklist in Chapter 6 §6.9. |

### C24. Tooling depends on local environments and sibling repositories

| | |
| --- | --- |
| **Evidence** | <ul><li>Windows PowerShell scripts (`make-exact-button-states.ps1`, `make-source-preview-button-states.ps1`).</li><li>Python builders (`build-compact-buttons.py`, `build-revised-buttons.py`).</li><li>Import scripts that default to `../idleWorlds-game-sprites-BC` and `../idleWorlds-art-source`.</li><li>A real browser profile for the live header audit (`build-tools/header-live-profile/`, SEC-07).</li></ul> |
| **Shaped** | Art cannot be rebuilt from a clean clone. Live audits depend on a logged-in local profile. |
| **Classification** | **Workaround.** |
| **With full access** | A reproducible asset pipeline in CI; test accounts for live audits instead of personal profiles. |
| **Removal** | <ol><li>Vendor the source art into an asset repository.</li><li>Port the PowerShell to Node.</li><li>Document the Python dependencies.</li><li>Delete personal profiles from working copies.</li></ol> |

## 4.3 Which workarounds are safe to remove **today** (still as an extension)

These need no IdleWorlds source access:

| Item | Change | Risk | Verify with |
| --- | --- | --- | --- |
| Unreachable `exact-v3` art (SIZE-01) | Exclude `^assets/skills-ui/buttons/exact-v3/` in `package-release.mjs`. Optionally delete the `else` branch in `SkillsArtService.applyThemeVariables`, or keep it as a guarded fallback | None while all 9 themes are in `revised-v5/index.json` | `npm test` (`zone-themes`, `revised-button-atlas`), `npm run package`, a load-unpacked smoke check |
| Metadata JSON in the zip | Add `registration.json`, `verification.json`, `index.json` (non-runtime ones), `zone-theme-map.json` and `buildings.json` to `EXCLUDE`. **Keep** `skills_*_index.json`, `gear_icons_manifest.json` and `item_icons_index.csv` (fetched at runtime) | Excluding a runtime-fetched index breaks icons | `extension-e2e.test.mjs` |
| Dead CSS | §3.13 step 1 | None (proven dead) | `npm test`, fixtures |
| Browser targets | Add `minimum_chrome_version: "111"`; esbuild `chrome111` | None | `npm run build` (the bundle may change slightly; commit `dist`) |
| Font licence | Add `assets/fonts/OFL.txt` and credits | None | — |
| Hydration probe (C3) | Keep until the game provides a public signal | — | — |
