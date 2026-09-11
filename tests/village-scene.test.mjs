import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/modules/VillageScene.js'], bundle: true,
  write: false, format: 'iife', globalName: 'Scene' });
const dom = new JSDOM('<main><div class="panel" id="actions"><h2>Skill Actions</h2><button>Mine</button></div><div id="next">Next panel</div></main>',
  { url: 'https://idleworlds.com/game', runScripts: 'outside-only' });
const w = dom.window;
let reads = 0;
let payload = { player: { housing: { tier: 4 }, villageAddons: { totalSlots: 4, installed: [
  { slot: 1, itemKey: 'construction_building_tier_11', name: 'Voidiron Archive' },
  { slot: 3, itemKey: 'construction_building_tier_34', name: 'Primordial Wonder' },
] } } };
w.fetch = async (url, options) => {
  reads++;
  assert.match(url, /^\/api\/player\?/);
  assert.equal(options.method, 'GET');
  return { ok: true, json: async () => payload };
};
w.eval(compiled.outputFiles[0].text);
const { reconcileVillageScene, clearVillageScene, normaliseVillage } = w.Scene;
const actions = w.document.querySelector('#actions');
const button = actions.querySelector('button');
let clicks = 0;
button.addEventListener('click', () => clicks++);
await reconcileVillageScene();
let scene = w.document.querySelector('[data-iw-village-scene]');
assert.equal(actions.nextElementSibling, scene, 'Village sits directly below Actions');
assert.equal(scene.nextElementSibling.id, 'next', 'existing panel order is intact');
assert.match(scene.textContent, /Manor/);
assert.equal(scene.querySelectorAll('[data-plot-state="installed"]').length, 2);
assert.equal(scene.querySelectorAll('[data-plot-state="empty"]').length, 2);
assert.equal(scene.querySelectorAll('[data-plot-state="locked"]').length, 1);
assert.match(scene.querySelector('[data-slot="3"] img').src, /building_34.webp$/);
assert.match(scene.querySelector('.iw-vs-house img').src, /house_4.webp$/);
const before = scene.innerHTML;
await reconcileVillageScene();
assert.equal(reads, 1, 'ordinary game ticks do not poll the server');
assert.equal(scene.innerHTML, before, 'stable scene is not rewritten');
button.click();
assert.equal(clicks, 1, 'React-owned button and handler survive');
assert.equal(actions.querySelector('button'), button);
assert.equal(normaliseVillage({ player: {} }), null, 'missing data must not look like an empty village');
assert.equal(normaliseVillage({ player: { housing: { tier: 0 }, villageAddons: { totalSlots: 0, installed: [] } } }).slots.length, 5);
assert.equal(normaliseVillage({ player: { housing: { tier: 9 }, villageAddons: { totalSlots: 9, installed: [] } } }), null);
clearVillageScene();
assert.equal(w.document.querySelector('[data-iw-village-scene]'), null);
assert.equal(actions.nextElementSibling.id, 'next');
payload = { player: { housing: { tier: 0 }, villageAddons: { totalSlots: 0, installed: [] } } };
await reconcileVillageScene();
scene = w.document.querySelector('[data-iw-village-scene]');
assert.match(scene.textContent, /No House/);
assert.equal(scene.querySelectorAll('[data-plot-state="locked"]').length, 5);
/* ── The Village route's own DOM is the FAST path, and it must outlive the
      tab swap. VillagePanels tags these three roles on the live route; the
      dashboard renders none of them, so a snapshot dropped on navigation is a
      snapshot thrown away at the exact moment it is needed. ── */
clearVillageScene();
reads = 0;
const village = w.document.createElement('div');
village.innerHTML = `
  <div data-iw-village="housing"><p>Current tier: 2 • Base actions take 8s</p></div>
  <div data-iw-village="addons">
    <p data-iw-village-role="intro">2 slots available (1 per housing tier).</p>
    <div data-iw-village="slot" data-iw-village-state="installed">
      <p data-iw-village-role="index">Slot 1</p><p data-iw-village-role="name">Copperbrand Smithy</p></div>
    <div data-iw-village="slot" data-iw-village-state="vacant">
      <p data-iw-village-role="index">Slot 2</p><p data-iw-village-role="vacant">Empty slot</p></div>
  </div>`;
w.document.body.append(village);
w.fetch = async () => { reads++; throw new Error('the API is not available'); };
await reconcileVillageScene();
scene = w.document.querySelector('[data-iw-village-scene]');
assert.match(scene.textContent, /Cottage/, 'housing tier read from the rendered route');
assert.match(scene.textContent, /Copperbrand Smithy/, 'the installed building is named by the DOM');
assert.equal(scene.querySelectorAll('[data-plot-state="installed"]').length, 1);
assert.equal(scene.querySelectorAll('[data-plot-state="locked"]').length, 3);
assert.doesNotMatch(scene.textContent, /could not be loaded/,
  'a rendered village makes a failed read irrelevant');

// Leaving the Village route: React unmounts the markup and the API stays down.
village.remove();
dom.reconfigure({ url: 'https://idleworlds.com/' });
await reconcileVillageScene();
scene = w.document.querySelector('[data-iw-village-scene]');
assert.match(scene.textContent, /Copperbrand Smithy/,
  'a TAB swap keeps the village that was read on the Village route');

// A LEAGUE swap is a different character, so that snapshot is not ours to show.
dom.reconfigure({ url: 'https://idleworlds.com/ssf' });
await reconcileVillageScene();
scene = w.document.querySelector('[data-iw-village-scene]');
assert.doesNotMatch(scene.textContent, /Copperbrand Smithy/,
  'a LEAGUE swap drops the other league\'s village');
dom.reconfigure({ url: 'https://idleworlds.com/game' });

actions.remove();
await reconcileVillageScene();
assert.equal(w.document.querySelector('[data-iw-village-scene]'), null, 'route unmount removes orphaned scene');
clearVillageScene();
w.close();
console.log('Village scene: placement, real slots, no-house state, rendered-route read,'
  + ' snapshot across tabs, league reset, idempotence and teardown passed.');
