/* Geometry audit for the WHOLE skill-card system, not one card.
 *
 * Renders the five live shapes from the 2026-09 capture — Combat, Mining,
 * Smithing, Herbalism, Alchemy — on the real dist bundle over an http origin,
 * then reports the numbers the redesign is judged on: card heights, the three
 * column widths, whether the progress ring is concentric with the icon it
 * surrounds, where the level / percent / discipline name actually land, and
 * every pair of visible boxes that overlap.
 *
 * Usage: node claude/probe-skill-cards.mjs [width] [--reference] [--shot path]
 *   shapes:  --nest-title  --bare-command (button IS the command zone)  --wrap-command
 *            --active (Woodcutting running at 40%, Spellcrafting starting)  --text-pager
 *   theme:   --zone N
 *   measure: --rows <id>  --ink  --capture (runs claude/capture-skill-cards.js here)
 *            --zoom-cmd <id,id> (writes tmp/zoom-cmd-<id>.png)
 *   stress:  --tick  --host-glyph-height (a host style + a button state change: the
 *            re-decision that dropped Smithing and Alchemy to the old theme)  --orphan-glyph
 */
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const WIDTH = Number(process.argv[2]) || 1100;
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const SHOT = arg('--shot');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The five live shapes from the 2026-09 capture, chosen to span the range the
   card system has to hold: a gathering skill with no materials at all, two
   with a single material, and CONSTRUCTION with six and five-digit
   quantities, which is the stress test — if its collapsed card is not the same
   height as the others, the summary is not doing its job. `pager` names WHICH
   BRANCH the arrows ship in, because a flex `order` means different things in
   the two. A material line MUST carry an N/M count or SkillPanelRenderer
   builds no ingredient grid and the whole materials surface vanishes. */
const SAMPLE_CARDS = [
  { id: 'jewelcrafting', icon: '&#128142;', skill: 'Jewelcrafting', lv: 70, pct: '41.1',
    title: 'Prospect Moonsteel Ore', verb: 'Prospect', base: 677, pager: 'content',
    lines: ['&bull; Moonsteel Ore 58097/2'] },
  { id: 'spellcrafting', icon: '&#10024;', skill: 'Spellcrafting', lv: 60, pct: '64',
    title: 'Harvest Moonsteel Mana', verb: 'Gather', base: 124, pager: 'content', lines: [] },
  { id: 'tailoring', icon: '&#129525;', skill: 'Tailoring', lv: 54, pct: '86',
    title: 'Weave Moonsilk Cloth', verb: 'Weave', base: 1008, pager: 'commands',
    lines: ['&bull; Moonsilk 0/8', 'Requires Tailoring Lv 49'] },
  { id: 'woodcutting', icon: '&#127794;', skill: 'Woodcutting', lv: 63, pct: '39.8',
    title: 'Chop Moonwood', verb: 'Chop', base: 154, pager: null, lines: [] },
  { id: 'construction', icon: '&#127959;', skill: 'Construction', lv: 56, pct: '55.9',
    title: 'Assemble Moonsteel Arboretum', verb: 'Assemble', base: 252, pager: 'content',
    lines: ['&bull; Moonsteel Building Parts 1220/2800 &bull; Moonwood 35940/19600 '
            + '&bull; Moonsteel Ore 58097/9800 &bull; Mythril Building Parts 152/200 '
            + '&bull; Aethersteel Building Parts 1/400 &bull; Bloodstone Building Parts 0/520',
            'Missing materials &mdash; will queue (gather first)',
            '<p class="text-red-400">Requires Construction Lv 80 and Woodcutting Lv 70</p>'] },
];
const CARDS = process.argv.includes('--reference') ? [
  {id:'combat',icon:'&#9876;',skill:'Combat',lv:63,pct:'52.1',title:'Fight Nightstalkers',verb:'Fight',base:70,pager:null,lines:['Recommended ATK 149 &bull; DEF 139']},
  {id:'mining',icon:'&#9935;',skill:'Mining',lv:70,pct:'45.3',title:'Mine Moonsteel',verb:'Mine',base:154,pager:null,lines:['Requires Mining Lv 53']},
  {id:'smithing',icon:'&#9874;',skill:'Smithing',lv:'57+2',pct:'77.2',title:'Smelt Moonsteel Bars',verb:'Smelt',base:1008,pager:'commands',lines:['&bull; Moonsteel Ore 42454/8','Requires Smithing Lv 53']},
  {id:'herbalism',icon:'&#127807;',skill:'Herbalism',lv:'64+2',pct:'12.4',title:'Gather Moonshade',verb:'Gather',base:154,pager:'content',lines:['Requires Herbalism Lv 53','Gather Moonshade from the ether']},
  {id:'alchemy',icon:'&#129514;',skill:'Alchemy',lv:'63+2',pct:'35.6',title:'Brew Moonsteel ATK Potion',verb:'Brew',base:504,pager:'commands',lines:['&bull; Moonshade 0/3','Requires Alchemy Lv 53','Missing materials &mdash; will queue (gather first)']},
  {...SAMPLE_CARDS[4],lines:[...SAMPLE_CARDS[4].lines,'Requires Construction Lv 53 and Woodcutting Lv 49']},
] : SAMPLE_CARDS;

