import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * SkillPanelRenderer.annotateStructure() is gated by structureSignature():
 * a cache hit skips the whole expensive discovery pass (clearStructureRoles,
 * repeated findBestText/textCandidates sweeps sorted through getComputedStyle,
 * and findProgress calling getBoundingClientRect, which forces layout). That
 * gate is only safe if the signature is:
 *   (a) INSENSITIVE to a pure ticking-value change (XP/progress text) --
 *       otherwise the cache never hits and the optimization does nothing;
 *   (b) SENSITIVE to anything that could actually change which element
 *       plays which role -- skill type, a button's text/label, an unlock
 *       (disabled -> enabled), or the panel gaining/losing children.
 *
 * TWO THINGS THIS TEST GOT WRONG BEFORE, both of which let a real regression
 * through while every case still printed ok:
 *
 *   1. It COPIED structureSignature into the test file. The copy passed its own
 *      cases forever while the real function drifted away from it — the
 *      "a check that cannot fail" family CLAUDE.md warns about. The function is
 *      now EXTRACTED FROM THE SOURCE and evaluated, so the test cannot pass
 *      against code that is not shipping.
 *
 *   2. Its tick case put the XP text in a <p>. Live, the "Lv N - X% • 4,120 to
 *      go" readout is a genuine <button> (CLAUDE.md: it carries
 *      title="Click to cycle XP display"), so it lands in the button sweep and
 *      its digits WERE part of the signature. Requirement (a) was therefore
 *      violated on every real panel — the signature changed several times a
 *      second on an active skill and annotateStructure re-ran its whole walk
 *      every tick, measured at 343ms of a 479ms profile. Case (a2) below is
 *      that live shape; revert `structureText` and it fails.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src/modules/SkillPanelRenderer.js');

const normText = value => String(value || '').replace(/\s+/g, ' ').trim();

/* ---- the REAL implementation, lifted out of the module ------------------ */
const source = await readFile(SRC, 'utf8');
const textDecl = source.match(/const structureText = [^\n]+;/);
const sigDecl = source.match(/function structureSignature\(panel, type\) \{[\s\S]*?\n\}/);
if (!textDecl || !sigDecl) {
  console.log('FAIL - could not extract structureText/structureSignature from ' + SRC +
    '\n       (the test must run the shipping function, not a copy)');
  process.exit(1);
}
const structureSignature = new Function('normText',
  `${textDecl[0]}\n${sigDecl[0]}\nreturn structureSignature;`)(normText);
/* ------------------------------------------------------------------------ */

function buildPanel(html) {
  const dom = new JSDOM(`<body><div class="compact-panel">${html}</div></body>`);
  return dom.window.document.querySelector('.compact-panel');
}

const basePanel = () => buildPanel(`
  <h2>Mining</h2>
  <p>12 XP</p>
  <p>Needs level 1</p>
  <div role="progressbar" aria-valuenow="10" aria-valuemax="100"></div>
  <button id="readout" title="Click to cycle XP display">Lv 20 - 34% &bull; 4,120 to go</button>
  <button id="action">Mine</button>
  <button aria-label="previous">&lsaquo;</button>
`);

const cases = [];
function check(label, expectSame, sigBefore, sigAfter) {
  const same = sigBefore === sigAfter;
  cases.push({ label, ok: same === expectSame, expectSame, same });
}

// (a1) tick-insensitive: XP/progress VALUE changes outside any control.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('p').textContent = '48 XP';
  panel.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', '55');
  check('XP/progress tick does not invalidate', true, sigBefore, structureSignature(panel, 'mining'));
}

// (a2) THE LIVE SHAPE: the readout is a <button> and its numbers tick.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('#readout').textContent = 'Lv 20 - 35% • 4,050 to go';
  check('readout BUTTON tick does not invalidate', true, sigBefore, structureSignature(panel, 'mining'));
}

// (a3) a level-up is still only a number: the roles have not moved.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('#readout').textContent = 'Lv 21 - 2% • 9,900 to go';
  check('level-up in the readout does not invalidate', true, sigBefore, structureSignature(panel, 'mining'));
}

// (b1) sensitive: skill type changes.
{
  const panel = basePanel();
  check('skill type change invalidates', false,
    structureSignature(panel, 'mining'), structureSignature(panel, 'fishing'));
}

// (b2) sensitive: a button unlocks (disabled -> enabled), no text change.
{
  const panel = basePanel();
  panel.querySelector('#action').disabled = true;
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('#action').disabled = false;
  check('button unlock (disabled -> enabled) invalidates', false, sigBefore, structureSignature(panel, 'mining'));
}

// (b3) sensitive: a button's label changes (new action verb).
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('#action').textContent = 'Prospect';
  check('button relabel invalidates', false, sigBefore, structureSignature(panel, 'mining'));
}

// (b4) sensitive: an equal-LENGTH relabel. Guards against the opposite bug --
// DOMWatcher's skill cache once keyed on text length and could not see this.
{
  const panel = basePanel();
  panel.querySelector('#action').textContent = 'Mine';
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('#action').textContent = 'Fish';
  check('equal-length relabel (Mine -> Fish) invalidates', false, sigBefore, structureSignature(panel, 'mining'));
}

// (b5) sensitive: panel gains a child (structural change).
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  const extra = panel.ownerDocument.createElement('div');
  extra.textContent = 'Base Reward: +5';
  panel.appendChild(extra);
  check('panel child count change invalidates', false, sigBefore, structureSignature(panel, 'mining'));
}

// (b6) sensitive: a button ARRIVES (the pager mounting). Digit-blanking must
// not collapse two different control sets onto one signature.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  const next = panel.ownerDocument.createElement('button');
  next.setAttribute('aria-label', 'next');
  next.textContent = '›';
  panel.querySelector('#action').after(next);
  check('a new control invalidates', false, sigBefore, structureSignature(panel, 'mining'));
}

let fail = 0;
console.log('case                                                    expect   got');
console.log('-'.repeat(72));
for (const c of cases) {
  if (!c.ok) fail += 1;
  console.log(`${c.label.padEnd(56)} ${String(c.expectSame).padEnd(8)} ${c.same}${c.ok ? '' : '  <-- FAIL'}`);
}
console.log('-'.repeat(72));
console.log(fail === 0 ? '\nPASS skill-structure-signature' : `\nFAIL - ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
