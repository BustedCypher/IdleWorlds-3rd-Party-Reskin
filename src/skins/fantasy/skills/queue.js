/**
 * Fantasy action queue: the game's Current Action panel, redrawn as the
 * skin's own frame at the foot of the Skill Actions panel (Curtis,
 * 2026-10-17), with the Current Action panel itself hidden.
 *
 * The game's queue cannot be MOVED there (rule 2), so this module copies it.
 * It reads the panel's text into a small model (whether there is an
 * action to cancel, each queued row, the list's own "+N more queued"
 * toggle) and draws that model in nodes it
 * owns (`data-iw-fantasy-queue-owned` + `data-iw-fantasy-owned`). Every
 * control in the copy PRESSES the game's own button, found again at click
 * time, so what a control does stays the game's (rule 1):
 *
 *   cancel        button[aria-label="Cancel current action"]
 *   remove        the row's own button, by index, label checked
 *   +N more       the list's unlabelled toggle button, by index
 *   reorder       the game's rows are HTML5 draggable; a drop on the copy
 *                 replays dragstart / dragenter / dragover / drop / dragend
 *                 on the game's rows (UNVERIFIED live: written against the
 *                 2026-10-08 markup, see docs note in CLAUDE.md)
 *
 * The Current Action panel is hidden only while a copy was drawn from it
 * (`data-iw-fantasy-queue="mirrored"`), and the CSS shows it again whenever
 * no copy is on screen (Skill Actions collapsed, or the route has none), so
 * nothing the game shows is ever unreachable.
 *
 * The running action itself is NOT copied (Curtis, 2026-10-17): the
 * running row and its tile already carry it (the fill in skills.css). Only
 * its cancel control is, in the frame's head, because hiding the panel
 * would otherwise leave no way to cancel.
 *
 * The copy is patched in place, field by field, writing only what changed:
 * the times tick every second and a rebuild would drop focus and hover.
 */

import { guard } from '../core/Runtime.js';
import { norm, label, mark, unmark, ownerOf, removeOwned } from '../core/dom.js';
import { skillKey } from './index.js';

export const QUEUE_OWNED = 'data-iw-fantasy-queue-owned';
export const QUEUE_ATTR = 'data-iw-fantasy-queue';
const own = ownerOf(QUEUE_OWNED);
const PANEL = '#current-action-panel';
const CANCEL = 'button[aria-label="Cancel current action"]';

/** The verb a queued action starts with -> its discipline. Only verbs that
 *  name one skill; anything else draws no medallion, never a guess. */
const VERBS = {
  fight: 'combat', mine: 'mining', smelt: 'smithing', smith: 'smithing', forge: 'smithing',
  gather: 'gathering', harvest: 'gathering', forage: 'gathering', brew: 'alchemy',
  weave: 'tailoring', sew: 'tailoring', tailor: 'tailoring', chop: 'woodcutting',
  build: 'construction', enchant: 'spellcrafting', inscribe: 'spellcrafting',
};
export function verbSkill(name) {
  const word = label(name).split(/\s/)[0]?.toLowerCase() || '';
  return VERBS[word] || skillKey(word);
}

/** "1. Mine Sunforged (x5)" + "~1m 30s" -> { name, times, eta }. */
export function parseQueueRow(text, eta = '') {
  // Times and toggles keep their leading "~" / "+": norm(), never label().
  const time = norm(eta);
  let t = label(text);
  if (time && t.endsWith(time)) t = t.slice(0, -time.length).trim();
  const m = t.match(/^\d+\.\s*(.*?)(?:\s*\(x\s*([\d,]+)\))?$/i);
  return m ? { name: m[1], times: m[2] || '', eta: time } : { name: t, times: '', eta: time };
}

/** The game's panel, read. null when it is not on the page. */
export function readPanel(panel) {
  if (!panel) return null;
  const rows = [...panel.querySelectorAll('[draggable="true"]')];
  const inRow = el => rows.some(r => r.contains(el));
  const toggles = [...panel.querySelectorAll('button')].filter(b => !b.hasAttribute('aria-label') && !inRow(b) && label(b.textContent));
  return {
    cancel: !!panel.querySelector(CANCEL),
    rows: rows.map(r => {
      const p = r.querySelector('p');
      const eta = p?.querySelector('span')?.textContent || '';
      const remove = r.querySelector('button[aria-label]');
      return { ...parseQueueRow(p?.textContent || r.textContent, eta), remove: remove?.getAttribute('aria-label') || '' };
    }),
    toggles: toggles.map(b => norm(b.textContent)),
  };
}

/* ── pressing the game's own controls ─────────────────────────────────── */

const livePanel = () => document.querySelector(PANEL);

function press(find) {
  const target = find(livePanel());
  if (target && !target.disabled) target.click();
}
const gameRows = () => [...(livePanel()?.querySelectorAll('[draggable="true"]') || [])];

function replayDrag(from, to) {
  const rows = gameRows();
  const a = rows[from], b = rows[to];
  if (!a || !b || a === b) return;
  const dataTransfer = new DataTransfer();
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer }));
  fire(a, 'dragstart');
  fire(b, 'dragenter');
  fire(b, 'dragover');
  fire(b, 'drop');
  fire(a, 'dragend');
}

/* ── the frame ────────────────────────────────────────────────────────── */

const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const toggle = (el, on) => { if (el.hidden === on) el.hidden = !on; };

function button(cls, text, title, onClick) {
  const b = own('button', cls, text);
  b.type = 'button';
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', event => { event.preventDefault(); guard('queue:press', onClick); });
  return b;
}

