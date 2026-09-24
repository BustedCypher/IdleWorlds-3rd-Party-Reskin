# 5. Section frames, activity panels, Daily XP Boost, collapsible frames, overlays

Golden markup: [`generated/golden/dashboard/`](generated/golden/dashboard/). The relevant files are `current-action`, `action-log`, `world-chat`, `quests`, `inventory`, `world-bosses`, `skill-actions` and `overlay`, each as `.before.html` / `.after.html`.

## 5.1 Section frames (every route)

**Rule.** Every `.panel` gets `data-iw-ui="section-frame"`, except:

| Excluded `.panel` | Why |
| --- | --- |
| inside `<header>` (including the header itself) | the header paints the zone artwork; a frame's `!important` ground would cover it |
| the zone bar, or anything inside it | it has its own `::before` scene |
| inside a modal (ch. 5 §5.6) | the modal card gets `data-iw-overlay="panel"` instead; the two frames draw differently |
| an activity-panel host (§5.2) | it **also** gets `section-frame`, from the activity rule. Same value, different owner, so the end state is identical |

**Title.** The panel's **first** `h1`–`h4` whose nearest `.panel` ancestor is this panel gets `data-iw-ui="section-title"`. A heading inside a nested `.panel` belongs to the inner panel. A panel with no heading gets no title; that is legal, and it just gets no collapse toggle (§5.5).

**Nesting.** A `.panel` that contains another `.panel` is still marked. The CSS itself strips such outer panels bare: the frame rule carries `:not(:has(:is([data-iw-ui="section-frame"], …)))`, so only the innermost frame paints. Do not try to decide leaf panels yourself.

**Orphan headings (fallback).** A heading with **no** `.panel` ancestor, whose text (leading icons stripped) is exactly one of `Inventory`, `Market`, `Leaderboards`, `Quests`, `World Bosses`, `Village`, `Salvaging`, `Skill Actions` or `Zone Selector`, gets a frame on a nearby container chosen by a size heuristic. Every live panel is a `.panel`, so this should never trigger. If a `capture-skin-contract.js` run shows a `section-frame` on a non-`.panel` element, emit it on exactly that element.

**Where the frame paints.** `07-ui-system.css` draws four layers on every leaf frame:

- the forged ground (`--iw-th-ground-*` gradient plus texture);
- a 1 px `--iw-th-edge` border;
- a `::before` gold hairline;
- a `::after` corner filigree (`--iw-corner-filigree`, per zone).

Frames painted by other rules (the nav rail inside the merged chrome, ch. 4) opt out through `:not([data-iw-chrome="nav"])`. You do nothing for this beyond emitting the marks.

## 5.2 Activity panels: Current Action, Action Log, World Chat

Each activity panel's host is its `.panel`.

| Panel | Host marks | Title | Notes |
| --- | --- | --- | --- |
| Current Action (`#current-action-panel`) | `data-iw-ui="section-frame"`, `data-iw-panel="current-action"` | its heading → `data-iw-ui="section-title"` | the only stable id in the app |
| Action Log | `data-iw-ui="section-frame"`, `data-iw-panel="action-log"` | the label element → `section-title`. **Live, the label is a `<button>`**: `Action Log <span>view all</span>` | |
| World Chat | `data-iw-ui="section-frame"`, `data-iw-panel="world-chat"` | its heading → `section-title` | |

### Header row (all three)

Let the **title branch** be the host's direct child that contains the title.

- **Split header.** This applies when all of the following are true:
  - the title branch is not the title itself;
  - the title branch contains no game control;
  - the title branch's next sibling (skipping the skin's collapse toggle) contains a button or link, or reads `… XP/hr`;
  - that sibling contains no input and no heading.

  Emit:
  - `data-iw-panel-header="split"` on the host;
  - `data-iw-panel-part="header-title"` on the title branch;
  - `data-iw-panel-part="header-tools"` on that sibling.
- **Otherwise** (the live shape for all three: the title and its controls share one row) emit `data-iw-panel-part="header"` on the title branch, and no `data-iw-panel-header`.

### Current Action

