/**
 * World Boss "Possible Rewards" icons survive a late item atlas (2026-09-28).
 *
 * The rewards list is rebuilt only when its signature changes. That signature
 * carried `AtlasService.isReady()`, which turns true once EITHER atlas has
 * loaded. When the gear atlas (a JSON manifest) won the race against the item
 * atlas (a CSV index), the list was built with the gloves, the ring and the
 * sword painted, and Trader Token and the Upgrade Orb (item atlas) left as the
 * "◆" placeholder; when the item atlas then landed, the signature was still
 * `…:true`, so they stayed "◆" for the whole session. Found by the native
 * kit's verify-kit, where the extension's own reference render froze 6 of 17
 * icons that way at random.
 *
 * Now the signature carries `AtlasService.revision()`, and UIFoundation
 * re-runs the resolved boss panels on `iw:atlas-updated` / `iw:item-db-updated`
 * (a late atlas changes no DOM, so no flush would follow it).
 *
 * REAL BROWSER (Playwright) with the built bundle; the item atlas index is
 * served 1.5 s late. The test makes NO DOM change after boot.
 *
 * Negative controls, each verified by reverting one part and rebuilding:
 *   - the old `isReady()` signature (listener kept): 6 placeholders remain;
 *   - the new signature without the listener: 6 placeholders remain.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const card = (name, action) => `<div class="compact-panel p-2.5"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-xs font-semibold text-white">🌍 ${name}</p><p class="text-[11px] text-white/50">Solo</p></div><button class="rounded-lg px-3 py-1 text-[11px]">${action}</button></div></div>`;
const page = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0}</style></head><body>
<div id="root" data-skin="default"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px">
  <header class="panel"><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
  <div class="panel p-3.5"><div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">World Bosses</h2></div>
    <div class="space-y-2">${card('Ancient Treant', 'Prejoin')}${card('Abyssal Behemoth', '⏳ Prejoined')}${card('World Eater', 'Prejoin')}</div></div>
</div></div>
<script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.csv': 'text/csv', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
let csvServedAt = 0;
await tab.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
  try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
  catch { return route.fulfill({ status: 404, body: '' }); }
});
// Registered last, so it runs first: only the item atlas's index is late.
await tab.route(/item_icons_index\.csv$/, async route => {
  await new Promise(r => setTimeout(r, 1500));
  csvServedAt = Date.now();
  await route.fallback();
});

const ICONS = () => [...document.querySelectorAll('.iw-boss-reward-icon')].map(icon => ({
  item: icon.closest('.iw-boss-reward')?.getAttribute('data-iw-item'),
  atlas: /gear_icons_atlas/.test(icon.style.backgroundImage) ? 'gear' : /item_icons_atlas/.test(icon.style.backgroundImage) ? 'item' : null,
  placeholder: icon.textContent === '◆',
}));

await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
// The race this test needs: the list is built with gear art before the item atlas lands.
await tab.waitForFunction(() => [...document.querySelectorAll('.iw-boss-reward-icon')].some(i => /gear_icons_atlas/.test(i.style.backgroundImage)), null, { timeout: 20000 });
const early = await tab.evaluate(ICONS);
check('before the item atlas lands: gear art painted, item-atlas rewards are placeholders',
  !csvServedAt && early.some(i => i.atlas === 'gear') && early.some(i => i.placeholder), JSON.stringify(early.filter(i => i.placeholder).map(i => i.item)));

// No DOM change from here on: only the late atlas can repaint them.
await tab.waitForTimeout(3500);
const late = await tab.evaluate(ICONS);
check('the item atlas was served late', csvServedAt > 0);
check(`after it lands: no placeholder left (${late.length} icons)`, late.length >= 14 && late.every(i => !i.placeholder),
  `${late.filter(i => i.placeholder).length} placeholders: ${JSON.stringify(late.filter(i => i.placeholder).map(i => i.item))}`);
for (const id of ['trader_token', 'boss_upgrade_orb']) {
  const own = late.filter(i => i.item === id);
  check(`${id}: item-atlas art on all three bosses`, own.length === 3 && own.every(i => i.atlas === 'item'), JSON.stringify(own));
}
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
if (failures) { console.log(`\nFAIL boss-reward-icons - ${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS boss-reward-icons');