/* `pager` names WHICH BRANCH the recipe arrows are shipped in, not merely that
   they exist. The live cards render them inside the CONTENT branch, and a
   fixture that always put them in the command branch is why they read as
   correct locally while floating mid-card live: the rule that places them is a
   flex `order`, and order means two different things in the two branches. */
/* --live-construction: the live Construction card, title and button verb as the game ships them. */
if (process.argv.includes('--live-construction')) CARDS.forEach(c => { if (c.id === 'construction') { c.verb = 'Craft Parts'; c.title = 'Craft Sunforged Building Parts'; } });
/* The live pager's arrows are Lucide SVGs (`h-4 w-4`), not text - read from the
   deployed chunk. A 16px svg is a real flex item beside the CSS chevron, which
   a `&lsaquo;` at font-size 0 never is. `--text-pager` keeps the old shape. */
const LUCIDE = d => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide h-4 w-4" style="display:block;width:16px;height:16px"><path d="${d}"/></svg>`;
/* The live action button wraps its label in `span.relative.z-10` and, while the
   skill runs, adds `span.absolute.inset-0.bg-black/15` at the progress width.
   `--active` runs Woodcutting at 40% and puts Spellcrafting in its 100%
   `animate-pulse` starting state. */
const ACTIVE = process.argv.includes('--active') ? { woodcutting: '<span class="absolute inset-0 bg-black/15" style="width: 40%;"></span>',
  spellcrafting: '<span class="absolute inset-0 animate-pulse bg-black/15" style="width: 100%;"></span>' } : {};
const actionButton = c => `<button><span class="relative z-10">${c.verb}</span>${ACTIVE[c.id] || ''}</button>`;
/* --xp whole|compact|split: the player's XP display format (the game's readout
   cycles through them; Curtis, 2026-09-21). Default is the percent form. */
const XP_FORM = arg('--xp');
const readoutHtml = c => {
  const t = 'title="Click to cycle XP display"';
  if (XP_FORM === 'whole') return `<button ${t}>Lv ${c.lv} &bull; 656,676,891/724,850,867 XP</button>`;
  if (XP_FORM === 'compact') return `<button ${t}>Lv ${c.lv}+2 - 5.24M/99.90M XP</button>`;
  if (XP_FORM === 'split') return `<p ${t}><span>Lv ${c.lv} &bull; </span><span>656,676,891/724,850,867</span><span>XP</span></p>`;
  return `<button ${t}>Lv ${c.lv} - ${c.pct}% &bull; 4,120 to go</button>`;
};
const PAGER_HTML = process.argv.includes('--text-pager') ? '<div><button>&lsaquo;</button><button>&rsaquo;</button></div>'
  : `<div><button>${LUCIDE('m15 18-6-6 6-6')}</button><button>${LUCIDE('m9 18 6-6-6-6')}</button></div>`;
