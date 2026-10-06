/**
 * The guild's own page (2026-10-05 snapshots, v0.2.0+2026-10-05.16): a leader
 * in a guild, and a player with no guild. GuildPanels was built from a guest
 * lobby, and on these pages:
 *
 *   1. "Invite Player", "Invite a Raid Guest" and "Create a Guild" have an
 *      input, so they were classified as chat. Chat takes the card's first
 *      `> p` as its title, and in the invite cards that is the HELP sentence
 *      (the real title sits in a head row with the "7/12" count), so the note
 *      rendered as a 13px small-caps heading.
 *   2. Every button in a member row was a "member-name". A leader's rows also
 *      carry the lend-skill picker and a "✕" kick: the kick got the name's
 *      type, the picker none of the picker's state styling.
 *   3. The leader's ready card has TWO buttons ("✓ Ready" + "⚔️ Start Raid
 *      (7)"), so it fell to 'generic' and lost the ready state entirely.
 *      Rule 5: ready / not ready / Start must still paint three ways.
 *   4. Pickup Raid Group and the All Guilds / Find a Guild directory were
 *      undecorated: game pill buttons, Apply in the game's emerald on a plate.
 *   5. The Combat chip is repainted dim; an under-level (rose) chip must keep
 *      reading differently from a met one.
 *   6. Kill switch removes every mark.
 *
 * REAL BROWSER (Playwright), the built bundle, game skin "sans" (its
 * `.button-primary` rule is the one the guild sheet must beat). Markup is the
 * snapshots' own, whitespace-free (docs/traps/test-harness.md).
 *
 * Negative controls, each verified by reverting one change and rebuilding:
 *   - move the `form` test in cardKind() below the input → 'chat' test: the
 *     invite and create checks fail (kind chat, the help sentence is the title);
 *   - map every roster button to 'member-name' again: the kick / picker
 *     checks fail;
 *   - drop the `:has([data-iw-guild-role="start"])` rule in guild.css: the
 *     not-ready toggle and Start paint the same;
 *   - drop `tone(el)` on the chip: the rose chip matches the met one.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0}
button{font:inherit;color:inherit;background:none}input{font:inherit}
.panel{border:1px solid #333;padding:14px}.flex{display:flex}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1 1 0%}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:8px}
.relative{position:relative}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.rounded-full{border-radius:9999px}.h-1\\.5{height:6px}.w-1\\.5{width:6px}.border{border-width:1px}
.bg-white\\/5{background-color:rgb(255 255 255/.05)}.text-white\\/25{color:rgb(255 255 255/.25)}.text-white\\/40{color:rgb(255 255 255/.4)}
.border-emerald-400\\/40{border-color:rgb(52 211 153/.4)}.bg-emerald-400\\/10{background-color:rgb(52 211 153/.1)}.bg-emerald-400\\/15{background-color:rgb(52 211 153/.15)}.text-emerald-300{color:rgb(110 231 183)}.text-emerald-200{color:rgb(167 243 208)}.bg-emerald-400{background-color:rgb(52 211 153)}
.border-sky-400\\/30{border-color:rgb(56 189 248/.3)}.bg-sky-400\\/10{background-color:rgb(56 189 248/.1)}.text-sky-200{color:rgb(186 230 253)}
.border-rose-400\\/40{border-color:rgb(251 113 133/.4)}.text-rose-300{color:rgb(253 164 175)}.border-white\\/15{border-color:rgb(255 255 255/.15)}
.button-primary{border-radius:1rem;background:#ff8a3d;color:#091119}
:root:is([data-skin="experimental"],[data-skin="sans"]) .button-primary{background:#dfb949!important;color:#111!important}`;

const ROUTES = ['Game', 'Market', 'Leaderboards', 'Village', 'Guild', 'Dungeon'];
const nav = path => `<div class="panel flex flex-wrap gap-2 p-2">${ROUTES.map(r => {
  const href = r === 'Game' ? '/' : r === 'Village' ? '/housing' : `/${r.toLowerCase()}`;
  return `<a class="rounded-xl px-3 py-2 text-xs ${href === path ? 'bg-ember text-ink' : 'border border-white/10 bg-white/5'}" href="${href}">${r}</a>`;
}).join('')}</div>`;

const head = sub => `<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2"><span>⚔️ Raid Dungeon</span><span class="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">Beta</span></h2><p class="mt-0.5 text-[10px] text-white/45">${sub}</p></div>${sub.startsWith('woof') ? '<button class="text-[10px] text-white/30 hover:text-white/60 transition" id="leave">Leave Guild</button>' : ''}</div>`;

const pickup = `<div class="compact-panel flex flex-wrap items-center justify-between gap-2 p-3" id="pickup"><div class="min-w-0"><p class="text-[11px] font-semibold text-white">⚔️ Pickup Raid Group</p><p class="text-[10px] text-white/40">Start a temporary raid group, invite players from any guild, and lead your own attempts.</p></div><button class="button-primary shrink-0 px-3 py-1.5 text-xs" id="pickup-cta">Start a pickup group</button></div>`;

const member = (n, { leader, chip = 'border-white/15 text-white/40' } = {}) => `<div class="rounded-lg bg-white/5 p-2.5 space-y-2"><div class="flex items-center justify-between gap-2"><div class="flex min-w-0 items-center gap-1.5"><span class="h-1.5 w-1.5 shrink-0 rounded-full ${leader ? 'bg-emerald-400' : 'bg-white/20'}"></span><button type="button" class="truncate text-sm font-medium hover:underline underline-offset-2 ${leader ? 'text-amber-200' : 'text-white'}" title="View Player ${n}'s profile" id="name-${n}">Player ${n}${leader ? ' 👑 (you)' : ''}</button><span class="shrink-0 text-[10px] text-amber-200/70" title="Guild Points earned in this guild (1 per day played)">⭐ 0</span></div><div class="flex shrink-0 items-center gap-1.5"><span class="rounded border px-1.5 py-0.5 text-[10px] font-medium ${chip}" title="Combat skill level — needs 60+ for this raid" id="chip-${n}">Combat ${chip.includes('rose') ? 52 : 70}</span>${leader ? '' : `<button class="text-xs text-white/25 transition hover:text-rose-300/80" title="Kick Player ${n}" id="kick-${n}">✕</button>`}</div></div><div class="flex flex-wrap items-center justify-between gap-2"><div class="min-w-[140px] flex-1"><div class="relative"><button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1.5 text-left text-sky-200 transition hover:bg-sky-400/15 disabled:opacity-50" id="picker-${n}"><span class="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><span class="shrink-0">⛏️</span><span class="truncate">War Cry</span></span><span class="shrink-0 text-[10px] text-sky-300/60 transition-transform ">▾</span></button></div></div><span class="flex shrink-0 items-center gap-1"><span class="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">READY</span></span></div></div>`;

const members = `<div class="flex-1 compact-panel p-3 space-y-2" id="members"><div class="flex items-center justify-between"><p class="text-xs font-semibold text-white">Members</p><p class="text-[11px] text-white/40" title="A raid takes at most 8 players">0/8 ready</p></div><div class="space-y-2">${member(1, { leader: true })}${member(2)}${member(3, { chip: 'border-rose-400/40 text-rose-300' })}</div></div>`;

const invite = (id, title, count) => `<div class="compact-panel p-3 space-y-2" id="${id}"><div class="flex items-center justify-between"><p class="text-[11px] font-semibold text-white" id="${id}-title">${title}</p><span class="text-[10px] font-semibold text-white/40">${count}</span></div><p class="text-[10px] text-white/40" id="${id}-note">Player must be guildless. They'll get an in-game notification.</p><div class="flex gap-2"><div class="relative flex-1"><input class="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white" placeholder="Display name" autocomplete="off" value=""></div><button class="button-primary px-3 py-1.5 text-xs" disabled="">Invite</button></div></div>`;

const ready = (id, isReady) => `<div class="compact-panel p-3" id="${id}"><div class="flex items-center gap-2"><button class="flex-1 py-2 text-xs font-semibold rounded-xl border transition ${isReady ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300' : 'border-white/15 bg-white/5 text-white'}" id="${id}-toggle">${isReady ? '✓ Ready' : 'Ready up'}</button><button class="flex-1 py-2 text-xs font-semibold rounded-xl border transition button-primary" title="Start raid with 7 members" id="${id}-start">⚔️ Start Raid (7)</button></div><p class="mt-2 text-[10px] text-white/35 text-center">Starting a raid doesn't interrupt anyone's current activity.</p></div>`;

const allGuilds = `<div class="compact-panel p-3 space-y-2" id="all-guilds"><button type="button" class="flex w-full items-center justify-between text-left" id="all-toggle"><p class="text-[11px] font-semibold text-white">🏰 All Guilds</p><span class="text-[10px] text-white/40">show ▾</span></button></div>`;

const IN_GUILD = `<div class="panel p-3.5 space-y-3" id="raid">${head('woof • 7/12 members • <span class="text-amber-200/80" title="Guild Points: every member earns 1 per day they play while in this guild.">⭐ 1 guild points</span>')}${pickup}<div class="flex flex-col gap-3 lg:flex-row">${members}</div>${invite('invite', 'Invite Player', '7/12')}${invite('guest', '🤝 Invite a Raid Guest', '0/7')}${ready('ready-on', true)}${ready('ready-off', false)}${allGuilds}</div>`;

const row = (n, name, applyCls = 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200') => `<div class="rounded-md "><div class="flex items-center gap-2 px-1.5 py-1"><button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] hover:opacity-90"><span class="w-4 shrink-0 text-white/40">▸</span><span class="shrink-0 tabular-nums text-white/40">#${n}</span><span class="truncate font-medium text-white/85">${name}</span></button><span class="shrink-0 text-[10px] tabular-nums text-amber-200/80" title="Guild Points">⭐ ${9 - n}</span><span class="shrink-0 text-[10px] tabular-nums text-white/50">${n}/12</span><button type="button" class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${applyCls}" id="apply-${n}">Apply</button></div></div>`;

const NO_GUILD = `<div class="panel p-3.5 space-y-3" id="raid">${head('Form a guild with up to 12 players to attempt raid bosses (8 per raid)')}${pickup}<div class="compact-panel p-3 space-y-2" id="create"><p class="text-[11px] font-semibold text-white" id="create-title">Create a Guild</p><div class="flex gap-2"><input class="flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white" placeholder="Guild name (2–30 chars)" maxlength="30" value=""><button class="button-primary px-3 py-1.5 text-xs" disabled="">Create</button></div></div><div class="compact-panel p-3 space-y-2" id="find"><button type="button" class="flex w-full items-center justify-between text-left" id="find-toggle"><p class="text-[11px] font-semibold text-white">🏰 <!-- -->Find a Guild</p></button><p class="text-[10px] text-white/40">Ranked by Guild Points.</p><div class="max-h-96 space-y-1 overflow-y-auto pr-1">${row(1, 'Royal Flush')}${row(2, 'Omen')}</div></div></div>`;

const page = (path, body) => `<!doctype html><html lang="en" data-skin="sans" data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>
<main class="overflow-x-hidden" data-skin="sans"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto">
<header class="panel"><div><p>IdleWorlds</p><h1><button class="hover:underline">Player</button></h1></div></header>
${nav(path)}<section class="grid gap-3">${body}</section></div></main></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open(body, ready) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(() => {
    const listeners = [], data = {};
    window.chrome = { runtime: { id: 'guild-pages-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: { get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }), set: async bag => Object.assign(data, bag), remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
    window.toggleSkin = enabled => listeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: enabled } }, 'local'));
  });
  const html = page('/guild', body);
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/guild') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/guild`, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForFunction(sel => document.querySelector(sel)?.hasAttribute('data-iw-guild-card'), ready, { timeout: 8000 }).catch(() => {});
  await tab.waitForTimeout(400);
  return tab;
}

const ev = (tab, fn, arg) => tab.evaluate(fn, arg);
const kind = (tab, sel) => ev(tab, s => document.querySelector(s)?.getAttribute('data-iw-guild-card') ?? null, sel);
const roleOf = (tab, sel) => ev(tab, s => document.querySelector(s)?.getAttribute('data-iw-guild-role') ?? null, sel);
const style = (tab, sel, ...props) => ev(tab, ([s, p]) => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el); return Object.fromEntries(p.map(k => [k, c[k]])); }, [sel, props]);
const marks = tab => ev(tab, () => document.querySelectorAll('[data-iw-guild],[data-iw-guild-card],[data-iw-guild-role],[data-iw-guild-tone],[data-iw-guild-state]').length);
const rgb = value => (String(value).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

/* -- a leader in a guild ------------------------------------------------- */
console.log('\n/guild, a leader in a guild (game skin: sans)');
const lead = await open(IN_GUILD, '#all-guilds');
for (const id of ['invite', 'guest']) {
  check(`#${id} is a form card, not chat`, await kind(lead, `#${id}`) === 'form', await kind(lead, `#${id}`));
  check(`#${id}'s title is its head-row title, the help sentence a note`,
    await roleOf(lead, `#${id}-title`) === 'card-title' && await roleOf(lead, `#${id}-note`) === 'note',
    `${await roleOf(lead, `#${id}-title`)} / ${await roleOf(lead, `#${id}-note`)}`);
}
const titleFont = await style(lead, '#invite-title', 'fontSize');
const noteFont = await style(lead, '#invite-note', 'fontSize');
check('the invite note is not set as a heading', parseFloat(noteFont.fontSize) < parseFloat(titleFont.fontSize), `${noteFont.fontSize} vs ${titleFont.fontSize}`);

check('member names, pickers and kicks are three roles',
  await roleOf(lead, '#name-2') === 'member-name' && await roleOf(lead, '#picker-2') === 'picker' && await roleOf(lead, '#kick-2') === 'kick',
  `${await roleOf(lead, '#name-2')} / ${await roleOf(lead, '#picker-2')} / ${await roleOf(lead, '#kick-2')}`);
const kick = await style(lead, '#kick-2', 'backgroundColor', 'backgroundImage', 'borderTopWidth');
check('the kick control wears no plate', kick.backgroundColor === 'rgba(0, 0, 0, 0)' && kick.backgroundImage === 'none' && kick.borderTopWidth === '0px', JSON.stringify(kick));
const met = await style(lead, '#chip-2', 'color'), under = await style(lead, '#chip-3', 'color');
check('an under-level (rose) Combat chip still reads differently', met.color !== under.color && rgb(under.color)[0] > rgb(under.color)[1], `${met.color} vs ${under.color}`);

check('both ready cards are ready cards', await kind(lead, '#ready-on') === 'ready' && await kind(lead, '#ready-off') === 'ready',
  `${await kind(lead, '#ready-on')} / ${await kind(lead, '#ready-off')}`);
check('Start Raid is its own role', await roleOf(lead, '#ready-on-start') === 'start', await roleOf(lead, '#ready-on-start'));
const on = await style(lead, '#ready-on-toggle', 'backgroundImage', 'borderTopColor');
const offT = await style(lead, '#ready-off-toggle', 'backgroundImage', 'borderTopColor');
const start = await style(lead, '#ready-off-start', 'backgroundImage', 'borderTopColor');
// Edges, not backgrounds: without the step-down rule a not-ready toggle and
// Start differ only by a 58% vs 62% colour mix, which a string compare calls
// "different" while the eye sees two identical ember buttons.
check('ready, not ready and Start paint three ways',
  new Set([on.borderTopColor, offT.borderTopColor, start.borderTopColor]).size === 3, JSON.stringify([on, offT, start]));
check('the ready toggle keeps its green', rgb(on.borderTopColor)[1] > rgb(on.borderTopColor)[0], on.borderTopColor);
check('Start wears the ember CTA over the game\'s sans .button-primary', /gradient/.test(start.backgroundImage) && !/223, 185, 73/.test(start.backgroundImage), start.backgroundImage);

check('Pickup Raid Group is decorated', await kind(lead, '#pickup') === 'pickup' && await roleOf(lead, '#pickup-cta') === 'cta', await kind(lead, '#pickup'));
check('All Guilds is a directory with a plate-less disclosure', await kind(lead, '#all-guilds') === 'directory' && await roleOf(lead, '#all-toggle') === 'disclosure' &&
  (await style(lead, '#all-toggle', 'backgroundImage')).backgroundImage === 'none', await kind(lead, '#all-guilds'));
check('the subtitle\'s guild points are marked', await ev(lead, () => !!document.querySelector('[data-iw-guild-role="subtitle"] [data-iw-guild-role="points"]')));
check('"Leave Guild" is a head link in the bad tone', await roleOf(lead, '#leave') === 'head-link' && await ev(lead, () => document.querySelector('#leave').dataset.iwGuildTone) === 'bad');
check('no card on the page is a skill card', await ev(lead, () => !document.querySelector('#raid .fs-skill-panel, #raid [data-iw-skill-role]')));

console.log('\nkill switch');
const before = await marks(lead);
await ev(lead, () => window.toggleSkin(false));
await lead.waitForTimeout(400);
check('disable removes every data-iw-guild* mark', await marks(lead) === 0, `${await marks(lead)} left`);
await ev(lead, () => window.toggleSkin(true));
await lead.waitForFunction(() => document.querySelector('#all-guilds')?.hasAttribute('data-iw-guild-card'), null, { timeout: 6000 }).catch(() => {});
check('re-enable restores them', await marks(lead) === before, `${await marks(lead)} vs ${before}`);
await lead.close();

/* -- no guild ------------------------------------------------------------ */
console.log('\n/guild, no guild');
const none = await open(NO_GUILD, '#find');
check('Create a Guild is a form card with its own title', await kind(none, '#create') === 'form' && await roleOf(none, '#create-title') === 'card-title', await kind(none, '#create'));
check('Find a Guild is a directory', await kind(none, '#find') === 'directory', await kind(none, '#find'));
check('each guild row is marked, with name / points / capacity / apply',
  await ev(none, () => {
    const rows = [...document.querySelectorAll('[data-iw-guild-role="guild-row"]')];
    return rows.length === 2 && rows.every(r => ['guild-name', 'points', 'capacity', 'apply'].every(x => r.querySelector(`[data-iw-guild-role="${x}"]`)));
  }));
const apply = await style(none, '#apply-1', 'color', 'borderTopColor');
check('Apply keeps the game\'s emerald as its tone', await ev(none, () => document.querySelector('#apply-1').dataset.iwGuildTone) === 'good' &&
  rgb(apply.color)[1] > rgb(apply.color)[0], JSON.stringify(apply));
await none.close();

await browser.close();
check('no page errors', !errors.length, errors.join(' | '));
if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall guild-page checks passed');
