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
    const listener = (changes, area2) => {
      if (area2 !== "local" || !(key in changes)) return;
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

  // src/modules/Viewport.js
  function isRendered(el) {
    if (!el?.isConnected) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility();
    const rect = el.getBoundingClientRect?.();
    return !!rect && (rect.width > 0 || rect.height > 0);
  }
  function pickRendered(candidates) {
    return candidates.find(isRendered) || candidates[0] || null;
  }
  function preferRendered(candidates) {
    const live = candidates.filter(isRendered);
    return live.length ? live : candidates;
  }
  var BREAKPOINTS = [640, 768, 1024, 1280, 1536];
  var layoutEpoch = 0;
  var queries = [];
  var bumpHandler = null;
  function getLayoutEpoch() {
    return layoutEpoch;
  }
  function startLayoutWatch(onCross) {
    if (queries.length) return;
    if (typeof matchMedia !== "function") return;
    bumpHandler = () => {
      layoutEpoch += 1;
      onCross?.();
    };
    queries = BREAKPOINTS.map((px) => matchMedia(`(min-width: ${px}px)`));
    for (const mq of queries) {
      mq.addEventListener("change", bumpHandler);
    }
  }
  function stopLayoutWatch() {
    for (const mq of queries) mq.removeEventListener("change", bumpHandler);
    queries = [];
    bumpHandler = null;
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
    woodcutting: ["wood", "woodcutting"],
    construction: ["build", "construction"],
    crafting: ["crafting"],
    fishing: ["fishing"],
    locked: ["coming soon", "upcoming skill"]
  };
  function skillIdentitySignals(panel) {
    const signals = /* @__PURE__ */ new Set();
    for (const el of panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"],div,span,p,strong')) {
      if (el.closest("button,a")) continue;
      const explicitHeading = /^H[1-4]$/.test(el.tagName) || /skill-name/i.test(String(el.className || ""));
      if (!explicitHeading && el.childElementCount) continue;
      const text = normaliseSkillSignal(el.textContent).replace(/^[^a-z0-9]+/i, "");
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
  function lockedCopySignal(panel) {
    let hasLabel = false;
    let hasUnlock = false;
    for (const el of panel.querySelectorAll("div,span,p,strong")) {
      const text = normaliseSkillSignal(el.textContent);
      if (!text || text.length > 96) continue;
      if (text.includes("coming soon") || text.includes("upcoming skill")) hasLabel = true;
      if (text.includes("unlock in a future update")) hasUnlock = true;
    }
    return hasLabel && hasUnlock;
  }
  function skillSignature(panel) {
    const buttonEls = [...panel.querySelectorAll("button")];
    const buttons = buttonEls.map((btn) => normaliseSkillSignal(btn.textContent));
    const identities = skillIdentitySignals(panel);
    const lockedCopy = lockedCopySignal(panel);
    const sig = JSON.stringify([buttons, identities, lockedCopy]);
    return { sig, buttonEls, buttons, identities, lockedCopy };
  }
  function detectSkillTypeCached(panel) {
    const computed = skillSignature(panel);
    const hit = skillTypeCache.get(panel);
    if (hit && hit.sig === computed.sig) return hit.type;
    const type = detectSkillType(panel, computed);
    skillTypeCache.set(panel, { sig: computed.sig, type });
    return type;
  }
  function detectSkillType(panel, precomputed) {
    const { buttonEls, buttons, identities: labels, lockedCopy } = precomputed;
    const actionTexts = buttons.filter(Boolean);
    const hasAction = (...names) => actionTexts.some((text) => names.includes(text));
    const hasTurnInOrSkip = actionTexts.some((text) => /^turn in$/.test(text) || /^skip(?:\s*\(\d+\))?$/.test(text));
    if (hasTurnInOrSkip && [...panel.querySelectorAll("p,div,span")].some((el) => /^reward\s*:/i.test(el.textContent.trim()))) {
      return "unknown";
    }
    if (hasAction("fight")) return "combat";
    if (hasAction("mine")) return "mining";
    if (hasAction("prospect", "cut")) return "jewelcrafting";
    if (hasAction("smelt", "forge")) return "smithing";
    if (hasAction("brew")) return "alchemy";
    if (hasAction("enchant")) return "spellcrafting";
    if (hasAction("tailor", "sew", "weave")) return "tailoring";
    if (hasAction("fish")) return "fishing";
    if (hasAction("chop")) return "woodcutting";
    if (hasAction("craft parts", "build")) return "construction";
    const identityType = skillTypeFromIdentity(labels);
    const hasDisabledControl = buttonEls.some((btn) => btn.disabled || btn.getAttribute("aria-disabled") === "true");
    if (hasDisabledControl && lockedCopy) return "locked";
    if (identityType) return identityType;
    if (hasAction("craft")) return "crafting";
    if (hasAction("gather", "harvest")) return "gathering";
    if (labels.some((t) => /^combat(?:\s|$)/.test(t))) return "combat";
    if (labels.some((t) => /^mining(?:\s|$)|^mine(?:\s|$)/.test(t))) return "mining";
    if (labels.some((t) => /^(?:jewel|jewelcrafting)(?:\s|$)|^prospect(?:\s|$)/.test(t))) return "jewelcrafting";
    if (labels.some((t) => /^smithing(?:\s|$)|^smelt(?:\s|$)/.test(t))) return "smithing";
    if (labels.some((t) => /^gathering(?:\s|$)|^gather(?:\s|$)/.test(t))) return "gathering";
    if (labels.some((t) => /^alchemy(?:\s|$)|^brew(?:\s|$)/.test(t))) return "alchemy";
    if (labels.some((t) => /^(?:spellcraft|spellcrafting)(?:\s|$)|^enchant(?:\s|$)/.test(t))) return "spellcrafting";
    if (labels.some((t) => /^(?:tailor|tailoring)(?:\s|$)|^(?:tailor|sew|weave)(?:\s|$)/.test(t))) return "tailoring";
    if (labels.some((t) => /^(?:wood|woodcutting)(?:\s|$)|^chop(?:\s|$)/.test(t))) return "woodcutting";
    if (labels.some((t) => /^(?:build|construction)(?:\s|$)/.test(t))) return "construction";
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
    guard("start:layout-watch", () => startLayoutWatch(() => guard("layout-change:discover", () => discover(document.body, "layout-change"))));
  }
  function stopWatcher() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    guard("stop:layout-watch", stopLayoutWatch);
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
      this._itemDims = { cols: 10, rows: 48, cell: 128 };
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
      this._applySprite(hostEl, atlas, entry);
      hostEl.dataset.iwAtlas = atlas;
      if (badge) this._paintBadge(hostEl, badge);
      else this._clearBadge(hostEl);
      return true;
    }
    /** Paint one manifest/index entry from either atlas into any sized element. */
    _applySprite(el, atlas, entry) {
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
      el.style.backgroundImage = `url("${atlasUrl}")`;
      el.style.backgroundSize = `${atlasW / w * 100}% ${atlasH / h * 100}%`;
      el.style.backgroundPosition = `${xPct.toFixed(6)}% ${yPct.toFixed(6)}%`;
      el.style.backgroundRepeat = "no-repeat";
    }
    /**
     * Paint the dedicated gear-atlas enhancement art. The current manifest keeps
     * +1, +2, +3 and +4 at indexes 0..3. Name lookup remains authoritative so
     * sprite coordinates can move without hard-coded atlas math in the renderer.
     * A text chip is retained only for a future enhancement level with no art.
     */
    _paintBadge(hostEl, level) {
      if (typeof getComputedStyle === "function" && getComputedStyle(hostEl).position === "static") {
        hostEl.style.position = "relative";
      }
      let badgeEl = hostEl.querySelector(".iw-icon-badge");
      if (!badgeEl) {
        badgeEl = document.createElement("span");
        hostEl.appendChild(badgeEl);
      }
      const entry = this._gearByName ? this._gearByName.get(normalise(`+${level}`)) : null;
      if (entry) {
        badgeEl.className = "iw-icon-badge iw-icon-badge--sprite";
        badgeEl.textContent = "";
        badgeEl.setAttribute("aria-hidden", "true");
        badgeEl.setAttribute("data-iw-badge", String(level));
        this._applySprite(badgeEl, "gear", entry);
        return;
      }
      badgeEl.className = "iw-icon-badge";
      badgeEl.removeAttribute("aria-hidden");
      badgeEl.setAttribute("data-iw-badge", String(level));
      badgeEl.style.removeProperty("background-image");
      badgeEl.style.removeProperty("background-size");
      badgeEl.style.removeProperty("background-position");
      badgeEl.style.removeProperty("background-repeat");
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
  var CATEGORY_CLASS = {
    "equipment": "fs-cat-gear",
    "consumable": "fs-cat-consumable",
    "processed": "fs-cat-processed",
    "resource": "fs-cat-resource",
    "trade good": "fs-cat-trade"
  };
  var CONSUMABLE_SUB_CLASS = {
    "potion": "fs-cat-potion",
    "enchant scroll": "fs-cat-enchant",
    "xp scroll": "fs-cat-xpscroll",
    "xp shard": "fs-cat-xpscroll",
    "supply cache": "fs-cat-cache"
  };
  function categoryClass(item) {
    const c = String(item && item.category || "").trim().toLowerCase();
    if (c === "consumable") {
      const sub = String(item && item.subcategory || "").trim().toLowerCase();
      return CONSUMABLE_SUB_CLASS[sub] || "fs-cat-consumable";
    }
    return CATEGORY_CLASS[c] || "fs-cat-unknown";
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
  var tooltip_engine_default = '.iw-item-ref{display:inline;background:none!important;border:0!important;border-bottom:1px solid transparent!important;border-radius:0!important;padding:0!important;margin:0!important;box-shadow:none!important;font:inherit!important;line-height:inherit!important;font-weight:700!important;letter-spacing:inherit!important;text-transform:none!important;color:var(--iw-gold);cursor:help;text-decoration:none;transition:border-color .12s,color .12s;vertical-align:baseline}.iw-item-ref:hover,.iw-item-ref:focus-visible{color:var(--iw-gold);border-bottom-color:var(--iw-gold-dim)!important}.iw-item-ref:focus-visible{outline:1px solid var(--iw-gold)!important;outline-offset:2px!important}.iw-item-info{display:none}.iw-tip{--fs-tip-w: 330px;--fs-tip-pad-x: 12px;--fs-tip-art: 64px;--fs-tip-corner-h: 20px;--fs-tip-corner-w: 18px;position:fixed;z-index:99999;width:var(--fs-tip-w);max-width:calc(100vw - 20px);box-sizing:border-box;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%);background-blend-mode:normal,normal,soft-light,normal;border:1px solid var(--iw-th-edge);border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 16px 40px rgba(0,0,0,.82);max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);flex-direction:column;overflow:hidden;overscroll-behavior:contain;font-family:var(--iw-font-ui);font-size:12px;line-height:1.38;color:var(--iw-text);opacity:0;pointer-events:none;transition:none}.iw-tip::before{content:"";position:absolute;z-index:2;left:12px;right:12px;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent);opacity:.78;pointer-events:none}.iw-tip::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-style:solid;border-width:var(--fs-tip-corner-h) var(--fs-tip-corner-w);border-color:transparent;border-image:var(--iw-corner-filigree) 95 88 / var(--fs-tip-corner-h) var(--fs-tip-corner-w) / 0 stretch}.iw-tip>*{position:relative;z-index:1}.iw-tip.is-open{opacity:1;pointer-events:auto}.iw-tip:focus-visible{outline:2px solid var(--iw-gold);outline-offset:-3px}.iw-tip-head{position:relative;flex:none;display:flex;align-items:center;gap:10px;padding:9px var(--fs-tip-pad-x);box-sizing:border-box;background:linear-gradient(180deg,rgba(255,255,255,.030),rgba(0,0,0,.20));border-bottom:1px solid #302A20}.iw-tip-title-block{flex:1 1 auto;min-width:0}.iw-tip-name{font-family:var(--iw-font-head);font-size:15px;font-weight:700;line-height:1.18;letter-spacing:.012em;word-break:break-word;text-shadow:0 1px 0 #000}.iw-tip-art{flex:none;width:var(--fs-tip-art);height:var(--fs-tip-art);box-sizing:border-box;display:grid;place-items:center;padding:8px;background-color:#080806;border:1px solid #4A3B22;border-radius:var(--iw-r-slot, 2px);box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),0 0 8px -2px rgba(212,173,99,.22);overflow:visible;pointer-events:none}.iw-tip-art-host,.iw-tip-art-fallback{--fs-tip-art-inner: calc(var(--fs-tip-art) - 18px);position:relative;display:block;width:var(--fs-tip-art-inner);height:var(--fs-tip-art-inner);min-width:var(--fs-tip-art-inner);min-height:var(--fs-tip-art-inner);max-width:var(--fs-tip-art-inner);max-height:var(--fs-tip-art-inner);background-repeat:no-repeat}.iw-tip-art-fallback{display:grid;place-items:center;font-size:24px;opacity:.35}.iw-tip-close{flex:none;width:22px;height:22px;display:grid;place-items:center;padding:0!important;border:1px solid #4A4031!important;border-radius:var(--iw-r-control, 2px)!important;background-color:rgba(12,11,9,.88)!important;color:#C8BFAE!important;font:700 15px/1 var(--iw-font-ui)!important;cursor:pointer}.iw-tip-close:hover,.iw-tip-close:focus-visible{border-color:var(--iw-gold)!important;color:var(--iw-text-hi)!important;outline:1px solid var(--iw-gold)!important}.iw-tip-badges{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px}.iw-tip-badge{font-size:9.5px;font-weight:600;line-height:1.1;letter-spacing:.02em;white-space:nowrap;padding:3px 6px;border:1px solid #332C1E;border-radius:var(--iw-r-control, 2px);background:linear-gradient(180deg,#14130F,#0C0B09);color:#B9B2A3}.iw-tip-badge.t{color:#AFC8F3;border-color:rgba(91,155,213,.42)}.iw-tip-badge.req{color:#E6A05B;border-color:rgba(217,138,58,.44)}.iw-tip-body{flex:1 1 auto;min-height:0;padding:9px var(--fs-tip-pad-x) 10px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}.iw-tip-sec{margin-top:9px;padding-top:8px;border-top:1px solid #302A20}.iw-tip-sec:first-child{margin-top:0;padding-top:0;border-top:0}.iw-tip-sec-title{font-family:var(--iw-font-head);font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--iw-gold-dim);margin-bottom:5px}.iw-tip-effect{color:#C4BDAF;font-size:12px;line-height:1.4}.iw-tip-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px 14px}.iw-tip-stats:not(:has(>:nth-child(2))){grid-template-columns:minmax(0,1fr)}.iw-tip-stat-block{min-width:0}.iw-tip-stat{min-width:0;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11.5px;padding:1px 0}.iw-tip-stat .k{min-width:0;color:#AAA394;white-space:nowrap}.iw-tip-stat .v{flex:none;font-family:var(--iw-font-head);font-size:11.5px;color:var(--iw-text-hi);font-weight:700;text-align:right;font-variant-numeric:tabular-nums}.iw-tip-stat .v.amber{color:#E19A50}.iw-tip-stat .v.good{color:var(--iw-good)}.iw-tip-stat-note{margin-top:1px;color:var(--iw-faint);font-size:9px;line-height:1.25}.iw-tip-acq{position:relative;padding:1px 0 1px 9px}.iw-tip-acq::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:#5878AC}.iw-tip-acq-main{font-size:12px;font-weight:600;color:var(--iw-text-hi)}.iw-tip-acq-sub{font-size:11px;color:#8F899C;margin-top:2px;line-height:1.35}.iw-tip-acq.is-unknown .iw-tip-acq-main{color:var(--iw-faint);font-style:italic}.iw-tip-flavour{font-family:var(--iw-font-flav);font-style:italic;font-size:12px;color:var(--iw-gold-dim);line-height:1.45}.iw-tip-foot{flex:none;min-height:30px;padding:6px var(--fs-tip-pad-x);border-top:1px solid #302A20;background:rgba(0,0,0,.30);display:flex;align-items:center;justify-content:space-between;gap:10px}.iw-tip-foot:empty{display:none}.iw-tip-link{font-size:11px;font-weight:700;letter-spacing:.02em;color:#70A1EE;text-decoration:none}.iw-tip-link:hover{color:#9FC0F3}.iw-tip-link:focus-visible{color:#BBD2F5;outline:1px solid #70A1EE;outline-offset:3px}.iw-tip-source{margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.04em;color:#B07846;text-transform:lowercase}.iw-tip-source.is-stale{color:#D58A52}@media(max-width:420px){.iw-tip{--fs-tip-w: calc(100vw - 20px);--fs-tip-pad-x: 11px;--fs-tip-art: 56px;--fs-tip-corner-h: 17px;--fs-tip-corner-w: 15px}.iw-tip-stats{grid-template-columns:1fr}}\n';

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
        <div class="iw-tip-art ${artClass}" aria-hidden="true"><span class="iw-tip-art-fallback">${glyph}</span></div>
        <div class="iw-tip-title-block">
          <div class="iw-tip-name ${tier}">${esc(item.name)}</div>
          <div class="iw-tip-badges">${badges}</div>
        </div>
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
  var SKIP_CONTAINERS = '.iw-item-ref, [data-iw-tooltip-trigger], .fs-inv-row, .fs-skill-header, .iw-tip, [role="tooltip"], input, textarea, select';
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
  var UPGRADE_ROLL_LINE = /^\s*🎲\s*[+-]?\d/u;
  var UPGRADE_ROLL_STATS = /^\s*🎲\s*[+-]?\d+\s*[·•–—-]\s*(.+)$/u;
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
      (t) => t.length > 2 && !/^\d[\d,]*$/.test(t) && !/^[x×]\s*\d/i.test(t) && !/^lv\.?\s*\d+$/i.test(t) && !/^\+\s*[1-9]$/.test(t) && !/^(equip|equipped|unequip|use|drop|sell|list|lock|unlock|set bonus)$/i.test(t)
    );
    const upgradeToken = source.find((t) => /^\+\s*[1-9]$/.test(t));
    if (upgradeToken) {
      const suffix = "+" + upgradeToken.replace(/\D/g, "");
      for (const base of candidates) {
        const bare = base.replace(/\s*\+\s*\d+\s*$/, "").trim();
        for (const combined of [base + suffix, base + " " + suffix, bare + suffix, bare + " " + suffix]) {
          if (lookup(combined)) return combined;
        }
      }
      for (const base of candidates) {
        const bare = base.replace(/\s*\+\s*\d+\s*$/, "").trim();
        if (bare && bare !== base && lookup(bare)) return bare;
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
    const rolledStats = [];
    const rolledKeys = /* @__PURE__ */ new Set();
    let rollLevel = null;
    for (const raw of rawTexts || []) {
      const s = String(raw == null ? "" : raw);
      const lv = /^\s*🎲\s*\+?\s*(\d+)/u.exec(s);
      if (lv) rollLevel = parseInt(lv[1], 10);
      const m = UPGRADE_ROLL_STATS.exec(s);
      if (!m) continue;
      const text = m[1].replace(/\s+/g, " ").trim();
      const key = compareKey(text);
      if (!text || rolledKeys.has(key)) continue;
      rolledKeys.add(key);
      rolledStats.push({ text, kind: "effect", count: 1 });
    }
    const ORB_MAX = 4;
    const isOrbUpgradeable = rollLevel !== null || /\bcloak\b/i.test(String(item?.subcategory || ""));
    const suppressNotUpgradable = isOrbUpgradeable && rollLevel !== ORB_MAX;
    const NOT_UPGRADABLE = /\bnot\s+upgradable\b|\bcannot\s+be\s+upgraded\b/i;
    const source = (rawTexts || []).filter((t) => !UPGRADE_ROLL_LINE.test(String(t == null ? "" : t))).map(normaliseInventoryText).filter(Boolean).sort((a, b) => a.length - b.length);
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
      if (suppressNotUpgradable && NOT_UPGRADABLE.test(text)) continue;
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
    const extraRolled = rolledStats.filter((r) => !counts.has(compareKey(r.text)));
    const details = [...counts.values(), ...extraRolled].sort((a, b) => {
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
  var inventory_default = '[data-iw-inventory-root="1"]{--fs-inv-command-w: 54px;overflow:hidden!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]{position:relative!important;isolation:isolate!important;margin:2px 0 4px!important;padding:7px 9px!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.7),inset 0 1px 0 var(--iw-th-glow),0 2px 7px rgba(0,0,0,.34)!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:10px!important;right:10px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 16%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 84%,transparent)!important;opacity:.7!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]::after{content:""!important;position:absolute!important;inset:3px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 55%,transparent)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]>*{position:relative;z-index:1}[data-iw-inventory-title="1"]{font-family:var(--iw-font-head)!important;font-size:18px!important;font-weight:700!important;letter-spacing:.13em!important;text-transform:uppercase!important;color:var(--iw-text-hi)!important;text-shadow:0 0 16px rgba(216,121,31,.20)!important}.fs-inv-rule{position:relative;height:30px;margin:2px 0 10px;pointer-events:none}.fs-inv-rule::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(90deg,transparent,var(--iw-line-hot) 14%,var(--iw-line-hot) 86%,transparent);opacity:.7}.fs-inv-rule::after{content:"";position:absolute;left:50%;top:50%;width:186px;height:62px;transform:translate(-50%,-50%);background-image:var(--iw-zone-atlas);background-repeat:no-repeat;background-size:730.41px 393.23px;background-position:-210.63px -5.10px}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter],[data-iw-inventory-root="1"] [data-iw-inventory-control=page]{min-height:26px!important;height:26px!important;position:relative!important;top:3px!important;border-radius:2px!important;border:1px solid #2A241A!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important;padding:0 11px!important;font-family:var(--iw-font-head)!important;font-size:10.5px!important;font-weight:600!important;line-height:24px!important;letter-spacing:.09em!important;text-transform:uppercase!important;color:var(--iw-dim)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter]:hover,[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:hover{color:var(--iw-text)!important;border-color:var(--iw-line-hot)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 0 10px -3px rgba(216,121,31,.35)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:disabled:hover{border-color:#2A241A!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter][data-iw-inventory-filter-state=active]{color:#F3E3C0!important;border-color:var(--iw-th-cta-hi)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-th-cta) 32%,#000),color-mix(in srgb,var(--iw-th-cta) 12%,#000))!important;box-shadow:inset 0 0 12px -2px color-mix(in srgb,var(--iw-th-cta-hi) 62%,transparent),inset 0 1px 0 rgba(255,216,150,.18),0 0 0 1px color-mix(in srgb,var(--iw-th-cta-hi) 20%,transparent)!important;text-shadow:0 0 8px color-mix(in srgb,var(--iw-th-cta-hi) 48%,transparent)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:disabled{opacity:.45!important;color:var(--iw-faint)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon]{display:grid!important;place-items:center!important;width:30px!important;height:31px!important;min-width:30px!important;min-height:31px!important;padding:0!important;border:0!important;border-radius:0!important;color:var(--iw-gold-dim)!important;background-color:transparent!important;background:var(--iw-zone-atlas) no-repeat!important;background-image:var(--iw-zone-atlas)!important;background-repeat:no-repeat!important;background-size:322.5px 173.63px!important;background-position:-177.38px -2.25px!important;background-repeat:no-repeat!important;box-shadow:none!important;flex:0 0 auto!important;overflow:visible!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon] svg{width:15px!important;height:15px!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon]:hover{color:#FFE2AE!important;background-position:-209.63px -2.25px!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=glyph]{width:15px!important;height:15px!important;flex:0 0 auto!important;align-self:center!important;filter:drop-shadow(0 0 5px rgba(216,121,31,.4))!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page-count]{color:var(--iw-gold-dim)!important;font-family:var(--iw-font-head)!important;font-size:12px!important;font-weight:700!important;font-variant-numeric:tabular-nums;letter-spacing:.14em}.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){display:flex!important;align-items:center!important;gap:0!important;min-height:62px!important;padding:0!important;position:relative!important;overflow:hidden!important;border:0!important;border-top:1px solid var(--iw-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transition:background-color .12s!important}.compact-row:has(>.fs-inv-row):first-child,[class*=item-row]:has(>.fs-inv-row):first-child{border-top:0!important}.compact-row:has(>.fs-inv-row):hover,[class*=item-row]:has(>.fs-inv-row):hover{background:rgba(255,214,140,.022)!important}.fs-inv-row::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-frame) 11%,transparent),transparent 46%)}.compact-row:has(>.fs-inv-row):hover .fs-inv-row::after,[class*=item-row]:has(>.fs-inv-row):hover .fs-inv-row::after{opacity:1}.fs-inv-row{--fs-tier: #8C8578;--fs-frame: var(--fs-tier);order:1;flex:1 1 auto;min-width:0;min-height:60px;box-sizing:border-box;display:grid;grid-template-columns:52px minmax(0,1fr) 38px;grid-template-areas:"icon body qty";align-items:center;column-gap:12px;padding:7px 8px 7px 14px;position:relative;cursor:default}.fs-inv-row.has-details,.fs-inv-row.has-requirements{min-height:68px}.fs-inv-row.has-details.has-requirements{min-height:76px}.fs-inv-row.fs-cat-gear{--fs-tier: #6E9BC4}.fs-inv-row.fs-cat-consumable{--fs-tier: #68B96A}.fs-inv-row.fs-cat-processed{--fs-tier: #A6AEB2}.fs-inv-row.fs-cat-resource{--fs-tier: #9E7B54}.fs-inv-row.fs-cat-trade{--fs-tier: #D4AD63}.fs-inv-row.fs-cat-unknown{--fs-tier: #8C8578}.fs-inv-row.fs-cat-potion{--fs-tier: #CE5C6E}.fs-inv-row.fs-cat-enchant{--fs-tier: #8E7BDB}.fs-inv-row.fs-cat-xpscroll{--fs-tier: #3FB2AC}.fs-inv-row.fs-cat-cache{--fs-tier: #B366C4}.fs-inv-row.fs-inv-orb{--fs-tier: #E0913E}.fs-inv-row::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;background:linear-gradient(180deg,transparent,var(--fs-frame) 18%,var(--fs-frame) 82%,transparent);box-shadow:0 0 8px color-mix(in srgb,var(--fs-frame) 42%,transparent);pointer-events:none}.fs-inv-icon{grid-area:icon;width:52px;height:52px;min-width:52px;min-height:52px;position:relative;background-repeat:no-repeat;background-color:#080806;border:1px solid color-mix(in srgb,var(--fs-frame) 52%,#3A3020);border-radius:2px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),inset 0 6px 16px -8px color-mix(in srgb,var(--fs-frame) 55%,transparent),0 0 8px -1px color-mix(in srgb,var(--fs-frame) 38%,transparent);image-rendering:auto;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--iw-faint);overflow:visible;cursor:help;outline:none}.fs-inv-icon:hover,.fs-inv-icon:focus-visible{border-color:var(--fs-frame);box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),inset 0 6px 16px -8px color-mix(in srgb,var(--fs-frame) 70%,transparent),0 0 12px -1px color-mix(in srgb,var(--fs-frame) 60%,transparent)}.fs-inv-row.is-equipped .fs-inv-icon{border-color:#8A6A2C;box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),0 0 9px -1px rgba(200,120,40,.34)}.fs-inv-body{grid-area:body;min-width:0;max-width:100%;overflow:hidden;align-self:center;padding-block:1px}.fs-inv-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;font-family:var(--iw-font-head);font-size:14px;font-weight:700;line-height:1.22;letter-spacing:.012em;white-space:normal;overflow:hidden;overflow-wrap:anywhere;text-overflow:ellipsis;color:var(--fs-tier);text-shadow:0 1px 0 #000}.fs-inv-name .fs-inv-sub{color:var(--iw-faint);font-family:var(--iw-font-ui);font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase}.fs-inv-name .fs-inv-plus{color:#C6A3E4;font-family:var(--iw-font-ui);font-size:11px;font-weight:700;letter-spacing:.02em;vertical-align:1px}.fs-inv-name-plain{color:var(--iw-text)}.fs-inv-name .iw-item-ref{color:inherit}.fs-inv-name .iw-item-ref:hover,.fs-inv-name .iw-item-ref:focus-visible{border-bottom-color:currentColor}.fs-inv-stats{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:4px;min-height:13px}.fs-stat{position:relative;font-family:var(--iw-font-ui);font-size:11px;line-height:1.25;font-weight:600;color:var(--iw-text);background:none;border:0;border-radius:0;padding:0 8px 0 0;margin-right:8px;font-variant-numeric:tabular-nums;white-space:nowrap}.fs-stat:not(:last-child)::after{content:"";position:absolute;right:0;top:2px;bottom:1px;width:1px;background:#332C1E}.fs-stat--pos{color:var(--iw-good)}.fs-stat--tier{color:var(--iw-dim);font-weight:500}.fs-inv-details,.fs-inv-requirements{display:flex;min-width:0;max-width:100%;overflow:hidden;flex-wrap:wrap;align-items:center;gap:3px 13px;margin-top:3px;font-family:var(--iw-font-ui);font-size:10.5px;line-height:1.25}.fs-inv-detail,.fs-inv-requirement{position:relative;min-width:0;color:var(--iw-dim);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-inv-detail::before,.fs-inv-requirement::before{content:"◆";margin-right:4px;font-size:6px;vertical-align:1px;color:var(--iw-gold-dim)}.fs-inv-detail--loadout{color:#74AFCB}.fs-inv-detail--loadout::before{color:#5D97B3}.fs-inv-detail--socket{color:#C7B56A}.fs-inv-detail--socket::before{color:#73B7D4}.fs-inv-detail--effect{color:#B8C6A2}.fs-inv-detail--effect::before{color:#879A73}.fs-inv-detail--status{color:var(--iw-faint)}.fs-inv-detail--status::before{color:var(--iw-faint)}.fs-inv-detail--set{color:#C8B562}.fs-inv-requirement{color:#D8C76A}.fs-inv-requirement::before{color:#BCA744}.fs-inv-detail-count{margin-left:4px;color:var(--iw-faint);font-variant-numeric:tabular-nums}.fs-inv-qty{grid-area:qty;justify-self:end;align-self:center;min-width:34px;padding-right:2px;text-align:right;font-family:var(--iw-font-head);font-size:12px;font-weight:700;color:var(--iw-gold-dim);font-variant-numeric:tabular-nums;white-space:nowrap}[data-fs-action-host="1"]{display:contents!important;font-size:0!important;line-height:0!important;color:transparent!important}[data-fs-suppressed="1"]{display:none!important}[data-fs-preserved-action=control]{order:2;flex:0 0 auto!important;align-self:center!important;position:relative;z-index:2;margin:0 6px 0 0!important;min-width:0!important;max-width:none!important}button[data-fs-preserved-action=control],a[data-fs-preserved-action=control],[role=button][data-fs-preserved-action=control]{height:26px!important;min-height:26px!important;padding:0 11px!important;border-radius:2px!important;border:1px solid #2A241A!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;color:var(--iw-dim)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important;font-family:var(--iw-font-head)!important;font-size:10.5px!important;line-height:24px!important;font-weight:600!important;letter-spacing:.09em!important;text-transform:uppercase!important;white-space:nowrap!important}button[data-fs-preserved-action=control]:hover:not(:disabled),a[data-fs-preserved-action=control]:hover,[role=button][data-fs-preserved-action=control]:hover{color:var(--iw-text)!important;border-color:var(--iw-line-hot)!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 0 10px -3px rgba(216,121,31,.35)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equipped],a[data-fs-preserved-action=control][data-fs-action-kind=equipped],[role=button][data-fs-preserved-action=control][data-fs-action-kind=equipped]{border-color:color-mix(in srgb,var(--iw-good) 44%,#2A241A)!important;color:var(--iw-good)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equip],a[data-fs-preserved-action=control][data-fs-action-kind=equip],[role=button][data-fs-preserved-action=control][data-fs-action-kind=equip]{border-color:var(--iw-th-brass)!important;color:#FFE9C4!important}button[data-fs-preserved-action=control][data-fs-action-kind=set],a[data-fs-preserved-action=control][data-fs-action-kind=set],[role=button][data-fs-preserved-action=control][data-fs-action-kind=set]{color:var(--iw-gold)!important}button[data-fs-preserved-action=control][data-fs-action-kind=secondary],a[data-fs-preserved-action=control][data-fs-action-kind=secondary],[role=button][data-fs-preserved-action=control][data-fs-action-kind=secondary]{color:var(--iw-dim)!important}button[data-fs-preserved-action=control][data-fs-action-kind=icon],a[data-fs-preserved-action=control][data-fs-action-kind=icon],[role=button][data-fs-preserved-action=control][data-fs-action-kind=icon]{width:30px!important;min-width:30px!important;padding:0!important;color:var(--iw-faint)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important}button[data-fs-preserved-action=control][data-fs-action-kind=equipped]:hover:not(:disabled){color:var(--iw-good)!important;border-color:var(--iw-good)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equip]:hover:not(:disabled){color:#FFF3DF!important;border-color:var(--iw-th-hairline-hi)!important}button[data-fs-preserved-action=control]:disabled,[role=button][data-fs-preserved-action=control][aria-disabled=true]{opacity:.45!important;color:var(--iw-faint)!important;border-color:#2A241A!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important}@media(max-width:1024px){.fs-inv-row{grid-template-columns:46px minmax(0,1fr) 34px;min-height:56px;padding-left:11px;column-gap:10px}.fs-inv-icon{width:46px;height:46px;min-width:46px;min-height:46px}.fs-inv-stats .fs-stat:nth-child(n+6){display:none}.fs-inv-details{max-height:26px;overflow:hidden}[data-iw-inventory-root="1"]{padding:20px 16px!important}[data-iw-inventory-root="1"]::after{border-width:24px 22px;border-image-width:24px 22px}[data-iw-inventory-title="1"]::after{width:150px}}@media(max-width:768px){.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){flex-wrap:wrap!important;align-items:center!important;padding-bottom:5px!important}.fs-inv-row{flex:1 0 100%;grid-template-columns:42px minmax(0,1fr) 34px;grid-template-areas:"icon body qty"}.fs-inv-icon{width:42px;height:42px;min-width:42px;min-height:42px}.fs-inv-qty{justify-self:end;padding:0 2px 0 0;text-align:right}.fs-inv-stats .fs-stat:nth-child(n+4){display:none}.fs-inv-details,.fs-inv-requirements{display:flex;max-height:none;overflow:visible;gap:2px 8px;font-size:9.5px}.fs-inv-detail,.fs-inv-requirement{white-space:normal;overflow:visible;text-overflow:clip}[data-fs-preserved-action=control]{margin-top:3px!important}button[data-fs-preserved-action=control],a[data-fs-preserved-action=control],[role=button][data-fs-preserved-action=control]{padding-inline:7px!important}[data-iw-inventory-root="1"]{padding:16px 12px!important}[data-iw-inventory-root="1"]::after{border-width:20px 18px;border-image-width:20px 18px}}@media(prefers-reduced-motion:reduce){.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){transition:none!important}}\n';

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
  var INVENTORY_LIST_ATTR = "data-iw-inventory-list";
  var INVENTORY_FILTER_STATE_ATTR = "data-iw-inventory-filter-state";
  var ROW_SELECTOR = '.compact-row, [class*="item-row"]';
  var INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]';
  var pendingEmptyRetries = /* @__PURE__ */ new WeakSet();
  var displayStyleOwner = createInlineStyleOwner();
  var cheapSignatures = /* @__PURE__ */ new WeakMap();
  var contextCache = /* @__PURE__ */ new WeakMap();
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
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const el of row.querySelectorAll("span, div, p")) {
      if (el.closest(".fs-inv-row") || isInsideNativeControl(el, row)) continue;
      const nearLeaf = el.childElementCount > 0 && el.childElementCount <= 3 && el.textContent.trim().length <= 120 && !el.querySelector(INTERACTIVE_SELECTOR) && [...el.children].every((c) => c.childElementCount === 0);
      if (el.childElementCount !== 0 && !nearLeaf) continue;
      const text = el.textContent.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }
  function detailTexts(row, displayName = "") {
    const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d|🎲/i;
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
    let enhancement = null;
    if (!/\+\s*\d+\s*$/.test(name)) {
      const tok = texts.find((t) => /^\+\s*[1-9]$/.test(t));
      if (tok) enhancement = tok.replace(/\D/g, "");
    }
    return { name, qty: guessQuantity(texts), detailTexts: detailTexts(row, name), enhancement };
  }
  function headingIsInventory(el) {
    return String(el.textContent || "").trim().toLowerCase() === "inventory";
  }
  function findInventoryRoot(row) {
    let cur = row;
    for (let depth = 0; cur && depth < 10; depth += 1, cur = cur.parentElement) {
      const aria = String(cur.getAttribute?.("aria-label") || "").trim().toLowerCase();
      if (aria === "inventory") return cur;
    }
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, [data-title]")].filter((h) => !h.closest(ROW_SELECTOR) && headingIsInventory(h));
    for (const heading of headings) {
      let node = heading.parentElement;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        if (!node.querySelector(ROW_SELECTOR)) continue;
        if (node.contains(row)) return node;
        break;
      }
    }
    return null;
  }
  function resolveInventoryContext(row) {
    const controls = [...row.querySelectorAll('button, [role="button"]')].map((el) => String(el.textContent || "").trim().toLowerCase()).filter(Boolean);
    const equipShortcut = controls.some((t) => /^(equip|equipped|unequip|list)$/.test(t));
    const root = findInventoryRoot(row);
    return { inContext: equipShortcut || !!root, root };
  }
  function ensureInventoryRule(root, title) {
    if (!root || !title) return;
    let anchorChild = title;
    while (anchorChild && anchorChild.parentElement !== root) anchorChild = anchorChild.parentElement;
    if (!anchorChild) return;
    let rule = root.querySelector(":scope > .fs-inv-rule");
    if (!rule) {
      rule = document.createElement("div");
      rule.className = "fs-inv-rule";
      rule.setAttribute("aria-hidden", "true");
    }
    if (anchorChild.nextElementSibling !== rule) anchorChild.after(rule);
  }
  function classifyInventoryChrome(root) {
    if (!root) return;
    root.setAttribute(INVENTORY_ROOT_ATTR, "1");
    const titleCandidates = root.querySelectorAll("h1, h2, h3, h4, [data-title]");
    for (const title of titleCandidates) {
      if (title.closest(ROW_SELECTOR)) continue;
      if (headingIsInventory(title)) {
        title.setAttribute(INVENTORY_TITLE_ATTR, "1");
        ensureInventoryRule(root, title);
      }
    }
    const buttons = [...root.querySelectorAll('button, a, [role="button"]')];
    for (const button of buttons) {
      if (button.closest(ROW_SELECTOR)) continue;
      const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      let role = "";
      if (/^(all|gear|materials|consumables|drops)$/.test(text)) role = "filter";
      else if (/^(prev|previous|next)$/.test(text)) role = "page";
      else if ((!text || text.length <= 2) && button.querySelector("svg")) role = "icon";
      if (role) button.setAttribute(INVENTORY_CONTROL_ATTR, role);
      if (role === "filter") {
        const cls = String(button.className || "");
        const active = button.getAttribute("aria-selected") === "true" || button.getAttribute("aria-current") === "page" || button.dataset?.state === "active" || /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
        if (active) button.setAttribute(INVENTORY_FILTER_STATE_ATTR, "active");
        else button.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
      }
    }
    const iconControls = [...root.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}="icon"]`)];
    const toolRows = /* @__PURE__ */ new Set();
    for (const control of iconControls) {
      let node = control.parentElement;
      for (let depth = 0; node && node !== root && depth < 3; depth += 1, node = node.parentElement) {
        if (iconControls.filter((other) => node.contains(other)).length >= 2) {
          toolRows.add(node);
          break;
        }
      }
    }
    for (const toolRow of toolRows) {
      for (const child of toolRow.children) {
        if (child.tagName.toLowerCase() !== "svg") continue;
        child.setAttribute(INVENTORY_CONTROL_ATTR, "glyph");
      }
    }
    for (const el of root.querySelectorAll("span, div, p")) {
      if (el.closest(ROW_SELECTOR)) continue;
      const text = String(el.textContent || "").trim();
      if (/^\d+\s*\/\s*\d+$/.test(text)) el.setAttribute(INVENTORY_CONTROL_ATTR, "page-count");
    }
    classifyRowList(root);
  }
  function classifyRowList(root) {
    const rows = [...root.querySelectorAll(ROW_SELECTOR)];
    const list = rows.length ? rows[0].parentElement : null;
    const ok = list && list !== root && root.contains(list) && rows.every((r) => r.parentElement === list) && // never the wrapper that also holds the title or a pager/filter control
    !list.querySelector(`[${INVENTORY_TITLE_ATTR}], [${INVENTORY_CONTROL_ATTR}]`);
    root.querySelectorAll(`[${INVENTORY_LIST_ATTR}]`).forEach((el) => {
      if (el !== list) el.removeAttribute(INVENTORY_LIST_ATTR);
    });
    if (ok) list.setAttribute(INVENTORY_LIST_ATTR, "1");
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
      data.enhancement || "",
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
    const iconName = data.enhancement && !/\+\s*\d+\s*$/.test(fullName) ? `${fullName}+${data.enhancement}` : fullName;
    const ref = item ? { id: item.item_id, name: iconName } : { name: iconName };
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
    const cheapSig = cheapSignature(row);
    const cachedContext = contextCache.get(row);
    let inContext, root;
    if (cachedContext && sameCheapSignature(cachedContext.sig, cheapSig) && (cachedContext.root === null || cachedContext.root.isConnected && cachedContext.root.contains(row))) {
      ({ inContext, root } = cachedContext);
    } else {
      ({ inContext, root } = resolveInventoryContext(row));
      contextCache.set(row, { sig: cheapSig, inContext, root });
    }
    if (!inContext) {
      if (row.querySelector(":scope > .fs-inv-row")) clearRenderedRow(row);
      return;
    }
    const existingOverlay = row.querySelector(":scope > .fs-inv-row");
    if (existingOverlay && sameCheapSignature(cheapSignatures.get(row), cheapSig)) {
      hideOriginalChildren(row, existingOverlay);
      syncRowState(row, existingOverlay);
      return;
    }
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
    const cat = item ? categoryClass(item) : "fs-cat-unknown";
    const { base, level } = splitLevel(item ? item.name : data.name);
    const nameHTML = item ? itemRef(item, base) : `<span class="fs-inv-name-plain">${esc2(base)}</span>`;
    const levelHTML = level ? ` <span class="fs-inv-sub">Lv ${esc2(level)}</span>` : "";
    const plusHTML = data.enhancement && !/\+\s*\d+\s*$/.test(base) ? ` <span class="fs-inv-plus">+${esc2(data.enhancement)}</span>` : "";
    const chips = item ? statChips(item, { max: 8 }) : [];
    const chipsHTML = chips.map((c) => {
      const mod = c.kind === "pos" ? " fs-stat--pos" : c.kind === "tier" ? " fs-stat--tier" : "";
      return `<span class="fs-stat${mod}">${esc2(c.text)}</span>`;
    }).join("");
    const isOrb = /\bupgrade orb\b/i.test(String(item?.subcategory || ""));
    const dynamic = detailHTML(detailModel);
    const overlay = document.createElement("div");
    overlay.className = `fs-inv-row ${cat}${isOrb ? " fs-inv-orb" : ""}${dynamic.details ? " has-details" : ""}${dynamic.requirements ? " has-requirements" : ""}`;
    overlay.innerHTML = `
    <div class="fs-inv-icon"></div>
    <div class="fs-inv-body">
      <div class="fs-inv-name">${nameHTML}${plusHTML}${levelHTML}</div>
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
        contextCache.delete(row);
      }
    );
    document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach((el) => {
      el.removeAttribute(INVENTORY_ROOT_ATTR);
    });
    document.querySelectorAll(`[${INVENTORY_LIST_ATTR}]`).forEach((el) => {
      el.removeAttribute(INVENTORY_LIST_ATTR);
    });
    document.querySelectorAll(".fs-inv-rule").forEach((el) => el.remove());
    document.querySelectorAll(
      `[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}], [${INVENTORY_FILTER_STATE_ATTR}]`
    ).forEach((el) => {
      el.removeAttribute(INVENTORY_CONTROL_ATTR);
      el.removeAttribute(INVENTORY_TITLE_ATTR);
      el.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
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

  // src/modules/SkillsArtService.js
  var ICON_INDEX_URL = "assets/skills_icons_index.json";
  var UI_INDEX_URL = "assets/skills_ui_index.json";
  var TEXTURE_URL = "assets/skills_panel_texture.webp";
  var NAV_PREV_URL = "assets/skills_nav_prev.svg";
  var NAV_NEXT_URL = "assets/skills_nav_next.svg";
  var UI_TOKENS = {
    medallion_frame: "medallion-frame",
    nav_frame_idle: "nav-idle",
    nav_frame_active: "nav-active",
    action_frame_idle: "action-idle",
    action_frame_disabled: "action-disabled",
    corner_filigree: "corner",
    xp_plaque: "xp-plaque",
    horizontal_separator: "separator",
    separator_flourish: "flourish"
  };
  var ICON_ALIASES = {
    woodcutting: "gathering",
    construction: "crafting"
  };
  var loadPromise = null;
  var iconIndex = null;
  var uiIndex = null;
  var iconByKey = /* @__PURE__ */ new Map();
  var uiByKey = /* @__PURE__ */ new Map();
  function validateIndex(data, label) {
    if (!data || !Number.isFinite(data.width) || !Number.isFinite(data.height) || !Array.isArray(data.entries)) {
      throw new Error(`${label} index is malformed`);
    }
    for (const entry of data.entries) {
      if (!entry?.key || !Number.isFinite(entry.x) || !Number.isFinite(entry.y) || !Number.isFinite(entry.width) || !Number.isFinite(entry.height)) {
        throw new Error(`${label} contains a malformed entry`);
      }
    }
    return data;
  }
  async function fetchIndex(path, label) {
    const response = await fetch(assetUrl(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
    return validateIndex(await response.json(), label);
  }
  function spriteGeometry(index, entry) {
    const xRange = Math.max(1, index.width - entry.width);
    const yRange = Math.max(1, index.height - entry.height);
    return {
      image: `url("${assetUrl(`assets/${index.atlas}`)}")`,
      size: `${index.width / entry.width * 100}% ${index.height / entry.height * 100}%`,
      position: `${entry.x / xRange * 100}% ${entry.y / yRange * 100}%`
    };
  }
  function paint(host, index, entry) {
    if (!host || !index || !entry) return false;
    const sprite = spriteGeometry(index, entry);
    host.style.backgroundImage = sprite.image;
    host.style.backgroundSize = sprite.size;
    host.style.backgroundPosition = sprite.position;
    host.style.backgroundRepeat = "no-repeat";
    host.dataset.iwSkillsAtlas = index.atlas;
    host.dataset.iwSkillsAtlasIndex = String(entry.index ?? "");
    return true;
  }
  function setVar(panel, name, value) {
    panel.style.setProperty(name, value);
  }
  function applyUiVariables(panel) {
    if (!panel || !uiIndex) return false;
    setVar(panel, "--fs-skills-panel-texture", `url("${assetUrl(TEXTURE_URL)}")`);
    setVar(
      panel,
      "--fs-skills-ui-atlas",
      `var(--iw-zone-atlas, url("${assetUrl(`assets/${uiIndex.atlas}`)}"))`
    );
    setVar(panel, "--fs-skills-nav-prev", `url("${assetUrl(NAV_PREV_URL)}")`);
    setVar(panel, "--fs-skills-nav-next", `url("${assetUrl(NAV_NEXT_URL)}")`);
    for (const [key, token] of Object.entries(UI_TOKENS)) {
      const entry = uiByKey.get(key);
      if (!entry) continue;
      const sprite = spriteGeometry(uiIndex, entry);
      setVar(panel, `--fs-ui-${token}-size`, sprite.size);
      setVar(panel, `--fs-ui-${token}-position`, sprite.position);
    }
    panel.dataset.iwSkillsUiReady = "1";
    return true;
  }
  function clearUiVariables(panel) {
    if (!panel?.style) return;
    panel.style.removeProperty("--fs-skills-panel-texture");
    panel.style.removeProperty("--fs-skills-ui-atlas");
    panel.style.removeProperty("--fs-skills-nav-prev");
    panel.style.removeProperty("--fs-skills-nav-next");
    for (const token of Object.values(UI_TOKENS)) {
      panel.style.removeProperty(`--fs-ui-${token}-size`);
      panel.style.removeProperty(`--fs-ui-${token}-position`);
    }
    delete panel.dataset.iwSkillsUiReady;
  }
  async function load() {
    const [icons, ui] = await Promise.all([
      fetchIndex(ICON_INDEX_URL, "Skills icon"),
      fetchIndex(UI_INDEX_URL, "Skills UI")
    ]);
    iconIndex = icons;
    uiIndex = ui;
    iconByKey = new Map(icons.entries.map((entry) => [entry.key, entry]));
    uiByKey = new Map(ui.entries.map((entry) => [entry.key, entry]));
    return true;
  }
  var SkillsArtService = {
    ready() {
      if (!loadPromise) {
        loadPromise = load().catch((err) => {
          loadPromise = null;
          warnOnce("skills-art", err);
          throw err;
        });
      }
      return loadPromise;
    },
    isReady() {
      return !!iconIndex && !!uiIndex;
    },
    paintIcon(host, key) {
      const entry = iconByKey.get(key) || iconByKey.get(ICON_ALIASES[key]) || iconByKey.get("generic");
      return paint(host, iconIndex, entry);
    },
    decoratePanel(panel) {
      return applyUiVariables(panel);
    },
    clearPanel(panel) {
      clearUiVariables(panel);
    },
    iconEntry(key) {
      return iconByKey.get(key) || iconByKey.get(ICON_ALIASES[key]) || null;
    }
  };

  // src/styles/skillpanel.css
  var skillpanel_default = '.fs-skill--combat{--fs-skill-accent: #B84A20}.fs-skill--mining{--fs-skill-accent: #84919B}.fs-skill--smithing{--fs-skill-accent: #B28A2A}.fs-skill--gathering{--fs-skill-accent: #579A5D}.fs-skill--alchemy{--fs-skill-accent: #9271B2}.fs-skill--jewelcrafting{--fs-skill-accent: #4E9FB8}.fs-skill--spellcrafting{--fs-skill-accent: #8B6FC3}.fs-skill--tailoring{--fs-skill-accent: #A56E86}.fs-skill--woodcutting{--fs-skill-accent: #8B6A3A}.fs-skill--construction{--fs-skill-accent: #5F7F72}.fs-skill--crafting{--fs-skill-accent: #5E8FB7}.fs-skill--fishing{--fs-skill-accent: #478FA8}.fs-skill--locked{--fs-skill-accent: #6A6257}.compact-panel.fs-skill-panel{--fs-forge-bg: linear-gradient(180deg, #100E0A, #0A0907);--fs-forge-line: #2A241A;--fs-forge-shadow: inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -7px 10px -8px rgba(0, 0, 0, .95);--fs-forge-ink: var(--iw-text, #DDD6C6);--fs-forge-live-bg: linear-gradient(180deg, #1B150B, #120E07);--fs-forge-live-line: var(--iw-th-brass);--fs-forge-live-tint: var(--fs-skill-accent, #D8791F);--fs-forge-live-shadow: inset 0 0 12px -2px color-mix(in srgb, var(--fs-forge-live-tint) 55%, transparent), inset 0 1px 0 rgba(255, 216, 150, .18), 0 0 0 1px color-mix(in srgb, var(--fs-forge-live-tint) 16%, transparent);--fs-forge-live-ink: #F3E3C0;--fs-forge-live-glow: 0 0 8px color-mix(in srgb, var(--fs-forge-live-tint) 48%, transparent);--fs-forge-hot-line: var(--iw-line-hot, #806337);--fs-forge-hot-ink: var(--iw-text, #DDD6C6);--fs-chev-box: 6px;--fs-chev-stroke: 2px;--fs-chev-ink: calc((var(--fs-chev-box) - var(--fs-chev-stroke)) * 0.3535534);--fs-forge-hot-shadow: inset 0 1px 0 rgba(255, 255, 255, .05), inset 0 0 10px -3px rgba(216, 121, 31, .35)}.compact-panel.fs-skill-panel{position:relative!important;min-height:0!important;margin-bottom:6px!important;padding-top:8px!important;padding-bottom:8px!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 4%,transparent),transparent 28%),linear-gradient(180deg,rgba(255,255,255,.010),transparent 34px),#12110E!important;border:1px solid #392F21!important;border-left:2px solid var(--fs-skill-accent, var(--iw-line-hi))!important;border-radius:3px!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.012),inset 0 -1px 0 rgba(0,0,0,.44)!important}.compact-panel.fs-skill-panel::before{content:"";position:absolute;z-index:0;pointer-events:none;left:0;top:0;width:64px;height:1px;background:linear-gradient(90deg,var(--iw-gold),var(--iw-line-hot) 62%,transparent);opacity:.78}.compact-panel.fs-skill-panel::after{content:none!important}.fs-skill-wrapper{display:contents!important}.fs-skill-header{display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{display:grid!important;grid-template-columns:96px minmax(0,1fr) 126px!important;grid-template-areas:"identity content commands"!important;gap:0 14px!important;align-items:center!important;padding:8px 12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;min-width:0!important;justify-self:stretch!important}[data-iw-skill-role=identity]{position:relative!important;min-width:78px!important;color:var(--iw-text-hi)!important;font-family:var(--iw-font-ui)!important;font-size:12.5px!important;font-weight:700!important;line-height:1.18!important;letter-spacing:.015em!important;text-shadow:0 1px 0 #000!important}[data-iw-skill-role=identity]::after{content:"";position:absolute;left:0;right:28%;bottom:-5px;height:1px;background:linear-gradient(90deg,var(--fs-skill-accent),transparent);opacity:.34}[data-iw-skill-role=action-title]{color:var(--iw-text-hi)!important;font-family:var(--iw-font-ui)!important;font-size:16.5px!important;line-height:1.1!important;font-weight:700!important;letter-spacing:0!important;text-shadow:0 1px 0 #000!important}[data-iw-skill-role=level-progress]{display:block!important;width:auto!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;margin:3px 0 0!important;padding:0!important;color:#B7AF9F!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.2!important;font-weight:600!important;font-variant-numeric:tabular-nums!important;letter-spacing:.01em!important;text-transform:none!important;border:0!important;outline:0!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important}[data-iw-skill-role=xp-gain]{display:inline-block!important;margin-top:2px!important;color:var(--iw-gold-dim)!important;font-size:10.5px!important;line-height:1.15!important;font-weight:700!important;font-variant-numeric:tabular-nums!important}[data-iw-skill-role=requirement]{margin-top:2px!important;color:#AAA291!important;font-size:10.8px!important;line-height:1.15!important;font-weight:600!important}[data-iw-skill-role=requirement][data-iw-req-state=unmet],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement][data-iw-req-state=unmet]{color:#D58282!important}[data-iw-skill-role=reward]{margin-top:2px!important;color:#AAA291!important;font-size:10.8px!important;line-height:1.15!important}[data-iw-skill-role=action-detail]{margin-top:3px!important;color:#C7C0B2!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.2!important;font-weight:500!important;letter-spacing:0!important}[data-iw-skill-role=ingredient]{display:inline-flex!important;align-items:baseline!important;gap:5px!important;margin-top:3px!important;padding:0!important;color:var(--iw-dim)!important;border:0!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important}.compact-panel.fs-skill-panel .iw-item-ref{color:#C9B17A!important;font-weight:700!important;letter-spacing:.015em!important;text-transform:uppercase!important;border-bottom-color:rgba(201,177,122,.20)!important}[data-iw-skill-role=progress-track]{height:4px!important;min-height:4px!important;max-height:4px!important;margin-top:5px!important;overflow:hidden!important;border:1px solid #29241B!important;border-radius:0!important;background:#080806!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.80)!important}[data-iw-skill-role=progress-fill]{height:100%!important;border-radius:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 68%,#5F2914),var(--fs-skill-accent))!important;box-shadow:none!important}.compact-panel.fs-skill-panel [data-iw-readout]::before,.compact-panel.fs-skill-panel [data-iw-readout]::after{content:none!important;display:none!important;border:0!important;background:none!important;box-shadow:none!important}[data-iw-readout],[data-iw-ingr]{width:auto!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;max-height:none!important;margin:0!important;background:transparent!important;background-color:transparent!important;background-image:none!important;border:0!important;border-radius:0!important;outline:0!important;padding:0!important;box-shadow:none!important;cursor:default!important}.compact-panel.fs-skill-panel [data-iw-readout]{color:#B7AF9F!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.18!important;font-weight:600!important;letter-spacing:.01em!important;text-transform:none!important}.compact-panel.fs-skill-panel [data-iw-skill-role=level-progress]{margin-top:2px!important}[data-iw-skill-role=nav-group]{display:inline-flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important}.compact-panel.fs-skill-panel button:not([data-iw-skill-role=level-progress]){align-self:center!important;border-radius:2px!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button]{width:30px!important;min-width:30px!important;height:30px!important;min-height:30px!important;padding:0!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]{width:96px!important;min-width:96px!important;height:34px!important;min-height:34px!important;justify-content:center!important;letter-spacing:.07em!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel button[data-iw-btn-state=primary]{background:var(--fs-forge-live-bg)!important;border:1px solid var(--fs-forge-live-line)!important;color:var(--fs-forge-live-ink)!important;text-shadow:var(--fs-forge-live-glow)!important;font-family:var(--iw-font-ui)!important;font-size:12px!important;font-weight:700!important;letter-spacing:.09em!important;text-transform:uppercase!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button],.compact-panel.fs-skill-panel button[data-iw-btn-state=secondary],.compact-panel.fs-skill-panel button[data-iw-btn-state=icon]{background:var(--fs-forge-bg)!important;border:1px solid var(--fs-forge-line)!important;color:var(--fs-forge-ink)!important;text-shadow:none!important;font-family:var(--iw-font-ui)!important;font-weight:700!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;box-shadow:var(--fs-forge-hot-shadow)!important}.compact-panel.fs-skill-panel button[data-iw-btn-state=primary]{color:var(--fs-forge-live-ink)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel button[data-iw-btn-state=disabled]{opacity:.7!important;color:var(--iw-faint, #666052)!important;background:var(--fs-forge-bg)!important;border-color:var(--fs-forge-line)!important;box-shadow:var(--fs-forge-shadow)!important;text-shadow:none!important;filter:none!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=identity]{align-self:stretch!important;display:flex!important;flex-direction:column!important;justify-content:center!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=content]{min-width:0!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=commands]{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:5px!important}.compact-panel.fs-skill-panel [data-iw-readout]{font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.18!important;font-weight:500!important;color:#B7AF9F!important;letter-spacing:normal!important;text-transform:none!important}.compact-panel.fs-skill-panel [data-iw-ingr]{font-family:var(--iw-font-ui)!important;font-size:11px!important;line-height:1.15!important;color:var(--iw-dim)!important;letter-spacing:normal!important;text-transform:none!important}@media(max-width:768px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:82px minmax(0,1fr) 112px!important;gap:0 8px!important;padding-inline:8px!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]{width:88px!important;min-width:88px!important}[data-iw-skill-role=action-title]{font-size:15px!important}}.compact-panel.fs-skill-panel [data-iw-readout]{display:block!important;position:static!important;float:none!important;transform:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;clip-path:none!important}@media(max-width:520px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:minmax(0,1fr) 112px!important;grid-template-areas:"identity commands" "content content"!important;gap:8px 10px!important;align-items:start!important;padding:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{align-self:center!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{align-self:center!important;justify-self:end!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 188px;--fs-skill-command-w: 164px;display:grid!important;grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr) var(--fs-skill-command-w)!important;grid-template-areas:"identity content commands"!important;gap:0!important;align-items:stretch!important;min-height:154px!important;padding:0!important;overflow:hidden!important;border:1px solid var(--iw-th-edge)!important;border-left:2px solid color-mix(in srgb,var(--fs-skill-accent) 72%,var(--iw-th-edge))!important;border-radius:4px!important;background:linear-gradient(180deg,#151511 0%,#0F0F0D 100%)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.54),0 1px 0 rgba(255,255,255,.018)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]::before{left:0!important;top:0!important;width:100%!important;height:1px!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 78%,var(--iw-th-hairline-hi)),color-mix(in srgb,var(--iw-th-accent) 16%,transparent) 34%,transparent 72%)!important;opacity:.9!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;min-width:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:14px 14px 12px!important;border-right:1px solid #332B20!important;background:radial-gradient(circle at 50% 34%,color-mix(in srgb,var(--fs-skill-accent) 10%,transparent),transparent 42%),linear-gradient(90deg,rgba(255,255,255,.012),rgba(0,0,0,.12))!important;text-align:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{order:0!important;display:grid!important;place-items:center!important;width:68px!important;min-width:68px!important;height:68px!important;min-height:68px!important;margin:0 0 6px!important;padding:0!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 48%,var(--iw-th-edge))!important;border-radius:50%!important;background:radial-gradient(circle at 42% 34%,color-mix(in srgb,var(--fs-skill-accent) 24%,#242019),#0D0D0B 68%)!important;color:color-mix(in srgb,var(--fs-skill-accent) 76%,#F0D9A8)!important;box-shadow:inset 0 0 0 5px #11100D,inset 0 0 0 6px color-mix(in srgb,var(--iw-th-brass) 44%,transparent),0 2px 8px rgba(0,0,0,.48)!important;font-size:30px!important;line-height:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]{order:1!important;min-width:0!important;margin:0!important;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#F0DEC0)!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;line-height:1.12!important;letter-spacing:.055em!important;text-transform:uppercase!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::after{content:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{order:2!important;margin:0!important;color:#AFA796!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1.1!important;letter-spacing:.04em!important;text-transform:uppercase!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;min-width:0!important;display:grid!important;grid-template-columns:minmax(180px,auto) minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto!important;column-gap:18px!important;align-content:center!important;padding:16px 20px 14px!important;overflow:hidden!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{grid-column:1 / -1!important;grid-row:1!important;align-self:end!important;margin:0!important;color:#F2EBDD!important;font-family:var(--iw-font-head)!important;font-size:19px!important;line-height:1.08!important;font-weight:700!important;letter-spacing:.015em!important;text-transform:none!important;text-shadow:0 1px 0 #000!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress]{grid-column:1 / -1!important;grid-row:2!important;margin:5px 0 0!important;color:#B9B1A1!important;font-size:11.8px!important;font-weight:600!important;line-height:1.15!important;letter-spacing:.01em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track]{grid-column:1 / -1!important;grid-row:3!important;align-self:center!important;width:100%!important;height:5px!important;min-height:5px!important;max-height:5px!important;margin:8px 0 0!important;border:1px solid #2D281F!important;background:#070706!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.82)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{grid-column:1 / -1!important;grid-row:4!important;align-self:center!important;margin:10px 0 0!important;padding:0!important;color:#D8D0C0!important;font-size:12px!important;font-weight:500!important;line-height:1.2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]::before{content:"◆";margin-right:7px;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#C9A66A);font-size:8px;transform:translateY(-1px)}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{grid-column:1!important;grid-row:5!important;margin:9px 0 0!important;padding-top:8px!important;border-top:1px solid #2C271E!important;color:#AAA291!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{grid-column:2!important;grid-row:5!important;margin:9px 0 0!important;padding:8px 0 0 18px!important;border-top:1px solid #2C271E!important;border-left:1px solid #2C271E!important;color:#B7AF9F!important;font-size:10.9px!important;line-height:1.2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:2!important;grid-row:5!important;justify-self:end!important;align-self:end!important;margin:0!important;color:color-mix(in srgb,var(--fs-skill-accent) 68%,#D5B875)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1 / -1!important;grid-row:6!important;margin:6px 0 0!important;color:#D4A65C!important;font-size:10.8px!important;line-height:1.18!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;min-width:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:12px!important;padding:16px 14px!important;border-left:1px solid #332B20!important;background:linear-gradient(90deg,rgba(0,0,0,.06),rgba(255,255,255,.012))!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]{width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;border-color:var(--fs-forge-line)!important;background:var(--fs-forge-bg)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{width:132px!important;min-width:132px!important;height:48px!important;min-height:48px!important;padding:0 12px!important;border:1px solid var(--fs-forge-live-line)!important;border-radius:2px!important;background:var(--fs-forge-live-bg)!important;color:var(--fs-forge-live-ink)!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.09em!important;text-transform:uppercase!important;text-shadow:var(--fs-forge-live-glow)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]:hover:not(:disabled){border-color:var(--iw-gold, #D4AD63)!important;box-shadow:inset 0 0 14px -2px color-mix(in srgb,var(--fs-forge-live-tint) 70%,transparent),inset 0 1px 0 rgba(255,216,150,.24),0 0 0 1px color-mix(in srgb,var(--fs-forge-live-tint) 22%,transparent)!important;color:#FFF6E2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-btn-state=disabled]{filter:none!important;opacity:.7!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 154px;--fs-skill-command-w: 148px;min-height:146px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{padding-inline:14px!important;column-gap:12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important;font-size:25px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:minmax(104px,1fr) auto!important;grid-template-areas:"identity commands" "content content"!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{min-height:114px!important;padding:10px 12px!important;border-right:1px solid #332B20!important;border-bottom:1px solid #332B20!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{min-height:114px!important;padding:10px 12px!important;border-left:0!important;border-bottom:1px solid #332B20!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{padding:13px 14px 12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{width:48px!important;min-width:48px!important;height:48px!important;min-height:48px!important;margin-bottom:3px!important;font-size:21px!important}}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{font-size:16.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{grid-column:1!important;grid-row:5!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:6!important;justify-self:start!important;padding-left:0!important;border-left:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1!important;grid-row:7!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1.2fr) minmax(180px,.8fr)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress]{grid-column:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:2!important;grid-row:2!important;justify-self:end!important;align-self:end!important;margin:5px 0 0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{order:1!important}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:6!important;justify-self:start!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]::after{content:""!important;display:block!important;width:72px!important;height:2px!important;margin:7px auto 0!important;background:linear-gradient(90deg,transparent,var(--fs-skill-accent),transparent)!important;opacity:.78!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{background:var(--fs-forge-live-bg)!important;border-color:var(--fs-forge-live-line)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{border:1px solid var(--iw-th-edge)!important;border-left-width:2px!important;border-left-color:color-mix(in srgb,var(--fs-skill-accent) 70%,var(--iw-th-edge))!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 34%),linear-gradient(135deg,rgba(181,139,71,.028) 0 1px,transparent 1px 10px),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px color-mix(in srgb,var(--iw-th-brass) 24%,transparent),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]::after{content:""!important;display:block!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 62%,transparent)!important;border-radius:2px!important;background:none!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone]{position:relative!important;z-index:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--fs-skill-accent) 13%,transparent),transparent 36%),linear-gradient(90deg,rgba(255,255,255,.018),rgba(0,0,0,.20))!important;box-shadow:inset -1px 0 0 rgba(155,119,62,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{order:0!important;display:block!important;position:relative!important;width:78px!important;min-width:78px!important;height:78px!important;min-height:78px!important;margin:0 0 8px!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 45%,var(--iw-th-edge))!important;border-radius:50%!important;background-color:#0D0D0B!important;box-shadow:inset 0 0 0 5px #11100D,inset 0 0 0 6px color-mix(in srgb,var(--iw-th-brass) 50%,transparent),inset 0 0 18px rgba(0,0,0,.35),0 0 0 3px #0A0907,0 0 0 4px color-mix(in srgb,var(--iw-th-brass) 55%,transparent),0 3px 10px rgba(0,0,0,.52)!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{content:""!important;position:absolute!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before{width:9px!important;height:9px!important;left:50%!important;top:-6px!important;transform:translateX(-50%) rotate(45deg)!important;border:1px solid var(--iw-th-edge)!important;background:#15120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{width:9px!important;height:9px!important;left:50%!important;bottom:-6px!important;transform:translateX(-50%) rotate(45deg)!important;border:1px solid var(--iw-th-edge)!important;background:#15120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]:has(>.fs-skill-medallion-art[data-iw-skill-art-ready="1"]) [data-iw-skill-role=identity-icon]{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{background:linear-gradient(180deg,rgba(255,255,255,.008),transparent 36%),linear-gradient(90deg,rgba(0,0,0,.06),transparent 24%,transparent 76%,rgba(0,0,0,.08))!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{border-left:1px solid #46371F!important;background:linear-gradient(90deg,rgba(0,0,0,.22),rgba(255,255,255,.012) 55%,rgba(0,0,0,.11)),linear-gradient(180deg,#15140F,#0E0E0B)!important;box-shadow:inset 1px 0 0 rgba(175,133,70,.08),inset 0 0 16px rgba(0,0,0,.18)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{color:#F4EBDD!important;text-shadow:0 1px 0 #000,0 0 8px rgba(225,194,139,.035)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track]{border-color:#3B3020!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.92),0 1px 0 rgba(144,109,57,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]{position:relative!important;border:1px solid var(--fs-forge-line)!important;border-radius:2px!important;background:var(--fs-forge-bg)!important;color:transparent!important;box-shadow:var(--fs-forge-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;background:var(--fs-forge-bg)!important;box-shadow:var(--fs-forge-hot-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{position:relative!important;overflow:visible!important;border-width:1px!important;border-radius:2px!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{content:""!important;position:absolute!important;left:50%!important;width:8px!important;height:8px!important;transform:translateX(-50%) rotate(45deg)!important;pointer-events:none!important;border:1px solid var(--fs-forge-live-line)!important;background:#17120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before{top:-5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{bottom:-5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout]::after{border:0!important;background:none!important;box-shadow:none!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:66px!important;min-width:66px!important;height:66px!important;min-height:66px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:54px!important;min-width:54px!important;height:54px!important;min-height:54px!important;margin-bottom:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{background:radial-gradient(circle at 50% 28%,color-mix(in srgb,var(--fs-skill-accent) 11%,transparent),transparent 38%),linear-gradient(90deg,rgba(255,255,255,.015),rgba(0,0,0,.16))!important}}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto auto auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{grid-column:1!important;grid-row:6!important;padding-left:0!important;border-left:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:7!important;justify-self:start!important;align-self:start!important;margin-top:4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1!important;grid-row:8!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone][data-iw-skills-ui-ready="1"]{background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-medallion-art::before{inset:-11px -8px!important;width:auto!important;height:auto!important;left:-8px!important;top:-11px!important;transform:none!important;z-index:2!important;border:0!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-medallion-frame-size)!important;background-position:var(--fs-ui-medallion-frame-position)!important;background-repeat:no-repeat!important;box-shadow:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-medallion-art::after{display:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-zone=identity]::after{content:""!important;position:absolute!important;left:4px!important;top:4px!important;width:38px!important;height:41px!important;pointer-events:none!important;opacity:.42!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-corner-size)!important;background-position:var(--fs-ui-corner-position)!important;background-repeat:no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=identity-level]::after{width:90px!important;height:12px!important;margin-top:4px!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-separator-size)!important;background-position:var(--fs-ui-separator-position)!important;background-repeat:no-repeat!important;opacity:.72!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button],.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]{background-image:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=xp-gain]{display:grid!important;place-items:center!important;min-width:92px!important;min-height:32px!important;padding:0 12px!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-xp-plaque-size)!important;background-position:var(--fs-ui-xp-plaque-position)!important;background-repeat:no-repeat!important;color:#F0D8A6!important;text-shadow:0 1px 1px #000!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=xp-gain]{min-width:84px!important;min-height:30px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]:has(>[data-iw-skill-layout-shell="1"]){display:block!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{display:grid!important;grid-template-columns:var(--fs-skill-identity-w, 188px) minmax(0,1fr) var(--fs-skill-command-w, 164px)!important;grid-template-areas:"identity content commands"!important;align-items:stretch!important;gap:0!important;width:100%!important;min-height:154px!important;padding:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{width:100%!important;max-width:none!important;min-width:0!important;justify-self:stretch!important;box-sizing:border-box!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{display:flex!important;flex-direction:column!important;justify-content:center!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:14px 20px!important;row-gap:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{width:100%!important;min-width:0!important;flex:0 0 auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{width:auto!important;max-width:100%!important;white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{display:grid!important;place-items:center!important;justify-self:center!important;align-self:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{padding:0 14px!important;width:132px!important;min-width:132px!important;height:48px!important;min-height:48px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{flex:0 0 auto!important;width:auto!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:minmax(104px,1fr) auto!important;grid-template-areas:"identity commands" "content content"!important;min-height:0!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{position:relative!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:18px 26px!important;text-align:center!important;overflow:visible!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{width:100%!important;min-width:0!important;text-align:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{font-size:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{content:attr(data-iw-clean-text)!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:700!important;line-height:1.08!important;letter-spacing:.055em!important;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#F0DEC0)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{content:attr(data-iw-clean-text)!important;font-family:var(--iw-font-head)!important;font-size:21px!important;font-weight:700!important;line-height:1.08!important;letter-spacing:.015em!important;color:#F4EBDD!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]::after{display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{order:3!important;display:block!important;width:116px!important;height:6px!important;margin-top:5px!important;overflow:hidden!important;border:1px solid #3B3020!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.92),0 1px 0 rgba(144,109,57,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress-fill{display:block!important;height:100%!important;min-width:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 92%,#D9B164),color-mix(in srgb,var(--fs-skill-accent) 72%,#85652E))!important;box-shadow:0 0 5px color-mix(in srgb,var(--fs-skill-accent) 22%,transparent)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-fill]{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{display:grid!important;place-items:center!important;width:190px!important;min-width:190px!important;max-width:100%!important;min-height:60px!important;margin:3px auto!important;padding:0 24px 6px!important;box-sizing:border-box!important;white-space:nowrap!important;color:#F0D8A6!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.04em!important;text-shadow:0 1px 1px #000!important;border:1px solid var(--iw-th-edge)!important;background:linear-gradient(180deg,#21170E,#100D09)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-base-exp{border:0!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-xp-plaque-size)!important;background-position:var(--fs-ui-xp-plaque-position)!important;background-repeat:no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{width:100%!important;margin-left:auto!important;margin-right:auto!important;padding-left:0!important;padding-right:0!important;border-left:0!important;text-align:center!important;justify-self:center!important;align-self:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{padding-top:0!important;border-top:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]::before{content:none!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:102px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;padding:16px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:86px!important;height:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:17px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>*{order:3!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{order:2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{order:4!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{order:99!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone]{filter:saturate(.72) brightness(.88)!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{filter:grayscale(.18) brightness(.82)!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{transform:none!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{color:#BEB6A8!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{color:#8E877B!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{order:3!important;display:flex!important;flex-direction:column!important;align-items:center!important;margin-top:3px!important;color:#C8BEAB!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1!important;letter-spacing:.045em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{content:""!important;display:block!important;width:46px!important;height:1px!important;margin:0 auto 5px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 28%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 72%,transparent)!important;box-shadow:0 1px 0 rgba(0,0,0,.75)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{order:4!important;margin-top:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]{width:100%!important;margin-left:auto!important;margin-right:auto!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#C9C0AF!important;font-size:0!important;text-align:center!important;pointer-events:none!important;cursor:default!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before{content:attr(data-iw-progress-display)!important;color:#C9C0AF!important;font-family:var(--iw-font-ui)!important;font-size:12px!important;font-weight:600!important;line-height:1.2!important;letter-spacing:.015em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{width:96px!important;gap:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:transparent!important;font-size:0!important;background-color:transparent!important;background-position:center!important;background-repeat:no-repeat!important;background-size:100% 100%!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-nav-direction=prev]{background-image:var(--fs-skills-nav-prev)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-nav-direction=next]{background-image:var(--fs-skills-nav-next)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){filter:brightness(1.13) saturate(1.08)!important;transform:translateY(-1px)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=action-title],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=level-progress],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=action-detail]{text-align:center!important;justify-content:center!important;margin-left:auto!important;margin-right:auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child>:not([data-iw-skill-role=nav-group]){text-align:center!important;margin-left:auto!important;margin-right:auto!important}.fs-skills-section-frame[data-iw-skills-ui-ready="1"]{position:relative!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 5px 18px rgba(0,0,0,.24)!important}.fs-skills-section-frame[data-iw-skills-ui-ready="1"]::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:12px!important;right:12px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent)!important;opacity:.78!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{background-image:var(--fs-skills-nav-prev)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{background-image:var(--fs-skills-nav-next)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{color:transparent!important;font-size:0!important;line-height:0!important;text-indent:-9999px!important;text-shadow:none!important;overflow:hidden!important;background-position:center!important;background-repeat:no-repeat!important;background-size:68% 68%!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 142px;--fs-skill-command-w: 136px;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr) var(--fs-skill-command-w)!important;grid-template-areas:"identity content commands"!important;min-height:124px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:2px!important;padding:7px 9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:54px!important;min-width:54px!important;height:54px!important;min-height:54px!important;margin:0 0 3px!important;box-shadow:inset 0 0 0 4px #11100D,inset 0 0 0 5px color-mix(in srgb,var(--iw-th-brass) 48%,transparent),inset 0 0 12px rgba(0,0,0,.35),0 0 0 2px #0A0907,0 0 0 3px color-mix(in srgb,var(--iw-th-brass) 50%,transparent),0 2px 7px rgba(0,0,0,.48)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{width:7px!important;height:7px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:13px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:10.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:1px!important;font-size:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:34px!important;margin-bottom:3px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:84px!important;height:4px!important;margin-top:3px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:2px!important;padding:6px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:17.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before{font-size:10.8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:174px!important;min-width:174px!important;min-height:40px!important;margin:1px auto!important;padding:0 20px 4px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{margin-top:1px!important;font-size:10.2px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{padding:6px!important}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 126px;--fs-skill-command-w: 126px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:124px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 78px;--fs-skill-command-w: auto}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr)!important;grid-template-rows:minmax(0,auto) 51px!important;grid-template-areas:"identity content" "commands commands"!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{min-height:0!important;padding:6px!important;border-bottom:1px solid #332B20!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;margin-bottom:2px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:64px!important;height:4px!important;margin-top:2px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;gap:1px!important;padding:5px 8px!important;border-bottom:1px solid #332B20!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:15px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{font-size:9.5px!important;line-height:1.08!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:146px!important;min-width:146px!important;min-height:34px!important;margin:0 auto!important;padding-bottom:3px!important;font-size:10.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:start!important;align-self:center!important;width:116px!important;min-width:116px!important;height:44px!important;min-height:44px!important;margin-left:10px!important;transform:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]::after{display:none!important}}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{background:var(--fs-skills-nav-prev) center / 68% 68% no-repeat!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{background:var(--fs-skills-nav-next) center / 68% 68% no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:8px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{position:static!important;order:0!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;display:flex!important;flex:0 0 auto!important;align-items:center!important;justify-content:center!important;width:auto!important;margin:0!important;gap:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important;transform:none!important;margin:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{transform:none!important;justify-self:center!important;align-self:center!important;margin:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 176px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:155px!important;min-width:155px!important;height:44px!important;min-height:44px!important;padding:0 10px!important;font-size:12.5px!important;letter-spacing:.075em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{width:7px!important;height:7px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before{top:-4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{bottom:-4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:150px!important;min-width:150px!important;height:50px!important;min-height:50px!important;padding:0 28px 3px!important;margin:1px auto 2px!important;font-size:12px!important;letter-spacing:.03em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{display:grid!important;place-items:center!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:0!important;background-color:transparent!important;box-shadow:none!important;filter:none!important;color:transparent!important;font-size:0!important;transition:filter .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){background-color:transparent!important;transform:none!important;filter:brightness(1.18) saturate(1.06)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-fill]{min-width:0!important;min-height:0!important;max-height:1px!important;padding:0!important;margin:0!important;border:0!important;background:none!important;box-shadow:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:104px!important;align-items:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:3px!important;padding:8px 18px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:16px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{margin-top:0!important;font-size:11px!important;line-height:1.25!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:2px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:46px!important;min-width:46px!important;height:46px!important;min-height:46px!important;margin:0 0 4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:13.5px!important;letter-spacing:.07em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:11px!important;letter-spacing:.1em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:2px!important;font-size:10.5px!important;letter-spacing:.06em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:92px!important;height:5px!important;margin-top:3px!important;border-radius:1px!important}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 168px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:144px!important;min-width:144px!important;height:48px!important;min-height:48px!important;padding:0 26px 3px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:148px!important;min-width:148px!important;height:44px!important;min-height:44px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:start!important;margin-left:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{flex:1 1 auto!important;width:auto!important;min-width:108px!important;max-width:155px!important;height:44px!important;min-height:44px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{flex:0 0 auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:140px!important;min-width:140px!important;height:44px!important;min-height:44px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:2px!important;padding:9px 6px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:1px!important;padding:8px 5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:14.5px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{font-size:9.5px!important;line-height:1.14!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9px!important;margin-top:1px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:144px!important;min-width:144px!important;height:48px!important;min-height:48px!important;padding:0 26px 3px!important;font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;margin-bottom:4px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-base-exp{display:inline-grid!important;place-items:center!important;width:auto!important;min-width:0!important;max-width:100%!important;height:auto!important;min-height:0!important;margin:3px auto 4px!important;padding:3px 13px 4px!important;white-space:nowrap!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 34%,#453A28)!important;border-radius:3px!important;background-color:color-mix(in srgb,var(--fs-skill-accent) 7%,#13120E)!important;background-image:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;color:#E6D7BC!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.05em!important;text-transform:uppercase!important;text-shadow:0 1px 0 #000!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 248px}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 240px}}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] [data-iw-skill-role=nav-group]{display:contents!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}@media(min-width:641px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{position:absolute!important;z-index:4!important;right:0!important;top:50%!important;left:auto!important;transform:translateY(-50%)!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;width:var(--fs-skill-command-w, 236px)!important;padding:0 10px!important;margin:0!important;gap:0!important}}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{display:grid!important;place-items:center!important;position:relative!important;width:26px!important;min-width:26px!important;height:44px!important;min-height:44px!important;padding:0!important;border:1px solid var(--fs-forge-line)!important;border-radius:2px!important;background:var(--fs-forge-bg)!important;background-image:none!important;box-shadow:var(--fs-forge-shadow)!important;color:transparent!important;font-size:0!important;filter:none!important;transition:border-color .12s,box-shadow .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before{content:""!important;display:block!important;position:absolute!important;left:50%!important;top:50%!important;box-sizing:border-box!important;width:var(--fs-chev-box)!important;height:var(--fs-chev-box)!important;border:0 solid var(--iw-gold-dim, #9D8458)!important;border-right-width:var(--fs-chev-stroke)!important;border-bottom-width:var(--fs-chev-stroke)!important;background:none!important;box-shadow:none!important;pointer-events:none!important;transition:border-color .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]::before{transform:translate(-50%,-50%) translateX(var(--fs-chev-ink)) rotate(135deg)!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]::before{transform:translate(-50%,-50%) translateX(calc(-1 * var(--fs-chev-ink))) rotate(-45deg)!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled),.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;box-shadow:var(--fs-forge-hot-shadow)!important;filter:none!important;transform:none!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled)::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled)::before{border-color:#FFE2AE!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:disabled{opacity:.45!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;justify-content:center!important;gap:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}}.compact-panel.fs-quest-panel{--fs-quest-accent: #C9A66A;position:relative!important;margin-bottom:8px!important;padding:0!important;overflow:hidden!important;border:1px solid var(--iw-th-edge)!important;border-left:2px solid color-mix(in srgb,var(--fs-quest-accent) 70%,var(--iw-th-edge))!important;border-radius:4px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 34%),linear-gradient(135deg,rgba(181,139,71,.028) 0 1px,transparent 1px 10px),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px color-mix(in srgb,var(--iw-th-brass) 24%,transparent),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"]{background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important}.compact-panel.fs-quest-panel::before{content:""!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;height:1px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-quest-accent) 78%,var(--iw-th-hairline-hi)),color-mix(in srgb,var(--iw-th-accent) 16%,transparent) 34%,transparent 72%)!important;opacity:.9!important}.compact-panel.fs-quest-panel::after{content:""!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 62%,transparent)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{position:relative!important;z-index:1!important;display:grid!important;grid-template-columns:104px minmax(0,1fr)!important;grid-template-areas:"sigil row" "sigil track" "sigil label"!important;align-items:center!important;row-gap:9px!important;column-gap:0!important;padding:14px 16px 13px!important}.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]>*{margin:0!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]{grid-area:row!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important;min-width:0!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=content]{min-width:0!important;display:flex!important;flex-direction:column!important;gap:3px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=content]>*{margin:0!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{flex:0 0 auto!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:center!important;gap:8px!important}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 72px;--fs-quest-icon-scale: .60;grid-area:sigil!important;align-self:center!important;justify-self:center!important;position:relative!important;display:grid!important;place-items:center!important;width:var(--fs-quest-sigil-size)!important;height:var(--fs-quest-sigil-size)!important;border:1px solid color-mix(in srgb,var(--fs-quest-accent) 46%,var(--iw-th-edge))!important;border-radius:50%!important;background:radial-gradient(circle at 42% 34%,color-mix(in srgb,var(--fs-quest-accent) 22%,#242019),#0D0D0B 68%)!important;box-shadow:inset 0 0 0 5px #11100D,inset 0 0 0 6px color-mix(in srgb,var(--iw-th-brass) 48%,transparent),inset 0 0 16px rgba(0,0,0,.35),0 0 0 3px #0A0907,0 0 0 4px color-mix(in srgb,var(--iw-th-brass) 52%,transparent),0 3px 10px rgba(0,0,0,.5)!important;pointer-events:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil::before{content:attr(data-iw-quest-glyph)!important;position:relative!important;z-index:2!important;color:color-mix(in srgb,var(--fs-quest-accent) 76%,#F0D9A8)!important;font-family:var(--iw-font-head)!important;font-size:27px!important;line-height:1!important;text-shadow:0 1px 0 #000,0 0 10px color-mix(in srgb,var(--fs-quest-accent) 30%,transparent)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] .fs-quest-sigil::after{content:""!important;position:absolute!important;inset:-11px -8px!important;z-index:1!important;pointer-events:none!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-medallion-frame-size)!important;background-position:var(--fs-ui-medallion-frame-position)!important;background-repeat:no-repeat!important}.compact-panel.fs-quest-panel .fs-quest-sigil-icon{position:absolute!important;inset:calc(var(--fs-quest-sigil-size) * (1 - var(--fs-quest-icon-scale)) / 2)!important;z-index:2!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))!important;pointer-events:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil[data-iw-quest-icon="1"]::before{content:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil-pct{position:absolute!important;left:50%!important;bottom:-17px!important;transform:translateX(-50%)!important;z-index:3!important;padding:1px 7px!important;border:1px solid color-mix(in srgb,var(--fs-quest-accent) 50%,var(--iw-th-edge))!important;border-radius:2px!important;background:linear-gradient(180deg,#201A11,#100D09)!important;color:#E7D6B4!important;font-family:var(--iw-font-ui)!important;font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker]{margin-bottom:1px!important;color:color-mix(in srgb,var(--fs-quest-accent) 66%,#C7B38A)!important;font-family:var(--iw-font-ui)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.14em!important;text-transform:uppercase!important}.compact-panel.fs-quest-panel [data-iw-quest-role=title]{color:#F2EBDD!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:700!important;line-height:1.12!important;letter-spacing:.02em!important;text-shadow:0 1px 0 #000!important}.compact-panel.fs-quest-panel [data-iw-quest-role=brief]{color:#C7C0B2!important;font-family:var(--iw-font-flavour, var(--iw-font-ui))!important;font-size:11.5px!important;font-style:italic!important;line-height:1.25!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{display:inline-flex!important;align-items:baseline!important;gap:6px!important;margin-top:2px!important;color:#DAD2C1!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1.2!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]::before{content:"◆"!important;color:color-mix(in srgb,var(--fs-quest-accent) 72%,#C9A66A)!important;font-size:8px!important;transform:translateY(-1px)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]{cursor:help!important;border-radius:2px!important;transition:color .12s,background .12s!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]:hover,.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]:focus-visible{outline:none!important;color:#F1E8D4!important;background:color-mix(in srgb,var(--fs-quest-accent) 14%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--fs-quest-accent) 14%,transparent)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 42px;--fs-plaque-cap: calc(var(--fs-plaque-h) * 58 / 71);align-self:flex-start!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;min-width:0!important;height:var(--fs-plaque-h)!important;min-height:var(--fs-plaque-h)!important;margin-top:4px!important;padding:0 calc(var(--fs-plaque-cap) + 7px) calc(var(--fs-plaque-h) * .045)!important;border:0 solid transparent!important;border-radius:0!important;background:none!important;border-image-source:url(../assets/skills_xp_plaque_wide.webp)!important;border-image-slice:7 58 22 58 fill!important;border-image-width:0 var(--fs-plaque-cap) 0 var(--fs-plaque-cap)!important;border-image-outset:0!important;border-image-repeat:stretch!important;color:#F0D8A6!important;font-family:var(--iw-font-head)!important;font-size:0!important;text-shadow:0 1px 1px #000!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{content:attr(data-iw-quest-reward)!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.02em!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-track]{grid-area:track!important;width:100%!important;height:5px!important;margin:0!important;overflow:hidden!important;border:1px solid #3B3020!important;border-radius:0!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.9)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-fill]{height:100%!important;border-radius:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-quest-accent) 92%,#D9B164),color-mix(in srgb,var(--fs-quest-accent) 66%,#7C4A24))!important;box-shadow:0 0 6px color-mix(in srgb,var(--fs-quest-accent) 24%,transparent)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-label]{grid-area:label!important;margin:0!important;color:#A9A190!important;font-family:var(--iw-font-ui)!important;font-size:10px!important;font-weight:600!important;letter-spacing:.05em!important;text-transform:uppercase!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{align-self:center!important;aspect-ratio:264 / 75!important;min-width:148px!important;min-height:42px!important;padding:0 20px!important;border-radius:3px!important;font-family:var(--iw-font-head)!important;font-size:12px!important;font-weight:700!important;letter-spacing:.07em!important;text-transform:uppercase!important;text-shadow:0 1px 0 rgba(0,0,0,.8)!important;cursor:pointer!important;transition:filter .12s,border-color .12s,color .12s!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]{border:1px solid color-mix(in srgb,var(--fs-quest-accent) 80%,#B58B4B)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--fs-quest-accent) 80%,#6E4423),color-mix(in srgb,var(--fs-quest-accent) 56%,#241610))!important;color:#FFF0D8!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 -1px 0 rgba(0,0,0,.46),0 2px 6px rgba(0,0,0,.32)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{font-size:11px!important;border:1px solid #58482B!important;background:linear-gradient(180deg,#242018,#17140F)!important;color:#C9BFA6!important;letter-spacing:.06em!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{border:0!important;border-radius:0!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-repeat:no-repeat!important;box-shadow:none!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]{background-size:var(--fs-ui-action-idle-size)!important;background-position:var(--fs-ui-action-idle-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{background-size:var(--fs-ui-action-disabled-size)!important;background-position:var(--fs-ui-action-disabled-position)!important}.compact-panel.fs-quest-panel[data-iw-quest-state=ready]{--fs-quest-accent: #B84A20;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(184,74,32,.22),0 0 16px rgba(184,74,32,.16),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]:hover:not(:disabled){filter:brightness(1.08)!important;border-color:var(--iw-ember-hi, #E0894A)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:hover:not(:disabled){color:#FFF8E8!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) brightness(1.1)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=skip]:hover:not(:disabled){border-color:#7A6238!important;color:#F0E4C8!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:hover:not(:disabled){color:#F0E4C8!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) brightness(1.14)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]:disabled,.compact-panel.fs-quest-panel [data-iw-quest-role=skip]:disabled{cursor:not-allowed!important;filter:saturate(.4) brightness(.82)!important;opacity:.9!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled{color:#B9AE97!important;background-size:var(--fs-ui-action-disabled-size)!important;background-position:var(--fs-ui-action-disabled-position)!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) saturate(.4) brightness(.82)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:disabled{color:#8C8577!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) grayscale(1) brightness(.62)!important;opacity:.6!important}@media(max-width:640px){.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{grid-template-columns:56px minmax(0,1fr)!important;grid-template-areas:"sigil row" "sigil track" "sigil label"!important;align-items:center!important;row-gap:7px!important;column-gap:8px!important;padding:12px 12px 11px 8px!important}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 44px;--fs-quest-icon-scale: .62;margin-bottom:3px!important}.compact-panel.fs-quest-panel .fs-quest-sigil::before{font-size:16px!important}.compact-panel.fs-quest-panel .fs-quest-sigil-pct{bottom:-14px!important;padding:0 4px!important;font-size:8.5px!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] .fs-quest-sigil::after{inset:-8px -6px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]{position:relative!important;display:block!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{position:absolute!important;top:0!important;right:0!important;width:116px!important;justify-content:flex-start!important;gap:5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{aspect-ratio:auto!important;width:116px!important;min-width:0!important;max-width:116px!important;height:33px!important;min-height:0!important;padding:0 6px!important;font-size:9.5px!important;letter-spacing:.04em!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker],.compact-panel.fs-quest-panel [data-iw-quest-role=title],.compact-panel.fs-quest-panel [data-iw-quest-role=brief],.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{padding-right:124px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker]{font-size:8.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=title]{font-size:13px!important;line-height:1.12!important}.compact-panel.fs-quest-panel [data-iw-quest-role=brief]{font-size:10.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{font-size:10.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 29px;align-self:flex-start!important;max-width:100%!important;margin-top:4px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]:has([data-iw-quest-role=skip]) [data-iw-quest-role=reward]{margin-top:22px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{font-size:9.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-track]{height:4px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-label]{margin-top:1px!important;font-size:9px!important}}@media(max-width:400px){.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{grid-template-columns:50px minmax(0,1fr)!important;column-gap:7px!important;padding-left:7px!important;padding-right:10px!important}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 40px}.compact-panel.fs-quest-panel .fs-quest-sigil::before{font-size:15px!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] .fs-quest-sigil::after{inset:-7px -5px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{width:106px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{width:106px!important;max-width:106px!important;height:30px!important;font-size:9px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker],.compact-panel.fs-quest-panel [data-iw-quest-role=title],.compact-panel.fs-quest-panel [data-iw-quest-role=brief],.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{padding-right:114px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 27px}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{font-size:9px!important}}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 240px;--fs-skill-command-h: 64px;--fs-skill-identity-w: 150px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{display:grid!important;grid-template-columns:var(--fs-skill-identity-w, 150px) minmax(0,1fr)!important;grid-template-rows:1fr var(--fs-skill-command-h, 64px)!important;grid-template-areas:"identity content" "identity commands"!important;align-items:stretch!important;min-height:156px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;align-self:stretch!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;padding:14px 12px!important;border-right:1px solid #332B20!important;border-bottom:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:56px!important;min-width:56px!important;height:56px!important;min-height:56px!important;margin:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:14px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:11px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:0!important;font-size:11.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:62px!important;margin-bottom:5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:108px!important;max-width:100%!important;height:7px!important;margin-top:4px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;align-self:center!important;border-bottom:1px solid #332B20!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;border-left:0!important;box-shadow:none!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:12px!important;box-sizing:border-box!important;width:100%!important;height:100%!important;min-height:0!important;padding:0 12px!important;background:none!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:center!important;align-self:center!important;margin:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] [data-iw-skill-role=nav-group]{display:contents!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important;flex:0 1 auto!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{position:absolute!important;left:calc(50% + var(--fs-skill-identity-w, 150px) / 2)!important;right:auto!important;bottom:0!important;top:auto!important;transform:translateX(-50%)!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;box-sizing:border-box!important;width:var(--fs-skill-command-w, 240px)!important;max-width:calc(100% - var(--fs-skill-identity-w, 150px))!important;height:var(--fs-skill-command-h, 64px)!important;padding:0!important;margin:0!important;gap:0!important;z-index:4!important}@media(max-width:640px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 116px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:150px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{padding:12px 8px!important;gap:5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:12px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:10px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:10.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:52px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:92px!important;height:6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:8px!important;padding:0 8px!important}}@media(max-width:430px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 78px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{padding:10px 4px!important;gap:4px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:56px!important;min-width:56px!important;height:56px!important;min-height:56px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:10px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:42px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:66px!important;height:6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:4px!important;padding:0 4px!important}}@media(max-width:384px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 84px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-areas:"identity content" "commands commands"!important;min-height:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{border-bottom:1px solid #332B20!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:52px!important;min-width:52px!important;height:52px!important;min-height:52px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:70px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:6px!important;padding:0 6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{left:50%!important;max-width:100%!important}}\n';

  // src/modules/SkillPanelRenderer.js
  var RENDERED_ATTR2 = "data-fs-skill";
  var ROLE_ATTR = "data-iw-skill-role";
  var ZONE_ATTR = "data-iw-skill-zone";
  var SHELL_ATTR = "data-iw-skill-layout-shell";
  var buttonStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var readoutStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var ingredientStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var buttonStyleOwner = createInlineStyleOwner();
  var readoutStyleOwner = createInlineStyleOwner();
  var ingredientStyleOwner = createInlineStyleOwner();
  var listenerBound2 = false;
  var SKILL_META = {
    combat: { label: "Combat", labels: ["Combat"], glyph: "⚔︎", actions: ["fight"] },
    mining: { label: "Mining", labels: ["Mine", "Mining"], glyph: "⛏︎", actions: ["mine"] },
    // `titleActions` carries 'craft' because Smithing's higher-tier recipes are
    // titled "Craft <X> Plate" while the button still says FORGE — the title and
    // button verbs genuinely differ. `actions` must NOT gain 'craft': it is the
    // exact-match test for the command button, and widening it there would let a
    // Crafting/Construction control answer for Smithing.
    smithing: { label: "Smithing", labels: ["Smith", "Smithing"], glyph: "⚒︎", actions: ["smelt", "forge"], titleActions: ["smelt", "forge", "craft"] },
    gathering: { label: "Gathering", labels: ["Gathering"], glyph: "❧", actions: ["gather", "harvest"] },
    alchemy: { label: "Alchemy", labels: ["Alchemy"], glyph: "⚗︎", actions: ["brew"] },
    jewelcrafting: { label: "Jewelcrafting", labels: ["Jewel", "Jewelcrafting"], glyph: "◆", actions: ["prospect", "cut"] },
    spellcrafting: { label: "Spellcrafting", labels: ["Spellcraft", "Spellcrafting"], glyph: "✧", actions: ["enchant", "gather", "harvest", "craft"], titleActions: ["enchant", "harvest", "craft"], details: [/from the ether$/i] },
    tailoring: { label: "Tailoring", labels: ["Tailor", "Tailoring"], glyph: "⋈", actions: ["tailor", "sew", "weave", "craft"], details: [/^missing materials\b/i] },
    woodcutting: { label: "Woodcutting", labels: ["Wood", "Woodcutting"], glyph: "⋔", actions: ["chop"] },
    construction: { label: "Construction", labels: ["Build", "Construction"], glyph: "⌂", actions: ["craft parts", "build", "craft"], titleActions: ["craft", "build"] },
    crafting: { label: "Crafting", labels: ["Craft", "Crafting"], glyph: "✦", actions: ["craft"] },
    fishing: { label: "Fishing", labels: ["Fish", "Fishing"], glyph: "⌁", actions: ["fish"] },
    locked: { label: "Coming Soon", labels: ["Coming Soon"], glyph: "◇", actions: [], titleActions: ["upcoming skill"], details: [/^unlock in a future update$/i] }
  };
  function setOwnedStyle(owner, el, prop, value, priority = "important") {
    return owner.set(el, prop, value, priority);
  }
  function normText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function textWithoutLeadingGlyph(value) {
    return normText(value).replace(/^[^a-z0-9]+/i, "");
  }
  function classifyButton(btn) {
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return "disabled";
    const text = normText(btn.textContent);
    if (text.length <= 2) return "icon";
    const cls = String(btn.className || "");
    if (/bg-ember|bg-orange|bg-primary|bg-accent/i.test(cls)) return "primary";
    return "secondary";
  }
  var FORGE = {
    bg: "linear-gradient(180deg, #100E0A, #0A0907)",
    border: "1px solid #2A241A",
    shadow: "inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -7px 10px -8px rgba(0, 0, 0, .95)",
    liveBg: "linear-gradient(180deg, #1B150B, #120E07)",
    liveBorder: "1px solid #8A6B2E",
    // Per Curtis (2026-09) the live button's glow carries the discipline colour:
    // the bloom + 1px ring are mixed from the inherited `--fs-skill-accent`
    // (ember `#D8791F` is the pre-classify fallback). The plate bg/border stay
    // neutral-warm. Mirror of `--fs-forge-live-shadow` in skillpanel.css.
    liveTint: "var(--fs-skill-accent, #D8791F)",
    liveShadow: "inset 0 0 12px -2px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 55%, transparent), inset 0 1px 0 rgba(255, 216, 150, .18), 0 0 0 1px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 16%, transparent)"
  };
  var BUTTON_STYLES = {
    base: {
      "font-family": "'Barlow', system-ui, sans-serif",
      "font-size": "12px",
      "font-weight": "700",
      // .09em is the inventory filter tab's tracking.
      "letter-spacing": "0.09em",
      "text-transform": "uppercase",
      "border-radius": "2px",
      "transition": "background .13s, border-color .13s, color .13s, box-shadow .13s",
      "align-self": "center",
      "height": "32px",
      "min-height": "32px",
      "flex-shrink": "0"
    },
    primary: {
      "background": FORGE.liveBg,
      "border": FORGE.liveBorder,
      "color": "#F3E3C0",
      "text-shadow": "0 0 8px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 48%, transparent)",
      "padding": "0 17px",
      "min-width": "96px",
      "cursor": "pointer",
      "box-shadow": FORGE.liveShadow
    },
    secondary: {
      "background": FORGE.bg,
      "border": FORGE.border,
      "color": "var(--iw-text, #DDD6C6)",
      "text-shadow": "none",
      "padding": "0 13px",
      "min-width": "72px",
      "cursor": "pointer",
      "box-shadow": FORGE.shadow
    },
    // Unavailable reads as UNLIT, not as a differently-coloured plate: the ember
    // treatment is what marks the live control, so withholding it is the signal.
    // The dimming itself is left to skillpanel.css's `[data-iw-btn-state]` rule,
    // which follows the attribute and so cannot go stale on a state change.
    disabled: {
      "background": FORGE.bg,
      "border": FORGE.border,
      "color": "var(--iw-faint, #666052)",
      "text-shadow": "none",
      "padding": "0 15px",
      "min-width": "96px",
      "cursor": "not-allowed",
      "box-shadow": FORGE.shadow
    },
    icon: {
      "background": FORGE.bg,
      "border": FORGE.border,
      "color": "var(--iw-gold-dim, #9D8458)",
      "text-shadow": "none",
      "padding": "0",
      "min-width": "30px",
      "cursor": "pointer",
      "box-shadow": FORGE.shadow
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
    const classifiedState = classifyButton(btn);
    const state = role === "action-button" && classifiedState !== "disabled" ? "primary" : classifiedState;
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
      setOwnedStyle(buttonStyleOwner, btn, "width", NAV_BUTTON_W);
      setOwnedStyle(buttonStyleOwner, btn, "min-width", NAV_BUTTON_W);
      setOwnedStyle(buttonStyleOwner, btn, "height", "44px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", "44px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", "0");
      setOwnedStyle(buttonStyleOwner, btn, "background", FORGE.bg);
      setOwnedStyle(buttonStyleOwner, btn, "border", FORGE.border);
      setOwnedStyle(buttonStyleOwner, btn, "border-radius", "2px");
      setOwnedStyle(buttonStyleOwner, btn, "box-shadow", FORGE.shadow);
      setOwnedStyle(buttonStyleOwner, btn, "color", "transparent");
      setOwnedStyle(buttonStyleOwner, btn, "font-size", "0");
    } else if (role === "action-button") {
      setOwnedStyle(buttonStyleOwner, btn, "width", "155px");
      setOwnedStyle(buttonStyleOwner, btn, "min-width", "155px");
      setOwnedStyle(buttonStyleOwner, btn, "height", "44px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", "44px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", "0 12px");
    }
    if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
    buttonStyleSnapshots.set(btn, { state, role, style: btn.getAttribute("style") || "" });
  }
  var NAV_BUTTON_W = "26px";
  var LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?(?:\s*[-\u2013]\s*\d+(?:\.\d+)?%\s*[\u2022\u00b7]\s*[\d,]+\s+(?:xp\s+)?to\s+go|\s*[\u2022\u00b7]\s*[\d,]+\s*\/\s*[\d,]+\s*xp)$/i;
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
    "max-height": "none"
  };
  function readoutCursor(el) {
    return el.matches?.('button, a, [role="button"], [tabindex]:not([tabindex="-1"])') ? "pointer" : "default";
  }
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
      const ownsOtherControl = [...parent.querySelectorAll('button,a,input,select,textarea,[role="button"]')].some((control) => control !== el && !branch.includes(control));
      if (ownsOtherRole || ownsOtherControl) break;
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
    const branch = [.../* @__PURE__ */ new Set([
      ...readoutBranch(readout, panel),
      ...sameTextShellChain(readout, panel)
    ])];
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
      setOwnedStyle(readoutStyleOwner, target, "cursor", readoutCursor(target));
      setOwnedStyle(readoutStyleOwner, target, "transform", "none");
      setOwnedStyle(readoutStyleOwner, target, "filter", "none");
      setOwnedStyle(readoutStyleOwner, target, "align-self", "auto");
      readoutStyleSnapshots.set(target, target.getAttribute("style") || "");
    }
  }
  var INGR_PATTERN = /^(?!.*\bxp\b).{0,80}\b\d+\s*\/\s*\d+\b/i;
  var INGR_STYLES = {
    "background": "none",
    "background-color": "transparent",
    "border": "none",
    "border-radius": "0",
    "padding": "0",
    "box-shadow": "none"
  };
  function neutraliseIngredients(panel) {
    for (const el of panel.querySelectorAll("div, span, p")) {
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
    panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}], [${SHELL_ATTR}], [data-iw-nav-direction], [data-iw-req-state]`).forEach((el) => {
      el.removeAttribute(ROLE_ATTR);
      el.removeAttribute(ZONE_ATTR);
      el.removeAttribute(SHELL_ATTR);
      el.removeAttribute("data-iw-req-state");
      delete el.dataset.iwNavDirection;
    });
    delete panel.dataset.iwSkillLayout;
  }
  function childUnder(container, el) {
    if (!container || !el || !container.contains(el)) return null;
    let cur = el;
    while (cur && cur.parentElement !== container) cur = cur.parentElement;
    return cur?.parentElement === container ? cur : null;
  }
  function commonAncestorWithin(panel, elements) {
    const nodes = elements.filter(Boolean);
    if (!nodes.length || nodes.some((node) => !panel.contains(node))) return null;
    let cur = nodes[0];
    while (cur && cur !== panel) {
      if (nodes.every((node) => cur.contains(node))) return cur;
      cur = cur.parentElement;
    }
    return panel;
  }
  function isPresentationHidden(el) {
    if (!el || el.hidden || el.getAttribute?.("aria-hidden") === "true") return true;
    try {
      const cs = getComputedStyle(el);
      return cs.display === "none" || cs.visibility === "hidden" || cs.contentVisibility === "hidden";
    } catch {
      return false;
    }
  }
  var lastCandidatePanel = null;
  var lastCandidates = null;
  function textCandidates(panel) {
    if (lastCandidatePanel === panel) return lastCandidates;
    const candidates = [...panel.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((el) => !el.closest("button, a")).filter((el) => normText(el.textContent).length <= 130).sort((a, b) => Number(isPresentationHidden(a)) - Number(isPresentationHidden(b)));
    lastCandidatePanel = panel;
    lastCandidates = candidates;
    return candidates;
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
  var structureSignatures = /* @__PURE__ */ new WeakMap();
  function structureSignature(panel, type) {
    const buttonState = [...panel.querySelectorAll("button")].map((btn) => {
      const disabled = btn.disabled || btn.getAttribute("aria-disabled") === "true" ? "1" : "0";
      return `${disabled}:${normText(btn.textContent)}:${normText(btn.getAttribute("aria-label"))}`;
    }).join("|");
    return `${type}\0${panel.childElementCount}\0${buttonState}`;
  }
  function annotateStructure(panel, type, meta) {
    const sig = structureSignature(panel, type);
    if (structureSignatures.get(panel) === sig) return;
    clearStructureRoles(panel);
    const identityLabels = (meta.labels || [meta.label]).map((label) => label.toLowerCase());
    let identity = findBestText(panel, (text) => identityLabels.includes(textWithoutLeadingGlyph(text).toLowerCase()));
    if (!identity) {
      identity = findBestText(panel, (text) => {
        const clean = textWithoutLeadingGlyph(text).toLowerCase();
        return identityLabels.some((label) => clean === label || clean.startsWith(`${label} `));
      });
    }
    if (!identity) {
      identity = textCandidates(panel).find((el) => {
        const directText = [...el.childNodes].map((node) => normText(node.textContent)).filter(Boolean).join(" ");
        const clean = textWithoutLeadingGlyph(directText).toLowerCase();
        return identityLabels.some((label) => clean === label || clean.startsWith(`${label} `));
      }) || null;
    }
    if (identity) {
      const shell = outerSameTextShell(identity, panel);
      setRole(shell, "identity");
    }
    const actionWord = (meta.titleActions || meta.actions).join("|");
    const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, "i");
    let actionTitle = findBestText(panel, (text, el) => {
      if (!text || text.length > 90 || !actionTitleRe.test(textWithoutLeadingGlyph(text))) return false;
      if (el.closest(".iw-item-ref")) return false;
      if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
      return true;
    });
    if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), "action-title");
    const buttons = [...panel.querySelectorAll("button")].sort((a, b) => Number(isPresentationHidden(a)) - Number(isPresentationHidden(b)));
    const levelProgressButton = buttons.find((btn) => LEVEL_PROGRESS_PATTERN.test(normText(btn.textContent))) || null;
    if (levelProgressButton) setRole(levelProgressButton, "level-progress");
    let actionButton = null;
    const commandWord = meta.actions.join("|");
    const actionExact = commandWord ? new RegExp(`^(?:${commandWord})$`, "i") : null;
    for (const btn of buttons) {
      const text = normText(btn.textContent);
      const aria = normText(btn.getAttribute("aria-label"));
      const disabled = btn.disabled || btn.getAttribute("aria-disabled") === "true";
      if (!actionButton && type === "locked" && btn !== levelProgressButton && disabled && !/^(?:prev|previous|next)$/i.test(aria)) {
        actionButton = btn;
        setRole(btn, "action-button");
        continue;
      }
      if (!actionButton && actionExact && (actionExact.test(text) || actionExact.test(aria))) {
        actionButton = btn;
        setRole(btn, "action-button");
        continue;
      }
      if (text.length <= 2 || /^(?:prev|previous|next)$/i.test(aria)) setRole(btn, "nav-button");
    }
    if (type === "locked" && !actionButton) {
      const lockedControl = buttons.find((btn) => {
        if (btn === levelProgressButton) return false;
        const aria = normText(btn.getAttribute("aria-label"));
        const text = normText(btn.textContent);
        return !/^(?:prev|previous|next)$/i.test(aria) && !/^[‹›<>]$/.test(text);
      }) || null;
      if (lockedControl) {
        actionButton = lockedControl;
        setRole(lockedControl, "action-button");
      }
    }
    if (!actionButton && type !== "locked") {
      const fallbackActions = buttons.filter((btn) => {
        if (btn === levelProgressButton || btn.getAttribute(ROLE_ATTR) === "nav-button") return false;
        const text = normText(btn.textContent);
        const aria = normText(btn.getAttribute("aria-label"));
        const signal = text || aria;
        if (!signal || signal.length > 32) return false;
        if (/^lv\b.*(?:%|\bxp\b|to go)/i.test(signal)) return false;
        return true;
      });
      const visibleActions = fallbackActions.filter((btn) => !isPresentationHidden(btn));
      actionButton = visibleActions[visibleActions.length - 1] || fallbackActions[0] || null;
      if (actionButton) setRole(actionButton, "action-button");
    }
    if (!actionTitle && actionButton) {
      const actionSignal = textWithoutLeadingGlyph(
        normText(actionButton.textContent) || normText(actionButton.getAttribute("aria-label"))
      );
      if (actionSignal && actionSignal.length <= 32) {
        const needle = actionSignal.toLowerCase();
        actionTitle = findBestText(panel, (text, el) => {
          const clean = textWithoutLeadingGlyph(text).toLowerCase();
          if (!(clean === needle || clean.startsWith(`${needle} `))) return false;
          if (el.closest(".iw-item-ref")) return false;
          if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
          return true;
        });
        if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), "action-title");
      }
    }
    if (!actionTitle && levelProgressButton) {
      const readoutShell = outerSameTextShell(levelProgressButton, panel);
      const candidate = readoutShell?.previousElementSibling || null;
      const candidateText = candidate ? normText(candidate.textContent) : "";
      const usable = candidate && candidateText && candidateText.length <= 90 && !candidate.getAttribute(ROLE_ATTR) && !candidate.querySelector?.(`[${ROLE_ATTR}], button, a, input, select, textarea`) && !candidate.closest?.(`[${ROLE_ATTR}="identity"]`) && !candidate.closest?.(".iw-item-ref") && !LEVEL_PROGRESS_PATTERN.test(candidateText);
      if (usable) {
        actionTitle = candidate;
        setRole(outerSameTextShell(candidate, panel), "action-title");
      }
    }
    const navButtons = buttons.filter((btn) => btn.getAttribute(ROLE_ATTR) === "nav-button");
    navButtons.forEach((btn, index) => {
      const aria = normText(btn.getAttribute("aria-label")).toLowerCase();
      const text = normText(btn.textContent);
      const isPrev = /prev|previous/.test(aria) || /^[‹<←]$/.test(text) || navButtons.length >= 2 && index === 0;
      btn.dataset.iwNavDirection = isPrev ? "prev" : "next";
    });
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
    if (requirement) {
      const reqShell = outerSameTextShell(requirement, panel);
      setRole(reqShell, "requirement");
      const reqClasses = `${requirement.className || ""} ${reqShell.className || ""}`;
      const unmet = /\btext-(?:red|rose|orange|amber|yellow)-\d/.test(reqClasses) || /\b(?:text-danger|text-warning)\b/.test(reqClasses);
      reqShell.setAttribute("data-iw-req-state", unmet ? "unmet" : "met");
    }
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
    const layoutShell = commonAncestorWithin(panel, [identityRole, titleRole, actionRole]);
    const supportedShell = layoutShell && (layoutShell === panel || layoutShell.parentElement === panel);
    const identityZone = supportedShell ? childUnder(layoutShell, identityRole) : null;
    const contentZone = supportedShell ? childUnder(layoutShell, titleRole) : null;
    const commandZone = supportedShell ? childUnder(layoutShell, actionRole) : null;
    const shellChildren = supportedShell ? [...layoutShell.children].filter((el) => !el.classList.contains("fs-skill-header")) : [];
    const distinctZones = identityZone && contentZone && commandZone && (/* @__PURE__ */ new Set([identityZone, contentZone, commandZone])).size === 3;
    if (distinctZones) {
      if (layoutShell !== panel) layoutShell.setAttribute(SHELL_ATTR, "1");
      identityZone.setAttribute(ZONE_ATTR, "identity");
      contentZone.setAttribute(ZONE_ATTR, "content");
      commandZone.setAttribute(ZONE_ATTR, "commands");
      const identityLeaves = [...identityZone.querySelectorAll("span,div,p,strong")].filter((el) => el.childElementCount === 0);
      const identityLevel = identityLeaves.find((el) => /^(?:lv|level)\s*(?:\d+|[—–-])/i.test(normText(el.textContent))) || null;
      if (identityLevel) setRole(identityLevel, "identity-level");
      const identityIcon = identityLeaves.find((el) => {
        if (el === identity || el === identityLevel || el.closest(`[${ROLE_ATTR}="identity"]`)) return false;
        const text = normText(el.textContent);
        return text && text.length <= 4 && /[^a-z0-9]/i.test(text);
      }) || null;
      if (identityIcon) setRole(identityIcon, "identity-icon");
      const functionalZones = /* @__PURE__ */ new Set([identityZone, contentZone, commandZone]);
      const unexpectedFlowChild = shellChildren.some((el) => {
        if (functionalZones.has(el)) return false;
        if (el.matches?.(`[${ROLE_ATTR}="progress-track"]`) || el.querySelector?.(`[${ROLE_ATTR}="progress-track"]`)) return false;
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
    structureSignatures.set(panel, sig);
  }
  function ensureSkillArtwork(panel, type) {
    const identityZone = panel.querySelector(`[${ZONE_ATTR}="identity"]`);
    if (!identityZone) return;
    let artHost = identityZone.querySelector(":scope > .fs-skill-medallion-art");
    if (!artHost || artHost.dataset.iwSkillArt !== type) {
      artHost?.remove();
      artHost = document.createElement("span");
      artHost.className = "fs-skill-medallion-art";
      artHost.setAttribute("aria-hidden", "true");
      artHost.dataset.iwSkillArt = type;
      identityZone.appendChild(artHost);
    }
    const paint2 = () => {
      if (!artHost.isConnected || !panel.isConnected) return;
      SkillsArtService.decoratePanel(panel);
      if (SkillsArtService.paintIcon(artHost, type)) artHost.dataset.iwSkillArtReady = "1";
    };
    if (SkillsArtService.isReady()) {
      paint2();
    } else if (!artHost.dataset.iwSkillArtPending) {
      artHost.dataset.iwSkillArtPending = "1";
      SkillsArtService.ready().then(paint2).catch(() => {
      }).finally(() => {
        if (artHost.isConnected) delete artHost.dataset.iwSkillArtPending;
      });
    }
  }
  function baseExpValue(panel) {
    const reward = panel.querySelector(`[${ROLE_ATTR}="reward"]`);
    const rewardText = normText(reward?.textContent);
    const rewardMatch = /\bxp\b/i.test(rewardText) ? rewardText.match(/base reward\s*:\s*\+?\s*([\d,]+)/i) : null;
    if (rewardMatch) return rewardMatch[1].replace(/,/g, "");
    const xpGain = panel.querySelector(`[${ROLE_ATTR}="xp-gain"]`);
    const xpMatch = normText(xpGain?.textContent).match(/^\+?\s*([\d,]+)\s*xp$/i);
    return xpMatch ? xpMatch[1].replace(/,/g, "") : "";
  }
  function progressPercent(panel) {
    const fill = panel.querySelector(`[${ROLE_ATTR}="progress-fill"]`);
    const width = String(fill?.style?.width || "").trim();
    if (/^\d+(?:\.\d+)?%$/.test(width)) return width;
    const track = panel.querySelector(`[${ROLE_ATTR}="progress-track"]`);
    const now = Number(track?.getAttribute("aria-valuenow"));
    const max = Number(track?.getAttribute("aria-valuemax"));
    if (Number.isFinite(now) && Number.isFinite(max) && max > 0) {
      return `${Math.max(0, Math.min(100, now / max * 100))}%`;
    }
    const readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
    const match = normText(readout?.textContent).match(/(\d+(?:\.\d+)?)%/);
    return match ? `${match[1]}%` : "";
  }
  function displayPercent(value) {
    const match = String(value || "").match(/^(\d+(?:\.\d+)?)%$/);
    if (!match) return value || "";
    return `${Number(Number(match[1]).toFixed(1))}%`;
  }
  function centralProgressText(text) {
    const value = normText(text);
    if (!value) return "";
    return value.replace(/\s*[-–]\s*\d+(?:\.\d+)?%\s*[•·]\s*/i, " • ").replace(/\s*[•·]\s*\d+(?:\.\d+)?%\s*[•·]\s*/i, " • ").replace(/\s{2,}/g, " ").trim();
  }
  function skillActionsFrame(panel) {
    let cur = panel?.parentElement || null;
    for (let depth = 0; cur && depth < 8; depth += 1, cur = cur.parentElement) {
      const heading = cur.querySelector?.("h1,h2,h3,h4");
      if (heading && /^skill actions$/i.test(normText(heading.textContent))) return cur;
    }
    return null;
  }
  function ensureSkillActionsFrame(panel) {
    const frame = skillActionsFrame(panel);
    if (!frame) return;
    frame.classList.add("fs-skills-section-frame");
    const paint2 = () => SkillsArtService.decoratePanel(frame);
    if (SkillsArtService.isReady()) paint2();
    else SkillsArtService.ready().then(paint2).catch(() => {
    });
  }
  function ensureSkillPresentation(panel, meta) {
    ensureSkillActionsFrame(panel);
    const identity = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
    const title = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
    const levelProgress = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
    if (identity) {
      const nativeIdentity = textWithoutLeadingGlyph(identity.textContent);
      const aliases = meta.labels || [meta.label];
      const alias = aliases.find((label) => nativeIdentity.toLowerCase() === label.toLowerCase() || nativeIdentity.toLowerCase().startsWith(`${label.toLowerCase()} `));
      identity.dataset.iwCleanText = alias || (identity.childElementCount ? meta.label : nativeIdentity) || meta.label;
    }
    if (title) title.dataset.iwCleanText = textWithoutLeadingGlyph(title.textContent);
    if (levelProgress) levelProgress.dataset.iwProgressDisplay = centralProgressText(levelProgress.textContent);
    const identityZone = panel.querySelector(`[${ZONE_ATTR}="identity"]`);
    if (identityZone) {
      const percentValue = progressPercent(panel);
      let percent = identityZone.querySelector(":scope > .fs-skill-identity-percent");
      if (percentValue) {
        if (!percent) {
          percent = document.createElement("span");
          percent.className = "fs-skill-identity-percent";
          percent.setAttribute("aria-hidden", "true");
          identityZone.appendChild(percent);
        }
        percent.textContent = displayPercent(percentValue);
      } else {
        percent?.remove();
      }
      let progress = identityZone.querySelector(":scope > .fs-skill-identity-progress");
      if (!progress) {
        progress = document.createElement("span");
        progress.className = "fs-skill-identity-progress";
        progress.setAttribute("aria-hidden", "true");
        progress.innerHTML = '<span class="fs-skill-identity-progress-fill"></span>';
        identityZone.appendChild(progress);
      }
      const fill = progress.querySelector(".fs-skill-identity-progress-fill");
      if (fill) fill.style.width = percentValue || "0%";
    }
    const contentZone = panel.querySelector(`[${ZONE_ATTR}="content"]`);
    if (contentZone) {
      const amount = baseExpValue(panel);
      let plaque = contentZone.querySelector(":scope > .fs-skill-base-exp");
      if (amount) {
        if (!plaque) {
          plaque = document.createElement("span");
          plaque.className = "fs-skill-base-exp";
          plaque.setAttribute("aria-hidden", "true");
          contentZone.appendChild(plaque);
        }
        plaque.textContent = `Base: ${amount}`;
        plaque.dataset.iwBaseExp = amount;
      } else {
        plaque?.remove();
      }
    }
  }
  function applyPanelTreatment(panel, type, meta) {
    annotateStructure(panel, type, meta);
    ensureSkillArtwork(panel, type, meta);
    ensureSkillPresentation(panel, meta);
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
    structureSignatures.delete(panel);
    clearPanelInlineTreatment(panel);
    SkillsArtService.clearPanel(panel);
    panel.querySelectorAll(".fs-skill-medallion-art, .fs-skill-identity-percent, .fs-skill-identity-progress, .fs-skill-base-exp").forEach((el) => el.remove());
    panel.querySelectorAll("[data-iw-clean-text], [data-iw-base-exp], [data-iw-progress-display]").forEach((el) => {
      delete el.dataset.iwCleanText;
      delete el.dataset.iwBaseExp;
      delete el.dataset.iwProgressDisplay;
    });
    clearStructureRoles(panel);
    panel.classList.remove("fs-skill-panel", ...SKILL_CLASSES);
    delete panel.dataset.fsSkillLabel;
    delete panel.dataset.fsSkillRune;
    delete panel.dataset.fsSkillFlavour;
    delete panel.dataset.iwSkillGlyph;
    delete panel.dataset.iwSkill;
    if (panel.dataset.iwUi === "skill-panel") delete panel.dataset.iwUi;
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
    document.querySelectorAll(".fs-skills-section-frame").forEach((frame) => {
      SkillsArtService.clearPanel(frame);
      frame.classList.remove("fs-skills-section-frame");
    });
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

  // src/modules/QuestPanelRenderer.js
  var RENDERED_ATTR3 = "data-fs-quest";
  var ROLE_ATTR2 = "data-iw-quest-role";
  var ZONE_ATTR2 = "data-iw-quest-zone";
  var STATE_ATTR = "data-iw-quest-state";
  var PANEL_CLASS = "fs-quest-panel";
  var listenerBound3 = false;
  var structureSignatures2 = /* @__PURE__ */ new WeakMap();
  var DISCIPLINE_STYLE = [
    [/\bcombat\b/i, { accent: "#B84A20", glyph: "⚔" }],
    [/\bmining\b/i, { accent: "#84919B", glyph: "⛏" }],
    [/\bsmithing\b/i, { accent: "#B28A2A", glyph: "⚒" }],
    [/\bgathering\b/i, { accent: "#579A5D", glyph: "❧" }],
    [/\balchemy\b/i, { accent: "#9271B2", glyph: "⚗" }],
    [/\bjewel(?:crafting)?\b/i, { accent: "#4E9FB8", glyph: "◆" }],
    [/\bspell(?:crafting)?\b/i, { accent: "#8B6FC3", glyph: "✧" }],
    [/\btailoring\b/i, { accent: "#A56E86", glyph: "⋈" }],
    [/\bwood(?:cutting)?\b/i, { accent: "#8B6A3A", glyph: "⋔" }],
    [/\bconstruction\b/i, { accent: "#5F7F72", glyph: "⌂" }],
    [/\bcrafting\b/i, { accent: "#5E8FB7", glyph: "✦" }],
    [/\bfishing\b/i, { accent: "#478FA8", glyph: "⌁" }]
  ];
  var GENERIC_STYLE = { accent: "#C9A66A", glyph: "❖" };
  function normText2(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function textLeaves(root) {
    return [...root.querySelectorAll("p,span,div,strong,em,h1,h2,h3,h4")].filter((el) => !el.closest('button,a,[role="button"],.fs-quest-sigil')).filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && normText2(n.textContent));
      return own && normText2(el.textContent).length <= 220;
    });
  }
  function questButtons(card) {
    const all = [...card.querySelectorAll('button,[role="button"]')];
    let turnIn = null;
    let skip = null;
    for (const btn of all) {
      const label = normText2(btn.textContent) || normText2(btn.getAttribute("aria-label"));
      if (!turnIn && /turn\s*in/i.test(label)) turnIn = btn;
      else if (!skip && /^skip\b/i.test(label)) skip = btn;
    }
    return { turnIn, skip, all };
  }
  function isQuestCard(card) {
    if (!card || !card.classList?.contains("compact-panel")) return false;
    if (card.classList.contains("fs-skill-panel")) return false;
    const bulk = card.textContent || "";
    if (!/\bturn\s*in\b/i.test(bulk) && !/\d+%\s*complete\b/i.test(bulk)) return false;
    const leaves = textLeaves(card);
    const hasReward = leaves.some((el) => /^reward\s*:/i.test(normText2(el.textContent)));
    if (!hasReward) return false;
    const { turnIn, skip } = questButtons(card);
    const hasPercent = leaves.some((el) => /\d+%\s*complete\b/i.test(normText2(el.textContent)));
    return !!(turnIn || skip || hasPercent);
  }
  function findProgress2(card) {
    for (const el of card.querySelectorAll("div")) {
      if (el.children.length !== 1) continue;
      const fill = el.firstElementChild;
      const width = String(fill?.style?.width || "").trim();
      if (!/%$/.test(width)) continue;
      const cls = `${el.className || ""} ${fill.className || ""}`;
      if (!/rounded-full|progress|bg-white\/10|bg-white\/5|\bh-1(?:\.5)?\b|\bh-2\b/i.test(cls)) continue;
      if (el.closest('button,a,[role="button"]')) continue;
      return { track: el, fill };
    }
    return { track: null, fill: null };
  }
  function setRole2(el, role) {
    if (el && el.getAttribute(ROLE_ATTR2) !== role) el.setAttribute(ROLE_ATTR2, role);
    return el;
  }
  function setZone(el, zone) {
    if (el && el.getAttribute(ZONE_ATTR2) !== zone) el.setAttribute(ZONE_ATTR2, zone);
    return el;
  }
  function clearRoles(card) {
    card.querySelectorAll(`[${ROLE_ATTR2}],[${ZONE_ATTR2}]`).forEach((el) => {
      el.removeAttribute(ROLE_ATTR2);
      el.removeAttribute(ZONE_ATTR2);
    });
  }
  function structureSignature2(card) {
    const { turnIn, skip } = questButtons(card);
    const btn = [turnIn, skip].filter(Boolean).map((b) => {
      const disabled = b.disabled || b.getAttribute("aria-disabled") === "true" ? "1" : "0";
      const label = normText2(b.textContent).replace(/\s*\(\d+\)\s*$/, "");
      return `${disabled}:${label}`;
    }).join("|");
    return `${textLeaves(card).length}|${btn}|${findProgress2(card).track ? "t" : "-"}`;
  }
  function disciplineStyle(rewardText) {
    for (const [re, style] of DISCIPLINE_STYLE) if (re.test(rewardText)) return style;
    return GENERIC_STYLE;
  }
  function objectiveItemRef(card) {
    const el = card.querySelector(`[${ROLE_ATTR2}="objective"]`);
    if (!el) return null;
    const name = normText2(el.textContent).replace(/^[^A-Za-z]+/, "").replace(/\s+[\d,]+\s*\/\s*[\d,]+.*$/, "").trim();
    if (name.length < 2) return { el, name: "", item: null, id: null };
    const item = ItemDatabase.getByName(name);
    return { el, name, item, id: item && item.item_id != null ? String(item.item_id) : null };
  }
  var TRIGGER_ATTRS = [
    "data-iw-item",
    "data-iw-item-name",
    "data-iw-tooltip-trigger",
    "tabindex",
    "aria-haspopup",
    "aria-controls",
    "aria-expanded"
  ];
  function clearObjectiveTrigger(el) {
    if (!el) return;
    for (const attr of TRIGGER_ATTRS) el.removeAttribute(attr);
  }
  function ensureObjectiveTrigger(ref) {
    if (!ref || !ref.el) return;
    const el = ref.el;
    if (!ref.item) {
      clearObjectiveTrigger(el);
      return;
    }
    if (ref.id) {
      if (el.getAttribute("data-iw-item") !== ref.id) el.setAttribute("data-iw-item", ref.id);
      el.removeAttribute("data-iw-item-name");
    } else {
      if (el.getAttribute("data-iw-item-name") !== ref.name) el.setAttribute("data-iw-item-name", ref.name);
      el.removeAttribute("data-iw-item");
    }
    if (el.dataset.iwTooltipTrigger !== "1") el.dataset.iwTooltipTrigger = "1";
    if (el.getAttribute("tabindex") !== "0") el.setAttribute("tabindex", "0");
    if (el.getAttribute("aria-haspopup") !== "dialog") el.setAttribute("aria-haspopup", "dialog");
    if (el.getAttribute("aria-controls") !== "iw-tip") el.setAttribute("aria-controls", "iw-tip");
    if (!el.hasAttribute("aria-expanded")) el.setAttribute("aria-expanded", "false");
  }
  function annotateStructure2(card) {
    const sig = structureSignature2(card);
    if (structureSignatures2.get(card) === sig) return;
    clearRoles(card);
    const leaves = textLeaves(card);
    const reward = leaves.find((el) => /^reward\s*:/i.test(normText2(el.textContent))) || null;
    const objective = leaves.find((el) => /\d+\s*\/\s*\d+/.test(normText2(el.textContent)) && !/^reward\s*:/i.test(normText2(el.textContent)) && !/%\s*complete\b/i.test(normText2(el.textContent))) || null;
    const progressLabel = leaves.find((el) => /\d+%\s*complete\b/i.test(normText2(el.textContent))) || null;
    const column = reward?.parentElement || objective?.parentElement || card;
    const columnLeaves = leaves.filter((el) => column.contains(el) && el !== reward && el !== objective && el !== progressLabel);
    columnLeaves.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    let cursor = 0;
    if (columnLeaves.length >= 2 && /\bwork order\b/i.test(normText2(columnLeaves[0].textContent))) {
      setRole2(columnLeaves[0], "kicker");
      cursor = 1;
    }
    const title = columnLeaves[cursor] || null;
    const briefs = columnLeaves.slice(cursor + 1);
    if (title) setRole2(title, "title");
    briefs.forEach((el) => setRole2(el, "brief"));
    if (objective) setRole2(objective, "objective");
    if (reward) {
      setRole2(reward, "reward");
      reward.dataset.iwQuestReward = normText2(reward.textContent).replace(/^reward\s*:\s*/i, "");
    }
    if (progressLabel) {
      setRole2(progressLabel, "progress-label");
      progressLabel.dataset.iwQuestPercent = (normText2(progressLabel.textContent).match(/(\d+)%/) || [, ""])[1];
    }
    const { track, fill } = findProgress2(card);
    if (track) setRole2(track, "progress-track");
    if (fill) setRole2(fill, "progress-fill");
    const { turnIn, skip } = questButtons(card);
    if (turnIn) setRole2(turnIn, "turn-in");
    if (skip) setRole2(skip, "skip");
    const commandHost = (turnIn || skip)?.parentElement || null;
    if (commandHost && commandHost !== card) setZone(commandHost, "commands");
    if (column && column !== card) setZone(column, "content");
    const row = column && commandHost && column !== commandHost ? commonAncestor(card, column, commandHost) : null;
    if (row && row !== card) setZone(row, "row");
    const body = row?.parentElement && card.contains(row.parentElement) && row.parentElement !== card ? row.parentElement : card.firstElementChild && card.firstElementChild.contains(row || column) ? card.firstElementChild : null;
    if (body && body !== card) setZone(body, "body");
    structureSignatures2.set(card, sig);
  }
  function commonAncestor(scope, a, b) {
    let cur = a;
    while (cur && cur !== scope) {
      if (cur.contains(b)) return cur;
      cur = cur.parentElement;
    }
    return scope;
  }
  function ensureDecoration(card, style, ref) {
    const body = card.querySelector(`[${ZONE_ATTR2}="body"]`) || card.firstElementChild || card;
    let sigil = body.querySelector(":scope > .fs-quest-sigil");
    if (!sigil) {
      sigil = document.createElement("span");
      sigil.className = "fs-quest-sigil";
      sigil.setAttribute("aria-hidden", "true");
      body.insertBefore(sigil, body.firstChild);
    }
    if (sigil.dataset.iwQuestGlyph !== style.glyph) sigil.dataset.iwQuestGlyph = style.glyph;
    let icon = sigil.querySelector(":scope > .fs-quest-sigil-icon");
    if (ref && ref.name && AtlasService.isReady()) {
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "fs-quest-sigil-icon";
        icon.setAttribute("aria-hidden", "true");
        sigil.appendChild(icon);
      }
      if (AtlasService.paint(icon, { id: ref.id, name: ref.name })) {
        if (sigil.dataset.iwQuestIcon !== "1") sigil.dataset.iwQuestIcon = "1";
      } else {
        icon.remove();
        delete sigil.dataset.iwQuestIcon;
      }
    } else {
      icon?.remove();
      delete sigil.dataset.iwQuestIcon;
      if (ref && ref.name && !AtlasService.isReady() && !card.dataset.iwQuestIconPending) {
        card.dataset.iwQuestIconPending = "1";
        AtlasService.ready().then(() => {
          if (card.isConnected) renderCard2(card);
        }).catch(() => {
        }).finally(() => {
          if (card.isConnected) delete card.dataset.iwQuestIconPending;
        });
      }
    }
    const pct = card.querySelector(`[${ROLE_ATTR2}="progress-label"]`)?.dataset.iwQuestPercent || (card.querySelector(`[${ROLE_ATTR2}="progress-fill"]`)?.style?.width || "").replace("%", "") || "";
    let ring = sigil.querySelector(":scope > .fs-quest-sigil-pct");
    if (pct) {
      if (!ring) {
        ring = document.createElement("span");
        ring.className = "fs-quest-sigil-pct";
        sigil.appendChild(ring);
      }
      const label = `${pct}%`;
      if (ring.textContent !== label) ring.textContent = label;
    } else {
      ring?.remove();
    }
  }
  function ensureAtlas(card) {
    const paint2 = () => {
      if (!card.isConnected) return;
      SkillsArtService.decoratePanel(card);
    };
    if (SkillsArtService.isReady()) paint2();
    else if (!card.dataset.iwQuestArtPending) {
      card.dataset.iwQuestArtPending = "1";
      SkillsArtService.ready().then(paint2).catch(() => {
      }).finally(() => {
        if (card.isConnected) delete card.dataset.iwQuestArtPending;
      });
    }
  }
  function questState(card) {
    const { turnIn, skip } = questButtons(card);
    const ready = turnIn && !(turnIn.disabled || turnIn.getAttribute("aria-disabled") === "true");
    if (ready) return "ready";
    if (skip) return "work-order";
    return "active";
  }
  function renderCard2(card) {
    if (!card || !card.isConnected) return;
    if (!isQuestCard(card)) {
      if (card.classList.contains(PANEL_CLASS)) clearCard(card);
      return;
    }
    annotateStructure2(card);
    const rewardText = normText2(card.querySelector(`[${ROLE_ATTR2}="reward"]`)?.textContent);
    const style = disciplineStyle(rewardText);
    const ref = objectiveItemRef(card);
    if (!card.classList.contains(PANEL_CLASS)) card.classList.add(PANEL_CLASS);
    if (card.style.getPropertyValue("--fs-quest-accent") !== style.accent) {
      card.style.setProperty("--fs-quest-accent", style.accent);
    }
    const state = questState(card);
    if (card.getAttribute(STATE_ATTR) !== state) card.setAttribute(STATE_ATTR, state);
    if (card.getAttribute(RENDERED_ATTR3) !== "1") card.setAttribute(RENDERED_ATTR3, "1");
    ensureObjectiveTrigger(ref);
    ensureDecoration(card, style, ref);
    ensureAtlas(card);
  }
  function clearCard(card) {
    structureSignatures2.delete(card);
    clearObjectiveTrigger(card.querySelector(`[${ROLE_ATTR2}="objective"]`));
    clearRoles(card);
    card.querySelectorAll(".fs-quest-sigil, .fs-quest-sigil-pct, .fs-quest-sigil-icon").forEach((el) => el.remove());
    card.querySelectorAll("[data-iw-quest-reward], [data-iw-quest-percent]").forEach((el) => {
      delete el.dataset.iwQuestReward;
      delete el.dataset.iwQuestPercent;
    });
    card.classList.remove(PANEL_CLASS);
    card.style.removeProperty("--fs-quest-accent");
    card.removeAttribute(STATE_ATTR);
    card.removeAttribute(RENDERED_ATTR3);
    delete card.dataset.iwQuestGlyph;
    delete card.dataset.iwQuestArtPending;
    delete card.dataset.iwQuestIconPending;
    SkillsArtService.clearPanel(card);
  }
  function clearQuestPanels() {
    guardEach("quest:teardown", document.querySelectorAll(`.${PANEL_CLASS}`), clearCard);
  }
  function initQuestPanelRenderer() {
    inject("skillpanel", skillpanel_default);
    if (listenerBound3) return;
    listenerBound3 = true;
    on("iw:skill-panel", (e) => guard("quest:panel", () => renderCard2(e.detail.panel)));
  }

  // src/styles/ui-system.css
  var ui_system_default = ':root{--iw-space-1: 4px;--iw-space-2: 6px;--iw-space-3: 9px;--iw-space-4: 12px;--iw-space-5: 16px;--iw-control-h: 32px;--iw-control-h-lg: 36px;--iw-frame-edge: var(--iw-th-edge);--iw-frame-inner: #19150F;--iw-steel: #26231D}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))){position:relative!important;isolation:isolate!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;padding:var(--iw-frame-pad-y, 26px) var(--iw-frame-pad-x, 22px)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 5px 18px rgba(0,0,0,.24)!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])))::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:12px!important;right:12px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent)!important;opacity:.78!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])))::after{content:""!important;position:absolute!important;inset:0!important;z-index:0!important;pointer-events:none!important;border-style:solid!important;border-width:30px 28px!important;border-color:transparent!important;border-image:var(--iw-corner-filigree) 95 88 / 30px 28px / 0 stretch!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])))>*{position:relative;z-index:1}@media(max-width:1024px){:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))){padding:var(--iw-frame-pad-mobile-y, var(--iw-frame-pad-y, 20px)) var(--iw-frame-pad-mobile-x, var(--iw-frame-pad-x, 16px))!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])))::after{border-width:24px 22px!important;border-image-width:24px 22px!important}}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])){border:0!important;border-radius:0!important;padding:0!important;background:none!important;box-shadow:none!important;isolation:auto!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))::before,:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))::after{content:none!important;display:none!important;border:0!important;background:none!important}[data-iw-ui=section-title]{font-family:var(--iw-font-head)!important;letter-spacing:.035em!important;color:var(--iw-text-hi)!important;text-shadow:0 1px 0 #000!important}[data-iw-panel]{--iw-frame-pad-y: 18px;--iw-frame-pad-x: 20px;--iw-frame-pad-mobile-y: 16px;--iw-frame-pad-mobile-x: 14px;display:flex!important;flex-direction:column!important;gap:10px!important;min-width:0!important;font-family:var(--iw-font-ui)!important;color:var(--iw-text)!important}[data-iw-panel] *,[data-iw-panel] *::before,[data-iw-panel] *::after{box-sizing:border-box}[data-iw-panel][data-iw-panel-header=split]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important}[data-iw-panel][data-iw-panel-header=split]>*{grid-column:1 / -1}[data-iw-panel][data-iw-panel-header=split]>[data-iw-panel-part=header-title]{grid-column:1!important;grid-row:1!important;min-width:0!important}[data-iw-panel][data-iw-panel-header=split]>[data-iw-panel-part=header-tools]{grid-column:2!important;grid-row:1!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important}[data-iw-panel] [data-iw-ui=section-title]{margin:0!important;font-size:clamp(17px,1.8vw,21px)!important;font-weight:700!important;line-height:1.15!important}[data-iw-panel-part=header]{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-width:0!important;margin:0!important}[data-iw-panel-part=header]>*{min-width:0}:is([data-iw-panel-part=header],[data-iw-panel-part=header-title]) p{margin:4px 0 0!important;color:var(--iw-faint)!important;font-size:11px!important;line-height:1.25!important}:is([data-iw-panel-part=header],[data-iw-panel-part=header-tools]) button,[data-iw-panel-part=panel-control]{min-width:30px!important;min-height:30px!important;padding:0 9px!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:linear-gradient(180deg,#242018,#15130F)!important;color:var(--iw-dim)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;font-family:var(--iw-font-ui)!important}:is([data-iw-panel-part=header],[data-iw-panel-part=header-tools]) button:hover,[data-iw-panel-part=panel-control]:hover{border-color:var(--iw-th-rule)!important;color:var(--iw-text-hi)!important}[data-iw-panel-part=panel-control]{width:auto!important;min-height:24px!important;margin-left:8px!important;padding:0 7px!important;font-size:10px!important;font-weight:700!important;letter-spacing:.12em!important;text-transform:uppercase!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]{min-width:0!important;min-height:0!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;color:var(--iw-text-hi)!important;font-family:var(--iw-font-head)!important;text-align:left!important;cursor:pointer!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]:hover{border-color:transparent!important;color:var(--iw-text-hi)!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]>*{color:var(--iw-gold-dim)!important;font-family:var(--iw-font-ui)!important;font-size:11px!important;font-weight:600!important;letter-spacing:.08em!important;text-transform:uppercase!important;text-decoration:underline!important;text-underline-offset:2px!important;text-shadow:none!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]:hover>*{color:var(--iw-gold)!important}@media(min-width:641px){[data-iw-panel=action-log] [data-iw-panel-part=header]>:first-child{display:flex!important;align-items:center!important;gap:8px!important}}[data-iw-panel=current-action]>div:not([data-iw-panel-part]),[data-iw-panel=current-action]>strong{font-size:15px!important;font-weight:700!important;color:var(--iw-text-hi)!important}[data-iw-panel=current-action]>p{margin:-2px 0 2px!important;color:var(--iw-faint)!important;font-size:11.5px!important;line-height:1.3!important}[data-iw-panel-part=progress]{position:relative!important;width:100%!important;height:10px!important;min-height:10px!important;overflow:hidden!important;border:1px solid #342D22!important;border-radius:999px!important;background:#090A09!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.9)!important}[data-iw-panel-part=progress]>*{height:100%!important;min-height:100%!important;border-radius:inherit!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi) 0%,var(--iw-th-cta-hi) 52%,var(--iw-th-cta) 100%)!important;box-shadow:0 0 8px rgba(222,102,69,.28)!important}[data-iw-panel-part=queue]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:4px 10px!important;min-width:0!important;padding:10px 12px!important;border:1px solid #463720!important;border-radius:3px!important;background:linear-gradient(180deg,rgba(255,255,255,.022),transparent 45%),rgba(12,12,10,.76)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.34)!important}[data-iw-panel-part=queue]>:first-child{grid-column:1!important;color:var(--iw-faint)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.16em!important;text-transform:uppercase!important}[data-iw-panel-part=queue]>button{grid-column:2!important;grid-row:1 / span 2!important;width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;padding:0!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:linear-gradient(180deg,#26221B,#15130F)!important;color:var(--iw-dim)!important}[data-iw-panel-part=feed]{min-width:0!important;overflow-x:hidden!important;overflow-y:auto!important;border:1px solid #4A3820!important;border-radius:3px!important;background-color:#0B0C0A!important;background-image:linear-gradient(180deg,rgba(255,255,255,.018),transparent 22%)!important;box-shadow:inset 0 0 18px rgba(0,0,0,.24)!important;scrollbar-color:#4A3820 #11110E!important;scrollbar-width:thin!important}[data-iw-panel=action-log] [data-iw-panel-part=feed]{max-height:300px!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed]{max-height:min(46vh,430px)!important}[data-iw-panel-part=feed] *:has([data-iw-panel-part=feed-row]){background:transparent!important;box-shadow:none!important}[data-iw-panel=action-log] [data-iw-panel-part=feed]{background:transparent!important;box-shadow:none!important}[data-iw-panel-part=feed-row]{display:block!important;min-width:0!important;margin:0!important;padding:8px 12px!important;border:0!important;border-bottom:1px solid #29251D!important;border-radius:0!important;background:transparent!important;font-size:12px!important;line-height:1.3!important}[data-iw-panel-part=feed-row]:last-child{border-bottom:0!important}[data-iw-panel-part=feed-row]>*{margin:0!important}[data-iw-panel-part=feed-row]>*+*{margin-top:3px!important}[data-iw-panel-part=feed-row]>:first-child{display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:10px!important}[data-iw-panel-part=feed-row] time{flex:0 0 auto!important;color:#6F6A60!important;font-size:10px!important;font-variant-numeric:tabular-nums!important}[data-iw-panel=action-log] [data-iw-panel-part=feed-row]>:first-child>:first-child{color:var(--iw-faint)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.15em!important;text-transform:uppercase!important}[data-iw-panel=action-log] [data-iw-panel-part=feed-row]>:last-child{color:#82BBD0!important;font-size:11px!important}[data-iw-panel=world-chat] .feed-panel{background:#0B0C0A!important;border-color:#29251D!important}[data-iw-panel=action-log] .feed-panel{background:transparent!important;border-color:#29251D!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed-row] strong{color:#8CC8E0!important;font-weight:700!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed-row] b{color:#D9D0BE!important;font-weight:700!important}[data-iw-panel-part=composer]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;width:100%!important;min-width:0!important;margin:2px 0 0!important}[data-iw-panel-part=chat-input]{width:100%!important;min-width:0!important;height:42px!important;padding:0 13px!important;border:1px solid #403522!important;border-radius:3px!important;background:#080A09!important;color:var(--iw-text)!important;font-family:var(--iw-font-ui)!important;font-size:13px!important;box-shadow:inset 0 2px 7px rgba(0,0,0,.48)!important}[data-iw-panel-part=chat-input]::placeholder{color:#6F685A!important}[data-iw-panel-part=chat-input]:focus{outline:1px solid rgba(197,145,67,.5)!important;outline-offset:1px!important;border-color:var(--iw-th-brass)!important}[data-iw-panel-part=send]{min-width:104px!important;height:42px!important;padding:0 18px!important;border:1px solid var(--iw-th-cta-hi)!important;border-radius:3px!important;background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 62%,#000))!important;color:#FFF0DA!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.025em!important;text-shadow:0 1px 0 #3A1005!important;box-shadow:inset 0 1px 0 rgba(255,218,174,.14)!important}[data-iw-panel-part=send]:hover:not(:disabled){filter:brightness(1.12)}@media(max-width:640px){[data-iw-panel]{gap:8px!important}[data-iw-panel] [data-iw-ui=section-title]{font-size:17px!important}[data-iw-panel-part=feed-row]{padding:8px 9px!important;font-size:11.5px!important}[data-iw-panel-part=header]{align-items:flex-start!important}}@media(max-width:430px){[data-iw-panel-part=composer]{grid-template-columns:minmax(0,1fr)!important;gap:7px!important}[data-iw-panel-part=send]{width:100%!important;min-width:0!important}[data-iw-panel-part=feed-row]>:first-child{flex-wrap:wrap!important;gap:2px 8px!important}}[data-iw-ui=main-nav-shell]{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}[data-iw-ui=main-nav]{display:flex!important;align-items:stretch!important;flex-wrap:wrap!important;gap:0!important;width:max-content!important;max-width:100%!important;min-height:0!important;margin:0!important;padding:0!important;border:1px solid #3A3225!important;border-radius:3px!important;background:#11100D!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.52)!important;overflow:visible!important}[data-iw-ui=nav-tab]{position:relative!important;min-height:var(--iw-control-h)!important;height:var(--iw-control-h)!important;margin:0!important;padding:0 16px!important;border:0!important;border-right:1px solid #3A3225!important;border-radius:0!important;background:linear-gradient(180deg,#211E18,#16140F)!important;color:#AAA291!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.022)!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.025em!important;text-transform:uppercase!important;line-height:1!important}[data-iw-ui=nav-tab]:last-of-type{border-right:0!important}[data-iw-ui=nav-tab]:hover:not(:disabled){z-index:1;background:linear-gradient(180deg,#29241C,#1A1711)!important;color:var(--iw-text-hi)!important;filter:none!important}[data-iw-ui=nav-tab][data-iw-state=active]{z-index:2;color:#FFE8CB!important;background:linear-gradient(180deg,rgba(255,255,255,.035),transparent 46%),linear-gradient(180deg,var(--iw-th-cta),color-mix(in srgb,var(--iw-th-cta) 52%,#000))!important;box-shadow:inset 0 1px 0 rgba(255,226,191,.13),inset 0 -2px 0 rgba(55,16,4,.58)!important}[data-iw-ui=nav-tab][data-iw-state=active]::after{content:"";position:absolute;left:9px;right:9px;bottom:-4px;height:2px;background:var(--iw-ember-hi);box-shadow:0 0 6px rgba(209,90,34,.28)}[data-iw-ui=zone-bar]{border-radius:5px!important;padding-top:8px!important;padding-bottom:8px!important;min-height:0!important}[data-iw-ui=zone-title]{color:var(--iw-text-hi)!important;font-weight:700!important}[data-iw-ui=zone-action]{background:linear-gradient(180deg,#242018,#17140F)!important;border:1px solid var(--iw-line-hi)!important;color:var(--iw-text)!important;height:32px!important;min-height:32px!important;min-width:0!important;padding:0 12px!important;font-size:11px!important;letter-spacing:.025em!important}button:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]),[role=button]:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]){border-color:#2A241A!important;background-image:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.28))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -7px 10px -8px rgba(0,0,0,.9)!important}button:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):hover,[role=button]:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):hover{border-color:var(--iw-line-hot)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.055),inset 0 0 10px -3px rgba(216,121,31,.35)!important}[data-iw-ui=zone-action],.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button]{min-height:30px}[data-iw-inventory-control=filter],[data-iw-inventory-control=page]{min-height:26px}button:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):disabled,[role=button][aria-disabled=true]:not(.iw-item-ref):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]){filter:saturate(.58) brightness(.84)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)!important}input[type=search],input[placeholder*=Search i]{border:1px solid #30291E!important;border-bottom-color:var(--iw-line-hi)!important;border-radius:2px!important;background:linear-gradient(180deg,#080A0A,#0D0E0C)!important;box-shadow:inset 0 2px 6px rgba(0,0,0,.72)!important}@media(max-width:768px){[data-iw-ui=main-nav]{width:100%!important}[data-iw-ui=nav-tab]{flex:1 1 auto!important;padding-inline:9px!important;font-size:10.5px!important}}[data-iw-boss=card]{position:relative!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(143,107,55,.16),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}[data-iw-boss=card]::before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:1px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi),rgba(200,168,97,.16) 34%,transparent 72%)!important;opacity:.9!important}[data-iw-boss=card]::after{content:""!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid rgba(133,101,54,.22)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}[data-iw-boss=card]>*:not(button):not(a):not([role=button]){background:transparent!important}[data-iw-boss=card] button[class*=decoration-dotted]{background-color:transparent!important;border-color:transparent!important;box-shadow:none!important}[data-iw-boss=card]>*{position:relative;z-index:1}[data-iw-market=row]{border-radius:var(--iw-r-panel)!important;border:1px solid var(--iw-line)!important;background:rgba(7,7,11,.66)!important;backdrop-filter:blur(2px)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)!important;transition:border-color .12s,background-color .12s!important}[data-iw-market=row]:hover{border-color:var(--iw-line-hi)!important;background:rgba(12,12,17,.72)!important}[data-iw-market=row][class*=opacity-30]{background:rgba(4,4,7,.6)!important;backdrop-filter:none!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)!important}[data-iw-market=row][class*=opacity-30]:hover{border-color:var(--iw-line)!important;background:rgba(4,4,7,.6)!important}[data-iw-market=namebtn]{background:transparent!important;border-color:transparent!important;box-shadow:none!important}\n';

  // src/modules/UIFoundation.js
  var NAV_LABELS = ["game", "market", "leaderboards", "village", "dungeon"];
  var ACTIVITY_PANELS = /* @__PURE__ */ new Map([
    ["current action", "current-action"],
    ["action log", "action-log"],
    ["world chat", "world-chat"]
  ]);
  function normText3(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function setRole3(el, role) {
    if (el && el.dataset.iwUi !== role) el.dataset.iwUi = role;
    return el;
  }
  function setPanel(el, role) {
    if (el && el.dataset.iwPanel !== role) el.dataset.iwPanel = role;
    return el;
  }
  function setPanelPart(el, role) {
    if (el && el.dataset.iwPanelPart !== role) el.dataset.iwPanelPart = role;
    return el;
  }
  function nearestButtonLabel(btn) {
    return normText3(btn?.textContent).toLowerCase();
  }
  function buttonLabelText(btn) {
    return nearestButtonLabel(btn).replace(/^[^a-z0-9]+/i, "").trim();
  }
  function navLabelText(btn) {
    return nearestButtonLabel(btn).replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9]+$/i, "").trim();
  }
  function commonAncestor2(elements) {
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
    const text = normText3(el.textContent);
    let cur = el;
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const parent = cur.parentElement;
      if (!parent || parent === stop) break;
      if (parent.matches?.("button, a, input, select, textarea")) break;
      if (normText3(parent.textContent) !== text) break;
      cur = parent;
    }
    return cur;
  }
  function matchingLeaves(root, predicate) {
    return [...root.querySelectorAll("div,span,p,strong,time")].filter((el) => el.childElementCount === 0 && predicate(normText3(el.textContent).toLowerCase(), el));
  }
  function directChildUnder(el, ancestor) {
    let cur = el;
    while (cur?.parentElement && cur.parentElement !== ancestor) cur = cur.parentElement;
    return cur?.parentElement === ancestor ? cur : null;
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
  var mainNavResolution = null;
  function countNavTabsIn(root) {
    if (!root) return 0;
    const seen = /* @__PURE__ */ new Set();
    for (const btn of root.querySelectorAll('button, a, [role="tab"]')) {
      const label = navLabelText(btn);
      if (NAV_LABELS.includes(label)) seen.add(label);
    }
    return seen.size;
  }
  function mainNavResolutionValid(entry) {
    return entry.epoch === getLayoutEpoch() && entry.track.isConnected && entry.track.dataset.iwUi === "main-nav" && entry.tabs.every((btn) => btn.isConnected && btn.dataset.iwUi === "nav-tab") && (entry.shell === entry.track || entry.shell.isConnected && entry.shell.dataset.iwUi === "main-nav-shell") && // A rail that GAINS a tab after the first classification (Dungeon unlocks,
    // or the route mounts it late) used to stay cached forever: every check
    // above passes while the new sibling never gets `nav-tab` and renders
    // vanilla inside a skinned rail. Re-count the rail's own labelled controls
    // -- bounded to the rail, not the document -- and re-resolve on a change.
    countNavTabsIn(entry.track) === entry.tabs.length;
  }
  function resolveMainNav() {
    const buttons = [...document.querySelectorAll('button, a, [role="tab"]')];
    const byLabel = /* @__PURE__ */ new Map();
    for (const btn of buttons) {
      const label = navLabelText(btn);
      if (!NAV_LABELS.includes(label)) continue;
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(btn);
    }
    if (byLabel.size < 4) return null;
    const tabs = NAV_LABELS.map((label) => byLabel.has(label) ? pickRendered(byLabel.get(label)) : null).filter(Boolean);
    const track = commonAncestor2(tabs);
    if (!track) return null;
    setRole3(track, "main-nav");
    let shell = track;
    const navText = normText3(track.textContent);
    for (let depth = 0; depth < 3; depth += 1) {
      const parent = shell.parentElement;
      if (!parent || parent === document.body) break;
      const parentButtons = [...parent.querySelectorAll('button, a, [role="tab"]')].filter((btn) => NAV_LABELS.includes(nearestButtonLabel(btn)));
      const rect = parent.getBoundingClientRect?.();
      if (parentButtons.length !== tabs.length || normText3(parent.textContent) !== navText) break;
      if (rect && rect.height > 110) break;
      shell = parent;
    }
    if (shell !== track) setRole3(shell, "main-nav-shell");
    return { tabs, track, shell, epoch: getLayoutEpoch() };
  }
  function applyMainNavState(tabs) {
    const semanticActive = tabs.map((btn) => deriveTabActive(btn));
    const hasSemanticActive = semanticActive.some(Boolean);
    const route = `${location.pathname || ""} ${location.hash || ""}`.toLowerCase();
    const routeActive = tabs.map((btn) => {
      const label = navLabelText(btn);
      if (label === "game") return /(?:^|\/)(?:game)?\/?$/.test(location.pathname || "/") && !location.hash;
      return route.includes(label);
    });
    const hasRouteActive = routeActive.some(Boolean);
    const firstClassification = tabs.every((btn) => btn.dataset.iwUi !== "nav-tab");
    const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);
    tabs.forEach((btn, index) => {
      const wasActive = btn.dataset.iwState === "active";
      setRole3(btn, "nav-tab");
      btn.dataset.iwTab = navLabelText(btn);
      const active = hasSemanticActive ? semanticActive[index] : hasRouteActive ? routeActive[index] : firstClassification ? warmActive[index] : wasActive;
      if (active) btn.dataset.iwState = "active";
      else delete btn.dataset.iwState;
    });
  }
  function classifyMainNav() {
    if (mainNavResolution && mainNavResolutionValid(mainNavResolution)) {
      applyMainNavState(mainNavResolution.tabs);
      return;
    }
    mainNavResolution = resolveMainNav();
    if (mainNavResolution) applyMainNavState(mainNavResolution.tabs);
  }
  var zoneBarResolutions = null;
  function zoneBarResolutionValid(entry) {
    return entry.host.isConnected && entry.host.dataset.iwUi === "zone-bar" && (!entry.title || entry.title.isConnected) && entry.buttons.every((btn) => btn.isConnected && btn.dataset.iwUi === "zone-action");
  }
  function zoneBarCandidatePresent() {
    let zones = false;
    let next = false;
    for (const btn of document.querySelectorAll("button")) {
      const text = nearestButtonLabel(btn);
      if (/zones/.test(text)) zones = true;
      if (/next\s+zone/.test(text)) next = true;
      if (zones && next) return true;
    }
    return false;
  }
  function classifyZoneBar() {
    if (zoneBarResolutions && (zoneBarResolutions.length ? zoneBarResolutions.every(zoneBarResolutionValid) : !zoneBarCandidatePresent())) return;
    zoneBarResolutions = [];
    const zoneLabel = (el) => /^zone\s*\d+\s*:/i.test(normText3(el.textContent).replace(/^[^a-z0-9]+/i, ""));
    const matches = [...document.querySelectorAll("div,span,p,strong")].filter((el) => zoneLabel(el) && el.childElementCount <= 2);
    const labels = matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
    for (const label of labels) {
      let host = label.parentElement;
      for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
        if (host.querySelector('header, [data-iw-ui="main-nav"]')) break;
        const buttons = [...host.querySelectorAll("button")];
        const buttonText = buttons.map(nearestButtonLabel);
        if (buttonText.some((x) => /zones/.test(x)) && buttonText.some((x) => /next\s+zone/.test(x))) {
          setRole3(host, "zone-bar");
          const zoneButtons = [];
          buttons.forEach((btn) => {
            const text = buttonLabelText(btn);
            const match = /^(zones|previous\s+zone|next\s+zone)$/.exec(text);
            if (match) {
              setRole3(btn, "zone-action");
              const tone = match[1].startsWith("zones") ? "zones" : match[1].startsWith("previous") ? "prev" : "next";
              if (btn.dataset.iwZoneAction !== tone) btn.dataset.iwZoneAction = tone;
              zoneButtons.push(btn);
            }
          });
          const title = sameTextShell(label, host, 2);
          setRole3(title, "zone-title");
          zoneBarResolutions.push({ host, title, buttons: zoneButtons });
          break;
        }
      }
    }
  }
  var sectionFrameResolutions = null;
  var sectionFrameSeen = /* @__PURE__ */ new Set();
  var SECTION_FRAME_NAMES = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions|zone selector)$/i;
  function sectionFrameResolutionValid(entry) {
    return entry.epoch === getLayoutEpoch() && entry.heading.isConnected && entry.frame.isConnected && entry.frame.dataset.iwUi === "section-frame" && entry.heading.dataset.iwUi === "section-title" && entry.frame.contains(entry.heading) && // The game wraps every real panel in `.panel`. A resolution that is NOT a
    // `.panel` yet CONTAINS one is a multi-panel layout column that was picked
    // before the inner panel had content (the Quests race). Force a re-resolve
    // so the tighter `.panel` frame wins now that it is populated.
    (entry.frame.classList.contains("panel") || !entry.frame.querySelector(".panel"));
  }
  function sectionFrameHeadings() {
    const matches = [...document.querySelectorAll("h1,h2,h3,h4")].filter((heading) => SECTION_FRAME_NAMES.test(normText3(heading.textContent)));
    return preferRendered(matches);
  }
  function classifySectionFrames() {
    const headings = sectionFrameHeadings();
    if (sectionFrameResolutions && sectionFrameResolutions.every(sectionFrameResolutionValid) && headings.every((heading) => sectionFrameSeen.has(heading))) return;
    if (sectionFrameResolutions) {
      for (const e of sectionFrameResolutions) {
        if (e.frame.dataset.iwUi === "section-frame") delete e.frame.dataset.iwUi;
        if (e.heading.dataset.iwUi === "section-title") delete e.heading.dataset.iwUi;
      }
    }
    sectionFrameResolutions = [];
    sectionFrameSeen = new Set(headings);
    for (const heading of headings) {
      const ownPanel = heading.closest(".panel");
      let cur = heading.parentElement;
      let picked = null;
      for (let depth = 0; cur && depth < 5; depth += 1, cur = cur.parentElement) {
        if (cur.matches?.(".compact-panel")) break;
        const rect = cur.getBoundingClientRect?.();
        if (cur.classList?.contains("panel") && rect && rect.width > 1) {
          picked = cur;
          break;
        }
        const descendantCount = cur.querySelectorAll?.("*").length || 0;
        const substantial = descendantCount >= 12 && normText3(cur.textContent).length >= 45;
        const roomy = !rect || rect.width > 320 && rect.height > 110;
        const wrapsSiblingPanel = ownPanel ? [...cur.querySelectorAll(".panel")].some((p) => p !== ownPanel && !p.contains(ownPanel) && !ownPanel.contains(p)) : cur.querySelectorAll(".panel").length > 1;
        if (substantial && roomy && !wrapsSiblingPanel) {
          picked = cur;
          break;
        }
      }
      if (picked) {
        setRole3(picked, "section-frame");
        setRole3(heading, "section-title");
        sectionFrameResolutions.push({ heading, frame: picked, epoch: getLayoutEpoch() });
      }
    }
  }
  var bossPanelResolutions = null;
  var bossPanelSeen = /* @__PURE__ */ new Set();
  function bossPanelResolutionValid(entry) {
    return entry.epoch === getLayoutEpoch() && entry.heading.isConnected && entry.root.isConnected && entry.root.contains(entry.heading);
  }
  function bossPanelRoot(heading) {
    const panel = heading.closest(".panel");
    if (panel) return panel;
    const entry = (sectionFrameResolutions || []).find((e) => e.heading === heading);
    return entry ? entry.frame : null;
  }
  function tagBossCards(entry) {
    for (const card of entry.root.querySelectorAll(".compact-panel")) {
      if (card.querySelector(".compact-panel")) continue;
      if (card.dataset.iwBoss !== "card") card.dataset.iwBoss = "card";
    }
  }
  function untagBossCards(entry) {
    for (const card of entry.root.querySelectorAll("[data-iw-boss]")) delete card.dataset.iwBoss;
  }
  function bossHeadings() {
    const matches = [...document.querySelectorAll("h1,h2,h3,h4")].filter((heading) => /^world bosses$/i.test(normText3(heading.textContent)));
    return preferRendered(matches);
  }
  function classifyBossCards() {
    const headings = bossHeadings();
    if (bossPanelResolutions && bossPanelResolutions.every(bossPanelResolutionValid) && headings.every((heading) => bossPanelSeen.has(heading))) {
      bossPanelResolutions.forEach(tagBossCards);
      return;
    }
    if (bossPanelResolutions) bossPanelResolutions.forEach(untagBossCards);
    bossPanelResolutions = [];
    bossPanelSeen = new Set(headings);
    for (const heading of headings) {
      const root = bossPanelRoot(heading);
      if (!root || bossPanelResolutions.some((e) => e.root === root)) continue;
      const entry = { heading, root, epoch: getLayoutEpoch() };
      bossPanelResolutions.push(entry);
      tagBossCards(entry);
    }
  }
  var marketResolutions = null;
  var marketSeen = /* @__PURE__ */ new Set();
  function marketResolutionValid(entry) {
    return entry.frame.isConnected && entry.frame.dataset.iwMarket === "root" && entry.title.isConnected && /^market$/i.test(normText3(entry.title.textContent));
  }
  function tagMarketCards(entry) {
    for (const row of entry.frame.querySelectorAll(".compact-row")) {
      if (row.querySelector(".compact-row")) continue;
      if (row.querySelector(":scope > .fs-inv-row")) continue;
      if (row.closest('[data-iw-panel-part="feed"]')) continue;
      if (row.dataset.iwMarket !== "row") row.dataset.iwMarket = "row";
      const nameBtn = row.querySelector('button.text-left, button[class*="flex-1"]');
      if (nameBtn && nameBtn.dataset.iwMarket !== "namebtn") nameBtn.dataset.iwMarket = "namebtn";
    }
  }
  function untagMarket(entry) {
    if (entry.frame.dataset.iwMarket === "root") delete entry.frame.dataset.iwMarket;
    for (const el of entry.frame.querySelectorAll("[data-iw-market]")) delete el.dataset.iwMarket;
  }
  function marketTitles() {
    return [...document.querySelectorAll('[data-iw-ui="section-title"]')].filter((title) => /^market$/i.test(normText3(title.textContent)));
  }
  function classifyMarket() {
    const titles = marketTitles();
    if (marketResolutions && marketResolutions.every(marketResolutionValid) && titles.every((title) => marketSeen.has(title))) {
      marketResolutions.forEach(tagMarketCards);
      return;
    }
    if (marketResolutions) marketResolutions.forEach(untagMarket);
    marketResolutions = [];
    marketSeen = new Set(titles);
    for (const title of titles) {
      const frame = title.closest('[data-iw-ui="section-frame"]');
      if (!frame || marketResolutions.some((e) => e.frame === frame)) continue;
      if (frame.dataset.iwMarket !== "root") frame.dataset.iwMarket = "root";
      const entry = { frame, title };
      marketResolutions.push(entry);
      tagMarketCards(entry);
    }
  }
  function findCurrentActionProgress(root) {
    const semantic = root.querySelector('[role="progressbar"], [aria-valuenow][aria-valuemax]');
    if (semantic) return semantic;
    const fill = [...root.querySelectorAll("[style]")].find((el) => /^\d+(?:\.\d+)?%$/.test(el.style.width || "") && el.parentElement !== root);
    return fill?.parentElement || null;
  }
  function hasPanelBodyOutsideHeading(candidate, heading) {
    const headingBranch = directChildUnder(heading, candidate);
    if (!headingBranch) return false;
    return [...candidate.children].some((child) => {
      if (child === headingBranch || child.matches?.('button,a,[role="button"]')) return false;
      return !/^\s*[\d,.]+\s*xp\s*\/\s*hr\s*$/i.test(normText3(child.textContent));
    });
  }
  function panelHostMatches(candidate, panel, heading) {
    if (panel === "current-action") {
      return !!findCurrentActionProgress(candidate);
    }
    if (panel === "action-log") {
      const hasControl = [...candidate.querySelectorAll("button,a")].some((el) => /^view\s+all$/i.test(normText3(el.textContent)));
      const hasRate = /\b[\d,.]+\s*xp\s*\/\s*hr\b/i.test(normText3(candidate.textContent));
      return (hasControl || hasRate) && hasPanelBodyOutsideHeading(candidate, heading);
    }
    if (panel === "world-chat") {
      return !![...candidate.querySelectorAll("input,textarea")].find((el) => /message\s+world\s+chat/i.test(el.getAttribute("placeholder") || ""));
    }
    return false;
  }
  function findActivityPanelHost(heading, panel) {
    let cur = heading.parentElement;
    for (let depth = 0; cur && cur !== document.body && depth < 6; depth += 1, cur = cur.parentElement) {
      if (panelHostMatches(cur, panel, heading)) return cur;
    }
    const panelEl = heading.closest?.(".panel");
    if (panelEl && panelEl.contains(heading)) return panelEl;
    return null;
  }
  function classifyPanelHeader(host, heading) {
    const titleBranch = directChildUnder(heading, host);
    if (!titleBranch) return;
    const companion = titleBranch.nextElementSibling;
    const split = titleBranch !== heading && !titleBranch.querySelector('button,a,[role="button"]') && companion && !companion.querySelector('input,textarea,h1,h2,h3,h4,[role="heading"]') && (companion.querySelector('button,a,[role="button"]') || /\bxp\s*\/\s*hr\b/i.test(normText3(companion.textContent)));
    if (split) {
      host.dataset.iwPanelHeader = "split";
      setPanelPart(titleBranch, "header-title");
      setPanelPart(companion, "header-tools");
    } else {
      delete host.dataset.iwPanelHeader;
      setPanelPart(titleBranch, "header");
    }
  }
  function classifyFeed(host) {
    let markers = matchingLeaves(host, (text) => /^\d{1,2}:\d{2}:\d{2}$/.test(text));
    if (!markers.length) markers = matchingLeaves(host, (text) => text === "system");
    let feed = markers.length > 1 ? commonAncestor2(markers) : markers.length === 1 ? directChildUnder(markers[0], host) : null;
    if (!feed) {
      feed = [...host.children].find((child) => child.dataset.iwPanelPart !== "header" && !child.querySelector("input,textarea") && !child.matches("form") && !child.querySelector('h1,h2,h3,h4,[role="heading"]')) || null;
    }
    if (!feed || feed === host || !host.contains(feed)) return;
    setPanelPart(feed, "feed");
    const rows = new Set(markers.map((marker) => directChildUnder(marker, feed)).filter(Boolean));
    rows.forEach((row) => setPanelPart(row, "feed-row"));
  }
  function classifyCurrentAction(host) {
    setPanelPart(findCurrentActionProgress(host), "progress");
    const queued3 = matchingLeaves(host, (text) => text === "queued")[0];
    let cur = queued3?.parentElement;
    for (let depth = 0; cur && cur !== host && depth < 3; depth += 1, cur = cur.parentElement) {
      if (cur.querySelector("button") && normText3(cur.textContent).length > 6) {
        setPanelPart(cur, "queue");
        break;
      }
    }
  }
  function classifyActionLog(host) {
    const control = [...host.querySelectorAll("button,a")].find((el) => /^view\s+all$/i.test(normText3(el.textContent)));
    setPanelPart(control, "panel-control");
    classifyFeed(host);
  }
  function classifyWorldChat(host) {
    const input = [...host.querySelectorAll("input,textarea")].find((el) => /message\s+world\s+chat/i.test(el.getAttribute("placeholder") || ""));
    setPanelPart(input, "chat-input");
    if (input) {
      let composer = input.parentElement;
      for (let depth = 0; composer && composer !== host && depth < 3; depth += 1, composer = composer.parentElement) {
        const send = [...composer.querySelectorAll("button")].find((el) => /^send$/i.test(normText3(el.textContent)));
        if (!send) continue;
        setPanelPart(composer, "composer");
        setPanelPart(send, "send");
        break;
      }
    }
    classifyFeed(host);
  }
  var activityPanelResolutions = null;
  function activityPanelResolutionValid(entry) {
    return entry.epoch === getLayoutEpoch() && entry.heading.isConnected && entry.host.isConnected && entry.host.dataset.iwUi === "section-frame" && entry.host.dataset.iwPanel === entry.panel && entry.host.contains(entry.heading);
  }
  function runActivityPanel(entry) {
    const { host, heading, panel } = entry;
    classifyPanelHeader(host, heading);
    if (panel === "current-action") classifyCurrentAction(host);
    else if (panel === "action-log") classifyActionLog(host);
    else classifyWorldChat(host);
  }
  function activityPanelLabelNodes() {
    const seen = /* @__PURE__ */ new Set();
    const collected = [];
    const push = (el, panel) => {
      if (!el || !panel || seen.has(el)) return;
      seen.add(el);
      collected.push({ node: el, panel });
    };
    for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
      push(el, ACTIVITY_PANELS.get(normText3(el.textContent).toLowerCase()));
    }
    for (const el of document.querySelectorAll("p,span,div,strong,b")) {
      if (el.childElementCount === 0) push(el, ACTIVITY_PANELS.get(normText3(el.textContent).toLowerCase()));
    }
    const haveBeforeId = new Set(collected.map((o) => o.panel));
    if (!haveBeforeId.has("current-action")) {
      const byId = pickRendered([...document.querySelectorAll('[id="current-action-panel"]')]);
      if (byId) {
        const label = [...byId.querySelectorAll('h1,h2,h3,h4,[role="heading"],p,span,div,strong,b')].find((el) => el.childElementCount === 0 && normText3(el.textContent).length > 0 && normText3(el.textContent).length <= 40);
        push(label || byId, "current-action");
      }
    }
    const have = new Set(collected.map((o) => o.panel));
    if (have.size < ACTIVITY_PANELS.size) {
      for (const el of document.querySelectorAll("div,header,section,h2,h3,h4,span,p,button,a")) {
        if (seen.has(el)) continue;
        for (const n of el.childNodes) {
          if (n.nodeType !== 3) continue;
          const panel = ACTIVITY_PANELS.get(normText3(n.textContent).toLowerCase());
          if (panel && !have.has(panel)) {
            push(el, panel);
            break;
          }
        }
      }
    }
    const byPanel = /* @__PURE__ */ new Map();
    for (const entry of collected) {
      if (!byPanel.has(entry.panel)) byPanel.set(entry.panel, []);
      byPanel.get(entry.panel).push(entry);
    }
    const out = [];
    for (const entries of byPanel.values()) {
      const picked = new Set(preferRendered(entries.map((e) => e.node)));
      for (const entry of entries) if (picked.has(entry.node)) out.push(entry);
    }
    return out;
  }
  function classifyActivityPanels() {
    const labels = activityPanelLabelNodes();
    const wantSlugs = new Set(labels.map((l) => l.panel));
    if (activityPanelResolutions && activityPanelResolutions.every(activityPanelResolutionValid) && [...wantSlugs].every((slug) => activityPanelResolutions.some((e) => e.panel === slug))) {
      activityPanelResolutions.forEach(runActivityPanel);
      return;
    }
    if (activityPanelResolutions) {
      for (const e of activityPanelResolutions) {
        if (e.host.dataset.iwUi === "section-frame") delete e.host.dataset.iwUi;
        if (e.heading.dataset.iwUi === "section-title") delete e.heading.dataset.iwUi;
        delete e.host.dataset.iwPanel;
      }
    }
    activityPanelResolutions = [];
    for (const { node: heading, panel } of labels) {
      const host = findActivityPanelHost(heading, panel);
      if (!host) continue;
      if (activityPanelResolutions.some((e) => e.host === host)) continue;
      setRole3(host, "section-frame");
      setRole3(heading, "section-title");
      setPanel(host, panel);
      const entry = { heading, host, panel, epoch: getLayoutEpoch() };
      activityPanelResolutions.push(entry);
      runActivityPanel(entry);
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
      guard("ui:boss-cards", classifyBossCards);
      guard("ui:market", classifyMarket);
      guard("ui:activity-panels", classifyActivityPanels);
    });
  }
  function clearUIFoundation() {
    mainNavResolution = null;
    zoneBarResolutions = null;
    sectionFrameResolutions = null;
    sectionFrameSeen = /* @__PURE__ */ new Set();
    bossPanelResolutions = null;
    bossPanelSeen = /* @__PURE__ */ new Set();
    marketResolutions = null;
    marketSeen = /* @__PURE__ */ new Set();
    activityPanelResolutions = null;
    document.querySelectorAll("[data-iw-ui]").forEach((el) => {
      delete el.dataset.iwUi;
    });
    document.querySelectorAll("[data-iw-tab]").forEach((el) => {
      delete el.dataset.iwTab;
    });
    document.querySelectorAll("[data-iw-state]").forEach((el) => {
      delete el.dataset.iwState;
    });
    document.querySelectorAll("[data-iw-panel]").forEach((el) => {
      delete el.dataset.iwPanel;
    });
    document.querySelectorAll("[data-iw-panel-part]").forEach((el) => {
      delete el.dataset.iwPanelPart;
    });
    document.querySelectorAll("[data-iw-panel-header]").forEach((el) => {
      delete el.dataset.iwPanelHeader;
    });
    document.querySelectorAll("[data-iw-zone-action]").forEach((el) => {
      delete el.dataset.iwZoneAction;
    });
    document.querySelectorAll("[data-iw-boss]").forEach((el) => {
      delete el.dataset.iwBoss;
    });
    document.querySelectorAll("[data-iw-market]").forEach((el) => {
      delete el.dataset.iwMarket;
    });
  }
  function initUIFoundation() {
    inject("ui-system", ui_system_default);
    on("iw:dom-flush", queueClassify);
    queueClassify();
  }

  // src/modules/zoneThemes.js
  var ZONE_THEMES = Object.freeze({
    1: "verdant",
    2: "forged-metal",
    3: "verdant",
    4: "infernal",
    5: "forged-metal",
    6: "celestial",
    7: "voidborn",
    8: "runic-arcane",
    9: "infernal",
    10: "celestial",
    11: "voidborn",
    12: "celestial",
    13: "infernal",
    14: "lunar-spectral",
    15: "infernal",
    16: "infernal",
    17: "tempest-oceanic",
    18: "runic-arcane",
    19: "voidborn",
    20: "voidborn",
    21: "runic-arcane",
    22: "glacial",
    23: "lunar-spectral",
    24: "forged-metal",
    25: "celestial",
    26: "infernal",
    27: "lunar-spectral",
    28: "runic-arcane",
    29: "infernal",
    30: "voidborn",
    31: "tempest-oceanic",
    32: "infernal",
    33: "glacial",
    34: "verdant"
  });
  var THEME_NAMES = Object.freeze([
    "celestial",
    "forged-metal",
    "glacial",
    "infernal",
    "lunar-spectral",
    "runic-arcane",
    "tempest-oceanic",
    "verdant",
    "voidborn"
  ]);
  function zoneTheme(zone) {
    return Number.isInteger(zone) && ZONE_THEMES[zone] || null;
  }

  // src/styles/header.css
  var header_default = '[data-iw-header=root],[data-iw-ui=main-nav],[data-iw-header=announcement],[data-iw-header=zone-shell]{--hd-bracket: var(--iw-th-bracket);--hd-bracket-dim: var(--iw-th-bracket-dim);--hd-plate: var(--iw-th-plate);--hd-rule: var(--iw-th-edge);--hd-rule-soft: var(--iw-th-rule-soft);--hd-teal: #4FC7D8;--hd-teal-dim: #1E5C68;--hd-gap: 8px}[data-iw-header=status-card],[data-iw-header=utility-button],[data-iw-ui=zone-action]{--b: 10px;--i: 3px;--bc: var(--hd-bracket-dim);position:relative!important;border:1px solid var(--hd-rule-soft)!important;border-radius:var(--iw-r-panel)!important;background-color:var(--hd-plate)!important;background-repeat:no-repeat!important;background-image:linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc))!important;background-size:var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b)!important;background-position:var(--i) var(--i),var(--i) var(--i),calc(100% - var(--i)) var(--i),calc(100% - var(--i)) var(--i),var(--i) calc(100% - var(--i)),var(--i) calc(100% - var(--i)),calc(100% - var(--i)) calc(100% - var(--i)),calc(100% - var(--i)) calc(100% - var(--i))!important;box-shadow:none!important}[data-iw-header=root]{position:relative!important;isolation:isolate!important;display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;contain:layout inline-size!important;min-height:0!important;padding:16px 20px!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;overflow:hidden!important;background-color:#0A0B0D!important;background-image:var(--iw-header-surface)!important;background-size:cover!important;background-position:center!important;box-shadow:none!important}[data-iw-header=root]>*{position:relative;z-index:1}[data-iw-header=root]::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-style:solid;border-width:30px 28px;border-color:transparent;border-image:var(--iw-corner-filigree) 95 88 / 30px 28px / 0 stretch}[data-iw-header=layout]{display:grid!important;width:100%!important;min-width:0!important;grid-template-columns:minmax(0,62fr) minmax(0,38fr)!important;align-items:start!important;gap:0 18px!important;min-height:0!important;padding:0!important}[data-iw-header=identity-region]{display:grid!important;isolation:isolate!important;grid-template-columns:104px minmax(0,1fr)!important;grid-template-areas:"crest profile" "utilities utilities"!important;align-items:center!important;justify-self:start!important;align-self:center!important;margin-left:16px!important;width:fit-content!important;max-width:min(560px,46vw)!important;gap:16px 14px!important;min-width:0!important;padding:0!important;background:none!important}[data-iw-header=identity-region]::before{content:""!important;grid-column:crest-start / profile-end!important;grid-row:1 / 2!important;align-self:stretch!important;z-index:0!important;margin:-8px -8px!important;border:1px solid rgba(201,162,77,0.46)!important;border-radius:10px!important;background:rgba(9,8,13,0.42)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.07),0 0 0 1px rgba(0,0,0,0.38),0 0 8px rgba(201,162,77,0.14)!important;backdrop-filter:blur(2px)!important;-webkit-backdrop-filter:blur(2px)!important;pointer-events:none!important}[data-iw-header=identity-region]>*{position:relative!important;z-index:1!important}.fs-header-crest{grid-area:crest!important;display:block!important;width:104px!important;height:106px!important;background-image:var(--iw-header-crest)!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;filter:drop-shadow(0 0 14px rgba(70,130,200,0.22));pointer-events:none}[data-iw-header=profile]{grid-area:profile!important;min-width:0!important;padding:0!important;background:none!important}[data-iw-header=brand]{margin:0 0 1px!important;display:flex!important;align-items:center!important;gap:8px!important;font-family:var(--iw-font-head)!important;font-size:11.5px!important;font-weight:600!important;letter-spacing:0.2em!important;text-transform:uppercase!important;color:var(--iw-gold-dim)!important}[data-iw-header=brand]::before,[data-iw-header=brand]::after{content:"";width:16px;height:1px;background:linear-gradient(90deg,transparent,var(--iw-th-edge))}[data-iw-header=brand]::after{transform:scaleX(-1)}[data-iw-header=profile-name]{margin:0 0 2px!important;font-family:var(--iw-font-head)!important;font-size:clamp(21px,1.9vw,29px)!important;font-weight:700!important;line-height:1.04!important;letter-spacing:0.005em!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;background:linear-gradient(96deg,var(--iw-th-hairline-hi) 0%,#F0DDB0 28%,#FBF8F2 50%,color-mix(in srgb,var(--iw-th-accent) 55%,#fff) 72%,var(--iw-th-accent) 100%)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}[data-iw-header=profile-title]{margin:0!important;font-family:var(--iw-font-head)!important;font-size:12.5px!important;font-weight:600!important;letter-spacing:0.08em!important;text-transform:uppercase!important;color:var(--iw-gold)!important}[data-iw-header=profile-meta]{margin-top:4px!important;font-size:12.5px!important;line-height:1.3!important;color:var(--iw-text)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}[data-iw-header=profile-online]{margin-top:2px!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;background-image:none!important;box-shadow:none!important;text-align:left!important;height:auto!important;min-height:0!important;display:flex!important;align-items:center!important;gap:8px!important;font-family:var(--iw-font-head)!important;font-size:11.5px!important;font-weight:600!important;letter-spacing:0.09em!important;text-transform:uppercase!important;color:var(--iw-gold-dim)!important}[data-iw-header=profile-online]::before{content:"";width:7px;height:7px;border-radius:50%;background:#38C8A8;box-shadow:0 0 8px rgba(56,200,168,0.75);flex:0 0 auto}[data-iw-header=utilities]{grid-area:utilities!important;align-self:start!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:var(--hd-gap, 8px)!important;margin:0 -8px!important;padding:0!important}[data-iw-header=utility-button]{--b: 9px;--i: 3px;flex:1 1 0!important;width:auto!important;min-width:0!important;height:42px!important;min-height:42px!important;padding:0!important;display:grid!important;place-items:center!important;border-radius:3px!important;background-color:#14161A!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.05),inset 0 -1px 0 rgba(0,0,0,0.5),0 1px 2px rgba(0,0,0,0.35)!important;color:var(--iw-gold-dim)!important;transition:color 120ms ease,border-color 120ms ease,background-color 120ms ease,box-shadow 120ms ease}[data-iw-header=utility-button] svg{width:20px!important;height:20px!important}[data-iw-header=utility-button]:hover{--bc: color-mix(in srgb, var(--iw-th-bracket) 78%, #fff);color:var(--iw-gold)!important;border-color:var(--hd-rule)!important;background-color:#1C1F25!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.09),inset 0 -1px 0 rgba(0,0,0,0.5),0 0 10px rgba(201,162,77,0.16)!important}[data-iw-header=utility-button]{box-sizing:border-box!important;border:1px solid rgba(201,162,77,0.44)!important;border-radius:7px!important;background:rgba(9,8,13,0.40)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.06),0 0 0 1px rgba(0,0,0,0.38),0 0 7px rgba(201,162,77,0.13)!important;backdrop-filter:blur(2px)!important;-webkit-backdrop-filter:blur(2px)!important}[data-iw-header=utility-button] svg{width:18px!important;height:18px!important}[data-iw-header=utility-button]:hover{background:rgba(22,19,28,0.56)!important;border-color:rgba(226,190,118,0.62)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.09),0 0 9px rgba(201,162,77,0.22)!important;filter:brightness(1.08)!important}[data-iw-header=utility-button]{transition:color 120ms ease,filter 120ms ease}[data-iw-header=status-card]{box-sizing:border-box!important;border:1px solid rgba(201,162,77,0.46)!important;border-image:none!important;border-radius:8px!important;background:rgba(9,8,13,0.42)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.07),0 0 0 1px rgba(0,0,0,0.38),0 0 8px rgba(201,162,77,0.14)!important;backdrop-filter:blur(2px)!important;-webkit-backdrop-filter:blur(2px)!important}[data-iw-header=status-grid] [data-iw-header-stat=gold]{grid-area:1 / 1 / 3 / 2!important}[data-iw-header=status-grid] [data-iw-header-stat=timer],[data-iw-header=status-grid] [data-iw-header-stat=other]{grid-column:2!important}[data-iw-header=status-grid] [data-iw-header-stat=gold]{font-family:var(--iw-font-head)!important;font-variant-numeric:tabular-nums!important}[data-iw-header=status-grid] [data-iw-header-stat=timer]{min-height:30px!important;font-size:11.5px!important;color:#CFC5AE!important}@media(min-width:861px){[data-iw-header=status-grid] [data-iw-header-stat=gold],[data-iw-header=status-grid]:not(:has([data-iw-header-stat=boost])) [data-iw-header-stat=combat],[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{justify-content:center!important;text-align:center!important;font-size:12px!important;letter-spacing:.01em!important;color:#F7EBD2!important}[data-iw-header=status-grid]:not(:has([data-iw-header-stat=boost])) [data-iw-header-stat=combat],[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{grid-area:3 / 1 / 5 / 2!important}[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{padding:5px 10px!important;line-height:1.3!important}[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=combat]{grid-area:auto!important;grid-column:2!important;min-height:30px!important;font-size:11.5px!important;color:#CFC5AE!important}}[data-iw-header=status-grid]{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:repeat(4,auto)!important;align-content:start!important;gap:6px!important;justify-self:end!important;width:376px!important;max-width:100%!important;min-width:0!important;padding:0!important}[data-iw-header=status-card]{min-width:0!important;min-height:36px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:3px 8px!important;text-align:left!important;font-family:Georgia,"Times New Roman",serif!important;font-size:12px!important;font-weight:600!important;line-height:1.16!important;color:var(--iw-text-hi)!important;white-space:normal!important;overflow-wrap:anywhere!important;overflow:hidden!important}[data-iw-header=status-card]>*{min-width:0}[data-iw-ui=main-nav-shell]{margin-top:8px!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}[data-iw-ui=main-nav]{position:relative!important;display:flex!important;align-items:stretch!important;gap:0!important;min-height:0!important;padding:0!important;overflow:hidden!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;background-color:transparent!important;background-image:linear-gradient(180deg,#121317 0%,#0A0B0D 60%,#0D0E11 100%)!important;box-shadow:none!important}[data-iw-ui=nav-tab]{flex:0 1 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:11px!important;height:auto!important;min-height:0!important;margin:0!important;padding:12px 26px!important;border:0!important;border-right:1px solid var(--hd-rule-soft)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;font-family:var(--iw-font-head)!important;font-size:17px!important;font-weight:600!important;letter-spacing:0.06em!important;text-transform:uppercase!important;white-space:nowrap!important;color:var(--iw-dim)!important;text-shadow:none!important;transition:color 120ms ease,background-color 120ms ease}[data-iw-ui=nav-tab]:hover{color:var(--iw-text)!important;background-color:rgba(255,214,140,0.045)!important}[data-iw-ui=nav-tab][data-iw-state=active]{color:#FFE2AE!important;border-left:1px solid var(--hd-bracket)!important;border-right:1px solid var(--hd-bracket)!important;background-image:linear-gradient(180deg,rgba(255,176,64,0.38) 0%,rgba(158,82,20,0.26) 55%,rgba(74,36,8,0.32) 100%)!important;box-shadow:inset 0 1px 0 rgba(255,208,130,0.55),inset 0 -1px 0 rgba(255,190,100,0.30),0 0 18px rgba(255,150,40,0.16)!important}[data-iw-ui=nav-tab]:first-child{border-left:0!important}[data-iw-header=announcement]{display:flex!important;align-items:center!important;gap:14px!important;height:50px!important;min-height:0!important;margin:10px 0!important;padding:0 20px!important;border:1px solid var(--hd-teal-dim)!important;border-radius:var(--iw-r-panel)!important;background-color:transparent!important;background-image:linear-gradient(90deg,rgba(24,68,80,0.92) 0%,rgba(12,32,40,0.92) 38%,rgba(8,18,24,0.92) 100%)!important;box-shadow:inset 0 0 26px rgba(40,150,175,0.10)!important;font-size:16px!important;color:var(--iw-text)!important}[data-iw-header=announcement]::before{content:""!important;flex:0 0 auto;width:22px;height:22px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--iw-th-accent) 25%,#fff) 0%,var(--iw-th-accent) 40%,color-mix(in srgb,var(--iw-th-accent) 55%,#000) 100%);clip-path:polygon(50% 0%,59% 41%,100% 50%,59% 59%,50% 100%,41% 59%,0% 50%,41% 41%);filter:drop-shadow(0 0 7px color-mix(in srgb,var(--iw-th-accent) 60%,transparent))}[data-iw-header=zone-shell]{position:relative!important;isolation:isolate!important;display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:16px!important;min-height:70px!important;padding:9px 14px!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;overflow:hidden!important;background-color:#08090B!important;background-image:none!important;box-shadow:none!important}[data-iw-header=zone-shell]>*{position:relative;z-index:1}[data-iw-header=zone-shell]::before{content:"";position:absolute;inset:0 34% 0 16%;z-index:0;background-image:var(--iw-zone-scene);background-size:cover;background-position:center;opacity:0.34;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 26%,#000 68%,transparent 100%),linear-gradient(180deg,transparent 0%,#000 26%,#000 74%,transparent 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0%,#000 26%,#000 68%,transparent 100%),linear-gradient(180deg,transparent 0%,#000 26%,#000 74%,transparent 100%);mask-composite:intersect}[data-iw-ui=zone-title]{font-family:var(--iw-font-head)!important;font-size:18px!important;font-weight:700!important;letter-spacing:0.03em!important;color:var(--iw-text-hi)!important;text-shadow:none!important}[data-iw-ui=zone-action]{--b: 10px;display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-width:0!important;min-height:46px!important;height:auto!important;padding:10px 20px!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:600!important;letter-spacing:0.07em!important;text-transform:uppercase!important;color:var(--iw-text)!important;transition:filter 120ms ease}[data-iw-ui=zone-action]:hover{filter:brightness(1.18)}[data-iw-ui=zone-action][data-iw-zone-action=zones],[data-iw-ui=zone-action]:first-of-type{--bc: var(--hd-teal);color:#CFF2F8!important;border-color:var(--hd-teal-dim)!important;background-color:#07171C!important;box-shadow:inset 0 0 20px rgba(50,170,195,0.14)!important}[data-iw-ui=zone-action][data-iw-zone-action=next],[data-iw-ui=zone-action]:last-of-type{color:#F3E3C0!important;border:1px solid var(--iw-th-cta-hi)!important;background-color:var(--iw-th-plate)!important;background-image:linear-gradient(180deg,color-mix(in srgb,var(--iw-th-cta) 34%,#000),color-mix(in srgb,var(--iw-th-cta) 14%,#000))!important;background-size:auto!important;background-position:0 0!important;box-shadow:inset 0 0 14px -2px color-mix(in srgb,var(--iw-th-cta-hi) 60%,transparent),inset 0 1px 0 rgba(255,216,150,.18),0 0 0 1px color-mix(in srgb,var(--iw-th-cta-hi) 20%,transparent)!important;text-shadow:0 0 8px color-mix(in srgb,var(--iw-th-cta-hi) 45%,transparent)!important}@media(max-width:1280px){[data-iw-header=layout]{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}[data-iw-header=status-grid]{margin-top:2px!important}[data-iw-header=identity-region]{justify-self:stretch!important;width:auto!important;max-width:none!important;margin-left:0!important}[data-iw-header=utilities]{justify-content:flex-start!important;margin:0!important}[data-iw-header=utility-button]{width:42px!important;min-width:42px!important;flex:0 0 auto!important}}@media(max-width:860px){[data-iw-header=root]{padding:14px!important}[data-iw-header=identity-region]{grid-template-columns:108px minmax(0,1fr)!important;grid-template-areas:"crest profile" "utilities utilities"!important;gap:10px 14px!important}.fs-header-crest{width:108px!important;height:116px!important}[data-iw-header=utilities]{justify-content:space-between!important;margin:0 -8px!important}[data-iw-header=utility-button]{flex:1 1 0!important;width:auto!important;min-width:0!important}[data-iw-header=status-grid]{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:auto!important;width:auto!important;justify-self:stretch!important}[data-iw-header=status-grid] [data-iw-header-stat]{grid-area:auto!important;grid-column:auto!important}[data-iw-header=status-grid] [data-iw-header-stat=gold],[data-iw-header=status-grid] [data-iw-header-stat=combat],[data-iw-header=status-grid] [data-iw-header-stat=boost]{justify-content:flex-start!important;font-size:13px!important}[data-iw-ui=nav-tab]{padding:11px 14px!important;font-size:14px!important;gap:8px!important}[data-iw-ui=zone-action]{flex:1 1 0!important;padding:10px 10px!important;font-size:13px!important}}@media(max-width:768px){[data-iw-header=root]{background-image:var(--iw-header-surface-mobile, var(--iw-header-surface))!important}}@media(max-width:560px){[data-iw-ui=main-nav]{overflow-x:auto!important;scrollbar-width:none}[data-iw-ui=main-nav]::-webkit-scrollbar{display:none}[data-iw-ui=nav-tab]{flex:0 0 auto!important}}@media(prefers-reduced-motion:reduce){[data-iw-header=utility-button],[data-iw-ui=nav-tab],[data-iw-ui=zone-action]{transition:none}}\n';

  // src/modules/HeaderRenderer.js
  var ROLE = "data-iw-header";
  var queued2 = false;
  var HEADER_ASSETS = {
    headerFrame: "assets/header/header_frame.webp",
    headerSurface: "assets/header/header_surface.webp",
    headerCrest: "assets/header/header_crest.webp",
    headerDivider: "assets/header/header_divider.webp",
    utilityFrame: "assets/header/utility_frame.webp",
    statusFrame: "assets/header/status_frame.webp",
    navRail: "assets/header/nav_rail.webp",
    navActive: "assets/header/nav_active.webp",
    navIdle: "assets/header/nav_idle.webp",
    announcementFrame: "assets/header/announcement_frame.webp",
    zoneFrame: "assets/header/zone_frame.webp",
    zoneScene: "assets/header/zone_scene.webp",
    zoneButtonActive: "assets/header/zone_button_active.webp",
    zoneButtonIdle: "assets/header/zone_button_idle.webp",
    zoneButtonTeal: "assets/header/zone_button_teal.webp"
  };
  var ASSET_VARS = [
    "--iw-header-frame",
    "--iw-header-surface",
    "--iw-header-surface-mobile",
    "--iw-header-crest",
    "--iw-header-divider",
    "--iw-utility-frame",
    "--iw-status-frame",
    "--iw-nav-rail",
    "--iw-nav-active",
    "--iw-nav-idle",
    "--iw-announcement-frame",
    "--iw-zone-frame",
    "--iw-zone-scene",
    "--iw-zone-button-active",
    "--iw-zone-button-idle",
    "--iw-zone-button-teal",
    // Per-zone frame theme, set on <html> by applyZoneTheme(). The teardown loop
    // below walks '*', which includes <html>, so listing them here clears them.
    "--iw-zone-atlas",
    "--iw-corner-filigree"
  ];
  var norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var ZONE_SURFACE_DIR = "assets/header/zones";
  var ZONE_SURFACE_MAX = 34;
  function currentZoneNumber() {
    let el = document.querySelector('[data-iw-ui="zone-title"]');
    if (!el) {
      el = [...document.querySelectorAll("div,span,p,strong")].find((n) => /^zone\s*\d+\s*:/i.test(norm(n.textContent).replace(/^[^a-z0-9]+/i, "")));
    }
    if (!el) return null;
    const m = norm(el.textContent).replace(/^[^a-z0-9]+/i, "").match(/^zone\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }
  function zoneSurfaceUrl(zone, variant = "") {
    const key = Number.isInteger(zone) && zone >= 1 && zone <= ZONE_SURFACE_MAX ? `${ZONE_SURFACE_DIR}/zone_${zone}${variant}.webp` : HEADER_ASSETS.headerSurface;
    return `url("${assetUrl(key)}")`;
  }
  function applyZoneSurface(root) {
    if (!root) return;
    const zone = currentZoneNumber();
    const key = zone == null ? "fallback" : String(zone);
    if (root.dataset.iwZone === key && root.style.getPropertyValue("--iw-header-surface")) return;
    root.dataset.iwZone = key;
    root.style.setProperty("--iw-header-surface", zoneSurfaceUrl(zone));
    root.style.setProperty("--iw-header-surface-mobile", zoneSurfaceUrl(zone, "_mobile"));
  }
  var THEME_ASSET_DIR = "assets/skills-ui";
  function applyZoneTheme() {
    const html = document.documentElement;
    if (!html) return;
    const theme = zoneTheme(currentZoneNumber());
    const key = theme || "default";
    if (html.dataset.iwZoneTheme === key) return;
    html.dataset.iwZoneTheme = key;
    if (theme) {
      html.style.setProperty("--iw-zone-atlas", `url("${assetUrl(`${THEME_ASSET_DIR}/theme_${theme}.webp`)}")`);
      html.style.setProperty("--iw-corner-filigree", `url("${assetUrl(`${THEME_ASSET_DIR}/panel_corners_${theme}.webp`)}")`);
    } else {
      html.style.removeProperty("--iw-zone-atlas");
      html.style.removeProperty("--iw-corner-filigree");
    }
  }
  function setRole4(el, role) {
    if (el && el.getAttribute(ROLE) !== role) el.setAttribute(ROLE, role);
    return el;
  }
  function setAssetVar(el, name, key) {
    if (!el || !HEADER_ASSETS[key]) return;
    el.style.setProperty(name, `url("${assetUrl(HEADER_ASSETS[key])}")`);
  }
  function applyHeaderVars(root) {
    setAssetVar(root, "--iw-header-frame", "headerFrame");
    setAssetVar(root, "--iw-header-frame-bar", "headerFrameBar");
    setAssetVar(root, "--iw-header-crest", "headerCrest");
    setAssetVar(root, "--iw-header-divider", "headerDivider");
    setAssetVar(root, "--iw-utility-frame", "utilityFrame");
    setAssetVar(root, "--iw-status-frame", "statusFrame");
  }
  function applyNavVars(nav) {
    setAssetVar(nav, "--iw-nav-rail", "navRail");
    setAssetVar(nav, "--iw-nav-active", "navActive");
    setAssetVar(nav, "--iw-nav-idle", "navIdle");
  }
  function applyAnnouncementVars(el) {
    setAssetVar(el, "--iw-announcement-frame", "announcementFrame");
  }
  function applyZoneVars(el) {
    setAssetVar(el, "--iw-zone-frame", "zoneFrame");
    setAssetVar(el, "--iw-zone-scene", "headerSurface");
    setAssetVar(el, "--iw-zone-button-active", "zoneButtonActive");
    setAssetVar(el, "--iw-zone-button-idle", "zoneButtonIdle");
    setAssetVar(el, "--iw-zone-button-teal", "zoneButtonTeal");
  }
  function isVisible(el) {
    const rect = el.getBoundingClientRect?.();
    return !!rect && (rect.width > 0 || rect.height > 0);
  }
  function pickVisible(candidates) {
    return candidates.find(isVisible) || candidates[0] || null;
  }
  function findLiveHeader() {
    const candidates = [...document.querySelectorAll("header")].filter((header) => {
      const text = norm(header.textContent);
      return /combat\s+lv\s*\d+/i.test(text) && /players\s+online\s*:\s*\d+/i.test(text) && /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(text);
    });
    return pickVisible(candidates);
  }
  function directChildContaining(parent, node) {
    if (!parent || !node) return null;
    let cur = node;
    while (cur?.parentElement && cur.parentElement !== parent) cur = cur.parentElement;
    return cur?.parentElement === parent ? cur : null;
  }
  function ensureCrest(region) {
    if (!region) return null;
    let crest = region.querySelector(":scope > .fs-header-crest");
    if (!crest) {
      crest = document.createElement("span");
      crest.className = "fs-header-crest";
      crest.setAttribute("aria-hidden", "true");
      region.prepend(crest);
    }
    return crest;
  }
  function classifyProfile(layout) {
    const name = layout.querySelector("h1.header-player-name, h1");
    const meta = [...layout.querySelectorAll("p,span,div")].find((el) => /combat\s+lv\s*\d+.*zone\s*\d+\s*:/i.test(norm(el.textContent)) && el.childElementCount <= 1);
    const online = [...layout.querySelectorAll("button,p,span,div")].find((el) => /^\s*players\s+online\s*:\s*\d+/i.test(norm(el.textContent)) && el.childElementCount <= 1);
    const profile = name ? name.closest(".min-w-0.overflow-hidden") || directChildContaining(layout, name) : null;
    if (!profile) return { profile: null, region: null };
    setRole4(profile, "profile");
    if (name) setRole4(name, "profile-name");
    if (meta) setRole4(meta, "profile-meta");
    if (online) setRole4(online, "profile-online");
    const brand = [...profile.children].find((el) => /^idleworlds$/i.test(norm(el.textContent)));
    if (brand) setRole4(brand, "brand");
    const children = [...profile.children];
    const nameIndex = name ? children.indexOf(name) : -1;
    const metaIndex = meta ? children.indexOf(meta) : -1;
    if (nameIndex >= 0 && metaIndex > nameIndex + 1) {
      for (let i = nameIndex + 1; i < metaIndex; i += 1) {
        if (norm(children[i].textContent)) {
          setRole4(children[i], "profile-title");
          break;
        }
      }
    }
    let region = profile.parentElement && profile.parentElement !== layout && layout.contains(profile.parentElement) ? profile.parentElement : directChildContaining(layout, profile);
    if (!region || region === layout) region = profile;
    if (region !== profile) setRole4(region, "identity-region");
    if (region) ensureCrest(region);
    return { profile, region };
  }
  function classifyUtilities(layout, region) {
    let utilities = region?.querySelector(":scope > div:has(button.header-icon-btn)") || layout.querySelector("div:has(> button.header-icon-btn)");
    if (!utilities) {
      utilities = [...layout.querySelectorAll("div")].find((div) => {
        const buttons = [...div.children].filter((el) => el.tagName === "BUTTON");
        return buttons.length >= 3 && buttons.length === div.childElementCount && buttons.every((btn) => norm(btn.textContent).length <= 3);
      }) || null;
    }
    if (!utilities) return null;
    setRole4(utilities, "utilities");
    const iconButtons = [...utilities.querySelectorAll("button.header-icon-btn")];
    (iconButtons.length ? iconButtons : [...utilities.querySelectorAll(":scope > button")]).forEach((btn) => setRole4(btn, "utility-button"));
    return utilities;
  }
  function statKind(text) {
    if (/\batk\s*\d+\b.*\bdef\s*\d+\b.*\bhp\s*\d+\b/i.test(text)) return "combat";
    if (/\bboosted\b/i.test(text)) return "boost";
    if (/\b\d+\s*[dhm]\b[^]*\bleft\b/i.test(text)) return "timer";
    if (/^[^\w]*[\d,]+$/.test(text)) return "gold";
    return "other";
  }
  function classifyStatus(layout, region) {
    const statsAnchor = [...layout.querySelectorAll("button,div")].find((el) => /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(norm(el.textContent)) && el.childElementCount <= 1);
    let grid = statsAnchor?.closest(".grid.grid-cols-2") || [...layout.children].find((el) => el !== region && el.querySelector?.(".stat-chip")) || null;
    if (!grid && statsAnchor) {
      let cur = statsAnchor.parentElement;
      for (let depth = 0; cur && cur !== layout && cur !== region && depth < 4; depth += 1, cur = cur.parentElement) {
        const cards = [...cur.children].filter((el) => el.matches?.(".stat-chip,button,div"));
        if (cards.length >= 3 && cards.includes(directChildContaining(cur, statsAnchor))) {
          grid = cur;
          break;
        }
      }
    }
    if (!grid) return null;
    setRole4(grid, "status-grid");
    tagStatusCards(grid);
    return grid;
  }
  function tagStatusCards(grid) {
    [...grid.children].forEach((card, index) => {
      if (!card.matches(".stat-chip,button,div")) return;
      setRole4(card, "status-card");
      const cardIndex = String(index + 1);
      if (card.dataset.iwHeaderCard !== cardIndex) card.dataset.iwHeaderCard = cardIndex;
      const kind = statKind(norm(card.textContent));
      if (card.dataset.iwHeaderStat !== kind) card.dataset.iwHeaderStat = kind;
    });
  }
  var headerResolution = null;
  function headerResolutionValid(entry) {
    return entry.root.isConnected && entry.root.getAttribute(ROLE) === "root" && entry.layout.isConnected && (entry.layout === entry.root || entry.layout.getAttribute(ROLE) === "layout") && (!entry.region || entry.region.isConnected) && (!entry.utilities || entry.utilities.isConnected) && (!entry.grid || entry.grid.isConnected);
  }
  function classifyHeader() {
    if (headerResolution && headerResolutionValid(headerResolution)) {
      if (headerResolution.grid) tagStatusCards(headerResolution.grid);
      return;
    }
    const root = findLiveHeader();
    if (!root) {
      headerResolution = null;
      return;
    }
    setRole4(root, "root");
    applyHeaderVars(root);
    if (!root.firstElementChild) {
      headerResolution = null;
      return;
    }
    const layout = root.childElementCount === 1 ? root.firstElementChild : root;
    if (layout !== root) setRole4(layout, "layout");
    const { region } = classifyProfile(layout);
    const utilities = classifyUtilities(layout, region);
    const grid = classifyStatus(layout, region);
    headerResolution = { root, layout, region, utilities, grid };
  }
  function findAnnouncement(nav) {
    if (!nav) return null;
    const shells = [nav.closest(".panel"), nav, nav.parentElement].filter(Boolean);
    for (const shell of shells) {
      let candidate = shell.nextElementSibling;
      while (candidate && candidate.matches("script,style")) candidate = candidate.nextElementSibling;
      if (!candidate) continue;
      const text = norm(candidate.textContent);
      if (!text || text.length > 260 || /zone\s*\d+\s*:/i.test(text)) continue;
      return candidate;
    }
    return null;
  }
  function classifyAdjacent() {
    const nav = pickVisible([...document.querySelectorAll('[data-iw-ui="main-nav"]')]);
    if (nav) applyNavVars(nav);
    const announcement = findAnnouncement(nav);
    if (announcement) {
      setRole4(announcement, "announcement");
      applyAnnouncementVars(announcement);
    }
    const zone = pickVisible([...document.querySelectorAll('[data-iw-ui="zone-bar"]')]);
    if (zone) {
      setRole4(zone, "zone-shell");
      applyZoneVars(zone);
    }
  }
  function reconcile() {
    guard("header:root", classifyHeader);
    guard("header:adjacent", classifyAdjacent);
    guard("header:zone-surface", () => applyZoneSurface(headerResolution?.root));
    guard("header:zone-theme", applyZoneTheme);
  }
  function queueReconcile() {
    if (queued2) return;
    queued2 = true;
    raf(() => {
      queued2 = false;
      reconcile();
    });
  }
  function clearHeaderRenderer() {
    headerResolution = null;
    delete document.documentElement.dataset.iwZoneTheme;
    document.querySelectorAll(`[${ROLE}]`).forEach((el) => {
      el.removeAttribute(ROLE);
      delete el.dataset.iwHeaderCard;
      delete el.dataset.iwHeaderStat;
      delete el.dataset.iwZone;
    });
    document.querySelectorAll(".fs-header-crest").forEach((el) => el.remove());
    document.querySelectorAll("*").forEach((el) => {
      ASSET_VARS.forEach((name) => el.style?.removeProperty(name));
    });
  }
  function initHeaderRenderer() {
    inject("header", header_default);
    on("iw:dom-flush", queueReconcile);
    queueReconcile();
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

  // src/modules/OverlayFramer.js
  var SCRIM = "scrim";
  var PANEL = "panel";
  var SKIN_OWNED = [
    ".iw-tip",
    "#iw-tip",
    "[data-iw-inventory-root]",
    "[data-iw-ui]",
    "[data-iw-boss]",
    "[data-iw-quest-role]",
    "[data-iw-skill-role]",
    "[data-iw-header]"
  ].join(",");
  var ALREADY_FRAMED = [
    '[data-iw-ui="section-frame"]',
    '[data-iw-inventory-root="1"]',
    ".fs-skills-section-frame",
    ".compact-panel"
  ].join(",");
  var tagged = /* @__PURE__ */ new Set();
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }
  function area(el) {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  }
  function isScrim(el) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed") return false;
    const z = parseInt(cs.zIndex, 10);
    if (!Number.isFinite(z) || z < 20) return false;
    const r = el.getBoundingClientRect();
    const coversW = r.width >= innerWidth * 0.85 && r.left <= innerWidth * 0.15;
    const coversH = r.height >= innerHeight * 0.85 && r.top <= innerHeight * 0.15;
    if (!coversW || !coversH) return false;
    if (!visible(el)) return false;
    if (!el.querySelector("*")) return false;
    const bf = `${cs.backdropFilter || ""} ${cs.webkitBackdropFilter || ""}`;
    if (/blur/.test(bf)) return true;
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || "");
    if (!m) return false;
    const [rr, gg, bb, aa = "1"] = m[1].split(",").map((s) => parseFloat(s));
    const alpha = Number.isFinite(aa) ? aa : 1;
    const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    return alpha >= 0.15 && lum < 90;
  }
  function pickCard(scrim) {
    const panels = [...scrim.querySelectorAll(".panel")].filter(visible);
    if (panels.length) {
      return panels.find((p) => !panels.some((q) => q !== p && p.contains(q))) || panels[0];
    }
    let pool = [...scrim.children].filter(visible);
    for (let depth = 0; depth < 3 && pool.length; depth += 1) {
      pool.sort((a, b) => area(b) - area(a));
      const top = pool[0];
      const r = top.getBoundingClientRect();
      const stillFullscreen = r.width >= innerWidth * 0.97 && r.height >= innerHeight * 0.97;
      if (!stillFullscreen) return top;
      pool = [...top.children].filter(visible);
    }
    return null;
  }
  function tagScrim(scrim) {
    if (scrim.dataset.iwOverlay !== SCRIM) scrim.dataset.iwOverlay = SCRIM;
    tagged.add(scrim);
    const card = pickCard(scrim);
    if (card && !card.closest(SKIN_OWNED) && !card.matches(ALREADY_FRAMED)) {
      if (card.dataset.iwOverlay !== PANEL) card.dataset.iwOverlay = PANEL;
      tagged.add(card);
    }
  }
  function untag(el) {
    if (el.dataset && el.dataset.iwOverlay) delete el.dataset.iwOverlay;
  }
  function frameOverlays() {
    try {
      for (const el of [...tagged]) {
        if (!el.isConnected) {
          tagged.delete(el);
          continue;
        }
        if (el.dataset.iwOverlay === SCRIM && !isScrim(el)) {
          untag(el);
          tagged.delete(el);
        }
      }
      const seen = /* @__PURE__ */ new Set();
      const candidates = document.querySelectorAll(
        '[class*="fixed"],[style*="position: fixed"],[style*="position:fixed"]'
      );
      for (const el of candidates) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.dataset.iwOverlay === SCRIM) continue;
        if (el.closest(SKIN_OWNED)) continue;
        if (isScrim(el)) tagScrim(el);
      }
    } catch (err) {
      warnOnce("overlay:frame", err);
    }
  }
  function clearOverlayFramer() {
    document.querySelectorAll("[data-iw-overlay]").forEach(untag);
    tagged = /* @__PURE__ */ new Set();
  }

  // src/styles/base.css
  var base_default = '@font-face{font-family:"Cinzel";font-style:normal;font-weight:600 700;font-display:swap;src:url(../assets/fonts/cinzel-variable.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:400;font-display:swap;src:url(../assets/fonts/barlow-400.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:500;font-display:swap;src:url(../assets/fonts/barlow-500.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:600;font-display:swap;src:url(../assets/fonts/barlow-600.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:700;font-display:swap;src:url(../assets/fonts/barlow-700.woff2) format("woff2")}@font-face{font-family:"Crimson Text";font-style:italic;font-weight:400;font-display:swap;src:url(../assets/fonts/crimson-text-italic.woff2) format("woff2")}:root{--iw-ink-950: #070806;--iw-ink-900: #0B0C0A;--iw-ink-850: #10100D;--iw-ink-800: #14130F;--iw-ink-750: #191711;--iw-ink-700: #1E1B15;--iw-ink-600: #29251C;--iw-th-accent: #D4AD63;--iw-th-accent-dim: #9D8458;--iw-th-edge: #6B4F28;--iw-th-hairline: #9B7437;--iw-th-hairline-hi: #D09A4B;--iw-th-bracket: #C9A24D;--iw-th-bracket-dim: #8A7038;--iw-th-brass: #8A6A2C;--iw-th-rule: #806337;--iw-th-rule-soft: #3A2F18;--iw-th-plate: #0B0C0E;--iw-th-cta: #B64619;--iw-th-cta-hi: #D15A22;--iw-th-ground-a: #171713;--iw-th-ground-b: #0D0E0C;--iw-th-ground-wash: transparent;--iw-th-glow: rgba(226,164,72,.08);--iw-line: #342D20;--iw-line-hi: #58482B;--iw-line-hot: var(--iw-th-rule);--iw-gold: var(--iw-th-accent);--iw-gold-dim: var(--iw-th-accent-dim);--iw-ember: var(--iw-th-cta);--iw-ember-hi: var(--iw-th-cta-hi);--iw-text: #DDD6C6;--iw-text-hi:#F0E8D6;--iw-dim: #938A79;--iw-faint: #666052;--iw-good: #82B88A;--iw-bad: #D27171;--iw-info: #75A8C8;--iw-t-common: #B9B4A8;--iw-t-uncommon: #6FBF73;--iw-t-rare: #5B9BD5;--iw-t-epic: #B98FE0;--iw-t-legendary: #D98A3A;--iw-t-mythic: #E06666;--iw-font-head: "Cinzel", Georgia, serif;--iw-font-ui: "Barlow", system-ui, -apple-system, sans-serif;--iw-font-flav: "Crimson Text", Georgia, serif;--iw-r-panel: 3px;--iw-r-control: 2px;--iw-r-slot: 2px;--iw-r: var(--iw-r-control);--iw-r-sm: var(--iw-r-slot);--background: var(--iw-ink-900) !important;--foreground: var(--iw-text) !important;--card: var(--iw-ink-800) !important;--card-foreground: var(--iw-text) !important;--popover: var(--iw-ink-800) !important;--popover-foreground: var(--iw-text) !important;--panel-bg: var(--iw-ink-800) !important;--panel-border: var(--iw-line) !important;--surface-bg: var(--iw-ink-700) !important;--surface-border: var(--iw-line) !important;--primary: var(--iw-ember) !important;--primary-foreground: #FFEAD1 !important;--accent: var(--iw-ember) !important;--accent-foreground: var(--iw-text-hi) !important;--ring: var(--iw-gold-dim)!important;--border: var(--iw-line) !important;--input: var(--iw-ink-850) !important;--muted: var(--iw-ink-700) !important;--muted-foreground: var(--iw-dim) !important;--sidebar: var(--iw-ink-800) !important;--sidebar-foreground: var(--iw-text) !important;--sidebar-border: var(--iw-line) !important;--sidebar-accent: var(--iw-ink-700) !important}:root{--iw-zone-atlas: url(../assets/skills_ui_atlas.webp);--iw-corner-filigree: url(../assets/inventory/panel_corners.webp)}:root[data-iw-zone-theme=glacial]{--iw-th-accent: #9FCBE6;--iw-th-accent-dim: #7C9DB4;--iw-th-edge: #45657D;--iw-th-hairline: #6E96B4;--iw-th-hairline-hi: #A7CFE6;--iw-th-bracket: #A9CADE;--iw-th-bracket-dim: #6E8CA0;--iw-th-brass: #5C7E96;--iw-th-rule: #5E86A0;--iw-th-rule-soft: #223540;--iw-th-plate: #0A0E12;--iw-th-cta: #356E9A;--iw-th-cta-hi: #4E90BE;--iw-th-ground-a: #14171A;--iw-th-ground-b: #0B0D10;--iw-th-ground-wash: rgba(126,164,192,.055);--iw-th-glow: rgba(150,200,230,.10)}:root[data-iw-zone-theme=infernal]{--iw-th-accent: #E0762E;--iw-th-accent-dim: #B5673A;--iw-th-edge: #6A2A18;--iw-th-hairline: #8A3B22;--iw-th-hairline-hi: #D6702E;--iw-th-bracket: #D2782E;--iw-th-bracket-dim: #8A4326;--iw-th-brass: #7A3A1E;--iw-th-rule: #7E3A22;--iw-th-rule-soft: #2A1109;--iw-th-plate: #0C0705;--iw-th-cta: #B23A16;--iw-th-cta-hi: #D0602A;--iw-th-ground-a: #17110E;--iw-th-ground-b: #0D0908;--iw-th-ground-wash: rgba(200,80,30,.055);--iw-th-glow: rgba(224,118,46,.11)}:root[data-iw-zone-theme=verdant]{--iw-th-accent: #82BE68;--iw-th-accent-dim: #7C9463;--iw-th-edge: #3B5A2E;--iw-th-hairline: #5E7E44;--iw-th-hairline-hi: #97C57A;--iw-th-bracket: #8FBE6E;--iw-th-bracket-dim: #5E7E44;--iw-th-brass: #4E6A2E;--iw-th-rule: #5E7E44;--iw-th-rule-soft: #202A16;--iw-th-plate: #080B07;--iw-th-cta: #4E7A30;--iw-th-cta-hi: #6A9C42;--iw-th-ground-a: #131711;--iw-th-ground-b: #0A0D08;--iw-th-ground-wash: rgba(126,176,94,.05);--iw-th-glow: rgba(150,200,110,.09)}:root[data-iw-zone-theme=forged-metal]{--iw-th-accent: #A6BBCC;--iw-th-accent-dim: #8593A2;--iw-th-edge: #3E4A57;--iw-th-hairline: #6E8092;--iw-th-hairline-hi: #B7C5CF;--iw-th-bracket: #A6B8C6;--iw-th-bracket-dim: #6E8092;--iw-th-brass: #5A6675;--iw-th-rule: #6E8092;--iw-th-rule-soft: #232A31;--iw-th-plate: #090B0E;--iw-th-cta: #45607A;--iw-th-cta-hi: #5E82A2;--iw-th-ground-a: #14161A;--iw-th-ground-b: #0B0D10;--iw-th-ground-wash: rgba(150,175,200,.045);--iw-th-glow: rgba(180,200,220,.08)}:root[data-iw-zone-theme=celestial]{--iw-th-accent: #E7C87A;--iw-th-accent-dim: #B7A574;--iw-th-edge: #5A5330;--iw-th-hairline: #B99A55;--iw-th-hairline-hi: #EBD08A;--iw-th-bracket: #E2C170;--iw-th-bracket-dim: #9A8340;--iw-th-brass: #7A6A38;--iw-th-rule: #8F7A45;--iw-th-rule-soft: #2A2718;--iw-th-plate: #0A0B0E;--iw-th-cta: #9A6E2E;--iw-th-cta-hi: #C79A4A;--iw-th-ground-a: #16150F;--iw-th-ground-b: #0C0C0A;--iw-th-ground-wash: rgba(200,180,110,.05);--iw-th-glow: rgba(230,200,130,.10)}:root[data-iw-zone-theme=voidborn]{--iw-th-accent: #A97FD8;--iw-th-accent-dim: #8C74A6;--iw-th-edge: #46345C;--iw-th-hairline: #6E4F92;--iw-th-hairline-hi: #B48EDC;--iw-th-bracket: #AE86D6;--iw-th-bracket-dim: #6E4F92;--iw-th-brass: #573C6B;--iw-th-rule: #6E4F92;--iw-th-rule-soft: #251A33;--iw-th-plate: #0A0710;--iw-th-cta: #6A3CAA;--iw-th-cta-hi: #8E63C8;--iw-th-ground-a: #16121C;--iw-th-ground-b: #0C0910;--iw-th-ground-wash: rgba(150,110,210,.055);--iw-th-glow: rgba(169,127,216,.10)}:root[data-iw-zone-theme=runic-arcane]{--iw-th-accent: #5CC6B4;--iw-th-accent-dim: #6E9E96;--iw-th-edge: #234C46;--iw-th-hairline: #3E7E72;--iw-th-hairline-hi: #72B7A9;--iw-th-bracket: #5FC6B2;--iw-th-bracket-dim: #3E7E72;--iw-th-brass: #2E5A52;--iw-th-rule: #3E7E72;--iw-th-rule-soft: #17302C;--iw-th-plate: #070C0B;--iw-th-cta: #26786A;--iw-th-cta-hi: #3E9E8C;--iw-th-ground-a: #101715;--iw-th-ground-b: #080D0C;--iw-th-ground-wash: rgba(90,200,180,.05);--iw-th-glow: rgba(110,200,185,.09)}:root[data-iw-zone-theme=lunar-spectral]{--iw-th-accent: #9FA8D6;--iw-th-accent-dim: #8489AC;--iw-th-edge: #2C3150;--iw-th-hairline: #5A5F86;--iw-th-hairline-hi: #A6ADCD;--iw-th-bracket: #A4ACD6;--iw-th-bracket-dim: #5A5F86;--iw-th-brass: #45496B;--iw-th-rule: #5A5F86;--iw-th-rule-soft: #1E2033;--iw-th-plate: #08090F;--iw-th-cta: #4A4F8A;--iw-th-cta-hi: #6E74AE;--iw-th-ground-a: #14151C;--iw-th-ground-b: #0A0B10;--iw-th-ground-wash: rgba(150,155,210,.05);--iw-th-glow: rgba(159,168,214,.09)}:root[data-iw-zone-theme=tempest-oceanic]{--iw-th-accent: #4FC7D8;--iw-th-accent-dim: #5E9EA8;--iw-th-edge: #123C48;--iw-th-hairline: #2E6E7C;--iw-th-hairline-hi: #6FC0CE;--iw-th-bracket: #52C7D6;--iw-th-bracket-dim: #2E6E7C;--iw-th-brass: #1E5C68;--iw-th-rule: #2E6E7C;--iw-th-rule-soft: #122A31;--iw-th-plate: #060E11;--iw-th-cta: #227483;--iw-th-cta-hi: #3EA6B8;--iw-th-ground-a: #0F171A;--iw-th-ground-b: #070D0F;--iw-th-ground-wash: rgba(80,190,210,.05);--iw-th-glow: rgba(90,200,220,.10)}html,body{background-color:var(--iw-ink-900)!important;color:var(--iw-text)!important;font-family:var(--iw-font-ui)!important}body{background-image:radial-gradient(1200px 520px at 50% -140px,rgba(124,91,42,.10),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.012),transparent 220px)!important;background-attachment:fixed!important}h1,h2,h3{font-family:var(--iw-font-head)!important;letter-spacing:.025em;color:var(--iw-text-hi)!important}.compact-panel,[class~=compact-panel]{background:linear-gradient(180deg,rgba(255,255,255,.018),transparent 48px),var(--iw-ink-800)!important;border-color:var(--iw-line)!important;color:var(--iw-text)!important;border-radius:var(--iw-r-panel)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.018),inset 0 -1px 0 rgba(0,0,0,.42)!important}.compact-row,[class*=item-row]{background-color:var(--iw-ink-800)!important;border-color:var(--iw-line)!important;color:var(--iw-text)!important}[class*=rounded-3xl],[class*=rounded-2xl],[class*=rounded-xl],[class*=rounded-lg],[class*=rounded-md]{border-radius:var(--iw-r-panel)!important}button:not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]),[role=button]:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]){border-radius:var(--iw-r-control)!important}button,[role=button]{background-color:var(--iw-ink-750);color:var(--iw-text)}button:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]),[role=button]:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]),input,select,textarea{font-family:var(--iw-font-ui)!important}button:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-quest-role]),[role=button]:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-quest-role]){box-shadow:inset 0 1px 0 rgba(255,255,255,.028),0 1px 0 rgba(0,0,0,.65)!important;transition:color .12s ease,border-color .12s ease,background-color .12s ease,filter .12s ease!important}button:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):hover:not(:disabled),[role=button]:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):hover{filter:brightness(1.08)}button:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):focus-visible,[role=button]:not(.iw-item-ref):not([class*=chat-name-]):not([data-iw-skill-role=level-progress]):focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--iw-gold)!important;outline-offset:2px!important}input:not([type=checkbox]):not([type=radio]),select,textarea{border-radius:var(--iw-r-control)!important;border-color:var(--iw-line)!important;background:linear-gradient(180deg,#090C0D,#0C0E0D)!important;color:var(--iw-text)!important;box-shadow:inset 0 1px 4px rgba(0,0,0,.7),0 1px 0 rgba(255,255,255,.018)!important}input::placeholder,textarea::placeholder{color:var(--iw-faint)!important}nav button,nav [role=button],header button:not([class*=chat-name-]),[class*=tab] button{border-radius:var(--iw-r-control)!important;font-weight:700!important}hr{border-color:var(--iw-line)!important}.iw-ico{flex:none;display:block;position:relative;background-repeat:no-repeat;background-color:#090806;border:1px solid var(--iw-line-hi);border-radius:var(--iw-r-slot);box-shadow:inset 0 0 0 1px rgba(0,0,0,.45)}.iw-icon-badge{position:absolute;right:-3px;bottom:-3px;font-family:var(--iw-font-ui);font-size:9px;font-weight:700;line-height:1;padding:2px 3px;border-radius:1px;background:var(--iw-ink-950);border:1px solid var(--iw-ember);color:var(--iw-gold);font-variant-numeric:tabular-nums;pointer-events:none;z-index:3}.iw-icon-badge--sprite{right:-5px;bottom:-5px;width:22px;height:22px;padding:0;border:0;border-radius:0;background-color:transparent;color:transparent;font-size:0;line-height:0;filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))}.tier-common{color:var(--iw-t-common)}.tier-uncommon{color:var(--iw-t-uncommon)}.tier-rare{color:var(--iw-t-rare)}.tier-epic{color:var(--iw-t-epic)}.tier-legendary{color:var(--iw-t-legendary)}.tier-mythic{color:var(--iw-t-mythic)}.iw-btn{font-family:var(--iw-font-ui);font-size:12px;font-weight:700;letter-spacing:.055em;text-transform:uppercase;padding:7px 14px;min-width:76px;border-radius:var(--iw-r-control);cursor:pointer;border:1px solid var(--iw-line-hi);background:linear-gradient(180deg,#242018,#17140F);color:var(--iw-text);transition:background .13s,border-color .13s,color .13s;align-self:center;height:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 1px 0 #000}.iw-btn:hover{background:linear-gradient(180deg,#2B261C,#1A1711);border-color:var(--iw-gold-dim);color:var(--iw-gold)}.iw-btn--primary{background:linear-gradient(180deg,var(--iw-th-cta),color-mix(in srgb,var(--iw-th-cta) 60%,#000));border-color:var(--iw-th-cta-hi);color:#FFEAD1}.iw-btn--primary:hover{background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 66%,#000));border-color:var(--iw-ember-hi);color:#fff}.iw-btn--disabled,.iw-btn:disabled{background:#100F0C;border-color:#282218;color:var(--iw-faint);cursor:not-allowed;box-shadow:none}.iw-xp{display:flex;flex-direction:column;gap:4px}.iw-xp__line{display:flex;align-items:baseline;gap:8px;font-size:12px;font-family:var(--iw-font-ui)}.iw-xp__pct{color:var(--iw-gold);font-weight:700;font-variant-numeric:tabular-nums}.iw-xp__togo{margin-left:auto;color:var(--iw-faint);font-variant-numeric:tabular-nums}.iw-xp__track{height:4px;background:#080806;border:1px solid #272117;border-radius:0;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.75)}.iw-xp__fill{height:100%;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-th-cta) 55%,#000),var(--iw-ember));transition:width .3s ease}.iw-xp__fill--ready{background:linear-gradient(90deg,#2E6438,#4D9859)}::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-track{background:var(--iw-ink-950)}::-webkit-scrollbar-thumb{background:#403625;border-radius:1px}::-webkit-scrollbar-thumb:hover{background:var(--iw-line-hi)}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}[class*=rounded-full][class*=px-],button[class*=rounded-full]:not([class*=chat-name-]),[role=button][class*=rounded-full]:not([class*=chat-name-]){border-radius:var(--iw-r-control)!important}[class*=border][class*=rounded-3xl],[class*=border][class*=rounded-2xl],[class*=border][class*=rounded-xl]{border-color:var(--iw-line)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.018),inset 0 -1px 0 rgba(0,0,0,.38)!important}\n';

  // src/styles/overlay.css
  var overlay_default = "[data-iw-overlay=scrim]{background:rgba(7,7,11,0.72)!important;backdrop-filter:blur(3px)!important;-webkit-backdrop-filter:blur(3px)!important}[data-iw-overlay=panel]{isolation:isolate!important;border:1px solid var(--iw-th-edge)!important;border-image:var(--iw-corner-filigree) 95 88 / 22px 20px / 0 stretch!important;border-radius:var(--iw-r-panel, 3px)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,0.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;background-attachment:scroll!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.78),inset 0 1px 0 var(--iw-th-glow),0 12px 40px rgba(0,0,0,0.55)!important}\n";

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
    inject("header", header_default);
    inject("overlay", overlay_default);
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
    guard("init:quest-panel", initQuestPanelRenderer);
    guard("init:ui-foundation", initUIFoundation);
    guard("init:header", initHeaderRenderer);
    on("iw:dom-flush", (e) => {
      const roots = e.detail?.roots || [];
      if (!roots.length) {
        guard("paint:document", () => paintBackground());
      } else {
        guardEach("paint:root", roots, (root) => paintBackground(root));
      }
      guard("frame:overlays", frameOverlays);
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
    guard("teardown:quest-panel", clearQuestPanels);
    guard("teardown:ui-foundation", clearUIFoundation);
    guard("teardown:header", clearHeaderRenderer);
    guard("teardown:background", clearBackgroundPaint);
    guard("teardown:overlay", clearOverlayFramer);
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