const card = c => `
<div class="compact-panel" id="${c.id}">
  ${process.argv.includes('--shellless') ? '' : '<div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">'}
    <div>${process.argv.includes('--nested') ? '<div>' : ''}<p>${c.icon} ${c.skill}</p><p>LV ${c.lv}</p>${process.argv.includes('--nested') ? '</div>' : ''}</div>
    <div>
      ${process.argv.includes('--nest-title') ? `<div><p>${c.title}</p>${readoutHtml(c)}</div>` : `<p>${c.title}</p>
      ${readoutHtml(c)}`}
      ${c.lines.map(l => l.startsWith('<') ? l : `<p>${l}</p>`).join('\n      ')}
      ${c.pager === 'content' ? PAGER_HTML : ''}
      <p>Base reward: +${c.base} ${c.skill.toLowerCase()} XP/task</p>
      <div><div style="width:${c.pct}%"></div></div>
    </div>
    ${process.argv.includes('--bare-command') && c.pager !== 'commands' ? actionButton(c) : `<div>${process.argv.includes('--wrap-command') ? '<div style="transform:translateZ(0);margin-top:14px;height:calc(100% - 14px)">' : ''}${c.pager === 'commands' ? PAGER_HTML : ''}${actionButton(c)}${process.argv.includes('--wrap-command') ? '</div>' : ''}</div>`}
  ${process.argv.includes('--shellless') ? '' : '</div>'}
</div>`;

const PAGE = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}
.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.z-10{z-index:10}.bg-black\/15{background-color:rgb(0 0 0/.15)}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div><div><button>S</button></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone ${arg('--zone') || 19}: Eternium Verge</p></div>
  <div><button>&#127760; Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
${CARDS.map(card).join('')}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: 1400 },
  deviceScaleFactor: process.argv.includes('--ink') ? 4 : 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname.endsWith('.html') || url.pathname === '/')
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
  try {
    return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream',
      body: await readFile(resolve(ROOT, url.pathname.slice(1))) });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});
await page.goto(`${ORIGIN}/skill-cards.html`, { waitUntil: 'load' });
await page.waitForTimeout(1400);

/* --tick: behave like a live page for a few seconds - the XP readout's digits
   and the progress fill change every 250ms, the way an active skill ticks -
   before anything is measured. A layout that only fails under re-render passes
   is invisible to a static page. */
if (process.argv.includes('--tick')) {
  await page.evaluate(() => new Promise(done => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      for (const card of document.querySelectorAll('.compact-panel')) {
        const readout = [...card.querySelectorAll('button')].find(b => /to go/.test(b.textContent));
        if (readout) readout.textContent = readout.textContent.replace(/[\d,]+ to go/, `${(4120 - n).toLocaleString()} to go`);
        const fill = card.querySelector('div > div[style*="width"]');
        if (fill) fill.style.width = `${(n * 3) % 100}%`;
      }
      if (n >= 16) { clearInterval(t); setTimeout(done, 600); }
    }, 250);
  }));
}

