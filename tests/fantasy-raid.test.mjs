/**
 * Fantasy raid port (src/skins/fantasy/raid/, styles/raid.css): the raid UI
 * Legacy gained after the game's native Fantasy port was delivered
 * (2026-10-07), layered on that port.
 *
 * THE PORT IS EMULATED WITH ITS OWN CODE. The live Fantasy theme runs the
 * skin's Legacy modules as delivered at 37c608b, so this harness bundles
 * Legacy's GuildPanels with exactly the post-delivery changes taken back out:
 * GuildLobby stubbed, RaidHud's decorateOutcome call removed, and "mark
 * ready" removed from READY_LABEL. That page carries the port's real tags,
 * and Fantasy is started on top of it. (A hand-written fixture of the port's
 * attributes would only model what this test's author believed they were.)
 *
 *   1. Lobby: grid layout with every card slotted, the live "Mark Ready"
 *      card slotted `start` although the port tags it generic, Leaderboard
 *      card hidden, record times from the API board, the boss card rework.
 *   2. Ready check: pop-up for a member, text-only countdown ticks, Confirm
 *      presses the game's button; never for the leader.
 *   3. Result banner on the port's tagged outcome card; wipe tone; an
 *      unparsed headline keeps the port's card.
 *   4. Raid leaderboard on /leaderboards with plated tabs.
 *   5. Quiescence: an idle lobby mutates nothing (with a control that the
 *      counter does count).
 *   6. Stand-down: once a port stylesheet styles a feature, Fantasy clears
 *      ITS marks and nodes, and leaves a value the port wrote.
 *   7. stop() restores the port's page byte for byte.
 *
 * REAL BROWSER (Playwright).
 */

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LEGACY = resolve(ROOT, 'src/skins/legacy/modules');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

/* ── the two bundles ──────────────────────────────────────────────────── */

const asDelivered = {
  name: 'port-as-delivered-2026-10-07',
  setup(b) {
    b.onLoad({ filter: /[\\/]legacy[\\/]modules[\\/](GuildLobby|RaidHud|GuildPanels)\.js$/ }, async args => {
      const name = args.path.replace(/\\/g, '/').split('/').pop();
      if (name === 'GuildLobby.js') {
        return { contents: 'export function decorateGuildLobby() {}\nexport function clearGuildLobby() {}\n', loader: 'js' };
      }
      let src = await readFile(args.path, 'utf8');
      // Each cut must match exactly once, or Legacy changed under the emulation.
      const cut = (from, to) => {
        const hits = src.match(new RegExp(from.source, 'gm'))?.length || 0;
        if (hits !== 1) throw new Error(`port emulation: ${from} matched ${hits}x in ${name}; Legacy changed, update the emulation`);
        src = src.replace(from, to);
      };
      if (name === 'RaidHud.js') cut(/^[ \t]*decorateOutcome\(arena\);\r?\n/m, '');
      if (name === 'GuildPanels.js') cut(/\|ready up\|mark ready\)\$\/i/, '|ready up)$/i');
      return { contents: src, loader: 'js', resolveDir: LEGACY };
    });
  },
};

async function bundle(options) {
  const out = await build({ bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'text' }, logLevel: 'silent', ...options });
  return out.outputFiles[0].text;
}
const portJs = await bundle({ stdin: { contents: `export { decorateGuildPanel } from './GuildPanels.js';`, resolveDir: LEGACY },
  globalName: 'Port', plugins: [asDelivered] });
const fantasyJs = await bundle({ entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], globalName: 'Fantasy' });

