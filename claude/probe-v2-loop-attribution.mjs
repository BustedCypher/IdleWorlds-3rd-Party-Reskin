import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const bundle = readFileSync(process.env.BUNDLE, 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));
const MODE = process.env.MODE || 'expanded';   // collapsed | expanded | legacy

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
window.chrome = { runtime: { id: 'probe', getURL: p => `chrome-extension://probe/${p}` },
  storage: { local: { get: async k => (storage.has(k) ? { [k]: storage.get(k) } : {}),
      set: async b => { for (const [k,v] of Object.entries(b)) storage.set(k,v); }, remove: async k => { storage.delete(k); } },
    onChanged: { _l: [], addListener(f){this._l.push(f);}, removeListener(f){this._l=this._l.filter(x=>x!==f);} } } };
window.CSS = { highlights: new Map() };
window.Highlight = class extends Set { constructor(...r){ super(r); } };

window.eval(bundle);
await settle(1200);
const doc = window.document, panel = doc.getElementById('build-panel');

if (MODE === 'legacy') doc.documentElement.setAttribute('data-iw-skill-card-design', 'current');
if (MODE === 'expanded') {
  panel.querySelector('[data-iw-skill-v2-expand]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle(250);
  panel.querySelector('[data-iw-skill-v2-tab-button="materials"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
await settle(1500);

let records = 0, styleWrites = 0;
const byNode = new Map(), propCount = new Map();
const obs = new window.MutationObserver(list => {
  records += list.length;
  for (const m of list) {
    if (m.type !== 'attributes' || m.attributeName !== 'style') continue;
    styleWrites++;
    const id = m.target.id || m.target.getAttribute('data-iw-skill-role') || m.target.className || m.target.tagName;
    byNode.set(id, (byNode.get(id)||0)+1);
    const o = new Set((m.oldValue||'').split(';').map(s=>s.trim()).filter(Boolean));
    const n = new Set((m.target.getAttribute('style')||'').split(';').map(s=>s.trim()).filter(Boolean));
    for (const d of [...o].filter(x=>!n.has(x))) propCount.set('REMOVED ' + d, (propCount.get('REMOVED ' + d)||0)+1);
    for (const d of [...n].filter(x=>!o.has(x))) propCount.set('ADDED   ' + d, (propCount.get('ADDED   ' + d)||0)+1);
  }
});
obs.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true });
let reconciles = 0;
doc.addEventListener('iw:skill-panel', () => reconciles++);
await settle(3000);
obs.disconnect();
console.log('MODE=' + MODE + '  design=' + doc.documentElement.getAttribute('data-iw-skill-card-design')
  + '  state=' + (panel.dataset.iwSkillV2State || '-'));
console.log('  mutation records:', records, ' style writes:', styleWrites, ' skill reconciles:', reconciles);
console.log('  nodes:', [...byNode.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>k.slice(0,40)+'='+v).join('  '));
console.log('  declarations churning:');
[...propCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([k,v])=>console.log('    ' + v + 'x  ' + k.slice(0,90)));
