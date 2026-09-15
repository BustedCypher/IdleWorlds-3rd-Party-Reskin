/* Real-browser quiescence for the EXPANDED V2 card — the shape
   tests/flush-quiescence.test.mjs does not model (its material line is
   "Requires: 12 Iron Bar", with no N/M, so no ingredient grid, no Materials
   tab and no body row ever exist; and it never expands a card). */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await readFile(resolve(ROOT, process.env.BUNDLE_REL || 'dist/content.bundle.js'), 'utf8');
const EXPAND = process.env.EXPAND !== '0';

const skillPanel = (i, s) => `<div class="compact-panel" id="skill-${i}">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>${s[0]}</p><p>LV ${20 + i}</p></div>
    <div><p>${s[1]} Moonsteel Ore Vein</p>
      <button>Lv ${20 + i} - ${i * 3}% • 4,120 to go</button>
      <p>📦 Moonsteel Ore 3/2 • 🪨 Silver Dust 1/4 • 🧱 Runite Bar 12/12</p>
      <p>Requires Construction Lv 29</p>
      <p>Base reward: +1387 mining XP/task</p>
      <div><div style="width:${i * 5}%"></div></div></div>
    <div><div><button>‹</button><button>›</button></div><button>${s[1]}</button></div>
  </div></div>`;
const SKILLS = [['⛏️ Mine','Mine'],['🌿 Gather','Gather'],['🔨 Smelt','Smelt'],['🧪 Brew','Brew'],['🧵 Tailor','Tailor'],['🎣 Fish','Fish']];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>BustedCypher</h1><p>⚔ Combat Lv 62</p></div><div><button>☆</button></div></header>
<nav><button>Game</button><button>Market</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>🧭 Zone 19: Eternium Verge</p></div><div><button>🌐 Zones</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><h2>Skill Actions</h2>
${SKILLS.map((s,i)=>skillPanel(i,s)).join('')}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

let exe; try { exe = process.env.IW_CHROMIUM_PATH || chromium.executablePath(); } catch { exe = process.env.IW_CHROMIUM_PATH; }
const browser = await chromium.launch({ ...(exe?{executablePath:exe}:{}) , args:['--headless=new','--no-sandbox','--disable-dev-shm-usage'], ignoreDefaultArgs:['--headless=old'], timeout:120000 });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const MIME = { '.json':'application/json', '.webp':'image/webp', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://iw.test') return route.abort();
  if (url.pathname === '/p.html') return route.fulfill({ contentType:'text/html; charset=utf-8', body: PAGE });
  if (url.pathname === '/api/player') return route.fulfill({ contentType:'application/json', body:'{"player":{}}' });
  try { const body = await readFile(resolve(ROOT, url.pathname.replace(/^\/+/,''))); const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
    return route.fulfill({ contentType: MIME[ext] || 'application/octet-stream', body }); } catch { return route.fulfill({ status:404, body:'' }); }
});
await page.goto('http://iw.test/p.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);

const surface = await page.evaluate(EXPAND => {
  const p = document.getElementById('skill-0');
  if (EXPAND) {
    p.querySelector('[data-iw-skill-v2-expand]')?.click();
    p.querySelector('[data-iw-skill-v2-tab-button="materials"]')?.click();
  }
  return { v2: p.dataset.iwSkillV2 || null, state: p.dataset.iwSkillV2State || null, tab: p.dataset.iwSkillV2Tab || null,
    grids: p.querySelectorAll('.fs-skill-ingredient-grid').length,
    items: p.querySelectorAll('.fs-skill-ingredient-item').length,
    bodyRows: p.querySelectorAll('.iw-skill-v2-body-row').length,
    tabs: p.querySelectorAll('[data-iw-skill-v2-tab-button]').length,
    summary: p.querySelector('[data-iw-skill-v2-summary]')?.textContent || null };
}, EXPAND);
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__c = { flush:0, skill:0, style:0, mut:0 };
  document.addEventListener('iw:dom-flush', () => { window.__c.flush++; });
  document.addEventListener('iw:skill-panel', () => { window.__c.skill++; });
  const sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function(...a){ window.__c.style++; return sp.apply(this,a); };
  const rp = CSSStyleDeclaration.prototype.removeProperty;
  CSSStyleDeclaration.prototype.removeProperty = function(...a){ window.__c.style++; return rp.apply(this,a); };
  window.__obs = new MutationObserver(l => { window.__c.mut += l.length; });
  window.__obs.observe(document.body, { subtree:true, childList:true, attributes:true, characterData:true });
});
await page.waitForTimeout(4000);
const c = await page.evaluate(() => { window.__obs.disconnect(); return window.__c; });
const after = await page.evaluate(() => { const p = document.getElementById('skill-0');
  return { grids:p.querySelectorAll('.fs-skill-ingredient-grid').length, items:p.querySelectorAll('.fs-skill-ingredient-item').length,
           bodyRows:p.querySelectorAll('.iw-skill-v2-body-row').length, summary:p.querySelector('[data-iw-skill-v2-summary]')?.textContent||null }; });
console.log('EXPAND=' + EXPAND + '  surface:', JSON.stringify(surface));
console.log('  after 4s   :', JSON.stringify(after));
console.log(`  4s quiescent window: ${c.flush} flushes, ${c.skill} skill reconciles, ${c.style} inline-style writes, ${c.mut} mutation records`);
console.log('  budget (flush-quiescence.test.mjs): flush<=5  skill<=5  style<=10  mut<=10');
console.log('  page errors:', errs.length ? errs.slice(0,2).join(' | ') : 'none');
await browser.close();