/* ── fixtures (the game's own markup; see tests/guild-lobby.test.mjs) ─── */

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#000;color:#fff;font:14px sans-serif}
button{font:inherit;color:inherit;background:none}input{font:inherit}
.panel{border:1px solid #333;padding:14px}.compact-panel{border:1px solid #333;border-radius:8px;padding:12px}
.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1 1 0%}.items-center{align-items:center}.justify-between{justify-content:space-between}
.gap-2{gap:8px}.gap-3{gap:12px}.gap-1\\.5{gap:6px}.relative{position:relative}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.w-full{width:100%}
.space-y-3>:not([hidden])~:not([hidden]){margin-top:12px}.space-y-2>:not([hidden])~:not([hidden]){margin-top:8px}
@media (min-width:1024px){.lg\\:flex-row{flex-direction:row}.lg\\:max-w-\\[50\\%\\]{max-width:50%}}
.bg-ember{background:#ff8a3d}.border-ember{border-color:#ff8a3d}.button-primary{border-radius:1rem;background:#ff8a3d;color:#091119}
.text-emerald-300{color:#6ee7b7}.text-rose-300{color:#fda4af}`;

const TIP = 'Tip: bring a tank (Combat lend → Challenge) so the big single hits land on them, plus healers and Cleanse. Fortify (Smithing) makes tanking much safer.';
const boss = `<div class="compact-panel p-3 space-y-1.5" id="boss"><div class="flex flex-wrap gap-1.5 pb-1"><button type="button" title="Ashmaw, the Cinder Tyrant" class="rounded-full px-3 py-1 text-[11px] bg-ember text-ink">Ashmaw</button><button type="button" title="Thessaly, the Plague Warden" class="rounded-full px-3 py-1 text-[11px] bg-white/5 text-white/50">Thessaly</button></div>`
  + `<p class="text-sm font-semibold text-white" id="name">🐉 Ashmaw, the Cinder Tyrant</p><p class="text-xs italic text-white/45">A molten-scaled wyrm chained beneath the old forge-cities.</p>`
  + `<p class="text-xs text-white/50" id="stats">ATK <span class="">2,750</span> • DEF 450 • HP <span class="">21,000</span> • 🔥 fire-based abilities (single-target, AOE, curse, burning)</p>`
  + `<p class="text-xs text-amber-200/80" id="req">Requires Combat 50+ to join. Wants 60 fire resist total to mitigate most fire damage — a level 70 Jewelcrafting lend covers 26 of that, bring the rest on gear.</p>`
  + `<p class="text-xs text-sky-200/80" id="tip">${TIP}</p>`
  + `<div class="flex gap-1.5 pt-1" id="difficulties"><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5">🧪 Practice · no loot</button><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-ember bg-ember/20 text-ember">Normal</button><button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5">🔥 Hard</button></div>`
  + `<div class="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[11px] leading-5 text-amber-100" id="notice">✅ <span class="font-semibold">You've claimed Ashmaw's loot this week.</span> You can keep raiding it for leaderboard times, but it won't drop loot for you again until the weekly reset in 3d 18h.<span class="block text-[10px] opacity-60">Weekly reset: Monday 00:00 Eastern, same time for everyone.</span></div></div>`;
const leaderboard = `<div class="compact-panel p-3 space-y-2" id="leaderboard"><p class="text-xs font-semibold text-white">🏆 Leaderboard <span class="font-normal text-white/50">· Ashmaw · Normal</span></p><div class="space-y-1"><div class="rounded-md "><button type="button" class="flex w-full items-center justify-between gap-2 text-[11px]"><span>#1 Royal Flush</span><span>1:50.00</span></button></div></div></div>`;
const history = `<div class="compact-panel p-3 space-y-2" id="history"><button type="button" class="flex w-full items-center justify-between text-left"><p class="text-[11px] font-semibold text-white">📜 My raid history</p><span class="text-[10px] text-white/40">show ▾</span></button></div>`;
const memberRow = n => `<div class="flex items-center justify-between gap-2 rounded-lg bg-sky-400/5 p-2"><div class="min-w-0"><button type="button" class="truncate text-left text-xs font-medium text-white hover:underline">Player ${n}</button><p class="truncate text-[10px] text-white/40">from Omen · Jewelcrafting Lv71</p></div><span class="flex shrink-0 items-center gap-1"><span class="text-[11px] text-white/25">Not ready</span></span></div>`;
const members = `<div class="flex-1 compact-panel p-3 space-y-2" id="members"><div class="flex items-center justify-between"><p class="text-xs font-semibold text-white">Members</p><p class="text-[11px] text-white/40">0/8 ready</p></div><div class="space-y-2"><div class="space-y-1.5 border-t border-white/10 pt-2"><p class="text-[10px] font-semibold uppercase tracking-wide text-white/40">Group (4/8)</p>${[1, 2, 3, 4].map(memberRow).join('')}</div></div></div>`;
const lend = `<div class="compact-panel p-3 space-y-2" id="lend"><p class="text-xs font-semibold text-white">Lend a Tradeskill</p><p class="text-[11px] text-white/40">Pick ONE skill to buff the whole raid with.</p><div class="relative"><button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left"><span class="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><span class="shrink-0">💠</span><span class="truncate">Ward</span></span><span class="shrink-0 text-[10px]">▾</span></button></div></div>`;
const prep = `<div class="compact-panel p-3 space-y-2" id="prep"><p class="text-xs font-semibold text-white">🧪 Pre-raid prep</p><p class="text-[11px] text-white/40">Your stats lock in the moment the fight starts.</p></div>`;
const loadout = `<div class="compact-panel p-3 space-y-2" id="loadout"><p class="text-xs font-semibold text-white">Raid Loadout</p><p class="text-[11px] text-white/40">Set which loadout to raid with.</p><div class="flex flex-wrap items-center gap-2"><div class="min-w-0 flex-1"><p class="text-xs font-semibold text-white"><span class="truncate">RaidGear</span></p></div><button class="button-primary px-3 py-1.5 text-xs">Change</button></div></div>`;
const invite = `<div class="compact-panel p-3 space-y-2" id="invite"><div class="flex items-center justify-between"><p class="text-[11px] font-semibold text-white">⚔️ Invite to your pickup group</p><span class="text-[10px] text-white/40">4/8</span></div><div class="flex gap-2"><div class="relative flex-1"><input class="w-full rounded-lg border px-2.5 py-1.5 text-xs" placeholder="Display name" value=""></div><button class="button-primary px-3 py-1.5 text-xs" disabled="">Invite</button></div></div>`;
const start = `<div class="compact-panel p-3" id="start"><div class="flex items-center gap-2"><button class="flex-1 py-2 text-xs font-semibold rounded-xl border bg-white/5 text-white/70">Mark Ready</button><button class="flex-1 py-2 text-xs font-semibold rounded-xl border bg-white/5 text-white/25" disabled="">⚔️ Start Raid (0)</button></div></div>`;
const chat = `<div class="compact-panel p-3 space-y-2" id="chat"><p class="text-[11px] font-semibold text-white">💬 Group Chat</p><div class="h-40 overflow-y-auto space-y-1.5 rounded-lg bg-black/20 p-2" style="height:120px"><div><span class="text-[10px] font-semibold">BustedCypher: </span><span class="text-[10px]">⚔️ started a run.</span></div></div><div class="flex gap-2"><input class="flex-1 rounded-lg border px-2.5 py-1.5 text-xs" placeholder="Message your guild…" value=""><button class="button-primary px-3 py-1.5 text-xs" disabled="">Send</button></div></div>`;
const footer = `<div class="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-2 text-[10px]" id="footer"><button class="rounded-lg border px-2 py-1 text-[10px] font-semibold text-rose-200">Disband group</button></div>`;
const readyCheck = leader => `<div class="compact-panel p-3 space-y-2 border border-amber-300/50 bg-amber-950/30" id="rc"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-amber-100">⚔️ Ready check: Ashmaw Normal</p><span class="text-xs tabular-nums text-amber-200" id="rc-timer">25s</span></div><p class="text-[11px] text-white/70">✅ Player 1</p><div class="flex flex-wrap gap-2"><button class="button-primary px-4 py-1.5 text-xs" id="rc-confirm" onclick="window.rcConfirmed=(window.rcConfirmed||0)+1">Confirm — I'm here!</button>${leader ? '<button class="rounded-xl border px-3 py-1.5 text-xs" id="rc-start">Start now (bench 1)</button>' : ''}</div></div>`;
const head = `<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2" id="raid-h2"><span>⚔️ Raid Dungeon</span></h2></div></div>`;
const LOBBY = (rc = '') => `<div class="panel p-3.5 space-y-3" id="raid">${head}${rc}<div class="flex flex-col gap-3 lg:flex-row lg:items-start" id="cols"><div class="flex-1 space-y-3 lg:max-w-[50%]" id="left">${boss}${leaderboard}${history}</div>${members}</div><div class="space-y-3" id="stack">${lend}${prep}${loadout}${invite}</div>${start}${chat}${footer}</div>`;

// The fight's result card as the port leaves it: GuildPanels tagged the
// arena's outcome box and its tone, RaidHud marked the arena. (Driving the
// port's arena pass needs the whole fight; only these tags matter here.)
const ARENA = (headline, tone) => `<div class="panel" id="fight" data-iw-guild="root"><div class="raid-battle-backdrop" id="arena" data-iw-raid-hud="1"><div id="outcome" data-iw-guild-role="outcome" data-iw-guild-tone="${tone}"><p id="headline">${headline}</p><p>Your loot: Cinderscale Gauntlets.</p><button data-iw-guild-role="outcome-close">Close</button></div></div></div>`;

const LEADERBOARDS = `<div class="panel" id="lb-panel"><h2>🏆 Leaderboards</h2><p>Total level</p></div><div class="panel" id="after"><h2>Something else</h2></div>`;

const BOARD = { leaderboard: { ashmaw: { normal: [{ sessionId: 's1', guildName: 'Royal Flush', elapsedMs: 110000 }, { sessionId: 's2', guildName: 'Omen', elapsedSec: 131.5, isPickup: true }], easy: [], hard: [] },
  thessaly: { normal: [{ sessionId: 's3', guildName: 'Test Guild', elapsedMs: 200000, isTestGuild: true }] } } };

const page = body => `<!doctype html><html lang="en" data-skin="fantasy" data-iw-page-hydrated="1"><head><meta charset="utf-8"><style>${GAME_CSS}</style></head><body><main data-skin="fantasy" style="max-width:1280px;margin:0 auto;padding:12px">${body}</main></body></html>`;

/* ── harness ──────────────────────────────────────────────────────────── */

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
const browser = await chromium.launch();
let boardRequests = 0;

async function open(body, { path = '/guild', width = 1280, port = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const tab = await context.newPage();
  tab.on('pageerror', err => check(`no page error (${path})`, false, err.message));
  await tab.route('http://iw.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/guild/raid/leaderboard') { boardRequests += 1; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(BOARD) }); }
    if (url.pathname.startsWith('/assets/')) {
      try { return route.fulfill({ body: await readFile(resolve(ROOT, url.pathname.slice(1))), contentType: MIME[extname(url.pathname)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: '' }); }
    }
    return route.fulfill({ contentType: 'text/html', body: page(body) });
  });
  await tab.goto(`http://iw.test${path}`);
  await tab.addScriptTag({ content: portJs });
  await tab.addScriptTag({ content: fantasyJs });
  if (port) await runPort(tab);
  return tab;
}

