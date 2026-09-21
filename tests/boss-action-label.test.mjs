/**
 * World Boss action-button artwork states.
 *
 * The React-owned action button keeps its native text and click handler while
 * CSS paints dedicated JOIN, PREJOINED and FIGHTING artwork. JOIN has a
 * separate hover asset. This real-browser regression pins those state images,
 * one shared geometry for artwork whose frames and lettering are authored at
 * the same size, the 5:1 aspect ratio on desktop and phone, the absence of idle animation, and
 * (desktop) the button centred on the portrait rather than the title block.
 */

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const fileUrl = rel => pathToFileURL(resolve(ROOT, rel)).href;

/* All six injected sheets, in boot order, ui-system.css LAST — a fixture that
   omits one lies (CLAUDE.md). The url() rewrite mirrors StyleInjector's. */
const SHEETS = ['base.css', 'header.css', 'inventory.css', 'skillpanel.css', 'tooltip-engine.css', 'overlay.css', 'ui-system.css'];
const css = [];
for (const name of SHEETS) {
  css.push((await readFile(resolve(ROOT, 'src/styles', name), 'utf8')).replaceAll("url('../assets/", `url('${fileUrl('assets')}/`));
}

/* The action button is now artwork-driven. Native text and handlers stay on
   the React-owned button, while three semantic states select dedicated art. */
const button = (state, native) =>
  `<div data-iw-encounter="ancient_treant">
     <button class="probe" data-probe="${state}" data-iw-boss-role="action"
             data-iw-boss-action-state="${state}">${native}</button>
   </div>`;

const html = `<style>${css.join('\n')}</style>
<style>body { margin: 0; background: #000; padding: 40px; }</style>
${button('join', 'Prejoin')}
${button('prejoined', '⏳ Prejoined')}
${button('fighting', 'Fighting')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.waitForTimeout(150);

const statePaint = async selector => page.locator(selector).evaluate(el => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    text: el.textContent,
    width: +r.width.toFixed(2),
    height: +r.height.toFixed(2),
    backgroundImage: cs.backgroundImage,
    fontSize: cs.fontSize,
    filter: cs.filter,
    animationName: cs.animationName,
  };
});

const expected = {
  join: 'world_boss_join-v2.png',
  prejoined: 'world_boss_prejoined-v2.png',
  fighting: 'world_boss_fighting-v3.png',
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: got ${a}, want ${b}`);
for (const [state, asset] of Object.entries(expected)) {
  const paint = await statePaint(`[data-probe="${state}"]`);
  near(paint.width, 150, `${state} shares the desktop width`);
  near(paint.height, 30, `${state} shares the desktop height`);
  near(paint.width / paint.height, 5, `${state} keeps the art's 5:1 aspect`);
  assert.ok(paint.backgroundImage.includes(asset), `${state} uses ${asset}: ${paint.backgroundImage}`);
  assert.equal(paint.fontSize, '0px', `${state} keeps native copy in the DOM without double-painting it`);
  assert.equal(paint.animationName, 'none', `${state} is static, not another idle animation`);
}
assert.equal((await statePaint('[data-probe="join"]')).text, 'Prejoin', 'native JOIN-state text remains intact');
assert.equal((await statePaint('[data-probe="prejoined"]')).text, '⏳ Prejoined', 'native PREJOINED text remains intact');
assert.equal((await statePaint('[data-probe="fighting"]')).text, 'Fighting', 'native FIGHTING text remains intact');

const join = page.locator('[data-probe="join"]');
await join.hover();
await page.waitForTimeout(160);
const joinHover = await statePaint('[data-probe="join"]');
assert.ok(joinHover.backgroundImage.includes('world_boss_join_hover-v2.png'),
  'JOIN hover swaps to the dedicated hover artwork');
assert.match(joinHover.filter, /brightness\(1\.12\)/,
  'JOIN hover is visibly brighter than idle at final UI scale');
await page.mouse.move(900, 300);
assert.ok((await statePaint('[data-probe="join"]')).backgroundImage.includes('world_boss_join-v2.png'),
  'JOIN returns to its idle artwork after hover');

const assetDataUrls = await Promise.all(Object.values(expected).map(async asset =>
  `data:image/png;base64,${(await readFile(resolve(ROOT, 'assets/world-boss', asset))).toString('base64')}`));
