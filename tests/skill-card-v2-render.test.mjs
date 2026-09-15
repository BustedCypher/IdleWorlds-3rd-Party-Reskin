/* Skill Card V2 — what the card actually PAINTS, in a real browser.
 *
 * The two defects this pins were both invisible to every other suite here,
 * and both read as artwork problems rather than as cascade problems:
 *
 *   A. skillpanel.css zeroes the title's and the discipline name's own text and
 *      redraws each from `data-iw-clean-text` on `::before` — that is what
 *      strips the leading emoji. Any V2 rule that sets `font-size` on the
 *      ELEMENT un-hides the raw copy, and the card renders both: "Prospect
 *      Moonsteel OreProspect Moonsteel Ore". Computed style is perfectly
 *      correct on every node involved.
 *
 *   B. The level ring is a `::after` on the medallion, and TWO base rules own
 *      that pseudo-element — the atlas-ready block sets `display: none`, the
 *      three-zone block pins it to 7x7. V2 declared a conic-gradient, won the
 *      `background` contest, and still painted nothing, because it had not
 *      answered either of those by name. `getComputedStyle` reported the right
 *      gradient the whole time.
 *
 * So a computed-style check alone cannot see either one. This test counts
 * PAINTED occurrences of the copy and measures the ring's real box.
 *
 * Negative controls, all verified by reverting the fix:
 *   - put `font-size` back on [data-iw-skill-role="action-title"]  -> title count 2
 *   - drop `display: block` from the ring rule                     -> ring 0x0
 *   - drop `width/height: auto` from the ring rule                 -> ring 7x7
 *   - drop the identity-level line from the hide list              -> level count 2
 *   - drop the ::after border-image                                -> filigree "none"
 *   - take the filigree slice off-ratio (22x11)                    -> ratio 0.500
 *   - drop `border: 0` from the content zone                       -> 0 0 1px 0
 *   - disable the collapsed-materials un-clip                      -> grid h=1
 *   - drop `justify-content: flex-start` on material rows          -> center,center
 *   - put the collapsed toggle back in flow                        -> position static
 *
 * The toggle-overlap checks are geometry, so their own sensitivity was proven
 * separately rather than assumed: moving the toggle onto the material row
 * (top: 74px) makes "clears the material row" fail, which is the only way to
 * tell a passing overlap test from a broken one.
 *
 * The fixture carries a REAL material line. `ingredientEntries` builds the
 * grid from an `N/M` count, so copy like "Requires: 2 Moonsteel Ore" yields no
 * ingredient source, no grid, and no materials tab — the earlier fixture had
 * exactly that and left the whole tab untested. Both ingredient states are
 * present so rule 5 has something to protect.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');

/* The live card shape, verbatim from the reported screenshot: the title
   carries the action VERB, the identity branch carries BOTH the discipline
   name and its own level line, and the pager and command button sit in a third
   shell child — without all three, distinctZones never resolves and the panel
   silently falls back to the legacy layout, so the nodes under test would not
   exist and every check below would pass for the wrong reason. */
const CARD = `
<div class="compact-panel" id="card">
  <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
    <div><p>&#128142; Jewelcrafting</p><p>LV 70</p></div>
    <div>
      <p>Prospect Moonsteel Ore</p>
      <button>Lv 70 - 41.1% &bull; 4,120 to go</button>
      <p>Requires Jewelcrafting Lv 53 and Mining Lv 49</p>
      <p>Materials: &bull; Moonsteel Ore 3/2 &bull; Silver Dust 1/4</p>
      <p>Base reward: +677 jewelcrafting XP/task</p>
      <div><div style="width:41%"></div></div>
    </div>
    <div><div><button>&lsaquo;</button><button>&rsaquo;</button></div><button>Prospect</button></div>
  </div>
</div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}
button{background:none;font:inherit;color:inherit}body{margin:0;background:#0f172a}
.panel{padding:8px}.flex{display:flex}.grid{display:grid}.gap-2{gap:.5rem}</style>
</head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div><div><button>S</button></div></header>
<nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>&#129517; Zone 19: Eternium Verge</p></div>
  <div><button>&#127760; Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><h2>Skill Actions</h2>${CARD}</div>
</div></div><script>${bundle}</` + `script></body></html>`;

