import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { cacheFixture } from '../build-tools/arcane-cache-fixture.mjs';
import { ARCANE_CACHE_REWARDS } from '../src/modules/arcaneCacheRewards.js';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'tmp/arcane-cache');
const TRIGGER = '[data-iw-nav-link="arcane-cache"]';
const BULK = '[data-iw-nav-link="arcane-cache-bulk"]';
const MODAL = 'dialog[data-iw-arcane-cache]';
const MIME = {'.js':'text/javascript','.png':'image/png','.webp':'image/webp','.json':'application/json','.csv':'text/csv','.woff2':'font/woff2'};
const browser = await chromium.launch();
const errors = [];
await mkdir(OUT, {recursive:true});
async function page(options = {}) {
  const tab = await browser.newPage({viewport:{width:1280,height:900}, ...options});
  tab.on('pageerror', error => errors.push(error.message));
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://iw.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:cacheFixture()});
    if (url.pathname === '/items.json') return route.fulfill({contentType:'application/json',body:'[]'});
    try { await route.fulfill({contentType:MIME[extname(url.pathname)] || 'application/octet-stream',body:await readFile(resolve(ROOT, '.'+url.pathname))}); }
    catch { await route.fulfill({status:404,body:''}); }
  });
  await tab.goto('http://iw.test/');
  await tab.locator(TRIGGER).waitFor({state:'attached'});
  return tab;
}
async function waitPhase(tab, phase) {
  await tab.locator(`${MODAL} .scene[data-phase="${phase}"]`).waitFor({state:'attached'});
}
async function toggleSkin(tab, enabled) {
  await tab.evaluate(enabled => window.__skinListeners.forEach(fn => fn({'iw-skin-enabled':{newValue:enabled}}, 'local')), enabled);
}
// Removing the reveal clearance or a responsive card-height override must fail.
async function assertRevealClearance(tab, label) {
  const bounds = await tab.locator('.scene').evaluate(scene => {
    const chest = scene.querySelector('.chest').getBoundingClientRect();
    const cards = [...scene.querySelectorAll('.reward:not([hidden]) .reward-face')].map(el=>el.getBoundingClientRect());
    const status = scene.querySelector('.status').getBoundingClientRect();
    const summary = scene.querySelector('.loot-summary');
    const below = (summary.hidden ? scene.querySelector('.actions') : summary).getBoundingClientRect();
    return { gap: chest.top - Math.max(...cards.map(r=>r.bottom)), headerGap: Math.min(...cards.map(r=>r.top)) - status.bottom,
      belowGap: below.top - chest.bottom };
  });
  assert.ok(bounds.gap >= 12 && bounds.headerGap >= 8 && bounds.belowGap >= 8,
    `${label}: floating cards, full open lid and result controls have separate space: ${JSON.stringify(bounds)}`);
}
async function assertTradingCards(tab, label) {
  const cards = await tab.locator('.reward:not([hidden])').evaluateAll(cards=>cards.map(card=>{
    const face=card.querySelector('.reward-face').getBoundingClientRect();
    const title=card.querySelector('h3').getBoundingClientRect();
    const icon=card.querySelector('.reward-icon').getBoundingClientRect();
    const description=card.querySelector('.reward-description');
    const stats=description.getBoundingClientRect();
    const lines=[...description.children].map(el=>el.getBoundingClientRect());
    const requirement=card.querySelector('.reward-requirement');
    return {portrait:face.height>face.width*1.25, iconWidth:icon.width, iconHeight:icon.height,
      ordered:title.bottom<=icon.top && icon.bottom<=stats.top,
      separate:lines.length>0 && lines.every((line,i)=>!i || line.top>=lines[i-1].bottom-1),
      fits:description.scrollHeight<=description.clientHeight && stats.bottom<=face.bottom-8 && (requirement.hidden || requirement.getBoundingClientRect().bottom<=face.bottom-8)};
  }));
  assert.ok(cards.length && cards.every(c=>c.portrait && c.iconWidth>=112 && Math.abs(c.iconWidth-c.iconHeight)<2 && c.ordered && c.separate && c.fits),
    `${label}: large square artwork above readable separate stats in portrait cards: ${JSON.stringify(cards)}`);
}
try {
  const tab = await page();
  const native = await tab.locator('#rail > button:not([data-iw-nav-link])').elementHandles();
  assert.equal(native.length, 5);
  assert.equal(await tab.locator('[data-iw-nav-link="toolkit"] + ' + TRIGGER).count(), 1);
  assert.equal(await tab.locator(TRIGGER + ' + ' + BULK).count(), 1, 'bulk demo is the next toolbar button');
  assert.equal(await tab.locator(TRIGGER).getAttribute('data-iw-tab'), null);
  await tab.locator(TRIGGER).click();
  await waitPhase(tab, 'waiting');
  await tab.waitForTimeout(900);
  assert.equal(await tab.locator('.scene').getAttribute('data-phase'), 'waiting', 'chest must wait for the player');
  await tab.screenshot({path:resolve(OUT,'waiting-desktop.png')});
  assert.equal(await tab.locator('.reward').count(), 3);
  assert.equal(await tab.locator('.rewards').getAttribute('aria-hidden'), 'true');
  assert.equal(await tab.locator('.open-cache').evaluate(el => el.getRootNode().activeElement === el), true);
  await tab.keyboard.press('Shift+Tab');
  assert.equal(await tab.locator('.exit').evaluate(el => el.getRootNode().activeElement === el), true);
  await tab.keyboard.press('Tab');
  const started = Date.now();
  await tab.keyboard.press('Enter');
  await waitPhase(tab, 'opening');
  const waves = await tab.locator('.shockwave').evaluateAll(es=>es.map(el=>parseFloat(getComputedStyle(el).animationDelay)));
  assert.ok(waves[1] > waves[0], 'the echo shockwave follows the primary burst');
  const anticipation = await tab.locator('.chest').evaluate(el => {
    const animation = el.getAnimations().find(a=>a.animationName==='cache-open');
    const originalTime = animation.currentTime;
    const duration = animation.effect.getTiming().duration;
    animation.pause();
    const sample = fraction => {
      animation.currentTime=duration*fraction;
      const matrix=new DOMMatrix(getComputedStyle(el).transform);
      return {scale:Math.hypot(matrix.m11,matrix.m12),y:matrix.m42};
    };
    const frames=[0,.1,.28,.7].map(sample);
    animation.currentTime=originalTime;
    animation.play();
    return frames;
  });
  assert.ok(anticipation[1].scale < anticipation[0].scale && anticipation[1].y > anticipation[0].y
    && anticipation[2].scale > anticipation[1].scale && anticipation[3].scale < .56 && anticipation[3].y > 100,
    'chest pulls back, swells, then settles smaller and lower: '+JSON.stringify(anticipation));
  await tab.waitForTimeout(1400);
  await tab.screenshot({path:resolve(OUT,'loot-fan-desktop.png')});
  assert.equal(await tab.locator('.actions').isVisible(), false);
  await waitPhase(tab, 'revealed');
  assert.ok(Date.now() - started >= 2850 && Date.now() - started < 4000, 'opening lasts approximately three seconds');
  const rewards = await tab.locator('.reward').allTextContents();
  for (const [i, reward] of ARCANE_CACHE_REWARDS.entries()) {
    assert.ok(rewards[i].includes(reward.name));
    assert.ok(rewards[i].includes('×'+reward.quantity));
    assert.ok(rewards[i].includes(reward.rarity));
  }
  assert.equal(await tab.locator('.reward-icon[data-iw-atlas]').count(), 3, 'all demo reward icons resolve');
  assert.ok((await tab.locator('.reward-description').allTextContents()).every(text=>text.trim()), 'cards contain tooltip descriptions');
  assert.deepEqual(await tab.locator('.reward[data-reward-id="effigy"] .reward-stat').allTextContents(),
    ['XP +12/task','+8% 2x gather chance','+10% gold find','+8% item find']);
  await assertTradingCards(tab, 'desktop');
  assert.equal(await tab.locator('.loot-rare .loot-row[data-reward-id="effigy"]').count(),1, 'single-cache rare items are also listed');
  const floating = tab.locator('.reward-face').first();
  const firstTransform = await floating.evaluate(el=>getComputedStyle(el).transform);
  await tab.waitForTimeout(220);
  assert.notEqual(await floating.evaluate(el=>getComputedStyle(el).transform), firstTransform, 'revealed cards gently float');
  await tab.screenshot({path:resolve(OUT,'rewards-desktop.png')});
  await assertRevealClearance(tab, 'desktop');
  const geometry = await tab.locator('.scene').evaluate(scene => {
    const chest = scene.querySelector('.chest').getBoundingClientRect();
    const actions = scene.querySelector('.actions').getBoundingClientRect();
    return { chestBottom: chest.bottom, actionsTop: actions.top };
  });
  assert.ok(geometry.chestBottom <= geometry.actionsTop, 'settled chest clears result buttons: ' + JSON.stringify(geometry));
  await tab.locator('.replay').click();
  const fall = await tab.locator('.chest').evaluate(el => {
    const animation = el.getAnimations().find(a=>a.animationName==='cache-drop');
    const duration = animation.effect.getTiming().duration;
    animation.pause();
    const y = time => { animation.currentTime=time; return new DOMMatrix(getComputedStyle(el).transform).m42; };
    const fast = Math.abs(y(60)-y(110));
    const arrival = Math.abs(y(300)-y(350));
    animation.play();
    return {duration,fast,arrival};
  });
  assert.ok(fall.duration < 650 && fall.fast > fall.arrival * 2, 'faster drop eases into its landing: '+JSON.stringify(fall));
  await waitPhase(tab, 'waiting');
  const transparentCard = await tab.locator('.reward').first().boundingBox();
  await tab.mouse.click(transparentCard.x + transparentCard.width / 2, transparentCard.y + transparentCard.height / 2);
  assert.equal(await tab.locator('.scene').getAttribute('data-phase'),'opening', 'unrevealed cards must not intercept chest clicks');
  await waitPhase(tab, 'opening');
  await tab.keyboard.press('Escape');
  assert.equal(await tab.locator(MODAL).count(), 0);
  assert.equal(await tab.locator(TRIGGER).evaluate(el => document.activeElement === el), true);
  await tab.locator(TRIGGER).evaluate(el => { el.click(); el.click(); el.click(); });
  assert.equal(await tab.locator(MODAL).count(), 1, 'duplicate launches do not stack');
  await waitPhase(tab, 'waiting');
  await tab.locator('.open-cache').click();
  await toggleSkin(tab, false);
  assert.equal(await tab.locator(MODAL).count(), 0);
  assert.equal(await tab.locator(TRIGGER).count(), 0);
  await tab.waitForTimeout(3100);
  assert.equal(await tab.locator(MODAL).count(), 0, 'cancelled timers cannot resurrect the modal');
  await toggleSkin(tab, true);
  await tab.locator(TRIGGER).waitFor();
  assert.equal(await tab.locator(TRIGGER).count(), 1);
  for (const node of native) assert.equal(await node.evaluate(el=>el.isConnected), true, 'native tabs retain identity');
  await tab.emulateMedia({reducedMotion:'reduce'});
  await tab.locator(TRIGGER).click();
  await waitPhase(tab, 'waiting');
  assert.equal(await tab.locator('.chest').evaluate(el=>getComputedStyle(el).animationName), 'none');
  await tab.keyboard.press('Space');
  await waitPhase(tab, 'revealed');
  for (const width of [320,390,768]) {
    await tab.setViewportSize({width,height:800});
    await tab.waitForFunction(expected=>document.querySelector('dialog > div').shadowRoot.querySelectorAll('.reward:not([hidden])').length===expected, width<=640 ? 1 : 3);
    const metrics = await tab.locator('.reward:not([hidden])').evaluateAll(cards=>cards.map(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,scroll:el.scrollWidth,width:el.clientWidth};
    }));
    assert.ok(metrics.every(r=>r.left>=0 && r.right<=width && r.bottom<=800 && r.scroll<=r.width), JSON.stringify({width,metrics}));
    assert.ok(await tab.locator('.done').isVisible());
    await assertRevealClearance(tab, `single ${width}px`);
    await assertTradingCards(tab, `single ${width}px`);
    await tab.screenshot({path:resolve(OUT,`rewards-${width}.png`)});
  }
  await tab.locator('.done').click();
  await tab.setViewportSize({width:1280,height:900});
  await tab.locator(TRIGGER).click();
  await waitPhase(tab, 'waiting');
  await tab.emulateMedia({reducedMotion:'no-preference'});
  await tab.locator('.open-cache').click();
  await tab.emulateMedia({reducedMotion:'reduce'});
  await waitPhase(tab, 'revealed');
  await tab.close();

  const bulk = await page({reducedMotion:'reduce'});
  await bulk.evaluate(()=>{let seed=42; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
  await bulk.locator(BULK).click();
  await waitPhase(bulk, 'waiting');
  assert.equal(await bulk.locator('.batch-size').inputValue(), '20');
  for (const count of [20,50,100]) {
    await bulk.locator('.batch-size').selectOption(String(count));
    await bulk.locator('.open-cache').click();
    await waitPhase(bulk, 'revealed');
    assert.ok((await bulk.locator('.status').textContent()).includes(`${count} caches`));
    assert.ok(await bulk.locator('.loot-list').isVisible());
    const rows = await bulk.locator('.loot-row').allTextContents();
    assert.ok(rows.some(text=>text.includes('Gold')));
    assert.ok(rows.some(text=>text.includes('Revenant Essence') || text.includes('Night Claw')));
    assert.ok((await bulk.locator('.reward').evaluateAll(es=>es.map(e=>e.dataset.rarity))).every(r=>['rare','epic','legendary','mythic'].includes(r)));
    assert.ok((await bulk.locator('.reward-description').allTextContents()).every(text=>text.trim()));
    assert.ok((await bulk.locator('.reward-requirement').allTextContents()).some(text=>text.includes('Requires')));
    assert.ok(await bulk.getByRole('heading',{name:'Rare Loot',exact:true}).isVisible());
    const featured = await bulk.locator('.reward').evaluateAll(es=>es.map(e=>[e.dataset.rewardId,e.querySelector('.quantity').textContent]));
    const rareRows = await bulk.locator('.loot-rare .loot-row').evaluateAll(es=>es.map(e=>[e.dataset.rewardId,e.querySelector('.loot-quantity').textContent]));
    assert.deepEqual(rareRows,featured,'rare list includes every card stack once, including other pages');
    assert.equal(await bulk.locator('.loot-list details, .loot-list button').count(),0,'loot subheadings are plain, not collapsible');
    const listedBeforePaging = await bulk.locator('.loot-row').allTextContents();
    const cards = bulk.locator('.reward:not([hidden])');
    const seenIds = new Set();
    do {
      for (const id of await cards.evaluateAll(es=>es.map(e=>e.dataset.rewardId))) seenIds.add(id);
      await assertTradingCards(bulk, `bulk ${count} page`);
      if (await bulk.locator('.page-next').isDisabled()) break;
      await bulk.locator('.page-next').click();
    } while (seenIds.size < 20);
    assert.equal(seenIds.size, await bulk.locator('.reward').count(), 'paging exposes every distinct rare reward');
    assert.deepEqual(await bulk.locator('.loot-row').allTextContents(),listedBeforePaging,'paging does not change list quantities');
    assert.equal(await bulk.locator('.reward-face').first().evaluate(el=>getComputedStyle(el).animationName), 'none');
    await bulk.locator('.page-prev').click();
    await assertRevealClearance(bulk, `bulk ${count}`);
    await bulk.screenshot({path:resolve(OUT,`bulk-${count}.png`)});
    await bulk.locator('.replay').click();
    await waitPhase(bulk, 'waiting');
    assert.equal(await bulk.locator('.batch-size').inputValue(), String(count));
    assert.equal(await bulk.locator('.loot-list').isVisible(), false);
  }
  await bulk.locator('.open-cache').click();
  await waitPhase(bulk, 'revealed');
  for (const [width,height] of [[320,900],[390,900],[768,900],[768,600],[1280,600]]) {
    await bulk.setViewportSize({width,height});
    await bulk.waitForFunction(expected=>document.querySelector('dialog > div').shadowRoot.querySelectorAll('.reward:not([hidden])').length===expected, width<=640 ? 1 : 3);
    const bounds = await bulk.locator('.reward:not([hidden]), .loot-list').evaluateAll(es=>es.map(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,sw:el.scrollWidth,cw:el.clientWidth};
    }));
    assert.ok(bounds.every(r=>r.left>=0 && r.right<=width && r.sw<=r.cw), JSON.stringify({width,bounds}));
    await assertRevealClearance(bulk, `bulk ${width}x${height}`);
    await assertTradingCards(bulk, `bulk ${width}x${height}`);
    await bulk.screenshot({path:resolve(OUT,`bulk-responsive-${width}-${height}.png`),fullPage:true});
  }
  await bulk.keyboard.press('Escape');
  assert.equal(await bulk.locator(MODAL).count(),0);
  await bulk.setViewportSize({width:1280,height:900});
  await bulk.evaluate(()=>{Math.random=()=>0;});
  await bulk.locator(BULK).click();
  await waitPhase(bulk,'waiting');
  await bulk.locator('.open-cache').click();
  await waitPhase(bulk,'revealed');
  assert.equal(await bulk.locator('.reward').count(),0);
  assert.ok(await bulk.locator('.no-featured').isVisible());
  assert.equal(await bulk.locator('.loot-rare').isVisible(),false,'no empty rare-loot subheading for an all-common batch');
  assert.equal(await bulk.locator('.loot-row[data-reward-id="gold"] .loot-quantity').textContent(),'×5,000');
  assert.equal(await bulk.locator('.loot-row[data-reward-id="essence"] .loot-quantity').textContent(),'×400');
  await bulk.keyboard.press('Escape');
  await bulk.locator(BULK).click();
  await waitPhase(bulk,'waiting');
  await toggleSkin(bulk,false);
  assert.equal(await bulk.locator(BULK).count(),0);
  assert.equal(await bulk.locator(MODAL).count(),0);
  await bulk.close();

  const broken = await page();
  await broken.route('**/arcane-cache/chest-states.png', route=>route.abort());
  await broken.locator(TRIGGER).click();
  await waitPhase(broken, 'error');
  assert.equal(await broken.locator('.loot-summary').isVisible(), false, 'no reward UI is shown when artwork fails');
  assert.ok(await broken.locator('.status').textContent().then(s=>s.includes('could not load')));
  assert.ok(await broken.locator('[role="status"]').textContent().then(s=>s.includes('could not load')),
    'artwork failures are announced, not only shown visually');
  await broken.keyboard.press('Escape');
  assert.equal(await broken.locator(MODAL).count(), 0);
  await broken.close();
  assert.deepEqual(errors, []);
  console.log('PASS Arcane Cache: interaction, loot, focus, replay, cancellation, lifecycle, assets, reduced motion, responsive layout');
} finally { await browser.close(); }
