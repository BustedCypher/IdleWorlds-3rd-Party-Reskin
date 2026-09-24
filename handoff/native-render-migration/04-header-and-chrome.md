# 4. Header, nav rail, notice, zone bar, and the merged chrome frame

**This is the surface phase 1 broke. Read the whole chapter before touching the top of the page.**

Exact golden markup:

- before: [`generated/golden/dashboard/header-chrome.before.html`](generated/golden/dashboard/header-chrome.before.html)
- after: [`generated/golden/dashboard/header-chrome.after.html`](generated/golden/dashboard/header-chrome.after.html)

Background and history: [docs/traps/header-chrome.md](../../docs/traps/header-chrome.md).

## 4.1 What the player sees

```text
┌───────────────────────────────────────────────────────────────┬──┐
│ [crest] IdleWorlds / BustedCypher / title / Combat · Zone     │✉ │  header (zone painting behind,
│         Players online           [gold][ATK·DEF·HP][buffs…]   │🔔│  glass status tiles, square
│                                                               │⚙ │  utility column on the right)
└───────────────────────────────────────────────────────────────┴──┘
┌──────────────────────────────────────────────────────────────────┐
│ 🧭 Zone 19: Eternium Verge  who's here?        [game's notice]    │  row A: zone title/target | notice
│ Next zone target: ATK 287 / DEF 291 …                             │
├──────────────────────────────────────────────────────────────────┤  one divider
│ [GAME][MARKET][LEADERBOARDS][VILLAGE][DUNGEON]  [TOOLKIT↗]   [🌐 ZONES][PREVIOUS ZONE][NEXT ZONE] │  row B
└──────────────────────────────────────────────────────────────────┘
        ONE frame around rows A and B (Curtis's concept art)
```

Below 861 px the frame stacks into one column, in this order: title/target, notice, nav, zone actions.

## 4.2 What phase 1 broke, and the mechanism

The game renders the nav rail, the optional announcement and the zone bar as **three sibling elements of the page shell** (ch. 2 §2.3). The merged frame is not a wrapper element. It is the **shell itself turned into a CSS grid**:

- the zone bar is set to `display: contents`, so its two branches become grid items of the shell;
- the frame is the shell's own `::before`, spanning rows 2–3;
- the divider is the shell's `::after`, pinned to the top of row 3.

The CSS only engages when `data-iw-chrome` marks sit on exactly the right nodes **with exactly the right parent/child relationships** (`07-ui-system.css`, source `ui-system.css:845-985`):

```css
[data-iw-chrome="shell"] { display: grid !important; grid-template-columns: minmax(0, 1fr) auto; row-gap: 0 !important; column-gap: 0 !important; }
[data-iw-chrome="shell"] > header { grid-row: 1; margin-bottom: 12px; }        /* header must be a DIRECT child of the shell */
[data-iw-chrome="shell"] > * { grid-column: 1 / -1; }                           /* every direct child spans by default         */
[data-iw-chrome="zone-bar"] ~ * { margin-top: 12px; }                           /* later SIBLINGS of the zone bar               */
[data-iw-chrome="zone-bar"] { display: contents !important; }                   /* its two children join the shell's grid       */
[data-iw-chrome="shell"] [data-iw-chrome="zone-text"]    { grid-row: 2; grid-column: 1; … }
[data-iw-chrome="notice"]                                { grid-row: 2; grid-column: 2; … }
[data-iw-chrome="nav"]                                   { grid-row: 3; grid-column: 1; … padding/border/background reset }
[data-iw-chrome="zone-actions"]                          { grid-row: 3; grid-column: 2; … }
[data-iw-chrome="shell"]::before { content: ""; grid-row: 2 / 4; grid-column: 1 / -1; border: 1px solid var(--iw-th-edge); … }  /* the frame  */
[data-iw-chrome="shell"]::after  { content: ""; grid-row: 3; grid-column: 1 / -1; align-self: start; height: 1px; … }            /* the divider */
@media (max-width: 860px) { /* single column: rows 2 text, 3 notice, 4 nav, 5 actions; frame rows 2/6; divider row 4 */ }
```

