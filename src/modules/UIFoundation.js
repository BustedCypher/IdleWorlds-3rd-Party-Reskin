/**
 * UIFoundation
 *
 * Classifies existing IdleWorlds DOM into semantic visual roles. React keeps
 * ownership of all nodes/handlers; the skin only adds data attributes. The
 * central DOMWatcher remains the sole MutationObserver.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { guard, raf } from './Runtime.js';
import css from '../styles/ui-system.css';

const NAV_LABELS = ['game', 'market', 'leaderboards', 'village', 'dungeon'];
function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setRole(el, role) {
  if (el && el.dataset.iwUi !== role) el.dataset.iwUi = role;
  return el;
}

function nearestButtonLabel(btn) {
  return normText(btn?.textContent).toLowerCase();
}

function commonAncestor(elements) {
  const list = elements.filter(Boolean);
  if (!list.length) return null;
  let cur = list[0];
  while (cur && cur !== document.documentElement) {
    if (list.every(el => cur === el || cur.contains(el))) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function sameTextShell(el, stop, maxDepth = 4) {
  if (!el) return null;
  const text = normText(el.textContent);
  let cur = el;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = cur.parentElement;
    if (!parent || parent === stop) break;
    if (parent.matches?.('button, a, input, select, textarea')) break;
    if (normText(parent.textContent) !== text) break;
    cur = parent;
  }
  return cur;
}

function warmBackground(btn) {
  try {
    const colour = getComputedStyle(btn).backgroundColor || '';
    const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    return r >= 90 && r > g * 1.35 && g > b * .9;
  } catch {
    return false;
  }
}

function deriveTabActive(btn) {
  if (!btn) return false;
  if (btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-current') === 'page') return true;
  const cls = String(btn.className || '');
  return /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
}

function classifyMainNav() {
  const buttons = [...document.querySelectorAll('button, [role="tab"]')];
  const byLabel = new Map();
  for (const btn of buttons) {
    const label = nearestButtonLabel(btn);
    if (NAV_LABELS.includes(label) && !byLabel.has(label)) byLabel.set(label, btn);
  }
  if (byLabel.size < 4) return;

  const tabs = NAV_LABELS.map(label => byLabel.get(label)).filter(Boolean);
  const semanticActive = tabs.map(btn => deriveTabActive(btn));
  const hasSemanticActive = semanticActive.some(Boolean);
  const route = `${location.pathname || ''} ${location.hash || ''}`.toLowerCase();
  const routeActive = tabs.map(btn => {
    const label = nearestButtonLabel(btn);
    if (label === 'game') return /(?:^|\/)(?:game)?\/?$/.test(location.pathname || '/') && !location.hash;
    return route.includes(label);
  });
  const hasRouteActive = routeActive.some(Boolean);
  const firstClassification = tabs.every(btn => btn.dataset.iwUi !== 'nav-tab');
  const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);

  const track = commonAncestor(tabs);
  if (!track) return;
  setRole(track, 'main-nav');

  // IdleWorlds currently places the button track inside a much larger rounded
  // shell. Mark the outer same-content wrapper separately so we can flatten it
  // without forcing an unknown wrapper to become a flex row.
  let shell = track;
  const navText = normText(track.textContent);
  for (let depth = 0; depth < 3; depth += 1) {
    const parent = shell.parentElement;
    if (!parent || parent === document.body) break;
    const parentButtons = [...parent.querySelectorAll('button, [role="tab"]')]
      .filter(btn => NAV_LABELS.includes(nearestButtonLabel(btn)));
    const rect = parent.getBoundingClientRect?.();
    if (parentButtons.length !== tabs.length || normText(parent.textContent) !== navText) break;
    if (rect && rect.height > 110) break;
    shell = parent;
  }
  if (shell !== track) setRole(shell, 'main-nav-shell');

  tabs.forEach((btn, index) => {
    const wasActive = btn.dataset.iwState === 'active';
    setRole(btn, 'nav-tab');
    btn.dataset.iwTab = nearestButtonLabel(btn);
    const active = hasSemanticActive
      ? semanticActive[index]
      : hasRouteActive
        ? routeActive[index]
        : firstClassification
          ? warmActive[index]
          : wasActive;
    if (active) btn.dataset.iwState = 'active';
    else delete btn.dataset.iwState;
  });
}

function classifyZoneBar() {
  const labels = [...document.querySelectorAll('div,span,p,strong')]
    .filter(el => /^zone\s*\d+\s*:/i.test(normText(el.textContent)) && el.childElementCount <= 2);
  for (const label of labels) {
    let host = label.parentElement;
    for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
      const buttons = [...host.querySelectorAll('button')];
      const buttonText = buttons.map(nearestButtonLabel);
      if (buttonText.some(x => /zones/.test(x)) && buttonText.some(x => /next\s+zone/.test(x))) {
        setRole(host, 'zone-bar');
        buttons.forEach(btn => {
          const text = nearestButtonLabel(btn);
          if (/^(?:zones|previous\s+zone|next\s+zone)$/.test(text)) setRole(btn, 'zone-action');
        });
        setRole(sameTextShell(label, host, 2), 'zone-title');
        break;
      }
    }
  }
}

function classifySectionFrames() {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
  const names = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions)$/i;
  for (const heading of headings) {
    if (!names.test(normText(heading.textContent))) continue;
    let cur = heading.parentElement;
    for (let depth = 0; cur && depth < 4; depth += 1, cur = cur.parentElement) {
      if (cur.matches?.('.compact-panel')) break;
      const rect = cur.getBoundingClientRect?.();
      const descendantCount = cur.querySelectorAll?.('*').length || 0;
      const substantial = descendantCount >= 12 && normText(cur.textContent).length >= 45;
      const roomy = !rect || (rect.width > 320 && rect.height > 110);
      if (substantial && roomy) {
        setRole(cur, 'section-frame');
        setRole(heading, 'section-title');
        break;
      }
    }
  }
}

let queued = false;
function queueClassify() {
  if (queued) return;
  queued = true;
  raf(() => {
    queued = false;
    // Each classifier is isolated: a throw inside classifyMainNav() must not
    // stop the zone bar and section frames from being classified. (Audit S3.7)
    guard('ui:main-nav', classifyMainNav);
    guard('ui:zone-bar', classifyZoneBar);
    guard('ui:section-frames', classifySectionFrames);
  });
}

/** Remove every semantic role attribute this module applied. Kill switch. */
export function clearUIFoundation() {
  document.querySelectorAll('[data-iw-ui]').forEach(el => { delete el.dataset.iwUi; });
  document.querySelectorAll('[data-iw-tab]').forEach(el => { delete el.dataset.iwTab; });
  document.querySelectorAll('[data-iw-state]').forEach(el => { delete el.dataset.iwState; });
}

export function initUIFoundation() {
  inject('ui-system', css);
  on('iw:dom-flush', queueClassify);
  queueClassify();
}
