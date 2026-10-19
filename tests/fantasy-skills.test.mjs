/**
 * Fantasy skills + quests (src/skins/fantasy/skills/, styles/skills.css,
 * styles/quests.css): the game's own Skills sheet and Work Orders board.
 *
 * THE PAGE IS THE LIVE ONE, REBUILT. tests/fixtures/live-2026-10-16/ holds
 *   skills-quests.html  both panels regenerated from a live capture
 *                       (claude/fixture-from-capture.mjs; the port's data-iw-*
 *                       marks and the panel's own inline <style> included),
 *   game.css            the game's stock CSS bundle of that day,
 *   port-fantasy.css    the port's /reskin-bc/theme/fantasy.css of that day,
 * loaded in the page's order, with the port's /reskin-bc/assets/ served from
 * this repo's assets/. A fixture that omits a sheet lies (CLAUDE.md); the
 * port's generic `button:not(…)` rule is exactly what the buttons must beat.
 *
 *   1. Control: before Fantasy, the emoji render and nothing is marked.
 *   2. Skill icons: every tab and the sheet head carry their discipline and
 *      paint its action icon; the emoji collapse to zero width.
 *   3. Item icons: every work-order item and the material line paint their
 *      atlas cell (item atlas by id, gear atlas by name for Eternium gear);
 *      the windows match the vendored indexes.
 *   4. Nothing hidden without a replacement: an unknown item, a line that
 *      loses its emoji, a multi-item material line all keep their text.
 *   5. State stays distinct (rule 5): active tab, ready / bounty / plain
 *      tile, disabled vs enabled Turn in, running / best / locked row,
 *      spent reroll; and the port's !important button slate is beaten.
 *   6. Text ticks: a renamed sheet head re-keys without a structural change.
 *   7. Quiescence: a settled page mutates nothing (with a counting control).
 *   8. Stand-down: a port sheet that styles `.iw-wo-` retires the board
 *      reskin only, and clears its marks.
 *   9. stop() restores the page byte for byte.
 *  10. 390px: no horizontal overflow.
 *
 * REAL BROWSER (Playwright).
 */

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FIX = resolve(ROOT, 'tests/fixtures/live-2026-10-16');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const fantasyJs = (await build({
  entryPoints: [resolve(ROOT, 'src/skins/fantasy/index.js')], bundle: true, write: false, format: 'iife',
  platform: 'browser', loader: { '.css': 'text' }, logLevel: 'silent', globalName: 'Fantasy',
})).outputFiles[0].text;

const body = await readFile(resolve(FIX, 'skills-quests.html'), 'utf8');
const previousCardsCss = await readFile(resolve(FIX, 'previous-skill-cards.css'), 'utf8');
const page = (extraHead = '') => `<!doctype html><html lang="en" data-skin="fantasy" data-iw-zone-theme="voidborn" data-iw-skill-card-design="new" data-iw-page-hydrated="1"><head><meta charset="utf-8">
<link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css">${extraHead}</head>
<body><main data-skin="fantasy" style="max-width:1400px;margin:0 auto;padding:12px">
<style>.iw-fixture{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}@media (min-width:1280px){.iw-fixture{grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr)}}</style>
<section class="iw-fixture">${body}</section></main></body></html>`;

/* ── vendored indexes: the expected windows ───────────────────────────── */

const csv = (await readFile(resolve(ROOT, 'assets/item_icons_index.csv'), 'utf8')).split(/\r?\n/).filter(Boolean);
const head = csv.shift().split(',');
const items = new Map(csv.map(l => { const f = l.split(','); return [f[head.indexOf('item_id')], { x: +f[head.indexOf('x')], y: +f[head.indexOf('y')] }]; }));
const gear = new Map(JSON.parse(await readFile(resolve(ROOT, 'assets/gear_icons_manifest.json'), 'utf8')).icons.map(i => [i.name, i]));
const itemPos = ({ x, y }) => [100 * x / (1280 - 128), 100 * y / (6144 - 128)];
const gearPos = ({ x, y }) => [100 * x / (1280 - 128), 100 * y / (19840 - 128)];

/* ── harness ──────────────────────────────────────────────────────────── */

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv', '.woff2': 'font/woff2', '.css': 'text/css' };
const browser = await chromium.launch();
const assetHits = new Map();

