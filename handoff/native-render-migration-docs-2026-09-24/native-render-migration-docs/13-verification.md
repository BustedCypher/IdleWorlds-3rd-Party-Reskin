# 13. Verification: how to prove a surface is identical

"It looks right" has failed on this project repeatedly. The tools below turn "identical" into a number. **Acceptance for every surface is `diff-parity.mjs` exiting 0** (ch. 1 §1.8).

## 13.1 The tools

| Tool | Runs | What it answers |
| --- | --- | --- |
| [`tools/export-theme-css.mjs`](tools/export-theme-css.mjs) | Node, repo root | The exact seven stylesheets, with your asset base. Fails if they drift from the shipped extension |
| [`tools/export-theme-constants.mjs`](tools/export-theme-constants.mjs) | Node | Every runtime-computed value (atlas windows, per-zone vars, button maps), the asset list, and which marks the CSS reads. Cross-checked against the real module |
| [`tools/css-structure-contract.mjs`](tools/css-structure-contract.mjs) | Node | Every parent/child/sibling/position relationship the CSS requires |
| [`tools/golden-examples.mjs`](tools/golden-examples.mjs) | Node + Playwright | Exact before/after markup per surface, on live-shaped fixtures |
| [`tools/capture-skin-contract.js`](tools/capture-skin-contract.js) | DevTools, **live game with the extension**, extension console context | For **your** live DOM: every attribute, class, inline property and appended node the extension adds, node by node |
| [`tools/capture-parity.js`](tools/capture-parity.js) | DevTools, any page | What the theme **paints**: computed style, box and pseudo-elements of every skinned element |
| [`tools/diff-parity.mjs`](tools/diff-parity.mjs) | Node | Compares two parity captures; exit 0 means identical |
| [`tools/selftest.mjs`](tools/selftest.mjs) | Node + Playwright | Proves the method and the tools, with negative controls |
| [`tools/package-handoff.mjs`](tools/package-handoff.mjs) | Node | Builds the documentation-only zip (§13.7) |

Setup, in this repository:

```bash
npm ci
```

```bash
npx playwright install chromium
```

## 13.2 Capturing the contract on the live game

For each route and state you are porting:

1. Load the live game with the Fantasy Skin extension enabled, at the width you want.
2. **Visit the Game route first** in the session (ch. 3 §3.5), then navigate to the route.
3. Open DevTools. In the Console, open the context dropdown (it says `top`) and choose **IdleWorlds Fantasy Skin**.
4. Paste `tools/capture-skin-contract.js` and press Enter. It takes about 6 seconds. It turns the skin off and back on through the extension's own kill switch, and downloads `iw-skin-contract-<route>-<width>.json`.

**Reading the file:**

| Field | Contents |
| --- | --- |
| `html` | the attributes and inline custom properties on `<html>` |
| `nodes[]` | one entry per game node the skin marks: `surface`, `path` (tag.classes:nth-child chain), `label`, `attributes`, `classes` added, `inlineStyle` (value **and** the native value underneath), `removedAttributes` |
| `appended[]` | each node the skin added: `parentPath`, `position` (first child / last child / between game children), `afterGameChild`, and the full `outerHTML` |
| `volatile[]` | changes the **game** made during the capture (ticking values, removed chat rows). **Not** part of the contract |
| `summary` | counts by attribute, class, inline property and appended class |

**The file contains page text** (player name, chat). Treat it as account data.

## 13.3 Parity: reference vs candidate

**Reference**, on the live game with the extension ON. Same account, route, width and game state as the candidate:

```js
window.IW_PARITY_NAME = 'reference';
// optional: limit to one surface while you work on it
// window.IW_PARITY_ROOT = '[data-iw-chrome="shell"]';
```

Then paste `tools/capture-parity.js`.

**Candidate**, on your native build with the extension OFF or uninstalled:

```js
window.IW_PARITY_NAME = 'candidate';
```

Then paste the same snippet.

**Compare:**

```bash
node handoff/native-render-migration/tools/diff-parity.mjs iw-parity-reference-root-1440.json iw-parity-candidate-root-1440.json --report=diff.md
```

What the diff does:

- **Matches elements** by position (`tag:nth-child` chain from `<body>`). Classes and marks are compared as properties, so a missing class shows on the right node.
- **Compares**:
  - classes;
  - the marks the CSS reads (presence only for the 17 presence-only marks);
  - the box (±0.5 px, `--tolerance`);
  - about 110 computed properties of the element and of its `::before` / `::after`;
  - `<html>` state;
  - which theme faces loaded.
- **Normalises asset URLs**: everything before `/assets/` is dropped, so the extension's `chrome-extension://` art and your CDN art compare equal.
- **Ignores**:
  - the 53 bookkeeping attributes no stylesheet reads (`--strict-attributes` to include them);
  - whichever duplicate dashboard stack is not rendering (ch. 3 §3.9).
- **Exit code**: 0 = identical; 1 = differences, listed in the report.

**Keeping captures comparable:**

