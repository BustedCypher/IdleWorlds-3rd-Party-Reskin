/**
 * Mobile audit: renders one live-shaped dashboard with the shipped bundle and
 * the GAME'S OWN deployed stylesheet at phone and tablet widths, then measures
 * what a player would call "all over the place":
 *
 *   overflow   a box that leaves the viewport (the live shell is
 *              overflow-x:hidden, so live this is CLIPPED, not scrollable)
 *   clip       a text box whose content is wider than the box
 *   escape     text painting outside its own panel frame
 *   overlap    two controls, or a control and foreign text, sharing pixels
 *   tap        a control smaller than 32px on either axis
 *   tiny       visible text under 10.5px
 *   gutter     panel / chrome edges that do not share one left and right inset
 *
 * plus a per-panel table (height, padding, title size and x) so inconsistency
 * between panels is visible as numbers, and screenshots of the page and of
 * every panel.
 *
 * Shapes: the page shell, nav, zone bar and the narrow `section.grid.xl:hidden`
 * stack are from claude/captures/iw-panel-layout-root-1188.json; the panel
 * bodies are the live-shaped fixtures from tests/collapsible-frames,
 * tests/skill-card-system and tests/smoke. The hidden wide copy is included
 * because the live page ships it and the skin must pick the rendered one.
 *
 * This is a FIXTURE, not the live page: headers the fixtures model loosely
 * (profile block, status grid) can differ live. Confirm a finding on a phone
 * before fixing anything it alone reports.
 *
 *   node claude/audit-mobile.mjs [--widths 360,390,430,768]
 *
 * Output: tmp/mobile-audit/report.json, report.md and PNGs.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'tmp/mobile-audit');
await mkdir(OUT, { recursive: true });

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WIDTHS = arg('--widths', '360,390,430,768').split(',').map(Number);

const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The game's compiled Tailwind + theme sheet. Public, fetched once and cached
   in tmp/ (gitignored); it is the game's file, so it is never committed. */
