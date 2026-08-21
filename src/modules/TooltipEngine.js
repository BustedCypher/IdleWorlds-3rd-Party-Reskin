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

import { ItemDatabase } from './ItemDatabase.js';
import { AtlasService } from './AtlasService.js';
import { tierClass, statRows } from './itemDisplay.js';
import { inject } from './StyleInjector.js';
import css from '../styles/tooltip-engine.css';

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

export function initTooltipEngine() {
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
export function showForItem(item, rectProvider, source = 'virtual') {
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
export function hideTooltip(source) {
  if (source && STATE.anchor && (!isVirtual(STATE.anchor) || STATE.anchor.source !== source)) return;
  hide();
}

export function isTooltipOpen() {
  return isOpen();
}

// ── Markup helpers ───────────────────────────────────────────────────────

/**
 * itemRef(nameOrItem, label) — build trigger markup for a known item.
 * Prefers item_id when given a record (stable across renames).
 */
export function itemRef(nameOrItem, label, opts = {}) {
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
export function itemRefIfKnown(name, opts) {
  const clean = String(name == null ? '' : name).trim();
  if (!clean) return '';
  const hit = ItemDatabase.getByName(clean);
  return hit ? itemRef(hit, clean, opts) : esc(clean);
}
