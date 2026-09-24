# 3. The global layer: CSS, assets, `<html>` state, zone theme, fonts, repaint, inline styles

Everything in this chapter applies to every route. Build it first. Each surface chapter assumes it is in place.

## 3.1 What the global layer is

| Piece | What it does | Section |
| --- | --- | --- |
| Seven stylesheets | The entire visual theme | §3.2 |
| `assets/` | Fonts, sprite atlases, frame art, zone paintings, village art | §3.3 |
| `<html>` attributes + inline custom properties | Zone palette, frame art, button art, card design switch | §3.4, §3.5 |
| Background repaint | A fixed colour map on specific game surfaces | §3.7 |
| Inline-style helper | How to write the extension's inline declarations from React, including `!important` | §3.8 |

## 3.2 Shipping the CSS

### What to ship

Ship the seven files in [`generated/theme-css/`](generated/theme-css/), produced by [`tools/export-theme-css.mjs`](tools/export-theme-css.mjs). The export:

- runs the extension's exact build transform on `src/styles/*.css`;
- concatenates the files the way the extension does at runtime;
- rewrites every asset URL to your asset base;
- **verifies each file against the string the committed extension bundle embeds**, and fails on any drift.

| Order | File | Sources (concatenated with `\n`) | Extension's `<style data-iw-style>` id |
| --- | --- | --- | --- |
| 1 | `01-base.css` | `base.css` | `base` |
| 2 | `02-tooltip-engine.css` | `tooltip-engine.css` | `tooltip-engine` |
| 3 | `03-inventory.css` | `inventory.css` | `inventory` |
| 4 | `04-skillpanel.css` | `skillpanel.css` + `skillcard-v2.css` + `skillcard-v2-runtime-safe.css` + `card-button-atlas.css` + `card-buttons.css` | `skillpanel` |
| 5 | `05-header.css` | `header.css` | `header` |
| 6 | `06-overlay.css` | `overlay.css` | `overlay` |
| 7 | `07-ui-system.css` | `ui-system.css` + `compact-buttons.css` + `village-scene.css` + `collapsible.css` | `ui-system` |

To regenerate with your asset base (the default is `/fantasy-skin/`):

```bash
node handoff/native-render-migration/tools/export-theme-css.mjs --asset-base=/static/fantasy-skin/
```

### Rules

1. **Link, don't import.** Do not `import` these files into your bundler. Next.js (and any CSS pipeline) will re-minify, reorder, merge duplicate rules and possibly drop "unused" selectors. Every one of those changes the cascade.
   - Serve the files as static files: for example `public/fantasy-skin/theme-css/01-base.css` → `/fantasy-skin/theme-css/01-base.css`.
   - Load them with seven `<link rel="stylesheet">` elements.
2. **Order is 01 → 07, and all seven come after every stylesheet the game renders into `<head>`.** `07-ui-system.css` must be the last of the seven. Many ties are settled by source order: `ui-system.css`'s generic control rule is (0,4,1) `!important` and wins over earlier sheets only because it comes last.
3. **Match the extension's position relative to late CSS.** The extension appends its `<style>` elements to the end of `<head>` when it boots, after hydration. Any CSS chunk Next.js inserts later (client-side navigation) lands **after** the theme, as it does today. So:
   - render the seven `<link>`s at the end of `<head>` on first load;
   - do **not** re-hoist them after navigation.

   If a late game chunk ever overrides a theme rule, the parity diff shows it. The fix is then in the game CSS, not in the theme's order.
4. **Only when the theme is on.** With the theme off, none of the seven are in the document. Toggling at runtime adds or removes the seven `<link>`s in one operation.
5. **Check the order in the browser** after any build-pipeline change:

   ```js
   // Last seven entries must be the theme files, in order.
   [...document.styleSheets].map(s => s.href || s.ownerNode?.getAttribute('data-iw-style') || '(inline)').slice(-7)
   ```

   `capture-parity.js` records this list too (`sheets`), and chapter 13 compares it.

### Next.js placement examples

App Router, `app/layout.tsx`:

