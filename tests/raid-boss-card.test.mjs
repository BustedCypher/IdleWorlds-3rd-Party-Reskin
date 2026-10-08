/**
 * The raid lobby's boss card (RaidBossCard.js, guild.css "Boss card";
 * Curtis, 2026-10-08).
 *
 *   1. Hero: the selected boss's banner + medallion behind the name, lore and
 *      stat chips; every boss key resolves its own art, which loads.
 *   2. The three source lines parse into chips / tiles / tactics, and are
 *      hidden only then. Negative control: an unparseable requirement line
 *      stays the game's and visible, and gets no tiles.
 *   3. Rule 5: Hard's rose ATK/HP and Practice's emerald carry onto the chips.
 *   4. The weekly-loot notice becomes a status bar and follows a text-only
 *      countdown tick. Negative control: a lock notice stays the game's.
 *   5. A boss switch (text + class change) rebuilds the parts for that boss.
 *   6. Phones: no horizontal overflow; the medallion stays inside the hero.
 *   7. Kill switch removes every owned node and attribute; the game's lines
 *      come back.
 *
 * Markup follows the game's own template (chunk 8577: the stat line's two
 * toned spans, the requirement and tip strings, the claimed-loot notice).
 * REAL BROWSER (Playwright), the built bundle. Screenshots: tmp/raid-boss-card/.
 */

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'tmp/raid-boss-card');
await mkdir(OUT, { recursive: true });
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#000;color:#fff;font-family:sans-serif}
button{font:inherit;color:inherit;background:none}p{margin:0}
.panel{border:1px solid #333;padding:14px}.compact-panel{border:1px solid #333;border-radius:8px;padding:12px}
.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1 1 0%}.block{display:block}
.gap-1\\.5{gap:6px}.gap-3{gap:12px}.pb-1{padding-bottom:4px}.pt-1{padding-top:4px}
.space-y-1\\.5>:not([hidden])~:not([hidden]){margin-top:6px}.space-y-3>:not([hidden])~:not([hidden]){margin-top:12px}
.text-xs{font-size:12px}.text-sm{font-size:14px}.italic{font-style:italic}.font-semibold{font-weight:600}
.text-rose-300{color:#fda4af}.text-emerald-300{color:#6ee7b7}.text-amber-200\\/80{color:rgb(253 230 138/.8)}.text-sky-200\\/80{color:rgb(186 230 253/.8)}
.bg-ember{background:#ff8a3d}.border-ember{border-color:#ff8a3d}`;

const BOSSES = {
  ashmaw: { name: 'Ashmaw, the Cinder Tyrant', glyph: '🔥', el: 'fire', dot: 'burning', combat: 50, resist: 60 },
  thessaly: { name: 'Thessaly, the Plague Warden', glyph: '☠️', el: 'poison', dot: 'poisoned', combat: 55, resist: 65 },
  morwenna: { name: 'Morwenna, the Hollow Queen', glyph: '🌑', el: 'shadow', dot: 'cursed', combat: 60, resist: 70 },
  grimjaw: { name: 'Grimjaw, the Frost Tyrant', glyph: '❄️', el: 'frost', dot: 'chilled', combat: 65, resist: 75 },
  skarth: { name: 'Skarth, the Rime Wyrm', glyph: '❄️', el: 'frost', dot: 'frostbite', combat: 70, resist: 80 },
};
const TIP = 'Tip: bring a tank (Combat lend → Challenge) so the big single hits land on them, plus healers and Cleanse. Fortify (Smithing) makes tanking much safer.';

const LOCK = '<div class="rounded-lg border border-amber-300/30 bg-amber-950/30 px-2.5 py-1.5 text-[11px] leading-5 text-amber-100" id="notice">🔒 Requires everyone in the raid group to have cleared <span class="font-semibold">Ashmaw Normal</span> (or Hard).<span class="block">Have not cleared it yet: <span class="font-semibold">Oat</span></span></div>';

function bossCard({ key = 'ashmaw', diff = 'normal', req, notice } = {}) {
  const b = BOSSES[key];
  const c = diff === 'hard' ? 'text-rose-300 font-semibold' : diff === 'easy' ? 'text-emerald-300 font-semibold' : '';
  const tabs = Object.entries(BOSSES).map(([k, v]) => `<button type="button" title="${v.name}" class="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition ${k === key ? 'bg-ember text-ink' : 'bg-white/5 text-white/50 hover:bg-white/10'}">${v.name.split(',')[0]}${k === 'ashmaw' ? '<span class="ml-1" title="You\'ve claimed this boss\'s loot this week">✓</span>' : ''}</button>`).join('');
  const pill = (k, l) => `<button type="button" class="flex-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition ${k === diff ? 'border-ember bg-ember/20 text-ember' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'}">${l}</button>`;
  const reqText = req ?? `Requires Combat ${b.combat}+ to join. Wants ${b.resist} ${b.el} resist total to mitigate most ${b.el} damage — a level 70 Jewelcrafting lend covers 26 of that, bring the rest on gear.`;
  return `<div class="compact-panel p-3 space-y-1.5" id="boss"><div class="flex flex-wrap gap-1.5 pb-1">${tabs}</div>`
    + `<p class="text-sm font-semibold text-white" id="name">🐉 ${b.name}</p>`
    + `<p class="text-xs italic text-white/45" id="lore">A molten-scaled wyrm chained beneath the old forge-cities, woken by eight centuries of banked coal finally burning through.</p>`
    + `<p class="text-xs text-white/50" id="stats">ATK <span class="${c}">2,750</span> • DEF 450 • HP <span class="${c}">21,000</span> • ${b.glyph} ${b.el}-based abilities (single-target, AOE, curse, ${b.dot})</p>`
    + `<p class="text-xs text-amber-200/80" id="req">${reqText}</p>`
    + `<p class="text-xs text-sky-200/80" id="tip">${TIP}</p>`
    + `<div class="flex gap-1.5 pt-1" id="difficulties">${pill('easy', '🧪 Practice · no loot')}${pill('normal', 'Normal')}${pill('hard', '🔥 Hard')}</div>`
    + (notice ?? `<div class="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[11px] leading-5 text-amber-100" id="notice">✅ <span class="font-semibold">You've claimed ${b.name.split(',')[0]}'s loot this week.</span> You can keep raiding it for leaderboard times, but it won't drop loot for you again until the weekly reset in 3d 18h.<span class="block text-[10px] opacity-60">Weekly reset: Monday 00:00 Eastern, same time for everyone.</span></div>`) + '</div>';
}

const members = `<div class="compact-panel p-3 space-y-2" id="members"><div class="flex"><p class="text-xs font-semibold">Members</p><p>2/12</p></div></div>`;
const LOBBY = card => `<div class="panel p-3.5 space-y-3" id="raid"><div><h2 class="text-sm font-semibold">⚔️ Raid Dungeon</h2></div><div class="flex flex-col gap-3 lg:flex-row lg:items-start" id="cols"><div class="flex-1 space-y-3" id="left">${card}</div>${members}</div></div>`;

const page = body => `<!doctype html><html lang="en" data-skin="sans" data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>
<main data-skin="sans"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto">
<header class="panel"><div><p>IdleWorlds</p></div></header>
<div class="panel flex flex-wrap gap-1.5"><a href="/">Game</a><a class="bg-ember" href="/guild">Guild</a></div>
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
const missing = [];

async function open(card, width = 1280) {
  const tab = await browser.newPage({ viewport: { width, height: 900 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(() => {
    const listeners = [], data = {};
    window.chrome = { runtime: { id: 'raid-boss-card-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: { get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }), set: async bag => Object.assign(data, bag), remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
    window.toggleSkin = enabled => listeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: enabled } }, 'local'));
  });
  const html = page(LOBBY(card));
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/guild') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/api/guild/raid/leaderboard') return route.fulfill({ contentType: 'application/json', body: '{"leaderboard":{}}' });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { if (/raids\/(lobby|ui-kit)/.test(url.pathname)) missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/guild`, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForTimeout(900);
  return tab;
}

const state = tab => tab.evaluate(() => {
  const card = document.getElementById('boss');
  const vis = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
  const art = card.querySelector('.iw-bc-art');
  const r = el => el?.getBoundingClientRect();
  return {
    key: card.getAttribute('data-iw-boss-card'),
    artBoss: art?.dataset.iwBcBoss,
    banner: art ? getComputedStyle(art).backgroundImage : '',
    face: getComputedStyle(card.querySelector('.iw-bc-portrait') || card).backgroundImage,
    stats: [...card.querySelectorAll('.iw-bc-stat')].map(s => `${s.firstChild.textContent} ${s.lastChild.textContent}${s.lastChild.dataset.iwBcTone ? `:${s.lastChild.dataset.iwBcTone}` : ''}`).join(' | '),
    element: card.querySelector('.iw-bc-element')?.textContent,
    tiles: [...card.querySelectorAll('.iw-bc-tile')].map(t => t.textContent).join(' | '),
    tactics: card.querySelector('.iw-bc-tactics')?.textContent,
    loot: card.querySelector('.iw-bc-loot')?.textContent,
    lootTone: card.querySelector('.iw-bc-loot')?.dataset.iwBcTone,
    noticeVisible: vis('notice'),
    srcVisible: { stats: vis('stats'), req: vis('req'), tip: vis('tip') },
    nameInArt: (() => { const a = r(art), n = r(document.getElementById('name')), s = r(card.querySelector('.iw-bc-stats')); return !!a && n.top >= a.top - 1 && s.bottom <= a.bottom + 1; })(),
    portraitInArt: (() => { const a = r(art), p = r(card.querySelector('.iw-bc-portrait')); return !!a && p.left >= a.left && p.right <= a.right && p.top >= a.top && p.bottom <= a.bottom; })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    owned: document.querySelectorAll('[data-iw-boss-card-owned]').length,
  };
});

/* -- desktop ------------------------------------------------------------ */
console.log('\nboss card at 1280px (Ashmaw, Normal)');
const tab = await open(bossCard());
let s = await state(tab);
check('card keyed on the selected boss', s.key === 'ashmaw' && s.artBoss === 'ashmaw', `${s.key}/${s.artBoss}`);
check('hero paints the boss banner and medallion', /ashmaw-banner\.webp/.test(s.banner) && /ashmaw-portrait\.webp/.test(s.face), `${s.banner} / ${s.face}`);
check('stat chips: ATK, DEF, HP (no tone on Normal)', s.stats === 'ATK 2,750 | DEF 450 | HP 21,000', s.stats);
check('element chip lists the abilities', s.element === '🔥 Firesingle-target · AOE · curse · burning', s.element);
check('tiles: the requirement, then the resist as a recommendation (no lend)', s.tiles === 'To joinCombat 50+ | 🔥Recommended60 Fire resistmitigates most fire damage', s.tiles);
check('the resist tile is styled as advice', await tab.evaluate(() => document.querySelectorAll('#boss .iw-bc-tile')[1]?.dataset.iwBcKind === 'advice'));
check('loadout + tip for Ashmaw', s.tactics === 'Ashmaw: Recommended Team Loadout1Tank2Healers2Support⚔3DPSTip: Watch out for Cinderstorm: only Ward mitigates it, boosting resistances raid-wide. Veil helps dodge Claw Rake.', s.tactics);
check('loot notice becomes a status bar', s.loot === '✅ Loot claimed this weekRepeat runs count for leaderboard times only, no loot.Loot again in3d 18hMonday 00:00 Eastern, same for everyone' && !s.noticeVisible, s.loot);
check('the bar keeps the game notice tone', s.lootTone === 'warn', s.lootTone);
check('parsed source lines are hidden', !s.srcVisible.stats && !s.srcVisible.req && !s.srcVisible.tip, JSON.stringify(s.srcVisible));
check('name..chips sit inside the hero art', s.nameInArt);
check('medallion inside the hero', s.portraitInArt);
const titles = await tab.evaluate(() => [...document.querySelectorAll('#boss .iw-bc-tile, #boss .iw-bc-tactics, #boss .iw-bc-stats')].every(el => el.title.length > 20));
check('every owned part carries its source sentence as a title', titles);
await (await tab.$('#boss')).screenshot({ path: resolve(OUT, 'ashmaw-1280.png') });

// Quiet: a second pass with nothing changed writes nothing.
const quiet = await tab.evaluate(async () => {
  let n = 0;
  const mo = new MutationObserver(list => { n += list.length; });
  mo.observe(document.getElementById('boss'), { subtree: true, childList: true, attributes: true, characterData: true });
  document.getElementById('members').classList.add('x-bump');
  await new Promise(r => setTimeout(r, 400));
  mo.disconnect();
  return n;
});
check('an unrelated flush leaves the card untouched', quiet === 0, `${quiet} mutations`);

// The countdown is a text tick: no dom-flush, only iw:text-flush.
await tab.evaluate(() => {
  const n = document.getElementById('notice');
  const node = [...n.childNodes].find(c => c.nodeType === 3 && /3d 18h/.test(c.data));
  node.data = node.data.replace('3d 18h', '3d 17h');
});
await tab.waitForTimeout(500);
s = await state(tab);
check('a text-only countdown tick reaches the bar', /Loot again in3d 17h/.test(s.loot || ''), s.loot);

/* -- boss switch: the game's own re-render ------------------------------ */
console.log('\nswitching to Grimjaw on Hard');
await tab.evaluate(html => {
  const old = document.getElementById('boss');
  const t = document.createElement('template');
  t.innerHTML = html;
  const fresh = t.content.firstElementChild;
  // React keeps the card element and swaps its children.
  old.replaceChildren(...fresh.childNodes);
}, bossCard({ key: 'grimjaw', diff: 'hard' }));
await tab.waitForTimeout(500);
s = await state(tab);
check('card re-keyed to Grimjaw', s.key === 'grimjaw' && s.artBoss === 'grimjaw' && /grimjaw-banner/.test(s.banner), `${s.key}/${s.artBoss}`);
check('Hard tone carried onto ATK and HP only', s.stats === 'ATK 2,750:hard | DEF 450 | HP 21,000:hard', s.stats);
check('loadout follows the new boss (Grimjaw: two tanks, Soul Anchor)', /Grimjaw: Recommended Team Loadout2Tanks2Healers2Support⚔2DPSTip: Watch out for Soul Anchor/.test(s.tactics || ''), s.tactics);
check('tiles follow the new boss', /Combat 65\+/.test(s.tiles) && /Recommended75 Frost resist/.test(s.tiles), s.tiles);
check('one set of owned parts after the swap', await tab.evaluate(() => ['.iw-bc-art', '.iw-bc-stats', '.iw-bc-tiles', '.iw-bc-tactics'].every(q => document.querySelectorAll(`#boss ${q}`).length === 1)));
await (await tab.$('#boss')).screenshot({ path: resolve(OUT, 'grimjaw-hard-1280.png') });

/* -- kill switch -------------------------------------------------------- */
await tab.evaluate(() => window.toggleSkin(false));
await tab.waitForTimeout(500);
s = await state(tab);
check('kill switch: no owned nodes, no marks, lines back', s.owned === 0 && !s.key
  && s.srcVisible.stats && s.srcVisible.req && s.srcVisible.tip
  && await tab.evaluate(() => !document.querySelector('[data-iw-boss-card-src]')), JSON.stringify(s));
await tab.close();

/* -- every boss resolves its own art ------------------------------------ */
console.log('\nevery boss');
for (const key of Object.keys(BOSSES)) {
  const t = await open(bossCard({ key, diff: key === 'thessaly' ? 'easy' : 'normal' }));
  const k = await state(t);
  const loaded = await t.evaluate(async boss => {
    const ok = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = src; });
    return (await ok(`/assets/raids/lobby/${boss}-banner.webp`)) && (await ok(`/assets/raids/lobby/${boss}-portrait.webp`));
  }, key);
  check(`${key}: own banner + medallion, both load`, k.artBoss === key && new RegExp(`${key}-banner`).test(k.banner) && loaded, `${k.artBoss} ${k.banner}`);
  if (key === 'thessaly') check('Practice tone carried (emerald)', k.stats === 'ATK 2,750:easy | DEF 450 | HP 21,000:easy', k.stats);
  await (await t.$('#boss')).screenshot({ path: resolve(OUT, `${key}-1280.png`) });
  await t.close();
}