const report = await page.evaluate(ids => {
  const round = n => Math.round(n * 10) / 10;
  const box = el => { const b = el.getBoundingClientRect();
    return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height),
      cx: round(b.x + b.width / 2), cy: round(b.y + b.height / 2) }; };
  /* An element inside a CLIPPED section keeps its real layout rect — the clip
     hides the paint, not the box — so a visibility test that only reads the
     element itself reports six invisible material rows as overlapping. Ask the
     section too. */
  const shown = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || !(Number(s.opacity) > 0)) return false;
    if (!(b.width > 1 && b.height > 1)) return false;
    const section = el.closest('[data-iw-skill-v2-section]');
    if (section && section !== el) {
      const sb = section.getBoundingClientRect();
      if (sb.width <= 2 || sb.height <= 2) return false;
    }
    return true; };

  return ids.map(id => {
    const card = document.querySelector('#' + id);
    if (!card) return { id, missing: true };
    const q = sel => card.querySelector(sel);
    const art = q('.fs-skill-medallion-art');

    /* The ring is a pseudo-element, so its box has to be derived: the computed
       inset plus the host's own rect. A ring that is not concentric with the
       painted icon reads as the single worst defect in the reported capture. */
    /* A pseudo-element's `top`/`left` are resolved against its containing
       block's PADDING box, while getBoundingClientRect() returns the host's
       BORDER box. Ignoring that difference reports a 1px offset on a host with
       a 1px border and makes a perfectly concentric ring look off-centre —
       an instrument error that looks exactly like the defect under test. */
    let ring = null;
    if (art) {
      const s = getComputedStyle(art, '::after');
      const hs = getComputedStyle(art);
      const b = art.getBoundingClientRect();
      const bl = parseFloat(hs.borderLeftWidth) || 0;
      const bt = parseFloat(hs.borderTopWidth) || 0;
      const t = parseFloat(s.top), l = parseFloat(s.left);
      const w = parseFloat(s.width), h = parseFloat(s.height);
      if (s.display !== 'none' && Number.isFinite(w) && Number.isFinite(h)) {
        const rx = b.x + bl + (Number.isFinite(l) ? l : 0);
        const ry = b.y + bt + (Number.isFinite(t) ? t : 0);
        ring = { w: round(w), h: round(h), cx: round(rx + w / 2), cy: round(ry + h / 2),
          weight: s.maskImage || s.webkitMaskImage || '' };
      }
    }

    /* The icon's PAINTED circle is the element's border box plus the outermost
       spread of any NON-inset box-shadow ring — that is the circle a person
       sees, and the one the ring must be concentric with and clear of. */
    let icon = null;
    if (art) {
      const s = getComputedStyle(art);
      const outer = s.boxShadow.split(/,(?![^(]*\))/)
        .filter(part => !/inset/.test(part))
        .map(part => { const n = part.match(/(-?\d+(?:\.\d+)?)px/g) || []; return n.length >= 4 ? parseFloat(n[3]) : 0; })
        .reduce((a, b2) => Math.max(a, b2), 0);
      const b = box(art);
      icon = { ...b, ringHalo: outer, paintedW: round(b.w + outer * 2) };
    }

    const named = {};
    for (const [key, sel] of [
      ['identityZone', '[data-iw-skill-zone="identity"]'],
      ['contentZone', '[data-iw-skill-zone="content"]'],
      ['commandZone', '[data-iw-skill-zone="commands"]'],
      ['title', '[data-iw-skill-role="action-title"]'],
      ['basePlaque', '.fs-skill-base-exp'],
      ['discipline', '[data-iw-skill-role="identity"]'],
      ['levelReadout', '[data-iw-skill-v2-level-readout]'],
      ['actionButton', '[data-iw-skill-role="action-button"]'],
      ['navGroup', '[data-iw-skill-role="nav-group"]'],
      ['glyph', '[data-iw-skill-v2-action-glyph]'],
      ['note', '[data-iw-skill-v2-req-note]'],
      ['materials', '[data-iw-skill-v2-section="materials"]'],
    ]) { const el = q(sel); named[key] = el && shown(el) ? box(el) : (el ? 'hidden' : null); }
    /* Overlap is judged against the material CHIPS, not their grid: the grid
       reserves a right gutter for the toggle, so its box legitimately reaches
       under the control while nothing visible does. */
    const chips = [...card.querySelectorAll('.fs-skill-ingredient-item')].filter(shown).map(box);
    if (chips.length) { delete named.materials; chips.forEach((c, i) => { named['material' + (i + 1)] = c; }); }

    /* Clipping: any element whose own text overflows its padding box. */
    const clipped = [];
    card.querySelectorAll('*').forEach(el => {
      if (!shown(el)) return;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
        clipped.push(`${el.tagName.toLowerCase()}${el.dataset.iwSkillRole ? '[' + el.dataset.iwSkillRole + ']' : ''} ${el.scrollWidth}>${el.clientWidth}`);
    });

    /* Overlaps between the elements a person reads. */
    const probes = Object.entries(named).filter(([, v]) => v && v !== 'hidden');
    const overlaps = [];
    for (let i = 0; i < probes.length; i++) for (let j = i + 1; j < probes.length; j++) {
      const [an, a] = probes[i], [bn, b] = probes[j];
      if (/Zone$/.test(an) || /Zone$/.test(bn)) continue;
      // The action icon is drawn ON its button by design.
      if ([an, bn].includes('glyph') && [an, bn].includes('actionButton')) continue;
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
        overlaps.push(`${an}~${bn}`);
    }

    return { id, card: box(card), icon, ring, named, clipped, overlaps,
      state: card.dataset.iwSkillV2State, layout: card.dataset.iwSkillLayout,
      icon: ((getComputedStyle(card.querySelector('[data-iw-skill-v2-action-glyph]') || card).backgroundImage.match(/action-icons\/([a-z]+)\.svg/) || [])[1]) || 'none' };
  });
}, CARDS.map(c => c.id));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n### viewport ${WIDTH}px${process.argv.includes('--expand') ? ' (expanded)' : ''}\n`);
console.log(pad('CARD', 11) + pad('HEIGHT', 8) + pad('IDENTITY', 10) + pad('CONTENT', 9) + pad('COMMAND', 9) + 'LAYOUT / STATE');
for (const r of report) {
  if (r.missing) { console.log(`${pad(r.id, 11)} MISSING`); continue; }
  const w = k => r.named[k] && r.named[k] !== 'hidden' ? `${r.named[k].w}` : '-';
  console.log(`${pad(r.id, 11)}${pad(r.card.h, 8)}${pad(w('identityZone'), 10)}${pad(w('contentZone'), 9)}${pad(w('commandZone'), 9)}${r.layout} / ${r.state}`);
}