The extension's `HeaderChrome.js` **refuses to merge**, and leaves three separate boxes, whenever the shape differs from what this CSS can place:

1. no rendered `[data-iw-ui="zone-bar"]`;
2. the zone bar's parent (the shell) has no **direct** `<header>` child;
3. the zone bar is the shell's first child;
4. no preceding sibling (after the `<header>`) contains a nav tab;
5. **more than one** element between the nav and the zone bar;
6. the element between them is a `.panel`, is empty, or has more than 260 characters of text;
7. the zone bar does not have **exactly two** element children;
8. one of those two holds the zone title and the other holds the zone actions, and that is not the case.

**Diagnosis of phase 1**, whichever of these happened:

- **(a)** The new header/nav code changed the shell's structure. Any of these trips a refusal and the extension falls back to three boxes:
  - a wrapper around the header, or around nav + zone bar;
  - the nav moved inside `<header>`;
  - a third child in the zone bar;
  - an extra element between nav and zone bar.
- **(b)** The native render emitted the stock markup without the `data-iw-chrome` marks, so the CSS never engages.

The self-test reproduces (b). Deleting only the `data-iw-chrome` marks from an otherwise perfect page gives **123 computed-style differences**, including:

- the nav rail as a standalone 1364×46 box instead of a 1025×32 row;
- the header losing its `grid-row: 1` and 12 px bottom margin.

## 4.3 The shell (`AppShell`)

| Node | Marks (theme on) |
| --- | --- |
| The shell `div` (the parent of header, nav, notice, zone bar and the panel stacks) | `data-iw-chrome="shell"` |

**Structural requirements.** These are the refusal conditions above, stated positively:

- `<header>` is a **direct child** of the shell, and it comes first.
- Next comes the nav rail, also a **direct child**: either the `.panel` whose **direct** children are the tab buttons (the live flat shape), or a `.panel` wrapping a `<nav>` (the wrapped shape).
- Then **zero or one** element: the notice.
- Then the zone bar `.panel`, a **direct child**, with **exactly two element children**: a text branch and an actions branch.
- Then the panel stacks. They become later siblings of the zone bar and get `margin-top: 12px` from `[data-iw-chrome="zone-bar"] ~ *`.

Nothing else may sit between these nodes. Do not wrap any of them.

## 4.4 The header

Live shape (captured; the same as the golden "before"):

```html
<header class="panel p-3.5 sm:p-4">
  <div class="grid gap-3">                                                  ← layout
    <div class="flex min-w-0 items-start justify-between gap-3">            ← identity region
      <div class="min-w-0 overflow-hidden">                                 ← profile
        <p>IdleWorlds</p>                                                   ← brand
        <h1 class="header-player-name"><button title="View your profile">BustedCypher</button></h1>
        <p class="header-player-title">Craftbound Innovator</p>             ← title (optional)
        <p>⚔️ Combat Lv 62 • Zone 19: Eternium Verge</p>                     ← meta
        <button>Players online: 141</button>                                ← online
      </div>
      <div class="flex items-center gap-2">                                 ← utilities
        <button class="header-icon-btn relative" aria-label="Mailbox" title="Mailbox"><svg…/>
          <span class="absolute -right-1 -top-1 … rounded-full bg-ember">3</span>   ← game's unread pill, only while > 0
        </button>
        … more button.header-icon-btn (may be wrapped in div.relative) …
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 min-w-0">                            ← status grid
      <div class="stat-chip">💰 10,957,780</div>
      <button class="stat-chip">ATK 350 • DEF 358 • HP 477</button>
      … buff tiles …
    </div>
  </div>
</header>
```

### Marks