| Node | Mark | Rule |
| --- | --- | --- |
| the progress **track** | `data-iw-panel-part="progress"` | The element with `role="progressbar"` or `aria-valuenow` + `aria-valuemax`. Failing that, the **parent** of the first element whose inline style is `width: <n>%` (that parent must not be the host itself) |
| the track | inline `--iw-progress-duration: <seconds>s` | The transition length for the fill (§5.3). Absent until known |
| the track | `data-iw-progress-reset="1"` | For **one animation frame** on the update where the percentage drops (§5.3) |
| the queue block | `data-iw-panel-part="queue"` | Start from the parent of the leaf whose whole text is `Queued`. Walk up at most 3 levels, staying inside the host, and mark the first ancestor that contains a game button and has more than 6 characters of text |

The fill is the track's child. Keep the game's inline `width: N%` on it: the theme never computes or writes progress (rule 5).

### Action Log

| Node | Mark | Rule |
| --- | --- | --- |
| a control whose whole text is `view all` | `data-iw-panel-part="panel-control"` | Only a real `button` or `a`. Live, "view all" is a `span` inside the title button, so **nothing** gets this mark |
| the feed | `data-iw-panel-part="feed"` | See **Feed** below |
| each row | `data-iw-panel-part="feed-row"` | |

### World Chat

| Node | Mark | Rule |
| --- | --- | --- |
| the message input | `data-iw-panel-part="chat-input"` | `input` / `textarea` with placeholder "Message World Chat" |
| the composer | `data-iw-panel-part="composer"` | The nearest ancestor of the input (at most 3 levels, inside the host) that contains a button whose whole text is `Send` |
| the Send button | `data-iw-panel-part="send"`, `data-iw-compact-button="text"`, plus 3 compact layers (ch. 4 §4.5) | |
| feed and rows | as Action Log | |

### Feed (Action Log and World Chat)

1. **Markers** are the leaf elements (`div`, `span`, `p`, `strong`, `time` with no element children) whose whole text is a timestamp `H:MM:SS` / `HH:MM:SS`. If there are none, the leaves whose whole text is `system`.
2. **Feed.**
   - With two or more markers, the feed is their nearest common ancestor.
   - With one marker, it is the host's direct child that contains it.
   - With none, it is the first direct child of the host that meets all of these:
     - it is not the header;
     - it is not the collapse toggle;
     - it has no input, no `form` and no heading.
3. **Rows.** For each marker, the feed's direct child that contains it.

**Natively.** The feed is your message-list container and each message is a row. Emit `feed` on the list and `feed-row` on every message, including messages without a timestamp. The extension marks only rows it can anchor on a timestamp. Where your live feed has rows the extension would miss, run the contract capture and match it exactly.

The CSS gives the feed `overflow-y: auto` and a cap: `max-height: 300px` for the Action Log, `min(46vh, 430px)` for World Chat. That nested scrolling is deliberate (see [docs/traps/performance.md](../../docs/traps/performance.md), "The scrolling stall").

## 5.3 Progress smoothing (Current Action bar; the same rule drives the skill card fill, ch. 6)

The game writes the fill's `width: N%` about every **250 ms**. The theme turns that staircase into motion with a **linear `width` transition whose duration is one tick**. From `07-ui-system.css`:

```css
[data-iw-panel-part="progress"] > * { transition: width var(--iw-progress-duration, var(--iw-action-tick, 1s)) linear !important; … }
[data-iw-panel-part="progress"][data-iw-progress-reset] > * { transition: none !important; … }
```

You supply two facts.

1. **`--iw-progress-duration`** on the track = the tick interval × **1.12**, formatted as seconds with three decimals: `(ms * 1.12 / 1000).toFixed(3) + 's'`. A 250 ms tick gives `0.280s`.
   - The 1.12 overshoot is deliberate. Real ticks jitter between 208 and 335 ms; an exact-length transition finishes early half the time and the bar visibly pauses.
   - The extension measures the interval as the median of the last five width-change intervals, clamped to 60–4,000 ms. It commits only after three samples and rewrites only when the value moves by 15 ms or more. It excludes the interval that spans a completion, and the interval right after one (the first tick of a new action takes about 2×).
   - **Natively you know the interval, so write it directly** from your action timer's period.
   - Before it is known, leave the property absent. `--iw-action-tick: 1s` is the CSS fallback.
