/**
 * HeaderChrome — merges the nav rail, the announcement strip and the zone bar
 * into ONE framed box (Curtis, 2026-09, from concept art). All three are
 * separate DOM siblings React owns (see UIFoundation.js / HeaderRenderer.js
 * for how each is classified) and rule 2 forbids reparenting any of them, so
 * the merge is done entirely by turning their shared PARENT into a grid and
 * making the zone bar `display: contents` — nothing moves in the DOM, only
 * `grid-row`/`grid-column` placement in ui-system.css changes what looks
 * adjacent to what.
 *
 * This module owns its OWN namespace, `data-iw-chrome` — never `data-iw-ui`
 * or `data-iw-header`, which UIFoundation and HeaderRenderer already write on
 * these same nodes (the two-writers-on-one-node trap, CLAUDE.md).
 *
 * Runs AFTER classifyMainNav/classifyZoneBar in UIFoundation's queueClassify,
 * so `[data-iw-ui="nav-tab"]`, `="zone-bar"`, `="zone-title"` and
 * `="zone-action"` already exist for this pass to read.
 */

import { pickRendered } from './Viewport.js';

const ROLE = 'data-iw-chrome';
const MAX_NOTICE_CHARS = 260; // matches HeaderRenderer.findAnnouncement

let resolution = null; // { shell, nav, notice, zone, zoneText, zoneActions } | null

function setRole(el, role) {
  if (el.getAttribute(ROLE) !== role) el.setAttribute(ROLE, role);
}

function clearMarks() {
  document.querySelectorAll(`[${ROLE}]`).forEach(el => { el.removeAttribute(ROLE); });
}

function norm(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/** The shell must be the page's own top-level column, not a nested one — the
 * same `:scope > header` test PanelOrder already uses to avoid claiming a
 * panel column that merely happens to hold a `<header>` somewhere inside it. */
function looksLikeShell(el) {
  return !!el && el.querySelector(':scope > header');
}

function resolutionValid() {
  if (!resolution) return false;
  const { shell, nav, notice, zone, zoneText, zoneActions } = resolution;
  if (!shell?.isConnected || !nav?.isConnected || !zone?.isConnected) return false;
  if (!zoneText?.isConnected || !zoneActions?.isConnected) return false;
  if (notice && !notice.isConnected) return false;
  if (nav.getAttribute(ROLE) !== 'nav') return false;
  if (zone.getAttribute(ROLE) !== 'zone-bar') return false;
  return true;
}

/** Element children, in DOM order. The header chrome is not mirrored in the
 * hidden `xl:hidden` column (only the panel columns are), so there is no
 * hidden copy to filter out here; the zone bar itself is picked with
 * `pickRendered` above. */
function elementChildren(el) {
  return [...el.children];
}

function resolve() {
  const zoneCandidates = [...document.querySelectorAll('[data-iw-ui="zone-bar"]')];
  const zone = pickRendered(zoneCandidates);
  if (!zone) { clearMarks(); resolution = null; return; }

  const shell = zone.parentElement;
  if (!looksLikeShell(shell)) { clearMarks(); resolution = null; return; }

  const siblings = elementChildren(shell);
  const zoneIndex = siblings.indexOf(zone);
  if (zoneIndex < 1) { clearMarks(); resolution = null; return; }

  // The nav is the nearest PRECEDING sibling that contains a classified tab —
  // covers the live flat `.panel`, a `.panel > nav` wrapper, and a bare
  // fixture `<nav>` all in one rule, without caring which shape it is.
  let nav = null;
  for (let i = zoneIndex - 1; i >= 0; i -= 1) {
    const candidate = siblings[i];
    if (candidate.tagName === 'HEADER') break;
    if (candidate.querySelector('[data-iw-ui="nav-tab"]') || candidate.matches('[data-iw-ui="nav-tab"]')) {
      nav = candidate;
      break;
    }
  }
  if (!nav) { clearMarks(); resolution = null; return; }
  const navIndex = siblings.indexOf(nav);

  // The notice is whatever sits strictly between nav and zone. Zero is legal
  // (the game's announcement is conditional); more than one is a shape this
  // module does not understand, and it refuses rather than guess.
  const between = siblings.slice(navIndex + 1, zoneIndex);
  if (between.length > 1) { clearMarks(); resolution = null; return; }
  const notice = between[0] || null;
  if (notice) {
    if (notice.classList.contains('panel')) { clearMarks(); resolution = null; return; }
    const text = norm(notice.textContent);
    if (!text || text.length > MAX_NOTICE_CHARS) { clearMarks(); resolution = null; return; }
  }

  // The zone bar must hold exactly the two branches this recipe expects.
  const zoneChildren = elementChildren(zone);
  if (zoneChildren.length !== 2) { clearMarks(); resolution = null; return; }
  const zoneText = zoneChildren.find(c => c.querySelector('[data-iw-ui="zone-title"]') || c.matches('[data-iw-ui="zone-title"]'));
  const zoneActions = zoneChildren.find(c => c !== zoneText && c.querySelector('[data-iw-ui="zone-action"]'));
  if (!zoneText || !zoneActions) { clearMarks(); resolution = null; return; }

  const roles = new Map([
    [shell, 'shell'], [nav, 'nav'], [zone, 'zone-bar'],
    [zoneText, 'zone-text'], [zoneActions, 'zone-actions'],
  ]);
  if (notice) roles.set(notice, 'notice');
  // A mark left on a node that is no longer part of the chrome (a message that
  // just went away, a nav React remounted) would keep a stale grid placement.
  document.querySelectorAll(`[${ROLE}]`).forEach(el => {
    if (!roles.has(el)) el.removeAttribute(ROLE);
  });
  roles.forEach((role, el) => setRole(el, role));

  resolution = { shell, nav, notice, zone, zoneText, zoneActions };
}

export function classifyHeaderChrome() {
  if (resolutionValid()) {
    // The notice is the one piece that can appear/disappear on an otherwise
    // settled page (the game's message is conditional), so re-check it on
    // the cheap path rather than re-running the whole resolve.
    const { shell, nav, zone } = resolution;
    const siblings = elementChildren(shell);
    const between = siblings.slice(siblings.indexOf(nav) + 1, siblings.indexOf(zone));
    const notice = between.length === 1 ? between[0] : null;
    if (notice !== resolution.notice) resolve();
    return;
  }
  resolve();
}

export function clearHeaderChrome() {
  clearMarks();
  resolution = null;
}
