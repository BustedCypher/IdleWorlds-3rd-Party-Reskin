/** Native handler forwarding, responsive source swaps, modal access and full teardown. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = resolve(ROOT, 'tests/fixtures/live-2026-10-16');
const script = (await build({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')],
  bundle: true, write: false, format: 'iife', globalName: 'Fantasy', loader: { '.css': 'text' }, logLevel: 'silent' })).outputFiles[0].text;
const routeNames = ['Game', 'Market', 'Leaderboards', 'Village', 'Guild', 'Dungeon'];
const nav = (id = 'nav') => `<div class="panel" data-iw-chrome="nav" id="${id}">${routeNames.map(name => name === 'Dungeon'
  ? '<button data-iw-ui="nav-tab" data-iw-tab="dungeon" id="dungeon">Dungeon</button>'
  : `<a href="${name === 'Game' ? '/' : name === 'Village' ? '/housing' : '/' + name.toLowerCase()}" data-iw-ui="nav-tab" data-iw-tab="${name.toLowerCase()}"${name === 'Game' ? ' data-iw-state="active"' : ''}>${name}</a>`).join('')}<a href="https://idleworldstoolkit.com" target="_blank" rel="noopener noreferrer" data-iw-ui="nav-tab" data-iw-nav-link="toolkit">Toolkit</a></div>`;
// Match the native port, including its flex-wrap utilities, nested picker
// label and compact-atlas layers. Plain text buttons missed the mobile bug.
const atlasLayers = ['idle','hover','clicked'].map(state => `<span data-iw-compact-layer="${state}" aria-hidden="true"></span>`).join('');
const zone = `<div class="panel flex flex-col gap-2 p-3 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between" data-iw-ui="zone-bar" data-iw-chrome="zone-bar" data-iw-header="zone-shell"><div data-iw-chrome="zone-text"><p class="flex items-center gap-1.5 font-semibold text-white"><span data-iw-ui="zone-title">🧭 Zone 18: Kingsfall Citadel</span><button data-iw-zone-link="1" id="presence">who's here?</button></p><p id="zone-detail">Next zone target: ATK 287 / DEF 291</p></div><div class="flex flex-wrap gap-2" data-iw-chrome="zone-actions"><label data-iw-theme-toggle="on"><input id="themes" type="checkbox" checked>Zone themes</label><button class="button-secondary px-3 py-2 text-xs" data-iw-zone-action="zones" data-iw-ui="zone-action" data-iw-compact-button="text" id="zones"><span aria-hidden="true">🌐</span><span class="ml-1 text-xs">Zones</span>${atlasLayers}</button><button class="button-secondary px-3 py-2 text-xs" data-iw-zone-action="prev" data-iw-ui="zone-action" data-iw-compact-button="text" id="prev">Previous Zone${atlasLayers}</button><button class="button-secondary px-3 py-2 text-xs" data-iw-zone-action="next" data-iw-ui="zone-action" data-iw-compact-button="text" id="next">Next Zone${atlasLayers}</button></div></div>`;
const shell = (id, navigation = nav()) => `<div data-iw-chrome="shell" id="${id}"><header><h1>Player</h1><button data-iw-header="utility-button" title="Settings" id="settings">⚙</button></header>${navigation}<div data-iw-chrome="notice" id="notice">A message from the game</div>${zone}<section class="panel" data-iw-ui="section-frame"><div data-iw-collapse-head="1"><div data-iw-collapse-spine="1"><h2 data-iw-ui="section-title">Skill Actions</h2><div><p data-iw-skill-boost="1">Daily XP Boost: Gathering + 20 % XP</p><p>Resets in 15:30</p></div></div><button data-iw-collapse="1" aria-label="Collapse Skill Actions" aria-expanded="true"></button></div><div class="iw-skill-tabs" role="tablist" aria-label="Skills"></div><div class="iw-skill-sheet"><button id="game-action">Mine</button></div></section></div>`;
const html = contents => `<!doctype html><html lang="en" data-skin="fantasy"><head><meta charset="utf-8"><link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css"><style>body{margin:0}#root{padding:12px;max-width:1100px;margin:auto}.wide{display:none}@media(min-width:1280px){.wide{display:block}.narrow{display:none}}</style></head><body><div id="root">${contents}</div><script>window.calls={};for(const el of document.querySelectorAll('a,button,input')){el.addEventListener(el.matches('input')?'change':'click',event=>{if(el.matches('a'))event.preventDefault();const key=el.id||el.textContent;window.calls[key]=(window.calls[key]||0)+1;window.dialogWasClosed=!document.querySelector('[data-iw-fantasy-nav-host]')?.shadowRoot?.querySelector('dialog[open]');});}window.gameNodes=[...document.querySelectorAll('#root *')];</script></body></html>`;
const browser = await chromium.launch();
const errors = [];
async function open(width = 390, contents = shell('shell')) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(4000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://iw.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html(contents) });
    if (path === '/game.css' || path === '/reskin-bc/theme/fantasy.css') return route.fulfill({ contentType: 'text/css', body: await readFile(resolve(FIX, path === '/game.css' ? 'game.css' : 'port-fantasy.css')) });
    if (path.startsWith('/assets/') || path.startsWith('/reskin-bc/assets/')) {
      try { return route.fulfill({ body: await readFile(resolve(ROOT, 'assets', path.split('/assets/')[1])) }); } catch { /* optional fixture art */ }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://iw.test/');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-iw-compact-atlas', 'compact-ghost-v3');
    document.documentElement.style.setProperty('--iw-compact-atlas', 'url("/assets/skills-ui/buttons/compact-ghost-v3/infernal.png")');
  });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => { window.beforeStart = document.querySelector('#root').innerHTML; Fantasy.start(); });
  await settle(page);
  return page;
}
async function settle(page) { await page.waitForTimeout(100); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
const host = (page, layout = 'mobile') => page.locator(`[data-iw-fantasy-nav-host="${layout}"]`);
const mainNavigation = (page, layout = 'mobile') => host(page, layout).getByRole('navigation', { name: 'Main navigation', exact: true });
const primary = (page, name, layout = 'mobile') => mainNavigation(page, layout).getByRole(name === 'Dungeon' || name === 'More' ? 'button' : 'link', { name, exact: true });
async function more(page, layout = 'mobile') { await primary(page, 'More', layout).click(); return host(page, layout).locator('dialog'); }

try {
  const page = await open();
  assert.equal(await host(page).count(), 1, 'a mobile dock must mount on the existing navigation');
  assert.equal(await page.evaluate(() => gameNodes.every(n => n.isConnected)), true, 'game nodes must not be moved or replaced');
  assert.deepEqual(await mainNavigation(page).locator('.primary .destination-label').allTextContents(), ['Game', 'Market', 'Village', 'Guild'], 'Guild replaces Dungeon in the primary navigation');
  for (const name of ['Game', 'Market', 'Village', 'Guild']) await primary(page, name).click();
  for (const name of ['Dungeon', 'Leaderboards']) { const menu = await more(page); await menu.getByRole(name === 'Dungeon' ? 'button' : 'link', { name, exact: true }).click(); }
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(['Game','Market','Village','dungeon','Guild','Leaderboards'].map(k => [k, calls[k]]))),
    { Game: 1, Market: 1, Village: 1, dungeon: 1, Guild: 1, Leaderboards: 1 }, 'each proxy must activate its original control exactly once');
  assert.equal(await page.evaluate(() => dialogWasClosed), true, 'close More before a native control can open its own modal');
  let menu = await more(page);
  const toolkit = menu.getByRole('link', { name: 'Toolkit', exact: true });
  assert.equal(await toolkit.getAttribute('href'), 'https://idleworldstoolkit.com/');
  assert.equal(await toolkit.getAttribute('target'), '_blank');
  assert.equal(await toolkit.getAttribute('rel'), 'noopener noreferrer');
  await menu.getByRole('button', { name: /who.s here/i }).click();
  assert.equal(await page.evaluate(() => calls.presence), 1);
  menu = await more(page); await menu.getByRole('checkbox', { name: 'Zone themes', exact: true }).uncheck();
  assert.equal(await page.locator('#themes').isChecked(), false, 'theme changes must reach the original setting');
  assert.equal(await page.evaluate(() => calls.themes), 1);
  assert.equal(await menu.evaluate(el => el.open), true, 'changing a setting keeps More open');
  await page.evaluate(() => { document.querySelector('#themes').checked=true; document.querySelector('#nav').classList.add('setting-refresh'); }); await settle(page);
  await page.evaluate(() => { document.querySelector('#themes').checked=false; });
  await menu.getByRole('checkbox', {name:'Zone themes',exact:true}).uncheck();
  assert.equal(await page.locator('#themes').isChecked(), false, 'a stale checkbox must preserve the requested off state rather than toggle it on');
  assert.equal(await page.evaluate(() => calls.themes), 1, 'do not dispatch a redundant native toggle when the requested value already matches');
  await page.evaluate(() => { document.querySelector('#themes').checked=true; document.querySelector('[data-iw-theme-toggle]').setAttribute('data-iw-theme-toggle','on'); }); await settle(page);
  assert.equal(await menu.getByRole('checkbox', {name:'Zone themes',exact:true}).isChecked(), true, 'open settings follow native theme state updates');
  await page.keyboard.press('Escape');
  assert.equal(await primary(page, 'More').evaluate(el => el.getRootNode().activeElement === el), true, 'Escape returns focus to More');
  await page.evaluate(() => { history.pushState({}, '', '/guild'); document.querySelector('[data-iw-tab="guild"]').classList.add('bg-ember'); document.querySelector('#dungeon').disabled = true; });
  await settle(page);
  assert.equal(await primary(page, 'Guild').getAttribute('aria-current'), 'page', 'Guild is active directly in the primary navigation');
  assert.equal(await primary(page, 'More').getAttribute('aria-current'), null, 'Guild no longer marks More active');
  menu = await more(page);
  assert.equal(await menu.getByRole('button', {name:'Dungeon',exact:true}).isDisabled(), true, 'native disabled state must remain disabled in More');
  await page.evaluate(() => { const d=document.querySelector('#dungeon');d.title='Requires combat level 25';d.setAttribute('aria-label','Dungeon — requires combat level 25');document.querySelector('#nav').classList.add('requirements-updated'); });await settle(page);
  assert.equal(await menu.getByRole('button', {name:'Dungeon — requires combat level 25',exact:true}).getAttribute('title'), 'Requires combat level 25', 'locked-control explanations and accessible names are retained');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {history.replaceState({}, '', '/dungeon');document.querySelector('#nav').classList.add('dungeon-route');});await settle(page);
  assert.equal(await primary(page, 'More').getAttribute('aria-current'), 'page', 'Dungeon retains an active indication through More');
  assert.equal(await page.locator('[data-iw-fantasy-zone-travel]').isVisible(),true,'mobile header travel stays available');
  for (const name of ['Previous Zone','Zones','Next Zone']) await page.locator('[data-iw-fantasy-zone-travel]').getByRole('button',{name,exact:true}).click();
  assert.deepEqual(await page.evaluate(() => [calls.prev,calls.zones,calls.next]), [1,1,1]);
  assert.equal(await page.locator('#zone-detail').isVisible(), true, 'extra zone text stays visible');
  assert.equal(await page.locator('#notice').isVisible(), true, 'game notices remain visible');
  await page.evaluate(() => { document.querySelector('#dungeon').disabled = false; const b = document.createElement('button'); b.textContent = 'Events'; b.onclick = () => calls.events = (calls.events || 0) + 1; document.querySelector('#nav').append(b); });
  await settle(page); menu = await more(page); await menu.getByRole('button', { name: 'Events', exact: true }).click();
  assert.equal(await page.evaluate(() => calls.events), 1, 'extra native navigation must remain reachable');
  await page.evaluate(() => { window.mutations = 0; window.probe = new MutationObserver(records => mutations += records.length); probe.observe(document.querySelector('#root'), {subtree:true,childList:true,attributes:true,characterData:true}); });
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => mutations), 0, 'settled navigation must not write repeatedly');
  await page.evaluate(() => probe.disconnect());
  await page.evaluate(() => { history.replaceState({}, '', '/#market'); document.querySelector('#nav').classList.add('route-changed'); });
  await settle(page);
  assert.equal(await primary(page, 'Market').getAttribute('aria-current'), 'page', 'hash navigation must not be overridden by the root Game route');
  await page.evaluate(() => { const modal=document.createElement('div');modal.id='native-modal';modal.style='position:fixed;inset:0;z-index:50;background:#123';modal.innerHTML='<button style="position:absolute;bottom:12px;left:12px;right:12px;height:52px" onclick="window.nativeModalClicked=true">Native modal action</button>';document.body.append(modal); });
  await page.getByRole('button', {name:'Native modal action',exact:true}).click();
  assert.equal(await page.evaluate(() => nativeModalClicked), true, 'the dock must not cover native modal controls');
  await page.evaluate(() => document.querySelector('#native-modal').remove());
  await more(page);
  await page.evaluate(() => document.querySelector('#root').replaceChildren()); await settle(page);
  assert.equal(await page.locator('[data-iw-fantasy-nav-host]').count(), 0, 'source removal closes More and removes the dock without needing another click');
  await page.close();

  const clean = await open(1400);
  for (const button of await clean.locator('[data-iw-chrome="zone-actions"] button').all()) assert.equal(await button.isVisible(), false, 'travel is removed from the page header');
  assert.equal(await primary(clean,'Game','desktop').evaluate(el => getComputedStyle(el).color), 'rgb(212, 173, 99)', 'the active dock uses the default Ashen brass accent');
  for (const width of [320,390,767,768,1024,1400]) {
    await clean.setViewportSize({width,height:900}); await settle(clean);
    const layout = width < 768 ? 'mobile' : 'desktop';
    const navBox = await mainNavigation(clean, layout).boundingBox();
    assert.ok(navBox.width <= width && navBox.x >= 0, `${width}px navigation fits`);
    for (const b of await mainNavigation(clean, layout).locator('button,a').all()) { const r = await b.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, `${width}px controls are usable touch targets`); }
    assert.equal(await clean.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px has no horizontal overflow`);
    const travel=clean.locator('[data-iw-fantasy-zone-travel]');
    assert.equal(await travel.isVisible(),true,`${width}px header travel stays available`);
    for (const button of await travel.getByRole('button').all()) {const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44, `${width}px header travel has touch targets`);}
    assert.equal(await travel.getByRole('button',{name:'Previous Zone',exact:true}).count(),1);
    assert.equal(await travel.getByRole('button',{name:'Next Zone',exact:true}).count(),1);
    assert.equal(await clean.locator('[data-iw-chrome="zone-text"]').evaluate(el=>getComputedStyle(el).textAlign),'center');
    await more(clean, layout);
    const box = await host(clean, layout).locator('dialog').boundingBox(); assert.ok(box.x >= 0 && box.x+box.width <= width+1 && box.y >= 0 && box.y+box.height <= 901, `${width}px More stays in the viewport`);
    await clean.keyboard.press('Escape');
  }
  await clean.setViewportSize({width:667,height:320}); await settle(clean); await more(clean);
  const short = await host(clean).locator('dialog').boundingBox(); assert.ok(short.y >= 0 && short.y+short.height <= 321, 'landscape More remains reachable');
  await clean.keyboard.press('Escape');
  await more(clean);
  for (const theme of ['glacial','infernal','verdant','forged-metal','celestial','voidborn','runic-arcane','lunar-spectral','tempest-oceanic',null]) {
    await clean.evaluate(theme => {if(theme)document.documentElement.setAttribute('data-iw-zone-theme',theme);else document.documentElement.removeAttribute('data-iw-zone-theme');},theme);
    await clean.waitForTimeout(200); // allow the rail's 150ms colour transition to settle
    const expected = await clean.evaluate(() => {const s=getComputedStyle(document.documentElement);return {accent:s.getPropertyValue('--iw-th-accent').trim(),ground:s.getPropertyValue('--iw-th-ground-b').trim()};});
    const toRgb = value => value.startsWith('#') ? `rgb(${value.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ')})` : value;
    assert.equal(await primary(clean,'Game').evaluate(el=>getComputedStyle(el).color),toRgb(expected.accent),`${theme || 'default'} active colour follows the current theme`);
    assert.equal(await host(clean,'desktop').locator('.dock [data-destination="game"]').evaluate(el=>getComputedStyle(el).color),toRgb(expected.accent),`${theme || 'default'} desktop host inherits the same theme`);
    assert.equal(await host(clean).locator('dialog h2').evaluate(el=>getComputedStyle(el).color),toRgb(expected.accent),`${theme || 'default'} open More menu follows theme changes`);
    assert.equal(await host(clean).locator('dialog').evaluate(el=>getComputedStyle(el).backgroundColor),toRgb(expected.ground),`${theme || 'default'} menu ground follows the current theme`);
  }
  await clean.keyboard.press('Escape');
  await clean.setViewportSize({width:1024,height:320}); await settle(clean); await more(clean,'desktop');
  const shortDesktop = await host(clean,'desktop').locator('dialog').boundingBox(); assert.ok(shortDesktop.y >= 0 && shortDesktop.y+shortDesktop.height <= 321, 'short desktop windows keep More inside the viewport');
  await clean.keyboard.press('Escape');
  await mkdir(resolve(ROOT, 'tmp/thumb-dock'), {recursive:true});
  await clean.evaluate(() => Fantasy.stop());
  assert.equal(await clean.locator('[data-iw-fantasy-nav-host]').count(), 0);
  const restored = await clean.evaluate(() => ({ before: beforeStart, after: document.querySelector('#root').innerHTML }));
  assert.equal(restored.after, restored.before, 'teardown restores native markup exactly');
  await clean.evaluate(() => Fantasy.start()); await settle(clean);
  await clean.setViewportSize({width:1400,height:900}); await settle(clean);
  await primary(clean, 'Market', 'desktop').click(); assert.equal(await clean.evaluate(() => calls.Market), 1, 'restart binds no duplicate handlers');
  // Screenshots temporarily change input caret styles; take them after the
  // exact-DOM teardown assertion, so Playwright's own edits do not taint it.
  for (const width of [390,1400]) { await clean.setViewportSize({width,height:900}); await settle(clean); await clean.screenshot({path:resolve(ROOT,`tmp/thumb-dock/${width}.png`),fullPage:true}); await more(clean,width<768?'mobile':'desktop'); await clean.screenshot({path:resolve(ROOT,`tmp/thumb-dock/${width}-more.png`),fullPage:true}); await clean.keyboard.press('Escape'); }
  await clean.close();

  const duplicates = await open(390, `<div class="wide">${shell('wide-shell',nav('wide-nav'))}</div><div class="narrow">${shell('narrow-shell',nav('narrow-nav'))}</div>`);
  await primary(duplicates, 'Market').click();
  assert.equal(await duplicates.evaluate(() => document.querySelector('#narrow-nav [data-iw-tab="market"]').isConnected), true);
  await duplicates.setViewportSize({width:1400,height:900}); await settle(duplicates);
  await duplicates.evaluate(() => { for (const n of document.querySelectorAll('[data-iw-tab="market"]')) n.addEventListener('click', () => window.used = n.closest('[id$="-nav"]').id); });
  await primary(duplicates,'Market','desktop').click(); assert.equal(await duplicates.evaluate(() => used), 'wide-nav', 'breakpoint swaps resolve the live original');
  await duplicates.evaluate(() => { const n=document.querySelector('#wide-nav'); const fresh=n.cloneNode(true); fresh.querySelector('[data-iw-tab="market"]').onclick=e=>{e.preventDefault();window.freshClicks=(window.freshClicks||0)+1}; n.replaceWith(fresh); });
  await settle(duplicates); await primary(duplicates,'Market','desktop').click(); assert.equal(await duplicates.evaluate(() => freshClicks), 1, 'route replacements must not retain detached controls');
  await duplicates.close();

  const unsupported = await open();
  await unsupported.evaluate(() => { const source=document.querySelector('#nav');const next=source.cloneNode(true);next.append(document.createElement('input'));source.replaceWith(next); });
  await settle(unsupported);
  assert.equal(await unsupported.locator('[data-iw-fantasy-nav-host]').count(), 0, 'unsupported source forms use native navigation');
  assert.equal(await unsupported.locator('#nav').isVisible(), true, 'fallback must remove a cloned copy of the old hide marker');
  await unsupported.close();

  const unfamiliar = await open();
  await unfamiliar.evaluate(() => { const event=document.createElement('div'); event.setAttribute('role','button'); event.tabIndex=0; event.textContent='Season event'; document.querySelector('#nav').append(event); });
  await settle(unfamiliar);
  assert.equal(await unfamiliar.locator('[data-iw-fantasy-nav-host]').count(), 0, 'unfamiliar interactive elements must fall back to native navigation');
  assert.equal(await unfamiliar.getByRole('button', {name:'Season event',exact:true}).isVisible(), true);
  await unfamiliar.close();

  const fallback = await open(390, shell('shell','<nav><button>Game</button><button>Market</button></nav>'));
  assert.equal(await host(fallback).count(), 0, 'unclassified navigation stays native'); await fallback.close();
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('fantasy-navigation: native handlers, utilities, state, layouts, source swaps, quiescence and teardown PASS');
} finally { await browser.close(); }
