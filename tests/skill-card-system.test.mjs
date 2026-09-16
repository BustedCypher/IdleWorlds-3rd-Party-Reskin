/* The V2 skill card as a SYSTEM: five live shapes rendered from one set of
 * rules, checked against each other rather than one at a time.
 *
 * Every check here compares the set. A per-card assertion cannot see the
 * defect this redesign was asked to fix — the reported capture had a level
 * above the ring on two cards and below it on three, a hero column that was
 * identical on all five while the content varied, and a pager that set the
 * card's height on the cards that had one. All of those pass a spot check and
 * fail a uniformity check.
 *
 * Negative controls are listed beside each group and were verified by
 * reverting the fix.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The five live shapes from the 2026-09 capture, chosen to span the range the
   card system has to hold: a gathering skill with no materials at all, two
   with a single material, and CONSTRUCTION with six and five-digit
   quantities, which is the stress test — if its collapsed card is not the same
   height as the others, the summary is not doing its job. `pager` names WHICH
   BRANCH the arrows ship in, because a flex `order` means different things in
   the two. A material line MUST carry an N/M count or SkillPanelRenderer
   builds no ingredient grid and the whole materials surface vanishes. */
const CARDS = [
  /* wrapCommand: the button sits inside a wrapper that establishes its own
     containing block, the live shape that put every action icon ~12px high. */
  { id: 'jewelcrafting', wrapCommand: true, icon: '&#128142;', skill: 'Jewelcrafting', lv: 70, pct: '41.1',
    title: 'Prospect Moonsteel Ore', verb: 'Prospect', base: 677, pager: 'content',
    lines: ['&bull; Moonsteel Ore 58097/2'] },
  { id: 'spellcrafting', icon: '&#10024;', skill: 'Spellcrafting', lv: 60, pct: '64',
    title: 'Harvest Moonsteel Mana', verb: 'Gather', base: 124, pager: 'content', active: 100, lines: [] },
  /* Bonus level: the live Smithing/Herbalism/Alchemy shape that makes the
     level plaque substantially wider than a plain two-digit level. */
  { id: 'tailoring', nestTitle: true, icon: '&#129525;', skill: 'Tailoring', lv: '54+2', pct: '86',
    title: 'Weave Moonsilk Cloth', verb: 'Weave', base: 1008, pager: 'commands',
    lines: ['&bull; Moonsilk 0/8', 'Requires Tailoring Lv 49'] },
  { id: 'woodcutting', icon: '&#127794;', skill: 'Woodcutting', lv: 63, pct: '39.8',
    title: 'Chop Moonwood', verb: 'Chop', base: 154, pager: null, active: 40, lines: [] },
  /* bareCommand: the action button is the shell's own third child with no
     cell round it, so the renderer tags the BUTTON as the command zone - the
     live shape that made every action icon vanish. On Construction because
     "ASSEMBLE" is the longest label, and the bare button is the one that
     clips first. */
  { id: 'construction', bareCommand: true, icon: '&#127959;', skill: 'Construction', lv: 56, pct: '55.9',
    title: 'Craft Sunforged Building Parts', verb: 'Craft Parts', base: 252, pager: 'content',
    lines: ['&bull; Moonsteel Building Parts 1220/2800 &bull; Moonwood 35940/19600 '
            + '&bull; Moonsteel Ore 58097/9800 &bull; Mythril Building Parts 152/200 '
            + '&bull; Aethersteel Building Parts 1/400 &bull; Bloodstone Building Parts 0/520',
            'Missing materials &mdash; will queue (gather first)',
            /* UNMET: the game marks it with a warm text class. */
            '<p class="text-red-400">Requires Construction Lv 80 and Woodcutting Lv 70</p>',
            /* A source line, so one card still has two tabs to move between. */
            'Found in the Bloodoak Grove'] },
];

/* `pager` names WHICH BRANCH the recipe arrows are shipped in, not merely that
   they exist. The live cards render them inside the CONTENT branch, and a
   fixture that always put them in the command branch is why they read as
   correct locally while floating mid-card live: the rule that places them is a
   flex `order`, and order means two different things in the two branches. */
/* The arrows are Lucide SVGs (`h-4 w-4`) in the deployed chunk, not text. A
   16px svg is a real flex item beside the CSS chevron and pushed both chevrons
   7.5px left live; a `&lsaquo;` at font-size 0 takes no width and never did. */
const LUCIDE = d => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide h-4 w-4"><path d="${d}"/></svg>`;
const PAGER_HTML = `<div><button>${LUCIDE('m15 18-6-6 6-6')}</button><button>${LUCIDE('m9 18 6-6-6-6')}</button></div>`;
/* The live action button wraps its label in `span.relative.z-10`; while a skill
   runs the game adds `span.absolute.inset-0.bg-black/15` at the progress width,
   and while it starts the same span at 100% with `animate-pulse`. Woodcutting
   is running at 40%; Spellcrafting is starting. */
