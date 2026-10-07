/**
 * Raid HUD (RaidHud.js + guild.css "Raid HUD", 2026-10-06).
 *
 *   1. Boss identity and the cast are read from the game's own text: name and
 *      epithet split, HP percentage from the fill width, the telegraph parsed
 *      into name / scope / seconds / urgency.
 *   2. Every raider frame shows ALL of its effects: personal ones from its own
 *      titled status spans, raid-wide buffs from the Raid skills lines, and the
 *      tank's timer from "X is tanking … — 21s left". Debuffs are toned apart.
 *   3. Your frame (the game's sky nameplate) leads the row and wears the
 *      selected frame — and ONLY yours: every raider's lend line is
 *      text-sky-200, which once made every frame "you".
 *   4. Effect timers sit above the party: every counted effect as a bar
 *      (buffs blue, debuffs red), following text-only ticks; a debuff the
 *      game states no count for is a full bar. No personal HUD (2026-10-07:
 *      it only repeated your party frame).
 *   5. A settled fight writes nothing: strips are not rebuilt per flush.
 *   6. Kill switch removes every owned node and data-iw-raid-* mark.
 *   7. Phone: party frames in two columns, nothing past the screen.
 *
 * REAL BROWSER (Playwright), the built bundle, whitespace-free markup shaped
 * like the live fight DOM (tmp snapshot, 2026-10-05). The arena has no painted
 * scene here: the HUD applies to every raid arena.
 *
 * Negative controls, each run by reverting one line and rebuilding:
 *   - key the self order on `:has(> [class*="text-sky"])`: "only your frame
 *     leads" fails (every raider matched);
 *   - drop the raid-wide merge in decorateRaiders: the War Cry / Ward checks fail;
 *   - drop the signature compare before strip.replaceChildren: the quiescence
 *     check fails.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const status = (glyph, title, pos = 'left-0') => `<span class="absolute -top-1 ${pos} text-[10px]" title="${title}">${glyph}</span>`;
const raider = ({ name, skill, hp, charge = 55, self = false, low = false, spans = '', row = '<span>⏳</span>' }) =>
  `<button class="flex w-[76px] flex-col items-center gap-0.5 cursor-default" type="button" disabled=""><div class="flex h-12 w-12 items-center justify-center gap-0 relative"><div class="flex h-12 w-12 items-center justify-center raid-sprite-idle"><img class="h-10 w-10" alt="" src="/raid-sprites/idle.png"></div>${spans}</div><div class="raid-ground-shadow"></div><p class="w-full truncate rounded bg-black/55 px-0.5 text-center text-[10px] font-semibold ${self ? 'text-sky-300' : 'text-white'}">${name}</p><p class="w-full truncate text-center text-[9px] font-medium text-sky-200">${skill}</p><div class="h-1.5 w-full overflow-hidden rounded-full bg-black/60"><div class="h-full transition-all duration-500 ${low ? 'bg-amber-400' : 'bg-emerald-400'}" style="width: ${hp}%;"></div></div><div class="h-1 w-full overflow-hidden rounded-full bg-black/60"><div class="h-full bg-amber-400/70" style="width: ${charge}%;"></div></div><div class="flex h-4 items-center gap-0.5 text-[11px]">${row}</div></button>`;

const FIGHT = `<div class="panel p-3.5 space-y-3" id="fight"><div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold text-white flex items-center gap-2"><span>⚔️ Raid Dungeon</span></h2></div></div>`
  + `<div class="raid-battle-backdrop rounded-2xl space-y-3 p-3" id="arena" style="--raid-bg-image: url(/raid-backgrounds/boss-grimjaw.png);">`
  + `<div class="relative raid-readable-panel rounded-lg border p-2 text-center text-xs font-medium border-white/15 bg-black/60 text-white/85" id="tg">Claw Rake (single target) in 10s</div>`
  + `<div class="relative" id="boss"><div class="flex items-center justify-between text-sm"><span class="font-semibold text-white">🐉 Ashmaw, the Cinder Tyrant</span><span class="text-white/80">7/7 standing</span></div><div class="mt-2 flex justify-center"><img class="h-16 w-auto raid-boss-idle" alt="Grimjaw" src="/raid-sprites/boss-grimjaw.png"></div><div class="mt-1 h-2.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10"><div class="h-full bg-rose-500 transition-all duration-700" style="width: 49%;"></div></div><p class="mt-1 text-center text-xs font-semibold tabular-nums text-white/90" id="hp">10,352 / 21,000 HP</p></div>`
  + `<div class="raid-readable-panel relative rounded-lg border border-sky-400/30 bg-black/65 p-2.5 text-xs leading-5 text-sky-100"><button class="w-full text-center" type="button">⚡ Raid skills <span class="text-sky-300/80">(who has what?)</span></button><div class="mt-0.5 text-center text-amber-200">🎯 Noook is tanking (Challenge) — 21s left</div><div class="mt-0.5 text-center text-emerald-200">⛏️ War Cry active (+15% raid ATK) — 3s left</div><div class="mt-0.5 text-center text-emerald-200">💠 Ward active (+27 fire resist) — 13s left</div><div class="mt-0.5 text-center text-sky-200">🔥 Your fire resist: 0 gear + 27 Ward = 27 / 60 needed</div></div>`
  + `<div class="raid-arena-floor relative flex flex-wrap items-end justify-center gap-x-1 gap-y-3 py-1" id="floor">`
  + raider({ name: 'Noook', skill: 'Combat (Tank)', hp: 100, spans: status('🎯', 'Tanking', 'right-0') + status('🛡️', '204 shield'), row: '<span>⚔️</span>' })
  + raider({ name: 'Oat', skill: 'Tailoring', hp: 70, spans: status('🛡️', '154 shield') })
  + raider({ name: 'BustedCypher', skill: 'Jewelcrafting', hp: 52, self: true, low: true, spans: status('🛡️', '126 shield'), row: '<span title="Cursed — reduced healing">🩸</span><span>⏳</span>' })
  + raider({ name: 'Guest 63AC', skill: 'Woodcutting', hp: 67, spans: status('🛡️', '148 shield') })
  + `</div><div class="relative"><button class="raid-readable-panel w-full rounded-lg border border-white/10 bg-black/65 p-2 text-left text-[11px] leading-4 text-white/85 space-y-0.5" type="button"><div class="mb-0.5 flex items-center justify-between"><span class="font-semibold uppercase tracking-wide text-white/70">Combat Log</span><span class="text-white/50">tap to expand</span></div><p>⚔️ Oat hits for 249.</p><p>⚔️ BustedCypher hits for 221.</p></button></div>`
  + `<p class="relative text-center text-xs text-white/75">Charging your action bar…</p>`
  // The live fight's own controls: Attack and the lent skill (2026-10-06 capture).
  + `<div class="relative flex flex-wrap gap-2" id="actions"><button class="button-primary flex-1 py-2 text-xs disabled:opacity-40">⚔️ Attack</button><button class="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40" disabled="">🧵 Veil</button></div></div>`
  + `<div class="compact-panel p-3 space-y-2" id="chat"><p class="text-[11px] font-semibold text-white">💬 Raid Chat</p><p class="text-[10px] text-white/35">Private to Royal Flush and its raid guests.</p><div class="h-32 overflow-y-auto space-y-1.5 rounded-lg bg-black/20 p-2"><div><span class="text-[10px] text-emerald-300/80 font-semibold">DjMoO: </span><span class="text-[10px] text-white/75">Good enough</span></div></div><div class="flex gap-2"><input class="flex-1" placeholder="Say something…"><button class="button-primary">Send</button></div></div></div>`;

const page = `<!doctype html><html lang="en" data-skin="default" data-iw-page-hydrated="1"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#000}svg,img{display:block}button{font:inherit;color:inherit;background:none}
.raid-battle-backdrop{position:relative;overflow:hidden}.flex{display:flex}.relative{position:relative}.absolute{position:absolute}.h-full{height:100%}
.flex-1{flex:1 1 0%}
/* Models the game drawing on the floor's pseudo: live, "Raid party" was
   pinned over the first frame's health bar. */