const alphaBounds = await page.evaluate(async urls => Promise.all(urls.map(url => new Promise((resolveBounds, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, maxX = -1;
    const rowProfile = [];
    for (let y = 0; y < canvas.height; y += 1) {
      let rowMinX = canvas.width, rowMaxX = -1;
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 128) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        rowMinX = Math.min(rowMinX, x);
        rowMaxX = Math.max(rowMaxX, x);
      }
      rowProfile.push([rowMinX, rowMaxX]);
    }
    resolveBounds({ width: image.naturalWidth, height: image.naturalHeight,
      paintedWidth: maxX - minX + 1, rowProfile });
  };
  image.onerror = reject;
  image.src = url;
}))), assetDataUrls);
assert.deepEqual(alphaBounds.map(asset => [asset.width, asset.height]), [[300, 60], [300, 60], [300, 60]],
  'JOIN, PREJOINED and FIGHTING sources share the 300x60 canvas');
assert.equal(new Set(alphaBounds.map(asset => asset.paintedWidth)).size, 1,
  `JOIN, PREJOINED and FIGHTING frames share one painted width: ${alphaBounds.map(asset => asset.paintedWidth).join(', ')}`);
assert.deepEqual(alphaBounds[2].rowProfile, alphaBounds[1].rowProfile,
  'FIGHTING must use the exact PREJOINED outer silhouette on every scanline');

await page.setViewportSize({ width: 360, height: 400 });
await page.waitForTimeout(50);
for (const state of Object.keys(expected)) {
  const paint = await statePaint(`[data-probe="${state}"]`);
  near(paint.width, 120, `${state} shares the phone width`);
  near(paint.height, 24, `${state} shares the phone height`);
  near(paint.width / paint.height, 5, `${state} keeps its 5:1 phone geometry`);
}
console.log('  world-boss action art: JOIN, hover, PREJOINED and FIGHTING states  ok');
/* The title row on a PHONE card (mobile audit, 2026-09). The header's title
   block was two max-content tracks, which cannot shrink, so at a 360px
   viewport "Abyssal Behemoth" + RAID pushed the badge past the card's right
   border. Both tracks are minmax(0, max-content) now. Controls, both verified:
   put `max-content max-content` back and the phone badge overflows its title
   block (330.6 against 326); take
   the 0 minimum off the badge's track only and the buff line (which spans both
   tracks) inflates the badge to ~140px on desktop. */
const bossCard = (name, tier) => `
  <div data-iw-encounter="probe" class="probe-card">
    <div data-iw-boss-role="header"><div>
      <p data-iw-boss-role="title">&#127757; ${name}</p><p data-iw-boss-role="difficulty">${tier}</p>
      <p data-iw-boss-role="buff">Buff on kill: +8 XP/task for 2h</p>
    </div></div>
  </div>`;
const headerPage = await browser.newPage({ viewport: { width: 360, height: 700 } });
await headerPage.setContent(`<style>${css.join('\n')}</style><style>body{margin:0;padding:16px 24px;background:#000}.probe-card{margin-bottom:12px}</style>
  ${bossCard('Ancient Treant', 'Solo')}${bossCard('Abyssal Behemoth', 'Raid')}`);
const titleRows = () => headerPage.evaluate(() => [...document.querySelectorAll('.probe-card')].map(c => {
  const r = s => c.querySelector(s).getBoundingClientRect();
  const card = c.getBoundingClientRect(), title = r('[data-iw-boss-role="title"]'), badge = r('[data-iw-boss-role="difficulty"]');
  const block = c.querySelector('[data-iw-boss-role="header"] > *:first-child').getBoundingClientRect();
  return { card: { l: card.left, r: card.right }, block: { r: block.right }, title: { l: title.left, r: title.right, h: title.height },
    badge: { l: badge.left, r: badge.right, w: badge.width }, lineH: parseFloat(getComputedStyle(c.querySelector('[data-iw-boss-role="title"]')).lineHeight) };
}));
await headerPage.waitForTimeout(150);
for (const row of await titleRows()) {
  /* Against the title BLOCK, the grid the badge is a track of: on this page
     the card is a little wider than live, so an overflowing badge still landed
     inside the card's padding and a card-edge check passed the old CSS. */
  assert.ok(row.badge.r <= row.block.r + 0.5, `phone: the difficulty badge overflows its title block (badge right ${row.badge.r}, block right ${row.block.r})`);
  assert.ok(row.badge.l >= row.title.r - 0.5, `phone: the difficulty badge overlaps the name (badge left ${row.badge.l}, name right ${row.title.r})`);
}
await headerPage.setViewportSize({ width: 1100, height: 700 });
await headerPage.waitForTimeout(150);
for (const row of await titleRows()) {
  assert.ok(row.badge.w <= 60, `desktop: the difficulty badge is ${row.badge.w}px wide - a spanning line inflated its track`);
  assert.ok(row.title.h < row.lineH * 1.5, `desktop: the name wraps (${row.title.h}px tall) with room to spare`);
}
await headerPage.close();
console.log('  boss title row: badge inside the card at 360px, natural width at 1100px  ok');