/** The port's own pass over the Raid Dungeon panel, as the live page runs it. */
const runPort = tab => tab.evaluate(() => {
  const root = document.getElementById('raid');
  if (root) window.Port.decorateGuildPanel({ root, heading: document.getElementById('raid-h2') });
});
const frames = (tab, n = 3) => tab.evaluate(n => new Promise(done => {
  const step = k => (k ? requestAnimationFrame(() => step(k - 1)) : done()); step(n);
}), n);
const startFantasy = async tab => { await tab.evaluate(() => window.Fantasy.start()); await frames(tab); await tab.waitForTimeout(60); await frames(tab); };
const attr = (tab, sel, name) => tab.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name]);

/* ── 1. lobby ─────────────────────────────────────────────────────────── */

let tab = await open(LOBBY());
check('fixture: the port tagged the lobby (root, boss card)', await attr(tab, '#raid', 'data-iw-guild') === 'root' && await attr(tab, '#boss', 'data-iw-guild-card') === 'boss');
check('fixture: the port, as delivered, does NOT know "Mark Ready"', await attr(tab, '#start', 'data-iw-guild-card') !== 'ready',
  await attr(tab, '#start', 'data-iw-guild-card'));
check('fixture: the port draws no lobby layout of its own', await attr(tab, '#raid', 'data-iw-guild-layout') === null);
const portHtml = await tab.evaluate(() => document.body.innerHTML);

