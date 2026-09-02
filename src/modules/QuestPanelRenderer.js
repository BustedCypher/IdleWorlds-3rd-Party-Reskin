/**
 * QuestPanelRenderer
 *
 * Quest cards on IdleWorlds are `.compact-panel` elements, so DOMWatcher
 * already dispatches `iw:skill-panel` for every one of them (with
 * `skill: 'unknown'`, which SkillPanelRenderer ignores). This module listens
 * to the same event, positively identifies quest cards from their content
 * (a "Reward:" line plus a Turn In / Skip control or "% complete" readout),
 * and gives them the same forged three-zone frame the skill cards use — by
 * attaching semantic role attributes and a few skin-owned decoration nodes.
 *
 * Presentation only. React keeps every gameplay node, its text and its
 * handlers. Nothing is reparented; every attribute and appended element is
 * removed by clearQuestPanels().
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { guard, guardEach } from './Runtime.js';
import { SkillsArtService } from './SkillsArtService.js';
import { AtlasService } from './AtlasService.js';
import { ItemDatabase } from './ItemDatabase.js';
import css from '../styles/skillpanel.css';

const RENDERED_ATTR = 'data-fs-quest';
const ROLE_ATTR = 'data-iw-quest-role';
const ZONE_ATTR = 'data-iw-quest-zone';
const STATE_ATTR = 'data-iw-quest-state';
const PANEL_CLASS = 'fs-quest-panel';

let listenerBound = false;
const structureSignatures = new WeakMap();

// Reward text carries the discipline the quest feeds ("+1350 combat XP"); the
// skin borrows the matching skill accent + glyph so quests read as part of the
// same family. A gold-only bounty with no XP reward falls through to generic.
const DISCIPLINE_STYLE = [
  [/\bcombat\b/i,        { accent: '#B84A20', glyph: '⚔' }],
  [/\bmining\b/i,        { accent: '#84919B', glyph: '⛏' }],
  [/\bsmithing\b/i,      { accent: '#B28A2A', glyph: '⚒' }],
  [/\bgathering\b/i,     { accent: '#579A5D', glyph: '❧' }],
  [/\balchemy\b/i,       { accent: '#9271B2', glyph: '⚗' }],
  [/\bjewel(?:crafting)?\b/i,  { accent: '#4E9FB8', glyph: '◆' }],
  [/\bspell(?:crafting)?\b/i,  { accent: '#8B6FC3', glyph: '✧' }],
  [/\btailoring\b/i,     { accent: '#A56E86', glyph: '⋈' }],
  [/\bwood(?:cutting)?\b/i, { accent: '#8B6A3A', glyph: '⋔' }],
  [/\bconstruction\b/i,  { accent: '#5F7F72', glyph: '⌂' }],
  [/\bcrafting\b/i,      { accent: '#5E8FB7', glyph: '✦' }],
  [/\bfishing\b/i,       { accent: '#478FA8', glyph: '⌁' }],
];
const GENERIC_STYLE = { accent: '#C9A66A', glyph: '❖' };

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textLeaves(root) {
  return [...root.querySelectorAll('p,span,div,strong,em,h1,h2,h3,h4')]
    .filter(el => !el.closest('button,a,[role="button"],.fs-quest-sigil'))
    .filter(el => {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && normText(n.textContent));
      return own && normText(el.textContent).length <= 220;
    });
}

function questButtons(card) {
  const all = [...card.querySelectorAll('button,[role="button"]')];
  let turnIn = null;
  let skip = null;
  for (const btn of all) {
    const label = normText(btn.textContent) || normText(btn.getAttribute('aria-label'));
    if (!turnIn && /turn\s*in/i.test(label)) turnIn = btn;
    else if (!skip && /^skip\b/i.test(label)) skip = btn;
  }
  return { turnIn, skip, all };
}

/** A quest card is a compact-panel that offers a reward AND a turn-in / skip
 *  control or a "% complete" readout. Deliberately strict so boss / village /
 *  shop compact-panels are never claimed. */
function isQuestCard(card) {
  if (!card || !card.classList?.contains('compact-panel')) return false;
  if (card.classList.contains('fs-skill-panel')) return false;
  // Cheap gate first so a flush over the skill / boss / village compact-panels
  // does not pay for the leaf sweep below. Skill panels say "Base reward:" but
  // never "Turn In" or "% complete".
  const bulk = card.textContent || '';
  if (!/\bturn\s*in\b/i.test(bulk) && !/\d+%\s*complete\b/i.test(bulk)) return false;
  const leaves = textLeaves(card);
  const hasReward = leaves.some(el => /^reward\s*:/i.test(normText(el.textContent)));
  if (!hasReward) return false;
  const { turnIn, skip } = questButtons(card);
  const hasPercent = leaves.some(el => /\d+%\s*complete\b/i.test(normText(el.textContent)));
  return !!(turnIn || skip || hasPercent);
}