/* Placement on the game's REAL card shapes, run through the real decorator.
   The game renders the boss action in two places (captured game source):
     - prejoin window: header > [title block, div.flex-col > button "Prejoin" /
       "⏳ Prejoined" (+ an error line)],
     - otherwise:      header > [title block, button "Fight Boss" / "Fighting" /
       "Defeated"].
   Zone Control: header > [div.min-w-0 > title, div.flex-col > button
   "⚔️ Fight for Red!" / "Fighting" (+ fight progress bar)]. Tailwind's flex
   utilities are inlined because the fixture has no Tailwind.
   A fixture with only the direct-child shape passed while the live Prejoin
   button sat well in from the card edge (2026-09-21). */
const compiled = await build({
  stdin: { contents: "export * from './src/modules/WorldBossPanels.js';", resolveDir: ROOT },
  bundle: true, write: false, format: 'iife', globalName: 'BossPanels', loader: { '.css': 'text' },
});
/* The game's Tailwind utilities, as HOST CSS ahead of the skin's sheets: an
   inline style would outrank the skin where the live class does not. */
const TAILWIND = '.flex{display:flex}.flex-col{flex-direction:column}.items-start{align-items:flex-start}.items-end{align-items:flex-end}.justify-between{justify-content:space-between}.gap-3{gap:12px}.gap-1{gap:4px}';
const ROW = 'flex items-start justify-between gap-3';
const COL = 'flex flex-col items-end gap-1';
const titleBlock = name => `<div class="min-w-0"><p>🌍 ${name}</p><p>Raid</p><p>Buff on kill: +8 XP/task for 2h</p></div>`;
const gameBossCard = (name, button, { wrapped = false, progress = false, status }) => `<div class="compact-panel" data-iw-boss="card">
  <div class="${ROW}">${titleBlock(name)}${wrapped ? `<div class="${COL}">${button}</div>` : button}</div>
  ${progress ? '<div class="h-1.5 rounded-full" style="height:6px"><div style="width:80%;height:6px;background:#c33"></div></div>' : ''}
  <button class="underline decoration-dotted">28 players currently fighting world boss</button>
  <div style="display:flex;justify-content:space-between;align-items:center">${status.map(t => `<p>${t}</p>`).join('')}</div></div>`;
const gameZoneCard = button => `<div class="compact-panel" data-iw-boss="card">
  <div class="${ROW}"><div class="min-w-0"><p>⚔️ Zone 13 — Race to capture!</p></div><div class="${COL}">${button}</div></div>
  <div><div><span>🔴</span><div class="h-1.5 rounded-full"><div style="width:50%"></div></div><span>65,000</span></div>
  <div><span>🔵</span><div class="h-1.5 rounded-full"><div style="width:50%"></div></div><span>65,000</span></div></div>
  <button class="underline decoration-dotted">Zone control participation</button></div>`;
