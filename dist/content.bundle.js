(() => {
  // src/modules/Runtime.js
  var hasChrome = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  var runtimeActive = true;
  function setRuntimeActive(active) {
    runtimeActive = active !== false;
  }
  function assetUrl(path) {
    const clean = String(path || "").replace(/^\/+/, "");
    if (hasChrome && typeof chrome.runtime.getURL === "function") {
      return chrome.runtime.getURL(clean);
    }
    return clean;
  }
  var LOCAL_FALLBACK = /* @__PURE__ */ new Map();
  var storageGet = async function storageGet2(key) {
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
  var storageSet = async function storageSet2(key, value) {
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
  function onStorageChanged(key, handler) {
    if (!hasChrome || !chrome.storage?.onChanged) return () => {
    };
    const listener = (changes, area) => {
      if (area !== "local" || !(key in changes)) return;
      try {
        handler(changes[key].newValue);
      } catch (err) {
        warnOnce("storage-change", err);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  var _warned = /* @__PURE__ */ new Set();
  function warnOnce(key, err) {
    if (_warned.has(key)) return;
    _warned.add(key);
    const detail = err && err.message ? err.message : err;
    console.warn(`[IW Fantasy Skin] ${key}:`, detail);
  }
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
  function guardEach(label, items, fn) {
    if (!runtimeActive) return 0;
    let ok = 0;
    for (const item of items || []) {
      if (guard(label, () => fn(item))) ok += 1;
    }
    return ok;
  }
  var raf = typeof window !== "undefined" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : ((fn) => setTimeout(fn, 16));

  // src/modules/StyleInjector.js
  var _injected = /* @__PURE__ */ new Set();
  function rewriteAssetUrls(css) {
    return String(css || "").replace(
      /url\(\s*(['"]?)\.\.\/assets\/([^)'"\s]+)\1\s*\)/g,
      (_match, _quote, path) => `url("${assetUrl(`assets/${path}`)}")`
    );
  }
  function inject(id, css) {
    if (_injected.has(id)) return;
    _injected.add(id);
    const style = document.createElement("style");
    style.setAttribute("data-iw-style", id);
    style.textContent = rewriteAssetUrls(css);
    (document.head || document.documentElement).appendChild(style);
  }
  function removeAll() {
    document.querySelectorAll("style[data-iw-style]").forEach((el) => el.remove());
    _injected.clear();
  }

  // src/modules/DOMWatcher.js
  var SEL_INV_ROW = '.compact-row, [class*="item-row"]';
  var SEL_SKILL_PANEL = ".compact-panel";
  var FLUSH_BUDGET = 60;
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
  var skillTypeCache = /* @__PURE__ */ new WeakMap();
  function normaliseSkillSignal(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  var SKILL_IDENTITY_ALIASES = {
    combat: ["combat"],
    mining: ["mining"],
    smithing: ["smithing"],
    gathering: ["gathering"],
    alchemy: ["alchemy"],
    jewelcrafting: ["jewel", "jewelcrafting"],
    spellcrafting: ["spellcraft", "spellcrafting"],
    tailoring: ["tailor", "tailoring"],
    crafting: ["crafting"],
    fishing: ["fishing"]
  };
  function skillIdentitySignals(panel) {
    const signals = /* @__PURE__ */ new Set();
    for (const el of panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"],div,span')) {
      if (el.closest("button,a")) continue;
      const explicitHeading = /^H[1-4]$/.test(el.tagName) || /skill-name/i.test(String(el.className || ""));
      if (!explicitHeading && el.childElementCount) continue;
      const text = normaliseSkillSignal(el.textContent);
      if (text && text.length <= 32) signals.add(text);
    }
    return [...signals];
  }
  function skillTypeFromIdentity(signals) {
    for (const [type, aliases] of Object.entries(SKILL_IDENTITY_ALIASES)) {
      if (aliases.some((alias) => signals.includes(alias))) return type;
    }
    return null;
  }
  function skillSignature(panel) {
    const buttons = [...panel.querySelectorAll("button")].map((btn) => normaliseSkillSignal(btn.textContent));
    const identities = skillIdentitySignals(panel);
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
    const actionTexts = [...panel.querySelectorAll("button")].map((btn) => normaliseSkillSignal(btn.textContent)).filter(Boolean);
    const hasAction = (...names) => actionTexts.some((text) => names.includes(text));
    if (hasAction("fight")) return "combat";
    if (hasAction("mine")) return "mining";
    if (hasAction("prospect")) return "jewelcrafting";
    if (hasAction("smelt", "forge")) return "smithing";
    if (hasAction("brew")) return "alchemy";
    if (hasAction("enchant")) return "spellcrafting";
    if (hasAction("tailor", "sew", "weave")) return "tailoring";
    if (hasAction("craft")) return "crafting";
    if (hasAction("fish")) return "fishing";
    const labels = skillIdentitySignals(panel);
    const identityType = skillTypeFromIdentity(labels);
    if (identityType) return identityType;
    if (hasAction("gather", "harvest")) return "gathering";
    if (labels.some((t) => /^combat(?:\s|$)/.test(t))) return "combat";
    if (labels.some((t) => /^mining(?:\s|$)|^mine(?:\s|$)/.test(t))) return "mining";
    if (labels.some((t) => /^(?:jewel|jewelcrafting)(?:\s|$)|^prospect(?:\s|$)/.test(t))) return "jewelcrafting";
    if (labels.some((t) => /^smithing(?:\s|$)|^smelt(?:\s|$)/.test(t))) return "smithing";
    if (labels.some((t) => /^gathering(?:\s|$)|^gather(?:\s|$)/.test(t))) return "gathering";
    if (labels.some((t) => /^alchemy(?:\s|$)|^brew(?:\s|$)/.test(t))) return "alchemy";
    if (labels.some((t) => /^(?:spellcraft|spellcrafting)(?:\s|$)|^enchant(?:\s|$)/.test(t))) return "spellcrafting";
    if (labels.some((t) => /^(?:tailor|tailoring)(?:\s|$)|^(?:tailor|sew|weave)(?:\s|$)/.test(t))) return "tailoring";
    if (labels.some((t) => /^crafting(?:\s|$)/.test(t))) return "crafting";
    if (labels.some((t) => /^fishing(?:\s|$)|^fish(?:\s|$)/.test(t))) return "fishing";
    return "unknown";
  }
  var pendingInventory = /* @__PURE__ */ new Set();
  var pendingSkills = /* @__PURE__ */ new Set();
  var pendingBgRoots = /* @__PURE__ */ new Set();
  var pendingNameRoots = /* @__PURE__ */ new Set();
  var flushQueued = false;
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
  function queueContext(el, reason = "update", opts = {}) {
    if (!isElement(el)) return;
    const {
      inventory = true,
      skill = true,
      names = true,
      background = true
    } = opts;
    if (inventory) addIfConnected(pendingInventory, nearest(el, SEL_INV_ROW));
    if (skill) addIfConnected(pendingSkills, nearest(el, SEL_SKILL_PANEL));
    if (names) addNameRoot(el);
    if (background) addIfConnected(pendingBgRoots, el);
    scheduleFlush(reason);
  }
  function discover(root, reason = "mount") {
    if (!isElement(root)) return;
    if (root.matches?.(SEL_INV_ROW)) addIfConnected(pendingInventory, root);
    root.querySelectorAll?.(SEL_INV_ROW).forEach((el) => addIfConnected(pendingInventory, el));
    if (root.matches?.(SEL_SKILL_PANEL)) addIfConnected(pendingSkills, root);
    root.querySelectorAll?.(SEL_SKILL_PANEL).forEach((el) => addIfConnected(pendingSkills, el));
    addNameRoot(root);
    addIfConnected(pendingBgRoots, root);
    scheduleFlush(reason);
  }
  function scheduleFlush() {
    if (flushQueued) return;
    flushQueued = true;
    raf(flushPending);
  }
  function takeConnected(set) {
    for (const el of set) {
      set.delete(el);
      if (el?.isConnected) return el;
    }
    return null;
  }
  function drainGlobalBudget(budget) {
    const groups = [
      ["inventory", pendingInventory],
      ["skills", pendingSkills],
      ["bgRoots", pendingBgRoots],
      ["nameRoots", pendingNameRoots]
    ];
    const out = Object.fromEntries(groups.map(([key]) => [key, []]));
    let cursor = 0, idle = 0, remaining = budget;
    while (remaining > 0 && idle < groups.length) {
      const [key, set] = groups[cursor];
      cursor = (cursor + 1) % groups.length;
      const el = takeConnected(set);
      if (el) {
        out[key].push(el);
        remaining -= 1;
        idle = 0;
      } else idle += 1;
    }
    return out;
  }
  function flushPending() {
    flushQueued = false;
    const { inventory, skills, bgRoots, nameRoots } = drainGlobalBudget(FLUSH_BUDGET);
    guardEach("emit:inventory-row", inventory, (row) => emit("iw:inventory-row", { row, reason: "reconcile" }));
    guardEach("emit:skill-panel", skills, (panel) => emit("iw:skill-panel", { panel, skill: detectSkillTypeCached(panel), reason: "reconcile" }));
    if (bgRoots.length) guard("emit:dom-flush", () => emit("iw:dom-flush", { roots: bgRoots }));
    if (nameRoots.length) guard("emit:name-scan-flush", () => emit("iw:name-scan-flush", { roots: nameRoots }));
    if (pendingInventory.size || pendingSkills.size || pendingBgRoots.size || pendingNameRoots.size) {
      scheduleFlush();
    }
  }
  var _started = false;
  var _observer = null;
  function startWatcher() {
    if (_started) return;
    _started = true;
    _observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          if (isElement(m.target)) queueContext(m.target, "children", { background: false, names: false });
          for (const n of m.addedNodes) {
            if (isElement(n)) discover(n, "mount");
            else if (n.nodeType === 3 && n.parentElement) {
              queueContext(n.parentElement, "text", { background: false });
            }
          }
        } else if (m.type === "characterData") {
          if (m.target.parentElement) {
            queueContext(m.target.parentElement, "text", { background: false });
          }
        } else if (m.type === "attributes") {
          if (m.attributeName === "style") {
            queueContext(m.target, "attr:style", {
              inventory: false,
              names: false
            });
          } else if (m.attributeName === "disabled" || m.attributeName === "aria-disabled") {
            queueContext(m.target, `attr:${m.attributeName}`, {
              inventory: false,
              names: false,
              background: false
            });
          } else {
            queueContext(m.target, "attr:class", { names: false });
          }
        }
      }
    });
    _observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "disabled", "aria-disabled"]
    });
    discover(document.body, "initial");
  }
  function stopWatcher() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    _started = false;
    flushQueued = false;
    pendingInventory.clear();
    pendingSkills.clear();
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

  // src/modules/aliases.js
  var CLOAK_MATERIAL_ALIASES = {
    "abyssal": "abyssal silk",
    "aether": "aether silk",
    "astral": "astral silk",
    "celestial": "celestial silk",
    "dragonscale": "dragonscale silk",
    "eternal": "eternal weave",
    "glacial": "glacial silk",
    "gravity": "gravity weave",
    "mythril": "mythril silk",
    "primordial": "primordial weave",
    "regal": "regal silk",
    "runic": "runic thread",
    "void": "void thread",
    "voidglass": "voidglass silk"
  };
  var CLOAK_PATTERN = /^((?:gilded|fortunate|nimble)\s+)?(\w+)(\s+cloak\s+of\s+.+)$/i;
  function applyCloakAlias(name) {
    const match = CLOAK_PATTERN.exec(name);
    if (!match) return name;
    const [, prefix = "", material, suffix] = match;
    const aliased = CLOAK_MATERIAL_ALIASES[material.toLowerCase()];
    if (!aliased) return name;
    return `${prefix}${aliased}${suffix}`;
  }

  // src/modules/normaliseItemName.js
  function normaliseItemName(name) {
    let s = String(name == null ? "" : name).trim();
    try {
      s = s.normalize("NFKD");
    } catch (e) {
    }
    return s.replace(/[\u0300-\u036f]/g, "").replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'").replace(/&/g, " and ").replace(/'/g, "").replace(/\blv\.\s*/gi, "lv ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  }

  // src/modules/AtlasService.js
  var GEAR_MANIFEST_URL = assetUrl("assets/gear_icons_manifest.json");
  var GEAR_ATLAS_URL = assetUrl("assets/gear_icons_atlas.png");
  var ITEM_INDEX_URL = assetUrl("assets/item_icons_index.csv");
  var ITEM_ATLAS_URL = assetUrl("assets/item_icons_atlas.png");
  var REQUIRED_ITEM_COLUMNS = ["item_id", "name", "x", "y", "width", "height"];
  var UPGRADE_SUFFIX = /\s*\+\s*\d+\s*$/i;
  var LEVEL_SUFFIX = /\s+lv\.?\s*\d+\s*$/i;
  var OF_SUFFIX = /\s+of\s+.+$/i;
  var PREFIX_AFFIX = /^(gilded|fortunate|enchanted|nimble|sturdy|keen|blessed|arcane|savage|swift|mighty|precise|reinforced|masterwork|superior|pristine)\s+/i;
  var normalise = normaliseItemName;
  function parseCSV(text) {
    const clean = String(text || "").replace(/^﻿/, "");
    const lines = clean.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = splitCSVLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cells[idx] ?? "";
      });
      rows.push(row);
    }
    return { headers, rows };
  }
  function splitCSVLine(line) {
    const out = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          cur += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
    }
    out.push(cur);
    return out;
  }
  var _AtlasService = class {
    constructor() {
      this._gearManifest = null;
      this._gearByName = null;
      this._gearDims = { cols: 10, rows: 150, cell: 128 };
      this._itemRows = null;
      this._itemById = null;
      this._itemByName = null;
      this._itemDims = { cols: 10, rows: 38, cell: 128 };
      this._promise = null;
      this._nextRetryAt = 0;
      this._missingWarned = /* @__PURE__ */ new Set();
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
      if (Date.now() < this._nextRetryAt) {
        return this.isReady() ? Promise.resolve() : Promise.reject(new Error("Atlas metadata unavailable (backing off)"));
      }
      this._promise = this._loadMissing().finally(() => {
        this._promise = null;
      });
      return this._promise;
    }
    async _loadMissing() {
      const jobs = [];
      const labels = [];
      if (!this._gearByName) {
        jobs.push(this._loadGearAtlas());
        labels.push("gear");
      }
      if (!this._itemById) {
        jobs.push(this._loadItemAtlas());
        labels.push("item");
      }
      if (!jobs.length) return;
      const results = await Promise.allSettled(jobs);
      const failures = [];
      let loaded = 0;
      results.forEach((result, idx) => {
        if (result.status === "fulfilled") loaded += 1;
        else failures.push(`${labels[idx]}: ${result.reason?.message || result.reason}`);
      });
      if (loaded) {
        this._revision += 1;
        document.dispatchEvent(new CustomEvent("iw:atlas-updated", {
          detail: {
            revision: this._revision,
            gearReady: !!this._gearByName,
            itemReady: !!this._itemById
          },
          bubbles: false
        }));
      }
      if (failures.length) {
        this._nextRetryAt = Date.now() + (this.isReady() ? 15e3 : 5e3);
        console.warn("[AtlasService] Partial load:", failures.join(" | "));
      } else {
        this._nextRetryAt = 0;
      }
      if (!this.isReady()) {
        throw new Error(`No atlas metadata available (${failures.join(" | ")})`);
      }
      console.log(
        `[AtlasService] Ready — gear: ${this._gearByName ? this._gearByName.size : 0} icons, items: ${this._itemRows ? this._itemRows.length : 0} icons`
      );
    }
    async _loadGearAtlas() {
      const res = await fetch(GEAR_MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Gear manifest fetch failed: ${res.status}`);
      const manifest = await res.json();
      if (!manifest || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
        throw new Error("Gear manifest contained no icons");
      }
      this._gearManifest = manifest;
      this._gearDims = {
        cols: manifest.columns || 10,
        rows: manifest.rows || 150,
        cell: manifest.cell_size || 128
      };
      this._gearByName = /* @__PURE__ */ new Map();
      for (const icon of manifest.icons) {
        const key = normalise(icon.name);
        if (key) this._gearByName.set(key, icon);
      }
      const sample = manifest.icons[0] || {};
      if (!Number.isFinite(Number(sample.x)) || !Number.isFinite(Number(sample.y))) {
        warnOnce("atlas:gear-schema", new Error(
          "Gear manifest icons have no numeric x/y — icons will render as atlas cell 0,0"
        ));
      }
    }
    async _loadItemAtlas() {
      const res = await fetch(ITEM_INDEX_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Item index fetch failed: ${res.status}`);
      const csvText = await res.text();
      const { headers, rows } = parseCSV(csvText);
      if (!rows.length) throw new Error("Item index contained no rows");
      const missing = REQUIRED_ITEM_COLUMNS.filter((col) => !headers.includes(col));
      if (missing.length) {
        throw new Error(`Item index missing required column(s): ${missing.join(", ")}`);
      }
      this._itemRows = rows;
      this._itemById = /* @__PURE__ */ new Map();
      this._itemByName = /* @__PURE__ */ new Map();
      const cell = Number(rows[0]?.width) || 128;
      let maxX = 0, maxY = 0;
      for (const row of rows) {
        if (row.item_id !== void 0 && row.item_id !== null && row.item_id !== "") {
          this._itemById.set(String(row.item_id), row);
        }
        const key = normalise(row.name);
        if (key && !this._itemByName.has(key)) this._itemByName.set(key, row);
        const x = Number(row.x);
        const y = Number(row.y);
        const w = Number(row.width);
        const h = Number(row.height);
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
          throw new Error(`Item index contains invalid sprite bounds for ${row.item_id || row.name || "unknown item"}`);
        }
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      }
      this._itemDims = {
        cols: Math.max(1, Math.ceil(maxX / cell)),
        rows: Math.max(1, Math.ceil(maxY / cell)),
        cell
      };
    }
    resolve(ref = {}) {
      const id = ref.id !== void 0 && ref.id !== null ? String(ref.id) : null;
      const name = ref.name || "";
      if (id && this._itemById && this._itemById.has(id)) {
        return { atlas: "item", entry: this._itemById.get(id) };
      }
      if (name && this._itemByName) {
        const hit2 = this._itemByName.get(normalise(name));
        if (hit2) return { atlas: "item", entry: hit2 };
      }
      if (!name || !this._gearByName) return null;
      let hit = this._gearByName.get(normalise(name));
      if (hit) return { atlas: "gear", entry: hit };
      const upgradeMatch = UPGRADE_SUFFIX.exec(name);
      const badge = upgradeMatch ? parseInt(upgradeMatch[0].replace(/\D/g, ""), 10) : 0;
      let stripped = name.replace(UPGRADE_SUFFIX, "").trim();
      hit = this._gearByName.get(normalise(stripped));
      if (hit) return { atlas: "gear", entry: hit, badge };
      const aliased = applyCloakAlias(stripped);
      if (aliased !== stripped) {
        hit = this._gearByName.get(normalise(aliased));
        if (hit) return { atlas: "gear", entry: hit, badge };
      }
      const noLevel = stripped.replace(LEVEL_SUFFIX, "").trim();
      hit = this._gearByName.get(normalise(noLevel));
      if (hit) return { atlas: "gear", entry: hit, badge };
      const noSuffix = noLevel.replace(OF_SUFFIX, "").trim();
      hit = this._gearByName.get(normalise(noSuffix));
      if (hit) return { atlas: "gear", entry: hit, badge };
      const noPrefix = noSuffix.replace(PREFIX_AFFIX, "").trim();
      hit = this._gearByName.get(normalise(noPrefix));
      if (hit) return { atlas: "gear", entry: hit, badge };
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
      const isGear = atlas === "gear";
      const atlasUrl = isGear ? GEAR_ATLAS_URL : ITEM_ATLAS_URL;
      const dims = isGear ? this._gearDims : this._itemDims;
      const cell = dims.cell;
      const atlasW = dims.cols * cell;
      const atlasH = dims.rows * cell;
      const x = Number(entry.x) || 0;
      const y = Number(entry.y) || 0;
      const w = Number(entry.width) || cell;
      const h = Number(entry.height) || cell;
      const xPct = atlasW > w ? x / (atlasW - w) * 100 : 0;
      const yPct = atlasH > h ? y / (atlasH - h) * 100 : 0;
      hostEl.style.backgroundImage = `url("${atlasUrl}")`;
      hostEl.style.backgroundSize = `${atlasW / w * 100}% ${atlasH / h * 100}%`;
      hostEl.style.backgroundPosition = `${xPct.toFixed(6)}% ${yPct.toFixed(6)}%`;
      hostEl.style.backgroundRepeat = "no-repeat";
      hostEl.dataset.iwAtlas = atlas;
      if (badge) this._paintPlaceholderBadge(hostEl, badge);
      else this._clearBadge(hostEl);
      return true;
    }
    _paintPlaceholderBadge(hostEl, level) {
      if (typeof getComputedStyle === "function" && getComputedStyle(hostEl).position === "static") {
        hostEl.style.position = "relative";
      }
      let badgeEl = hostEl.querySelector(".iw-icon-badge");
      if (!badgeEl) {
        badgeEl = document.createElement("span");
        badgeEl.className = "iw-icon-badge";
        hostEl.appendChild(badgeEl);
      }
      badgeEl.textContent = `+${level}`;
    }
    _clearBadge(hostEl) {
      const badgeEl = hostEl.querySelector(".iw-icon-badge");
      if (badgeEl) badgeEl.remove();
    }
    hasIcon(ref) {
      return this.resolve(ref) !== null;
    }
  };
  var AtlasService = new _AtlasService();

  // src/modules/ItemDatabase.js
  var API_URL = "https://idleworlds.com/items.json";
  var CACHE_KEY = "iw-item-db-cache";
  var CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1e3;
  var REFRESH_RETRY_MS = 15 * 60 * 1e3;
  var LEGACY_LOCALSTORAGE_KEY = "iw-item-db-cache";
  var legacyEvicted = false;
  function evictLegacyCache() {
    if (legacyEvicted) return;
    legacyEvicted = true;
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)) {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
        console.log("[ItemDatabase] Evicted legacy cache from page localStorage");
      }
    } catch (err) {
      warnOnce("itemdb:legacy-evict", err);
    }
  }
  var _ItemDatabase = class {
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
        }).catch((err) => {
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
        this._refreshOnce().then(() => this._scheduleRefresh(CACHE_MAX_AGE_MS)).catch((err) => {
          console.warn("[ItemDatabase] Scheduled refresh failed:", err.message);
          this._scheduleRefresh(REFRESH_RETRY_MS);
        });
      }, delayMs);
      this._refreshTimer?.unref?.();
    }
    _refreshOnce() {
      if (!this._refreshPromise) {
        this._refreshPromise = this._fetchFresh().finally(() => {
          this._refreshPromise = null;
        });
      }
      return this._refreshPromise;
    }
    async _load() {
      evictLegacyCache();
      const cached = await this._readCache({ allowStale: true });
      if (cached && !cached.stale) {
        this._index(cached.items, cached.generatedAt, "cache");
        this._refreshOnce().catch((err) => {
          console.warn("[ItemDatabase] Background refresh failed:", err.message);
        });
        return;
      }
      if (cached && cached.stale) {
        this._index(cached.items, cached.generatedAt, "stale-cache");
        try {
          await this._refreshOnce();
        } catch (err) {
          console.warn("[ItemDatabase] Using stale cache after refresh failure:", err.message);
        }
        return;
      }
      await this._refreshOnce();
    }
    async _fetchFresh() {
      const res = await fetch(API_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`items.json fetch failed: ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("items.json returned no item records");
      }
      if (this.isReady() && data.generatedAt && data.generatedAt === this._generatedAt) {
        this._source = "network";
        this._writeCache(data.items, data.generatedAt);
        return;
      }
      this._index(data.items, data.generatedAt, "network");
      this._writeCache(data.items, data.generatedAt);
      console.log(`[ItemDatabase] Loaded ${data.items.length} items (generated ${data.generatedAt})`);
    }
    _index(items, generatedAt, source) {
      if (!Array.isArray(items) || items.length === 0) return;
      this._items = items;
      this._generatedAt = generatedAt || null;
      this._source = source || null;
      this._byId = /* @__PURE__ */ new Map();
      this._byName = /* @__PURE__ */ new Map();
      for (const item of items) {
        if (item.item_id !== void 0 && item.item_id !== null && item.item_id !== "") {
          this._byId.set(String(item.item_id), item);
        }
        const key = normaliseItemName(item.name);
        if (key && !this._byName.has(key)) this._byName.set(key, item);
      }
      this._revision += 1;
      document.dispatchEvent(new CustomEvent("iw:item-db-updated", {
        detail: {
          revision: this._revision,
          generatedAt: this._generatedAt,
          source,
          count: items.length
        },
        bubbles: false
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
      storageSet(CACHE_KEY, { items, generatedAt, cachedAt: Date.now() }).then((ok) => {
        if (!ok) warnOnce("itemdb:cache-write", new Error("cache write rejected"));
      });
    }
    getById(id) {
      if (!this._byId || id === void 0 || id === null) return null;
      return this._byId.get(String(id)) || null;
    }
    getByName(name) {
      if (!this._byName) return null;
      return this._byName.get(normaliseItemName(name)) || null;
    }
    find({ id, name } = {}) {
      if (id !== void 0 && id !== null && id !== "") {
        const hit = this.getById(id);
        if (hit) return hit;
      }
      return name ? this.getByName(name) : null;
    }
    all() {
      return this._items || [];
    }
  };
  var ItemDatabase = new _ItemDatabase();

  // src/modules/itemDisplay.js
  function finite(value) {
    if (value === void 0 || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function effectNumber(text, pattern) {
    const match = pattern.exec(String(text || ""));
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
    const text = item?.effects_raw || "";
    return {
      atk: fieldOrEffect(item, "atk", /\bATK\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      def: fieldOrEffect(item, "def", /\bDEF\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      hp: fieldOrEffect(item, "hp", /\bHP\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      warfare: fieldOrEffect(item, "warfare", /\bWarfare\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      xpPerTask: fieldOrEffect(item, "xp_per_task", /\bXP\s*\+?\s*(-?\d+(?:\.\d+)?)\s*\/\s*task\b/i),
      doubleGatherPct: fieldOrEffect(item, "double_gather_pct", /([+-]?\d+(?:\.\d+)?)%\s*(?:2x|2×)\s*gather(?:\s+chance)?\b/i),
      goldFindPct: fieldOrEffect(item, "gold_find_pct", /([+-]?\d+(?:\.\d+)?)%\s*gold\s+find\b/i),
      itemFindPct: fieldOrEffect(item, "item_find_pct", /([+-]?\d+(?:\.\d+)?)%\s*item\s+find\b/i),
      sockets: fieldOrEffect(item, "sockets", /\b(\d+)\s+Sockets?\b/i),
      allResists: effectNumber(text, /\bAll\s+Resists?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      fireResist: effectNumber(text, /\bFire\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      frostResist: effectNumber(text, /\bFrost\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      lightningResist: effectNumber(text, /\bLightning\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
      bonusBrewPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Brew\b/i),
      bonusEnhancePct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enhance\b/i),
      bonusEnchantPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enchant\b/i)
    };
  }
  var TIER_BANDS = [
    { max: 5, cls: "tier-common" },
    { max: 11, cls: "tier-uncommon" },
    { max: 17, cls: "tier-rare" },
    { max: 23, cls: "tier-epic" },
    { max: 29, cls: "tier-legendary" },
    { max: Infinity, cls: "tier-mythic" }
  ];
  function tierClass(item) {
    const t = Number(item && item.tier);
    if (!Number.isFinite(t)) return "tier-common";
    return (TIER_BANDS.find((b) => t <= b.max) || TIER_BANDS[0]).cls;
  }
  function slotLabel(item) {
    const sub = String(item && item.subcategory || "").trim();
    return sub.replace(/\s+slot$/i, "");
  }
  function has(v) {
    return v !== void 0 && v !== null && v !== "" && v !== 0;
  }
  function statChips(item, opts = {}) {
    if (!item) return [];
    const max = opts.max || 5;
    const chips = [];
    const stats = deriveDisplayStats(item);
    const slot = slotLabel(item);
    const tier = has(item.tier) ? `Tier ${item.tier}` : "";
    const context = [tier, slot].filter(Boolean).join(" · ");
    if (context) chips.push({ text: context, kind: "tier" });
    if (has(stats.atk)) chips.push({ text: `ATK +${stats.atk}`, kind: "pos" });
    if (has(stats.def)) chips.push({ text: `DEF +${stats.def}`, kind: "pos" });
    if (has(stats.hp)) chips.push({ text: `HP +${stats.hp}`, kind: "pos" });
    if (has(stats.warfare)) chips.push({ text: `WAR +${stats.warfare}`, kind: "pos" });
    if (has(stats.xpPerTask)) chips.push({ text: `XP +${stats.xpPerTask}`, kind: "pos" });
    if (has(stats.doubleGatherPct)) chips.push({ text: `2× gather ${stats.doubleGatherPct}%`, kind: "pos" });
    if (has(stats.goldFindPct)) chips.push({ text: `Gold +${stats.goldFindPct}%`, kind: "pos" });
    if (has(stats.itemFindPct)) chips.push({ text: `Find +${stats.itemFindPct}%`, kind: "pos" });
    if (has(stats.allResists)) {
      chips.push({ text: `All Resists +${stats.allResists}`, kind: "pos" });
    } else {
      if (has(stats.fireResist)) chips.push({ text: `Fire Resist +${stats.fireResist}`, kind: "pos" });
      if (has(stats.frostResist)) chips.push({ text: `Frost Resist +${stats.frostResist}`, kind: "pos" });
      if (has(stats.lightningResist)) chips.push({ text: `Lightning Resist +${stats.lightningResist}`, kind: "pos" });
    }
    if (has(stats.bonusBrewPct)) chips.push({ text: `Bonus Brew ${stats.bonusBrewPct}%`, kind: "pos" });
    if (has(stats.bonusEnhancePct)) chips.push({ text: `Bonus Enhance ${stats.bonusEnhancePct}%`, kind: "pos" });
    if (has(stats.bonusEnchantPct)) chips.push({ text: `Bonus Enchant ${stats.bonusEnchantPct}%`, kind: "pos" });
    if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
      chips.push({ text: `${item.skill_bonus_skill} +${item.skill_bonus_value}`, kind: "pos" });
    }
    if (has(stats.sockets)) {
      const n = Number(stats.sockets);
      chips.push({ text: n === 1 ? "1 socket" : `${n} sockets`, kind: "plain" });
    }
    return chips.slice(0, max);
  }
  function statRows(item) {
    if (!item) return [];
    const rows = [];
    const stats = deriveDisplayStats(item);
    const gold = (value) => `${Number(value).toLocaleString()}g`;
    if (has(stats.atk)) rows.push({ label: "⚔️ ATK", value: String(stats.atk) });
    if (has(stats.def)) rows.push({ label: "🛡️ DEF", value: String(stats.def) });
    if (has(stats.hp)) rows.push({ label: "❤️ HP", value: String(stats.hp) });
    if (has(stats.warfare)) rows.push({ label: "⚔️ Warfare", value: String(stats.warfare) });
    if (has(stats.xpPerTask)) rows.push({ label: "✨ XP/task", value: String(stats.xpPerTask) });
    if (has(stats.doubleGatherPct)) rows.push({ label: "🌿 2× Gather", value: `${stats.doubleGatherPct}%` });
    if (has(stats.goldFindPct)) rows.push({ label: "💰 Gold Find", value: `${stats.goldFindPct}%` });
    if (has(stats.itemFindPct)) rows.push({ label: "🔎 Item Find", value: `${stats.itemFindPct}%` });
    if (has(stats.allResists)) {
      rows.push({ label: "🜁 All Resists", value: `+${stats.allResists}` });
    } else {
      if (has(stats.fireResist)) rows.push({ label: "🔥 Fire Resist", value: `+${stats.fireResist}` });
      if (has(stats.frostResist)) rows.push({ label: "❄️ Frost Resist", value: `+${stats.frostResist}` });
      if (has(stats.lightningResist)) rows.push({ label: "⚡ Lightning Resist", value: `+${stats.lightningResist}` });
    }
    if (has(stats.bonusBrewPct)) rows.push({ label: "Bonus Brew", value: `${stats.bonusBrewPct}%` });
    if (has(stats.bonusEnhancePct)) rows.push({ label: "Bonus Enhance", value: `${stats.bonusEnhancePct}%` });
    if (has(stats.bonusEnchantPct)) rows.push({ label: "Bonus Enchant", value: `${stats.bonusEnchantPct}%` });
    if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
      rows.push({ label: `✨ ${item.skill_bonus_skill}`, value: `+${item.skill_bonus_value}` });
    }
    if (has(stats.sockets)) rows.push({ label: "🔷 Sockets", value: String(stats.sockets) });
    if (has(item.work_order_turn_in_gold) && /work order/i.test(String(item.work_order_turn_in_note || ""))) {
      rows.push({ label: "📦 Work order", value: gold(item.work_order_turn_in_gold), cls: "amber", note: String(item.work_order_turn_in_note || "").trim() });
    }
    if (has(item.base_value)) rows.push({ label: "💰 Base value", value: gold(item.base_value), cls: "amber" });
    if (has(item.trader_token_value)) {
      const n = Number(item.trader_token_value);
      rows.push({ label: "🏷️ Turn-in", value: `${n} token${n === 1 ? "" : "s"}` });
    }
    return rows;
  }

  // src/styles/tooltip-engine.css
  var tooltip_engine_default = '/* ══════════════════════════════════════════════════════════════════════\r\n   Tooltip engine — rich item-card treatment\r\n   ══════════════════════════════════════════════════════════════════════ */\r\n\r\n.iw-item-ref {\r\n  display: inline;\r\n  background: none !important;\r\n  border: 0 !important;\r\n  border-bottom: 1px solid transparent !important;\r\n  border-radius: 0 !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n  box-shadow: none !important;\r\n  font: inherit !important;\r\n  line-height: inherit !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: inherit !important;\r\n  text-transform: none !important;\r\n  color: var(--iw-gold);\r\n  cursor: help;\r\n  text-decoration: none;\r\n  transition: border-color .12s, color .12s;\r\n  vertical-align: baseline;\r\n}\r\n.iw-item-ref:hover,\r\n.iw-item-ref:focus-visible {\r\n  color: var(--iw-gold);\r\n  border-bottom-color: var(--iw-gold-dim) !important;\r\n}\r\n.iw-item-ref:focus-visible {\r\n  outline: 1px solid var(--iw-gold) !important;\r\n  outline-offset: 2px !important;\r\n}\r\n.iw-item-info { display: none; }\r\n\r\n.iw-tip {\r\n  position: fixed;\r\n  z-index: 99999;\r\n  width: 380px;\r\n  max-width: calc(100vw - 20px);\r\n  box-sizing: border-box;\r\n  background:\r\n    linear-gradient(180deg, rgba(255,255,255,.018), transparent 78px),\r\n    #151511;\r\n  border: 1px solid #57472C;\r\n  border-radius: 8px;\r\n  box-shadow: 0 18px 46px rgba(0,0,0,.82), inset 0 0 0 1px rgba(0,0,0,.58);\r\n  max-height: calc(100vh - 20px);\r\n  max-height: calc(100dvh - 20px);\r\n  flex-direction: column;\r\n  overflow: hidden;\r\n  overscroll-behavior: contain;\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 13px;\r\n  line-height: 1.4;\r\n  color: var(--iw-text);\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: none;\r\n}\r\n.iw-tip::before {\r\n  content: "";\r\n  position: absolute;\r\n  z-index: 2;\r\n  left: 0; right: 0; top: 0;\r\n  height: 2px;\r\n  background: linear-gradient(90deg, var(--iw-gold), var(--iw-line-hot) 42%, transparent 92%);\r\n  pointer-events: none;\r\n}\r\n.iw-tip.is-open { opacity: 1; pointer-events: auto; }\r\n.iw-tip:focus-visible {\r\n  outline: 2px solid var(--iw-gold);\r\n  outline-offset: -3px;\r\n}\r\n\r\n.iw-tip-head {\r\n  position: relative;\r\n  flex: none;\r\n  flex: none;\r\n  flex: none;\r\n  display: flex;\r\n  align-items: flex-start;\r\n  gap: 9px;\r\n  min-height: 116px;\r\n  padding: 12px 118px 12px 13px;\r\n  box-sizing: border-box;\r\n  background: linear-gradient(90deg, #1D1B17, #14130F 76%);\r\n  border-bottom: 1px solid #302A20;\r\n}\r\n.iw-tip-icon {\r\n  flex: none;\r\n  width: 24px;\r\n  padding-top: 2px;\r\n  font-size: 21px;\r\n  line-height: 1;\r\n  text-align: center;\r\n  filter: saturate(.85);\r\n}\r\n.iw-tip-title-block { flex: 1; min-width: 0; }\r\n.iw-tip-name {\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 18px;\r\n  font-weight: 700;\r\n  line-height: 1.15;\r\n  word-break: break-word;\r\n  text-shadow: 0 1px 0 #000;\r\n}\r\n\r\n.iw-tip-art {\r\n  position: absolute;\r\n  top: 8px;\r\n  right: 8px;\r\n  width: 100px;\r\n  height: 100px;\r\n  box-sizing: border-box;\r\n  display: grid;\r\n  place-items: center;\r\n  padding: 14px;\r\n  border: 1px solid rgba(240,232,214,.82);\r\n  border-radius: 12px;\r\n  background: #11110E;\r\n  box-shadow: inset 0 0 18px rgba(0,0,0,.62);\r\n  overflow: visible;\r\n  pointer-events: none;\r\n}\r\n.iw-tip-art-host {\r\n  position: relative;\r\n  display: block;\r\n  width: 70px;\r\n  height: 70px;\r\n  min-width: 70px;\r\n  min-height: 70px;\r\n  max-width: 70px;\r\n  max-height: 70px;\r\n  background-repeat: no-repeat;\r\n}\r\n.iw-tip-art-fallback {\r\n  display: grid;\r\n  place-items: center;\r\n  width: 70px;\r\n  height: 70px;\r\n  font-size: 34px;\r\n  opacity: .35;\r\n}\r\n.iw-tip-close {\r\n  flex: none;\r\n  width: 26px;\r\n  height: 26px;\r\n  display: grid;\r\n  place-items: center;\r\n  padding: 0 !important;\r\n  border: 1px solid #4A4031 !important;\r\n  border-radius: 4px !important;\r\n  background: rgba(12,11,9,.88) !important;\r\n  color: #C8BFAE !important;\r\n  font: 700 18px/1 var(--iw-font-ui) !important;\r\n  cursor: pointer;\r\n}\r\n.iw-tip-close:hover,\r\n.iw-tip-close:focus-visible {\r\n  border-color: var(--iw-gold) !important;\r\n  color: var(--iw-text-hi) !important;\r\n  outline: 1px solid var(--iw-gold) !important;\r\n}\r\n\r\n.iw-tip-badges {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 5px;\r\n  margin-top: 8px;\r\n}\r\n.iw-tip-badge {\r\n  font-size: 10.5px;\r\n  font-weight: 650;\r\n  line-height: 1.1;\r\n  letter-spacing: .01em;\r\n  white-space: nowrap;\r\n  padding: 4px 7px;\r\n  border: 1px solid #343027;\r\n  border-radius: 999px;\r\n  background: #1B1A17;\r\n  color: #B9B2A3;\r\n}\r\n.iw-tip-badge.t {\r\n  color: #AFC8F3;\r\n  border-color: rgba(91,155,213,.48);\r\n}\r\n.iw-tip-badge.req {\r\n  color: #E6A05B;\r\n  border-color: rgba(217,138,58,.48);\r\n}\r\n\r\n.iw-tip-body {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  padding: 12px 13px 13px;\r\n  overflow-y: auto;\r\n  overscroll-behavior: contain;\r\n  -webkit-overflow-scrolling: touch;\r\n  scrollbar-gutter: stable;\r\n}\r\n.iw-tip-sec {\r\n  margin-top: 12px;\r\n  padding-top: 10px;\r\n  border-top: 1px solid #302A20;\r\n}\r\n.iw-tip-sec:first-child { margin-top: 0; padding-top: 0; border-top: 0; }\r\n.iw-tip-sec-title {\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 10px;\r\n  font-weight: 800;\r\n  letter-spacing: .14em;\r\n  text-transform: uppercase;\r\n  color: #969080;\r\n  margin-bottom: 7px;\r\n}\r\n.iw-tip-effect {\r\n  color: #C4BDAF;\r\n  font-size: 13px;\r\n  line-height: 1.45;\r\n}\r\n\r\n.iw-tip-stats {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  gap: 4px 16px;\r\n}\r\n.iw-tip-stat-block { min-width: 0; }\r\n.iw-tip-stat {\r\n  min-width: 0;\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  font-size: 12.5px;\r\n  padding: 2px 0;\r\n}\r\n.iw-tip-stat .k {\r\n  min-width: 0;\r\n  color: #AAA394;\r\n  white-space: nowrap;\r\n}\r\n.iw-tip-stat .v {\r\n  flex: none;\r\n  color: var(--iw-text-hi);\r\n  font-weight: 700;\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.iw-tip-stat .v.amber { color: #E19A50; }\r\n.iw-tip-stat .v.good { color: var(--iw-good); }\r\n.iw-tip-stat-note {\r\n  margin-top: 1px;\r\n  color: var(--iw-faint);\r\n  font-size: 9.5px;\r\n  line-height: 1.25;\r\n}\r\n\r\n.iw-tip-acq {\r\n  position: relative;\r\n  padding: 2px 0 2px 11px;\r\n}\r\n.iw-tip-acq::before {\r\n  content: "";\r\n  position: absolute;\r\n  left: 0;\r\n  top: 0;\r\n  bottom: 0;\r\n  width: 2px;\r\n  background: #5878AC;\r\n}\r\n.iw-tip-acq-main {\r\n  font-size: 13.5px;\r\n  font-weight: 600;\r\n  color: var(--iw-text-hi);\r\n}\r\n.iw-tip-acq-sub {\r\n  font-size: 12px;\r\n  color: #8F899C;\r\n  margin-top: 3px;\r\n  line-height: 1.4;\r\n}\r\n.iw-tip-acq.is-unknown .iw-tip-acq-main { color: var(--iw-faint); font-style: italic; }\r\n.iw-tip-flavour {\r\n  font-family: var(--iw-font-flav);\r\n  font-style: italic;\r\n  font-size: 13px;\r\n  color: var(--iw-gold-dim);\r\n  line-height: 1.5;\r\n}\r\n\r\n.iw-tip-foot {\r\n  flex: none;\r\n  min-height: 38px;\r\n  padding: 8px 13px;\r\n  border-top: 1px solid #302A20;\r\n  background: #0C0B09;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n}\r\n.iw-tip-foot:empty { display: none; }\r\n.iw-tip-link {\r\n  font-size: 12px;\r\n  font-weight: 700;\r\n  letter-spacing: .02em;\r\n  color: #70A1EE;\r\n  text-decoration: none;\r\n}\r\n.iw-tip-link:hover { color: #9FC0F3; }\r\n.iw-tip-link:focus-visible {\r\n  color: #BBD2F5;\r\n  outline: 1px solid #70A1EE;\r\n  outline-offset: 3px;\r\n}\r\n.iw-tip-source {\r\n  margin-left: auto;\r\n  font-size: 10.5px;\r\n  font-weight: 700;\r\n  letter-spacing: .04em;\r\n  color: #B07846;\r\n  text-transform: lowercase;\r\n}\r\n.iw-tip-source.is-stale { color: #D58A52; }\r\n\r\n@media (max-width: 420px) {\r\n  .iw-tip { width: calc(100vw - 20px); }\r\n  .iw-tip-stats { grid-template-columns: 1fr; }\r\n  .iw-tip-head { padding-right: 108px; }\r\n  .iw-tip-art { width: 90px; height: 90px; padding: 10px; }\r\n  .iw-tip-art-host, .iw-tip-art-fallback { width: 68px; height: 68px; min-width: 68px; min-height: 68px; }\r\n}\r\n';

  // src/modules/TooltipEngine.js
  var SHOW_DELAY = 120;
  var EDGE_GAP = 0;
  var EDGE_MARGIN = 10;
  var STATE = {
    el: null,
    anchor: null,
    showTimer: null,
    pointerX: null,
    pointerY: null,
    keyboardOwned: false,
    bound: false
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isMobile() {
    return matchMedia("(hover: none), (pointer: coarse)").matches;
  }
  function findItem(ref) {
    return ItemDatabase.find(ref);
  }
  function categoryGlyph(item) {
    const category = String(item?.category || "").toLowerCase();
    const sub = String(item?.subcategory || "").toLowerCase();
    if (category.includes("equipment")) return "🛡️";
    if (category.includes("potion") || sub.includes("potion")) return "🧪";
    if (category.includes("gem") || sub.includes("gem")) return "💎";
    if (category.includes("scroll") || sub.includes("scroll")) return "📜";
    if (category.includes("material") || sub.includes("ore")) return "📦";
    return "◆";
  }
  function cleanEffectText(item) {
    return String(item?.effects_raw || "").replace(/[\u0000-\u001f\u007f]+/g, " • ").replace(/\s+([,.;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
  }
  function renderAcquisition(item) {
    const t = item.acquisition_type || "Unknown";
    let main = "", sub = "", unknown = false;
    if (t === "Crafted") {
      const skill = item.craft_skill ? item.craft_skill.charAt(0).toUpperCase() + item.craft_skill.slice(1) : "Crafting";
      main = "Crafted &middot; " + esc(skill);
      const bits = [];
      if (item.craft_level != null && item.craft_level !== "") bits.push(esc(skill) + " Lv " + item.craft_level);
      if (item.tier != null && item.tier !== "") bits.push("Tier " + item.tier + " recipe");
      sub = bits.join(" &middot; ");
    } else if (t === "ZoneDrop" || t === "BossDrop") {
      main = t === "BossDrop" ? "Boss drop" : "Zone drop";
      const bits = [];
      if (item.source_zone) bits.push("Zone " + esc(item.source_zone));
      if (item.drop_rate) bits.push("Rate " + esc(item.drop_rate));
      if (item.drop_boosted_by) bits.push("boosted by " + esc(item.drop_boosted_by));
      sub = bits.join(" &middot; ");
      if (!sub) sub = esc(item.acquisition_summary || item.acquisition_detail || "");
    } else if (t === "Gathered" || t === "Prospected") {
      main = t === "Gathered" ? "Gathered" : "Prospected";
      sub = item.acquisition_summary ? esc(item.acquisition_summary) : "";
    } else if (t === "Upgrade") {
      main = "Upgrade result";
      sub = item.acquisition_summary ? esc(item.acquisition_summary) : "Apply an Upgrade Orb to the base item";
    } else if (t === "Cache") {
      main = "Cache reward";
      sub = esc(item.acquisition_summary || "");
    } else if (t === "Shop") {
      main = "Shop purchase";
      sub = esc(item.acquisition_summary || "");
    } else if (t === "Unknown") {
      const sourceText = String(item.acquisition_summary || item.acquisition_detail || "").trim();
      if (sourceText) {
        main = "Source details";
        sub = esc(sourceText);
      } else {
        unknown = true;
        main = "Source not documented";
        sub = "Not covered by the wiki’s source index — may be a quest turn-in, idle gift or dungeon chest.";
      }
    } else {
      main = esc(t);
      sub = esc(item.acquisition_summary || "");
    }
    if (!sub && item.acquisition_summary && t !== "Crafted") sub = esc(item.acquisition_summary);
    return '<div class="iw-tip-sec"><div class="iw-tip-sec-title">How to get it</div><div class="iw-tip-acq' + (unknown ? " is-unknown" : "") + '"><div class="iw-tip-acq-main">' + main + "</div>" + (sub ? '<div class="iw-tip-acq-sub">' + sub + "</div>" : "") + "</div></div>";
  }
  function renderStats(item) {
    const rows = statRows(item);
    if (!rows.length) return "";
    return '<div class="iw-tip-sec"><div class="iw-tip-sec-title">Stats</div><div class="iw-tip-stats">' + rows.map(
      (r) => `<div class="iw-tip-stat-block"><div class="iw-tip-stat"><span class="k">${esc(r.label)}</span><span class="v${r.cls ? " " + r.cls : ""}">${esc(String(r.value))}</span></div>` + (r.note ? `<div class="iw-tip-stat-note">${esc(r.note)}</div>` : "") + `</div>`
    ).join("") + "</div></div>";
  }
  function renderBadges(item) {
    const badges = [];
    const glyph = categoryGlyph(item);
    if (item.tier != null && item.tier !== "") badges.push(`<span class="iw-tip-badge t">Tier ${esc(item.tier)}</span>`);
    if (item.category) badges.push(`<span class="iw-tip-badge">${glyph} ${esc(item.category)}</span>`);
    const slot = String(item.subcategory || "").trim();
    if (slot) badges.push(`<span class="iw-tip-badge">${esc(slot)}</span>`);
    const requirement = String(item.req_text || "").trim();
    if (requirement) {
      badges.push(`<span class="iw-tip-badge req">${esc(requirement)}</span>`);
    } else if (item.req_level) {
      const skill = String(item.req_skill || "").trim();
      const fallback = skill.toLowerCase() === "any" ? `Requires Lv ${item.req_level} (any skill)` : `Requires ${skill || "skill"} Lv ${item.req_level}`;
      badges.push(`<span class="iw-tip-badge req">${esc(fallback)}</span>`);
    }
    return badges.join("");
  }
  function renderCard(item) {
    const artHost = document.createElement("span");
    artHost.className = "iw-tip-art-host";
    const painted = AtlasService.paint(artHost, { id: item.item_id, name: item.name });
    const acq = renderAcquisition(item);
    const stats = renderStats(item);
    const badges = renderBadges(item);
    const tier = tierClass(item);
    const glyph = categoryGlyph(item);
    const effect = cleanEffectText(item);
    const effectSec = effect ? `<div class="iw-tip-sec iw-tip-effect-sec"><div class="iw-tip-effect">${esc(effect)}</div></div>` : "";
    const isGear = String(item.category || "").toLowerCase().includes("equipment");
    const artClass = isGear ? "iw-tip-gear-art" : "iw-tip-item-art";
    const wikiLink = item.wiki_slug ? `<a class="iw-tip-link" href="https://idleworlds.com/wiki/items/${esc(item.wiki_slug)}" target="_blank" rel="noopener noreferrer">📖 Wiki ↗</a>` : "";
    const source = ItemDatabase.source();
    const sourceLabel = source === "network" ? "live data" : source === "stale-cache" ? "stale cached data" : source === "cache" ? "cached data" : "item data";
    const sourceClass = source === "stale-cache" ? " is-stale" : "";
    return {
      html: `
      <div class="iw-tip-head has-art ${isGear ? "has-gear-art" : "has-item-art"}">
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
      painted
    };
  }
  function position(anchor) {
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = STATE.el;
    el.style.visibility = "hidden";
    el.style.display = "flex";
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x = rect.left;
    let y = rect.bottom + EDGE_GAP;
    if (y + th + EDGE_MARGIN > vh) {
      y = rect.top - th - EDGE_GAP;
    }
    if (x + tw + EDGE_MARGIN > vw) x = vw - tw - EDGE_MARGIN;
    if (x < EDGE_MARGIN) x = EDGE_MARGIN;
    if (y < EDGE_MARGIN) y = EDGE_MARGIN;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = "visible";
  }
  function clearShowTimer() {
    if (STATE.showTimer) clearTimeout(STATE.showTimer);
    STATE.showTimer = null;
  }
  function isOpen() {
    return !!STATE.el?.classList.contains("is-open");
  }
  function nodeInside(root, node) {
    return !!(root && node && (node === root || root.contains(node)));
  }
  var TRIGGER_SELECTOR = [
    ".iw-item-ref[data-iw-item]",
    ".iw-item-ref[data-iw-item-name]",
    '[data-iw-tooltip-trigger="1"][data-iw-item]',
    '[data-iw-tooltip-trigger="1"][data-iw-item-name]'
  ].join(", ");
  function findTrigger(node) {
    return node && node.closest ? node.closest(TRIGGER_SELECTOR) : null;
  }
  function isVirtual(anchor) {
    return !!(anchor && anchor.__virtual);
  }
  function anchorContainsPointer() {
    if (!isVirtual(STATE.anchor)) return false;
    if (STATE.pointerX == null || STATE.pointerY == null) return false;
    const r = STATE.anchor.getBoundingClientRect();
    if (!r) return false;
    return STATE.pointerX >= r.left && STATE.pointerX <= r.right && STATE.pointerY >= r.top && STATE.pointerY <= r.bottom;
  }
  function activeSurfaceForNode(node) {
    if (STATE.el && node && nodeInside(STATE.el, node)) return "tooltip";
    if (isVirtual(STATE.anchor)) return anchorContainsPointer() ? "anchor" : null;
    if (!node) return null;
    if (STATE.anchor && nodeInside(STATE.anchor, node)) return "anchor";
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
    anchor.removeAttribute("aria-describedby");
    anchor.setAttribute("aria-expanded", "false");
  }
  function show(anchor, { keyboard = false } = {}) {
    if (!anchor?.isConnected) return;
    const item = isVirtual(anchor) ? anchor.item : findItem({
      id: anchor.getAttribute("data-iw-item"),
      name: anchor.getAttribute("data-iw-item-name")
    });
    if (!item) return;
    clearShowTimer();
    if (STATE.anchor && STATE.anchor !== anchor) cleanupAnchor(STATE.anchor);
    const { html, artHost, painted } = renderCard(item);
    STATE.el.innerHTML = html;
    const artSlot = STATE.el.querySelector(".iw-tip-art");
    if (artSlot && painted) {
      artSlot.textContent = "";
      artHost.classList.add("iw-tip-art-painted");
      artSlot.appendChild(artHost);
    }
    STATE.anchor = anchor;
    STATE.keyboardOwned = keyboard;
    STATE.el.setAttribute("aria-label", `${item.name} item details`);
    if (!isVirtual(anchor)) {
      anchor.setAttribute("aria-controls", "iw-tip");
      anchor.setAttribute("aria-haspopup", "dialog");
      anchor.setAttribute("aria-expanded", "true");
    }
    position(anchor);
    STATE.el.classList.add("is-open");
    if (keyboard) {
      try {
        STATE.el.focus({ preventScroll: true });
      } catch {
        STATE.el.focus();
      }
    }
  }
  function hide() {
    clearShowTimer();
    if (STATE.el) {
      STATE.el.classList.remove("is-open");
      STATE.el.style.display = "none";
      STATE.el.style.visibility = "hidden";
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
      if (!isMobile() && !anchor.matches(":hover")) return;
      show(anchor);
    }, SHOW_DELAY);
  }
  function initTooltipEngine() {
    if (STATE.bound) return;
    STATE.bound = true;
    inject("tooltip-engine", tooltip_engine_default);
    STATE.el = document.createElement("div");
    STATE.el.id = "iw-tip";
    STATE.el.className = "iw-tip";
    STATE.el.setAttribute("role", "dialog");
    STATE.el.setAttribute("aria-modal", "false");
    STATE.el.setAttribute("aria-label", "Item details");
    STATE.el.setAttribute("tabindex", "-1");
    STATE.el.style.display = "none";
    document.body.appendChild(STATE.el);
    STATE.el.addEventListener("mouseenter", () => {
      clearShowTimer();
    });
    STATE.el.addEventListener("mouseleave", (e) => {
      if (STATE.keyboardOwned) return;
      if (!isMobile() && STATE.anchor && nodeInside(STATE.anchor, e.relatedTarget)) return;
      hide();
    });
    STATE.el.addEventListener("focusout", (e) => {
      if (!STATE.keyboardOwned) return;
      if (STATE.el.contains(e.relatedTarget)) return;
      if (!isVirtual(STATE.anchor) && nodeInside(STATE.anchor, e.relatedTarget)) return;
      hide();
    });
    STATE.el.addEventListener("click", (e) => {
      if (!e.target.closest?.(".iw-tip-close")) return;
      const anchor = STATE.anchor;
      const restoreFocus = STATE.keyboardOwned;
      hide();
      if (restoreFocus && anchor?.focus) anchor.focus();
    });
    document.addEventListener("mouseover", (e) => {
      if (isMobile() || STATE.keyboardOwned) return;
      const t = findTrigger(e.target);
      if (!t) return;
      if (t === STATE.anchor && isOpen()) return;
      if (STATE.anchor && STATE.anchor !== t) hide();
      scheduleShow(t);
    }, true);
    document.addEventListener("mouseout", (e) => {
      if (isMobile() || STATE.keyboardOwned) return;
      const t = findTrigger(e.target);
      if (!t) return;
      if (e.relatedTarget && findTrigger(e.relatedTarget) === t) return;
      clearShowTimer();
      if (STATE.anchor === t && STATE.el && nodeInside(STATE.el, e.relatedTarget)) return;
      hide();
    }, true);
    document.addEventListener("mousemove", (e) => {
      if (isMobile()) return;
      STATE.pointerX = e.clientX;
      STATE.pointerY = e.clientY;
      if (STATE.keyboardOwned) return;
      if (STATE.showTimer && !findTrigger(e.target)) clearShowTimer();
      if (isOpen() && !STATE.keyboardOwned && !activeSurfaceForNode(e.target)) hide();
    }, true);
    document.addEventListener("click", (e) => {
      const t = findTrigger(e.target);
      if (t) {
        clearShowTimer();
        if (isMobile()) {
          if (STATE.anchor === t && isOpen()) hide();
          else show(t);
        } else {
          show(t);
        }
        return;
      }
      if (STATE.el.contains(e.target)) return;
      hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!STATE.anchor) return;
        const a = STATE.anchor;
        hide();
        if (a && a.focus) a.focus();
        return;
      }
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
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
      if (!STATE.anchor.isConnected) {
        hide();
        return;
      }
      if (!isMobile() && !STATE.keyboardOwned) {
        const surface = activeSurfaceForNode(pointerNode());
        if (!surface) {
          hide();
          return;
        }
        if (surface === "tooltip") return;
      }
      position(STATE.anchor);
    };
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    window.addEventListener("blur", hide);
    document.addEventListener("iw:dom-flush", () => {
      if (!isOpen()) return;
      const raf2 = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
      raf2(() => {
        if (!STATE.anchor?.isConnected) {
          hide();
          return;
        }
        if (!isMobile() && !STATE.keyboardOwned && !pointerIsOnActiveSurface()) hide();
      });
    });
    const refreshOpen = () => {
      if (!STATE.anchor || !isOpen()) return;
      if (!STATE.anchor.isConnected) {
        hide();
        return;
      }
      if (STATE.keyboardOwned) return;
      if (!isMobile() && !pointerIsOnActiveSurface()) {
        hide();
        return;
      }
      show(STATE.anchor);
    };
    document.addEventListener("iw:atlas-updated", refreshOpen);
    document.addEventListener("iw:item-db-updated", refreshOpen);
  }
  var virtualAnchor = {
    __virtual: true,
    isConnected: true,
    item: null,
    source: null,
    _rect: () => null,
    getBoundingClientRect() {
      return this._rect() || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
  };
  function showForItem(item, rectProvider, source = "virtual") {
    if (!item || typeof rectProvider !== "function") return;
    virtualAnchor.item = item;
    virtualAnchor.source = source;
    virtualAnchor._rect = rectProvider;
    show(virtualAnchor);
  }
  function hideTooltip(source) {
    if (source && STATE.anchor && (!isVirtual(STATE.anchor) || STATE.anchor.source !== source)) return;
    hide();
  }
  function isTooltipOpen() {
    return isOpen();
  }
  function itemRef(nameOrItem, label, opts = {}) {
    const isObj = nameOrItem && typeof nameOrItem === "object";
    const name = isObj ? nameOrItem.name : String(nameOrItem == null ? "" : nameOrItem);
    const id = isObj ? nameOrItem.item_id : null;
    const text = opts.html != null ? opts.html : esc(label != null ? label : name);
    if (!name && !id) return text;
    const attr = id ? `data-iw-item="${esc(id)}"` : `data-iw-item-name="${esc(name)}"`;
    const glyph = '<span class="iw-item-info" aria-hidden="true">i</span>';
    const inner = opts.iconOnly ? glyph : `<span class="iw-item-name">${text}</span>${glyph}`;
    return `<span class="iw-item-ref" role="button" tabindex="0" ${attr} aria-haspopup="dialog" aria-controls="iw-tip" aria-expanded="false" aria-label="${esc(name)}, item details">${inner}</span>`;
  }

  // src/modules/NameScanner.js
  var HIGHLIGHT_NAME = "iw-item-name";
  var MIN_NAME_LENGTH = 3;
  var SKIP_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "IW-TIP",
    "CANVAS",
    "SVG"
  ]);
  var SKIP_CONTAINERS = '.iw-item-ref, .fs-inv-row, .fs-skill-header, .iw-tip, [role="tooltip"], input, textarea, select';
  var _trie = null;
  var _trieRevision = -1;
  function buildTrie() {
    const items = ItemDatabase.all();
    if (!items.length) return null;
    const revision = ItemDatabase.revision();
    if (_trie && _trieRevision === revision) return _trie;
    const root = { children: /* @__PURE__ */ new Map(), item: null };
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
      if (!node.children.has(ch)) node.children.set(ch, { children: /* @__PURE__ */ new Map(), item: null });
      node = node.children.get(ch);
    }
    node.item = item;
  }
  function longestMatchAt(root, lowerText, start2) {
    let node = root;
    let best = null;
    let i = start2;
    while (i < lowerText.length) {
      const next = node.children.get(lowerText[i]);
      if (!next) break;
      node = next;
      i += 1;
      if (node.item) {
        const after = lowerText[i];
        if (after === void 0 || !/[a-z0-9]/i.test(after)) {
          best = { length: i - start2, item: node.item };
        }
      }
    }
    return best;
  }
  var matchIndex = /* @__PURE__ */ new Map();
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
  var supportsHighlight = typeof CSS !== "undefined" && typeof CSS.highlights !== "undefined" && typeof Highlight !== "undefined";
  var rebuildQueued = false;
  function queueHighlightRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    raf(() => {
      rebuildQueued = false;
      guard("name-scan:highlight", rebuildHighlight);
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
        if (m.end > len) continue;
        const range = document.createRange();
        try {
          range.setStart(node, m.start);
          range.setEnd(node, m.end);
          ranges.push(range);
        } catch (err) {
        }
      }
    }
    if (!supportsHighlight) return;
    try {
      if (!ranges.length) CSS.highlights.delete(HIGHLIGHT_NAME);
      else CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    } catch (err) {
      warnOnce("name-scan:highlight-set", err);
    }
  }
  var hoverBound = false;
  var activeItem = null;
  var pointerQueued = false;
  var lastX = 0;
  var lastY = 0;
  function rectContains(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  function pointTextNode(x, y) {
    try {
      const pos = document.caretPositionFromPoint?.(x, y);
      if (pos?.offsetNode?.nodeType === 3) return pos.offsetNode;
    } catch {
    }
    try {
      const range = document.caretRangeFromPoint?.(x, y);
      if (range?.startContainer?.nodeType === 3) return range.startContainer;
    } catch {
    }
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
      } catch {
        continue;
      }
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
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    const add = (node2) => {
      if (node2?.nodeType === 3 && !seen.has(node2) && matchIndex.has(node2)) {
        seen.add(node2);
        candidates.push(node2);
      }
    };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) add(node);
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
    return !!el?.closest?.(".iw-tip");
  }
  function isTouchLike() {
    return matchMedia("(hover: none), (pointer: coarse)").matches;
  }
  function handlePointer() {
    pointerQueued = false;
    const hit = hitTest(lastX, lastY);
    if (!hit) {
      if (activeItem && isTooltipOpen() && pointerInsideTooltip(lastX, lastY)) return;
      if (activeItem) {
        activeItem = null;
        hideTooltip("name-scan");
      }
      return;
    }
    if (activeItem === hit.item && isTooltipOpen()) return;
    activeItem = hit.item;
    showForItem(hit.item, () => {
      const fresh = hitTest(lastX, lastY);
      return fresh ? fresh.rect : hit.rect;
    }, "name-scan");
  }
  function bindHover() {
    if (hoverBound) return;
    hoverBound = true;
    document.addEventListener("mousemove", (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (pointerQueued) return;
      pointerQueued = true;
      raf(() => guard("name-scan:pointer", handlePointer));
    }, { passive: true, capture: true });
    document.addEventListener("click", (e) => {
      if (!isTouchLike()) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (!hit) return;
      activeItem = hit.item;
      showForItem(hit.item, () => {
        const fresh = hitTest(e.clientX, e.clientY);
        return fresh ? fresh.rect : hit.rect;
      }, "name-scan");
    });
    window.addEventListener("scroll", () => {
      if (activeItem) {
        activeItem = null;
        hideTooltip("name-scan");
      }
    }, { passive: true, capture: true });
  }
  function scanForItemNames(root) {
    if (!root || !root.isConnected) return 0;
    const trie = buildTrie();
    if (!trie) return 0;
    bindHover();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node2) {
        if (shouldSkipParent(node2.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let matchedNodes = 0;
    let node;
    while (node = walker.nextNode()) {
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
  function clearItemNameScan() {
    matchIndex.clear();
    activeItem = null;
    if (supportsHighlight) {
      try {
        CSS.highlights.delete(HIGHLIGHT_NAME);
      } catch (err) {
      }
    }
  }

  // src/modules/InventoryModel.js
  var ACTION_WORDS = /^(equip|equipped|unequip|list|sell|use|drop|lock|unlock|deposit|withdraw|set bonus)$/i;
  var QUANTITY = /^(?:x|×)\s*\d[\d,]*$/i;
  var LEVEL_ONLY = /^lv\.?\s*\d+$/i;
  var NUMBER_ONLY = /^\d[\d,]*$/;
  var TIER_OR_SLOT = /^(?:tier\s*\d+|level\s*\d+)(?:\s*[·•-]\s*.+)?$/i;
  var BASIC_STAT = /^(?:atk|def|hp|war(?:fare)?)\s*\+?-?\d+/i;
  var SUMMARY_STAT = /(?:\bxp\b.*\/task|\bitem find\b|\bgold find\b|\bdouble gather\b|\b2\s*[×x]\s*gather\b|\bsockets?\b)/i;
  var REQUIREMENT = /^(?:requires?|needs)\b/i;
  var LOADOUT = /\b(?:in\s+)?loadout\b/i;
  var UPGRADE_STATE = /\b(?:not\s+)?upgradable\b|\bcannot\s+be\s+upgraded\b/i;
  var SOCKET_EFFECT = /\b(?:cut\s+[a-z][a-z' -]*|sunstone|moonstone|gem(?:stone)?|socketed)\b/i;
  var DYNAMIC_EFFECT = /:\s*[+-]?\d+(?:\.\d+)?(?:%|\b)/i;
  var SET_STATE = /\bset bonus\b/i;
  function normaliseInventoryText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  }
  function compareKey(value) {
    return normaliseInventoryText(value).toLowerCase().replace(/[.:;,]+$/g, "").replace(/\s+/g, " ");
  }
  function splitLevelName(name) {
    const text = normaliseInventoryText(name);
    const m = text.match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
    return m ? { full: text, base: m[1].trim(), level: m[2] } : { full: text, base: text, level: null };
  }
  function kindFor(text) {
    if (LOADOUT.test(text)) return "loadout";
    if (SOCKET_EFFECT.test(text)) return "socket";
    if (DYNAMIC_EFFECT.test(text)) return "effect";
    if (SET_STATE.test(text)) return "set";
    if (UPGRADE_STATE.test(text)) return "status";
    return "detail";
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
  function resolveInventoryItemName(texts, getByName) {
    const lookup = typeof getByName === "function" ? getByName : () => null;
    const source = (texts || []).map((t) => String(t == null ? "" : t).trim()).filter(Boolean);
    const candidates = source.filter(
      (t) => t.length > 2 && !/^\d[\d,]*$/.test(t) && !/^[x×]\s*\d/i.test(t) && !/^lv\.?\s*\d+$/i.test(t) && !/^\+\s*[1-4]$/.test(t) && !/^(equip|equipped|unequip|use|drop|sell|list|lock|unlock|set bonus)$/i.test(t)
    );
    const upgradeToken = source.find((t) => /^\+\s*[1-4]$/.test(t));
    if (upgradeToken) {
      const suffix = "+" + upgradeToken.replace(/\D/g, "");
      for (const base of candidates) {
        for (const combined of [base + suffix, base + " " + suffix]) {
          if (lookup(combined)) return combined;
        }
      }
    }
    for (const c of candidates) if (lookup(c)) return c;
    const lvPat = /^lv\.?\s*(\d+)$/i;
    for (let i = 0; i < source.length; i++) {
      const base = source[i];
      if (!base || base.length < 3) continue;
      const prev = source[i - 1] || "";
      const next = source[i + 1] || "";
      for (const lv of [prev, next]) {
        const m = lvPat.exec(lv);
        if (!m) continue;
        for (const combined of [base + " Lv. " + m[1], base + " Lv " + m[1]]) {
          if (lookup(combined)) return combined;
        }
      }
    }
    return candidates[0] || "";
  }
  function buildInventoryDetails(rawTexts, item, displayName) {
    const nameParts = splitLevelName(item?.name || displayName || "");
    const counts = /* @__PURE__ */ new Map();
    const requirements = [];
    const requirementKeys = /* @__PURE__ */ new Set();
    const source = (rawTexts || []).map(normaliseInventoryText).filter(Boolean).sort((a, b) => a.length - b.length);
    const atomics = [];
    for (const text of source) {
      if (text.length > 220 || isLikelyAggregate(text, nameParts)) continue;
      const key = compareKey(text);
      const containsAtomic = atomics.some((shorter) => {
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
        const key2 = compareKey(text);
        if (!requirementKeys.has(key2)) {
          requirementKeys.add(key2);
          requirements.push(text);
        }
        continue;
      }
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
    if (!model) return "";
    return [
      ...(model.details || []).map((d) => `${d.kind}:${compareKey(d.text)}:${d.count || 1}`),
      ...(model.requirements || []).map((r) => `req:${compareKey(r)}`)
    ].join("|");
  }

  // src/modules/InlineStyleOwner.js
  function createInlineStyleOwner() {
    const states = /* @__PURE__ */ new WeakMap();
    const tracked = /* @__PURE__ */ new Set();
    const refByElement = /* @__PURE__ */ new WeakMap();
    const weakTracking = typeof WeakRef === "function" && typeof FinalizationRegistry === "function";
    const finalizer = weakTracking ? new FinalizationRegistry((ref) => tracked.delete(ref)) : null;
    function track(el) {
      if (refByElement.has(el)) return;
      const ref = weakTracking ? new WeakRef(el) : el;
      refByElement.set(el, ref);
      tracked.add(ref);
      finalizer?.register(el, ref, ref);
    }
    function untrack(el) {
      const ref = refByElement.get(el);
      if (!ref) return;
      tracked.delete(ref);
      finalizer?.unregister(ref);
      refByElement.delete(el);
    }
    function trackedElements() {
      const live = [];
      for (const ref of [...tracked]) {
        const el = weakTracking ? ref.deref() : ref;
        if (el) live.push(el);
        else tracked.delete(ref);
      }
      return live;
    }
    function stateFor(el, prop) {
      let props = states.get(el);
      if (!props) {
        props = /* @__PURE__ */ new Map();
        states.set(el, props);
        track(el);
      }
      let state = props.get(prop);
      const currentValue = el.style.getPropertyValue(prop);
      const currentPriority = el.style.getPropertyPriority(prop);
      if (!state) {
        state = {
          nativeValue: currentValue,
          nativePriority: currentPriority,
          appliedValue: null,
          appliedPriority: null
        };
        props.set(prop, state);
      } else if (state.appliedValue !== null && (currentValue !== state.appliedValue || currentPriority !== state.appliedPriority)) {
        state.nativeValue = currentValue;
        state.nativePriority = currentPriority;
      }
      return state;
    }
    function set(el, prop, value, priority = "important") {
      if (!el?.style) return false;
      const state = stateFor(el, prop);
      const beforeValue = el.style.getPropertyValue(prop);
      const beforePriority = el.style.getPropertyPriority(prop);
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
        const stillOurs = currentValue === state.appliedValue && currentPriority === state.appliedPriority;
        if (!stillOurs) continue;
        if (state.nativeValue) {
          el.style.setProperty(prop, state.nativeValue, state.nativePriority || "");
        } else {
          el.style.removeProperty(prop);
        }
      }
      states.delete(el);
      untrack(el);
    }
    function restoreWithin(root) {
      if (!root) return;
      for (const el of trackedElements()) {
        if (el === root || root.contains?.(el)) restoreElement(el);
      }
    }
    function restoreAll() {
      for (const el of trackedElements()) restoreElement(el);
    }
    return { set, restoreElement, restoreWithin, restoreAll };
  }

  // src/styles/inventory.css
  var inventory_default = '/* ══════════════════════════════════════════════════════════════════════\r\n   Inventory / ItemRow — reusable owned-item presentation\r\n\r\n   Inventory is the reference implementation for reusable RPG item rows.\r\n   React-owned commands remain live DOM nodes; the Fantasy Skin owns the\r\n   item presentation and semantic action treatment only.\r\n   ══════════════════════════════════════════════════════════════════════ */\r\n\r\n/* ── Inventory chrome ─────────────────────────────────────────────── */\r\n[data-iw-inventory-root="1"] {\r\n  --fs-inv-command-w: 54px;\r\n}\r\n\r\n[data-iw-inventory-title="1"] {\r\n  /* --iw-font-display was never defined in base.css (only --iw-font-head,\r\n     --iw-font-ui and --iw-font-flav), so this declaration was invalid at\r\n     computed-value time and the Inventory title silently inherited whatever\r\n     the game was using. (Audit S3.1) */\r\n  font-family: var(--iw-font-head) !important;\r\n  font-size: 16px !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: .045em !important;\r\n  text-transform: uppercase !important;\r\n  color: var(--iw-text) !important;\r\n}\r\n\r\n[data-iw-inventory-root="1"] [data-iw-inventory-control="filter"],\r\n[data-iw-inventory-root="1"] [data-iw-inventory-control="page"] {\r\n  min-height: 28px !important;\r\n  height: 28px !important;\r\n  border-radius: 2px !important;\r\n  padding: 0 10px !important;\r\n  font-family: var(--iw-font-ui) !important;\r\n  font-size: 11px !important;\r\n  font-weight: 700 !important;\r\n  line-height: 26px !important;\r\n  letter-spacing: .015em !important;\r\n}\r\n\r\n[data-iw-inventory-root="1"] [data-iw-inventory-control="icon"] {\r\n  width: 28px !important;\r\n  height: 28px !important;\r\n  min-width: 28px !important;\r\n  min-height: 28px !important;\r\n  padding: 0 !important;\r\n  border-radius: 2px !important;\r\n}\r\n\r\n[data-iw-inventory-root="1"] [data-iw-inventory-control="page-count"] {\r\n  color: var(--iw-faint) !important;\r\n  font-family: var(--iw-font-ui) !important;\r\n  font-size: 10px !important;\r\n  font-variant-numeric: tabular-nums;\r\n  letter-spacing: .08em;\r\n}\r\n\r\n/* ── Row shell ────────────────────────────────────────────────────── */\r\n.compact-row:has(> .fs-inv-row),\r\n[class*="item-row"]:has(> .fs-inv-row) {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 0 !important;\r\n  min-height: 62px !important;\r\n  padding: 0 !important;\r\n  position: relative !important;\r\n  overflow: hidden !important;\r\n  border: 1px solid var(--iw-line) !important;\r\n  border-radius: 3px !important;\r\n  background:\r\n    linear-gradient(180deg, rgba(255,255,255,.014), transparent 38%),\r\n    #12110E !important;\r\n  box-shadow:\r\n    inset 0 1px 0 rgba(255,255,255,.014),\r\n    inset 0 -1px 0 rgba(0,0,0,.35) !important;\r\n  transition: border-color .12s, background-color .12s !important;\r\n}\r\n\r\n.compact-row:has(> .fs-inv-row):hover,\r\n[class*="item-row"]:has(> .fs-inv-row):hover {\r\n  border-color: #4B402B !important;\r\n  background:\r\n    linear-gradient(90deg, rgba(232,183,106,.025), transparent 32%),\r\n    #14120F !important;\r\n}\r\n\r\n.fs-inv-row {\r\n  --fs-tier: var(--iw-t-common);\r\n  order: 1;\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  min-height: 60px;\r\n  box-sizing: border-box;\r\n  display: grid;\r\n  grid-template-columns: 52px minmax(0, 1fr) 38px;\r\n  grid-template-areas: "icon body qty";\r\n  align-items: center;\r\n  column-gap: 11px;\r\n  padding: 6px 8px 6px 13px;\r\n  position: relative;\r\n  cursor: default;\r\n}\r\n.fs-inv-row.has-details,\r\n.fs-inv-row.has-requirements { min-height: 68px; }\r\n.fs-inv-row.has-details.has-requirements { min-height: 76px; }\r\n\r\n.fs-inv-row.tier-uncommon  { --fs-tier: var(--iw-t-uncommon); }\r\n.fs-inv-row.tier-rare      { --fs-tier: var(--iw-t-rare); }\r\n.fs-inv-row.tier-epic      { --fs-tier: var(--iw-t-epic); }\r\n.fs-inv-row.tier-legendary { --fs-tier: var(--iw-t-legendary); }\r\n.fs-inv-row.tier-mythic    { --fs-tier: var(--iw-t-mythic); }\r\n\r\n.fs-inv-row::before {\r\n  content: "";\r\n  position: absolute;\r\n  left: 0;\r\n  top: 8px;\r\n  bottom: 8px;\r\n  width: 2px;\r\n  background: var(--fs-tier);\r\n  opacity: .82;\r\n  pointer-events: none;\r\n}\r\n\r\n/* ── Icon slot ────────────────────────────────────────────────────── */\r\n.fs-inv-icon {\r\n  grid-area: icon;\r\n  width: 52px;\r\n  height: 52px;\r\n  min-width: 52px;\r\n  min-height: 52px;\r\n  position: relative;\r\n  background-repeat: no-repeat;\r\n  background-color: #080806;\r\n  border: 1px solid #3A3020;\r\n  border-radius: 2px;\r\n  box-shadow:\r\n    inset 0 0 0 1px rgba(0,0,0,.62),\r\n    inset 0 0 14px rgba(0,0,0,.5);\r\n  image-rendering: auto;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  font-size: 18px;\r\n  color: var(--iw-faint);\r\n  overflow: hidden;\r\n  cursor: help;\r\n  outline: none;\r\n}\r\n.fs-inv-icon:hover,\r\n.fs-inv-icon:focus-visible {\r\n  border-color: var(--fs-tier);\r\n  box-shadow:\r\n    inset 0 0 0 1px rgba(0,0,0,.62),\r\n    inset 0 0 14px rgba(0,0,0,.5),\r\n    0 0 0 1px color-mix(in srgb, var(--fs-tier) 22%, transparent);\r\n}\r\n.fs-inv-row.is-equipped .fs-inv-icon {\r\n  box-shadow:\r\n    inset 0 0 0 1px rgba(0,0,0,.62),\r\n    inset 0 0 14px rgba(0,0,0,.5),\r\n    0 0 0 1px rgba(80,150,94,.18);\r\n}\r\n\r\n/* ── Identity / information rails ────────────────────────────────── */\r\n.fs-inv-body {\r\n  grid-area: body;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  overflow: hidden;\r\n  align-self: center;\r\n  padding-block: 1px;\r\n}\r\n\r\n.fs-inv-name {\r\n  display: -webkit-box;\r\n  -webkit-box-orient: vertical;\r\n  -webkit-line-clamp: 2;\r\n  line-clamp: 2;\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 13px;\r\n  font-weight: 700;\r\n  line-height: 1.18;\r\n  letter-spacing: .005em;\r\n  white-space: normal;\r\n  overflow: hidden;\r\n  overflow-wrap: anywhere;\r\n  text-overflow: ellipsis;\r\n  text-shadow: 0 1px 0 #000;\r\n}\r\n.fs-inv-name .fs-inv-sub {\r\n  color: var(--iw-faint);\r\n  font-size: 11px;\r\n  font-weight: 600;\r\n}\r\n.fs-inv-name-plain { color: var(--iw-text); }\r\n.fs-inv-name .iw-item-ref { color: inherit; }\r\n.fs-inv-name .iw-item-ref:hover,\r\n.fs-inv-name .iw-item-ref:focus-visible { border-bottom-color: currentColor; }\r\n\r\n/* Stable database information: one compact rail, no boxed stat chips. */\r\n.fs-inv-stats {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 0;\r\n  margin-top: 3px;\r\n  min-height: 13px;\r\n}\r\n.fs-stat {\r\n  position: relative;\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 10px;\r\n  line-height: 1.25;\r\n  font-weight: 600;\r\n  color: var(--iw-dim);\r\n  background: none;\r\n  border: 0;\r\n  border-radius: 0;\r\n  padding: 0 7px 0 0;\r\n  margin-right: 7px;\r\n  font-variant-numeric: tabular-nums;\r\n  white-space: nowrap;\r\n}\r\n.fs-stat:not(:last-child)::after {\r\n  content: "";\r\n  position: absolute;\r\n  right: 0;\r\n  top: 2px;\r\n  bottom: 1px;\r\n  width: 1px;\r\n  background: #332C1E;\r\n}\r\n.fs-stat--pos  { color: var(--iw-good); }\r\n.fs-stat--tier { color: var(--iw-gold-dim); }\r\n\r\n/* Dynamic owned-item state. These lines deliberately look like equipment\r\n   inscriptions, not application badges. */\r\n.fs-inv-details,\r\n.fs-inv-requirements {\r\n  display: flex;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  overflow: hidden;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 3px 12px;\r\n  margin-top: 3px;\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 9.5px;\r\n  line-height: 1.25;\r\n}\r\n\r\n.fs-inv-detail,\r\n.fs-inv-requirement {\r\n  position: relative;\r\n  min-width: 0;\r\n  color: var(--iw-dim);\r\n  max-width: 100%;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.fs-inv-detail::before,\r\n.fs-inv-requirement::before {\r\n  content: "◆";\r\n  margin-right: 4px;\r\n  font-size: 6px;\r\n  vertical-align: 1px;\r\n  color: var(--iw-gold-dim);\r\n}\r\n.fs-inv-detail--loadout { color: #74AFCB; }\r\n.fs-inv-detail--loadout::before { color: #5D97B3; }\r\n.fs-inv-detail--socket { color: #C7B56A; }\r\n.fs-inv-detail--socket::before { color: #73B7D4; }\r\n.fs-inv-detail--effect { color: #B8C6A2; }\r\n.fs-inv-detail--effect::before { color: #879A73; }\r\n.fs-inv-detail--status { color: var(--iw-faint); }\r\n.fs-inv-detail--status::before { color: var(--iw-faint); }\r\n.fs-inv-detail--set { color: #C8B562; }\r\n.fs-inv-requirement { color: #D8C76A; }\r\n.fs-inv-requirement::before { color: #BCA744; }\r\n.fs-inv-detail-count {\r\n  margin-left: 4px;\r\n  color: var(--iw-faint);\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n\r\n.fs-inv-qty {\r\n  grid-area: qty;\r\n  justify-self: end;\r\n  align-self: center;\r\n  min-width: 34px;\r\n  padding-right: 2px;\r\n  text-align: right;\r\n  font-family: var(--iw-font-ui);\r\n  font-size: 11px;\r\n  font-weight: 700;\r\n  color: var(--iw-dim);\r\n  font-variant-numeric: tabular-nums;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* ── React-owned action rail ─────────────────────────────────────── */\r\n[data-fs-action-host="1"] {\r\n  display: contents !important;\r\n  font-size: 0 !important;\r\n  line-height: 0 !important;\r\n  color: transparent !important;\r\n}\r\n[data-fs-suppressed="1"] { display: none !important; }\r\n\r\n[data-fs-preserved-action="control"] {\r\n  order: 2;\r\n  flex: 0 0 auto !important;\r\n  align-self: center !important;\r\n  position: relative;\r\n  z-index: 2;\r\n  margin: 0 5px 0 0 !important;\r\n  min-width: 0 !important;\r\n  max-width: none !important;\r\n}\r\n\r\nbutton[data-fs-preserved-action="control"],\r\na[data-fs-preserved-action="control"],\r\n[role="button"][data-fs-preserved-action="control"] {\r\n  height: 28px !important;\r\n  min-height: 28px !important;\r\n  padding: 0 8px !important;\r\n  border-radius: 2px !important;\r\n  border: 1px solid var(--iw-line-hi) !important;\r\n  background: linear-gradient(180deg, #201D17, #15130F) !important;\r\n  color: var(--iw-text) !important;\r\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 1px 0 #000 !important;\r\n  font-family: var(--iw-font-ui) !important;\r\n  font-size: 10px !important;\r\n  line-height: 26px !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: .025em !important;\r\n  text-transform: none !important;\r\n  white-space: nowrap !important;\r\n}\r\nbutton[data-fs-preserved-action="control"]:hover:not(:disabled),\r\na[data-fs-preserved-action="control"]:hover,\r\n[role="button"][data-fs-preserved-action="control"]:hover {\r\n  border-color: var(--iw-gold-dim) !important;\r\n  color: var(--iw-gold) !important;\r\n  background: linear-gradient(180deg, #29241A, #19160F) !important;\r\n}\r\n\r\n[data-fs-action-kind="equipped"] {\r\n  width: 70px !important;\r\n  border-color: #315E3A !important;\r\n  background: linear-gradient(180deg, #193520, #102518) !important;\r\n  color: #A9D7AF !important;\r\n}\r\n[data-fs-action-kind="equip"] {\r\n  width: 48px !important;\r\n  border-color: #5A4728 !important;\r\n  color: #E1C48A !important;\r\n}\r\n[data-fs-action-kind="set"] {\r\n  width: 72px !important;\r\n  color: #D1C06C !important;\r\n  border-color: #514621 !important;\r\n}\r\n[data-fs-action-kind="secondary"] { width: 44px !important; }\r\n[data-fs-action-kind="icon"] {\r\n  width: 28px !important;\r\n  min-width: 28px !important;\r\n  padding: 0 !important;\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  line-height: 1 !important;\r\n}\r\n\r\nbutton[data-fs-preserved-action="control"]:disabled,\r\n[role="button"][data-fs-preserved-action="control"][aria-disabled="true"] {\r\n  opacity: .42 !important;\r\n  color: var(--iw-faint) !important;\r\n  border-color: var(--iw-line) !important;\r\n  background: #12110E !important;\r\n}\r\n\r\n/* ── Responsive collapse ─────────────────────────────────────────── */\r\n@media (max-width: 900px) {\r\n  .fs-inv-row {\r\n    grid-template-columns: 46px minmax(0, 1fr) 34px;\r\n    min-height: 56px;\r\n    padding-left: 10px;\r\n    column-gap: 9px;\r\n  }\r\n  .fs-inv-icon { width: 46px; height: 46px; min-width: 46px; min-height: 46px; }\r\n  .fs-inv-stats .fs-stat:nth-child(n+6) { display: none; }\r\n  .fs-inv-details { max-height: 26px; overflow: hidden; }\r\n}\r\n\r\n@media (max-width: 700px) {\r\n  .compact-row:has(> .fs-inv-row),\r\n  [class*="item-row"]:has(> .fs-inv-row) {\r\n    flex-wrap: wrap !important;\r\n    align-items: center !important;\r\n    padding-bottom: 5px !important;\r\n  }\r\n  .fs-inv-row {\r\n    flex: 1 0 100%;\r\n    grid-template-columns: 42px minmax(0, 1fr) 34px;\r\n    grid-template-areas: "icon body qty";\r\n  }\r\n  .fs-inv-icon { width: 42px; height: 42px; min-width: 42px; min-height: 42px; }\r\n  .fs-inv-qty { justify-self: end; padding: 0 2px 0 0; text-align: right; }\r\n  .fs-inv-stats .fs-stat:nth-child(n+4) { display: none; }\r\n  .fs-inv-details,\r\n  .fs-inv-requirements {\r\n    display: flex;\r\n    max-height: none;\r\n    overflow: visible;\r\n    gap: 2px 8px;\r\n    font-size: 9px;\r\n  }\r\n  .fs-inv-detail,\r\n  .fs-inv-requirement {\r\n    white-space: normal;\r\n    overflow: visible;\r\n    text-overflow: clip;\r\n  }\r\n  [data-fs-preserved-action="control"] {\r\n    margin-top: 3px !important;\r\n  }\r\n  button[data-fs-preserved-action="control"],\r\n  a[data-fs-preserved-action="control"],\r\n  [role="button"][data-fs-preserved-action="control"] {\r\n    padding-inline: 6px !important;\r\n  }\r\n}\r\n';

  // src/modules/InventoryRenderer.js
  var RENDERED_ATTR = "data-fs-inv";
  var HIDDEN_ATTR = "data-fs-hidden";
  var ACTION_ATTR = "data-fs-preserved-action";
  var ACTION_HOST_ATTR = "data-fs-action-host";
  var SUPPRESSED_ATTR = "data-fs-suppressed";
  var ACTION_KIND_ATTR = "data-fs-action-kind";
  var INVENTORY_ROOT_ATTR = "data-iw-inventory-root";
  var INVENTORY_CONTROL_ATTR = "data-iw-inventory-control";
  var INVENTORY_TITLE_ATTR = "data-iw-inventory-title";
  var INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]';
  var pendingEmptyRetries = /* @__PURE__ */ new WeakSet();
  var displayStyleOwner = createInlineStyleOwner();
  var cheapSignatures = /* @__PURE__ */ new WeakMap();
  var listenerBound = false;
  function cheapSignature(row) {
    return {
      childCount: row.childElementCount,
      text: row.textContent || "",
      dbRevision: ItemDatabase.revision(),
      atlasRevision: AtlasService.revision()
    };
  }
  function sameCheapSignature(a, b) {
    return !!a && !!b && a.childCount === b.childCount && a.text === b.text && a.dbRevision === b.dbRevision && a.atlasRevision === b.atlasRevision;
  }
  function esc2(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function isInsideNativeControl(el, row) {
    const control = el.closest?.(INTERACTIVE_SELECTOR);
    return !!(control && control !== row && row.contains(control));
  }
  function leafTexts(row) {
    return [...row.querySelectorAll("span, div, p")].filter((el) => !el.closest(".fs-inv-row")).filter((el) => !isInsideNativeControl(el, row)).filter((el) => el.childElementCount === 0).map((el) => el.textContent.trim()).filter(Boolean);
  }
  function detailTexts(row, displayName = "") {
    const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d/i;
    const records = [];
    for (const el of row.querySelectorAll("span, div, p, li")) {
      if (el.closest(".fs-inv-row") || isInsideNativeControl(el, row)) continue;
      const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 220 || !interesting.test(text)) continue;
      records.push({ el, text, key: text.toLowerCase() });
    }
    const deNested = records.filter((rec, idx) => !records.some(
      (other, j) => idx !== j && rec.key === other.key && rec.el.contains(other.el)
    ));
    const nameKey = String(displayName || "").replace(/\s+/g, " ").trim().toLowerCase();
    const ordered = deNested.sort((a, b) => a.text.length - b.text.length);
    const kept = [];
    for (const rec of ordered) {
      const { text, key } = rec;
      if (nameKey && key.startsWith(nameKey) && /(?:\btier\b|\b(?:atk|def|hp)\s*[+-]?\d|\bxp\b.*\/task|\brequires?\b|\bupgrad|\bloadout\b)/i.test(text)) {
        continue;
      }
      const containsAtomic = kept.some(
        (shorter) => shorter.text.length < text.length && shorter.key.length >= 5 && key.includes(shorter.key)
      );
      if (containsAtomic) continue;
      kept.push(rec);
    }
    return kept.map((rec) => rec.text);
  }
  function guessQuantity(texts) {
    for (const t of texts) {
      const m = t.match(/^[x×]\s*(\d[\d,]*)$/i);
      if (m) return m[1].replace(/,/g, "");
    }
    const nums = texts.filter((t) => /^\d[\d,]*$/.test(t));
    return nums.length ? nums[nums.length - 1].replace(/,/g, "") : null;
  }
  function extractRowData(row) {
    const texts = leafTexts(row);
    const name = resolveInventoryItemName(texts, (name2) => ItemDatabase.getByName(name2));
    return { name, qty: guessQuantity(texts), detailTexts: detailTexts(row, name) };
  }
  function findInventoryRoot(row) {
    let cur = row;
    for (let depth = 0; cur && depth < 8; depth += 1, cur = cur.parentElement) {
      const aria = String(cur.getAttribute?.("aria-label") || "").trim().toLowerCase();
      if (aria === "inventory") return cur;
      const headings = cur.querySelectorAll?.(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]") || [];
      for (const h of headings) {
        if (String(h.textContent || "").trim().toLowerCase() === "inventory") return cur;
      }
    }
    return null;
  }
  function isInventoryContext(row) {
    const controls = [...row.querySelectorAll('button, [role="button"]')].map((el) => String(el.textContent || "").trim().toLowerCase()).filter(Boolean);
    if (controls.some((t) => /^(equip|equipped|unequip|list)$/.test(t))) return true;
    return !!findInventoryRoot(row);
  }
  function classifyInventoryChrome(root) {
    if (!root) return;
    root.setAttribute(INVENTORY_ROOT_ATTR, "1");
    const titleCandidates = root.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]");
    for (const title of titleCandidates) {
      if (String(title.textContent || "").trim().toLowerCase() === "inventory") {
        title.setAttribute(INVENTORY_TITLE_ATTR, "1");
      }
    }
    const buttons = [...root.querySelectorAll('button, [role="button"]')];
    for (const button of buttons) {
      if (button.closest('.compact-row, [class*="item-row"]')) continue;
      const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      let role = "";
      if (/^(all|gear|materials|consumables|drops)$/.test(text)) role = "filter";
      else if (/^(prev|previous|next)$/.test(text)) role = "page";
      else if (!text || text.length <= 2) role = "icon";
      if (role) button.setAttribute(INVENTORY_CONTROL_ATTR, role);
    }
    for (const el of root.querySelectorAll("span, div, p")) {
      if (el.closest('.compact-row, [class*="item-row"]')) continue;
      const text = String(el.textContent || "").trim();
      if (/^\d+\s*\/\s*\d+$/.test(text)) el.setAttribute(INVENTORY_CONTROL_ATTR, "page-count");
    }
  }
  function splitLevel(name) {
    const m = String(name || "").match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
    return m ? { base: m[1].trim(), level: m[2] } : { base: name, level: null };
  }
  function isInteractiveHost(el) {
    return !!(el.matches?.(INTERACTIVE_SELECTOR) || el.querySelector?.(INTERACTIVE_SELECTOR));
  }
  function restoreDisplay(el) {
    displayStyleOwner.restoreElement(el);
  }
  function suppressDisplayBranch(el) {
    el.setAttribute(SUPPRESSED_ATTR, "1");
    el.removeAttribute(ACTION_ATTR);
    el.removeAttribute(ACTION_HOST_ATTR);
    displayStyleOwner.set(el, "display", "none", "");
  }
  function classifyActionControl(el) {
    const text = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (/^equipped$|^unequip$/.test(text)) return "equipped";
    if (/^equip$/.test(text)) return "equip";
    if (/set bonus/.test(text)) return "set";
    if (/^list$|^sell$|^use$|^deposit$|^withdraw$/.test(text)) return "secondary";
    if (/^lock$|^unlock$/.test(text) || !text && el.querySelector?.("svg")) return "icon";
    return "secondary";
  }
  function preserveInteractiveTree(el) {
    if (!el) return;
    if (el.matches?.(INTERACTIVE_SELECTOR)) {
      el.setAttribute(ACTION_ATTR, "control");
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
    el.setAttribute(ACTION_ATTR, "host");
    el.setAttribute(ACTION_HOST_ATTR, "1");
    el.removeAttribute(SUPPRESSED_ATTR);
    restoreDisplay(el);
    [...el.children].forEach((child) => preserveInteractiveTree(child));
  }
  function hideOriginalChildren(row, overlay) {
    [...row.children].forEach((child) => {
      if (child === overlay || child.classList?.contains("fs-inv-row")) return;
      if (isInteractiveHost(child)) preserveInteractiveTree(child);
      else suppressDisplayBranch(child);
    });
  }
  function restoreOriginalChildren(row) {
    displayStyleOwner.restoreWithin(row);
    row.querySelectorAll(`[${HIDDEN_ATTR}], [${ACTION_ATTR}], [${ACTION_HOST_ATTR}], [${SUPPRESSED_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDDEN_ATTR);
      el.removeAttribute(ACTION_ATTR);
      el.removeAttribute(ACTION_HOST_ATTR);
      el.removeAttribute(SUPPRESSED_ATTR);
      el.removeAttribute(ACTION_KIND_ATTR);
    });
  }
  function clearRenderedRow(row) {
    row.querySelectorAll(":scope > .fs-inv-row").forEach((el) => el.remove());
    restoreOriginalChildren(row);
    row.removeAttribute(RENDERED_ATTR);
  }
  function rowSignature(data, item, detailModel) {
    return [
      item ? String(item.item_id ?? item.name) : data.name,
      data.qty || "",
      inventoryDetailSignature(detailModel),
      ItemDatabase.revision(),
      AtlasService.revision()
    ].join("|");
  }
  function scheduleEmptyRetry(row) {
    if (pendingEmptyRetries.has(row)) return;
    pendingEmptyRetries.add(row);
    raf(() => guard("inventory:empty-retry", () => {
      pendingEmptyRetries.delete(row);
      if (!row.isConnected) return;
      const retry = extractRowData(row);
      if (retry.name) renderRow(row);
      else if (row.querySelector(":scope > .fs-inv-row")) clearRenderedRow(row);
    }));
  }
  function configureIconTooltip(host, item, data) {
    if (!host) return;
    const name = item?.name || data.name;
    if (item?.item_id != null) host.setAttribute("data-iw-item", String(item.item_id));
    else host.setAttribute("data-iw-item-name", name);
    host.setAttribute("data-iw-tooltip-trigger", "1");
    host.removeAttribute("role");
    host.setAttribute("tabindex", "0");
    host.setAttribute("aria-haspopup", "true");
    host.setAttribute("aria-expanded", "false");
    host.setAttribute("aria-label", `${name}, item details`);
  }
  function paintIcon(overlay, item, data) {
    const host = overlay.querySelector(".fs-inv-icon");
    if (!host) return;
    configureIconTooltip(host, item, data);
    const fullName = item ? item.name : data.name;
    const ref = item ? { id: item.item_id, name: fullName } : { name: fullName };
    const apply = () => {
      if (!overlay.isConnected || !host.isConnected) return;
      host.textContent = "";
      if (!AtlasService.paint(host, ref)) host.textContent = "❓";
    };
    if (AtlasService.isReady()) apply();
    AtlasService.ready().then(apply).catch(() => {
      if (host.isConnected && !host.style.backgroundImage) host.textContent = "❓";
    });
  }
  function detailHTML(detailModel) {
    const details = (detailModel?.details || []).map((detail) => {
      const count = detail.count > 1 ? `<span class="fs-inv-detail-count">×${detail.count}</span>` : "";
      return `<span class="fs-inv-detail fs-inv-detail--${esc2(detail.kind)}">${esc2(detail.text)}${count}</span>`;
    }).join("");
    const requirements = (detailModel?.requirements || []).map(
      (text) => `<span class="fs-inv-requirement">${esc2(text)}</span>`
    ).join("");
    return {
      details: details ? `<div class="fs-inv-details">${details}</div>` : "",
      requirements: requirements ? `<div class="fs-inv-requirements">${requirements}</div>` : ""
    };
  }
  function syncRowState(row, overlay) {
    if (!overlay) return;
    const kinds = [...row.querySelectorAll(`[${ACTION_ATTR}="control"]`)].map((el) => el.getAttribute(ACTION_KIND_ATTR));
    overlay.classList.toggle("is-equipped", kinds.includes("equipped"));
    overlay.classList.toggle("has-set-action", kinds.includes("set"));
  }
  function renderRow(row) {
    if (!row || !row.isConnected) return;
    if (!isInventoryContext(row)) {
      if (row.querySelector(":scope > .fs-inv-row")) clearRenderedRow(row);
      return;
    }
    const existingOverlay = row.querySelector(":scope > .fs-inv-row");
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
    const existing = row.querySelector(":scope > .fs-inv-row");
    if (existing && row.getAttribute(RENDERED_ATTR) === signature) {
      hideOriginalChildren(row, existing);
      syncRowState(row, existing);
      cheapSignatures.set(row, cheapSig);
      return;
    }
    if (existing) existing.remove();
    restoreOriginalChildren(row);
    const tier = item ? tierClass(item) : "tier-common";
    const { base, level } = splitLevel(item ? item.name : data.name);
    const nameHTML = item ? itemRef(item, base) : `<span class="fs-inv-name-plain">${esc2(base)}</span>`;
    const levelHTML = level ? ` <span class="fs-inv-sub">Lv ${esc2(level)}</span>` : "";
    const chips = item ? statChips(item, { max: 8 }) : [];
    const chipsHTML = chips.map((c) => {
      const mod = c.kind === "pos" ? " fs-stat--pos" : c.kind === "tier" ? " fs-stat--tier" : "";
      return `<span class="fs-stat${mod}">${esc2(c.text)}</span>`;
    }).join("");
    const dynamic = detailHTML(detailModel);
    const overlay = document.createElement("div");
    overlay.className = `fs-inv-row ${tier}${dynamic.details ? " has-details" : ""}${dynamic.requirements ? " has-requirements" : ""}`;
    overlay.innerHTML = `
    <div class="fs-inv-icon"></div>
    <div class="fs-inv-body">
      <div class="fs-inv-name ${tier}">${nameHTML}${levelHTML}</div>
      ${chipsHTML ? `<div class="fs-inv-stats">${chipsHTML}</div>` : ""}
      ${dynamic.details}
      ${dynamic.requirements}
    </div>
    ${data.qty ? `<span class="fs-inv-qty">×${esc2(data.qty)}</span>` : ""}
  `;
    row.appendChild(overlay);
    hideOriginalChildren(row, overlay);
    syncRowState(row, overlay);
    row.setAttribute(RENDERED_ATTR, signature);
    cheapSignatures.set(row, cheapSig);
    paintIcon(overlay, item, data);
  }
  function reconcileAll() {
    guardEach(
      "inventory:reconcile-all",
      document.querySelectorAll('.compact-row, [class*="item-row"]'),
      renderRow
    );
  }
  function clearInventoryRenderer() {
    guardEach(
      "inventory:teardown",
      document.querySelectorAll('.compact-row, [class*="item-row"]'),
      (row) => {
        if (row.querySelector(":scope > .fs-inv-row")) clearRenderedRow(row);
        cheapSignatures.delete(row);
      }
    );
    document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach((el) => {
      el.removeAttribute(INVENTORY_ROOT_ATTR);
    });
    document.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}]`).forEach((el) => {
      el.removeAttribute(INVENTORY_CONTROL_ATTR);
      el.removeAttribute(INVENTORY_TITLE_ATTR);
    });
    displayStyleOwner.restoreAll();
  }
  function initInventoryRenderer() {
    inject("inventory", inventory_default);
    if (listenerBound) return;
    listenerBound = true;
    on("iw:inventory-row", (e) => guard("inventory:row", () => renderRow(e.detail.row)));
    document.addEventListener("iw:item-db-updated", reconcileAll);
    document.addEventListener("iw:atlas-updated", reconcileAll);
  }

  // src/styles/skillpanel.css
  var skillpanel_default = `/* ══════════════════════════════════════════════════════════════════════\r
   Skill panels — compact action frame\r
\r
   The panel is a dense RPG action row, not a metric card. Native gameplay DOM\r
   remains intact; semantic role attributes provide deterministic alignment.\r
   ══════════════════════════════════════════════════════════════════════ */\r
\r
.fs-skill--combat    { --fs-skill-accent: #B84A20; }\r
.fs-skill--mining    { --fs-skill-accent: #84919B; }\r
.fs-skill--smithing  { --fs-skill-accent: #B28A2A; }\r
.fs-skill--gathering { --fs-skill-accent: #579A5D; }\r
.fs-skill--alchemy   { --fs-skill-accent: #9271B2; }\r
.fs-skill--jewelcrafting { --fs-skill-accent: #4E9FB8; }\r
.fs-skill--spellcrafting { --fs-skill-accent: #8B6FC3; }\r
.fs-skill--tailoring { --fs-skill-accent: #A56E86; }\r
.fs-skill--crafting  { --fs-skill-accent: #5E8FB7; }\r
.fs-skill--fishing   { --fs-skill-accent: #478FA8; }\r
\r
.compact-panel.fs-skill-panel {\r
  position: relative !important;\r
  min-height: 0 !important;\r
  margin-bottom: 6px !important;\r
  padding-top: 8px !important;\r
  padding-bottom: 8px !important;\r
  background:\r
    linear-gradient(90deg, color-mix(in srgb, var(--fs-skill-accent) 4%, transparent), transparent 28%),\r
    linear-gradient(180deg, rgba(255,255,255,.010), transparent 34px),\r
    #12110E !important;\r
  border: 1px solid #392F21 !important;\r
  border-left: 2px solid var(--fs-skill-accent, var(--iw-line-hi)) !important;\r
  border-radius: 3px !important;\r
  box-shadow:\r
    inset 0 0 0 1px rgba(0,0,0,.38),\r
    inset 0 1px 0 rgba(255,255,255,.012),\r
    inset 0 -1px 0 rgba(0,0,0,.44) !important;\r
}\r
\r
.compact-panel.fs-skill-panel::before {\r
  content: "";\r
  position: absolute;\r
  z-index: 0;\r
  pointer-events: none;\r
  left: 0;\r
  top: 0;\r
  width: 64px;\r
  height: 1px;\r
  background: linear-gradient(90deg, var(--iw-gold), var(--iw-line-hot) 62%, transparent);\r
  opacity: .78;\r
}\r
\r
/* v1.5.0 used a large watermark glyph here. It fought with the information\r
   hierarchy, so the pseudo-element is intentionally disabled. */\r
.compact-panel.fs-skill-panel::after { content: none !important; }\r
\r
.fs-skill-wrapper { display: contents !important; }\r
.fs-skill-header { display: none !important; }\r
\r
/* Strict alignment only when the renderer proves three existing top-level\r
   zones: skill identity, action content and commands. */\r
.compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] {\r
  display: grid !important;\r
  grid-template-columns: 96px minmax(0, 1fr) 126px !important;\r
  grid-template-areas: "identity content commands" !important;\r
  gap: 0 14px !important;\r
  align-items: center !important;\r
  padding: 8px 12px !important;\r
}\r
\r
.compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] > [data-iw-skill-zone="identity"] {\r
  grid-area: identity !important;\r
  min-width: 0 !important;\r
}\r
.compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] > [data-iw-skill-zone="content"] {\r
  grid-area: content !important;\r
  min-width: 0 !important;\r
}\r
.compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] > [data-iw-skill-zone="commands"] {\r
  grid-area: commands !important;\r
  min-width: 0 !important;\r
  justify-self: stretch !important;\r
}\r
\r
/* ── Skill information hierarchy ────────────────────────────────────── */\r
[data-iw-skill-role="identity"] {\r
  position: relative !important;\r
  min-width: 78px !important;\r
  color: var(--iw-text-hi) !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 12.5px !important;\r
  font-weight: 700 !important;\r
  line-height: 1.18 !important;\r
  letter-spacing: .015em !important;\r
  text-shadow: 0 1px 0 #000 !important;\r
}\r
\r
[data-iw-skill-role="identity"]::after {\r
  content: "";\r
  position: absolute;\r
  left: 0;\r
  right: 28%;\r
  bottom: -5px;\r
  height: 1px;\r
  background: linear-gradient(90deg, var(--fs-skill-accent), transparent);\r
  opacity: .34;\r
}\r
\r
[data-iw-skill-role="action-title"] {\r
  color: var(--iw-text-hi) !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 16.5px !important;\r
  line-height: 1.1 !important;\r
  font-weight: 700 !important;\r
  letter-spacing: 0 !important;\r
  text-shadow: 0 1px 0 #000 !important;\r
}\r
\r
/* XP readout is data, never a callout card. */\r
[data-iw-skill-role="level-progress"] {\r
  display: block !important;\r
  width: auto !important;\r
  max-width: none !important;\r
  min-width: 0 !important;\r
  min-height: 0 !important;\r
  height: auto !important;\r
  margin: 3px 0 0 !important;\r
  padding: 0 !important;\r
  color: #B7AF9F !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 11.5px !important;\r
  line-height: 1.2 !important;\r
  font-weight: 600 !important;\r
  font-variant-numeric: tabular-nums !important;\r
  letter-spacing: .01em !important;\r
  text-transform: none !important;\r
  border: 0 !important;\r
  outline: 0 !important;\r
  border-radius: 0 !important;\r
  background: transparent !important;\r
  background-image: none !important;\r
  box-shadow: none !important;\r
}\r
\r
[data-iw-skill-role="xp-gain"] {\r
  display: inline-block !important;\r
  margin-top: 2px !important;\r
  color: var(--iw-gold-dim) !important;\r
  font-size: 10.5px !important;\r
  line-height: 1.15 !important;\r
  font-weight: 700 !important;\r
  font-variant-numeric: tabular-nums !important;\r
}\r
\r
[data-iw-skill-role="requirement"] {\r
  margin-top: 2px !important;\r
  color: #D58282 !important;\r
  font-size: 10.8px !important;\r
  line-height: 1.15 !important;\r
  font-weight: 600 !important;\r
}\r
\r
[data-iw-skill-role="reward"] {\r
  margin-top: 2px !important;\r
  color: #AAA291 !important;\r
  font-size: 10.8px !important;\r
  line-height: 1.15 !important;\r
}\r
\r
[data-iw-skill-role="action-detail"] {\r
  margin-top: 3px !important;\r
  color: #C7C0B2 !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 11.5px !important;\r
  line-height: 1.2 !important;\r
  font-weight: 500 !important;\r
  letter-spacing: 0 !important;\r
}\r
\r
[data-iw-skill-role="ingredient"] {\r
  display: inline-flex !important;\r
  align-items: baseline !important;\r
  gap: 5px !important;\r
  margin-top: 3px !important;\r
  padding: 0 !important;\r
  color: var(--iw-dim) !important;\r
  border: 0 !important;\r
  border-radius: 0 !important;\r
  background: transparent !important;\r
  background-image: none !important;\r
  box-shadow: none !important;\r
}\r
\r
.compact-panel.fs-skill-panel .iw-item-ref {\r
  color: #C9B17A !important;\r
  font-weight: 700 !important;\r
  letter-spacing: .015em !important;\r
  text-transform: uppercase !important;\r
  border-bottom-color: rgba(201,177,122,.20) !important;\r
}\r
\r
/* ── Progress rail ──────────────────────────────────────────────────── */\r
[data-iw-skill-role="progress-track"] {\r
  height: 4px !important;\r
  min-height: 4px !important;\r
  max-height: 4px !important;\r
  margin-top: 5px !important;\r
  overflow: hidden !important;\r
  border: 1px solid #29241B !important;\r
  border-radius: 0 !important;\r
  background: #080806 !important;\r
  box-shadow: inset 0 1px 2px rgba(0,0,0,.80) !important;\r
}\r
\r
[data-iw-skill-role="progress-fill"] {\r
  height: 100% !important;\r
  border-radius: 0 !important;\r
  background: linear-gradient(90deg, color-mix(in srgb, var(--fs-skill-accent) 68%, #5F2914), var(--fs-skill-accent)) !important;\r
  box-shadow: none !important;\r
}\r
\r
/* Existing readout/ingredient shells are data, not boxed controls. */\r
/* Metric shells in the live skill panel may draw their frame with pseudo\r
   elements rather than the element's own border/background. Kill those only on\r
   the positively identified XP readout branch. */\r
.compact-panel.fs-skill-panel [data-iw-readout]::before,\r
.compact-panel.fs-skill-panel [data-iw-readout]::after {\r
  content: none !important;\r
  display: none !important;\r
  border: 0 !important;\r
  background: none !important;\r
  box-shadow: none !important;\r
}\r
\r
[data-iw-readout],\r
[data-iw-ingr] {\r
  width: auto !important;\r
  max-width: none !important;\r
  min-width: 0 !important;\r
  min-height: 0 !important;\r
  height: auto !important;\r
  max-height: none !important;\r
  margin: 0 !important;\r
  background: transparent !important;\r
  background-color: transparent !important;\r
  background-image: none !important;\r
  border: 0 !important;\r
  border-radius: 0 !important;\r
  outline: 0 !important;\r
  padding: 0 !important;\r
  box-shadow: none !important;\r
  cursor: default !important;\r
}\r
\r
/* The live game nests the XP text inside several same-text shells. Every shell\r
   is now marked/neutralised by the renderer; keep their typography inherited so\r
   an inner Tailwind text class cannot recreate the large metric-card look. */\r
.compact-panel.fs-skill-panel [data-iw-readout] {\r
  color: #B7AF9F !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 11.5px !important;\r
  line-height: 1.18 !important;\r
  font-weight: 600 !important;\r
  letter-spacing: .01em !important;\r
  text-transform: none !important;\r
}\r
\r
.compact-panel.fs-skill-panel [data-iw-skill-role="level-progress"] {\r
  margin-top: 2px !important;\r
}\r
\r
/* ── Command rail ───────────────────────────────────────────────────── */\r
[data-iw-skill-role="nav-group"] {\r
  display: inline-flex !important;\r
  align-items: center !important;\r
  justify-content: flex-end !important;\r
  gap: 4px !important;\r
}\r
\r
.compact-panel.fs-skill-panel button:not([data-iw-skill-role="level-progress"]) {\r
  align-self: center !important;\r
  border-radius: 2px !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-skill-role="nav-button"] {\r
  width: 30px !important;\r
  min-width: 30px !important;\r
  height: 30px !important;\r
  min-height: 30px !important;\r
  padding: 0 !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-skill-role="action-button"] {\r
  width: 96px !important;\r
  min-width: 96px !important;\r
  height: 34px !important;\r
  min-height: 34px !important;\r
  justify-content: center !important;\r
  letter-spacing: .07em !important;\r
}\r
\r
/* CSS fallbacks for the button skins SkillPanelRenderer also writes inline.\r
   The inline copies exist because React re-asserts its own geometry during\r
   updates; these exist because the inline copies are only present once the\r
   renderer has run. Without them a panel renders its commands as bare controls\r
   between mount and first reconcile — pale boxes with near-invisible labels.\r
   Keep the two in sync with BUTTON_STYLES in SkillPanelRenderer.js. */\r
.compact-panel.fs-skill-panel button[data-iw-skill-role="action-button"],\r
.compact-panel.fs-skill-panel button[data-iw-btn-state="primary"] {\r
  background: linear-gradient(180deg, #A94318, #742A0D) !important;\r
  border: 1px solid #C05A28 !important;\r
  color: #FFEAD1 !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 12px !important;\r
  font-weight: 700 !important;\r
  letter-spacing: .06em !important;\r
  text-transform: uppercase !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-skill-role="nav-button"],\r
.compact-panel.fs-skill-panel button[data-iw-btn-state="secondary"],\r
.compact-panel.fs-skill-panel button[data-iw-btn-state="icon"] {\r
  background: linear-gradient(180deg, #242018, #17140F) !important;\r
  border: 1px solid #58482B !important;\r
  color: #DAD3C3 !important;\r
  font-family: var(--iw-font-ui) !important;\r
  font-weight: 700 !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-skill-role="action-button"]:hover:not(:disabled) {\r
  background: linear-gradient(180deg, #C04D1C, #87310E) !important;\r
  border-color: var(--iw-ember-hi) !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-btn-state="primary"] {\r
  color: #FFE8CE !important;\r
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 1px 0 #000 !important;\r
}\r
\r
.compact-panel.fs-skill-panel button[data-iw-btn-state="disabled"] {\r
  opacity: .94 !important;\r
  color: #8E8676 !important;\r
  background: #15130F !important;\r
  border-color: #3A3022 !important;\r
  filter: none !important;\r
}\r
\r
/* Existing direct React branches get deterministic roles without reparenting. */\r
.compact-panel.fs-skill-panel > [data-iw-skill-zone="identity"] {\r
  align-self: stretch !important;\r
  display: flex !important;\r
  flex-direction: column !important;\r
  justify-content: center !important;\r
}\r
.compact-panel.fs-skill-panel > [data-iw-skill-zone="content"] {\r
  min-width: 0 !important;\r
}\r
.compact-panel.fs-skill-panel > [data-iw-skill-zone="commands"] {\r
  display: flex !important;\r
  flex-direction: column !important;\r
  align-items: flex-end !important;\r
  justify-content: center !important;\r
  gap: 5px !important;\r
}\r
\r
.compact-panel.fs-skill-panel [data-iw-readout] {\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 11.5px !important;\r
  line-height: 1.18 !important;\r
  font-weight: 500 !important;\r
  color: #B7AF9F !important;\r
  letter-spacing: normal !important;\r
  text-transform: none !important;\r
}\r
.compact-panel.fs-skill-panel [data-iw-ingr] {\r
  font-family: var(--iw-font-ui) !important;\r
  font-size: 11px !important;\r
  line-height: 1.15 !important;\r
  color: var(--iw-dim) !important;\r
  letter-spacing: normal !important;\r
  text-transform: none !important;\r
}\r
\r
@media (max-width: 800px) {\r
  .compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] {\r
    grid-template-columns: 82px minmax(0, 1fr) 112px !important;\r
    gap: 0 8px !important;\r
    padding-inline: 8px !important;\r
  }\r
  .compact-panel.fs-skill-panel button[data-iw-skill-role="action-button"] {\r
    width: 88px !important;\r
    min-width: 88px !important;\r
  }\r
  [data-iw-skill-role="action-title"] { font-size: 15px !important; }\r
}\r
\r
/* v1.5.3 hard fallback: an identified XP branch must never retain native card\r
   geometry, even when the game adds a new utility class to an intermediate\r
   wrapper. */\r
.compact-panel.fs-skill-panel [data-iw-readout] {\r
  display: block !important;\r
  position: static !important;\r
  float: none !important;\r
  transform: none !important;\r
  filter: none !important;\r
  backdrop-filter: none !important;\r
  -webkit-backdrop-filter: none !important;\r
  clip-path: none !important;\r
}\r

/* Phone layout: keep commands immediately reachable while giving action content
   the full second row. This replaces the cramped three-column phone layout. */
@media (max-width: 520px) {
  .compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] {
    grid-template-columns: minmax(0, 1fr) 112px !important;
    grid-template-areas:
      "identity commands"
      "content content" !important;
    gap: 8px 10px !important;
    align-items: start !important;
    padding: 8px !important;
  }
  .compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] > [data-iw-skill-zone="identity"] {
    align-self: center !important;
    min-width: 0 !important;
  }
  .compact-panel.fs-skill-panel[data-iw-skill-layout="three-zone"] > [data-iw-skill-zone="commands"] {
    align-self: center !important;
    justify-self: end !important;
  }
}
`;

  // src/modules/SkillPanelRenderer.js
  var RENDERED_ATTR2 = "data-fs-skill";
  var ROLE_ATTR = "data-iw-skill-role";
  var ZONE_ATTR = "data-iw-skill-zone";
  var buttonStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var readoutStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var ingredientStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var buttonStyleOwner = createInlineStyleOwner();
  var readoutStyleOwner = createInlineStyleOwner();
  var ingredientStyleOwner = createInlineStyleOwner();
  var listenerBound2 = false;
  var SKILL_META = {
    combat: { label: "Combat", glyph: "âš”ï¸Ž", actions: ["fight"] },
    mining: { label: "Mining", glyph: "â›ï¸Ž", actions: ["mine"] },
    smithing: { label: "Smithing", glyph: "âš’ï¸Ž", actions: ["smelt", "forge"] },
    gathering: { label: "Gathering", glyph: "â§", actions: ["gather", "harvest"] },
    alchemy: { label: "Alchemy", glyph: "âš—ï¸Ž", actions: ["brew"] },
    jewelcrafting: { label: "Jewelcrafting", labels: ["Jewel", "Jewelcrafting"], glyph: "â—†", actions: ["prospect"] },
    spellcrafting: { label: "Spellcrafting", labels: ["Spellcraft", "Spellcrafting"], glyph: "âœ§", actions: ["enchant", "gather", "harvest"], titleActions: ["enchant", "harvest"], details: [/from the ether$/i] },
    tailoring: { label: "Tailoring", labels: ["Tailor", "Tailoring"], glyph: "â‹ˆ", actions: ["tailor", "sew", "weave"], details: [/^missing materials\b/i] },
    crafting: { label: "Crafting", glyph: "âœ¦", actions: ["craft"] },
    fishing: { label: "Fishing", glyph: "âŒ", actions: ["fish"] }
  };
  function setOwnedStyle(owner, el, prop, value, priority = "important") {
    return owner.set(el, prop, value, priority);
  }
  function normText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function classifyButton(btn) {
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return "disabled";
    const text = normText(btn.textContent);
    if (text.length <= 2) return "icon";
    const cls = String(btn.className || "");
    if (/bg-ember|bg-orange|bg-primary|bg-accent/i.test(cls)) return "primary";
    return "secondary";
  }
  var BUTTON_STYLES = {
    base: {
      "font-family": "'Barlow', system-ui, sans-serif",
      "font-size": "12px",
      "font-weight": "700",
      "letter-spacing": "0.06em",
      "text-transform": "uppercase",
      "border-radius": "2px",
      "transition": "background .13s, border-color .13s, color .13s",
      "align-self": "center",
      "height": "32px",
      "min-height": "32px",
      "flex-shrink": "0"
    },
    primary: {
      "background": "linear-gradient(180deg, #A94318, #742A0D)",
      "border": "1px solid #C05A28",
      "color": "#FFEAD1",
      "padding": "0 17px",
      "min-width": "96px",
      "cursor": "pointer",
      "box-shadow": "none"
    },
    secondary: {
      "background": "linear-gradient(180deg, #242018, #17140F)",
      "border": "1px solid #58482B",
      "color": "#DAD3C3",
      "padding": "0 13px",
      "min-width": "72px",
      "cursor": "pointer",
      "box-shadow": "none"
    },
    disabled: {
      "background": "#15130F",
      "border": "1px solid #3A3022",
      "color": "#8E8676",
      "padding": "0 15px",
      "min-width": "96px",
      "cursor": "not-allowed",
      "box-shadow": "none"
    },
    icon: {
      "background": "linear-gradient(180deg, #242018, #17140F)",
      "border": "1px solid #58482B",
      "color": "#DAD3C3",
      "padding": "0",
      "width": "30px",
      "min-width": "30px",
      "cursor": "pointer",
      "box-shadow": "none"
    }
  };
  function styleButton(btn) {
    const role = btn.getAttribute(ROLE_ATTR) || "";
    if (role === "level-progress") {
      buttonStyleOwner.restoreElement(btn);
      delete btn.dataset.iwBtnState;
      buttonStyleSnapshots.delete(btn);
      return;
    }
    const state = classifyButton(btn);
    const currentStyle = btn.getAttribute("style") || "";
    const previous = buttonStyleSnapshots.get(btn);
    if (previous && previous.state === state && previous.role === role && previous.style === currentStyle) return;
    for (const [prop, value] of Object.entries(BUTTON_STYLES.base)) {
      setOwnedStyle(buttonStyleOwner, btn, prop, value);
    }
    for (const [prop, value] of Object.entries(BUTTON_STYLES[state])) {
      setOwnedStyle(buttonStyleOwner, btn, prop, value);
    }
    if (role === "nav-button") {
      setOwnedStyle(buttonStyleOwner, btn, "width", "30px");
      setOwnedStyle(buttonStyleOwner, btn, "min-width", "30px");
      setOwnedStyle(buttonStyleOwner, btn, "height", "30px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", "30px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", "0");
    } else if (role === "action-button") {
      setOwnedStyle(buttonStyleOwner, btn, "width", "96px");
      setOwnedStyle(buttonStyleOwner, btn, "min-width", "96px");
      setOwnedStyle(buttonStyleOwner, btn, "height", "34px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", "34px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", "0 14px");
    }
    if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
    buttonStyleSnapshots.set(btn, { state, role, style: btn.getAttribute("style") || "" });
  }
  var LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-â€“]\s*\d+(?:\.\d+)?%\s*[â€¢Â·]\s*[\d,]+\s+(?:xp\s+)?to\s+go$/i;
  var READOUT_STYLES = {
    "background": "none",
    "background-color": "transparent",
    "background-image": "none",
    "border": "none",
    "border-radius": "0",
    "outline": "none",
    "box-shadow": "none",
    "padding": "0",
    "margin": "0",
    "width": "auto",
    "min-width": "0",
    "height": "auto",
    "min-height": "0",
    "max-height": "none",
    "cursor": "default"
  };
  function sameTextShellChain(el, panel) {
    if (!el) return [];
    const text = normText(el.textContent);
    const chain = [el];
    let cur = el;
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
      const ownsOtherRole = [...parent.querySelectorAll(`[${ROLE_ATTR}]`)].some((node) => {
        if (node === el || branch.includes(node)) return false;
        const role = node.getAttribute(ROLE_ATTR);
        return role && role !== "level-progress";
      });
      const ownsControl = !!parent.querySelector('button,a,input,select,textarea,[role="button"]');
      if (ownsOtherRole || ownsControl) break;
      branch.push(parent);
      cur = parent;
    }
    return branch;
  }
  function neutraliseReadouts(panel) {
    const previouslyMarked = [...panel.querySelectorAll("[data-iw-readout]")];
    let readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
    if (!readout) {
      readout = [...panel.querySelectorAll("div,span,p,strong")].find((el) => {
        if (el.closest('button,a,[role="button"]')) return false;
        return LEVEL_PROGRESS_PATTERN.test(normText(el.textContent));
      }) || null;
    }
    if (!readout) {
      for (const old of previouslyMarked) {
        readoutStyleOwner.restoreElement(old);
        delete old.dataset.iwReadout;
        readoutStyleSnapshots.delete(old);
      }
      return;
    }
    const branch = readoutBranch(readout, panel);
    const current = new Set(branch);
    for (const old of previouslyMarked) {
      if (current.has(old)) continue;
      readoutStyleOwner.restoreElement(old);
      delete old.dataset.iwReadout;
      readoutStyleSnapshots.delete(old);
    }
    for (const target of branch) {
      target.dataset.iwReadout = "1";
      for (const [prop, value] of Object.entries(READOUT_STYLES)) {
        setOwnedStyle(readoutStyleOwner, target, prop, value);
      }
      setOwnedStyle(readoutStyleOwner, target, "transform", "none");
      setOwnedStyle(readoutStyleOwner, target, "filter", "none");
      setOwnedStyle(readoutStyleOwner, target, "align-self", "auto");
      readoutStyleSnapshots.set(target, target.getAttribute("style") || "");
    }
  }
  var INGR_PATTERN = /[A-Z\s]{4,}\s+\d+\/\d+|\d+\/\d+/;
  var INGR_STYLES = {
    "background": "none",
    "background-color": "transparent",
    "border": "none",
    "border-radius": "0",
    "padding": "0",
    "box-shadow": "none"
  };
  function neutraliseIngredients(panel) {
    for (const el of panel.querySelectorAll("div, span")) {
      if (el.tagName === "BUTTON" || el.closest('button, a, [role="button"]')) continue;
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
        const currentStyle = target.getAttribute("style") || "";
        if (ingredientStyleSnapshots.get(target) === currentStyle && target.dataset.iwIngr === "1") continue;
        if (target.dataset.iwIngr !== "1") target.dataset.iwIngr = "1";
        for (const [prop, value] of Object.entries(INGR_STYLES)) {
          setOwnedStyle(ingredientStyleOwner, target, prop, value);
        }
        ingredientStyleSnapshots.set(target, target.getAttribute("style") || "");
      }
    }
  }
  function setRole(el, role) {
    if (el && el.getAttribute(ROLE_ATTR) !== role) el.setAttribute(ROLE_ATTR, role);
    return el;
  }
  function clearStructureRoles(panel) {
    panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}]`).forEach((el) => {
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
    return [...panel.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((el) => !el.closest("button, a")).filter((el) => normText(el.textContent).length <= 130);
  }
  function findBestText(panel, predicate) {
    const candidates = textCandidates(panel);
    const exactOwn = candidates.find((el) => predicate(normText(el.childElementCount ? "" : el.textContent), el));
    if (exactOwn) return exactOwn;
    return candidates.find((el) => predicate(normText(el.textContent), el)) || null;
  }
  function findProgress(panel) {
    const semantic = panel.querySelector('[role="progressbar"]');
    if (semantic) {
      const fill = semantic.firstElementChild || null;
      return { track: semantic, fill };
    }
    for (const el of panel.querySelectorAll("div")) {
      if (el.children.length !== 1) continue;
      const child = el.firstElementChild;
      const cls = `${el.className || ""} ${child?.className || ""}`;
      const widthStyle = child?.style?.width || "";
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
    const identityLabels = (meta.labels || [meta.label]).map((label) => label.toLowerCase());
    const identity = findBestText(panel, (text) => identityLabels.includes(text.toLowerCase()));
    if (identity) {
      const shell = outerSameTextShell(identity, panel);
      setRole(shell, "identity");
    }
    const actionWord = (meta.titleActions || meta.actions).join("|");
    const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, "i");
    const actionTitle = findBestText(panel, (text, el) => {
      if (!text || text.length > 90 || !actionTitleRe.test(text)) return false;
      if (el.closest(".iw-item-ref")) return false;
      if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
      return true;
    });
    if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), "action-title");
    const buttons = [...panel.querySelectorAll("button")];
    const levelProgressButton = buttons.find((btn) => LEVEL_PROGRESS_PATTERN.test(normText(btn.textContent))) || null;
    if (levelProgressButton) setRole(levelProgressButton, "level-progress");
    let actionButton = null;
    const commandWord = meta.actions.join("|");
    const actionExact = new RegExp(`^(?:${commandWord})$`, "i");
    for (const btn of buttons) {
      const text = normText(btn.textContent);
      const aria = normText(btn.getAttribute("aria-label"));
      if (actionExact.test(text) || actionExact.test(aria)) {
        actionButton = btn;
        setRole(btn, "action-button");
        continue;
      }
      if (text.length <= 2 || /^(?:prev|previous|next)$/i.test(aria)) setRole(btn, "nav-button");
    }
    const navButtons = buttons.filter((btn) => btn.getAttribute(ROLE_ATTR) === "nav-button");
    if (navButtons.length >= 2) {
      const parent = navButtons[0].parentElement;
      if (parent && navButtons.every((btn) => btn.parentElement === parent)) setRole(parent, "nav-group");
    }
    if (!levelProgressButton) {
      const readout = findBestText(panel, (text) => LEVEL_PROGRESS_PATTERN.test(text));
      if (readout) setRole(readout, "level-progress");
    }
    const xpGain = findBestText(panel, (text) => /^\d[\d,]*\s*xp$/i.test(text));
    if (xpGain) setRole(outerSameTextShell(xpGain, panel), "xp-gain");
    const requirement = findBestText(panel, (text) => /^(?:needs|requires)\b/i.test(text));
    if (requirement) setRole(outerSameTextShell(requirement, panel), "requirement");
    const reward = findBestText(panel, (text) => /^base reward\s*:/i.test(text));
    if (reward) setRole(outerSameTextShell(reward, panel), "reward");
    const detail = meta.details?.length ? findBestText(panel, (text) => meta.details.some((pattern) => pattern.test(text))) : null;
    if (detail) setRole(outerSameTextShell(detail, panel), "action-detail");
    const { track, fill } = findProgress(panel);
    if (track) setRole(track, "progress-track");
    if (fill) setRole(fill, "progress-fill");
    for (const ref of panel.querySelectorAll(".iw-item-ref")) {
      const host = ref.parentElement;
      if (host && host !== panel && /\d+\s*\/\s*\d+/.test(normText(host.textContent))) setRole(host, "ingredient");
    }
    const identityRole = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
    const titleRole = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
    const actionRole = panel.querySelector(`[${ROLE_ATTR}="action-button"]`);
    const identityZone = directChildUnder(panel, identityRole);
    const contentZone = directChildUnder(panel, titleRole);
    const commandZone = directChildUnder(panel, actionRole);
    const directChildren = [...panel.children].filter((el) => !el.classList.contains("fs-skill-header"));
    const distinctZones = identityZone && contentZone && commandZone && (/* @__PURE__ */ new Set([identityZone, contentZone, commandZone])).size === 3;
    if (distinctZones) {
      identityZone.setAttribute(ZONE_ATTR, "identity");
      contentZone.setAttribute(ZONE_ATTR, "content");
      commandZone.setAttribute(ZONE_ATTR, "commands");
      const functionalZones = /* @__PURE__ */ new Set([identityZone, contentZone, commandZone]);
      const unexpectedFlowChild = directChildren.some((el) => {
        if (functionalZones.has(el)) return false;
        try {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "absolute" || cs.position === "fixed") return false;
        } catch {
        }
        const rect = el.getBoundingClientRect?.();
        return !rect || rect.width > 2 && rect.height > 2;
      });
      if (!unexpectedFlowChild) panel.dataset.iwSkillLayout = "three-zone";
    }
  }
  function applyPanelTreatment(panel, type, meta) {
    annotateStructure(panel, type, meta);
    panel.querySelectorAll("button").forEach(styleButton);
    neutraliseReadouts(panel);
    neutraliseIngredients(panel);
  }
  var SKILL_CLASSES = Object.keys(SKILL_META).map((type) => `fs-skill--${type}`);
  function clearPanelInlineTreatment(panel) {
    buttonStyleOwner.restoreWithin(panel);
    readoutStyleOwner.restoreWithin(panel);
    ingredientStyleOwner.restoreWithin(panel);
    panel.querySelectorAll("[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]").forEach((el) => {
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
    panel.classList.remove("fs-skill-panel", ...SKILL_CLASSES);
    delete panel.dataset.fsSkillLabel;
    delete panel.dataset.fsSkillRune;
    delete panel.dataset.fsSkillFlavour;
    delete panel.dataset.iwSkillGlyph;
    delete panel.dataset.iwSkill;
    delete panel.dataset.iwUi;
    panel.removeAttribute(RENDERED_ATTR2);
  }
  function applyPanelChrome(panel, type, meta) {
    if (!panel.classList.contains("fs-skill-panel")) panel.classList.add("fs-skill-panel");
    for (const cls of SKILL_CLASSES) {
      if (cls !== `fs-skill--${type}` && panel.classList.contains(cls)) panel.classList.remove(cls);
    }
    if (!panel.classList.contains(`fs-skill--${type}`)) panel.classList.add(`fs-skill--${type}`);
    panel.dataset.iwUi = "skill-panel";
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
    if (panel.getAttribute(RENDERED_ATTR2) !== skillType) panel.setAttribute(RENDERED_ATTR2, skillType);
    applyPanelTreatment(panel, skillType, meta);
  }
  function clearSkillPanels() {
    guardEach("skill:teardown", document.querySelectorAll(".compact-panel"), clearPanelChrome);
    buttonStyleOwner.restoreAll();
    readoutStyleOwner.restoreAll();
    ingredientStyleOwner.restoreAll();
    document.querySelectorAll("[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]").forEach((el) => {
      delete el.dataset.iwReadout;
      delete el.dataset.iwIngr;
      delete el.dataset.iwBtnState;
    });
  }
  function initSkillPanelRenderer() {
    inject("skillpanel", skillpanel_default);
    if (listenerBound2) return;
    listenerBound2 = true;
    on("iw:skill-panel", (e) => guard("skill:panel", () => renderPanel(e.detail.panel, e.detail.skill)));
  }

  // src/styles/ui-system.css
  var ui_system_default = '/* ══════════════════════════════════════════════════════════════════════\r\n   IdleWorlds Fantasy Skin — shared UI and navigation refinement\r\n\r\n   The shared language is deliberately dense: forged rails, restrained brass,\r\n   flat data, compact controls. Boxes are reserved for real controls/actions.\r\n   ══════════════════════════════════════════════════════════════════════ */\r\n\r\n:root {\r\n  --iw-space-1: 4px;\r\n  --iw-space-2: 6px;\r\n  --iw-space-3: 9px;\r\n  --iw-space-4: 12px;\r\n  --iw-space-5: 16px;\r\n  --iw-control-h: 32px;\r\n  --iw-control-h-lg: 36px;\r\n  --iw-frame-edge: #4B3D26;\r\n  --iw-frame-inner: #19150F;\r\n  --iw-steel: #26231D;\r\n}\r\n\r\n/* ── Major frames ───────────────────────────────────────────────────── */\r\n[data-iw-ui="section-frame"] {\r\n  position: relative !important;\r\n  border: 1px solid var(--iw-frame-edge) !important;\r\n  border-radius: 6px !important;\r\n  background:\r\n    linear-gradient(180deg, rgba(255,255,255,.012), transparent 48px),\r\n    linear-gradient(90deg, rgba(110,80,35,.014), transparent 26%),\r\n    var(--iw-ink-800) !important;\r\n  box-shadow:\r\n    inset 0 0 0 1px rgba(0,0,0,.48),\r\n    inset 0 1px 0 rgba(255,255,255,.014),\r\n    0 6px 18px rgba(0,0,0,.18) !important;\r\n}\r\n\r\n[data-iw-ui="section-frame"]::before {\r\n  content: "";\r\n  position: absolute;\r\n  z-index: 0;\r\n  pointer-events: none;\r\n  left: 14px;\r\n  right: 14px;\r\n  top: 0;\r\n  height: 1px;\r\n  background: linear-gradient(90deg, var(--iw-gold-dim), rgba(157,132,88,.16) 34%, transparent 78%);\r\n}\r\n\r\n[data-iw-ui="section-title"] {\r\n  font-family: var(--iw-font-head) !important;\r\n  letter-spacing: .035em !important;\r\n  color: var(--iw-text-hi) !important;\r\n  text-shadow: 0 1px 0 #000 !important;\r\n}\r\n\r\n/* ── Main navigation rail ───────────────────────────────────────────── */\r\n[data-iw-ui="main-nav-shell"] {\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  border-radius: 0 !important;\r\n  background: transparent !important;\r\n  box-shadow: none !important;\r\n}\r\n\r\n[data-iw-ui="main-nav"] {\r\n  display: flex !important;\r\n  align-items: stretch !important;\r\n  flex-wrap: wrap !important;\r\n  gap: 0 !important;\r\n  width: max-content !important;\r\n  max-width: 100% !important;\r\n  min-height: 0 !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 1px solid #3A3225 !important;\r\n  border-radius: 3px !important;\r\n  background: #11100D !important;\r\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,.52) !important;\r\n  overflow: visible !important;\r\n}\r\n\r\n[data-iw-ui="nav-tab"] {\r\n  position: relative !important;\r\n  min-height: var(--iw-control-h) !important;\r\n  height: var(--iw-control-h) !important;\r\n  margin: 0 !important;\r\n  padding: 0 16px !important;\r\n  border: 0 !important;\r\n  border-right: 1px solid #3A3225 !important;\r\n  border-radius: 0 !important;\r\n  background: linear-gradient(180deg, #211E18, #16140F) !important;\r\n  color: #AAA291 !important;\r\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.022) !important;\r\n  font-family: var(--iw-font-ui) !important;\r\n  font-size: 11.5px !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: .025em !important;\r\n  text-transform: uppercase !important;\r\n  line-height: 1 !important;\r\n}\r\n\r\n[data-iw-ui="nav-tab"]:last-of-type { border-right: 0 !important; }\r\n\r\n[data-iw-ui="nav-tab"]:hover:not(:disabled) {\r\n  z-index: 1;\r\n  background: linear-gradient(180deg, #29241C, #1A1711) !important;\r\n  color: var(--iw-text-hi) !important;\r\n  filter: none !important;\r\n}\r\n\r\n[data-iw-ui="nav-tab"][data-iw-state="active"] {\r\n  z-index: 2;\r\n  color: #FFE8CB !important;\r\n  background:\r\n    linear-gradient(180deg, rgba(255,255,255,.035), transparent 46%),\r\n    linear-gradient(180deg, #9D3C16, #67250C) !important;\r\n  box-shadow:\r\n    inset 0 1px 0 rgba(255,226,191,.13),\r\n    inset 0 -2px 0 rgba(55,16,4,.58) !important;\r\n}\r\n\r\n[data-iw-ui="nav-tab"][data-iw-state="active"]::after {\r\n  content: "";\r\n  position: absolute;\r\n  left: 9px;\r\n  right: 9px;\r\n  bottom: -4px;\r\n  height: 2px;\r\n  background: var(--iw-ember-hi);\r\n  box-shadow: 0 0 6px rgba(209,90,34,.28);\r\n}\r\n\r\n/* ── Zone command rail ──────────────────────────────────────────────── */\r\n[data-iw-ui="zone-bar"] {\r\n  border-radius: 5px !important;\r\n  padding-top: 8px !important;\r\n  padding-bottom: 8px !important;\r\n  min-height: 0 !important;\r\n}\r\n\r\n[data-iw-ui="zone-title"] {\r\n  color: var(--iw-text-hi) !important;\r\n  font-weight: 700 !important;\r\n}\r\n\r\n[data-iw-ui="zone-action"] {\r\n  background: linear-gradient(180deg, #242018, #17140F) !important;\r\n  border: 1px solid var(--iw-line-hi) !important;\r\n  color: var(--iw-text) !important;\r\n  height: 32px !important;\r\n  min-height: 32px !important;\r\n  min-width: 0 !important;\r\n  padding: 0 12px !important;\r\n  font-size: 11px !important;\r\n  letter-spacing: .025em !important;\r\n}\r\n\r\n/* ── Generic control language ───────────────────────────────────────── */\r\n\r\n/* Surface treatment is safe to apply globally: it changes how a control is\r\n   painted, never how much room it takes. */\r\nbutton:not(.iw-item-ref):not([data-iw-ui="nav-tab"]):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]),\r\n[role="button"]:not(.iw-item-ref):not([data-iw-ui="nav-tab"]):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]) {\r\n  border-color: var(--iw-line-hi) !important;\r\n  background-image: linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.09)) !important;\r\n}\r\n\r\n/* Geometry is NOT safe to apply globally.\r\n   `min-height: 30px` on every button forced small icon controls — chat\r\n   toolbar, modal close buttons, market row steppers — up to 30px regardless\r\n   of the game\'s own sizing, because min-height does not compete with the\r\n   Tailwind `h-*` height utilities, it simply wins. That overflowed dense\r\n   regions and was itself a source of "looks broken in some places".\r\n\r\n   Apply the minimum only where a control has been positively classified as\r\n   a real action, and only when the game has not sized it explicitly.\r\n   (Audit S3.5) */\r\n[data-iw-ui="zone-action"],\r\n[data-iw-inventory-control="filter"],\r\n[data-iw-inventory-control="page"],\r\n.compact-panel.fs-skill-panel button[data-iw-skill-role="action-button"],\r\n.compact-panel.fs-skill-panel button[data-iw-skill-role="nav-button"] {\r\n  min-height: 30px;\r\n}\r\n\r\nbutton:not(.iw-item-ref):not([data-iw-ui="nav-tab"]):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]):disabled,\r\n[role="button"][aria-disabled="true"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]) {\r\n  filter: saturate(.58) brightness(.84) !important;\r\n  box-shadow: inset 0 0 0 1px rgba(0,0,0,.22) !important;\r\n}\r\n\r\ninput[type="search"],\r\ninput[placeholder*="Search" i] {\r\n  border: 1px solid #30291E !important;\r\n  border-bottom-color: var(--iw-line-hi) !important;\r\n  border-radius: 2px !important;\r\n  background: linear-gradient(180deg, #080A0A, #0D0E0C) !important;\r\n  box-shadow: inset 0 2px 6px rgba(0,0,0,.72) !important;\r\n}\r\n\r\n@media (max-width: 780px) {\r\n  [data-iw-ui="main-nav"] { width: 100% !important; }\r\n  [data-iw-ui="nav-tab"] {\r\n    flex: 1 1 auto !important;\r\n    padding-inline: 9px !important;\r\n    font-size: 10.5px !important;\r\n  }\r\n}\r\n';

  // src/modules/UIFoundation.js
  var NAV_LABELS = ["game", "market", "leaderboards", "village", "dungeon"];
  function normText2(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function setRole2(el, role) {
    if (el && el.dataset.iwUi !== role) el.dataset.iwUi = role;
    return el;
  }
  function nearestButtonLabel(btn) {
    return normText2(btn?.textContent).toLowerCase();
  }
  function commonAncestor(elements) {
    const list = elements.filter(Boolean);
    if (!list.length) return null;
    let cur = list[0];
    while (cur && cur !== document.documentElement) {
      if (list.every((el) => cur === el || cur.contains(el))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function sameTextShell(el, stop, maxDepth = 4) {
    if (!el) return null;
    const text = normText2(el.textContent);
    let cur = el;
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const parent = cur.parentElement;
      if (!parent || parent === stop) break;
      if (parent.matches?.("button, a, input, select, textarea")) break;
      if (normText2(parent.textContent) !== text) break;
      cur = parent;
    }
    return cur;
  }
  function warmBackground(btn) {
    try {
      const colour = getComputedStyle(btn).backgroundColor || "";
      const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
      return r >= 90 && r > g * 1.35 && g > b * 0.9;
    } catch {
      return false;
    }
  }
  function deriveTabActive(btn) {
    if (!btn) return false;
    if (btn.getAttribute("aria-selected") === "true" || btn.getAttribute("aria-current") === "page") return true;
    const cls = String(btn.className || "");
    return /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
  }
  function classifyMainNav() {
    const buttons = [...document.querySelectorAll('button, [role="tab"]')];
    const byLabel = /* @__PURE__ */ new Map();
    for (const btn of buttons) {
      const label = nearestButtonLabel(btn);
      if (NAV_LABELS.includes(label) && !byLabel.has(label)) byLabel.set(label, btn);
    }
    if (byLabel.size < 4) return;
    const tabs = NAV_LABELS.map((label) => byLabel.get(label)).filter(Boolean);
    const semanticActive = tabs.map((btn) => deriveTabActive(btn));
    const hasSemanticActive = semanticActive.some(Boolean);
    const route = `${location.pathname || ""} ${location.hash || ""}`.toLowerCase();
    const routeActive = tabs.map((btn) => {
      const label = nearestButtonLabel(btn);
      if (label === "game") return /(?:^|\/)(?:game)?\/?$/.test(location.pathname || "/") && !location.hash;
      return route.includes(label);
    });
    const hasRouteActive = routeActive.some(Boolean);
    const firstClassification = tabs.every((btn) => btn.dataset.iwUi !== "nav-tab");
    const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);
    const track = commonAncestor(tabs);
    if (!track) return;
    setRole2(track, "main-nav");
    let shell = track;
    const navText = normText2(track.textContent);
    for (let depth = 0; depth < 3; depth += 1) {
      const parent = shell.parentElement;
      if (!parent || parent === document.body) break;
      const parentButtons = [...parent.querySelectorAll('button, [role="tab"]')].filter((btn) => NAV_LABELS.includes(nearestButtonLabel(btn)));
      const rect = parent.getBoundingClientRect?.();
      if (parentButtons.length !== tabs.length || normText2(parent.textContent) !== navText) break;
      if (rect && rect.height > 110) break;
      shell = parent;
    }
    if (shell !== track) setRole2(shell, "main-nav-shell");
    tabs.forEach((btn, index) => {
      const wasActive = btn.dataset.iwState === "active";
      setRole2(btn, "nav-tab");
      btn.dataset.iwTab = nearestButtonLabel(btn);
      const active = hasSemanticActive ? semanticActive[index] : hasRouteActive ? routeActive[index] : firstClassification ? warmActive[index] : wasActive;
      if (active) btn.dataset.iwState = "active";
      else delete btn.dataset.iwState;
    });
  }
  function classifyZoneBar() {
    const labels = [...document.querySelectorAll("div,span,p,strong")].filter((el) => /^zone\s*\d+\s*:/i.test(normText2(el.textContent)) && el.childElementCount <= 2);
    for (const label of labels) {
      let host = label.parentElement;
      for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
        const buttons = [...host.querySelectorAll("button")];
        const buttonText = buttons.map(nearestButtonLabel);
        if (buttonText.some((x) => /zones/.test(x)) && buttonText.some((x) => /next\s+zone/.test(x))) {
          setRole2(host, "zone-bar");
          buttons.forEach((btn) => {
            const text = nearestButtonLabel(btn);
            if (/^(?:zones|previous\s+zone|next\s+zone)$/.test(text)) setRole2(btn, "zone-action");
          });
          setRole2(sameTextShell(label, host, 2), "zone-title");
          break;
        }
      }
    }
  }
  function classifySectionFrames() {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")];
    const names = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions)$/i;
    for (const heading of headings) {
      if (!names.test(normText2(heading.textContent))) continue;
      let cur = heading.parentElement;
      for (let depth = 0; cur && depth < 4; depth += 1, cur = cur.parentElement) {
        if (cur.matches?.(".compact-panel")) break;
        const rect = cur.getBoundingClientRect?.();
        const descendantCount = cur.querySelectorAll?.("*").length || 0;
        const substantial = descendantCount >= 12 && normText2(cur.textContent).length >= 45;
        const roomy = !rect || rect.width > 320 && rect.height > 110;
        if (substantial && roomy) {
          setRole2(cur, "section-frame");
          setRole2(heading, "section-title");
          break;
        }
      }
    }
  }
  var queued = false;
  function queueClassify() {
    if (queued) return;
    queued = true;
    raf(() => {
      queued = false;
      guard("ui:main-nav", classifyMainNav);
      guard("ui:zone-bar", classifyZoneBar);
      guard("ui:section-frames", classifySectionFrames);
    });
  }
  function clearUIFoundation() {
    document.querySelectorAll("[data-iw-ui]").forEach((el) => {
      delete el.dataset.iwUi;
    });
    document.querySelectorAll("[data-iw-tab]").forEach((el) => {
      delete el.dataset.iwTab;
    });
    document.querySelectorAll("[data-iw-state]").forEach((el) => {
      delete el.dataset.iwState;
    });
  }
  function initUIFoundation() {
    inject("ui-system", ui_system_default);
    on("iw:dom-flush", queueClassify);
    queueClassify();
  }

  // src/modules/BackgroundPainter.js
  var styleOwner = createInlineStyleOwner();
  var GAME_NAVIES = /* @__PURE__ */ new Set([
    "#0f172a",
    "#111827",
    "#131d28",
    "#131e28",
    "#131d27",
    "#141e28",
    "#121d27",
    "#121c27",
    "#121d28",
    "#1a2030",
    "#1b231f",
    "#191f1d",
    "#162920",
    "#111c24",
    "#0f1923",
    "#111926",
    "#0d1a24",
    "#131b26",
    "#12202d",
    "#1c2940"
  ]);
  var SURFACE_SELECTOR = [
    ".compact-panel",
    ".compact-row",
    '[class*="item-row"]',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
    "main",
    "section",
    "article",
    "aside",
    "header",
    "nav"
  ].join(", ");
  function ourColour(gameHex) {
    const r = parseInt(gameHex.slice(1, 3), 16);
    const g = parseInt(gameHex.slice(3, 5), 16);
    const b = parseInt(gameHex.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 12) return "#0B0C0A";
    if (lum < 20) return "#14130F";
    if (lum < 28) return "#191711";
    return "#1E1B15";
  }
  function normHex(colour) {
    if (!colour || colour === "transparent" || colour === "rgba(0, 0, 0, 0)") return null;
    const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  function ownedTree(el) {
    return el.closest?.(".fs-inv-row, .fs-skill-header, .iw-tip") || null;
  }
  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    if (["SCRIPT", "STYLE", "LINK", "META", "HEAD", "HTML"].includes(el.tagName)) return true;
    if (el.classList.contains("fs-skill-wrapper")) return true;
    if (ownedTree(el)) return true;
    return false;
  }
  function isSurfaceCandidate(el) {
    if (el === document.body) return true;
    if (el.matches?.(SURFACE_SELECTOR)) return true;
    const parent = el.parentElement;
    if (parent === document.body) return true;
    if (parent?.parentElement === document.body && el.children.length > 1) return true;
    return false;
  }
  function setImportant(el, prop, value) {
    return styleOwner.set(el, prop, value, "important");
  }
  function paintElement(el) {
    if (shouldSkip(el) || !isSurfaceCandidate(el)) return false;
    let changed = false;
    const style = getComputedStyle(el);
    const bg = normHex(style.backgroundColor);
    if (bg && GAME_NAVIES.has(bg)) {
      changed = setImportant(el, "background-color", ourColour(bg)) || changed;
    }
    const sides = ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
    const sideProps = ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
    for (let i = 0; i < sides.length; i += 1) {
      const hex = normHex(style[sides[i]]);
      if (hex && GAME_NAVIES.has(hex)) {
        changed = setImportant(el, sideProps[i], "#342D20") || changed;
      }
    }
    if (changed && el.dataset.iwPainted !== "1") el.dataset.iwPainted = "1";
    return changed;
  }
  function paintBackground(root = document.body) {
    if (!root) return 0;
    let changed = 0;
    try {
      if (root.nodeType === 1 && paintElement(root)) changed += 1;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node;
      while (node = walker.nextNode()) {
        if (paintElement(node)) changed += 1;
      }
    } catch (err) {
      warnOnce("background:paint", err);
    }
    return changed;
  }
  function clearBackgroundPaint() {
    styleOwner.restoreAll();
    document.querySelectorAll('[data-iw-painted="1"]').forEach((el) => {
      delete el.dataset.iwPainted;
    });
  }

  // src/styles/base.css
  var base_default = `/* ══════════════════════════════════════════════════════════════════════\r
   IdleWorlds Fantasy Skin — "Ashen Iron" base theme\r
\r
   Visual goal: dense ARPG utility rather than rounded dashboard cards.\r
   The palette borrows the material language of forged iron, soot, tarnished\r
   brass and ember without copying any game's assets. Layout remains owned by\r
   IdleWorlds/React; this layer standardises geometry, typography and surfaces.\r
   ══════════════════════════════════════════════════════════════════════ */\r
\r
/* ── Typefaces ────────────────────────────────────────────────────────────\r
   Self-hosted from the extension bundle. These used to come from a Google\r
   Fonts @import, which had two problems:\r
\r
     1. An @import inside a content-script stylesheet is fetched by the PAGE\r
        and is therefore subject to idleworlds.com's style-src / font-src CSP,\r
        not to our host_permissions. A CSP tightening on the game's side would\r
        silently drop every custom face.\r
     2. It resolves asynchronously AFTER the rest of the sheet applies, so the\r
        failure mode was intermittent and cache-dependent — the single most\r
        likely reason the theme looked right on some loads and not others.\r
\r
   font-display: swap keeps text visible during load; the src paths resolve\r
   against the extension root and are listed in web_accessible_resources.\r
   Run \`npm run vendor\` to populate assets/fonts/. (Audit S1.2) */\r
\r
@font-face {\r
  font-family: 'Cinzel';\r
  font-style: normal;\r
  font-weight: 600 700;\r
  font-display: swap;\r
  src: url('../assets/fonts/cinzel-variable.woff2') format('woff2');\r
}\r
\r
@font-face {\r
  font-family: 'Barlow';\r
  font-style: normal;\r
  font-weight: 400;\r
  font-display: swap;\r
  src: url('../assets/fonts/barlow-400.woff2') format('woff2');\r
}\r
\r
@font-face {\r
  font-family: 'Barlow';\r
  font-style: normal;\r
  font-weight: 500;\r
  font-display: swap;\r
  src: url('../assets/fonts/barlow-500.woff2') format('woff2');\r
}\r
\r
@font-face {\r
  font-family: 'Barlow';\r
  font-style: normal;\r
  font-weight: 600;\r
  font-display: swap;\r
  src: url('../assets/fonts/barlow-600.woff2') format('woff2');\r
}\r
\r
@font-face {\r
  font-family: 'Barlow';\r
  font-style: normal;\r
  font-weight: 700;\r
  font-display: swap;\r
  src: url('../assets/fonts/barlow-700.woff2') format('woff2');\r
}\r
\r
@font-face {\r
  font-family: 'Crimson Text';\r
  font-style: italic;\r
  font-weight: 400;\r
  font-display: swap;\r
  src: url('../assets/fonts/crimson-text-italic.woff2') format('woff2');\r
}\r
\r
:root {\r
  /* Forged surfaces */\r
  --iw-ink-950: #070806;\r
  --iw-ink-900: #0B0C0A;\r
  --iw-ink-850: #10100D;\r
  --iw-ink-800: #14130F;\r
  --iw-ink-750: #191711;\r
  --iw-ink-700: #1E1B15;\r
  --iw-ink-600: #29251C;\r
\r
  /* Brass / iron edges */\r
  --iw-line:    #342D20;\r
  --iw-line-hi: #58482B;\r
  --iw-line-hot:#806337;\r
\r
  /* Accents */\r
  --iw-gold:     #D4AD63;\r
  --iw-gold-dim: #9D8458;\r
  --iw-ember:    #B64619;\r
  --iw-ember-hi: #D15A22;\r
\r
  /* Text */\r
  --iw-text:   #DDD6C6;\r
  --iw-text-hi:#F0E8D6;\r
  --iw-dim:    #938A79;\r
  --iw-faint:  #666052;\r
\r
  /* Semantic */\r
  --iw-good: #82B88A;\r
  --iw-bad:  #D27171;\r
  --iw-info: #75A8C8;\r
\r
  /* Tier colours */\r
  --iw-t-common:    #B9B4A8;\r
  --iw-t-uncommon:  #6FBF73;\r
  --iw-t-rare:      #5B9BD5;\r
  --iw-t-epic:      #B98FE0;\r
  --iw-t-legendary: #D98A3A;\r
  --iw-t-mythic:    #E06666;\r
\r
  /* Typography */\r
  --iw-font-head: 'Cinzel', Georgia, serif;\r
  --iw-font-ui:   'Barlow', system-ui, -apple-system, sans-serif;\r
  --iw-font-flav: 'Crimson Text', Georgia, serif;\r
\r
  /* Geometry — intentionally restrained. Round pills are not the house style. */\r
  --iw-r-panel:   3px;\r
  --iw-r-control: 2px;\r
  --iw-r-slot:    2px;\r
  --iw-r:         var(--iw-r-control);\r
  --iw-r-sm:      var(--iw-r-slot);\r
\r
  /* Game theme tokens */\r
  --background:          var(--iw-ink-900) !important;\r
  --foreground:          var(--iw-text)    !important;\r
  --card:                var(--iw-ink-800) !important;\r
  --card-foreground:     var(--iw-text)    !important;\r
  --popover:             var(--iw-ink-800) !important;\r
  --popover-foreground:  var(--iw-text)    !important;\r
  --panel-bg:            var(--iw-ink-800) !important;\r
  --panel-border:        var(--iw-line)    !important;\r
  --surface-bg:          var(--iw-ink-700) !important;\r
  --surface-border:      var(--iw-line)    !important;\r
  --primary:             var(--iw-ember)   !important;\r
  --primary-foreground:  #FFEAD1           !important;\r
  --accent:              var(--iw-ember)   !important;\r
  --accent-foreground:   var(--iw-text-hi) !important;\r
  --ring:                var(--iw-gold-dim)!important;\r
  --border:              var(--iw-line)    !important;\r
  --input:               var(--iw-ink-850) !important;\r
  --muted:               var(--iw-ink-700) !important;\r
  --muted-foreground:    var(--iw-dim)     !important;\r
  --sidebar:             var(--iw-ink-800) !important;\r
  --sidebar-foreground:  var(--iw-text)    !important;\r
  --sidebar-border:      var(--iw-line)    !important;\r
  --sidebar-accent:      var(--iw-ink-700) !important;\r
}\r
\r
html,\r
body {\r
  background-color: var(--iw-ink-900) !important;\r
  color: var(--iw-text) !important;\r
  font-family: var(--iw-font-ui) !important;\r
}\r
\r
body {\r
  background-image:\r
    radial-gradient(1200px 520px at 50% -140px, rgba(124, 91, 42, .10), transparent 68%),\r
    linear-gradient(180deg, rgba(255,255,255,.012), transparent 220px) !important;\r
  background-attachment: fixed !important;\r
}\r
\r
/* Major semantic text. Item names remain Barlow via their own selectors. */\r
h1, h2, h3 {\r
  font-family: var(--iw-font-head) !important;\r
  letter-spacing: .025em;\r
  color: var(--iw-text-hi) !important;\r
}\r
\r
/* ── Core surfaces ──────────────────────────────────────────────────── */\r
\r
.compact-panel,\r
[class~="compact-panel"] {\r
  background:\r
    linear-gradient(180deg, rgba(255,255,255,.018), transparent 48px),\r
    var(--iw-ink-800) !important;\r
  border-color: var(--iw-line) !important;\r
  color: var(--iw-text) !important;\r
  border-radius: var(--iw-r-panel) !important;\r
  box-shadow:\r
    inset 0 1px 0 rgba(255,255,255,.018),\r
    inset 0 -1px 0 rgba(0,0,0,.42) !important;\r
}\r
\r
.compact-row,\r
[class*="item-row"] {\r
  background-color: var(--iw-ink-800) !important;\r
  border-color: var(--iw-line) !important;\r
  color: var(--iw-text) !important;\r
}\r
\r
/* Tailwind's generous radii are a major source of the dashboard aesthetic.\r
   Flatten the large/medium utility radii, while leaving rounded-full alone\r
   for true status dots/avatars. Buttons receive their own stricter rule. */\r
[class*="rounded-3xl"],\r
[class*="rounded-2xl"],\r
[class*="rounded-xl"],\r
[class*="rounded-lg"],\r
[class*="rounded-md"] {\r
  border-radius: var(--iw-r-panel) !important;\r
}\r
\r
button:not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]),\r
[role="button"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]) {\r
  border-radius: var(--iw-r-control) !important;\r
}\r
\r
/* ── Controls ───────────────────────────────────────────────────────── */\r
\r
/* Forged base colour for controls.\r
   Deliberately ONE element-selector of specificity (0,0,1) and NOT !important:\r
   any colour the game sets itself — a Tailwind bg-* utility, an inline style,\r
   a cosmetic chat-name gradient — outranks this and still wins. It exists only\r
   to catch buttons the game leaves unpainted, which previously fell through to\r
   the user agent's light \`buttonface\` and rendered as a pale box with our dark\r
   gradient laid over it. Found by build-tools/render-fixtures.mjs. */\r
