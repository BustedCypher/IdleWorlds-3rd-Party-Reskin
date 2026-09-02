/**
 * SkillPanelRenderer
 *
 * Reconciles skill panels and attaches semantic role attributes for the shared
 * action-panel layout. React owns the DOM; we never reparent gameplay
 * nodes or create another observer.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { guard, guardEach } from './Runtime.js';
import { createInlineStyleOwner } from './InlineStyleOwner.js';
import { SkillsArtService } from './SkillsArtService.js';
import css from '../styles/skillpanel.css';

const RENDERED_ATTR = 'data-fs-skill';
const ROLE_ATTR = 'data-iw-skill-role';
const ZONE_ATTR = 'data-iw-skill-zone';
const SHELL_ATTR = 'data-iw-skill-layout-shell';
const buttonStyleSnapshots = new WeakMap();
const readoutStyleSnapshots = new WeakMap();
const ingredientStyleSnapshots = new WeakMap();

// Keep independent ownership domains. A live XP datum can itself be a button;
// restoring stale ACTION chrome on that node must not also restore/remove the
// flat readout treatment it still legitimately owns.
const buttonStyleOwner = createInlineStyleOwner();
const readoutStyleOwner = createInlineStyleOwner();
const ingredientStyleOwner = createInlineStyleOwner();
let listenerBound = false;

const SKILL_META = {
  combat:    { label: 'Combat',    labels: ['Combat'],             glyph: '⚔︎', actions: ['fight'] },
  mining:    { label: 'Mining',    labels: ['Mine', 'Mining'],     glyph: '⛏︎', actions: ['mine'] },
  smithing:  { label: 'Smithing',  labels: ['Smith', 'Smithing'],  glyph: '⚒︎', actions: ['smelt', 'forge'] },
  gathering: { label: 'Gathering', labels: ['Gathering'],          glyph: '❧', actions: ['gather', 'harvest'] },
  alchemy:   { label: 'Alchemy',   labels: ['Alchemy'],            glyph: '⚗︎', actions: ['brew'] },
  jewelcrafting: { label: 'Jewelcrafting', labels: ['Jewel', 'Jewelcrafting'], glyph: '◆', actions: ['prospect', 'cut'] },
  spellcrafting: { label: 'Spellcrafting', labels: ['Spellcraft', 'Spellcrafting'], glyph: '✧', actions: ['enchant', 'gather', 'harvest', 'craft'], titleActions: ['enchant', 'harvest', 'craft'], details: [/from the ether$/i] },
  tailoring: { label: 'Tailoring', labels: ['Tailor', 'Tailoring'], glyph: '⋈', actions: ['tailor', 'sew', 'weave', 'craft'], details: [/^missing materials\b/i] },
  woodcutting: { label: 'Woodcutting', labels: ['Wood', 'Woodcutting'], glyph: '⋔', actions: ['chop'] },
  construction: { label: 'Construction', labels: ['Build', 'Construction'], glyph: '⌂', actions: ['craft parts', 'build', 'craft'], titleActions: ['craft', 'build'] },
  crafting:  { label: 'Crafting',  labels: ['Craft', 'Crafting'], glyph: '✦', actions: ['craft'] },
  fishing:   { label: 'Fishing',   labels: ['Fish', 'Fishing'],   glyph: '⌁', actions: ['fish'] },
  locked:    { label: 'Coming Soon', labels: ['Coming Soon'], glyph: '◇', actions: [], titleActions: ['upcoming skill'], details: [/^unlock in a future update$/i] },
};

function setOwnedStyle(owner, el, prop, value, priority = 'important') {
  return owner.set(el, prop, value, priority);
}

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textWithoutLeadingGlyph(value) {
  return normText(value).replace(/^[^a-z0-9]+/i, '');
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
    'background': 'linear-gradient(180deg, color-mix(in srgb, var(--fs-skill-accent) 74%, #593018), color-mix(in srgb, var(--fs-skill-accent) 48%, #25170F))',
    'border': '1px solid color-mix(in srgb, var(--fs-skill-accent) 72%, #8A6633)',
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
  // not a command. If React repurposed a button we styled in an earlier flush,
  // restore only our old ACTION properties; readout ownership is independent.
  if (role === 'level-progress') {
    buttonStyleOwner.restoreElement(btn);
    delete btn.dataset.iwBtnState;
    buttonStyleSnapshots.delete(btn);
    return;
  }
  const classifiedState = classifyButton(btn);
  const state = role === 'action-button' && classifiedState !== 'disabled' ? 'primary' : classifiedState;
  const currentStyle = btn.getAttribute('style') || '';
  const previous = buttonStyleSnapshots.get(btn);
  if (previous && previous.state === state && previous.role === role && previous.style === currentStyle) return;

  for (const [prop, value] of Object.entries(BUTTON_STYLES.base)) {
    setOwnedStyle(buttonStyleOwner, btn, prop, value);
  }
  for (const [prop, value] of Object.entries(BUTTON_STYLES[state])) {
    setOwnedStyle(buttonStyleOwner, btn, prop, value);
  }

  // Role geometry is applied inline because IdleWorlds frequently writes its
  // own inline button dimensions during React updates.
  if (role === 'nav-button') {
    // The pager IS the skills_nav_*.svg artwork — a framed arrow. Three things
    // must not fight it, and all three have to be set here because these are
    // inline `!important` and outrank every stylesheet rule:
    //   * the control's own border/box-shadow, which drew a second, squarer
    //     outline around the artwork's frame;
    //   * the native glyph, which rendered a vector arrow ON TOP of the drawn
    //     one (hence transparent text at font-size 0);
    //   * the classified-state gradient from BUTTON_STYLES, cleared by the
    //     `background` shorthand before the artwork is applied.
    // The 44px box is the touch target; the artwork is inset inside it.
    setOwnedStyle(buttonStyleOwner, btn, 'width', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'min-width', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'height', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'min-height', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'padding', '0');
    setOwnedStyle(buttonStyleOwner, btn, 'background', 'none');
    const navImage = btn.dataset.iwNavDirection === 'prev' ? 'var(--fs-skills-nav-prev)' : 'var(--fs-skills-nav-next)';
    setOwnedStyle(buttonStyleOwner, btn, 'background-image', navImage);
    setOwnedStyle(buttonStyleOwner, btn, 'background-size', `${NAV_ART_SCALE} ${NAV_ART_SCALE}`);
    setOwnedStyle(buttonStyleOwner, btn, 'background-position', 'center');
    setOwnedStyle(buttonStyleOwner, btn, 'background-repeat', 'no-repeat');
    setOwnedStyle(buttonStyleOwner, btn, 'border', '0');
    setOwnedStyle(buttonStyleOwner, btn, 'box-shadow', 'none');
    setOwnedStyle(buttonStyleOwner, btn, 'color', 'transparent');
    setOwnedStyle(buttonStyleOwner, btn, 'font-size', '0');
  } else if (role === 'action-button') {
    // Keep in step with skillpanel.css: the action frame art is 264x75 (3.52),
    // and 44px is the touch-target floor, so 155x44 is the undistorted size.
    // These are inline `!important`, so a disagreement here silently overrides
    // the stylesheet rather than losing to it.
    setOwnedStyle(buttonStyleOwner, btn, 'width', '155px');
    setOwnedStyle(buttonStyleOwner, btn, 'min-width', '155px');
    setOwnedStyle(buttonStyleOwner, btn, 'height', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'min-height', '44px');
    setOwnedStyle(buttonStyleOwner, btn, 'padding', '0 12px');
  }

  if (btn.dataset.iwBtnState !== state) btn.dataset.iwBtnState = state;
  buttonStyleSnapshots.set(btn, { state, role, style: btn.getAttribute('style') || '' });
}

// How much of the 44px touch target the framed arrow artwork fills. The box
// stays 44px for accessibility; only the graphic shrinks. Keep in step with the
// nav background-size in skillpanel.css.
const NAV_ART_SCALE = '68%';

const LEVEL_PROGRESS_PATTERN = /^lv\s*\d+(?:\s*\+\s*\d+)?(?:\s*[-\u2013]\s*\d+(?:\.\d+)?%\s*[\u2022\u00b7]\s*[\d,]+\s+(?:xp\s+)?to\s+go|\s*[\u2022\u00b7]\s*[\d,]+\s*\/\s*[\d,]+\s*xp)$/i;
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
    const ownsOtherControl = [...parent.querySelectorAll('button,a,input,select,textarea,[role="button"]')]
      .some(control => control !== el && !branch.includes(control));
    if (ownsOtherRole || ownsOtherControl) break;

    branch.push(parent);
    cur = parent;
  }
  return branch;
}

function neutraliseReadouts(panel) {
  const previouslyMarked = [...panel.querySelectorAll('[data-iw-readout]')];

  let readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
  if (!readout) {
    readout = [...panel.querySelectorAll('div,span,p,strong')].find(el => {
      if (el.closest('button,a,[role="button"]')) return false;
      return LEVEL_PROGRESS_PATTERN.test(normText(el.textContent));
    }) || null;
  }

  if (!readout) {
    // The readout disappeared or React repurposed this branch. Restore only the
    // nodes that previously belonged to the readout treatment.
    for (const old of previouslyMarked) {
      readoutStyleOwner.restoreElement(old);
      delete old.dataset.iwReadout;
      readoutStyleSnapshots.delete(old);
    }
    return;
  }

  const branch = [...new Set([
    ...readoutBranch(readout, panel),
    ...sameTextShellChain(readout, panel),
  ])];
  const current = new Set(branch);

  // Restore ONLY nodes that left the readout branch. Restoring every marked
  // node on every reconcile would itself generate style mutations forever.
  for (const old of previouslyMarked) {
    if (current.has(old)) continue;
    readoutStyleOwner.restoreElement(old);
    delete old.dataset.iwReadout;
    readoutStyleSnapshots.delete(old);
  }

  for (const target of branch) {
    target.dataset.iwReadout = '1';
    for (const [prop, value] of Object.entries(READOUT_STYLES)) {
      setOwnedStyle(readoutStyleOwner, target, prop, value);
    }
    setOwnedStyle(readoutStyleOwner, target, 'transform', 'none');
    setOwnedStyle(readoutStyleOwner, target, 'filter', 'none');
    setOwnedStyle(readoutStyleOwner, target, 'align-self', 'auto');
    readoutStyleSnapshots.set(target, target.getAttribute('style') || '');
  }
}

const INGR_PATTERN = /^(?!.*\bxp\b).{0,80}\b\d+\s*\/\s*\d+\b/i;
const INGR_STYLES = {
  'background': 'none',
  'background-color': 'transparent',
  'border': 'none',
  'border-radius': '0',
  'padding': '0',
  'box-shadow': 'none',
};

function neutraliseIngredients(panel) {
  for (const el of panel.querySelectorAll('div, span, p')) {
    if (el.tagName === 'BUTTON' || el.closest('button, a, [role="button"]')) continue;
    if (el.childElementCount > 3) continue;
    const text = normText(el.textContent);
    const matches = INGR_PATTERN.test(text);
    if (!matches) {
      if (el.dataset.iwIngr) {
        ingredientStyleOwner.restoreElement(el);
        delete el.dataset.iwIngr;
      }
      ingredientStyleSnapshots.delete(el);
      continue;
    }

    const chain = sameTextShellChain(el, panel);
    for (const target of chain) {
      const currentStyle = target.getAttribute('style') || '';
      if (ingredientStyleSnapshots.get(target) === currentStyle && target.dataset.iwIngr === '1') continue;
      if (target.dataset.iwIngr !== '1') target.dataset.iwIngr = '1';
      for (const [prop, value] of Object.entries(INGR_STYLES)) {
        setOwnedStyle(ingredientStyleOwner, target, prop, value);
      }
      ingredientStyleSnapshots.set(target, target.getAttribute('style') || '');
    }
  }
}

function setRole(el, role) {
  if (el && el.getAttribute(ROLE_ATTR) !== role) el.setAttribute(ROLE_ATTR, role);
  return el;
}

function clearStructureRoles(panel) {
  panel.querySelectorAll(`[${ROLE_ATTR}], [${ZONE_ATTR}], [${SHELL_ATTR}], [data-iw-nav-direction]`).forEach(el => {
    el.removeAttribute(ROLE_ATTR);
    el.removeAttribute(ZONE_ATTR);
    el.removeAttribute(SHELL_ATTR);
    delete el.dataset.iwNavDirection;
  });
  delete panel.dataset.iwSkillLayout;
}

function childUnder(container, el) {
  if (!container || !el || !container.contains(el)) return null;
  let cur = el;
  while (cur && cur.parentElement !== container) cur = cur.parentElement;
  return cur?.parentElement === container ? cur : null;
}

function commonAncestorWithin(panel, elements) {
  const nodes = elements.filter(Boolean);
  if (!nodes.length || nodes.some(node => !panel.contains(node))) return null;
  let cur = nodes[0];
  while (cur && cur !== panel) {
    if (nodes.every(node => cur.contains(node))) return cur;
    cur = cur.parentElement;
  }
  return panel;
}

function isPresentationHidden(el) {
  if (!el || el.hidden || el.getAttribute?.('aria-hidden') === 'true') return true;
  try {
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || cs.contentVisibility === 'hidden';
  } catch { return false; }
}

// annotateStructure() calls findBestText() 8+ times per panel per render,
// each of which used to re-run this same full-panel sweep + getComputedStyle
// sort from scratch. One call's worth of candidates never changes mid-call
// (synchronous, no reentrancy), so memoize the last panel's result.
let lastCandidatePanel = null;
let lastCandidates = null;

function textCandidates(panel) {
  if (lastCandidatePanel === panel) return lastCandidates;
  const candidates = [...panel.querySelectorAll('h1,h2,h3,h4,div,span,p')]
    .filter(el => !el.closest('button, a'))
    .filter(el => normText(el.textContent).length <= 130)
    .sort((a, b) => Number(isPresentationHidden(a)) - Number(isPresentationHidden(b)));
  lastCandidatePanel = panel;
  lastCandidates = candidates;
  return candidates;
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

/**
 * Which element plays which structural role only needs rediscovery when
 * something role-assignment actually reads could have changed: the skill
 * type, gross child count, or a button's text/disabled/aria-label (unlock
 * events, a relabelled command). Ticking VALUES inside an already-tagged
 * element (XP amount, progress %, ingredient count) are excluded on purpose
 * -- they are not structural, they are why this cache exists, and the CSS
 * painting those roles reads the live DOM directly, not a value this
 * function wrote. Mirrors the cheapSignature idiom InventoryRenderer already
 * uses for the same class of problem.
 */