- Capture in a **settled** state: no action running, and no chat or log arriving. Motion and live text make boxes differ by design.
- To test a running action, pause it or capture both sides at the same tick. Otherwise exclude the moving nodes:
  - `--ignore=<regex>` matches a node's path or label;
  - `--ignore-prop=transition-duration` is for the progress timing, which you set from the known tick while the extension measures it.
- Feeds (World Chat, Action Log) change constantly. Exclude them:
  - `--ignore-mark=data-iw-panel-part=feed` skips each feed and everything inside it; the panels' frames and headers are still compared;
  - add `--ignore-mark=data-iw-panel-part=progress` for a running bar.
- Same zoom, same device pixel ratio, fonts loaded (the snippet waits for `document.fonts.ready`).

## 13.4 The capture matrix

**Widths:**

- at minimum **1440, 1100, 768, 390**;
- add the breakpoint edges for the surfaces that change there:
  - **1280 / 1279**: the duplicate stack swap;
  - **861 / 860**: the header chrome stacks;
  - **641 / 640**: the quest command block leaves the flow;
  - **761 / 760**: the boss card.

**States:** every state table in chapters 4–11:

| Chapter | States |
| --- | --- |
| 6 | idle, running (short and long), disabled, requirement unmet, locked, readout format cycled |
| 7 | active, work-order, ready, out of skips |
| 8 | each filter, equipped, upgraded, orb, gems ×2, unknown, Filters menu open |
| 9 | respawning, prejoin, prejoined, fighting, defeated; zone red / blue / race / contested |
| 10 | tiers 0, 3, 5; picker open; ledger folded |
| 5 | every panel collapsed and expanded; a modal open |
| 4 | with and without a notice; each route tab active |

## 13.5 What static captures cannot see: check these by eye

| Behaviour | What correct looks like |
| --- | --- |
| Current Action bar and the skill action fill (ch. 5 §5.3, ch. 6 §6.10) | glides linearly between ticks, never pauses mid-tick; on completion **snaps** back instead of sliding backwards |
| Zone Control impact sweep (ch. 9 §9.6) | a short sweep on the changed team's sword when a strength changes; none under reduced motion |
| Unread pulse (ch. 4 §4.4) | only on the button whose pill is showing; stops when the pill goes |
| Hover and press on compact buttons | three-layer crossfade (idle → hover → clicked) |
| Collapse toggles, ledger disclosures, XP line click | the XP line cycles the game's XP format exactly like the hidden readout |
| First paint on a server-rendered page | no stock flash for marks, classes and appended nodes (they are SSR). Only the handful of inline `!important` plates appear on hydration (ch. 3 §3.8) |
| `prefers-reduced-motion: reduce` | nothing moves; states still readable |

## 13.6 Bringing this into the game's CI

1. **While the extension exists**, the live-game-plus-extension captures are the reference. Store them per route, width and state (`reference/<route>/<width>/<state>.json`).
2. Add a Playwright job to the game repository that:
   - boots the game with a seeded account state;
   - applies each state;
   - injects `capture-parity.js` (`page.addScriptTag` + `window.IW_PARITY_NO_DOWNLOAD = true`);
   - reads `window.__iwParityCapture`;
   - runs `diff-parity.mjs` against the stored reference.
3. **After the extension is retired**, the native build's accepted captures become the reference: ordinary snapshot testing. Every Stage B clean-up (ch. 1 §1.3) must keep the diff empty.
4. The skin repository's own suites describe many measured invariants worth porting as component tests:

| Suite | Checks |
| --- | --- |
| `tests/header-compact.test.mjs` | the merged chrome |
| `tests/skill-card-v2-render.test.mjs` | painted-copy traps |
| `tests/quest-command-width.test.mjs` | command block growth |
| `tests/village-scene-layout.test.mjs` | scene geometry at six widths |
| `tests/boss-participation-hit.test.mjs` | the participation link is clickable end to end |
| `tests/collapsible-frames.test.mjs` | collapse |
| `tests/viewport-swap.test.mjs` | the duplicate stack |

## 13.7 Regenerating everything in this package

Whenever the skin repository changes (`src/styles`, `src/modules`, `assets/`), run these from the repository root:

```bash
npm run build
```

```bash
node handoff/native-render-migration/tools/export-theme-css.mjs
```

```bash
node handoff/native-render-migration/tools/export-theme-constants.mjs
```

```bash
node handoff/native-render-migration/tools/css-structure-contract.mjs
```

```bash
node handoff/native-render-migration/tools/golden-examples.mjs
```

```bash
node handoff/native-render-migration/tools/selftest.mjs
```

To hand the documentation over, build a zip of the markdown only:

```bash
node handoff/native-render-migration/tools/package-handoff.mjs
```

This writes `handoff/native-render-migration-docs-<date>.zip`.

`selftest.mjs` must end with `All checks passed.` It proves on a live-shaped page that:

- the contract capture finds the skin's marks;
- the frozen contract plus the exported CSS paints **identically** to the extension (every skinned element, including pseudo-elements);
- omitting all bookkeeping attributes changes nothing painted;
- removing the header chrome marks (the phase-1 regression) is detected;
- omitting the stylesheets is detected.
