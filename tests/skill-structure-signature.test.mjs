import { JSDOM } from 'jsdom';

/**
 * SkillPanelRenderer.annotateStructure() is gated by structureSignature():
 * a cache hit skips the whole expensive discovery pass (the ~8x repeated
 * textCandidates() sweep this same change also memoized). That gate is only
 * safe if the signature is:
 *   (a) INSENSITIVE to a pure ticking-value change (XP/progress text) --
 *       otherwise the cache never hits and the optimization does nothing;
 *   (b) SENSITIVE to anything that could actually change which element
 *       plays which role -- skill type, a button's text/label, an unlock
 *       (disabled -> enabled), or the panel gaining/losing children.
 * This mirrors the cheapSignature idiom InventoryRenderer already uses; see
 * tests/inventory-root.test.mjs for the same verification style applied to
 * a different cached resolver.
 */
const normText = value => String(value || '').replace(/\s+/g, ' ').trim();

// ---- copied verbatim from src/modules/SkillPanelRenderer.js ---------------
function structureSignature(panel, type) {
  const buttonState = [...panel.querySelectorAll('button')].map(btn => {
    const disabled = (btn.disabled || btn.getAttribute('aria-disabled') === 'true') ? '1' : '0';
    return `${disabled}:${normText(btn.textContent)}:${normText(btn.getAttribute('aria-label'))}`;
  }).join('|');
  return `${type} ${panel.childElementCount} ${buttonState}`;
}
// -----------------------------------------------------------------------

function buildPanel(html) {
  const dom = new JSDOM(`<body><div class="compact-panel">${html}</div></body>`);
  return dom.window.document.querySelector('.compact-panel');
}

const basePanel = () => buildPanel(`
  <h2>Mining</h2>
  <p>12 XP</p>
  <p>Needs level 1</p>
  <div role="progressbar" aria-valuenow="10" aria-valuemax="100"></div>
  <button>Mine</button>
  <button aria-label="previous">‹</button>
`);

const cases = [];
function check(label, expectSame, sigBefore, sigAfter) {
  const same = sigBefore === sigAfter;
  const ok = same === expectSame;
  cases.push({ label, ok, expectSame, same });
}

// (a) tick-insensitive: XP/progress VALUE changes, nothing structural.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('p').textContent = '48 XP';
  panel.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', '55');
  const sigAfter = structureSignature(panel, 'mining');
  check('XP/progress tick does not invalidate', true, sigBefore, sigAfter);
}

// (b1) sensitive: skill type changes.
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  const sigAfter = structureSignature(panel, 'fishing');
  check('skill type change invalidates', false, sigBefore, sigAfter);
}

// (b2) sensitive: a button unlocks (disabled -> enabled), no text change.
{
  const panel = basePanel();
  panel.querySelector('button').disabled = true;
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('button').disabled = false;
  const sigAfter = structureSignature(panel, 'mining');
  check('button unlock (disabled -> enabled) invalidates', false, sigBefore, sigAfter);
}

// (b3) sensitive: a button's label changes (new action verb).
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  panel.querySelector('button').textContent = 'Prospect';
  const sigAfter = structureSignature(panel, 'mining');
  check('button relabel invalidates', false, sigBefore, sigAfter);
}

// (b4) sensitive: panel gains a child (structural change).
{
  const panel = basePanel();
  const sigBefore = structureSignature(panel, 'mining');
  const extra = panel.ownerDocument.createElement('div');
  extra.textContent = 'Base Reward: +5';
  panel.appendChild(extra);
  const sigAfter = structureSignature(panel, 'mining');
  check('panel child count change invalidates', false, sigBefore, sigAfter);
}

let fail = 0;
console.log('case                                              expect   got');
console.log('-'.repeat(66));
for (const c of cases) {
  if (!c.ok) fail += 1;
  console.log(`${c.label.padEnd(50)} ${String(c.expectSame).padEnd(8)} ${c.same}${c.ok ? '' : '  <-- FAIL'}`);
}
console.log('-'.repeat(66));
console.log(fail === 0 ? '\nPASS' : `\nFAIL - ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