.raid-arena-floor::before{content:'';position:absolute;inset:auto 0 0 0;height:18px;transform:translateY(-40px)}
.bg-emerald-400{background-color:#34d399}.bg-amber-400{background-color:#fbbf24}.bg-rose-500{background-color:#f43f5e}</style></head><body>
<main data-skin="default"><div style="display:flex;flex-direction:column;gap:12px;padding:12px 8px;max-width:1380px;margin:0 auto">
<header class="panel"><h1><button class="hover:underline">BustedCypher</button></h1></header>
<div class="panel" style="display:flex;gap:8px"><a href="/">Game</a><a href="/market">Market</a><a href="/leaderboards">Leaderboards</a><a href="/housing">Village</a><a class="bg-ember" href="/guild">Guild</a><button>Dungeon</button></div>
<section class="grid gap-3">${FIGHT}</section></div></main>
<script>
const LOG = ['⚔️ Noook hits for 300.', '🧵 BustedCypher casts Veil — raid dodge chance up.', '⚔️ Oat hits for 249.', '⚔️ BustedCypher hits for 221.'];
window.gameClicks = [];
const collapsed = () => { const b = document.createElement('button'); b.type = 'button'; b.className = 'raid-readable-panel w-full rounded-lg border border-white/10 bg-black/65 p-2 text-left text-[11px] leading-4 text-white/85 space-y-0.5';
  b.innerHTML = '<div class="mb-0.5 flex items-center justify-between"><span class="font-semibold uppercase tracking-wide text-white/70">Combat Log</span><span class="text-white/50">tap to expand</span></div>' + LOG.slice(-3).reverse().map(l => '<p>' + l + '</p>').join('');
  b.onclick = () => { window.gameClicks.push('expand'); b.replaceWith(expanded()); }; return b; };
const expanded = () => { const d = document.createElement('div'); d.className = 'raid-readable-panel rounded-lg border border-white/15 bg-black/75 p-2';
  d.innerHTML = '<div class="mb-1 flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wide text-white/70">Combat Log</span><div class="flex gap-1.5"><button type="button" class="rounded border">⬇ .txt</button><button type="button" class="rounded border">✕ Close</button></div></div><div class="max-h-[260px] overflow-y-auto rounded-lg bg-black/30 p-2 text-[11px] leading-4 text-white/85 space-y-0.5">' + LOG.map(l => '<p>' + l + '</p>').join('') + '</div>';
  d.querySelectorAll('button')[0].onclick = () => window.gameClicks.push('txt');
  d.querySelectorAll('button')[1].onclick = () => { window.gameClicks.push('close'); d.replaceWith(collapsed()); }; return d; };
const old = document.querySelector('#arena button.raid-readable-panel'); old.replaceWith(collapsed());
const skills = document.querySelector('#arena .raid-readable-panel:not(button) > button').parentElement;
skills.querySelector(':scope > button').onclick = () => { window.gameClicks.push('roster'); const open = skills.querySelector('.roster');
  if (open) { open.remove(); skills.querySelector(':scope > button > span').textContent = '(who has what?)'; return; }
  const r = document.createElement('div'); r.className = 'roster mt-1.5 space-y-0.5 border-t border-sky-400/15 pt-1.5 text-left';
  r.innerHTML = '<p class="text-[11px]"><span class="font-semibold text-white">Noook</span> — Challenge: taunts the boss</p>';
  skills.querySelector(':scope > button').after(r); skills.querySelector(':scope > button > span').textContent = '(hide)'; };
</script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const errors = [];

async function open(width) {
  const tab = await browser.newPage({ viewport: { width, height: 1000 } });
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.addInitScript(() => {
    const listeners = [], data = {};
    window.chrome = { runtime: { id: 'raid-hud-test', getURL: p => `${location.origin}/${String(p).replace(/^\/+/, '')}` },
      storage: { local: { get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }), set: async bag => Object.assign(data, bag), remove: async key => { delete data[key]; } },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
    window.toggleSkin = enabled => listeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: enabled } }, 'local'));
  });
  await tab.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/guild') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    try { return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body: await readFile(resolve(ROOT, url.pathname.slice(1))) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto(`${ORIGIN}/guild`, { waitUntil: 'load' });
  await tab.addScriptTag({ content: bundle });
  await tab.waitForFunction(() => document.querySelector('.iw-raid-timers'), null, { timeout: 8000 }).catch(() => {});
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(400);
  return tab;
}

