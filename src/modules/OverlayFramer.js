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
 * It owns the `data-iw-overlay` namespace so it can never fight another writer
 * over `data-iw-ui` (the "two writers, one attribute" trap): `scrim` on the
 * backdrop and `panel` on the card. overlay.css draws the shared forged frame
 * on the card and normalises the scrim.
 *
 * One narrowly identified content surface is annotated too: Character Stats'
 * repeated Lifetime Stats label/value rows receive `data-iw-overlay-content`
 * and `data-iw-overlay-role` hooks so typography can be normalised without
 * matching individual copy such as "Wood Chopped". No game text, classes,
 * handlers or state attributes are changed.
 *
 * Reversible: clearOverlayFramer() drops every attribute this module owns. No
 * elements are added, reparented or given inline styles.
 */

import { warnOnce } from './Runtime.js';

const SCRIM = 'scrim';
const PANEL = 'panel';
const PLAYER_STATS = 'player-stats';
const STAT_LABEL = 'stat-label';
const STAT_VALUE = 'stat-value';

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

const normText = value => String(value || '').replace(/\s+/g, ' ').trim();

function setData(el, key, value) {
  if (el?.dataset && el.dataset[key] !== value) el.dataset[key] = value;
}

function clearPlayerStatsSurface(surface) {
  if (!surface) return;
  if (surface.dataset?.iwOverlayContent === PLAYER_STATS) delete surface.dataset.iwOverlayContent;
  surface.querySelectorAll?.('[data-iw-overlay-role]').forEach(el => {
    if ([STAT_LABEL, STAT_VALUE].includes(el.dataset.iwOverlayRole)) delete el.dataset.iwOverlayRole;
  });
}

function findPlayerStatsSurface(card) {
  if (!card) return null;
  for (const surface of card.querySelectorAll('.compact-panel')) {
    const children = [...surface.children];
    const heading = children.find(el => normText(el.textContent).toLowerCase() === 'lifetime stats');
    if (!heading) continue;
    const rows = children.filter(row => {
      const cells = [...row.children];
      if (cells.length !== 2) return false;
      const label = normText(cells[0].textContent);
      const value = normText(cells[1].textContent);
      return !!label && /^-?[\d,.]+$/.test(value);
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

  setData(match.surface, 'iwOverlayContent', PLAYER_STATS);
  const keep = new Set();
  for (const row of match.rows) {
    const [label, value] = row.children;
    setData(label, 'iwOverlayRole', STAT_LABEL);
    setData(value, 'iwOverlayRole', STAT_VALUE);
    keep.add(label); keep.add(value);
  }
  match.surface.querySelectorAll('[data-iw-overlay-role]').forEach(el => {
    if (!keep.has(el) && [STAT_LABEL, STAT_VALUE].includes(el.dataset.iwOverlayRole)) delete el.dataset.iwOverlayRole;
  });
}

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
    classifyOverlayContent(card);
  }
}

function untag(el) {
  if (el.dataset && el.dataset.iwOverlay) delete el.dataset.iwOverlay;
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
      if (!el.isConnected) { tagged.delete(el); continue; }
      if (el.dataset.iwOverlay === SCRIM && !isScrim(el)) {
        untag(el);
        tagged.delete(el);
        continue;
      }
      if (el.dataset.iwOverlay === PANEL) classifyOverlayContent(el);
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
  document.querySelectorAll('[data-iw-overlay-content="player-stats"]').forEach(clearPlayerStatsSurface);
  document.querySelectorAll('[data-iw-overlay-role]').forEach(el => {
    if ([STAT_LABEL, STAT_VALUE].includes(el.dataset.iwOverlayRole)) delete el.dataset.iwOverlayRole;
  });
  tagged = new Set();
}
