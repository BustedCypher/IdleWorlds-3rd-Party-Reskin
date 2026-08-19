/**
 * AtlasService — v2, dual atlas
 *
 * Loads TWO sprite atlases and resolves any game item name or item_id
 * to a CSS background-position on the correct atlas:
 *
 *   Gear atlas   — gear_icons_atlas.png / gear_icons_manifest.json
 *                  1118 icons, equipment only, name-keyed
 *
 *   Item atlas   — item_icons_atlas.png / item_icons_index.csv
 *                  1167 icons, consumables/resources/processed/trade
 *                  goods, item_id-keyed (authoritative — matches the
 *                  game API's item_id field exactly)
 *
 * Resolution order (see resolve()):
 *   1. item_id match in the item atlas               (authoritative)
 *   2. name match in the item atlas
 *   3. name match in the gear atlas (direct)
 *   4. gear atlas after stripping a +N upgrade suffix
 *   5. gear atlas after applying the cloak material alias table
 *   6. gear atlas after stripping a " Lv N" suffix
 *   7. gear atlas after stripping a " of X" suffix
 *   8. gear atlas after stripping a leading affix word
 *
 * Rendering uses CSS background-position (not canvas blit) — cheaper
 * for potentially hundreds of simultaneous icons, and matches the
 * approach already proven in the toolkit reference implementation.
 */

import { applyCloakAlias } from './aliases.js';
import { normaliseItemName } from './normaliseItemName.js';
import { assetUrl, warnOnce } from './Runtime.js';

// Atlas assets ship INSIDE the extension (see assets/ and npm run vendor).
//
// They used to be fetched from raw.githubusercontent.com and applied as
// `background-image: url(https://...)`. That image request is issued by the
// PAGE, so it is governed by idleworlds.com's Content-Security-Policy — not by
// our host_permissions. A single `img-src` tightening on the game's side would
// have blanked every icon at once, indistinguishable from the v1.5.9 bug.
//
// Bundling them removes the CSP exposure entirely, works offline, costs no
// network round-trip, and makes the old ASSET_REVISION pin redundant: the
// sprites are now versioned with the extension that renders them.
const GEAR_MANIFEST_URL = assetUrl('assets/gear_icons_manifest.json');
const GEAR_ATLAS_URL    = assetUrl('assets/gear_icons_atlas.png');
const ITEM_INDEX_URL    = assetUrl('assets/item_icons_index.csv');
const ITEM_ATLAS_URL    = assetUrl('assets/item_icons_atlas.png');

// Columns parseCSV() must find in item_icons_index.csv before any icon is
// painted. Without this check a renamed column or a stray BOM silently made
// every `Number(entry.x) || 0` collapse to 0, painting the whole game with
// atlas cell 0,0 and no warning anywhere. (Audit S3.3)
const REQUIRED_ITEM_COLUMNS = ['item_id', 'name', 'x', 'y', 'width', 'height'];

const UPGRADE_SUFFIX = /\s*\+\s*\d+\s*$/i;
const LEVEL_SUFFIX   = /\s+lv\.?\s*\d+\s*$/i;
const OF_SUFFIX       = /\s+of\s+.+$/i;
const PREFIX_AFFIX    = /^(gilded|fortunate|enchanted|nimble|sturdy|keen|blessed|arcane|savage|swift|mighty|precise|reinforced|masterwork|superior|pristine)\s+/i;

const normalise = normaliseItemName;


