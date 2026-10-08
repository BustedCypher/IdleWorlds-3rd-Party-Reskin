/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * RaidLeaderboards.js — the raid leaderboard, moved off the Guild tab and
 * onto the Leaderboards route (Curtis, 2026-10-08), plus the shared data the
 * Guild lobby's record times read.
 *
 * DATA. `GET /api/guild/raid/leaderboard` (the game's own read, chunk 8577)
 * returns `{ leaderboard: { [bossKey]: { easy|normal|hard: [entry] } } }`,
 * entry `{ sessionId, guildName, isTestGuild?, isPickup?, elapsedMs |
 * elapsedSec }`, already ranked. One read serves every boss and difficulty.
 * It is fetched from this ISOLATED world, so the league header the page's
 * patched fetch would add is stamped here (same trap as VillageScene). Cached
 * for a minute; a failed read keeps the last board.
 *
 * THE PANEL is the skin's own `<section>` (`data-iw-raid-lb`), placed right
 * after the game's Leaderboards panel (`target.after`, rule 2) in the rendered
 * column. Boss and difficulty tabs are the skin's own buttons; the rows are
 * text. It is a section frame (`data-iw-ui`, no `.panel` class, like the
 * Village scene), so it wears the panel frame every route panel wears. Its
 * tabs ride the standard compact plate (CompactButtons).
 */

import { isRuntimeActive } from './Runtime.js';
import { pickRendered, getLayoutEpoch } from './Viewport.js';

const OWNED = 'data-iw-raid-lb';
const TTL_MS = 60_000;
const RETRY_MS = 20_000;

/** The game's `lQ`: easy is Practice. `test` reads a difficulty pill's label. */
export const DIFFICULTY_KEYS = [
  { key: 'easy', label: 'Practice', test: /^practice\b/i },
  { key: 'normal', label: 'Normal', test: /^normal\b/i },
  { key: 'hard', label: 'Hard', test: /^hard\b/i },
];
const BOSS_ORDER = ['ashmaw', 'thessaly', 'morwenna', 'grimjaw', 'skarth'];

/** "Ashmaw, the Cinder Tyrant" / "🐉 Ashmaw, …" -> "ashmaw". */
export function bossKeyOf(name) {
  const m = /^[^\p{L}]*(\p{L}+)/u.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

/** The game's own `m:ss.cc` (chunk 9811 `F`). */
export function formatRaidTime(entry) {
  const ms = entry?.elapsedMs ?? (entry?.elapsedSec != null ? entry.elapsedSec * 1000 : null);
  if (ms == null || !Number.isFinite(+ms)) return '—';
  const cs = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

const titleCase = key => key.charAt(0).toUpperCase() + key.slice(1);
const leagueOf = path => (/^\/ssf(?:\/|$)/.test(path) ? 'ssf' : 'standard');

let board = null;
let nextRead = 0;
let request = null;
const listeners = new Set();

export function raidBoard() {
  return board;
}

/** Read the board unless fresh; `onUpdate` runs when a new board lands. */
export function refreshRaidBoard(onUpdate) {
  if (onUpdate) listeners.add(onUpdate);
  if (request || Date.now() < nextRead || document.visibilityState === 'hidden') return;
  const controller = new AbortController();
  request = controller;
  nextRead = Date.now() + TTL_MS;
  const timeout = setTimeout(() => controller.abort(), 10_000);
  fetch('/api/guild/raid/leaderboard', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    headers: { 'x-idleworlds-league': leagueOf(location.pathname) },
  })
    .then(response => (response.ok ? response.json() : Promise.reject(new Error('leaderboard unavailable'))))
    .then(data => {
      if (!isRuntimeActive() || !data || typeof data.leaderboard !== 'object') return;
      board = data.leaderboard || {};
      for (const fn of [...listeners]) fn();
    })
    .catch(() => { nextRead = Date.now() + RETRY_MS; })
    .finally(() => { clearTimeout(timeout); if (request === controller) request = null; });
}

/* -------------------------------------------- the Leaderboards panel -- */

let panel = null;
let anchor = null;
let anchorEpoch = -1;
let chosenBoss = null;
let chosenDiff = 'normal';
let signature = '';

function own(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.setAttribute(OWNED, '1');
  if (text != null) el.textContent = text;
  return el;
}

function onLeaderboards() {
  return /^\/(?:ssf\/)?leaderboards\/?$/.test(location.pathname);
}

function findAnchor() {
  if (anchor?.isConnected && anchorEpoch === getLayoutEpoch()) return anchor;
  const headings = [...document.querySelectorAll('.panel h2')].filter(h =>
    !h.closest(`[${OWNED}], [role="dialog"], [data-iw-overlay]`)
    && /^leaderboards$/i.test(h.textContent.replace(/^[^\p{L}]+/u, '').trim()));
  anchor = pickRendered(headings.map(h => h.closest('.panel')).filter(Boolean));
  anchorEpoch = getLayoutEpoch();
  return anchor;
}

function bossKeys() {
  const keys = Object.keys(board || {});
  return [...BOSS_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !BOSS_ORDER.includes(k)).sort()];
}

function tab(text, pressed, onClick, kind) {
  const button = own('button', 'iw-raid-lb-tab', text);
  button.type = 'button';
  button.dataset.iwRaidLbTab = kind;
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', event => { event.preventDefault(); onClick(); render(true); });
  return button;
}

function render(force = false) {
  if (!panel) return;
  const keys = bossKeys();
  if (!chosenBoss || !keys.includes(chosenBoss)) chosenBoss = keys[0] || null;
  const entries = (chosenBoss && board?.[chosenBoss]?.[chosenDiff]) || [];
  const sig = JSON.stringify([!!board, keys, chosenBoss, chosenDiff, entries.slice(0, 10).map(e => [e.sessionId, e.guildName, e.elapsedMs, e.elapsedSec, e.isPickup, e.isTestGuild])]);
  if (!force && sig === signature) return;
  signature = sig;
  const body = panel.querySelector('.iw-raid-lb-body');
  const kids = [];
  if (!board) {
    kids.push(own('p', 'iw-raid-lb-note', 'Loading raid leaderboard…'));
  } else if (!keys.length) {
    kids.push(own('p', 'iw-raid-lb-note', 'No raid has been cleared yet.'));
  } else {
    const bossTabs = own('div', 'iw-raid-lb-tabs');
    bossTabs.dataset.iwRaidLbRow = 'boss';
    bossTabs.append(...keys.map(k => tab(titleCase(k), k === chosenBoss, () => { chosenBoss = k; }, 'boss')));
    const diffTabs = own('div', 'iw-raid-lb-tabs');
    diffTabs.dataset.iwRaidLbRow = 'difficulty';
    diffTabs.append(...DIFFICULTY_KEYS.map(d => tab(d.label, d.key === chosenDiff, () => { chosenDiff = d.key; }, 'difficulty')));
    kids.push(bossTabs, diffTabs);
    const label = DIFFICULTY_KEYS.find(d => d.key === chosenDiff)?.label || chosenDiff;
    if (!entries.length) {
      kids.push(own('p', 'iw-raid-lb-note', `No guild has defeated ${titleCase(chosenBoss)} on ${label} yet.`));
    } else {
      const list = own('ol', 'iw-raid-lb-list');
      entries.slice(0, 10).forEach((entry, i) => {
        const row = own('li', 'iw-raid-lb-row');
        row.dataset.iwRaidLbRank = String(i + 1);
        const name = own('span', 'iw-raid-lb-name');
        name.append(own('span', 'iw-raid-lb-rank', `#${i + 1}`), own('span', 'iw-raid-lb-guild', entry.guildName || 'Unknown'));
        if (entry.isPickup) name.append(own('span', 'iw-raid-lb-tag', 'pickup'));
        if (entry.isTestGuild) name.append(own('span', 'iw-raid-lb-tag', 'test'));
        row.append(name, own('span', 'iw-raid-lb-time', formatRaidTime(entry)));
        list.append(row);
      });
      kids.push(list);
    }
  }
  body.replaceChildren(...kids);
}

/** Every classify pass: mount, place or remove the panel; read the board. */
export function reconcileRaidLeaderboards() {
  if (!isRuntimeActive()) return;
  const target = onLeaderboards() ? findAnchor() : null;
  if (!target) {
    panel?.remove();
    panel = null;
    signature = '';
    return;
  }
  if (!panel?.isConnected || panel.previousElementSibling !== target) {
    panel?.remove();
    panel = own('section', 'iw-raid-lb');
    panel.dataset.iwUi = 'section-frame';
    panel.dataset.iwPanel = 'raid-leaderboard';
    panel.setAttribute('aria-label', 'Raid leaderboards');
    const head = own('div', 'iw-raid-lb-head');
    const h2 = own('h2', 'iw-raid-lb-title', '⚔️ Raid Leaderboards');
    h2.dataset.iwUi = 'section-title';
    head.append(h2, own('span', 'iw-raid-lb-sub', 'Fastest clears'));
    panel.append(head, own('div', 'iw-raid-lb-body'));
    target.after(panel);
    signature = '';
  }
  render();
  refreshRaidBoard(() => render());
}

export function clearRaidLeaderboards() {
  panel?.remove();
  panel = null;
  anchor = null;
  signature = '';
  document.querySelectorAll(`[${OWNED}]`).forEach(node => node.remove());
}
