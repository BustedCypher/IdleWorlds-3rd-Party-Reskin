import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const compiled = await build({ stdin: { contents: "export * from './src/modules/WorldBossPanels.js'; export { ItemDatabase } from './src/modules/ItemDatabase.js'; export { AtlasService } from './src/modules/AtlasService.js';", resolveDir: projectRoot }, bundle: true, write: false, format: 'iife', globalName: 'BossPanels', loader: { '.css': 'text' } });
const dom = new JSDOM('<div class="panel"><div><h2>World Bosses</h2><p>Shared world events</p></div><div class="compact-panel"><div><div><p>🌍 Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div><button>Prejoin</button></div><div class="h-1.5 rounded-full"><div style="width: 40%"></div></div><button>World boss participation</button><div class="fighter-details"><p>Top Fighters</p></div><div><p>Respawns 3m left</p></div></div><h2>Zone Control</h2><div class="compact-panel"><div><p>🔴 Red Team controls Zone 12</p></div><p>12,500 / 20,000 HP</p><div class="h-1.5 rounded-full"><div style="width: 62.5%"></div></div><p>Protected for 1h</p><button>Last battle participants</button></div></div>', { runScripts: 'outside-only' });
const saved = {};
dom.window.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(key) { return { [key]: saved[key] }; },
  async set(values) { Object.assign(saved, values); },
} } };
dom.window.eval(compiled.outputFiles[0].text);
const { decorateWorldBossPanel, clearWorldBossPanel, ItemDatabase, AtlasService } = dom.window.BossPanels;
ItemDatabase._index([
  {
    item_id: 'woodcutters_gloves',
    name: "Woodcutter's Gloves",
    category: 'Equipment',
    subcategory: 'Gloves slot',
    effects_raw: 'DEF +1; Woodcutting skill bonus +4',
    acquisition_type: 'BossDrop',
    acquisition_summary: 'Rare Ancient Treant drop.',
    acquisition_detail: '',
  },
  {
    item_id: 'builders_gloves',
    name: "Builder's Gloves",
    category: 'Equipment',
    subcategory: 'Gloves slot',
    effects_raw: 'DEF +1; Construction skill bonus +4',
    acquisition_type: 'BossDrop',
    acquisition_summary: 'Rare Ancient Treant drop.',
    acquisition_detail: '',
  },
], 'launch-glove-fixture', 'fixture');
AtlasService._gearByName = new Map([
  ['woodcutters gloves', { name: "Woodcutter's Gloves", index: 1146, row: 152, column: 7, x: 896, y: 19456, width: 128, height: 128 }],
  ['builders gloves', { name: "Builder's Gloves", index: 1147, row: 152, column: 8, x: 1024, y: 19456, width: 128, height: 128 }],
]);
AtlasService._gearDims = { cols: 10, rows: 153, cell: 128 };
const root = dom.window.document.querySelector('.panel');
const heading = root.querySelector('h2');
const cards = root.querySelectorAll('.compact-panel');
const original = root.innerHTML;
const impactAnimations = [];
dom.window.Element.prototype.animate = function (frames, options) {
  impactAnimations.push({ className: this.className, frames, options });
  return { cancel() {} };
};
const action = cards[0].querySelector('button');
const participation = [...cards[0].querySelectorAll('button')].find(button => /participation/i.test(button.textContent));
const statusRow = [...cards[0].children].find(element => /Respawns/i.test(element.textContent));
const progress = [...cards[0].children].find(element => /h-1\.5/.test(element.className));
const details = cards[0].querySelector('.fighter-details');
let clicks = 0;
action.addEventListener('click', () => clicks++);
decorateWorldBossPanel({ root, heading });
assert.equal(cards[0].dataset.iwEncounter, 'ancient_treant');
assert.equal(cards[1].dataset.iwControl, 'red');
assert.equal(cards[1].querySelectorAll('.iw-control-dominion').length, 1, 'zone control gains one dominion readout');
assert.equal(cards[1].querySelector('.iw-control-crest')?.getAttribute('aria-hidden'), 'true', 'fantasy crest is decorative');
assert.equal(cards[1].querySelectorAll('.iw-control-crest-art').length, 3, 'all ownership artworks coexist so a capture can crossfade without replacing the image');
assert.equal(cards[1].querySelectorAll('.iw-control-sword-energy').length, 2, 'crest has independent red and blue sword-energy layers');
assert.equal(cards[1].querySelectorAll('.iw-control-crystal-core').length, 1, 'crest has a local crystal-energy layer');
assert.equal(cards[1].querySelector('.iw-control-meter-fill')?.style.width, '62.5%', 'ward meter mirrors native progress');
/* A no-op re-run must emit nothing DOMWatcher observes. The dominion readout
   lives INSIDE the zone .compact-panel, so a same-value textContent write there
   is a childList record -> iw:skill-panel -> decorate -> write again: a
   self-driving loop measured live (2026-09-16) at one rewrite every ~10ms. */
{
  const watched = ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-current', 'data-state'];
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: watched });
  decorateWorldBossPanel({ root, heading });
  const records = observer.takeRecords();
  observer.disconnect();
  assert.deepEqual(records.map(r => `${r.type}:${r.target.className || r.target.nodeName}`), [],
    'an unchanged re-decorate is quiescent for the shared watcher');
}
assert.equal(cards[1].querySelector('.iw-control-meter-value')?.textContent, '12,500 / 20,000 HP', 'ward meter preserves native HP');
assert.equal(cards[1].querySelector('[data-iw-boss-role="participation"]')?.textContent, 'Last battle participants');
assert.equal(action.dataset.iwBossActionLabel, 'Prejoin', 'native Prejoin receives the compact display label');
assert.equal(action.dataset.iwBossActionState, 'idle', 'native Prejoin is tagged as the idle action state');
assert.equal(participation?.dataset.iwBossRole, 'participation', 'participation link is available to the compact layout');
assert.equal(statusRow?.dataset.iwBossRole, 'status', 'timer row is available to the compact layout');
assert.equal(progress?.dataset.iwBossRole, 'progress', 'health progress stays in the compact information column');
assert.equal(details?.dataset.iwBossRole, 'details', 'expanded fighter details retain a full-width layout region');
assert.equal(root.querySelectorAll('.iw-boss-notice').length, 1);
assert.equal(cards[0].querySelectorAll('.iw-boss-reward').length, 11,
  'Ancient Treant includes the two Woodcutting/Construction launch glove rewards');
