/**
 * Guild route and raid (2026-10-05).
 *
 *   1. The raid lobby's Members card is NOT a skill card. Its "Combat 66"
 *      chips tripped DOMWatcher's anchored label fallback and the skin rebuilt
 *      it as a Combat card (names as skill plates, a guest row as an empty
 *      medallion). Checked on /guild AND on another route, where only the
 *      panel's "Raid Dungeon" title proves it.
 *   2. Rule 5 on the route's state colours: the selected boss pill and
 *      difficulty, READY vs "Not ready", the ready toggle, the amber ready
 *      check. The selected pill used to render as a blank slab — the generic
 *      plate's background-image beat the game's own `!important` ember
 *      gradient.
 *   3. The game's sans-skin `[class*="bg-amber-"]` / `.button-primary` rules
 *      (0,3,0 !important) no longer win over the guild sheet.
 *   4. A raider is a disabled <button> with no plate.
 *   5. The Guild tab is a nav tab, active on /guild, and a six-route rail is
 *      still one unclipped row at 320px with the guild panel inside the screen.
 *   6. Kill switch removes every data-iw-guild* mark; re-enable restores them.
 *
 * REAL BROWSER (Playwright), the built bundle. Markup is whitespace-free
 * (docs/traps/test-harness.md). GAME_CSS stands in for the few game rules the
 * bugs depended on; the live stylesheet is not vendored.
 *
 * Negative controls, each verified by reverting one change and rebuilding:
 *   - drop the isGuildSurface() early return in DOMWatcher: both "not a skill
 *     card" checks fail;
 *   - drop `:not([data-iw-guild-role])` from ui-system's generic chain: the
 *     selected pill matches the unselected one again;
 *   - drop the `:root` anchor in guild.css: the ready check and Set fail;
 *   - drop the guild phone block in ui-system.css: the 320px rail clips;
 *   - drop `min-width: 0` on the guild root: the 320px panel overflows (a
 *     potion row's nowrap `truncate` name is what held it wide live: a nowrap
 *     flex row contributes its full text width as min-content).
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const GAME_CSS = `*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0}svg,img{display:block}
button{font:inherit;color:inherit;background:none}
.panel{border:1px solid #333;padding:14px}.flex{display:flex}.flex-wrap{flex-wrap:wrap}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}
.grid{display:grid}.gap-3{gap:12px}.gap-2{gap:8px}.items-center{align-items:center}.justify-between{justify-content:space-between}
.whitespace-nowrap{white-space:nowrap}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.min-w-\\[140px\\]{min-width:140px}.w-\\[76px\\]{width:76px}.rounded-full{border-radius:9999px}.h-1\\.5{height:6px}.w-1\\.5{width:6px}
.bg-ember{background-color:rgb(255 138 61)}.text-ink{color:rgb(9 17 25)}.border-ember{border-color:rgb(255 138 61)}.border{border-width:1px}
.bg-white\\/5{background-color:rgb(255 255 255/.05)}.text-white\\/50{color:rgb(255 255 255/.5)}.text-white\\/25{color:rgb(255 255 255/.25)}
.border-emerald-400\\/40{border-color:rgb(52 211 153/.4)}.bg-emerald-400\\/10{background-color:rgb(52 211 153/.1)}.text-emerald-300{color:rgb(110 231 183)}
.bg-emerald-400{background-color:rgb(52 211 153)}.bg-white\\/20{background-color:rgb(255 255 255/.2)}.bg-amber-400{background-color:rgb(251 191 36)}
.border-amber-300\\/50{border-color:rgb(252 211 77/.5)}.bg-amber-950\\/30{background-color:rgb(69 26 3/.3)}.text-amber-100{color:#fef3c7}
.button-primary{border-radius:1rem;background:#ff8a3d;color:#091119}
:root:is([data-skin="experimental"],[data-skin="sans"]) .bg-ember{background:linear-gradient(90deg,#d6a24a,#9b6a2a)!important}
:root:is([data-skin="experimental"],[data-skin="sans"]) [class*="bg-amber-"]{background-color:#dfb949!important}
:root:is([data-skin="experimental"],[data-skin="sans"]) .button-primary{background:#dfb949!important;color:#111!important}`;

const ROUTES = ['Game', 'Market', 'Leaderboards', 'Village', 'Guild', 'Dungeon'];
const nav = path => `<div class="panel flex flex-wrap gap-2 p-2" id="rail">${ROUTES.map(r => {
  const href = r === 'Game' ? '/' : r === 'Village' ? '/housing' : `/${r.toLowerCase()}`;
  const on = href === path;
  return r === 'Dungeon' ? `<button class="rounded-xl px-3 py-2 text-xs">${r}</button>`
    : `<a class="rounded-xl px-3 py-2 text-xs ${on ? 'bg-ember text-ink' : 'border border-white/10 bg-white/5'}" href="${href}">${r}</a>`;
}).join('')}</div>`;

const member = (name, ready) => `<div class="rounded-lg bg-white/5 p-2.5 space-y-2"><div class="flex items-center justify-between gap-2"><div class="flex min-w-0 items-center gap-1.5"><span class="h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-emerald-400' : 'bg-white/20'}"></span><button class="truncate text-sm font-medium hover:underline underline-offset-2 text-white" type="button">${name}</button><span class="shrink-0 text-[10px] text-amber-200/70" title="Guild Points earned in this guild (1 per day played)">⭐ 1</span></div><div class="flex shrink-0 items-center gap-1.5"><span class="rounded border px-1.5 py-0.5 text-[10px] font-medium border-white/15 text-white/40" title="Combat skill level — needs 60+ for this raid">Combat 66</span></div></div><div class="flex flex-wrap items-center justify-between gap-2"><div class="min-w-[140px] flex-1"><div class="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1.5 text-sky-200" title="Unlocks War Cry"><span>⛏️</span><span class="truncate text-xs font-semibold">War Cry</span><span class="shrink-0 text-[10px] text-sky-300/60">Mining · Lv48</span></div></div>${ready
  ? '<span class="flex shrink-0 items-center gap-1"><span class="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">READY</span></span>'
  : '<span class="shrink-0 text-[11px] text-white/25">Not ready</span>'}</div></div>`;

const head = `<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2"><span>⚔️ Raid Dungeon</span><span class="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] uppercase text-emerald-300">Beta</span></h2><p class="mt-0.5 text-[10px] text-white/45">🤝 Raiding as a guest with <span class="font-semibold text-white/80">Royal Flush</span> • 8/12 members</p></div><div class="flex flex-col items-end gap-1 text-[10px]"><button class="text-white/45 underline hover:text-white/75">View my guild (Omen)</button><button class="text-white/30 hover:text-rose-200 transition">Leave guest spot</button></div></div>`;

const LOBBY = `<div class="panel p-3.5 space-y-3" id="lobby">${head}
<div class="compact-panel p-3 space-y-2 border border-amber-300/50 bg-amber-950/30" id="ready-check"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-amber-100">⚔️ Ready check: Ashmaw Normal</p><span class="text-xs tabular-nums text-amber-200">time's up</span></div><p class="text-[11px] text-white/70">✅ Noook, Alex<span class="block text-white/50">⏳ Waiting on: TadFish</span></p></div>
<div class="flex flex-col gap-3 lg:flex-row lg:items-start"><div class="flex-1 space-y-3"><div class="compact-panel p-3 space-y-1.5" id="boss"><div class="flex flex-wrap gap-1.5 pb-1"><button class="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition bg-ember text-ink" type="button" title="Ashmaw, the Cinder Tyrant" id="pill-on">Ashmaw</button><button class="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition bg-white/5 text-white/50 hover:bg-white/10" type="button" title="Thessaly, the Plague Warden" id="pill-off">Thessaly</button><button class="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition bg-white/5 text-white/50 hover:bg-white/10" type="button" title="Skarth, the Rime Wyrm">Skarth</button></div><p class="text-sm font-semibold text-white">🐉 Ashmaw, the Cinder Tyrant</p><p class="text-xs italic text-white/45">A molten-scaled wyrm.</p><p class="text-xs text-amber-200/80">Requires Combat 60+ to join.</p><div class="flex gap-1.5 pt-1"><button class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5 text-white/50" type="button" id="diff-off">🧪 Practice · no loot</button><button class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-ember bg-ember/20 text-ember" type="button" id="diff-on">Normal</button><button class="flex-1 rounded-lg border px-2 py-1 text-[10px] border-white/10 bg-white/5 text-white/50" type="button">🔒 🔥 Hard</button></div></div></div>
<div class="flex-1 compact-panel p-3 space-y-2" id="members"><div class="flex items-center justify-between"><p class="text-xs font-semibold text-white">Members</p><p class="text-[11px] text-white/40">1/2 ready</p></div><div class="space-y-2">${member('Noook', true)}${member('Eris', false)}</div></div></div>
<div class="compact-panel p-3 space-y-2"><p class="text-xs font-semibold text-white">🧪 Pre-raid prep</p><div class="space-y-1"><div class="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"><span class="min-w-0 truncate text-[11px] text-white/80">Super Kingssteel DEF Potion <span class="text-white/45">×248 · +36 DEF · 1h · Super Kingssteel DEF Potion</span></span><button class="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px]">Drink</button></div></div></div>
<div class="compact-panel p-3 space-y-2"><p class="text-xs font-semibold text-white">Raid Loadout</p><div class="flex gap-2"><select class="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink px-2.5 py-1.5 text-xs"><option>Gold Find</option></select><button class="button-primary px-3 py-1.5 text-xs" id="set">Set</button></div></div>
<div class="compact-panel p-3 space-y-2"><p class="text-[11px] font-semibold text-white">💬 Royal Flush Chat</p><div class="h-40 overflow-y-auto space-y-1.5 rounded-lg bg-black/20 p-2"><div><span class="text-[10px] text-emerald-300/80 font-semibold">Guest 63AC:</span> <span class="text-[10px] text-white/75">https://drive.google.com/uc?id=1pNIrn_tcXMJvJ6h9VLCyrm0-62y7qEn3</span></div></div><div class="flex gap-2"><input class="flex-1 rounded-lg border px-2.5 py-1.5 text-xs" placeholder="Message your guild…" maxlength="280" value=""><button class="button-primary px-3 py-1.5 text-xs" disabled="">Send</button></div></div>
<div class="compact-panel p-3"><div class="flex items-center gap-2"><button class="flex-1 py-2 text-xs font-semibold rounded-xl border transition border-emerald-400/40 bg-emerald-400/15 text-emerald-300" id="ready-toggle">✓ Ready</button></div><p class="mt-2 text-[10px] text-white/35 text-center">Starting a raid doesn't interrupt anyone.</p></div>
</div>`;

const raider = (name, pct, low) => `<button class="flex w-[76px] flex-col items-center gap-0.5 cursor-default" type="button" disabled=""><div class="flex h-12 w-12 items-center justify-center relative"><div class="flex h-12 w-12 items-center justify-center raid-sprite-idle"><img class="h-10 w-10" alt="" src="/raid-sprites/idle.png"></div></div><div class="raid-ground-shadow"></div><p class="w-full truncate rounded bg-black/55 px-0.5 text-center text-[10px] font-semibold text-white">${name}</p><p class="w-full truncate text-center text-[9px] font-medium text-sky-200">Mining</p><div class="h-1.5 w-full overflow-hidden rounded-full bg-black/60"><div class="h-full ${low ? 'bg-amber-400' : 'bg-emerald-400'}" style="width: ${pct}%;"></div></div><div class="h-1 w-full overflow-hidden rounded-full bg-black/60"><div class="h-full bg-amber-400/70" style="width: 55%;"></div></div></button>`;

const FIGHT = `<div class="panel p-3.5 space-y-3" id="fight"><div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2"><span>⚔️ Raid Dungeon</span></h2></div></div>
<div class="raid-battle-backdrop rounded-2xl space-y-3 p-3" style="--raid-bg-image: url(/raid-backgrounds/boss-ashmaw.png);"><div class="relative raid-readable-panel rounded-lg border p-2 text-center text-xs font-medium border-white/15 bg-black/60 text-white/85">Claw Rake (single target) in 10s</div><div class="relative"><div class="mt-1 h-2.5 overflow-hidden rounded-full bg-black/60"><div class="h-full bg-rose-500" style="width: 49%;"></div></div></div><div class="raid-arena-floor relative flex flex-wrap items-end justify-center gap-x-1 gap-y-3 py-1" id="floor">${raider('Noook', 100)}${raider('BustedCypher', 52, true)}</div><button class="raid-readable-panel w-full rounded-lg border border-white/10 bg-black/65 p-2 text-left text-[11px]" type="button"><div class="mb-0.5 flex items-center justify-between"><span>Combat Log</span><span>tap to expand</span></div><p>⚔️ Oat hits for 249.</p></button><p class="relative text-center text-xs text-white/75">Charging your action bar…</p></div></div>`;

const page = (path, skin) => `<!doctype html><html lang="en" data-skin="${skin}" data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title><style>${GAME_CSS}</style></head><body>
<main class="overflow-x-hidden" data-skin="default"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto;overflow-x:hidden">
<header class="panel"><div><p>IdleWorlds</p><h1><button class="hover:underline">BustedCypher</button></h1></div></header>
${nav(path)}<section class="grid gap-3">${LOBBY}${FIGHT}</section></div></main></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open(width, pathname, skin = 'sans') {
  const tab = await browser.newPage({ viewport: { width, height: 900 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(() => {
    const listeners = [], data = {};
    window.chrome = { runtime: { id: 'guild-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: { get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }), set: async bag => Object.assign(data, bag), remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
    window.toggleSkin = enabled => listeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: enabled } }, 'local'));
  });
  const html = page(pathname, skin);
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === pathname) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(ORIGIN + pathname, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForFunction(() => document.querySelector('#members')?.hasAttribute('data-iw-guild-card') &&
    document.querySelector('[data-iw-guild-role="raider"]'), null, { timeout: 8000 }).catch(() => {});
  // The rail's type is FITTED to measured Barlow widths, so a check that runs
  // before the webfont lands measures a narrower fallback face and passes a
  // rail that clips live (it hid the 320px negative control).
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(400);
  return tab;
}

const state = tab => tab.evaluate(() => {
  const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
  const pick = (sel, ...props) => { const s = cs(sel); return s ? Object.fromEntries(props.map(p => [p, s[p]])) : null; };
  const badge = document.querySelector('[data-iw-guild-role="ready-badge"]');
  const not = document.querySelector('[data-iw-guild-role="not-ready"]');
  const guildTab = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')].find(t => t.dataset.iwTab === 'guild');
  return {
    membersSkill: document.querySelector('#members').classList.contains('fs-skill-panel') || document.querySelector('#members').hasAttribute('data-iw-skill'),
    membersKind: document.querySelector('#members').getAttribute('data-iw-guild-card'),
    pillOn: pick('#pill-on', 'backgroundImage', 'color'),
    pillOff: pick('#pill-off', 'backgroundImage', 'color'),
    diffOn: pick('#diff-on', 'borderTopColor', 'color'),
    diffOff: pick('#diff-off', 'borderTopColor', 'color'),
    badge: badge && getComputedStyle(badge).color, notReady: not && getComputedStyle(not).color,
    toggle: pick('#ready-toggle', 'borderTopColor'), toggleState: document.querySelector('#ready-toggle').dataset.iwGuildState || '',
    readyCheck: pick('#ready-check', 'backgroundColor', 'backgroundImage'),
    set: pick('#set', 'backgroundImage'),
    raiders: [...document.querySelectorAll('[data-iw-guild-role="raider"]')].map(r => { const s = getComputedStyle(r); return `${s.backgroundColor}|${s.backgroundImage}|${s.boxShadow}`; }),
    lowHp: [...document.querySelectorAll('[data-iw-guild-role="raider-hp"] > *')].map(f => getComputedStyle(f).backgroundColor),
    guildTab: guildTab ? `${guildTab.dataset.iwUi}:${guildTab.dataset.iwState || '-'}` : 'missing',
    marks: document.querySelectorAll('[data-iw-guild],[data-iw-guild-card],[data-iw-guild-role],[data-iw-guild-tone],[data-iw-guild-state]').length,
  };
});
const rgb = value => (String(value).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

/* -- /guild, desktop ---------------------------------------------------- */
console.log('\n/guild at 1280px (game skin: sans)');
const tab = await open(1280, '/guild');
const s = await state(tab);
check('the Members card is not a skill card', !s.membersSkill && s.membersKind === 'members', `skill=${s.membersSkill} kind=${s.membersKind}`);
check('the selected boss pill still reads as selected', s.pillOn && s.pillOff && s.pillOn.backgroundImage !== s.pillOff.backgroundImage && s.pillOn.color !== s.pillOff.color,
  JSON.stringify([s.pillOn, s.pillOff]));