2. **`data-iw-progress-reset="1"`** on the track, on the render where the percentage **drops** (an action completed and the next repetition started). Remove it on the next animation frame (`requestAnimationFrame`). The bar then snaps back instead of sliding backwards across a whole tick.

These constants are in `theme-constants.json` → `progressCadence`. The measurement code is `src/modules/ProgressCadence.js`, if you want the extension's exact behaviour.

## 5.4 Daily XP Boost line

In the Skill Actions frame's **heading row** (the frame's direct child that contains the `Skill Actions` title), find the **innermost** `p` / `div` / `span` whose text, with leading icons stripped, matches:

```text
^Daily XP Boost\b .* \+<number>% XP        (case-insensitive; regex in theme-constants.json → navigation.DAILY_BOOST)
```

Give it `data-iw-skill-boost="1"`.

- Only while the copy names a real bonus. A "no boost today" wording must not be marked.
- Only that one node.

The CSS frames it like a met requirement. Natively, emit the mark on your boost line element whenever a boost is active.

## 5.5 Collapsible frames

Every framed panel with a title gets a small chevron toggle that folds it down to its heading bar. The state persists per panel.

### Which frames

Candidate frames are the elements matching:

```text
[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]
```

1. Keep only **leaf** frames: a frame that contains another frame is skipped.
2. For each leaf, the **target** is its closest `.panel`, if that `.panel` contains no other `.panel`. Otherwise the target is the frame itself.
3. De-duplicate by target.

In practice every leaf panel is a target, including the Village scene frame (ch. 10). The nav rail has no heading, so it gets nothing.

### Per target

| Item | Rule |
| --- | --- |
| **title** | The first `[data-iw-ui="section-title"]` in the target. Failing that, the first `[role="heading"]`. Failing that, the first `h1`–`h4` |
| **head** | The target's direct child that contains the title, or the title itself when it is a direct child |
| **key** | `panel:<slug>` when the target or a descendant carries `data-iw-panel` (the first in document order): `panel:current-action`, `panel:action-log`, `panel:world-chat`, `panel:village-scene`. Otherwise `title:<label>`, where `<label>` is the title text with the leading run of non-letter/non-digit characters removed, whitespace collapsed, lower-cased |
| **name** | The same label, **not** lower-cased (e.g. `Skill Actions`, `Action Log view all`); `section` if empty |
| no key or no head | no toggle |

### Marks

| Node | Mark |
| --- | --- |
| head | `data-iw-collapse-head="1"` |
| title | `data-iw-collapse-title="1"` |
| title and every ancestor up to (not including) head | `data-iw-collapse-spine="1"`. None when title **is** head |
| head's **last child** (appended) | `<button type="button" data-iw-collapse="1" aria-expanded="true" aria-label="Collapse <name>" title="Collapse <name>"></button>` |
| target, while folded | `data-iw-collapsed="1"`. Absent when expanded; toggle then reads `aria-expanded="false"`, `aria-label` / `title` = `Expand <name>` |

**Where the toggle ends up.** When the heading is the panel's direct child, head and title are the same element, so the toggle is appended **inside the heading** (`<h2>Market<button data-iw-collapse…></button></h2>`, see `generated/golden/market/market.after.html`). That is exactly what the extension renders; reproduce it.

**Behaviour.**

- Click toggles the target's state. The handler calls `preventDefault()` and `stopPropagation()`.
- Persist the set of folded keys per player. The extension stores `{ "<key>": true, … }` under `chrome.storage.local["iw-collapsed-frames"]`. Use your settings store. Same keys if you want to import a player's extension state (optional).
- **SSR.** Render expanded on the server, then apply the stored state after mount (ch. 2 §2.6), or read it from a cookie server-side.

