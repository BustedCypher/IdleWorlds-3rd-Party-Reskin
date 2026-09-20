/**
 * OverlayFramer
 *
 * Generic pass for the game's floating pop-ups — the "Players Online" list, and
 * every other modal the per-surface classifiers do not name. The rest of the
 * skin frames a panel by matching its heading text against a fixed set
 * (UIFoundation.SECTION_FRAME_NAMES); anything outside that set — and every
 * dialog the game portals in — reaches the page bare. This module reframes them
 * from *structure* instead of copy.
 *
 * Detection (rendered state only, never a class name — see the hidden-duplicate
 * trap in CLAUDE.md): a scrim is a `position: fixed` element that covers the
 * viewport, carries a real numeric z-index, and reads as an overlay (a blurred
 * backdrop or a translucent dark fill). Its content card is the largest visible
 * box inside it, preferring the game's own `.panel` primitive.
 *
 * It writes two attributes in their own `data-iw-overlay` namespace so it can
 * never fight another writer over `data-iw-ui` (the "two writers, one attribute"
 * trap): `scrim` on the backdrop, `panel` on the card. overlay.css draws the
 * shared forged frame on the card and normalises the scrim. Presentation only —
 * nothing inside the card is touched, so state colour, team colour and button
 * affordances are left exactly as the game painted them (rule 5).
 *
 * Reversible: clearOverlayFramer() drops both attributes. No elements added, no
 * reparenting, no inline styles.
 */

import { warnOnce } from './Runtime.js';

const SCRIM = 'scrim';
const PANEL = 'panel';
const POPUP = 'popup';
const OVERLAY_HOST_ATTR = 'data-iw-overlay-host';

const FRAMED_SURFACE = [
  '[data-iw-inventory-root="1"]',
  '[data-iw-ui="section-frame"]',
  '.fs-skills-section-frame[data-iw-skills-ui-ready="1"]',
  '.compact-panel',
  '[data-iw-overlay="panel"]',
].join(',');

// Elements the skin already owns or that another classifier frames — never a
// generic overlay, and framing one would double-draw or fight a writer.
const SKIN_OWNED = [
  '.iw-tip', '#iw-tip',
  '[data-iw-inventory-root]',
  '[data-iw-ui]',
  '[data-iw-boss]',
  '[data-iw-quest-role]',
  '[data-iw-skill-role]',
  '[data-iw-header]',
].join(',');

// A card that is ALREADY a framed surface (section frame, inventory, a skill /
// compact panel). Tag the scrim, but leave the card's frame to its owner.
const ALREADY_FRAMED = [
  '[data-iw-ui="section-frame"]',
  '[data-iw-inventory-root="1"]',
  '.fs-skills-section-frame',
  '.compact-panel',
].join(',');

let tagged = new Set();
let popupHosts = new Map();

