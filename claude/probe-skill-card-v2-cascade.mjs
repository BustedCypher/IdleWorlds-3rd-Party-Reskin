/* Companion to probe-skill-card-v2.mjs: for the handful of nodes the V2
   concept restyles, list EVERY rule in the live cascade that declares the
   property, in source order, with its sheet and whether it is !important.
   The last important rule at the highest specificity is the one that paints,
   so this says who is beating the V2 sheet rather than guessing. */
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const CARD = `
<div class="compact-panel" id="card">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>&#128142; Jewelcrafting</p><p>LV 70</p></div>
    <div>
      <p>Prospect Moonsteel Ore</p>
      <button>Lv 70 - 41.1% &bull; 4,120 to go</button>
      <p>Requires Jewelcrafting Lv 53 and Mining Lv 49</p>
      <p>Materials: &bull; Moonsteel Ore 3/2 &bull; Silver Dust 1/4</p>
            <p>Base reward: +677 jewelcrafting XP/task</p>
      <div><div style="width:41%"></div></div>
    </div>
    <div><div><button>&lsaquo;</button><button>&rsaquo;</button></div><button>Prospect</button></div>
  </div>
</div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div><div><button>S</button></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone 19: Eternium Verge</p></div>
  <div><button>&#127760; Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><h2>Skill Actions</h2>${CARD}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

const URL_BASE = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== URL_BASE) return route.abort();
  if (url.pathname.endsWith('.html') || url.pathname === '/')
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
  try {
    const body = await readFile(resolve(ROOT, url.pathname.slice(1)));
    return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto(`${URL_BASE}/probe.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const QUERIES = [
  ['.fs-skill-identity-percent', 'display', ''],
  ['.fs-skill-identity-progress', 'display', ''],
  ['.fs-skill-medallion-art', 'background', '::after'],
  ['.fs-skill-medallion-art', 'inset', '::after'],
  ['[data-iw-skill-role="nav-group"]', 'display', ''],
  ['[data-iw-skill-role="action-button"]', 'background', ''],
];

const out = await page.evaluate(queries => {
  /* Specificity of a selector, counted the plain way. Pseudo-elements add to
     the type count; :not()/:is() take their argument's own weight, which is
     close enough to rank rules that differ by whole categories. */
  const spec = sel => {
    let s = sel.replace(/::[a-z-]+/g, m => (m, ''));
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)(?:not|is|where|has)?\b[\w-]+/g) || []).length;
    const typ = (s.match(/(^|[\s>+~(,])[a-z][\w-]*/gi) || []).length;
    return [ids, cls, typ];
  };
  const rank = a => a[0] * 10000 + a[1] * 100 + a[2];

  const walk = (rules, sheet, acc) => {
    for (const rule of rules) {
      if (rule.cssRules && (rule.media || rule.conditionText !== undefined)) {
        walk(rule.cssRules, sheet, acc); continue;
      }
      if (!rule.selectorText || !rule.style) continue;
      acc.push({ sheet, selector: rule.selectorText, style: rule.style });
    }
  };

  const all = [];
  for (const style of document.querySelectorAll('style[data-iw-style]')) {
    try { walk(style.sheet.cssRules, style.dataset.iwStyle, all); } catch {}
  }

  return queries.map(([sel, prop, pseudo]) => {
    const el = document.querySelector(sel);
    const hits = [];
    for (const r of all) {
      const value = r.style.getPropertyValue(prop);
      if (!value) continue;
      for (const one of r.selector.split(',').map(s => s.trim())) {
        const base = one.replace(/::[a-z-]+$/, '');
        const wantsPseudo = one.endsWith(pseudo) || (!pseudo && !/::/.test(one));
        if (!wantsPseudo) continue;
        let matches = false;
        try { matches = el ? el.matches(base) : false; } catch {}
        if (!matches) continue;
        hits.push({ sheet: r.sheet, selector: one, value,
          important: r.style.getPropertyPriority(prop) === 'important',
          spec: spec(one), rank: rank(spec(one)) });
        break;
      }
    }
    const computed = el ? getComputedStyle(el, pseudo || undefined)[prop === 'background' ? 'backgroundImage' : prop] : null;
    return { sel, prop, pseudo, present: !!el, computed: String(computed).slice(0, 70), hits };
  });
}, QUERIES);

for (const q of out) {
  console.log(`\n=== ${q.sel}${q.pseudo}  {${q.prop}}   computed: ${q.computed}`);
  if (!q.present) { console.log('    element not present'); continue; }
  if (!q.hits.length) { console.log('    no skin rule declares it'); continue; }
  for (const h of q.hits) {
    const sp = `(${h.spec.join(',')})`;
    console.log(`    ${h.sheet.padEnd(12)} ${sp.padEnd(9)} ${h.important ? '!imp' : '    '}  ${h.value.slice(0, 34).padEnd(34)} ${h.selector.slice(0, 96)}`);
  }
  const winner = q.hits.filter(h => h.important).sort((a, b) => a.rank - b.rank).pop() || q.hits[q.hits.length - 1];
  console.log(`    -> WINNER: ${winner.sheet}  ${winner.selector.slice(0, 90)}`);
}
await browser.close();
