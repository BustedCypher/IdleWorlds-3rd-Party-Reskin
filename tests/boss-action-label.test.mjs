/**
 * World Boss action-button artwork states.
 *
 * The React-owned action button keeps its native text and click handler while
 * CSS paints dedicated JOIN, PREJOINED and FIGHTING artwork. JOIN has a
 * separate hover asset. This real-browser regression pins those state images,
 * shared geometry, mobile aspect ratio, and the absence of idle animation.
 */

import { chromium } from 'playwright';
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
    animationName: cs.animationName,
  };
});

const expected = {
  join: 'world_boss_join.webp',
  prejoined: 'world_boss_prejoined.webp',
  fighting: 'world_boss_fighting.webp',
};
for (const [state, asset] of Object.entries(expected)) {
  const paint = await statePaint(`[data-probe="${state}"]`);
  assert.equal(paint.width, 150, `${state} keeps the shared 5:1 button width`);
  assert.equal(paint.height, 30, `${state} keeps the shared 5:1 button height`);
  assert.ok(paint.backgroundImage.includes(asset), `${state} uses ${asset}: ${paint.backgroundImage}`);
  assert.equal(paint.fontSize, '0px', `${state} keeps native copy in the DOM without double-painting it`);
  assert.equal(paint.animationName, 'none', `${state} is static, not another idle animation`);
}
assert.equal((await statePaint('[data-probe="join"]')).text, 'Prejoin', 'native JOIN-state text remains intact');
assert.equal((await statePaint('[data-probe="prejoined"]')).text, '⏳ Prejoined', 'native PREJOINED text remains intact');
assert.equal((await statePaint('[data-probe="fighting"]')).text, 'Fighting', 'native FIGHTING text remains intact');

const join = page.locator('[data-probe="join"]');
await join.hover();
assert.ok((await statePaint('[data-probe="join"]')).backgroundImage.includes('world_boss_join_hover.webp'),
  'JOIN hover swaps to the dedicated hover artwork');
await page.mouse.move(900, 300);
assert.ok((await statePaint('[data-probe="join"]')).backgroundImage.includes('world_boss_join.webp'),
  'JOIN returns to its idle artwork after hover');

await page.setViewportSize({ width: 360, height: 400 });
await page.waitForTimeout(50);
for (const state of Object.keys(expected)) {
  const paint = await statePaint(`[data-probe="${state}"]`);
  assert.equal(paint.width, 120, `${state} narrows on phone without changing aspect ratio`);
  assert.equal(paint.height, 24, `${state} keeps its 5:1 phone geometry`);
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

await browser.close();
console.log('boss-action-label: dedicated world-boss action artwork states  ok');