check('the selected difficulty keeps a different edge', s.diffOn && s.diffOff && s.diffOn.borderTopColor !== s.diffOff.borderTopColor, JSON.stringify([s.diffOn, s.diffOff]));
check('READY and "Not ready" are painted differently', s.badge && s.notReady && s.badge !== s.notReady, `${s.badge} vs ${s.notReady}`);
const [tr, tg] = rgb(s.toggle?.borderTopColor);
check('the ready toggle keeps its ready (green) state', s.toggleState === 'ready' && tg > tr, `${s.toggleState} ${s.toggle?.borderTopColor}`);
check('the ready check is not repainted by the game\'s sans [class*="bg-amber-"] rule',
  /skills_panel_texture/.test(s.readyCheck?.backgroundImage || '') && !/223, 185, 73/.test(s.readyCheck?.backgroundColor || ''), JSON.stringify(s.readyCheck));
check('Set wears the ember CTA over the game\'s .button-primary', s.set && /gradient/.test(s.set.backgroundImage), JSON.stringify(s.set));
// Raiders wear the skin's forged card (head hairline over the shared panel
// ground, 2026-10-07), never the generic control plate or the kit's unit art.
check('raiders wear the forged raid card, not the control plate',
  s.raiders.length === 2 && s.raiders.every(r => r.split('|')[1].startsWith('linear-gradient(90deg') && /skills_panel_texture/.test(r) && !/ui-kit/.test(r)), s.raiders.join(' / '));
