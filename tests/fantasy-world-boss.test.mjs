/** Approved Ironbound cards over the native port's nodes, styles and controls. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'output/world-boss-implementation');
const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], bundle: true,
  write: false, format: 'iife', globalName: 'Fantasy', loader: { '.css': 'text' }, logLevel: 'silent' })).outputFiles[0].text;
const portCss = await readFile(resolve(ROOT, 'tests/fixtures/live-2026-10-16/port-fantasy.css'), 'utf8');
const card = (key, name, difficulty, bonus, hours, action, wrapped = false) => `<div id="${key}" class="compact-panel" data-iw-encounter="${key}"><div class="flex" data-iw-boss-role="header"><div class="min-w-0"><p data-iw-boss-role="title">🌍 ${name}</p><p data-iw-boss-role="difficulty">${difficulty}</p><p data-iw-boss-role="buff">Buff on kill: +${bonus} XP/task for ${hours}h</p></div>${wrapped ? '<div class="flex flex-col">' : ''}<button data-iw-boss-role="action" data-iw-boss-action-state="${action === 'Fighting' ? 'fighting' : action.includes('Prejoined') ? 'prejoined' : 'join'}"${action === 'Fighting' ? ' disabled' : ''}>${action}<span data-iw-compact-layer="idle" aria-hidden="true"></span></button>${wrapped ? '</div>' : ''}</div><button class="participation" data-iw-boss-role="participation">World boss participation</button><div class="flex timers" data-iw-boss-role="status"><p data-iw-boss-role="timer">Respawns 55m left</p><p data-iw-boss-role="timer">Buff active 18m 24s left</p></div><details class="iw-boss-rewards" data-iw-boss-owned="1"><summary class="iw-boss-rewards-title">Possible Rewards</summary><div class="iw-boss-reward-list"><button class="iw-boss-reward" data-iw-tooltip-trigger="1">Reward details</button></div></details><div class="iw-boss-art" data-iw-boss-owned="1" aria-hidden="true"></div></div>`;
const html = `<!doctype html><html data-skin="fantasy"><head><meta charset="utf-8"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css"><style>
*,::before,::after{box-sizing:border-box}body{margin:0;background:#060b08;color:#eee4d2;font:14px Barlow,Arial,sans-serif}button{font:inherit;color:inherit}p{margin:0}.flex{display:flex;justify-content:space-between;gap:12px}.flex-col{flex-direction:column}.min-w-0{min-width:0}.panel{width:min(980px,calc(100% - 24px));margin:12px auto;padding:32px}.compact-panel{padding:12px;border:1px solid #333;margin:0 0 16px}.panel>h2{margin:0 0 20px}.iw-boss-rewards[open]{min-height:90px}button{cursor:pointer}.timers{margin-top:12px}
</style></head><body><main class="panel"><h2>World Bosses</h2>${card('ancient_treant', 'Ancient Treant', 'Solo', 4, 1, 'Prejoin', true)}${card('abyssal_behemoth', 'Abyssal Behemoth', 'Raid', 8, 2, 'Fighting')}${card('world_eater', 'World Eater', 'Mythic', 12, 4, '⏳ Prejoined', true)}<div id="zone" class="compact-panel" data-iw-encounter="zone"><div data-iw-boss-role="header"><p data-iw-boss-role="title">Red Team controls Zone 12</p><button data-iw-boss-role="action" data-iw-boss-action-state="join">Join Red!</button></div></div><div class="compact-panel" id="quest"><p>Ancient Treant quest</p><button>Turn In</button></div></main><script>
window.chrome={runtime:{id:'fixture',getURL:path=>location.origin+'/'+path},storage:{local:{get:async()=>({}),set:async()=>{}}}};
window.nativeNodes=[...document.querySelectorAll('body *')].map(node=>[node,node.parentNode]);
window.clicks={join:0,participation:0,reward:0};
document.querySelector('#ancient_treant [data-iw-boss-role=action]').addEventListener('click',()=>clicks.join++);
document.querySelector('#ancient_treant .participation').addEventListener('click',()=>clicks.participation++);
document.querySelector('#ancient_treant .iw-boss-reward').addEventListener('click',()=>clicks.reward++);
window.original=document.querySelector('main').outerHTML;
</script></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1052, height: 1500 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
  if (pathname === '/reskin-bc/theme/fantasy.css') return route.fulfill({ contentType: 'text/css', body: portCss });
  const relative = pathname.replace(/^\/reskin-bc\//, '/').replace(/^\//, '');
  if (relative.startsWith('assets/')) {
    try {
      const body = await readFile(resolve(ROOT, relative));
      return route.fulfill({ body, contentType: ({ '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' })[extname(relative)] || 'text/plain' });
    } catch { return route.abort(); }
  }
  return route.fulfill({ contentType: 'application/json', body: '[]' });
});
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  await page.goto('http://world-boss.fixture/');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => Fantasy.start());
  await settle();
  const boss = page.locator('#ancient_treant');
  assert.equal(await boss.getAttribute('data-iw-fantasy-world-boss'), 'ancient_treant', 'native world boss gets approved Ironbound treatment');
  assert.equal(await page.locator('[data-iw-fantasy-world-boss]').count(), 3, 'only the three actual world bosses are decorated');
  assert.equal(await page.locator('#zone').getAttribute('data-iw-fantasy-world-boss'), null);
  assert.equal(await page.locator('#quest').getAttribute('data-iw-fantasy-world-boss'), null);
  await page.evaluate(() => document.querySelector('main').setAttribute('data-iw-collapsed', '1'));
  assert.equal(await boss.isVisible(), false, 'native World Bosses panel collapse hides the new cards');
  await page.evaluate(() => document.querySelector('main').removeAttribute('data-iw-collapsed'));
  assert.equal(await boss.isVisible(), true, 'native panel expand restores the cards');
  const action = boss.locator('[data-iw-boss-role=action]');
  assert.equal(await action.getAttribute('data-iw-fantasy-world-state'), 'join');
  assert.equal(await page.locator('#world_eater [data-iw-boss-role=action]').getAttribute('data-iw-fantasy-world-state'), 'prejoined');
  assert.equal(await page.locator('#abyssal_behemoth [data-iw-boss-role=action]').getAttribute('data-iw-fantasy-world-state'), 'fighting');
  await action.click();
  await boss.locator('.participation').click();
  await boss.locator('summary').click();
  await boss.locator('.iw-boss-reward').click();
  assert.deepEqual(await page.evaluate(() => clicks), { join: 1, participation: 1, reward: 1 }, 'real controls retain their handlers and hit targets');
  assert.equal(await boss.locator('details').getAttribute('open'), '', 'native rewards disclosure still works');
  await boss.locator('summary').click();
  assert.equal(await page.evaluate(() => nativeNodes.every(([node, parent]) => node.isConnected && node.parentNode === parent)), true, 'native nodes retain identity and parents');
  await page.evaluate(() => {
    const button = document.querySelector('#ancient_treant [data-iw-boss-role=action]');
    button.firstChild.nodeValue = '⏳ Prejoined';
    document.querySelector('#ancient_treant [data-iw-boss-role=status] p').firstChild.nodeValue = 'Respawns 2m 09s left';
  });
  await settle();
  assert.equal(await action.getAttribute('data-iw-fantasy-world-state'), 'prejoined', 'characterData changes update action state');
  assert.ok((await boss.locator('.iwf-wb-timers').textContent()).includes('2m 09s'), 'timer copy updates on text-only ticks');
  const blue = await action.evaluate(button => getComputedStyle(button).backgroundImage);
  assert.match(blue, /40, 86, 127|20, 46, 75/, 'prejoined button is blue');
  await page.evaluate(() => {
    const button = document.querySelector('#ancient_treant [data-iw-boss-role=action]');
    button.firstChild.nodeValue = 'Fighting'; button.disabled = true;
  });
  await settle();
  assert.equal(await action.getAttribute('data-iw-fantasy-world-label'), 'In Combat');
  assert.match(await action.evaluate(button => getComputedStyle(button).backgroundImage), /124, 50, 51|67, 26, 32/, 'in-combat button stays red while disabled');
  await page.evaluate(() => { const button=document.querySelector('#ancient_treant [data-iw-boss-role=action]'); button.firstChild.nodeValue='Defeated'; });
  await settle();
  assert.equal(await action.getAttribute('data-iw-fantasy-world-label'), null, 'unknown and defeated states retain the native word');
  assert.notEqual(await action.evaluate(button => getComputedStyle(button).fontSize), '0px');
  await page.evaluate(() => { const button=document.querySelector('#ancient_treant [data-iw-boss-role=action]'); button.firstChild.nodeValue='Prejoin'; button.disabled=false; });
  await settle();
  await mkdir(OUT, { recursive: true });
  const layouts = [];
  for (const width of [1052, 900, 768, 590, 390, 320]) {
    await page.setViewportSize({ width, height: 1500 });
    await settle();
    const checks = await page.locator('[data-iw-fantasy-world-boss]').evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect();
      const escaped = [...card.querySelectorAll('[data-iw-boss-role=title],[data-iw-boss-role=difficulty],[data-iw-boss-role=action],[data-iw-boss-role=participation],.iwf-wb-timers')].filter(node => { const r=node.getBoundingClientRect(); return r.width && (r.left<box.left-1||r.right>box.right+1||r.bottom>box.bottom+1); }).map(node=>node.getAttribute('data-iw-boss-role')||node.className);
      return { boss:card.getAttribute('data-iw-fantasy-world-boss'), width:box.width, height:box.height, escaped };
    }));
    assert.deepEqual(checks.flatMap(check => check.escaped), [], `${width}px layout does not clip controls or text`);
    layouts.push({ width, cards: checks });
    if (width === 1052 || width === 390) await page.locator('main').screenshot({ path: resolve(OUT, `${width}.png`) });
  }
  // Desktop dashboard columns can be narrow even when the viewport is wide.
  await page.setViewportSize({ width: 1052, height: 1500 });
  for (const cardWidth of [600, 400, 320]) {
    await page.locator('main').evaluate((panel, width) => { panel.style.width = `${width + 64}px`; }, cardWidth);
    await settle();
    const cramped = await page.locator('[data-iw-fantasy-world-boss]').evaluateAll(cards => cards.filter(card => {
      const action = card.querySelector('[data-iw-boss-role=action]').getBoundingClientRect();
      const participation = card.querySelector('[data-iw-boss-role=participation]').getBoundingClientRect();
      return participation.height > 40 || participation.left < action.right + 8 || participation.width < 100;
    }).map(card => card.getAttribute('data-iw-fantasy-world-boss')));
    assert.deepEqual(cramped, [], `${cardWidth}px desktop columns keep participation readable beside the action`);
  }
  await page.locator('main').evaluate(panel => panel.style.removeProperty('width'));
  await page.setViewportSize({ width: 320, height: 1500 });
  await page.evaluate(() => { document.querySelector('#ancient_treant [data-iw-boss-role=status] p:last-child').firstChild.nodeValue = 'No world buff active'; });
  await settle();
  assert.ok((await boss.locator('.iwf-wb-timers').textContent()).includes('No world buff active'), 'inactive buff meaning stays visible');
  assert.equal(await boss.evaluate(card => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('.iwf-wb-timer span')].every(span => {
      const r = span.getBoundingClientRect();
      return r.left >= box.left && r.right <= box.right && span.scrollWidth <= span.clientWidth + 1;
    });
  }), true, 'inactive-buff readout fits the smallest mobile card');
  // An unrecognised timer must remain visible, never be replaced with guessed copy.
  await page.evaluate(() => { document.querySelector('#ancient_treant [data-iw-boss-role=status] p').firstChild.nodeValue='Next event pending confirmation'; });
  await settle();
  assert.equal(await boss.locator('[data-iw-boss-role=status]').isVisible(), true);
  assert.equal(await boss.locator('.iwf-wb-timers').count(), 0);
  // Stop restores what the port supplied (including its own art and roles).
  await page.evaluate(() => Fantasy.stop());
  assert.equal(await page.locator('[data-iw-fantasy-world-boss], [data-iw-fantasy-world-owned], style[data-iw-fantasy-style]').count(), 0);
  assert.equal(await page.locator('.iw-boss-art').count(), 3, 'port artwork is not deleted');
  assert.equal(await page.evaluate(() => nativeNodes.every(([node, parent]) => node.isConnected && node.parentNode === parent)), true);
  assert.deepEqual(errors, []);
  console.log(`Fantasy world bosses: preserved controls, live states, timers, ${layouts.length} responsive layouts and teardown passed.`);
} finally { await browser.close(); }