async function open({ width = 1606, extraHead = '', bootEntry = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1300 } });
  const tab = await context.newPage();
  tab.on('pageerror', err => check('no page error', false, err.message));
  await tab.route('http://iw.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const file = path === '/game.css' ? resolve(FIX, 'game.css')
      : path === '/reskin-bc/theme/fantasy.css' ? resolve(FIX, 'port-fantasy.css')
      : path.startsWith('/reskin-bc/theme/extra') ? null
      : path.startsWith('/reskin-bc/assets/') ? resolve(ROOT, 'assets', path.slice('/reskin-bc/assets/'.length))
      : path.startsWith('/__extension__/assets/') ? resolve(ROOT, 'assets', path.slice('/__extension__/assets/'.length))
      : path.startsWith('/assets/') ? resolve(ROOT, path.slice(1))
      : null;
    // The game does not host the extension's assets. Keep the namespaces
    // separate so an unrewritten URL fails here exactly as it does live.
    if (bootEntry && path.startsWith('/assets/')) return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/reskin-bc/theme/extra')) return route.fulfill({ contentType: 'text/css', body: path.endsWith('extra-skills.css') ? '.iw-ss-zone{outline:0}' : '.iw-wo-tile{outline:0}' });
    if (!file) return route.fulfill({ contentType: 'text/html', body: page(extraHead) });
    try {
      const bytes = await readFile(file);
      assetHits.set(path, (assetHits.get(path) || 0) + 1);
      return route.fulfill({ body: bytes, contentType: MIME[extname(path)] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await tab.goto('http://iw.test/');
  if (bootEntry) {
    // Exercise the shipped entry point, profile storage and hydration gate,
    // rather than calling the Fantasy feature export directly.
    await tab.evaluate(() => {
      window.beforeBootstrapTabs = document.querySelector('.iw-skill-tabs').innerHTML;
      window.extensionSettingListeners = [];
      window.chrome = { runtime: { id: 'skill-card-bootstrap', getURL: path => `${location.origin}/__extension__/${path}` }, storage: {
        local: { get: async key => ({ [key]: key === 'iw-skin-theme' ? 'fantasy' : undefined }) },
        onChanged: { addListener: fn => extensionSettingListeners.push(fn), removeListener: () => {} },
      } };
    });
    await tab.addScriptTag({ content: await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8') });
  } else await tab.addScriptTag({ content: fantasyJs });
  return tab;
}
const frames = (tab, n = 3) => tab.evaluate(n => new Promise(done => {
  const step = k => (k ? requestAnimationFrame(() => step(k - 1)) : done()); step(n);
}), n);
const settle = async tab => { await frames(tab); await tab.waitForTimeout(150); await frames(tab); };
const start = async tab => {
  await tab.evaluate(() => window.Fantasy.start());
  await tab.waitForFunction(() => document.querySelector('[data-iw-fantasy-icon]'), null, { timeout: 4000 }).catch(() => {});
  await settle(tab);
};

/* In-page helpers: the painted width of an element's leading emoji run, and
   a pseudo-element's background. */
const helpers = () => {
  window.emojiWidth = el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const t = walker.nextNode();
    if (!t) return -1;
    const m = t.textContent.match(/^\s*((\p{Extended_Pictographic}|️|‍)+)/u);
    if (!m) return -1;
    const r = document.createRange();
    r.setStart(t, t.textContent.indexOf(m[1])); r.setEnd(t, t.textContent.indexOf(m[1]) + m[1].length);
    return r.getBoundingClientRect().width;
  };
  window.bg = (el, pseudo = null) => {
    const cs = getComputedStyle(el, pseudo);
    return { img: cs.backgroundImage, pos: cs.backgroundPosition, size: cs.backgroundSize };
  };
};

/* ── 1. control ───────────────────────────────────────────────────────── */

let tab = await open();
await tab.evaluate(helpers);
check('fixture: both stylesheets loaded (game + port)', await tab.evaluate(() =>
  [...document.styleSheets].filter(s => /game\.css|reskin-bc/.test(s.href || '')).every(s => s.cssRules.length > 100)
  && [...document.styleSheets].filter(s => /game\.css|reskin-bc/.test(s.href || '')).length === 2));
check('fixture: 10 tabs, 3 groups, 8 work orders', await tab.evaluate(() =>
  document.querySelectorAll('.iw-skill-tab').length === 10 && document.querySelectorAll('.iw-ss-group').length === 3 && document.querySelectorAll('.iw-wo-tile').length === 8));
const control = await tab.evaluate(() => ({
  tab: emojiWidth(document.querySelector('.iw-skill-tab-icon')),
  item: emojiWidth(document.querySelector('.iw-wo-item')),
  btn: bg(document.querySelector('.iw-wo-btn:not(:disabled)')).img,
  head: bg(document.querySelector('.iw-ss-group-head')).img,
}));
check('control: emoji render before Fantasy (tab icon, item)', control.tab > 8 && control.item > 8, JSON.stringify(control));
check('control: the port\'s slate paints the game buttons', /linear-gradient/.test(control.btn) && /linear-gradient/.test(control.head), control.btn);
const pristine = await tab.evaluate(() => document.body.innerHTML);

await start(tab);

/* ── 2. skill icons ───────────────────────────────────────────────────── */

const tabs = await tab.evaluate(() => [...document.querySelectorAll('.iw-skill-tab')].map(t => ({
  name: t.querySelector('.iw-skill-tab-name').textContent, key: t.getAttribute('data-iw-fantasy-skill'),
  img: bg(t.querySelector('.iw-skill-tab-icon')).img, pos: bg(t.querySelector('.iw-skill-tab-icon')).pos,
  size: bg(t.querySelector('.iw-skill-tab-icon')).size, emoji: emojiWidth(t.querySelector('.iw-skill-tab-icon')),
})));
// The painted medallions: skills_icons_atlas.webp, 6 x 2 cells, keyed from
// the vendored index (not from the stylesheet under test).
const medalIndex = JSON.parse(await readFile(resolve(ROOT, 'assets/skills_icons_index.json'), 'utf8'));
const medal = Object.fromEntries(medalIndex.entries.map(e => [e.key, `${100 * e.col / (medalIndex.columns - 1)}% ${100 * e.row / (medalIndex.rows - 1)}%`]));
// Not in the atlas: painted separately (2026-10-16), one WebP each.
const STANDALONE = ['woodcutting', 'construction'];
const wantKey = { Combat: 'combat', Mining: 'mining', Smithing: 'smithing', Gathering: 'gathering', Alchemy: 'alchemy', Jewelcrafting: 'jewelcrafting', Spellcrafting: 'spellcrafting', Tailoring: 'tailoring', Woodcutting: 'woodcutting', Construction: 'construction' };
check('tabs: every tab carries its discipline', tabs.every(t => t.key === wantKey[t.name]), JSON.stringify(tabs.map(t => [t.name, t.key])));
check('tabs: eight disciplines paint their own atlas medallion', tabs.filter(t => !STANDALONE.includes(t.key)).every(t =>
  /skills_icons_atlas\.webp/.test(t.img) && t.pos === medal[t.key] && t.size === '600% 200%'), JSON.stringify(tabs.map(t => [t.key, t.pos, t.size])));
check('tabs: Woodcutting + Construction paint their own medallion, whole', tabs.filter(t => STANDALONE.includes(t.key)).every(t =>
  t.img.includes(`skills-medallions/${t.key}.webp`) && t.size === '100% 100%') && STANDALONE.every(k => !(k in medal)),
  JSON.stringify(tabs.filter(t => STANDALONE.includes(t.key))));
check('tabs: no tab falls back to a line icon', tabs.every(t => !/action-icons/.test(t.img)));
check('tabs: the emoji collapse to zero width', tabs.every(t => t.emoji === 0), tabs.map(t => t.emoji).join());
// Every image on screen loaded: both standalone medallions, and the line
// icon of each discipline a work order names.
const shownSvgs = [...new Set(await tab.evaluate(() =>
  [...document.querySelectorAll('.iw-wo-skill[data-iw-fantasy-skill]')].map(s => s.getAttribute('data-iw-fantasy-skill'))))];
check('icons: every icon on screen actually loaded', shownSvgs.length >= 8 && shownSvgs.every(k => assetHits.get(`/assets/skills-ui/action-icons/${k}.svg`))
  && STANDALONE.every(k => assetHits.get(`/assets/skills-medallions/${k}.webp`)),
  JSON.stringify([...assetHits.keys()].filter(p => /action-icons|medallions/.test(p))));

// The Toolkit's collapsed card, as portrait tiles headed by the skill name
// (2026-10-17); the XP ring is the game's bar.
const rings = await tab.evaluate(() => [...document.querySelectorAll('.iw-skill-tab')].map(t => {
  const r = t.getBoundingClientRect();
  const name = t.querySelector('.iw-skill-tab-name').getBoundingClientRect(), icon = t.querySelector('.iw-skill-tab-icon').getBoundingClientRect();
  return { ratio: r.width / r.height, nameAbove: name.height > 0 && name.bottom <= icon.top && name.top >= r.top, bar: parseFloat(t.querySelector('.iw-skill-tab-bar > span').style.width),
    pct: t.getAttribute('data-iw-fantasy-pct'), ring: getComputedStyle(t.querySelector('.iw-skill-tab-icon'), '::after').backgroundImage,
    barShown: getComputedStyle(t.querySelector('.iw-skill-tab-bar')).display !== 'none' };
}));
check('tabs: portrait tiles, one shape', rings.every(r => r.ratio < 0.95 && Math.abs(r.ratio - rings[0].ratio) < 0.01), rings.map(r => r.ratio.toFixed(3)).join());
check('tabs: the skill name heads the tile, above the medallion', rings.every(r => r.nameAbove));
check('tabs: each ring reads its bar (rounded %)', rings.every(r => r.pct === String(Math.round(r.bar))), JSON.stringify(rings.map(r => [r.bar, r.pct])));
check('tabs: the ring sweep is the reading (conic to that %)', rings.every(r => /conic-gradient/.test(r.ring) && r.ring.includes(` ${r.pct}%`)),
  rings.map(r => r.ring.slice(0, 120)).join(' | '));
check('tabs: the game bar hides while the ring carries it', rings.every(r => !r.barShown));
const live = await tab.evaluate(async () => {
  const t = document.querySelectorAll('.iw-skill-tab')[1]; const bar = t.querySelector('.iw-skill-tab-bar > span');
  bar.style.width = '72.4%';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
  const moved = t.getAttribute('data-iw-fantasy-pct');
  const old = bar.getAttribute('style'); bar.removeAttribute('style');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
  const out = { moved, gone: t.getAttribute('data-iw-fantasy-pct'), barBack: getComputedStyle(t.querySelector('.iw-skill-tab-bar')).display !== 'none' };
  bar.setAttribute('style', old.replace('72.4%', '35.8274%'));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
  return out;
});
check('tabs: the ring follows a bar the game moves', live.moved === '72', JSON.stringify(live));
check('negative control: no bar reading, no ring value, the game bar is back', live.gone === null && live.barBack, JSON.stringify(live));

const sheetHead = await tab.evaluate(() => {
  const h = document.querySelector('.iw-ss-head'); const icon = h.querySelector('.iw-ss-icon');
  const r = icon.getBoundingClientRect();
  return { key: h.getAttribute('data-iw-fantasy-skill'), img: bg(icon).img, pos: bg(icon).pos, emoji: emojiWidth(icon), ratio: r.width / r.height };
});
check('sheet head: the painted Smithing medallion', sheetHead.key === 'smithing'
  && /skills_icons_atlas\.webp/.test(sheetHead.img) && sheetHead.pos === medal.smithing && sheetHead.emoji === 0, JSON.stringify(sheetHead));
check('sheet head: square box for a square cell', Math.abs(sheetHead.ratio - 1) < 0.02, String(sheetHead.ratio));
check('tabs: the medallion atlas actually loaded', assetHits.get('/assets/skills_icons_atlas.webp') > 0);

const woSkills = await tab.evaluate(() => [...document.querySelectorAll('.iw-wo-skill')].map(s => ({
  text: s.textContent, key: s.getAttribute('data-iw-fantasy-skill'), lead: s.getAttribute('data-iw-fantasy-lead'),
  img: bg(s, '::before').img, emoji: emojiWidth(s),
})));
check('work orders: every tile names its discipline (Bounty = combat)', woSkills.every(s => s.key && s.lead === 'icon')
  && woSkills.find(s => /Bounty/.test(s.text))?.key === 'combat', JSON.stringify(woSkills.map(s => [s.text, s.key])));
check('work orders: skill icons paint and the emoji collapse', woSkills.every(s => s.img.includes(`action-icons/${s.key}.svg`) && s.emoji === 0),
  JSON.stringify(woSkills.map(s => [s.key, s.emoji])));
check('work orders: the board title\'s scroll emoji is replaced by the diamond', await tab.evaluate(() => {
  const t = document.querySelector('.iw-wo-head > span:first-child');
  return t.getAttribute('data-iw-fantasy-lead') === 'icon' && emojiWidth(t) === 0 && getComputedStyle(t, '::before').content === '""';
}));

/* ── 3. item icons ────────────────────────────────────────────────────── */

const woItems = await tab.evaluate(() => [...document.querySelectorAll('.iw-wo-item')].map(i => ({
  id: i.getAttribute('data-iw-item'), name: i.textContent.replace(/^\S+\s/, ''), key: i.getAttribute('data-iw-fantasy-icon'),
  sprite: bg(i, '::after'), frame: bg(i, '::before').img, emoji: emojiWidth(i),
})));
const near = (pos, [x, y]) => { const [a, b] = pos.split(' ').map(parseFloat); return Math.abs(a - x) < 0.01 && Math.abs(b - y) < 0.01; };
const wrong = woItems.filter(i => {
  const cell = items.get(i.id);
  if (cell) return !/item_icons_atlas\.png/.test(i.sprite.img) || !near(i.sprite.pos, itemPos(cell));
  const g = gear.get(i.name);
  return !g || !/gear_icons_atlas\.png/.test(i.sprite.img) || !near(i.sprite.pos, gearPos(g));
});
check('work orders: every item paints its own atlas cell', woItems.every(i => i.key) && wrong.length === 0, JSON.stringify(wrong));
check('work orders: Eternium Helm + Eternal Weave Boots come from the gear atlas', ['eternium_helm', 'eternal_weave_boots'].every(id =>
  /gear_icons_atlas/.test(woItems.find(i => i.id === id)?.sprite.img || '')));
check('work orders: item emoji collapse, the sprite stands bare (no ring)', woItems.every(i => i.emoji === 0 && !/approved-frames\.png/.test(i.frame)));
/* Every item sprite is at least the inventory's (the port's .fs-inv-icon box
   is 52px with a 1px border at this width, and the sprite fills it). The
   control is that box, measured from the port's own sheet in this page. */
const iconSizes = await tab.evaluate(() => {
  const probe = Object.assign(document.createElement('span'), { className: 'fs-inv-icon' });
  probe.style.setProperty('--fs-frame', '#8a6a2c'); // a row sets it; without it the border is invalid
  document.body.append(probe);
  const inv = probe.clientWidth; probe.remove();
  const px = (el, pseudo) => parseFloat(getComputedStyle(el, pseudo).width);
  return { inv, items: [...document.querySelectorAll('.iw-wo-item[data-iw-fantasy-icon]')].map(i => px(i, '::after')),
    materials: [...document.querySelectorAll('.iw-ss-detail[data-iw-fantasy-icon]')].map(d => px(d, '::before')) };
});
check('item icons: work-order and material sprites are at least inventory size', iconSizes.inv >= 40
  && [...iconSizes.items, ...iconSizes.materials].length > 0 && [...iconSizes.items, ...iconSizes.materials].every(w => w >= iconSizes.inv),
  JSON.stringify(iconSizes));
check('work orders: both atlases actually loaded', assetHits.get('/assets/item_icons_atlas.png') > 0 && assetHits.get('/assets/gear_icons_atlas.png') > 0,
  JSON.stringify([...assetHits].filter(([p]) => /atlas/.test(p))));

const material = await tab.evaluate(() => { const d = document.querySelector('.iw-ss-detail'); return { text: d.textContent, key: d.getAttribute('data-iw-fantasy-icon'), sprite: bg(d, '::before'), emoji: emojiWidth(d) }; });
check('sheet: the material line paints Eternium Ore', material.key === 'item-eterniumore' && near(material.sprite.pos, itemPos(items.get('eternium_ore'))) && material.emoji === 0, JSON.stringify(material));

/* ── 3b. material counts: green when held, red when short ─────────────── */

/* Legacy's ingredient highlight, forked: ranges in the Custom Highlight
   registry, nothing written into React's text. The verdict is the game's own
   owned/required; the control flips one count and the entry must move. */
const highlighted = () => tab.evaluate(() => {
  const read = name => [...(CSS.highlights.get(name) || [])].map(r => r.toString());
  return { met: read('iwf-material-met'), short: read('iwf-material-short') };
});
check('materials: the fixture line (121174/8) reads as held', JSON.stringify(await highlighted()) === JSON.stringify({ met: ['🪨 Eternium Ore 121174/8'], short: [] }), JSON.stringify(await highlighted()));
const materialBefore = await tab.evaluate(() => document.querySelector('.iw-ss-detail').outerHTML);
await tab.evaluate(() => { document.querySelector('.iw-ss-detail').firstChild.textContent = '📦 Astral Bough 0/40 • 🪨 Astralium Ore 98709/20 • 📦 Iron Building Parts 1.2k/80'; });
await settle(tab);
const mixed = await highlighted();
check('materials: a mixed line splits per entry, short in red, held in green',
  JSON.stringify(mixed) === JSON.stringify({ met: ['🪨 Astralium Ore 98709/20', '📦 Iron Building Parts 1.2k/80'], short: ['📦 Astral Bough 0/40'] }), JSON.stringify(mixed));
await mkdir(resolve(ROOT, 'tmp/materials'), { recursive: true });
await tab.locator('.iw-ss-row', { has: tab.locator('.iw-ss-detail') }).first().screenshot({ path: resolve(ROOT, 'tmp/materials/mixed-line.png') });
// Entries in separate elements with no bullet between them (textContent joins them bare).
await tab.evaluate(() => { const d = document.querySelector('.iw-ss-detail'); d.innerHTML = '<span>📦 Astral Bough 3/2</span><span>🪨 Astralium Ore 1/20</span>'; });
await settle(tab);
const split = await highlighted();
check('materials: entries in sibling elements stay apart', JSON.stringify(split) === JSON.stringify({ met: ['📦 Astral Bough 3/2'], short: ['🪨 Astralium Ore 1/20'] }), JSON.stringify(split));
await tab.evaluate(() => { const d = document.querySelector('.iw-ss-detail'); d.textContent = '📦 Astral Bough 0/40 • 🪨 Astralium Ore 98709/20'; });
await settle(tab);
await tab.evaluate(() => { document.querySelector('.iw-ss-detail').firstChild.textContent = '📦 Astral Bough 40/40 • 🪨 Astralium Ore 98709/20'; });
await settle(tab);
const flipped = await highlighted();
check('materials control: a count tick re-reads the verdict (0/40 -> 40/40 turns green)', flipped.short.length === 0 && flipped.met.includes('📦 Astral Bough 40/40'), JSON.stringify(flipped));
check('materials: the highlight colours ship in the skills sheet', await tab.evaluate(() => {
  const sheet = document.querySelector('style[data-iw-fantasy-style="skills"]')?.sheet;
  const sel = [...(sheet?.cssRules || [])].map(r => r.selectorText).filter(Boolean);
  return sel.includes('::highlight(iwf-material-met)') && sel.includes('::highlight(iwf-material-short)');
}));
await tab.evaluate(html => { document.querySelector('.iw-ss-detail').outerHTML = html; }, materialBefore);
await settle(tab);

/* ── 4. nothing hidden without a replacement ──────────────────────────── */

const leftovers = await tab.evaluate(async () => {
  const tile = document.querySelector('.iw-wo-tile:not(.is-ready):not(.is-bounty)');
  const item = tile.querySelector('.iw-wo-item'); const skill = tile.querySelector('.iw-wo-skill');
  item.removeAttribute('data-iw-item'); item.firstChild.textContent = '🧿 Nonexistent Thing';
  skill.firstChild.textContent = 'Gathering';
  const line = document.querySelector('.iw-ss-detail'); line.firstChild.textContent = '🪨 Eternium Ore 5/8 🧱 Eternium Bar 1/2';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80))));
  return {
    unknown: { key: item.getAttribute('data-iw-fantasy-icon'), emoji: emojiWidth(item) },
    noEmoji: { lead: skill.getAttribute('data-iw-fantasy-lead'), first: (() => { const r = document.createRange(); r.setStart(skill.firstChild, 0); r.setEnd(skill.firstChild, 1); return r.getBoundingClientRect().width; })() },
    multi: { key: line.getAttribute('data-iw-fantasy-icon'), emoji: emojiWidth(line) },
  };
});
check('unknown item: no mark, its emoji stays', leftovers.unknown.key === null && leftovers.unknown.emoji > 8, JSON.stringify(leftovers.unknown));
check('a line that loses its emoji keeps its first letter', leftovers.noEmoji.lead === null && leftovers.noEmoji.first > 3, JSON.stringify(leftovers.noEmoji));
check('multi-item material line: no mark, emoji kept', leftovers.multi.key === null && leftovers.multi.emoji > 8, JSON.stringify(leftovers.multi));
// Negative control on the collapse itself: drop the lead mark by hand.
check('negative control: without data-iw-fantasy-lead the emoji is back', await tab.evaluate(() => {
  const i = document.querySelector('.iw-wo-tile.is-ready .iw-wo-item'); const before = emojiWidth(i);
  i.removeAttribute('data-iw-fantasy-lead'); const after = emojiWidth(i);
  i.setAttribute('data-iw-fantasy-lead', 'icon'); return before === 0 && after > 8;
}));