const actionButton = c => `<button><span class="relative z-10">${c.verb}</span>${c.active ? `<span class="absolute inset-0${c.active === 100 ? ' animate-pulse' : ''} bg-black/15" style="width: ${c.active}%;"></span>` : ''}</button>`;
const card = c => `
<div class="compact-panel" id="${c.id}">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>${c.icon} ${c.skill}</p><p>LV ${c.lv}</p></div>
    <div>
      ${c.nestTitle
        ? `<div><p>${c.title}</p><button>Lv ${c.lv} - ${c.pct}% &bull; 4,120 to go</button></div>`
        : `<p>${c.title}</p>
      <button>Lv ${c.lv} - ${c.pct}% &bull; 4,120 to go</button>`}
      ${c.lines.map(l => l.startsWith('<') ? l : `<p>${l}</p>`).join('\n      ')}
      ${c.pager === 'content' ? PAGER_HTML : ''}
      <p>Base reward: +${c.base} ${c.skill.toLowerCase()} XP/task</p>
      <div><div style="width:${c.pct}%"></div></div>
    </div>
    ${c.bareCommand && c.pager !== 'commands' ? actionButton(c) : `<div>${c.wrapCommand ? '<div style="transform:translateZ(0);margin-top:14px;height:calc(100% - 14px)">' : ''}${c.pager === 'commands' ? PAGER_HTML : ''}${actionButton(c)}${c.wrapCommand ? '</div>' : ''}</div>`}
  </div>
</div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}.h-4{height:1rem}.w-4{width:1rem}
.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.z-10{z-index:10}.bg-black\\/15{background-color:rgb(0 0 0/.15)}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div><div><button>S</button></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone 19: Eternium Verge</p></div>
  <div><button>&#127760; Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
${CARDS.map(card).join('')}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

const ORIGIN = 'http://iw.test';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2' };

const cases = [];
const check = (label, ok, detail = '') => cases.push({ label, ok: !!ok, detail });
const ids = CARDS.map(c => c.id);
/* Mean RGB delta (sum of three channels) the fill must add over its own rect. */
const FILL_MEAN_FLOOR = 90;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
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

/* Collected in the page so every number is a rendered rect, not a declaration. */
const AUDIT = (ids) => {
  const round = n => Math.round(n * 10) / 10;
  const textRects = el => { const out = []; if (!el) return out;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(t);
      out.push(...[...r.getClientRects()].filter(x => x.width > 0 && x.height > 0)); }
    return out; };
  const box = el => { const b = el.getBoundingClientRect();
    return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height),
      cx: round(b.x + b.width / 2), cy: round(b.y + b.height / 2) }; };
  /* An element inside a CLIPPED section keeps its real layout rect — the clip
     hides the paint, not the box — so a visibility test that only reads the
     element itself reports six invisible material rows as visible. */
  const shown = el => { if (!el) return false; const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || !(Number(s.opacity) > 0)) return false;
    if (!(b.width > 1 && b.height > 1)) return false;
    const section = el.closest('[data-iw-skill-v2-section]');
    if (section && section !== el) {
      const sb = section.getBoundingClientRect();
      if (sb.width <= 2 || sb.height <= 2) return false;
    }
    return true; };
  return ids.map(id => {
    const c = document.querySelector('#' + id);
    const q = s => c.querySelector(s);
    const art = q('.fs-skill-medallion-art');
    const hs = getComputedStyle(art);
    const rs = getComputedStyle(art, '::after');
    const ab = art.getBoundingClientRect();
    const rl = ab.x + (parseFloat(hs.borderLeftWidth) || 0) + parseFloat(rs.left);
    const rt = ab.y + (parseFloat(hs.borderTopWidth) || 0) + parseFloat(rs.top);
    const rw = parseFloat(rs.width), rh = parseFloat(rs.height);
    /* The icon's PAINTED circle is its border box plus the widest spread of any
       NON-inset shadow ring: that is the circle a person compares the gauge
       against, and the reason "clearance" was 0.0px in the reported build. */
    const outerSpread = hs.boxShadow.split(/,(?![^(]*\))/).filter(p => !/inset/.test(p))
      .map(p => { const n = p.match(/(-?\d+(?:\.\d+)?)px/g) || []; return n.length >= 4 ? parseFloat(n[3]) : 0; })
      .reduce((a, b) => Math.max(a, b), 0);
    const name = q('[data-iw-skill-role="identity"]');
    const glyph = q('[data-iw-skill-v2-action-glyph]');
    const actionLabel = q('[data-iw-skill-v2-action-label]');
    const btn = q('[data-iw-skill-role="action-button"]');
    const navs = [...c.querySelectorAll('[data-iw-skill-role="nav-button"]')];
    const tabsHost = q('[data-iw-skill-v2-tabs]');
    /* The body under test is the one the card's ACTIVE tab reveals — a card
       whose first available tab is Materials hides its Rewards section, so
       picking a fixed section reports "no body" on exactly the cards that
       have the most. */
    /* The body under test is the SKIN's row, not the game's section: since the
       shell refactor the game's sections are always clipped and the expanded
       body is a row of the shell built from their text. */
    const section = q('[data-iw-skill-v2-body]');
    const clipped = [...c.querySelectorAll('*')].filter(el => shown(el)
      && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
      .map(el => el.tagName.toLowerCase() + (el.dataset.iwSkillRole ? '[' + el.dataset.iwSkillRole + ']' : ''));
    return {
      id, state: c.dataset.iwSkillV2State, height: round(c.getBoundingClientRect().height),
      card: box(c),
      icon: { ...box(art), painted: round(ab.width + outerSpread * 2) },
      /* `transform` is recorded because it is NOT part of a pseudo-element's
         computed left/top/width/height, and a pseudo's painted box cannot be
         measured with getBoundingClientRect. A ring inheriting the diamond
         stud's `translateX(-50%) rotate(45deg)` from the three-zone block
         therefore reported perfect concentricity while painting half its own
         width to the left. Assert the input; the geometry alone cannot see it. */
      ring: { w: round(rw), h: round(rh), cx: round(rl + rw / 2), cy: round(rt + rh / 2),
        display: rs.display, transform: rs.transform,
        weight: (rs.maskImage || rs.webkitMaskImage || ''),
        weightPx: parseFloat(getComputedStyle(c).getPropertyValue('--iw-skill-v2-ring-weight')) },
      readout: shown(q('[data-iw-skill-v2-level-readout]')) ? box(q('[data-iw-skill-v2-level-readout]')) : null,
      levelText: (q('.iw-skill-v2-level')?.textContent || '').trim(),
      nameBox: shown(name) ? box(name) : null,
      nameInk: name ? round(name.scrollWidth) : 0,
      nameRoom: name ? round(name.clientWidth) : 0,
      nameColour: name ? getComputedStyle(name, '::before').color : '',
      materialsShown: shown(q('[data-iw-skill-v2-section="materials"]')),
      gridCount: c.querySelectorAll('[data-iw-skill-ingredient-list="1"]').length,
      summary: shown(q('[data-iw-skill-v2-summary]')) ? (q('[data-iw-skill-v2-summary]').textContent || '').trim() : null,
      summaryState: q('[data-iw-skill-v2-summary]')?.dataset.iwSkillV2SummaryState || null,
      summaryColour: shown(q('[data-iw-skill-v2-summary]')) ? getComputedStyle(q('[data-iw-skill-v2-summary]')).color : null,
      summaryBox: shown(q('[data-iw-skill-v2-summary]')) ? box(q('[data-iw-skill-v2-summary]')) : null,
      titleBox: shown(q('[data-iw-skill-role="action-title"]')) ? box(q('[data-iw-skill-role="action-title"]')) : null,
      titleFont: q('[data-iw-skill-role="action-title"]') ? getComputedStyle(q('[data-iw-skill-role="action-title"]'), '::before').fontFamily : '',
      chipBox: shown(q('.fs-skill-base-exp')) ? box(q('.fs-skill-base-exp')) : null,
      /* The name is drawn by a ::before, and a pseudo-element's overflow does
         NOT show up in its host's scrollWidth — so the host-level clip check
         below cannot see an ellipsis applied to the label itself. Assert the
         INPUTS as well: nothing in the chain may clip or truncate it. */
      nameOverflow: name ? getComputedStyle(name, '::before').overflow : '',
      nameEllipsis: name ? getComputedStyle(name, '::before').textOverflow : '',
      nameHostOverflow: name ? getComputedStyle(name).overflow : '',
      nameMaxWidth: name ? getComputedStyle(name, '::before').maxWidth : '',
      identityW: box(q('[data-iw-skill-zone="identity"]')).w,
      /* The hero column's box: it spans the whole card on a wide card and only
         the top band on a phone card, which is what the command group centres
         on in both. */
      identityBox: box(q('[data-iw-skill-zone="identity"]')),
      /* The COLUMN, not the zone element: when the button is its own zone the element is only the button. */ commandW: round(c.getBoundingClientRect().right - q('[data-iw-skill-zone="content"]').getBoundingClientRect().right),
      button: shown(btn) ? box(btn) : null,
      buttonBg: btn ? getComputedStyle(btn).backgroundImage : '',
      buttonColor: btn ? getComputedStyle(btn).color : '',
      buttonFont: btn ? parseFloat(getComputedStyle(btn).fontSize) : null,
      buttonText: (btn?.textContent || '').trim(),
      glyph: shown(glyph) ? box(glyph) : null,
      glyphBg: glyph ? getComputedStyle(glyph).backgroundImage.slice(0, 24) : '',
      glyphIcon: glyph ? ((getComputedStyle(glyph).backgroundImage.match(/action-icons\/([a-z]+)\.svg/) || [])[1] || null) : null,
      glyphUrl: glyph ? ((getComputedStyle(glyph).backgroundImage.match(/url\("?([^")]+)"?\)/) || [])[1] || null) : null,
      actionLabel: shown(actionLabel) ? box(actionLabel) : null,
      actionLabelText: (actionLabel?.textContent || '').trim(),
      actionLabelFont: actionLabel ? getComputedStyle(actionLabel).fontFamily : '',
      actionLabelTransform: actionLabel ? getComputedStyle(actionLabel).textTransform : '',
      zoneBox: box(q('[data-iw-skill-zone="content"]')),
      /* TEXT rects only: a Range over the button also returns the box of the
         game's activity fill, which is the button's full width while starting. */
      labelFit: (() => { const host = shown(actionLabel) ? actionLabel : btn;
        const rs = textRects(host);
        const cs = getComputedStyle(host);
        return { lines: new Set(rs.map(x => Math.round(x.top))).size,
          text: rs.length ? round(Math.max(...rs.map(x => x.right)) - Math.min(...rs.map(x => x.left)) - (parseFloat(cs.letterSpacing) || 0)) : 0,
          room: round(host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
          pad: round(Math.min(parseFloat(cs.paddingLeft), parseFloat(cs.paddingRight))),
          size: parseFloat(cs.fontSize), label: host.textContent.trim() }; })(),
      contentGround: getComputedStyle(q('[data-iw-skill-zone="content"]')).backgroundImage,
      labelBox: (() => { const rs = textRects(shown(actionLabel) ? actionLabel : btn);
        return rs.length ? { top: round(Math.min(...rs.map(x => x.top))), bottom: round(Math.max(...rs.map(x => x.bottom))) } : null; })(),
      footBox: shown(q('[data-iw-skill-v2-controls]')) ? box(q('[data-iw-skill-v2-controls]')) : null,
      nav: navs.filter(shown).map(box),
      navGroup: (() => { const g = q('[data-iw-skill-role="nav-group"]');
        if (!g || !shown(g)) return null;
        return { ...box(g), transform: getComputedStyle(g).transform,
          branch: g.closest('[data-iw-skill-zone]')?.dataset.iwSkillZone || null }; })(),
      tabsShown: shown(tabsHost),
      tabs: [...c.querySelectorAll('[data-iw-skill-v2-tab-button]')].map(t => t.dataset.iwSkillV2TabButton),
      tabBoxes: [...c.querySelectorAll('[data-iw-skill-v2-tab-button]')].filter(shown).map(box),
      tabsBottom: shown(tabsHost) ? round(tabsHost.getBoundingClientRect().bottom) : null,
      stripBox: shown(tabsHost) ? box(tabsHost) : null,
      note: (n => shown(n) ? { ...box(n), text: (n.textContent || '').trim(),
        font: parseFloat(getComputedStyle(n).fontSize) } : null)(q('[data-iw-skill-v2-req-note]')),
      cellBoxes: [...c.querySelectorAll('.iw-skill-v2-body-row[data-iw-skill-v2-body-kind="material"]')].filter(shown).map(box),
      sectionShown: shown(section),
      bodyBox: shown(section) ? box(section) : null,
      sectionTop: shown(section) ? box(section).y : null,
      contentW: round(c.querySelector('[data-iw-skill-zone="content"]').getBoundingClientRect().width),
      tabsW: tabsHost && shown(tabsHost) ? round(tabsHost.getBoundingClientRect().width) : 0,
      bodyW: section && shown(section) ? round(section.getBoundingClientRect().width) : 0,
      tabsTop: shown(tabsHost) ? box(tabsHost).y : null,
      nativeLevel: shown(q('[data-iw-skill-role="identity-level"]')),
      nativePercent: shown(q('.fs-skill-identity-percent')),
      clipped,
    };
  });
};

try {
  await page.goto(`${ORIGIN}/skill-card-system.html`, { waitUntil: 'load' });
  await page.waitForSelector('#construction[data-iw-skill-v2="1"]', { timeout: 8000 });
  await page.waitForTimeout(1100);

  const open = await page.evaluate(AUDIT, ids);
  const uniq = xs => [...new Set(xs)];
  /* Only cards with something in the frame draw one: Spellcrafting and
     Woodcutting ship no material, and their only sections were tabs that are
     gone, so their frame is empty and hidden. */
  const framed = open.filter(r => r.bodyBox);
  check('the cards with content in their frame are the ones expected',
    JSON.stringify(framed.map(r => r.id)) === JSON.stringify(['jewelcrafting', 'tailoring', 'construction']),
    framed.map(r => r.id).join(','));
  check('the info frame shares the left edge of the title',
    framed.every(r => Math.abs(r.bodyBox.x - r.titleBox.x) <= 1),
    framed.map(r => `${r.id} body=${r.bodyBox.x} title=${r.titleBox.x}`).join(' '));
  /* The visible hero reduction has to be large enough to read at normal game
     scale, while remaining well above an inline-icon scale. */
  check('the hero icon fits comfortably inside its frame',
    open.every(r => r.icon.w >= 42 && r.icon.w <= 44), open.map(r => r.icon.w).join(','));
  check('the action is a portrait control with room for its illustration',
    open.every(r => r.button.h >= 60 && r.button.h >= r.button.w), open.map(r => `${r.button.w}x${r.button.h}`).join(','));

  /* Curtis's edited reference (2026-09) removed the collapse chevron: the tabs
     are always visible at the foot of the card and the info frame is always
     built, so there is one state and no transition to test. */
  check('every shape is re-identified as an always-open V2 skill card',
    open.every(r => r.state === 'expanded'), open.map(r => r.id + ':' + r.state).join(' '));
  check('no card ships a collapse control any more',
    await page.locator('[data-iw-skill-v2-expand]').count() === 0);

  /* 1. The hero. Control: restore the medallion's outer box-shadow halo and
     clearance collapses to 0, which is the reported "overlaps awkwardly". */
  check('the ring is concentric with its icon on every card',
    open.every(r => r.ring.cx === r.icon.cx && r.ring.cy === r.icon.cy),
    open.map(r => `${r.id} d=${round1(r.ring.cx - r.icon.cx)},${round1(r.ring.cy - r.icon.cy)}`).join(' '));
  check('the ring carries no inherited transform to displace or rotate it',
    open.every(r => r.ring.transform === 'none'),
    open.map(r => `${r.id} ${r.ring.transform}`).join(' '));
  check('the ring clearly surrounds the icon rather than sitting on it',
    open.every(r => (r.ring.w - r.icon.painted) / 2 >= 6),
    open.map(r => `${r.id} ${round1((r.ring.w - r.icon.painted) / 2)}px`).join(' '));
  check('the complete EXP ring is visibly compact',
    open.every(r => r.ring.w <= 56), open.map(r => `${r.id} ${r.ring.w}px`).join(' '));
  check('the ring stays legible without crowding the hero frame',
    open.every(r => r.ring.weightPx === 4),
    open.map(r => `${r.id} ${r.ring.weightPx}px`).join(' '));
  check('the ring is the same size on every card', uniq(open.map(r => r.ring.w)).length === 1,
    uniq(open.map(r => r.ring.w)).join(','));

  /* 2. One hero block. Control: drop the `> *:not(...)` hide list and the
     game's own level line reappears on the cards that ship one. */
  check('no native level or percent survives beside the skin readout',
    open.every(r => !r.nativeLevel && !r.nativePercent),
    open.filter(r => r.nativeLevel || r.nativePercent).map(r => r.id).join(',') || 'none');
  check('the level block is present on every card', open.every(r => r.readout));
  check('the bonus-level fixture renders the full level value',
    open.find(r => r.id === 'tailoring')?.levelText === 'Lv 54+2',
    open.find(r => r.id === 'tailoring')?.levelText || 'missing');
  check('the level plaque stays compact vertically',
    open.every(r => r.readout.h <= 31), open.map(r => `${r.id} ${r.readout.h}px`).join(' '));
  check('a bonus level does not make the plaque excessively wide',
    open.find(r => r.id === 'tailoring')?.readout.w <= 60,
    `${open.find(r => r.id === 'tailoring')?.readout.w || 'missing'}px`);
  check('the level block sits directly under the icon on every card',
    uniq(open.map(r => round1(r.readout.y - (r.icon.y + r.icon.h)))).length === 1,
    uniq(open.map(r => round1(r.readout.y - (r.icon.y + r.icon.h)))).join(','));
  check('icon, level and name share one centre line on every card',
    open.every(r => r.icon.cx === r.readout.cx && r.icon.cx === r.nameBox.cx),
    open.map(r => `${r.id} ${r.icon.cx}/${r.readout.cx}/${r.nameBox.cx}`).join(' '));

  /* 3. The discipline name. Control: restore `overflow: hidden` + ellipsis and
     the longest name reports ink wider than its room. */
  check('the discipline name is never clipped',
    open.every(r => r.nameInk <= r.nameRoom + 1),
    open.map(r => `${r.id} ${r.nameInk}>${r.nameRoom}`).join(' '));
  check('nothing in the discipline name chain can truncate it',
    open.every(r => r.nameOverflow === 'visible' && r.nameHostOverflow === 'visible'
      && r.nameEllipsis === 'clip' && r.nameMaxWidth === 'none'),
    open.map(r => `${r.id} ${r.nameOverflow}/${r.nameHostOverflow}/${r.nameEllipsis}/${r.nameMaxWidth}`).join(' '));
  check('the discipline name is drawn in the skill accent, not one flat colour',
    uniq(open.map(r => r.nameColour)).length === open.length,
    uniq(open.map(r => r.nameColour)).length + ' distinct');
  check('nothing anywhere in any card is clipped',
    open.every(r => !r.clipped.length),
    open.flatMap(r => r.clipped.map(c => r.id + ':' + c)).join(' ') || 'none');

  /* 4 and 17. Compactness, and height that follows content. Control: put the
     shell's `min-height: 86px` row floor back and all five report one height. */
  const simple = open.filter(r => ['spellcrafting', 'woodcutting'].includes(r.id));
  /* The external action label adds 16px to the centred command stack. The
     pager case therefore tops out at 140px while a title-only, no-pager card
     remains close to 110px. */
  check('simple cards retain the compact reference proportions',
    simple.every(r => r.height <= 140), simple.map(r => `${r.id} ${r.height}`).join(' '));
  /* The centre column is ONE stack - title row, frame, foot row - between two
     flexible spacer rows, so it sits on the card's middle line and each frame
     is only as tall as its content. Before the spacers, a card at its floor
     poured its spare height into the frame and a single material sat in a box
     twice its size. Control: put the rows back to `auto 1fr auto` and the
     one-material frame measures ~94px while its title row pins to the top. */
  const stackOf = r => { const top = r.zoneBox.y;
    const bottom = r.footBox ? r.footBox.y + r.footBox.h : r.bodyBox ? r.bodyBox.y + r.bodyBox.h + 6 : r.zoneBox.y + r.zoneBox.h;
    return { mid: (top + bottom) / 2, cardMid: r.card.y + r.card.h / 2 }; };
  check('the centre stack sits on the card\'s middle line',
    open.every(r => (g => Math.abs(g.mid - g.cardMid) <= 4)(stackOf(r))),
    open.map(r => (g => `${r.id} d=${round1(g.mid - g.cardMid)}`)(stackOf(r))).join(' '));
  check('a one-material frame hugs its content',
    (r => r.bodyBox && r.cellBoxes.length === 1 && r.bodyBox.h <= r.cellBoxes[0].h + 20)(open.find(r => r.id === 'jewelcrafting')),
    (r => `frame=${r.bodyBox && r.bodyBox.h} cell=${r.cellBoxes[0] && r.cellBoxes[0].h}`)(open.find(r => r.id === 'jewelcrafting')));
  /* Curtis (2026-09): materials are compact CELLS, three columns of two, so a
     dense recipe grows by two short rows instead of one row per material.
     Control: restore the old `minmax(260px, 1fr)` track and Construction
     reports two columns of three here and ONE column at the live width. */
  const gridOf = r => ({ cols: new Set(r.cellBoxes.map(b => Math.round(b.x))).size,
    rows: new Set(r.cellBoxes.map(b => Math.round(b.y))).size, n: r.cellBoxes.length });
  check('six materials lay out as three columns of two',
    (g => g.n === 6 && g.cols === 3 && g.rows === 2)(gridOf(open.find(r => r.id === 'construction'))),
    JSON.stringify(gridOf(open.find(r => r.id === 'construction'))));
  /* A cell keeps name and count on ONE line while it has the room. A forced
     stack cost a single-material card a whole line for nothing. Control:
     set the material cell back to `flex-direction: column` and the one cell on
     Jewelcrafting measures ~42px instead of ~26px. */
  check('a single material cell is one line tall',
    (r => r.cellBoxes.length === 1 && r.cellBoxes[0].h <= 30)(open.find(r => r.id === 'jewelcrafting')),
    (r => `h=${r.cellBoxes.map(b => Math.round(b.h)).join('/')}`)(open.find(r => r.id === 'jewelcrafting')));
  /* ONE grid per card. The summary that used to sit here repeated a single
     material line verbatim ("Moonsilk 0/8"), so it matched the renderer's
     ingredient pattern and was marked as a second ingredient SOURCE - which
     built a second grid after it, grew the card, flushed, and tore it down
     again. Measured, the height alternated 213.5 / 156.6 EVERY FRAME forever.
     flush-quiescence cannot see it: the oscillation is driven by the game's
     own renderer reacting to a skin node, not by the skin writing to itself.
     The summary is gone, but the info frame repeats the same text, so the
     exclusion it needs is the same one and this check still guards it. */
  check('each card has exactly one material grid',
    open.every(r => r.gridCount <= 1),
    open.map(r => `${r.id}=${r.gridCount}`).join(' '));
  check('the native material section never paints; the skin builds the rows',
    open.every(r => !r.materialsShown) && open.every(r => !r.summary),
    open.map(r => `${r.id} grid=${r.materialsShown} sum=${JSON.stringify(r.summary)}`).join(' '));
  /* The stack, as specified: title, then the BASE chip directly under it, then
     the info frame. The MECHANISM, not just the height - the height checks
     pass on any number of arrangements, so without this the stack is unpinned.
     A gap much over a line means the old loose column is back. */
  /* Curtis (2026-09): BASE sits BESIDE the action name, centred on it. The
     fixture carries both DOM shapes - a title that is a direct child of the
     content zone and one the game wraps in a branch of its own (Tailoring) -
     because a rule keyed on the direct child is exactly what painted the chip
     above the title live. Control: key the title cell on
     `> [data-iw-skill-role="action-title"]` alone and Tailoring's chip leaves
     the title row. */
  check('BASE sits beside the title, not above or below it',
    open.every(r => r.titleBox && r.chipBox
      && r.chipBox.x >= r.titleBox.x + r.titleBox.w - 1
      && r.chipBox.x - (r.titleBox.x + r.titleBox.w) <= 20),
    open.map(r => `${r.id} titleEnd=${round1(r.titleBox.x + r.titleBox.w)} chip=${r.chipBox && r.chipBox.x}`).join(' '));
  check('BASE is vertically centred on the title text',
    open.every(r => Math.abs((r.chipBox.y + r.chipBox.h / 2) - (r.titleBox.y + r.titleBox.h / 2)) <= 2),
    open.map(r => `${r.id} d=${round1((r.chipBox.y + r.chipBox.h / 2) - (r.titleBox.y + r.titleBox.h / 2))}`).join(' '));
  /* A card with nothing in its frame and nothing on its foot row is a title
     and a chip, so the title row takes the card's middle line rather than its
     top - by the same spacer rows as every other stack. */
  check('a title-only card centres its title on the card',
    ['spellcrafting', 'woodcutting'].every(id => (r => Math.abs((r.titleBox.y + r.titleBox.h / 2) - (r.card.y + r.card.h / 2)) <= 3)(open.find(x => x.id === id))),
    ['spellcrafting', 'woodcutting'].map(id => (r => `${id} d=${round1((r.titleBox.y + r.titleBox.h / 2) - (r.card.y + r.card.h / 2))}`)(open.find(x => x.id === id))).join(' '));
  /* The icon is a SIBLING of its button. Both are placed from 50% of their
     containing block, and only siblings are guaranteed to share one - so this
     holds against any wrapper the game puts round the button, including ones
     the stylesheet's containing-block reset does not list. On this page that
     reset already makes zone and wrapper coincide, so the geometry checks
     cannot tell the two placements apart; the structure is asserted instead.
     Control: append the icon to the command zone again and this fails. */
  check('every action icon shares its parent with its button',
    await page.evaluate(ids => ids.every(id => { const c = document.getElementById(id);
      const b = c.querySelector('[data-iw-skill-role="action-button"]'), g = c.querySelector('[data-iw-skill-v2-action-glyph]');
      return b && g && g.parentElement === b.parentElement; }), ids));
  check('the page carries a bare action button that is its own command zone',
    await page.evaluate(() => !!document.querySelector('#construction [data-iw-skill-role="action-button"][data-iw-skill-zone="commands"]')));
  check('the page carries a wrapped command cell, so that shape is tested',
    await page.evaluate(() => !!document.querySelector('#jewelcrafting [data-iw-skill-zone="commands"] > div > [data-iw-skill-role="action-button"]')));
  check('the page carries a wrapped title, so the nested shape is tested',
    open.some(r => r.id === 'tailoring'));
  /* The zone also holds the game's own zero-height and clipped nodes, and a
     row gap is spent once per grid row they create. Control: give the content
     zone a 6px row gap and the frame starts ~30px below the title row. */
  check('the info frame follows the title row without a dead band',
    framed.every(r => { const rowEnd = Math.max(r.titleBox.y + r.titleBox.h, r.chipBox.y + r.chipBox.h);
      return r.bodyBox.y >= rowEnd - 1 && r.bodyBox.y - rowEnd <= 30; }),
    framed.map(r => `${r.id} gap=${round1(r.bodyBox.y - Math.max(r.titleBox.y + r.titleBox.h, r.chipBox.y + r.chipBox.h))}`).join(' '));
  check('the hero column is only as wide as the hero needs',
    uniq(open.map(r => r.identityW)).length === 1 && open[0].identityW <= 150,
    String(open[0].identityW));
  check('the command column is only as wide as the compact button',
    uniq(open.map(r => r.commandW)).length === 1 && open[0].commandW <= 130,
    String(open[0].commandW));

  /* 8. The compact hero action button. Control: revert compactCommandButton and
     the box goes back to 155x44, a landscape plaque. */
  check('the command button is compact and portrait on every card',
    open.every(r => r.button && r.button.w <= 90 && r.button.h >= r.button.w * 0.7),
    open.map(r => `${r.id} ${r.button.w}x${r.button.h}`).join(' '));
  check('the command label fits its narrower button on every card',
    open.every(r => !r.clipped.some(c => c.includes('action-button'))),
    open.flatMap(r => r.clipped.filter(c => c.includes('action-button')).map(c => r.id + ':' + c)).join(' ') || 'none');
  check('the command button is one size across every card',
    uniq(open.map(r => r.button.w + 'x' + r.button.h)).length === 1);
  check('the command button uses the dedicated square graphic artwork',
    open.every(r => /card-v6\/action-atlas\.png/.test(r.buttonBg)),
    open[0].buttonBg);
  check('the command button carries the discipline glyph',
    open.every(r => r.glyph && /url\(/.test(r.glyphBg)),
    open.map(r => r.id + ':' + (r.glyph ? 'yes' : 'no')).join(' '));
  check('the game-owned action text is mirrored above every button frame',
    open.every(r => r.actionLabel && r.actionLabelText === r.buttonText),
    open.map(r => `${r.id}:${r.actionLabelText || 'missing'}`).join(' '));
  check('the visual action label renders in all capitals',
    open.every(r => r.actionLabelTransform === 'uppercase'),
    open.map(r => `${r.id}:${r.actionLabelTransform || 'none'}`).join(' '));
  check('the visual action label uses the skill heading typeface',
    open.every(r => r.actionLabelFont === r.titleFont),
    open.map(r => `${r.id}:${r.actionLabelFont} / ${r.titleFont}`).join(' '));
  check('the native action text takes no visual space inside the framed button',
    open.every(r => r.buttonFont === 0),
    open.map(r => `${r.id}:${r.buttonFont}px`).join(' '));
  /* Curtis's own artwork (2026-09), one icon per discipline, imported from his
     EPS by build-tools/import-action-icons.mjs. The URL alone proves nothing -
     a missing file still computes a perfectly good background-image - so each
     one is also DECODED below. Control: point a rule at the wrong file and
     "is its own discipline's" fails; delete an SVG and "decodes" fails. */
  check('each action icon is its own discipline\'s',
    open.every(r => r.glyphIcon === r.id),
    open.map(r => `${r.id}:${r.glyphIcon}`).join(' '));
  const decoded = await page.evaluate(urls => Promise.all(urls.map(u => {
    const img = new Image(); img.src = u;
    return img.decode().then(() => img.naturalWidth > 0, () => false);
  })), open.map(r => r.glyphUrl));
  check('every action icon actually decodes', decoded.every(Boolean),
    open.map((r, i) => `${r.id}:${decoded[i]}`).join(' '));
  check('the glyph is centred on the button on every card',
    open.every(r => r.glyph && Math.abs(r.glyph.cx - r.button.cx) <= 1),
    open.map(r => `${r.id} ${r.glyph ? round1(r.glyph.cx - r.button.cx) : 'no icon'}`).join(' '));
  check('every glyph box keeps a safe margin inside its action frame',
    open.every(r => r.glyph
      && r.glyph.x - r.button.x >= 14
      && r.button.x + r.button.w - (r.glyph.x + r.glyph.w) >= 14
      && r.glyph.y - r.button.y >= 14
      && r.button.y + r.button.h - (r.glyph.y + r.glyph.h) >= 14),
    open.map(r => r.glyph ? `${r.id} ${round1(r.glyph.x - r.button.x)}/${round1(r.glyph.y - r.button.y)}/${round1(r.button.x + r.button.w - r.glyph.x - r.glyph.w)}/${round1(r.button.y + r.button.h - r.glyph.y - r.glyph.h)}` : `${r.id} missing`).join(' '));
  const responsiveGlyph = await page.evaluate(() => {
    const card = document.querySelector('#jewelcrafting');
    const btn = card.querySelector('[data-iw-skill-role="action-button"]');
    const glyph = card.querySelector('[data-iw-skill-v2-action-glyph]');
    const sample = () => { const b = btn.getBoundingClientRect(), g = glyph.getBoundingClientRect();
      return { buttonW: b.width, buttonH: b.height, glyphW: g.width, glyphH: g.height,
        left: g.left - b.left, top: g.top - b.top, right: b.right - g.right, bottom: b.bottom - g.bottom }; };
    const before = sample();
    card.style.setProperty('--iw-skill-v2-btn-w', '80px');
    card.style.setProperty('--iw-skill-v2-btn-h', '82px');
    const after = sample();
    card.style.removeProperty('--iw-skill-v2-btn-w');
    card.style.removeProperty('--iw-skill-v2-btn-h');
    return { before, after };
  });
  check('the glyph scales with the available button interior',
    responsiveGlyph.after.glyphW > responsiveGlyph.before.glyphW
      && responsiveGlyph.after.glyphH > responsiveGlyph.before.glyphH,
    `${round1(responsiveGlyph.before.glyphW)} -> ${round1(responsiveGlyph.after.glyphW)}`);
  check('a dynamically enlarged glyph preserves the safe frame margin',
    ['left','top','right','bottom'].every(k => responsiveGlyph.after[k] >= 14),
    ['left','top','right','bottom'].map(k => `${k}=${round1(responsiveGlyph.after[k])}`).join(' '));

  /* 9. The pager is demoted, and no longer sets the card's height. Control:
     restore 26x44 and the three pager cards grow past the simple ones. */
  const paged = open.filter(r => r.nav.length);
  check('the pager exists only on the cards that ship one', paged.length === 4,
    paged.map(r => r.id).join(','));
  check('each pager arrow is smaller than the command button',
    paged.every(r => r.nav.every(n => n.w < r.button.w / 2 && n.h < r.button.h / 2)),
    paged.map(r => `${r.id} ${r.nav[0].w}x${r.nav[0].h}`).join(' '));
  /* Curtis's reference draws the pair as TABS directly under the action and
     exactly as wide as it. Both halves matter: a pair narrower than the button
     reads as the old loose chevrons, and a pair wider than it breaks the
     column's one vertical rhythm. Control: revert the pager's width token to
     the old 22px literal and the pair measures 48 against an 82px button. */
  check('the two arrows together are exactly as wide as the button they page',
    paged.every(r => Math.abs((r.nav[r.nav.length - 1].x + r.nav[r.nav.length - 1].w - r.nav[0].x) - r.button.w) <= 1),
    paged.map(r => `${r.id} nav=${round1(r.nav[r.nav.length - 1].x + r.nav[r.nav.length - 1].w - r.nav[0].x)} btn=${r.button.w}`).join(' '));
  check('the arrows are centred under the button, not against the column edge',
    paged.every(r => Math.abs(r.navGroup.cx - r.button.cx) <= 1),
    paged.map(r => `${r.id} ${round1(r.navGroup.cx - r.button.cx)}`).join(' '));
  /* The pager ships in EITHER branch and must land in the command column
     either way. In the content branch the base sheet already positions it
     absolutely with its own left/bottom/height and a translateX(-50%); leaving
     any of those standing parks it mid-card, which is how it was reported. */
  check('both pager branches are represented, so neither rule is untested',
    new Set(paged.map(r => r.navGroup.branch)).size === 2,
    paged.map(r => `${r.id}:${r.navGroup.branch}`).join(' '));
  check('the pager carries no inherited transform',
    paged.every(r => r.navGroup.transform === 'none'),
    paged.map(r => `${r.id} ${r.navGroup.transform}`).join(' '));
  check('the pager lands in the command column whichever branch ships it',
    paged.every(r => r.navGroup.cx >= r.card.x + r.card.w - open[0].commandW - 2),
    paged.map(r => `${r.id} cx=${r.navGroup.cx} col>=${round1(r.card.x + r.card.w - open[0].commandW)}`).join(' '));
  check('the pager sits under the button it pages, not beside the content',
    paged.every(r => r.nav.every(n => n.y >= r.button.y + r.button.h - 1)),
    paged.map(r => `${r.id} btn=${r.button.y + r.button.h} nav=${r.nav[0].y}`).join(' '));
  check('the pager never overlaps the button it pages',
    paged.every(r => r.navGroup.y >= r.button.y + r.button.h - 1),
    paged.map(r => `${r.id} btn=${round1(r.button.y + r.button.h)} nav=${r.navGroup.y}`).join(' '));
  check('the pager stays inside its card',
    paged.every(r => r.navGroup.y + r.navGroup.h <= r.card.y + r.card.h + 1),
    paged.map(r => `${r.id} nav=${round1(r.navGroup.y + r.navGroup.h)} card=${round1(r.card.y + r.card.h)}`).join(' '));
  /* Curtis (2026-09), twice: the arrows were hidden under the action button.
     The button, its glyph and its arrows are ONE group now, centred on the
     card, with a fixed buffer between button and arrows - all placed from the
     column's middle, so no in-flow node the live DOM carries above the button
     can push it onto them. Controls, both measured: anchor the arrows to the
     card's foot again and the buffer reads ~15px with the group ~3px off
     centre; put the button back in flow and the buffer reads ~21px with the
     group ~6px off centre. */
  /* Centred on the HERO COLUMN, which on a wide card spans the whole card (so
     this is the card's middle, as before) and on a phone card spans only the
     top band that the command column shares; the info frame and the note are
     full-width rows under that band there (mobile audit, 2026-09). */
  const commandGroup = r => { const top = r.actionLabel?.y ?? r.button.y;
    const bottom = r.navGroup ? r.navGroup.y + r.navGroup.h : r.button.y + r.button.h;
    return { top, bottom, mid: (top + bottom) / 2, cardMid: r.identityBox.y + r.identityBox.h / 2 }; };
  const groupChecks = (label, set) => {
    const pagedHere = set.filter(r => r.navGroup);
    check(`${label}: a fixed buffer separates the button from its arrows`,
      pagedHere.length > 0 && pagedHere.every(r => { const b = r.navGroup.y - (r.button.y + r.button.h); return b >= 6 && b <= 10; }),
      pagedHere.map(r => `${r.id} buffer=${round1(r.navGroup.y - (r.button.y + r.button.h))}`).join(' '));
    check(`${label}: the command group is centred vertically on the hero column`,
      set.every(r => (g => Math.abs(g.mid - g.cardMid) <= 1.5)(commandGroup(r))),
      set.map(r => (g => `${r.id} d=${round1(g.mid - g.cardMid)}`)(commandGroup(r))).join(' '));
    check(`${label}: the action label sits above its button frame`,
      set.every(r => r.actionLabel && r.actionLabel.y + r.actionLabel.h <= r.button.y
        && r.button.y - (r.actionLabel.y + r.actionLabel.h) >= 3
        && r.button.y - (r.actionLabel.y + r.actionLabel.h) <= 5),
      set.map(r => `${r.id} gap=${r.actionLabel ? round1(r.button.y - r.actionLabel.y - r.actionLabel.h) : 'missing'}`).join(' '));
    check(`${label}: the glyph is centred within the button frame`,
      set.every(r => r.glyph
        && Math.abs(r.glyph.cx - r.button.cx) <= 1
        && Math.abs(r.glyph.cy - r.button.cy) <= 1),
      set.map(r => `${r.id} d=${r.glyph ? `${round1(r.glyph.cx - r.button.cx)},${round1(r.glyph.cy - r.button.cy)}` : 'missing'}`).join(' '));
    /* The label is always ONE line inside the button with a buffer both sides
       (Curtis, 2026-09: "CRAFT PARTS" wrapped). The size is fitted per label by
       SkillCardDesignController.fitActionLabel. Controls: remove the fit call
       and CRAFT PARTS overflows at 9.5px; drop the button's inline width from
       its cache key and it is measured in the legacy button and never shrinks. */
    check(`${label}: every action label is one line inside its buffer`,
      set.every(r => r.labelFit.lines === 1 && r.labelFit.text <= r.labelFit.room + 0.5 && r.labelFit.pad >= 3),
      set.map(r => `${r.id} "${r.labelFit.label}" ${r.labelFit.size}px lines=${r.labelFit.lines} ${r.labelFit.text}/${r.labelFit.room}`).join(' '));
    check(`${label}: the glyph stays inside its button`,
      set.every(r => r.glyph && r.glyph.y >= r.button.y && r.glyph.y + r.glyph.h <= r.button.y + r.button.h),
      set.map(r => `${r.id} glyph=${r.glyph ? `${r.glyph.y}..${round1(r.glyph.y + r.glyph.h)}` : 'none'} btn=${r.button.y}..${round1(r.button.y + r.button.h)}`).join(' '));
  };
  groupChecks('1100px', open);
  check('action labels retain the readable ceiling when they fit above the frame',
    open.every(r => r.labelFit.size === 9.5),
    open.map(r => `${r.id}:${r.labelFit.size}`).join(' '));
  /* No ground behind the title row (Curtis, 2026-09): the content zone spans
     only that row, so its wash drew a lighter box that ended under the title.
     Control: put the gradient back and this reports it. */
  check('the title row paints no ground of its own',
    open.every(r => r.contentGround === 'none'), open.map(r => `${r.id}:${r.contentGround.slice(0, 30)}`).join(' '));

  /* A chevron is a rotated border corner on a pseudo-element, so no rect exists
     for it: its INK is isolated by screenshotting each arrow with and without
     the ::before and diffing. Two defects, both measured before the fix: the
     rotated corner sits (7 - 2) / (2 x sqrt2) = 1.77px toward its point, and
     in a grid plate the game's own font-size-0 glyph became a second grid item
     that pushed every chevron ~3px high. Controls, measured: drop the translate
     and the prev/next pair reads 0 and 2px; make the plate a grid again and
     dy reads -2.5 to -3.5. This page renders
     at DPR 1, so ink is quantised to half a pixel and the tolerance is 1px. */
  await page.addStyleTag({ content: 'body.ink-hide-chevron [data-iw-skill-role="nav-button"]::before { visibility: hidden !important; }' });
  const chevronInk = async el => {
    const b = await el.boundingBox();
    const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
    const lit = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(() => document.body.classList.add('ink-hide-chevron'));
    const dark = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(() => document.body.classList.remove('ink-hide-chevron'));
    return page.evaluate(async ({ lit, dark, clip }) => {
      const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
      const [a, b] = await Promise.all([load(lit), load(dark)]);
      const w = a.naturalWidth, h = a.naturalHeight;
      const read = img => { const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, w, h).data; };
      const da = read(a), db = read(b);
      let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
      /* Exclude the two-pixel artwork perimeter: subpixel sampling of the
         graphic rim can vary between captures by a single fringe pixel.
         The chevron and the known 3px misalignment controls are inside it. */
      for (let py = 2; py < h - 2; py++) for (let px = 2; px < w - 2; px++) {
        const i = (py * w + px) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) <= 24) continue;
        n++; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      const sx = clip.width / w, sy = clip.height / h;
      return { n, dx: (((x0 + x1 + 1) / 2) * sx) - clip.width / 2, dy: (((y0 + y1 + 1) / 2) * sy) - clip.height / 2 };
    }, { lit, dark, clip });
  };
  const inks = [];
  for (const id of ids) for (const el of await page.$$(`#${id} [data-iw-skill-role="nav-button"]`)) inks.push({ id, ...(await chevronInk(el)) });
  /* A check reporting zero ink is broken, not passing. */
  check('every chevron paints measurable ink', inks.length === 8 && inks.every(m => m.n > 10),
    inks.map(m => `${m.id}:${m.n}`).join(' '));
  check('every chevron is centred on its arrow button',
    inks.every(m => Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1),
    inks.map(m => `${m.id} ${round1(m.dx)},${round1(m.dy)}`).join(' '));

  /* The ACTIVE skill's fill (Curtis, 2026-09: the progress bar across the
     action button was very difficult to see). The game's own span is restyled,
     never replaced, so three things are asserted: its width is still the game's
     inline value; it paints a clearly visible band (isolated by screenshotting
     with the span hidden and shown and diffing only the span's own rect); and
     the label and icon paint ABOVE it, read on the bright ink pixels of the
     starting card, whose fill covers both. Controls are listed in CLAUDE.md. */
  await page.addStyleTag({ content: 'body.ink-hide-fill button[data-iw-skill-role="action-button"] > span[style*="width"] { visibility: hidden !important; }' });
  const fillPaint = async id => {
    const geo = await page.evaluate(id => {
      const btn = document.querySelector(`#${id} button[data-iw-skill-role="action-button"]`);
      const fill = btn?.querySelector(':scope > span[style*="width"]');
      if (!fill) return null;
      const b = btn.getBoundingClientRect(), f = fill.getBoundingClientRect();
      return { btn: { x: b.x, y: b.y, width: b.width, height: b.height }, fill: { x: f.x, y: f.y, width: f.width, height: f.height },
        share: f.width / btn.clientWidth, inline: fill.style.width };
    }, id);
    if (!geo || !(geo.fill.width > 0)) return geo;
    const clip = geo.btn;
    const lit = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(() => document.body.classList.add('ink-hide-fill'));
    const dark = (await page.screenshot({ clip })).toString('base64');
    await page.evaluate(() => document.body.classList.remove('ink-hide-fill'));
    const paint = await page.evaluate(async ({ lit, dark, clip, fill }) => {
      const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
      const [a, b] = await Promise.all([load(lit), load(dark)]);
      const w = a.naturalWidth, h = a.naturalHeight;
      const read = img => { const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, w, h).data; };
      const da = read(a), db = read(b);
      /* Inside the fill's rect, 6px in from the button's edges so the frame's
         own rules are not sampled. */
      const x0 = Math.max(6, Math.ceil(fill.x - clip.x)), x1 = Math.min(w - 6, Math.floor(fill.x - clip.x + fill.width) - 3);
      let sum = 0, n = 0; const ink = [];
      for (let py = 6; py < h - 6; py++) for (let px = x0; px < x1; px++) {
        const i = (py * w + px) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        sum += d; n++;
        if ((db[i] + db[i + 1] + db[i + 2]) / 3 > 215) ink.push(d);
      }
      ink.sort((p, q) => p - q);
      return { mean: n ? sum / n : 0, n, inkN: ink.length, ink90: ink.length ? ink[Math.floor(ink.length * 0.9)] : null };
    }, { lit, dark, clip, fill: geo.fill });
    return { ...geo, ...paint };
  };
  const running = await fillPaint('woodcutting');
  const starting = await fillPaint('spellcrafting');
  check('the activity fill keeps the game width (40% running, 100% starting)',
    running && starting && Math.abs(running.share - 0.4) < 0.02 && Math.abs(starting.share - 1) < 0.02,
    `running=${running && round1(running.share * 100)}% (${running?.inline}) starting=${starting && round1(starting.share * 100)}% (${starting?.inline})`);
  check('the activity fill paints a clearly visible band',
    running && starting && running.n > 100 && running.mean >= FILL_MEAN_FLOOR && starting.mean >= FILL_MEAN_FLOOR,
    `running mean=${running && round1(running.mean)} n=${running?.n} starting mean=${starting && round1(starting.mean)}`);
  check('the label and icon paint above the activity fill',
    starting && starting.inkN > 20 && starting.ink90 <= 30,
    `ink pixels=${starting?.inkN} p90 delta=${starting?.ink90}`);

  /* The fill MOVES smoothly (Curtis, 2026-09: "it jumps as it progresses").
     The game rewrites the width from a 250ms setInterval as
     max(8, elapsed % duration), so this drives Woodcutting's span exactly
     that way through two 2s repetitions and samples the RENDERED width every
     animation frame. Three things are read: how many frames of motion stand
     still (a stepped fill holds ~14 of every 15), the largest single-frame
     jump away from a completion (a stepped fill jumps a whole 12.5% tick), and
     whether the completion SNAPS - a transition left on for it slides the band
     backwards across the button over several frames. */
  const motion = await page.evaluate(async () => {
    const btn = document.querySelector('#woodcutting button[data-iw-skill-role="action-button"]');
    const fill = btn.querySelector(':scope > span[style*="width"]');
    const DURATION = 2000, start = performance.now();
    const write = () => { const p = ((performance.now() - start) % DURATION) / DURATION * 100;
      fill.style.width = `${Math.max(8, p).toFixed(3)}%`; };
    write();
    const timer = setInterval(write, 250);
    const frames = [];
    await new Promise(done => {
      const step = () => {
        frames.push(fill.getBoundingClientRect().width / btn.clientWidth * 100);
        if (performance.now() - start < 4600) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    clearInterval(timer);
    fill.style.width = '40%';
    await new Promise(r => setTimeout(r, 600));
    const moving = [], jumps = [];
    let sliding = 0, drops = 0;
    for (let i = 1; i < frames.length; i++) {
      const d = frames[i] - frames[i - 1];
      if (d < -30) { drops++; continue; }
      if (d < -1) { sliding++; continue; }
      if (frames[i] <= 8.5 || frames[i - 1] <= 8.5) continue;
      moving.push(Math.abs(d) < 0.05);
      jumps.push(d);
    }
    return { n: frames.length, stillShare: moving.filter(Boolean).length / Math.max(1, moving.length),
      maxJump: Math.max(0, ...jumps), sliding, drops };
  });
  check('the activity fill moves every frame instead of in 250ms steps',
    motion.n > 120 && motion.stillShare <= 0.15 && motion.maxJump <= 3,
    `frames=${motion.n} still=${round1(motion.stillShare * 100)}% max jump=${round1(motion.maxJump)}%`);
  check('the activity fill snaps back at a completion instead of sliding',
    motion.drops >= 1 && motion.sliding === 0,
    `drops=${motion.drops} sliding frames=${motion.sliding}`);

  /* The button frames follow the CURRENT ZONE. A computed custom property is an
     un-evaluated token stream, so each token is painted onto a probe and read
     back as a real colour, then compared with what the button itself resolved.
     Swapping the theme attribute and reading again in the same task proves the
     frame tracks it - no flush runs in between. Control: put the literal
     #96bddf border back and the first check fails. */
  const themed = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-99px;border:1px solid var(--iw-th-hairline-hi);outline:1px solid var(--iw-th-edge-mid)';
    const card = document.querySelector('#construction');
    const frame = card.querySelector('[data-iw-skill-v2-body]');
    const chip = card.querySelector('.fs-skill-base-exp');
    document.body.append(probe);
    const btn = document.querySelector('#jewelcrafting [data-iw-skill-role="action-button"]');
    const nav = document.querySelector('#jewelcrafting [data-iw-skill-role="nav-button"]');
    const read = () => ({ token: getComputedStyle(probe).borderTopColor, edge: getComputedStyle(probe).outlineColor,
      button: getComputedStyle(btn).backgroundPosition, arrow: getComputedStyle(nav).backgroundPosition,
      buttonImage: getComputedStyle(btn).backgroundImage, arrowImage: getComputedStyle(nav).backgroundImage,
      card: getComputedStyle(card).borderTopColor, frame: getComputedStyle(frame).borderTopColor, chip: getComputedStyle(chip).borderTopColor });
    const root = document.documentElement, was = root.getAttribute('data-iw-zone-theme');
    const zone = read();
    root.setAttribute('data-iw-zone-theme', 'infernal');
    const infernal = read();
    root.setAttribute('data-iw-zone-theme', was);
    probe.remove();
    return { was, zone, infernal };
  });
  check('the action button frame is the current zone\'s colour',
    themed.zone.buttonImage.includes('card-v6/action-atlas.png'), `${themed.was}: ${themed.zone.buttonImage}`);
  check('the arrow button frame is the current zone\'s colour',
    themed.zone.arrowImage.includes('card-v6/nav-atlas.png'), `${themed.was}: ${themed.zone.arrowImage}`);
  /* The card itself - its border, the info frame and the BASE chip - follows
     the zone as well (Curtis, 2026-09: "the skill frames themselves need
     recolour to match the theme"). Control: put the literal #41596d card
     edge back and these fail. */
  check('the card, info frame and BASE chip frames are the current zone\'s colour',
    [themed.zone.card, themed.zone.frame, themed.zone.chip].every(c => c === themed.zone.edge),
    `${themed.was}: card=${themed.zone.card} frame=${themed.zone.frame} chip=${themed.zone.chip} token=${themed.zone.edge}`);
  check('the card frames follow a zone change',
    [themed.infernal.card, themed.infernal.frame, themed.infernal.chip].every(c => c === themed.infernal.edge)
      && themed.infernal.card !== themed.zone.card,
    `infernal card=${themed.infernal.card} token=${themed.infernal.edge}`);
  check('the frames follow a zone change',
    themed.infernal.button !== themed.zone.button && themed.infernal.arrow !== themed.zone.arrow
      && themed.infernal.buttonImage.includes('card-v6/action-atlas.png') && themed.infernal.arrowImage.includes('card-v6/nav-atlas.png'),
    `infernal button=${themed.infernal.button} token=${themed.infernal.token}`);

  /* No tabs at all (Curtis, 2026-09): materials and sources are the frame's
     default content, so there is nothing left to switch between. */
  check('no card carries a tab strip or a tab button',
    open.every(r => r.tabs.length === 0 && !r.tabsShown),
    open.map(r => `${r.id} tabs=${r.tabs.length}`).join(' '));
  /* The frame and the strip are rows of the CENTRE column, between the hero's
     divider and the command column's - which is what the reference draws. A
     row spanning all three columns is the shape this replaced. */
  check('the info frame stays inside the centre column',
    open.every(r => r.bodyW <= r.contentW),
    open.map(r => `${r.id} body=${r.bodyW} content=${r.contentW}`).join(' '));
  /* A requirement shows ONLY when it is not met, in small type on the foot
     row. Met or unmet is the game's own class (rule 5). Control: drop the
     `[data-iw-req-state="unmet"]` filter and Tailoring, which meets its
     requirement, grows a note. */
  const noteOf = id => open.find(r => r.id === id).note;
  check('an unmet requirement is shown on the foot row',
    /Requires Construction Lv 80 and Woodcutting Lv 70/.test(noteOf('construction')?.text || ''),
    String(noteOf('construction')?.text));
  check('a met requirement shows nothing',
    !noteOf('tailoring'), String(noteOf('tailoring')?.text));
  check('only the card with an unmet requirement carries a note',
    open.filter(r => r.note).map(r => r.id).join(',') === 'construction',
    open.filter(r => r.note).map(r => r.id).join(','));
  check('the requirement note sits under the frame, on its left edge',
    (r => r.note && r.bodyBox && r.note.y >= r.bodyBox.y + r.bodyBox.h - 1 && Math.abs(r.note.x - r.bodyBox.x) <= 1)(open.find(r => r.id === 'construction')),
    (r => `note=${r.note && r.note.x},${r.note && r.note.y} frame=${r.bodyBox.x},${round1(r.bodyBox.y + r.bodyBox.h)}`)(open.find(r => r.id === 'construction')));
  check('the requirement note is small type',
    (noteOf('construction')?.font || 99) <= 11, String(noteOf('construction')?.font));
  check('Construction\'s frame holds every ingredient',
    await page.locator('#construction .iw-skill-v2-body-row[data-iw-skill-v2-body-kind="material"]').count() === 6);
  check('a source line follows the materials in the same frame',
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#construction .iw-skill-v2-body-row')];
      const src = rows.findIndex(el => /Bloodoak Grove/.test(el.textContent));
      return src > 0 && rows.slice(0, src).every(el => el.dataset.iwSkillV2BodyKind === 'material');
    }));
  const nativeClicks = await page.evaluate(() => {
    const card = document.querySelector('#construction');
    let actions = 0, pages = 0;
    const action = card.querySelector('[data-iw-skill-role="action-button"]');
    const nav = card.querySelector('[data-iw-skill-role="nav-button"]');
    action.addEventListener('click', () => actions++);
    nav.addEventListener('click', () => pages++);
    action.click(); nav.click();
    return {actions, pages};
  });
  check('native action and recipe navigation still receive clicks',
    nativeClicks.actions === 1 && nativeClicks.pages === 1);

  /* THE LIVE WIDTH. The reported screenshot was taken at a raised pixel ratio;
     in CSS pixels the live card is ~700px wide and its frame ~400px, which is
     where the old 260px track floor forced one material per row. A 745px
     viewport reproduces that card. */
  await page.setViewportSize({ width: 745, height: 1400 });
  await page.waitForTimeout(400);
  const live = await page.evaluate(AUDIT, ids);
  check('at the live card width six materials are still three columns of two',
    (g => g.n === 6 && g.cols === 3 && g.rows === 2)(gridOf(live.find(r => r.id === 'construction'))),
    JSON.stringify(gridOf(live.find(r => r.id === 'construction'))) + ` card=${live.find(r => r.id === 'construction').card.w}`);
  groupChecks('live width', live);
  check('nothing is clipped at the live card width',
    live.every(r => !r.clipped.length),
    live.flatMap(r => r.clipped.map(c => r.id + ':' + c)).join(' ') || 'none');

  await page.setViewportSize({ width: 440, height: 1600 });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(AUDIT, ids);
  /* THE PHONE CARD (mobile audit, 2026-09). Under a 480px card the columns
     narrow into one top band - hero, name over BASE, command group - and the
     info frame and the note become full-width rows beneath it. The block this
     replaced stacked the card for the retired tabbed design, and at a phone
     width the arrows landed on the title, the button floated in a 146px band
     and a bare button sat on the requirement note. */
  const phoneFramed = narrow.filter(r => r.bodyBox);
  check('phone card: the info frame is a full-width row under the top band',
    phoneFramed.length > 0 && phoneFramed.every(r => r.bodyBox.y >= r.identityBox.y + r.identityBox.h - 1 && r.bodyBox.w >= r.card.w - 2 * 10 - 4),
    phoneFramed.map(r => `${r.id} frame y=${r.bodyBox.y} w=${r.bodyBox.w} band=${round1(r.identityBox.y + r.identityBox.h)} card=${r.card.w}`).join(' '));
  check('phone card: the BASE chip sits under the action name',
    narrow.every(r => r.titleBox && r.chipBox && r.chipBox.y >= r.titleBox.y + r.titleBox.h - 1),
    narrow.map(r => `${r.id} title=${r.titleBox ? round1(r.titleBox.y + r.titleBox.h) : '-'} chip=${r.chipBox ? r.chipBox.y : '-'}`).join(' '));
  check('phone card: the button and its arrows stay right of the name column',
    narrow.every(r => r.button && r.button.x >= r.zoneBox.x + r.zoneBox.w - 1 && (!r.navGroup || r.navGroup.x >= r.zoneBox.x + r.zoneBox.w - 1)),
    narrow.map(r => `${r.id} column=${round1(r.zoneBox.x + r.zoneBox.w)} btn=${r.button && r.button.x} nav=${r.navGroup ? r.navGroup.x : '-'}`).join(' '));
  groupChecks('440px', narrow);
  /* A frame too narrow for three cells must shed COLUMNS, never crush them.
     On a phone card the frame is a full-width row, so it only runs out of room
     for three cells on the narrowest phones - a 330px viewport here.
     Control: replace the `max(floor, third)` track with a plain
     `repeat(3, 1fr)` and the cells here measure under 96px wide. */
  await page.setViewportSize({ width: 330, height: 1600 });
  await page.waitForTimeout(400);
  const smallest = await page.evaluate(AUDIT, ids);
  check('a narrow frame sheds columns instead of crushing its cells',
    (r => r.cellBoxes.length === 6 && r.cellBoxes.every(b => b.w >= 96) && gridOf(r).cols < 3)(smallest.find(r => r.id === 'construction')),
    (r => `cols=${gridOf(r).cols} widths=${r.cellBoxes.map(b => Math.round(b.w)).join('/')} card=${r.card.w}`)(smallest.find(r => r.id === 'construction')));
  groupChecks('330px', smallest);
  check('the command label fits its button at 440px too',
    narrow.every(r => !r.clipped.some(c => c.includes('action-button'))),
    narrow.flatMap(r => r.clipped.filter(c => c.includes('action-button')).map(c => r.id + ':' + c)).join(' ') || 'none');
  await page.setViewportSize({ width: 1100, height: 1400 });

  /* LAST, because it changes the page. The renderer re-decides the layout only
     when the structure signature moves - a button's text or aria-label (its
     disabled state only on a LOCKED card: a busy toggle deciding no role must
     not re-derive, see tests/flush-quiescence.test.mjs) - and clears
     `data-iw-skill-layout` first. With the layout gone, none of the
     action icon's own rules apply, so a shell-child icon (Construction's) is an
     unstyled block while that decision is made; any host style that gives it
     height made it "an unknown visible branch" and the card fell back to the
     old theme for good. Reported live on Smithing and Alchemy. This models the
     host style and the button state change together. Control: drop the
     `[data-iw-skill-v2-action-glyph]` exclusion from unexpectedFlowChild and
     Construction loses its layout. */
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.addStyleTag({ content: '.iw-skill-v2-action-glyph { min-height: 12px; }' });
  await page.evaluate(() => {
    window.__layoutDrops = 0;
    /* The renderer clears and restores the attribute in one task, so the callback only ever sees it restored: count the records, not the final value. */ new MutationObserver(rs => { window.__layoutDrops += rs.length; })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-iw-skill-layout'] });
    /* A RELABEL: rewrite the button's own text node in upper case. That is a
       characterData record DOMWatcher sees, it moves the signature (text is
       compared exactly), and the action-verb test is case-insensitive, so the
       button keeps its role. A disabled flip no longer re-decides, by design;
       aria-label alone is not in DOMWatcher's attribute filter. Only the game's
       text node is touched, never the skin's appended icon/label nodes. */
    document.querySelectorAll('[data-iw-skill-role="action-button"]').forEach(b => {
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue.trim() && !n.parentElement.closest('[data-iw-skill-v2-action-glyph],[data-iw-skill-v2-action-label]')) {
          n.nodeValue = n.nodeValue.toUpperCase();
          break;
        }
      }
    });
  });
  await page.waitForTimeout(900);
  const redecided = await page.evaluate(ids => ({ drops: window.__layoutDrops,
    layouts: ids.map(id => `${id}:${document.getElementById(id).dataset.iwSkillLayout || 'NONE'}`) }), ids);
  /* A re-decision that never ran would pass for the wrong reason. */
  check('changing an action button makes the renderer re-decide the layout', redecided.drops > 0, String(redecided.drops));
  check('every card keeps its V2 layout through that re-decision',
    redecided.layouts.every(l => l.endsWith(':three-zone')), redecided.layouts.join(' '));

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

function round1(n) { return Math.round(n * 10) / 10; }

let failed = 0;
for (const c of cases) {
  console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.ok ? '' : `  [${c.detail}]`}`);
  if (!c.ok) failed++;
}
console.log(failed ? `\nFAIL skill-card-system (${failed}/${cases.length})`
  : `\nPASS skill-card-system (${cases.length} checks)`);
assert.equal(failed, 0, `${failed} skill card system check(s) failed`);