console.log('\nRING vs ICON  (concentric means both offsets are 0)');
for (const r of report) {
  if (r.missing) continue;
  if (!r.ring) { console.log(`  ${pad(r.id, 11)} no ring`); continue; }
  const dx = r.ring.cx - r.icon.cx, dy = r.ring.cy - r.icon.cy;
  const clear = (r.ring.w - r.icon.paintedW) / 2;
  console.log(`  ${pad(r.id, 11)} ring ${pad(r.ring.w + 'x' + r.ring.h, 12)} icon ${pad(r.icon.w + ' (+' + r.icon.ringHalo + ' halo = ' + r.icon.paintedW + ')', 24)} offset dx=${pad(Math.round(dx * 10) / 10, 7)} dy=${pad(Math.round(dy * 10) / 10, 7)} clearance ${Math.round(clear * 10) / 10}px`);
}

console.log('\nHERO STACK  (level readout and discipline, relative to the icon)');
for (const r of report) {
  if (r.missing || !r.icon) continue;
  const lr = r.named.levelReadout, d = r.named.discipline;
  const fmt = (n, v) => v && v !== 'hidden' ? `${n} y=${v.y} cx=${v.cx} w=${v.w}` : `${n} ${v || 'absent'}`;
  console.log(`  ${pad(r.id, 11)} icon cx=${pad(r.icon.cx, 7)} ${pad(fmt('lv', lr), 30)} ${fmt('name', d)}`);
}

console.log('\nOTHER ELEMENTS');
for (const r of report) {
  if (r.missing) continue;
  const f = k => { const v = r.named[k]; return v && v !== 'hidden' ? `${v.w}x${v.h}@${v.x},${v.y}` : (v || 'absent'); };
  console.log(`  ${pad(r.id, 11)} button ${pad(f('actionButton'), 20)} pager ${pad(f('navGroup'), 20)} glyph ${pad(f('glyph'), 18)} note ${f('note')}`);
}

console.log('\nACTION ICONS');
for (const r of report) if (!r.missing) console.log(`  ${pad(r.id, 11)} ${r.icon}`);

const problems = report.filter(r => !r.missing && (r.clipped.length || r.overlaps.length));
console.log('\nCLIPPING AND OVERLAPS');
if (!problems.length) console.log('  none');
for (const r of problems)
  console.log(`  ${pad(r.id, 11)} clipped=[${r.clipped.join(', ')}] overlaps=[${r.overlaps.join(', ')}]`);

console.log(`\npage errors: ${errors.length ? errors.join(' | ') : 'none'}`);

/* --zoom-cmd <id,id>: the command column of each card, for judging the button's
   paint (pair with --ink for 4x pixels). */
