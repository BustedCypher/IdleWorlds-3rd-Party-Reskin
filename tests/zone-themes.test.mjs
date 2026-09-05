/**
 * zone-themes.test.mjs
 *
 * Pins the per-zone frame theme wiring:
 *
 *   - every IdleWorlds zone (1..ZONE_MAX) resolves to exactly one theme
 *   - src/modules/zoneThemes.js and its committed source of truth,
 *     assets/skills-ui/zone-theme-map.json, never drift apart (the module is
 *     generated from the JSON by build-tools/import-skill-themes.mjs)
 *   - every theme a zone points at has BOTH asset files on disk:
 *       assets/skills-ui/theme_<name>.webp       (the recoloured atlas)
 *       assets/skills-ui/panel_corners_<name>.webp (the border-image sheet)
 *   - THEME_NAMES is exactly the set of themes zones use
 *
 * Negative controls: delete either asset file, or edit one zone's theme in the
 * generated module without the JSON, and the matching check fails.
 */

import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZONE_THEMES, THEME_NAMES, zoneTheme } from '../src/modules/zoneThemes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(await readFile(resolve(ROOT, 'assets/skills-ui/zone-theme-map.json'), 'utf8'));

// The live game has 34 zones; HeaderRenderer.ZONE_SURFACE_MAX tracks the same
// number for the header art. Keep this in step when zones past 34 ship.
const ZONE_MAX = 34;

let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) fail += 1;
};

const exists = async rel => {
  try { await access(resolve(ROOT, rel)); return true; } catch { return false; }
};

// 1. Full coverage 1..ZONE_MAX.
const uncovered = [];
for (let z = 1; z <= ZONE_MAX; z += 1) if (!zoneTheme(z)) uncovered.push(z);
check(`every zone 1..${ZONE_MAX} resolves to a theme`, uncovered.length === 0, `missing: ${uncovered.join(', ')}`);

// 2. No drift between the generated module and the committed JSON.
const drift = [];
for (const [zStr, spec] of Object.entries(map.zones || {})) {
  const z = Number(zStr);
  if (ZONE_THEMES[z] !== spec.theme) drift.push(`zone ${z}: module=${ZONE_THEMES[z]} json=${spec.theme}`);
}
for (const zStr of Object.keys(ZONE_THEMES)) {
  if (!map.zones?.[zStr]) drift.push(`zone ${zStr}: in module, absent from json`);
}
check('zoneThemes.js matches assets/skills-ui/zone-theme-map.json', drift.length === 0, drift.join(' | '));

// 3. Every referenced theme has both asset files.
const used = [...new Set(Object.values(ZONE_THEMES))].sort();
for (const theme of used) {
  const atlas = `assets/skills-ui/theme_${theme}.webp`;
  const corners = `assets/skills-ui/panel_corners_${theme}.webp`;
  check(`theme "${theme}" atlas present`, await exists(atlas), atlas);
  check(`theme "${theme}" corner filigree present`, await exists(corners), corners);
}

// 4. THEME_NAMES is exactly the set zones use.
check('THEME_NAMES covers exactly the themes zones reference',
  JSON.stringify([...THEME_NAMES].sort()) === JSON.stringify(used),
  `THEME_NAMES=${[...THEME_NAMES].sort().join(',')}  used=${used.join(',')}`);

// 5. The un-themed fallbacks the base.css :root block promises still exist.
check('un-themed fallback atlas present', await exists('assets/skills_ui_atlas.webp'));
check('un-themed fallback corner filigree present', await exists('assets/inventory/panel_corners.webp'));

// 6. base.css carries an accent palette block per theme. Every downstream sheet
//    reads --iw-th-* tokens; a missing block would silently fall through to the
//    stock brass for that whole zone. Negative control: drop a :root[data-…]
//    block or one of the required tokens from it and this fails.
const baseCss = (await readFile(resolve(ROOT, 'src/styles/base.css'), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
const REQUIRED_TOKENS = ['--iw-th-accent', '--iw-th-edge', '--iw-th-hairline', '--iw-th-cta', '--iw-th-ground-wash'];
for (const theme of used) {
  const m = baseCss.match(new RegExp(`:root\\[data-iw-zone-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) { check(`base.css has a :root[data-iw-zone-theme="${theme}"] palette block`, false); continue; }
  const body = m[1];
  const missing = REQUIRED_TOKENS.filter(tok => !body.includes(tok + ':'));
  check(`palette "${theme}" defines the core --iw-th-* tokens`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

// 7. The inner frame scale. The nine palettes above set --iw-th-edge and nothing
//    else about frames; everything the skin draws INSIDE a panel (feed, queue,
//    progress track, stat plate, row divider) steps down from it in ONE derived
//    block keyed on the bare attribute, so a palette added later inherits the
//    whole scale. Without it the page mixes a themed outer frame with
//    brass-brown inner boxes in every zone -- and because the fallback values
//    are real colours, nothing errors and nothing looks broken up close.
//    Negative control: delete the block, or one token from it, and this fails.
//    render-fixtures.mjs proves the derived values actually PAINT per theme
//    (a computed custom property would report the un-evaluated color-mix text).
const derived = baseCss.match(/:root\[data-iw-zone-theme\]\s*\{([^}]*)\}/);
check('base.css derives the inner frame scale off --iw-th-edge for every theme', !!derived);
if (derived) {
  const DERIVED_TOKENS = ['--iw-th-edge-mid', '--iw-th-edge-soft', '--iw-th-edge-faint', '--iw-line', '--iw-line-hi'];
  const missing = DERIVED_TOKENS.filter(tok => !derived[1].includes(tok + ':'));
  check('the derived block re-points the whole inner frame scale', missing.length === 0,
    `missing: ${missing.join(', ')}`);
  // Match `var(--iw-th-edge)` exactly, not /--iw-th-edge\b/ -- the latter also
  // matches --iw-th-edge-soft (the `-` is a word boundary), so the count stayed
  // high enough to pass with a token pinned back to a literal. A check that
  // cannot fail is not a check.
  check('every derived frame token is a function of --iw-th-edge',
    (derived[1].match(/var\(--iw-th-edge\)/g) || []).length >= 4,
    'a token pinned to a literal would not follow the zone');
}
// The stock values stay in :root as the pre-classification fallback -- a zone
// that has not resolved yet must still draw a frame, not `unset`.
for (const tok of ['--iw-th-edge-mid', '--iw-th-edge-soft', '--iw-th-edge-faint']) {
  check(`${tok} has an un-themed :root default`, new RegExp(`${tok}:\\s*#[0-9A-Fa-f]{6}`).test(baseCss));
}

console.log(fail === 0 ? '\nPASS' : `\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
