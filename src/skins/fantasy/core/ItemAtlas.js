/**
 * ItemAtlas — the Fantasy profile's item and gear sprite lookup.
 *
 * Legacy's AtlasService paints game nodes inline and owns the port's atlas
 * attributes, so Fantasy does not reuse it (and may not import it). This is a
 * read-only index over the same two vendored atlases:
 *
 *   item  assets/item_icons_atlas.png  + item_icons_index.csv   (by id, by name)
 *   gear  assets/gear_icons_atlas.png  + gear_icons_manifest.json (by name)
 *
 * The game's newer gear (Eternium Helm, Eternal Weave Boots) is in the gear
 * atlas under its display name and absent from the item index, so a lookup
 * tries the id first, then the visible name in both.
 *
 * A window is returned as percentages (CLAUDE.md: atlas sprites use
 * percentage background-size/-position), computed for a box at the cell's
 * aspect ratio, which for both atlases is square.
 */

import { assetUrl, warnOnce } from './Runtime.js';

const ITEM_INDEX = 'assets/item_icons_index.csv';
const GEAR_INDEX = 'assets/gear_icons_manifest.json';
const ITEM_SIZE = { width: 1280, height: 6144 };
const GEAR_SIZE = { width: 1280, height: 19840 };

let state = 'idle'; // idle | loading | ready | failed
let revision = 0;
const byId = new Map();
const byName = new Map();
const listeners = new Set();

/** "Miner's Gloves" / "miners gloves" / "MINERS-GLOVES" -> "minersgloves". */
export const nameKey = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

function windowOf(atlas, size, x, y, w, h) {
  const pct = n => `${+n.toFixed(4)}%`;
  return {
    atlas,
    size: `${pct(100 * size.width / w)} ${pct(100 * size.height / h)}`,
    pos: `${pct(size.width === w ? 0 : 100 * x / (size.width - w))} ${pct(size.height === h ? 0 : 100 * y / (size.height - h))}`,
  };
}

/** Minimal CSV: quoted fields with doubled quotes, no embedded newlines. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function indexItems(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines.shift());
  const col = name => head.indexOf(name);
  const [id, name, x, y, w, h] = ['item_id', 'name', 'x', 'y', 'width', 'height'].map(col);
  for (const line of lines) {
    const f = parseCsvLine(line);
    const win = windowOf('item', ITEM_SIZE, +f[x], +f[y], +f[w], +f[h]);
    byId.set(f[id], win);
    const key = nameKey(f[name]);
    if (key && !byName.has(key)) byName.set(key, win);
  }
}

function indexGear(manifest) {
  for (const icon of manifest.icons || []) {
    const key = nameKey(icon.name);
    // The item atlas wins a name both carry: it is the one the id names.
    if (key && !byName.has(key)) byName.set(key, windowOf('gear', GEAR_SIZE, icon.x, icon.y, icon.width, icon.height));
  }
}

/** Start loading both indexes once; listeners run when they arrive. */
export function loadItemAtlas() {
  if (state !== 'idle') return;
  state = 'loading';
  const get = (path, kind) => fetch(assetUrl(path)).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r[kind]();
  });
  Promise.all([get(ITEM_INDEX, 'text'), get(GEAR_INDEX, 'json')])
    .then(([csv, gear]) => {
      indexItems(csv);
      indexGear(gear);
      state = 'ready';
      revision += 1;
      for (const fn of listeners) fn();
    })
    .catch(err => { state = 'failed'; warnOnce('item-atlas', err); });
}

export function onItemAtlas(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bumps once, when the indexes land; cache keys must include it (CLAUDE.md). */
export const itemAtlasRevision = () => revision;

/** The sprite window for an item, by game id first, then by display name. */
export function findItemSprite({ id, name } = {}) {
  if (state !== 'ready') return null;
  return (id && byId.get(id)) || byName.get(nameKey(name)) || null;
}

/** Test seam: forget everything (a fresh profile start re-fetches). */
export function resetItemAtlas() {
  state = 'idle';
  byId.clear();
  byName.clear();
  listeners.clear();
}