function findProgress(card) {
  for (const el of card.querySelectorAll('div')) {
    if (el.children.length !== 1) continue;
    const fill = el.firstElementChild;
    const width = String(fill?.style?.width || '').trim();
    if (!/%$/.test(width)) continue;
    const cls = `${el.className || ''} ${fill.className || ''}`;
    if (!/rounded-full|progress|bg-white\/10|bg-white\/5|\bh-1(?:\.5)?\b|\bh-2\b/i.test(cls)) continue;
    if (el.closest('button,a,[role="button"]')) continue;
    return { track: el, fill };
  }
  return { track: null, fill: null };
}

function setRole(el, role) {
  if (el && el.getAttribute(ROLE_ATTR) !== role) el.setAttribute(ROLE_ATTR, role);
  return el;
}

function setZone(el, zone) {
  if (el && el.getAttribute(ZONE_ATTR) !== zone) el.setAttribute(ZONE_ATTR, zone);
  return el;
}

function clearRoles(card) {
  card.querySelectorAll(`[${ROLE_ATTR}],[${ZONE_ATTR}]`).forEach(el => {
    el.removeAttribute(ROLE_ATTR);
    el.removeAttribute(ZONE_ATTR);
  });
}

/**
 * annotateStructure() only needs to re-run when something that decides which
 * node plays which role could have changed: the button set / disabled state,
 * or the number of text lines. It must NOT re-run on a pure value tick -- the
 * objective count climbing, the progress percentage, or the Skip countdown --
 * so the Skip label is compared with its "(n)" timer stripped. Mirrors
 * SkillPanelRenderer.structureSignature / InventoryRenderer.cheapSignature.
 */
function structureSignature(card) {
  const { turnIn, skip } = questButtons(card);
  const btn = [turnIn, skip].filter(Boolean).map(b => {
    const disabled = (b.disabled || b.getAttribute('aria-disabled') === 'true') ? '1' : '0';
    const label = normText(b.textContent).replace(/\s*\(\d+\)\s*$/, '');
    return `${disabled}:${label}`;
  }).join('|');
  return `${textLeaves(card).length}|${btn}|${findProgress(card).track ? 't' : '-'}`;
}

function disciplineStyle(rewardText) {
  for (const [re, style] of DISCIPLINE_STYLE) if (re.test(rewardText)) return style;
  return GENERIC_STYLE;
}

/**
 * The item the objective is counting: "💠 Night Claw 22/100" -> "Night Claw".
 * Strips the leading glyph/emoji and the trailing "N/M" progress fraction.
 * Returns the ItemDatabase record when the name is known so the sigil can
 * borrow its real icon and the objective line can open a tooltip.
 */
function objectiveItemRef(card) {
  const el = card.querySelector(`[${ROLE_ATTR}="objective"]`);
  if (!el) return null;
  const name = normText(el.textContent)
    .replace(/^[^A-Za-z]+/, '')
    .replace(/\s+[\d,]+\s*\/\s*[\d,]+.*$/, '')
    .trim();
  if (name.length < 2) return { el, name: '', item: null, id: null };
  const item = ItemDatabase.getByName(name);
  return { el, name, item, id: item && item.item_id != null ? String(item.item_id) : null };
}

const TRIGGER_ATTRS = ['data-iw-item', 'data-iw-item-name', 'data-iw-tooltip-trigger',
  'tabindex', 'aria-haspopup', 'aria-controls', 'aria-expanded'];

function clearObjectiveTrigger(el) {
  if (!el) return;
  for (const attr of TRIGGER_ATTRS) el.removeAttribute(attr);
}

/**
 * Make the whole objective line an item-tooltip trigger — attributes only, no
 * wrapper element and no text change, so React keeps ownership of the node.
 * TooltipEngine's delegated listeners pick it up via
 * `[data-iw-tooltip-trigger="1"][data-iw-item*]`.
 */
