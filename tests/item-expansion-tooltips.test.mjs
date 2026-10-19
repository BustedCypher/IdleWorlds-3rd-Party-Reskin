import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
globalThis.document = { dispatchEvent() {} };
globalThis.chrome = { runtime: { id: 'test', getURL: path => path } };
globalThis.fetch = async path => ({ ok: true,
  json: async () => JSON.parse(await readFile(resolve(ROOT, path), 'utf8')),
  text: async () => readFile(resolve(ROOT, path), 'utf8'),
});
const { AtlasService } = await import('../src/skins/legacy/modules/AtlasService.js');
await AtlasService.ready();
// Independent live item identities: each used to fall through to a category glyph.
for (const [id, name] of [
  ['deepvein_lodestone', 'Deepvein Lodestone'],
  ['hollow_skeleton_key', 'Skeleton Key'],
  ['hollow_scroll_herbing', 'Hollow Scroll of Gathering'],
  ['premium_token', 'Premium Membership Token'],
  ['cinderforged_blade', 'Cinderforged Blade'],
  ['anchorforged_sabatons', 'Anchorforged Sabatons'],
]) {
  assert.equal(AtlasService.resolve({ id, name })?.atlas, 'expansion', `${name} needs its new icon`);
  assert.equal(AtlasService.resolve({ name })?.atlas, 'expansion', `${name} resolves by display name too`);
}
assert.equal(AtlasService.resolve({ name: 'Cinderforged Blade +4' })?.badge, 4);
assert.equal(AtlasService.resolve({ name: 'Imaginary Hollow Trinket' }), null);
assert.equal(AtlasService.resolve({ name: 'Copper Ore' })?.atlas, 'item');

const index = JSON.parse(await readFile(resolve(ROOT, 'assets/item-expansions/index.json')));
for (const item of index.items) {
  assert.equal(AtlasService.resolve({ id: item.item_id })?.entry.path, item.path);
  const png = await readFile(resolve(ROOT, item.path));
  assert.equal(png.subarray(1, 4).toString(), 'PNG', `${item.item_id} ships actual PNG art`);
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 128);
}

const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')],
  bundle: true, write: false, format: 'iife', globalName: 'Fantasy', loader: { '.css': 'text' },
})).outputFiles[0].text;
const portCss = await readFile(resolve(ROOT, 'tests/fixtures/live-2026-10-16/port-fantasy.css'), 'utf8');
const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const missing = [];
    page.on('pageerror', e => { throw e; });
    await page.route('http://iw.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/assets/')) {
        try { return await route.fulfill({ body: await readFile(resolve(ROOT, 'assets', path.split('/assets/')[1])),
          contentType: extname(path) === '.png' ? 'image/png' : 'application/octet-stream' }); }
        catch { missing.push(path); return route.fulfill({ status: 404, body: '' }); }
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-skin="fantasy"><head><style>${portCss}</style>
        <style>body{background:#14130f}#iw-tip{display:flex;position:relative;left:12px;top:12px}</style></head><body>
        <div id="iw-tip" class="iw-tip is-open" role="dialog" aria-label="Deepvein Lodestone item details">
        <div class="iw-tip-head has-art has-gear-art"><div class="iw-tip-art iw-tip-gear-art" aria-hidden="true"><span class="iw-tip-art-fallback">◆</span></div>
        <div class="iw-tip-title-block"><div class="iw-tip-name">Deepvein Lodestone</div></div></div>
        <div class="iw-tip-body">Native stats stay here</div><button id="close">Close</button></div></body></html>` });
    });
    await page.goto('http://iw.test/');
    const nativeArt = await page.locator('.iw-tip-art-fallback').boundingBox();
    await page.evaluate(() => {
      window.original = document.body.innerHTML;
      window.nativeNodes = [...document.body.querySelectorAll('*')].map(el => [el, el.parentNode]);
      window.nativeCloseCount = 0; document.querySelector('#close').onclick = () => window.nativeCloseCount++;
      window.chrome = { runtime: { id: 'test', getURL: p => `http://iw.test/${p}` } };
    });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => Fantasy.start());
    const art = page.locator('[data-iw-fantasy-tooltip-owned].iw-tip-art-host');
    await art.waitFor();
    const first = await art.boundingBox();
    assert.ok(first.width >= 32 && first.height >= 32, 'native tooltip icon keeps its full square slot');
    assert.equal(first.width, nativeArt.width, 'the icon uses the native slot width');
    assert.equal(first.height, nativeArt.height, 'the icon uses the native slot height');
    assert.ok(Math.abs(first.width - first.height) < 1);
    assert.match(await art.evaluate(el => getComputedStyle(el).backgroundImage), /deepvein_lodestone\.png/);
    assert.equal(await page.locator('.iw-tip-art-fallback').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    // React can reuse one tooltip and change only the text, with no new element.
    await page.evaluate(() => document.querySelector('.iw-tip-name').firstChild.data = 'Hollow Scroll of Gathering');
    await page.waitForFunction(() => document.querySelector('[data-iw-fantasy-tooltip-owned].iw-tip-art-host')?.style.backgroundImage.includes('hollow_scroll.png'));
    await page.evaluate(() => document.querySelector('.iw-tip-name').textContent = 'Cinderforged Blade +4');
    await page.waitForFunction(() => document.querySelector('[data-iw-fantasy-tooltip-owned] [data-iw-badge="4"]'));
    await mkdir(resolve(ROOT, 'tmp/item-expansion-tooltips'), { recursive: true });
    await page.locator('#iw-tip').screenshot({ path: resolve(ROOT, `tmp/item-expansion-tooltips/tooltip-${width}.png`) });
    await page.evaluate(() => document.querySelector('.iw-tip-name').textContent = 'Copper Ore');
    await art.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.iw-tip-art-fallback').evaluate(el => getComputedStyle(el).visibility), 'visible');
    await page.evaluate(() => document.querySelector('.iw-tip-name').textContent = 'Deepvein Lodestone');
    await art.waitFor();
    // Reconciliation must settle, rather than writing on every observer pass.
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.writes = 0;
      window.probe = new MutationObserver(records => window.writes += records.length);
      probe.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => writes), 0, 'tooltip decoration is quiescent');
    await page.locator('#close').click();
    assert.equal(await page.evaluate(() => nativeCloseCount), 1, 'native close handler is preserved');
    await page.evaluate(() => { probe.disconnect(); Fantasy.stop(); });
    assert.equal(await page.locator('[data-iw-fantasy-tooltip-owned]').count(), 0);
    assert.equal(await page.locator('[data-iw-fantasy-tooltip-art]').count(), 0);
    assert.ok(await page.evaluate(() => nativeNodes.every(([el, parent]) => el.isConnected && el.parentNode === parent)));
    assert.equal(await page.evaluate(() => document.body.innerHTML), await page.evaluate(() => original));
    assert.deepEqual(missing, [], 'all icon requests load bundled files');
    await page.close();
  }
} finally { await browser.close(); }
console.log(`item expansion tooltips: ${index.items.length} item IDs, native desktop/mobile art, text reuse, controls, quiescence and teardown PASS`);
