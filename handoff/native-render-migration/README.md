# Native-render migration: the Fantasy Skin, rendered by the game itself

| | |
| --- | --- |
| **Prepared** | 2026-09-24, from commit `43d3a7e` on `main` (extension v1.6.0) |
| **For** | the IdleWorlds developer, and the coding assistant doing the port |
| **Goal** | The game renders the Fantasy theme **in its own render pass**, instead of rendering the stock UI and letting the extension decorate it afterwards. **Not one pixel may change.** |
| **Status** | Guidance, generated data and tools. No game code; the game's source was never available to this project. |
| **Verified** | Every tool runs; `tools/selftest.mjs` passes in real Chromium, negative controls included. All results are on **fixtures shaped like the live game**, not on the live game. Live acceptance is chapter 13's procedure. |

## Suggested prompt for your coding assistant

> You are porting the IdleWorlds Fantasy Skin from a browser extension into the game's own React render. The package in `handoff/native-render-migration/` of the `idleworlds-fantasy-skin` repository is the specification.
>
> 1. **The visual result must not change.** The approved look is the shipped extension.
> 2. Work in **Stage A** (chapter 1 §1.3):
>    - ship the seven exported stylesheets unmodified, after the game's CSS;
>    - make each component emit exactly the DOM contract its chapter specifies: attributes, classes, inline styles and appended nodes, in the same positions;
>    - keep every existing game class and every parent/child relationship listed in `generated/css-structure-contract.md`.
> 3. **Never:**
>    - re-derive a value from a screenshot;
>    - "tidy" CSS;
>    - add a wrapper element;
>    - rename a mark;
>    - hardcode game state that the stock UI derives from data.
> 4. Use the exact values in `generated/theme-constants.json` and the exact markup in `generated/golden/`.
> 5. A surface is done only when `tools/diff-parity.mjs` reports no differences against a reference captured on the live game with the extension enabled (chapter 13).
> 6. **Start with chapter 4.** The merged header frame is already broken by phase 1.
> 7. Stop and ask Curtis rather than guess wherever a chapter says "confirm".
>
> The tooltip engine is a separate task and out of scope.

## What went wrong in phase 1, in two sentences

The merged header frame is the **page shell turned into a CSS grid**, keyed on `data-iw-chrome` marks and on strict parent/child relationships, not a wrapper element. Phase 1 either changed that structure or dropped those marks, and the frame fell apart into three boxes. Chapter 4 specifies the exact structure. The self-test reproduces the break: **123 computed-style differences**, the nav rail 1364×46 instead of 1025×32.

## Why this plan removes the guesswork

The extension's visual layer is fully determined by two things:

1. seven stylesheets;
2. a DOM contract: which marks, inline styles and extra nodes appear on which elements.

So:

- **The stylesheets are exported byte for byte** and verified against the shipped bundle. You never touch or re-derive CSS.
- **The contract is specified in four independent ways:**
  - the chapters (the rules, and the state each value comes from);
  - [`generated/golden/`](generated/golden/) (exact before/after markup per surface);
  - [`generated/theme-constants.json`](generated/theme-constants.json) (every computed value, precomputed and cross-checked against the real module);
  - [`tools/capture-skin-contract.js`](tools/capture-skin-contract.js) (the contract for **your** live DOM, node by node, captured from the running extension).
- **Parity is measured, not judged.** [`tools/capture-parity.js`](tools/capture-parity.js) + [`tools/diff-parity.mjs`](tools/diff-parity.mjs) compare 112 computed properties, the box and both pseudo-elements of every skinned element.
- **The method itself is proven.** [`tools/selftest.mjs`](tools/selftest.mjs) freezes the extension's output as static HTML, reloads it with **no extension** and only the exported CSS, and finds **no differences** on any skinned element. It also shows that the phase-1 regression, and missing CSS, are both caught.

## Reading order

