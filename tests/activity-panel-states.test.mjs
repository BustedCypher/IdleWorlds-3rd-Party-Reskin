/**
 * Activity panels in states the dashboard snapshots never showed (2026-09-28).
 *
 * Shapes are the game's own JSX (the live bundle, 2026-09-21). Three fixes:
 *
 *  1. IDLE Current Action. With no action running the panel has no progress
 *     bar, and findActivityPanelHost() climbed on until it found one: the
 *     whole column. The column became `current-action`, Current Action and
 *     Action Log its split header, a skill card's XP bar its progress, and
 *     the Daily XP Boost lost its mark; at 390px Current Action was squeezed
 *     into a sliver. The walk now stops at the label's own `.panel`.
 *  2. Action Log rows. The feed's timestamp rule wanted a bare "11:47:02",
 *     but the game prints the BROWSER's clock, so a 12-hour locale shows
 *     "11:47:02 AM"; the 'system' fallback then made rows of the "system"
 *     lines only, and a "combat" / "world boss" / "zone control" line kept
 *     the game's look. An optional AM/PM is accepted now, and a World Chat
 *     whose two layout copies both carry timestamps (they meet only at the
 *     panel) takes the no-marker fallback instead of losing its feed.
 *  3. The collapse control's NAME read the whole title, so Action Log's said
 *     "Collapse Action Logview all". It reads the title's own text now; the
 *     storage KEY is unchanged (`panel:action-log`).
 *
 * REAL BROWSER (Playwright): preferRendered() reads layout.
 *
 * Negative controls, each verified by reverting one fix and rebuilding:
 *   - the unbounded host walk: the idle, Skill Actions, Action Log and
 *     "action starts" checks fail (the column swallows both panels);
 *   - the bare-time regex: the 12-hour log keeps 1 of 3 rows;
 *   - no host fallback: the chat loses its feed (both clocks, both widths);
 *   - labelText for the name: "Collapse Action Logview all".
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const logLine = (channel, time, summary, xp) => `<div class="feed-line"><div class="mb-0.5 flex items-center justify-between gap-2"><p class="text-[9px] uppercase tracking-[0.16em] text-white/35">${channel}</p><p class="text-[9px] text-white/30">${time}</p></div><div class="flex items-start justify-between gap-2"><div class="min-w-0 flex-1"><p class="text-[11px] leading-4 text-white">${summary}</p>${xp ? `<p class="mt-0.5 text-[10px] text-sky-200/85">XP ${xp}</p>` : ''}</div></div></div>`;
const chatRow = (name, time, text) => `<div class="compact-row py-2"><div class="flex items-center justify-between gap-2"><p class="min-w-0 truncate text-[10px] font-medium"> <span class="font-semibold">${name}</span></p><p class="text-[10px] text-white/30">${time}</p></div><p class="whitespace-pre-wrap break-words text-[11px] leading-4 text-white/80">${text}</p></div>`;
const chatLine = (name, time, text) => `<div class="feed-line min-w-0 bg-black/10"><div class="flex min-w-0 flex-col gap-2"><p class="min-w-0 break-words text-[10px] font-medium"><button class="cursor-pointer text-left"> <span class="font-semibold">${name}</span></button></p><div class="flex min-w-0 flex-wrap items-center gap-2"><p class="text-[10px] text-white/30">${time}</p></div></div><p class="whitespace-pre-wrap break-words text-[11px] leading-4 text-white/80">${text}</p></div>`;

const page = clock => {
  const t = s => (clock === 12 ? `${s} AM` : s);
  return `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}button{font:inherit;color:inherit;background:none}body{margin:0}</style></head><body>
<div id="root" data-skin="default"><main><div style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:12px">
<div id="col" class="flex min-w-0 flex-col gap-3" style="display:flex;flex-direction:column;gap:12px">
  <div id="skills" class="panel p-3.5"><div class="mb-3 flex items-center justify-between" style="display:flex;justify-content:space-between"><div><h2 class="text-sm font-semibold text-white">Skill Actions</h2><div class="mt-1"><p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/75">Daily XP Boost: <!-- -->Combat + Mining<!-- --> +<!-- -->20<!-- -->% XP</p><p class="mt-1 text-[10px] text-white/40">Resets in <!-- -->04:12</p></div></div><div class="flex items-center"><button type="button">I</button><button type="button">II</button></div></div>
    <div class="space-y-2"><div class="compact-panel p-3"><p>⚔️ Combat</p><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-ember" style="width: 40%"></div></div><button type="button">Fight</button></div></div></div>
  <div id="current-action-panel" class="panel scroll-mt-3 p-3.5 md:scroll-mt-4"><div class="mb-2 flex items-center justify-between" style="display:flex;justify-content:space-between"><h2 class="text-sm font-semibold text-white">Current Action</h2><div class="flex items-center gap-2"><svg class="lucide lucide-clock3 h-4 w-4 text-ember" width="16" height="16"></svg></div></div><p class="text-xs text-white/60">Choose one skill row above and press its action button.</p></div>
  <div id="log" class="panel p-3.5"><div class="mb-2 flex items-center justify-between gap-2" style="display:flex;justify-content:space-between"><button type="button" class="flex items-center gap-1.5 text-sm font-semibold text-white" title="View full action log">Action Log<span class="text-[10px] font-normal uppercase tracking-[0.14em] text-white/35">view all</span></button><div class="flex items-center gap-2"><p class="text-[10px] text-sky-300/70">1,177,301<!-- --> XP/hr</p></div></div>
    <div class="feed-panel min-h-[96px] cursor-pointer" role="button" tabindex="0">${logLine('system', t('11:47:02'), 'Sunforged Ore x4', 'mining+1927')}${logLine('combat', t('11:46:56'), 'You defeated a Phoenix.', 'combat+1284')}${logLine('world boss', t('11:41:25'), 'Fighting Ancient Treant. 836 damage contributed so far.', '')}</div></div>
  <div id="chat" class="panel p-3.5"><div class="mb-2 flex items-center justify-between" style="display:flex;justify-content:space-between"><div><h2 class="text-sm font-semibold text-white">World Chat</h2><p class="mt-0.5 hidden text-[10px] text-white/40 xl:block">Showing the latest 100 messages.</p></div><div class="flex items-center gap-1"><button class="rounded p-0.5" title="Chat settings"><svg width="16" height="16"></svg></button></div></div>
    <div id="chat-preview" class="xl:hidden"><div class="space-y-1.5">${chatRow('Player 1', t('11:40:02'), 'anyone selling ore?')}${chatRow('Player 2', t('11:41:10'), 'yes, market')}</div><button class="mt-2 w-full">Open full chat...</button></div>
    <div id="chat-full" class="hidden xl:block"><div class="feed-panel max-h-[420px] overflow-y-auto">${chatLine('Player 1', t('11:40:02'), 'anyone selling ore?')}${chatLine('Player 2', t('11:41:10'), 'yes, market')}</div>
      <form class="mt-3 flex gap-2"><input maxlength="280" placeholder="Message world chat..." class="min-w-0 flex-1" value=""><button class="button-primary min-w-[74px] px-3 py-2 text-xs">Send</button></form></div></div>
</div></div></main></div>
<script>${SHIM}</` + `script><script>${bundle}</` + `script></body></html>`;
};
/* chrome.storage, in memory: where the collapse control saves its key. */
const SHIM = `window.chrome={runtime:{id:'t',getURL:p=>location.origin+'/'+String(p).replace(/^\\/+/,'')},storage:{local:(()=>{const d={},l=[];return{get:async k=>k==null?{...d}:typeof k==='string'?{[k]:d[k]}:{...d},set:async b=>{for(const[k,v]of Object.entries(b))d[k]=v},remove:async k=>{delete d[k]}}})(),onChanged:{addListener:()=>{},removeListener:()=>{}}}};`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.csv': 'text/csv', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open(clock, width) {
  const tab = await browser.newPage({ viewport: { width, height: 1000 } });
  tab.on('pageerror', e => errors.push(String(e)));
  const html = page(clock);
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  // Any collapse control: the panels' own may be missing (that is what the idle check catches).
  await tab.waitForFunction(() => document.querySelector('[data-iw-collapse]'), null, { timeout: 20000 });
  await settle(tab);
  return tab;
}
const settle = tab => tab.evaluate(async () => { for (let i = 0; i < 3; i += 1) {
  const s = document.createElement('span'); document.body.append(s);
  await new Promise(r => setTimeout(r, 120)); s.remove(); } });