button,\r
[role="button"] {\r
  background-color: var(--iw-ink-750);\r
  color: var(--iw-text);\r
}\r
\r
button:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]),\r
[role="button"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]),\r
input,\r
select,\r
textarea {\r
  font-family: var(--iw-font-ui) !important;\r
}\r
\r
button:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]),\r
[role="button"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]) {\r
  box-shadow:\r
    inset 0 1px 0 rgba(255,255,255,.028),\r
    0 1px 0 rgba(0,0,0,.65) !important;\r
  transition: color .12s ease, border-color .12s ease, background-color .12s ease, filter .12s ease !important;\r
}\r
\r
button:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]):hover:not(:disabled),\r
[role="button"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]):hover {\r
  filter: brightness(1.08);\r
}\r
\r
button:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]):focus-visible,\r
[role="button"]:not(.iw-item-ref):not([class*="chat-name-"]):not([data-iw-skill-role="level-progress"]):focus-visible,\r
input:focus-visible,\r
select:focus-visible,\r
textarea:focus-visible {\r
  outline: 1px solid var(--iw-gold) !important;\r
  outline-offset: 2px !important;\r
}\r
\r
input:not([type="checkbox"]):not([type="radio"]),\r
select,\r
textarea {\r
  border-radius: var(--iw-r-control) !important;\r
  border-color: var(--iw-line) !important;\r
  background: linear-gradient(180deg, #090C0D, #0C0E0D) !important;\r
  color: var(--iw-text) !important;\r
  box-shadow:\r
    inset 0 1px 4px rgba(0,0,0,.7),\r
    0 1px 0 rgba(255,255,255,.018) !important;\r
}\r
\r
input::placeholder,\r
textarea::placeholder {\r
  color: var(--iw-faint) !important;\r
}\r
\r
/* Main nav/tabs often arrive as heavily rounded buttons. Keep their native\r
   selected colour, but make the rail read like game tabs instead of pills. */\r
nav button,\r
nav [role="button"],\r
header button:not([class*="chat-name-"]),\r
[class*="tab"] button {\r
  border-radius: var(--iw-r-control) !important;\r
  font-weight: 700 !important;\r
}\r
\r
hr {\r
  border-color: var(--iw-line) !important;\r
}\r
\r
/* ── Shared icon slot ───────────────────────────────────────────────── */\r
\r
.iw-ico {\r
  flex: none;\r
  display: block;\r
  position: relative;\r
  background-repeat: no-repeat;\r
  background-color: #090806;\r
  border: 1px solid var(--iw-line-hi);\r
  border-radius: var(--iw-r-slot);\r
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.45);\r
}\r
\r
.iw-icon-badge {\r
  position: absolute;\r
  right: -3px;\r
  bottom: -3px;\r
  font-family: var(--iw-font-ui);\r
  font-size: 9px;\r
  font-weight: 700;\r
  line-height: 1;\r
  padding: 2px 3px;\r
  border-radius: 1px;\r
  background: var(--iw-ink-950);\r
  border: 1px solid var(--iw-ember);\r
  color: var(--iw-gold);\r
  font-variant-numeric: tabular-nums;\r
  pointer-events: none;\r
}\r
\r
/* ── Tier colours ───────────────────────────────────────────────────── */\r
\r
.tier-common    { color: var(--iw-t-common); }\r
.tier-uncommon  { color: var(--iw-t-uncommon); }\r
.tier-rare      { color: var(--iw-t-rare); }\r
.tier-epic      { color: var(--iw-t-epic); }\r
.tier-legendary { color: var(--iw-t-legendary); }\r
.tier-mythic    { color: var(--iw-t-mythic); }\r
\r
/* ── Extension-owned button primitive ───────────────────────────────── */\r
\r
.iw-btn {\r
  font-family: var(--iw-font-ui);\r
  font-size: 12px;\r
  font-weight: 700;\r
  letter-spacing: .055em;\r
  text-transform: uppercase;\r
  padding: 7px 14px;\r
  min-width: 76px;\r
  border-radius: var(--iw-r-control);\r
  cursor: pointer;\r
  border: 1px solid var(--iw-line-hi);\r
  background: linear-gradient(180deg, #242018, #17140F);\r
  color: var(--iw-text);\r
  transition: background .13s, border-color .13s, color .13s;\r
  align-self: center;\r
  height: auto;\r
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 1px 0 #000;\r
}\r
.iw-btn:hover {\r
  background: linear-gradient(180deg, #2B261C, #1A1711);\r
  border-color: var(--iw-gold-dim);\r
  color: var(--iw-gold);\r
}\r
.iw-btn--primary {\r
  background: linear-gradient(180deg, #A94318, #742A0D);\r
  border-color: #C05A28;\r
  color: #FFEAD1;\r
}\r
.iw-btn--primary:hover {\r
  background: linear-gradient(180deg, #C04D1C, #87310E);\r
  border-color: var(--iw-ember-hi);\r
  color: #fff;\r
}\r
.iw-btn--disabled,\r
.iw-btn:disabled {\r
  background: #100F0C;\r
  border-color: #282218;\r
  color: var(--iw-faint);\r
  cursor: not-allowed;\r
  box-shadow: none;\r
}\r
\r
/* ── Progress / XP primitive ────────────────────────────────────────── */\r
\r
.iw-xp { display:flex; flex-direction:column; gap:4px; }\r
.iw-xp__line {\r
  display:flex;\r
  align-items:baseline;\r
  gap:8px;\r
  font-size:12px;\r
  font-family:var(--iw-font-ui);\r
}\r
.iw-xp__pct  { color:var(--iw-gold); font-weight:700; font-variant-numeric:tabular-nums; }\r
.iw-xp__togo { margin-left:auto; color:var(--iw-faint); font-variant-numeric:tabular-nums; }\r
.iw-xp__track {\r
  height:4px;\r
  background:#080806;\r
  border:1px solid #272117;\r
  border-radius:0;\r
  overflow:hidden;\r
  box-shadow: inset 0 1px 2px rgba(0,0,0,.75);\r
}\r
.iw-xp__fill  { height:100%; background:linear-gradient(90deg,#7B3515,var(--iw-ember)); transition:width .3s ease; }\r
.iw-xp__fill--ready { background:linear-gradient(90deg,#2E6438,#4D9859); }\r
\r
/* ── Scrollbars ─────────────────────────────────────────────────────── */\r
\r
::-webkit-scrollbar { width: 7px; height: 7px; }\r
::-webkit-scrollbar-track { background: var(--iw-ink-950); }\r
::-webkit-scrollbar-thumb { background: #403625; border-radius: 1px; }\r
::-webkit-scrollbar-thumb:hover { background: var(--iw-line-hi); }\r
\r
@media (prefers-reduced-motion: reduce) {\r
  * { transition:none !important; animation:none !important; }\r
}\r
\r
/* Padded rounded-full elements are almost always pills/tabs/status readouts,\r
   not true circular glyphs. Flatten them while preserving tiny round dots. */\r
[class*="rounded-full"][class*="px-"],\r
button[class*="rounded-full"]:not([class*="chat-name-"]),\r
[role="button"][class*="rounded-full"]:not([class*="chat-name-"]) {\r
  border-radius: var(--iw-r-control) !important;\r
}\r
\r
/* Bordered large-radius frames get the same forged edge treatment even when\r
   they are not .compact-panel (top HUD, inventory shell, market, leaderboard). */\r
[class*="border"][class*="rounded-3xl"],\r
[class*="border"][class*="rounded-2xl"],\r
[class*="border"][class*="rounded-xl"] {\r
  border-color: var(--iw-line) !important;\r
  box-shadow:\r
    inset 0 1px 0 rgba(255,255,255,.018),\r
    inset 0 -1px 0 rgba(0,0,0,.38) !important;\r
}\r
`;

  // src/content.js
  var ENABLED_KEY = "iw-skin-enabled";
  var VERSION = "1.6.0";
  var booted = false;
  var consumersBound = false;
  function injectPresentationStyles() {
    inject("base", base_default);
    inject("tooltip-engine", tooltip_engine_default);
    inject("inventory", inventory_default);
    inject("skillpanel", skillpanel_default);
    inject("ui-system", ui_system_default);
  }
  function scanRoots(roots) {
    if (!ItemDatabase.isReady()) return;
    const unique = /* @__PURE__ */ new Set();
    for (const root of roots || []) {
      if (root && root.isConnected) unique.add(root);
    }
    guardEach("scan-roots", unique, (root) => scanForItemNames(root));
  }
  function bindConsumersOnce() {
    if (consumersBound) return;
    consumersBound = true;
    guard("init:tooltip", initTooltipEngine);
    guard("init:inventory", initInventoryRenderer);
    guard("init:skill-panel", initSkillPanelRenderer);
    guard("init:ui-foundation", initUIFoundation);
    on("iw:dom-flush", (e) => {
      const roots = e.detail?.roots || [];
      if (!roots.length) {
        guard("paint:document", () => paintBackground());
        return;
      }
      guardEach("paint:root", roots, (root) => paintBackground(root));
    });
    on("iw:name-scan-flush", (e) => {
      if (!ItemDatabase.isReady()) return;
      scanRoots(e.detail?.roots || []);
    });
    document.addEventListener("iw:item-db-updated", () => {
      scanRoots([...getScanRoots()]);
    });
  }
  function boot() {
    if (booted) return;
    booted = true;
    setRuntimeActive(true);
    injectPresentationStyles();
    bindConsumersOnce();
    AtlasService.ready().catch((err) => {
      console.warn("[IW Fantasy Skin] Atlas failed to load:", err.message);
    });
    ItemDatabase.startAutoRefresh();
    ItemDatabase.ready().catch((err) => {
      console.warn("[IW Fantasy Skin] Item database failed to load:", err.message);
    });
    guard("paint:initial", () => paintBackground());
    guard("start:watcher", startWatcher);
    console.log(`[IW Fantasy Skin] v${VERSION} booted`);
  }
  function teardown() {
    if (!booted) {
      setRuntimeActive(false);
      return;
    }
    booted = false;
    guard("teardown:watcher", stopWatcher);
    ItemDatabase.stopAutoRefresh();
    guard("teardown:tooltip", () => hideTooltip());
    guard("teardown:name-scan", clearItemNameScan);
    guard("teardown:inventory", clearInventoryRenderer);
    guard("teardown:skill-panel", clearSkillPanels);
    guard("teardown:ui-foundation", clearUIFoundation);
    guard("teardown:background", clearBackgroundPaint);
    guard("teardown:styles", removeAll);
    setRuntimeActive(false);
    console.log("[IW Fantasy Skin] disabled — active presentation removed");
  }
  function applyEnabled(enabled) {
    if (enabled === false) teardown();
    else boot();
  }
  (async function start() {
    setRuntimeActive(false);
    const stored = await storageGet(ENABLED_KEY);
    applyEnabled(stored === null ? true : stored !== false);
    onStorageChanged(ENABLED_KEY, (value) => applyEnabled(value !== false));
  })();
})();