/* ── 5. state ─────────────────────────────────────────────────────────── */

const state = await tab.evaluate(() => {
  const cs = (el, p = 'borderColor') => getComputedStyle(el)[p];
  const rows = document.querySelector('.iw-ss-group.is-open .iw-ss-rows');
  const running = rows.querySelector('.iw-ss-row.is-running');
  // The game renders plain / best / locked rows in collapsed groups; clone the
  // running row as each (test-only DOM, the game's own classes).
  const make = cls => { const r = running.cloneNode(true); r.className = `iw-ss-row ${cls}`.trim(); rows.append(r); return r; };
  const plain = make(''), best = make('is-best'), locked = make('is-locked');
  const reroll = document.querySelector('.iw-wo-reroll'); const off = reroll.cloneNode(true); off.classList.add('is-off'); reroll.after(off);
  const tiles = { plain: document.querySelector('.iw-wo-tile:not(.is-ready):not(.is-bounty)'), ready: document.querySelector('.iw-wo-tile.is-ready'), bounty: document.querySelector('.iw-wo-tile.is-bounty') };
  const out = {
    tabActive: cs(document.querySelector('.iw-skill-tab.is-active')), tabIdle: cs(document.querySelector('.iw-skill-tab:not(.is-active)')),
    tilePlain: cs(tiles.plain), tileReady: cs(tiles.ready), tileBounty: cs(tiles.bounty), bountyRail: cs(tiles.bounty, 'boxShadow'),
    btnOn: getComputedStyle(document.querySelector('.iw-wo-btn:not(:disabled):not(.is-batch)')).backgroundImage,
    btnOff: getComputedStyle(document.querySelector('.iw-wo-btn:disabled')).backgroundImage,
    btnOffColor: cs(document.querySelector('.iw-wo-btn:disabled'), 'color'), btnOnColor: cs(document.querySelector('.iw-wo-btn:not(:disabled)'), 'color'),
    btnOffOpacity: cs(document.querySelector('.iw-wo-btn:disabled'), 'opacity'),
    batch: cs(document.querySelector('.iw-wo-btn.is-batch'), 'color'), btnOnLabel: cs(document.querySelector('.iw-wo-btn:not(:disabled):not(.is-batch)'), 'color'),
    rowRunning: cs(running), rowPlain: cs(plain), rowBest: cs(best), lockedOpacity: cs(locked, 'opacity'),
    rerollOff: cs(off, 'opacity'), rerollOn: cs(reroll, 'opacity'),
    groupHead: getComputedStyle(document.querySelector('.iw-ss-group-head')).backgroundImage,
  };
  [plain, best, locked, off].forEach(n => n.remove());
  return out;
});
check('state: the active tab reads differently', state.tabActive !== state.tabIdle, `${state.tabActive} vs ${state.tabIdle}`);
check('state: ready, bounty and plain tiles are three different frames', new Set([state.tilePlain, state.tileReady, state.tileBounty]).size === 3
  && /inset/.test(state.bountyRail), JSON.stringify([state.tilePlain, state.tileReady, state.tileBounty, state.bountyRail]));