await startFantasy(tab);
check('lobby: the Raid Dungeon panel is the lobby grid', await attr(tab, '#raid', 'data-iw-guild-layout') === 'lobby'
  && await tab.evaluate(() => getComputedStyle(document.getElementById('raid')).display) === 'grid');
const slots = await tab.evaluate(() => Object.fromEntries(['boss', 'leaderboard', 'history', 'members', 'lend', 'prep', 'loadout', 'invite', 'start', 'chat', 'footer']
  .map(id => [id, document.getElementById(id).getAttribute('data-iw-guild-slot')])));
const want = { boss: 'boss', leaderboard: 'leaderboard', history: 'history', members: 'members', lend: 'lend', prep: 'prep', loadout: 'loadout', invite: 'invite', start: 'start', chat: 'chat', footer: 'footer' };
check('lobby: every card takes its slot (Mark Ready -> start)', JSON.stringify(slots) === JSON.stringify(want), JSON.stringify(slots));
check('lobby: wrappers dissolve (display: contents), nothing moved', await tab.evaluate(() =>
  ['left', 'cols', 'stack'].every(id => getComputedStyle(document.getElementById(id)).display === 'contents')
  && document.getElementById('boss').parentElement.id === 'left'));
check('lobby: the Leaderboard card is hidden', await tab.evaluate(() => getComputedStyle(document.getElementById('leaderboard')).display) === 'none');
const cols = await tab.evaluate(() => ['lend', 'invite', 'members'].map(id => getComputedStyle(document.getElementById(id)).gridColumnStart));
check('lobby: two columns at 1280px (lend left, invite + members right)', cols[0] === '1' && cols[1] === '2' && cols[2] === '2', cols.join());