function buildFrame() {
  const frame = own('section', 'iwf-queue');
  frame.setAttribute('aria-label', 'Action queue');
  const head = own('div', 'iwf-q-head');
  const title = own('h3', 'iwf-q-title', 'Action Queue');
  const count = own('span', 'iwf-q-count');
  const cancel = button('iwf-q-x iwf-q-cancel', '✕', 'Cancel current action', () => press(p => p?.querySelector(CANCEL)));
  head.append(title, count, cancel);
  const list = own('ol', 'iwf-q-list');
  const toggles = own('div', 'iwf-q-toggles');
  frame.append(head, list, toggles);
  frame.iwf = { count, cancel, list, toggles, drag: null };
  return frame;
}

function rowNode(frame, index) {
  const li = own('li', 'iwf-q-row');
  li.draggable = true;
  const grip = own('span', 'iwf-q-grip', '⋮⋮');
  grip.setAttribute('aria-hidden', 'true');
  const n = own('span', 'iwf-q-n');
  const icon = own('span', 'iwf-q-icon');
  icon.setAttribute('aria-hidden', 'true');
  const name = own('span', 'iwf-q-name');
  const times = own('small', 'iwf-q-times');
  const eta = own('span', 'iwf-q-eta');
  const remove = button('iwf-q-x', '✕', '', () => press(p => {
    const rows = [...(p?.querySelectorAll('[draggable="true"]') || [])];
    const want = li.dataset.remove;
    const row = rows[+li.dataset.index];
    const hit = row?.querySelector('button[aria-label]');
    // By index, but only while that row still names the same action.
    return hit?.getAttribute('aria-label') === want ? hit : rows.map(r => r.querySelector('button[aria-label]')).find(b => b?.getAttribute('aria-label') === want);
  }));
  name.append(times);
  li.append(grip, n, icon, name, eta, remove);
  li.iwf = { n, icon, name, times, eta, remove };
  li.addEventListener('dragstart', event => {
    frame.iwf.drag = +li.dataset.index;
    event.dataTransfer?.setData('text/plain', li.dataset.index);
    li.setAttribute('data-dragging', '');
  });
  li.addEventListener('dragend', () => { frame.iwf.drag = null; li.removeAttribute('data-dragging'); });
  li.addEventListener('dragover', event => { if (frame.iwf.drag != null) event.preventDefault(); });
  li.addEventListener('drop', event => {
    event.preventDefault();
    const from = frame.iwf.drag;
    frame.iwf.drag = null;
    if (from != null) guard('queue:reorder', () => replayDrag(from, +li.dataset.index));
  });
  li.dataset.index = String(index);
  return li;
}

function paint(frame, model) {
  const { count, cancel, list, toggles } = frame.iwf;
  set(count, model.rows.length ? `${model.rows.length} queued` : 'Nothing queued');
  toggle(cancel, model.cancel);

  while (list.children.length > model.rows.length) list.lastElementChild.remove();
  while (list.children.length < model.rows.length) list.append(rowNode(frame, list.children.length));
  model.rows.forEach((row, i) => {
    const li = list.children[i];
    const f = li.iwf;
    li.dataset.index = String(i);
    if (li.dataset.remove !== row.remove) li.dataset.remove = row.remove;
    set(f.n, String(i + 1));
    const key = verbSkill(row.name) || '';
    if ((li.getAttribute('data-iw-fantasy-skill') || '') !== key) {
      if (key) li.setAttribute('data-iw-fantasy-skill', key); else li.removeAttribute('data-iw-fantasy-skill');
    }
    if (f.name.firstChild?.nodeType !== 3) f.name.prepend(document.createTextNode(''));
    if (f.name.firstChild.data !== row.name) f.name.firstChild.data = row.name;
    set(f.times, row.times ? `×${row.times}` : '');
    set(f.eta, row.eta);
    if (f.remove.title !== row.remove) { f.remove.title = row.remove; f.remove.setAttribute('aria-label', row.remove || 'Remove'); }
    toggle(f.remove, !!row.remove);
  });

  while (toggles.children.length > model.toggles.length) toggles.lastElementChild.remove();
  model.toggles.forEach((text, i) => {
    let b = toggles.children[i];
    if (!b) {
      b = button('iwf-q-more', '', '', () => press(p => [...(p?.querySelectorAll('button') || [])]
        .filter(x => !x.hasAttribute('aria-label') && !x.closest('[draggable="true"]') && label(x.textContent))[i]));
      toggles.append(b);
    }
    set(b, text);
  });
  toggle(toggles, model.toggles.length > 0);
}

/* ── pass ─────────────────────────────────────────────────────────────── */

/** One frame per Skill Actions panel, right after its sheet. */
export function queuePass() {
  const panel = livePanel();
  const model = readPanel(panel);
  const sheets = model ? [...document.querySelectorAll('.iw-skill-sheet')] : [];
  const hosts = new Set();
  for (const sheet of sheets) {
    let frame = sheet.parentElement.querySelector(`:scope > .iwf-queue[${QUEUE_OWNED}]`);
    if (!frame) frame = buildFrame();
    // React may re-create the sheet before our frame; keep the frame after it.
    if (sheet.nextElementSibling !== frame) sheet.after(frame);
    hosts.add(frame);
  }
  for (const stale of document.querySelectorAll(`.iwf-queue[${QUEUE_OWNED}]`)) if (!hosts.has(stale)) stale.remove();
  // paint() writes only the fields that changed.
  for (const frame of hosts) paint(frame, model);
  for (const p of document.querySelectorAll(PANEL)) mark(p, QUEUE_ATTR, hosts.size ? 'mirrored' : null);
}

/** Text ticks inside the Current Action panel: the queued rows' times. */
export function queueText(parents) {
  if (parents.some(p => p.closest?.(PANEL))) guard('queue:text', queuePass);
}

export function clearQueue() {
  removeOwned(QUEUE_OWNED);
  unmark([QUEUE_ATTR]);
}