if (arg('--zoom-cmd')) for (const id of arg('--zoom-cmd').split(',')) {
  const b = await page.locator('#' + id + ' button[data-iw-skill-role="action-button"]').boundingBox();
  await page.screenshot({ path: resolve(ROOT, `tmp/zoom-cmd-${id}.png`), clip: { x: b.x - 16, y: b.y - 10, width: b.width + 32, height: b.height + 46 } });
  console.log(`wrote tmp/zoom-cmd-${id}.png`);
}

if (arg('--zoom')) {
  const b = await page.locator('#' + arg('--zoom') + ' [data-iw-skill-zone="identity"]').boundingBox();
  await page.screenshot({ path: resolve(ROOT, 'tmp/zoom-' + arg('--zoom') + '.png'),
    clip: { x: b.x - 14, y: b.y - 10, width: Math.min(900, WIDTH - b.x + 10), height: b.height + 20 } });
  console.log('wrote tmp/zoom-' + arg('--zoom') + '.png');
}
if (SHOT) {
  await page.locator('#skill-actions').screenshot({ path: resolve(ROOT, SHOT) });
  console.log(`wrote ${SHOT}`);
}
/* --rows <id>: where does the vertical space in one card go? Prints the
   shell's resolved row tracks and every in-flow child of the content zone. */
if (arg('--rows')) {
  const rows = await page.evaluate(id => {
    const c = document.getElementById(id);
    const shell = c.querySelector('[data-iw-skill-layout-shell="1"]') || c;
    const zone = c.querySelector('[data-iw-skill-zone="content"]');
    const r = el => { const b = el.getBoundingClientRect(); return `y=${Math.round(b.y)} h=${Math.round(b.height)} w=${Math.round(b.width)}`; };
    const kids = [...zone.children].map(el => {
      const cs = getComputedStyle(el);
      return `  ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}${el.dataset.iwSkillRole ? '[' + el.dataset.iwSkillRole + ']' : ''} pos=${cs.position} disp=${cs.display} row=${cs.gridRowStart} ${r(el)}`;
    });
    return [`card ${r(c)}`, `shell rows=${getComputedStyle(shell).gridTemplateRows}`,
      `zone ${r(zone)} rows=${getComputedStyle(zone).gridTemplateRows}`, ...kids,
      `body ${r(c.querySelector('[data-iw-skill-v2-body]'))}`, `commands ${r(c.querySelector('[data-iw-skill-zone="commands"]'))}`].join('\n');
  }, arg('--rows'));
  console.log(rows);
}

/* --ink: where the chevrons and the action icon actually PAINT. A chevron is a
   rotated border corner on a pseudo-element, so no rect exists for it; its ink
   is isolated by screenshotting each arrow with and without the ::before and
   diffing. The icon is measured by its box and the label by a Range over the
   button's own text. */
