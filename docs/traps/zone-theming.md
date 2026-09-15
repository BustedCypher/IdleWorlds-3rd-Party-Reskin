# Zone theming

Per-zone header art, the nine environment palettes, the `--iw-th-*` token layer and its derived frame scale.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

**The header background is per-zone AND per-viewport.** `HeaderRenderer.
applyZoneSurface()` sets TWO inline vars on the header root for the current
zone (read from the `data-iw-ui="zone-title"` label, "🧭 Zone 19: …", strip the
leading icon run first): `--iw-header-surface` → the wide 4:1 strip
`assets/header/zones/zone_<N>.webp`, and `--iw-header-surface-mobile` → the 7:8
portrait crop `zone_<N>_mobile.webp`. Both fall back to
`assets/header/header_surface.webp` for a zone past `ZONE_SURFACE_MAX` or before
the label classifies. `header.css` paints `--iw-header-surface` on
`[data-iw-header="root"]` normally and swaps to
`var(--iw-header-surface-mobile, var(--iw-header-surface))` inside
`@media (max-width: 768px)` — the wide strip `cover`s into the tall stacked
phone header as an unrecognisable sliver, the portrait crop is composed for it.
The desktop/mobile choice is PURE CSS: a viewport change needs no JS, and a
non-matching `@media` block's background image is not fetched, so desktop never
downloads the mobile set. `applyZoneSurface` runs every `iw:dom-flush` but only
rewrites when `root.dataset.iwZone` changed; teardown clears `data-iw-zone` and
(via `ASSET_VARS`, which lists both vars) the inline styles. `ZONE_SURFACE_MAX`
is 34 — bump it when art past 34 lands. `tests/zone-headers.test.mjs` pins that
every zone 1..34 has BOTH files; `tests/smoke.test.mjs` pins both vars set +
torn down; `render-fixtures.mjs` verifies the media-query swap by filename at
390px vs 1400px.

**The zone label is GAME-ROUTE ONLY, so the zone has to be REMEMBERED.** Both
consumers — `applyZoneSurface` (header artwork) and `applyZoneTheme` (the whole
`--iw-th-*` palette on `<html>`) — read it from the `data-iw-ui="zone-title"`
label, which lives in the zone bar, which only the Game route mounts. Reading it
fresh every flush therefore returned null the moment the player opened Market,
Village, Leaderboards or Dungeon: the header fell back to the generic
`header_surface.webp` and `<html>` was reset to `data-iw-zone-theme="default"`,
so **every tab except Game rendered un-themed** while Game looked right — which
reports as "the theme doesn't work on the other pages", not as a zone-resolution
bug, and it hid behind the fact that the Game route always looked correct.
`currentZoneNumber()` now keeps the last value it actually read
(`lastZoneNumber`): the player's zone is game state and does not change because
they opened a tab. `clearHeaderRenderer()` resets it, so the kill switch leaves
nothing behind. Pinned across all four routes in
`tests/route-swap-reclassify.test.mjs` — drop the cache and eight checks fail
with `theme=default` plus the fallback surface.

`zone_1..34.webp` (wide) and `zone_1..34_mobile.webp` (portrait) are the real
hand-painted headers, imported from the sibling sprites repo
(`../idleWorlds-game-sprites-BC/assets/zone-headers/environment-focused/` and
`.../mobile/`, `NN-<slug>.png`) by `npm run import:zone-headers` /
`npm run import:zone-headers:mobile` (`build-tools/import-zone-headers.mjs
[--mobile]` — desktop cover-fits to 1792x440 @ q0.80, mobile keeps the native
768x880 @ q0.74; a `NN-slug-vN.png` iteration is used only when it is the sole
file for its zone). Its `previews/` contact sheets show the whole set.

`npm run art:zones` (`build-tools/make-zone-surfaces.mjs`) is now
a PLACEHOLDER-only generator — a procedural canvas matte (mood-driven sky,
celestial body, ridge layers, a name-themed focal structure, particles, grade,
vignette) that writes ONLY zones with no file yet (`--force` to overwrite). Use
it to fill a gap when a new zone ships before its painting does. Replacement
art just needs the same `zone_<N>.webp` name and a wide (~3–4:1) aspect.
`web_accessible_resources` already exposes `assets/*`, so nested
`assets/header/zones/…` needs no manifest change. The zone bar's own
`::before` scene still uses the static `header_surface.webp` — point its
`--iw-zone-scene` at the same per-zone file if that should track too.

