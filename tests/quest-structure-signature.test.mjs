import { JSDOM } from 'jsdom';

/**
 * QuestPanelRenderer.annotateStructure() is gated by structureSignature().
 * A cache hit skips the role-discovery pass, so the signature must be:
 *   (a) INSENSITIVE to a pure value tick -- the objective count climbing,
 *       the progress percentage, the Skip "(n)" countdown -- or the cache
 *       never hits on an active quest and the guard is pointless;
 *   (b) SENSITIVE to anything that moves a role: a control appearing /
 *       disappearing, Turn In unlocking (disabled -> enabled), or the card
 *       gaining / losing a text line.
 * Mirrors tests/skill-structure-signature.test.mjs.
 */
const normText = value => String(value || '').replace(/\s+/g, ' ').trim();

// ---- logic copied verbatim from src/modules/QuestPanelRenderer.js --------
function textLeaves(root) {
  return [...root.querySelectorAll('p,span,div,strong,em,h1,h2,h3,h4')]
    .filter(el => !el.closest('button,a,[role="button"]'))
    .filter(el => {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && normText(n.textContent));
      return own && normText(el.textContent).length <= 220;
    });
}
function questButtons(card) {
  const all = [...card.querySelectorAll('button,[role="button"]')];
  let turnIn = null;
  let skip = null;
  for (const btn of all) {
    const label = normText(btn.textContent) || normText(btn.getAttribute('aria-label'));
    if (!turnIn && /turn\s*in/i.test(label)) turnIn = btn;
    else if (!skip && /^skip\b/i.test(label)) skip = btn;
  }
  return { turnIn, skip, all };
}
function findProgress(card) {
  for (const el of card.querySelectorAll('div')) {
    if (el.children.length !== 1) continue;
    const fill = el.firstElementChild;
    const width = String(fill?.style?.width || '').trim();
    if (!/%$/.test(width)) continue;
    const cls = `${el.className || ''} ${fill.className || ''}`;
    if (!/rounded-full|progress|bg-white\/10|bg-white\/5|\bh-1(?:\.5)?\b|\bh-2\b/i.test(cls)) continue;
    if (el.closest('button,a,[role="button"]')) continue;
    return { track: el, fill };
  }
  return { track: null, fill: null };
}
function structureSignature(card) {
  const { turnIn, skip } = questButtons(card);
  const btn = [turnIn, skip].filter(Boolean).map(b => {
    const disabled = (b.disabled || b.getAttribute('aria-disabled') === 'true') ? '1' : '0';
    const label = normText(b.textContent).replace(/\s*\(\d+\)\s*$/, '');
    return `${disabled}:${label}`;
  }).join('|');
  return `${textLeaves(card).length}|${btn}|${findProgress(card).track ? 't' : '-'}`;
}
// ------------------------------------------------------------------------

function buildCard(html) {
  const dom = new JSDOM(`<body><div class="compact-panel p-2.5">${html}</div></body>`);
  return dom.window.document.querySelector('.compact-panel');
}

const workOrder = () => buildCard(`
  <div class="space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-white">Night Claw Bounty</p>
        <p class="text-[11px] text-white/60">Bring back 100 Night Claws from Moonsteel Basin.</p>
        <p class="mt-1 text-[11px] text-white/45">Night Claw 22/100</p>
        <p class="mt-1 text-[11px] text-emerald-100/85">Reward: +3,225g • +1350 combat XP</p>
      </div>
      <div class="flex shrink-0 flex-col gap-2">
        <button disabled>Turn In</button>
        <button>Skip (8)</button>
      </div>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width: 22%"></div></div>
    <div class="text-[11px] text-white/45">22% complete</div>
  </div>
`);

const cases = [];
function check(label, expectSame, before, after) {
  const same = before === after;
  cases.push({ label, ok: same === expectSame, expectSame, same });
}

// (a) tick-insensitive: objective count, progress %, Skip countdown.
{
  const card = workOrder();
  const before = structureSignature(card);
  card.querySelectorAll('p')[2].textContent = 'Night Claw 87/100';
  card.querySelector('[style]').style.width = '87%';
  card.querySelectorAll('button')[1].textContent = 'Skip (3)';
  card.querySelector('.text-\\[11px\\].text-white\\/45').textContent = '87% complete';
  check('value ticks (count / % / Skip timer) do not invalidate', true, before, structureSignature(card));
}

// (b1) sensitive: Turn In unlocks.
{
  const card = workOrder();
  const before = structureSignature(card);
  card.querySelector('button').disabled = false;
  check('Turn In unlock (disabled -> enabled) invalidates', false, before, structureSignature(card));
}

// (b2) sensitive: the Skip control disappears.
{
  const card = workOrder();
  const before = structureSignature(card);
  card.querySelectorAll('button')[1].remove();
  check('Skip control removal invalidates', false, before, structureSignature(card));
}

// (b3) sensitive: a text line is added.
{
  const card = workOrder();
  const before = structureSignature(card);
  const extra = card.ownerDocument.createElement('p');
  extra.textContent = 'Expires in 4h';
  card.querySelector('.min-w-0').appendChild(extra);
  check('new text line invalidates', false, before, structureSignature(card));
}

let fail = 0;
console.log('case                                                    expect   got');
console.log('-'.repeat(70));
for (const c of cases) {
  if (!c.ok) fail += 1;
  console.log(`${c.label.padEnd(54)} ${String(c.expectSame).padEnd(8)} ${c.same}${c.ok ? '' : '  <-- FAIL'}`);
}
console.log('-'.repeat(70));
console.log(fail === 0 ? '\nPASS' : `\nFAIL - ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