const read = tab => tab.evaluate(() => {
  const raiders = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].map(r => ({
    name: r.querySelector('[data-iw-guild-role="raider-name"]').textContent,
    skill: r.getAttribute('data-iw-raid-skill'), hp: r.getAttribute('data-iw-raid-hp'), frame: r.getAttribute('data-iw-raid-frame'),
    order: getComputedStyle(r).order, border: `${getComputedStyle(r).borderImageSource}|${getComputedStyle(r).borderTopColor}`,
    chips: [...r.querySelectorAll('.iw-raid-chip')].map(c => `${c.dataset.iwRaidArt || c.textContent.trim()}:${c.querySelector('.iw-raid-chip-value')?.textContent || ''}:${c.dataset.iwRaidTone}`),
  }));
  const tg = document.getElementById('tg');
  const boss = document.querySelector('[data-iw-raid-boss]');
  const timers = [...document.querySelectorAll('.iw-raid-timer')].map(b => [b.querySelector('.iw-raid-timer-name').textContent, b.querySelector('.iw-raid-timer-who').textContent,
    b.querySelector('.iw-raid-timer-secs').textContent, b.dataset.iwRaidTone, b.querySelector('.iw-raid-timer-fill').style.width].join('|'));
  return {
    raiders,
    boss: boss && `${boss.getAttribute('data-iw-raid-boss')}|${boss.getAttribute('data-iw-raid-epithet')}`,
    pct: document.getElementById('hp').getAttribute('data-iw-raid-pct'),
    cast: ['name', 'scope', 'secs', 'urgency', 'step'].map(k => tg.getAttribute(`data-iw-raid-cast-${k}`)).join('|'),
    timers,
    hud: !!document.querySelector('.iw-raid-me'),
    owned: document.querySelectorAll('[data-iw-raid-owned]').length,
    party: document.getElementById('floor').getAttribute('data-iw-raid-party'),
    gameHidden: ['[data-iw-guild-role="combat-log-region"]', '[data-iw-guild-role="effects"]'].map(q => { const n = document.querySelector(q); return n ? getComputedStyle(n).display : "untagged"; }).join(),
    dockAfterChat: document.getElementById('chat')?.nextElementSibling?.classList.contains('iw-raid-dock') || false,
    dockFolds: [...document.querySelectorAll('.iw-raid-dock-panel')].map(d => `${d.dataset.iwRaidDock}:${d.dataset.iwRaidFold}:${getComputedStyle(d.lastElementChild).display}`).join(),
    marks: [...document.querySelectorAll('*')].filter(e => [...e.attributes].some(a => a.name.startsWith('data-iw-raid-'))).length,
  };
});

// HUD panels wear the shared forged frame (corner filigree over the panel
// texture), never the kit's personal-hud / utility-panel art, which could not
// hold the content or resize with the layout (2026-10-07).
const panelFrames = t => t.evaluate(() => ['.iw-raid-dock-panel[data-iw-raid-dock="log"]', '.iw-raid-dock-panel[data-iw-raid-dock="skills"]'].map(sel => {
  const el = document.querySelector(sel);
  const cs = el && getComputedStyle(el);
  return { sel,
    ok: !!cs && /panel_corners/.test(cs.borderImageSource) && /skills_panel_texture/.test(cs.backgroundImage) && !/ui-kit/.test(cs.backgroundImage + cs.borderImageSource),
    fits: !!el && el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 };
}));

console.log('\n/guild fight at 1440px');
const tab = await open(1440);
const s = await read(tab);
const by = n => s.raiders.find(r => r.name === n);
check('boss name and epithet split from the game line', s.boss === 'Ashmaw|the Cinder Tyrant', s.boss);
check('boss HP percentage from the fill width', s.pct === '49%', s.pct);
check('cast parsed into name, scope, seconds, urgency, step', s.cast === 'Claw Rake|Single target|10s|calm|10', s.cast);
check('each raider carries its lend skill', by('Noook')?.skill === 'combat' && by('Oat')?.skill === 'tailoring' && by('BustedCypher')?.skill === 'jewelcrafting', JSON.stringify(s.raiders.map(r => r.skill)));
check('raider HP % read from the game fill', by('Oat')?.hp === '70%' && by('BustedCypher')?.hp === '52%');
check('only your frame is "self" and leads the row',
  s.raiders.filter(r => r.frame === 'self').map(r => r.name).join() === 'BustedCypher' &&
  s.raiders.filter(r => r.order === '-1').map(r => r.name).join() === 'BustedCypher', JSON.stringify(s.raiders.map(r => `${r.name}:${r.frame}:${r.order}`)));