function parseCSV(text) {
  // A UTF-8 BOM would otherwise become part of the first header name, so the
  // first column silently stops resolving.
  const clean = String(text || '').replace(/^﻿/, '');
  const lines = clean.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCSVLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

class _AtlasService {
  constructor() {
    this._gearManifest = null;
    this._gearByName   = null;
    this._gearDims     = { cols: 10, rows: 150, cell: 128 };

    this._itemRows     = null;
    this._itemById     = null;
    this._itemByName   = null;
    this._itemDims     = { cols: 10, rows: 38, cell: 128 };

    this._promise = null;
    this._nextRetryAt = 0;
    this._missingWarned = new Set();
    this._revision = 0;
  }

  isReady() {
    return !!(this._gearByName || this._itemById);
  }

  isComplete() {
    return !!(this._gearByName && this._itemById);
  }

  revision() {
    return this._revision;
  }

  /**
   * Resolve when at least one atlas is usable. A failure in one metadata
   * source no longer takes the other atlas down with it. Missing sources
   * are retried on later ready() calls after a small backoff.
   */
  ready() {
    if (this.isComplete()) return Promise.resolve();
    if (this._promise) return this._promise;

    // The backoff must be honoured whether or not a PARTIAL load succeeded.
    //
    // Previously this check was gated behind `isReady()`, so it only applied
    // once at least one atlas had loaded. When BOTH failed, _loadMissing()
    // rejected, `_promise` was nulled in .finally(), and the next ready() call
    // started a brand-new fetch immediately. paintIcon() calls ready() once per
    // rendered row, so a network failure with a full inventory produced a fetch
    // storm rather than a backoff. (Audit S3.2)
    if (Date.now() < this._nextRetryAt) {
      return this.isReady()
        ? Promise.resolve()
        : Promise.reject(new Error('Atlas metadata unavailable (backing off)'));
    }

    this._promise = this._loadMissing()
      .finally(() => { this._promise = null; });
    return this._promise;
  }

  async _loadMissing() {
    const jobs = [];
    const labels = [];

    if (!this._gearByName) {
      jobs.push(this._loadGearAtlas());
      labels.push('gear');
    }
    if (!this._itemById) {
      jobs.push(this._loadItemAtlas());
      labels.push('item');
    }

    if (!jobs.length) return;

    const results = await Promise.allSettled(jobs);
    const failures = [];
    let loaded = 0;

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') loaded += 1;
      else failures.push(`${labels[idx]}: ${result.reason?.message || result.reason}`);
    });

    if (loaded) {
      this._revision += 1;
      document.dispatchEvent(new CustomEvent('iw:atlas-updated', {
        detail: {
          revision: this._revision,
          gearReady: !!this._gearByName,
          itemReady: !!this._itemById,
        },
        bubbles: false,
      }));
    }

    if (failures.length) {
      // Partial availability is useful. Back off before attempting the
      // missing metadata again so many simultaneous icon paints cannot
      // create a retry storm.
      this._nextRetryAt = Date.now() + (this.isReady() ? 15000 : 5000);
      console.warn('[AtlasService] Partial load:', failures.join(' | '));
    } else {
      this._nextRetryAt = 0;
    }

    if (!this.isReady()) {
      throw new Error(`No atlas metadata available (${failures.join(' | ')})`);
    }

    console.log(
      `[AtlasService] Ready — gear: ${this._gearByName ? this._gearByName.size : 0} icons, ` +
      `items: ${this._itemRows ? this._itemRows.length : 0} icons`
    );
  }

  async _loadGearAtlas() {
    const res = await fetch(GEAR_MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Gear manifest fetch failed: ${res.status}`);
    const manifest = await res.json();
    if (!manifest || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      throw new Error('Gear manifest contained no icons');
    }

    this._gearManifest = manifest;
    this._gearDims = {
      cols: manifest.columns || 10,
      rows: manifest.rows || 150,
      cell: manifest.cell_size || 128,
    };
    this._gearByName = new Map();
    for (const icon of manifest.icons) {
      const key = normalise(icon.name);
      if (key) this._gearByName.set(key, icon);
    }

    // Same schema-drift guard as the item index: an icon record with no
    // coordinates resolves to cell 0,0 for every gear item on the page.
    const sample = manifest.icons[0] || {};
    if (!Number.isFinite(Number(sample.x)) || !Number.isFinite(Number(sample.y))) {
      warnOnce('atlas:gear-schema', new Error(
        'Gear manifest icons have no numeric x/y — icons will render as atlas cell 0,0'
      ));
    }
  }

  async _loadItemAtlas() {
    const res = await fetch(ITEM_INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Item index fetch failed: ${res.status}`);
    const csvText = await res.text();
    const { headers, rows } = parseCSV(csvText);
    if (!rows.length) throw new Error('Item index contained no rows');

    // Fail loudly on schema drift rather than painting 1167 identical sprites.
    const missing = REQUIRED_ITEM_COLUMNS.filter(col => !headers.includes(col));
    if (missing.length) {
      throw new Error(`Item index missing required column(s): ${missing.join(', ')}`);
    }

    this._itemRows = rows;
    this._itemById = new Map();
    this._itemByName = new Map();

    let maxRow = 0, maxCol = 0;
    for (const row of rows) {
      if (row.item_id !== undefined && row.item_id !== null && row.item_id !== '') {
        this._itemById.set(String(row.item_id), row);
      }
      const key = normalise(row.name);
      if (key && !this._itemByName.has(key)) this._itemByName.set(key, row);
      maxRow = Math.max(maxRow, Number(row.row) || 0);
      maxCol = Math.max(maxCol, Number(row.column) || 0);
    }
    this._itemDims = {
      cols: maxCol + 1,
      rows: maxRow + 1,
      cell: Number(rows[0]?.width) || 128,
    };
  }

  resolve(ref = {}) {
    const id   = ref.id !== undefined && ref.id !== null ? String(ref.id) : null;
    const name = ref.name || '';

    if (id && this._itemById && this._itemById.has(id)) {
      return { atlas: 'item', entry: this._itemById.get(id) };
    }

    if (name && this._itemByName) {
      const hit = this._itemByName.get(normalise(name));
      if (hit) return { atlas: 'item', entry: hit };
    }

    if (!name || !this._gearByName) return null;

    let hit = this._gearByName.get(normalise(name));
    if (hit) return { atlas: 'gear', entry: hit };

    const upgradeMatch = UPGRADE_SUFFIX.exec(name);
    const badge = upgradeMatch ? parseInt(upgradeMatch[0].replace(/\D/g, ''), 10) : 0;
    let stripped = name.replace(UPGRADE_SUFFIX, '').trim();

    hit = this._gearByName.get(normalise(stripped));
    if (hit) return { atlas: 'gear', entry: hit, badge };

    const aliased = applyCloakAlias(stripped);
    if (aliased !== stripped) {
      hit = this._gearByName.get(normalise(aliased));
      if (hit) return { atlas: 'gear', entry: hit, badge };
    }

    const noLevel = stripped.replace(LEVEL_SUFFIX, '').trim();
    hit = this._gearByName.get(normalise(noLevel));
    if (hit) return { atlas: 'gear', entry: hit, badge };

    const noSuffix = noLevel.replace(OF_SUFFIX, '').trim();
    hit = this._gearByName.get(normalise(noSuffix));
    if (hit) return { atlas: 'gear', entry: hit, badge };

    const noPrefix = noSuffix.replace(PREFIX_AFFIX, '').trim();
    hit = this._gearByName.get(normalise(noPrefix));
    if (hit) return { atlas: 'gear', entry: hit, badge };

    if (!this._missingWarned.has(name)) {
      this._missingWarned.add(name);
      console.warn(`[AtlasService] No icon found for "${name}"`);
    }
    return null;
  }

  paint(hostEl, ref) {
    if (!hostEl) return false;
    const result = this.resolve(ref);
    if (!result) return false;

    const { atlas, entry, badge } = result;
    const isGear = atlas === 'gear';
    const atlasUrl = isGear ? GEAR_ATLAS_URL : ITEM_ATLAS_URL;
    const dims = isGear ? this._gearDims : this._itemDims;

    const cell = dims.cell;
    const atlasW = dims.cols * cell;
    const atlasH = dims.rows * cell;

    const x = Number(entry.x) || 0;
    const y = Number(entry.y) || 0;
    const w = Number(entry.width) || cell;
    const h = Number(entry.height) || cell;

    const xPct = atlasW > w ? (x / (atlasW - w)) * 100 : 0;
    const yPct = atlasH > h ? (y / (atlasH - h)) * 100 : 0;

    hostEl.style.backgroundImage    = `url("${atlasUrl}")`;
    hostEl.style.backgroundSize     = `${(atlasW / w) * 100}% ${(atlasH / h) * 100}%`;
    hostEl.style.backgroundPosition = `${xPct.toFixed(6)}% ${yPct.toFixed(6)}%`;
    hostEl.style.backgroundRepeat   = 'no-repeat';
    hostEl.dataset.iwAtlas          = atlas;

    if (badge) this._paintPlaceholderBadge(hostEl, badge);
    else this._clearBadge(hostEl);

    return true;
  }

  _paintPlaceholderBadge(hostEl, level) {
    if (typeof getComputedStyle === 'function' && getComputedStyle(hostEl).position === 'static') {
      hostEl.style.position = 'relative';
    }
    let badgeEl = hostEl.querySelector('.iw-icon-badge');
    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.className = 'iw-icon-badge';
      hostEl.appendChild(badgeEl);
    }
    badgeEl.textContent = `+${level}`;
  }

  _clearBadge(hostEl) {
    const badgeEl = hostEl.querySelector('.iw-icon-badge');
    if (badgeEl) badgeEl.remove();
  }

  hasIcon(ref) {
    return this.resolve(ref) !== null;
  }
}

export const AtlasService = new _AtlasService();
