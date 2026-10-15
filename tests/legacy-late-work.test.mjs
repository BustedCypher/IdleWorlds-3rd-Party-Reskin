import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { outputFiles } = await build({ stdin: { resolveDir: root, contents: `
  export {setRuntimeActive} from './src/skins/legacy/modules/Runtime.js';
  export {ItemDatabase} from './src/skins/legacy/modules/ItemDatabase.js';
  export {scanForItemNames,clearItemNameScan} from './src/skins/legacy/modules/NameScanner.js';
  export {initQuestPanelRenderer,clearQuestPanels} from './src/skins/legacy/modules/QuestPanelRenderer.js';
  export {initSkillPanelRenderer,clearSkillPanels} from './src/skins/legacy/modules/SkillPanelRenderer.js';
` }, bundle: true, write: false, format: 'iife', globalName: 'Lifecycle', loader: { '.css': 'text' } });
const source = outputFiles[0].text;
const pause = () => new Promise(r => setTimeout(r, 30));
function page(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url: 'https://idleworlds.com/game', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const w = dom.window, frames = [];
  w.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  w.matchMedia = () => ({ matches: false });
  w.eval(source);
  return { w, api: w.Lifecycle, flush: () => frames.splice(0).forEach(fn => fn()), close: () => w.close() };
}

// A pointer frame queued before deactivation must release its queue latch even
// though presentation is suppressed. Otherwise all future item-name hovers die.
let h;
if (process.argv[2] !== 'artwork') {
h = page('<p id="prose">Iron Sword</p>');
try {
  h.w.fetch = async () => ({ ok: true, json: async () => ({ items: [{ item_id: 'iron_sword', name: 'Iron Sword' }] }) });
  await h.api.ItemDatabase.ready();
  h.api.scanForItemNames(h.w.document.body); h.flush();
  let hitTests = 0;
  h.w.document.elementFromPoint = () => { hitTests++; return null; };
  const move = () => h.w.document.dispatchEvent(new h.w.MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
  move(); h.api.clearItemNameScan(); h.api.setRuntimeActive(false); h.flush();
  h.api.setRuntimeActive(true); h.api.scanForItemNames(h.w.document.body); h.flush();
  move(); h.flush();
  assert.equal(hitTests, 1, 'item-name pointer processing must recover after an inactive queued frame');
} finally { h.close(); }
}

const quest = '<div class="compact-panel" id="quest"><div><p>Smithing Work Order</p><p>Iron Gloves 0/1</p><p>Reward: +2,100g • +900 smithing XP</p></div><div><button>Turn In</button><button>Skip</button></div><div>0% complete</div></div>';
const skill = '<section id="actions"><h2>Skill Actions</h2><div class="compact-panel" id="skill"><div><p>⛏️ Mine</p><p>LV 2</p></div><div><p>⛏️ Mine Copper Ore</p><button>Lv 2 • 10/96 XP</button><p>8 XP</p><div role="progressbar"><div style="width:10%"></div></div><p>Needs level 1</p></div><button>Mine</button></div></section>';
for (const kind of process.argv[2] === 'pointer' ? [] : ['quest','skill']) {
  h = page(kind === 'quest' ? quest : skill);
  try {
    const responses = [];
    h.w.fetch = url => new Promise(resolveResponse => responses.push(() => {
      try {
        const raw = readFileSync(resolve(root, String(url)), 'utf8');
        resolveResponse({ ok: true, json: async () => JSON.parse(raw), text: async () => raw });
      } catch { resolveResponse({ ok: false, status: 404 }); }
    }));
    if (kind === 'quest') h.api.initQuestPanelRenderer();
    else h.api.initSkillPanelRenderer();
    const card = h.w.document.getElementById(kind);
    h.w.document.dispatchEvent(new h.w.CustomEvent('iw:skill-panel', { detail: { panel: card, skill: kind === 'skill' ? 'mining' : 'unknown' } }));
    assert.ok(responses.length > 0, 'the real renderer must be waiting for artwork');
    if (kind === 'quest') { assert.ok(card.classList.contains('fs-quest-panel')); h.api.clearQuestPanels(); }
    else { assert.ok(h.w.document.querySelector('.fs-skills-section-frame')); h.api.clearSkillPanels(); }
    h.api.setRuntimeActive(false);
    responses.splice(0).forEach(resolveResponse => resolveResponse());
    await pause(); h.flush(); await pause();
    assert.equal(h.w.document.querySelectorAll('[data-iw-skills-ui-ready],.fs-quest-panel,[data-iw-quest-role]').length, 0,
      `${kind} late artwork must not restore Legacy role attributes after teardown`);
    assert.equal(h.w.document.getElementById(kind === 'skill' ? 'actions' : 'quest').style.getPropertyValue('--fs-skills-panel-texture'), '',
      `${kind} late artwork must not restore Legacy CSS variables after teardown`);
  } finally { h.close(); }
}
console.log('Legacy late work: pointer recovery and delayed quest/skill artwork remain isolated PASS');
