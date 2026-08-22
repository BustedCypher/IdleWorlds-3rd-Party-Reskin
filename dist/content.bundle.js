(() => {
  "use strict";
  const __modules = Object.create(null);
  __modules["content.js"] = (module, exports, require) => {
    /**
     * IdleWorlds Fantasy Skin — content script entry point
     *
     * Lifecycle rules:
     *   1. Every stylesheet is runtime-owned and removable, including base.css.
     *   2. Consumer/listener registration happens ONCE for the page lifetime.
     *   3. Each activation re-injects presentation CSS, starts services/painting,
     *      then starts DOMWatcher LAST.
     *   4. Teardown reverses the active work and removes every skin stylesheet.
     *   5. Runtime guards make late reconciliation callbacks inert while disabled;
     *      queued callbacks still run their bookkeeping so no queue flag is stranded.
     */
    const { inject, removeAll: removeAllStyles } = require("modules/StyleInjector.js");
    const { startWatcher, stopWatcher, on, getScanRoots } = require("modules/DOMWatcher.js");
    const { AtlasService } = require("modules/AtlasService.js");
    const { ItemDatabase } = require("modules/ItemDatabase.js");
    const { initTooltipEngine, hideTooltip } = require("modules/TooltipEngine.js");
    const { scanForItemNames, clearItemNameScan } = require("modules/NameScanner.js");
    const { initInventoryRenderer, clearInventoryRenderer } = require("modules/InventoryRenderer.js");
    const { initSkillPanelRenderer, clearSkillPanels } = require("modules/SkillPanelRenderer.js");
    const { initUIFoundation, clearUIFoundation } = require("modules/UIFoundation.js");
    const { paintBackground, clearBackgroundPaint } = require("modules/BackgroundPainter.js");
    const { guard, guardEach, storageGet, onStorageChanged, setRuntimeActive } = require("modules/Runtime.js");
    const baseCss = require("styles/base.css").default;
    const tooltipCss = require("styles/tooltip-engine.css").default;
    const inventoryCss = require("styles/inventory.css").default;
    const skillPanelCss = require("styles/skillpanel.css").default;
    const uiSystemCss = require("styles/ui-system.css").default;
    const ENABLED_KEY = 'iw-skin-enabled';
    const VERSION = '1.6.0';
    
    let booted = false;
    let consumersBound = false;
    
    function injectPresentationStyles() {
      // base.css used to be declared in manifest.json. That made the kill switch
      // incapable of restoring the native page because manifest CSS cannot be
      // removed by StyleInjector. Keep ALL presentation lifecycle-owned instead.
      inject('base', baseCss);
      inject('tooltip-engine', tooltipCss);
      inject('inventory', inventoryCss);
      inject('skillpanel', skillPanelCss);
      inject('ui-system', uiSystemCss);
    }
    
    function scanRoots(roots) {
      if (!ItemDatabase.isReady()) return;
      const unique = new Set();
      for (const root of roots || []) {
        if (root && root.isConnected) unique.add(root);
      }
      guardEach('scan-roots', unique, root => scanForItemNames(root));
    }
    
    function bindConsumersOnce() {
      if (consumersBound) return;
      consumersBound = true;
    
      // Module initializers register their delegated/document listeners. They are
      // intentionally page-lifetime bindings; activation state is controlled by
      // DOMWatcher + Runtime rather than adding another copy on every re-enable.
      guard('init:tooltip', initTooltipEngine);
      guard('init:inventory', initInventoryRenderer);
      guard('init:skill-panel', initSkillPanelRenderer);
      guard('init:ui-foundation', initUIFoundation);
    
      on('iw:dom-flush', e => {
        const roots = e.detail?.roots || [];
        if (!roots.length) {
          guard('paint:document', () => paintBackground());
          return;
        }
        guardEach('paint:root', roots, root => paintBackground(root));
      });
    
      on('iw:name-scan-flush', e => {
        if (!ItemDatabase.isReady()) return;
        scanRoots(e.detail?.roots || []);
      });
    
      document.addEventListener('iw:item-db-updated', () => {
        scanRoots([...getScanRoots()]);
      });
    }
    
    function boot() {
      if (booted) return;
      booted = true;
      setRuntimeActive(true);
    
      // 1. Presentation CSS belongs to THIS activation.
      injectPresentationStyles();
    
      // 2. Event consumers belong to the PAGE lifetime and are bound once.
      bindConsumersOnce();
    
      // 3. Start async services. Neither is allowed to poison itself forever
      // after a transient failure; renderers reconcile again on update events.
      AtlasService.ready().catch(err => {
        console.warn('[IW Fantasy Skin] Atlas failed to load:', err.message);
      });
    
      ItemDatabase.startAutoRefresh();
      ItemDatabase.ready().catch(err => {
        console.warn('[IW Fantasy Skin] Item database failed to load:', err.message);
      });
    
      // 4. Existing page ground.
      guard('paint:initial', () => paintBackground());
    
      // 5. Initial DOM discovery happens here, after every listener exists.
      guard('start:watcher', startWatcher);
    
      console.log(`[IW Fantasy Skin] v${VERSION} booted`);
    }
    
    /**
     * Remove the active skin from the live page.
     *
     * Keep Runtime active until module cleanup has completed: teardown functions use
     * guardEach(), and they must be allowed to restore/remove the active decoration.
     * Runtime is marked inactive only after the page has been cleaned, which also
     * suppresses late data-service/reconciliation events until the next boot.
     */
    function teardown() {
      if (!booted) {
        setRuntimeActive(false);
        return;
      }
      booted = false;
    
      guard('teardown:watcher', stopWatcher);
      ItemDatabase.stopAutoRefresh();
      guard('teardown:tooltip', () => hideTooltip());
      guard('teardown:name-scan', clearItemNameScan);
      guard('teardown:inventory', clearInventoryRenderer);
      guard('teardown:skill-panel', clearSkillPanels);
      guard('teardown:ui-foundation', clearUIFoundation);
      guard('teardown:background', clearBackgroundPaint);
      guard('teardown:styles', removeAllStyles);
    
      // From here until the next boot, any late async/data callbacks are inert.
      setRuntimeActive(false);
    
      console.log('[IW Fantasy Skin] disabled — active presentation removed');
    }
    
    function applyEnabled(enabled) {
      if (enabled === false) teardown();
      else boot();
    }
    
    (async function start() {
      // Nothing should reconcile before the persisted enable state is known.
      setRuntimeActive(false);
    
      // Default to enabled: a storage read failure must never leave the user with
      // a silently inert extension.
      const stored = await storageGet(ENABLED_KEY);
      applyEnabled(stored === null ? true : stored !== false);
    
      // This listener intentionally remains active while the skin is disabled: it
      // is the mechanism that can turn the skin back on.
      onStorageChanged(ENABLED_KEY, value => applyEnabled(value !== false));
    })();
  };
  __modules["modules/AtlasService.js"] = (module, exports, require) => {
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
    const { applyCloakAlias } = require("modules/aliases.js");
    const { normaliseItemName } = require("modules/normaliseItemName.js");
    const { assetUrl, warnOnce } = require("modules/Runtime.js");
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
    
    // These are the columns runtime rendering ACTUALLY depends on. `row` and
    // `column` may exist as convenient metadata, but atlas dimensions are derived
    // from x/y/width/height so removing optional grid labels cannot silently turn
    // the atlas into a calculated 1x1 image.
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
    
        const cell = Number(rows[0]?.width) || 128;
        let maxX = 0, maxY = 0;
        for (const row of rows) {
          if (row.item_id !== undefined && row.item_id !== null && row.item_id !== '') {
            this._itemById.set(String(row.item_id), row);
          }
          const key = normalise(row.name);
          if (key && !this._itemByName.has(key)) this._itemByName.set(key, row);
    
          const x = Number(row.x);
          const y = Number(row.y);
          const w = Number(row.width);
          const h = Number(row.height);
          if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
            throw new Error(`Item index contains invalid sprite bounds for ${row.item_id || row.name || 'unknown item'}`);
          }
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
        }
    
        // Runtime paint() needs the atlas pixel extent, not human-friendly grid
        // labels. Derive it from required coordinates so optional row/column fields
        // cannot affect correctness.
        this._itemDims = {
          cols: Math.max(1, Math.ceil(maxX / cell)),
          rows: Math.max(1, Math.ceil(maxY / cell)),
          cell,
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
    
    const AtlasService = new _AtlasService();
    
    
    exports.AtlasService = AtlasService;
  };
  __modules["modules/BackgroundPainter.js"] = (module, exports, require) => {
    /**
     * BackgroundPainter
     *
     * Reconciles only colours that match the game's known navy palette. Nodes
     * are intentionally NOT treated as permanently processed: React can reuse
     * the same element and later write a stock background back onto it.
     *
     * NOTE (Audit S2.2): the surface gate below — depth-2 from <body> plus an
     * exact-hex whitelist — is the main reason the skin stops at a boundary on
     * deeper React trees. Replacing it with a luminance-based classifier is
     * Phase 2 work; this pass only fixes the border parsing and adds teardown.
     */
    const { warnOnce } = require("modules/Runtime.js");
    const { createInlineStyleOwner } = require("modules/InlineStyleOwner.js");
    const styleOwner = createInlineStyleOwner();
    
    const GAME_NAVIES = new Set([
      '#0f172a', '#111827', '#131d28', '#131e28', '#131d27',
      '#141e28', '#121d27', '#121c27', '#121d28', '#1a2030',
      '#1b231f', '#191f1d', '#162920', '#111c24', '#0f1923',
      '#111926', '#0d1a24', '#131b26', '#12202d', '#1c2940',
    ]);
    
    const SURFACE_SELECTOR = [
      '.compact-panel',
      '.compact-row',
      '[class*="item-row"]',
      '[role="dialog"]',
      '[role="menu"]',
      '[role="listbox"]',
      'main',
      'section',
      'article',
      'aside',
      'header',
      'nav',
    ].join(', ');
    
    function ourColour(gameHex) {
      const r = parseInt(gameHex.slice(1, 3), 16);
      const g = parseInt(gameHex.slice(3, 5), 16);
      const b = parseInt(gameHex.slice(5, 7), 16);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    
      if (lum < 12) return '#0B0C0A';
      if (lum < 20) return '#14130F';
      if (lum < 28) return '#191711';
      return '#1E1B15';
    }
    
    function normHex(colour) {
      if (!colour || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') return null;
      const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    function ownedTree(el) {
      return el.closest?.('.fs-inv-row, .fs-skill-header, .iw-tip') || null;
    }
    
    function shouldSkip(el) {
      if (!el || el.nodeType !== 1) return true;
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'HTML'].includes(el.tagName)) return true;
      if (el.classList.contains('fs-skill-wrapper')) return true;
      if (ownedTree(el)) return true;
      return false;
    }
    
    function isSurfaceCandidate(el) {
      if (el === document.body) return true;
      if (el.matches?.(SURFACE_SELECTOR)) return true;
    
      // Root application shells are often plain divs. Paint only the first two
      // layers beneath body; do not recursively classify every text wrapper as a
      // surface just because it happens to have a navy computed background.
      const parent = el.parentElement;
      if (parent === document.body) return true;
      if (parent?.parentElement === document.body && el.children.length > 1) return true;
      return false;
    }
    
    function setImportant(el, prop, value) {
      return styleOwner.set(el, prop, value, 'important');
    }
    
    function paintElement(el) {
      if (shouldSkip(el) || !isSurfaceCandidate(el)) return false;
      let changed = false;
      const style = getComputedStyle(el);
    
      const bg = normHex(style.backgroundColor);
      if (bg && GAME_NAVIES.has(bg)) {
        changed = setImportant(el, 'background-color', ourColour(bg)) || changed;
      }
    
      // `border-color` computes to a single value only when all four sides agree.
      // When they differ Chrome returns a multi-value string, which the single-rgb
      // regex in normHex() rejected — so mixed-border panels silently never got the
      // brass edge. Check each side, and repaint whichever sides are game navy.
      // (Audit S2.2)
      const sides = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
      const sideProps = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
      for (let i = 0; i < sides.length; i += 1) {
        const hex = normHex(style[sides[i]]);
        if (hex && GAME_NAVIES.has(hex)) {
          changed = setImportant(el, sideProps[i], '#342D20') || changed;
        }
      }
    
      if (changed && el.dataset.iwPainted !== '1') el.dataset.iwPainted = '1';
      return changed;
    }
    
    function paintBackground(root = document.body) {
      if (!root) return 0;
      let changed = 0;
    
      try {
        if (root.nodeType === 1 && paintElement(root)) changed += 1;
    
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node;
        while ((node = walker.nextNode())) {
          if (paintElement(node)) changed += 1;
        }
      } catch (err) {
        warnOnce('background:paint', err);
      }
      return changed;
    }
    
    /** Undo every inline property this module owns. Kill switch. */
    function clearBackgroundPaint() {
      styleOwner.restoreAll();
      document.querySelectorAll('[data-iw-painted="1"]').forEach(el => {
        delete el.dataset.iwPainted;
      });
    }
    
    
    exports.paintBackground = paintBackground;
    exports.clearBackgroundPaint = clearBackgroundPaint;
  };
  __modules["modules/DOMWatcher.js"] = (module, exports, require) => {
    /**
     * DOMWatcher
     *
     * One MutationObserver owns all observation of the game's DOM. Renderers
     * subscribe to typed events and must be safe to run more than once for the
     * same element. This is intentionally a reconciliation model rather than a
     * "seen once = finished forever" model: React frequently reuses nodes and
     * mutates their contents/attributes in place.
     *
     * Events dispatched on document:
     *   iw:inventory-row      detail: { row, reason }
     *   iw:skill-panel        detail: { panel, skill, reason }
     *   iw:equipment-panel    detail: { panel, reason }
     *   iw:shop-panel         detail: { panel, reason }
     *   iw:dom-flush          detail: { roots }
     *   iw:name-scan-flush    detail: { roots }
     */
    const { guard, guardEach, raf } = require("modules/Runtime.js");
    const SEL_INV_ROW     = '.compact-row, [class*="item-row"]';
    const SEL_SKILL_PANEL = '.compact-panel';
    const SEL_EQUIP_PANEL = '[class*="equipment"]';
    const SEL_SHOP_PANEL  = '[class*="shop"]';
    
    // Item-name discovery is intentionally not tied to a small selector list.
    // IdleWorlds can surface an item name in quests, skills, equipment, shops,
    // combat results, dialogs, village panels and new React features we do not yet
    // know about. NameScanner is read-only, so every dirty subtree can safely be
    // considered while the scanner itself rejects unsafe/skin-owned containers.
    
    // Upper bound on elements reconciled per animation frame. A mutation burst
    // (zone change, page switch, a big market refresh) should spread across a few
    // frames rather than blocking one for hundreds of milliseconds. Anything not
    // processed stays queued and is picked up on the next frame. (Audit S4)
    const FLUSH_BUDGET = 60;
    
    function emit(type, detail = {}) {
      document.dispatchEvent(new CustomEvent(type, { detail, bubbles: false }));
    }
    
    function isElement(node) {
      return !!node && node.nodeType === 1;
    }
    
    function nearest(el, selector) {
      if (!isElement(el)) return null;
      if (el.matches?.(selector)) return el;
      return el.closest?.(selector) || null;
    }
    
    /**
     * Skill detection is pure with respect to a panel's button/heading text.
     * Recomputing detection on every flush is unnecessary, but the cache key must
     * represent the CONTENT that detection actually reads. The old key stored only
     * button count + text lengths, so an equal-length change such as Mine -> Fish
     * returned the previous skill type indefinitely on a reused React panel.
     */
    const skillTypeCache = new WeakMap();
    
    function normaliseSkillSignal(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    
    const SKILL_IDENTITY_ALIASES = {
      combat: ['combat'],
      mining: ['mining'],
      smithing: ['smithing'],
      gathering: ['gathering'],
      alchemy: ['alchemy'],
      jewelcrafting: ['jewel', 'jewelcrafting'],
      spellcrafting: ['spellcraft', 'spellcrafting'],
      tailoring: ['tailor', 'tailoring'],
      crafting: ['crafting'],
      fishing: ['fishing'],
    };
    
    function skillIdentitySignals(panel) {
      const signals = new Set();
      for (const el of panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"],div,span')) {
        if (el.closest('button,a')) continue;
        const explicitHeading = /^H[1-4]$/.test(el.tagName) || /skill-name/i.test(String(el.className || ''));
        if (!explicitHeading && el.childElementCount) continue;
        const text = normaliseSkillSignal(el.textContent);
        if (text && text.length <= 32) signals.add(text);
      }
      return [...signals];
    }
    
    function skillTypeFromIdentity(signals) {
      for (const [type, aliases] of Object.entries(SKILL_IDENTITY_ALIASES)) {
        if (aliases.some(alias => signals.includes(alias))) return type;
      }
      return null;
    }
    
    function skillSignature(panel) {
      const buttons = [...panel.querySelectorAll('button')]
        .map(btn => normaliseSkillSignal(btn.textContent));
      const identities = skillIdentitySignals(panel);
    
      // JSON preserves array boundaries and exact signal content without a
      // collision-prone delimiter/hash scheme. These strings are tiny compared
      // with the panel subtree scans detection would otherwise repeat.
      return JSON.stringify([buttons, identities]);
    }
    
    function detectSkillTypeCached(panel) {
      const sig = skillSignature(panel);
      const hit = skillTypeCache.get(panel);
      if (hit && hit.sig === sig) return hit.type;
      const type = detectSkillType(panel);
      skillTypeCache.set(panel, { sig, type });
      return type;
    }
    
    function detectSkillType(panel) {
      // Positive identification only. .compact-panel is reused across quests,
      // bosses, village and other systems, so searching arbitrary panel body text
      // for words such as "craft" caused unrelated cards to inherit skill chrome.
      const actionTexts = [...panel.querySelectorAll('button')]
        .map(btn => normaliseSkillSignal(btn.textContent))
        .filter(Boolean);
    
      const hasAction = (...names) => actionTexts.some(text => names.includes(text));
    
      // Specific verbs are authoritative. GATHER/HARVEST are deferred because
      // Spellcraft currently reuses those verbs for mana harvesting.
      if (hasAction('fight'))                    return 'combat';
      if (hasAction('mine'))                     return 'mining';
      if (hasAction('prospect'))                 return 'jewelcrafting';
      if (hasAction('smelt', 'forge'))           return 'smithing';
      if (hasAction('brew'))                     return 'alchemy';
      if (hasAction('enchant'))                  return 'spellcrafting';
      if (hasAction('tailor', 'sew', 'weave'))   return 'tailoring';
      if (hasAction('craft'))                    return 'crafting';
      if (hasAction('fish'))                     return 'fishing';
    
      const labels = skillIdentitySignals(panel);
      const identityType = skillTypeFromIdentity(labels);
      if (identityType) return identityType;
      if (hasAction('gather', 'harvest'))        return 'gathering';
    
      // Fallback remains exact/anchored and never searches arbitrary body prose.
      if (labels.some(t => /^combat(?:\s|$)/.test(t))) return 'combat';
      if (labels.some(t => /^mining(?:\s|$)|^mine(?:\s|$)/.test(t))) return 'mining';
      if (labels.some(t => /^(?:jewel|jewelcrafting)(?:\s|$)|^prospect(?:\s|$)/.test(t))) return 'jewelcrafting';
      if (labels.some(t => /^smithing(?:\s|$)|^smelt(?:\s|$)/.test(t))) return 'smithing';
      if (labels.some(t => /^gathering(?:\s|$)|^gather(?:\s|$)/.test(t))) return 'gathering';
      if (labels.some(t => /^alchemy(?:\s|$)|^brew(?:\s|$)/.test(t))) return 'alchemy';
      if (labels.some(t => /^(?:spellcraft|spellcrafting)(?:\s|$)|^enchant(?:\s|$)/.test(t))) return 'spellcrafting';
      if (labels.some(t => /^(?:tailor|tailoring)(?:\s|$)|^(?:tailor|sew|weave)(?:\s|$)/.test(t))) return 'tailoring';
      if (labels.some(t => /^crafting(?:\s|$)/.test(t))) return 'crafting';
      if (labels.some(t => /^fishing(?:\s|$)|^fish(?:\s|$)/.test(t))) return 'fishing';
      return 'unknown';
    }
    
    const pendingInventory = new Set();
    const pendingSkills    = new Set();
    const pendingEquipment = new Set();
    const pendingShop      = new Set();
    const pendingBgRoots   = new Set();
    const pendingNameRoots = new Set();
    let flushQueued = false;
    
    function addIfConnected(set, el) {
      if (isElement(el)) set.add(el);
    }
    
    function addNameRoot(el) {
      if (!isElement(el)) return;
      for (const root of [...pendingNameRoots]) {
        if (root === el || root.contains?.(el)) return;
        if (el.contains?.(root)) pendingNameRoots.delete(root);
      }
      pendingNameRoots.add(el);
    }
    
    function queueContext(el, reason = 'update', opts = {}) {
      if (!isElement(el)) return;
      const {
        inventory = true,
        skill = true,
        equipment = true,
        shop = true,
        names = true,
        background = true,
      } = opts;
    
      if (inventory) addIfConnected(pendingInventory, nearest(el, SEL_INV_ROW));
      if (skill)     addIfConnected(pendingSkills,    nearest(el, SEL_SKILL_PANEL));
      if (equipment) addIfConnected(pendingEquipment, nearest(el, SEL_EQUIP_PANEL));
      if (shop)      addIfConnected(pendingShop,      nearest(el, SEL_SHOP_PANEL));
      if (names)     addNameRoot(el);
      if (background) addIfConnected(pendingBgRoots, el);
      scheduleFlush(reason);
    }
    
    function discover(root, reason = 'mount') {
      if (!isElement(root)) return;
    
      if (root.matches?.(SEL_INV_ROW)) addIfConnected(pendingInventory, root);
      root.querySelectorAll?.(SEL_INV_ROW).forEach(el => addIfConnected(pendingInventory, el));
    
      if (root.matches?.(SEL_SKILL_PANEL)) addIfConnected(pendingSkills, root);
      root.querySelectorAll?.(SEL_SKILL_PANEL).forEach(el => addIfConnected(pendingSkills, el));
    
      if (root.matches?.(SEL_EQUIP_PANEL)) addIfConnected(pendingEquipment, root);
      root.querySelectorAll?.(SEL_EQUIP_PANEL).forEach(el => addIfConnected(pendingEquipment, el));
    
      if (root.matches?.(SEL_SHOP_PANEL)) addIfConnected(pendingShop, root);
      root.querySelectorAll?.(SEL_SHOP_PANEL).forEach(el => addIfConnected(pendingShop, el));
    
      addNameRoot(root);
    
      addIfConnected(pendingBgRoots, root);
      scheduleFlush(reason);
    }
    
    function scheduleFlush() {
      if (flushQueued) return;
      flushQueued = true;
      raf(flushPending);
    }
    
    /**
     * Take up to `budget` connected elements out of `set`.
     *
     * Two behaviours matter here:
     *
     *  • Disconnected entries are dropped (they cannot be reconciled), but an
     *    element that React detached and will re-attach generates a childList
     *    mutation on its new parent, so it comes back on a later frame.
     *  • Anything over budget STAYS in the set and a follow-up frame is scheduled,
     *    so a burst degrades into several frames instead of one long one.
     */
    function takeConnected(set) {
      for (const el of set) {
        set.delete(el);
        if (el?.isConnected) return el;
      }
      return null;
    }
    function drainGlobalBudget(budget) {
      const groups = [
        ['inventory', pendingInventory], ['skills', pendingSkills],
        ['equipment', pendingEquipment], ['shop', pendingShop],
        ['bgRoots', pendingBgRoots], ['nameRoots', pendingNameRoots],
      ];
      const out = Object.fromEntries(groups.map(([key]) => [key, []]));
      let cursor = 0, idle = 0, remaining = budget;
      while (remaining > 0 && idle < groups.length) {
        const [key, set] = groups[cursor];
        cursor = (cursor + 1) % groups.length;
        const el = takeConnected(set);
        if (el) { out[key].push(el); remaining -= 1; idle = 0; }
        else idle += 1;
      }
      return out;
    }
    
    function flushPending() {
      flushQueued = false;
    
      const { inventory, skills, equipment, shop, bgRoots, nameRoots } =
        drainGlobalBudget(FLUSH_BUDGET);
    
      // guardEach so one malformed row degrades to "that row stays native" instead
      // of silently cancelling the rest of this category's work. (Audit S3.7)
      guardEach('emit:inventory-row', inventory, row =>
        emit('iw:inventory-row', { row, reason: 'reconcile' }));
    
      guardEach('emit:skill-panel', skills, panel =>
        emit('iw:skill-panel', { panel, skill: detectSkillTypeCached(panel), reason: 'reconcile' }));
    
      guardEach('emit:equipment-panel', equipment, panel =>
        emit('iw:equipment-panel', { panel, reason: 'reconcile' }));
    
      guardEach('emit:shop-panel', shop, panel =>
        emit('iw:shop-panel', { panel, reason: 'reconcile' }));
    
      // These two are guarded individually so a throwing dom-flush consumer cannot
      // prevent the name-scan consumers from running, and — critically — cannot
      // skip the re-schedule below, which would strand every element still queued
      // behind the budget. Found by test/smoke.mjs.
      if (bgRoots.length) guard('emit:dom-flush', () => emit('iw:dom-flush', { roots: bgRoots }));
      if (nameRoots.length) guard('emit:name-scan-flush', () => emit('iw:name-scan-flush', { roots: nameRoots }));
    
      // Anything left over after the budget gets the next frame.
      if (pendingInventory.size || pendingSkills.size || pendingEquipment.size
          || pendingShop.size || pendingBgRoots.size || pendingNameRoots.size) {
        scheduleFlush();
      }
    }
    
    let _started = false;
    let _observer = null;
    
    function startWatcher() {
      if (_started) return;
      _started = true;
    
      _observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            // The container itself changed, so an existing row/panel may need
            // reconciliation even when React reused its root element. It does NOT
            // need repainting: any newly added subtree is queued for background
            // work by discover() below, and the container's own surface colour
            // cannot change just because a child arrived.
            if (isElement(m.target)) queueContext(m.target, 'children', { background: false, names: false });
    
            for (const n of m.addedNodes) {
              if (isElement(n)) discover(n, 'mount');
              else if (n.nodeType === 3 && n.parentElement) {
                queueContext(n.parentElement, 'text', { background: false });
              }
            }
          } else if (m.type === 'characterData') {
            // Text ticks are the highest-frequency mutation on an idle game — XP
            // counters, timers, gold totals, chat. Queuing their parent for a
            // background repaint made every tick walk a subtree calling closest()
            // and matches() on every descendant, to change nothing. Text cannot
            // alter a surface colour. (Audit S4.2)
            if (m.target.parentElement) {
              queueContext(m.target.parentElement, 'text', { background: false });
            }
          } else if (m.type === 'attributes') {
            // Attribute-only changes do not create new item-name text, so do not
            // spend a trie scan on them. Style changes are relevant to the skill
            // reconciler (React may wipe our inline button/readout treatment) and
            // to BackgroundPainter, but inventory metadata does not depend on them.
            if (m.attributeName === 'style') {
              queueContext(m.target, 'attr:style', {
                inventory: false,
                equipment: false,
                shop: false,
                names: false,
              });
            } else if (m.attributeName === 'disabled' || m.attributeName === 'aria-disabled') {
              queueContext(m.target, `attr:${m.attributeName}`, {
                inventory: false,
                equipment: false,
                shop: false,
                names: false,
                background: false,
              });
            } else {
              // A class change can make an existing node become (or cease being) a
              // row/panel, so structural consumers must reconsider THAT NODE.
              //
              // It used to also call discover(m.target), which runs five
              // querySelectorAll sweeps over the whole subtree. React toggles
              // classes on containers constantly (data-[state=…], animation
              // classes, progress steps), so a class flip on a high-level container
              // became a near-whole-document query — many times per frame on an
              // idle game that never stops mutating.
              //
              // A class change on an ANCESTOR cannot turn a descendant into a row:
              // that requires a mutation on the descendant itself, which the
              // observer reports separately. Reconciling the mutated node alone is
              // sufficient and orders of magnitude cheaper. (Audit S4.1)
              queueContext(m.target, 'attr:class', { names: false });
            }
          }
        }
      });
    
      _observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'disabled', 'aria-disabled'],
      });
    
      // Initial discovery happens only after all consumers have registered;
      // content.js intentionally starts this watcher last.
      discover(document.body, 'initial');
    }
    
    /**
     * Stop observing and drop all queued work.
     *
     * Required by the kill switch: when debugging a suspected skin/game
     * interaction you need to take the extension out of the loop without
     * uninstalling it and losing the page state you were investigating.
     */
    function stopWatcher() {
      if (_observer) {
        _observer.disconnect();
        _observer = null;
      }
      _started = false;
      flushQueued = false;
      pendingInventory.clear();
      pendingSkills.clear();
      pendingEquipment.clear();
      pendingShop.clear();
      pendingBgRoots.clear();
      pendingNameRoots.clear();
    }
    
    function getScanRoots(root = document) {
      const target = root?.body || root;
      return isElement(target) ? [target] : [];
    }
    
    function on(eventType, handler) {
      document.addEventListener(eventType, handler);
    }
    
    function off(eventType, handler) {
      document.removeEventListener(eventType, handler);
    }
    
    
    exports.startWatcher = startWatcher;
    exports.stopWatcher = stopWatcher;
    exports.getScanRoots = getScanRoots;
    exports.on = on;
    exports.off = off;
  };
  __modules["modules/InlineStyleOwner.js"] = (module, exports, require) => {
    /**
     * InlineStyleOwner
     *
     * Tracks only the inline CSS properties a skin module mutates. This lets a
     * renderer repair properties that React writes back while it is active AND
     * restore the game's most recent underlying value during teardown without
     * deleting unrelated inline styles.
     *
     * Why property-level ownership instead of snapshotting the whole `style`
     * attribute:
     *   • React may update another inline property while the skin is active.
     *   • Removing/replacing the whole style attribute would erase that update.
     *   • If React rewrites one of OUR owned properties, the next set() call sees
     *     the external value before re-applying the skin and promotes that value to
     *     the new native-underlay snapshot.
     *
     * CSSStyleDeclaration normalises values when they are written. For example,
     * `#DAD3C3` is commonly serialised back as `rgb(218, 211, 195)`. Ownership must
     * therefore remember the browser's POST-WRITE value, never the raw requested
     * string, or a later reconcile mistakes our own normalised value for a React
     * write and permanently promotes it to the "native" snapshot.
     */
    
    function createInlineStyleOwner() {
      const states = new WeakMap();
      const touched = new Set();
    
      function stateFor(el, prop) {
        let props = states.get(el);
        if (!props) {
          props = new Map();
          states.set(el, props);
          touched.add(el);
        }
    
        let state = props.get(prop);
        const currentValue = el.style.getPropertyValue(prop);
        const currentPriority = el.style.getPropertyPriority(prop);
    
        if (!state) {
          state = {
            nativeValue: currentValue,
            nativePriority: currentPriority,
            appliedValue: null,
            appliedPriority: null,
          };
          props.set(prop, state);
        } else if (
          state.appliedValue !== null &&
          (currentValue !== state.appliedValue || currentPriority !== state.appliedPriority)
        ) {
          // Something outside this owner changed the property after our last write.
          // Treat that as the game's newest underlying state before re-applying.
          state.nativeValue = currentValue;
          state.nativePriority = currentPriority;
        }
    
        return state;
      }
    
      function set(el, prop, value, priority = 'important') {
        if (!el?.style) return false;
        const state = stateFor(el, prop);
        const beforeValue = el.style.getPropertyValue(prop);
        const beforePriority = el.style.getPropertyPriority(prop);
    
        // Always let CSSStyleDeclaration parse/normalise the requested value first.
        // Comparing `beforeValue` directly with the caller's raw value is unsafe:
        // equivalent colours, shorthands and numeric forms can serialise differently.
        el.style.setProperty(prop, value, priority);
    
        const afterValue = el.style.getPropertyValue(prop);
        const afterPriority = el.style.getPropertyPriority(prop);
        state.appliedValue = afterValue;
        state.appliedPriority = afterPriority;
    
        return beforeValue !== afterValue || beforePriority !== afterPriority;
      }
    
      function restoreElement(el) {
        const props = states.get(el);
        if (!props) return;
    
        for (const [prop, state] of props) {
          const currentValue = el.style.getPropertyValue(prop);
          const currentPriority = el.style.getPropertyPriority(prop);
    
          // If React changed the property after our last write and teardown arrived
          // before reconciliation, that current value is already the best native
          // state. Do not overwrite it with an older snapshot.
          const stillOurs = currentValue === state.appliedValue &&
            currentPriority === state.appliedPriority;
          if (!stillOurs) continue;
    
          if (state.nativeValue) {
            el.style.setProperty(prop, state.nativeValue, state.nativePriority || '');
          } else {
            el.style.removeProperty(prop);
          }
        }
    
        states.delete(el);
        touched.delete(el);
      }
    
      function restoreWithin(root) {
        if (!root) return;
        for (const el of [...touched]) {
          if (el === root || root.contains?.(el)) restoreElement(el);
        }
      }
    
      function restoreAll() {
        for (const el of [...touched]) restoreElement(el);
      }
    
      return { set, restoreElement, restoreWithin, restoreAll };
    }
    
    
    exports.createInlineStyleOwner = createInlineStyleOwner;
  };
  __modules["modules/InventoryModel.js"] = (module, exports, require) => {
    /**
     * InventoryModel
     *
     * Pure presentation model for inventory-only dynamic details. The item
     * database remains authoritative for the stable item identity/stat rail;
     * native row text is used only for state that can vary per owned item
     * (loadouts, socketed gems, requirements, upgrade state, etc.).
     *
     * Keeping this parser separate from InventoryRenderer lets us regression-test
     * the information model without mounting or mutating the live React DOM.
     */
    
    const ACTION_WORDS = /^(equip|equipped|unequip|list|sell|use|drop|lock|unlock|deposit|withdraw|set bonus)$/i;
    const QUANTITY = /^(?:x|×)\s*\d[\d,]*$/i;
    const LEVEL_ONLY = /^lv\.?\s*\d+$/i;
    const NUMBER_ONLY = /^\d[\d,]*$/;
    const TIER_OR_SLOT = /^(?:tier\s*\d+|level\s*\d+)(?:\s*[·•-]\s*.+)?$/i;
    const BASIC_STAT = /^(?:atk|def|hp|war(?:fare)?)\s*\+?-?\d+/i;
    const SUMMARY_STAT = /(?:\bxp\b.*\/task|\bitem find\b|\bgold find\b|\bdouble gather\b|\b2\s*[×x]\s*gather\b|\bsockets?\b)/i;
    const REQUIREMENT = /^(?:requires?|needs)\b/i;
    const LOADOUT = /\b(?:in\s+)?loadout\b/i;
    const UPGRADE_STATE = /\b(?:not\s+)?upgradable\b|\bcannot\s+be\s+upgraded\b/i;
    const SOCKET_EFFECT = /\b(?:cut\s+[a-z][a-z' -]*|sunstone|moonstone|gem(?:stone)?|socketed)\b/i;
    const DYNAMIC_EFFECT = /:\s*[+-]?\d+(?:\.\d+)?(?:%|\b)/i;
    const SET_STATE = /\bset bonus\b/i;
    
    function normaliseInventoryText(value) {
      return String(value == null ? '' : value)
        .replace(/\s+/g, ' ')
        // Native rows often prefix semantic lines with emoji / decorative glyphs
        // (📁, 💎, ✦, etc.). The fantasy presentation supplies its own glyph, so
        // remove leading symbols before classification and duplicate detection.
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .trim();
    }
    
    function compareKey(value) {
      return normaliseInventoryText(value)
        .toLowerCase()
        .replace(/[.:;,]+$/g, '')
        .replace(/\s+/g, ' ');
    }
    
    function splitLevelName(name) {
      const text = normaliseInventoryText(name);
      const m = text.match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
      return m ? { full: text, base: m[1].trim(), level: m[2] } : { full: text, base: text, level: null };
    }
    
    function kindFor(text) {
      if (LOADOUT.test(text)) return 'loadout';
      if (SOCKET_EFFECT.test(text)) return 'socket';
      if (DYNAMIC_EFFECT.test(text)) return 'effect';
      if (SET_STATE.test(text)) return 'set';
      if (UPGRADE_STATE.test(text)) return 'status';
      return 'detail';
    }
    
    function isNameFragment(text, nameParts) {
      const key = compareKey(text);
      if (!key) return true;
      if (key === compareKey(nameParts.full) || key === compareKey(nameParts.base)) return true;
      if (nameParts.level && key === compareKey(`Lv ${nameParts.level}`)) return true;
      return false;
    }
    
    function isStableStatNoise(text) {
      if (LOADOUT.test(text) || UPGRADE_STATE.test(text) || SET_STATE.test(text)) return false;
      if (TIER_OR_SLOT.test(text)) return true;
      if (BASIC_STAT.test(text)) return true;
      if (SUMMARY_STAT.test(text) && !SOCKET_EFFECT.test(text)) return true;
      return false;
    }
    
    function isLikelyAggregate(text, nameParts) {
      const key = compareKey(text);
      const base = compareKey(nameParts.base);
      if (!key || !base || !key.startsWith(base)) return false;
      return /(?:\btier\b|\b(?:atk|def|hp)\s*[+-]?\d|\bxp\b.*\/task|\brequires?\b|\bloadout\b|\bupgrad)/i.test(text);
    }
    
    /**
     * Resolve an item identity from native row text without losing a separately
     * rendered +1..+4 enhancement badge. Prefer an exact enhanced record over the
     * base item whenever the combined name exists in ItemDatabase.
     */
    function resolveInventoryItemName(texts, getByName) {
      const lookup = typeof getByName === 'function' ? getByName : () => null;
      const source = (texts || []).map(t => String(t == null ? '' : t).trim()).filter(Boolean);
      const candidates = source.filter(t =>
        t.length > 2 && !/^\d[\d,]*$/.test(t) && !/^[x×]\s*\d/i.test(t) &&
        !/^lv\.?\s*\d+$/i.test(t) && !/^\+\s*[1-4]$/.test(t) &&
        !/^(equip|equipped|unequip|use|drop|sell|list|lock|unlock|set bonus)$/i.test(t)
      );
      const upgradeToken = source.find(t => /^\+\s*[1-4]$/.test(t));
      if (upgradeToken) {
        const suffix = '+' + upgradeToken.replace(/\D/g, '');
        for (const base of candidates) {
          for (const combined of [base + suffix, base + ' ' + suffix]) {
            if (lookup(combined)) return combined;
          }
        }
      }
      for (const c of candidates) if (lookup(c)) return c;
      const lvPat = /^lv\.?\s*(\d+)$/i;
      for (let i = 0; i < source.length; i++) {
        const base = source[i];
        if (!base || base.length < 3) continue;
        const prev = source[i - 1] || '';
        const next = source[i + 1] || '';
        for (const lv of [prev, next]) {
          const m = lvPat.exec(lv);
          if (!m) continue;
          for (const combined of [base + ' Lv. ' + m[1], base + ' Lv ' + m[1]]) {
            if (lookup(combined)) return combined;
          }
        }
      }
      return candidates[0] || '';
    }
    /**
     * Convert native row text into dynamic detail lines.
     *
     * @param {string[]} rawTexts text fragments/compact element text from the live row
     * @param {object|null} item ItemDatabase record (optional)
     * @param {string} displayName resolved inventory item name
     * @returns {{details:{text:string,kind:string,count:number}[], requirements:string[]}}
     */
    function buildInventoryDetails(rawTexts, item, displayName) {
      const nameParts = splitLevelName(item?.name || displayName || '');
      const counts = new Map();
      const requirements = [];
      const requirementKeys = new Set();
    
      // Work shortest-to-longest and discard parent-wrapper aggregates whenever
      // they contain an already captured semantic child. This mirrors the live
      // React DOM, where a row wrapper's textContent may concatenate name, tier,
      // loadout, stats, requirement and action labels into one giant string.
      const source = (rawTexts || [])
        .map(normaliseInventoryText)
        .filter(Boolean)
        .sort((a, b) => a.length - b.length);
      const atomics = [];
      for (const text of source) {
        if (text.length > 220 || isLikelyAggregate(text, nameParts)) continue;
        const key = compareKey(text);
        const containsAtomic = atomics.some(shorter => {
          const shortKey = compareKey(shorter);
          return shorter.length < text.length && shortKey.length >= 5 && key.includes(shortKey);
        });
        if (containsAtomic) continue;
        atomics.push(text);
      }
    
      for (const text of atomics) {
        if (!text || text.length > 180) continue;
        if (isNameFragment(text, nameParts)) continue;
        if (ACTION_WORDS.test(text) || QUANTITY.test(text) || LEVEL_ONLY.test(text) || NUMBER_ONLY.test(text)) continue;
    
        if (REQUIREMENT.test(text)) {
          const key = compareKey(text);
          if (!requirementKeys.has(key)) {
            requirementKeys.add(key);
            requirements.push(text);
          }
          continue;
        }
    
        // The stable tier/slot/stats are already sourced from ItemDatabase and
        // rendered on the primary meta rail. Native text is retained only when it
        // represents owned-item state the static database cannot know.
        if (isStableStatNoise(text)) continue;
    
        const interesting = LOADOUT.test(text) || SOCKET_EFFECT.test(text) || DYNAMIC_EFFECT.test(text) || UPGRADE_STATE.test(text) || SET_STATE.test(text);
        if (!interesting) continue;
    
        const key = compareKey(text);
        const current = counts.get(key);
        if (current) {
          current.count += 1;
        } else {
          counts.set(key, { text, kind: kindFor(text), count: 1 });
        }
      }
    
      const order = { loadout: 0, socket: 1, effect: 2, set: 3, status: 4, detail: 5 };
      const details = [...counts.values()].sort((a, b) => {
        const kindDiff = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
        return kindDiff || a.text.localeCompare(b.text);
      });
    
      return { details, requirements };
    }
    
    function inventoryDetailSignature(model) {
      if (!model) return '';
      return [
        ...(model.details || []).map(d => `${d.kind}:${compareKey(d.text)}:${d.count || 1}`),
        ...(model.requirements || []).map(r => `req:${compareKey(r)}`),
      ].join('|');
    }
    
    
    exports.normaliseInventoryText = normaliseInventoryText;
    exports.resolveInventoryItemName = resolveInventoryItemName;
    exports.buildInventoryDetails = buildInventoryDetails;
    exports.inventoryDetailSignature = inventoryDetailSignature;
  };
  __modules["modules/InventoryRenderer.js"] = (module, exports, require) => {
    /**
     * InventoryRenderer — v1.5.10 ItemRow correction pass
     *
     * Inventory is the first full reusable RPG item-row implementation. React
     * keeps ownership of every real command; the skin owns only presentation.
     * Stable item identity/stats come from ItemDatabase, while dynamic owned-item
     * state (loadout membership, socketed gem lines, requirements, upgrade state)
     * is read from the native row before display-only branches are suppressed.
     */
    const { on } = require("modules/DOMWatcher.js");
    const { AtlasService } = require("modules/AtlasService.js");
    const { ItemDatabase } = require("modules/ItemDatabase.js");
    const { itemRef } = require("modules/TooltipEngine.js");
    const { inject } = require("modules/StyleInjector.js");
    const { tierClass, statChips } = require("modules/itemDisplay.js");
    const { buildInventoryDetails, inventoryDetailSignature, resolveInventoryItemName } = require("modules/InventoryModel.js");
    const { guard, guardEach, raf } = require("modules/Runtime.js");
    const { createInlineStyleOwner } = require("modules/InlineStyleOwner.js");
    const css = require("styles/inventory.css").default;
    const RENDERED_ATTR = 'data-fs-inv';
    const HIDDEN_ATTR = 'data-fs-hidden';
    const ACTION_ATTR = 'data-fs-preserved-action';
    const ACTION_HOST_ATTR = 'data-fs-action-host';
    const SUPPRESSED_ATTR = 'data-fs-suppressed';
    const ACTION_KIND_ATTR = 'data-fs-action-kind';
    const INVENTORY_ROOT_ATTR = 'data-iw-inventory-root';
    const INVENTORY_CONTROL_ATTR = 'data-iw-inventory-control';
    const INVENTORY_TITLE_ATTR = 'data-iw-inventory-title';
    const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]';
    const pendingEmptyRetries = new WeakSet();
    const displayStyleOwner = createInlineStyleOwner();
    
    /** row -> exact cheap change signature, see renderRow(). */
    const cheapSignatures = new WeakMap();
    let listenerBound = false;
    
    function cheapSignature(row) {
      // Reading textContent is cheap compared with the two selector sweeps in
      // extractRowData(). Store the ACTUAL text rather than only its length: equal-
      // length changes such as x1 -> x2 are semantically real and must reconcile.
      return {
        childCount: row.childElementCount,
        text: row.textContent || '',
        dbRevision: ItemDatabase.revision(),
        atlasRevision: AtlasService.revision(),
      };
    }
    
    function sameCheapSignature(a, b) {
      return !!a && !!b &&
        a.childCount === b.childCount &&
        a.text === b.text &&
        a.dbRevision === b.dbRevision &&
        a.atlasRevision === b.atlasRevision;
    }
    
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    
    function isInsideNativeControl(el, row) {
      const control = el.closest?.(INTERACTIVE_SELECTOR);
      return !!(control && control !== row && row.contains(control));
    }
    
    function leafTexts(row) {
      return [...row.querySelectorAll('span, div, p')]
        .filter(el => !el.closest('.fs-inv-row'))
        .filter(el => !isInsideNativeControl(el, row))
        .filter(el => el.childElementCount === 0)
        .map(el => el.textContent.trim())
        .filter(Boolean);
    }
    
    function detailTexts(row, displayName = '') {
      const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d/i;
    
      // Capture both atomic leaf lines and compact wrappers used by the native
      // row when an icon is a separate child. Parent containers can concatenate
      // the whole item into one textContent string, so record the originating
      // elements and prune ancestry rather than deduplicating by text alone.
      const records = [];
      for (const el of row.querySelectorAll('span, div, p, li')) {
        if (el.closest('.fs-inv-row') || isInsideNativeControl(el, row)) continue;
        const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 220 || !interesting.test(text)) continue;
        records.push({ el, text, key: text.toLowerCase() });
      }
    
      // If an ancestor and descendant expose identical textContent, the ancestor
      // is only a wrapper. Drop it. Identical text in two separate sibling lines
      // is retained so two socketed gems can correctly become ×2.
      const deNested = records.filter((rec, idx) => !records.some((other, j) =>
        idx !== j && rec.key === other.key && rec.el.contains(other.el)
      ));
    
      const nameKey = String(displayName || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const ordered = deNested.sort((a, b) => a.text.length - b.text.length);
      const kept = [];
      for (const rec of ordered) {
        const { text, key } = rec;
    
        // A native wrapper that starts with the item name and also contains tier,
        // stats, requirements or action-state text is an aggregate of the row,
        // never one semantic owned-item detail.
        if (nameKey && key.startsWith(nameKey) && /(?:\btier\b|\b(?:atk|def|hp)\s*[+-]?\d|\bxp\b.*\/task|\brequires?\b|\bupgrad|\bloadout\b)/i.test(text)) {
          continue;
        }
    
        // Prefer atomic child lines over longer parent concatenations. Only a
        // strictly shorter string can suppress this record, so repeated sibling
        // gem lines survive and can be counted by InventoryModel.
        const containsAtomic = kept.some(shorter =>
          shorter.text.length < text.length && shorter.key.length >= 5 && key.includes(shorter.key)
        );
        if (containsAtomic) continue;
    
        kept.push(rec);
      }
      return kept.map(rec => rec.text);
    }
    
    function guessQuantity(texts) {
      for (const t of texts) {
        const m = t.match(/^[x×]\s*(\d[\d,]*)$/i);
        if (m) return m[1].replace(/,/g, '');
      }
      const nums = texts.filter(t => /^\d[\d,]*$/.test(t));
      return nums.length ? nums[nums.length - 1].replace(/,/g, '') : null;
    }
    
    function extractRowData(row) {
      const texts = leafTexts(row);
      const name = resolveInventoryItemName(texts, name => ItemDatabase.getByName(name));
      return { name, qty: guessQuantity(texts), detailTexts: detailTexts(row, name) };
    }
    
    function findInventoryRoot(row) {
      let cur = row;
      for (let depth = 0; cur && depth < 8; depth += 1, cur = cur.parentElement) {
        const aria = String(cur.getAttribute?.('aria-label') || '').trim().toLowerCase();
        if (aria === 'inventory') return cur;
    
        const headings = cur.querySelectorAll?.(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]') || [];
        for (const h of headings) {
          if (String(h.textContent || '').trim().toLowerCase() === 'inventory') return cur;
        }
      }
      return null;
    }
    
    function isInventoryContext(row) {
      const controls = [...row.querySelectorAll('button, [role="button"]')]
        .map(el => String(el.textContent || '').trim().toLowerCase())
        .filter(Boolean);
      if (controls.some(t => /^(equip|equipped|unequip|list)$/.test(t))) return true;
      return !!findInventoryRoot(row);
    }
    
    function classifyInventoryChrome(root) {
      if (!root) return;
      root.setAttribute(INVENTORY_ROOT_ATTR, '1');
      const titleCandidates = root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]');
      for (const title of titleCandidates) {
        if (String(title.textContent || '').trim().toLowerCase() === 'inventory') {
          title.setAttribute(INVENTORY_TITLE_ATTR, '1');
        }
      }
    
      const buttons = [...root.querySelectorAll('button, [role="button"]')];
      for (const button of buttons) {
        // Never classify controls inside individual item rows here; the ItemRow
        // action model owns those independently.
        if (button.closest('.compact-row, [class*="item-row"]')) continue;
        const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        let role = '';
        if (/^(all|gear|materials|consumables|drops)$/.test(text)) role = 'filter';
        else if (/^(prev|previous|next)$/.test(text)) role = 'page';
        else if (!text || text.length <= 2) role = 'icon';
        if (role) button.setAttribute(INVENTORY_CONTROL_ATTR, role);
      }
    
      for (const el of root.querySelectorAll('span, div, p')) {
        if (el.closest('.compact-row, [class*="item-row"]')) continue;
        const text = String(el.textContent || '').trim();
        if (/^\d+\s*\/\s*\d+$/.test(text)) el.setAttribute(INVENTORY_CONTROL_ATTR, 'page-count');
      }
    }
    
    function splitLevel(name) {
      const m = String(name || '').match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
      return m ? { base: m[1].trim(), level: m[2] } : { base: name, level: null };
    }
    
    function isInteractiveHost(el) {
      return !!(el.matches?.(INTERACTIVE_SELECTOR) || el.querySelector?.(INTERACTIVE_SELECTOR));
    }
    
    function restoreDisplay(el) {
      displayStyleOwner.restoreElement(el);
    }
    
    function suppressDisplayBranch(el) {
      el.setAttribute(SUPPRESSED_ATTR, '1');
      el.removeAttribute(ACTION_ATTR);
      el.removeAttribute(ACTION_HOST_ATTR);
      displayStyleOwner.set(el, 'display', 'none', '');
    }
    
    function classifyActionControl(el) {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/^equipped$|^unequip$/.test(text)) return 'equipped';
      if (/^equip$/.test(text)) return 'equip';
      if (/set bonus/.test(text)) return 'set';
      if (/^list$|^sell$|^use$|^deposit$|^withdraw$/.test(text)) return 'secondary';
      if (/^lock$|^unlock$/.test(text) || (!text && el.querySelector?.('svg'))) return 'icon';
      return 'secondary';
    }
    
    function preserveInteractiveTree(el) {
      if (!el) return;
    
      if (el.matches?.(INTERACTIVE_SELECTOR)) {
        el.setAttribute(ACTION_ATTR, 'control');
        el.setAttribute(ACTION_KIND_ATTR, classifyActionControl(el));
        el.removeAttribute(ACTION_HOST_ATTR);
        el.removeAttribute(SUPPRESSED_ATTR);
        restoreDisplay(el);
        return;
      }
    
      if (!isInteractiveHost(el)) {
        suppressDisplayBranch(el);
        return;
      }
    
      el.setAttribute(ACTION_ATTR, 'host');
      el.setAttribute(ACTION_HOST_ATTR, '1');
      el.removeAttribute(SUPPRESSED_ATTR);
      restoreDisplay(el);
      [...el.children].forEach(child => preserveInteractiveTree(child));
    }
    
    function hideOriginalChildren(row, overlay) {
      [...row.children].forEach(child => {
        if (child === overlay || child.classList?.contains('fs-inv-row')) return;
        if (isInteractiveHost(child)) preserveInteractiveTree(child);
        else suppressDisplayBranch(child);
      });
    }
    
    function restoreOriginalChildren(row) {
      displayStyleOwner.restoreWithin(row);
      row.querySelectorAll(`[${HIDDEN_ATTR}], [${ACTION_ATTR}], [${ACTION_HOST_ATTR}], [${SUPPRESSED_ATTR}]`).forEach(el => {
        el.removeAttribute(HIDDEN_ATTR);
        el.removeAttribute(ACTION_ATTR);
        el.removeAttribute(ACTION_HOST_ATTR);
        el.removeAttribute(SUPPRESSED_ATTR);
        el.removeAttribute(ACTION_KIND_ATTR);
      });
    }
    
    function clearRenderedRow(row) {
      row.querySelectorAll(':scope > .fs-inv-row').forEach(el => el.remove());
      restoreOriginalChildren(row);
      row.removeAttribute(RENDERED_ATTR);
    }
    
    function rowSignature(data, item, detailModel) {
      return [
        item ? String(item.item_id ?? item.name) : data.name,
        data.qty || '',
        inventoryDetailSignature(detailModel),
        ItemDatabase.revision(),
        AtlasService.revision(),
      ].join('|');
    }
    
    function scheduleEmptyRetry(row) {
      if (pendingEmptyRetries.has(row)) return;
      pendingEmptyRetries.add(row);
      raf(() => guard('inventory:empty-retry', () => {
        pendingEmptyRetries.delete(row);
        if (!row.isConnected) return;
        const retry = extractRowData(row);
        if (retry.name) renderRow(row);
        else if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
      }));
    }
    
    function configureIconTooltip(host, item, data) {
      if (!host) return;
      const name = item?.name || data.name;
      if (item?.item_id != null) host.setAttribute('data-iw-item', String(item.item_id));
      else host.setAttribute('data-iw-item-name', name);
      host.setAttribute('data-iw-tooltip-trigger', '1');
      // Do not expose the icon as role=button: the global IdleWorlds/Fantasy
      // button language applies background-image !important to role=button, which
      // masks AtlasService's sprite background. The delegated tooltip engine only
      // requires the data attributes, so a focusable neutral surface is enough.
      host.removeAttribute('role');
      host.setAttribute('tabindex', '0');
      host.setAttribute('aria-haspopup', 'true');
      host.setAttribute('aria-expanded', 'false');
      host.setAttribute('aria-label', `${name}, item details`);
    }
    
    function paintIcon(overlay, item, data) {
      const host = overlay.querySelector('.fs-inv-icon');
      if (!host) return;
      configureIconTooltip(host, item, data);
    
      const fullName = item ? item.name : data.name;
      const ref = item ? { id: item.item_id, name: fullName } : { name: fullName };
    
      const apply = () => {
        if (!overlay.isConnected || !host.isConnected) return;
        host.textContent = '';
        if (!AtlasService.paint(host, ref)) host.textContent = '❓';
      };
    
      if (AtlasService.isReady()) apply();
      AtlasService.ready().then(apply).catch(() => {
        if (host.isConnected && !host.style.backgroundImage) host.textContent = '❓';
      });
    }
    
    function detailHTML(detailModel) {
      const details = (detailModel?.details || []).map(detail => {
        const count = detail.count > 1 ? `<span class="fs-inv-detail-count">×${detail.count}</span>` : '';
        return `<span class="fs-inv-detail fs-inv-detail--${esc(detail.kind)}">${esc(detail.text)}${count}</span>`;
      }).join('');
      const requirements = (detailModel?.requirements || []).map(text =>
        `<span class="fs-inv-requirement">${esc(text)}</span>`
      ).join('');
    
      return {
        details: details ? `<div class="fs-inv-details">${details}</div>` : '',
        requirements: requirements ? `<div class="fs-inv-requirements">${requirements}</div>` : '',
      };
    }
    
    function syncRowState(row, overlay) {
      if (!overlay) return;
      const kinds = [...row.querySelectorAll(`[${ACTION_ATTR}="control"]`)]
        .map(el => el.getAttribute(ACTION_KIND_ATTR));
      overlay.classList.toggle('is-equipped', kinds.includes('equipped'));
      overlay.classList.toggle('has-set-action', kinds.includes('set'));
    }
    
    function renderRow(row) {
      if (!row || !row.isConnected) return;
    
      if (!isInventoryContext(row)) {
        if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
        return;
      }
    
      const existingOverlay = row.querySelector(':scope > .fs-inv-row');
    
      // Cheap pre-check before the expensive path.
      //
      // extractRowData() runs two querySelectorAll sweeps over the row. One exact
      // textContent read plus child/revision fields is still much cheaper, but unlike
      // the old text-LENGTH signature it cannot miss an equal-length semantic
      // change such as x1 -> x2 or one item name being replaced by another.
      const cheapSig = cheapSignature(row);
      if (existingOverlay && sameCheapSignature(cheapSignatures.get(row), cheapSig)) {
        hideOriginalChildren(row, existingOverlay);
        syncRowState(row, existingOverlay);
        return;
      }
    
      const root = findInventoryRoot(row);
      classifyInventoryChrome(root);
    
      const data = extractRowData(row);
      if (!data.name) {
        scheduleEmptyRetry(row);
        return;
      }
    
      const item = ItemDatabase.getByName(data.name);
      const detailModel = buildInventoryDetails(data.detailTexts, item, data.name);
      const signature = rowSignature(data, item, detailModel);
      const existing = row.querySelector(':scope > .fs-inv-row');
    
      if (existing && row.getAttribute(RENDERED_ATTR) === signature) {
        hideOriginalChildren(row, existing);
        syncRowState(row, existing);
        cheapSignatures.set(row, cheapSig);
        return;
      }
    
      if (existing) existing.remove();
      restoreOriginalChildren(row);
    
      const tier = item ? tierClass(item) : 'tier-common';
      const { base, level } = splitLevel(item ? item.name : data.name);
      const nameHTML = item
        ? itemRef(item, base)
        : `<span class="fs-inv-name-plain">${esc(base)}</span>`;
      const levelHTML = level ? ` <span class="fs-inv-sub">Lv ${esc(level)}</span>` : '';
    
      const chips = item ? statChips(item, { max: 8 }) : [];
      const chipsHTML = chips.map(c => {
        const mod = c.kind === 'pos' ? ' fs-stat--pos' : c.kind === 'tier' ? ' fs-stat--tier' : '';
        return `<span class="fs-stat${mod}">${esc(c.text)}</span>`;
      }).join('');
    
      const dynamic = detailHTML(detailModel);
      const overlay = document.createElement('div');
      overlay.className = `fs-inv-row ${tier}${dynamic.details ? ' has-details' : ''}${dynamic.requirements ? ' has-requirements' : ''}`;
      overlay.innerHTML = `
        <div class="fs-inv-icon"></div>
        <div class="fs-inv-body">
          <div class="fs-inv-name ${tier}">${nameHTML}${levelHTML}</div>
          ${chipsHTML ? `<div class="fs-inv-stats">${chipsHTML}</div>` : ''}
          ${dynamic.details}
          ${dynamic.requirements}
        </div>
        ${data.qty ? `<span class="fs-inv-qty">×${esc(data.qty)}</span>` : ''}
      `;
    
      row.appendChild(overlay);
      hideOriginalChildren(row, overlay);
      syncRowState(row, overlay);
      row.setAttribute(RENDERED_ATTR, signature);
      cheapSignatures.set(row, cheapSig);
      paintIcon(overlay, item, data);
    }
    
    function reconcileAll() {
      guardEach('inventory:reconcile-all',
        document.querySelectorAll('.compact-row, [class*="item-row"]'),
        renderRow);
    }
    
    /** Remove every skin-owned overlay and restore the native rows. Kill switch. */
    function clearInventoryRenderer() {
      guardEach('inventory:teardown',
        document.querySelectorAll('.compact-row, [class*="item-row"]'),
        row => {
          if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
          cheapSignatures.delete(row);
        });
      document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach(el => {
        el.removeAttribute(INVENTORY_ROOT_ATTR);
      });
      document.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}]`).forEach(el => {
        el.removeAttribute(INVENTORY_CONTROL_ATTR);
        el.removeAttribute(INVENTORY_TITLE_ATTR);
      });
      displayStyleOwner.restoreAll();
    }
    
    function initInventoryRenderer() {
      inject('inventory', css);
      if (listenerBound) return;
      listenerBound = true;
      on('iw:inventory-row', e => guard('inventory:row', () => renderRow(e.detail.row)));
      document.addEventListener('iw:item-db-updated', reconcileAll);
      document.addEventListener('iw:atlas-updated', reconcileAll);
    }
    
    
    exports.clearInventoryRenderer = clearInventoryRenderer;
    exports.initInventoryRenderer = initInventoryRenderer;
  };
  __modules["modules/ItemDatabase.js"] = (module, exports, require) => {
    /**
     * ItemDatabase
     *
     * Fetches the game's live items.json and keeps a resilient local cache.
     * A fresh cache is returned immediately and refreshed in the background.
     * A stale cache may be used as a network-failure fallback so the skin does
     * not lose all metadata/tooltips just because one request failed.
     */
    const { normaliseItemName } = require("modules/normaliseItemName.js");
    const { storageGet, storageSet, warnOnce } = require("modules/Runtime.js");
    const API_URL = 'https://idleworlds.com/items.json';
    const CACHE_KEY = 'iw-item-db-cache';
    const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
    const REFRESH_RETRY_MS = 15 * 60 * 1000;
    
    // The cache used to live in localStorage. A content script shares the PAGE's
    // localStorage, so the full items.json table was being written into
    // idleworlds.com's own origin storage, against the 5 MB quota we share with
    // the game. Our write could fail — worse, it could push the GAME's writes over
    // quota, which is a functionality change the project charter forbids.
    //
    // chrome.storage.local is extension-private, has a larger budget, and is shared
    // across tabs so N open tabs cost one fetch instead of N. (Audit S1.3)
    const LEGACY_LOCALSTORAGE_KEY = 'iw-item-db-cache';
    let legacyEvicted = false;
    
    /**
     * Remove the old cache from the game's localStorage. Runs once per session,
     * best-effort: reclaiming the user's quota matters more than knowing it worked.
     */
    function evictLegacyCache() {
      if (legacyEvicted) return;
      legacyEvicted = true;
      try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)) {
          localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
          console.log('[ItemDatabase] Evicted legacy cache from page localStorage');
        }
      } catch (err) {
        warnOnce('itemdb:legacy-evict', err);
      }
    }
    
    class _ItemDatabase {
      constructor() {
        this._items = null;
        this._byId = null;
        this._byName = null;
        this._generatedAt = null;
        this._source = null;
        this._promise = null;
        this._revision = 0;
        this._autoRefresh = false;
        this._refreshTimer = null;
        this._refreshPromise = null;
      }
    
      ready() {
        if (!this._promise) {
          this._promise = this._load().then(() => {
            if (this._autoRefresh) this._scheduleRefresh(CACHE_MAX_AGE_MS);
          }).catch(err => {
            // Do not permanently poison the singleton after a transient failure.
            this._promise = null;
            throw err;
          });
        }
        return this._promise;
      }
      startAutoRefresh() {
        this._autoRefresh = true;
        if (this.isReady()) this._scheduleRefresh(CACHE_MAX_AGE_MS);
      }
      stopAutoRefresh() {
        this._autoRefresh = false;
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        this._refreshTimer = null;
      }
      isReady() {
        return Array.isArray(this._items) && !!this._byName;
      }
    
      revision() {
        return this._revision;
      }
    
      generatedAt() {
        return this._generatedAt;
      }
    
      source() {
        return this._source;
      }
      _scheduleRefresh(delayMs) {
        if (!this._autoRefresh) return;
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
          this._refreshTimer = null;
          this._refreshOnce()
            .then(() => this._scheduleRefresh(CACHE_MAX_AGE_MS))
            .catch(err => {
              console.warn('[ItemDatabase] Scheduled refresh failed:', err.message);
              this._scheduleRefresh(REFRESH_RETRY_MS);
            });
        }, delayMs);
        this._refreshTimer?.unref?.();
      }
    
      _refreshOnce() {
        if (!this._refreshPromise) {
          this._refreshPromise = this._fetchFresh().finally(() => { this._refreshPromise = null; });
        }
        return this._refreshPromise;
      }
      async _load() {
        evictLegacyCache();
        const cached = await this._readCache({ allowStale: true });
    
        if (cached && !cached.stale) {
          this._index(cached.items, cached.generatedAt, 'cache');
          // A refresh failure does not invalidate a known-good fresh cache.
          this._refreshOnce().catch(err => {
            console.warn('[ItemDatabase] Background refresh failed:', err.message);
          });
          return;
        }
    
        if (cached && cached.stale) {
          // Index stale data immediately so renderers have a coherent fallback,
          // then attempt to replace it with the live table before ready resolves.
          this._index(cached.items, cached.generatedAt, 'stale-cache');
          try {
            await this._refreshOnce();
          } catch (err) {
            console.warn('[ItemDatabase] Using stale cache after refresh failure:', err.message);
          }
          return;
        }
    
        await this._refreshOnce();
      }
    
      async _fetchFresh() {
        const res = await fetch(API_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`items.json fetch failed: ${res.status}`);
        const data = await res.json();
    
        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
          throw new Error('items.json returned no item records');
        }
    
        // If a cache was already indexed and the server table has the same
        // generation stamp, refresh the cache timestamp without forcing every
        // renderer and scanner to rebuild needlessly.
        if (this.isReady() && data.generatedAt && data.generatedAt === this._generatedAt) {
          this._source = 'network';
          this._writeCache(data.items, data.generatedAt);
          return;
        }
    
        this._index(data.items, data.generatedAt, 'network');
        this._writeCache(data.items, data.generatedAt);
        console.log(`[ItemDatabase] Loaded ${data.items.length} items (generated ${data.generatedAt})`);
      }
    
      _index(items, generatedAt, source) {
        if (!Array.isArray(items) || items.length === 0) return;
    
        this._items = items;
        this._generatedAt = generatedAt || null;
        this._source = source || null;
        this._byId = new Map();
        this._byName = new Map();
    
        for (const item of items) {
          if (item.item_id !== undefined && item.item_id !== null && item.item_id !== '') {
            this._byId.set(String(item.item_id), item);
          }
          const key = normaliseItemName(item.name);
          if (key && !this._byName.has(key)) this._byName.set(key, item);
        }
    
        this._revision += 1;
        document.dispatchEvent(new CustomEvent('iw:item-db-updated', {
          detail: {
            revision: this._revision,
            generatedAt: this._generatedAt,
            source,
            count: items.length,
          },
          bubbles: false,
        }));
      }
    
      async _readCache({ allowStale = false } = {}) {
        try {
          const parsed = await storageGet(CACHE_KEY);
          if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
          const age = Date.now() - Number(parsed.cachedAt || 0);
          const stale = !Number.isFinite(age) || age > CACHE_MAX_AGE_MS;
          if (stale && !allowStale) return null;
          return { ...parsed, stale };
        } catch (e) {
          return null;
        }
      }
    
      _writeCache(items, generatedAt) {
        // Deliberately not awaited: a slow or failed cache write must never delay
        // the renderers, which already have the freshly indexed table in memory.
        storageSet(CACHE_KEY, { items, generatedAt, cachedAt: Date.now() })
          .then(ok => { if (!ok) warnOnce('itemdb:cache-write', new Error('cache write rejected')); });
      }
    
      getById(id) {
        if (!this._byId || id === undefined || id === null) return null;
        return this._byId.get(String(id)) || null;
      }
    
      getByName(name) {
        if (!this._byName) return null;
        return this._byName.get(normaliseItemName(name)) || null;
      }
    
      find({ id, name } = {}) {
        if (id !== undefined && id !== null && id !== '') {
          const hit = this.getById(id);
          if (hit) return hit;
        }
        return name ? this.getByName(name) : null;
      }
    
      all() {
        return this._items || [];
      }
    }
    
    const ItemDatabase = new _ItemDatabase();
    
    
    exports.ItemDatabase = ItemDatabase;
  };
  __modules["modules/NameScanner.js"] = (module, exports, require) => {
    /**
     * NameScanner — non-destructive rewrite (Audit S1.4)
     *
     * WHAT CHANGED AND WHY
     * ────────────────────
     * The previous implementation found item names in the game's prose and did:
     *
     *     textNode.parentNode.replaceChild(span, textNode);
     *
     * React keeps a direct reference to every text node it created (fiber
     * `stateNode`). Two things follow from swapping one out:
     *
     *   1. On unmount React calls `parentInstance.removeChild(textNode)` for a node
     *      that is no longer a child of that parent — `NotFoundError`, and the
     *      surrounding React subtree can come down with it.
     *   2. On update React assigns `textInstance.nodeValue = next` to the detached
     *      node. That succeeds silently and the visible text never changes, which
     *      is the quieter and arguably worse failure.
     *
     * Either is a functionality change, which the project charter forbids. There is
     * no "careful" way to mutate React-owned text.
     *
     * So this module no longer touches the DOM at all. Instead it:
     *
     *   • records matches as live `Range` objects over the game's own text nodes,
     *   • paints them via the CSS Custom Highlight API (`::highlight(iw-item-name)`)
     *     — a pure paint-time effect with no DOM node behind it,
     *   • hit-tests the pointer against those ranges and drives the tooltip through
     *     TooltipEngine's virtual-anchor API.
     *
     * The game's DOM is now strictly read-only to this module.
     *
     * Graceful degradation: where `CSS.highlights` is unavailable the highlight is
     * skipped and tooltips still work, because hover is driven by range geometry
     * rather than by the highlight itself.
     */
    const { ItemDatabase } = require("modules/ItemDatabase.js");
    const { showForItem, hideTooltip, isTooltipOpen } = require("modules/TooltipEngine.js");
    const { guard, raf, warnOnce } = require("modules/Runtime.js");
    const HIGHLIGHT_NAME = 'iw-item-name';
    const MIN_NAME_LENGTH = 3;
    
    const SKIP_TAGS = new Set([
      'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA',
      'SELECT', 'OPTION', 'IW-TIP', 'CANVAS', 'SVG',
    ]);
    
    /**
     * Containers whose text we never annotate.
     *
     * `.iw-item-ref` — already an explicit trigger.
     * `.fs-inv-row` / `.fs-skill-header` / `.iw-tip` — skin-owned surfaces.
     * `[role="tooltip"]` — native tooltip surfaces should never recursively spawn
     * our own card while the game is measuring/positioning theirs.
     */
    const SKIP_CONTAINERS = '.iw-item-ref, .fs-inv-row, .fs-skill-header, .iw-tip, [role="tooltip"], input, textarea, select';
    
    /* ── Trie ────────────────────────────────────────────────────────────── */
    
    let _trie = null;
    let _trieRevision = -1;
    
    function buildTrie() {
      const items = ItemDatabase.all();
      if (!items.length) return null;
      const revision = ItemDatabase.revision();
      if (_trie && _trieRevision === revision) return _trie;
    
      const root = { children: new Map(), item: null };
      for (const item of items) {
        const name = item.name;
        if (!name || name.length < MIN_NAME_LENGTH) continue;
        insert(root, name.toLowerCase(), item);
      }
    
      _trie = root;
      _trieRevision = revision;
      return root;
    }
    
    function insert(root, lowerName, item) {
      let node = root;
      for (const ch of lowerName) {
        if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), item: null });
        node = node.children.get(ch);
      }
      node.item = item;
    }
    
    function longestMatchAt(root, lowerText, start) {
      let node = root;
      let best = null;
      let i = start;
    
      while (i < lowerText.length) {
        const next = node.children.get(lowerText[i]);
        if (!next) break;
        node = next;
        i += 1;
        if (node.item) {
          const after = lowerText[i];
          if (after === undefined || !/[a-z0-9]/i.test(after)) {
            best = { length: i - start, item: node.item };
          }
        }
      }
      return best;
    }
    
    /* ── Match index ─────────────────────────────────────────────────────── */
    
    /**
     * Text node → [{ start, end, item }]. A plain Map (not Weak) because we need to
     * enumerate it to rebuild the highlight; entries for disconnected nodes are
     * pruned on every rebuild, so it cannot grow without bound.
     */
    const matchIndex = new Map();
    
    function shouldSkipParent(el) {
      if (!el) return true;
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.closest?.(SKIP_CONTAINERS)) return true;
      return false;
    }
    
    function findMatches(text, trie) {
      const lower = text.toLowerCase();
      const out = [];
      let i = 0;
    
      while (i < lower.length) {
        const prev = lower[i - 1];
        if (i === 0 || !/[a-z0-9]/i.test(prev)) {
          const hit = longestMatchAt(trie, lower, i);
          if (hit && hit.length >= MIN_NAME_LENGTH) {
            out.push({ start: i, end: i + hit.length, item: hit.item });
            i += hit.length;
            continue;
          }
        }
        i += 1;
      }
      return out;
    }
    
    /* ── Highlight painting ──────────────────────────────────────────────── */
    
    const supportsHighlight = typeof CSS !== 'undefined'
      && typeof CSS.highlights !== 'undefined'
      && typeof Highlight !== 'undefined';
    
    let rebuildQueued = false;
    
    function queueHighlightRebuild() {
      if (rebuildQueued) return;
      rebuildQueued = true;
      raf(() => {
        rebuildQueued = false;
        guard('name-scan:highlight', rebuildHighlight);
      });
    }
    
    function rebuildHighlight() {
      const ranges = [];
    
      for (const [node, matches] of [...matchIndex.entries()]) {
        if (!node.isConnected) {
          matchIndex.delete(node);
          continue;
        }
        const len = node.nodeValue ? node.nodeValue.length : 0;
        for (const m of matches) {
          // Text may have changed between scan and paint; a stale offset would
          // throw on setStart/setEnd.
          if (m.end > len) continue;
          const range = document.createRange();
          try {
            range.setStart(node, m.start);
            range.setEnd(node, m.end);
            ranges.push(range);
          } catch (err) {
            /* stale offset — drop this one silently */
          }
        }
      }
    
      if (!supportsHighlight) return;
      try {
        if (!ranges.length) CSS.highlights.delete(HIGHLIGHT_NAME);
        else CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
      } catch (err) {
        warnOnce('name-scan:highlight-set', err);
      }
    }
    
    /* ── Pointer hit testing ─────────────────────────────────────────────── */
    
    let hoverBound = false;
    let activeItem = null;
    let pointerQueued = false;
    let lastX = 0;
    let lastY = 0;
    
    function rectContains(rect, x, y) {
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    
    /**
     * Resolve the matched text range under the pointer. Prefer the browser caret
     * API for an exact text node; a small local ancestor fallback covers engines
     * that do not expose caretPositionFromPoint without walking the page-wide index.
     */
    function pointTextNode(x, y) {
      try {
        const pos = document.caretPositionFromPoint?.(x, y);
        if (pos?.offsetNode?.nodeType === 3) return pos.offsetNode;
      } catch { /* use WebKit/legacy fallback */ }
      try {
        const range = document.caretRangeFromPoint?.(x, y);
        if (range?.startContainer?.nodeType === 3) return range.startContainer;
      } catch { /* fall through */ }
      return null;
    }
    
    function hitInTextNode(node, x, y) {
      const matches = matchIndex.get(node);
      if (!matches?.length) return null;
      const len = node.nodeValue ? node.nodeValue.length : 0;
      for (const m of matches) {
        if (m.end > len) continue;
        const range = document.createRange();
        try {
          range.setStart(node, m.start);
          range.setEnd(node, m.end);
        } catch { continue; }
        for (const rect of range.getClientRects()) {
          if (rectContains(rect, x, y)) return { item: m.item, rect };
        }
      }
      return null;
    }
    
    function hitTest(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el || shouldSkipParent(el)) return null;
    
      const precise = pointTextNode(x, y);
      if (precise && !shouldSkipParent(precise.parentElement)) {
        const hit = hitInTextNode(precise, x, y);
        if (hit) return hit;
      }
    
      // Fallback for browsers/edge cases where caret hit-testing is unavailable.
      // Check the hit element's subtree plus direct text owned by a few ancestors;
      // range geometry still decides which actual word is under the pointer.
      const seen = new Set();
      const candidates = [];
      const add = node => {
        if (node?.nodeType === 3 && !seen.has(node) && matchIndex.has(node)) {
          seen.add(node); candidates.push(node);
        }
      };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) add(node);
      let cur = el;
      for (let depth = 0; cur && depth < 5; depth += 1, cur = cur.parentElement) {
        for (const child of cur.childNodes) add(child);
      }
      for (const candidate of candidates) {
        const hit = hitInTextNode(candidate, x, y);
        if (hit) return hit;
      }
      return null;
    }
    
    function pointerInsideTooltip(x, y) {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest?.('.iw-tip');
    }
    
    function isTouchLike() {
      return matchMedia('(hover: none), (pointer: coarse)').matches;
    }
    
    function handlePointer() {
      pointerQueued = false;
      const hit = hitTest(lastX, lastY);
    
      if (!hit) {
        // Moving from a virtual item name onto the interactive tooltip itself is
        // still active ownership. Do not let NameScanner race TooltipEngine and
        // close the card before the user can reach Wiki/future footer controls.
        if (activeItem && isTooltipOpen() && pointerInsideTooltip(lastX, lastY)) return;
        if (activeItem) {
          activeItem = null;
          hideTooltip('name-scan');
        }
        return;
      }
    
      if (activeItem === hit.item && isTooltipOpen()) return;
      activeItem = hit.item;
      // The rect is captured per hit so the card tracks the exact matched word,
      // not the whole paragraph.
      showForItem(hit.item, () => {
        const fresh = hitTest(lastX, lastY);
        return fresh ? fresh.rect : hit.rect;
      }, 'name-scan');
    }
    
    function bindHover() {
      if (hoverBound) return;
      hoverBound = true;
    
      document.addEventListener('mousemove', e => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (pointerQueued) return;
        pointerQueued = true;
        raf(() => guard('name-scan:pointer', handlePointer));
      }, { passive: true, capture: true });
    
      // Native React text has no element trigger, so delegated TooltipEngine click
      // handling cannot discover it on touch devices. Hit-test the tapped word and
      // open the same virtual-anchor card without cancelling the game's click.
      document.addEventListener('click', e => {
        if (!isTouchLike()) return;
        const hit = hitTest(e.clientX, e.clientY);
        if (!hit) return;
        activeItem = hit.item;
        showForItem(hit.item, () => {
          const fresh = hitTest(e.clientX, e.clientY);
          return fresh ? fresh.rect : hit.rect;
        }, 'name-scan');
      });
    
      // Any scroll invalidates the cached rect geometry.
      window.addEventListener('scroll', () => {
        if (activeItem) {
          activeItem = null;
          hideTooltip('name-scan');
        }
      }, { passive: true, capture: true });
    }
    
    /* ── Public API ──────────────────────────────────────────────────────── */
    
    /**
     * Index item names inside `root`. Read-only: no node is created, moved or
     * removed. Returns the number of matched text nodes.
     */
    function scanForItemNames(root) {
      if (!root || !root.isConnected) return 0;
      const trie = buildTrie();
      if (!trie) return 0;
    
      bindHover();
    
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (shouldSkipParent(node.parentElement)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    
      let matchedNodes = 0;
      let node;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue;
        if (!text || text.trim().length < MIN_NAME_LENGTH) {
          if (matchIndex.has(node)) matchIndex.delete(node);
          continue;
        }
    
        const matches = findMatches(text, trie);
        if (matches.length) {
          matchIndex.set(node, matches);
          matchedNodes += 1;
        } else if (matchIndex.has(node)) {
          matchIndex.delete(node);
        }
      }
    
      queueHighlightRebuild();
      return matchedNodes;
    }
    
    /** Drop every recorded match and clear the paint. Used by the kill switch. */
    function clearItemNameScan() {
      matchIndex.clear();
      activeItem = null;
      if (supportsHighlight) {
        try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (err) { /* no-op */ }
      }
    }
    
    /** Kept for compatibility with older callers. Scans are inherently repeatable. */
    function resetScanMark() {}
    
    
    exports.scanForItemNames = scanForItemNames;
    exports.clearItemNameScan = clearItemNameScan;
    exports.resetScanMark = resetScanMark;
  };
  __modules["modules/Runtime.js"] = (module, exports, require) => {
    /**
     * Runtime
     *
     * Thin, dependency-free wrappers around the extension runtime. Everything that
     * touches `chrome.*` goes through here so that:
     *
     *   • Asset URLs resolve to bundled, CSP-proof `chrome-extension://` paths
     *     rather than remote origins. (Audit S1.1 / S1.2)
     *   • Persistent state lives in extension-private storage instead of the
     *     GAME's localStorage, which we share with the page and must not fill.
     *     (Audit S1.3)
     *   • A thrown consumer can never take down the rest of a flush. (Audit S3.7)
     *   • Reconciliation work is ignored while the skin is disabled, without
     *     preventing queued callbacks from running their own bookkeeping cleanup.
     *
     * The module degrades gracefully when `chrome` is unavailable (unit tests,
     * a plain <script> harness) so the presentation layer stays testable.
     */
    
    const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    
    /* ── Activation lifecycle ───────────────────────────────────────────── */
    
    // Default to active for isolated module/unit tests. content.js explicitly sets
    // the real page state before boot/after teardown.
    let runtimeActive = true;
    
    function setRuntimeActive(active) {
      runtimeActive = active !== false;
    }
    
    function isRuntimeActive() {
      return runtimeActive;
    }
    
    /* ── Assets ──────────────────────────────────────────────────────────── */
    
    /**
     * Resolve a path inside the extension bundle.
     * @param {string} path e.g. 'assets/gear_icons_atlas.png'
     */
    function assetUrl(path) {
      const clean = String(path || '').replace(/^\/+/, '');
      if (hasChrome && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(clean);
      }
      // Test/dev fallback only. Never reached inside the packed extension.
      return clean;
    }
    
    /* ── Storage ─────────────────────────────────────────────────────────── */
    
    const LOCAL_FALLBACK = new Map();
    
    /**
     * Read one key from extension-private storage.
     * @returns {Promise<any|null>}
     */
    const storageGet = async function storageGet(key) {
      if (hasChrome && chrome.storage?.local) {
        try {
          const bag = await chrome.storage.local.get(key);
          return bag?.[key] ?? null;
        } catch (err) {
          warnOnce(`storageGet:${key}`, err);
          return null;
        }
      }
      return LOCAL_FALLBACK.has(key) ? LOCAL_FALLBACK.get(key) : null;
    };
    
    /**
     * Write one key to extension-private storage.
     * @returns {Promise<boolean>} false when the write failed (quota, no runtime)
     */
    const storageSet = async function storageSet(key, value) {
      if (hasChrome && chrome.storage?.local) {
        try {
          await chrome.storage.local.set({ [key]: value });
          return true;
        } catch (err) {
          warnOnce(`storageSet:${key}`, err);
          return false;
        }
      }
      LOCAL_FALLBACK.set(key, value);
      return true;
    };
    
    const storageRemove = async function storageRemove(key) {
      if (hasChrome && chrome.storage?.local) {
        try {
          await chrome.storage.local.remove(key);
          return true;
        } catch (err) {
          warnOnce(`storageRemove:${key}`, err);
          return false;
        }
      }
      LOCAL_FALLBACK.delete(key);
      return true;
    };
    
    /**
     * Subscribe to changes for a single key in extension-private storage.
     * Returns an unsubscribe function.
     */
    function onStorageChanged(key, handler) {
      if (!hasChrome || !chrome.storage?.onChanged) return () => {};
      const listener = (changes, area) => {
        if (area !== 'local' || !(key in changes)) return;
        // This path MUST work while runtimeActive is false: it is how the disabled
        // skin receives the command to turn itself back on.
        try {
          handler(changes[key].newValue);
        } catch (err) {
          warnOnce('storage-change', err);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    
    /* ── Error isolation ─────────────────────────────────────────────────── */
    
    const _warned = new Set();
    
    /**
     * Log a message at most once per distinct key, so a per-frame failure cannot
     * flood the console of a game that mutates continuously.
     */
    function warnOnce(key, err) {
      if (_warned.has(key)) return;
      _warned.add(key);
      const detail = err && err.message ? err.message : err;
      console.warn(`[IW Fantasy Skin] ${key}:`, detail);
    }
    
    /**
     * Run `fn`, swallowing and reporting any exception. Reconciliation callbacks
     * that arrive after teardown are deliberately ignored.
     *
     * @returns {boolean} true when fn completed without throwing
     */
    function guard(label, fn) {
      if (!runtimeActive) return false;
      try {
        fn();
        return true;
      } catch (err) {
        warnOnce(`guard:${label}`, err);
        return false;
      }
    }
    
    /**
     * Map `fn` across `items` with per-item isolation.
     * @returns {number} count of items processed without throwing
     */
    function guardEach(label, items, fn) {
      if (!runtimeActive) return 0;
      let ok = 0;
      for (const item of items || []) {
        if (guard(label, () => fn(item))) ok += 1;
      }
      return ok;
    }
    
    /* ── Scheduling ──────────────────────────────────────────────────────── */
    
    // Do NOT discard callbacks at the scheduler level. Modules use their RAF body
    // to clear flags such as `queued`, `flushQueued` and `pointerQueued`; skipping
    // the callback can strand those flags permanently. Runtime guards inside the
    // callback suppress the actual reconciliation while disabled.
    const raf = typeof window !== 'undefined' && window.requestAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : (fn => setTimeout(fn, 16));
    
    
    exports.setRuntimeActive = setRuntimeActive;
    exports.isRuntimeActive = isRuntimeActive;
    exports.assetUrl = assetUrl;
    exports.onStorageChanged = onStorageChanged;
    exports.warnOnce = warnOnce;
    exports.guard = guard;
    exports.guardEach = guardEach;
    exports.storageGet = storageGet;
    exports.storageSet = storageSet;
    exports.storageRemove = storageRemove;
    exports.raf = raf;
  };
  __modules["modules/SkillPanelRenderer.js"] = (module, exports, require) => {
    /**
     * SkillPanelRenderer
     *
     * Reconciles skill panels and attaches semantic role attributes for the shared
     * v1.5.0 action-panel layout. React owns the DOM; we never reparent gameplay
     * nodes or create another observer.
     */
    const { on } = require("modules/DOMWatcher.js");
    const { inject } = require("modules/StyleInjector.js");
    const { guard, guardEach } = require("modules/Runtime.js");
    const { createInlineStyleOwner } = require("modules/InlineStyleOwner.js");
    const css = require("styles/skillpanel.css").default;
    const RENDERED_ATTR = 'data-fs-skill';
    const ROLE_ATTR = 'data-iw-skill-role';
    const ZONE_ATTR = 'data-iw-skill-zone';
    const buttonStyleSnapshots = new WeakMap();
    const readoutStyleSnapshots = new WeakMap();
    const ingredientStyleSnapshots = new WeakMap();
    
    // Keep independent ownership domains. A live XP datum can itself be a button;
    // restoring stale ACTION chrome on that node must not also restore/remove the
    // flat readout treatment it still legitimately owns.
    const buttonStyleOwner = createInlineStyleOwner();
    const readoutStyleOwner = createInlineStyleOwner();
    const ingredientStyleOwner = createInlineStyleOwner();
    let listenerBound = false;
    
    const SKILL_META = {
      combat:    { label: 'Combat',    glyph: 'âš”ï¸Ž', actions: ['fight'] },
      mining:    { label: 'Mining',    glyph: 'â›ï¸Ž', actions: ['mine'] },
      smithing:  { label: 'Smithing',  glyph: 'âš’ï¸Ž', actions: ['smelt', 'forge'] },
      gathering: { label: 'Gathering', glyph: 'â§',  actions: ['gather', 'harvest'] },
      alchemy:   { label: 'Alchemy',   glyph: 'âš—ï¸Ž', actions: ['brew'] },
      jewelcrafting: { label: 'Jewelcrafting', labels: ['Jewel', 'Jewelcrafting'], glyph: 'â—†', actions: ['prospect'] },
      spellcrafting: { label: 'Spellcrafting', labels: ['Spellcraft', 'Spellcrafting'], glyph: 'âœ§', actions: ['enchant', 'gather', 'harvest'], titleActions: ['enchant', 'harvest'], details: [/from the ether$/i] },
      tailoring: { label: 'Tailoring', labels: ['Tailor', 'Tailoring'], glyph: 'â‹ˆ', actions: ['tailor', 'sew', 'weave'], details: [/^missing materials\b/i] },
      crafting:  { label: 'Crafting',  glyph: 'âœ¦', actions: ['craft'] },
      fishing:   { label: 'Fishing',   glyph: 'âŒ', actions: ['fish'] },
    };
    
    function setOwnedStyle(owner, el, prop, value, priority = 'important') {
      return owner.set(el, prop, value, priority);
    }
    
    function normText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
    
    function classifyButton(btn) {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return 'disabled';
      const text = normText(btn.textContent);
      if (text.length <= 2) return 'icon';
      const cls = String(btn.className || '');
      if (/bg-ember|bg-orange|bg-primary|bg-accent/i.test(cls)) return 'primary';
      return 'secondary';
    }
    
    const BUTTON_STYLES = {
      base: {
        'font-family': "'Barlow', system-ui, sans-serif",
        'font-size': '12px',
        'font-weight': '700',
        'letter-spacing': '0.06em',
        'text-transform': 'uppercase',
        'border-radius': '2px',
        'transition': 'background .13s, border-color .13s, color .13s',
        'align-self': 'center',
        'height': '32px',
        'min-height': '32px',
        'flex-shrink': '0',
      },
      primary: {
        'background': 'linear-gradient(180deg, #A94318, #742A0D)',
        'border': '1px solid #C05A28',
        'color': '#FFEAD1',
        'padding': '0 17px',
        'min-width': '96px',
        'cursor': 'pointer',
        'box-shadow': 'none',
      },
      secondary: {
        'background': 'linear-gradient(180deg, #242018, #17140F)',
        'border': '1px solid #58482B',
        'color': '#DAD3C3',
        'padding': '0 13px',
        'min-width': '72px',
        'cursor': 'pointer',
        'box-shadow': 'none',
      },
      disabled: {
        'background': '#15130F',
        'border': '1px solid #3A3022',
        'color': '#8E8676',
        'padding': '0 15px',
        'min-width': '96px',
        'cursor': 'not-allowed',
        'box-shadow': 'none',
      },
      icon: {
        'background': 'linear-gradient(180deg, #242018, #17140F)',
        'border': '1px solid #58482B',
        'color': '#DAD3C3',
        'padding': '0',
        'width': '30px',
        'min-width': '30px',
        'cursor': 'pointer',
        'box-shadow': 'none',
      },
    };
    
    function styleButton(btn) {
      const role = btn.getAttribute(ROLE_ATTR) || '';
      // Live IdleWorlds renders the level/XP datum as a real <button>. It is data,
      // not a command. If React repurposed a button we styled in an earlier flush,
      // restore only our old ACTION properties; readout ownership is independent.
      if (role === 'level-progress') {
        buttonStyleOwner.restoreElement(btn);
        delete btn.dataset.iwBtnState;
        buttonStyleSnapshots.delete(btn);
        return;
      }
      const state = classifyButton(btn);
      const currentStyle = btn.getAttribute('style') || '';
      const previous = buttonStyleSnapshots.get(btn);
      if (previous && previous.state === state && previous.role === role && previous.style === currentStyle) return;
    
      for (const [prop, value] of Object.entries(BUTTON_STYLES.base)) {
        setOwnedStyle(buttonStyleOwner, btn, prop, value);
      }
      for (const [prop, value] of Object.entries(BUTTON_STYLES[state])) {
        setOwnedStyle(buttonStyleOwner, btn, prop, value);
      }
    
      // Role geometry is applied inline because IdleWorlds frequently writes its
      // own inline button dimensions during React updates.
      if (role === 'nav-button') {
        setOwnedStyle(buttonStyleOwner, btn, 'width', '30px');
        setOwnedStyle(buttonStyleOwner, btn, 'min-width', '30px');
        setOwnedStyle(buttonStyleOwner, btn, 'height', '30px');
        setOwnedStyle(buttonStyleOwner, btn, 'min-height', '30px');
        setOwnedStyle(buttonStyleOwner, btn, 'padding', '0');
      } else if (role === 'action-button') {
        setOwnedStyle(buttonStyleOwner, btn, 'width', '96px');
        setOwnedStyle(buttonStyleOwner, btn, 'min-width', '96px');
        setOwnedStyle(buttonStyleOwner, btn, 'height', '34px');
        setOwnedStyle(buttonStyleOwner, btn, 'min-height', '34px');
        setOwnedStyle(buttonStyleOwner, btn, 'padding', '0 14px');
      }
    
      if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
      buttonStyleSnapshots.set(btn, { state, role, style: btn.getAttribute('style') || '' });
    }
    
    const LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-â€“]\s*\d+(?:\.\d+)?%\s*[â€¢Â·]\s*[\d,]+\s+(?:xp\s+)?to\s+go$/i;
    const READOUT_STYLES = {
      'background': 'none',
      'background-color': 'transparent',
      'background-image': 'none',
      'border': 'none',
      'border-radius': '0',
      'outline': 'none',
      'box-shadow': 'none',
      'padding': '0',
      'margin': '0',
      'width': 'auto',
      'min-width': '0',
      'height': 'auto',
      'min-height': '0',
      'max-height': 'none',
      'cursor': 'default',
    };
    
    function sameTextShellChain(el, panel) {
      if (!el) return [];
      const text = normText(el.textContent);
      const chain = [el];
      let cur = el;
      // React/Tailwind commonly nests a text span inside two or more visual shells.
      // The border/background can live on an intermediate shell, so returning only
      // the outermost node is not sufficient. Keep the whole same-text chain and
      // neutralise every layer we own.
      for (let depth = 0; depth < 8; depth += 1) {
        const parent = cur.parentElement;
        if (!parent || parent === panel) break;
        if (parent.matches?.('button, a, [role="button"]') || parent.closest?.('button, a, [role="button"]')) break;
        if (normText(parent.textContent) !== text) break;
        chain.push(parent);
        cur = parent;
      }
      return chain;
    }
    
    function outerSameTextShell(el, panel) {
      const chain = sameTextShellChain(el, panel);
      return chain[chain.length - 1] || el;
    }
    
    function readoutBranch(el, panel) {
      if (!el) return [];
      const branch = [el];
      const readoutText = normText(el.textContent);
      let cur = el;
    
      for (let depth = 0; depth < 10; depth += 1) {
        const parent = cur.parentElement;
        if (!parent || parent === panel) break;
        if (parent.matches?.('button,a,input,select,textarea,[role="button"]')) break;
    
        const parentText = normText(parent.textContent);
        if (!parentText.includes(readoutText)) break;
    
        // Stop before swallowing the action/content column. A readout shell may
        // contain decorative spans or hidden helpers, so exact text equality is
        // too strict; instead stop when the ancestor also owns another semantic
        // skill datum/control.
        const ownsOtherRole = [...parent.querySelectorAll(`[${ROLE_ATTR}]`)].some(node => {
          if (node === el || branch.includes(node)) return false;
          const role = node.getAttribute(ROLE_ATTR);
          return role && role !== 'level-progress';
        });
        const ownsControl = !!parent.querySelector('button,a,input,select,textarea,[role="button"]');
        if (ownsOtherRole || ownsControl) break;
    
        branch.push(parent);
        cur = parent;
      }
      return branch;
    }
    
    function neutraliseReadouts(panel) {
      const previouslyMarked = [...panel.querySelectorAll('[data-iw-readout]')];
    
      let readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
      if (!readout) {
        readout = [...panel.querySelectorAll('div,span,p,strong')].find(el => {
          if (el.closest('button,a,[role="button"]')) return false;
          return LEVEL_PROGRESS_PATTERN.test(normText(el.textContent));
        }) || null;
      }
    
      if (!readout) {
        // The readout disappeared or React repurposed this branch. Restore only the
        // nodes that previously belonged to the readout treatment.
        for (const old of previouslyMarked) {
          readoutStyleOwner.restoreElement(old);
          delete old.dataset.iwReadout;
          readoutStyleSnapshots.delete(old);
        }
        return;
      }
    
      const branch = readoutBranch(readout, panel);
      const current = new Set(branch);
    
      // Restore ONLY nodes that left the readout branch. Restoring every marked
      // node on every reconcile would itself generate style mutations forever.
      for (const old of previouslyMarked) {
        if (current.has(old)) continue;
        readoutStyleOwner.restoreElement(old);
        delete old.dataset.iwReadout;
        readoutStyleSnapshots.delete(old);
      }
    
      for (const target of branch) {
        target.dataset.iwReadout = '1';
        for (const [prop, value] of Object.entries(READOUT_STYLES)) {
          setOwnedStyle(readoutStyleOwner, target, prop, value);
        }
        setOwnedStyle(readoutStyleOwner, target, 'transform', 'none');
        setOwnedStyle(readoutStyleOwner, target, 'filter', 'none');
        setOwnedStyle(readoutStyleOwner, target, 'align-self', 'auto');
        readoutStyleSnapshots.set(target, target.getAttribute('style') || '');
      }
    }
    
    const INGR_PATTERN = /[A-Z\s]{4,}\s+\d+\/\d+|\d+\/\d+/;
    const INGR_STYLES = {
      'background': 'none',
      'background-color': 'transparent',
      'border': 'none',
      'border-radius': '0',
      'padding': '0',
      'box-shadow': 'none',
    };
    
    function neutraliseIngredients(panel) {
      for (const el of panel.querySelectorAll('div, span')) {
        if (el.tagName === 'BUTTON' || el.closest('button, a, [role="button"]')) continue;
        if (el.childElementCount > 3) continue;
        const text = normText(el.textContent);
        const matches = INGR_PATTERN.test(text);
        if (!matches) {
          if (el.dataset.iwIngr) {
            ingredientStyleOwner.restoreElement(el);
            delete el.dataset.iwIngr;
          }
          ingredientStyleSnapshots.delete(el);
          continue;
        }
    
        const chain = sameTextShellChain(el, panel);
        for (const target of chain) {
          const currentStyle = target.getAttribute('style') || '';
          if (ingredientStyleSnapshots.get(target) === currentStyle && target.dataset.iwIngr === '1') continue;
          if (target.dataset.iwIngr !== '1') target.dataset.iwIngr = '1';
          for (const [prop, value] of Object.entries(INGR_STYLES)) {
            setOwnedStyle(ingredientStyleOwner, target, prop, value);
          }
          ingredientStyleSnapshots.set(target, target.getAttribute('style') || '');
        }
      }
    }
    
    function setRole(el, role) {
      if (el && el.getAttribute(ROLE_ATTR) !== role) el.setAttribute(ROLE_ATTR, role);
      return el;
    }
    
    function clearStructureRoles(panel) {
      panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}]`).forEach(el => {
        el.removeAttribute(ROLE_ATTR);
        el.removeAttribute(ZONE_ATTR);
      });
      delete panel.dataset.iwSkillLayout;
    }
    
    function directChildUnder(panel, el) {
      if (!el || !panel.contains(el)) return null;
      let cur = el;
      while (cur && cur.parentElement !== panel) cur = cur.parentElement;
      return cur?.parentElement === panel ? cur : null;
    }
    
    function textCandidates(panel) {
      return [...panel.querySelectorAll('h1,h2,h3,h4,div,span,p')]
        .filter(el => !el.closest('button, a'))
        .filter(el => normText(el.textContent).length <= 130);
    }
    
    function findBestText(panel, predicate) {
      const candidates = textCandidates(panel);
      const exactOwn = candidates.find(el => predicate(normText(el.childElementCount ? '' : el.textContent), el));
      if (exactOwn) return exactOwn;
      return candidates.find(el => predicate(normText(el.textContent), el)) || null;
    }
    
    function findProgress(panel) {
      const semantic = panel.querySelector('[role="progressbar"]');
      if (semantic) {
        const fill = semantic.firstElementChild || null;
        return { track: semantic, fill };
      }
    
      for (const el of panel.querySelectorAll('div')) {
        if (el.children.length !== 1) continue;
        const child = el.firstElementChild;
        const cls = `${el.className || ''} ${child?.className || ''}`;
        const widthStyle = child?.style?.width || '';
        const likelyClass = /progress|h-(?:1|1\.5|2|2\.5)|bg-(?:orange|green|emerald|primary|accent)/i.test(cls);
        if (!likelyClass && !/%$/.test(widthStyle)) continue;
        const rect = el.getBoundingClientRect?.();
        if (rect && (rect.height < 2 || rect.height > 14 || rect.width < 100)) continue;
        return { track: el, fill: child };
      }
      return { track: null, fill: null };
    }
    
    function annotateStructure(panel, type, meta) {
      clearStructureRoles(panel);
    
      const identityLabels = (meta.labels || [meta.label]).map(label => label.toLowerCase());
      const identity = findBestText(panel, text => identityLabels.includes(text.toLowerCase()));
      if (identity) {
        const shell = outerSameTextShell(identity, panel);
        setRole(shell, 'identity');
      }
    
      const actionWord = (meta.titleActions || meta.actions).join('|');
      const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, 'i');
      const actionTitle = findBestText(panel, (text, el) => {
        if (!text || text.length > 90 || !actionTitleRe.test(text)) return false;
        if (el.closest('.iw-item-ref')) return false;
        if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
        return true;
      });
      if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), 'action-title');
    
      const buttons = [...panel.querySelectorAll('button')];
    
      // Audit 1.5.5 proved the visible "Lv N - X% â€¢ ... to go" widget is itself
      // a button. Mark that exact live control before any button receives chrome.
      const levelProgressButton = buttons.find(btn => LEVEL_PROGRESS_PATTERN.test(normText(btn.textContent))) || null;
      if (levelProgressButton) setRole(levelProgressButton, 'level-progress');
    
      let actionButton = null;
      const commandWord = meta.actions.join('|');
      const actionExact = new RegExp(`^(?:${commandWord})$`, 'i');
      for (const btn of buttons) {
        const text = normText(btn.textContent);
        const aria = normText(btn.getAttribute('aria-label'));
        if (actionExact.test(text) || actionExact.test(aria)) {
          actionButton = btn;
          setRole(btn, 'action-button');
          continue;
        }
        if (text.length <= 2 || /^(?:prev|previous|next)$/i.test(aria)) setRole(btn, 'nav-button');
      }
    
      const navButtons = buttons.filter(btn => btn.getAttribute(ROLE_ATTR) === 'nav-button');
      if (navButtons.length >= 2) {
        const parent = navButtons[0].parentElement;
        if (parent && navButtons.every(btn => btn.parentElement === parent)) setRole(parent, 'nav-group');
      }
    
      // Non-button fallback retained for older/mobile DOM variants.
      if (!levelProgressButton) {
        const readout = findBestText(panel, text => LEVEL_PROGRESS_PATTERN.test(text));
        if (readout) setRole(readout, 'level-progress');
      }
    
      const xpGain = findBestText(panel, text => /^\d[\d,]*\s*xp$/i.test(text));
      if (xpGain) setRole(outerSameTextShell(xpGain, panel), 'xp-gain');
    
      const requirement = findBestText(panel, text => /^(?:needs|requires)\b/i.test(text));
      if (requirement) setRole(outerSameTextShell(requirement, panel), 'requirement');
    
      const reward = findBestText(panel, text => /^base reward\s*:/i.test(text));
      if (reward) setRole(outerSameTextShell(reward, panel), 'reward');
    
      const detail = meta.details?.length
        ? findBestText(panel, text => meta.details.some(pattern => pattern.test(text)))
        : null;
      if (detail) setRole(outerSameTextShell(detail, panel), 'action-detail');
    
      const { track, fill } = findProgress(panel);
      if (track) setRole(track, 'progress-track');
      if (fill) setRole(fill, 'progress-fill');
    
      for (const ref of panel.querySelectorAll('.iw-item-ref')) {
        const host = ref.parentElement;
        if (host && host !== panel && /\d+\s*\/\s*\d+/.test(normText(host.textContent))) setRole(host, 'ingredient');
      }
    
      // Opt into the rigid three-column layout only when the live React panel
      // already exposes three distinct top-level zones. Unknown visible branches
      // disable the grid so native layout remains the safe fallback.
      const identityRole = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
      const titleRole = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
      const actionRole = panel.querySelector(`[${ROLE_ATTR}="action-button"]`);
      const identityZone = directChildUnder(panel, identityRole);
      const contentZone = directChildUnder(panel, titleRole);
      const commandZone = directChildUnder(panel, actionRole);
      const directChildren = [...panel.children].filter(el => !el.classList.contains('fs-skill-header'));
    
      const distinctZones = identityZone && contentZone && commandZone &&
        new Set([identityZone, contentZone, commandZone]).size === 3;
    
      if (distinctZones) {
        identityZone.setAttribute(ZONE_ATTR, 'identity');
        contentZone.setAttribute(ZONE_ATTR, 'content');
        commandZone.setAttribute(ZONE_ATTR, 'commands');
    
        // Some skills include an extra absolutely-positioned/decorative React child
        // while others expose only the three functional branches. Ignore non-flow
        // decoration, but refuse rigid layout for an unknown visible branch.
        const functionalZones = new Set([identityZone, contentZone, commandZone]);
        const unexpectedFlowChild = directChildren.some(el => {
          if (functionalZones.has(el)) return false;
          try {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute' || cs.position === 'fixed') return false;
          } catch { /* fall through to rect test */ }
          const rect = el.getBoundingClientRect?.();
          return !rect || (rect.width > 2 && rect.height > 2);
        });
        if (!unexpectedFlowChild) panel.dataset.iwSkillLayout = 'three-zone';
      }
    }
    
    function applyPanelTreatment(panel, type, meta) {
      // Structure first so button styling can use semantic action/nav roles.
      annotateStructure(panel, type, meta);
      panel.querySelectorAll('button').forEach(styleButton);
      neutraliseReadouts(panel);
      neutraliseIngredients(panel);
    }
    
    const SKILL_CLASSES = Object.keys(SKILL_META).map(type => `fs-skill--${type}`);
    
    function clearPanelInlineTreatment(panel) {
      buttonStyleOwner.restoreWithin(panel);
      readoutStyleOwner.restoreWithin(panel);
      ingredientStyleOwner.restoreWithin(panel);
      panel.querySelectorAll('[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]').forEach(el => {
        delete el.dataset.iwReadout;
        delete el.dataset.iwIngr;
        delete el.dataset.iwBtnState;
        buttonStyleSnapshots.delete(el);
        readoutStyleSnapshots.delete(el);
        ingredientStyleSnapshots.delete(el);
      });
    }
    
    function clearPanelChrome(panel) {
      clearPanelInlineTreatment(panel);
      clearStructureRoles(panel);
      panel.classList.remove('fs-skill-panel', ...SKILL_CLASSES);
      delete panel.dataset.fsSkillLabel;
      delete panel.dataset.fsSkillRune;
      delete panel.dataset.fsSkillFlavour;
      delete panel.dataset.iwSkillGlyph;
      delete panel.dataset.iwSkill;
      delete panel.dataset.iwUi;
      panel.removeAttribute(RENDERED_ATTR);
    }
    
    function applyPanelChrome(panel, type, meta) {
    
      if (!panel.classList.contains('fs-skill-panel')) panel.classList.add('fs-skill-panel');
      for (const cls of SKILL_CLASSES) {
        if (cls !== `fs-skill--${type}` && panel.classList.contains(cls)) panel.classList.remove(cls);
      }
      if (!panel.classList.contains(`fs-skill--${type}`)) panel.classList.add(`fs-skill--${type}`);
    
      panel.dataset.iwUi = 'skill-panel';
      panel.dataset.iwSkill = type;
      panel.dataset.iwSkillGlyph = meta.glyph;
      if (panel.dataset.fsSkillLabel !== meta.label) panel.dataset.fsSkillLabel = meta.label;
    }
    
    function renderPanel(panel, skillType) {
      if (!panel || !panel.isConnected) return;
    
      if (!SKILL_META[skillType]) {
        clearPanelChrome(panel);
        return;
      }
    
      const meta = SKILL_META[skillType];
      applyPanelChrome(panel, skillType, meta);
      if (panel.getAttribute(RENDERED_ATTR) !== skillType) panel.setAttribute(RENDERED_ATTR, skillType);
      applyPanelTreatment(panel, skillType, meta);
    }
    
    /** Strip skill chrome and restore only the inline properties this module owns. */
    function clearSkillPanels() {
      guardEach('skill:teardown', document.querySelectorAll('.compact-panel'), clearPanelChrome);
      // Defensive cleanup for previously styled nodes that React moved outside a
      // .compact-panel before teardown.
      buttonStyleOwner.restoreAll();
      readoutStyleOwner.restoreAll();
      ingredientStyleOwner.restoreAll();
      document.querySelectorAll('[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]').forEach(el => {
        delete el.dataset.iwReadout;
        delete el.dataset.iwIngr;
        delete el.dataset.iwBtnState;
      });
    }
    
    function initSkillPanelRenderer() {
      inject('skillpanel', css);
      if (listenerBound) return;
      listenerBound = true;
      on('iw:skill-panel', e => guard('skill:panel', () => renderPanel(e.detail.panel, e.detail.skill)));
    }
    
    
    exports.clearSkillPanels = clearSkillPanels;
    exports.initSkillPanelRenderer = initSkillPanelRenderer;
  };
  __modules["modules/StyleInjector.js"] = (module, exports, require) => {
    /**
     * StyleInjector
     *
     * Injects CSS strings into the page as <style> tags. Every skin stylesheet is
     * lifecycle-owned so the runtime kill switch can remove the COMPLETE theme,
     * including base.css, without uninstalling or reloading the extension.
     *
     * CSS imported as text resolves relative url() references against the PAGE,
     * not the extension. Rewrite ../assets/... references to chrome-extension://
     * URLs before injection so self-hosted fonts/sprites remain CSP-proof.
     */
    const { assetUrl } = require("modules/Runtime.js");
    const _injected = new Set();
    
    function rewriteAssetUrls(css) {
      return String(css || '').replace(
        /url\(\s*(['"]?)\.\.\/assets\/([^)'"\s]+)\1\s*\)/g,
        (_match, _quote, path) => `url("${assetUrl(`assets/${path}`)}")`
      );
    }
    
    /**
     * @param {string} id   Unique identifier — prevents double injection.
     * @param {string} css  The CSS text to inject.
     */
    function inject(id, css) {
      if (_injected.has(id)) return;
      _injected.add(id);
    
      const style = document.createElement('style');
      style.setAttribute('data-iw-style', id);
      style.textContent = rewriteAssetUrls(css);
      (document.head || document.documentElement).appendChild(style);
    }
    
    /** Remove every stylesheet this module injected. Kill switch. */
    function removeAll() {
      document.querySelectorAll('style[data-iw-style]').forEach(el => el.remove());
      _injected.clear();
    }
    
    
    exports.inject = inject;
    exports.removeAll = removeAll;
  };
  __modules["modules/TooltipEngine.js"] = (module, exports, require) => {
    /**
     * TooltipEngine
     *
     * Ported from the IdleWorlds Toolkit's item tooltip engine (v40.4+).
     * Architecture kept intentionally identical — it already solves the
     * hard problems for a UI that mutates constantly:
     *
     *  • ONE pair of delegated document-level listeners. Markup added
     *    anywhere, at any time, becomes a trigger automatically — no
     *    registration step, which matters when the game's own React tree
     *    re-renders panels we don't control.
     *
     *  • position:fixed, not absolute. Triggers can sit inside
     *    overflow:hidden panels or transformed containers; either would
     *    clip or mis-anchor an absolutely-positioned tooltip.
     *
     *  • The panel is interactive on purpose (wiki link, "Full entry"). Desktop
     *    visibility is strict hover ownership: it exists only while the pointer is
     *    over the originating item reference or the tooltip itself. Trigger and
     *    panel are positioned flush together so no grace timer is required.
     *
     *  • Inline references use .iw-item-ref. Non-text surfaces (for example an
     *    inventory icon slot) can opt in with data-iw-tooltip-trigger="1" plus
     *    data-iw-item / data-iw-item-name. Call
     *    itemRef() / itemRefIfKnown() to generate that markup, or use
     *    wrapTextNode() via the name-scanner for organic text.
     */
    const { ItemDatabase } = require("modules/ItemDatabase.js");
    const { AtlasService } = require("modules/AtlasService.js");
    const { tierClass, statRows } = require("modules/itemDisplay.js");
    const { inject } = require("modules/StyleInjector.js");
    const css = require("styles/tooltip-engine.css").default;
    const SHOW_DELAY  = 120;  // ms — avoids firing on pointer fly-over
    const EDGE_GAP     = 0;    // zero-gap handoff: trigger and interactive tooltip touch
    const EDGE_MARGIN  = 10;   // px minimum from any viewport edge
    
    const STATE = {
      el: null,
      anchor: null,
      showTimer: null,
      pointerX: null,
      pointerY: null,
      keyboardOwned: false,
      bound: false,
    };
    
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    
    function isMobile() {
      return matchMedia('(hover: none), (pointer: coarse)').matches;
    }
    
    // ── Item lookup ──────────────────────────────────────────────────────────
    
    function findItem(ref) {
      return ItemDatabase.find(ref);
    }
    
    function categoryGlyph(item) {
      const category = String(item?.category || '').toLowerCase();
      const sub = String(item?.subcategory || '').toLowerCase();
      if (category.includes('equipment')) return '🛡️';
      if (category.includes('potion') || sub.includes('potion')) return '🧪';
      if (category.includes('gem') || sub.includes('gem')) return '💎';
      if (category.includes('scroll') || sub.includes('scroll')) return '📜';
      if (category.includes('material') || sub.includes('ore')) return '📦';
      return '◆';
    }
    function cleanEffectText(item) {
      return String(item?.effects_raw || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' • ')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    // ── Acquisition block ("How to get it") ─────────────────────────────────
    
    function renderAcquisition(item) {
      const t = item.acquisition_type || 'Unknown';
      let main = '', sub = '', unknown = false;
    
      if (t === 'Crafted') {
        const skill = item.craft_skill
          ? item.craft_skill.charAt(0).toUpperCase() + item.craft_skill.slice(1)
          : 'Crafting';
        main = 'Crafted &middot; ' + esc(skill);
        const bits = [];
        if (item.craft_level != null && item.craft_level !== '') bits.push(esc(skill) + ' Lv ' + item.craft_level);
        if (item.tier != null && item.tier !== '') bits.push('Tier ' + item.tier + ' recipe');
        sub = bits.join(' &middot; ');
      } else if (t === 'ZoneDrop' || t === 'BossDrop') {
        main = t === 'BossDrop' ? 'Boss drop' : 'Zone drop';
        const bits = [];
        if (item.source_zone) bits.push('Zone ' + esc(item.source_zone));
        if (item.drop_rate) bits.push('Rate ' + esc(item.drop_rate));
        if (item.drop_boosted_by) bits.push('boosted by ' + esc(item.drop_boosted_by));
        sub = bits.join(' &middot; ');
        if (!sub) sub = esc(item.acquisition_summary || item.acquisition_detail || '');
      } else if (t === 'Gathered' || t === 'Prospected') {
        main = t === 'Gathered' ? 'Gathered' : 'Prospected';
        sub  = item.acquisition_summary ? esc(item.acquisition_summary) : '';
      } else if (t === 'Upgrade') {
        main = 'Upgrade result';
        sub  = item.acquisition_summary ? esc(item.acquisition_summary) : 'Apply an Upgrade Orb to the base item';
      } else if (t === 'Cache') {
        main = 'Cache reward'; sub = esc(item.acquisition_summary || '');
      } else if (t === 'Shop') {
        main = 'Shop purchase'; sub = esc(item.acquisition_summary || '');
      } else if (t === 'Unknown') {
        const sourceText = String(item.acquisition_summary || item.acquisition_detail || '').trim();
        if (sourceText) {
          main = 'Source details';
          sub = esc(sourceText);
        } else {
          unknown = true;
          main = 'Source not documented';
          sub = 'Not covered by the wiki\u2019s source index \u2014 may be a quest turn-in, idle gift or dungeon chest.';
        }
      } else {
        main = esc(t);
        sub  = esc(item.acquisition_summary || '');
      }
    
      if (!sub && item.acquisition_summary && t !== 'Crafted') sub = esc(item.acquisition_summary);
    
      return '<div class="iw-tip-sec"><div class="iw-tip-sec-title">How to get it</div>' +
        '<div class="iw-tip-acq' + (unknown ? ' is-unknown' : '') + '">' +
        '<div class="iw-tip-acq-main">' + main + '</div>' +
        (sub ? '<div class="iw-tip-acq-sub">' + sub + '</div>' : '') +
        '</div></div>';
    }
    
    // ── Stats block ──────────────────────────────────────────────────────────
    
    function renderStats(item) {
      const rows = statRows(item);
      if (!rows.length) return '';
    
      return '<div class="iw-tip-sec"><div class="iw-tip-sec-title">Stats</div><div class="iw-tip-stats">' +
        rows.map(r =>
          `<div class="iw-tip-stat-block"><div class="iw-tip-stat"><span class="k">${esc(r.label)}</span>` +
          `<span class="v${r.cls ? ' ' + r.cls : ''}">${esc(String(r.value))}</span></div>` +
          (r.note ? `<div class="iw-tip-stat-note">${esc(r.note)}</div>` : '') +
          `</div>`
        ).join('') +
        '</div></div>';
    }
    
    // ── Badges (tier, category, slot, requirement) ──────────────────────────
    
    function renderBadges(item) {
      const badges = [];
      const glyph = categoryGlyph(item);
      if (item.tier != null && item.tier !== '') badges.push(`<span class="iw-tip-badge t">Tier ${esc(item.tier)}</span>`);
      if (item.category) badges.push(`<span class="iw-tip-badge">${glyph} ${esc(item.category)}</span>`);
      const slot = String(item.subcategory || '').trim();
      if (slot) badges.push(`<span class="iw-tip-badge">${esc(slot)}</span>`);
      const requirement = String(item.req_text || '').trim();
      if (requirement) {
        badges.push(`<span class="iw-tip-badge req">${esc(requirement)}</span>`);
      } else if (item.req_level) {
        const skill = String(item.req_skill || '').trim();
        const fallback = skill.toLowerCase() === 'any'
          ? `Requires Lv ${item.req_level} (any skill)`
          : `Requires ${skill || 'skill'} Lv ${item.req_level}`;
        badges.push(`<span class="iw-tip-badge req">${esc(fallback)}</span>`);
      }
      return badges.join('');
    }
    
    // ── Full card ────────────────────────────────────────────────────────────
    
    function renderCard(item) {
      const artHost = document.createElement('span');
      artHost.className = 'iw-tip-art-host';
      const painted = AtlasService.paint(artHost, { id: item.item_id, name: item.name });
      const acq       = renderAcquisition(item);
      const stats     = renderStats(item);
      const badges    = renderBadges(item);
      const tier      = tierClass(item);
      const glyph     = categoryGlyph(item);
      const effect    = cleanEffectText(item);
      const effectSec = effect
        ? `<div class="iw-tip-sec iw-tip-effect-sec"><div class="iw-tip-effect">${esc(effect)}</div></div>`
        : '';
      const isGear = String(item.category || '').toLowerCase().includes('equipment');
      const artClass = isGear ? 'iw-tip-gear-art' : 'iw-tip-item-art';
    
      const wikiLink = item.wiki_slug
        ? `<a class="iw-tip-link" href="https://idleworlds.com/wiki/items/${esc(item.wiki_slug)}" target="_blank" rel="noopener noreferrer">📖 Wiki \u2197</a>`
        : '';
      const source = ItemDatabase.source();
      const sourceLabel = source === 'network' ? 'live data'
        : source === 'stale-cache' ? 'stale cached data'
        : source === 'cache' ? 'cached data' : 'item data';
      const sourceClass = source === 'stale-cache' ? ' is-stale' : '';
    
      return {
        html: `
          <div class="iw-tip-head has-art ${isGear ? 'has-gear-art' : 'has-item-art'}">
            <div class="iw-tip-icon" aria-hidden="true">${glyph}</div>
            <div class="iw-tip-title-block">
              <div class="iw-tip-name ${tier}">${esc(item.name)}</div>
              <div class="iw-tip-badges">${badges}</div>
            </div>
            <div class="iw-tip-art ${artClass}" aria-hidden="true"><span class="iw-tip-art-fallback">${glyph}</span></div>
          </div>
          <div class="iw-tip-body">
            ${effectSec}
            ${stats}
            ${acq}
          </div>
          <div class="iw-tip-foot">${wikiLink}<span class="iw-tip-source${sourceClass}">${esc(sourceLabel)}</span><button type="button" class="iw-tip-close" aria-label="Close item details">&times;</button></div>
        `,
        artHost,
        painted,
      };
    }
    
    // ── Positioning ───────────────────────────────────────────────────────────
    
    function position(anchor) {
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = STATE.el;
    
      // Measure while invisible (visibility:hidden keeps the layout box).
      // IMPORTANT: opacity is owned by CSS/class state only. Earlier builds wrote
      // inline opacity:1 here, which overrode .iw-tip { opacity:0 } after hide and
      // was the direct cause of visually lingering tooltips.
      el.style.visibility = 'hidden';
      el.style.display = 'flex';
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
    
      let x = rect.left;
      let y = rect.bottom + EDGE_GAP;
    
      // Flip above if it would overflow the bottom edge
      if (y + th + EDGE_MARGIN > vh) {
        y = rect.top - th - EDGE_GAP;
      }
      // Clamp horizontally
      if (x + tw + EDGE_MARGIN > vw) x = vw - tw - EDGE_MARGIN;
      if (x < EDGE_MARGIN) x = EDGE_MARGIN;
      // Clamp vertically (edge case: very short viewport)
      if (y < EDGE_MARGIN) y = EDGE_MARGIN;
    
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.visibility = 'visible';
    }
    
    // ── Show / hide ───────────────────────────────────────────────────────────
    
    function clearShowTimer() {
      if (STATE.showTimer) clearTimeout(STATE.showTimer);
      STATE.showTimer = null;
    }
    
    function isOpen() {
      return !!STATE.el?.classList.contains('is-open');
    }
    
    function nodeInside(root, node) {
      return !!(root && node && (node === root || root.contains(node)));
    }
    
    const TRIGGER_SELECTOR = [
      '.iw-item-ref[data-iw-item]',
      '.iw-item-ref[data-iw-item-name]',
      '[data-iw-tooltip-trigger="1"][data-iw-item]',
      '[data-iw-tooltip-trigger="1"][data-iw-item-name]',
    ].join(', ');
    
    function findTrigger(node) {
      return (node && node.closest) ? node.closest(TRIGGER_SELECTOR) : null;
    }
    
    /**
     * A "virtual anchor" is not a DOM node — it is a rect provider, used when the
     * thing being hovered has no element of its own. NameScanner needs this: it
     * annotates the game's prose without inserting wrapper elements, so its trigger
     * is a Range's geometry rather than a node. See NameScanner.js.
     */
    function isVirtual(anchor) {
      return !!(anchor && anchor.__virtual);
    }
    
    function anchorContainsPointer() {
      if (!isVirtual(STATE.anchor)) return false;
      if (STATE.pointerX == null || STATE.pointerY == null) return false;
      const r = STATE.anchor.getBoundingClientRect();
      if (!r) return false;
      return STATE.pointerX >= r.left && STATE.pointerX <= r.right
          && STATE.pointerY >= r.top  && STATE.pointerY <= r.bottom;
    }
    
    function activeSurfaceForNode(node) {
      // Tooltip first: moving from a virtual anchor onto the card must keep it open.
      if (STATE.el && node && nodeInside(STATE.el, node)) return 'tooltip';
      if (isVirtual(STATE.anchor)) return anchorContainsPointer() ? 'anchor' : null;
      if (!node) return null;
      if (STATE.anchor && nodeInside(STATE.anchor, node)) return 'anchor';
      return null;
    }
    
    function pointerNode() {
      if (STATE.pointerX == null || STATE.pointerY == null) return null;
      return document.elementFromPoint(STATE.pointerX, STATE.pointerY);
    }
    
    function pointerIsOnActiveSurface() {
      return !!activeSurfaceForNode(pointerNode());
    }
    
    function cleanupAnchor(anchor) {
      if (!anchor || isVirtual(anchor)) return;
      anchor.removeAttribute('aria-describedby'); // cleanup residue from pre-hovercard builds
      anchor.setAttribute('aria-expanded', 'false');
    }
    
    function show(anchor, { keyboard = false } = {}) {
      if (!anchor?.isConnected) return;
      const item = isVirtual(anchor)
        ? anchor.item
        : findItem({
            id: anchor.getAttribute('data-iw-item'),
            name: anchor.getAttribute('data-iw-item-name'),
          });
      if (!item) return;
    
      clearShowTimer();
    
      if (STATE.anchor && STATE.anchor !== anchor) cleanupAnchor(STATE.anchor);
    
      const { html, artHost, painted } = renderCard(item);
      STATE.el.innerHTML = html;
    
      const artSlot = STATE.el.querySelector('.iw-tip-art');
      if (artSlot && painted) {
        artSlot.textContent = '';
        artHost.classList.add('iw-tip-art-painted');
        artSlot.appendChild(artHost);
      }
    
      STATE.anchor = anchor;
      STATE.keyboardOwned = keyboard;
      STATE.el.setAttribute('aria-label', `${item.name} item details`);
      if (!isVirtual(anchor)) {
        anchor.setAttribute('aria-controls', 'iw-tip');
        anchor.setAttribute('aria-haspopup', 'dialog');
        anchor.setAttribute('aria-expanded', 'true');
      }
    
      position(anchor);
      STATE.el.classList.add('is-open');
      if (keyboard) {
        try { STATE.el.focus({ preventScroll: true }); }
        catch { STATE.el.focus(); }
      }
    }
    
    function hide() {
      clearShowTimer();
      if (STATE.el) {
        STATE.el.classList.remove('is-open');
        // display:none is deliberate: hiding is immediate and cannot be defeated
        // by native/CSS opacity transitions or stale inline visibility state.
        STATE.el.style.display = 'none';
        STATE.el.style.visibility = 'hidden';
      }
      if (STATE.anchor) cleanupAnchor(STATE.anchor);
      STATE.anchor = null;
      STATE.keyboardOwned = false;
    }
    
    function scheduleShow(anchor) {
      clearShowTimer();
      STATE.showTimer = setTimeout(() => {
        STATE.showTimer = null;
        if (!anchor?.isConnected) return;
    
        // The delayed show must never fire after the cursor has already left.
        // :hover remains true while the pointer is over a descendant of the trigger.
        if (!isMobile() && !anchor.matches(':hover')) return;
        show(anchor);
      }, SHOW_DELAY);
    }
    
    // ── Bootstrap ──────────────────────────────────────────────────────────────
    
    function initTooltipEngine() {
      if (STATE.bound) return;
      STATE.bound = true;
    
      inject('tooltip-engine', css);
    
      STATE.el = document.createElement('div');
      STATE.el.id = 'iw-tip';
      STATE.el.className = 'iw-tip';
      STATE.el.setAttribute('role', 'dialog');
      STATE.el.setAttribute('aria-modal', 'false');
      STATE.el.setAttribute('aria-label', 'Item details');
      STATE.el.setAttribute('tabindex', '-1');
      STATE.el.style.display = 'none';
      document.body.appendChild(STATE.el);
    
      // Interactive tooltip handoff is strict: there is no timed grace period.
      // The tooltip is positioned flush against the trigger (EDGE_GAP = 0), so a
      // mouse can pass directly trigger → tooltip without traversing dead space.
      STATE.el.addEventListener('mouseenter', () => {
        clearShowTimer();
      });
      STATE.el.addEventListener('mouseleave', e => {
        if (STATE.keyboardOwned) return;
        if (!isMobile() && STATE.anchor && nodeInside(STATE.anchor, e.relatedTarget)) return;
        hide();
      });
      STATE.el.addEventListener('focusout', e => {
        if (!STATE.keyboardOwned) return;
        if (STATE.el.contains(e.relatedTarget)) return;
        if (!isVirtual(STATE.anchor) && nodeInside(STATE.anchor, e.relatedTarget)) return;
        hide();
      });
      STATE.el.addEventListener('click', e => {
        if (!e.target.closest?.('.iw-tip-close')) return;
        const anchor = STATE.anchor;
        const restoreFocus = STATE.keyboardOwned;
        hide();
        if (restoreFocus && anchor?.focus) anchor.focus();
      });
    
      document.addEventListener('mouseover', e => {
        if (isMobile() || STATE.keyboardOwned) return;
        const t = findTrigger(e.target);
        if (!t) return;
    
        // Already hovering the active trigger — keep the current card open.
        if (t === STATE.anchor && isOpen()) return;
    
        // Moving to a different item must close the previous tooltip immediately;
        // it may not linger during the new trigger's SHOW_DELAY.
        if (STATE.anchor && STATE.anchor !== t) hide();
        scheduleShow(t);
      }, true);
    
      document.addEventListener('mouseout', e => {
        if (isMobile() || STATE.keyboardOwned) return;
        const t = findTrigger(e.target);
        if (!t) return;
    
        // Ignore movement between descendants of the same trigger.
        if (e.relatedTarget && findTrigger(e.relatedTarget) === t) return;
    
        clearShowTimer();
    
        // Direct trigger → tooltip handoff is the only allowed exception to an
        // immediate hide. With EDGE_GAP=0 the two hover surfaces physically touch.
        if (STATE.anchor === t && STATE.el && nodeInside(STATE.el, e.relatedTarget)) return;
        hide();
      }, true);
    
      // Record the real pointer position and enforce the invariant continuously:
      // while a desktop tooltip is open, the pointer must be over its anchor or
      // over the tooltip itself. This catches missed leave events, React node
      // replacement, and other cases that previously left orphaned cards behind.
      document.addEventListener('mousemove', e => {
        if (isMobile()) return;
        STATE.pointerX = e.clientX;
        STATE.pointerY = e.clientY;
        if (STATE.keyboardOwned) return;
    
        if (STATE.showTimer && !findTrigger(e.target)) clearShowTimer();
        // Keyboard-opened cards are focus-owned. A stationary mouse elsewhere in
        // the page must not immediately cancel them when the user presses a key.
        if (isOpen() && !STATE.keyboardOwned && !activeSurfaceForNode(e.target)) hide();
      }, true);
    
      document.addEventListener('click', e => {
        const t = findTrigger(e.target);
        if (t) {
          // Tooltip discovery must never consume a game click. Explicit references
          // live inside extension-owned presentation, but their ancestors may still
          // be React-owned clickable rows. Let the native event continue normally.
          clearShowTimer();
    
          if (isMobile()) {
            // Touch devices have no hover state, so retain tap-to-toggle behavior.
            if (STATE.anchor === t && isOpen()) hide();
            else show(t);
          } else {
            // Desktop clicks never pin a tooltip. The cursor still owns visibility.
            show(t);
          }
          return;
        }
    
        // Clicks inside the card (for example Wiki ↗) must remain functional.
        if (STATE.el.contains(e.target)) return;
        hide();
      });
    
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (!STATE.anchor) return;
          const a = STATE.anchor;
          hide();
          if (a && a.focus) a.focus();
          return;
        }
    
        // Triggers advertise role="button" and tabindex="0", so they must actually
        // respond to Enter/Space. Previously only Escape was bound, which left the
        // control announcing itself as a button while doing nothing for keyboard
        // users. (Audit S5)
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        const trigger = findTrigger(e.target);
        if (!trigger) return;
        e.preventDefault();
        if (STATE.anchor === trigger && isOpen()) {
          hide();
        } else {
          show(trigger, { keyboard: true });
          const firstInteractive = STATE.el.querySelector('a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])');
          if (firstInteractive?.focus) firstInteractive.focus();
        }
      });
    
      const reflow = () => {
        if (!STATE.anchor) return;
        if (!STATE.anchor.isConnected) { hide(); return; }
    
        if (!isMobile() && !STATE.keyboardOwned) {
          const surface = activeSurfaceForNode(pointerNode());
          if (!surface) { hide(); return; }
    
          // If the pointer is on the interactive tooltip, leave the fixed card in
          // place while scrolling. If it remains on the trigger, track the trigger.
          if (surface === 'tooltip') return;
        }
        position(STATE.anchor);
      };
      window.addEventListener('scroll', reflow, true);
      window.addEventListener('resize', reflow);
      window.addEventListener('blur', hide);
    
      // React can replace the trigger without a conventional mouseleave. Validate
      // the pointer after every central DOM flush and close any orphan immediately.
      document.addEventListener('iw:dom-flush', () => {
        if (!isOpen()) return;
        const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
        raf(() => {
          if (!STATE.anchor?.isConnected) { hide(); return; }
          if (!isMobile() && !STATE.keyboardOwned && !pointerIsOnActiveSurface()) hide();
        });
      });
    
      // A tooltip can open while atlas metadata is still loading, or while a
      // cached item table is being replaced by a fresh one. Refresh only if the
      // pointer still owns the tooltip; data refreshes may never resurrect a card
      // the user has already left.
      const refreshOpen = () => {
        if (!STATE.anchor || !isOpen()) return;
        if (!STATE.anchor.isConnected) { hide(); return; }
        // Replacing innerHTML while keyboard focus is inside the hovercard would
        // detach the focused Wiki link. Preserve the stable keyboard surface until
        // the user closes it; the next open will render fresh data.
        if (STATE.keyboardOwned) return;
        if (!isMobile() && !pointerIsOnActiveSurface()) { hide(); return; }
        show(STATE.anchor);
      };
      document.addEventListener('iw:atlas-updated', refreshOpen);
      document.addEventListener('iw:item-db-updated', refreshOpen);
    }
    
    // ── Virtual-anchor API ───────────────────────────────────────────────────
    //
    // Used by consumers that have geometry but no element — currently NameScanner,
    // which annotates the game's prose without inserting anything into its DOM.
    
    const virtualAnchor = {
      __virtual: true,
      isConnected: true,
      item: null,
      source: null,
      _rect: () => null,
      getBoundingClientRect() {
        return this._rect() || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      },
    };
    
    /**
     * Open the card for `item`, anchored to a caller-supplied rect.
     * @param {object} item        ItemDatabase record
     * @param {() => DOMRect} rectProvider re-queried on every reposition
     * @param {string} source      tag used so hideTooltip() can scope its effect
     */
    function showForItem(item, rectProvider, source = 'virtual') {
      if (!item || typeof rectProvider !== 'function') return;
      virtualAnchor.item = item;
      virtualAnchor.source = source;
      virtualAnchor._rect = rectProvider;
      show(virtualAnchor);
    }
    
    /**
     * Close the card. When `source` is given, only closes a card that the same
     * source opened — so a virtual consumer cannot dismiss an element-anchored
     * tooltip belonging to the inventory or a skill panel.
     */
    function hideTooltip(source) {
      if (source && STATE.anchor && (!isVirtual(STATE.anchor) || STATE.anchor.source !== source)) return;
      hide();
    }
    
    function isTooltipOpen() {
      return isOpen();
    }
    
    // ── Markup helpers ───────────────────────────────────────────────────────
    
    /**
     * itemRef(nameOrItem, label) — build trigger markup for a known item.
     * Prefers item_id when given a record (stable across renames).
     */
    function itemRef(nameOrItem, label, opts = {}) {
      const isObj = nameOrItem && typeof nameOrItem === 'object';
      const name  = isObj ? nameOrItem.name : String(nameOrItem == null ? '' : nameOrItem);
      const id    = isObj ? nameOrItem.item_id : null;
      const text  = opts.html != null ? opts.html : esc(label != null ? label : name);
      if (!name && !id) return text;
    
      const attr = id
        ? `data-iw-item="${esc(id)}"`
        : `data-iw-item-name="${esc(name)}"`;
    
      const glyph = '<span class="iw-item-info" aria-hidden="true">i</span>';
      const inner = opts.iconOnly ? glyph : `<span class="iw-item-name">${text}</span>${glyph}`;
    
      // Do not use a native <button> for inline item references. IdleWorlds
      // applies global button geometry aggressively, which turned item names in
      // quests/skills/village text into large boxed controls. A focusable span
      // keeps the delegated tooltip behaviour and keyboard accessibility without
      // inheriting the game's button presentation.
      return `<span class="iw-item-ref" role="button" tabindex="0" ${attr} aria-haspopup="dialog" aria-controls="iw-tip" aria-expanded="false" aria-label="${esc(name)}, item details">${inner}</span>`;
    }
    
    /** itemRefIfKnown(name) — wrap only if the name resolves to a real item. */
    function itemRefIfKnown(name, opts) {
      const clean = String(name == null ? '' : name).trim();
      if (!clean) return '';
      const hit = ItemDatabase.getByName(clean);
      return hit ? itemRef(hit, clean, opts) : esc(clean);
    }
    
    
    exports.initTooltipEngine = initTooltipEngine;
    exports.showForItem = showForItem;
    exports.hideTooltip = hideTooltip;
    exports.isTooltipOpen = isTooltipOpen;
    exports.itemRef = itemRef;
    exports.itemRefIfKnown = itemRefIfKnown;
  };
  __modules["modules/UIFoundation.js"] = (module, exports, require) => {
    /**
     * UIFoundation
     *
     * Classifies existing IdleWorlds DOM into semantic visual roles. React keeps
     * ownership of all nodes/handlers; the skin only adds data attributes. The
     * central DOMWatcher remains the sole MutationObserver.
     */
    const { on } = require("modules/DOMWatcher.js");
    const { inject } = require("modules/StyleInjector.js");
    const { guard, raf } = require("modules/Runtime.js");
    const css = require("styles/ui-system.css").default;
    const NAV_LABELS = ['game', 'market', 'leaderboards', 'village', 'dungeon'];
    // The audited v1.5.3 visual baseline never successfully activated the HUD
    // relayout path on the current live DOM. Keep that structural rewrite disabled
    // until it is rebuilt/tested as an isolated feature; name/readout fixes must not
    // implicitly switch on a dormant layout system.
    const ENABLE_PLAYER_HUD_RELAYOUT = false;
    const HUD_METRIC_PATTERNS = [
      /^\s*[💰🪙]?\s*[\d,]+\s*$/u,
      /\batk\s*\d+\s*[•·]\s*def\s*\d+\s*[•·]\s*hp\s*\d+/i,
      /\bxp\s*[+\-]?\d+\s*\/\s*task\b/i,
      /\b(?:no\s+)?atk\s+potion\b/i,
      /\b(?:no\s+)?def\s+potion\b/i,
      /\bworld\s+buff\b/i,
      /\bboosted\b/i,
    ];
    
    function normText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
    
    function lower(el) {
      return normText(el?.textContent).toLowerCase();
    }
    
    function setRole(el, role) {
      if (el && el.dataset.iwUi !== role) el.dataset.iwUi = role;
      return el;
    }
    
    function nearestButtonLabel(btn) {
      return normText(btn?.textContent).toLowerCase();
    }
    
    function commonAncestor(elements) {
      const list = elements.filter(Boolean);
      if (!list.length) return null;
      let cur = list[0];
      while (cur && cur !== document.documentElement) {
        if (list.every(el => cur === el || cur.contains(el))) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    
    function directChildUnder(root, el) {
      if (!root || !el || !root.contains(el)) return null;
      let cur = el;
      while (cur && cur.parentElement !== root) cur = cur.parentElement;
      return cur?.parentElement === root ? cur : null;
    }
    
    function sameTextShell(el, stop, maxDepth = 4) {
      if (!el) return null;
      const text = normText(el.textContent);
      let cur = el;
      for (let depth = 0; depth < maxDepth; depth += 1) {
        const parent = cur.parentElement;
        if (!parent || parent === stop) break;
        if (parent.matches?.('button, a, input, select, textarea')) break;
        if (normText(parent.textContent) !== text) break;
        cur = parent;
      }
      return cur;
    }
    
    function warmBackground(btn) {
      try {
        const colour = getComputedStyle(btn).backgroundColor || '';
        const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return false;
        const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
        return r >= 90 && r > g * 1.35 && g > b * .9;
      } catch {
        return false;
      }
    }
    
    function deriveTabActive(btn) {
      if (!btn) return false;
      if (btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-current') === 'page') return true;
      const cls = String(btn.className || '');
      return /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
    }
    
    function classifyMainNav() {
      const buttons = [...document.querySelectorAll('button, [role="tab"]')];
      const byLabel = new Map();
      for (const btn of buttons) {
        const label = nearestButtonLabel(btn);
        if (NAV_LABELS.includes(label) && !byLabel.has(label)) byLabel.set(label, btn);
      }
      if (byLabel.size < 4) return;
    
      const tabs = NAV_LABELS.map(label => byLabel.get(label)).filter(Boolean);
      const semanticActive = tabs.map(btn => deriveTabActive(btn));
      const hasSemanticActive = semanticActive.some(Boolean);
      const route = `${location.pathname || ''} ${location.hash || ''}`.toLowerCase();
      const routeActive = tabs.map(btn => {
        const label = nearestButtonLabel(btn);
        if (label === 'game') return /(?:^|\/)(?:game)?\/?$/.test(location.pathname || '/') && !location.hash;
        return route.includes(label);
      });
      const hasRouteActive = routeActive.some(Boolean);
      const firstClassification = tabs.every(btn => btn.dataset.iwUi !== 'nav-tab');
      const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);
    
      const track = commonAncestor(tabs);
      if (!track) return;
      setRole(track, 'main-nav');
    
      // IdleWorlds currently places the button track inside a much larger rounded
      // shell. Mark the outer same-content wrapper separately so we can flatten it
      // without forcing an unknown wrapper to become a flex row.
      let shell = track;
      const navText = normText(track.textContent);
      for (let depth = 0; depth < 3; depth += 1) {
        const parent = shell.parentElement;
        if (!parent || parent === document.body) break;
        const parentButtons = [...parent.querySelectorAll('button, [role="tab"]')]
          .filter(btn => NAV_LABELS.includes(nearestButtonLabel(btn)));
        const rect = parent.getBoundingClientRect?.();
        if (parentButtons.length !== tabs.length || normText(parent.textContent) !== navText) break;
        if (rect && rect.height > 110) break;
        shell = parent;
      }
      if (shell !== track) setRole(shell, 'main-nav-shell');
    
      tabs.forEach((btn, index) => {
        const wasActive = btn.dataset.iwState === 'active';
        setRole(btn, 'nav-tab');
        btn.dataset.iwTab = nearestButtonLabel(btn);
        const active = hasSemanticActive
          ? semanticActive[index]
          : hasRouteActive
            ? routeActive[index]
            : firstClassification
              ? warmActive[index]
              : wasActive;
        if (active) btn.dataset.iwState = 'active';
        else delete btn.dataset.iwState;
      });
    }
    
    function chooseHudHost(marker) {
      let cur = marker;
      let best = null;
      for (let depth = 0; cur && depth < 9; depth += 1, cur = cur.parentElement) {
        const text = lower(cur);
        if (!/players online/.test(text) || !/combat\s+lv\s*\d+/.test(text)) continue;
        if (/\batk\s*\d+/.test(text) && /\bdef\s*\d+/.test(text) && /\bhp\s*\d+/.test(text)) {
          best = cur;
          const rect = cur.getBoundingClientRect?.();
          if (rect && rect.width >= Math.min(720, window.innerWidth * .62) && rect.height < 360) return cur;
        }
      }
      return best;
    }
    
    function chooseIdentityHost(marker, hud) {
      let cur = marker;
      let best = marker.parentElement;
      for (let depth = 0; cur && cur !== hud && depth < 7; depth += 1, cur = cur.parentElement) {
        const text = lower(cur);
        if (/players online/.test(text) && /combat\s+lv\s*\d+/.test(text) && !/\batk\s*\d+\s*[•·]\s*def/.test(text)) {
          best = cur;
        }
      }
      return best;
    }
    
    function hudLeafCandidates(identity) {
      // The live game can render the player name as a clickable control so other
      // players can inspect/profile it, and cosmetic name colours may live on a
      // nested span. Do not exclude buttons/anchors here; only reject containers
      // that contain unrelated interactive descendants.
      return [...identity.querySelectorAll('h1,h2,h3,h4,div,span,p,button,a,[role="button"]')]
        .filter(el => {
          const nestedControls = [...el.querySelectorAll('button,a,input,select,textarea,[role="button"]')]
            .filter(control => control !== el);
          return nestedControls.length === 0;
        })
        .filter(el => el.childElementCount <= 2)
        .filter(el => {
          const text = normText(el.textContent);
          return text && text.length <= 80;
        });
    }
    
    function hudOrderedTextCandidates(identity) {
      const candidates = hudLeafCandidates(identity);
      const position = new Map();
      candidates.forEach((el, index) => position.set(el, index));
    
      // Prefer the smallest shell for duplicate same-text candidates, then preserve
      // DOM order. This makes the sequence robust to wrappers introduced by React.
      const byText = new Map();
      for (const el of candidates) {
        const text = normText(el.textContent);
        const previous = byText.get(text);
        if (!previous || previous.contains(el)) byText.set(text, el);
      }
      return [...byText.values()].sort((a, b) => {
        if (a === b) return 0;
        const relation = a.compareDocumentPosition?.(b) || 0;
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return (position.get(a) || 0) - (position.get(b) || 0);
      });
    }
    
    function markPlayerName(name, identity) {
      if (!name) return;
      const shell = sameTextShell(name, identity, 6);
      setRole(shell, 'hud-player-name');
      shell.dataset.iwHudPlayerText = '1';
      name.dataset.iwHudPlayerText = '1';
    
      // Classification only. IdleWorlds owns the cosmetic player-name treatment
      // (for example chat-name-celestial), including transparent text fill plus a
      // clipped background gradient on the clickable name button. Never write
      // colour/background/text-fill here: doing so destroys the native cosmetic.
    }
    
    function classifyHudIdentity(identity) {
      if (!identity) return;
    
      // Reclassification happens repeatedly as React updates the header. Clear only
      // the identity sub-roles we own so a stale earlier guess cannot keep styling
      // the wrong node after the player header is reconciled.
      identity.querySelectorAll('[data-iw-ui="hud-brand"], [data-iw-ui="hud-player-name"], [data-iw-ui="hud-title"], [data-iw-ui="hud-location"], [data-iw-ui="hud-online"]').forEach(el => {
        delete el.dataset.iwUi;
      });
      identity.querySelectorAll('[data-iw-hud-player-text]').forEach(el => {
        delete el.dataset.iwHudPlayerText;
      });
    
      const candidates = hudOrderedTextCandidates(identity);
      const brand = candidates.find(el => /^idleworlds$/i.test(normText(el.textContent)));
      const location = candidates.find(el => /combat\s+lv\s*\d+.*zone\s*\d+/i.test(normText(el.textContent)));
      const online = candidates.find(el => /^players online\s*:/i.test(normText(el.textContent)));
    
      if (brand) setRole(sameTextShell(brand, identity, 2), 'hud-brand');
      if (location) setRole(sameTextShell(location, identity, 2), 'hud-location');
      if (online) setRole(sameTextShell(online, identity, 2), 'hud-online');
    
      // The desktop header's identity block is ordered Brand -> Player -> Title ->
      // Combat/Zone -> Online. Use that structural fact before any font-size
      // heuristic. It remains valid when the player name is an <a>/<button> and
      // when its cosmetic colour makes computed font styling misleading.
      const brandIndex = brand ? candidates.indexOf(brand) : -1;
      const locationIndex = location ? candidates.indexOf(location) : candidates.length;
      const between = candidates.filter((el, index) => {
        if (index <= brandIndex || index >= locationIndex) return false;
        const text = normText(el.textContent);
        if (!text || /^(?:idleworlds|players online\s*:)/i.test(text)) return false;
        if (/combat\s+lv|zone\s*\d+/i.test(text)) return false;
        return true;
      });
    
      let name = between[0] || null;
      let title = between[1] || null;
    
      // Fallback for unexpected header ordering: prefer a clickable short control,
      // then the largest remaining short text. This is intentionally secondary to
      // DOM order because cosmetic gradients can distort computed styles.
      if (!name) {
        const excluded = new Set([brand, location, online].filter(Boolean));
        const remaining = candidates.filter(el => !excluded.has(el));
        name = remaining.find(el => el.matches?.('button,a,[role="button"]')) || remaining
          .map(el => {
            let size = 0;
            let weight = 0;
            try {
              const cs = getComputedStyle(el);
              size = parseFloat(cs.fontSize) || 0;
              weight = parseInt(cs.fontWeight, 10) || 400;
            } catch { /* no-op */ }
            return { el, score: size * 10 + weight / 100 };
          })
          .sort((a, b) => b.score - a.score)[0]?.el || null;
      }
    
      if (name) markPlayerName(name, identity);
    
      if (!title) {
        title = candidates.find(el => {
          if (el === name || el === brand || el === location || el === online) return false;
          const text = normText(el.textContent);
          return text.length <= 42 && !/combat\s+lv|zone\s*\d+|players online/i.test(text);
        }) || null;
      }
      if (title) setRole(sameTextShell(title, identity, 2), 'hud-title');
    }
    
    function classifyHudMetrics(hud) {
      if (!hud) return [];
      const candidates = [...hud.querySelectorAll('div, span, p')]
        .filter(el => !el.querySelector('button, input, select, textarea'))
        .filter(el => el.childElementCount <= 2);
    
      const used = new Set();
      const metrics = [];
      for (const el of candidates) {
        const text = normText(el.textContent);
        if (!text || text.length > 100 || !HUD_METRIC_PATTERNS.some(re => re.test(text))) continue;
        const shell = sameTextShell(el, hud, 4);
        if (!shell || used.has(shell)) continue;
        used.add(shell);
        setRole(shell, 'hud-metric');
        metrics.push(shell);
      }
      return metrics;
    }
    
    function classifyHudZones(hud, identity, metrics) {
      if (!hud || !identity) return;
      const identityZone = directChildUnder(hud, identity);
      if (identityZone) identityZone.dataset.iwHudZone = 'identity';
    
      let statusHost = commonAncestor(metrics);
      if (statusHost === hud) statusHost = null;
      const statusZone = directChildUnder(hud, statusHost || metrics[0]);
      if (statusZone && statusZone !== identityZone) {
        statusZone.dataset.iwHudZone = 'status';
        setRole(statusHost || statusZone, 'hud-status');
      }
    
      const utilityButtons = [...hud.querySelectorAll('button')]
        .filter(btn => !statusZone?.contains(btn))
        .filter(btn => {
          const text = normText(btn.textContent);
          const aria = normText(btn.getAttribute('aria-label') || btn.getAttribute('title'));
          return text.length <= 2 || (!!aria && aria.length <= 28);
        });
      const utilityHost = commonAncestor(utilityButtons);
      const utilityZone = directChildUnder(hud, utilityHost || utilityButtons[0]);
      if (utilityZone && utilityZone !== identityZone && utilityZone !== statusZone) {
        utilityZone.dataset.iwHudZone = 'utility';
        if (utilityHost && utilityHost !== hud) setRole(utilityHost, 'hud-utility');
        utilityButtons.forEach(btn => setRole(btn, 'hud-utility-button'));
      }
    
      const zones = [identityZone, utilityZone, statusZone].filter(Boolean);
      if (zones.length === 3 && new Set(zones).size === 3) hud.dataset.iwHudLayout = 'three-zone';
      else delete hud.dataset.iwHudLayout;
    }
    
    function classifyPlayerHud() {
      const marker = [...document.querySelectorAll('div, span, p')]
        .find(el => /^players online\s*:/i.test(normText(el.textContent)) && el.childElementCount <= 2);
      if (!marker) return;
    
      const hud = chooseHudHost(marker);
      if (!hud || hud === document.body) return;
      setRole(hud, 'player-hud');
    
      const identity = chooseIdentityHost(marker, hud);
      if (identity && hud.contains(identity)) {
        setRole(identity, 'hud-identity');
        classifyHudIdentity(identity);
      }
      const metrics = classifyHudMetrics(hud);
      classifyHudZones(hud, identity, metrics);
    }
    
    function classifyZoneBar() {
      const labels = [...document.querySelectorAll('div,span,p,strong')]
        .filter(el => /^zone\s*\d+\s*:/i.test(normText(el.textContent)) && el.childElementCount <= 2);
      for (const label of labels) {
        let host = label.parentElement;
        for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
          const buttons = [...host.querySelectorAll('button')];
          const buttonText = buttons.map(nearestButtonLabel);
          if (buttonText.some(x => /zones/.test(x)) && buttonText.some(x => /next\s+zone/.test(x))) {
            setRole(host, 'zone-bar');
            buttons.forEach(btn => {
              const text = nearestButtonLabel(btn);
              if (/^(?:zones|previous\s+zone|next\s+zone)$/.test(text)) setRole(btn, 'zone-action');
            });
            setRole(sameTextShell(label, host, 2), 'zone-title');
            break;
          }
        }
      }
    }
    
    function classifySectionFrames() {
      const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
      const names = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions)$/i;
      for (const heading of headings) {
        if (!names.test(normText(heading.textContent))) continue;
        let cur = heading.parentElement;
        for (let depth = 0; cur && depth < 4; depth += 1, cur = cur.parentElement) {
          if (cur.matches?.('.compact-panel')) break;
          const rect = cur.getBoundingClientRect?.();
          const descendantCount = cur.querySelectorAll?.('*').length || 0;
          const substantial = descendantCount >= 12 && normText(cur.textContent).length >= 45;
          const roomy = !rect || (rect.width > 320 && rect.height > 110);
          if (substantial && roomy) {
            setRole(cur, 'section-frame');
            setRole(heading, 'section-title');
            break;
          }
        }
      }
    }
    
    let queued = false;
    function queueClassify() {
      if (queued) return;
      queued = true;
      raf(() => {
        queued = false;
        // Each classifier is isolated: a throw inside classifyMainNav() must not
        // stop the zone bar and section frames from being classified. (Audit S3.7)
        guard('ui:main-nav', classifyMainNav);
        if (ENABLE_PLAYER_HUD_RELAYOUT) guard('ui:player-hud', classifyPlayerHud);
        guard('ui:zone-bar', classifyZoneBar);
        guard('ui:section-frames', classifySectionFrames);
      });
    }
    
    /** Remove every semantic role attribute this module applied. Kill switch. */
    function clearUIFoundation() {
      document.querySelectorAll('[data-iw-ui]').forEach(el => { delete el.dataset.iwUi; });
      document.querySelectorAll('[data-iw-tab]').forEach(el => { delete el.dataset.iwTab; });
      document.querySelectorAll('[data-iw-state]').forEach(el => { delete el.dataset.iwState; });
      document.querySelectorAll('[data-iw-hud-zone]').forEach(el => { delete el.dataset.iwHudZone; });
      document.querySelectorAll('[data-iw-hud-layout]').forEach(el => { delete el.dataset.iwHudLayout; });
      document.querySelectorAll('[data-iw-hud-player-text]').forEach(el => {
        delete el.dataset.iwHudPlayerText;
      });
    }
    
    function initUIFoundation() {
      inject('ui-system', css);
      on('iw:dom-flush', queueClassify);
      queueClassify();
    }
    
    
    exports.clearUIFoundation = clearUIFoundation;
    exports.initUIFoundation = initUIFoundation;
  };
  __modules["modules/aliases.js"] = (module, exports, require) => {
    /**
     * Cloak Material Aliases
     *
     * TEMPORARY — remove this file once the gear icon atlas / manifest is
     * updated in the GitHub repo to use the game's actual material names.
     *
     * The game's items.json uses short material names ("Mythril Cloak") but
     * the gear atlas manifest was built with an earlier, longer naming
     * convention ("Mythril Silk Cloak"). All 14 affected materials map
     * one-to-one — confirmed by diffing every Cloak-slot item in the game
     * API against every cloak entry in the gear manifest.
     *
     * Once the repo's manifest is regenerated with matching names, this
     * file and its one call site in AtlasService.js can be deleted.
     */
    
    // game material (lowercase) → atlas material (lowercase)
    const CLOAK_MATERIAL_ALIASES = {
      'abyssal':      'abyssal silk',
      'aether':       'aether silk',
      'astral':       'astral silk',
      'celestial':    'celestial silk',
      'dragonscale':  'dragonscale silk',
      'eternal':      'eternal weave',
      'glacial':      'glacial silk',
      'gravity':      'gravity weave',
      'mythril':      'mythril silk',
      'primordial':   'primordial weave',
      'regal':        'regal silk',
      'runic':        'runic thread',
      'void':         'void thread',
      'voidglass':    'voidglass silk',
    };
    
    // Matches: [optional prefix affix] [material] Cloak of [suffix]
    // Captures the material word so it can be swapped via the alias table.
    const CLOAK_PATTERN = /^((?:gilded|fortunate|nimble)\s+)?(\w+)(\s+cloak\s+of\s+.+)$/i;
    
    /**
     * Given an item name, return the atlas-equivalent name if it matches
     * the known cloak drift pattern, otherwise return the name unchanged.
     */
    function applyCloakAlias(name) {
      const match = CLOAK_PATTERN.exec(name);
      if (!match) return name;
    
      const [, prefix = '', material, suffix] = match;
      const aliased = CLOAK_MATERIAL_ALIASES[material.toLowerCase()];
      if (!aliased) return name;
    
      return `${prefix}${aliased}${suffix}`;
    }
    
    
    exports.applyCloakAlias = applyCloakAlias;
    exports.CLOAK_MATERIAL_ALIASES = CLOAK_MATERIAL_ALIASES;
  };
  __modules["modules/itemDisplay.js"] = (module, exports, require) => {
    function finite(value) {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    function effectNumber(text, pattern) {
      const match = pattern.exec(String(text || ''));
      if (!match) return null;
      const n = Number(match[1]);
      return Number.isFinite(n) ? n : null;
    }
    function fieldOrEffect(item, field, pattern) {
      const structured = finite(item?.[field]);
      if (structured !== null) return structured;
      return effectNumber(item?.effects_raw, pattern);
    }
    function deriveDisplayStats(item) {
      const text = item?.effects_raw || '';
      return {
        atk: fieldOrEffect(item, 'atk', /\bATK\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        def: fieldOrEffect(item, 'def', /\bDEF\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        hp: fieldOrEffect(item, 'hp', /\bHP\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        warfare: fieldOrEffect(item, 'warfare', /\bWarfare\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        xpPerTask: fieldOrEffect(item, 'xp_per_task', /\bXP\s*\+?\s*(-?\d+(?:\.\d+)?)\s*\/\s*task\b/i),
        doubleGatherPct: fieldOrEffect(item, 'double_gather_pct', /([+-]?\d+(?:\.\d+)?)%\s*(?:2x|2×)\s*gather(?:\s+chance)?\b/i),
        goldFindPct: fieldOrEffect(item, 'gold_find_pct', /([+-]?\d+(?:\.\d+)?)%\s*gold\s+find\b/i),
        itemFindPct: fieldOrEffect(item, 'item_find_pct', /([+-]?\d+(?:\.\d+)?)%\s*item\s+find\b/i),
        sockets: fieldOrEffect(item, 'sockets', /\b(\d+)\s+Sockets?\b/i),
        allResists: effectNumber(text, /\bAll\s+Resists?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        fireResist: effectNumber(text, /\bFire\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        frostResist: effectNumber(text, /\bFrost\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        lightningResist: effectNumber(text, /\bLightning\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
        bonusBrewPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Brew\b/i),
        bonusEnhancePct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enhance\b/i),
        bonusEnchantPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enchant\b/i),
      };
    }
    /**
     * itemDisplay
     *
     * Shared presentation helpers. Inventory rows and tooltip cards both derive
     * their display data here so a stat is labelled and coloured identically
     * wherever it appears.
     */
    
    const TIER_BANDS = [
      { max: 5,        cls: 'tier-common'    },
      { max: 11,       cls: 'tier-uncommon'  },
      { max: 17,       cls: 'tier-rare'      },
      { max: 23,       cls: 'tier-epic'      },
      { max: 29,       cls: 'tier-legendary' },
      { max: Infinity, cls: 'tier-mythic'    },
    ];
    
    function tierClass(item) {
      const t = Number(item && item.tier);
      if (!Number.isFinite(t)) return 'tier-common';
      return (TIER_BANDS.find(b => t <= b.max) || TIER_BANDS[0]).cls;
    }
    
    function slotLabel(item) {
      const sub = String((item && item.subcategory) || '').trim();
      return sub.replace(/\s+slot$/i, '');
    }
    
    function has(v) {
      return v !== undefined && v !== null && v !== '' && v !== 0;
    }
    
    /** Build the compact stat rail used by Inventory. */
    function statChips(item, opts = {}) {
      if (!item) return [];
      const max = opts.max || 5;
      const chips = [];
      const stats = deriveDisplayStats(item);
    
      const slot = slotLabel(item);
      const tier = has(item.tier) ? `Tier ${item.tier}` : '';
      const context = [tier, slot].filter(Boolean).join(' · ');
      if (context) chips.push({ text: context, kind: 'tier' });
    
      if (has(stats.atk))     chips.push({ text: `ATK +${stats.atk}`, kind: 'pos' });
      if (has(stats.def))     chips.push({ text: `DEF +${stats.def}`, kind: 'pos' });
      if (has(stats.hp))      chips.push({ text: `HP +${stats.hp}`, kind: 'pos' });
      if (has(stats.warfare)) chips.push({ text: `WAR +${stats.warfare}`, kind: 'pos' });
    
      if (has(stats.xpPerTask))      chips.push({ text: `XP +${stats.xpPerTask}`, kind: 'pos' });
      if (has(stats.doubleGatherPct)) chips.push({ text: `2× gather ${stats.doubleGatherPct}%`, kind: 'pos' });
      if (has(stats.goldFindPct))    chips.push({ text: `Gold +${stats.goldFindPct}%`, kind: 'pos' });
      if (has(stats.itemFindPct))    chips.push({ text: `Find +${stats.itemFindPct}%`, kind: 'pos' });
      if (has(stats.allResists)) {
        chips.push({ text: `All Resists +${stats.allResists}`, kind: 'pos' });
      } else {
        if (has(stats.fireResist)) chips.push({ text: `Fire Resist +${stats.fireResist}`, kind: 'pos' });
        if (has(stats.frostResist)) chips.push({ text: `Frost Resist +${stats.frostResist}`, kind: 'pos' });
        if (has(stats.lightningResist)) chips.push({ text: `Lightning Resist +${stats.lightningResist}`, kind: 'pos' });
      }
      if (has(stats.bonusBrewPct))    chips.push({ text: `Bonus Brew ${stats.bonusBrewPct}%`, kind: 'pos' });
      if (has(stats.bonusEnhancePct)) chips.push({ text: `Bonus Enhance ${stats.bonusEnhancePct}%`, kind: 'pos' });
      if (has(stats.bonusEnchantPct)) chips.push({ text: `Bonus Enchant ${stats.bonusEnchantPct}%`, kind: 'pos' });
    
      if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
        chips.push({ text: `${item.skill_bonus_skill} +${item.skill_bonus_value}`, kind: 'pos' });
      }
    
      if (has(stats.sockets)) {
        const n = Number(stats.sockets);
        chips.push({ text: n === 1 ? '1 socket' : `${n} sockets`, kind: 'plain' });
      }
    
      return chips.slice(0, max);
    }
    
    /** Full stat list used by the rich tooltip card. */
    function statRows(item) {
      if (!item) return [];
      const rows = [];
      const stats = deriveDisplayStats(item);
      const gold = value => `${Number(value).toLocaleString()}g`;
      if (has(stats.atk))     rows.push({ label: '⚔️ ATK', value: String(stats.atk) });
      if (has(stats.def))     rows.push({ label: '🛡️ DEF', value: String(stats.def) });
      if (has(stats.hp))      rows.push({ label: '❤️ HP', value: String(stats.hp) });
      if (has(stats.warfare)) rows.push({ label: '⚔️ Warfare', value: String(stats.warfare) });
      if (has(stats.xpPerTask))      rows.push({ label: '✨ XP/task', value: String(stats.xpPerTask) });
      if (has(stats.doubleGatherPct)) rows.push({ label: '🌿 2× Gather', value: `${stats.doubleGatherPct}%` });
      if (has(stats.goldFindPct))    rows.push({ label: '💰 Gold Find', value: `${stats.goldFindPct}%` });
      if (has(stats.itemFindPct))    rows.push({ label: '🔎 Item Find', value: `${stats.itemFindPct}%` });
      if (has(stats.allResists)) {
        rows.push({ label: '🜁 All Resists', value: `+${stats.allResists}` });
      } else {
        if (has(stats.fireResist)) rows.push({ label: '🔥 Fire Resist', value: `+${stats.fireResist}` });
        if (has(stats.frostResist)) rows.push({ label: '❄️ Frost Resist', value: `+${stats.frostResist}` });
        if (has(stats.lightningResist)) rows.push({ label: '⚡ Lightning Resist', value: `+${stats.lightningResist}` });
      }
      if (has(stats.bonusBrewPct)) rows.push({ label: 'Bonus Brew', value: `${stats.bonusBrewPct}%` });
      if (has(stats.bonusEnhancePct)) rows.push({ label: 'Bonus Enhance', value: `${stats.bonusEnhancePct}%` });
      if (has(stats.bonusEnchantPct)) rows.push({ label: 'Bonus Enchant', value: `${stats.bonusEnchantPct}%` });
      if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
        rows.push({ label: `✨ ${item.skill_bonus_skill}`, value: `+${item.skill_bonus_value}` });
      }
      if (has(stats.sockets)) rows.push({ label: '🔷 Sockets', value: String(stats.sockets) });
      if (has(item.work_order_turn_in_gold) && /work order/i.test(String(item.work_order_turn_in_note || ''))) {
        rows.push({ label: '📦 Work order', value: gold(item.work_order_turn_in_gold), cls: 'amber', note: String(item.work_order_turn_in_note || '').trim() });
      }
      if (has(item.base_value)) rows.push({ label: '💰 Base value', value: gold(item.base_value), cls: 'amber' });
      if (has(item.trader_token_value)) {
        const n = Number(item.trader_token_value);
        rows.push({ label: '🏷️ Turn-in', value: `${n} token${n === 1 ? '' : 's'}` });
      }
      return rows;
    }
    
    
    exports.deriveDisplayStats = deriveDisplayStats;
    exports.tierClass = tierClass;
    exports.slotLabel = slotLabel;
    exports.statChips = statChips;
    exports.statRows = statRows;
  };
  __modules["modules/normaliseItemName.js"] = (module, exports, require) => {
    /**
     * Shared item-name normalisation.
     *
     * ItemDatabase and AtlasService must agree on what constitutes the same
     * item name. Keeping this in one module prevents an icon resolving while
     * the corresponding database record silently fails to resolve.
     */
    function normaliseItemName(name) {
      let s = String(name == null ? '' : name).trim();
      try { s = s.normalize('NFKD'); } catch (e) {}
      return s
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
        .replace(/&/g, ' and ')
        .replace(/'/g, '')
        .replace(/\blv\.\s*/gi, 'lv ')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .toLowerCase();
    }
    
    
    exports.normaliseItemName = normaliseItemName;
  };
  __modules["styles/base.css"] = (module, exports, require) => {
    exports.default = "/* ══════════════════════════════════════════════════════════════════════\n   IdleWorlds Fantasy Skin — v1.5.1 \"Ashen Iron\" refinement\n\n   Visual goal: dense ARPG utility rather than rounded dashboard cards.\n   The palette borrows the material language of forged iron, soot, tarnished\n   brass and ember without copying any game's assets. Layout remains owned by\n   IdleWorlds/React; this layer standardises geometry, typography and surfaces.\n   ══════════════════════════════════════════════════════════════════════ */\n\n/* ── Typefaces ────────────────────────────────────────────────────────────\n   Self-hosted from the extension bundle. These used to come from a Google\n   Fonts @import, which had two problems:\n\n     1. An @import inside a content-script stylesheet is fetched by the PAGE\n        and is therefore subject to idleworlds.com's style-src / font-src CSP,\n        not to our host_permissions. A CSP tightening on the game's side would\n        silently drop every custom face.\n     2. It resolves asynchronously AFTER the rest of the sheet applies, so the\n        failure mode was intermittent and cache-dependent — the single most\n        likely reason the theme looked right on some loads and not others.\n\n   font-display: swap keeps text visible during load; the src paths resolve\n   against the extension root and are listed in web_accessible_resources.\n   Run `npm run vendor` to populate src/assets/fonts/. (Audit S1.2) */\n\n@font-face {\n  font-family: 'Cinzel';\n  font-style: normal;\n  font-weight: 600 700;\n  font-display: swap;\n  src: url('../assets/fonts/cinzel-variable.woff2') format('woff2');\n}\n\n@font-face {\n  font-family: 'Barlow';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url('../assets/fonts/barlow-400.woff2') format('woff2');\n}\n\n@font-face {\n  font-family: 'Barlow';\n  font-style: normal;\n  font-weight: 500;\n  font-display: swap;\n  src: url('../assets/fonts/barlow-500.woff2') format('woff2');\n}\n\n@font-face {\n  font-family: 'Barlow';\n  font-style: normal;\n  font-weight: 600;\n  font-display: swap;\n  src: url('../assets/fonts/barlow-600.woff2') format('woff2');\n}\n\n@font-face {\n  font-family: 'Barlow';\n  font-style: normal;\n  font-weight: 700;\n  font-display: swap;\n  src: url('../assets/fonts/barlow-700.woff2') format('woff2');\n}\n\n@font-face {\n  font-family: 'Crimson Text';\n  font-style: italic;\n  font-weight: 400;\n  font-display: swap;\n  src: url('../assets/fonts/crimson-text-italic.woff2') format('woff2');\n}\n\n:root {\n  /* Forged surfaces */\n  --iw-ink-950: #070806;\n  --iw-ink-900: #0B0C0A;\n  --iw-ink-850: #10100D;\n  --iw-ink-800: #14130F;\n  --iw-ink-750: #191711;\n  --iw-ink-700: #1E1B15;\n  --iw-ink-600: #29251C;\n\n  /* Brass / iron edges */\n  --iw-line:    #342D20;\n  --iw-line-hi: #58482B;\n  --iw-line-hot:#806337;\n\n  /* Accents */\n  --iw-gold:     #D4AD63;\n  --iw-gold-dim: #9D8458;\n  --iw-ember:    #B64619;\n  --iw-ember-hi: #D15A22;\n\n  /* Text */\n  --iw-text:   #DDD6C6;\n  --iw-text-hi:#F0E8D6;\n  --iw-dim:    #938A79;\n  --iw-faint:  #666052;\n\n  /* Semantic */\n  --iw-good: #82B88A;\n  --iw-bad:  #D27171;\n  --iw-info: #75A8C8;\n\n  /* Tier colours */\n  --iw-t-common:    #B9B4A8;\n  --iw-t-uncommon:  #6FBF73;\n  --iw-t-rare:      #5B9BD5;\n  --iw-t-epic:      #B98FE0;\n  --iw-t-legendary: #D98A3A;\n  --iw-t-mythic:    #E06666;\n\n  /* Typography */\n  --iw-font-head: 'Cinzel', Georgia, serif;\n  --iw-font-ui:   'Barlow', system-ui, -apple-system, sans-serif;\n  --iw-font-flav: 'Crimson Text', Georgia, serif;\n\n  /* Geometry — intentionally restrained. Round pills are not the house style. */\n  --iw-r-panel:   3px;\n  --iw-r-control: 2px;\n  --iw-r-slot:    2px;\n  --iw-r:         var(--iw-r-control);\n  --iw-r-sm:      var(--iw-r-slot);\n\n  /* Game theme tokens */\n  --background:          var(--iw-ink-900) !important;\n  --foreground:          var(--iw-text)    !important;\n  --card:                var(--iw-ink-800) !important;\n  --card-foreground:     var(--iw-text)    !important;\n  --popover:             var(--iw-ink-800) !important;\n  --popover-foreground:  var(--iw-text)    !important;\n  --panel-bg:            var(--iw-ink-800) !important;\n  --panel-border:        var(--iw-line)    !important;\n  --surface-bg:          var(--iw-ink-700) !important;\n  --surface-border:      var(--iw-line)    !important;\n  --primary:             var(--iw-ember)   !important;\n  --primary-foreground:  #FFEAD1           !important;\n  --accent:              var(--iw-ember)   !important;\n  --accent-foreground:   var(--iw-text-hi) !important;\n  --ring:                var(--iw-gold-dim)!important;\n  --border:              var(--iw-line)    !important;\n  --input:               var(--iw-ink-850) !important;\n  --muted:               var(--iw-ink-700) !important;\n  --muted-foreground:    var(--iw-dim)     !important;\n  --sidebar:             var(--iw-ink-800) !important;\n  --sidebar-foreground:  var(--iw-text)    !important;\n  --sidebar-border:      var(--iw-line)    !important;\n  --sidebar-accent:      var(--iw-ink-700) !important;\n}\n\nhtml,\nbody {\n  background-color: var(--iw-ink-900) !important;\n  color: var(--iw-text) !important;\n  font-family: var(--iw-font-ui) !important;\n}\n\nbody {\n  background-image:\n    radial-gradient(1200px 520px at 50% -140px, rgba(124, 91, 42, .10), transparent 68%),\n    linear-gradient(180deg, rgba(255,255,255,.012), transparent 220px) !important;\n  background-attachment: fixed !important;\n}\n\n/* Major semantic text. Item names remain Barlow via their own selectors. */\nh1, h2, h3 {\n  font-family: var(--iw-font-head) !important;\n  letter-spacing: .025em;\n  color: var(--iw-text-hi) !important;\n}\n\n/* ── Core surfaces ──────────────────────────────────────────────────── */\n\n.compact-panel,\n[class~=\"compact-panel\"] {\n  background:\n    linear-gradient(180deg, rgba(255,255,255,.018), transparent 48px),\n    var(--iw-ink-800) !important;\n  border-color: var(--iw-line) !important;\n  color: var(--iw-text) !important;\n  border-radius: var(--iw-r-panel) !important;\n  box-shadow:\n    inset 0 1px 0 rgba(255,255,255,.018),\n    inset 0 -1px 0 rgba(0,0,0,.42) !important;\n}\n\n.compact-row,\n[class*=\"item-row\"] {\n  background-color: var(--iw-ink-800) !important;\n  border-color: var(--iw-line) !important;\n  color: var(--iw-text) !important;\n}\n\n/* Tailwind's generous radii are a major source of the dashboard aesthetic.\n   Flatten the large/medium utility radii, while leaving rounded-full alone\n   for true status dots/avatars. Buttons receive their own stricter rule. */\n[class*=\"rounded-3xl\"],\n[class*=\"rounded-2xl\"],\n[class*=\"rounded-xl\"],\n[class*=\"rounded-lg\"],\n[class*=\"rounded-md\"] {\n  border-radius: var(--iw-r-panel) !important;\n}\n\nbutton:not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]),\n[role=\"button\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]) {\n  border-radius: var(--iw-r-control) !important;\n}\n\n/* ── Controls ───────────────────────────────────────────────────────── */\n\n/* Forged base colour for controls.\n   Deliberately ONE element-selector of specificity (0,0,1) and NOT !important:\n   any colour the game sets itself — a Tailwind bg-* utility, an inline style,\n   a cosmetic chat-name gradient — outranks this and still wins. It exists only\n   to catch buttons the game leaves unpainted, which previously fell through to\n   the user agent's light `buttonface` and rendered as a pale box with our dark\n   gradient laid over it. Found by build-tools/render-fixtures.mjs. */\nbutton,\n[role=\"button\"] {\n  background-color: var(--iw-ink-750);\n  color: var(--iw-text);\n}\n\nbutton:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]),\n[role=\"button\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]),\ninput,\nselect,\ntextarea {\n  font-family: var(--iw-font-ui) !important;\n}\n\nbutton:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]),\n[role=\"button\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]) {\n  box-shadow:\n    inset 0 1px 0 rgba(255,255,255,.028),\n    0 1px 0 rgba(0,0,0,.65) !important;\n  transition: color .12s ease, border-color .12s ease, background-color .12s ease, filter .12s ease !important;\n}\n\nbutton:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]):hover:not(:disabled),\n[role=\"button\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]):hover {\n  filter: brightness(1.08);\n}\n\nbutton:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]):focus-visible,\n[role=\"button\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]):focus-visible,\ninput:focus-visible,\nselect:focus-visible,\ntextarea:focus-visible {\n  outline: 1px solid var(--iw-gold) !important;\n  outline-offset: 2px !important;\n}\n\ninput:not([type=\"checkbox\"]):not([type=\"radio\"]),\nselect,\ntextarea {\n  border-radius: var(--iw-r-control) !important;\n  border-color: var(--iw-line) !important;\n  background: linear-gradient(180deg, #090C0D, #0C0E0D) !important;\n  color: var(--iw-text) !important;\n  box-shadow:\n    inset 0 1px 4px rgba(0,0,0,.7),\n    0 1px 0 rgba(255,255,255,.018) !important;\n}\n\ninput::placeholder,\ntextarea::placeholder {\n  color: var(--iw-faint) !important;\n}\n\n/* Main nav/tabs often arrive as heavily rounded buttons. Keep their native\n   selected colour, but make the rail read like game tabs instead of pills. */\nnav button,\nnav [role=\"button\"],\nheader button:not([class*=\"chat-name-\"]),\n[class*=\"tab\"] button {\n  border-radius: var(--iw-r-control) !important;\n  font-weight: 700 !important;\n}\n\nhr {\n  border-color: var(--iw-line) !important;\n}\n\n/* ── Shared icon slot ───────────────────────────────────────────────── */\n\n.iw-ico {\n  flex: none;\n  display: block;\n  position: relative;\n  background-repeat: no-repeat;\n  background-color: #090806;\n  border: 1px solid var(--iw-line-hi);\n  border-radius: var(--iw-r-slot);\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,.45);\n}\n\n.iw-icon-badge {\n  position: absolute;\n  right: -3px;\n  bottom: -3px;\n  font-family: var(--iw-font-ui);\n  font-size: 9px;\n  font-weight: 700;\n  line-height: 1;\n  padding: 2px 3px;\n  border-radius: 1px;\n  background: var(--iw-ink-950);\n  border: 1px solid var(--iw-ember);\n  color: var(--iw-gold);\n  font-variant-numeric: tabular-nums;\n  pointer-events: none;\n}\n\n/* ── Tier colours ───────────────────────────────────────────────────── */\n\n.tier-common    { color: var(--iw-t-common); }\n.tier-uncommon  { color: var(--iw-t-uncommon); }\n.tier-rare      { color: var(--iw-t-rare); }\n.tier-epic      { color: var(--iw-t-epic); }\n.tier-legendary { color: var(--iw-t-legendary); }\n.tier-mythic    { color: var(--iw-t-mythic); }\n\n/* ── Extension-owned button primitive ───────────────────────────────── */\n\n.iw-btn {\n  font-family: var(--iw-font-ui);\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: .055em;\n  text-transform: uppercase;\n  padding: 7px 14px;\n  min-width: 76px;\n  border-radius: var(--iw-r-control);\n  cursor: pointer;\n  border: 1px solid var(--iw-line-hi);\n  background: linear-gradient(180deg, #242018, #17140F);\n  color: var(--iw-text);\n  transition: background .13s, border-color .13s, color .13s;\n  align-self: center;\n  height: auto;\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 1px 0 #000;\n}\n.iw-btn:hover {\n  background: linear-gradient(180deg, #2B261C, #1A1711);\n  border-color: var(--iw-gold-dim);\n  color: var(--iw-gold);\n}\n.iw-btn--primary {\n  background: linear-gradient(180deg, #A94318, #742A0D);\n  border-color: #C05A28;\n  color: #FFEAD1;\n}\n.iw-btn--primary:hover {\n  background: linear-gradient(180deg, #C04D1C, #87310E);\n  border-color: var(--iw-ember-hi);\n  color: #fff;\n}\n.iw-btn--disabled,\n.iw-btn:disabled {\n  background: #100F0C;\n  border-color: #282218;\n  color: var(--iw-faint);\n  cursor: not-allowed;\n  box-shadow: none;\n}\n\n/* ── Progress / XP primitive ────────────────────────────────────────── */\n\n.iw-xp { display:flex; flex-direction:column; gap:4px; }\n.iw-xp__line {\n  display:flex;\n  align-items:baseline;\n  gap:8px;\n  font-size:12px;\n  font-family:var(--iw-font-ui);\n}\n.iw-xp__pct  { color:var(--iw-gold); font-weight:700; font-variant-numeric:tabular-nums; }\n.iw-xp__togo { margin-left:auto; color:var(--iw-faint); font-variant-numeric:tabular-nums; }\n.iw-xp__track {\n  height:4px;\n  background:#080806;\n  border:1px solid #272117;\n  border-radius:0;\n  overflow:hidden;\n  box-shadow: inset 0 1px 2px rgba(0,0,0,.75);\n}\n.iw-xp__fill  { height:100%; background:linear-gradient(90deg,#7B3515,var(--iw-ember)); transition:width .3s ease; }\n.iw-xp__fill--ready { background:linear-gradient(90deg,#2E6438,#4D9859); }\n\n/* ── Scrollbars ─────────────────────────────────────────────────────── */\n\n::-webkit-scrollbar { width: 7px; height: 7px; }\n::-webkit-scrollbar-track { background: var(--iw-ink-950); }\n::-webkit-scrollbar-thumb { background: #403625; border-radius: 1px; }\n::-webkit-scrollbar-thumb:hover { background: var(--iw-line-hi); }\n\n@media (prefers-reduced-motion: reduce) {\n  * { transition:none !important; animation:none !important; }\n}\n\n/* Padded rounded-full elements are almost always pills/tabs/status readouts,\n   not true circular glyphs. Flatten them while preserving tiny round dots. */\n[class*=\"rounded-full\"][class*=\"px-\"],\nbutton[class*=\"rounded-full\"]:not([class*=\"chat-name-\"]),\n[role=\"button\"][class*=\"rounded-full\"]:not([class*=\"chat-name-\"]) {\n  border-radius: var(--iw-r-control) !important;\n}\n\n/* Bordered large-radius frames get the same forged edge treatment even when\n   they are not .compact-panel (top HUD, inventory shell, market, leaderboard). */\n[class*=\"border\"][class*=\"rounded-3xl\"],\n[class*=\"border\"][class*=\"rounded-2xl\"],\n[class*=\"border\"][class*=\"rounded-xl\"] {\n  border-color: var(--iw-line) !important;\n  box-shadow:\n    inset 0 1px 0 rgba(255,255,255,.018),\n    inset 0 -1px 0 rgba(0,0,0,.38) !important;\n}\n";
  };
  __modules["styles/inventory.css"] = (module, exports, require) => {
    exports.default = "/* ══════════════════════════════════════════════════════════════════════\n   Inventory / ItemRow — v1.5.10\n\n   Inventory is the reference implementation for reusable RPG item rows.\n   React-owned commands remain live DOM nodes; the Fantasy Skin owns the\n   item presentation and semantic action treatment only.\n   ══════════════════════════════════════════════════════════════════════ */\n\n/* ── Inventory chrome ─────────────────────────────────────────────── */\n[data-iw-inventory-root=\"1\"] {\n  --fs-inv-command-w: 54px;\n}\n\n[data-iw-inventory-title=\"1\"] {\n  /* --iw-font-display was never defined in base.css (only --iw-font-head,\n     --iw-font-ui and --iw-font-flav), so this declaration was invalid at\n     computed-value time and the Inventory title silently inherited whatever\n     the game was using. (Audit S3.1) */\n  font-family: var(--iw-font-head) !important;\n  font-size: 16px !important;\n  font-weight: 700 !important;\n  letter-spacing: .045em !important;\n  text-transform: uppercase !important;\n  color: var(--iw-text) !important;\n}\n\n[data-iw-inventory-root=\"1\"] [data-iw-inventory-control=\"filter\"],\n[data-iw-inventory-root=\"1\"] [data-iw-inventory-control=\"page\"] {\n  min-height: 28px !important;\n  height: 28px !important;\n  border-radius: 2px !important;\n  padding: 0 10px !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11px !important;\n  font-weight: 700 !important;\n  line-height: 26px !important;\n  letter-spacing: .015em !important;\n}\n\n[data-iw-inventory-root=\"1\"] [data-iw-inventory-control=\"icon\"] {\n  width: 28px !important;\n  height: 28px !important;\n  min-width: 28px !important;\n  min-height: 28px !important;\n  padding: 0 !important;\n  border-radius: 2px !important;\n}\n\n[data-iw-inventory-root=\"1\"] [data-iw-inventory-control=\"page-count\"] {\n  color: var(--iw-faint) !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 10px !important;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: .08em;\n}\n\n/* ── Row shell ────────────────────────────────────────────────────── */\n.compact-row:has(> .fs-inv-row),\n[class*=\"item-row\"]:has(> .fs-inv-row) {\n  display: flex !important;\n  align-items: center !important;\n  gap: 0 !important;\n  min-height: 62px !important;\n  padding: 0 !important;\n  position: relative !important;\n  overflow: hidden !important;\n  border: 1px solid var(--iw-line) !important;\n  border-radius: 3px !important;\n  background:\n    linear-gradient(180deg, rgba(255,255,255,.014), transparent 38%),\n    #12110E !important;\n  box-shadow:\n    inset 0 1px 0 rgba(255,255,255,.014),\n    inset 0 -1px 0 rgba(0,0,0,.35) !important;\n  transition: border-color .12s, background-color .12s !important;\n}\n\n.compact-row:has(> .fs-inv-row):hover,\n[class*=\"item-row\"]:has(> .fs-inv-row):hover {\n  border-color: #4B402B !important;\n  background:\n    linear-gradient(90deg, rgba(232,183,106,.025), transparent 32%),\n    #14120F !important;\n}\n\n.fs-inv-row {\n  --fs-tier: var(--iw-t-common);\n  order: 1;\n  flex: 1 1 auto;\n  min-width: 0;\n  min-height: 60px;\n  box-sizing: border-box;\n  display: grid;\n  grid-template-columns: 52px minmax(0, 1fr) 38px;\n  grid-template-areas: \"icon body qty\";\n  align-items: center;\n  column-gap: 11px;\n  padding: 6px 8px 6px 13px;\n  position: relative;\n  cursor: default;\n}\n.fs-inv-row.has-details,\n.fs-inv-row.has-requirements { min-height: 68px; }\n.fs-inv-row.has-details.has-requirements { min-height: 76px; }\n\n.fs-inv-row.tier-uncommon  { --fs-tier: var(--iw-t-uncommon); }\n.fs-inv-row.tier-rare      { --fs-tier: var(--iw-t-rare); }\n.fs-inv-row.tier-epic      { --fs-tier: var(--iw-t-epic); }\n.fs-inv-row.tier-legendary { --fs-tier: var(--iw-t-legendary); }\n.fs-inv-row.tier-mythic    { --fs-tier: var(--iw-t-mythic); }\n\n.fs-inv-row::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 8px;\n  bottom: 8px;\n  width: 2px;\n  background: var(--fs-tier);\n  opacity: .82;\n  pointer-events: none;\n}\n\n/* ── Icon slot ────────────────────────────────────────────────────── */\n.fs-inv-icon {\n  grid-area: icon;\n  width: 52px;\n  height: 52px;\n  min-width: 52px;\n  min-height: 52px;\n  position: relative;\n  background-repeat: no-repeat;\n  background-color: #080806;\n  border: 1px solid #3A3020;\n  border-radius: 2px;\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.62),\n    inset 0 0 14px rgba(0,0,0,.5);\n  image-rendering: auto;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 18px;\n  color: var(--iw-faint);\n  overflow: hidden;\n  cursor: help;\n  outline: none;\n}\n.fs-inv-icon:hover,\n.fs-inv-icon:focus-visible {\n  border-color: var(--fs-tier);\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.62),\n    inset 0 0 14px rgba(0,0,0,.5),\n    0 0 0 1px color-mix(in srgb, var(--fs-tier) 22%, transparent);\n}\n.fs-inv-row.is-equipped .fs-inv-icon {\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.62),\n    inset 0 0 14px rgba(0,0,0,.5),\n    0 0 0 1px rgba(80,150,94,.18);\n}\n\n/* ── Identity / information rails ────────────────────────────────── */\n.fs-inv-body {\n  grid-area: body;\n  min-width: 0;\n  max-width: 100%;\n  overflow: hidden;\n  align-self: center;\n  padding-block: 1px;\n}\n\n.fs-inv-name {\n  display: -webkit-box;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n  line-clamp: 2;\n  font-family: var(--iw-font-ui);\n  font-size: 13px;\n  font-weight: 700;\n  line-height: 1.18;\n  letter-spacing: .005em;\n  white-space: normal;\n  overflow: hidden;\n  overflow-wrap: anywhere;\n  text-overflow: ellipsis;\n  text-shadow: 0 1px 0 #000;\n}\n.fs-inv-name .fs-inv-sub {\n  color: var(--iw-faint);\n  font-size: 11px;\n  font-weight: 600;\n}\n.fs-inv-name-plain { color: var(--iw-text); }\n.fs-inv-name .iw-item-ref { color: inherit; }\n.fs-inv-name .iw-item-ref:hover,\n.fs-inv-name .iw-item-ref:focus-visible { border-bottom-color: currentColor; }\n\n/* Stable database information: one compact rail, no boxed stat chips. */\n.fs-inv-stats {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 0;\n  margin-top: 3px;\n  min-height: 13px;\n}\n.fs-stat {\n  position: relative;\n  font-family: var(--iw-font-ui);\n  font-size: 10px;\n  line-height: 1.25;\n  font-weight: 600;\n  color: var(--iw-dim);\n  background: none;\n  border: 0;\n  border-radius: 0;\n  padding: 0 7px 0 0;\n  margin-right: 7px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.fs-stat:not(:last-child)::after {\n  content: \"\";\n  position: absolute;\n  right: 0;\n  top: 2px;\n  bottom: 1px;\n  width: 1px;\n  background: #332C1E;\n}\n.fs-stat--pos  { color: var(--iw-good); }\n.fs-stat--tier { color: var(--iw-gold-dim); }\n\n/* Dynamic owned-item state. These lines deliberately look like equipment\n   inscriptions, not application badges. */\n.fs-inv-details,\n.fs-inv-requirements {\n  display: flex;\n  min-width: 0;\n  max-width: 100%;\n  overflow: hidden;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 3px 12px;\n  margin-top: 3px;\n  font-family: var(--iw-font-ui);\n  font-size: 9.5px;\n  line-height: 1.25;\n}\n\n.fs-inv-detail,\n.fs-inv-requirement {\n  position: relative;\n  min-width: 0;\n  color: var(--iw-dim);\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.fs-inv-detail::before,\n.fs-inv-requirement::before {\n  content: \"◆\";\n  margin-right: 4px;\n  font-size: 6px;\n  vertical-align: 1px;\n  color: var(--iw-gold-dim);\n}\n.fs-inv-detail--loadout { color: #74AFCB; }\n.fs-inv-detail--loadout::before { color: #5D97B3; }\n.fs-inv-detail--socket { color: #C7B56A; }\n.fs-inv-detail--socket::before { color: #73B7D4; }\n.fs-inv-detail--effect { color: #B8C6A2; }\n.fs-inv-detail--effect::before { color: #879A73; }\n.fs-inv-detail--status { color: var(--iw-faint); }\n.fs-inv-detail--status::before { color: var(--iw-faint); }\n.fs-inv-detail--set { color: #C8B562; }\n.fs-inv-requirement { color: #D8C76A; }\n.fs-inv-requirement::before { color: #BCA744; }\n.fs-inv-detail-count {\n  margin-left: 4px;\n  color: var(--iw-faint);\n  font-variant-numeric: tabular-nums;\n}\n\n.fs-inv-qty {\n  grid-area: qty;\n  justify-self: end;\n  align-self: center;\n  min-width: 34px;\n  padding-right: 2px;\n  text-align: right;\n  font-family: var(--iw-font-ui);\n  font-size: 11px;\n  font-weight: 700;\n  color: var(--iw-dim);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n/* ── React-owned action rail ─────────────────────────────────────── */\n[data-fs-action-host=\"1\"] {\n  display: contents !important;\n  font-size: 0 !important;\n  line-height: 0 !important;\n  color: transparent !important;\n}\n[data-fs-suppressed=\"1\"] { display: none !important; }\n\n[data-fs-preserved-action=\"control\"] {\n  order: 2;\n  flex: 0 0 auto !important;\n  align-self: center !important;\n  position: relative;\n  z-index: 2;\n  margin: 0 5px 0 0 !important;\n  min-width: 0 !important;\n  max-width: none !important;\n}\n\nbutton[data-fs-preserved-action=\"control\"],\na[data-fs-preserved-action=\"control\"],\n[role=\"button\"][data-fs-preserved-action=\"control\"] {\n  height: 28px !important;\n  min-height: 28px !important;\n  padding: 0 8px !important;\n  border-radius: 2px !important;\n  border: 1px solid var(--iw-line-hi) !important;\n  background: linear-gradient(180deg, #201D17, #15130F) !important;\n  color: var(--iw-text) !important;\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 1px 0 #000 !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 10px !important;\n  line-height: 26px !important;\n  font-weight: 700 !important;\n  letter-spacing: .025em !important;\n  text-transform: none !important;\n  white-space: nowrap !important;\n}\nbutton[data-fs-preserved-action=\"control\"]:hover:not(:disabled),\na[data-fs-preserved-action=\"control\"]:hover,\n[role=\"button\"][data-fs-preserved-action=\"control\"]:hover {\n  border-color: var(--iw-gold-dim) !important;\n  color: var(--iw-gold) !important;\n  background: linear-gradient(180deg, #29241A, #19160F) !important;\n}\n\n[data-fs-action-kind=\"equipped\"] {\n  width: 70px !important;\n  border-color: #315E3A !important;\n  background: linear-gradient(180deg, #193520, #102518) !important;\n  color: #A9D7AF !important;\n}\n[data-fs-action-kind=\"equip\"] {\n  width: 48px !important;\n  border-color: #5A4728 !important;\n  color: #E1C48A !important;\n}\n[data-fs-action-kind=\"set\"] {\n  width: 72px !important;\n  color: #D1C06C !important;\n  border-color: #514621 !important;\n}\n[data-fs-action-kind=\"secondary\"] { width: 44px !important; }\n[data-fs-action-kind=\"icon\"] {\n  width: 28px !important;\n  min-width: 28px !important;\n  padding: 0 !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  line-height: 1 !important;\n}\n\nbutton[data-fs-preserved-action=\"control\"]:disabled,\n[role=\"button\"][data-fs-preserved-action=\"control\"][aria-disabled=\"true\"] {\n  opacity: .42 !important;\n  color: var(--iw-faint) !important;\n  border-color: var(--iw-line) !important;\n  background: #12110E !important;\n}\n\n/* ── Responsive collapse ─────────────────────────────────────────── */\n@media (max-width: 900px) {\n  .fs-inv-row {\n    grid-template-columns: 46px minmax(0, 1fr) 34px;\n    min-height: 56px;\n    padding-left: 10px;\n    column-gap: 9px;\n  }\n  .fs-inv-icon { width: 46px; height: 46px; min-width: 46px; min-height: 46px; }\n  .fs-inv-stats .fs-stat:nth-child(n+6) { display: none; }\n  .fs-inv-details { max-height: 26px; overflow: hidden; }\n}\n\n@media (max-width: 700px) {\n  .compact-row:has(> .fs-inv-row),\n  [class*=\"item-row\"]:has(> .fs-inv-row) {\n    flex-wrap: wrap !important;\n    align-items: center !important;\n    padding-bottom: 5px !important;\n  }\n  .fs-inv-row {\n    flex: 1 0 100%;\n    grid-template-columns: 42px minmax(0, 1fr) 34px;\n    grid-template-areas: \"icon body qty\";\n  }\n  .fs-inv-icon { width: 42px; height: 42px; min-width: 42px; min-height: 42px; }\n  .fs-inv-qty { justify-self: end; padding: 0 2px 0 0; text-align: right; }\n  .fs-inv-stats .fs-stat:nth-child(n+4) { display: none; }\n  .fs-inv-details,\n  .fs-inv-requirements {\n    display: flex;\n    max-height: none;\n    overflow: visible;\n    gap: 2px 8px;\n    font-size: 9px;\n  }\n  .fs-inv-detail,\n  .fs-inv-requirement {\n    white-space: normal;\n    overflow: visible;\n    text-overflow: clip;\n  }\n  [data-fs-preserved-action=\"control\"] {\n    margin-top: 3px !important;\n  }\n  button[data-fs-preserved-action=\"control\"],\n  a[data-fs-preserved-action=\"control\"],\n  [role=\"button\"][data-fs-preserved-action=\"control\"] {\n    padding-inline: 6px !important;\n  }\n}\n";
  };
  __modules["styles/skillpanel.css"] = (module, exports, require) => {
    exports.default = "/* ══════════════════════════════════════════════════════════════════════\n   Skill panels — v1.5.1 compact action frame\n\n   The panel is a dense RPG action row, not a metric card. Native gameplay DOM\n   remains intact; semantic role attributes provide deterministic alignment.\n   ══════════════════════════════════════════════════════════════════════ */\n\n.fs-skill--combat    { --fs-skill-accent: #B84A20; }\n.fs-skill--mining    { --fs-skill-accent: #84919B; }\n.fs-skill--smithing  { --fs-skill-accent: #B28A2A; }\n.fs-skill--gathering { --fs-skill-accent: #579A5D; }\n.fs-skill--alchemy   { --fs-skill-accent: #9271B2; }\n.fs-skill--jewelcrafting { --fs-skill-accent: #4E9FB8; }\n.fs-skill--spellcrafting { --fs-skill-accent: #8B6FC3; }\n.fs-skill--tailoring { --fs-skill-accent: #A56E86; }\n.fs-skill--crafting  { --fs-skill-accent: #5E8FB7; }\n.fs-skill--fishing   { --fs-skill-accent: #478FA8; }\n\n.compact-panel.fs-skill-panel {\n  position: relative !important;\n  min-height: 0 !important;\n  margin-bottom: 6px !important;\n  padding-top: 8px !important;\n  padding-bottom: 8px !important;\n  background:\n    linear-gradient(90deg, color-mix(in srgb, var(--fs-skill-accent) 4%, transparent), transparent 28%),\n    linear-gradient(180deg, rgba(255,255,255,.010), transparent 34px),\n    #12110E !important;\n  border: 1px solid #392F21 !important;\n  border-left: 2px solid var(--fs-skill-accent, var(--iw-line-hi)) !important;\n  border-radius: 3px !important;\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.38),\n    inset 0 1px 0 rgba(255,255,255,.012),\n    inset 0 -1px 0 rgba(0,0,0,.44) !important;\n}\n\n.compact-panel.fs-skill-panel::before {\n  content: \"\";\n  position: absolute;\n  z-index: 0;\n  pointer-events: none;\n  left: 0;\n  top: 0;\n  width: 64px;\n  height: 1px;\n  background: linear-gradient(90deg, var(--iw-gold), var(--iw-line-hot) 62%, transparent);\n  opacity: .78;\n}\n\n/* v1.5.0 used a large watermark glyph here. It fought with the information\n   hierarchy, so the pseudo-element is intentionally disabled. */\n.compact-panel.fs-skill-panel::after { content: none !important; }\n\n.fs-skill-wrapper { display: contents !important; }\n.fs-skill-header { display: none !important; }\n\n/* Strict alignment only when the renderer proves three existing top-level\n   zones: skill identity, action content and commands. */\n.compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] {\n  display: grid !important;\n  grid-template-columns: 96px minmax(0, 1fr) 126px !important;\n  grid-template-areas: \"identity content commands\" !important;\n  gap: 0 14px !important;\n  align-items: center !important;\n  padding: 8px 12px !important;\n}\n\n.compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] > [data-iw-skill-zone=\"identity\"] {\n  grid-area: identity !important;\n  min-width: 0 !important;\n}\n.compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] > [data-iw-skill-zone=\"content\"] {\n  grid-area: content !important;\n  min-width: 0 !important;\n}\n.compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] > [data-iw-skill-zone=\"commands\"] {\n  grid-area: commands !important;\n  min-width: 0 !important;\n  justify-self: stretch !important;\n}\n\n/* ── Skill information hierarchy ────────────────────────────────────── */\n[data-iw-skill-role=\"identity\"] {\n  position: relative !important;\n  min-width: 78px !important;\n  color: var(--iw-text-hi) !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 12.5px !important;\n  font-weight: 700 !important;\n  line-height: 1.18 !important;\n  letter-spacing: .015em !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n\n[data-iw-skill-role=\"identity\"]::after {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  right: 28%;\n  bottom: -5px;\n  height: 1px;\n  background: linear-gradient(90deg, var(--fs-skill-accent), transparent);\n  opacity: .34;\n}\n\n[data-iw-skill-role=\"action-title\"] {\n  color: var(--iw-text-hi) !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 16.5px !important;\n  line-height: 1.1 !important;\n  font-weight: 700 !important;\n  letter-spacing: 0 !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n\n/* XP readout is data, never a callout card. */\n[data-iw-skill-role=\"level-progress\"] {\n  display: block !important;\n  width: auto !important;\n  max-width: none !important;\n  min-width: 0 !important;\n  min-height: 0 !important;\n  height: auto !important;\n  margin: 3px 0 0 !important;\n  padding: 0 !important;\n  color: #B7AF9F !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11.5px !important;\n  line-height: 1.2 !important;\n  font-weight: 600 !important;\n  font-variant-numeric: tabular-nums !important;\n  letter-spacing: .01em !important;\n  text-transform: none !important;\n  border: 0 !important;\n  outline: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  background-image: none !important;\n  box-shadow: none !important;\n}\n\n[data-iw-skill-role=\"xp-gain\"] {\n  display: inline-block !important;\n  margin-top: 2px !important;\n  color: var(--iw-gold-dim) !important;\n  font-size: 10.5px !important;\n  line-height: 1.15 !important;\n  font-weight: 700 !important;\n  font-variant-numeric: tabular-nums !important;\n}\n\n[data-iw-skill-role=\"requirement\"] {\n  margin-top: 2px !important;\n  color: #D58282 !important;\n  font-size: 10.8px !important;\n  line-height: 1.15 !important;\n  font-weight: 600 !important;\n}\n\n[data-iw-skill-role=\"reward\"] {\n  margin-top: 2px !important;\n  color: #AAA291 !important;\n  font-size: 10.8px !important;\n  line-height: 1.15 !important;\n}\n\n[data-iw-skill-role=\"action-detail\"] {\n  margin-top: 3px !important;\n  color: #C7C0B2 !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11.5px !important;\n  line-height: 1.2 !important;\n  font-weight: 500 !important;\n  letter-spacing: 0 !important;\n}\n\n[data-iw-skill-role=\"ingredient\"] {\n  display: inline-flex !important;\n  align-items: baseline !important;\n  gap: 5px !important;\n  margin-top: 3px !important;\n  padding: 0 !important;\n  color: var(--iw-dim) !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  background-image: none !important;\n  box-shadow: none !important;\n}\n\n.compact-panel.fs-skill-panel .iw-item-ref {\n  color: #C9B17A !important;\n  font-weight: 700 !important;\n  letter-spacing: .015em !important;\n  text-transform: uppercase !important;\n  border-bottom-color: rgba(201,177,122,.20) !important;\n}\n\n/* ── Progress rail ──────────────────────────────────────────────────── */\n[data-iw-skill-role=\"progress-track\"] {\n  height: 4px !important;\n  min-height: 4px !important;\n  max-height: 4px !important;\n  margin-top: 5px !important;\n  overflow: hidden !important;\n  border: 1px solid #29241B !important;\n  border-radius: 0 !important;\n  background: #080806 !important;\n  box-shadow: inset 0 1px 2px rgba(0,0,0,.80) !important;\n}\n\n[data-iw-skill-role=\"progress-fill\"] {\n  height: 100% !important;\n  border-radius: 0 !important;\n  background: linear-gradient(90deg, color-mix(in srgb, var(--fs-skill-accent) 68%, #5F2914), var(--fs-skill-accent)) !important;\n  box-shadow: none !important;\n}\n\n/* Existing readout/ingredient shells are data, not boxed controls. */\n/* Metric shells in the live skill panel may draw their frame with pseudo\n   elements rather than the element's own border/background. Kill those only on\n   the positively identified XP readout branch. */\n.compact-panel.fs-skill-panel [data-iw-readout]::before,\n.compact-panel.fs-skill-panel [data-iw-readout]::after {\n  content: none !important;\n  display: none !important;\n  border: 0 !important;\n  background: none !important;\n  box-shadow: none !important;\n}\n\n[data-iw-readout],\n[data-iw-ingr] {\n  width: auto !important;\n  max-width: none !important;\n  min-width: 0 !important;\n  min-height: 0 !important;\n  height: auto !important;\n  max-height: none !important;\n  margin: 0 !important;\n  background: transparent !important;\n  background-color: transparent !important;\n  background-image: none !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  outline: 0 !important;\n  padding: 0 !important;\n  box-shadow: none !important;\n  cursor: default !important;\n}\n\n/* The live game nests the XP text inside several same-text shells. Every shell\n   is now marked/neutralised by the renderer; keep their typography inherited so\n   an inner Tailwind text class cannot recreate the large metric-card look. */\n.compact-panel.fs-skill-panel [data-iw-readout] {\n  color: #B7AF9F !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11.5px !important;\n  line-height: 1.18 !important;\n  font-weight: 600 !important;\n  letter-spacing: .01em !important;\n  text-transform: none !important;\n}\n\n.compact-panel.fs-skill-panel [data-iw-skill-role=\"level-progress\"] {\n  margin-top: 2px !important;\n}\n\n/* ── Command rail ───────────────────────────────────────────────────── */\n[data-iw-skill-role=\"nav-group\"] {\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: flex-end !important;\n  gap: 4px !important;\n}\n\n.compact-panel.fs-skill-panel button:not([data-iw-skill-role=\"level-progress\"]) {\n  align-self: center !important;\n  border-radius: 2px !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"nav-button\"] {\n  width: 30px !important;\n  min-width: 30px !important;\n  height: 30px !important;\n  min-height: 30px !important;\n  padding: 0 !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"action-button\"] {\n  width: 96px !important;\n  min-width: 96px !important;\n  height: 34px !important;\n  min-height: 34px !important;\n  justify-content: center !important;\n  letter-spacing: .07em !important;\n}\n\n/* CSS fallbacks for the button skins SkillPanelRenderer also writes inline.\n   The inline copies exist because React re-asserts its own geometry during\n   updates; these exist because the inline copies are only present once the\n   renderer has run. Without them a panel renders its commands as bare controls\n   between mount and first reconcile — pale boxes with near-invisible labels.\n   Keep the two in sync with BUTTON_STYLES in SkillPanelRenderer.js. */\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"action-button\"],\n.compact-panel.fs-skill-panel button[data-iw-btn-state=\"primary\"] {\n  background: linear-gradient(180deg, #A94318, #742A0D) !important;\n  border: 1px solid #C05A28 !important;\n  color: #FFEAD1 !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 12px !important;\n  font-weight: 700 !important;\n  letter-spacing: .06em !important;\n  text-transform: uppercase !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"nav-button\"],\n.compact-panel.fs-skill-panel button[data-iw-btn-state=\"secondary\"],\n.compact-panel.fs-skill-panel button[data-iw-btn-state=\"icon\"] {\n  background: linear-gradient(180deg, #242018, #17140F) !important;\n  border: 1px solid #58482B !important;\n  color: #DAD3C3 !important;\n  font-family: var(--iw-font-ui) !important;\n  font-weight: 700 !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"action-button\"]:hover:not(:disabled) {\n  background: linear-gradient(180deg, #C04D1C, #87310E) !important;\n  border-color: var(--iw-ember-hi) !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-btn-state=\"primary\"] {\n  color: #FFE8CE !important;\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 1px 0 #000 !important;\n}\n\n.compact-panel.fs-skill-panel button[data-iw-btn-state=\"disabled\"] {\n  opacity: .94 !important;\n  color: #8E8676 !important;\n  background: #15130F !important;\n  border-color: #3A3022 !important;\n  filter: none !important;\n}\n\n/* Existing direct React branches get deterministic roles without reparenting. */\n.compact-panel.fs-skill-panel > [data-iw-skill-zone=\"identity\"] {\n  align-self: stretch !important;\n  display: flex !important;\n  flex-direction: column !important;\n  justify-content: center !important;\n}\n.compact-panel.fs-skill-panel > [data-iw-skill-zone=\"content\"] {\n  min-width: 0 !important;\n}\n.compact-panel.fs-skill-panel > [data-iw-skill-zone=\"commands\"] {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: flex-end !important;\n  justify-content: center !important;\n  gap: 5px !important;\n}\n\n.compact-panel.fs-skill-panel [data-iw-readout] {\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11.5px !important;\n  line-height: 1.18 !important;\n  font-weight: 500 !important;\n  color: #B7AF9F !important;\n  letter-spacing: normal !important;\n  text-transform: none !important;\n}\n.compact-panel.fs-skill-panel [data-iw-ingr] {\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11px !important;\n  line-height: 1.15 !important;\n  color: var(--iw-dim) !important;\n  letter-spacing: normal !important;\n  text-transform: none !important;\n}\n\n@media (max-width: 800px) {\n  .compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] {\n    grid-template-columns: 82px minmax(0, 1fr) 112px !important;\n    gap: 0 8px !important;\n    padding-inline: 8px !important;\n  }\n  .compact-panel.fs-skill-panel button[data-iw-skill-role=\"action-button\"] {\n    width: 88px !important;\n    min-width: 88px !important;\n  }\n  [data-iw-skill-role=\"action-title\"] { font-size: 15px !important; }\n}\n\n/* v1.5.3 hard fallback: an identified XP branch must never retain native card\n   geometry, even when the game adds a new utility class to an intermediate\n   wrapper. */\n.compact-panel.fs-skill-panel [data-iw-readout] {\n  display: block !important;\n  position: static !important;\n  float: none !important;\n  transform: none !important;\n  filter: none !important;\n  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n  clip-path: none !important;\n}\n\n/* Phone layout: keep commands immediately reachable while giving action content\n   the full second row. This replaces the cramped three-column phone layout. */\n@media (max-width: 520px) {\n  .compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] {\n    grid-template-columns: minmax(0, 1fr) 112px !important;\n    grid-template-areas:\n      \"identity commands\"\n      \"content content\" !important;\n    gap: 8px 10px !important;\n    align-items: start !important;\n    padding: 8px !important;\n  }\n  .compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] > [data-iw-skill-zone=\"identity\"] {\n    align-self: center !important;\n    min-width: 0 !important;\n  }\n  .compact-panel.fs-skill-panel[data-iw-skill-layout=\"three-zone\"] > [data-iw-skill-zone=\"commands\"] {\n    align-self: center !important;\n    justify-self: end !important;\n  }\n}\n";
  };
  __modules["styles/tooltip-engine.css"] = (module, exports, require) => {
    exports.default = "/* ══════════════════════════════════════════════════════════════════════\n   Tooltip engine — rich item-card treatment\n   ══════════════════════════════════════════════════════════════════════ */\n\n.iw-item-ref {\n  display: inline;\n  background: none !important;\n  border: 0 !important;\n  border-bottom: 1px solid transparent !important;\n  border-radius: 0 !important;\n  padding: 0 !important;\n  margin: 0 !important;\n  box-shadow: none !important;\n  font: inherit !important;\n  line-height: inherit !important;\n  font-weight: 700 !important;\n  letter-spacing: inherit !important;\n  text-transform: none !important;\n  color: var(--iw-gold);\n  cursor: help;\n  text-decoration: none;\n  transition: border-color .12s, color .12s;\n  vertical-align: baseline;\n}\n.iw-item-ref:hover,\n.iw-item-ref:focus-visible {\n  color: var(--iw-gold);\n  border-bottom-color: var(--iw-gold-dim) !important;\n}\n.iw-item-ref:focus-visible {\n  outline: 1px solid var(--iw-gold) !important;\n  outline-offset: 2px !important;\n}\n.iw-item-info { display: none; }\n\n.iw-tip {\n  position: fixed;\n  z-index: 99999;\n  width: 380px;\n  max-width: calc(100vw - 20px);\n  box-sizing: border-box;\n  background:\n    linear-gradient(180deg, rgba(255,255,255,.018), transparent 78px),\n    #151511;\n  border: 1px solid #57472C;\n  border-radius: 8px;\n  box-shadow: 0 18px 46px rgba(0,0,0,.82), inset 0 0 0 1px rgba(0,0,0,.58);\n  max-height: calc(100vh - 20px);\n  max-height: calc(100dvh - 20px);\n  flex-direction: column;\n  overflow: hidden;\n  overscroll-behavior: contain;\n  font-family: var(--iw-font-ui);\n  font-size: 13px;\n  line-height: 1.4;\n  color: var(--iw-text);\n  opacity: 0;\n  pointer-events: none;\n  transition: none;\n}\n.iw-tip::before {\n  content: \"\";\n  position: absolute;\n  z-index: 2;\n  left: 0; right: 0; top: 0;\n  height: 2px;\n  background: linear-gradient(90deg, var(--iw-gold), var(--iw-line-hot) 42%, transparent 92%);\n  pointer-events: none;\n}\n.iw-tip.is-open { opacity: 1; pointer-events: auto; }\n.iw-tip:focus-visible {\n  outline: 2px solid var(--iw-gold);\n  outline-offset: -3px;\n}\n\n.iw-tip-head {\n  position: relative;\n  flex: none;\n  flex: none;\n  flex: none;\n  display: flex;\n  align-items: flex-start;\n  gap: 9px;\n  min-height: 116px;\n  padding: 12px 118px 12px 13px;\n  box-sizing: border-box;\n  background: linear-gradient(90deg, #1D1B17, #14130F 76%);\n  border-bottom: 1px solid #302A20;\n}\n.iw-tip-icon {\n  flex: none;\n  width: 24px;\n  padding-top: 2px;\n  font-size: 21px;\n  line-height: 1;\n  text-align: center;\n  filter: saturate(.85);\n}\n.iw-tip-title-block { flex: 1; min-width: 0; }\n.iw-tip-name {\n  font-family: var(--iw-font-ui);\n  font-size: 18px;\n  font-weight: 700;\n  line-height: 1.15;\n  word-break: break-word;\n  text-shadow: 0 1px 0 #000;\n}\n\n.iw-tip-art {\n  position: absolute;\n  top: 8px;\n  right: 8px;\n  width: 100px;\n  height: 100px;\n  box-sizing: border-box;\n  display: grid;\n  place-items: center;\n  padding: 14px;\n  border: 1px solid rgba(240,232,214,.82);\n  border-radius: 12px;\n  background: #11110E;\n  box-shadow: inset 0 0 18px rgba(0,0,0,.62);\n  overflow: visible;\n  pointer-events: none;\n}\n.iw-tip-art-host {\n  position: relative;\n  display: block;\n  width: 70px;\n  height: 70px;\n  min-width: 70px;\n  min-height: 70px;\n  max-width: 70px;\n  max-height: 70px;\n  background-repeat: no-repeat;\n}\n.iw-tip-art-fallback {\n  display: grid;\n  place-items: center;\n  width: 70px;\n  height: 70px;\n  font-size: 34px;\n  opacity: .35;\n}\n.iw-tip-close {\n  flex: none;\n  width: 26px;\n  height: 26px;\n  display: grid;\n  place-items: center;\n  padding: 0 !important;\n  border: 1px solid #4A4031 !important;\n  border-radius: 4px !important;\n  background: rgba(12,11,9,.88) !important;\n  color: #C8BFAE !important;\n  font: 700 18px/1 var(--iw-font-ui) !important;\n  cursor: pointer;\n}\n.iw-tip-close:hover,\n.iw-tip-close:focus-visible {\n  border-color: var(--iw-gold) !important;\n  color: var(--iw-text-hi) !important;\n  outline: 1px solid var(--iw-gold) !important;\n}\n\n.iw-tip-badges {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 5px;\n  margin-top: 8px;\n}\n.iw-tip-badge {\n  font-size: 10.5px;\n  font-weight: 650;\n  line-height: 1.1;\n  letter-spacing: .01em;\n  white-space: nowrap;\n  padding: 4px 7px;\n  border: 1px solid #343027;\n  border-radius: 999px;\n  background: #1B1A17;\n  color: #B9B2A3;\n}\n.iw-tip-badge.t {\n  color: #AFC8F3;\n  border-color: rgba(91,155,213,.48);\n}\n.iw-tip-badge.req {\n  color: #E6A05B;\n  border-color: rgba(217,138,58,.48);\n}\n\n.iw-tip-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  padding: 12px 13px 13px;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  -webkit-overflow-scrolling: touch;\n  scrollbar-gutter: stable;\n}\n.iw-tip-sec {\n  margin-top: 12px;\n  padding-top: 10px;\n  border-top: 1px solid #302A20;\n}\n.iw-tip-sec:first-child { margin-top: 0; padding-top: 0; border-top: 0; }\n.iw-tip-sec-title {\n  font-family: var(--iw-font-ui);\n  font-size: 10px;\n  font-weight: 800;\n  letter-spacing: .14em;\n  text-transform: uppercase;\n  color: #969080;\n  margin-bottom: 7px;\n}\n.iw-tip-effect {\n  color: #C4BDAF;\n  font-size: 13px;\n  line-height: 1.45;\n}\n\n.iw-tip-stats {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 4px 16px;\n}\n.iw-tip-stat-block { min-width: 0; }\n.iw-tip-stat {\n  min-width: 0;\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 8px;\n  font-size: 12.5px;\n  padding: 2px 0;\n}\n.iw-tip-stat .k {\n  min-width: 0;\n  color: #AAA394;\n  white-space: nowrap;\n}\n.iw-tip-stat .v {\n  flex: none;\n  color: var(--iw-text-hi);\n  font-weight: 700;\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n.iw-tip-stat .v.amber { color: #E19A50; }\n.iw-tip-stat .v.good { color: var(--iw-good); }\n.iw-tip-stat-note {\n  margin-top: 1px;\n  color: var(--iw-faint);\n  font-size: 9.5px;\n  line-height: 1.25;\n}\n\n.iw-tip-acq {\n  position: relative;\n  padding: 2px 0 2px 11px;\n}\n.iw-tip-acq::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 2px;\n  background: #5878AC;\n}\n.iw-tip-acq-main {\n  font-size: 13.5px;\n  font-weight: 600;\n  color: var(--iw-text-hi);\n}\n.iw-tip-acq-sub {\n  font-size: 12px;\n  color: #8F899C;\n  margin-top: 3px;\n  line-height: 1.4;\n}\n.iw-tip-acq.is-unknown .iw-tip-acq-main { color: var(--iw-faint); font-style: italic; }\n.iw-tip-flavour {\n  font-family: var(--iw-font-flav);\n  font-style: italic;\n  font-size: 13px;\n  color: var(--iw-gold-dim);\n  line-height: 1.5;\n}\n\n.iw-tip-foot {\n  flex: none;\n  min-height: 38px;\n  padding: 8px 13px;\n  border-top: 1px solid #302A20;\n  background: #0C0B09;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n.iw-tip-foot:empty { display: none; }\n.iw-tip-link {\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: .02em;\n  color: #70A1EE;\n  text-decoration: none;\n}\n.iw-tip-link:hover { color: #9FC0F3; }\n.iw-tip-link:focus-visible {\n  color: #BBD2F5;\n  outline: 1px solid #70A1EE;\n  outline-offset: 3px;\n}\n.iw-tip-source {\n  margin-left: auto;\n  font-size: 10.5px;\n  font-weight: 700;\n  letter-spacing: .04em;\n  color: #B07846;\n  text-transform: lowercase;\n}\n.iw-tip-source.is-stale { color: #D58A52; }\n\n@media (max-width: 420px) {\n  .iw-tip { width: calc(100vw - 20px); }\n  .iw-tip-stats { grid-template-columns: 1fr; }\n  .iw-tip-head { padding-right: 108px; }\n  .iw-tip-art { width: 90px; height: 90px; padding: 10px; }\n  .iw-tip-art-host, .iw-tip-art-fallback { width: 68px; height: 68px; min-width: 68px; min-height: 68px; }\n}\n";
  };
  __modules["styles/ui-system.css"] = (module, exports, require) => {
    exports.default = "/* ══════════════════════════════════════════════════════════════════════\n   IdleWorlds Fantasy Skin — v1.5.1 HUD / navigation refinement\n\n   The shared language is deliberately dense: forged rails, restrained brass,\n   flat data, compact controls. Boxes are reserved for real controls/actions.\n   ══════════════════════════════════════════════════════════════════════ */\n\n:root {\n  --iw-space-1: 4px;\n  --iw-space-2: 6px;\n  --iw-space-3: 9px;\n  --iw-space-4: 12px;\n  --iw-space-5: 16px;\n  --iw-control-h: 32px;\n  --iw-control-h-lg: 36px;\n  --iw-frame-edge: #4B3D26;\n  --iw-frame-inner: #19150F;\n  --iw-steel: #26231D;\n}\n\n/* ── Major frames ───────────────────────────────────────────────────── */\n[data-iw-ui=\"section-frame\"] {\n  position: relative !important;\n  border: 1px solid var(--iw-frame-edge) !important;\n  border-radius: 6px !important;\n  background:\n    linear-gradient(180deg, rgba(255,255,255,.012), transparent 48px),\n    linear-gradient(90deg, rgba(110,80,35,.014), transparent 26%),\n    var(--iw-ink-800) !important;\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.48),\n    inset 0 1px 0 rgba(255,255,255,.014),\n    0 6px 18px rgba(0,0,0,.18) !important;\n}\n\n[data-iw-ui=\"section-frame\"]::before {\n  content: \"\";\n  position: absolute;\n  z-index: 0;\n  pointer-events: none;\n  left: 14px;\n  right: 14px;\n  top: 0;\n  height: 1px;\n  background: linear-gradient(90deg, var(--iw-gold-dim), rgba(157,132,88,.16) 34%, transparent 78%);\n}\n\n[data-iw-ui=\"section-title\"] {\n  font-family: var(--iw-font-head) !important;\n  letter-spacing: .035em !important;\n  color: var(--iw-text-hi) !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n\n/* ── Player HUD ─────────────────────────────────────────────────────── */\n[data-iw-ui=\"player-hud\"] {\n  position: relative !important;\n  min-height: 0 !important;\n  border: 1px solid var(--iw-frame-edge) !important;\n  border-radius: 6px !important;\n  background:\n    radial-gradient(420px 90px at 8% 0%, rgba(140,96,37,.052), transparent 72%),\n    linear-gradient(180deg, rgba(255,255,255,.014), transparent 38px),\n    var(--iw-ink-800) !important;\n  box-shadow:\n    inset 0 0 0 1px rgba(0,0,0,.50),\n    inset 0 1px 0 rgba(255,255,255,.014),\n    0 6px 20px rgba(0,0,0,.20) !important;\n  overflow: hidden !important;\n}\n\n[data-iw-ui=\"player-hud\"]::before {\n  content: \"\";\n  position: absolute;\n  left: 16px;\n  right: 16px;\n  top: 0;\n  height: 1px;\n  background: linear-gradient(90deg, var(--iw-gold), var(--iw-line-hot) 22%, transparent 68%);\n  opacity: .66;\n  pointer-events: none;\n}\n\n/* Use the live three-column shape only when UIFoundation positively identifies\n   identity, utility and status zones as distinct direct children. */\n[data-iw-ui=\"player-hud\"][data-iw-hud-layout=\"three-zone\"] {\n  display: grid !important;\n  grid-template-columns: minmax(280px, .95fr) auto minmax(620px, 2.15fr) !important;\n  align-items: center !important;\n  column-gap: 18px !important;\n  padding: 12px 20px !important;\n}\n\n[data-iw-ui=\"player-hud\"] > [data-iw-hud-zone=\"identity\"] {\n  min-width: 0 !important;\n  align-self: stretch !important;\n  display: flex !important;\n  align-items: center !important;\n}\n[data-iw-ui=\"player-hud\"] > [data-iw-hud-zone=\"utility\"] {\n  align-self: stretch !important;\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n}\n[data-iw-ui=\"player-hud\"] > [data-iw-hud-zone=\"status\"] {\n  min-width: 0 !important;\n  align-self: stretch !important;\n  display: flex !important;\n  align-items: center !important;\n}\n\n[data-iw-ui=\"hud-identity\"] {\n  position: relative !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  padding: 0 0 0 12px !important;\n}\n\n[data-iw-ui=\"hud-identity\"]::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 3px;\n  bottom: 3px;\n  width: 2px;\n  background: linear-gradient(180deg, var(--iw-gold), #70411F 65%, var(--iw-ember));\n  opacity: .82;\n}\n\n/* HUD identity fallback. Keep inherited text readable, but never touch the\n   player cosmetic button's gradient/text-fill. */\n[data-iw-ui=\"hud-identity\"] {\n  color: var(--iw-text-hi) !important;\n  opacity: 1 !important;\n}\n\n[data-iw-ui=\"hud-brand\"],\n[data-iw-ui=\"hud-identity\"] [data-iw-ui=\"hud-brand\"] {\n  color: var(--iw-gold-dim) !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  line-height: 1.1 !important;\n  letter-spacing: .28em !important;\n  text-transform: uppercase !important;\n}\n\n[data-iw-ui=\"hud-player-name\"],\n[data-iw-ui=\"hud-player-name\"] *,\n[data-iw-hud-player-text=\"1\"],\n[data-iw-hud-player-text=\"1\"] * {\n  opacity: 1 !important;\n  filter: none !important;\n  mix-blend-mode: normal !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 22px !important;\n  font-weight: 700 !important;\n  line-height: 1.02 !important;\n  letter-spacing: -.015em !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n\n[data-iw-ui=\"hud-player-name\"] {\n  min-height: 22px !important;\n  border: 0 !important;\n  outline: 0 !important;\n  box-shadow: none !important;\n}\n\n[data-iw-ui=\"hud-title\"],\n[data-iw-ui=\"hud-identity\"] [data-iw-ui=\"hud-title\"] {\n  color: var(--iw-gold) !important;\n  font-size: 11.5px !important;\n  font-weight: 600 !important;\n  line-height: 1.25 !important;\n}\n\n[data-iw-ui=\"hud-location\"],\n[data-iw-ui=\"hud-online\"],\n[data-iw-ui=\"hud-identity\"] [data-iw-ui=\"hud-location\"],\n[data-iw-ui=\"hud-identity\"] [data-iw-ui=\"hud-online\"],\n[data-iw-ui=\"hud-identity\"] [data-iw-ui=\"hud-online\"] {\n  color: var(--iw-dim) !important;\n  font-size: 11px !important;\n  line-height: 1.25 !important;\n}\n\n[data-iw-ui=\"hud-online\"] {\n  color: #918A79 !important;\n}\n\n[data-iw-ui=\"hud-status\"] {\n  width: 100% !important;\n  min-width: 0 !important;\n  display: grid !important;\n  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;\n  align-items: center !important;\n  gap: 0 !important;\n  border-top: 1px solid rgba(88,72,43,.30) !important;\n  border-bottom: 1px solid rgba(0,0,0,.42) !important;\n  background: linear-gradient(180deg, rgba(255,255,255,.008), rgba(0,0,0,.08)) !important;\n}\n\n[data-iw-ui=\"hud-metric\"] {\n  min-width: 0 !important;\n  min-height: 30px !important;\n  margin: 0 !important;\n  padding: 6px 10px !important;\n  border: 0 !important;\n  border-left: 1px solid var(--iw-line) !important;\n  border-radius: 0 !important;\n  outline: 0 !important;\n  background: transparent !important;\n  background-image: none !important;\n  box-shadow: none !important;\n  color: #B8B09F !important;\n  font-size: 11.5px !important;\n  font-weight: 600 !important;\n  line-height: 1.15 !important;\n  font-variant-numeric: tabular-nums !important;\n}\n\n[data-iw-ui=\"hud-metric\"]:nth-child(3n + 1) {\n  border-left-color: transparent !important;\n}\n\n[data-iw-ui=\"hud-metric\"]:hover {\n  color: var(--iw-text-hi) !important;\n  background: linear-gradient(90deg, rgba(212,173,99,.025), transparent) !important;\n}\n\n[data-iw-ui=\"hud-utility\"] {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  gap: 5px !important;\n  padding: 0 4px !important;\n  border: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n[data-iw-ui=\"hud-utility-button\"] {\n  width: 30px !important;\n  min-width: 30px !important;\n  height: 30px !important;\n  min-height: 30px !important;\n  padding: 0 !important;\n  border: 1px solid transparent !important;\n  background: transparent !important;\n  color: #A59E8E !important;\n  box-shadow: none !important;\n}\n[data-iw-ui=\"hud-utility-button\"]:hover:not(:disabled) {\n  color: var(--iw-gold) !important;\n  border-color: var(--iw-line-hi) !important;\n  background: rgba(255,255,255,.018) !important;\n}\n\n/* ── Main navigation rail ───────────────────────────────────────────── */\n[data-iw-ui=\"main-nav-shell\"] {\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n[data-iw-ui=\"main-nav\"] {\n  display: flex !important;\n  align-items: stretch !important;\n  flex-wrap: wrap !important;\n  gap: 0 !important;\n  width: max-content !important;\n  max-width: 100% !important;\n  min-height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 1px solid #3A3225 !important;\n  border-radius: 3px !important;\n  background: #11100D !important;\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,.52) !important;\n  overflow: visible !important;\n}\n\n[data-iw-ui=\"nav-tab\"] {\n  position: relative !important;\n  min-height: var(--iw-control-h) !important;\n  height: var(--iw-control-h) !important;\n  margin: 0 !important;\n  padding: 0 16px !important;\n  border: 0 !important;\n  border-right: 1px solid #3A3225 !important;\n  border-radius: 0 !important;\n  background: linear-gradient(180deg, #211E18, #16140F) !important;\n  color: #AAA291 !important;\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.022) !important;\n  font-family: var(--iw-font-ui) !important;\n  font-size: 11.5px !important;\n  font-weight: 700 !important;\n  letter-spacing: .025em !important;\n  text-transform: uppercase !important;\n  line-height: 1 !important;\n}\n\n[data-iw-ui=\"nav-tab\"]:last-of-type { border-right: 0 !important; }\n\n[data-iw-ui=\"nav-tab\"]:hover:not(:disabled) {\n  z-index: 1;\n  background: linear-gradient(180deg, #29241C, #1A1711) !important;\n  color: var(--iw-text-hi) !important;\n  filter: none !important;\n}\n\n[data-iw-ui=\"nav-tab\"][data-iw-state=\"active\"] {\n  z-index: 2;\n  color: #FFE8CB !important;\n  background:\n    linear-gradient(180deg, rgba(255,255,255,.035), transparent 46%),\n    linear-gradient(180deg, #9D3C16, #67250C) !important;\n  box-shadow:\n    inset 0 1px 0 rgba(255,226,191,.13),\n    inset 0 -2px 0 rgba(55,16,4,.58) !important;\n}\n\n[data-iw-ui=\"nav-tab\"][data-iw-state=\"active\"]::after {\n  content: \"\";\n  position: absolute;\n  left: 9px;\n  right: 9px;\n  bottom: -4px;\n  height: 2px;\n  background: var(--iw-ember-hi);\n  box-shadow: 0 0 6px rgba(209,90,34,.28);\n}\n\n/* ── Zone command rail ──────────────────────────────────────────────── */\n[data-iw-ui=\"zone-bar\"] {\n  border-radius: 5px !important;\n  padding-top: 8px !important;\n  padding-bottom: 8px !important;\n  min-height: 0 !important;\n}\n\n[data-iw-ui=\"zone-title\"] {\n  color: var(--iw-text-hi) !important;\n  font-weight: 700 !important;\n}\n\n[data-iw-ui=\"zone-action\"] {\n  background: linear-gradient(180deg, #242018, #17140F) !important;\n  border: 1px solid var(--iw-line-hi) !important;\n  color: var(--iw-text) !important;\n  height: 32px !important;\n  min-height: 32px !important;\n  min-width: 0 !important;\n  padding: 0 12px !important;\n  font-size: 11px !important;\n  letter-spacing: .025em !important;\n}\n\n/* ── Generic control language ───────────────────────────────────────── */\n\n/* Surface treatment is safe to apply globally: it changes how a control is\n   painted, never how much room it takes. */\nbutton:not(.iw-item-ref):not([data-iw-ui=\"nav-tab\"]):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]),\n[role=\"button\"]:not(.iw-item-ref):not([data-iw-ui=\"nav-tab\"]):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]) {\n  border-color: var(--iw-line-hi) !important;\n  background-image: linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.09)) !important;\n}\n\n/* Geometry is NOT safe to apply globally.\n   `min-height: 30px` on every button forced small icon controls — chat\n   toolbar, modal close buttons, market row steppers — up to 30px regardless\n   of the game's own sizing, because min-height does not compete with the\n   Tailwind `h-*` height utilities, it simply wins. That overflowed dense\n   regions and was itself a source of \"looks broken in some places\".\n\n   Apply the minimum only where a control has been positively classified as\n   a real action, and only when the game has not sized it explicitly.\n   (Audit S3.5) */\n[data-iw-ui=\"zone-action\"],\n[data-iw-ui=\"hud-utility-button\"],\n[data-iw-inventory-control=\"filter\"],\n[data-iw-inventory-control=\"page\"],\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"action-button\"],\n.compact-panel.fs-skill-panel button[data-iw-skill-role=\"nav-button\"] {\n  min-height: 30px;\n}\n\nbutton:not(.iw-item-ref):not([data-iw-ui=\"nav-tab\"]):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]):disabled,\n[role=\"button\"][aria-disabled=\"true\"]:not(.iw-item-ref):not([class*=\"chat-name-\"]):not([data-iw-skill-role=\"level-progress\"]) {\n  filter: saturate(.58) brightness(.84) !important;\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,.22) !important;\n}\n\ninput[type=\"search\"],\ninput[placeholder*=\"Search\" i] {\n  border: 1px solid #30291E !important;\n  border-bottom-color: var(--iw-line-hi) !important;\n  border-radius: 2px !important;\n  background: linear-gradient(180deg, #080A0A, #0D0E0C) !important;\n  box-shadow: inset 0 2px 6px rgba(0,0,0,.72) !important;\n}\n\n@media (max-width: 1100px) {\n  [data-iw-ui=\"player-hud\"][data-iw-hud-layout=\"three-zone\"] {\n    grid-template-columns: minmax(230px, .9fr) auto minmax(440px, 1.7fr) !important;\n    column-gap: 10px !important;\n    padding-inline: 14px !important;\n  }\n  [data-iw-ui=\"hud-status\"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }\n  [data-iw-ui=\"hud-metric\"]:nth-child(3n + 1) { border-left-color: var(--iw-line) !important; }\n  [data-iw-ui=\"hud-metric\"]:nth-child(2n + 1) { border-left-color: transparent !important; }\n}\n\n@media (max-width: 780px) {\n  [data-iw-ui=\"player-hud\"][data-iw-hud-layout=\"three-zone\"] {\n    display: block !important;\n    padding: 10px !important;\n  }\n  [data-iw-ui=\"player-hud\"] > [data-iw-hud-zone=\"utility\"] { justify-content: flex-start !important; margin-top: 8px !important; }\n  [data-iw-ui=\"player-hud\"] > [data-iw-hud-zone=\"status\"] { margin-top: 8px !important; }\n  [data-iw-ui=\"hud-status\"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }\n  [data-iw-ui=\"hud-player-name\"] { font-size: 19px !important; }\n  [data-iw-ui=\"main-nav\"] { width: 100% !important; }\n  [data-iw-ui=\"nav-tab\"] {\n    flex: 1 1 auto !important;\n    padding-inline: 9px !important;\n    font-size: 10.5px !important;\n  }\n}\n";
  };
  const __cache = Object.create(null);
  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    const fn = __modules[id];
    if (!fn) throw new Error(`IW Fantasy Skin bundle: module not found: ${id}`);
    const module = { exports: {} };
    __cache[id] = module;
    fn(module, module.exports, __require);
    return module.exports;
  }
  __require("content.js");
})();