// The inventory's control: one face for every kind, state carried by the
// label colour and the disabled fade, as on the inventory's Equip / Sell.
check('state: disabled Turn in differs from enabled (label + .45 fade)', state.btnOnColor !== state.btnOffColor && parseFloat(state.btnOffOpacity) < 0.6,
  JSON.stringify([state.btnOnColor, state.btnOffColor, state.btnOffOpacity]));
check('state: the batch control keeps its own label', state.batch !== state.btnOnLabel, `${state.batch} vs ${state.btnOnLabel}`);
check('state: running, best and plain rows are three different frames; locked fades', new Set([state.rowRunning, state.rowPlain, state.rowBest]).size === 3
  && parseFloat(state.lockedOpacity) < 0.6, JSON.stringify([state.rowRunning, state.rowPlain, state.rowBest, state.lockedOpacity]));
check('state: a spent reroll is dimmed', parseFloat(state.rerollOff) <= 0.3 && parseFloat(state.rerollOn) === 1);
check('cascade: Fantasy\'s surface beats the port\'s !important slate', state.btnOn !== control.btn && state.groupHead !== control.head,
  `${state.btnOn} | ${control.btn}`);

/* The port's compact-ghost-v3 atlas (the face of the inventory's controls
   and the nav tabs), emulated as the port sets it: data-iw-compact-atlas +
   --iw-compact-atlas on <html>. The buttons paint its cells: middle strip on
   the button, caps on ::before / ::after; hover moves to the hover row;
   without the atlas the CSS plate returns. */
const ATLAS = '/reskin-bc/assets/skills-ui/buttons/compact-ghost-v3/voidborn.png';
await tab.evaluate(atlas => {
  document.documentElement.dataset.iwCompactAtlas = 'compact-ghost-v3';
  document.documentElement.style.setProperty('--iw-compact-atlas', `url("${atlas}")`);
}, ATLAS);
await settle(tab);
const face = sel => tab.evaluate(sel => {
  const b = document.querySelector(sel), g = p => getComputedStyle(b, p);
  return { mid: g().backgroundImage, midY: g().backgroundPositionY, left: g('::before').backgroundImage, right: g('::after').backgroundImage,
    capW: g('::before').width, capSize: g('::after').backgroundSize, h: b.getBoundingClientRect().height };
}, sel);
const ON = '.iw-wo-btn:not(:disabled):not(.is-batch)';
const idle = await face(ON);
check('atlas: Turn in paints the compact atlas (strip + both caps)', [idle.mid, idle.left, idle.right].every(v => v.includes('compact-ghost-v3/voidborn.png'))
  && idle.capW === '10px' && /^1680%/.test(idle.capSize) && idle.h === 26, JSON.stringify(idle));
check('atlas: batch and disabled wear the same face', (await face('.iw-wo-btn.is-batch')).mid === idle.mid && (await face('.iw-wo-btn:disabled')).mid === idle.mid);
await tab.hover(ON);
const hover = await face(ON);
await tab.mouse.move(0, 0);
check('atlas: hover moves to the hover row', idle.midY !== hover.midY && hover.midY === '50%', `${idle.midY} -> ${hover.midY}`);
await tab.evaluate(() => { delete document.documentElement.dataset.iwCompactAtlas; document.documentElement.style.removeProperty('--iw-compact-atlas'); });
await settle(tab);
check('atlas: without it the CSS plate returns', /linear-gradient/.test((await face(ON)).mid));

/* ── 6. text tick ─────────────────────────────────────────────────────── */

await tab.evaluate(() => { document.querySelector('.iw-ss-name > span:first-child').firstChild.textContent = 'Mining'; });
await settle(tab);
check('text tick: a renamed sheet head re-keys (Smithing -> Mining)', await tab.evaluate(() =>
  document.querySelector('.iw-ss-head').getAttribute('data-iw-fantasy-skill') === 'mining'));
await tab.evaluate(() => { document.querySelector('.iw-ss-name > span:first-child').firstChild.textContent = 'Smithing'; });
await settle(tab);

/* ── 7. quiescence ────────────────────────────────────────────────────── */

