/* A V2 helper must never be rediscovered as game structure.
 *
 * Live reproduction (2026-09-21): a Jewelcrafting card first renders a known
 * PROSPECT recipe. React later changes it to the newer CRAFT verb and wraps
 * the item name inside the title. The button-text change invalidates the
 * renderer's structure signature while the skin-owned action-label mirror is
 * already present. If text discovery includes that mirror, its leaf text wins
 * over the nested real title and the mirror becomes `action-title`: CRAFT is
 * painted at heading size, wraps over the portrait button, and the content
 * pager is positioned from the wrong branch.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const PAGE = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.grid{display:grid}.gap-2{gap:.5rem}</style></head><body>
<div id="root" data-skin="default">
  <header><div><h1>Player</h1><p>Combat Lv 62</p></div></header>
  <nav><button>Game</button></nav>
  <div id="zone-bar-panel" class="panel"><div><p>Zone 19: Eternium Verge</p></div></div>
  <div id="panel-column"><div class="panel" id="skill-actions"><h2>Skill Actions</h2>
    <div class="compact-panel" id="card">
      <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
        <div><p>💎 Jewelcrafting</p><p>LV 70</p></div>
        <div id="content">
          <p id="title">Prospect Moonsteel Ore</p>
          <button>Lv 70 - 41.1% • 4,120 to go</button>
          <p>💎 Moonsteel Ore 3/2</p>
          <div id="pager"><button aria-label="Previous recipe">‹</button><button aria-label="Next recipe">›</button></div>
          <p>Base reward: +677 jewelcrafting XP/task</p>
        </div>
        <div><button id="action"><span class="relative z-10">Prospect</span></button></div>
      </div>
    </div>
  </div>
</div><script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 700 } });
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
  }
  try {
    return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream',
      body: await readFile(resolve(ROOT, url.pathname.slice(1))) });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});

try {
  await page.goto(`${ORIGIN}/role-isolation.html`, { waitUntil: 'load' });
  await page.waitForSelector('#card[data-iw-skill-v2="1"]', { timeout: 8000 });
  await page.waitForTimeout(700);

  /* React-style recipe transition: nested item markup plus a verb that the
     old Jewelcrafting action table does not contain. */
  await page.evaluate(() => {
    document.querySelector('#title').innerHTML = '💎 Craft <span class="iw-item-ref">Tourmaline Ring</span>';
    document.querySelector('#action .relative').textContent = 'Craft';
  });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const card = document.querySelector('#card');
    const title = document.querySelector('#title');
    const label = card.querySelector('[data-iw-skill-v2-action-label]');
    const button = document.querySelector('#action');
    const pager = document.querySelector('#pager');
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    return {
      titleRole: title.getAttribute('data-iw-skill-role'),
      titleZone: title.closest('[data-iw-skill-zone]')?.dataset.iwSkillZone || null,
      labelRole: label?.getAttribute('data-iw-skill-role') || null,
      labelText: label?.textContent || null,
      labelFont: label ? parseFloat(getComputedStyle(label).fontSize) : null,
      buttonFont: parseFloat(getComputedStyle(button).fontSize),
      button: box(button), label: label && box(label), pager: box(pager),
      layout: card.dataset.iwSkillLayout,
    };
  });

  assert.equal(result.layout, 'three-zone', 'the transitioned card keeps the supported layout');
  assert.equal(result.titleRole, 'action-title', 'the nested native title remains the action title');
  assert.equal(result.titleZone, 'content', 'the native title remains in the content zone');
  assert.equal(result.labelRole, null, 'the skin-owned visual mirror is excluded from semantic roles');
  assert.equal(result.labelText, 'Craft', 'the visual mirror follows the new native button text');
  assert.ok(result.labelFont <= 10, `the visual mirror stays label-sized, got ${result.labelFont}px`);
  assert.equal(result.buttonFont, 0, 'native button text stays visually suppressed');
  assert.ok(result.pager.y >= result.button.y + result.button.h - 1,
    `pager remains below the button (${result.pager.y} vs ${result.button.y + result.button.h})`);
} finally {
  await browser.close();
}

console.log('PASS skill-card helper role isolation');
