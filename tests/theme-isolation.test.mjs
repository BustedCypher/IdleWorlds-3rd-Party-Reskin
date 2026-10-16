import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
const bundle = readFileSync(new URL('../dist/content.bundle.js', import.meta.url), 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms));
const PAGE = `<!doctype html><html><head></head><body><div id="root"><div class="app"><header><h1>Player</h1></header><nav><button>Game</button><button>Village</button></nav><div id="zone-bar-panel"><div><p>Zone 1: Meadow</p></div><div><button>Zones</button></div></div><section class="panel" aria-label="Inventory" id="inventory" style="color:rgb(1, 2, 3)"><h2>Inventory</h2><div class="space-y-1.5"><div class="compact-row"><div><span>Iron Sword</span><span>+2</span></div><div><span>Tier 4 · Weapon</span></div><div><span>x1</span></div><button id="native-action">Equip</button><button>List</button></div></div></section></div></div></body></html>`;

async function harness(initial = {}, { holdRead = false, hydrated = true, holdItems = false, holdCache = false } = {}) {
  const dom = new JSDOM(PAGE, { url: 'https://idleworlds.com/game', runScripts: 'outside-only', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole() });
  const w = dom.window, listeners = new Set(), requests = [], observers = new Set(), timers = new Map(), reads = [], heldItems = [], cacheReads = [];
  const bag = { ...initial }, snapshot = { ...bag };
  w.chrome = { runtime: { id: 'isolation', getURL: p => `chrome-extension://isolation/${p}` }, storage: {
    local: { get: key => holdRead ? new Promise(resolve => reads.push(() => resolve({ [key]: snapshot[key] })))
      : holdCache && key === 'iw-item-db-cache' ? new Promise(resolve => cacheReads.push(() => resolve({}))) : Promise.resolve({ [key]: bag[key] }),
      set: async patch => Object.assign(bag, patch), remove: async key => delete bag[key] },
    onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
  function change(patch) {
    const changes = {};
    for (const [key, newValue] of Object.entries(patch)) { changes[key] = { oldValue: bag[key], newValue }; bag[key] = newValue; }
    for (const fn of [...listeners]) fn(changes, 'local');
  }
  const Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer { observe(...args) { observers.add(this); return super.observe(...args); } disconnect() { observers.delete(this); return super.disconnect(); } };
  const set = w.setTimeout.bind(w), clear = w.clearTimeout.bind(w);
  w.setTimeout = (fn, ms, ...args) => { const id = set(() => { timers.delete(id); fn(...args); }, ms); timers.set(id, ms); return id; };
  w.clearTimeout = id => { timers.delete(id); clear(id); };
  w.fetch = async url => {
    const name = String(url); requests.push(name);
    if (name.endsWith('/items.json')) {
      if (holdItems) await new Promise(resolve => heldItems.push(resolve));
      return { ok: true, json: async () => ({ items: [{ item_id: 'iron_sword', name: 'Iron Sword', category: 'Equipment', tier: 4 }] }) };
    }
    if (name.startsWith('chrome-extension://')) {
      const file = new URL('../' + name.split('/').slice(3).join('/'), import.meta.url);
      try { const raw = readFileSync(file, 'utf8'); return { ok: true, json: async () => JSON.parse(raw), text: async () => raw }; }
      catch { return { ok: false, status: 404 }; }
    }
    return { ok: true, json: async () => ({}) };
  };
  if (hydrated) w.document.documentElement.setAttribute('data-iw-page-hydrated', '1');
  const original = w.document.body.innerHTML;
  const native = w.document.querySelector('#native-action');
  let clicks = 0; native.addEventListener('click', () => clicks++);
  w.eval(bundle);
  async function settled(ms = 180) { await pause(ms); }
  // Fantasy runs its own single observer (src/skins/fantasy/core/Watcher.js,
  // tagged `iwProfile`); every other one is Legacy's and must be gone.
  function clean({ fantasy = true } = {}) {
    assert.equal(w.document.querySelectorAll('style[data-iw-style]').length, 0, 'Fantasy must not inherit a Legacy stylesheet');
    const fantasyObservers = [...observers].filter(o => o.iwProfile === 'fantasy').length;
    assert.equal(fantasyObservers, fantasy ? 1 : 0, fantasy ? 'Fantasy runs exactly one observer' : 'a disabled skin observes nothing');
    assert.equal(w.document.querySelectorAll('style[data-iw-fantasy-style]').length, fantasy ? 1 : 0,
      fantasy ? 'Fantasy injects its one stylesheet' : 'a disabled skin leaves no Fantasy stylesheet');
    assert.equal(w.document.querySelectorAll('.iw-tip,.fs-inv-row,.fs-name-wrap,[data-iw-village-scene-owned]').length, 0, 'Fantasy must have no Legacy surfaces, including the detached tooltip');
    assert.equal(observers.size - fantasyObservers, 0, 'Legacy observer must be disconnected');
    // Fantasy's own <style> is counted above; every other skin attribute is Legacy's.
    const ownedAttributes = [...w.document.querySelectorAll('*:not(style[data-iw-fantasy-style])')].flatMap(el => [...el.attributes]
      .filter(attr => /^(data-iw-|data-fs-)/.test(attr.name)).map(attr => `${el.tagName}:${attr.name}`));
    assert.deepEqual(ownedAttributes, [], 'Legacy must remove its role and ownership attributes');
    assert.ok([...timers.values()].every(ms => ms < 10_000), 'Legacy refresh timers must be stopped');
    assert.equal(native.isConnected, true, 'native controls remain owned by the game');
    assert.equal(w.document.querySelector('#inventory').style.color, 'rgb(1, 2, 3)');
  }
  return { w, change, requests, observers, reads, heldItems, cacheReads, settled, clean, original, native,
    clickCount: () => clicks, close: () => w.close() };
}

let h = await harness({ 'iw-skin-theme': 'fantasy' });
try { await h.settled(); h.clean(); assert.equal(h.requests.length, 0, 'a fresh Fantasy session must not fetch Legacy data');
  assert.equal(h.w.document.body.innerHTML, h.original, 'Fantasy off the raid surfaces must preserve native markup'); } finally { h.close(); }

h = await harness();
try {
  await h.settled(350);
  assert.equal(h.w.document.querySelectorAll('style[data-iw-style]').length, 7, 'missing profile preserves Legacy');
  h.change({ 'iw-skin-theme': 'fantasy' }); await h.settled(); h.clean();
  const count = h.requests.length;
  for (const event of ['iw:dom-flush','iw:name-scan-flush','iw:item-db-updated','iw:atlas-updated'])
    h.w.document.dispatchEvent(new h.w.CustomEvent(event, { detail: { roots: [h.w.document.body] } }));
  h.w.dispatchEvent(new h.w.Event('resize'));
  h.change({ 'iw-zone-themes': false }); await h.settled(); h.clean();
  assert.equal(h.requests.length, count, 'inactive Legacy callbacks must not restart requests');
  h.native.click(); assert.equal(h.clickCount(), 1, 'native handlers still work in Fantasy');
  h.change({ 'iw-skin-theme': 'legacy' }); await h.settled();
  assert.equal(h.w.document.querySelectorAll('style[data-iw-style]').length, 7);
  assert.equal(h.w.document.querySelectorAll('.iw-tip').length, 1, 'switching back mounts one tooltip');
  h.change({ 'iw-skin-enabled': false }); await h.settled(); h.clean({ fantasy: false });
  h.change({ 'iw-skin-theme': 'fantasy' }); await h.settled(); h.clean({ fantasy: false });
  h.change({ 'iw-skin-enabled': true }); await h.settled(); h.clean();
  h.change({ 'iw-skin-enabled': false }); await h.settled(); h.clean({ fantasy: false });
} finally { h.close(); }

h = await harness({}, { holdRead: true });
try { h.change({ 'iw-skin-theme': 'fantasy' }); h.reads.forEach(resolve => resolve()); await h.settled(); h.clean();
  assert.equal(h.requests.length, 0, 'a stale storage read must not override a newer selection'); } finally { h.close(); }

h = await harness({}, { hydrated: false });
try { await h.settled(30); h.change({ 'iw-skin-theme': 'fantasy' });
  h.w.document.documentElement.setAttribute('data-iw-page-hydrated', '1'); await h.settled(); h.clean();
  assert.equal(h.requests.length, 0, 'a pending Legacy hydration wait must obey the latest selection'); } finally { h.close(); }

h = await harness({}, { holdItems: true });
try { await h.settled(); h.change({ 'iw-skin-theme': 'fantasy' }); h.heldItems.forEach(resolve => resolve());
  await h.settled(); h.clean(); } finally { h.close(); }

h = await harness({}, { holdCache: true });
try {
  await h.settled(); h.change({ 'iw-skin-theme': 'fantasy' });
  const count = h.requests.length;
  h.cacheReads.splice(0).forEach(resolve => resolve()); await h.settled(); h.clean();
  assert.equal(h.requests.length, count, 'a late Legacy cache read must not start a new request in Fantasy');
  h.change({ 'iw-skin-theme': 'legacy' }); await h.settled(50);
  h.cacheReads.splice(0).forEach(resolve => resolve()); await h.settled();
  assert.ok(h.requests.some(url => url.endsWith('/items.json')), 'returning to Legacy retries a canceled data load');
} finally { h.close(); }

console.log('theme isolation: Fantasy alone, round trips, callbacks, startup races, late responses PASS');
