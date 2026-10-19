/** The game swaps duplicate panel columns at 1280px without DOM mutations. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], bundle: true,
  write: false, format: 'iife', globalName: 'Fantasy', loader: { '.css': 'text' }, logLevel: 'silent' })).outputFiles[0].text;
const sheet = '<section class="panel"><div class="iw-skill-sheet"><div class="iw-ss-head"><div class="iw-ss-name"><span>Gathering</span></div></div></div></section>';
const action = zone => `<div id="current-action-panel" class="panel" style="display:none"><button aria-label="Cancel current action">Cancel</button><button title="Jump to Zone ${zone}">Gather Eternal Orchid</button></div>`;
const browser = await chromium.launch();
try {
  for (const duplicateSheets of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://action-location.fixture/**', async route => {
      const path = new URL(route.request().url()).pathname;
      try { return await route.fulfill({ body: await readFile(resolve(ROOT, path.slice(1))),
        contentType: ({ '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(path)] || 'text/plain' }); }
      catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.setContent(`<!doctype html><html data-skin="fantasy"><head><style>
      .mobile-column { display:none } @media(max-width:1279px) { .desktop-column { display:none } .mobile-column { display:block } }
      </style></head><body><div data-iw-chrome="shell">
      ${duplicateSheets ? '' : sheet}<div class="desktop-column">${duplicateSheets ? sheet : ''}${action(19)}</div>
      <div class="mobile-column">${duplicateSheets ? sheet : ''}${action(18)}</div></div></body></html>`);
    await page.evaluate(() => {
      window.chrome = { runtime: { id: 'fixture', getURL: path => `http://action-location.fixture/${path}` } };
      window.nativeNodes = [...document.body.querySelectorAll('*')].map(node => [node, node.parentNode]);
    });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => Fantasy.start());
    const note = column => page.locator(duplicateSheets ? `${column} .iwf-skill-location` : '.iwf-skill-location');
    await note('.desktop-column').waitFor();
    assert.equal(await note('.desktop-column').textContent(), 'Currently Gathering in Zone 19');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await note('.mobile-column').textContent(), 'Currently Gathering in Zone 18', 'mobile note must not copy the hidden desktop source');
    assert.equal(await page.locator('.mobile-column #current-action-panel').isVisible(), false, 'queue-hidden action panels remain valid sources');
    await page.locator('.mobile-column #current-action-panel button[title]').evaluate(button => { button.title = 'Jump to Zone 17'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.iwf-skill-location')].some(note => note.textContent === 'Currently Gathering in Zone 17'));
    assert.equal(await note('.mobile-column').textContent(), 'Currently Gathering in Zone 17');
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await note('.desktop-column').textContent(), 'Currently Gathering in Zone 19', 'switching back restores the desktop source');
    assert.ok(await page.evaluate(() => nativeNodes.every(([node, parent]) => node.isConnected && node.parentNode === parent)));
    await page.evaluate(() => Fantasy.stop());
    assert.equal(await page.locator('.iwf-skill-location').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS action location: responsive duplicates, shared sheet, queue-hidden sources, title ticks and teardown');
} finally { await browser.close(); }
