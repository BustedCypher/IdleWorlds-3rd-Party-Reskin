/**
 * SkillPanelRenderer
 *
 * Reconciles skill panels and attaches semantic role attributes for the shared
 * v1.5.0 action-panel layout. React owns the DOM; we never reparent gameplay
 * nodes or create another observer.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { guard, guardEach } from './Runtime.js';
import css from '../styles/skillpanel.css';

const RENDERED_ATTR = 'data-fs-skill';
const ROLE_ATTR = 'data-iw-skill-role';
const ZONE_ATTR = 'data-iw-skill-zone';
const buttonStyleSnapshots = new WeakMap();
const readoutStyleSnapshots = new WeakMap();
const ingredientStyleSnapshots = new WeakMap();

const SKILL_META = {
  combat:    { label: 'Combat',    glyph: '⚔︎', actions: ['fight'] },
  mining:    { label: 'Mining',    glyph: '⛏︎', actions: ['mine'] },
  smithing:  { label: 'Smithing',  glyph: '⚒︎', actions: ['smelt', 'forge'] },
  gathering: { label: 'Gathering', glyph: '❧',  actions: ['gather', 'harvest'] },
  alchemy:   { label: 'Alchemy',   glyph: '⚗︎', actions: ['brew'] },
  jewelcrafting: { label: 'Jewelcrafting', glyph: '◆', actions: ['prospect'] },
  spellcrafting: { label: 'Spellcrafting', glyph: '✧', actions: ['enchant'] },
  tailoring: { label: 'Tailoring', glyph: '⋈', actions: ['tailor', 'sew'] },
  crafting:  { label: 'Crafting',  glyph: '✦',  actions: ['craft'] },
  fishing:   { label: 'Fishing',   glyph: '⌁',  actions: ['fish'] },
};

function setStyle(el, prop, value, priority = 'important') {
  if (el.style.getPropertyValue(prop) === value && el.style.getPropertyPriority(prop) === priority) return;
  el.style.setProperty(prop, value, priority);
}

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function classifyButton(btn) {
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return 'disabled';
  const text = normText(btn.textContent);
  if (text.length <= 2) return 'icon';
  const cls = String(btn.className || '');
  if (/bg-ember|bg-orange|bg-primary|bg-accent/i.test(cls)) return 'primary';
  return 'secondary';
}

const BUTTON_STYLES = {
  base: {
    'font-family': "'Barlow', system-ui, sans-serif",
    'font-size': '12px',
    'font-weight': '700',
    'letter-spacing': '0.06em',
    'text-transform': 'uppercase',
    'border-radius': '2px',
    'transition': 'background .13s, border-color .13s, color .13s',
    'align-self': 'center',
    'height': '32px',
    'min-height': '32px',
    'flex-shrink': '0',
  },
  primary: {
    'background': 'linear-gradient(180deg, #A94318, #742A0D)',
    'border': '1px solid #C05A28',
    'color': '#FFEAD1',
    'padding': '0 17px',
    'min-width': '96px',
    'cursor': 'pointer',
    'box-shadow': 'none',
  },
  secondary: {
    'background': 'linear-gradient(180deg, #242018, #17140F)',
    'border': '1px solid #58482B',
    'color': '#DAD3C3',
    'padding': '0 13px',
    'min-width': '72px',
    'cursor': 'pointer',
    'box-shadow': 'none',
  },
  disabled: {
    'background': '#15130F',
    'border': '1px solid #3A3022',
    'color': '#8E8676',
    'padding': '0 15px',
    'min-width': '96px',
    'cursor': 'not-allowed',
    'box-shadow': 'none',
  },
  icon: {
    'background': 'linear-gradient(180deg, #242018, #17140F)',
    'border': '1px solid #58482B',
    'color': '#DAD3C3',
    'padding': '0',
    'width': '30px',
    'min-width': '30px',
    'cursor': 'pointer',
    'box-shadow': 'none',
  },
};

function styleButton(btn) {
  const role = btn.getAttribute(ROLE_ATTR) || '';
  // Live IdleWorlds renders the level/XP datum as a real <button>. It is data,
  // not a command. Never pass it through the generic action-button painter.
  if (role === 'level-progress') {
    delete btn.dataset.iwBtnState;
    buttonStyleSnapshots.delete(btn);
    return;
  }
  const state = classifyButton(btn);
  const currentStyle = btn.getAttribute('style') || '';
  const previous = buttonStyleSnapshots.get(btn);
  if (previous && previous.state === state && previous.role === role && previous.style === currentStyle) return;

  for (const [prop, value] of Object.entries(BUTTON_STYLES.base)) setStyle(btn, prop, value);
  for (const [prop, value] of Object.entries(BUTTON_STYLES[state])) setStyle(btn, prop, value);

  // Role geometry is applied inline because IdleWorlds frequently writes its
  // own inline button dimensions during React updates.
  if (role === 'nav-button') {
    setStyle(btn, 'width', '30px');
    setStyle(btn, 'min-width', '30px');
    setStyle(btn, 'height', '30px');
    setStyle(btn, 'min-height', '30px');
    setStyle(btn, 'padding', '0');
  } else if (role === 'action-button') {
    setStyle(btn, 'width', '96px');
    setStyle(btn, 'min-width', '96px');
    setStyle(btn, 'height', '34px');
    setStyle(btn, 'min-height', '34px');
    setStyle(btn, 'padding', '0 14px');
  }

  if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
  buttonStyleSnapshots.set(btn, { state, role, style: btn.getAttribute('style') || '' });
}

const LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?\s*[-–]\s*\d+(?:\.\d+)?%\s*[•·]\s*[\d,]+\s+(?:xp\s+)?to\s+go$/i;
const READOUT_STYLES = {
  'background': 'none',
  'background-color': 'transparent',
  'background-image': 'none',
  'border': 'none',
  'border-radius': '0',
  'outline': 'none',
  'box-shadow': 'none',
  'padding': '0',
  'margin': '0',
  'width': 'auto',
  'min-width': '0',
  'height': 'auto',
  'min-height': '0',
  'max-height': 'none',
  'cursor': 'default',
};

function sameTextShellChain(el, panel) {
  if (!el) return [];
  const text = normText(el.textContent);
  const chain = [el];
  let cur = el;
  // React/Tailwind commonly nests a text span inside two or more visual shells.
  // The border/background can live on an intermediate shell, so returning only
  // the outermost node is not sufficient. Keep the whole same-text chain and
  // neutralise every layer we own.
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = cur.parentElement;
    if (!parent || parent === panel) break;
    if (parent.matches?.('button, a, [role="button"]') || parent.closest?.('button, a, [role="button"]')) break;
    if (normText(parent.textContent) !== text) break;
    chain.push(parent);
    cur = parent;
  }
  return chain;
}

function outerSameTextShell(el, panel) {
  const chain = sameTextShellChain(el, panel);
  return chain[chain.length - 1] || el;
}

function readoutBranch(el, panel) {
  if (!el) return [];
  const branch = [el];
  const readoutText = normText(el.textContent);
  let cur = el;

  for (let depth = 0; depth < 10; depth += 1) {
    const parent = cur.parentElement;
    if (!parent || parent === panel) break;
    if (parent.matches?.('button,a,input,select,textarea,[role="button"]')) break;

    const parentText = normText(parent.textContent);
    if (!parentText.includes(readoutText)) break;

    // Stop before swallowing the action/content column. A readout shell may
    // contain decorative spans or hidden helpers, so exact text equality is
    // too strict; instead stop when the ancestor also owns another semantic
    // skill datum/control.
    const ownsOtherRole = [...parent.querySelectorAll(`[${ROLE_ATTR}]`)].some(node => {
      if (node === el || branch.includes(node)) return false;
      const role = node.getAttribute(ROLE_ATTR);
      return role && role !== 'level-progress';
    });
    const ownsControl = !!parent.querySelector('button,a,input,select,textarea,[role="button"]');
    if (ownsOtherRole || ownsControl) break;

    branch.push(parent);
    cur = parent;
  }
  return branch;
}

function neutraliseReadouts(panel) {
  // Clear stale marks first. React may replace only the inner readout while
  // preserving a previously classified wrapper.
  panel.querySelectorAll('[data-iw-readout]').forEach(el => {
    delete el.dataset.iwReadout;
    readoutStyleSnapshots.delete(el);
  });

  let readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
  if (!readout) {
    readout = [...panel.querySelectorAll('div,span,p,strong')].find(el => {
      if (el.closest('button,a,[role="button"]')) return false;
      return LEVEL_PROGRESS_PATTERN.test(normText(el.textContent));
    }) || null;
  }
  if (!readout) return;

  const branch = readoutBranch(readout, panel);
  for (const target of branch) {
    target.dataset.iwReadout = '1';
    for (const [prop, value] of Object.entries(READOUT_STYLES)) setStyle(target, prop, value);
    // Native metric widgets may set flex/grid alignment or transforms on an
    // otherwise borderless shell. Reset only the branch that contains no other
    // semantic skill content.
    setStyle(target, 'transform', 'none');
    setStyle(target, 'filter', 'none');
    setStyle(target, 'align-self', 'auto');
    readoutStyleSnapshots.set(target, target.getAttribute('style') || '');
  }
}

const INGR_PATTERN = /[A-Z\s]{4,}\s+\d+\/\d+|\d+\/\d+/;
const INGR_STYLES = {
  'background': 'none',
  'background-color': 'transparent',
  'border': 'none',
  'border-radius': '0',
  'padding': '0',
  'box-shadow': 'none',
};

function neutraliseIngredients(panel) {
  for (const el of panel.querySelectorAll('div, span')) {
    if (el.tagName === 'BUTTON' || el.closest('button, a, [role="button"]')) continue;
    if (el.childElementCount > 3) continue;
    const text = normText(el.textContent);
    const matches = INGR_PATTERN.test(text);
    if (!matches) {
      if (el.dataset.iwIngr) delete el.dataset.iwIngr;
      ingredientStyleSnapshots.delete(el);
      continue;
    }

    const chain = sameTextShellChain(el, panel);
    for (const target of chain) {
      const currentStyle = target.getAttribute('style') || '';
      if (ingredientStyleSnapshots.get(target) === currentStyle && target.dataset.iwIngr === '1') continue;
      if (target.dataset.iwIngr !== '1') target.dataset.iwIngr = '1';
      for (const [prop, value] of Object.entries(INGR_STYLES)) setStyle(target, prop, value);
      ingredientStyleSnapshots.set(target, target.getAttribute('style') || '');
    }
  }
}

function setRole(el, role) {
  if (el && el.getAttribute(ROLE_ATTR) !== role) el.setAttribute(ROLE_ATTR, role);
  return el;
}

function clearStructureRoles(panel) {
  panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}]`).forEach(el => {
    el.removeAttribute(ROLE_ATTR);
    el.removeAttribute(ZONE_ATTR);
  });
  delete panel.dataset.iwSkillLayout;
}

function directChildUnder(panel, el) {
  if (!el || !panel.contains(el)) return null;
  let cur = el;
  while (cur && cur.parentElement !== panel) cur = cur.parentElement;
  return cur?.parentElement === panel ? cur : null;
}

function textCandidates(panel) {
  return [...panel.querySelectorAll('h1,h2,h3,h4,div,span,p')]
    .filter(el => !el.closest('button, a'))
    .filter(el => normText(el.textContent).length <= 130);
}

function findBestText(panel, predicate) {
  const candidates = textCandidates(panel);
  const exactOwn = candidates.find(el => predicate(normText(el.childElementCount ? '' : el.textContent), el));
  if (exactOwn) return exactOwn;
  return candidates.find(el => predicate(normText(el.textContent), el)) || null;
}

function findProgress(panel) {
  const semantic = panel.querySelector('[role="progressbar"]');
  if (semantic) {
    const fill = semantic.firstElementChild || null;
    return { track: semantic, fill };
  }

  for (const el of panel.querySelectorAll('div')) {
    if (el.children.length !== 1) continue;
    const child = el.firstElementChild;
    const cls = `${el.className || ''} ${child?.className || ''}`;
    const widthStyle = child?.style?.width || '';
    const likelyClass = /progress|h-(?:1|1\.5|2|2\.5)|bg-(?:orange|green|emerald|primary|accent)/i.test(cls);
    if (!likelyClass && !/%$/.test(widthStyle)) continue;
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.height < 2 || rect.height > 14 || rect.width < 100)) continue;
    return { track: el, fill: child };
  }
  return { track: null, fill: null };
}

function annotateStructure(panel, type, meta) {
  clearStructureRoles(panel);

  const identity = findBestText(panel, text => text.toLowerCase() === meta.label.toLowerCase());
  if (identity) {
    const shell = outerSameTextShell(identity, panel);
    setRole(shell, 'identity');
  }

  const actionWord = meta.actions.join('|');
  const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, 'i');
  const actionTitle = findBestText(panel, (text, el) => {
    if (!text || text.length > 90 || !actionTitleRe.test(text)) return false;
    if (el.closest('.iw-item-ref')) return false;
    return true;
  });
  if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), 'action-title');

  const buttons = [...panel.querySelectorAll('button')];

  // Audit 1.5.5 proved the visible "Lv N - X% • ... to go" widget is itself
  // a button. Mark that exact live control before any button receives chrome.
  const levelProgressButton = buttons.find(btn => LEVEL_PROGRESS_PATTERN.test(normText(btn.textContent))) || null;
  if (levelProgressButton) setRole(levelProgressButton, 'level-progress');

  let actionButton = null;
  const actionExact = new RegExp(`^(?:${actionWord})$`, 'i');
  for (const btn of buttons) {
    const text = normText(btn.textContent);
    const aria = normText(btn.getAttribute('aria-label'));
    if (actionExact.test(text) || actionExact.test(aria)) {
      actionButton = btn;
      setRole(btn, 'action-button');
      continue;
    }
    if (text.length <= 2 || /^(?:prev|previous|next)$/i.test(aria)) setRole(btn, 'nav-button');
  }

  const navButtons = buttons.filter(btn => btn.getAttribute(ROLE_ATTR) === 'nav-button');
  if (navButtons.length >= 2) {
    const parent = navButtons[0].parentElement;
    if (parent && navButtons.every(btn => btn.parentElement === parent)) setRole(parent, 'nav-group');
  }

  // Non-button fallback retained for older/mobile DOM variants.
  if (!levelProgressButton) {
    const readout = findBestText(panel, text => LEVEL_PROGRESS_PATTERN.test(text));
    if (readout) setRole(readout, 'level-progress');
  }

  const xpGain = findBestText(panel, text => /^\d[\d,]*\s*xp$/i.test(text));
  if (xpGain) setRole(outerSameTextShell(xpGain, panel), 'xp-gain');

  const requirement = findBestText(panel, text => /^(?:needs|requires)\b/i.test(text));
  if (requirement) setRole(outerSameTextShell(requirement, panel), 'requirement');

  const reward = findBestText(panel, text => /^base reward\s*:/i.test(text));
  if (reward) setRole(outerSameTextShell(reward, panel), 'reward');

  const { track, fill } = findProgress(panel);
  if (track) setRole(track, 'progress-track');
  if (fill) setRole(fill, 'progress-fill');

  for (const ref of panel.querySelectorAll('.iw-item-ref')) {
    const host = ref.parentElement;
    if (host && host !== panel && /\d+\s*\/\s*\d+/.test(normText(host.textContent))) setRole(host, 'ingredient');
  }

  // Opt into the rigid three-column layout only when the live React panel
  // already exposes exactly three distinct top-level zones. This gives us
  // deterministic alignment without forcing unknown DOM shapes into a grid.
  const identityRole = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
  const titleRole = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
  const actionRole = panel.querySelector(`[${ROLE_ATTR}="action-button"]`);
  const identityZone = directChildUnder(panel, identityRole);
  const contentZone = directChildUnder(panel, titleRole);
  const commandZone = directChildUnder(panel, actionRole);
  const directChildren = [...panel.children].filter(el => !el.classList.contains('fs-skill-header'));

  const distinctZones = identityZone && contentZone && commandZone &&
    new Set([identityZone, contentZone, commandZone]).size === 3;

  if (distinctZones) {
    identityZone.setAttribute(ZONE_ATTR, 'identity');
    contentZone.setAttribute(ZONE_ATTR, 'content');
    commandZone.setAttribute(ZONE_ATTR, 'commands');

    // Some skills include an extra absolutely-positioned/decorative React child
    // while others expose only the three functional branches. The previous
    // exact child-count gate meant the shared layout applied to only a subset
    // of skills. Ignore non-flow decoration, but refuse the rigid layout when
    // there is an additional visible functional branch we do not understand.
    const functionalZones = new Set([identityZone, contentZone, commandZone]);
    const unexpectedFlowChild = directChildren.some(el => {
      if (functionalZones.has(el)) return false;
      try {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute' || cs.position === 'fixed') return false;
      } catch { /* fall through to rect test */ }
      const rect = el.getBoundingClientRect?.();
      return !rect || (rect.width > 2 && rect.height > 2);
    });
    if (!unexpectedFlowChild) panel.dataset.iwSkillLayout = 'three-zone';
  }
}