// Frames are the skin's forged card (2026-10-07): no kit art, the themed
// edge (the fixture's un-themed --iw-th-edge #6B4F28), your edge in teal.
check('your frame is CSS-drawn with the teal "you" edge', by('BustedCypher')?.border === 'none|rgb(61, 116, 135)' && by('Oat')?.border === 'none|rgb(107, 79, 40)', `${by('BustedCypher')?.border} / ${by('Oat')?.border}`);
const pf = await panelFrames(tab);
check('HUD panels wear the shared forged frame and hold their content', pf.every(p => p.ok && p.fits), JSON.stringify(pf));
check('the party caption counts the frames', s.party === '4 raiders · all standing', s.party);
check('the game\'s log and Raid skills are hidden in the arena', s.gameHidden === 'none,none', s.gameHidden);
check('the dock sits right after Raid Chat, both panels folded', s.dockAfterChat && s.dockFolds === 'log:closed:none,skills:closed:none', JSON.stringify({ after: s.dockAfterChat, folds: s.dockFolds }));
const noook = by('Noook')?.chips.join(' ') || '';
check('the tank carries Tanking with the game\'s 21s', /taunt:21s:buff/.test(noook), noook);
check('personal shields carry their value', /shield:204:buff/.test(noook) && by('Oat')?.chips.some(c => c.startsWith('shield:154')), noook);
check('raid-wide War Cry and Ward reach every raider', s.raiders.every(r => r.chips.some(c => c.startsWith('war-cry:3s')) && r.chips.some(c => c.startsWith('ward:13s'))), JSON.stringify(s.raiders.map(r => r.chips)));
const mine = by('BustedCypher')?.chips || [];
check('your curse is shown and toned as a debuff, last', mine.at(-1) === 'curse::debuff', mine.join(' '));
check('no personal HUD: your party frame carries you', s.hud === false);
check('timers: raid buffs, the tank, then the curse, toned and counted',
  s.timers.join(' / ') === 'War Cry|Raid|3s|buff|100% / Ward|Raid|13s|buff|100% / Tanking|Noook|21s|buff|100% / Cursed|BustedCypher||debuff|100%', s.timers.join(' / '));
const tc = await tab.evaluate(() => {
  const fill = tone => getComputedStyle(document.querySelector(`.iw-raid-timer[data-iw-raid-tone="${tone}"] > .iw-raid-timer-fill`)).backgroundImage;
  const row = document.querySelector('.iw-raid-timers').getBoundingClientRect();
  const frames = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].map(r => r.getBoundingClientRect());
  return { buff: fill('buff'), debuff: fill('debuff'), above: row.bottom <= Math.min(...frames.map(f => f.top)), h: Math.round(row.height) };
});
check('buff timers fill blue, debuff timers red', /116, 182, 221/.test(tc.buff) && /224, 120, 106/.test(tc.debuff), JSON.stringify(tc));
check('the timer row sits above the raid frames', tc.above && tc.h > 0, JSON.stringify(tc));

const L = await tab.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; };
  const acts = document.getElementById('actions');
  const floor = document.getElementById('floor');
  return {
    role: acts.getAttribute('data-iw-guild-role'),
    buttons: [...acts.children].map(b => b.getAttribute('data-iw-guild-role')).join(','),
    acts: box(acts), floor: box(floor),
    disabledOpacity: getComputedStyle(acts.children[1]).opacity,
    caption: getComputedStyle(floor, '::before').position + '|' + getComputedStyle(floor, '::before').content,
  };
});
check('Attack / Veil are the action bar, not a stray grid cell', L.role === 'actions' && L.buttons === 'action,action' && L.acts.h < 80, JSON.stringify(L.acts));
check('the action bar sits under the party', L.acts.top >= L.floor.bottom - 1, JSON.stringify({ acts: L.acts, floor: L.floor }));
check('a disabled action (game state) stays dimmed', Number(L.disabledOpacity) < 0.75, L.disabledOpacity);
// Attack and the lent skill wear the skin's standard compact plate (2026-10-07);
// the game's primary keeps an ember rule on the plate's layers (rule 5).
const B = await tab.evaluate(() => [...document.querySelectorAll('#actions > button')].map(b => ({
  plate: b.getAttribute('data-iw-compact-button'), layers: b.querySelectorAll(':scope > [data-iw-compact-layer]').length,
  h: Math.round(b.getBoundingClientRect().height), primary: b.classList.contains('button-primary'),
  rule: (layer => layer ? getComputedStyle(layer).boxShadow : 'no plate')(b.querySelector('[data-iw-compact-layer="idle"]')) })));
check('Attack and the lent skill wear the standard plate', B.length === 2 && B.every(b => b.plate === 'text' && b.layers === 3 && b.h === 44), JSON.stringify(B));
check('only the game\'s primary carries the ember rule', /inset/.test(B.find(b => b.primary)?.rule || '') && B.find(b => !b.primary)?.rule === 'none', JSON.stringify(B));
// A pseudo-element's painted position is not observable; its computed position is.
check('the "Raid party" caption flows above the frames, not over them', /^static\|"Raid party\s*·\s*4 raiders · all standing"$/.test(L.caption), L.caption);