check('raider HP keeps the game\'s colour per state', s.lowHp.length === 2 && s.lowHp[0] !== s.lowHp[1], s.lowHp.join(' / '));
check('the Guild tab is an active nav tab', s.guildTab === 'nav-tab:active', s.guildTab);

console.log('\nkill switch');
await tab.evaluate(() => window.toggleSkin(false));
await tab.waitForTimeout(400);
const off = await state(tab);
check('disable removes every data-iw-guild* mark', off.marks === 0, `${off.marks} left`);
await tab.evaluate(() => window.toggleSkin(true));
await tab.waitForFunction(() => document.querySelector('#members')?.hasAttribute('data-iw-guild-card'), null, { timeout: 6000 }).catch(() => {});
const on = await state(tab);
check('re-enable restores them', on.marks === s.marks && on.membersKind === 'members', `${on.marks} vs ${s.marks}`);
await tab.close();

/* -- the raid panel off the Guild route --------------------------------- */
console.log('\nraid panel on another route, game skin: default');
const other = await open(1280, '/', 'default');
const o = await state(other);
check('off-route, the "Raid Dungeon" title still keeps the Members card off the skill path', !o.membersSkill && o.membersKind === 'members', `skill=${o.membersSkill} kind=${o.membersKind}`);
await other.close();