const quiet = await tab.evaluate(() => new Promise(done => {
  let n = 0; const o = new MutationObserver(r => { n += r.length; });
  o.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { const idle = n; document.querySelector('.iw-wo-sub').setAttribute('data-probe', '1'); setTimeout(() => { o.disconnect(); document.querySelector('.iw-wo-sub').removeAttribute('data-probe'); done({ idle, probe: n - idle }); }, 30); }, 600);
}));
check('quiescence: a settled page mutates nothing', quiet.idle === 0, String(quiet.idle));
check('quiescence control: the counter does count', quiet.probe >= 1, String(quiet.probe));

// A route that unmounts a menu takes its sheet with it (no sheet without a surface).
await tab.evaluate(() => document.querySelector('.iw-wo-board').remove());
await settle(tab);
check('unmount: the board leaving drops the quests sheet, skills stay', await tab.evaluate(() =>
  !document.querySelector('style[data-iw-fantasy-style="quests"]') && !!document.querySelector('style[data-iw-fantasy-style="skills"]')));

/* ── 9. stop() ────────────────────────────────────────────────────────── */

// Section 4 edited this page, so the byte-for-byte check runs on a fresh one.
await tab.evaluate(() => window.Fantasy.stop());
await tab.close();
tab = await open();
await tab.evaluate(helpers);
await start(tab);
await tab.evaluate(() => window.Fantasy.stop());
check('stop(): the page is restored byte for byte, no Fantasy sheets left', await tab.evaluate(p => document.body.innerHTML === p
  && !document.querySelector('style[data-iw-fantasy-style]'), pristine));
check('stop(): emoji are back', await tab.evaluate(() => emojiWidth(document.querySelector('.iw-skill-tab-icon')) > 8));
check('stop(): the material highlights are released', await tab.evaluate(() => !CSS.highlights.has('iwf-material-met') && !CSS.highlights.has('iwf-material-short')));
await tab.close();

/* ── 7b. daily boost + running fill ───────────────────────────────────── */

tab = await open();
await tab.evaluate(helpers);
await start(tab);
const waitFrames = (n = 3) => frames(tab, n);
const boost = await tab.evaluate(() => [...document.querySelectorAll('.iw-skill-tab')]
  .filter(t => t.getAttribute('data-iw-fantasy-boost') === 'daily').map(t => t.getAttribute('data-iw-fantasy-skill')).sort().join());
check('boost: the three skills the boost line names are marked', boost === 'gathering,smithing,tailoring', boost);
const halo = await tab.evaluate(() => {
  const on = getComputedStyle(document.querySelector('.iw-skill-tab[data-iw-fantasy-skill="smithing"]'), '::after');
  const off = getComputedStyle(document.querySelector('.iw-skill-tab[data-iw-fantasy-skill="mining"]'), '::after');
  return { anim: on.animationName, z: on.zIndex, shadow: on.boxShadow, off: off.content };
});
check('boost: a marked tile has a still underglow, an unmarked one none', halo.anim === 'none' && halo.z === '-1' && /rgb|color\(/.test(halo.shadow) && !/inset/.test(halo.shadow) && halo.off === 'none', JSON.stringify(halo));
// Painted, not just computed: the glow shows past the tile's foot and never
// over the tile itself. Gathering is boosted and carries no ticking live dot.
const glowShots = async () => {
  const box = await tab.locator('.iw-skill-tab[data-iw-fantasy-skill="gathering"]').boundingBox();
  return {
    inside: await tab.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width: box.width - 8, height: box.height - 8 } }),
    below: await tab.screenshot({ clip: { x: box.x + 8, y: box.y + box.height + 1, width: box.width - 16, height: 6 } }),
  };
};
const glowOn = await glowShots();
await tab.evaluate(() => document.querySelector('.iw-skill-tab[data-iw-fantasy-skill="gathering"]').removeAttribute('data-iw-fantasy-boost'));
await waitFrames();
const glowOff = await glowShots();
await tab.evaluate(() => document.querySelector('.iw-skill-tab[data-iw-fantasy-skill="gathering"]').setAttribute('data-iw-fantasy-boost', 'daily'));
await waitFrames();
check('boost: the underglow paints below the tile (negative control: unmarked differs there)', !glowOn.below.equals(glowOff.below));
check('boost: nothing is painted over the tile itself', glowOn.inside.equals(glowOff.inside));
await tab.addStyleTag({ content: '#iwf-neg, .iw-skill-tab[data-iw-fantasy-boost]::after { z-index: 4 !important; box-shadow: inset 0 0 20px #86efac !important; }' });
await waitFrames();
const glowOver = await glowShots();
await tab.evaluate(() => document.querySelectorAll('style:not([data-iw-fantasy-style])').forEach(s => s.textContent.includes('#iwf-neg') && s.remove()));
await waitFrames();
check('negative control: a glow raised over the tile is caught', !glowOver.inside.equals(glowOff.inside));
await tab.evaluate(() => {
  const line = document.querySelector('[data-iw-skill-boost]').firstChild;
  line.textContent = 'Daily XP Boost: Mining + 20 % XP';
});
await settle(tab);
const boost2 = await tab.evaluate(() => [...document.querySelectorAll('[data-iw-fantasy-boost]')].map(t => t.getAttribute('data-iw-fantasy-skill')).join());
check('boost: a text tick on the boost line moves the halo (negative control: the old three lose it)', boost2 === 'mining', boost2);

const runState = () => tab.evaluate(() => {
  const panel = document.querySelector('.iw-skill-tabs').closest('.panel');
  const row = document.querySelector('.iw-ss-row.is-running') || document.querySelector('[data-was-running]');
  const tile = document.querySelector('.iw-skill-tab:has(> .iw-skill-tab-live)');
  return {
    attr: panel.getAttribute('data-iw-fantasy-run'),
    rowRun: getComputedStyle(row).getPropertyValue('--iwf-run').trim(),
    rowSize: getComputedStyle(row).backgroundSize.split(',')[0].trim().split(' ')[0],
    tileRun: getComputedStyle(tile).getPropertyValue('--iwf-tile-run').trim(),
    tileSize: getComputedStyle(tile).backgroundSize.split(',')[0].trim().split(' ')[0],
    tileLayers: getComputedStyle(tile).backgroundSize.split(',').length,
  };
});
const before = await runState();
check('run: no Current Action bar, no fill (the row keeps its look)', before.attr === null && before.rowRun === '' && before.tileLayers === 3, JSON.stringify(before));
await tab.evaluate(() => document.body.insertAdjacentHTML('beforeend',
  '<div id="current-action-panel" class="panel"><div class="h-2 overflow-hidden rounded-full"><div class="h-full" style="width: 37.2%;"></div></div></div>'));
await settle(tab); await tab.waitForTimeout(400);
const onRow = await runState();
check('run: the panel copies the Current Action bar to the half percent', onRow.attr === '37', JSON.stringify(onRow));
check('run: the running row fills to the bar', onRow.rowRun === '37%' && onRow.rowSize === '37%', JSON.stringify(onRow));
check('run: while the row shows, the running tile holds no fill', onRow.tileRun === '' && onRow.tileSize === '0%' && onRow.tileLayers === 5, JSON.stringify(onRow));
await tab.evaluate(() => { const row = document.querySelector('.iw-ss-row.is-running'); row.setAttribute('data-was-running', ''); row.classList.remove('is-running'); });
await settle(tab); await tab.waitForTimeout(400);
const onTile = await runState();
check('run: no running row on screen, the running tile takes the same fill', onTile.tileRun === '37%' && onTile.tileSize === '37%', JSON.stringify(onTile));
await tab.evaluate(() => document.querySelector('[data-was-running]').classList.add('is-running'));
await settle(tab); await tab.waitForTimeout(400);
const back = await runState();
check('run: the row back on screen takes the fill back from the tile', back.rowSize === '37%' && back.tileSize === '0%', JSON.stringify(back));

