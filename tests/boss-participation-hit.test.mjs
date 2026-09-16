/**
 * World Boss card, row 3: the participation link and the status row.
 *
 * History (both 2026-09-16):
 *  1. "The participation link works on mobile, on desktop it does nothing." The
 *     boss grid put `status` (HP / respawn timer + buff) and the participation
 *     link in the SAME cell (column 2, row 3), `status` stretched across it
 *     behind a fixed 155px padding gutter. `status` is the later child, so it
 *     painted over the link and swallowed its clicks; the phone block moved
 *     `status` to its own row. First fixed with pointer-events + z-index.
 *  2. "The Boss HP overlaps the participants text on desktop." The live label
 *     "28 players currently fighting world boss" is ~300px, wider than the
 *     155px gutter, so the HP readout PAINTED over the link's tail.
 *
 * Both were the shared cell. The card grid is now `art | auto | 1fr`: the link
 * owns the auto column, `status` the 1fr column, so they cannot overlap and no
 * hit-testing workaround is needed. This test pins the outcome at phone,
 * tablet and desktop widths:
 *  - the link's text and the status text never intersect,
 *  - every point along the link hit-tests to the link and its handler runs,
 *  - nothing in row 3 escapes the card,
 *  - at <= 760px `status` sits on its own row below the link.
 *
 * REAL BROWSER (Playwright): jsdom has no layout. The negative control is
 * EXECUTED: the old shared-cell layout is restored and the test fails unless
 * that reproduces the overlap.
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

/* Every injected sheet, in boot order, ui-system.css LAST — a fixture that
   omits one lies (CLAUDE.md). The url() rewrite mirrors StyleInjector's. */
const SHEETS = ['base.css', 'header.css', 'inventory.css', 'skillpanel.css', 'tooltip-engine.css', 'overlay.css', 'ui-system.css'];
const css = [];
for (const name of SHEETS) {
  css.push((await readFile(resolve(ROOT, 'src/styles', name), 'utf8')).replaceAll("url('../assets/", `url('${fileUrl('assets')}/`));
}

const compiled = await build({
  stdin: { contents: "export * from './src/modules/WorldBossPanels.js';", resolveDir: ROOT },
  bundle: true, write: false, format: 'iife', globalName: 'BossPanels', loader: { '.css': 'text' },
});

/* The live card's child order (tests/world-boss-panels.test.mjs), carrying the
   `data-iw-boss="card"` UIFoundation writes. Two live states: fighting (the
   WIDE label, HP + buff) and respawning (short label, timer). The status row's
   flex layout is the game's Tailwind `flex justify-between`, inlined because
   the fixture has no Tailwind. */
const card = (label, statusItems) => `<div class="compact-panel" data-iw-boss="card">
    <div><div><p>🌍 Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div><button>⏳ Prejoined</button></div>
    <div class="h-1.5 rounded-full"><div style="width: 40%"></div></div>
    <button class="underline decoration-dotted">${label}</button>
    <div class="fighter-details"><p>Top Fighters</p></div>
    <div style="display:flex;justify-content:space-between;align-items:center">${statusItems.map(t => `<p>${t}</p>`).join('')}</div>
  </div>`;
const STATES = {
  fighting: card('28 players currently fighting world boss', ['63281/63600 HP', 'No world buff active']),
  respawning: card('World boss participation', ['Respawns 8m left', 'Buff active: +4 XP/task']),
};

/* The layout before this fix: two columns, link and status sharing (2, 3). */
const REVERT = `
[data-iw-encounter]:not([data-iw-encounter="zone"]) { grid-template-columns: 104px minmax(0, 1fr); }
[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="header"],
[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="progress"] { grid-column: 2; }
[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="status"] { grid-column: 2; padding-left: 155px; pointer-events: none; }
[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="status"] > * { pointer-events: auto; }
[data-iw-encounter]:not([data-iw-encounter="zone"]) > [data-iw-boss-role="participation"] { z-index: 2; }`;

