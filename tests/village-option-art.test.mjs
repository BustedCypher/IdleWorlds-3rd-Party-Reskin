/**
 * The Village Add-ons Install picker keeps its building art (2026-09-28).
 *
 * decorateSlot() reads each picker option's building name to paint a small
 * icon (`.iw-village-option-art`) into the option's name line. It read the
 * name from the line's FIRST CHILD, and once painted that child is the icon
 * itself: the next pass (live, the one items.json's arrival triggers) read
 * "", resolved no building, and removed the icon it had just drawn. Measured
 * on the kit's housing page: all three icons added at 447 ms, removed at
 * 629 ms. The name is now the line's own text nodes.
 *
 * REAL BROWSER (Playwright), the built bundle, the picker's JSX from the live
 * bundle. items.json is served 1.5 s late (three building records), so the
 * panel is decorated first and the second pass really happens, as live.
 *
 * Negative control, verified by restoring the firstChild read and
 * rebuilding: every option check fails (no icon left).
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const option = (name, qty) => `<button class="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-left"><p class="text-xs font-semibold text-white">${name}<!-- --> <span class="text-white/40">×<!-- -->${qty}</span></p><p class="mt-0.5 text-[11px] text-emerald-200/80">+1 ATK</p></button>`;
const page = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0}</style></head><body>
<div id="root" data-skin="default"><main><div style="padding:12px">
<div class="panel p-3.5"><div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">🏗️ Village Add-ons</h2></div>
  <p class="mb-3 text-[11px] text-white/50">2<!-- --> slot<!-- -->s<!-- --> available (1 per housing tier). Only one of each building type per village.</p>
  <div class="space-y-2">
    <div class="compact-panel p-2.5"><div class="flex items-center justify-between gap-2"><div class="min-w-0"><p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Slot <!-- -->1</p><p class="text-sm font-semibold text-white">Voidiron Archive</p><p class="mt-0.5 text-[11px] text-white/55">+4 ATK • +7 XP/task</p></div><div class="flex shrink-0 flex-col gap-1"><button class="button-secondary px-3 py-1.5 text-xs">Destroy</button><button class="button-secondary px-3 py-1.5 text-xs">Uninstall (100k)</button></div></div></div>
    <div class="compact-panel p-2.5"><div class="flex items-center justify-between gap-2"><div class="min-w-0"><p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Slot <!-- -->2</p><p class="text-xs text-white/40">Empty slot</p></div><button class="button-primary shrink-0 px-3 py-1.5 text-xs">Cancel</button></div>
      <div class="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5">${option('Training Yard', 2)}${option('Mythril Countinghouse', 1)}<div class="space-y-1"><div class="rounded-xl border border-white/5 bg-white/[0.02] p-2 opacity-50"><p class="text-xs font-semibold text-white/60">Voidiron Archive<!-- --> <span class="text-white/30">×<!-- -->1</span></p><p class="mt-0.5 text-[10px] text-white/35">Already installed elsewhere in your village</p></div></div></div></div>
  </div></div>
</div></main></div>
<script>${bundle}</` + `script></body></html>`;

const ITEMS = JSON.stringify({ generatedAt: '2026-09-28T00:00:00Z', items: [
  { item_id: 'construction_building_tier_1', name: 'Training Yard', category: 'Building' },
  { item_id: 'construction_building_tier_5', name: 'Mythril Countinghouse', category: 'Building' },
  { item_id: 'construction_building_tier_11', name: 'Voidiron Archive', category: 'Building' },
] });

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
let itemsServed = false;
await tab.route('**/*', async route => {
  const url = new URL(route.request().url());
  // Late, as live: the panel is decorated first, and items.json's arrival brings the second pass.
  if (url.href.startsWith('https://idleworlds.com/items.json')) { await new Promise(r => setTimeout(r, 1500)); itemsServed = true; return route.fulfill({ contentType: 'application/json', body: ITEMS }); }
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
  try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
  catch { return route.fulfill({ status: 404, body: '' }); }
});
await tab.addInitScript(() => {
  window.__passes = 0;
  new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList?.contains('iw-village-option-art')) window.__passes += 1; })
    .observe(document, { childList: true, subtree: true });
});
await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
await tab.waitForFunction(() => document.querySelector('[data-iw-village-role="option"]'), null, { timeout: 20000 });
// items.json lands; nothing re-decorates the panels until the page next
// changes, which live is the next tick. One harmless change stands in for it.
while (!itemsServed) await tab.waitForTimeout(100);
await tab.waitForTimeout(300);
await tab.evaluate(() => { const s = document.createElement('span'); document.querySelector('main').append(s); setTimeout(() => s.remove(), 150); });
await tab.waitForTimeout(1500);

const r = await tab.evaluate(() => [...document.querySelectorAll('[data-iw-village-role="option-name"]')].map(p => {
  const art = p.querySelector(':scope > .iw-village-option-art');
  return { name: [...p.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('').trim(), art: !!art, first: p.firstChild === art, sprite: art?.style.getPropertyValue('--iw-village-sprite') || '' };
}));
const passes = await tab.evaluate(() => window.__passes);
check(`items.json arrived after the first paint, so there was a second pass (icons painted ${passes} times)`, itemsServed && passes >= 3, `served ${itemsServed}, painted ${passes}`);
check('the installed building resolved against items.json (its name is a tooltip trigger)', await tab.evaluate(() => !!document.querySelector('[data-iw-village-role="name"][data-iw-tooltip-trigger="1"]')));
for (const [name, file] of [['Training Yard', 'building_1.webp'], ['Mythril Countinghouse', 'building_5.webp'], ['Voidiron Archive', 'building_11.webp']]) {
  const o = r.find(x => x.name === name);
  check(`${name}: its icon is still there after the second pass, first in the line, with its own art`, !!o && o.art && o.first && o.sprite.includes(`village/${file}`), JSON.stringify(o));
}
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
if (failures) { console.log(`\nFAIL village-option-art - ${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS village-option-art');