const READ = () => {
  const $ = s => document.querySelector(s);
  const part = (root, name) => [...root.querySelectorAll(`[data-iw-panel-part="${name}"]`)];
  const ca = $('#current-action-panel'), log = $('#log'), chat = $('#chat'), col = $('#col');
  return {
    colMarks: [...col.attributes].filter(a => a.name.startsWith('data-iw')).map(a => a.name),
    caPanel: ca.dataset.iwPanel || null, caUi: ca.dataset.iwUi || null, caHeader: ca.dataset.iwPanelHeader || null,
    caCollapse: ca.querySelector('[data-iw-collapse]')?.getAttribute('title') || null,
    caProgress: part(ca, 'progress').map(el => el.parentElement === ca.querySelector('.space-y-2') ? 'bar' : el.className),
    skillsPanel: $('#skills').dataset.iwPanel || null, skillsFrame: $('#skills').dataset.iwUi || null,
    skillBarMarked: !!$('#skills [data-iw-panel-part]'),
    boost: !!$('#skills [data-iw-skill-boost="1"]'),
    logRows: part(log, 'feed-row').map(r => r.querySelector('p').textContent),
    logFeed: part(log, 'feed').map(el => el.className.split(' ')[0]),
    logCollapse: log.querySelector('[data-iw-collapse]')?.getAttribute('title') || null,
    chatFeed: part(chat, 'feed').map(el => el.id || el.className),
    chatRows: part(chat, 'feed-row').length,
    chatParts: ['composer', 'chat-input', 'send'].map(n => part(chat, n).length).join(','),
  };
};