function visible(el) {
  if (!el || el.nodeType !== 1) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

function area(el) {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}

/** Does this element read as a full-viewport overlay backdrop right now? */
function isScrim(el) {
  const cs = getComputedStyle(el);
  if (cs.position !== 'fixed') return false;

  const z = parseInt(cs.zIndex, 10);
  if (!Number.isFinite(z) || z < 20) return false;

  const r = el.getBoundingClientRect();
  const coversW = r.width >= innerWidth * 0.85 && r.left <= innerWidth * 0.15;
  const coversH = r.height >= innerHeight * 0.85 && r.top <= innerHeight * 0.15;
  if (!coversW || !coversH) return false;

  if (!visible(el)) return false;
  if (!el.querySelector('*')) return false;

  // Must actually read as an overlay: a blur backdrop, or a translucent-to-solid
  // dark fill. A transparent full-screen positioning layer (some libraries ship
  // one) is not a scrim and gets no chrome.
  const bf = `${cs.backdropFilter || ''} ${cs.webkitBackdropFilter || ''}`;
  if (/blur/.test(bf)) return true;

  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
  if (!m) return false;
  const [rr, gg, bb, aa = '1'] = m[1].split(',').map(s => parseFloat(s));
  const alpha = Number.isFinite(aa) ? aa : 1;
  const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
  return alpha >= 0.15 && lum < 90;
}

/** The content card inside a scrim: prefer the game's `.panel`, else the
 *  largest visible child that is not itself another full-viewport layer. */
function pickCard(scrim) {
  const panels = [...scrim.querySelectorAll('.panel')].filter(visible);
  if (panels.length) {
    // Outermost .panel (the one no other candidate contains).
    return panels.find(p => !panels.some(q => q !== p && p.contains(q))) || panels[0];
  }

  let pool = [...scrim.children].filter(visible);
  for (let depth = 0; depth < 3 && pool.length; depth += 1) {
    pool.sort((a, b) => area(b) - area(a));
    const top = pool[0];
    const r = top.getBoundingClientRect();
    const stillFullscreen =
      r.width >= innerWidth * 0.97 && r.height >= innerHeight * 0.97;
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

function directChildUnder(frame, el) {
  if (!frame || !el || frame === el) return null;
  let node = el;
  while (node?.parentElement && node.parentElement !== frame) node = node.parentElement;
  return node?.parentElement === frame ? node : null;
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

function tagPopup(popup, frame) {
  const host = directChildUnder(frame, popup);
  if (!host) return false;
  const previous = popupHosts.get(popup);
  if (previous && previous !== host) {
    popupHosts.delete(popup);
    releaseHost(previous, popup);
  }
  if (popup.dataset.iwOverlay !== POPUP) popup.dataset.iwOverlay = POPUP;
  host.setAttribute(OVERLAY_HOST_ATTR, '1');
  popupHosts.set(popup, host);
  tagged.add(popup);
  return true;
}

function matchingExpandedController(popup) {
  if (!popup?.id) return null;
  for (const control of document.querySelectorAll('[aria-controls]')) {
    if (control.getAttribute('aria-controls') !== popup.id) continue;
    if (control.getAttribute('aria-expanded') === 'true') return control;
  }
  return null;
}

function capturedInventoryFilterPopup(popup, frame) {
  if (!frame?.matches?.('[data-iw-inventory-root="1"]')) return false;
  const parent = popup.parentElement;
  if (!parent) return false;
  const trigger = [...parent.children].find(el => {
    if (el === popup || !el.matches?.('button, [role="button"]')) return false;
    const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
    return /filter inventory/i.test(label);
  });
  if (!trigger) return false;
  return popup.parentElement === trigger.parentElement
    && popup.querySelectorAll('button, [role="button"], input, [role="option"], [role="menuitem"]').length >= 2;
}

function popupSemantics(popup, frame) {
  const role = String(popup.getAttribute('role') || '').toLowerCase();
  if (['menu', 'listbox', 'dialog'].includes(role)) return true;
  if (matchingExpandedController(popup)) return true;
  return capturedInventoryFilterPopup(popup, frame);
}

function classifyContainedPopup(popup) {
  if (!popup || !visible(popup)) return null;
  if (popup.matches?.('.iw-tip, #iw-tip') || popup.closest?.('.iw-tip, #iw-tip')) return null;
  if (popup.matches?.(ALREADY_FRAMED)) return null;
  const cs = getComputedStyle(popup);
  if (!['absolute', 'fixed'].includes(cs.position)) return null;
  if (!popup.querySelector('button, a, input, select, [role="button"], [role="option"], [role="menuitem"]')) return null;
  const frame = popup.closest?.(FRAMED_SURFACE);
  if (!frame || frame === popup) return null;
  return popupSemantics(popup, frame) ? frame : null;
}

function popupCandidates() {
  const out = new Set(document.querySelectorAll(
    '[role="menu"],[role="listbox"],[role="dialog"],[aria-modal="true"]'
  ));

  for (const control of document.querySelectorAll('[aria-controls][aria-expanded="true"]')) {
    const id = control.getAttribute('aria-controls');
    if (id) {
      const target = document.getElementById(id);
      if (target) out.add(target);
    }
  }

  /* Current deployed IdleWorlds inventory (v0.2.0+2026-09-20.703):
     button[aria-label="Filter inventory"] and its open absolute menu are
     direct siblings inside div.relative. The game publishes no role,
     aria-expanded or aria-controls on this popup, so structural capture is the
     only semantic signal available without class-name classification. */
  for (const trigger of document.querySelectorAll(
    '[data-iw-inventory-root="1"] button[aria-label="Filter inventory"],' +
    '[data-iw-inventory-root="1"] button[title="Filter inventory"]'
  )) {
    const parent = trigger.parentElement;
    if (!parent) continue;
    for (const sibling of parent.children) if (sibling !== trigger) out.add(sibling);
  }
  return out;
}

/**
 * Reconcile overlay framing. Called on every `iw:dom-flush`.
 *
 * Cheap by construction: the candidate prefilter is one attribute-substring
 * query (`fixed` is a Tailwind class on every observed overlay; inline
 * `position:fixed` is also caught) and the confirming `getComputedStyle` runs
 * only on that short list. Previously tagged scrims are revalidated the same
 * way and dropped when they close or stop reading as an overlay.
 */
export function frameOverlays() {
  try {
    // Revalidate what we tagged last pass.
    for (const el of [...tagged]) {
      if (!el.isConnected) {
        if (el.dataset?.iwOverlay === POPUP) clearPopupTag(el);
        else tagged.delete(el);
        continue;
      }
      if (el.dataset.iwOverlay === SCRIM && !isScrim(el)) {
        untag(el);
        tagged.delete(el);
        continue;
      }
      if (el.dataset.iwOverlay === POPUP) {
        const frame = classifyContainedPopup(el);
        if (!frame) clearPopupTag(el);
        else tagPopup(el, frame);
      }
    }

    // Contained popups are a different ownership problem from viewport scrims:
    // they remain inside their framed surface, so lifting the frame's direct
    // child is what lets their local z-index outrank later siblings.
    for (const popup of popupCandidates()) {
      if (popup.dataset?.iwOverlay === POPUP) continue;
      const frame = classifyContainedPopup(popup);
      if (frame) tagPopup(popup, frame);
    }

    // NOTE (perf): this candidate sweep is three attribute-SUBSTRING selectors,
    // none of which Chrome can index, so each walks every element in the
    // document — measured at 48ms of a 225ms profile at 13k nodes. Gating it on
    // a DOMWatcher "something structural changed" epoch was tried and REVERTED:
    // it bought only ~4% (an idle game streams chat/log rows, so the epoch moves
    // on most flushes anyway) in exchange for making this module silently
    // dependent on the observer having seen the change that opened the overlay.
    // A missed overlay is an unframed modal. If this ever needs to be cheaper,
    // make the SELECTOR cheaper rather than skipping the sweep — but note that
    // narrowing to indexed class tokens (`.fixed`, `.md\:fixed`, …) trades the
    // substring's coverage for speed, which is the class-name classification
    // CLAUDE.md warns about.
    const seen = new Set();
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
    warnOnce('overlay:frame', err);
  }
}

/** Drop every attribute this module writes. Kill switch. */
export function clearOverlayFramer() {
  document.querySelectorAll('[data-iw-overlay]').forEach(untag);
  document.querySelectorAll(`[${OVERLAY_HOST_ATTR}]`).forEach(el => el.removeAttribute(OVERLAY_HOST_ATTR));
  tagged = new Set();
  popupHosts = new Map();
}