| Node | Attribute / appended node / inline | Value | Rule |
| --- | --- | --- | --- |
| `<header>` | `data-iw-header` | `root` | Always |
| | inline `--iw-header-crest` | `url("<base>assets/header/header_crest.webp")` | Always |
| | inline `--iw-header-surface` | `url("<base>assets/header/zones/zone_<N>.webp")` | `N` = presentation zone (ch. 3 §3.5) when 1–34, else `url("<base>assets/header/header_surface.webp")` |
| | inline `--iw-header-surface-mobile` | `url("<base>assets/header/zones/zone_<N>_mobile.webp")` | Same rule; fallback `header_surface.webp` |
| | `data-iw-zone` | zone number or `fallback` | Bookkeeping (optional) |
| | inline `background-color` / `border-*-color` `!important` | ch. 3 §3.7 | Only if your header's computed colour is a listed navy |
| the header's single child (`div.grid.gap-3`) | `data-iw-header` | `layout` | Only when `<header>` has exactly **one** element child. Otherwise `<header>` itself plays layout and gets no `layout` mark |
| the parent of the profile, inside layout | `data-iw-header` | `identity-region` | |
| **first child of the identity region** (appended) | `<span class="fs-header-crest" aria-hidden="true"></span>` | — | **Prepended**: it must be the region's first child |
| `div.min-w-0.overflow-hidden` | `data-iw-header` | `profile` | The profile block (the `h1`'s wrapper) |
| `h1.header-player-name` | `data-iw-header` | `profile-name` | |
| `<p>IdleWorlds</p>` | `data-iw-header` | `brand` | A direct child of the profile whose text is exactly `IdleWorlds` |
| the first non-empty element **between** name and meta | `data-iw-header` | `profile-title` | Only when one exists |
| the meta line (`Combat Lv N … Zone N:`) | `data-iw-header` | `profile-meta` | |
| the "Players online: N" element | `data-iw-header` | `profile-online` | |
| the utilities container | `data-iw-header` | `utilities` | The identity region's direct child `div` that contains the `.header-icon-btn`s |
| each `button.header-icon-btn` | `data-iw-header` | `utility-button` | Every one, including those inside `div.relative` wrappers |
| the status grid (`.grid.grid-cols-2`) | `data-iw-header` | `status-grid` | |
| each direct child tile | `data-iw-header` | `status-card` | Every direct child that is `.stat-chip`, `button` or `div` |
| | `data-iw-header-stat` | `combat` / `boost` / `timer` / `gold` / `other` | See below. **Re-derive whenever the tile's content changes**: the game reuses tile nodes as buffs start and expire |
| | `data-iw-header-card` | 1-based index | Bookkeeping (optional) |

**Tile kind** (`data-iw-header-stat`) is the first match, in this order, against the tile's text:

| Kind | Rule on the text | Natively |
| --- | --- | --- |
| `combat` | contains `ATK <n> … DEF <n> … HP <n>` | the combat-stats tile |
| `boost` | contains the word `boosted` | the server-wide boost tile ("⚡ Kaelen boosted (5/5) · 8d 11h left") |
| `timer` | contains `<n><d\|h\|m> … left` | any timed buff tile |
| `gold` | the whole text is an amount, optionally behind a glyph (`^[^\w]*[\d,]+$`) | the gold tile |
| `other` | anything else | |

The game's **unread pill** is a `span` with classes `absolute` and `rounded-full`, a **direct child** of the utility button, rendered only while the count is above 0. It stays exactly as the game renders it; the skin adds no mark. `05-header.css` §4d lights the button with `:has(> span.absolute.rounded-full)`. So:

- the pill must stay a **direct child** of the button;
- it must keep both of those classes;
- it must be absent at zero.

**Not a section frame.** The header `.panel` does **not** get `data-iw-ui="section-frame"`: the extension's frame classifier skips anything inside `<header>`. Adding the section frame would paint the forged ground over the zone painting.

## 4.5 The nav rail

The live shape is the **flat** one: route buttons are direct children of the rail `.panel`.

| Node | Marks |
| --- | --- |
| rail `div.panel` (the tabs' parent) | `data-iw-ui="section-frame"`, `data-iw-chrome="nav"` |
| each route button | `data-iw-ui="nav-tab"`, `data-iw-tab="<label>"` (bookkeeping), `data-iw-compact-button="text"`, plus three appended layer spans (below) |
| the active route button **only** | `data-iw-state="active"` |
| **last child of the rail** (appended, after every route button) | the Toolkit link (below) |

- The rail's role is `section-frame`, **not** `main-nav`. In the flat shape the extension first writes `main-nav`, and the frame classifier then overwrites it with `section-frame`. `section-frame` is the final state and the one the CSS is tuned for: `07-ui-system.css` keys the rail on `:has(> [data-iw-ui="nav-tab"])`. There is **no `section-title`**: the rail has no heading.
- **Wrapped shape** (only if your rail wraps its tabs in `<nav>`):
  - the `<nav>` gets `data-iw-ui="main-nav"`;
  - the `.panel` gets `data-iw-ui="section-frame"` and `data-iw-chrome="nav"`;
  - the Toolkit link is appended as the last child of the **`<nav>`** (the tabs' common parent, called the "track").

**Labels** are the button text lower-cased, with any leading and trailing non-alphanumeric run removed (emoji, lock icons, badges). The recognised set is `game`, `market`, `leaderboards`, `village`, `dungeon`. The extension only classifies the rail when at least four of them are present. **Toolkit is deliberately not in the set.**

**Active tab**: the route you are on.

| Route | Active label |
| --- | --- |
| `/`, `/ssf` | `game` |
| `/market` (and `/ssf/market`) | `market` |
| `/leaderboards` | `leaderboards` |
| `/housing` | `village` (the Village route's path is `/housing`) |
| `/dungeon` | `dungeon` |

Exactly one tab carries `data-iw-state="active"`; every other tab has **no** `data-iw-state` attribute (absent, not `""`).

**The three compact layers**, appended inside every tab **and** inside the Toolkit link, after its text:

```html
<span data-iw-compact-layer="idle" aria-hidden="true"></span>
<span data-iw-compact-layer="hover" aria-hidden="true"></span>
<span data-iw-compact-layer="clicked" aria-hidden="true"></span>
```

**The Toolkit link** is the skin's own control, not a game control. It must be the rail's (track's) **last child**:

```html
<a data-iw-nav-link="toolkit" data-iw-ui="nav-tab" href="https://idleworldstoolkit.com"
   target="_blank" rel="noopener noreferrer" title="IdleWorlds Toolkit (opens in a new tab)"
   data-iw-compact-button="text">Toolkit<span data-iw-compact-layer="idle" aria-hidden="true"></span><span data-iw-compact-layer="hover" aria-hidden="true"></span><span data-iw-compact-layer="clicked" aria-hidden="true"></span></a>
```

- It is hidden below 768 px by CSS.
- It is never marked active.
- Whether it stays at all is an open owner decision: SEC-09/B-07 in the technical handover, §6.9 item 3. Ask Curtis, and keep it until he says otherwise.

## 4.6 The notice (the game's announcement)

| Node | Marks |
| --- | --- |
| the single element between the nav rail and the zone bar, when present | `data-iw-chrome="notice"` |

- Its colours and styling stay the game's own (rule 5). It shows whatever the game sends, and a success must not look like a failure.
- On the live (flat-nav) shape it gets **no** `data-iw-header="announcement"`. That role only appears with the wrapped nav, so do not emit it on the flat shape.
- It must satisfy the refusal limits: not a `.panel`, non-empty, 260 characters or fewer. **If your game can send a longer announcement, the extension refuses to merge the chrome while it shows.** Reproduce that: render the three separate boxes (no `data-iw-chrome` marks anywhere) for as long as the notice is over the limit. Curtis may prefer to change this; ask.
- When it appears or disappears, the mark follows it on the same render. The frame stays merged without a notice.

## 4.7 The zone bar

Live shape:

```html
<div class="panel flex flex-col gap-2 p-3 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between">
  <div>                                                           ← text branch
    <p>🧭 Zone 19: Eternium Verge<button>who's here?</button></p>
    <p>Next zone target: ATK 287 / DEF 291 (or Lv 77 in any skill)</p>
  </div>
  <div>                                                           ← actions branch
    <button>🌐 Zones</button><button>Previous Zone</button><button>Next Zone</button>
  </div>
</div>
```

| Node | Marks |
| --- | --- |
| the zone bar `.panel` | `data-iw-ui="zone-bar"`, `data-iw-header="zone-shell"`, `data-iw-chrome="zone-bar"`, inline `--iw-zone-scene: url("<base>assets/header/header_surface.webp")` |
| the text branch | `data-iw-chrome="zone-text"` |
| the element whose text starts with `Zone <n>:` once leading icons are stripped (the title line) | `data-iw-ui="zone-title"` |
| the actions branch | `data-iw-chrome="zone-actions"` |
| `🌐 Zones` | `data-iw-ui="zone-action"`, `data-iw-zone-action="zones"`, `data-iw-compact-button="text"` + 3 layers |
| `Previous Zone` | `data-iw-ui="zone-action"`, `data-iw-zone-action="prev"`, `data-iw-compact-button="text"` + 3 layers |
| `Next Zone` | `data-iw-ui="zone-action"`, `data-iw-zone-action="next"`, `data-iw-compact-button="text"` + 3 layers |
| any other button in the bar that is **not** in the actions row (`who's here?`) | `data-iw-zone-link="1"` |

Notes:

- The three roles on the zone bar node are deliberate. `05-header.css` keys on `zone-shell`, `07-ui-system.css` on `zone-bar`, and the merge on `data-iw-chrome`.
- The zone bar is **not** a section frame; the frame classifier skips it.
- Button tone comes from `data-iw-zone-action`, never from position. The game may reorder or add controls.
- `zone-title` goes on the innermost element carrying the label. If that element's parent has identical text, the parent gets the mark instead, up to two levels, staying inside the bar. In the live shape it is the `<p>` (which also contains `who's here?`).
- A missing `Previous Zone` (zone 1) is fine: mark whichever of the three exist.
- The extension only **recognises** the bar when both a `Zones` button and a `Next Zone` button are present. If the game hides `Next Zone` at the last zone, the extension leaves that bar unskinned and the chrome unmerged. That is a detection limitation, not a design. Natively, render the full marks whenever the bar renders, and tell Curtis this is the one place the native look will be *more* consistent than the extension's.
- The zone bar only renders on the Game route. The theme's zone still resolves on other routes (ch. 3 §3.5).

## 4.8 JSX sketch (Stage A)

```tsx
function AppShell({ children }: { children: React.ReactNode }) {
  const skin = useSkin();
  return (
    <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-3 overflow-x-hidden px-2 py-3 sm:px-4 sm:py-5"
         {...marks(skin.on, { 'data-iw-chrome': 'shell' })}>
      <Header />                 {/* direct child #1 */}
      <MainNav />                {/* direct child #2 */}
      {announcement && <Announcement />}   {/* zero or one element; nothing else here */}
      <ZoneBar />                {/* direct child, exactly two element children */}
      {children}                 {/* the panel stacks */}
    </div>
  );
}

function MainNav() {
  const skin = useSkin();
  const active = useActiveRouteLabel();       // 'game' | 'market' | 'leaderboards' | 'village' | 'dungeon'
  return (
    <div className="panel flex flex-wrap gap-2 p-2" {...marks(skin.on, { 'data-iw-ui': 'section-frame', 'data-iw-chrome': 'nav' })}>
      {ROUTES.map(r => (
        <button key={r.label} onClick={r.go} className={r.className /* unchanged */}
          {...marks(skin.on, {
            'data-iw-ui': 'nav-tab',
            'data-iw-tab': r.label,                                // optional (bookkeeping)
            'data-iw-state': r.label === active ? 'active' : undefined,
            'data-iw-compact-button': 'text',
          })}>
          {r.text}
          {skin.on && <CompactLayers />}
        </button>
      ))}
      {skin.on && <ToolkitLink />}   {/* LAST child */}
    </div>
  );
}

const CompactLayers = () => (<>
  <span data-iw-compact-layer="idle" aria-hidden="true" />
  <span data-iw-compact-layer="hover" aria-hidden="true" />
  <span data-iw-compact-layer="clicked" aria-hidden="true" />
</>);

function ZoneBar() {
  const skin = useSkin();
  return (
    <div className="panel flex flex-col gap-2 p-3 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between"
      {...marks(skin.on, { 'data-iw-ui': 'zone-bar', 'data-iw-header': 'zone-shell', 'data-iw-chrome': 'zone-bar' })}
      style={skin.on ? { ['--iw-zone-scene' as any]: `url("${ASSET_BASE}assets/header/header_surface.webp")` } : undefined}>
      <div {...marks(skin.on, { 'data-iw-chrome': 'zone-text' })}>
        <p {...marks(skin.on, { 'data-iw-ui': 'zone-title' })}>🧭 Zone {zone}: {zoneName}
          <button onClick={showWho} {...marks(skin.on, { 'data-iw-zone-link': '1' })}>who's here?</button></p>
        <p>Next zone target: …</p>
      </div>
      <div {...marks(skin.on, { 'data-iw-chrome': 'zone-actions' })}>
        <ZoneActionButton tone="zones">🌐 Zones</ZoneActionButton>
        {zone > 1 && <ZoneActionButton tone="prev">Previous Zone</ZoneActionButton>}
        <ZoneActionButton tone="next">Next Zone</ZoneActionButton>
      </div>
    </div>
  );
}
```

The header follows the same pattern. Put the prepended crest first inside the identity region:

```tsx
{skin.on && <span className="fs-header-crest" aria-hidden="true" />}
```

## 4.9 Stage B only: real nesting instead of `display: contents`

Once Stage A diffs clean, you may render nav, notice and zone bar inside one real element that draws the frame, replacing the grid-on-the-shell and `display: contents` technique. **This is not a Stage A change**, because it breaks every relationship in §4.2. Do it only if all of the following hold:

1. You port the relevant `ui-system.css` / `header.css` rules to the new structure, in the skin repository (`src/styles/`), and re-export. The theme CSS is never edited in the game repository.
2. The parity diff at 1440, 1100, 861, 860, 768 and 390 px shows no **visual** difference. Expect differences in marks and structure; the boxes and paint must not change.
3. Curtis signs off.

## 4.10 Acceptance for this surface

`diff-parity.mjs` with 0 differences is the gate. These are the facts it checks, stated so a failure is readable:

- One frame border around rows A and B. The nav rail draws no border, padding or ground of its own inside the frame (`border-width: 0`).
- Row A holds the zone title/target (left) and the notice (right). Row B holds the tabs (left) and the zone actions (right), vertically centred on each other (within 3 px). Row A sits above row B. Nothing overlaps.
- The zone title's leading emoji starts on the first nav tab's left edge (±1 px). Both rows use `--iw-chrome-inset: 14px`.
- The merged frame is at most 90 px tall at 1400 px wide (four tabs, one-line notice).
- `who's here?` is a plain text link: no plate, no border, no padding, transparent background.
- The nav rail has no corner flourish.
- At 800 px: title, notice, nav, actions stack in that order without overlap. The notice and the actions each span the frame's inner width. The nav is one row.
- The unread pill: only the button that has the pill pulses. The pill is a red circle with a white number on the button's top-right corner, and the pulse stops when the pill disappears.
- **Refusal parity.** With a third child in the zone bar, or two elements between nav and zone bar, the native render must show the three separate boxes, exactly as the extension does. Easiest: emit no `data-iw-chrome` marks in that case. Better: ensure your markup never produces that shape.

These are the checks in [`tests/header-compact.test.mjs`](../../tests/header-compact.test.mjs), which you can read for the exact measurements.