function ensureObjectiveTrigger(ref) {
  if (!ref || !ref.el) return;
  const el = ref.el;
  if (!ref.item) { clearObjectiveTrigger(el); return; }

  if (ref.id) {
    if (el.getAttribute('data-iw-item') !== ref.id) el.setAttribute('data-iw-item', ref.id);
    el.removeAttribute('data-iw-item-name');
  } else {
    if (el.getAttribute('data-iw-item-name') !== ref.name) el.setAttribute('data-iw-item-name', ref.name);
    el.removeAttribute('data-iw-item');
  }
  if (el.dataset.iwTooltipTrigger !== '1') el.dataset.iwTooltipTrigger = '1';
  if (el.getAttribute('tabindex') !== '0') el.setAttribute('tabindex', '0');
  if (el.getAttribute('aria-haspopup') !== 'dialog') el.setAttribute('aria-haspopup', 'dialog');
  if (el.getAttribute('aria-controls') !== 'iw-tip') el.setAttribute('aria-controls', 'iw-tip');
  if (!el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', 'false');
}

function annotateStructure(card) {
  const sig = structureSignature(card);
  if (structureSignatures.get(card) === sig) return;

  clearRoles(card);

  const leaves = textLeaves(card);
  const reward = leaves.find(el => /^reward\s*:/i.test(normText(el.textContent))) || null;
  const objective = leaves.find(el =>
    /\d+\s*\/\s*\d+/.test(normText(el.textContent)) &&
    !/^reward\s*:/i.test(normText(el.textContent)) &&
    !/%\s*complete\b/i.test(normText(el.textContent))) || null;
  const progressLabel = leaves.find(el => /\d+%\s*complete\b/i.test(normText(el.textContent))) || null;

  // The title/brief live in the same column as the reward line. Everything in
  // that column that is not the objective / reward, in document order: first
  // is the title, the rest are the brief (a bounty has one brief line; a work
  // order leads with a short kicker then an emphasized instruction).
  const column = reward?.parentElement || objective?.parentElement || card;
  const columnLeaves = leaves.filter(el => column.contains(el) && el !== reward && el !== objective && el !== progressLabel);
  columnLeaves.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

  // A work order leads with a short discipline kicker ("Tailoring Work Order")
  // above an emphasized instruction; a bounty leads straight with its name.
  let cursor = 0;
  if (columnLeaves.length >= 2 && /\bwork order\b/i.test(normText(columnLeaves[0].textContent))) {
    setRole(columnLeaves[0], 'kicker');
    cursor = 1;
  }
  const title = columnLeaves[cursor] || null;
  const briefs = columnLeaves.slice(cursor + 1);

  if (title) setRole(title, 'title');
  briefs.forEach(el => setRole(el, 'brief'));
  if (objective) setRole(objective, 'objective');
  if (reward) {
    setRole(reward, 'reward');
    reward.dataset.iwQuestReward = normText(reward.textContent).replace(/^reward\s*:\s*/i, '');
  }
  if (progressLabel) {
    setRole(progressLabel, 'progress-label');
    progressLabel.dataset.iwQuestPercent = (normText(progressLabel.textContent).match(/(\d+)%/) || [, ''])[1];
  }

  const { track, fill } = findProgress(card);
  if (track) setRole(track, 'progress-track');
  if (fill) setRole(fill, 'progress-fill');

  const { turnIn, skip } = questButtons(card);
  if (turnIn) setRole(turnIn, 'turn-in');
  if (skip) setRole(skip, 'skip');

  const commandHost = (turnIn || skip)?.parentElement || null;
  if (commandHost && commandHost !== card) setZone(commandHost, 'commands');

  // The content column and the row that pairs it with the command rail.
  if (column && column !== card) setZone(column, 'content');
  const row = column && commandHost && column !== commandHost
    ? commonAncestor(card, column, commandHost)
    : null;
  if (row && row !== card) setZone(row, 'row');
  const body = row?.parentElement && card.contains(row.parentElement) && row.parentElement !== card
    ? row.parentElement
    : (card.firstElementChild && card.firstElementChild.contains(row || column) ? card.firstElementChild : null);
  if (body && body !== card) setZone(body, 'body');

  structureSignatures.set(card, sig);
}

function commonAncestor(scope, a, b) {
  let cur = a;
  while (cur && cur !== scope) {
    if (cur.contains(b)) return cur;
    cur = cur.parentElement;
  }
  return scope;
}

function ensureDecoration(card, style, ref) {
  const body = card.querySelector(`[${ZONE_ATTR}="body"]`) || card.firstElementChild || card;

  let sigil = body.querySelector(':scope > .fs-quest-sigil');
  if (!sigil) {
    sigil = document.createElement('span');
    sigil.className = 'fs-quest-sigil';
    sigil.setAttribute('aria-hidden', 'true');
    body.insertBefore(sigil, body.firstChild);
  }
  if (sigil.dataset.iwQuestGlyph !== style.glyph) sigil.dataset.iwQuestGlyph = style.glyph;

  // Paint the objective item's real icon into the medallion; the discipline
  // glyph stays as the fallback when the item has no sprite / isn't loaded yet.
  let icon = sigil.querySelector(':scope > .fs-quest-sigil-icon');
  if (ref && ref.name && AtlasService.isReady()) {
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'fs-quest-sigil-icon';
      icon.setAttribute('aria-hidden', 'true');
      sigil.appendChild(icon);
    }
    if (AtlasService.paint(icon, { id: ref.id, name: ref.name })) {
      if (sigil.dataset.iwQuestIcon !== '1') sigil.dataset.iwQuestIcon = '1';
    } else {
      icon.remove();
      delete sigil.dataset.iwQuestIcon;
    }
  } else {
    icon?.remove();
    delete sigil.dataset.iwQuestIcon;
    if (ref && ref.name && !AtlasService.isReady() && !card.dataset.iwQuestIconPending) {
      card.dataset.iwQuestIconPending = '1';
      AtlasService.ready()
        .then(() => { if (card.isConnected) renderCard(card); })
        .catch(() => {})
        .finally(() => { if (card.isConnected) delete card.dataset.iwQuestIconPending; });
    }
  }

  const pct = card.querySelector(`[${ROLE_ATTR}="progress-label"]`)?.dataset.iwQuestPercent
    || (card.querySelector(`[${ROLE_ATTR}="progress-fill"]`)?.style?.width || '').replace('%', '')
    || '';
  let ring = sigil.querySelector(':scope > .fs-quest-sigil-pct');
  if (pct) {
    if (!ring) {
      ring = document.createElement('span');
      ring.className = 'fs-quest-sigil-pct';
      sigil.appendChild(ring);
    }
    const label = `${pct}%`;
    if (ring.textContent !== label) ring.textContent = label;
  } else {
    ring?.remove();
  }
}