const GAME_CSS_PATH = resolve(ROOT, 'tmp/iw-app.css');
async function gameCss() {
  try { await access(GAME_CSS_PATH); return readFile(GAME_CSS_PATH, 'utf8'); } catch {}
  const home = await (await fetch('https://idleworlds.com/')).text();
  const href = home.match(/\/_next\/static\/css\/[^"]+\.css/)?.[0];
  if (!href) throw new Error('could not find the game stylesheet link on idleworlds.com');
  const css = await (await fetch(`https://idleworlds.com${href}`)).text();
  await writeFile(GAME_CSS_PATH, css);
  return css;
}
const GAME_CSS = await gameCss();

/* ── panel bodies ──────────────────────────────────────────────────────── */

const LUCIDE = d => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide h-4 w-4"><path d="${d}"/></svg>`;
const PAGER_HTML = `<div><button>${LUCIDE('m15 18-6-6 6-6')}</button><button>${LUCIDE('m9 18 6-6-6-6')}</button></div>`;
const CARDS = [
  { id: 'jewelcrafting', wrapCommand: true, icon: '&#128142;', skill: 'Jewelcrafting', lv: 70, pct: '41.1',
    title: 'Prospect Moonsteel Ore', verb: 'Prospect', base: 677, pager: 'content',
    lines: ['&bull; Moonsteel Ore 58097/2'] },
  { id: 'spellcrafting', icon: '&#10024;', skill: 'Spellcrafting', lv: 60, pct: '64',
    title: 'Harvest Moonsteel Mana', verb: 'Gather', base: 124, pager: 'content', active: 100, lines: [] },
  { id: 'tailoring', nestTitle: true, icon: '&#129525;', skill: 'Tailoring', lv: 54, pct: '86',
    title: 'Weave Moonsilk Cloth', verb: 'Weave', base: 1008, pager: 'commands',
    lines: ['&bull; Moonsilk 0/8', 'Requires Tailoring Lv 49'] },
  { id: 'woodcutting', icon: '&#127794;', skill: 'Woodcutting', lv: 63, pct: '39.8',
    title: 'Chop Moonwood', verb: 'Chop', base: 154, pager: null, active: 40, lines: [] },
  { id: 'construction', bareCommand: true, icon: '&#127959;', skill: 'Construction', lv: 56, pct: '55.9',
    title: 'Craft Sunforged Building Parts', verb: 'Craft Parts', base: 252, pager: 'content',
    lines: ['&bull; Moonsteel Building Parts 1220/2800 &bull; Moonwood 35940/19600 '
            + '&bull; Moonsteel Ore 58097/9800 &bull; Mythril Building Parts 152/200 '
            + '&bull; Aethersteel Building Parts 1/400 &bull; Bloodstone Building Parts 0/520',
            'Missing materials &mdash; will queue (gather first)',
            '<p class="text-red-400">Requires Construction Lv 80 and Woodcutting Lv 70</p>',
            'Found in the Bloodoak Grove'] },
];
/* The oldest game shape: the three zones are the card's own children, with no
   grid shell between (tests/smoke.test.mjs's Spellcraft card). The card is then
   the grid AND the container, which the phone rules handle separately. */
const NO_SHELL_CARD = sfx => `
<div class="compact-panel" id="alchemy-noshell${sfx}">
  <div><p>&#9879;&#65039; Alchemy</p><p>LV 48</p></div>
  <div><p>&#9879;&#65039; Brew Moonpetal Tonic</p><button>Lv 48 - 12.5% &bull; 9,020 to go</button><p>&bull; Moonpetal 12/4 &bull; Glass Vial 0/2</p><p>Base reward: +410 alchemy XP/task</p></div>
  <div><div><button>&lsaquo;</button><button>&rsaquo;</button></div><button>Brew</button></div>
</div>`;
const actionButton = c => `<button><span class="relative z-10">${c.verb}</span>${c.active ? `<span class="absolute inset-0${c.active === 100 ? ' animate-pulse' : ''} bg-black/15" style="width: ${c.active}%;"></span>` : ''}</button>`;
const card = (c, sfx) => `
<div class="compact-panel" id="${c.id}${sfx}">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
    <div><p>${c.icon} ${c.skill}</p><p>LV ${c.lv}</p></div>
    <div>
      ${c.nestTitle
        ? `<div><p>${c.title}</p><button>Lv ${c.lv} - ${c.pct}% &bull; 4,120 to go</button></div>`
        : `<p>${c.title}</p><button>Lv ${c.lv} - ${c.pct}% &bull; 4,120 to go</button>`}
      ${c.lines.map(l => l.startsWith('<') ? l : `<p>${l}</p>`).join('\n      ')}
      ${c.pager === 'content' ? PAGER_HTML : ''}
      <p>Base reward: +${c.base} ${c.skill.toLowerCase()} XP/task</p>
      <div><div style="width:${c.pct}%"></div></div>
    </div>
    ${c.bareCommand && c.pager !== 'commands' ? actionButton(c) : `<div>${c.wrapCommand ? '<div style="transform:translateZ(0);margin-top:14px;height:calc(100% - 14px)">' : ''}${c.pager === 'commands' ? PAGER_HTML : ''}${actionButton(c)}${c.wrapCommand ? '</div>' : ''}</div>`}
  </div>
</div>`;

const row = 'mb-2 flex items-center justify-between gap-2';
const PANELS = sfx => ({
  skills: `<div class="panel p-3.5" id="skills${sfx}"><div class="${row}"><h2>Skill Actions</h2><div><p>Daily XP Boost: Jewelcrafting + Mining + Woodcutting +20% XP</p><p>Resets in 13:17</p></div></div>
    <div class="grid gap-2">${CARDS.map(c => card(c, sfx)).join('')}${NO_SHELL_CARD(sfx)}</div></div>`,
  currentAction: `<div id="current-action-panel" class="panel scroll-mt-3 p-3.5 md:scroll-mt-4">
    <div class="${row}"><h2>Current Action</h2><div><button aria-label="Cancel current action">&times;</button><span>3s</span></div></div>
    <div><span>&#9874;</span><strong>Prospect Moonsteel Ore</strong></div>
    <div aria-valuenow="48" aria-valuemax="100"><div style="width:48%"></div></div>
    <p>6457 crafts left before the next queued action (~10h 45m)</p>
    <div><span>Queued</span><div>1. Mine Moonsteel</div><button aria-label="Remove queued action">&times;</button></div>
  </div>`,
  actionLog: `<div class="panel p-3.5" id="action-log${sfx}">
    <div class="${row}"><button type="button" title="View full action log">Action Log <span>view all</span></button>
      <div><p>832,170 XP/hr</p><p>52% win rate</p></div></div>
    <div class="feed-panel" role="button" tabindex="0">
      ${[33, 25, 13, 1].map(s => `<article><div><span>System</span><time>12:33:${String(s).padStart(2, '0')}</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>`).join('')}
    </div></div>`,
  inventory: `<div class="panel p-3.5" id="inventory${sfx}" aria-label="Inventory">
    <div class="${row}"><div><h2>Inventory</h2></div>
      <div class="flex items-center gap-2">
        <div class="relative"><button aria-label="Filter inventory" title="Filter inventory">${LUCIDE('M22 3H2l8 9.46V19l4 2v-8.54L22 3z')}</button></div>
        <button aria-label="Search inventory" title="Search inventory">${LUCIDE('m21 21-4.3-4.3')}</button>
        <button aria-label="Equipment Window" title="Equipment Window">${LUCIDE('M12 2 2 7l10 5 10-5-10-5z')}</button>
        <svg class="lucide lucide-package h-4 w-4 text-ember"></svg>
      </div></div>
    <!-- The filter tab row: a sibling of the header row and the list, as in
         tests/compact-button-boot.test.mjs; the labels are what classify it. -->
    <div class="mb-2 flex flex-wrap gap-1.5"><button class="text-ember" aria-pressed="true">All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
    <div class="space-y-1.5">
      <div class="compact-row"><div><span>Iron Sword</span><span>Lv 3</span></div><div><span>Tier 4 &middot; Weapon</span></div><div><span>In loadout: Main</span></div><div><span>x1</span></div><button>Equip</button><button>List</button></div>
      <div class="compact-row"><div><span>Wool Boots</span><span>+4</span></div><div><span>Tier 1 &middot; Boots</span><span>DEF +2</span><span>+3% 2x gather chance</span></div><div><span>In loadout: Item Find</span><span>Cut Sunstone: +6% Item Find</span></div><div><span>x1</span></div><button>Equip</button><button>List</button></div>
      <div class="compact-row"><div><span>Moonsteel Ore</span></div><div><span>Tier 3 &middot; Resource</span></div><div><span>x58,097</span></div><button>List</button></div>
    </div></div>`,
  quests: `<div class="panel p-3.5" id="quests${sfx}"><div class="mb-2 flex items-center justify-between"><h2>Quests</h2></div>
    <div class="space-y-2">
      <div class="compact-panel p-2.5"><div class="space-y-2"><div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1"><p class="text-xs font-semibold text-white">Night Claw Bounty</p>
          <p class="text-[11px] leading-4 text-white/60">Bring back 100 Night Claws from Moonsteel Basin.</p>
          <p class="mt-1 text-[11px] text-white/45">&#128160; Night Claw 22/100</p>
          <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +3,225g &bull; +1350 combat XP</p></div>
        <div class="flex shrink-0 flex-col gap-2" style="min-width:0px"><button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white" disabled>Turn In</button></div>
      </div><div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 22%"></div></div>
      <div class="text-[11px] text-white/45">22% complete</div></div></div>
      <div class="compact-panel p-2.5"><div class="space-y-2"><div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1"><p class="text-[10px] uppercase tracking-[0.16em] text-white/40">Tailoring Work Order</p>
          <p class="text-xs font-semibold text-white">Craft and turn in 38 Moonsilk Boots.</p>
          <p class="mt-1 text-[11px] text-white/45">&#129525; Moonsilk Boots 38/38</p>
          <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +1,284,500g &bull; +212,480 tailoring XP</p></div>
        <div class="flex shrink-0 flex-col gap-2" style="min-width:0px"><button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white">Turn In All (38)</button><button class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white">Skip (8)</button></div>
      </div><div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 100%"></div></div>
      <div class="text-[11px] text-white/45">100% complete</div></div></div>
    </div></div>`,
  bosses: `<div class="panel p-3.5" id="bosses${sfx}"><div class="mb-2 flex items-center justify-between"><h2>World Bosses</h2><span>Shared world events</span></div>
    <!-- The live card shape, from tests/world-boss-panels.test.mjs: a header row
         holding the title block and the action, then progress, participation,
         fighter details and the respawn line as the card's own children. -->
    <div class="space-y-2">
      <div class="compact-panel p-2.5"><div><div><p>&#127757; Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div><button>&#8987; Prejoined</button></div><div class="h-1.5 rounded-full"><div style="width: 40%"></div></div><button>World boss participation</button><div class="fighter-details"><p>Top Fighters</p></div><div><p>Respawns 8m left</p></div></div>
      <div class="compact-panel p-2.5"><div><div><p>&#127757; Abyssal Behemoth</p><p>Raid</p><p>Buff on kill: +8 XP/task for 2h</p></div><button>Prejoin</button></div><div class="h-1.5 rounded-full"><div style="width: 0%"></div></div><button>World boss participation</button><div class="fighter-details"><p>Top Fighters</p></div><div><p>Respawns 1h 26m left</p></div></div>
    </div>
    <h2>Zone Control</h2>
    <div class="compact-panel p-2.5"><div><p>&#128308; Red Team controls Zone 8</p></div><p>12,500 / 20,000 HP</p><div class="h-1.5 rounded-full"><div style="width: 62.5%"></div></div><p>Protected for 3h 44m</p><button>Last battle participants</button></div>
  </div>`,
  chat: `<div class="panel p-3.5" id="world-chat${sfx}">
    <div class="${row}"><div><h2>World Chat</h2><p>Showing the latest 100 messages.</p></div>
      <div><button aria-label="Favourite chat">&#9734;</button><button aria-label="Global chat">&#9678;</button><button aria-label="Chat settings">&#9881;</button></div></div>
    <div>${['Kno000 was trying to upgrade their Regal Silk Boots+1, but they failed.', 'Kno000 successfully upgraded Regal Silk Boots+1 to Regal Silk Boots+2!', 'BritishDemon: anyone selling Moonsteel Upgrade Orbs? paying well']
      .map((m, i) => `<article><div><strong>&#128227; IdleWorlds</strong><time>12:16:4${i}</time></div><p>${m}</p></article>`).join('')}</div>
    <form><input placeholder="Message world chat..."><button type="button">Send</button></form>
  </div>`,
});

const narrow = PANELS('');
const wide = PANELS('-wide');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>IdleWorlds</title><style>${GAME_CSS}</style></head>
<body><div id="root" data-skin="default">
  <div class="mx-auto flex w-full max-w-[1380px] flex-col gap-3 overflow-x-hidden px-2 py-3 sm:px-4 sm:py-5">
    <!-- The live header's shape and class names, from build-tools/render-fixtures.mjs
         (itself from live captures), WITHOUT its data-iw-header marks: the skin
         has to classify this the way it does on the live page. -->
    <header class="panel p-3.5 sm:p-4">
      <div class="grid gap-3">
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0 overflow-hidden">
            <p>IdleWorlds</p>
            <h1 class="header-player-name"><button class="hover:underline" title="View your profile">BustedCypher</button></h1>
            <p class="header-player-title">Craftbound Innovator</p>
            <p>&#9876;&#65039; Combat Lv 62 &bull; Zone 19: Eternium Verge</p>
            <button>Players online: 141</button>
          </div>
          <div class="flex items-center gap-2">
            ${['&#9734;', '&#9993;', '+', '1', '&#9881;'].map(g => `<button class="header-icon-btn">${g}</button>`).join('')}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 min-w-0">
          <div>&#128176; 10,957,780</div><button>&#129514; XP +36/task &bull; 17h 17m left</button><button>ATK 350 &bull; DEF 358 &bull; HP 477</button>
          <button>&#9876;&#65039; ATK +34 &bull; 17h 17m left</button><button>&#128737;&#65039; DEF +34 &bull; 17h 17m left</button><button>&#9889; Matthais64 boosted (3/4) &middot; 1d 8h left</button>
        </div>
      </div>
    </header>
    <div class="panel flex flex-wrap gap-2 p-2"><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button><button>Dungeon</button></div>
    <div class="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">You will auto-attack Ancient Treant when it respawns.</div>
    <div class="panel flex flex-col gap-2 p-3 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between">
      <div><p>&#129517; Zone 19: Eternium Verge<button>who's here?</button></p><p>Next zone target: ATK 287 / DEF 291 (or Lv 77 in any skill)</p></div>
      <div class="flex flex-wrap gap-2"><button>&#127760; Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
    </div>
    <section class="grid gap-3 xl:hidden" id="narrow-stack">
      ${narrow.skills}${narrow.currentAction}${narrow.actionLog}${narrow.inventory}${narrow.quests}${narrow.bosses}${narrow.chat}
    </section>
    <section class="hidden gap-3 xl:grid xl:grid-cols-[minmax(320px,0.42fr)_minmax(0,0.58fr)]">
      <div class="flex min-w-0 flex-col gap-3">${wide.skills}${wide.actionLog}${wide.chat}</div>
      <div class="flex min-w-0 flex-col gap-3">${wide.inventory}${wide.quests}${wide.bosses}</div>
    </section>
  </div>
</div><script>${bundle}</` + `script></body></html>`;

/* ── the in-page audit ─────────────────────────────────────────────────── */

const AUDIT = () => {
  const vw = innerWidth;
  const r1 = n => Math.round(n * 10) / 10;
  const shown = el => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const b = el.getBoundingClientRect();
    return b.width > 0.5 && b.height > 0.5;
  };
  const name = el => {
    if (!el) return '';
    const own = el.getAttribute('aria-label') || el.textContent || '';
    const marks = [...el.attributes].filter(a => a.name.startsWith('data-iw-')).map(a => `${a.name.slice(8)}=${a.value}`).slice(0, 3).join(' ');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${marks ? ` [${marks}]` : ''} "${own.replace(/\s+/g, ' ').trim().slice(0, 48)}"`;
  };
  /* The panel a node belongs to, for grouping and for the escape check. */
  const PANEL_SEL = '#narrow-stack > *, header.panel, [data-iw-chrome="shell"] > *, .iw-village-scene';
  const panelOf = el => el.closest('#narrow-stack > *') || el.closest('header') ||
    el.closest('.mx-auto > *');
  const panelName = p => {
    if (!p) return '(page)';
    const h = p.querySelector('h1,h2,[data-iw-ui="section-title"]');
    return (h?.textContent || p.getAttribute('aria-label') || p.className.split(' ').slice(0, 3).join('.')).replace(/\s+/g, ' ').trim().slice(0, 28);
  };
  const clippedBy = el => {
    const b = el.getBoundingClientRect();
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) {
        const pb = e.getBoundingClientRect();
        if (b.right > pb.right + 0.5 || b.left < pb.left - 0.5) return e;
      }
    }
    return null;
  };

  const root = document.querySelector('#root');
  const all = [...root.querySelectorAll('*')].filter(el => !el.closest('.hidden.xl\\:grid') && shown(el));
  const findings = [];
  const add = (kind, el, detail) => findings.push({ kind, panel: panelName(panelOf(el)), el: name(el), detail });

  // overflow: outermost boxes leaving the viewport horizontally
  for (const el of all) {
    const b = el.getBoundingClientRect();
    if (b.right <= vw + 0.5 && b.left >= -0.5) continue;
    const p = el.parentElement.getBoundingClientRect();
    if (p.right > vw + 0.5 || p.left < -0.5) continue;
    const clip = clippedBy(el);
    add('overflow', el, `x ${r1(b.left)}..${r1(b.right)} of ${vw}${clip ? `, clipped by ${name(clip)}` : ''}`);
  }

  // clip: a box whose own content is wider/taller than it and that hides the rest
  for (const el of all) {
    if (el.matches('svg, svg *, input, textarea, [data-iw-panel-part="feed"]')) continue;
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (!text) continue;
    const s = getComputedStyle(el);
    const hid = /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflowY);
    if (!hid || parseFloat(s.fontSize) === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) {
      add('clip', el, `content ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}${s.textOverflow === 'ellipsis' ? ' (ellipsis)' : ''}${s.webkitLineClamp && s.webkitLineClamp !== 'none' ? ` (line-clamp ${s.webkitLineClamp})` : ''}`);
    }
  }

  // text runs: rects per text node, used by escape / tiny / overlap
  const runs = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const host = t.parentElement;
    if (!t.nodeValue.trim() || !host || host.closest('.hidden.xl\\:grid') || !shown(host)) continue;
    const s = getComputedStyle(host);
    if (parseFloat(s.fontSize) === 0 || s.color === 'rgba(0, 0, 0, 0)' || s.color === 'transparent') continue;
    const range = document.createRange(); range.selectNodeContents(t);
    const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    if (rects.length) runs.push({ host, rects, size: parseFloat(s.fontSize), text: t.nodeValue.trim() });
  }

  // escape: text outside its panel's border box. Two instrument traps skipped:
  // a panel that is `display: contents` (the merged zone bar) has no box of
  // its own, and a Range reports the FULL width of text an ancestor clips
  // (an ellipsis line), which is not paint.
  for (const run of runs) {
    const panel = panelOf(run.host);
    if (!panel) continue;
    const pb = panel.getBoundingClientRect();
    if (pb.width === 0 && pb.height === 0) continue;
    if (clippedBy(run.host) || /(hidden|clip)/.test(getComputedStyle(run.host).overflowX)) continue;
    const out = run.rects.find(r => r.left < pb.left - 1 || r.right > pb.right + 1);
    if (out) add('escape', run.host, `"${run.text.slice(0, 40)}" at x ${r1(out.left)}..${r1(out.right)}, panel ${r1(pb.left)}..${r1(pb.right)}`);
  }

  // tiny text
  const tiny = new Map();
  for (const run of runs) if (run.size < 10.5) {
    const key = `${run.size}px ${panelName(panelOf(run.host))}`;
    tiny.set(key, [...(tiny.get(key) || []), run.text.slice(0, 24)]);
  }
  for (const [key, texts] of tiny) findings.push({ kind: 'tiny', panel: key.split(' ').slice(1).join(' '), el: key.split(' ')[0], detail: [...new Set(texts)].slice(0, 5).join(' | ') });

  // tap targets: WCAG 2.2 2.5.8's 24px minimum, measured on the HIT area - an
  // absolutely positioned ::before with negative insets is part of the button
  // for hit testing (the collapse toggle's touch extension), a clipped one is not
  const controls = all.filter(el => el.matches('button, a[href], input, select, textarea, [role="button"]') && !el.matches('[role="button"].feed-panel, [data-iw-panel-part="feed"]'));
  for (const el of controls) {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (s.pointerEvents === 'none') continue;
    let w = b.width, h = b.height;
    const pb = getComputedStyle(el, '::before');
    if (pb.content !== 'none' && pb.position === 'absolute' && s.overflow === 'visible' && s.clipPath === 'none') {
      w += Math.max(0, -parseFloat(pb.left) || 0) + Math.max(0, -parseFloat(pb.right) || 0);
      h += Math.max(0, -parseFloat(pb.top) || 0) + Math.max(0, -parseFloat(pb.bottom) || 0);
    }
    if (w < 24 || h < 24) add('tap', el, `${r1(w)}x${r1(h)} hit area`);
  }

  // overlap: control vs control, control vs text that is not inside it
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], c = controls[j];
    if (a.contains(c) || c.contains(a)) continue;
    const area = inter(a.getBoundingClientRect(), c.getBoundingClientRect());
    if (area > 4) add('overlap', a, `with ${name(c)} (${Math.round(area)}px²)`);
  }
  for (const el of controls) {
    const b = el.getBoundingClientRect();
    for (const run of runs) {
      if (el.contains(run.host) || run.host.contains(el)) continue;
      if (panelOf(run.host) !== panelOf(el)) continue;
      const area = run.rects.reduce((n, r) => n + inter(b, r), 0);
      if (area > 6) add('overlap', el, `covers text "${run.text.slice(0, 32)}" (${Math.round(area)}px²)`);
    }
  }

  // gutters + per-panel table
  const edges = [];
  const shell = document.querySelector('.mx-auto');
  const tops = [...shell.children, ...document.querySelectorAll('#narrow-stack > *')].filter(el => el.id !== 'narrow-stack' && shown(el));
  const table = tops.map(el => {
    const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    const title = el.querySelector('[data-iw-ui="section-title"], h1, h2');
    const tb = title && shown(title) ? title.getBoundingClientRect() : null;
    edges.push([r1(b.left), r1(vw - b.right)]);
    return { panel: panelName(el), x: r1(b.left), right: r1(vw - b.right), w: r1(b.width), h: r1(b.height),
      pad: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      titleSize: title ? getComputedStyle(title).fontSize : '', titleX: tb ? r1(tb.left - b.left) : '',
      marks: [...el.attributes].filter(a => a.name.startsWith('data-iw-')).map(a => a.name.slice(8) + '=' + a.value).join(' ').slice(0, 80) };
  });
  const lefts = new Set(edges.map(e => e[0])), rights = new Set(edges.map(e => e[1]));
  if (lefts.size > 1 || rights.size > 1) findings.push({ kind: 'gutter', panel: '(page)', el: '', detail: `left insets ${[...lefts].join('/')}, right insets ${[...rights].join('/')}` });

  /* Skill cards: where each zone actually landed. */
  const cards = [...document.querySelectorAll('#narrow-stack .compact-panel.fs-skill-panel')].map(c => {
    const q = s => c.querySelector(s);
    const bx = el => { if (!el || !shown(el)) return null; const b = el.getBoundingClientRect(); const cb = c.getBoundingClientRect();
      return `${r1(b.left - cb.left)},${r1(b.top - cb.top)} ${r1(b.width)}x${r1(b.height)}`; };
    const shell = q('[data-iw-skill-layout-shell="1"]');
    const title = q('[data-iw-skill-role="action-title"]');
    return { id: c.id, card: bx(c), rows: shell ? getComputedStyle(shell).gridTemplateRows : '', cols: shell ? getComputedStyle(shell).gridTemplateColumns : '',
      identity: bx(q('[data-iw-skill-zone="identity"]')), content: bx(q('[data-iw-skill-zone="content"]')), commands: bx(q('[data-iw-skill-zone="commands"]')),
      title: bx(title), titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : null, base: bx(q('.fs-skill-base-exp')),
      button: bx(q('[data-iw-skill-role="action-button"]')), pager: bx(q('[data-iw-skill-role="nav-group"]')),
      frame: bx(q('[data-iw-skill-v2-body]')), foot: bx(q('[data-iw-skill-v2-row]:not([data-iw-skill-v2-body])')) };
  });

  return { cards, vw, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, findings, table };
};

/* ── run ───────────────────────────────────────────────────────────────── */

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const VILLAGE = { player: { housing: { tier: 3 }, villageAddons: { totalSlots: 3, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' }] } } };

const browser = await chromium.launch();
const report = {};
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: width < 768 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/' || url.pathname.endsWith('.html')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    if (url.pathname === '/api/player') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(VILLAGE) });
    try {
      return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(`${ORIGIN}/dashboard.html`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  const result = await page.evaluate(AUDIT);
  result.errors = errors;
  /* --probe "<expression>": evaluate any expression on the rendered page at
     each width, for follow-up measurements without editing this file. */
  const probeFile = arg('--probe-file', null);
  const probe = probeFile ? await readFile(resolve(probeFile), 'utf8') : arg('--probe', null);
  if (probe) console.log(`probe ${width}:`, JSON.stringify(await page.evaluate(probe), null, 1));
  report[width] = result;
  await page.screenshot({ path: resolve(OUT, `page-${width}.png`), fullPage: true });
  /* The merged header chrome (nav + notice + zone bar) is one frame drawn on
     the SHELL, and its zone bar is display:contents, so no element screenshot
     can capture it: clip the band between the header and the panel stack. */
  const band = await page.evaluate(() => {
    const top = document.querySelector('.mx-auto > header').getBoundingClientRect().bottom + scrollY;
    const bottom = document.querySelector('#narrow-stack').getBoundingClientRect().top + scrollY;
    return { y: top, h: bottom - top };
  });
  await page.screenshot({ path: resolve(OUT, `chrome-${width}.png`), fullPage: true, clip: { x: 0, y: band.y, width, height: Math.max(40, band.h) } });
  const firstCard = await page.$('#narrow-stack .compact-panel');
  if (firstCard && await firstCard.isVisible()) await firstCard.screenshot({ path: resolve(OUT, `card-${width}.png`) });
  if (width === WIDTHS[0] || width === 390) {
    const panels = await page.$$('.mx-auto > :is(header, div:not(.hidden)), #narrow-stack > *');
    let i = 0;
    for (const el of panels) {
      if (!(await el.isVisible())) continue;
      const label = (await el.evaluate(e => (e.querySelector('h1,h2')?.textContent || e.textContent).trim().slice(0, 18))).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await el.screenshot({ path: resolve(OUT, `${width}-${String(i++).padStart(2, '0')}-${label}.png`) }).catch(() => {});
    }
  }
  await context.close();
}
await browser.close();

await writeFile(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
let md = '# Mobile audit (fixture)\n';
for (const [w, r] of Object.entries(report)) {
  md += `\n## ${w}px (document ${r.docWidth}x${r.docHeight})${r.errors.length ? ` errors: ${r.errors.join('; ')}` : ''}\n\n`;
  md += '| panel | x | right | w | h | padding | title | title x | marks |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const t of r.table) md += `| ${t.panel} | ${t.x} | ${t.right} | ${t.w} | ${t.h} | ${t.pad} | ${t.titleSize} | ${t.titleX} | ${t.marks} |\n`;
  const byKind = Object.groupBy(r.findings, f => f.kind);
  for (const [kind, list] of Object.entries(byKind)) {
    md += `\n**${kind}** (${list.length})\n\n`;
    for (const f of list.slice(0, 60)) md += `- ${f.panel} · ${f.el} · ${f.detail}\n`;
  }
}
await writeFile(resolve(OUT, 'report.md'), md);
for (const [w, r] of Object.entries(report)) {
  const counts = Object.entries(Object.groupBy(r.findings, f => f.kind)).map(([k, v]) => `${k}=${v.length}`).join(' ');
  console.log(`${w}px  doc ${r.docWidth}x${r.docHeight}  ${counts}${r.errors.length ? `  ERRORS ${r.errors.length}` : ''}`);
}