**The FRAME chrome is per-zone too, on the same trigger.** The 34 zones group
into nine environment palettes (`glacial`, `infernal`, `verdant`, `celestial`,
`voidborn`, `runic-arcane`, `lunar-spectral`, `tempest-oceanic`, `forged-metal`)
by `assets/skills-ui/zone-theme-map.json` (imported from the sibling repo).
`npm run import:skill-themes` (`build-tools/import-skill-themes.mjs`) writes, per
theme: `assets/skills-ui/theme_<name>.webp` (a high-density remaster with the
SAME logical 860x463 canvas and cell positions as `skills_ui_atlas.webp`, so
`skills_ui_index.json` and the sprite-window audit still describe it) and
`assets/skills-ui/panel_corners_<name>.webp` (the corner_filigree cell baked
into the same logical 176x190 crop-and-mirror sheet `make-panel-corners.mjs` produces,
because `border-image` slices a standalone image and cannot address an atlas
cell). Physical dimensions are multiplied by the map's `pixelRatio` (currently
2), while CSS continues to use the logical dimensions. It also regenerates
`src/modules/zoneThemes.js` — DO NOT hand-edit that
file; `tests/zone-themes.test.mjs` pins it against the JSON and checks every
referenced asset exists.

`HeaderRenderer.applyZoneTheme()` runs on every `iw:dom-flush` beside
`applyZoneSurface`, maps the current zone via `zoneTheme()`, and sets two
variables **inline on `<html>`** (in its own `data-iw-zone-theme` namespace):
`--iw-zone-atlas` (read by `SkillsArtService`'s `--fs-skills-ui-atlas` and the
three inventory sprite windows in `inventory.css`) and `--iw-corner-filigree`
(the `border-image` source in `ui-system.css`, `header.css` and
`tooltip-engine.css`). Traps:

- **`<html>` is outside `document.body`**, which is the single observer's root,
  so writing the attribute + vars there can never feed a flush — no
  changed-only guard needed beyond the `dataset.iwZoneTheme === key` early
  return. `applyZoneSurface` writes to the header (inside body) and DOES need
  its guard; do not copy that reasoning backwards.
- **`base.css` `:root` MUST keep defining both variables.** `border-image:
  var(--iw-corner-filigree) …` is a shorthand — if the var ever resolves empty
  the WHOLE declaration (slice, width, repeat) is dropped and the panel loses
  its corners, not just its colour. The `:root` block is the un-themed fallback
  and the only thing standing between "zone not classified yet" and no frame.
- **Logical geometry is frozen at 860x463.** A theme atlas that isn't pixel-identical
  in layout to `skills_ui_atlas.webp` silently repaints every sprite window
  onto the wrong region (CLAUDE.md, "Atlas sprites are sized in percentages").
  The import tool hard-fails unless the source's physical dimensions equal
  `index.width * pixelRatio` by `index.height * pixelRatio`.
- **The sprite-window audit keys on the atlas.** `audit-sprite-windows.mjs`'s
  `declaresAtlas` regex was widened to also match `skills-ui/theme_<name>.webp`
  and `var(--iw-zone-atlas`; without that, switching `inventory.css` to the var
  would have SILENTLY dropped three windows from the check (still >0, so no
  hard fail — exactly the "a check reporting fewer is broken" failure mode).
- Teardown: `clearHeaderRenderer` deletes `data-iw-zone-theme` off `<html>`
  and the `querySelectorAll('*')` + `ASSET_VARS` loop (now listing the two
  vars) clears the inline props. Smoke test pins both the set (zone 19 →
  `voidborn`) and the teardown.

**The CSS chrome recolours with the zone too — via a token layer, no JS.**
`base.css` `:root` defines `--iw-th-*` (accent, accent-dim, edge, hairline +
hairline-hi, bracket + bracket-dim, brass, rule, rule-soft, plate, cta +
cta-hi, ground-a/-b, ground-wash, glow) with defaults that reproduce the stock
"Ashen Iron" brass/ember EXACTLY, then aliases the old names onto them
(`--iw-gold: var(--iw-th-accent)`, `--iw-ember: var(--iw-th-cta)`,
`--iw-line-hot: var(--iw-th-rule)`). Nine `:root[data-iw-zone-theme="…"]` blocks
(also in `base.css`, right after the atlas/filigree `:root` block) re-point the
layer per environment. They key on the SAME `data-iw-zone-theme` attribute
`HeaderRenderer.applyZoneTheme()` already sets on `<html>` — pure cascade,
zero extra JS. `:root[data-…]` is `(0,1,1)` so it beats the `(0,0,1)` default;
HeaderRenderer's inline `<html>` vars are only `--iw-zone-atlas` /
`--iw-corner-filigree` and never collide.