const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2' };
const ORIGIN = 'http://iw.test';

const cases = [];
const check = (label, ok, detail = '') => cases.push({ label, ok: !!ok, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname.endsWith('.html') || url.pathname === '/')
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
  try {
    const body = await readFile(resolve(ROOT, url.pathname.slice(1)));
    return route.fulfill({ contentType: MIME[extname(url.pathname)] || 'application/octet-stream', body });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});

try {
  await page.goto(`${ORIGIN}/skill-card-v2-render.html`, { waitUntil: 'load' });
  await page.waitForSelector('#card[data-iw-skill-v2="1"]', { timeout: 8000 });
  await page.waitForTimeout(900);

  /* The card must actually be in the three-zone shell with its atlas resolved,
     or none of the contested rules below are even in play. */
  const ground = await page.evaluate(() => {
    const card = document.querySelector('#card');
    return { design: document.documentElement.dataset.iwSkillCardDesign,
      layout: card.dataset.iwSkillLayout, ready: card.dataset.iwSkillsUiReady,
      progress: card.style.getPropertyValue('--iw-skill-v2-progress') };
  });
  check('the card boots into the new design', ground.design === 'new', ground.design);
  check('the card is in the three-zone shell', ground.layout === 'three-zone', ground.layout);
  check('the skills atlas resolved', ground.ready === '1', ground.ready);
  check('the ring is told the live percentage', ground.progress === '41.1%', ground.progress);

  /* A. Copy is painted ONCE. Count every visible occurrence of the string:
     the element's own text node if it still has a size, plus the ::before that
     redraws it. Anything above one is the doubling defect. */
  const copies = await page.evaluate(() => {
    const card = document.querySelector('#card');
    const count = (sel, needle) => {
      const el = card.querySelector(sel);
      if (!el) return -1;
      let n = 0;
      const own = getComputedStyle(el);
      const ownText = (el.textContent || '').replace(/\s+/g, ' ');
      if (parseFloat(own.fontSize) > 0 && own.display !== 'none' && ownText.includes(needle)) n++;
      for (const pseudo of ['::before', '::after']) {
        const s = getComputedStyle(el, pseudo);
        if (s.content && s.content !== 'none' && s.content.includes(needle)
          && s.display !== 'none' && parseFloat(s.fontSize) > 0) n++;
      }
      return n;
    };
    return {
      title: count('[data-iw-skill-role="action-title"]', 'Prospect Moonsteel Ore'),
      discipline: count('[data-iw-skill-role="identity"]', 'Jewelcrafting'),
    };
  });
  check('the action title is painted exactly once', copies.title === 1, `count=${copies.title}`);
  check('the discipline name is painted exactly once', copies.discipline === 1, `count=${copies.discipline}`);

  /* The emoji-free copy is what must survive: the ::before reads
     data-iw-clean-text, so a doubled card is also an emoji'd card. */
  const clean = await page.evaluate(() => {
    const el = document.querySelector('#card [data-iw-skill-role="identity"]');
    return { attr: el.dataset.iwCleanText, own: getComputedStyle(el).fontSize };
  });
  check('the discipline keeps its cleaned label', clean.attr === 'Jewelcrafting', clean.attr);
  check('the raw emoji copy stays suppressed', parseFloat(clean.own) === 0, clean.own);

  /* B. The ring is a real box carrying a real gradient. */
  const ring = await page.evaluate(() => {
    const art = document.querySelector('#card .fs-skill-medallion-art');
    const s = getComputedStyle(art, '::after');
    return { display: s.display, w: parseFloat(s.width), h: parseFloat(s.height),
      bg: s.backgroundImage, host: art.getBoundingClientRect().width };
  });
  check('the level ring is not display:none', ring.display !== 'none', ring.display);
  check('the level ring is a real box, not the base 7x7 speck',
    ring.w >= ring.host && ring.h >= ring.host, `${ring.w}x${ring.h} host=${ring.host}`);
  check('the level ring paints a conic gradient', /conic-gradient/.test(ring.bg), ring.bg.slice(0, 40));
  check('the ring gradient carries the live percentage', ring.bg.includes('41.1%'), ring.bg.slice(0, 80));

  /* Every native duplicate of that same number is gone. Four of them shipped
     down a 116px column in the reported capture. */
  const dupes = await page.evaluate(() => {
    const card = document.querySelector('#card');
    const out = {};
    for (const [key, sel] of [
      ['percent', '.fs-skill-identity-percent'],
      ['bar', '.fs-skill-identity-progress'],
      ['readoutButton', '[data-iw-skill-role="level-progress"]'],
      ['identityLevel', '[data-iw-skill-role="identity-level"]'],
    ]) {
      const el = card.querySelector(sel);
      out[key] = el ? getComputedStyle(el).display : 'absent';
    }
    /* The skin's own readout is the single survivor, and it stacks. */
    const readout = card.querySelector('[data-iw-skill-v2-level-readout]');
    const zone = card.querySelector('[data-iw-skill-zone="identity"]');
    out.readoutDir = readout ? getComputedStyle(readout).flexDirection : 'absent';
    out.readoutW = readout ? readout.getBoundingClientRect().width : 0;
    out.zoneW = zone ? zone.getBoundingClientRect().width : 0;
    return out;
  });
  for (const key of ['percent', 'bar', 'readoutButton', 'identityLevel']) {
    check(`native ${key} is hidden under V2`, dupes[key] === 'none', dupes[key]);
  }
  check('the skin readout stacks rather than running a row',
    dupes.readoutDir === 'column', dupes.readoutDir);
  check('the identity readout fits its column',
    dupes.readoutW > 0 && dupes.readoutW <= dupes.zoneW, `${dupes.readoutW} <= ${dupes.zoneW}`);

  /* The card frame: corner flourishes from the shared per-zone sheet, replacing
     the three-zone block's inner 1px rule, and no stray divider left inside. */
  const frame = await page.evaluate(() => {
    const card = document.querySelector('#card');
    const after = getComputedStyle(card, '::after');
    const content = card.querySelector('[data-iw-skill-zone="content"]');
    const cs = getComputedStyle(content);
    return {
      source: after.borderImageSource, slice: after.borderImageSlice,
      width: after.borderTopWidth + ' ' + after.borderRightWidth,
      ratio: parseFloat(after.borderRightWidth) / parseFloat(after.borderTopWidth),
      contentBorders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '),
    };
  });
  check('the card wears the shared corner filigree', /url\(/.test(frame.source), frame.source.slice(0, 40));
  /* Off-ratio is how the collapsed panel bars smeared their flourish: the
     source quadrant is 88x95, so the slice must stay near 0.93 wide-for-tall. */
  check('the filigree slice keeps the art ratio',
    frame.ratio > 0.88 && frame.ratio < 0.99, `${frame.width} -> ${frame.ratio.toFixed(3)}`);
  check('the content zone carries no stray divider',
    frame.contentBorders === '0px 0px 0px 0px', frame.contentBorders);

  /* REWRITTEN for the reference Curtis edited (2026-09). The collapse chevron
     is gone: the tabs are always visible at the foot of the card and the info
     frame is always built, so there is no collapsed state, no summary chip and
     no toggle to keep off the material row. What survives from the old block
     is the part that was never about collapsing — the native grid stays
     CLIPPED (the skin builds the visible rows from its text, and un-clipping
     the source rendered every section twice) and met-vs-unmet must still paint
     differently, which is rule 5. */
  const openCard = await page.evaluate(() => {
    const card = document.querySelector('#card');
    const grid = card.querySelector('[data-iw-skill-v2-section="materials"]');
    const rows = [...card.querySelectorAll('.iw-skill-v2-body-row')];
    const body = card.querySelector('[data-iw-skill-v2-body]');
    const box = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
    return {
      state: card.dataset.iwSkillV2State,
      expandControl: !!card.querySelector('[data-iw-skill-v2-expand]'),
      summary: !!card.querySelector('[data-iw-skill-v2-summary]'),
      gridH: Math.round(grid.getBoundingClientRect().height),
      rowStates: rows.map(el => el.dataset.iwSkillV2BodyState || ''),
      rowColours: rows.map(el => getComputedStyle(el).color),
      rowAligns: rows.map(el => getComputedStyle(el).textAlign),
      bodyBox: body ? box(body) : null,
      bodyBorder: body ? getComputedStyle(body).borderTopWidth : '0px',
      identity: box(card.querySelector('[data-iw-skill-zone="identity"]')),
      commands: box(card.querySelector('[data-iw-skill-zone="commands"]')),
      titleBottom: Math.round(card.querySelector('[data-iw-skill-role="action-title"]').getBoundingClientRect().bottom),
      tabCount: card.querySelectorAll('[data-iw-skill-v2-tab-button], [data-iw-skill-v2-tabs]').length,
    };
  });
  check('the card is always open and ships no collapse control',
    openCard.state === 'expanded' && !openCard.expandControl && !openCard.summary,
    `${openCard.state} expand=${openCard.expandControl} summary=${openCard.summary}`);
  check('the native material grid stays clipped', openCard.gridH <= 2, `h=${openCard.gridH}`);
  /* Rule 5: have-vs-need is the game's own signal and must survive the
     restyle, so the two states must still paint DIFFERENT colours. */
  check('met and unmet materials stay visually distinct',
    new Set(openCard.rowStates).size === 2 && new Set(openCard.rowColours).size === 2,
    `${openCard.rowStates.join(',')} -> ${openCard.rowColours.join(' | ')}`);
  check('material rows read left, like the concept strip',
    openCard.rowAligns.length > 0 && openCard.rowAligns.every(v => v === 'left' || v === 'start'),
    openCard.rowAligns.join(','));
  check('the info frame is drawn as a bordered panel',
    openCard.bodyBox && parseFloat(openCard.bodyBorder) >= 1, openCard.bodyBorder);
  /* The reference puts the frame in the CENTRE of the card, between the hero
     column's divider and the command column's. A frame that spans all three
     columns is the shape this replaced. */
  check('the info frame sits between the hero and command columns',
    openCard.bodyBox && openCard.bodyBox.x >= openCard.identity.right
      && openCard.bodyBox.right <= openCard.commands.x,
    `body=${openCard.bodyBox ? openCard.bodyBox.x + '..' + openCard.bodyBox.right : 'absent'} identity=${openCard.identity.right} commands=${openCard.commands.x}`);
  check('the info frame sits below the title',
    openCard.bodyBox && openCard.bodyBox.y > openCard.titleBottom,
    `${openCard.bodyBox && openCard.bodyBox.y} > ${openCard.titleBottom}`);
  /* No tabs (Curtis, 2026-09): materials and sources are the frame's default
     content, so a strip that switched between them is gone. */
  check('the card carries no tab strip', openCard.tabCount === 0, String(openCard.tabCount));

  /* The V2 card is the only design (Curtis, 2026-09): there is no old/new
     switch to click, and nothing may mount one. */
  const design = await page.evaluate(() => ({
    toggles: document.querySelectorAll('[data-iw-skill-design-toggle], [data-iw-skill-design]').length,
    root: document.documentElement.dataset.iwSkillCardDesign }));
  check('no old/new design switch is mounted', design.toggles === 0, String(design.toggles));
  check('the page stays on the V2 design', design.root === 'new', String(design.root));

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

let failed = 0;
for (const c of cases) {
  console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.ok ? '' : `  [${c.detail}]`}`);
  if (!c.ok) failed++;
}
console.log(failed ? `\nFAIL skill-card-v2-render (${failed}/${cases.length})`
  : `\nPASS skill-card-v2-render (${cases.length} checks)`);
assert.equal(failed, 0, `${failed} skill card V2 render check(s) failed`);
