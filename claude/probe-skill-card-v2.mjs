/* Read-only probe: mounts ONE live-shaped skill card, boots the real bundle
   with the V2 design on, and reports what actually renders — computed paint
   and real rects, not what the sheet says it asked for.

   Usage: node claude/probe-skill-card-v2.mjs [width] [--shot <path>] */
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const WIDTH = Number(process.argv[2]) || 1180;
const SHOT = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : null;
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The live card from the screenshot: Jewelcrafting, "Prospect Moonsteel Ore",
   a Base reward line, a Requires line naming two disciplines, an ingredient,
   the pager pair and the command button — each in the branch the live app
   ships it in, because distinctZones needs three DIFFERENT shell children. */
const CARD = `
<div class="compact-panel" id="card">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>💎 Jewelcrafting</p><p>LV 70</p></div>
    <div>
      <p>Prospect Moonsteel Ore</p>
      <button>Lv 70 - 41.1% • 4,120 to go</button>
      <p>Requires Jewelcrafting Lv 53 and Mining Lv 49</p>
      <p>Materials: &bull; Moonsteel Ore 3/2 &bull; Silver Dust 1/4</p>
      <p>Base reward: +677 jewelcrafting XP/task</p>
      <div><div style="width:41%"></div></div>
    </div>
    <div><div><button>&lsaquo;</button><button>&rsaquo;</button></div><button>Prospect</button></div>
  </div>
</div>`;

const N_CARDS = process.argv.includes('--cards') ? Number(process.argv[process.argv.indexOf('--cards') + 1]) : 1;
const CARDS = Array.from({ length: N_CARDS }, (_, i) => i === 0 ? CARD : CARD.replace('id="card"', `id="card-${i}"`)).join('');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>&#9876; Combat Lv 62</p></div><div><button>S</button></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone 19: Eternium Verge</p></div>
  <div><button>&#127760; Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><h2>Skill Actions</h2>${CARDS}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

const URL_BASE = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.css': 'text/css' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
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
if (process.argv.includes('--expand')) {
  await page.click('[data-iw-skill-v2-expand]');
  await page.waitForTimeout(400);
}
if (process.argv.includes('--tab')) {
  const want = process.argv[process.argv.indexOf('--tab') + 1];
  await page.click(`[data-iw-skill-v2-tab-button="${want}"]`);
  await page.waitForTimeout(400);
}