const launchGloveRewards = [...cards[0].querySelectorAll('.iw-boss-reward')]
  .filter(tile => ['woodcutters_gloves', 'builders_gloves'].includes(tile.dataset.iwItem))
  .map(tile => ({
    id: tile.dataset.iwItem,
    name: tile.dataset.iwItemName,
    atlas: tile.querySelector('.iw-boss-reward-icon')?.dataset.iwAtlas || null,
    fallback: tile.querySelector('.iw-boss-reward-icon')?.textContent || '',
  }));
assert.deepEqual(launchGloveRewards, [
  { id: 'woodcutters_gloves', name: "Woodcutter's Gloves", atlas: 'gear', fallback: '' },
  { id: 'builders_gloves', name: "Builder's Gloves", atlas: 'gear', fallback: '' },
], 'launch gloves use live item names and bundled gear art without the diamond fallback');
const disclosure = cards[0].querySelector('details.iw-boss-rewards');
assert.ok(disclosure, 'rewards use a keyboard-accessible native disclosure');
assert.equal(disclosure.open, true, 'new preferences default to expanded');
await new Promise(resolve => setTimeout(resolve, 10));
disclosure.open = false;
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(saved['iw-boss-rewards-collapsed:ancient_treant'], true);
decorateWorldBossPanel({ root, heading });
assert.equal(disclosure.open, false, 'live reconciliation preserves collapse');
const fresh = new JSDOM(root.outerHTML, { runScripts: 'outside-only' });
fresh.window.chrome = dom.window.chrome;
fresh.window.eval(compiled.outputFiles[0].text);
const freshRoot = fresh.window.document.querySelector('.panel');
fresh.window.BossPanels.clearWorldBossPanel(freshRoot);
fresh.window.BossPanels.decorateWorldBossPanel({ root: freshRoot, heading: freshRoot.querySelector('h2') });
await new Promise(resolve => setTimeout(resolve, 10));
const restored = freshRoot.querySelector('details.iw-boss-rewards');
assert.equal(restored.open, false, 'a fresh session restores saved collapse');
restored.open = true;
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(saved['iw-boss-rewards-collapsed:ancient_treant'], false, 'expansion is saved too');
fresh.window.close();
assert.equal(cards[0].querySelectorAll('[data-iw-tooltip-trigger="1"]').length, 11);
decorateWorldBossPanel({ root, heading });
assert.equal(cards[0].querySelectorAll('.iw-boss-rewards').length, 1);
assert.equal(action, cards[0].querySelector('button'));
action.click();
assert.equal(clicks, 1);
action.textContent = '⏳ Prejoined';
decorateWorldBossPanel({ root, heading });
assert.equal(action.dataset.iwBossActionLabel, 'Queued', 'native Prejoined is presented as Queued');
assert.equal(action.dataset.iwBossActionState, 'active', 'native Prejoined is tagged as the active queued state');
action.textContent = 'Prejoin';
cards[1].querySelector('p').textContent = '🔵 Blue Team controls Zone 12';
decorateWorldBossPanel({ root, heading });
assert.equal(cards[1].dataset.iwControl, 'blue');
assert.match(cards[1].querySelector('.iw-control-state')?.textContent || '', /Azure Dominion/);
cards[1].querySelector('p').textContent = '⚔️ Zone 12 — Race to capture!';
cards[1].querySelector('[data-iw-boss-role="participation"]').insertAdjacentHTML('beforebegin', '<div class="team-strength"><span class="bg-red-500"></span><div class="rounded-full"><div style="width: 84.16%"></div></div><p class="strength-value">4,208</p></div><div class="team-strength"><span class="bg-blue-500"></span><div class="rounded-full"><div style="width: 100%"></div></div><p class="strength-value">5,000</p></div>');
decorateWorldBossPanel({ root, heading });
assert.equal(cards[1].dataset.iwControl, 'contested');
assert.match(cards[1].querySelector('.iw-control-state')?.textContent || '', /Ward contested/);
assert.equal(cards[1].querySelector('.iw-control-crest')?.dataset.iwControlCrest, 'contested');
assert.equal(cards[1].querySelector('.iw-control-meter')?.dataset.iwControlSource, 'factions');
assert.equal(cards[1].querySelector('.iw-control-meter-value')?.textContent, '4,208 · 5,000', 'ward mirrors both live faction strengths');
assert.equal(cards[1].querySelector('.iw-control-meter-fill')?.style.getPropertyValue('--iw-control-split'), '45.7%', 'ward balance follows the two live strengths');
assert.equal(cards[1].querySelectorAll('[data-iw-boss-role="control-strength"]').length, 2, 'native strength rows are identified for visual replacement');
cards[1].querySelectorAll('.strength-value')[0].textContent = '5,000';
decorateWorldBossPanel({ root, heading });
assert.equal(cards[1].querySelector('.iw-control-meter-fill')?.style.getPropertyValue('--iw-control-split'), '50%', 'ward balance reconciles when strength changes');
assert.ok(impactAnimations.some(entry => /iw-control-impact-red/.test(entry.className)), 'red strength change triggers an independent red energy trail');
assert.ok(!impactAnimations.some(entry => /iw-control-crystal-core/.test(entry.className)), 'strength ticks never override the continuous crystal light');
cards[1].querySelectorAll('.team-strength').forEach(row => row.remove());
cards[1].querySelector('p').textContent = '🔴 Red Team controls Zone 12';
decorateWorldBossPanel({ root, heading });
clearWorldBossPanel(root);
assert.equal(root.innerHTML, original, 'teardown restores all native markup');
console.log('World boss decoration, rewards, live control state, idempotence and teardown passed.');
