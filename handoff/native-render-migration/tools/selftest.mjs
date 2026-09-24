#!/usr/bin/env node
/**
 * selftest.mjs — proves the migration method and the tools, in a real browser.
 *
 *   node handoff/native-render-migration/tools/selftest.mjs
 *
 * Requires the repository's dev dependencies (`npm ci`), Playwright's Chromium
 * (`npx playwright install chromium`), a current `dist/content.bundle.js`
 * (`npm run build`) and a current export (`export-theme-css.mjs`).
 *
 * What it demonstrates, on a live-shaped fixture (header, nav rail, notice,
 * zone bar, a skill card, a quest card, Current Action, World Chat):
 *
 *   A. capture-skin-contract.js finds the skin's marks and appended nodes, and
 *      leaves the skin ON afterwards. Negative control: with the skin OFF it
 *      refuses to run.
 *   B. "Stage A" reproduces the extension exactly: the page is frozen with the
 *      extension's output in it (its marks, inline properties and appended
 *      nodes), reloaded as STATIC HTML with no extension and the seven
 *      exported stylesheets linked instead, and capture-parity + diff-parity
 *      must report no difference. That is the whole migration claim in one
 *      check: emit the contract, ship the exported CSS, get the same pixels.
 *   C. The comparison can fail (negative controls):
 *        - drop every `data-iw-chrome` mark (the phase-1 regression: the
 *          merged header frame splits back into three boxes) -> differences;
 *        - omit the exported stylesheets -> differences.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const ORIGIN = 'http://iw.test';
const bundle = await readFile(path.join(ROOT, 'dist', 'content.bundle.js'), 'utf8');
const contractSnippet = await readFile(path.join(HERE, 'capture-skin-contract.js'), 'utf8');
const paritySnippet = await readFile(path.join(HERE, 'capture-parity.js'), 'utf8');
const cssDir = path.join(ROOT, 'handoff', 'native-render-migration', 'generated', 'theme-css');
const manifest = JSON.parse(await readFile(path.join(cssDir, 'manifest.json'), 'utf8'));
const work = await mkdtemp(path.join(tmpdir(), 'iw-selftest-'));

/* The chrome.* surface the bundle and the contract snippet need, with a
   working onChanged so the kill switch round-trips as it does live. */
const CHROME_SHIM = `
window.chrome = (() => {
  const data = {};
  const listeners = [];
  return {
    runtime: { id: 'selftest', getURL: p => location.origin + '/' + String(p).replace(/^\\/+/, '') },
    storage: {
      local: {
        get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
        set: async bag => {
          const changes = {};
          for (const [k, v] of Object.entries(bag)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = v; }
          for (const fn of [...listeners]) fn(changes, 'local');
        },
        remove: async key => { delete data[key]; },
      },
      onChanged: {
        addListener: fn => listeners.push(fn),
        removeListener: fn => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      },
    },
  };
})();`;

/* Live shapes: the page shell and header chrome from the 2026-09 captures
   (claude/captures, tests/header-compact.test.mjs), the skill card from
   tests/skill-card-v2-render.test.mjs, the quest card from
   tests/quest-command-width.test.mjs. Tailwind is stood in by the handful of
   utilities these nodes use, plus its preflight box-sizing. */
