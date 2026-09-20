import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

// 2b) Long-running tabs refresh without overlapping requests and stop cleanly.
let releaseRefresh;
let refreshCalls = 0;
globalThis.fetch = async () => {
  refreshCalls += 1;
  await new Promise(resolve => { releaseRefresh = resolve; });
  return { ok: true, status: 200, async json() { return { items: [{ item_id: 'ore_1', name: 'Copper Ore', tier: 3 }], generatedAt: 'fresh-generation' }; } };
};
const refreshA = retryDb._refreshOnce();
const refreshB = retryDb._refreshOnce();
assert.equal(refreshA, refreshB, 'concurrent refresh requests must share one promise');
releaseRefresh();
await Promise.all([refreshA, refreshB]);
assert.equal(refreshCalls, 1, 'only one live items request may be in flight');
retryDb.startAutoRefresh();
assert.ok(retryDb._refreshTimer, 'auto-refresh must schedule after enable');
retryDb.stopAutoRefresh();
assert.equal(retryDb._refreshTimer, null, 'disable must clear the refresh timer');

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
        return { columns: 10, rows: 2, cell_size: 128, icons: [
          { name: '+1', index: 0, x: 0, y: 0, width: 128, height: 128 },
          { name: '+2', index: 1, x: 128, y: 0, width: 128, height: 128 },
          { name: '+3', index: 2, x: 256, y: 0, width: 128, height: 128 },
          { name: '+4', index: 3, x: 384, y: 0, width: 128, height: 128 },
          { name: 'Iron Sword', index: 4, x: 0, y: 128, width: 128, height: 128 },
          { name: "Woodcutter's Gloves", index: 5, x: 128, y: 128, width: 128, height: 128 },
          { name: "Builder's Gloves", index: 6, x: 256, y: 128, width: 128, height: 128 },
        ] };
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
assert.equal(atlas.resolve({ id: 'woodcutters_gloves', name: "Woodcutter's Gloves" })?.atlas, 'gear',
  'a live Woodcutter\'s Gloves item must fall through an item-atlas ID miss to bundled gear art by name');
assert.equal(atlas.resolve({ id: 'builders_gloves', name: "Builder's Gloves" })?.atlas, 'gear',
  'a live Builder\'s Gloves item must fall through an item-atlas ID miss to bundled gear art by name');

const bundledGearManifest = JSON.parse(
  await readFile(new URL('../assets/gear_icons_manifest.json', import.meta.url), 'utf8')
);
for (const name of ["Woodcutter's Gloves", "Builder's Gloves"]) {
  assert.ok(bundledGearManifest.icons.some(icon => icon.name === name),
    `bundled gear manifest must contain the launch reward art for ${name}`);
}

for (let level = 1; level <= 4; level += 1) {
  const resolved = atlas.resolve({ name: `Iron Sword+${level}` });
  assert.equal(resolved?.badge, level, `+${level} gear must retain its enhancement level`);
  const badgeArt = atlas.resolve({ name: `+${level}` });
  assert.equal(badgeArt?.entry?.index, level - 1,
    `+${level} enhancement art must use gear atlas index ${level - 1}`);
}

// 4) Revalidation. items.json is ~5.5 MB; an unchanged table must not be
//    re-parsed or written back to storage on every page load.
{
  const writes = [];
  const realSet = chrome.storage.local.set;
  chrome.storage.local.set = async bag => { writes.push(...Object.keys(bag)); return realSet(bag); };
  const headers = map => ({ get: name => map[name.toLowerCase()] ?? null });
  const V1 = { etag: 'W/"53e2e7-1"', 'last-modified': 'Wed, 16 Sep 2026 13:08:48 GMT' };
  const table = gen => ({ items: [{ item_id: 'bar_1', name: 'Iron Bar', tier: 2 }], generatedAt: gen });
  let parses = 0;
  let requestInit = null;
  let respond = () => ({ ok: true, status: 200, headers: headers(V1), async json() { parses += 1; return table('gen-A'); } });
  globalThis.fetch = async (url, init) => { requestInit = init; return respond(); };

  extStorage.clear();
  const { ItemDatabase: db } = await import('../src/modules/ItemDatabase.js?revalidate=4');
  await db.ready();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(parses, 1, 'first load parses the table');
  assert.equal(requestInit?.cache, 'no-cache', 'the request revalidates instead of bypassing the HTTP cache');
  assert.equal(extStorage.get('iw-item-db-cache')?.validator, `${V1.etag}|${V1['last-modified']}`,
    'the validator is stored with the table');

  // 4a) Same validator: no parse, no table write, only the small checked key.
  writes.length = 0;
  respond = () => ({ ok: true, status: 200, headers: headers(V1), async json() { throw new Error('must not parse an unchanged table'); } });
  await db._refreshOnce();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(writes, ['iw-item-db-cache-checked'], 'an unchanged table writes only its confirmation');
  assert.equal(db.getByName('Iron Bar')?.item_id, 'bar_1');

  // 4b) The confirmation keeps an old cache fresh on the next page load...
  extStorage.set('iw-item-db-cache', { ...extStorage.get('iw-item-db-cache'), cachedAt: Date.now() - 7 * 3600 * 1000 });
  assert.equal((await db._readCache()).stale, false, 'a confirmed cache is fresh although cachedAt is 7h old');
  // ...but only for the generation it confirmed (negative control).
  extStorage.set('iw-item-db-cache-checked', { generatedAt: 'gen-OTHER', checkedAt: Date.now() });
  assert.equal(await db._readCache(), null, 'a confirmation of another generation does not freshen the cache');

  // 4c) Negative control: a changed validator IS parsed and re-indexed.
  parses = 0;
  const V2 = { etag: 'W/"53e2e7-2"', 'last-modified': 'Thu, 17 Sep 2026 09:00:00 GMT' };
  respond = () => ({ ok: true, status: 200, headers: headers(V2), async json() {
    parses += 1; return { items: [{ item_id: 'bar_2', name: 'Steel Bar', tier: 3 }], generatedAt: 'gen-B' };
  } });
  await db._refreshOnce();
  assert.equal(parses, 1, 'a new validator is parsed');
  assert.equal(db.getByName('Steel Bar')?.item_id, 'bar_2', 'and the new table is indexed');

  // 4d) A cache written before validators existed upgrades with ONE full write.
  extStorage.clear();
  extStorage.set('iw-item-db-cache', { ...table('gen-A'), cachedAt: Date.now() });
  const { ItemDatabase: legacy } = await import('../src/modules/ItemDatabase.js?legacy-cache=4');
  parses = 0;
  respond = () => ({ ok: true, status: 200, headers: headers(V1), async json() { parses += 1; return table('gen-A'); } });
  await legacy.ready();
  await legacy._refreshOnce();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(parses, 1, 'the unvalidated cache is parsed once to learn its validator');
  assert.equal(extStorage.get('iw-item-db-cache')?.validator, `${V1.etag}|${V1['last-modified']}`);
  respond = () => ({ ok: true, status: 200, headers: headers(V1), async json() { throw new Error('must not parse again'); } });
  await legacy._refreshOnce();

  chrome.storage.local.set = realSet;
}

console.log('PASS data service resilience tests');
