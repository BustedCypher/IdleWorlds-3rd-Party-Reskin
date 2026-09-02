import { JSDOM } from 'jsdom';

/**
 * The page ships a hidden xl:hidden duplicate of the whole panel/header
 * stack (documented in CLAUDE.md; the same trap InventoryRenderer's
 * findInventoryRoot was hardened against). HeaderRenderer's findLiveHeader
 * and classifyAdjacent used to trust "first DOM match" for the <header>,
 * the main-nav, and the zone-bar -- if the hidden copy happened to come
 * first in document order, header artwork would silently bind to the
 * invisible element instead of the real one.
 *
 * jsdom never computes layout, so every element's rect is {w:0,h:0} by
 * default -- this test simulates the live page's signal directly by
 * overriding getBoundingClientRect on each element, exactly mirroring how
 * tests/inventory-root.test.mjs simulates the hidden xl:hidden column
 * structurally instead of visually.
 *
 * Each hidden decoy is placed BEFORE its visible counterpart in document
 * order, so a naive "first match wins" implementation picks the wrong one
 * -- proving the fix, and the negative control, actually do something.
 */
const html = `
<body>
  <header id="hidden-header">
    <h1>Combat Lv 12</h1>
    <p>Players Online: 42</p>
    <p>ATK 10 DEF 5 HP 100</p>
  </header>
  <header id="visible-header">
    <h1>Combat Lv 12</h1>
    <p>Players Online: 42</p>
    <p>ATK 10 DEF 5 HP 100</p>
  </header>

  <div id="hidden-nav" data-iw-ui="main-nav"></div>
  <div id="visible-nav" data-iw-ui="main-nav"></div>

  <div id="hidden-zone" data-iw-ui="zone-bar"></div>
  <div id="visible-zone" data-iw-ui="zone-bar"></div>
</body>`;

const dom = new JSDOM(html);
const d = dom.window.document;

for (const id of ['hidden-header', 'hidden-nav', 'hidden-zone']) {
  d.getElementById(id).getBoundingClientRect = () => ({ width: 0, height: 0 });
}
for (const id of ['visible-header', 'visible-nav', 'visible-zone']) {
  d.getElementById(id).getBoundingClientRect = () => ({ width: 960, height: 64 });
}

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();

// ---- the shipped (fixed) tie-break ------------------------------------
function isVisible(el) {
  const rect = el.getBoundingClientRect?.();
  return !!rect && (rect.width > 0 || rect.height > 0);
}
function pickVisible(candidates) {
  return candidates.find(isVisible) || candidates[0] || null;
}
function findLiveHeader() {
  const candidates = [...d.querySelectorAll('header')].filter(header => {
    const text = norm(header.textContent);
    return /combat\s+lv\s*\d+/i.test(text) &&
      /players\s+online\s*:\s*\d+/i.test(text) &&
      /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(text);
  });
  return pickVisible(candidates);
}
function findMainNav() {
  return pickVisible([...d.querySelectorAll('[data-iw-ui="main-nav"]')]);
}
function findZoneBar() {
  return pickVisible([...d.querySelectorAll('[data-iw-ui="zone-bar"]')]);
}

// ---- the previous implementation, as the negative control ------------------
function findLiveHeaderOld() {
  return [...d.querySelectorAll('header')].find(header => {
    const text = norm(header.textContent);
    return /combat\s+lv\s*\d+/i.test(text) &&
      /players\s+online\s*:\s*\d+/i.test(text) &&
      /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(text);
  }) || null;
}
function findMainNavOld() {
  return d.querySelector('[data-iw-ui="main-nav"]');
}
function findZoneBarOld() {
  return d.querySelector('[data-iw-ui="zone-bar"]');
}

const cases = [
  ['header', findLiveHeader, findLiveHeaderOld, 'visible-header'],
  ['main-nav', findMainNav, findMainNavOld, 'visible-nav'],
  ['zone-bar', findZoneBar, findZoneBarOld, 'visible-zone'],
];

let fail = 0;
let oldWrong = 0;
console.log('element     expected           fixed              previous');
console.log('-'.repeat(72));
for (const [label, fixedFn, oldFn, expect] of cases) {
  const got = fixedFn()?.id || 'null';
  const was = oldFn()?.id || 'null';
  const ok = got === expect;
  if (!ok) fail += 1;
  if (was !== expect) oldWrong += 1;
  console.log(
    `${label.padEnd(11)} ${expect.padEnd(18)} ${(got + (ok ? '' : '  <-- FAIL')).padEnd(18)} ${was}`
  );
}

console.log('-'.repeat(72));
console.log(`previous implementation wrong on ${oldWrong}/${cases.length} cases` +
  (oldWrong > 0 ? '  (control works: this test can fail)' : '  *** control useless ***'));
if (oldWrong === 0) fail += 1;
console.log(fail === 0 ? '\nPASS' : `\nFAIL - ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
