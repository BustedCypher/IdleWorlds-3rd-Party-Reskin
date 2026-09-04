/**
 * zone-headers.test.mjs
 *
 * The per-zone header art comes in two forms:
 *   assets/header/zones/zone_<N>.webp         wide 4:1 strip  (desktop)
 *   assets/header/zones/zone_<N>_mobile.webp  7:8 portrait    (@media max-width:768px)
 *
 * HeaderRenderer.applyZoneSurface() points --iw-header-surface at the first and
 * --iw-header-surface-mobile at the second for every zone 1..ZONE_SURFACE_MAX,
 * so a missing file leaves that zone's mobile (or desktop) header with a broken
 * background and no error. This pins that every zone in range has both, and
 * that the static fallback both vars degrade to still exists.
 *
 * Negative control: delete any zone_<N>.webp or zone_<N>_mobile.webp and the
 * matching check fails. Regenerate with `npm run import:zone-headers` /
 * `npm run import:zone-headers:mobile`.
 */

import { access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Keep in step with HeaderRenderer.ZONE_SURFACE_MAX.
const ZONE_SURFACE_MAX = 34;

let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) fail += 1;
};
const exists = async rel => {
  try { await access(resolve(ROOT, rel)); return true; } catch { return false; }
};

const missingDesktop = [];
const missingMobile = [];
for (let z = 1; z <= ZONE_SURFACE_MAX; z += 1) {
  if (!(await exists(`assets/header/zones/zone_${z}.webp`))) missingDesktop.push(z);
  if (!(await exists(`assets/header/zones/zone_${z}_mobile.webp`))) missingMobile.push(z);
}
check(`every zone 1..${ZONE_SURFACE_MAX} has a wide header strip`, missingDesktop.length === 0, `missing: ${missingDesktop.join(', ')}`);
check(`every zone 1..${ZONE_SURFACE_MAX} has a mobile portrait header`, missingMobile.length === 0, `missing: ${missingMobile.join(', ')}`);
check('the static header-surface fallback exists', await exists('assets/header/header_surface.webp'));

console.log(fail === 0 ? '\nPASS' : `\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