The six sheets had ~30 literal brass/gold/ember hexes (frame borders `#6B4F28`
/ `#4B3D26` / `#6B5527`, hairline stops `#9B7437` / `#D09A4B`, header brackets,
the `#171713→#0D0E0C` panel ground, the ember nav-tab / send-button / zone-Next
/ active-filter CTAs) — all now `var(--iw-th-*)`. What was deliberately LEFT
literal: every state / identity colour — requirement-unmet red `#D58282`,
`--fs-quest-accent` and its `color-mix` expressions, `--fs-skill-accent` mixes,
tier `--iw-t-*`, `--iw-good/bad/info`, the `.fs-cat-*` inventory category hues,
`.fs-inv-row.is-equipped` brass (rule 5 — it's the equipped signal, and a
themed blue would collide with the gear-category rail), `.iw-xp__fill--ready`
green, and `--hd-teal*` zone-control team colour. The ground gets a
faint additive `--iw-th-ground-wash` layer (prepended to the `background:`
shorthand; `transparent` un-themed = no-op).

**The INNER frames are a derived scale, not nine more hand-picked rows.** The
"near-neutral structural darks read fine untinted" call above was wrong at page
scale: `--iw-th-edge` themed the panel's OUTER 1px frame while every box inside
it — the feed, the queue, the progress track, tooltip section rules, the nav
rail, the skill/inventory control plates — stayed brass-brown, so a glacial or
voidborn zone rendered a blue panel full of brown boxes. `base.css` now carries
a three-step scale under the accent layer, `--iw-th-edge-mid` (inner box frame)
/ `-soft` (recessed plate, rail, column rule) / `-faint` (hairline divider,
control plate edge), and ~45 literal hexes across the five injected sheets read
it. Details that matter:

- The nine palettes declare **only** `--iw-th-edge`; ONE
  `:root[data-iw-zone-theme]` block (bare attribute, no name) derives the whole
  scale from it with `color-mix(… , var(--iw-ink-850))`, so a palette added
  later inherits the frames for free. Custom properties resolve lazily, so
  source order against the palette blocks is irrelevant — both are `(0,1,1)`
  and they never declare the same token.
- The `:root` defaults are the exact stock hexes, so a zone that has not
  classified yet still draws the brass frame it always did.
- `--iw-line` / `--iw-line-hi` are re-pointed in that same block **on purpose**:
  `base.css` feeds them to the game's own Tailwind tokens (`--border`,
  `--panel-border`, `--surface-border`, `--sidebar-border`), so this is what
  carries the zone colour into every edge the skin never classified.
- `SkillPanelRenderer.FORGE` writes the skill control plate INLINE with
  `!important`, which no stylesheet can override — its `border` / `liveBorder`
  are therefore `var(--iw-th-edge-faint, …)` / `var(--iw-th-brass, …)` strings.
  An inline `var()` still resolves against the cascade, so the `<html>` attribute
  reaches it. The CSS mirror (`--fs-forge-line`) and the `render-fixtures.mjs`
  copy must move with it — all three, as ever.

Verification: `render-fixtures.mjs` now cycles all nine palettes on `<html>`,
asserts each one actually re-points the tokens (not a silent fall-through) and
that accent text keeps ≥3:1 on the ground, and writes `fixtures/themes.png`.
`tests/zone-themes.test.mjs` pins that every theme has a `:root[data-…]` block
defining the core tokens, plus the derived frame block. `tests/smoke.test.mjs`
still pins the `<html>` attribute + teardown from phase 1.

**Two check-shaped traps this layer produced, both the "a check that cannot
fail" family:**

- **A computed custom property is the un-evaluated token stream.** Reading
  `getComputedStyle(html).getPropertyValue('--iw-th-edge-mid')` returns the
  literal `color-mix(in srgb, #123C48 66%, #10100D)` TEXT, not a colour — an
  unregistered custom property is not resolved at computed-value time. That
  string differs per theme, so a distinctness check on it passes even when the
  expression is malformed and paints nothing. `render-fixtures.mjs` therefore
  paints the tokens onto a probe's four `border-*-color`s and reads those back,
  which always resolve to a real colour.
- **`/--iw-th-edge\b/` also matches `--iw-th-edge-soft`** — `-` is a word
  boundary — so the "every derived token is a function of `--iw-th-edge`" count
  stayed above its floor with a token pinned back to a literal, and the negative
  control passed when it should have failed. The test matches
  `/var\(--iw-th-edge\)/` exactly.

Not themed: the standalone `skills_xp_plaque_wide.webp` (a `border-image`
source — would need nine sliced sheets like the corner filigree) and
`.iw-btn--primary` reads weak for the darker CTAs (it may be a dead skin
class — check before tuning).