const structureSignatures = new WeakMap();

function structureSignature(panel, type) {
  const buttonState = [...panel.querySelectorAll('button')].map(btn => {
    const disabled = (btn.disabled || btn.getAttribute('aria-disabled') === 'true') ? '1' : '0';
    return `${disabled}:${normText(btn.textContent)}:${normText(btn.getAttribute('aria-label'))}`;
  }).join('|');
  return `${type} ${panel.childElementCount} ${buttonState}`;
}

function annotateStructure(panel, type, meta) {
  const sig = structureSignature(panel, type);
  if (structureSignatures.get(panel) === sig) return;

  clearStructureRoles(panel);

  const identityLabels = (meta.labels || [meta.label]).map(label => label.toLowerCase());
  let identity = findBestText(panel, text => identityLabels.includes(textWithoutLeadingGlyph(text).toLowerCase()));
  if (!identity) {
    identity = findBestText(panel, text => {
      const clean = textWithoutLeadingGlyph(text).toLowerCase();
      return identityLabels.some(label => clean === label || clean.startsWith(`${label} `));
    });
  }
  if (!identity) {
    identity = textCandidates(panel).find(el => {
      const directText = [...el.childNodes]
        .map(node => normText(node.textContent))
        .filter(Boolean)
        .join(' ');
      const clean = textWithoutLeadingGlyph(directText).toLowerCase();
      return identityLabels.some(label => clean === label || clean.startsWith(`${label} `));
    }) || null;
  }
  if (identity) {
    const shell = outerSameTextShell(identity, panel);
    setRole(shell, 'identity');
  }

  const actionWord = (meta.titleActions || meta.actions).join('|');
  const actionTitleRe = new RegExp(`^(?:${actionWord})\\b`, 'i');
  let actionTitle = findBestText(panel, (text, el) => {
    if (!text || text.length > 90 || !actionTitleRe.test(textWithoutLeadingGlyph(text))) return false;
    if (el.closest('.iw-item-ref')) return false;
    if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
    return true;
  });
  if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), 'action-title');

  const buttons = [...panel.querySelectorAll('button')]
    .sort((a, b) => Number(isPresentationHidden(a)) - Number(isPresentationHidden(b)));

  // Audit 1.5.5 proved the visible "Lv N - X% â€¢ ... to go" widget is itself
  // a button. Mark that exact live control before any button receives chrome.
  const levelProgressButton = buttons.find(btn => LEVEL_PROGRESS_PATTERN.test(normText(btn.textContent))) || null;
  if (levelProgressButton) setRole(levelProgressButton, 'level-progress');

  let actionButton = null;
  const commandWord = meta.actions.join('|');
  const actionExact = commandWord ? new RegExp(`^(?:${commandWord})$`, 'i') : null;
  for (const btn of buttons) {
    const text = normText(btn.textContent);
    const aria = normText(btn.getAttribute('aria-label'));
    const disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    if (!actionButton && type === 'locked' && btn !== levelProgressButton && disabled && !/^(?:prev|previous|next)$/i.test(aria)) {
      actionButton = btn;
      setRole(btn, 'action-button');
      continue;
    }
    if (!actionButton && actionExact && (actionExact.test(text) || actionExact.test(aria))) {
      actionButton = btn;
      setRole(btn, 'action-button');
      continue;
    }
    if (text.length <= 2 || /^(?:prev|previous|next)$/i.test(aria)) setRole(btn, 'nav-button');
  }

  if (type === 'locked' && !actionButton) {
    const lockedControl = buttons.find(btn => {
      if (btn === levelProgressButton) return false;
      const aria = normText(btn.getAttribute('aria-label'));
      const text = normText(btn.textContent);
      return !/^(?:prev|previous|next)$/i.test(aria) && !/^[‹›<>]$/.test(text);
    }) || null;
    if (lockedControl) {
      actionButton = lockedControl;
      setRole(lockedControl, 'action-button');
    }
  }

  // Once the panel itself is positively identified as a skill, accept the
  // remaining native command button even when IdleWorlds introduces a new verb
  // (for example Jewelcrafting CRAFT or Tailoring UPGRADE). This keeps action
  // discovery resilient without broadening global skill-type detection.
  if (!actionButton && type !== 'locked') {
    const fallbackActions = buttons.filter(btn => {
      if (btn === levelProgressButton || btn.getAttribute(ROLE_ATTR) === 'nav-button') return false;
      const text = normText(btn.textContent);
      const aria = normText(btn.getAttribute('aria-label'));
      const signal = text || aria;
      if (!signal || signal.length > 32) return false;
      if (/^lv\b.*(?:%|\bxp\b|to go)/i.test(signal)) return false;
      return true;
    });
    const visibleActions = fallbackActions.filter(btn => !isPresentationHidden(btn));
    actionButton = visibleActions[visibleActions.length - 1] || fallbackActions[0] || null;
    if (actionButton) setRole(actionButton, 'action-button');
  }

  // If the skill uses a newly introduced action verb, derive the title prefix
  // from that native action control rather than requiring a hard-coded verb.
  if (!actionTitle && actionButton) {
    const actionSignal = textWithoutLeadingGlyph(
      normText(actionButton.textContent) || normText(actionButton.getAttribute('aria-label')));
    if (actionSignal && actionSignal.length <= 32) {
      const needle = actionSignal.toLowerCase();
      actionTitle = findBestText(panel, (text, el) => {
        const clean = textWithoutLeadingGlyph(text).toLowerCase();
        if (!(clean === needle || clean.startsWith(`${needle} `))) return false;
        if (el.closest('.iw-item-ref')) return false;
        if (el.matches?.(`[${ROLE_ATTR}="identity"]`) || el.closest?.(`[${ROLE_ATTR}="identity"]`)) return false;
        return true;
      });
      if (actionTitle) setRole(outerSameTextShell(actionTitle, panel), 'action-title');
    }
  }

  const navButtons = buttons.filter(btn => btn.getAttribute(ROLE_ATTR) === 'nav-button');
  navButtons.forEach((btn, index) => {
    const aria = normText(btn.getAttribute('aria-label')).toLowerCase();
    const text = normText(btn.textContent);
    const isPrev = /prev|previous/.test(aria) || /^[‹<←]$/.test(text) || (navButtons.length >= 2 && index === 0);
    btn.dataset.iwNavDirection = isPrev ? 'prev' : 'next';
  });
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

  const detail = meta.details?.length
    ? findBestText(panel, text => meta.details.some(pattern => pattern.test(text)))
    : null;
  if (detail) setRole(outerSameTextShell(detail, panel), 'action-detail');

  const { track, fill } = findProgress(panel);
  if (track) setRole(track, 'progress-track');
  if (fill) setRole(fill, 'progress-fill');

  for (const ref of panel.querySelectorAll('.iw-item-ref')) {
    const host = ref.parentElement;
    if (host && host !== panel && /\d+\s*\/\s*\d+/.test(normText(host.textContent))) setRole(host, 'ingredient');
  }

  // Opt into the rigid three-column layout only when the live React panel
  // exposes three distinct sibling zones. IdleWorlds currently wraps those
  // zones in one native grid element, while older/test DOMs place them directly
  // under .compact-panel. Supporting both avoids any React-owned reparenting.
  const identityRole = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
  const titleRole = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
  const actionRole = panel.querySelector(`[${ROLE_ATTR}="action-button"]`);
  const layoutShell = commonAncestorWithin(panel, [identityRole, titleRole, actionRole]);
  const supportedShell = layoutShell && (layoutShell === panel || layoutShell.parentElement === panel);
  const identityZone = supportedShell ? childUnder(layoutShell, identityRole) : null;
  const contentZone = supportedShell ? childUnder(layoutShell, titleRole) : null;
  const commandZone = supportedShell ? childUnder(layoutShell, actionRole) : null;
  const shellChildren = supportedShell
    ? [...layoutShell.children].filter(el => !el.classList.contains('fs-skill-header'))
    : [];

  const distinctZones = identityZone && contentZone && commandZone &&
    new Set([identityZone, contentZone, commandZone]).size === 3;

  if (distinctZones) {
    if (layoutShell !== panel) layoutShell.setAttribute(SHELL_ATTR, '1');
    identityZone.setAttribute(ZONE_ATTR, 'identity');
    contentZone.setAttribute(ZONE_ATTR, 'content');
    commandZone.setAttribute(ZONE_ATTR, 'commands');

    // Identify the native skill glyph and level text so CSS can turn the
    // existing React-owned identity branch into the visual medallion/card.
    const identityLeaves = [...identityZone.querySelectorAll('span,div,p,strong')]
      .filter(el => el.childElementCount === 0);
    const identityLevel = identityLeaves.find(el => /^(?:lv|level)\s*(?:\d+|[—–-])/i.test(normText(el.textContent))) || null;
    if (identityLevel) setRole(identityLevel, 'identity-level');

    const identityIcon = identityLeaves.find(el => {
      if (el === identity || el === identityLevel || el.closest(`[${ROLE_ATTR}="identity"]`)) return false;
      const text = normText(el.textContent);
      return text && text.length <= 4 && /[^a-z0-9]/i.test(text);
    }) || null;
    if (identityIcon) setRole(identityIcon, 'identity-icon');

    // Some skills include an extra absolutely-positioned/decorative React child
    // while others expose only the three functional branches. Ignore non-flow
    // decoration, but refuse rigid layout for an unknown visible branch.
    const functionalZones = new Set([identityZone, contentZone, commandZone]);
    const unexpectedFlowChild = shellChildren.some(el => {
      if (functionalZones.has(el)) return false;
      // Upcoming/locked cards can expose their empty native progress rail as a
      // fourth sibling instead of nesting it in the content branch. It is a
      // known presentation-only node (and is hidden in the redesigned layout),
      // so it must not make an otherwise valid three-zone card fall back.
      if (el.matches?.(`[${ROLE_ATTR}="progress-track"]`) || el.querySelector?.(`[${ROLE_ATTR}="progress-track"]`)) return false;
      try {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute' || cs.position === 'fixed') return false;
      } catch { /* fall through to rect test */ }
      const rect = el.getBoundingClientRect?.();
      return !rect || (rect.width > 2 && rect.height > 2);
    });
    if (!unexpectedFlowChild) panel.dataset.iwSkillLayout = 'three-zone';
  }

  structureSignatures.set(panel, sig);
}

