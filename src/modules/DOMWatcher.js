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
 *   iw:dom-flush          detail: { roots }
 *   iw:name-scan-flush    detail: { roots }
 *
 * A second, non-mutation source feeds the same flush pipeline: the game swaps
 * which of its two duplicated layout columns is live at Tailwind's `xl`
 * breakpoint (1280px) via pure CSS, which mutates NOTHING — no childList, no
 * attribute, no characterData event ever fires for a plain viewport resize.
 * Viewport.startLayoutWatch bumps a shared epoch on every breakpoint crossing
 * and is wired below to run through the exact same discover()/flush path a
 * mutation would, so every classifier's normal re-resolution machinery picks
 * it up for free instead of needing a second event type.
 */

import { guard, guardEach, raf } from './Runtime.js';
import { startLayoutWatch, stopLayoutWatch } from './Viewport.js';

const SEL_INV_ROW     = '.compact-row, [class*="item-row"]';
const SEL_SKILL_PANEL = '.compact-panel';

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
  gathering: ['gathering', 'herbalism', 'herb'],
  alchemy: ['alchemy'],
  jewelcrafting: ['jewel', 'jewelcrafting'],
  spellcrafting: ['spellcraft', 'spellcrafting'],
  tailoring: ['tailor', 'tailoring'],
  woodcutting: ['wood', 'woodcutting'],
  construction: ['build', 'construction'],
  crafting: ['crafting'],
  fishing: ['fishing'],
  locked: ['coming soon', 'upcoming skill'],
};

