/**
 * HeaderRenderer
 * Maps the live IdleWorlds header without reparenting React-owned controls.
 * Artwork is layered through extension-local CSS variables.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { assetUrl, guard, raf } from './Runtime.js';
import { zoneTheme } from './zoneThemes.js';
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
  '--iw-header-frame', '--iw-header-surface', '--iw-header-surface-mobile', '--iw-header-crest',
  '--iw-header-divider', '--iw-utility-frame', '--iw-status-frame',
  '--iw-nav-rail', '--iw-nav-active', '--iw-nav-idle',
  '--iw-announcement-frame', '--iw-zone-frame', '--iw-zone-scene',
  '--iw-zone-button-active', '--iw-zone-button-idle', '--iw-zone-button-teal',
  // Per-zone frame theme, set on <html> by applyZoneTheme(). The teardown loop
  // below walks '*', which includes <html>, so listing them here clears them.
  '--iw-zone-atlas', '--iw-corner-filigree',
];

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();

// Per-zone header background. `applyZoneSurface()` points `--iw-header-surface`
// at the wide strip `assets/header/zones/zone_<N>.webp` and
// `--iw-header-surface-mobile` at the portrait crop `zone_<N>_mobile.webp` for
// the zone the player is currently in; both fall back to `header_surface.webp`
// for a zone with no dedicated file (or when the zone can't be read yet).
// `header.css` paints the wide one normally and swaps to the mobile one inside
// its `@media (max-width: 768px)` block. zone_1..34(_mobile) are the real
// paintings imported by `npm run import:zone-headers[:mobile]`; `npm run
// art:zones` only fills gaps in the desktop set with a procedural placeholder.
// Bump MAX when art past 34 lands.
const ZONE_SURFACE_DIR = 'assets/header/zones';
const ZONE_SURFACE_MAX = 34;

// The last zone actually read off the page. The "Zone N:" label lives in the
// zone bar, which is GAME-ROUTE ONLY: open Market, Village, Leaderboards or
// Dungeon and it unmounts, currentZoneNumber() went null, and both consumers
// fell back to stock -- the header dropped its per-zone artwork for the generic
// strip and applyZoneTheme() reset <html> to "default", so every page except
// Game rendered un-themed. The player's zone is game state that does not change
// because they opened a tab, so the last reading is still the right answer.
// Cleared by clearHeaderRenderer() so the kill switch leaves nothing behind.
let lastZoneNumber = null;

function currentZoneNumber() {
  // UIFoundation tags the "🧭 Zone 19: <name>" label data-iw-ui="zone-title";
  // fall back to a text scan in case that classifier has not run this flush.
  let el = document.querySelector('[data-iw-ui="zone-title"]');
  if (!el) {
    el = [...document.querySelectorAll('div,span,p,strong')].find(n =>
      /^zone\s*\d+\s*:/i.test(norm(n.textContent).replace(/^[^a-z0-9]+/i, '')));
  }
  const m = el && norm(el.textContent).replace(/^[^a-z0-9]+/i, '').match(/^zone\s*(\d+)/i);
  if (m) lastZoneNumber = Number(m[1]);
  return lastZoneNumber;
}

function zoneSurfaceUrl(zone, variant = '') {
  const key = Number.isInteger(zone) && zone >= 1 && zone <= ZONE_SURFACE_MAX
    ? `${ZONE_SURFACE_DIR}/zone_${zone}${variant}.webp`
    : HEADER_ASSETS.headerSurface;
  return `url("${assetUrl(key)}")`;
}

function applyZoneSurface(root) {
  if (!root) return;
  const zone = currentZoneNumber();
  const key = zone == null ? 'fallback' : String(zone);
  // Only touch the inline style when the zone actually changed — otherwise
  // every dom-flush would rewrite it and feed the MutationObserver. The
  // desktop/mobile choice between the two vars is left to `header.css` media
  // queries, so a viewport change needs no JS here.
  if (root.dataset.iwZone === key && root.style.getPropertyValue('--iw-header-surface')) return;
  root.dataset.iwZone = key;
  root.style.setProperty('--iw-header-surface', zoneSurfaceUrl(zone));
  root.style.setProperty('--iw-header-surface-mobile', zoneSurfaceUrl(zone, '_mobile'));
}

// Per-zone frame chrome. `zone-theme-map.json` groups the 34 zones into nine
// environment palettes (glacial, infernal, verdant, …); each has a recoloured
// copy of the skills UI atlas + its own corner filigree sheet, geometry
// identical to the base art. This points two page-level CSS variables at the
// current zone's set:
//   --iw-zone-atlas      → SkillsArtService's --fs-skills-ui-atlas + inventory.css
//   --iw-corner-filigree → the shared border-image in ui-system/header/tooltip
// base.css defines both as the un-themed defaults, so an unresolved zone (or a
// zone with no theme) simply falls back there. The attribute + inline vars live
// on <html>, which is OUTSIDE document.body and therefore not watched by the
// single MutationObserver — writing here can never feed a flush.
const THEME_ASSET_DIR = 'assets/skills-ui';

function applyZoneTheme() {
  const html = document.documentElement;
  if (!html) return;
  const theme = zoneTheme(currentZoneNumber());
  const key = theme || 'default';
  if (html.dataset.iwZoneTheme === key) return;
  html.dataset.iwZoneTheme = key;
  if (theme) {
    html.style.setProperty('--iw-zone-atlas', `url("${assetUrl(`${THEME_ASSET_DIR}/theme_${theme}.webp`)}")`);
    html.style.setProperty('--iw-corner-filigree', `url("${assetUrl(`${THEME_ASSET_DIR}/panel_corners_${theme}.webp`)}")`);
  } else {
    html.style.removeProperty('--iw-zone-atlas');
    html.style.removeProperty('--iw-corner-filigree');
  }
}

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
  // `--iw-header-surface` is set per-zone by applyZoneSurface(), not here.
  // The zone bar keeps the static header_surface art (see applyZoneVars).
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
  setAssetVar(el, '--iw-zone-scene', 'headerSurface'); // swapped — see applyHeaderVars
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
  // Server-wide boost: "⚡ <player> boosted (5/5) · 8d 11h left". Also carries a
  // countdown, so it must be tested before `timer`. This tile gets the wide
  // left plaque (see header.css §5a) where the player name + charge + timer fit
  // on their own lines instead of truncating in a buff row.
  if (/\bboosted\b/i.test(text)) return 'boost';
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
  tagStatusCards(grid);
  return grid;
}

// Tag each status card with its role, 1-based index, and content-derived KIND.
// The kind is NOT frozen resolution: the game reuses the same card nodes and
// only swaps their text as buffs start and expire (a timer tile can become the
// server-boost tile, an "other" can become a timer), so this must re-run every
// flush against the current text — otherwise `data-iw-header-stat` sticks at
// whatever it was when the header first classified and the vitals/boost layout
// in header.css keys off a stale value.
function tagStatusCards(grid) {
  [...grid.children].forEach((card, index) => {
    if (!card.matches('.stat-chip,button,div')) return;
    setRole(card, 'status-card');
    const cardIndex = String(index + 1);
    if (card.dataset.iwHeaderCard !== cardIndex) card.dataset.iwHeaderCard = cardIndex;
    const kind = statKind(norm(card.textContent));
    if (card.dataset.iwHeaderStat !== kind) card.dataset.iwHeaderStat = kind;
  });
}

// The header subtree's ROLES are stable once assigned, so cache the resolution
// and skip the whole-document `<header>` scan + profile/utilities sub-scans
// once it validates. The one thing under the header that DOES change tick to
// tick is a status card's content-derived KIND (buffs start and expire in the
// same reused nodes), so `classifyHeader` still refreshes those every flush
// via `tagStatusCards` even on the cached path.
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
  if (headerResolution && headerResolutionValid(headerResolution)) {
    // Cached path: roles stay, but a card's KIND tracks its live text.
    if (headerResolution.grid) tagStatusCards(headerResolution.grid);
    return;
  }

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
  guard('header:zone-surface', () => applyZoneSurface(headerResolution?.root));
  guard('header:zone-theme', applyZoneTheme);
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
  lastZoneNumber = null;
  delete document.documentElement.dataset.iwZoneTheme;
  document.querySelectorAll(`[${ROLE}]`).forEach(el => {
    el.removeAttribute(ROLE);
    delete el.dataset.iwHeaderCard;
    delete el.dataset.iwHeaderStat;
    delete el.dataset.iwZone;
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
