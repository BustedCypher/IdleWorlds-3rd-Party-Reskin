/**
 * Guild raid lobby layout, record times, ready-check pop-up and the raid
 * leaderboard on the Leaderboards route (GuildLobby.js, RaidLeaderboards.js,
 * guild.css "Raid lobby layout"; Curtis, 2026-10-08).
 *
 *   1. The lobby is a grid of the game's own cards (wrappers display:
 *      contents, nothing moved): lend | invite, boss | members, chat, prep +
 *      loadout on the left; ready/start, history, footer full width; the
 *      Leaderboard card hidden. Invite + Members and Prep + Loadout meet with
 *      no gap (one frame each). Phones: one column in reading order.
 *   2. Each difficulty pill shows its record time from the API board.
 *   3. A member sees a ready-check pop-up; its Confirm presses the game's
 *      button, Dismiss hides it for that check; the leader never sees it; the
 *      countdown copy follows text-only ticks.
 *   4. The Leaderboards route gains a raid leaderboard after the game's
 *      Leaderboards panel: boss and difficulty tabs, ranked rows, tags.
 *   5. Kill switch removes every mark and owned node.
 *   6. TESTING FEATURE: the lobby's four separate test toggles (LobbyPreview).
 *
 * Fixture markup follows the live lobby (Curtis's 2026-10-08 capture of a
 * pickup-group leader) and the game's own source (chunk 8577) for the
 * ready-check card. REAL BROWSER (Playwright), the built bundle.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

// Enough Tailwind to model the game's own flow, including the space-y
// margins the grid has to cancel (a fixture without them would lie).
const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#000;color:#fff}
button{font:inherit;color:inherit;background:none}input{font:inherit}
.panel{border:1px solid #333;padding:14px}.compact-panel{border:1px solid #333;border-radius:8px;padding:12px}
.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1 1 0%}.items-center{align-items:center}.justify-between{justify-content:space-between}
.gap-2{gap:8px}.gap-3{gap:12px}.gap-1\\.5{gap:6px}.relative{position:relative}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.w-full{width:100%}
.space-y-3>:not([hidden])~:not([hidden]){margin-top:12px}.space-y-2>:not([hidden])~:not([hidden]){margin-top:8px}
@media (min-width:1024px){.lg\\:flex-row{flex-direction:row}.lg\\:max-w-\\[50\\%\\]{max-width:50%}}
.bg-ember{background:#ff8a3d}.border-ember{border-color:#ff8a3d}.button-primary{border-radius:1rem;background:#ff8a3d;color:#091119}
.border-amber-300\\/50{border-color:rgb(252 211 77/.5)}.bg-amber-950\\/30{background-color:rgb(69 26 3/.3)}`;

const boss = `<div class="compact-panel p-3 space-y-1.5" id="boss"><div class="flex flex-wrap gap-1.5 pb-1"><button type="button" title="Ashmaw, the Cinder Tyrant" class="rounded-full px-3 py-1 text-[11px] bg-ember text-ink">Ashmaw</button><button type="button" title="Thessaly, the Plague Warden" class="rounded-full px-3 py-1 text-[11px] bg-white/5 text-white/50">Thessaly</button></div><p class="text-sm font-semibold text-white">🐉 Ashmaw, the Cinder Tyrant</p><p class="text-xs italic text-white/45">A molten-scaled wyrm chained beneath the old forge-cities.</p><p class="text-xs text-white/50">ATK 2,750 • DEF 450 • HP 21,000</p><div class="flex gap-1.5 pt-1" id="difficulties"><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5">🧪 Practice · no loot</button><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-ember bg-ember/20 text-ember">Normal</button><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5">🔥 Hard</button></div><div class="rounded-lg border px-2.5 py-1.5 text-[11px] border-amber-300/30 bg-amber-300/10 text-amber-100">✅ <span class="font-semibold">You've claimed Ashmaw's loot this week.</span></div></div>`;
const leaderboard = `<div class="compact-panel p-3 space-y-2" id="leaderboard"><p class="text-xs font-semibold text-white">🏆 Leaderboard <span class="font-normal text-white/50">· Ashmaw · Normal</span></p><div class="space-y-1"><div class="rounded-md "><button type="button" class="flex w-full items-center justify-between gap-2 text-[11px]"><span>#1 Royal Flush</span><span>1:50.00</span></button></div></div></div>`;
const history = `<div class="compact-panel p-3 space-y-2" id="history"><button type="button" class="flex w-full items-center justify-between text-left"><p class="text-[11px] font-semibold text-white">📜 My raid history</p><span class="text-[10px] text-white/40">show ▾</span></button></div>`;
const memberRow = n => `<div class="flex items-center justify-between gap-2 rounded-lg bg-sky-400/5 p-2"><div class="min-w-0"><button type="button" class="truncate text-left text-xs font-medium text-white hover:underline">Player ${n}</button><p class="truncate text-[10px] text-white/40">from Omen · Jewelcrafting Lv71</p></div><span class="flex shrink-0 items-center gap-1"><span class="text-[11px] text-white/25">Not ready</span></span></div>`;
const members = `<div class="flex-1 compact-panel p-3 space-y-2" id="members"><div class="flex items-center justify-between"><p class="text-xs font-semibold text-white">Members</p><p class="text-[11px] text-white/40" title="A raid takes at most 8 players">0/8 ready</p></div><div class="space-y-2"><div class="space-y-1.5 border-t border-white/10 pt-2"><p class="text-[10px] font-semibold uppercase tracking-wide text-white/40">Group (4/8)</p>${[1, 2, 3, 4].map(memberRow).join('')}</div></div></div>`;
const lend = `<div class="compact-panel p-3 space-y-2" id="lend"><p class="text-xs font-semibold text-white">Lend a Tradeskill</p><p class="text-[11px] text-white/40">Pick ONE skill to buff the whole raid with.</p><div class="relative"><button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1.5 text-left text-sky-200"><span class="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><span class="shrink-0">💠</span><span class="truncate">Ward</span></span><span class="shrink-0 text-[10px]">▾</span></button></div></div>`;
const prep = `<div class="compact-panel p-3 space-y-2" id="prep"><p class="text-xs font-semibold text-white">🧪 Pre-raid prep</p><p class="text-[11px] text-white/40">Your stats lock in the moment the fight starts.</p><p class="text-[11px] text-amber-200/80">No ATK/DEF potion active.</p><div class="space-y-1"><div class="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"><span class="min-w-0 truncate text-[11px] text-white/80">Super Kingssteel ATK Potion <span class="text-white/45">×20 · +36 ATK · 1h</span></span><button class="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px]">Drink</button></div></div></div>`;
const loadout = `<div class="compact-panel p-3 space-y-2" id="loadout"><p class="text-xs font-semibold text-white">Raid Loadout</p><p class="text-[11px] text-white/40">Set which loadout to raid with.</p><div class="flex flex-wrap items-center gap-2"><div class="min-w-0 flex-1"><p class="flex items-center gap-1.5 text-xs font-semibold text-white"><span class="truncate">RaidGear</span></p></div><button class="button-primary px-3 py-1.5 text-xs">Change</button></div></div>`;
const invite = `<div class="compact-panel p-3 space-y-2" id="invite"><div class="flex items-center justify-between"><p class="text-[11px] font-semibold text-white" id="invite-title">⚔️ Invite to your pickup group</p><span class="text-[10px] text-white/40">4/8</span></div><p class="text-[10px] text-white/40" id="invite-note">Invite anyone in your league, guildless or from any guild.</p><div class="flex gap-2"><div class="relative flex-1"><input class="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white" placeholder="Display name" autocomplete="off" value="" id="invite-input"></div><button class="button-primary px-3 py-1.5 text-xs" disabled="">Invite</button></div></div>`;
const start = `<div class="compact-panel p-3" id="start"><div class="flex items-center gap-2"><button class="flex-1 py-2 text-xs font-semibold rounded-xl border border-white/15 bg-white/5 text-white/70">Mark Ready</button><button class="flex-1 py-2 text-xs font-semibold rounded-xl border border-white/10 bg-white/5 text-white/25" disabled="" title="No members are ready">⚔️ Start Raid (0)</button></div><p class="mt-2 text-[10px] text-white/35 text-center">Starting a raid doesn't interrupt anyone's current activity.</p></div>`;
const chat = `<div class="compact-panel p-3 space-y-2" id="chat"><p class="text-[11px] font-semibold text-white">💬 Group Chat</p><p class="text-[10px] text-white/35">Private to this pickup group.</p><div class="h-40 overflow-y-auto space-y-1.5 rounded-lg bg-black/20 p-2" style="height:120px"><div><span class="text-[10px] font-semibold">BustedCypher: </span><span class="text-[10px]">⚔️ started a run.</span></div></div><div class="flex gap-2"><input class="flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs" placeholder="Message your guild…" maxlength="280" value=""><button class="button-primary px-3 py-1.5 text-xs" disabled="">Send</button></div></div>`;
const footer = `<div class="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-2 text-[10px]" id="footer"><button class="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">Disband group</button></div>`;
const readyCheck = leader => `<div class="compact-panel p-3 space-y-2 border border-amber-300/50 bg-amber-950/30" id="rc"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-amber-100">⚔️ Ready check: Ashmaw Normal</p><span class="text-xs tabular-nums text-amber-200" id="rc-timer">25s</span></div><p class="text-[11px] text-white/70">✅ Player 1<span class="block text-white/50">⏳ Waiting on: Player 2</span></p><div class="flex flex-wrap gap-2"><button class="button-primary px-4 py-1.5 text-xs" id="rc-confirm" onclick="window.rcConfirmed=(window.rcConfirmed||0)+1">Confirm — I'm here!</button>${leader ? '<button class="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-xs" id="rc-start">Start now (bench 1)</button>' : ''}</div></div>`;

const head = `<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2"><span>⚔️ Raid Dungeon</span><span class="rounded-md border px-1.5 py-0.5 text-[9px]">Beta</span></h2><p class="mt-0.5 text-[10px] text-white/45">⚔️ Guild run: <span class="font-semibold text-white/80">Omen</span> • 4/8 players</p></div><div class="flex flex-col items-end gap-1 text-[10px]"><button class="text-white/45 underline">View my guild (Omen)</button></div></div>`;
const LOBBY = (rc = '') => `<div class="panel p-3.5 space-y-3" id="raid">${head}${rc}<div class="flex flex-col gap-3 lg:flex-row lg:items-start" id="cols"><div class="flex-1 space-y-3 lg:max-w-[50%]" id="left">${boss}${leaderboard}${history}</div>${members}</div><div class="space-y-3" id="stack">${lend}${prep}${loadout}${invite}</div>${start}${chat}${footer}</div>`;

const LEADERBOARDS = `<div class="panel p-3.5" id="lb"><div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">Leaderboards</h2></div><div class="space-y-1.5"><div class="compact-row py-2">#1 Someone · 80</div></div></div><div class="panel p-3.5" id="market"><div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold text-white">Market</h2></div></div>`;

const BOARD = { leaderboard: {
  ashmaw: { normal: [{ sessionId: 'a1', guildName: 'Royal Flush', elapsedMs: 110000 }, { sessionId: 'a2', guildName: "DjMoO's Pickup Group", isPickup: true, elapsedMs: 152280 }],
    hard: [{ sessionId: 'a3', guildName: 'Omen', elapsedSec: 200 }] },
  thessaly: { normal: [{ sessionId: 't1', guildName: 'Omen', elapsedMs: 254500, isTestGuild: true }] },
} };

const page = (path, body) => `<!doctype html><html lang="en" data-skin="sans" data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>
<main class="overflow-x-hidden" data-skin="sans"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto">
<header class="panel"><div><p>IdleWorlds</p><h1><button class="hover:underline">Player</button></h1></div></header>
<div class="panel flex flex-wrap gap-2 p-2"><a href="/">Game</a><a href="/leaderboards">Leaderboards</a><a class="bg-ember text-ink" href="/guild">Guild</a></div>
<section class="grid gap-3">${body}</section></div></main></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];
let boardReads = 0;

async function open(path, body, width = 1280) {
  const tab = await browser.newPage({ viewport: { width, height: 1000 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(() => {
    const listeners = [], data = {};
    window.chrome = { runtime: { id: 'guild-lobby-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: { get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }), set: async bag => Object.assign(data, bag), remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
    window.toggleSkin = enabled => listeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: enabled } }, 'local'));
  });
  const html = page(path, body);
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === path) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/api/guild/raid/leaderboard') { boardReads += 1; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(BOARD) }); }
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}${path}`, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForTimeout(900);
  return tab;
}

const boxes = (tab, ids) => tab.evaluate(list => Object.fromEntries(list.map(id => {
  const el = document.getElementById(id);
  const r = el?.getBoundingClientRect();
  return [id, r && getComputedStyle(el).display !== 'none' ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null];
})), ids);

/* -- desktop: the lobby grid --------------------------------------------- */
console.log('\n/guild lobby at 1280px');
const tab = await open('/guild', LOBBY());
const s = await tab.evaluate(() => ({
  layout: document.getElementById('raid').getAttribute('data-iw-guild-layout'),
  wraps: ['cols', 'left', 'stack'].map(id => getComputedStyle(document.getElementById(id)).display).join(),
  slots: ['boss', 'leaderboard', 'history', 'members', 'lend', 'prep', 'loadout', 'invite', 'start', 'chat', 'footer'].map(id => `${id}:${document.getElementById(id).getAttribute('data-iw-guild-slot')}`).join(' '),
  lbHidden: getComputedStyle(document.getElementById('leaderboard')).display,
  note: getComputedStyle(document.getElementById('invite-note')).display,
}));
check('the lobby is a grid of the game\'s own cards; wrappers dissolve', s.layout === 'lobby' && s.wraps === 'contents,contents,contents', JSON.stringify(s));
check('every card gets its slot', s.slots === 'boss:boss leaderboard:leaderboard history:history members:members lend:lend prep:prep loadout:loadout invite:invite start:start chat:chat footer:footer', s.slots);
check('the Leaderboard card is gone from the Guild tab', s.lbHidden === 'none', s.lbHidden);
check('invite reads title, then the name bar (help line hidden)', s.note === 'none', s.note);
const b = await boxes(tab, ['lend', 'invite', 'boss', 'members', 'chat', 'prep', 'loadout', 'start', 'history', 'footer']);
const midX = (b.lend.right + b.invite.left) / 2;
check('lend (left) and invite (right) share the top row', Math.abs(b.lend.top - b.invite.top) <= 1 && b.lend.right <= b.invite.left, JSON.stringify([b.lend, b.invite]));
check('left column: boss, then chat (where the leaderboard was), then prep', b.boss.left < midX && b.chat.left < midX && b.prep.left < midX && b.boss.top >= b.lend.bottom && b.chat.top >= b.boss.bottom && b.prep.top >= b.chat.bottom, JSON.stringify([b.boss, b.chat, b.prep]));
check('invite + members are one frame (no gap)', b.members.left > midX && Math.abs(b.members.top - b.invite.bottom) <= 1, `invite.bottom=${b.invite.bottom} members.top=${b.members.top}`);
check('pre-raid prep is a half column, loadout merged under it', b.prep.right < midX && Math.abs(b.loadout.top - b.prep.bottom) <= 1 && b.loadout.left === b.prep.left, `prep.bottom=${b.prep.bottom} loadout.top=${b.loadout.top}`);
check('ready/start, then raid history, then the footer, at the foot', b.start.top >= Math.max(b.loadout.bottom, b.members.bottom) && b.history.top >= b.start.bottom && b.footer.top >= b.history.bottom && (b.history.right - b.history.left) > (b.lend.right - b.lend.left) * 1.5, JSON.stringify([b.start, b.history, b.footer]));