function skillIdentitySignals(panel) {
  const signals = new Set();
  for (const el of panel.querySelectorAll('h1,h2,h3,h4,[class*="skill-name"],div,span,p,strong')) {
    if (el.closest('button,a')) continue;
    const explicitHeading = /^H[1-4]$/.test(el.tagName) || /skill-name/i.test(String(el.className || ''));
    if (!explicitHeading && el.childElementCount) continue;
    const text = normaliseSkillSignal(el.textContent).replace(/^[^a-z0-9]+/i, '');
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

function lockedCopySignal(panel) {
  let hasLabel = false;
  let hasUnlock = false;
  for (const el of panel.querySelectorAll('div,span,p,strong')) {
    const text = normaliseSkillSignal(el.textContent);
    if (!text || text.length > 96) continue;
    if (text.includes('coming soon') || text.includes('upcoming skill')) hasLabel = true;
    if (text.includes('unlock in a future update')) hasUnlock = true;
  }
  return hasLabel && hasUnlock;
}

function skillSignature(panel) {
  const buttonEls = [...panel.querySelectorAll('button')];
  const buttons = buttonEls.map(btn => normaliseSkillSignal(btn.textContent));
  const identities = skillIdentitySignals(panel);
  const lockedCopy = lockedCopySignal(panel);

  // JSON preserves array boundaries and exact signal content without a
  // collision-prone delimiter/hash scheme. These strings are tiny compared
  // with the panel subtree scans detection would otherwise repeat.
  const sig = JSON.stringify([buttons, identities, lockedCopy]);
  // Detection on a cache miss needs the same button/identity/locked-copy scans
  // this signature just ran. Returning them alongside `sig` means a miss
  // never repeats the subtree walks a second time (Audit S5).
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
  // Positive identification only. .compact-panel is reused across quests,
  // bosses, village and other systems, so searching arbitrary panel body text
  // for words such as "craft" caused unrelated cards to inherit skill chrome.
  const { buttonEls, buttons, identities: labels, lockedCopy } = precomputed;
  const actionTexts = buttons.filter(Boolean);

  const hasAction = (...names) => actionTexts.some(text => names.includes(text));

  // Quest cards are also .compact-panel. They never expose a skill action verb;
  // they offer a reward line plus a Turn In / Skip control. A quest such as
  // "Tailoring Work Order" would otherwise trip the skill-identity fallback and
  // fight QuestPanelRenderer for the same node, so reject it up front. This is
  // an anchored probe of the reward line, not an arbitrary body-text search.
  const hasTurnInOrSkip = actionTexts.some(text => /^turn in$/.test(text) || /^skip(?:\s*\(\d+\))?$/.test(text));
  if (hasTurnInOrSkip &&
      [...panel.querySelectorAll('p,div,span')].some(el => /^reward\s*:/i.test(el.textContent.trim()))) {
    return 'unknown';
  }

  // Specific verbs are authoritative. GATHER/HARVEST are deferred because
  // Spellcraft currently reuses those verbs for mana harvesting.
  if (hasAction('fight'))                    return 'combat';
  if (hasAction('mine'))                     return 'mining';
  if (hasAction('prospect', 'cut'))          return 'jewelcrafting';
  if (hasAction('smelt', 'forge'))           return 'smithing';
  if (hasAction('brew'))                     return 'alchemy';
  if (hasAction('enchant'))                  return 'spellcrafting';
  if (hasAction('tailor', 'sew', 'weave'))   return 'tailoring';
  if (hasAction('fish'))                     return 'fishing';
  if (hasAction('chop'))                     return 'woodcutting';
  // Construction's control reads "Craft Parts", not a bare verb, so it is an
  // exact match here and cannot be reached by the generic CRAFT test below.
  if (hasAction('craft parts', 'build'))     return 'construction';

  // CRAFT is now reused by Spellcrafting and Tailoring recipes, so unlike the
  // discipline-specific verbs above it cannot identify the skill by itself.
  // Prefer the visible identity label before falling back to Crafting.
  const identityType = skillTypeFromIdentity(labels);
  const hasDisabledControl = buttonEls.some(btn =>
    btn.disabled || btn.getAttribute('aria-disabled') === 'true');
  if (hasDisabledControl && lockedCopy) return 'locked';
  if (identityType) return identityType;
  if (hasAction('craft'))                     return 'crafting';
  if (hasAction('gather', 'harvest'))        return 'gathering';

  // Fallback remains exact/anchored and never searches arbitrary body prose.
  if (labels.some(t => /^combat(?:\s|$)/.test(t))) return 'combat';
  if (labels.some(t => /^mining(?:\s|$)|^mine(?:\s|$)/.test(t))) return 'mining';
  if (labels.some(t => /^(?:jewel|jewelcrafting)(?:\s|$)|^prospect(?:\s|$)/.test(t))) return 'jewelcrafting';
  if (labels.some(t => /^smithing(?:\s|$)|^smelt(?:\s|$)/.test(t))) return 'smithing';
  if (labels.some(t => /^(?:gathering|herbalism|herb)(?:\s|$)|^gather(?:\s|$)/.test(t))) return 'gathering';
  if (labels.some(t => /^alchemy(?:\s|$)|^brew(?:\s|$)/.test(t))) return 'alchemy';
  if (labels.some(t => /^(?:spellcraft|spellcrafting)(?:\s|$)|^enchant(?:\s|$)/.test(t))) return 'spellcrafting';
  if (labels.some(t => /^(?:tailor|tailoring)(?:\s|$)|^(?:tailor|sew|weave)(?:\s|$)/.test(t))) return 'tailoring';
  if (labels.some(t => /^(?:wood|woodcutting)(?:\s|$)|^chop(?:\s|$)/.test(t))) return 'woodcutting';
  if (labels.some(t => /^(?:build|construction)(?:\s|$)/.test(t))) return 'construction';
  if (labels.some(t => /^crafting(?:\s|$)/.test(t))) return 'crafting';
  if (labels.some(t => /^fishing(?:\s|$)|^fish(?:\s|$)/.test(t))) return 'fishing';
  return 'unknown';
}

const pendingInventory = new Set();
const pendingSkills    = new Set();
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
    names = true,
    background = true,
  } = opts;

  if (inventory) addIfConnected(pendingInventory, nearest(el, SEL_INV_ROW));
  if (skill)     addIfConnected(pendingSkills,    nearest(el, SEL_SKILL_PANEL));
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

  const { inventory, skills, bgRoots, nameRoots } =
    drainGlobalBudget(FLUSH_BUDGET);

  // guardEach so one malformed row degrades to "that row stays native" instead
  // of silently cancelling the rest of this category's work. (Audit S3.7)
  guardEach('emit:inventory-row', inventory, row =>
    emit('iw:inventory-row', { row, reason: 'reconcile' }));

  guardEach('emit:skill-panel', skills, panel =>
    emit('iw:skill-panel', { panel, skill: detectSkillTypeCached(panel), reason: 'reconcile' }));

  // These two are guarded individually so a throwing dom-flush consumer cannot
  // prevent the name-scan consumers from running, and — critically — cannot
  // skip the re-schedule below, which would strand every element still queued
  // behind the budget. Found by test/smoke.mjs.
  if (bgRoots.length) guard('emit:dom-flush', () => emit('iw:dom-flush', { roots: bgRoots }));
  if (nameRoots.length) guard('emit:name-scan-flush', () => emit('iw:name-scan-flush', { roots: nameRoots }));

  // Anything left over after the budget gets the next frame.
  if (pendingInventory.size || pendingSkills.size
      || pendingBgRoots.size || pendingNameRoots.size) {
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
        if (isElement(m.target)) queueContext(m.target, 'children', {
          // A native text-only replacement can remove our decorative button
          // layers. Notify the existing global reconciliation path for these
          // controls even when no new element was mounted to discover below.
          background: !!nearest(m.target, '[data-iw-compact-button]'),
          names: false,
        });

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
            names: false,
          });
        } else if (m.attributeName === 'disabled' || m.attributeName === 'aria-disabled') {
          queueContext(m.target, `attr:${m.attributeName}`, {
            inventory: false,
            names: false,
            background: false,
          });
        } else {
          // A class change can make an existing node become (or cease being) a
          // row/panel, so structural consumers must reconsider THAT NODE.
          //
          // It used to also call discover(m.target), which runs structural
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
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-current', 'data-state'],
  });

  // Initial discovery happens only after all consumers have registered;
  // content.js intentionally starts this watcher last.
  discover(document.body, 'initial');

  // A breakpoint crossing re-runs discover() on the whole document. This is
  // deliberately heavier than a targeted queueContext() call: it is also how
  // InventoryRenderer/SkillPanelRenderer (whose own resolution strategies are
  // already viewport-correct by construction) get a fresh reconciliation pass
  // for free, and it only fires on an actual Tailwind breakpoint crossing —
  // not on every pixel of a drag-resize — so the cost is rare by design.
  // Guarded like every other consumer here (Audit S3.7): a `matchMedia`
  // change event is dispatched by the browser, not run through this module's
  // own try/catch machinery, so an exception here would otherwise propagate
  // out of our control.
  guard('start:layout-watch', () =>
    startLayoutWatch(() => guard('layout-change:discover', () => discover(document.body, 'layout-change'))));
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
  guard('stop:layout-watch', stopLayoutWatch);
  _started = false;
  flushQueued = false;
  pendingInventory.clear();
  pendingSkills.clear();
  pendingBgRoots.clear();
  pendingNameRoots.clear();
}

export function getScanRoots(root = document) {
  const target = root?.body || root;
  return isElement(target) ? [target] : [];
}

export function on(eventType, handler) {
  document.addEventListener(eventType, handler);
}

export function off(eventType, handler) {
  document.removeEventListener(eventType, handler);
}