await tab.waitForFunction(() => /1:50\.00 · Royal Flush/.test(document.querySelector('.iw-guild-records')?.textContent || ''), null, { timeout: 3000 }).catch(() => {});
check('records: the Normal pill shows the board record', /🏆 1:50\.00 · Royal Flush/.test(await tab.evaluate(() => document.querySelector('.iw-guild-records')?.textContent || '')),
  await tab.evaluate(() => document.querySelector('.iw-guild-records')?.textContent || 'no records row'));
check('records: one board read for the lobby', boardRequests === 1, String(boardRequests));

check('boss card: art, stat chips, requirement tiles, tactics, loot bar', await tab.evaluate(() =>
  ['.iw-bc-art', '.iw-bc-stats', '.iw-bc-tiles', '.iw-bc-tactics', '.iw-bc-loot'].every(s => document.querySelector(`#boss > ${s}[data-iw-fantasy-owned]`))));
check('boss card: parsed source lines are hidden, their text kept', await tab.evaluate(() =>
  ['stats', 'req', 'tip', 'notice'].every(id => getComputedStyle(document.getElementById(id)).display === 'none')
  && /ATK 2,750/.test(document.getElementById('stats').textContent)));
check('boss card: the art loads from the extension assets', await tab.evaluate(() =>
  /raids\/lobby\/ashmaw-banner\.webp/.test(getComputedStyle(document.querySelector('.iw-bc-art')).getPropertyValue('--iw-bc-banner'))));

/* ── 5. quiescence (on the settled lobby) ─────────────────────────────── */

const quiet = await tab.evaluate(() => new Promise(done => {
  let n = 0; const o = new MutationObserver(r => { n += r.length; }); o.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { o.disconnect(); done(n); }, 400);
}));
check('quiescence: an idle lobby mutates nothing (no self-driving pass)', quiet === 0, `${quiet} mutation records`);
const control = await tab.evaluate(() => new Promise(done => {
  let n = 0; const o = new MutationObserver(r => { n += r.length; }); o.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.querySelector('#chat .h-40 span:last-child').firstChild.data = 'tick';
  setTimeout(() => { o.disconnect(); done(n); }, 100);
}));
check('quiescence control: the counter does count a game text tick', control > 0, String(control));

/* ── 7. stop() ────────────────────────────────────────────────────────── */

await tab.evaluate(() => { document.querySelector('#chat .h-40 span:last-child').firstChild.data = '⚔️ started a run.'; });
await tab.evaluate(() => window.Fantasy.stop());
check('stop: the port\'s page is restored byte for byte', await tab.evaluate(() => document.body.innerHTML) === portHtml);
check('stop: no Fantasy stylesheet remains', await tab.evaluate(() => document.querySelectorAll('style[data-iw-fantasy-style]').length) === 0);
await tab.context().close();

/* ── 2. ready check ───────────────────────────────────────────────────── */

tab = await open(LOBBY(readyCheck(false)));
await startFantasy(tab);
const popup = () => tab.evaluate(() => {
  const p = document.querySelector('.iw-rc-popup');
  return p && { title: p.querySelector('.iw-rc-title')?.textContent, timer: p.querySelector('.iw-rc-timer')?.textContent,
    layers: p.querySelectorAll('button > [data-iw-compact-layer]').length };
});
let pop = await popup();
check('ready check: a member gets the pop-up with the game\'s title and countdown', pop?.title === '⚔️ Ready check: Ashmaw Normal' && pop?.timer === '25s', JSON.stringify(pop));
check('ready check: the pop-up\'s buttons carry the compact plate layers', pop?.layers === 6, String(pop?.layers));
check('ready check: the fallback frame draws them without the port\'s plate', await tab.evaluate(() =>
  getComputedStyle(document.querySelector('.iw-rc-confirm')).borderTopStyle === 'solid'));
await tab.evaluate(() => { document.getElementById('rc-timer').firstChild.data = '24s'; });
await frames(tab);
check('ready check: a text-only tick reaches the pop-up', (await popup())?.timer === '24s');
await tab.click('.iw-rc-confirm');
await frames(tab);
check('ready check: Confirm presses the game\'s button once', await tab.evaluate(() => window.rcConfirmed) === 1);
check('ready check: and closes the pop-up', await popup() === null);
await tab.context().close();