function ensureSkillArtwork(panel, type) {
  const identityZone = panel.querySelector(`[${ZONE_ATTR}="identity"]`);
  if (!identityZone) return;

  let artHost = identityZone.querySelector(':scope > .fs-skill-medallion-art');
  if (!artHost || artHost.dataset.iwSkillArt !== type) {
    artHost?.remove();
    artHost = document.createElement('span');
    artHost.className = 'fs-skill-medallion-art';
    artHost.setAttribute('aria-hidden', 'true');
    artHost.dataset.iwSkillArt = type;
    identityZone.appendChild(artHost);
  }

  const paint = () => {
    if (!artHost.isConnected || !panel.isConnected) return;
    SkillsArtService.decoratePanel(panel);
    if (SkillsArtService.paintIcon(artHost, type)) artHost.dataset.iwSkillArtReady = '1';
  };

  if (SkillsArtService.isReady()) {
    paint();
  } else if (!artHost.dataset.iwSkillArtPending) {
    artHost.dataset.iwSkillArtPending = '1';
    SkillsArtService.ready().then(paint).catch(() => {}).finally(() => {
      if (artHost.isConnected) delete artHost.dataset.iwSkillArtPending;
    });
  }
}

function baseExpValue(panel) {
  const reward = panel.querySelector(`[${ROLE_ATTR}="reward"]`);
  const rewardText = normText(reward?.textContent);
  const rewardMatch = /\bxp\b/i.test(rewardText)
    ? rewardText.match(/base reward\s*:\s*\+?\s*([\d,]+)/i)
    : null;
  if (rewardMatch) return rewardMatch[1].replace(/,/g, '');

  const xpGain = panel.querySelector(`[${ROLE_ATTR}="xp-gain"]`);
  const xpMatch = normText(xpGain?.textContent).match(/^\+?\s*([\d,]+)\s*xp$/i);
  return xpMatch ? xpMatch[1].replace(/,/g, '') : '';
}

