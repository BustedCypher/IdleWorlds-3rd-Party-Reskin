/* Runaway repeated-text probe (Curtis, 2026-09-16: after refreshing a tab that
 * had been idle, one skill card's own copy repeats hundreds of times inside
 * itself, in three columns, with the numbers visibly doubled).
 *
 * The repeated unit in that capture is a FLATTENED textContent blob -- the
 * requirement line, the skin's own "Base: 220" chip and the action label run
 * together with no separators -- so the writer is one of the four places the
 * skin sets .textContent from ANOTHER node's text:
 *
 *     SkillCardDesignController.ensureDetailBody   rows  <- [data-iw-skill-v2-section]
 *     SkillCardDesignController.syncRequirementNote note  <- requirement section
 *     SkillPanelRenderer.updateIngredientLists      items <- [data-iw-ingr]
 *
 * Each of those is safe only while its SOURCE is not an ancestor of its
 * TARGET. Nothing in the code enforces that, and if it is ever violated the
 * target's text is fed back into its own source: every pass concatenates the
 * previous pass, which is exactly the doubling in the capture. So this probe
 * checks the containment invariant directly rather than waiting for the text
 * to blow up, and it checks it across every card shape the live DOM ships and
 * while React churns the card the way it does in the seconds after a reload.
 *
 * Usage: node claude/probe-text-runaway.mjs [--seconds N] [--shape NAME] [--quiet]
 *   shapes: baseline nest-title bare-command wrap-command shellless nested
 *           text-pager active xp-readout no-requirement deep-content
 *   --churn  re-render each card's content branch from React's side mid-run
 */
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const arg = n => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const SECONDS = Number(arg('--seconds')) || 8;
const ONLY = arg('--shape');
const QUIET = process.argv.includes('--quiet');
const CHURN = process.argv.includes('--churn');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

const LUCIDE = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide h-4 w-4" style="display:block;width:16px;height:16px"><path d="${d}"/></svg>`;
const PAGER = `<div><button>${LUCIDE('m15 18-6-6 6-6')}</button><button>${LUCIDE('m9 18 6-6-6-6')}</button></div>`;

/* The readout has two live forms, because the game's readout button carries
   title="Click to cycle XP display". The capture is in the XP-TOTAL form, and
   no fixture in this repo has ever carried it. */
const PCT_READOUT = 'Lv 64 - 12.4% &bull; 4,120 to go';
const XP_READOUT = 'Lv 64 &bull; 3,085,385/24,850,867 XP';

const CARDS = [
  { id: 'herbalism', icon: '&#127807;', skill: 'Herbalism', lv: '64', pct: '12.4', verb: 'Gather',
    title: 'Gather Night Claw', base: 220, pager: 'content',
    lines: ['Needs level 73', 'Gather Night Claw from the ether', '220 XP'] },
  { id: 'mining', icon: '&#9935;', skill: 'Mining', lv: '70', pct: '45.3', verb: 'Mine',
    title: 'Mine Moonsteel', base: 154, pager: null, lines: ['Requires Mining Lv 53'] },
  { id: 'construction', icon: '&#127959;', skill: 'Construction', lv: '56', pct: '55.9', verb: 'Craft Parts',
    title: 'Craft Sunforged Building Parts', base: 252, pager: 'content',
    lines: ['&bull; Moonsteel Building Parts 1220/2800 &bull; Moonwood 35940/19600 &bull; Moonsteel Ore 58097/9800',
      'Missing materials &mdash; will queue (gather first)',
      '<p class="text-red-400">Requires Construction Lv 80 and Woodcutting Lv 70</p>'] },
];

/* Material-line SHAPES. Every fixture in this repo has used a "•"-separated
   line inside ONE text node, which happens to be the only shape
   `ingredientEntries`' lastIndexOf anchoring can slice correctly. docs/traps
   quotes the LIVE lines with an emoji per material instead ("📦 Bloodstone
   Building Parts 298/2600", "💠 Night Claw 22/100"), and textContent never
   inserts a newline between elements, so in a React DOM neither anchor is
   necessarily present anywhere in the string. */
const MATERIAL_SHAPES = {
  'mat-bullets': ['<p>&bull; Moonsteel Building Parts 1220/2800 &bull; Moonwood 35940/19600 &bull; Moonsteel Ore 58097/9800</p>'],
  'mat-emoji': ['<p>&#128230; Moonsteel Building Parts 1220/2800 &#127795; Moonwood 35940/19600 &#129704; Moonsteel Ore 58097/9800</p>'],
  'mat-split': ['<div><p>&#128230; Moonsteel Building Parts 1220/2800</p><p>&#127795; Moonwood 35940/19600</p><p>&#129704; Moonsteel Ore 58097/9800</p></div>'],
  'mat-split-spans': ['<div><span>&#128230; Moonsteel Building Parts 1220/2800</span><span>&#127795; Moonwood 35940/19600</span><span>&#129704; Moonsteel Ore 58097/9800</span></div>'],
};