const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}
svg{display:block}button{background:none;font:inherit;color:inherit;cursor:pointer}
body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif}
.panel{padding:14px;border:1px solid #1e293b;border-radius:16px;background:#111827}
.flex{display:flex}.grid{display:grid}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}
.gap-2{gap:.5rem}.gap-3{gap:.75rem}.flex-1{flex:1 1 0%}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}
.mx-auto{margin-left:auto;margin-right:auto}.w-full{width:100%}.max-w-shell{max-width:1380px}
.p-2{padding:.5rem}.p-3{padding:.75rem}.px-2{padding-left:.5rem;padding-right:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.text-xs{font-size:.75rem}
.space-y-2>*+*{margin-top:.5rem}.rounded-full{border-radius:9999px}.h-1\\.5{height:.375rem}.h-full{height:100%}
.bg-white\\/10{background:rgba(255,255,255,.1)}.bg-emerald-400{background:#34d399}.overflow-hidden{overflow:hidden}`;

const SKILL_CARD = `
<div class="compact-panel" id="card">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>&#128142; Jewelcrafting</p><p>LV 70</p></div>
    <div>
      <p>Prospect Moonsteel Ore</p>
      <button title="Click to cycle XP display">Lv 70 - 41.1% &bull; 4,120 to go</button>
      <p class="text-white/45">Requires Jewelcrafting Lv 53 and Mining Lv 49</p>
      <p>Materials: &bull; Moonsteel Ore 3/2 &bull; Silver Dust 1/4</p>
      <p>Base reward: +677 jewelcrafting XP/task</p>
      <div><div style="width:41%"></div></div>
    </div>
    <div><div><button aria-label="Previous">&lsaquo;</button><button aria-label="Next">&rsaquo;</button></div><button>Prospect</button></div>
  </div>
</div>`;

const QUEST_CARD = `
<div class="compact-panel p-2.5" id="quest">
  <div class="space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-[10px] uppercase">Crafting Work Order</p>
        <p class="text-xs font-semibold text-white">Craft and turn in 38 Ironwood Planks.</p>
        <p class="mt-1 text-[11px] text-white/45">Ironwood Plank 38/38</p>
        <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +12,480g &bull; +9720 crafting XP</p>
      </div>
      <div class="flex shrink-0 flex-col gap-2"><button>Turn In</button><button>Skip (8)</button></div>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 100%"></div></div>
    <div class="text-[11px] text-white/45">100% complete</div>
  </div>
</div>`;

const BODY = `
<div id="root" data-skin="default">
<div class="mx-auto flex w-full max-w-shell flex-col gap-3 px-2 py-3">
  <header class="panel"><div class="grid gap-3">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 overflow-hidden">
        <p>IdleWorlds</p>
        <h1 class="header-player-name"><button title="View your profile">BustedCypher</button></h1>
        <p class="header-player-title">Craftbound Innovator</p>
        <p>&#9876;&#65039; Combat Lv 62 &bull; Zone 19: Eternium Verge</p>
        <button>Players online: 141</button>
      </div>
      <div class="flex items-center gap-2">
        <button class="header-icon-btn" aria-label="Mailbox" title="Mailbox"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"/></svg></button>
        <button class="header-icon-btn" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"/></svg></button>
        <button class="header-icon-btn" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"/></svg></button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 min-w-0"><div class="stat-chip">&#128176; 10,957,780</div><button class="stat-chip">ATK 350 &bull; DEF 358 &bull; HP 477</button></div>
  </div></header>
  <div class="panel flex flex-wrap gap-2 p-2"><button class="bg-orange-500">Game</button><button>Market</button><button>Leaderboards</button><button>Village</button><button>Dungeon</button></div>
  <div class="text-xs">You will auto-attack Ancient Treant when it respawns.</div>
  <div class="panel flex flex-col gap-2 p-3 text-xs">
    <div><p>&#129517; Zone 19: Eternium Verge<button>who's here?</button></p><p>Next zone target: ATK 287 / DEF 291 (or Lv 77 in any skill)</p></div>
    <div><button>&#127760; Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
  </div>
  <section class="grid gap-3">
    <div class="panel" id="skill-actions"><h2>Skill Actions</h2>${SKILL_CARD}</div>
    <div class="panel" id="current-action-panel"><h2>Current Action</h2><p>Prospect Moonsteel Ore</p><div class="h-1.5 rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 40%"></div></div><p>00:00:04</p></div>
    <div class="panel" id="quests"><h2>Quests</h2>${QUEST_CARD}</div>
    <div class="panel" id="chat"><h2>World Chat</h2><div><div><span>12:00:01</span><span>Hello</span></div><div><span>12:00:02</span><span>Hi</span></div></div><form><input placeholder="Message World Chat"><button>Send</button></form></div>
  </section>
</div>
</div>`;

const LIVE_PAGE = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style id="game-css">${GAME_CSS}</style></head><body>${BODY}
<script>${CHROME_SHIM}</` + `script><script>${bundle}</` + `script></body></html>`;

const pages = new Map([['/live.html', LIVE_PAGE]]);
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css', '.csv': 'text/csv' };

async function serve(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (pages.has(url.pathname)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pages.get(url.pathname) });
    let rel = url.pathname.replace(/^\/+/, '');
    if (rel.startsWith('theme-css/')) rel = path.relative(ROOT, path.join(cssDir, rel.slice('theme-css/'.length)));
    else rel = rel.replace(/^fantasy-skin\//, '');
    try {
      const body = await readFile(path.join(ROOT, rel));
      return route.fulfill({ contentType: MIME[path.extname(rel)] || 'application/octet-stream', body });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const asExpression = code => code.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim().replace(/;\s*$/, '');

async function settleSkin(page) {
  await page.waitForSelector('[data-iw-chrome="shell"]', { timeout: 15000 });
  await page.waitForSelector('#card[data-iw-skill-v2="1"]', { timeout: 15000 });
  await page.waitForSelector('#quest[data-fs-quest="1"]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

async function parity(page, name) {
  return page.evaluate(async ({ code, name }) => {
    window.IW_PARITY_NO_DOWNLOAD = true;
    window.IW_PARITY_NAME = name;
    await (0, eval)(code);
    return window.__iwParityCapture;
  }, { code: asExpression(paritySnippet), name });
}

function diff(a, b, label) {
  const fa = path.join(work, `${label}-reference.json`);
  const fb = path.join(work, `${label}-candidate.json`);
  return Promise.all([writeFile(fa, JSON.stringify(a)), writeFile(fb, JSON.stringify(b))]).then(() => {
    const run = spawnSync(process.execPath, [path.join(HERE, 'diff-parity.mjs'), fa, fb, '--ignore-route', `--report=${path.join(work, `${label}.md`)}`], { encoding: 'utf8' });
    return { code: run.status, out: run.stdout, report: path.join(work, `${label}.md`) };
  });
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await serve(page);
  await page.goto(`${ORIGIN}/live.html`, { waitUntil: 'load' });
  await settleSkin(page);

  /* ── A. The contract capture ─────────────────────────────────────────── */
  console.log('\nA. capture-skin-contract.js');
  const contract = await page.evaluate(async code => {
    window.IW_CONTRACT_NO_DOWNLOAD = true;
    await (0, eval)(code);
    return window.__iwSkinContract;
  }, asExpression(contractSnippet));
  const has = (pred) => contract.nodes.some(pred);
  check('<html> carries the zone theme for zone 19 (voidborn)', contract.html?.attributes?.['data-iw-zone-theme'] === 'voidborn', JSON.stringify(contract.html?.attributes));
  check('<html> carries the per-zone atlas variable', !!contract.html?.inlineStyle?.['--iw-zone-atlas']);
  check('the page shell is marked data-iw-chrome="shell"', has(n => n.attributes['data-iw-chrome'] === 'shell'));
  check('the zone bar is marked zone-bar in two namespaces', has(n => n.attributes['data-iw-chrome'] === 'zone-bar' && n.attributes['data-iw-ui'] === 'zone-bar' && n.attributes['data-iw-header'] === 'zone-shell'));
  check('the nav .panel ends as a section-frame (not main-nav)', has(n => n.attributes['data-iw-chrome'] === 'nav' && n.attributes['data-iw-ui'] === 'section-frame'));
  check('the skill card gets its classes and discipline', has(n => n.classes.includes('fs-skill-panel') && n.attributes['data-fs-skill'] === 'jewelcrafting'));
  check('skill buttons get inline !important plates', has(n => n.attributes['data-iw-btn-state'] && Object.values(n.inlineStyle).some(v => /!important$/.test(v.value))));
  const appended = contract.appended.map(a => a.outerHTML).join('\n');
  check('the crest is reported as appended', /class="fs-header-crest"/.test(appended));
  check('the Toolkit link is reported as appended', /data-iw-nav-link="toolkit"/.test(appended));
  check('the medallion art is reported as appended', /fs-skill-medallion-art/.test(appended));
  check('the quest sigil is reported as appended', /fs-quest-sigil/.test(appended));
  check('compact layers are reported as appended', /data-iw-compact-layer="idle"/.test(appended));
  check('the crest is placed FIRST in its region', contract.appended.some(a => /fs-header-crest/.test(a.outerHTML) && /^first child/.test(a.position)));
  check('the skin is back ON after the capture', await page.evaluate(() => !!document.querySelector('[data-iw-chrome="shell"]')));
  await page.evaluate(() => chrome.storage.local.set({ 'iw-skin-enabled': false }));
  const refused = await page.evaluate(async code => {
    try { await (0, eval)(code); return false; } catch (e) { return /currently OFF/.test(String(e)); }
  }, asExpression(contractSnippet));
  check('negative control: refuses to run while the skin is OFF', refused);
  await page.evaluate(() => chrome.storage.local.set({ 'iw-skin-enabled': true }));
  await settleSkin(page);

  /* ── B. Stage A: frozen contract + exported CSS == the extension ─────── */
  console.log('\nB. Stage A parity (static contract + exported CSS, no extension)');
  const reference = await parity(page, 'reference');
  const frozen = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, style[data-iw-style], #iw-tip').forEach(el => el.remove());
    clone.removeAttribute('data-iw-page-hydrated');
    return '<!doctype html>' + clone.outerHTML;
  });
  const links = manifest.sheets.map(s => `<link rel="stylesheet" href="/theme-css/${s.file}">`).join('');
  pages.set('/native.html', frozen.replace('</head>', `${links}</head>`));
  pages.set('/native-nocss.html', frozen);
  const constants = JSON.parse(await readFile(path.join(ROOT, 'handoff', 'native-render-migration', 'generated', 'theme-constants.json'), 'utf8'));
  const bookkeeping = constants.skinAttributes.bookkeeping;
  pages.set('/native-lean.html', bookkeeping
    .reduce((html, name) => html.replace(new RegExp(` ${name}="[^"]*"`, 'g'), ''), frozen)
    .replace('</head>', `${links}</head>`));
  pages.set('/native-split.html', frozen
    .replace(/ data-iw-chrome="[^"]*"/g, '')
    .replace('</head>', `${links}</head>`));

  async function staticCapture(route) {
    const p = await context.newPage();
    await serve(p);
    await p.goto(`${ORIGIN}${route}`, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const cap = await parity(p, route);
    await p.close();
    return cap;
  }

  const candidate = await staticCapture('/native.html');
  check('reference capture recorded elements', reference.nodes.length > 50, `${reference.nodes.length}`);
  const same = await diff(reference, candidate, 'stage-a');
  check('static contract + exported CSS paints identically to the extension', same.code === 0, `see ${same.report}`);
  const lean = await diff(reference, await staticCapture('/native-lean.html'), 'stage-a-lean');
  check(`omitting all ${bookkeeping.length} bookkeeping attributes changes nothing painted`, lean.code === 0, `see ${lean.report}`);

  /* ── C. Negative controls ────────────────────────────────────────────── */
  console.log('\nC. Negative controls');
  const split = await diff(reference, await staticCapture('/native-split.html'), 'split-chrome');
  check('dropping data-iw-chrome (the phase-1 regression) is detected', split.code === 1 && /data-iw-chrome/.test(split.out), `exit ${split.code}`);
  const nocss = await diff(reference, await staticCapture('/native-nocss.html'), 'no-css');
  check('omitting the exported stylesheets is detected', nocss.code === 1, `exit ${nocss.code}`);

  check('no page errors', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}

console.log(`\nWork files: ${work}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
