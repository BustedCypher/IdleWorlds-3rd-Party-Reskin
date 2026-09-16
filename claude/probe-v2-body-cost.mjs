import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(process.env.BUNDLE, 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));

const PAGE = `<!doctype html><html><head><title>IdleWorlds</title></head><body>
<div id="root"><div class="app">
  <header id="top-header"><div><h1>BustedCypher</h1></div></header>
  <div class="iw-test-column" style="display:flex;flex-direction:column;gap:12px">
  <section class="panel" id="skills-frame"><h2>Skill Actions</h2>
    <div class="compact-panel" id="build-panel">
      <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
        <div><p>🏗️ Build</p><p>LV 29</p></div>
        <div><p>🏗️ Craft Runite Building Parts</p><button>Lv 29 - 52.0% • 13,741 to go</button>
          <p id="build-materials">📦 Runic Oak 473/16 • 🪨 Runite Ore 3/8 • 🧱 Silver Parts 12/12</p>
          <div role="progressbar"><div style="width:52%"></div></div>
          <p>Needs Construction Lv 29 + Woodcutting Lv 25</p>
          <p>Base reward: +461 construction XP/task</p></div>
        <div><div><button>‹</button><button>›</button></div><button id="build-action">Craft Parts</button></div>
      </div>
    </div>
  </section></div>
</div></div></body></html>`;

const dom = new JSDOM(PAGE, { url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.fetch = () => Promise.reject(new Error('no net'));
window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
const storage = new Map();
window.chrome = {
  runtime: { id: 'probe', getURL: p => `chrome-extension://probe/${p}` },
  storage: { local: {
      get: async k => (storage.has(k) ? { [k]: storage.get(k) } : {}),
      set: async b => { for (const [k,v] of Object.entries(b)) storage.set(k,v); },
      remove: async k => { storage.delete(k); } },
    onChanged: { _l: [], addListener(f){this._l.push(f);}, removeListener(f){this._l=this._l.filter(x=>x!==f);} } },
};
window.CSS = { highlights: new Map() };
window.Highlight = class extends Set { constructor(...r){ super(r); } };

window.eval(bundle);
await settle(1200);

const doc = window.document;
const panel = doc.getElementById('build-panel');
const q = s => [...panel.querySelectorAll(s)];

console.log('--- boot ---');
console.log('layout      :', panel.dataset.iwSkillLayout || '(none)');
console.log('v2 marked   :', panel.dataset.iwSkillV2 || '(none)');
console.log('shell found :', !!panel.querySelector('[data-iw-skill-layout-shell="1"]'));
console.log('controls host parent tag:', panel.querySelector('[data-iw-skill-v2-controls]')?.parentElement?.className || '(none)');
console.log('grids       :', q('.fs-skill-ingredient-grid').length);
console.log('ingr items  :', q('.fs-skill-ingredient-item').length);
console.log('summary     :', panel.querySelector('[data-iw-skill-v2-summary]')?.textContent || '(none)');

// expand + select Materials, exactly as a click would
const expand = panel.querySelector('[data-iw-skill-v2-expand]');
expand?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await settle(300);
const matTab = panel.querySelector('[data-iw-skill-v2-tab-button="materials"]');
matTab?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await settle(1500);

console.log('\n--- expanded, Materials tab ---');
const body = panel.querySelector('[data-iw-skill-v2-body]');
console.log('body present:', !!body, 'tab=', body?.dataset.iwSkillV2BodyTab);
console.log('body rows   :', body ? body.querySelectorAll('.iw-skill-v2-body-row').length : 0);
console.log('grids       :', q('.fs-skill-ingredient-grid').length, '(expect 1)');
console.log('ingr items  :', q('.fs-skill-ingredient-item').length, '(expect 3)');
console.log('summary     :', panel.querySelector('[data-iw-skill-v2-summary]')?.textContent || '(none)', '(expect "3 materials")');
console.log('grids INSIDE body:', body ? body.querySelectorAll('.fs-skill-ingredient-grid').length : 0);
const marked = body ? [...body.querySelectorAll('[data-iw-ingr]')] : [];
console.log('body nodes marked data-iw-ingr:', marked.length);
for (const el of marked.slice(0, 4)) {
  console.log('   ', el.className || el.tagName, '| style=', (el.getAttribute('style')||'').slice(0,120));
}
const bodyRow = body?.querySelector('.iw-skill-v2-body-row');
console.log('first body row role:', bodyRow?.getAttribute('data-iw-skill-role') || '(none)');
console.log('body own style     :', (body?.getAttribute('style')||'(none)').slice(0,120));

// --- quiescence: freeze every game-side mutation source, then count ---
let records = 0, styleWrites = 0, childListRecords = 0;
const pairs = new Map();
const obs = new window.MutationObserver(list => {
  records += list.length;
  for (const m of list) {
    if (m.type === 'attributes' && m.attributeName === 'style') {
      styleWrites++;
      const who = (m.target.getAttribute('data-iw-skill-role') || m.target.className || m.target.tagName) + '';
      const before = m.oldValue || '', after = m.target.getAttribute('style') || '';
      const key = who.slice(0,44) + ' @@OLD ' + before.slice(0,160) + ' @@NEW ' + after.slice(0,160);
      pairs.set(key, (pairs.get(key)||0)+1);
    }
    if (m.type === 'childList') childListRecords++;
  }
});
obs.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true });
let reconciles = 0;
doc.addEventListener('iw:skill-panel', () => reconciles++);
await settle(3000);
obs.disconnect();
console.log('\n--- 3s quiescent window (no game mutation at all) ---');
console.log('mutation records :', records);
console.log('  of which style :', styleWrites);
console.log('  of which child :', childListRecords);
console.log('skill reconciles :', reconciles);
console.log('grids now        :', q('.fs-skill-ingredient-grid').length);
console.log('ingr items now   :', q('.fs-skill-ingredient-item').length);
console.log('summary now      :', panel.querySelector('[data-iw-skill-v2-summary]')?.textContent || '(none)');
console.log('--- top oscillating (element, style) pairs ---');

[...pairs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([k,n])=>console.log(n+'x  '+k.split('@@').join(String.fromCharCode(10)+'     ')));
