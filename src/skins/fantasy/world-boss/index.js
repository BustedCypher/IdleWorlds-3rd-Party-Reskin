/** Ironbound art over native world bosses. No game nodes, handlers or state are replaced. */
import { mark, unmark, ownerOf, removeOwned, norm, label } from '../core/dom.js';
import { inject, remove } from '../core/StyleInjector.js';
import { nativeFeatures } from '../core/NativeFeatures.js';
import css from '../styles/world-boss.css';

const CARD = 'data-iw-fantasy-world-boss';
const NAME = 'data-iw-fantasy-world-name';
const WRAP = 'data-iw-fantasy-world-action-wrap';
const STATE = 'data-iw-fantasy-world-state';
const LABEL = 'data-iw-fantasy-world-label';
const SOURCE = 'data-iw-fantasy-world-status-source';
const OWNED = 'data-iw-fantasy-world-owned';
const ATTRS = [CARD, NAME, WRAP, STATE, LABEL, SOURCE];
const BOSSES = { ancient_treant: 'Ancient Treant', abyssal_behemoth: 'Abyssal Behemoth', world_eater: 'World Eater' };
const tracked = new Map();
const timerSignatures = new WeakMap();
const own = ownerOf(OWNED);

function release(node) { for (const attr of ATTRS) mark(node, attr, null); }
function clear(card) {
  for (const node of tracked.get(card) || []) release(node);
  removeOwned(OWNED, card);
  tracked.delete(card);
}

function timerLine(text) {
  let match = /^Respawns\s+(.+?)(?:\s+left)?$/i.exec(text);
  if (match) return ['Next appearance', match[1], false];
  match = /^Buff active\s+(.+?)(?:\s+left)?$/i.exec(text);
  if (match) return ['Your active buff', match[1], true];
  if (/^No world buff\b/i.test(text)) return ['World buff', text, false];
  return null;
}

function timers(card, status, nodes) {
  const lines = status ? [...status.querySelectorAll('p')] : [];
  const values = lines.map(line => timerLine(norm(line.textContent)));
  let view = card.querySelector(`.iwf-wb-timers[${OWNED}]`);
  // Never hide an unrecognised sentence, a roster, or an interactive native row.
  if (!lines.length || values.some(value => !value) || status.querySelector('button,a,input,select,details')) {
    mark(status, SOURCE, null);
    view?.remove();
    return;
  }
  nodes.add(status);
  mark(status, SOURCE, '1');
  if (!view) {
    view = own('div', 'iwf-wb-timers');
    card.append(view);
  }
  const signature = JSON.stringify(values);
  if (timerSignatures.get(view) === signature) return;
  const rows = values.map(([caption, value, active], index) => {
    const row = own('div', 'iwf-wb-timer');
    row.title = norm(lines[index].textContent);
    row.append(own('span', 'iwf-wb-timer-label', caption),
      own('span', `iwf-wb-timer-value${active ? ' iwf-wb-timer-active' : ''}`, value));
    return row;
  });
  view.replaceChildren(...rows);
  timerSignatures.set(view, signature);
}

function decorate(card) {
  const key = card.getAttribute('data-iw-encounter');
  const header = card.querySelector(':scope > [data-iw-boss-role="header"]');
  const title = header?.querySelector('[data-iw-boss-role="title"]');
  const name = title?.parentElement;
  const action = header?.querySelector('[data-iw-boss-role="action"]');
  if (!BOSSES[key] || label(title?.textContent) !== BOSSES[key] || !action || name === header) {
    if (tracked.has(card)) clear(card);
    return;
  }
  let wrap = action;
  while (wrap.parentElement && wrap.parentElement !== header) wrap = wrap.parentElement;
  if (wrap === name) { if (tracked.has(card)) clear(card); return; }
  const nodes = new Set([card, name, wrap, action]);
  mark(card, CARD, key);
  mark(name, NAME, '1');
  mark(wrap, WRAP, '1');
  const text = norm(action.textContent);
  const state = /\bfighting\b|\bin combat\b|\battacking\b/i.test(text) ? 'fighting'
    : /\bprejoined\b/i.test(text) ? 'prejoined'
      : /\b(?:prejoin|join|fight)\b/i.test(text) ? 'join' : 'idle';
  mark(action, STATE, state);
  mark(action, LABEL, { join: 'Join', prejoined: 'Prejoined', fighting: 'In Combat' }[state] || null);
  if (!card.querySelector(`.iwf-wb-art[${OWNED}]`)) {
    const art = own('div', 'iwf-wb-art');
    art.setAttribute('aria-hidden', 'true');
    card.append(art);
  }
  timers(card, card.querySelector(':scope > [data-iw-boss-role="status"]'), nodes);
  for (const node of tracked.get(card) || []) if (!nodes.has(node)) release(node);
  tracked.set(card, nodes);
}

function stylesheet() {
  if (tracked.size) inject('world-boss', css);
  else remove('world-boss');
}

export function worldBossPass() {
  if (nativeFeatures().has('worldBossCards')) { clearWorldBosses(); return; }
  const present = new Set([...document.querySelectorAll('[data-iw-encounter]')]
    .filter(card => Object.hasOwn(BOSSES, card.getAttribute('data-iw-encounter'))));
  for (const card of tracked.keys()) if (!present.has(card)) clear(card);
  for (const card of present) decorate(card);
  stylesheet();
}

/** Native countdowns and button labels can change without structural mutations. */
export function worldBossText(parents) {
  if (nativeFeatures().has('worldBossCards')) { clearWorldBosses(); return; }
  const cards = new Set(parents.map(parent => parent.closest?.(`[${CARD}]`)).filter(Boolean));
  if (!cards.size) return;
  for (const card of cards) decorate(card);
  stylesheet();
}

export function clearWorldBosses() {
  for (const card of [...tracked.keys()]) clear(card);
  unmark(ATTRS);
  remove('world-boss');
}
