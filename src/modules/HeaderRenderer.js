/**
 * HeaderRenderer
 * Maps the live IdleWorlds header without reparenting React-owned controls.
 * Artwork is layered through extension-local CSS variables.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { assetUrl, guard, raf } from './Runtime.js';
import css from '../styles/header.css';

const ROLE = 'data-iw-header';
let queued = false;

const HEADER_ASSETS = {
  headerFrame: 'assets/header/header_frame.webp',
  headerSurface: 'assets/header/header_surface.webp',
  headerCrest: 'assets/header/header_crest.webp',
  headerDivider: 'assets/header/header_divider.webp',
  utilityFrame: 'assets/header/utility_frame.webp',
  statusFrame: 'assets/header/status_frame.webp',
  navRail: 'assets/header/nav_rail.webp',
  navActive: 'assets/header/nav_active.webp',
  navIdle: 'assets/header/nav_idle.webp',
  announcementFrame: 'assets/header/announcement_frame.webp',
  zoneFrame: 'assets/header/zone_frame.webp',
  zoneScene: 'assets/header/zone_scene.webp',
  zoneButtonActive: 'assets/header/zone_button_active.webp',
  zoneButtonIdle: 'assets/header/zone_button_idle.webp',  zoneButtonTeal: 'assets/header/zone_button_teal.webp',
};

const ASSET_VARS = [
  '--iw-header-frame', '--iw-header-surface', '--iw-header-crest',
  '--iw-header-divider', '--iw-utility-frame', '--iw-status-frame',
  '--iw-nav-rail', '--iw-nav-active', '--iw-nav-idle',
  '--iw-announcement-frame', '--iw-zone-frame', '--iw-zone-scene',
  '--iw-zone-button-active', '--iw-zone-button-idle', '--iw-zone-button-teal',
];

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();

function setRole(el, role) {
  if (el && el.getAttribute(ROLE) !== role) el.setAttribute(ROLE, role);
  return el;
}

function setAssetVar(el, name, key) {
  if (!el || !HEADER_ASSETS[key]) return;
  el.style.setProperty(name, `url("${assetUrl(HEADER_ASSETS[key])}")`);
}

function applyHeaderVars(root) {
  setAssetVar(root, '--iw-header-frame', 'headerFrame');
  setAssetVar(root, '--iw-header-frame-bar', 'headerFrameBar');
  setAssetVar(root, '--iw-header-surface', 'headerSurface');
  setAssetVar(root, '--iw-header-crest', 'headerCrest');
  setAssetVar(root, '--iw-header-divider', 'headerDivider');  setAssetVar(root, '--iw-utility-frame', 'utilityFrame');
  setAssetVar(root, '--iw-status-frame', 'statusFrame');
}

function applyNavVars(nav) {
  setAssetVar(nav, '--iw-nav-rail', 'navRail');
  setAssetVar(nav, '--iw-nav-active', 'navActive');
  setAssetVar(nav, '--iw-nav-idle', 'navIdle');
}

function applyAnnouncementVars(el) {
  setAssetVar(el, '--iw-announcement-frame', 'announcementFrame');
}

function applyZoneVars(el) {
  setAssetVar(el, '--iw-zone-frame', 'zoneFrame');
  setAssetVar(el, '--iw-zone-scene', 'zoneScene');
  setAssetVar(el, '--iw-zone-button-active', 'zoneButtonActive');
  setAssetVar(el, '--iw-zone-button-idle', 'zoneButtonIdle');
  setAssetVar(el, '--iw-zone-button-teal', 'zoneButtonTeal');
}

/**
 * The page ships a hidden xl:hidden duplicate of the whole panel/header
 * stack (see CLAUDE.md); a capture where the rect is {w:0,h:0} is that
 * invisible copy, not the real page. jsdom's test DOM never lays anything
 * out, so every rect there is zero too -- this must be a TIE-BREAK among
 * several matches, never a hard requirement, or every test fixture would
 * fail to resolve anything.
 */
function isVisible(el) {
  const rect = el.getBoundingClientRect?.();
  return !!rect && (rect.width > 0 || rect.height > 0);
}

function pickVisible(candidates) {
  return candidates.find(isVisible) || candidates[0] || null;
}