```tsx
const THEME_CSS = ['01-base', '02-tooltip-engine', '03-inventory', '04-skillpanel', '05-header', '06-overlay', '07-ui-system'];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const skinOn = await isFantasySkinOn();        // your setting (cookie / session)
  return (
    <html lang="en" {...htmlRootProps(skinOn, await currentZone())}>   {/* §3.4 */}
      <head>
        {/* Next's own CSS links render before these. React 19 hoists <link rel="stylesheet">
            that carries `precedence`; do NOT give these a precedence, or React will re-order
            them among the app's own sheets. Verify the order with the snippet above. */}
        {skinOn && THEME_CSS.map(f => (
          <link key={f} rel="stylesheet" href={`/fantasy-skin/theme-css/${f}.css`} data-iw-theme-sheet={f} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

Pages Router: put the same seven `<link>`s last inside `<Head>` in `_document.tsx`, conditional on the setting.

If your framework version still places a stylesheet the app loads at runtime after these, append the seven links from a client component on mount (`document.head.append(...)`). That is literally what the extension does.

## 3.3 Assets

Host the repository's `assets/` directory at `<asset base>/assets/`, **without renaming anything**: the file names are baked into the exported CSS and into the precomputed values.

[`generated/theme-constants.json`](generated/theme-constants.json) → `runtimeAssets` lists every file the shipped theme can request (194 files, about 92 MiB), each with the reason it is needed:

| Group | Files | Needed because |
| --- | --- | --- |
| `assets/fonts/` | 6 woff2 | `@font-face` in `01-base.css` (§3.6) |
| `assets/skills_ui_atlas.webp`, `skills_panel_texture.webp`, `skills_icons_atlas.webp`, `skills_nav_prev.svg`, `skills_nav_next.svg` | 5 | Card frames, medallions, textures |
| `assets/skills-ui/theme_*.webp`, `panel_corners_*.webp`, `separator_flourish_*.webp` | 27 | Per-zone frame art (§3.4) |
| `assets/skills-ui/buttons/revised-v5/*.png`, `compact-ghost-v3/*.png` | 18 | Per-zone button art (§3.4) |
| `assets/skills-ui/buttons/card-v6/*.png`, `assets/skills-ui/action-icons/*.svg` | 12 | Skill card V2 buttons and glyphs (ch. 6) |
| `assets/header/header_crest.webp`, `header_surface.webp`, `assets/header/zones/zone_<1-34>{,_mobile}.webp` | 70 | Header art (ch. 4) |
| `assets/gear_icons_atlas.png`, `assets/item_icons_atlas.png` | 2 (25 MB + 12 MB) | Item icons (ch. 8, 7, 9) |
| `assets/village/building_<1-34>.webp`, `house_<1-5>.webp`, `cobblestone.png` | 40 | Village art (ch. 10) |
| `assets/world-boss/*.png` (4), `assets/world-bosses/*.png` (2) | 6 | World Boss art (ch. 9) |
| `assets/inventory/*.webp`, `assets/quest-frames/approved-frames.png` | 3 | Default filigree, separator, quest frames |
| `*_index.json`, `*_manifest.json`, `*_index.csv` | 5 | Only if you port the resolver code verbatim instead of precomputing (§3.4, ch. 8) |

All assets are same-origin; the theme requests nothing from third-party origins. Serve them with long-lived cache headers and a content hash in the directory name if you version them (`/fantasy-skin/v1.6.0/assets/…`). Re-run both exports with that `--asset-base`.

## 3.4 The `<html>` element

When the theme is on, `<html>` carries four attributes and a set of inline custom properties. Every rule that varies by zone reads them. The exact values for every theme are precomputed in [`generated/theme-constants.json`](generated/theme-constants.json) → `htmlRoot.<theme>`; emit the entry for the resolved theme (§3.5) verbatim.

### Attributes (always present while the theme is on)

| Attribute | Value | Consumed by |
| --- | --- | --- |
| `data-iw-zone-theme` | `default` or one of the nine theme names (§3.5) | `base.css` palette blocks, `card-button-atlas.css`, `skillpanel.css` |
| `data-iw-compact-atlas` | `compact-ghost-v3` | `compact-buttons.css` (all compact button art keys on it) |
| `data-iw-button-atlas` | `revised-v5` | `skillpanel.css` button-art rules |
| `data-iw-skill-card-design` | `new` | every skill card V2 rule, about 300 selectors (ch. 6) |
| `data-iw-native-skin` | `1` | **New.** Tells the extension to stand down (ch. 1 §1.5 rule 9). No stylesheet reads it |

### Inline custom properties

- **Only when the theme is a real zone theme** (not `default`):
  - `--iw-zone-atlas: url("<base>assets/skills-ui/theme_<theme>.webp")`
  - `--iw-corner-filigree: url("<base>assets/skills-ui/panel_corners_<theme>.webp")`
  - `--iw-zone-separator: url("<base>assets/skills-ui/separator_flourish_<theme>.webp")`

  For `default`, **omit all three**. `base.css` supplies the un-themed defaults on `:root`.
- **Always**, computed from the **visual button theme**, which is the zone theme, or `forged-metal` when the theme is `default`:
  - `--iw-compact-atlas: url("<base>assets/skills-ui/buttons/compact-ghost-v3/<visual>.png")`;
  - for each of 12 kinds (`action-idle|hover|clicked`, `action-secondary-idle|hover|clicked`, `chevron-prev-idle|hover|clicked`, `chevron-next-idle|hover|clicked`):
    - `--iw-<kind>: url("<base>assets/skills-ui/buttons/revised-v5/<visual>.png")`
    - `--iw-<kind>-paint: transparent url("…/<visual>.png") <x>% <y>% / <w>% <h>% no-repeat`

  The percentages are fixed per kind and are in the JSON. Example, `default` / forged-metal: `--iw-action-idle-paint: transparent url("/fantasy-skin/assets/skills-ui/buttons/revised-v5/forged-metal.png") 50% 2.4096385542168677% / 140.15151515151516% 321.3333333333333% no-repeat`.

These are **custom properties without priority**, so React's `style` prop on `<html>` handles them (§3.8). Write the numbers exactly as given, full precision. They are string-compared by the parity diff and were cross-checked against the extension's own module when generated.

Example (the golden output for zone 19 is in [`generated/golden/dashboard/html-root.after.json`](generated/golden/dashboard/html-root.after.json)):

```tsx
function htmlRootProps(skinOn: boolean, zone: number | null, route: string) {
  if (!skinOn) return {};
  const theme = presentationTheme(zone, route);          // §3.5
  const state = THEME_CONSTANTS.htmlRoot[theme];          // generated/theme-constants.json
  return { ...state.attributes, 'data-iw-native-skin': '1', style: state.inlineStyle };
}
```

## 3.5 Resolving the zone theme

Mirror `HeaderRenderer.applyZoneTheme()` / `presentationZoneNumber()`:

1. **Presentation zone**:
   - on the Village route (`/housing` or `/ssf/housing`, trailing slash ignored) it is `null`;
   - on every other route it is the player's **current zone number**.
2. **Theme** = `ZONE_THEMES[zone]` ([`src/modules/zoneThemes.js`](../../src/modules/zoneThemes.js), also in `theme-constants.json` → `zoneThemes.byZone`) for zones 1–34. For `null`, or a zone with no entry, it is `default`.
3. **Visual button theme** = theme, or `forged-metal` when the theme is `default`.

| Zones | Theme |
| --- | --- |
| 1, 3, 34 | `verdant` |
| 2, 5, 24 | `forged-metal` |
| 4, 9, 13, 15, 16, 26, 29, 32 | `infernal` |
| 6, 10, 12, 25 | `celestial` |
| 7, 11, 19, 20, 30 | `voidborn` |
| 8, 18, 21, 28 | `runic-arcane` |
| 14, 23, 27 | `lunar-spectral` |
| 17, 31 | `tempest-oceanic` |
| 22, 33 | `glacial` |

One divergence is deliberate. The extension reads the zone from the Game route's `Zone N:` label and remembers the last reading. On a **cold load straight onto** `/market`, `/leaderboards` or `/dungeon`, it has not seen a zone yet, so it shows `default` until the player visits Game.

- **Natively you know the zone, so use it on every route except `/housing`.** That is the extension's stated intent: "the player's zone is game state that does not change because they opened a tab".
- When capturing parity references on those routes, **visit the Game route first** in the same session, so the extension has the zone too.
- Confirm this one divergence with Curtis. It is the only place where the native behaviour intentionally differs from the extension's first-load behaviour.

A zone change (the player moves zone) updates `<html>` immediately. The extension does it on the next flush.

## 3.6 Fonts

`01-base.css` declares these faces, all `font-display: swap`, all served from `<base>assets/fonts/`:

| Family | Weight | Style | File |
| --- | --- | --- | --- |
| Cinzel | 600 700 (variable) | normal | `cinzel-variable.woff2` |
| Barlow | 400 / 500 / 600 / 700 | normal | `barlow-400.woff2` … `barlow-700.woff2` |
| Crimson Text | 400 | italic | `crimson-text-italic.woff2` |

Tokens: `--iw-font-head: 'Cinzel', Georgia, serif`, `--iw-font-ui: 'Barlow', system-ui, …`, `--iw-font-flav: 'Crimson Text', Georgia, serif`.

- Do not preload a different subset. Do not substitute `next/font`: it renames the family, and the CSS asks for `'Cinzel'` by name.
- The skill card's action-label fit (ch. 6 §6.10) re-measures after `document.fonts.ready`, exactly as the extension does.

## 3.7 Background repaint

`BackgroundPainter.js` repaints the game's navy surfaces to the theme's ink tones with **inline `!important`** declarations. It is a fixed map, not a design decision per surface. Reproduce it exactly.

**Which elements are candidates.** Every element that is any of:

- `document.body`;
- a direct child of `<body>`;
- a grandchild of `<body>` that has more than one element child;
- a match for `.compact-panel, .compact-row, [class*="item-row"], [role="dialog"], [role="menu"], [role="listbox"], main, section, article, aside, header, nav`.

**Skipped:**

- `script`, `style`, `link`, `meta`, `head`, `html`;
- `.fs-skill-wrapper`;
- anything inside `.fs-inv-row`, `.fs-skill-header` or `.iw-tip`.

**What is written.** For each candidate, read the **computed** colours with the theme CSS already applied and before any repaint:

- **background-color**: if it is one of the 20 game navies in `theme-constants.json` → `backgroundRepaint.backgroundColorMap`, set `background-color: <mapped> !important` inline. The map is by luminance `0.299R + 0.587G + 0.114B`:
  - under 12 → `#0B0C0A`;
  - under 20 → `#14130F`;
  - under 28 → `#191711`;
  - otherwise → `#1E1B15`.

  All 20 listed navies land in the last two bands.
- **each border side** whose computed colour is one of those navies: set `border-<side>-color: #342D20 !important`. Check each side separately.

The extension also marks each repainted element `data-iw-painted="1"`. That is bookkeeping (§3.10), and no stylesheet reads it.

**Natively.** Which of your elements this hits depends on your own colours, so do not guess:

1. Run `capture-skin-contract.js` on each route.
2. Every node it reports with `data-iw-painted` plus inline `background-color` / `border-*-color` is a repaint target.
3. Emit those inline `!important` declarations from that component when the theme is on (§3.8).

In the fixture, only surfaces whose stock background is Tailwind's `#0f172a` / `#111827` were hit; the live list will be short. If your stock colours ever change, re-run the capture. The extension only repaints **exact** matches.

## 3.8 Writing the extension's inline styles from React

The extension writes three kinds of inline declaration. Use the matching mechanism for each.

| Kind | Examples | Mechanism |
| --- | --- | --- |
| **Custom properties** (`--iw-*`, `--fs-*`), no priority | `--fs-quest-accent`, `--iw-header-crest`, the `--fs-ui-*` atlas windows, `--iw-progress-duration` | React `style` prop: `style={{ '--fs-quest-accent': '#5E8FB7' }}`. React writes custom properties with `setProperty` |
| **Ordinary properties, no priority** | Sprite windows on skin-created icons (`background-image/size/position/repeat`), `display: none` on suppressed inventory branches, fill `width` on skin-created bars | React `style` prop |
| **Ordinary properties with `!important`** | Skill-card control plates, readout and material neutralisation (ch. 6), the background repaint (§3.7) | **`useImportantStyles`** below. React's `style` prop cannot set `!important` |

**Why `!important` must stay inline.** An inline `!important` declaration beats every stylesheet rule, including the theme's own `!important` rules. The skill card depends on that: its button plates must beat `07-ui-system.css`'s (0,4,1) `!important` generic control rule. A stylesheet cannot reproduce the precedence, so **do not move these into CSS in Stage A.**

```tsx
import { useLayoutEffect, useEffect, useRef } from 'react';

// useLayoutEffect on the client (applies before paint), useEffect on the server (never runs).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Apply `styles` inline with !important, exactly as the extension's
 * InlineStyleOwner does. Only the properties listed are touched; every other
 * inline property (the game's own) is left alone. A property dropped from
 * `styles` on a later render is removed, and the game's own value (if React
 * set one through `style`) is not disturbed because React owns different
 * properties. NEVER list a property here that the same element's React
 * `style` prop also sets. Two writers on one property fight on every render.
 */