function applyPanelTreatment(panel, type, meta) {
  // Structure first so button styling can use semantic action/nav roles.
  annotateStructure(panel, type, meta);
  panel.querySelectorAll('button').forEach(styleButton);
  neutraliseReadouts(panel);
  neutraliseIngredients(panel);
}

const SKILL_CLASSES = Object.keys(SKILL_META).map(type => `fs-skill--${type}`);

function migrateLegacyWrapper(panel) {
  const wrapper = panel.parentElement;
  if (!wrapper?.classList?.contains('fs-skill-wrapper')) return;
  const parent = wrapper.parentNode;
  if (!parent) return;
  parent.insertBefore(panel, wrapper);
  wrapper.remove();
}

function clearPanelChrome(panel) {
  migrateLegacyWrapper(panel);
  clearStructureRoles(panel);
  panel.classList.remove('fs-skill-panel', ...SKILL_CLASSES);
  delete panel.dataset.fsSkillLabel;
  delete panel.dataset.fsSkillRune;
  delete panel.dataset.fsSkillFlavour;
  delete panel.dataset.iwSkillGlyph;
  delete panel.dataset.iwUi;
  panel.removeAttribute(RENDERED_ATTR);
}

function applyPanelChrome(panel, type, meta) {
  migrateLegacyWrapper(panel);

  if (!panel.classList.contains('fs-skill-panel')) panel.classList.add('fs-skill-panel');
  for (const cls of SKILL_CLASSES) {
    if (cls !== `fs-skill--${type}` && panel.classList.contains(cls)) panel.classList.remove(cls);
  }
  if (!panel.classList.contains(`fs-skill--${type}`)) panel.classList.add(`fs-skill--${type}`);

  panel.dataset.iwUi = 'skill-panel';
  panel.dataset.iwSkill = type;
  panel.dataset.iwSkillGlyph = meta.glyph;
  if (panel.dataset.fsSkillLabel !== meta.label) panel.dataset.fsSkillLabel = meta.label;
}

function renderPanel(panel, skillType) {
  if (!panel || !panel.isConnected) return;

  if (!SKILL_META[skillType]) {
    clearPanelChrome(panel);
    return;
  }

  const meta = SKILL_META[skillType];
  applyPanelChrome(panel, skillType, meta);
  if (panel.getAttribute(RENDERED_ATTR) !== skillType) panel.setAttribute(RENDERED_ATTR, skillType);
  applyPanelTreatment(panel, skillType, meta);
}

/** Strip skill chrome from every panel. Kill switch. */
export function clearSkillPanels() {
  guardEach('skill:teardown', document.querySelectorAll('.compact-panel'), clearPanelChrome);
  document.querySelectorAll('[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]').forEach(el => {
    delete el.dataset.iwReadout;
    delete el.dataset.iwIngr;
    delete el.dataset.iwBtnState;
    el.removeAttribute('style');
  });
}

export function initSkillPanelRenderer() {
  inject('skillpanel', css);
  on('iw:skill-panel', e => guard('skill:panel', () => renderPanel(e.detail.panel, e.detail.skill)));
}
