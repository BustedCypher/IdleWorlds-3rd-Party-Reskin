/**
 * Boss art belongs to raid EQUIPMENT in the native inventory only. Exercise
 * Fantasy's real lifecycle over the port's InventoryRenderer row shape and
 * captured styles: identity changes, preserved controls, motion and teardown.
 * Negative control: without the inventory pass the first boss assertion fails.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = resolve(ROOT, 'tests/fixtures/live-2026-10-16');
const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')],
  bundle: true, write: false, format: 'iife', globalName: 'Fantasy',
  loader: { '.css': 'text' }, logLevel: 'silent' })).outputFiles[0].text;

// Hand-checked identities, independent of the lookup under test.
const GEAR = [
  ['ashmaw', 'ashmaws_scale_helm', "Ashmaw's Scale Crest"],
  ['thessaly', 'thessalys_storm_grips', "Thessaly's Storm Grips"],
  ['morwenna', 'morwennas_hollow_crown', "Morwenna's Hollow Crown"],
  ['grimjaw', 'grimjaws_bound_plate', "Grimjaw's Bound Plate"],
  ['skarth', 'skarths_rime_helm', "Skarth's Rime Crown"],
];
const atlas = JSON.parse(await readFile(resolve(ROOT, 'assets/raid_gear/index.json'), 'utf8'));
const row = (key, id, name, { equipped = false } = {}) => {
  const item = atlas.items.find(item => item.item_id === id);
  const sprite = item ? `style="background-image:url('/assets/raid_gear/${item.raid}.png');background-size:700% 100%;background-position:${item.x / (atlas.raids[item.raid].width - item.width) * 100}% 0%"` : '';
  return `<div class="compact-row" data-fs-inv="${key}" id="${key}">
  <div class="fs-inv-row fs-cat-gear${equipped ? ' is-equipped' : ''}">
    <div class="fs-inv-icon" ${sprite} ${id ? `data-iw-item="${id}"` : `data-iw-item-name="${name}"`} data-iw-tooltip-trigger="1" tabindex="0" aria-label="${name}, item details"></div>
    <div class="fs-inv-body"><div class="fs-inv-name"><span class="iw-item-ref" role="button" tabindex="0" ${id ? `data-iw-item="${id}"` : `data-iw-item-name="${name}"`} aria-haspopup="dialog" aria-label="${name}, item details"><span class="iw-item-name">${name}</span><span class="iw-item-info" aria-hidden="true">i</span></span><span class="fs-inv-plus">+3</span></div>
      <div class="fs-inv-stats"><span class="fs-stat fs-stat--tier">Tier 10</span><span class="fs-stat">Equipment</span></div>
      <div class="fs-inv-requirements"><span class="fs-inv-requirement">Requires Combat 50</span></div>
    </div><span class="fs-inv-qty">×1</span>
  </div><button data-fs-preserved-action="control" data-fs-action-kind="${equipped ? 'equipped' : 'equip'}" type="button">${equipped ? 'Unequip' : 'Equip'}</button>
</div>`;
};
const rows = GEAR.map(([boss, id, name]) => row(boss, id, name, { equipped: boss === 'grimjaw' })).join('')
  + row('ordinary', 'kingssteel_sword', 'Kingssteel Sword')
  + row('material', 'cindercore_fragment', 'Cindercore Fragment')
  + row('unknown', '', 'Ashmaw-shaped Helmet')
  + row('fallback', '', 'Ashmaw’s Scale Crest +4');
const html = `<!doctype html><html data-skin="fantasy"><head><meta charset="utf-8">
  <link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css">
  <style>body{margin:0;background:#14130f;padding:12px}main{max-width:664px;margin:auto}.compact-row>button{margin-inline:8px;flex-shrink:0}</style>
  </head><body><main><div class="panel" data-iw-inventory-root="1" id="inventory"><h2>Inventory</h2><div data-iw-inventory-list="1">${rows}</div></div>
  <div class="panel"><h2>Salvaging</h2>${row('salvage', 'ashmaws_scale_helm', "Ashmaw's Scale Crest")}</div>
  <div class="iw-tip" role="tooltip">${row('tooltip', 'ashmaws_scale_helm', "Ashmaw's Scale Crest")}</div></main></body></html>`;
const browser = await chromium.launch();
const errors = [];
const requests = [];
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const settle = async page => {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(60);
};
try {
  const page = await browser.newPage({ viewport: { width: 780, height: 1100 } });
  page.on('pageerror', err => errors.push(err.message));
  await page.route('http://iw.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/game.css' || path === '/reskin-bc/theme/fantasy.css') return route.fulfill({ contentType: 'text/css',
      body: await readFile(resolve(FIX, path === '/game.css' ? 'game.css' : 'port-fantasy.css')) });
    if (path.includes('/assets/')) {
      requests.push(path);
      try {
        return route.fulfill({ body: await readFile(resolve(ROOT, 'assets', path.split('/assets/')[1])), contentType: MIME[extname(path)] || 'application/octet-stream' });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://iw.test/');
  await page.evaluate(() => {
    window.before = document.body.innerHTML;
    window.nativeNodes = [...document.body.querySelectorAll('*')].map(el => [el, el.parentElement]);
    window.equips = 0; window.tips = 0;
    document.querySelector('#ashmaw > button').onclick = () => equips++;
    document.querySelector('#ashmaw .fs-inv-icon').onclick = () => tips++;
    window.equippedBorder = getComputedStyle(document.querySelector('#grimjaw .fs-inv-icon')).borderColor;
  });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => Fantasy.start());
  await settle(page);

  for (const [boss] of GEAR) {
    assert.equal(await page.locator(`#${boss} .fs-inv-row`).getAttribute('data-iw-fantasy-raid-gear'), boss,
      `${boss} equipment receives its own boss theme`);
    assert.equal(await page.locator(`#${boss}`).getAttribute('data-iw-fantasy-raid-shell'), boss);
    const art = await page.locator(`#${boss}`).evaluate(el => getComputedStyle(el, '::before').backgroundImage);
    assert.ok(art.includes(`/assets/raids/lobby/${boss}-banner.webp`), `${boss} uses the approved boss artwork`);
    assert.ok(await page.locator(`#${boss} .fs-inv-row`).evaluate(el => {
      const name = el.querySelector('.fs-inv-name .iw-item-ref');
      return name.getAnimations().length > 0 || name.parentElement.getAnimations().length > 0;
    }), `${boss} name has an active animation`);
    const lettering = await page.locator(`#${boss} .fs-inv-name .iw-item-ref`).evaluate(el => {
      const style = getComputedStyle(el);
      return { fill: style.webkitTextFillColor, background: style.backgroundImage, clip: style.backgroundClip, display: style.display };
    });
    assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(lettering.fill) || (lettering.background !== 'none' && lettering.clip === 'text'),
      `${boss} name has visible lettering, not only a glow: ${JSON.stringify(lettering)}`);
    assert.equal(await page.locator(`#${boss} [data-iw-fantasy-raid-badge]`).count(), 1);
    assert.equal(await page.locator(`#${boss} .fs-inv-plus`).textContent(), '+3', 'enhancement state stays visible');
  }
  assert.equal(await page.locator('#fallback .fs-inv-row').getAttribute('data-iw-fantasy-raid-gear'), 'ashmaw',
    'exact name fallback accepts curly apostrophes and an upgrade suffix');
  for (const id of ['ordinary', 'material', 'unknown', 'salvage', 'tooltip']) {
    assert.equal(await page.locator(`#${id}`).getAttribute('data-iw-fantasy-raid-shell'), null,
      `${id} does not gain an equipment treatment`);
  }
  assert.equal(await page.locator('#grimjaw .fs-inv-icon').evaluate(el => getComputedStyle(el).borderColor),
    await page.evaluate(() => equippedBorder), 'equipped icon keeps its state colour');
  await page.locator('#ashmaw > button').click();
  await page.locator('#ashmaw .fs-inv-icon').click();
  assert.deepEqual(await page.evaluate(() => [equips, tips]), [1, 1], 'boss artwork never intercepts item controls');
  assert.equal(await page.evaluate(() => nativeNodes.every(([el, parent]) => el.isConnected && el.parentElement === parent)),
    true, 'game and port nodes keep their identities and parents');

  for (const boss of ['morwenna', 'skarth']) {
    const positions = await page.locator(`#${boss} .fs-inv-name .iw-item-ref`).evaluate(el => {
      const animation = el.getAnimations()[0];
      const duration = animation.effect.getTiming().duration;
      animation.pause();
      const positions = [0, duration / 3, duration * 2 / 3].map(time => {
        animation.currentTime = time;
        return getComputedStyle(el).backgroundPosition;
      });
      animation.play();
      return positions;
    });
    assert.ok(new Set(positions).size > 1, `${boss} shimmer actually moves through the native link reset`);
  }
  for (const width of [320, 390, 768, 1400]) {
    await page.setViewportSize({ width, height: 1200 });
    await settle(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px has no horizontal overflow`);
    for (const [boss] of GEAR) {
      const name = await page.locator(`#${boss} .fs-inv-name`).boundingBox();
      const icon = await page.locator(`#${boss} .fs-inv-icon`).boundingBox();
      const button = await page.locator(`#${boss} > button`).boundingBox();
      assert.ok(name.x >= icon.x + icon.width && (name.x + name.width <= button.x + 1 || name.y + name.height <= button.y),
        `${width}px ${boss} name fits beside the icon and controls: ${JSON.stringify({ name, icon, button })}`);
    }
  }
  await page.evaluate(() => {
    window.mutations = 0;
    window.probe = new MutationObserver(records => mutations += records.length);
    probe.observe(document.querySelector('#inventory'), { subtree: true, attributes: true, childList: true, characterData: true });
  });
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => mutations), 0, 'settled animated rows do not mutate the DOM');
  await page.evaluate(() => probe.disconnect());

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#inventory').evaluate(el => el.getAnimations({ subtree: true }).length), 0,
    'reduced motion disables both outline and name animation');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => Fantasy.stop());
  assert.equal(await page.evaluate(() => document.body.innerHTML === before), true, 'stop restores the exact original inventory markup');
  await page.evaluate(() => Fantasy.start());
  await settle(page);
  assert.equal(await page.locator('#inventory [data-iw-fantasy-raid-badge]').count(), 6, 'restart adds one badge per raid item');

  await mkdir(resolve(ROOT, 'tmp/raid-gear'), { recursive: true });
  for (const width of [390, 780]) {
    await page.setViewportSize({ width, height: 1150 });
    await settle(page);
    await page.locator('#inventory').screenshot({ path: resolve(ROOT, `tmp/raid-gear/inventory-${width}.png`) });
  }
  await page.evaluate(() => document.querySelector('#fallback .iw-item-ref').removeAttribute('data-iw-item-name'));
  await settle(page);
  assert.equal(await page.locator('#fallback').getAttribute('data-iw-fantasy-raid-shell'), 'ashmaw', 'nested item-name fallback excludes the native info glyph');
  await page.evaluate(() => {
    document.querySelector('#fallback .iw-item-name').firstChild.nodeValue = 'Morwenna’s Hollow Crown';
  });
  await settle(page);
  assert.equal(await page.locator('#fallback').getAttribute('data-iw-fantasy-raid-shell'), 'morwenna', 'a text-only identity change updates the boss without a structural flush');

  // The port can recycle a row, and updates to its semantic id may be the
  // only change. An authoritative non-raid id must beat the old visible name.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#ashmaw [data-iw-item]')) el.setAttribute('data-iw-item', 'kingssteel_sword');
  });
  await settle(page);
  assert.equal(await page.locator('#ashmaw').getAttribute('data-iw-fantasy-raid-shell'), null, 'identity-only row recycling clears the old boss');
  assert.equal(await page.locator('#ashmaw [data-iw-fantasy-raid-badge]').count(), 0);
  await page.evaluate(() => {
    const row = document.querySelector('#ordinary');
    for (const el of row.querySelectorAll('[data-iw-item]')) el.setAttribute('data-iw-item', 'skarths_rime_helm');
    row.querySelector('.iw-item-name').firstChild.nodeValue = "Skarth's Rime Crown";
  });
  await settle(page);
  assert.equal(await page.locator('#ordinary').getAttribute('data-iw-fantasy-raid-shell'), 'skarth', 'an ordinary row can become raid gear');
  await page.evaluate(() => {
    const row = document.querySelector('#ordinary');
    const copy = row.querySelector('.fs-inv-row').cloneNode(true);
    copy.querySelectorAll('[data-iw-fantasy-owned]').forEach(el => el.remove());
    copy.removeAttribute('data-iw-fantasy-raid-gear');
    for (const el of copy.querySelectorAll('[data-iw-item]')) el.setAttribute('data-iw-item', 'morwennas_hollow_crown');
    copy.querySelector('.iw-item-name').firstChild.nodeValue = "Morwenna's Hollow Crown";
    row.querySelector('.fs-inv-row').replaceWith(copy);
  });
  await settle(page);
  assert.equal(await page.locator('#ordinary').getAttribute('data-iw-fantasy-raid-shell'), 'morwenna', 'port overlay replacement gets a fresh boss decoration');
  assert.equal(await page.locator('#ordinary [data-iw-fantasy-raid-badge]').count(), 1);

  for (const [boss] of GEAR) assert.ok(requests.includes(`/assets/raids/lobby/${boss}-banner.webp`), `${boss} art actually loads`);
  assert.deepEqual(errors, [], 'no runtime errors');
  console.log('Fantasy raid gear: all five bosses, exact identity, preserved controls/state, responsive layout, motion and lifecycle passed.');
} finally {
  await browser.close();
}