function progressPercent(panel) {
  const fill = panel.querySelector(`[${ROLE_ATTR}="progress-fill"]`);
  const width = String(fill?.style?.width || '').trim();
  if (/^\d+(?:\.\d+)?%$/.test(width)) return width;

  const track = panel.querySelector(`[${ROLE_ATTR}="progress-track"]`);
  const now = Number(track?.getAttribute('aria-valuenow'));
  const max = Number(track?.getAttribute('aria-valuemax'));
  if (Number.isFinite(now) && Number.isFinite(max) && max > 0) {
    return `${Math.max(0, Math.min(100, (now / max) * 100))}%`;
  }

  const readout = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
  const match = normText(readout?.textContent).match(/(\d+(?:\.\d+)?)%/);
  return match ? `${match[1]}%` : '';
}

/**
 * The identity column shows the completion figure as human copy, so it must be
 * rounded: the native fill width is a raw float ("69.8192%") and printing it
 * verbatim reads as noise. The progress BAR keeps the exact value — only this
 * label is rounded.
 */
function displayPercent(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return value || '';
  return `${Number(Number(match[1]).toFixed(1))}%`;
}

function centralProgressText(text) {
  const value = normText(text);
  if (!value) return '';
  return value
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?%\s*[•·]\s*/i, ' • ')
    .replace(/\s*[•·]\s*\d+(?:\.\d+)?%\s*[•·]\s*/i, ' • ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function skillActionsFrame(panel) {
  let cur = panel?.parentElement || null;
  for (let depth = 0; cur && depth < 8; depth += 1, cur = cur.parentElement) {
    const heading = cur.querySelector?.('h1,h2,h3,h4');
    if (heading && /^skill actions$/i.test(normText(heading.textContent))) return cur;
  }
  return null;
}