const report = await page.evaluate(() => {
  const card = document.querySelector('#card');
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const vis = el => { if (!el) return null; const s = getComputedStyle(el);
    return { display: s.display, visibility: s.visibility, opacity: s.opacity,
      position: s.position, fontSize: s.fontSize, color: s.color }; };
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  const named = {};
  for (const [key, sel] of [
    ['panel', '#card'],
    ['shell', '[data-iw-skill-layout-shell="1"]'],
    ['zone:identity', '[data-iw-skill-zone="identity"]'],
    ['zone:content', '[data-iw-skill-zone="content"]'],
    ['zone:commands', '[data-iw-skill-zone="commands"]'],
    ['medallion', '.fs-skill-medallion-art'],
    ['v2 readout', '[data-iw-skill-v2-level-readout]'],
    ['native percent', '.fs-skill-identity-percent'],
    ['native progress', '.fs-skill-identity-progress'],
    ['role:level-progress', '[data-iw-skill-role="level-progress"]'],
    ['role:identity', '[data-iw-skill-role="identity"]'],
    ['role:action-title', '[data-iw-skill-role="action-title"]'],
    ['base exp plaque', '.fs-skill-base-exp'],
    ['role:requirement', '[data-iw-skill-role="requirement"]'],
    ['role:action-button', '[data-iw-skill-role="action-button"]'],
    ['role:nav-group', '[data-iw-skill-role="nav-group"]'],
    ['v2 controls', '[data-iw-skill-v2-controls]'],
    ['v2 tabs', '[data-iw-skill-v2-tabs]'],
    ['v2 expand', '[data-iw-skill-v2-expand]'],
    ['ingredient list', '[data-iw-skill-ingredient-list],.fs-skill-ingredient-grid'],
  ]) {
    const el = card?.querySelector(sel) || document.querySelector(sel);
    named[key] = el ? { rect: r(el), style: vis(el), text: txt(el) } : null;
  }

  const ring = card?.querySelector('.fs-skill-medallion-art');
  const ringAfter = ring ? getComputedStyle(ring, '::after') : null;

  const painted = [];
  card?.querySelectorAll('*').forEach(el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return;
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
      .map(n => n.textContent.trim()).join(' ');
    if (!own) return;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    painted.push({ text: own.slice(0, 46), y: Math.round(b.y), x: Math.round(b.x),
      w: Math.round(b.width), h: Math.round(b.height), size: s.fontSize });
  });
  painted.sort((a, b) => a.y - b.y || a.x - b.x);

  /* Every descendant of the three zones, with the marks the skin gave it, so a
     node that needs a rule can be named instead of guessed at. */
  const tree = [];
  for (const zone of ['identity', 'content', 'commands']) {
    const host = card?.querySelector(`[data-iw-skill-zone="${zone}"]`);
    if (!host) continue;
    const visit = (el, depth) => {
      for (const kid of el.children) {
        const s = getComputedStyle(kid);
        const marks = [...kid.attributes].filter(a => a.name.startsWith('data-iw'))
          .map(a => `${a.name.replace('data-iw-', '')}=${a.value}`).join(' ');
        const b = kid.getBoundingClientRect();
        tree.push({ zone, depth, tag: kid.tagName.toLowerCase(),
          cls: (kid.className || '').toString().split(/\s+/).filter(c => /^(fs|iw)-/.test(c)).join(' '),
          marks, display: s.display, box: `${Math.round(b.width)}x${Math.round(b.height)}`,
          text: (kid.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
        if (depth < 3) visit(kid, depth + 1);
      }
    };
    visit(host, 0);
  }

  return { tree,
    design: document.documentElement.dataset.iwSkillCardDesign,
    v2: card?.dataset.iwSkillV2, state: card?.dataset.iwSkillV2State,
    tab: card?.dataset.iwSkillV2Tab, layout: card?.dataset.iwSkillLayout,
    ready: card?.dataset.iwSkillsUiReady,
    progressVar: card?.style.getPropertyValue('--iw-skill-v2-progress'),
    named, painted,
    ring: ringAfter ? { content: ringAfter.content, background: ringAfter.backgroundImage.slice(0, 90),
      width: ringAfter.width, height: ringAfter.height, inset: ringAfter.inset } : null,
    sheets: [...document.querySelectorAll('style[data-iw-style]')].map(s => s.dataset.iwStyle),
  };
});

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== viewport ${WIDTH}px | design=${report.design} v2=${report.v2} state=${report.state} tab=${report.tab}`);
console.log(`=== layout=${report.layout} atlasReady=${report.ready} progressVar=${report.progressVar || '(unset)'}`);
console.log(`=== sheets: ${report.sheets.join(', ')}\n`);
console.log('NODE                      PRESENT  DISPLAY      RECT                    TEXT');
for (const [k, v] of Object.entries(report.named)) {
  if (!v) { console.log(`${pad(k, 25)} ${pad('MISSING', 8)}`); continue; }
  const rc = `${v.rect.w}x${v.rect.h} @${v.rect.x},${v.rect.y}`;
  console.log(`${pad(k, 25)} ${pad('yes', 8)} ${pad(v.style.display, 12)} ${pad(rc, 23)} ${v.text}`);
}
console.log(`\nRING ::after  ${report.ring ? `${report.ring.width}x${report.ring.height} inset=${report.ring.inset} bg=${report.ring.background}` : 'no medallion'}`);
console.log('\nPAINTED TEXT, TOP TO BOTTOM');
for (const p of report.painted) console.log(`  y=${pad(p.y, 5)} x=${pad(p.x, 5)} ${pad(p.w + 'x' + p.h, 10)} ${pad(p.size, 6)} ${p.text}`);

console.log('\nZONE CONTENTS (tag / skin marks / computed display / box / text)');
let zone = '';
for (const n of report.tree) {
  if (n.zone !== zone) { zone = n.zone; console.log(`  --- ${zone} ---`); }
  const name = `${'  '.repeat(n.depth)}${n.tag}${n.cls ? '.' + n.cls.split(' ').join('.') : ''}`;
  console.log(`   ${pad(name, 34)} ${pad(n.display, 10)} ${pad(n.box, 9)} ${pad(n.marks, 42)} ${n.text}`);
}

if (SHOT) {
  await page.locator(process.argv.includes('--all') ? '#skill-actions' : '#card').screenshot({ path: resolve(ROOT, SHOT) });
  const box = await page.locator('#card [data-iw-skill-zone="identity"]').boundingBox();
  const zoom = SHOT.replace(/[.]png$/, '-identity.png');
  if (box) await page.screenshot({ path: resolve(ROOT, zoom), clip: {
    x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
  console.log(`\nwrote ${SHOT}${box ? ' and ' + zoom : ''}`);
}
await browser.close();
