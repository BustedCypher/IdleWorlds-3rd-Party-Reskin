# Generated data: do not edit

Every file here is written by a script in [`../tools/`](../tools/). Regenerate after any change to `src/` or `assets/` (see [chapter 13 §13.7](../13-verification.md#137-regenerating-everything-in-this-package)).

| Path | Written by | Contents |
| --- | --- | --- |
| `theme-css/01-base.css` … `07-ui-system.css` | `export-theme-css.mjs` | The seven stylesheets, in injection order, byte-identical to what the extension injects apart from asset URLs (default base `/fantasy-skin/`). Verified against `dist/content.bundle.js` |
| `theme-css/manifest.json` | `export-theme-css.mjs` | Order, source files, byte size, sha256 of each sheet; every asset the CSS references, and whether it exists |
| `theme-constants.json` | `export-theme-constants.mjs` | `htmlRoot` (the `<html>` attributes and inline properties per zone theme); `zoneThemes`; `header` (crest, zone paintings per zone, fallbacks); `skillsUi` (the 33 atlas custom properties); `skillIcons`; `itemAtlases`; `skillMeta`; `skillButtonFinalInline` and the readout/ingredient maps; `skillPatterns`; `skillCardV2`; `questDiscipline`; `navigation`; `worldBosses`; `itemDisplay`; `village`; `progressCadence`; `runtimeAssets`; `skinAttributes` (`usedByCss` / `presenceOnly` / `bookkeeping`); `backgroundRepaint`. The atlas, theme and icon values are cross-checked against the real `SkillsArtService` |
| `css-structure-contract.md` | `css-structure-contract.mjs` | Every child / sibling / `:has(>…)` / positional relationship the CSS requires, grouped by hook, with the source file and line |
| `golden/` | `golden-examples.mjs` | `<surface>.before.html` / `.after.html` for 13 surfaces on `/`, `/housing` and `/market`, plus each route's `html-root.after.json` |

Asset URLs in every generated file use the default base `/fantasy-skin/`. To use another base, pass `--asset-base=/your/base/` to both exporters. The golden files keep `/fantasy-skin/`.