`collapsible.css` hides every direct child of `[data-iw-collapsed="1"]` except the head and the toggle, and hides everything in the head that is not on the title's spine. So the spine marks are what keep the title visible. Do not skip them.

## 5.6 Overlays and modals

### Modal backdrop

A viewport-covering backdrop gets `data-iw-overlay="scrim"` when **all** of these hold:

- computed `position: fixed`;
- a numeric `z-index` of 20 or more;
- it covers at least 85% of the viewport width and height, starting within the first 15% of each axis;
- it is visible, with a child;
- it reads as a backdrop: a `blur` backdrop-filter, **or** a background colour with alpha ≥ 0.15 and luminance (`0.299R + 0.587G + 0.114B`) below 90.

**Natively**, your `Modal` component's backdrop element gets the mark, provided it meets that test. A transparent full-screen positioning layer does not.

### Modal card

`data-iw-overlay="panel"` goes on the card inside the backdrop:

1. the **outermost** visible `.panel` inside the scrim;
2. failing that, the largest visible descendant, descending up to 3 levels while the candidate still covers at least 97% of the viewport in both dimensions.

Skip the mark when the card is, or is inside:

- a skin-owned surface (`.iw-tip`, `[data-iw-ui]`, `[data-iw-boss]`, `[data-iw-quest-role]`, `[data-iw-skill-role]`, `[data-iw-header]`, `[data-iw-inventory-root]`);
- an already-framed surface (`section-frame`, inventory root, `.fs-skills-section-frame`, `.compact-panel`).

**No other marks inside the card.** `.panel`s inside a modal are **not** section frames. `overlay.css` frames the card on its border box only (no pseudo-elements), because many cards scroll internally.

### Character Stats → Lifetime Stats

Inside a modal card, find the `.compact-panel` that has a **direct child** whose whole text is `Lifetime Stats`, and at least two direct-child rows that each have exactly **two** children where the second is a number (`^-?[\d,.]+$`). Mark:

- the `.compact-panel` → `data-iw-overlay-content="player-stats"`;
- each row's first cell → `data-iw-overlay-role="stat-label"`;
- each row's second cell → `data-iw-overlay-role="stat-value"`.

The CSS sets every label to weight 400 and every value to 700. **Do not match on a specific label** ("Wood Chopped" was once mis-bolded): the rule is structural.

### Contained pop-ups (menus inside a framed panel)

A pop-up gets `data-iw-overlay="popup"` when all of these hold:

- it is visible and `position: absolute` or `fixed`;
- it contains a control;
- it sits inside a framed surface (`[data-iw-inventory-root="1"]`, `[data-iw-ui="section-frame"]`, `.fs-skills-section-frame[data-iw-skills-ui-ready="1"]`, `.compact-panel` or `[data-iw-overlay="panel"]`);
- it has pop-up semantics, which means any one of:
  - `role="menu"`, `"listbox"` or `"dialog"`;
  - an element with `aria-controls="<its id>"` and `aria-expanded="true"`;
  - **the Inventory Filters menu**: the positioned sibling of `button[aria-label="Filter inventory"]` inside the same wrapper, with at least two controls.

Also mark the framed surface's **direct child** that contains the pop-up with `data-iw-overlay-host="1"`. Remove both marks when the pop-up closes.

This is what lifts the Filters menu above the inventory list (z-index 20 / 21). **Never portal these pop-ups to `<body>` to escape the stacking context**; the marks exist precisely so the pop-ups stay where React mounted them.

**Natively.** Your menu components emit `popup` on the open menu and `overlay-host` on the frame's direct child that holds it. Adding `role="menu"` to the Filters pop-up is harmless, and future-proofs the extension too.

## 5.7 Acceptance for this chapter

- Every panel on every route diffs clean in `diff-parity.mjs`, **collapsed and expanded**. Capture both states.
- The Current Action bar glides linearly between ticks and snaps (does not slide) back on completion. Check this by eye. It is motion, so a static capture cannot see it (ch. 13 §13.6).
- A modal: the backdrop is darkened and blurred, the card wears the forged frame, and its buttons wear the generic control plate.
- Inventory Filters: the menu paints above the list.