const BOSS_CARDS = [
  { name: 'Ancient Treant', want: 'fighting', html: gameBossCard('Ancient Treant', '<button><span>Fighting</span></button>', { progress: true, status: ['52053/63600 HP', 'No world buff active'] }) },
  { name: 'Abyssal Behemoth', want: 'prejoined', wrapped: true, html: gameBossCard('Abyssal Behemoth', '<button><span>⏳ Prejoined</span></button>', { wrapped: true, status: ['Respawns 1h 41m left', 'Buff active 1h 41m left'] }) },
  { name: 'World Eater', want: 'join', wrapped: true, html: gameBossCard('World Eater', '<button><span>Prejoin</span></button><p>Unable to toggle prejoin.</p>', { wrapped: true, status: ['Respawns 3h 14m left', 'Buff active 3h 14m left'] }) },
  { name: 'Ancient Treant', want: 'join', html: gameBossCard('Ancient Treant', '<button><span>Fight Boss</span></button>', { progress: true, status: ['63600/63600 HP', 'No world buff active'] }) },
  { name: 'Abyssal Behemoth', want: 'idle', html: gameBossCard('Abyssal Behemoth', '<button disabled><span>Defeated</span></button>', { status: ['Respawns 5h left', 'Buff active 1h left'] }) },
];
const ZONE_CARDS = [
  { want: 'join', team: 'red', html: gameZoneCard('<button>⚔️ Fight for Red!</button>') },
  { want: 'join', team: 'blue', html: gameZoneCard('<button>⚔️ Fight for Blue!</button>') },
  { want: 'fighting', team: null, html: gameZoneCard('<button>Fighting</button><div class="h-1 w-full" style="height:4px;width:100%"><div style="width:30%;height:4px"></div></div>') },
];
const place = async (width, cards, sheet = css.join('\n')) => {
  const p = await browser.newPage({ viewport: { width, height: 2400 } });
  await p.setContent(`<style>${TAILWIND}</style><style>${sheet}</style><style>body{margin:0;background:#000}main{max-width:1040px;padding:0 16px}</style>
    <main><div class="panel"><div><h2>World Bosses</h2></div>${cards.map(c => c.html).join('')}</div></main>`);
  await p.addScriptTag({ content: 'window.chrome={runtime:{id:"test"},storage:{local:{get:async()=>({}),set:async()=>{}}}};' });
  await p.addScriptTag({ content: compiled.outputFiles[0].text });
  await p.evaluate(() => { const root = document.querySelector('.panel'); window.BossPanels.decorateWorldBossPanel({ root, heading: root.querySelector('h2') }); });
  await p.waitForTimeout(150);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.compact-panel')].map(c => {
    const R = el => el.getBoundingClientRect();
    const text = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const btn = c.querySelector('[data-iw-boss-role="action"]');
    if (!btn) return { missing: true };
    const a = R(btn), card = R(c), cs = getComputedStyle(c), bs = getComputedStyle(btn);
    const contentRight = card.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const art = c.querySelector('.iw-boss-art'), title = c.querySelector('[data-iw-boss-role="title"]');
    const hits = (x, y) => Math.min(x.right, y.right) > Math.max(x.left, y.left) && Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
    const others = [['title', text(title)], ...[...c.querySelectorAll('[data-iw-boss-role="buff"]')].map(el => ['buff', text(el)]),
      ...[...c.querySelectorAll('[data-iw-boss-role="progress"]')].map(el => ['progress', R(el)]),
      ...[...c.querySelectorAll('[data-iw-boss-role="timer"]')].map(el => ['timer', text(el)])];
    return {
      state: btn.dataset.iwBossActionState, team: btn.dataset.iwBossActionTeam || null,
      w: a.width, fontSize: bs.fontSize, art: bs.backgroundImage,
      rightGap: contentRight - a.right,
      artOff: art && getComputedStyle(art).display !== 'none' ? (a.top + a.height / 2) - (R(art).top + R(art).height / 2) : null,
      titleOff: (a.top + a.height / 2) - (text(title).top + text(title).height / 2),
      onTop: document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2)?.closest('[data-iw-boss-role="action"]') === btn,
      overlaps: others.filter(([, r]) => hits(a, r)).map(([k]) => k),
    };
  }));
  await p.close();
  return rows;
};
const SIZE = { join: 150, prejoined: 150, fighting: 150, idle: 150 };
const ART = { join: 'world_boss_join-v2.png', prejoined: 'world_boss_prejoined-v2.png', fighting: 'world_boss_fighting-v3.png' };
const checkPainted = (r, want, where) => {
  assert.ok(!r.missing, `${where}: no action button was classified`);
  assert.equal(r.state, want, `${where}: state`);
  near(r.w, SIZE[want], `${where}: width`);
  if (ART[want]) assert.ok(r.art.includes(ART[want]), `${where}: paints ${ART[want]}, got ${r.art.slice(0, 80)}`);
  else assert.equal(r.fontSize, '11px', `${where}: an art-less state must keep the game's word visible, got font-size ${r.fontSize}`);
};
for (const width of [1440, 1100, 761]) {
  const rows = await place(width, BOSS_CARDS);
  rows.forEach((r, i) => {
    const where = `${BOSS_CARDS[i].name} "${BOSS_CARDS[i].want}" @ ${width}px`;
    checkPainted(r, BOSS_CARDS[i].want, where);
    assert.ok(Math.abs(r.rightGap) < 0.75, `${where}: action is ${r.rightGap.toFixed(1)}px in from the card's right edge`);
    assert.ok(Math.abs(r.artOff) < 0.75, `${where}: action is ${r.artOff.toFixed(1)}px off the portrait's centre`);
    assert.deepEqual(r.overlaps, [], `${where}: action overlaps ${r.overlaps.join(', ')}`);
    assert.ok(r.onTop, `${where}: action is covered`);
  });
}
/* Negative control, EXECUTED: the previous direct-child-only selector leaves
   the wrapped Prejoin/Prejoined buttons in flow, pushed in off the edge. */
