/** Selected-skill artwork survives native sheet handover without owning game controls.
 * Gathering details are reconstructed; the zone-bar markup was supplied
 * from the live DOM by Curtis on 2026-10-19. Blue CSS emulates the native conflict.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = resolve(ROOT, 'tests/fixtures/live-2026-10-16');
const fixture = await readFile(resolve(FIX, 'skills-quests.html'), 'utf8');
const gameSheetCss = fixture.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], bundle: true,
  write: false, format: 'iife', globalName: 'Fantasy', loader: { '.css': 'text' }, logLevel: 'silent' })).outputFiles[0].text;
const gathering = `<div class="iw-skill-sheet">
  <div class="iw-ss-head"><span class="iw-ss-icon" aria-hidden="true">🌿</span><div class="iw-ss-title">
    <div class="iw-ss-name"><span>Gathering</span><span class="iw-ss-level">Lv 69<span class="iw-ss-boost">+6</span></span><span class="iw-xp-chip-wrap"><span class="iw-xp-chip" tabindex="0" aria-label="XP bonuses">⚡ +170% XP</span><span id="xp-tooltip" role="tooltip">Daily +20% · Zone +10%</span></span></div>
    <div class="iw-ss-xpbar"><span style="width:19.1%"></span></div><div class="iw-ss-sub">Lv 69+6 - 12.82M/67.13M XP · Gather herbs (for potions) and fibers (for cloth).</div>
  </div></div>
  <div class="iw-ss-zone iw-ss-zonebar"><span class="iw-ss-zone-icon" aria-hidden="true">📍</span><div class="iw-ss-zone-text"><b>Zone 20</b> · Astral Crucible</div><div class="iw-ss-zonebar-btns"><button type="button" class="iw-ss-zone-go" title="Travel to Zone 19: Eternium Verge">‹ 19</button><button type="button" class="iw-ss-zone-go" title="Pick a zone (shows what Gathering can do in each)">🌐 Zones</button><button type="button" class="iw-ss-zone-go" title="Travel to Zone 21: Gravite Maw">21 ›</button></div></div>
  <div class="iw-ss-rows"><div class="iw-ss-row is-locked"><div class="iw-ss-main"><div class="iw-ss-rowname"><span>Gather Astral Bloom</span><span class="iw-ss-xp">+234 XP</span></div><div class="iw-ss-lock">🔒 Needs level 77</div></div><button class="iw-ss-start" disabled>Gather</button></div>
    <div class="iw-ss-row is-locked"><div class="iw-ss-main"><div class="iw-ss-rowname"><span>Gather Astral Silk</span><span class="iw-ss-xp">+234 XP</span></div><div class="iw-ss-lock">🔒 Needs level 77</div></div><button class="iw-ss-start" disabled>Gather</button></div></div>
</div>`;
const nativeCss = `.iw-skill-sheet{border:1px solid #38303f;border-radius:12px;gap:0;background:#110e15}
  .iw-ss-head{border:0;background:linear-gradient(#211b28,#110e15)}
  .iw-ss-zonebar{display:flex;flex-wrap:wrap;padding:16px;border-left:4px solid #2198c6!important;background:#10100e!important}
  .iw-ss-zonebar-btns{display:flex;flex-basis:100%;gap:8px;margin-top:12px}.iw-ss-zonebar .iw-ss-zone-go{flex:1;min-height:44px;padding:12px!important;border:1px solid #2198c6!important;background:linear-gradient(#174457,#08202c)!important;color:#38bdf8!important}
  .iw-ss-row{border:0;border-top:1px solid #27222b;border-radius:0;background:transparent;padding:16px}
  .iw-xp-chip-wrap{position:relative}.iw-xp-chip{border:1px solid #846b29;border-radius:20px;padding:3px 9px}
  #xp-tooltip{position:absolute;bottom:100%;right:0;width:220px;padding:8px;background:#15120c;display:none;z-index:10}
  .iw-xp-chip:focus+#xp-tooltip{display:block}`;
const mime = { '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const browser = await chromium.launch();
try {
  for (const [width, native] of [[320,true],[390,true],[600,true],[768,true],[769,true],[1606,true],[390,false]]) {
    const mobile = width <= 768;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.route('http://iw.test/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-skin="fantasy"><head><meta charset="utf-8"><link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css"><style>${gameSheetCss}</style>${native ? '<link rel="stylesheet" href="/reskin-bc/theme/native-sheet.css">' : `<style>${nativeCss}</style>`}<style>body{margin:0;padding:20px 12px;background:#0c0e0d}main{max-width:600px;margin:auto}</style></head><body><main>${gathering}</main></body></html>` });
        if (path === '/reskin-bc/theme/native-sheet.css') return route.fulfill({ contentType: 'text/css', body: nativeCss });
        const file = path === '/game.css' ? resolve(FIX, 'game.css')
          : path === '/reskin-bc/theme/fantasy.css' ? resolve(FIX, 'port-fantasy.css')
          : path.startsWith('/__extension__/assets/') ? resolve(ROOT, 'assets', path.slice('/__extension__/assets/'.length))
          : path.startsWith('/reskin-bc/assets/') ? resolve(ROOT, 'assets', path.slice('/reskin-bc/assets/'.length)) : null;
        if (!file) return route.fulfill({ status: 404, body: '' });
        try { return route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: '' }); }
      });
      await page.goto('http://iw.test/');
      await page.evaluate(() => {
        window.chrome = { runtime: { id: 'frame-test', getURL: path => `${location.origin}/__extension__/${path}` } };
        [...document.querySelectorAll('.iw-ss-zonebar .iw-ss-zone-go')].forEach((button,i) => { button.id = ['prev','zones','next'][i]; });
        window.originalNodes = [...document.querySelectorAll('main *')];
        window.presses = [];
        for (const b of document.querySelectorAll('button')) b.onclick = () => presses.push(b.id || b.textContent);
        window.originalFrame = document.querySelector('main').innerHTML;
      });
      await page.addScriptTag({ content: script });
      await page.evaluate(() => Fantasy.start());
      await page.waitForTimeout(250);
      const frame = page.locator('.iw-skill-sheet');
      assert.equal(await page.locator('.iw-ss-zonebar-btns').isVisible(), mobile, `${width}px: skill-panel travel is mobile only`);
      const paint = await frame.evaluate(el => ({ ground: getComputedStyle(el).backgroundImage,
        corners: getComputedStyle(el,'::before').borderImageSource,
        medal: getComputedStyle(el.querySelector('.iw-ss-icon')).backgroundImage,
        button: getComputedStyle(el.querySelector('#zones')).backgroundImage,
        nativeDown: !document.querySelector('style[data-iw-fantasy-style="skills"]') }));
      assert.match(paint.ground, /__extension__\/assets\/skills_panel_texture\.webp/, 'the selected sheet must use the Fantasy texture even after native handover');
      assert.equal(paint.corners, 'none', 'subframes must not carry corner ornaments');
      assert.match(paint.medal, /__extension__\/assets\/skills_icons_atlas\.webp/, 'the selected skill must reuse its painted medallion');
      assert.match(paint.button, /compact-ghost-v3/, 'the existing travel controls must use the Fantasy atlas');
      const zoneLayout = await frame.evaluate(el => {
        const head = el.querySelector('.iw-ss-head').getBoundingClientRect();
        const zone = el.querySelector('.iw-ss-zonebar'), css = getComputedStyle(zone), box = zone.getBoundingClientRect();
        return { gap: box.top-head.bottom, height:box.height, border:css.borderLeftWidth, divider:css.borderTopWidth, background:css.backgroundImage,
          buttons:[...zone.querySelectorAll('button')].map(b => b.getBoundingClientRect().height) };
      });
      assert.equal(zoneLayout.border, '0px', 'the native blue side rail is removed');
      assert.equal(zoneLayout.divider, '0px', 'zone controls share the skill-info frame without another divider');
      assert.equal(zoneLayout.background, 'none', 'zone controls share the skill-info surface');
      assert.ok(Math.abs(zoneLayout.gap) < 1 && zoneLayout.height <= 64, 'zone controls sit compactly beneath skill info');
      assert.ok(zoneLayout.buttons.every(h => mobile ? h >= 27 && h <= 29 : h === 0), 'zone buttons are a thin mobile row and take no desktop space');
      await page.locator('#zones').evaluate(el => el.setAttribute('data-iw-compact-button', 'text'));
      assert.equal(await page.locator('#zones').evaluate(el => getComputedStyle(el,'::before').content), 'none', 'already-plated native controls must not receive duplicate frame caps');
      assert.equal(await page.locator('#zones').evaluate(el => getComputedStyle(el,'::after').content), 'none', 'already-plated native controls keep their own right cap');
      await page.locator('#zones').evaluate(el => el.removeAttribute('data-iw-compact-button'));
      assert.equal(paint.nativeDown, native, 'the art layer must preserve native full-sheet handover');
      const urls = [paint.ground,paint.corners,paint.medal,paint.button].flatMap(s => [...s.matchAll(/url\("([^"]+)"\)/g)].map(m => m[1]));
      assert.equal(await page.evaluate(async urls => (await Promise.all(urls.map(async url => {
        const image = new Image(); image.src = url; try { await image.decode(); return true; } catch { return false; }
      }))).every(Boolean), urls), true, 'every painted asset must decode, with game /assets unavailable');
      await page.locator('.iw-ss-row').first().hover();
      assert.equal(await page.waitForFunction(() => {
        const el = document.querySelector('.iw-ss-row');
        const css = getComputedStyle(el); return css.backgroundImage !== 'none' || css.backgroundColor !== 'rgba(0, 0, 0, 0)';
      }, null, { timeout: 1200 }).then(() => true, () => false), true, 'the frame must retain native row hover feedback');
      await page.locator('.iw-ss-name').hover();
      if (mobile) {
        for (const id of ['prev','zones','next']) await page.locator('#'+id).click();
        assert.deepEqual(await page.evaluate(() => presses), ['prev','zones','next']);
        const idleButton = await page.locator('#prev').evaluate(el => getComputedStyle(el).backgroundPositionY);
        await page.locator('#prev').hover();
        assert.notEqual(await page.locator('#prev').evaluate(el => getComputedStyle(el).backgroundPositionY), idleButton, 'button hover uses the matching atlas state');
      }
      assert.equal(await page.locator('.iw-ss-start:disabled').count(), 2, 'locked skills must remain disabled');
      if (mobile) {
        await page.keyboard.press('Tab');
        await page.locator('#zones').focus();
        assert.notEqual(await page.locator('#zones').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'keyboard focus remains visible');
      }
      await page.locator('.iw-xp-chip').focus();
      assert.equal(await page.locator('#xp-tooltip').isVisible(), true, 'the XP tooltip remains available');
      assert.equal(await frame.evaluate(el => getComputedStyle(el).overflow), 'visible', 'ornaments must not clip the XP tooltip');
      assert.equal(await page.evaluate(() => originalNodes.every(el => el.isConnected)), true, 'all original gameplay nodes survive');
      assert.equal(await page.locator('.iw-ss-xpbar>span').evaluate(el => el.style.width), '19.1%', 'the game still owns XP progress');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px: frame fits the viewport`);
      // A later native sheet must not retire or repaint the selected art.
      await page.addStyleTag({ content: nativeCss });
      assert.match(await frame.evaluate(el => getComputedStyle(el).backgroundImage), /skills_panel_texture/);
      if (!native) {
        await page.evaluate(() => {
          const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/reskin-bc/theme/native-sheet.css';
          document.head.append(link);
        });
        await page.waitForFunction(() => [...document.styleSheets].some(s => s.href?.endsWith('/native-sheet.css')));
        await page.evaluate(() => document.body.classList.add('native-theme-arrived'));
        await page.waitForFunction(() => !document.querySelector('style[data-iw-fantasy-style="skills"]'));
        assert.match(await frame.evaluate(el => getComputedStyle(el).backgroundImage), /skills_panel_texture/, 'handover preserves the frame art');
        assert.equal(await page.locator('.iw-ss-head').getAttribute('data-iw-fantasy-skill'), 'gathering', 'handover preserves the header medallion');
      }
      const iconBefore = await page.locator('.iw-ss-icon').evaluate(el => getComputedStyle(el).backgroundPosition);
      await page.locator('.iw-ss-name>span:first-child').evaluate(el => { el.textContent = 'Alchemy'; });
      await page.waitForFunction(() => document.querySelector('.iw-ss-head').getAttribute('data-iw-fantasy-skill') === 'alchemy');
      assert.notEqual(await page.locator('.iw-ss-icon').evaluate(el => getComputedStyle(el).backgroundPosition), iconBefore, 'native text-only skill switches update the medallion');
      await page.locator('.iw-ss-name>span:first-child').evaluate(el => { el.textContent = 'Gathering'; });
      await page.waitForFunction(() => document.querySelector('.iw-ss-head').getAttribute('data-iw-fantasy-skill') === 'gathering');
      if (width === 1606) {
        await page.locator('.iw-xp-chip').blur();
        await mkdir(resolve(ROOT, 'tmp/skill-frame'), { recursive: true });
        await frame.screenshot({ path: resolve(ROOT, 'tmp/skill-frame/gathering-desktop.png') });
      }
      if (width === 390 && native) {
        await page.locator('.iw-xp-chip').blur();
        await mkdir(resolve(ROOT, 'tmp/skill-frame'), { recursive: true });
        await frame.screenshot({ path: resolve(ROOT, 'tmp/skill-frame/gathering-mobile.png') });
        await page.evaluate(() => document.documentElement.style.setProperty('--iw-corner-filigree', 'url("/__extension__/assets/skills-ui/panel_corners_voidborn.webp")'));
        assert.equal(await frame.evaluate(el => getComputedStyle(el,'::before').borderImageSource), 'none', 'zone theme changes must not add subframe corner ornaments');
      }
      await page.evaluate(() => Fantasy.stop());
      assert.equal(await page.locator('main').innerHTML(), await page.evaluate(() => originalFrame), 'stop restores the entire native frame');
      console.log(`PASS ${width}px ${native ? 'native' : 'extension'} sheet: artwork, controls, progress, tooltip, fit and teardown`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
