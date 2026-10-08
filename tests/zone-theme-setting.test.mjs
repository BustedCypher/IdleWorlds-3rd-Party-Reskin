/**
 * The "Zone themes" switch (ZoneThemeSetting.js; Curtis, 2026-10-08).
 *
 *   1. The switch is appended to the zone bar's action row (never the bar
 *      itself, so HeaderChrome's two-branch shape still resolves), starts on,
 *      and the page wears the zone's theme + header painting.
 *   2. Off: <html> drops to the stock Ashen Iron theme ("default"), the zone
 *      atlas/corner/separator vars clear, the header uses header_surface.webp,
 *      and the choice is stored (`iw-zone-themes` = false).
 *      Negative control: the zone bar's game buttons are untouched.
 *   3. A stored "off" applies on load; a change from another tab applies live.
 *   4. On again restores the cached zone at once (no zone bar re-read needed).
 *   5. Phones: the row does not overflow.
 *   6. Kill switch removes the switch.
 *
 * REAL BROWSER (Playwright), the built bundle. Screenshots: tmp/zone-theme-setting/.
 */

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'tmp/zone-theme-setting');
await mkdir(OUT, { recursive: true });
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#000;color:#fff;font-family:sans-serif}
button{font:inherit;color:inherit;background:none}p{margin:0}.panel{border:1px solid #333;padding:14px}
.flex{display:flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:8px}`;

const BODY = `<div id="root" style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto">
<header class="panel"><div><h1>BustedCypher</h1><p>⚔ Combat Lv 62</p><p>Players online: 145</p></div><div><button>☆</button><button>⚙</button></div><div id="status-grid"><div>💰 515,686</div><div>⚔ ATK 292 · DEF 252 · HP 900</div></div></header>
<nav class="panel flex flex-wrap gap-2" id="nav"><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button><button>Dungeon</button></nav>
<div class="panel flex flex-wrap items-center justify-between gap-2" id="zone-bar"><div><p>🧭 Zone 19: Eternium Verge</p></div><div class="flex gap-2" id="zone-actions"><button id="zones">🌐 Zones</button><button id="prev">Previous Zone</button><button id="next">Next Zone</button></div></div>
<div class="panel"><div><h2>Quests</h2></div><p>Nothing here.</p></div></div>`;

const page = `<!doctype html><html lang="en" data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>${BODY}</body></html>`;
const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open({ width = 1280, stored } = {}) {
  const tab = await browser.newPage({ viewport: { width, height: 800 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(seed => {
    const listeners = [], data = { ...seed };
    window.__store = data;
    window.chrome = { runtime: { id: 'zone-theme-setting-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: {
        get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
        set: async bag => { const changes = {}; for (const [k, v] of Object.entries(bag)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = v; } listeners.forEach(fn => fn(changes, 'local')); },
        remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: fn => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } } } };
    // Another tab writing storage: only the onChanged event reaches this one.
    window.otherTab = (key, value) => { data[key] = value; listeners.forEach(fn => fn({ [key]: { newValue: value } }, 'local')); };
    window.toggleSkin = enabled => window.otherTab('iw-skin-enabled', enabled);
  }, stored === undefined ? {} : { 'iw-zone-themes': stored });
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForTimeout(900);
  return tab;
}

const state = tab => tab.evaluate(() => {
  const html = document.documentElement;
  const toggle = document.querySelector('[data-iw-theme-toggle]');
  const header = document.querySelector('[data-iw-header="root"]');
  return {
    toggles: document.querySelectorAll('[data-iw-theme-toggle]').length,
    inRow: toggle?.parentElement?.id === 'zone-actions',
    checked: toggle?.querySelector('input')?.checked,
    attr: toggle?.getAttribute('data-iw-theme-toggle'),
    theme: html.dataset.iwZoneTheme,
    atlas: html.style.getPropertyValue('--iw-zone-atlas'),
    corners: html.style.getPropertyValue('--iw-corner-filigree'),
    surface: header?.style.getPropertyValue('--iw-header-surface') || '',
    chrome: document.querySelector('[data-iw-chrome="zone-actions"]')?.id || null,
    stored: window.__store['iw-zone-themes'],
    zoneButtons: ['zones', 'prev', 'next'].map(id => document.getElementById(id).getAttribute('data-iw-ui')).join(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

console.log('\ndesktop, default (on)');
const tab = await open();
let s = await state(tab);
check('one switch, appended to the zone-action row', s.toggles === 1 && s.inRow, JSON.stringify(s));
check('starts on', s.checked === true && s.attr === 'on');
check('the zone theme is applied (zone 19)', s.theme && s.theme !== 'default' && !!s.atlas && /zone_19\.webp/.test(s.surface), `${s.theme} ${s.surface}`);
const zoneTheme = s.theme;
check('HeaderChrome still resolves the zone-action branch', s.chrome === 'zone-actions', s.chrome);
check('the game zone buttons keep their roles', s.zoneButtons === 'zone-action,zone-action,zone-action', s.zoneButtons);
await (await tab.$('#root')).screenshot({ path: resolve(OUT, 'on-1280.png') });

console.log('\nswitched off');
await tab.click('[data-iw-theme-toggle]');
await tab.waitForTimeout(300);
s = await state(tab);
check('switch reads off', s.checked === false && s.attr === 'off');
check('stock Ashen Iron theme: data-iw-zone-theme="default"', s.theme === 'default', s.theme);
check('zone atlas / corner vars cleared', !s.atlas && !s.corners, `${s.atlas} ${s.corners}`);
check('header falls back to the stock surface', /header_surface\.webp/.test(s.surface) && !/zone_19/.test(s.surface), s.surface);
check('choice stored as false', s.stored === false, String(s.stored));
check('zone buttons untouched by the switch', s.zoneButtons === 'zone-action,zone-action,zone-action');
await (await tab.$('#root')).screenshot({ path: resolve(OUT, 'off-1280.png') });

console.log('\nswitched on again');
await tab.click('[data-iw-theme-toggle]');
await tab.waitForTimeout(300);
s = await state(tab);
check('the same zone theme returns at once', s.theme === zoneTheme && /zone_19\.webp/.test(s.surface) && s.stored === true, `${s.theme} ${s.surface}`);

console.log('\nanother tab turns it off');
await tab.evaluate(() => window.otherTab('iw-zone-themes', false));
await tab.waitForTimeout(300);
s = await state(tab);
check('follows the other tab live', s.theme === 'default' && s.checked === false, `${s.theme} ${s.checked}`);

console.log('\nkill switch');
await tab.evaluate(() => window.toggleSkin(false));
await tab.waitForTimeout(400);
s = await state(tab);
check('kill switch removes the switch', s.toggles === 0, String(s.toggles));
await tab.close();

console.log('\nstored off, fresh load');
const off = await open({ stored: false });
s = await state(off);
check('a stored "off" applies on load', s.theme === 'default' && s.checked === false && !/zone_19/.test(s.surface), JSON.stringify({ theme: s.theme, checked: s.checked }));
await off.close();

for (const width of [360, 390]) {
  console.log(`\nphone ${width}px`);
  const p = await open({ width });
  s = await state(p);
  check('switch present, no horizontal overflow', s.toggles === 1 && s.overflow <= 0, `${s.overflow}px`);
  await (await p.$('#root')).screenshot({ path: resolve(OUT, `on-${width}.png`) });
  await p.close();
}

check('no page errors', errors.length === 0, errors.join('; '));
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall zone-theme-setting checks passed');
process.exit(failures ? 1 : 0);