const directOnly = css.join('\n').replace(
  '[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="header"] [data-iw-boss-role="action"] {',
  '[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="header"] > [data-iw-boss-role="action"] {');
assert.notEqual(directOnly, css.join('\n'), 'negative control could not find the placement selector');
const reverted = await place(1100, BOSS_CARDS, directOnly);
const revertedWrapped = reverted.filter((r, i) => BOSS_CARDS[i].wrapped);
assert.ok(revertedWrapped.length === 2 && revertedWrapped.every(r => r.rightGap > 20),
  `negative control is broken: wrapped buttons should drift off the right edge, got ${revertedWrapped.map(r => r.rightGap.toFixed(1)).join(', ')}`);
console.log('  boss action: right edge, centred on the portrait, both game shapes, 761-1440px  ok');

/* Zone Control: the same art and sizes, at the right of the title row and
   centred on it; both "Fight for Red" and "Fight for Blue" keep their team
   as data while sharing the JOIN artwork. */
for (const width of [1440, 1100, 761, 390]) {
  const rows = await place(width, ZONE_CARDS);
  rows.forEach((r, i) => {
    const where = `zone "${ZONE_CARDS[i].want}" @ ${width}px`;
    checkPainted(r, ZONE_CARDS[i].want, where);
    assert.equal(r.team, ZONE_CARDS[i].team, `${where}: team`);
    assert.ok(Math.abs(r.rightGap) < 3, `${where}: action is ${r.rightGap.toFixed(1)}px in from the card's right edge`);
    assert.ok(Math.abs(r.titleOff) < 1.5, `${where}: action is ${r.titleOff.toFixed(1)}px off the title row's centre`);
    assert.deepEqual(r.overlaps, [], `${where}: action overlaps ${r.overlaps.join(', ')}`);
    assert.ok(r.onTop, `${where}: action is covered`);
  });
}
/* Negative control, EXECUTED: the old full-width, wrapping, baseline row puts
   the action off the title row's centre (6px at 1100px). */
const fullWidth = css.join('\n').replace(/flex: 1 1 auto;(\r?\n)  min-width: 0;/, 'width: 100%;$1')
  .replace(/align-items: center;(\r?\n)  flex-wrap: nowrap;/, 'align-items: baseline;$1  flex-wrap: wrap;');
assert.notEqual(fullWidth, css.join('\n'), 'zone negative control could not find the title-block rule');
const wrappedZone = await place(1100, ZONE_CARDS, fullWidth);
assert.ok(wrappedZone.every(r => Math.abs(r.titleOff) > 1.5), `zone negative control is broken: got ${wrappedZone.map(r => r.titleOff.toFixed(1)).join(', ')}`);
console.log('  zone control action: JOIN/FIGHTING art at boss sizes, right of the title, team kept  ok');

await browser.close();
console.log('boss-action-label: dedicated world-boss action artwork states  ok');