console.log('\nsettled and ticking');
const quiet = await tab.evaluate(async () => {
  const arena = document.getElementById('arena');
  let records = 0;
  const mo = new MutationObserver(list => { records += list.filter(m => m.target.closest?.('.iw-raid-fx, .iw-raid-timers') || [...m.addedNodes].some(n => n.nodeType === 1 && n.matches?.('[data-iw-raid-owned]'))).length; });
  mo.observe(arena, { subtree: true, childList: true, characterData: true, attributes: true });
  // Unrelated game churn: the combat log gains a line, which flushes the arena.
  const log = arena.querySelector('[data-iw-guild-role="combat-log"]');
  for (let i = 0; i < 3; i++) { const p = document.createElement('p'); p.textContent = `⚔️ Oat hits for ${300 + i}.`; log.append(p); await new Promise(r => setTimeout(r, 120)); }
  await new Promise(r => setTimeout(r, 400));
  mo.disconnect();
  return records;
});
check('a settled fight does not touch the owned strips or timers', quiet === 0, `${quiet} owned-node mutations`);

// Text-only ticks, the way the game counts down: no attribute, no element,
// just the text node's value. The mirrored timers must follow every tick
// (they froze until an unrelated mutation flushed, 2026-10-07).
const ticks = await tab.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tg = document.getElementById('tg');
  const cry = [...document.querySelectorAll('[data-iw-guild-role="effects"] > div')].find(d => /War Cry/.test(d.textContent));
  const seen = [];
  for (const n of [9, 8, 7, 4]) {
    tg.firstChild.nodeValue = `Claw Rake (single target) in ${n}s`;
    cry.firstChild.nodeValue = `⛏️ War Cry active (+15% raid ATK) — ${n - 2}s left`;
    await frame(); await frame();
    const oat = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].find(r => /Oat/.test(r.textContent));
    const chip = oat.querySelector('.iw-raid-chip[data-iw-raid-art="war-cry"] .iw-raid-chip-value')?.textContent;
    const bar = document.querySelector('.iw-raid-timer[data-iw-raid-timer="raid:War Cry"]');
    seen.push(`${tg.getAttribute('data-iw-raid-cast-secs')}/${tg.getAttribute('data-iw-raid-cast-step')}/${chip}/${bar?.querySelector('.iw-raid-timer-secs').textContent}@${bar?.querySelector('.iw-raid-timer-fill').style.width}`);
  }
  return seen;
});
check('the cast timer and effect timers follow text-only ticks', ticks.join(' ') === '9s/9/7s/7s@100% 8s/8/6s/6s@86% 7s/7/5s/5s@71% 4s/4/2s/2s@29%', ticks.join(' '));
// Encounter artwork follows the native identity, even if the scene/image still
// describes the previous boss while React is changing encounters. Each text
// tick must replace the portrait without moving the native HP fill.
const portraits = await tab.evaluate(async () => {
  const name = document.querySelector('[data-iw-raid-boss]');
  const original = name.textContent;
  const track = document.querySelector('[data-iw-guild-role="boss-hp"]');
  const nativeFill = track.firstElementChild;
  const nativeWidth = nativeFill.style.width;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const rows = [];
  for (const boss of ['Ashmaw', 'Thessaly', 'Morwenna', 'Grimjaw', 'Skarth', 'Unknown encounter', 'Ashmaw']) {
    name.firstChild.nodeValue = boss;
    await frame(); await frame();
    const image = getComputedStyle(track, '::before').backgroundImage;
    const url = /url\(["']?([^"')]+)/.exec(image)?.[1];
    const loaded = url ? await new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img.naturalWidth === 1216 && img.naturalHeight === 406); img.onerror = () => resolve(false); img.src = url; }) : false;
    rows.push({boss, key:document.getElementById('arena').getAttribute('data-iw-raid-encounter'), image, loaded,
      intact:track.firstElementChild===nativeFill && nativeFill.style.width===nativeWidth});
  }
  name.firstChild.nodeValue = original; await frame(); await frame();
  return rows;
});
for (const p of portraits.filter(p => p.boss !== 'Unknown encounter')) check(`${p.boss} uses its own loaded headshot shell`, p.key === p.boss.toLowerCase() && p.image.includes(`boss-health-${p.key}.png`) && p.loaded && p.intact, JSON.stringify(p));
const unknownPortrait = portraits.find(p => p.boss === 'Unknown encounter');
check('an unknown encounter clears the previous portrait and preserves HP', unknownPortrait.key === null && unknownPortrait.image === 'none' && unknownPortrait.intact, JSON.stringify(unknownPortrait));
const bossFill = await tab.evaluate(async () => {
  const track = document.querySelector('[data-iw-guild-role="boss-hp"]'), fill = track.firstElementChild, original = fill.style.width;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = getComputedStyle(track, '::before'), art = before.backgroundImage;
  const rows=[];
  for(const pct of [0, 49, 100]) {
    fill.style.width=pct+'%'; await frame(); await new Promise(resolve=>setTimeout(resolve,450));
    const r=track.getBoundingClientRect(), f=fill.getBoundingClientRect();
    const insets = el => { const cs = getComputedStyle(el); return ['--iw-shell-l', '--iw-shell-r'].reduce((n, k) => n + Number(cs.getPropertyValue(k)), 0); };
    rows.push({pct, actual:f.width/(r.width*(1216-insets(track))/1216)*100, copied:document.getElementById('hp').getAttribute('data-iw-raid-pct'), same:track.firstElementChild===fill&&getComputedStyle(track,'::before').backgroundImage===art});
  }
  fill.style.width=original; await frame();
  return {rows, events:before.pointerEvents, layer:before.zIndex};
});
check('the native HP animates under a pointer-transparent overlay', bossFill.events==='none' && bossFill.layer==='1' && bossFill.rows.every(r=>Math.abs(r.actual-r.pct)<.1&&r.copied===r.pct+'%'&&r.same),JSON.stringify(bossFill));
// The cast bar is a slim bar hung just under the health shell's channel
// (23.0263% in, 10.8553% from the right, the channel's bottom 13.9803% of the shell's
// width above its foot), and at 4s of 10 it is 40% full and "near"-toned.
// Negative control: declare --iw-cast-fill on the (0,3,0) placement rule and
// the fill stays 100% (2026-10-07: it did, for every tick).
const cb = await tab.evaluate(() => {
  const tg = document.getElementById('tg'), cs = getComputedStyle(tg);
  const hp = document.querySelector('[data-iw-guild-role="boss-hp"]').getBoundingClientRect(), r = tg.getBoundingClientRect();
  const channelBottom = hp.bottom - hp.width * .139803;
  return { fill: cs.getPropertyValue('--iw-cast-fill').trim(), near: /#e5562f/i.test(cs.getPropertyValue('--iw-cast-ink')) || /229, 86, 47/.test(cs.getPropertyValue('--iw-cast-ink')),
    left: Math.round(r.left - (hp.left + hp.width * .230263)), right: Math.round((hp.right - hp.width * .108553) - r.right),
    gap: +((r.top - channelBottom) / hp.width).toFixed(3), h: Math.round(r.height) };
});
check('the cast bar hangs slim under the health channel, filled to its countdown', cb.fill === '40%' && cb.near && Math.abs(cb.left) <= 2 && Math.abs(cb.right) <= 2 && cb.gap >= .03 && cb.gap <= .07 && cb.h <= 28, JSON.stringify(cb));
// "(who has what?)" opened (game JSX, chunk 7027): the toggle reads "(hide)" and
// the lenders' list follows it. It names War Cry; it is not a War Cry line.
// Negative control: drop the list guard in RaidHud.readRaidEffects and every
// raider carries two War Cry chips, the list a data-iw-raid-fx-kind.
const who = await tab.evaluate(async () => {
  const toggle = document.querySelector('#arena [data-iw-guild-role="effects-toggle"]');
  toggle.querySelector('span').textContent = '(hide)';
  const list = document.createElement('div');
  list.id = 'lenders';
  list.className = 'mt-1.5 space-y-0.5 border-t border-sky-400/15 pt-1.5 text-left';
  list.innerHTML = '<p class="text-[11px]"><span class="font-semibold text-white">Noook</span> — Challenge: Unlocks Challenge (taunt)</p>'
    + '<p class="text-[11px]"><span class="font-semibold text-white">Oat</span> — Veil: Unlocks Veil — +68% chance to dodge</p>'
    + '<p class="text-[11px]"><span class="font-semibold text-white">Xanthippe</span> — War Cry: Unlocks War Cry — +15% raid ATK while active</p>';
  toggle.after(list);
  await new Promise(r => setTimeout(r, 500));
  const counts = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].map(r => r.querySelectorAll('.iw-raid-chip[data-iw-raid-art="war-cry"]').length);
  const out = { counts: counts.join(','), kind: list.getAttribute('data-iw-raid-fx-kind') };
  list.remove();
  toggle.querySelector('span').textContent = '(who has what?)';
  await new Promise(r => setTimeout(r, 300));
  return out;
});
check('the opened "who has what?" list adds no effect to the raiders', /^1(,1)*$/.test(who.counts) && who.kind === null, JSON.stringify(who));