/* -- phones -------------------------------------------------------------- */
for (const width of [320, 390]) {
  console.log(`\n/guild at ${width}px`);
  const t = await open(width, '/guild');
  const m = await t.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-iw-ui="nav-tab"]')].filter(el => el.getBoundingClientRect().width > 0);
    const tops = tabs.map(el => el.getBoundingClientRect()).map(r => [r.top, r.bottom]);
    const oneRow = tops.every(([top, bottom]) => top < tops[0][1] && bottom > tops[0][0]);
    // NOT scrollWidth: a tab is a centred flex box with `min-width: 0`, so a
    // label too wide for it spills into BOTH paddings and scrollWidth (which
    // only sees overflow to the end side) stays equal. Measure the text run
    // against the content box instead.
    const clipped = tabs.filter(el => {
      const text = [...el.childNodes].find(n => n.nodeType === 3);
      if (!text) return false;
      const range = document.createRange();
      range.selectNodeContents(text);
      const cs = getComputedStyle(el);
      const content = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return range.getBoundingClientRect().width > content + 0.5;
    }).map(el => el.textContent.trim());
    const lobby = document.querySelector('#lobby').getBoundingClientRect();
    return { count: tabs.length, oneRow, clipped, lobbyRight: Math.round(lobby.right), vw: innerWidth };
  });
  check(`six route tabs on one row (${m.count})`, m.count === 6 && m.oneRow);
  check('every tab label fits inside its plate', !m.clipped.length, m.clipped.join(', '));
  check('the guild panel stays inside the screen', m.lobbyRight <= m.vw, `right=${m.lobbyRight} vw=${m.vw}`);
  await t.close();
}

await browser.close();
check('no page errors', !errors.length, errors.join(' | '));
if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall guild-panel checks passed');