if (process.argv.includes('--navcs')) console.log(await page.evaluate(() => { const b = document.querySelector('#jewelcrafting [data-iw-skill-role="nav-button"]'); const c = getComputedStyle(b), p = getComputedStyle(b, '::before'); return JSON.stringify({ display: c.display, place: c.placeItems, lh: c.lineHeight, fs: c.fontSize, padding: c.padding, h: c.height, bs: c.boxSizing, border: c.borderTopWidth + '/' + c.borderBottomWidth, before: { display: p.display, pos: p.position, top: p.top, h: p.height, w: p.width, margin: p.margin, va: p.verticalAlign, alignSelf: p.alignSelf, bs: p.boxSizing, bw: p.borderWidth } }); }));
/* --capture: run the read-only live capture snippet against this page, to prove it works before asking for one. */
if (process.argv.includes('--capture')) {
  const snippet = await readFile(resolve(ROOT, 'claude/capture-skill-cards.js'), 'utf8');
  const json = await page.evaluate(async code => {
    let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    (0, eval)(code); URL.createObjectURL = orig;
    return blob ? await blob.text() : null;
  }, snippet);
  const cap = JSON.parse(json);
  console.log(JSON.stringify(cap.cards.map(c => ({ id: c.id, g: c.commandGroup && { shares: c.commandGroup.glyphSharesParent, btn: c.commandGroup.buttonOffsetParent, glyph: c.commandGroup.glyphOffsetParent, chain: c.commandGroup.chain.length } })), null, 0));
}
/* --orphan-glyph: what the renderer's unexpectedFlowChild test sees for a shell-child icon when the card has no layout attribute. */
if (process.argv.includes('--orphan-glyph')) console.log('ORPHAN ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.compact-panel')].map(card => { const g = card.querySelector('[data-iw-skill-v2-action-glyph]'); if (!g) return null; const had = card.dataset.iwSkillLayout; delete card.dataset.iwSkillLayout; const cs = getComputedStyle(g), r = g.getBoundingClientRect(); const out = { id: card.id, parentIsShell: g.parentElement.matches('[data-iw-skill-layout-shell]'), display: cs.display, position: cs.position, w: r.width, h: r.height }; card.dataset.iwSkillLayout = had; return out; }))));
/* --host-glyph-height: a host page rule that gives any span a little height, then a structure change that makes the renderer re-decide the layout. */
if (process.argv.includes('--host-glyph-height')) {
  await page.addStyleTag({ content: '.iw-skill-v2-action-glyph { min-height: 12px; }' });
  await page.evaluate(() => { window.__layoutLog = []; new MutationObserver(rs => rs.forEach(r => window.__layoutLog.push(r.target.id + ':' + (r.oldValue || 'none') + '->' + (r.target.dataset.iwSkillLayout || 'none')))).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-iw-skill-layout'], attributeOldValue: true }); });
  await page.evaluate(() => document.querySelectorAll('.compact-panel').forEach(c => { const p = [...c.querySelectorAll("p")].find(x => /^(Fight|Mine|Smelt|Gather|Brew|Assemble|Prospect|Harvest|Weave|Chop)/.test(x.textContent)); const b = c.querySelector('[data-iw-skill-role="action-button"]'); if (b) b.setAttribute('aria-disabled', 'true'); }));
  await page.waitForTimeout(1200);
  console.log('LOG ' + JSON.stringify(await page.evaluate(() => window.__layoutLog)));
  console.log('DISABLED ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.compact-panel')].map(c => { const b = [...c.querySelectorAll('button')].find(x => x.getAttribute('aria-disabled') === 'true'); if (!b) return c.id + ':none'; const cs = getComputedStyle(b); return c.id + ':role=' + b.dataset.iwSkillRole + ' state=' + b.dataset.iwBtnState + ' opacity=' + cs.opacity + ' filter=' + cs.filter; }))));
  console.log('LAYOUT ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.compact-panel')].map(c => c.id + ':' + (c.dataset.iwSkillLayout || 'NONE')))));
}
/* --grounds <id>: every element in a card that paints its own background, with its box. */
if (arg('--grounds')) console.log('GROUNDS ' + JSON.stringify(await page.evaluate(id => [...document.getElementById(id).querySelectorAll('*')].map(el => { const cs = getComputedStyle(el); const bg = cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 90) : (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : null); if (!bg) return null; const b = el.getBoundingClientRect(); if (b.width < 40 || b.height < 20) return null; return (el.dataset.iwSkillZone || el.dataset.iwSkillRole || el.className || el.tagName).toString().slice(0, 40) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' ' + bg; }).filter(Boolean), arg('--grounds')), null, 1));
/* --labels A,B,...: relabel the action buttons in card order (React replaces the text node the way the game does), then report how each label fits. */
if (arg('--labels')) {
  await page.evaluate(list => { const btns = [...document.querySelectorAll('[data-iw-skill-role="action-button"]')]; list.forEach((t, i) => { if (btns[i] && t) btns[i].replaceChildren(document.createTextNode(t)); }); }, arg('--labels').split(','));
  await page.waitForTimeout(900);
  console.log('LABELS ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-iw-skill-role="action-button"]')].map(b => { const r = document.createRange(); r.selectNodeContents(b); const rects = [...r.getClientRects()]; const cs = getComputedStyle(b); const room = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const w = r.getBoundingClientRect().width - parseFloat(cs.letterSpacing); const bb = b.getBoundingClientRect(); const tb = r.getBoundingClientRect(); return b.textContent + ': ' + cs.fontSize + ' lines=' + new Set(rects.map(x => Math.round(x.top))).size + ' text=' + w.toFixed(1) + ' room=' + room.toFixed(1) + ' left=' + (tb.left - bb.left).toFixed(1) + ' right=' + (bb.right - tb.right).toFixed(1); })), null, 1));
}
if (process.argv.includes('--ink')) {
  await page.addStyleTag({ content: `
    body.ink-hide-chevron [data-iw-skill-role="nav-button"]::before { visibility: hidden !important; }` });
  const diffCentre = async (clip, hideClass) => {
    const lit = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(c => document.body.classList.add(c), hideClass);
    const dark = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(c => document.body.classList.remove(c), hideClass);
    return page.evaluate(async ({ lit, dark, clip }) => {
      const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
      const [a, b] = await Promise.all([load(lit), load(dark)]);
      const w = a.naturalWidth, h = a.naturalHeight;
      const read = img => { const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, w, h).data; };
      const da = read(a), db = read(b);
      let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) <= 24) continue;
        n++; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      const sx = clip.width / w, sy = clip.height / h;
      return { n, dx: +((((x0 + x1 + 1) / 2) * sx) - clip.width / 2).toFixed(2), dy: +((((y0 + y1 + 1) / 2) * sy) - clip.height / 2).toFixed(2) };
    }, { lit, dark, clip });
  };
  console.log('\nINK');
  for (const c of CARDS) {
    const arrows = await page.$$(`#${c.id} [data-iw-skill-role="nav-button"]`);
    const out = [];
    for (const a of arrows) {
      const b = await a.boundingBox();
      const m = await diffCentre({ x: b.x, y: b.y, width: b.width, height: b.height }, 'ink-hide-chevron');
      out.push(`${m.dx},${m.dy} (n=${m.n})`);
    }
    const g = await page.evaluate(id => {
      const card = document.getElementById(id);
      const btn = card.querySelector('[data-iw-skill-role="action-button"]');
      const glyph = card.querySelector('[data-iw-skill-v2-action-glyph]');
      /* TEXT rects only: a Range over the button also returns the activity fill's box. */
      const rects = []; const tw = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.nodeValue.trim()) continue; const range = document.createRange(); range.selectNodeContents(t); rects.push(...[...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)); }
      const label = rects.length ? { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) } : null;
      const bb = btn.getBoundingClientRect(), gb = glyph.getBoundingClientRect();
      const shownGlyph = getComputedStyle(glyph).backgroundImage !== 'none';
      const top = shownGlyph ? gb.top : label.top, bottom = label.bottom;
      return { glyphDx: +((gb.left + gb.width / 2) - (bb.left + bb.width / 2)).toFixed(2),
        groupDy: +(((top + bottom) / 2) - (bb.top + bb.height / 2)).toFixed(2),
        gap: shownGlyph ? +(label.top - gb.bottom).toFixed(2) : null };
    }, c.id);
    console.log(`  ${c.id.padEnd(13)} chevrons dx,dy: ${out.join('  ') || 'none'}   icon dx=${g.glyphDx} group dy=${g.groupDy} icon-label gap=${g.gap}`);
  }
}

if (process.argv.includes('--verify')) {
  const issues = [...problems.map(r => r.id), ...report.filter(r => r.missing || r.layout !== 'three-zone').map(r => r.id), ...errors];
  for (const r of report) {
    if (!r.named?.discipline || r.named.discipline === 'hidden') issues.push(`${r.id}: missing skill label`);
    if (r.named?.contentZone?.w < 100) issues.push(`${r.id}: summary is too narrow`);
  }
  const arrowsPainted = await page.evaluate(() => [...document.querySelectorAll('[data-iw-skill-role="nav-button"]')].every(el => {
    const s = getComputedStyle(el, '::before');
    return s.display !== 'none' && Number(s.opacity) > 0 && parseFloat(s.borderRightWidth) > 0;
  }));
  if (!arrowsPainted) issues.push('recipe arrow ink is hidden');
  if (issues.length) { await browser.close(); throw new Error(issues.join(', ')); }
  console.log('PASS reference card geometry and visible controls');
}
await browser.close();