await tab.evaluate(() => {
  const fill = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].find(r => /BustedCypher/.test(r.textContent)).querySelector('[data-iw-guild-role="raider-hp"] > *');
  fill.className = 'h-full transition-all duration-500 bg-rose-500'; fill.style.width = '20%';
});
await tab.waitForTimeout(500);
const t = await read(tab);
check('a falling raider turns critical', t.raiders.find(r => r.name === 'BustedCypher')?.frame === 'critical', t.raiders.find(r => r.name === 'BustedCypher')?.frame);

await tab.evaluate(() => {
  const fill = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].find(r => /BustedCypher/.test(r.textContent)).querySelector('[data-iw-guild-role="raider-hp"] > *');
  fill.style.width = '0%';
  // The wipe card the game appends (2026-10-06 capture).
  const card = document.createElement('div');
  card.id = 'outcome';
  card.className = 'relative rounded-lg p-2.5 text-[11px] border border-rose-400/30 bg-rose-400/10 text-rose-200';
  card.innerHTML = '<p class="font-semibold">💀 Wipe. Ashmaw, the Cinder Tyrant.</p><button class="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] text-white/70 hover:bg-white/10">Close</button>';
  document.getElementById('arena').append(card);
});
await tab.waitForTimeout(500);
const w = await tab.evaluate(() => {
  const card = document.getElementById('outcome');
  const r = card.getBoundingClientRect();
  const cast = document.getElementById('tg').getBoundingClientRect();
  const floor = document.getElementById('floor').getBoundingClientRect();
  const me = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].find(x => /BustedCypher/.test(x.textContent));
  return { role: card.getAttribute('data-iw-guild-role'), tone: card.getAttribute('data-iw-guild-tone'),
    close: card.querySelector('button').getAttribute('data-iw-guild-role'),
    between: r.top >= cast.bottom && r.bottom <= floor.top, h: Math.round(r.height),
    curseBar: !!document.querySelector('.iw-raid-timer[data-iw-raid-timer="debuff:Cursed"]'),
    // The result banner (2026-10-07): the game's headline split into glyph,
    // word and boss, drawn as medallion, gilded word and subtitle.
    banner: (() => { const head = card.querySelector('p'), cs = getComputedStyle(head, '::before');
      return [card.getAttribute('data-iw-raid-result'), card.getAttribute('data-iw-raid-result-glyph'), head.getAttribute('data-iw-raid-result-word'),
        head.getAttribute('data-iw-raid-result-boss'), cs.content, getComputedStyle(head).fontSize, getComputedStyle(card, '::after').content].join('|'); })(),
    closePlate: card.querySelector('button').getAttribute('data-iw-compact-button'),
    down: me.getAttribute('data-iw-raid-down'), downLabel: getComputedStyle(me, '::after').content,
    leads: getComputedStyle(me).order === '-1' && [...me.parentElement.children].filter(x => x !== me).every(x => getComputedStyle(x).order !== '-1') };
});
check('the wipe card is the result banner, toned bad, between cast and party', w.role === 'outcome' && w.tone === 'bad' && w.close === 'outcome-close' && w.between && w.h < 260, JSON.stringify(w));
check('the wipe reads as a banner: the game\'s glyph, word and boss', w.banner === 'wipe|💀|Wipe|Ashmaw, the Cinder Tyrant|"Wipe"|0px|"💀"' && w.closePlate === 'text', JSON.stringify(w));
// The same card as a kill (the game's emerald classes and its loot line).
const v = await tab.evaluate(async () => {
  const card = document.getElementById('outcome');
  card.className = 'relative rounded-lg p-2.5 text-[11px] border border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  card.querySelector('p').textContent = '🏆 Victory! Ashmaw, the Cinder Tyrant.';
  const loot = document.createElement('p'); loot.className = 'mt-1 text-[10px] opacity-80';
  loot.textContent = 'Practice clear — Practice never drops loot, and your weekly loot is untouched.';
  card.querySelector('p').after(loot);
  await new Promise(r => setTimeout(r, 500));
  const head = card.querySelector('p');
  return { kind: card.getAttribute('data-iw-raid-result'), word: getComputedStyle(head, '::before').content, glyph: getComputedStyle(card, '::after').content,
    gild: getComputedStyle(head, '::before').backgroundImage, loot: getComputedStyle(loot).fontStyle, text: card.textContent.includes('Victory! Ashmaw') };
});
check('a kill reads Victory in gilt over the game\'s loot line, text intact', v.kind === 'victory' && v.word === '"Victory"' && v.glyph === '"🏆"' && /255, 242, 200/.test(v.gild) && v.loot === 'italic' && v.text, JSON.stringify(v));
check('a downed raider\'s curse leaves the timers', w.curseBar === false, String(w.curseBar));
check('a raider at 0 HP is marked down and says so', w.down === '1' && /Down/.test(w.downLabel), `${w.down} ${w.downLabel}`);
check('your frame still leads the row when it turns critical / down', w.leads, JSON.stringify(w));