/* -- live width: the card alone in one column (~930px), heads in view ---- */
for (const key of Object.keys(BOSSES)) {
  const t = await open(bossCard({ key }), 960);
  await (await t.$('#boss')).screenshot({ path: resolve(OUT, `${key}-960.png`) });
  await t.close();
}

/* -- negative control: an unparseable line stays the game's ------------- */
console.log('\nunparseable requirement line');
const odd = await open(bossCard({ req: 'Requires Combat 50+ to join. Bring friends.', notice: LOCK }));
s = await state(odd);
check('no tiles, and the game line stays visible', s.tiles === '' && s.srcVisible.req, JSON.stringify({ tiles: s.tiles, vis: s.srcVisible }));
check('a lock notice stays the game notice, visible, with no bar', s.noticeVisible && !s.loot, JSON.stringify({ vis: s.noticeVisible, loot: s.loot }));
check('the parseable lines still reformat', !s.srcVisible.stats && !s.srcVisible.tip && s.stats.length > 0);
await odd.close();

/* -- phones ------------------------------------------------------------- */
for (const width of [360, 430]) {
  console.log(`\nphone ${width}px`);
  const p = await open(bossCard(), width);
  const ps = await state(p);
  check('no horizontal overflow', ps.overflow <= 0, `${ps.overflow}px`);
  check('medallion and rows inside the hero', ps.portraitInArt && ps.nameInArt);
  await (await p.$('#boss')).screenshot({ path: resolve(OUT, `ashmaw-${width}.png`) });
  await p.close();
}

check('no page errors', errors.length === 0, errors.join('; '));
check('no missing art', missing.length === 0, missing.join(', '));
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall raid boss card checks passed');
process.exit(failures ? 1 : 0);
