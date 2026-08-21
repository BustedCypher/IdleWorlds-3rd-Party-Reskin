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

import { guard, guardEach, raf } from './Runtime.js';

const SEL_INV_ROW     = '.compact-row, [class*="item-row"]';
const SEL_SKILL_PANEL = '.compact-panel';
const SEL_EQUIP_PANEL = '[class*="equipment"]';
const SEL_SHOP_PANEL  = '[class*="shop"]';

// Inventory rows are deliberately excluded: InventoryRenderer already
// provides item-name tooltips there, so annotating inventory text a second
// time buys us nothing.
//
// `[class*="tooltip"]` was removed in the S1.4 pass. The game's own tooltips
// are measured and positioned by the game; they are the single worst place to
// introduce any additional decoration, and they are transient enough that the
// annotation rarely survives to be useful.
const SEL_SCAN_ROOTS = [
  '.compact-panel',
  '[class*="equipment"]',
  '[class*="shop"]',
  '[class*="description"]',
].join(', ');

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

function skillSignature(panel) {
  const buttons = [...panel.querySelectorAll('button')]
    .map(btn => normaliseSkillSignal(btn.textContent));
  const headings = [...panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"]')]
    .map(el => normaliseSkillSignal(el.textContent));

  // JSON preserves array boundaries and exact signal content without a
  // collision-prone delimiter/hash scheme. These strings are tiny compared
  // with the panel subtree scans detection would otherwise repeat.
  return JSON.stringify([buttons, headings]);
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
  if (hasAction('fight'))                    return 'combat';
  if (hasAction('mine'))                    return 'mining';
  if (hasAction('prospect'))                return 'jewelcrafting';
  if (hasAction('smelt', 'forge'))           return 'smithing';
  if (hasAction('gather', 'harvest'))        return 'gathering';
  if (hasAction('brew'))                     return 'alchemy';
  if (hasAction('enchant'))                  return 'spellcrafting';
  if (hasAction('tailor', 'sew'))            return 'tailoring';
  if (hasAction('craft'))                    return 'crafting';
  if (hasAction('fish'))                     return 'fishing';

  // Fallback only to explicit skill labels/headings, never the whole body.
  const headings = [...panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"]')];
  const labels = headings.map(h => normaliseSkillSignal(h.textContent));
  if (labels.some(t => /^combat(?:\s|$)/.test(t))) return 'combat';
  if (labels.some(t => /^mining(?:\s|$)|^mine(?:\s|$)/.test(t))) return 'mining';
  if (labels.some(t => /^jewelcrafting(?:\s|$)|^prospect(?:\s|$)/.test(t))) return 'jewelcrafting';
  if (labels.some(t => /^smithing(?:\s|$)|^smelt(?:\s|$)/.test(t))) return 'smithing';
  if (labels.some(t => /^gathering(?:\s|$)|^gather(?:\s|$)/.test(t))) return 'gathering';
  if (labels.some(t => /^alchemy(?:\s|$)|^brew(?:\s|$)/.test(t))) return 'alchemy';
  if (labels.some(t => /^spellcrafting(?:\s|$)|^enchant(?:\s|$)/.test(t))) return 'spellcrafting';
  if (labels.some(t => /^tailoring(?:\s|$)|^tailor(?:\s|$)/.test(t))) return 'tailoring';
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
  if (names)     addIfConnected(pendingNameRoots, nearest(el, SEL_SCAN_ROOTS));
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

  if (root.matches?.(SEL_SCAN_ROOTS)) addIfConnected(pendingNameRoots, root);
  root.querySelectorAll?.(SEL_SCAN_ROOTS).forEach(el => addIfConnected(pendingNameRoots, el));

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
function drainConnected(set, budget) {
  const out = [];
  const keep = [];
  for (const el of set) {
    if (!el || !el.isConnected) continue;
    if (out.length < budget) out.push(el);
    else keep.push(el);
  }
  set.clear();
  for (const el of keep) set.add(el);
  return out;
}

function flushPending() {
  flushQueued = false;

  const inventory = drainConnected(pendingInventory, FLUSH_BUDGET);
  const skills    = drainConnected(pendingSkills,    FLUSH_BUDGET);
  const equipment = drainConnected(pendingEquipment, FLUSH_BUDGET);
  const shop      = drainConnected(pendingShop,      FLUSH_BUDGET);
  const bgRoots   = drainConnected(pendingBgRoots,   FLUSH_BUDGET);
  const nameRoots = drainConnected(pendingNameRoots, FLUSH_BUDGET);

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

export function startWatcher() {
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
        if (isElement(m.target)) queueContext(m.target, 'children', { background: false });

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
export function stopWatcher() {
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

export function getScanRoots(root = document) {
  return root.querySelectorAll ? root.querySelectorAll(SEL_SCAN_ROOTS) : [];
}

export function on(eventType, handler) {
  document.addEventListener(eventType, handler);
}

export function off(eventType, handler) {
  document.removeEventListener(eventType, handler);
}
