/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * Fantasy fork of Legacy's GuildLobby.js (2026-10-15, Legacy at 58ff726).
 * Changes from Legacy:
 *   - It reads the PORT'S GuildPanels tags (`data-iw-guild="root"`,
 *     `data-iw-guild-card`, the `data-iw-guild-role` roles). The port's
 *     classifier is the 2026-10-07 one, which does not know the live "Mark
 *     Ready" label, so that card arrives as `generic`; `slotOf` recognises
 *     the button itself.
 *   - The lobby test toggles (LobbyPreview.js, a TESTING FEATURE) are left
 *     out, as they were from the native kit.
 *   - Owned nodes also carry `data-iw-fantasy-owned`; the pop-up's buttons
 *     get the port's compact plate here (Legacy's CompactButtons did it).
 *   - The boss card runs only while the port has none of its own (the driver
 *     passes `bossCard`).
 *
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
 * `data-iw-guild-wrap` and set `display: contents` in raid.css, so every
 * card becomes a grid item of the Raid Dungeon panel; this module only tags
 * each card with a `data-iw-guild-slot` and raid.css places the slots.
 * Slots are the module's own namespace: `data-iw-guild-card` stays the
 * port's GuildPanels' (one writer per attribute, CLAUDE.md).
 *
 * The ready-check pop-up is the skin's own element (`data-iw-guild-lobby-owned`),
 * shown when the game's ready-check card offers YOU its "Confirm" button and
 * never to the leader (the card's leader-only "Start now" button). Its
 * Confirm presses the game's button; Dismiss hides it until the next check.
 */

import { raidBoard, refreshRaidBoard, bossKeyOf, DIFFICULTY_KEYS, formatRaidTime } from './RaidLeaderboards.js';
import { decorateBossCard, clearBossCard, refreshBossCardText } from './RaidBossCard.js';
import { norm, label, mark, unmark, removeOwned, ownerOf, plate } from '../core/dom.js';

const OWNED = 'data-iw-guild-lobby-owned';
const SLOT = 'data-iw-guild-slot';
const WRAP = 'data-iw-guild-wrap';
const LAYOUT = 'data-iw-guild-layout';
const ATTRS = [SLOT, WRAP, LAYOUT, 'data-iw-guild-record'];

const own = ownerOf(OWNED);

// "Mark Ready" is the live label (2026-10-08 capture); the port's classifier
// predates it, so its card is not tagged `ready`.
const READY_BUTTON = /^(?:✓\s*)?(?:ready|not ready|unready|cancel ready|ready up|mark ready)$/i;

function titleOf(card) {
  return label(card.querySelector('[data-iw-guild-role="card-title"], p')?.textContent);
}

/** The slot a lobby card takes, from the port's card kind and the game's title. */
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
  if ([...card.querySelectorAll('button')].some(b => READY_BUTTON.test(label(b.textContent)))) return 'start';
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
    mark(card, SLOT, slotOf(card));
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
  // Records anywhere but under THIS boss card's pill row are stale: a reused
  // node (see RaidBossCard.decorateBossCard) carried them to another card.
  for (const old of root.querySelectorAll(`.iw-guild-records[${OWNED}]`)) if (!row || old.previousElementSibling !== row) old.remove();
  let records = row ? boss.querySelector(`:scope .iw-guild-records[${OWNED}]`) : null;
  if (!row) return;
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

function readyCheckFor(root) {
  const card = root.querySelector('[data-iw-guild-card="ready-check"]');
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

function onPopupConfirm(event) {
  event.preventDefault();
  const check = lastRoot && readyCheckFor(lastRoot);
  check?.confirm.click();
  if (popupCard) dismissed.add(popupCard);
  closePopup();
}

function onPopupDismiss(event) {
  event.preventDefault();
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
  if (!popup || !popupCard) return;
  setPopupText(norm(popupCard.querySelector('[data-iw-guild-role="rc-title"]')?.textContent) || 'Ready check started',
    norm(popupCard.querySelector('[data-iw-guild-role="rc-timer"]')?.textContent));
}

function button(cls, text, onClick) {
  const el = own('button', cls, text);
  el.type = 'button';
  el.addEventListener('click', onClick);
  return plate(el, own);
}

function openPopup() {
  closePopup();
  popup = own('div', 'iw-rc-popup');
  popup.setAttribute('role', 'alertdialog');
  popup.setAttribute('aria-live', 'assertive');
  popup.setAttribute('aria-label', 'Raid ready check');
  const head = own('div', 'iw-rc-head');
  head.append(own('p', 'iw-rc-title'), own('span', 'iw-rc-timer'));
  const note = own('p', 'iw-rc-note', 'Your raid is about to start. Confirm you are here, or you will be left out of this attempt.');
  const actions = own('div', 'iw-rc-actions');
  actions.append(button('iw-rc-confirm', 'Confirm — I’m here!', onPopupConfirm), button('iw-rc-dismiss', 'Dismiss', onPopupDismiss));
  popup.append(head, note, actions);
  document.body.append(popup);
}

function decoratePopup(root) {
  const check = readyCheckFor(root);
  if (!check || dismissed.has(check.card)) {
    // Every Guild root runs this pass, so only the root that held the card
    // may close its pop-up; a pop-up whose card has gone is closed by
    // pruneGuildLobby. (Closing on any root without a card rebuilt the pop-up
    // every flush, measured 2026-10-08.)
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

/**
 * Every pass, for each `[data-iw-guild="root"]` the port tagged. `onBoard`
 * runs a pass when the leaderboard read lands: a network result carries no
 * mutation (CLAUDE.md).
 */
export function decorateGuildLobby(root, { bossCard = true, frame = true, onBoard } = {}) {
  if (!root) return;
  if (root.querySelector('[data-iw-guild-card="boss"], [data-iw-guild-card="ready-check"]')) lastRoot = root;
  // `frame` is false off the Raids tab (tabs.js): the My Guild tab's boss
  // card is a different card, and the lobby frame never belongs on it. The
  // ready-check pop-up is an alert, not part of the frame, so it still runs.
  if (!frame) {
    clearLobbyFrame(root);
    decoratePopup(root);
    return;
  }
  decorateLayout(root);
  if (bossCard) decorateBossCard(root);
  else clearBossCard(root);
  decorateRecords(root);
  decoratePopup(root);
  if (root.querySelector('[data-iw-guild-card="boss"]')) refreshRaidBoard(onBoard);
}

/** The frame only (layout marks, records, boss card); the pop-up stays. */
function clearLobbyFrame(root) {
  clearBossCard(root);
  removeOwned(OWNED, root); // the pop-up lives on <body>, outside every root
  unmark(ATTRS, root);
}

/** Text-only ticks (the ready-check and loot countdowns) never reach the full pass. */
export function refreshGuildLobbyText(parents) {
  refreshBossCardText(parents);
  // Same reused-node case as the boss card: with no boss card left, its
  // record row is stale, and a text-only swap runs no full pass.
  if (lastRoot?.isConnected && !lastRoot.querySelector('[data-iw-guild-card="boss"]')) {
    lastRoot.querySelectorAll(`.iw-guild-records[${OWNED}]`).forEach(node => node.remove());
  }
  if (!popup || !popupCard) return;
  for (const parent of parents) {
    if (parent && popupCard.contains(parent)) { syncPopupText(); return; }
  }
}

/** The Guild route left the page: the pop-up goes too. */
export function pruneGuildLobby() {
  if (popupCard && !popupCard.isConnected) closePopup();
}

/** Remove everything this module wrote under `root` (or only the pop-up). */
export function clearGuildLobby(root) {
  closePopup();
  if (!root) return;
  clearBossCard(root);
  removeOwned(OWNED, root);
  unmark(ATTRS, root);
  if (lastRoot && (root === lastRoot || root.contains?.(lastRoot))) lastRoot = null;
}