export function useImportantStyles<T extends HTMLElement>(styles: Record<string, string> | null) {
  const ref = useRef<T>(null);
  const applied = useRef<Set<string>>(new Set());
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = new Set(Object.keys(styles ?? {}));
    for (const prop of applied.current) if (!next.has(prop)) el.style.removeProperty(prop);
    for (const [prop, value] of Object.entries(styles ?? {})) {
      // Compare first: a same-value write is free, but churn is not.
      if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== 'important') {
        el.style.setProperty(prop, value, 'important');
      }
    }
    applied.current = next;
  });
  return ref;
}
```

Rules for the maps you pass in, copied from the extension's own hard-won lessons ([docs/traps/performance.md](../../docs/traps/performance.md)):

- **Never list a shorthand and one of its own longhands in the same map** (for example `background` with `background-color`). The browser reserialises them against each other. The extension drove itself at frame rate this way. The maps in `theme-constants.json` are already clean; copy them, don't merge them.
- Write the **shorthand** where the extension writes the shorthand (`background`, `border`, `padding`). The computed longhands then match.
- Values that contain `var(...)` stay as written. They resolve against the cascade at the element, which is what makes an inline value follow the zone palette (for example `1px solid var(--iw-th-brass, #8A6B2E)`).

**SSR note.** `useImportantStyles` runs only on the client. On the first paint of a server-rendered page, these few controls show the stylesheet's fallback plate until hydration. The extension today shows the stock UI until after hydration *and* classification, so this is strictly earlier. Everything else in the contract (attributes, classes, custom properties, appended nodes) renders on the server.

## 3.9 The duplicated dashboard stacks

Below 1280 px the live copy is `section.grid.gap-3.xl:hidden`; from 1280 px it is the `hidden xl:grid` copy (ch. 2 §2.3). The extension marks only the copy that is rendering, and re-resolves on every breakpoint crossing.

**Natively, render the marks on both copies.**

- A `display: none` subtree paints nothing.
- The theme CSS has no page-level `:has()` that a hidden mark could affect. Every `:has()` is scoped to its own card or frame (checked: `grep -n ":has(" src/styles/*.css`).
- `capture-parity.js` ignores whichever stack is not rendering, so marking both copies diffs clean.

The exceptions are the skin's singletons:

| Singleton | Rule |
| --- | --- |
| Village scene frame | Directly **after** the Skill Actions `.panel` (ch. 10 §10.5). Once per rendered copy is fine; the extension keeps one, after the live copy |
| `<html>` state | Once |
| The Toolkit link | Once per nav track (the nav is not duplicated) |

## 3.10 Required marks vs bookkeeping

The extension writes 145 distinct `data-iw-*` / `data-fs-*` names. [`generated/theme-constants.json`](generated/theme-constants.json) → `skinAttributes` splits them by whether any shipped stylesheet reads them, either as a selector (`[name…]`) or through `content: attr(name)`.

- **`usedByCss` (92 names): emit exactly.** They are what the pixels depend on.
- **`bookkeeping` (53 names): optional.** The extension writes them for its own caches and state machinery:
  - rebuild signatures;
  - `*-pending` flags;
  - ownership markers;
  - a measured-font cache key.

  No stylesheet reads any of them. [`tools/selftest.mjs`](tools/selftest.mjs) proves it: stripping all 53 from a skinned page leaves every computed style identical. `diff-parity.mjs` ignores them unless you pass `--strict-attributes`.

A few bookkeeping names are still **functional for the tooltip engine**:

- `data-iw-item`, `data-iw-item-name`;
- the trigger `tabindex` / `aria-*`.

Keep them wherever that workstream needs them (ch. 1 §1.7).

## 3.11 Never emit

| Mark | Why |
| --- | --- |
| `data-iw-page-hydrated` on `<html>` | Extension-only latch between its two content scripts |
| `<style data-iw-style="…">` | You link the exported files instead |
| `data-iw-order-handle`, `data-iw-skill-design-toggle`, `data-iw-skill-v2-summary`, `-break`, `-expand`, `-tabs`, `-tab`, `data-fs-skill-flavour`, `data-fs-skill-rune`, `data-fs-hidden` | Retired features. The extension only deletes them. (The `:not([data-iw-order-handle])` chains in the CSS stay, for specificity.) |
| `data-iw-*-pending` (`skill-art-pending`, `quest-art-pending`, `quest-icon-pending`) | Async loading states of the extension's art services. Natively the art is known synchronously |
| `#iw-tip` | The tooltip workstream's |