| # | Chapter | Read it for |
| --- | --- | --- |
| 1 | [Strategy and rules](01-strategy-and-rules.md) | Stage A / Stage B, where each extension module goes, the ten rules, the forbidden "improvements", definition of done |
| 2 | [Assumed game architecture](02-assumed-game-architecture.md) | What we inferred about your stack and components, where the theme switch goes, SSR/hydration rules, the duplicate panel stacks |
| 3 | [Theme runtime](03-theme-runtime.md) | Shipping the CSS, assets, `<html>` state, zone theme, fonts, background repaint, **inline `!important` from React**, required vs bookkeeping marks |
| 4 | [Header and chrome](04-header-and-chrome.md) | **Start here for the port.** Header, nav rail, notice, zone bar, the merged frame, and why it broke |
| 5 | [Frames, activity panels, collapse, overlays](05-frames-activity-collapse-overlays.md) | Every `.panel`; Current Action / Action Log / World Chat; progress smoothing; Daily XP Boost; collapse toggles; modals and pop-ups |
| 6 | [Skill cards](06-skill-cards.md) | The largest contract: roles, zones, appended nodes, the control plates, derived values, the running fill, long actions |
| 7 | [Quests](07-quests.md) | Quest roles, sigil, discipline accents, command width |
| 8 | [Inventory and Salvage](08-inventory-and-salvage.md) | The row overlay, preserved controls, details model, item icons |
| 9 | [World Bosses and Zone Control](09-world-bosses-and-zone-control.md) | Encounter roles, action states, rewards, the dominion block |
| 10 | [Village](10-village.md) | Route panels, the dashboard scene and ledger, all from the store |
| 11 | [Market and other routes](11-market-leaderboards-other-routes.md) | Market rows; frame-only routes |
| 12 | [Controls, motion, responsive](12-controls-motion-responsive.md) | The generic control plate and its opt-outs, the Tailwind hooks the CSS reads, compact buttons, motion, breakpoints |
| 13 | [Verification](13-verification.md) | Capturing contracts and parity, the width/state matrix, what needs an eye check, CI, regenerating |

## Generated data and tools

| Path | What |
| --- | --- |
| [`generated/theme-css/`](generated/theme-css/) | The seven stylesheets to ship, plus `manifest.json` (order, sources, hashes, referenced assets) |
| [`generated/theme-constants.json`](generated/theme-constants.json) | `<html>` state per theme, atlas windows, button maps, skill/quest/boss tables, the runtime asset list, required-vs-bookkeeping marks |
| [`generated/css-structure-contract.md`](generated/css-structure-contract.md) | Every structural relationship the CSS requires, with file and line |
| [`generated/golden/`](generated/golden/) | Before/after markup for 13 surfaces on three routes |
| [`tools/`](tools/) | The exporters, the capture snippets, the diff, the golden generator, the self-test, and the packager that builds the documentation-only zip (chapter 13 §13.1) |

Everything under `generated/` is produced by a tool. **Regenerate it; never edit it** (chapter 13 §13.7).

## Suggested order of work

1. **Setup:**
   - host `assets/`;
   - ship the seven sheets behind the theme setting;
   - render the `<html>` state (chapter 3).

   Result: every surface looks "partly" themed. That is expected.
2. **Header and chrome** (chapter 4). It is broken today; fix it first and diff it.
3. **Frames, activity panels, collapse** (chapter 5). This touches every panel.
4. **Skill cards** (chapter 6), then **quests** (7), **inventory** (8), **world bosses** (9), **village** (10), **market** (11).
5. For each surface:
   - capture the live contract;
   - implement;
   - diff at every width and state;
   - only then move on.
6. **Coordinate with Curtis** so the extension stands down on pages that render the theme natively (chapter 1 §1.5 rule 9).

## Decisions to confirm with Curtis / IdleWorlds

These are the only places where a native render cannot be identical, or where the extension's behaviour is an owner decision:

| # | Topic | Where | Recommendation |
| --- | --- | --- | --- |
| 1 | The zone theme on a **cold load** of Market, Leaderboards or Dungeon: the extension shows `default` until it has seen the Game route | ch. 3 §3.5 | Use the player's zone everywhere except `/housing` (the extension's stated intent) |
| 2 | Housing perks in the Village ledger: the extension shows them only after a visit to `/housing` | ch. 10 §10.6 | Always show them |
| 3 | An announcement longer than 260 characters: the extension refuses to merge the header chrome while it shows | ch. 4 §4.6 | Keep parity (render unmerged) unless Curtis prefers otherwise |
| 4 | The last zone without a `Next Zone` button: the extension leaves the zone bar unskinned | ch. 4 §4.7 | Render the full marks |
| 5 | The Toolkit link (an outbound link in the game's nav) | ch. 4 §4.5; handover SEC-09 / B-07 | Keep until the owner decides |
| 6 | Skin-authored copy: the World Boss notice, the "Dominion Ward" block, "Possible Rewards" | ch. 9; handover CONT-01 / B-06 | Keep verbatim until the owner decides |
| 7 | The reduced-motion rule also freezes the game's own animations | ch. 12 §12.4; handover FUN-03 / B-03 | Keep for parity |
| 8 | The extension must stand down when the page renders the theme itself | ch. 1 §1.5 rule 9 | `html[data-iw-native-skin="1"]` + an extension update |

## Related material in this repository

- [`handoff/reskin-technical-handover/`](../reskin-technical-handover/README.md): the full technical handover. Its constraints chapter (C1–C24) and Appendices B–D are background for this package. Its Appendix D predates the World Boss button change (ch. 9 note).
- [`docs/traps/`](../../docs/traps/): *why* each non-obvious value is what it is. Every chapter links the relevant file.
- [`CLAUDE.md`](../../CLAUDE.md): the extension's own rules, the source of rules 1, 2, 3 and 5 quoted here.
