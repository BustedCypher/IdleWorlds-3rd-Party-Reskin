(() => {
  // src/modules/Runtime.js
  var hasChrome = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  var runtimeActive = true;
  function setRuntimeActive(active3) {
    runtimeActive = active3 !== false;
  }
  function isRuntimeActive() {
    return runtimeActive;
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
  function guard(label4, fn) {
    if (!runtimeActive) return false;
    try {
      fn();
      return true;
    } catch (err) {
      warnOnce(`guard:${label4}`, err);
      return false;
    }
  }
  function guardEach(label4, items, fn) {
    if (!runtimeActive) return 0;
    let ok = 0;
    for (const item of items || []) {
      if (guard(label4, () => fn(item))) ok += 1;
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
    document.querySelectorAll("style[data-iw-style]").forEach((el2) => el2.remove());
    _injected.clear();
  }

  // src/modules/HydrationGate.js
  var HYDRATION_GATE_ENABLED = true;
  var HYDRATION_ATTR = "data-iw-page-hydrated";
  var TIMEOUT_MS = 4e3;
  var POLL_MS = 50;
  function waitForPageHydration({
    enabled: enabled2 = HYDRATION_GATE_ENABLED,
    timeoutMs = TIMEOUT_MS,
    pollMs = POLL_MS,
    root = document.documentElement
  } = {}) {
    if (!enabled2 || !root) return Promise.resolve({ state: "disabled", waitedMs: 0 });
    const started = performance.now();
    return new Promise((resolve2) => {
      const finish = (state) => {
        if (root.hasAttribute(HYDRATION_ATTR)) root.removeAttribute(HYDRATION_ATTR);
        resolve2({ state, waitedMs: Math.round(performance.now() - started) });
      };
      const poll = () => {
        const value = root.getAttribute(HYDRATION_ATTR);
        if (value) return finish(value);
        if (performance.now() - started >= timeoutMs) return finish("timeout");
        setTimeout(poll, pollMs);
      };
      poll();
    });
  }
  function clearHydrationLatch(root = document.documentElement) {
    if (root?.hasAttribute(HYDRATION_ATTR)) root.removeAttribute(HYDRATION_ATTR);
  }

  // src/modules/Viewport.js
  function isRendered(el2) {
    if (!el2?.isConnected) return false;
    if (typeof el2.checkVisibility === "function") return el2.checkVisibility();
    const rect = el2.getBoundingClientRect?.();
    return !!rect && (rect.width > 0 || rect.height > 0);
  }
  function pickRendered(candidates) {
    return candidates.find(isRendered) || candidates[0] || null;
  }
  function preferRendered(candidates) {
    const live2 = candidates.filter(isRendered);
    return live2.length ? live2 : candidates;
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
  function isElement(node2) {
    return !!node2 && node2.nodeType === 1;
  }
  function nearest(el2, selector) {
    if (!isElement(el2)) return null;
    if (el2.matches?.(selector)) return el2;
    return el2.closest?.(selector) || null;
  }
  var skillTypeCache = /* @__PURE__ */ new WeakMap();
  function normaliseSkillSignal(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  var SKILL_IDENTITY_ALIASES = {
    combat: ["combat"],
    mining: ["mining"],
    smithing: ["smithing"],
    gathering: ["gathering", "herbalism", "herb"],
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
    for (const el2 of panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"],div,span,p,strong')) {
      if (el2.closest("button,a")) continue;
      const explicitHeading = /^H[1-4]$/.test(el2.tagName) || /skill-name/i.test(String(el2.className || ""));
      if (!explicitHeading && el2.childElementCount) continue;
      const text = normaliseSkillSignal(el2.textContent).replace(/^[^a-z0-9]+/i, "");
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
    for (const el2 of panel.querySelectorAll("div,span,p,strong")) {
      const text = normaliseSkillSignal(el2.textContent);
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
  function isGuildSurface(panel) {
    if (/^\/guild(?:\/|$)/i.test(location.pathname || "")) return true;
    if (panel.closest(".raid-battle-backdrop")) return true;
    const host = panel.parentElement?.closest(".panel");
    const heading = host?.querySelector("h1,h2,h3");
    return !!heading && /^raid dungeon$/i.test(normaliseSkillSignal(heading.firstElementChild?.textContent || heading.textContent).replace(/^[^a-z0-9]+/i, ""));
  }
  function detectSkillType(panel, precomputed) {
    const { buttonEls, buttons, identities: labels, lockedCopy } = precomputed;
    const actionTexts = buttons.filter(Boolean);
    const hasAction = (...names) => actionTexts.some((text) => names.includes(text));
    const hasTurnInOrSkip = actionTexts.some((text) => /^turn in$/.test(text) || /^skip(?:\s*\(\d+\))?$/.test(text));
    if (hasTurnInOrSkip && [...panel.querySelectorAll("p,div,span")].some((el2) => /^reward\s*:/i.test(el2.textContent.trim()))) {
      return "unknown";
    }
    if (isGuildSurface(panel)) return "unknown";
    if (!buttonEls.length) return "unknown";
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
    if (labels.some((t) => /^(?:gathering|herbalism|herb)(?:\s|$)|^gather(?:\s|$)/.test(t))) return "gathering";
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
  var pendingTextParents = /* @__PURE__ */ new Set();
  var flushQueued = false;
  function addIfConnected(set2, el2) {
    if (isElement(el2)) set2.add(el2);
  }
  function addNameRoot(el2) {
    if (!isElement(el2)) return;
    for (let node2 = el2; node2; node2 = node2.parentElement) {
      if (pendingNameRoots.has(node2)) return;
    }
    pendingNameRoots.add(el2);
  }
  function queueContext(el2, reason = "update", opts = {}) {
    if (!isElement(el2)) return;
    const {
      inventory = true,
      skill = true,
      names = true,
      background = true
    } = opts;
    if (inventory) addIfConnected(pendingInventory, nearest(el2, SEL_INV_ROW));
    if (skill) addIfConnected(pendingSkills, nearest(el2, SEL_SKILL_PANEL));
    if (names) addNameRoot(el2);
    if (background) addIfConnected(pendingBgRoots, el2);
    scheduleFlush(reason);
  }
  function discover(root, reason = "mount") {
    if (!isElement(root)) return;
    if (root.matches?.(SEL_INV_ROW)) addIfConnected(pendingInventory, root);
    root.querySelectorAll?.(SEL_INV_ROW).forEach((el2) => addIfConnected(pendingInventory, el2));
    if (root.matches?.(SEL_SKILL_PANEL)) addIfConnected(pendingSkills, root);
    root.querySelectorAll?.(SEL_SKILL_PANEL).forEach((el2) => addIfConnected(pendingSkills, el2));
    addNameRoot(root);
    addIfConnected(pendingBgRoots, root);
    scheduleFlush(reason);
  }
  function scheduleFlush() {
    if (flushQueued) return;
    flushQueued = true;
    raf(flushPending);
  }
  function takeConnected(set2) {
    for (const el2 of set2) {
      set2.delete(el2);
      if (el2?.isConnected) return el2;
    }
    return null;
  }
  function takeNameRoot(set2, taken) {
    for (const el2 of set2) {
      set2.delete(el2);
      if (!el2?.isConnected) continue;
      let covered = false;
      for (let node2 = el2.parentElement; node2 && !covered; node2 = node2.parentElement) {
        covered = set2.has(node2) || taken.has(node2);
      }
      if (!covered) return el2;
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
    const takenNameRoots = /* @__PURE__ */ new Set();
    let cursor = 0, idle = 0, remaining = budget;
    while (remaining > 0 && idle < groups.length) {
      const [key, set2] = groups[cursor];
      cursor = (cursor + 1) % groups.length;
      let el2;
      if (set2 === pendingNameRoots) {
        el2 = takeNameRoot(set2, takenNameRoots);
        if (el2) takenNameRoots.add(el2);
      } else {
        el2 = takeConnected(set2);
      }
      if (el2) {
        out[key].push(el2);
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
    if (pendingTextParents.size) {
      const parents = [...pendingTextParents].filter((el2) => el2.isConnected);
      pendingTextParents.clear();
      if (parents.length) guard("emit:text-flush", () => emit("iw:text-flush", { parents }));
    }
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
          if (isElement(m.target)) queueContext(m.target, "children", {
            // A native text-only replacement can remove our decorative button
            // layers. Notify the existing global reconciliation path for these
            // controls even when no new element was mounted to discover below.
            background: !!nearest(m.target, "[data-iw-compact-button]"),
            names: false
          });
          for (const n of m.addedNodes) {
            if (isElement(n)) discover(n, "mount");
            else if (n.nodeType === 3 && n.parentElement) {
              pendingTextParents.add(n.parentElement);
              queueContext(n.parentElement, "text", { background: false });
            }
          }
        } else if (m.type === "characterData") {
          if (m.target.parentElement) {
            pendingTextParents.add(m.target.parentElement);
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
      attributeFilter: ["class", "style", "disabled", "aria-disabled", "aria-pressed", "aria-selected", "aria-current", "data-state"]
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
    pendingTextParents.clear();
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
  function setAttr(el2, name, value) {
    if (el2.getAttribute(name) !== value) el2.setAttribute(name, value);
  }
  var pendingBadgeHosts = /* @__PURE__ */ new Set();
  var badgeHostCheckQueued = false;
  function positionBadgeHost(hostEl) {
    if (typeof getComputedStyle !== "function") return;
    const inline = hostEl.style.position;
    if (inline && inline !== "static") return;
    pendingBadgeHosts.add(hostEl);
    if (badgeHostCheckQueued) return;
    badgeHostCheckQueued = true;
    queueMicrotask(() => {
      badgeHostCheckQueued = false;
      const hosts = [...pendingBadgeHosts];
      pendingBadgeHosts.clear();
      const unpositioned = hosts.filter((h) => h.isConnected && getComputedStyle(h).position === "static");
      for (const h of unpositioned) h.style.position = "relative";
    });
  }
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
      for (const icon2 of manifest.icons) {
        const key = normalise(icon2.name);
        if (key) this._gearByName.set(key, icon2);
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
      const { atlas, entry: entry2, badge } = result;
      this._applySprite(hostEl, atlas, entry2);
      if (hostEl.dataset.iwAtlas !== atlas) hostEl.dataset.iwAtlas = atlas;
      if (badge) this._paintBadge(hostEl, badge);
      else this._clearBadge(hostEl);
      return true;
    }
    /** Paint one manifest/index entry from either atlas into any sized element. */
    _applySprite(el2, atlas, entry2) {
      const isGear = atlas === "gear";
      const atlasUrl = isGear ? GEAR_ATLAS_URL : ITEM_ATLAS_URL;
      const dims = isGear ? this._gearDims : this._itemDims;
      const cell = dims.cell;
      const atlasW = dims.cols * cell;
      const atlasH = dims.rows * cell;
      const x = Number(entry2.x) || 0;
      const y = Number(entry2.y) || 0;
      const w = Number(entry2.width) || cell;
      const h = Number(entry2.height) || cell;
      const xPct = atlasW > w ? x / (atlasW - w) * 100 : 0;
      const yPct = atlasH > h ? y / (atlasH - h) * 100 : 0;
      el2.style.backgroundImage = `url("${atlasUrl}")`;
      el2.style.backgroundSize = `${atlasW / w * 100}% ${atlasH / h * 100}%`;
      el2.style.backgroundPosition = `${xPct.toFixed(6)}% ${yPct.toFixed(6)}%`;
      el2.style.backgroundRepeat = "no-repeat";
    }
    /**
     * Paint the dedicated gear-atlas enhancement art. The current manifest keeps
     * +1, +2, +3 and +4 at indexes 0..3. Name lookup remains authoritative so
     * sprite coordinates can move without hard-coded atlas math in the renderer.
     * A text chip is retained only for a future enhancement level with no art.
     */
    _paintBadge(hostEl, level) {
      positionBadgeHost(hostEl);
      let badgeEl = hostEl.querySelector(".iw-icon-badge");
      if (!badgeEl) {
        badgeEl = document.createElement("span");
        hostEl.appendChild(badgeEl);
      }
      const entry2 = this._gearByName ? this._gearByName.get(normalise(`+${level}`)) : null;
      if (entry2) {
        if (badgeEl.className !== "iw-icon-badge iw-icon-badge--sprite") badgeEl.className = "iw-icon-badge iw-icon-badge--sprite";
        if (badgeEl.firstChild) badgeEl.textContent = "";
        setAttr(badgeEl, "aria-hidden", "true");
        setAttr(badgeEl, "data-iw-badge", String(level));
        this._applySprite(badgeEl, "gear", entry2);
        return;
      }
      if (badgeEl.className !== "iw-icon-badge") badgeEl.className = "iw-icon-badge";
      if (badgeEl.hasAttribute("aria-hidden")) badgeEl.removeAttribute("aria-hidden");
      setAttr(badgeEl, "data-iw-badge", String(level));
      badgeEl.style.removeProperty("background-image");
      badgeEl.style.removeProperty("background-size");
      badgeEl.style.removeProperty("background-position");
      badgeEl.style.removeProperty("background-repeat");
      if (badgeEl.textContent !== `+${level}`) badgeEl.textContent = `+${level}`;
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
  var CHECKED_KEY = "iw-item-db-cache-checked";
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
  function responseValidator(res) {
    const header = (name) => res.headers?.get?.(name) || "";
    const value = `${header("etag")}|${header("last-modified")}`;
    return value === "|" ? null : value;
  }
  var _ItemDatabase = class {
    constructor() {
      this._items = null;
      this._byId = null;
      this._byName = null;
      this._generatedAt = null;
      this._validator = null;
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
        this._index(cached.items, cached.generatedAt, "cache", cached.validator);
        this._refreshOnce().catch((err) => {
          console.warn("[ItemDatabase] Background refresh failed:", err.message);
        });
        return;
      }
      if (cached && cached.stale) {
        this._index(cached.items, cached.generatedAt, "stale-cache", cached.validator);
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
      const res = await fetch(API_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`items.json fetch failed: ${res.status}`);
      const validator = responseValidator(res);
      if (this.isReady() && validator && validator === this._validator) {
        this._source = "network";
        res.body?.cancel?.().catch?.(() => {
        });
        this._markCacheChecked();
        return;
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("items.json returned no item records");
      }
      if (this.isReady() && data.generatedAt && data.generatedAt === this._generatedAt) {
        this._source = "network";
        if (validator && validator !== this._validator) {
          this._validator = validator;
          this._writeCache(data.items, data.generatedAt, validator);
        } else {
          this._markCacheChecked();
        }
        return;
      }
      this._index(data.items, data.generatedAt, "network", validator);
      this._writeCache(data.items, data.generatedAt, validator);
      console.log(`[ItemDatabase] Loaded ${data.items.length} items (generated ${data.generatedAt})`);
    }
    _index(items, generatedAt, source, validator = null) {
      if (!Array.isArray(items) || items.length === 0) return;
      this._items = items;
      this._generatedAt = generatedAt || null;
      this._validator = validator || null;
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
        const [parsed, checked] = await Promise.all([storageGet(CACHE_KEY), storageGet(CHECKED_KEY)]);
        if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
        const confirmedAt = checked && checked.generatedAt === (parsed.generatedAt ?? null) ? Math.max(Number(parsed.cachedAt || 0), Number(checked.checkedAt || 0)) : Number(parsed.cachedAt || 0);
        const age = Date.now() - confirmedAt;
        const stale = !Number.isFinite(age) || age > CACHE_MAX_AGE_MS;
        if (stale && !allowStale) return null;
        return { ...parsed, stale };
      } catch (e) {
        return null;
      }
    }
    _writeCache(items, generatedAt, validator = null) {
      storageSet(CACHE_KEY, { items, generatedAt, validator, cachedAt: Date.now() }).then((ok) => {
        if (!ok) warnOnce("itemdb:cache-write", new Error("cache write rejected"));
      });
    }
    _markCacheChecked() {
      storageSet(CHECKED_KEY, { generatedAt: this._generatedAt, checkedAt: Date.now() }).then((ok) => {
        if (!ok) warnOnce("itemdb:cache-check-write", new Error("cache check write rejected"));
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
    const context2 = [tier, slot].filter(Boolean).join(" · ");
    if (context2) chips.push({ text: context2, kind: "tier" });
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
  var tooltip_engine_default = '.iw-item-ref{display:inline;background:none!important;border:0!important;border-bottom:1px solid transparent!important;border-radius:0!important;padding:0!important;margin:0!important;box-shadow:none!important;font:inherit!important;line-height:inherit!important;font-weight:700!important;letter-spacing:inherit!important;text-transform:none!important;color:var(--iw-gold);cursor:help;text-decoration:none;transition:border-color .12s,color .12s;vertical-align:baseline}.iw-item-ref:hover,.iw-item-ref:focus-visible{color:var(--iw-gold);border-bottom-color:var(--iw-gold-dim)!important}.iw-item-ref:focus-visible{outline:1px solid var(--iw-gold)!important;outline-offset:2px!important}.iw-item-info{display:none}.iw-tip{--fs-tip-w: 330px;--fs-tip-pad-x: 12px;--fs-tip-art: 64px;--fs-tip-corner-h: 20px;--fs-tip-corner-w: 18px;position:fixed;z-index:99999;width:var(--fs-tip-w);max-width:calc(100vw - 20px);box-sizing:border-box;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%);background-blend-mode:normal,normal,soft-light,normal;border:1px solid var(--iw-th-edge);border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 16px 40px rgba(0,0,0,.82);max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);flex-direction:column;overflow:hidden;overscroll-behavior:contain;font-family:var(--iw-font-ui);font-size:12px;line-height:1.38;color:var(--iw-text);opacity:0;pointer-events:none;transition:none}.iw-tip::before{content:"";position:absolute;z-index:2;left:12px;right:12px;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent);opacity:.78;pointer-events:none}.iw-tip::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-style:solid;border-width:var(--fs-tip-corner-h) var(--fs-tip-corner-w);border-color:transparent;border-image:var(--iw-corner-filigree) 50% / var(--fs-tip-corner-h) var(--fs-tip-corner-w) / 0 stretch}.iw-tip>*{position:relative;z-index:1}.iw-tip.is-open{opacity:1;pointer-events:auto}.iw-tip:focus-visible{outline:2px solid var(--iw-gold);outline-offset:-3px}.iw-tip-head{position:relative;flex:none;display:flex;align-items:center;gap:10px;padding:9px var(--fs-tip-pad-x);box-sizing:border-box;background:linear-gradient(180deg,rgba(255,255,255,.030),rgba(0,0,0,.20));border-bottom:1px solid var(--iw-th-edge-soft)}.iw-tip-title-block{flex:1 1 auto;min-width:0}.iw-tip-name{font-family:var(--iw-font-head);font-size:15px;font-weight:700;line-height:1.18;letter-spacing:.012em;word-break:break-word;text-shadow:0 1px 0 #000}.iw-tip-art{flex:none;width:var(--fs-tip-art);height:var(--fs-tip-art);box-sizing:border-box;display:grid;place-items:center;padding:8px;background-color:#080806;border:1px solid var(--iw-th-edge-mid);border-radius:var(--iw-r-slot, 2px);box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),0 0 8px -2px rgba(212,173,99,.22);overflow:visible;pointer-events:none}.iw-tip-art-host,.iw-tip-art-fallback{--fs-tip-art-inner: calc(var(--fs-tip-art) - 18px);position:relative;display:block;width:var(--fs-tip-art-inner);height:var(--fs-tip-art-inner);min-width:var(--fs-tip-art-inner);min-height:var(--fs-tip-art-inner);max-width:var(--fs-tip-art-inner);max-height:var(--fs-tip-art-inner);background-repeat:no-repeat}.iw-tip-art-fallback{display:grid;place-items:center;font-size:24px;opacity:.35}.iw-tip-close{flex:none;width:22px;height:22px;display:grid;place-items:center;padding:0!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:var(--iw-r-control, 2px)!important;background-color:rgba(12,11,9,.88)!important;color:#C8BFAE!important;font:700 15px/1 var(--iw-font-ui)!important;cursor:pointer}.iw-tip-close:hover,.iw-tip-close:focus-visible{border-color:var(--iw-gold)!important;color:var(--iw-text-hi)!important;outline:1px solid var(--iw-gold)!important}.iw-tip-badges{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px}.iw-tip-badge{font-size:9.5px;font-weight:600;line-height:1.1;letter-spacing:.02em;white-space:nowrap;padding:3px 6px;border:1px solid var(--iw-th-edge-soft);border-radius:var(--iw-r-control, 2px);background:linear-gradient(180deg,#14130F,#0C0B09);color:#B9B2A3}.iw-tip-badge.t{color:#AFC8F3;border-color:rgba(91,155,213,.42)}.iw-tip-badge.req{color:#E6A05B;border-color:rgba(217,138,58,.44)}.iw-tip-body{flex:1 1 auto;min-height:0;padding:9px var(--fs-tip-pad-x) 10px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}.iw-tip-sec{margin-top:9px;padding-top:8px;border-top:1px solid var(--iw-th-edge-soft)}.iw-tip-sec:first-child{margin-top:0;padding-top:0;border-top:0}.iw-tip-sec-title{font-family:var(--iw-font-head);font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--iw-gold-dim);margin-bottom:5px}.iw-tip-effect{color:#C4BDAF;font-size:12px;line-height:1.4}.iw-tip-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px 14px}.iw-tip-stats:not(:has(>:nth-child(2))){grid-template-columns:minmax(0,1fr)}.iw-tip-stat-block{min-width:0}.iw-tip-stat{min-width:0;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11.5px;padding:1px 0}.iw-tip-stat .k{min-width:0;color:#AAA394;white-space:nowrap}.iw-tip-stat .v{flex:none;font-family:var(--iw-font-head);font-size:11.5px;color:var(--iw-text-hi);font-weight:700;text-align:right;font-variant-numeric:tabular-nums}.iw-tip-stat .v.amber{color:#E19A50}.iw-tip-stat .v.good{color:var(--iw-good)}.iw-tip-stat-note{margin-top:1px;color:var(--iw-faint);font-size:9px;line-height:1.25}.iw-tip-acq{position:relative;padding:1px 0 1px 9px}.iw-tip-acq::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:#5878AC}.iw-tip-acq-main{font-size:12px;font-weight:600;color:var(--iw-text-hi)}.iw-tip-acq-sub{font-size:11px;color:#8F899C;margin-top:2px;line-height:1.35}.iw-tip-acq.is-unknown .iw-tip-acq-main{color:var(--iw-faint);font-style:italic}.iw-tip-flavour{font-family:var(--iw-font-flav);font-style:italic;font-size:12px;color:var(--iw-gold-dim);line-height:1.45}.iw-tip-foot{flex:none;min-height:30px;padding:6px var(--fs-tip-pad-x);border-top:1px solid var(--iw-th-edge-soft);background:rgba(0,0,0,.30);display:flex;align-items:center;justify-content:space-between;gap:10px}.iw-tip-foot:empty{display:none}.iw-tip-link{font-size:11px;font-weight:700;letter-spacing:.02em;color:#70A1EE;text-decoration:none}.iw-tip-link:hover{color:#9FC0F3}.iw-tip-link:focus-visible{color:#BBD2F5;outline:1px solid #70A1EE;outline-offset:3px}.iw-tip-source{margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.04em;color:#B07846;text-transform:lowercase}.iw-tip-source.is-stale{color:#D58A52}@media(max-width:420px){.iw-tip{--fs-tip-w: calc(100vw - 20px);--fs-tip-pad-x: 11px;--fs-tip-art: 56px;--fs-tip-corner-h: 17px;--fs-tip-corner-w: 15px}.iw-tip-stats{grid-template-columns:1fr}}\n';

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
  var tooltipItems = /* @__PURE__ */ new WeakMap();
  function registerTooltipItem(anchor2, item) {
    tooltipItems.set(anchor2, item);
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
      const fallback2 = skill.toLowerCase() === "any" ? `Requires Lv ${item.req_level} (any skill)` : `Requires ${skill || "skill"} Lv ${item.req_level}`;
      badges.push(`<span class="iw-tip-badge req">${esc(fallback2)}</span>`);
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
  function position(anchor2) {
    const rect = anchor2.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el2 = STATE.el;
    el2.style.visibility = "hidden";
    el2.style.display = "flex";
    const tw = el2.offsetWidth;
    const th = el2.offsetHeight;
    let x = rect.left;
    let y = rect.bottom + EDGE_GAP;
    if (y + th + EDGE_MARGIN > vh) {
      y = rect.top - th - EDGE_GAP;
    }
    if (x + tw + EDGE_MARGIN > vw) x = vw - tw - EDGE_MARGIN;
    if (x < EDGE_MARGIN) x = EDGE_MARGIN;
    if (y < EDGE_MARGIN) y = EDGE_MARGIN;
    el2.style.left = `${x}px`;
    el2.style.top = `${y}px`;
    el2.style.visibility = "visible";
  }
  function clearShowTimer() {
    if (STATE.showTimer) clearTimeout(STATE.showTimer);
    STATE.showTimer = null;
  }
  function isOpen() {
    return !!STATE.el?.classList.contains("is-open");
  }
  function nodeInside(root, node2) {
    return !!(root && node2 && (node2 === root || typeof root.contains === "function" && root.contains(node2)));
  }
  var TRIGGER_SELECTOR = [
    ".iw-item-ref[data-iw-item]",
    ".iw-item-ref[data-iw-item-name]",
    '[data-iw-tooltip-trigger="1"][data-iw-item]',
    '[data-iw-tooltip-trigger="1"][data-iw-item-name]'
  ].join(", ");
  function findTrigger(node2) {
    return node2 && node2.closest ? node2.closest(TRIGGER_SELECTOR) : null;
  }
  function isVirtual(anchor2) {
    return !!(anchor2 && anchor2.__virtual);
  }
  function anchorContainsPointer() {
    if (!isVirtual(STATE.anchor)) return false;
    if (STATE.pointerX == null || STATE.pointerY == null) return false;
    const r = STATE.anchor.getBoundingClientRect();
    if (!r) return false;
    return STATE.pointerX >= r.left && STATE.pointerX <= r.right && STATE.pointerY >= r.top && STATE.pointerY <= r.bottom;
  }
  function activeSurfaceForNode(node2) {
    if (STATE.el && node2 && nodeInside(STATE.el, node2)) return "tooltip";
    if (isVirtual(STATE.anchor)) return anchorContainsPointer() ? "anchor" : null;
    if (!node2) return null;
    if (STATE.anchor && nodeInside(STATE.anchor, node2)) return "anchor";
    return null;
  }
  function pointerNode() {
    if (STATE.pointerX == null || STATE.pointerY == null) return null;
    return document.elementFromPoint(STATE.pointerX, STATE.pointerY);
  }
  function pointerIsOnActiveSurface() {
    return !!activeSurfaceForNode(pointerNode());
  }
  function cleanupAnchor(anchor2) {
    if (!anchor2 || isVirtual(anchor2)) return;
    anchor2.removeAttribute("aria-describedby");
    anchor2.setAttribute("aria-expanded", "false");
  }
  function show(anchor2, { keyboard = false } = {}) {
    if (!anchor2?.isConnected) return;
    const item = isVirtual(anchor2) ? anchor2.item : findItem({
      id: anchor2.getAttribute("data-iw-item"),
      name: anchor2.getAttribute("data-iw-item-name")
    }) || tooltipItems.get(anchor2);
    if (!item) return;
    clearShowTimer();
    if (STATE.anchor && STATE.anchor !== anchor2) cleanupAnchor(STATE.anchor);
    const { html, artHost, painted } = renderCard(item);
    STATE.el.innerHTML = html;
    const artSlot = STATE.el.querySelector(".iw-tip-art");
    if (artSlot && painted) {
      artSlot.textContent = "";
      artHost.classList.add("iw-tip-art-painted");
      artSlot.appendChild(artHost);
    }
    STATE.anchor = anchor2;
    STATE.keyboardOwned = keyboard;
    STATE.el.setAttribute("aria-label", `${item.name} item details`);
    if (!isVirtual(anchor2)) {
      anchor2.setAttribute("aria-controls", "iw-tip");
      anchor2.setAttribute("aria-haspopup", "dialog");
      anchor2.setAttribute("aria-expanded", "true");
    }
    position(anchor2);
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
      if (STATE.el.classList.contains("is-open")) STATE.el.classList.remove("is-open");
      STATE.el.style.display = "none";
      STATE.el.style.visibility = "hidden";
    }
    if (STATE.anchor) cleanupAnchor(STATE.anchor);
    STATE.anchor = null;
    STATE.keyboardOwned = false;
  }
  function scheduleShow(anchor2) {
    clearShowTimer();
    STATE.showTimer = setTimeout(() => {
      STATE.showTimer = null;
      if (!anchor2?.isConnected) return;
      if (!isMobile() && !anchor2.matches(":hover")) return;
      show(anchor2);
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
      if (!isMobile() && STATE.anchor) {
        if (isVirtual(STATE.anchor)) {
          STATE.pointerX = e.clientX;
          STATE.pointerY = e.clientY;
          if (anchorContainsPointer()) return;
        } else if (nodeInside(STATE.anchor, e.relatedTarget)) {
          return;
        }
      }
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
      const anchor2 = STATE.anchor;
      const restoreFocus = STATE.keyboardOwned;
      hide();
      if (restoreFocus && anchor2?.focus) anchor2.focus();
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
  function itemRef(nameOrItem, label4, opts = {}) {
    const isObj = nameOrItem && typeof nameOrItem === "object";
    const name = isObj ? nameOrItem.name : String(nameOrItem == null ? "" : nameOrItem);
    const id = isObj ? nameOrItem.item_id : null;
    const text = opts.html != null ? opts.html : esc(label4 != null ? label4 : name);
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
    let node2 = root;
    for (const ch of lowerName) {
      if (!node2.children.has(ch)) node2.children.set(ch, { children: /* @__PURE__ */ new Map(), item: null });
      node2 = node2.children.get(ch);
    }
    node2.item = item;
  }
  function longestMatchAt(root, lowerText, start2) {
    let node2 = root;
    let best = null;
    let i = start2;
    while (i < lowerText.length) {
      const next = node2.children.get(lowerText[i]);
      if (!next) break;
      node2 = next;
      i += 1;
      if (node2.item) {
        const after = lowerText[i];
        if (after === void 0 || !/[a-z0-9]/i.test(after)) {
          best = { length: i - start2, item: node2.item };
        }
      }
    }
    return best;
  }
  var matchIndex = /* @__PURE__ */ new Map();
  function sameMatches(a, b) {
    return a.length === b.length && a.every((m, i) => m.start === b[i].start && m.end === b[i].end && m.item === b[i].item);
  }
  function shouldSkipParent(el2) {
    if (!el2) return true;
    if (SKIP_TAGS.has(el2.tagName)) return true;
    if (el2.closest?.(SKIP_CONTAINERS)) return true;
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
  var registeredRanges = [];
  function queueHighlightRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    raf(() => {
      rebuildQueued = false;
      guard("name-scan:highlight", rebuildHighlight);
    });
  }
  function rangesIntact(node2, entry2) {
    return !!entry2.ranges && entry2.ranges.length === entry2.matches.length && entry2.ranges.every((range, i) => range.startContainer === node2 && range.endContainer === node2 && range.startOffset === entry2.matches[i].start && range.endOffset === entry2.matches[i].end);
  }
  function buildRanges(node2, matches) {
    const len = node2.nodeValue ? node2.nodeValue.length : 0;
    const ranges = [];
    for (const m of matches) {
      if (m.end > len) continue;
      const range = document.createRange();
      try {
        range.setStart(node2, m.start);
        range.setEnd(node2, m.end);
        ranges.push(range);
      } catch (err) {
      }
    }
    return ranges;
  }
  function rebuildHighlight() {
    const ranges = [];
    for (const [node2, entry2] of matchIndex) {
      if (!node2.isConnected) {
        matchIndex.delete(node2);
        continue;
      }
      if (!rangesIntact(node2, entry2)) entry2.ranges = buildRanges(node2, entry2.matches);
      ranges.push(...entry2.ranges);
    }
    if (!supportsHighlight) return;
    if (ranges.length === registeredRanges.length && ranges.every((r, i) => r === registeredRanges[i]) && CSS.highlights.has(HIGHLIGHT_NAME) === ranges.length > 0) return;
    try {
      if (!ranges.length) CSS.highlights.delete(HIGHLIGHT_NAME);
      else CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
      registeredRanges = ranges;
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
  function textPaintedAt(node2, el2) {
    const host = node2.parentElement;
    return !!host && (host === el2 || host.contains(el2));
  }
  function hitInTextNode(node2, x, y, el2) {
    const matches = matchIndex.get(node2)?.matches;
    if (!matches?.length) return null;
    if (!textPaintedAt(node2, el2)) return null;
    const len = node2.nodeValue ? node2.nodeValue.length : 0;
    for (const m of matches) {
      if (m.end > len) continue;
      const range = document.createRange();
      try {
        range.setStart(node2, m.start);
        range.setEnd(node2, m.end);
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
    const el2 = document.elementFromPoint(x, y);
    if (!el2 || shouldSkipParent(el2)) return null;
    const precise = pointTextNode(x, y);
    if (precise && !shouldSkipParent(precise.parentElement)) {
      const hit = hitInTextNode(precise, x, y, el2);
      if (hit) return hit;
    }
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    const add = (node3) => {
      if (node3?.nodeType === 3 && !seen.has(node3) && matchIndex.has(node3)) {
        seen.add(node3);
        candidates.push(node3);
      }
    };
    const walker = document.createTreeWalker(el2, NodeFilter.SHOW_TEXT);
    let node2;
    while (node2 = walker.nextNode()) add(node2);
    let cur = el2;
    for (let depth = 0; cur && depth < 5; depth += 1, cur = cur.parentElement) {
      for (const child of cur.childNodes) add(child);
    }
    for (const candidate of candidates) {
      const hit = hitInTextNode(candidate, x, y, el2);
      if (hit) return hit;
    }
    return null;
  }
  function pointerInsideTooltip(x, y) {
    const el2 = document.elementFromPoint(x, y);
    return !!el2?.closest?.(".iw-tip");
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
    if (root.nodeType === 1 && root.closest?.(SKIP_CONTAINERS)) {
      queueHighlightRebuild();
      return 0;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node3) {
        if (node3.nodeType === 1) {
          return node3.matches(SKIP_CONTAINERS) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        const parent = node3.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let matchedNodes = 0;
    let node2;
    while (node2 = walker.nextNode()) {
      const text = node2.nodeValue;
      if (!text || text.trim().length < MIN_NAME_LENGTH) {
        if (matchIndex.has(node2)) matchIndex.delete(node2);
        continue;
      }
      const matches = findMatches(text, trie);
      if (matches.length) {
        const entry2 = matchIndex.get(node2);
        if (!entry2 || !sameMatches(entry2.matches, matches)) matchIndex.set(node2, { matches, ranges: null });
        matchedNodes += 1;
      } else if (matchIndex.has(node2)) {
        matchIndex.delete(node2);
      }
    }
    queueHighlightRebuild();
    return matchedNodes;
  }
  function clearItemNameScan() {
    matchIndex.clear();
    registeredRanges = [];
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
    function track(el2) {
      if (refByElement.has(el2)) return;
      const ref = weakTracking ? new WeakRef(el2) : el2;
      refByElement.set(el2, ref);
      tracked.add(ref);
      finalizer?.register(el2, ref, ref);
    }
    function untrack(el2) {
      const ref = refByElement.get(el2);
      if (!ref) return;
      tracked.delete(ref);
      finalizer?.unregister(ref);
      refByElement.delete(el2);
    }
    function trackedElements() {
      const live2 = [];
      for (const ref of [...tracked]) {
        const el2 = weakTracking ? ref.deref() : ref;
        if (el2) live2.push(el2);
        else tracked.delete(ref);
      }
      return live2;
    }
    function stateFor(el2, prop) {
      let props = states.get(el2);
      if (!props) {
        props = /* @__PURE__ */ new Map();
        states.set(el2, props);
        track(el2);
      }
      let state = props.get(prop);
      const currentValue = el2.style.getPropertyValue(prop);
      const currentPriority = el2.style.getPropertyPriority(prop);
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
    function set2(el2, prop, value, priority = "important") {
      if (!el2?.style) return false;
      const state = stateFor(el2, prop);
      const beforeValue = el2.style.getPropertyValue(prop);
      const beforePriority = el2.style.getPropertyPriority(prop);
      el2.style.setProperty(prop, value, priority);
      const afterValue = el2.style.getPropertyValue(prop);
      const afterPriority = el2.style.getPropertyPriority(prop);
      state.appliedValue = afterValue;
      state.appliedPriority = afterPriority;
      return beforeValue !== afterValue || beforePriority !== afterPriority;
    }
    function restoreElement(el2) {
      const props = states.get(el2);
      if (!props) return;
      for (const [prop, state] of props) {
        const currentValue = el2.style.getPropertyValue(prop);
        const currentPriority = el2.style.getPropertyPriority(prop);
        const stillOurs = currentValue === state.appliedValue && currentPriority === state.appliedPriority;
        if (!stillOurs) continue;
        if (state.nativeValue) {
          el2.style.setProperty(prop, state.nativeValue, state.nativePriority || "");
        } else {
          el2.style.removeProperty(prop);
        }
      }
      states.delete(el2);
      untrack(el2);
    }
    function restoreWithin(root) {
      if (!root) return;
      for (const el2 of trackedElements()) {
        if (el2 === root || root.contains?.(el2)) restoreElement(el2);
      }
    }
    function restoreAll() {
      for (const el2 of trackedElements()) restoreElement(el2);
    }
    return { set: set2, restoreElement, restoreWithin, restoreAll };
  }

  // src/styles/inventory.css
  var inventory_default = '[data-iw-inventory-root="1"]{--fs-inv-command-w: 54px;overflow:hidden!important}[data-iw-inventory-root="1"]:has([data-iw-overlay=popup]){overflow:visible!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"],[data-iw-salvage-list="1"]{position:relative!important;isolation:isolate!important;margin:2px 0 4px!important;padding:7px 9px!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.7),inset 0 1px 0 var(--iw-th-glow),0 2px 7px rgba(0,0,0,.34)!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]::before,[data-iw-salvage-list="1"]::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:10px!important;right:10px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 16%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 84%,transparent)!important;opacity:.7!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]::after,[data-iw-salvage-list="1"]::after{content:""!important;position:absolute!important;inset:3px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 55%,transparent)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}[data-iw-inventory-root="1"] [data-iw-inventory-list="1"]>*,[data-iw-salvage-list="1"]>*{position:relative;z-index:1}[data-iw-salvage-list="1"]{gap:0!important}[data-iw-salvage-list="1"]>.compact-row:not([data-fs-inv]){border:0!important;border-top:1px solid var(--iw-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}[data-iw-salvage-list="1"]>.compact-row:first-child{border-top:0!important}button.compact-row>.fs-inv-row{cursor:pointer}[data-iw-inventory-title="1"]{font-family:var(--iw-font-head)!important;font-size:var(--iw-frame-title-size, 18px)!important;font-weight:700!important;letter-spacing:.13em!important;text-transform:uppercase!important;color:var(--iw-text-hi)!important;text-shadow:0 0 16px rgba(216,121,31,.20)!important}.fs-inv-rule{position:relative;height:30px;margin:2px 0 16px;pointer-events:none}.fs-inv-rule::before{content:"";position:absolute;left:0;right:0;top:9px;height:1px;background:linear-gradient(90deg,transparent,var(--iw-line-hot) 14%,var(--iw-line-hot) 86%,transparent);opacity:.7}.fs-inv-rule::after{content:"";position:absolute;left:50%;top:9px;width:186px;height:62px;transform:translate(-50%,-50%);background-image:var(--iw-zone-separator);background-repeat:no-repeat;background-size:contain;background-position:center}@media(max-width:560px){.fs-inv-rule::before,.fs-inv-rule::after{top:18px}.fs-inv-rule::after{width:140px;height:47px}}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter],[data-iw-inventory-root="1"] [data-iw-inventory-control=page]{min-height:26px!important;height:26px!important;position:relative!important;top:3px!important;border-radius:2px!important;border:1px solid var(--iw-th-edge-faint)!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important;padding:0 11px!important;font-family:var(--iw-font-head)!important;font-size:10.5px!important;font-weight:600!important;line-height:24px!important;letter-spacing:.09em!important;text-transform:uppercase!important;color:var(--iw-dim)!important}@media(max-width:1279px){[data-iw-inventory-root="1"] [data-iw-inventory-filters="1"]{--iw-filter-gap: 6px;--iw-filter-pad: 11px;--iw-filter-k: 22.5;--iw-filter-fixed: calc(10 * var(--iw-filter-pad) + 4 * var(--iw-filter-gap) + 10px);container:iw-inventory-filters / inline-size;flex-wrap:nowrap!important;column-gap:var(--iw-filter-gap)!important}[data-iw-inventory-root="1"] [data-iw-inventory-filters="1"]>[data-iw-inventory-control=filter]{min-width:0!important;white-space:nowrap!important;padding:0 var(--iw-filter-pad)!important;font-size:clamp(7.5px,calc((100cqi - var(--iw-filter-fixed)) / var(--iw-filter-k)),10.5px)!important}}@media(max-width:767px){[data-iw-inventory-root="1"] [data-iw-inventory-filters="1"]{--iw-filter-pad: 7px;--iw-filter-k: 20.9}[data-iw-inventory-root="1"] [data-iw-inventory-filters="1"]>[data-iw-inventory-control=filter]{flex:1 1 auto!important;letter-spacing:.04em!important}}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter]:hover,[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:hover{color:var(--iw-text)!important;border-color:var(--iw-line-hot)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 0 10px -3px rgba(216,121,31,.35)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:disabled:hover{border-color:var(--iw-th-edge-faint)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=filter][data-iw-inventory-filter-state=active]{color:#F3E3C0!important;border-color:var(--iw-th-cta-hi)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-th-cta) 32%,#000),color-mix(in srgb,var(--iw-th-cta) 12%,#000))!important;box-shadow:inset 0 0 12px -2px color-mix(in srgb,var(--iw-th-cta-hi) 62%,transparent),inset 0 1px 0 rgba(255,216,150,.18),0 0 0 1px color-mix(in srgb,var(--iw-th-cta-hi) 20%,transparent)!important;text-shadow:0 0 8px color-mix(in srgb,var(--iw-th-cta-hi) 48%,transparent)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page]:disabled{opacity:.45!important;color:var(--iw-faint)!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon]{display:grid!important;place-items:center!important;width:30px!important;height:31px!important;min-width:30px!important;min-height:31px!important;padding:0!important;border:0!important;border-radius:0!important;color:var(--iw-gold-dim)!important;background-color:transparent!important;background:var(--iw-zone-atlas) no-repeat!important;background-image:var(--iw-zone-atlas)!important;background-repeat:no-repeat!important;background-size:322.5px 173.63px!important;background-position:-177.38px -2.25px!important;background-repeat:no-repeat!important;box-shadow:none!important;flex:0 0 auto!important;overflow:visible!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon] svg{width:15px!important;height:15px!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=icon]:hover{color:#FFE2AE!important;background-position:-209.63px -2.25px!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=glyph]{width:15px!important;height:15px!important;flex:0 0 auto!important;align-self:center!important;filter:drop-shadow(0 0 5px rgba(216,121,31,.4))!important}[data-iw-inventory-root="1"] [data-iw-inventory-control=page-count]{color:var(--iw-gold-dim)!important;font-family:var(--iw-font-head)!important;font-size:12px!important;font-weight:700!important;font-variant-numeric:tabular-nums;letter-spacing:.14em}.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){display:flex!important;align-items:center!important;gap:0!important;min-height:62px!important;padding:0!important;position:relative!important;overflow:hidden!important;border:0!important;border-top:1px solid var(--iw-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transition:background-color .12s!important}.compact-row:has(>.fs-inv-row):first-child,[class*=item-row]:has(>.fs-inv-row):first-child{border-top:0!important}.compact-row:has(>.fs-inv-row):hover,[class*=item-row]:has(>.fs-inv-row):hover{background:rgba(255,214,140,.022)!important}.fs-inv-row::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-frame) 11%,transparent),transparent 46%)}.compact-row:has(>.fs-inv-row):hover .fs-inv-row::after,[class*=item-row]:has(>.fs-inv-row):hover .fs-inv-row::after{opacity:1}.fs-inv-row{--fs-tier: #8C8578;--fs-frame: var(--fs-tier);order:1;flex:1 1 auto;min-width:0;min-height:60px;box-sizing:border-box;display:grid;grid-template-columns:52px minmax(0,1fr) 38px;grid-template-areas:"icon body qty";align-items:center;column-gap:12px;padding:7px 8px 7px 14px;position:relative;cursor:default}.fs-inv-row.has-details,.fs-inv-row.has-requirements{min-height:68px}.fs-inv-row.has-details.has-requirements{min-height:76px}.fs-inv-row.fs-cat-gear{--fs-tier: #6E9BC4}.fs-inv-row.fs-cat-consumable{--fs-tier: #68B96A}.fs-inv-row.fs-cat-processed{--fs-tier: #A6AEB2}.fs-inv-row.fs-cat-resource{--fs-tier: #9E7B54}.fs-inv-row.fs-cat-trade{--fs-tier: #D4AD63}.fs-inv-row.fs-cat-unknown{--fs-tier: #8C8578}.fs-inv-row.fs-cat-potion{--fs-tier: #CE5C6E}.fs-inv-row.fs-cat-enchant{--fs-tier: #8E7BDB}.fs-inv-row.fs-cat-xpscroll{--fs-tier: #3FB2AC}.fs-inv-row.fs-cat-cache{--fs-tier: #B366C4}.fs-inv-row.fs-inv-orb{--fs-tier: #E0913E}.fs-inv-row::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;background:linear-gradient(180deg,transparent,var(--fs-frame) 18%,var(--fs-frame) 82%,transparent);box-shadow:0 0 8px color-mix(in srgb,var(--fs-frame) 42%,transparent);pointer-events:none}.fs-inv-icon{grid-area:icon;width:52px;height:52px;min-width:52px;min-height:52px;position:relative;background-repeat:no-repeat;background-color:#080806;border:1px solid color-mix(in srgb,var(--fs-frame) 52%,var(--iw-th-edge-soft));border-radius:2px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),inset 0 6px 16px -8px color-mix(in srgb,var(--fs-frame) 55%,transparent),0 0 8px -1px color-mix(in srgb,var(--fs-frame) 38%,transparent);image-rendering:auto;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--iw-faint);overflow:visible;cursor:help;outline:none}.fs-inv-icon:hover,.fs-inv-icon:focus-visible{border-color:var(--fs-frame);box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),inset 0 6px 16px -8px color-mix(in srgb,var(--fs-frame) 70%,transparent),0 0 12px -1px color-mix(in srgb,var(--fs-frame) 60%,transparent)}.fs-inv-row.is-equipped .fs-inv-icon{border-color:#8A6A2C;box-shadow:inset 0 0 0 1px rgba(0,0,0,.62),inset 0 0 14px rgba(0,0,0,.6),0 0 9px -1px rgba(200,120,40,.34)}.fs-inv-body{grid-area:body;min-width:0;max-width:100%;overflow:hidden;align-self:center;padding-block:1px}.fs-inv-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;font-family:var(--iw-font-head);font-size:14px;font-weight:700;line-height:1.22;letter-spacing:.012em;white-space:normal;overflow:hidden;overflow-wrap:anywhere;text-overflow:ellipsis;color:var(--fs-tier);text-shadow:0 1px 0 #000}.fs-inv-name .fs-inv-sub{color:var(--iw-faint);font-family:var(--iw-font-ui);font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase}.fs-inv-name .fs-inv-plus{color:#C6A3E4;font-family:var(--iw-font-ui);font-size:11px;font-weight:700;letter-spacing:.02em;vertical-align:1px}.fs-inv-name-plain{color:var(--iw-text)}.fs-inv-name .iw-item-ref{color:inherit}.fs-inv-name .iw-item-ref:hover,.fs-inv-name .iw-item-ref:focus-visible{border-bottom-color:currentColor}.fs-inv-stats{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:4px;min-height:13px}.fs-stat{position:relative;font-family:var(--iw-font-ui);font-size:11px;line-height:1.25;font-weight:600;color:var(--iw-text);background:none;border:0;border-radius:0;padding:0 8px 0 0;margin-right:8px;font-variant-numeric:tabular-nums;white-space:nowrap}.fs-stat:not(:last-child)::after{content:"";position:absolute;right:0;top:2px;bottom:1px;width:1px;background:#332C1E}.fs-stat--pos{color:var(--iw-good)}.fs-stat--tier{color:var(--iw-dim);font-weight:500}.fs-inv-details,.fs-inv-requirements{display:flex;min-width:0;max-width:100%;overflow:hidden;flex-wrap:wrap;align-items:center;gap:3px 13px;margin-top:3px;font-family:var(--iw-font-ui);font-size:10.5px;line-height:1.25}.fs-inv-detail,.fs-inv-requirement{position:relative;min-width:0;color:var(--iw-dim);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-inv-detail::before,.fs-inv-requirement::before{content:"◆";margin-right:4px;font-size:6px;vertical-align:1px;color:var(--iw-gold-dim)}.fs-inv-detail--loadout{color:#74AFCB}.fs-inv-detail--loadout::before{color:#5D97B3}.fs-inv-detail--socket{color:#C7B56A}.fs-inv-detail--socket::before{color:#73B7D4}.fs-inv-detail--effect{color:#B8C6A2}.fs-inv-detail--effect::before{color:#879A73}.fs-inv-detail--status{color:var(--iw-faint)}.fs-inv-detail--status::before{color:var(--iw-faint)}.fs-inv-detail--set{color:#C8B562}.fs-inv-requirement{color:#D8C76A}.fs-inv-requirement::before{color:#BCA744}.fs-inv-detail-count{margin-left:4px;color:var(--iw-faint);font-variant-numeric:tabular-nums}.fs-inv-qty{grid-area:qty;justify-self:end;align-self:center;min-width:34px;padding-right:2px;text-align:right;font-family:var(--iw-font-head);font-size:12px;font-weight:700;color:var(--iw-gold-dim);font-variant-numeric:tabular-nums;white-space:nowrap}[data-fs-action-host="1"]{display:contents!important;font-size:0!important;line-height:0!important;color:transparent!important}[data-fs-suppressed="1"]{display:none!important}[data-fs-preserved-action=control]{order:2;flex:0 0 auto!important;align-self:center!important;position:relative;z-index:2;margin:0 6px 0 0!important;min-width:0!important;max-width:none!important}button[data-fs-preserved-action=control],a[data-fs-preserved-action=control],[role=button][data-fs-preserved-action=control]{height:26px!important;min-height:26px!important;padding:0 11px!important;border-radius:2px!important;border:1px solid var(--iw-th-edge-faint)!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;color:var(--iw-dim)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),inset 0 -7px 10px -8px rgba(0,0,0,.95)!important;font-family:var(--iw-font-head)!important;font-size:10.5px!important;line-height:24px!important;font-weight:600!important;letter-spacing:.09em!important;text-transform:uppercase!important;white-space:nowrap!important}button[data-fs-preserved-action=control]:hover:not(:disabled),a[data-fs-preserved-action=control]:hover,[role=button][data-fs-preserved-action=control]:hover{color:var(--iw-text)!important;border-color:var(--iw-line-hot)!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 0 10px -3px rgba(216,121,31,.35)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equipped],a[data-fs-preserved-action=control][data-fs-action-kind=equipped],[role=button][data-fs-preserved-action=control][data-fs-action-kind=equipped]{border-color:color-mix(in srgb,var(--iw-good) 44%,var(--iw-th-edge-faint))!important;color:var(--iw-good)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equip],a[data-fs-preserved-action=control][data-fs-action-kind=equip],[role=button][data-fs-preserved-action=control][data-fs-action-kind=equip]{border-color:var(--iw-th-brass)!important;color:#FFE9C4!important}button[data-fs-preserved-action=control][data-fs-action-kind=set],a[data-fs-preserved-action=control][data-fs-action-kind=set],[role=button][data-fs-preserved-action=control][data-fs-action-kind=set]{color:var(--iw-gold)!important}button[data-fs-preserved-action=control][data-fs-action-kind=secondary],a[data-fs-preserved-action=control][data-fs-action-kind=secondary],[role=button][data-fs-preserved-action=control][data-fs-action-kind=secondary]{color:var(--iw-dim)!important}button[data-fs-preserved-action=control][data-fs-action-kind=icon],a[data-fs-preserved-action=control][data-fs-action-kind=icon],[role=button][data-fs-preserved-action=control][data-fs-action-kind=icon]{width:30px!important;min-width:30px!important;padding:0!important;color:var(--iw-faint)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important}button[data-fs-preserved-action=control][data-fs-action-kind=equipped]:hover:not(:disabled){color:var(--iw-good)!important;border-color:var(--iw-good)!important}button[data-fs-preserved-action=control][data-fs-action-kind=equip]:hover:not(:disabled){color:#FFF3DF!important;border-color:var(--iw-th-hairline-hi)!important}button[data-fs-preserved-action=control]:disabled,[role=button][data-fs-preserved-action=control][aria-disabled=true]{opacity:.45!important;color:var(--iw-faint)!important;border-color:var(--iw-th-edge-faint)!important;background:linear-gradient(180deg,#100E0A,#0A0907)!important}@media(max-width:1024px){.fs-inv-row{grid-template-columns:46px minmax(0,1fr) 34px;min-height:56px;padding-left:11px;column-gap:10px}.fs-inv-icon{width:46px;height:46px;min-width:46px;min-height:46px}.fs-inv-stats .fs-stat:nth-child(n+6){display:none}.fs-inv-details{max-height:26px;overflow:hidden}[data-iw-inventory-root="1"]{padding:20px 16px!important}[data-iw-inventory-root="1"]::after{border-width:27px 25px;border-image-width:27px 25px}[data-iw-inventory-title="1"]::after{width:150px}}@media(max-width:768px){.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){flex-wrap:wrap!important;align-items:center!important;padding-bottom:5px!important}.fs-inv-row{flex:1 0 100%;grid-template-columns:42px minmax(0,1fr) 34px;grid-template-areas:"icon body qty"}.fs-inv-icon{width:42px;height:42px;min-width:42px;min-height:42px}.fs-inv-qty{justify-self:end;padding:0 2px 0 0;text-align:right}.fs-inv-stats .fs-stat:nth-child(n+4){display:none}.fs-inv-details,.fs-inv-requirements{display:flex;max-height:none;overflow:visible;gap:2px 8px;font-size:9.5px}.fs-inv-detail,.fs-inv-requirement{white-space:normal;overflow:visible;text-overflow:clip}[data-fs-preserved-action=control]{margin-top:3px!important}button[data-fs-preserved-action=control],a[data-fs-preserved-action=control],[role=button][data-fs-preserved-action=control]{padding-inline:7px!important}[data-iw-inventory-root="1"]{padding:16px 12px!important}[data-iw-inventory-root="1"]::after{border-width:23px 21px;border-image-width:23px 21px}}@media(prefers-reduced-motion:reduce){.compact-row:has(>.fs-inv-row),[class*=item-row]:has(>.fs-inv-row){transition:none!important}}\n';

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
  var INVENTORY_FILTERS_ATTR = "data-iw-inventory-filters";
  var SALVAGE_LIST_ATTR = "data-iw-salvage-list";
  var SALVAGE_TITLE = /^salvaging$/i;
  var filterRows = /* @__PURE__ */ new WeakMap();
  var ROW_SELECTOR = '.compact-row, [class*="item-row"]';
  var NOT_IN_ROW = ':not(.compact-row *):not([class*="item-row"] *):not([data-iw-collapse])';
  var notInRow = (sel) => sel.split(",").map((s) => s.trim() + NOT_IN_ROW).join(", ");
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
  function isInsideNativeControl(el2, row) {
    const control = el2.closest?.(INTERACTIVE_SELECTOR);
    return !!(control && control !== row && row.contains(control));
  }
  function leafTexts(row) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const el2 of row.querySelectorAll("span, div, p")) {
      if (el2.closest(".fs-inv-row") || isInsideNativeControl(el2, row)) continue;
      const nearLeaf = el2.childElementCount > 0 && el2.childElementCount <= 3 && el2.textContent.trim().length <= 120 && !el2.querySelector(INTERACTIVE_SELECTOR) && [...el2.children].every((c) => c.childElementCount === 0);
      if (el2.childElementCount !== 0 && !nearLeaf) continue;
      const text = el2.textContent.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }
  function detailTexts(row, displayName = "") {
    const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d|🎲/i;
    const records = [];
    for (const el2 of row.querySelectorAll("span, div, p, li")) {
      if (el2.closest(".fs-inv-row") || isInsideNativeControl(el2, row)) continue;
      const text = String(el2.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 220 || !interesting.test(text)) continue;
      records.push({ el: el2, text, key: text.toLowerCase() });
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
  function headingIsInventory(el2) {
    return String(el2.textContent || "").trim().toLowerCase() === "inventory";
  }
  function findInventoryRoot(row) {
    let cur = row;
    for (let depth = 0; cur && depth < 10; depth += 1, cur = cur.parentElement) {
      const aria = String(cur.getAttribute?.("aria-label") || "").trim().toLowerCase();
      if (aria === "inventory") return cur;
    }
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, [data-title]")].filter((h) => !h.closest(ROW_SELECTOR) && headingIsInventory(h));
    for (const heading of headings) {
      let node2 = heading.parentElement;
      for (let depth = 0; node2 && depth < 6; depth += 1, node2 = node2.parentElement) {
        if (!node2.querySelector(ROW_SELECTOR)) continue;
        if (node2.contains(row)) return node2;
        break;
      }
    }
    return null;
  }
  function findSalvageRoot(row) {
    let node2 = row.parentElement;
    for (let depth = 0; node2 && depth < 5; depth += 1, node2 = node2.parentElement) {
      if (!node2.classList?.contains("panel")) continue;
      const heading = node2.querySelector(":scope > div > h2, :scope > h2");
      const text = String(heading?.textContent || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
      return SALVAGE_TITLE.test(text) ? node2 : null;
    }
    return null;
  }
  function resolveInventoryContext(row) {
    const controls = [...row.querySelectorAll('button, [role="button"]')].map((el2) => String(el2.textContent || "").trim().toLowerCase()).filter(Boolean);
    const equipShortcut = controls.some((t) => /^(equip|equipped|unequip|list)$/.test(t));
    const root = findInventoryRoot(row);
    if (equipShortcut || root) return { inContext: true, root, salvage: null };
    const salvage = row.tagName === "BUTTON" ? findSalvageRoot(row) : null;
    return { inContext: !!salvage, root: null, salvage };
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
  function setAttr2(el2, name, value) {
    if (el2.getAttribute(name) !== value) el2.setAttribute(name, value);
  }
  var chromeSweptThisFlush = /* @__PURE__ */ new Set();
  var FILTER_LABEL = /^(all|gear|materials|consumables|drops)$/;
  function filterTabRow(buttons, labelOf) {
    const rows = /* @__PURE__ */ new Map();
    for (const button2 of buttons) {
      const label4 = labelOf(button2);
      if (!FILTER_LABEL.test(label4) || !button2.parentElement) continue;
      if (!rows.has(button2.parentElement)) rows.set(button2.parentElement, /* @__PURE__ */ new Set());
      rows.get(button2.parentElement).add(label4);
    }
    let best = null, most = 0;
    for (const [row, labels] of rows) if (labels.size > most) {
      best = row;
      most = labels.size;
    }
    return best;
  }
  function classifyInventoryChromeOnce(root) {
    if (!root || chromeSweptThisFlush.has(root)) return;
    if (!chromeSweptThisFlush.size) queueMicrotask(() => chromeSweptThisFlush.clear());
    chromeSweptThisFlush.add(root);
    classifyInventoryChrome(root);
  }
  function classifyInventoryChrome(root) {
    if (!root) return;
    setAttr2(root, INVENTORY_ROOT_ATTR, "1");
    const titleCandidates = root.querySelectorAll(notInRow("h1, h2, h3, h4, [data-title]"));
    for (const title of titleCandidates) {
      if (headingIsInventory(title)) {
        setAttr2(title, INVENTORY_TITLE_ATTR, "1");
        ensureInventoryRule(root, title);
      }
    }
    const buttons = [...root.querySelectorAll(notInRow('button, a, [role="button"]'))];
    const labelOf = (button2) => String(button2.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    const tabRow = filterTabRow(buttons, labelOf);
    for (const button2 of buttons) {
      const text = labelOf(button2);
      let role2 = "";
      if (FILTER_LABEL.test(text)) {
        if (button2.parentElement === tabRow) role2 = "filter";
      } else if (/^(prev|previous|next)$/.test(text)) role2 = "page";
      else if ((!text || text.length <= 2) && button2.querySelector("svg")) role2 = "icon";
      if (role2) setAttr2(button2, INVENTORY_CONTROL_ATTR, role2);
      if (role2 === "filter") {
        const cls = String(button2.className || "");
        const active3 = button2.getAttribute("aria-selected") === "true" || button2.getAttribute("aria-current") === "page" || button2.dataset?.state === "active" || /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
        if (active3) setAttr2(button2, INVENTORY_FILTER_STATE_ATTR, "active");
        else button2.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
      }
    }
    const previousRow = filterRows.get(root);
    if (previousRow && previousRow !== tabRow) previousRow.removeAttribute(INVENTORY_FILTERS_ATTR);
    if (tabRow && !tabRow.hasAttribute(INVENTORY_FILTERS_ATTR)) tabRow.setAttribute(INVENTORY_FILTERS_ATTR, "1");
    if (tabRow) filterRows.set(root, tabRow);
    else filterRows.delete(root);
    const iconControls = [...root.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}="icon"]`)];
    const toolRows = /* @__PURE__ */ new Set();
    for (const control of iconControls) {
      let node2 = control.parentElement;
      for (let depth = 0; node2 && node2 !== root && depth < 3; depth += 1, node2 = node2.parentElement) {
        if (iconControls.filter((other) => node2.contains(other)).length >= 2) {
          toolRows.add(node2);
          break;
        }
      }
    }
    for (const toolRow of toolRows) {
      for (const child of toolRow.children) {
        if (child.tagName.toLowerCase() !== "svg") continue;
        setAttr2(child, INVENTORY_CONTROL_ATTR, "glyph");
      }
    }
    for (const el2 of root.querySelectorAll(notInRow("span, div, p"))) {
      const text = String(el2.textContent || "").trim();
      if (/^\d+\s*\/\s*\d+$/.test(text)) setAttr2(el2, INVENTORY_CONTROL_ATTR, "page-count");
    }
    classifyRowList(root);
  }
  function classifyRowList(root) {
    const rows = [...root.querySelectorAll(ROW_SELECTOR)];
    const list = rows.length ? rows[0].parentElement : null;
    const ok = list && list !== root && root.contains(list) && rows.every((r) => r.parentElement === list) && // never the wrapper that also holds the title or a pager/filter control
    !list.querySelector(`[${INVENTORY_TITLE_ATTR}], [${INVENTORY_CONTROL_ATTR}]`);
    root.querySelectorAll(`[${INVENTORY_LIST_ATTR}]`).forEach((el2) => {
      if (el2 !== list) el2.removeAttribute(INVENTORY_LIST_ATTR);
    });
    if (ok) setAttr2(list, INVENTORY_LIST_ATTR, "1");
  }
  function classifySalvageList(row, panel) {
    const list = row.parentElement;
    if (list && list !== panel && panel.contains(list)) setAttr2(list, SALVAGE_LIST_ATTR, "1");
  }
  function salvageDetails(row) {
    const details = [];
    for (const span of row.querySelectorAll("p > span")) {
      if (span.closest(".fs-inv-row")) continue;
      for (const part of String(span.textContent || "").split(/[·•]/)) {
        const text = part.trim();
        if (!/^(?:enchanted|socketed)$/i.test(text)) continue;
        details.push({
          text: text[0].toUpperCase() + text.slice(1).toLowerCase(),
          kind: /socket/i.test(text) ? "socket" : "status",
          count: 1
        });
      }
    }
    return { details, requirements: [] };
  }
  function splitLevel(name) {
    const m = String(name || "").match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
    return m ? { base: m[1].trim(), level: m[2] } : { base: name, level: null };
  }
  function isInteractiveHost(el2) {
    return !!(el2.matches?.(INTERACTIVE_SELECTOR) || el2.querySelector?.(INTERACTIVE_SELECTOR));
  }
  function restoreDisplay(el2) {
    displayStyleOwner.restoreElement(el2);
  }
  function suppressDisplayBranch(el2) {
    setAttr2(el2, SUPPRESSED_ATTR, "1");
    el2.removeAttribute(ACTION_ATTR);
    el2.removeAttribute(ACTION_HOST_ATTR);
    displayStyleOwner.set(el2, "display", "none", "");
  }
  function classifyActionControl(el2) {
    const text = String(el2.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (/^equipped$|^unequip$/.test(text)) return "equipped";
    if (/^equip$/.test(text)) return "equip";
    if (/set bonus/.test(text)) return "set";
    if (/^list$|^sell$|^use$|^deposit$|^withdraw$/.test(text)) return "secondary";
    if (/^lock$|^unlock$/.test(text) || !text && el2.querySelector?.("svg")) return "icon";
    return "secondary";
  }
  function preserveInteractiveTree(el2) {
    if (!el2) return;
    if (el2.matches?.(INTERACTIVE_SELECTOR)) {
      setAttr2(el2, ACTION_ATTR, "control");
      setAttr2(el2, ACTION_KIND_ATTR, classifyActionControl(el2));
      el2.removeAttribute(ACTION_HOST_ATTR);
      el2.removeAttribute(SUPPRESSED_ATTR);
      restoreDisplay(el2);
      return;
    }
    if (!isInteractiveHost(el2)) {
      suppressDisplayBranch(el2);
      return;
    }
    setAttr2(el2, ACTION_ATTR, "host");
    setAttr2(el2, ACTION_HOST_ATTR, "1");
    el2.removeAttribute(SUPPRESSED_ATTR);
    restoreDisplay(el2);
    [...el2.children].forEach((child) => preserveInteractiveTree(child));
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
    row.querySelectorAll(`[${HIDDEN_ATTR}], [${ACTION_ATTR}], [${ACTION_HOST_ATTR}], [${SUPPRESSED_ATTR}]`).forEach((el2) => {
      el2.removeAttribute(HIDDEN_ATTR);
      el2.removeAttribute(ACTION_ATTR);
      el2.removeAttribute(ACTION_HOST_ATTR);
      el2.removeAttribute(SUPPRESSED_ATTR);
      el2.removeAttribute(ACTION_KIND_ATTR);
    });
  }
  function clearRenderedRow(row) {
    row.querySelectorAll(":scope > .fs-inv-row").forEach((el2) => el2.remove());
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
    if (AtlasService.isComplete()) {
      apply();
      return;
    }
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
    const kinds = [...row.querySelectorAll(`[${ACTION_ATTR}="control"]`)].map((el2) => el2.getAttribute(ACTION_KIND_ATTR));
    overlay.classList.toggle("is-equipped", kinds.includes("equipped"));
    overlay.classList.toggle("has-set-action", kinds.includes("set"));
  }
  function renderRow(row) {
    if (!row || !row.isConnected) return;
    const cheapSig = cheapSignature(row);
    const cachedContext = contextCache.get(row);
    let inContext, root, salvage;
    const cachedHost = cachedContext && (cachedContext.root || cachedContext.salvage);
    if (cachedContext && sameCheapSignature(cachedContext.sig, cheapSig) && (!cachedHost || cachedHost.isConnected && cachedHost.contains(row))) {
      ({ inContext, root, salvage } = cachedContext);
    } else {
      ({ inContext, root, salvage } = resolveInventoryContext(row));
      contextCache.set(row, { sig: cheapSig, inContext, root, salvage });
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
    classifyInventoryChromeOnce(root);
    if (salvage) classifySalvageList(row, salvage);
    const data = extractRowData(row);
    if (!data.name) {
      scheduleEmptyRetry(row);
      return;
    }
    const item = ItemDatabase.getByName(data.name);
    const detailModel = salvage ? salvageDetails(row) : buildInventoryDetails(data.detailTexts, item, data.name);
    const signature2 = rowSignature(data, item, detailModel);
    const existing = row.querySelector(":scope > .fs-inv-row");
    if (existing && row.getAttribute(RENDERED_ATTR) === signature2) {
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
    row.setAttribute(RENDERED_ATTR, signature2);
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
    chromeSweptThisFlush.clear();
    guardEach(
      "inventory:teardown",
      document.querySelectorAll('.compact-row, [class*="item-row"]'),
      (row) => {
        if (row.querySelector(":scope > .fs-inv-row")) clearRenderedRow(row);
        cheapSignatures.delete(row);
        contextCache.delete(row);
      }
    );
    document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach((el2) => {
      el2.removeAttribute(INVENTORY_ROOT_ATTR);
    });
    document.querySelectorAll(`[${INVENTORY_LIST_ATTR}], [${INVENTORY_FILTERS_ATTR}], [${SALVAGE_LIST_ATTR}]`).forEach((el2) => {
      el2.removeAttribute(INVENTORY_LIST_ATTR);
      el2.removeAttribute(INVENTORY_FILTERS_ATTR);
      el2.removeAttribute(SALVAGE_LIST_ATTR);
    });
    document.querySelectorAll(".fs-inv-rule").forEach((el2) => el2.remove());
    document.querySelectorAll(
      `[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}], [${INVENTORY_FILTER_STATE_ATTR}]`
    ).forEach((el2) => {
      el2.removeAttribute(INVENTORY_CONTROL_ATTR);
      el2.removeAttribute(INVENTORY_TITLE_ATTR);
      el2.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
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

  // assets/skills-ui/buttons/revised-v5/index.json
  var revised_v5_default = {
    version: 5,
    width: 1110,
    height: 723,
    themes: [
      "forged-metal",
      "infernal",
      "glacial",
      "celestial",
      "lunar-spectral",
      "runic-arcane",
      "tempest-oceanic",
      "verdant",
      "voidborn"
    ],
    states: [
      "idle",
      "hover",
      "clicked"
    ],
    entries: [
      {
        key: "chevron-prev-idle",
        x: 12,
        y: 12,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      },
      {
        key: "action-idle",
        x: 159,
        y: 12,
        width: 792,
        height: 225,
        anchor: [
          396,
          112.5
        ]
      },
      {
        key: "chevron-next-idle",
        x: 963,
        y: 12,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      },
      {
        key: "chevron-prev-hover",
        x: 12,
        y: 249,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      },
      {
        key: "action-hover",
        x: 159,
        y: 249,
        width: 792,
        height: 225,
        anchor: [
          396,
          112.5
        ]
      },
      {
        key: "chevron-next-hover",
        x: 963,
        y: 249,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      },
      {
        key: "chevron-prev-clicked",
        x: 12,
        y: 486,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      },
      {
        key: "action-clicked",
        x: 159,
        y: 486,
        width: 792,
        height: 225,
        anchor: [
          396,
          112.5
        ]
      },
      {
        key: "chevron-next-clicked",
        x: 963,
        y: 486,
        width: 135,
        height: 225,
        anchor: [
          67.5,
          112.5
        ]
      }
    ]
  };

  // src/modules/SkillsArtService.js
  var ICON_INDEX_URL = "assets/skills_icons_index.json";
  var UI_INDEX_URL = "assets/skills_ui_index.json";
  var TEXTURE_URL = "assets/skills_panel_texture.webp";
  var NAV_PREV_URL = "assets/skills_nav_prev.svg";
  var NAV_NEXT_URL = "assets/skills_nav_next.svg";
  var REVISED_BUTTON_ROOT = "assets/skills-ui/buttons/revised-v5";
  var BUTTON_ART_KINDS = Object.freeze([
    "action-idle",
    "action-hover",
    "action-clicked",
    "action-secondary-idle",
    "action-secondary-hover",
    "action-secondary-clicked",
    "chevron-prev-idle",
    "chevron-prev-hover",
    "chevron-prev-clicked",
    "chevron-next-idle",
    "chevron-next-hover",
    "chevron-next-clicked"
  ]);
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
  var ACTION_CAP_PX = 60;
  var SLICED_TOKENS = /* @__PURE__ */ new Set(["action-idle", "action-disabled"]);
  var SLICE_VARS = ["cap-size", "cap-l-position", "cap-r-position", "mid-size", "mid-position"];
  var ICON_ALIASES = {
    woodcutting: "gathering",
    construction: "crafting"
  };
  var loadPromise = null;
  var iconIndex = null;
  var uiIndex = null;
  var iconByKey = /* @__PURE__ */ new Map();
  var uiByKey = /* @__PURE__ */ new Map();
  function validateIndex(data, label4) {
    if (!data || !Number.isFinite(data.width) || !Number.isFinite(data.height) || !Array.isArray(data.entries)) {
      throw new Error(`${label4} index is malformed`);
    }
    for (const entry2 of data.entries) {
      if (!entry2?.key || !Number.isFinite(entry2.x) || !Number.isFinite(entry2.y) || !Number.isFinite(entry2.width) || !Number.isFinite(entry2.height)) {
        throw new Error(`${label4} contains a malformed entry`);
      }
    }
    return data;
  }
  async function fetchIndex(path, label4) {
    const response = await fetch(assetUrl(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`${label4} fetch failed: ${response.status}`);
    return validateIndex(await response.json(), label4);
  }
  function spriteGeometry(index, entry2) {
    const xRange = Math.max(1, index.width - entry2.width);
    const yRange = Math.max(1, index.height - entry2.height);
    return {
      image: `url("${assetUrl(`assets/${index.atlas}`)}")`,
      size: `${index.width / entry2.width * 100}% ${index.height / entry2.height * 100}%`,
      position: `${entry2.x / xRange * 100}% ${entry2.y / yRange * 100}%`
    };
  }
  function bandGeometry(index, entry2, offset, width) {
    const xRange = Math.max(1, index.width - width);
    const yRange = Math.max(1, index.height - entry2.height);
    return {
      size: `${index.width / width * 100}% ${index.height / entry2.height * 100}%`,
      position: `${(entry2.x + offset) / xRange * 100}% ${entry2.y / yRange * 100}%`
    };
  }
  function paint(host, index, entry2) {
    if (!host || !index || !entry2) return false;
    const sprite = spriteGeometry(index, entry2);
    host.style.backgroundImage = sprite.image;
    host.style.backgroundSize = sprite.size;
    host.style.backgroundPosition = sprite.position;
    host.style.backgroundRepeat = "no-repeat";
    setData(host, "iwSkillsAtlas", index.atlas);
    setData(host, "iwSkillsAtlasIndex", String(entry2.index ?? ""));
    return true;
  }
  function setVar(panel, name, value) {
    panel.style.setProperty(name, value);
  }
  function setData(el2, key, value) {
    if (el2.dataset[key] !== value) el2.dataset[key] = value;
  }
  function clearThemeVariables(host) {
    if (!host?.style) return;
    for (const kind2 of BUTTON_ART_KINDS) {
      host.style.removeProperty(`--iw-${kind2}`);
      host.style.removeProperty(`--iw-${kind2}-paint`);
    }
    delete host.dataset.iwButtonAtlas;
    delete host.dataset.iwCompactAtlas;
    host.style.removeProperty("--iw-compact-atlas");
  }
  function applyThemeVariables(host, theme) {
    if (!host?.style || !theme || !revised_v5_default.themes.includes(theme)) {
      clearThemeVariables(host);
      return false;
    }
    setData(host, "iwCompactAtlas", "compact-ghost-v3");
    setVar(host, "--iw-compact-atlas", `url("${assetUrl(`assets/skills-ui/buttons/compact-ghost-v3/${theme}.png`)}")`);
    setData(host, "iwButtonAtlas", "revised-v5");
    for (const kind2 of BUTTON_ART_KINDS) {
      const entry2 = revised_v5_default.entries.find((item) => item.key === kind2.replace("action-secondary-", "action-"));
      const image = `url("${assetUrl(`${REVISED_BUTTON_ROOT}/${theme}.png`)}")`;
      const x = 100 * entry2.x / (revised_v5_default.width - entry2.width);
      const y = 100 * entry2.y / (revised_v5_default.height - entry2.height);
      const size = `${100 * revised_v5_default.width / entry2.width}% ${100 * revised_v5_default.height / entry2.height}%`;
      setVar(host, `--iw-${kind2}`, image);
      setVar(host, `--iw-${kind2}-paint`, `transparent ${image} ${x}% ${y}% / ${size} no-repeat`);
    }
    return true;
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
      const entry2 = uiByKey.get(key);
      if (!entry2) continue;
      const sprite = spriteGeometry(uiIndex, entry2);
      setVar(panel, `--fs-ui-${token}-size`, sprite.size);
      setVar(panel, `--fs-ui-${token}-position`, sprite.position);
      if (!SLICED_TOKENS.has(token)) continue;
      const cap = Math.min(ACTION_CAP_PX, Math.floor(entry2.width / 2) - 1);
      const capLeft = bandGeometry(uiIndex, entry2, 0, cap);
      const capRight = bandGeometry(uiIndex, entry2, entry2.width - cap, cap);
      const mid = bandGeometry(uiIndex, entry2, cap, entry2.width - cap * 2);
      setVar(panel, `--fs-ui-${token}-cap-size`, capLeft.size);
      setVar(panel, `--fs-ui-${token}-cap-l-position`, capLeft.position);
      setVar(panel, `--fs-ui-${token}-cap-r-position`, capRight.position);
      setVar(panel, `--fs-ui-${token}-mid-size`, mid.size);
      setVar(panel, `--fs-ui-${token}-mid-position`, mid.position);
      setVar(panel, "--fs-ui-action-cap-ratio", String(cap / entry2.height));
    }
    setData(panel, "iwSkillsUiReady", "1");
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
      if (!SLICED_TOKENS.has(token)) continue;
      for (const suffix of SLICE_VARS) panel.style.removeProperty(`--fs-ui-${token}-${suffix}`);
    }
    panel.style.removeProperty("--fs-ui-action-cap-ratio");
    delete panel.dataset.iwSkillsUiReady;
  }
  async function load() {
    const [icons, ui] = await Promise.all([
      fetchIndex(ICON_INDEX_URL, "Skills icon"),
      fetchIndex(UI_INDEX_URL, "Skills UI")
    ]);
    iconIndex = icons;
    uiIndex = ui;
    iconByKey = new Map(icons.entries.map((entry2) => [entry2.key, entry2]));
    uiByKey = new Map(ui.entries.map((entry2) => [entry2.key, entry2]));
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
      const entry2 = iconByKey.get(key) || iconByKey.get(ICON_ALIASES[key]) || iconByKey.get("generic");
      return paint(host, iconIndex, entry2);
    },
    decoratePanel(panel) {
      return applyUiVariables(panel);
    },
    clearPanel(panel) {
      clearUiVariables(panel);
    },
    applyThemeVariables(host, theme) {
      return applyThemeVariables(host, theme);
    },
    clearThemeVariables(host) {
      clearThemeVariables(host);
    },
    iconEntry(key) {
      return iconByKey.get(key) || iconByKey.get(ICON_ALIASES[key]) || null;
    }
  };

  // src/styles/skillpanel.css
  var skillpanel_default = '.fs-skill--combat{--fs-skill-accent: #B84A20}.fs-skill--mining{--fs-skill-accent: #84919B}.fs-skill--smithing{--fs-skill-accent: #B28A2A}.fs-skill--gathering{--fs-skill-accent: #579A5D}.fs-skill--alchemy{--fs-skill-accent: #9271B2}.fs-skill--jewelcrafting{--fs-skill-accent: #4E9FB8}.fs-skill--spellcrafting{--fs-skill-accent: #8B6FC3}.fs-skill--tailoring{--fs-skill-accent: #A56E86}.fs-skill--woodcutting{--fs-skill-accent: #8B6A3A}.fs-skill--construction{--fs-skill-accent: #5F7F72}.fs-skill--crafting{--fs-skill-accent: #5E8FB7}.fs-skill--fishing{--fs-skill-accent: #478FA8}.fs-skill--locked{--fs-skill-accent: #6A6257}.compact-panel.fs-skill-panel{--fs-forge-bg: linear-gradient(180deg, #100E0A, #0A0907);--fs-forge-line: var(--iw-th-edge-faint);--fs-forge-shadow: inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -7px 10px -8px rgba(0, 0, 0, .95);--fs-forge-ink: var(--iw-text, #DDD6C6);--fs-forge-live-bg: linear-gradient(180deg, #1B150B, #120E07);--fs-forge-live-line: var(--iw-th-brass);--fs-forge-live-tint: var(--fs-skill-accent, #D8791F);--fs-forge-live-shadow: inset 0 0 12px -2px color-mix(in srgb, var(--fs-forge-live-tint) 55%, transparent), inset 0 1px 0 rgba(255, 216, 150, .18), 0 0 0 1px color-mix(in srgb, var(--fs-forge-live-tint) 16%, transparent);--fs-forge-live-ink: #F3E3C0;--fs-forge-live-glow: 0 0 8px color-mix(in srgb, var(--fs-forge-live-tint) 48%, transparent);--fs-forge-hot-line: var(--iw-line-hot, #806337);--fs-forge-hot-ink: var(--iw-text, #DDD6C6);--fs-chev-box: 6px;--fs-chev-stroke: 2px;--fs-chev-ink: calc((var(--fs-chev-box) - var(--fs-chev-stroke)) * 0.3535534);--fs-forge-hot-shadow: inset 0 1px 0 rgba(255, 255, 255, .05), inset 0 0 10px -3px rgba(216, 121, 31, .35)}.compact-panel.fs-skill-panel{position:relative!important;min-height:0!important;margin-bottom:6px!important;padding-top:8px!important;padding-bottom:8px!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 4%,transparent),transparent 28%),linear-gradient(180deg,rgba(255,255,255,.010),transparent 34px),#12110E!important;border:1px solid var(--iw-th-edge-soft)!important;border-left:2px solid var(--fs-skill-accent, var(--iw-line-hi))!important;border-radius:3px!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.012),inset 0 -1px 0 rgba(0,0,0,.44)!important}.compact-panel.fs-skill-panel::before{content:"";position:absolute;z-index:0;pointer-events:none;left:0;top:0;width:64px;height:1px;background:linear-gradient(90deg,var(--iw-gold),var(--iw-line-hot) 62%,transparent);opacity:.78}.compact-panel.fs-skill-panel::after{content:none!important}.fs-skill-wrapper{display:contents!important}.fs-skill-header{display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{display:grid!important;grid-template-columns:96px minmax(0,1fr) 126px!important;grid-template-areas:"identity content commands"!important;gap:0 14px!important;align-items:center!important;padding:8px 12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;min-width:0!important;justify-self:stretch!important}[data-iw-skill-role=identity]{position:relative!important;min-width:78px!important;color:var(--iw-text-hi)!important;font-family:var(--iw-font-ui)!important;font-size:12.5px!important;font-weight:700!important;line-height:1.18!important;letter-spacing:.015em!important;text-shadow:0 1px 0 #000!important}[data-iw-skill-role=identity]::after{content:"";position:absolute;left:0;right:28%;bottom:-5px;height:1px;background:linear-gradient(90deg,var(--fs-skill-accent),transparent);opacity:.34}[data-iw-skill-role=action-title]{color:var(--iw-text-hi)!important;font-family:var(--iw-font-ui)!important;font-size:16.5px!important;line-height:1.1!important;font-weight:700!important;letter-spacing:0!important;text-shadow:0 1px 0 #000!important}[data-iw-skill-role=level-progress]{display:block!important;width:auto!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;margin:3px 0 0!important;padding:0!important;color:#B7AF9F!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.2!important;font-weight:600!important;font-variant-numeric:tabular-nums!important;letter-spacing:.01em!important;text-transform:none!important;border:0!important;outline:0!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important}[data-iw-skill-role=xp-gain]{display:inline-block!important;margin-top:2px!important;color:var(--iw-gold-dim)!important;font-size:10.5px!important;line-height:1.15!important;font-weight:700!important;font-variant-numeric:tabular-nums!important}[data-iw-skill-role=requirement]{margin-top:2px!important;color:#AAA291!important;font-size:10.8px!important;line-height:1.15!important;font-weight:600!important}[data-iw-skill-role=requirement][data-iw-req-state=unmet],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement][data-iw-req-state=unmet]{color:#D58282!important}[data-iw-skill-role=reward]{margin-top:2px!important;color:#AAA291!important;font-size:10.8px!important;line-height:1.15!important}[data-iw-skill-role=action-detail]{margin-top:3px!important;color:#C7C0B2!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.2!important;font-weight:500!important;letter-spacing:0!important}[data-iw-skill-role=ingredient]{display:inline-flex!important;align-items:baseline!important;gap:5px!important;margin-top:3px!important;padding:0!important;color:var(--iw-dim)!important;border:0!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important}.compact-panel.fs-skill-panel .iw-item-ref{color:#C9B17A!important;font-weight:700!important;letter-spacing:.015em!important;text-transform:uppercase!important;border-bottom-color:rgba(201,177,122,.20)!important}[data-iw-skill-role=progress-track]{height:4px!important;min-height:4px!important;max-height:4px!important;margin-top:5px!important;overflow:hidden!important;border:1px solid var(--iw-th-edge-faint)!important;border-radius:0!important;background:#080806!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.80)!important}[data-iw-skill-role=progress-fill]{height:100%!important;border-radius:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 68%,#5F2914),var(--fs-skill-accent))!important;box-shadow:none!important}.compact-panel.fs-skill-panel [data-iw-readout]::before,.compact-panel.fs-skill-panel [data-iw-readout]::after{content:none!important;display:none!important;border:0!important;background:none!important;box-shadow:none!important}[data-iw-readout],[data-iw-ingr]{width:auto!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;max-height:none!important;margin:0!important;background:transparent!important;background-color:transparent!important;background-image:none!important;border:0!important;border-radius:0!important;outline:0!important;padding:0!important;box-shadow:none!important;cursor:default!important}.compact-panel.fs-skill-panel [data-iw-readout]{color:#B7AF9F!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.18!important;font-weight:600!important;letter-spacing:.01em!important;text-transform:none!important}.compact-panel.fs-skill-panel [data-iw-skill-role=level-progress]{margin-top:2px!important}[data-iw-skill-role=nav-group]{display:inline-flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important}.compact-panel.fs-skill-panel button:not([data-iw-skill-role=level-progress]){align-self:center!important;border-radius:2px!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button]{width:30px!important;min-width:30px!important;height:30px!important;min-height:30px!important;padding:0!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]{width:96px!important;min-width:96px!important;height:34px!important;min-height:34px!important;justify-content:center!important;letter-spacing:.07em!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel button[data-iw-btn-state=primary]{background:var(--fs-forge-live-bg)!important;border:1px solid var(--fs-forge-live-line)!important;color:var(--fs-forge-live-ink)!important;text-shadow:var(--fs-forge-live-glow)!important;font-family:var(--iw-font-ui)!important;font-size:12px!important;font-weight:700!important;letter-spacing:.09em!important;text-transform:uppercase!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button],.compact-panel.fs-skill-panel button[data-iw-btn-state=secondary],.compact-panel.fs-skill-panel button[data-iw-btn-state=icon]{background:var(--fs-forge-bg)!important;border:1px solid var(--fs-forge-line)!important;color:var(--fs-forge-ink)!important;text-shadow:none!important;font-family:var(--iw-font-ui)!important;font-weight:700!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;box-shadow:var(--fs-forge-hot-shadow)!important}.compact-panel.fs-skill-panel button[data-iw-btn-state=primary]{color:var(--fs-forge-live-ink)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel button[data-iw-btn-state=disabled]{opacity:.7!important;color:var(--iw-faint, #666052)!important;background:var(--fs-forge-bg)!important;border-color:var(--fs-forge-line)!important;box-shadow:var(--fs-forge-shadow)!important;text-shadow:none!important;filter:none!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=identity]{align-self:stretch!important;display:flex!important;flex-direction:column!important;justify-content:center!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=content]{min-width:0!important}.compact-panel.fs-skill-panel [data-iw-skill-zone=commands]{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:5px!important}.compact-panel.fs-skill-panel [data-iw-readout]{font-family:var(--iw-font-ui)!important;font-size:11.5px!important;line-height:1.18!important;font-weight:500!important;color:#B7AF9F!important;letter-spacing:normal!important;text-transform:none!important}.compact-panel.fs-skill-panel [data-iw-ingr]{font-family:var(--iw-font-ui)!important;font-size:11px!important;line-height:1.15!important;color:var(--iw-dim)!important;letter-spacing:normal!important;text-transform:none!important}::highlight(iw-skill-ingredient-met){color:#82B88A!important}@media(max-width:768px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:82px minmax(0,1fr) 112px!important;gap:0 8px!important;padding-inline:8px!important}.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button]{width:88px!important;min-width:88px!important}[data-iw-skill-role=action-title]{font-size:15px!important}}.compact-panel.fs-skill-panel [data-iw-readout]{display:block!important;position:static!important;float:none!important;transform:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;clip-path:none!important}@media(max-width:520px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:minmax(0,1fr) 112px!important;grid-template-areas:"identity commands" "content content"!important;gap:8px 10px!important;align-items:start!important;padding:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{align-self:center!important;min-width:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{align-self:center!important;justify-self:end!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 188px;--fs-skill-command-w: 164px;display:grid!important;grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr) var(--fs-skill-command-w)!important;grid-template-areas:"identity content commands"!important;gap:0!important;align-items:stretch!important;min-height:154px!important;padding:0!important;overflow:hidden!important;border:1px solid var(--iw-th-edge)!important;border-left:2px solid color-mix(in srgb,var(--fs-skill-accent) 72%,var(--iw-th-edge))!important;border-radius:4px!important;background:linear-gradient(180deg,#151511 0%,#0F0F0D 100%)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.54),0 1px 0 rgba(255,255,255,.018)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]::before{left:0!important;top:0!important;width:100%!important;height:1px!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 78%,var(--iw-th-hairline-hi)),color-mix(in srgb,var(--iw-th-accent) 16%,transparent) 34%,transparent 72%)!important;opacity:.9!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;min-width:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:14px 14px 12px!important;border-right:1px solid var(--iw-th-edge-soft)!important;background:radial-gradient(circle at 50% 34%,color-mix(in srgb,var(--fs-skill-accent) 10%,transparent),transparent 42%),linear-gradient(90deg,rgba(255,255,255,.012),rgba(0,0,0,.12))!important;text-align:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{order:0!important;display:grid!important;place-items:center!important;width:68px!important;min-width:68px!important;height:68px!important;min-height:68px!important;margin:0 0 6px!important;padding:0!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 48%,var(--iw-th-edge))!important;border-radius:50%!important;background:radial-gradient(circle at 42% 34%,color-mix(in srgb,var(--fs-skill-accent) 24%,#242019),#0D0D0B 68%)!important;color:color-mix(in srgb,var(--fs-skill-accent) 76%,#F0D9A8)!important;box-shadow:inset 0 0 0 5px #11100D,inset 0 0 0 6px color-mix(in srgb,var(--iw-th-brass) 44%,transparent),0 2px 8px rgba(0,0,0,.48)!important;font-size:30px!important;line-height:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]{order:1!important;min-width:0!important;margin:0!important;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#F0DEC0)!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;line-height:1.12!important;letter-spacing:.055em!important;text-transform:uppercase!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::after{content:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{order:2!important;margin:0!important;color:#AFA796!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1.1!important;letter-spacing:.04em!important;text-transform:uppercase!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;min-width:0!important;display:grid!important;grid-template-columns:minmax(180px,auto) minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto!important;column-gap:18px!important;align-content:center!important;padding:16px 20px 14px!important;overflow:hidden!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{grid-column:1 / -1!important;grid-row:1!important;align-self:end!important;margin:0!important;color:#F2EBDD!important;font-family:var(--iw-font-head)!important;font-size:19px!important;line-height:1.08!important;font-weight:700!important;letter-spacing:.015em!important;text-transform:none!important;text-shadow:0 1px 0 #000!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress]{grid-column:1 / -1!important;grid-row:2!important;margin:5px 0 0!important;color:#B9B1A1!important;font-size:11.8px!important;font-weight:600!important;line-height:1.15!important;letter-spacing:.01em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track]{grid-column:1 / -1!important;grid-row:3!important;align-self:center!important;width:100%!important;height:5px!important;min-height:5px!important;max-height:5px!important;margin:8px 0 0!important;border:1px solid var(--iw-th-edge-faint)!important;background:#070706!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.82)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{grid-column:1 / -1!important;grid-row:4!important;align-self:center!important;margin:10px 0 0!important;padding:0!important;color:#D8D0C0!important;font-size:12px!important;font-weight:500!important;line-height:1.2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]::before{content:"◆";margin-right:7px;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#C9A66A);font-size:8px;transform:translateY(-1px)}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{grid-column:1!important;grid-row:5!important;margin:9px 0 0!important;padding-top:8px!important;border-top:1px solid var(--iw-th-edge-faint)!important;color:#AAA291!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{grid-column:2!important;grid-row:5!important;margin:9px 0 0!important;padding:8px 0 0 18px!important;border-top:1px solid var(--iw-th-edge-faint)!important;border-left:1px solid var(--iw-th-edge-faint)!important;color:#B7AF9F!important;font-size:10.9px!important;line-height:1.2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:2!important;grid-row:5!important;justify-self:end!important;align-self:end!important;margin:0!important;color:color-mix(in srgb,var(--fs-skill-accent) 68%,#D5B875)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1 / -1!important;grid-row:6!important;margin:6px 0 0!important;color:#D4A65C!important;font-size:10.8px!important;line-height:1.18!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;min-width:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:12px!important;padding:16px 14px!important;border-left:1px solid var(--iw-th-edge-soft)!important;background:linear-gradient(90deg,rgba(0,0,0,.06),rgba(255,255,255,.012))!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]{width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;border-color:var(--fs-forge-line)!important;background:var(--fs-forge-bg)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{width:132px!important;min-width:132px!important;height:48px!important;min-height:48px!important;padding:0 12px!important;border:1px solid var(--fs-forge-live-line)!important;border-radius:2px!important;background:var(--fs-forge-live-bg)!important;color:var(--fs-forge-live-ink)!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.09em!important;text-transform:uppercase!important;text-shadow:var(--fs-forge-live-glow)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]:hover:not(:disabled){border-color:var(--iw-gold, #D4AD63)!important;box-shadow:inset 0 0 14px -2px color-mix(in srgb,var(--fs-forge-live-tint) 70%,transparent),inset 0 1px 0 rgba(255,216,150,.24),0 0 0 1px color-mix(in srgb,var(--fs-forge-live-tint) 22%,transparent)!important;color:#FFF6E2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-btn-state=disabled]{filter:none!important;opacity:.7!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 154px;--fs-skill-command-w: 148px;min-height:146px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{padding-inline:14px!important;column-gap:12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important;font-size:25px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{grid-template-columns:minmax(104px,1fr) auto!important;grid-template-areas:"identity commands" "content content"!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{min-height:114px!important;padding:10px 12px!important;border-right:1px solid var(--iw-th-edge-soft)!important;border-bottom:1px solid var(--iw-th-edge-soft)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{min-height:114px!important;padding:10px 12px!important;border-left:0!important;border-bottom:1px solid var(--iw-th-edge-soft)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{padding:13px 14px 12px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-icon]{width:48px!important;min-width:48px!important;height:48px!important;min-height:48px!important;margin-bottom:3px!important;font-size:21px!important}}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{font-size:16.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{grid-column:1!important;grid-row:5!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:6!important;justify-self:start!important;padding-left:0!important;border-left:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1!important;grid-row:7!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1.2fr) minmax(180px,.8fr)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress]{grid-column:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:2!important;grid-row:2!important;justify-self:end!important;align-self:end!important;margin:5px 0 0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{order:1!important}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:6!important;justify-self:start!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]::after{content:""!important;display:block!important;width:72px!important;height:2px!important;margin:7px auto 0!important;background:linear-gradient(90deg,transparent,var(--fs-skill-accent),transparent)!important;opacity:.78!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{background:var(--fs-forge-live-bg)!important;border-color:var(--fs-forge-live-line)!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{border:1px solid var(--iw-th-edge)!important;border-left-width:2px!important;border-left-color:color-mix(in srgb,var(--fs-skill-accent) 70%,var(--iw-th-edge))!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 34%),linear-gradient(135deg,rgba(181,139,71,.028) 0 1px,transparent 1px 10px),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px color-mix(in srgb,var(--iw-th-brass) 24%,transparent),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]::after{content:""!important;display:block!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 62%,transparent)!important;border-radius:2px!important;background:none!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone]{position:relative!important;z-index:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--fs-skill-accent) 13%,transparent),transparent 36%),linear-gradient(90deg,rgba(255,255,255,.018),rgba(0,0,0,.20))!important;box-shadow:inset -1px 0 0 rgba(155,119,62,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{order:0!important;display:block!important;position:relative!important;width:78px!important;min-width:78px!important;height:78px!important;min-height:78px!important;margin:0 0 8px!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 45%,var(--iw-th-edge))!important;border-radius:50%!important;background-color:#0D0D0B!important;box-shadow:inset 0 0 0 5px #11100D,inset 0 0 0 6px color-mix(in srgb,var(--iw-th-brass) 50%,transparent),inset 0 0 18px rgba(0,0,0,.35),0 0 0 3px #0A0907,0 0 0 4px color-mix(in srgb,var(--iw-th-brass) 55%,transparent),0 3px 10px rgba(0,0,0,.52)!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{content:""!important;position:absolute!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before{width:9px!important;height:9px!important;left:50%!important;top:-6px!important;transform:translateX(-50%) rotate(45deg)!important;border:1px solid var(--iw-th-edge)!important;background:#15120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{width:9px!important;height:9px!important;left:50%!important;bottom:-6px!important;transform:translateX(-50%) rotate(45deg)!important;border:1px solid var(--iw-th-edge)!important;background:#15120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]:has(>.fs-skill-medallion-art[data-iw-skill-art-ready="1"]) [data-iw-skill-role=identity-icon]{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{background:linear-gradient(180deg,rgba(255,255,255,.008),transparent 36%),linear-gradient(90deg,rgba(0,0,0,.06),transparent 24%,transparent 76%,rgba(0,0,0,.08))!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{border-left:1px solid var(--iw-th-edge-mid)!important;background:linear-gradient(90deg,rgba(0,0,0,.22),rgba(255,255,255,.012) 55%,rgba(0,0,0,.11)),linear-gradient(180deg,#15140F,#0E0E0B)!important;box-shadow:inset 1px 0 0 rgba(175,133,70,.08),inset 0 0 16px rgba(0,0,0,.18)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{color:#F4EBDD!important;text-shadow:0 1px 0 #000,0 0 8px rgba(225,194,139,.035)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track]{border-color:var(--iw-th-edge-soft)!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.92),0 1px 0 rgba(144,109,57,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]{position:relative!important;border:1px solid var(--fs-forge-line)!important;border-radius:2px!important;background:var(--fs-forge-bg)!important;color:transparent!important;box-shadow:var(--fs-forge-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;background:var(--fs-forge-bg)!important;box-shadow:var(--fs-forge-hot-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]{position:relative!important;overflow:visible!important;border-width:1px!important;border-radius:2px!important;box-shadow:var(--fs-forge-live-shadow)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{content:""!important;position:absolute!important;left:50%!important;width:8px!important;height:8px!important;transform:translateX(-50%) rotate(45deg)!important;pointer-events:none!important;border:1px solid var(--fs-forge-live-line)!important;background:#17120D!important;box-shadow:0 0 0 2px #090806!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before{top:-5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{bottom:-5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-readout]::after{border:0!important;background:none!important;box-shadow:none!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:66px!important;min-width:66px!important;height:66px!important;min-height:66px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:54px!important;min-width:54px!important;height:54px!important;min-height:54px!important;margin-bottom:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{background:radial-gradient(circle at 50% 28%,color-mix(in srgb,var(--fs-skill-accent) 11%,transparent),transparent 38%),linear-gradient(90deg,rgba(255,255,255,.015),rgba(0,0,0,.16))!important}}@media(max-width:420px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto 5px auto auto auto auto auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{grid-column:1!important;grid-row:6!important;padding-left:0!important;border-left:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain]{grid-column:1!important;grid-row:7!important;justify-self:start!important;align-self:start!important;margin-top:4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{grid-column:1!important;grid-row:8!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone][data-iw-skills-ui-ready="1"]{background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-medallion-art::before{display:none!important;inset:-11px -8px!important;width:auto!important;height:auto!important;left:-8px!important;top:-11px!important;transform:none!important;z-index:2!important;border:0!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-medallion-frame-size)!important;background-position:var(--fs-ui-medallion-frame-position)!important;background-repeat:no-repeat!important;box-shadow:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-medallion-art::after{display:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-zone=identity]::after{content:""!important;position:absolute!important;left:4px!important;top:4px!important;width:38px!important;height:41px!important;pointer-events:none!important;opacity:.84!important;filter:brightness(1.12) saturate(1.08) drop-shadow(0 1px 2px rgba(0,0,0,.55))!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-corner-size)!important;background-position:var(--fs-ui-corner-position)!important;background-repeat:no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=identity-level]::after{width:90px!important;height:12px!important;margin-top:4px!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-separator-size)!important;background-position:var(--fs-ui-separator-position)!important;background-repeat:no-repeat!important;opacity:.72!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button]{background-image:none!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=xp-gain]{display:grid!important;place-items:center!important;min-width:92px!important;min-height:32px!important;padding:0 12px!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-xp-plaque-size)!important;background-position:var(--fs-ui-xp-plaque-position)!important;background-repeat:no-repeat!important;color:#F0D8A6!important;text-shadow:0 1px 1px #000!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] [data-iw-skill-role=xp-gain]{min-width:84px!important;min-height:30px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]:has(>[data-iw-skill-layout-shell="1"]){display:block!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{display:grid!important;grid-template-columns:var(--fs-skill-identity-w, 188px) minmax(0,1fr) var(--fs-skill-command-w, 164px)!important;grid-template-areas:"identity content commands"!important;align-items:stretch!important;gap:0!important;width:100%!important;min-height:154px!important;padding:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{width:100%!important;max-width:none!important;min-width:0!important;justify-self:stretch!important;box-sizing:border-box!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{display:flex!important;flex-direction:column!important;justify-content:center!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:14px 20px!important;row-gap:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{width:100%!important;min-width:0!important;flex:0 0 auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{width:auto!important;max-width:100%!important;white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{display:grid!important;place-items:center!important;justify-self:center!important;align-self:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{padding:0 14px!important;width:132px!important;min-width:132px!important;height:48px!important;min-height:48px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{flex:0 0 auto!important;width:auto!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:minmax(104px,1fr) auto!important;grid-template-areas:"identity commands" "content content"!important;min-height:0!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{position:relative!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:18px 26px!important;text-align:center!important;overflow:visible!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{width:100%!important;min-width:0!important;text-align:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]{font-size:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{content:attr(data-iw-clean-text)!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:700!important;line-height:1.08!important;letter-spacing:.055em!important;color:color-mix(in srgb,var(--fs-skill-accent) 72%,#F0DEC0)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{content:attr(data-iw-clean-text)!important;font-family:var(--iw-font-head)!important;font-size:21px!important;font-weight:700!important;line-height:1.08!important;letter-spacing:.015em!important;color:#F4EBDD!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]::after{display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{order:3!important;display:block!important;width:116px!important;height:6px!important;margin-top:5px!important;overflow:hidden!important;border:1px solid var(--iw-th-edge-soft)!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.92),0 1px 0 rgba(144,109,57,.08)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress-fill{display:block!important;height:100%!important;min-width:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-skill-accent) 92%,#D9B164),color-mix(in srgb,var(--fs-skill-accent) 72%,#85652E))!important;box-shadow:0 0 5px color-mix(in srgb,var(--fs-skill-accent) 22%,transparent)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-fill]{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{display:grid!important;place-items:center!important;width:190px!important;min-width:190px!important;max-width:100%!important;min-height:60px!important;margin:3px auto!important;padding:0 24px 6px!important;box-sizing:border-box!important;white-space:nowrap!important;color:#F0D8A6!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.04em!important;text-shadow:0 1px 1px #000!important;border:1px solid var(--iw-th-edge)!important;background:linear-gradient(180deg,#21170E,#100D09)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-base-exp{border:0!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-xp-plaque-size)!important;background-position:var(--fs-ui-xp-plaque-position)!important;background-repeat:no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important;pointer-events:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{width:100%!important;margin-left:auto!important;margin-right:auto!important;padding-left:0!important;padding-right:0!important;border-left:0!important;text-align:center!important;justify-self:center!important;align-self:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement]{padding-top:0!important;border-top:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]::before{content:none!important}@media(max-width:1024px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:102px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;padding:16px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:86px!important;height:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:17px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>*{order:3!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient]{order:2!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{order:4!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward]{order:99!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone]{filter:saturate(.72) brightness(.88)!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{filter:grayscale(.18) brightness(.82)!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{transform:none!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{color:#BEB6A8!important}.compact-panel.fs-skill-panel.fs-skill--locked[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{color:#8E877B!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{order:3!important;display:flex!important;flex-direction:column!important;align-items:center!important;margin-top:3px!important;color:#C8BEAB!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1!important;letter-spacing:.045em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{content:""!important;display:block!important;width:46px!important;height:1px!important;margin:0 auto 5px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 28%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 72%,transparent)!important;box-shadow:0 1px 0 rgba(0,0,0,.75)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{order:4!important;margin-top:5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]{width:100%!important;margin-left:auto!important;margin-right:auto!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#C9C0AF!important;font-size:0!important;text-align:center!important;pointer-events:none!important;cursor:default!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before{content:attr(data-iw-progress-display)!important;color:#C9C0AF!important;font-family:var(--iw-font-ui)!important;font-size:12px!important;font-weight:600!important;line-height:1.2!important;letter-spacing:.015em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{width:96px!important;gap:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:transparent!important;font-size:0!important;background-color:transparent!important;background-position:center!important;background-repeat:no-repeat!important;background-size:100% 100%!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-nav-direction=prev]{background-image:var(--fs-skills-nav-prev)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-nav-direction=next]{background-image:var(--fs-skills-nav-next)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){filter:brightness(1.13) saturate(1.08)!important;transform:translateY(-1px)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=action-title],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=level-progress],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=action-detail]{text-align:center!important;justify-content:center!important;margin-left:auto!important;margin-right:auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]>:first-child>:not([data-iw-skill-role=nav-group]){text-align:center!important;margin-left:auto!important;margin-right:auto!important}.fs-skills-section-frame[data-iw-skills-ui-ready="1"]{position:relative!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 5px 18px rgba(0,0,0,.24)!important}.fs-skills-section-frame[data-iw-skills-ui-ready="1"]::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:12px!important;right:12px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent)!important;opacity:.78!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{background-image:var(--fs-skills-nav-prev)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{background-image:var(--fs-skills-nav-next)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{color:transparent!important;font-size:0!important;line-height:0!important;text-indent:-9999px!important;text-shadow:none!important;overflow:hidden!important;background-position:center!important;background-repeat:no-repeat!important;background-size:68% 68%!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 142px;--fs-skill-command-w: 136px;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr) var(--fs-skill-command-w)!important;grid-template-areas:"identity content commands"!important;min-height:124px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:2px!important;padding:7px 9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:54px!important;min-width:54px!important;height:54px!important;min-height:54px!important;margin:0 0 3px!important;box-shadow:inset 0 0 0 4px #11100D,inset 0 0 0 5px color-mix(in srgb,var(--iw-th-brass) 48%,transparent),inset 0 0 12px rgba(0,0,0,.35),0 0 0 2px #0A0907,0 0 0 3px color-mix(in srgb,var(--iw-th-brass) 50%,transparent),0 2px 7px rgba(0,0,0,.48)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art::after{width:7px!important;height:7px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:13px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:10.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:1px!important;font-size:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:34px!important;margin-bottom:3px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:84px!important;height:4px!important;margin-top:3px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:2px!important;padding:6px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:17.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before{font-size:10.8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:174px!important;min-width:174px!important;min-height:40px!important;margin:1px auto!important;padding:0 20px 4px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{margin-top:1px!important;font-size:10.2px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{padding:6px!important}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 126px;--fs-skill-command-w: 126px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:124px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 78px;--fs-skill-command-w: auto}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-columns:var(--fs-skill-identity-w) minmax(0,1fr)!important;grid-template-rows:minmax(0,auto) 51px!important;grid-template-areas:"identity content" "commands commands"!important;min-height:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{min-height:0!important;padding:6px!important;border-bottom:1px solid var(--iw-th-edge-soft)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;margin-bottom:2px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:64px!important;height:4px!important;margin-top:2px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important;gap:1px!important;padding:5px 8px!important;border-bottom:1px solid var(--iw-th-edge-soft)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:15px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=level-progress][data-iw-progress-display]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{font-size:9.5px!important;line-height:1.08!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:146px!important;min-width:146px!important;min-height:34px!important;margin:0 auto!important;padding-bottom:3px!important;font-size:10.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:start!important;align-self:center!important;width:116px!important;min-width:116px!important;height:44px!important;min-height:44px!important;margin-left:10px!important;transform:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]::after{display:none!important}}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{background:var(--fs-skills-nav-prev) center / 68% 68% no-repeat!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{background:var(--fs-skills-nav-next) center / 68% 68% no-repeat!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:8px 14px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{position:static!important;order:0!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;display:flex!important;flex:0 0 auto!important;align-items:center!important;justify-content:center!important;width:auto!important;margin:0!important;gap:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important;transform:none!important;margin:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{transform:none!important;justify-self:center!important;align-self:center!important;margin:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 176px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:155px!important;min-width:155px!important;height:44px!important;min-height:44px!important;padding:0 10px!important;font-size:12.5px!important;letter-spacing:.075em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{width:7px!important;height:7px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before{top:-4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after{bottom:-4px!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]{filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]:hover:not(:disabled){filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) brightness(1.1)!important;color:#FFF6E2!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button][data-iw-btn-state=disabled],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button][data-iw-btn-state=disabled]{filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) saturate(.4) brightness(.82)!important}.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button]::after,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]::before,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:150px!important;min-width:150px!important;height:50px!important;min-height:50px!important;padding:0 28px 3px!important;margin:1px auto 2px!important;font-size:12px!important;letter-spacing:.03em!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{position:static!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{display:grid!important;place-items:center!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:0!important;background-color:transparent!important;box-shadow:none!important;filter:none!important;color:transparent!important;font-size:0!important;transition:filter .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){background-color:transparent!important;transform:none!important;filter:brightness(1.18) saturate(1.06)!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=xp-gain],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=reward],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-track],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=progress-fill]{min-width:0!important;min-height:0!important;max-height:1px!important;padding:0!important;margin:0!important;border:0!important;background:none!important;box-shadow:none!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:104px!important;align-items:center!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:3px!important;padding:8px 18px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:16px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{margin-top:0!important;font-size:11px!important;line-height:1.25!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:2px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:46px!important;min-width:46px!important;height:46px!important;min-height:46px!important;margin:0 0 4px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:13.5px!important;letter-spacing:.07em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:11px!important;letter-spacing:.1em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:2px!important;font-size:10.5px!important;letter-spacing:.06em!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:92px!important;height:5px!important;margin-top:3px!important;border-radius:1px!important}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 168px}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:144px!important;min-width:144px!important;height:48px!important;min-height:48px!important;padding:0 26px 3px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:148px!important;min-width:148px!important;height:44px!important;min-height:44px!important}}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:start!important;margin-left:10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{flex:1 1 auto!important;width:auto!important;min-width:108px!important;max-width:155px!important;height:44px!important;min-height:44px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=nav-group]{flex:0 0 auto!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{width:140px!important;min-width:140px!important;height:44px!important;min-height:44px!important;font-size:11.5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{gap:2px!important;padding:9px 6px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{gap:1px!important;padding:8px 5px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-title]::before{font-size:14.5px!important;line-height:1.12!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=ingredient],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=requirement],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=action-detail]{font-size:9.5px!important;line-height:1.14!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9px!important;margin-top:1px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp{width:144px!important;min-width:144px!important;height:48px!important;min-height:48px!important;padding:0 26px 3px!important;font-size:11px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;margin-bottom:4px!important}}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-base-exp,.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] .fs-skill-base-exp{display:inline-grid!important;place-items:center!important;width:auto!important;min-width:0!important;max-width:100%!important;height:auto!important;min-height:0!important;margin:3px auto 4px!important;padding:3px 13px 4px!important;white-space:nowrap!important;border:1px solid color-mix(in srgb,var(--fs-skill-accent) 34%,var(--iw-th-edge-mid))!important;border-radius:3px!important;background-color:color-mix(in srgb,var(--fs-skill-accent) 7%,#13120E)!important;background-image:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;color:#E6D7BC!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.05em!important;text-transform:uppercase!important;text-shadow:0 1px 0 #000!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:8px 10px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 248px}@media(max-width:1024px)and (min-width:641px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 240px}}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] [data-iw-skill-role=nav-group]{display:contents!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}@media(min-width:641px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{position:absolute!important;z-index:4!important;right:0!important;top:50%!important;left:auto!important;transform:translateY(-50%)!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;width:var(--fs-skill-command-w, 236px)!important;padding:0 10px!important;margin:0!important;gap:0!important}}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction],.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{display:grid!important;place-items:center!important;position:relative!important;width:26px!important;min-width:26px!important;height:44px!important;min-height:44px!important;padding:0!important;border:1px solid var(--fs-forge-line)!important;border-radius:2px!important;background:var(--fs-forge-bg)!important;background-image:none!important;box-shadow:var(--fs-forge-shadow)!important;color:transparent!important;font-size:0!important;filter:none!important;transition:border-color .12s,box-shadow .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{visibility:hidden!important;opacity:0!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before{content:""!important;display:block!important;position:absolute!important;left:50%!important;top:50%!important;box-sizing:border-box!important;width:var(--fs-chev-box)!important;height:var(--fs-chev-box)!important;border:0 solid var(--iw-gold-dim, #9D8458)!important;border-right-width:var(--fs-chev-stroke)!important;border-bottom-width:var(--fs-chev-stroke)!important;background:none!important;box-shadow:none!important;pointer-events:none!important;transition:border-color .12s!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]::before{transform:translate(-50%,-50%) translateX(var(--fs-chev-ink)) rotate(135deg)!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]::before{transform:translate(-50%,-50%) translateX(calc(-1 * var(--fs-chev-ink))) rotate(-45deg)!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled),.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled){border-color:var(--fs-forge-hot-line)!important;box-shadow:var(--fs-forge-hot-shadow)!important;filter:none!important;transform:none!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled)::before,.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover:not(:disabled)::before{border-color:#FFE2AE!important}html .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"][data-iw-skill-layout=three-zone] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:disabled{opacity:.45!important}@media(max-width:640px){.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){flex-direction:row!important;justify-content:center!important;gap:8px!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important}.compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}}.compact-panel.fs-quest-panel{--fs-quest-accent: #C9A66A;position:relative!important;margin-bottom:8px!important;padding:0!important;overflow:hidden!important;border:1px solid var(--iw-th-edge)!important;border-left:2px solid color-mix(in srgb,var(--fs-quest-accent) 70%,var(--iw-th-edge))!important;border-radius:4px!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 34%),linear-gradient(135deg,rgba(181,139,71,.028) 0 1px,transparent 1px 10px),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px color-mix(in srgb,var(--iw-th-brass) 24%,transparent),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"]{background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.03),transparent 34%),var(--fs-skills-panel-texture),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important}.compact-panel.fs-quest-panel::before{content:""!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;height:1px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-quest-accent) 78%,var(--iw-th-hairline-hi)),color-mix(in srgb,var(--iw-th-accent) 16%,transparent) 34%,transparent 72%)!important;opacity:.9!important}.compact-panel.fs-quest-panel::after{content:""!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid color-mix(in srgb,var(--iw-th-edge) 62%,transparent)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{position:relative!important;z-index:1!important;display:grid!important;grid-template-columns:104px minmax(0,1fr)!important;grid-template-areas:"sigil row" "sigil track" "sigil label"!important;align-items:center!important;row-gap:9px!important;column-gap:0!important;padding:14px 16px 13px!important}.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]>*{margin:0!important}.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]>[data-iw-quest-zone=skip-note]{grid-column:1 / -1!important;grid-row:4!important;min-width:0!important;width:100%!important}.compact-panel.fs-quest-panel [data-iw-quest-role=skip-note]{display:block!important;width:100%!important;color:var(--iw-faint)!important;font:400 10.5px/1.4 var(--iw-font-ui)!important;font-style:normal!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]{grid-area:row!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important;min-width:0!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=content]{min-width:0!important;display:flex!important;flex-direction:column!important;gap:3px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=content]>*{margin:0!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{flex:0 0 auto!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:center!important;gap:8px!important}:root{--fs-quest-frame-position: 49.625268% 3.747323%}:root[data-iw-zone-theme=verdant]{--fs-quest-frame-position: 9.368308% 3.800857%}:root[data-iw-zone-theme=forged-metal]{--fs-quest-frame-position: 49.625268% 3.747323%}:root[data-iw-zone-theme=infernal]{--fs-quest-frame-position: 89.989293% 3.854390%}:root[data-iw-zone-theme=celestial]{--fs-quest-frame-position: 9.100642% 45.396146%}:root[data-iw-zone-theme=voidborn]{--fs-quest-frame-position: 49.678801% 45.503212%}:root[data-iw-zone-theme=runic-arcane]{--fs-quest-frame-position: 90.096360% 45.556745%}:root[data-iw-zone-theme=lunar-spectral]{--fs-quest-frame-position: 9.314775% 86.777302%}:root[data-iw-zone-theme=tempest-oceanic]{--fs-quest-frame-position: 49.678801% 86.777302%}:root[data-iw-zone-theme=glacial]{--fs-quest-frame-position: 89.882227% 86.884368%}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 72px;--fs-quest-icon-scale: .60;grid-area:sigil!important;align-self:center!important;justify-self:center!important;position:relative!important;display:grid!important;place-items:center!important;width:var(--fs-quest-sigil-size)!important;height:var(--fs-quest-sigil-size)!important;border:0!important;border-radius:50%!important;background:radial-gradient(circle at 42% 34%,color-mix(in srgb,var(--fs-quest-accent) 22%,#242019),#0D0D0B 68%)!important;box-shadow:inset 0 0 16px rgba(0,0,0,.35),0 3px 10px rgba(0,0,0,.5)!important;pointer-events:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil::before{content:attr(data-iw-quest-glyph)!important;position:relative!important;z-index:2!important;color:color-mix(in srgb,var(--fs-quest-accent) 76%,#F0D9A8)!important;font-family:var(--iw-font-head)!important;font-size:27px!important;line-height:1!important;text-shadow:0 1px 0 #000,0 0 10px color-mix(in srgb,var(--fs-quest-accent) 30%,transparent)!important}.compact-panel.fs-quest-panel .fs-quest-sigil::after{content:""!important;position:absolute!important;inset:-4px!important;z-index:1!important;pointer-events:none!important;background-image:url(../assets/quest-frames/approved-frames.png)!important;background-size:391.875% 391.875%!important;background-position:var(--fs-quest-frame-position)!important;background-repeat:no-repeat!important;-webkit-mask-image:radial-gradient(ellipse closest-side,transparent 65%,#000 67%,#000 97%,transparent 100%)!important;mask-image:radial-gradient(ellipse closest-side,transparent 65%,#000 67%,#000 97%,transparent 100%)!important}.compact-panel.fs-quest-panel .fs-quest-sigil-icon{position:absolute!important;inset:calc(var(--fs-quest-sigil-size) * (1 - var(--fs-quest-icon-scale)) / 2)!important;z-index:2!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))!important;pointer-events:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil[data-iw-quest-icon="1"]::before{content:none!important}.compact-panel.fs-quest-panel .fs-quest-sigil-pct{position:absolute!important;left:50%!important;bottom:-21px!important;transform:translateX(-50%)!important;z-index:3!important;padding:1px 7px!important;border:1px solid color-mix(in srgb,var(--fs-quest-accent) 50%,var(--iw-th-edge))!important;border-radius:2px!important;background:linear-gradient(180deg,#201A11,#100D09)!important;color:#E7D6B4!important;font-family:var(--iw-font-ui)!important;font-size:10px!important;font-weight:700!important;letter-spacing:.06em!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker]{margin-bottom:1px!important;color:color-mix(in srgb,var(--fs-quest-accent) 66%,#C7B38A)!important;font-family:var(--iw-font-ui)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.14em!important;text-transform:uppercase!important}.compact-panel.fs-quest-panel [data-iw-quest-role=title]{color:#F2EBDD!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:700!important;line-height:1.12!important;letter-spacing:.02em!important;text-shadow:0 1px 0 #000!important}.compact-panel.fs-quest-panel [data-iw-quest-role=brief]{color:#C7C0B2!important;font-family:var(--iw-font-flavour, var(--iw-font-ui))!important;font-size:11.5px!important;font-style:italic!important;line-height:1.25!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{display:inline-flex!important;align-items:baseline!important;gap:6px!important;margin-top:2px!important;color:#DAD2C1!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;line-height:1.2!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]::before{content:"◆"!important;color:color-mix(in srgb,var(--fs-quest-accent) 72%,#C9A66A)!important;font-size:8px!important;transform:translateY(-1px)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]{cursor:help!important;border-radius:2px!important;transition:color .12s,background .12s!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]:hover,.compact-panel.fs-quest-panel [data-iw-quest-role=objective][data-iw-tooltip-trigger]:focus-visible{outline:none!important;color:#F1E8D4!important;background:color-mix(in srgb,var(--fs-quest-accent) 14%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--fs-quest-accent) 14%,transparent)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 42px;align-self:flex-start!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;min-width:0!important;height:var(--fs-plaque-h)!important;min-height:var(--fs-plaque-h)!important;margin-top:4px!important;padding:0 14px!important;border:1px solid color-mix(in srgb,var(--fs-quest-accent) 42%,var(--iw-th-edge-soft))!important;border-radius:3px!important;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.34))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -1px 0 rgba(0,0,0,.5)!important;color:#F0D8A6!important;font-family:var(--iw-font-head)!important;font-size:0!important;text-shadow:0 1px 1px #000!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{content:attr(data-iw-quest-reward)!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.02em!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-track]{grid-area:track!important;width:100%!important;height:5px!important;margin:0!important;overflow:hidden!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:0!important;background:#060604!important;box-shadow:inset 0 1px 3px rgba(0,0,0,.9)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-fill]{height:100%!important;border-radius:0!important;background:linear-gradient(90deg,color-mix(in srgb,var(--fs-quest-accent) 92%,#D9B164),color-mix(in srgb,var(--fs-quest-accent) 66%,#7C4A24))!important;box-shadow:0 0 6px color-mix(in srgb,var(--fs-quest-accent) 24%,transparent)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-label]{grid-area:label!important;margin:0!important;color:#A9A190!important;font-family:var(--iw-font-ui)!important;font-size:10px!important;font-weight:600!important;letter-spacing:.05em!important;text-transform:uppercase!important;font-variant-numeric:tabular-nums!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{--fs-action-h: 42px;--fs-action-cap: calc(var(--fs-action-h) * var(--fs-ui-action-cap-ratio, .8));align-self:center!important;box-sizing:border-box!important;width:auto!important;max-width:100%!important;min-width:148px!important;height:var(--fs-action-h)!important;min-height:var(--fs-action-h)!important;padding:0 20px!important;white-space:nowrap!important;border-radius:3px!important;font-family:var(--iw-font-head)!important;font-size:12px!important;font-weight:700!important;letter-spacing:.07em!important;text-transform:uppercase!important;text-shadow:0 1px 0 rgba(0,0,0,.8)!important;cursor:pointer!important;transition:filter .12s,border-color .12s,color .12s!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]{border:1px solid color-mix(in srgb,var(--fs-quest-accent) 80%,#B58B4B)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--fs-quest-accent) 80%,#6E4423),color-mix(in srgb,var(--fs-quest-accent) 56%,#241610))!important;color:#FFF0D8!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 -1px 0 rgba(0,0,0,.46),0 2px 6px rgba(0,0,0,.32)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{font-size:11px!important;border:1px solid var(--iw-line-hi)!important;background:linear-gradient(180deg,#242018,#17140F)!important;color:#C9BFA6!important;letter-spacing:.06em!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{position:relative!important;isolation:isolate!important;border:0!important;border-radius:0!important;padding:0 var(--fs-action-cap)!important;background-color:transparent!important;background-image:var(--fs-skills-ui-atlas)!important;background-repeat:no-repeat!important;background-origin:content-box!important;background-clip:content-box!important;box-shadow:none!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::after,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::after{content:""!important;position:absolute!important;top:0!important;bottom:0!important;z-index:-1!important;width:var(--fs-action-cap)!important;background-repeat:no-repeat!important;pointer-events:none!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::before{left:0!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::after,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::after{right:0!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]{background-size:var(--fs-ui-action-idle-mid-size)!important;background-position:var(--fs-ui-action-idle-mid-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::after{background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-action-idle-cap-size)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::before{background-position:var(--fs-ui-action-idle-cap-l-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]::after{background-position:var(--fs-ui-action-idle-cap-r-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{background-size:var(--fs-ui-action-disabled-mid-size)!important;background-position:var(--fs-ui-action-disabled-mid-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::after{background-image:var(--fs-skills-ui-atlas)!important;background-size:var(--fs-ui-action-disabled-cap-size)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::before{background-position:var(--fs-ui-action-disabled-cap-l-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]::after{background-position:var(--fs-ui-action-disabled-cap-r-position)!important}.compact-panel.fs-quest-panel[data-iw-quest-state=ready]{--fs-quest-accent: #B84A20;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(184,74,32,.22),0 0 16px rgba(184,74,32,.16),0 2px 7px rgba(0,0,0,.42)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]:hover:not(:disabled){filter:brightness(1.08)!important;border-color:var(--iw-ember-hi, #E0894A)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:hover:not(:disabled){color:#FFF8E8!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) brightness(1.1)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=skip]:hover:not(:disabled){border-color:var(--iw-th-rule)!important;color:#F0E4C8!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:hover:not(:disabled){color:#F0E4C8!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) brightness(1.14)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in]:disabled,.compact-panel.fs-quest-panel [data-iw-quest-role=skip]:disabled{cursor:not-allowed!important;filter:saturate(.4) brightness(.82)!important;opacity:.9!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled{color:#B9AE97!important;background-size:var(--fs-ui-action-disabled-mid-size)!important;background-position:var(--fs-ui-action-disabled-mid-position)!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) saturate(.4) brightness(.82)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled::before,.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled::after{background-size:var(--fs-ui-action-disabled-cap-size)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled::before{background-position:var(--fs-ui-action-disabled-cap-l-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:disabled::after{background-position:var(--fs-ui-action-disabled-cap-r-position)!important}.compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:disabled{color:#8C8577!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45)) grayscale(1) brightness(.62)!important;opacity:.6!important}@media(max-width:640px){.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{grid-template-columns:56px minmax(0,1fr)!important;grid-template-areas:"sigil row" "sigil track" "sigil label"!important;align-items:center!important;row-gap:7px!important;column-gap:8px!important;padding:12px 12px 11px 8px!important}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 44px;--fs-quest-icon-scale: .62;margin-bottom:3px!important}.compact-panel.fs-quest-panel .fs-quest-sigil::before{font-size:16px!important}.compact-panel.fs-quest-panel .fs-quest-sigil-pct{bottom:-14px!important;padding:0 4px!important;font-size:9.5px!important}.compact-panel.fs-quest-panel .fs-quest-sigil::after{inset:-2px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]{position:relative!important;display:block!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{position:absolute!important;top:0!important;right:0!important;width:max-content!important;max-width:62%!important;justify-content:flex-start!important;gap:5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{--fs-action-h: 33px;width:auto!important;min-width:116px!important;max-width:100%!important;padding:0 6px!important;font-size:9.5px!important;letter-spacing:.04em!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker],.compact-panel.fs-quest-panel [data-iw-quest-role=title],.compact-panel.fs-quest-panel [data-iw-quest-role=brief],.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{padding-right:calc(var(--fs-quest-cmd-w, 116px) + 8px)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker]{font-size:9.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=title]{font-size:13px!important;line-height:1.12!important}.compact-panel.fs-quest-panel [data-iw-quest-role=brief]{font-size:10.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{font-size:10.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 29px;align-self:flex-start!important;max-width:100%!important;margin-top:4px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=row]:has([data-iw-quest-role=skip]) [data-iw-quest-role=reward]{margin-top:22px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{font-size:9.5px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-track]{height:4px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=progress-label]{margin-top:1px!important;font-size:10px!important}}@media(max-width:400px){.compact-panel.fs-quest-panel>[data-iw-quest-zone=body]{grid-template-columns:50px minmax(0,1fr)!important;column-gap:7px!important;padding-left:7px!important;padding-right:10px!important}.compact-panel.fs-quest-panel .fs-quest-sigil{--fs-quest-sigil-size: 40px}.compact-panel.fs-quest-panel .fs-quest-sigil::before{font-size:15px!important}.compact-panel.fs-quest-panel [data-iw-quest-zone=commands]{max-width:66%!important}.compact-panel.fs-quest-panel [data-iw-quest-role=turn-in],.compact-panel.fs-quest-panel [data-iw-quest-role=skip]{--fs-action-h: 30px;min-width:106px!important;font-size:9px!important}.compact-panel.fs-quest-panel [data-iw-quest-role=kicker],.compact-panel.fs-quest-panel [data-iw-quest-role=title],.compact-panel.fs-quest-panel [data-iw-quest-role=brief],.compact-panel.fs-quest-panel [data-iw-quest-role=objective]{padding-right:calc(var(--fs-quest-cmd-w, 106px) + 8px)!important}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]{--fs-plaque-h: 27px}.compact-panel.fs-quest-panel [data-iw-quest-role=reward]::before{font-size:9px!important}}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-command-w: 240px;--fs-skill-command-h: 64px;--fs-skill-identity-w: 150px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{display:grid!important;grid-template-columns:var(--fs-skill-identity-w, 150px) minmax(0,1fr)!important;grid-template-rows:1fr var(--fs-skill-command-h, 64px)!important;grid-template-areas:"identity content" "identity commands"!important;align-items:stretch!important;min-height:156px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{grid-area:identity!important;align-self:stretch!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;padding:14px 12px!important;border-right:1px solid var(--iw-th-edge-soft)!important;border-bottom:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:56px!important;min-width:56px!important;height:56px!important;min-height:56px!important;margin:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:14px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:11px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{margin-top:0!important;font-size:11.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:62px!important;margin-bottom:5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:108px!important;max-width:100%!important;height:7px!important;margin-top:4px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content]{grid-area:content!important;align-self:center!important;border-bottom:1px solid var(--iw-th-edge-soft)!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]{grid-area:commands!important;border-left:0!important;box-shadow:none!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:12px!important;box-sizing:border-box!important;width:100%!important;height:100%!important;min-height:0!important;padding:0 12px!important;background:none!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] button[data-iw-skill-zone=commands]{justify-self:center!important;align-self:center!important;margin:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] [data-iw-skill-role=nav-group]{display:contents!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{order:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=action-button]{order:1!important;flex:0 1 auto!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{order:2!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{position:absolute!important;left:calc(50% + var(--fs-skill-identity-w, 150px) / 2)!important;right:auto!important;bottom:0!important;top:auto!important;transform:translateX(-50%)!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;box-sizing:border-box!important;width:var(--fs-skill-command-w, 240px)!important;max-width:calc(100% - var(--fs-skill-identity-w, 150px))!important;height:var(--fs-skill-command-h, 64px)!important;padding:0!important;margin:0!important;gap:0!important;z-index:4!important}@media(max-width:640px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 116px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{min-height:150px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{padding:12px 8px!important;gap:5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:12px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:10px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:10.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:52px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:92px!important;height:6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:8px!important;padding:0 8px!important}}@media(max-width:430px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 78px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{padding:10px 4px!important;gap:4px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:56px!important;min-width:56px!important;height:56px!important;min-height:56px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity]::before{font-size:10px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-role=identity-level]{font-size:9px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent{font-size:9.5px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-percent::before{width:42px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:66px!important;height:6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:4px!important;padding:0 4px!important}}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]{--fs-button-art: var(--iw-action-idle);--fs-button-paint: var(--iw-action-idle-paint);--fs-button-background: var(--fs-button-paint, transparent var(--fs-button-art) center / 100% 100% no-repeat);background:var(--fs-button-background)!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]:hover:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-hover);--fs-button-paint: var(--iw-action-hover-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]:active:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-clicked);--fs-button-paint: var(--iw-action-clicked-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important;transform:none!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]:is(:disabled,[aria-disabled=true],[data-iw-btn-state=disabled]){--fs-button-art: var(--iw-action-secondary-idle);--fs-button-paint: var(--iw-action-secondary-idle-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{--fs-button-background: var(--fs-button-paint, transparent var(--fs-button-art) center / contain no-repeat);background:var(--fs-button-background)!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]{--fs-button-art: var(--iw-chevron-prev-idle);--fs-button-paint: var(--iw-chevron-prev-idle-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]{--fs-button-art: var(--iw-chevron-next-idle);--fs-button-paint: var(--iw-chevron-next-idle-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]:hover:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-chevron-prev-hover);--fs-button-paint: var(--iw-chevron-prev-hover-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]:hover:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-chevron-next-hover);--fs-button-paint: var(--iw-chevron-next-hover-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]:active:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-chevron-prev-clicked);--fs-button-paint: var(--iw-chevron-prev-clicked-paint);transform:none!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction=next]:active:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-chevron-next-clicked);--fs-button-paint: var(--iw-chevron-next-clicked-paint);transform:none!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in],html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{--fs-button-background: var(--fs-button-paint, transparent var(--fs-button-art) center / 100% 100% no-repeat);background:var(--fs-button-background)!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]{--fs-button-art: var(--iw-action-idle);--fs-button-paint: var(--iw-action-idle-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]{--fs-button-art: var(--iw-action-secondary-idle);--fs-button-paint: var(--iw-action-secondary-idle-paint)}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:hover:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-hover);--fs-button-paint: var(--iw-action-hover-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:hover:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-secondary-hover);--fs-button-paint: var(--iw-action-secondary-hover-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=turn-in]:active:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-clicked);--fs-button-paint: var(--iw-action-clicked-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important;transform:none!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] [data-iw-quest-role=skip]:active:not(:disabled):not([aria-disabled=true]){--fs-button-art: var(--iw-action-secondary-clicked);--fs-button-paint: var(--iw-action-secondary-clicked-paint);filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))!important;transform:none!important}html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] :is([data-iw-quest-role=turn-in],[data-iw-quest-role=skip])::before,html[data-iw-zone-theme]:not([data-iw-zone-theme=default]) .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] :is([data-iw-quest-role=turn-in],[data-iw-quest-role=skip])::after{content:none!important;display:none!important}html[data-iw-button-atlas=revised-v5] .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button:is([data-iw-skill-role=action-button],[data-iw-skill-role=nav-button]),html[data-iw-button-atlas=revised-v5] .compact-panel.fs-quest-panel[data-iw-skills-ui-ready="1"] :is([data-iw-quest-role=turn-in],[data-iw-quest-role=skip]){--fs-button-transition: color .12s;transition:color .12s!important;background-origin:border-box!important;background-clip:border-box!important}html[data-iw-button-atlas=revised-v5] .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]{display:flex!important;align-items:center!important;justify-content:center!important;line-height:1!important}html[data-iw-button-atlas=revised-v5] .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{--fs-button-border: 0;--fs-button-shadow: none;border:0!important;box-shadow:none!important}html[data-iw-button-atlas=revised-v5] .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before,html[data-iw-button-atlas=revised-v5] .compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{content:none!important;display:none!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip]){--fs-motion-idle: var(--iw-action-idle-paint);--fs-motion-hover: var(--iw-action-hover-paint);--fs-motion-pressed: var(--iw-action-clicked-paint);--fs-button-background: var(--fs-motion-idle) !important;isolation:isolate!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])[data-iw-nav-direction=prev]{--fs-motion-idle: var(--iw-chevron-prev-idle-paint);--fs-motion-hover: var(--iw-chevron-prev-hover-paint);--fs-motion-pressed: var(--iw-chevron-prev-clicked-paint)}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])[data-iw-nav-direction=next]{--fs-motion-idle: var(--iw-chevron-next-idle-paint);--fs-motion-hover: var(--iw-chevron-next-hover-paint);--fs-motion-pressed: var(--iw-chevron-next-clicked-paint)}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])[data-iw-quest-role=skip]{--fs-motion-idle: var(--iw-action-secondary-idle-paint);--fs-motion-hover: var(--iw-action-secondary-hover-paint);--fs-motion-pressed: var(--iw-action-secondary-clicked-paint)}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::before,html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::after{content:""!important;display:block!important;position:absolute!important;inset:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;transform:none!important;filter:none!important;pointer-events:none!important;z-index:-1!important;opacity:0!important;transition:opacity 180ms ease-out!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::before{background:var(--fs-motion-hover)!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::after{background:var(--fs-motion-pressed)!important;transition-duration:70ms!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip]):not(:disabled):not([aria-disabled=true]):not([data-iw-btn-state=disabled]):is(:hover,:focus-visible,:active)::before,html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip]):not(:disabled):not([aria-disabled=true]):not([data-iw-btn-state=disabled]):active::after{opacity:1!important}html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip]):is(:disabled,[aria-disabled=true],[data-iw-btn-state=disabled])::before,html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip]):is(:disabled,[aria-disabled=true],[data-iw-btn-state=disabled])::after{opacity:0!important;transition:none!important}@media(prefers-reduced-motion:reduce){html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::before,html[data-iw-button-atlas=revised-v5][data-iw-zone-theme] .compact-panel:is(.fs-skill-panel,.fs-quest-panel)[data-iw-skills-ui-ready="1"] :is(button[data-iw-skill-role=action-button],button[data-iw-skill-role=nav-button][data-iw-nav-direction],button[data-iw-quest-role=turn-in],button[data-iw-quest-role=skip])::after{transition:none!important}}@media(max-width:384px){html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]{--fs-skill-identity-w: 84px}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone]>[data-iw-skill-layout-shell="1"]{grid-template-areas:"identity content" "commands commands"!important;min-height:0!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=identity]{border-bottom:1px solid var(--iw-th-edge-soft)!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-medallion-art{width:52px!important;min-width:52px!important;height:52px!important;min-height:52px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] .fs-skill-identity-progress{width:70px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=commands]:not(button){gap:6px!important;padding:0 6px!important}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{left:50%!important;max-width:100%!important}}html .compact-panel.fs-skill-panel[data-iw-skill-layout=three-zone] [data-iw-ingredient-list-source="1"]{display:none!important}html .compact-panel.fs-skill-panel .fs-skill-ingredient-grid{order:2!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;justify-content:center!important;gap:4px 6px!important;box-sizing:border-box!important;width:min(100%,680px)!important;margin:2px auto!important;padding:0!important;color:var(--iw-dim)!important;font-family:var(--iw-font-ui)!important;font-size:10.5px!important;line-height:1.2!important;font-variant-numeric:tabular-nums!important;text-align:center!important}html .compact-panel.fs-skill-panel .fs-skill-ingredient-item{display:flex!important;align-items:center!important;justify-content:center!important;min-width:0!important;padding:4px 7px!important;overflow-wrap:anywhere!important;color:var(--iw-dim)!important;border:1px solid rgba(121,105,78,.25)!important;border-left:2px solid rgba(121,105,78,.42)!important;border-radius:2px!important;background:rgba(7,7,6,.34)!important}html .compact-panel.fs-skill-panel .fs-skill-ingredient-item[data-iw-ingredient-state=met]{color:#82B88A!important;border-left-color:rgba(130,184,138,.62)!important}html .compact-panel.fs-skill-panel .fs-skill-ingredient-item:only-child{grid-column:1 / -1!important;box-sizing:border-box!important;justify-self:center!important;width:min(100%,340px)!important}@media(max-width:430px){html .compact-panel.fs-skill-panel .fs-skill-ingredient-grid{grid-template-columns:minmax(0,1fr)!important;gap:3px!important;font-size:9.5px!important}html .compact-panel.fs-skill-panel .fs-skill-ingredient-item{padding:3px 5px!important}}\n';

  // src/modules/SkillPanelRenderer.js
  var RENDERED_ATTR2 = "data-fs-skill";
  var ROLE_ATTR = "data-iw-skill-role";
  var ZONE_ATTR = "data-iw-skill-zone";
  var SHELL_ATTR = "data-iw-skill-layout-shell";
  var MET_INGREDIENT_HIGHLIGHT = "iw-skill-ingredient-met";
  var buttonStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var readoutStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var ingredientStyleSnapshots = /* @__PURE__ */ new WeakMap();
  var ingredientHighlightRanges = /* @__PURE__ */ new Map();
  var ingredientLists = /* @__PURE__ */ new Map();
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
    gathering: { label: "Herbalism", labels: ["Herbalism", "Herb", "Gathering"], glyph: "❧", actions: ["gather", "harvest"] },
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
  function setOwnedStyle(owner, el2, prop, value, priority = "important") {
    return owner.set(el2, prop, value, priority);
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
    // Frame colours are written as var() so an INLINE declaration still follows
    // the zone palette: the value resolves against the cascade on the element,
    // so the per-zone <html> attribute reaches it the same way a stylesheet rule
    // would. Mirrors --fs-forge-line / --fs-forge-live-line in skillpanel.css.
    border: "1px solid var(--iw-th-edge-faint, #2A241A)",
    shadow: "inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -7px 10px -8px rgba(0, 0, 0, .95)",
    liveBg: "linear-gradient(180deg, #1B150B, #120E07)",
    liveBorder: "1px solid var(--iw-th-brass, #8A6B2E)",
    // Per Curtis (2026-09) the live button's glow carries the discipline colour:
    // the bloom + 1px ring are mixed from the inherited `--fs-skill-accent`
    // (ember `#D8791F` is the pre-classify fallback). The plate bg/border stay
    // neutral-warm. Mirror of `--fs-forge-live-shadow` in skillpanel.css.
    liveTint: "var(--fs-skill-accent, #D8791F)",
    liveShadow: "inset 0 0 12px -2px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 55%, transparent), inset 0 1px 0 rgba(255, 216, 150, .18), 0 0 0 1px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 16%, transparent)"
  };
  var ACTION_ART = {
    idle: {
      "background": "var(--fs-button-background, transparent var(--fs-skills-ui-atlas) var(--fs-ui-action-idle-position) / var(--fs-ui-action-idle-size) no-repeat)",
      "border": "0",
      "box-shadow": "none",
      "text-shadow": "0 1px 0 rgba(0, 0, 0, .85), 0 0 8px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 42%, transparent)"
    },
    disabled: {
      "background": "var(--fs-button-background, transparent var(--fs-skills-ui-atlas) var(--fs-ui-action-disabled-position) / var(--fs-ui-action-disabled-size) no-repeat)",
      "border": "0",
      "box-shadow": "none",
      "text-shadow": "0 1px 0 rgba(0, 0, 0, .85)"
    }
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
      "transition": "var(--fs-button-transition, background .13s, border-color .13s, color .13s, box-shadow .13s)",
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
  function compactCommandButton(btn) {
    return document.documentElement?.dataset?.iwSkillCardDesign === "new" && !!btn.closest?.(".compact-panel.fs-skill-panel");
  }
  function styleButton(btn) {
    const role2 = btn.getAttribute(ROLE_ATTR) || "";
    if (role2 === "level-progress") {
      buttonStyleOwner.restoreElement(btn);
      delete btn.dataset.iwBtnState;
      buttonStyleSnapshots.delete(btn);
      return;
    }
    const classifiedState = classifyButton(btn);
    const state = role2 === "action-button" && classifiedState !== "disabled" ? "primary" : classifiedState;
    const art2 = role2 === "action-button" && btn.closest('[data-iw-skills-ui-ready="1"]') ? ACTION_ART[state === "disabled" ? "disabled" : "idle"] : null;
    const compact = compactCommandButton(btn);
    const currentStyle = btn.getAttribute("style") || "";
    const previous = buttonStyleSnapshots.get(btn);
    if (previous && previous.state === state && previous.role === role2 && previous.art === !!art2 && previous.compact === compact && previous.style === currentStyle) return;
    for (const [prop, value] of Object.entries(BUTTON_STYLES.base)) {
      setOwnedStyle(buttonStyleOwner, btn, prop, value);
    }
    for (const [prop, value] of Object.entries({ ...BUTTON_STYLES[state], ...art2 })) {
      setOwnedStyle(buttonStyleOwner, btn, prop, value);
    }
    if (role2 === "nav-button") {
      setOwnedStyle(buttonStyleOwner, btn, "width", compact ? "var(--iw-skill-v2-nav-w, 39px)" : NAV_BUTTON_W);
      setOwnedStyle(buttonStyleOwner, btn, "min-width", compact ? "var(--iw-skill-v2-nav-w, 39px)" : NAV_BUTTON_W);
      setOwnedStyle(buttonStyleOwner, btn, "height", compact ? "var(--iw-skill-v2-nav-h, 22px)" : "44px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", compact ? "var(--iw-skill-v2-nav-h, 22px)" : "44px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", "0");
      setOwnedStyle(buttonStyleOwner, btn, "background", `var(--fs-button-background, ${FORGE.bg})`);
      setOwnedStyle(buttonStyleOwner, btn, "border", `var(--fs-button-border, ${FORGE.border})`);
      setOwnedStyle(buttonStyleOwner, btn, "border-radius", compact ? "var(--iw-skill-v2-nav-radius, 2px)" : "2px");
      setOwnedStyle(buttonStyleOwner, btn, "box-shadow", `var(--fs-button-shadow, ${FORGE.shadow})`);
      setOwnedStyle(buttonStyleOwner, btn, "color", "transparent");
      setOwnedStyle(buttonStyleOwner, btn, "font-size", "0");
    } else if (role2 === "action-button") {
      setOwnedStyle(buttonStyleOwner, btn, "width", compact ? "var(--iw-skill-v2-btn-w, 90px)" : "155px");
      setOwnedStyle(buttonStyleOwner, btn, "min-width", compact ? "var(--iw-skill-v2-btn-w, 90px)" : "155px");
      setOwnedStyle(buttonStyleOwner, btn, "height", compact ? "var(--iw-skill-v2-btn-h, 94px)" : "44px");
      setOwnedStyle(buttonStyleOwner, btn, "min-height", compact ? "var(--iw-skill-v2-btn-h, 94px)" : "44px");
      setOwnedStyle(buttonStyleOwner, btn, "padding", compact ? "var(--iw-skill-v2-btn-pad, 44px 4px 8px)" : "0 12px");
      if (compact) {
        setOwnedStyle(buttonStyleOwner, btn, "font-size", "var(--iw-skill-v2-btn-font, 0px)");
        setOwnedStyle(buttonStyleOwner, btn, "letter-spacing", "var(--iw-skill-v2-btn-tracking, 0.09em)");
      }
      if (compact) {
        setOwnedStyle(buttonStyleOwner, btn, "border", "var(--fs-button-border, 3px double #96bddf)");
        setOwnedStyle(buttonStyleOwner, btn, "box-shadow", "var(--fs-button-shadow, none)");
        setOwnedStyle(buttonStyleOwner, btn, "border-radius", "8px");
      }
    }
    if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
    buttonStyleSnapshots.set(btn, { state, role: role2, art: !!art2, compact, style: btn.getAttribute("style") || "" });
  }
  var NAV_BUTTON_W = "26px";
  var LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?(?:\s*[-\u2013]\s*\d+(?:\.\d+)?%\s*[\u2022\u00b7]\s*[\d,]+\s+(?:xp\s+)?to\s+go|\s*[\u2022\u00b7]\s*[\d,]+\s*\/\s*[\d,]+\s*xp)$/i;
  var LEVEL_READOUT_LOOSE = /^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-\u2013\u2014\u2022\u00b7:|]\s*\S.*(?:xp|to\s+go|%)$/i;
  var XP_READOUT_TITLE = /\bxp display\b/i;
  var XP_LINE_ATTR = "data-iw-skill-v2-xp";
  function isLevelReadoutText(text) {
    return LEVEL_PROGRESS_PATTERN.test(text) || LEVEL_READOUT_LOOSE.test(text);
  }
  function findHookedReadout(panel) {
    for (const el2 of panel.querySelectorAll("[title]")) {
      if (!XP_READOUT_TITLE.test(el2.getAttribute("title") || "")) continue;
      if (el2.closest(`[${XP_LINE_ATTR}], [data-iw-skill-v2-level-readout]`)) continue;
      return el2;
    }
    return null;
  }
  var READOUT_STYLES = {
    // `background` is a SHORTHAND: it already resets background-color and
    // background-image to their initial values. Listing those longhands here as
    // well made every reconcile pass rewrite the declaration in two different
    // serialisations (`none` then `none transparent`), so the style attribute
    // genuinely CHANGED twice per pass — which DOMWatcher observes, which queues
    // the panel again, which reconciles again. A quiet page drove ~120 flushes a
    // second off nothing but this. Keep the shorthand alone.
    "background": "none",
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
  function readoutCursor(el2) {
    return el2.matches?.('button, a, [role="button"], [tabindex]:not([tabindex="-1"])') ? "pointer" : "default";
  }
  function sameTextShellChain(el2, panel) {
    if (!el2) return [];
    const text = normText(el2.textContent);
    const chain = [el2];
    let cur = el2;
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
  function outerSameTextShell(el2, panel) {
    const chain = sameTextShellChain(el2, panel);
    return chain[chain.length - 1] || el2;
  }
  function readoutBranch(el2, panel) {
    if (!el2) return [];
    const branch = [el2];
    const readoutText = normText(el2.textContent);
    let cur = el2;
    for (let depth = 0; depth < 10; depth += 1) {
      const parent = cur.parentElement;
      if (!parent || parent === panel) break;
      if (parent.matches?.('button,a,input,select,textarea,[role="button"]')) break;
      const parentText = normText(parent.textContent);
      if (!parentText.includes(readoutText)) break;
      const ownsOtherRole = [...parent.querySelectorAll(`[${ROLE_ATTR}]`)].some((node2) => {
        if (node2 === el2 || branch.includes(node2)) return false;
        const role2 = node2.getAttribute(ROLE_ATTR);
        return role2 && role2 !== "level-progress";
      });
      const ownsOtherControl = [...parent.querySelectorAll('button,a,input,select,textarea,[role="button"]')].some((control) => control !== el2 && !branch.includes(control));
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
      readout = [...panel.querySelectorAll("div,span,p,strong")].find((el2) => {
        if (el2.closest('button,a,[role="button"]')) return false;
        return isLevelReadoutText(normText(el2.textContent));
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
      setOwnData(target, "iwReadout", "1");
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
  var INGR_COUNT_PATTERN = /([\d,]+)\s*\/\s*([\d,]+)/g;
  var INGR_STYLES = {
    // Shorthand only — see READOUT_STYLES above for why the background-color
    // longhand must not be listed alongside it.
    "background": "none",
    "border": "none",
    "border-radius": "0",
    "padding": "0",
    "box-shadow": "none"
  };
  function supportsIngredientHighlights() {
    return !!globalThis.CSS?.highlights && typeof globalThis.Highlight === "function";
  }
  function pointAtTextOffset(root, targetOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node2;
    while (node2 = walker.nextNode()) {
      const end = offset + (node2.nodeValue?.length || 0);
      if (targetOffset <= end) return { node: node2, offset: targetOffset - offset };
      offset = end;
    }
    return null;
  }
  function elementTextStarts(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const starts = [];
    let offset = 0;
    let lastParent = null;
    for (let node2 = walker.nextNode(); node2; node2 = walker.nextNode()) {
      if (node2.parentElement !== lastParent) {
        starts.push(offset);
        lastParent = node2.parentElement;
      }
      offset += node2.nodeValue?.length || 0;
    }
    return starts;
  }
  function entryStart(text, starts, matchIndex2, previousEnd) {
    const bulletStart = text.lastIndexOf("•", matchIndex2 - 1) + 1;
    const lineStart = text.lastIndexOf("\n", matchIndex2 - 1) + 1;
    let elementStart = 0;
    for (const offset of starts) {
      if (offset > matchIndex2) break;
      elementStart = offset;
    }
    return Math.max(bulletStart, lineStart, elementStart, previousEnd);
  }
  function completedIngredientRanges(root) {
    const text = root.textContent || "";
    const elementStarts = elementTextStarts(root);
    const ranges = [];
    INGR_COUNT_PATTERN.lastIndex = 0;
    let match;
    let previousEnd = 0;
    while (match = INGR_COUNT_PATTERN.exec(text)) {
      const matchEnd = match.index + match[0].length;
      const start0 = entryStart(text, elementStarts, match.index, previousEnd);
      previousEnd = matchEnd;
      const owned3 = Number(match[1].replaceAll(",", ""));
      const required = Number(match[2].replaceAll(",", ""));
      if (!Number.isFinite(owned3) || !Number.isFinite(required) || owned3 < required) continue;
      let start2 = start0;
      let end = matchEnd;
      while (start2 < end && /\s/.test(text[start2])) start2 += 1;
      while (end > start2 && /\s/.test(text[end - 1])) end -= 1;
      const from = pointAtTextOffset(root, start2);
      const to = pointAtTextOffset(root, end);
      if (!from || !to) continue;
      const range = document.createRange();
      try {
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        ranges.push(range);
      } catch {
      }
    }
    return ranges;
  }
  function ingredientEntries(root) {
    const text = root.textContent || "";
    const elementStarts = elementTextStarts(root);
    const entries = [];
    INGR_COUNT_PATTERN.lastIndex = 0;
    let match;
    let previousEnd = 0;
    while (match = INGR_COUNT_PATTERN.exec(text)) {
      const matchEnd = match.index + match[0].length;
      const start2 = entryStart(text, elementStarts, match.index, previousEnd);
      previousEnd = matchEnd;
      const owned3 = Number(match[1].replaceAll(",", ""));
      const required = Number(match[2].replaceAll(",", ""));
      if (!Number.isFinite(owned3) || !Number.isFinite(required)) continue;
      entries.push({
        text: text.slice(start2, matchEnd).trim(),
        state: owned3 >= required ? "met" : "unmet"
      });
    }
    return entries.filter((entry2) => entry2.text);
  }
  function rebuildIngredientHighlight() {
    if (!supportsIngredientHighlights()) return;
    const ranges = [];
    for (const [panel, panelRanges] of [...ingredientHighlightRanges.entries()]) {
      if (!panel.isConnected) {
        ingredientHighlightRanges.delete(panel);
        continue;
      }
      ranges.push(...panelRanges.filter((range) => range.startContainer?.isConnected));
    }
    try {
      if (ranges.length) globalThis.CSS.highlights.set(MET_INGREDIENT_HIGHLIGHT, new globalThis.Highlight(...ranges));
      else globalThis.CSS.highlights.delete(MET_INGREDIENT_HIGHLIGHT);
    } catch {
    }
  }
  function updateIngredientHighlights(panel) {
    if (!supportsIngredientHighlights()) return;
    const hosts = [...panel.querySelectorAll("[data-iw-ingr]")].filter((el2) => !el2.parentElement?.closest?.("[data-iw-ingr]"));
    ingredientHighlightRanges.set(panel, hosts.flatMap(completedIngredientRanges));
    rebuildIngredientHighlight();
  }
  function clearIngredientHighlights(panel) {
    if (panel) ingredientHighlightRanges.delete(panel);
    else ingredientHighlightRanges.clear();
    if (!supportsIngredientHighlights()) return;
    if (panel) rebuildIngredientHighlight();
    else globalThis.CSS.highlights.delete(MET_INGREDIENT_HIGHLIGHT);
  }
  function removeIngredientList(source, list) {
    if (source?.isConnected) delete source.dataset.iwIngredientListSource;
    list?.remove();
    ingredientLists.delete(source);
  }
  function updateIngredientLists(panel) {
    const sources = [...panel.querySelectorAll("[data-iw-ingr]")].filter((el2) => !el2.parentElement?.closest?.("[data-iw-ingr]"));
    const current = new Set(sources);
    for (const [source, list] of [...ingredientLists.entries()]) {
      if (!source.isConnected || source.closest(".compact-panel") === panel && !current.has(source)) {
        removeIngredientList(source, list);
      }
    }
    for (const source of sources) {
      const entries = ingredientEntries(source);
      if (!entries.length) {
        removeIngredientList(source, ingredientLists.get(source));
        continue;
      }
      let list = ingredientLists.get(source);
      if (!list?.isConnected) {
        list = document.createElement("div");
        list.className = "fs-skill-ingredient-grid";
        list.dataset.iwSkillIngredientList = "1";
        list.setAttribute("role", "list");
        list.setAttribute("aria-label", "Required materials");
        ingredientLists.set(source, list);
      }
      const signature2 = entries.map((entry2) => `${entry2.state}:${entry2.text}`).join("");
      if (list.dataset.iwIngredientSignature !== signature2) {
        const fragment = document.createDocumentFragment();
        for (const entry2 of entries) {
          const item = document.createElement("span");
          item.className = "fs-skill-ingredient-item";
          item.dataset.iwIngredientState = entry2.state;
          item.setAttribute("role", "listitem");
          item.textContent = entry2.text;
          fragment.appendChild(item);
        }
        list.replaceChildren(fragment);
        list.dataset.iwIngredientSignature = signature2;
      }
      source.dataset.iwIngredientListSource = "1";
      if (source.nextElementSibling !== list) source.after(list);
    }
  }
  function clearIngredientLists(panel) {
    for (const [source, list] of [...ingredientLists.entries()]) {
      if (!panel || !source.isConnected || source.closest(".compact-panel") === panel) {
        removeIngredientList(source, list);
      }
    }
    const root = panel || document;
    root.querySelectorAll("[data-iw-ingredient-list-source]").forEach((el2) => {
      delete el2.dataset.iwIngredientListSource;
    });
    root.querySelectorAll("[data-iw-skill-ingredient-list]").forEach((el2) => el2.remove());
  }
  function neutraliseIngredients(panel) {
    const readouts = [...panel.querySelectorAll(`[${ROLE_ATTR}="level-progress"], [${XP_LINE_ATTR}]`)];
    for (const el2 of panel.querySelectorAll("div, span, p")) {
      if (el2.closest('[data-iw-skill-ingredient-list="1"]')) continue;
      if (el2.closest("[data-iw-skill-v2-summary], [data-iw-skill-v2-body], [data-iw-skill-v2-controls]")) continue;
      if (el2.tagName === "BUTTON" || el2.closest('button, a, [role="button"]')) continue;
      if (el2.childElementCount > 3) continue;
      const text = normText(el2.textContent);
      const matches = INGR_PATTERN.test(text) && !readouts.some((readout) => el2.contains(readout) || readout.contains(el2));
      if (!matches) {
        if (el2.dataset.iwIngr) {
          ingredientStyleOwner.restoreElement(el2);
          delete el2.dataset.iwIngr;
        }
        ingredientStyleSnapshots.delete(el2);
        continue;
      }
      const chain = sameTextShellChain(el2, panel);
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
    updateIngredientHighlights(panel);
    updateIngredientLists(panel);
  }
  function setRole(el2, role2) {
    if (el2 && el2.getAttribute(ROLE_ATTR) !== role2) el2.setAttribute(ROLE_ATTR, role2);
    return el2;
  }
  function clearStructureRoles(panel) {
    panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}], [${SHELL_ATTR}], [data-iw-nav-direction], [data-iw-req-state]`).forEach((el2) => {
      el2.removeAttribute(ROLE_ATTR);
      el2.removeAttribute(ZONE_ATTR);
      el2.removeAttribute(SHELL_ATTR);
      el2.removeAttribute("data-iw-req-state");
      delete el2.dataset.iwNavDirection;
    });
    delete panel.dataset.iwSkillLayout;
  }
  function childUnder(container, el2) {
    if (!container || !el2 || !container.contains(el2)) return null;
    let cur = el2;
    while (cur && cur.parentElement !== container) cur = cur.parentElement;
    return cur?.parentElement === container ? cur : null;
  }
  function commonAncestorWithin(panel, elements) {
    const nodes = elements.filter(Boolean);
    if (!nodes.length || nodes.some((node2) => !panel.contains(node2))) return null;
    let cur = nodes[0];
    while (cur && cur !== panel) {
      if (nodes.every((node2) => cur.contains(node2))) return cur;
      cur = cur.parentElement;
    }
    return panel;
  }
  function isPresentationHidden(el2) {
    if (!el2 || el2.hidden || el2.getAttribute?.("aria-hidden") === "true") return true;
    try {
      const cs = getComputedStyle(el2);
      return cs.display === "none" || cs.visibility === "hidden" || cs.contentVisibility === "hidden";
    } catch {
      return false;
    }
  }
  function visibleFirst(elements) {
    return elements.map((el2) => [el2, isPresentationHidden(el2)]).sort((a, b) => Number(a[1]) - Number(b[1])).map(([el2]) => el2);
  }
  var lastCandidatePanel = null;
  var lastCandidates = null;
  function textCandidates(panel) {
    if (lastCandidatePanel === panel) return lastCandidates;
    const candidates = visibleFirst([...panel.querySelectorAll("h1,h2,h3,h4,div,span,p")].filter((el2) => !el2.closest("button, a, [data-iw-skill-v2-controls], [data-iw-skill-v2-body], [data-iw-skill-v2-action-label], [data-iw-skill-v2-action-glyph], [data-iw-skill-v2-level-readout], [data-iw-skill-v2-xp]")).filter((el2) => normText(el2.textContent).length <= 130));
    lastCandidatePanel = panel;
    lastCandidates = candidates;
    return candidates;
  }
  function findBestText(panel, predicate) {
    const candidates = textCandidates(panel);
    const exactOwn = candidates.find((el2) => predicate(normText(el2.childElementCount ? "" : el2.textContent), el2));
    if (exactOwn) return exactOwn;
    const matches = candidates.filter((el2) => predicate(normText(el2.textContent), el2));
    return matches.find((el2) => !matches.some((inner) => inner !== el2 && el2.contains(inner))) || matches[0] || null;
  }
  function findProgress(panel) {
    const semantic = panel.querySelector('[role="progressbar"]');
    if (semantic) {
      const fill = semantic.firstElementChild || null;
      return { track: semantic, fill };
    }
    for (const el2 of panel.querySelectorAll("div")) {
      if (el2.children.length !== 1) continue;
      const child = el2.firstElementChild;
      const cls = `${el2.className || ""} ${child?.className || ""}`;
      const widthStyle = child?.style?.width || "";
      const likelyClass = /progress|h-(?:1|1\.5|2|2\.5)|bg-(?:orange|green|emerald|primary|accent)/i.test(cls);
      if (!likelyClass && !/%$/.test(widthStyle)) continue;
      const rect = el2.getBoundingClientRect?.();
      if (rect && (rect.height < 2 || rect.height > 14 || rect.width < 100)) continue;
      return { track: el2, fill: child };
    }
    return { track: null, fill: null };
  }
  var structureSignatures = /* @__PURE__ */ new WeakMap();
  var structureText = (value) => normText(value).replace(/\d[\d,.]*/g, "#");
  function structureSignature(panel, type) {
    const keyDisabled = type === "locked";
    const buttonState = [...panel.querySelectorAll("button")].map((btn) => {
      const disabled = keyDisabled && (btn.disabled || btn.getAttribute("aria-disabled") === "true") ? "1" : "0";
      return `${disabled}:${structureText(btn.textContent)}:${structureText(btn.getAttribute("aria-label"))}`;
    }).join("|");
    const hasRequirement = /(?:needs|requires)\b/i.test(panel.textContent || "") ? "r" : "-";
    return `${hasRequirement}${type}\0${panel.childElementCount}\0${buttonState}`;
  }
  var UNMET_CLASS = /\btext-(?:red|rose|orange|amber|yellow)-\d|\b(?:text-danger|text-warning)\b/;
  function syncRequirementState(panel) {
    panel.querySelectorAll(`[${ROLE_ATTR}="requirement"]`).forEach((shell) => {
      const classes = [shell, ...shell.querySelectorAll("*")].map((el2) => typeof el2.className === "string" ? el2.className : "").join(" ");
      const state = UNMET_CLASS.test(classes) ? "unmet" : "met";
      if (shell.getAttribute("data-iw-req-state") !== state) shell.setAttribute("data-iw-req-state", state);
    });
  }
  function annotateStructure(panel, type, meta) {
    const sig = structureSignature(panel, type);
    if (structureSignatures.get(panel) === sig) return;
    lastCandidatePanel = null;
    lastCandidates = null;
    clearStructureRoles(panel);
    const identityLabels = (meta.labels || [meta.label]).map((label4) => label4.toLowerCase());
    let identity = findBestText(panel, (text) => identityLabels.includes(textWithoutLeadingGlyph(text).toLowerCase()));
    if (!identity) {
      identity = findBestText(panel, (text) => {
        const clean = textWithoutLeadingGlyph(text).toLowerCase();
        return identityLabels.some((label4) => clean === label4 || clean.startsWith(`${label4} `));
      });
    }
    if (!identity) {
      identity = textCandidates(panel).find((el2) => {
        const directText = [...el2.childNodes].map((node2) => normText(node2.textContent)).filter(Boolean).join(" ");
        const clean = textWithoutLeadingGlyph(directText).toLowerCase();
        return identityLabels.some((label4) => clean === label4 || clean.startsWith(`${label4} `));
      }) || null;
    }
    if (identity) {
      const shell = outerSameTextShell(identity, panel);
      setRole(shell, "identity");
    }
    const actionWord = (meta.titleActions || meta.actions).join("|");
    const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, "i");
    let actionTitle = findBestText(panel, (text, el2) => {
      if (!text || text.length > 90 || !actionTitleRe.test(textWithoutLeadingGlyph(text))) return false;
      if (el2.closest(".iw-item-ref")) return false;
      if (el2.matches?.(`[${ROLE_ATTR}="identity"]`) || el2.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
      return true;
    });
    if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), "action-title");
    const buttons = visibleFirst([...panel.querySelectorAll("button")]);
    const hookedReadout = findHookedReadout(panel);
    const levelProgressButton = (hookedReadout?.tagName === "BUTTON" ? hookedReadout : null) || buttons.find((btn) => isLevelReadoutText(normText(btn.textContent))) || null;
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
        actionTitle = findBestText(panel, (text, el2) => {
          const clean = textWithoutLeadingGlyph(text).toLowerCase();
          if (!(clean === needle || clean.startsWith(`${needle} `))) return false;
          if (el2.closest(".iw-item-ref")) return false;
          if (el2.matches?.(`[${ROLE_ATTR}="identity"]`) || el2.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
          return true;
        });
        if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), "action-title");
      }
    }
    if (!actionTitle && levelProgressButton) {
      const readoutShell = outerSameTextShell(levelProgressButton, panel);
      const candidate = readoutShell?.previousElementSibling || null;
      const candidateText = candidate ? normText(candidate.textContent) : "";
      const usable = candidate && candidateText && candidateText.length <= 90 && !candidate.getAttribute(ROLE_ATTR) && !candidate.querySelector?.(`[${ROLE_ATTR}], button, a, input, select, textarea`) && !candidate.closest?.(`[${ROLE_ATTR}="identity"]`) && !candidate.closest?.(".iw-item-ref") && !isLevelReadoutText(candidateText);
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
      const readout = hookedReadout || findBestText(panel, (text) => isLevelReadoutText(text));
      if (readout) setRole(readout, "level-progress");
    }
    const xpGain = findBestText(panel, (text) => /^\d[\d,]*\s*xp$/i.test(text));
    if (xpGain) setRole(outerSameTextShell(xpGain, panel), "xp-gain");
    const requirement = findBestText(panel, (text) => /^(?:needs|requires)\b/i.test(text));
    if (requirement) {
      const reqShell = outerSameTextShell(requirement, panel);
      setRole(reqShell, "requirement");
    }
    const reward2 = findBestText(panel, (text) => /^base reward\s*:/i.test(text));
    if (reward2) setRole(outerSameTextShell(reward2, panel), "reward");
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
    const shellChildren = supportedShell ? [...layoutShell.children].filter((el2) => !el2.classList.contains("fs-skill-header")) : [];
    const distinctZones = identityZone && contentZone && commandZone && (/* @__PURE__ */ new Set([identityZone, contentZone, commandZone])).size === 3;
    if (distinctZones) {
      if (layoutShell !== panel) layoutShell.setAttribute(SHELL_ATTR, "1");
      identityZone.setAttribute(ZONE_ATTR, "identity");
      contentZone.setAttribute(ZONE_ATTR, "content");
      commandZone.setAttribute(ZONE_ATTR, "commands");
      const identityLeaves = [...identityZone.querySelectorAll("span,div,p,strong")].filter((el2) => el2.childElementCount === 0);
      const identityLevel = identityLeaves.find((el2) => /^(?:lv|level)\s*(?:\d+|[—–-])/i.test(normText(el2.textContent))) || null;
      if (identityLevel) setRole(identityLevel, "identity-level");
      const identityIcon = identityLeaves.find((el2) => {
        if (el2 === identity || el2 === identityLevel || el2.closest(`[${ROLE_ATTR}="identity"]`)) return false;
        const text = normText(el2.textContent);
        return text && text.length <= 4 && /[^a-z0-9]/i.test(text);
      }) || null;
      if (identityIcon) setRole(identityIcon, "identity-icon");
      const functionalZones = /* @__PURE__ */ new Set([identityZone, contentZone, commandZone]);
      const unexpectedFlowChild = shellChildren.some((el2) => {
        if (functionalZones.has(el2)) return false;
        if (el2.matches?.(`[${ROLE_ATTR}="progress-track"]`) || el2.querySelector?.(`[${ROLE_ATTR}="progress-track"]`)) return false;
        if (el2.matches?.("[data-iw-skill-v2-row]")) return false;
        if (el2.matches?.("[data-iw-skill-v2-action-glyph],[data-iw-skill-v2-action-label]")) return false;
        try {
          const cs = getComputedStyle(el2);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "absolute" || cs.position === "fixed") return false;
        } catch {
        }
        const rect = el2.getBoundingClientRect?.();
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
      if (SkillsArtService.paintIcon(artHost, type)) setOwnData(artHost, "iwSkillArtReady", "1");
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
    const reward2 = panel.querySelector(`[${ROLE_ATTR}="reward"]`);
    const rewardText = normText(reward2?.textContent);
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
    const frame2 = skillActionsFrame(panel);
    if (!frame2) return;
    if (!frame2.classList.contains("fs-skills-section-frame")) frame2.classList.add("fs-skills-section-frame");
    const paint2 = () => SkillsArtService.decoratePanel(frame2);
    if (SkillsArtService.isReady()) paint2();
    else SkillsArtService.ready().then(paint2).catch(() => {
    });
  }
  function setOwnText(el2, value) {
    if (el2 && el2.textContent !== value) el2.textContent = value;
  }
  function setOwnData(el2, key, value) {
    if (el2.dataset[key] !== value) el2.dataset[key] = value;
  }
  function ensureSkillPresentation(panel, meta) {
    ensureSkillActionsFrame(panel);
    const identity = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
    const title = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
    const levelProgress = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
    if (identity) {
      setOwnData(identity, "iwCleanText", meta.label);
    }
    if (title) setOwnData(title, "iwCleanText", textWithoutLeadingGlyph(title.textContent));
    if (levelProgress) setOwnData(levelProgress, "iwProgressDisplay", centralProgressText(levelProgress.textContent));
    const identityZone = panel.querySelector(`[${ZONE_ATTR}="identity"]`);
    if (identityZone) {
      const percentValue = progressPercent(panel);
      let percent2 = identityZone.querySelector(":scope > .fs-skill-identity-percent");
      if (percentValue) {
        if (!percent2) {
          percent2 = document.createElement("span");
          percent2.className = "fs-skill-identity-percent";
          percent2.setAttribute("aria-hidden", "true");
          identityZone.appendChild(percent2);
        }
        setOwnText(percent2, displayPercent(percentValue));
      } else {
        percent2?.remove();
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
      const amount2 = baseExpValue(panel);
      let plaque = contentZone.querySelector(":scope > .fs-skill-base-exp");
      if (amount2) {
        if (!plaque) {
          plaque = document.createElement("span");
          plaque.className = "fs-skill-base-exp";
          plaque.setAttribute("aria-hidden", "true");
          contentZone.appendChild(plaque);
        }
        setOwnText(plaque, `Base: ${amount2}`);
        setOwnData(plaque, "iwBaseExp", amount2);
      } else {
        plaque?.remove();
      }
    }
  }
  function applyPanelTreatment(panel, type, meta) {
    annotateStructure(panel, type, meta);
    syncRequirementState(panel);
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
    panel.querySelectorAll("[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]").forEach((el2) => {
      delete el2.dataset.iwReadout;
      delete el2.dataset.iwIngr;
      delete el2.dataset.iwBtnState;
      buttonStyleSnapshots.delete(el2);
      readoutStyleSnapshots.delete(el2);
      ingredientStyleSnapshots.delete(el2);
    });
  }
  function ownsPanel(panel) {
    return panel.hasAttribute(RENDERED_ATTR2) || panel.classList.contains("fs-skill-panel");
  }
  function clearPanelChrome(panel) {
    structureSignatures.delete(panel);
    clearIngredientHighlights(panel);
    clearIngredientLists(panel);
    clearPanelInlineTreatment(panel);
    SkillsArtService.clearPanel(panel);
    panel.querySelectorAll(".fs-skill-medallion-art, .fs-skill-identity-percent, .fs-skill-identity-progress, .fs-skill-base-exp").forEach((el2) => el2.remove());
    panel.querySelectorAll("[data-iw-clean-text], [data-iw-base-exp], [data-iw-progress-display]").forEach((el2) => {
      delete el2.dataset.iwCleanText;
      delete el2.dataset.iwBaseExp;
      delete el2.dataset.iwProgressDisplay;
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
    setOwnData(panel, "iwUi", "skill-panel");
    setOwnData(panel, "iwSkill", type);
    setOwnData(panel, "iwSkillGlyph", meta.glyph);
    if (panel.dataset.fsSkillLabel !== meta.label) panel.dataset.fsSkillLabel = meta.label;
  }
  function renderPanel(panel, skillType) {
    if (!panel || !panel.isConnected) return;
    if (!SKILL_META[skillType]) {
      if (ownsPanel(panel)) clearPanelChrome(panel);
      return;
    }
    const meta = SKILL_META[skillType];
    applyPanelChrome(panel, skillType, meta);
    if (panel.getAttribute(RENDERED_ATTR2) !== skillType) panel.setAttribute(RENDERED_ATTR2, skillType);
    applyPanelTreatment(panel, skillType, meta);
  }
  function clearSkillPanels() {
    guardEach("skill:teardown", document.querySelectorAll(".compact-panel"), clearPanelChrome);
    document.querySelectorAll(".fs-skills-section-frame").forEach((frame2) => {
      SkillsArtService.clearPanel(frame2);
      frame2.classList.remove("fs-skills-section-frame");
    });
    buttonStyleOwner.restoreAll();
    readoutStyleOwner.restoreAll();
    ingredientStyleOwner.restoreAll();
    clearIngredientHighlights();
    clearIngredientLists();
    document.querySelectorAll("[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]").forEach((el2) => {
      delete el2.dataset.iwReadout;
      delete el2.dataset.iwIngr;
      delete el2.dataset.iwBtnState;
    });
  }
  function initSkillPanelRenderer() {
    inject("skillpanel", skillpanel_default);
    if (listenerBound2) return;
    listenerBound2 = true;
    on("iw:skill-panel", (e) => guard("skill:panel", () => renderPanel(e.detail.panel, e.detail.skill)));
  }

  // src/modules/ProgressCadence.js
  var PROGRESS_EPSILON = 0.05;
  var PROGRESS_LEAD_BIAS = 1.12;
  var PROGRESS_DURATION_EPSILON_MS = 15;
  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function sampleProgress(samples, key, pct, at = nowMs()) {
    const none = { reset: false, durationMs: null };
    if (pct === null || !Number.isFinite(pct)) return none;
    const state = samples.get(key);
    if (!state) {
      samples.set(key, { pct, at, deltas: [], afterReset: false });
      return none;
    }
    if (Math.abs(pct - state.pct) < PROGRESS_EPSILON) return none;
    const out = { reset: false, durationMs: null };
    if (pct < state.pct - PROGRESS_EPSILON) {
      out.reset = true;
      state.afterReset = true;
    } else {
      const delta = at - state.at;
      if (delta >= 60 && delta <= 4e3 && !state.afterReset) {
        state.deltas.push(delta);
        if (state.deltas.length > 5) state.deltas.shift();
        if (state.deltas.length >= 3) {
          const ms = Math.min(4e3, Math.max(60, median(state.deltas))) * PROGRESS_LEAD_BIAS;
          if (state.appliedDurationMs === void 0 || Math.abs(ms - state.appliedDurationMs) >= PROGRESS_DURATION_EPSILON_MS) {
            state.appliedDurationMs = ms;
            out.durationMs = ms;
          }
        }
      }
      state.afterReset = false;
    }
    state.pct = pct;
    state.at = at;
    return out;
  }
  function formatDuration(ms) {
    return (ms / 1e3).toFixed(3) + "s";
  }

  // src/modules/SkillCardDesignController.js
  var DESIGN_ATTR = "data-iw-skill-card-design";
  var FRAME_SECTIONS = ["materials", "sources", "details"];
  var bound = false;
  var active = false;
  function setData2(el2, key, value) {
    if (!el2) return;
    const next = String(value);
    if (el2.dataset[key] !== next) el2.dataset[key] = next;
  }
  function setText(el2, value) {
    if (el2 && el2.textContent !== value) el2.textContent = value;
  }
  function markSections(panel) {
    const desired = /* @__PURE__ */ new Map();
    for (const [name, selector] of [
      ["requirements", '[data-iw-skill-role="requirement"]'],
      ["materials", "[data-iw-skill-ingredient-list],.fs-skill-ingredient-grid"],
      ["details", '[data-iw-skill-role="action-detail"]'],
      ["rewards", '[data-iw-skill-role="reward"]']
    ]) panel.querySelectorAll(selector).forEach((el2) => desired.set(el2, name));
    const content = panel.querySelector('[data-iw-skill-zone="content"]');
    content?.querySelectorAll("p,span").forEach((el2) => {
      if (el2.closest('[class*="iw-skill-v2"],.fs-skill-ingredient-grid,button,a,[data-iw-skill-role="level-progress"]')) return;
      if (el2.querySelector("p,span,button,a")) return;
      const text = (el2.textContent || "").trim();
      if (/missing materials|will queue|queued|queue first/i.test(text)) desired.set(el2, "queue");
      else if (/^(?:gather|harvest|obtain|found|source).*\b(?:from|in|at)\b/i.test(text) && !el2.matches('[data-iw-skill-role="action-title"]')) desired.set(el2, "sources");
    });
    desired.forEach((name, el2) => {
      if (name === "details" && /queue|missing materials/i.test(el2.textContent || "")) desired.set(el2, "queue");
    });
    panel.querySelectorAll("[data-iw-skill-v2-section]").forEach((el2) => {
      const next = desired.get(el2);
      if (!next) delete el2.dataset.iwSkillV2Section;
      else if (el2.dataset.iwSkillV2Section !== next) el2.dataset.iwSkillV2Section = next;
      desired.delete(el2);
    });
    desired.forEach((name, el2) => {
      el2.dataset.iwSkillV2Section = name;
    });
  }
  function levelReadout(panel) {
    const zone = panel.querySelector('[data-iw-skill-zone="identity"]');
    if (!zone) return;
    const text = panel.querySelector('[data-iw-skill-role="level-progress"]')?.textContent || "";
    const zoneText = zone.textContent || "";
    const pct = (panel.querySelector(".fs-skill-identity-percent")?.textContent || "").match(/(\d+(?:\.\d+)?)\s*%/) || text.match(/(\d+(?:\.\d+)?)\s*%/) || zoneText.match(/(\d+(?:\.\d+)?)\s*%/);
    const lvl = text.match(/\bLv\s*([\d]+(?:\s*\+\s*\d+)?|-)/i) || zoneText.match(/\bLv\s*([\d]+(?:\s*\+\s*\d+)?|-)/i);
    const value = pct ? Math.max(0, Math.min(100, Number(pct[1]))) : 0;
    const progress = `${Number.isFinite(value) ? value : 0}%`;
    if (panel.style.getPropertyValue("--iw-skill-v2-progress") !== progress) {
      panel.style.setProperty("--iw-skill-v2-progress", progress);
    }
    let out = zone.querySelector(":scope > [data-iw-skill-v2-level-readout]");
    if (!out) {
      out = document.createElement("span");
      out.dataset.iwSkillV2LevelReadout = "1";
      out.className = "iw-skill-v2-level-readout";
      const a = document.createElement("span");
      a.className = "iw-skill-v2-level";
      const b = document.createElement("span");
      b.className = "iw-skill-v2-percent";
      out.append(a, b);
      zone.append(out);
    }
    setText(out.children[0], lvl ? `Lv ${lvl[1].replace(/\s+/g, " ")}` : "Lv —");
    setText(out.children[1], pct ? `${pct[1]}%` : "—");
    xpLine(panel, zone, text);
  }
  var XP_LINE = "data-iw-skill-v2-xp";
  function xpLineText(readout) {
    return String(readout || "").replace(/\s+/g, " ").trim().replace(/^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-–—•·:|]?\s*/i, "").replace(/^\d+(?:\.\d+)?\s*%\s*(?:[-–—•·:|]\s*)?/, "").replace(/\s*\/\s*/, " / ").replace(/([\d.,]+[kmbt]?)(xp|to\s+go)$/i, "$1 $2").trim();
  }
  function forwardXpCycle(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    const panel = event.currentTarget.closest(".compact-panel");
    panel?.querySelector('[data-iw-skill-role="level-progress"]')?.click();
  }
  function xpLine(panel, zone, readoutText) {
    const value = xpLineText(readoutText);
    let line = zone.querySelector(`:scope > [${XP_LINE}]`);
    if (!value) {
      line?.remove();
      return;
    }
    if (!line) {
      line = document.createElement("span");
      line.setAttribute(XP_LINE, "1");
      line.className = "iw-skill-v2-xp";
      line.tabIndex = 0;
      line.title = "Click to cycle XP display";
      line.addEventListener("click", forwardXpCycle);
      line.addEventListener("keydown", forwardXpCycle);
      zone.append(line);
    }
    setText(line, value);
  }
  function removeRetiredNodes(panel) {
    panel.querySelectorAll("[data-iw-skill-v2-summary], [data-iw-skill-v2-break], [data-iw-skill-v2-expand], [data-iw-skill-v2-tabs]").forEach((el2) => el2.remove());
  }
  function ensureActionGlyph(panel) {
    const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
    const ACTION = '[data-iw-skill-role="action-button"]';
    const btn = zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
    const host = btn?.parentElement;
    if (!host) return null;
    panel.querySelectorAll("[data-iw-skill-v2-action-glyph]").forEach((el2) => {
      if (el2.parentElement !== host) el2.remove();
    });
    const existing = host.querySelector(":scope > [data-iw-skill-v2-action-glyph]");
    if (existing) return existing;
    const glyph = document.createElement("span");
    glyph.dataset.iwSkillV2ActionGlyph = "1";
    glyph.className = "iw-skill-v2-action-glyph";
    glyph.setAttribute("aria-hidden", "true");
    host.appendChild(glyph);
    return glyph;
  }
  function ensureActionLabel(panel) {
    const btn = actionButtonOf(panel);
    const host = btn?.parentElement;
    if (!host) return null;
    const labels = [...panel.querySelectorAll("[data-iw-skill-v2-action-label]")];
    let label4 = labels.find((el2) => el2.parentElement === host) || null;
    labels.forEach((el2) => {
      if (el2 !== label4) el2.remove();
    });
    if (!label4) {
      label4 = document.createElement("span");
      label4.dataset.iwSkillV2ActionLabel = "1";
      host.appendChild(label4);
    }
    if (label4.className !== "iw-skill-v2-action-label") label4.className = "iw-skill-v2-action-label";
    if (label4.getAttribute("aria-hidden") !== "true") label4.setAttribute("aria-hidden", "true");
    if (label4.hasAttribute("style")) label4.removeAttribute("style");
    setText(label4, (btn.textContent || "").replace(/\s+/g, " ").trim());
    return label4;
  }
  var LABEL_CEILING_PX = 9.5;
  var LABEL_FLOOR_PX = 4;
  function labelTextBox(label4) {
    const walker = document.createTreeWalker(label4, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let left = Infinity, right = -Infinity;
    for (let node2 = walker.nextNode(); node2; node2 = walker.nextNode()) {
      if (!node2.nodeValue.trim()) continue;
      range.selectNodeContents(node2);
      const r = range.getBoundingClientRect?.();
      if (!r || !(r.width > 0)) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return right > left ? { width: right - left } : null;
  }
  var fillSamples = /* @__PURE__ */ new WeakMap();
  var FILL = ':scope > span[style*="width"]';
  function smoothActionFill(panel) {
    const btn = actionButtonOf(panel);
    const width = btn?.querySelector(FILL)?.style.width || "";
    if (!/^\d+(?:\.\d+)?%$/.test(width)) return;
    const { reset, durationMs } = sampleProgress(fillSamples, panel, parseFloat(width));
    if (reset) {
      panel.dataset.iwSkillV2FillReset = "1";
      raf(() => {
        delete panel.dataset.iwSkillV2FillReset;
      });
    }
    if (durationMs !== null) panel.style.setProperty("--iw-skill-v2-fill-duration", formatDuration(durationMs));
  }
  function actionButtonOf(panel) {
    const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
    const ACTION = '[data-iw-skill-role="action-button"]';
    return zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
  }
  var LONG_ACTION_SECONDS = 11;
  function durationSeconds(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const clock = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(text);
    if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const shortClock = /^(\d+):([0-5]\d)$/.exec(text);
    if (shortClock) return Number(shortClock[1]) * 60 + Number(shortClock[2]);
    const units = /^(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?\s*)?(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/.exec(text);
    if (!units || !units.slice(1).some(Boolean)) return null;
    return Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0);
  }
  function currentActionRemaining() {
    const host = pickRendered([...document.querySelectorAll(CURRENT_ACTION_HOSTS)]);
    if (!host) return null;
    for (const el2 of host.querySelectorAll("time,span,p,strong,div")) {
      if (el2.childElementCount || el2.closest('[data-iw-panel-part="progress"]')) continue;
      const text = (el2.textContent || "").replace(/\s+/g, " ").trim();
      const seconds = durationSeconds(text);
      if (seconds !== null) return { text, seconds };
    }
    return null;
  }
  function clearLongActionTimer(panel, glyph = panel.querySelector("[data-iw-skill-v2-action-glyph]")) {
    if (glyph?.hasAttribute("data-iw-skill-v2-action-timer")) {
      glyph.removeAttribute("data-iw-skill-v2-action-timer");
      setText(glyph, "");
    }
    delete panel.dataset.iwSkillV2LongAction;
  }
  function syncLongActionTimer(panel, glyph, remaining = currentActionRemaining) {
    const running = !!actionButtonOf(panel)?.querySelector(FILL);
    if (!running) return clearLongActionTimer(panel, glyph);
    if (typeof remaining === "function") remaining = remaining();
    const startedLong = panel.dataset.iwSkillV2LongAction === "1";
    if (!startedLong && !(remaining?.seconds > LONG_ACTION_SECONDS)) return clearLongActionTimer(panel, glyph);
    if (!remaining || !glyph) return;
    setData2(panel, "iwSkillV2LongAction", "1");
    if (!glyph.hasAttribute("data-iw-skill-v2-action-timer")) glyph.setAttribute("data-iw-skill-v2-action-timer", "1");
    setText(glyph, remaining.text);
  }
  var CURRENT_ACTION_HOSTS = '[data-iw-panel="current-action"], [id="current-action-panel"]';
  function touchesHost(roots, host) {
    return roots.some((r) => r === host || host.contains(r) || r?.contains?.(host));
  }
  function syncTimersOnTick(roots) {
    if (!Array.isArray(roots) || !roots.length) return;
    const candidates = [...document.querySelectorAll(CURRENT_ACTION_HOSTS)];
    if (!candidates.some((host2) => touchesHost(roots, host2))) return;
    const host = pickRendered(candidates);
    if (!host || !touchesHost(roots, host)) return;
    let remaining;
    const readOnce = () => remaining === void 0 ? remaining = currentActionRemaining() : remaining;
    document.querySelectorAll(".compact-panel.fs-skill-panel[data-iw-skill-v2]").forEach((panel) => {
      if (!panel.isConnected) return;
      if (panel.dataset.iwSkillV2LongAction !== "1" && !actionButtonOf(panel)?.querySelector(FILL)) return;
      syncLongActionTimer(panel, panel.querySelector("[data-iw-skill-v2-action-glyph]"), readOnce);
    });
  }
  function fitActionLabel(panel) {
    const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
    const ACTION = '[data-iw-skill-role="action-button"]';
    const btn = zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
    if (!btn) return;
    const visual = panel.querySelector("[data-iw-skill-v2-action-label]");
    const label4 = (btn.textContent || "").replace(/\s+/g, " ").trim();
    const key = `${label4}|${panel.dataset.iwSkillLayout || ""}|${btn.style.getPropertyValue("width")}|${getLayoutEpoch()}`;
    if (!label4 || panel.dataset.iwSkillV2LabelFit === key) return;
    panel.dataset.iwSkillV2LabelFit = key;
    const text = labelTextBox(visual || btn);
    if (!text || !(text.width > 0)) return;
    const cs = getComputedStyle(visual || btn);
    const room = (visual || btn).clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const current = parseFloat(cs.fontSize);
    if (!(room > 0) || !(current > 0)) return;
    const tracking = parseFloat(cs.letterSpacing) || 0;
    const width = text.width - tracking;
    const fit = Math.floor(current * (room / width) * 10) / 10;
    const size = `${Math.max(LABEL_FLOOR_PX, Math.min(LABEL_CEILING_PX, fit))}px`;
    if (panel.style.getPropertyValue("--iw-skill-v2-action-label-font") !== size) panel.style.setProperty("--iw-skill-v2-action-label-font", size);
  }
  function controlsHost(panel) {
    return panel.querySelector('[data-iw-skill-layout-shell="1"]') || panel;
  }
  var MATERIAL_PARTS = /^(.*?)\s*([\d,]+\s*\/\s*[\d,]+)\s*$/;
  var MATERIAL_COUNT_PARTS = /^([\d,]+)\s*\/\s*([\d,]+)$/;
  function ensureDetailBody(panel) {
    const host = controlsHost(panel);
    if (!host) return null;
    let body = host.querySelector(":scope > [data-iw-skill-v2-body]");
    if (!body) {
      body = document.createElement("div");
      body.dataset.iwSkillV2Body = "1";
      body.dataset.iwSkillV2Row = "body";
      body.className = "iw-skill-v2-body";
      host.appendChild(body);
    }
    const selected = FRAME_SECTIONS.flatMap((name) => {
      const sections = [...panel.querySelectorAll(`[data-iw-skill-v2-section="${name}"]`)];
      const grid = sections.find((el2) => el2.classList.contains("fs-skill-ingredient-grid"));
      return grid ? [grid] : sections.filter((el2) => !sections.some((other) => other !== el2 && other.contains(el2)));
    });
    if (!selected.length) {
      if (body.childElementCount) body.replaceChildren();
      delete body.dataset.iwSkillV2BodySignature;
      return body;
    }
    const rows = selected.flatMap((section) => section.classList.contains("fs-skill-ingredient-grid") ? [...section.querySelectorAll(".fs-skill-ingredient-item")].map((el2) => ({
      text: (el2.textContent || "").replace(/\s+/g, " ").trim(),
      state: el2.dataset.iwIngredientState || "",
      kind: "material"
    })) : [{ text: (section.textContent || "").replace(/\s+/g, " ").trim(), state: "", kind: "" }]);
    const signature2 = rows.map((r) => `${r.kind}:${r.state}:${r.text}`).join(String.fromCharCode(31));
    if (body.dataset.iwSkillV2BodySignature === signature2) return body;
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const el2 = document.createElement("span");
      el2.className = "iw-skill-v2-body-row";
      if (row.state) el2.dataset.iwSkillV2BodyState = row.state;
      const parts = row.kind === "material" ? MATERIAL_PARTS.exec(row.text) : null;
      if (parts) {
        el2.dataset.iwSkillV2BodyKind = "material";
        const name = document.createElement("span");
        name.className = "iw-skill-v2-body-name";
        name.textContent = parts[1];
        const count = document.createElement("span");
        count.className = "iw-skill-v2-body-count";
        const countParts = MATERIAL_COUNT_PARTS.exec(parts[2]);
        if (countParts) {
          const owned3 = document.createElement("span");
          owned3.className = "iw-skill-v2-body-count-owned";
          owned3.textContent = `${countParts[1]}/`;
          const required = document.createElement("span");
          required.className = "iw-skill-v2-body-count-required";
          required.textContent = countParts[2];
          count.append(owned3, required);
        } else {
          count.textContent = parts[2];
        }
        el2.append(name, count);
      } else {
        el2.textContent = row.text;
      }
      frag.appendChild(el2);
    }
    body.replaceChildren(frag);
    body.dataset.iwSkillV2BodySignature = signature2;
    return body;
  }
  function ensureFootRow(panel) {
    const host = controlsHost(panel);
    if (!host) return null;
    let row = host.querySelector(":scope > [data-iw-skill-v2-controls]");
    if (!row) {
      row = document.createElement("div");
      row.dataset.iwSkillV2Controls = "1";
      row.dataset.iwSkillV2Row = "tabs";
      row.className = "iw-skill-v2-controls";
      host.appendChild(row);
    }
    return row;
  }
  function syncRequirementNote(panel) {
    const unmet = [...new Set([...panel.querySelectorAll('[data-iw-skill-v2-section="requirements"][data-iw-req-state="unmet"]')].map((el2) => (el2.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
    const existing = panel.querySelector("[data-iw-skill-v2-controls]");
    if (!unmet.length) {
      existing?.remove();
      return null;
    }
    const row = ensureFootRow(panel);
    if (!row) return null;
    let note = row.querySelector(":scope > [data-iw-skill-v2-req-note]");
    if (!note) {
      note = document.createElement("span");
      note.dataset.iwSkillV2ReqNote = "1";
      note.className = "iw-skill-v2-req-note";
      note.setAttribute("role", "note");
      row.append(note);
    }
    setText(note, unmet.join(" · "));
    return row;
  }
  function enhanceSkillCardV2(panel, skillType) {
    if (!panel || !panel.isConnected || !skillType || skillType === "unknown") return null;
    if (panel.style.getPropertyValue("--iw-skill-v2-btn-font")) panel.style.removeProperty("--iw-skill-v2-btn-font");
    setData2(panel, "iwSkillV2", "1");
    setData2(panel, "iwSkillV2Type", skillType);
    setData2(panel, "iwSkillV2State", "expanded");
    markSections(panel);
    levelReadout(panel);
    const glyph = ensureActionGlyph(panel);
    ensureActionLabel(panel);
    fitActionLabel(panel);
    smoothActionFill(panel);
    syncLongActionTimer(panel, glyph);
    removeRetiredNodes(panel);
    const row = syncRequirementNote(panel);
    ensureDetailBody(panel);
    return row;
  }
  function clearSkillCardV2(panel) {
    if (!panel) return;
    panel.querySelectorAll("[data-iw-skill-v2-controls],[data-iw-skill-v2-expand],[data-iw-skill-v2-level-readout],[data-iw-skill-v2-xp],[data-iw-skill-v2-action-glyph],[data-iw-skill-v2-action-label],[data-iw-skill-v2-summary],[data-iw-skill-v2-break],[data-iw-skill-v2-body],[data-iw-skill-v2-req-note]").forEach((el2) => el2.remove());
    panel.querySelectorAll("[data-iw-skill-v2-section]").forEach((el2) => delete el2.dataset.iwSkillV2Section);
    panel.style.removeProperty("--iw-skill-v2-progress");
    panel.style.removeProperty("--iw-skill-v2-btn-font");
    panel.style.removeProperty("--iw-skill-v2-action-label-font");
    panel.style.removeProperty("--iw-skill-v2-fill-duration");
    delete panel.dataset.iwSkillV2FillReset;
    delete panel.dataset.iwSkillV2LongAction;
    fillSamples.delete(panel);
    delete panel.dataset.iwSkillV2LabelFit;
    delete panel.dataset.iwSkillV2;
    delete panel.dataset.iwSkillV2Type;
    delete panel.dataset.iwSkillV2State;
    delete panel.dataset.iwSkillV2Tab;
  }
  function reconcile(panel, skill) {
    if (!panel?.isConnected) return;
    if (!skill || skill === "unknown" || !panel.classList.contains("fs-skill-panel")) return clearSkillCardV2(panel);
    enhanceSkillCardV2(panel, skill);
  }
  function bindOnce() {
    if (bound) return;
    bound = true;
    on("iw:skill-panel", (e) => {
      if (active && isRuntimeActive()) guard("skill-v2:panel", () => reconcile(e.detail?.panel, e.detail?.skill));
    });
    for (const type of ["iw:name-scan-flush", "iw:dom-flush"]) on(type, (e) => {
      if (active && isRuntimeActive()) guard("skill-v2:action-timer", () => syncTimersOnTick(e.detail?.roots));
    });
  }
  function initSkillCardDesignController() {
    active = true;
    bindOnce();
    document.fonts?.ready?.then(() => guard("skill-v2:fonts", () => {
      if (!active) return;
      document.querySelectorAll(".compact-panel[data-iw-skill-v2-label-fit]").forEach((panel) => {
        delete panel.dataset.iwSkillV2LabelFit;
        fitActionLabel(panel);
      });
    }));
    const root = document.documentElement;
    if (root && root.getAttribute(DESIGN_ATTR) !== "new") root.setAttribute(DESIGN_ATTR, "new");
    document.querySelectorAll("[data-iw-skill-design-toggle]").forEach((el2) => el2.remove());
  }
  function clearSkillCardDesignController() {
    active = false;
    document.documentElement?.removeAttribute(DESIGN_ATTR);
    document.querySelectorAll("[data-iw-skill-design-toggle]").forEach((el2) => el2.remove());
    document.querySelectorAll(".compact-panel[data-iw-skill-v2]").forEach(clearSkillCardV2);
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
    [/\b(?:gathering|herbalism)\b/i, { accent: "#579A5D", glyph: "❧" }],
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
    return [...root.querySelectorAll("p,span,div,strong,em,h1,h2,h3,h4")].filter((el2) => !el2.closest('button,a,[role="button"],.fs-quest-sigil')).filter((el2) => {
      const own2 = [...el2.childNodes].some((n) => n.nodeType === 3 && normText2(n.textContent));
      return own2 && normText2(el2.textContent).length <= 220;
    });
  }
  function questButtons(card) {
    const all = [...card.querySelectorAll('button,[role="button"]')];
    let turnIn = null;
    let skip = null;
    for (const btn of all) {
      const label4 = normText2(btn.textContent) || normText2(btn.getAttribute("aria-label"));
      if (!turnIn && /turn\s*in/i.test(label4)) turnIn = btn;
      else if (!skip && /^skip\b/i.test(label4)) skip = btn;
    }
    return { turnIn, skip, all };
  }
  function isQuestCard(card) {
    if (!card || !card.classList?.contains("compact-panel")) return false;
    if (card.classList.contains("fs-skill-panel")) return false;
    const bulk = card.textContent || "";
    if (!/turn\s*in/i.test(bulk) && !/\d+%\s*complete/i.test(bulk)) return false;
    const leaves = textLeaves(card);
    const hasReward = leaves.some((el2) => /^reward\s*:/i.test(normText2(el2.textContent)));
    if (!hasReward) return false;
    const { turnIn, skip } = questButtons(card);
    const hasPercent = leaves.some((el2) => /\d+%\s*complete\b/i.test(normText2(el2.textContent)));
    return !!(turnIn || skip || hasPercent);
  }
  function findProgress2(card) {
    for (const el2 of card.querySelectorAll("div")) {
      if (el2.children.length !== 1) continue;
      const fill = el2.firstElementChild;
      const width = String(fill?.style?.width || "").trim();
      if (!/%$/.test(width)) continue;
      const cls = `${el2.className || ""} ${fill.className || ""}`;
      if (!/rounded-full|progress|bg-white\/10|bg-white\/5|\bh-1(?:\.5)?\b|\bh-2\b/i.test(cls)) continue;
      if (el2.closest('button,a,[role="button"]')) continue;
      return { track: el2, fill };
    }
    return { track: null, fill: null };
  }
  function setRole2(el2, role2) {
    if (el2 && el2.getAttribute(ROLE_ATTR2) !== role2) el2.setAttribute(ROLE_ATTR2, role2);
    return el2;
  }
  function setZone(el2, zone) {
    if (el2 && el2.getAttribute(ZONE_ATTR2) !== zone) el2.setAttribute(ZONE_ATTR2, zone);
    return el2;
  }
  function clearRoles(card) {
    card.querySelectorAll(`[${ROLE_ATTR2}],[${ZONE_ATTR2}]`).forEach((el2) => {
      el2.removeAttribute(ROLE_ATTR2);
      el2.removeAttribute(ZONE_ATTR2);
    });
  }
  function structureSignature2(card) {
    const { turnIn, skip } = questButtons(card);
    const btn = [turnIn, skip].filter(Boolean).map((b) => normText2(b.textContent).replace(/\s*\(\d+\)\s*$/, "")).join("|");
    return `${textLeaves(card).length}|${btn}|${findProgress2(card).track ? "t" : "-"}`;
  }
  function disciplineStyle(rewardText) {
    for (const [re, style] of DISCIPLINE_STYLE) if (re.test(rewardText)) return style;
    return GENERIC_STYLE;
  }
  function objectiveItemRef(card) {
    const el2 = card.querySelector(`[${ROLE_ATTR2}="objective"]`);
    if (!el2) return null;
    const name = normText2(el2.textContent).replace(/^[^A-Za-z]+/, "").replace(/\s+[\d,]+\s*\/\s*[\d,]+.*$/, "").trim();
    if (name.length < 2) return { el: el2, name: "", item: null, id: null };
    const item = ItemDatabase.getByName(name);
    return { el: el2, name, item, id: item && item.item_id != null ? String(item.item_id) : null };
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
  function clearObjectiveTrigger(el2) {
    if (!el2) return;
    for (const attr of TRIGGER_ATTRS) el2.removeAttribute(attr);
  }
  function ensureObjectiveTrigger(ref) {
    if (!ref || !ref.el) return;
    const el2 = ref.el;
    if (!ref.item) {
      clearObjectiveTrigger(el2);
      return;
    }
    if (ref.id) {
      if (el2.getAttribute("data-iw-item") !== ref.id) el2.setAttribute("data-iw-item", ref.id);
      el2.removeAttribute("data-iw-item-name");
    } else {
      if (el2.getAttribute("data-iw-item-name") !== ref.name) el2.setAttribute("data-iw-item-name", ref.name);
      el2.removeAttribute("data-iw-item");
    }
    if (el2.dataset.iwTooltipTrigger !== "1") el2.dataset.iwTooltipTrigger = "1";
    if (el2.getAttribute("tabindex") !== "0") el2.setAttribute("tabindex", "0");
    if (el2.getAttribute("aria-haspopup") !== "dialog") el2.setAttribute("aria-haspopup", "dialog");
    if (el2.getAttribute("aria-controls") !== "iw-tip") el2.setAttribute("aria-controls", "iw-tip");
    if (!el2.hasAttribute("aria-expanded")) el2.setAttribute("aria-expanded", "false");
  }
  function annotateStructure2(card) {
    const sig = structureSignature2(card);
    if (structureSignatures2.get(card) === sig) return;
    clearRoles(card);
    const leaves = textLeaves(card);
    const reward2 = leaves.find((el2) => /^reward\s*:/i.test(normText2(el2.textContent))) || null;
    const objective = leaves.find((el2) => /\d+\s*\/\s*\d+/.test(normText2(el2.textContent)) && !/^reward\s*:/i.test(normText2(el2.textContent)) && !/%\s*complete\b/i.test(normText2(el2.textContent))) || null;
    const progressLabel = leaves.find((el2) => /\d+%\s*complete\b/i.test(normText2(el2.textContent))) || null;
    const skipNote = leaves.find((el2) => /^out of skips\b/i.test(normText2(el2.textContent))) || null;
    const column = reward2?.parentElement || objective?.parentElement || card;
    const columnLeaves = leaves.filter((el2) => column.contains(el2) && el2 !== reward2 && el2 !== objective && el2 !== progressLabel && el2 !== skipNote);
    columnLeaves.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    let cursor = 0;
    if (columnLeaves.length >= 2 && /\bwork order\b/i.test(normText2(columnLeaves[0].textContent))) {
      setRole2(columnLeaves[0], "kicker");
      cursor = 1;
    }
    const title = columnLeaves[cursor] || null;
    const briefs = columnLeaves.slice(cursor + 1);
    if (title) setRole2(title, "title");
    briefs.forEach((el2) => setRole2(el2, "brief"));
    if (objective) setRole2(objective, "objective");
    if (reward2) {
      setRole2(reward2, "reward");
      reward2.dataset.iwQuestReward = normText2(reward2.textContent).replace(/^reward\s*:\s*/i, "");
    }
    if (progressLabel) {
      setRole2(progressLabel, "progress-label");
      progressLabel.dataset.iwQuestPercent = (normText2(progressLabel.textContent).match(/(\d+)%/) || [, ""])[1];
    }
    if (skipNote) setRole2(skipNote, "skip-note");
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
    const skipHost = body && skipNote ? directChildUnder(skipNote, body) : null;
    if (skipHost) setZone(skipHost, "skip-note");
    structureSignatures2.set(card, sig);
  }
  function directChildUnder(descendant, ancestor) {
    if (!descendant || !ancestor || descendant === ancestor) return null;
    let node2 = descendant;
    while (node2.parentElement && node2.parentElement !== ancestor) node2 = node2.parentElement;
    return node2.parentElement === ancestor ? node2 : null;
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
    let icon2 = sigil.querySelector(":scope > .fs-quest-sigil-icon");
    if (ref && ref.name && AtlasService.isReady()) {
      const target = icon2 || Object.assign(document.createElement("span"), { className: "fs-quest-sigil-icon" });
      if (AtlasService.paint(target, { id: ref.id, name: ref.name })) {
        if (!icon2) {
          target.setAttribute("aria-hidden", "true");
          sigil.appendChild(target);
        }
        if (sigil.dataset.iwQuestIcon !== "1") sigil.dataset.iwQuestIcon = "1";
      } else {
        icon2?.remove();
        delete sigil.dataset.iwQuestIcon;
      }
    } else {
      icon2?.remove();
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
      const label4 = `${pct}%`;
      if (ring.textContent !== label4) ring.textContent = label4;
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
  function measureCommandBlock(card) {
    const host = card.querySelector(`[${ZONE_ATTR2}="commands"]`);
    if (!host) {
      card.style.removeProperty("--fs-quest-cmd-w");
      return;
    }
    const width = Math.round(host.getBoundingClientRect().width);
    if (!width) return;
    const next = `${width}px`;
    if (card.style.getPropertyValue("--fs-quest-cmd-w") !== next) {
      card.style.setProperty("--fs-quest-cmd-w", next);
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
    measureCommandBlock(card);
  }
  function clearCard(card) {
    structureSignatures2.delete(card);
    clearObjectiveTrigger(card.querySelector(`[${ROLE_ATTR2}="objective"]`));
    clearRoles(card);
    card.querySelectorAll(".fs-quest-sigil, .fs-quest-sigil-pct, .fs-quest-sigil-icon").forEach((el2) => el2.remove());
    card.querySelectorAll("[data-iw-quest-reward], [data-iw-quest-percent]").forEach((el2) => {
      delete el2.dataset.iwQuestReward;
      delete el2.dataset.iwQuestPercent;
    });
    card.classList.remove(PANEL_CLASS);
    card.style.removeProperty("--fs-quest-accent");
    card.style.removeProperty("--fs-quest-cmd-w");
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

  // assets/world-bosses/rewards.json
  var rewards_default = [
    {
      item_id: "trader_token",
      name: "Trader's Token",
      category: "Trade Good",
      subcategory: "Trade good",
      tier: 0,
      effects_raw: "Trade Good",
      acquisition_type: "Unknown",
      acquisition_summary: ""
    },
    {
      item_id: "miners_gloves",
      name: "Miner's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Mining Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "herbalists_gloves",
      name: "Herbalist's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Gathering Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "blacksmiths_gloves",
      name: "Blacksmith's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Smithing Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "alchemists_gloves",
      name: "Alchemist's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Alchemy Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "jewelcrafters_gloves",
      name: "Jewelcrafter's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Jewelcrafting Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "spellcrafters_gloves",
      name: "Spellcrafter's Gloves",
      category: "Equipment",
      subcategory: "Gloves slot",
      tier: 1,
      effects_raw: "DEF +1, Spellcrafting Level +4",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Ancient Treant — 0.5% chance per participant"
    },
    {
      item_id: "invisibility_ring",
      name: "Invisibility Ring",
      category: "Equipment",
      subcategory: "Ring slot",
      tier: 1,
      effects_raw: "Unlocks access to zones 1–29, +50% 2x gather chance",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating Abyssal Behemoth — 0.5% chance per participant"
    },
    {
      item_id: "worldbreaker",
      name: "Worldbreaker",
      category: "Equipment",
      subcategory: "Weapon slot",
      tier: 18,
      effects_raw: "ATK +120, Requires Combat Lv 61, XP +6/task",
      acquisition_type: "BossDrop",
      acquisition_summary: "World Boss drop: Defeating World Eater — 0.1% chance per participant"
    }
  ];

  // src/modules/WorldBossPanels.js
  var BOSSES = [
    { key: "ancient_treant", name: "Ancient Treant", ids: ["miners_gloves", "herbalists_gloves", "blacksmiths_gloves", "alchemists_gloves", "jewelcrafters_gloves", "spellcrafters_gloves", "tailors_gloves", "woodcutters_gloves", "builders_gloves"] },
    { key: "abyssal_behemoth", name: "Abyssal Behemoth", ids: ["invisibility_ring"] },
    { key: "world_eater", name: "World Eater", ids: ["worldbreaker"] }
  ];
  var fallback = new Map(rewards_default.map((item) => [item.item_id, item]));
  fallback.set("tailors_gloves", { item_id: "tailors_gloves", name: "Tailor's Gloves", category: "Equipment", subcategory: "Gloves slot", effects_raw: "Tailoring skill bonus", acquisition_type: "BossDrop", acquisition_summary: "Rare Ancient Treant drop." });
  fallback.set("boss_upgrade_orb", { item_id: "boss_upgrade_orb", name: "Upgrade Orb", category: "Consumable", effects_raw: "The awarded orb tier follows your highest equipped gear tier, including your trinket.", acquisition_type: "BossDrop", acquisition_summary: "Possible reward from any world boss. Chance depends on contribution. The icon represents the orb family; your awarded tier may differ." });
  var signatures = /* @__PURE__ */ new WeakMap();
  var rewardPreferences = /* @__PURE__ */ new Map();
  function bindRewardDisclosure(section, boss) {
    const key = `iw-boss-rewards-collapsed:${boss.key}`;
    let preference = rewardPreferences.get(key);
    if (!preference) {
      preference = { collapsed: false, changed: false };
      preference.ready = storageGet(key).then((value) => {
        if (!preference.changed) preference.collapsed = value === true;
      });
      rewardPreferences.set(key, preference);
    }
    section.open = !preference.collapsed;
    section.addEventListener("toggle", () => {
      if (!section.isConnected || preference.collapsed === !section.open) return;
      preference.collapsed = !section.open;
      preference.changed = true;
      void storageSet(key, preference.collapsed);
    });
    void preference.ready.then(() => {
      if (section.isConnected) section.open = !preference.collapsed;
    });
  }
  var strengthHistory = /* @__PURE__ */ new WeakMap();
  var impactAnimations = /* @__PURE__ */ new WeakMap();
  var impactCleanup = /* @__PURE__ */ new WeakMap();
  var norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
  function mark(el2, key, value) {
    if (el2 && el2.getAttribute(key) !== value) el2.setAttribute(key, value);
  }
  function setText2(el2, value) {
    if (el2 && el2.textContent !== value) el2.textContent = value;
  }
  function owned(tag, className, text) {
    const el2 = document.createElement(tag);
    el2.className = className;
    el2.dataset.iwBossOwned = "1";
    if (text) el2.textContent = text;
    return el2;
  }
  function controlProgress(card) {
    for (const el2 of card.children) {
      if (el2.hasAttribute("data-iw-boss-owned")) continue;
      const fill = el2.children.length === 1 ? el2.firstElementChild : null;
      const width = String(fill?.style?.width || "").trim();
      if (fill && /^\d+(?:\.\d+)?%$/.test(width)) return { track: el2, percent: Math.max(0, Math.min(100, Number.parseFloat(width))) };
    }
    return { track: null, percent: null };
  }
  function strengthTeam(row) {
    const classes = [row, ...row.querySelectorAll("*")].map((el2) => `${el2.className || ""} ${el2.getAttribute?.("style") || ""}`).join(" ");
    const red = /(?:^|[\s:_-])(?:red|rose|pink|crimson)(?:[\s:_-]|$)/i.test(classes);
    const blue = /(?:^|[\s:_-])(?:blue|sky|cyan|azure)(?:[\s:_-]|$)/i.test(classes);
    if (red !== blue) return red ? "red" : "blue";
    return null;
  }
  function controlStrengths(card) {
    const candidates = [...card.querySelectorAll("p, span, strong")].filter((el2) => !el2.childElementCount && !el2.closest("[data-iw-boss-owned]")).map((el2) => {
      const raw = norm(el2.textContent);
      if (!/^\d[\d,]*(?:\.\d+)?$/.test(raw)) return null;
      const value = Number(raw.replaceAll(",", ""));
      if (!Number.isFinite(value)) return null;
      let row = el2.parentElement;
      let team = null;
      let strengthRow = el2.parentElement;
      while (row && row !== card && !team) {
        team = strengthTeam(row);
        if (team) strengthRow = row;
        row = row.parentElement;
      }
      return { el: el2, row: strengthRow, raw, value, team };
    }).filter(Boolean);
    let red = candidates.find((entry2) => entry2.team === "red");
    let blue = candidates.find((entry2) => entry2.team === "blue");
    if ((!red || !blue) && candidates.length === 2) [red, blue] = candidates;
    return red && blue ? { red, blue } : null;
  }
  function ensureCrestLayers(crest) {
    if (crest.querySelector(".iw-control-crest-art")) return;
    for (const team of ["red", "blue", "contested"]) {
      crest.appendChild(owned("span", `iw-control-crest-art iw-control-crest-art-${team}`));
    }
    for (const team of ["red", "blue"]) {
      const sword = owned("span", `iw-control-sword-energy iw-control-sword-energy-${team}`);
      sword.appendChild(owned("span", `iw-control-impact iw-control-impact-${team}`));
      crest.appendChild(sword);
    }
    crest.appendChild(owned("span", "iw-control-crystal-core"));
  }
  function stopStrengthImpact(panel) {
    impactCleanup.get(panel)?.();
    impactCleanup.delete(panel);
    for (const animation of impactAnimations.get(panel) || []) animation?.cancel?.();
    impactAnimations.delete(panel);
  }
  function playStrengthImpact(panel, previous, strengths) {
    const preference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (preference?.matches) {
      stopStrengthImpact(panel);
      return;
    }
    if (!previous) return;
    const changed = [];
    if (previous.red !== strengths.red.value) changed.push("red");
    if (previous.blue !== strengths.blue.value) changed.push("blue");
    if (!changed.length) return;
    stopStrengthImpact(panel);
    const mobile = typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;
    const animations = [];
    for (const team of changed) {
      const energy = panel.querySelector(`.iw-control-impact-${team}`);
      if (energy?.animate) animations.push(energy.animate([
        { opacity: 0, transform: "translateX(-100%) scaleX(.45)" },
        { opacity: mobile ? 0.4 : 0.65, transform: "translateX(65%) scaleX(1.1)", offset: 0.42 },
        { opacity: 0, transform: "translateX(330%) scaleX(.6)" }
      ], { duration: mobile ? 1e3 : 1250, delay: team === "blue" ? 170 : 0, easing: "cubic-bezier(.3,.1,.3,1)" }));
    }
    impactAnimations.set(panel, animations);
    const onPreference = () => {
      if (preference.matches) stopStrengthImpact(panel);
    };
    preference?.addEventListener?.("change", onPreference);
    impactCleanup.set(panel, () => preference?.removeEventListener?.("change", onPreference));
    const finished = animations.map((animation) => animation.finished).filter(Boolean);
    if (finished.length) Promise.allSettled(finished).then(() => {
      if (impactAnimations.get(panel) === animations) stopStrengthImpact(panel);
    });
  }
  function ensureDominion(card) {
    let panel = card.querySelector(".iw-control-dominion");
    if (panel) return panel;
    panel = owned("section", "iw-control-dominion");
    panel.setAttribute("aria-label", "Zone dominion status");
    const crest = owned("div", "iw-control-crest");
    crest.setAttribute("aria-hidden", "true");
    ensureCrestLayers(crest);
    const readout = owned("div", "iw-control-readout");
    readout.append(
      owned("p", "iw-control-kicker", "Dominion Ward"),
      owned("p", "iw-control-state")
    );
    const meter = owned("div", "iw-control-meter");
    const meterHead = owned("div", "iw-control-meter-head");
    meterHead.append(owned("span", "iw-control-meter-label", "Ward Integrity"), owned("span", "iw-control-meter-value"));
    const track = owned("div", "iw-control-meter-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Ward integrity");
    const fill = owned("span", "iw-control-meter-fill");
    const currents = owned("span", "iw-control-meter-currents");
    currents.setAttribute("aria-hidden", "true");
    currents.append(owned("span", "iw-control-current-red"), owned("span", "iw-control-current-blue"));
    fill.appendChild(currents);
    track.appendChild(fill);
    meter.append(meterHead, track);
    const factions = owned("div", "iw-control-factions");
    factions.append(owned("span", "iw-control-faction iw-control-faction-red", "Crimson Oath"), owned("span", "iw-control-versus", "✦"), owned("span", "iw-control-faction iw-control-faction-blue", "Azure Covenant"));
    panel.append(crest, readout, meter, factions);
    card.appendChild(panel);
    return panel;
  }
  function updateDominion(card, team) {
    const panel = ensureDominion(card);
    ensureCrestLayers(panel.querySelector(".iw-control-crest"));
    const hp = [...card.querySelectorAll("p")].find((el2) => !el2.closest("[data-iw-boss-owned]") && /\b[\d,.]+(?:\s*\/\s*[\d,.]+)?\s*HP\b/i.test(norm(el2.textContent)));
    const progress = controlProgress(card);
    const nativeStrengths = controlStrengths(card);
    const strengths = team === "contested" ? nativeStrengths : null;
    const totalStrength = strengths ? strengths.red.value + strengths.blue.value : 0;
    const split = totalStrength > 0 ? strengths.red.value / totalStrength * 100 : 50;
    const percent2 = progress.percent;
    const value = strengths ? `${strengths.red.raw} · ${strengths.blue.raw}` : hp ? norm(hp.textContent) : team === "contested" ? "Under siege" : "Fortified";
    const state = team === "red" ? "Crimson Dominion" : team === "blue" ? "Azure Dominion" : "Ward contested";
    card.querySelectorAll('[data-iw-boss-role="control-strength"]').forEach((row) => row.removeAttribute("data-iw-boss-role"));
    const hiddenStrengths = strengths || (nativeStrengths?.red.team === "red" && nativeStrengths?.blue.team === "blue" ? nativeStrengths : null);
    if (hiddenStrengths) {
      mark(hiddenStrengths.red.row, "data-iw-boss-role", "control-strength");
      mark(hiddenStrengths.blue.row, "data-iw-boss-role", "control-strength");
    }
    mark(hp, "data-iw-boss-role", "control-hp");
    mark(progress.track, "data-iw-boss-role", "control-progress");
    panel.querySelector(".iw-control-crest").dataset.iwControlCrest = team;
    setText2(panel.querySelector(".iw-control-state"), state);
    setText2(panel.querySelector(".iw-control-meter-label"), strengths ? "Ward Strength" : "Ward Integrity");
    setText2(panel.querySelector(".iw-control-meter-value"), value);
    const meter = panel.querySelector(".iw-control-meter");
    const fill = panel.querySelector(".iw-control-meter-fill");
    if (strengths) {
      playStrengthImpact(panel, strengthHistory.get(card), strengths);
      strengthHistory.set(card, { red: strengths.red.value, blue: strengths.blue.value });
      meter.dataset.iwControlSource = "factions";
      fill.style.width = "100%";
      fill.style.setProperty("--iw-control-split", `${Number(split.toFixed(1))}%`);
    } else {
      strengthHistory.delete(card);
      stopStrengthImpact(panel);
      delete meter.dataset.iwControlSource;
      fill.style.width = `${percent2 ?? 100}%`;
    }
    const track = panel.querySelector(".iw-control-meter-track");
    track.setAttribute("aria-label", strengths ? "Ward strength balance" : "Ward integrity");
    if (strengths) {
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Number(split.toFixed(1))));
      track.setAttribute("aria-valuetext", `Crimson ${strengths.red.raw}, Azure ${strengths.blue.raw}`);
    } else if (percent2 == null) {
      track.removeAttribute("aria-valuenow");
      track.removeAttribute("aria-valuemin");
      track.removeAttribute("aria-valuemax");
      track.setAttribute("aria-valuetext", value);
    } else {
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(percent2));
      track.removeAttribute("aria-valuetext");
    }
  }
  function rewards(card, boss) {
    const signature2 = `${boss.key}:${ItemDatabase.revision()}:${AtlasService.revision()}`;
    let section = card.querySelector(".iw-boss-rewards");
    if (section && signatures.get(card) === signature2) return;
    const ids2 = [.../* @__PURE__ */ new Set([...boss.ids, ...ItemDatabase.all().filter((item) => item.acquisition_type === "BossDrop" && `${item.acquisition_summary} ${item.acquisition_detail}`.includes(boss.name)).map((item) => item.item_id), "trader_token", "boss_upgrade_orb"])];
    if (!section) {
      section = owned("details", "iw-boss-rewards");
      section.setAttribute("aria-label", `${boss.name} possible rewards`);
      card.appendChild(section);
      bindRewardDisclosure(section, boss);
    }
    section.replaceChildren();
    section.appendChild(owned("summary", "iw-boss-rewards-title", "Possible Rewards"));
    const list = owned("div", "iw-boss-reward-list");
    for (const id of ids2) {
      const item = ItemDatabase.find({ id }) || fallback.get(id);
      if (!item) continue;
      const tile = owned("button", "iw-boss-reward");
      tile.type = "button";
      tile.dataset.iwTooltipTrigger = "1";
      tile.dataset.iwItem = id;
      tile.dataset.iwItemName = item.name;
      tile.setAttribute("aria-label", `${item.name} — item details`);
      registerTooltipItem(tile, item);
      const icon2 = owned("span", "iw-boss-reward-icon");
      icon2.setAttribute("aria-hidden", "true");
      if (!AtlasService.paint(icon2, id === "boss_upgrade_orb" ? { name: "Copper Upgrade Orb", id: "copper_upgrade_orb" } : { id, name: item.name })) icon2.textContent = "◆";
      tile.append(icon2, owned("span", "iw-boss-reward-name", item.name));
      list.appendChild(tile);
    }
    section.appendChild(list);
    signatures.set(card, signature2);
  }
  function decorateWorldBossPanel({ root, heading }) {
    if (!root.querySelector(".iw-boss-notice")) {
      const notice = owned("p", "iw-boss-notice", "There are no minimum requirements and no risk in joining and contributing to a world boss encounter.");
      const header = heading.parentElement;
      if (header !== root && !header.querySelector(".compact-panel")) header.after(notice);
      else heading.after(notice);
    }
    for (const card of root.querySelectorAll(".compact-panel")) {
      if (card.querySelector(".compact-panel")) continue;
      const header = [...card.children].find((el2) => !el2.hasAttribute("data-iw-boss-owned"));
      const title = header?.querySelector("p") || (header?.matches("p") ? header : null);
      const label4 = norm(title?.textContent);
      const boss = BOSSES.find((entry2) => label4.includes(entry2.name));
      const control = /controls Zone\s+\d+|Zone\s+\d+.*(?:Race to capture|contested)/i.test(label4);
      if (!boss && !control) continue;
      mark(card, "data-iw-encounter", boss ? boss.key : "zone");
      mark(header, "data-iw-boss-role", "header");
      mark(title, "data-iw-boss-role", "title");
      if (!card.querySelector(".iw-boss-art")) {
        const art2 = owned("div", "iw-boss-art");
        art2.setAttribute("aria-hidden", "true");
        card.appendChild(art2);
      }
      const action = [...header.querySelectorAll("button")].find((el2) => /prejoin|fight|defeated|join/i.test(norm(el2.textContent)));
      mark(action, "data-iw-boss-role", "action");
      if (action) {
        const actionText = norm(action.textContent);
        const actionState = /fighting/i.test(actionText) ? "fighting" : /prejoined/i.test(actionText) ? "prejoined" : /\b(?:prejoin|join|fight)\b/i.test(actionText) ? "join" : "idle";
        mark(action, "data-iw-boss-action-state", actionState);
        const team = actionState === "join" && /\b(?:fight for|join) (red|blue)\b/i.exec(actionText)?.[1].toLowerCase();
        if (team) mark(action, "data-iw-boss-action-team", team);
        else if (action.hasAttribute("data-iw-boss-action-team")) action.removeAttribute("data-iw-boss-action-team");
        if (action.hasAttribute("data-iw-boss-action-label")) action.removeAttribute("data-iw-boss-action-label");
      }
      const participation = [...card.querySelectorAll("button, p")].find((el2) => /world boss participation|players? currently fighting world boss|last battle participants/i.test(norm(el2.textContent)));
      mark(participation, "data-iw-boss-role", "participation");
      let status = null;
      for (const p of card.querySelectorAll("p")) {
        if (p.closest("[data-iw-boss-owned]") || p === title) continue;
        const text = norm(p.textContent);
        if (/^(Solo|Raid|Mythic)$/i.test(text)) mark(p, "data-iw-boss-role", "difficulty");
        else if (/^Buff on kill:/.test(text)) mark(p, "data-iw-boss-role", "buff");
        else if (/^(Respawns|Buff active|No world buff|Protected for)|\d\s*HP$/.test(text)) {
          mark(p, "data-iw-boss-role", "timer");
          if (p.parentElement !== card && p.parentElement !== header) status = p.parentElement;
        }
      }
      mark(status, "data-iw-boss-role", "status");
      for (const el2 of card.children) {
        if (el2.hasAttribute("data-iw-boss-owned") || el2 === header || el2 === status || el2 === participation) continue;
        const fill = el2.children.length === 1 ? el2.firstElementChild : null;
        if (fill && /%$/.test(String(fill.style?.width || "")) && /h-1|progress|rounded-full/i.test(`${el2.className} ${fill.className}`)) {
          mark(el2, "data-iw-boss-role", "progress");
        } else if (/Top Fighters|Last Kill Participants/i.test(norm(el2.textContent))) {
          mark(el2, "data-iw-boss-role", "details");
        }
      }
      if (boss) rewards(card, boss);
      else {
        const team = /red team controls/i.test(label4) ? "red" : /blue team controls/i.test(label4) ? "blue" : "contested";
        mark(card, "data-iw-control", team);
        for (const el2 of card.children) {
          if (el2.hasAttribute("data-iw-boss-owned") || el2 === header) continue;
          const text = norm(el2.textContent);
          if (/Red Team/.test(text) && /Blue Team/.test(text)) mark(el2, "data-iw-boss-role", "control-teams");
          else if (/^Queue\b/.test(norm(el2.firstElementChild?.textContent))) mark(el2, "data-iw-boss-role", "control-queue");
        }
        updateDominion(card, team);
      }
    }
  }
  function clearWorldBossPanel(root) {
    root.querySelectorAll('[data-iw-encounter="zone"]').forEach((card) => strengthHistory.delete(card));
    root.querySelectorAll(".iw-control-dominion").forEach(stopStrengthImpact);
    root.querySelectorAll("[data-iw-boss-owned]").forEach((el2) => el2.remove());
    for (const attr of ["data-iw-encounter", "data-iw-control", "data-iw-boss-role", "data-iw-boss-action-state", "data-iw-boss-action-team", "data-iw-boss-action-label", "data-iw-boss-art-ready"]) {
      root.querySelectorAll(`[${attr}]`).forEach((el2) => el2.removeAttribute(attr));
    }
  }

  // src/modules/villageBuildings.js
  var VILLAGE_BUILDINGS = Object.freeze({
    "training yard": Object.freeze({ tier: 1, name: "Training Yard", file: "village/building_1.webp" }),
    "ironfang palisade": Object.freeze({ tier: 2, name: "Ironfang Palisade", file: "village/building_2.webp" }),
    "silverroot infirmary": Object.freeze({ tier: 3, name: "Silverroot Infirmary", file: "village/building_3.webp" }),
    "goldfire scriptorium": Object.freeze({ tier: 4, name: "Goldfire Scriptorium", file: "village/building_4.webp" }),
    "mythril countinghouse": Object.freeze({ tier: 5, name: "Mythril Countinghouse", file: "village/building_5.webp" }),
    "starsteel trophy hall": Object.freeze({ tier: 6, name: "Starsteel Trophy Hall", file: "village/building_6.webp" }),
    "obsidian greenhouse": Object.freeze({ tier: 7, name: "Obsidian Greenhouse", file: "village/building_7.webp" }),
    "runite war college": Object.freeze({ tier: 8, name: "Runite War College", file: "village/building_8.webp" }),
    "dragonfall rampart": Object.freeze({ tier: 9, name: "Dragonfall Rampart", file: "village/building_9.webp" }),
    "aether sanatorium": Object.freeze({ tier: 10, name: "Aether Sanatorium", file: "village/building_10.webp" }),
    "voidiron archive": Object.freeze({ tier: 11, name: "Voidiron Archive", file: "village/building_11.webp" }),
    "celestial exchange": Object.freeze({ tier: 12, name: "Celestial Exchange", file: "village/building_12.webp" }),
    "bloodstone reliquary": Object.freeze({ tier: 13, name: "Bloodstone Reliquary", file: "village/building_13.webp" }),
    "moonsteel arboretum": Object.freeze({ tier: 14, name: "Moonsteel Arboretum", file: "village/building_14.webp" }),
    "sunforge arena": Object.freeze({ tier: 15, name: "Sunforge Arena", file: "village/building_15.webp" }),
    "nethergate bastion": Object.freeze({ tier: 16, name: "Nethergate Bastion", file: "village/building_16.webp" }),
    "stormglass chapel of healing": Object.freeze({ tier: 17, name: "Stormglass Chapel of Healing", file: "village/building_17.webp" }),
    "kingsfall grand library": Object.freeze({ tier: 18, name: "Kingsfall Grand Library", file: "village/building_18.webp" }),
    "eternium treasury": Object.freeze({ tier: 19, name: "Eternium Treasury", file: "village/building_19.webp" }),
    "astral museum": Object.freeze({ tier: 20, name: "Astral Museum", file: "village/building_20.webp" }),
    "gravite botanical dome": Object.freeze({ tier: 21, name: "Gravite Botanical Dome", file: "village/building_21.webp" }),
    "frostiron warfront hall": Object.freeze({ tier: 22, name: "Frostiron Warfront Hall", file: "village/building_22.webp" }),
    "dusksteel citadel wall": Object.freeze({ tier: 23, name: "Dusksteel Citadel Wall", file: "village/building_23.webp" }),
    "titanium grand infirmary": Object.freeze({ tier: 24, name: "Titanium Grand Infirmary", file: "village/building_24.webp" }),
    "skysteel observatory": Object.freeze({ tier: 25, name: "Skysteel Observatory", file: "village/building_25.webp" }),
    "emberium mint": Object.freeze({ tier: 26, name: "Emberium Mint", file: "village/building_26.webp" }),
    "soulsteel vault of relics": Object.freeze({ tier: 27, name: "Soulsteel Vault of Relics", file: "village/building_27.webp" }),
    "chronite greenhouse spire": Object.freeze({ tier: 28, name: "Chronite Greenhouse Spire", file: "village/building_28.webp" }),
    "worldforge coliseum": Object.freeze({ tier: 29, name: "Worldforge Coliseum", file: "village/building_29.webp" }),
    "voidglass bulwark": Object.freeze({ tier: 30, name: "Voidglass Bulwark", file: "village/building_30.webp" }),
    "thalassic sanctum of tides": Object.freeze({ tier: 31, name: "Thalassic Sanctum of Tides", file: "village/building_31.webp" }),
    "ashspire hall of records": Object.freeze({ tier: 32, name: "Ashspire Hall of Records", file: "village/building_32.webp" }),
    "glacirite royal treasury": Object.freeze({ tier: 33, name: "Glacirite Royal Treasury", file: "village/building_33.webp" }),
    "primordial wonder": Object.freeze({ tier: 34, name: "Primordial Wonder", file: "village/building_34.webp" })
  });
  var VILLAGE_HOUSES = Object.freeze({
    "camp": Object.freeze({ tier: 1, name: "Camp", file: "village/house_1.webp" }),
    "cottage": Object.freeze({ tier: 2, name: "Cottage", file: "village/house_2.webp" }),
    "villa": Object.freeze({ tier: 3, name: "Villa", file: "village/house_3.webp" }),
    "manor": Object.freeze({ tier: 4, name: "Manor", file: "village/house_4.webp" }),
    "citadel": Object.freeze({ tier: 5, name: "Citadel", file: "village/house_5.webp" })
  });

  // src/modules/VillagePanels.js
  var HOUSE_BY_TIER = Object.values(VILLAGE_HOUSES).sort((a, b) => a.tier - b.tier);
  var HOUSE_TIERS = HOUSE_BY_TIER.length;
  var cardSignatures = /* @__PURE__ */ new WeakMap();
  var houseSignatures = /* @__PURE__ */ new WeakMap();
  var norm2 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var label = (value) => norm2(value).replace(/^[^\p{L}\p{N}]+/u, "");
  function mark2(el2, key, value) {
    if (el2 && el2.getAttribute(key) !== value) el2.setAttribute(key, value);
  }
  function unmark(el2, key) {
    if (el2 && el2.hasAttribute(key)) el2.removeAttribute(key);
  }
  function owned2(tag, className, text) {
    const el2 = document.createElement(tag);
    el2.className = className;
    el2.dataset.iwVillageOwned = "1";
    if (text) el2.textContent = text;
    return el2;
  }
  function nativeChildren(el2) {
    return el2 ? [...el2.children].filter((child) => !child.hasAttribute("data-iw-village-owned")) : [];
  }
  function ensureArt(card, entry2, kind2) {
    let art2 = card.querySelector(":scope > .iw-village-art");
    if (!art2) {
      art2 = owned2("div", "iw-village-art");
      art2.setAttribute("aria-hidden", "true");
      card.appendChild(art2);
    }
    const file = entry2?.file || null;
    mark2(art2, "data-iw-village-art", file ? kind2 : "generic");
    if (file) art2.style.setProperty("--iw-village-sprite", `url("${assetUrl(`assets/${file}`)}")`);
    else art2.style.removeProperty("--iw-village-sprite");
    return art2;
  }
  function removeArt(card) {
    card.querySelector(":scope > .iw-village-art")?.remove();
  }
  function resolveBuilding(name) {
    return VILLAGE_BUILDINGS[norm2(name).toLowerCase()] || null;
  }
  function ensureTrigger(el2, name) {
    if (!el2) return;
    const item = name && ItemDatabase.isReady() ? ItemDatabase.find({ name }) : null;
    if (!item) {
      clearTrigger(el2);
      return;
    }
    mark2(el2, "data-iw-item-name", item.name);
    mark2(el2, "data-iw-tooltip-trigger", "1");
    mark2(el2, "tabindex", "0");
    mark2(el2, "aria-haspopup", "dialog");
    mark2(el2, "aria-controls", "iw-tip");
    if (!el2.hasAttribute("aria-expanded")) el2.setAttribute("aria-expanded", "false");
  }
  function clearTrigger(el2) {
    for (const attr of [
      "data-iw-item-name",
      "data-iw-item",
      "data-iw-tooltip-trigger",
      "tabindex",
      "aria-haspopup",
      "aria-controls",
      "aria-expanded"
    ]) unmark(el2, attr);
  }
  function decorateSlot(card) {
    const head = nativeChildren(card)[0] || null;
    const copy = head ? nativeChildren(head)[0] : null;
    const lines = copy ? [...copy.children].filter((el2) => el2.tagName === "P") : [];
    const index = lines.find((el2) => /^slot\s+\d+$/i.test(label(el2.textContent))) || null;
    const rest = lines.filter((el2) => el2 !== index);
    const vacant = rest.find((el2) => /^empty slot$/i.test(label(el2.textContent))) || null;
    const name = vacant ? null : rest[0] || null;
    const effects = vacant ? null : rest[1] || null;
    const buildingName = name ? label(name.textContent) : "";
    const building = resolveBuilding(buildingName);
    const state = vacant ? "vacant" : name ? "installed" : "unknown";
    if (state === "unknown") {
      undecorateSlot(card);
      return false;
    }
    mark2(card, "data-iw-village", "slot");
    mark2(card, "data-iw-village-state", state);
    mark2(head, "data-iw-village-role", "head");
    mark2(copy, "data-iw-village-role", "copy");
    mark2(index, "data-iw-village-role", "index");
    mark2(name, "data-iw-village-role", "name");
    mark2(effects, "data-iw-village-role", "effects");
    mark2(vacant, "data-iw-village-role", "vacant");
    const actions = head ? nativeChildren(head)[1] : null;
    if (actions) {
      mark2(actions, "data-iw-village-role", actions.tagName === "BUTTON" ? "action" : "actions");
      for (const button2 of actions.tagName === "BUTTON" ? [actions] : actions.querySelectorAll("button")) {
        mark2(button2, "data-iw-village-role", "action");
        const verb = label(button2.textContent).toLowerCase();
        mark2(
          button2,
          "data-iw-village-action",
          verb.startsWith("destroy") ? "destroy" : verb.startsWith("uninstall") ? "uninstall" : verb.startsWith("install") ? "install" : verb.startsWith("cancel") ? "cancel" : "other"
        );
      }
    }
    const picker = nativeChildren(card)[1] || null;
    mark2(picker, "data-iw-village-role", "picker");
    for (const option of picker ? picker.querySelectorAll("button, div") : []) {
      if (option.closest("[data-iw-village-owned]")) continue;
      const optionName = option.querySelector(":scope > p");
      if (!optionName) continue;
      const bare = label([...optionName.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join(""));
      const match = resolveBuilding(bare);
      mark2(option, "data-iw-village-role", option.tagName === "BUTTON" ? "option" : "option-owned");
      mark2(optionName, "data-iw-village-role", "option-name");
      ensureOptionArt(optionName, match);
    }
    ensureArt(card, building, "building");
    ensureTrigger(name, building ? building.name : buildingName);
    return true;
  }
  function ensureOptionArt(nameEl, entry2) {
    let art2 = nameEl.querySelector(":scope > .iw-village-option-art");
    if (!entry2) {
      art2?.remove();
      return;
    }
    if (!art2) {
      art2 = owned2("span", "iw-village-option-art");
      art2.setAttribute("aria-hidden", "true");
      nameEl.prepend(art2);
    }
    art2.style.setProperty("--iw-village-sprite", `url("${assetUrl(`assets/${entry2.file}`)}")`);
  }
  function undecorateSlot(card) {
    removeArt(card);
    card.querySelectorAll("[data-iw-village-owned]").forEach((el2) => el2.remove());
    card.querySelectorAll("[data-iw-tooltip-trigger]").forEach(clearTrigger);
    clearTrigger(card);
    for (const attr of [
      "data-iw-village",
      "data-iw-village-state",
      "data-iw-village-role",
      "data-iw-village-action",
      "data-iw-village-art"
    ]) {
      unmark(card, attr);
      card.querySelectorAll(`[${attr}]`).forEach((el2) => el2.removeAttribute(attr));
    }
    cardSignatures.delete(card);
  }
  function slotSignature(card) {
    const head = nativeChildren(card)[0];
    const controls = [...card.querySelectorAll("button")].map((b) => norm2(b.textContent)).join("|");
    return `${norm2(head?.textContent)} ${controls} ${nativeChildren(card).length} ${ItemDatabase.revision()}`;
  }
  function houseTier(card, nameEl) {
    const tierLine = [...card.querySelectorAll("p")].map((el2) => norm2(el2.textContent)).find((text) => /^current tier\s*:/i.test(text));
    const digits = tierLine ? /^current tier\s*:\s*(\d+)/i.exec(tierLine) : null;
    if (digits) return Number(digits[1]) || null;
    const named = VILLAGE_HOUSES[label(nameEl?.textContent).toLowerCase()];
    return named ? named.tier : null;
  }
  function ensureTierTrack(card, tier) {
    let track = card.querySelector(":scope > .iw-village-tiers");
    if (!track) {
      track = owned2("div", "iw-village-tiers");
      track.setAttribute("aria-hidden", "true");
      card.appendChild(track);
    }
    if (track.children.length !== HOUSE_TIERS) {
      track.replaceChildren(...Array.from({ length: HOUSE_TIERS }, () => owned2("span", "iw-village-tier-pip")));
    }
    [...track.children].forEach((pip, i) => {
      mark2(pip, "data-iw-village-pip", i < (tier || 0) ? "held" : "open");
    });
  }
  function decorateHousing(root) {
    const card = root.querySelector(".compact-panel");
    if (!card) return false;
    const lines = [...card.children].filter((el2) => el2.tagName === "P");
    const nameEl = lines[0] || null;
    if (!nameEl) return false;
    const tier = houseTier(card, nameEl);
    const sig = `${norm2(card.textContent)} ${nativeChildren(card).length}`;
    mark2(root, "data-iw-village", "housing");
    mark2(card, "data-iw-village", "house");
    if (houseSignatures.get(card) === sig) return true;
    houseSignatures.set(card, sig);
    mark2(card, "data-iw-village-tier", String(tier ?? 0));
    mark2(nameEl, "data-iw-village-role", "house-name");
    for (const line of lines.slice(1)) {
      const text = norm2(line.textContent);
      if (/^current tier\s*:/i.test(text)) mark2(line, "data-iw-village-role", "house-tier");
      else if (/^salvage material owned\s*:/i.test(text)) mark2(line, "data-iw-village-role", "house-salvage");
      else if (/^next upgrade\s*:/i.test(text)) mark2(line, "data-iw-village-role", "house-next");
      else if (/^maximum housing tier reached/i.test(text)) mark2(line, "data-iw-village-role", "house-max");
      else mark2(line, "data-iw-village-role", "house-note");
    }
    for (const button2 of card.querySelectorAll("button")) {
      mark2(button2, "data-iw-village-role", "action");
      mark2(button2, "data-iw-village-action", "upgrade");
    }
    ensureArt(card, HOUSE_BY_TIER.find((house) => house.tier === tier) || null, "house");
    ensureTierTrack(card, tier);
    return true;
  }
  function decorateVillagePanel({ root, kind: kind2 }) {
    if (kind2 === "housing") {
      decorateHousing(root);
      return;
    }
    mark2(root, "data-iw-village", "addons");
    const intro = [...root.children].find((el2) => el2.tagName === "P");
    mark2(intro, "data-iw-village-role", "intro");
    for (const card of root.querySelectorAll(".compact-panel")) {
      if (card.querySelector(".compact-panel")) continue;
      const sig = slotSignature(card);
      if (cardSignatures.get(card) === sig) continue;
      cardSignatures.set(card, sig);
      if (!decorateSlot(card)) cardSignatures.delete(card);
    }
    for (const note of root.querySelectorAll("p")) {
      if (note === intro || note.closest(".compact-panel")) continue;
      mark2(note, "data-iw-village-role", "note");
    }
  }
  function clearVillagePanel(root) {
    if (!root) return;
    root.querySelectorAll(".compact-panel").forEach(undecorateSlot);
    root.querySelectorAll("[data-iw-village-owned]").forEach((el2) => el2.remove());
    root.querySelectorAll("[data-iw-tooltip-trigger]").forEach(clearTrigger);
    for (const attr of [
      "data-iw-village",
      "data-iw-village-state",
      "data-iw-village-role",
      "data-iw-village-action",
      "data-iw-village-art",
      "data-iw-village-tier",
      "data-iw-village-pip"
    ]) {
      if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
      root.querySelectorAll(`[${attr}]`).forEach((el2) => el2.removeAttribute(attr));
    }
  }

  // src/modules/VillageLedger.js
  var STORE_KEY = "iw-village-ledger";
  var BENEFITS = [
    { key: "atk", label: "ATK", kind: "flat" },
    { key: "def", label: "DEF", kind: "flat" },
    { key: "hp", label: "HP", kind: "flat" },
    { key: "warfare", label: "Warfare", kind: "flat" },
    { key: "xpPerTask", label: "XP / task", kind: "flat" },
    { key: "doubleGatherPct", label: "2× gather", kind: "pct" },
    { key: "goldFindPct", label: "Gold find", kind: "pct" },
    { key: "itemFindPct", label: "Item find", kind: "pct" },
    { key: "allResists", label: "All resists", kind: "flat" },
    { key: "fireResist", label: "Fire resist", kind: "flat" },
    { key: "frostResist", label: "Frost resist", kind: "flat" },
    { key: "lightningResist", label: "Lightning resist", kind: "flat" },
    { key: "bonusBrewPct", label: "Bonus brew", kind: "pct" },
    { key: "bonusEnhancePct", label: "Bonus enhance", kind: "pct" },
    { key: "bonusEnchantPct", label: "Bonus enchant", kind: "pct" }
  ];
  var amount = (value, kind2) => `${value > 0 ? "+" : ""}${Number(value.toFixed(2))}${kind2 === "pct" ? "%" : ""}`;
  var skillLabel = (skill) => String(skill || "").replace(new RegExp("(^|\\s)\\p{Ll}", "gu"), (m) => m.toUpperCase());
  var prefs = null;
  var loading = null;
  var touched = /* @__PURE__ */ new Set();
  var live = [];
  function loadPreferences() {
    if (prefs) return loading;
    prefs = /* @__PURE__ */ new Map();
    loading = storageGet(STORE_KEY).then((bag) => {
      if (!bag || typeof bag !== "object") return;
      for (const [key, value] of Object.entries(bag)) {
        if (value === false && !touched.has(key)) prefs.set(key, false);
      }
      for (const row of live) applyEntry(row);
    }).catch((err) => warnOnce("village-ledger:load", err));
    return loading;
  }
  function persist() {
    const bag = {};
    for (const [key, value] of prefs) if (value === false) bag[key] = false;
    void storageSet(STORE_KEY, bag);
  }
  function applyEntry(row) {
    const open = prefs?.get(row.key) !== false;
    const want = open ? "1" : "0";
    if (row.entry.dataset.iwVsOpen !== want) row.entry.dataset.iwVsOpen = want;
    const expanded = open ? "true" : "false";
    if (row.button.getAttribute("aria-expanded") !== expanded) {
      row.button.setAttribute("aria-expanded", expanded);
    }
    const label4 = `${open ? "Collapse" : "Expand"} ${row.name}`;
    if (row.button.getAttribute("title") !== label4) row.button.setAttribute("title", label4);
  }
  var ids = 0;
  function icon(own2, file, fallback2) {
    const box = own2("span", "iw-vs-entry-icon");
    box.setAttribute("aria-hidden", "true");
    if (!file) {
      box.textContent = fallback2;
      return box;
    }
    const img = own2("img", "iw-vs-entry-sprite");
    img.src = assetUrl(`assets/${file}`);
    img.alt = "";
    img.decoding = "async";
    box.append(img);
    return box;
  }
  function statList(own2, rows) {
    const list = own2("dl", "iw-vs-stats");
    for (const row of rows) {
      const line = own2("div", "iw-vs-stat");
      if (row.kind) line.dataset.iwVsStatKind = row.kind;
      line.append(own2("dt", "", row.label), own2("dd", "", row.value));
      list.append(line);
    }
    return list;
  }
  function chevron(own2) {
    const mark4 = own2("span", "iw-vs-chevron");
    mark4.setAttribute("aria-hidden", "true");
    return mark4;
  }
  function wire(key, name, box, button2) {
    const row = { key, name, entry: box, button: button2 };
    button2.addEventListener("click", (event) => {
      event.preventDefault();
      const closed = prefs.get(key) === false;
      if (closed) prefs.delete(key);
      else prefs.set(key, false);
      touched.add(key);
      persist();
      applyEntry(row);
    });
    live.push(row);
    applyEntry(row);
    return row;
  }
  function entry(own2, { key, name, meta, file, fallback: fallback2, rows, notes, empty }) {
    const box = own2("div", "iw-vs-entry");
    box.dataset.iwVsEntry = key;
    const button2 = own2("button", "iw-vs-entry-head");
    button2.type = "button";
    button2.dataset.iwVsToggle = "1";
    const bodyId = `iw-vs-entry-${ids += 1}`;
    button2.setAttribute("aria-controls", bodyId);
    button2.setAttribute("aria-expanded", "true");
    const label4 = own2("span", "iw-vs-entry-label");
    label4.append(own2("span", "iw-vs-entry-name", name));
    if (meta) label4.append(own2("span", "iw-vs-entry-meta", meta));
    button2.append(icon(own2, file, fallback2), label4, chevron(own2));
    const body = own2("div", "iw-vs-entry-body");
    body.id = bodyId;
    const lines = notes || [];
    if (rows.length) body.append(statList(own2, rows));
    for (const note of lines) body.append(own2("p", "iw-vs-entry-note", note));
    if (!rows.length && !lines.length) {
      body.append(own2("p", "iw-vs-entry-note", empty || "No recorded effects."));
    }
    box.append(button2, body);
    wire(key, name, box, button2);
    return box;
  }
  function buildingItem(slot) {
    if (!ItemDatabase.isReady()) return null;
    return ItemDatabase.find({ id: slot.itemKey || "", name: slot.name || "" });
  }
  function buildingBenefits(item) {
    if (!item) return [];
    const stats = deriveDisplayStats(item);
    const rows = [];
    for (const spec of BENEFITS) {
      const value = stats[spec.key];
      if (!Number.isFinite(value) || value === 0) continue;
      rows.push({ label: spec.label, value: amount(value, spec.kind) });
    }
    const skill = String(item.skill_bonus_skill || "").trim();
    const level = Number(item.skill_bonus_value);
    if (skill && Number.isFinite(level) && level !== 0) {
      rows.push({
        label: `${skillLabel(skill)} level`,
        value: amount(level, "flat"),
        kind: "skill-level"
      });
    }
    return rows;
  }
  function totalBenefits(items) {
    const sums = /* @__PURE__ */ new Map();
    const skills = /* @__PURE__ */ new Map();
    for (const item of items) {
      const stats = deriveDisplayStats(item);
      for (const spec of BENEFITS) {
        const value = stats[spec.key];
        if (!Number.isFinite(value) || value === 0) continue;
        sums.set(spec.key, (sums.get(spec.key) || 0) + value);
      }
      const skill = String(item.skill_bonus_skill || "").trim();
      const level = Number(item.skill_bonus_value);
      if (skill && Number.isFinite(level) && level !== 0) {
        skills.set(skill, (skills.get(skill) || 0) + level);
      }
    }
    const rows = [];
    for (const spec of BENEFITS) {
      if (!sums.has(spec.key)) continue;
      rows.push({ label: spec.label, value: amount(sums.get(spec.key), spec.kind) });
    }
    for (const [skill, level] of [...skills].sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push({
        label: `${skillLabel(skill)} level`,
        value: amount(level, "flat"),
        kind: "skill-level"
      });
    }
    return rows;
  }
  function buildVillageLedger({ snapshot: snapshot2, house, perks: perks2, own: own2 }) {
    void loadPreferences();
    live = [];
    const ledger = own2("div", "iw-vs-ledger");
    ledger.dataset.iwVillageLedger = "1";
    const head = own2("div", "iw-vs-ledger-head");
    head.append(own2("div", "iw-vs-ledger-title", "Buildings"));
    const sectionToggle = own2("button", "iw-vs-ledger-toggle");
    sectionToggle.type = "button";
    sectionToggle.dataset.iwVsToggle = "section";
    sectionToggle.setAttribute("aria-expanded", "true");
    sectionToggle.append(chevron(own2));
    head.append(sectionToggle);
    const list = own2("div", "iw-vs-ledger-list");
    list.id = `iw-vs-list-${ids += 1}`;
    sectionToggle.setAttribute("aria-controls", list.id);
    ledger.append(head, list);
    wire("ledger", "the building list", ledger, sectionToggle);
    list.append(entry(own2, {
      key: "home",
      name: house?.name || "No House",
      meta: `Home · tier ${snapshot2.tier}`,
      file: house?.file || null,
      fallback: "⌂",
      rows: snapshot2.tier ? [{ label: "Village slots", value: String(snapshot2.capacity) }] : [],
      notes: snapshot2.tier ? perks2 || [] : [],
      empty: "Build a home on the Village tab to open your first plot."
    }));
    const installed = [];
    for (const slot of snapshot2.slots) {
      if (slot.state !== "installed") {
        const line = own2("div", "iw-vs-ledger-vacant");
        line.dataset.iwVsSlotState = slot.state;
        line.append(
          own2("span", "", `Slot ${slot.slot}`),
          own2("span", "", slot.state === "locked" ? "Locked · upgrade housing" : "Empty plot")
        );
        list.append(line);
        continue;
      }
      const item = buildingItem(slot);
      if (item) installed.push(item);
      const tier = Number(item?.tier);
      list.append(entry(own2, {
        key: `building:${slot.name.toLowerCase()}`,
        name: slot.name,
        meta: `Slot ${slot.slot}${Number.isFinite(tier) ? ` · tier ${tier}` : ""}`,
        file: slot.file,
        fallback: "⌂",
        rows: buildingBenefits(item),
        empty: ItemDatabase.isReady() ? "This building records no effects." : "Effects arrive with the item database."
      }));
    }
    const totals = own2("section", "iw-vs-totals");
    totals.dataset.iwVillageTotals = "1";
    const title = own2("div", "iw-vs-totals-title", "Overall stats");
    title.setAttribute("role", "heading");
    title.setAttribute("aria-level", "3");
    totals.append(title);
    const rows = totalBenefits(installed);
    if (rows.length) totals.append(statList(own2, rows));
    let note;
    if (!ItemDatabase.isReady()) note = "Waiting on the item database before totalling your buildings.";
    else if (!installed.length) note = "No installed buildings yet, so nothing is counted here.";
    else {
      note = `Summed from ${installed.length} installed building${installed.length === 1 ? "" : "s"}. Housing is not counted.`;
    }
    totals.append(own2("p", "iw-vs-totals-note", note));
    ledger.append(totals);
    return ledger;
  }
  function clearVillageLedger() {
    prefs = null;
    loading = null;
    live = [];
    touched.clear();
  }

  // src/modules/VillageScene.js
  var buildings = Object.values(VILLAGE_BUILDINGS);
  var houses = Object.values(VILLAGE_HOUSES);
  var REFRESH_MS = 3e5;
  var RETRY_MS = 3e4;
  var ROUTE_REFRESH_MS = 1e4;
  var frame = null;
  var anchor = null;
  var anchorEpoch = -1;
  var snapshot = null;
  var signature = "";
  var nextRead = 0;
  var request = null;
  var generation = 0;
  var context = "";
  var league = "";
  var message = "Loading your village…";
  var perks = { tier: null, lines: [] };
  var bound2 = false;
  function leagueOf(path) {
    return /^\/ssf(?:\/|$)/.test(path) ? "ssf" : "standard";
  }
  var SECTIONS = {
    "": "dashboard",
    housing: "housing",
    market: "market",
    leaderboards: "leaderboards",
    dungeon: "dungeon"
  };
  function sectionOf(path) {
    const rest = path.replace(/^\/ssf(?=\/|$)/, "").replace(/^\/+|\/+$/g, "");
    return SECTIONS[rest] || "dashboard";
  }
  function normaliseVillage(data) {
    const player = data?.player;
    const tier = player?.housing?.tier;
    const addons = player?.villageAddons;
    if (!Number.isInteger(tier) || tier < 0 || tier > 5 || !addons || !Number.isInteger(addons.totalSlots) || addons.totalSlots < 0 || addons.totalSlots > 5 || !Array.isArray(addons.installed)) return null;
    const slots = Array.from({ length: 5 }, (_, i) => ({
      slot: i + 1,
      state: i < addons.totalSlots ? "empty" : "locked",
      name: "",
      file: null,
      itemKey: ""
    }));
    for (const row of addons.installed) {
      if (!Number.isInteger(row.slot) || row.slot < 1 || row.slot > addons.totalSlots) return null;
      const entry2 = buildings.find((b) => row.itemKey === `construction_building_tier_${b.tier}`) || VILLAGE_BUILDINGS[String(row.name || "").replace(/\s+/g, " ").trim().toLowerCase()];
      if (!entry2 && !row.name) return null;
      if (slots[row.slot - 1].state === "installed") return null;
      slots[row.slot - 1] = {
        slot: row.slot,
        state: "installed",
        name: row.name || entry2.name,
        file: entry2?.file || null,
        itemKey: row.itemKey || (entry2 ? `construction_building_tier_${entry2.tier}` : "")
      };
    }
    return { tier, capacity: addons.totalSlots, slots };
  }
  function own(tag, cls, text) {
    const el2 = document.createElement(tag);
    el2.className = cls;
    el2.dataset.iwVillageSceneOwned = "1";
    if (text) el2.textContent = text;
    return el2;
  }
  function art(file, fallback2) {
    if (!file) return own("span", "iw-vs-placeholder", fallback2);
    const img = own("img", "iw-vs-sprite");
    img.src = assetUrl(`assets/${file}`);
    img.alt = "";
    img.decoding = "async";
    return img;
  }
  function findAnchor() {
    if (anchor?.isConnected && anchorEpoch === getLayoutEpoch() && /^(skill actions|actions)$/i.test(anchor.querySelector("h2")?.textContent.trim() || "")) return anchor;
    const headings = [...document.querySelectorAll("h2")].filter((h) => !h.closest('[data-iw-village-scene], [role="dialog"], [data-iw-overlay]') && /^(skill actions|actions)$/i.test(h.textContent.trim()));
    anchor = pickRendered(headings.map((h) => h.closest(".panel") || h.closest(".fs-skills-section-frame")).filter(Boolean));
    anchorEpoch = getLayoutEpoch();
    return anchor;
  }
  function readHousingPerks(house, tier) {
    if (!Number.isInteger(tier)) return;
    const lines = [];
    for (const line of house.querySelectorAll("p")) {
      const text = line.textContent.replace(/\s+/g, " ").trim();
      const tail = /^current tier\s*:\s*\d+\s*[•·|–—-]\s*(.+)$/i.exec(text);
      if (!tail) continue;
      for (const part of tail[1].split(/\s*[•·|]\s*/)) {
        const value = part.trim();
        if (value) lines.push(value);
      }
    }
    if (!lines.length && perks.tier === tier) return;
    perks = { tier, lines };
  }
  function readRenderedVillage() {
    const house = pickRendered([...document.querySelectorAll('[data-iw-village="housing"]')]);
    const addons = pickRendered([...document.querySelectorAll('[data-iw-village="addons"]')]);
    if (!house || !addons) return null;
    const tier = Number(house.textContent.match(/Current tier:\s*(\d+)/i)?.[1]);
    readHousingPerks(house, tier);
    const capacity = Number(addons.querySelector('[data-iw-village-role="intro"]')?.textContent.match(/(\d+)\s+slots? available/i)?.[1]);
    if (!Number.isInteger(capacity)) return null;
    const cards = [...addons.querySelectorAll('[data-iw-village="slot"]')];
    if (cards.length !== capacity) return null;
    const installed = cards.filter((c) => c.dataset.iwVillageState === "installed").map((c) => ({
      slot: Number(c.querySelector('[data-iw-village-role="index"]')?.textContent.match(/\d+/)?.[0]),
      name: c.querySelector('[data-iw-village-role="name"]')?.textContent.trim()
    }));
    return normaliseVillage({ player: { housing: { tier }, villageAddons: { totalSlots: capacity, installed } } });
  }
  function render(status = message) {
    message = status;
    if (!frame) return;
    const housePerks = perks.tier === snapshot?.tier ? perks.lines : [];
    const key = JSON.stringify([snapshot, status, housePerks, ItemDatabase.revision()]);
    if (signature === key) return;
    signature = key;
    for (const child of [...frame.children]) {
      if (child.dataset.iwVillageSceneOwned === "1") child.remove();
    }
    const head = own("div", "iw-vs-heading");
    const title = own("div", "iw-vs-title", "Village");
    title.setAttribute("role", "heading");
    title.setAttribute("aria-level", "2");
    head.append(title);
    frame.append(head);
    if (snapshot) {
      const installed = snapshot.slots.filter((s) => s.state === "installed").length;
      head.append(own("span", "iw-vs-count", `${installed} installed / ${snapshot.capacity} slots`));
      const body = own("div", "iw-vs-body");
      const scene = own("div", "iw-vs-scene");
      const house = houses.find((h) => h.tier === snapshot.tier);
      const home = own("div", "iw-vs-house");
      home.append(
        art(house?.file, "⌂"),
        own("strong", "", house?.name || "No House"),
        own("span", "iw-vs-status", `Housing tier ${snapshot.tier}`)
      );
      scene.append(home);
      for (const slot of snapshot.slots) {
        const plot = own("div", "iw-vs-plot");
        plot.dataset.slot = String(slot.slot);
        plot.dataset.plotState = slot.state;
        plot.append(
          art(slot.file, slot.state === "locked" ? "◇" : "⌂"),
          own("strong", "iw-vs-name", slot.name || (slot.state === "locked" ? "Locked plot" : "Empty plot")),
          own("span", "iw-vs-status", `Slot ${slot.slot} · ${slot.state === "locked" ? "Upgrade housing" : slot.state === "installed" ? "Installed" : "Available"}`)
        );
        scene.append(plot);
      }
      const stage = own("div", "iw-vs-stage");
      stage.append(scene);
      body.append(stage, buildVillageLedger({ snapshot, house, perks: housePerks, own }));
      frame.append(body);
    }
    frame.append(own("p", "iw-vs-note", status || "Your installed village. Manage housing and buildings in the Village tab."));
  }
  function bindOnce2() {
    if (bound2 || typeof document === "undefined") return;
    bound2 = true;
    document.addEventListener("iw:item-db-updated", () => {
      reconcileVillageScene().catch((err) => warnOnce("village-scene:item-db", err));
    });
  }
  async function reconcileVillageScene() {
    if (!isRuntimeActive()) return;
    bindOnce2();
    const route = `${location.pathname}${location.search}`;
    if (context !== route) {
      const current = leagueOf(location.pathname);
      if (current !== league) {
        snapshot = null;
        perks = { tier: null, lines: [] };
        message = "Loading your village…";
        signature = "";
      }
      league = current;
      generation += 1;
      request?.abort();
      request = null;
      nextRead = Math.min(nextRead, Date.now() + ROUTE_REFRESH_MS);
      context = route;
    }
    const rendered = readRenderedVillage();
    if (rendered) {
      snapshot = rendered;
      message = "";
    }
    const target = findAnchor();
    if (!target) {
      frame?.remove();
      frame = null;
      signature = "";
      request?.abort();
      request = null;
      return;
    }
    if (!frame?.isConnected || frame.previousElementSibling !== target) {
      frame?.remove();
      frame = own("section", "iw-village-scene");
      frame.dataset.iwVillageScene = "1";
      frame.dataset.iwUi = "section-frame";
      frame.dataset.iwPanel = "village-scene";
      frame.setAttribute("aria-label", "Village");
      target.after(frame);
      signature = "";
    }
    render();
    if (request || Date.now() < nextRead || document.visibilityState === "hidden") return;
    const token = generation;
    const controller = new AbortController();
    request = controller;
    nextRead = Date.now() + REFRESH_MS;
    const timeout = setTimeout(() => controller.abort(), 1e4);
    try {
      const response = await fetch(
        `/api/player?section=${encodeURIComponent(sectionOf(location.pathname))}&scope=core`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { "x-idleworlds-league": league || leagueOf(location.pathname) }
        }
      );
      if (!response.ok) throw new Error("Village unavailable");
      const result = normaliseVillage(await response.json());
      if (!result) throw new Error("Village unavailable");
      if (controller.signal.aborted || token !== generation || !isRuntimeActive()) return;
      snapshot = result;
      render("");
    } catch {
      if (token !== generation || !isRuntimeActive()) return;
      nextRead = Date.now() + RETRY_MS;
      render(snapshot ? "Showing the last loaded village. Refresh unavailable; retrying shortly." : "Village could not be loaded. Open the Village tab to view your buildings.");
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }
  function clearVillageScene() {
    generation++;
    request?.abort();
    request = null;
    frame?.remove();
    clearVillageLedger();
    perks = { tier: null, lines: [] };
    frame = anchor = snapshot = null;
    signature = context = league = "";
    message = "Loading your village…";
    nextRead = 0;
    anchorEpoch = -1;
  }

  // src/modules/AshmawArenaRenderer.js
  var ARENA_PERIOD = 16;
  var BATTLE_EFFECTS_ENABLED = false;
  var TAU = Math.PI * 2;
  var frac = (x) => x - Math.floor(x);
  var smooth = (a, b, x) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  var envelope = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));
  function getArenaCue(seconds, battle = true) {
    const t = frac(seconds / ARENA_PERIOD) * ARENA_PERIOD;
    return {
      t,
      warning: battle ? envelope(t, 4.6, 5.3, 6, 6.2) : 0,
      rupture: battle ? envelope(t, 6.05, 6.22, 6.6, 7.8) : 0,
      debris: battle ? envelope(t, 6.25, 6.45, 7.7, 9.5) : 0
    };
  }
  function createArenaScene(canvas, { background, ruptureOverlay, maxWidth, cloudAtlas, smokeAtlas, steamAtlas, strength = 0.75 } = {}) {
    const sourceWidth = background.naturalWidth || background.width, sourceHeight = background.naturalHeight || background.height;
    const scale = Math.min(1, (maxWidth || sourceWidth) / sourceWidth);
    const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    const buffers = [];
    let destroyed = false;
    const layer = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      buffers.push(c);
      return c;
    };
    if (scale < 1) {
      const scaled = layer(width, height);
      scaled.getContext("2d").drawImage(background, 0, 0, width, height);
      background = scaled;
    }
    let seed = 491;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const dust = Array.from({ length: 140 }, () => ({ x: random(), offset: random(), s: 0.7 + random() * 1.8, drift: random() * 2 - 1 }));
    const debris = Array.from({ length: 26 }, () => ({ x: random(), v: random(), s: 2 + random() * 5, spin: random() * 2 - 1, delay: random() * 0.3 }));
    const atlas = (image) => Array.from({ length: 4 }, (_, index) => {
      const c = layer(384, 256), cx = c.getContext("2d", { willReadFrequently: true });
      if (!image) return { image: c, x: 0, y: 0, w: 384, h: 256 };
      const iw = (image.naturalWidth || image.width) / 2, ih = (image.naturalHeight || image.height) / 2;
      cx.drawImage(image, index % 2 * iw, Math.floor(index / 2) * ih, iw, ih, 0, 0, 384, 256);
      const data = cx.getImageData(0, 0, 384, 256);
      let left = 384, top = 256, right = 0, bottom = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++) {
        const k = (y * 384 + x) * 4 + 3, edge = Math.min(x, y, 383 - x, 255 - y) / 16;
        data.data[k] *= Math.min(1, Math.max(0, edge));
        if (data.data[k] > 16) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      cx.putImageData(data, 0, 0);
      if (left > right) return { image: c, x: 0, y: 0, w: 384, h: 256 };
      return { image: c, x: Math.max(0, left - 8), y: Math.max(0, top - 8), w: Math.min(384, right + 9) - Math.max(0, left - 8), h: Math.min(256, bottom + 9) - Math.max(0, top - 8) };
    });
    const clouds = atlas(cloudAtlas), breath = atlas(smokeAtlas), steam = atlas(steamAtlas);
    const plume = (target, sprite, x, y, w, h, alpha, angle = 0, flip = false) => {
      if (alpha < 1e-3) return;
      target.save();
      target.globalAlpha = alpha * strength;
      target.translate(x, y);
      target.rotate(angle);
      target.scale(flip ? -1 : 1, 1);
      target.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, -w / 2, -h / 2, w, h);
      target.restore();
    };
    const skyLayers = [
      { points: [[0.225, 0], [0.61, 0], [0.602, 0.065], [0.582, 0.1], [0.57, 0.15], [0.495, 0.15], [0.43, 0.11], [0.41, 0.085], [0.37, 0.1], [0.32, 0.07], [0.225, 0.07]], dx: 100, dy: 28, offset: 0, alpha: 0.96 },
      { points: [[0.4, 0], [0.588, 0], [0.588, 0.067], [0.572, 0.13], [0.52, 0.16], [0.45, 0.12], [0.4, 0.075]], dx: -72, dy: 32, offset: 0.65, alpha: 0.88 },
      { points: [[0, 0], [0.23, 0], [0.22, 0.057], [0.18, 0.06], [0.145, 0.02], [0.1, 0.01], [0.072, 0.035], [0.045, 0.08], [0, 0.085]], dx: 80, dy: 16, offset: 1.4, alpha: 0.84 }
    ].map((f) => {
      const x = Math.max(0, Math.floor(Math.min(...f.points.map((p) => p[0])) * width) - 39), y = 0;
      const w = Math.min(width, Math.ceil(Math.max(...f.points.map((p) => p[0])) * width) + 39) - x, h = Math.ceil(Math.max(...f.points.map((p) => p[1])) * height) + 39;
      const mask = layer(w, h), mc = mask.getContext("2d");
      mc.filter = "blur(13px)";
      mc.fillStyle = "#fff";
      mc.beginPath();
      f.points.forEach(([a, b], i) => i ? mc.lineTo(a * width - x, b * height - y) : mc.moveTo(a * width - x, b * height - y));
      mc.closePath();
      mc.fill();
      const surface = layer(w, h);
      return { ...f, x, y, w, h, mask, surface, sc: surface.getContext("2d") };
    });
    function paintedClouds(phase2) {
      ctx.save();
      for (const [index, f] of skyLayers.entries()) {
        const a = TAU * phase2 * 2 + f.offset, sc = f.sc;
        sc.globalCompositeOperation = "source-over";
        sc.clearRect(0, 0, f.w, f.h);
        for (let i = 0; i < 4; i++) {
          const u = frac(phase2 * 2 + i / 4 + index * 0.17), fade3 = Math.sin(Math.PI * u) ** 2;
          const px = width * ((index === 2 ? -0.05 : 0.21) + i * 0.065 + u * 0.12) - f.x + f.dx * Math.sin(a) * 0.35;
          const py = height * (0.016 + i % 2 * 0.037 - u * 0.025) - f.y + f.dy * Math.sin(a + 0.7) * 0.25;
          plume(sc, clouds[(i + index) % 4], px, py, width * (0.18 + u * 0.07), height * (0.12 + u * 0.04), fade3 * 0.38, -0.035 + 0.055 * Math.sin(a + i));
        }
        sc.globalCompositeOperation = "destination-in";
        sc.drawImage(f.mask, 0, 0);
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(f.surface, f.x, f.y);
      }
      ctx.restore();
    }
    const cinders = Array.from({ length: 4 }, (_, i) => {
      const c = layer(24, 24), x = c.getContext("2d"), g = x.createRadialGradient(12, 12, 0, 12, 12, 11);
      g.addColorStop(0, "rgba(255,163,63,.55)");
      g.addColorStop(0.35, "rgba(221,83,26,.22)");
      g.addColorStop(1, "rgba(215,75,22,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 24, 24);
      x.fillStyle = i % 2 ? "#e29b59" : "#dc7841";
      x.beginPath();
      x.moveTo(11, 6 + i);
      x.lineTo(14 + i % 2, 10);
      x.lineTo(13, 16);
      x.lineTo(9, 14);
      x.lineTo(10, 9);
      x.closePath();
      x.fill();
      return c;
    });
    const furnace = layer(width, height), fc = furnace.getContext("2d", { willReadFrequently: true });
    fc.drawImage(background, 0, 0);
    const heat = fc.getImageData(0, 0, width, height);
    const hotAreas = [
      { x: 0.621, y: 0.217, rx: 0.018, ry: 0.022 },
      { x: 0.632, y: 0.278, rx: 0.041, ry: 0.049 },
      { x: 0.7, y: 0.3, rx: 0.069, ry: 0.065 },
      { x: 0.766, y: 0.264, rx: 0.059, ry: 0.058 }
    ];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, d = heat.data;
      let shape = 0;
      for (const f of hotAreas) {
        const distance = Math.hypot((x / width - f.x) / f.rx, (y / height - f.y) / f.ry);
        shape = Math.max(shape, 1 - smooth(0.6, 1, distance));
      }
      const hot = shape * smooth(170, 240, d[i]) * smooth(75, 155, d[i + 1]) * smooth(40, 115, d[i] - d[i + 2]);
      d[i] = 255;
      d[i + 1] = 128;
      d[i + 2] = 36;
      d[i + 3] = Math.round(hot * 190);
    }
    fc.putImageData(heat, 0, 0);
    const furnaceX = Math.floor(width * 0.59), furnaceY = Math.floor(height * 0.12), furnaceW = Math.ceil(width * 0.24), furnaceH = Math.ceil(height * 0.26);
    const furnacePatch = layer(furnaceW, furnaceH);
    furnacePatch.getContext("2d").drawImage(furnace, -furnaceX, -furnaceY);
    function furnaceBreathing(phase2) {
      const lift = (0.5 - 0.5 * Math.cos(TAU * phase2 * 2)) ** 1.35;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + 0.4 * lift;
      ctx.drawImage(furnacePatch, furnaceX, furnaceY);
      ctx.restore();
      for (let i = 0; i < 4; i++) {
        const u = frac(phase2 * 4 + i / 4 + 0.07), fade3 = Math.sin(Math.PI * u) ** 2;
        cloud(width * (0.618 - u * 0.09), height * (0.28 - u * 0.083), width * (0.035 + u * 0.14), height * (0.024 + u * 0.1), fade3 * (0.18 + 0.17 * lift), u, i % 2 === 1, "smoke", i);
      }
      for (let i = 0; i < 3; i++) {
        const u = frac(phase2 * 2 + i / 3 + 0.31), fade3 = Math.sin(Math.PI * u) ** 2;
        cloud(width * (0.71 + i * 0.027 - u * 0.055), height * (0.355 - u * 0.08), width * (0.12 + u * 0.13), height * (0.06 + u * 0.075), fade3 * 0.23, u, i % 2 === 1, "smoke", i + 2);
      }
    }
    function eyeStreaming(phase2) {
      const x = width * 0.626, y = height * 0.219, breath2 = 0.5 - 0.5 * Math.cos(TAU * phase2 * 2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      glow(x, y, width * 9e-3, height * 0.013, "255,143,46", 0.09 + 0.07 * breath2);
      for (let i = 0; i < 3; i++) {
        const a = TAU * phase2 * 2 + i * 1.7, length = width * (0.018 + 7e-3 * Math.sin(a)), rise = height * (0.01 + 4e-3 * Math.cos(a));
        const g = ctx.createLinearGradient(x, y, x + length, y - rise);
        g.addColorStop(0, `rgba(255,184,82,${0.2 + 0.12 * breath2})`);
        g.addColorStop(0.3, "rgba(246,133,43,.13)");
        g.addColorStop(1, "rgba(220,87,20,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = i === 0 ? 1.2 : 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + length * 0.28, y - rise * 0.2 + i * 0.8, x + length * 0.65, y - rise * 1.4 + Math.sin(a) * 3, x + length, y - rise);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const u = frac(phase2 * 4 + i / 6), fade3 = Math.sin(Math.PI * u) ** 2;
        const px = x + width * 0.03 * u, py = y - height * 0.016 * u + Math.sin(u * Math.PI * 2 + i) * 1.3 * u;
        glow(px, py, 1.6, 1.1, "255,164,57", fade3 * 0.28);
      }
      ctx.restore();
    }
    const tile = layer(256, 256), tc = tile.getContext("2d"), tp = tc.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = 0.5 + 0.5 * Math.sin(TAU * y / 256 + 0.45 * Math.sin(TAU * x / 256));
      tp.data.set([255, 125, 32, Math.round(10 + v * v * v * 105)], (y * 256 + x) * 4);
    }
    tc.putImageData(tp, 0, 0);
    const regions = [
      { points: [[0.469, 0.371], [0.509, 0.372], [0.502, 0.568], [0.462, 0.568]], d: [0, 1], cycles: 16 },
      { points: [[0.898, 0.302], [0.943, 0.31], [0.938, 0.618], [0.891, 0.617]], d: [0, 1], cycles: 16 },
      { points: [[0.435, 0.541], [0.584, 0.551], [0.799, 0.588], [0.799, 0.633], [0.576, 0.587], [0.43, 0.578]], d: [1, 0.1], cycles: 2 },
      { points: [[0.787, 0.584], [0.916, 0.627], [0.974, 0.702], [0.974, 0.77], [0.915, 0.68], [0.785, 0.627]], d: [0.75, 0.66], cycles: 2 },
      { points: [[0.916, 0.697], [0.974, 0.718], [0.942, 0.794], [0.757, 0.917], [0.743, 0.875], [0.919, 0.753]], d: [-0.88, 0.48], cycles: 2 },
      { points: [[0.743, 0.857], [0.793, 0.92], [0.556, 1], [0.446, 1], [0.477, 0.954]], d: [-0.88, 0.48], cycles: 2 }
    ];
    const flows = regions.map(({ points, d, cycles }) => {
      const px = points.map(([x2, y2]) => [Math.round(x2 * width), Math.round(y2 * height)]);
      const x = Math.min(...px.map((p) => p[0])), y = Math.min(...px.map((p) => p[1]));
      const w = Math.max(...px.map((p) => p[0])) - x, h = Math.max(...px.map((p) => p[1])) - y;
      const mask = layer(w, h), mc = mask.getContext("2d", { willReadFrequently: true });
      mc.drawImage(background, -x, -y);
      const pixels = mc.getImageData(0, 0, w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const p = pixels.data, k = smooth(166, 232, p[i]) * smooth(72, 155, p[i + 1]) * smooth(18, 80, p[i] - p[i + 2]);
        p[i] = p[i + 1] = p[i + 2] = 255;
        p[i + 3] = Math.round(k * 220);
      }
      mc.putImageData(pixels, 0, 0);
      mc.globalCompositeOperation = "destination-in";
      mc.beginPath();
      px.forEach(([a, b], i) => i ? mc.lineTo(a - x, b - y) : mc.moveTo(a - x, b - y));
      mc.closePath();
      mc.fill();
      const flow = layer(w, h), fc2 = flow.getContext("2d"), pattern = fc2.createPattern(tile, "repeat");
      const length = Math.hypot(...d);
      return { x, y, w, h, mask, flow, fc: fc2, pattern, dx: d[0] / length, dy: d[1] / length, cycles };
    });
    function lavaLight(phase2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const f of flows) {
        const travel = phase2 * 256 * f.cycles * (f.cycles === 16 ? 1 : 2);
        f.pattern.setTransform(new DOMMatrix([-f.dy, f.dx, f.dx, f.dy, -f.x + travel * f.dx, -f.y + travel * f.dy]));
        f.fc.globalCompositeOperation = "source-over";
        f.fc.clearRect(0, 0, f.w, f.h);
        f.fc.drawImage(f.mask, 0, 0);
        f.fc.globalCompositeOperation = "source-in";
        f.fc.fillStyle = f.pattern;
        f.fc.fillRect(0, 0, f.w, f.h);
        ctx.drawImage(f.flow, f.x, f.y);
      }
      ctx.restore();
    }
    function cloud(x, y, w, h, alpha, u, flip = false, material = "smoke", part = 0) {
      const sprites = material === "steam" ? steam : breath;
      plume(ctx, sprites[part % 4], x, y, w, h, alpha, 0.11 * Math.sin(TAU * u), flip);
    }
    function glow(x, y, rx, ry, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    function hazards(cue) {
      const t = cue.t;
      if (ruptureOverlay) {
        ctx.save();
        ctx.globalAlpha = cue.warning * 0.14 + cue.rupture * 0.79 + cue.debris * 0.13;
        ctx.drawImage(ruptureOverlay, 0, 0, width, height);
        ctx.restore();
      }
      if (cue.rupture > 0) {
        glow(width * 0.46, height * 0.745, width * 0.26, height * 0.21, "255,105,26", cue.rupture * 0.09);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 30; i++) {
          const age = t - 6.08 - i % 7 * 0.035, u = age / 1.3;
          if (u < 0 || u > 1) continue;
          const alpha = cue.rupture * Math.sin(Math.PI * u) ** 2;
          const x = width * (0.446 + i % 5 * 9e-3) + (i % 2 ? 1 : -1) * u * (10 + i % 6 * 5);
          const y = height * 0.762 - height * (0.16 + i % 3 * 0.025) * u * (1 - u);
          ctx.fillStyle = `rgba(245,${145 + i % 4 * 15},54,${alpha * 0.7})`;
          ctx.fillRect(x, y, 1.2 + i % 3 * 0.4, 2.5 + i % 4);
        }
        ctx.restore();
      }
      for (const p of debris) {
        const age = t - 6.25 - p.delay;
        if (age < 0 || age > 2.4) continue;
        const u = age / 2.4, alpha = cue.debris * (1 - smooth(0.65, 1, u));
        const x = width * (0.46 + (p.x - 0.5) * 0.19 * age), y = height * (0.755 - (0.07 + p.v * 0.055) * age + 0.055 * age * age);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(age * p.spin * 3);
        ctx.fillStyle = "#241817";
        ctx.strokeStyle = "#be5328";
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(-p.s, -p.s * 0.6);
        ctx.lineTo(p.s * 0.4, -p.s);
        ctx.lineTo(p.s, p.s * 0.6);
        ctx.lineTo(-p.s * 0.5, p.s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (cue.debris > 0) {
        const u = (t - 6.25) / 3.25;
        cloud(width * 0.48 + u * width * 0.03, height * 0.72 - u * height * 0.08, width * (0.32 + u * 0.09), height * (0.16 + u * 0.07), cue.debris * 0.24, u);
      }
    }
    function render2(seconds, { battle = false, ambient = true, lava = true, atmosphere = true, cloudMotion = true, bossMotion = true, eyeLight = true } = {}) {
      if (destroyed) return getArenaCue(seconds, false);
      const phase2 = frac(seconds / ARENA_PERIOD), battleActive = battle && BATTLE_EFFECTS_ENABLED, cue = getArenaCue(seconds, battleActive);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(background, 0, 0);
      if (ambient && cloudMotion) paintedClouds(phase2);
      if (ambient && lava) lavaLight(phase2);
      if (ambient && bossMotion) furnaceBreathing(phase2);
      if (ambient && eyeLight) eyeStreaming(phase2);
      if (ambient && atmosphere) {
        for (let i = 0; i < 7; i++) {
          const u = frac(phase2 * 2 + i / 7), fade3 = Math.sin(Math.PI * u) ** 2;
          cloud(
            width * (0.12 + i * 0.12) - u * width * 0.1,
            height * (0.56 + i % 2 * 0.025) - u * height * 0.09,
            width * (0.25 + u * 0.14),
            height * (0.13 + u * 0.065),
            fade3 * 0.25,
            u,
            i % 2 === 1,
            "steam",
            i % 2
          );
        }
        for (const [x, y] of [[0.485, 0.565], [0.921, 0.617]]) for (let i = 0; i < 4; i++) {
          const u = frac(phase2 * 4 + i / 4 + x), fade3 = Math.sin(Math.PI * u) ** 2;
          cloud(width * (x - u * 0.052), height * (y - u * 0.16), width * (0.045 + u * 0.16), height * (0.032 + u * 0.14), fade3 * 0.31, u, i % 2 === 1, "steam", 2 + i % 2);
        }
        for (let i = 0; i < 4; i++) {
          const u = frac(phase2 * 2 + i / 4 + 0.23), fade3 = Math.sin(Math.PI * u) ** 2;
          cloud(width * (0.08 + i * 0.28) + u * width * 0.1, height * 0.98 - u * height * 0.075, width * (0.28 + u * 0.12), height * 0.16, fade3 * 0.23, u, i % 2 === 1, "steam", i % 2);
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const [i, p] of dust.entries()) {
          const u = frac(phase2 * 3 + p.offset), alpha = Math.sin(Math.PI * u) ** 2 * 0.52;
          const x = p.x * width + p.drift * u * width * 0.12, y = height * (1.04 - u * 1.12);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(x, y);
          ctx.rotate(p.drift * 0.4 + phase2 * TAU);
          ctx.drawImage(cinders[i % 4], -p.s * 1.8, -p.s * 2.2, p.s * 3.6, p.s * 4.4);
          ctx.restore();
        }
        ctx.restore();
      }
      if (battleActive) hazards(cue);
      return cue;
    }
    return { render: render2, width, height, period: ARENA_PERIOD, destroy() {
      destroyed = true;
      for (const c of buffers) c.width = c.height = 1;
      canvas.width = canvas.height = 1;
    } };
  }

  // src/modules/AshmawScene.js
  var scenes = /* @__PURE__ */ new Map();
  var bossSelector = 'img[src*="boss-ashmaw"],img[alt^="Ashmaw"]';
  function createAshmawRenderer(canvas, environment, smoke, options = {}) {
    return createArenaScene(canvas, { background: environment, smoke, ...options });
  }
  function clearAshmawScene(arena) {
    const state = scenes.get(arena);
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.frame);
    state.visible?.disconnect();
    state.renderer?.destroy();
    state.renderer = null;
    document.removeEventListener("visibilitychange", state.resume);
    state.motion.removeEventListener("change", state.resume);
    state.art.remove();
    state.stage.removeAttribute("data-iw-raid-boss-stage");
    arena.removeAttribute("data-iw-raid-scene");
    scenes.delete(arena);
  }
  function reconcileAshmawScene(arena) {
    pruneAshmawScenes();
    const boss = arena.querySelector(bossSelector);
    const nativeBackground = arena.style.getPropertyValue("--raid-bg-image");
    if (!boss || nativeBackground && !/ashmaw/i.test(nativeBackground)) {
      clearAshmawScene(arena);
      return;
    }
    const current = scenes.get(arena);
    if (current) {
      if (current.art.parentElement === arena && current.stage === boss.parentElement) return;
      clearAshmawScene(arena);
    }
    const art2 = document.createElement("div");
    art2.setAttribute("data-iw-ashmaw-art", "");
    art2.setAttribute("aria-hidden", "true");
    const env = new Image(), textures = { cloudAtlas: new Image(), smokeAtlas: new Image(), steamAtlas: new Image() }, canvas = document.createElement("canvas");
    for (const image of [env, ...Object.values(textures)]) image.crossOrigin = "anonymous";
    env.setAttribute("data-iw-art", "environment");
    art2.append(env, canvas);
    arena.append(art2);
    const state = { art: art2, stage: boss.parentElement, frame: 0, disposed: false, onScreen: true, motion: matchMedia("(prefers-reduced-motion: reduce)") };
    scenes.set(arena, state);
    const start2 = performance.now();
    let last = 0;
    state.resume = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.renderer || state.disposed || document.hidden || !state.onScreen) return;
      if (state.motion.matches) {
        state.renderer.render(0);
        return;
      }
      state.frame = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!arena.isConnected) {
        clearAshmawScene(arena);
        return;
      }
      if (state.disposed || document.hidden || !state.onScreen || state.motion.matches) return;
      if (now - last >= 1e3 / 30) {
        state.renderer.render((now - start2) / 1e3);
        last = now;
      }
      state.frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", state.resume);
    state.motion.addEventListener("change", state.resume);
    const load2 = (img) => new Promise((resolve2, reject) => {
      img.onload = () => resolve2(img);
      img.onerror = () => reject(new Error("Raid art unavailable"));
    });
    const loaded = Promise.all([load2(env), ...Object.values(textures).map((image) => load2(image).catch(() => null))]);
    env.src = assetUrl("assets/raids/ashmaw/arena.png");
    for (const [key, name] of Object.entries({ cloudAtlas: "clouds", smokeAtlas: "furnace-smoke", steamAtlas: "steam" })) textures[key].src = assetUrl("assets/raids/ashmaw/" + name + ".png");
    loaded.then(([background, cloudAtlas, smokeAtlas, steamAtlas]) => {
      if (state.disposed || !arena.isConnected) return;
      const nativeBackground2 = arena.style.getPropertyValue("--raid-bg-image");
      if (arena.querySelector(bossSelector) !== boss || boss.parentElement !== state.stage || nativeBackground2 && !/ashmaw/i.test(nativeBackground2)) {
        clearAshmawScene(arena);
        return;
      }
      arena.setAttribute("data-iw-raid-scene", "ashmaw");
      state.stage.setAttribute("data-iw-raid-boss-stage", "ashmaw");
      try {
        state.renderer = createAshmawRenderer(canvas, background, null, { cloudAtlas, smokeAtlas, steamAtlas, maxWidth: 1440 });
        if (!state.renderer) return;
        state.renderer.render(0);
      } catch {
        state.renderer?.destroy();
        state.renderer = null;
        return;
      }
      art2.setAttribute("data-iw-animated", "");
      if (typeof IntersectionObserver === "function") {
        state.visible = new IntersectionObserver(([entry2]) => {
          state.onScreen = entry2.isIntersecting;
          state.resume();
        });
        state.visible.observe(arena);
      }
      state.resume();
    }).catch(() => {
      if (!state.disposed) clearAshmawScene(arena);
    });
  }
  function clearAshmawScenes(root) {
    for (const arena of scenes.keys()) if (root === arena || root.contains(arena) || !arena.isConnected) clearAshmawScene(arena);
  }
  function pruneAshmawScenes() {
    for (const arena of scenes.keys()) if (!arena.isConnected) clearAshmawScene(arena);
  }

  // src/modules/ThessalyArenaRenderer.js
  var THESSALY_PERIOD = 16;
  var TAU2 = Math.PI * 2;
  var frac2 = (x) => x - Math.floor(x);
  function createThessalyArenaScene(canvas, { background, clouds: cloudArt, mist, hair, body, maxWidth } = {}) {
    const sw = background.naturalWidth || background.width, sh = background.naturalHeight || background.height;
    const scale = Math.min(1, (maxWidth || sw) / sw), width = Math.round(sw * scale), height = Math.round(sh * scale);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    const buffers = [];
    let destroyed = false;
    const layer = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      buffers.push(c);
      return c;
    };
    if (scale < 1) {
      const c = layer(width, height);
      c.getContext("2d").drawImage(background, 0, 0, width, height);
      background = c;
    }
    const atlas = (image) => Array.from({ length: 4 }, (_, index) => {
      const c = layer(384, 384), cx = c.getContext("2d");
      if (!image) return c;
      const w = (image.naturalWidth || image.width) / 2, h = (image.naturalHeight || image.height) / 2;
      cx.drawImage(image, index % 2 * w, Math.floor(index / 2) * h, w, h, 0, 0, 384, 384);
      const p = cx.getImageData(0, 0, 384, 384);
      for (let y = 0; y < 384; y++) for (let x = 0; x < 384; x++) {
        const edge = Math.min(x, y, 383 - x, 383 - y), i = (y * 384 + x) * 4 + 3;
        p.data[i] *= Math.min(1, edge / 18);
      }
      cx.putImageData(p, 0, 0);
      return c;
    });
    const storm = atlas(cloudArt), fog = atlas(mist), bodyParts = atlas(body);
    const hairTexture = layer(768, 384);
    if (hair) hairTexture.getContext("2d").drawImage(hair, 0, 0, 768, 384);
    const clouds = [
      { points: [[0.17, 0], [0.67, 0], [0.67, 0.17], [0.56, 0.235], [0.48, 0.255], [0.47, 0.095], [0.36, 0.095], [0.35, 0.23], [0.3, 0.26], [0.22, 0.23], [0.17, 0.08]] }
    ].map((f) => {
      const x = Math.max(0, Math.floor(Math.min(...f.points.map((p) => p[0])) * width) - 36), w = Math.min(width, Math.ceil(Math.max(...f.points.map((p) => p[0])) * width) + 36) - x;
      const h = Math.ceil(Math.max(...f.points.map((p) => p[1])) * height) + 36, mask = layer(w, h), mc = mask.getContext("2d");
      mc.filter = "blur(12px)";
      mc.fillStyle = "#fff";
      mc.beginPath();
      f.points.forEach(([a, b], i) => i ? mc.lineTo(a * width - x, b * height) : mc.moveTo(a * width - x, b * height));
      mc.closePath();
      mc.fill();
      mc.filter = "none";
      mc.clearRect(width * 0.383 - x, height * 0.135, width * 0.057, height * 0.21);
      const surface = layer(w, h);
      return { ...f, x, w, h, mask, surface, sc: surface.getContext("2d") };
    });
    let seed = 723;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const spores = Array.from({ length: 110 }, () => ({ x: random(), offset: random(), size: 0.6 + random() * 1.5, drift: random() * 2 - 1 }));
    const banks = [
      { x: 0.02, y: 0.69, w: 0.24, h: 0.16, flow: 0.03, rise: 0.05, cycles: 1, alpha: 0.22 },
      { x: 0.17, y: 0.59, w: 0.3, h: 0.09, flow: 0.055, rise: 0.025, cycles: 2, alpha: 0.17 },
      { x: 0.31, y: 0.56, w: 0.21, h: 0.17, flow: -0.025, rise: 0.075, cycles: 1, alpha: 0.23 },
      { x: 0.48, y: 0.6, w: 0.34, h: 0.065, flow: 0.04, rise: 0.014, cycles: 2, alpha: 0.15 },
      { x: 0.63, y: 0.54, w: 0.21, h: 0.16, flow: 0.025, rise: 0.08, cycles: 2, alpha: 0.22 },
      { x: 0.81, y: 0.57, w: 0.28, h: 0.095, flow: 0.07, rise: 0.035, cycles: 3, alpha: 0.16 },
      { x: 0.96, y: 0.66, w: 0.24, h: 0.18, flow: -0.045, rise: 0.055, cycles: 1, alpha: 0.22 },
      { x: 1, y: 0.79, w: 0.3, h: 0.08, flow: -0.075, rise: 0.018, cycles: 2, alpha: 0.17 },
      ...Array.from({ length: 4 }, (_, i) => ({ x: -0.04 + i * 0.35, y: 1.01, w: 0.36, h: i % 2 ? 0.07 : 0.12, flow: 0.065, rise: 0.035, cycles: i % 2 + 1, alpha: 0.14 })),
      { x: 0.68, y: 0.575, w: 0.24, h: 0.18, flow: 0.05, rise: 0.1, cycles: 1, alpha: 0.22 },
      { x: 0.75, y: 0.54, w: 0.17, h: 0.105, flow: 0.07, rise: 0.065, cycles: 2, alpha: 0.16 }
    ];
    const fogPuffs = banks.flatMap((b) => Array.from({ length: 3 }, () => ({
      ...b,
      x: b.x + (random() - 0.5) * 0.025,
      y: b.y + (random() - 0.5) * 0.018,
      w: b.w * (0.78 + random() * 0.44),
      h: b.h * (0.72 + random() * 0.5),
      offset: random(),
      angle: (random() - 0.5) * 0.22,
      grow: 0.1 + random() * 0.35,
      alpha: b.alpha * (0.68 + random() * 0.32) * 0.5,
      flip: random() < 0.5
    })));
    const skyPuffs = [
      { x: 0.22, y: 5e-3, w: 0.25, h: 0.21, offset: 0.07, variant: 0, alpha: 0.21, flow: 0.052 },
      { x: 0.46, y: 0.055, w: 0.28, h: 0.22, offset: 0.36, variant: 1, alpha: 0.19, flow: 0.055 },
      { x: 0.32, y: 0.2, w: 0.23, h: 0.17, offset: 0.64, variant: 2, alpha: 0.14, flow: 0.044 },
      { x: 0.63, y: 3e-3, w: 0.22, h: 0.2, offset: 0.84, variant: 3, alpha: 0.17, flow: 0.04 }
    ];
    const hazeMask = layer(width, height), hmc = hazeMask.getContext("2d");
    hmc.drawImage(background, 0, 0);
    const hazePixels = hmc.getImageData(0, 0, width, height), clamp = (v) => Math.max(0, Math.min(1, v));
    for (let i = 0; i < hazePixels.data.length; i += 4) {
      const y = Math.floor(i / 4 / width) / height, r = hazePixels.data[i], g = hazePixels.data[i + 1], b = hazePixels.data[i + 2];
      const strength = clamp((g - (r + b) * 0.5 - 5) / 15) * clamp((g - b - 2) / 12) * clamp((y - 0.5) / 0.06);
      hazePixels.data[i] = hazePixels.data[i + 1] = hazePixels.data[i + 2] = 255;
      hazePixels.data[i + 3] = Math.round(strength * 255);
    }
    hmc.putImageData(hazePixels, 0, 0);
    const hazeFeather = layer(width, height), hfc = hazeFeather.getContext("2d");
    hfc.filter = "blur(5px)";
    hfc.drawImage(hazeMask, 0, 0);
    const hazeSurface = layer(width, height), hsc = hazeSurface.getContext("2d");
    const hazeSources = [[0.025, 0.68], [0.13, 0.66], [0.24, 0.65], [0.42, 0.64], [0.57, 0.64], [0.7, 0.63], [0.84, 0.66], [0.96, 0.7], [0.055, 0.82], [0.955, 0.83]];
    const hazeWisps = hazeSources.flatMap(([x, y], index) => Array.from({ length: 3 }, () => ({ x, y, offset: random(), flow: (x < 0.5 ? 1 : -1) * (0.035 + random() * 0.04), rise: 0.018 + random() * 0.03, w: 0.085 + random() * 0.08, h: 0.025 + random() * 0.025, flip: random() < 0.5, cycles: index % 3 === 0 ? 2 : 1 })));
    function plume(target, texture, x, y, w, h, alpha, u, flip = false, angle = 0, turn = 0.09) {
      if (alpha <= 0) return;
      target.save();
      target.globalAlpha = alpha;
      target.translate(x, y);
      target.rotate(angle + turn * Math.sin(TAU2 * u));
      target.scale(flip ? -1 : 1, 1);
      target.drawImage(texture, -w / 2, -h / 2, w, h);
      target.restore();
    }
    function glow(x, y, rx, ry, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    function sky(phase2) {
      for (const f of clouds) {
        const sc = f.sc;
        sc.globalCompositeOperation = "source-over";
        sc.clearRect(0, 0, f.w, f.h);
        for (const p of skyPuffs) {
          const u = frac2(phase2 + p.offset), fade3 = Math.sin(Math.PI * u) ** 2, swell = 1 + 0.04 * u;
          plume(sc, storm[p.variant], width * (p.x + p.flow * (u - 0.5)) - f.x, height * (p.y - u * 9e-3), width * p.w * swell, height * p.h * swell, p.alpha * fade3, u, false, 0, 0);
        }
        sc.globalCompositeOperation = "destination-in";
        sc.drawImage(f.mask, 0, 0);
        ctx.drawImage(f.surface, f.x, 0);
      }
    }
    function miasma(phase2) {
      for (const [index, p] of fogPuffs.entries()) {
        const u = frac2(phase2 * p.cycles + p.offset), fade3 = Math.sin(Math.PI * u) ** 2;
        plume(ctx, fog[index % 4], width * (p.x + p.flow * u), height * (p.y - p.rise * u), width * p.w * (0.86 + p.grow * u), height * p.h * (0.9 + p.grow * u), fade3 * p.alpha, u, p.flip, p.angle, 0.035);
      }
    }
    function courtyardHaze(phase2) {
      hsc.globalCompositeOperation = "source-over";
      hsc.clearRect(0, 0, width, height);
      for (const [index, p] of hazeWisps.entries()) {
        const u = frac2(phase2 * p.cycles + p.offset), fade3 = Math.sin(Math.PI * u) ** 2;
        const x = width * (p.x + p.flow * u), y = height * (p.y - p.rise * u);
        plume(hsc, fog[index % 4], x, y, width * p.w * (1 + 0.45 * u), height * p.h * (1 + 0.5 * u), fade3 * 0.26, u, p.flip, 0, 0.018);
      }
      hsc.globalCompositeOperation = "destination-in";
      hsc.drawImage(hazeFeather, 0, 0);
      ctx.drawImage(hazeSurface, 0, 0);
    }
    function aura(phase2) {
      const breath = 0.5 - 0.5 * Math.cos(TAU2 * phase2 * 2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [x, y] of [[0.696, 0.079], [0.703, 0.078]]) {
        glow(width * x, height * y, width * 7e-3, height * 0.012, "151,210,227", 0.055 + 0.07 * breath);
        for (let i = 0; i < 3; i++) {
          const u = frac2(phase2 * 2 + i / 3 + x), fade3 = Math.sin(Math.PI * u) ** 2;
          glow(width * (x + u * 0.023), height * (y - u * 0.028), width * 12e-4, height * 2e-3, "157,208,228", fade3 * 0.25);
        }
      }
      for (const [x, y, side] of [[0.563, 0.282, -1], [0.841, 0.35, 1]]) {
        glow(width * x, height * y, width * 0.026, height * 0.03, "109,161,185", 0.02 + 0.026 * breath);
        for (let i = 0; i < 4; i++) {
          const u = frac2(phase2 * 2 + i / 4 + 0.19), fade3 = Math.sin(Math.PI * u) ** 2;
          const startX = width * x, startY = height * y, endX = startX + width * 0.041 * u * side, endY = startY - height * 0.071 * u;
          const g = ctx.createLinearGradient(startX, startY, endX || startX + 1, endY);
          g.addColorStop(0, "rgba(149,189,213,0)");
          g.addColorStop(0.6, `rgba(149,189,213,${fade3 * 0.12})`);
          g.addColorStop(1, "rgba(149,189,213,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.bezierCurveTo(startX - width * 0.02 * side, startY - height * 0.04 * u, endX + width * 0.01 * side, endY, endX, endY);
          ctx.stroke();
        }
      }
      ctx.restore();
      for (const [x, y, side] of [[0.563, 0.282, -1], [0.841, 0.35, 1]]) for (let i = 0; i < 3; i++) {
        const u = frac2(phase2 * 2 + i / 3 + x), fade3 = Math.sin(Math.PI * u) ** 2;
        plume(ctx, storm[i % 4], width * (x + side * u * 0.07), height * (y - u * 0.055), width * (0.025 + u * 0.065), height * (0.02 + u * 0.045), fade3 * 0.12, u, i % 2 === 1);
      }
    }
    const cloudRig = [
      { part: 3, x: 0.708, y: 0.476, w: 0.235, h: 0.245, joint: "waist", angle: 0, alpha: 0.16 },
      { part: 2, x: 0.698, y: 0.404, w: 0.245, h: 0.185, joint: "waist", angle: -0.1, alpha: 0.18 },
      { part: 1, x: 0.714, y: 0.3, w: 0.17, h: 0.24, joint: "shoulder", angle: 0.12, alpha: 0.14 },
      { part: 0, x: 0.752, y: 0.235, w: 0.145, h: 0.17, joint: "shoulder", angle: -0.1, alpha: 0.13 },
      { part: 0, x: 0.645, y: 0.204, w: 0.12, h: 0.14, joint: "shoulder", angle: 0.16, alpha: 0.11 }
    ];
    function cloudBody(phase2) {
      const a = TAU2 * phase2, waist = 6e-3 * Math.sin(a), shoulder = waist + 5e-3 * Math.sin(a - 0.65);
      for (const p of cloudRig) {
        const joint = p.joint === "waist" ? waist : shoulder, pivotX = width * 0.705, pivotY = height * (p.joint === "waist" ? 0.47 : 0.38);
        ctx.save();
        ctx.translate(pivotX + width * 11e-4 * Math.sin(a), pivotY);
        ctx.rotate(joint);
        plume(ctx, bodyParts[p.part], width * p.x - pivotX, height * p.y - pivotY + height * 15e-4 * Math.sin(a - 0.4), width * p.w, height * p.h, p.alpha, phase2, false, p.angle, 0);
        ctx.restore();
      }
    }
    function windHair(phase2) {
      const a = TAU2 * phase2, x = width * 0.711, y = height * 2e-3, w = width * 0.282, h = height * 0.157, segments = 40;
      const bend = (u) => u * u * height * (7e-3 * Math.sin(a * 2 - u * 4) + 35e-4 * Math.sin(a * 3 - u * 6));
      ctx.save();
      ctx.globalAlpha = 0.36;
      for (let i = 0; i < segments; i++) {
        const u = i / segments, v = (i + 1) / segments, dx = w * u, dw = w / segments, dy = bend(u), slope = (bend(v) - dy) / dw;
        ctx.setTransform(1, slope, 0, 1, x + dx, y + dy);
        ctx.drawImage(hairTexture, 768 * u, 0, 768 / segments, 384, 0, 0, dw + 0.2, h);
      }
      ctx.restore();
      for (let i = 0; i < 14; i++) {
        const sx = width * (0.729 + i % 3 * 6e-3), sy = height * (0.047 + i * 64e-4), length = width * (0.168 + i % 5 * 0.012);
        const wave = Math.sin(a * 2 - i * 0.36), tipY = sy - height * (0.018 + i * 1e-3) + height * 0.01 * wave;
        const g = ctx.createLinearGradient(sx, sy, sx + length, tipY);
        g.addColorStop(0, "rgba(185,206,211,0)");
        g.addColorStop(0.26, "rgba(185,206,211,.18)");
        g.addColorStop(1, "rgba(185,206,211,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = width * (38e-5 + i % 3 * 16e-5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + length * 0.3, sy + height * 9e-3 * Math.sin(a * 2 - i * 0.36 - 0.8), sx + length * 0.65, tipY + height * 0.02 * Math.sin(a * 2 - i * 0.36 - 0.5), sx + length, tipY);
        ctx.stroke();
      }
    }
    const arcPaths = [
      [[0.66, 0.175], [0.633, 0.153], [0.605, 0.128], [0.562, 0.101], [0.535, 0.052]],
      [[0.553, 0.29], [0.529, 0.267], [0.501, 0.278], [0.478, 0.235], [0.456, 0.221]],
      [[0.65, 0.397], [0.616, 0.421], [0.576, 0.403], [0.552, 0.435], [0.521, 0.478]],
      [[0.838, 0.355], [0.863, 0.367], [0.88, 0.348], [0.914, 0.389], [0.945, 0.412]],
      [[0.854, 0.253], [0.874, 0.219], [0.902, 0.228], [0.93, 0.18], [0.964, 0.15]],
      [[0.848, 0.151], [0.884, 0.146], [0.907, 0.107], [0.947, 0.087], [0.97, 0.037]],
      [[0.81, 0.46], [0.843, 0.484], [0.871, 0.477], [0.894, 0.509], [0.939, 0.52]],
      [[0.64, 0.475], [0.609, 0.49], [0.591, 0.522], [0.555, 0.511], [0.54, 0.552]]
    ];
    const roughen = (points) => {
      const out = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i - 1], [ex, ey] = points[i];
        for (let j = 1; j <= 3; j++) out.push(j === 3 ? [ex, ey] : [x + (ex - x) * j / 3 + (random() - 0.5) * 7e-3, y + (ey - y) * j / 3 + (random() - 0.5) * 0.014]);
      }
      return out;
    };
    const starts = [0.38, 1.91, 3.06, 4.62, 5.87, 7.11, 8.35, 10.18];
    const bolts = arcPaths.flatMap((points, index) => [0, 1].map((pass) => {
      const path = roughen(points), [x, y] = path[6], side = index < 3 || index === 7 ? -1 : 1;
      const branch = roughen([[x, y], [x + side * 0.02, y + 0.015], [x + side * 0.032, y + 0.04]]);
      return { path, branch, start: pass === 1 ? index === 0 ? 15.86 : frac2((starts[index] + 6.3) / 16) * 16 : starts[index], duration: 0.32 + random() * 0.18 };
    }));
    function electricity(phase2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const bolt of bolts) {
        const elapsed = frac2(phase2 - bolt.start / THESSALY_PERIOD) * THESSALY_PERIOD;
        if (elapsed >= bolt.duration) continue;
        const u = elapsed / bolt.duration, pulse = Math.sin(Math.PI * u) ** 2 * (0.62 + 0.38 * Math.sin(TAU2 * u * 2) ** 2);
        for (const [branch, points] of [[false, bolt.path], [true, bolt.branch]]) {
          const strength = pulse * (branch ? 0.55 : 1);
          for (const [thickness, alpha] of [[27e-4, 0.11], [7e-4, 0.72]]) {
            ctx.strokeStyle = `rgba(162,220,243,${strength * alpha})`;
            ctx.lineWidth = width * thickness;
            ctx.beginPath();
            points.forEach(([x2, y2], i) => i ? ctx.lineTo(x2 * width, y2 * height) : ctx.moveTo(x2 * width, y2 * height));
            ctx.stroke();
          }
        }
        const [x, y] = bolt.path[0];
        glow(width * x, height * y, width * 0.015, height * 0.027, "125,190,220", pulse * 0.13);
      }
      ctx.restore();
    }
    function motes(phase2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of spores) {
        const u = frac2(phase2 * 2 + s.offset), fade3 = Math.sin(Math.PI * u) ** 2 * 0.32;
        const x = width * (s.x + s.drift * u * 0.1), y = height * (1.04 - u * 1.12);
        ctx.fillStyle = `rgba(142,175,107,${fade3})`;
        ctx.fillRect(x, y, s.size, s.size);
      }
      ctx.restore();
    }
    function render2(seconds, { ambient = true, cloudMotion = true, atmosphere = true, courtyardMist = true, bossMotion = true, bodyClouds = true, hairMotion = true, spectralWisps = true, lightning = true, spores: drift = true } = {}) {
      const phase2 = frac2(seconds / THESSALY_PERIOD), cue = { t: phase2 * THESSALY_PERIOD, battle: false };
      if (destroyed) return cue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(background, 0, 0);
      if (ambient && cloudMotion) sky(phase2);
      if (ambient && bossMotion) {
        if (bodyClouds) cloudBody(phase2);
        if (hairMotion) windHair(phase2);
        if (spectralWisps) aura(phase2);
      }
      if (ambient && atmosphere) miasma(phase2);
      if (ambient && courtyardMist) courtyardHaze(phase2);
      if (ambient && lightning) electricity(phase2);
      if (ambient && drift) motes(phase2);
      return cue;
    }
    return { render: render2, width, height, period: THESSALY_PERIOD, destroy() {
      destroyed = true;
      for (const c of buffers) c.width = c.height = 1;
      canvas.width = canvas.height = 1;
    } };
  }

  // src/modules/ThessalyScene.js
  var scenes2 = /* @__PURE__ */ new Map();
  function createThessalyRenderer(canvas, environment, assets = {}, options = {}) {
    return createThessalyArenaScene(canvas, { background: environment, ...assets, ...options });
  }
  function clearThessalyScene(arena) {
    const state = scenes2.get(arena);
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.frame);
    state.visible?.disconnect();
    state.renderer?.destroy();
    state.renderer = null;
    document.removeEventListener("visibilitychange", state.resume);
    state.motion.removeEventListener("change", state.resume);
    state.art.remove();
    state.stage.removeAttribute("data-iw-raid-boss-stage");
    arena.removeAttribute("data-iw-raid-scene");
    scenes2.delete(arena);
  }
  function reconcileThessalyScene(arena) {
    pruneThessalyScenes();
    const boss = arena.querySelector('img[src*="boss-thessaly"],img[alt^="Thessaly"]');
    const nativeBackground = arena.style.getPropertyValue("--raid-bg-image");
    if (!boss || nativeBackground && !/thessaly/i.test(nativeBackground)) {
      clearThessalyScene(arena);
      return;
    }
    const current = scenes2.get(arena);
    if (current) {
      if (current.art.parentElement === arena && current.stage === boss.parentElement) return;
      clearThessalyScene(arena);
    }
    const art2 = document.createElement("div");
    art2.setAttribute("data-iw-thessaly-art", "");
    art2.setAttribute("aria-hidden", "true");
    const env = new Image(), textures = Object.fromEntries(["clouds", "mist", "hair", "body"].map((key) => [key, new Image()])), canvas = document.createElement("canvas");
    for (const image of [env, ...Object.values(textures)]) image.crossOrigin = "anonymous";
    env.setAttribute("data-iw-art", "environment");
    art2.append(env, canvas);
    arena.append(art2);
    const state = { art: art2, stage: boss.parentElement, frame: 0, disposed: false, onScreen: true, motion: matchMedia("(prefers-reduced-motion: reduce)") };
    scenes2.set(arena, state);
    const start2 = performance.now();
    let last = 0;
    state.resume = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.renderer || state.disposed || document.hidden || !state.onScreen) return;
      if (state.motion.matches) {
        state.renderer.render(0);
        return;
      }
      state.frame = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!arena.isConnected) {
        clearThessalyScene(arena);
        return;
      }
      if (state.disposed || document.hidden || !state.onScreen || state.motion.matches) return;
      if (now - last >= 1e3 / 30) {
        state.renderer.render((now - start2) / 1e3);
        last = now;
      }
      state.frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", state.resume);
    state.motion.addEventListener("change", state.resume);
    const load2 = (img) => new Promise((resolve2, reject) => {
      img.onload = () => resolve2(img);
      img.onerror = () => reject(new Error("Raid art unavailable"));
    });
    const loaded = Promise.all([load2(env), ...Object.values(textures).map((image) => load2(image).catch(() => null))]);
    env.src = assetUrl("assets/raids/thessaly/arena-storm.png");
    for (const [key, name] of Object.entries({ clouds: "storm-clouds", mist: "courtyard-mist", hair: "hair-wisps", body: "body-clouds" })) textures[key].src = assetUrl("assets/raids/thessaly/" + name + ".png");
    loaded.then(([background, ...images]) => {
      if (state.disposed || !arena.isConnected) return;
      arena.setAttribute("data-iw-raid-scene", "thessaly");
      state.stage.setAttribute("data-iw-raid-boss-stage", "thessaly");
      const assets = Object.fromEntries(Object.keys(textures).map((key, index) => [key, images[index]]));
      try {
        state.renderer = createThessalyRenderer(canvas, background, assets, { maxWidth: 1440 });
      } catch {
      }
      if (!state.renderer) return;
      art2.setAttribute("data-iw-animated", "");
      state.renderer.render(0);
      if (typeof IntersectionObserver === "function") {
        state.visible = new IntersectionObserver(([entry2]) => {
          state.onScreen = entry2.isIntersecting;
          state.resume();
        });
        state.visible.observe(arena);
      }
      state.resume();
    }).catch(() => {
      if (!state.disposed) clearThessalyScene(arena);
    });
  }
  function clearThessalyScenes(root) {
    for (const arena of scenes2.keys()) if (root === arena || root.contains(arena) || !arena.isConnected) clearThessalyScene(arena);
  }
  function pruneThessalyScenes() {
    for (const arena of scenes2.keys()) if (!arena.isConnected) clearThessalyScene(arena);
  }

  // src/modules/MorwennaArenaRenderer.js
  var MORWENNA_PERIOD = 24;
  var TAU3 = Math.PI * 2;
  var frac3 = (value) => value - Math.floor(value);
  var envelope2 = (u) => Math.sin(Math.PI * u) ** 2;
  function createMorwennaArenaScene(canvas, { background, clouds, mist, maxWidth } = {}) {
    const sw = background.naturalWidth || background.width;
    const sh = background.naturalHeight || background.height;
    const scale = Math.min(1, (maxWidth || sw) / sw);
    const width = Math.round(sw * scale), height = Math.round(sh * scale);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Unable to create the Morwenna scene canvas");
    const buffers = [];
    let destroyed = false;
    const layer = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      buffers.push(c);
      return c;
    };
    const painting = layer(width, height);
    painting.getContext("2d").drawImage(background, 0, 0, width, height);
    const atlas = (image) => Array.from({ length: 4 }, (_, index) => {
      const c = layer(512, 256), cx = c.getContext("2d");
      if (!image) return c;
      const w = (image.naturalWidth || image.width) / 2;
      const h = (image.naturalHeight || image.height) / 2;
      cx.drawImage(image, index % 2 * w, Math.floor(index / 2) * h, w, h, 0, 0, 512, 256);
      const p = cx.getImageData(0, 0, 512, 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
        const edge = Math.min(x, y, 511 - x, 255 - y);
        p.data[(y * 512 + x) * 4 + 3] *= Math.min(1, edge / 22);
      }
      cx.putImageData(p, 0, 0);
      return c;
    });
    const storm = atlas(clouds), fog = atlas(mist);
    const skyMask = layer(width, Math.ceil(height * 0.5));
    const sm = skyMask.getContext("2d");
    const skyZones = [
      [[0.237, 0], [0.726, 0], [0.699, 0.104], [0.649, 0.178], [0.603, 0.274], [0.565, 0.392], [0.54, 0.468], [0.481, 0.422], [0.472, 0.35], [0.439, 0.312], [0.42, 0.28], [0.409, 0.19], [0.385, 0.104], [0.364, 0.079], [0.348, 0.086], [0.331, 0.191], [0.305, 0.218], [0.286, 0.233], [0.254, 0.196], [0.242, 0.093]],
      [[0.875, 0], [0.963, 0], [0.945, 0.134], [0.92, 0.169], [0.9, 0.12]]
    ];
    sm.filter = "blur(" + Math.max(5, width * 6e-3) + "px)";
    sm.fillStyle = "#fff";
    for (const points of skyZones) {
      sm.beginPath();
      points.forEach(([x, y], i) => i ? sm.lineTo(x * width, y * height) : sm.moveTo(x * width, y * height));
      sm.closePath();
      sm.fill();
    }
    sm.filter = "none";
    sm.clearRect(width * 0.302, height * 0.082, width * 0.116, height * 0.305);
    sm.clearRect(0, 0, width * 0.235, skyMask.height);
    const skyLayer = layer(width, skyMask.height), sc = skyLayer.getContext("2d");
    const skyBanks = [
      { x: 0.37, y: 0.027, w: 0.35, h: 0.23, flow: 0.092, alpha: 0.23, offset: 0.03, part: 0 },
      { x: 0.55, y: 0.105, w: 0.37, h: 0.29, flow: 0.083, alpha: 0.21, offset: 0.42, part: 1 },
      { x: 0.49, y: 0.284, w: 0.29, h: 0.24, flow: 0.072, alpha: 0.15, offset: 0.69, part: 2 },
      { x: 0.62, y: 0.028, w: 0.3, h: 0.2, flow: 0.098, alpha: 0.18, offset: 0.84, part: 3 },
      { x: 0.86, y: 0.075, w: 0.22, h: 0.17, flow: 0.075, alpha: 0.14, offset: 0.22, part: 0 }
    ];
    const fogBanks = [
      { x: 0.1, y: 0.604, w: 0.28, h: 0.072, alpha: 0.14, flow: 0.085, offset: 0.13 },
      { x: 0.29, y: 0.606, w: 0.28, h: 0.082, alpha: 0.19, flow: 0.07, offset: 0.61 },
      { x: 0.44, y: 0.624, w: 0.31, h: 0.055, alpha: 0.16, flow: 0.09, offset: 0.32 },
      { x: 0.58, y: 0.631, w: 0.27, h: 0.07, alpha: 0.17, flow: 0.065, offset: 0.81 },
      { x: 0.73, y: 0.64, w: 0.24, h: 0.073, alpha: 0.15, flow: 0.08, offset: 0.04 },
      { x: 0.87, y: 0.615, w: 0.27, h: 0.08, alpha: 0.12, flow: 0.075, offset: 0.48 },
      { x: 5e-3, y: 0.782, w: 0.22, h: 0.12, alpha: 0.09, flow: 0.055, offset: 0.24 },
      { x: 0.96, y: 0.835, w: 0.22, h: 0.08, alpha: 0.08, flow: 0.06, offset: 0.74 }
    ].flatMap((p, index) => [{ ...p, part: index % 4 }, { ...p, x: p.x - 0.045, y: p.y + 0.013, w: p.w * 0.78, h: p.h * 0.72, alpha: p.alpha * 0.58, offset: frac3(p.offset + 0.47), part: (index + 2) % 4 }]);
    const shroudWisps = [
      { x: 0.593, y: 0.451, w: 0.09, h: 0.058, offset: 0.04, alpha: 0.085, angle: -0.8 },
      { x: 0.553, y: 0.566, w: 0.105, h: 0.06, offset: 0.42, alpha: 0.08, angle: -0.55 },
      { x: 0.88, y: 0.437, w: 0.095, h: 0.057, offset: 0.72, alpha: 0.075, angle: -0.6 },
      { x: 0.846, y: 0.584, w: 0.08, h: 0.055, offset: 0.25, alpha: 0.095, angle: -0.85 },
      { x: 0.773, y: 0.565, w: 0.042, h: 0.054, offset: 0.56, alpha: 0.065, angle: -1.12 }
    ];
    const strings = [
      [[0.653, 0.23], [0.691, 0.488]],
      [[0.674, 0.229], [0.717, 0.41]],
      [[0.686, 0.237], [0.721, 0.4]],
      [[0.818, 0.282], [0.775, 0.418]],
      [[0.829, 0.275], [0.819, 0.384]]
    ];
    let seed = 8143;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const motes = Array.from({ length: 34 }, () => ({ x: 0.56 + random() * 0.36, y: 0.56 + random() * 0.12, offset: random(), rise: 0.05 + random() * 0.11, flow: 0.013 + random() * 0.03, size: 0.6 + random() * 1.1 }));
    const nearMist = [
      { x: 0.035, y: 0.892, w: 0.37, h: 0.11, flow: 0.16, alpha: 0.22, offset: 0.14, part: 3 },
      { x: 0.32, y: 0.986, w: 0.47, h: 0.115, flow: 0.2, alpha: 0.25, offset: 0.61, part: 0 },
      { x: 0.66, y: 0.93, w: 0.4, h: 0.081, flow: 0.19, alpha: 0.19, offset: 0.32, part: 1 },
      { x: 0.94, y: 0.845, w: 0.3, h: 0.092, flow: 0.14, alpha: 0.2, offset: 0.83, part: 2 }
    ];
    const nearAsh = Array.from({ length: 28 }, () => ({
      x: -0.06 + random() * 1.02,
      y: 0.94 + random() * 0.14,
      offset: random(),
      rise: 0.1 + random() * 0.14,
      flow: 0.08 + random() * 0.08,
      size: 1.1 + random() * 1.6,
      tilt: random() * TAU3,
      warm: random() < 0.32
    }));
    const emberSprite = layer(32, 32), ec = emberSprite.getContext("2d");
    const eg = ec.createRadialGradient(16, 16, 0, 16, 16, 16);
    eg.addColorStop(0, "rgba(255,204,138,.7)");
    eg.addColorStop(0.18, "rgba(233,134,60,.4)");
    eg.addColorStop(1, "rgba(193,84,34,0)");
    ec.fillStyle = eg;
    ec.fillRect(0, 0, 32, 32);
    function plume(target, texture, x, y, w, h, alpha, angle = 0) {
      if (alpha < 1e-5) return;
      target.save();
      target.globalAlpha = alpha;
      target.translate(x, y);
      target.rotate(angle);
      target.drawImage(texture, -w / 2, -h / 2, w, h);
      target.restore();
    }
    function glow(x, y, rx, ry, color, alpha) {
      ctx.save();
      ctx.translate(x * width, y * height);
      ctx.scale(rx * width, ry * height);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    function drawClouds(phase2) {
      sc.globalCompositeOperation = "source-over";
      sc.clearRect(0, 0, skyLayer.width, skyLayer.height);
      for (const p of skyBanks) {
        const u = frac3(phase2 + p.offset), growth = 1 + u * 0.035;
        plume(sc, storm[p.part], width * (p.x + p.flow * (u - 0.5)), height * (p.y - 8e-3 * u), width * p.w * growth, height * p.h * growth, p.alpha * envelope2(u));
      }
      sc.globalCompositeOperation = "destination-in";
      sc.drawImage(skyMask, 0, 0);
      ctx.drawImage(skyLayer, 0, 0);
    }
    function drawMist(phase2) {
      for (const p of fogBanks) {
        const u = frac3(phase2 + p.offset), growth = 1 + 0.15 * u;
        plume(ctx, fog[p.part], width * (p.x + p.flow * (u - 0.5)), height * (p.y - 0.013 * u), width * p.w * growth, height * p.h * (1 + 0.2 * u), p.alpha * envelope2(u));
      }
    }
    function drawShroud(phase2) {
      for (const [index, p] of shroudWisps.entries()) {
        const u = frac3(phase2 * 2 + p.offset);
        plume(ctx, fog[(index + 1) % 4], width * (p.x + 0.018 * u), height * (p.y - 0.052 * u), width * p.w * (0.8 + 0.3 * u), height * p.h * (0.7 + 0.3 * u), p.alpha * envelope2(u), p.angle);
      }
      for (const [index, [x, y, side]] of [[0.604, 0.353, -1], [0.584, 0.462, -1], [0.87, 0.371, 1], [0.854, 0.48, 1]].entries()) {
        const a = TAU3 * phase2 * 2 - index * 0.8, length = height * 0.09, tip = width * 4e-3 * Math.sin(a);
        const g = ctx.createLinearGradient(x * width, y * height, x * width + side * width * 0.027, y * height + length);
        g.addColorStop(0, "rgba(148,128,151,0)");
        g.addColorStop(0.35, "rgba(148,128,151,.10)");
        g.addColorStop(1, "rgba(148,128,151,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = width * 65e-5;
        ctx.beginPath();
        ctx.moveTo(x * width, y * height);
        ctx.bezierCurveTo(x * width + side * width * 7e-3, y * height + length * 0.32, x * width + side * width * 0.015 + tip, y * height + length * 0.65, x * width + side * width * 0.027 + tip, y * height + length);
        ctx.stroke();
      }
    }
    function drawCurse(phase2) {
      const breath = 0.5 - 0.5 * Math.cos(TAU3 * phase2 * 3);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      glow(0.749, 0.447, 0.014, 0.028, "229,133,71", 0.055 + 0.045 * breath);
      glow(0.744, 0.11, 3e-3, 0.013, "240,153,77", 0.065 + 0.075 * breath);
      glow(0.755, 0.11, 3e-3, 0.013, "240,153,77", 0.065 + 0.075 * breath);
      glow(0.674, 0.362, 9e-3, 0.016, "164,103,200", 0.026 + 0.035 * (1 - breath));
      for (const [index, [start2, end]] of strings.entries()) {
        const point = (v) => [width * (start2[0] + (end[0] - start2[0]) * v), height * (start2[1] + (end[1] - start2[1]) * v)];
        const trace = (from, to, style, lineWidth) => {
          ctx.strokeStyle = style;
          ctx.lineWidth = Math.max(0.5, width * lineWidth);
          ctx.beginPath();
          ctx.moveTo(...from);
          ctx.lineTo(...to);
          ctx.stroke();
        };
        const pulse = 0.5 - 0.5 * Math.cos(TAU3 * phase2 * 3 - index * 0.7);
        trace(point(0), point(1), `rgba(162,103,201,${0.055 + 0.075 * pulse})`, 11e-4);
        for (let packet = 0; packet < 2; packet++) {
          const u = frac3(phase2 * 3 + index * 0.213 + packet * 0.5), fade3 = envelope2(u);
          const from = point(Math.max(0, u - 0.19)), to = point(Math.min(1, u + 0.1)), center = point(u);
          const gradient = (color, alpha) => {
            const g = ctx.createLinearGradient(...from, ...to);
            g.addColorStop(0, `rgba(${color},0)`);
            g.addColorStop(0.65, `rgba(${color},${alpha * fade3})`);
            g.addColorStop(1, `rgba(${color},0)`);
            return g;
          };
          trace(from, to, gradient("169,89,220", 0.23), 4e-3);
          trace(from, to, gradient("215,157,250", 0.7), 15e-4);
          trace(from, to, gradient("240,210,255", 0.9), 65e-5);
          glow(center[0] / width, center[1] / height, 4e-3, 7e-3, "182,105,230", 0.25 * fade3);
          for (let spark = 0; spark < 2; spark++) {
            const v = u - spark * 0.029;
            if (v < 0) continue;
            const p = point(v), size = width * (spark ? 4e-4 : 65e-5);
            ctx.fillStyle = `rgba(242,217,255,${fade3 * (spark ? 0.48 : 0.82)})`;
            ctx.beginPath();
            ctx.arc(p[0], p[1], Math.max(0.6, size), 0, TAU3);
            ctx.fill();
          }
        }
      }
      glow(0.887, 0.638, 0.034, 9e-3, "205,116,58", 0.022 + 0.02 * breath);
      ctx.restore();
    }
    function drawEmbers(phase2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of motes) {
        const u = frac3(phase2 * 2 + p.offset), size = p.size * width / 1774;
        ctx.globalAlpha = 0.28 * envelope2(u);
        ctx.drawImage(emberSprite, width * (p.x + p.flow * u) - size * 3, height * (p.y - p.rise * u) - size * 3, size * 6, size * 6);
      }
      ctx.restore();
    }
    function drawForeground(phase2) {
      for (const p of nearMist) {
        const u = frac3(phase2 + p.offset), growth = 1 + 0.16 * u;
        plume(ctx, fog[p.part], width * (p.x + p.flow * (u - 0.5)), height * (p.y - 0.019 * u), width * p.w * growth, height * p.h * (1 + 0.12 * u), p.alpha * envelope2(u));
      }
      ctx.save();
      for (const p of nearAsh) {
        const u = frac3(phase2 * 3 + p.offset), alpha = envelope2(u), size = p.size * width / 1774;
        ctx.save();
        ctx.translate(width * (p.x + p.flow * u), height * (p.y - p.rise * u));
        ctx.rotate(p.tilt + u * 2.6);
        ctx.globalAlpha = alpha * (p.warm ? 0.37 : 0.35);
        ctx.fillStyle = p.warm ? "#bc835a" : "#8e829a";
        const thin = 0.28 + 0.42 * Math.abs(Math.sin(p.tilt + TAU3 * u));
        ctx.beginPath();
        ctx.ellipse(0, 0, size * thin, size, 0, 0, TAU3);
        ctx.fill();
        if (p.warm) {
          ctx.globalAlpha = alpha * 0.17;
          ctx.drawImage(emberSprite, -size * 3, -size * 3, size * 6, size * 6);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    function render2(seconds, { ambient = true, clouds: clouds2 = true, mist: mist2 = true, shroud = true, curse = true, embers = true, foreground = true } = {}) {
      if (destroyed) return { t: 0 };
      const t = Math.round((seconds % MORWENNA_PERIOD + MORWENNA_PERIOD) % MORWENNA_PERIOD * 1e9) / 1e9;
      const phase2 = t / MORWENNA_PERIOD;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(painting, 0, 0);
      if (ambient) {
        if (clouds2) drawClouds(phase2);
        if (shroud) drawShroud(phase2);
        if (curse) drawCurse(phase2);
        if (mist2) drawMist(phase2);
        if (embers) drawEmbers(phase2);
        if (foreground) drawForeground(phase2);
      }
      return { t };
    }
    return { render: render2, period: MORWENNA_PERIOD, destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const c of buffers) c.width = c.height = 1;
      canvas.width = canvas.height = 1;
    } };
  }

  // src/modules/MorwennaScene.js
  var scenes3 = /* @__PURE__ */ new Map();
  var bossSelector2 = 'img[src*="boss-morwenna"],img[alt^="Morwenna"]';
  function createMorwennaRenderer(canvas, environment, assets = {}, options = {}) {
    return createMorwennaArenaScene(canvas, { background: environment, ...assets, ...options });
  }
  function clearMorwennaScene(arena) {
    const state = scenes3.get(arena);
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.frame);
    state.visible?.disconnect();
    state.renderer?.destroy();
    state.renderer = null;
    document.removeEventListener("visibilitychange", state.resume);
    state.motion.removeEventListener("change", state.resume);
    state.art.remove();
    state.stage.removeAttribute("data-iw-raid-boss-stage");
    arena.removeAttribute("data-iw-raid-scene");
    scenes3.delete(arena);
  }
  function reconcileMorwennaScene(arena) {
    pruneMorwennaScenes();
    const boss = arena.querySelector(bossSelector2);
    const nativeBackground = arena.style.getPropertyValue("--raid-bg-image");
    if (!boss || nativeBackground && !/morwenna/i.test(nativeBackground)) {
      clearMorwennaScene(arena);
      return;
    }
    const current = scenes3.get(arena);
    if (current) {
      if (current.art.parentElement === arena && current.stage === boss.parentElement) return;
      clearMorwennaScene(arena);
    }
    const art2 = document.createElement("div");
    art2.setAttribute("data-iw-morwenna-art", "");
    art2.setAttribute("aria-hidden", "true");
    const env = new Image(), textures = { clouds: new Image(), mist: new Image() }, canvas = document.createElement("canvas");
    for (const image of [env, ...Object.values(textures)]) image.crossOrigin = "anonymous";
    env.setAttribute("data-iw-art", "environment");
    art2.append(env, canvas);
    arena.append(art2);
    const state = { art: art2, stage: boss.parentElement, frame: 0, disposed: false, onScreen: true, motion: matchMedia("(prefers-reduced-motion: reduce)") };
    scenes3.set(arena, state);
    const start2 = performance.now();
    let last = 0;
    state.resume = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.renderer || state.disposed || document.hidden || !state.onScreen) return;
      if (state.motion.matches) {
        state.renderer.render(0);
        return;
      }
      state.frame = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!arena.isConnected) {
        clearMorwennaScene(arena);
        return;
      }
      if (state.disposed || document.hidden || !state.onScreen || state.motion.matches) return;
      if (now - last >= 1e3 / 30) {
        state.renderer.render((now - start2) / 1e3);
        last = now;
      }
      state.frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", state.resume);
    state.motion.addEventListener("change", state.resume);
    const load2 = (img) => new Promise((resolve2, reject) => {
      img.onload = () => resolve2(img);
      img.onerror = () => reject(new Error("Raid art unavailable"));
    });
    const loaded = Promise.all([load2(env), ...Object.values(textures).map((image) => load2(image).catch(() => null))]);
    env.src = assetUrl("assets/raids/morwenna/arena.png");
    for (const [key, name] of Object.entries({ clouds: "storm-clouds", mist: "courtyard-mist" })) textures[key].src = assetUrl("assets/raids/morwenna/" + name + ".png");
    loaded.then(([background, clouds, mist]) => {
      if (state.disposed || !arena.isConnected) return;
      const nativeBackground2 = arena.style.getPropertyValue("--raid-bg-image");
      if (arena.querySelector(bossSelector2) !== boss || boss.parentElement !== state.stage || nativeBackground2 && !/morwenna/i.test(nativeBackground2)) {
        clearMorwennaScene(arena);
        return;
      }
      arena.setAttribute("data-iw-raid-scene", "morwenna");
      state.stage.setAttribute("data-iw-raid-boss-stage", "morwenna");
      try {
        state.renderer = createMorwennaRenderer(canvas, background, { clouds, mist }, { maxWidth: 1440 });
        state.renderer.render(0);
      } catch {
        state.renderer?.destroy();
        state.renderer = null;
        return;
      }
      art2.setAttribute("data-iw-animated", "");
      if (typeof IntersectionObserver === "function") {
        state.visible = new IntersectionObserver(([entry2]) => {
          state.onScreen = entry2.isIntersecting;
          state.resume();
        });
        state.visible.observe(arena);
      }
      state.resume();
    }).catch(() => {
      if (!state.disposed) clearMorwennaScene(arena);
    });
  }
  function clearMorwennaScenes(root) {
    for (const arena of scenes3.keys()) if (root === arena || root.contains(arena) || !arena.isConnected) clearMorwennaScene(arena);
  }
  function pruneMorwennaScenes() {
    for (const arena of scenes3.keys()) if (!arena.isConnected) clearMorwennaScene(arena);
  }

  // src/modules/GrimjawArenaRenderer.js
  var GRIMJAW_PERIOD = 72;
  var TAU4 = Math.PI * 2;
  var frac4 = (value) => value - Math.floor(value);
  var fade = (u) => Math.sin(Math.PI * u) ** 2;
  function createGrimjawArenaScene(canvas, { background, clouds, mist, maxWidth = 1774 }) {
    const sw = background.naturalWidth || background.width;
    const sh = background.naturalHeight || background.height;
    const width = Math.round(Math.min(sw, maxWidth)), height = Math.round(sh * width / sw);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Unable to create the Grimjaw canvas");
    const buffers = [];
    let destroyed = false;
    const buffer = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      buffers.push(c);
      return c;
    };
    const painting = buffer(width, height);
    painting.getContext("2d").drawImage(background, 0, 0, width, height);
    const atlas = (image) => Array.from({ length: 4 }, (_, index) => {
      const c = buffer(512, 256), cx = c.getContext("2d");
      if (!image) return c;
      const w = (image.naturalWidth || image.width) / 2, h = (image.naturalHeight || image.height) / 2;
      cx.drawImage(image, index % 2 * w, Math.floor(index / 2) * h, w, h, 0, 0, 512, 256);
      const pixels = cx.getImageData(0, 0, 512, 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
        const distance = ((x - 255.5) / 255.5) ** 2 + ((y - 127.5) / 127.5) ** 2;
        const rim = Math.max(0, Math.min(1, (1 - distance) / 0.55));
        pixels.data[(y * 512 + x) * 4 + 3] *= rim * rim * (3 - 2 * rim);
      }
      cx.putImageData(pixels, 0, 0);
      return c;
    });
    const storm = atlas(clouds), fog = atlas(mist);
    const sky = buffer(width, height), sc = sky.getContext("2d");
    const skyMask = buffer(width, height), sm = skyMask.getContext("2d");
    const polygon = (target, points) => {
      target.beginPath();
      points.forEach(([x, y], i) => i ? target.lineTo(x * width, y * height) : target.moveTo(x * width, y * height));
      target.closePath();
      target.fill();
    };
    sm.filter = `blur(${width * 6e-3}px)`;
    sm.fillStyle = "#fff";
    polygon(sm, [[0.233, 0], [0.681, 0], [0.659, 0.12], [0.636, 0.27], [0.605, 0.42], [0.545, 0.49], [0.237, 0.49]]);
    polygon(sm, [[0.829, 0], [0.976, 0], [0.955, 0.34], [0.891, 0.29], [0.862, 0.16]]);
    sm.globalCompositeOperation = "destination-out";
    polygon(sm, [[0.309, 0.33], [0.324, 0.225], [0.35, 0.201], [0.369, 0.143], [0.389, 0.1], [0.432, 0.127], [0.433, 0.241], [0.478, 0.279], [0.478, 0.43], [0.303, 0.43]]);
    sm.filter = "none";
    const skyBanks = [
      { x: 0.34, y: 0.08, w: 0.36, h: 0.21, flow: -0.18, alpha: 0.31, offset: 0.11, part: 0 },
      { x: 0.51, y: 0.18, w: 0.35, h: 0.25, flow: -0.16, alpha: 0.29, offset: 0.56, part: 1 },
      { x: 0.6, y: 0.04, w: 0.32, h: 0.17, flow: -0.2, alpha: 0.23, offset: 0.79, part: 2 },
      { x: 0.49, y: 0.38, w: 0.3, h: 0.19, flow: -0.14, alpha: 0.18, offset: 0.31, part: 3 },
      { x: 0.9, y: 0.09, w: 0.23, h: 0.19, flow: -0.15, alpha: 0.22, offset: 0.47, part: 0 }
    ];
    const ground = [
      { x: 0.12, y: 0.643, w: 0.3, h: 0.074, flow: -0.12, alpha: 0.16, offset: 0.12, part: 0, speed: 1 },
      { x: 0.32, y: 0.657, w: 0.32, h: 0.066, flow: -0.1, alpha: 0.18, offset: 0.63, part: 1, speed: 1 },
      { x: 0.49, y: 0.668, w: 0.29, h: 0.08, flow: -0.13, alpha: 0.15, offset: 0.33, part: 3, speed: 1 },
      { x: 0.67, y: 0.692, w: 0.26, h: 0.071, flow: -0.09, alpha: 0.15, offset: 0.82, part: 0, speed: 2 },
      { x: 0.79, y: 0.704, w: 0.28, h: 0.071, flow: -0.1, alpha: 0.17, offset: 0.05, part: 2, speed: 2 },
      { x: 0.94, y: 0.652, w: 0.25, h: 0.085, flow: -0.12, alpha: 0.14, offset: 0.49, part: 1, speed: 1 }
    ];
    const near = [
      { x: 0.1, y: 0.884, w: 0.48, h: 0.12, flow: -0.7, alpha: 0.33, offset: 0.23, part: 3, speed: 4 },
      { x: 0.48, y: 0.958, w: 0.57, h: 0.14, flow: -0.82, alpha: 0.36, offset: 0.65, part: 0, speed: 6 },
      { x: 0.9, y: 0.861, w: 0.49, h: 0.11, flow: -0.76, alpha: 0.3, offset: 0.39, part: 1, speed: 4 }
    ];
    const squalls = [
      { x: 0.4, y: 0.34, w: 0.72, h: 0.14, flow: -0.86, alpha: 0.19, offset: 0.11, part: 0, speed: 6 },
      { x: 0.67, y: 0.49, w: 0.83, h: 0.17, flow: -0.94, alpha: 0.25, offset: 0.61, part: 2, speed: 6 },
      { x: 0.26, y: 0.61, w: 0.68, h: 0.12, flow: -1.02, alpha: 0.32, offset: 0.36, part: 1, speed: 8 },
      { x: 0.81, y: 0.69, w: 0.79, h: 0.17, flow: -0.87, alpha: 0.31, offset: 0.84, part: 3, speed: 6 },
      { x: 0.45, y: 0.78, w: 0.9, h: 0.09, flow: -1.12, alpha: 0.32, offset: 0.52, part: 0, speed: 8 }
    ];
    let seed = 7301;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const flakes = [
      { count: 900, speed: 12, size: 0.65, spread: 1, alpha: 0.38, fall: 1.24, travel: 0.68, stretch: 2 },
      { count: 240, speed: 18, size: 1.3, spread: 1.5, alpha: 0.54, fall: 1.3, travel: 0.85, stretch: 3 },
      { count: 84, speed: 24, size: 2.3, spread: 2.2, alpha: 0.66, fall: 1.38, travel: 1.05, stretch: 4.4 }
    ].flatMap((layer) => Array.from({ length: layer.count }, () => ({
      x: -0.3 + random() * 1.9,
      offset: random(),
      dx: layer.travel * (0.76 + random() * 0.48),
      fall: layer.fall * (0.86 + random() * 0.28),
      speed: layer.speed,
      size: layer.size + random() * layer.spread,
      alpha: layer.alpha + random() * 0.13,
      stretch: layer.stretch * (0.7 + random() * 0.6)
    })));
    const handMotes = Array.from({ length: 22 }, () => ({ offset: random(), x: 0.845 + random() * 0.012, rise: 0.07 + random() * 0.11, drift: -0.016 + random() * 0.026, size: 0.6 + random() * 1.2 }));
    const snowSprite = buffer(32, 32), sn = snowSprite.getContext("2d");
    const sg = sn.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0, "rgba(231,243,250,1)");
    sg.addColorStop(0.35, "rgba(231,243,250,.72)");
    sg.addColorStop(1, "rgba(231,243,250,0)");
    sn.fillStyle = sg;
    sn.fillRect(0, 0, 32, 32);
    const whiteout = buffer(width, height), wc = whiteout.getContext("2d");
    const veil = wc.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, "rgba(193,213,227,.05)");
    veil.addColorStop(0.45, "rgba(204,223,235,.14)");
    veil.addColorStop(0.7, "rgba(204,223,235,.17)");
    veil.addColorStop(1, "rgba(193,213,227,.02)");
    wc.fillStyle = veil;
    wc.fillRect(0, 0, width, height);
    function plume(target, image, x, y, w, h, alpha, angle = 0) {
      target.save();
      target.globalAlpha = alpha;
      target.translate(x * width, y * height);
      target.rotate(angle);
      target.drawImage(image, -w * width / 2, -h * height / 2, w * width, h * height);
      target.restore();
    }
    function mistBanks(banks, phase2) {
      for (const p of banks) {
        const u = frac4(phase2 * p.speed + p.offset);
        plume(ctx, fog[p.part], p.x + p.flow * (u - 0.5), p.y - 0.012 * u, p.w * (1 + 0.12 * u), p.h * (1 + 0.18 * u), p.alpha * fade(u));
      }
    }
    function drawClouds(phase2) {
      sc.globalCompositeOperation = "source-over";
      sc.clearRect(0, 0, width, height);
      for (const p of skyBanks) {
        const u = frac4(phase2 * 4 + p.offset);
        plume(sc, storm[p.part], p.x + p.flow * (u - 0.5), p.y - 0.012 * u, p.w * (1 + 0.07 * u), p.h * (1 + 0.12 * u), p.alpha * fade(u));
      }
      sc.globalCompositeOperation = "destination-in";
      sc.drawImage(skyMask, 0, 0);
      ctx.drawImage(sky, 0, 0);
    }
    function drawBoss(phase2) {
      for (let i = 0; i < 3; i++) {
        const u = frac4(phase2 * 6 + i / 3);
        plume(ctx, fog[(i + 3) % 4], 0.738 - 0.04 * u, 0.168 - 0.011 * u, 0.016 + 0.05 * u, 9e-3 + 0.017 * u, 0.22 * fade(u), -0.08);
      }
      for (let i = 0; i < 5; i++) {
        const v = frac4(phase2 * 9 + i / 5 + 0.17);
        plume(ctx, fog[i % 4], 0.85 - 0.027 * v + 5e-3 * Math.sin(TAU4 * phase2 * 3 + i) * v, 0.364 - 0.163 * v, 0.028 + 0.056 * v, 0.036 + 0.068 * v, 0.28 * fade(v), -1.1);
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.5 - 0.5 * Math.cos(TAU4 * phase2 * 6);
      const x = 0.847 * width, y = 0.371 * height;
      const g = ctx.createRadialGradient(x, y, 0, x, y, width * 0.017);
      g.addColorStop(0, `rgba(126,205,234,${0.08 + 0.05 * pulse})`);
      g.addColorStop(1, "rgba(126,205,234,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - width * 0.017, y - width * 0.017, width * 0.034, width * 0.034);
      for (let i = 0; i < 4; i++) {
        const u = frac4(phase2 * 9 + i / 4), length = 0.025 + 0.16 * u, root = 0.849 + (i - 1.5) * 25e-4;
        const path = () => {
          ctx.beginPath();
          for (let j = 0; j <= 24; j++) {
            const q = j / 24, px = (root - 0.018 * u * q + 6e-3 * Math.sin(TAU4 * phase2 * 3 + i * 1.3 + q * 6) * q) * width;
            const py = (0.365 - length * q) * height;
            j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
        };
        const cg = ctx.createLinearGradient(root * width, 0.365 * height, root * width, (0.365 - length) * height);
        cg.addColorStop(0, "rgba(116,205,240,0)");
        cg.addColorStop(0.24, `rgba(116,205,240,${0.25 * fade(u)})`);
        cg.addColorStop(0.72, `rgba(190,234,255,${0.35 * fade(u)})`);
        cg.addColorStop(1, "rgba(190,234,255,0)");
        ctx.strokeStyle = cg;
        ctx.lineCap = "round";
        ctx.lineWidth = width * 2e-3;
        ctx.globalAlpha = 0.25;
        path();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(0.7, width * 65e-5);
        path();
        ctx.stroke();
      }
      for (const p of handMotes) {
        const u = frac4(phase2 * 6 + p.offset), s = p.size * width / 1774;
        ctx.globalAlpha = 0.43 * fade(u);
        ctx.fillStyle = "#b8e9fa";
        ctx.beginPath();
        ctx.arc((p.x + p.drift * u) * width, (0.362 - p.rise * u) * height, s, 0, TAU4);
        ctx.fill();
      }
      ctx.restore();
    }
    function drawSnow(phase2) {
      ctx.save();
      ctx.globalAlpha = 0.78 + 0.2 * Math.sin(TAU4 * phase2 * 4);
      ctx.drawImage(whiteout, 0, 0);
      ctx.globalAlpha = 1;
      mistBanks(squalls, phase2);
      for (const p of flakes) {
        const u = frac4(phase2 * p.speed + p.offset), s = p.size * width / 1774;
        const gustPhase = TAU4 * phase2 * 6 + p.offset * TAU4;
        const gust = 0.018 * Math.sin(gustPhase);
        const vx = (-p.dx * p.speed + 0.018 * TAU4 * 6 * Math.cos(gustPhase)) * width;
        const vy = p.fall * p.speed * height;
        const tilt = Math.atan2(-vx, vy);
        ctx.save();
        ctx.globalAlpha = p.alpha * fade(u);
        ctx.translate((p.x - p.dx * (u - 0.5) + gust) * width, (-0.12 + p.fall * u) * height);
        ctx.rotate(tilt);
        ctx.drawImage(snowSprite, -s * 0.85, -s * p.stretch, s * 1.7, s * p.stretch * 2);
        ctx.restore();
      }
      ctx.restore();
    }
    function render2(seconds, { clouds: clouds2 = true, mist: mist2 = true, boss = true, snow = true, foreground = true, ambient = true } = {}) {
      if (destroyed) return { t: 0 };
      const t = Math.round((seconds % GRIMJAW_PERIOD + GRIMJAW_PERIOD) % GRIMJAW_PERIOD * 1e9) / 1e9, phase2 = t / GRIMJAW_PERIOD;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(painting, 0, 0);
      if (ambient) {
        if (clouds2) drawClouds(phase2);
        if (boss) drawBoss(phase2);
        if (mist2) mistBanks(ground, phase2);
        if (foreground) mistBanks(near, phase2);
        if (snow) drawSnow(phase2);
      }
      return { t };
    }
    return { render: render2, period: GRIMJAW_PERIOD, destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const c of buffers) c.width = c.height = 1;
      canvas.width = canvas.height = 1;
    } };
  }

  // src/modules/GrimjawScene.js
  var scenes4 = /* @__PURE__ */ new Map();
  var bossSelector3 = 'img[src*="boss-grimjaw"],img[alt^="Grimjaw"]';
  function createGrimjawRenderer(canvas, environment, assets = {}, options = {}) {
    return createGrimjawArenaScene(canvas, { background: environment, ...assets, ...options });
  }
  function clearGrimjawScene(arena) {
    const state = scenes4.get(arena);
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.frame);
    state.visible?.disconnect();
    state.renderer?.destroy();
    state.renderer = null;
    document.removeEventListener("visibilitychange", state.resume);
    state.motion.removeEventListener("change", state.resume);
    state.art.remove();
    state.stage.removeAttribute("data-iw-raid-boss-stage");
    arena.removeAttribute("data-iw-raid-scene");
    scenes4.delete(arena);
  }
  function reconcileGrimjawScene(arena) {
    pruneGrimjawScenes();
    const boss = arena.querySelector(bossSelector3);
    const nativeBackground = arena.style.getPropertyValue("--raid-bg-image");
    if (!boss || nativeBackground && !/grimjaw/i.test(nativeBackground)) {
      clearGrimjawScene(arena);
      return;
    }
    const current = scenes4.get(arena);
    if (current) {
      if (current.art.parentElement === arena && current.stage === boss.parentElement) return;
      clearGrimjawScene(arena);
    }
    const art2 = document.createElement("div");
    art2.setAttribute("data-iw-grimjaw-art", "");
    art2.setAttribute("aria-hidden", "true");
    const env = new Image(), textures = { clouds: new Image(), mist: new Image() }, canvas = document.createElement("canvas");
    for (const image of [env, ...Object.values(textures)]) image.crossOrigin = "anonymous";
    env.setAttribute("data-iw-art", "environment");
    art2.append(env, canvas);
    arena.append(art2);
    const state = { art: art2, stage: boss.parentElement, frame: 0, disposed: false, onScreen: true, motion: matchMedia("(prefers-reduced-motion: reduce)") };
    scenes4.set(arena, state);
    const start2 = performance.now();
    let last = 0;
    state.resume = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.renderer || state.disposed || document.hidden || !state.onScreen) return;
      if (state.motion.matches) {
        state.renderer.render(0);
        return;
      }
      state.frame = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!arena.isConnected) {
        clearGrimjawScene(arena);
        return;
      }
      if (state.disposed || document.hidden || !state.onScreen || state.motion.matches) return;
      if (now - last >= 1e3 / 30) {
        state.renderer.render((now - start2) / 1e3);
        last = now;
      }
      state.frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", state.resume);
    state.motion.addEventListener("change", state.resume);
    const load2 = (img) => new Promise((resolve2, reject) => {
      img.onload = () => resolve2(img);
      img.onerror = () => reject(new Error("Raid art unavailable"));
    });
    const loaded = Promise.all([load2(env), ...Object.values(textures).map((image) => load2(image).catch(() => null))]);
    env.src = assetUrl("assets/raids/grimjaw/arena.png");
    for (const [key, name] of Object.entries({ clouds: "storm-clouds", mist: "courtyard-mist" })) textures[key].src = assetUrl("assets/raids/grimjaw/" + name + ".png");
    loaded.then(([background, clouds, mist]) => {
      if (state.disposed || !arena.isConnected) return;
      const nativeBackground2 = arena.style.getPropertyValue("--raid-bg-image");
      if (arena.querySelector(bossSelector3) !== boss || boss.parentElement !== state.stage || nativeBackground2 && !/grimjaw/i.test(nativeBackground2)) {
        clearGrimjawScene(arena);
        return;
      }
      arena.setAttribute("data-iw-raid-scene", "grimjaw");
      state.stage.setAttribute("data-iw-raid-boss-stage", "grimjaw");
      try {
        state.renderer = createGrimjawRenderer(canvas, background, { clouds, mist }, { maxWidth: 1440 });
        state.renderer.render(0);
      } catch {
        state.renderer?.destroy();
        state.renderer = null;
        return;
      }
      art2.setAttribute("data-iw-animated", "");
      if (typeof IntersectionObserver === "function") {
        state.visible = new IntersectionObserver(([entry2]) => {
          state.onScreen = entry2.isIntersecting;
          state.resume();
        });
        state.visible.observe(arena);
      }
      state.resume();
    }).catch(() => {
      if (!state.disposed) clearGrimjawScene(arena);
    });
  }
  function clearGrimjawScenes(root) {
    for (const arena of scenes4.keys()) if (root === arena || root.contains(arena) || !arena.isConnected) clearGrimjawScene(arena);
  }
  function pruneGrimjawScenes() {
    for (const arena of scenes4.keys()) if (!arena.isConnected) clearGrimjawScene(arena);
  }

  // src/modules/SkarthArenaRenderer.js
  var SKARTH_PERIOD = 72;
  var TAU5 = Math.PI * 2;
  var frac5 = (n) => n - Math.floor(n);
  var fade2 = (u) => Math.sin(Math.PI * u) ** 2;
  function createSkarthArenaScene(canvas, { background, atmosphere, ice, water, maxWidth = 1774 }) {
    const sw = background.naturalWidth || background.width, sh = background.naturalHeight || background.height;
    const width = Math.round(Math.min(sw, maxWidth)), height = Math.round(sh * width / sw);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Unable to create the Skarth canvas");
    const buffers = [];
    let destroyed = false;
    const buffer = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      buffers.push(c);
      return c;
    };
    const painting = buffer(width, height);
    painting.getContext("2d").drawImage(background, 0, 0, width, height);
    const atlas = (image) => Array.from({ length: 4 }, (_, part) => {
      const cell = buffer(384, 384), cx = cell.getContext("2d", { willReadFrequently: true });
      if (!image) return { image: cell, x: 0, y: 0, w: 384, h: 384 };
      const w = (image.naturalWidth || image.width) / 2, h = (image.naturalHeight || image.height) / 2;
      cx.drawImage(image, part % 2 * w, Math.floor(part / 2) * h, w, h, 0, 0, 384, 384);
      const pixels = cx.getImageData(0, 0, 384, 384);
      let x0 = 384, y0 = 384, x1 = 0, y1 = 0;
      for (let y = 0; y < 384; y++) for (let x = 0; x < 384; x++) {
        const i = (y * 384 + x) * 4 + 3, edge = Math.min(x, y, 383 - x, 383 - y) / 12;
        pixels.data[i] *= Math.min(1, Math.max(0, edge));
        if (pixels.data[i] > 12) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
      cx.putImageData(pixels, 0, 0);
      return x0 > x1 ? { image: cell, x: 0, y: 0, w: 384, h: 384 } : { image: cell, x: Math.max(0, x0 - 5), y: Math.max(0, y0 - 5), w: Math.min(384, x1 + 6) - Math.max(0, x0 - 5), h: Math.min(384, y1 + 6) - Math.max(0, y0 - 5) };
    });
    const air = atlas(atmosphere), floes = atlas(ice), foam = atlas(water);
    const sky = buffer(width, height), sc = sky.getContext("2d"), surface = buffer(width, height), wc = surface.getContext("2d");
    const mask = (points, holes = []) => {
      const c = buffer(width, height), m = c.getContext("2d");
      const poly = (p) => {
        m.beginPath();
        p.forEach(([x, y], i) => i ? m.lineTo(x * width, y * height) : m.moveTo(x * width, y * height));
        m.closePath();
        m.fill();
      };
      m.filter = `blur(${width * 5e-3}px)`;
      m.fillStyle = "#fff";
      poly(points);
      m.globalCompositeOperation = "destination-out";
      for (const p of holes) poly(p);
      m.filter = "none";
      return c;
    };
    const skyMask = mask([[0.095, 0], [0.974, 0], [0.962, 0.29], [0.945, 0.37], [0.87, 0.39], [0.64, 0.29], [0.59, 0.27], [0.49, 0.27], [0.46, 0.31], [0.27, 0.28], [0.095, 0.24]], [
      [[0.61, 0.28], [0.637, 0.18], [0.685, 0.14], [0.7, 0.095], [0.76, 0.028], [0.85, 5e-3], [0.9, 0.09], [0.913, 0.33], [0.94, 0.45], [0.82, 0.59], [0.69, 0.55], [0.62, 0.4]],
      [[0.115, 0.14], [0.15, 0.135], [0.152, 0.067], [0.177, 0.06], [0.18, 0.035], [0.205, 0.03], [0.207, 0.135], [0.245, 0.155], [0.265, 0.19], [0.3, 0.2], [0.309, 0.23], [0.31, 0.3], [0.12, 0.3]]
    ]);
    const waterMask = mask([[0.12, 0.505], [0.34, 0.525], [0.49, 0.54], [0.65, 0.568], [0.76, 0.6], [0.915, 0.602], [0.942, 0.67], [0.923, 0.78], [0.76, 0.88], [0.65, 0.91], [0.49, 0.81], [0.31, 0.74], [0.18, 0.66], [0.1, 0.565]]);
    const plume = (target, sprite, x, y, w, h, alpha, angle = 0) => {
      if (alpha < 1e-3) return;
      target.save();
      target.globalAlpha = alpha;
      target.translate(x * width, y * height);
      target.rotate(angle);
      target.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, -w * width / 2, -h * height / 2, w * width, h * height);
      target.restore();
    };
    const reset = (target) => {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      target.globalCompositeOperation = "source-over";
      target.clearRect(0, 0, width, height);
    };
    const cloudBanks = [
      { x: 0.32, y: 0.08, w: 0.37, h: 0.19, flow: -0.19, alpha: 0.23, offset: 0.16, part: 0 },
      { x: 0.51, y: 0.12, w: 0.32, h: 0.14, flow: -0.16, alpha: 0.25, offset: 0.65, part: 1 },
      { x: 0.6, y: 0.015, w: 0.3, h: 0.18, flow: -0.18, alpha: 0.2, offset: 0.85, part: 0 },
      { x: 0.37, y: 0.22, w: 0.29, h: 0.13, flow: -0.14, alpha: 0.17, offset: 0.41, part: 1 },
      { x: 0.95, y: 0.085, w: 0.24, h: 0.19, flow: -0.15, alpha: 0.19, offset: 0.5, part: 1 }
    ];
    const mistBanks = [
      { x: 0.24, y: 0.53, w: 0.3, h: 0.048, flow: -0.15, offset: 0.15, alpha: 0.14, part: 2 },
      { x: 0.49, y: 0.573, w: 0.31, h: 0.05, flow: -0.12, offset: 0.55, alpha: 0.17, part: 3 },
      { x: 0.75, y: 0.617, w: 0.37, h: 0.055, flow: -0.13, offset: 0.3, alpha: 0.16, part: 2 },
      { x: 0.51, y: 0.725, w: 0.38, h: 0.06, flow: -0.2, offset: 0.83, alpha: 0.16, part: 3 }
    ];
    let seed = 6207;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const driftingIce = Array.from({ length: 13 }, (_, i) => {
      const depth = i / 12;
      return { x: 0.24 + random() * 0.62, y: 0.585 + depth * 0.245, w: 0.013 + depth * 0.04, h: 7e-3 + depth * 0.02, flow: -0.12 - depth * 0.055, offset: random(), part: i % 4, bob: random() * TAU5, turn: (random() - 0.5) * 0.1 };
    });
    const breaches = [{ x: 0.185, y: 0.505, w: 0.19 }, { x: 0.34, y: 0.523, w: 0.18 }, { x: 0.52, y: 0.546, w: 0.28 }, { x: 0.72, y: 0.586, w: 0.18 }, { x: 0.84, y: 0.596, w: 0.26 }];
    const droplets = breaches.flatMap((b, j) => Array.from({ length: 14 }, () => ({ x: b.x + (random() - 0.5) * b.w * 0.62, y: b.y - 6e-3, offset: random(), rise: 8e-3 + random() * 0.029, drift: -0.012 - random() * 0.015, size: 0.45 + random() * 0.9, speed: 12 + j % 3 * 6 })));
    const snow = [
      { count: 680, speed: 12, size: 0.6, spread: 0.8, alpha: 0.35, fall: 1.25, travel: 0.67, stretch: 2 },
      { count: 200, speed: 18, size: 1.2, spread: 1.4, alpha: 0.52, fall: 1.32, travel: 0.86, stretch: 3 },
      { count: 70, speed: 24, size: 2.1, spread: 1.8, alpha: 0.62, fall: 1.38, travel: 1.03, stretch: 4 }
    ].flatMap((layer) => Array.from({ length: layer.count }, () => ({ x: -0.3 + random() * 1.9, offset: random(), dx: layer.travel * (0.75 + random() * 0.5), fall: layer.fall * (0.86 + random() * 0.28), speed: layer.speed, size: layer.size + random() * layer.spread, alpha: layer.alpha + random() * 0.1, stretch: layer.stretch * (0.7 + random() * 0.6) })));
    const snowSprite = buffer(32, 32), sn = snowSprite.getContext("2d");
    const sg = sn.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0, "rgba(227,242,250,1)");
    sg.addColorStop(0.35, "rgba(227,242,250,.72)");
    sg.addColorStop(1, "rgba(227,242,250,0)");
    sn.fillStyle = sg;
    sn.fillRect(0, 0, 32, 32);
    const veil = buffer(width, height), vc = veil.getContext("2d"), vg = vc.createLinearGradient(0, 0, 0, height);
    vg.addColorStop(0, "rgba(175,200,221,.02)");
    vg.addColorStop(0.52, "rgba(186,210,228,.13)");
    vg.addColorStop(1, "rgba(175,200,221,.015)");
    vc.fillStyle = vg;
    vc.fillRect(0, 0, width, height);
    function drawClouds(phase2) {
      reset(sc);
      for (const p of cloudBanks) {
        const u = frac5(phase2 * 2 + p.offset);
        plume(sc, air[p.part], p.x + p.flow * (u - 0.5), p.y - 6e-3 * u, p.w * (1 + 0.07 * u), p.h * (1 + 0.09 * u), p.alpha * fade2(u));
      }
      sc.globalCompositeOperation = "destination-in";
      sc.drawImage(skyMask, 0, 0);
      ctx.drawImage(sky, 0, 0);
    }
    function drawMist(phase2) {
      for (const p of mistBanks) {
        const u = frac5(phase2 * 3 + p.offset);
        plume(ctx, air[p.part], p.x + p.flow * (u - 0.5), p.y - 6e-3 * u, p.w * (1 + 0.12 * u), p.h * (1 + 0.2 * u), p.alpha * fade2(u));
      }
      for (let i = 0; i < 3; i++) {
        const u = frac5(phase2 * 6 + i / 3);
        plume(ctx, air[3], 0.625 - 0.045 * u, 0.259 - 0.018 * u, 0.014 + 0.065 * u, 8e-3 + 0.025 * u, 0.18 * fade2(u), -0.16);
      }
    }
    function drawIce(phase2) {
      for (const p of driftingIce) {
        const u = frac5(phase2 + p.offset), bob = Math.sin(TAU5 * phase2 * 12 + p.bob);
        const x = p.x + p.flow * (u - 0.5), y = p.y + bob * 2e-3;
        plume(wc, floes[p.part], x, y + 6e-3, p.w, p.h * 0.65, 0.13 * fade2(u), p.turn + Math.sin(TAU5 * phase2 * 2 + p.bob) * 0.015);
        plume(wc, floes[p.part], x, y, p.w, p.h, 0.68 * fade2(u), p.turn + Math.sin(TAU5 * phase2 * 2 + p.bob) * 0.015);
        plume(wc, foam[1], x + 8e-3, y + 0.011, p.w * 1.7, 0.01, 0.17 * fade2(u));
      }
    }
    function drawWater(phase2) {
      for (let j = 0; j < breaches.length; j++) {
        const b = breaches[j];
        for (let i = 0; i < 3; i++) {
          const u = frac5(phase2 * 9 + i / 3 + j * 0.13);
          plume(wc, foam[i % 2], b.x - 0.015 * u, b.y + 5e-3 + 0.025 * u, b.w * (0.66 + 0.7 * u), 0.012 + 0.025 * u, 0.37 * fade2(u));
        }
      }
      wc.save();
      wc.lineCap = "round";
      for (let i = 0; i < 24; i++) {
        const u = frac5(phase2 * 3 + i * 0.617), y = 0.57 + i % 8 * 0.032, x = 0.17 + i % 6 * 0.13 - 0.08 * u;
        wc.strokeStyle = `rgba(175,206,224,${0.065 * fade2(u)})`;
        wc.lineWidth = Math.max(0.6, width * 6e-4);
        wc.beginPath();
        wc.moveTo(x * width, y * height);
        wc.quadraticCurveTo((x + 0.023) * width, (y + 3e-3 * Math.sin(TAU5 * phase2 * 6 + i)) * height, (x + 0.043) * width, y * height);
        wc.stroke();
      }
      wc.restore();
    }
    function drawSpray(phase2) {
      for (let j = 0; j < breaches.length; j++) {
        const b = breaches[j];
        for (let i = 0; i < 2; i++) {
          const u = frac5(phase2 * 12 + i / 2 + j * 0.19), h = 0.018 + 0.034 * Math.sin(Math.PI * u);
          plume(ctx, foam[2 + (j + i) % 2], b.x - 0.011 * u, b.y - h * 0.33, b.w * (0.27 + 0.25 * u), h, 0.29 * fade2(u));
        }
      }
      ctx.save();
      ctx.fillStyle = "#c1dce9";
      for (const p of droplets) {
        const u = frac5(phase2 * p.speed + p.offset), s = p.size * width / 1774;
        ctx.globalAlpha = 0.42 * fade2(u);
        ctx.beginPath();
        ctx.ellipse((p.x + p.drift * u) * width, (p.y - p.rise * 4 * u * (1 - u) + 8e-3 * u) * height, s * 0.6, s, 0, 0, TAU5);
        ctx.fill();
      }
      ctx.restore();
    }
    function drawSnow(phase2) {
      ctx.save();
      ctx.globalAlpha = 0.65 + 0.15 * Math.sin(TAU5 * phase2 * 4);
      ctx.drawImage(veil, 0, 0);
      for (const p of snow) {
        const u = frac5(phase2 * p.speed + p.offset), s = p.size * width / 1774, g = TAU5 * phase2 * 6 + p.offset * TAU5;
        const vx = (-p.dx * p.speed + 0.018 * TAU5 * 6 * Math.cos(g)) * width, vy = p.fall * p.speed * height;
        ctx.save();
        ctx.globalAlpha = p.alpha * fade2(u);
        ctx.translate((p.x - p.dx * (u - 0.5) + 0.018 * Math.sin(g)) * width, (-0.12 + p.fall * u) * height);
        ctx.rotate(Math.atan2(-vx, vy));
        ctx.drawImage(snowSprite, -s * 0.85, -s * p.stretch, s * 1.7, s * p.stretch * 2);
        ctx.restore();
      }
      ctx.restore();
    }
    function drawForeground(phase2) {
      for (let i = 0; i < 3; i++) {
        const u = frac5(phase2 * 6 + i / 3 + 0.24);
        plume(ctx, air[2 + i % 2], 0.25 + i * 0.3 - 0.65 * (u - 0.5), 0.93 - i * 0.018, 0.52, 0.07 + 0.025 * u, 0.17 * fade2(u), -0.04);
      }
      for (let i = 0; i < 2; i++) {
        const u = frac5(phase2 * 6 + i / 2 + 0.12);
        plume(ctx, air[3], 0.54 - 0.72 * (u - 0.5), 0.68 + i * 0.1, 0.73, 0.045, 0.13 * fade2(u), -0.09);
      }
    }
    function render2(seconds, { clouds = true, mist = true, ice: ice2 = true, water: water2 = true, snow: snow2 = true, foreground = true, ambient = true } = {}) {
      if (destroyed) return { t: 0 };
      const t = Math.round((seconds % SKARTH_PERIOD + SKARTH_PERIOD) % SKARTH_PERIOD * 1e9) / 1e9, phase2 = t / SKARTH_PERIOD;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(painting, 0, 0);
      if (ambient) {
        if (clouds) drawClouds(phase2);
        if (ice2 || water2) {
          reset(wc);
          if (water2) drawWater(phase2);
          if (ice2) drawIce(phase2);
          wc.globalCompositeOperation = "destination-in";
          wc.drawImage(waterMask, 0, 0);
          ctx.drawImage(surface, 0, 0);
        }
        if (water2) drawSpray(phase2);
        if (mist) drawMist(phase2);
        if (snow2) drawSnow(phase2);
        if (foreground) drawForeground(phase2);
      }
      return { t };
    }
    return { render: render2, period: SKARTH_PERIOD, destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const c of buffers) c.width = c.height = 1;
      canvas.width = canvas.height = 1;
    } };
  }

  // src/modules/SkarthScene.js
  var scenes5 = /* @__PURE__ */ new Map();
  var bossSelector4 = 'img[src*="boss-skarth"],img[alt^="Skarth"]';
  function createSkarthRenderer(canvas, environment, assets = {}, options = {}) {
    return createSkarthArenaScene(canvas, { background: environment, ...assets, ...options });
  }
  function clearSkarthScene(arena) {
    const state = scenes5.get(arena);
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.frame);
    state.visible?.disconnect();
    state.renderer?.destroy();
    state.renderer = null;
    document.removeEventListener("visibilitychange", state.resume);
    state.motion.removeEventListener("change", state.resume);
    state.art.remove();
    state.stage.removeAttribute("data-iw-raid-boss-stage");
    arena.removeAttribute("data-iw-raid-scene");
    scenes5.delete(arena);
  }
  function reconcileSkarthScene(arena) {
    pruneSkarthScenes();
    const boss = arena.querySelector(bossSelector4);
    const nativeBackground = arena.style.getPropertyValue("--raid-bg-image");
    if (!boss || nativeBackground && !/skarth/i.test(nativeBackground)) {
      clearSkarthScene(arena);
      return;
    }
    const current = scenes5.get(arena);
    if (current) {
      if (current.art.parentElement === arena && current.stage === boss.parentElement) return;
      clearSkarthScene(arena);
    }
    const art2 = document.createElement("div");
    art2.setAttribute("data-iw-skarth-art", "");
    art2.setAttribute("aria-hidden", "true");
    const env = new Image(), textures = { atmosphere: new Image(), ice: new Image(), water: new Image() }, canvas = document.createElement("canvas");
    for (const image of [env, ...Object.values(textures)]) image.crossOrigin = "anonymous";
    env.setAttribute("data-iw-art", "environment");
    art2.append(env, canvas);
    arena.append(art2);
    const state = { art: art2, stage: boss.parentElement, frame: 0, disposed: false, onScreen: true, motion: matchMedia("(prefers-reduced-motion: reduce)") };
    scenes5.set(arena, state);
    const start2 = performance.now();
    let last = 0;
    state.resume = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.renderer || state.disposed || document.hidden || !state.onScreen) return;
      if (state.motion.matches) {
        state.renderer.render(0);
        return;
      }
      state.frame = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!arena.isConnected) {
        clearSkarthScene(arena);
        return;
      }
      if (state.disposed || document.hidden || !state.onScreen || state.motion.matches) return;
      if (now - last >= 1e3 / 30) {
        state.renderer.render((now - start2) / 1e3);
        last = now;
      }
      state.frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", state.resume);
    state.motion.addEventListener("change", state.resume);
    const load2 = (img) => new Promise((resolve2, reject) => {
      img.onload = () => resolve2(img);
      img.onerror = () => reject(new Error("Raid art unavailable"));
    });
    const loaded = Promise.all([load2(env), ...Object.values(textures).map((image) => load2(image).catch(() => null))]);
    env.src = assetUrl("assets/raids/skarth/arena.png");
    for (const [key, name] of Object.entries({ atmosphere: "atmosphere", ice: "ice", water: "water" })) textures[key].src = assetUrl("assets/raids/skarth/" + name + ".png");
    loaded.then(([background, atmosphere, ice, water]) => {
      if (state.disposed || !arena.isConnected) return;
      const nativeBackground2 = arena.style.getPropertyValue("--raid-bg-image");
      if (arena.querySelector(bossSelector4) !== boss || boss.parentElement !== state.stage || nativeBackground2 && !/skarth/i.test(nativeBackground2)) {
        clearSkarthScene(arena);
        return;
      }
      arena.setAttribute("data-iw-raid-scene", "skarth");
      state.stage.setAttribute("data-iw-raid-boss-stage", "skarth");
      try {
        state.renderer = createSkarthRenderer(canvas, background, { atmosphere, ice, water }, { maxWidth: 1440 });
        state.renderer.render(0);
      } catch {
        state.renderer?.destroy();
        state.renderer = null;
        return;
      }
      art2.setAttribute("data-iw-animated", "");
      if (typeof IntersectionObserver === "function") {
        state.visible = new IntersectionObserver(([entry2]) => {
          state.onScreen = entry2.isIntersecting;
          state.resume();
        });
        state.visible.observe(arena);
      }
      state.resume();
    }).catch(() => {
      if (!state.disposed) clearSkarthScene(arena);
    });
  }
  function clearSkarthScenes(root) {
    for (const arena of scenes5.keys()) if (root === arena || root.contains(arena) || !arena.isConnected) clearSkarthScene(arena);
  }
  function pruneSkarthScenes() {
    for (const arena of scenes5.keys()) if (!arena.isConnected) clearSkarthScene(arena);
  }

  // src/modules/RaidPartyPreview.js
  var DUMMY = "data-iw-raid-dummy";
  var TEST = "data-iw-raid-test";
  var FULL_PARTY = 8;
  var ROSTER = [
    { name: "Test Tank", skill: "Combat (Tank)", hp: 100, charge: 80, status: [["🎯", "Tanking"], ["🛡️", "220 shield"]] },
    { name: "Test Smith", skill: "Smithing", hp: 41, charge: 20, status: [["🩸", "Cursed — reduced healing"]] },
    { name: "Test Weaver", skill: "Tailoring", hp: 18, charge: 90 },
    { name: "Test Mason", skill: "Construction", hp: 0, charge: 0 },
    { name: "Test Alchemist", skill: "Alchemy", hp: 88, charge: 35, status: [["🛡️", "140 shield"]] },
    { name: "Test Miner", skill: "Mining", hp: 64, charge: 60 },
    { name: "Test Forester", skill: "Woodcutting", hp: 76, charge: 45 },
    { name: "Test Spellwright", skill: "Spellcrafting", hp: 95, charge: 70, status: [["🛡️", "96 shield"]] }
  ];
  var HP_FILL = /(?:^|\s)bg-(?:emerald|green|amber|yellow|orange|rose|red)-\d+(?:\/\d+)?(?=\s|$)/g;
  var enabled = false;
  var isTrack = (el2) => el2?.children.length === 1 && /%$/.test(String(el2.firstElementChild.style?.width || ""));
  function cleanClone(raider) {
    const copy = raider.cloneNode(true);
    copy.querySelectorAll("[data-iw-raid-owned]").forEach((node2) => node2.remove());
    for (const node2 of [copy, ...copy.querySelectorAll("*")]) {
      for (const attr of [...node2.attributes]) if (attr.name.startsWith("data-iw-") || attr.name === "id") node2.removeAttribute(attr.name);
    }
    return copy;
  }
  function buildDummy(template, spec) {
    const dummy = cleanClone(template);
    dummy.setAttribute(DUMMY, "1");
    dummy.setAttribute("aria-label", `${spec.name} (test dummy)`);
    dummy.classList.toggle("opacity-35", spec.hp === 0);
    const [nameEl, skillEl] = dummy.querySelectorAll(":scope > p");
    if (nameEl) {
      nameEl.textContent = spec.name;
      nameEl.className = nameEl.className.replace(/(?:^|\s)text-sky-\d+(?:\/\d+)?/g, " ").trim() + " text-white";
    }
    if (skillEl) skillEl.textContent = spec.skill;
    const [hpTrack, chargeTrack] = [...dummy.querySelectorAll(":scope > div")].filter(isTrack);
    const hpFill = hpTrack?.firstElementChild;
    if (hpFill) {
      hpFill.style.width = `${spec.hp}%`;
      const toneClass = spec.hp <= 25 ? "bg-rose-500" : spec.hp <= 50 ? "bg-amber-400" : "bg-emerald-400";
      hpFill.className = `${hpFill.className.replace(HP_FILL, " ").trim()} ${toneClass}`;
    }
    const chargeFill = chargeTrack?.firstElementChild;
    if (chargeFill) chargeFill.style.width = `${spec.charge}%`;
    dummy.querySelectorAll("[title]").forEach((span) => span.remove());
    const spriteBox = dummy.firstElementChild;
    for (const [glyph, title] of spec.status || []) {
      const span = document.createElement("span");
      span.className = "absolute -top-1 left-0 text-[10px]";
      span.title = title;
      span.textContent = glyph;
      spriteBox?.append(span);
    }
    return dummy;
  }
  function syncPartyPreview(arena) {
    const floor = arena.querySelector(":scope > .raid-arena-floor");
    if (!floor) return;
    const dummies = [...floor.querySelectorAll(`:scope > [${DUMMY}]`)];
    const real = [...floor.querySelectorAll(":scope > button, :scope > div")].filter((r) => !r.hasAttribute(DUMMY));
    const want = enabled && real.length ? Math.max(0, Math.min(ROSTER.length, FULL_PARTY - real.length)) : 0;
    if (dummies.length === want) return;
    dummies.forEach((dummy) => dummy.remove());
    if (!want) return;
    const template = real.find((r) => !/(?:^|\s)opacity-35(?:\s|$)/.test(r.className)) || real[0];
    floor.append(...ROSTER.slice(0, want).map((spec) => buildDummy(template, spec)));
  }
  var EFFECT_STEPS = [0, 2, 4, 6];
  var TEST_BUFFS = [
    { art: "war-cry", name: "Battle Hymn", glyph: "⚔️", dur: 12, title: "Battle Hymn (test) — raid ATK up" },
    { art: "ward", name: "Aegis", glyph: "💠", dur: 18, title: "Aegis (test) — fire resist up" },
    { art: "shield", name: "Barrier", glyph: "🛡️", dur: 9, title: "Barrier (test) — absorbs damage" },
    { art: null, name: "Haste", glyph: "⚡", dur: 7, title: "Haste (test) — action speed up" },
    { art: null, name: "Regrowth", glyph: "💚", dur: 15, title: "Regrowth (test) — heal over time" },
    { art: null, name: "Mistveil", glyph: "💨", dur: 5, title: "Mistveil (test) — dodge up" }
  ];
  var TEST_DEBUFFS = [
    { art: "curse", name: "Hex", glyph: "🩸", dur: 14, title: "Hex (test) — reduced healing" },
    { art: "bleed", name: "Rend", glyph: "🩸", dur: 8, title: "Rend (test) — bleeding" },
    { art: null, name: "Scorch", glyph: "🔥", dur: 6, title: "Scorch (test) — burn damage" },
    { art: null, name: "Venom", glyph: "☠️", dur: 11, title: "Venom (test) — poison damage" },
    { art: null, name: "Slowed", glyph: "🐌", dur: 4, title: "Slowed (test) — reduced action speed" },
    { art: null, name: "Weakened", glyph: "🪶", dur: 10, title: "Weakened (test) — reduced damage" }
  ];
  var effectCount = 0;
  function previewEffects() {
    if (!effectCount) return [];
    const now = Math.floor(Date.now() / 1e3);
    return [...TEST_BUFFS.slice(0, effectCount), ...TEST_DEBUFFS.slice(0, effectCount)].map(({ dur, ...e }) => ({ ...e, value: `${dur - now % dur}s` }));
  }
  var TOGGLES = {
    party: {
      title: "Testing feature: fill the raid party with dummy frames",
      advance: () => {
        enabled = !enabled;
      },
      text: () => enabled ? "🧪 Test: hide dummies" : "🧪 Test: full party",
      pressed: () => enabled
    },
    effects: {
      title: "Testing feature: add test buffs and debuffs (cycles 2 / 4 / 6 of each, then off)",
      advance: () => {
        effectCount = EFFECT_STEPS[(EFFECT_STEPS.indexOf(effectCount) + 1) % EFFECT_STEPS.length];
      },
      text: () => effectCount ? `🧪 Effects: ${effectCount} + ${effectCount}` : "🧪 Effects: off",
      pressed: () => effectCount > 0
    }
  };
  function syncPartyPreviewToggle(root, head, redecorate) {
    const arenas = () => [...root.querySelectorAll(".raid-battle-backdrop")];
    const live2 = !!head && arenas().length > 0;
    for (const [key, spec] of Object.entries(TOGGLES)) {
      let toggle = head?.querySelector(`:scope > [${TEST}="${key}"]`);
      if (!live2) {
        toggle?.remove();
        continue;
      }
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.setAttribute(TEST, key);
        toggle.title = spec.title;
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          spec.advance();
          updateToggle(toggle, spec);
          for (const arena of arenas()) redecorate(arena);
        });
        head.append(toggle);
      }
      updateToggle(toggle, spec);
    }
  }
  function updateToggle(toggle, spec) {
    const text = spec.text();
    if (toggle.textContent !== text) toggle.textContent = text;
    const pressed = String(spec.pressed());
    if (toggle.getAttribute("aria-pressed") !== pressed) toggle.setAttribute("aria-pressed", pressed);
  }
  function clearRaidPartyPreview(root) {
    if (!root) return;
    root.querySelectorAll(`[${DUMMY}], [${TEST}]`).forEach((node2) => node2.remove());
  }

  // src/modules/RaidHud.js
  var norm3 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var stripGlyph = (value) => norm3(value).replace(/^[^\p{L}\p{N}]+/u, "");
  var SKILLS = ["combat", "jewelcrafting", "tailoring", "construction", "mining", "woodcutting", "alchemy", "gathering", "smithing", "spellcrafting"];
  var SKILL_ALIASES = { herbalism: "gathering", fishing: "gathering", crafting: "smithing" };
  var EFFECT_ART = [
    [/war\s*cry/i, "war-cry", "War Cry"],
    [/\bward\b/i, "ward", "Ward"],
    [/shield/i, "shield", "Shield"],
    [/tank|taunt|challenge/i, "taunt", "Tanking"],
    [/curse/i, "curse", "Cursed"],
    [/bleed|rend/i, "bleed", "Bleeding"]
  ];
  var OWNED = "data-iw-raid-owned";
  var HUD_ATTRS = [
    "data-iw-raid-encounter",
    "data-iw-raid-hud",
    "data-iw-raid-boss",
    "data-iw-raid-epithet",
    "data-iw-raid-pct",
    "data-iw-raid-cast",
    "data-iw-raid-cast-name",
    "data-iw-raid-cast-scope",
    "data-iw-raid-cast-secs",
    "data-iw-raid-cast-urgency",
    "data-iw-raid-cast-step",
    "data-iw-raid-skill",
    "data-iw-raid-hp",
    "data-iw-raid-frame",
    "data-iw-raid-self",
    "data-iw-raid-down",
    "data-iw-raid-resist",
    "data-iw-raid-resist-step",
    "data-iw-raid-fx-kind",
    "data-iw-raid-scene-less",
    "data-iw-raid-party",
    "data-iw-raid-fold",
    "data-iw-raid-timer"
  ];
  var castMax = /* @__PURE__ */ new Map();
  var strips = /* @__PURE__ */ new WeakMap();
  var timerMax = /* @__PURE__ */ new Map();
  var timerSets = /* @__PURE__ */ new WeakMap();
  var folds = /* @__PURE__ */ new Map();
  function set(el2, key, value) {
    if (!el2) return;
    if (value == null || value === false) {
      if (el2.hasAttribute(key)) el2.removeAttribute(key);
      return;
    }
    const v = String(value);
    if (el2.getAttribute(key) !== v) el2.setAttribute(key, v);
  }
  function el(tag, className, text) {
    const node2 = document.createElement(tag);
    if (className) node2.className = className;
    node2.setAttribute(OWNED, "1");
    if (text != null) node2.textContent = text;
    return node2;
  }
  function percent(fill) {
    const w = parseFloat(fill?.style?.width);
    return Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : null;
  }
  function fillTone(fill) {
    const cls = String(fill?.className || "");
    if (/(?:^|\s)bg-(?:rose|red)-/.test(cls)) return "bad";
    if (/(?:^|\s)bg-(?:amber|yellow|orange)-/.test(cls)) return "warn";
    return "good";
  }
  function skillKey(text) {
    const t = stripGlyph(text).toLowerCase();
    for (const key of SKILLS) if (t.startsWith(key)) return key;
    for (const [alias, key] of Object.entries(SKILL_ALIASES)) if (t.startsWith(alias)) return key;
    return null;
  }
  function artFor(text) {
    for (const [re, art2, name] of EFFECT_ART) if (re.test(text)) return { art: art2, name };
    return null;
  }
  function glyphOf(text) {
    const m = /^[^\p{L}\p{N}]+/u.exec(norm3(text));
    return m ? m[0].trim() : "";
  }
  function decorateBoss(arena) {
    const summary = arena.querySelector('[data-iw-guild-role="boss-summary"]');
    if (!summary) {
      set(arena, "data-iw-raid-encounter", null);
      return;
    }
    const nameEl = summary.querySelector(".font-semibold") || summary.querySelector("span");
    if (nameEl) {
      const raw = stripGlyph(nameEl.textContent);
      const comma = raw.indexOf(",");
      const boss = (comma > 0 ? raw.slice(0, comma) : raw).trim().toLowerCase();
      set(arena, "data-iw-raid-encounter", ["ashmaw", "thessaly", "morwenna", "grimjaw", "skarth"].includes(boss) ? boss : null);
      set(nameEl, "data-iw-raid-boss", comma > 0 ? raw.slice(0, comma).trim() : raw);
      set(nameEl, "data-iw-raid-epithet", comma > 0 ? raw.slice(comma + 1).trim() : "");
    } else set(arena, "data-iw-raid-encounter", null);
    const fill = summary.querySelector('[data-iw-guild-role="boss-hp"] > *');
    const text = [...summary.querySelectorAll(":scope > p")].find((p) => /hp/i.test(p.textContent));
    const pct = percent(fill);
    set(text, "data-iw-raid-pct", pct == null ? null : `${pct}%`);
  }
  function decorateCast(arena) {
    const tg = arena.querySelector('[data-iw-guild-role="telegraph"]');
    if (!tg) return;
    const text = norm3(tg.textContent);
    const m = /^(.+?)\s*(?:\(([^)]*)\))?\s+in\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\.?$/i.exec(text);
    if (!m) {
      for (const key of ["data-iw-raid-cast", "data-iw-raid-cast-name", "data-iw-raid-cast-scope", "data-iw-raid-cast-secs", "data-iw-raid-cast-urgency", "data-iw-raid-cast-step"]) set(tg, key, null);
      return;
    }
    const name = m[1].trim();
    const secs = Number(m[3]);
    const max = Math.max(secs, castMax.get(name) || 0);
    castMax.set(name, max);
    set(tg, "data-iw-raid-cast", "1");
    set(tg, "data-iw-raid-cast-name", name);
    set(tg, "data-iw-raid-cast-scope", m[2] ? m[2].replace(/^./, (c) => c.toUpperCase()) : "");
    set(tg, "data-iw-raid-cast-secs", `${Number.isInteger(secs) ? secs : secs.toFixed(1)}s`);
    set(tg, "data-iw-raid-cast-urgency", secs <= 2 ? "now" : secs <= 5 ? "near" : "calm");
    set(tg, "data-iw-raid-cast-step", String(max > 0 ? Math.round(10 * secs / max) : 10));
  }
  function readRaidEffects(arena) {
    const shared = [];
    let tank = null;
    let resist = null;
    for (const line of arena.querySelectorAll('[data-iw-guild-role="effects"] > div')) {
      const text = norm3(line.textContent);
      const left = /(\d+)\s*s\s*left/i.exec(text);
      const tanking = /^\W*(.+?)\s+is\s+tanking\b/i.exec(text);
      const res = /=\s*(\d+)\s*\/\s*(\d+)\s*needed/i.exec(text);
      if (res) {
        resist = { have: +res[1], need: +res[2], glyph: glyphOf(text) };
        set(line, "data-iw-raid-fx-kind", "resist");
        set(line, "data-iw-raid-resist", `${res[1]} / ${res[2]}`);
        set(line, "data-iw-raid-resist-step", String(Math.min(10, Math.round(10 * res[1] / Math.max(1, res[2])))));
        continue;
      }
      if (tanking) {
        tank = { name: tanking[1].trim(), secs: left ? `${left[1]}s` : "" };
        set(line, "data-iw-raid-fx-kind", "taunt");
        continue;
      }
      const art2 = artFor(text);
      set(line, "data-iw-raid-fx-kind", art2 ? art2.art : "other");
      shared.push({ art: art2?.art || null, name: art2?.name || stripGlyph(text).replace(/\s+active\b.*$/i, ""), glyph: glyphOf(text), value: left ? `${left[1]}s` : "", title: text });
    }
    return { shared, tank, resist };
  }
  function readOwnEffects(raider) {
    const own2 = [];
    for (const span of raider.querySelectorAll("[title]")) {
      if (span.closest(`[${OWNED}]`)) continue;
      const title = norm3(span.title);
      const art2 = artFor(title);
      const num = /^(\d[\d,]*)\s+/.exec(title);
      own2.push({ art: art2?.art || null, name: art2?.name || title, glyph: norm3(span.textContent), value: art2?.art === "shield" && num ? num[1] : "", title });
    }
    return own2;
  }
  function chip(effect, withLabel) {
    const node2 = el("span", "iw-raid-chip");
    if (effect.art) node2.dataset.iwRaidArt = effect.art;
    if (effect.tone) node2.dataset.iwRaidTone = effect.tone;
    node2.title = effect.title || effect.name;
    node2.setAttribute("aria-label", `${effect.name}${effect.value ? ` ${effect.value}` : ""}`);
    const icon2 = el("i", "iw-raid-chip-icon", effect.art ? null : effect.glyph || "•");
    icon2.setAttribute("aria-hidden", "true");
    node2.append(icon2);
    if (withLabel) node2.append(el("span", "iw-raid-chip-name", effect.name));
    if (effect.value) node2.append(el("b", "iw-raid-chip-value", effect.value));
    return node2;
  }
  var DEBUFF = /* @__PURE__ */ new Set(["curse", "bleed"]);
  var toneOf = (e) => DEBUFF.has(e.art) || /curse|bleed|poison|burn|reduced/i.test(e.title || "") ? "debuff" : "buff";
  function decorateRaiders(arena, raid) {
    const party = [];
    let count = 0;
    let downed = 0;
    for (const raider of arena.querySelectorAll('[data-iw-guild-role="raider"]')) {
      const nameEl = raider.querySelector('[data-iw-guild-role="raider-name"]');
      const name = norm3(nameEl?.textContent);
      const skillText = norm3(raider.querySelector('[data-iw-guild-role="raider-skill"]')?.textContent);
      const hpFill = raider.querySelector('[data-iw-guild-role="raider-hp"] > *');
      const hp = percent(hpFill);
      const tone2 = fillTone(hpFill);
      const self = /(?:^|\s)text-sky-/.test(String(nameEl?.className || ""));
      const down = hp === 0;
      count += 1;
      if (down) downed += 1;
      set(raider, "data-iw-raid-skill", skillKey(skillText));
      set(raider, "data-iw-raid-hp", hp == null ? null : `${hp}%`);
      set(raider, "data-iw-raid-frame", down || tone2 === "bad" ? "critical" : self ? "self" : "normal");
      set(raider, "data-iw-raid-down", down ? "1" : null);
      set(raider, "data-iw-raid-self", self ? "1" : null);
      const effects = readOwnEffects(raider);
      if (raid.tank && raid.tank.name === name) {
        const taunt = effects.find((e) => e.art === "taunt");
        if (taunt) taunt.value = raid.tank.secs;
        else effects.push({ art: "taunt", name: "Tanking", glyph: "🎯", value: raid.tank.secs, title: `${name} is tanking` });
      }
      if (!down) for (const e of raid.shared) effects.push({ ...e });
      for (const e of effects) e.tone = toneOf(e);
      effects.sort((a, b) => (a.tone === "debuff") - (b.tone === "debuff"));
      const sig = JSON.stringify(effects.map((e) => [e.art, e.name, e.value, e.glyph, e.tone]));
      let strip = raider.querySelector(`:scope > .iw-raid-fx[${OWNED}]`);
      if (!strip || strips.get(raider) !== sig) {
        if (!strip) {
          strip = el("span", "iw-raid-fx");
          strip.setAttribute("role", "list");
          raider.append(strip);
        }
        strip.replaceChildren(...effects.map((e) => {
          const c = chip(e, false);
          c.setAttribute("role", "listitem");
          return c;
        }));
        strips.set(raider, sig);
      }
      party.push({ name, down, effects });
    }
    const floor = arena.querySelector(":scope > .raid-arena-floor");
    set(floor, "data-iw-raid-party", count ? `${count} raider${count === 1 ? "" : "s"} · ${downed ? `${downed} down` : "all standing"}` : null);
    return party;
  }
  var secsOf = (text) => {
    const m = /(\d+)\s*s\b/.exec(text || "");
    return m ? Number(m[1]) : null;
  };
  function timerSpecs(raid, party) {
    const specs = [];
    for (const e of raid.shared) {
      const secs = secsOf(e.value);
      if (secs == null) continue;
      specs.push({ key: `raid:${e.name}`, art: e.art, glyph: e.glyph, name: e.name, who: "Raid", secs, tone: toneOf(e) });
    }
    const tankSecs = secsOf(raid.tank?.secs);
    if (tankSecs != null) specs.push({ key: "tank", art: "taunt", glyph: "🎯", name: "Tanking", who: raid.tank.name, secs: tankSecs, tone: "buff" });
    const debuffs = /* @__PURE__ */ new Map();
    for (const member of party) {
      if (member.down) continue;
      for (const e of member.effects) {
        if (e.tone !== "debuff" || raid.shared.some((r) => r.name === e.name)) continue;
        const entry2 = debuffs.get(e.name) || { key: `debuff:${e.name}`, art: e.art, glyph: e.glyph, name: e.name, who: [], secs: null, tone: "debuff" };
        entry2.who.push(member.name);
        const secs = secsOf(e.title);
        if (secs != null) entry2.secs = Math.max(entry2.secs ?? 0, secs);
        debuffs.set(e.name, entry2);
      }
    }
    for (const entry2 of debuffs.values()) specs.push({ ...entry2, who: entry2.who.join(", ") });
    specs.sort((x, y) => (x.tone === "debuff") - (y.tone === "debuff"));
    return specs;
  }
  function buildTimer(spec) {
    const bar = el("div", "iw-raid-timer");
    const icon2 = el("i", "iw-raid-chip-icon", spec.art ? null : spec.glyph || "•");
    bar.append(el("i", "iw-raid-timer-fill"), icon2, el("span", "iw-raid-timer-name"), el("span", "iw-raid-timer-who"), el("b", "iw-raid-timer-secs"));
    return bar;
  }
  function setText3(node2, value) {
    if (node2.textContent !== value) node2.textContent = value;
  }
  function updateTimer(bar, spec) {
    const [fill, , name, who, secs] = bar.children;
    set(bar, "data-iw-raid-art", spec.art);
    set(bar, "data-iw-raid-tone", spec.tone);
    set(bar, "data-iw-raid-timer", spec.key);
    setText3(name, spec.name);
    setText3(who, spec.who);
    setText3(secs, spec.secs == null ? "" : `${spec.secs}s`);
    let width = 100;
    if (spec.secs != null) {
      const max = Math.max(spec.secs, timerMax.get(spec.key) || 0);
      timerMax.set(spec.key, max);
      width = max > 0 ? Math.round(100 * spec.secs / max) : 100;
    }
    if (fill.style.width !== `${width}%`) fill.style.width = `${width}%`;
  }
  function decorateTimers(arena, raid, party) {
    const specs = timerSpecs(raid, party);
    let row = arena.querySelector(`:scope > .iw-raid-timers[${OWNED}]`);
    if (!specs.length) {
      row?.remove();
      return;
    }
    if (!row) {
      row = el("div", "iw-raid-timers");
      row.setAttribute("aria-hidden", "true");
      arena.append(row);
    }
    const keys = specs.map((spec) => spec.key).join("|");
    if (timerSets.get(row) !== keys) {
      row.replaceChildren(...specs.map(buildTimer));
      timerSets.set(row, keys);
    }
    specs.forEach((spec, i) => updateTimer(row.children[i], spec));
  }
  var docks = /* @__PURE__ */ new WeakMap();
  var dockSigs = /* @__PURE__ */ new WeakMap();
  function gameLog(arena) {
    return arena.querySelector('[data-iw-guild-role="combat-log"]');
  }
  function gameSkills(arena) {
    return arena.querySelector(':scope > [data-iw-guild-role="effects"]');
  }
  function logLines(log) {
    if (!log) return [];
    if (log.tagName === "BUTTON") return [...log.querySelectorAll(":scope > p")].reverse().map((p) => norm3(p.textContent));
    const list = [...log.children].at(-1);
    return [...list?.querySelectorAll(":scope > p") || []].map((p) => norm3(p.textContent));
  }
  function copyOf(node2) {
    const copy = node2.cloneNode(true);
    for (const elx of [copy, ...copy.querySelectorAll("*")]) {
      for (const attr of [...elx.attributes]) if (attr.name.startsWith("data-iw-") || attr.name === "id") elx.removeAttribute(attr.name);
      elx.setAttribute(OWNED, "1");
    }
    return copy;
  }
  function onDockHead(event) {
    event.preventDefault();
    event.stopPropagation();
    const head = event.currentTarget;
    const panel = head.parentElement;
    const dock = panel.parentElement;
    const arena = docks.get(dock);
    const key = panel.dataset.iwRaidDock;
    const open = folds.get(key) !== true;
    folds.set(key, open);
    syncDockPanel(panel, open);
    if (!arena) return;
    decorateDock(arena);
    if (key !== "log") return;
    const log = gameLog(arena);
    if (open && log?.tagName === "BUTTON") log.click();
    if (!open && log && log.tagName !== "BUTTON") [...log.querySelectorAll("button")].find((b) => /close/i.test(b.textContent))?.click();
  }
  function onDockToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const arena = docks.get(event.currentTarget.closest(".iw-raid-dock"));
    gameSkills(arena)?.querySelector('[data-iw-guild-role="effects-toggle"]')?.click();
  }
  function syncDockPanel(panel, open) {
    set(panel, "data-iw-raid-fold", open ? "open" : "closed");
    const head = panel.firstElementChild;
    set(head, "aria-expanded", String(open));
  }
  function dockPanel(key, title, glyph) {
    const panel = el("section", "iw-raid-dock-panel");
    panel.dataset.iwRaidDock = key;
    const head = el("button", "iw-raid-dock-head");
    head.type = "button";
    if (glyph) head.append(el("span", "iw-raid-dock-glyph", glyph));
    head.append(el("span", "iw-raid-dock-title", title), el("i", "iw-raid-dock-chevron"));
    head.addEventListener("click", onDockHead);
    panel.append(head, el("div", "iw-raid-dock-body"));
    return panel;
  }
  function fillLog(panel, arena) {
    const lines = logLines(gameLog(arena));
    const sig = lines.join("\n");
    if (dockSigs.get(panel) === sig) return;
    dockSigs.set(panel, sig);
    const body = panel.lastElementChild;
    const pinned = !body.firstChild || body.scrollHeight - body.scrollTop - body.clientHeight < 12;
    const top = body.scrollTop;
    body.replaceChildren(...(lines.length ? lines : ["The fight begins…"]).map((line) => el("p", "iw-raid-dock-line", line)));
    body.scrollTop = pinned ? body.scrollHeight : top;
  }
  function fillSkills(panel, arena) {
    const skills = gameSkills(arena);
    const toggle = skills?.querySelector('[data-iw-guild-role="effects-toggle"]');
    const rows = skills ? [...skills.children].filter((c) => c !== toggle && !c.hasAttribute(OWNED)) : [];
    const sig = `${toggle ? norm3(toggle.textContent) : ""}\0${rows.map((r) => `${r.className}|${r.textContent}`).join("")}`;
    if (dockSigs.get(panel) === sig) return;
    dockSigs.set(panel, sig);
    const body = panel.lastElementChild;
    const kids = rows.map((row) => {
      const copy = copyOf(row);
      for (const attr of ["data-iw-raid-fx-kind", "data-iw-raid-resist-step"]) if (row.hasAttribute(attr)) copy.setAttribute(attr, row.getAttribute(attr));
      return copy;
    });
    if (toggle) {
      const more = el("button", "iw-raid-dock-more", norm3(toggle.querySelector("span")?.textContent || toggle.textContent).replace(/^\(|\)$/g, ""));
      more.type = "button";
      more.addEventListener("click", onDockToggle);
      kids.push(more);
    }
    body.replaceChildren(...kids);
  }
  function dockAnchor(arena) {
    for (let sib = arena.nextElementSibling; sib; sib = sib.nextElementSibling) {
      if (sib.matches('[data-iw-guild-card="chat"]')) return sib;
    }
    return arena;
  }
  function decorateDock(arena) {
    const parent = arena.parentElement;
    if (!parent) return;
    const hasLog = !!gameLog(arena);
    const hasSkills = !!gameSkills(arena);
    let dock = [...parent.querySelectorAll(`:scope > .iw-raid-dock[${OWNED}]`)].find((d) => docks.get(d) === arena);
    if (!hasLog && !hasSkills) {
      dock?.remove();
      return;
    }
    if (!dock) {
      dock = el("div", "iw-raid-dock");
      dock.append(dockPanel("log", "Combat log"), dockPanel("skills", "Raid skills", "⚡"));
      docks.set(dock, arena);
    }
    const anchor2 = dockAnchor(arena);
    if (anchor2.nextElementSibling !== dock) anchor2.after(dock);
    const [logPanel, skillsPanel] = dock.children;
    for (const [panel, present, fill] of [[logPanel, hasLog, fillLog], [skillsPanel, hasSkills, fillSkills]]) {
      const open = folds.get(panel.dataset.iwRaidDock) === true;
      set(panel, "hidden", present ? null : "");
      syncDockPanel(panel, open);
      if (present && open) fill(panel, arena);
    }
  }
  function pruneRaidDocks(root) {
    for (const dock of root?.querySelectorAll?.(`.iw-raid-dock[${OWNED}]`) || []) {
      const arena = docks.get(dock);
      if (!arena || !arena.isConnected || !root.contains(arena)) dock.remove();
    }
  }
  function decorateRaidHud(arena) {
    set(arena, "data-iw-raid-hud", "1");
    set(arena, "data-iw-raid-scene-less", arena.hasAttribute("data-iw-raid-scene") ? null : "1");
    decorateBoss(arena);
    decorateCast(arena);
    const raid = readRaidEffects(arena);
    raid.shared.push(...previewEffects());
    const party = decorateRaiders(arena, raid);
    decorateTimers(arena, raid, party);
    decorateDock(arena);
  }
  function refreshRaidText(parents) {
    const arenas = /* @__PURE__ */ new Set();
    for (const parent of parents) {
      const arena = parent?.closest?.("[data-iw-raid-hud]");
      if (arena && !parent.closest(`[${OWNED}]`)) arenas.add(arena);
    }
    for (const arena of arenas) decorateRaidHud(arena);
  }
  function clearRaidHud(root) {
    if (!root) return;
    root.querySelectorAll(`[${OWNED}]`).forEach((node2) => node2.remove());
    for (const attr of HUD_ATTRS) {
      if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
      root.querySelectorAll(`[${attr}]`).forEach((node2) => node2.removeAttribute(attr));
    }
  }

  // src/modules/GuildPanels.js
  var norm4 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var label2 = (value) => norm4(value).replace(/^[^\p{L}\p{N}]+/u, "");
  var ROLE = "data-iw-guild-role";
  var ATTRS = ["data-iw-guild", "data-iw-guild-card", ROLE, "data-iw-guild-tone", "data-iw-guild-state"];
  function mark3(el2, key, value) {
    if (!el2) return;
    if (value == null) {
      if (el2.hasAttribute(key)) el2.removeAttribute(key);
      return;
    }
    if (el2.getAttribute(key) !== value) el2.setAttribute(key, value);
  }
  var role = (el2, value) => mark3(el2, ROLE, value);
  function toneOf2(el2) {
    const cls = String(el2?.className || "");
    if (/(?:^|\s)(?:[a-z]+:)?(?:bg|border|text)-(?:emerald|green|lime)-/.test(cls)) return "good";
    if (/(?:^|\s)(?:[a-z]+:)?(?:bg|border|text)-(?:rose|red)-/.test(cls)) return "bad";
    if (/(?:^|\s)(?:bg|border|text)-(?:amber|yellow|orange)-/.test(cls)) return "warn";
    if (/(?:^|\s)(?:bg|border|text)-(?:sky|blue|cyan|indigo)-/.test(cls)) return "info";
    if (/(?:^|\s)(?:bg|border|text)-ember\b/.test(cls)) return "accent";
    return null;
  }
  var tone = (el2, value = toneOf2(el2)) => mark3(el2, "data-iw-guild-tone", value);
  function selectedBy(el2, pattern) {
    return pattern.test(String(el2?.className || ""));
  }
  function firstLine(card) {
    const p = card.querySelector("p");
    return p ? label2(p.textContent) : "";
  }
  function decorateHead(root, heading) {
    if (!heading) return;
    let head = heading;
    while (head.parentElement && head.parentElement !== root) head = head.parentElement;
    if (head.parentElement !== root) return;
    role(head, "head");
    for (const span of heading.querySelectorAll(":scope > span")) {
      if (/^(beta|alpha|new)$/i.test(norm4(span.textContent))) role(span, "badge");
    }
    for (const p of head.querySelectorAll("p")) {
      if (!heading.contains(p)) role(p, "subtitle");
    }
    for (const span of head.querySelectorAll("span[title]")) {
      if (/guild points/i.test(span.title)) role(span, "points");
    }
    syncPartyPreviewToggle(root, head, decorateArena);
    for (const button2 of head.querySelectorAll("button")) {
      if (button2.hasAttribute("data-iw-collapse")) continue;
      role(button2, "head-link");
      mark3(button2, "data-iw-guild-tone", /^(leave|disband|kick|decline)\b/i.test(label2(button2.textContent)) ? "bad" : null);
    }
  }
  var READY_LABEL = /^(?:✓\s*)?(?:ready|not ready|unready|cancel ready|ready up)$/i;
  function cardKind(card) {
    const first = firstLine(card);
    const field = card.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');
    if (field && /^(?:invite\b|create a guild$)/i.test(first)) return "form";
    if (field) return "chat";
    if (/^pickup raid group$/i.test(first)) return "pickup";
    if (/^(?:all guilds|find a guild)$/i.test(first) && card.querySelector(":scope > button p")) return "directory";
    if (/^ready check\b/i.test(first)) return "ready-check";
    if (card.querySelector("select")) return "loadout";
    if (/^lend a tradeskill$/i.test(first)) return "lend";
    if (/^pre-raid prep$/i.test(first)) return "prep";
    if (/^leaderboard\b/i.test(first)) return "leaderboard";
    if (/^members$/i.test(first)) return "members";
    if ([...card.querySelectorAll("button[title]")].filter((b) => /,\s*the\s/i.test(b.title)).length >= 2) return "boss";
    const buttons = [...card.querySelectorAll("button")];
    const toggles = buttons.filter((b) => READY_LABEL.test(label2(b.textContent)));
    if (toggles.length === 1 && buttons.every((b) => toggles.includes(b) || /^start raid\b/i.test(label2(b.textContent)))) return "ready";
    return "generic";
  }
  function decorateBoss2(card) {
    const pills = [...card.querySelectorAll("button[title]")].filter((b) => /,\s*the\s/i.test(b.title));
    role(pills[0]?.parentElement, "boss-tabs");
    for (const pill of pills) {
      role(pill, "boss-tab");
      mark3(pill, "data-iw-guild-state", selectedBy(pill, /(?:^|\s)bg-ember(?:\s|$)/) ? "selected" : null);
    }
    const difficulties = [...card.querySelectorAll("button")].filter((b) => !pills.includes(b) && /\b(practice|normal|hard|heroic|mythic)\b/i.test(label2(b.textContent)));
    role(difficulties[0]?.parentElement, "difficulties");
    for (const button2 of difficulties) {
      role(button2, "difficulty");
      mark3(
        button2,
        "data-iw-guild-state",
        selectedBy(button2, /(?:^|\s)border-ember(?:\s|$)/) ? "selected" : /🔒/u.test(button2.textContent) || button2.disabled ? "locked" : null
      );
    }
    for (const p of card.querySelectorAll(":scope > p")) {
      const cls = String(p.className);
      if (/\bitalic\b/.test(cls)) role(p, "lore");
      else if (/\btext-sm\b/.test(cls) && /\bfont-semibold\b/.test(cls)) role(p, "boss-name");
      else {
        role(p, "line");
        tone(p);
      }
    }
    for (const box of card.querySelectorAll(":scope > div")) {
      if (box === pills[0]?.parentElement || box === difficulties[0]?.parentElement) continue;
      if (/\bborder\b/.test(String(box.className))) {
        role(box, "notice");
        tone(box);
      }
    }
  }
  function decorateLeaderboard(card) {
    role(card.querySelector(":scope > p"), "card-title");
    for (const row of card.querySelectorAll("button")) {
      role(row, "lb-row");
      const name = row.firstElementChild;
      mark3(name, "data-iw-guild-tone", selectedBy(name, /(?:^|\s)text-ember(?:\s|$)/) ? "accent" : null);
    }
  }
  function decorateRosterRow(row) {
    for (const el2 of row.querySelectorAll("span, div")) {
      const text = label2(el2.textContent);
      const cls = String(el2.className || "");
      if (!el2.childElementCount && /^ready$/i.test(text)) {
        role(el2, "ready-badge");
        tone(el2);
      } else if (!el2.childElementCount && /^not ready$/i.test(text)) role(el2, "not-ready");
      else if (!el2.childElementCount && !text && /\brounded-full\b/.test(cls) && /\bh-1\.5\b/.test(cls)) {
        role(el2, "dot");
        mark3(el2, "data-iw-guild-state", toneOf2(el2) === "good" ? "online" : null);
      } else if (/guild points/i.test(el2.title)) role(el2, "points");
      else if (/skill level/i.test(el2.title)) {
        role(el2, "chip");
        tone(el2);
      } else if (el2.tagName === "DIV" && /\bborder-sky-/.test(cls) && /\brounded-lg\b/.test(cls)) role(el2, "lend-pill");
    }
    for (const button2 of row.querySelectorAll("button")) {
      const picker = button2.closest(".relative")?.querySelector("button");
      if (/^kick\b/i.test(button2.title)) role(button2, "kick");
      else if (picker && picker !== button2) {
        role(button2, "option");
        mark3(button2, "data-iw-guild-state", toneOf2(button2) === "info" || button2.getAttribute("aria-selected") === "true" ? "selected" : null);
      } else if (/\bborder-sky-/.test(String(button2.className))) role(button2, "picker");
      else role(button2, "member-name");
    }
  }
  function decorateMembers(card) {
    const head = card.querySelector(":scope > div");
    role(head, "card-head");
    role(head?.querySelector("p"), "card-title");
    for (const p of head ? head.querySelectorAll("p") : []) if (p !== head.querySelector("p")) role(p, "card-count");
    for (const row of card.querySelectorAll("div")) {
      const cls = String(row.className || "");
      if (!/\brounded-lg\b/.test(cls) || !row.querySelector("button")) continue;
      if (row.parentElement?.closest('[data-iw-guild-role="member"], [data-iw-guild-role="guest"]')) continue;
      const guest = /\bbg-sky-/.test(cls);
      role(row, guest ? "guest" : "member");
      decorateRosterRow(row);
    }
    for (const p of card.querySelectorAll("p")) {
      if (/^raid guests\b/i.test(label2(p.textContent))) {
        role(p, "subhead");
        role(p.parentElement !== card ? p.parentElement : null, "guests");
      }
    }
  }
  function decorateLend(card) {
    role(card.querySelector(":scope > p"), "card-title");
    const buttons = [...card.querySelectorAll("button")];
    role(buttons[0], "picker");
    for (const option of buttons.slice(1)) {
      role(option, "option");
      mark3(option, "data-iw-guild-state", toneOf2(option) === "info" || option.getAttribute("aria-selected") === "true" ? "selected" : null);
    }
  }
  function decoratePrep(card) {
    role(card.querySelector(":scope > p"), "card-title");
    for (const p of card.querySelectorAll(":scope > p")) if (toneOf2(p)) {
      role(p, "line");
      tone(p);
    }
    for (const button2 of card.querySelectorAll("button")) {
      role(button2, "drink");
      role(button2.parentElement !== card ? button2.parentElement : null, "potion");
    }
  }
  function decorateLoadout(card) {
    role(card.querySelector(":scope > p"), "card-title");
    role(card.querySelector("select"), "select");
    for (const button2 of card.querySelectorAll("button")) role(button2, "cta");
  }
  function decorateReady(card) {
    for (const button2 of card.querySelectorAll("button")) {
      if (!READY_LABEL.test(label2(button2.textContent))) {
        role(button2, "start");
        continue;
      }
      role(button2, "ready-toggle");
      mark3(button2, "data-iw-guild-state", toneOf2(button2) === "good" ? "ready" : null);
    }
    for (const p of card.querySelectorAll(":scope > p")) role(p, "note");
  }
  function decorateForm(card) {
    const field = card.querySelector("input, textarea");
    const head = card.querySelector(":scope > div:first-child");
    if (head && !head.contains(field)) {
      role(head, "card-head");
      role(head.querySelector("p"), "card-title");
      for (const span of head.querySelectorAll(":scope > span")) role(span, "card-count");
    } else role(card.querySelector(":scope > p"), "card-title");
    for (const p of card.querySelectorAll(":scope > p")) if (!p.hasAttribute(ROLE)) role(p, "note");
    role(field, "field");
    const composer = [...card.querySelectorAll(":scope > div")].find((div) => div.contains(field) && div.querySelector("button"));
    role(composer, "composer");
    for (const button2 of composer ? composer.querySelectorAll("button") : []) role(button2, "cta");
  }
  function decoratePickup(card) {
    const ps = card.querySelectorAll("p");
    role(ps[0], "card-title");
    for (const p of [...ps].slice(1)) role(p, "note");
    for (const button2 of card.querySelectorAll("button")) role(button2, "cta");
  }
  function decorateDirectory(card) {
    const toggle = card.querySelector(":scope > button");
    role(toggle, "disclosure");
    role(toggle?.querySelector("p"), "card-title");
    for (const span of toggle ? toggle.querySelectorAll(":scope > span") : []) role(span, "disclosure-hint");
    for (const p of card.querySelectorAll(":scope > p")) role(p, "note");
    const list = [...card.querySelectorAll(":scope > div")].find((div) => /\boverflow-y-auto\b/.test(String(div.className)));
    role(list, "directory");
    for (const row of list ? list.children : []) {
      role(row, "guild-row");
      mark3(row, "data-iw-guild-state", /\S\s+\S/.test(String(row.className).trim()) || row.children.length > 1 ? "open" : null);
      const line = row.firstElementChild;
      for (const button2 of line ? line.querySelectorAll(":scope > button") : []) {
        if (button2.querySelector("span")) role(button2, "guild-name");
        else {
          role(button2, "apply");
          tone(button2);
        }
      }
      for (const span of line ? line.querySelectorAll(":scope > span") : []) {
        role(span, /guild points/i.test(span.title) ? "points" : "capacity");
      }
    }
  }
  function decorateReadyCheck(card) {
    mark3(card, "data-iw-guild-tone", toneOf2(card) || "warn");
    const head = card.querySelector(":scope > div");
    role(head, "card-head");
    role(head?.querySelector("p"), "rc-title");
    role(head?.querySelector("span"), "rc-timer");
    for (const p of card.querySelectorAll(":scope > p")) role(p, "rc-roster");
    for (const el2 of card.querySelectorAll(":scope > div:not(:first-child) span")) tone(el2);
    for (const button2 of card.querySelectorAll("button")) {
      role(button2, "rc-action");
      tone(button2);
    }
  }
  function decorateChat(card) {
    role(card.querySelector(":scope > p"), "card-title");
    for (const p of card.querySelectorAll(":scope > p")) if (p !== card.querySelector(":scope > p")) role(p, "note");
    const input = card.querySelector("input, textarea");
    role(input, "chat-input");
    const composer = input?.parentElement !== card ? input?.parentElement : null;
    role(composer, "composer");
    for (const button2 of composer ? composer.querySelectorAll("button") : []) role(button2, "cta");
    for (const box of card.querySelectorAll(":scope > div")) {
      if (box !== composer && /\boverflow-y-auto\b/.test(String(box.className))) role(box, "chat-feed");
    }
  }
  var DECORATORS = {
    boss: decorateBoss2,
    leaderboard: decorateLeaderboard,
    members: decorateMembers,
    lend: decorateLend,
    prep: decoratePrep,
    loadout: decorateLoadout,
    ready: decorateReady,
    "ready-check": decorateReadyCheck,
    chat: decorateChat,
    form: decorateForm,
    pickup: decoratePickup,
    directory: decorateDirectory
  };
  function isTrack2(el2) {
    const fill = el2.children.length === 1 ? el2.firstElementChild : null;
    return !!fill && /%$/.test(String(fill.style?.width || ""));
  }
  function decorateArena(arena) {
    role(arena, "arena");
    reconcileAshmawScene(arena);
    reconcileThessalyScene(arena);
    reconcileMorwennaScene(arena);
    reconcileGrimjawScene(arena);
    reconcileSkarthScene(arena);
    const boss = arena.querySelector('img[src*="boss-"],img[alt^="Ashmaw"],img[alt^="Thessaly"],img[alt^="Morwenna"],img[alt^="Grimjaw"],img[alt^="Skarth"]');
    if (boss?.parentElement?.parentElement !== arena) role(boss?.parentElement?.parentElement, "boss-summary");
    for (const panel of arena.querySelectorAll(".raid-readable-panel")) {
      if (panel.tagName === "BUTTON" || panel.parentElement !== arena && panel.parentElement?.parentElement === arena) {
        role(panel, "combat-log");
        if (panel.parentElement !== arena && panel.parentElement?.parentElement === arena) role(panel.parentElement, "combat-log-region");
        continue;
      }
      const gameButtons = panel.querySelectorAll("button:not([data-iw-raid-owned])");
      role(panel, gameButtons.length ? "effects" : "telegraph");
      tone(panel, gameButtons.length ? "info" : toneOf2(panel));
      for (const button2 of gameButtons) role(button2, "effects-toggle");
    }
    for (const track of arena.querySelectorAll("div")) {
      if (!isTrack2(track) || track.closest(".raid-arena-floor")) continue;
      role(track, "boss-hp");
    }
    syncPartyPreview(arena);
    for (const raider of arena.querySelectorAll(".raid-arena-floor > button, .raid-arena-floor > div")) {
      role(raider, "raider");
      const tracks = [...raider.querySelectorAll(":scope > div")].filter(isTrack2);
      role(tracks[0], "raider-hp");
      role(tracks[1], "raider-charge");
      const plates = raider.querySelectorAll(":scope > p");
      role(plates[0], "raider-name");
      role(plates[1], "raider-skill");
    }
    for (const p of arena.querySelectorAll(":scope > p")) role(p, "status");
    for (const box of arena.querySelectorAll(":scope > div:not(.raid-arena-floor):not([data-iw-raid-owned])")) {
      const current = box.getAttribute(ROLE);
      if (current && current !== "actions" && current !== "outcome") continue;
      if (box.matches("[data-iw-ashmaw-art], [data-iw-thessaly-art], [data-iw-morwenna-art], [data-iw-grimjaw-art], [data-iw-skarth-art]")) continue;
      const kids = [...box.children];
      if (kids.length && kids.every((k) => k.tagName === "BUTTON")) {
        role(box, "actions");
        tone(box, null);
        for (const button2 of kids) role(button2, "action");
      } else if (box.querySelector(":scope > p")) {
        role(box, "outcome");
        tone(box);
        for (const button2 of box.querySelectorAll(":scope > button")) role(button2, "outcome-close");
      }
    }
    decorateRaidHud(arena);
  }
  var signatures2 = /* @__PURE__ */ new WeakMap();
  function decorateGuildPanel({ root, heading }) {
    pruneAshmawScenes();
    pruneThessalyScenes();
    pruneMorwennaScenes();
    pruneGrimjawScenes();
    pruneSkarthScenes();
    mark3(root, "data-iw-guild", "root");
    decorateHead(root, heading);
    for (const card of root.querySelectorAll(".compact-panel")) {
      if (card.querySelector(".compact-panel")) continue;
      const sig = `${card.textContent}\0${[...card.querySelectorAll('button, span, div[class*="border"]')].map((el2) => el2.className).join("|")}`;
      if (signatures2.get(card) === sig && card.hasAttribute("data-iw-guild-card")) continue;
      signatures2.set(card, sig);
      const kind2 = cardKind(card);
      mark3(card, "data-iw-guild-card", kind2);
      DECORATORS[kind2]?.(card);
    }
    for (const arena of root.querySelectorAll(".raid-battle-backdrop")) decorateArena(arena);
    pruneRaidDocks(root);
  }
  function clearGuildPanel(root) {
    if (!root) return;
    clearAshmawScenes(root);
    clearThessalyScenes(root);
    clearMorwennaScenes(root);
    clearGrimjawScenes(root);
    clearSkarthScenes(root);
    clearRaidPartyPreview(root);
    clearRaidHud(root);
    for (const attr of ATTRS) {
      if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
      root.querySelectorAll(`[${attr}]`).forEach((el2) => el2.removeAttribute(attr));
    }
  }

  // src/modules/CollapsibleFrames.js
  var FRAME = '[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]';
  var STORE_KEY2 = "iw-collapsed-frames";
  var preferences = null;
  var loading2 = null;
  var touched2 = /* @__PURE__ */ new Set();
  function normText3(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function labelText(el2) {
    return normText3(el2?.textContent).replace(/^[^\p{L}\p{N}]+/u, "");
  }
  function nameText(el2) {
    const own2 = [...el2?.childNodes || []].filter((n) => n.nodeType === 3).map((n) => n.data).join("");
    return labelText({ textContent: own2 }) || labelText(el2);
  }
  function frameTitle(frame2, found = frameLandmarks(frame2)) {
    return found.sectionTitle || found.roleHeading || found.heading;
  }
  function frameLandmarks(frame2) {
    const found = { sectionTitle: null, roleHeading: null, heading: null, panel: null };
    for (const el2 of frame2.querySelectorAll('[data-iw-ui="section-title"], [role="heading"], h1, h2, h3, h4, [data-iw-panel]')) {
      if (!found.sectionTitle && el2.getAttribute("data-iw-ui") === "section-title") found.sectionTitle = el2;
      if (!found.roleHeading && el2.getAttribute("role") === "heading") found.roleHeading = el2;
      if (!found.heading && /^H[1-4]$/.test(el2.tagName)) found.heading = el2;
      if (!found.panel && el2.hasAttribute("data-iw-panel")) found.panel = el2;
    }
    return found;
  }
  function headOf(frame2, title) {
    let cur = title;
    while (cur && cur.parentElement && cur.parentElement !== frame2) cur = cur.parentElement;
    return cur?.parentElement === frame2 ? cur : null;
  }
  var spines = /* @__PURE__ */ new WeakMap();
  function markSpine(head, title) {
    if (spines.get(head) === title) return;
    spines.set(head, title);
    for (const stale of head.querySelectorAll("[data-iw-collapse-spine], [data-iw-collapse-title]")) {
      delete stale.dataset.iwCollapseSpine;
      delete stale.dataset.iwCollapseTitle;
    }
    if (title.dataset.iwCollapseTitle !== "1") title.dataset.iwCollapseTitle = "1";
    for (let cur = title; cur && cur !== head; cur = cur.parentElement) {
      if (cur.dataset.iwCollapseSpine !== "1") cur.dataset.iwCollapseSpine = "1";
    }
  }
  function collapseTarget(frame2) {
    const panel = frame2.closest?.(".panel");
    if (panel && !panel.querySelector(".panel")) return panel;
    return frame2;
  }
  function frameKey(target, title, found = frameLandmarks(target)) {
    const slug = target.dataset.iwPanel || found.panel?.dataset.iwPanel;
    if (slug) return `panel:${slug}`;
    const name = labelText(title).toLowerCase();
    return name ? `title:${name}` : null;
  }
  function loadPreferences2() {
    if (preferences) return loading2;
    preferences = /* @__PURE__ */ new Map();
    loading2 = storageGet(STORE_KEY2).then((bag) => {
      if (!bag || typeof bag !== "object") return;
      for (const [key, value] of Object.entries(bag)) {
        if (value === true && !touched2.has(key)) preferences.set(key, true);
      }
    }).catch((err) => warnOnce("collapse:load", err));
    return loading2;
  }
  function persist2() {
    const bag = {};
    for (const [key, value] of preferences) if (value) bag[key] = true;
    void storageSet(STORE_KEY2, bag);
  }
  function applyState(frame2, button2, key, name) {
    const collapsed = preferences.get(key) === true;
    const want = collapsed ? "1" : null;
    if ((frame2.dataset.iwCollapsed || null) !== want) {
      if (want) frame2.dataset.iwCollapsed = want;
      else delete frame2.dataset.iwCollapsed;
    }
    const expanded = collapsed ? "false" : "true";
    if (button2.getAttribute("aria-expanded") !== expanded) button2.setAttribute("aria-expanded", expanded);
    const label4 = `${collapsed ? "Expand" : "Collapse"} ${name}`;
    if (button2.getAttribute("aria-label") !== label4) button2.setAttribute("aria-label", label4);
    if (button2.getAttribute("title") !== label4) button2.setAttribute("title", label4);
  }
  function ensureToggle(head, frame2, key, name) {
    let button2 = head.querySelector(":scope > [data-iw-collapse]");
    if (button2) return button2;
    button2 = document.createElement("button");
    button2.type = "button";
    button2.dataset.iwCollapse = "1";
    button2.setAttribute("aria-expanded", "true");
    button2.setAttribute("aria-label", `Collapse ${name}`);
    button2.setAttribute("title", `Collapse ${name}`);
    button2.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = preferences.get(key) !== true;
      preferences.set(key, next);
      touched2.add(key);
      persist2();
      applyState(frame2, button2, key, name);
    });
    head.append(button2);
    return button2;
  }
  function decorateCollapsibleFrames(root = document) {
    void loadPreferences2();
    const all = [...root.querySelectorAll(FRAME)];
    const frames = all.filter((frame2, i) => !(all[i + 1] && frame2.contains(all[i + 1])));
    const targets = new Set(frames.map(collapseTarget));
    const live2 = /* @__PURE__ */ new Set();
    for (const target of targets) {
      const found = frameLandmarks(target);
      const title = frameTitle(target, found);
      const head = title ? headOf(target, title) : null;
      const key = frameKey(target, title, found);
      if (!key || !head) continue;
      if (head.dataset.iwCollapseHead !== "1") head.dataset.iwCollapseHead = "1";
      markSpine(head, title);
      const name = nameText(title) || "section";
      const button2 = ensureToggle(head, target, key, name);
      live2.add(button2);
      applyState(target, button2, key, name);
    }
    for (const button2 of root.querySelectorAll("[data-iw-collapse]")) {
      const head = button2.parentElement;
      if (live2.has(button2) || targets.has(head?.parentElement)) continue;
      button2.remove();
      if (head) {
        delete head.dataset.iwCollapseHead;
        spines.delete(head);
        head.querySelectorAll("[data-iw-collapse-spine], [data-iw-collapse-title]").forEach((el2) => {
          delete el2.dataset.iwCollapseSpine;
          delete el2.dataset.iwCollapseTitle;
        });
      }
      const frame2 = head?.parentElement;
      if (frame2) delete frame2.dataset.iwCollapsed;
    }
  }
  function clearCollapsibleFrames(root = document) {
    root.querySelectorAll("[data-iw-collapse]").forEach((el2) => {
      el2.remove();
    });
    root.querySelectorAll("[data-iw-collapsed]").forEach((el2) => {
      delete el2.dataset.iwCollapsed;
    });
    root.querySelectorAll("[data-iw-collapse-head]").forEach((el2) => {
      delete el2.dataset.iwCollapseHead;
    });
    root.querySelectorAll("[data-iw-collapse-spine]").forEach((el2) => {
      delete el2.dataset.iwCollapseSpine;
    });
    root.querySelectorAll("[data-iw-collapse-title]").forEach((el2) => {
      delete el2.dataset.iwCollapseTitle;
    });
    preferences = null;
    loading2 = null;
    touched2.clear();
  }

  // src/modules/HeaderChrome.js
  var ROLE2 = "data-iw-chrome";
  var MAX_NOTICE_CHARS = 260;
  var resolution = null;
  function setRole3(el2, role2) {
    if (el2.getAttribute(ROLE2) !== role2) el2.setAttribute(ROLE2, role2);
  }
  function clearMarks() {
    document.querySelectorAll(`[${ROLE2}]`).forEach((el2) => {
      el2.removeAttribute(ROLE2);
    });
  }
  function norm5(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }
  function looksLikeShell(el2) {
    return !!el2 && el2.querySelector(":scope > header");
  }
  function resolutionValid() {
    if (!resolution) return false;
    const { shell, nav, notice, zone, zoneText, zoneActions } = resolution;
    if (!shell?.isConnected || !nav?.isConnected || !zone?.isConnected) return false;
    if (!zoneText?.isConnected || !zoneActions?.isConnected) return false;
    if (notice && !notice.isConnected) return false;
    if (nav.getAttribute(ROLE2) !== "nav") return false;
    if (zone.getAttribute(ROLE2) !== "zone-bar") return false;
    return true;
  }
  function elementChildren(el2) {
    return [...el2.children];
  }
  function resolve() {
    const zoneCandidates = [...document.querySelectorAll('[data-iw-ui="zone-bar"]')];
    const zone = pickRendered(zoneCandidates);
    if (!zone) {
      clearMarks();
      resolution = null;
      return;
    }
    const shell = zone.parentElement;
    if (!looksLikeShell(shell)) {
      clearMarks();
      resolution = null;
      return;
    }
    const siblings = elementChildren(shell);
    const zoneIndex = siblings.indexOf(zone);
    if (zoneIndex < 1) {
      clearMarks();
      resolution = null;
      return;
    }
    let nav = null;
    for (let i = zoneIndex - 1; i >= 0; i -= 1) {
      const candidate = siblings[i];
      if (candidate.tagName === "HEADER") break;
      if (candidate.querySelector('[data-iw-ui="nav-tab"]') || candidate.matches('[data-iw-ui="nav-tab"]')) {
        nav = candidate;
        break;
      }
    }
    if (!nav) {
      clearMarks();
      resolution = null;
      return;
    }
    const navIndex = siblings.indexOf(nav);
    const between = siblings.slice(navIndex + 1, zoneIndex);
    if (between.length > 1) {
      clearMarks();
      resolution = null;
      return;
    }
    const notice = between[0] || null;
    if (notice) {
      if (notice.classList.contains("panel")) {
        clearMarks();
        resolution = null;
        return;
      }
      const text = norm5(notice.textContent);
      if (!text || text.length > MAX_NOTICE_CHARS) {
        clearMarks();
        resolution = null;
        return;
      }
    }
    const zoneChildren = elementChildren(zone);
    if (zoneChildren.length !== 2) {
      clearMarks();
      resolution = null;
      return;
    }
    const zoneText = zoneChildren.find((c) => c.querySelector('[data-iw-ui="zone-title"]') || c.matches('[data-iw-ui="zone-title"]'));
    const zoneActions = zoneChildren.find((c) => c !== zoneText && c.querySelector('[data-iw-ui="zone-action"]'));
    if (!zoneText || !zoneActions) {
      clearMarks();
      resolution = null;
      return;
    }
    const roles = /* @__PURE__ */ new Map([
      [shell, "shell"],
      [nav, "nav"],
      [zone, "zone-bar"],
      [zoneText, "zone-text"],
      [zoneActions, "zone-actions"]
    ]);
    if (notice) roles.set(notice, "notice");
    document.querySelectorAll(`[${ROLE2}]`).forEach((el2) => {
      if (!roles.has(el2)) el2.removeAttribute(ROLE2);
    });
    roles.forEach((role2, el2) => setRole3(el2, role2));
    resolution = { shell, nav, notice, zone, zoneText, zoneActions };
  }
  function classifyHeaderChrome() {
    if (resolutionValid()) {
      const { shell, nav, zone } = resolution;
      const siblings = elementChildren(shell);
      const between = siblings.slice(siblings.indexOf(nav) + 1, siblings.indexOf(zone));
      const notice = between.length === 1 ? between[0] : null;
      if (notice !== resolution.notice) resolve();
      return;
    }
    resolve();
  }
  function clearHeaderChrome() {
    clearMarks();
    resolution = null;
  }

  // src/modules/arcaneCacheRewards.js
  var reward = (id, name, quantity, rarity, kind2, itemId, effects, requirement = "") => Object.freeze({
    id,
    name,
    quantity,
    rarity,
    kind: kind2,
    icon: Object.freeze({ id: itemId, name }),
    item: Object.freeze({ item_id: itemId, name, effects_raw: effects, req_text: requirement })
  });
  var ARCANE_CACHE_REWARDS = Object.freeze([
    reward("essence", "Revenant Essence", 120, "common", "resource", "revenant_essence", "Trade Good"),
    reward("moonstone", "Cut Moonstone", 3, "rare", "resource", "cut_moonstone", "Socket effect: +6 Frost Resist"),
    reward(
      "effigy",
      "Arcane Effigy",
      1,
      "epic",
      "item",
      "arcane_effigy",
      "XP +12/task, +8% 2x gather chance, +10% gold find, +8% item find"
    )
  ]);
  var GOLD = reward("gold", "Gold", 250, "common", "currency", null, "Currency");
  var CLAW = reward("claw", "Night Claw", 20, "common", "resource", "night_claw", "Trade Good");
  var BONUS = Object.freeze([
    reward("copper-potion", "Copper XP Potion", 1, "uncommon", "item", "copper_xp_potion", "+1 XP/task for 1h"),
    ARCANE_CACHE_REWARDS[1],
    reward("celestium-sword", "Celestium Sword", 1, "rare", "item", "celestium_sword", "ATK +48, 1 Socket", "Requires Combat Lv 37"),
    reward("celestium-ring", "Celestium Ring", 1, "rare", "item", "celestium_ring", "ATK +17 • DEF +12, XP +12/task, +24% 2x gather chance", "Requires Lv 37 (any skill)"),
    reward("celestium-amulet", "Celestium Amulet", 1, "rare", "item", "celestium_amulet", "ATK +17 • DEF +12, XP +12/task, +24% 2x gather chance", "Requires Lv 37 (any skill)"),
    reward("bloodstone-sword", "Bloodstone Sword", 1, "epic", "item", "bloodstone_sword", "ATK +52, 1 Socket", "Requires Combat Lv 41"),
    ARCANE_CACHE_REWARDS[2],
    reward("bloodstone-amulet", "Bloodstone Amulet", 1, "legendary", "item", "bloodstone_amulet", "ATK +18 • DEF +13, XP +13/task, +26% 2x gather chance", "Requires Lv 41 (any skill)")
  ]);
  var RARITY = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  function rollCacheRewards(count, random = Math.random) {
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError("Choose 1–100 demo caches.");
    if (count === 1) return ARCANE_CACHE_REWARDS.map((entry2) => ({ ...entry2 }));
    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push({ ...GOLD, quantity: 250 + Math.floor(random() * 751) });
      const material = random() < 0.5 ? ARCANE_CACHE_REWARDS[0] : CLAW;
      rolls.push({ ...material, quantity: 20 + Math.floor(random() * 61) });
      rolls.push({ ...BONUS[Math.min(BONUS.length - 1, Math.floor(random() * BONUS.length))] });
    }
    return rolls;
  }
  function groupCacheRewards(rolls, bulk = false) {
    const unique = /* @__PURE__ */ new Map();
    for (const entry2 of rolls) {
      const existing = unique.get(entry2.id);
      if (existing) existing.quantity += entry2.quantity;
      else unique.set(entry2.id, { ...entry2 });
    }
    const cards = [], list = [];
    for (const entry2 of unique.values()) {
      const featured = !bulk || entry2.kind === "item" && (RARITY[entry2.rarity] ?? 0) >= RARITY.rare;
      (featured ? cards : list).push(entry2);
    }
    if (bulk) cards.sort((a, b) => RARITY[b.rarity] - RARITY[a.rarity] || a.name.localeCompare(b.name));
    list.sort((a, b) => Number(b.kind === "currency") - Number(a.kind === "currency"));
    return { cards, list };
  }
  function cacheItemDetails(reward2, liveItem) {
    const item = liveItem || reward2.item || {};
    const requirement = String(item.req_text || (item.req_level ? `Requires ${String(item.req_skill).toLowerCase() === "any" ? "" : `${item.req_skill || "skill"} `}Lv ${item.req_level}${String(item.req_skill).toLowerCase() === "any" ? " (any skill)" : ""}` : "")).trim();
    const description = String(item.effects_raw || item.description || "").replace(requirement || /$^/, "").replace(/[\u0000-\u001f\u007f]+/g, " • ").replace(/([,•])\s*[,•]/g, "$1").replace(/^[\s,•]+|[\s,•]+$/g, "").replace(/\s{2,}/g, " ").trim();
    return { description, requirement };
  }
  function cacheStatLines(description) {
    return String(description ?? "").split(/[•;\r\n]+|,(?!\d{3}(?:\D|$))/).map((line) => line.trim()).filter(Boolean);
  }

  // src/modules/ArcaneCacheLootView.js
  var node = (tag, className, text) => {
    const el2 = document.createElement(tag);
    el2.className = className;
    if (text !== void 0) el2.textContent = text;
    return el2;
  };
  var number = (value) => value.toLocaleString("en-US");
  function createCacheLootView(announce) {
    const rewards2 = node("ul", "rewards");
    rewards2.setAttribute("aria-label", "Featured rewards");
    const empty = node("p", "no-featured", "Your haul is in the loot list below.");
    const summary = node("section", "loot-summary");
    empty.hidden = true;
    summary.hidden = true;
    const pager = node("nav", "reward-pager");
    pager.setAttribute("aria-label", "Reward pages");
    const previous = node("button", "page-prev", "‹");
    previous.type = "button";
    previous.setAttribute("aria-label", "Previous rewards");
    const pageLabel = node("span", "page-label");
    const next = node("button", "page-next", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Next rewards");
    pager.append(previous, pageLabel, next);
    const list = node("section", "loot-list");
    list.setAttribute("aria-label", "Loot list");
    const listHeading = node("h2", "", "Loot list");
    const commonGroup = node("section", "loot-group loot-common");
    commonGroup.setAttribute("aria-label", "Resources and supplies");
    const listRows = node("ul", "loot-rows");
    commonGroup.append(node("h3", "", "Resources & Supplies"), listRows);
    const rareGroup = node("section", "loot-group loot-rare");
    rareGroup.setAttribute("aria-label", "Rare loot");
    const rareRows = node("ul", "loot-rows");
    rareGroup.append(node("h3", "", "Rare Loot"), rareRows);
    list.append(listHeading, commonGroup, rareGroup);
    summary.append(pager, list);
    const narrow = matchMedia("(max-width: 640px)");
    let result = { cards: [], list: [] }, cards = [], icons = [], detailNodes = [];
    let page = 0, pageSize = narrow.matches ? 1 : 3, disposed = false;
    const refresh = () => {
      if (disposed) return;
      for (const { el: el2, entry: entry2 } of icons) {
        if (entry2.kind !== "currency" && AtlasService.paint(el2, entry2.icon)) el2.textContent = "";
      }
      for (const { entry: entry2, description, requirement } of detailNodes) {
        const details = cacheItemDetails(entry2, ItemDatabase.find(entry2.icon));
        const lines = cacheStatLines(details.description);
        description.replaceChildren(...(lines.length ? lines : ["No description listed."]).map((line) => node("li", "reward-stat", line)));
        requirement.textContent = details.requirement;
        requirement.hidden = !details.requirement;
      }
    };
    const showPage = (value, speak = false) => {
      const pages = Math.max(1, Math.ceil(cards.length / pageSize));
      page = Math.max(0, Math.min(value, pages - 1));
      const start2 = page * pageSize, shown = Math.min(pageSize, cards.length - start2);
      cards.forEach((card, index) => {
        card.hidden = index < start2 || index >= start2 + pageSize;
        if (!card.hidden) {
          card.style.setProperty("--slot", index - start2 - (shown - 1) / 2);
          card.style.setProperty("--order", index - start2);
        }
      });
      pageLabel.textContent = cards.length ? `${start2 + 1}–${start2 + shown} of ${cards.length} treasures` : "";
      previous.disabled = page === 0;
      next.disabled = page === pages - 1;
      pager.hidden = cards.length <= pageSize;
      if (speak) announce.textContent = pageLabel.textContent + ". " + result.cards.slice(start2, start2 + pageSize).map((x) => x.name).join(", ");
    };
    previous.addEventListener("click", () => showPage(page - 1, true));
    next.addEventListener("click", () => showPage(page + 1, true));
    const resize = () => {
      const first = page * pageSize;
      pageSize = narrow.matches ? 1 : 3;
      showPage(Math.floor(first / pageSize));
    };
    narrow.addEventListener("change", resize);
    document.addEventListener("iw:atlas-updated", refresh);
    document.addEventListener("iw:item-db-updated", refresh);
    AtlasService.ready().then(refresh).catch(() => {
    });
    return {
      rewards: rewards2,
      summary,
      empty,
      prepare(count) {
        result = groupCacheRewards(rollCacheRewards(count), count > 1);
        cards = [];
        icons = [];
        detailNodes = [];
        rewards2.replaceChildren();
        listRows.replaceChildren();
        rareRows.replaceChildren();
        rewards2.setAttribute("aria-hidden", "true");
        summary.hidden = true;
        empty.hidden = true;
        for (const entry2 of result.cards) {
          const card = node("li", "reward");
          card.dataset.rewardId = entry2.id;
          card.dataset.rarity = entry2.rarity;
          const face = node("article", "reward-face");
          const head = node("div", "reward-head");
          const icon2 = node("span", "reward-icon", "✦");
          icon2.setAttribute("aria-hidden", "true");
          const identity = node("div", "reward-identity");
          identity.append(node("h3", "", entry2.name), node("span", "sr-only", entry2.rarity));
          head.append(identity, node("span", "quantity", `×${number(entry2.quantity)}`));
          const art2 = node("div", "reward-art");
          art2.append(icon2);
          const description = node("ul", "reward-description");
          description.setAttribute("aria-label", "Item stats");
          const requirement = node("p", "reward-requirement");
          face.append(head, art2, description, requirement);
          card.append(face);
          cards.push(card);
          icons.push({ el: icon2, entry: entry2 });
          detailNodes.push({ entry: entry2, description, requirement });
          rewards2.append(card);
        }
        const listed = count > 1 ? result : groupCacheRewards(result.cards, true);
        for (const [entries, rows] of [[listed.list, listRows], [listed.cards, rareRows]]) {
          for (const entry2 of entries) {
            const row = node("li", "loot-row");
            row.dataset.rewardId = entry2.id;
            row.dataset.quantity = String(entry2.quantity);
            row.dataset.rarity = entry2.rarity;
            const icon2 = node("span", entry2.kind === "currency" ? "loot-icon gold-icon" : "loot-icon", entry2.kind === "currency" ? "✦" : "◆");
            icon2.setAttribute("aria-hidden", "true");
            row.append(icon2, node("span", "loot-name", entry2.name), node("span", "loot-quantity", `×${number(entry2.quantity)}`));
            rows.append(row);
            icons.push({ el: icon2, entry: entry2 });
          }
        }
        commonGroup.hidden = listed.list.length === 0;
        rareGroup.hidden = listed.cards.length === 0;
        list.hidden = commonGroup.hidden && rareGroup.hidden;
        showPage(0);
        refresh();
      },
      reveal() {
        rewards2.removeAttribute("aria-hidden");
        summary.hidden = false;
        empty.hidden = cards.length > 0;
        return [...result.cards, ...result.list].map((x) => `${x.name}, ${number(x.quantity)}`).join(". ");
      },
      dispose() {
        disposed = true;
        narrow.removeEventListener("change", resize);
        document.removeEventListener("iw:atlas-updated", refresh);
        document.removeEventListener("iw:item-db-updated", refresh);
      }
    };
  }

  // src/styles/arcane-cache.css
  var arcane_cache_default = ':host{display:block;color:#ede8d9;font-family:Barlow,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #b8f8ff;outline-offset:6px}.scene{--cyan: #78dbe6;--gold: #b9a274;--card-w: 230px;--card-gap: 24px;--chest-size: 420px;--chest-top: -20px;--stage-h: 460px;--card-y: 24px;--card-h: 340px;--settle-scale: .52;--settle-top: calc(var(--card-y) + var(--card-h) + 16px);--settle-y: calc(var(--settle-top) - var(--chest-top) - var(--chest-size) * .79 * (1 - var(--settle-scale)));--stage-size: max(var(--stage-h), calc(var(--settle-top) + var(--chest-size) * var(--settle-scale) + 24px));position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding:55px 20px 36px;overflow:hidden;background:radial-gradient(ellipse at 50% 55%,#10232977,transparent 57%)}.exit{position:absolute;top:20px;right:24px;width:44px;height:44px;z-index:12;border:1px solid #8d9c9e44;border-radius:50%;background:#12202966;color:#bccdcc;font-size:27px;line-height:1;transition:background 150ms}.exit:hover{background:#28414d;color:#fff}.mast{position:relative;z-index:5;text-align:center;pointer-events:none}.overline{color:#b6a781;font-size:10px;letter-spacing:.32em;margin:0 0 13px}h1{font-family:Cinzel,Georgia,serif;font-weight:500;font-size:clamp(27px,4vw,42px);letter-spacing:.08em;line-height:1.2;margin:0;color:#f1e7cf;text-shadow:0 2px 15px #000}.status{min-height:20px;margin:13px 0 0;font-size:14px;letter-spacing:.025em;color:#9daeb3}.stage{position:relative;width:min(900px,100%);height:var(--stage-size);flex-shrink:0}.halo{position:absolute;width:490px;height:360px;top:35px;left:calc(50% - 245px);border-radius:50%;background:radial-gradient(ellipse,#4de4f52b,#367f8610 45%,transparent 70%);pointer-events:none}.seal{position:absolute;top:270px;left:calc(50% - 180px);width:360px;height:110px;border:1px solid #79e7e63d;border-radius:50%;box-shadow:0 0 22px #2adfee14,inset 0 0 20px #64edee10;pointer-events:none}.seal::before{content:"";position:absolute;inset:9px 26px;border:1px dashed #79e7e630;border-radius:50%}.seal span{position:absolute;color:#9fe4e399;font-size:14px}.seal span:nth-child(1){left:48%;bottom:-9px}.seal span:nth-child(2){left:-7px;top:36%}.seal span:nth-child(3){right:-7px;top:36%}.chest{position:absolute;top:var(--chest-top);left:calc(50% - var(--chest-size) / 2);width:var(--chest-size);height:var(--chest-size);z-index:3;transform-origin:50% 79%;pointer-events:none}.chest-sprite{position:absolute;inset:0;display:block;background-repeat:no-repeat;background-size:200% 100%;filter:drop-shadow(0 18px 18px #000b)}.chest-closed{background-position:0% 50%}.chest-open{background-position:100% 50%;opacity:0}.open-cache{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:6;color:#d8f5f4;background:linear-gradient(#19343b,#102025);border:1px solid #76c1c473;border-radius:3px;padding:13px 29px;font-family:Cinzel,Georgia,serif;letter-spacing:.09em;font-size:13px;white-space:nowrap;box-shadow:inset 0 0 0 3px #060d1166,0 0 26px #64dcdf09}.open-cache:hover{background:linear-gradient(#24474e,#163039);border-color:#b9eddf}.open-cache{bottom:calc(20px + var(--stage-size) - var(--stage-h))}.chest-hit-area{position:absolute;bottom:calc(100% + 40px);left:50%;transform:translateX(-50%);width:330px;height:275px;border-radius:30%}.open-cache:focus-visible .chest-hit-area{outline:1px solid #91f1f049}.tap-hint{position:absolute;bottom:77px;width:100%;text-align:center;font-size:9px;letter-spacing:.22em;color:#a2c9c8;pointer-events:none}.tap-hint{bottom:calc(77px + var(--stage-size) - var(--stage-h))}.actions{display:flex;justify-content:center;gap:12px;margin:12px 0 17px;z-index:8}.actions button{min-height:44px;border:1px solid #95a5a845;border-radius:3px;padding:10px 27px;font-size:12px;letter-spacing:.08em}.replay{color:#c9dedc;background:#15272c}.done{color:#eee2c6;background:#342e22;border-color:#aa916050!important}.actions button:hover{filter:brightness(1.3)}.footer{display:flex;gap:10px;align-items:center;font-size:11px;color:#7f8b93;letter-spacing:.035em;z-index:7;margin-top:12px}.demo-label{border:1px solid #8495983b;border-radius:2px;padding:3px 5px;font-size:8px;letter-spacing:.1em;color:#a6b1b4}.rewards{margin:0;padding:0;list-style:none;position:absolute;inset:0;pointer-events:none;z-index:7}.reward{--tone: #b3c4bf;position:absolute;top:var(--card-y);left:calc(50% - var(--card-w) / 2);width:var(--card-w);height:var(--card-h);opacity:0;transform:translateY(110px) scale(.12);pointer-events:auto}.reward[data-rarity=rare]{--tone: #74bfd6}.reward[data-rarity=epic]{--tone: #bb99e5}.reward[data-rarity=legendary]{--tone: #e2b86d}.reward[data-rarity=mythic]{--tone: #ef9ba0}.reward-face{position:relative;display:flex;flex-direction:column;height:100%;padding:12px;border:1px solid color-mix(in srgb,var(--tone) 46%,#514936);border-radius:4px;background:var(--cache-ground),linear-gradient(150deg,#211f1b,#0e1216);background-blend-mode:soft-light,normal;box-shadow:0 16px 35px #0008,inset 0 1px #d2b37930,0 0 26px color-mix(in srgb,var(--tone) 10%,transparent)}.reward-face::before{content:"";position:absolute;inset:0;border-style:solid;border-color:transparent;border-width:17px 16px;border-image:var(--cache-corners) 50% / 17px 16px / 0 stretch;pointer-events:none;opacity:.8}.reward-face::after{content:"";position:absolute;top:0;left:12px;right:12px;height:1px;background:linear-gradient(90deg,transparent,var(--tone),transparent)}.reward-head{display:flex;align-items:center;justify-content:center;min-height:34px;flex:none;text-align:center;padding-inline:5px}.reward-identity{min-width:0}.reward-art{position:relative;display:grid;place-items:center;flex:none;height:144px;margin:6px 0 10px;border:1px solid color-mix(in srgb,var(--tone) 24%,#232527);border-radius:2px;background:radial-gradient(ellipse,color-mix(in srgb,var(--tone) 18%,transparent),transparent 72%),linear-gradient(145deg,#11191be6,#070b0fe6);box-shadow:inset 0 0 24px #0009}.reward-art::before{content:"";position:absolute;width:106px;height:106px;border:1px solid color-mix(in srgb,var(--tone) 12%,transparent);border-radius:50%;box-shadow:0 0 0 7px #0b121345;pointer-events:none}.reward-icon{position:relative;display:block;width:128px;height:128px;color:var(--tone);font-size:74px;line-height:128px;text-align:center;filter:drop-shadow(0 5px 9px #000b)}h3{font-family:Cinzel,Georgia,serif;font-size:12px;font-weight:500;line-height:1.45;margin:0;color:#ede7d7;overflow-wrap:anywhere}.quantity{position:absolute;top:-10px;right:10px;padding:2px 7px;border:1px solid #9d917252;border-radius:2px;background:#14191c;font-size:12px;color:var(--tone);font-variant-numeric:tabular-nums}.reward-description{flex:1;min-height:0;list-style:none;padding:0 3px;margin:0;overflow:auto;scrollbar-width:thin;font-size:11px;line-height:1.45;color:#aaa89f}.reward-stat+.reward-stat{margin-top:3px}.reward-requirement{flex:none;font-size:10.5px;line-height:1.4;margin:8px 0 0;padding:7px 3px 0;border-top:1px solid #b9a27424;color:#b4a17a}.no-featured{position:absolute;inset:55px 0 auto;text-align:center;color:#b9c6c7;font-size:14px}.loot-summary{position:relative;width:min(700px,100%);z-index:8;margin-top:-10px}.reward-pager{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:16px;color:#c7c4b4;font-size:12px;letter-spacing:.04em}.reward-pager button{width:38px;height:34px;border:1px solid #a59b7844;color:#d8e5df;background:#172126;border-radius:3px;font-size:23px}.reward-pager button:disabled{opacity:.3;cursor:default}.loot-list{padding:15px 20px;border-block:1px solid #a59b7840;background:linear-gradient(90deg,transparent,#172126aa,transparent)}.loot-list h2{font-family:Cinzel,Georgia,serif;margin:0 0 12px;text-transform:uppercase;letter-spacing:.2em;font-size:12px;font-weight:500;color:#cab88c;text-align:center}.loot-group h3{margin:0 0 10px;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#a8aca8}.loot-group+.loot-group{margin-top:16px;padding-top:14px;border-top:1px solid #a59b7828}.loot-rare h3{color:#cab88c}.loot-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:7px;list-style:none;margin:0;padding:0}.loot-row{display:flex;gap:9px;align-items:center;min-width:0;font-size:12px;color:#bfc8c7}.loot-icon{width:28px;height:28px;flex:none;display:grid;place-items:center;color:#b1dcdd}.gold-icon{width:21px;height:21px;margin-inline:3.5px;border-radius:50%;background:linear-gradient(140deg,#e6cb80,#7e5427);border:2px solid #c09e50;color:#64451e;font-size:13px;box-shadow:inset 0 0 0 1px #604718}.loot-name{flex:1;min-width:0}.loot-quantity{flex:none;color:#dfd6b8;font-variant-numeric:tabular-nums}.batch-choice{position:absolute;top:100%;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);pointer-events:auto;display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;color:#a79873;font-size:9px;letter-spacing:.18em}.batch-size{font:12px Barlow,sans-serif;padding:6px 12px;border:1px solid #81734c70;border-radius:3px;background:#172126;color:#e0d8c4}.scene:not([data-phase=waiting]) .batch-choice{visibility:hidden}.burst-rays{position:absolute;top:215px;left:50%;width:1px;height:1px;opacity:0;z-index:2;pointer-events:none}.burst-rays i{position:absolute;bottom:0;left:-20px;width:40px;height:440px;transform-origin:50% 100%;transform:rotate(var(--angle));background:linear-gradient(0deg,#c0fff2a0,#75dbf020 65%,transparent);clip-path:polygon(45% 100%,0 0,100% 0,55% 100%)}.burst-runes{position:absolute;top:215px;left:50%;opacity:0;z-index:4;pointer-events:none}.burst-runes span{position:absolute;font-size:22px;color:#b4ecdd;text-shadow:0 0 14px #70ebff;transform:rotate(var(--angle)) translateY(-190px)}.flash{position:absolute;top:120px;left:calc(50% - 160px);width:320px;height:230px;z-index:5;border-radius:50%;background:radial-gradient(ellipse,#edfff5,#87f9fcb0 20%,#54eaff20 46%,transparent 70%);opacity:0;pointer-events:none}.shockwave{position:absolute;top:172px;left:calc(50% - 80px);width:160px;height:100px;z-index:4;border:2px solid #bafff2;box-shadow:0 0 20px #9cfcff88,inset 0 0 18px #9cfcff33;border-radius:50%;opacity:0;pointer-events:none}.motes{position:absolute;top:205px;left:50%;z-index:6;pointer-events:none}.motes i{position:absolute;display:block;width:4px;height:7px;background:#b6fff6;border-radius:1px;opacity:0;box-shadow:0 0 8px #7cf1ff}.motes i:nth-child(3n){width:3px;height:3px;background:#ead296;box-shadow:0 0 6px #fcd599}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[data-phase=loading] .chest,[data-phase=error] .chest{visibility:hidden}.scene:not([data-phase=waiting]) .open-cache,.scene:not([data-phase=waiting]) .tap-hint{visibility:hidden}.scene:not([data-phase=revealed]) .reward{pointer-events:none}[data-phase=dropping] .chest{animation:cache-drop var(--drop-duration) both}[data-phase=dropping] .seal{animation:cache-land var(--drop-duration) both}[data-phase=waiting] .chest{animation:cache-idle 3200ms ease-in-out infinite}[data-phase=waiting] .halo{animation:cache-breathe 3200ms ease-in-out infinite}[data-phase=waiting] .tap-hint{animation:cache-breathe 3200ms ease-in-out infinite}[data-phase=opening] .chest{animation:cache-open var(--open-duration) both}[data-phase=opening] .seal{animation:cache-seal-settle var(--open-duration) both}[data-phase=opening] .chest-closed{animation:cache-closed var(--open-duration) step-end both}[data-phase=opening] .chest-open{animation:cache-lid var(--open-duration) both}[data-phase=opening] .flash{animation:cache-flash 1150ms 660ms both}[data-phase=opening] .burst-rays{animation:cache-rays 1700ms 890ms both}[data-phase=opening] .burst-runes{animation:cache-runes 1350ms 1000ms both}[data-phase=opening] .shockwave{animation:cache-wave 800ms 980ms both}[data-phase=opening] .shockwave-echo{animation:cache-wave 1050ms 1180ms both;border-color:#e6cc87;transform:rotate(-14deg)}[data-phase=opening] .motes i{animation:cache-particle 1600ms var(--delay) cubic-bezier(.1,.7,.2,1) both}[data-phase=opening] .halo{animation:cache-charge 1600ms both}[data-phase=opening] .reward{animation:cache-fan 1750ms calc(1080ms + var(--order) * 70ms) both}[data-phase=revealed] .reward{opacity:1;transform:translateX(calc(var(--slot) * (var(--card-w) + var(--card-gap))))}[data-phase=revealed] .reward-face{animation:cache-float 4200ms calc(var(--order) * -1100ms) ease-in-out infinite}[data-phase=revealed] .chest{transform:translateY(var(--settle-y)) scale(var(--settle-scale));opacity:.85}[data-phase=revealed] .chest-closed{opacity:0}[data-phase=revealed] .chest-open{opacity:1}[data-phase=revealed] .seal{opacity:.35;transform:translateY(calc(var(--settle-y) - 60px))}@keyframes cache-drop{0%{transform:translateY(-80vh) scale(.96) rotate(-4deg);opacity:0;animation-timing-function:cubic-bezier(.12,.76,.24,1)}8%{opacity:1}88%{transform:translateY(0) scale(1) rotate(0);animation-timing-function:ease-out}94%{transform:translateY(3px) scale(1.025,.975)}100%{transform:none}}@keyframes cache-land{0%,65%{opacity:0;transform:scale(.4)}88%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:none}}@keyframes cache-float{0%,100%{transform:translateY(0) rotate(-.4deg)}50%{transform:translateY(-7px) rotate(.4deg)}}@keyframes cache-rays{0%{opacity:0;transform:scale(.15) rotate(-12deg)}18%{opacity:.85}42%{opacity:.6;transform:scale(1) rotate(8deg)}100%{opacity:0;transform:scale(1.35) rotate(32deg)}}@keyframes cache-runes{0%{opacity:0;transform:scale(.35) rotate(-25deg)}20%{opacity:.8}100%{opacity:0;transform:scale(1.7) rotate(30deg)}}@keyframes cache-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes cache-breathe{0%,100%{opacity:.5}50%{opacity:1}}@keyframes cache-open{0%{transform:none}8%{transform:translateY(16px) scale(.94,.88)}10%{transform:translateY(20px) scale(.92,.96)}15%{transform:translateY(24px) scale(.97,1) rotate(-2deg)}21%{transform:translateY(30px) scale(1.04) rotate(2deg)}25%{transform:translateY(34px) scale(1.10) rotate(-3deg)}28%{transform:translateY(36px) scale(1.18) rotate(3.5deg)}31%{transform:translateY(34px) scale(1.24) rotate(-2deg)}34%{transform:translateY(20px) scale(1.32,1.22)}43%{transform:translateY(calc(var(--settle-y) * .66)) scale(.82,.88);opacity:1;animation-timing-function:cubic-bezier(.16,.8,.24,1)}67%,100%{transform:translateY(var(--settle-y)) scale(var(--settle-scale));opacity:.85}}@keyframes cache-seal-settle{0%,20%{transform:none;opacity:1}67%,100%{transform:translateY(calc(var(--settle-y) - 60px));opacity:.35}}@keyframes cache-closed{0%{opacity:1}33%,100%{opacity:0}}@keyframes cache-lid{0%,32.9%{opacity:0;transform:scaleY(.9)}33%{opacity:1;transform:scaleY(.92)}43%,100%{opacity:1;transform:none}}@keyframes cache-flash{0%{opacity:0;transform:scale(.4)}30%{opacity:.96;transform:scale(1.6)}48%{opacity:.7;transform:scale(1.7)}100%{opacity:0;transform:scale(3.1)}}@keyframes cache-wave{0%{opacity:.8;transform:scale(.5)}100%{opacity:0;transform:scale(4.8,3.5)}}@keyframes cache-charge{0%{transform:scale(1);opacity:.3}55%{transform:scale(.65);opacity:1}66%{transform:scale(1.7);opacity:1}100%{transform:none;opacity:.5}}@keyframes cache-particle{0%{opacity:0;transform:translate(0,0) scale(.3)}6%{opacity:1}65%{opacity:.7}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--turn)) scale(.2)}}@keyframes cache-fan{0%{opacity:0;transform:translate(0,145px) scale(.08) rotate(calc(var(--slot) * -28deg))}16%{opacity:1}48%{opacity:1;transform:translate(calc(var(--slot) * (var(--card-w) + var(--card-gap) + 12px)),calc(var(--slot) * var(--slot) * 19px - 20px)) scale(1.04) rotate(calc(var(--slot) * 12deg))}68%{opacity:1;transform:translate(calc(var(--slot) * (var(--card-w) + var(--card-gap) + 9px)),calc(var(--slot) * var(--slot) * 17px - 15px)) rotate(calc(var(--slot) * 9deg))}100%{opacity:1;transform:translateX(calc(var(--slot) * (var(--card-w) + var(--card-gap))))}}[data-reduced=true] *,[data-reduced=true] *::before,[data-reduced=true] *::after{animation:none!important;transition:none!important}[data-reduced=true][data-phase=opening] .chest-closed{opacity:0}[data-reduced=true][data-phase=opening] .chest-open{opacity:1}[data-reduced=true][data-phase=opening] .chest{opacity:.85;transform:translateY(var(--settle-y)) scale(var(--settle-scale))}[data-reduced=true][data-phase=opening] .seal{opacity:.35;transform:translateY(calc(var(--settle-y) - 60px))}[data-reduced=true][data-phase=opening] .reward{opacity:1;transform:translateX(calc(var(--slot) * (var(--card-w) + var(--card-gap))))}@media(max-width:640px){.scene{--card-w: min(260px, calc(100vw - 56px));--card-gap: 8px;--chest-size: min(380px, 100vw);--chest-top: 22px;--stage-h: 425px;padding-inline:12px}.loot-rows{grid-template-columns:minmax(0,1fr)}.loot-list{padding-inline:12px}.scene{justify-content:flex-start;padding-top:82px}.chest-hit-area{width:265px;height:255px;bottom:calc(100% + 30px)}.seal{width:270px;left:calc(50% - 135px);top:250px;height:82px}.footer{font-size:10px;gap:7px}}@media(max-height:660px)and (min-width:641px){.scene{--chest-size: 320px;--chest-top: -10px;--card-w: 190px;--stage-h: 385px;padding-top:30px;padding-bottom:18px}.seal{top:202px}.chest-hit-area{width:270px;height:218px}.open-cache{bottom:calc(4px + var(--stage-size) - var(--stage-h))}.tap-hint{bottom:calc(60px + var(--stage-size) - var(--stage-h))}.overline{margin-bottom:8px}h1{font-size:28px}.status{margin-top:8px}.footer{margin-top:7px}}@media(min-width:641px)and (max-width:820px){.scene{--card-w: 185px;--card-gap: 14px}}\n';

  // src/modules/ArcaneCacheDemo.js
  var CACHE_OPENING_MS = 3e3;
  var ART = "assets/arcane-cache/chest-states.png";
  var TRIGGER = "[data-iw-cache-trigger]";
  var CACHE_DROP_MS = 440;
  var active2 = null;
  var toolbarButton = null;
  var bulkButton = null;
  var make = (tag, className, text) => {
    const el2 = document.createElement(tag);
    if (className) el2.className = className;
    if (text !== void 0) el2.textContent = text;
    return el2;
  };
  var button = (className, label4, action) => {
    const el2 = make("button", className, label4);
    el2.type = "button";
    el2.addEventListener("click", action);
    return el2;
  };
  function later(run, delay, action) {
    const timer = setTimeout(() => {
      run.timers.delete(timer);
      if (active2 === run && isRuntimeActive()) action();
    }, delay);
    run.timers.add(timer);
  }
  function clearTimers(run) {
    for (const timer of run.timers) clearTimeout(timer);
    run.timers.clear();
  }
  function close(run = active2) {
    if (!run || active2 !== run) return;
    active2 = null;
    clearTimers(run);
    run.motion.removeEventListener("change", run.onMotion);
    run.loot.dispose();
    run.dialog.close();
    run.dialog.remove();
    const focusTarget = run.returnFocus?.isConnected ? run.returnFocus : run.count > 1 ? bulkButton : toolbarButton;
    if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
  }
  function phase(run, name) {
    run.phase = name;
    run.scene.dataset.phase = name;
  }
  function waiting(run) {
    phase(run, "waiting");
    run.open.disabled = false;
    run.status.textContent = run.count > 1 ? `${run.count} caches. One extraordinary haul.` : "Something extraordinary is waiting inside.";
    run.countSelect.disabled = false;
    run.open.focus({ preventScroll: true });
  }
  function reveal(run) {
    phase(run, "revealed");
    run.heading.textContent = "Treasures revealed";
    run.status.textContent = run.count > 1 ? `${run.count} caches opened · Rare treasures above, the rest below.` : "A little magic. A worthy haul.";
    run.actions.hidden = false;
    run.announce.textContent = `${run.count} ${run.count === 1 ? "cache" : "caches"} opened. ` + run.loot.reveal();
    run.replay.focus({ preventScroll: true });
  }
  function openChest(run) {
    if (active2 !== run || run.phase !== "waiting") return;
    run.open.disabled = true;
    run.countSelect.disabled = true;
    run.open.blur();
    phase(run, "opening");
    run.status.textContent = "The seal is breaking…";
    run.announce.textContent = "Opening Arcane Cache.";
    later(run, run.motion.matches ? 240 : CACHE_OPENING_MS, () => reveal(run));
  }
  function drop(run) {
    clearTimers(run);
    run.heading.textContent = "Arcane Cache";
    run.status.textContent = "A sealed cache of untold possibilities.";
    run.announce.textContent = "";
    run.actions.hidden = true;
    prepareLoot(run);
    run.open.disabled = true;
    phase(run, "dropping");
    later(run, run.motion.matches ? 120 : CACHE_DROP_MS, () => waiting(run));
  }
  function prepareLoot(run) {
    run.loot.prepare(run.count);
    run.openLabel.textContent = run.count > 1 ? `Break ${run.count} seals` : "Break the seal";
    run.replay.textContent = run.count > 1 ? `Open another ${run.count}` : "Open another";
  }
  function showArcaneCacheDemo(trigger = toolbarButton, count = 1) {
    if (!isRuntimeActive() || active2) return;
    const dialog = make("dialog", "iw-cache-dialog");
    dialog.dataset.iwArcaneCache = "1";
    dialog.setAttribute("aria-label", "Arcane Cache opening demo");
    const shell = make("div");
    const shadow = shell.attachShadow({ mode: "open" });
    const style = make("style", "", arcane_cache_default);
    const scene = make("section", "scene");
    const run = {
      dialog,
      shadow,
      scene,
      timers: /* @__PURE__ */ new Set(),
      phase: "loading",
      count,
      motion: matchMedia("(prefers-reduced-motion: reduce)"),
      returnFocus: trigger || document.activeElement
    };
    active2 = run;
    scene.dataset.bulk = String(count > 1);
    scene.style.setProperty("--drop-duration", `${CACHE_DROP_MS}ms`);
    scene.style.setProperty("--open-duration", `${CACHE_OPENING_MS}ms`);
    scene.style.setProperty("--cache-corners", `url("${assetUrl("assets/inventory/panel_corners.webp")}")`);
    scene.style.setProperty("--cache-ground", `url("${assetUrl("assets/skills_panel_texture.webp")}")`);
    run.announce = make("p", "sr-only");
    run.announce.setAttribute("role", "status");
    run.announce.setAttribute("aria-live", "polite");
    run.loot = createCacheLootView(run.announce);
    scene.dataset.reduced = String(run.motion.matches);
    phase(run, "loading");
    const exit = button("exit", "×", () => close(run));
    exit.setAttribute("aria-label", "Close Arcane Cache");
    const mast = make("header", "mast");
    const overline = make("p", "overline", "A LITTLE WONDER, SEALED AWAY");
    run.heading = make("h1", "", "Arcane Cache");
    run.status = make("p", "status", "Summoning your cache…");
    mast.append(overline, run.heading, run.status);
    const batch = make("label", "batch-choice", "OPEN TOGETHER");
    batch.hidden = count === 1;
    run.countSelect = make("select", "batch-size");
    run.countSelect.setAttribute("aria-label", "Number of caches");
    for (const size of [20, 50, 100]) {
      const option = make("option", "", `${size} caches`);
      option.value = String(size);
      run.countSelect.append(option);
    }
    run.countSelect.value = String(count);
    run.countSelect.addEventListener("change", () => {
      if (run.phase !== "waiting") return;
      run.count = Number(run.countSelect.value);
      prepareLoot(run);
      run.status.textContent = `${run.count} caches. One extraordinary haul.`;
    });
    batch.append(run.countSelect);
    mast.append(batch);
    const stage = make("div", "stage");
    const halo = make("div", "halo");
    halo.setAttribute("aria-hidden", "true");
    const seal = make("div", "seal");
    seal.setAttribute("aria-hidden", "true");
    seal.append(make("span", "", "✧"), make("span", "", "✦"), make("span", "", "✧"));
    const chest = make("div", "chest");
    chest.setAttribute("aria-hidden", "true");
    for (const state of ["closed", "open"]) {
      const sprite = make("span", `chest-sprite chest-${state}`);
      sprite.style.backgroundImage = `url("${assetUrl(ART)}")`;
      chest.append(sprite);
    }
    const shockwave = make("div", "shockwave");
    const echo = make("div", "shockwave shockwave-echo");
    const runes = make("div", "burst-runes");
    runes.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 12; i++) {
      const rune = make("span", "", ["✧", "◇", "✦"][i % 3]);
      rune.style.setProperty("--angle", `${i * 30}deg`);
      runes.append(rune);
    }
    const rays = make("div", "burst-rays");
    for (let i = 0; i < 12; i++) {
      const ray = make("i");
      ray.style.setProperty("--angle", `${i * 30}deg`);
      rays.append(ray);
    }
    const flash = make("div", "flash");
    const motes = make("div", "motes");
    motes.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 64; i++) {
      const mote = make("i");
      const angle = i * Math.PI * 2 / 64;
      mote.style.setProperty("--dx", `${Math.cos(angle) * (220 + i % 5 * 44)}px`);
      mote.style.setProperty("--dy", `${Math.sin(angle) * (170 + i % 5 * 31) - 90}px`);
      mote.style.setProperty("--turn", `${i * 41}deg`);
      mote.style.setProperty("--delay", `${970 + i % 6 * 30}ms`);
      motes.append(mote);
    }
    run.open = button("open-cache", "", () => openChest(run));
    run.open.setAttribute("aria-label", "Open Arcane Cache");
    run.open.disabled = true;
    const tapHint = make("span", "tap-hint", "CLICK THE CHEST TO OPEN");
    run.openLabel = make("span", "", "Break the seal");
    run.open.append(make("span", "chest-hit-area"), run.openLabel);
    stage.append(halo, seal, rays, runes, chest, shockwave, echo, flash, motes, run.loot.rewards, run.loot.empty, run.open, tapHint);
    run.actions = make("div", "actions");
    run.actions.hidden = true;
    run.replay = button("replay", "Open another", () => drop(run));
    run.actions.append(run.replay, button("done", "Done", () => close(run)));
    const footer = make("footer", "footer");
    footer.append(make("span", "demo-label", "PREVIEW"), make("span", "", "Sample loot · No items are granted"));
    scene.append(exit, mast, stage, run.loot.summary, run.actions, footer, run.announce);
    shadow.append(style, scene);
    dialog.append(shell);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(run);
    });
    dialog.addEventListener("close", () => close(run));
    run.onMotion = () => {
      scene.dataset.reduced = String(run.motion.matches);
      if (!run.motion.matches) return;
      if (run.phase === "opening") {
        clearTimers(run);
        reveal(run);
      } else if (run.phase === "dropping") {
        clearTimers(run);
        waiting(run);
      }
    };
    run.motion.addEventListener("change", run.onMotion);
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (err) {
      close(run);
      warnOnce("cache:modal", err);
      return;
    }
    exit.focus({ preventScroll: true });
    const art2 = new Image();
    const failed = () => {
      if (active2 !== run || run.phase !== "loading") return;
      clearTimers(run);
      phase(run, "error");
      run.status.textContent = "Chest artwork could not load. Close and try again.";
      run.announce.textContent = run.status.textContent;
    };
    art2.onload = () => {
      if (active2 === run && run.phase === "loading") drop(run);
    };
    art2.onerror = failed;
    art2.src = assetUrl(ART);
    later(run, 8e3, failed);
  }
  function ensureArcaneCacheButton(track) {
    if (!track || !isRuntimeActive()) return;
    if (toolbarButton?.parentElement === track && bulkButton?.parentElement === track) return;
    toolbarButton?.remove();
    bulkButton?.remove();
    const trigger = (label4, key, count) => {
      const el2 = button("", label4, (event) => showArcaneCacheDemo(event.currentTarget, count));
      el2.dataset.iwNavLink = key;
      el2.dataset.iwCacheTrigger = "1";
      el2.dataset.iwUi = "nav-tab";
      el2.title = `Preview ${count === 1 ? "one cache" : "20–100 caches"} (demo rewards)`;
      el2.setAttribute("aria-haspopup", "dialog");
      return el2;
    };
    toolbarButton = trigger("Arcane Cache", "arcane-cache", 1);
    bulkButton = trigger("Caches ×20", "arcane-cache-bulk", 20);
    const toolkit = track.querySelector(':scope > [data-iw-nav-link="toolkit"]');
    if (toolkit) toolkit.after(toolbarButton, bulkButton);
    else track.append(toolbarButton, bulkButton);
  }
  function clearArcaneCacheDemo() {
    close();
    document.querySelectorAll(TRIGGER).forEach((el2) => el2.remove());
    toolbarButton = null;
    bulkButton = null;
  }

  // src/styles/ui-system.css
  var ui_system_default = ':root{--iw-space-1: 4px;--iw-space-2: 6px;--iw-space-3: 9px;--iw-space-4: 12px;--iw-space-5: 16px;--iw-control-h: 32px;--iw-control-h-lg: 36px;--iw-frame-title-size: 18px;--iw-frame-edge: var(--iw-th-edge);--iw-frame-inner: #19150F;--iw-steel: #26231D}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):not([data-iw-chrome=nav]){position:relative!important;isolation:isolate!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;padding:var(--iw-frame-pad-y, 26px) var(--iw-frame-pad-x, 22px)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 5px 18px rgba(0,0,0,.24)!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):not([data-iw-chrome=nav])::before{content:""!important;position:absolute!important;z-index:0!important;pointer-events:none!important;left:12px!important;right:12px!important;top:0!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent)!important;opacity:.78!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):not([data-iw-collapsed="1"]):not(:has([data-iw-ui=nav-tab]))::after{content:""!important;position:absolute!important;inset:-3px -1px!important;z-index:0!important;pointer-events:none!important;border-style:solid!important;border-width:34px 32px!important;border-color:transparent!important;border-image:var(--iw-corner-filigree) 50% / 34px 32px / 0 stretch!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])))>*{position:relative;z-index:1}@media(max-width:1024px){:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):not([data-iw-chrome=nav]){padding:var(--iw-frame-pad-mobile-y, var(--iw-frame-pad-y, 20px)) var(--iw-frame-pad-mobile-x, var(--iw-frame-pad-x, 16px))!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):not([data-iw-collapsed="1"]):not(:has([data-iw-ui=nav-tab]))::after{border-width:27px 25px!important;border-image-width:27px 25px!important}}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):not(:has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))):has([data-iw-ui=nav-tab]){--iw-frame-pad-y: 6px;--iw-frame-pad-x: 16px;--iw-frame-pad-mobile-y: 6px;--iw-frame-pad-mobile-x: 12px}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"])){border:0!important;border-radius:0!important;padding:0!important;background:none!important;box-shadow:none!important;isolation:auto!important}:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))::before,:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]):has(:is([data-iw-ui=section-frame],[data-iw-inventory-root="1"],.fs-skills-section-frame[data-iw-skills-ui-ready="1"]))::after{content:none!important;display:none!important;border:0!important;background:none!important}[data-iw-ui=section-title]{font-family:var(--iw-font-head)!important;font-size:var(--iw-frame-title-size)!important;letter-spacing:.035em!important;color:var(--iw-text-hi)!important;text-shadow:0 1px 0 #000!important}[data-iw-skill-boost="1"]{display:block!important;width:fit-content!important;max-width:100%!important;margin-block:4px!important;padding:4px 9px!important;border:1px solid var(--iw-th-edge-faint)!important;border-left:2px solid #67ab83!important;border-radius:3px!important;background:color-mix(in srgb,var(--iw-th-edge-soft) 33%,transparent)!important;color:#91cba4!important}[data-iw-skill-boost="1"] *{color:inherit!important}[data-iw-panel]{--iw-frame-pad-y: 18px;--iw-frame-pad-x: 20px;--iw-frame-pad-mobile-y: 16px;--iw-frame-pad-mobile-x: 14px;display:flex!important;flex-direction:column!important;gap:10px!important;min-width:0!important;font-family:var(--iw-font-ui)!important;color:var(--iw-text)!important}[data-iw-panel] *,[data-iw-panel] *::before,[data-iw-panel] *::after{box-sizing:border-box}[data-iw-panel][data-iw-panel-header=split]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important}[data-iw-panel][data-iw-panel-header=split]>*{grid-column:1 / -1}[data-iw-panel][data-iw-panel-header=split]>[data-iw-panel-part=header-title]{grid-column:1!important;grid-row:1!important;min-width:0!important}[data-iw-panel][data-iw-panel-header=split]>[data-iw-panel-part=header-tools]{grid-column:2!important;grid-row:1!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important}[data-iw-panel] [data-iw-ui=section-title]{margin:0!important;font-size:var(--iw-frame-title-size)!important;font-weight:700!important;line-height:1.15!important}[data-iw-panel-part=header]{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-width:0!important;margin:0!important}[data-iw-panel-part=header]>*{min-width:0}:is([data-iw-panel-part=header],[data-iw-panel-part=header-title]) p{margin:4px 0 0!important;color:var(--iw-faint)!important;font-size:11px!important;line-height:1.25!important}:is([data-iw-panel-part=header],[data-iw-panel-part=header-tools]) button:not([data-iw-collapse]),[data-iw-panel-part=panel-control]{min-width:30px!important;min-height:30px!important;padding:0 9px!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:linear-gradient(180deg,#242018,#15130F)!important;color:var(--iw-dim)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;font-family:var(--iw-font-ui)!important}:is([data-iw-panel-part=header],[data-iw-panel-part=header-tools]) button:not([data-iw-collapse]):hover,[data-iw-panel-part=panel-control]:hover{border-color:var(--iw-th-rule)!important;color:var(--iw-text-hi)!important}[data-iw-panel-part=panel-control]{width:auto!important;min-height:24px!important;margin-left:8px!important;padding:0 7px!important;font-size:10px!important;font-weight:700!important;letter-spacing:.12em!important;text-transform:uppercase!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]{min-width:0!important;min-height:0!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;color:var(--iw-text-hi)!important;font-family:var(--iw-font-head)!important;text-align:left!important;cursor:pointer!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]:hover{border-color:transparent!important;color:var(--iw-text-hi)!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]>*{color:var(--iw-gold-dim)!important;font-family:var(--iw-font-ui)!important;font-size:11px!important;font-weight:600!important;letter-spacing:.08em!important;text-transform:uppercase!important;text-decoration:underline!important;text-underline-offset:2px!important;text-shadow:none!important}[data-iw-panel=action-log][data-iw-ui=section-frame] [data-iw-ui=section-title]:hover>*{color:var(--iw-gold)!important}@media(min-width:641px){[data-iw-panel=action-log] [data-iw-panel-part=header]>:first-child{display:flex!important;align-items:center!important;gap:8px!important}}[data-iw-panel=current-action]>div:not([data-iw-panel-part]),[data-iw-panel=current-action]>strong{font-size:15px!important;font-weight:700!important;color:var(--iw-text-hi)!important}[data-iw-panel=current-action]>p{margin:-2px 0 2px!important;color:var(--iw-faint)!important;font-size:11.5px!important;line-height:1.3!important}[data-iw-panel-part=progress]{position:relative!important;width:100%!important;height:18px!important;min-height:18px!important;overflow:hidden!important;border:1px solid color-mix(in srgb,var(--iw-th-accent) 48%,var(--iw-th-edge))!important;border-radius:2px!important;background:linear-gradient(#080807,#14120e)!important;box-shadow:inset 0 3px 8px #000d,0 0 0 1px #000,0 0 8px color-mix(in srgb,var(--iw-th-accent) 12%,transparent)!important}[data-iw-panel-part=progress]::before,[data-iw-panel-part=progress]::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none}[data-iw-panel-part=progress]::before{background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(0,0,0,.72) calc(10% - 1px) 10%)}[data-iw-panel-part=progress]::after{inset:3px 5px auto;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.48),transparent)}[data-iw-panel-part=progress]>*{position:relative!important;height:100%!important;min-height:100%!important;overflow:hidden!important;border-radius:0!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-th-accent) 70%,#fff) 0%,var(--iw-th-accent) 38%,color-mix(in srgb,var(--iw-th-accent-dim) 76%,#17130d) 100%)!important;box-shadow:0 0 9px color-mix(in srgb,var(--iw-th-accent) 32%,transparent)!important;transition:width var(--iw-progress-duration, var(--iw-action-tick, 1s)) linear!important;will-change:width!important}[data-iw-panel-part=progress]>*::before{content:"";position:absolute;inset:0 auto 0 -40%;width:40%;background:linear-gradient(100deg,transparent,color-mix(in srgb,var(--iw-th-accent) 64%,rgba(255,255,255,.82)),transparent);animation:iw-control-meter-current 5.7s ease-in-out -2s infinite;pointer-events:none}[data-iw-panel-part=progress][data-iw-progress-reset]>*{transition:none!important}@media(prefers-reduced-motion:reduce){[data-iw-panel-part=progress]>*{transition:none!important}[data-iw-panel-part=progress]>*::before{animation:none!important}}[data-iw-panel-part=queue]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:4px 10px!important;min-width:0!important;padding:10px 12px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:3px!important;background:linear-gradient(180deg,rgba(255,255,255,.022),transparent 45%),rgba(12,12,10,.76)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.34)!important}[data-iw-panel-part=queue]>:first-child{grid-column:1!important;color:var(--iw-faint)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.16em!important;text-transform:uppercase!important}[data-iw-panel-part=queue]>button{grid-column:2!important;grid-row:1 / span 2!important;width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;padding:0!important;border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;background:linear-gradient(180deg,#26221B,#15130F)!important;color:var(--iw-dim)!important}[data-iw-panel-part=feed]{min-width:0!important;overflow-x:hidden!important;overflow-y:auto!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:3px!important;background-color:#0B0C0A!important;background-image:linear-gradient(180deg,rgba(255,255,255,.018),transparent 22%)!important;box-shadow:inset 0 0 18px rgba(0,0,0,.24)!important;scrollbar-color:var(--iw-th-edge-mid) #11110E!important;scrollbar-width:thin!important}[data-iw-panel=action-log] [data-iw-panel-part=feed]{max-height:300px!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed]{max-height:min(46vh,430px)!important}[data-iw-panel-part=feed] *:has([data-iw-panel-part=feed-row]){background:transparent!important;box-shadow:none!important}[data-iw-panel=action-log] [data-iw-panel-part=feed]{background:transparent!important;box-shadow:none!important}[data-iw-panel-part=feed-row]{display:block!important;min-width:0!important;margin:0!important;padding:8px 12px!important;border:0!important;border-bottom:1px solid var(--iw-th-edge-faint)!important;border-radius:0!important;background:transparent!important;font-size:12px!important;line-height:1.3!important}[data-iw-panel-part=feed-row]:last-child{border-bottom:0!important}[data-iw-panel-part=feed-row]>*{margin:0!important}[data-iw-panel-part=feed-row]>*+*{margin-top:3px!important}[data-iw-panel-part=feed-row]>:first-child{display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:10px!important}[data-iw-panel-part=feed-row] time{flex:0 0 auto!important;color:#6F6A60!important;font-size:10px!important;font-variant-numeric:tabular-nums!important}[data-iw-panel=action-log] [data-iw-panel-part=feed-row]>:first-child>:first-child{color:var(--iw-faint)!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.15em!important;text-transform:uppercase!important}[data-iw-panel=action-log] [data-iw-panel-part=feed-row]>:last-child{color:#82BBD0!important;font-size:11px!important}[data-iw-panel=world-chat] .feed-panel{background:#0B0C0A!important;border-color:var(--iw-th-edge-faint)!important}[data-iw-panel=action-log] .feed-panel{background:transparent!important;border-color:var(--iw-th-edge-faint)!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed-row] strong{color:#8CC8E0!important;font-weight:700!important}[data-iw-panel=world-chat] [data-iw-panel-part=feed-row] b{color:#D9D0BE!important;font-weight:700!important}[data-iw-panel-part=composer]{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;width:100%!important;min-width:0!important;margin:2px 0 0!important}[data-iw-panel-part=chat-input]{width:100%!important;min-width:0!important;height:42px!important;padding:0 13px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:3px!important;background:#080A09!important;color:var(--iw-text)!important;font-family:var(--iw-font-ui)!important;font-size:13px!important;box-shadow:inset 0 2px 7px rgba(0,0,0,.48)!important}[data-iw-panel-part=chat-input]::placeholder{color:#6F685A!important}[data-iw-panel-part=chat-input]:focus{outline:1px solid rgba(197,145,67,.5)!important;outline-offset:1px!important;border-color:var(--iw-th-brass)!important}[data-iw-panel-part=send]{min-width:104px!important;height:42px!important;padding:0 18px!important;border:1px solid var(--iw-th-cta-hi)!important;border-radius:3px!important;background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 62%,#000))!important;color:#FFF0DA!important;font-family:var(--iw-font-head)!important;font-size:13px!important;font-weight:700!important;letter-spacing:.025em!important;text-shadow:0 1px 0 #3A1005!important;box-shadow:inset 0 1px 0 rgba(255,218,174,.14)!important}[data-iw-panel-part=send]:hover:not(:disabled){filter:brightness(1.12)}@media(max-width:640px){[data-iw-panel]{gap:8px!important}[data-iw-panel-part=feed-row]{padding:8px 9px!important;font-size:11.5px!important}}@media(max-width:430px){[data-iw-panel-part=composer]{grid-template-columns:minmax(0,1fr)!important;gap:7px!important}[data-iw-panel-part=send]{width:100%!important;min-width:0!important}[data-iw-panel-part=feed-row]>:first-child{flex-wrap:wrap!important;gap:2px 8px!important}}[data-iw-ui=main-nav-shell]{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}[data-iw-ui=main-nav]{display:flex!important;align-items:stretch!important;flex-wrap:wrap!important;gap:0!important;width:max-content!important;max-width:100%!important;min-height:0!important;margin:0!important;padding:0!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:3px!important;background:#11100D!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.52)!important;overflow:visible!important}[data-iw-ui=nav-tab]{position:relative!important;min-height:var(--iw-control-h)!important;height:var(--iw-control-h)!important;margin:0!important;padding:0 16px!important;border:0!important;border-right:1px solid var(--iw-th-edge-soft)!important;border-radius:0!important;background:linear-gradient(180deg,#211E18,#16140F)!important;color:#AAA291!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.022)!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:.025em!important;text-transform:uppercase!important;line-height:1!important}[data-iw-ui=nav-tab]:last-of-type{border-right:0!important}[data-iw-ui=nav-tab]:hover:not(:disabled){z-index:1;background:linear-gradient(180deg,#29241C,#1A1711)!important;color:var(--iw-text-hi)!important;filter:none!important}[data-iw-ui=nav-tab][data-iw-state=active]{z-index:2;color:#FFE8CB!important;background:linear-gradient(180deg,rgba(255,255,255,.035),transparent 46%),linear-gradient(180deg,var(--iw-th-cta),color-mix(in srgb,var(--iw-th-cta) 52%,#000))!important;box-shadow:inset 0 1px 0 rgba(255,226,191,.13),inset 0 -2px 0 rgba(55,16,4,.58)!important}[data-iw-ui=nav-tab][data-iw-state=active]::after{content:"";position:absolute;left:9px;right:9px;bottom:-4px;height:2px;background:var(--iw-ember-hi);box-shadow:0 0 6px rgba(209,90,34,.28)}[data-iw-nav-link=toolkit]{box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;gap:5px!important;margin-left:10px!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:3px!important;color:var(--iw-th-accent)!important;text-decoration:none!important;cursor:pointer}[data-iw-nav-link=toolkit]::after{content:"↗";font-size:.82em;line-height:1;opacity:.68}[data-iw-nav-link=toolkit]:hover{color:var(--iw-text-hi)!important;border-color:var(--iw-th-brass)!important;background:linear-gradient(180deg,#29241C,#1A1711)!important}[data-iw-cache-trigger]{flex:0 0 auto!important;color:#a5dedf!important}@media(max-width:767px){[data-iw-cache-trigger]{display:none!important}}[data-iw-ui=zone-bar]{border-radius:5px!important;padding-top:5px!important;padding-bottom:5px!important;min-height:0!important}[data-iw-ui=zone-title]{color:var(--iw-text-hi)!important;font-weight:700!important}[data-iw-ui=zone-action]{background:linear-gradient(180deg,#242018,#17140F)!important;border:1px solid var(--iw-line-hi)!important;color:var(--iw-text)!important;height:auto!important;min-height:30px!important;min-width:0!important;padding:5px 13px!important;font-size:11px!important;letter-spacing:.025em!important}[data-iw-chrome=shell]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;row-gap:0!important;column-gap:0!important}[data-iw-chrome=shell]>header{grid-row:1;margin-bottom:12px}[data-iw-chrome=shell]>*{grid-column:1 / -1}[data-iw-chrome=zone-bar]~*{margin-top:12px}[data-iw-chrome=zone-bar]{display:contents!important}[data-iw-chrome=zone-bar]::before,[data-iw-chrome=zone-bar]::after{content:none!important}[data-iw-chrome=shell]{--iw-chrome-inset: 14px}[data-iw-chrome=shell] [data-iw-chrome=zone-text]{grid-row:2;grid-column:1;align-self:center;margin:6px 0 9px var(--iw-chrome-inset)!important;padding:0!important;min-width:0}[data-iw-chrome=notice]{grid-row:2;grid-column:2;align-self:center;justify-self:end;margin:6px 14px 9px 20px;max-width:34rem}[data-iw-chrome=nav]{grid-row:3;grid-column:1;align-self:center;margin:9px var(--iw-chrome-inset) 6px var(--iw-chrome-inset)!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important}[data-iw-chrome=zone-actions]{grid-row:3;grid-column:2;align-self:center;justify-self:end;margin:9px 14px 6px 14px}[data-iw-chrome=shell]::before{content:"";grid-row:2 / 4;grid-column:1 / -1;border:1px solid var(--iw-th-edge);border-radius:4px;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow)}[data-iw-chrome=shell]::after{content:"";grid-row:3;grid-column:1 / -1;align-self:start;height:1px;background:var(--iw-th-edge-soft)}@media(max-width:860px){[data-iw-chrome=shell]{grid-template-columns:minmax(0,1fr)}[data-iw-chrome=shell] [data-iw-chrome=zone-text]{grid-row:2;grid-column:1;margin:6px var(--iw-chrome-inset) 8px!important}[data-iw-chrome=notice]{grid-row:3;grid-column:1;justify-self:stretch;max-width:none;margin:0 var(--iw-chrome-inset) 9px}[data-iw-chrome=nav]{grid-row:4;grid-column:1;margin:9px var(--iw-chrome-inset) 6px!important}[data-iw-chrome=shell] [data-iw-chrome=zone-actions]{grid-row:5;grid-column:1;justify-self:stretch;margin:0 var(--iw-chrome-inset) 8px!important}[data-iw-chrome=shell]::before{grid-row:2 / 6}[data-iw-chrome=shell]::after{grid-row:4}}[data-iw-zone-link]{background-color:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;padding:0!important;border-radius:0!important;cursor:pointer}[data-iw-ui=zone-title] [data-iw-zone-link]{margin-left:8px!important}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-header=profile-name] button):not([data-iw-order-handle]):not([data-fs-inv]),[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-header=profile-name] button):not([data-iw-order-handle]):not([data-fs-inv]){border-color:var(--iw-th-edge-faint)!important;background-image:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.28))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -7px 10px -8px rgba(0,0,0,.9)!important}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-order-handle]):not([data-fs-inv]):hover,[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-order-handle]):not([data-fs-inv]):hover{border-color:var(--iw-line-hot)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.055),inset 0 0 10px -3px rgba(216,121,31,.35)!important}[data-iw-ui=zone-action],.compact-panel.fs-skill-panel button[data-iw-skill-role=action-button],.compact-panel.fs-skill-panel button[data-iw-skill-role=nav-button]{min-height:30px}[data-iw-inventory-control=filter],[data-iw-inventory-control=page]{min-height:26px}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([data-iw-ui=nav-tab]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-order-handle]):not([data-fs-inv]):disabled,[role=button][aria-disabled=true]:not(.iw-item-ref):not([data-iw-raid-owned]):not([data-iw-collapse]):not([data-iw-compact-button]):not([data-iw-inventory-control]):not([data-fs-preserved-action=control]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-skill-role=nav-button]):not([data-iw-skill-role=action-button]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-ui=section-title]):not([data-iw-header=utility-button]):not([data-iw-header=status-card]):not([data-iw-header=profile-online]):not([data-iw-ui=zone-action]):not([data-iw-zone-link]):not([data-iw-panel-part=header-tools] button):not([data-iw-panel-part=panel-control]):not([data-iw-panel-part=queue]>button):not([data-iw-panel-part=send]):not([class*=decoration-dotted]):not([data-iw-market]):not([data-iw-order-handle]):not([data-fs-inv]){filter:saturate(.58) brightness(.84)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)!important}input[type=search],input[placeholder*=Search i]{border:1px solid var(--iw-th-edge-soft)!important;border-bottom-color:var(--iw-line-hi)!important;border-radius:2px!important;background:linear-gradient(180deg,#080A0A,#0D0E0C)!important;box-shadow:inset 0 2px 6px rgba(0,0,0,.72)!important}@media(max-width:768px){[data-iw-ui=main-nav]{width:100%!important}[data-iw-ui=nav-tab]{flex:1 1 auto!important;padding-inline:9px!important;font-size:10.5px!important}[data-iw-nav-link=toolkit]{flex:0 0 auto!important;margin-left:7px!important}}@media(max-width:1279px){:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-ui=nav-tab]){--iw-nav-gap: 6px;--iw-nav-pad: 12px;--iw-nav-k: 28.1;--iw-nav-fixed: calc(12 * var(--iw-nav-pad) + 5 * var(--iw-nav-gap) + 7px + 5px);container:iw-nav-row / inline-size;flex-wrap:nowrap!important;column-gap:var(--iw-nav-gap)!important}[data-iw-ui=nav-tab]{min-width:0!important;padding-inline:var(--iw-nav-pad, 12px)!important;white-space:nowrap!important;font-size:clamp(7.5px,calc((100cqi - var(--iw-nav-fixed, 186px)) / var(--iw-nav-k, 28.1)),11.5px)!important}}@media(min-width:768px)and (max-width:1279px){:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-nav-link=arcane-cache]){--iw-nav-k: 41.5;--iw-nav-fixed: calc(16 * var(--iw-nav-pad) + 7 * var(--iw-nav-gap) + 7px + 5px)}}@media(min-width:768px)and (max-width:1279px){:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-ui=nav-tab]):has(>[data-iw-tab=guild]){--iw-nav-k: 31;--iw-nav-fixed: calc(14 * var(--iw-nav-pad) + 6 * var(--iw-nav-gap) + 7px + 5px)}:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-nav-link=arcane-cache]):has(>[data-iw-tab=guild]){--iw-nav-k: 44.4;--iw-nav-fixed: calc(18 * var(--iw-nav-pad) + 8 * var(--iw-nav-gap) + 7px + 5px)}}@media(max-width:767px){[data-iw-nav-link=toolkit]{display:none!important}:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-ui=nav-tab]){--iw-nav-gap: 5px;--iw-nav-pad: 8px;--iw-nav-k: 23.25;--iw-nav-fixed: calc(10 * var(--iw-nav-pad) + 4 * var(--iw-nav-gap))}:is([data-iw-ui=main-nav],[data-iw-ui=section-frame]):has(>[data-iw-ui=nav-tab]):has(>[data-iw-tab=guild]){--iw-nav-gap: 4px;--iw-nav-pad: 5px;--iw-nav-k: 26.15;--iw-nav-fixed: calc(12 * var(--iw-nav-pad) + 5 * var(--iw-nav-gap))}}[data-iw-boss=card]{position:relative!important;border:1px solid var(--iw-th-edge)!important;border-radius:4px!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(143,107,55,.16),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}[data-iw-boss=card]::before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:1px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi),rgba(200,168,97,.16) 34%,transparent 72%)!important;opacity:.9!important}[data-iw-boss=card]::after{content:""!important;position:absolute!important;inset:4px!important;z-index:0!important;pointer-events:none!important;border:1px solid rgba(133,101,54,.22)!important;border-radius:2px!important;box-shadow:inset 0 0 12px rgba(0,0,0,.26)!important}[data-iw-boss=card]>*:not(button):not(a):not([role=button]):not([data-iw-boss-owned]){background:transparent!important}[data-iw-boss=card] button[class*=decoration-dotted]{background-color:transparent!important;border-color:transparent!important;box-shadow:none!important}[data-iw-boss=card]>*{position:relative;z-index:1}.iw-boss-notice{margin:0 0 10px!important;padding:7px 12px!important;border-left:2px solid #8da97b;background:rgba(91,130,84,.08);color:#bacbb0!important;font-size:12px!important;line-height:1.35!important}[data-iw-encounter]{--iw-boss-accent: #91b780;padding:12px!important;margin-bottom:10px!important;min-width:0}[data-iw-encounter]:not([data-iw-encounter=zone]){display:grid!important;grid-template-columns:104px auto minmax(0,1fr);grid-template-rows:auto auto auto auto auto;column-gap:14px;row-gap:8px}[data-iw-encounter=abyssal_behemoth]{--iw-boss-accent: #77bcd1}[data-iw-encounter=world_eater]{--iw-boss-accent: #b997df}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header]{grid-column:2 / -1;grid-row:1;min-height:0;padding-left:0;align-items:center!important;gap:10px!important}[data-iw-encounter=zone]>[data-iw-boss-role=header]{min-height:0;padding:1px 2px 8px;flex-wrap:wrap;align-items:baseline;gap:8px!important;border-bottom:1px solid color-mix(in srgb,var(--iw-boss-accent) 28%,transparent)}[data-iw-encounter=zone]>[data-iw-boss-role=header]>*:first-child:not([data-iw-boss-role=title]){display:flex!important;align-items:baseline;justify-content:space-between;flex-wrap:wrap;flex:1 1 auto;min-width:0;gap:4px 12px}[data-iw-encounter=zone]>[data-iw-boss-role=header]:has([data-iw-boss-role=action]){align-items:center;flex-wrap:nowrap}[data-iw-encounter=zone]>[data-iw-boss-role=header]>:has(>[data-iw-boss-role=action]){position:relative}[data-iw-encounter=zone]>[data-iw-boss-role=header]>:has(>[data-iw-boss-role=action])>[data-iw-boss-role=action]~*{position:absolute!important;top:calc(100% + 3px);right:0;width:100%!important;margin:0!important}[data-iw-encounter=zone]>[data-iw-boss-role=header]:has([data-iw-boss-role=action]~*){padding-bottom:14px!important}[data-iw-encounter]>.iw-boss-art{position:absolute!important;top:12px;left:12px;width:104px;height:104px;box-sizing:border-box;background-image:url(../assets/world-bosses/encounters.png)!important;background-size:200% 200%!important;background-position:0% 0%!important;border:1px solid color-mix(in srgb,var(--iw-boss-accent) 45%,#443622);border-radius:3px;box-shadow:0 5px 20px #0008,inset 0 0 12px #000a;pointer-events:none}[data-iw-encounter]:not([data-iw-encounter=zone])>.iw-boss-art{position:relative!important;inset:auto!important;grid-column:1;grid-row:1 / 4}[data-iw-encounter=abyssal_behemoth]>.iw-boss-art{background-position:100% 0%!important}[data-iw-encounter=world_eater]>.iw-boss-art{background-position:0% 100%!important}[data-iw-encounter=zone]>.iw-boss-art{display:none!important}[data-iw-encounter] [data-iw-boss-role=title]{font-family:var(--iw-font-head)!important;font-size:17px!important;line-height:1.35!important;color:#f2e8d1!important;margin:0!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header]>*:first-child{display:grid!important;grid-template-columns:minmax(0,max-content) minmax(0,max-content);grid-template-areas:"title difficulty" "buff buff";align-items:center;column-gap:8px;row-gap:7px}[data-iw-encounter]:not([data-iw-encounter=zone]) [data-iw-boss-role=title]{grid-area:title}[data-iw-encounter] [data-iw-boss-role=difficulty]{display:inline-block;color:var(--iw-boss-accent)!important;font-size:10px!important;letter-spacing:.15em;text-transform:uppercase;border:1px solid color-mix(in srgb,var(--iw-boss-accent) 25%,transparent);padding:2px 6px!important;margin:0!important}[data-iw-encounter]:not([data-iw-encounter=zone]) [data-iw-boss-role=difficulty]{grid-area:difficulty}[data-iw-encounter] [data-iw-boss-role=buff]{color:#b7cfac!important;font-size:12px!important;line-height:1.3}[data-iw-encounter]:not([data-iw-encounter=zone]) [data-iw-boss-role=buff]{grid-area:buff}[data-iw-encounter] [data-iw-boss-role=timer]{color:#aaa596!important;font-size:11px!important;font-variant-numeric:tabular-nums}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=progress]{grid-column:2 / -1;grid-row:2;margin:0!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=participation]{grid-column:2;grid-row:3;align-self:center;justify-self:start;margin:0!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=status]{grid-column:3;grid-row:3;align-self:center;justify-self:stretch;min-width:0;margin:0!important;gap:8px!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=details]{grid-column:1 / -1;grid-row:4;margin:0!important}[data-iw-encounter]{--iw-boss-action-w: 150px}[data-iw-encounter] [data-iw-boss-role=action]{flex:0 0 auto!important;width:var(--iw-boss-action-w)!important;min-width:var(--iw-boss-action-w)!important;max-width:var(--iw-boss-action-w)!important;height:calc(var(--iw-boss-action-w) / 5)!important;min-height:calc(var(--iw-boss-action-w) / 5)!important;max-height:calc(var(--iw-boss-action-w) / 5)!important;padding:0!important;margin:0!important;font:700 11px var(--iw-font-head)!important;letter-spacing:.07em!important;text-transform:uppercase!important;color:transparent!important;font-size:0!important;line-height:0!important;text-shadow:none!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;outline:0!important;appearance:none!important;-webkit-appearance:none!important;background-position:center!important;background-repeat:no-repeat!important;background-size:100% 100%!important;overflow:visible!important;animation:none!important;transition:filter 120ms ease!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join]{background-image:url(../assets/world-boss/world_boss_join-v2.png)!important;filter:drop-shadow(0 2px 3px #000b) drop-shadow(0 0 4px rgba(232,174,84,.42)) drop-shadow(0 0 10px rgba(232,174,84,.20))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join]:hover:not(:disabled){background-image:url(../assets/world-boss/world_boss_join_hover-v2.png)!important;filter:brightness(1.12) saturate(1.08) drop-shadow(0 2px 4px #000c) drop-shadow(0 0 6px rgba(250,196,103,.62)) drop-shadow(0 0 14px rgba(250,196,103,.30))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=prejoined]{background-image:url(../assets/world-boss/world_boss_prejoined-v2.png)!important;filter:drop-shadow(0 2px 3px #000b) drop-shadow(0 0 5px rgba(72,148,255,.48)) drop-shadow(0 0 12px rgba(72,148,255,.22))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=fighting]{background-image:url(../assets/world-boss/world_boss_fighting-v3.png)!important;filter:drop-shadow(0 2px 3px #000b) drop-shadow(0 0 5px rgba(255,103,57,.50)) drop-shadow(0 0 12px rgba(255,103,57,.23))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=prejoined]:hover:not(:disabled){filter:brightness(1.04) drop-shadow(0 2px 4px #000c) drop-shadow(0 0 6px rgba(82,158,255,.56)) drop-shadow(0 0 14px rgba(82,158,255,.26))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=fighting]:hover:not(:disabled){filter:brightness(1.04) drop-shadow(0 2px 4px #000c) drop-shadow(0 0 6px rgba(255,116,67,.58)) drop-shadow(0 0 14px rgba(255,116,67,.27))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state]:focus-visible{outline:1px solid #d6aa5d!important;outline-offset:2px!important}[data-iw-encounter] [data-iw-boss-role=action]:disabled{opacity:.5!important;filter:saturate(.35) brightness(.8)!important;cursor:not-allowed!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join][data-iw-boss-action-team=red]{filter:drop-shadow(0 2px 3px #000b) drop-shadow(0 0 5px rgba(232,82,82,.55)) drop-shadow(0 0 12px rgba(232,82,82,.25))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join][data-iw-boss-action-team=blue]{filter:drop-shadow(0 2px 3px #000b) drop-shadow(0 0 5px rgba(82,158,255,.55)) drop-shadow(0 0 12px rgba(82,158,255,.25))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join][data-iw-boss-action-team=red]:hover:not(:disabled){filter:brightness(1.12) saturate(1.08) drop-shadow(0 2px 4px #000c) drop-shadow(0 0 7px rgba(244,96,96,.66)) drop-shadow(0 0 15px rgba(244,96,96,.30))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=join][data-iw-boss-action-team=blue]:hover:not(:disabled){filter:brightness(1.12) saturate(1.08) drop-shadow(0 2px 4px #000c) drop-shadow(0 0 7px rgba(96,170,255,.66)) drop-shadow(0 0 15px rgba(96,170,255,.30))!important}[data-iw-encounter] [data-iw-boss-role=action][data-iw-boss-action-state=idle]{display:inline-flex!important;align-items:center!important;justify-content:center!important;color:#e9dcc0!important;font-size:11px!important;line-height:1!important;text-shadow:0 1px 2px #000!important;background:linear-gradient(#3a2a1a,#19110b)!important;border:1px solid #8a6a3a!important;border-radius:2px!important}@media(min-width:761px){[data-iw-encounter]:not([data-iw-encounter=zone]){--iw-boss-action-reserve: calc(var(--iw-boss-action-w) + 14px)}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header]{position:static!important;padding-right:var(--iw-boss-action-reserve)!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header]>*:first-child:not([data-iw-boss-role=action]){position:relative;z-index:1}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=progress]{margin-right:var(--iw-boss-action-reserve)!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header] [data-iw-boss-role=action]{position:absolute!important;top:64px!important;right:12px!important;transform:translateY(-50%)!important;z-index:2!important}}.iw-boss-rewards{margin-top:2px;padding-top:9px;border-top:1px solid #a88d4c35}[data-iw-encounter]:not([data-iw-encounter=zone])>.iw-boss-rewards{grid-column:1 / -1;grid-row:5}[data-iw-encounter] .iw-boss-rewards-title{font:600 10px var(--iw-font-head)!important;color:#cdbb94!important;letter-spacing:.14em;text-transform:uppercase;margin:0 0 7px!important}.iw-boss-reward-list{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:4px}[data-iw-encounter] summary.iw-boss-rewards-title{display:list-item;cursor:pointer;padding:4px 0}[data-iw-encounter] summary.iw-boss-rewards-title::marker{color:#cdbb94}[data-iw-encounter] summary.iw-boss-rewards-title:focus-visible{outline:2px solid #cdbb94;outline-offset:3px}[data-iw-encounter] .iw-boss-rewards:not([open])>.iw-boss-reward-list{display:none}[data-iw-encounter] .iw-boss-rewards:not([open])>summary{margin-bottom:0!important}[data-iw-encounter] button.iw-boss-reward{display:flex!important;flex-direction:column;align-items:center;width:auto!important;min-width:44px!important;min-height:70px!important;padding:5px 2px!important;gap:3px;background:transparent!important;border:1px solid transparent!important;border-radius:2px!important;box-shadow:none!important;color:#d3cbbb!important;cursor:help!important}[data-iw-encounter] button.iw-boss-reward:hover,[data-iw-encounter] button.iw-boss-reward:focus-visible{border-color:var(--iw-boss-accent)!important;background-color:#c4ac7018!important;outline:1px solid var(--iw-boss-accent);outline-offset:1px}.iw-boss-reward-icon{display:block;width:34px;height:34px;flex:0 0 34px}@media(prefers-reduced-motion:no-preference){.iw-boss-reward-icon{transition:transform .24s cubic-bezier(.22,.61,.36,1)}.iw-boss-reward:focus-visible .iw-boss-reward-icon{transform:translateY(-2px)}.compact-panel.fs-quest-panel[data-iw-quest-state=ready] .fs-quest-sigil-icon{animation:iw-quest-ready-settle .85s cubic-bezier(.22,.61,.36,1) both}}@media(hover:hover)and (pointer:fine)and (prefers-reduced-motion:no-preference){.iw-boss-reward:hover .iw-boss-reward-icon{transform:translateY(-2px)}}@keyframes iw-quest-ready-settle{0%{transform:translateY(1px) scale(.97)}42%{transform:translateY(-1px) scale(1.035)}100%{transform:none}}.iw-boss-reward-name{font:500 9px/1.15 var(--iw-font-body, sans-serif)!important;text-align:center;white-space:normal;overflow-wrap:anywhere}[data-iw-control=red]{--iw-boss-accent: #df7777;border-color:#a85050!important}[data-iw-control=blue]{--iw-boss-accent: #75b5eb;border-color:#507ca8!important}[data-iw-control=contested]{--iw-boss-accent: #e6bc65;border-color:#ae8a43!important}[data-iw-encounter=zone]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;overflow:hidden;padding:14px!important;background:radial-gradient(circle at 13% 55%,color-mix(in srgb,var(--iw-boss-accent) 13%,transparent),transparent 27%),linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a),var(--iw-th-ground-b))!important}[data-iw-encounter=zone]>[data-iw-boss-role=header]{grid-column:1 / -1;grid-row:1}[data-iw-encounter=zone]>[data-iw-boss-role=title]{letter-spacing:.015em}.iw-control-dominion{display:grid!important;grid-column:1 / -1;grid-row:2;grid-template-columns:174px minmax(0,1fr);grid-template-areas:"crest readout" "crest meter" "crest factions";width:100%;column-gap:18px;row-gap:7px;min-height:174px;padding:10px 4px 5px!important}.iw-control-crest{grid-area:crest;position:relative;align-self:center;width:174px;aspect-ratio:1;isolation:isolate;pointer-events:none}.iw-control-crest::before{content:"";position:absolute;z-index:-1;inset:-18%;border-radius:50%;background:radial-gradient(circle,rgba(var(--iw-control-aura, 230,188,101),.48) 0%,rgba(var(--iw-control-aura, 230,188,101),.25) 28%,rgba(var(--iw-control-aura, 230,188,101),.09) 49%,transparent 72%);opacity:0;transform:scale(.88);animation:iw-control-captured-aura 7.4s ease-in-out infinite;animation-play-state:paused;transition:opacity 1.2s ease-out;will-change:transform,opacity}[data-iw-control=red] .iw-control-crest{--iw-control-aura: 255, 48, 36}[data-iw-control=blue] .iw-control-crest{--iw-control-aura: 36, 142, 255}[data-iw-control=red] .iw-control-crest::before,[data-iw-control=blue] .iw-control-crest::before{opacity:.68;animation-play-state:running}.iw-control-crest-art{position:absolute;inset:0;opacity:0;background-repeat:no-repeat;background-size:contain;background-position:center;transition:opacity 1.2s cubic-bezier(.22,.61,.36,1)}.iw-control-crest-art{background-image:url(../assets/world-bosses/zone-control-contested-v3.png)}.iw-control-crest-art-red{--iw-crystal-light: 255,48,36}.iw-control-crest-art-blue{--iw-crystal-light: 36,142,255}[data-iw-control=red] .iw-control-crest-art-red,[data-iw-control=blue] .iw-control-crest-art-blue,[data-iw-control=contested] .iw-control-crest-art-contested{opacity:1}.iw-control-crest-art:not(.iw-control-crest-art-contested)::after{content:"";position:absolute;inset:0;clip-path:polygon(50% 25%,57% 31%,61% 42%,59% 51%,63% 61%,57% 68%,51% 76%,44% 68%,39% 57%,41% 47%,39% 39%,45% 30%);background:rgb(var(--iw-crystal-light));mix-blend-mode:color;filter:saturate(1.35) brightness(1.15) drop-shadow(0 0 5px rgba(var(--iw-crystal-light),.72));opacity:.72;animation:iw-control-resting-light 7.7s ease-in-out infinite;animation-play-state:paused}[data-iw-control=red] .iw-control-crest-art-red::after,[data-iw-control=blue] .iw-control-crest-art-blue::after{animation-play-state:running}.iw-control-sword-energy,.iw-control-crystal-core,.iw-control-meter-currents{position:absolute;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .85s ease-out,visibility 0s .85s}[data-iw-control=contested] .iw-control-sword-energy,[data-iw-control=contested] .iw-control-crystal-core,[data-iw-control=contested] .iw-control-meter-currents{opacity:.88;visibility:visible;transition-delay:0s}.iw-control-sword-energy{z-index:1;top:50%;left:50%;width:130%;height:10px;overflow:hidden;mix-blend-mode:screen;-webkit-mask:linear-gradient(90deg,transparent 7%,#000 16% 37%,transparent 45% 55%,#000 63% 84%,transparent 93%);mask:linear-gradient(90deg,transparent 7%,#000 16% 37%,transparent 45% 55%,#000 63% 84%,transparent 93%)}.iw-control-sword-energy-red{transform:translate(-50%,-50%) rotate(45deg);--iw-energy-color: 255,70,42}.iw-control-sword-energy-blue{transform:translate(-50%,-50%) rotate(-45deg);--iw-energy-color: 44,171,255}.iw-control-sword-energy::before,.iw-control-sword-energy::after,.iw-control-impact{content:"";position:absolute;inset:0 auto 0 0;width:48%;background:radial-gradient(ellipse at 78% 50%,#fffcefff,rgba(255,245,207,.94) 7%,rgba(var(--iw-energy-color),.92) 22%,rgba(var(--iw-energy-color),.42) 48%,transparent 75%);filter:drop-shadow(0 0 2px rgba(255,248,220,.9)) drop-shadow(0 0 5px rgba(var(--iw-energy-color),.8));opacity:0}.iw-control-sword-energy-red::before{animation:iw-control-filament-red 7.3s cubic-bezier(.35,0,.45,1) -2.1s infinite}.iw-control-sword-energy-blue::before{animation:iw-control-filament-blue 10.9s cubic-bezier(.3,0,.6,1) -5.3s infinite}.iw-control-sword-energy-red::after{animation:iw-control-filament-blue 13.7s ease-in-out -8.4s infinite}.iw-control-sword-energy-blue::after{animation:iw-control-filament-red 17.3s ease-in-out -1.6s infinite}.iw-control-crystal-core{z-index:2;inset:26% 39% 25%;overflow:hidden;clip-path:polygon(50% 0,77% 18%,91% 67%,50% 100%,9% 67%,23% 18%);background:radial-gradient(ellipse at 45% 58%,#fff7b926,#e6a13918 48%,transparent 75%);mix-blend-mode:screen}.iw-control-crystal-core::before,.iw-control-crystal-core::after{content:"";position:absolute;inset:-35% -55%;background:radial-gradient(ellipse at 30% 64%,#fff5ce99,#f5bc424d 22%,transparent 49%),radial-gradient(ellipse at 74% 24%,#82cfff59,transparent 42%);animation:iw-control-crystal-flow 8.3s cubic-bezier(.37,0,.63,1) -3.7s infinite}.iw-control-crystal-core::after{background:radial-gradient(ellipse at 68% 42%,#fff4cb88,#ff704233 27%,transparent 51%);animation:iw-control-crystal-undertow 11.7s ease-in-out -7.2s infinite}.iw-control-sword-energy::before,.iw-control-sword-energy::after,.iw-control-crystal-core::before,.iw-control-crystal-core::after{animation-play-state:paused}[data-iw-control=contested] .iw-control-sword-energy::before,[data-iw-control=contested] .iw-control-sword-energy::after,[data-iw-control=contested] .iw-control-crystal-core::before,[data-iw-control=contested] .iw-control-crystal-core::after{animation-play-state:running}.iw-control-readout{grid-area:readout;align-self:end;min-width:0;padding-bottom:2px}.iw-control-kicker{margin:0 0 2px!important;color:#93866f!important;font:600 9px/1.2 var(--iw-font-head)!important;letter-spacing:.22em;text-transform:uppercase}.iw-control-state{margin:0!important;color:#f3e4c7!important;font:700 20px/1.2 var(--iw-font-head)!important;letter-spacing:.035em;text-shadow:0 2px 5px #000,0 0 12px color-mix(in srgb,var(--iw-boss-accent) 28%,transparent)}.iw-control-meter{grid-area:meter;align-self:center;min-width:0}.iw-control-meter-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:5px}.iw-control-meter-label,.iw-control-meter-value{color:#bdb39e;font:600 10px/1.2 var(--iw-font-body, sans-serif);letter-spacing:.08em;text-transform:uppercase}.iw-control-meter-value{color:var(--iw-boss-accent);font-variant-numeric:tabular-nums;white-space:nowrap}.iw-control-meter-track{position:relative;height:18px;overflow:hidden;border:1px solid color-mix(in srgb,var(--iw-boss-accent) 58%,#3b3023);border-radius:2px;background:linear-gradient(#080807,#14120e)!important;box-shadow:inset 0 3px 8px #000d,0 0 0 1px #000,0 0 9px color-mix(in srgb,var(--iw-boss-accent) 13%,transparent)}.iw-control-meter-track::before,.iw-control-meter-track::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none}.iw-control-meter-track::before{background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(0,0,0,.78) calc(10% - 1px) 10%)}.iw-control-meter-track::after{inset:3px 5px auto;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent)}.iw-control-meter-fill{position:relative;display:block;height:100%;min-width:0;overflow:hidden;background:linear-gradient(180deg,#ff8b73,#b82d2d 47%,#5f1118)!important;transition:width .6s ease}.iw-control-meter-fill::before{content:"";position:absolute;inset:0 0 0 auto;width:0;background:linear-gradient(180deg,#83d7ff,#297ac3 47%,#123a72);transition:width .7s cubic-bezier(.22,.61,.36,1)}[data-iw-control=blue] .iw-control-meter-fill::before{width:100%}[data-iw-control=contested] .iw-control-meter-fill::before{width:calc(100% - var(--iw-control-split, 50%))}.iw-control-meter-currents{inset:0}.iw-control-current-red,.iw-control-current-blue{position:absolute;top:0;bottom:0;overflow:hidden}.iw-control-current-red{left:0;width:var(--iw-control-split, 50%)}.iw-control-current-blue{right:0;width:calc(100% - var(--iw-control-split, 50%))}.iw-control-current-red::after,.iw-control-current-blue::after{content:"";position:absolute;inset:0 auto 0 -40%;width:40%;background:linear-gradient(100deg,transparent,#ffe7aa44,transparent);animation:iw-control-meter-current 5.7s ease-in-out -2s infinite;animation-play-state:paused}.iw-control-current-blue::after{animation-duration:8.1s;animation-delay:-5.6s;animation-direction:reverse}[data-iw-control=contested] .iw-control-current-red::after,[data-iw-control=contested] .iw-control-current-blue::after{animation-play-state:running}.iw-control-meter-fill::after{content:"";position:absolute;top:0;bottom:0;left:var(--iw-control-split, 50%);width:7px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,#f5d67caa,transparent);opacity:0;transition:opacity .85s ease,left .7s ease}[data-iw-control=contested] .iw-control-meter-fill::after{opacity:.75}.iw-control-factions{grid-area:factions;display:grid!important;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding-top:5px;border-top:1px solid rgba(154,126,75,.2)}.iw-control-faction{font:600 9px/1.2 var(--iw-font-head);letter-spacing:.11em;text-transform:uppercase;opacity:.45}.iw-control-faction-red{color:#ef7777;text-align:left}.iw-control-faction-blue{color:#7abcf0;text-align:right}.iw-control-versus{color:#a98e5c;font-size:10px}[data-iw-control=red] .iw-control-faction-red,[data-iw-control=blue] .iw-control-faction-blue,[data-iw-control=contested] .iw-control-faction{opacity:1;text-shadow:0 0 7px currentColor}@keyframes iw-control-resting-light{0%,100%{opacity:.62;filter:saturate(1.25) brightness(1.06) drop-shadow(0 0 3px rgba(var(--iw-crystal-light),.5))}46%{opacity:.84;filter:saturate(1.45) brightness(1.22) drop-shadow(0 0 7px rgba(var(--iw-crystal-light),.82))}}@keyframes iw-control-captured-aura{0%,100%{transform:scale(.88);filter:brightness(.82)}47%{transform:scale(1.06);filter:brightness(1.2)}}@keyframes iw-control-filament-red{0%,12%{opacity:0;transform:translateX(-110%) scaleX(.6)}24%{opacity:.82;transform:translateX(26%) scaleX(.9)}36%{opacity:.28;transform:translateX(116%) scaleX(.5)}49%{opacity:1;transform:translateX(191%) scaleX(1.2)}65%,100%{opacity:0;transform:translateX(320%) scaleX(.4)}}@keyframes iw-control-filament-blue{0%,21%{opacity:0;transform:translateX(330%) scaleX(.5)}34%{opacity:.74;transform:translateX(205%) scaleX(1.15)}53%{opacity:1;transform:translateX(117%) scaleX(.7)}67%{opacity:.4;transform:translateX(29%) scaleX(1)}81%,100%{opacity:0;transform:translateX(-110%) scaleX(.4)}}@keyframes iw-control-crystal-flow{0%,100%{transform:translate(-9%,13%) rotate(-13deg) scale(.96);opacity:.66}29%{transform:translate(12%,3%) rotate(8deg) scale(1.07);opacity:.82}64%{transform:translate(-2%,-14%) rotate(-5deg) scale(.98);opacity:.72}}@keyframes iw-control-crystal-undertow{0%,100%{transform:translate(13%,-7%) rotate(11deg);opacity:.58}41%{transform:translate(-11%,12%) rotate(-17deg);opacity:.79}73%{transform:translate(5%,5%) rotate(4deg);opacity:.63}}@keyframes iw-control-meter-current{0%,17%{transform:translateX(0);opacity:0}39%{opacity:.65}76%,100%{transform:translateX(350%);opacity:0}}[data-iw-encounter=zone]>[data-iw-boss-role=control-hp],[data-iw-encounter=zone]>[data-iw-boss-role=control-progress],[data-iw-encounter=zone] [data-iw-boss-role=control-strength]{display:none!important}[data-iw-encounter=zone] [data-iw-boss-role=timer]{display:inline-block;margin:0!important;color:#c4b897!important}[data-iw-encounter=zone] [data-iw-boss-role=timer]::before{content:"✧ ";color:var(--iw-boss-accent)}[data-iw-encounter=zone]>[data-iw-boss-role=control-queue]{grid-column:1 / -1;order:1}[data-iw-encounter=zone]>[data-iw-boss-role=control-teams]{grid-column:1 / -1;order:2;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px}[data-iw-encounter=zone]>[data-iw-boss-role=control-teams]>*{margin:0!important;min-width:0}[data-iw-encounter=zone]>[data-iw-boss-role=control-teams]>p{grid-column:1 / -1}@media(max-width:480px){[data-iw-encounter=zone]>[data-iw-boss-role=control-teams]{grid-template-columns:minmax(0,1fr)}}[data-iw-encounter=zone]>[data-iw-boss-role=participation]{grid-column:2;grid-row:3;justify-self:end;float:none!important;margin:5px 4px 0 12px!important;color:#aaa18e!important;font-size:10px!important}@media(max-width:760px){[data-iw-encounter]{padding:10px!important}[data-iw-encounter]:not([data-iw-encounter=zone]){grid-template-columns:92px minmax(0,1fr);column-gap:10px}[data-iw-encounter]>.iw-boss-art{width:92px;height:92px;top:10px;left:10px}[data-iw-encounter]:not([data-iw-encounter=zone])>.iw-boss-art{inset:auto!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=header]{padding-left:0;min-height:0;flex-wrap:wrap;gap:6px!important}[data-iw-encounter] [data-iw-boss-role=title]{font-size:16px!important}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=status]{grid-column:1 / -1;grid-row:4;padding-left:0}[data-iw-encounter]:not([data-iw-encounter=zone])>[data-iw-boss-role=details]{grid-row:5}[data-iw-encounter]:not([data-iw-encounter=zone])>.iw-boss-rewards{grid-row:6}[data-iw-encounter=zone]{padding:10px!important}.iw-control-dominion{grid-template-columns:118px minmax(0,1fr);column-gap:10px;min-height:118px;padding-inline:0!important}.iw-control-crest{width:118px}.iw-control-crest::before{inset:-12%}[data-iw-control=red] .iw-control-crest::before,[data-iw-control=blue] .iw-control-crest::before{opacity:.52}.iw-control-sword-energy{height:7px}[data-iw-control=contested] .iw-control-sword-energy-red,[data-iw-control=contested] .iw-control-sword-energy-blue{opacity:.6}[data-iw-control=contested] .iw-control-crystal-core{opacity:.45}.iw-control-sword-energy::after,.iw-control-crystal-core::after{display:none;animation:none}.iw-control-sword-energy-red::before{animation-duration:10.3s}.iw-control-sword-energy-blue::before{animation-duration:14.9s}.iw-control-crystal-core::before{animation-duration:11.3s}.iw-control-state{font-size:15px!important}.iw-control-meter-head{gap:5px}.iw-control-meter-label,.iw-control-meter-value{font-size:9px;letter-spacing:.045em}.iw-control-meter-track{height:15px}.iw-control-factions{gap:5px}.iw-control-faction{font-size:8.5px;letter-spacing:.045em;line-height:1.25}.iw-boss-reward-list{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}[data-iw-encounter] button.iw-boss-reward{width:auto!important;min-height:72px!important}.iw-boss-reward-name{font-size:10px!important}}@media(max-width:380px){[data-iw-encounter]:not([data-iw-encounter=zone]){grid-template-columns:80px minmax(0,1fr)}[data-iw-encounter]>.iw-boss-art{width:80px;height:80px}[data-iw-encounter]{--iw-boss-action-w: 120px}.iw-control-dominion{grid-template-columns:88px minmax(0,1fr)}.iw-control-crest{width:88px}.iw-control-state{font-size:13px!important}}@media(prefers-reduced-motion:reduce){.iw-control-dominion *,.iw-control-dominion *::before,.iw-control-dominion *::after{animation:none!important;transition:none!important}.iw-control-impact{visibility:hidden!important}}[data-iw-market=row]{border-radius:var(--iw-r-panel)!important;border:1px solid var(--iw-line)!important;background:rgba(7,7,11,.66)!important;backdrop-filter:blur(2px)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)!important;transition:border-color .12s,background-color .12s!important}[data-iw-market=row]:hover{border-color:var(--iw-line-hi)!important;background:rgba(12,12,17,.72)!important}[data-iw-market=row][class*=opacity-30]{background:rgba(4,4,7,.6)!important;backdrop-filter:none!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)!important}[data-iw-market=row][class*=opacity-30]:hover{border-color:var(--iw-line)!important;background:rgba(4,4,7,.6)!important}[data-iw-market=namebtn]{background:transparent!important;border-color:transparent!important;box-shadow:none!important}[data-iw-village]{--iw-village-accent: var(--iw-th-accent)}[data-iw-village=addons] [data-iw-village-role=intro]{margin:0 0 12px!important;color:#a49c88!important;font-size:11.5px!important;line-height:1.45!important}[data-iw-village=addons] [data-iw-village-role=note]{margin:10px 0 0!important;padding:8px 11px!important;border-left:2px solid var(--iw-th-edge-mid);background:rgba(0,0,0,.28);color:#9a9280!important;font-family:var(--iw-font-flav)!important;font-size:12.5px!important;font-style:italic;line-height:1.4!important}[data-iw-village=slot]{position:relative!important;display:grid!important;grid-template-columns:var(--iw-village-art-w, 100px) minmax(0,1fr);align-items:center;column-gap:13px;row-gap:10px;padding:12px!important;border:1px solid var(--iw-th-edge)!important;border-radius:var(--iw-r-panel)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(120% 90% at 8% 0%,rgba(255,236,190,.05),transparent 46%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(143,107,55,.14),inset 0 1px 0 rgba(255,236,190,.035),0 2px 7px rgba(0,0,0,.42)!important}[data-iw-village=slot]::before{content:""!important;position:absolute!important;inset:0 0 auto!important;height:1px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi),rgba(200,168,97,.16) 34%,transparent 72%)!important;opacity:.9!important}[data-iw-village=slot]>*{position:relative;z-index:1}[data-iw-village=slot]>[data-iw-village-role=head]{grid-column:2;min-width:0}[data-iw-village=slot] [data-iw-village-role=copy],[data-iw-village=slot] [data-iw-village-role=actions]{background:transparent!important;min-width:0}[data-iw-village=slot]>[data-iw-village-role=picker]{grid-column:1 / -1;margin-top:0!important;border-top:1px solid var(--iw-th-edge-faint)!important;padding-top:11px!important}[data-iw-village-art]{grid-column:1;grid-row:1;align-self:center;position:relative;width:var(--iw-village-art-w, 100px);height:var(--iw-village-art-w, 100px);border:1px solid color-mix(in srgb,var(--iw-village-accent) 34%,#2A2318);border-radius:2px;background:radial-gradient(66% 30% at 50% 84%,color-mix(in srgb,var(--iw-village-accent) 26%,transparent),transparent 72%),radial-gradient(120% 86% at 50% 6%,rgba(120,140,180,.10),transparent 64%),linear-gradient(180deg,#0C0D11 0%,#07070A 100%);box-shadow:inset 0 0 22px rgba(0,0,0,.62),0 3px 12px rgba(0,0,0,.45);pointer-events:none}[data-iw-village-art]::before{content:"";position:absolute;inset:0;border-radius:inherit;background-image:var(--iw-village-sprite, none);background-repeat:no-repeat;background-position:center 46%;background-size:88% auto;filter:drop-shadow(0 3px 5px rgba(0,0,0,.55))}[data-iw-village-art=generic]::after,[data-iw-village=slot][data-iw-village-state=vacant] [data-iw-village-art]::after{content:"";position:absolute;inset:52% 24% 22%;border:1px dashed color-mix(in srgb,var(--iw-village-accent) 46%,transparent);border-radius:1px;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-village-accent) 12%,transparent),transparent);box-shadow:0 0 14px color-mix(in srgb,var(--iw-village-accent) 14%,transparent)}[data-iw-village=slot][data-iw-village-state=vacant]{--iw-village-accent: #6E7482;opacity:.92}[data-iw-village=slot][data-iw-village-state=vacant] [data-iw-village-art]{border-style:dashed;box-shadow:inset 0 0 18px rgba(0,0,0,.58)}[data-iw-village=slot][data-iw-village-state=installed]:hover [data-iw-village-art]{border-color:color-mix(in srgb,var(--iw-village-accent) 58%,#2A2318);box-shadow:inset 0 0 22px rgba(0,0,0,.5),0 3px 16px rgba(0,0,0,.5),0 0 0 1px color-mix(in srgb,var(--iw-village-accent) 18%,transparent)}[data-iw-village-role=index]{margin:0 0 3px!important;color:var(--iw-th-accent-dim)!important;font-family:var(--iw-font-ui)!important;font-size:9.5px!important;font-weight:600!important;letter-spacing:.2em!important;text-transform:uppercase}[data-iw-village-role=name]{margin:0!important;color:#EBDCB8!important;font-family:var(--iw-font-head)!important;font-size:15px!important;font-weight:600!important;line-height:1.3!important;text-shadow:0 1px 0 #000,0 0 14px rgba(212,173,99,.12)}[data-iw-village-role=vacant]{margin:0!important;color:#857F72!important;font-family:var(--iw-font-flav)!important;font-size:14px!important;font-style:italic}[data-iw-village-role=effects]{margin:7px 0 0!important;padding:5px 9px!important;border-left:2px solid color-mix(in srgb,var(--iw-village-accent) 52%,transparent);border-radius:0 2px 2px 0;background:rgba(0,0,0,.3);color:#B9C7A8!important;font-size:11.5px!important;line-height:1.5!important}[data-iw-village-role=actions]{display:flex!important;flex-direction:column;flex-shrink:0;gap:6px!important}[data-iw-village-role=action]{min-width:92px;padding:7px 11px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:var(--iw-r-control)!important;background:linear-gradient(180deg,#22211C 0%,#14140F 100%)!important;color:#D6CBB0!important;font-family:var(--iw-font-ui)!important;font-size:11.5px!important;font-weight:600!important;letter-spacing:.05em!important;text-transform:uppercase;box-shadow:inset 0 1px 0 rgba(255,236,190,.05),0 1px 2px rgba(0,0,0,.45)!important;transition:border-color .12s,background-color .12s,color .12s!important}[data-iw-village-role=action]:hover:not(:disabled){border-color:var(--iw-th-rule)!important;color:#F0E6CC!important}[data-iw-village-role=action]:disabled{opacity:.45!important}[data-iw-village-action=install],[data-iw-village-action=upgrade]{border-color:var(--iw-th-cta-hi)!important;background:linear-gradient(180deg,var(--iw-th-cta-hi) 0%,var(--iw-th-cta) 100%)!important;color:#FFF2E2!important}[data-iw-village-action=install]:hover:not(:disabled),[data-iw-village-action=upgrade]:hover:not(:disabled){border-color:#E9743A!important;color:#FFF!important}[data-iw-village-action=destroy]:hover:not(:disabled){border-color:#8E4038!important;color:#E6B4AC!important}[data-iw-village-role=picker]{display:grid;gap:7px}[data-iw-village-role=option]{display:block!important;width:100%!important;padding:8px 10px!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:var(--iw-r-control)!important;background:rgba(9,9,12,.55)!important;text-align:left!important;font-size:11.5px!important;transition:border-color .12s,background-color .12s!important}[data-iw-village-role=option]>p:not([data-iw-village-role]),[data-iw-village-role=option-owned]>p:not([data-iw-village-role]){margin:3px 0 0 43px!important;color:#A7B79A!important;font-size:11px!important;line-height:1.4!important}[data-iw-village-role=option-owned]>p:not([data-iw-village-role]){color:#8A8478!important;font-style:italic}[data-iw-village-role=option]:hover:not(:disabled){border-color:var(--iw-th-rule)!important;background:rgba(18,16,12,.7)!important}[data-iw-village-role=option-owned]{padding:8px 10px!important;border:1px dashed var(--iw-th-edge-faint)!important;border-radius:var(--iw-r-control)!important;background:rgba(0,0,0,.3)!important}[data-iw-village-role=option-name]{display:flex!important;align-items:center;gap:9px;margin:0!important;color:#E3D6B6!important;font-family:var(--iw-font-head)!important;font-size:13px!important;line-height:1.25!important}[data-iw-village-role=option-name]>span:not(.iw-village-option-art){color:var(--iw-th-accent-dim)!important;font-family:var(--iw-font-ui)!important;font-size:11px!important}.iw-village-option-art{flex:0 0 auto;width:34px;height:34px;border:1px solid var(--iw-th-edge-soft);border-radius:2px;background-image:var(--iw-village-sprite, none);background-repeat:no-repeat;background-position:center 50%;background-size:84% auto;background-color:#08080B;box-shadow:inset 0 0 10px rgba(0,0,0,.6)}[data-iw-village=house]{position:relative!important;display:grid!important;grid-template-columns:var(--iw-village-house-w, 132px) minmax(0,1fr);column-gap:16px;align-items:start;padding:14px!important;border:1px solid var(--iw-th-edge)!important;border-radius:var(--iw-r-panel)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(90% 120% at 12% 0%,rgba(255,236,190,.06),transparent 52%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px #0B0A08,inset 0 0 0 2px rgba(143,107,55,.16),0 2px 9px rgba(0,0,0,.45)!important}[data-iw-village=house]>*{grid-column:2;position:relative;z-index:1}[data-iw-village=house]>[data-iw-village-art]{grid-column:1;grid-row:1 / span 4;width:var(--iw-village-house-w, 132px);height:var(--iw-village-house-w, 132px)}[data-iw-village-role=house-name]{margin:0 0 2px!important;color:#F0E1BC!important;font-family:var(--iw-font-head)!important;font-size:19px!important;font-weight:600!important;line-height:1.25!important;text-shadow:0 1px 0 #000,0 0 16px rgba(212,173,99,.14)}[data-iw-village-role=house-tier]{margin:0!important;color:var(--iw-th-accent-dim)!important;font-size:11px!important;letter-spacing:.04em!important}[data-iw-village-role=house-note]{color:#8E8878!important;font-family:var(--iw-font-flav)!important;font-size:12.5px!important;font-style:italic;line-height:1.4!important}[data-iw-village-role=house-salvage]{color:#C0B79F!important;font-size:11.5px!important}[data-iw-village=house]>p{margin:6px 0 0!important}[data-iw-village=house]>p:first-of-type{margin-top:0!important}[data-iw-village-role=house-next]{margin-top:9px!important;padding:6px 9px!important;border-left:2px solid color-mix(in srgb,var(--iw-th-cta-hi) 60%,transparent);border-radius:0 2px 2px 0;background:rgba(0,0,0,.3);font-size:11.5px!important;line-height:1.45!important}[data-iw-village-role=house-max]{margin-top:9px!important;font-family:var(--iw-font-head)!important;font-size:12.5px!important;letter-spacing:.04em!important}[data-iw-village=house] [data-iw-village-action=upgrade]{margin-top:11px!important;width:100%}.iw-village-tiers{grid-column:1!important;display:flex;justify-content:center;gap:5px;margin-top:9px}.iw-village-tier-pip{width:9px;height:9px;border:1px solid var(--iw-th-edge-mid);transform:rotate(45deg)}.iw-village-tier-pip[data-iw-village-pip=held]{border-color:var(--iw-th-accent);background:linear-gradient(160deg,var(--iw-th-accent),var(--iw-th-brass));box-shadow:0 0 7px rgba(212,173,99,.35)}@media(max-width:760px){[data-iw-village=slot]{--iw-village-art-w: 76px;column-gap:11px;padding:10px!important}[data-iw-village=slot]>[data-iw-village-role=head]{display:contents!important}[data-iw-village=slot] [data-iw-village-role=copy]{grid-column:2;grid-row:1}[data-iw-village=slot] [data-iw-village-role=actions],[data-iw-village=slot]>[data-iw-village-role=head]>[data-iw-village-role=action]{grid-column:1 / -1;grid-row:2}[data-iw-village-role=actions]{flex-direction:row!important}[data-iw-village-role=action]{flex:1 1 0;min-width:0;padding:8px 9px!important}[data-iw-village=slot]>[data-iw-village-role=picker]{grid-row:3}[data-iw-village-role=name]{font-size:15px!important}[data-iw-village=house]{--iw-village-house-w: 104px;padding:11px!important}[data-iw-village-role=house-name]{font-size:17px!important}}@media(max-width:380px){[data-iw-village=slot]{--iw-village-art-w: 64px}[data-iw-village=house]{--iw-village-house-w: 88px;grid-template-columns:var(--iw-village-house-w) minmax(0,1fr)}}@media(prefers-reduced-motion:reduce){[data-iw-village-role=action],[data-iw-village-role=option],[data-iw-village-art]{transition:none!important}}\n';

  // src/styles/village-scene.css
  var village_scene_default = '.iw-village-scene{min-width:0;width:100%;box-sizing:border-box;margin-top:12px}.iw-village-scene *{box-sizing:border-box}.iw-vs-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:15px}.iw-vs-title{font-family:var(--iw-font-display, "Cinzel", serif);color:#eee4cb;font-size:var(--iw-frame-title-size, 18px);font-weight:600}.iw-vs-count{color:#c4b992;font-size:11px}.iw-vs-scene{position:relative;width:100%;container-type:inline-size;container-name:iw-village;isolation:isolate;height:clamp(290px,23vw,320px);max-width:680px;margin:auto;overflow:hidden;border:1px solid #777e5155;border-radius:12px;background:linear-gradient(#0c160c2e,#0c160c4d),url(../assets/village/cobblestone.png) center/100% 100% no-repeat;box-shadow:inset 0 0 45px #09110966}.iw-vs-plot>.iw-vs-name,.iw-vs-plot>.iw-vs-status{position:absolute;left:-7px;right:-7px}.iw-vs-house>strong,.iw-vs-house>.iw-vs-status{position:absolute;left:0;right:0}.iw-vs-plot>.iw-vs-name,.iw-vs-house>strong{bottom:15px}.iw-vs-plot>.iw-vs-status,.iw-vs-house>.iw-vs-status{bottom:0}.iw-vs-house{position:absolute;z-index:1;left:50%;top:0;width:40%;height:52%;transform:translateX(-50%);text-align:center}.iw-vs-sprite{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 10px #0006)}.iw-vs-house>.iw-vs-sprite,.iw-vs-house>.iw-vs-placeholder{width:min(240px,100%);height:100%;margin:0 auto}.iw-vs-house>strong{font-size:14px}.iw-vs-plot{position:absolute;z-index:2;width:27%;height:130px;text-align:center}.iw-vs-plot[data-slot="1"]{left:1%;top:2%}.iw-vs-plot[data-slot="2"]{right:1%;top:2%}.iw-vs-plot[data-slot="3"]{left:3%;bottom:2%}.iw-vs-plot[data-slot="4"]{right:3%;bottom:2%}.iw-vs-plot[data-slot="5"]{left:50%;bottom:0;transform:translateX(-50%)}.iw-vs-plot>.iw-vs-sprite,.iw-vs-plot>.iw-vs-placeholder{width:100%;height:100%}.iw-vs-name{font-size:11px;line-height:1.35;overflow-wrap:anywhere}.iw-vs-status{font-size:10px;line-height:1.35}.iw-vs-scene strong,.iw-vs-scene .iw-vs-status{color:#f3f0df;text-shadow:0 1px 3px #10170c,0 0 7px #10170c}.iw-vs-placeholder{display:grid;place-items:center;padding-bottom:30px;color:#e2dcbbc9;font-size:52px;text-shadow:0 3px 7px #10170c}.iw-vs-house>.iw-vs-placeholder{font-size:64px}.iw-vs-plot[data-plot-state=locked] .iw-vs-placeholder{opacity:.55}.iw-vs-note{margin:13px 0 0;color:#b9b2a0;font-size:11px;line-height:1.6}@container iw-village (max-width: 470px){.iw-vs-plot{width:30%;height:104px}.iw-vs-name{font-size:10px}.iw-vs-status{font-size:9px}.iw-vs-house>.iw-vs-placeholder{font-size:52px}}@media(max-width:480px){.iw-village-scene{--iw-frame-pad-x:12px}}.iw-vs-body{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px;container-type:inline-size;container-name:iw-village-frame}.iw-vs-stage{flex:1 1 330px;min-width:0;display:flex;flex-direction:column}.iw-vs-ledger{flex:1 1 250px;min-width:0;display:flex;flex-direction:column;gap:8px}@container iw-village-frame (min-width:592px){.iw-vs-ledger{max-width:310px}}.iw-vs-ledger-title,.iw-vs-totals-title{font-family:var(--iw-font-display, "Cinzel", serif);color:#eee4cb;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}.iw-vs-ledger-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:3px;border-bottom:1px solid #777e5155}.iw-vs-ledger-toggle{flex:0 0 22px;width:22px;height:22px;display:grid;place-items:center;padding:0;color:#c9a24d;cursor:pointer}.iw-vs-ledger-list{display:flex;flex-direction:column;gap:6px}[data-iw-village-ledger][data-iw-vs-open="0"]>.iw-vs-ledger-list{display:none}.iw-vs-entry{display:flex;flex-direction:column}.iw-vs-entry-head{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;text-align:left;cursor:pointer}.iw-vs-entry-icon{flex:0 0 26px;height:26px;display:grid;place-items:center;color:#e2dcbbc9;font-size:18px}.iw-vs-entry-sprite{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 3px #0008)}.iw-vs-entry-label{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}.iw-vs-entry-name{color:#f3f0df;font-size:12px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}.iw-vs-entry-meta{color:#b9b2a0;font-size:10px;line-height:1.3}.iw-vs-chevron{flex:0 0 8px;width:8px;height:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(1px) rotate(-135deg);transition:transform .16s ease}.iw-vs-entry-head>.iw-vs-chevron{margin-right:2px;color:#c9a24d}.iw-vs-entry[data-iw-vs-open="0"]>.iw-vs-entry-head>.iw-vs-chevron,[data-iw-village-ledger][data-iw-vs-open="0"]>.iw-vs-ledger-head .iw-vs-chevron{transform:translateY(-2px) rotate(45deg)}.iw-vs-entry[data-iw-vs-open="0"]>.iw-vs-entry-body{display:none}.iw-vs-entry-body{margin:5px 0 3px 12px;padding:0 2px 0 9px;border-left:1px solid #777e5155}.iw-vs-entry-note{margin:4px 0 0;color:#b9b2a0;font-size:10px;line-height:1.5}.iw-vs-entry-body>.iw-vs-stats+.iw-vs-entry-note{margin-top:6px}.iw-vs-stats{margin:0;display:grid;gap:2px}.iw-vs-stat{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;line-height:1.45}.iw-vs-stat dt{color:#c4b992;min-width:0;overflow-wrap:anywhere}.iw-vs-stat dd{margin:0;flex:0 0 auto;color:#f3f0df;font-variant-numeric:tabular-nums}.iw-vs-stat[data-iw-vs-stat-kind=skill-level]{position:relative;isolation:isolate;margin:2px -4px;padding:3px 6px 3px 11px;border:1px solid #c66d2b99;border-radius:6px;background:linear-gradient(90deg,#652b0bb8 0%,#3217099c 58%,#17100bc7 100%);box-shadow:inset 0 0 0 1px #ffb24a14,inset 0 0 10px #ff8a1f16,0 0 8px #e565223d}.iw-vs-stat[data-iw-vs-stat-kind=skill-level]::before{content:"";position:absolute;left:4px;top:50%;width:4px;height:4px;background:#ffad45;box-shadow:0 0 4px #ff8a1f,0 0 8px #e45b20;transform:translateY(-50%) rotate(45deg)}.iw-vs-stat[data-iw-vs-stat-kind=skill-level] dt{color:#efbd7a;text-shadow:0 0 6px #d75b2459}.iw-vs-stat[data-iw-vs-stat-kind=skill-level] dd{color:#ffe0b0;font-weight:700;text-shadow:0 0 5px #ff7a2e8f}.iw-vs-ledger-vacant{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 9px;border:1px dashed #777e5140;border-radius:10px;color:#9e9884;font-size:10px}.iw-vs-ledger-vacant[data-iw-vs-slot-state=locked]{opacity:.72}.iw-vs-totals{margin-top:4px;padding:8px 9px;border:1px solid #777e5155;border-radius:10px;background:linear-gradient(#0c160c3d,#0c160c14)}.iw-vs-totals-title{margin-bottom:5px}.iw-vs-totals-note{margin:7px 0 0;color:#9e9884;font-size:10px;line-height:1.5}@container iw-village-frame (min-width:592px){.iw-vs-ledger[data-iw-vs-open="0"]{align-self:stretch}.iw-vs-ledger[data-iw-vs-open="0"]>.iw-vs-totals{flex:1 1 auto}}@media(prefers-reduced-motion:reduce){.iw-vs-chevron{transition:none}}\n';

  // src/styles/collapsible.css
  var collapsible_default = '[data-iw-collapse-head]{position:relative!important;padding-right:30px!important}[data-iw-collapse]{position:absolute!important;top:50%!important;right:0!important;transform:translateY(-50%)!important;z-index:3!important;display:grid!important;place-items:center!important;width:22px!important;height:22px!important;padding:0!important;margin:0!important;border:1px solid var(--iw-th-edge-faint, #4B3D26)!important;border-radius:3px!important;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.34))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important;color:var(--iw-th-accent, #C9A24D)!important;cursor:pointer!important;line-height:0!important;-webkit-appearance:none!important;appearance:none!important}[data-iw-collapse]::after{content:""!important;width:6px!important;height:6px!important;border-right:1.5px solid currentColor!important;border-bottom:1.5px solid currentColor!important;transform:translateY(1px) rotate(-135deg)!important;transition:transform .16s ease!important}[data-iw-collapse][aria-expanded=false]::after{transform:translateY(-2px) rotate(45deg)!important}@media(pointer:coarse){[data-iw-collapse]::before{content:""!important;position:absolute!important;inset:-5px!important}}[data-iw-collapse]:hover{border-color:var(--iw-th-brass, #8A6A2C)!important;box-shadow:inset 0 0 9px -3px var(--iw-th-cta, #D8791F)!important}[data-iw-collapse]:focus-visible{outline:2px solid var(--iw-th-accent, #C9A24D)!important;outline-offset:2px!important}[data-iw-collapsed="1"]>*:not([data-iw-collapse]):not([data-iw-collapse-head]){display:none!important}[data-iw-collapsed="1"]{--iw-frame-pad-y: 7px;--iw-frame-pad-mobile-y: 7px;--iw-frame-pad-x: 22px;--iw-frame-pad-mobile-x: 16px}[data-iw-collapsed="1"] [data-iw-collapse-head]{min-height:0!important;margin:0!important;padding-top:0!important;padding-bottom:0!important;padding-left:22px!important;gap:0!important}[data-iw-collapsed="1"] [data-iw-collapse-head] *:not([data-iw-collapse-spine]):not([data-iw-collapse]){display:none!important}[data-iw-collapsed="1"] [data-iw-collapse-spine]{display:block!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important}[data-iw-collapsed="1"] [data-iw-collapse-title]{font-family:var(--iw-font-head, "Cinzel", Georgia, serif)!important;font-size:14px!important;font-weight:600!important;line-height:20px!important;letter-spacing:.08em!important;text-transform:none!important;text-align:left!important;color:var(--iw-text-hi)!important;text-shadow:0 1px 0 #000!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}[data-iw-collapsed="1"]::after{content:""!important;position:absolute!important;inset:-3px -1px!important;z-index:0!important;pointer-events:none!important;border-style:solid!important;border-width:34px 0 0 32px!important;border-color:transparent!important;border-image:var(--iw-corner-filigree) 50% / 34px 0 0 32px / 0 stretch!important}@media(prefers-reduced-motion:reduce){[data-iw-collapse]::after{transition:none!important}}\n';

  // src/styles/guild.css
  var guild_default = ':root [data-iw-guild=root]{min-width:0!important;--iw-guild-good: #91cba4;--iw-guild-good-rail: #67ab83;--iw-guild-warn: #e0bd78;--iw-guild-warn-rail: #c08a3a;--iw-guild-bad: #dc8a80;--iw-guild-bad-rail: #b4554a;--iw-guild-info: #8fc3da;--iw-guild-info-rail: #4f86a3;--iw-guild-plate: linear-gradient(180deg, rgba(255,255,255,.022), rgba(0,0,0,.18)), #100F0C}:root [data-iw-guild=root] [data-iw-guild-role=head]{gap:14px!important}:root [data-iw-guild=root] [data-iw-guild-role=subtitle]{margin-top:5px!important;color:var(--iw-dim)!important;font-size:11px!important}:root [data-iw-guild=root] [data-iw-guild-role=subtitle]>span:not([data-iw-guild-role]){color:var(--iw-text-hi)!important}:root [data-iw-guild=root] [data-iw-guild-role=badge]{padding:2px 6px!important;border:1px solid color-mix(in srgb,var(--iw-guild-good-rail) 55%,transparent)!important;border-radius:2px!important;background:color-mix(in srgb,var(--iw-guild-good-rail) 14%,transparent)!important;color:var(--iw-guild-good)!important;font-family:var(--iw-font-ui)!important;font-size:9px!important;letter-spacing:.14em!important;text-shadow:none!important;vertical-align:middle}:root [data-iw-guild=root] [data-iw-guild-role=head-link],:root [data-iw-guild=root] [data-iw-guild-role=effects-toggle]{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:var(--iw-dim)!important;font-size:10.5px!important;text-decoration:underline dotted color-mix(in srgb,currentColor 55%,transparent)!important;text-underline-offset:3px!important}:root [data-iw-guild=root] [data-iw-guild-role=head-link]:hover{color:var(--iw-text-hi)!important;filter:none!important}:root [data-iw-guild=root] [data-iw-guild-role=head-link][data-iw-guild-tone=bad]{color:color-mix(in srgb,var(--iw-guild-bad) 62%,var(--iw-faint))!important}:root [data-iw-guild=root] [data-iw-guild-role=head-link][data-iw-guild-tone=bad]:hover{color:var(--iw-guild-bad)!important}:root [data-iw-guild=root] [data-iw-guild-role=head-link][data-iw-raid-test]{padding:1px 6px!important;border:1px dashed color-mix(in srgb,#f5b84a 60%,transparent)!important;border-radius:4px!important;color:#f5c76a!important;text-decoration:none!important}:root [data-iw-guild=root] [data-iw-guild-role=head-link][data-iw-raid-test][aria-pressed=true]{background:rgba(245,184,74,.14)!important}:root [data-iw-guild-card]{position:relative!important}:root [data-iw-guild-card]::before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:1px!important;pointer-events:none!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi),rgba(200,168,97,.16) 34%,transparent 72%)!important;opacity:.8!important}:root [data-iw-guild=root] [data-iw-guild-role=card-title],:root [data-iw-guild=root] [data-iw-guild-card=boss] [data-iw-guild-role=boss-name],:root [data-iw-guild=root] [data-iw-guild-role=rc-title]{font-family:var(--iw-font-head)!important;font-weight:700!important;letter-spacing:.03em!important;color:var(--iw-text-hi)!important;text-shadow:0 1px 0 #000!important}:root [data-iw-guild=root] [data-iw-guild-role=card-title]{font-size:13px!important}:root [data-iw-guild=root] [data-iw-guild-role=card-title]>span{font-family:var(--iw-font-ui)!important;color:var(--iw-dim)!important;font-size:11px!important;letter-spacing:0!important}:root [data-iw-guild=root] [data-iw-guild-role=card-count]{color:var(--iw-dim)!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] [data-iw-guild-role=note]{color:var(--iw-faint)!important}:root [data-iw-guild=root] [data-iw-guild-role=subhead]{color:var(--iw-th-accent-dim)!important;font-size:9.5px!important;letter-spacing:.16em!important}:root [data-iw-guild=root] [data-iw-guild-role=guests]{border-top-color:var(--iw-th-edge-faint)!important}:root [data-iw-guild=root] [data-iw-guild-tone=good]{--iw-guild-ink: var(--iw-guild-good);--iw-guild-rail: var(--iw-guild-good-rail)}:root [data-iw-guild=root] [data-iw-guild-tone=warn]{--iw-guild-ink: var(--iw-guild-warn);--iw-guild-rail: var(--iw-guild-warn-rail)}:root [data-iw-guild=root] [data-iw-guild-tone=bad]{--iw-guild-ink: var(--iw-guild-bad);--iw-guild-rail: var(--iw-guild-bad-rail)}:root [data-iw-guild=root] [data-iw-guild-tone=info]{--iw-guild-ink: var(--iw-guild-info);--iw-guild-rail: var(--iw-guild-info-rail)}:root [data-iw-guild=root] [data-iw-guild-tone=accent]{--iw-guild-ink: var(--iw-th-accent);--iw-guild-rail: var(--iw-th-cta-hi)}:root [data-iw-guild=root] :is([data-iw-guild-role=line],[data-iw-guild-role=rc-roster] span,[data-iw-guild-card=ready-check] span)[data-iw-guild-tone]{color:var(--iw-guild-ink)!important}:root [data-iw-guild-card=ready-check][data-iw-guild-tone]{border-color:color-mix(in srgb,var(--iw-guild-rail) 70%,var(--iw-th-edge))!important;border-left:3px solid var(--iw-guild-rail)!important;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-guild-rail) 16%,transparent),transparent 70%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a),var(--iw-th-ground-b))!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 0 14px -6px var(--iw-guild-rail)!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-title]{color:var(--iw-guild-ink, var(--iw-text-hi))!important;font-size:13px!important}:root [data-iw-guild-card=ready-check][data-iw-guild-tone] [data-iw-guild-role=rc-title]{color:var(--iw-guild-ink)!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-timer]{color:var(--iw-guild-ink, var(--iw-dim))!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-roster]{color:var(--iw-text)!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-roster]>span{color:var(--iw-dim)!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-action]{min-height:28px!important;padding:0 12px!important;border:1px solid var(--iw-th-edge)!important;border-radius:2px!important;background:var(--iw-guild-plate)!important;color:var(--iw-text)!important}:root [data-iw-guild=root] [data-iw-guild-role=rc-action][data-iw-guild-tone]{border-color:var(--iw-guild-rail)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-guild-rail) 34%,#15130F),color-mix(in srgb,var(--iw-guild-rail) 14%,#0B0C0A))!important;color:var(--iw-guild-ink)!important}:root [data-iw-guild=root] [data-iw-guild-role=boss-tabs]{gap:0!important;padding-bottom:0!important;margin-bottom:8px!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:2px!important;background:rgba(0,0,0,.28)!important;overflow:hidden}:root [data-iw-guild=root] [data-iw-guild-role=boss-tab]{flex:1 1 auto!important;min-height:28px!important;padding:0 10px!important;border:0!important;border-right:1px solid var(--iw-th-edge-soft)!important;border-radius:0!important;background:linear-gradient(180deg,#211E18,#16140F)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.022)!important;color:#AAA291!important;font-size:11px!important;font-weight:700!important;letter-spacing:.04em!important;text-transform:uppercase!important}:root [data-iw-guild=root] [data-iw-guild-role=boss-tab]:last-child{border-right:0!important}:root [data-iw-guild=root] [data-iw-guild-role=boss-tab]:hover{color:var(--iw-text-hi)!important;filter:brightness(1.12)!important}:root [data-iw-guild=root] [data-iw-guild-role=boss-tab][data-iw-guild-state=selected],:root [data-iw-guild=root] [data-iw-guild-role=difficulty][data-iw-guild-state=selected]{color:#FFE8CB!important;background:linear-gradient(180deg,rgba(255,255,255,.035),transparent 46%),linear-gradient(180deg,var(--iw-th-cta),color-mix(in srgb,var(--iw-th-cta) 52%,#000))!important;box-shadow:inset 0 1px 0 rgba(255,226,191,.13),inset 0 -2px 0 rgba(55,16,4,.58)!important;text-shadow:0 1px 0 rgba(40,10,2,.8)!important}:root [data-iw-guild=root] [data-iw-guild-card=boss] [data-iw-guild-role=boss-name]{font-size:15px!important}:root [data-iw-guild=root] [data-iw-guild-role=lore]{font-family:var(--iw-font-flav)!important;font-size:13px!important;line-height:1.35!important;color:var(--iw-dim)!important}:root [data-iw-guild=root] [data-iw-guild-role=line]:not([data-iw-guild-tone]){color:var(--iw-dim)!important}:root [data-iw-guild=root] [data-iw-guild-role=line]:not([data-iw-guild-tone]) span{color:var(--iw-text-hi)!important;font-variant-numeric:tabular-nums}:root [data-iw-guild=root] [data-iw-guild-role=difficulties]{gap:4px!important;padding-top:6px!important}:root [data-iw-guild=root] [data-iw-guild-role=difficulty]{min-height:28px!important;border:1px solid var(--iw-th-edge-soft)!important;border-radius:2px!important;background:var(--iw-guild-plate)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important;color:var(--iw-dim)!important;font-size:10.5px!important;font-weight:700!important;letter-spacing:.05em!important;text-transform:uppercase!important}:root [data-iw-guild=root] [data-iw-guild-role=difficulty]:hover{border-color:var(--iw-th-rule)!important;color:var(--iw-text-hi)!important}:root [data-iw-guild=root] [data-iw-guild-role=difficulty][data-iw-guild-state=selected]{border-color:var(--iw-th-cta-hi)!important}:root [data-iw-guild=root] [data-iw-guild-role=difficulty][data-iw-guild-state=locked]{border-style:dashed!important;color:var(--iw-faint)!important;background:rgba(0,0,0,.24)!important}:root [data-iw-guild=root] [data-iw-guild-role=notice]{border:1px solid var(--iw-th-edge-faint)!important;border-left:2px solid var(--iw-guild-rail, var(--iw-th-rule))!important;border-radius:2px!important;background:color-mix(in srgb,var(--iw-guild-rail, var(--iw-th-edge)) 12%,rgba(0,0,0,.25))!important;color:var(--iw-text)!important;padding:7px 10px!important}:root [data-iw-guild=root] [data-iw-guild-role=notice]>.font-semibold{color:var(--iw-guild-ink, var(--iw-text-hi))!important}:root [data-iw-guild=root] [data-iw-guild-role=notice]>span:not(.font-semibold){color:var(--iw-faint)!important;opacity:1!important}:root [data-iw-guild=root] [data-iw-guild-role=lb-row]{min-height:26px!important;padding:3px 8px!important;border:0!important;border-bottom:1px solid var(--iw-th-edge-faint)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}:root [data-iw-guild=root] [data-iw-guild-role=lb-row]:hover{background:rgba(255,255,255,.03)!important;filter:none!important}:root [data-iw-guild=root] [data-iw-guild-role=lb-row]>:first-child:not([data-iw-guild-tone]){color:var(--iw-text)!important}:root [data-iw-guild=root] [data-iw-guild-role=lb-row]>[data-iw-guild-tone=accent]{color:var(--iw-th-accent)!important}:root [data-iw-guild=root] [data-iw-guild-role=lb-row]>:last-child{color:var(--iw-dim)!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] :is([data-iw-guild-role=member],[data-iw-guild-role=guest],[data-iw-guild-role=potion]){border:1px solid var(--iw-th-edge-faint)!important;border-radius:2px!important;background:var(--iw-guild-plate)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025),inset 0 -6px 10px -8px rgba(0,0,0,.8)!important}:root [data-iw-guild=root] [data-iw-guild-role=guest]{border-left:2px solid var(--iw-guild-info-rail)!important}:root [data-iw-guild=root] [data-iw-guild-role=member-name]{font-family:var(--iw-font-ui)!important;font-weight:700!important}:root [data-iw-guild=root] [data-iw-guild-role=dot][data-iw-guild-state=online]{box-shadow:0 0 5px color-mix(in srgb,var(--iw-guild-good) 70%,transparent)!important}:root [data-iw-guild=root] [data-iw-guild-role=points]{color:var(--iw-th-accent-dim)!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] [data-iw-guild-role=chip]{border:1px solid var(--iw-th-edge-soft)!important;border-radius:2px!important;background:rgba(0,0,0,.3)!important;color:var(--iw-dim)!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] :is([data-iw-guild-role=lend-pill],[data-iw-guild-role=picker]){border:1px solid color-mix(in srgb,var(--iw-guild-info-rail) 70%,transparent)!important;border-left-width:2px!important;border-radius:2px!important;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-guild-info-rail) 20%,#0B0C0A),color-mix(in srgb,var(--iw-guild-info-rail) 6%,#0B0C0A))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important;color:var(--iw-guild-info)!important}:root [data-iw-guild=root] :is([data-iw-guild-role=lend-pill],[data-iw-guild-role=picker]) [class*=text-sky-300]{color:color-mix(in srgb,var(--iw-guild-info) 60%,var(--iw-faint))!important}:root [data-iw-guild=root] [data-iw-guild-role=picker]:hover{border-color:var(--iw-guild-info)!important;filter:brightness(1.1)!important}:root [data-iw-guild=root] [data-iw-guild-role=option]{border:0!important;border-bottom:1px solid var(--iw-th-edge-faint)!important;border-radius:0!important;background:#0E0E0B!important;box-shadow:none!important}:root [data-iw-guild=root] [data-iw-guild-role=option]:hover,:root [data-iw-guild=root] [data-iw-guild-role=option][data-iw-guild-state=selected]{background:color-mix(in srgb,var(--iw-guild-info-rail) 18%,#0E0E0B)!important}:root [data-iw-guild=root] [data-iw-guild-role=ready-badge]{border:1px solid color-mix(in srgb,var(--iw-guild-rail, var(--iw-guild-good-rail)) 80%,transparent)!important;border-radius:2px!important;background:color-mix(in srgb,var(--iw-guild-rail, var(--iw-guild-good-rail)) 18%,#0B0C0A)!important;color:var(--iw-guild-ink, var(--iw-guild-good))!important;letter-spacing:.12em!important;box-shadow:0 0 8px -3px var(--iw-guild-rail, var(--iw-guild-good-rail))!important}:root [data-iw-guild=root] [data-iw-guild-role=not-ready]{color:var(--iw-faint)!important;font-style:italic!important}:root [data-iw-guild=root] [data-iw-guild-role=potion]>span{color:var(--iw-text)!important}:root [data-iw-guild=root] [data-iw-guild-role=potion]>span>span{color:var(--iw-faint)!important;font-variant-numeric:tabular-nums}:root [data-iw-guild=root] [data-iw-guild-role=drink]{min-height:24px!important;padding:0 11px!important;border:1px solid var(--iw-th-edge)!important;border-radius:2px!important;background:linear-gradient(180deg,#242018,#15130F)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;color:var(--iw-text)!important;font-weight:700!important;letter-spacing:.05em!important;text-transform:uppercase!important}:root [data-iw-guild=root] [data-iw-guild-role=drink]:hover:not(:disabled){border-color:var(--iw-th-rule)!important;color:var(--iw-text-hi)!important}:root [data-iw-guild=root] [data-iw-guild-role=drink]:disabled{opacity:.5!important}:root [data-iw-guild=root] [data-iw-guild-role=select]{min-height:32px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:2px!important;background:#080A09!important;box-shadow:inset 0 2px 7px rgba(0,0,0,.48)!important}:root [data-iw-guild=root] :is([data-iw-guild-role=cta],[data-iw-guild-role=start]){min-height:32px!important;padding:0 16px!important;border:1px solid var(--iw-th-cta-hi)!important;border-radius:2px!important;background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 62%,#000))!important;box-shadow:inset 0 1px 0 rgba(255,218,174,.14)!important;color:#FFF0DA!important;font-family:var(--iw-font-head)!important;font-weight:700!important;text-shadow:0 1px 0 #3A1005!important}:root [data-iw-guild=root] :is([data-iw-guild-role=cta],[data-iw-guild-role=start]):hover:not(:disabled){filter:brightness(1.12)!important}:root [data-iw-guild=root] :is([data-iw-guild-role=cta],[data-iw-guild-role=start]):disabled{filter:saturate(.45) brightness(.7)!important}:root [data-iw-guild=root] [data-iw-guild-role=ready-toggle]{min-height:38px!important;border:1px solid var(--iw-th-cta-hi)!important;border-radius:2px!important;background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 58%,#000))!important;box-shadow:inset 0 1px 0 rgba(255,218,174,.14)!important;color:#FFF0DA!important;font-family:var(--iw-font-head)!important;font-size:14px!important;letter-spacing:.06em!important;text-shadow:0 1px 0 #3A1005!important}:root [data-iw-guild=root] [data-iw-guild-role=ready-toggle][data-iw-guild-state=ready]{border-color:var(--iw-guild-good-rail)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-guild-good-rail) 38%,#15130F),color-mix(in srgb,var(--iw-guild-good-rail) 14%,#0B0C0A))!important;box-shadow:inset 0 1px 0 rgba(200,255,220,.08),0 0 12px -4px var(--iw-guild-good-rail)!important;color:var(--iw-guild-good)!important;text-shadow:0 1px 0 #000!important}:root [data-iw-guild=root] [data-iw-guild-role=ready-toggle]:hover:not(:disabled){filter:brightness(1.1)!important}:root [data-iw-guild=root] [data-iw-guild-role=chat-feed]{border:1px solid var(--iw-th-edge-mid)!important;border-radius:2px!important;background:#0B0C0A linear-gradient(180deg,rgba(255,255,255,.018),transparent 22%)!important;box-shadow:inset 0 0 18px rgba(0,0,0,.24)!important;scrollbar-color:var(--iw-th-edge-mid) #11110E!important;scrollbar-width:thin!important}:root [data-iw-guild=root] [data-iw-guild-role=chat-feed]>*{margin:0!important;padding:3px 4px!important;border-bottom:1px solid var(--iw-th-edge-faint)!important;line-height:1.35!important}:root [data-iw-guild=root] [data-iw-guild-role=chat-feed]>:last-child{border-bottom:0!important}:root [data-iw-guild=root] [data-iw-guild-role=chat-feed]>*>span:last-child{color:var(--iw-text)!important}:root [data-iw-guild=root] [data-iw-guild-role=composer]{gap:8px!important}:root [data-iw-guild=root] :is([data-iw-guild-role=chat-input],[data-iw-guild-role=field]){min-height:32px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:2px!important;background:#080A09!important;box-shadow:inset 0 2px 7px rgba(0,0,0,.48)!important}:root [data-iw-guild=root] :is([data-iw-guild-role=chat-input],[data-iw-guild-role=field]):focus{outline:1px solid rgba(197,145,67,.5)!important;outline-offset:1px!important;border-color:var(--iw-th-brass)!important}:root [data-iw-guild=root] [data-iw-guild-role=start]{min-height:38px!important;font-size:14px!important;letter-spacing:.06em!important}:root [data-iw-guild-card=ready]:has([data-iw-guild-role=start]) [data-iw-guild-role=ready-toggle]:not([data-iw-guild-state=ready]){border-color:var(--iw-th-edge)!important;background:var(--iw-guild-plate)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important;color:var(--iw-text)!important;text-shadow:0 1px 0 #000!important}:root [data-iw-guild=root] :is([data-iw-guild-card=pickup],[data-iw-guild-card=form],[data-iw-guild-card=directory]) [data-iw-guild-role=note]{color:var(--iw-dim)!important;font-size:10.5px!important;line-height:1.4!important}:root [data-iw-guild-card=pickup] [data-iw-guild-role=note]{margin-top:3px!important}:root [data-iw-guild-card=form] [data-iw-guild-role=card-count]{color:var(--iw-dim)!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] [data-iw-guild-role=kick]{min-height:0!important;padding:0 2px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:var(--iw-faint)!important}:root [data-iw-guild=root] [data-iw-guild-role=kick]:hover{color:var(--iw-guild-bad)!important;filter:none!important}:root [data-iw-guild=root] [data-iw-guild-role=chip][data-iw-guild-tone]{border-color:color-mix(in srgb,var(--iw-guild-rail) 70%,transparent)!important;color:var(--iw-guild-ink)!important}:root [data-iw-guild=root] :is([data-iw-guild-role=disclosure],[data-iw-guild-role=guild-name]){min-height:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;filter:none!important}:root [data-iw-guild=root] [data-iw-guild-role=disclosure]:hover [data-iw-guild-role=card-title]{color:#FFF0DA!important}:root [data-iw-guild=root] [data-iw-guild-role=disclosure-hint]{color:var(--iw-th-accent-dim)!important;font-size:10px!important;letter-spacing:.08em!important;text-transform:uppercase!important}:root [data-iw-guild=root] [data-iw-guild-role=directory]{border:1px solid var(--iw-th-edge-mid)!important;border-radius:2px!important;background:#0B0C0A!important;box-shadow:inset 0 0 18px rgba(0,0,0,.24)!important;padding:2px!important;scrollbar-color:var(--iw-th-edge-mid) #11110E!important;scrollbar-width:thin!important}:root [data-iw-guild=root] [data-iw-guild-role=directory]>*+*{margin-top:0!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-row]{border-bottom:1px solid var(--iw-th-edge-faint)!important;border-radius:0!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-row]:last-child{border-bottom:0!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-row]:hover{background:rgba(255,255,255,.025)!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-row][data-iw-guild-state=open]{background:color-mix(in srgb,var(--iw-th-cta) 8%,#0E0E0B)!important;box-shadow:inset 2px 0 0 var(--iw-th-cta-hi)!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-name]{color:var(--iw-dim)!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-name]>span:last-child{color:var(--iw-text-hi)!important;font-family:var(--iw-font-ui)!important;font-weight:700!important}:root [data-iw-guild=root] [data-iw-guild-role=guild-name]:hover>span:last-child{color:#FFF0DA!important}:root [data-iw-guild=root] [data-iw-guild-role=capacity]{color:var(--iw-dim)!important;font-variant-numeric:tabular-nums!important}:root [data-iw-guild=root] [data-iw-guild-role=apply]{min-height:20px!important;padding:0 8px!important;border:1px solid var(--iw-guild-rail, var(--iw-th-edge))!important;border-radius:2px!important;background:linear-gradient(180deg,color-mix(in srgb,var(--iw-guild-rail, var(--iw-th-edge)) 30%,#15130F),color-mix(in srgb,var(--iw-guild-rail, var(--iw-th-edge)) 10%,#0B0C0A))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important;color:var(--iw-guild-ink, var(--iw-text))!important;letter-spacing:.06em!important;text-transform:uppercase!important}:root [data-iw-guild=root] [data-iw-guild-role=apply]:hover:not(:disabled){filter:brightness(1.15)!important}:root [data-iw-guild=root] [data-iw-guild-role=apply]:disabled{opacity:.5!important}:root [data-iw-guild=root] [data-iw-guild-role=arena]{border:1px solid var(--iw-th-edge)!important;border-radius:3px!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.7),inset 0 0 0 3px color-mix(in srgb,var(--iw-th-edge) 35%,transparent),inset 0 0 40px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.35)!important}:root [data-iw-guild=root] :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth]){position:relative!important;isolation:isolate;overflow:hidden!important;background:#160706!important}:root :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth])::before,:root :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth])::after,:root :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth])>.raid-ember{display:none!important}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art]){display:none;position:absolute!important;inset:0;margin:0!important;pointer-events:none!important;overflow:hidden;z-index:0;contain:strict}:root :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth])>:is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art]){display:block}:root :is([data-iw-raid-scene=ashmaw],[data-iw-raid-scene=thessaly],[data-iw-raid-scene=morwenna],[data-iw-raid-scene=grimjaw],[data-iw-raid-scene=skarth])>:not(:is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])):not(.raid-ember,[data-iw-raid-cast]){position:relative;z-index:1;text-shadow:0 1px 3px #000,0 0 8px #000;min-width:0;margin:0!important}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])+:not(.raid-ember){margin-top:0!important}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])>canvas,:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])>[data-iw-art=environment]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:70% 50%}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,7,5,.25),transparent 35%,transparent 55%,rgba(8,7,5,.6))}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])>canvas{display:none}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])[data-iw-animated]>canvas{display:block}:root :is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])[data-iw-animated]>img{display:none}:root :is([data-iw-raid-boss-stage=ashmaw],[data-iw-raid-boss-stage=thessaly],[data-iw-raid-boss-stage=morwenna],[data-iw-raid-boss-stage=grimjaw],[data-iw-raid-boss-stage=skarth]){display:none!important}:root :is([data-iw-raid-boss-stage=ashmaw],[data-iw-raid-boss-stage=thessaly],[data-iw-raid-boss-stage=morwenna],[data-iw-raid-boss-stage=grimjaw],[data-iw-raid-boss-stage=skarth])>img{visibility:hidden!important}:root [data-iw-guild=root] [data-iw-raid-scene=thessaly]{background:#101017!important}:root [data-iw-thessaly-art]::after{background:linear-gradient(180deg,rgba(9,11,14,.25),transparent 35%,transparent 55%,rgba(9,11,14,.63))}:root [data-iw-guild=root] [data-iw-raid-scene=morwenna]{background:#151019!important}:root [data-iw-morwenna-art]::after{background:linear-gradient(180deg,rgba(13,9,17,.25),transparent 35%,transparent 55%,rgba(13,9,17,.63))}:root [data-iw-guild=root] [data-iw-raid-scene=grimjaw]{background:#111923!important}:root [data-iw-grimjaw-art]::after{background:linear-gradient(180deg,rgba(9,14,22,.25),transparent 35%,transparent 55%,rgba(9,14,22,.63))}:root [data-iw-guild=root] [data-iw-raid-hud]{--iw-raid-brass: #d4ad63;--iw-raid-ivory: #f0e8d6;--iw-raid-read: #b7ad99;--iw-raid-dim: #938a79;--iw-raid-teal: #8fc6dc;--iw-raid-good: #8fd0a3;--iw-raid-bad: #e89aa9;--iw-raid-plate: rgba(9, 9, 7, .82);position:relative!important;isolation:isolate;overflow:hidden!important;display:grid!important;grid-template-columns:minmax(240px,300px) minmax(0,1fr) minmax(240px,300px);grid-template-rows:auto auto minmax(150px,1fr) auto auto auto auto;grid-template-areas:"boss  boss    ." "cast  cast    ." ".      result  ." "timers timers  timers" "party  party   party" ".      status  ." ".      actions .";gap:10px 22px!important;padding:26px 26px 18px!important;min-height:clamp(780px,60vw,900px);font-family:var(--iw-font-ui)!important;color:var(--iw-raid-ivory)}:root [data-iw-raid-hud]>:not(.raid-ember):not([data-iw-ashmaw-art]):not([data-iw-thessaly-art]):not([data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art],[data-iw-raid-cast]){position:relative;z-index:1;min-width:0;margin:0!important}:root [data-iw-raid-hud]>[data-iw-guild-role=boss-summary]{grid-area:boss}:root [data-iw-raid-hud]>[data-iw-guild-role=telegraph]{grid-area:cast}:root [data-iw-raid-hud]>.raid-arena-floor{grid-area:party}:root [data-iw-raid-hud]>:is([data-iw-guild-role=combat-log-region],[data-iw-guild-role=combat-log],[data-iw-guild-role=effects]){display:none!important}:root [data-iw-raid-hud]>.iw-raid-timers{grid-area:timers}:root [data-iw-raid-hud]>[data-iw-guild-role=status]{grid-area:status}:root [data-iw-raid-hud]>[data-iw-guild-role=actions]{grid-area:actions}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome]{grid-area:result}:root [data-iw-raid-hud] .raid-readable-panel{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}:root [data-iw-raid-hud]>[data-iw-guild-role=boss-summary]{container-type:inline-size;width:min(100%,560px);justify-self:start;text-align:left!important;text-shadow:0 2px 4px #000,0 0 14px rgba(0,0,0,.85)!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>:first-child{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:4px;font-size:inherit!important}:root [data-iw-raid-hud] [data-iw-raid-boss]{font-size:0!important;line-height:0!important}:root [data-iw-raid-hud] [data-iw-raid-boss]::before{content:attr(data-iw-raid-epithet);display:block;margin-bottom:8px;font:700 11px/1 var(--iw-font-ui);letter-spacing:.3em;text-transform:uppercase;color:var(--iw-raid-brass)}:root [data-iw-raid-hud] [data-iw-raid-boss]::after{content:attr(data-iw-raid-boss);display:block;font:700 clamp(30px,3.2vw,44px)/1 var(--iw-font-head);letter-spacing:.03em;color:var(--iw-raid-ivory)}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>:first-child>:not([data-iw-raid-boss]){font:600 12px/1 var(--iw-font-ui)!important;letter-spacing:.04em;color:var(--iw-raid-good)!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>:first-child>:not([data-iw-raid-boss])::before{content:"";display:inline-block;width:6px;height:6px;margin-right:7px;vertical-align:1px;background:currentColor;box-shadow:0 0 6px currentColor;transform:rotate(45deg)}:root [data-iw-raid-hud]{--iw-shell-l: 280;--iw-shell-t: 168;--iw-shell-r: 132;--iw-shell-b: 170}:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]{position:relative;isolation:isolate;box-sizing:border-box!important;width:100%!important;height:auto!important;aspect-ratio:1216 / 406;margin:2px 0 0 -2%!important;padding:calc(var(--iw-shell-t) * 100% / 1216) calc(var(--iw-shell-r) * 100% / 1216) calc(var(--iw-shell-b) * 100% / 1216) calc(var(--iw-shell-l) * 100% / 1216)!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important;background:transparent!important;filter:drop-shadow(0 6px 10px rgba(0,0,0,.6))}:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:var(--iw-raid-boss-shell, none) center / 100% 100% no-repeat}:root [data-iw-raid-hud][data-iw-raid-encounter=ashmaw]{--iw-raid-boss-shell: url(../assets/raids/ui-kit-v1/sprites/boss-health-ashmaw.png);--iw-shell-l: 270;--iw-shell-t: 158;--iw-shell-r: 82;--iw-shell-b: 156}:root [data-iw-raid-hud][data-iw-raid-encounter=thessaly]{--iw-raid-boss-shell: url(../assets/raids/ui-kit-v1/sprites/boss-health-thessaly.png);--iw-shell-l: 269;--iw-shell-t: 159;--iw-shell-r: 77;--iw-shell-b: 157}:root [data-iw-raid-hud][data-iw-raid-encounter=morwenna]{--iw-raid-boss-shell: url(../assets/raids/ui-kit-v1/sprites/boss-health-morwenna.png);--iw-shell-l: 271;--iw-shell-t: 159;--iw-shell-r: 83;--iw-shell-b: 157}:root [data-iw-raid-hud][data-iw-raid-encounter=grimjaw]{--iw-raid-boss-shell: url(../assets/raids/ui-kit-v1/sprites/boss-health-grimjaw.png);--iw-shell-l: 263;--iw-shell-t: 154;--iw-shell-r: 93;--iw-shell-b: 162}:root [data-iw-raid-hud][data-iw-raid-encounter=skarth]{--iw-raid-boss-shell: url(../assets/raids/ui-kit-v1/sprites/boss-health-skarth.png);--iw-shell-l: 272;--iw-shell-t: 159;--iw-shell-r: 75;--iw-shell-b: 156}:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]>*{border-radius:999px!important;transition:width .4s ease-out!important;box-shadow:inset 0 1px 0 rgba(255,190,160,.45),inset 0 -1px 0 rgba(40,6,6,.8),2px 0 7px rgba(231,102,72,.55)!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]>[class*=bg-rose],:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]>[class*=bg-red]{background:linear-gradient(180deg,#e0654f 0%,#a92e24 32%,#6d1715 84%,#b9422a)!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>p{display:flex!important;align-items:center;justify-content:center;position:relative;z-index:2;height:calc((406 - var(--iw-shell-t) - var(--iw-shell-b)) * 100cqw / 1216);margin:calc((var(--iw-shell-t) - 406) * 100cqw / 1216) calc(var(--iw-shell-r) * 100cqw / 1216 + 2cqw) calc(var(--iw-shell-b) * 100cqw / 1216) calc(var(--iw-shell-l) * 100cqw / 1216 - 2cqw)!important;font:700 clamp(12px,2.5cqw,15px)/1 var(--iw-font-ui)!important;letter-spacing:.02em;color:#fff4e6!important;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000,0 0 5px #000!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>p[data-iw-raid-pct]::after{content:attr(data-iw-raid-pct);position:absolute;right:2.4cqw;font:800 clamp(11px,2.2cqw,13px)/1 var(--iw-font-ui);color:#ffd8bf}:root [data-iw-raid-hud]>[data-iw-guild-role=telegraph]{justify-self:start;width:min(100%,470px);margin-left:4px!important;border:1px solid rgba(201,162,77,.35)!important;background:var(--iw-raid-plate)!important;font:600 13px/1.3 var(--iw-font-ui)!important;color:var(--iw-raid-ivory)!important;text-align:left!important}:root [data-iw-raid-cast]{--iw-cast-fill: 100%;--iw-cast-ink: linear-gradient(180deg, #d0352c, #9c1a16 55%, #6a0f0d)}:root [data-iw-raid-hud]>[data-iw-raid-cast]{--iw-shell-w: min(100%, 560px);position:relative!important;z-index:1;min-width:0;font-size:0!important;justify-self:start;align-self:start;width:calc(var(--iw-shell-w) * .661184)!important;height:24px;margin:calc(var(--iw-shell-w) * -.09 - 10px) 0 0 calc(var(--iw-shell-w) * .210263)!important;padding:0!important;border:0!important;border-radius:5px!important;background:linear-gradient(90deg,transparent,rgba(255,226,150,.9) 35%,#fff8e0 50%,rgba(255,226,150,.9) 65%,transparent) calc(var(--iw-cast-fill) - 3px) center / 6px 100% no-repeat,var(--iw-cast-ink) left center / var(--iw-cast-fill) 100% no-repeat,linear-gradient(180deg,#1c1714,#0b0908)!important;box-shadow:inset 0 0 0 1px #000,inset 0 0 0 2px #4a4540,inset 0 0 0 3px #1a1816,inset 0 3px 4px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.7),0 3px 8px rgba(0,0,0,.55)!important}:root [data-iw-raid-cast]::before,:root [data-iw-raid-cast]::after{position:absolute;top:0;bottom:0;display:flex;align-items:center;font:600 13px/1 var(--iw-font-ui);color:#fff4e6;text-shadow:0 1px 2px #000,0 0 4px #000}:root [data-iw-raid-cast]::before{content:attr(data-iw-raid-cast-name) " · " attr(data-iw-raid-cast-scope);left:10px;right:46px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}:root [data-iw-raid-cast-scope=""]::before{content:attr(data-iw-raid-cast-name)}:root [data-iw-raid-cast]::after{content:attr(data-iw-raid-cast-secs);right:10px;font-variant-numeric:tabular-nums}:root [data-iw-raid-cast-step="0"]{--iw-cast-fill: 0%}:root [data-iw-raid-cast-step="1"]{--iw-cast-fill: 10%}:root [data-iw-raid-cast-step="2"]{--iw-cast-fill: 20%}:root [data-iw-raid-cast-step="3"]{--iw-cast-fill: 30%}:root [data-iw-raid-cast-step="4"]{--iw-cast-fill: 40%}:root [data-iw-raid-cast-step="5"]{--iw-cast-fill: 50%}:root [data-iw-raid-cast-step="6"]{--iw-cast-fill: 60%}:root [data-iw-raid-cast-step="7"]{--iw-cast-fill: 70%}:root [data-iw-raid-cast-step="8"]{--iw-cast-fill: 80%}:root [data-iw-raid-cast-step="9"]{--iw-cast-fill: 90%}:root [data-iw-raid-cast-step="10"]{--iw-cast-fill: 100%}:root [data-iw-raid-cast-urgency=near]{--iw-cast-ink: linear-gradient(180deg, #e5562f, #b42a17 55%, #7c150c)}:root [data-iw-raid-cast-urgency=now]{--iw-cast-ink: linear-gradient(180deg, #ff7a52, #d63a22 55%, #8e1a0e)}@media(prefers-reduced-motion:no-preference){:root [data-iw-raid-cast-urgency=now]{animation:iw-raid-cast-pulse .7s ease-in-out infinite alternate}}@keyframes iw-raid-cast-pulse{to{filter:drop-shadow(0 0 12px rgba(239,106,75,.75)) brightness(1.12)}}:root [data-iw-raid-hud]>.raid-arena-floor{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch!important;justify-self:center;width:min(100%,860px);gap:8px!important;padding:0!important;background:none!important;text-shadow:none!important}:root [data-iw-raid-hud]>.raid-arena-floor::after{content:none!important;display:none!important}:root [data-iw-raid-hud]>.raid-arena-floor::before{position:static!important;inset:auto!important;transform:none!important;width:auto!important;height:auto!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;filter:none!important;opacity:1!important;animation:none!important;z-index:auto!important;pointer-events:none;content:"Raid party" " · " attr(data-iw-raid-party);flex:0 0 100%;grid-column:1 / -1;order:-2;text-align:center;margin-bottom:2px;font:700 10px/1 var(--iw-font-ui);letter-spacing:.3em;text-transform:uppercase;color:var(--iw-raid-brass);text-shadow:0 1px 3px #000}:root [data-iw-raid-hud] [data-iw-guild-role=raider]{--iw-frame-edge: var(--iw-th-edge);--iw-frame-glow: transparent;position:relative!important;display:grid!important;flex:1 1 150px;width:auto!important;max-width:none;min-width:0;grid-template-columns:20px minmax(0,1fr) auto;grid-template-areas:"ico name pct" "ico skill skill" "hp hp hp" "ch ch ch" "fx fx fx";align-items:center;align-content:start;column-gap:7px;row-gap:3px;padding:8px 9px 7px!important;text-align:left!important;border:1px solid var(--iw-frame-edge)!important;border-radius:var(--iw-r-panel, 3px)!important;border-image:none!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent) center top / calc(100% - 16px) 1px no-repeat,linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 0 12px var(--iw-frame-glow),0 4px 10px rgba(0,0,0,.55)!important;filter:none!important;opacity:1!important;cursor:default}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-self]{order:-1}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-frame=self]{--iw-frame-edge: #3d7487;--iw-frame-glow: rgba(111, 179, 201, .28)}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-frame=critical]{--iw-frame-edge: #8a3a2f;--iw-frame-glow: rgba(208, 97, 79, .32)}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-down]{filter:grayscale(.85) brightness(.7)!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-down]::after{content:"💀 Down";color:var(--iw-raid-bad);font-size:11px;letter-spacing:.04em}:root .iw-raid-fx:empty{display:none}:root [data-iw-raid-hud] [data-iw-guild-role=raider]>div:not([data-iw-guild-role]){display:none!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider]::before{content:"";grid-area:ico;align-self:start;width:22px;height:22px;margin-top:1px;background:center / contain no-repeat;opacity:.92}:root [data-iw-raid-hud] [data-iw-guild-role=raider]::after{content:attr(data-iw-raid-hp);grid-area:pct;justify-self:end;font:700 12px/1 var(--iw-font-ui);color:var(--iw-raid-ivory);font-variant-numeric:tabular-nums}:root [data-iw-raid-hud] [data-iw-guild-role=raider-name]{grid-area:name;width:auto!important;padding:0!important;border:0!important;background:none!important;font:700 13px/1.15 var(--iw-font-ui)!important;text-align:left!important;text-shadow:none!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}:root [data-iw-raid-hud] [data-iw-guild-role=raider-name]:not([class*=text-sky]){color:var(--iw-raid-ivory)!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider-skill]{grid-area:skill;width:auto!important;text-align:left!important;font:500 11px/1.15 var(--iw-font-ui)!important;color:var(--iw-raid-read)!important;text-shadow:none!important}:root [data-iw-raid-hud] :is([data-iw-guild-role=raider-hp],[data-iw-guild-role=raider-charge]){width:100%!important;margin-top:2px;border:1px solid #3f3a2c!important;border-radius:0!important;background:#050605!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.9)!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider-hp]{grid-area:hp;height:6px!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider-charge]{grid-area:ch;height:4px!important;margin-top:0;border-color:#2e3433!important}:root [data-iw-raid-hud] :is([data-iw-guild-role=raider-hp],[data-iw-guild-role=raider-charge])>*{border-radius:0!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)!important}:root [data-iw-raid-hud] [data-iw-guild-role=raider-charge]>*{background:linear-gradient(180deg,#b2d6e4,#4f8aa3)!important}:root .iw-raid-fx{grid-area:fx;display:flex;flex-wrap:wrap;gap:3px 6px;margin-top:3px;min-height:16px}:root .iw-raid-chip{display:inline-flex;align-items:center;gap:2px;white-space:nowrap;font:700 10.5px/14px var(--iw-font-ui);color:var(--iw-raid-ivory, #f0e8d6);font-variant-numeric:tabular-nums}:root .iw-raid-chip[data-iw-raid-tone=debuff]{color:var(--iw-raid-bad, #e89aa9)}:root .iw-raid-chip-icon{display:inline-grid;place-items:center;width:14px;height:14px;flex:none;font-style:normal;font-size:11px;line-height:1;background:center / contain no-repeat;filter:drop-shadow(0 1px 1px #000)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art]>.iw-raid-chip-icon{font-size:0}:root .iw-raid-chip-name{font-weight:600;color:var(--iw-raid-read, #b7ad99)}:root .iw-raid-chip[data-iw-raid-tone=debuff]>.iw-raid-chip-name{color:inherit}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=shield]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/shield.png)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=ward]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/ward.png)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=war-cry]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/war-cry.png)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=curse]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/curse.png)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=bleed]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/bleed.png)}:root :is(.iw-raid-chip,.iw-raid-timer)[data-iw-raid-art=taunt]>.iw-raid-chip-icon{background-image:url(../assets/raids/ui-kit-v1/sprites/taunt.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=combat]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-combat.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=jewelcrafting]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-jewelcrafting.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=tailoring]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-tailoring.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=construction]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-construction.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=mining]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-mining.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=woodcutting]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-woodcutting.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=alchemy]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-alchemy.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=gathering]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-gathering.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=smithing]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-smithing.png)}:root [data-iw-guild-role=raider][data-iw-raid-skill=spellcrafting]::before{background-image:url(../assets/raids/ui-kit-v1/sprites/skill-spellcrafting.png)}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome],:root .iw-raid-dock>.iw-raid-dock-panel{--iw-raid-corner-w: 25px 23px;border:1px solid transparent!important;border-radius:var(--iw-r-panel, 3px)!important;border-image:var(--iw-corner-filigree) 50% / var(--iw-raid-corner-w) / 0 stretch!important;background:linear-gradient(90deg,transparent,var(--iw-th-hairline) 14%,var(--iw-th-hairline-hi) 50%,var(--iw-th-hairline) 86%,transparent) center top / calc(100% - 24px) 1px no-repeat,linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,normal,soft-light,normal!important;box-shadow:0 0 0 1px var(--iw-th-edge),inset 0 0 0 1px rgba(0,0,0,.78),inset 0 1px 0 var(--iw-th-glow),0 8px 22px rgba(0,0,0,.55)!important;filter:none!important}:root [data-iw-raid-hud]>.iw-raid-timers{justify-self:center;width:min(100%,860px);display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 10px}.iw-raid-timer{position:relative;display:grid;grid-template-columns:16px auto minmax(0,1fr) auto;align-items:center;column-gap:7px;height:26px;padding:0 10px 0 8px;overflow:hidden;border:1px solid #3d7487;border-radius:var(--iw-r-panel, 3px);background:linear-gradient(180deg,#0b0d0d,#050605);box-shadow:inset 0 1px 3px rgba(0,0,0,.9),0 3px 8px rgba(0,0,0,.5);font:700 11px/1 var(--iw-font-ui);color:#fff;text-shadow:0 1px 2px #000,0 0 4px #000}.iw-raid-timer[data-iw-raid-tone=debuff]{border-color:#8a3a2f}.iw-raid-timer-fill{position:absolute;inset:0 auto 0 0;transition:width .9s linear}.iw-raid-timer[data-iw-raid-tone=buff]>.iw-raid-timer-fill{background:linear-gradient(180deg,#74b6dd,#2f6f9c 58%,#1c4568);box-shadow:inset 0 1px 0 rgba(214,238,252,.4)}.iw-raid-timer[data-iw-raid-tone=debuff]>.iw-raid-timer-fill{background:linear-gradient(180deg,#e0786a,#a8352b 58%,#6e1a15);box-shadow:inset 0 1px 0 rgba(255,214,205,.35)}.iw-raid-timer>:not(.iw-raid-timer-fill){position:relative;z-index:1;min-width:0}.iw-raid-timer>.iw-raid-chip-icon{width:16px;height:16px;font-size:12px}.iw-raid-timer-name{letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}.iw-raid-timer-who{font-weight:600;color:#e6ddcb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iw-raid-timer-secs{font-size:13px;font-variant-numeric:tabular-nums}@media(prefers-reduced-motion:reduce){.iw-raid-timer-fill{transition:none}}:root [data-iw-raid-hud]>[data-iw-guild-role=status]{justify-self:center;margin-top:-2px!important;text-align:center;font:italic 500 12px/1.2 var(--iw-font-ui)!important;color:var(--iw-raid-read)!important;text-shadow:0 1px 3px #000!important}:root [data-iw-raid-hud]>[data-iw-guild-role=actions]{justify-self:center;align-self:start;width:min(100%,540px);display:flex!important;flex-wrap:wrap;gap:10px!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=action]{--iw-compact-cap: 15px;flex:1 1 140px;height:44px!important;min-height:0!important;padding:0 24px!important;display:inline-flex!important;align-items:center;justify-content:center;gap:8px;border:0!important;border-radius:0!important;font:700 13px/1 var(--iw-font-head)!important;letter-spacing:.1em;text-transform:uppercase!important;color:var(--iw-raid-ivory)!important;text-shadow:0 1px 2px #000,0 0 4px #000!important;cursor:pointer}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=action].button-primary{color:#ffd2ad!important;box-shadow:0 0 16px rgba(217,120,74,.28)!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=action].button-primary>[data-iw-compact-layer]{box-shadow:inset 0 -2px var(--iw-th-cta-hi, #d9784a)!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=action]:disabled{opacity:.5!important;filter:saturate(.3)!important;cursor:not-allowed}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome]{justify-self:center;align-self:center;width:min(100%,460px);display:flex!important;flex-direction:column;align-items:center;gap:10px;padding:22px 30px 20px!important;text-align:center}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome]>p{margin:0!important;font:700 clamp(17px,1.6vw,21px)/1.25 var(--iw-font-head)!important;letter-spacing:.03em;color:var(--iw-raid-ivory)!important;text-shadow:0 2px 4px #000!important}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome][data-iw-guild-tone=bad]>p{color:var(--iw-raid-bad)!important}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome][data-iw-guild-tone=good]>p{color:var(--iw-raid-good)!important}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome][data-iw-guild-tone=warn]>p{color:#e8c27a!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=outcome-close]{margin:0!important;min-height:32px!important;padding:0 22px!important;border:1px solid #6f5631!important;border-radius:2px!important;background:linear-gradient(180deg,#2a241a,#13110d)!important;box-shadow:inset 0 1px 0 rgba(255,230,180,.12)!important;font:700 12px/1 var(--iw-font-head)!important;letter-spacing:.08em;color:var(--iw-raid-ivory)!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=outcome-close]:hover{filter:brightness(1.15)!important}:root .iw-raid-dock{--iw-raid-brass: #d4ad63;--iw-raid-ivory: #f0e8d6;--iw-raid-read: #b7ad99;--iw-raid-dim: #938a79;display:flex;flex-direction:column;gap:10px;margin-top:12px;font-family:var(--iw-font-ui);color:var(--iw-raid-ivory)}:root .iw-raid-dock>.iw-raid-dock-panel{padding:0!important}:root .iw-raid-dock>.iw-raid-dock-panel[hidden]{display:none!important}.iw-raid-dock-head{display:flex;align-items:center;gap:8px;width:100%;min-height:46px;margin:0;padding:12px 22px 12px 28px;border:0;background:none;box-shadow:none;cursor:pointer;text-align:left;font:700 12px/1 var(--iw-font-head);letter-spacing:.14em;text-transform:uppercase;color:var(--iw-raid-brass)}.iw-raid-dock-head:hover{filter:brightness(1.15)}.iw-raid-dock-head:focus-visible{outline:1px solid var(--iw-raid-brass);outline-offset:-4px}.iw-raid-dock-glyph{font-size:13px;letter-spacing:0}.iw-raid-dock-title{flex:1 1 auto;min-width:0}.iw-raid-dock-chevron{display:grid;place-items:center;width:22px;height:22px;flex:none}.iw-raid-dock-chevron::before{content:"";width:7px;height:7px;border:solid currentColor;border-width:0 2px 2px 0;transform:translateY(-2px) rotate(45deg);transition:transform .15s ease}.iw-raid-dock-head[aria-expanded=true] .iw-raid-dock-chevron::before{transform:translateY(2px) rotate(-135deg)}.iw-raid-dock-panel[data-iw-raid-fold=closed]>.iw-raid-dock-body{display:none}.iw-raid-dock-body{padding:0 26px 18px 28px;text-align:left}.iw-raid-dock-panel[data-iw-raid-dock=log]>.iw-raid-dock-body{max-height:260px;overflow-y:auto;overscroll-behavior:contain;margin-bottom:10px;padding-bottom:8px;scrollbar-width:thin;scrollbar-color:var(--iw-th-edge-mid, #5b4a2e) transparent}.iw-raid-dock-line{margin:0;font:500 12.5px/1.6 var(--iw-font-ui);color:var(--iw-raid-read)}.iw-raid-dock-line:last-child{color:var(--iw-raid-ivory)}.iw-raid-dock-panel[data-iw-raid-dock=skills]>.iw-raid-dock-body>div{margin:0;padding:4px 0 4px 9px;text-align:left;border-left:2px solid currentColor;font:600 12px/1.35 var(--iw-font-ui)}.iw-raid-dock-panel[data-iw-raid-dock=skills]>.iw-raid-dock-body>div+div{margin-top:3px}.iw-raid-dock-panel[data-iw-raid-dock=skills]>.iw-raid-dock-body>div:has(>p){border-left-color:var(--iw-th-edge-mid, #5b4a2e);color:var(--iw-raid-read);font-weight:500}.iw-raid-dock-panel[data-iw-raid-dock=skills]>.iw-raid-dock-body>div>p{margin:0}.iw-raid-dock-more{display:inline-block;margin:10px 0 0;padding:0;border:0;background:none;box-shadow:none;cursor:pointer;font:600 11px/1 var(--iw-font-ui);letter-spacing:.03em;color:var(--iw-raid-dim);text-decoration:underline dotted;text-underline-offset:3px}.iw-raid-dock-more:hover{color:var(--iw-raid-ivory)}.iw-raid-dock-panel[data-iw-raid-dock=skills]>.iw-raid-dock-body>[data-iw-raid-fx-kind=resist]{--iw-res: 0%;margin-top:8px;padding:7px 0 10px;border-left:0;border-top:1px solid #433722;background:linear-gradient(90deg,#b9612f,#e3a14c) left bottom / var(--iw-res) 3px no-repeat,linear-gradient(#0a0908,#0a0908) left bottom / 100% 3px no-repeat}:root [data-iw-raid-resist-step="0"]{--iw-res: 0%}:root [data-iw-raid-resist-step="1"]{--iw-res: 10%}:root [data-iw-raid-resist-step="2"]{--iw-res: 20%}:root [data-iw-raid-resist-step="3"]{--iw-res: 30%}:root [data-iw-raid-resist-step="4"]{--iw-res: 40%}:root [data-iw-raid-resist-step="5"]{--iw-res: 50%}:root [data-iw-raid-resist-step="6"]{--iw-res: 60%}:root [data-iw-raid-resist-step="7"]{--iw-res: 70%}:root [data-iw-raid-resist-step="8"]{--iw-res: 80%}:root [data-iw-raid-resist-step="9"]{--iw-res: 90%}:root [data-iw-raid-resist-step="10"]{--iw-res: 100%}@media(max-width:1099px){:root [data-iw-guild=root] [data-iw-raid-hud]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto minmax(120px,1fr) auto auto auto auto;grid-template-areas:"boss boss" "cast cast" "result result" "timers timers" "party party" "status status" "actions actions";gap:10px 14px!important;padding:22px 18px 16px!important;min-height:0}:root [data-iw-raid-hud]>.raid-arena-floor{max-width:744px;justify-self:center}:root [data-iw-raid-hud]>.iw-raid-timers{width:min(100%,744px)}}@media(max-width:699px){:root [data-iw-guild=root] [data-iw-raid-hud]{--iw-hero-h: clamp(220px, 74vw, 330px);grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto var(--iw-hero-h) auto auto auto auto auto auto;grid-template-areas:"boss boss" "hero hero" "hp hp" "cast cast" "timers timers" "party party" "status status" "actions actions";gap:10px 8px!important;padding:18px 12px 14px!important;min-height:0}:root [data-iw-guild=root] [data-iw-raid-hud][data-iw-raid-scene]{background:var(--iw-scene-bg, #0d0c0a)!important}:root [data-iw-raid-scene=ashmaw]{--iw-scene-bg: #160706}:root [data-iw-raid-scene=thessaly]{--iw-scene-bg: #101017}:root [data-iw-raid-scene=morwenna]{--iw-scene-bg: #151019}:root [data-iw-raid-scene=grimjaw]{--iw-scene-bg: #111923}:root [data-iw-raid-hud]>:is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art]){grid-area:hero;inset:-4px -12px!important}:root [data-iw-raid-hud]>:is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])>:is(canvas,img){object-position:97% 50%!important}:root [data-iw-raid-hud]>:is([data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art],[data-iw-grimjaw-art],[data-iw-skarth-art])::after{background:linear-gradient(180deg,var(--iw-scene-bg) 0%,transparent 24%,transparent 68%,var(--iw-scene-bg) 100%),linear-gradient(90deg,rgba(0,0,0,.35),transparent 18%,transparent 82%,rgba(0,0,0,.35))!important}:root [data-iw-raid-hud]>[data-iw-guild-role=boss-summary]{display:contents!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>*{position:relative;z-index:1;min-width:0;margin:0!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>:first-child{grid-area:boss;align-items:center!important;text-align:center;gap:6px}:root [data-iw-raid-hud] [data-iw-raid-boss]::before{margin-bottom:6px;letter-spacing:.26em}:root [data-iw-raid-hud] [data-iw-raid-boss]::after{font-size:clamp(30px,9vw,38px)}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>div:nth-child(2):not([data-iw-guild-role]){grid-area:hero;align-self:center;justify-self:center}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>div:nth-child(2):not([data-iw-guild-role])>img{height:calc(var(--iw-hero-h) * .62)!important;width:auto!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-hp]{grid-area:hp;width:100%!important;margin:0!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>p{grid-area:hp;align-self:stretch;z-index:2;height:auto!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;padding:calc(var(--iw-shell-t) * 100% / 1216) calc(var(--iw-shell-r) * 100% / 1216) calc(var(--iw-shell-b) * 100% / 1216) calc(var(--iw-shell-l) * 100% / 1216)!important;margin:0!important;font-size:14px!important}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>p::before{content:""}:root [data-iw-raid-hud] [data-iw-guild-role=boss-summary]>p[data-iw-raid-pct]::after{position:static;justify-self:end;padding-right:4px;font-size:12px}:root [data-iw-raid-hud]>[data-iw-guild-role=telegraph]:not([data-iw-raid-cast]){width:100%;margin-left:0!important;justify-self:stretch}:root [data-iw-raid-hud]>[data-iw-raid-cast]{--iw-shell-w: 100%;height:22px;margin:calc(var(--iw-shell-w) * -.09 - 10px) 0 0 calc(var(--iw-shell-w) * .230263)!important}:root [data-iw-raid-cast]::before{left:8px;right:38px;font-size:11.5px}:root [data-iw-raid-cast]::after{right:8px;font-size:12px}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome]{grid-area:hero;z-index:2;width:calc(100% - 24px)}:root [data-iw-raid-hud]>.raid-arena-floor{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;width:100%;gap:7px 6px!important}:root [data-iw-guild=root] [data-iw-raid-hud] [data-iw-guild-role=action]{--iw-compact-cap: 13px;height:40px!important;padding:0 16px!important;font-size:12px!important}:root [data-iw-raid-hud]>.raid-arena-floor::before{content:"Raid party";flex:0 0 calc(50% - 3px);text-align:left;margin:0;order:-4}:root [data-iw-raid-hud]>.raid-arena-floor::after{position:static!important;inset:auto!important;transform:none!important;width:auto!important;height:auto!important;border:0!important;background:none!important;box-shadow:none!important;filter:none!important;opacity:1!important;animation:none!important;display:block!important;content:attr(data-iw-raid-party)!important;flex:0 0 calc(50% - 3px);order:-3;text-align:right;font:600 10.5px/1 var(--iw-font-ui);color:var(--iw-raid-dim);text-shadow:0 1px 3px #000}:root [data-iw-raid-hud] [data-iw-guild-role=raider]{flex:0 0 calc((100% - 12px) / 3);max-width:none;padding:7px 6px 6px!important;grid-template-columns:16px minmax(0,1fr) auto;grid-template-columns:14px minmax(0,1fr) auto;grid-template-areas:"ico name name" "skill skill pct" "hp hp hp" "ch ch ch" "fx fx fx";column-gap:4px;row-gap:3px}:root [data-iw-raid-hud] [data-iw-guild-role=raider]::before{width:14px;height:14px;margin-top:0;align-self:center}:root [data-iw-raid-hud] [data-iw-guild-role=raider]::after{font-size:10.5px}:root [data-iw-raid-hud] [data-iw-guild-role=raider][data-iw-raid-down]::after{font-size:10px}:root [data-iw-raid-hud] [data-iw-guild-role=raider-name]{font-size:10.5px!important;letter-spacing:-.01em}:root [data-iw-raid-hud] [data-iw-guild-role=raider-skill]{font-size:10px!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}:root .iw-raid-fx{gap:2px 5px}:root .iw-raid-chip{font-size:10px}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome],:root .iw-raid-dock>.iw-raid-dock-panel{--iw-raid-corner-w: 20px 18px}.iw-raid-dock-head{min-height:42px;padding:10px 16px 10px 22px;font-size:11px;letter-spacing:.1em}.iw-raid-dock-body{padding:0 18px 14px 22px}:root [data-iw-raid-hud]>.iw-raid-timers{width:100%;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px 6px}.iw-raid-timer{height:24px;column-gap:5px;padding:0 7px 0 6px;font-size:10px}.iw-raid-timer-secs{font-size:12px}:root [data-iw-raid-hud]>[data-iw-guild-role=actions]{width:100%}:root [data-iw-raid-hud]>[data-iw-guild-role=outcome]{padding:18px 20px 16px!important}}:root [data-iw-guild=root] [data-iw-raid-scene=skarth]{background:#111c28!important}:root [data-iw-skarth-art]::after{background:linear-gradient(180deg,transparent 50%,rgba(8,16,25,.65))}@media(max-width:767px){:root [data-iw-raid-scene=skarth]{--iw-scene-bg: #111c28}}\n';

  // src/styles/compact-buttons.css
  var compact_buttons_default = '[data-iw-compact-layer]{display:none}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-compact-button]{--iw-compact-cap: 10px;position:relative!important;isolation:isolate!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important;filter:none!important;transform:none!important;transition:color 180ms ease-out!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-ui=nav-tab]{--iw-compact-cap: 12px}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-panel-part=send]{--iw-compact-cap: 14px}html[data-iw-compact-atlas=compact-ghost-v3]{--iw-compact-mid-size: 150% 326.6666666666667%;--iw-compact-mid-x: 21.428571428571427%;--iw-compact-cap-size: 1680% 326.6666666666667%;--iw-compact-left-x: 1.2658227848101267%;--iw-compact-right-x: 78.48101265822785%;--iw-compact-icon-size: 560% 326.6666666666667%;--iw-compact-icon-x: 98.55072463768116%}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-layer=idle]{--iw-compact-y: 2.9411764705882355%}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-layer=hover]{--iw-compact-y: 50%}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-layer=clicked]{--iw-compact-y: 97.05882352941177%}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]{display:block!important;position:absolute!important;inset:0!important;box-sizing:border-box!important;margin:0!important;border:0!important;border-radius:0!important;width:auto!important;height:auto!important;padding:0 var(--iw-compact-cap)!important;pointer-events:none!important;background-image:var(--iw-compact-atlas)!important;background-size:var(--iw-compact-mid-size)!important;background-position:var(--iw-compact-mid-x) var(--iw-compact-y)!important;background-repeat:no-repeat!important;background-origin:content-box!important;background-clip:content-box!important;opacity:1;z-index:-3}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]::before,html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]::after{content:""!important;position:absolute!important;top:0!important;bottom:0!important;width:var(--iw-compact-cap)!important;background-image:var(--iw-compact-atlas)!important;background-size:var(--iw-compact-cap-size)!important;background-position:var(--iw-compact-left-x) var(--iw-compact-y)!important;background-repeat:no-repeat!important;pointer-events:none!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]::before{left:0!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]::after{right:0!important;background-position:var(--iw-compact-right-x) var(--iw-compact-y)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button=icon]>[data-iw-compact-layer]{padding:0!important;background-size:var(--iw-compact-icon-size)!important;background-position:var(--iw-compact-icon-x) var(--iw-compact-y)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button=icon]>[data-iw-compact-layer]::before,html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button=icon]>[data-iw-compact-layer]::after{content:none!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer=hover]{opacity:0;z-index:-2;transition:opacity 180ms ease-out}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer=clicked]{opacity:0;z-index:-1;transition:opacity 70ms ease-out}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:not(:disabled):not([aria-disabled=true]):is(:hover,:focus-visible,:active)>[data-iw-compact-layer=hover],html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:not(:disabled):not([aria-disabled=true]):active>[data-iw-compact-layer=clicked]{opacity:1}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:is([data-iw-inventory-filter-state=active],[data-iw-compact-selected=true],[data-fs-action-kind=equipped]){box-shadow:inset 0 -2px var(--iw-th-accent, #5dbbd0)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-fs-action-kind=equipped]{box-shadow:inset 0 -2px var(--iw-good, #80b38a)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:is([data-iw-inventory-filter-state=active],[data-iw-compact-selected=true])>[data-iw-compact-layer]{box-shadow:inset 0 -2px var(--iw-th-accent, #5dbbd0)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-fs-action-kind=equipped]>[data-iw-compact-layer]{box-shadow:inset 0 -2px var(--iw-good, #80b38a)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-compact-selected=true]{color:var(--iw-text-hi, #fff0dc)!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-ui=nav-tab][data-iw-state=active]{color:var(--iw-text-hi, #fff0dc)!important;-webkit-text-fill-color:currentColor!important;opacity:1!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button][data-iw-ui=nav-tab][data-iw-state=active] :not([data-iw-compact-layer]){color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:focus-visible{outline:2px solid var(--iw-th-accent, #5dbbd0)!important;outline-offset:2px!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:is(:disabled,[aria-disabled=true])>[data-iw-compact-layer]:not([data-iw-compact-layer=idle]){opacity:0!important;transition:none!important}html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]:is(:disabled,[aria-disabled=true]){opacity:.45!important}@media(prefers-reduced-motion:reduce){html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button],html[data-iw-compact-atlas=compact-ghost-v3] [data-iw-compact-button]>[data-iw-compact-layer]{transition:none!important}}\n';

  // src/modules/CompactButtons.js
  var CONTROL = 'button, a[data-iw-ui="nav-tab"], a[data-fs-preserved-action="control"], [role="button"][data-fs-preserved-action="control"]';
  var LAYER = "[data-iw-compact-layer]";
  var decorated = /* @__PURE__ */ new Set();
  var label3 = (el2) => String(el2.textContent || "").replace(/\s+/g, " ").trim();
  var STATES = ["idle", "hover", "clicked"];
  function loadoutPair(el2, text = label3(el2)) {
    if (!/^(I|II)$/.test(text)) return false;
    const peers = [...el2.parentElement?.querySelectorAll("button") || []];
    return peers.length === 2 && peers.some((p) => label3(p) === "I") && peers.some((p) => label3(p) === "II");
  }
  function kind(el2, text) {
    if (el2.matches("[data-iw-collapse]")) return "";
    if (el2.matches('[data-fs-preserved-action="control"]')) {
      return el2.dataset.fsActionKind === "icon" ? "icon" : "text";
    }
    if (el2.matches('[data-iw-inventory-control="filter"], [data-iw-inventory-control="page"], [data-iw-ui="nav-tab"], [data-iw-ui="zone-action"], [data-iw-panel-part="send"], [data-iw-guild-role="action"]')) return "text";
    if (loadoutPair(el2, text())) return "icon";
    if (/^change zone$/i.test(text())) return "text";
    if ((!text() || /^[⏱⏲⏰⌚︎️]+$/u.test(text())) && [...el2.parentElement?.children || []].some((p) => p.matches("button") && /^change zone$/i.test(label3(p)))) return "icon";
    return "";
  }
  function clear(el2) {
    el2.querySelectorAll(`:scope > ${LAYER}`).forEach((n) => n.remove());
    delete el2.dataset.iwCompactButton;
    delete el2.dataset.iwCompactSelected;
  }
  function decorateCompactButtons(root = document) {
    const next = /* @__PURE__ */ new Set();
    for (const el2 of root.querySelectorAll(CONTROL)) {
      let cached;
      const text = () => cached === void 0 ? cached = label3(el2) : cached;
      const shape = kind(el2, text);
      if (!shape) continue;
      next.add(el2);
      if (el2.dataset.iwCompactButton !== shape) el2.dataset.iwCompactButton = shape;
      const nativeSelection = el2.getAttribute("aria-pressed") ?? el2.getAttribute("aria-selected");
      const selected = loadoutPair(el2, text()) && (nativeSelection !== null ? nativeSelection === "true" : el2.dataset.state === "active" || /(?:bg|text|border)-(?:orange|amber|primary|accent|ember)/i.test(String(el2.className || "")));
      if (selected && el2.dataset.iwCompactSelected !== "true") el2.dataset.iwCompactSelected = "true";
      if (!selected && el2.hasAttribute("data-iw-compact-selected")) delete el2.dataset.iwCompactSelected;
      const present = /* @__PURE__ */ new Set();
      for (const child of el2.children) {
        const layerState = child.getAttribute("data-iw-compact-layer");
        if (layerState !== null) present.add(layerState);
      }
      for (const state of STATES) {
        if (present.has(state)) continue;
        const layer = el2.ownerDocument.createElement("span");
        layer.dataset.iwCompactLayer = state;
        layer.setAttribute("aria-hidden", "true");
        el2.append(layer);
      }
    }
    for (const el2 of decorated) if (!next.has(el2)) clear(el2);
    decorated = next;
  }
  function clearCompactButtons() {
    for (const el2 of decorated) clear(el2);
    decorated.clear();
  }

  // src/modules/UIFoundation.js
  var NAV_LABELS = ["game", "market", "leaderboards", "village", "guild", "dungeon"];
  var NAV_ROUTE_KEYS = Object.freeze({ village: "housing" });
  var SKIN_OWNED_CONTROL = "[data-iw-collapse]";
  var GAME_CONTROL = "button:not([data-iw-collapse])";
  var ACTIVITY_PANELS = /* @__PURE__ */ new Map([
    ["current action", "current-action"],
    ["action log", "action-log"],
    ["world chat", "world-chat"]
  ]);
  var ACTIVITY_PANEL_SLUGS = [...new Set(ACTIVITY_PANELS.values())];
  function normText4(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function setRole4(el2, role2) {
    if (el2 && el2.dataset.iwUi !== role2) el2.dataset.iwUi = role2;
    return el2;
  }
  function setPanel(el2, role2) {
    if (el2 && el2.dataset.iwPanel !== role2) el2.dataset.iwPanel = role2;
    return el2;
  }
  function setPanelPart(el2, role2) {
    if (el2 && el2.dataset.iwPanelPart !== role2) el2.dataset.iwPanelPart = role2;
    return el2;
  }
  function nearestButtonLabel(btn) {
    return normText4(btn?.textContent).toLowerCase();
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
      if (list.every((el2) => cur === el2 || cur.contains(el2))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function sameTextShell(el2, stop, maxDepth = 4) {
    if (!el2) return null;
    const text = normText4(el2.textContent);
    let cur = el2;
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const parent = cur.parentElement;
      if (!parent || parent === stop) break;
      if (parent.matches?.("button, a, input, select, textarea")) break;
      if (normText4(parent.textContent) !== text) break;
      cur = parent;
    }
    return cur;
  }
  function matchingLeaves(root, predicate) {
    return [...root.querySelectorAll("div,span,p,strong,time")].filter((el2) => el2.childElementCount === 0 && predicate(normText4(el2.textContent).toLowerCase(), el2));
  }
  function directChildUnder2(el2, ancestor) {
    let cur = el2;
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
      const label4 = navLabelText(btn);
      if (NAV_LABELS.includes(label4)) seen.add(label4);
    }
    return seen.size;
  }
  var NAV_TRACK_ROLES = ["main-nav", "section-frame"];
  function setNavRole(el2, role2) {
    if (el2?.dataset.iwUi === "section-frame") return el2;
    return setRole4(el2, role2);
  }
  function mainNavResolutionValid(entry2) {
    return entry2.epoch === getLayoutEpoch() && entry2.track.isConnected && NAV_TRACK_ROLES.includes(entry2.track.dataset.iwUi) && entry2.tabs.every((btn) => btn.isConnected && btn.dataset.iwUi === "nav-tab") && (entry2.shell === entry2.track || entry2.shell.isConnected && ["main-nav-shell", "section-frame"].includes(entry2.shell.dataset.iwUi)) && // A rail that GAINS a tab after the first classification (Dungeon unlocks,
    // or the route mounts it late) used to stay cached forever: every check
    // above passes while the new sibling never gets `nav-tab` and renders
    // vanilla inside a skinned rail. Re-count the rail's own labelled controls
    // -- bounded to the rail, not the document -- and re-resolve on a change.
    countNavTabsIn(entry2.track) === entry2.tabs.length;
  }
  function resolveMainNav() {
    const buttons = [...document.querySelectorAll('button, a, [role="tab"]')];
    const byLabel = /* @__PURE__ */ new Map();
    for (const btn of buttons) {
      const label4 = navLabelText(btn);
      if (!NAV_LABELS.includes(label4)) continue;
      if (!byLabel.has(label4)) byLabel.set(label4, []);
      byLabel.get(label4).push(btn);
    }
    if (byLabel.size < 4) return null;
    const tabs = NAV_LABELS.map((label4) => byLabel.has(label4) ? pickRendered(byLabel.get(label4)) : null).filter(Boolean);
    const track = commonAncestor2(tabs);
    if (!track) return null;
    setNavRole(track, "main-nav");
    let shell = track;
    const navText = normText4(track.textContent);
    for (let depth = 0; depth < 3; depth += 1) {
      const parent = shell.parentElement;
      if (!parent || parent === document.body) break;
      const parentButtons = [...parent.querySelectorAll('button, a, [role="tab"]')].filter((btn) => NAV_LABELS.includes(nearestButtonLabel(btn)));
      const rect = parent.getBoundingClientRect?.();
      if (parentButtons.length !== tabs.length || normText4(parent.textContent) !== navText) break;
      if (rect && rect.height > 110) break;
      shell = parent;
    }
    if (shell !== track) setNavRole(shell, "main-nav-shell");
    return { tabs, track, shell, epoch: getLayoutEpoch() };
  }
  function applyMainNavState(tabs) {
    const semanticActive = tabs.map((btn) => deriveTabActive(btn));
    const hasSemanticActive = semanticActive.some(Boolean);
    const routeSegments = (value) => new Set(String(value || "").toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
    const routeLabel = (segments) => NAV_LABELS.find((label4) => segments.has(NAV_ROUTE_KEYS[label4] || label4));
    const pathRoute = routeLabel(routeSegments(location.pathname));
    const hashRoute = routeLabel(routeSegments(location.hash));
    const rootRoute = !location.hash && /^\/$/.test(location.pathname || "/") ? "game" : "";
    const activeRoute = pathRoute || hashRoute || rootRoute;
    const routeActive = tabs.map((btn) => navLabelText(btn) === activeRoute);
    const hasRouteActive = routeActive.some(Boolean);
    const firstClassification = tabs.every((btn) => btn.dataset.iwUi !== "nav-tab");
    const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);
    tabs.forEach((btn, index) => {
      const wasActive = btn.dataset.iwState === "active";
      setRole4(btn, "nav-tab");
      const tab = navLabelText(btn);
      if (btn.dataset.iwTab !== tab) btn.dataset.iwTab = tab;
      const active3 = hasRouteActive ? routeActive[index] : hasSemanticActive ? semanticActive[index] : firstClassification ? warmActive[index] : wasActive;
      if (active3) {
        if (!wasActive) btn.dataset.iwState = "active";
      } else if ("iwState" in btn.dataset) delete btn.dataset.iwState;
    });
  }
  var TOOLKIT_URL = "https://idleworldstoolkit.com";
  function ensureToolkitLink(track) {
    if (!track || track.querySelector(':scope > [data-iw-nav-link="toolkit"]')) return;
    const link = document.createElement("a");
    link.dataset.iwNavLink = "toolkit";
    link.dataset.iwUi = "nav-tab";
    link.href = TOOLKIT_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "IdleWorlds Toolkit (opens in a new tab)";
    link.textContent = "Toolkit";
    track.append(link);
  }
  function classifyMainNav() {
    if (mainNavResolution && mainNavResolutionValid(mainNavResolution)) {
      applyMainNavState(mainNavResolution.tabs);
      ensureToolkitLink(mainNavResolution.track);
      ensureArcaneCacheButton(mainNavResolution.track);
      return;
    }
    mainNavResolution = resolveMainNav();
    if (!mainNavResolution) return;
    applyMainNavState(mainNavResolution.tabs);
    ensureToolkitLink(mainNavResolution.track);
    ensureArcaneCacheButton(mainNavResolution.track);
  }
  var zoneBarResolutions = null;
  function zoneBarResolutionValid(entry2) {
    return entry2.host.isConnected && entry2.host.dataset.iwUi === "zone-bar" && (!entry2.title || entry2.title.isConnected) && entry2.buttons.every((btn) => btn.isConnected && btn.dataset.iwUi === "zone-action");
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
    const zoneLabel = (el2) => /^zone\s*\d+\s*:/i.test(normText4(el2.textContent).replace(/^[^a-z0-9]+/i, ""));
    const matches = [...document.querySelectorAll("div,span,p,strong")].filter((el2) => zoneLabel(el2) && el2.childElementCount <= 2);
    const labels = matches.filter((el2) => !matches.some((other) => other !== el2 && el2.contains(other)));
    for (const label4 of labels) {
      let host = label4.parentElement;
      for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
        if (host.querySelector('header, [data-iw-ui="main-nav"], [data-iw-ui="nav-tab"]')) break;
        const buttons = [...host.querySelectorAll("button")];
        const buttonText = buttons.map(nearestButtonLabel);
        if (buttonText.some((x) => /zones/.test(x)) && buttonText.some((x) => /next\s+zone/.test(x))) {
          setRole4(host, "zone-bar");
          const zoneButtons = [];
          buttons.forEach((btn) => {
            const text = buttonLabelText(btn);
            const match = /^(zones|previous\s+zone|next\s+zone)$/.exec(text);
            if (match) {
              setRole4(btn, "zone-action");
              const tone2 = match[1].startsWith("zones") ? "zones" : match[1].startsWith("previous") ? "prev" : "next";
              if (btn.dataset.iwZoneAction !== tone2) btn.dataset.iwZoneAction = tone2;
              zoneButtons.push(btn);
            }
          });
          buttons.forEach((btn) => {
            if (btn.dataset.iwUi === "zone-action") return;
            if (btn.parentElement?.querySelector(':scope > [data-iw-ui="zone-action"]')) return;
            if (btn.dataset.iwZoneLink !== "1") btn.dataset.iwZoneLink = "1";
          });
          const title = sameTextShell(label4, host, 2);
          setRole4(title, "zone-title");
          zoneBarResolutions.push({ host, title, buttons: zoneButtons });
          break;
        }
      }
    }
  }
  var sectionFrameResolutions = null;
  var sectionFrameSeen = /* @__PURE__ */ new Set();
  var SECTION_FRAME_NAMES = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions|zone selector)$/i;
  function ownedElsewhere(el2) {
    return !!el2.closest?.('header, [data-iw-ui="zone-bar"], [data-iw-panel]');
  }
  function inOverlay(el2) {
    if (el2.closest?.('[data-iw-overlay="scrim"], [data-iw-overlay="panel"]')) return true;
    const layer = el2.closest?.('[class*="fixed"]');
    return !!layer && getComputedStyle(layer).position === "fixed";
  }
  var passToken = 0;
  var headingIndexToken = -1;
  var headingIndexValue = null;
  function beginClassifyPass() {
    passToken += 1;
  }
  function headingIndex() {
    if (headingIndexToken === passToken && headingIndexValue) return headingIndexValue;
    const all = [...document.querySelectorAll("h1,h2,h3,h4")];
    const firstByPanel = /* @__PURE__ */ new Map();
    const orphans = [];
    for (const h of all) {
      const panel = h.closest(".panel");
      if (panel) {
        if (!firstByPanel.has(panel)) firstByPanel.set(panel, h);
      } else orphans.push(h);
    }
    headingIndexValue = { all, firstByPanel, orphans };
    headingIndexToken = passToken;
    return headingIndexValue;
  }
  function panelHeading(panel) {
    return headingIndex().firstByPanel.get(panel) || null;
  }
  function sectionFrameResolutionValid(entry2) {
    return entry2.epoch === getLayoutEpoch() && entry2.frame.isConnected && entry2.frame.dataset.iwUi === "section-frame" && !inOverlay(entry2.frame) && !ownedElsewhere(entry2.frame) && // A panel with no heading YET is legal (an async route paints the card
    // before its title); re-resolve once one appears so it gets its
    // section-title. Same race as the empty-Quests panel below.
    (entry2.heading ? entry2.heading.isConnected && entry2.heading.dataset.iwUi === "section-title" && entry2.frame.contains(entry2.heading) : !panelHeading(entry2.frame)) && // A resolution that is NOT a `.panel` yet CONTAINS one is a multi-panel
    // layout column picked before the inner panel had content (the Quests
    // race). Force a re-resolve so the tighter `.panel` frame wins.
    (entry2.frame.classList.contains("panel") || !entry2.frame.querySelector(".panel"));
  }
  function sectionFramePanels() {
    return preferRendered([...document.querySelectorAll(".panel")].filter((p) => !inOverlay(p) && !ownedElsewhere(p)));
  }
  function sectionFrameOrphanHeadings() {
    const matches = headingIndex().orphans.filter((heading) => !inOverlay(heading) && SECTION_FRAME_NAMES.test(normText4(heading.textContent).replace(/^[^a-z0-9]+/i, "")));
    return preferRendered(matches);
  }
  function classifySectionFrames() {
    const panels = sectionFramePanels();
    const orphans = sectionFrameOrphanHeadings();
    const targets = [...panels, ...orphans];
    if (sectionFrameResolutions && sectionFrameResolutions.every(sectionFrameResolutionValid) && targets.every((target) => sectionFrameSeen.has(target))) return;
    if (sectionFrameResolutions) {
      for (const e of sectionFrameResolutions) {
        if (ownedElsewhere(e.frame)) continue;
        if (e.frame.dataset.iwUi === "section-frame") delete e.frame.dataset.iwUi;
        if (e.heading?.dataset.iwUi === "section-title") delete e.heading.dataset.iwUi;
      }
    }
    sectionFrameResolutions = [];
    sectionFrameSeen = new Set(targets);
    for (const panel of panels) {
      const heading = panelHeading(panel);
      setRole4(panel, "section-frame");
      if (heading) setRole4(heading, "section-title");
      sectionFrameResolutions.push({ heading, frame: panel, epoch: getLayoutEpoch() });
    }
    for (const heading of orphans) {
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
        const substantial = descendantCount >= 12 && normText4(cur.textContent).length >= 45;
        const roomy = !rect || rect.width > 320 && rect.height > 110;
        const wrapsSiblingPanel = ownPanel ? [...cur.querySelectorAll(".panel")].some((p) => p !== ownPanel && !p.contains(ownPanel) && !ownPanel.contains(p)) : cur.querySelectorAll(".panel").length > 1;
        if (substantial && roomy && !wrapsSiblingPanel) {
          picked = cur;
          break;
        }
      }
      if (picked) {
        setRole4(picked, "section-frame");
        setRole4(heading, "section-title");
        sectionFrameResolutions.push({ heading, frame: picked, epoch: getLayoutEpoch() });
      }
    }
  }
  var bossPanelResolutions = null;
  var bossPanelSeen = /* @__PURE__ */ new Set();
  function bossPanelResolutionValid(entry2) {
    return entry2.epoch === getLayoutEpoch() && entry2.heading.isConnected && entry2.root.isConnected && entry2.root.contains(entry2.heading);
  }
  function bossPanelRoot(heading) {
    const panel = heading.closest(".panel");
    if (panel) return panel;
    const entry2 = (sectionFrameResolutions || []).find((e) => e.heading === heading);
    return entry2 ? entry2.frame : null;
  }
  function tagBossCards(entry2) {
    for (const card of entry2.root.querySelectorAll(".compact-panel")) {
      if (card.querySelector(".compact-panel")) continue;
      if (card.dataset.iwBoss !== "card") card.dataset.iwBoss = "card";
    }
    decorateWorldBossPanel(entry2);
  }
  function untagBossCards(entry2) {
    clearWorldBossPanel(entry2.root);
    for (const card of entry2.root.querySelectorAll("[data-iw-boss]")) delete card.dataset.iwBoss;
  }
  function bossHeadings() {
    const matches = headingIndex().all.filter((heading) => /^world bosses$/i.test(normText4(heading.textContent)));
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
      const entry2 = { heading, root, epoch: getLayoutEpoch() };
      bossPanelResolutions.push(entry2);
      tagBossCards(entry2);
    }
  }
  var marketResolutions = null;
  var marketSeen = /* @__PURE__ */ new Set();
  function marketResolutionValid(entry2) {
    return entry2.frame.isConnected && entry2.frame.dataset.iwMarket === "root" && entry2.title.isConnected && /^market$/i.test(normText4(entry2.title.textContent));
  }
  function tagMarketCards(entry2) {
    for (const row of entry2.frame.querySelectorAll(".compact-row")) {
      if (row.querySelector(".compact-row")) continue;
      if (row.querySelector(":scope > .fs-inv-row")) continue;
      if (row.closest('[data-iw-panel-part="feed"]')) continue;
      if (row.dataset.iwMarket !== "row") row.dataset.iwMarket = "row";
      const nameBtn = row.querySelector('button.text-left, button[class*="flex-1"]');
      if (nameBtn && nameBtn.dataset.iwMarket !== "namebtn") nameBtn.dataset.iwMarket = "namebtn";
    }
  }
  function untagMarket(entry2) {
    if (entry2.frame.dataset.iwMarket === "root") delete entry2.frame.dataset.iwMarket;
    for (const el2 of entry2.frame.querySelectorAll("[data-iw-market]")) delete el2.dataset.iwMarket;
  }
  function marketTitles() {
    return [...document.querySelectorAll('[data-iw-ui="section-title"]')].filter((title) => /^market$/i.test(normText4(title.textContent)));
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
      const frame2 = title.closest('[data-iw-ui="section-frame"]');
      if (!frame2 || marketResolutions.some((e) => e.frame === frame2)) continue;
      if (frame2.dataset.iwMarket !== "root") frame2.dataset.iwMarket = "root";
      const entry2 = { frame: frame2, title };
      marketResolutions.push(entry2);
      tagMarketCards(entry2);
    }
  }
  var villageResolutions = null;
  var villageSeen = /* @__PURE__ */ new Set();
  function villageResolutionValid(entry2) {
    return entry2.epoch === getLayoutEpoch() && entry2.heading.isConnected && entry2.root.isConnected && entry2.root.contains(entry2.heading);
  }
  function villageLabel(heading) {
    return normText4(heading.textContent).replace(/^[^a-z0-9]+/i, "");
  }
  function villageHeadings() {
    const matches = headingIndex().all.filter((heading) => {
      const text = villageLabel(heading);
      return /^village$/i.test(text) || /^village add-?ons$/i.test(text);
    });
    return preferRendered(matches);
  }
  function classifyVillagePanels() {
    const headings = villageHeadings();
    if (villageResolutions && villageResolutions.every(villageResolutionValid) && headings.every((heading) => villageSeen.has(heading))) {
      villageResolutions.forEach(decorateVillagePanel);
      return;
    }
    if (villageResolutions) villageResolutions.forEach((entry2) => clearVillagePanel(entry2.root));
    villageResolutions = [];
    villageSeen = new Set(headings);
    for (const heading of headings) {
      const root = heading.closest(".panel");
      if (!root || villageResolutions.some((e) => e.root === root)) continue;
      const kind2 = /^village add-?ons$/i.test(villageLabel(heading)) ? "addons" : "housing";
      const entry2 = { heading, root, kind: kind2, epoch: getLayoutEpoch() };
      villageResolutions.push(entry2);
      decorateVillagePanel(entry2);
    }
  }
  var guildRoots = /* @__PURE__ */ new Set();
  function classifyGuildPanels() {
    const onRoute = /^\/guild(?:\/|$)/i.test(location.pathname || "");
    const next = /* @__PURE__ */ new Set();
    for (const { frame: frame2, heading } of sectionFrameResolutions || []) {
      if (!frame2.isConnected || !frame2.classList.contains("panel")) continue;
      if (frame2.querySelector(':scope > [data-iw-ui="nav-tab"], .panel')) continue;
      const title = heading ? normText4(heading.firstElementChild?.textContent || heading.textContent).replace(/^[^a-z0-9]+/i, "") : "";
      if (!onRoute && !/^raid dungeon$/i.test(title)) continue;
      next.add(frame2);
      decorateGuildPanel({ root: frame2, heading });
    }
    for (const root of guildRoots) if (!next.has(root)) clearGuildPanel(root);
    guildRoots = next;
  }
  function findCurrentActionProgress(root) {
    const semantic = root.querySelector('[role="progressbar"], [aria-valuenow][aria-valuemax]');
    if (semantic) return semantic;
    const fill = [...root.querySelectorAll("[style]")].find((el2) => /^\d+(?:\.\d+)?%$/.test(el2.style.width || "") && el2.parentElement !== root);
    return fill?.parentElement || null;
  }
  var progressSamples = /* @__PURE__ */ new WeakMap();
  function progressPercent2(track) {
    const fill = [...track.querySelectorAll("[style]")].find((el2) => /^\d+(?:\.\d+)?%$/.test(el2.style.width || ""));
    if (fill) return parseFloat(fill.style.width);
    const now = parseFloat(track.getAttribute("aria-valuenow"));
    const max = parseFloat(track.getAttribute("aria-valuemax"));
    if (Number.isFinite(now) && Number.isFinite(max) && max > 0) return now / max * 100;
    return null;
  }
  function markProgressReset(track) {
    track.dataset.iwProgressReset = "1";
    raf(() => {
      if (track.dataset.iwProgressReset) delete track.dataset.iwProgressReset;
    });
  }
  function smoothActionProgress(track) {
    if (!track) return;
    const { reset, durationMs } = sampleProgress(progressSamples, track, progressPercent2(track));
    if (reset) markProgressReset(track);
    if (durationMs !== null) track.style.setProperty("--iw-progress-duration", formatDuration(durationMs));
  }
  function hasPanelBodyOutsideHeading(candidate, heading) {
    const headingBranch = directChildUnder2(heading, candidate);
    if (!headingBranch) return false;
    return [...candidate.children].some((child) => {
      if (child === headingBranch || child.matches?.('button,a,[role="button"]')) return false;
      if (child.matches?.(SKIN_OWNED_CONTROL)) return false;
      return !/^\s*[\d,.]+\s*xp\s*\/\s*hr\s*$/i.test(normText4(child.textContent));
    });
  }
  function panelHostMatches(candidate, panel, heading) {
    if (panel === "current-action") {
      return !!findCurrentActionProgress(candidate);
    }
    if (panel === "action-log") {
      const hasControl = [...candidate.querySelectorAll(GAME_CONTROL + ",a")].some((el2) => /^view\s+all$/i.test(normText4(el2.textContent)));
      const hasRate = /\b[\d,.]+\s*xp\s*\/\s*hr\b/i.test(normText4(candidate.textContent));
      return (hasControl || hasRate) && hasPanelBodyOutsideHeading(candidate, heading);
    }
    if (panel === "world-chat") {
      return !![...candidate.querySelectorAll("input,textarea")].find((el2) => /message\s+world\s+chat/i.test(el2.getAttribute("placeholder") || ""));
    }
    return false;
  }
  function findActivityPanelHost(heading, panel) {
    const ownPanel = heading.closest?.(".panel") || null;
    let cur = heading.parentElement;
    for (let depth = 0; cur && cur !== document.body && depth < 6; depth += 1, cur = cur.parentElement) {
      if (panelHostMatches(cur, panel, heading)) return cur;
      if (cur === ownPanel) break;
    }
    const panelEl = heading.closest?.(".panel");
    if (panelEl && panelEl.contains(heading)) return panelEl;
    return null;
  }
  function classifyPanelHeader(host, heading) {
    const titleBranch = directChildUnder2(heading, host);
    if (!titleBranch) return;
    let companion = titleBranch.nextElementSibling;
    while (companion?.matches?.(SKIN_OWNED_CONTROL)) companion = companion.nextElementSibling;
    const split = titleBranch !== heading && !titleBranch.querySelector(GAME_CONTROL + ',a,[role="button"]:not([data-iw-collapse])') && companion && !companion.querySelector('input,textarea,h1,h2,h3,h4,[role="heading"]') && (companion.querySelector('button,a,[role="button"]') || /\bxp\s*\/\s*hr\b/i.test(normText4(companion.textContent)));
    if (split) {
      host.dataset.iwPanelHeader = "split";
      setPanelPart(titleBranch, "header-title");
      setPanelPart(companion, "header-tools");
    } else {
      delete host.dataset.iwPanelHeader;
      setPanelPart(titleBranch, "header");
    }
  }
  var FEED_TIME = /^\d{1,2}:\d{2}:\d{2}(?:\s?[ap]\.?\s?m\.?)?$/i;
  function classifyFeed(host) {
    let markers = matchingLeaves(host, (text) => FEED_TIME.test(text));
    if (!markers.length) markers = matchingLeaves(host, (text) => text === "system");
    let feed = markers.length > 1 ? commonAncestor2(markers) : markers.length === 1 ? directChildUnder2(markers[0], host) : null;
    if (feed === host) {
      feed = null;
      markers = [];
    }
    if (!feed) {
      feed = [...host.children].find((child) => child.dataset.iwPanelPart !== "header" && // Without this a skin-owned control appended as a direct child with no
      // input and no heading is the first thing this fallback finds, and it
      // would be given the feed's `overflow-y:auto; max-height`. (The Rearrange
      // handle proved it, before that feature was removed.)
      !child.matches(SKIN_OWNED_CONTROL) && !child.querySelector("input,textarea") && !child.matches("form") && !child.querySelector('h1,h2,h3,h4,[role="heading"]')) || null;
    }
    if (!feed || feed === host || !host.contains(feed)) return;
    setPanelPart(feed, "feed");
    const rows = new Set(markers.map((marker) => directChildUnder2(marker, feed)).filter(Boolean));
    rows.forEach((row) => setPanelPart(row, "feed-row"));
  }
  function classifyCurrentAction(host) {
    const track = setPanelPart(findCurrentActionProgress(host), "progress");
    smoothActionProgress(track);
    const queued3 = matchingLeaves(host, (text) => text === "queued")[0];
    let cur = queued3?.parentElement;
    for (let depth = 0; cur && cur !== host && depth < 3; depth += 1, cur = cur.parentElement) {
      if (cur.querySelector(GAME_CONTROL) && normText4(cur.textContent).length > 6) {
        setPanelPart(cur, "queue");
        break;
      }
    }
  }
  function classifyActionLog(host) {
    const control = [...host.querySelectorAll(GAME_CONTROL + ",a")].find((el2) => /^view\s+all$/i.test(normText4(el2.textContent)));
    setPanelPart(control, "panel-control");
    classifyFeed(host);
  }
  function classifyWorldChat(host) {
    const input = [...host.querySelectorAll("input,textarea")].find((el2) => /message\s+world\s+chat/i.test(el2.getAttribute("placeholder") || ""));
    setPanelPart(input, "chat-input");
    if (input) {
      let composer = input.parentElement;
      for (let depth = 0; composer && composer !== host && depth < 3; depth += 1, composer = composer.parentElement) {
        const send = [...composer.querySelectorAll("button")].find((el2) => /^send$/i.test(normText4(el2.textContent)));
        if (!send) continue;
        setPanelPart(composer, "composer");
        setPanelPart(send, "send");
        break;
      }
    }
    classifyFeed(host);
  }
  var activityPanelResolutions = null;
  function activityPanelResolutionValid(entry2) {
    return entry2.epoch === getLayoutEpoch() && entry2.heading.isConnected && entry2.host.isConnected && entry2.host.dataset.iwUi === "section-frame" && entry2.host.dataset.iwPanel === entry2.panel && entry2.host.contains(entry2.heading);
  }
  function runActivityPanel(entry2) {
    const { host, heading, panel } = entry2;
    classifyPanelHeader(host, heading);
    if (panel === "current-action") classifyCurrentAction(host);
    else if (panel === "action-log") classifyActionLog(host);
    else classifyWorldChat(host);
  }
  function activityPanelLabelNodes() {
    const seen = /* @__PURE__ */ new Set();
    const collected = [];
    const push = (el2, panel) => {
      if (!el2 || !panel || seen.has(el2)) return;
      seen.add(el2);
      collected.push({ node: el2, panel });
    };
    for (const el2 of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
      push(el2, ACTIVITY_PANELS.get(normText4(el2.textContent).toLowerCase()));
    }
    for (const el2 of document.querySelectorAll("p,span,div,strong,b")) {
      if (el2.childElementCount === 0) push(el2, ACTIVITY_PANELS.get(normText4(el2.textContent).toLowerCase()));
    }
    const haveBeforeId = new Set(collected.map((o) => o.panel));
    if (!haveBeforeId.has("current-action")) {
      const byId = pickRendered([...document.querySelectorAll('[id="current-action-panel"]')]);
      if (byId) {
        const label4 = [...byId.querySelectorAll('h1,h2,h3,h4,[role="heading"],p,span,div,strong,b')].find((el2) => el2.childElementCount === 0 && normText4(el2.textContent).length > 0 && normText4(el2.textContent).length <= 40);
        push(label4 || byId, "current-action");
      }
    }
    const have = new Set(collected.map((o) => o.panel));
    if (have.size < ACTIVITY_PANELS.size) {
      for (const el2 of document.querySelectorAll("div,header,section,h2,h3,h4,span,p,button,a")) {
        if (seen.has(el2)) continue;
        for (const n of el2.childNodes) {
          if (n.nodeType !== 3) continue;
          const panel = ACTIVITY_PANELS.get(normText4(n.textContent).toLowerCase());
          if (panel && !have.has(panel)) {
            push(el2, panel);
            break;
          }
        }
      }
    }
    const byPanel = /* @__PURE__ */ new Map();
    for (const entry2 of collected) {
      if (!byPanel.has(entry2.panel)) byPanel.set(entry2.panel, []);
      byPanel.get(entry2.panel).push(entry2);
    }
    const out = [];
    for (const entries of byPanel.values()) {
      const picked = new Set(preferRendered(entries.map((e) => e.node)));
      for (const entry2 of entries) if (picked.has(entry2.node)) out.push(entry2);
    }
    return out;
  }
  function classifyActivityPanels() {
    if (activityPanelResolutions && activityPanelResolutions.every(activityPanelResolutionValid) && ACTIVITY_PANEL_SLUGS.every((slug) => activityPanelResolutions.some((e) => e.panel === slug))) {
      activityPanelResolutions.forEach(runActivityPanel);
      return;
    }
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
      setRole4(host, "section-frame");
      setRole4(heading, "section-title");
      setPanel(host, panel);
      const entry2 = { heading, host, panel, epoch: getLayoutEpoch() };
      activityPanelResolutions.push(entry2);
      runActivityPanel(entry2);
    }
  }
  var dailyBoostNode = null;
  var DAILY_BOOST = /^daily\s+xp\s+boost\b.*\+\s*\d+(?:\.\d+)?\s*%\s*xp/i;
  function isDailyBoostText(el2) {
    return DAILY_BOOST.test(normText4(el2.textContent).replace(/^[^a-z0-9]+/i, ""));
  }
  function clearDailyBoost() {
    document.querySelectorAll("[data-iw-skill-boost]").forEach((el2) => {
      delete el2.dataset.iwSkillBoost;
    });
    dailyBoostNode = null;
  }
  function classifyDailyBoost() {
    if (dailyBoostNode?.isConnected && dailyBoostNode.dataset.iwSkillBoost === "1" && dailyBoostNode.closest('[data-iw-ui="section-frame"]') && isDailyBoostText(dailyBoostNode)) return;
    let found = null;
    for (const entry2 of sectionFrameResolutions || []) {
      const { frame: frame2, heading } = entry2;
      if (!heading || !frame2.isConnected) continue;
      if (!/^(skill actions|actions)$/i.test(normText4(heading.textContent).replace(/^[^a-z0-9]+/i, ""))) continue;
      let row = heading;
      while (row.parentElement && row.parentElement !== frame2) row = row.parentElement;
      if (row.parentElement !== frame2) continue;
      const matches = [...row.querySelectorAll("p, div, span")].filter(isDailyBoostText);
      found = matches.find((el2) => !matches.some((other) => other !== el2 && el2.contains(other))) || null;
      if (found) break;
    }
    if (found === dailyBoostNode && found) return;
    if (dailyBoostNode && dailyBoostNode !== found) delete dailyBoostNode.dataset.iwSkillBoost;
    dailyBoostNode = found;
    if (found && found.dataset.iwSkillBoost !== "1") found.dataset.iwSkillBoost = "1";
  }
  var queued = false;
  function queueClassify() {
    if (queued) return;
    queued = true;
    raf(() => {
      queued = false;
      beginClassifyPass();
      guard("ui:main-nav", classifyMainNav);
      guard("ui:zone-bar", classifyZoneBar);
      guard("ui:activity-panels", classifyActivityPanels);
      guard("ui:section-frames", classifySectionFrames);
      guard("ui:header-chrome", classifyHeaderChrome);
      guard("ui:daily-boost", classifyDailyBoost);
      guard("ui:boss-cards", classifyBossCards);
      guard("ui:market", classifyMarket);
      guard("ui:village", classifyVillagePanels);
      guard("ui:guild", classifyGuildPanels);
      guard("ui:village-scene", () => {
        reconcileVillageScene().catch((err) => warnOnce("ui:village-scene", err));
      });
      guard("ui:compact-buttons", decorateCompactButtons);
      guard("ui:collapsible", () => decorateCollapsibleFrames(document));
    });
  }
  function clearUIFoundation() {
    clearArcaneCacheDemo();
    clearHeaderChrome();
    clearCollapsibleFrames(document);
    clearVillageScene();
    clearCompactButtons();
    clearDailyBoost();
    headingIndexToken = -1;
    headingIndexValue = null;
    clearWorldBossPanel(document);
    clearVillagePanel(document.body);
    villageResolutions = null;
    villageSeen = /* @__PURE__ */ new Set();
    clearGuildPanel(document.body);
    guildRoots = /* @__PURE__ */ new Set();
    mainNavResolution = null;
    document.querySelectorAll("[data-iw-nav-link]").forEach((el2) => {
      el2.remove();
    });
    zoneBarResolutions = null;
    sectionFrameResolutions = null;
    sectionFrameSeen = /* @__PURE__ */ new Set();
    bossPanelResolutions = null;
    bossPanelSeen = /* @__PURE__ */ new Set();
    marketResolutions = null;
    marketSeen = /* @__PURE__ */ new Set();
    activityPanelResolutions = null;
    progressSamples = /* @__PURE__ */ new WeakMap();
    document.querySelectorAll('[data-iw-panel-part="progress"]').forEach((el2) => {
      el2.style.removeProperty("--iw-progress-duration");
    });
    document.querySelectorAll("[data-iw-progress-reset]").forEach((el2) => {
      delete el2.dataset.iwProgressReset;
    });
    document.querySelectorAll("[data-iw-ui]").forEach((el2) => {
      delete el2.dataset.iwUi;
    });
    document.querySelectorAll("[data-iw-tab]").forEach((el2) => {
      delete el2.dataset.iwTab;
    });
    document.querySelectorAll("[data-iw-state]").forEach((el2) => {
      delete el2.dataset.iwState;
    });
    document.querySelectorAll("[data-iw-panel]").forEach((el2) => {
      delete el2.dataset.iwPanel;
    });
    document.querySelectorAll("[data-iw-panel-part]").forEach((el2) => {
      delete el2.dataset.iwPanelPart;
    });
    document.querySelectorAll("[data-iw-panel-header]").forEach((el2) => {
      delete el2.dataset.iwPanelHeader;
    });
    document.querySelectorAll("[data-iw-zone-action]").forEach((el2) => {
      delete el2.dataset.iwZoneAction;
    });
    document.querySelectorAll("[data-iw-zone-link]").forEach((el2) => {
      delete el2.dataset.iwZoneLink;
    });
    document.querySelectorAll("[data-iw-boss]").forEach((el2) => {
      delete el2.dataset.iwBoss;
    });
    document.querySelectorAll("[data-iw-market]").forEach((el2) => {
      delete el2.dataset.iwMarket;
    });
  }
  function injectUIFoundationStyles() {
    inject("ui-system", ui_system_default + "\n" + compact_buttons_default + "\n" + village_scene_default + "\n" + collapsible_default + "\n" + guild_default);
  }
  function initUIFoundation() {
    injectUIFoundationStyles();
    on("iw:dom-flush", queueClassify);
    on("iw:text-flush", (event) => guard("ui:raid-text", () => refreshRaidText(event.detail?.parents || [])));
    on("iw:skill-panel", (event) => {
      const panel = event.detail?.panel;
      if (!panel) return;
      const entry2 = (bossPanelResolutions || []).find((entry3) => bossPanelResolutionValid(entry3) && entry3.root.contains(panel));
      if (entry2) guard("ui:boss-state", () => decorateWorldBossPanel(entry2));
    });
    const redecorateBosses = () => {
      for (const entry2 of bossPanelResolutions || []) {
        if (bossPanelResolutionValid(entry2)) guard("ui:boss-state", () => decorateWorldBossPanel(entry2));
      }
    };
    on("iw:atlas-updated", redecorateBosses);
    on("iw:item-db-updated", redecorateBosses);
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
  var header_default = '[data-iw-header=root],[data-iw-ui=main-nav],[data-iw-header=announcement],[data-iw-header=zone-shell]{--hd-bracket: var(--iw-th-bracket);--hd-bracket-dim: var(--iw-th-bracket-dim);--hd-plate: var(--iw-th-plate);--hd-rule: var(--iw-th-edge);--hd-rule-soft: var(--iw-th-rule-soft);--hd-teal: #4FC7D8;--hd-teal-dim: #1E5C68;--hd-gap: 8px}[data-iw-header=status-card],[data-iw-header=utility-button],[data-iw-ui=zone-action]{--b: 10px;--i: 3px;--bc: var(--hd-bracket-dim);position:relative!important;border:1px solid var(--hd-rule-soft)!important;border-radius:var(--iw-r-panel)!important;background-color:var(--hd-plate)!important;background-repeat:no-repeat!important;background-image:linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc)),linear-gradient(var(--bc),var(--bc))!important;background-size:var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b),var(--b) 1px,1px var(--b)!important;background-position:var(--i) var(--i),var(--i) var(--i),calc(100% - var(--i)) var(--i),calc(100% - var(--i)) var(--i),var(--i) calc(100% - var(--i)),var(--i) calc(100% - var(--i)),calc(100% - var(--i)) calc(100% - var(--i)),calc(100% - var(--i)) calc(100% - var(--i))!important;box-shadow:none!important}[data-iw-header=root]{position:relative!important;isolation:isolate!important;display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;contain:layout inline-size!important;min-height:0!important;padding:16px 20px!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;overflow:hidden!important;background-color:#0A0B0D!important;background-image:var(--iw-header-surface)!important;background-size:cover!important;background-position:center!important;box-shadow:none!important}[data-iw-header=root]>*{position:relative;z-index:1}[data-iw-header=root]::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-style:solid;border-width:34px 32px;border-color:transparent;border-image:var(--iw-corner-filigree) 50% / 34px 32px / 0 stretch}[data-iw-header=layout]{display:grid!important;width:100%!important;min-width:0!important;grid-template-columns:minmax(0,62fr) minmax(0,38fr)!important;align-items:start!important;gap:0 18px!important;min-height:0!important;padding:0!important}[data-iw-header=identity-region]{--hd-crest-h: 106px;--hd-name-size: clamp(21px, 1.9vw, 29px);--hd-row-h: max(var(--hd-crest-h), calc(var(--hd-name-size) * 1.04 + 85px));--hd-seam: 6px;--hd-util: calc((var(--hd-row-h) + 16px - 2 * var(--hd-seam)) / 3);display:grid!important;isolation:isolate!important;grid-template-columns:104px minmax(0,1fr) var(--hd-util)!important;grid-template-rows:minmax(var(--hd-row-h),auto)!important;grid-template-areas:"crest profile utilities"!important;align-items:center!important;justify-self:start!important;align-self:center!important;margin-left:16px!important;width:fit-content!important;max-width:min(560px,46vw)!important;gap:16px 14px!important;min-width:0!important;padding:0!important;background:none!important}[data-iw-header=identity-region]::before{content:""!important;grid-column:crest-start / profile-end!important;grid-row:1 / 2!important;align-self:stretch!important;z-index:0!important;margin:-8px -8px!important;border:1px solid rgba(201,162,77,0.46)!important;border-radius:10px 0 0 10px!important;background:rgba(9,8,13,0.72)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.07),0 0 0 1px rgba(0,0,0,0.38),0 0 8px rgba(201,162,77,0.14)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important;pointer-events:none!important}[data-iw-header=identity-region]>*{position:relative!important;z-index:1!important}.fs-header-crest{grid-area:crest!important;display:block!important;width:104px!important;height:106px!important;background-image:var(--iw-header-crest)!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;filter:drop-shadow(0 0 14px rgba(70,130,200,0.22));pointer-events:none}[data-iw-header=profile]{grid-area:profile!important;min-width:0!important;padding:0!important;background:none!important}[data-iw-header=brand]{margin:0 0 1px!important;display:flex!important;align-items:center!important;gap:8px!important;font-family:var(--iw-font-head)!important;font-size:11.5px!important;font-weight:600!important;letter-spacing:0.2em!important;text-transform:uppercase!important;color:#FFFFFF!important}[data-iw-header=brand]::before,[data-iw-header=brand]::after{content:"";width:16px;height:1px;background:linear-gradient(90deg,transparent,var(--iw-th-edge))}[data-iw-header=brand]::after{transform:scaleX(-1)}[data-iw-header=profile-name]{margin:0 0 2px!important;font-family:var(--iw-font-head)!important;font-size:var(--hd-name-size, clamp(21px, 1.9vw, 29px))!important;font-weight:700!important;line-height:1.04!important;letter-spacing:0.005em!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}[data-iw-header=profile-name] button{display:inline!important;border:0!important;margin:0!important;padding:0!important;background-color:transparent!important;box-shadow:none!important;font:inherit!important;cursor:pointer!important}[data-iw-header=profile-title]{margin:0!important;font-family:var(--iw-font-head)!important;font-size:12.5px!important;font-weight:600!important;letter-spacing:0.08em!important;text-transform:uppercase!important;color:var(--iw-gold)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}[data-iw-header=profile-meta]{margin-top:4px!important;font-size:12.5px!important;line-height:1.3!important;color:#FFFFFF!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}[data-iw-header=profile-online]{margin-top:2px!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;background-image:none!important;box-shadow:none!important;text-align:left!important;height:auto!important;min-height:0!important;display:flex!important;align-items:center!important;gap:8px!important;font-family:var(--iw-font-head)!important;font-size:11.5px!important;font-weight:600!important;letter-spacing:0.09em!important;text-transform:uppercase!important;color:#FFFFFF!important}[data-iw-header=profile-online]::before{content:"";width:7px;height:7px;border-radius:50%;background:#38C8A8;box-shadow:0 0 8px rgba(56,200,168,0.75);flex:0 0 auto}[data-iw-header=utilities]{grid-area:utilities!important;align-self:stretch!important;display:grid!important;grid-template-columns:100%!important;grid-auto-rows:minmax(0,1fr)!important;align-content:stretch!important;justify-content:stretch!important;gap:var(--hd-seam, 6px)!important;width:var(--hd-util)!important;margin:-8px 0!important;padding:0!important}[data-iw-header=utility-button]{--b: 9px;--i: 3px;flex:1 1 0!important;width:auto!important;min-width:0!important;height:42px!important;min-height:42px!important;padding:0!important;display:grid!important;place-items:center!important;border-radius:3px!important;background-color:#14161A!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.05),inset 0 -1px 0 rgba(0,0,0,0.5),0 1px 2px rgba(0,0,0,0.35)!important;color:#FFFFFF!important;transition:color 120ms ease,border-color 120ms ease,background-color 120ms ease,box-shadow 120ms ease}[data-iw-header=utility-button] svg{width:20px!important;height:20px!important}[data-iw-header=utility-button]:hover{--bc: color-mix(in srgb, var(--iw-th-bracket) 78%, #fff);color:#FFFFFF!important;border-color:var(--hd-rule)!important;background-color:#1C1F25!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.09),inset 0 -1px 0 rgba(0,0,0,0.5),0 0 10px rgba(201,162,77,0.16)!important}[data-iw-header=utility-button]{box-sizing:border-box!important;border:1px solid rgba(201,162,77,0.44)!important;border-radius:7px!important;background:rgba(9,8,13,0.70)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.06),0 0 0 1px rgba(0,0,0,0.38),0 0 7px rgba(201,162,77,0.13)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important}[data-iw-header=utility-button] svg{width:18px!important;height:18px!important}[data-iw-header=utility-button]:hover{background:rgba(22,19,28,0.82)!important;border-color:rgba(226,190,118,0.62)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.09),0 0 9px rgba(201,162,77,0.22)!important;filter:brightness(1.08)!important}[data-iw-header=utility-button]{transition:color 120ms ease,filter 120ms ease}[data-iw-header=utilities]>*{align-self:stretch!important;justify-self:stretch!important;min-height:0!important;width:100%!important;margin:0!important}[data-iw-header=utilities]>:not([data-iw-header=utility-button]):has([data-iw-header=utility-button]){display:flex!important;flex-direction:column!important}[data-iw-header=utility-button]{flex:1 1 0!important;width:100%!important;min-width:0!important;height:auto!important;min-height:0!important;border-radius:0!important}[data-iw-header=utilities]>[data-iw-header=utility-button]:first-child,[data-iw-header=utilities]>:first-child [data-iw-header=utility-button]{border-top-right-radius:10px!important}[data-iw-header=utilities]>[data-iw-header=utility-button]:last-child,[data-iw-header=utilities]>:last-child [data-iw-header=utility-button]{border-bottom-right-radius:10px!important}[data-iw-header=utility-button]:has(>span.absolute.rounded-full){color:#FFD9A0!important;border-color:rgba(255,160,72,0.95)!important;background:rgba(46,22,8,0.82)!important;box-shadow:inset 0 0 10px rgba(255,138,61,0.35),0 0 0 1px rgba(0,0,0,0.45),0 0 12px rgba(255,138,61,0.55)!important}[data-iw-header=utility-button]:has(>span.absolute.rounded-full) svg{filter:drop-shadow(0 0 4px rgba(255,170,90,0.85))}[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::before,[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::after{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none}[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::before{background:radial-gradient(circle at 50% 50%,rgba(255,150,70,0.45),rgba(255,150,70,0) 70%);animation:iw-hd-alert-breathe 1.6s ease-in-out infinite}[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::after{border:2px solid rgba(255,150,60,0.95);box-shadow:0 0 10px rgba(255,138,61,0.8);z-index:1;animation:iw-hd-alert-ring 1.6s ease-out infinite}[data-iw-header=utility-button]>span.absolute.rounded-full{top:-6px!important;right:-6px!important;left:auto!important;bottom:auto!important;z-index:3!important;box-sizing:border-box!important;width:16px!important;min-width:16px!important;height:16px!important;padding:0!important;border-radius:50%!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:10px!important;line-height:1!important;font-weight:700!important;background:#D32F2F!important;color:#FFFFFF!important;-webkit-text-fill-color:#FFFFFF!important;border:0!important;box-shadow:0 0 0 1px rgba(0,0,0,0.55),0 0 8px rgba(211,47,47,0.85)!important}@keyframes iw-hd-alert-breathe{0%,100%{opacity:0.35}50%{opacity:1}}@keyframes iw-hd-alert-ring{0%{opacity:0.95;transform:scale(1)}70%{opacity:0;transform:scale(1.22)}100%{opacity:0;transform:scale(1.22)}}@media(prefers-reduced-motion:reduce){[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::before{animation:none;opacity:0.8}[data-iw-header=utility-button]:has(>span.absolute.rounded-full)::after{animation:none;opacity:0.9}}[data-iw-header=status-card]{box-sizing:border-box!important;border:1px solid rgba(201,162,77,0.46)!important;border-image:none!important;border-radius:8px!important;background:rgba(9,8,13,0.72)!important;box-shadow:inset 0 1px 0 rgba(255,236,190,0.07),0 0 0 1px rgba(0,0,0,0.38),0 0 8px rgba(201,162,77,0.14)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important}[data-iw-header=status-grid] [data-iw-header-stat=gold]{grid-area:1 / 1 / 3 / 2!important}[data-iw-header=status-grid] [data-iw-header-stat=timer],[data-iw-header=status-grid] [data-iw-header-stat=other]{grid-column:2!important}[data-iw-header=status-grid] [data-iw-header-stat=gold]{font-family:var(--iw-font-head)!important;font-variant-numeric:tabular-nums!important}[data-iw-header=status-grid] [data-iw-header-stat=timer]{min-height:30px!important;font-size:11.5px!important;color:#FFFFFF!important}@media(min-width:861px){[data-iw-header=status-grid] [data-iw-header-stat=gold],[data-iw-header=status-grid]:not(:has([data-iw-header-stat=boost])) [data-iw-header-stat=combat],[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{justify-content:center!important;text-align:center!important;font-size:12px!important;letter-spacing:.01em!important;color:#FFFFFF!important}[data-iw-header=status-grid]:not(:has([data-iw-header-stat=boost])) [data-iw-header-stat=combat],[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{grid-area:3 / 1 / 5 / 2!important}[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=boost]{padding:5px 10px!important;line-height:1.3!important}[data-iw-header=status-grid]:has([data-iw-header-stat=boost]) [data-iw-header-stat=combat]{grid-area:auto!important;grid-column:2!important;min-height:30px!important;font-size:11.5px!important;color:#FFFFFF!important}}[data-iw-header=status-grid]{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:repeat(4,auto)!important;align-content:start!important;gap:6px!important;justify-self:end!important;width:376px!important;max-width:100%!important;min-width:0!important;padding:0!important}[data-iw-header=status-card]{min-width:0!important;min-height:36px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:3px 8px!important;text-align:left!important;font-family:Georgia,"Times New Roman",serif!important;font-size:12px!important;font-weight:600!important;line-height:1.16!important;color:#FFFFFF!important;white-space:normal!important;overflow-wrap:anywhere!important;overflow:hidden!important}[data-iw-header=status-card]>*{min-width:0}[data-iw-ui=main-nav-shell]{margin-top:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}[data-iw-ui=main-nav]{position:relative!important;display:flex!important;align-items:stretch!important;gap:0!important;min-height:0!important;padding:0!important;overflow:hidden!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;background-color:transparent!important;background-image:linear-gradient(180deg,#121317 0%,#0A0B0D 60%,#0D0E11 100%)!important;box-shadow:none!important}[data-iw-ui=nav-tab]{flex:0 1 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:11px!important;height:auto!important;min-height:0!important;margin:0!important;padding:12px 26px!important;border:0!important;border-right:1px solid var(--hd-rule-soft)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;font-family:var(--iw-font-head)!important;font-size:17px!important;font-weight:600!important;letter-spacing:0.06em!important;text-transform:uppercase!important;white-space:nowrap!important;color:var(--iw-dim)!important;text-shadow:none!important;transition:color 120ms ease,background-color 120ms ease}[data-iw-ui=nav-tab]:hover{color:var(--iw-text)!important;background-color:rgba(255,214,140,0.045)!important}[data-iw-ui=nav-tab][data-iw-state=active]{color:#FFE2AE!important;border-left:1px solid var(--hd-bracket)!important;border-right:1px solid var(--hd-bracket)!important;background-image:linear-gradient(180deg,rgba(255,176,64,0.38) 0%,rgba(158,82,20,0.26) 55%,rgba(74,36,8,0.32) 100%)!important;box-shadow:inset 0 1px 0 rgba(255,208,130,0.55),inset 0 -1px 0 rgba(255,190,100,0.30),0 0 18px rgba(255,150,40,0.16)!important}[data-iw-ui=nav-tab]:first-child{border-left:0!important}[data-iw-header=announcement]{box-sizing:border-box!important;display:flex!important;align-items:center!important;gap:10px!important;height:auto!important;min-height:32px!important;margin:6px 0!important;padding:5px 14px!important;border:1px solid var(--hd-teal-dim)!important;border-radius:var(--iw-r-panel)!important;background-color:transparent!important;background-image:linear-gradient(90deg,rgba(24,68,80,0.92) 0%,rgba(12,32,40,0.92) 38%,rgba(8,18,24,0.92) 100%)!important;box-shadow:inset 0 0 26px rgba(40,150,175,0.10)!important;font-size:13.5px!important;color:var(--iw-text)!important}[data-iw-header=announcement]::before{content:""!important;flex:0 0 auto;width:16px;height:16px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--iw-th-accent) 25%,#fff) 0%,var(--iw-th-accent) 40%,color-mix(in srgb,var(--iw-th-accent) 55%,#000) 100%);clip-path:polygon(50% 0%,59% 41%,100% 50%,59% 59%,50% 100%,41% 59%,0% 50%,41% 41%);filter:drop-shadow(0 0 7px color-mix(in srgb,var(--iw-th-accent) 60%,transparent))}[data-iw-header=zone-shell]{position:relative!important;isolation:isolate!important;display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:6px 14px!important;min-height:0!important;padding:5px 12px!important;border:1px solid var(--hd-rule)!important;border-radius:var(--iw-r-panel)!important;overflow:hidden!important;background-color:#08090B!important;background-image:none!important;box-shadow:none!important}[data-iw-header=zone-shell]>*{position:relative;z-index:1}[data-iw-header=zone-shell]>:has([data-iw-ui=zone-title]){display:flex!important;flex:1 1 auto!important;flex-wrap:wrap!important;align-items:baseline!important;column-gap:12px!important;row-gap:2px!important;min-width:0!important;margin:0!important}[data-iw-ui=zone-title],[data-iw-ui=zone-title]~*{margin:0!important}[data-iw-ui=zone-title]~:not([data-iw-zone-link]){position:relative!important;padding-left:12px!important;font-size:12.5px!important;color:var(--iw-dim)!important}[data-iw-ui=zone-title]~:not([data-iw-zone-link])::before{content:""!important;position:absolute!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;width:1px!important;height:1em!important;background:var(--iw-th-edge-mid)!important}[data-iw-header=zone-shell]>:not(:has([data-iw-ui=zone-title])){margin-left:auto!important;display:flex!important;flex-wrap:wrap!important;gap:6px!important}[data-iw-header=zone-shell]::before{content:"";position:absolute;inset:0 34% 0 16%;z-index:0;background-image:var(--iw-zone-scene);background-size:cover;background-position:center;opacity:0.34;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 26%,#000 68%,transparent 100%),linear-gradient(180deg,transparent 0%,#000 26%,#000 74%,transparent 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0%,#000 26%,#000 68%,transparent 100%),linear-gradient(180deg,transparent 0%,#000 26%,#000 74%,transparent 100%);mask-composite:intersect}[data-iw-ui=zone-title]{font-family:var(--iw-font-head)!important;font-size:16px!important;font-weight:700!important;letter-spacing:0.03em!important;color:var(--iw-text-hi)!important;text-shadow:none!important}[data-iw-ui=zone-action]{--b: 7px;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;min-width:0!important;min-height:30px!important;height:auto!important;padding:5px 13px!important;font-family:var(--iw-font-head)!important;font-weight:600!important;letter-spacing:0.06em!important;text-transform:uppercase!important;color:var(--iw-text)!important;transition:filter 120ms ease}[data-iw-ui=zone-action]:hover{filter:brightness(1.18)}[data-iw-ui=zone-action][data-iw-zone-action=zones],[data-iw-ui=zone-action]:first-of-type{--bc: var(--hd-teal);color:#CFF2F8!important;border-color:var(--hd-teal-dim)!important;background-color:#07171C!important;box-shadow:inset 0 0 20px rgba(50,170,195,0.14)!important}[data-iw-ui=zone-action][data-iw-zone-action=next],[data-iw-ui=zone-action]:last-of-type{color:#F3E3C0!important;border:1px solid var(--iw-th-cta-hi)!important;background-color:var(--iw-th-plate)!important;background-image:linear-gradient(180deg,color-mix(in srgb,var(--iw-th-cta) 34%,#000),color-mix(in srgb,var(--iw-th-cta) 14%,#000))!important;background-size:auto!important;background-position:0 0!important;box-shadow:inset 0 0 14px -2px color-mix(in srgb,var(--iw-th-cta-hi) 60%,transparent),inset 0 1px 0 rgba(255,216,150,.18),0 0 0 1px color-mix(in srgb,var(--iw-th-cta-hi) 20%,transparent)!important;text-shadow:0 0 8px color-mix(in srgb,var(--iw-th-cta-hi) 45%,transparent)!important}@media(max-width:1280px){[data-iw-header=layout]{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}[data-iw-header=status-grid]{margin-top:2px!important}[data-iw-header=identity-region]{justify-self:stretch!important;width:auto!important;max-width:none!important;margin-left:0!important}}@media(max-width:860px){[data-iw-header=root]{padding:14px!important}[data-iw-header=identity-region]{--hd-crest-h: 116px;grid-template-columns:108px minmax(0,1fr) var(--hd-util)!important;grid-template-areas:"crest profile utilities"!important;gap:10px 14px!important}.fs-header-crest{width:108px!important;height:116px!important}[data-iw-header=status-grid]{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:auto!important;width:auto!important;justify-self:stretch!important}[data-iw-header=status-grid] [data-iw-header-stat]{grid-area:auto!important;grid-column:auto!important}[data-iw-header=status-grid] [data-iw-header-stat=gold],[data-iw-header=status-grid] [data-iw-header-stat=combat],[data-iw-header=status-grid] [data-iw-header-stat=boost]{justify-content:flex-start!important;font-size:13px!important}[data-iw-ui=nav-tab]{padding:11px 14px!important;font-size:14px!important;gap:8px!important}[data-iw-ui=zone-action]{flex:1 1 0!important;padding:5px 8px!important}}@media(max-width:768px){[data-iw-header=root]{background-image:var(--iw-header-surface-mobile, var(--iw-header-surface))!important}}@media(max-width:560px){[data-iw-ui=main-nav]{overflow-x:auto!important;scrollbar-width:none}[data-iw-ui=main-nav]::-webkit-scrollbar{display:none}[data-iw-ui=nav-tab]{flex:0 0 auto!important}}@media(prefers-reduced-motion:reduce){[data-iw-header=utility-button],[data-iw-ui=nav-tab],[data-iw-ui=zone-action]{transition:none}}\n';

  // src/modules/HeaderRenderer.js
  var ROLE3 = "data-iw-header";
  var queued2 = false;
  var HEADER_ASSETS = {
    headerSurface: "assets/header/header_surface.webp",
    headerCrest: "assets/header/header_crest.webp"
  };
  var ASSET_VARS = [
    "--iw-header-surface",
    "--iw-header-surface-mobile",
    "--iw-header-crest",
    "--iw-zone-scene",
    // Per-zone frame theme, set on <html> by applyZoneTheme(). The teardown loop
    // below walks '*', which includes <html>, so listing them here clears them.
    "--iw-zone-atlas",
    "--iw-corner-filigree",
    "--iw-zone-separator"
  ];
  var norm6 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var ZONE_SURFACE_DIR = "assets/header/zones";
  var ZONE_SURFACE_MAX = 34;
  var lastZoneNumber = null;
  function currentZoneNumber() {
    let el2 = document.querySelector('[data-iw-ui="zone-title"]');
    if (!el2) {
      el2 = [...document.querySelectorAll("div,span,p,strong")].find((n) => /^zone\s*\d+\s*:/i.test(norm6(n.textContent).replace(/^[^a-z0-9]+/i, "")));
    }
    const m = el2 && norm6(el2.textContent).replace(/^[^a-z0-9]+/i, "").match(/^zone\s*(\d+)/i);
    if (m) lastZoneNumber = Number(m[1]);
    return lastZoneNumber;
  }
  function presentationZoneNumber() {
    const zone = currentZoneNumber();
    const route = String(location.pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
    return route === "/housing" || route === "/ssf/housing" ? null : zone;
  }
  function zoneSurfaceUrl(zone, variant = "") {
    const key = Number.isInteger(zone) && zone >= 1 && zone <= ZONE_SURFACE_MAX ? `${ZONE_SURFACE_DIR}/zone_${zone}${variant}.webp` : HEADER_ASSETS.headerSurface;
    return `url("${assetUrl(key)}")`;
  }
  function applyZoneSurface(root) {
    if (!root) return;
    const zone = presentationZoneNumber();
    const key = zone == null ? "fallback" : String(zone);
    if (root.dataset.iwZone === key && root.style.getPropertyValue("--iw-header-surface")) return;
    root.dataset.iwZone = key;
    root.style.setProperty("--iw-header-surface", zoneSurfaceUrl(zone));
    root.style.setProperty("--iw-header-surface-mobile", zoneSurfaceUrl(zone, "_mobile"));
  }
  var THEME_ASSET_DIR = "assets/skills-ui";
  var FALLBACK_VISUAL_THEME = "forged-metal";
  function applyZoneTheme() {
    const html = document.documentElement;
    if (!html) return;
    const theme = zoneTheme(presentationZoneNumber());
    const key = theme || "default";
    const visualTheme = theme || FALLBACK_VISUAL_THEME;
    const zoneVarsReady = theme ? !!html.style.getPropertyValue("--iw-zone-atlas") : !html.style.getPropertyValue("--iw-zone-atlas") && !html.style.getPropertyValue("--iw-corner-filigree") && !html.style.getPropertyValue("--iw-zone-separator");
    const buttonThemeReady = html.dataset.iwCompactAtlas === "compact-ghost-v3" && !!html.style.getPropertyValue("--iw-compact-atlas") && !!html.style.getPropertyValue("--iw-action-idle");
    if (html.dataset.iwZoneTheme === key && zoneVarsReady && buttonThemeReady) return;
    html.dataset.iwZoneTheme = key;
    if (theme) {
      html.style.setProperty("--iw-zone-atlas", `url("${assetUrl(`${THEME_ASSET_DIR}/theme_${theme}.webp`)}")`);
      html.style.setProperty("--iw-corner-filigree", `url("${assetUrl(`${THEME_ASSET_DIR}/panel_corners_${theme}.webp`)}")`);
      html.style.setProperty("--iw-zone-separator", `url("${assetUrl(`${THEME_ASSET_DIR}/separator_flourish_${theme}.webp`)}")`);
    } else {
      html.style.removeProperty("--iw-zone-atlas");
      html.style.removeProperty("--iw-corner-filigree");
      html.style.removeProperty("--iw-zone-separator");
    }
    SkillsArtService.applyThemeVariables(html, visualTheme);
  }
  function setRole5(el2, role2) {
    if (el2 && el2.getAttribute(ROLE3) !== role2) el2.setAttribute(ROLE3, role2);
    return el2;
  }
  function setAssetVar(el2, name, key) {
    if (!el2 || !HEADER_ASSETS[key]) return;
    el2.style.setProperty(name, `url("${assetUrl(HEADER_ASSETS[key])}")`);
  }
  function applyHeaderVars(root) {
    setAssetVar(root, "--iw-header-crest", "headerCrest");
  }
  function applyZoneVars(el2) {
    setAssetVar(el2, "--iw-zone-scene", "headerSurface");
  }
  function isVisible(el2) {
    const rect = el2.getBoundingClientRect?.();
    return !!rect && (rect.width > 0 || rect.height > 0);
  }
  function pickVisible(candidates) {
    return candidates.find(isVisible) || candidates[0] || null;
  }
  function findLiveHeader() {
    const candidates = [...document.querySelectorAll("header")].filter((header) => {
      const text = norm6(header.textContent);
      return /combat\s+lv\s*\d+/i.test(text) && /players\s+online\s*:\s*\d+/i.test(text) && /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(text);
    });
    return pickVisible(candidates);
  }
  function directChildContaining(parent, node2) {
    if (!parent || !node2) return null;
    let cur = node2;
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
    const meta = [...layout.querySelectorAll("p,span,div")].find((el2) => /combat\s+lv\s*\d+.*zone\s*\d+\s*:/i.test(norm6(el2.textContent)) && el2.childElementCount <= 1);
    const online = [...layout.querySelectorAll("button,p,span,div")].find((el2) => /^\s*players\s+online\s*:\s*\d+/i.test(norm6(el2.textContent)) && el2.childElementCount <= 1);
    const profile = name ? name.closest(".min-w-0.overflow-hidden") || directChildContaining(layout, name) : null;
    if (!profile) return { profile: null, region: null };
    setRole5(profile, "profile");
    if (name) setRole5(name, "profile-name");
    if (meta) setRole5(meta, "profile-meta");
    if (online) setRole5(online, "profile-online");
    const brand = [...profile.children].find((el2) => /^idleworlds$/i.test(norm6(el2.textContent)));
    if (brand) setRole5(brand, "brand");
    const children = [...profile.children];
    const nameIndex = name ? children.indexOf(name) : -1;
    const metaIndex = meta ? children.indexOf(meta) : -1;
    if (nameIndex >= 0 && metaIndex > nameIndex + 1) {
      for (let i = nameIndex + 1; i < metaIndex; i += 1) {
        if (norm6(children[i].textContent)) {
          setRole5(children[i], "profile-title");
          break;
        }
      }
    }
    let region = profile.parentElement && profile.parentElement !== layout && layout.contains(profile.parentElement) ? profile.parentElement : directChildContaining(layout, profile);
    if (!region || region === layout) region = profile;
    if (region !== profile) setRole5(region, "identity-region");
    if (region) ensureCrest(region);
    return { profile, region };
  }
  function classifyUtilities(layout, region) {
    let utilities = region?.querySelector(":scope > div:has(button.header-icon-btn)") || layout.querySelector("div:has(> button.header-icon-btn)");
    if (!utilities) {
      utilities = [...layout.querySelectorAll("div")].find((div) => {
        const buttons = [...div.children].filter((el2) => el2.tagName === "BUTTON");
        return buttons.length >= 3 && buttons.length === div.childElementCount && buttons.every((btn) => norm6(btn.textContent).length <= 3);
      }) || null;
    }
    if (!utilities) return null;
    setRole5(utilities, "utilities");
    const iconButtons = [...utilities.querySelectorAll("button.header-icon-btn")];
    (iconButtons.length ? iconButtons : [...utilities.querySelectorAll(":scope > button")]).forEach((btn) => setRole5(btn, "utility-button"));
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
    const statsAnchor = [...layout.querySelectorAll("button,div")].find((el2) => /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(norm6(el2.textContent)) && el2.childElementCount <= 1);
    let grid = statsAnchor?.closest(".grid.grid-cols-2") || [...layout.children].find((el2) => el2 !== region && el2.querySelector?.(".stat-chip")) || null;
    if (!grid && statsAnchor) {
      let cur = statsAnchor.parentElement;
      for (let depth = 0; cur && cur !== layout && cur !== region && depth < 4; depth += 1, cur = cur.parentElement) {
        const cards = [...cur.children].filter((el2) => el2.matches?.(".stat-chip,button,div"));
        if (cards.length >= 3 && cards.includes(directChildContaining(cur, statsAnchor))) {
          grid = cur;
          break;
        }
      }
    }
    if (!grid) return null;
    setRole5(grid, "status-grid");
    tagStatusCards(grid);
    return grid;
  }
  function tagStatusCards(grid) {
    [...grid.children].forEach((card, index) => {
      if (!card.matches(".stat-chip,button,div")) return;
      setRole5(card, "status-card");
      const cardIndex = String(index + 1);
      if (card.dataset.iwHeaderCard !== cardIndex) card.dataset.iwHeaderCard = cardIndex;
      const kind2 = statKind(norm6(card.textContent));
      if (card.dataset.iwHeaderStat !== kind2) card.dataset.iwHeaderStat = kind2;
    });
  }
  var headerResolution = null;
  function headerResolutionValid(entry2) {
    return entry2.root.isConnected && entry2.root.getAttribute(ROLE3) === "root" && entry2.layout.isConnected && (entry2.layout === entry2.root || entry2.layout.getAttribute(ROLE3) === "layout") && (!entry2.region || entry2.region.isConnected) && (!entry2.utilities || entry2.utilities.isConnected) && (!entry2.grid || entry2.grid.isConnected);
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
    setRole5(root, "root");
    applyHeaderVars(root);
    if (!root.firstElementChild) {
      headerResolution = null;
      return;
    }
    const layout = root.childElementCount === 1 ? root.firstElementChild : root;
    if (layout !== root) setRole5(layout, "layout");
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
      const text = norm6(candidate.textContent);
      if (!text || text.length > 260 || /zone\s*\d+\s*:/i.test(text)) continue;
      return candidate;
    }
    return null;
  }
  function classifyAdjacent() {
    const nav = pickVisible([...document.querySelectorAll('[data-iw-ui="main-nav"]')]);
    const announcement = findAnnouncement(nav);
    if (announcement) {
      setRole5(announcement, "announcement");
    }
    const zone = pickVisible([...document.querySelectorAll('[data-iw-ui="zone-bar"]')]);
    if (zone) {
      setRole5(zone, "zone-shell");
      applyZoneVars(zone);
    }
  }
  function reconcile2() {
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
      reconcile2();
    });
  }
  function clearHeaderRenderer() {
    headerResolution = null;
    lastZoneNumber = null;
    delete document.documentElement.dataset.iwZoneTheme;
    SkillsArtService.clearThemeVariables(document.documentElement);
    document.querySelectorAll(`[${ROLE3}]`).forEach((el2) => {
      el2.removeAttribute(ROLE3);
      delete el2.dataset.iwHeaderCard;
      delete el2.dataset.iwHeaderStat;
      delete el2.dataset.iwZone;
    });
    document.querySelectorAll(".fs-header-crest").forEach((el2) => el2.remove());
    document.querySelectorAll("*").forEach((el2) => {
      ASSET_VARS.forEach((name) => el2.style?.removeProperty(name));
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
  function ownedTree(el2) {
    return el2.closest?.(".fs-inv-row, .fs-skill-header, .iw-tip") || null;
  }
  function shouldSkip(el2) {
    if (!el2 || el2.nodeType !== 1) return true;
    if (["SCRIPT", "STYLE", "LINK", "META", "HEAD", "HTML"].includes(el2.tagName)) return true;
    if (el2.classList.contains("fs-skill-wrapper")) return true;
    if (ownedTree(el2)) return true;
    return false;
  }
  function isSurfaceCandidate(el2) {
    if (el2 === document.body) return true;
    if (el2.matches?.(SURFACE_SELECTOR)) return true;
    const parent = el2.parentElement;
    if (parent === document.body) return true;
    if (parent?.parentElement === document.body && el2.children.length > 1) return true;
    return false;
  }
  function setImportant(el2, prop, value) {
    return styleOwner.set(el2, prop, value, "important");
  }
  function paintElement(el2) {
    if (shouldSkip(el2) || !isSurfaceCandidate(el2)) return false;
    let changed = false;
    const style = getComputedStyle(el2);
    const bg = normHex(style.backgroundColor);
    if (bg && GAME_NAVIES.has(bg)) {
      changed = setImportant(el2, "background-color", ourColour(bg)) || changed;
    }
    const sides = ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
    const sideProps = ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
    for (let i = 0; i < sides.length; i += 1) {
      const hex = normHex(style[sides[i]]);
      if (hex && GAME_NAVIES.has(hex)) {
        changed = setImportant(el2, sideProps[i], "#342D20") || changed;
      }
    }
    if (changed && el2.dataset.iwPainted !== "1") el2.dataset.iwPainted = "1";
    return changed;
  }
  function paintBackground(root = document.body) {
    if (!root) return 0;
    let changed = 0;
    try {
      if (root.nodeType === 1 && paintElement(root)) changed += 1;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node2;
      while (node2 = walker.nextNode()) {
        if (paintElement(node2)) changed += 1;
      }
    } catch (err) {
      warnOnce("background:paint", err);
    }
    return changed;
  }
  function clearBackgroundPaint() {
    styleOwner.restoreAll();
    document.querySelectorAll('[data-iw-painted="1"]').forEach((el2) => {
      delete el2.dataset.iwPainted;
    });
  }

  // src/modules/OverlayFramer.js
  var SCRIM = "scrim";
  var PANEL = "panel";
  var POPUP = "popup";
  var PLAYER_STATS = "player-stats";
  var STAT_LABEL = "stat-label";
  var STAT_VALUE = "stat-value";
  var OVERLAY_HOST_ATTR = "data-iw-overlay-host";
  var FRAMED_SURFACE = [
    '[data-iw-inventory-root="1"]',
    '[data-iw-ui="section-frame"]',
    '.fs-skills-section-frame[data-iw-skills-ui-ready="1"]',
    ".compact-panel",
    '[data-iw-overlay="panel"]'
  ].join(",");
  var SKIN_OWNED = [
    "[data-iw-arcane-cache]",
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
  var popupHosts = /* @__PURE__ */ new Map();
  var normText5 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  function setData3(el2, key, value) {
    if (el2?.dataset && el2.dataset[key] !== value) el2.dataset[key] = value;
  }
  function clearPlayerStatsSurface(surface) {
    if (!surface) return;
    if (surface.dataset?.iwOverlayContent === PLAYER_STATS) delete surface.dataset.iwOverlayContent;
    surface.querySelectorAll?.("[data-iw-overlay-role]").forEach((el2) => {
      if ([STAT_LABEL, STAT_VALUE].includes(el2.dataset.iwOverlayRole)) delete el2.dataset.iwOverlayRole;
    });
  }
  function findPlayerStatsSurface(card) {
    if (!card) return null;
    for (const surface of card.querySelectorAll(".compact-panel")) {
      const children = [...surface.children];
      const heading = children.find((el2) => normText5(el2.textContent).toLowerCase() === "lifetime stats");
      if (!heading) continue;
      const rows = children.filter((row) => {
        const cells = [...row.children];
        if (cells.length !== 2) return false;
        const label4 = normText5(cells[0].textContent);
        const value = normText5(cells[1].textContent);
        return !!label4 && /^-?[\d,.]+$/.test(value);
      });
      if (rows.length >= 2) return { surface, rows };
    }
    return null;
  }
  function classifyOverlayContent(card) {
    const match = findPlayerStatsSurface(card);
    const existing = [...card.querySelectorAll('[data-iw-overlay-content="player-stats"]')];
    for (const surface of existing) if (surface !== match?.surface) clearPlayerStatsSurface(surface);
    if (!match) return;
    setData3(match.surface, "iwOverlayContent", PLAYER_STATS);
    const keep = /* @__PURE__ */ new Set();
    for (const row of match.rows) {
      const [label4, value] = row.children;
      setData3(label4, "iwOverlayRole", STAT_LABEL);
      setData3(value, "iwOverlayRole", STAT_VALUE);
      keep.add(label4);
      keep.add(value);
    }
    match.surface.querySelectorAll("[data-iw-overlay-role]").forEach((el2) => {
      if (!keep.has(el2) && [STAT_LABEL, STAT_VALUE].includes(el2.dataset.iwOverlayRole)) delete el2.dataset.iwOverlayRole;
    });
  }
  function visible(el2) {
    if (!el2 || el2.nodeType !== 1) return false;
    const cs = getComputedStyle(el2);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el2.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }
  function area(el2) {
    const r = el2.getBoundingClientRect();
    return r.width * r.height;
  }
  function isScrim(el2) {
    const cs = getComputedStyle(el2);
    if (cs.position !== "fixed") return false;
    const z = parseInt(cs.zIndex, 10);
    if (!Number.isFinite(z) || z < 20) return false;
    const r = el2.getBoundingClientRect();
    const coversW = r.width >= innerWidth * 0.85 && r.left <= innerWidth * 0.15;
    const coversH = r.height >= innerHeight * 0.85 && r.top <= innerHeight * 0.15;
    if (!coversW || !coversH) return false;
    if (!visible(el2)) return false;
    if (!el2.querySelector("*")) return false;
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
      classifyOverlayContent(card);
    }
  }
  function untag(el2) {
    if (el2.dataset && el2.dataset.iwOverlay) delete el2.dataset.iwOverlay;
  }
  function directChildUnder3(frame2, el2) {
    if (!frame2 || !el2 || frame2 === el2) return null;
    let node2 = el2;
    while (node2?.parentElement && node2.parentElement !== frame2) node2 = node2.parentElement;
    return node2?.parentElement === frame2 ? node2 : null;
  }
  function releaseHost(host, exceptPopup = null) {
    if (!host?.isConnected) return;
    for (const [popup, owner] of popupHosts) {
      if (popup !== exceptPopup && owner === host) return;
    }
    host.removeAttribute(OVERLAY_HOST_ATTR);
  }
  function clearPopupTag(popup) {
    const host = popupHosts.get(popup);
    popupHosts.delete(popup);
    if (popup?.dataset?.iwOverlay === POPUP) delete popup.dataset.iwOverlay;
    tagged.delete(popup);
    releaseHost(host, popup);
  }
  function tagPopup(popup, frame2) {
    const host = directChildUnder3(frame2, popup);
    if (!host) return false;
    const previous = popupHosts.get(popup);
    if (previous && previous !== host) {
      popupHosts.delete(popup);
      releaseHost(previous, popup);
    }
    if (popup.dataset.iwOverlay !== POPUP) popup.dataset.iwOverlay = POPUP;
    host.setAttribute(OVERLAY_HOST_ATTR, "1");
    popupHosts.set(popup, host);
    tagged.add(popup);
    return true;
  }
  function matchingExpandedController(popup) {
    if (!popup?.id) return null;
    for (const control of document.querySelectorAll("[aria-controls]")) {
      if (control.getAttribute("aria-controls") !== popup.id) continue;
      if (control.getAttribute("aria-expanded") === "true") return control;
    }
    return null;
  }
  function capturedInventoryFilterPopup(popup, frame2) {
    if (!frame2?.matches?.('[data-iw-inventory-root="1"]')) return false;
    const parent = popup.parentElement;
    if (!parent) return false;
    const trigger = [...parent.children].find((el2) => {
      if (el2 === popup || !el2.matches?.('button, [role="button"]')) return false;
      const label4 = `${el2.getAttribute("aria-label") || ""} ${el2.getAttribute("title") || ""}`;
      return /filter inventory/i.test(label4);
    });
    if (!trigger) return false;
    return popup.parentElement === trigger.parentElement && popup.querySelectorAll('button, [role="button"], input, [role="option"], [role="menuitem"]').length >= 2;
  }
  function popupSemantics(popup, frame2) {
    const role2 = String(popup.getAttribute("role") || "").toLowerCase();
    if (["menu", "listbox", "dialog"].includes(role2)) return true;
    if (matchingExpandedController(popup)) return true;
    return capturedInventoryFilterPopup(popup, frame2);
  }
  function classifyContainedPopup(popup) {
    if (!popup || !visible(popup)) return null;
    if (popup.matches?.(".iw-tip, #iw-tip") || popup.closest?.(".iw-tip, #iw-tip")) return null;
    if (popup.matches?.(ALREADY_FRAMED)) return null;
    const cs = getComputedStyle(popup);
    if (!["absolute", "fixed"].includes(cs.position)) return null;
    if (!popup.querySelector('button, a, input, select, [role="button"], [role="option"], [role="menuitem"]')) return null;
    const frame2 = popup.closest?.(FRAMED_SURFACE);
    if (!frame2 || frame2 === popup) return null;
    return popupSemantics(popup, frame2) ? frame2 : null;
  }
  function popupCandidates() {
    const out = new Set(document.querySelectorAll(
      '[role="menu"],[role="listbox"],[role="dialog"],[aria-modal="true"]'
    ));
    for (const control of document.querySelectorAll('[aria-controls][aria-expanded="true"]')) {
      const id = control.getAttribute("aria-controls");
      if (id) {
        const target = document.getElementById(id);
        if (target) out.add(target);
      }
    }
    for (const trigger of document.querySelectorAll(
      '[data-iw-inventory-root="1"] button[aria-label="Filter inventory"],[data-iw-inventory-root="1"] button[title="Filter inventory"]'
    )) {
      const parent = trigger.parentElement;
      if (!parent) continue;
      for (const sibling of parent.children) if (sibling !== trigger) out.add(sibling);
    }
    return out;
  }
  function frameOverlays() {
    try {
      for (const el2 of [...tagged]) {
        if (!el2.isConnected) {
          if (el2.dataset?.iwOverlay === POPUP) clearPopupTag(el2);
          else tagged.delete(el2);
          continue;
        }
        if (el2.dataset.iwOverlay === SCRIM && !isScrim(el2)) {
          untag(el2);
          tagged.delete(el2);
          continue;
        }
        if (el2.dataset.iwOverlay === POPUP) {
          const frame2 = classifyContainedPopup(el2);
          if (!frame2) clearPopupTag(el2);
          else tagPopup(el2, frame2);
          continue;
        }
        if (el2.dataset.iwOverlay === PANEL) classifyOverlayContent(el2);
      }
      for (const popup of popupCandidates()) {
        if (popup.dataset?.iwOverlay === POPUP) continue;
        const frame2 = classifyContainedPopup(popup);
        if (frame2) tagPopup(popup, frame2);
      }
      const seen = /* @__PURE__ */ new Set();
      const candidates = document.querySelectorAll(
        '[class*="fixed"],[style*="position: fixed"],[style*="position:fixed"]'
      );
      for (const el2 of candidates) {
        if (seen.has(el2)) continue;
        seen.add(el2);
        if (el2.dataset.iwOverlay === SCRIM) continue;
        if (el2.closest(SKIN_OWNED)) continue;
        if (isScrim(el2)) tagScrim(el2);
      }
    } catch (err) {
      warnOnce("overlay:frame", err);
    }
  }
  function clearOverlayFramer() {
    document.querySelectorAll("[data-iw-overlay]").forEach(untag);
    document.querySelectorAll(`[${OVERLAY_HOST_ATTR}]`).forEach((el2) => el2.removeAttribute(OVERLAY_HOST_ATTR));
    document.querySelectorAll('[data-iw-overlay-content="player-stats"]').forEach(clearPlayerStatsSurface);
    document.querySelectorAll("[data-iw-overlay-role]").forEach((el2) => {
      if ([STAT_LABEL, STAT_VALUE].includes(el2.dataset.iwOverlayRole)) delete el2.dataset.iwOverlayRole;
    });
    tagged = /* @__PURE__ */ new Set();
    popupHosts = /* @__PURE__ */ new Map();
  }

  // src/styles/base.css
  var base_default = '@font-face{font-family:"Cinzel";font-style:normal;font-weight:600 700;font-display:swap;src:url(../assets/fonts/cinzel-variable.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:400;font-display:swap;src:url(../assets/fonts/barlow-400.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:500;font-display:swap;src:url(../assets/fonts/barlow-500.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:600;font-display:swap;src:url(../assets/fonts/barlow-600.woff2) format("woff2")}@font-face{font-family:"Barlow";font-style:normal;font-weight:700;font-display:swap;src:url(../assets/fonts/barlow-700.woff2) format("woff2")}@font-face{font-family:"Crimson Text";font-style:italic;font-weight:400;font-display:swap;src:url(../assets/fonts/crimson-text-italic.woff2) format("woff2")}:root{--iw-ink-950: #070806;--iw-ink-900: #0B0C0A;--iw-ink-850: #10100D;--iw-ink-800: #14130F;--iw-ink-750: #191711;--iw-ink-700: #1E1B15;--iw-ink-600: #29251C;--iw-th-accent: #D4AD63;--iw-th-accent-dim: #9D8458;--iw-th-edge: #6B4F28;--iw-th-hairline: #9B7437;--iw-th-hairline-hi: #D09A4B;--iw-th-bracket: #C9A24D;--iw-th-bracket-dim: #8A7038;--iw-th-brass: #8A6A2C;--iw-th-rule: #806337;--iw-th-rule-soft: #3A2F18;--iw-th-plate: #0B0C0E;--iw-th-cta: #B64619;--iw-th-cta-hi: #D15A22;--iw-th-ground-a: #171713;--iw-th-ground-b: #0D0E0C;--iw-th-ground-wash: transparent;--iw-th-glow: rgba(226,164,72,.08);--iw-th-edge-mid: #4A3820;--iw-th-edge-soft: #332B20;--iw-th-edge-faint: #29251D;--iw-line: #342D20;--iw-line-hi: #58482B;--iw-line-hot: var(--iw-th-rule);--iw-gold: var(--iw-th-accent);--iw-gold-dim: var(--iw-th-accent-dim);--iw-ember: var(--iw-th-cta);--iw-ember-hi: var(--iw-th-cta-hi);--iw-text: #DDD6C6;--iw-text-hi:#F0E8D6;--iw-dim: #938A79;--iw-faint: #666052;--iw-good: #82B88A;--iw-bad: #D27171;--iw-info: #75A8C8;--iw-t-common: #B9B4A8;--iw-t-uncommon: #6FBF73;--iw-t-rare: #5B9BD5;--iw-t-epic: #B98FE0;--iw-t-legendary: #D98A3A;--iw-t-mythic: #E06666;--iw-font-head: "Cinzel", Georgia, serif;--iw-font-ui: "Barlow", system-ui, -apple-system, sans-serif;--iw-font-flav: "Crimson Text", Georgia, serif;--iw-r-panel: 3px;--iw-r-control: 2px;--iw-r-slot: 2px;--iw-r: var(--iw-r-control);--iw-r-sm: var(--iw-r-slot);--iw-action-tick: 1s;--background: var(--iw-ink-900) !important;--foreground: var(--iw-text) !important;--card: var(--iw-ink-800) !important;--card-foreground: var(--iw-text) !important;--popover: var(--iw-ink-800) !important;--popover-foreground: var(--iw-text) !important;--panel-bg: var(--iw-ink-800) !important;--panel-border: var(--iw-line) !important;--surface-bg: var(--iw-ink-700) !important;--surface-border: var(--iw-line) !important;--primary: var(--iw-ember) !important;--primary-foreground: #FFEAD1 !important;--accent: var(--iw-ember) !important;--accent-foreground: var(--iw-text-hi) !important;--ring: var(--iw-gold-dim)!important;--border: var(--iw-line) !important;--input: var(--iw-ink-850) !important;--muted: var(--iw-ink-700) !important;--muted-foreground: var(--iw-dim) !important;--sidebar: var(--iw-ink-800) !important;--sidebar-foreground: var(--iw-text) !important;--sidebar-border: var(--iw-line) !important;--sidebar-accent: var(--iw-ink-700) !important}:root{--iw-zone-atlas: url(../assets/skills_ui_atlas.webp);--iw-corner-filigree: url(../assets/inventory/panel_corners.webp);--iw-zone-separator: url(../assets/inventory/separator_flourish.webp)}:root[data-iw-zone-theme=glacial]{--iw-th-accent: #9FCBE6;--iw-th-accent-dim: #7C9DB4;--iw-th-edge: #45657D;--iw-th-hairline: #6E96B4;--iw-th-hairline-hi: #A7CFE6;--iw-th-bracket: #A9CADE;--iw-th-bracket-dim: #6E8CA0;--iw-th-brass: #5C7E96;--iw-th-rule: #5E86A0;--iw-th-rule-soft: #223540;--iw-th-plate: #0A0E12;--iw-th-cta: #356E9A;--iw-th-cta-hi: #4E90BE;--iw-th-ground-a: #14171A;--iw-th-ground-b: #0B0D10;--iw-th-ground-wash: rgba(126,164,192,.055);--iw-th-glow: rgba(150,200,230,.10)}:root[data-iw-zone-theme=infernal]{--iw-th-accent: #E0762E;--iw-th-accent-dim: #B5673A;--iw-th-edge: #6A2A18;--iw-th-hairline: #8A3B22;--iw-th-hairline-hi: #D6702E;--iw-th-bracket: #D2782E;--iw-th-bracket-dim: #8A4326;--iw-th-brass: #7A3A1E;--iw-th-rule: #7E3A22;--iw-th-rule-soft: #2A1109;--iw-th-plate: #0C0705;--iw-th-cta: #B23A16;--iw-th-cta-hi: #D0602A;--iw-th-ground-a: #17110E;--iw-th-ground-b: #0D0908;--iw-th-ground-wash: rgba(200,80,30,.055);--iw-th-glow: rgba(224,118,46,.11)}:root[data-iw-zone-theme=verdant]{--iw-th-accent: #82BE68;--iw-th-accent-dim: #7C9463;--iw-th-edge: #3B5A2E;--iw-th-hairline: #5E7E44;--iw-th-hairline-hi: #97C57A;--iw-th-bracket: #8FBE6E;--iw-th-bracket-dim: #5E7E44;--iw-th-brass: #4E6A2E;--iw-th-rule: #5E7E44;--iw-th-rule-soft: #202A16;--iw-th-plate: #080B07;--iw-th-cta: #4E7A30;--iw-th-cta-hi: #6A9C42;--iw-th-ground-a: #131711;--iw-th-ground-b: #0A0D08;--iw-th-ground-wash: rgba(126,176,94,.05);--iw-th-glow: rgba(150,200,110,.09)}:root[data-iw-zone-theme=forged-metal]{--iw-th-accent: #A6BBCC;--iw-th-accent-dim: #8593A2;--iw-th-edge: #3E4A57;--iw-th-hairline: #6E8092;--iw-th-hairline-hi: #B7C5CF;--iw-th-bracket: #A6B8C6;--iw-th-bracket-dim: #6E8092;--iw-th-brass: #5A6675;--iw-th-rule: #6E8092;--iw-th-rule-soft: #232A31;--iw-th-plate: #090B0E;--iw-th-cta: #45607A;--iw-th-cta-hi: #5E82A2;--iw-th-ground-a: #14161A;--iw-th-ground-b: #0B0D10;--iw-th-ground-wash: rgba(150,175,200,.045);--iw-th-glow: rgba(180,200,220,.08)}:root[data-iw-zone-theme=celestial]{--iw-th-accent: #E7C87A;--iw-th-accent-dim: #B7A574;--iw-th-edge: #5A5330;--iw-th-hairline: #B99A55;--iw-th-hairline-hi: #EBD08A;--iw-th-bracket: #E2C170;--iw-th-bracket-dim: #9A8340;--iw-th-brass: #7A6A38;--iw-th-rule: #8F7A45;--iw-th-rule-soft: #2A2718;--iw-th-plate: #0A0B0E;--iw-th-cta: #9A6E2E;--iw-th-cta-hi: #C79A4A;--iw-th-ground-a: #16150F;--iw-th-ground-b: #0C0C0A;--iw-th-ground-wash: rgba(200,180,110,.05);--iw-th-glow: rgba(230,200,130,.10)}:root[data-iw-zone-theme=voidborn]{--iw-th-accent: #A97FD8;--iw-th-accent-dim: #8C74A6;--iw-th-edge: #46345C;--iw-th-hairline: #6E4F92;--iw-th-hairline-hi: #B48EDC;--iw-th-bracket: #AE86D6;--iw-th-bracket-dim: #6E4F92;--iw-th-brass: #573C6B;--iw-th-rule: #6E4F92;--iw-th-rule-soft: #251A33;--iw-th-plate: #0A0710;--iw-th-cta: #6A3CAA;--iw-th-cta-hi: #8E63C8;--iw-th-ground-a: #16121C;--iw-th-ground-b: #0C0910;--iw-th-ground-wash: rgba(150,110,210,.055);--iw-th-glow: rgba(169,127,216,.10)}:root[data-iw-zone-theme=runic-arcane]{--iw-th-accent: #5CC6B4;--iw-th-accent-dim: #6E9E96;--iw-th-edge: #234C46;--iw-th-hairline: #3E7E72;--iw-th-hairline-hi: #72B7A9;--iw-th-bracket: #5FC6B2;--iw-th-bracket-dim: #3E7E72;--iw-th-brass: #2E5A52;--iw-th-rule: #3E7E72;--iw-th-rule-soft: #17302C;--iw-th-plate: #070C0B;--iw-th-cta: #26786A;--iw-th-cta-hi: #3E9E8C;--iw-th-ground-a: #101715;--iw-th-ground-b: #080D0C;--iw-th-ground-wash: rgba(90,200,180,.05);--iw-th-glow: rgba(110,200,185,.09)}:root[data-iw-zone-theme=lunar-spectral]{--iw-th-accent: #9FA8D6;--iw-th-accent-dim: #8489AC;--iw-th-edge: #2C3150;--iw-th-hairline: #5A5F86;--iw-th-hairline-hi: #A6ADCD;--iw-th-bracket: #A4ACD6;--iw-th-bracket-dim: #5A5F86;--iw-th-brass: #45496B;--iw-th-rule: #5A5F86;--iw-th-rule-soft: #1E2033;--iw-th-plate: #08090F;--iw-th-cta: #4A4F8A;--iw-th-cta-hi: #6E74AE;--iw-th-ground-a: #14151C;--iw-th-ground-b: #0A0B10;--iw-th-ground-wash: rgba(150,155,210,.05);--iw-th-glow: rgba(159,168,214,.09)}:root[data-iw-zone-theme=tempest-oceanic]{--iw-th-accent: #4FC7D8;--iw-th-accent-dim: #5E9EA8;--iw-th-edge: #123C48;--iw-th-hairline: #2E6E7C;--iw-th-hairline-hi: #6FC0CE;--iw-th-bracket: #52C7D6;--iw-th-bracket-dim: #2E6E7C;--iw-th-brass: #1E5C68;--iw-th-rule: #2E6E7C;--iw-th-rule-soft: #122A31;--iw-th-plate: #060E11;--iw-th-cta: #227483;--iw-th-cta-hi: #3EA6B8;--iw-th-ground-a: #0F171A;--iw-th-ground-b: #070D0F;--iw-th-ground-wash: rgba(80,190,210,.05);--iw-th-glow: rgba(90,200,220,.10)}:root[data-iw-zone-theme]{--iw-th-edge-mid: color-mix(in srgb, var(--iw-th-edge) 66%, var(--iw-ink-850));--iw-th-edge-soft: color-mix(in srgb, var(--iw-th-edge) 42%, var(--iw-ink-850));--iw-th-edge-faint: color-mix(in srgb, var(--iw-th-edge) 26%, var(--iw-ink-850));--iw-line: var(--iw-th-edge-soft);--iw-line-hi: color-mix(in srgb, var(--iw-th-edge) 84%, var(--iw-ink-850))}html,body{background-color:var(--iw-ink-900)!important;color:var(--iw-text)!important;font-family:var(--iw-font-ui)!important}body{background-image:radial-gradient(1200px 520px at 50% -140px,rgba(124,91,42,.10),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.012),transparent 220px)!important;background-attachment:fixed!important}h1,h2,h3{font-family:var(--iw-font-head)!important;letter-spacing:.025em}h1:not(:where([data-iw-header=profile-name])),h2,h3{color:var(--iw-text-hi)!important}.compact-panel,[class~=compact-panel]{border-color:var(--iw-th-edge)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,0.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;color:var(--iw-text)!important;border-radius:var(--iw-r-panel)!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.6),inset 0 1px 0 var(--iw-th-glow)!important}.compact-row,[class*=item-row]{border-color:var(--iw-th-edge)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,0.02),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;color:var(--iw-text)!important}[class*=rounded-3xl],[class*=rounded-2xl],[class*=rounded-xl],[class*=rounded-lg],[class*=rounded-md]{border-radius:var(--iw-r-panel)!important}button:not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-order-handle]):not([data-fs-inv]):not([data-iw-header=utility-button]),[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-order-handle]):not([data-fs-inv]){border-radius:var(--iw-r-control)!important}button:not(:where([data-iw-header=profile-name] button)),[role=button]:not(:where([data-iw-header=profile-name] *)){background-color:var(--iw-ink-750);color:var(--iw-text)}[class*="hover:underline"]{background-color:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;border-radius:0!important}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-ui=section-title]):not([data-iw-order-handle]),[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-ui=section-title]):not([data-iw-order-handle]),input,select,textarea{font-family:var(--iw-font-ui)!important}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-order-handle]):not([data-fs-inv]):not([data-iw-zone-link]),[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([class*=decoration-dotted]):not([data-iw-quest-role]):not([data-iw-boss-role]):not([data-iw-village-role]):not([data-iw-guild-role]):not(.iw-boss-reward):not([data-iw-order-handle]):not([data-fs-inv]):not([data-iw-zone-link]){box-shadow:inset 0 1px 0 rgba(255,255,255,.028),0 1px 0 rgba(0,0,0,.65)!important;transition:color .12s ease,border-color .12s ease,background-color .12s ease,filter .12s ease!important}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-order-handle]):not([data-fs-inv]):hover:not(:disabled),[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-order-handle]):not([data-fs-inv]):hover{filter:brightness(1.08)}button:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-order-handle]):focus-visible,[role=button]:not(.iw-item-ref):not([data-iw-raid-owned]):not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-skill-role=level-progress]):not([data-iw-order-handle]):focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--iw-gold)!important;outline-offset:2px!important}input:not([type=checkbox]):not([type=radio]),select,textarea{border-radius:var(--iw-r-control)!important;border-color:var(--iw-line)!important;background:linear-gradient(180deg,#090C0D,#0C0E0D)!important;color:var(--iw-text)!important;box-shadow:inset 0 1px 4px rgba(0,0,0,.7),0 1px 0 rgba(255,255,255,.018)!important}input::placeholder,textarea::placeholder{color:var(--iw-faint)!important}nav button,nav [role=button],header button:not([class*=chat-name-]):not([class*="hover:underline"]):not([data-iw-header=utility-button]),[class*=tab] button{border-radius:var(--iw-r-control)!important;font-weight:700!important}hr{border-color:var(--iw-line)!important}.iw-ico{flex:none;display:block;position:relative;background-repeat:no-repeat;background-color:#090806;border:1px solid var(--iw-line-hi);border-radius:var(--iw-r-slot);box-shadow:inset 0 0 0 1px rgba(0,0,0,.45)}.iw-icon-badge{position:absolute;right:-3px;bottom:-3px;font-family:var(--iw-font-ui);font-size:9px;font-weight:700;line-height:1;padding:2px 3px;border-radius:1px;background:var(--iw-ink-950);border:1px solid var(--iw-ember);color:var(--iw-gold);font-variant-numeric:tabular-nums;pointer-events:none;z-index:3}.iw-icon-badge--sprite{right:-5px;bottom:-5px;width:22px;height:22px;padding:0;border:0;border-radius:0;background-color:transparent;color:transparent;font-size:0;line-height:0;filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))}.tier-common{color:var(--iw-t-common)}.tier-uncommon{color:var(--iw-t-uncommon)}.tier-rare{color:var(--iw-t-rare)}.tier-epic{color:var(--iw-t-epic)}.tier-legendary{color:var(--iw-t-legendary)}.tier-mythic{color:var(--iw-t-mythic)}.iw-btn{font-family:var(--iw-font-ui);font-size:12px;font-weight:700;letter-spacing:.055em;text-transform:uppercase;padding:7px 14px;min-width:76px;border-radius:var(--iw-r-control);cursor:pointer;border:1px solid var(--iw-line-hi);background:linear-gradient(180deg,#242018,#17140F);color:var(--iw-text);transition:background .13s,border-color .13s,color .13s;align-self:center;height:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 1px 0 #000}.iw-btn:hover{background:linear-gradient(180deg,#2B261C,#1A1711);border-color:var(--iw-gold-dim);color:var(--iw-gold)}.iw-btn--primary{background:linear-gradient(180deg,var(--iw-th-cta),color-mix(in srgb,var(--iw-th-cta) 60%,#000));border-color:var(--iw-th-cta-hi);color:#FFEAD1}.iw-btn--primary:hover{background:linear-gradient(180deg,var(--iw-th-cta-hi),color-mix(in srgb,var(--iw-th-cta) 66%,#000));border-color:var(--iw-ember-hi);color:#fff}.iw-btn--disabled,.iw-btn:disabled{background:#100F0C;border-color:var(--iw-th-edge-faint);color:var(--iw-faint);cursor:not-allowed;box-shadow:none}.iw-xp{display:flex;flex-direction:column;gap:4px}.iw-xp__line{display:flex;align-items:baseline;gap:8px;font-size:12px;font-family:var(--iw-font-ui)}.iw-xp__pct{color:var(--iw-gold);font-weight:700;font-variant-numeric:tabular-nums}.iw-xp__togo{margin-left:auto;color:var(--iw-faint);font-variant-numeric:tabular-nums}.iw-xp__track{height:4px;background:#080806;border:1px solid var(--iw-th-edge-faint);border-radius:0;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.75)}.iw-xp__fill{height:100%;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-th-cta) 55%,#000),var(--iw-ember));transition:width .3s ease}.iw-xp__fill--ready{background:linear-gradient(90deg,#2E6438,#4D9859)}::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-track{background:var(--iw-ink-950)}::-webkit-scrollbar-thumb{background:#403625;border-radius:1px}::-webkit-scrollbar-thumb:hover{background:var(--iw-line-hi)}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}[class*=rounded-full][class*=px-],button[class*=rounded-full]:not([class*=chat-name-]):not([class*="hover:underline"]),[role=button][class*=rounded-full]:not([class*=chat-name-]):not([class*="hover:underline"]){border-radius:var(--iw-r-control)!important}[class*=border][class*=rounded-3xl],[class*=border][class*=rounded-2xl],[class*=border][class*=rounded-xl]{border-color:var(--iw-line)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.018),inset 0 -1px 0 rgba(0,0,0,.38)!important}\n';

  // src/styles/skillcard-v2.css
  var skillcard_v2_default = 'html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]{--iw-skill-v2-icon: 43px;--iw-skill-v2-ring-gap: 7px;--iw-skill-v2-ring-weight: 4px;--iw-skill-v2-identity-w: 144px;--iw-skill-v2-command-w: 96px;--iw-skill-v2-gutter: 20px;--iw-skill-v2-rail-bottom: 6px;--iw-skill-v2-cmd-buffer: 8px;--iw-skill-v2-label-h: 12px;--iw-skill-v2-action-label-gap: 4px;--iw-skill-v2-glyph-safe-inset: 14px;--iw-skill-v2-action-label-font: 9.5px;--iw-skill-v2-btn-font: 0px;--iw-skill-v2-label-buffer: 4px;--iw-skill-v2-btn-tracking: .02em;--iw-skill-v2-btn-border: 3px;--iw-skill-v2-btn-offset: calc(var(--iw-skill-v2-label-h) + var(--iw-skill-v2-action-label-gap));--iw-skill-v2-glyph: max(16px, min(calc(var(--iw-skill-v2-btn-w) - var(--iw-skill-v2-glyph-safe-inset) - var(--iw-skill-v2-glyph-safe-inset)), calc(var(--iw-skill-v2-btn-h) - var(--iw-skill-v2-glyph-safe-inset) - var(--iw-skill-v2-glyph-safe-inset))));--iw-skill-v2-glyph-inset: calc(var(--iw-skill-v2-btn-offset) + (var(--iw-skill-v2-btn-h) - var(--iw-skill-v2-glyph)) / 2);--iw-skill-v2-btn-pad: 0;--iw-skill-v2-cmd-stack: calc(var(--iw-skill-v2-btn-offset) + var(--iw-skill-v2-btn-h));--iw-skill-v2-btn-w: 64px;--iw-skill-v2-nav-w: 30px;--iw-skill-v2-nav-h: 22px;--iw-skill-v2-nav-radius: 4px;--iw-skill-v2-btn-h: 66px;--iw-skill-v2-edge: var(--iw-th-edge-mid);--iw-skill-v2-edge-soft: var(--iw-th-edge-soft);container:iw-skill-card / inline-size!important;position:relative!important;overflow:visible!important;padding:0!important;margin-bottom:10px!important;border:1px solid var(--iw-skill-v2-edge)!important;border-radius:7px!important;background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--iw-th-edge) 50%,transparent),transparent 60%),linear-gradient(color-mix(in srgb,var(--iw-th-ground-a) 93%,transparent),color-mix(in srgb,var(--iw-th-ground-b) 96%,transparent)),url(../assets/skills_panel_texture.webp) center / cover!important;box-shadow:inset 0 0 0 3px var(--iw-th-plate),inset 0 0 0 4px var(--iw-th-edge-soft),0 4px 12px #0006!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]::before{content:""!important;position:absolute!important;inset:3px 20px auto!important;height:1px!important;background:linear-gradient(90deg,var(--iw-th-hairline-hi),color-mix(in srgb,var(--iw-th-accent) 65%,transparent),transparent)!important;pointer-events:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]::after{content:""!important;display:block!important;position:absolute!important;inset:-1px!important;z-index:3!important;pointer-events:none!important;border:solid transparent!important;border-width:17px 16px!important;border-radius:0!important;background:none!important;box-shadow:none!important;border-image:var(--iw-corner-filigree) 50% / 17px 16px / 0 stretch!important;opacity:.85!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-layout-shell="1"],html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]:not(:has(>[data-iw-skill-layout-shell="1"])){display:grid!important;grid-template-columns:var(--iw-skill-v2-identity-w) minmax(0,1fr) var(--iw-skill-v2-command-w)!important;grid-template-rows:1fr auto auto auto 1fr!important;grid-template-areas:"identity .        commands" "identity content  commands" "identity body     commands" "identity tabs     commands" "identity .        commands"!important;gap:0!important;align-items:stretch!important;min-height:calc(var(--iw-skill-v2-cmd-stack) + 24px)!important}html[data-iw-skill-card-design=new] [data-iw-collapsed="1"]>.compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-state]{display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone]{position:relative!important;align-self:stretch!important;min-width:0!important;border:0!important;margin:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=identity]{grid-area:identity!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:0!important;padding:13px 7px 8px!important;border-right:1px solid var(--iw-skill-v2-edge-soft)!important;background:radial-gradient(ellipse at 50% 30%,color-mix(in srgb,var(--fs-skill-accent) 18%,transparent),color-mix(in srgb,var(--iw-th-plate) 67%,transparent) 75%)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=identity]::before,html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=identity]::after{display:none!important;content:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=identity] *:not(.fs-skill-medallion-art):not([data-iw-skill-v2-level-readout]):not([data-iw-skill-v2-xp]):not([data-iw-skill-role=identity]):not(.fs-skill-medallion-art *):not([data-iw-skill-v2-level-readout] *):not([data-iw-skill-role=identity] *):not(:has([data-iw-skill-role=identity])){display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .fs-skill-medallion-art{position:relative!important;order:1!important;flex:0 0 auto!important;width:var(--iw-skill-v2-icon)!important;min-width:var(--iw-skill-v2-icon)!important;height:var(--iw-skill-v2-icon)!important;min-height:var(--iw-skill-v2-icon)!important;margin:0!important;border:1px solid var(--iw-th-hairline)!important;border-radius:50%!important;box-shadow:inset 0 0 0 3px var(--iw-th-plate),inset 0 0 12px #0009!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .fs-skill-medallion-art::after{content:""!important;display:block!important;position:absolute!important;inset:calc(-1 * var(--iw-skill-v2-ring-gap))!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;transform:none!important;border:0!important;border-radius:50%!important;z-index:2!important;background:conic-gradient(color-mix(in srgb,var(--fs-skill-accent, #55b6d9) 70%,#ccefff) 0 var(--iw-skill-v2-progress, 0%),var(--iw-th-edge-mid) var(--iw-skill-v2-progress, 0%) 100%)!important;-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--iw-skill-v2-ring-weight)),#000 calc(100% - var(--iw-skill-v2-ring-weight) + 1px))!important;mask:radial-gradient(farthest-side,transparent calc(100% - var(--iw-skill-v2-ring-weight)),#000 calc(100% - var(--iw-skill-v2-ring-weight) + 1px))!important;filter:drop-shadow(0 0 3px #70cfff66)!important;box-shadow:none!important;pointer-events:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-level-readout{position:relative!important;z-index:3!important;order:2!important;display:flex!important;flex-direction:column!important;align-items:center!important;width:max-content!important;min-width:44px!important;max-width:100%!important;margin:-2px 0 0!important;padding:1px 5px 3px!important;border:1px solid var(--iw-th-hairline)!important;border-radius:4px 4px 11px 11px!important;background:linear-gradient(var(--iw-th-ground-a),var(--iw-th-plate))!important;box-shadow:inset 0 0 0 2px var(--iw-th-edge-soft),0 2px 4px #0009!important;color:#f0f1e9!important;font-family:var(--iw-font-ui, sans-serif)!important;line-height:1.12!important;font-variant-numeric:tabular-nums!important;pointer-events:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-level{font-size:12px!important;font-weight:700!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-percent{font-size:9px!important;color:#bbcedc!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=identity]{order:3!important;width:100%!important;min-width:0!important;margin:6px 0 0!important;overflow:visible!important;text-align:center!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-xp{order:4!important;display:block!important;max-width:100%!important;min-width:0!important;margin:3px 0 0!important;padding:0 2px!important;font-family:var(--iw-font-ui, sans-serif)!important;font-size:10px!important;line-height:1.25!important;font-weight:600!important;font-variant-numeric:tabular-nums!important;color:#a9bccb!important;text-align:center!important;white-space:normal!important;overflow-wrap:normal!important;text-wrap:balance;cursor:pointer!important;pointer-events:auto!important;border-radius:3px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-xp:hover{color:#e3edf4!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-xp:focus-visible{outline:1px solid var(--iw-th-hairline, #6fa3c0)!important;outline-offset:1px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=identity]::before{display:block!important;font-size:11px!important;line-height:1.2!important;letter-spacing:.035em!important;font-weight:700!important;text-transform:uppercase!important;color:color-mix(in srgb,var(--fs-skill-accent) 65%,#d4e4ef)!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;max-width:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=level-progress],html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-break{display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]{grid-area:content!important;display:grid!important;grid-template-columns:minmax(0,max-content) auto!important;justify-content:start!important;align-content:center!important;align-items:center!important;gap:0 12px!important;position:static!important;transform:none!important;filter:none!important;translate:none!important;rotate:none!important;scale:none!important;backdrop-filter:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important;will-change:auto!important;padding:14px var(--iw-skill-v2-gutter) 10px!important;background:none!important;text-align:left!important;box-shadow:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>*{flex:0 0 auto!important;align-self:flex-start!important;order:5!important;min-width:0!important;max-width:100%!important;margin:0!important;text-align:left!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>*{grid-column:1 / -1!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>:is([data-iw-skill-role=action-title],:has([data-iw-skill-role=action-title])){grid-column:1!important;grid-row:1!important;align-self:center!important;width:auto!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=action-title]::before{display:block!important;font-size:clamp(17px,2cqi,23px)!important;line-height:1.15!important;letter-spacing:.01em!important;color:#f0eee5!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:left!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>.fs-skill-base-exp{grid-column:2!important;grid-row:1!important;align-self:center!important;justify-self:start!important;white-space:nowrap!important;width:max-content!important;padding:3px 10px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:4px!important;background:linear-gradient(color-mix(in srgb,var(--iw-th-edge-soft) 80%,var(--iw-th-plate)),var(--iw-th-plate))!important;color:#e6e4d5!important;font-size:11px!important;line-height:1.2!important;letter-spacing:.04em!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>.iw-skill-v2-summary{order:3!important;display:block!important;width:fit-content!important;padding:4px 10px!important;border:1px solid #294131!important;border-left:2px solid #6bbd8b!important;border-radius:3px!important;background:linear-gradient(90deg,#111d1b,#08101244)!important;color:#91d3a7!important;font-family:var(--iw-font-ui, sans-serif)!important;font-size:12px!important;line-height:1.3!important;overflow-wrap:anywhere!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>.iw-skill-v2-summary[data-iw-skill-v2-summary-state=unmet]{color:#e1b197!important;border-color:#533f35!important;border-left-color:#cb8d6c!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>*:not([data-iw-skill-role]):not([data-iw-skill-v2-section]):not([class*=fs-skill]):not([class*=iw-skill-v2]){color:#a7b4bb!important;font-size:12px!important;line-height:1.3!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>.iw-skill-v2-expand{order:9!important;align-self:flex-end!important;margin:-2px 0 0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:28px!important;min-width:28px!important;height:24px!important;min-height:24px!important;padding:0!important;border:0!important;background:none!important;color:#a8c8e2!important;cursor:pointer!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-expand::before{content:""!important;display:block!important;width:9px!important;height:9px!important;border:solid currentColor!important;border-width:0 2px 2px 0!important;transform:translateY(-2px) rotate(45deg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-expand[aria-expanded=true]::before{transform:translateY(2px) rotate(225deg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-expand:focus-visible{outline:2px solid #68b7ff!important;outline-offset:2px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]{--iw-skill-v2-cmd-stack: calc(var(--iw-skill-v2-btn-offset) + var(--iw-skill-v2-btn-h))}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]:has([data-iw-skill-role=nav-group]){--iw-skill-v2-cmd-stack: calc(var(--iw-skill-v2-btn-offset) + var(--iw-skill-v2-btn-h) + var(--iw-skill-v2-cmd-buffer) + var(--iw-skill-v2-nav-h))}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=commands]{grid-area:commands!important;display:block!important;padding:0!important;border-left:1px solid var(--iw-skill-v2-edge-soft)!important;background:linear-gradient(270deg,color-mix(in srgb,var(--iw-th-edge) 13%,transparent),transparent)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]{--fs-motion-idle: linear-gradient(135deg, color-mix(in srgb, var(--iw-th-cta) 58%, transparent), color-mix(in srgb, var(--iw-th-plate) 86%, transparent)), url(../assets/skills_panel_texture.webp) center / cover !important;--fs-motion-hover: linear-gradient(135deg, color-mix(in srgb, var(--iw-th-cta-hi) 62%, transparent), color-mix(in srgb, var(--iw-th-cta) 55%, transparent)), url(../assets/skills_panel_texture.webp) center / cover !important;--fs-motion-pressed: linear-gradient(color-mix(in srgb, var(--iw-th-plate) 88%, transparent), color-mix(in srgb, var(--iw-th-cta) 72%, transparent)), url(../assets/skills_panel_texture.webp) center / cover !important;--fs-button-border: var(--iw-skill-v2-btn-border) double var(--iw-th-hairline-hi) !important;--fs-button-shadow: inset 0 0 0 2px var(--iw-th-plate), inset 0 0 0 3px var(--iw-th-accent-dim), inset 0 0 16px color-mix(in srgb, var(--iw-th-accent) 42%, transparent), 0 0 0 2px var(--iw-th-plate), 0 0 0 3px var(--iw-th-edge-mid), 0 0 12px color-mix(in srgb, var(--iw-th-accent) 26%, transparent) !important;position:absolute!important;top:calc(50% - var(--iw-skill-v2-cmd-stack) / 2 + var(--iw-skill-v2-btn-offset))!important;left:calc(50% - var(--iw-skill-v2-btn-w) / 2)!important;right:auto!important;bottom:auto!important;margin:0!important;border-radius:9px!important;outline:none!important;color:transparent!important;overflow:hidden!important;font-size:0!important;line-height:var(--iw-skill-v2-label-h)!important;letter-spacing:.04em!important;white-space:nowrap!important;text-shadow:none!important;filter:none!important;transition:filter .15s ease!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]>:not([style*=width]){opacity:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]:hover{filter:brightness(1.2) drop-shadow(0 0 5px color-mix(in srgb,var(--iw-th-accent) 55%,transparent))!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]:active{filter:brightness(.85)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]:focus-visible{outline:2px solid var(--iw-th-accent)!important;outline-offset:5px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]:disabled,html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button][aria-disabled=true]{--fs-motion-idle: linear-gradient(#25313d, #121920) !important;--fs-motion-hover: linear-gradient(#25313d, #121920) !important;filter:grayscale(.8)!important;opacity:.55!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]>span[style*=width]{position:absolute!important;top:0!important;bottom:0!important;left:0!important;height:auto!important;z-index:1!important;border-radius:0!important;pointer-events:none!important;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-th-accent) 40%,transparent),color-mix(in srgb,var(--iw-th-accent) 82%,transparent))!important;box-shadow:inset -2px 0 0 color-mix(in srgb,var(--iw-th-accent) 35%,#fff),3px 0 12px color-mix(in srgb,var(--iw-th-accent) 75%,transparent)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]>span:not([style*=width]){position:relative!important;z-index:2!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]>span[style*=width]{transition:width var(--iw-skill-v2-fill-duration, .28s) linear!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-fill-reset] button[data-iw-skill-role=action-button]>span[style*=width]{transition:none!important}@media(prefers-reduced-motion:reduce){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button][data-iw-skill-role]>span[style*=width]{transition:none!important}}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=action-button]:has(>span[style*=width]){--fs-motion-idle: linear-gradient(135deg, color-mix(in srgb, var(--iw-th-plate) 76%, transparent), color-mix(in srgb, var(--iw-th-plate) 94%, transparent)), url(../assets/skills_panel_texture.webp) center / cover !important;--fs-motion-hover: linear-gradient(135deg, color-mix(in srgb, var(--iw-th-plate) 70%, transparent), color-mix(in srgb, var(--iw-th-plate) 88%, transparent)), url(../assets/skills_panel_texture.webp) center / cover !important;--fs-button-border: var(--iw-skill-v2-btn-border) double color-mix(in srgb, var(--iw-th-accent) 80%, #fff) !important;--fs-button-shadow: inset 0 0 0 2px var(--iw-th-plate), inset 0 0 0 3px var(--iw-th-accent), 0 0 0 2px var(--iw-th-plate), 0 0 0 3px var(--iw-th-accent-dim), 0 0 14px color-mix(in srgb, var(--iw-th-accent) 55%, transparent) !important;text-shadow:0 1px 2px #000,0 0 4px #000c!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-layout-shell="1"]>:is(.iw-skill-v2-action-glyph,.iw-skill-v2-action-label),html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]:not(:has(>[data-iw-skill-layout-shell="1"]))>:is(.iw-skill-v2-action-glyph,.iw-skill-v2-action-label){grid-area:commands!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-action-label{display:block!important;position:absolute!important;z-index:3!important;top:calc(50% - var(--iw-skill-v2-cmd-stack) / 2)!important;left:calc(50% - var(--iw-skill-v2-btn-w) / 2)!important;width:var(--iw-skill-v2-btn-w)!important;height:var(--iw-skill-v2-label-h)!important;margin:0!important;padding:0 var(--iw-skill-v2-label-buffer)!important;color:#f3e3c0!important;font:700 var(--iw-skill-v2-action-label-font)/var(--iw-skill-v2-label-h) var(--iw-font-head, serif)!important;text-transform:uppercase!important;letter-spacing:var(--iw-skill-v2-btn-tracking)!important;text-align:center!important;white-space:nowrap!important;overflow:visible!important;pointer-events:none!important;text-shadow:0 1px 2px #000,0 0 4px #000c!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-action-glyph{display:block!important;position:absolute!important;z-index:2!important;top:calc(50% - var(--iw-skill-v2-cmd-stack) / 2 + var(--iw-skill-v2-glyph-inset))!important;left:50%!important;transform:translateX(-50%)!important;width:var(--iw-skill-v2-glyph)!important;height:var(--iw-skill-v2-glyph)!important;background:none center / contain no-repeat!important;pointer-events:none!important;filter:drop-shadow(0 2px 3px #000a)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-long-action="1"] button[data-iw-skill-role=action-button]{color:transparent!important;text-shadow:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-long-action="1"] button[data-iw-skill-role=action-button]>:not([style*=width]){opacity:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-long-action="1"] .iw-skill-v2-action-label{opacity:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-long-action="1"] .iw-skill-v2-action-glyph[data-iw-skill-v2-action-timer]{display:grid!important;place-items:center!important;z-index:3!important;top:calc(50% - var(--iw-skill-v2-cmd-stack) / 2 + var(--iw-skill-v2-btn-offset))!important;left:calc(50% - var(--iw-skill-v2-btn-w) / 2)!important;width:var(--iw-skill-v2-btn-w)!important;height:var(--iw-skill-v2-btn-h)!important;transform:none!important;background:none!important;color:#f3fbff!important;font:700 15px/1 var(--iw-font-ui, sans-serif)!important;letter-spacing:.02em!important;font-variant-numeric:tabular-nums!important;text-shadow:0 1px 2px #000,0 0 6px color-mix(in srgb,var(--iw-th-accent) 65%,transparent)!important;filter:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=combat] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/combat.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=mining] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/mining.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=smithing] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/smithing.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=gathering] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/gathering.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=alchemy] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/alchemy.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=jewelcrafting] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/jewelcrafting.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=spellcrafting] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/spellcrafting.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=tailoring] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/tailoring.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=woodcutting] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/woodcutting.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-type=construction] .iw-skill-v2-action-glyph{background-image:url(../assets/skills-ui/action-icons/construction.svg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]:not(:is([data-iw-skill-v2-type=combat],[data-iw-skill-v2-type=mining],[data-iw-skill-v2-type=smithing],[data-iw-skill-v2-type=gathering],[data-iw-skill-v2-type=alchemy],[data-iw-skill-v2-type=jewelcrafting],[data-iw-skill-v2-type=spellcrafting],[data-iw-skill-v2-type=tailoring],[data-iw-skill-v2-type=woodcutting],[data-iw-skill-v2-type=construction])){--iw-skill-v2-btn-pad: 0 4px}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]:not(:is([data-iw-skill-v2-type=combat],[data-iw-skill-v2-type=mining],[data-iw-skill-v2-type=smithing],[data-iw-skill-v2-type=gathering],[data-iw-skill-v2-type=alchemy],[data-iw-skill-v2-type=jewelcrafting],[data-iw-skill-v2-type=spellcrafting],[data-iw-skill-v2-type=tailoring],[data-iw-skill-v2-type=woodcutting],[data-iw-skill-v2-type=construction])) .iw-skill-v2-action-glyph{display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone] [data-iw-skill-role=nav-group]{position:absolute!important;top:calc(50% - var(--iw-skill-v2-cmd-stack) / 2 + var(--iw-skill-v2-btn-offset) + var(--iw-skill-v2-btn-h) + var(--iw-skill-v2-cmd-buffer))!important;bottom:auto!important;left:auto!important;right:0!important;transform:none!important;z-index:4!important;display:flex!important;align-items:stretch!important;justify-content:center!important;gap:4px!important;width:var(--iw-skill-v2-command-w)!important;max-width:none!important;min-width:0!important;height:var(--iw-skill-v2-nav-h)!important;margin:0!important;padding:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=commands] :has(button[data-iw-skill-role=action-button]),html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone] :has(>[data-iw-skill-role=nav-group]):not([data-iw-skill-zone]){position:static!important;transform:none!important;filter:none!important;backdrop-filter:none!important;translate:none!important;rotate:none!important;scale:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important;will-change:auto!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{display:flex!important;align-items:center!important;justify-content:center!important;--fs-button-background: linear-gradient(color-mix(in srgb, var(--iw-th-edge-soft) 70%, var(--iw-th-plate)), var(--iw-th-plate)) !important;--fs-button-border: 1px solid var(--iw-th-edge-mid) !important;--fs-button-shadow: inset 0 1px 0 #ffffff0d !important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:hover{--fs-button-background: linear-gradient(var(--iw-th-edge-soft), var(--iw-th-plate)) !important;--fs-button-border: 1px solid var(--iw-th-accent) !important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::before{background:none!important;border-image:none!important;content:""!important;width:7px!important;height:7px!important;inset:auto!important;position:relative!important;display:block!important;opacity:1!important;filter:none!important;margin:0!important;border:solid color-mix(in srgb,var(--iw-th-accent) 72%,#fff)!important;border-width:0 2px 2px 0!important;transform:translateX(calc((7px - 2px) / -2.8284)) rotate(-45deg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction=prev]::before{transform:translateX(calc((7px - 2px) / 2.8284)) rotate(135deg)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction]::after{display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] button[data-iw-skill-role=nav-button][data-iw-nav-direction]>*{position:absolute!important;top:0!important;left:0!important;margin:0!important;visibility:hidden!important;pointer-events:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-controls{grid-area:tabs!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:center!important;gap:3px 10px!important;width:100%!important;margin:0!important;padding:0 var(--iw-skill-v2-gutter) var(--iw-skill-v2-rail-bottom)!important;border:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-controls{justify-content:flex-start!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-controls:not(:has(.iw-skill-v2-req-note)){display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-req-note{flex:1 1 200px!important;min-width:0!important;color:#deb097!important;font:500 10.5px/1.3 var(--iw-font-ui, sans-serif)!important;letter-spacing:.01em!important;text-align:left!important;overflow-wrap:anywhere!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-req-note::before{content:"⚠︎ "!important;color:#c7856c!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body:empty{display:none!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body{--iw-skill-v2-cell-min: 96px;--iw-skill-v2-cell-gap: 5px;container:iw-skill-body / inline-size!important;grid-area:body!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(max(var(--iw-skill-v2-cell-min),calc((100% - 2 * var(--iw-skill-v2-cell-gap)) / 3)),1fr))!important;align-content:center!important;align-items:stretch!important;gap:var(--iw-skill-v2-cell-gap)!important;width:auto!important;min-height:0!important;margin:0 var(--iw-skill-v2-gutter) 6px!important;padding:7px 8px!important;border:1px solid var(--iw-th-edge-mid)!important;border-radius:7px!important;background:linear-gradient(180deg,var(--iw-th-ground-a),var(--iw-th-plate))!important;box-shadow:inset 0 1px 0 #ffffff0d,inset 0 0 22px #00000066!important;text-align:left!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row{display:flex!important;align-items:center!important;min-width:0!important;padding:5px 8px!important;border:1px solid var(--iw-th-edge-faint)!important;border-left:2px solid #67ab83!important;border-radius:3px!important;color:#91cba4!important;background:color-mix(in srgb,var(--iw-th-edge-soft) 33%,transparent)!important;font:400 clamp(10px,3cqi,12.5px)/1.3 var(--iw-font-ui, sans-serif)!important;text-align:left!important;overflow-wrap:anywhere!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row[data-iw-skill-v2-body-state=unmet]{border-left-color:#c7856c!important;color:#deb097!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row[data-iw-skill-v2-body-state=met]:not([data-iw-skill-v2-body-kind=material])::before{content:"✓"!important;flex:0 0 auto!important;margin-right:7px!important;color:#67ab83!important;font-size:12px!important;line-height:1!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row[data-iw-skill-v2-body-kind=material]{flex-flow:row wrap!important;align-items:baseline!important;align-content:center!important;gap:0 6px!important;padding:4px 7px!important;max-width:100%!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-name{display:block!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;font-size:max(10px,.9em)!important;line-height:1.2!important;opacity:.92!important;overflow-wrap:anywhere!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-count{display:inline-flex!important;flex:0 1 auto!important;flex-wrap:wrap!important;align-items:baseline!important;min-width:0!important;max-width:100%!important;font-weight:600!important;line-height:1.2!important;font-variant-numeric:tabular-nums!important;white-space:normal!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] :is(.iw-skill-v2-body-count-owned,.iw-skill-v2-body-count-required){display:inline-block!important;max-width:100%!important;white-space:nowrap!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row[data-iw-skill-v2-body-state=met] .iw-skill-v2-body-count-owned::before{content:"✓ "!important;color:#67ab83!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row:not([data-iw-skill-v2-body-kind=material]){grid-column:1 / -1!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body-row:not([data-iw-skill-v2-body-state]){color:#b9c9d5!important;border-left-color:var(--iw-th-accent-dim)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .fs-skill-ingredient-item{justify-content:flex-start!important;text-align:left!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-state=collapsed] .iw-skill-v2-controls,html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skill-v2-state=collapsed] .iw-skill-v2-body{display:none!important}@container iw-skill-card (max-width: 580px){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-layout-shell="1"]{--iw-skill-v2-identity-w: 106px;--iw-skill-v2-command-w: 80px;--iw-skill-v2-btn-w: 64px;--iw-skill-v2-nav-w: 30px;--iw-skill-v2-gutter: 10px}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]{padding:12px var(--iw-skill-v2-gutter) 8px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=identity]::before{font-size:9px!important;letter-spacing:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=action-title]::before{font-size:16px!important}}@container iw-skill-card (max-width: 480px){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-layout-shell="1"]{--iw-skill-v2-identity-w: 92px;--iw-skill-v2-command-w: 76px;grid-template-rows:minmax(calc(var(--iw-skill-v2-cmd-stack) + 20px),auto) auto auto!important;grid-template-areas:"identity content commands" "body body body" "tabs tabs tabs"!important;min-height:0!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]{position:relative!important;grid-template-columns:minmax(0,1fr)!important;padding:10px var(--iw-skill-v2-gutter)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content]>.fs-skill-base-exp{grid-column:1!important;grid-row:2!important;margin-top:6px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=content] [data-iw-skill-role=nav-group]{grid-column:auto!important;right:calc(-1 * var(--iw-skill-v2-command-w))!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-role=action-title]::before{font-size:15px!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] .iw-skill-v2-body{margin:8px var(--iw-skill-v2-gutter)!important}}@media(prefers-reduced-motion:reduce){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] *{transition:none!important}}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout] [data-iw-skill-zone=identity] *:has([data-iw-skill-role=identity]){display:contents!important}@media(pointer:coarse){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]{--iw-skill-v2-nav-h: 26px}}@container iw-skill-card (max-width: 480px){html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-zone=identity]{grid-area:auto!important;grid-column:1!important;grid-row:2!important;min-height:calc(var(--iw-skill-v2-cmd-stack) + 20px)!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-zone=content]{grid-area:auto!important;grid-column:2!important;grid-row:2!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>[data-iw-skill-zone=commands],html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>:is(.iw-skill-v2-action-glyph,.iw-skill-v2-action-label){grid-area:auto!important;grid-column:3!important;grid-row:2!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>.iw-skill-v2-body{grid-area:auto!important;grid-column:1 / -1!important;grid-row:3!important}html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout]>.iw-skill-v2-controls{grid-area:auto!important;grid-column:1 / -1!important;grid-row:4!important}}\n';

  // src/styles/skillcard-v2-runtime-safe.css
  var skillcard_v2_runtime_safe_default = 'html[data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"] [data-iw-skill-v2-section]{display:revert!important;position:absolute!important;width:1px!important;min-width:0!important;max-width:1px!important;height:1px!important;min-height:0!important;max-height:1px!important;margin:0!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;opacity:0!important;pointer-events:none!important}\n';

  // src/styles/card-button-atlas.css
  var card_button_atlas_default = "html[data-iw-zone-theme=forged-metal]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 0.684931506849315% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 0.684931506849315% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 0.684931506849315% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 3.5947712418300655% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 3.5947712418300655% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 3.5947712418300655% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=infernal]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 11.83063511830635% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 11.83063511830635% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 11.83063511830635% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 13.529411764705882% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 13.529411764705882% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 13.529411764705882% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=glacial]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 23.038605230386054% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 23.038605230386054% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 23.038605230386054% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 23.464052287581698% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 23.464052287581698% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 23.464052287581698% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=celestial]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 34.24657534246575% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 34.24657534246575% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 34.24657534246575% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 33.333333333333336% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 33.333333333333336% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 33.333333333333336% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=lunar-spectral]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 45.45454545454545% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 45.45454545454545% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 45.45454545454545% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 43.39869281045752% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 43.39869281045752% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 43.39869281045752% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=runic-arcane]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=tempest-oceanic]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 67.93275217932752% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 67.93275217932752% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 67.93275217932752% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 63.98692810457516% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 63.98692810457516% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 63.98692810457516% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=verdant]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 79.14072229140723% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 74.640522875817% / 376.1904761904762% 1286.046511627907% no-repeat}html[data-iw-zone-theme=voidborn]{--iw-card-action-idle: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 17.92717086834734% 90.34869240348692% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-hover: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 50.14005602240896% 90.34869240348692% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-action-clicked: transparent url(../assets/skills-ui/buttons/card-v6/action-atlas.png) 82.49299719887955% 90.34869240348692% / 512.7167630057803% 1055.952380952381% no-repeat;--iw-card-nav-idle: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 8.333333333333334% 85.16339869281046% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-hover: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 50% 85.16339869281046% / 376.1904761904762% 1286.046511627907% no-repeat;--iw-card-nav-clicked: transparent url(../assets/skills-ui/buttons/card-v6/nav-atlas.png) 91.66666666666667% 85.16339869281046% / 376.1904761904762% 1286.046511627907% no-repeat}\n";

  // src/styles/card-buttons.css
  var card_buttons_default = 'html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]{--fs-motion-idle: var(--iw-card-action-idle) !important;--fs-motion-hover: var(--iw-card-action-hover) !important;--fs-motion-pressed: var(--iw-card-action-clicked) !important;--fs-button-background: var(--iw-card-action-idle) !important;--fs-button-border: var(--iw-skill-v2-btn-border) solid transparent !important;--fs-button-shadow: none !important;background-origin:padding-box!important;background-clip:padding-box!important;border-radius:2px!important;filter:none!important;transition:none!important;text-shadow:0 1px 2px #000,0 0 3px #000!important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]::before,html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]::after{inset:0!important;border-radius:2px!important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]>span[style*=width]{clip-path:inset(5px max(0px,calc(100% - var(--iw-skill-v2-btn-w) + 2 * var(--iw-skill-v2-btn-border) + 5px)) 5px 5px round 2px)!important;background:linear-gradient(90deg,color-mix(in srgb,var(--iw-th-accent) 48%,#090c16),color-mix(in srgb,var(--iw-th-accent) 68%,#090c16))!important;box-shadow:inset -2px 0 0 color-mix(in srgb,var(--iw-th-accent) 25%,#fff),inset 0 1px 0 #ffffff24!important;animation:none!important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=action-button]:is(:disabled,[aria-disabled=true],[data-iw-btn-state=disabled]){filter:grayscale(.9)!important;opacity:.6!important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]{--fs-button-background: var(--iw-card-nav-idle) !important;--fs-button-border: 1px solid transparent !important;--fs-button-shadow: none !important;background-origin:border-box!important;border-radius:0!important;clip-path:polygon(8% 0,92% 0,100% 14%,100% 86%,92% 100%,8% 100%,0 86%,0 14%);filter:none!important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:not(:disabled):not([aria-disabled=true]):not([data-iw-btn-state=disabled]):is(:hover,:focus-visible){--fs-button-background: var(--iw-card-nav-hover) !important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:not(:disabled):not([aria-disabled=true]):not([data-iw-btn-state=disabled]):active{--fs-button-background: var(--iw-card-nav-clicked) !important}html[data-iw-zone-theme][data-iw-skill-card-design=new] .compact-panel.fs-skill-panel[data-iw-skill-v2="1"][data-iw-skill-layout][data-iw-skills-ui-ready="1"] button[data-iw-skill-role=nav-button][data-iw-nav-direction]:focus-visible{outline:2px solid var(--iw-th-accent)!important;outline-offset:-3px!important}\n';

  // src/styles/overlay.css
  var overlay_default = 'dialog.iw-cache-dialog{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;color:#ede8d9;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}dialog.iw-cache-dialog::backdrop{background:rgba(2,5,9,.94);backdrop-filter:blur(7px);animation:iw-cache-darken 280ms ease-out both}@keyframes iw-cache-darken{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){dialog.iw-cache-dialog::backdrop{animation:none}}[data-iw-overlay=scrim]{background:rgba(7,7,11,0.72)!important;backdrop-filter:blur(3px)!important;-webkit-backdrop-filter:blur(3px)!important}[data-iw-overlay-host="1"]{z-index:20!important}[data-iw-overlay=popup]{z-index:21!important;color:var(--iw-text)!important;border:1px solid var(--iw-th-edge)!important;border-radius:var(--iw-r-panel, 3px)!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,0.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,soft-light,normal!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.82),inset 0 1px 0 var(--iw-th-glow),0 8px 24px rgba(0,0,0,0.72)!important}[data-iw-overlay-content=player-stats] [data-iw-overlay-role=stat-label]{font-weight:400!important}[data-iw-overlay-content=player-stats] [data-iw-overlay-role=stat-value]{font-weight:700!important}[data-iw-overlay=panel]{isolation:isolate!important;border:1px solid var(--iw-th-edge)!important;border-image:var(--iw-corner-filigree) 50% / 25px 23px / 0 stretch!important;border-radius:var(--iw-r-panel, 3px)!important;background:linear-gradient(var(--iw-th-ground-wash),var(--iw-th-ground-wash)),radial-gradient(circle at 18% 0%,rgba(255,255,255,0.025),transparent 32%),url(../assets/skills_panel_texture.webp),linear-gradient(180deg,var(--iw-th-ground-a) 0%,var(--iw-th-ground-b) 100%)!important;background-blend-mode:normal,normal,soft-light,normal!important;background-attachment:scroll!important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.78),inset 0 1px 0 var(--iw-th-glow),0 12px 40px rgba(0,0,0,0.55)!important}\n';

  // src/content.js
  var ENABLED_KEY = "iw-skin-enabled";
  var VERSION = "1.6.0";
  var booted = false;
  var consumersBound = false;
  function injectPresentationStyles() {
    inject("base", base_default);
    inject("tooltip-engine", tooltip_engine_default);
    inject("inventory", inventory_default);
    inject("skillpanel", skillpanel_default + "\n" + skillcard_v2_default + "\n" + skillcard_v2_runtime_safe_default + "\n" + card_button_atlas_default + "\n" + card_buttons_default);
    inject("header", header_default);
    inject("overlay", overlay_default);
    injectUIFoundationStyles();
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
    guard("init:skill-card-design", initSkillCardDesignController);
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
    guard("teardown:skill-card-design", clearSkillCardDesignController);
    guard("teardown:skill-panel", clearSkillPanels);
    guard("teardown:quest-panel", clearQuestPanels);
    guard("teardown:ui-foundation", clearUIFoundation);
    guard("teardown:header", clearHeaderRenderer);
    guard("teardown:background", clearBackgroundPaint);
    guard("teardown:overlay", clearOverlayFramer);
    guard("teardown:styles", removeAll);
    guard("teardown:hydration-latch", () => clearHydrationLatch());
    setRuntimeActive(false);
    console.log("[IW Fantasy Skin] disabled — active presentation removed");
  }
  function applyEnabled(enabled2) {
    if (enabled2 === false) teardown();
    else boot();
  }
  (async function start() {
    setRuntimeActive(false);
    const stored = await storageGet(ENABLED_KEY);
    const hydration = await waitForPageHydration();
    if (hydration.state !== "disabled") {
      console.log(`[IW Fantasy Skin] boot after page hydration: ${hydration.state} (${hydration.waitedMs}ms)`);
    }
    applyEnabled(stored === null ? true : stored !== false);
    onStorageChanged(ENABLED_KEY, (value) => applyEnabled(value !== false));
  })();
})();
