/**
 * Salvaging rows wear the Inventory's owned-item row (Curtis, 2026-09-21:
 * "items in the salvage frame in Village aren't using the inventory styling
 * rules - they should have icons, colour codes and item info").
 *
 * The fixture is the game's own Salvaging markup, transcribed from the live
 * bundle (v0.2.0, the `yL.map(...)` list): each item is a whole-row
 * `<button class="compact-row">` whose click selects it for salvage, inside
 * `div.grid.gap-2 < div.compact-panel < div.panel` under `<h2>Salvaging</h2>`.
 * The last page pads with `div.compact-row` "Empty salvage slot" fillers.
 *
 * REAL BROWSER (Playwright), because the failure was the cascade: the row is a
 * <button>, so ui-system.css's generic control plate (0,4,1 !important) beat
 * the inventory shell. Negative controls, each verified by reverting one line:
 *   - drop `:not([data-fs-inv])` from the ui-system.css plate chain and the
 *     rendered row's background-image is the control gradient again;
 *   - drop the salvage branch of resolveInventoryContext and no row renders.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const ITEMS = JSON.stringify({ generatedAt: 'salvage-test', items: [
  { item_id: 'eternium_ore', name: 'Eternium Ore', category: 'Resource', tier: 19 },
  { item_id: 'eternium_gloves_enchant_item_find', name: 'Eternium Gloves Enchant - Item Find', category: 'Consumable', subcategory: 'Enchant Scroll', tier: 19 },
  { item_id: 'iron_sword', name: 'Iron Sword', category: 'Equipment', subcategory: 'Weapon Slot', tier: 4, atk: 12 },
] });

const salvageRow = (emoji, name, meta, qty, variant = '') =>
  `<button class="compact-row w-full py-2 text-left transition hover:border-white/20 hover:bg-white/5">
    <div class="flex items-center justify-between gap-3" style="display:flex;justify-content:space-between;gap:12px">
      <div class="min-w-0"><p class="truncate text-sm font-semibold text-white">${emoji} ${name}</p>
        <p class="text-xs text-white/50">${meta}${variant ? `<span class="ml-1.5 text-purple-300/75">${variant}</span>` : ''}</p></div>
      <p class="shrink-0 text-sm text-white/75">x${qty}</p>
    </div></button>`;

const page = () => `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<script>
  const store = new Map();
  window.chrome = { runtime: { id: 'salvage-test', getURL: p => location.origin + '/' + p },
    storage: { local: { get: async k => (store.has(k) ? { [k]: store.get(k) } : {}),
                        set: async b => { for (const [k, v] of Object.entries(b)) store.set(k, v); },
                        remove: async k => { store.delete(k); } },
      onChanged: { _l: [], addListener(f) { this._l.push(f); }, removeListener(f) { this._l = this._l.filter(x => x !== f); },
                   _emit(c) { for (const f of this._l) f(c, 'local'); } } } };
  window.salvageClicks = [];
</script>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button,a{font:inherit;color:inherit;background:none}body{margin:0}p{margin:0}</style></head><body>
<div id="root" data-skin="default"><main style="display:flex;flex-direction:column;gap:12px;padding:12px;max-width:900px">
  <div class="panel p-3.5" id="salvage">
    <div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">Salvaging</h2><svg class="lucide h-4 w-4 text-ember"></svg></div>
    <div class="compact-panel space-y-3 p-3">
      <p class="text-xs text-white/60">Destroy items into Salvage Material.</p>
      <div class="flex items-center justify-between gap-3"><label>Choose an item</label><div class="flex items-center gap-2"><button type="button"><svg width="16" height="16"></svg></button></div></div>
      <div class="grid gap-2" id="salvage-list" style="display:grid;gap:8px">
        ${salvageRow('&#128220;', 'Eternium Gloves Enchant - Item Find', 'Tier 19 &bull; Consumable', 10)}
        ${salvageRow('&#129704;', 'Eternium Ore', 'Tier 19 &bull; Resource', 114792)}
        ${salvageRow('&#9876;&#65039;', 'Iron Sword', 'Tier 4 &bull; Equipment', 1, '&middot; enchanted &middot; socketed')}
        <div class="compact-row py-2 opacity-25" id="empty-slot"><p class="text-xs text-white/25">Empty salvage slot</p></div>
      </div>
      <div class="flex items-center justify-between gap-3"><p>Salvage page 4/49</p><div><button>Prev</button><button>Next</button></div></div>
    </div>
  </div>
  <div class="panel p-3.5" id="npcs"><div class="mb-2 flex items-center justify-between"><h2>Village NPCs</h2></div>
    <button class="compact-row" id="not-salvage"><div><p>Eternium Ore</p><p>x3</p></div></button></div>
</main></div>
<script>
  for (const b of document.querySelectorAll('#salvage-list > button'))
    b.addEventListener('click', () => window.salvageClicks.push(b.textContent.trim().split(/\\s+/).slice(1, 3).join(' ')));
</script>
<script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.csv': 'text/csv' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === 'https://idleworlds.com/items.json') return route.fulfill({ contentType: 'application/json', body: ITEMS });
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page() });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const tab = await context.newPage();
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await tab.waitForFunction(() => document.querySelectorAll('#salvage-list > button > .fs-inv-row .fs-inv-name .iw-item-ref').length === 3,
    null, { timeout: 20000 }).catch(() => {});

  console.log('\nsalvage rows');
  const state = await tab.evaluate(() => {
    const rows = [...document.querySelectorAll('#salvage-list > button')];
    return {
      rows: rows.map(r => {
        const o = r.querySelector(':scope > .fs-inv-row');
        const cs = getComputedStyle(r);
        return {
          overlay: !!o,
          cls: o?.className || '',
          name: o?.querySelector('.fs-inv-name')?.textContent.trim() || '',
          chips: [...(o?.querySelectorAll('.fs-stat') || [])].map(c => c.textContent.trim()),
          qty: o?.querySelector('.fs-inv-qty')?.textContent.trim() || '',
          details: [...(o?.querySelectorAll('.fs-inv-detail') || [])].map(d => d.textContent.trim()),
          iconPainted: !!o && (getComputedStyle(o.querySelector('.fs-inv-icon')).backgroundImage !== 'none' ||
            o.querySelector('.fs-inv-icon').textContent === '❓'),
          nativeHidden: getComputedStyle(r.querySelector(':scope > div:not(.fs-inv-row)')).display === 'none',
          bgImage: cs.backgroundImage,
          radius: cs.borderTopLeftRadius,
          height: r.getBoundingClientRect().height,
        };
      }),
      emptyRendered: !!document.querySelector('#empty-slot > .fs-inv-row'),
      outsideRendered: !!document.querySelector('#not-salvage > .fs-inv-row'),
      listTagged: document.querySelector('#salvage-list').getAttribute('data-iw-salvage-list'),
      listGap: getComputedStyle(document.querySelector('#salvage-list')).rowGap,
      chromeLeak: !!document.querySelector('#salvage [data-iw-inventory-control], #salvage[data-iw-inventory-root]'),
    };
  });

  const [enchant, ore, sword] = state.rows;
  check('every salvage item row gets the inventory overlay', state.rows.every(r => r.overlay), JSON.stringify(state.rows.map(r => r.overlay)));
  check('the native row content is hidden, not removed', state.rows.every(r => r.nativeHidden));
  check('colour code: enchant scroll / resource / gear',
    /fs-cat-enchant/.test(enchant?.cls) && /fs-cat-resource/.test(ore?.cls) && /fs-cat-gear/.test(sword?.cls),
    state.rows.map(r => r.cls).join(' | '));
  check('names come from the item database, emoji stripped', enchant?.name.startsWith('Eternium Gloves Enchant - Item Find') && ore?.name.startsWith('Eternium Ore'), `${enchant?.name} | ${ore?.name}`);
  check('item info: tier chip and stats', ore?.chips.includes('Tier 19') && sword?.chips.some(c => /ATK \+12/.test(c)), JSON.stringify(sword?.chips));
  check('quantity carried over', enchant?.qty === '×10' && ore?.qty === '×114792', `${enchant?.qty} ${ore?.qty}`);
  check('icon host painted (sprite or fallback)', state.rows.every(r => r.iconPainted));
  check('enchanted / socketed state survives (rule 5)', sword?.details.join(',') === 'Socketed,Enchanted' || sword?.details.join(',') === 'Enchanted,Socketed',
    JSON.stringify(sword?.details));
  check('the generic control plate no longer paints the row', state.rows.every(r => r.bgImage === 'none'), state.rows.map(r => r.bgImage).join(' | '));
  check('rows are flat like inventory rows', state.rows.every(r => r.radius === '0px'), state.rows.map(r => r.radius).join(','));
  check('rows keep the inventory row height', state.rows.every(r => r.height >= 60), state.rows.map(r => r.height).join(','));
  check('the empty-slot filler is not rendered as an item', !state.emptyRendered);
  check('a compact-row button in another panel is untouched', !state.outsideRendered);
  check('the salvage list wears the recessed list frame, gap closed', state.listTagged === '1' && state.listGap === '0px', `${state.listTagged} ${state.listGap}`);
  check('no inventory chrome roles leak into the salvage panel', !state.chromeLeak);

  // Rule 1: a click anywhere on the row, including the skin's name link and
  // icon, must still reach the game's own button handler.
  await tab.click('#salvage-list > button:nth-child(2) .fs-inv-name');
  await tab.click('#salvage-list > button:nth-child(1) .fs-inv-icon');
  const clicks = await tab.evaluate(() => window.salvageClicks);
  check('clicks on the overlay still select the item', clicks.length === 2, JSON.stringify(clicks));

  // Rule 3: the kill switch takes all of it away.
  await tab.evaluate(() => window.chrome.storage.onChanged._emit({ 'iw-skin-enabled': { newValue: false } }));
  await tab.waitForTimeout(200);
  const after = await tab.evaluate(() => ({
    overlays: document.querySelectorAll('.fs-inv-row').length,
    attrs: document.querySelectorAll('[data-iw-salvage-list], [data-fs-inv], [data-fs-suppressed]').length,
    shown: [...document.querySelectorAll('#salvage-list > button > div')].every(d => getComputedStyle(d).display !== 'none'),
  }));
  check('teardown removes overlays and markers, restores the native rows', after.overlays === 0 && after.attrs === 0 && after.shown, JSON.stringify(after));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall salvage row checks passed');