// A full party of eight is two rows of four on desktop and tablet (2026-10-07).
await tab.evaluate(() => {
  const floor = document.getElementById('floor');
  const src = [...floor.children].find(r => /Oat/.test(r.textContent));
  for (const name of ['Ash', 'Bryn', 'Cael', 'Dara']) {
    const c = src.cloneNode(true);
    c.querySelectorAll('[data-iw-raid-owned]').forEach(x => x.remove());
    for (const e of [c, ...c.querySelectorAll('*')]) [...e.attributes].filter(a => a.name.startsWith('data-iw')).forEach(a => e.removeAttribute(a.name));
    c.querySelector('p').textContent = name;
    floor.append(c);
  }
});
const rowsOf = async () => { await tab.waitForTimeout(400); return tab.evaluate(() => {
  const rows = new Map();
  for (const r of document.querySelectorAll('[data-iw-guild-role="raider"]')) { const top = Math.round(r.getBoundingClientRect().top); rows.set(top, (rows.get(top) || 0) + 1); }
  return [...rows.values()].join('+');
}); };
const rows1440 = await rowsOf();
await tab.setViewportSize({ width: 900, height: 1000 });
const rows900 = await rowsOf();
await tab.setViewportSize({ width: 1440, height: 1000 });
check('eight raiders are two rows of four at 1440 and 900px', rows1440 === '4+4' && rows900 === '4+4', `${rows1440} / ${rows900}`);

console.log('\nkill switch');
await tab.evaluate(() => window.toggleSkin(false));
await tab.waitForTimeout(400);
const off = await read(tab);
check('disable removes every owned node and data-iw-raid-* mark', off.owned === 0 && off.marks === 0, `owned=${off.owned} marks=${off.marks}`);
await tab.close();