const reset = await tab.evaluate(async () => {
  const fill = document.querySelector('#current-action-panel [style]'); const panel = document.querySelector('.iw-skill-tabs').closest('.panel');
  const seen = []; const frame = () => new Promise(r => requestAnimationFrame(r));
  fill.style.width = '80%'; for (let i = 0; i < 3; i++) await frame();
  fill.style.width = '4%';
  for (let i = 0; i < 5; i++) { await frame(); seen.push(panel.getAttribute('data-iw-fantasy-run-reset')); }
  return { seen, value: panel.getAttribute('data-iw-fantasy-run') };
});
check('run: a completion is tagged for a frame, then released', reset.seen.includes('1') && reset.seen.at(-1) === null && reset.value === '4', JSON.stringify(reset));
const forward = await tab.evaluate(async () => {
  const fill = document.querySelector('#current-action-panel [style]'); const panel = document.querySelector('.iw-skill-tabs').closest('.panel');
  const seen = []; const frame = () => new Promise(r => requestAnimationFrame(r));
  fill.style.width = '12%';
  for (let i = 0; i < 4; i++) { await frame(); seen.push(panel.getAttribute('data-iw-fantasy-run-reset')); }
  return seen;
});
check('negative control: a forward step is never tagged as a completion', forward.every(v => v === null), JSON.stringify(forward));

const tick = await tab.evaluate(async () => {
  const fill = document.querySelector('#current-action-panel [style]');
  const sheet = () => document.querySelector('style[data-iw-fantasy-style="run-tick"]')?.textContent || '';
  fill.style.width = '20%'; await new Promise(r => setTimeout(r, 400));
  for (const w of [24, 28, 32, 36, 40, 44]) { fill.style.width = `${w}%`; await new Promise(r => setTimeout(r, 400)); }
  const m = sheet().match(/--iwf-run-tick:(\d+)ms/);
  return { ms: m ? +m[1] : null };
});
check('run: the transition lasts one measured reading gap (400ms x 1.12)', tick.ms > 400 && tick.ms < 560, JSON.stringify(tick));

await tab.evaluate(() => document.getElementById('current-action-panel').remove());
await settle(tab);
const gone = await runState();
check('negative control: the bar gone, the fill and its tag are gone', gone.attr === null && gone.tileLayers === 3, JSON.stringify(gone));
await tab.evaluate(() => window.Fantasy.stop());
const left = await tab.evaluate(() => ({
  marks: document.querySelectorAll('[data-iw-fantasy-boost], [data-iw-fantasy-run], [data-iw-fantasy-run-reset]').length,
  sheet: !!document.querySelector('style[data-iw-fantasy-style="run-tick"]'),
}));
check('stop(): boost and run marks and the tick sheet are removed', left.marks === 0 && !left.sheet, JSON.stringify(left));
await tab.close();

/* ── 7c. the action queue copy ────────────────────────────────────────── */

const queued = await readFile(resolve(ROOT, 'tests/fixtures/current-action-2026-10-08/queued.html'), 'utf8');
const idleCa = await readFile(resolve(ROOT, 'tests/fixtures/current-action-2026-10-08/idle.html'), 'utf8');
tab = await open();
await tab.evaluate(helpers);
await start(tab);
check('queue: no Current Action panel, no copy', await tab.evaluate(() => !document.querySelector('.iwf-queue')));
await tab.evaluate(html => {
  document.body.insertAdjacentHTML('beforeend', `<div id="ca-host">${html}</div>`);
  // Record every press the copy hands to the game's own controls.
  window.pressed = [];
  const panel = document.getElementById('current-action-panel');
  panel.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pressed.push(b.getAttribute('aria-label') || b.textContent.trim()); });
  for (const type of ['dragstart', 'drop']) panel.addEventListener(type, e => {
    const rows = [...panel.querySelectorAll('[draggable="true"]')];
    pressed.push(`${type}:${rows.indexOf(e.target.closest('[draggable="true"]'))}:${!!e.dataTransfer}`);
  });
}, queued);
await settle(tab);
const q = await tab.evaluate(() => {
  const frame = document.querySelector('.iwf-queue');
  const sheet = document.querySelector('.iw-skill-sheet');
  return {
    afterSheet: sheet.nextElementSibling === frame,
    owned: frame?.hasAttribute('data-iw-fantasy-owned'),
    hidden: getComputedStyle(document.getElementById('current-action-panel')).display === 'none',
    text: frame?.textContent,
    cancel: !frame?.querySelector('.iwf-q-cancel').hidden,
    count: frame?.querySelector('.iwf-q-count').textContent,
    rows: [...frame.querySelectorAll('.iwf-q-row')].map(r => [r.querySelector('.iwf-q-name').firstChild.data, r.querySelector('.iwf-q-times').textContent, r.querySelector('.iwf-q-eta').textContent, r.getAttribute('data-iw-fantasy-skill')]),
    icon: getComputedStyle(frame.querySelector('.iwf-q-row .iwf-q-icon')).backgroundImage,
    more: [...frame.querySelectorAll('.iwf-q-more')].map(b => b.textContent),
  };
});
check('queue: the copy sits right after the sheet, owned', q.afterSheet && q.owned, JSON.stringify(q));
check('queue: the Current Action panel is hidden while the copy shows', q.hidden);
check('queue: the running action is not copied, only its cancel', !/crafts left|4s/.test(q.text) && q.cancel && q.rows.length === 3, JSON.stringify(q));
check('queue: every queued row, with count, time and discipline', JSON.stringify(q.rows) === JSON.stringify([
  ['Mine Sunforged', '×5', '~1m 30s', 'mining'], ['Smith Astral Bar', '', '', 'smithing'], ['Fight Phoenixes', '×20', '~6m 40s', 'combat']]), JSON.stringify(q.rows));
check('queue: a row paints its discipline medallion', /skills_icons_atlas/.test(q.icon), q.icon);
check('queue: the list toggle and the count are carried', q.more.join() === '+1 more queued' && q.count === '3 queued', JSON.stringify(q));

