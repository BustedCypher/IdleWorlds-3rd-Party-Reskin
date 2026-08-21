import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const events = [];
globalThis.document = {
  dispatchEvent(ev) { events.push(ev); return true; },
};
if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; }
  };
}

globalThis.localStorage = new MemoryStorage();

// v1.6.0: the item cache moved OUT of the page's localStorage and into
// extension-private storage, because a content script shares the game's origin
// storage and its 5 MB quota. Runtime.js reads `chrome` once at module load, so
// the mock has to exist before the first dynamic import below. (Audit S1.3)
const extStorage = new Map();
globalThis.chrome = {
  runtime: { id: 'test-runtime', getURL: p => `chrome-extension://test/${p}` },
  storage: {
    local: {
      get: async key => (extStorage.has(key) ? { [key]: extStorage.get(key) } : {}),
      set: async bag => { for (const [k, v] of Object.entries(bag)) extStorage.set(k, v); },
      remove: async key => { extStorage.delete(key); },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

// A pre-v1.6.0 install has its cache sitting in the game's localStorage. Seed it
// so we can assert the one-time eviction actually reclaims the user's quota.
localStorage.setItem('iw-item-db-cache', JSON.stringify({ items: [{ item_id: 'legacy' }] }));

// 1) A stale cache remains usable if the live API request fails.
extStorage.set('iw-item-db-cache', {
  items: [{ item_id: 'blade_1', name: "King's Blade", tier: 8 }],
  generatedAt: 'old-generation',
  cachedAt: 1,
});
globalThis.fetch = async () => { throw new Error('offline'); };
const { ItemDatabase: staleDb } = await import('../src/modules/ItemDatabase.js?stale=1');
await staleDb.ready();
assert.equal(staleDb.isReady(), true);
assert.equal(staleDb.getByName('Kings Blade')?.item_id, 'blade_1');
assert.ok(staleDb.revision() >= 1);
assert.equal(staleDb.source(), 'stale-cache');

// 1b) The legacy page-storage cache must be evicted, not merely ignored.
assert.equal(localStorage.getItem('iw-item-db-cache'), null,
  'legacy cache must be removed from the game localStorage it was polluting');

// 2) A failed first load does not poison ready() forever; the second call can retry.
localStorage.clear();
extStorage.clear();
let failFirst = true;
globalThis.fetch = async () => {
  if (failFirst) throw new Error('temporary');
  return {
    ok: true,
    status: 200,
    async json() {
      return { items: [{ item_id: 'ore_1', name: 'Copper Ore', tier: 3 }], generatedAt: 'fresh-generation' };
    },
  };
};
const { ItemDatabase: retryDb } = await import('../src/modules/ItemDatabase.js?retry=2');
await assert.rejects(retryDb.ready(), /temporary/);
failFirst = false;
await retryDb.ready();
assert.equal(retryDb.getByName('Copper-Ore')?.item_id, 'ore_1');
assert.equal(retryDb.source(), 'network');
assert.ok(extStorage.has('iw-item-db-cache'), 'fresh table must be cached in extension storage');
assert.equal(localStorage.getItem('iw-item-db-cache'), null,
  'the skin must never write its cache into the page origin');

// 3) One atlas metadata failure no longer disables the other atlas.
let gearFails = true;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('gear_icons_manifest.json')) {
    if (gearFails) return { ok: false, status: 503 };
    return {
      ok: true,
      status: 200,
      async json() {
        return { columns: 10, rows: 1, cell_size: 128, icons: [{ name: 'Iron Sword', x: 0, y: 0, width: 128, height: 128 }] };
      },
    };
  }
  if (u.includes('item_icons_index.csv')) {
    return {
      ok: true,
      status: 200,
      async text() {
        return 'item_id,name,row,column,x,y,width,height\nore_1,Copper Ore,0,0,0,0,128,128\n';
      },
    };
  }
  throw new Error(`unexpected URL ${u}`);
};
const { AtlasService: atlas } = await import('../src/modules/AtlasService.js?partial=3');
await atlas.ready();
assert.equal(atlas.isReady(), true);
assert.equal(atlas.isComplete(), false);
assert.equal(atlas.resolve({ id: 'ore_1', name: 'Copper Ore' })?.atlas, 'item');

// Force the backoff window open for this deterministic test, then retry only the missing gear metadata.
gearFails = false;
atlas._nextRetryAt = 0;
await atlas.ready();
assert.equal(atlas.isComplete(), true);
assert.equal(atlas.resolve({ name: 'Iron Sword' })?.atlas, 'gear');

console.log('PASS data service resilience tests');
