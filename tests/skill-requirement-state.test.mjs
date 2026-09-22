/* An unmet level requirement must ALWAYS be visible on the skill card.
 *
 * Curtis, 2026-09-22: on a card whose action the player is not levelled for,
 * the "Needs level N" note was missing until they tried the action or paged
 * to another one. SkillPanelRenderer resolved the requirement's met/unmet
 * state inside `annotateStructure`, behind a cache keyed on the skill type,
 * the panel's child count and its buttons - none of which move when the game
 * repaints the requirement line. So a line that turned red AFTER the card's
 * first pass (the player's level arriving, a paged-in recipe whose button
 * label is unchanged) kept the stale 'met' state, and the V2 foot-row note,
 * which only copies 'unmet', never appeared.
 *
 * The state is game STATE (rule 5), so it is now re-read from the game's own
 * class on every pass, outside the structural cache; the requirement's TEXT
 * is flagged in the cache key so a line that mounts later is tagged.
 *
 * A second cause hid the late-mounted line: `textCandidates` memoised the
 * last panel's candidates and never invalidated them, so even a re-walk read
 * the nodes from the card's PREVIOUS walk.
 *
 * NEGATIVE CONTROL (verified 2026-09-22): against the bundle before this fix,
 * scenarios 2, 3, 4 and 6 fail; with only the signature flag and not the memo
 * reset, scenario 4 still fails.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = readFileSync(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));
const TITLE = 'title="Click to cycle XP display"';

function page(reqHtml) {
  return `<!doctype html><html><head><title>IdleWorlds</title></head><body>
<div id="root" data-skin="default">
<header id="top-header"><div><h1>BustedCypher</h1></div></header>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px">
<div class="panel" id="skill-actions"><div class="row"><h2>Skill Actions</h2></div>
  <div class="compact-panel" id="woodcutting">
    <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
      <div><p>🪓 Woodcutting</p><p>LV 64</p></div>
      <div id="content">
        <p id="title">🪓 Chop Stormwood</p>
        <button ${TITLE}>Lv 64 - 26.9% • 18,174,000 to go</button>
        <p>194 XP</p>
        <div role="progressbar"><div style="width:26.9%"></div></div>
        ${reqHtml}
      </div>
      <div><button><span class="relative z-10">Chop</span></button></div>
    </div>
  </div>
</div></div></div></body></html>`;
}

async function boot(reqHtml) {
  const dom = new JSDOM(page(reqHtml), {
    url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('offline fixture'));
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const store = new Map();
  window.chrome = {
    runtime: { id: 'test', getURL: p => `chrome-extension://test/${p}` },
    storage: {
      local: {
        get: async k => (store.has(k) ? { [k]: store.get(k) } : {}),
        set: async b => { for (const [k, v] of Object.entries(b)) store.set(k, v); },
        remove: async k => { store.delete(k); },
      },
      onChanged: { _l: [], addListener(f) { this._l.push(f); }, removeListener(f) { this._l = this._l.filter(x => x !== f); } },
    },
  };
  window.CSS = { highlights: new Map() };
  window.Highlight = class extends Set { constructor(...r) { super(r); } };
  window.document.documentElement.setAttribute('data-iw-page-hydrated', '1');
  window.eval(bundle);
  await settle(1400);
  return window;
}

const norm = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const note = doc => norm(doc.querySelector('#woodcutting [data-iw-skill-v2-req-note]'));
const failures = [];

async function scenario(name, reqHtml, mutate, want) {
  const window = await boot(reqHtml);
  const doc = window.document;
  try {
    assert.equal(doc.getElementById('woodcutting').dataset.iwSkillV2, '1', `${name}: card never reached V2`);
    if (mutate) { mutate(doc); await settle(600); }
    assert.equal(note(doc), want, `${name}: requirement note`);
  } catch (error) {
    failures.push(error.message);
  }
  window.close();
}

/* 1. Unmet from the first render: the note shows at once. */
await scenario('unmet at boot', '<p class="text-red-400">Needs level 65</p>', null, 'Needs level 65');

/* 2. The line renders met-grey first and the game turns it red later (the
      player's levels land after the card). Only its class changes. */
await scenario('turns unmet after boot', '<p id="req" class="text-white/45">Needs level 65</p>',
  doc => doc.getElementById('req').className = 'text-red-400', 'Needs level 65');

/* 3. Paging to a locked recipe: same button label, new requirement text and
      state on the same node. */
await scenario('paged to a locked action', '<p id="req" class="text-white/45">Needs level 29</p>',
  doc => {
    const req = doc.getElementById('req');
    doc.getElementById('title').textContent = '🪓 Chop Runic Oak';
    req.textContent = 'Needs level 70';
    req.className = 'text-red-400';
  }, 'Needs level 70');

/* 4. The requirement line mounts after the card's first pass. */
await scenario('requirement mounts late', '',
  doc => doc.getElementById('content').insertAdjacentHTML('beforeend', '<p class="text-red-400">Needs level 65</p>'),
  'Needs level 65');

/* 5. Negative: a met requirement never shows, and a requirement that becomes
      met again drops its note. */
await scenario('met stays hidden', '<p class="text-white/45">Needs level 29</p>', null, '');
await scenario('unmet becomes met', '<p id="req" class="text-red-400">Needs level 65</p>',
  doc => doc.getElementById('req').className = 'text-white/45', '');

if (failures.length) {
  for (const message of failures) console.error('FAIL ' + message);
  process.exit(1);
}
console.log('skill-requirement-state: unmet requirements show on every path, met ones never do');