function buildPage(shape) {
  const has = n => shape === n;
  const readout = has('xp-readout') ? XP_READOUT
    : (has('no-xp') ? 'Lv 64 - 12.4% &bull; 4,120 to go' : PCT_READOUT);
  const activity = has('active') ? '<span class="absolute inset-0 bg-black/15" style="width: 40%;"></span>' : '';

  const card = c => {
    let src = has('no-requirement') ? c.lines.filter(l => !/requires|needs level/i.test(l)) : c.lines;
    if (MATERIAL_SHAPES[shape] && c.id === 'construction') {
      src = [...MATERIAL_SHAPES[shape], ...src.filter(l => !/\d+\/\d+/.test(l))];
    }
    /* no-xp: strip every "XP" from the card, so INGR_PATTERN's `(?!.*\bxp\b)`
       lookahead stops keeping containers out of the ingredient sweep. */
    if (has('no-xp')) src = src.map(l => l.replace(/\bXP\b/g, 'points'));
    const lines = src.map(l => (l.startsWith('<') ? l : `<p>${l}</p>`)).join('\n      ');
    /* deep-content: the game nests the whole content branch one level further,
       which is the difference between a section being a LEAF and a section
       being a node with the skin's own appended children under it. */
    const inner = `
      ${has('nest-title') ? `<div><p>${c.title}</p><button title="Click to cycle XP display">${readout}</button></div>`
        : `<p>${c.title}</p>\n      <button title="Click to cycle XP display">${readout}</button>`}
      ${lines}
      ${c.pager === 'content' ? PAGER : ''}
      <p>Base reward: +${c.base} ${c.skill.toLowerCase()} ${has('no-xp') ? 'points' : 'XP'}/task</p>
      <div><div style="width:${c.pct}%"></div></div>`;
    const content = has('deep-content') ? `<div><div>${inner}</div></div>` : `<div>${inner}</div>`;
    const action = `<button><span class="relative z-10">${c.verb}</span>${activity}</button>`;
    const commands = has('bare-command') ? action
      : `<div>${has('wrap-command') ? '<div style="transform:translateZ(0);height:100%">' : ''}${action}${has('wrap-command') ? '</div>' : ''}</div>`;
    const identity = `<div>${has('nested') ? '<div>' : ''}<p>${c.icon} ${c.skill}</p><p>LV ${c.lv}</p>${has('nested') ? '</div>' : ''}</div>`;
    const body = `${identity}${content}${commands}`;
    return `<div class="compact-panel" id="${c.id}">${has('shellless') ? body
      : `<div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">${body}</div>`}</div>`;
  };

  const SCRIPT_OPEN = '<scr' + 'ipt>';
  const SCRIPT_CLOSE = '</scr' + 'ipt>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a;color:#fff}
.panel{padding:8px}.grid{display:grid}.gap-2{gap:.5rem}.relative{position:relative}
.absolute{position:absolute}.inset-0{inset:0}.z-10{z-index:10}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone 19: Eternium Verge</p></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
${CARDS.map(card).join('')}</div>
</div></div>${SCRIPT_OPEN}${bundle}${SCRIPT_CLOSE}</body></html>`;
}

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

/* The containment invariant, evaluated in the page. A source that CONTAINS its
   own target is the runaway; a huge text length is the same bug once it has
   been running for a few seconds, and is reported too so a violation that
   arrives by some other route is still caught. */
const CHECK = () => {
  const PAIRS = [
    ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-body]', 'section > body'],
    ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-req-note]', 'section > req-note'],
    ['[data-iw-ingr]', '[data-iw-skill-ingredient-list]', 'ingr > ingredient-list'],
    ['[data-iw-skill-role="requirement"]', '[data-iw-skill-v2-controls]', 'requirement > foot row'],
  ];
  const out = { violations: [], lens: {}, bodies: {}, rows: {}, sections: {}, widest: {}, sample: {} };
  for (const panel of document.querySelectorAll('.compact-panel')) {
    out.lens[panel.id] = panel.textContent.replace(/\s+/g, ' ').trim().length;
    out.bodies[panel.id] = panel.querySelectorAll('[data-iw-skill-v2-body]').length;
    out.rows[panel.id] = panel.querySelectorAll('.iw-skill-v2-body-row').length;
    out.sections[panel.id] = panel.querySelectorAll('[data-iw-skill-v2-section]').length;
    const cells = [...panel.querySelectorAll('.iw-skill-v2-body-row, .fs-skill-ingredient-item')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim()).sort((a, b) => b.length - a.length);
    out.widest[panel.id] = cells.length ? cells[0].length : 0;
    out.sample[panel.id] = cells[0] || '';
    for (const [srcSel, dstSel, label] of PAIRS) {
      for (const src of panel.querySelectorAll(srcSel)) {
        for (const dst of panel.querySelectorAll(dstSel)) {
          if (src !== dst && src.contains(dst)) {
            out.violations.push(`${panel.id}: ${label} (${src.dataset.iwSkillV2Section || src.tagName})`);
          }
        }
      }
    }
  }
  return out;
};

const SHAPES = ['baseline', 'nest-title', 'bare-command', 'wrap-command', 'shellless', 'nested',
  'text-pager', 'active', 'xp-readout', 'no-requirement', 'deep-content', 'no-xp',
  'mat-bullets', 'mat-emoji', 'mat-split', 'mat-split-spans'];
const shapes = ONLY ? [ONLY] : SHAPES;

const browser = await chromium.launch();
let failures = 0;
for (const shape of shapes) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const PAGE = buildPage(shape);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    }
    try {
      return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream',
        body: await readFile(resolve(ROOT, url.pathname.slice(1))) });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(`${ORIGIN}/cards.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(CHECK);

  /* Tick like a live page, and (with --churn) re-render the content branch the
     way React does while state streams in after a reload. */
  await page.evaluate(churn => {
    window.__t = 0;
    window.__timer = setInterval(() => {
      window.__t += 1;
      for (const c of document.querySelectorAll('.compact-panel')) {
        const b = [...c.querySelectorAll('button')].find(x => /to go|XP$/i.test(x.textContent));
        if (b) {
          b.textContent = b.textContent
            .replace(/[\d,]+(?= to go)/, String(4120 - window.__t))
            .replace(/(• )[\d,]+(?=\/)/, (m, p) => p + (3085385 + window.__t).toLocaleString('en-US'));
        }
        const fill = c.querySelector('div > div[style*="width"]');
        if (fill) fill.style.width = `${(window.__t * 3) % 100}%`;
        const action = [...c.querySelectorAll('button')].pop();
        if (action && window.__t % 8 === 0) action.disabled = !action.disabled;
      }
      if (churn && window.__t % 12 === 0) {
        for (const c of document.querySelectorAll('.compact-panel')) {
          const p = c.querySelector('p');
          if (p) p.textContent = p.textContent.endsWith(' ') ? p.textContent.trim() : `${p.textContent} `;
        }
      }
    }, 250);
  }, CHURN);
  await page.waitForTimeout(SECONDS * 1000);
  await page.evaluate(() => clearInterval(window.__timer));
  const after = await page.evaluate(CHECK);

  const grew = Object.keys(after.lens).filter(k => after.lens[k] > (before.lens[k] || 0) + 40);
  /* A cell wider than any real material line is the same defect standing
     still: ingredientEntries sliced from the start of the blob. */
  const bad = after.violations.length || grew.length || errors.length
    || Object.values(after.bodies).some(n => n > 1)
    || Object.values(after.widest).some(n => n > 60);
  if (bad) failures += 1;
  if (bad || !QUIET) {
    console.log(`\n== ${shape}${CHURN ? ' +churn' : ''} ==  ${bad ? 'FAIL' : 'ok'}`);
    console.log('  text len  :', Object.entries(after.lens).map(([k, v]) => `${k} ${before.lens[k]}->${v}`).join('  '));
    console.log('  sections  :', JSON.stringify(after.sections), ' bodies:', JSON.stringify(after.bodies),
      ' body rows:', JSON.stringify(after.rows));
    console.log('  widest cell:', JSON.stringify(after.widest));
    const worst = Object.entries(after.sample).sort((a, b) => b[1].length - a[1].length)[0];
    if (worst && worst[1]) console.log(`  longest   : ${worst[0]} "${worst[1].slice(0, 160)}"`);
    if (after.violations.length) console.log('  VIOLATION :', [...new Set(after.violations)].join(' | '));
    if (errors.length) console.log('  page error:', errors.slice(0, 2).join(' | '));
  }
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures}/${shapes.length} shapes FAILED` : `\nall ${shapes.length} shapes clean`);
process.exit(failures ? 1 : 0);