console.log('\nphone 390px');
const phone = await open(390);
const m = await phone.evaluate(() => {
  const rect = el => el && el.getBoundingClientRect();
  const frames = [...document.querySelectorAll('[data-iw-guild-role="raider"]')].map(rect);
  const firstRow = frames.filter(r => Math.abs(r.top - Math.min(...frames.map(f => f.top))) < 2).length;
  const timers = rect(document.querySelector('.iw-raid-timers'));
  const name = rect(document.querySelector('[data-iw-raid-boss]'));
  // The hero: the painted scene if this boss has one, else the game's own sprite.
  const art = document.querySelector('[data-iw-raid-hud] > :is([data-iw-ashmaw-art], [data-iw-thessaly-art], [data-iw-morwenna-art], [data-iw-grimjaw-art])');
  const hero = rect(art) || rect(document.querySelector('[data-iw-guild-role="boss-summary"] img'));
  const hp = rect(document.querySelector('[data-iw-guild-role="boss-hp"]'));
  const hpText = rect(document.getElementById('hp'));
  const cast = rect(document.getElementById('tg'));
  return { firstRow, overflow: document.documentElement.scrollWidth - innerWidth, timersRight: timers ? Math.round(timers.right) : -1, vw: innerWidth,
    scene: !!art, heroTop: hero.top - name.bottom, heroH: Math.round(hero.height), hpBelow: hp.top - hero.bottom, castBelow: +((cast.top - (hp.bottom - hp.width * .139803)) / hp.width).toFixed(3),
    hpTextOnShell: Math.abs(hpText.top - hp.top) < 2 && Math.abs(hpText.height - hp.height) < 2 && Math.abs(hpText.width - hp.width) < 2,
    timersAboveParty: !!timers && timers.bottom <= Math.min(...frames.map(f => f.top)) && timers.top >= cast.bottom };
});
check('party frames sit three to a row', m.firstRow === 3, `${m.firstRow} in the first row`);
check('the boss is the hero: a tall window between identity and health', m.heroTop >= -8 && m.heroH >= 140 && m.hpBelow >= -6 && m.castBelow >= .03 && m.castBelow <= .07, JSON.stringify(m));
check('the HP text sits on the health shell', m.hpTextOnShell, JSON.stringify(m));
check('the timers sit between the cast bar and the party', m.timersAboveParty, JSON.stringify(m));
check('nothing runs past the screen', m.overflow <= 0 && m.timersRight <= m.vw, JSON.stringify(m));

const pfPhone = await panelFrames(phone);
check('HUD panels keep the forged frame on a phone', pfPhone.every(p => p.ok && p.fits), JSON.stringify(pfPhone));

const dock = async () => phone.evaluate(() => {
  const panel = key => document.querySelector(`.iw-raid-dock-panel[data-iw-raid-dock="${key}"]`);
  // A folded panel hides its BODY; its children keep their own display.
  const lines = key => getComputedStyle(panel(key).lastElementChild).display === 'none' ? [] : [...panel(key).querySelectorAll('.iw-raid-dock-body > *')].map(n => n.textContent.trim());
  const log = document.querySelector('[data-iw-guild-role="combat-log"]');
  const dockBox = document.querySelector('.iw-raid-dock').getBoundingClientRect(), chat = document.getElementById('chat').getBoundingClientRect();
  return { log: panel('log').dataset.iwRaidFold, skills: panel('skills').dataset.iwRaidFold, logLines: lines('log'), skillLines: lines('skills'),
    gameLog: log?.tagName, gameLogRole: log?.getAttribute('data-iw-guild-role'), clicks: window.gameClicks.join(),
    txt: [...document.querySelectorAll('button')].filter(b => /\.txt/.test(b.textContent) && b.getClientRects().length).length,
    stacked: panel('skills').getBoundingClientRect().top >= panel('log').getBoundingClientRect().bottom - 1,
    belowChat: dockBox.top >= chat.bottom - 1, fullWidth: Math.abs(dockBox.width - chat.width) < 2,
    effectsTagged: document.querySelectorAll('[data-iw-guild-role="effects"]').length };
});
const d0 = await dock();
check('log and skills start folded under the chat, stacked full width', d0.log === 'closed' && d0.skills === 'closed' && !d0.logLines.length && !d0.skillLines.length && d0.stacked && d0.belowChat && d0.fullWidth, JSON.stringify(d0));
await phone.click('.iw-raid-dock-panel[data-iw-raid-dock="log"] > .iw-raid-dock-head');
await phone.waitForTimeout(250);
const d1 = await dock();
check('opening the log presses the game\'s own expand and shows the whole log', d1.log === 'open' && d1.clicks === 'expand' && d1.gameLog === 'DIV' && d1.logLines.length === 4 && d1.logLines[0].startsWith('⚔️ Noook'), JSON.stringify(d1));
check('the expanded log is the log, not a second Raid skills panel', d1.gameLogRole === 'combat-log' && d1.effectsTagged === 1, JSON.stringify(d1));
check('the log\'s ⬇ .txt download is never shown', d1.txt === 0, JSON.stringify(d1));
await phone.click('.iw-raid-dock-panel[data-iw-raid-dock="log"] > .iw-raid-dock-head');
await phone.waitForTimeout(250);
const d2 = await dock();
check('folding the log presses the game\'s own Close', d2.log === 'closed' && d2.clicks === 'expand,close' && d2.gameLog === 'BUTTON' && !d2.logLines.length, JSON.stringify(d2));
await phone.click('.iw-raid-dock-panel[data-iw-raid-dock="skills"] > .iw-raid-dock-head');
await phone.waitForTimeout(250);
const d3 = await dock();
check('opening Raid skills shows the game\'s lines', d3.skills === 'open' && d3.skillLines.some(l => /War Cry active/.test(l)) && d3.skillLines.some(l => /fire resist/.test(l)) && d3.skillLines.at(-1) === 'who has what?', JSON.stringify(d3));
await phone.click('.iw-raid-dock-more');
await phone.waitForTimeout(250);
const d4 = await dock();
check('"who has what?" presses the game\'s toggle and its roster appears', d4.clicks.endsWith('roster') && d4.skillLines.some(l => /Noook — Challenge/.test(l)) && d4.skillLines.at(-1) === 'hide', JSON.stringify(d4));
await phone.close();

await browser.close();
check('no page errors', !errors.length, errors.join(' | '));
if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall raid-hud checks passed');