const rec = await tab.evaluate(() => [...document.querySelectorAll('#boss .iw-guild-record')].map(c => c.textContent).join(' | '));
check('each difficulty shows its record time and group', rec === 'No clear yet | 🏆 1:50.00 · Royal Flush | 🏆 3:20.00 · Omen', rec);
const recBox = await tab.evaluate(() => {
  const d = document.getElementById('difficulties').getBoundingClientRect(), r = document.querySelector('#boss .iw-guild-records').getBoundingClientRect();
  return { below: r.top >= d.bottom - 1, width: Math.abs(r.width - d.width) < 2 };
});
check('the records sit under the pills, one per pill', recBox.below && recBox.width, JSON.stringify(recBox));
check('no ready check, no pop-up', await tab.evaluate(() => !document.querySelector('.iw-rc-popup')));
await tab.close();

/* -- the ready-check pop-up --------------------------------------------- */
console.log('\nready-check pop-up');
const mem = await open('/guild', LOBBY(readyCheck(false)));
const p0 = await mem.evaluate(() => {
  const pop = document.querySelector('.iw-rc-popup');
  return pop && { title: pop.querySelector('.iw-rc-title').textContent, timer: pop.querySelector('.iw-rc-timer').textContent, fixed: getComputedStyle(pop).position, visible: pop.getBoundingClientRect().top >= 0 && pop.getBoundingClientRect().top < 80 };
});
check('a member sees the pop-up, pinned on screen, in the game\'s words', p0 && p0.title === '⚔️ Ready check: Ashmaw Normal' && p0.timer === '25s' && p0.fixed === 'fixed' && p0.visible, JSON.stringify(p0));
await mem.evaluate(() => { document.getElementById('rc-timer').firstChild.nodeValue = '19s'; });
await mem.waitForTimeout(300);
check('the pop-up countdown follows text-only ticks', await mem.evaluate(() => document.querySelector('.iw-rc-popup .iw-rc-timer')?.textContent) === '19s');
await mem.click('.iw-rc-popup .iw-rc-confirm');
await mem.waitForTimeout(300);
check('its Confirm presses the game\'s own button and closes', await mem.evaluate(() => window.rcConfirmed === 1 && !document.querySelector('.iw-rc-popup')));
await mem.close();
const mem2 = await open('/guild', LOBBY(readyCheck(false)));
await mem2.click('.iw-rc-popup .iw-rc-dismiss');
await mem2.evaluate(() => { document.getElementById('chat').append(Object.assign(document.createElement('p'), { textContent: 'new line' })); });
await mem2.waitForTimeout(500);
check('Dismiss hides it for this check, without pressing anything', await mem2.evaluate(() => !document.querySelector('.iw-rc-popup') && !window.rcConfirmed));
await mem2.evaluate(() => { const rc = document.getElementById('rc'); const again = rc.cloneNode(true); rc.replaceWith(again); });
await mem2.waitForTimeout(500);
check('a new ready check brings it back', await mem2.evaluate(() => !!document.querySelector('.iw-rc-popup')));
await mem2.close();
const lead = await open('/guild', LOBBY(readyCheck(true)));
check('the party leader never sees the pop-up', await lead.evaluate(() => !document.querySelector('.iw-rc-popup')));
await lead.evaluate(() => window.toggleSkin(false));
await lead.close();

