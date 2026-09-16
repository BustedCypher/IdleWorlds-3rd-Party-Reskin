/**
 * World Boss action-button label centring.
 *
 * The card's Prejoin/Prejoined control is relabelled by CSS: the game's own
 * text ("Prejoin", "⏳ Prejoined") is kept in the button as the accessible copy
 * at `font-size: 0` and the compact word is drawn with `::after` from
 * `data-iw-boss-action-label`. Two things then quietly pushed that word off
 * centre inside the forged frame, and both were reported as one symptom —
 * "QUEUED looks off centre":
 *
 *   1. The flattened native text is STILL a zero-width flex item, so the
 *      label's `gap` was applied on BOTH sides of it. A 5px gap therefore
 *      moved the word 2.5px right of centre in every state, idle included.
 *   2. The "active" state added a "⌛" ::before. Its 16px advance plus those
 *      doubled gaps pushed QUEUED a measured 12.9px right — its ink ended at
 *      x=107.0 of the 132px box, which is exactly where the sprite's right
 *      flourish begins, while the space to the left of the glyph sat empty.
 *
 * This is a REAL BROWSER test (Playwright), not jsdom: it measures painted
 * ink, and jsdom paints nothing. The measurement is a DIFF of the button
 * against itself with the label colour cleared, so it isolates the label from
 * the frame art and does not depend on the atlas loading — which matters,
 * because `setContent` gives the page an about:blank origin and a `file://`
 * subresource is silently blocked from it (see CLAUDE.md).
 *
 * Negative control: restore `gap: 5px` on `[data-iw-boss-action-label]` and
 * the idle check fails; restore the `⌛` ::before and the active check fails.
 * Verified this session against the pre-fix sheet.
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

/* The sprite window maps action_frame_idle onto the border box exactly, so the
   frame's flat interior is a fixed fraction of the button: measured off
   assets/skills-ui/theme_*.webp, the end flourishes end at x≈25 and start
   again at x≈107 of the 132px control. A label wider than that plateau reads
   as crowding the art however well it is centred. */
const INTERIOR = 82;

const button = (state, label, native) =>
  `<div data-iw-encounter="ancient_treant">
     <button class="probe" data-probe="${state}" data-iw-boss-role="action" data-iw-boss-art-ready="1"
             data-iw-boss-action-state="${state}" data-iw-boss-action-label="${label}">${native}</button>
   </div>`;

const html = `<style>${css.join('\n')}</style>
<style>
  body { margin: 0; background: #000; padding: 40px; }
  /* Clearing COLOUR, not "content", is what makes this a clean isolation: the
     flex layout is identical in every variant, so the diff is the glyphs of
     exactly one pseudo-element and nothing else moved to produce it. */
  body.hide-glyph [data-iw-encounter] [data-iw-boss-action-label]::before,
  body.hide-word [data-iw-encounter] [data-iw-boss-action-label]::after {
    color: transparent !important; text-shadow: none !important;
  }
</style>
${button('active', 'Queued', '⏳ Prejoined')}
${button('idle', 'Prejoin', 'Prejoin')}`;

const browser = await chromium.launch();
/* Desktop width on purpose: the ≤380px block narrows the control to 120px and
   would answer a different question. */
const page = await browser.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 4 });
await page.setContent(html);
await page.waitForTimeout(300);

/* Measures the WORD, not the button's whole content: `::before` is dark in
   both shots, so an ornament that shares the flex row shows up here as the
   word being pushed off centre — which is the reported symptom itself, and
   leaves a future out-of-flow glyph free to pass. */
async function labelInk(selector) {
  const box = await page.locator(selector).boundingBox();
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  await page.evaluate(() => { document.body.className = 'hide-glyph'; });
  const lit = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => { document.body.className = 'hide-glyph hide-word'; });
  const dark = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => { document.body.className = ''; });
  return page.evaluate(async ({ lit, dark, box }) => {
    const load = src => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej;
      i.src = 'data:image/png;base64,' + src;
    });
    const [a, b] = await Promise.all([load(lit), load(dark)]);
    const w = a.naturalWidth, h = a.naturalHeight;
    const read = img => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      return cx.getImageData(0, 0, w, h).data;
    };
    const da = read(a), db = read(b);
    let x0 = w, x1 = -1, n = 0;
    for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
      const i = (py * w + px) * 4;
      const diff = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (diff <= 18) continue;
      n += 1;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
    }
    const sx = box.width / w;
    return {
      n,
      boxW: +box.width.toFixed(2),
      inkW: +((x1 - x0 + 1) * sx).toFixed(2),
      offX: +((((x0 + x1 + 1) / 2) * sx) - box.width / 2).toFixed(2),
    };
  }, { lit, dark, box });
}

for (const [state, word] of [['active', 'QUEUED'], ['idle', 'PREJOIN']]) {
  const m = await labelInk(`[data-probe="${state}"]`);
  /* A check reporting zero ink is broken, not passing. */
  assert.ok(m.n > 200, `${word}: the label paints almost nothing (${m.n} ink px) — the measurement is broken, not the CSS`);
  assert.ok(Math.abs(m.offX) <= 1,
    `${word} ink sits ${m.offX}px from the centre of its ${m.boxW}px button — the label must be centred in the frame`);
  assert.ok(m.inkW <= INTERIOR,
    `${word} ink is ${m.inkW}px wide but the frame's flat interior is only ${INTERIOR}px — it crowds the end flourishes`);
  console.log(`  ${word}: ink ${m.inkW}px, offset ${m.offX}px in a ${m.boxW}px button  ok`);
}

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
console.log('boss-action-label: label centred in the forged frame in both states  ok');