tab = await open(LOBBY(readyCheck(true)));
await startFantasy(tab);
check('ready check: the leader never gets the pop-up', await popup() === null);
await tab.context().close();

/* ── 3. result banner ─────────────────────────────────────────────────── */

tab = await open(ARENA('🏆 Victory! Ashmaw, the Cinder Tyrant.', 'good'), { port: false });
await startFantasy(tab);
const banner = await tab.evaluate(() => {
  const card = document.getElementById('outcome'); const head = document.getElementById('headline');
  return { kind: card.getAttribute('data-iw-raid-result'), glyph: card.getAttribute('data-iw-raid-result-glyph'),
    word: head.getAttribute('data-iw-raid-result-word'), boss: head.getAttribute('data-iw-raid-result-boss'),
    fontSize: getComputedStyle(head).fontSize, before: getComputedStyle(head, '::before').content, text: head.textContent };
});
check('banner: the headline splits into glyph, word and boss', banner.kind === 'victory' && banner.glyph === '🏆' && banner.word === 'Victory'
  && banner.boss === 'Ashmaw, the Cinder Tyrant', JSON.stringify(banner));
check('banner: drawn by raid.css (word in ::before, game text kept at font-size 0)', banner.before === '"Victory"' && banner.fontSize === '0px'
  && banner.text === '🏆 Victory! Ashmaw, the Cinder Tyrant.', JSON.stringify(banner));
await tab.context().close();

tab = await open(ARENA('💀 Wipe. Ashmaw, the Cinder Tyrant.', 'bad'), { port: false });
await startFantasy(tab);
check('banner: a wipe keeps the game\'s tone', await attr(tab, '#outcome', 'data-iw-raid-result') === 'wipe');
await tab.context().close();

tab = await open(ARENA('…', 'good'), { port: false });
await startFantasy(tab);
check('banner negative control: an unparsed headline keeps the port\'s card', await attr(tab, '#outcome', 'data-iw-raid-result') === null);
await tab.context().close();

/* ── 4. raid leaderboard on /leaderboards ─────────────────────────────── */