function findLiveHeader() {
  const candidates = [...document.querySelectorAll('header')].filter(header => {
    const text = norm(header.textContent);
    return /combat\s+lv\s*\d+/i.test(text) &&
      /players\s+online\s*:\s*\d+/i.test(text) &&
      /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(text);
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
  let crest = region.querySelector(':scope > .fs-header-crest');
  if (!crest) {
    crest = document.createElement('span');
    crest.className = 'fs-header-crest';
    crest.setAttribute('aria-hidden', 'true');
    region.prepend(crest);
  }
  return crest;
}

function classifyProfile(layout) {
  const name = layout.querySelector('h1.header-player-name, h1');
  const meta = [...layout.querySelectorAll('p,span,div')]
    .find(el => /combat\s+lv\s*\d+.*zone\s*\d+\s*:/i.test(norm(el.textContent)) && el.childElementCount <= 1);
  const online = [...layout.querySelectorAll('button,p,span,div')]
    .find(el => /^\s*players\s+online\s*:\s*\d+/i.test(norm(el.textContent)) && el.childElementCount <= 1);
  const profile = name
    ? name.closest('.min-w-0.overflow-hidden') || directChildContaining(layout, name)
    : null;
  if (!profile) return { profile: null, region: null };  setRole(profile, 'profile');
  if (name) setRole(name, 'profile-name');
  if (meta) setRole(meta, 'profile-meta');
  if (online) setRole(online, 'profile-online');

  const brand = [...profile.children].find(el => /^idleworlds$/i.test(norm(el.textContent)));
  if (brand) setRole(brand, 'brand');

  const children = [...profile.children];
  const nameIndex = name ? children.indexOf(name) : -1;
  const metaIndex = meta ? children.indexOf(meta) : -1;
  if (nameIndex >= 0 && metaIndex > nameIndex + 1) {
    for (let i = nameIndex + 1; i < metaIndex; i += 1) {
      if (norm(children[i].textContent)) {
        setRole(children[i], 'profile-title');
        break;
      }
    }
  }

  // Real header: the profile block sits inside its own identity wrapper,
  // itself a child of the layout row. Flat header (no wrapper): the profile
  // block hosts the crest directly and keeps its own 'profile' role.
  let region = profile.parentElement &&
    profile.parentElement !== layout &&
    layout.contains(profile.parentElement)
    ? profile.parentElement
    : directChildContaining(layout, profile);
  if (!region || region === layout) region = profile;
  if (region !== profile) setRole(region, 'identity-region');
  if (region) ensureCrest(region);
  return { profile, region };
}function classifyUtilities(layout, region) {
  let utilities = region?.querySelector(':scope > div:has(button.header-icon-btn)') ||
    layout.querySelector('div:has(> button.header-icon-btn)');
  if (!utilities) {
    // Flat header without the live `.header-icon-btn` class: match the utility
    // cluster by shape -- a container whose children are only small icon
    // buttons -- so a simplified DOM still resolves.
    utilities = [...layout.querySelectorAll('div')].find(div => {
      const buttons = [...div.children].filter(el => el.tagName === 'BUTTON');
      return buttons.length >= 3 && buttons.length === div.childElementCount &&
        buttons.every(btn => norm(btn.textContent).length <= 3);
    }) || null;
  }
  if (!utilities) return null;
  setRole(utilities, 'utilities');
  const iconButtons = [...utilities.querySelectorAll('button.header-icon-btn')];
  (iconButtons.length ? iconButtons : [...utilities.querySelectorAll(':scope > button')])
    .forEach(btn => setRole(btn, 'utility-button'));
  return utilities;
}

/**
 * Which KIND of stat a tile carries, read from its text rather than its index.
 *
 * The header splits into permanent vitals (gold, the ATK/DEF/HP line) and
 * expiring buffs, and the two are laid out differently. Position would be the
 * easy hook — the cards do arrive in a fixed order — but the game adds and
 * removes buff tiles as they expire, which silently reshuffles every index
 * after the one that vanished. Content is stable under that.
 */
function statKind(text) {
  if (/\batk\s*\d+\b.*\bdef\s*\d+\b.*\bhp\s*\d+\b/i.test(text)) return 'combat';
  // "17h 17m left", "1d 8h left", "(3/4) · 1d 19h left"
  if (/\b\d+\s*[dhm]\b[^]*\bleft\b/i.test(text)) return 'timer';
  // A bare amount, optionally behind a coin glyph.
  if (/^[^\w]*[\d,]+$/.test(text)) return 'gold';
  return 'other';
}

function classifyStatus(layout, region) {
  const statsAnchor = [...layout.querySelectorAll('button,div')]
    .find(el => /atk\s*\d+.*def\s*\d+.*hp\s*\d+/i.test(norm(el.textContent)) && el.childElementCount <= 1);
  let grid = statsAnchor?.closest('.grid.grid-cols-2') ||
    [...layout.children].find(el => el !== region && el.querySelector?.('.stat-chip')) || null;
  if (!grid && statsAnchor) {
    // Flat header: walk up from the ATK/DEF/HP chip to the nearest ancestor
    // (still inside the header) that groups several sibling stat cards.
    let cur = statsAnchor.parentElement;
    for (let depth = 0; cur && cur !== layout && cur !== region && depth < 4; depth += 1, cur = cur.parentElement) {
      const cards = [...cur.children].filter(el => el.matches?.('.stat-chip,button,div'));
      if (cards.length >= 3 && cards.includes(directChildContaining(cur, statsAnchor))) {
        grid = cur;
        break;
      }
    }
  }
  if (!grid) return null;
  setRole(grid, 'status-grid');
  [...grid.children].forEach((card, index) => {
    if (!card.matches('.stat-chip,button,div')) return;
    setRole(card, 'status-card');
    card.dataset.iwHeaderCard = String(index + 1);
    const kind = statKind(norm(card.textContent));
    if (card.dataset.iwHeaderStat !== kind) card.dataset.iwHeaderStat = kind;
  });
  return grid;
}

// Nothing under the header resolves differently tick to tick -- the header
// subtree's ROLES are stable once assigned; only the native text/values
// inside them tick, which React repaints on its own. Cache the resolution
// and skip the whole-document `<header>` scan + profile/utilities/status
// sub-scans once it validates.
let headerResolution = null;

function headerResolutionValid(entry) {
  return entry.root.isConnected && entry.root.getAttribute(ROLE) === 'root' &&
    entry.layout.isConnected &&
    (entry.layout === entry.root || entry.layout.getAttribute(ROLE) === 'layout') &&
    (!entry.region || entry.region.isConnected) &&
    (!entry.utilities || entry.utilities.isConnected) &&
    (!entry.grid || entry.grid.isConnected);
}

function classifyHeader() {
  if (headerResolution && headerResolutionValid(headerResolution)) return;

  const root = findLiveHeader();
  if (!root) { headerResolution = null; return; }
  setRole(root, 'root');
  applyHeaderVars(root);
  if (!root.firstElementChild) { headerResolution = null; return; }
  // Real header wraps its regions in a single layout row; a flat header
  // exposes profile/utilities/status as direct children -- then the header
  // element itself plays the layout container role.
  const layout = root.childElementCount === 1 ? root.firstElementChild : root;
  if (layout !== root) setRole(layout, 'layout');

  const { region } = classifyProfile(layout);
  const utilities = classifyUtilities(layout, region);
  const grid = classifyStatus(layout, region);
  headerResolution = { root, layout, region, utilities, grid };
}

function findAnnouncement(nav) {
  if (!nav) return null;
  // Real DOM wraps <nav> in a `.panel` and the announcement is that panel's
  // next sibling. A flat DOM has no wrapper, so also try the nav element
  // itself and, last, its immediate parent.
  const shells = [nav.closest('.panel'), nav, nav.parentElement].filter(Boolean);
  for (const shell of shells) {
    let candidate = shell.nextElementSibling;
    while (candidate && candidate.matches('script,style')) candidate = candidate.nextElementSibling;
    if (!candidate) continue;
    const text = norm(candidate.textContent);
    if (!text || text.length > 260 || /zone\s*\d+\s*:/i.test(text)) continue;
    return candidate;
  }
  return null;
}

function classifyAdjacent() {
  // UIFoundation's classifyMainNav/classifyZoneBar can tag both a visible
  // element and its hidden xl:hidden duplicate with the same role (they
  // don't filter by visibility themselves). Prefer the visible one here, at
  // the point that actually binds header artwork to it, rather than
  // trusting whichever one document order happens to put first.
  const nav = pickVisible([...document.querySelectorAll('[data-iw-ui="main-nav"]')]);
  if (nav) applyNavVars(nav);

  const announcement = findAnnouncement(nav);
  if (announcement) {
    setRole(announcement, 'announcement');
    applyAnnouncementVars(announcement);
  }

  const zone = pickVisible([...document.querySelectorAll('[data-iw-ui="zone-bar"]')]);
  if (zone) {
    setRole(zone, 'zone-shell');
    applyZoneVars(zone);
  }
}

function reconcile() {
  guard('header:root', classifyHeader);
  guard('header:adjacent', classifyAdjacent);
}

function queueReconcile() {
  if (queued) return;
  queued = true;
  raf(() => {
    queued = false;
    reconcile();
  });
}

export function clearHeaderRenderer() {
  headerResolution = null;
  document.querySelectorAll(`[${ROLE}]`).forEach(el => {
    el.removeAttribute(ROLE);
    delete el.dataset.iwHeaderCard;
    delete el.dataset.iwHeaderStat;
  });
  document.querySelectorAll('.fs-header-crest').forEach(el => el.remove());
  document.querySelectorAll('*').forEach(el => {
    ASSET_VARS.forEach(name => el.style?.removeProperty(name));
  });
}

export function initHeaderRenderer() {  inject('header', css);
  on('iw:dom-flush', queueReconcile);
  queueReconcile();
}