function ensureAtlas(card) {
  const paint = () => {
    if (!card.isConnected) return;
    SkillsArtService.decoratePanel(card);
  };
  if (SkillsArtService.isReady()) paint();
  else if (!card.dataset.iwQuestArtPending) {
    card.dataset.iwQuestArtPending = '1';
    SkillsArtService.ready().then(paint).catch(() => {}).finally(() => {
      if (card.isConnected) delete card.dataset.iwQuestArtPending;
    });
  }
}

function questState(card) {
  const { turnIn, skip } = questButtons(card);
  const ready = turnIn && !(turnIn.disabled || turnIn.getAttribute('aria-disabled') === 'true');
  if (ready) return 'ready';
  if (skip) return 'work-order';
  return 'active';
}

function renderCard(card) {
  if (!card || !card.isConnected) return;

  if (!isQuestCard(card)) {
    if (card.classList.contains(PANEL_CLASS)) clearCard(card);
    return;
  }

  annotateStructure(card);

  const rewardText = normText(card.querySelector(`[${ROLE_ATTR}="reward"]`)?.textContent);
  const style = disciplineStyle(rewardText);
  const ref = objectiveItemRef(card);

  if (!card.classList.contains(PANEL_CLASS)) card.classList.add(PANEL_CLASS);
  if (card.style.getPropertyValue('--fs-quest-accent') !== style.accent) {
    card.style.setProperty('--fs-quest-accent', style.accent);
  }
  const state = questState(card);
  if (card.getAttribute(STATE_ATTR) !== state) card.setAttribute(STATE_ATTR, state);
  if (card.getAttribute(RENDERED_ATTR) !== '1') card.setAttribute(RENDERED_ATTR, '1');

  ensureObjectiveTrigger(ref);
  ensureDecoration(card, style, ref);
  ensureAtlas(card);
}

function clearCard(card) {
  structureSignatures.delete(card);
  clearObjectiveTrigger(card.querySelector(`[${ROLE_ATTR}="objective"]`));
  clearRoles(card);
  card.querySelectorAll('.fs-quest-sigil, .fs-quest-sigil-pct, .fs-quest-sigil-icon').forEach(el => el.remove());
  card.querySelectorAll('[data-iw-quest-reward], [data-iw-quest-percent]').forEach(el => {
    delete el.dataset.iwQuestReward;
    delete el.dataset.iwQuestPercent;
  });
  card.classList.remove(PANEL_CLASS);
  card.style.removeProperty('--fs-quest-accent');
  card.removeAttribute(STATE_ATTR);
  card.removeAttribute(RENDERED_ATTR);
  delete card.dataset.iwQuestGlyph;
  delete card.dataset.iwQuestArtPending;
  delete card.dataset.iwQuestIconPending;
  SkillsArtService.clearPanel(card);
}

/** Strip quest chrome from every card the module has touched. */
export function clearQuestPanels() {
  guardEach('quest:teardown', document.querySelectorAll(`.${PANEL_CLASS}`), clearCard);
}

export function initQuestPanelRenderer() {
  inject('skillpanel', css);
  if (listenerBound) return;
  listenerBound = true;
  on('iw:skill-panel', e => guard('quest:panel', () => renderCard(e.detail.panel)));
}