for (const clock of [12, 24]) {
  for (const width of [1440, 390]) {
    console.log(`\n${clock}-hour clock, ${width}px`);
    const tab = await open(clock, width);
    const m = await tab.evaluate(READ);
    check('idle Current Action is its own panel, not the column', m.caPanel === 'current-action' && m.caUi === 'section-frame' && !m.caHeader && m.colMarks.length === 0,
      JSON.stringify({ caPanel: m.caPanel, caUi: m.caUi, caHeader: m.caHeader, col: m.colMarks }));
    check('idle Current Action: "Collapse Current Action", and no progress part anywhere', m.caCollapse === 'Collapse Current Action' && m.caProgress.length === 0 && !m.skillBarMarked,
      JSON.stringify({ collapse: m.caCollapse, progress: m.caProgress, skillBar: m.skillBarMarked }));
    check('Skill Actions keeps its own frame and the Daily XP Boost mark', m.skillsFrame === 'section-frame' && !m.skillsPanel && m.boost,
      JSON.stringify({ frame: m.skillsFrame, panel: m.skillsPanel, boost: m.boost }));
    check('Action Log: every line is a row, whatever its channel', JSON.stringify(m.logRows) === '["system","combat","world boss"]' && JSON.stringify(m.logFeed) === '["feed-panel"]',
      JSON.stringify({ rows: m.logRows, feed: m.logFeed }));
    check('Action Log: its collapse control says "Collapse Action Log"', m.logCollapse === 'Collapse Action Log', m.logCollapse);
    check('World Chat with messages: the phone preview is the feed, no rows; composer, input, send', JSON.stringify(m.chatFeed) === '["chat-preview"]' && m.chatRows === 0 && m.chatParts === '1,1,1',
      JSON.stringify({ feed: m.chatFeed, rows: m.chatRows, parts: m.chatParts }));

    if (clock === 12 && width === 1440) {
      // The action starts: a bar appears, and the SAME panel takes it.
      await tab.evaluate(() => {
        const ca = document.getElementById('current-action-panel');
        ca.querySelector(':scope > p').outerHTML = '<div class="space-y-2"><div class="flex items-center justify-between gap-3"><p class="text-sm font-semibold text-white">🛠️ Mine Sunforged</p><p class="text-[11px] uppercase tracking-[0.16em] text-white/45">2s</p></div><div class="h-2 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full" style="width: 30%"></div></div></div>';
      });
      await settle(tab);
      const r = await tab.evaluate(READ);
      check('the action starts: the same panel, its own bar is the progress part', r.caPanel === 'current-action' && JSON.stringify(r.caProgress) === '["bar"]' && r.colMarks.length === 0 && !r.skillBarMarked,
        JSON.stringify({ panel: r.caPanel, progress: r.caProgress, col: r.colMarks, skillBar: r.skillBarMarked }));
    }
    if (clock === 24 && width === 1440) {
      // The storage KEYS did not move with the name: fold both and read what was saved.
      await tab.evaluate(() => { document.querySelector('#log [data-iw-collapse]').click(); document.querySelector('#skills [data-iw-collapse]').click(); });
      await settle(tab);
      const saved = await tab.evaluate(async () => Object.keys((await chrome.storage.local.get('iw-collapsed-frames'))['iw-collapsed-frames'] || {}).sort());
      check('folding saves the SAME keys as before: panel:action-log, title:skill actions', JSON.stringify(saved) === '["panel:action-log","title:skill actions"]', JSON.stringify(saved));
    }
    await tab.close();
  }
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
if (failures) { console.log(`\nFAIL activity-panel-states - ${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS activity-panel-states');
