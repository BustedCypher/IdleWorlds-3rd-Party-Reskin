/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * GuildLobby.js — the raid lobby's layout, the record times and the
 * ready-check pop-up (Curtis, 2026-10-08).
 *
 *   - The Leaderboard card is hidden here; it lives on the Leaderboards
 *     route instead (RaidLeaderboards.js). Each difficulty pill shows its
 *     record time underneath, from the same data.
 *   - "My raid history" moves to the foot of the page; Group Chat takes the
 *     leaderboard's place under the boss card.
 *   - Pre-raid prep is a half column with Raid Loadout merged under it.
 *   - The invite card(s) and Members read as ONE frame: invite title, the
 *     display-name bar, then the member list (pending invites stay part of
 *     the invite card, which sits directly on top of the list).
 *
 * NOTHING IS MOVED (rule 2). The game nests these cards in wrapper divs (a
 * two-column row, its left column, a stacked block). Each wrapper is tagged
 * `data-iw-guild-wrap` and set `display: contents` in guild.css, so every
 * card becomes a grid item of the Raid Dungeon panel; this module only tags
 * each card with a `data-iw-guild-slot` and guild.css places the slots.
 * Slots are the module's own namespace: `data-iw-guild-card` stays
 * GuildPanels' (one writer per attribute, CLAUDE.md).
 *
 * The ready-check pop-up is the skin's own element (`data-iw-guild-lobby-owned`),
 * shown when the game's ready-check card offers YOU its "Confirm" button and
 * never to the leader (the card's leader-only "Start now" button). Its
 * Confirm presses the game's button; Dismiss hides it until the next check.
 */

import { raidBoard, refreshRaidBoard, bossKeyOf, DIFFICULTY_KEYS, formatRaidTime } from './RaidLeaderboards.js';
// TESTING FEATURE: the lobby's test toggles (LobbyPreview.js).
import { syncLobbyPreview, clearLobbyPreview } from './LobbyPreview.js';
import { decorateBossCard, clearBossCard, refreshBossCardText } from './RaidBossCard.js';

const OWNED = 'data-iw-guild-lobby-owned';
const SLOT = 'data-iw-guild-slot';
const WRAP = 'data-iw-guild-wrap';
const LAYOUT = 'data-iw-guild-layout';
const ATTRS = [SLOT, WRAP, LAYOUT, 'data-iw-guild-record'];

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
const label = value => norm(value).replace(/^[^\p{L}\p{N}]+/u, '');

function mark(el, key, value) {
  if (!el) return;
  if (value == null) { if (el.hasAttribute(key)) el.removeAttribute(key); return; }
  if (el.getAttribute(key) !== value) el.setAttribute(key, value);
}

function own(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.setAttribute(OWNED, '1');
  if (text != null) el.textContent = text;
  return el;
}

function titleOf(card) {
  return label(card.querySelector('[data-iw-guild-role="card-title"], p')?.textContent);
}

/** The slot a lobby card takes, from GuildPanels' kind and the game's title. */
function slotOf(card) {
  const kind = card.getAttribute('data-iw-guild-card');
  const title = titleOf(card);
  if (kind === 'boss' || kind === 'leaderboard' || kind === 'members' || kind === 'lend'
    || kind === 'prep' || kind === 'chat' || kind === 'ready-check') return kind;
  if (kind === 'ready') return 'start';
  if (kind === 'form' && /^invite\b/i.test(title)) return 'invite';
  if (/^raid loadout$/i.test(title)) return 'loadout';
  if (/^my raid history$/i.test(title)) return 'history';
  if (card.querySelector('[data-iw-guild-role="start"], [data-iw-guild-role="ready-toggle"]')) return 'start';
  return 'other';
}

/* ------------------------------------------------------------- layout -- */

let lastRoot = null;

function decorateLayout(root) {
  const boss = root.querySelector('[data-iw-guild-card="boss"]');
  const left = boss?.parentElement;
  const columns = left?.parentElement;
  // Only the lobby's own shape: boss card in a column inside a row that is a
  // direct child of the panel. The fight, a guildless page or an unknown
  // build keeps the game's flow untouched.
  const lobby = !!(boss && left && columns && left !== root && columns.parentElement === root);
  mark(root, LAYOUT, lobby ? 'lobby' : null);
  if (!lobby) {
    for (const el of root.querySelectorAll(`[${WRAP}], [${SLOT}]`)) { mark(el, WRAP, null); mark(el, SLOT, null); }
    return;
  }
  const wraps = new Set([left, columns]);
  const cards = [...root.querySelectorAll('[data-iw-guild-card]')].filter(c => !c.parentElement?.closest('[data-iw-guild-card]'));
  for (const card of cards) {
    const slot = slotOf(card);
    mark(card, SLOT, slot);
    // Every wrapper between the card and the panel dissolves into the grid.
    for (let p = card.parentElement; p && p !== root; p = p.parentElement) wraps.add(p);
  }
  for (const el of root.querySelectorAll(`[${WRAP}]`)) if (!wraps.has(el)) mark(el, WRAP, null);
  for (const el of wraps) mark(el, WRAP, '1');
  // A plain child AFTER the columns (the Disband row): full width, last. One
  // before them (the head, the game's notices) keeps order 0 and leads.
  for (const child of root.children) {
    if (child.hasAttribute(OWNED) || child.hasAttribute(WRAP) || child.hasAttribute('data-iw-guild-card')) continue;
    const after = !!(columns.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING);
    mark(child, SLOT, after ? 'footer' : null);
  }
}

/* ------------------------------------------------------------ records -- */

/** The record time under each difficulty pill, from the raid leaderboard. */
function decorateRecords(root) {
  const boss = root.querySelector('[data-iw-guild-card="boss"]');
  const row = boss?.querySelector('[data-iw-guild-role="difficulties"]');
  let records = boss?.querySelector(`:scope .iw-guild-records[${OWNED}]`);
  if (!row) { records?.remove(); return; }
  const selected = boss.querySelector('[data-iw-guild-role="boss-tab"][data-iw-guild-state="selected"]');
  const key = bossKeyOf(selected?.title || boss.querySelector('[data-iw-guild-role="boss-name"]')?.textContent);
  const board = raidBoard();
  const pills = [...row.querySelectorAll('[data-iw-guild-role="difficulty"]')];
  const cells = pills.map(pill => {
    const diff = DIFFICULTY_KEYS.find(d => d.test.test(label(pill.textContent)));
    const best = diff && key && board ? board[key]?.[diff.key]?.[0] : null;
    // "🏆 1:50.00 · Royal Flush": the time, then the group that set it.
    return { text: best ? `🏆 ${formatRaidTime(best)} · ${best.guildName}` : board ? 'No clear yet' : '…',
      title: best ? `${diff.label} record: ${best.guildName} · ${formatRaidTime(best)}` : `${diff?.label || ''} record` };
  });
  const sig = JSON.stringify(cells);
  if (records && records.previousElementSibling === row && records.dataset.sig === sig) return;
  if (!records) {
    records = own('div', 'iw-guild-records');
    records.setAttribute('aria-label', 'Record times');
  }
  if (records.previousElementSibling !== row) row.after(records);
  records.dataset.sig = sig;
  records.replaceChildren(...cells.map(c => {
    const cell = own('span', 'iw-guild-record', c.text);
    cell.title = c.title;
    return cell;
  }));
}

/* -------------------------------------------------- ready-check popup -- */

const dismissed = new WeakSet();
let popup = null;
let popupCard = null;

/*
 * TESTING FEATURE (LobbyPreview.js): the "🧪 Pop-up" toggle shows the pop-up
 * on its own, fed by a demo countdown instead of a card; Confirm and Dismiss
 * only close it. A test ready-check CARD (data-iw-lobby-dummy) never opens
 * the pop-up, so the two toggles stay separate.
 */
let testPopup = null; // { started, interval, onClose }
const TEST_SECONDS = 30;

function readyCheckFor(root) {
  const card = root.querySelector('[data-iw-guild-card="ready-check"]:not([data-iw-lobby-dummy])');
  if (!card) return null;
  const buttons = [...card.querySelectorAll('button')];
  // The leader's card carries "Start now"; the leader is never warned.
  if (buttons.some(b => /^start now\b/i.test(label(b.textContent)))) return null;
  const confirm = buttons.find(b => /^confirm\b/i.test(label(b.textContent)));
  if (!confirm) return null; // already confirmed (or not in the check)
  return { card, confirm };
}

function closePopup() {
  popup?.remove();
  popup = null;
  popupCard = null;
}

function stopTestPopup() {
  if (!testPopup) return;
  clearInterval(testPopup.interval);
  const done = testPopup.onClose;
  testPopup = null;
  closePopup();
  done?.();
}

function onPopupConfirm(event) {
  event.preventDefault();
  if (testPopup) { stopTestPopup(); return; }
  const check = lastRoot && readyCheckFor(lastRoot);
  check?.confirm.click();
  if (popupCard) dismissed.add(popupCard);
  closePopup();
}

function onPopupDismiss(event) {
  event.preventDefault();
  if (testPopup) { stopTestPopup(); return; }
  if (popupCard) dismissed.add(popupCard);
  closePopup();
}

function setPopupText(title, timer) {
  if (!popup) return;
  const [titleEl, timerEl] = [popup.querySelector('.iw-rc-title'), popup.querySelector('.iw-rc-timer')];
  if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
  if (timerEl && timerEl.textContent !== timer) timerEl.textContent = timer;
}

function syncPopupText() {
  if (!popup) return;
  if (testPopup) {
    const left = Math.max(0, TEST_SECONDS - Math.floor((Date.now() - testPopup.started) / 1000));
    setPopupText('⚔️ Ready check: Ashmaw Normal (test)', left > 0 ? `${left}s` : "time's up");
    return;
  }
  if (!popupCard) return;
  setPopupText(norm(popupCard.querySelector('[data-iw-guild-role="rc-title"]')?.textContent) || 'Ready check started',
    norm(popupCard.querySelector('[data-iw-guild-role="rc-timer"]')?.textContent));
}

function openPopup() {
  closePopup();
  popup = own('div', 'iw-rc-popup');
  popup.setAttribute('role', 'alertdialog');
  popup.setAttribute('aria-live', 'assertive');
  popup.setAttribute('aria-label', 'Raid ready check');
  if (testPopup) popup.setAttribute('data-iw-lobby-dummy', '1');
  const head = own('div', 'iw-rc-head');
  head.append(own('p', 'iw-rc-title'), own('span', 'iw-rc-timer'));
  const note = own('p', 'iw-rc-note', 'Your raid is about to start. Confirm you are here, or you will be left out of this attempt.');
  const actions = own('div', 'iw-rc-actions');
  const confirm = own('button', 'iw-rc-confirm', 'Confirm — I’m here!');
  confirm.type = 'button';
  confirm.addEventListener('click', onPopupConfirm);
  const dismiss = own('button', 'iw-rc-dismiss', 'Dismiss');
  dismiss.type = 'button';
  dismiss.addEventListener('click', onPopupDismiss);
  actions.append(confirm, dismiss);
  popup.append(head, note, actions);
  document.body.append(popup);
}

/** TESTING FEATURE: show (or hide) the pop-up with a demo countdown. */
export function setLobbyTestPopup(on, onClose) {
  if (!on) { stopTestPopup(); return; }
  if (testPopup) return;
  testPopup = { started: Date.now(), interval: setInterval(syncPopupText, 1000), onClose };
  openPopup();
  syncPopupText();
}

export function lobbyTestPopupOn() {
  return !!testPopup;
}

function decoratePopup(root) {
  if (testPopup) {
    if (!popup?.isConnected) openPopup();
    syncPopupText();
    return;
  }
  const check = readyCheckFor(root);
  if (!check || dismissed.has(check.card)) {
    // Every leaf panel on /guild runs this pass (the header too), so only the
    // panel that held the card may close its pop-up; a pop-up whose card has
    // gone is closed by pruneGuildLobby. (Closing on any panel without a card
    // rebuilt the pop-up every flush, measured 2026-10-08.)
    if (popupCard && (root.contains(popupCard) || !popupCard.isConnected)) closePopup();
    return;
  }
  if (!popup || popupCard !== check.card || !popup.isConnected) {
    openPopup();
    popupCard = check.card;
  }
  syncPopupText();
}

/* ------------------------------------------------------------- public -- */

/** Every Guild pass (GuildPanels.decorateGuildPanel), after the cards. */
export function decorateGuildLobby(root) {
  if (!root) return;
  if (root.querySelector('[data-iw-guild-card="boss"], [data-iw-guild-card="ready-check"]')) lastRoot = root;
  // TESTING FEATURE: before the layout, so its test cards take their slots.
  syncLobbyPreview(root, () => decorateGuildLobby(root));
  decorateLayout(root);
  decorateBossCard(root);
  decorateRecords(root);
  decoratePopup(root);
  // The board is not in this DOM: read it, then redraw the records. A
  // network result carries no mutation, so the pass runs itself (CLAUDE.md).
  if (root.querySelector('[data-iw-guild-card="boss"]')) {
    refreshRaidBoard(() => { if (lastRoot?.isConnected) decorateRecords(lastRoot); });
  }
}

/** Text-only ticks (the ready-check and loot countdowns) never reach the full pass. */
export function refreshGuildLobbyText(parents) {
  refreshBossCardText(parents);
  if (!popup || !popupCard) return;
  for (const parent of parents) {
    if (parent && popupCard.contains(parent)) { syncPopupText(); return; }
  }
}

/** The Guild route left the page (or the skin is off): the pop-up goes too. */
export function pruneGuildLobby() {
  if (popupCard && !popupCard.isConnected) closePopup();
  if (testPopup && !lastRoot?.isConnected) stopTestPopup();
}

export function clearGuildLobby(root) {
  stopTestPopup();
  closePopup();
  if (!root) return;
  clearLobbyPreview(root); // TESTING FEATURE
  clearBossCard(root);
  root.querySelectorAll(`[${OWNED}]`).forEach(node => node.remove());
  for (const attr of ATTRS) {
    if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr));
  }
  lastRoot = null;
}