await tab.evaluate(async () => {
  const frame = document.querySelector('.iwf-queue');
  frame.querySelectorAll('.iwf-q-row')[1].querySelector('.iwf-q-x').click();
  frame.querySelector('.iwf-q-cancel').click();
  frame.querySelector('.iwf-q-more').click();
  const rows = frame.querySelectorAll('.iwf-q-row');
  const dt = new DataTransfer();
  rows[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  rows[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
});
const presses = await tab.evaluate(() => pressed);
check('queue: remove, cancel and the toggle press the game\'s own buttons', presses.slice(0, 3).join('|') === 'Remove Smith Astral Bar from queue|Cancel current action|+1 more queued', presses.join('|'));
check('queue: a drop on the copy replays the drag on the game\'s rows', presses.includes('dragstart:0:true') && presses.includes('drop:2:true'), presses.join('|'));

const ticked = await tab.evaluate(async () => {
  const span = document.querySelector('#current-action-panel [draggable="true"] span');
  span.lastChild.data = span.lastChild.data.replace('30s', '29s');
  [...document.querySelectorAll('#current-action-panel [draggable="true"]')][2].remove();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
  const frame = document.querySelector('.iwf-queue');
  return { eta: frame.querySelector('.iwf-q-eta').textContent, rows: frame.querySelectorAll('.iwf-q-row').length };
});
check('queue: the copy follows the game (a ticking time, a row gone)', ticked.eta === '~1m 29s' && ticked.rows === 2, JSON.stringify(ticked));

const collapsed = await tab.evaluate(async () => {
  const panel = document.querySelector('.iw-skill-tabs').closest('.panel');
  panel.setAttribute('data-iw-collapsed', '1');
  const shown = getComputedStyle(document.getElementById('current-action-panel')).display !== 'none';
  panel.removeAttribute('data-iw-collapsed');
  return shown;
});
check('negative control: Skill Actions collapsed, the game\'s panel is back', collapsed);

await tab.evaluate(html => { document.getElementById('ca-host').innerHTML = html; }, idleCa);
await settle(tab);
const idleQ = await tab.evaluate(() => {
  const frame = document.querySelector('.iwf-queue');
  return { count: frame.querySelector('.iwf-q-count').textContent, text: frame.textContent,
    rows: frame.querySelectorAll('.iwf-q-row').length, cancel: frame.querySelector('.iwf-q-cancel').hidden, more: frame.querySelector('.iwf-q-toggles').hidden };
});
check('queue: idle, nothing queued and no cancel', idleQ.count === 'Nothing queued' && !/Choose one skill row/.test(idleQ.text) && idleQ.rows === 0 && idleQ.cancel && idleQ.more, JSON.stringify(idleQ));

await tab.evaluate(() => window.Fantasy.stop());
const queueLeft = await tab.evaluate(() => ({
  frames: document.querySelectorAll('.iwf-queue').length,
  tag: document.querySelectorAll('[data-iw-fantasy-queue]').length,
  shown: getComputedStyle(document.getElementById('current-action-panel')).display !== 'none',
}));
check('stop(): the copy is gone and the game\'s panel is back', queueLeft.frames === 0 && queueLeft.tag === 0 && queueLeft.shown, JSON.stringify(queueLeft));
await tab.close();

/* ── 8. stand-down ────────────────────────────────────────────────────── */

tab = await open({ extraHead: '<link rel="stylesheet" href="/reskin-bc/theme/extra.css">' });
await tab.evaluate(helpers);
await tab.evaluate(() => window.Fantasy.start());
await settle(tab); await tab.waitForTimeout(300); await settle(tab);
const down = await tab.evaluate(() => ({
  quests: !!document.querySelector('style[data-iw-fantasy-style="quests"]'),
  skills: !!document.querySelector('style[data-iw-fantasy-style="skills"]'),
  boardMarks: document.querySelectorAll('.iw-wo-board [data-iw-fantasy-skill], .iw-wo-board [data-iw-fantasy-icon], .iw-wo-board [data-iw-fantasy-lead]').length,
  sheetMarks: document.querySelectorAll('.iw-skill-tabs [data-iw-fantasy-skill]').length,
  emoji: emojiWidth(document.querySelector('.iw-wo-item')),
}));
check('stand-down: a port sheet styling .iw-wo- retires the board reskin only', !down.quests && down.skills && down.boardMarks === 0 && down.sheetMarks === 10 && down.emoji > 8, JSON.stringify(down));
await tab.evaluate(() => window.Fantasy.stop());
await tab.close();

/* Zone travel is a small native shortcut, visually secondary to the header.
   Exercise both directions and the native dismiss/disabled controls using
   the game's own iw-ss-zone markup and inline stylesheet from the capture. */
for (const [width, nativeSheet] of [[320,false], [390,false], [768,false], [1440,false], [390,true]]) {
  tab = await open({width, extraHead: nativeSheet ? '<link rel="stylesheet" href="/reskin-bc/theme/extra-skills.css">' : ''});
  await tab.evaluate(() => {
    const sheet = document.querySelector('.iw-skill-sheet');
    sheet.insertAdjacentHTML('beforeend', `<div class="iw-ss-banner" id="zone-shortcut"><div class="iw-ss-zone"><span class="iw-ss-zone-icon" aria-hidden="true">🧭</span><div class="iw-ss-zone-text"><b>Ready for the next zone</b><small>Astral Crucible · ATK 325 / DEF 332</small></div><button class="iw-ss-zone-go" id="shortcut-go">Next Zone</button></div><button class="iw-ss-x" aria-label="Dismiss zone shortcut">×</button></div><div class="iw-ss-zone is-down"><span class="iw-ss-zone-icon" aria-hidden="true">🧭</span><div class="iw-ss-zone-text"><b>Try an earlier zone</b><small>Requires a lower level</small></div><button class="iw-ss-zone-go" disabled>Previous Zone</button></div>`);
    window.shortcutNodes = [...sheet.querySelectorAll('.iw-ss-zone, .iw-ss-zone *')];
    window.shortcutPresses = 0; window.shortcutDismisses = 0;
    document.querySelector('#shortcut-go').onclick = () => shortcutPresses++;
    document.querySelector('#zone-shortcut .iw-ss-x').onclick = () => shortcutDismisses++;
  });
  const before = await tab.locator('.iw-skill-sheet').innerHTML();
  await start(tab);
  if (nativeSheet) {
    check('native skill theme: the full sheet reskin stands down', await tab.locator('style[data-iw-fantasy-style="skills"]').count()===0);
    check('native skill theme: material highlights stand down with it', await tab.evaluate(() => !CSS.highlights.has('iwf-material-met') && !CSS.highlights.has('iwf-material-short')));
    const cards = await tab.locator('.iw-skill-tabs').evaluate(strip => ({
      columns: getComputedStyle(strip).gridTemplateColumns.split(' ').length,
      slots: strip.querySelectorAll('.iwf-skill-reserved').length,
      art: getComputedStyle(strip.querySelector('.iw-skill-tab')).backgroundImage,
      marks: strip.querySelectorAll('.iw-skill-tab[data-iw-fantasy-skill][data-iw-fantasy-pct]').length,
    }));
    check('native skill theme: custom card art, four columns, XP rings and Reserved slots remain active',
      cards.columns === 4 && cards.slots === 2 && cards.marks === 10 && /soft-iron-card-v1/.test(cards.art), JSON.stringify(cards));
  }
  const shortcuts = await tab.locator('.iw-ss-zone').evaluateAll(els => els.map(el => {
    const button = el.querySelector('button'); const css = getComputedStyle(button);
    const box = el.getBoundingClientRect(), btn = button.getBoundingClientRect();
    return {height:box.height, buttonHeight:btn.height, buttonWidth:btn.width, font:parseFloat(css.fontSize), image:css.backgroundImage, shadow:css.boxShadow, spill:btn.right>box.right+.5||btn.left<box.left-.5};
  }));
  check(`${width}px${nativeSheet?' native theme':''}: zone shortcuts are compact, flat and inside the skill sheet`, shortcuts.every(s => s.height<=76 && s.buttonHeight>=28 && s.buttonHeight<=36 && s.buttonWidth<=110 && s.font<=12 && s.image==='none' && s.shadow==='none' && !s.spill), JSON.stringify(shortcuts));
  await tab.locator('#shortcut-go').click();
  await tab.getByRole('button',{name:'Dismiss zone shortcut',exact:true}).click();
  check(`${width}px: shortcut travel/dismiss retain their original handlers and nodes`, await tab.evaluate(() => shortcutPresses===1 && shortcutDismisses===1 && shortcutNodes.every(el=>el.isConnected)));
  check(`${width}px: unavailable shortcut stays disabled`, await tab.getByRole('button',{name:'Previous Zone',exact:true}).isDisabled());
  await tab.keyboard.press('Tab');
  await tab.locator('#shortcut-go').focus();
  check(`${width}px: keyboard focus remains visible`, await tab.locator('#shortcut-go').evaluate(el => getComputedStyle(el).outlineStyle !== 'none'));
  check(`${width}px: shortcut focus uses Ashen brass rather than the current zone tint`, await tab.locator('#shortcut-go').evaluate(el => getComputedStyle(el).outlineColor === 'rgb(212, 173, 99)'));
  await tab.evaluate(() => Fantasy.stop());
  check(`${width}px: shortcut markup restores exactly on stop`, await tab.locator('.iw-skill-sheet').innerHTML()===before);
  await start(tab);
  await mkdir(resolve(ROOT,'tmp/thumb-dock'),{recursive:true});
  await tab.locator('.iw-skill-sheet').screenshot({path:resolve(ROOT,`tmp/thumb-dock/skill-shortcuts-${width}${nativeSheet?'-native':''}.png`)});
  await tab.close();
}

/* ── 10. phone width ──────────────────────────────────────────────────── */

for (const width of [320, 390, 1606]) {
  tab = await open({ width, bootEntry: true, extraHead: '<link rel="stylesheet" href="/reskin-bc/theme/extra-skills.css">' });
  await settle(tab);
  const boot = await tab.locator('.iw-skill-tabs').evaluate(strip => ({
    columns: getComputedStyle(strip).gridTemplateColumns.split(' ').length,
    art: getComputedStyle(strip.querySelector('.iw-skill-tab')).backgroundImage,
    slots: [...strip.querySelectorAll('.iwf-skill-reserved')].filter(el => el.getBoundingClientRect().width > 0).length,
    hydrated: !document.documentElement.hasAttribute('data-iw-page-hydrated'),
    legacy: document.querySelectorAll('style[data-iw-style]').length,
    nativeSheet: !document.querySelector('style[data-iw-fantasy-style="skills"]'),
  }));
  check(`${width}px: rebuilt entry point boots Fantasy cards over native sheet CSS`, boot.columns === (width <= 768 ? 4 : 5)
    && boot.slots === (width <= 768 ? 2 : 0) && /soft-iron-card-v1/.test(boot.art) && boot.hydrated && boot.legacy === 0 && boot.nativeSheet, JSON.stringify(boot));
  // Older native/inline card rules may remain on the live page and arrive
  // after our styles. Asset-load tests alone miss this cascade regression.
  await tab.addStyleTag({ content: previousCardsCss });
  await settle(tab);
  const cascade = await tab.locator('.iw-skill-tabs').evaluate(strip => [...strip.querySelectorAll('.iw-skill-tab')].map(card => {
    const name = card.querySelector('.iw-skill-tab-name'), css = getComputedStyle(name);
    const range = document.createRange(); range.selectNodeContents(name);
    return { name: name.textContent, art: getComputedStyle(card).backgroundImage,
      font: parseFloat(css.fontSize), generatedName: getComputedStyle(name, '::before').content,
      oneLine: range.getClientRects().length === 1 && range.getBoundingClientRect().width <= name.getBoundingClientRect().width + .5 };
  }));
  check(`${width}px: every real card keeps Soft Iron after old card CSS loads late`, cascade.every(c => /soft-iron-card-v1/.test(c.art)), JSON.stringify(cascade.map(c => ({name:c.name,art:c.art}))));
  check(`${width}px: old generated labels cannot replace or split the real names`, cascade.every(c => c.font >= (width <= 768 ? 6 : 9) && ['none','normal'].includes(c.generatedName) && c.oneLine), JSON.stringify(cascade));
  const paintedAssets = await tab.locator('.iw-skill-tabs').evaluate(async strip => {
    const images = [...strip.querySelectorAll('.iw-skill-tab, .iwf-skill-reserved')].flatMap(card =>
      [card, card.querySelector('.iw-skill-tab-icon')].flatMap(el =>
        [...getComputedStyle(el).backgroundImage.matchAll(/url\("([^"]+)"\)/g)].map(m => m[1])));
    return Promise.all([...new Set(images)].map(async url => {
      const image = new Image(); image.src = url;
      try { await image.decode(); return { url, loaded: true }; }
      catch { return { url, loaded: false }; }
    }));
  });
  check(`${width}px: card art and every medallion load from the extension even after old CSS`,
    paintedAssets.length === 4 && paintedAssets.every(a => a.loaded && a.url.startsWith('http://iw.test/__extension__/assets/')),
    JSON.stringify(paintedAssets));
  await mkdir(resolve(ROOT, 'tmp/skill-cards-soft-iron'), { recursive: true });
  await tab.locator('.iw-skill-tabs').screenshot({path:resolve(ROOT, `tmp/skill-cards-soft-iron/native-cascade-${width}.png`)});
  await tab.evaluate(() => extensionSettingListeners.forEach(fn => fn({ 'iw-skin-enabled': { newValue: false } }, 'local')));
  await settle(tab);
  check(`${width}px: rebuilt entry point disables cleanly after native handover`, await tab.locator('.iw-skill-tabs').evaluate(strip =>
    strip.innerHTML === beforeBootstrapTabs && !document.querySelector('style[data-iw-fantasy-style]')));
  await tab.close();
}

for (const width of [320, 360, 390, 430, 768, 1024, 1606]) {
  tab = await open({ width });
  await tab.evaluate(helpers);
  const originalTabs = await tab.locator('.iw-skill-tabs').innerHTML();
  await tab.evaluate(() => {
    window.gameSkillTabs = [...document.querySelectorAll('.iw-skill-tab')];
    window.skillPresses = 0;
    gameSkillTabs[0].addEventListener('click', () => skillPresses++);
  });
  await start(tab);
  const skillLayout = await tab.locator('.iw-skill-tabs').evaluate(strip => {
    const reserved = [...strip.querySelectorAll('.iwf-skill-reserved')];
    const visible = [...strip.children].filter(el => el.getBoundingClientRect().width > 0);
    const rows = new Map();
    for (const el of visible) {
      const y = Math.round(el.getBoundingClientRect().top);
      rows.set(y, (rows.get(y) || 0) + 1);
    }
    const names = visible.map(el => {
      const name = el.querySelector('.iw-skill-tab-name');
      const range = document.createRange(); range.selectNodeContents(name);
      const box = name.getBoundingClientRect(), text = range.getBoundingClientRect();
      const css = getComputedStyle(name), fontSize = parseFloat(css.fontSize);
      const replacement = getComputedStyle(name, '::before').content;
      return { text: name.textContent, fontSize, replacement, lines: range.getClientRects().length,
        family: css.fontFamily, weight: css.fontWeight, caps: css.textTransform,
        transform: css.transform, scale: css.scale,
        fits: text.width <= box.width + .5 && name.scrollWidth <= name.clientWidth + 1 && box.height <= fontSize * 1.3 };
    });
    return {
      rows: [...rows.values()], names,
      art: getComputedStyle(strip.querySelector('.iw-skill-tab')).backgroundImage,
      reserved: reserved.map(el => ({ name: el.querySelector('.iw-skill-tab-name')?.textContent,
        disabled: el.getAttribute('aria-disabled') === 'true', focusable: el.tabIndex >= 0,
        dim: +getComputedStyle(el).opacity < .6, owned: el.hasAttribute('data-iw-fantasy-owned') })),
      originalsKept: gameSkillTabs.every((el, index) => el === strip.querySelectorAll('.iw-skill-tab')[index]),
    };
  });
  check(`${width}px: skill cards use ${width <= 768 ? '4/4/4 with Reserved slots' : 'the original desktop 5/5'}`,
    JSON.stringify(skillLayout.rows) === JSON.stringify(width <= 768 ? [4,4,4] : [5,5]), JSON.stringify(skillLayout.rows));
  check(`${width}px: every full skill name fits on one line`, skillLayout.names.every(n => n.lines === 1 && n.fits && n.fontSize >= (width <= 768 ? 6 : 9) && ['none', 'normal'].includes(n.replacement)), JSON.stringify(skillLayout.names));
  check(`${width}px: uppercase skill names use desktop Cinzel without warping`, skillLayout.names.every(n => n.family.includes('Cinzel') && n.weight === '700' && n.caps === 'uppercase' && n.transform === 'none' && n.scale === 'none'), JSON.stringify(skillLayout.names));
  check(`${width}px: both Reserved slots are dim, disabled, owned and outside keyboard navigation`,
    skillLayout.reserved.length === 2 && skillLayout.reserved.every(s => s.name === 'Reserved' && s.disabled && !s.focusable && s.dim && s.owned), JSON.stringify(skillLayout.reserved));
  check(`${width}px: skill cards load the approved Soft Iron art`, /soft-iron-card-v1\.webp/.test(skillLayout.art) && assetHits.has('/assets/skills-ui/soft-iron-card-v1.webp'), skillLayout.art);
  await tab.locator('.iw-skill-tab').first().click();
  check(`${width}px: gameplay skill nodes and click handlers stay intact`, skillLayout.originalsKept && await tab.evaluate(() => skillPresses === 1));
  // A normal game rerender must neither duplicate the owned slots nor leave
  // them in front of real skill cards React appended after them.
  await tab.evaluate(() => {
    const strip = document.querySelector('.iw-skill-tabs');
    strip.append(gameSkillTabs.at(-1));
  });
  await settle(tab);
  check(`${width}px: Reserved slots stay unique at the end after a rerender`, await tab.locator('.iw-skill-tabs').evaluate(strip =>
    strip.querySelectorAll('.iwf-skill-reserved').length === 2 && [...strip.children].slice(-2).every(el => el.matches('.iwf-skill-reserved'))));
  await mkdir(resolve(ROOT, 'tmp/skill-cards-soft-iron'), { recursive: true });
  await tab.locator('.iw-skill-tabs').screenshot({ path: resolve(ROOT, `tmp/skill-cards-soft-iron/skills-${width}.png`) });
  const layout = await tab.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    spill: [...document.querySelectorAll('.iw-skill-tab, .iw-ss-head, .iw-ss-group-head, .iw-ss-row, .iw-wo-tile')]
      .filter(el => { const p = el.closest('.panel').getBoundingClientRect(); const r = el.getBoundingClientRect(); return r.right > p.right + 0.5 || r.left < p.left - 0.5; }).length,
    emoji: [...document.querySelectorAll('.iw-skill-tab-icon, .iw-wo-item, .iw-wo-skill')].map(emojiWidth).filter(w => w > 0).length,
  }));
  check(`${width}px: nothing spills its panel, no stray emoji`, layout.spill === 0 && layout.emoji === 0, JSON.stringify(layout));
  await tab.evaluate(() => window.Fantasy.stop());
  check(`${width}px: skill strip restores exactly on stop`, await tab.locator('.iw-skill-tabs').innerHTML() === originalTabs);
  await tab.close();
}

await browser.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nfantasy-skills: all checks passed');