function ensureSkillActionsFrame(panel) {
  const frame = skillActionsFrame(panel);
  if (!frame) return;
  frame.classList.add('fs-skills-section-frame');
  const paint = () => SkillsArtService.decoratePanel(frame);
  if (SkillsArtService.isReady()) paint();
  else SkillsArtService.ready().then(paint).catch(() => {});
}

function ensureSkillPresentation(panel, meta) {
  ensureSkillActionsFrame(panel);

  const identity = panel.querySelector(`[${ROLE_ATTR}="identity"]`);
  const title = panel.querySelector(`[${ROLE_ATTR}="action-title"]`);
  const levelProgress = panel.querySelector(`[${ROLE_ATTR}="level-progress"]`);
  if (identity) {
    const nativeIdentity = textWithoutLeadingGlyph(identity.textContent);
    const aliases = meta.labels || [meta.label];
    const alias = aliases.find(label => nativeIdentity.toLowerCase() === label.toLowerCase() ||
      nativeIdentity.toLowerCase().startsWith(`${label.toLowerCase()} `));
    identity.dataset.iwCleanText = alias || (identity.childElementCount ? meta.label : nativeIdentity) || meta.label;
  }
  if (title) title.dataset.iwCleanText = textWithoutLeadingGlyph(title.textContent);
  if (levelProgress) levelProgress.dataset.iwProgressDisplay = centralProgressText(levelProgress.textContent);

  const identityZone = panel.querySelector(`[${ZONE_ATTR}="identity"]`);
  if (identityZone) {
    const percentValue = progressPercent(panel);
    let percent = identityZone.querySelector(':scope > .fs-skill-identity-percent');
    if (percentValue) {
      if (!percent) {
        percent = document.createElement('span');
        percent.className = 'fs-skill-identity-percent';
        percent.setAttribute('aria-hidden', 'true');
        identityZone.appendChild(percent);
      }
      percent.textContent = displayPercent(percentValue);
    } else {
      percent?.remove();
    }

    let progress = identityZone.querySelector(':scope > .fs-skill-identity-progress');
    if (!progress) {
      progress = document.createElement('span');
      progress.className = 'fs-skill-identity-progress';
      progress.setAttribute('aria-hidden', 'true');
      progress.innerHTML = '<span class="fs-skill-identity-progress-fill"></span>';
      identityZone.appendChild(progress);
    }
    const fill = progress.querySelector('.fs-skill-identity-progress-fill');
    if (fill) fill.style.width = percentValue || '0%';
  }

  const contentZone = panel.querySelector(`[${ZONE_ATTR}="content"]`);
  if (contentZone) {
    const amount = baseExpValue(panel);
    let plaque = contentZone.querySelector(':scope > .fs-skill-base-exp');
    if (amount) {
      if (!plaque) {
        plaque = document.createElement('span');
        plaque.className = 'fs-skill-base-exp';
        plaque.setAttribute('aria-hidden', 'true');
        contentZone.appendChild(plaque);
      }
      plaque.textContent = `Base: ${amount}`;
      plaque.dataset.iwBaseExp = amount;
    } else {
      plaque?.remove();
    }
  }
}