const browser = await chromium.launch();

async function measure(width, state, revert) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  /* The boss panel is one dashboard column: ~1000px on a wide desktop, the
     full width less the page gutter below that. */
  await page.setContent(`<style>${css.join('\n')}</style><style>body{margin:0;background:#000}main{max-width:1040px;padding:0 16px;box-sizing:border-box}${revert ? REVERT : ''}</style>
    <main><div class="panel"><div><h2>World Bosses</h2><p>Shared world events</p></div>${STATES[state]}</div></main>`);
  await page.addScriptTag({ content: 'window.chrome={runtime:{id:"test"},storage:{local:{get:async()=>({}),set:async()=>{}}}};' });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const root = document.querySelector('.panel');
    window.BossPanels.decorateWorldBossPanel({ root, heading: root.querySelector('h2') });
    const cardEl = root.querySelector('[data-iw-boss="card"]');
    const link = cardEl.querySelector('[data-iw-boss-role="participation"]');
    const status = cardEl.querySelector('[data-iw-boss-role="status"]');
    window.__clicks = 0;
    link.addEventListener('click', () => { window.__clicks++; });
    const textBox = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const linkText = textBox(link);
    const overlapPx = [...status.children].reduce((sum, child) => sum + overlap(linkText, textBox(child)), 0);
    const box = link.getBoundingClientRect();
    const at = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return 'none';
      if (hit === link) return 'link';
      return hit.dataset.iwBossRole ? `${hit.tagName.toLowerCase()}[${hit.dataset.iwBossRole}]` : hit.tagName.toLowerCase();
    };
    const y = box.top + box.height / 2;
    const cardBox = cardEl.getBoundingClientRect();
    const statusBox = status.getBoundingClientRect();
    const statusText = [...status.children].map(textBox);
    return {
      overlapPx: Math.round(overlapPx),
      hits: [at(box.left + 3, y), at(box.left + box.width / 2, y), at(box.right - 3, y)],
      escapesCard: [linkText, ...statusText].some(r => r.left < cardBox.left - 0.5 || r.right > cardBox.right + 0.5),
      statusBelowLink: statusBox.top >= box.bottom - 0.5,
    };
  });
  await page.locator('[data-iw-boss-role="participation"]').dispatchEvent('click');
  result.clicks = await page.evaluate(() => window.__clicks);
  await page.close();
  return result;
}

/* 761px is the first width above the phone block; 768 tablet portrait. */
const DESKTOP = [1440, 1100, 900, 768, 761];
const PHONE = [760, 430, 390, 360];
for (const state of Object.keys(STATES)) {
  for (const width of [...DESKTOP, ...PHONE]) {
    const r = await measure(width, state, false);
    const where = `${state} @ ${width}px`;
    assert.equal(r.overlapPx, 0, `${where}: the participation link and the status text must not overlap (got ${r.overlapPx}px²)`);
    assert.deepEqual(r.hits, ['link', 'link', 'link'], `${where}: every point on the link hit-tests to it, got ${r.hits.join(' | ')}`);
    assert.equal(r.clicks, 1, `${where}: the link's own click handler still runs`);
    assert.equal(r.escapesCard, false, `${where}: row 3 text stays inside the card`);
    if (PHONE.includes(width)) assert.ok(r.statusBelowLink, `${where}: the phone layout keeps status on its own row`);
  }
}

/* Negative control: the old shared cell must reproduce the reported overlap
   with the wide live label, or this test cannot see the bug. */
for (const width of [1440, 900]) {
  const reverted = await measure(width, 'fighting', true);
  assert.ok(reverted.overlapPx > 0, `negative control is broken at ${width}px: the old shared-cell layout must overlap the wide label, got ${reverted.overlapPx}px²`);
}

await browser.close();
console.log('boss-participation-hit: link and status never overlap, link hit-testable, 360-1440px; old shared cell overlaps again');