/* -- phone: one column -------------------------------------------------- */
console.log('\n/guild lobby at 390px');
const phone = await open('/guild', LOBBY(), 390);
const pb = await boxes(phone, ['boss', 'chat', 'lend', 'prep', 'loadout', 'invite', 'members', 'start', 'history', 'footer']);
const order = Object.entries(pb).sort((x, y) => x[1].top - y[1].top).map(([k]) => k).join(',');
check('one column in reading order', order === 'boss,chat,lend,prep,loadout,invite,members,start,history,footer', order);
check('merged frames hold on a phone too', Math.abs(pb.loadout.top - pb.prep.bottom) <= 1 && Math.abs(pb.members.top - pb.invite.bottom) <= 1, JSON.stringify([pb.prep, pb.loadout, pb.invite, pb.members]));
check('nothing runs past the screen', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await phone.close();

/* -- the Leaderboards route --------------------------------------------- */
console.log('\n/leaderboards');
const lb = await open('/leaderboards', LEADERBOARDS);
const L = async () => lb.evaluate(() => {
  const panel = document.querySelector('.iw-raid-lb');
  return panel && { after: panel.previousElementSibling?.id, before: panel.nextElementSibling?.id,
    tabs: [...panel.querySelectorAll('[data-iw-raid-lb-tab]')].map(t => `${t.textContent.trim()}${t.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(','),
    rows: [...panel.querySelectorAll('.iw-raid-lb-row')].map(r => r.textContent.trim()).join(' | '),
    note: panel.querySelector('.iw-raid-lb-note')?.textContent || '', frame: panel.getAttribute('data-iw-ui') };
});
const l0 = await L();
check('the raid leaderboard follows the game\'s Leaderboards panel', l0 && l0.after === 'lb' && l0.before === 'market' && l0.frame === 'section-frame', JSON.stringify(l0));
check('boss and difficulty tabs, Ashmaw / Normal first', l0?.tabs === 'Ashmaw*,Thessaly,Practice,Normal*,Hard', l0?.tabs);
check('ranked rows with times and the pickup tag', l0?.rows === "#1Royal Flush1:50.00 | #2DjMoO's Pickup Grouppickup2:32.28", l0?.rows);
await lb.click('.iw-raid-lb [data-iw-raid-lb-tab="difficulty"]:nth-child(1)');
await lb.waitForTimeout(150);
check('an empty board says so', (await L()).note === 'No guild has defeated Ashmaw on Practice yet.', (await L()).note);
await lb.click('.iw-raid-lb [data-iw-raid-lb-tab="boss"]:nth-child(2)');
await lb.click('.iw-raid-lb [data-iw-raid-lb-tab="difficulty"]:nth-child(2)');
await lb.waitForTimeout(150);
check('switching boss and difficulty redraws the board', (await L()).rows === '#1Omentest4:14.50', (await L()).rows);
check('one read of the API serves the page', boardReads >= 1);
await lb.evaluate(() => window.toggleSkin(false));
await lb.waitForTimeout(300);
check('kill switch removes the raid leaderboard', await lb.evaluate(() => !document.querySelector('[data-iw-raid-lb]')));
await lb.close();

/* -- TESTING FEATURE: the lobby's test toggles (LobbyPreview.js) -------- */
console.log('\nlobby test toggles');
const tt = await open('/guild', LOBBY());
const T = () => tt.evaluate(() => {
  const bar = document.querySelector('#raid > [data-iw-lobby-test="bar"]');
  const rows = document.querySelectorAll('#members [data-iw-guild-role="guests"] > div, #members .space-y-1\\.5 > div').length;
  const rc = document.querySelector('[data-iw-lobby-kind="ready"]');
  const pop = document.querySelector('.iw-rc-popup');
  return {
    bar: bar ? { afterHead: bar.previousElementSibling?.getAttribute('data-iw-guild-role') === 'head',
      buttons: [...bar.querySelectorAll('button')].map(b => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(',') } : null,
    waiting: document.querySelector('#invite [data-iw-lobby-kind="invite"] p')?.textContent || null,
    rows,
    rc: rc ? { kind: rc.getAttribute('data-iw-guild-card'), underBar: rc.previousElementSibling?.getAttribute('data-iw-lobby-test') === 'bar', text: rc.textContent } : null,
    pop: pop ? `${pop.querySelector('.iw-rc-title').textContent}|${pop.querySelector('.iw-rc-timer').textContent}` : null,
  };
});
const press = async name => { await tt.click(`#raid [data-iw-lobby-test="${name}"]`); await tt.waitForTimeout(350); };
const t0 = await T();
check('a "🧪 Test:" strip of four separate toggles sits under the heading', t0.bar?.afterHead && t0.bar.buttons === 'Pending invite,Full party,Ready check,Pop-up', JSON.stringify(t0.bar));
check('nothing is shown until a toggle is pressed', !t0.waiting && t0.rows === 4 && !t0.rc && !t0.pop, JSON.stringify(t0));
await press('invite');
const t1 = await T();
check('Pending invite: the invite card shows a pending invite', t1.waiting === 'Waiting for an answer (2)' && /Pending invite\*/.test(t1.bar.buttons) && t1.rows === 4 && !t1.rc, JSON.stringify(t1));
await press('party');
const t2 = await T();
check('Full party: the member list tops up to 8', t2.rows === 8 && /Full party\*/.test(t2.bar.buttons) && !t2.rc && !t2.pop, JSON.stringify(t2));
await press('ready');
const t3 = await T();
check('Ready check: a ready-check card under the strip, and NO pop-up', t3.rc?.kind === 'ready-check' && t3.rc.underBar && !t3.pop, JSON.stringify(t3));
await tt.click('[data-iw-lobby-kind="ready"] button');
await tt.waitForTimeout(250);
check('the test card\'s own Confirm marks it confirmed', /You're confirmed/.test((await T()).rc?.text || ''));
await press('popup');
const t4 = await T();
check('Pop-up: the ready-check pop-up alone, with a demo countdown', /^⚔️ Ready check: Ashmaw Normal \(test\)\|(30|29)s$/.test(t4.pop || '') && /Pop-up\*/.test(t4.bar.buttons), JSON.stringify(t4));
await tt.click('.iw-rc-popup .iw-rc-dismiss');
await tt.waitForTimeout(300);
const t5 = await T();
check('dismissing the test pop-up turns its toggle off', !t5.pop && !/Pop-up\*/.test(t5.bar.buttons), JSON.stringify(t5));
for (const name of ['invite', 'party', 'ready']) await press(name);
const t6 = await T();
check('each toggle turns its own test off again', !t6.waiting && t6.rows === 4 && !t6.rc && !/\*/.test(t6.bar.buttons), JSON.stringify(t6));
await press('party');
await tt.evaluate(() => window.toggleSkin(false));
await tt.waitForTimeout(400);
check('kill switch removes the strip and every test node', await tt.evaluate(() => !document.querySelector('[data-iw-lobby-test], [data-iw-lobby-dummy]')));
await tt.close();

/* -- kill switch on the lobby ------------------------------------------- */
console.log('\nkill switch');
const ks = await open('/guild', LOBBY(readyCheck(false)));
await ks.evaluate(() => window.toggleSkin(false));
await ks.waitForTimeout(400);
const off = await ks.evaluate(() => ({
  marks: document.querySelectorAll('[data-iw-guild-slot],[data-iw-guild-wrap],[data-iw-guild-layout],[data-iw-guild-lobby-owned]').length,
  grid: getComputedStyle(document.getElementById('raid')).display,
}));
check('disable removes every slot, wrap, record and the pop-up', off.marks === 0 && off.grid === 'block', JSON.stringify(off));
await ks.close();

await browser.close();
check('no page errors', !errors.length, errors.join(' | '));
if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall guild-lobby checks passed');