function applyPanelTreatment(panel, type, meta) {
  // Structure first so button styling can use semantic action/nav roles.
  annotateStructure(panel, type, meta);
  ensureSkillArtwork(panel, type, meta);
  ensureSkillPresentation(panel, meta);
  panel.querySelectorAll('button').forEach(styleButton);
  neutraliseReadouts(panel);
  neutraliseIngredients(panel);
}

const SKILL_CLASSES = Object.keys(SKILL_META).map(type => `fs-skill--${type}`);

function clearPanelInlineTreatment(panel) {
  buttonStyleOwner.restoreWithin(panel);
  readoutStyleOwner.restoreWithin(panel);
  ingredientStyleOwner.restoreWithin(panel);
  panel.querySelectorAll('[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]').forEach(el => {
    delete el.dataset.iwReadout;
    delete el.dataset.iwIngr;
    delete el.dataset.iwBtnState;
    buttonStyleSnapshots.delete(el);
    readoutStyleSnapshots.delete(el);
    ingredientStyleSnapshots.delete(el);
  });
}

function clearPanelChrome(panel) {
  structureSignatures.delete(panel);
  clearPanelInlineTreatment(panel);
  SkillsArtService.clearPanel(panel);
  panel.querySelectorAll('.fs-skill-medallion-art, .fs-skill-identity-percent, .fs-skill-identity-progress, .fs-skill-base-exp').forEach(el => el.remove());
  panel.querySelectorAll('[data-iw-clean-text], [data-iw-base-exp], [data-iw-progress-display]').forEach(el => {
    delete el.dataset.iwCleanText;
    delete el.dataset.iwBaseExp;
    delete el.dataset.iwProgressDisplay;
  });
  clearStructureRoles(panel);
  panel.classList.remove('fs-skill-panel', ...SKILL_CLASSES);
  delete panel.dataset.fsSkillLabel;
  delete panel.dataset.fsSkillRune;
  delete panel.dataset.fsSkillFlavour;
  delete panel.dataset.iwSkillGlyph;
  delete panel.dataset.iwSkill;
  // Only OUR role. This runs on every non-skill .compact-panel (bosses,
  // village, shop), and an unconditional delete stripped another module's
  // role off the same node every flush -- the card then flashed between the
  // skinned and vanilla ground as the two writers fought.
  if (panel.dataset.iwUi === 'skill-panel') delete panel.dataset.iwUi;
  panel.removeAttribute(RENDERED_ATTR);
}

function applyPanelChrome(panel, type, meta) {

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

/** Strip skill chrome and restore only the inline properties this module owns. */
export function clearSkillPanels() {
  guardEach('skill:teardown', document.querySelectorAll('.compact-panel'), clearPanelChrome);
  document.querySelectorAll('.fs-skills-section-frame').forEach(frame => {
    SkillsArtService.clearPanel(frame);
    frame.classList.remove('fs-skills-section-frame');
  });
  // Defensive cleanup for previously styled nodes that React moved outside a
  // .compact-panel before teardown.
  buttonStyleOwner.restoreAll();
  readoutStyleOwner.restoreAll();
  ingredientStyleOwner.restoreAll();
  document.querySelectorAll('[data-iw-readout], [data-iw-ingr], [data-iw-btn-state]').forEach(el => {
    delete el.dataset.iwReadout;
    delete el.dataset.iwIngr;
    delete el.dataset.iwBtnState;
  });
}

export function initSkillPanelRenderer() {
  inject('skillpanel', css);
  if (listenerBound) return;
  listenerBound = true;
  on('iw:skill-panel', e => guard('skill:panel', () => renderPanel(e.detail.panel, e.detail.skill)));
}