tab = await open(LEADERBOARDS, { path: '/leaderboards', port: false });
await startFantasy(tab);
await tab.waitForFunction(() => document.querySelectorAll('.iw-raid-lb-row').length > 0, null, { timeout: 3000 }).catch(() => {});
const lb = await tab.evaluate(() => {
  const s = document.querySelector('section.iw-raid-lb');
  return s && { after: s.previousElementSibling?.id, rows: [...s.querySelectorAll('.iw-raid-lb-row')].map(r => r.textContent),
    tabs: s.querySelectorAll('.iw-raid-lb-tab').length, plated: [...s.querySelectorAll('.iw-raid-lb-tab')].every(t => t.querySelectorAll(':scope > [data-iw-compact-layer]').length === 3) };
});
check('leaderboard: the skin\'s panel sits right after the game\'s Leaderboards panel', lb?.after === 'lb-panel', JSON.stringify(lb));
check('leaderboard: ranked rows with times and tags', lb?.rows.length === 2 && /#1Royal Flush1:50\.00/.test(lb.rows[0]) && /pickup/.test(lb.rows[1]), JSON.stringify(lb?.rows));
check('leaderboard: boss + difficulty tabs, each plated', lb?.tabs === 5 && lb?.plated, JSON.stringify(lb));
await tab.click('.iw-raid-lb-tab >> text=Thessaly');
check('leaderboard: a boss tab switches the board', /Test Guild/.test(await tab.evaluate(() => document.querySelector('.iw-raid-lb-list')?.textContent || '')));
await tab.context().close();

tab = await open(LEADERBOARDS, { path: '/guild', port: false });
await startFantasy(tab);
check('leaderboard negative control: no panel off the Leaderboards route', await tab.evaluate(() => document.querySelectorAll('.iw-raid-lb').length) === 0);
await tab.context().close();

/* ── 6. stand-down ────────────────────────────────────────────────────── */

tab = await open(LOBBY(readyCheck(false)) + ARENA('🏆 Victory! Ashmaw, the Cinder Tyrant.', 'good'));
await startFantasy(tab);
check('stand-down setup: Fantasy is drawing the lobby, pop-up and banner', await attr(tab, '#raid', 'data-iw-guild-layout') === 'lobby'
  && !!(await popup()) && await attr(tab, '#outcome', 'data-iw-raid-result') === 'victory');
// The port is updated: it now writes its own slot on one card and ships the
// lobby + banner CSS. Fantasy must clear its own work and keep the port's.
await tab.evaluate(() => {
  document.getElementById('lend').setAttribute('data-iw-guild-slot', 'port-lend');
  const s = document.createElement('style');
  s.textContent = ':root [data-iw-guild-slot="boss"] { order: 1; } :root [data-iw-raid-hud] > [data-iw-guild-role="outcome"][data-iw-raid-result] { gap: 1px; }';
  document.head.append(s);
  document.getElementById('chat').append(document.createElement('i')); // any mutation runs a pass
});
await frames(tab);
const after = await tab.evaluate(() => ({
  fantasySlots: [...document.querySelectorAll('[data-iw-guild-slot]')].map(el => `${el.id}=${el.getAttribute('data-iw-guild-slot')}`),
  layout: document.getElementById('raid').getAttribute('data-iw-guild-layout'),
  owned: document.querySelectorAll('[data-iw-guild-lobby-owned], [data-iw-boss-card-owned]').length,
  result: document.getElementById('outcome').getAttribute('data-iw-raid-result'),
}));
check('stand-down: Fantasy\'s lobby marks, records, boss-card nodes and pop-up are gone', after.layout === null && after.owned === 0, JSON.stringify(after));
check('stand-down: the value the port wrote is left alone', JSON.stringify(after.fantasySlots) === '["lend=port-lend"]', JSON.stringify(after.fantasySlots));
check('stand-down: the banner stands down too', after.result === null, JSON.stringify(after));
await tab.context().close();

/* ── 8. My Guild / Raids tabs (Curtis, 2026-10-16) ────────────────────────
   The game's Guild route has two tabs; the lobby frame belongs to Raids
   only. Live, the My Guild tab's guild boss card got the rework and kept it
   after a swap. The tab row is modelled on the screenshot: two buttons in
   one row, the selected one in the game's ember fill. A click swaps the
   classes on the SAME nodes, as React does. */

const TABS = `<div class="flex gap-2" id="tabs"><button class="flex-1 bg-ember text-white" id="tab-guild" onclick="window.pickTab('guild')">🏰 My Guild</button><button class="flex-1 bg-white/5 text-white/70" id="tab-raids" onclick="window.pickTab('raids')">⚔️ Raids · 🟢 2 groups open</button></div>`;
const PICK = `<script>window.pickTab = t => { for (const [id, on] of [['tab-guild', t === 'guild'], ['tab-raids', t === 'raids']]) document.getElementById(id).className = 'flex-1 ' + (on ? 'bg-ember text-white' : 'bg-white/5 text-white/70'); };</script>`;
const frameState = () => tab.evaluate(() => ({
  layout: document.getElementById('raid').getAttribute('data-iw-guild-layout'),
  slots: document.querySelectorAll('[data-iw-guild-slot]').length,
  owned: document.querySelectorAll('[data-iw-boss-card-owned], .iw-guild-records').length,
  hidden: getComputedStyle(document.getElementById('stats')).display === 'none',
}));
const frameOff = s => s.layout === null && s.slots === 0 && s.owned === 0 && !s.hidden;

tab = await open(PICK + TABS + LOBBY());
await startFantasy(tab);
let fs = await frameState();
check('tabs: My Guild selected -> no lobby frame, boss card untouched', frameOff(fs), JSON.stringify(fs));
await tab.click('#tab-raids'); await frames(tab);
fs = await frameState();
check('tabs: Raids selected -> the lobby frame', fs.layout === 'lobby' && fs.slots > 0 && fs.owned > 0 && fs.hidden, JSON.stringify(fs));
await tab.click('#tab-guild'); await frames(tab);
fs = await frameState();
check('tabs: back to My Guild -> every frame mark and node is gone', frameOff(fs), JSON.stringify(fs));
await tab.click('#tab-raids'); await frames(tab);
check('tabs: and Raids again rebuilds it', (await frameState()).layout === 'lobby');
await tab.context().close();

// No readable tab pair: the content decides. The guild tab's boss card
// carries "Boss Progression"; the raid lobby's does not (sections 1-2).
const guildBoss = LOBBY().replace('<div class="flex gap-1.5 pt-1" id="difficulties">', '<p class="text-xs font-semibold">🐉 Boss Progression</p><div class="flex gap-1.5 pt-1" id="difficulties">');
tab = await open(guildBoss);
await startFantasy(tab);
fs = await frameState();
check('tabs fallback: a "Boss Progression" boss card gets no lobby frame', frameOff(fs), JSON.stringify(fs));
await tab.context().close();

// The live port tags the tabs itself (captures 2026-10-16: role "view-tab",
// state "selected" on the picked one; newer than the delivered code, so the
// emulation does not write them and the fixture does). No accent classes
// here, so only the port's tags can decide.
const PORT_TABS = `<div class="flex gap-2" data-iw-guild-role="view-tabs"><button class="flex-1 rounded-lg border" id="pt-guild" data-iw-guild-role="view-tab" data-iw-guild-state="selected" onclick="window.portTab('guild')">🏰 My Guild</button><button class="flex-1 rounded-lg border" id="pt-raids" data-iw-guild-role="view-tab" onclick="window.portTab('raids')">⚔️ Raids · 🟢 2 groups open</button></div>`;
const PORT_PICK = `<script>window.portTab = t => { for (const [id, on] of [['pt-guild', t === 'guild'], ['pt-raids', t === 'raids']]) { const b = document.getElementById(id);
  if (on) b.setAttribute('data-iw-guild-state', 'selected'); else b.removeAttribute('data-iw-guild-state');
  b.classList.toggle('font-semibold', on); } };</script>`;
tab = await open(PORT_PICK + PORT_TABS + LOBBY());
await startFantasy(tab);
fs = await frameState();
check('port tabs: the port\'s "selected" My Guild tab -> no lobby frame', frameOff(fs), JSON.stringify(fs));
await tab.click('#pt-raids'); await frames(tab);
fs = await frameState();
check('port tabs: the port\'s "selected" Raids tab -> the lobby frame', fs.layout === 'lobby' && fs.owned > 0, JSON.stringify(fs));
await tab.context().close();

// React reuses the card node: live, the Raids tab's boss card node became a
// My Guild card and the port re-tagged it, and the rework stayed on it. Here
// the port re-tags #boss as another kind, with no tab info on the page, so
// only the stale-node cleanup can clear it.
tab = await open(LOBBY());
await startFantasy(tab);
await tab.waitForFunction(() => document.querySelector('.iw-guild-records'), null, { timeout: 3000 }).catch(() => {});
check('reused node setup: the boss card carries the rework and records', (await frameState()).owned > 0);
await tab.evaluate(() => {
  document.getElementById('boss').setAttribute('data-iw-guild-card', 'pickup'); // the port's re-tag
  document.getElementById('name').append(' '); // React's content change: a pass runs
});
await frames(tab);
const stale = await tab.evaluate(() => ({
  card: document.querySelectorAll('[data-iw-boss-card]').length,
  owned: document.querySelectorAll('[data-iw-boss-card-owned], .iw-guild-records').length,
  hidden: [...document.querySelectorAll('[data-iw-boss-card-src]')].length,
}));
check('reused node: a card the port no longer tags "boss" loses every Fantasy mark and node', stale.card === 0 && stale.owned === 0 && stale.hidden === 0, JSON.stringify(stale));
await tab.context().close();

// The same re-tag arriving with a STRUCTURAL change (a full pass, not a text one).
tab = await open(LOBBY());
await startFantasy(tab);
await tab.waitForFunction(() => document.querySelector('.iw-guild-records'), null, { timeout: 3000 }).catch(() => {});
await tab.evaluate(() => {
  document.getElementById('boss').setAttribute('data-iw-guild-card', 'pickup');
  document.getElementById('boss').append(document.createElement('div'));
});
await frames(tab);
const staleFull = await tab.evaluate(() => document.querySelectorAll('[data-iw-boss-card], [data-iw-boss-card-owned], .iw-guild-records, [data-iw-boss-card-src]').length);
check('reused node (full pass): every Fantasy mark and node is gone', staleFull === 0, String(staleFull));
await tab.context().close();

/* ── 1b. phone width ──────────────────────────────────────────────────── */

tab = await open(LOBBY(), { width: 390 });
await startFantasy(tab);
check('phone: the lobby is one column', await tab.evaluate(() => ['lend', 'members'].every(id => getComputedStyle(document.getElementById(id)).gridColumnStart === '1')));
check('phone: no horizontal overflow from the lobby', await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await tab.context().close();

await browser.close();
if (failures) {
  console.error(`fantasy raid: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('fantasy raid: lobby, ready check, banner, leaderboard, quiescence, stand-down, teardown PASS');
