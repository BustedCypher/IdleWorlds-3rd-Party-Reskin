/** Render the real quest renderer and approved frames at desktop/mobile sizes.
 * Run after build: node build-tools/render-quest-frames.mjs
 * Output is local review material, not a replacement for a live-game check. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ZONE_THEMES } from '../src/modules/zoneThemes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'output/quest-frames');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');
const index = JSON.parse(await readFile(resolve(ROOT, 'assets/quest-frames/index.json'), 'utf8'));
await mkdir(OUT, { recursive: true });
const card = (id, objective, title) => `<div class="compact-panel p-2.5" id="${id}">
  <div class="space-y-2"><div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Mining Work Order</p>
      <p class="text-xs font-semibold text-white">${title}</p>
      <p class="mt-1 text-[11px] text-white/45">${objective} 22/100</p>
      <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +1,240g &bull; +960 mining XP</p>
    </div>
    <div class="flex shrink-0 flex-col gap-2"><button>Turn In</button><button>Skip (8)</button></div>
  </div>
  <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width:22%"></div></div>
  <div class="text-[11px] text-white/45">22% complete</div></div></div>`;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>
*,::before,::after{box-sizing:border-box;border:0 solid}
button{background:none;font:inherit;color:inherit}body{margin:0}
.panel{padding:8px}.flex{display:flex}.flex-col{flex-direction:column}
.items-start{align-items:flex-start}.justify-between{justify-content:space-between}
.gap-2{gap:.5rem}.gap-3{gap:.75rem}.flex-1{flex:1 1 0%}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}
</style></head><body><div id="root" data-skin="default">
<header><div><h1>BustedCypher</h1><p>Combat Lv 62</p></div><div><button>1</button></div></header>
<nav><button>Game</button><button>Market</button></nav>
<div><p id="zone-label">Zone 1: Verdant Meadow</p><button>Zones</button></div>
<div class="panel" id="quests"><h2>Quests</h2>
${card('ore-quest', 'Copper Ore', 'Mine and turn in 100 Copper Ore.')}
${card('fallback-quest', 'Unknown Relic', 'Collect and turn in 100 Unknown Relics.')}
</div></div><script>${bundle}</script></body></html>`;

const browser = await chromium.launch({
  ...(process.env.IW_CHROMIUM_PATH ? { executablePath: process.env.IW_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
const measurements = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://iw.test') return route.abort();
    if (url.pathname === '/quest-frames.html') return route.fulfill({ contentType: 'text/html', body: PAGE });
    try {
      const path = resolve(ROOT, url.pathname.replace(/^\/+/, ''));
      if (!path.startsWith(ROOT + '/') && !path.startsWith(ROOT + '\\')) return route.abort();
      const mime = { '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      return route.fulfill({ contentType: mime[extname(path)] || 'application/octet-stream', body: await readFile(path) });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://iw.test/quest-frames.html');
  await page.waitForFunction(() => document.querySelector('#ore-quest .fs-quest-sigil-icon'));
  for (const width of [1200, 480, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const entry of index.entries) {
      const zone = Object.entries(ZONE_THEMES).find(([, theme]) => theme === entry.theme)[0];
      await page.locator('#zone-label').evaluate((el, text) => {
        el.textContent = text;
        // Simulate the game's route refresh; this fixture changes only text.
        document.dispatchEvent(new CustomEvent('iw:dom-flush', { detail: { roots: [document.body] } }));
      }, `Zone ${zone}: Frame Preview`);
      await page.waitForFunction(theme => document.documentElement.dataset.iwZoneTheme === theme, entry.theme);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const measured = await page.locator('#ore-quest .fs-quest-sigil').evaluate(el => {
        const s = getComputedStyle(el, '::after');
        const b = el.getBoundingClientRect();
        const icon = el.querySelector('.fs-quest-sigil-icon').getBoundingClientRect();
        const label = el.querySelector('.fs-quest-sigil-pct').getBoundingClientRect();
        return { size: b.width, frameWidth: parseFloat(s.width), frameHeight: parseFloat(s.height),
          inset: parseFloat(s.top), image: s.backgroundImage, position: s.backgroundPosition,
          mask: s.maskImage || s.webkitMaskImage,
          iconCentered: Math.abs((icon.left + icon.right) / 2 - (b.left + b.right) / 2) < 1 && Math.abs((icon.top + icon.bottom) / 2 - (b.top + b.bottom) / 2) < 1,
          labelGap: label.top - (b.bottom - parseFloat(s.bottom)) };
      });
      const expectedSize = width > 640 ? 72 : width > 400 ? 44 : 40;
      assert.equal(measured.size, expectedSize, `${entry.theme} sigil @${width}`);
      assert.equal(measured.frameWidth, measured.frameHeight, 'ring window must remain square');
      assert(measured.image.includes('assets/quest-frames/approved-frames.png'), 'approved source is loaded');
      const expected = [entry.x / (index.width - entry.width) * 100, entry.y / (index.height - entry.height) * 100];
      measured.position.split(' ').map(parseFloat).forEach((value, axis) => assert(Math.abs(value - expected[axis]) < 0.001, `${entry.theme} sprite registration`));
      assert(measured.mask.includes('radial-gradient'), 'background mask is active');
      assert(measured.iconCentered, 'item icon stays centered');
      assert(measured.labelGap >= -1, `${entry.theme} @${width}: percentage label clears the frame (gap ${measured.labelGap})`);
      measurements.push({ width, theme: entry.theme, ...measured });
      await page.locator('#quests').screenshot({ path: resolve(OUT, `${entry.theme}-${width}.png`) });
    }
  }
  // The default palette remains usable before HeaderRenderer resolves a zone.
  await page.evaluate(() => { document.documentElement.dataset.iwZoneTheme = 'default'; });
  const fallback = await page.locator('.fs-quest-sigil').first().evaluate(el => getComputedStyle(el, '::after').backgroundPosition);
  const forged = measurements.find(m => m.theme === 'forged-metal');
  assert.equal(fallback, forged.position);
  assert.equal(await page.locator('#fallback-quest .fs-quest-sigil[data-iw-quest-icon="1"]').count(), 0, 'unknown item retains discipline glyph');
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(resolve(OUT, 'measurements.json'), JSON.stringify(measurements, null, 2));
  const previews = await Promise.all(index.entries.map(async e => ({ theme: e.theme, image: `data:image/png;base64,${(await readFile(resolve(OUT, `${e.theme}-480.png`))).toString('base64')}` })));
  const gallery = `<!doctype html><meta charset="utf-8"><title>Quest frame preview</title><style>
body{margin:0;padding:24px;background:#101113;color:#e6e0d5;font:14px system-ui}h1{font-size:24px;margin:0 0 6px}p{color:#a7a5a0;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}h2{font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:2px}img{width:100%;display:block}
</style><h1>Quest icon frames</h1><p>Approved artwork · all nine themes · item icon and fallback glyph · mobile layout</p><div class="grid">${previews.map(p => `<section><h2>${p.theme.replaceAll('-', ' ')}</h2><img src="${p.image}"></section>`).join('')}</div>`;
  await writeFile(resolve(OUT, 'preview.html'), gallery);
  await page.unroute('**/*');
  await page.setViewportSize({ width: 1500, height: 1300 });
  await page.setContent(gallery);
  await page.screenshot({ path: resolve(OUT, 'all-themes.png'), fullPage: true });
  console.log(`Verified ${measurements.length} theme/viewport combinations, default frame, centered item icons, fallback glyphs and label clearance. Preview: ${OUT}`);
} finally { await browser.close(); }
