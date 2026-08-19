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
// The audited v1.5.3 visual baseline never successfully activated the HUD
// relayout path on the current live DOM. Keep that structural rewrite disabled
// until it is rebuilt/tested as an isolated feature; name/readout fixes must not
// implicitly switch on a dormant layout system.
const ENABLE_PLAYER_HUD_RELAYOUT = false;
const HUD_METRIC_PATTERNS = [
  /^\s*[💰🪙]?\s*[\d,]+\s*$/u,
  /\batk\s*\d+\s*[•·]\s*def\s*\d+\s*[•·]\s*hp\s*\d+/i,
  /\bxp\s*[+\-]?\d+\s*\/\s*task\b/i,
  /\b(?:no\s+)?atk\s+potion\b/i,
  /\b(?:no\s+)?def\s+potion\b/i,
  /\bworld\s+buff\b/i,
  /\bboosted\b/i,
];

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(el) {
  return normText(el?.textContent).toLowerCase();
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

function directChildUnder(root, el) {
  if (!root || !el || !root.contains(el)) return null;
  let cur = el;
  while (cur && cur.parentElement !== root) cur = cur.parentElement;
  return cur?.parentElement === root ? cur : null;
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

function chooseHudHost(marker) {
  let cur = marker;
  let best = null;
  for (let depth = 0; cur && depth < 9; depth += 1, cur = cur.parentElement) {
    const text = lower(cur);
    if (!/players online/.test(text) || !/combat\s+lv\s*\d+/.test(text)) continue;
    if (/\batk\s*\d+/.test(text) && /\bdef\s*\d+/.test(text) && /\bhp\s*\d+/.test(text)) {
      best = cur;
      const rect = cur.getBoundingClientRect?.();
      if (rect && rect.width >= Math.min(720, window.innerWidth * .62) && rect.height < 360) return cur;
    }
  }
  return best;
}

function chooseIdentityHost(marker, hud) {
  let cur = marker;
  let best = marker.parentElement;
  for (let depth = 0; cur && cur !== hud && depth < 7; depth += 1, cur = cur.parentElement) {
    const text = lower(cur);
    if (/players online/.test(text) && /combat\s+lv\s*\d+/.test(text) && !/\batk\s*\d+\s*[•·]\s*def/.test(text)) {
      best = cur;
    }
  }
  return best;
}

function hudLeafCandidates(identity) {
  // The live game can render the player name as a clickable control so other
  // players can inspect/profile it, and cosmetic name colours may live on a
  // nested span. Do not exclude buttons/anchors here; only reject containers
  // that contain unrelated interactive descendants.
  return [...identity.querySelectorAll('h1,h2,h3,h4,div,span,p,button,a,[role="button"]')]
    .filter(el => {
      const nestedControls = [...el.querySelectorAll('button,a,input,select,textarea,[role="button"]')]
        .filter(control => control !== el);
      return nestedControls.length === 0;
    })
    .filter(el => el.childElementCount <= 2)
    .filter(el => {
      const text = normText(el.textContent);
      return text && text.length <= 80;
    });
}

function hudOrderedTextCandidates(identity) {
  const candidates = hudLeafCandidates(identity);
  const position = new Map();
  candidates.forEach((el, index) => position.set(el, index));

  // Prefer the smallest shell for duplicate same-text candidates, then preserve
  // DOM order. This makes the sequence robust to wrappers introduced by React.
  const byText = new Map();
  for (const el of candidates) {
    const text = normText(el.textContent);
    const previous = byText.get(text);
    if (!previous || previous.contains(el)) byText.set(text, el);
  }
  return [...byText.values()].sort((a, b) => {
    if (a === b) return 0;
    const relation = a.compareDocumentPosition?.(b) || 0;
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return (position.get(a) || 0) - (position.get(b) || 0);
  });
}

function markPlayerName(name, identity) {
  if (!name) return;
  const shell = sameTextShell(name, identity, 6);
  setRole(shell, 'hud-player-name');
  shell.dataset.iwHudPlayerText = '1';
  name.dataset.iwHudPlayerText = '1';

  // Classification only. IdleWorlds owns the cosmetic player-name treatment
  // (for example chat-name-celestial), including transparent text fill plus a
  // clipped background gradient on the clickable name button. Never write
  // colour/background/text-fill here: doing so destroys the native cosmetic.
}

function classifyHudIdentity(identity) {
  if (!identity) return;

  // Reclassification happens repeatedly as React updates the header. Clear only
  // the identity sub-roles we own so a stale earlier guess cannot keep styling
  // the wrong node after the player header is reconciled.
  identity.querySelectorAll('[data-iw-ui="hud-brand"], [data-iw-ui="hud-player-name"], [data-iw-ui="hud-title"], [data-iw-ui="hud-location"], [data-iw-ui="hud-online"]').forEach(el => {
    delete el.dataset.iwUi;
  });
  identity.querySelectorAll('[data-iw-hud-player-text]').forEach(el => {
    delete el.dataset.iwHudPlayerText;
  });

  const candidates = hudOrderedTextCandidates(identity);
  const brand = candidates.find(el => /^idleworlds$/i.test(normText(el.textContent)));
  const location = candidates.find(el => /combat\s+lv\s*\d+.*zone\s*\d+/i.test(normText(el.textContent)));
  const online = candidates.find(el => /^players online\s*:/i.test(normText(el.textContent)));

  if (brand) setRole(sameTextShell(brand, identity, 2), 'hud-brand');
  if (location) setRole(sameTextShell(location, identity, 2), 'hud-location');
  if (online) setRole(sameTextShell(online, identity, 2), 'hud-online');

  // The desktop header's identity block is ordered Brand -> Player -> Title ->
  // Combat/Zone -> Online. Use that structural fact before any font-size
  // heuristic. It remains valid when the player name is an <a>/<button> and
  // when its cosmetic colour makes computed font styling misleading.
  const brandIndex = brand ? candidates.indexOf(brand) : -1;
  const locationIndex = location ? candidates.indexOf(location) : candidates.length;
  const between = candidates.filter((el, index) => {
    if (index <= brandIndex || index >= locationIndex) return false;
    const text = normText(el.textContent);
    if (!text || /^(?:idleworlds|players online\s*:)/i.test(text)) return false;
    if (/combat\s+lv|zone\s*\d+/i.test(text)) return false;
    return true;
  });

  let name = between[0] || null;
  let title = between[1] || null;

  // Fallback for unexpected header ordering: prefer a clickable short control,
  // then the largest remaining short text. This is intentionally secondary to
  // DOM order because cosmetic gradients can distort computed styles.
  if (!name) {
    const excluded = new Set([brand, location, online].filter(Boolean));
    const remaining = candidates.filter(el => !excluded.has(el));
    name = remaining.find(el => el.matches?.('button,a,[role="button"]')) || remaining
      .map(el => {
        let size = 0;
        let weight = 0;
        try {
          const cs = getComputedStyle(el);
          size = parseFloat(cs.fontSize) || 0;
          weight = parseInt(cs.fontWeight, 10) || 400;
        } catch { /* no-op */ }
        return { el, score: size * 10 + weight / 100 };
      })
      .sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  if (name) markPlayerName(name, identity);

  if (!title) {
    title = candidates.find(el => {
      if (el === name || el === brand || el === location || el === online) return false;
      const text = normText(el.textContent);
      return text.length <= 42 && !/combat\s+lv|zone\s*\d+|players online/i.test(text);
    }) || null;
  }
  if (title) setRole(sameTextShell(title, identity, 2), 'hud-title');
}

function classifyHudMetrics(hud) {
  if (!hud) return [];
  const candidates = [...hud.querySelectorAll('div, span, p')]
    .filter(el => !el.querySelector('button, input, select, textarea'))
    .filter(el => el.childElementCount <= 2);

  const used = new Set();
  const metrics = [];
  for (const el of candidates) {
    const text = normText(el.textContent);
    if (!text || text.length > 100 || !HUD_METRIC_PATTERNS.some(re => re.test(text))) continue;
    const shell = sameTextShell(el, hud, 4);
    if (!shell || used.has(shell)) continue;
    used.add(shell);
    setRole(shell, 'hud-metric');
    metrics.push(shell);
  }
  return metrics;
}

function classifyHudZones(hud, identity, metrics) {
  if (!hud || !identity) return;
  const identityZone = directChildUnder(hud, identity);
  if (identityZone) identityZone.dataset.iwHudZone = 'identity';

  let statusHost = commonAncestor(metrics);
  if (statusHost === hud) statusHost = null;
  const statusZone = directChildUnder(hud, statusHost || metrics[0]);
  if (statusZone && statusZone !== identityZone) {
    statusZone.dataset.iwHudZone = 'status';
    setRole(statusHost || statusZone, 'hud-status');
  }

  const utilityButtons = [...hud.querySelectorAll('button')]
    .filter(btn => !statusZone?.contains(btn))
    .filter(btn => {
      const text = normText(btn.textContent);
      const aria = normText(btn.getAttribute('aria-label') || btn.getAttribute('title'));
      return text.length <= 2 || (!!aria && aria.length <= 28);
    });
  const utilityHost = commonAncestor(utilityButtons);
  const utilityZone = directChildUnder(hud, utilityHost || utilityButtons[0]);
  if (utilityZone && utilityZone !== identityZone && utilityZone !== statusZone) {
    utilityZone.dataset.iwHudZone = 'utility';
    if (utilityHost && utilityHost !== hud) setRole(utilityHost, 'hud-utility');
    utilityButtons.forEach(btn => setRole(btn, 'hud-utility-button'));
  }

  const zones = [identityZone, utilityZone, statusZone].filter(Boolean);
  if (zones.length === 3 && new Set(zones).size === 3) hud.dataset.iwHudLayout = 'three-zone';
  else delete hud.dataset.iwHudLayout;
}

function classifyPlayerHud() {
  const marker = [...document.querySelectorAll('div, span, p')]
    .find(el => /^players online\s*:/i.test(normText(el.textContent)) && el.childElementCount <= 2);
  if (!marker) return;

  const hud = chooseHudHost(marker);
  if (!hud || hud === document.body) return;
  setRole(hud, 'player-hud');

  const identity = chooseIdentityHost(marker, hud);
  if (identity && hud.contains(identity)) {
    setRole(identity, 'hud-identity');
    classifyHudIdentity(identity);
  }
  const metrics = classifyHudMetrics(hud);
  classifyHudZones(hud, identity, metrics);
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
    if (ENABLE_PLAYER_HUD_RELAYOUT) guard('ui:player-hud', classifyPlayerHud);
    guard('ui:zone-bar', classifyZoneBar);
    guard('ui:section-frames', classifySectionFrames);
  });
}

/** Remove every semantic role attribute this module applied. Kill switch. */
export function clearUIFoundation() {
  document.querySelectorAll('[data-iw-ui]').forEach(el => { delete el.dataset.iwUi; });
  document.querySelectorAll('[data-iw-tab]').forEach(el => { delete el.dataset.iwTab; });
  document.querySelectorAll('[data-iw-state]').forEach(el => { delete el.dataset.iwState; });
  document.querySelectorAll('[data-iw-hud-zone]').forEach(el => { delete el.dataset.iwHudZone; });
  document.querySelectorAll('[data-iw-hud-layout]').forEach(el => { delete el.dataset.iwHudLayout; });
  document.querySelectorAll('[data-iw-hud-player-text]').forEach(el => {
    delete el.dataset.iwHudPlayerText;
  });
}

export function initUIFoundation() {
  inject('ui-system', css);
  on('iw:dom-flush', queueClassify);
  queueClassify();
}
